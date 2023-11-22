#!/usr/bin/python3

#######
# This is a simple script to create a render list for rectangular
# areas on a map.  
#
# It requires 4 arguments that define the rectangle
#  lower left (ll)  corner:  arg1 and arg2
#  upper right (ur) corner: arg3 and arg4
#
#  latlong-to-tile.py  ll_lat ll_long ur_lat ur_long
#
#
#######

import math
import sys
import os


#######
# deg2num
#
# This function returns x, y tile coords from a lat/long/zoom tuple
#######
def deg2num(lat_deg, lon_deg, zoom):
    """
    Just converts lat, lon, and zoom level into a tile number
    """
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n)
    return (xtile, ytile)


#######
# print_renderlist
#
# Loop through each zoom level...
# creating lower left and upper right tile numbers from lat/longs
# and spit out the render commands needed for OSM
#######
def print_renderlist(lat1, lon1, lat2, lon2):
    """
    This just loops through each zoom level, printing out the syntax for running 
    the command:  render_list ....
    """
    for zoom in range(2, 20): 
        lowerleft = deg2num(float(lat1), float(lon1), zoom)
        upperright = deg2num(float(lat2), float(lon2), zoom)
        print(f"render_list -a -m maps -t /eosstracker/maps -n 2 -z {zoom} -Z {zoom} -x {lowerleft[0]} -X {upperright[0]} -y {upperright[1]} -Y {lowerleft[1]}")


##################################################
# main function
##################################################
def main():

    # lower case name of this script without any extension
    thisprocname = os.path.basename(sys.argv[0].lower()).split(".")[0]

    # Make sure we've been given enough arguments
    if len(sys.argv) < 4:
        print(f"usage:  {thisprocname} <lat1> <lon1> <lat2> <lon2>")
        sys.exit()

    #### The lower left hand corner of our rectangle
    lat1 = sys.argv[1]
    lon1 = sys.argv[2]

    #### The upper right hand corner of our rectangle
    lat2 = sys.argv[3]
    lon2 = sys.argv[4]

    # Print out a header that contains the coordinates we were called with
    print(f"### {thisprocname} {lat1} {lon1} {lat2} {lon2}")
    print(f"###  lower left coords:   {lat1}, {lon1}")
    print(f"###  upper right coords:  {lat2}, {lon2}")

    # print out the render_list commands needed
    print_renderlist(lat1, lon1, lat2, lon2)

    

if __name__ == '__main__':
    main()

