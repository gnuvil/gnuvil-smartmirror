"use strict";

const { normalizeResponse } = require("./bus_data");

const ENDPOINT = "https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2";
const STATION_ENDPOINT = "https://apis.data.go.kr/6410000/busstationservice/v2/getBusStationListv2";
const REQUEST_TIMEOUT = 8000;

function serviceKeyFromEnvironment(value) {
  const key = value?.trim();
  if (!key) return "";
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function validateConfig(input) {
  if (!input || (!/^\d+$/.test(String(input.stationId ?? ""))
    && !/^\d{5}$/.test(String(input.stationMobileNo ?? "")))) {
    return "stationId or stationMobileNo is not configured";
  }
  if (input.routes != null && !Array.isArray(input.routes)) {
    return "routes must be an array or null";
  }
  for (const route of input.routes || []) {
    if (!route || typeof route.routeName !== "string" || !route.routeName.trim()) {
      return "every route needs a routeName";
    }
    if (route.routeId != null && !/^\d+$/.test(String(route.routeId))) {
      return "routeId must be numeric";
    }
  }
  if (!Number.isInteger(input.updateInterval) || input.updateInterval < 15000) {
    return "updateInterval must be at least 15000 ms";
  }
  if (!Number.isInteger(input.staleAfter) || input.staleAfter <= input.updateInterval) {
    return "staleAfter must exceed updateInterval";
  }
  if (input.walkMinutes != null && (!Number.isInteger(input.walkMinutes) || input.walkMinutes < 0)) {
    return "walkMinutes must be a nonnegative integer or null";
  }
  return null;
}

class BusService {
  constructor({ fetchImpl = fetch, emit, log = console, now = Date.now, readKey = () => process.env.GBIS_API_KEY, requestTimeout = REQUEST_TIMEOUT }) {
    this.fetchImpl = fetchImpl;
    this.emit = emit;
    this.log = log;
    this.now = now;
    this.readKey = readKey;
    this.requestTimeout = requestTimeout;
    this.generation = 0;
    this.config = null;
    this.lastSuccess = null;
    this.inFlight = null;
    this.interval = null;
    this.controller = null;
    this.resolvedStationId = null;
  }

  stop() {
    this.generation += 1;
    if (this.interval) clearInterval(this.interval);
    if (this.controller) this.controller.abort();
    this.interval = null;
    this.controller = null;
    this.inFlight = null;
    this.resolvedStationId = null;
  }

  configure(input) {
    this.stop();
    this.config = input;
    this.lastSuccess = null;
    const configError = validateConfig(input);
    if (configError) {
      this.reportError(configError, "버스 설정 필요");
      return;
    }
    if (!serviceKeyFromEnvironment(this.readKey())) {
      this.reportError("GBIS_API_KEY is missing", "버스 API 키 필요");
      return;
    }
    this.interval = setInterval(() => { void this.refresh(); }, input.updateInterval);
    void this.refresh();
  }

  snapshot() {
    if (!this.lastSuccess) return null;
    return {
      ...this.lastSuccess,
      stale: this.now() - this.lastSuccess.updatedAt > this.config.staleAfter
    };
  }

  reportError(detail, message = "버스 정보를 불러올 수 없습니다") {
    this.log.error(`[MMM-GnuvilBus] ${detail}`);
    this.emit("BUS_ERROR", { message, data: this.snapshot() });
  }

  async requestJson(url, signal) {
    const response = await this.fetchImpl(url, { signal, redirect: "error" });
    if (!response.ok) {
      const resource = url.pathname.endsWith("getBusStationListv2") ? "station lookup" : "arrival lookup";
      throw new Error(`GBIS ${resource} failed: HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error("GBIS response is not valid JSON");
    }
  }

  async stationId(serviceKey, signal) {
    if (this.config.stationId != null && /^\d+$/.test(String(this.config.stationId))) {
      return String(this.config.stationId);
    }
    if (this.resolvedStationId) return this.resolvedStationId;

    const url = new URL(STATION_ENDPOINT);
    url.searchParams.set("format", "json");
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("keyword", String(this.config.stationMobileNo));
    const raw = await this.requestJson(url, signal);
    const header = raw?.response?.msgHeader;
    if (!header || Number(header.resultCode) !== 0) throw new Error("GBIS station lookup failed");
    const items = raw?.response?.msgBody?.busStationList;
    const candidates = Array.isArray(items) ? items : items ? [items] : [];
    const matches = candidates.filter((item) => item
      && String(item.mobileNo).trim() === String(this.config.stationMobileNo)
      && /^\d+$/.test(String(item.stationId ?? "")));
    if (matches.length !== 1) throw new Error("GBIS station lookup is ambiguous or empty");
    this.resolvedStationId = String(matches[0].stationId);
    return this.resolvedStationId;
  }

  refresh() {
    if (!this.config || validateConfig(this.config) || !serviceKeyFromEnvironment(this.readKey())) return Promise.resolve();
    if (this.inFlight) return this.inFlight;

    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), this.requestTimeout);
    const task = (async () => {
      try {
        const serviceKey = serviceKeyFromEnvironment(this.readKey());
        const stationId = await this.stationId(serviceKey, controller.signal);
        if (generation !== this.generation) return;
        const url = new URL(ENDPOINT);
        url.searchParams.set("format", "json");
        url.searchParams.set("serviceKey", serviceKey);
        url.searchParams.set("stationId", stationId);
        const raw = await this.requestJson(url, controller.signal);
        const data = normalizeResponse(raw, this.config.routes, this.now());
        if (generation !== this.generation) return;
        this.lastSuccess = data;
        this.emit("BUS_DATA", data);
      } catch (error) {
        if (generation !== this.generation) return;
        const safeMessage = typeof error?.message === "string" ? error.message : "";
        let detail = "GBIS network request failed";
        if (controller.signal.aborted) detail = "GBIS request timed out";
        else if (/^GBIS (station|arrival) lookup failed: HTTP \d{3}$/.test(safeMessage)
          || safeMessage === "GBIS response is not valid JSON"
          || /^GBIS result code \d+$/.test(safeMessage)) detail = safeMessage;
        else if (safeMessage.startsWith("GBIS response") || safeMessage === "GBIS arrival list is invalid") {
          detail = "GBIS response is invalid";
        } else if (safeMessage.startsWith("GBIS station lookup")) {
          detail = safeMessage;
        }
        const message = detail === "GBIS station lookup failed: HTTP 403"
          ? "정류소 조회 API 권한 확인 필요"
          : "버스 정보를 불러올 수 없습니다";
        this.reportError(detail, message);
      } finally {
        clearTimeout(timeout);
        if (this.controller === controller) this.controller = null;
      }
    })();
    this.inFlight = task;
    const clear = () => { if (this.inFlight === task) this.inFlight = null; };
    void task.then(clear, clear);
    return task;
  }
}

module.exports = { BusService, validateConfig, serviceKeyFromEnvironment };
