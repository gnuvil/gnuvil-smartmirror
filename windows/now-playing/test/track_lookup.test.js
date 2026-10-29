"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { lookupTrack, searchTracks, same } = require("../track_lookup");

test("matches names across brackets, spacing and case", () => {
  assert.equal(same("海の幽霊", "바다의 유령 (海の幽霊)"), true);
  assert.equal(same("Kenshi Yonezu", "kenshi  yonezu"), true);
  assert.equal(same("Lemon", "KICK BACK"), false);
});

test("accepts only a result whose title and artist both match a candidate", async () => {
  const search = async () => [
    { title: "KICK BACK", artist: "Kenshi Yonezu", artUrl: "https://example.com/kick.jpg" },
    { title: "Lemon", artist: "Kenshi Yonezu", artUrl: "https://example.com/lemon.jpg" }
  ];
  const candidates = [{ artist: "Lemon", title: "Kenshi Yonezu" }, { artist: "Kenshi Yonezu", title: "Lemon" }];
  assert.deepEqual(await lookupTrack(candidates, { search }), { index: 1, artUrl: "https://example.com/lemon.jpg" });
  assert.equal(await lookupTrack([{ artist: "Kenshi Yonezu", title: "Plazma" }], { search }), null);
});

test("falls back to the Japanese store and a title-only match", async () => {
  const stores = [];
  const search = async (term, store) => {
    stores.push(store.country);
    return store.country === "JP"
      ? [{ title: "IRIS OUT", artist: "米津玄師", artUrl: "https://example.com/iris.jpg" },
        { title: "海の幽霊", artist: "米津玄師", artUrl: "https://example.com/sea.jpg" }]
      : [{ title: "Spirits of the Sea", artist: "Kenshi Yonezu", artUrl: "https://example.com/en.jpg" }];
  };
  assert.deepEqual(await lookupTrack([{ artist: "Kenshi Yonezu", title: "바다의 유령 (海の幽霊)" }], { search }),
    { index: 0, artUrl: "https://example.com/sea.jpg" });
  assert.deepEqual(stores, ["KR", "US", "JP"]);
});

test("does not take a same-titled cover or arrangement by someone else", async () => {
  const search = async () => [
    { title: "밤편지 (Piano Ver.)", artist: "Piano Cafe", artUrl: "https://example.com/piano.jpg" },
    { title: "밤편지", artist: "다른 가수", artUrl: "https://example.com/other.jpg" }
  ];
  assert.equal(await lookupTrack([{ artist: "아이유", title: "밤편지" }], { search }), null);
});

test("searches one store and keeps https artwork", async () => {
  const queries = [];
  const fetchImpl = async (url) => {
    queries.push([url.searchParams.get("country"), url.searchParams.get("lang")]);
    return { ok: true, json: async () => ({ results: [
      { trackName: "Lemon", artistName: "Kenshi Yonezu", artworkUrl100: "https://is1.example.com/a/100x100bb.jpg" },
      { trackName: "No art", artistName: "X" }
    ] }) };
  };
  const results = await searchTracks("Kenshi Yonezu Lemon", { country: "JP", lang: "ja_jp" }, { fetchImpl });
  assert.deepEqual(queries, [["JP", "ja_jp"]]);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], { title: "Lemon", artist: "Kenshi Yonezu", artUrl: "https://is1.example.com/a/600x600bb.jpg" });
});
