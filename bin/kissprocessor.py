##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020, Jeff Deaton (N6BA)
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

import sys
import socket
from inspect import getframeinfo, stack
from queue import Queue
import threading as th
import multiprocessing as mp
import time
import select
import psutil
import os
import signal

from queue import Empty, Full
from inspect import getframeinfo, stack
from dataclasses import dataclass, field
import logging
from logging.handlers import QueueHandler, QueueListener

from packet import Packet

KISS_FESC = b'\xdb'      #0xDB   # Escape character
KISS_FEND = b'\xc0'      #0xC0   # Frame start/end marker
KISS_TFEND = b'\xdc'     #0xDC   # If after an escape, means there was an 0xC0 in the source message
KISS_TFESC = b'\xdd'     #0xDD   # If after an escape, means there was an 0xDB in the source message
int_fend = int.from_bytes(KISS_FEND, 'big')
int_fesc = int.from_bytes(KISS_FESC, 'big')
int_tfend = int.from_bytes(KISS_TFEND, 'big')
int_tfesc = int.from_bytes(KISS_TFESC, 'big')

KISS_FESC_TFESC = b''.join([KISS_FESC, KISS_TFESC])
KISS_FESC_TFEND = b''.join([KISS_FESC, KISS_TFEND])
int_fesc_tfesc = int.from_bytes(KISS_FESC_TFESC, 'big')
int_fesc_tfend = int.from_bytes(KISS_FESC_TFEND, 'big')

AX25_CONTROL_FIELD = b'\x03'    #0x03
AX25_PROTOCOL_ID = b'\xf0'      #0xF0
INFO_DELIM = b''.join([AX25_CONTROL_FIELD, AX25_PROTOCOL_ID])

##################################    
# the KISS frame processor class
#
# Really just a consolidated location for all "stuff" for encoding and decoding KISS frames
##################################    
@dataclass
class KISSProcessor:

    # The logging queue for where to send messages
    loggingqueue: mp.Queue = None

    def __post_init__(self)->None:

        # setup logging
        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.loggingqueue is not None:
            handler = QueueHandler(self.loggingqueue)
            self.logger.addHandler(handler)

        self.logger.debug(f"Created instance of KISSProcessor")


    def decode(self, incomingbytes: bytes = None)->Packet:
        """
        Decodes a kiss frame returning a tuple with the APRS text of the decoded frame along with an integer that represents the channel direwolf heard the packet on.
        """

        self.logger.debug(f"decode called with {incomingbytes=}")

        if not incomingbytes:
            return None

        # for each frame in the kiss_frames list, run the 'cleanframe' method against it.  Take those results and create a new list, of clean, normalized KISS frames.
        frame = self._cleanframe(incomingbytes)

        # Get the direwolf channel
        channel = frame[0] >> 4
        self.logger.debug(f"frame[0]: {frame[0]}, channel: {channel}")

        # Strip off the first byte, as that's the KISS data frame byte and any trailing FEND bytes
        s = frame[1:]
        s = s.strip(KISS_FEND)
        self.logger.debug(f"Parsing frame({len(frame)})[{channel}]: {frame} : {s}")

        # parse the KISS frame into APRS text
        p = self._parseFrame(s)
        self.logger.debug(f"Parsed APRS packet: {p=}")

        if p:
            p.properties["channel"] = channel

        # return parsed KISS frame
        return p
        

    def _cleanframe(self, s: bytes)->bytes:
        """ 
        This recovers any previously escaped FESC/FEND codes and removes the beginning command from the KISS frame
        """

        # Recover escaped FEND codes
        tmp = b''
        f_fesc = False
        for idx, a in enumerate(s):
            if idx == 0 and a == int_fend:
                pass
            elif f_fesc:
                if a == int_tfesc:
                    tmp += KISS_FESC
                elif a == int_tfend:
                    tmp += KISS_FEND
                else:
                    tmp += KISS_FESC
                    tmp += bytes([a])

                f_fesc = False

            elif a == int_fesc:
                f_fesc = True
            else:
                tmp += bytes([a])
                f_fesc = False

        # Now remove any newline/space chars
        tmp.strip()

        return tmp


    def _decode_addr(self, data, cursor):
        """
        extract addresses from the KISS frame...as part of building the APRS text 
        """

        if len(data) < cursor+7:
            return (None, None, None)

        addr = data[cursor:cursor+7]

        #h = (ord(addr[6]) >> 7) & 0x1
        #ssid = (ord(addr[6]) >> 1) & 0xf     
        #ext = ord(addr[6]) & 0x1

        h = (addr[6] >> 7) & 0x1
        ssid = (addr[6] >> 1) & 0xf     
        ext = addr[6] & 0x1

        self.logger.debug(f"decode: {addr}, h: {h}, ssid: {ssid}, ext: {ext}, type(addr): {type(addr)}, type(addr[0]): {type(addr[0])}")
        #converted_addr = ''.join([chr(ord(a) >> 1) for a in addr[0:6]])
        converted_addr = b''.join([bytes([a >> 1]) for a in addr[0:6]])
        address = converted_addr.decode("UTF-8", "ignore")

        self.logger.debug(f"decode. converted_addr: {converted_addr}, address: {address}")

        if ssid != 0:
            call = "{}-{}".format(address.strip(), ssid)
        else:
            call = address.strip()

        return (call, h, ext)


    def _decode_uframe(self, ctrl, data, pos)->str:
        if ctrl == 0x3:
            pos += 1
            info = data[pos:]
            infopart = info.rstrip(b'\xff\x0d\x20\x0a').decode("UTF-8", "ignore")
            return infopart
        else:
            return None
             
    def _parseFrame(self, frame)->Packet:
        pos = 0

        # Length of the frame
        length = len(frame)

        # If it's not at least 14 chars then eject...
        if length < 14:
            print("Frame not long enough [", length, "]: ", frame)
            return None

        # dictionary to store various properties of this packet
        properties = {}

        # destination address
        (dest_addr, dest_hrr, dest_ext) = self._decode_addr(frame, pos)

        self.logger.debug(f"_parseFrame destination: {dest_addr}:{type(dest_addr)}, {dest_hrr}:{type(dest_hrr)}, {dest_ext}:{type(dest_ext)}")

        if dest_addr is None:
            self.logger.debug("_parseFrame: Destination address is invalid")
            return None
        pos += 7
        
        # source address
        (src_addr, src_hrr, src_ext) = self._decode_addr(frame, pos)  

        self.logger.debug("_parseFrame source: {src_addr}, {src_hrr}, {src_ext}")

        if src_addr is None:
            self.logger.debug("_parseFrame: Source address is invalid")
            return None
        pos += 7
        
        # Repeater list
        ext = src_ext
        repeater_list = ""
        repeaters = []
        while ext == 0:
            rpt_addr, rpt_h, ext = self._decode_addr(frame, pos)
            if rpt_addr is None:
                break

            repeater_list += "," + rpt_addr 
            repeaters.append(rpt_addr)
            pos += 7

        # make sure this packet wasn't truncated...
        if pos >= length:
            return None

        # begin to populat the properties dictionary
        properties["destination"] = dest_addr
        properties["source"] = src_addr
        properties["digipeaters"] = repeaters

        # control code
        #ctrl = ord(frame[pos])
        ctrl = frame[pos]
        pos += 1
      
        # if this is a U frame
        info = ""
        if (ctrl & 0x3) == 0x3:
            info = self._decode_uframe(ctrl, frame, pos)
            if info == None:
                info = ""
        else:
            return None

        self.logger.debug(f"src_addr({type(src_addr)}): {src_addr}, dest_addr({type(dest_addr)}): {dest_addr}, repeater_list({type(repeater_list)}): {repeater_list}")

        # the information part of the packet
        properties["information"] = info

        try:
            # Assemble the APRS text string for the packet
            aprstext = src_addr + ">" + dest_addr + repeater_list + ":" + info

            # the time we've decoded this packet
            properties["decode_time"] = int(time.time())

            # yes, it's an APRS packet
            properties["is_aprs"] = True

            # create a new Packet object and return it
            p = Packet(text = aprstext, frequency=None, source="kiss", properties = properties)
            return p

        except TypeError as e: 

            # if there were issues decoding the packet, just log some errors and return nothing
            self.logger.warning(f"_parseFrame:  Type Error occured: {e}")
            self.logger.debug(f"src_addr({type(src_addr)}): {src_addr}, dest_addr({type(dest_addr)}): {dest_addr}, repeater_list({type(repeater_list)}): {repeater_list}")

            return None


    def _encode_address(self, s: str, final: bool)->bytes:
        """
        This encodes an address (i.e. a callsign or directive like WIDE2-1).  The final argument denotes if this address is the last one in the APRS packet.
        """
        if "-" not in s:
            s = s + "-0"    # default to SSID 0
        call, ssid = s.split('-')
        if len(call) < 6:
            call = call + " "*(6 - len(call)) # pad with spaces
        encoded_call = [ord(x) << 1 for x in call[0:6]]
        encoded_ssid = (int(ssid) << 1) | 0b01100000 | (0b00000001 if final else 0)
        return encoded_call + [encoded_ssid]


    # Create the full KISS encapculated ax.25 packet with the direwolf 'channel' specified.
    def encode(self, info: str, channel: int, via: str)->bytes:
        """
        This private function will encode a string into a valid AX.25 frame and properly ecapsulated into KISS.  
        Ready for transmission by direwolf.
        """

        # Make a UI frame by concatenating the parts together
        # This is just an array of ints representing bytes at this point
        dest_addr = self._encode_address('APZES1', False)
        src_addr = self._encode_address(self.callsign, False)

        # AX25 control field
        c_byte = [AX25_CONTROL_FIELD]           # This is a UI frame

        # AX25 protocol id
        pid = [AX25_PROTOCOL_ID]              # No protocol

        # Convert the information part to bytes
        msg = [ord(c) for c in info]
        self.logger.debug(f"msg({type(msg)}): {msg}, info: {info}")
        packet = dest_addr + src_addr 
        self.logger.debug("packet({type(packet)}): {packet}, dest_addr: {dest_addr}, src_addr: {src_addr}")

        dlen = len(via)
        i = 0
        self.logger.debug(f"via path length: {dlen}, viapath: {via}")
        for d in via:
            if i < dlen-1:
                self.logger.debug(f"encoding destination element: {d}")
                packet += self._encode_address(d, False)
            else:
                self.logger.debug(f"encoding last destination element: {d}")
                packet += self._encode_address(d, True)
            i += 1

        #packet += bytearray(c_byte + pid) + msg
        packet += c_byte + pid + msg
        chan_cmd = channel << 4
        if chan_cmd == int_fend:
            chan_cmd = [KISS_FESC, KISS_TFEND]
        else:
            chan_cmd = [chan_cmd.to_bytes(1, 'big')]

        self.logger.debug(f"Channel command({type(chan_cmd)}): {chan_cmd}")

        # Escape the packet in case either KISS_FEND or KISS_FESC ended up in our stream
        packet_escaped = []
        for element in packet:
            if type(element) is int:
                x = element.to_bytes(1, 'big')
            elif type(element) is bytes:
                x = element
            else:
                x = element

            if x == int_fesc:
                packet_escaped += [KISS_FESC, KISS_TFEND]
            elif x == int_fesc:
                packet_escaped += [KISS_FESC, KISS_TFESC]
            else:
                packet_escaped += [x]

        # Build the frame that we will send to Dire Wolf and turn it into a string
        kiss_frame = b''.join([KISS_FEND] + chan_cmd + packet_escaped + [KISS_FEND])
        self.logger.debug(f"kiss_frame to be transmitted({type(kiss_frame)}): [{kiss_frame}]")

        output = bytearray(kiss_frame)

        self.logger.debug(f"output to be transmitted({type(output)}): [{output}]")


        return kiss_frame


