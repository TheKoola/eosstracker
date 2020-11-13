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
from gnuradio.eng_option import eng_option
from gnuradio.filter import firdes
import osmosdr

import signal


##################################################
# aprs_receiver class:
#    This is the process that listens on various frequencies
##################################################
class aprs_receiver(gr.top_block):
    def __init__(self, freqlist=[(144390000, 12000)], rtl=0, prefix="rtl"):
        gr.top_block.__init__(self, "APRS Receiver for Multiple Frequencies")

        ##################################################
        # Parameters
        ##################################################
        self.Frequencies = freqlist
        self.direwolf_audio_rate = 48000
        self.rtl_id = prefix + "=" + str(rtl)

        ##################################################
        # Variables
        ##################################################
        self.mtusize = 9000
        self.samp_rate = self.direwolf_audio_rate * 42
        self.transition_width = 1000
        self.lowpass_freq = 5500
        self.decimation = self.samp_rate / (self.direwolf_audio_rate)
        self.scale = 14336
        self.quadrate = self.samp_rate / self.decimation
        self.max_deviation = 3300
        self.lowpass_filter_0 = firdes.low_pass(20, self.samp_rate, self.lowpass_freq, self.transition_width, firdes.WIN_HANN, 6.76)
        self.center_freq = 145000000

        ##################################################
        # Blocks
        ##################################################
        self.osmosdr_source_0 = osmosdr.source( args="numchan=" + str(1) + " " + self.rtl_id )
        self.osmosdr_source_0.set_sample_rate(self.samp_rate)
        self.osmosdr_source_0.set_center_freq(self.center_freq, 0)
        self.osmosdr_source_0.set_freq_corr(0, 0)
        self.osmosdr_source_0.set_dc_offset_mode(2, 0)
        self.osmosdr_source_0.set_iq_balance_mode(0, 0)
        self.osmosdr_source_0.set_gain_mode(True, 0)
        self.osmosdr_source_0.set_gain(40, 0)
        self.osmosdr_source_0.set_if_gain(20, 0)
        self.osmosdr_source_0.set_bb_gain(20, 0)
        self.osmosdr_source_0.set_antenna('', 0)
        self.osmosdr_source_0.set_bandwidth(0, 0)

        for freq,port in self.Frequencies:
            #print "   channel:  [%d] %dMHz" % (port, freq)
            #print "   quadrate:  %d" % (self.quadrate)
            freq_xlating_fir_filter = filter.freq_xlating_fir_filter_ccf(self.decimation, (self.lowpass_filter_0), freq-self.center_freq, self.samp_rate)
            blocks_udp_sink = blocks.udp_sink(gr.sizeof_short*1, '127.0.0.1', port, self.mtusize, True)
            blocks_float_to_short = blocks.float_to_short(1, self.scale)
            analog_nbfm_rx = analog.nbfm_rx(
                audio_rate=self.direwolf_audio_rate,
                quad_rate=self.quadrate,
                tau=75e-6,
                max_dev=self.max_deviation,
            )

            ##################################################
            # Connections
            ##################################################
            self.connect((analog_nbfm_rx, 0), (blocks_float_to_short, 0))
            self.connect((blocks_float_to_short, 0), (blocks_udp_sink, 0))
            self.connect((freq_xlating_fir_filter, 0), (analog_nbfm_rx, 0))
            self.connect((self.osmosdr_source_0, 0), (freq_xlating_fir_filter, 0))


##################################################
# GRProcess:
#    - Then starts up an instance of the aprs_receiver class
##################################################
def GRProcess(flist=[(144390000, 12000)], rtl=0, prefix="rtl", e = None):
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



