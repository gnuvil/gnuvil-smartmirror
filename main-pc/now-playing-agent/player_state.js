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

class PlayerState {
  constructor({ run = runPlayerctl, read = readFile, fileStat = stat,
    preferredPlayer = process.env.GNUVIL_PLAYER, now = Date.now } = {}) {
    this.run = run;
    this.read = read;
    this.fileStat = fileStat;
    this.preferredPlayer = preferredPlayer;
    this.now = now;
    this.artCache = { uri: null, value: null, expiresAt: 0 };
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
    const art = await this.artwork(artUri?.trim());
    return {
      playing: true,
      title,
      artist: clean(rawArtist),
      album: clean(rawAlbum),
      position: position == null ? null : duration == null ? position : Math.min(position, duration),
      duration,
      ...(art || {})
    };
  }
}

module.exports = { PlayerState, imageType, seconds };
