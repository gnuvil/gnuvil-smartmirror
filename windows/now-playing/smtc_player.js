"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { PlayerState, imageType } = require("../../main-pc/now-playing-agent/player_state");
const { cleanYouTubeTitle } = require("./youtube_title");

const DEFAULT_COMMAND = path.join(__dirname, "..", "bin", "GnuvilSmtcReader.exe");
const RESTART_DELAY = 5000;
// 도우미는 1초마다 쓰므로 이보다 오래된 상태는 믿지 않는다.
const STALE_AFTER = 5000;
// MMM-GnuvilNowPlaying의 artData 한도(360,000자)보다 조금 작게 둔다.
const MAX_ART_DATA = 350_000;
const BROWSER = /^(msedge|chrome|firefox|brave|opera|whale|vivaldi)(\.exe)?$|Edge|Chrome|Firefox/i;

function clean(value, maxLength = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

// 재생 중인 브라우저 세션을 먼저, 그다음 재생 중인 다른 앱을 고른다.
function chooseSession(sessions) {
  const playing = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session?.status === "Playing" && clean(session.title));
  return playing.find((session) => BROWSER.test(session.app || "")) || playing[0] || null;
}

function thumbnailData(base64) {
  if (typeof base64 !== "string" || !base64) return null;
  const type = imageType(Buffer.from(base64.slice(0, 64), "base64"));
  const data = type ? `data:${type};base64,${base64}` : null;
  return data && data.length <= MAX_ART_DATA ? data : null;
}

class SmtcPlayer {
  constructor({ spawnImpl = spawn, command = process.env.GNUVIL_SMTC_READER || DEFAULT_COMMAND, now = Date.now,
    log = console, setTimer = setTimeout, clearTimer = clearTimeout,
    coverLookup = undefined, captions = null } = {}) {
    this.captions = captions;
    this.spawnImpl = spawnImpl;
    this.command = command;
    this.now = now;
    this.log = log;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    // iTunes 표지 검색과 캐시는 Linux 에이전트의 것을 그대로 쓴다.
    this.covers = new PlayerState({ now, ...(coverLookup === undefined ? {} : { coverLookup }) });
    this.child = null;
    this.restartTimer = null;
    this.running = false;
    this.missing = false;
    this.lastError = null;
    this.sessions = [];
    this.receivedAt = 0;
    this.thumbnails = new Map();
    this.tracks = new Map();
  }

  start() {
    this.running = true;
    this.spawnReader();
  }

  stop() {
    this.running = false;
    if (this.restartTimer) this.clearTimer(this.restartTimer);
    this.restartTimer = null;
    if (this.child) this.child.kill();
    this.child = null;
  }

  spawnReader() {
    if (!this.running) return;
    const child = this.spawnImpl(this.command, [], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    this.child = child;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) this.handleLine(line);
    });
    child.stderr.on("data", () => {});
    child.on("error", (error) => {
      this.missing = error.code === "ENOENT";
      this.handleExit(child, this.missing ? "SMTC reader is not built (run windows/build-helpers.ps1)" : error.message);
    });
    child.on("exit", (code) => this.handleExit(child, `SMTC reader exited with code ${code}`));
  }

  handleExit(child, detail) {
    if (this.child !== child) return;
    this.child = null;
    this.report(detail);
    if (this.running && !this.restartTimer) {
      this.restartTimer = this.setTimer(() => {
        this.restartTimer = null;
        this.spawnReader();
      }, RESTART_DELAY);
    }
  }

  report(detail) {
    if (detail !== this.lastError) this.log.error(`[gnuvil-now-playing] ${detail}`);
    this.lastError = detail;
  }

  handleLine(line) {
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }
    this.missing = false;
    if (data.error) {
      this.report(`SMTC error: ${data.error}`);
      return;
    }
    this.lastError = null;
    this.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    this.receivedAt = this.now();
    for (const session of this.sessions) {
      const key = `${session.app}\x1f${session.title}\x1f${session.artist}`;
      // 도우미는 곡이 바뀔 때 한 번만 썸네일을 보내므로 여기서 기억해 둔다.
      if (session.thumbnail) {
        this.thumbnails.set(key, thumbnailData(session.thumbnail));
        if (this.thumbnails.size > 20) this.thumbnails.delete(this.thumbnails.keys().next().value);
      }
      const track = this.tracks.get(session.app);
      if (!track) this.tracks.set(session.app, { key, since: null });
      else if (track.key !== key) this.tracks.set(session.app, { key, since: this.now() });
    }
  }

  // Edge는 다음 영상으로 넘어가도 진행 시간을 바로 고치지 않고, 재생 중에는 위치도 갱신하지 않는다.
  // 그래서 마지막 갱신 시각부터 흐른 시간을 더하고, 곡이 바뀐 뒤 아직 갱신이 없으면 진행 바를 숨긴다.
  timeline(session) {
    const track = this.tracks.get(session.app);
    const updatedAt = Number(session.updatedAt);
    const duration = Number(session.duration);
    const position = Number(session.position);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position) || !Number.isFinite(updatedAt)) {
      return { position: null, duration: null };
    }
    if (track?.since && updatedAt < track.since - 1000) return { position: null, duration: null };
    const elapsed = Math.max(0, (this.now() - updatedAt) / 1000);
    return {
      position: Math.floor(Math.min(Math.max(0, position + elapsed), duration)),
      duration: Math.floor(duration)
    };
  }

  async get() {
    if (this.now() - this.receivedAt > STALE_AFTER) {
      if (this.missing) throw new Error("SMTC reader is not built");
      return { playing: false };
    }
    const session = chooseSession(this.sessions);
    if (!session) return { playing: false };
    const rawTitle = clean(session.title);
    const rawArtist = clean(session.artist);
    const browser = BROWSER.test(session.app || "");
    const { artist, title } = browser ? cleanYouTubeTitle(rawTitle, rawArtist) : { artist: rawArtist, title: rawTitle };
    const thumbnail = this.thumbnails.get(`${session.app}\x1f${session.title}\x1f${session.artist}`);
    const art = this.covers.fallbackCover(artist, title) || (thumbnail ? { artData: thumbnail } : null);
    const caption = browser && this.captions ? this.captions.current(session.title) : null;
    return {
      playing: true,
      title: clean(title),
      artist: clean(artist),
      album: clean(session.album),
      ...this.timeline(session),
      ...(art || {}),
      ...(caption ? { caption } : {})
    };
  }
}

module.exports = { SmtcPlayer, chooseSession, thumbnailData };
