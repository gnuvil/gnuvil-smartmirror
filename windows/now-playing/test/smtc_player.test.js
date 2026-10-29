"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { SmtcPlayer, chooseSession, thumbnailData } = require("../smtc_player");

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]).toString("base64");

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };
  return child;
}

function setup({ trackLookup = null } = {}) {
  let clock = 1_000_000;
  const child = fakeChild();
  const errors = [];
  const player = new SmtcPlayer({
    spawnImpl: () => child,
    now: () => clock,
    trackLookup,
    log: { error: (message) => errors.push(message) },
    setTimer: () => 1,
    clearTimer() {}
  });
  player.start();
  const send = (sessions) => child.stdout.emit("data", `${JSON.stringify({ sessions, now: clock })}\n`);
  return { player, child, errors, send, tick: (ms) => { clock += ms; }, now: () => clock };
}

const edge = (overrides = {}) => ({
  app: "msedge.exe", status: "Playing", title: "NewJeans (뉴진스) 'Ditto' Official MV", artist: "HYBE LABELS",
  album: "", position: 10, duration: 185, updatedAt: 1_000_000, ...overrides
});

test("prefers a playing browser session over other players", () => {
  const spotify = { app: "Spotify.exe", status: "Playing", title: "Song" };
  const paused = { app: "msedge.exe", status: "Paused", title: "Video" };
  const chrome = { app: "chrome.exe", status: "Playing", title: "Video" };
  assert.equal(chooseSession([spotify, paused, chrome]), chrome);
  assert.equal(chooseSession([spotify, paused]), spotify);
  assert.equal(chooseSession([paused]), null);
  assert.equal(chooseSession(undefined), null);
});

test("returns the cleaned title, extrapolated progress and thumbnail art", async () => {
  const { player, send, tick } = setup();
  send([edge({ thumbnail: PNG })]);
  tick(4000);
  assert.deepEqual(await player.get(), {
    playing: true, title: "Ditto", artist: "NewJeans", album: "", position: 14, duration: 185,
    artData: `data:image/png;base64,${PNG}`
  });
});

test("prefers the iTunes cover over the YouTube thumbnail", async () => {
  const lookups = [];
  const { player, send } = setup({ trackLookup: async (candidates) => { lookups.push(candidates); return { index: 0, artUrl: "https://example.com/cover.jpg" }; } });
  send([edge({ thumbnail: PNG })]);
  assert.equal((await player.get()).artData, `data:image/png;base64,${PNG}`);
  await new Promise((resolve) => setImmediate(resolve));
  const data = await player.get();
  assert.equal(data.artUrl, "https://example.com/cover.jpg");
  assert.equal(data.artData, undefined);
  assert.deepEqual(lookups.map((candidates) => candidates.map(({ artist, title }) => [artist, title])), [[["NewJeans", "Ditto"]]]);
});

test("swaps title and artist when iTunes matches the reversed order", async () => {
  const { player, send } = setup({ trackLookup: async () => ({ index: 1, artUrl: "https://example.com/lemon.jpg" }) });
  send([edge({ title: "Lemon - Kenshi Yonezu", artist: "음악 모음" })]);
  assert.deepEqual([(await player.get()).title, (await player.get()).artist], ["Kenshi Yonezu", "Lemon"]);
  await new Promise((resolve) => setImmediate(resolve));
  const data = await player.get();
  assert.deepEqual([data.title, data.artist, data.artUrl], ["Lemon", "Kenshi Yonezu", "https://example.com/lemon.jpg"]);
});

test("uses the video thumbnail for covers without searching iTunes", async () => {
  const lookups = [];
  const { player, send } = setup({ trackLookup: async (candidates) => { lookups.push(candidates); return null; } });
  send([edge({ title: "바다의 유령 (海の幽霊) - Kenshi Yonezu | 시라유키 히나 Cover", artist: "시라유키 히나 SHIRAYUKI HINA", thumbnail: PNG })]);
  await new Promise((resolve) => setImmediate(resolve));
  const data = await player.get();
  assert.deepEqual([data.title, data.artist, data.artData], ["바다의 유령 (海の幽霊)", "시라유키 히나", `data:image/png;base64,${PNG}`]);
  assert.equal(lookups.length, 0);
});

test("hides progress after a track change until the timeline is updated", async () => {
  const { player, send, tick, now } = setup();
  send([edge()]);
  tick(5000);
  send([edge({ title: "Vaundy - 怪獣の花唄", artist: "Vaundy" })]);
  let data = await player.get();
  assert.equal(data.title, "怪獣の花唄");
  assert.equal(data.position, null);
  assert.equal(data.duration, null);
  tick(1000);
  send([edge({ title: "Vaundy - 怪獣の花唄", artist: "Vaundy", position: 3, duration: 232, updatedAt: now() })]);
  data = await player.get();
  assert.equal(data.position, 3);
  assert.equal(data.duration, 232);
});

test("reports paused, empty and stale states as not playing", async () => {
  const { player, send, tick } = setup();
  send([edge({ status: "Paused" })]);
  assert.deepEqual(await player.get(), { playing: false });
  send([]);
  assert.deepEqual(await player.get(), { playing: false });
  send([edge()]);
  tick(6000);
  assert.deepEqual(await player.get(), { playing: false });
});

test("adds the YouTube caption for the playing browser video", async () => {
  const seen = [];
  const captions = { current: (title) => { seen.push(title); return "널 보고 있어"; } };
  const child = fakeChild();
  const player = new SmtcPlayer({ spawnImpl: () => child, now: () => 1_000_000, trackLookup: null, captions,
    log: { error() {} }, setTimer: () => 1, clearTimer() {} });
  player.start();
  child.stdout.emit("data", `${JSON.stringify({ sessions: [edge()] })}\n`);
  assert.equal((await player.get()).caption, "널 보고 있어");
  assert.deepEqual(seen, ["NewJeans (뉴진스) 'Ditto' Official MV"]);
  child.stdout.emit("data", `${JSON.stringify({ sessions: [{ ...edge(), app: "Spotify.exe" }] })}\n`);
  assert.equal((await player.get()).caption, undefined);
});

test("does not clean titles from non-browser players", async () => {
  const { player, send } = setup();
  send([{ app: "Spotify.exe", status: "Playing", title: "Ditto", artist: "NewJeans", album: "OMG", position: 1, duration: 185, updatedAt: 1_000_000 }]);
  const data = await player.get();
  assert.equal(data.title, "Ditto");
  assert.equal(data.album, "OMG");
});

test("reports a missing reader once and fails requests until it is built", async () => {
  const { player, child, errors } = setup();
  child.emit("error", Object.assign(new Error("spawn"), { code: "ENOENT" }));
  await assert.rejects(player.get(), /not built/);
  assert.deepEqual(errors, ["[gnuvil-now-playing] SMTC reader is not built (run windows/build-helpers.ps1)"]);
  player.stop();
});

test("ignores malformed lines and logs helper errors", async () => {
  const { player, child, errors } = setup();
  child.stdout.emit("data", "not json\n{\"error\":\"SMTC 응답 없음\"}\n");
  assert.deepEqual(errors, ["[gnuvil-now-playing] SMTC error: SMTC 응답 없음"]);
  assert.deepEqual(await player.get(), { playing: false });
});

test("accepts only small known image thumbnails", () => {
  assert.equal(thumbnailData(PNG), `data:image/png;base64,${PNG}`);
  assert.equal(thumbnailData(Buffer.from("hello world").toString("base64")), null);
  assert.equal(thumbnailData(PNG + "A".repeat(360_000)), null);
});
