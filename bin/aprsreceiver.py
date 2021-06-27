##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, 2020, Jeff Deaton (N6BA)
#
#    HABTracker is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    HABTracker is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
#
##################################################
from gnuradio import analog
from gnuradio import blocks
from gnuradio import eng_notation
from gnuradio import filter
from gnuradio import gr
from gnuradio import fft
import osmosdr
from gnuradio.eng_option import eng_option
from gnuradio.filter import firdes
import signal
import sys
import time
import math


##################################################
# aprs_receiver class:
#    This is the process that listens on various frequencies
##################################################
class aprs_receiver(gr.top_block):
    def __init__(self, freqlist=[[144390000, 12000, "rtl", "n/a"]], rtl=0, prefix="rtl"):
        gr.top_block.__init__(self, "APRS Receiver for Multiple Frequencies")

        self.Frequencies = freqlist

        # The RTL (or other device) prefix.  Used to tell the osmosdr source block which SDR device we want to use
        self.rtl_id = prefix + "=" + str(rtl)

        # MTU size for the size of packets we'll end up sending over UDP to direwolf
        self.mtusize = 9000

        # FM deviation.  Setting this to 5kHz because we can't "assume".  ;)
        self.max_deviation = 5000

        # Setting this scale to ~5000 as we'll use an AGC on the audio sent to direwolf.  Doing that means that Direwolf will report audio levels ~50 for most/all packets.
        self.scale = 5119

        # This is the main source block that reads IQ data from the SDR
        self.osmosdr_source_0 = osmosdr.source( args="numchan=" + str(1) + " " + self.rtl_id)
        self.osmosdr_source_0.set_freq_corr(0, 0)
        self.osmosdr_source_0.set_dc_offset_mode(2, 0)
        self.osmosdr_source_0.set_iq_balance_mode(0, 0)
        self.osmosdr_source_0.set_antenna('', 0)
        self.osmosdr_source_0.set_bandwidth(0, 0)

        # Airspy R2 / Mini can only accommodate specific sample rates and uses device specific RF gains, so we need to adjust values to accommodate
        if prefix == "airspy":
            self.direwolf_audio_rate = 50000

            # Get the first valid sample rate for the airspy device.  This *should* be the lowest sample rate allowed by the device.
            self.samp_rate = self.osmosdr_source_0.get_sample_rates()[0].start()

            # Turn off hardware AGC
            self.osmosdr_source_0.set_gain_mode(False, 0)

            # Set gains (specific to airspy devices).  These are the max values within libairspy and have been verified to produce the best SINAD results (@144.39MHz, @12dB)
            self.osmosdr_source_0.set_gain(14, 'LNA', 0)
            self.osmosdr_source_0.set_gain(12, 'MIX', 0)
            self.osmosdr_source_0.set_gain(13,  'IF',  0)

        # Not an airspy device...so we set sample rates and parameters as multiples of a 48k audio sample rate that direwolf will use
        else: 
            self.direwolf_audio_rate = 48000

            # Set the sample rate as a multiple of the direwolf audio rate
            self.samp_rate = self.direwolf_audio_rate * 42

            # Turn on hardware AGC
            self.osmosdr_source_0.set_gain_mode(True, 0)

            # Set gains, just in case
            self.osmosdr_source_0.set_gain(40, 0)
            self.osmosdr_source_0.set_if_gain(20, 0)
            self.osmosdr_source_0.set_bb_gain(20, 0)

        # set the source block's sample rate now that we know that.
        self.osmosdr_source_0.set_sample_rate(self.samp_rate)

        # Find the median frequency we're listening too
        freqs = [f[0] for f in freqlist]
        median_freq = min(freqs) + (max(freqs) - min(freqs)) / 2

        # Lambda function for finding the max distance between a given frequency (cf) and a list of frequencies (fs)
        max_d = lambda fs, cf : max([abs(a - cf) for a in fs])

        # Determine the channel width from the frequencies we're listening too
        if median_freq < 150000000:   # 2m band
            self.channel_width = 15000
        elif 220000000 < median_freq < 230000000:  # 1.25m band
            self.channel_width = 20000
        elif 410000000 < median_freq < 460000000:  # 70cm band
            self.channel_width = 25000

        # Either round up or down to the nearest 1MHz...then check which has the least distance to the various frequencies
        cf_a = int(math.floor(median_freq / 1000000) * 1000000)
        cf_b = int(math.ceil(median_freq / 1000000) * 1000000) 

        # Pick the center frequency that has the least delta between the various frequencies
        if max_d(freqs, cf_a) < max_d(freqs, cf_b):
            self.center_freq = cf_a
        else:
            self.center_freq = cf_b

        # set the source block's center frequency now that we know that.
        self.osmosdr_source_0.set_center_freq(self.center_freq, 0)

        # FM channel low pass filter parameters.  We want a lazy transition to minimize filter taps and CPU usage.  
        self.channel_transition_width = 1000
        self.channel_cutoff_freq = (self.channel_width / 2) - self.channel_transition_width

        # Make sure the cutoff frequency is not less than Carson's rule for 2200hz APRS space tones
        if self.channel_cutoff_freq < 2200 + self.max_deviation:
            self.channel_cutoff_freq = 2200 + self.max_deviation

        # FM channel low pass filter taps
        self.channel_lowpass_taps = firdes.low_pass(1, self.samp_rate, self.channel_cutoff_freq, self.channel_transition_width, firdes.WIN_HANN, 6.76)

        # Quadrature rate (input rate for the quadrature demod block)
        self.quadrate = self.direwolf_audio_rate * 2

        # audio decimation factor
        self.audio_decim = self.quadrate / self.direwolf_audio_rate

        # Decimation factor for the xlating_fir_filter block
        self.decimation = self.samp_rate / (self.audio_decim * self.direwolf_audio_rate)

        # Audio Low pass filter parameters.  We want a lazy transition to minimize filter taps and CPU usage.
        self.transition_width = 1000

        # For APRS we only care about 2200hz + harmonics...soooo setting this to something high, but not too high.  For reference, 9600baud needs ~5khz.
        self.lowpass_freq = 6000

        # Audio low pass filter taps.  
        self.audio_taps = firdes.low_pass(1, self.quadrate, self.lowpass_freq, self.transition_width, fft.window.WIN_HAMMING)  

        # Now construct a seperate processing chain for each frequency we're listening to.
        # processing chain:
        #    osmosdr_source ---> xlating_fir_filter ---> quad_demod ---> fm_deemphasis ---> audio_lowpass_filter ---> agc ---> float_to_short ---> UDP_sink
        #
        for freq,port,p,sn in self.Frequencies:
            #print "   channel:  [%d] %dMHz" % (port, freq)
            #print "   quadrate:  %d" % (self.quadrate)
            freq_xlating_fir_filter = filter.freq_xlating_fir_filter_ccf(self.decimation, (self.channel_lowpass_taps), freq-self.center_freq, self.samp_rate)
            blocks_udp_sink = blocks.udp_sink(gr.sizeof_short*1, '127.0.0.1', port, self.mtusize, True)
            blocks_float_to_short = blocks.float_to_short(1, self.scale)
            quad_demod = analog.quadrature_demod_cf(self.quadrate/(2*math.pi*self.max_deviation/8.0))
            fmdeemphasis = analog.fm_deemph(self.quadrate)
            audio_filter = filter.fir_filter_fff(self.audio_decim, self.audio_taps)
            analog_agc = analog.agc_ff(1e-5, 1.0, 1.0)
            analog_agc.set_max_gain(65536)

            ##################################################
            # Connections
            ##################################################
            self.connect((self.osmosdr_source_0, 0), (freq_xlating_fir_filter, 0))
            self.connect((freq_xlating_fir_filter, 0), (quad_demod, 0))
            self.connect((quad_demod, 0), (fmdeemphasis, 0))
            self.connect((fmdeemphasis, 0), (audio_filter, 0))
            self.connect((audio_filter, 0), (analog_agc, 0))
            self.connect((analog_agc, 0), (blocks_float_to_short, 0))
            self.connect((blocks_float_to_short, 0), (blocks_udp_sink, 0))

        print "GnuRadio parameters for:  ", self.rtl_id
        print "len(channel taps):  ", len(self.channel_lowpass_taps)
        print "len(audio taps):  ", len(self.audio_taps)
        #print "Sample rate:  ", self.samp_rate
        #print "Channel width (Hz):  ", self.channel_width
        #print "Direwolf audio rate:  ", self.direwolf_audio_rate
        #print "Quadrature rate:  ", self.quadrate
        print "Center frequency(", self.rtl_id, "):  ", self.center_freq
        #print "Xlating decimation:  ", self.decimation

        # Query the osmosdr block to determine just what gain and sample rates it set for the airspy device
        if prefix == "airspy":
            print "Airspy LNA Gain set to:  ", self.osmosdr_source_0.get_gain("LNA")
            print "Airspy MIX Gain set to:  ", self.osmosdr_source_0.get_gain("MIX")
            print "Airspy VGA Gain set to:  ", self.osmosdr_source_0.get_gain("IF")
            print "Airspy sample rate set to:  ", self.samp_rate

        sys.stdout.flush()

##################################################
# GRProcess:
#    - Then starts up an instance of the aprs_receiver class
##################################################
def GRProcess(flist=[[144390000, 12000, "rtl", "n/a"]], rtl=0, prefix="rtl", e = None):
    try:

        #print "GR [%d], listening on: " % rtl, flist

        # create an instance of the aprs receiver class
        tb = aprs_receiver(freqlist=flist, rtl=rtl, prefix=prefix)

        # call its "run" method...this blocks until done
        tb.start()
        e.wait()
        print "Stopping GnuRadio..."
        tb.stop()
        print "GnuRadio ended"

    except (KeyboardInterrupt, SystemExit):
        tb.stop()
        print "GnuRadio ended"



