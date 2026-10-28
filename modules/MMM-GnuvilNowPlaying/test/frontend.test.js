"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.textContent = ""; this.alt = ""; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  addEventListener() {}
  text() { return [this.textContent, ...this.children.map((child) => child.text())].join(" "); }
}

let definition;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "MMM-GnuvilNowPlaying.js"), "utf8"), {
  Module: { register: (name, value) => { assert.equal(name, "MMM-GnuvilNowPlaying"); definition = value; } },
  document: { createElement: (tag) => new Element(tag) }
});

test("shows an idle message, then playing metadata and artwork, then the idle message", () => {
  const instance = {
    ...definition,
    config: definition.defaults,
    sendSocketNotification() {}, updateDom() {}
  };
  instance.start();
  assert.match(instance.getDom().text(), /현재 재생 중인 음악이 없습니다/);
  instance.socketNotificationReceived("NOW_PLAYING_DATA", {
    playing: true, title: "Ditto", artist: "NewJeans", album: "OMG",
    position: 93, duration: 185, art: "https://images.example/cover.jpg"
  });
  const dom = instance.getDom();
  assert.match(dom.text(), /Ditto.*NewJeans/);
  assert.equal(dom.children[0].tag, "img");
  assert.match(dom.children[1].children.at(-1).children[0].style.width, /^50/);
  assert.equal(dom.children.length, 2);
  instance.socketNotificationReceived("NOW_PLAYING_DATA", {
    playing: true, title: "Ditto", artist: "NewJeans", caption: "널 보고 있어"
  });
  const captioned = instance.getDom();
  assert.equal(captioned.children.at(-1).className, "gnuvil-now-playing-caption");
  assert.equal(captioned.children.at(-1).textContent, "널 보고 있어");
  // 같은 곡에서 자막이 잠시 없으면 빈 자막 줄로 자리를 지킨다. 곡이 바뀌면 없앤다.
  instance.socketNotificationReceived("NOW_PLAYING_DATA", { playing: true, title: "Ditto", artist: "NewJeans" });
  assert.equal(instance.getDom().children.at(-1).className, "gnuvil-now-playing-caption");
  assert.equal(instance.getDom().children.at(-1).textContent, "");
  instance.socketNotificationReceived("NOW_PLAYING_DATA", { playing: true, title: "Hype Boy", artist: "NewJeans" });
  assert.notEqual(instance.getDom().children.at(-1).className, "gnuvil-now-playing-caption");
  instance.socketNotificationReceived("NOW_PLAYING_DATA", { playing: false });
  assert.match(instance.getDom().text(), /현재 재생 중인 음악이 없습니다/);
  instance.socketNotificationReceived("NOW_PLAYING_DATA", { playing: false, unavailable: true });
  assert.match(instance.getDom().text(), /음악 정보를 불러올 수 없습니다/);
});
