##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, 2020, 2021 Jeff Deaton (N6BA)
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
from gnuradio.eng_option import eng_option
from gnuradio.filter import firdes
import osmosdr
import sys
import signal


##################################################
# aprs_receiver class:
#    This is the process that listens on various frequencies
##################################################
class aprs_receiver(gr.top_block):
    def __init__(self, freqlist=[[144390000, 12000, "rtl", "n/a"]], rtl=0, prefix="rtl"):
        gr.top_block.__init__(self, "APRS Receiver for Multiple Frequencies")

        # The frequency list
        self.Frequencies = freqlist

        # The RTL (or other device) prefix.  Used to tell the osmosdr source block which SDR device we want to use
        self.rtl_id = prefix + "=" + str(rtl)

        # MTU size for the size of packets we'll end up sending over UDP to direwolf
        self.mtusize = 9000

        # Low pass filter parameters
        self.transition_width = 1000
        self.lowpass_freq = 5500

        # NBFM demodulation params
        #self.max_deviation = 3300
        self.max_deviation = 5000

        # Setting this scale to ~5000 as we'll use an AGC on the audio sent to direwolf.  Doing that means that Direwolf will report audio levels ~50 for most/all packets.
        #self.scale = 14336
        self.scale = 5119

        # Center frequency
        self.center_freq = 145000000

        # This is the main source block that reads IQ data from the SDR
        self.osmosdr_source_0 = osmosdr.source( args="numchan=" + str(1) + " " + self.rtl_id)
        self.osmosdr_source_0.set_center_freq(self.center_freq, 0)
        self.osmosdr_source_0.set_freq_corr(0, 0)
        self.osmosdr_source_0.set_dc_offset_mode(2, 0)
        self.osmosdr_source_0.set_iq_balance_mode(0, 0)
        self.osmosdr_source_0.set_antenna('', 0)
        self.osmosdr_source_0.set_bandwidth(0, 0)

        # Airspy R2 / Mini can only accommodate specific sample rates and uses device specific RF gains, so we need to adjust values to accommodate
        if prefix == "airspy":

            # Setting the direwolf audio rate to be a multiple of the 2.5M, 3.0M, 6.0M, and 10.0M sample rates that the airspy devices can run.
            self.direwolf_audio_rate = 50000

            # Get the first valid sample rate for the airspy device.  This *should* be the lowest sample rate allowed by the device.
            rates = self.osmosdr_source_0.get_sample_rates()
            r = rates[0]
            self.samp_rate = int(r.start())

            # Turn off hardware AGC
            self.osmosdr_source_0.set_gain_mode(False, 0)

            # Set gains (specific to airspy devices).  These are the max values within libairspy and have been verified to produce the best SINAD results (@144.39MHz, @12dB)
            self.osmosdr_source_0.set_gain(14, 'LNA', 0)
            self.osmosdr_source_0.set_gain(12, 'MIX', 0)
            self.osmosdr_source_0.set_gain(13,  'IF',  0)

        # Not an airspy device...so we set sample rates and parameters as multiples of a 48k audio sample rate that direwolf will use
        else:

            # Setting the direwolf audio rate to be 48k (quasi standard for audio).
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

        # Decimation factor
        self.decimation = self.samp_rate / (self.direwolf_audio_rate)

        # Quadrature rate (input rate for the NBFM block)
        self.quadrate = self.samp_rate / self.decimation

        # Low pass filter taps
        self.lowpass_filter_0 = firdes.low_pass(20, self.samp_rate, self.lowpass_freq, self.transition_width, firdes.WIN_HANN, 6.76)

        # Now construct a seperate processing chain for each frequency we're listening to.
        # processing chain:
        #    osmosdr_source ---> xlating_fir_filter ---> nbfm ---> agc ---> float_to_short ---> UDP_sink
        #
        for freq,port,p,sn in self.Frequencies:
            freq_xlating_fir_filter = filter.freq_xlating_fir_filter_ccf(self.decimation, (self.lowpass_filter_0), freq-self.center_freq, self.samp_rate)
            blocks_udp_sink = blocks.udp_sink(gr.sizeof_short*1, '127.0.0.1', port, self.mtusize, True)
            blocks_float_to_short = blocks.float_to_short(1, self.scale)
            analog_nbfm_rx = analog.nbfm_rx(
                audio_rate=self.direwolf_audio_rate,
                quad_rate=self.quadrate,
                tau=75e-6,
                max_dev=self.max_deviation,
            )

            # AGC to normalize the audio levels sent to Direwolf
            analog_agc = analog.agc_ff(1e-5, 1.0, 1.0)
            analog_agc.set_max_gain(65536)

            ##################################################
            # Connections
            ##################################################
            self.connect((self.osmosdr_source_0, 0), (freq_xlating_fir_filter, 0))
            self.connect((freq_xlating_fir_filter, 0), (analog_nbfm_rx, 0))
            self.connect((analog_nbfm_rx, 0), (analog_agc, 0))
            self.connect((analog_agc, 0), (blocks_float_to_short, 0))
            self.connect((blocks_float_to_short, 0), (blocks_udp_sink, 0))

        # Query the osmosdr block to determine just what gain and sample rates it set for the airspy device
        if prefix == "airspy":
            print "Airspy LNA Gain set to:  ", self.osmosdr_source_0.get_gain("LNA")
            print "Airspy MIX Gain set to:  ", self.osmosdr_source_0.get_gain("MIX")
            print "Airspy VGA Gain set to:  ", self.osmosdr_source_0.get_gain("IF")
            print "Airspy sample rate set to:  ", str(round(float(self.samp_rate) / 1000000.0, 3)) + "M"
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



