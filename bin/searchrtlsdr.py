##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2021 Jeff Deaton (N6BA)
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
    { "vendor": 0x0bda, "product": 0x2832, "prefix":"rtl", "description": "Generic RTL2832U" },
    { "vendor": 0x0bda, "product": 0x2838, "prefix":"rtl", "description": "Generic RTL2832U OEM" },
    { "vendor": 0x0413, "product": 0x6680, "prefix":"rtl", "description": "DigitalNow Quad DVB-T PCI-E card" },
    { "vendor": 0x0413, "product": 0x6f0f, "prefix":"rtl", "description": "Leadtek WinFast DTV Dongle mini D" },
    { "vendor": 0x0458, "product": 0x707f, "prefix":"rtl", "description": "Genius TVGo DVB-T03 USB dongle (Ver. B)" },
    { "vendor": 0x0ccd, "product": 0x00a9, "prefix":"rtl", "description": "Terratec Cinergy T Stick Black (rev 1)" },
    { "vendor": 0x0ccd, "product": 0x00b3, "prefix":"rtl", "description": "Terratec NOXON DAB/DAB+ USB dongle (rev 1)" },
    { "vendor": 0x0ccd, "product": 0x00b4, "prefix":"rtl", "description": "Terratec Deutschlandradio DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00b5, "prefix":"rtl", "description": "Terratec NOXON DAB Stick - Radio Energy" },
    { "vendor": 0x0ccd, "product": 0x00b7, "prefix":"rtl", "description": "Terratec Media Broadcast DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00b8, "prefix":"rtl", "description": "Terratec BR DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00b9, "prefix":"rtl", "description": "Terratec WDR DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00c0, "prefix":"rtl", "description": "Terratec MuellerVerlag DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00c6, "prefix":"rtl", "description": "Terratec Fraunhofer DAB Stick" },
    { "vendor": 0x0ccd, "product": 0x00d3, "prefix":"rtl", "description": "Terratec Cinergy T Stick RC (Rev.3)" },
    { "vendor": 0x0ccd, "product": 0x00d7, "prefix":"rtl", "description": "Terratec T Stick PLUS" },
    { "vendor": 0x0ccd, "product": 0x00e0, "prefix":"rtl", "description": "Terratec NOXON DAB/DAB+ USB dongle (rev 2)" },
    { "vendor": 0x1554, "product": 0x5020, "prefix":"rtl", "description": "PixelView PV-DT235U(RN)" },
    { "vendor": 0x15f4, "product": 0x0131, "prefix":"rtl", "description": "Astrometa DVB-T/DVB-T2" },
    { "vendor": 0x15f4, "product": 0x0133, "prefix":"rtl", "description": "HanfTek DAB+FM+DVB-T" },
    { "vendor": 0x185b, "product": 0x0620, "prefix":"rtl", "description": "Compro Videomate U620F"},
    { "vendor": 0x185b, "product": 0x0650, "prefix":"rtl", "description": "Compro Videomate U650F"},
    { "vendor": 0x185b, "product": 0x0680, "prefix":"rtl", "description": "Compro Videomate U680F"},
    { "vendor": 0x1b80, "product": 0xd393, "prefix":"rtl", "description": "GIGABYTE GT-U7300" },
    { "vendor": 0x1b80, "product": 0xd394, "prefix":"rtl", "description": "DIKOM USB-DVBT HD" },
    { "vendor": 0x1b80, "product": 0xd395, "prefix":"rtl", "description": "Peak 102569AGPK" },
    { "vendor": 0x1b80, "product": 0xd397, "prefix":"rtl", "description": "KWorld KW-UB450-T USB DVB-T Pico TV" },
    { "vendor": 0x1b80, "product": 0xd398, "prefix":"rtl", "description": "Zaapa ZT-MINDVBZP" },
    { "vendor": 0x1b80, "product": 0xd39d, "prefix":"rtl", "description": "SVEON STV20 DVB-T USB & FM" },
    { "vendor": 0x1b80, "product": 0xd3a4, "prefix":"rtl", "description": "Twintech UT-40" },
    { "vendor": 0x1b80, "product": 0xd3a8, "prefix":"rtl", "description": "ASUS U3100MINI_PLUS_V2" },
    { "vendor": 0x1b80, "product": 0xd3af, "prefix":"rtl", "description": "SVEON STV27 DVB-T USB & FM" },
    { "vendor": 0x1b80, "product": 0xd3b0, "prefix":"rtl", "description": "SVEON STV21 DVB-T USB & FM" },
    { "vendor": 0x1d19, "product": 0x1101, "prefix":"rtl", "description": "Dexatek DK DVB-T Dongle (Logilink VG0002A)" },
    { "vendor": 0x1d19, "product": 0x1102, "prefix":"rtl", "description": "Dexatek DK DVB-T Dongle (MSI DigiVox mini II V3.0)" },
    { "vendor": 0x1d19, "product": 0x1103, "prefix":"rtl", "description": "Dexatek Technology Ltd. DK 5217 DVB-T Dongle" },
    { "vendor": 0x1d19, "product": 0x1104, "prefix":"rtl", "description": "MSI DigiVox Micro HD" },
    { "vendor": 0x1f4d, "product": 0xa803, "prefix":"rtl", "description": "Sweex DVB-T USB" },
    { "vendor": 0x1f4d, "product": 0xb803, "prefix":"rtl", "description": "GTek T803" },
    { "vendor": 0x1f4d, "product": 0xc803, "prefix":"rtl", "description": "Lifeview LV5TDeluxe" },
    { "vendor": 0x1f4d, "product": 0xd286, "prefix":"rtl", "description": "MyGica TD312" },
    { "vendor": 0x1f4d, "product": 0xd803, "prefix":"rtl", "description": "PROlectrix DV107669" },
    { "vendor": 0x1d50, "product": 0x6089, "prefix": "hackrf", "description": "OpenMoko, Inc. Great Scott Gadgets HackRF One SDR" },
    { "vendor": 0x1d50, "product": 0x60a1, "prefix": "airspy", "description": "Airspy" }
]

def getUSBDevices():

    # Probably need to fix this to be more dynamic...
    device_no = { "rtl": 0, "hackrf" : 0, "airspy" : 0}

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
                rtl = { "rtl" : device_no[sdr["prefix"]], "manufacturer" : m, "product" : p, "serialnumber" : s, "description" : sdr["description"], "prefix" : sdr["prefix"]}

                # Check if the RTLSDR is using a serial number string that contains "adsb".
                #     The idea being, not to use any SDR attached that is to be used for ADS-B reception instead.
                if "adsb" in s.lower():
                    print "Skipping SDR: ", rtl
                else:
                    sdrs.append(rtl)

                device_no[sdr["prefix"]] += 1
        return sdrs

