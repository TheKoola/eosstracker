//! `GET /api/status` — the Rust backend's own status.

use std::path::Path;

use axum::extract::State;
use axum::response::Json;
use serde_json::{json, Value};

use crate::bus::now_ms;
use crate::state::AppState;

/// Return backend/ingest/db/sse status, plus a pass-through of the legacy
/// `daemonstatus.json` and `gpsstatus.json` so that data stays reachable via `/api`.
/// (This does not yet replace `getstatus.php`.)
pub async fn get_status(State(state): State<AppState>) -> Json<Value> {
    let c = state.counters.snapshot();

    // Cheap DB liveness probe.
    let db_connected = state.db.simple_query("select 1").await.is_ok();

    let daemon = read_json_file(&state.www_dir.join("daemonstatus.json"));
    let gps = read_json_file(&state.www_dir.join("gpsstatus.json"));

    Json(json!({
        "backend": {
            "name": env!("CARGO_PKG_NAME"),
            "version": env!("CARGO_PKG_VERSION"),
            "uptime_seconds": state.started.elapsed().as_secs(),
            "start_time_ms": state.started_ms,
            "now_ms": now_ms(),
        },
        "ingest": {
            "multicast_group": state.emit_group.to_string(),
            "multicast_port": state.emit_port,
            "frames_received": c.frames_received,
            "inserted": c.inserted,
            "skipped": c.skipped,
            "last_packet_ms": c.last_packet_ms,
        },
        "db": { "connected": db_connected },
        "sse": { "clients": state.bus.subscriber_count() },
        "daemon": daemon,
        "gps": gps,
    }))
}

/// Read and parse a JSON file, returning `Value::Null` on any error.
fn read_json_file(path: &Path) -> Value {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}
