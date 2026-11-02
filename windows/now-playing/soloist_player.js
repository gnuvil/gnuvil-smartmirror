"use strict";

// Spotify Soloist(Gnuvil Speaker)가 지금 재생하는 곡을 읽는다.
// Soloist는 Windows 미디어 세션(SMTC)에 올라오지 않으므로, --ws 로 켠 로컬 WebSocket API에서 재생 상태를 받는다.
// 포트는 실행할 때마다 바뀌어 <data-dir>/ws.addr, ws.port 파일에서 읽고, 연결이 끊기면 다시 읽어 붙는다.
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const BASE = path.join(process.env.LOCALAPPDATA || "", "GnuvilSoloist");
const RECONNECT_MS = 5000;
const QUEUE_DELAY_MS = 500;
const QUEUE_ITEMS = 3;

function names(creators) {
  return (Array.isArray(creators) ? creators : [])
    .map((creator) => creator?.entity?.decorations?.identity?.name)
    .filter((name) => typeof name === "string" && name.trim());
}

function coverUrl(covers) {
  const list = Array.isArray(covers) ? covers : [];
  const pick = list.find((cover) => cover?.size === "large") || list[list.length - 1];
  try {
    const url = new URL(pick?.url);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

// Soloist의 곡 항목(item)에서 곡명·가수·앨범·표지·길이를 뽑는다.
function trackFrom(item) {
  const identity = item?.decorations?.identity?.name;
  if (typeof identity !== "string" || !identity.trim()) return null;
  const decorations = item.decorations;
  return {
    uri: String(item.uri || ""),
    title: identity.trim(),
    artist: names(decorations.creators).join(", "),
    album: String(decorations.parent?.entity?.decorations?.identity?.name || ""),
    artUrl: coverUrl(decorations.visual_identity?.cover),
    durationMs: Number(decorations.playback?.duration_ms) || 0
  };
}

class SoloistPlayer {
  constructor({ dataDir = path.join(BASE, "data"), exe = path.join(BASE, "soloist.exe"), WebSocketImpl = globalThis.WebSocket,
    execFileImpl = execFile, readFile = (file) => fs.readFileSync(file, "utf8"), now = Date.now, log = console,
    setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.dataDir = dataDir;
    this.exe = exe;
    this.WebSocketImpl = WebSocketImpl;
    this.execFileImpl = execFileImpl;
    this.readFile = readFile;
    this.now = now;
    this.log = log;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.running = false;
    this.socket = null;
    this.retryTimer = null;
    this.queueTimer = null;
    this.state = null;
    this.queue = { uri: null, items: [] };
    this.lastError = null;
  }

  start() {
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    if (this.retryTimer) this.clearTimer(this.retryTimer);
    if (this.queueTimer) this.clearTimer(this.queueTimer);
    this.retryTimer = null;
    this.queueTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.state = null;
    try { socket?.close(); } catch { /* 이미 닫혔다. */ }
  }

  report(detail) {
    if (detail !== this.lastError) this.log.error(`[gnuvil-now-playing] ${detail}`);
    this.lastError = detail;
  }

  retry() {
    if (!this.running || this.retryTimer) return;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      this.connect();
    }, RECONNECT_MS);
  }

  endpoint() {
    const address = this.readFile(path.join(this.dataDir, "ws.addr")).trim();
    const port = Number(this.readFile(path.join(this.dataDir, "ws.port")).trim());
    if (!address || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid ws endpoint");
    // 같은 PC의 Soloist에만 붙는다. 다른 주소가 적혀 있으면 믿지 않는다.
    if (!["127.0.0.1", "localhost", "::1"].includes(address)) throw new Error(`unexpected ws address ${address}`);
    return `ws://${address.includes(":") ? `[${address}]` : address}:${port}`;
  }

  connect() {
    if (!this.running || !this.WebSocketImpl) return;
    let socket;
    try {
      socket = new this.WebSocketImpl(this.endpoint());
    } catch (error) {
      // Soloist가 없거나 --ws 없이 켜져 있으면 파일이 없다. 한 번만 알리고 계속 기다린다.
      this.report(`Spotify Soloist에 연결할 수 없습니다 (${error.code === "ENOENT" ? "ws.port 파일 없음" : error.message})`);
      this.retry();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => { this.lastError = null; });
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    const lost = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.state = null;
      this.retry();
    };
    socket.addEventListener("close", lost);
    socket.addEventListener("error", lost);
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message?.type === "playback_state") {
      const track = trackFrom(message.item);
      if (!track) {
        this.state = null;
        return;
      }
      this.state = {
        track,
        status: String(message.status || ""),
        positionMs: Number(message.position?.position_ms) || 0,
        timestampMs: Number(message.position?.timestamp_ms) || this.now(),
        speed: Number.isFinite(Number(message.position?.speed)) ? Number(message.position.speed) : 1
      };
      if (track.uri !== this.queue.uri) this.scheduleQueue(track.uri);
    } else if (message?.type === "queue_changed" && Array.isArray(message.upcoming) && this.state) {
      this.queue = { uri: this.state.track.uri, items: this.queueItems(message.upcoming) };
    }
  }

  queueItems(entries) {
    return (Array.isArray(entries) ? entries : []).map((entry) => trackFrom(entry?.item)).filter(Boolean)
      .slice(0, QUEUE_ITEMS).map((track) => ({ title: track.title, artist: track.artist }));
  }

  // 곡이 바뀌면 다음 곡 목록을 ctl로 한 번 물어본다. 목록은 곡이 바뀔 때만 달라지고, 느려도 화면은 기다리지 않는다.
  scheduleQueue(uri) {
    this.queue = { uri, items: [] };
    if (this.queueTimer) this.clearTimer(this.queueTimer);
    this.queueTimer = this.setTimer(() => {
      this.queueTimer = null;
      this.execFileImpl(this.exe, ["ctl", "-D", this.dataDir, "queue", String(QUEUE_ITEMS), "--json"],
        { timeout: 4000, windowsHide: true, encoding: "utf8" }, (error, stdout) => {
          if (error || this.queue.uri !== uri) return;
          try {
            this.queue = { uri, items: this.queueItems(JSON.parse(stdout).upcoming) };
          } catch { /* 목록이 없어도 현재 곡 표시는 된다. */ }
        });
    }, QUEUE_DELAY_MS);
  }

  // 재생 중이 아니거나 연결이 없으면 { playing: false }.
  get() {
    const state = this.state;
    if (!state || state.status !== "playing") return { playing: false };
    const { track } = state;
    const elapsed = Math.max(0, (this.now() - state.timestampMs) * state.speed);
    const duration = track.durationMs > 0 ? track.durationMs : null;
    const position = Math.min(state.positionMs + elapsed, duration ?? Infinity);
    return {
      playing: true,
      title: track.title,
      artist: track.artist,
      album: track.album,
      position: duration ? Math.floor(position / 1000) : null,
      duration: duration ? Math.floor(duration / 1000) : null,
      ...(track.artUrl ? { artUrl: track.artUrl } : {}),
      ...(this.queue.uri === track.uri && this.queue.items.length ? { queue: this.queue.items } : {})
    };
  }
}

// 브라우저(YouTube)가 재생 중이면 그 정보를, 아니면 Soloist(Spotify)를 보여 준다.
// SMTC 쪽이 오류를 내도 Spotify가 재생 중이면 Spotify를 보여 준다.
function combinePlayers(primary, secondary) {
  return {
    async get() {
      let first;
      try {
        first = await primary.get();
      } catch (error) {
        const second = secondary.get();
        if (second.playing) return second;
        throw error;
      }
      if (first.playing) return first;
      const second = secondary.get();
      return second.playing ? second : first;
    }
  };
}

module.exports = { SoloistPlayer, combinePlayers, trackFrom };
