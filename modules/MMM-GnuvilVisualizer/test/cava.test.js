"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { CavaService, cavaConfig, parseFrame } = require("../cava_service");

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };
  return child;
}

test("writes a raw ascii cava config reading PipeWire", () => {
  const config = cavaConfig({ bars: 16, framerate: 20 });
  assert.match(config, /bars = 16/);
  assert.match(config, /method = pipewire/);
  assert.match(config, /data_format = ascii/);
});

test("parses only complete frames", () => {
  assert.deepEqual(parseFrame("0;50;100;120;", 4), [0, 50, 100, 100]);
  assert.equal(parseFrame("0;50;", 4), null);
  assert.equal(parseFrame("a;b;c;d;", 4), null);
});

test("forwards frames split across chunks and pauses during silence", () => {
  const frames = [];
  const child = fakeChild();
  const service = new CavaService({
    emit: (name, frame) => frames.push(frame),
    spawnImpl: () => child,
    log: { error() {} }
  });
  service.start({ bars: 4, framerate: 20 });
  child.stdout.emit("data", "10;20;0;");
  child.stdout.emit("data", "5;\n");
  assert.deepEqual(frames, [[10, 20, 0, 5]]);
  child.stdout.emit("data", "0;0;0;0;\n".repeat(40));
  assert.equal(frames.length, 1 + 30);
  assert.equal(frames.at(-1), null);
  service.stop();
  assert.equal(child.killed, true);
});

test("reports a missing cava binary once and retries later", () => {
  const errors = [];
  const timers = [];
  let spawned = 0;
  const service = new CavaService({
    emit() {},
    spawnImpl: () => {
      spawned += 1;
      const child = fakeChild();
      queueMicrotask(() => child.emit("error", Object.assign(new Error("spawn cava"), { code: "ENOENT" })));
      return child;
    },
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer() {},
    log: { error: (message) => errors.push(message) }
  });
  service.start({ bars: 8, framerate: 20 });
  return new Promise((resolve) => queueMicrotask(resolve)).then(async () => {
    timers.shift()();
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.equal(spawned, 2);
    assert.deepEqual(errors, ["[MMM-GnuvilVisualizer] cava is not installed"]);
    service.stop();
  });
});
