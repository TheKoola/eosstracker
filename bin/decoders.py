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

import struct
import time
import kissprocessor
from packet import Packet


#####################################
# parse an incoming Realtime Transport Protocol packet
#####################################
def parse_RTP(packet: bytes)->dict:
    """
    Parse through the RTP packet returning a dictionary with populated fields.  The "payload" key in the returned dictionary contains the unwrapped RTP packet content.

    The packet argument should be a byte string (i.e. it was just read from a network socket).

    """

    # if the packet isn't longer than the minimum header field, then return nothing
    if len(packet) < 12:
        return None

    # where we store the results
    result = {}
    result['csrc'] = []

    # convert first 32 bits to host-based byte ordering (vs. network-based ordering)
    chunk = struct.unpack('!I', packet[0:4])[0]

    # First byte of the RTP header
    result['version'] = (chunk >> 30) & 0x03
    result['padding'] = (chunk >> 29) & 0x01
    result['extension'] = (chunk >> 28) & 0x01
    result['csrc_count'] = (chunk >> 24) & 0x0f 

    # Second byte of the RTP header
    result['marker'] = (chunk >> 23) & 0x01
    result['payload_type'] = (chunk >> 16) & 0x7f

    # Third and fourth bytes of the RTP header (16 bits)
    result['sequence_number'] = (chunk & 0xffff)

    # Bytes 4-8 are the timestamp (32 bits)
    result['timestamp'] = struct.unpack('!I', packet[4:8])[0]

    # Bytes 8-12 are the ssrc (synchronization source identifier), 32 bits
    result['ssrc'] = struct.unpack('!I', packet[8:12])[0]

    # loop through the csrc's (contributing source IDs), 32 bits each
    for i in range(result['csrc_count']):
        start = 12 + 4 * i  
        end = start + 4  # end is start + 32 bits (i.e. 4 bytes)

        # append the results to a list for the csrc's
        result['csrc'].append(struct.unpack('!I', packet[start:end]))

    # If there was an extension indicated, then we need to capture that and set the location for where the payload starts
    if result['extension']:

        # The starting location for the extention header
        ext_start = 12 + 4 * result['csrc_count']

        # Convert the first 32bits to host-based byte ordering
        chunk = struct.unpack('!I', packet[extstart:ext_start+4])[0]
        
        # Now mask off the extension header ID and the header length
        result['ext_header_id'] = (chunk >> 16) & 0xffff
        result['ext_header_len'] = chunk & 0xffff

        # Mark the location at which the payload starts
        payloadstart = ext_start + 4 + result['ext_header_len']

        # Now convert each uint32 of the header by looping through each 32bit int
        extensionheader = bytearray()
        for i in range(result['ext_header_len']):

            # Convert each uint32 of the extension header to host-based byte ordering
            chunk = struct.unpack('!I', packet[extstart+4+i:extstart+8+i])[0]

            # now append the resulting integer to the extensionheader bytearray
            extensionheader.append(chunk)

        # update our results with the extension header data
        result['ext_header'] = extensionheader

    else:
        payloadstart = 12 + 4 * result['csrc_count']

    # If padding was added, then we need to adjust the end of the payload to trim off the padding
    if result['padding']:

        # need to determine how many bytes were added to the end of the packet for padding
        npaddingbytes = struct.unpack('!B', packet[-1])[0]
        payloadend = npaddingbytes + 1

        # The rest of the packet is the payload
        result['payload'] = packet[payloadstart:-payloadend]

    else:

        # The rest of the packet is the payload
        result['payload'] = packet[payloadstart:]

    # return the resulting decoded RTP packet
    return result


#####################################
# This will parse an AX.25 address (i.e. a callsign) and return it's string represention
#####################################
def parse_ax25address(address: bytes)->str:
    """
    Convert ax.25 address. 

    The address argument should be a byte string.
    """
    
    # we need 7 characters/bytes
    if len(address) < 7:
        return None

    # to get a station name, you have to right-shift each byte by 1 bit, then append them into a byte array, and ultimately convert to a UTF-8 string
    try:
        name = (b''.join([bytes([a >> 1]) for a in address[0:6]])).decode('utf-8', errors='ignore').strip()
    except Exception as e:
        return None

    # the SSID
    ssid = (address[6] >> 1) & 0xf

    # if the ssid is '0' then we ignore and just return the station callsign
    if ssid:
        callsign = '{}-{}'.format(name, ssid)
    else:
        callsign = name

    return callsign


#####################################
# parse an entire AX25 frame returning a dictionary with the parsed output
#####################################
def parse_ax25(packet: bytes)->dict:
    """
    Parse an incoming AX25 packet returning a dictionary with populated fields

    The packet argument should be a byte string.
    """

    # if the ax25 packet isn't longer than the minimum packet size, then return nothing
    if len(packet) < 14:
        return None

    # where we store the results
    results = {}
    results['digipeaters'] = []

    # The starting position of the frame
    framestart = 0

    # the flag field for an AX.25 frame should be 0x7e
    if packet[0] == 0x7e:
        framestart += 1

    # The destination and source addresses
    results['destination'] = parse_ax25address(packet[framestart:framestart+7])
    results['source'] = parse_ax25address(packet[framestart+7:framestart+14])

    # HDLC Extention bit for the source address field
    extbit = packet[framestart+13] & 0x01

    # Starting point for the control field
    ctrl_start = framestart + 14

    #If the extension bit is '0', then that means we need to process through some digipeaters
    if extbit == 0:

        # now loop through all the potential digipeaters there can be up to 8 of them
        for i in range(8):
            
            # starting and ending locations for the digipeater within the packet
            start = framestart + 14 + i * 7
            end = start + 7

            #If we're looking past the end of this packet then break out of this loop
            if end > len(packet):
                break

            # the digipeater station address
            digi = parse_ax25address(packet[start:end])
            
            # If we got a station address from the address decoder then process, if "None" then break out of this loop
            if digi:
                results['digipeaters'].append(digi)

                # Now increment our ctrl_start counter by 7
                ctrl_start = end

                # If this address has the HDLC extension bit set then we break out of this loop
                if packet[end - 1] & 0x01:
                    break
            else:
                break

    # The control field and frame type
    results['control_field'] = packet[ctrl_start]
    if (results['control_field'] & 0x01) == 0:
        results['frame_type'] = 'I Frame'
    elif (results['control_field'] & 0x03) == 1:
        results['frame_type'] = 'S Frame'
    elif (results['control_field'] & 0x03) == 0x03:
        results['frame_type'] = 'U Frame'
    else:
        results['frame_type'] = 'unknown'

    # Determine if this is an unnumbered frame (APRS only uses unnumbered info frames)
    results['is_aprs'] = (results['control_field'] & 0x03) == 0x03 and results['frame_type'] == 'U Frame'

    # if this is an APRS frame, then we perform additional parsing/processing
    if results['is_aprs']:

        # The protocol_id field
        results['protocol_id'] = packet[ctrl_start + 1]

        # strip a couple of bytes off the end of the packet
        end = -2

        # if the last byte is the flag (0x7e) byte then we need to strip that off too
        if packet[-1] == 0x7e:
            end -= 1

        # we remove the last few characters from the rest of the packet then strip off any remaining not wanted characters from the end (ex. new lines, etc.)
        #results['information'] = packet[ctrl_start + 2:end].decode('utf-8', errors='ignore').rstrip('\n\r ' + chr(0xff))
        results['information'] = packet[ctrl_start + 2:end].rstrip(b'\r\n')

        # Walk through the digipeaters list to find the last one on the list, then flag that one with a trailing "*" as that's likely the last transmitting station.
        taggedlist = []
        firstone = True

        # we loop through the digipeaters in reverse order as it's easier to add the "*" to the transmitting digipeater that way.
        for digi in results['digipeaters'][::-1]:

            # If it starts with 'WIDE', then we just append to the tagged list as is.
            if digi.startswith('WIDE'):
                taggedlist.append(digi)

            # else, if this is the first digipeater we've seen, then add an "*" to the end of it and append to our tagged list
            elif firstone:
                taggedlist.append(digi + "*")

                # Set the firstone flag to false as we've found the first digipeater in the list and don't want to trigger on any more.
                firstone = False

            # Otherwise, we just append the digi to our tagged list
            else:
                taggedlist.append(digi)

        # re-reverse our list so it's in correct order
        taggedlist = taggedlist[::-1]

        # At this point, we've got a successfully decoded APRS packet.  We add a timestamp that represents the "decoded time".
        results["decode_timestamp"] = int(time.time())

        # finally we construct the raw APRS packet string
        results['utf8text'] = results['source'] + ">" + results['destination'] + ''.join(',' + a for a in taggedlist) + ":" + results['information'].decode('utf-8', errors='ignore')

    return results


#####################################
# this a higher level function that will parse an AX.25 packet sent over an RTP stream
#####################################
def parse_RTP_AX25(packet_bytes: bytes)->Packet:
    """
    This will parse an RTP packet that contains an AX.25 packet that contans an APRS frame.  ;)
    """

    # Decode the RTP frame
    rtp = parse_RTP(packet_bytes)

    # if the packet was decoded successfully...
    if rtp:

        # only interested in payload type 96 as that's identifier used by KA9Q's backend RTP streamer
        if rtp['payload_type'] == 96:

            # Now parse the AX.25 payload 
            packet = parse_ax25(rtp['payload'])

            # if the parsing was successful
            if packet:

                # Set the frequency that the backend heard this packet on
                packet['frequency'] = int(rtp['ssrc']) * 1000 

                # if this was an APRS packet...
                if packet['is_aprs']:

                    # Set the packet source (i.e. where did this packet come from)
                    packet['packetsource'] = 'ka9q-radio'

                    # create a new packet object 
                    p = Packet(text=packet["utf8text"], frequency=packet["frequency"], source=packet["packetsource"])
                    p.properties = packet

                    # return the decoded APRS packet
                    return p

    # otherwise, we return None
    return None


##################################################
# generate an APRS-IS passcode for the supplied callsign.
##################################################
def genpasscode(callsign: str)->str:

    if type(callsign) is str:

        # split off the callsign from its SSID and convert to upper case
        callsign = callsign.split('-')[0].upper()

        # this is the initial integer that we use for XOR operations against each char of the callsign 
        code = 0x73e2 # decimal 29666

        # loop over each character within the callsign
        for i, char in enumerate(callsign):
            # left shift every other character (within the callsign) by 8 bits, then XOR that result with the prior result
            code = code ^ (ord(char) << (8 if not i % 2 else 0))

        # mask off every bit > 15 within this integer.:w
        return code & 0x7fff

    else:
        return None


