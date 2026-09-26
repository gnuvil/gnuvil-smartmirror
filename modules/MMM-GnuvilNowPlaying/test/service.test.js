"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { NowPlayingService, endpointFromEnvironment, normalize } = require("../now_playing_service");

test("accepts only a fixed now-playing endpoint and safe artwork", () => {
  assert.equal(endpointFromEnvironment("http://192.168.1.20:8765/now-playing").pathname, "/now-playing");
  assert.equal(endpointFromEnvironment("file:///etc/passwd"), null);
  assert.equal(endpointFromEnvironment("http://user:pass@host/now-playing"), null);
  assert.equal(normalize({ playing: true, title: " A ", artUrl: "file:///tmp/cover.png" }).art, undefined);
  assert.equal(normalize({ playing: false, title: "A" }).playing, false);
});

test("reads metadata and distinguishes a pause from a connection failure", async () => {
  let stage = 0;
  const sent = [];
  const service = new NowPlayingService({
    fetchImpl: async (url, options) => {
      assert.equal(url.pathname, "/now-playing");
      assert.equal(options.headers.Authorization, "Bearer test-token");
      stage += 1;
      if (stage === 3) return { ok: false, status: 503 };
      return { ok: true, text: async () => JSON.stringify(stage === 1
        ? { playing: true, title: "Ditto", artist: "NewJeans", duration: 185, position: 15,
          artUrl: "https://images.example/cover.jpg" }
        : { playing: false }) };
    },
    emit: (name, data) => sent.push({ name, data }),
    log: { error() {} },
    readUrl: () => "http://192.168.1.20:8765/now-playing",
    readToken: () => "test-token"
  });
  service.start();
  await service.refresh();
  assert.equal(sent.at(-1).data.title, "Ditto");
  assert.equal(sent.at(-1).data.art, "https://images.example/cover.jpg");
  await service.refresh();
  assert.deepEqual(sent.at(-1).data, { playing: false });
  await service.refresh();
  assert.deepEqual(sent.at(-1).data, { playing: false, unavailable: true });
  service.stop();
});
