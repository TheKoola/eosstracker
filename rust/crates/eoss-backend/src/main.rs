//! eoss-backend — the EOSSTracker Rust backend.
//!
//! One process, two concurrent jobs sharing an in-process event [`bus`]:
//!
//! - **ingest** (`ingest.rs`): subscribes to the local `aprs-streamd` multicast,
//!   maps each decoded APRS frame to the legacy PostgreSQL `packets` columns, writes
//!   it, and publishes a `packet` event.
//! - **api** (`api/`): an axum HTTP server on `127.0.0.1:3000` serving `/api/config`,
//!   `/api/status`, and the `/api/sse` event stream (proxied by Apache).
//!
//! This is chunk 2 of the backend refactor: it folds the chunk-1 ingest daemon into
//! a merged backend and adds the `/api` + SSE backbone. Storage stays PostgreSQL for
//! now (native_db is a later chunk); the legacy PHP/Leaflet frontend keeps working.

mod api;
mod bus;
mod ingest;
mod map;
mod state;

use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use serde::Deserialize;
use tokio_postgres::{Client, NoTls};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::bus::{now_ms, Bus};
use crate::state::{AppState, Counters};

/// `aprs-streamd`'s built-in default emit group/port (used only if the config file
/// is missing and no env override is set). The live Pi config uses 239.12.34.57.
const DEFAULT_GROUP: Ipv4Addr = Ipv4Addr::new(239, 12, 34, 56);
const DEFAULT_PORT: u16 = 17_014;

/// Config search order: deployed location first, then a dev-local `config.toml`.
const CONFIG_PATHS: &[&str] = &["/etc/aprs-streamd/config.toml", "config.toml"];

/// Default PostgreSQL connection — mirrors the legacy `bin/habconfig.py`. Override
/// the whole string with the `EOSS_DB` environment variable.
const DEFAULT_DB: &str =
    "host=localhost dbname=aprs user=eosstracker password=Thisisthedatabasepassword!";

/// Default HTTP bind address; override with `EOSS_API_ADDR`.
const DEFAULT_ADDR: &str = "127.0.0.1:3000";

/// Default web root (holds `configuration/config.txt`, `daemonstatus.json`, …);
/// override with `EOSS_WWW_DIR`.
const DEFAULT_WWW_DIR: &str = "/eosstracker/www";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "eoss_backend=info".into()),
        )
        .init();

    let (group, port) = load_emit()?;
    let conn_str = std::env::var("EOSS_DB").unwrap_or_else(|_| DEFAULT_DB.to_string());
    let www_dir =
        PathBuf::from(std::env::var("EOSS_WWW_DIR").unwrap_or_else(|_| DEFAULT_WWW_DIR.to_string()));
    let addr: SocketAddr = std::env::var("EOSS_API_ADDR")
        .unwrap_or_else(|_| DEFAULT_ADDR.to_string())
        .parse()?;

    let client = connect_db(&conn_str).await?;
    info!("connected to postgres");

    let state = AppState {
        bus: Bus::new(),
        db: Arc::new(client),
        counters: Arc::new(Counters::default()),
        started: Instant::now(),
        started_ms: now_ms(),
        emit_group: group,
        emit_port: port,
        www_dir,
    };

    // One cancellation token drives graceful shutdown of both jobs.
    let token = CancellationToken::new();
    {
        let token = token.clone();
        tokio::spawn(async move {
            wait_for_shutdown_signal().await;
            info!("shutdown signal received");
            token.cancel();
        });
    }

    // HTTP server runs as a spawned task; ingest runs on the main task (the
    // multicast `Subscriber` need not be `Send`).
    let server = {
        let state = state.clone();
        let token = token.clone();
        tokio::spawn(async move {
            if let Err(e) = api::serve(addr, state, token).await {
                error!(error = %e, "HTTP server error");
            }
        })
    };

    if let Err(e) = ingest::run_ingest(state, token.clone()).await {
        error!(error = %e, "ingest error; shutting down");
        token.cancel();
    }

    // Ensure the server is told to stop (in case ingest exited first), then wait.
    token.cancel();
    let _ = server.await;
    info!("eoss-backend stopped");
    Ok(())
}

/// Connect to PostgreSQL and spawn the connection driver task.
async fn connect_db(conn_str: &str) -> Result<Client, Box<dyn std::error::Error>> {
    let (client, connection) = tokio_postgres::connect(conn_str, NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            error!(error = %e, "postgres connection error");
        }
    });
    Ok(client)
}

/// A future that resolves on the first SIGINT or SIGTERM.
async fn wait_for_shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = signal(SignalKind::terminate()).expect("install SIGTERM handler");
        let mut int = signal(SignalKind::interrupt()).expect("install SIGINT handler");
        tokio::select! {
            _ = term.recv() => {}
            _ = int.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

// ---------------------------------------------------------------------------
// aprs-streamd emit config (group/port), with env overrides.
// ---------------------------------------------------------------------------

/// The `[emit]` subset of `aprs-streamd`'s config we care about.
#[derive(Debug, Default, Deserialize)]
struct StreamdConfig {
    #[serde(default)]
    emit: EmitSection,
}

#[derive(Debug, Deserialize)]
struct EmitSection {
    #[serde(default = "default_group")]
    group: Ipv4Addr,
    #[serde(default = "default_port")]
    port: u16,
}

impl Default for EmitSection {
    fn default() -> Self {
        Self {
            group: default_group(),
            port: default_port(),
        }
    }
}

fn default_group() -> Ipv4Addr {
    DEFAULT_GROUP
}
fn default_port() -> u16 {
    DEFAULT_PORT
}

/// Read the emit group/port from the first config file found, with env overrides.
fn load_emit() -> Result<(Ipv4Addr, u16), Box<dyn std::error::Error>> {
    let (mut group, mut port) = (DEFAULT_GROUP, DEFAULT_PORT);
    let mut found = false;
    for path in CONFIG_PATHS.iter().map(Path::new) {
        if !path.exists() {
            continue;
        }
        let text = std::fs::read_to_string(path)?;
        let cfg: StreamdConfig =
            toml::from_str(&text).map_err(|e| format!("parsing {}: {e}", path.display()))?;
        group = cfg.emit.group;
        port = cfg.emit.port;
        info!(config = %path.display(), "loaded aprs-streamd emit config");
        found = true;
        break;
    }
    if !found {
        warn!("no aprs-streamd config found; using built-in defaults");
    }
    group = parse_env("APRS_EMIT_GROUP", group);
    port = parse_env("APRS_EMIT_PORT", port);
    Ok((group, port))
}

fn parse_env<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
