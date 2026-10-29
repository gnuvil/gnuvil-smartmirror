"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { parseBounds, displayBounds, mirrorEnvironment, runElectron } = require("../start-magicmirror");

test("parses display bounds from the helper", () => {
  assert.equal(parseBounds("1920,0,1024,1280\r\n"), "1920,0,1024,1280");
  assert.equal(parseBounds("-1024,0,1024,768"), "-1024,0,1024,768");
  assert.equal(parseBounds("1920,0,0,1280"), null);
  assert.equal(parseBounds("not bounds"), null);
});

test("falls back to the primary screen when the display is missing", () => {
  assert.equal(displayBounds(undefined, () => assert.fail("no lookup without a display")), null);
  assert.equal(displayBounds("2", () => "1920,0,1024,1280\n"), "1920,0,1024,1280");
  const original = console.log;
  console.log = () => {};
  try {
    assert.equal(displayBounds("3", () => { throw Object.assign(new Error("exit 1"), { stderr: "display not found" }); }), null);
  } finally {
    console.log = original;
  }
});

test("passes bounds, the API address and the visualizer helper without overriding settings", () => {
  const env = mirrorEnvironment({ PATH: "x", GNUVIL_MIRROR_BOUNDS: "old" }, { bounds: "1,2,3,4", visualizer: "C:\\bars.exe" });
  assert.deepEqual(env, {
    PATH: "x", GNUVIL_MIRROR_BOUNDS: "1,2,3,4",
    GNUVIL_NOW_PLAYING_URL: "http://127.0.0.1:8765/now-playing", GNUVIL_VISUALIZER_COMMAND: "C:\\bars.exe"
  });
  const kept = mirrorEnvironment({ GNUVIL_MIRROR_BOUNDS: "old", GNUVIL_NOW_PLAYING_URL: "http://other/now-playing",
    GNUVIL_VISUALIZER_COMMAND: "cava" }, { bounds: null, visualizer: "C:\\bars.exe" });
  assert.equal(kept.GNUVIL_MIRROR_BOUNDS, undefined);
  assert.equal(kept.GNUVIL_NOW_PLAYING_URL, "http://other/now-playing");
  assert.equal(kept.GNUVIL_VISUALIZER_COMMAND, "cava");
});

function fakeElectron() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => child.emit("exit", null);
  return child;
}

test("relaunches Electron when its network service crashes during startup only", () => {
  let clock = 0;
  const children = [];
  const exits = [];
  const sink = { write() {} };
  const original = console.log;
  console.log = () => {};
  try {
    runElectron(() => { const child = fakeElectron(); children.push(child); return child; }, {
      now: () => clock, setTimer: (callback) => callback(), exit: (code) => exits.push(code), stdout: sink, stderr: sink
    });
    children[0].stderr.emit("data", "[9600:ERROR] Network service crashed or was terminated, restarting service.\n");
    assert.equal(children.length, 2);
    clock = 200_000;
    children[1].stderr.emit("data", "Network service crashed or was terminated, restarting service.\n");
    assert.equal(children.length, 2);
    children[1].emit("exit", 3);
    assert.deepEqual(exits, [3]);
  } finally {
    console.log = original;
  }
});
