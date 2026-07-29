//! In-process event bus.
//!
//! The backend publishes typed [`Event`]s here; the `/api/sse` handler subscribes
//! and fans them out to connected browsers. Using an in-process
//! `tokio::sync::broadcast` (rather than routing packet events back through
//! Postgres `LISTEN`/`NOTIFY`) keeps delivery immediate — a packet inserted by the
//! ingest task is available to push over SSE in the same process, no round-trip.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::sync::broadcast;

/// Broadcast channel capacity. A slow SSE subscriber that falls this far behind
/// gets a `Lagged` error (handled in the SSE handler) instead of applying
/// backpressure to ingest.
pub const BUS_CAPACITY: usize = 1024;

/// The kind of event: serialized as the `type` field and used as the SSE `event:`
/// name. `#[non_exhaustive]` so later chunks can add flight / tracker / prediction
/// kinds without breaking existing `match` arms.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum EventKind {
    Packet,
    Heartbeat,
}

impl EventKind {
    /// The SSE `event:` name for this kind.
    pub fn as_str(self) -> &'static str {
        match self {
            EventKind::Packet => "packet",
            EventKind::Heartbeat => "heartbeat",
        }
    }
}

/// One event on the bus. Serializes to the wire envelope `{type, ts, data}`.
#[derive(Debug, Clone, Serialize)]
pub struct Event {
    #[serde(rename = "type")]
    pub kind: EventKind,
    /// Milliseconds since the Unix epoch (server clock).
    pub ts: u64,
    pub data: serde_json::Value,
}

impl Event {
    pub fn new(kind: EventKind, data: serde_json::Value) -> Self {
        Self {
            kind,
            ts: now_ms(),
            data,
        }
    }

    pub fn packet(data: serde_json::Value) -> Self {
        Self::new(EventKind::Packet, data)
    }

    pub fn heartbeat() -> Self {
        Self::new(EventKind::Heartbeat, serde_json::Value::Null)
    }
}

/// Current wall-clock time in milliseconds since the Unix epoch.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The bus handle. Cloneable and cheap; held in shared app state.
#[derive(Clone)]
pub struct Bus {
    tx: broadcast::Sender<Arc<Event>>,
}

impl Bus {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(BUS_CAPACITY);
        Self { tx }
    }

    /// Publish an event. Returns the number of subscribers it reached (0 is fine —
    /// nobody may be listening). Never blocks.
    pub fn publish(&self, event: Event) -> usize {
        // `send` errors only when there are zero receivers; treat that as "reached 0".
        self.tx.send(Arc::new(event)).unwrap_or(0)
    }

    /// Subscribe to every event published from now on.
    pub fn subscribe(&self) -> broadcast::Receiver<Arc<Event>> {
        self.tx.subscribe()
    }

    /// Number of currently-connected subscribers (reported by `/api/status`).
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

impl Default for Bus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_envelope_serializes_with_type_ts_and_data() {
        let ev = Event::packet(serde_json::json!({ "callsign": "W1AW-11" }));
        let v = serde_json::to_value(&ev).unwrap();
        assert_eq!(v["type"], "packet");
        assert_eq!(v["data"]["callsign"], "W1AW-11");
        assert!(v["ts"].as_u64().unwrap() > 0);
    }

    #[test]
    fn heartbeat_kind_is_snake_case() {
        assert_eq!(EventKind::Heartbeat.as_str(), "heartbeat");
        let v = serde_json::to_value(Event::heartbeat()).unwrap();
        assert_eq!(v["type"], "heartbeat");
        assert!(v["data"].is_null());
    }

    #[tokio::test]
    async fn publish_reaches_subscribers() {
        let bus = Bus::new();
        let mut rx = bus.subscribe();
        assert_eq!(bus.subscriber_count(), 1);
        let reached = bus.publish(Event::packet(serde_json::json!({ "n": 1 })));
        assert_eq!(reached, 1);
        let got = rx.recv().await.unwrap();
        assert_eq!(got.kind, EventKind::Packet);
        assert_eq!(got.data["n"], 1);
    }
}
