# EOSS Brick Build Notes - Docker

Last update:  5/19/2024

## High Level Steps

### Basic System Functionality
1. [Install Ubuntu 22.04 LTS](#installos)
2. [Configure Networking](#networking)
3. [Convenience Settings](#convenience)

### EOSSTracker Software and Dependencies
4. [Install & Configure EOSSTracker Software](#eosstracker)
5. [Airspy udev Rules](#airspy)

### Maps
6. [Downloading a Map Tiles (mbtiles) File](#tiles)

# Basic System Functionality
<a name="installos"></a>
## Install the base OS

Start with a clean install of Ubuntu 22.04 Server LTS.  During the installation it will ask for a username/password as well as a "computer name" or hostname.  Use the following:
```
User Name:  EOSS Tracker
Computer name:  eosstracker
username:  eosstracker
Password:  <insert standard password>
```
