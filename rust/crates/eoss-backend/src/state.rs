//! Shared application state, held by both the ingest task and the axum handlers.

use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use tokio_postgres::Client;

use crate::bus::Bus;

/// Ingest + runtime counters, shared (behind an `Arc`) between the ingest loop and
/// the `/api/status` handler.
#[derive(Default)]
pub struct Counters {
    /// Datagrams received from the multicast stream.
    pub frames_received: AtomicU64,
    /// Rows actually written to `packets`.
    pub inserted: AtomicU64,
    /// Duplicate frames dropped by `ON CONFLICT DO NOTHING`.
    pub skipped: AtomicU64,
    /// Wall-clock ms of the most recent inserted packet (`0` = none yet).
    pub last_packet_ms: AtomicU64,
}

impl Counters {
    pub fn snapshot(&self) -> CountersSnapshot {
        CountersSnapshot {
            frames_received: self.frames_received.load(Ordering::Relaxed),
            inserted: self.inserted.load(Ordering::Relaxed),
            skipped: self.skipped.load(Ordering::Relaxed),
            last_packet_ms: match self.last_packet_ms.load(Ordering::Relaxed) {
                0 => None,
                v => Some(v),
            },
        }
    }
}

/// A point-in-time read of [`Counters`] for the status endpoint.
pub struct CountersSnapshot {
    pub frames_received: u64,
    pub inserted: u64,
    pub skipped: u64,
    pub last_packet_ms: Option<u64>,
}

/// Shared application state. Cheap to clone — every shared field is `Arc`/`Copy`.
#[derive(Clone)]
pub struct AppState {
    pub bus: Bus,
    pub db: Arc<Client>,
    pub counters: Arc<Counters>,
    /// Monotonic start instant, for uptime.
    pub started: Instant,
    /// Wall-clock start time (ms since epoch), for display.
    pub started_ms: u64,
    pub emit_group: Ipv4Addr,
    pub emit_port: u16,
    /// Web root holding `configuration/config.txt`, `daemonstatus.json`, etc.
    pub www_dir: PathBuf,
}
