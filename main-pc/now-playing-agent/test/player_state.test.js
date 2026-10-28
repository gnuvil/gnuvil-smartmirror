"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { PlayerState, searchCover } = require("../player_state");
const { authorized, createServer } = require("../server");

const SEP = "\x1f";

test("selects a playing player and normalizes MPRIS metadata", async () => {
  const calls = [];
  const state = new PlayerState({
    run: async (args) => {
      calls.push(args);
      if (args.includes("status")) return `vlc${SEP}Paused\nspotify${SEP}Playing`;
      return ["Playing", "Ditto", "NewJeans", "OMG", "https://images.example/cover.jpg", "185000000", "134000000"].join(SEP);
    }
  });
  const result = await state.get();
  assert.deepEqual(result, {
    playing: true, title: "Ditto", artist: "NewJeans", album: "OMG",
    position: 134, duration: 185, artUrl: "https://images.example/cover.jpg"
  });
  assert.ok(calls[1].includes("--player=spotify"));
});

test("hides paused players and handles absent playerctl", async () => {
  const paused = new PlayerState({ run: async () => `vlc${SEP}Paused` });
  assert.deepEqual(await paused.get(), { playing: false });
  const missing = new PlayerState({ run: async () => { const error = new Error("missing"); error.code = "ENOENT"; throw error; } });
  await assert.rejects(missing.get(), /playerctl is not installed/);
});

test("embeds bounded local artwork and ignores non-image files", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const artUrl = pathToFileURL(`${process.cwd()}/cover.png`).href;
  const state = new PlayerState({
    run: async (args) => args.includes("status") ? `vlc${SEP}Playing`
      : ["Playing", "Song", "Artist", "Album", artUrl, "", ""].join(SEP),
    fileStat: async () => ({ isFile: () => true, size: png.length }),
    read: async () => png
  });
  const result = await state.get();
  assert.match(result.artData, /^data:image\/png;base64,/);
  assert.equal(result.position, null);
  assert.equal(await state.artwork("http://localhost/private"), null);
});

test("refreshes local artwork when its URI stays the same", async () => {
  let now = 0;
  let bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const state = new PlayerState({
    now: () => now,
    fileStat: async () => ({ isFile: () => true, size: bytes.length }),
    read: async () => bytes
  });
  const uri = pathToFileURL(`${process.cwd()}/cover.png`).href;
  const original = await state.artwork(uri);
  bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 2]);
  assert.deepEqual(await state.artwork(uri), original);
  now = 60_000;
  assert.notDeepEqual(await state.artwork(uri), original);
});

test("looks up a cover once per track when the player sends none", async () => {
  const lookups = [];
  const state = new PlayerState({
    run: async (args) => args.includes("status") ? `bluez${SEP}Playing`
      : ["Playing", "Hype Boy", "NewJeans", "", "", "", ""].join(SEP),
    coverLookup: async (artist, title) => {
      lookups.push([artist, title]);
      return "https://images.example/600x600bb.jpg";
    }
  });
  assert.equal((await state.get()).artUrl, undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await state.get()).artUrl, "https://images.example/600x600bb.jpg");
  assert.deepEqual(lookups, [["NewJeans", "Hype Boy"]]);
});

test("keeps text-only output when the cover search fails", async () => {
  let calls = 0;
  const state = new PlayerState({
    run: async (args) => args.includes("status") ? `bluez${SEP}Playing`
      : ["Playing", "Song", "Artist", "", "", "", ""].join(SEP),
    coverLookup: async () => { calls += 1; throw new Error("offline"); }
  });
  await state.get();
  await new Promise((resolve) => setImmediate(resolve));
  const result = await state.get();
  assert.equal(result.artUrl, undefined);
  assert.equal(result.title, "Song");
  assert.equal(calls, 1);
});

test("builds a large iTunes artwork URL, falling back to the US store", async () => {
  const requested = [];
  const url = await searchCover("NewJeans", "Ditto", {
    fetchImpl: async (target) => {
      requested.push(target);
      const results = target.searchParams.get("country") === "US"
        ? [{ artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg" }] : [];
      return { ok: true, json: async () => ({ results }) };
    }
  });
  assert.equal(url, "https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg");
  assert.deepEqual(requested.map((target) => target.searchParams.get("country")), ["KR", "US"]);
  assert.equal(requested[0].searchParams.get("term"), "NewJeans Ditto");
});

test("requires a bearer token for the HTTP endpoint", async () => {
  assert.equal(authorized("Bearer secret", "secret"), true);
  assert.equal(authorized("Bearer wrong", "secret"), false);
  const server = createServer({ player: { get: async () => ({ playing: false }) }, token: "secret" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/now-playing`;
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers: { Authorization: "Bearer secret" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { playing: false });
    assert.equal((await fetch(url.replace("now-playing", "other"))).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
