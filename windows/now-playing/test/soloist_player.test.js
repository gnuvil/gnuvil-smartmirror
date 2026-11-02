"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SoloistPlayer, combinePlayers, trackFrom } = require("../soloist_player");

const item = (name, artists, extra = {}) => ({
  uri: `spotify:track:${name}`,
  entity_type: "track",
  decorations: {
    identity: { name },
    visual_identity: { cover: [{ url: "https://i.scdn.co/small.jpg", size: "small" }, { url: "https://i.scdn.co/large.jpg", size: "large" }] },
    parent: { entity: { decorations: { identity: { name: `${name} (album)` } } } },
    creators: artists.map((artist) => ({ entity: { decorations: { identity: { name: artist } } } })),
    playback: { duration_ms: 163000 },
    ...extra
  }
});

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; this.handlers = {}; this.closed = false; FakeSocket.instances.push(this); }
  addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
  emit(type, event = {}) { for (const handler of this.handlers[type] || []) handler(event); }
  close() { this.closed = true; }
}

function setup(overrides = {}) {
  FakeSocket.instances = [];
  let clock = 1_000_000;
  const timers = [];
  const calls = [];
  const errors = [];
  const files = { "ws.addr": "127.0.0.1\n", "ws.port": "61262\n" };
  const player = new SoloistPlayer({
    dataDir: "D", exe: "soloist.exe", WebSocketImpl: FakeSocket,
    readFile: (file) => {
      const value = files[file.split(/[\\/]/).pop()];
      if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return value;
    },
    execFileImpl: (exe, args, options, callback) => { calls.push(args); callback(null, JSON.stringify({ type: "queue_changed", upcoming: [
      { item: item("Next A", ["가수 A"]) }, { item: item("Next B", ["B1", "B2"]) }, { item: item("Next C", ["C"]) }, { item: item("Next D", ["D"]) }] })); },
    now: () => clock, log: { error: (message) => errors.push(message) },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer() {},
    ...overrides
  });
  player.start();
  const socket = () => FakeSocket.instances.at(-1);
  const send = (message) => socket().emit("message", { data: JSON.stringify(message) });
  const playing = (extra = {}) => send({ type: "playback_state", status: "playing", item: item("Signaling", ["AnythingBecomeMoe", "Kai"]),
    position: { position_ms: 2762, timestamp_ms: clock, speed: 1 }, ...extra });
  return { player, files, timers, calls, errors, socket, send, playing, tick: (ms) => { clock += ms; } };
}

test("reads title, artists, album, cover and a moving position from the playback state", () => {
  const { player, playing, tick } = setup();
  assert.deepEqual(player.get(), { playing: false });
  playing();
  const data = player.get();
  assert.equal(data.title, "Signaling");
  assert.equal(data.artist, "AnythingBecomeMoe, Kai");
  assert.equal(data.album, "Signaling (album)");
  assert.equal(data.artUrl, "https://i.scdn.co/large.jpg");
  assert.equal(data.duration, 163);
  assert.equal(data.position, 2);
  tick(10_000);
  assert.equal(player.get().position, 12);
  tick(1_000_000);
  assert.equal(player.get().position, 163);
});

test("shows nothing while paused, and keeps the position still", () => {
  const { player, playing } = setup();
  playing({ status: "paused", position: { position_ms: 5000, timestamp_ms: 1_000_000, speed: 0 } });
  assert.deepEqual(player.get(), { playing: false });
});

test("asks for the next tracks once per track and keeps three", () => {
  const { player, playing, timers, calls } = setup();
  playing();
  assert.equal(player.get().queue, undefined);
  timers.at(-1).fn();
  assert.deepEqual(calls, [["ctl", "-D", "D", "queue", "3", "--json"]]);
  assert.deepEqual(player.get().queue, [{ title: "Next A", artist: "가수 A" }, { title: "Next B", artist: "B1, B2" }, { title: "Next C", artist: "C" }]);
  playing();
  assert.equal(timers.length, 1, "the same track does not ask for the queue again");
});

test("takes the queue from queue_changed events too", () => {
  const { player, playing, send } = setup();
  playing();
  send({ type: "queue_changed", upcoming: [{ item: item("Pushed", ["P"]) }] });
  assert.deepEqual(player.get().queue, [{ title: "Pushed", artist: "P" }]);
});

test("reconnects with the new port after Soloist restarts and forgets the old song", () => {
  const { player, files, timers, socket, playing } = setup();
  playing();
  assert.equal(socket().url, "ws://127.0.0.1:61262");
  socket().emit("close");
  assert.deepEqual(player.get(), { playing: false });
  files["ws.port"] = "61300";
  timers.at(-1).fn();
  assert.equal(socket().url, "ws://127.0.0.1:61300");
});

test("waits quietly, reporting once, while Soloist is not running or lacks --ws", () => {
  const { player, files, timers, errors } = setup();
  delete files["ws.port"];
  player.connect();
  player.connect();
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Soloist/);
  assert.ok(timers.length >= 1);
});

test("only connects to this PC", () => {
  const { player, files, errors } = setup();
  files["ws.addr"] = "192.168.1.5";
  const before = FakeSocket.instances.length;
  player.connect();
  assert.equal(FakeSocket.instances.length, before);
  assert.match(errors.at(-1), /unexpected ws address/);
});

test("combinePlayers prefers the browser and falls back to Spotify", async () => {
  const youtube = { playing: true, title: "Video" };
  const spotify = { playing: true, title: "Song" };
  const none = { playing: false };
  assert.equal((await combinePlayers({ get: async () => youtube }, { get: () => spotify }).get()).title, "Video");
  assert.equal((await combinePlayers({ get: async () => none }, { get: () => spotify }).get()).title, "Song");
  assert.deepEqual(await combinePlayers({ get: async () => none }, { get: () => none }).get(), none);
  assert.equal((await combinePlayers({ get: async () => { throw new Error("x"); } }, { get: () => spotify }).get()).title, "Song");
  await assert.rejects(combinePlayers({ get: async () => { throw new Error("x"); } }, { get: () => none }).get(), /x/);
});

test("trackFrom ignores items without a name and non-https covers", () => {
  assert.equal(trackFrom({ uri: "x", decorations: { identity: { name: " " } } }), null);
  const http = item("A", []);
  http.decorations.visual_identity.cover = [{ url: "http://i.scdn.co/a.jpg", size: "large" }];
  assert.equal(trackFrom(http).artUrl, null);
});
