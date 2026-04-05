# HAB Tracker - Frontend Architecture

This document describes the architecture of the HABTracker web frontend, located in the `www/` directory. It is intended for future maintainers and administrators.

## Overview

The frontend is a server-rendered PHP application with jQuery-driven AJAX interactions, served by Apache. It provides:

- A home page with system status, process controls, and logs
- A setup page for managing flights, beacons, trackers, frequencies, launch sites, and system configuration
- A real-time map (Leaflet-based) displaying balloon positions, landing predictions, weather stations, and tracker positions
- A dashboard with altitude charts and flight data
- A raw data viewer for packet inspection
- Audio alerts for flight status changes (via text-to-speech)

There is no authentication layer -- the system is designed as a single-user appliance on a local network or within a Docker container.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Server | Apache with PHP |
| Database | PostgreSQL with PostGIS (via `pg_*` PHP functions) |
| JavaScript | jQuery 3.4.1 (no build system, no bundler) |
| Mapping | Leaflet.js with plugins (MapLibre GL, marker clustering, sidebar, etc.) |
| Charts | C3.js (built on D3.js) |
| Audio | pico2wave text-to-speech (server-side MP3 generation) |
| CSS | Custom stylesheets (no preprocessor) |
| Real-time | Server-Sent Events (SSE) via PostgreSQL LISTEN/NOTIFY |

## Directory Structure

```
www/
  index.php                  # Home page (system status, start/stop controls, logs)
  map.php                    # Main map page
  setup.php                  # System configuration page
  dashboard.php              # Flight dashboard
  rawdata.php                # Raw packet data viewer
  about.php                  # About page
  testmap.php                # Alternate/test map view
  monitor.php                # System monitor page
  
  common/                    # Shared PHP includes, JS, CSS
    database.php             # Database connection and query wrapper functions
    functions.php            # Input validation helpers (check_string, check_number, etc.)
    header.php               # HTML header with navigation menu
    header-map.php           # Map page header (loads Leaflet and plugins)
    header-dashboard.php     # Dashboard page header
    header-testmap.php       # Test map header
    footer.php               # HTML footer
    version.php              # Version string ($version = "1.5")
    logo.php                 # Logo HTML
    
    map.js                   # Main map JavaScript (3962 lines) - largest JS file
    setup.js                 # Setup page JavaScript (2098 lines)
    index.js                 # Home page JavaScript (545 lines)
    dashboard.js             # Dashboard JavaScript (574 lines)
    rawdata.js               # Raw data viewer JavaScript (1098 lines)
    trackers.js              # Tracker management JavaScript (247 lines)
    symbols.js               # APRS symbol lookup table
    symbols-map.js           # APRS symbol rotation mapping for map display
    aprssymbols.js           # APRS symbol array
    
    leaflet-flighthud.js     # Custom Leaflet plugin: flight HUD overlay (1038 lines)
    leaflet-realtime.js      # Custom Leaflet plugin: real-time data layer (310 lines)
    leaflet-sidebar.js       # Custom Leaflet plugin: sidebar panel
    leaflet-box.js           # Custom Leaflet plugin: generic info box
    leaflet-gpsbox.js        # Custom Leaflet plugin: GPS status box
    leaflet-maplibre-gl.js   # Leaflet shim for MapLibre GL
    Control.SimpleMarkers.js # Leaflet marker placement control
    jquery.flightindicators.js # Flight instrument gauge widgets
    leaflet.rotatedMarker.js # Rotated marker support
    
    styles.css               # Main stylesheet
    mapstyles.css             # Map-specific styles
    dashboard.css             # Dashboard styles
    (other CSS files)         # Plugin-specific stylesheets
    
    jquery-3.4.1.min.js      # jQuery (vendored)
    d3.min.js                # D3.js (vendored)
    c3.min.js                # C3.js charts (vendored)
    maplibre-gl.js           # MapLibre GL (vendored)
    leaflet.markercluster.js # Marker clustering plugin (vendored)
    leaflet.groupedlayercontrol.min.js # Layer control plugin (vendored)
    
  leaflet/                   # Leaflet library
    leaflet.js
    leaflet.css
    images/
    
  images/                    # Static images
    aprs/                    # APRS symbol images
    graphics/                # UI graphics (favicon, icons, etc.)
    flightindicators/        # Flight gauge images
    SimpleMarkers/           # Marker placement icons
    
  configuration/             # Runtime configuration
    config.txt               # User configuration (JSON, written by setconfiguration.php)
    defaults.txt             # Default configuration (JSON)
    
  predictiondata/            # Uploaded prediction data files
    loadpreddata.php         # Prediction data listing endpoint
    
  tileserver/                # Local map tile server
    tileserver.php           # Tile rendering/serving (1307 lines)
    
  audio/                     # Generated audio alert files
```

## PHP Files by Category

### Page Renderers (return HTML)

| File | Purpose |
|------|---------|
| `index.php` | Home page: system status, start/stop buttons, GPS state, config summary, logs |
| `map.php` | Map page: initializes Leaflet map with flight data, sets JS globals from GET params |
| `setup.php` | Setup page: forms for flights, beacons, trackers, frequencies, launch sites, system config |
| `dashboard.php` | Dashboard: altitude charts, flight summary |
| `rawdata.php` | Raw data viewer: packet tables with filtering |
| `testmap.php` | Alternate map view for testing |
| `monitor.php` | System monitoring page |
| `about.php` | About/credits page |

### Data Read Endpoints (return JSON)

These endpoints are called via AJAX from the JavaScript frontend.

| File | Lines | Purpose |
|------|-------|---------|
| `getflightdata.php` | 1978 | Primary flight data endpoint: positions, tracks, predictions, weather for the map |
| `getotherdata.php` | 1027 | Non-flight station data: other APRS stations, weather stations, RF stations |
| `getactiveflights.php` | 743 | Active flight details for sidebar panels |
| `getaudioalerts.php` | 629 | Generates MP3 audio alerts for flight status changes |
| `getflightpackets.php` | 583 | Flight packet data (separates RF vs Internet sources) |
| `getdashboardpackets.php` | 446 | Dashboard-specific packet data |
| `getheadingvsaltitude.php` | 441 | Heading vs altitude chart data |
| `getverticalvsaltitude.php` | 345 | Vertical rate vs altitude chart data |
| `gettrackerstations.php` | 318 | Tracker station positions |
| `getlandingpredictions.php` | 296 | Landing prediction paths and coordinates |
| `getpredictionpaths.php` | 294 | Prediction path geometries |
| `getrfstations.php` | 275 | RF-heard station data |
| `getweatherstations.php` | 260 | Weather station data |
| `getpositionpackets.php` | 238 | Position packet history |
| `getvertratechartdata.php` | 223 | Vertical rate chart data |
| `getallstations.php` | 218 | All station data |
| `getttl.php` | 214 | Time-to-live calculations |
| `getairdensity.php` | 211 | Air density data |
| `gettemppressure.php` | 195 | Temperature and pressure data |
| `getdirewolfperformance.php` | 192 | Direwolf decoder performance metrics |
| `getallpackets.php` | 190 | All packets for a flight |
| `gettrackercountstable.php` | 172 | Tracker packet count statistics |
| `gettemp.php` | 166 | Temperature data |
| `getrelativeposition.php` | 166 | Relative position (bearing/distance) to balloon |
| `getpressure.php` | 165 | Barometric pressure data |
| `getspeedvsaltitude.php` | 161 | Speed vs altitude chart data |
| `getpacketperformance.php` | 159 | Packet reception performance |
| `getstatuspackets.php` | 153 | Status/telemetry packets |
| `getaltitudechartdata.php` | 150 | Altitude chart time series |
| `getupdates.php` | 142 | Incremental updates since last sync |
| `getpackets.php` | 112 | Basic packet query |
| `getflights.php` | 102 | Flight list |
| `getpackets2.php` | 101 | Alternate packet query |
| `getpackethashes.php` | 100 | Packet hash lookup |
| `getmystation.php` | 92 | This station's info |
| `getconfiguration.php` | 86 | Current configuration |
| `getflightsformap.php` | 84 | Simplified flight list for map |
| `getposition.php` | 82 | GPS position |
| `getlaunchsites.php` | 71 | Launch site list |
| `gettimezones.php` | 67 | Timezone list |
| `getfrequencies.php` | 67 | Frequency list |
| `getteams.php` | 69 | Team list |
| `getpredictions.php` | 63 | Prediction data list |
| `getlocation.php` | 54 | Station location |
| `getserialports.php` | 51 | Available serial ports |
| `getaudiodevs.php` | 50 | Audio device list |
| `getgps.php` | 43 | GPS status (reads JSON file) |
| `getstatus.php` | 41 | System status (calls getstatus.py) |
| `getlogs.php` | 88 | System log contents |
| `readconfiguration.php` | 92 | Read and return configuration |

### Write/Mutation Endpoints (return JSON result)

| File | Purpose |
|------|---------|
| `addflight.php` | Add a new flight with beacons |
| `addbeacon.php` | Add a beacon to a flight |
| `addfrequency.php` | Add a monitored frequency |
| `addlaunchsite.php` | Add a launch site |
| `addtracker.php` | Add a tracker station |
| `addpredictiondata.php` | Upload prediction data file |
| `deleteflight.php` | Delete a flight |
| `deletebeacon.php` | Delete a beacon |
| `deletefrequency.php` | Delete a frequency |
| `deletelaunchsite.php` | Delete a launch site |
| `deletetracker.php` | Delete a tracker |
| `deleteoldpredicts.php` | Clean up old prediction data |
| `changeassignedflight.php` | Assign a team to a flight |
| `changelaunchsite.php` | Change flight launch site |
| `changetrackerteam.php` | Change tracker team assignment |
| `trackflight.php` | Toggle flight active status |
| `setconfiguration.php` | Save system configuration |
| `rmpredictiondata.php` | Remove prediction data |

### Sync Endpoints

| File | Purpose |
|------|---------|
| `syncpackets.php` | Sync packet data from track.eoss.org |
| `syncconfiguration.php` | Sync flight/tracker/team config from track.eoss.org |
| `grabprediction.php` | Download prediction files from eoss.org |

### System Control Endpoints

| File | Purpose |
|------|---------|
| `startup.php` | Start backend daemon (via `sudo -u eosstracker start_session.bash`) |
| `shutdown.php` | Stop backend daemon (via `sudo -u eosstracker killsession_wrapper.bash`) |
| `gitpull.php` | Run git pull for software updates |
| `downloaddata.php` | CSV export of flight/GPS data |

### Real-Time

| File | Purpose |
|------|---------|
| `testsse.php` | Server-Sent Events endpoint using PostgreSQL LISTEN/NOTIFY for real-time packet and position updates |

## Database Access Pattern

### Connection

All PHP files connect to PostgreSQL via `common/database.php`:

```php
$link = connect_to_database();
```

This reads `configuration/config.txt` for the timezone, then connects with hardcoded credentials to the `aprs` database on `localhost`.

### Query Patterns

The codebase uses two query patterns:

1. **Parameterized queries** (for user input) - using `pg_query_params()`:
   ```php
   $query = "SELECT * FROM flights WHERE flightid = $1;";
   $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));
   ```

2. **Static queries** (no user input) - using the `sql_query()` wrapper:
   ```php
   $query = "SELECT * FROM flights WHERE active = true ORDER BY flightid;";
   $result = sql_query($query);
   ```

All write operations (INSERT, UPDATE, DELETE) use parameterized queries.

### Input Validation

User input is validated via helper functions in `common/functions.php`:

- `check_string($string, $max_length)` - Validates alphanumeric + basic punctuation, enforces max length
- `check_number($var, $lower, $upper)` - Validates numeric within a range
- `check_date($d)` - Validates date format
- `check_datetime($d)` - Validates datetime format
- `sql_escape_string($str)` - Additional PostgreSQL escaping (used alongside parameterized queries)

### Result Convention

Most API endpoints return JSON with this convention:
- Success: `{"result": 1, "error": ""}`
- Error: `{"result": 0, "error": "description"}`

**Exception:** `addpredictiondata.php` uses the inverted convention (`1` = error, `0` = success). Its JavaScript caller (`setup.js:731`) handles this correctly.

## JavaScript Architecture

### Page-Specific Scripts

Each page loads its own JavaScript file that handles AJAX calls, DOM manipulation, and page-specific logic:

| Page | Script | Key Functions |
|------|--------|--------------|
| Home | `index.js` | `getConfiguration()`, `startUpProcesses()`, `shutDownProcesses()`, status polling |
| Map | `map.js` | Map initialization, layer management, real-time updates, flight tracking |
| Setup | `setup.js` | Form handling for all setup tabs (flights, beacons, trackers, config) |
| Dashboard | `dashboard.js` | Chart rendering, flight data display |
| Raw Data | `rawdata.js` | Packet table rendering, filtering, live packet stream |
| Trackers | `trackers.js` | Tracker management UI |

### Map Architecture (`map.js` - 3962 lines)

The largest and most complex JavaScript file. Key concepts:

**Map Initialization:**
- Uses Leaflet with multiple base layers (MapLibre GL vector tiles, raster tiles)
- Initializes from PHP-injected globals: `latitude`, `longitude`, `zoom`, `flightids`, `followfeatureid`
- Creates multiple map panes with z-index ordering for layered display

**Data Flow:**
```
map.php (PHP globals) --> map.js initialization
                              |
                              v
                    setInterval (periodic AJAX calls)
                              |
          +-------------------+-------------------+
          |                   |                   |
   getflightdata.php   getotherdata.php   getactiveflights.php
   (flight positions,  (other stations,   (sidebar flight
    predictions,        weather)           details)
    tracks)
          |                   |                   |
          v                   v                   v
   Update Leaflet      Update Leaflet      Update sidebar
   layers/markers      layers/markers      HTML panels
```

**Layer Structure:**
- Flight layers (one per active flight) with position markers, breadcrumb trails
- Landing prediction layers (predicted paths and landing points)
- Other station layers (weather, APRS, RF stations)
- GPS position layer (this station's location)

**Key Functions:**
- `getRealtimeFunction()` - Creates Leaflet realtime layers for flight data
- `realtimeUpdateFunction()` - Processes incoming GeoJSON data, updates markers
- `flightFollowing()` - Auto-centers map on a tracked balloon
- `getActiveLandingPredictions()` - Fetches and displays landing prediction paths

### Setup Architecture (`setup.js` - 2098 lines)

Manages all setup page tabs via jQuery AJAX:

- Flight management (add/delete flights, beacons, frequencies)
- Tracker management (add/delete/reassign trackers to teams)
- Launch site management
- System configuration (callsign, timezone, igating, beaconing, etc.)
- Prediction data upload and management
- Data sync from track.eoss.org

### Real-Time Updates

Two mechanisms for real-time data:

1. **Polling (primary):** JavaScript `setInterval` calls that periodically fetch data from PHP endpoints. Default intervals vary by page (typically 5-15 seconds).

2. **Server-Sent Events (experimental):** `testsse.php` provides a streaming endpoint using PostgreSQL's LISTEN/NOTIFY. When a packet is inserted into the `packets` table, the database trigger fires `pg_notify('new_packet')`, which the SSE endpoint forwards to the browser. Used in the test map page.

## Security Model

- **No authentication:** The system is designed for trusted local network use (single-user appliance)
- **SQL injection protection:** All user-input queries use `pg_query_params()` with parameterized placeholders
- **Input validation:** `check_string()`, `check_number()`, `check_date()` validate all GET/POST parameters
- **XSS mitigation:** JavaScript uses `escapeHtml()` function in several places; some areas use `.innerHTML` with data from the database
- **Command injection:** System control endpoints (`startup.php`, `shutdown.php`, `gitpull.php`) use hardcoded script paths with no user input in `shell_exec()` calls
- **Shell execution:** Audio alert generation (`getaudioalerts.php`) constructs speech text from numeric/fixed strings and passes to `pico2wave` via `shell_exec()`

### Credentials

Database credentials are hardcoded in two locations:
- `bin/habconfig.py` (Python backend)
- `www/common/database.php` (PHP frontend)

Both use: `user=eosstracker password=Thisisthedatabasepassword!`

## Configuration Flow

```
Setup page (browser)
       |
       | POST form data
       v
setconfiguration.php
       |
       | Writes to file
       v
configuration/config.txt (JSON)
       |
       | Read on every page load / DB connection
       v
database.php::readconfiguration()
       |
       +---> connect_to_database() (timezone in connection string)
       +---> Various PHP endpoints (callsign, lookback period, etc.)
       +---> Python backend (reads same file at startup)
```

## Map Tile Serving

The `tileserver/tileserver.php` (1307 lines) serves map tiles locally. It supports:
- Pre-rendered raster tiles from a local tile directory
- Vector tile styles for MapLibre GL (OpenStreetMap Liberty, OSM Bright, Basic)
- Style JSON generation pointing to local tile sources

Tile data is stored in `/eosstracker/maps/` or `/var/lib/mod_tile/`.

## Key Data Flows

### Packet Display on Map

1. `map.js` calls `getflightdata.php` every ~5 seconds
2. `getflightdata.php` queries `packets` table joined with `flights`/`flightmap`, returns GeoJSON
3. `map.js` processes GeoJSON, creates/updates Leaflet markers with APRS symbols
4. Breadcrumb trails are drawn from position history
5. Landing predictions are overlaid from `getlandingpredictions.php`

### Flight Setup

1. User fills form on `setup.php`
2. `setup.js` sends AJAX GET to `addflight.php` with validated parameters
3. `addflight.php` validates inputs, inserts into `flights` and `flightmap` tables
4. On success, `setup.js` refreshes the flight list via `getflights.php`

### Audio Alerts

1. `map.js` periodically calls `getaudioalerts.php`
2. PHP computes flight status (ascending, descending, burst, landed) from packet data
3. For status changes, PHP generates speech text and calls `pico2wave` to create MP3
4. Returns JSON with MP3 file path
5. JavaScript plays the audio file in the browser

### Data Sync (from track.eoss.org)

1. User clicks sync on `setup.php`
2. `setup.js` calls `syncconfiguration.php` and/or `syncpackets.php`
3. PHP fetches JSON from `https://track.eoss.org/` endpoints
4. Data is inserted/updated in local database tables
5. Allows a "field" tracker to pull down centrally-managed flight configurations

## Known Considerations for Maintainers

- **No build system:** All JavaScript is plain ES5/jQuery. No transpilation, bundling, or minification of custom code. Third-party libraries are vendored as pre-built files.
- **Global variables:** JavaScript files use global variables extensively. The map page relies on PHP-injected globals (`flightids`, `latitude`, etc.) set in `map.php`.
- **Mixed boolean conventions:** Configuration values are stored as strings (`"true"`/`"false"`) in JSON. PHP comparisons use string equality throughout.
- **Result code inconsistency:** Most endpoints use `result: 1` for success, `result: 0` for error. `addpredictiondata.php` uses the opposite convention (but its JS caller handles this correctly).
- **jQuery dependency:** The entire frontend relies on jQuery 3.4.1 for AJAX calls and DOM manipulation.
- **No SPA routing:** Each page is a full PHP-rendered HTML page. Navigation is traditional page loads.
- **Timezone handling:** The PostgreSQL connection string includes the configured timezone, affecting all timestamp queries.
- **File-based configuration:** System configuration is stored in `configuration/config.txt` rather than in the database. Both the PHP frontend and Python backend read this file.
- **Audio alerts** require `pico2wave` (from the `libttspico-utils` package) to be installed on the system.
