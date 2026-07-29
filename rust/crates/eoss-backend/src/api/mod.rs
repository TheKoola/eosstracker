//! The `/api/*` HTTP surface: config, status, SSE, and a health probe.

mod config;
mod sse;
mod status;

use std::net::SocketAddr;

use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use tracing::info;

use crate::state::AppState;

/// Build the router with all routes and shared state attached.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/config", get(config::get_config))
        .route("/api/status", get(status::get_status))
        .route("/api/sse", get(sse::sse_handler))
        .with_state(state)
}

/// Trivial liveness probe for the reverse proxy.
async fn health() -> &'static str {
    "ok"
}

/// Bind `addr` and serve until `shutdown` is cancelled.
pub async fn serve(
    addr: SocketAddr,
    state: AppState,
    shutdown: CancellationToken,
) -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind(addr).await?;
    info!(%addr, "HTTP server listening");
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async move { shutdown.cancelled().await })
        .await?;
    Ok(())
}
