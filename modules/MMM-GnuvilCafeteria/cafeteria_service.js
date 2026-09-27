"use strict";

const { CAFETERIAS, koreanDay, parseMenu } = require("./cafeteria_data");

const ENDPOINT = "https://www.hufs.ac.kr/cafeteria/hufs/2/getMenu.do";
const TIMEOUT = 10000;

class CafeteriaService {
  constructor({ fetchImpl = fetch, emit, log = console, now = Date.now }) {
    this.fetchImpl = fetchImpl;
    this.emit = emit;
    this.log = log;
    this.now = now;
    this.generation = 0;
    this.interval = null;
    this.inFlight = null;
    this.controllers = [];
    this.cache = new Map();
    this.refreshInterval = 4 * 60 * 60 * 1000;
    this.lastAttemptAt = 0;
    this.lastAttemptDate = null;
    this.lastFailed = false;
  }

  stop() {
    this.generation += 1;
    if (this.interval) clearInterval(this.interval);
    for (const controller of this.controllers) controller.abort();
    this.interval = null;
    this.controllers = [];
    this.inFlight = null;
  }

  start(refreshInterval = 4 * 60 * 60 * 1000) {
    this.stop();
    if (!Number.isInteger(refreshInterval) || refreshInterval < 60 * 60 * 1000) {
      this.emit("CAFETERIA_ERROR", { message: "학식 설정 오류" });
      return;
    }
    this.refreshInterval = refreshInterval;
    this.interval = setInterval(() => {
      const date = koreanDay(new Date(this.now())).date;
      const retryAfter = this.lastFailed ? 60 * 60 * 1000 : this.refreshInterval;
      if (date !== this.lastAttemptDate || this.now() - this.lastAttemptAt >= retryAfter) {
        void this.refresh();
      }
    }, 30 * 60 * 1000);
    void this.refresh();
  }

  async fetchCafe(cafeteria, day, controller) {
    const body = new URLSearchParams({
      selCafId: cafeteria.id,
      selWeekFirstDay: day.firstDay,
      selWeekLastDay: day.lastDay,
      selYear: day.year,
      selMonth: day.month
    });
    const response = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      signal: controller.signal,
      redirect: "error"
    });
    if (!response.ok) throw new Error(`HUFS request failed: HTTP ${response.status}`);
    return parseMenu(await response.text(), cafeteria, day.date);
  }

  refresh() {
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const day = koreanDay(new Date(this.now()));
    this.lastAttemptAt = this.now();
    this.lastAttemptDate = day.date;
    const controllers = [];
    this.controllers = controllers;
    const task = (async () => {
      const requests = CAFETERIAS.map(async (cafeteria) => {
        const controller = new AbortController();
        controllers.push(controller);
        const timeout = setTimeout(() => controller.abort(), TIMEOUT);
        try {
          return await this.fetchCafe(cafeteria, day, controller);
        } finally {
          clearTimeout(timeout);
        }
      });
      const results = await Promise.allSettled(requests);
      if (generation !== this.generation) return;
      let failed = 0;
      const cafes = results.map((result, index) => {
        const cafeteria = CAFETERIAS[index];
        if (result.status === "fulfilled") {
          this.cache.set(cafeteria.id, { date: day.date, data: result.value });
          return result.value;
        }
        failed += 1;
        this.log.error(`[MMM-GnuvilCafeteria] ${cafeteria.id} menu fetch failed:`, result.reason);
        const cached = this.cache.get(cafeteria.id);
        return cached?.date === day.date ? cached.data : { ...cafeteria, meals: [] };
      });
      this.lastFailed = failed > 0;
      this.emit("CAFETERIA_DATA", {
        date: day.date,
        updatedAt: this.now(),
        partialFailure: failed > 0,
        cafes
      });
    })();
    this.inFlight = task;
    const clear = () => {
      if (this.inFlight === task) {
        this.inFlight = null;
        this.controllers = [];
      }
    };
    void task.then(clear, clear);
    return task;
  }
}

module.exports = { CafeteriaService };
