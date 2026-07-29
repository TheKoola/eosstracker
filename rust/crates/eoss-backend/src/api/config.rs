//! `GET /api/config` — station/app configuration.

use std::path::Path;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde_json::{Map, Value};
use tracing::warn;

use crate::state::AppState;

/// Return the merged configuration, mirroring `www/readconfiguration.php`: read
/// `configuration/config.txt`, fill any missing keys from
/// `configuration/defaults.txt`, and force `plottracks=off` for parity.
pub async fn get_config(State(state): State<AppState>) -> impl IntoResponse {
    let config_path = state.www_dir.join("configuration/config.txt");
    let defaults_path = state.www_dir.join("configuration/defaults.txt");

    let mut merged = read_json_object(&defaults_path);
    let config = read_json_object(&config_path);

    if merged.is_empty() && config.is_empty() {
        warn!(config = %config_path.display(), "no configuration files could be read");
        return (StatusCode::INTERNAL_SERVER_ERROR, "configuration unavailable").into_response();
    }

    // config.txt values win over defaults.
    for (k, v) in config {
        merged.insert(k, v);
    }
    // Parity with readconfiguration.php: plottracks stays off.
    merged.insert("plottracks".into(), Value::String("off".into()));

    Json(Value::Object(merged)).into_response()
}

/// Read a file expected to hold a flat JSON object; returns an empty map on any
/// error (missing file, bad JSON, or a non-object top level).
fn read_json_object(path: &Path) -> Map<String, Value> {
    match std::fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(m)) => m,
            _ => Map::new(),
        },
        Err(_) => Map::new(),
    }
}
