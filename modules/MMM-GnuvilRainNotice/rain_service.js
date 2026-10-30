"use strict";

// 오늘 남은 시간에 비(또는 눈) 예보가 있는지 Open-Meteo 시간별 예보로 확인한다. API 키가 필요 없다.
// 남은 시간 중 한 시간이라도 강수 확률이 PROBABILITY_THRESHOLD 이상이거나 강수량이 AMOUNT_THRESHOLD 이상이면 알린다.

const REQUEST_TIMEOUT = 10000;
const PROBABILITY_THRESHOLD = 50;
const AMOUNT_THRESHOLD = 0.3;
// WMO 날씨 코드 중 눈 (71–77 눈, 85·86 소낙눈)
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

// Open-Meteo는 timezone을 지정하면 "2026-10-30T16:00"처럼 그 지역 시각으로 돌려준다.
function localHour(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

// 반환: "rain" | "snow" | null
function precipitationToday(data, now, timeZone) {
  const hourly = data?.hourly;
  if (!hourly || !Array.isArray(hourly.time)) return null;
  const current = localHour(now, timeZone);
  const today = current.slice(0, 10);
  let kind = null;
  hourly.time.forEach((time, index) => {
    if (typeof time !== "string" || time.slice(0, 10) !== today || time < current) return;
    const probability = hourly.precipitation_probability?.[index];
    const amount = hourly.precipitation?.[index];
    const wet = (Number.isFinite(probability) && probability >= PROBABILITY_THRESHOLD)
      || (Number.isFinite(amount) && amount >= AMOUNT_THRESHOLD);
    if (!wet) return;
    // 비와 눈이 섞이면 비로 알린다 (우산이 필요하다는 점은 같다).
    const snow = SNOW_CODES.has(hourly.weather_code?.[index]);
    kind = kind === "rain" || !snow ? "rain" : "snow";
  });
  return kind;
}

class RainService {
  constructor({ fetchImpl = fetch, emit, log = console, now = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.emit = emit;
    this.log = log;
    this.now = now;
    this.interval = null;
    this.config = null;
    this.lastError = null;
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  start(config) {
    this.stop();
    const { lat, lon, updateInterval, timeZone } = config || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      this.log.error("[MMM-GnuvilRainNotice] 위도·경도 설정이 필요합니다");
      this.emit("RAIN_NOTICE", { kind: null });
      return;
    }
    this.config = { lat, lon, timeZone: timeZone || "Asia/Seoul" };
    const interval = Number.isInteger(updateInterval) && updateInterval >= 600000 ? updateInterval : 1800000;
    this.interval = setInterval(() => { void this.refresh(); }, interval);
    void this.refresh();
  }

  async refresh() {
    if (!this.config) return;
    const { lat, lon, timeZone } = this.config;
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: "precipitation_probability,precipitation,weather_code",
      timezone: timeZone,
      forecast_days: "1"
    }).toString();
    try {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT), redirect: "error" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const kind = precipitationToday(await response.json(), this.now(), timeZone);
      this.lastError = null;
      this.emit("RAIN_NOTICE", { kind });
    } catch (error) {
      // 실패하면 마지막 안내를 그대로 둔다. 같은 오류는 한 번만 남긴다.
      const detail = error?.name === "TimeoutError" ? "request timed out" : error?.message || "request failed";
      if (detail !== this.lastError) this.log.error(`[MMM-GnuvilRainNotice] ${detail}`);
      this.lastError = detail;
    }
  }
}

module.exports = { RainService, precipitationToday, localHour };
