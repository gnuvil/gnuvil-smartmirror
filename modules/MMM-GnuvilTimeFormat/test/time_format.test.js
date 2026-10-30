"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const updates = [];
  const formats = [];
  const fn = { format(pattern) { formats.push(pattern); return pattern; } };
  let registered = null;
  let definition = null;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "MMM-GnuvilTimeFormat.js"), "utf8"), {
    moment: { updateLocale: (name, options) => updates.push([name, options]), fn },
    Module: { register: (name, value) => { registered = name; definition = value; } }
  });
  return { updates, formats, fn, registered, definition };
}

test("waits for moment, then labels Korean 12-hour times with AM and PM", () => {
  const { updates, registered, definition } = load();
  assert.equal(registered, "MMM-GnuvilTimeFormat");
  // moment는 모듈 파일 다음에 읽히므로 파일을 읽을 때는 아직 바꾸지 않는다.
  assert.equal(updates.length, 0);
  assert.deepEqual([...definition.getScripts()], ["moment.js"]);
  definition.start();
  const [name, { meridiem }] = updates[0];
  assert.equal(name, "ko");
  assert.deepEqual([meridiem(0), meridiem(11), meridiem(12), meridiem(23)], ["AM", "AM", "PM", "PM"]);
});

test("pads only the clock's stand-alone hour", () => {
  const { formats, fn, definition } = load();
  definition.start();
  fn.format("h");
  fn.format("h:mm A");
  fn.format("mm");
  assert.deepEqual(formats, ["hh", "h:mm A", "mm"]);
});
