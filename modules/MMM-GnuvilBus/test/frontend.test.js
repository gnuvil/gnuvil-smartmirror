"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = "";
    this.textContent = "";
    this.children = [];
  }

  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  text() { return [this.textContent, ...this.children.map((child) => child.text())].join(" "); }
}

const file = path.join(__dirname, "..", "MMM-GnuvilBus.js");
let definition;
vm.runInNewContext(fs.readFileSync(file, "utf8"), {
  Module: { register: (name, value) => {
    assert.equal(name, "MMM-GnuvilBus");
    definition = value;
  } },
  document: { createElement: (tagName) => new Element(tagName) },
  Number
});

function moduleInstance(config = {}) {
  const sent = [];
  const instance = {
    ...definition,
    config: { ...definition.defaults, ...config },
    sendSocketNotification: (...args) => sent.push(args),
    updateDom() {}
  };
  instance.start();
  return { instance, sent };
}

test("sends only public config and shows setup error", () => {
  const { instance, sent } = moduleInstance();
  assert.equal(sent[0][0], "BUS_CONFIG");
  assert.equal(JSON.stringify(sent).includes("GBIS_API_KEY"), false);
  instance.socketNotificationReceived("BUS_ERROR", { message: "버스 설정 필요", data: null });
  assert.match(instance.getDom().text(), /버스 설정 필요/);
});

test("sorts arriving buses and omits routes without arrival information", () => {
  const { instance } = moduleInstance();
  const routes = [
    { routeName: "A", first: { minutes: 4 }, second: { minutes: 15 } },
    { routeName: "B", first: { minutes: 7 }, second: null },
    { routeName: "C", first: null, second: null },
    { routeName: "D", first: { minutes: 10 }, second: { minutes: 22 } },
    { routeName: "Very-Long-Route-Name", first: { minutes: 18 }, second: null },
    { routeName: "E", first: null, second: { minutes: 2 } }
  ];
  instance.socketNotificationReceived("BUS_DATA", { updatedAt: 1, stale: false, routes });
  const dom = instance.getDom();
  const text = dom.text();
  assert.match(text, /A 4분 · 15분/);
  assert.match(text, /B 7분/);
  assert.doesNotMatch(text, /C/);
  assert.match(text, /Very-Long-Route-Name/);
  assert.deepEqual(dom.children.at(-1).children.map((row) => row.children[0].text().trim()),
    ["E", "A", "B", "D", "Very-Long-Route-Name"]);
  assert.match(text, /E 2분/);
});

test("shows cached data as stale and only uses walk hint when configured", () => {
  const { instance } = moduleInstance({ walkMinutes: 5 });
  const data = { updatedAt: 1, stale: true, routes: [{ routeName: "A", first: { minutes: 4 }, second: null }] };
  instance.socketNotificationReceived("BUS_ERROR", { message: "오류", data });
  const dom = instance.getDom();
  assert.match(dom.text(), /버스 정보 업데이트 지연/);
  assert.match(dom.text(), /서둘러 출발/);
  assert.equal(dom.children.at(-1).className, "gnuvil-bus-list stale");
});

test("shows destination for each direction and an empty status", () => {
  const { instance } = moduleInstance();
  instance.socketNotificationReceived("BUS_DATA", { updatedAt: 1, stale: false, routes: [
    { routeName: "1500-2", destination: "에버랜드", first: { minutes: 3 }, second: null },
    { routeName: "1500-2", destination: "사당역", first: { minutes: 9 }, second: null }
  ] });
  const dom = instance.getDom();
  assert.match(dom.text(), /1500-2\s+·\s+에버랜드행 3분/);
  assert.match(dom.text(), /1500-2\s+·\s+사당역행 9분/);
  const routeLabel = dom.children.at(-1).children[0].children[0];
  assert.equal(routeLabel.children[0].className, "gnuvil-bus-number");
  assert.equal(routeLabel.children[0].textContent, "1500-2");
  assert.equal(routeLabel.children[2].className, "gnuvil-bus-destination");
  instance.socketNotificationReceived("BUS_DATA", { updatedAt: 2, stale: false, routes: [] });
  assert.match(instance.getDom().text(), /현재 도착 정보 없음/);
});
