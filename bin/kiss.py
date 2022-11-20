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

KISS_FEND = 0xC0    # Frame start/end marker
KISS_FESC = 0xDB    # Escape character
KISS_TFEND = 0xDC   # If after an escape, means there was an 0xC0 in the source message
KISS_TFESC = 0xDD   # If after an escape, means there was an 0xDB in the source message
KISS_FESC_TFESC = b''.join([bytes(KISS_FESC), bytes(KISS_TFESC)])
KISS_FESC_TFEND = b''.join([bytes(KISS_FESC), bytes(KISS_TFEND)])
AX25_CONTROL_FIELD = 0x03
AX25_PROTOCOL_ID = 0xF0
INFO_DELIM = AX25_CONTROL_FIELD + AX25_PROTOCOL_ID

#####################################
## Set this to "True" to have debugging text output when running
debug = False 
#####################################

def debugmsg(message):
    """
    Function for printing out debug info
    """
    if debug:
        caller = getframeinfo(stack()[1][0])
        print("%s:%d - %s" % (caller.filename.split("/")[-1], caller.lineno, message))
        sys.stdout.flush()


class ConnectionFailed(Exception):
    pass


class KISS(object):

    def __init__(self, host="127.0.0.1", port=8001, stopevent = mp.Event() ):
        """
        The constructor
        """

        # The hostname / IP address of the direwolf instance we should connect to
        self.direwolf = host

        # The port number for the direwolf connection
        self.portnum = port

        # Are we connected to direwolf's KISS port?
        self.connected = False

        # Socket object is set to None initially
        self.sock = None

        # If an event was passed
        self.stopevent = stopevent

        debugmsg("KISS Constructor")
        debugmsg("    direwolf hostname: %s" % self.direwolf)
        debugmsg("    direwolf port: %d" % self.portnum)


    def connect(self):
        """
        Connect to direwolf's KISS port
        """

        if self.connected:
            self.close()

        try:
            while not self.connected and not self.stopevent.is_set():
                try:
                    # Connect to the direwolf hostname/port
                    debugmsg("Connecting to direwolf on %s:%d" % (self.direwolf, self.portnum))

                    # Socket
                    self.sock = socket.create_connection((self.direwolf, self.portnum))

                    # Set the socket to non-blocking mode
                    self.sock.setblocking(False)

                    # if successful, set status to true
                    self.connected = True

                except socket.error as e:
                    debugmsg("Caught socket error when calling socket.connect: %s" % str(e))
                    debugmsg("Sleeping for 5secs before retrying to connect")
                    self.connected = False
                    self.stopevent.wait(5)

        except (KeyboardInterrupt, SystemExit):
            debugmsg("Ending kiss.connect() function, caught GracefulExit/KeyboardInterrupt/SystemExit event")
            self.close()


    def close(self):
        """
        Shutdown the socket connection to direwolf's KISS port
        """

        try:
            if self.sock:
                debugmsg("Closing socket for connection: %s:%d" % (self.direwolf, self.portnum))
                self.sock.close()

            self.connected = False
        except (KeyboardInterrupt, SystemExit):
            pass
        except socket.error as exp:
            debugmsg("Caught socket error: %s" % str(exp))
            self.connected = False


    def __del__(self):
        """
        The destructor
        """

        debugmsg("__del__: calling close()")
        self.close()


    def read(self, callback):

        buf = bytes()
        kiss_frames = []

        if not self.connected or self.sock is None:
            self.connect()

        try:

            # How many times have we tried to reconnect to direwolf consecutively
            reconnect_count = 0
            socketnotready_count = 0

            while not self.stopevent.is_set():
                try:
                    self.sock.settimeout(10.0)
                    self.sock.setblocking(False)

                    # Check socket readiness
                    ready = select.select([self.sock], [], [], 10.0)


                    if ready[0]:
                        socketnotready_count = 0
                        reconnect_count = 0

                        debugmsg("Reading from socket")
                        raw = self.sock.recv(256)
                        
                        # If the socket returned some data, then process it...
                        if raw:

                            # split out the pieces of the data returned
                            fend_pieces = raw.split(chr(KISS_FEND))
                            num_fends = len(fend_pieces)

                            debugmsg("raw: {}, fend_pieces({}): {}".format(type(raw), num_fends, fend_pieces))

                            # zero FENDs found, keep appending data to the buffer  
                            if num_fends == 1:
                                buf += fend_pieces[0]

                            # one FEND found, there is a complete kiss frame available
                            elif num_fends == 2:

                                # Found closing fend for the currently building kiss frame, so append the first piece and append it to the buffer
                                # accummulated thus far.  Then add that buffer to the list of frames that we've found in this loop.
                                # Check if the FEND code was at the beginning of the array.  If fend_pieces[0] is null/false, then the delimiter (i.e. FEND) was the first
                                # character in the array.
                                if fend_pieces[0]:
                                    # add this frame to our list of accummulated frames
                                    kiss_frames.append(b''.join([buf, fend_pieces[0]]))


                                # FEND code was the first char...
                                else: 
                                    # add this frame to our list of accummulated frames
                                    kiss_frames.append(buf)

                                # reset the buffer
                                buf = fend_pieces[1]

                            # two or more FEND codes were found
                            elif num_fends>= 3:

                                # run through each fend_piece extracting the frames
                                for i in range(0, num_fends - 1):
                                    frame = b''.join([buf, fend_pieces[i]])
                                    if frame:
                                        kiss_frames.append(frame)
                                        buf = bytes()

                                # Check the last piece
                                if fend_pieces[num_fends - 1]:
                                    buf = fend_pieces[num_fends - 1]

                            frames = list(map(self.cleanframe, kiss_frames))

                            # Check for bad / malformed frames here and remove them from the list
                            # ..
                            # ..
                            # ..

                            for f in frames:
                                try:
                                    channel = ord(f[0]) >> 4

                                    # Strip off the first byte, as that's the KISS data frame byte
                                    s = f[1:]
                                    s = s.strip(chr(KISS_FEND))

                                    packet = self.parseFrame(s)

                                    debugmsg("calling function for: [{}] {}\n".format(channel, s))
                                    callback(packet, channel)

                                except Exception as e:
                                    # we skip any frames that have some sort of issue...
                                    pass

                            kiss_frames = []
                        else:
                            debugmsg ("Connection failed")
                            raise ConnectionFailed
                    else:
                        socketnotready_count += 1
                        debugmsg("Socket was not ready");
                        if socketnotready_count > 4:
                            debugmsg("Failing connection and reconnecting.")
                            #print "No packets seen from direwolf, attempting to reconnect."
                            sys.stdout.flush()

                            # Reset the not ready count
                            socketnotready_count = 0

                            raise ConnectionFailed


                except (socket.error, ConnectionFailed) as e:
                    debugmsg("Error: {}".format(e))

                    # Increment the consecutive reconnect counter
                    reconnect_count += 1

                    # if the consecutive reconnect counter is too high, then we try to kill the direwolf process (it should restart itself)
                    #if reconnect_count > 2:
                    #    debugmsg("Reconnect counter too high, calling terminate direwolf function")
                    #    self.terminateDirewolf()

                    self.close()
                    self.connect()

        except (KeyboardInterrupt, SystemExit) as err:
            debugmsg("Ending kiss.read() function.  Caught system exit: {}".format(err))
            self.close()
            return False

        return True
        

    def cleanframe(self, s):
        """ 
        This recovers any previously escaped FESC/FEND codes and removes the beginning command from the KISS frame
        """

        # Recover escaped FEND codes
        tmp = s.replace(KISS_FESC_TFESC, chr(KISS_FESC)).replace(KISS_FESC_TFEND, chr(KISS_FEND))

        # Now remove the first DF frame code from the beginning and any newline/space chars
        tmp.strip()

        return tmp


    def decode_addr(self, data, cursor):

        if len(data) < cursor+7:
            return (None, None, None)

        addr = data[cursor:cursor+7]

        h = (ord(addr[6]) >> 7) & 0x1
        ssid = (ord(addr[6]) >> 1) & 0xf     
        ext = ord(addr[6]) & 0x1

        converted_addr = ''.join([chr(ord(a) >> 1) for a in addr[0:6]])
        address = converted_addr.decode("UTF-8", "ignore")

        if ssid != 0:
            call = "{}-{}".format(address.strip(), ssid)
        else:
            call = address.strip()

        return (call, h, ext)

    def decode_uframe(self, ctrl, data, pos):
        if ctrl == 0x3:
            pos += 1
            info = data[pos:]
            infopart = info.rstrip('\xff\x0d\x20\x0a').decode("UTF-8", "ignore")
            return infopart
        else:
            return None
             
    def parseFrame(self, frame):
        pos = 0
        
        # Length of the frame
        length = len(frame)

        # If it's not at least 14 chars then eject...
        if length < 14:
            print("Frame not long enough [", length, "]: ", frame)
            return None

        # destination address
        (dest_addr, dest_hrr, dest_ext) = self.decode_addr(frame, pos)

        if dest_addr is None:
            debugmsg("Destination address is invalid")
            return None
        pos += 7
        
        # source address
        (src_addr, src_hrr, src_ext) = self.decode_addr(frame, pos)  

        if src_addr is None:
            debugmsg("Source address is invalid")
            return None
        pos += 7
        
        # Repeater list
        ext = src_ext
        repeater_list = ""
        while ext == 0:
            rpt_addr, rpt_h, ext = self.decode_addr(frame, pos)
            if rpt_addr is None:
                break

            repeater_list += "," + rpt_addr 
            pos += 7



        # make sure this packet wasn't truncated...
        if pos >= length:
            return None

        # control code
        ctrl = ord(frame[pos])
        pos += 1
      
        # if this is a U frame
        info = ""
        if (ctrl & 0x3) == 0x3:
            info = self.decode_uframe(ctrl, frame, pos)
            if info == None:
                info = ""
        else:
            return None

        debugmsg("src_addr({}): {}, dest_addr({}): {}, repeater_list({}): {}\n".format(type(src_addr), src_addr, type(dest_addr), dest_addr, type(repeater_list), repeater_list))

        try:
            packet = src_addr + ">" + dest_addr + repeater_list + ":" + info
            return packet
        except TypeError as e: 
            print("Type Error occured: ", e)
            print("src_addr({}): {}, dest_addr({}): {}, repeater_list({}): {}\n".format(type(src_addr), src_addr, type(dest_addr), dest_addr, type(repeater_list), repeater_list))

            return None


    def terminateDirewolf(self):
        """
        Used to find and terminate the direwolf process (if it's running)
        """

        pid = -1
        for proc in psutil.process_iter():
           # Get process detail as dictionary
           try:
               pInfoDict = proc.as_dict(attrs=['pid', 'ppid', 'name', 'exe', 'memory_percent', 'cmdline' ])
           except (psutil.NoSuchProcess, psutil.AccessDenied):
               pass
           else:
               if "direwolf" in pInfoDict["name"].lower() or "direwolf" in pInfoDict["cmdline"]:
                   pid = pInfoDict["pid"]
        if pid > 0:
            debugmsg ("Sending direwolf process, {}, the SIGTERM signal.".format(pid))
            print("Stopping direwolf process: ", pid, ", and attempting to restart.")
            sys.stdout.flush()

            # kill this pid
            os.kill(pid, signal.SIGTERM)


class txKISS(KISS):

    def __init__(self, callsign, channel=0, host="127.0.0.1", port=8001, via=["WIDE1-1", "WIDE2-1"], stopevent = mp.Event() ):
        super(txKISS, self).__init__(host=host, port=port, stopevent=stopevent ) 
        """
        The constructor
        """

        # the callsign (i.e. the source address)
        self.callsign = callsign.upper()

        # The direwolf channel number (see the direwolf.conf file)
        self.channel = channel

        # The via path for the packets to be sent to the KISS IP-based TNC
        # if the via parameter is a string, then split it into a list
        debugmsg("Type of 'via' parameter: %s" % type(via))
        if type(via) is str:
            debugmsg("Splitting 'via' path into list.  via: %s" % via)
            self.via = via.split(",")
        elif type(via) is list:
            debugmsg("Parameter 'via' was a list, good.  via: %s" % " ".join(via))
            self.via = via
        else:
            self.via = ["WIDE1-1", "WIDE2-1"]
            debugmsg("Using default value for via: %s" % " ".join(self.via))

        # The queue for transmitting packets
        self.q = Queue(maxsize = 0)

        # Create the worker thread
        debugmsg("Constructor:  Creating worker subprocess")
        self.worker = th.Thread(target=self._workerThread, args=(self.q, stopevent))
        self.worker.daemon = True
        self.worker.name = "Worker process"

        # Start the worker thread
        debugmsg("Constructor:  Starting worker thread")
        self.worker.start()


    def _encode_address(self, s, final):
        """
        This encodes an address (i.e. a callsign or directive like WIDE2-1)
        """
        if "-" not in s:
            s = s + "-0"    # default to SSID 0
        call, ssid = s.split('-')
        if len(call) < 6:
            call = call + " "*(6 - len(call)) # pad with spaces
        encoded_call = [ord(x) << 1 for x in call[0:6]]
        encoded_ssid = (int(ssid) << 1) | 0b01100000 | (0b00000001 if final else 0)
        return encoded_call + [encoded_ssid]


    # Create the full ax.25 packet
    def _encode_msg(self, info):
        """
        This private function will encode a string into a valid AX.25 frame and properly ecapsulated into KISS.  
        Ready for transmission by direwolf.
        """

        # Make a UI frame by concatenating the parts together
        # This is just an array of ints representing bytes at this point
        dest_addr = self._encode_address('APDW16', False)
        src_addr = self._encode_address(self.callsign, False)

        # AX25 control field
        c_byte = [AX25_CONTROL_FIELD]           # This is a UI frame

        # AX25 protocol id
        pid = [AX25_PROTOCOL_ID]              # No protocol

        # Convert the information part to bytes
        msg = [ord(c) for c in info]
        packet = dest_addr + src_addr 

        dlen = len(self.via)
        i = 0
        debugmsg("via path length: %d, viapath: %s" % (dlen,  " ".join(self.via)))
        for d in self.via:
            if i < dlen-1:
                debugmsg("encoding destination element: %s" % d) 
                packet += self._encode_address(d, False)
            else:
                debugmsg("encoding last destination element: %s" % d) 
                packet += self._encode_address(d, True)
            i += 1

        #packet += bytearray(c_byte + pid) + msg
        packet += c_byte + pid + msg
        chan_cmd = self.channel << 4
        if chan_cmd == KISS_FEND:
            chan_cmd = [KISS_FESC, KISS_TFEND]
        else:
            chan_cmd = [chan_cmd]

        debugmsg("Channel command: {}".format(chan_cmd))

        # Escape the packet in case either KISS_FEND or KISS_FESC ended up in our stream
        packet_escaped = []
        for x in packet:
            if x == KISS_FEND:
                packet_escaped += [KISS_FESC, KISS_TFEND]
            elif x == KISS_FESC:
                packet_escaped += [KISS_FESC, KISS_TFESC]
            else:
                packet_escaped += [x]

        # Build the frame that we will send to Dire Wolf and turn it into a string
        kiss_frame = [KISS_FEND] + chan_cmd + packet_escaped + [KISS_FEND]

        debugmsg("kiss_frame to be transmitted: [{}]".format(', '.join(hex(a) for a in kiss_frame)))

        output = bytearray(kiss_frame)

        return output


    def _transmit_msg(self, message):
        """
        Call this to transmit the message as a KISS frame to the direwolf TNC.
        """

        encodedmessage = self._encode_msg(message)
        debugmsg("Transmiting packet: %s" % message)

         # If a socket hasn't been created yet, then we're not connected
        if self.sock is None:
            self.connect()

        # Loop through transmitting bytes until done.
        success = False
        try:
            while not success and not self.stopevent.is_set():
                try:
                    debugmsg("Sending message, '%s', from %s to %s:%d, chan=%d" % (message, self.callsign, self.direwolf, self.portnum, self.channel))
                    n = self.sock.sendall(encodedmessage)
                    if n == None:
                        success = True

                except socket.error as e:
                    debugmsg("Socket error trying to send KISS frame to Dire Wolf: %s." % str(e))
                    self.close()
                    self.connect()

        except (KeyboardInterrupt, SystemExit):
            debugmsg("Canceling socket send.  Caught interrupt event.")
            self.close()


    def transmit(self, message):
        """
        Call this to transmit the message as a KISS frame to the direwolf TNC.  
        Actually this will queue up the message while the actual transmit thread runs through transmissions in a more timely manner.
        """

        debugmsg("Adding message, %s, to the queue" % message)
        # Add this message to the queue for transmission
        self.q.put(message)


    def _workerThread(self, queue, e):
        """
        This function will work through the queue of packets, calling transmit.
        """

        try:
    
            debugmsg("Starting worker thread...")
            # Loop forever processing items from the queue
            while not e.is_set():

                debugmsg("Getting next message from the queue")
                # Get the next message from the queue
                msg = queue.get()

                debugmsg("Transmitting message, %s" % msg)
    
                # Transmit this message via direwolf
                if msg:
                    self._transmit_msg(msg)

                # Done with this item
                queue.task_done()

                debugmsg("Sleeping for 5...")

                # Now sleep a bit before getting the next item.
                e.wait(15)


        except (KeyboardInterrupt, SystemExit):
            pass



