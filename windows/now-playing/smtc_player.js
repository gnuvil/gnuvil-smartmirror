"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { imageType } = require("../../main-pc/now-playing-agent/player_state");
const { parseYouTubeTitle } = require("./youtube_title");
const { lookupTrack } = require("./track_lookup");

const DEFAULT_COMMAND = path.join(__dirname, "..", "bin", "GnuvilSmtcReader.exe");
const RESTART_DELAY = 5000;
// 도우미는 1초마다 쓰므로 이보다 오래된 상태는 믿지 않는다.
const STALE_AFTER = 5000;
// MMM-GnuvilNowPlaying의 artData 한도(360,000자)보다 조금 작게 둔다.
const MAX_ART_DATA = 350_000;
// 찾은 곡은 오래, 못 찾은 곡은 짧게 기억한다.
const LOOKUP_CACHE_MS = 6 * 60 * 60 * 1000;
const LOOKUP_RETRY_MS = 10 * 60 * 1000;
const BROWSER = /^(msedge|chrome|firefox|brave|opera|whale|vivaldi)(\.exe)?$|Edge|Chrome|Firefox/i;
const SPOTIFY = /spotify|soloist/i;

function clean(value, maxLength = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

// 동시에 소리를 내지 않게 맞추는 두 출처: Spotify(Soloist)와 브라우저(YouTube).
function sourceOf(app) {
  if (SPOTIFY.test(app || "")) return "spotify";
  if (BROWSER.test(app || "")) return "browser";
  return null;
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
    trackLookup = process.env.GNUVIL_COVER_LOOKUP === "off" ? null : lookupTrack, captions = null } = {}) {
    this.captions = captions;
    this.spawnImpl = spawnImpl;
    this.command = command;
    this.now = now;
    this.log = log;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.trackLookup = trackLookup;
    this.lookups = new Map();
    this.child = null;
    this.restartTimer = null;
    this.running = false;
    this.missing = false;
    this.lastError = null;
    this.sessions = [];
    this.receivedAt = 0;
    this.thumbnails = new Map();
    this.tracks = new Map();
    this.statuses = new Map();
    this.primed = false;
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
    const child = this.spawnImpl(this.command, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
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
    // 도우미가 멈췄을 때 명령 쓰기가 실패해도 프로세스가 죽지 않게 한다.
    child.stdin?.on?.("error", () => {});
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
    this.pauseOverlaps();
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

  // Spotify와 브라우저(YouTube)가 동시에 재생되면 언제나 YouTube를 남기고 Spotify를 일시정지한다.
  // 겹치기 시작한 순간(어느 한쪽이 방금 재생을 시작했거나 처음 받은 상태)에만 한 번 보내고, 같은 상태에서는 다시 보내지 않는다.
  pauseOverlaps() {
    const previous = this.statuses;
    const primed = this.primed;
    this.statuses = new Map(this.sessions.map((session) => [session.app, session.status]));
    this.primed = true;
    const playing = this.sessions.filter((session) => session?.status === "Playing");
    const spotify = playing.filter((session) => sourceOf(session.app) === "spotify");
    const browsers = playing.filter((session) => sourceOf(session.app) === "browser");
    if (!spotify.length || !browsers.length) return;
    if (primed && [...spotify, ...browsers].every((session) => previous.get(session.app) === "Playing")) return;
    for (const session of spotify) this.pause(session.app);
  }

  pause(app) {
    this.child?.stdin?.write?.(`${JSON.stringify({ pause: app })}\n`);
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

  // iTunes 결과(실패 포함)를 곡마다 기억하고, 검색이 끝나기 전에는 기다리지 않고 제목 분석 결과만 쓴다.
  lookup(candidates) {
    if (!this.trackLookup || !candidates?.length || !candidates[0].title) return null;
    const cacheKey = candidates.map((candidate) => `${candidate.artist}\x1f${candidate.title}`).join("\x1e");
    const cached = this.lookups.get(cacheKey);
    if (cached && (cached.pending || this.now() < cached.expiresAt)) return cached.value;
    const entry = { value: null, pending: true, expiresAt: 0 };
    this.lookups.set(cacheKey, entry);
    if (this.lookups.size > 50) this.lookups.delete(this.lookups.keys().next().value);
    Promise.resolve()
      .then(() => this.trackLookup(candidates))
      .then((value) => { entry.value = value || null; }, () => { entry.value = null; })
      .finally(() => {
        entry.pending = false;
        entry.expiresAt = this.now() + (entry.value ? LOOKUP_CACHE_MS : LOOKUP_RETRY_MS);
      });
    return null;
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
    const parsed = browser ? parseYouTubeTitle(rawTitle, rawArtist)
      : { artist: rawArtist, title: rawTitle, cover: false, alternate: null, search: [{ artist: rawArtist, title: rawTitle }] };
    const thumbnail = this.thumbnails.get(`${session.app}\x1f${session.title}\x1f${session.artist}`);
    // 커버 영상도 곡명 순서는 원곡으로 확인하지만, 그림은 원곡 표지가 아니라 영상 썸네일이 맞다.
    const found = this.lookup(parsed.search);
    const { artist, title } = found?.index === 1 && parsed.alternate ? parsed.alternate : parsed;
    const art = found && !parsed.cover ? { artUrl: found.artUrl } : thumbnail ? { artData: thumbnail } : null;
    const caption = browser && this.captions ? this.captions.current(session.title) : null;
    const queue = browser && this.captions ? this.upcoming(session.title) : [];
    return {
      playing: true,
      title: clean(title),
      artist: clean(artist),
      album: clean(session.album),
      ...this.timeline(session),
      ...(art || {}),
      ...(caption ? { caption } : {}),
      ...(queue.length ? { queue } : {})
    };
  }

  // 재생목록의 다음 곡을 현재 곡과 같은 규칙으로 곡명·가수로 나누고, 순서는 iTunes 결과로 확인한다.
  upcoming(sessionTitle) {
    return (this.captions.upcoming?.(sessionTitle) || []).map((item) => {
      const parsed = parseYouTubeTitle(item.title, item.channel);
      const found = this.lookup(parsed.search);
      const { artist, title } = found?.index === 1 && parsed.alternate ? parsed.alternate : parsed;
      return { title: clean(title), artist: clean(artist) };
    });
  }
}

module.exports = { SmtcPlayer, chooseSession, thumbnailData };
