"use strict";

const REQUEST_TIMEOUT = 3500;
const MAX_RESPONSE_BYTES = 400 * 1024;

function endpointFromEnvironment(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname
      || url.username || url.password || url.search || url.hash
      || url.pathname !== "/now-playing") return null;
    return url;
  } catch {
    return null;
  }
}

function normalize(data) {
  if (!data || data.playing !== true) return { playing: false };
  const title = typeof data.title === "string" ? data.title.trim().slice(0, 240) : "";
  if (!title) return { playing: false };
  const number = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  const result = {
    playing: true,
    title,
    artist: typeof data.artist === "string" ? data.artist.trim().slice(0, 240) : "",
    album: typeof data.album === "string" ? data.album.trim().slice(0, 240) : "",
    position: number(data.position),
    duration: number(data.duration)
  };
  // Windows 버전은 YouTube 자막이 있으면 caption으로 보낸다 (최대 두 줄).
  const caption = typeof data.caption === "string"
    ? data.caption.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 2).join("\n").slice(0, 300)
    : "";
  if (caption) result.caption = caption;
  if (typeof data.artData === "string"
    && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(data.artData)
    && data.artData.length <= 360_000) {
    result.art = data.artData;
  } else if (typeof data.artUrl === "string") {
    try {
      const url = new URL(data.artUrl);
      if (url.protocol === "https:" && !url.username && !url.password) result.art = url.href;
    } catch { /* The text-only view still works. */ }
  }
  return result;
}

class NowPlayingService {
  constructor({ fetchImpl = fetch, emit, log = console, readUrl = () => process.env.GNUVIL_NOW_PLAYING_URL,
    readToken = () => process.env.GNUVIL_NOW_PLAYING_TOKEN } = {}) {
    this.fetchImpl = fetchImpl;
    this.emit = emit;
    this.log = log;
    this.readUrl = readUrl;
    this.readToken = readToken;
    this.interval = null;
    this.inFlight = null;
    this.controller = null;
    this.generation = 0;
    this.endpoint = null;
    this.lastError = null;
  }

  stop() {
    this.generation += 1;
    if (this.interval) clearInterval(this.interval);
    if (this.controller) this.controller.abort();
    this.interval = null;
    this.controller = null;
    this.inFlight = null;
  }

  start(updateInterval = 5000) {
    this.stop();
    this.endpoint = endpointFromEnvironment(this.readUrl());
    // 자막을 따라가려면 1초 간격까지 허용한다 (API는 같은 PC나 LAN에 있다).
    if (!this.endpoint || !Number.isInteger(updateInterval) || updateInterval < 1000) {
      this.emit("NOW_PLAYING_DATA", { playing: false });
      return;
    }
    this.interval = setInterval(() => { void this.refresh(); }, updateInterval);
    void this.refresh();
  }

  refresh() {
    if (!this.endpoint) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const task = (async () => {
      try {
        const token = this.readToken();
        const response = await this.fetchImpl(this.endpoint, {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
          redirect: "error"
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        if (content.length > MAX_RESPONSE_BYTES) throw new Error("response too large");
        const data = normalize(JSON.parse(content));
        if (generation === this.generation) {
          this.lastError = null;
          this.emit("NOW_PLAYING_DATA", data);
        }
      } catch (error) {
        if (generation !== this.generation) return;
        const detail = controller.signal.aborted ? "request timed out" : error?.message || "request failed";
        if (detail !== this.lastError) this.log.error(`[MMM-GnuvilNowPlaying] ${detail}`);
        this.lastError = detail;
        this.emit("NOW_PLAYING_DATA", { playing: false, unavailable: true });
      } finally {
        clearTimeout(timer);
        if (this.controller === controller) this.controller = null;
      }
    })();
    this.inFlight = task;
    const clear = () => { if (this.inFlight === task) this.inFlight = null; };
    void task.then(clear, clear);
    return task;
  }
}

module.exports = { NowPlayingService, endpointFromEnvironment, normalize };
