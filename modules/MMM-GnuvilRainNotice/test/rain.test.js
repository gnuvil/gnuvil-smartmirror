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

function loadFront(now) {
  let definition;
  const timers = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "MMM-GnuvilRainNotice.js"), "utf8"), {
    Module: { register: (name, value) => { definition = value; } },
    document: { createElement: () => ({ className: "", textContent: "" }) },
    setInterval: (fn) => timers.push(fn)
  });
  const clock = { now };
  const instance = { ...definition, config: { ...definition.defaults }, now: () => clock.now,
    sendSocketNotification() {}, updates: 0, updateDom() { this.updates += 1; } };
  instance.start();
  return { instance, clock, tick: () => timers.forEach((fn) => fn()) };
}

test("shows the notice when rain or snow is expected, otherwise a greeting", () => {
  const { instance } = loadFront(NOW);
  assert.equal(instance.getDom().className, "gnuvil-rain-notice greeting");
  assert.equal(instance.getDom().textContent, "즐거운 오후 보내세요!");
  instance.socketNotificationReceived("RAIN_NOTICE", { kind: "rain" });
  assert.equal(instance.getDom().textContent, "오늘은 비가 올 수 있어요!");
  assert.equal(instance.getDom().className, "gnuvil-rain-notice");
  instance.socketNotificationReceived("RAIN_NOTICE", { kind: "snow" });
  assert.equal(instance.getDom().textContent, "오늘은 눈이 올 수 있어요!");
  instance.socketNotificationReceived("RAIN_NOTICE", { kind: "hail" });
  assert.equal(instance.getDom().textContent, "즐거운 오후 보내세요!");
});

test("picks the greeting from the local hour and redraws only when it changes", () => {
  const at = (iso) => new Date(iso);
  const greeting = (iso) => loadFront(at(iso)).instance.getDom().textContent;
  // 시각은 모두 KST
  assert.equal(greeting("2026-10-29T19:59:00Z"), "늦은 시간이에요, 푹 쉬세요!"); // 04:59
  assert.equal(greeting("2026-10-29T20:00:00Z"), "좋은 아침이에요!"); // 05:00
  assert.equal(greeting("2026-10-30T02:59:00Z"), "좋은 아침이에요!"); // 11:59
  assert.equal(greeting("2026-10-30T03:00:00Z"), "즐거운 오후 보내세요!"); // 12:00
  assert.equal(greeting("2026-10-30T08:00:00Z"), "오늘 하루도 수고했어요!"); // 17:00
  assert.equal(greeting("2026-10-30T13:00:00Z"), "늦은 시간이에요, 푹 쉬세요!"); // 22:00

  const { instance, clock, tick } = loadFront(at("2026-10-30T07:58:00Z")); // 16:58
  tick();
  assert.equal(instance.updates, 0);
  clock.now = at("2026-10-30T08:00:00Z");
  tick();
  assert.equal(instance.updates, 1);
  assert.equal(instance.getDom().textContent, "오늘 하루도 수고했어요!");
});
