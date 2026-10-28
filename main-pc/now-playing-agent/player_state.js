"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { readFile, stat } = require("node:fs/promises");
const { fileURLToPath } = require("node:url");

const execFileAsync = promisify(execFile);
const SEP = "\x1f";
const METADATA_FORMAT = ["{{status}}", "{{title}}", "{{artist}}", "{{album}}",
  "{{mpris:artUrl}}", "{{mpris:length}}", "{{position}}"].join(SEP);
const MAX_ART_BYTES = 256 * 1024;
const ART_CACHE_MS = 60 * 1000;
const COVER_CACHE_MS = 30 * 60 * 1000;
const COVER_TIMEOUT_MS = 3000;

async function runPlayerctl(args) {
  const { stdout } = await execFileAsync("playerctl", args, {
    timeout: 2500,
    maxBuffer: 64 * 1024,
    encoding: "utf8"
  });
  return stdout.trim();
}

function clean(value, maxLength = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function seconds(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number / 1_000_000) : null;
}

function imageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && /^(GIF87a|GIF89a)$/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Bluetooth(AVRCP) 재생은 앨범아트를 보내지 않는 경우가 많아 iTunes 검색으로 표지를 찾는다.
// 한국 스토어는 영문 아티스트명으로 찾지 못하는 곡이 있어 미국 스토어도 확인한다.
async function searchCover(artist, title, { fetchImpl = fetch } = {}) {
  for (const country of ["KR", "US"]) {
    const url = new URL("https://itunes.apple.com/search");
    url.search = new URLSearchParams({
      term: `${artist} ${title}`.trim(), media: "music", entity: "song", limit: "1", country
    }).toString();
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS), redirect: "error" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const artwork = (await response.json())?.results?.[0]?.artworkUrl100;
    if (typeof artwork !== "string") continue;
    const art = new URL(artwork.replace(/\/\d+x\d+bb\./, "/600x600bb."));
    return art.protocol === "https:" ? art.href : null;
  }
  return null;
}

class PlayerState {
  constructor({ run = runPlayerctl, read = readFile, fileStat = stat,
    preferredPlayer = process.env.GNUVIL_PLAYER, now = Date.now,
    coverLookup = process.env.GNUVIL_COVER_LOOKUP === "off" ? null : searchCover } = {}) {
    this.run = run;
    this.read = read;
    this.fileStat = fileStat;
    this.preferredPlayer = preferredPlayer;
    this.now = now;
    this.coverLookup = coverLookup;
    this.artCache = { uri: null, value: null, expiresAt: 0 };
    this.coverCache = new Map();
  }

  // 검색 결과(실패 포함)를 곡마다 캐시하고, 검색이 끝나기 전에는 기다리지 않고 글자만 보낸다.
  fallbackCover(artist, title) {
    if (!this.coverLookup || !title) return null;
    const key = `${artist}\x1f${title}`;
    const cached = this.coverCache.get(key);
    if (cached && (cached.pending || this.now() < cached.expiresAt)) return cached.value;
    const entry = { value: null, pending: true, expiresAt: 0 };
    this.coverCache.set(key, entry);
    if (this.coverCache.size > 50) this.coverCache.delete(this.coverCache.keys().next().value);
    Promise.resolve()
      .then(() => this.coverLookup(artist, title))
      .then((url) => { entry.value = url ? { artUrl: url } : null; }, () => { entry.value = null; })
      .finally(() => { entry.pending = false; entry.expiresAt = this.now() + COVER_CACHE_MS; });
    return null;
  }

  async activePlayer() {
    let output;
    try {
      const args = this.preferredPlayer
        ? [`--player=${this.preferredPlayer}`, "status", "--format", `{{playerName}}${SEP}{{status}}`]
        : ["--all-players", "status", "--format", `{{playerName}}${SEP}{{status}}`];
      output = await this.run(args);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error("playerctl is not installed");
      return null;
    }
    const player = String(output).split(/\r?\n/).map((line) => line.split(SEP))
      .find(([name, status]) => name && status?.trim() === "Playing")?.[0];
    return player || null;
  }

  async artwork(uri) {
    if (!uri) return null;
    if (this.artCache.uri === uri && this.now() < this.artCache.expiresAt) return this.artCache.value;
    let value = null;
    try {
      const url = new URL(uri);
      if (url.protocol === "https:" && !url.username && !url.password) {
        value = { artUrl: url.href };
      } else if (url.protocol === "file:") {
        const path = fileURLToPath(url);
        const info = await this.fileStat(path);
        if (info.isFile() && info.size > 0 && info.size <= MAX_ART_BYTES) {
          const bytes = await this.read(path);
          const type = bytes.length <= MAX_ART_BYTES ? imageType(bytes) : null;
          if (type) value = { artData: `data:${type};base64,${bytes.toString("base64")}` };
        }
      }
    } catch {
      value = null;
    }
    this.artCache = { uri, value, expiresAt: this.now() + ART_CACHE_MS };
    return value;
  }

  async get() {
    const player = await this.activePlayer();
    if (!player) return { playing: false };
    let output;
    try {
      output = await this.run([`--player=${player}`, "metadata", "--format", METADATA_FORMAT]);
    } catch {
      return { playing: false };
    }
    const [status, rawTitle, rawArtist, rawAlbum, artUri, rawLength, rawPosition] = String(output).split(SEP);
    if (status?.trim() !== "Playing") return { playing: false };
    const title = clean(rawTitle);
    if (!title) return { playing: false };
    const duration = seconds(rawLength);
    const position = seconds(rawPosition);
    const artist = clean(rawArtist);
    const art = await this.artwork(artUri?.trim()) || this.fallbackCover(artist, title);
    return {
      playing: true,
      title,
      artist,
      album: clean(rawAlbum),
      position: position == null ? null : duration == null ? position : Math.min(position, duration),
      duration,
      ...(art || {})
    };
  }
}

module.exports = { PlayerState, imageType, searchCover, seconds };
