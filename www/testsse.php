<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2023,2026 Jeff Deaton (N6BA)
#
#    HABTracker is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    HABTracker is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
#
##################################################
*
 */

    // Simple SSE viewer: connect to the Rust backend's /api/sse endpoint (proxied
    // by Apache) with an EventSource and dump every incoming event to the page.
    // This replaces the old PHP-based SSE producer that previously lived here.
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SSE viewer — eoss-backend</title>
<style>
    :root { color-scheme: dark; }
    body {
        font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        margin: 0; background: #12161c; color: #e6e6e6;
    }
    header { padding: 12px 16px; background: #1b2430; border-bottom: 1px solid #2b3543; }
    h1 { font-size: 1.1em; margin: 0 0 4px; }
    header p { margin: 0; font-size: 0.85em; color: #9aa7b4; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px; }
    .controls input[type=text] {
        flex: 1 1 260px; min-width: 200px; padding: 6px 8px; font-family: monospace;
        background: #0d1117; color: #e6e6e6; border: 1px solid #2b3543; border-radius: 4px;
    }
    button {
        padding: 6px 14px; border: 0; border-radius: 4px; cursor: pointer; font-weight: 600;
        background: #2f6fed; color: #fff;
    }
    button.secondary { background: #3a4553; }
    button:disabled { opacity: 0.5; cursor: default; }
    .status { display: inline-flex; align-items: center; gap: 6px; font-size: 0.9em; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #6b7280; display: inline-block; }
    .dot.connecting { background: #eab308; }
    .dot.open { background: #22c55e; }
    .dot.error { background: #ef4444; }
    .counts { padding: 4px 16px 10px; font-size: 0.85em; color: #9aa7b4; }
    .counts span { margin-right: 14px; }
    #log { padding: 0 16px 24px; }
    .entry {
        border: 1px solid #2b3543; border-left-width: 4px; border-radius: 4px;
        margin: 8px 0; padding: 8px 10px; background: #0d1117;
    }
    .entry.packet { border-left-color: #22c55e; }
    .entry.heartbeat { border-left-color: #eab308; }
    .entry.other { border-left-color: #2f6fed; }
    .entry.meta { border-left-color: #6b7280; color: #9aa7b4; }
    .entry .top { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
    .badge {
        font-family: monospace; font-size: 0.8em; font-weight: 700; padding: 1px 6px;
        border-radius: 3px; background: #1b2430; text-transform: uppercase;
    }
    .ts { font-size: 0.8em; color: #9aa7b4; }
    .summary { font-family: monospace; font-size: 0.85em; color: #cbd5e1; }
    pre { margin: 6px 0 0; font-size: 0.8em; white-space: pre-wrap; word-break: break-word; color: #b8c2cc; }
</style>
</head>
<body>
<header>
    <h1>SSE viewer &mdash; <code>eoss-backend</code></h1>
    <p>Connects to the Rust backend's SSE stream with an <code>EventSource</code> and prints every event as it arrives.
       The <code>/api/*</code> path is served by Apache's reverse proxy to <code>127.0.0.1:3000</code> &mdash; if nothing connects, the
       <code>&lt;Location /api&gt;</code> proxy config may not be enabled yet.</p>
</header>

<div class="controls">
    <input type="text" id="url" value="/api/sse" spellcheck="false" aria-label="SSE endpoint URL">
    <input type="text" id="events" value="packet,heartbeat" spellcheck="false"
           aria-label="named events to subscribe to" title="Comma-separated SSE event names to listen for">
    <button id="connect" type="button">Connect</button>
    <button id="disconnect" type="button" class="secondary" disabled>Disconnect</button>
    <button id="clear" type="button" class="secondary">Clear</button>
    <span class="status"><span class="dot" id="dot"></span><span id="statustext">idle</span></span>
</div>

<div class="counts">
    <span>total: <b id="c-total">0</b></span>
    <span>packet: <b id="c-packet">0</b></span>
    <span>heartbeat: <b id="c-heartbeat">0</b></span>
    <span>other: <b id="c-other">0</b></span>
</div>

<div id="log"></div>

<script>
(function () {
    var es = null;
    var counts = { total: 0, packet: 0, heartbeat: 0, other: 0 };

    var el = function (id) { return document.getElementById(id); };
    var urlInput = el("url"), eventsInput = el("events");
    var connectBtn = el("connect"), disconnectBtn = el("disconnect"), clearBtn = el("clear");
    var dot = el("dot"), statustext = el("statustext"), logEl = el("log");

    function setStatus(state, text) {
        dot.className = "dot " + state;
        statustext.textContent = text;
    }

    function bumpCount(kind) {
        counts.total++;
        if (kind === "packet") counts.packet++;
        else if (kind === "heartbeat") counts.heartbeat++;
        else counts.other++;
        el("c-total").textContent = counts.total;
        el("c-packet").textContent = counts.packet;
        el("c-heartbeat").textContent = counts.heartbeat;
        el("c-other").textContent = counts.other;
    }

    // Build a short one-line summary for the common event kinds.
    function summarize(kind, obj) {
        if (!obj) return "";
        var d = obj.data;
        if (kind === "packet" && d) {
            var parts = [];
            if (d.callsign) parts.push(d.callsign);
            if (d.symbol) parts.push("sym=" + d.symbol);
            if (d.lat != null && d.lon != null) parts.push(d.lat.toFixed(4) + "," + d.lon.toFixed(4));
            if (d.altitude) parts.push(Math.round(d.altitude) + "ft");
            if (d.frequency) parts.push((d.frequency / 1e6).toFixed(3) + "MHz");
            return parts.join("  ");
        }
        return "";
    }

    function addEntry(kind, rawData) {
        var obj = null;
        try { obj = JSON.parse(rawData); } catch (e) { /* leave as raw text */ }

        var cls = kind === "packet" ? "packet" : (kind === "heartbeat" ? "heartbeat" : "other");
        var entry = document.createElement("div");
        entry.className = "entry " + cls;

        var top = document.createElement("div");
        top.className = "top";

        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = kind;
        top.appendChild(badge);

        var ts = document.createElement("span");
        ts.className = "ts";
        var when = (obj && obj.ts) ? new Date(obj.ts) : new Date();
        ts.textContent = when.toLocaleTimeString();
        top.appendChild(ts);

        var summary = summarize(kind, obj);
        if (summary) {
            var s = document.createElement("span");
            s.className = "summary";
            s.textContent = summary;
            top.appendChild(s);
        }
        entry.appendChild(top);

        var pre = document.createElement("pre");
        pre.textContent = obj ? JSON.stringify(obj, null, 2) : rawData;
        entry.appendChild(pre);

        // newest on top
        logEl.insertBefore(entry, logEl.firstChild);
        bumpCount(kind);
    }

    function addMeta(text) {
        var entry = document.createElement("div");
        entry.className = "entry meta";
        entry.textContent = "[" + new Date().toLocaleTimeString() + "] " + text;
        logEl.insertBefore(entry, logEl.firstChild);
    }

    function disconnect() {
        if (es) { es.close(); es = null; }
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        setStatus("", "disconnected");
    }

    function connect() {
        disconnect();
        var url = urlInput.value.trim() || "/api/sse";
        setStatus("connecting", "connecting to " + url + " …");
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;

        try {
            es = new EventSource(url);
        } catch (e) {
            setStatus("error", "failed to create EventSource: " + e);
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            return;
        }

        es.onopen = function () { setStatus("open", "connected to " + url); addMeta("connection opened"); };

        es.onerror = function () {
            // EventSource auto-reconnects; reflect the transient error state.
            setStatus("error", "connection error (auto-retrying) …");
        };

        // Unnamed events (in case the server ever emits without an event: name).
        es.onmessage = function (ev) { addEntry("message", ev.data); };

        // Named events. EventSource has no wildcard, so subscribe to the names in the
        // box (comma-separated) — add new kinds there as the backend grows.
        var names = eventsInput.value.split(",").map(function (n) { return n.trim(); }).filter(Boolean);
        names.forEach(function (name) {
            es.addEventListener(name, function (ev) { addEntry(name, ev.data); });
        });
    }

    connectBtn.addEventListener("click", connect);
    disconnectBtn.addEventListener("click", disconnect);
    clearBtn.addEventListener("click", function () {
        logEl.innerHTML = "";
        counts = { total: 0, packet: 0, heartbeat: 0, other: 0 };
        ["total", "packet", "heartbeat", "other"].forEach(function (k) { el("c-" + k).textContent = "0"; });
    });

    // Auto-connect on load.
    connect();
})();
</script>
</body>
</html>
