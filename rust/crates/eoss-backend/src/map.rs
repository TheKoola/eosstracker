//! Map a decoded [`AprsFrame`] into the column values the legacy PostgreSQL
//! `packets` table expects.
//!
//! This mirrors the behavior of the old Python `databasewriter.writeToDatabase()`
//! so the PHP frontend, live map, and NOTIFY path keep working unchanged — but it
//! reads the *typed* payload (`aprs_decode`) the producer already parsed, instead
//! of re-parsing raw text with `aprslib`.
//!
//! Unit notes (verified against `aprs-decode` 0.1.2, and different from aprslib):
//! - speed is in **knots** (`Extension::DirectionSpeed`, `MicESpeed`, compressed
//!   `CourseSpeed`) → mph via [`KNOTS_TO_MPH`]. (aprslib used km/h.)
//! - `/A=` and compressed altitude are already **feet** (`Altitude::feet`); only
//!   Mic-E carries meters (`altitude_m`) → feet via [`METERS_TO_FEET`].

use aprs_stream::aprs_decode::{AprsData, CompressedCs, Extension, Position};
use aprs_stream::AprsFrame;

/// Knots → statute miles per hour.
const KNOTS_TO_MPH: f64 = 1.150_779;
/// Meters → feet.
const METERS_TO_FEET: f64 = 3.280_84;

/// `packets.source` tag for everything this daemon writes. `aprs-streamd` replaces
/// the old ka9q-radio / direwolf RF path, and several PHP endpoints treat
/// `source like 'ka9q-radio%'` as "heard over RF", so we reuse that tag.
pub const SOURCE_TAG: &str = "ka9q-radio";

/// One row destined for the `packets` table. `tm`, `channel` (always 0) and the
/// `md5(info)` hash are applied SQL-side by the writer.
#[derive(Debug, Clone, PartialEq)]
pub struct PacketRow {
    pub frequency_hz: Option<f64>,
    pub callsign: String,
    pub symbol: String,
    pub speed_mph: f64,
    pub bearing: f64,
    pub altitude_ft: f64,
    pub comment: String,
    /// Decimal latitude, or `None` for positionless packets. Carried alongside the
    /// WKT so the SSE event can emit clean numeric coordinates.
    pub lat: Option<f64>,
    /// Decimal longitude, or `None` for positionless packets.
    pub lon: Option<f64>,
    /// WKT `POINT(lon lat)`, or `None` for positionless packets.
    pub loc2d_wkt: Option<String>,
    /// WKT `POINTZ(lon lat alt)`, present whenever `loc2d_wkt` is.
    pub loc3d_wkt: Option<String>,
    /// Reconstructed TNC2 line (`FROM>TO,VIA:info`), NUL-stripped and trimmed.
    pub raw: String,
    /// APRS data-type character (first byte of the info field).
    pub ptype: String,
    /// The full info field (DTI included) — hashed with `md5()` for dedup.
    pub info: String,
}

impl PacketRow {
    /// The `data` payload for a `packet` SSE event: the same packet in clean JSON
    /// (numeric `lat`/`lon` rather than WKT). `source` is the constant
    /// [`SOURCE_TAG`]; the `null` fields are simply omitted where absent.
    pub fn to_event_data(&self) -> serde_json::Value {
        serde_json::json!({
            "callsign": self.callsign,
            "source": SOURCE_TAG,
            "symbol": self.symbol,
            "lat": self.lat,
            "lon": self.lon,
            "altitude": self.altitude_ft,
            "speed_mph": self.speed_mph,
            "bearing": self.bearing,
            "frequency": self.frequency_hz,
            "ptype": self.ptype,
            "comment": self.comment,
            "raw": self.raw,
        })
    }
}

/// Position-derived fields shared by Position / Object / Item / Mic-E packets.
#[derive(Default)]
struct Derived {
    symbol: String,
    speed_mph: f64,
    bearing: f64,
    altitude_ft: f64,
    comment: String,
    lat: Option<f64>,
    lon: Option<f64>,
    loc2d_wkt: Option<String>,
    loc3d_wkt: Option<String>,
}

/// Build the `packets` row for a frame, or `None` if we can't even determine a
/// callsign (callsign is `NOT NULL` in the table — better to drop than to guess).
pub fn map_frame(frame: &AprsFrame) -> Option<PacketRow> {
    let raw = raw_text(frame)?;
    let mut callsign = default_callsign(frame)?;

    let mut d = Derived::default();
    if let Some(pkt) = &frame.parsed {
        match &pkt.data {
            AprsData::Position(p) => d = from_position(&p.position, &p.extension, &p.comment),
            AprsData::Object(o) => {
                callsign = name_string(&o.name);
                d = from_position(&o.position, &o.extension, &o.comment);
            }
            AprsData::Item(i) => {
                callsign = name_string(&i.name);
                d = from_position(&i.position, &i.extension, &i.comment);
            }
            AprsData::MicE(m) => {
                let lon = m.longitude.value();
                let lat = m.latitude.value();
                let alt_ft = m.altitude_m.map(|mtr| mtr * METERS_TO_FEET).unwrap_or(0.0);
                d = Derived {
                    symbol: symbol_string(m.symbol_table, m.symbol_code),
                    speed_mph: m.speed.knots() as f64 * KNOTS_TO_MPH,
                    bearing: m.course.degrees() as f64,
                    altitude_ft: alt_ft,
                    comment: bytes_to_string(&m.comment),
                    lat: Some(lat),
                    lon: Some(lon),
                    loc2d_wkt: Some(format!("POINT({lon} {lat})")),
                    loc3d_wkt: Some(format!("POINTZ({lon} {lat} {alt_ft})")),
                };
            }
            // Message, Status, Telemetry, Weather, etc.: no location — mirror the
            // legacy "packet without lat/lon" insert (NULL geometry, zeros).
            _ => {}
        }
    }

    let (ptype, info) = split_info(&raw);

    Some(PacketRow {
        frequency_hz: frame.rf.frequency_hz.map(|hz| hz as f64),
        callsign: callsign.trim().to_string(),
        symbol: d.symbol,
        speed_mph: d.speed_mph,
        bearing: d.bearing,
        altitude_ft: d.altitude_ft,
        comment: d.comment,
        lat: d.lat,
        lon: d.lon,
        loc2d_wkt: d.loc2d_wkt,
        loc3d_wkt: d.loc3d_wkt,
        raw,
        ptype,
        info,
    })
}

/// Derive symbol/course/speed/altitude/comment/geometry from a parsed position.
fn from_position(pos: &Position, ext: &Option<Extension>, comment: &[u8]) -> Derived {
    let lon = pos.longitude.value();
    let lat = pos.latitude.value();
    let (bearing, speed_mph) = course_speed(pos, ext);
    let altitude_ft = altitude_ft(pos).unwrap_or(0.0);
    Derived {
        symbol: symbol_string(pos.symbol.table, pos.symbol.code),
        speed_mph,
        bearing,
        altitude_ft,
        comment: bytes_to_string(comment),
        lat: Some(lat),
        lon: Some(lon),
        loc2d_wkt: Some(format!("POINT({lon} {lat})")),
        loc3d_wkt: Some(format!("POINTZ({lon} {lat} {altitude_ft})")),
    }
}

/// Course (degrees) and speed (mph) from the comment extension, or the compressed
/// csT block, else `(0, 0)`.
fn course_speed(pos: &Position, ext: &Option<Extension>) -> (f64, f64) {
    if let Some(Extension::DirectionSpeed {
        direction_degrees,
        speed_knots,
    }) = ext
    {
        return (*direction_degrees as f64, *speed_knots as f64 * KNOTS_TO_MPH);
    }
    if let Some(CompressedCs::CourseSpeed(cs, _)) = &pos.compressed_cs {
        return (cs.course_degrees as f64, cs.speed_knots * KNOTS_TO_MPH);
    }
    (0.0, 0.0)
}

/// Altitude in feet from `/A=` (already feet) or the compressed altitude block.
fn altitude_ft(pos: &Position) -> Option<f64> {
    if let Some(a) = pos.altitude {
        return Some(a.feet);
    }
    if let Some(CompressedCs::Altitude(alt, _)) = &pos.compressed_cs {
        return Some(alt.feet);
    }
    None
}

/// Consolidate a symbol into the 2-char form the DB stores: `"/X"` for the
/// primary table, `"\X"` for the alternate, or `"NX"` for an overlay. This equals
/// `table + code` for every case, matching the legacy Python consolidation.
fn symbol_string(table: char, code: char) -> String {
    format!("{table}{code}")
}

/// Reconstruct the canonical TNC2 line for `raw`. Prefer `aprs_decode`'s
/// `encode_textual()`; fall back to the AX.25 framing metadata + verbatim info
/// bytes when the payload is unparsed or can't be re-encoded.
fn raw_text(frame: &AprsFrame) -> Option<String> {
    if let Some(pkt) = &frame.parsed {
        if let Ok(bytes) = pkt.encode_textual() {
            return Some(clean(&String::from_utf8_lossy(&bytes)));
        }
    }
    let m = frame.ax25_meta.as_ref()?;
    let mut s = format!("{}>{}", m.source, m.destination);
    for hop in &m.via {
        s.push(',');
        s.push_str(&hop.call);
        if hop.heard {
            s.push('*');
        }
    }
    s.push(':');
    if let Some(off) = m.info_offset {
        if let Some(info_bytes) = frame.ax25.get(off as usize..) {
            s.push_str(&String::from_utf8_lossy(info_bytes));
        }
    }
    Some(clean(&s))
}

/// Callsign of the transmitting station: the AX.25 source, or the parsed `from`.
/// (Object/Item packets override this with the object/item name in `map_frame`.)
fn default_callsign(frame: &AprsFrame) -> Option<String> {
    if let Some(m) = &frame.ax25_meta {
        if !m.source.is_empty() {
            return Some(m.source.clone());
        }
    }
    frame.parsed.as_ref().map(|p| p.from.to_string())
}

/// Split the reconstructed raw line at the first `:` into `(ptype, info)`, where
/// `ptype` is the first info byte (the DTI) and `info` is the whole info field.
fn split_info(raw: &str) -> (String, String) {
    match raw.split_once(':') {
        Some((_, rest)) if !rest.is_empty() => {
            let ptype = rest.chars().next().map(String::from).unwrap_or_default();
            (ptype, rest.to_string())
        }
        _ => (String::new(), String::new()),
    }
}

fn name_string(name: &[u8]) -> String {
    bytes_to_string(name)
}

fn bytes_to_string(b: &[u8]) -> String {
    clean(&String::from_utf8_lossy(b))
}

/// Strip NUL bytes and trim surrounding whitespace (legacy did the same).
fn clean(s: &str) -> String {
    s.replace('\u{0}', "").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use aprs_stream::aprs_decode::AprsPacket;
    use aprs_stream::proto::{Ax25Meta, CaptureMeta, RfMeta};

    fn frame_for(line: &[u8], freq_hz: Option<u64>) -> AprsFrame {
        let parsed = AprsPacket::decode_textual(line).ok();
        AprsFrame {
            version: 2,
            capture: CaptureMeta {
                received_at_ms: 0,
                receiver: None,
                decoder: None,
                ssrc: None,
            },
            rf: RfMeta {
                frequency_hz: freq_hz,
                ..Default::default()
            },
            crc_ok: true,
            ax25: Vec::new(),
            ax25_meta: Some(Ax25Meta {
                source: String::from_utf8_lossy(&line[..line.iter().position(|&b| b == b'>').unwrap()])
                    .into_owned(),
                ..Default::default()
            }),
            parsed,
        }
    }

    #[test]
    fn uncompressed_position_with_course_speed_and_altitude() {
        // Balloon-style beacon: course 088, speed 036 kt, /A=005000 ft.
        let line = b"W1AW-11>APRS,WIDE2-1:!4903.50N/07201.75W>088/036/A=005000Rising";
        let row = map_frame(&frame_for(line, Some(144_390_000))).unwrap();

        assert_eq!(row.callsign, "W1AW-11");
        assert_eq!(row.symbol, "/>"); // primary table, "Car" symbol code '>'
        assert_eq!(row.frequency_hz, Some(144_390_000.0));
        assert_eq!(row.bearing, 88.0);
        assert_eq!(row.altitude_ft, 5000.0);
        // 36 knots -> mph
        assert!((row.speed_mph - 36.0 * KNOTS_TO_MPH).abs() < 1e-6);
        // Numeric coordinates for the SSE event: western longitude is negative.
        assert!(row.lat.unwrap() > 49.0 && row.lat.unwrap() < 49.1, "lat {:?}", row.lat);
        assert!(row.lon.unwrap() < -72.0 && row.lon.unwrap() > -72.1, "lon {:?}", row.lon);
        // POINT(lon lat): western longitude is negative.
        let loc = row.loc2d_wkt.unwrap();
        assert!(loc.starts_with("POINT(-72."), "got {loc}");
        assert!(row.loc3d_wkt.unwrap().contains("5000"));
        assert_eq!(row.ptype, "!");
        assert!(row.info.starts_with('!'));
        assert!(row.raw.starts_with("W1AW-11>APRS"));
    }

    #[test]
    fn message_packet_has_no_location() {
        let line = b"W1AW-1>APRS,WIDE2-1::N0CALL   :hello world";
        let row = map_frame(&frame_for(line, None)).unwrap();

        assert_eq!(row.callsign, "W1AW-1");
        assert_eq!(row.symbol, "");
        assert_eq!(row.speed_mph, 0.0);
        assert_eq!(row.altitude_ft, 0.0);
        assert!(row.lat.is_none());
        assert!(row.lon.is_none());
        assert!(row.loc2d_wkt.is_none());
        assert!(row.loc3d_wkt.is_none());
        assert_eq!(row.frequency_hz, None);
        assert_eq!(row.ptype, ":");
        assert!(row.info.starts_with(':'));
    }

    #[test]
    fn object_packet_uses_object_name_as_callsign() {
        // Object named "BALLOON"; transmitter is W1AW-1.
        let line = b"W1AW-1>APRS:;BALLOON  *111111z4903.50N/07201.75W>Team1";
        let row = map_frame(&frame_for(line, None)).unwrap();
        assert_eq!(row.callsign, "BALLOON");
        assert!(row.loc2d_wkt.is_some());
        assert_eq!(row.ptype, ";");
    }
}
