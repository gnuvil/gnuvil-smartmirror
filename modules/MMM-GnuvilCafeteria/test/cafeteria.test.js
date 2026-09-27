"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CAFETERIAS, koreanDay, parseMenu } = require("../cafeteria_data");
const { CafeteriaService } = require("../cafeteria_service");

const dates = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];
const headers = dates.map((date) => `<th><span class="date" id="date_${date}">${date}</span></th>`).join("");
const empty = '<td class="no-menu">등록된 메뉴가<br>없습니다.</td>';
const meal = '<td class="menu"><ul><li><strong class="point">제육&amp;계란</strong></li><li>미역국</li><li></li></ul><p class="pay">4,500원</p></td>';
const holiday = '<td class="menu"><ul><li>연휴</li></ul><p class="pay">4,500원</p></td>';
const html = `<table><caption>메뉴 상세 - 요일/메뉴</caption><thead><tr><th>요일/메뉴</th>${headers}</tr></thead><tbody>
<tr><th>중식<br>(11:10<br> ~ <br>13:10)</th>${empty}${empty}${meal}${empty}${holiday}${empty}${empty}</tr>
<tr><th>석식<br>(17:30<br> ~ <br>18:30)</th>${empty.repeat(7)}</tr>
</tbody></table>`;

test("uses Seoul date and clamps the requested week to the selected month", () => {
  assert.deepEqual(koreanDay(new Date("2026-09-27T04:00:00Z")), {
    date: "2026-09-27", year: "2026", month: "09", firstDay: "27", lastDay: "30"
  });
  assert.deepEqual(koreanDay(new Date("2026-09-30T16:00:00Z")), {
    date: "2026-10-01", year: "2026", month: "10", firstDay: "1", lastDay: "3"
  });
});

test("parses the selected day, menu, price and closed days", () => {
  const cafe = CAFETERIAS[0];
  const parsed = parseMenu(html, cafe, "2026-09-22");
  assert.equal(parsed.name, "한그릇 식당");
  assert.deepEqual(parsed.meals[0], {
    mealType: "중식", start: "11:10", end: "13:10",
    menu: ["제육&계란", "미역국"], price: "4,500원"
  });
  assert.equal(parseMenu(html, cafe, "2026-09-24").meals.length, 0);
  assert.throws(() => parseMenu(html, cafe, "2026-09-27"), /date is missing/);
  assert.throws(() => parseMenu("<html>error</html>", cafe, "2026-09-22"), /table is missing/);
});

test("parses the shorter tables returned at a month boundary", () => {
  for (const [start, end, selected] of [
    ["2026-09-27", 4, "2026-09-27"],
    ["2026-10-01", 3, "2026-10-01"]
  ]) {
    const dates = Array.from({ length: end }, (_, index) => {
      const day = String(Number(start.slice(-2)) + index).padStart(2, "0");
      return `<th><span id="date_${start.slice(0, 8)}${day}"></span></th>`;
    }).join("");
    const shortHtml = `<table><caption>메뉴 상세</caption><thead><tr>${dates}</tr></thead>`
      + `<tbody><tr><th>중식</th>${empty.repeat(end)}</tr></tbody></table>`;
    assert.deepEqual(parseMenu(shortHtml, CAFETERIAS[0], selected).meals, []);
  }
});

test("sends month-clamped request parameters on both sides of the boundary", async () => {
  for (const [time, month, first, last] of [
    ["2026-09-27T04:00:00Z", "09", "27", "30"],
    ["2026-09-30T16:00:00Z", "10", "1", "3"]
  ]) {
    const requests = [];
    const service = new CafeteriaService({
      fetchImpl: async (_, { body }) => {
        requests.push(body);
        const date = `${time.startsWith("2026-09-27") ? "2026-09-27" : "2026-10-01"}`;
        const days = Array.from({ length: Number(last) - Number(first) + 1 }, (_, index) =>
          `<th><span id="date_${date.slice(0, 8)}${String(Number(first) + index).padStart(2, "0")}"></span></th>`).join("");
        return { ok: true, text: async () => `<table><caption>메뉴 상세</caption><thead><tr>${days}</tr></thead>`
          + `<tbody><tr><th>중식</th>${empty.repeat(Number(last) - Number(first) + 1)}</tr></tbody></table>` };
      },
      emit() {},
      log: { error() {} },
      now: () => Date.parse(time)
    });
    await service.refresh();
    assert.equal(requests.length, 3);
    for (const body of requests) {
      assert.equal(body.get("selMonth"), month);
      assert.equal(body.get("selWeekFirstDay"), first);
      assert.equal(body.get("selWeekLastDay"), last);
    }
    service.stop();
  }
});

test("fetches three cafeteria IDs and preserves successful data on partial failure", async () => {
  const events = [];
  const errors = [];
  let failDorm = false;
  const requests = [];
  const service = new CafeteriaService({
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://www.hufs.ac.kr/cafeteria/hufs/2/getMenu.do");
      const form = options.body;
      requests.push(form.get("selCafId"));
      assert.equal(form.get("selWeekFirstDay"), "20");
      assert.equal(form.get("selWeekLastDay"), "26");
      if (failDorm && form.get("selCafId") === "h205") return { ok: false, status: 500 };
      return { ok: true, text: async () => html };
    },
    emit: (name, data) => events.push({ name, data }),
    log: { error: (...args) => errors.push(args) },
    now: () => Date.parse("2026-09-22T03:00:00Z")
  });
  await service.refresh();
  assert.deepEqual(requests, ["h203", "h202", "h205"]);
  assert.deepEqual(events[0].data.cafes.map((cafe) => cafe.name),
    ["한그릇 식당", "외대한상 식당", "HufsDorm 식당"]);
  failDorm = true;
  await service.refresh();
  assert.equal(events[1].data.partialFailure, true);
  assert.equal(events[1].data.cafes[2].meals.length, 1);
  assert.match(errors[0][0], /h205 menu fetch failed:/);
  assert.match(errors[0][1].message, /HTTP 500/);
  service.stop();
});

test("an older refresh cannot clear the controllers of a restarted refresh", async () => {
  const pending = [];
  const service = new CafeteriaService({
    fetchImpl: (url, options) => new Promise((resolve) => {
      pending.push({ resolve, signal: options.signal });
    }),
    emit() {},
    log: { error() {} },
    now: () => Date.parse("2026-09-22T03:00:00Z")
  });
  const first = service.refresh();
  assert.equal(pending.length, 3);
  service.stop();
  const second = service.refresh();
  assert.equal(pending.length, 6);
  pending.slice(0, 3).forEach(({ resolve }) => resolve({ ok: true, text: async () => html }));
  await first;
  assert.equal(service.controllers.length, 3);
  service.stop();
  assert.ok(pending.slice(3).every(({ signal }) => signal.aborted));
  pending.slice(3).forEach(({ resolve }) => resolve({ ok: true, text: async () => html }));
  await second;
});
