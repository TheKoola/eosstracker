//! `GET /api/sse` — the Server-Sent Events stream.
//!
//! Each connection subscribes to the in-process [`Bus`](crate::bus::Bus) and streams
//! every published event, plus a periodic `heartbeat`, as SSE. The SSE `event:` name
//! mirrors the event kind (so browsers can `addEventListener("packet", …)`), and the
//! `data:` line is the full `{type, ts, data}` envelope.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::IntoResponse;
use futures_util::stream::Stream;
use tokio::sync::broadcast::{self, error::RecvError};
use tokio::time::{interval, Interval, MissedTickBehavior};
use tracing::{debug, warn};

use crate::bus::Event;
use crate::state::AppState;

/// How often to emit an explicit `heartbeat` event. Keeps idle streams (and the
/// Apache proxy) warm; the first tick fires immediately on connect.
const HEARTBEAT: Duration = Duration::from_secs(20);

pub async fn sse_handler(State(state): State<AppState>) -> impl IntoResponse {
    let rx = state.bus.subscribe();
    let mut hb = interval(HEARTBEAT);
    // If a heartbeat tick is missed (e.g. the client is slow), just delay the next
    // one rather than firing a burst.
    hb.set_missed_tick_behavior(MissedTickBehavior::Delay);

    Sse::new(event_stream(rx, hb)).keep_alive(KeepAlive::new())
}

/// Merge bus events and heartbeats into a single SSE stream. Lagged slow clients are
/// resynced by skipping missed events; a closed bus ends the stream.
fn event_stream(
    rx: broadcast::Receiver<Arc<Event>>,
    hb: Interval,
) -> impl Stream<Item = Result<SseEvent, Infallible>> {
    futures_util::stream::unfold((rx, hb), |(mut rx, mut hb)| async move {
        loop {
            tokio::select! {
                _ = hb.tick() => {
                    return Some((Ok(to_sse(&Event::heartbeat())), (rx, hb)));
                }
                msg = rx.recv() => match msg {
                    Ok(event) => return Some((Ok(to_sse(&event)), (rx, hb))),
                    Err(RecvError::Lagged(n)) => {
                        warn!(missed = n, "SSE client lagged; skipping missed events");
                        continue;
                    }
                    Err(RecvError::Closed) => {
                        debug!("event bus closed; ending SSE stream");
                        return None;
                    }
                },
            }
        }
    })
}

/// Render an [`Event`] as an SSE frame: `event:` = kind, `data:` = the JSON envelope.
fn to_sse(event: &Event) -> SseEvent {
    let json = serde_json::to_string(event).unwrap_or_else(|_| "{}".to_string());
    SseEvent::default().event(event.kind.as_str()).data(json)
}
