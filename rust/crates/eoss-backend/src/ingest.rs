//! Packet ingest: subscribe to `aprs-streamd`'s multicast, map each decoded frame
//! to the legacy `packets` columns, insert it, and publish a `packet` event on the
//! in-process bus so the SSE endpoint can push it to browsers.
//!
//! This is the chunk-1 ingest loop, now (chunk 2) folded into the merged backend
//! and wired to the [`Bus`](crate::bus::Bus).

use std::sync::atomic::Ordering;

use aprs_stream::subscribe::{SubscribeConfig, Subscriber};
use tokio_postgres::{Client, Statement};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use crate::bus::{now_ms, Event};
use crate::map::{map_frame, PacketRow, SOURCE_TAG};
use crate::state::AppState;

/// The single parameterized INSERT. `tm`/`channel` are constants; `location2d`/
/// `location3d` are NULL for positionless packets (`ST_GeometryFromText` is STRICT,
/// so a NULL WKT yields NULL geometry). `ON CONFLICT DO NOTHING` guards duplicate
/// frames on the `(tm, source, channel, callsign, hash)` primary key.
const INSERT_SQL: &str = "\
insert into packets
    (tm, source, channel, frequency, callsign, symbol, speed_mph, bearing,
     altitude, comment, location2d, location3d, raw, ptype, hash)
values (
    now()::timestamp with time zone,
    $1,
    0,
    $2::float8::numeric,
    $3,
    $4,
    round(($5::float8)::numeric),
    $6::float8::numeric,
    round(($7::float8)::numeric),
    $8,
    ST_GeometryFromText($9, 4326),
    ST_GeometryFromText($10, 4326),
    $11,
    $12,
    md5($13)
)
on conflict do nothing";

/// Run the ingest loop until `shutdown` is cancelled. Prepares its own INSERT
/// statement from the shared client, joins the multicast group, and processes one
/// decoded frame per datagram. Per-frame errors are logged and skipped — one bad
/// datagram never ends the loop.
pub async fn run_ingest(
    state: AppState,
    shutdown: CancellationToken,
) -> Result<(), Box<dyn std::error::Error>> {
    let stmt = state.db.prepare(INSERT_SQL).await?;
    info!("insert statement prepared");

    let sub = Subscriber::new(SubscribeConfig::new(state.emit_group, state.emit_port))?;
    info!(group = %state.emit_group, port = state.emit_port,
        "joined multicast group; waiting for frames");

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                let c = state.counters.snapshot();
                info!(frames = c.frames_received, inserted = c.inserted, skipped = c.skipped,
                    "ingest shutting down");
                break;
            }
            result = sub.recv_frame() => {
                match result {
                    Ok((frame, _from)) => {
                        state.counters.frames_received.fetch_add(1, Ordering::Relaxed);
                        match map_frame(&frame) {
                            Some(row) => handle_row(&state, &stmt, row).await,
                            None => debug!("frame produced no writable row; skipping"),
                        }
                    }
                    Err(e) => warn!(error = %e, "skipping bad datagram"),
                }
            }
        }
    }

    Ok(())
}

/// Insert one mapped row and, if it was newly written (not a duplicate), publish it
/// to the bus and bump the counters.
async fn handle_row(state: &AppState, stmt: &Statement, row: PacketRow) {
    match insert_row(&state.db, stmt, &row).await {
        Ok(true) => {
            state.counters.inserted.fetch_add(1, Ordering::Relaxed);
            state
                .counters
                .last_packet_ms
                .store(now_ms(), Ordering::Relaxed);
            // Fan out to any connected SSE clients. `publish` never blocks; a 0
            // return just means nobody is currently listening.
            state.bus.publish(Event::packet(row.to_event_data()));
            debug!(callsign = %row.callsign, "inserted packet");
        }
        Ok(false) => {
            state.counters.skipped.fetch_add(1, Ordering::Relaxed);
        }
        Err(e) => error!(error = %e, callsign = %row.callsign, "insert failed"),
    }
}

/// Execute the INSERT for one row. Returns `Ok(true)` if a row was inserted,
/// `Ok(false)` if `ON CONFLICT` skipped a duplicate.
async fn insert_row(
    client: &Client,
    stmt: &Statement,
    row: &PacketRow,
) -> Result<bool, tokio_postgres::Error> {
    let affected = client
        .execute(
            stmt,
            &[
                &SOURCE_TAG,
                &row.frequency_hz,
                &row.callsign,
                &row.symbol,
                &row.speed_mph,
                &row.bearing,
                &row.altitude_ft,
                &row.comment,
                &row.loc2d_wkt,
                &row.loc3d_wkt,
                &row.raw,
                &row.ptype,
                &row.info,
            ],
        )
        .await?;
    Ok(affected > 0)
}
