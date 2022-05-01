#!/usr/bin/python
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
# gcd
#    find greatest common divsor
##################################################
def gcd(a, b):
    if a == 0:
        return b
    elif b == 0:
        return a
    
    if a < b:
        return gcd(a, b % a)
    else:
        return gcd(b, a % b)


##################################################
# decimalToFraction
#    return the fraction that represents the decimal number
##################################################
def decimalToFraction(number):

    # integer value 
    intval = math.floor(number)

    # fractional value
    fval = number - intval

    # precision
    p = 1000000

    # calculate the gcd value
    gcdvalue = gcd(round(fval * p), p)

    # the numerator
    num = int(round(fval * p) / gcdvalue)

    # the denominator
    den = int(p / gcdvalue)

    return (num, den)


##################################################
# getResamplerFactors
#    For a given sample and audio rates then return the numerator and denominator of a fraction for reducing the sample rate
#    to a number close to the spread as a multiple of the audio rate
##################################################
def getResamplerFactors(sample_rate, spread, audio_rate):

    multiple = int(math.ceil(float(spread) / audio_rate))
    if multiple % 2:
        multiple = multiple + 1

    decimal = (audio_rate * multiple) / float(sample_rate)
    n, d = decimalToFraction(decimal)
    return (n, d, multiple)


##################################################
# getRTLSampleRate
#    This inputs a given sample rate and the direwolf audio rate and outputs a new rate that is a multiple of the direwolf audio rate
##################################################

def getRTLSampleRate(samplerate, audiorate):

    # get the multiple vs. the direwolf audio rate
    n = int(math.ceil(float(samplerate) / float(audiorate)))

    # make sure we're using an even multiple of the direwolf audio rate (for nice decimations later on)
    if n % 2:
        n = n + 1

    return int(audiorate * n)


##################################################
# aprs_receiver class:
#    This is the process that listens on various frequencies
##################################################
class aprs_receiver(gr.top_block):
    def __init__(self, freqlist=[[144390000, 12000, "rtl", "n/a"]], rtl=0, prefix="rtl", ip = '127.0.0.1', samplerate = 48000):
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
        cf_a = int(math.floor(float(median_freq) / 1000000.0) * 1000000)
        cf_b = int(math.ceil(float(median_freq) / 1000000.0) * 1000000) 

        # Pick the center frequency that has the least delta between the various frequencies
        if max_d(freqs, cf_a) < max_d(freqs, cf_b):
            self.center_freq = cf_a
        else:
            self.center_freq = cf_b

        # set the source block's center frequency now that we know that.
        self.osmosdr_source_0.set_center_freq(self.center_freq, 0)

        # The direwolf audio rate. 
        self.direwolf_audio_rate = samplerate

        # For the determined center frequency (above) we find the maximum distance between it and the freqs we're listening too.   Multiply that "spread" by two, 
        # then round up to the nearest multiple of the direwolf audio rate (i.e. 48k, 44.1k, etc.).  The idea being we want a sample rate that is 2 x the max spread between 
        # the center frequency and all those we're listening too.   We choose 2x because of nyquist.
        spread = int(math.ceil(max_d(freqs, self.center_freq) * 2.0 / self.direwolf_audio_rate) * self.direwolf_audio_rate)

        # resampler for the airspy to get the direwolf sample rate down to 44k
        self.rational_resampler = None

        # downstream sample rate for blocks south of the Osmocom source or the rational resampler in the case of an airspy dongle
        self.downstream_samp_rate = None

        # Airspy R2 / Mini can only accommodate specific sample rates and uses device specific RF gains, so we need to adjust values to accommodate
        airspy_rates_string = ""
        if prefix == "airspy":

            # Get the list of supported sample rates from the Airspy device
            rates = self.osmosdr_source_0.get_sample_rates()

            # Report sample rates supported by the Airspy device
            airspy_rates_string = "Airspy supported sample rates: "
            for r in rates:
                airspy_rates_string += "  " + str(int(r.start()))

            # Get the first valid sample rate for the airspy device.  This *should* be the lowest sample rate allowed by the device.
            self.samp_rate = int(rates[0].start())

            # Turn off hardware AGC
            self.osmosdr_source_0.set_gain_mode(False, 0)

            # Set gains (specific to airspy devices).  These are the max values within libairspy and have been verified to produce the best SINAD results (@144.39MHz, @12dB)
            self.osmosdr_source_0.set_gain(14, 'LNA', 0)
            self.osmosdr_source_0.set_gain(12, 'MIX', 0)
            self.osmosdr_source_0.set_gain(13,  'IF',  0)

            # We need to determine a sample rate that is a multiple of the direwolf audio rate (ex. 44k), then from that, we can determine 
            numerator, denominator, n = getResamplerFactors(self.samp_rate, spread, self.direwolf_audio_rate)

            # The downstream sample rate (i.e. used by blocks south of the rational resampler)
            self.downstream_samp_rate = self.direwolf_audio_rate * n

            # resampler to get the sample rate down to something that will fit nicely with a 44k audio rate to direwolf
            self.rational_resampler = filter.rational_resampler_ccc(
                interpolation=numerator,
                decimation=denominator,
                taps=None,
                fractional_bw=None,
            )

        # Not an airspy device...so we set sample rates and parameters as multiples of the 44k audio sample rate that direwolf will use
        else: 

            # Now check if our calculated sample rate falls within the allowed sample rates for the RTL-SDR device.
            # For reference, valid sample rates for RTL-SDR dongles:
            # 225001 to 300000 and 900001 to 3200000
            if spread < 225001:
                self.samp_rate = getRTLSampleRate(225001, self.direwolf_audio_rate)

            elif spread > 2200000:
                self.samp_rate = getRTLSampleRate(22000000, self.direwolf_audio_rate)

            elif 300000 < spread < 900001:
                self.samp_rate = getRTLSampleRate(900001, self.direwolf_audio_rate)
                
            else:
                self.samp_rate = getRTLSampleRate(spread, self.direwolf_audio_rate)


            # the "samp_rate" variable is used to set the sample rate for the source block, however, all downstream blocks will use the "downtream_samp_rate"
            # For RTLSDR dongles, these are the same (because the valid sample rates for the RTL device can be largely user defined).
            self.downstream_samp_rate = self.samp_rate

            # Turn on hardware AGC
            self.osmosdr_source_0.set_gain_mode(True, 0)

            # Set gains, just in case
            self.osmosdr_source_0.set_gain(40, 0)
            self.osmosdr_source_0.set_if_gain(20, 0)
            self.osmosdr_source_0.set_bb_gain(20, 0)

        # set the source block's sample rate now that we know that.
        self.osmosdr_source_0.set_sample_rate(self.samp_rate)

        # FM channel low pass filter parameters.  We want a lazy transition to minimize filter taps and CPU usage.  
        self.channel_transition_width = 1000
        self.channel_cutoff_freq = (self.channel_width / 2) - self.channel_transition_width

        # Make sure the cutoff frequency is not less than Carson's rule for 2200hz APRS space tones
        if self.channel_cutoff_freq < 2200 + self.max_deviation:
            self.channel_cutoff_freq = 2200 + self.max_deviation

        # FM channel low pass filter taps
        self.channel_lowpass_taps = firdes.low_pass(1, self.downstream_samp_rate, self.channel_cutoff_freq, self.channel_transition_width, firdes.WIN_HANN, 6.76)

        # Quadrature rate (input rate for the quadrature demod block)
        self.quadrate = self.direwolf_audio_rate * 2

        # audio decimation factor
        self.audio_decim = self.quadrate / self.direwolf_audio_rate

        # Decimation factor for the xlating_fir_filter block
        self.decimation = self.downstream_samp_rate / (self.audio_decim * self.direwolf_audio_rate)

        # Audio Low pass filter parameters.  We want a lazy transition to minimize filter taps and CPU usage.
        self.transition_width = 1000

        # For APRS we only care about 2200hz + harmonics...soooo setting this to something high, but not too high.  For reference, 9600baud needs ~5khz.
        self.lowpass_freq = 6000

        # Audio low pass filter taps.  
        self.audio_taps = firdes.low_pass(1, self.quadrate, self.lowpass_freq, self.transition_width, fft.window.WIN_HAMMING)  

        # If we're using an airspy device, then we need to resample the sample rate to a value that is a nice multiple of the direwolf audio rate (ex. 44k)
        if prefix == "airspy" and self.rational_resampler:
            self.connect((self.osmosdr_source_0, 0), (self.rational_resampler, 0))

        # Now construct a seperate processing chain for each frequency we're listening to.
        # processing chain:
        #    osmosdr_source ---> xlating_fir_filter ---> quad_demod ---> fm_deemphasis ---> audio_lowpass_filter ---> agc ---> float_to_short ---> UDP_sink
        #
        for freq,port,p,sn in self.Frequencies:
            #print "   channel:  [%d] %dMHz" % (port, freq)
            #print "   quadrate:  %d" % (self.quadrate)
            freq_xlating_fir_filter = filter.freq_xlating_fir_filter_ccf(self.decimation, (self.channel_lowpass_taps), freq-self.center_freq, self.downstream_samp_rate)
            blocks_udp_sink = blocks.udp_sink(gr.sizeof_short*1, ip, port, self.mtusize, True)
            blocks_float_to_short = blocks.float_to_short(1, self.scale)
            quad_demod = analog.quadrature_demod_cf(self.quadrate/(2*math.pi*self.max_deviation/8.0))
            fmdeemphasis = analog.fm_deemph(self.quadrate)
            audio_filter = filter.fir_filter_fff(self.audio_decim, self.audio_taps)
            analog_agc = analog.agc_ff(1e-5, 1.0, 1.0)
            analog_agc.set_max_gain(65536)

            ##################################################
            # Connections
            ##################################################
            if prefix == "airspy" and self.rational_resampler:
                self.connect((self.rational_resampler, 0), (freq_xlating_fir_filter, 0))
            else:
                self.connect((self.osmosdr_source_0, 0), (freq_xlating_fir_filter, 0))
            self.connect((freq_xlating_fir_filter, 0), (quad_demod, 0))
            self.connect((quad_demod, 0), (fmdeemphasis, 0))
            self.connect((fmdeemphasis, 0), (audio_filter, 0))
            self.connect((audio_filter, 0), (analog_agc, 0))
            self.connect((analog_agc, 0), (blocks_float_to_short, 0))
            self.connect((blocks_float_to_short, 0), (blocks_udp_sink, 0))

        print "==== GnuRadio parameters ===="
        instance_string = "    " + str(self.rtl_id) + ":  "
        if prefix == "airspy": 
            print "    Processing chain:"
            print "        osmosdr_source (" + self.rtl_id + ") --> rational_resampler --> xlating_fir_filter (channel taps) --> quad_demod --> fm_deemphasis -->"
            print "        audio_lowpass_filter (audio taps) --> agc --> float_to_short --> UDP_sink"
        else:
            print "    Processing chain:"
            print "        osmosdr_source (" + self.rtl_id + ") --> xlating_fir_filter (channel taps) --> quad_demod --> fm_deemphasis -->"
            print "        audio_lowpass_filter (audio taps) --> agc --> float_to_short --> UDP_sink"
        print instance_string, "len(channel taps):   ", len(self.channel_lowpass_taps)
        print instance_string, "len(audio taps):     ", len(self.audio_taps)
        print instance_string, "Source sample rate:  ", self.samp_rate
        print instance_string, "Downstrm samp rate:  ", self.downstream_samp_rate
        print instance_string, "Channel width (Hz):  ", self.channel_width
        print instance_string, "Dwolf audio rate:    ", self.direwolf_audio_rate
        print instance_string, "Quadrature rate:     ", self.quadrate
        print instance_string, "Frequency spread:    ", spread
        print instance_string, "Center frequency:    ", self.center_freq
        print instance_string, "Xlating decimation:  ", self.decimation

        if prefix == "airspy":
            print instance_string, "Airspy LNA Gain:     ", self.osmosdr_source_0.get_gain("LNA")
            print instance_string, "Airspy MIX Gain:     ", self.osmosdr_source_0.get_gain("MIX")
            print instance_string, "Airspy VGA Gain:     ", self.osmosdr_source_0.get_gain("IF")
            print instance_string, airspy_rates_string
            print instance_string, "Airspy source sample rate set to:  ", self.samp_rate
        else:
            print instance_string, "Gain mode:           ", "automatic"

        print "============================="

        sys.stdout.flush()

##################################################
# GRProcess:
#    - Then starts up an instance of the aprs_receiver class
##################################################
def GRProcess(flist=[[144390000, 12000, "rtl", "n/a"]], rtl=0, prefix="rtl", ip_dest = '127.0.0.1', rate = 48000, e = None):
    try:

        #print "GR [%d], listening on: " % rtl, flist

        # create an instance of the aprs receiver class
        tb = aprs_receiver(freqlist=flist, rtl=rtl, prefix=prefix, ip=ip_dest, samplerate=rate)

        # call its "run" method...this blocks until done
        tb.start()
        e.wait()
        print "Stopping GnuRadio..."
        tb.stop()
        print "GnuRadio ended"

    except (KeyboardInterrupt, SystemExit):
        tb.stop()
        print "GnuRadio ended"


