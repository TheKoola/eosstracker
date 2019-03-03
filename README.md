# HAB Tracker

## Introduction ##

The HAB Tracker application aids tracking and recovery of high altitude balloons by leveraging open source software and the amateur radio 
[Automatic Packet Reporting System](http://www.aprs.org) to provide near real time status and location updates.

[Edge Of Space Sciences](https://www.eoss.org) uses the HAB Tracker application to help fulfill their mission of promoting science and education through high altitude balloons and amateur radio.

Primary features:
 - Software based (no traditional radios)
 - Simultaneous reception of APRS packets on multiple frequencies
 - Offline maps
 - Landing predictions
 - Receive only, nothing is transmitted over the air or uploaded to the Internet
 - Light weight user interface leverages a web browser


### Initial Platform Release ###

Although what is hosted here on GitHub is software only, the initial release of this system included both hardware
and software components.  Together these form an APRS tracker system that is able to aid in asset tracking and situational awareness from both offline (no Internet connectivity) and online modes.  This accommodates two primary use cases:
- A platform for mobile users to be used in-vehicle
- A platform for stationary users at home, business, or fixed-location field operations

The inital release included a small industrial computer from [Kansung](https://www.kansung.com/) with ample USB and serial connectivity as well as:
- RTL-SDR USB device.  This small USB "thumb stick" provides the software defined radio receiver functionality that when coupled with software running on the mini-computer allows all of the enhanced tracking functionality of the platform.
- USB attached GPS receiver.  
- Receiving antenna for the 2m amateur radio band for reception of APRS signals.


#### Kansung K4200UP4 Front Panel ####

<img src="doc/assets/kansung-front.png" alt="Kansung Mini-PC Computer Front" width="300">


#### Kansung K4200UP4 Rear Panel ####

<img src="doc/assets/kansung-rear.png" alt="Kansung Mini-PC Computer Rear" width="300">


#### In-Vehicle Connections ####

<img src="doc/assets/kansung-connections-vehicle.png" alt="In-Vehicle Connections" width="400">


#### At Home Connections ####

<img src="doc/assets/kansung-connections-home.png" alt="At Home Connections" width="400">



### Where To Next ###

Important guides and How-To's:
- [Update your system](doc/EOSS-Upgrades-and-Code-Branches.md) to enable switching to the development code branch.  
New features are available within the `dev` branch like APRS Igating, external radio connections, map waypoints, and 
numerous other fixups.  Follow this guide to enable quick switching between production and development code branches.
- [Using a home wifi network](doc/EOSS-SDR-Tracker-WiFi.md) with your Kansung computer system.  The Kansung SDR
Tracker system will automatically start a wifi hotspot for use in the field where network and Internet connectivty is no 
where to be found.  However, when not in an offline / out-in-the-sticks condition, it would be nice for the system to join your home or business wifi network.  This guide will help you change your Kansung system so that it can automatically switch between your home-based wifi network and hotspot modes.
- [Tethering your USB cellphone](doc/EOSS-SDR-USB-Cellphone-Tether.md) to the Kansung computer can be very advantegous if 
you need to get your system connected to the Internet while out in the field (ex. you're running it as an APRS Igate).  This guide outlines  how to get the Kansung system configured to automatically connect to the Internet through your USB connected, cellphone.
- [Using the EOSS personal package archive (PPA)](doc/EOSS-Install-PPA.md) with your system will, in the future, allow for a seamless upgrade and distribution system for software changes.  The PPA isn't fully populated with appropriate software as we're still working on this, but a HAB Tracker specific build of [Dire Wolf](https://github.com/wb2osz/direwolf) is available.



## Architecture ##

The following sections describe the architecture of the system.


### Separation of Data Acquisition and Front-end Interface
One of the core concepts with the HAB Tracker application is that it provides separation between ongoing data acquisition
processing tasks and the front-end user interface.  This allows amateur radio APRS packets across multiple frequencies to 
be processed as they are received without interference from what the end-user might be doing on the 
front-end interface. 

A key component of the architecture is the centralized database which stores all incoming APRS packet data enabling 
parallel access for other processing tasks and the presentation layer.  This approach allows the
front-end interface to query and display data independently, providing a smooth end-user experience.

<img src="doc/assets/Core-concept.png" alt="The Core Concept" width="600">



### Block Diagram
The following diagram shows the primary processing chain and how data is ultimately presented to the end user.

<img src="doc/assets/Block-diagram.png" alt="The Block Diagram" width="600">
