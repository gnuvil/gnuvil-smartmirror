"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeResponse } = require("../bus_data");
const { BusService, validateConfig, serviceKeyFromEnvironment } = require("../bus_service");

const config = {
  stationId: "100",
  routes: [{ routeId: "11", routeName: "A" }, { routeName: "B" }],
  walkMinutes: null,
  updateInterval: 30000,
  staleAfter: 300000
};

function gbis(items, resultCode = 0) {
  return {
    response: {
      msgHeader: { resultCode },
      msgBody: { busArrivalList: items }
    }
  };
}

function makeService(fetchImpl, options = {}) {
  const events = [];
  const logs = [];
  const service = new BusService({
    fetchImpl,
    emit: (name, payload) => events.push({ name, payload }),
    log: { error: (message) => logs.push(message) },
    readKey: () => options.key,
    now: () => options.now ?? 1000,
    requestTimeout: options.requestTimeout ?? 8000
  });
  return { service, events, logs };
}

test("normalizes selected routes in config order and preserves absent arrivals", () => {
  const data = normalizeResponse(gbis([
    { routeId: 22, routeName: "B", predictTime1: 7, predictTime2: -1, locationNo1: 2 },
    { routeId: 11, routeName: "A", predictTime1: 3, predictTimeSec1: 180, predictTime2: 15 },
    { routeId: 33, routeName: "C", predictTime1: 1 }
  ]), config.routes, 1000);
  assert.equal(data.updatedAt, 1000);
  assert.deepEqual(data.routes.map((route) => route.routeName), ["A", "B"]);
  assert.deepEqual(data.routes[0].first, { minutes: 3, seconds: 180, stopsAway: null });
  assert.deepEqual(data.routes[0].second, { minutes: 15, seconds: null, stopsAway: null });
  assert.equal(data.routes[1].second, null);
});

test("handles one returned item, no results, and malformed responses", () => {
  const single = normalizeResponse(gbis({ routeId: 11, routeName: "A", predictTime1: 0 }), config.routes, 1);
  assert.equal(single.routes[0].first.minutes, 0);
  assert.equal(single.routes[1].first, null);
  const empty = normalizeResponse(gbis(null, 4), config.routes, 1);
  assert.equal(empty.routes[0].first, null);
  assert.throws(() => normalizeResponse({}, config.routes, 1), /header/);
  assert.throws(() => normalizeResponse(gbis([], 2), config.routes, 1), /result code 2/);
});

test("shows every returned route and preserves both 1500-2 destinations", () => {
  const data = normalizeResponse(gbis([
    { routeId: 313, routeName: "1500-2", routeDestName: "사당역", predictTime1: 8 },
    { routeId: 313, routeName: "1500-2", routeDestName: "에버랜드", predictTime1: 12 },
    { routeId: 69, routeName: "1117", routeDestName: "강변역", predictTime1: 5 }
  ]), null, 1000);
  assert.equal(data.routes.length, 3);
  assert.deepEqual(data.routes.filter((route) => route.routeName === "1500-2")
    .map((route) => route.destination), ["사당역", "에버랜드"]);
});

test("rejects missing or unsafe settings before making a request", () => {
  assert.equal(serviceKeyFromEnvironment(" abc%2Bdef%3D "), "abc+def=");
  assert.equal(serviceKeyFromEnvironment("abc+def="), "abc+def=");
  assert.match(validateConfig({ ...config, stationId: null }), /stationId/);
  assert.equal(validateConfig({ ...config, stationId: null, stationMobileNo: "29561" }), null);
  assert.equal(validateConfig({ ...config, routes: null }), null);
  assert.match(validateConfig({ ...config, routes: "all" }), /routes/);
  let calls = 0;
  const missingKey = makeService(async () => { calls += 1; }, { key: undefined });
  missingKey.service.configure(config);
  assert.equal(calls, 0);
  assert.equal(missingKey.events[0].name, "BUS_ERROR");
  assert.match(missingKey.logs[0], /GBIS_API_KEY is missing/);
  assert.ok(!JSON.stringify(missingKey.events).includes("serviceKey"));
  missingKey.service.stop();
});

test("identifies a denied station lookup without exposing the key", async () => {
  const fake = makeService(async () => ({ ok: false, status: 403 }), { key: "private-key" });
  fake.service.configure({ ...config, stationId: null, stationMobileNo: "29561" });
  await fake.service.refresh();
  assert.match(fake.logs.at(-1), /GBIS station lookup failed: HTTP 403/);
  assert.equal(fake.events.at(-1).payload.message, "정류소 조회 API 권한 확인 필요");
  assert.equal(JSON.stringify(fake.logs).includes("private-key"), false);
  fake.service.stop();
});

test("resolves a public stop number once before requesting arrivals", async () => {
  const urls = [];
  const fake = makeService(async (url) => {
    urls.push(url);
    if (url.pathname.endsWith("getBusStationListv2")) {
      return { ok: true, json: async () => ({
        response: { msgHeader: { resultCode: 0 }, msgBody: { busStationList: [
          null,
          { mobileNo: " 29561", stationId: 228000123, stationName: "외국어대학교" },
          { mobileNo: 29560, stationId: 228000124, stationName: "외국어대학교" }
        ] } }
      }) };
    }
    return { ok: true, json: async () => gbis([]) };
  }, { key: "test-key" });
  fake.service.configure({ ...config, stationId: null, stationMobileNo: "29561" });
  await fake.service.refresh();
  await fake.service.refresh();
  assert.equal(urls.length, 3);
  assert.equal(urls[0].searchParams.get("keyword"), "29561");
  assert.equal(urls[1].searchParams.get("stationId"), "228000123");
  assert.equal(urls[2].searchParams.get("stationId"), "228000123");
  assert.equal(fake.events.at(-1).name, "BUS_DATA");
  fake.service.stop();
});

test("rejects unmatched or ambiguous public stop numbers", async () => {
  for (const items of [[], [
    { mobileNo: 29561, stationId: 1 }, { mobileNo: 29561, stationId: 2 }
  ]]) {
    let calls = 0;
    const fake = makeService(async () => {
      calls += 1;
      return { ok: true, json: async () => ({
        response: { msgHeader: { resultCode: 0 }, msgBody: { busStationList: items } }
      }) };
    }, { key: "test-key" });
    fake.service.configure({ ...config, stationId: null, stationMobileNo: "29561" });
    await fake.service.refresh();
    assert.equal(calls, 1);
    assert.match(fake.logs.at(-1), /station lookup is ambiguous or empty/);
    assert.equal(fake.events.at(-1).name, "BUS_ERROR");
    fake.service.stop();
  }
});

test("uses one station request and suppresses duplicate refreshes", async () => {
  let finish;
  let calls = 0;
  let requestedUrl;
  const response = new Promise((resolve) => { finish = resolve; });
  const fake = makeService(async (url) => {
    calls += 1;
    requestedUrl = url;
    return response;
  }, { key: "test-key" });
  fake.service.configure(config);
  const first = fake.service.refresh();
  const second = fake.service.refresh();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(requestedUrl.pathname.endsWith("getBusArrivalListv2"), true);
  assert.equal(requestedUrl.searchParams.get("stationId"), "100");
  assert.equal(requestedUrl.searchParams.has("routeId"), false);
  finish({ ok: true, json: async () => gbis([]) });
  await first;
  assert.equal(fake.events.at(-1).name, "BUS_DATA");
  fake.service.stop();
});

test("retains cached data, marks it stale, and recovers after a failure", async () => {
  let now = 1000;
  let attempt = 0;
  const fake = makeService(async () => {
    attempt += 1;
    if (attempt === 2) return { ok: false, status: 500 };
    return { ok: true, json: async () => gbis([{ routeId: 11, routeName: "A", predictTime1: attempt }]) };
  }, { key: "test-key" });
  fake.service.now = () => now;
  fake.service.configure(config);
  await fake.service.refresh();
  now += 300001;
  await fake.service.refresh();
  const error = fake.events.at(-1);
  assert.equal(error.name, "BUS_ERROR");
  assert.equal(error.payload.data.routes[0].first.minutes, 1);
  assert.equal(error.payload.data.stale, true);
  now += 1;
  await fake.service.refresh();
  const recovered = fake.events.at(-1);
  assert.equal(recovered.name, "BUS_DATA");
  assert.equal(recovered.payload.routes[0].first.minutes, 3);
  assert.equal(recovered.payload.stale, false);
  fake.service.stop();
});

test("reports invalid JSON and a request timeout without crashing", async () => {
  const invalid = makeService(async () => ({ ok: true, json: async () => { throw new SyntaxError("bad"); } }), { key: "test-key" });
  invalid.service.configure(config);
  await invalid.service.refresh();
  assert.match(invalid.logs[0], /valid JSON/);
  invalid.service.stop();

  const timeout = makeService((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }), { key: "test-key", requestTimeout: 5 });
  timeout.service.configure(config);
  await timeout.service.refresh();
  assert.match(timeout.logs[0], /timed out/);
  timeout.service.stop();
});
