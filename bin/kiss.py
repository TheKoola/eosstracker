#!/usr/bin/python

import sys
import socket
from inspect import getframeinfo, stack
from Queue import Queue
from threading import Thread 
import multiprocessing as mp
import time

KISS_FEND = 0xC0    # Frame start/end marker
KISS_FESC = 0xDB    # Escape character
KISS_TFEND = 0xDC   # If after an escape, means there was an 0xC0 in the source message
KISS_TFESC = 0xDD   # If after an escape, means there was an 0xDB in the source message

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
        print "%s:%d - %s" % (caller.filename.split("/")[-1], caller.lineno, message)
        sys.stdout.flush()


class GracefulExit(Exception):
    pass

def signal_handler(signum, frame):
    print "Caught SIGTERM..."
    raise GracefulExit()


class KISS(object):

    def __init__(self, callsign, channel=0, host="127.0.0.1", port=8001, via=["WIDE1-1", "WIDE2-1"], stopevent = mp.Event() ):
        """
        The constructor
        """

        # the callsign (i.e. the source address)
        self.callsign = callsign.upper()

        # The direwolf channel number (see the direwolf.conf file)
        self.channel = channel

        # The hostname / IP address of the direwolf instance we should connect to
        self.direwolf = host

        # The port number for the direwolf connection
        self.portnum = port

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

        # Are we connected to direwolf's KISS port?
        self.connected = False

        # Socket
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

        # Attempt to connect to direwolf
        self.connect()

        # Create the worker thread
        debugmsg("Constructor:  Creating worker subprocess")
        self.worker = Thread(target=self._workerThread, args=(self.q, stopevent))
        self.worker.daemon = True
        self.worker.name = "Worker process"

        # Start the worker thread
        debugmsg("Constructor:  Starting worker thread")
        self.worker.start()


    def connect(self):
        """
        Connect to direwolf's KISS port
        """

        try:
            # Connect to the direwolf hostname/port
            debugmsg("Connecting to direwolf on %s:%d" % (self.direwolf, self.portnum))
            self.sock.connect((self.direwolf, self.portnum))

            # if successful, set status to true
            self.connected = True

        except (GracefulExit, KeyboardInterrupt):
            pass
        except socket.error, e:
            debugmsg("Caught socket error when calling socket.connect: %s" % str(e))
            self.connected = False


    def close(self):
        """
        Shutdown the socket connection to direwolf's KISS port
        """

        try:
            if self.sock is not None:
                debugmsg("Closing socket for connection: %s, %s:%d" % (self.callsign, self.direwolf, self.portnum))
                self.sock.close()

                self.connected = False
        except (GracefulExit, KeyboardInterrupt):
            pass
        except socket.error, exp:
            debugmsg("Caught socket error when calling socket.close: %s" % str(exp))
            self.connected = False


    def __del__(self):
        """
        The destructor
        """

        self.close()



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
        dest_addr = self._encode_address('APDW15', False)
        src_addr = self._encode_address(self.callsign, False)

        c_byte = [0x03]           # This is a UI frame
        pid = [0xF0]              # No protocol
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

        packet += c_byte + pid + msg
        chan_cmd = (self.channel << 4)

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
        #kiss_cmd = 0x00 # Two nybbles combined - TNC 0, command 0 (send data)
        kiss_frame = [KISS_FEND, chan_cmd] + packet_escaped + [KISS_FEND]
        output = str(bytearray(kiss_frame))

        return output


    def _transmit_msg(self, message):
        """
        Call this to transmit the message as a KISS frame to the direwolf TNC.
        """

        # Socket connection to direwolf
        try:
            if self.connected:
                debugmsg("Sending message, '%s', from %s to %s:%d, chan=%d" % (message, self.callsign, self.direwolf, self.portnum, self.channel))
                self.sock.send(self._encode_msg(message))
            else:
                debugmsg("Trying to connect...")
                self.connect()
                debugmsg("Sending message, '%s', from %s to %s:%d, chan=%d" % (message, self.callsign, self.direwolf, self.portnum, self.channel))
                self.sock.send(self._encode_msg(message))
        except (GracefulExit, KeyboardInterrupt):
            pass
        except socket.error, e:
            debugmsg("Socket error trying to send KISS frame to Dire Wolf: %s." % str(e))


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
                self._transmit_msg(msg)

                # Done with this item
                queue.task_done()

                debugmsg("Sleeping for 5...")

                # Now sleep a bit before getting the next item.
                e.wait(15)


        except (GracefulExit, KeyboardInterrupt):
            pass



