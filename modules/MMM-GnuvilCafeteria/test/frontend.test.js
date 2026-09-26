"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor() { this.children = []; this.textContent = ""; this.className = ""; }
  appendChild(child) { this.children.push(child); }
  text() { return [this.textContent, ...this.children.map((child) => child.text())].join(" "); }
}

let definition;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "MMM-GnuvilCafeteria.js"), "utf8"), {
  Module: { register: (name, value) => { assert.equal(name, "MMM-GnuvilCafeteria"); definition = value; } },
  document: { createElement: () => new Element() },
  Intl, Date
});

test("renders all three cafeterias, a selected meal, and empty states", () => {
  const instance = { ...definition, config: definition.defaults, updateDom() {} };
  instance.today = () => "2026-09-22";
  instance.currentMinutes = () => 720;
  instance.cafeteriaData = {
    date: "2026-09-22", partialFailure: false,
    cafes: [
      { name: "한그릇 식당", meals: [{ mealType: "일품", start: "10:30", end: "14:30", menu: ["제육덮밥", "김치"] }] },
      { name: "외대한상 식당", meals: [{ mealType: "중식", start: "11:10", end: "13:10", menu: ["갈비탕"] }] },
      { name: "HufsDorm 식당", meals: [] }
    ]
  };
  const content = instance.getDom().text();
  assert.match(content, /한그릇 식당.*제육덮밥/);
  assert.match(content, /외대한상 식당.*갈비탕/);
  assert.match(content, /HufsDorm 식당.*오늘 메뉴 없음/);
  instance.cafeteriaData.date = "2026-09-21";
  assert.match(instance.getDom().text(), /오늘 메뉴 확인 중/);
});
