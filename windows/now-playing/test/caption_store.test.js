"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../../../main-pc/now-playing-agent/server");
const { CaptionStore, cleanCaption, sameVideo } = require("../caption_store");

test("cleans caption text to at most two short lines", () => {
  assert.equal(cleanCaption("  처음  줄 \n\n둘째 줄\n셋째 줄 "), "둘째 줄\n셋째 줄");
  assert.equal(cleanCaption("𝐋𝐨𝐯𝐞\u0007 song"), "Love song");
  assert.equal(cleanCaption("가".repeat(500)).length, 200);
  assert.equal(cleanCaption(undefined), "");
});

test("matches captions to the video shown on the mirror", () => {
  assert.equal(sameVideo("Ditto MV", "Ditto MV"), true);
  assert.equal(sameVideo("(3) Ditto MV", "Ditto MV"), true);
  assert.equal(sameVideo("", "Ditto MV"), true);
  assert.equal(sameVideo("Hype Boy", "Ditto MV"), false);
});

test("returns only fresh captions for the same video", () => {
  let clock = 1000;
  const store = new CaptionStore({ now: () => clock });
  assert.equal(store.current("Ditto"), null);
  store.update({ text: "널 보고 있어", title: "Ditto" });
  assert.equal(store.current("Ditto"), "널 보고 있어");
  assert.equal(store.current("Hype Boy"), null);
  clock += 3500;
  assert.equal(store.current("Ditto"), null);
  store.update({ text: "", title: "Ditto" });
  assert.equal(store.current("Ditto"), null);
});

test("accepts captions over HTTP only with the extension header and adds them to now-playing", async (t) => {
  const captions = new CaptionStore();
  const player = { get: async () => ({ playing: true, title: "Ditto", caption: captions.current("Ditto") }) };
  const server = createServer({ player, extraRoute: (request, response) => captions.route(request, response) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (headers, body) => fetch(`${base}/caption`, { method: "POST", headers, body });

  assert.equal((await post({ "Content-Type": "text/plain" }, "x")).status, 403);
  assert.equal((await post({ "Content-Type": "application/json" }, "{}")).status, 403);
  assert.equal((await fetch(`${base}/caption`, { method: "OPTIONS" })).status, 403);
  const json = { "Content-Type": "application/json", "X-Gnuvil-Caption": "1" };
  assert.equal((await post(json, "not json")).status, 400);
  assert.equal((await post(json, JSON.stringify({ text: "x".repeat(5000) }))).status, 413);
  assert.equal((await post(json, JSON.stringify({ text: "널 보고 있어", title: "Ditto" }))).status, 204);
  const data = await (await fetch(`${base}/now-playing`)).json();
  assert.equal(data.caption, "널 보고 있어");
});
