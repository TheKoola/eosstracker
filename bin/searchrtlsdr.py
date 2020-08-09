##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020 Jeff Deaton (N6BA)
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

import usb.core
import usb.util


# This list is from the librtlsdr and osmosdr projects. https://osmocom.org/projects/rtl-sdr/wiki/Rtl-sdr.
known_devices = [
    { "vendor": 0x0bda, "product": 0x2832, "description": "Generic RTL2832U" },
    { "vendor": 0x0bda, "product": 0x2838, "description": "Generic RTL2832U OEM" },
    { "vendor": 0x0413, "product": 0x6680, "description": "DigitalNow Quad DVB-T PCI-E card" },
    { "vendor": 0x0413, "product": 0x6f0f, "description": "Leadtek WinFast DTV Dongle mini D" },
    { "vendor": 0x0458, "product": 0x707f, "description": "Genius TVGo DVB-T03 USB dongle (Ver. B)" },
    { "vendor": 0x0ccd, "product": 0x00a9, "description": "Terratec Cinergy T Stick Black (rev 1)" },
    { "vendor": 0x0ccd, "product": 0x00b3, "description": "Terratec NOXON DAB/DAB+ USB dongle (rev 1)" },
    { "vendor": 0x0ccd, "product": 0x00b4, "description": "Terratec Deutschlandradio DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00b5, "description": "Terratec NOXON DAB Stick - Radio Energy" },
    { "vendor": 0x0ccd, "product": 0x00b7, "description": "Terratec Media Broadcast DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00b8, "description": "Terratec BR DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00b9, "description": "Terratec WDR DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00c0, "description": "Terratec MuellerVerlag DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00c6, "description": "Terratec Fraunhofer DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00d3, "description": "Terratec Cinergy T Stick RC (Rev.3)" },
    { "vendor": 0x0ccd, "product": 0x00d7, "description": "Terratec T Stick PLUS" },
    { "vendor": 0x0ccd, "product": 0x00e0, "description": "Terratec NOXON DAB/DAB+ USB dongle (rev 2)" },
    { "vendor": 0x1554, "product": 0x5020, "description": "PixelView PV-DT235U(RN)" },
    { "vendor": 0x15f4, "product": 0x0131, "description": "Astrometa DVB-T/DVB-T2" },
    { "vendor": 0x15f4, "product": 0x0133, "description": "HanfTek DAB+FM+DVB-T" },
    { "vendor": 0x185b, "product": 0x0620, "description": "Compro Videomate U620F"},
    { "vendor": 0x185b, "product": 0x0650, "description": "Compro Videomate U650F"},
    { "vendor": 0x185b, "product": 0x0680, "description": "Compro Videomate U680F"},
    { "vendor": 0x1b80, "product": 0xd393, "description": "GIGABYTE GT-U7300" },
    { "vendor": 0x1b80, "product": 0xd394, "description": "DIKOM USB-DVBT HD" },
    { "vendor": 0x1b80, "product": 0xd395, "description": "Peak 102569AGPK" },
    { "vendor": 0x1b80, "product": 0xd397, "description": "KWorld KW-UB450-T USB DVB-T Pico TV" },
    { "vendor": 0x1b80, "product": 0xd398, "description": "Zaapa ZT-MINDVBZP" },
    { "vendor": 0x1b80, "product": 0xd39d, "description": "SVEON STV20 DVB-T USB & FM" },
    { "vendor": 0x1b80, "product": 0xd3a4, "description": "Twintech UT-40" },
    { "vendor": 0x1b80, "product": 0xd3a8, "description": "ASUS U3100MINI_PLUS_V2" },
    { "vendor": 0x1b80, "product": 0xd3af, "description": "SVEON STV27 DVB-T USB & FM" },
    { "vendor": 0x1b80, "product": 0xd3b0, "description": "SVEON STV21 DVB-T USB & FM" },
    { "vendor": 0x1d19, "product": 0x1101, "description": "Dexatek DK DVB-T Dongle (Logilink VG0002A)" },
    { "vendor": 0x1d19, "product": 0x1102, "description": "Dexatek DK DVB-T Dongle (MSI DigiVox mini II V3.0)" },
    { "vendor": 0x1d19, "product": 0x1103, "description": "Dexatek Technology Ltd. DK 5217 DVB-T Dongle" },
    { "vendor": 0x1d19, "product": 0x1104, "description": "MSI DigiVox Micro HD" },
    { "vendor": 0x1f4d, "product": 0xa803, "description": "Sweex DVB-T USB" },
    { "vendor": 0x1f4d, "product": 0xb803, "description": "GTek T803" },
    { "vendor": 0x1f4d, "product": 0xc803, "description": "Lifeview LV5TDeluxe" },
    { "vendor": 0x1f4d, "product": 0xd286, "description": "MyGica TD312" },
    { "vendor": 0x1f4d, "product": 0xd803, "description": "PROlectrix DV107669" }
]

def getUSBDevices():
    i = 0
    sdrs = []

    # Get a list of usb devices
    devices = usb.core.find(find_all=True)

    if devices is None:

        # If no devies are found then return an empty list
        return []

    else:
        # Lambda function to determine if a USB device is in the know_devices list above
        isSDR = lambda vid, pid : next((item for i, item in enumerate(known_devices) if item["vendor"] == vid and item["product"] == pid), None)

        # Loop through each USB device found
        for dev in devices:

            # Check if this is an RTL-SDR device
            sdr = isSDR(dev.idVendor, dev.idProduct)

            if sdr:
                # Get the device info
                m = usb.util.get_string(dev, dev.iManufacturer)
                p = usb.util.get_string(dev, dev.iProduct)
                s = usb.util.get_string(dev, dev.iSerialNumber)

                # Set these strings to "" instead of defaulting to None if there's nothing returned.  
                s = s if s else ""
                p = p if p else ""
                m = m if m else ""
                
                # Create a dict for this device
                rtl = { "rtl" : i, "manufacturer" : m, "product" : p, "serialnumber" : s, "description" : sdr["description"]}

                # Check if the RTLSDR is using a serial number string that contains "adsb".
                #     The idea being, not to use any SDR attached that is to be used for ADS-B reception instead.
                if "adsb" in s.lower():
                    print "Skipping SDR: ", rtl
                else:
                    sdrs.append(rtl)

                i = i+1
        return sdrs

