"use strict";

const { spawn } = require("node:child_process");
const { writeFileSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const MAX_LEVEL = 100;
const RESTART_DELAY = 5000;
// 무음이 이 프레임 수만큼 이어지면 프레임 전송을 멈춰 Pi의 화면 갱신을 줄인다.
const SILENT_FRAMES = 30;

function cavaConfig({ bars, framerate }) {
  return [
    "[general]",
    `bars = ${bars}`,
    `framerate = ${framerate}`,
    "[input]",
    "method = pipewire",
    "source = auto",
    "[output]",
    "method = raw",
    "raw_target = /dev/stdout",
    "data_format = ascii",
    `ascii_max_range = ${MAX_LEVEL}`,
    "bar_delimiter = 59",
    "frame_delimiter = 10",
    "[smoothing]",
    "noise_reduction = 77",
    ""
  ].join("\n");
}

function parseFrame(line, bars) {
  const values = line.split(";").filter((part) => part !== "").map(Number);
  if (values.length !== bars || values.some((value) => !Number.isInteger(value) || value < 0)) return null;
  return values.map((value) => Math.min(value, MAX_LEVEL));
}

class CavaService {
  constructor({ emit, log = console, spawnImpl = spawn, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.emit = emit;
    this.log = log;
    this.spawnImpl = spawnImpl;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.child = null;
    this.restartTimer = null;
    this.options = null;
    this.silentFrames = 0;
    this.lastError = null;
  }

  start({ bars = 32, framerate = 20 } = {}) {
    this.stop();
    if (!Number.isInteger(bars) || bars < 4 || bars > 128 || !Number.isInteger(framerate)
      || framerate < 5 || framerate > 60) {
      this.log.error("[MMM-GnuvilVisualizer] bars must be 4-128 and framerate 5-60");
      return;
    }
    this.options = { bars, framerate };
    this.spawnCava();
  }

  stop() {
    this.options = null;
    if (this.restartTimer) this.clearTimer(this.restartTimer);
    this.restartTimer = null;
    if (this.child) this.child.kill();
    this.child = null;
  }

  spawnCava() {
    const options = this.options;
    if (!options) return;
    const file = path.join(mkdtempSync(path.join(tmpdir(), "gnuvil-cava-")), "config");
    writeFileSync(file, cavaConfig(options));
    const child = this.spawnImpl("cava", ["-p", file], { stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    this.silentFrames = 0;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) this.handleLine(line, options.bars);
    });
    child.stderr.on("data", () => {});
    child.on("error", (error) => this.handleExit(child, error.code === "ENOENT" ? "cava is not installed" : error.message));
    child.on("exit", (code) => this.handleExit(child, `cava exited with code ${code}`));
  }

  handleLine(line, bars) {
    const frame = parseFrame(line, bars);
    if (!frame) return;
    this.lastError = null;
    if (frame.every((value) => value === 0)) {
      this.silentFrames += 1;
      if (this.silentFrames === SILENT_FRAMES) this.emit("VISUALIZER_FRAME", null);
      if (this.silentFrames >= SILENT_FRAMES) return;
    } else {
      this.silentFrames = 0;
    }
    this.emit("VISUALIZER_FRAME", frame);
  }

  handleExit(child, detail) {
    if (this.child !== child) return;
    this.child = null;
    if (detail !== this.lastError) this.log.error(`[MMM-GnuvilVisualizer] ${detail}`);
    this.lastError = detail;
    this.emit("VISUALIZER_FRAME", null);
    if (this.options && !this.restartTimer) {
      this.restartTimer = this.setTimer(() => {
        this.restartTimer = null;
        this.spawnCava();
      }, RESTART_DELAY);
    }
  }
}

module.exports = { CavaService, cavaConfig, parseFrame };
