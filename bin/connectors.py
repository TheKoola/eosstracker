##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2023 Jeff Deaton (N6BA)
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
import multiprocessing as mp
import time
import datetime
import typing
import socket
import select
import threading as th
import random
import string
import sys
import signal
import os
import struct
from queue import Empty, Full
from inspect import getframeinfo, stack
from dataclasses import dataclass, field
import logging
from logging.handlers import QueueHandler, QueueListener

from decoders import parse_RTP_AX25
from packet import Packet
import kissprocessor
import habconfig
import queries


class ServerConnectionError(Exception):
    pass

class GracefulExit(Exception):
    pass


##################################################
# signal handler for SIGTERM
##################################################
def local_signal_handler(signum, frame):
    pid = os.getpid()
    caller = getframeinfo(stack()[1][0])
    logger = logging.getLogger(__name__)
    logger.warning(f"Caught SIGTERM signal. {pid=}")
    #raise SystemExit()
    raise GracefulExit()

##################################    
# function to generate a random callsign
##################################    
def randomCallsign(pre:str = "")->str:

    # the callsign
    callsign = pre[:5].upper() + "".join(random.choice(string.ascii_uppercase) for x in range(5 - len(pre[:5])))

    # The number of random digits we need
    numRandomDigits = 9 - len(callsign)

    # append some random digits to the callsign and pad to 9 characters (if needed)
    callsign = callsign + str(random.randint(5, 10 ** numRandomDigits - 1)).zfill(numRandomDigits)

    return callsign


##################################    
# the PacketHandler class
##################################    
@dataclass
class PacketHandler:
    """
    This defines packet handlers that filter packets before they're transformed when saving to a queue.  Packets saved to the queue(s)
    are always done so as UTF-8 text.

    Encoders are used for encoding packets after reading from the queue. (i.e. encode the packet before writing it to a network socket)
    Decoders are used for decoding packets before saving them to the queue (i.e. decode the packet just received from a network socket)

    encoding:
    queue (Packet object) ----> pfilter -----> transform -----> encoded packet text -----> send to socket

    decoding:
    read from socket ------> transform -------> Packet Object ------> pfilter ------> add to queue

    """
    # list of tuples that contains a Queue object and its name (str)
    q: list[(mp.Queue, str)]

    # filter function
    pfilter: callable = None

    # encoder/decoder function
    # for encoding, this function should return a byte string (ex. UTF-8) suitable for writing to a socket
    # for decoding, this function should return a Packet object
    transform: callable = None


##################################    
# the Server class
##################################    
@dataclass
class Server:
    """ 
    The Server class holds the hostname, portnum, and name of the APRIS-IS system.
    """

    hostname: str
    portnum: int
    nickname: str

    def __repr__(self)->str:
        return f"[{self.nickname}] {self.hostname}:{self.portnum}"

    def setPort(self, port: int)->None:
        self.portnum = port


##################################    
# the AprsFilter class
##################################    
@dataclass
class AprsFilter:
    """
    The AprsFilter class stores a list of filter specification strings used to limit the type and amount of APRS-IS traffic desired.
    """
    
    filterset: list = None

    def add(self, spec: str)->str:
        if not spec in self.filterset:
            self.filterset.append(spec)
        return self.filterstring

    @property
    def filterstring(self)->str:
        return ' filter ' + ''.join(f + ' ' for f in self.filterset)

    def rm(self, spec: str)->str:
        if spec in self.filterset:
            self.filterset.remove(spec)
        return self.filterstring

    def length(self)->int:
        return len(self.filterset)

    def setfilter(self, filterset: list)->str:
        self.clear()
        self.filterset = filterset
        return self.filterstring

    def __bytes__(self)->bytes:
        return self.filterstring.encode(encoding='utf-8', errors='ignore')

    def __str__(self)->str:
        return self.filterstring

    def clear(self)->None:
        self.filterset.clear()




##################################    
# the CredentialSet class
##################################    
@dataclass
class CredentialSet:
    """ 
    The CredentialSet class.  This holds a user's (or their station's) callsign and passcode used for logging into an APRS-IS server.
    As well as the name and version of the software this station represents.
    """
    callsign: str
    passcode: str = ''
    name: str = ''
    version: str = ''

    def __post_init__(self):

        # Split the callsign at the "-" character so we have the SSID (if present).
        parts = self.callsign.split("-")

        # the SSID
        if len(parts) > 1 and parts[1]:
            self.ssid = int(parts[1])

            # if the SSID is 0, then just set it to 'None' as a 0 SSID isn't ever printed. 
            if self.ssid == 0:
                self.ssid = None
        else:
            # no SSID was given
            self.ssid = None

        # Convert the callsign to upper case
        self.callsign = self.callsign.upper()

        # If the callsign is > 9 characters, then truncate it to 9
        if len(self.callsign) > 9:
            self.callsign = self.callsign[:9]


    @property
    def loginstring(self)->str:
        return f"user {self.callsign} {' pass ' + self.passcode if self.passcode else ' pass -1 '} {'vers ' + self.name + ' ' + self.version if self.name else ''}"


    def setCallsign(self, callsign: str, passcode: str = '')->None:
        self.callsign = call.upper()
        self.passcode = passcode


    def setVersion(self, name: str, version: str)->None:
        self.name = name
        self.version = version


    def setCredentials(self, callsign: str, passcode: str = '', name: str = '', version: str = '')->None:
        self.callsign = callsign.upper()
        self.passcode = passcode
        self.name = name
        self.version = version

    def __str__(self)->str:
        return self.loginstring

    def __bytes__(self)->str:
        return bytes(self.loginstring + b'\r\n', encoding='utf-8', errors='ignore')


##################################    
# the PacketStream class
##################################    
@dataclass
class PacketStream:
    """ 
    The PacketStream class represents the networking interface (i.e. sockets) to a server and the methods for communicating on that socket.
    """

    server: Server
    loggingqueue: mp.Queue = None
    stopevent: mp.Event = None
    can_send: bool = False
    can_read: bool = True
    sock: socket.socket = field(init=False)
    logger: logging.Logger = field(init=False)
    okay: mp.Event = field(init=False)
    writehandlers: list[PacketHandler] = field(init=False)
    readhandlers: list[PacketHandler] = field(init=False)
    delimiter: bytes = b'\r\n'


    def __post_init__(self)->None:
        self.sock = None

        # we save the IP address we're connected to
        self.peername = None

        # setup logging
        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.loggingqueue is not None:
            handler = QueueHandler(self.loggingqueue)
            self.logger.addHandler(handler)

        # The network socket connection
        self.sock = None

        # handlers for dealing with packets being written too and read from the network socket
        self.writehandlers = []
        self.readhandlers = []

        # internal (to this class) Event object that when triggered causes threads to stop running
        self.okay = mp.Event()

        # This is the default queue aging parameter.  This is used to determine if a packet that has been lanquishing in a queue for <insert time>.
        # If the packet has been in the queue for longer than this time (in seconds), then don't send it to the socket.  If this variable is 0, then a 
        # packet's time in the queue isn't evaluated and a packet can have lived in the queue for infinite time.
        self.queue_age = 0



    def ready(self)->bool:
        if self.sock:
            ready = select.select([self.sock], [self.sock], [], 0)
            return [True if ready[0] else False, True if ready[1] else False]

        return [False, False]


    def setcapabilities(self, send: bool, read: bool)->None:
        self.can_send = send
        self.can_read = read


    def disconnect(self)->None:
        self.okay.set()

        # close the socket connection and set the socket variable to None
        if self.sock:
            self.sock.close()
            self.sock = None

        self.peername = None

        self.logger.debug(f"{self.server.nickname} disconnected.")


    def connect(self)->bool:
        
        if self.sock:
            return True

        try:
            # create the socket, set options, set the socket to be non-blocking
            self.sock = socket.create_connection((self.server.hostname, self.server.portnum) , timeout = 2)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            self.sock.setblocking(0)
            self.peername = self.sock.getpeername()[0]

            # clear the internal flag (if set)
            self.okay.clear()

        except (socket.error) as e:
            # if there was a socket error then return False
            self.logger.error(f"{self.server.nickname}: connection error: {e}")
            self.disconnect()
            self.okay.set()
            self.sock = None
            return False

        #except (KeyboardInterrupt, SystemExit) as e:
        #    self.logger.debug(f"{self.server.nickname} base-connect: got signal to end.")
        #    self.disconnect()
        #    self.okay.set()
        #    return False

        return True


    def send(self, data: str)->None:
        """ 
        Send a single line of text to the socket
        """

        # proceed only if the socket is valid and it's "okay" to use the socket
        if self.sock and not self.okay.is_set():

            # is the socket ready?
            ready = self.ready()
            if ready[1]:
                try:
                    # convert the string data to utf-8 format before sending to the socket
                    bytestring = data.encode(encoding='utf-8', errors='ignore') + b'\r\n'
                    self.sock.sendall(bytestring)

                except (socket.error) as e:
                    # Some error occured.  Set the "okay" flag so other threads don't try to use this socket.
                    self.logger.error(f"{self.server.nickname} send:  socket error: {e}")
                    self.disconnect()
                    self.okay.set()

                #except (KeyboardInterrupt, SystemExit) as e:
                #    self.logger.debug(f"{self.server.nickname} send: got signal to end: {e}")
                #    self.disconnect()
                #    self.okay.set()

            else:
                # socket isn't available for writing???  
                self.logger.error(f"{self.server.nickname} aborting send as the socket wasn't ready")
                self.disconnect()
                self.okay.set()

        self.logger.debug(f"{self.server.nickname} send: ended")


    def setWriteHandlers(self, handlers: list [PacketHandler])->None:
        self.writehandlers = handlers

    def setReadHandlers(self, handlers: list [PacketHandler])->None:
        self.readhandlers = handlers


    def getPacketFromQueue(self)->list:
        """
        This will loop through the input packet handlers returning a list of packets properly encoded for sending to a network socket.
        """

        # the list of packets we need to write to the socket connection.  These should be binary strings.
        packetlist = []

        # Loop through the packethandlers checking for any data available on their queue
        for ph in self.writehandlers:

            # loop through the list of queues for this packet handler
            for (q, qname) in ph.q:
                try:

                    # get a packet from the queue
                    packet = q.get_nowait()

                    self.logger.debug(f"{self.server.nickname} getPacketFromQueue:  {qname}, [{q.qsize()}]  {packet}")

                    # run this packet through the filter (if it exists)
                    packet = ph.pfilter(packet) if ph.pfilter else packet

                    # Convert/encode the packet before sending
                    packetbytes = ph.transform(packet) if ph.transform else packet.bytestring

                    # if we ended up with a packet after filtering and encoding, then add it to our packet list
                    if packetbytes:

                        # check how long this packet has been in the queue
                        if self.queue_age > 0:

                            # time when this packet was added to this queue
                            receive_time = int(packet.properties["decode_time"]) if "decode_time" in packet.properties else int(packet.properties["queue_time"]) if "queue_time" in packet.properties else ts

                            # Amount of time this packet has spent in the queue
                            time_in_queue = int(time.time()) - receive_time

                            self.logger.debug(f"{self.server.nickname} getPacketFromQueue: {receive_time=} queue_time={packet.properties['queue_time'] if 'queue_time' in packet.properties else None} decode_time={packet.properties['decode_time'] if 'decode_time' in packet.properties else None} {time_in_queue=}")
                            
                            # if the time this packet spent in the queue is < the queue_age then add it to the list we'll return
                            if time_in_queue < self.queue_age:

                                # add this packet to the list we'll return
                                packetlist.append(packetbytes)  

                        else:
                            # queue_age limits not being inforced.

                            # add this packet to the list we'll return
                            packetlist.append(packetbytes)  

                except (Empty) as e:
                    # the queue was empty, but we don't care...go check the next queue
                    pass

        return packetlist

    def putPacketOnQueue(self, packet: bytes)->None:
        """
        This will loop through the input packet handlers adding this packet to those queues.

        The packet argument is the byte string that came from the network socket.
        """

        # point at which we no longer add packets to the queue (i.e. these packets are dropped)
        q_low_watermark = 200

        # point at which we clear the queue.  Presumably because there's no catching up...because the downstream consumers aren't working this queue.
        q_high_watermark = 250

        # loop through each packet handler
        for ph in self.readhandlers:

                # Convert/decode the packet.  If there isn't a transform then we default to UTF-8...but we shouldn't do this since the packet could be framed (ex. RTP, AX25, etc.)
                packetobj = ph.transform(packet) if ph.transform else Packet(text = packet.decode(encoding='utf-8', errors='ignore'), frequency=None, source="unknown")

                # run this packet through the filter (if it exists)
                packetobj = ph.pfilter(packetobj) if ph.pfilter else packetobj

                # if we ended up with a packet after filtering and decoding, then put this packet on each queue in this packet handler
                if packetobj:
                    for (q, qname) in ph.q:
                        try:

                            # number of items in the queue
                            size = q.qsize()

                            # check the size of the queue to determine if we should add another packet on top.
                            if size < q_low_watermark:
                                self.logger.debug(f"{self.server.nickname}  placing packet on {qname}[{size}]:  {packetobj}")
                                packetobj.properties["queue_time"] = int(time.time())
                                q.put(packetobj)  

                            elif size > q_high_watermark:
                                # Above the high_watermark.  Assumed at this point that we can't catch up, so we clear the queue
                                self.logger.warn(f"{self.server.nickname} clearing {qname}[{size}] [above high water mark]") 

                                # Attempt to clear the queue
                                while not q.empty():
                                    try:
                                        q.get(block=False)
                                    except Empty:
                                        continue

                                self.logger.warn(f"{self.server.nickname} {qname} cleared. qsize={q.qsize()}") 

                                # with the queue cleared, add this most recent packet to the queue.
                                packetobj.properties["queue_time"] = int(time.time())
                                q.put(packetobj)  

                            else:
                                # queue is > than the low_watermark, but < high_watermark.  
                                self.logger.warn(f"{self.server.nickname} placing packet on {qname}[{size}] [above low water mark]: {packetobj}")

                                # Finally, go ahead and place the new packet on the queue
                                packetobj.properties["queue_time"] = int(time.time())
                                q.put(packetobj)  

                        except (Full) as e:
                            # the queue was full, but we don't care...go check the next packet handle queue.
                            self.logger.debug(f"{self.server.nickname} {qname} was full: {e}")
                            pass


    def send_thread(self)->None:
        """
        This will read from the incoming queues, sending packets to the socket connection until stopped (i.e. the stopevent) or killed
        """

        # can't continue without a valid socket
        if not self.sock: 
            return None

        # initial timestamp
        tsprev = int(time.time())

        # loop continuously unless our connection fails or the stopevent is set
        while not self.stopevent.is_set() and not self.okay.is_set():

                try:

                    # get a list of packets from the the writehandlers (PacketHandler objects)
                    packetlist = self.getPacketFromQueue()

                    # write any returned packets to he socket
                    if packetlist:
                        for p in packetlist: 

                            self.logger.debug(f"{self.server.nickname}: sending packet to server: {p}")

                            # send this packet to the server
                            self.sock.sendall(p)
                    else:

                        # wait a short time before retrying to get an item from the queues
                        self.okay.wait(1)

                except (socket.error) as e:
                    self.logger.error(f"Socket error with {self.server.nickname}: {e}")

                    # if the connection was lost, then we close things down
                    if "Resource temporarily unavailable" in str(e):
                        self.disconnect()
                        self.okay.set()

        # loop ended.
        self.logger.debug(f"{self.server.nickname}: send_thread now ended.")

        return None


    def readline(self)->bytes:
        """
        Read one line from the socket connection
        """

        # if the socket object was none then eject
        if not self.sock:
            return None

        #Initial loop variables
        bigbuffer = b''

        # loop continuously unless our connection fails or the stopevent is set
        while not self.stopevent.is_set() and not self.okay.is_set():

            try:

                # Only attempt to read from the socket if there was data available
                isready = self.ready()
                if isready[0] and self.sock:

                    # Try to read at most 4096 bytes from the socket
                    data = self.sock.recv(4096)

                    if data:
                        # append whatever data was read to the bigbuffer
                        bigbuffer += data

                        # parse the big buffer carving out whole lines.  This trims down the bigbuffer on each iteration.
                        while self.delimiter in bigbuffer:

                            # split out indivdual lines from the bigbuffer
                            line, bigbuffer = bigbuffer.split(self.delimiter, 1)

                            # we've found one line, return it
                            return line
                else:

                    # Socket wasn't ready
                    # wait a little bit before trying to read data from the socket again
                    #self.logger.debug(f"{self.server.nickname} socket wasn't ready")
                    self.okay.wait(1)

            except (socket.error) as e:
                self.logger.error(f"Socket error in readline with {self.server.nickname}: {e}")

                # if the connection was lost, then break out of this loop
                if "Resource temporarily unavailable" in str(e):
                    self.disconnect()
                    self.okay.set()

        self.logger.debug(f"{self.server.nickname} readline, ending thread.")
        return None


    def read_thread(self)->None:
        """
        This will read from the socket connection until the stopevent Event is triggered or an error has occured.  
        """

        # if the socket object was none then eject
        if not self.sock:
            return None

        #Initial loop variables
        bigbuffer = b''

        self.logger.debug(f"{self.server.nickname} read_thread: starting socket read loop")

        # loop continuously unless our connection fails or the stopevent is set
        while not self.stopevent.is_set() and not self.okay.is_set():

            try:

                # Only attempt to read from the socket if there was data available
                isready = self.ready()
                if isready[0] and self.sock:

                    # Try to read at most 4096 bytes from the socket
                    data = self.sock.recv(4096)

                    #if not data:
                        # sock.recv returns empty if the connection drops
                    #    self.logger.error(f"{self.server.nickname}:  {self.server.hostname} socket.recv(): returned empty")

                        # close our connection
                    #    self.disconnect()
                    #    self.okay.set()

                    #else:
                        #self.logger.debug(f"{self.server.nickname}  read_thread data: {data}")

                    if data:

                        # append whatever data was read to the bigbuffer
                        bigbuffer += data

                        # parse the big buffer carving out whole lines.  This trims down the bigbuffer on each iteration.
                        while self.delimiter in bigbuffer:

                            # split out indivdual lines from the bigbuffer
                            line, bigbuffer = bigbuffer.split(self.delimiter, 1)

                            # Loop our read handlers decoding this packet and adding it to the output queues.
                            if line != None:
                                self.putPacketOnQueue(line)
                else:
                    # Socket wasn't ready
                    # wait a little bit before trying to read data from the socket again
                    #self.logger.debug(f"{self.server.nickname} read_thread: socket wasn't ready")
                    self.okay.wait(1)

            except (TimeoutError) as e:
                self.logger.debug(f"{self.server.nickname} timeout error")
                self.okay.wait(1)

            except (socket.error) as e:
                self.logger.error(f"Socket error in readfromq with {self.server.nickname}: {e}")

                # if the connection was lost, then break out of this loop
                if "Resource temporarily unavailable" in str(e):
                    self.disconnect()
                    self.okay.set()

        self.logger.debug(f"{self.server.nickname} read_thread ended")

        return None


    ##################################################
    # this meathod is used to create the threads that we'll run (ex. send, read, etc.)
    ##################################################
    def createThreads(self)->list:
        # where we'll save the threads we create
        threadlist = []

        if self.can_read:
            # the read thread
            self.logger.debug(f"{self.server.nickname} Creating read thread")
            rt = th.Thread(name=f"{self.server.nickname}:read_thread", target=self.read_thread, args=())
            rt.daemon = True
            threadlist.append(rt)

        if self.can_send:
            # the send thread
            self.logger.debug(f"{self.server.nickname} Creating write thread")
            wt = th.Thread(name=f"{self.server.nickname}:send_thread", target=self.send_thread, args=())
            wt.daemon = True
            threadlist.append(wt)

        return threadlist


    ##################################################
    # the run function.
    ##################################################
    def run(self)->None:
        """
        primary run loop... 

        It will start the read and send threads

        Will run forever until killed...
        """

        # keep track of how many connection retries have been attempted
        trycount = 0

        self.logger.debug(f"{self.server.nickname} in run function.")

        try:
      
            # loop that initiates a connection to the aprs-is server, then starts the read and write threads waiting for them to finish
            while not self.stopevent.is_set():

                # connect to the server
                online = self.connect()

                # something happened during the connection attempt
                if not online and self.okay.is_set():
                    self.logger.debug(f"{self.server.nickname} run():  something happened during connection attempt")

                while online and not self.stopevent.is_set() and not self.okay.is_set():

                    self.logger.info(f"{self.server.nickname} connected to [{self.server.hostname}] {self.peername}:{self.server.portnum}")
                    threadlist = []

                    # set our retry count back to 0 since we just connected
                    trycount = 0

                    # create the threads we need to run

                    threadlist = self.createThreads()

                    # now start our threads
                    for t in threadlist:
                        t.start()

                    self.logger.debug(f"{self.server.nickname} threads running...waiting")
                    # Now wait on the threads...this should never end (aka it'll block) until this process is killed
                    for t in threadlist:
                        t.join()

                    # once the threads are complete, then disconnect
                    self.disconnect()
                    self.okay.set()
                    online = False

                    self.logger.debug(f"{self.server.nickname} run().  Done with threads")

                if not self.stopevent.is_set():

                    # the retry delay in seconds
                    retry_delay = 1

                    # Increment the trycount
                    trycount += 1

                    #try:
                    if trycount > 5:

                        # as the try count increases increase the wait time between retries
                        retry_delay = (trycount**2 if trycount**2 < 121 else 120)

                    self.logger.debug(f"{self.server.nickname} run loop: {retry_delay=}, {trycount=}")

                    # wait before retrying to connect
                    self.stopevent.wait(retry_delay)

                    self.logger.info(f"{self.server.nickname} run loop:  Reconnecting")

        except (ServerConnectionError) as e:
            self.logger.debug(f"{self.server.nickname} run():  Ending run loop...{e}")
            self.okay.set()



##################################    
# A UDP Multicast PacketStream
##################################    
@dataclass
class MulticastPacketStream(PacketStream):

    def connect(self)->bool:

        if self.sock:
            return True

        try:
            # create a UDP socket instead, and join it to the server address/port.
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.sock.bind((self.server.hostname, self.server.portnum))
            mreq = struct.pack("4sl", socket.inet_aton(self.server.hostname), socket.INADDR_ANY)
            self.sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            self.sock.setblocking(1)
            self.sock.settimeout(5)
            self.peername = self.server.hostname

            # clear the internal flag (if set)
            self.okay.clear()

            self.logger.debug(f"{self.server.nickname} connect->select: {select.select([self.sock], [], [], 10)}")

        except (socket.error) as e:
            # if there was a socket error then return False
            self.logger.error(f"{self.server.nickname}: connection error to multicast socket: {e}")
            self.disconnect()
            self.okay.set()
            self.sock = None
            return False

        #except (KeyboardInterrupt, SystemExit) as e:
        #    # we were signaled to shutdown so close things down
        #    self.logger.debug(f"{self.server.nickname} multicast-connect: got signal to end : {e}")
        #    self.disconnect()
        #    self.okay.set()
        #    return False

        return True


##################################    
# the RTP AX25 Stream for ingesting data from the ka9q-radio backend 
##################################    
@dataclass
class RTPStream(MulticastPacketStream):

    # The configuration dictionary
    configuration: dict = None

    def __post_init__(self)->None:
        super().__post_init__()

        if self.configuration is None:
            raise TypeError('configuration cannot be None')

        # For RTP streams (i.e. listening to a ka9q-radio instance), we only turn on igating if direwolf is not already igating (i.e. Direwolf is connected to an SDR).
        # The reasoning for this is because aprsc disallows multiple logins from the same callsign-ssid.  Therefore, we can forward packets heard from ka9q-radio on to 
        # APRS-IS (or the local aprsc instance) only if direwolf is not running.
        #self.is_direwolf_igating = True if len(self.configuration["direwolffreqlist"]) > 0 else False
        self.igating = True #if not self.is_direwolf_igating else False

        if self.igating:
            queuelist = [ (self.configuration["igatingqueue"], "igating queue"), (self.configuration["databasequeue"], "database queue") ]
        else:
            queuelist = [ (self.configuration["databasequeue"], "database queue") ]

        # this packet handler should decode the RTP+AX25 packet, then save it to both the igating and database queues
        readhandler = PacketHandler(q=queuelist, pfilter=None, transform=parse_RTP_AX25)
        self.setReadHandlers([readhandler])


    def readline(self)->None:
        """
        Adjusted for RTP frames.
        This will read a single line from the socket connection without having been passed through the packet handlers.  It will return the byte string from the socket.
        """

        # if the socket object was none then eject
        if not self.sock:
            return None

        self.logger.debug(f"{self.server.nickname} readline: starting socket read loop")

        data = None

        # loop continuously unless our connection fails or the stopevent is set
        while not self.stopevent.is_set() and not self.okay.is_set():

            try:

                # Try to read at most 4096 bytes from the socket
                data = self.sock.recv(4096)

                #if not data:
                    # sock.recv returns empty if the connection drops
                #    self.logger.error(f"{self.server.nickname}:  {self.server.hostname} socket.recv(): returned empty")

                    # close our connection
                #    self.disconnect()
                #    self.okay.set()

                #else:
                    #self.logger.debug(f"{self.server.nickname}  read_thread data: {data}")
                #    return data

            except (TimeoutError) as e:
                self.logger.debug(f"{self.server.nickname} timeout error")
                self.okay.wait(1)

            except (socket.error) as e:
                self.logger.error(f"Socket error in readfromq with {self.server.nickname}: {e}")

                # if the connection was lost, then break out of this loop
                if "Resource temporarily unavailable" in str(e):
                    self.disconnect()
                    self.okay.set()

        self.logger.debug(f"{self.server.nickname} RTPStream readline thread ended.")
        return data


    def read_thread(self)->None:
        """
        Adjusted for RTP frames.
        This will read from the socket connection until the stopevent Event is triggered or an error has occured.  
        """

        # if the socket object was none then eject
        if not self.sock:
            return None

        self.logger.debug(f"{self.server.nickname} read_thread: starting socket read loop")

        # loop continuously unless our connection fails or the stopevent is set
        while not self.stopevent.is_set() and not self.okay.is_set():

            try:

                # Try to read at most 4096 bytes from the socket
                data = self.sock.recv(4096)

                #if not data:
                    # sock.recv returns empty if the connection drops
                #    self.logger.error(f"{self.server.nickname}:  {self.server.hostname} socket.recv(): returned empty")

                    # close our connection
                #    self.disconnect()
                #    self.okay.set()

                #else:
                    #self.logger.debug(f"{self.server.nickname}  read_thread data: {data}")

                    # send packet to read handlers
                if data:
                    self.putPacketOnQueue(data)

            except (TimeoutError) as e:
                self.logger.debug(f"{self.server.nickname} timeout error")
                self.okay.wait(1)

            except (socket.error) as e:
                self.logger.error(f"Socket error in readfromq with {self.server.nickname}: {e}")

                # if the connection was lost, then break out of this loop
                if "Resource temporarily unavailable" in str(e):
                    self.disconnect()
                    self.okay.set()

        self.logger.debug(f"{self.server.nickname} RTPStream read_thread ended.")
        return None


##################################    
# the APRSIS class for connecting to an APRS-IS system
##################################    
@dataclass
class AprsisStream(PacketStream):

    # The configuration dictionary
    configuration: dict = None
    creds: CredentialSet = None
    taptype: str = 'aprs'
    aprsfilter: AprsFilter = None

    def __post_init__(self)->None:
        super().__post_init__()

        if self.configuration is None:
            raise TypeError('configuration cannot be None')

        if self.creds is None:
            raise TypeError('creds cannot be None')

        # this packet handler should decode the packets from the aprs-is server, then save it the database queue
        readhandler = PacketHandler(q=[(self.configuration["databasequeue"], "database queue")], pfilter=self.filterComments, transform=self.transform)
        self.setReadHandlers([readhandler])


        #----------- start of igating & ibeaconing determination -------------
        # this is kindof a mess, but boils down to igating and listening to packets coming from a ka9q-radio instance.

        # Is direwolf configured to run (and igate??)?  We determine this by checking the length of the frequency list that direwolf uses to configure itself.  If that 
        # list is empty, then no SDR dongles were found locally attached and therefore direwolf shouldn't be running except in the case when it's only being
        # used to transmit beacons over RF w/ an external radio.
        self.is_direwolf_igating = True if len(self.configuration["direwolffreqlist"]) > 0 else False

        # are we listening to ka9q-radio?
        self.is_ka9qradio = True if self.configuration["ka9qradio"] == "true" or self.configuration["ka9qradio"] == True else False

        # Check if we're able to igate or not.  Only possible with a non-CWOP connection.  We'll use this criteria:
        # 1) is igating actually enabled..if yes, then stop.  we're igating
        # 2) igating is not enabled in the configuration, but we're setup to listen to KA9Q-Radio...we need to then turn on igating
        self.real_igating = True if self.configuration["igating"] == "true" or self.configuration["igating"] == True else False
        self.igating = True if self.taptype =='aprs' and (self.real_igating or (self.is_ka9qradio or self.is_direwolf_igating))  else False

        # if we're listening to a ka9q-radio instance and configure to igate, then we need to adjust our credentials to be the user's real callsign-ssid,
        # That's because aprsc does not allow for duplicate logins (i.e. multiple connections from the same verified callsign-ssid).
        if self.is_ka9qradio and self.taptype == 'aprs' and self.real_igating:
            self.creds = CredentialSet(callsign = self.configuration["callsign"] + ("-" + self.configuration["ssid"] if self.configuration["ssid"] else ""), passcode = self.configuration["passcode"], name='eosstracker', version='1.5')
            self.logger.debug(f"{self.server.nickname} credentials updated to: {self.creds}")

        # Check if we want to beacon over the Internet to the APRS-IS server.  Only possible if we're also igating with a non-CWOP connection....AND...direwolf isn't running.
        # That's because when direwolf is running (i.e. connected to an SDR) then it will be the mechanism that transmits this system's position to APRS-IS, etc..
        self.can_beacon = True if self.configuration["ibeacon"] == "true" and self.real_igating and self.is_ka9qradio else False

        #----------- end of igating & ibeaconing determination -------------


        # station callsign (not necessarily the same as the credentials used for logging into the APRS-IS server)
        self.station_callsign = self.configuration["callsign"] if "callsign" in self.configuration else None

        # igating statistics
        self.igated_stations = {}

        # the internet beaconing rate
        rate = self.configuration["ibeaconrate"]
        if rate:
            sp = rate.split(":")
            secs = int(sp[0]) * 60
            if len(sp) > 1:
                secs += int(sp[1])
            self.ibeacon_rate = secs
        else:
            # default beacon rate of 10min
            self.ibeacon_rate = 600


        # check if we're igating or not
        if self.igating:
            # if we're igating 
            self.logger.info(f"{self.server.nickname} Igating enabled for {self.taptype} connnection to {self.server.hostname}:{self.server.portnum}")
            writehandler = PacketHandler(q=[(self.configuration["igatingqueue"], "igating queue")], pfilter=self.igatingFilter, transform=self.toTNC2)
            self.setWriteHandlers([writehandler])
            self.can_send = True

        elif self.taptype == 'aprs':
            self.logger.info(f"{self.server.nickname} Igating disabled for {self.server.hostname}:{self.server.portnum}")

        if self.can_beacon:
            self.logger.info(f"{self.server.nickname} APRS-IS beacon rate: {self.ibeacon_rate} seconds")
        elif self.taptype == 'aprs':
            self.logger.info(f"{self.server.nickname} APRS-IS beaconing disabled for {self.server.hostname}:{self.server.portnum}")

        # default aprsis filter:  200km around Denver, CO USA
        self.aprsfilter = AprsFilter(['r/39.739281/-104.984894/200']) 

        # If this is a cwop tap then we want to further limit this to just weather packets.
        #
        # 10/14/2023:  apparently adding the 't/w' filter to for CWOP connections overrides the radius filter resulting in packets being ingested
        # from all over the world!!
        #
        #if self.taptype == "cwop":
        #    self.aprsfilter.add("t/w")

        # this is only used when igating and we're a fixed station (i.e. not mobile), but we set it to None to be sure.
        self.stationLocation = None

        self.logger.debug(f"{self.server.nickname} initial aprs filter string: {self.aprsfilter.filterstring}")

        # don't igate packets older than this number of seconds
        self.igating_time_limit = 30

        # Set the queue age limit to the igating time limit so packets don't sit in the queue for longer than the limit, waiting to be sent to the APRS-IS server.
        self.queue_age = self.igating_time_limit


    def connect(self)->bool:
        ret = super().connect()

        # something happened during the socket connection
        if not ret and self.okay.is_set():
            self.logger.debug(f"{self.server.nickname} aprs-connect.  Something happened during connection, returning False")
            return False


        if self.sock and ret:
            banner = self.readline()
            if banner: 
                banner = banner.decode(encoding='UTF-8', errors='ignore').rstrip()

            else:
                # Something went wrong with readline()
                self.logger.debug(f"{self.server.nickname} aprs-connect: got null back from readline #1.")
                self.okay.set()
                return False

            self.logger.info(f"{self.server.nickname} Banner: {banner}")

            # send the login string
            self.send(self.creds.loginstring + self.aprsfilter.filterstring)

            banner = self.readline()
            if banner: 
                banner = banner.decode(encoding='UTF-8', errors='ignore').rstrip()

            else:
                # Something went wrong with readline()
                self.logger.debug(f"{self.server.nickname} aprs-connect: got null back from readline #2.")
                self.okay.set()
                return False

            self.logger.info(f"{self.server.nickname} Banner: {banner}")

        self.logger.debug(f"{self.server.nickname} aprs-connect: returning: {ret=}, okay: {self.okay.is_set()}")
        return ret


    def filterComments(self, packet: Packet)->Packet:
        """
        Only allow those packets that match certain criteria are to be added to the queues.  In this case, every packet passes except those that start with a comment character ('#').
        """
        if packet.text:
            if packet.text[0] != "#":
                return packet
        return None

    def transform(self, packetbytes: bytes)->Packet:
        """
        Used to convert packets read from the networking socket to a Packet object
        """
        return Packet(text = packetbytes.decode(encoding='utf-8', errors='ignore'), frequency=None, source=self.server.nickname)

    def toTNC2(self, p: Packet)->bytes:
        """
        Convert packet text to TNC2 monitor format (ex. SOURCE>DESTINATION,qAO,CALLSIGN:rest of packet)
        """

        if not p:
            return None

        self.logger.debug(f"{self.server.nickname} toTNC2, initial packet:  {p=}")
        tnc2 = None
        if p.text:
            s = p.text.split(":")
            if len(s) > 1:
                first_part = s[0]

                # get the original informatino part of the packet (prior to UTF-8 conversion) because want to transfer it to APRS-IS "as is".
                if "information" in p.properties:
                    information_part = p.properties["information"]
                else:
                    # we just contruct the information part from the 'text' packet.  (shouldn't be here assuming the packet was original decoded)
                    information_part = ''.join(part for part in s[1:])

                # encode this to be utf-8, if not already
                if type(information_part) != bytes:
                    information_part = information_part.encode(encoding = 'utf-8', errors = 'ignore')

                # convert the addresses, etc. to bytes
                tnc2 = f"{s[0]},qAO,{self.creds.callsign.upper()}".encode(encoding = 'utf-8', errors = 'ignore')

                # concatenate the information part of the packet
                tnc2 += b':' + information_part

                # trim to 510 bytes
                tnc2 = tnc2[0:510]

                # delete any CR of LF characters and add a trailing CRLF
                tnc2 = tnc2.replace(b'\r', b'').replace(b'\n', b'')
                tnc2 = tnc2 + b'\r\n'

        self.logger.debug(f"{self.server.nickname} igating: {tnc2=}")
        return tnc2


    def igatingFilter(self, p: Packet)->Packet:
        """
        filters those packets that should not be igated (i.e. returns None).  For packets that are to be igated, they are returned (i.e. Packet).
        """

        # first check the list of digipeaters
        properties = p.properties
        if properties:
            if "digipeaters" in properties:

                # make sure there isn't a "don't igate me" digipeater listed
                for d in properties["digipeaters"]:
                    dupper = d.upper()
                    if 'TCPIP' in dupper or 'TCPXX' in dupper or 'RFONLY' in dupper or 'NOGATE' in dupper:
                        self.logger.info(f"{self.server.nickname} igatingFilter.  Not igating RF only packet: {p}")
                        return None
            else:
                # digipeaters weren't broken out....this shouldn't happen, right?
                self.logger.info(f"{self.server.nickname} igatingFilter.  Digipeater list wasn't available: {p}")
                return None


            # look at packet types
            if "information" in properties:
                info = properties["information"]
                self.logger.debug(f"{self.server.nickname} igatingFilter. info length: {len(info)}")

                if len(info) > 0:
                    packettype = info[0]
                    #self.logger.debug(f"{self.server.nickname} igatingFilter.  {packettype=}, {chr(packettype)}")

                    # don't igate query packets
                    if packettype == ord(b'?'):
                        self.logger.info(f"{self.server.nickname} igatingFilter.  Not igating query packet: {p}")
                        return None

                    # ignoring third party packets (for now)
                    elif packettype == ord(b'}'):
                        self.logger.info(f"{self.server.nickname} igatingFilter.  Not igating third party packet: {p}")
                        return None
                else:
                    self.logger.info(f"{self.server.nickname} igatingFilter.  There was no information part to this packet: {p}")
            else:
                self.logger.info(f"{self.server.nickname} igatingFilter.  There was no information part to this packet: {p}")


            # did this come from a satellite.  We don't want to igate it if we've heard it directly.
            if p.frequency == 145825000:
                if "digipeaters" in properties:
                    if len(properties["digipeaters"]) == 0:
                        self.logger.info(f"{self.server.nickname} igatingFilter.  Not igating packet heard directly from a satellite xmitter: {p}")
                        return None
                else:
                    self.logger.info(f"{self.server.nickname} igatingFilter.  Satgate.  Digipeater list wasn't available: {p}")
                    return None

            # Make sure this is an APRS packet
            if "is_aprs" in properties:
                if properties["is_aprs"] == False:
                    self.logger.info(f"{self.server.nickname} igatingFilter.  Packet is not APRS: {p}")
                    return None

            # check timestamps.  Anything older than 30sec, we don't igate.
            if "decode_timestamp" in properties:
                # if the RTP timestamp wasn't part of the packet, check the decode_timestamp instead

                # current time since epoch
                epoch = int(time.time())
                if epoch - int(properties["decode_timestamp"]) > self.igating_time_limit:
                    self.logger.info(f"{self.server.nickname} igatingFilter.  Packet age decode_timestamp={int(properties['decode_timestamp'])} is too old to igate: {p}")
                    return None

        else:
            self.logger.info(f"{self.server.nickname} igatingFilter.  Not igating packet, no properties defined: {p}")
            return None

        # if we made it this far then pass the packet on as worthy to be igated.
        self.logger.debug(f"{self.server.nickname}  passed igating filter: {p=}")

        # update statistics
        if 'source' in p.properties:
            self.igated_stations[p.properties['source']] = (self.igated_stations[p.properties['source']] if p.properties['source'] in self.igated_stations else 0) + 1
            self.logger.debug(f"{self.server.nickname} {self.igated_stations=}")

            # Update the shared (between processes) dictionary for station's we've igated
            igstats = self.configuration["igatestatistics"]
            if igstats is not None:
                igstats["igated_stations"] = self.igated_stations

        return p


    def createThreads(self)->None:
        threadlist = super().createThreads()

        # the aprs-is filter thread
        self.logger.debug(f"{self.server.nickname} Creating filter_thread")
        ft = th.Thread(name=f"{self.server.nickname}:filter_thread", target=self.filter_thread, args=())
        ft.daemon = True
        threadlist.append(ft)

        # the beacon (to the APRS-IS server) thread
        if self.can_send and self.can_beacon and self.igating:
            self.logger.debug(f"{self.server.nickname} Creating beacon_thread")
            xt = th.Thread(name=f"{self.server.nickname}:beacon_thread", target=self.beacon_thread, args=())
            xt.daemon = True
            threadlist.append(xt)

        return threadlist


    def beacon_thread(self)->None:
        """
        Thread for beaconing position/telemetry/etc. packets to the APRS-IS server over TCPIP (not RF).
        """

        # if the socket object was none then eject
        if not self.sock:
            return None

        self.logger.debug(f"{self.server.nickname} beacon_thread: starting loop")

        # wait a little bit before sending data to the aprs-is server
        self.okay.wait(5)

        # loop continuously unless our connection fails or the stopevent is set
        while not self.stopevent.is_set() and not self.okay.is_set():

            posit = self.getPositionPacket()

            if posit:
                self.logger.debug(f"{self.server.nickname} Beaconing to APRS-IS: {posit}")

                # send the bytestring for the position packet to the APRS-IS server
                self.send(posit)

            self.logger.debug(f"{self.server.nickname} beacon_thread:  waiting...")
            self.okay.wait(self.ibeacon_rate)

        self.logger.debug(f"{self.server.nickname} beacon_thread has now ended")
        return None


    def getPositionPacket(self)->bytes:
        """
        Construct the byte string to send to the APRS-IS server that contains an APRS position packet for this station
        """

        # get our GPS position
        gpsposition = self.getPosition()

        # if the gps position isn't valid, then just return
        if not gpsposition["isvalid"]:
            self.logger.warning(f"{self.server.nickname} getPositionPacket.  GPS position was not valid.")
            return None

        # only form up a position packet (that will be sent to APRS-IS) if we have a GPS location from the GPS device itself.
        if "source" in gpsposition:
            if gpsposition["source"] != "gps":
                self.logger.warning(f"{self.server.nickname} getPositionPacket.  GPS position was not valid.")
                return None

        # is this a mobile or stationary station?
        is_mobile = True if self.configuration["mobilestation"] == "true" else False

        # convert the lat/lon to degrees, decimal minutes
        lat_d = int(gpsposition["latitude"])
        lon_d = int(gpsposition["longitude"])
        lat_ns = 'N' if lat_d >= 0 else 'S'
        lon_ew = 'E' if lon_d >= 0 else 'W'
        lat_ms = (lat_d - gpsposition["latitude"]) * 60
        lon_ms = (lon_d - gpsposition["longitude"]) * 60

        latitude  = f"{abs(lat_d):>02}{abs(lat_ms):>02.2f}{lat_ns}"
        longitude = f"{abs(lon_d):>03}{abs(lon_ms):>02.2f}{lon_ew}"

        # get the current time in UTC
        ts = datetime.datetime.now(datetime.timezone.utc)
        timestamp = f"{ts.hour:>02}{ts.minute:>02}{ts.second:>02}h"

        # get the symbol and overlay (if it exists)
        symbol = self.configuration["symbol"] if "symbol" in self.configuration else None
        overlay = self.configuration["overlay"] if "overlay" in self.configuration else None

        # for a posit packet we must have a symbol
        if symbol == "":
            self.logger.warning(f"{self.server.nickname} getPositionPacket.  symbol field was null")
            return None

        # normal symbol table
        if symbol[0] == '/':
            symchar_first = '/'
            symchar_second = symbol[1]

        # alternative symbol table
        elif symbol[0] == '\\':
            if overlay != '':
                symchar_first = overlay[0]
                symchar_second = symbol[1]
            else:
                symchar_first = '\\'
                symchar_second = symbol[1]
        else:
            self.logger.warning(f"{self.server.nickname} getPositionPacket.  Error with symbol: {symbol=}, {overlay=}")
            return None

        # the altitude of this station (in feet)
        altitude = f"/A={int(gpsposition['altitude']):>06}"

        # any comments
        comment = altitude + (self.configuration["comment"] if self.configuration["comment"] != "" else "")

        # start assembling the packet.  A position report without messaging.
        info = '/' + timestamp + latitude + symchar_first + longitude + symchar_second 

        # if this is a mobile station, then we need to add in course and speed if available
        if is_mobile:
            # get course (degrees) and speed (knots)
            if float(gpsposition["speed_mph"]) >= 1:
                course = int(gpsposition["bearing"])
                speed = float(gpsposition["speed_mph"]) * 0.8689762
                csespd = f"{course:>03.0f}/{speed:>03.0f}"
            else:
                csespd = "000/000"

            # when including the course/speed the comments must be limited to 36 characters
            comment = comment[:36] if comment else ""

            # append to packet
            info += csespd + comment

        else:
           # non-mobile stations can have a comment field up to 43 chars.
           comment = comment[:43] if comment else ""

           # append to packet
           info += comment

        # Determine if we should use the station's callsign (i.e. the legit, HAM callsign for this station) or the randomized call that is [sometimes] used instead.
        # If direwolf is running (i.e. connected to an SDR), then it will be the mechanism used for beaconing this station's position to APRS-IS and/or over RF.  
        # However, in the case when we're listening to a KA9Q-Radio instance and NOT running direwolf, then we need to use the legit station's address as the callsign
        # for our position packet (because direwolf isn't).
        #callsign = self.creds.callsign

        # if direwolf isn't running (i.e. it's not trying to beacon to APRS-IS or over RF itself) then we need to use the original legit callsign for this HAM operator
        #if not self.is_direwolf_igating:
#
#            # figure out this station's SSID
#            ssid = None
#            if "ssid" in self.configuration:
#                ssidstring = self.configuration["ssid"] 
#                
#                if len(ssidstring) > 0:
#                    try:
#                        ssid = int(ssidstring)
#                        if ssid == 0:
#                            ssid = None
#                    except ValueError:
#                        pass
#
#            # construct this station's callsign-ssid string
#            callsign = self.configuration["callsign"] + ("-" + str(ssid) if ssid else "")
                
        # this is the final packet
        tocall = "APZES1"  # experimental tocall:  APZxxx
        #packet = f"{callsign}>{tocall},TCPIP*:{info}"
        packet = f"{self.creds.callsign}>{tocall},TCPIP*:{info}"

        return packet


    def filter_thread(self)->None:
        """
        Thread for building, setting, and sending the APRS-IS filter string to the APRS-IS server.  This impacts the packets that the APRS-IS server 
        infrastructure sends our direction.  We need to apply a filter to this connection so we're not overwhelmed with packets.
        """

        # if the socket object was none then eject
        if not self.sock:
            return None

        self.logger.debug(f"{self.server.nickname} filter_thread: starting loop")

        # loop continuously unless our connection fails or the stopevent is set
        while not self.stopevent.is_set() and not self.okay.is_set():

            filterlist = self.getAprsFilter()

            if filterlist:
                self.aprsfilter.setfilter(filterlist)
                self.logger.debug(f"{self.server.nickname} filter_thread: setting {self.taptype.upper()} filter to: # {self.aprsfilter.filterstring}")

                # the spec says to use a comment character at the front of our filter string when used indepdently of a login string (to APRS-IS)
                self.send('#' + self.aprsfilter.filterstring)

            self.logger.debug(f"{self.server.nickname} filter_thread:  waiting...")
            self.okay.wait(20)

        self.logger.debug(f"{self.server.nickname} filter_thread has now ended")
        return None


    def getAprsFilter(self)->str:
        """
        This will construct the APRS-IS filter string that can be sent to the APRS-IS server for limiting the amount of 
        packets that the APRS-IS server returns.
        """

        # our filter list
        filterlist = []

        # get our GPS position
        gpsposition = self.getPosition()
        if not gpsposition["isvalid"]:
            self.logger.warning(f"{self.server.nickname} getAprsFilter.  GPS position was not valid.")
            return None;

        if self.taptype == 'aprs':
            # our location
            #self.logger.debug(f"{self.server.nickname} getAprsFilter: {gpsposition=}")
            radiusfilter = 'r/' + str(gpsposition["latitude"]) + '/' + str(gpsposition["longitude"]) + '/' + str(self.configuration["aprsisradius"]) if gpsposition["isvalid"] else None
            if radiusfilter:
                filterlist.append(radiusfilter)

            # check for the custom filter 
            if "customfilter" in self.configuration:
                if len(self.configuration["customfilter"]) > 0:
                    filterlist.append(self.configuration["customfilter"])

            # this station's filter
            call = self.station_callsign.split("-")[0]
            stationfilter = 'e/' + call + '*' if self.station_callsign else None
            if stationfilter:
                filterlist.append(stationfilter)
            
            # active beacon callsign and radius filters
            beacons = self.configuration["activebeacons"]["callsigns"] if "callsigns" in self.configuration["activebeacons"] else None
            beaconfilter = 'b' + ''.join('/' + b for b in beacons) if beacons else None
            friendfilter = ''.join('f/' + b + '/50 ' for b in beacons) if beacons else None
            if beacons:
                filterlist.append(beaconfilter)
                filterlist.append(friendfilter)

        elif self.taptype == 'cwop':
            # for cwop, we really just want a radius and weather packets filter.  So we average the position of this station with where all the landing locations are at.

            landings = self.configuration["landinglocations"]["landings"] if "landings" in self.configuration["landinglocations"] else None

            # try to compute an average position between this stations's GPS coords and the coordinates for any landing locations (from active flights).
            i = 0
            if gpsposition["isvalid"]:
                sum_x = float(gpsposition["longitude"])
                sum_y = float(gpsposition["latitude"]) # latitude is the y-axis
                i += 1

            if landings:
                for x,y in landings:
                    sum_x += x
                    sum_y += y
                    i += 1
            if i:
                avg_x = sum_x / float(i)
                avg_y = sum_y / float(i)
                filterlist.append(f" r/{avg_y:.6f}/{avg_x:.6f}/{str(self.configuration['aprsisradius'])}")

                # Commenting this out because adding the "t/w" filter string to CWOP connections seems to override the radius filter.
                #filterlist.append(" t/w")

        return filterlist


    ##################################################
    # acquire the location of this station (i.e. GPS coords)
    ##################################################
    def getPosition(self)->dict:

        # default position object
        gpsposition = {
                "altitude" : 0.0,
                "latitude" : 0.0,
                "longitude" : 0.0,
                "bearing" : 0.0,
                "speed_mph" : 0.0,
                "isvalid" : False,
                "source" : None
                }


        # is this a mobile or stationary station?
        is_mobile = True if self.configuration["mobilestation"] == "true" else False

        # if stationary, then check (and potentially reuse) our prior determined location.
        if not is_mobile:
            if self.stationLocation:
                if self.stationLocation["isvalid"]:
                    return self.stationLocation

        try:
            # Wait for a little while to try and get our GPS location from the GPS Poller process
            # update:  setting this to try only a few times (trycount < 2) to get the GPS location from the GPS Poller process (which gets it from GPSD)
            #          only once.  If there's not a 3D fix, then we "punt" and let try and query our last known position from the database
            nofix = True
            trycount = 0
            while nofix == True and trycount < 2:

                # This retreives the latest GPS data (assuing GPS Poller process is running)
                g = self.configuration["position"]


                if "gpsdata" in g:
                    position = g["gpsdata"]

                    if "mode"  in position:
                        mode = int(position["mode"])

                        if mode == 3:

                            # we've got a 3D position fix!!
                            nofix = False
                            gpsposition["altitude"] = float(position["altitude"])
                            gpsposition["latitude"] = float(position["lat"])
                            gpsposition["longitude"] = float(position["lon"])
                            gpsposition["bearing"] = float(position["bearing"])
                            gpsposition["speed_mph"] = float(position["speed_mph"])
                            gpsposition["isvalid"] = True
                            gpsposition["source"] = "gps"

                            # sanity check
                            if gpsposition["latitude"] == 0 or gpsposition["longitude"] == 0:
                                gpsposition["isvalid"] = False

                if nofix == True:


                    # we're still waiting on the GPS to obtain a fix so we wait this long
                    seconds = round((1.2) ** trycount) if trycount < 22 else (1.2) ** 22
                    self.logger.debug(f"{self.server.nickname} Waiting on GPS fix ({trycount=}): {seconds}s")
                    self.okay.wait(seconds)

                    # increment our try counter
                    trycount += 1


        except (GracefulExit, KeyboardInterrupt, SystemExit) as e:
            return gpsposition


        # if we still don't have a GPS fix, then we query the database for our last known location
        if nofix == True:

            self.logger.debug("Unable to acqure 3D fix from GPS, querying database for last known location")

            #try: 
            # connect to the database
            dbconn = queries.connectToDatabase(db_connection_string = habconfig.dbConnectionString, logger = self.logger)

            # if the connection was successful, then call the GPS position function
            if dbconn is not None:

                # query the database for our last known location
                gpsposition = queries.getGPSPosition(dbconn = dbconn, logger = self.logger)

                # close the database connection
                dbconn.close()
            #except (KeyboardInterrupt, SystemExit) as e:
            #    self.logger.debug(f"{self.server.nickname} getgpsposition-database part:  got signal to exit")
            #    self.okay.set()
            #    if dbconn is not None:
            #        dbconn.close()

        # set this station's location
        if not is_mobile and gpsposition["isvalid"]:
            self.stationLocation = gpsposition
        else:
            self.stationLocation = None

        # return the gpsposition object
        return gpsposition



##################################    
# the Direwolf KISS connector
##################################    
@dataclass
class DirewolfKISS(PacketStream):

    # The configuration dictionary
    configuration: dict = None

    def __post_init__(self)->None:
        super().__post_init__()

        if self.configuration is None:
            raise TypeError('configuration cannot be None')

        # are we listening to ka9q-radio?
        self.is_ka9qradio = True if self.configuration["ka9qradio"] == "true" or self.configuration["ka9qradio"] == True else False

        # Hard set this to not igate.  We don't want to read packets from Direwolf's KISS port, then tranfer them to the AprsisStream object, where they're ultimately sent to 
        # the locally running aprsc instance or directly to the APRS-IS cloud.  That's because when direwolf is running (i.e. connected to an SDR), then it's already igating heard 
        # packets to the locally running aprsc instance.  Sooo, we don't need to do that here as well.
        #
        # However, in the case when we're going to both listen to a ka9q-radio source as well as have direwolf connected to a local SDR, igating then becomes more complicated.  In that situation
        # we would like to igate packets from both sources, but in order to do that, we have to disable igating within the direwolf configuration file then enable igating here, instead.
        self.igating = True if self.is_ka9qradio else False

        # define queues for handing packets for igating (if enabled) and to the database
        if self.igating:
            queuelist = [ (self.configuration["igatingqueue"], "igating queue"), (self.configuration["databasequeue"], "database queue") ]
        else:
            queuelist = [ (self.configuration["databasequeue"], "database queue") ]
 
        # for KISS frames the delimiter is the FEND byte
        self.delimiter = b'\xc0'

        # Our KISS processing object
        self.kiss = kissprocessor.KISSProcessor(loggingqueue = self.configuration["loggingqueue"])

        # this packet handler should decode the KISS packet, then save it to both the igating and database queues
        readhandler = PacketHandler(q=queuelist, pfilter=None, transform=self.transform)
        self.setReadHandlers([readhandler])


    def transform(self, packetbytes: bytes)->Packet:
        """
        Used to convert packets read from the direwolf KISS port to a Packet object
        """

        self.logger.debug(f"{self.server.nickname}: in transform with {packetbytes=}")

        # if nothing was given to us, then we return nothing
        if not packetbytes:
            return None


        # the direwolf channel that this packet was [potentially] heard from
        channel = None

        # try to decode the KISS frame and get a Packet object back
        packet = self.kiss.decode(packetbytes)
        if packet:
            if "channel" in packet.properties:
                channel = packet.properties["channel"]

        self.logger.debug(f"{self.server.nickname}: {packet=}, {channel=}")

        if packet == None or channel == None:
            return None

        # the direwolf channel to frequency mapping
        freqmap = self.configuration["direwolffreqmap"] if "direwolffreqmap" in self.configuration else None
        self.logger.debug(f"{self.server.nickname}: {freqmap=}")

        # the channel used for direwolf beaconing when using an external radio
        xmitchannel = self.configuration["xmit_channel"] if "xmit_channel" in self.configuration else None
        self.logger.debug(f"{self.server.nickname}: {xmitchannel=}")

        if xmitchannel != None:
            if xmitchannel == channel:
                # add the frequency we found, in this case it's an external radio and we have no idea what frequency it's been tuned too
                packet.frequency = None

                # update the source name
                packet.source = self.server.nickname

                self.logger.debug(f"{self.server.nickname}: found external radio channel for packet: {packet=}")
                return packet

        # if there was a frequency map, then we try to find the direwolf channel and frequency it was heard on.
        if freqmap:
            for ch,freq in freqmap:
                if ch == channel:

                    # add the frequency we found
                    packet.frequency =  freq

                    # update the source name
                    packet.source = self.server.nickname

                    self.logger.debug(f"{self.server.nickname}: found direwolf channel for packet: {packet=}")
                    return packet

        # if we're here, then nothing was decoded
        self.logger.debug(f"{self.server.nickname}: nothing decoded in transform")
        return None






##################################################
# the connectorTap process.  This is intended to be run as a sub-process through Python's multiprocessing.
##################################################
def connectorTap(configuration, typeoftap = 'aprs'):

    # signal handler for catching kills
    signal.signal(signal.SIGTERM, local_signal_handler)

    # setup logging
    logger = logging.getLogger(f"{__name__}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    loggingqueue = configuration["loggingqueue"]

    # check if a logging queue was supplied
    if loggingqueue is not None:
        handler = QueueHandler(loggingqueue)
        logger.addHandler(handler)

    if typeoftap == 'rtp':
        # start the RTP + AX.25 connection to the ka9q-radio backend

        # create a new RTP connection object
        server = Server(hostname="239.85.210.44", portnum=5004, nickname="RTP Multicast")
        tap = RTPStream(server = server, loggingqueue = configuration["loggingqueue"], stopevent = configuration["stopevent"], configuration = configuration)

    elif typeoftap == 'aprs' or typeoftap == 'cwop':

        # if a callsign was provided then use it, otherwise generate a random one.
        if configuration["callsign"]:
            mycallsign = randomCallsign(configuration["callsign"])
        else:
            mycallsign = configuration["callsign"] if "callsign" in configuration and configuration["callsign"] != '' else randomCallsign("EOSS")

        logger.debug(f"connectorTap: using {mycallsign} for {typeoftap} tap")

        # aprsis server name
        aprsserver = configuration["cwopserver"] if typeoftap == "cwop" else configuration["aprsisserver"]

        # we don't need a passcode for read-only connections
        passcode = None

        # credentials
        mycreds = CredentialSet(callsign = mycallsign, passcode = passcode, name='eosstracker', version='1.5')
        logger.debug(f"connectorTap: using {mycreds=}")

        # server
        server = Server(hostname = aprsserver, portnum = 14580, nickname = aprsserver)

        # create a new APRS-IS connection object
        tap = AprsisStream(
                configuration=configuration, 
                loggingqueue = configuration["loggingqueue"], 
                stopevent = configuration["stopevent"], 
                creds = mycreds, 
                taptype = typeoftap, 
                server = server)

    elif typeoftap == 'dwkiss':
        server = Server(hostname="127.0.0.1", portnum=8001, nickname="direwolf")
        logger.info(f"connectorTap: starting direwolf kiss tap")
        tap = DirewolfKISS(configuration=configuration, loggingqueue = configuration["loggingqueue"], stopevent = configuration["stopevent"], server = server)

    try:
        tap.run()
    except (GracefulExit, KeyboardInterrupt, SystemExit) as e:
        logger.debug(f"connectorTap({typeoftap}) caught keyboardinterrupt")
        configuration["stopevent"].set()
        tap.disconnect()
    finally:
        tap.disconnect()

    logger.info(f"connectorTap:  {typeoftap} tap ended with {server}")

