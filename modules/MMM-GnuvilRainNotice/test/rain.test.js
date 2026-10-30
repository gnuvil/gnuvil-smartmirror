"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { RainService, precipitationToday, localHour } = require("../rain_service");

const ZONE = "Asia/Seoul";
// 2026-10-30 15:37 KST
const NOW = new Date("2026-10-30T06:37:00Z");

function hourly(rows) {
  return {
    hourly: {
      time: rows.map((row) => row[0]),
      precipitation_probability: rows.map((row) => row[1]),
      precipitation: rows.map((row) => row[2]),
      weather_code: rows.map((row) => row[3] ?? 3)
    }
  };
}

test("uses the local hour of the configured time zone", () => {
  assert.equal(localHour(NOW, ZONE), "2026-10-30T15:00");
});

test("looks only at the rest of today", () => {
  const data = hourly([
    ["2026-10-30T09:00", 90, 2.0],
    ["2026-10-30T15:00", 10, 0],
    ["2026-10-30T20:00", 20, 0.1],
    ["2026-10-31T09:00", 90, 3.0]
  ]);
  assert.equal(precipitationToday(data, NOW, ZONE), null);
});

test("warns about rain from probability or amount, and about snow", () => {
  assert.equal(precipitationToday(hourly([["2026-10-30T18:00", 60, 0]]), NOW, ZONE), "rain");
  assert.equal(precipitationToday(hourly([["2026-10-30T15:00", 30, 0.4]]), NOW, ZONE), "rain");
  assert.equal(precipitationToday(hourly([["2026-10-30T21:00", 70, 1, 73]]), NOW, ZONE), "snow");
  assert.equal(precipitationToday(hourly([["2026-10-30T19:00", 70, 1, 73], ["2026-10-30T22:00", 70, 1, 61]]), NOW, ZONE), "rain");
  assert.equal(precipitationToday({}, NOW, ZONE), null);
});

test("fetches Open-Meteo once per refresh and keeps the last notice on errors", async () => {
  const emitted = [];
  const errors = [];
  let fail = false;
  const urls = [];
  const service = new RainService({
    fetchImpl: async (url) => {
      urls.push(url);
      if (fail) throw new Error("offline");
      return { ok: true, json: async () => hourly([["2026-10-30T17:00", 80, 1]]) };
    },
    emit: (name, data) => emitted.push([name, data]),
    log: { error: (message) => errors.push(message) },
    now: () => NOW
  });
  service.config = { lat: 37.3, lon: 127.2, timeZone: ZONE };
  await service.refresh();
  assert.deepEqual(emitted, [["RAIN_NOTICE", { kind: "rain" }]]);
  assert.equal(urls[0].searchParams.get("timezone"), ZONE);
  assert.match(urls[0].searchParams.get("hourly"), /precipitation_probability/);
  fail = true;
  await service.refresh();
  await service.refresh();
  assert.equal(emitted.length, 1);
  assert.deepEqual(errors, ["[MMM-GnuvilRainNotice] offline"]);
});

test("needs a location before it asks for the forecast", () => {
  const emitted = [];
  const errors = [];
  const service = new RainService({ fetchImpl: () => assert.fail("no request"), emit: (...args) => emitted.push(args),
    log: { error: (message) => errors.push(message) } });
  service.start({ lat: null, lon: 127 });
  assert.deepEqual(emitted, [["RAIN_NOTICE", { kind: null }]]);
  assert.match(errors[0], /위도·경도/);
});

test("shows the notice only when rain or snow is expected", () => {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "MMM-GnuvilRainNotice.js"), "utf8"), {
    Module: { register: (name, value) => { definition = value; } },
    document: { createElement: () => ({ className: "", textContent: "" }) }
  });
  const instance = { ...definition, config: { ...definition.defaults }, sendSocketNotification() {}, updateDom() {} };
  instance.start();
  assert.equal(instance.getDom().className, "gnuvil-rain-notice empty");
  instance.socketNotificationReceived("RAIN_NOTICE", { kind: "rain" });
  assert.equal(instance.getDom().textContent, "오늘은 비가 올 수 있어요!");
  instance.socketNotificationReceived("RAIN_NOTICE", { kind: "snow" });
  assert.equal(instance.getDom().textContent, "오늘은 눈이 올 수 있어요!");
  instance.socketNotificationReceived("RAIN_NOTICE", { kind: "hail" });
  assert.equal(instance.getDom().className, "gnuvil-rain-notice empty");
});
