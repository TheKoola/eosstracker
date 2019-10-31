#!/usr/bin/python

# Import some modules that we'll need
import pyModeS as pms
from pyModeS.extra.tcpclient import TcpClient
import sys
import csv
from datetime import datetime

class ADSBClient(TcpClient):
    def __init__(self, icao, host, port, rawtype):
        super(ADSBClient, self).__init__(host, port, rawtype)

        # Internal variables for this class
        self.last_msg = None
        self.last_even_odd = None
        self.last_ts = None

        # Convert the ICAO number provided to upper case.  That way we don't care what case the ICAO was given in.  ;)
        self.icao = icao.upper()

        # Print out a CSV header
        header = ['timestamp', 'icao', 'tailnumber', 'type_code', 'altitude_ft', 'lat', 'lon', 'speed_mph', 'heading', 'rate_of_climb_ftm', 'speed_type', 'direction_source', 'rate_of_climb_source', 'hex_message_string']
        csv.writer(sys.stdout, quoting=csv.QUOTE_NONNUMERIC).writerow(header)

    def handle_messages(self, messages):
        # csvwriter object that's pointed to STDOUT
        csvout = csv.writer(sys.stdout, quoting=csv.QUOTE_NONNUMERIC)

        # Loop any messages and their timestamps
        for msg, ts in messages:
            if len(msg) != 28:  # wrong data length
                continue

            # The downlink format
            df = pms.df(msg)

            # If this message is not a downlink format number of 17, then we skip this iteration of the loop
            if df != 17:  
                continue

            # Are there CRC issues with this message?  If yes, then skip this iteration of the loop
            if pms.crc(msg) !=0:  # CRC fail
                continue

            # The ICAO identifier for this message
            icao = pms.adsb.icao(msg)

            # Is this message even or odd?  1 for odd, 0 for even
            even_odd = pms.adsb.oe_flag(msg)

            # Don't do anything unless this is the ICAO we're looking for
            if icao == self.icao:

                # The type code for the message (not the same as the MSG number output from dump1090 on port 30003
                tc = pms.adsb.typecode(msg)

                # Initilize some variables
                callsign = None
                altitude = None
                msg_odd = None
                msg_even = None
                lat = None
                lon = None
                t_even = None
                t_odd = None
                speed = None
                heading = None
                rate_of_climb = None
                speed_type = None
                dir_source = None
                roc_source = None




                # If this type code if < 5 then get the callsign or tail number
                if tc < 5:
                    callsign = pms.adsb.callsign(msg)

                # For type codes between 9 and 18, we can get the altitude and position
                elif 9 <= tc <= 18 or 20 <= tc <= 22:

                    # The altitude
                    altitude = pms.adsb.altitude(msg)


                    # If structure to determine if the current message is odd or even and then determine what the last message (with a type code between 9 and 18) was (i.e. was it even or odd)
                    if even_odd:
                        msg_odd = msg
                        t_odd = ts
                        if self.last_msg and not self.last_even_odd:
                            msg_even = self.last_msg
                            t_even = self.last_ts
                        else:
                            msg_even = None
                            t_even = None
                    else:
                        msg_even = msg
                        t_even = ts
                        if self.last_msg and self.last_even_odd:
                            msg_odd = self.last_msg
                            t_odd = self.last_ts
                        else:
                            msg_odd = None
                            t_odd = None

                    # If we've got even's and odd's and timestamps all the way around then get the position
                    if msg_even and msg_odd and t_even and t_odd:
                        lat, lon = pms.adsb.airborne_position(msg_even, msg_odd, t_even, t_odd)

                    # Save this message for the next loop iteration
                    self.last_msg = msg
                    self.last_even_odd = pms.adsb.oe_flag(msg)
                    self.last_ts = ts

                # For type codes that are = 19
                elif tc == 19:

                    # The velocity structure
                    # (int, float, int, string, string, string): 
                    #   speed (kt),
                    #   ground track or heading (degree),
                    #   rate of climb/descent (ft/min), 
                    #   speed type ('GS' for ground speed, 'AS' for airspeed),
                    #   direction source ('true_north' for ground track / true north as refrence, 'mag_north' for magnetic north as reference),
                    #   rate of climb/descent source ('Baro' for barometer, 'GNSS' for GNSS constellation).
                    speed, heading, rate_of_climb, speed_type, dir_source, roc_source = pms.adsb.airborne_velocity(msg, rtn_sources=True)

                    # convert from kts to mph
                    speed = round(speed * 1.15077945)


                # Convert the time stamp from epoch seconds to a datetime structure
                timestamp = datetime.fromtimestamp(ts)

                # Finally print out this row as CSV to standard out
                csvout.writerow([timestamp.strftime('%m-%d-%Y %H:%M:%S'), icao, callsign, tc, altitude, lat, lon, speed, heading, rate_of_climb, speed_type, dir_source, roc_source, msg])


def main():
    # EOSS ICAO number for reference
    #icao="A59EE9"
    
    # If we don't have enough arguments, then print out the usage and return
    if len(sys.argv) > 1:
        icao = str(sys.argv[1])
    else:
        print("Usage:  %s <icao hex string>" % sys.argv[0])
        return 0

    try:
        # Run the class, connecting to the "beast" output port on the localhost
        client = ADSBClient(icao=icao, host='localhost', port=30005, rawtype='beast')
        client.run()

    except KeyboardInterrupt:
        print("Done.")


if __name__ == '__main__':
    main()
