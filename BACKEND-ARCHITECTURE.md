# HAB Tracker - Python Backend Architecture

This document describes the architecture of the HABTracker Python backend, located in the `bin/` directory. It is intended for future maintainers and administrators.

## Overview

HABTracker is a High Altitude Balloon (HAB) tracking system built for the EOSS (Edge of Space Sciences) program. The Python backend is a multi-process daemon that:

- Receives APRS packets from multiple sources (APRS-IS Internet servers, local SDR receivers via Direwolf, and KA9Q-Radio RTP multicast)
- Decodes and stores packets in a PostgreSQL/PostGIS database
- Runs landing prediction algorithms for active balloon flights
- Polls GPS hardware for the station's own position
- Optionally igates (forwards) RF-received packets to the APRS-IS network
- Optionally beacons the station's own position to APRS-IS

The system is designed to run inside a Docker container or directly on a Linux host (typically a Raspberry Pi or similar SBC), with a PHP/JavaScript web frontend served by Apache.

## Entry Point and Process Model

### `habtracker-daemon.py` - Main Daemon (Entry Point)

This is the master process started by `start_session.bash`. It:

1. Configures logging (console + rotating file at `/eosstracker/logs/habtracker.log`)
2. Checks for already-running instances (via `psutil`)
3. Runs database migration checks (`databasechecks.py`)
4. Reads configuration from `/eosstracker/www/configuration/config.txt` (JSON)
5. Discovers attached USB SDR dongles (`searchrtlsdr.py`)
6. Builds a frequency-to-channel map for Direwolf
7. Creates shared state via `multiprocessing.Manager`:
   - `position` - dict updated by GPS poller, read by all
   - `landinglocations` - dict updated by landing predictor
   - `activebeacons` - dict of beacon callsigns on active flights
   - `igatestatistics` - dict tracking igated packet counts
8. Spawns all sub-processes (see below)
9. Writes status to `/eosstracker/www/daemonstatus.json`
10. Joins all child processes (blocks until shutdown)
11. On SIGTERM/KeyboardInterrupt, sets the shared `stopevent` and gracefully terminates children

### Sub-Process Architecture

All sub-processes are spawned via Python's `multiprocessing` module. They share:

- **`stopevent`** (`mp.Event`) - When set, signals all processes to shut down
- **`databasequeue`** (`mp.Queue`) - Packets destined for database insertion
- **`igatingqueue`** (`mp.Queue`) - Packets destined for igating to APRS-IS
- **`loggingqueue`** (`mp.Queue`) - Centralized logging via `QueueListener`
- **`configuration`** (dict) - Shared configuration passed to each process

```
habtracker-daemon.py (main)
  |
  +-- GPS Position Tracker       (gpspoller.py)
  +-- Database Writer            (databasewriter.py)
  +-- Landing Predictor          (landingpredictor.py)
  +-- Aprsc                      (subprocesses.py) - manages the aprsc binary
  +-- APRS-IS Tap                (connectors.py)   - TCP connection to local aprsc
  +-- CWOP Tap                   (connectors.py)   - TCP connection to CWOP server
  +-- GnuRadio Receiver(s)       (aprsreceiver.py) - one per SDR dongle
  +-- Direwolf                   (subprocesses.py) - manages the direwolf binary
  +-- Direwolf KISS Tap          (connectors.py)   - TCP/KISS connection to direwolf
  +-- RTP Multicast Tap          (connectors.py)   - UDP multicast from ka9q-radio
```

## File-by-File Reference

### Core Daemon

| File | Lines | Purpose |
|------|-------|---------|
| `habtracker-daemon.py` | ~1009 | Main daemon, process orchestration, configuration loading, signal handling |
| `habconfig.py` | ~33 | Database credentials and connection string |

### Packet Ingestion (Connectors)

| File | Lines | Purpose |
|------|-------|---------|
| `connectors.py` | ~1863 | Network I/O layer: TCP/UDP socket management, APRS-IS protocol, KISS protocol, RTP multicast, igating logic, APRS filter management, position beaconing |
| `kissprocessor.py` | ~380 | KISS frame encoding/decoding (TNC protocol used by Direwolf) |
| `decoders.py` | ~356 | RTP packet parser, AX.25 frame parser, APRS passcode generation |
| `packet.py` | ~50 | `Packet` dataclass - universal packet container used across all modules |

### Data Processing

| File | Lines | Purpose |
|------|-------|---------|
| `databasewriter.py` | ~615 | Reads packets from `databasequeue`, parses via `aprslib`, inserts into PostgreSQL |
| `landingpredictor.py` | ~2154 | Landing prediction algorithms using scipy curve fitting, wind modeling, and integration; downloads NOAA prediction data |
| `queries.py` | ~1107 | Consolidated database query functions (flights, packets, GPS position, frequencies, wind data, landing elevation) |

### External Process Management

| File | Lines | Purpose |
|------|-------|---------|
| `subprocesses.py` | ~1148 | Manages external binaries (Direwolf, aprsc); generates config files; monitors process health |
| `aprsreceiver.py` | ~449 | GnuRadio flowgraph for SDR reception; tunes RTL-SDR/Airspy/HackRF dongles and outputs audio to UDP for Direwolf |
| `searchrtlsdr.py` | ~138 | USB device discovery for RTL-SDR, HackRF, and Airspy dongles |

### GPS and Status

| File | Lines | Purpose |
|------|-------|---------|
| `gpspoller.py` | ~1026 | GPSD client; polls GPS hardware; writes position to shared dict and `/eosstracker/www/gpsstatus.json`; inserts GPS positions into database |
| `getstatus.py` | ~197 | Standalone script (called by web frontend) that checks process status and returns JSON |
| `databasechecks.py` | ~323 | Database schema migration: adds missing columns, indexes, triggers, and notification functions |

## Key Classes

### `connectors.py` Class Hierarchy

```
PacketHandler        - Defines filter + transform + queue(s) for packet routing
Server               - Hostname, port, nickname for a network endpoint
AprsFilter           - APRS-IS server-side filter specification builder
CredentialSet        - APRS-IS login credentials (callsign, passcode, software version)

PacketStream         - Base class: TCP socket, read/send threads, packet handler routing
  +-- AprsisStream   - APRS-IS protocol: login, filter updates, igating, beaconing
  +-- DirewolfKISS   - Direwolf KISS TCP: KISS framing, channel-to-frequency mapping
  +-- MulticastPacketStream - UDP multicast socket
      +-- RTPStream  - KA9Q-Radio RTP+AX.25 multicast ingestion
```

### Packet Flow

```
[SDR Dongle] --> [GnuRadio (UDP audio)] --> [Direwolf (KISS TCP)] --> DirewolfKISS.read_thread
                                                                          |
                                                                          v
                                                                    kissprocessor.decode()
                                                                          |
                                                                          v
                                                              Packet --> databasequeue --> databaseWriter
                                                                    \--> igatingqueue  --> AprsisStream.send_thread

[APRS-IS Server] --> AprsisStream.read_thread --> filterComments --> Packet --> databasequeue

[KA9Q-Radio]     --> RTPStream.read_thread --> parse_RTP_AX25 --> Packet --> databasequeue
                                                                        \--> igatingqueue
```

### `Packet` Dataclass (`packet.py`)

The universal packet container passed between all modules:

- `text` (str) - Raw APRS packet text (e.g., `N6BA>APRS,WIDE2-1:!3945.00N/10459.00W-`)
- `frequency` (int) - Frequency in Hz where the packet was heard (or None for Internet)
- `source` (str) - Origin identifier: `"direwolf"`, `"ka9q-radio"`, `"kiss"`, server nickname, etc.
- `properties` (dict) - Decoded packet metadata (digipeaters, channel, timestamps, etc.)

## Database Schema

PostgreSQL with PostGIS extension. Schema defined in `sql/aprs-database.v2.sql`.

### Core Tables

| Table | Purpose |
|-------|---------|
| `packets` | All received APRS packets with location geometry, timestamps, source, frequency |
| `packettypes` | Lookup table for APRS packet type characters |
| `symbols` | APRS symbol descriptions |
| `flights` | Active/historical flight definitions with launch site reference |
| `flightmap` | Maps beacon callsigns to flights |
| `freqs` | Radio frequencies to monitor for each flight |
| `launchsites` | Launch site coordinates and elevation |
| `landingpredictions` | Predicted landing coordinates, flight paths, wind data |
| `predictiondata` | Downloaded NOAA prediction model data |
| `gpsposition` | Station GPS position history |
| `teams` | Tracker team assignments |
| `trackers` | Tracker station callsigns |

### Key Indexes and Triggers

- Primary key on `packets`: `(tm, source, channel, callsign, hash)` - hash is MD5 of the info portion
- `notify_v1()` trigger function: fires `pg_notify('new_packet')` on INSERT to `packets`, and `pg_notify('new_position')` on INSERT to `gpsposition`
- These PostgreSQL NOTIFY events are used by the web frontend (via PHP) for real-time updates

## Configuration

Configuration is stored in `/eosstracker/www/configuration/config.txt` (JSON), editable through the web frontend. Key settings:

| Key | Description |
|-----|-------------|
| `callsign` | Station's amateur radio callsign |
| `ssid` | APRS SSID (0-15) |
| `timezone` | Timezone string (e.g., `America/Denver`) |
| `igating` | Enable igating RF packets to APRS-IS (`"true"`/`"false"`) |
| `beaconing` | Enable RF position beaconing via Direwolf (`"true"`/`"false"`) |
| `ibeacon` | Enable Internet position beaconing to APRS-IS (`"true"`/`"false"`) |
| `passcode` | APRS-IS verification passcode |
| `ka9qradio` | Enable KA9Q-Radio RTP multicast listener (`"true"`/`"false"`) |
| `aprsisserver` | APRS-IS server hostname (default: `noam.aprs2.net`) |
| `cwopserver` | CWOP server hostname (default: `cwop.aprs.net`) |
| `customfilter` | Additional APRS-IS filter string |
| `mobilestation` | Whether this is a mobile station (`"true"`/`"false"`) |
| `gpshost` | Hostname of GPSD instance |
| `symbol` | APRS map symbol (e.g., `/k` for SUV) |
| `overlay` | APRS symbol overlay character |

Command-line options (via `habtracker-daemon.py`):

- `--callsign` - Default callsign (default: `E0SS`)
- `--aprsisRadius` - APRS-IS filter radius in km (default: 50)
- `--algoInterval` - Landing predictor run interval in seconds (default: 10)
- `--kill` - Kill existing running instances and exit

## Operating Modes

### Online-Only Mode (No SDR dongles attached)

- Aprsc runs in read-only mode connecting to APRS-IS
- APRS-IS Tap and CWOP Tap connect to the local aprsc instance
- No GnuRadio or Direwolf processes
- Igating is disabled (unless KA9Q-Radio is configured)

### RF Mode (SDR dongles detected)

- GnuRadio process(es) started, one per SDR dongle
- Each GnuRadio instance tunes to configured frequencies and outputs audio via UDP
- Direwolf decodes audio, outputs KISS frames on TCP port 8001
- Direwolf KISS Tap reads decoded packets and routes to database/igating queues
- Aprsc may run with full igating capabilities

### KA9Q-Radio Mode

- Listens on UDP multicast (`ax25.local:5004`) for RTP+AX.25 frames
- Decoded packets are routed to database and igating queues
- Can operate alongside or independently of SDR/Direwolf mode

## Logging

- Centralized via `multiprocessing.Queue` + `QueueListener` pattern
- All sub-processes send log messages to the main process via the shared `loggingqueue`
- Output destinations:
  - Console (stdout)
  - Rotating log file: `/eosstracker/logs/habtracker.log` (rotates at midnight)
- Format: `%(asctime)s - %(levelname)s - %(module)s - %(message)s`

## Status and Monitoring

- `/eosstracker/www/daemonstatus.json` - Written by the main daemon on startup/shutdown. Contains RF mode, antenna config, active status, callsign, etc.
- `/eosstracker/www/gpsstatus.json` - Written by the GPS poller process. Contains current GPS fix, satellites, speed, bearing, etc.
- `getstatus.py` - Standalone script invoked by the web frontend to combine process status with the above JSON files into a single status response.

## Shutdown Sequence

1. SIGTERM received by main daemon
2. `stopevent.set()` signals all child processes
3. Each process checks `stopevent` in its main loop and exits gracefully
4. Main daemon calls `endProcesses()`:
   - `join(10)` each process
   - `terminate()` any still alive
   - `kill()` (SIGKILL) as last resort
5. `daemonstatus.json` updated with `active: 0`

## Dependencies

### Python Packages

- `psycopg2` - PostgreSQL adapter
- `aprslib` - APRS packet parsing
- `psutil` - Process monitoring
- `gnuradio` / `osmosdr` - SDR signal processing (only needed in RF mode)
- `numpy` / `scipy` - Landing prediction math (curve fitting, integration, interpolation)
- `gps` (gpsd client library) - GPS hardware interface
- `pyusb` (`usb.core`, `usb.util`) - USB device detection for SDR dongles

### External Processes (managed by `subprocesses.py`)

- **Direwolf** - Software TNC for APRS decoding/encoding
- **aprsc** - APRS-IS server/client for Internet connectivity

### System Services

- **PostgreSQL** with PostGIS extension
- **GPSD** - GPS device daemon
- **Apache** with PHP - Web frontend

## Docker Deployment

The system runs in a Docker container (`thekoola/eosstracker:brickv2.1`) with:

- Host network mode (required for multicast, GPS, and SDR access)
- USB device passthrough (`/dev/bus/usb`, `/dev/ttyACM0`)
- Named volume for persistent data at `/eosstracker`
- Entry point: `/run.sh`

## Known Considerations for Maintainers

- Configuration values like `igating`, `beaconing`, `ka9qradio` are stored as string `"true"`/`"false"` rather than booleans. Comparisons throughout the code use string equality checks.
- The `maxdirewolfchannels` is hardcoded to 8 in the main daemon.
- The Direwolf audio sample rate is hardcoded to 50000 Hz.
- Database credentials are in `habconfig.py` (not environment variables).
- The APRS-IS connection always routes through a local aprsc instance at `127.0.0.1:14580`, even for CWOP connections the server address is overridden.
- Landing predictor downloads NOAA GFS/RAP prediction data and performs numerical integration - this is the most computationally intensive component.
- The `databasechecks.py` module handles forward-compatible schema migration by checking for missing columns/indexes at startup.
