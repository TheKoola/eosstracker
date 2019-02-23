# HAB Tracker

### Introduction ###

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



### Separation of Data Acquisition and Front-end Interface
One of the core concepts with the HAB Tracker application is that it provides separation between ongoing data acquisition
processing tasks and the front-end user interface.  This allows amateur radio APRS packets across multiple frequencies to 
be processed as they are received without interference from what the end-user might be doing on the 
front-end interface. 

A key component of the architecture is the centralized database which stores all incoming APRS packet data enabling 
parallel access for other processing tasks and the presentation layer.  This approach allows the
front-end interface to query and display data independently, providing a smooth end-user experience.

<img src="images/Core-concept.png" alt="The Core Concept">



### Block Diagram
The following diagram shows the primary processing chain and how data is ultimately presented to the end user.

<img src="images/Block-diagram.png" alt="The Block Diagram">
