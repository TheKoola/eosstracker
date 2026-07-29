# eoss-backend

The EOSSTracker Rust backend — the growing replacement for the legacy Python
`habtracker-daemon`. One process runs two concurrent jobs that share an in-process
event bus:

- **ingest** — subscribes to the locally-running
  [`aprs-streamd`](https://github.com/deatojef/aprs-stream) multicast stream, decodes
  each CBOR `AprsFrame`, and writes it into the existing PostgreSQL `packets` table
  (so the current PHP/Leaflet frontend and live map keep working). This replaces the
  old RF path (RTL-SDR + GnuRadio + Direwolf + aprsc + `aprslib` + the Python
  `databasewriter`).
- **api** — an [axum](https://docs.rs/axum) HTTP server on `127.0.0.1:3000` exposing
  `/api/*` endpoints and an SSE stream, meant to be reverse-proxied by Apache.

Refactor history: chunk 1 built the ingest daemon (`eoss-ingest`); chunk 2 folded it
into this merged `eoss-backend` and added the `/api` + SSE backbone. Storage stays
PostgreSQL for now — `native_db` is a later chunk.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /api/health` | Trivial `200 ok` liveness probe for the proxy. |
| `GET /api/config` | Station/app config. Mirrors `www/readconfiguration.php`: `configuration/config.txt` merged over `configuration/defaults.txt` (config wins; `plottracks` forced `off`). |
| `GET /api/status` | Backend/ingest/db/sse status, plus pass-through of `daemonstatus.json` and `gpsstatus.json`. |
| `GET /api/sse` | `text/event-stream`: live `packet` events as they are ingested, plus periodic `heartbeat` events. |

### SSE event envelope

Every event is an envelope `{type, ts, data}`; the SSE `event:` name mirrors `type`
(so clients can `addEventListener("packet", …)` or use the generic `onmessage`).

```
event: packet
data: {"type":"packet","ts":1785358887798,"data":{"callsign":"WA0DE-9","source":"ka9q-radio",
       "symbol":"/#","lat":39.3935,"lon":-104.6748,"altitude":0.0,"speed_mph":0.0,"bearing":0.0,
       "frequency":144390000.0,"ptype":"/","comment":"APRS Voyager U=14.0V.","raw":"WA0DE-9>APMI0,...:/..."}}

event: heartbeat
data: {"type":"heartbeat","ts":1785358897679,"data":null}
```

Packet events come straight off the in-process bus (the ingest task publishes each
newly-inserted, non-duplicate packet) — no Postgres `LISTEN`/`NOTIFY` round-trip, so
delivery is immediate. Future event kinds (flights, trackers, predictions, …) slot
into the same envelope.

## Build

```sh
cd /eosstracker/rust
cargo build --release        # binary at target/release/eoss-backend
cargo test                   # frame→row mapping + event-envelope unit tests
```

`aprs-stream` is currently a path dependency on this host's clone at
`/home/eosstracker/aprs-stream`; switch it to a pinned git tag when packaging.

## Run

`aprs-streamd` must be running (it already runs as a systemd service on the test Pi):

```sh
systemctl status aprs-streamd
./target/release/eoss-backend
```

Logs go to stderr via `tracing`; raise verbosity with `RUST_LOG=eoss_backend=debug`.

### Configuration / environment

| Variable | Default | Purpose |
|---|---|---|
| `EOSS_DB` | `host=localhost dbname=aprs user=eosstracker password=…` | PostgreSQL connection string (libpq key/value form). |
| `EOSS_API_ADDR` | `127.0.0.1:3000` | HTTP bind address. |
| `EOSS_WWW_DIR` | `/eosstracker/www` | Web root holding `configuration/config.txt`, `daemonstatus.json`, etc. |
| `APRS_EMIT_GROUP` | from `/etc/aprs-streamd/config.toml` | Override the multicast group. |
| `APRS_EMIT_PORT` | from config file | Override the multicast port. |
| `RUST_LOG` | `eoss_backend=info` | Log filter. |

## Verify

```sh
curl -s http://127.0.0.1:3000/api/health
curl -s http://127.0.0.1:3000/api/config  | python3 -m json.tool
curl -s http://127.0.0.1:3000/api/status  | python3 -m json.tool
curl -sN http://127.0.0.1:3000/api/sse            # heartbeats immediately; packets as RF arrives
```

## Apache reverse proxy

`/api/*` is meant to be proxied by Apache. Enable the proxy modules and add this to
both `000-default.conf` and `default-ssl.conf` (then reload):

```apache
<Location /api>
    ProxyPass        http://127.0.0.1:3000/api flushpackets=on
    ProxyPassReverse http://127.0.0.1:3000/api
    ProxyPreserveHost On
    # SSE must stream, not buffer:
    SetEnv proxy-sendchunked 1
    SetEnvIf Request_URI "^/api/sse" no-gzip=1 dont-vary=1
</Location>
ProxyTimeout 3600
```

```sh
sudo a2enmod proxy proxy_http
sudo systemctl reload apache2
```

`flushpackets=on` + `no-gzip` on `/api/sse` are what make SSE timely through Apache;
the ~20s heartbeat keeps idle streams under `ProxyTimeout`.

## Relationship to the Python backend

The trimmed `habtracker-daemon.py` still runs the GPS poller, landing predictor,
status JSON, and DB schema checks (including the `packets`/`gpsposition` `NOTIFY`
triggers). It no longer starts Direwolf, aprsc, GnuRadio, the connector taps, or the
database writer. Run both during this interim: `eoss-backend` owns packet ingest and
the `/api` + SSE surface; the Python daemon owns GPS/prediction/status.
