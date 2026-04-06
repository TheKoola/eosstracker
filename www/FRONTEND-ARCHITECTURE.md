# Frontend Architecture Guide

Maintainer reference for the HABTracker web frontend (kiosk16 branch), deployed at track.eoss.org.

## Overview

The frontend is a PHP/JavaScript application for real-time high-altitude balloon tracking.
It uses server-side PHP for data endpoints (querying PostgreSQL/PostGIS), Memcache for
caching frequently-requested data, and a Leaflet-based map UI with 5-second polling updates.

There is no build step or bundler. All JS is served directly by Apache.


## Technology Stack

| Component         | Technology                                        |
|-------------------|---------------------------------------------------|
| Web server        | Apache 2                                          |
| Server language   | PHP                                               |
| Database          | PostgreSQL 10 + PostGIS 2.4                       |
| Caching           | Memcache (PHP Memcache extension, localhost:11211) |
| Mapping           | Leaflet + Mapbox GL JS (vector tiles)             |
| Charts            | C3.js (built on D3.js)                            |
| DOM manipulation  | jQuery 3.4.1                                      |
| CSS               | Custom (no framework)                             |
| Tile server       | Local TileServer GL (OSM Bright, Klokantech Basic)|


## Directory Layout

```
www/
  common/
    database.php          -- DB connection, query wrappers, escape functions
    functions.php         -- Input validation (check_string, check_number, check_date)
    header.php            -- HTML head/nav for standard pages
    header-map.php        -- HTML head/nav for the map page
    footer.php            -- Page footer
    logo.php              -- Dynamic logo
    version.php           -- Version string (1.6 Kiosk)
    map.js                -- Primary map page (Leaflet, layers, 5s update loop)
    setup.js              -- Admin/setup page (forms, validation, AJAX)
    telemetry.js          -- Telemetry charts and flight gauges
    dashboard.js          -- Audio alerts, live packet stream
    rawdata.js            -- Raw packet display with C3 charts
    historical.js         -- Historical flight data browser
    trackers.js           -- Tracker team management UI
    index.js              -- Home page status, start/stop controls
    symbols.js            -- APRS symbol rendering utilities
    symbols-map.js        -- Leaflet map symbol integration
    aprssymbols.js        -- APRS symbol definitions/mappings
  configuration/
    config.txt            -- Runtime configuration (JSON, written by setconfiguration.php)
    defaults.txt          -- Default configuration values (JSON)
  predictiondata/
    loadpreddata.php      -- Prediction file upload handler
  leaflet/
    leaflet.js            -- Leaflet library
  images/                 -- Icons, graphics, APRS symbol images
  audio/                  -- Audio alert status files (per-caller JSON)
  index.php               -- Map page (main public page)
  home.php                -- System status/info page
  setup.php               -- Admin setup page
  historical.php          -- Historical data browser page
  telemetry.php           -- Telemetry display page
  dashboard.php           -- Dashboard page
  rawdata.php             -- Raw packet viewer page
  get*.php                -- Data API endpoints (return JSON)
  add*.php                -- Create operations (flights, beacons, trackers, etc.)
  delete*.php             -- Delete operations
  change*.php             -- Update operations
  setconfiguration.php    -- Write configuration
  startup.php             -- Start backend daemon (calls sudo)
  shutdown.php            -- Stop backend daemon (calls sudo)
```


## Key Architectural Patterns

### Database Access

All database access goes through wrapper functions in `common/database.php`:

- `connect_to_database()` -- returns a pg_connect handle; timezone set via config
- `sql_query($sql, $link)` -- thin wrapper around `pg_query()`
- `sql_escape_string($str)` -- wraps `pg_escape_string(stripslashes())`

Most endpoints use `pg_query_params()` directly (parameterized queries) rather than
`sql_query()`. User input is validated through functions in `common/functions.php`:

- `check_string($str, $maxlen)` -- allowlist regex `[a-zA-Z0-9.(), _-]+`
- `check_number($var, $lower, $upper)` -- numeric range validation
- `check_date($d)` / `check_datetime($d)` -- date format validation

### Memcache Caching

Three data endpoints use Memcache to reduce database load:

| Cache Key            | TTL    | Data                                              | File                       |
|----------------------|--------|---------------------------------------------------|----------------------------|
| `process_status`     | 500s   | Backend process status (from procstatus.py)        | getstatus-memcache.php     |
| `getotherdata`       | 290s   | GeoJSON of "at large" tracker stations             | getotherdata-memcache.php  |
| `tracker_definitions`| 310s   | Tracker metadata (callsigns, teams, assignments)   | gettrackers-memcache.php   |

All cached data is stored as JSON strings. On cache miss, the endpoint falls back to
a direct database query and repopulates the cache.

### Map Page Update Cycle

The map page (`index.php` + `common/map.js`) uses a 5-second polling loop:

1. `updateAllItems()` is called every 5000ms via `setTimeout`
2. It issues AJAX requests to various `get*.php` endpoints
3. Responses (JSON/GeoJSON) update Leaflet layers, markers, and overlays
4. Leaflet plugins handle clustering, rotation, real-time layers, and sidebars

Map panes (z-order layers): pathsPane, flightPane, landingPredictionPane,
flightTooltipPane, otherTooltipPane, breadcrumbPane, otherStationsPane.

Tile sources are served by a local TileServer GL instance at `/tileserver/`.


## SECURITY: Unauthenticated Admin Endpoints

**This is the most important section for incoming maintainers.**

The PHP application has **no authentication or authorization layer**. Every endpoint
is accessible to any anonymous visitor. For the public-facing kiosk site, this means:

- `startup.php` and `shutdown.php` execute `shell_exec('sudo ...')` to start/stop
  the backend daemon. Anyone can call these.
- `setconfiguration.php` writes runtime configuration (timezone, callsign, etc.)
  to disk. Anyone can POST to it.
- `addflight.php`, `addbeacon.php`, `addtracker.php`, `addlaunchsite.php` create
  database records.
- `deleteflight.php`, `deletebeacon.php`, `deletetracker.php`, `deletelaunchsite.php`
  destroy database records.
- `changeassignedflight.php`, `changetrackerteam.php`, `changelaunchsite.php` modify
  assignments.
- `trackflight.php` toggles flight active status.
- `addpredictiondata.php` and `rmpredictiondata.php` manage prediction uploads.

### Recommended Mitigation: nginx Reverse Proxy

The recommended approach is to restrict these endpoints at the web server level.
Below is an example nginx configuration that blocks public access to admin endpoints
while leaving the read-only map and data endpoints open:

```nginx
server {
    listen 80;
    server_name track.eoss.org;
    root /eosstracker/www;
    index index.php;

    # PHP processing
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # -------------------------------------------------------
    # ADMIN ENDPOINTS - restricted to trusted IPs only
    # -------------------------------------------------------
    # Start/stop daemon
    location ~ ^/(startup|shutdown)\.php$ {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;

        include fastcgi_params;
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Configuration write
    location = /setconfiguration.php {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;

        include fastcgi_params;
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Create/delete/modify operations
    location ~ ^/(add|delete|change|track|rm|grabprediction).*\.php$ {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;

        include fastcgi_params;
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Setup page (admin UI)
    location = /setup.php {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;

        include fastcgi_params;
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Prediction data upload
    location ~ ^/predictiondata/ {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;

        include fastcgi_params;
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # -------------------------------------------------------
    # CONFIGURATION DIRECTORY - block direct access
    # -------------------------------------------------------
    location /configuration/ {
        deny all;
        return 403;
    }

    # -------------------------------------------------------
    # PUBLIC ENDPOINTS - open to all (read-only data + pages)
    # -------------------------------------------------------
    # All get*.php endpoints, index.php, home.php, historical.php,
    # telemetry.php, dashboard.php, rawdata.php, about.php,
    # downloaddata.php, monitor.php, and static assets are
    # served normally by the default location blocks above.
}
```

### Alternative: Apache .htaccess

If continuing to use Apache directly (without nginx), create `/eosstracker/www/.htaccess`:

```apache
# Restrict admin endpoints to local/private networks
<FilesMatch "^(startup|shutdown|setconfiguration|setup)\.php$">
    Require ip 127.0.0.1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
</FilesMatch>

<FilesMatch "^(add|delete|change|track|rm|grabprediction).*\.php$">
    Require ip 127.0.0.1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
</FilesMatch>

# Block direct access to configuration files
<DirectoryMatch "/configuration/">
    Require all denied
</DirectoryMatch>
```

Note: Apache must have `AllowOverride` enabled for the document root for `.htaccess`
to take effect. Check the Apache site config (`/etc/apache2/sites-enabled/`).


## Endpoint Reference

### Public Pages (serve HTML)

| URL               | File              | Purpose                              |
|--------------------|-------------------|--------------------------------------|
| `/`               | `index.php`       | Main map page                        |
| `/home.php`       | `home.php`        | System status and info               |
| `/historical.php` | `historical.php`  | Historical flight data browser       |
| `/telemetry.php`  | `telemetry.php`   | Telemetry charts for a flight        |
| `/dashboard.php`  | `dashboard.php`   | Audio alerts dashboard               |
| `/rawdata.php`    | `rawdata.php`     | Raw packet viewer                    |
| `/about.php`      | `about.php`       | About/license page                   |
| `/monitor.php`    | `monitor.php`     | System monitoring                    |

### Data API Endpoints (return JSON, publicly readable)

| URL                          | Key Parameters              | Purpose                          |
|------------------------------|-----------------------------|----------------------------------|
| `getactiveflights.php`       | --                          | Active flight list               |
| `getallpackets.php`          | --                          | All recent packets               |
| `getallstations.php`         | flightid                    | Station list for a flight        |
| `getaltitudechartdata.php`   | flightid                    | Altitude chart data              |
| `getconfiguration.php`       | --                          | Current configuration            |
| `getdashboardpackets.php`    | flightid                    | Dashboard packet stream          |
| `getflightdata.php`          | flightid, starttime         | Historical flight packet data    |
| `getflightpackets.php`       | flightid                    | Live flight packets              |
| `getflights.php`             | --                          | All flights list                 |
| `getflightsformap.php`       | --                          | Active flights for map display   |
| `getlandingpredictions.php`  | flightid                    | Landing predictions              |
| `getotherdata.php`           | --                          | Non-flight station data          |
| `getotherdata-memcache.php`  | --                          | Same, with memcache              |
| `getpackets.php`             | flightid, callsign          | Filtered packet query            |
| `getposition.php`            | --                          | GPS position                     |
| `getpredictions.php`         | --                          | All predictions                  |
| `getpredictionpaths.php`     | flightid                    | Prediction path geometries       |
| `getstatus.php`              | --                          | System process status            |
| `getstatus-memcache.php`     | --                          | Same, with memcache              |
| `gettrackers.php`            | flightid                    | Tracker list                     |
| `gettrackers-memcache.php`   | flightid                    | Same, with memcache              |
| `getweatherstations.php`     | flightid                    | Weather station data             |
| `downloaddata.php`           | datatype                    | CSV/JSON data download           |

### Admin Endpoints (MUST be access-restricted, see above)

| URL                        | Method | Purpose                              |
|----------------------------|--------|--------------------------------------|
| `startup.php`              | GET    | Start backend daemon (sudo)          |
| `shutdown.php`             | GET    | Stop backend daemon (sudo)           |
| `setconfiguration.php`     | POST   | Write runtime configuration          |
| `setup.php`                | GET    | Admin setup page                     |
| `addflight.php`            | GET    | Create a flight                      |
| `addbeacon.php`            | GET    | Assign a beacon to a flight          |
| `addtracker.php`           | GET    | Add a tracker                        |
| `addlaunchsite.php`        | GET    | Add a launch site                    |
| `addfrequency.php`         | GET    | Add a frequency                      |
| `addpredictiondata.php`    | POST   | Upload prediction data               |
| `deleteflight.php`         | GET    | Delete a flight                      |
| `deletebeacon.php`         | GET    | Remove a beacon from a flight        |
| `deletetracker.php`        | GET    | Delete a tracker                     |
| `deletelaunchsite.php`     | GET    | Delete a launch site                 |
| `deletefrequency.php`      | GET    | Delete a frequency                   |
| `rmpredictiondata.php`     | GET    | Remove prediction data               |
| `trackflight.php`          | GET    | Toggle flight active status          |
| `changeassignedflight.php` | GET    | Change tracker's assigned flight     |
| `changetrackerteam.php`    | GET    | Change tracker's team assignment     |
| `changelaunchsite.php`     | GET    | Change flight's launch site          |
| `grabprediction.php`       | GET    | Fetch/import prediction from source  |


## Database Schema (key tables)

The application relies on these PostgreSQL/PostGIS tables:

- **packets** -- All APRS packets (primary data table). Columns include tm, callsign,
  altitude, speed_mph, bearing, location2d (geometry), location3d (geometry), raw, ptype,
  hash, source, channel, frequency. Primary key: (tm, source, channel, callsign, hash).
- **flights** -- Flight definitions (flightid, active flag, launchsite reference).
- **flightmap** -- Maps callsigns to flights (flightid, callsign).
- **landingpredictions** -- Predicted landing locations with flight paths (geometry),
  TTL, wind data arrays. Indexed on tm.
- **launchsites** -- Launch site definitions (name, lat, lon, alt).
- **teams** -- Tactical team names.
- **trackers** -- Tracker definitions (callsign, tactical name, team, notes).
- **predictiondata** -- Uploaded prediction file data (altitude, lat, lon per time step).
- **gpsposition** -- GPS position data (for mobile tracker units, if present).
- **freqs** -- Frequency list for SDR monitoring.


## Maintenance Notes

- The `configuration/` directory must be writable by the `www-data` user (Apache).
  The backend daemon sets permissions to 777 on startup (see `habtracker-daemon.py`).
- The `audio/` directory must also be writable by `www-data` for audio alert state files.
- The backend daemon (`bin/habtracker-daemon.py`) writes `www/daemonstatus.json` for
  process status reporting.
- The `map.orig.js` file appears to be a backup copy of a previous version of `map.js`.
  It can be removed if no longer needed.
- Database credentials are hardcoded in both `common/database.php` and `bin/habconfig.py`.
  They must match. Consider moving to environment variables or a shared config file
  outside the web root in a future refactor.
