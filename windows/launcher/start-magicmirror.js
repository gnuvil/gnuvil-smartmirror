"use strict";

// MagicMirror를 미러 디스플레이에 전체화면으로 띄운다.
// 1) 레포의 config, css/custom.css, MMM-Gnuvil* 모듈을 MagicMirror 설치 폴더에 연결하고 (관리자 권한 불필요)
// 2) GNUVIL_MIRROR_DISPLAY(예: 2 → \\.\DISPLAY2)의 좌표를 읽어 GNUVIL_MIRROR_BOUNDS로 넘긴 뒤
// 3) Electron을 실행한다.
// 부팅 직후 PowerShell은 이 PC에서 시작에 몇 분 걸려서 로그온 경로는 Node로만 처리한다.
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const WINDOWS = path.join(__dirname, "..");
const REPO = path.join(WINDOWS, "..");
const BIN = path.join(WINDOWS, "bin");
// 첫 화면을 불러오는 중에 Electron 네트워크 서비스가 죽으면 MagicMirror가 창을 끝내 보여 주지 않는다
// (ready-to-show가 오지 않아 창이 숨겨진 채 남음). 시작 2분 안에 그 메시지가 나오면 Electron을 다시 띄운다.
const STARTUP_MS = 120_000;
const STARTUP_CRASH = /Network service crashed/;
const MAX_RELAUNCHES = 5;

function log(message) {
  console.log(`[${new Date().toISOString()}] [gnuvil] ${message}`);
}

function samePath(a, b) {
  try {
    return fs.realpathSync(a).toLowerCase() === fs.realpathSync(b).toLowerCase();
  } catch {
    return false;
  }
}

// 이미 같은 곳을 가리키면 그대로 두고, 진짜 폴더가 있으면 지우지 않고 이름을 바꿔 둔다.
function setJunction(link, target) {
  if (samePath(link, target)) return;
  const info = fs.lstatSync(link, { throwIfNoEntry: false });
  if (info?.isSymbolicLink()) fs.unlinkSync(link);
  else if (info) fs.renameSync(link, `${link}.orig-${Date.now()}`);
  fs.symlinkSync(target, link, "junction");
}

function linkRepository(magicMirror) {
  setJunction(path.join(magicMirror, "config"), path.join(REPO, "config"));
  for (const entry of fs.readdirSync(path.join(REPO, "modules"), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("MMM-Gnuvil")) {
      setJunction(path.join(magicMirror, "modules", entry.name), path.join(REPO, "modules", entry.name));
    }
  }
  // git이 custom.css를 새 파일로 바꾸면 하드링크가 끊기므로 매번 다시 만든다.
  const css = path.join(magicMirror, "css", "custom.css");
  fs.rmSync(css, { force: true });
  fs.linkSync(path.join(REPO, "css", "custom.css"), css);
}

function parseBounds(text) {
  const parts = String(text || "").trim().split(",").map((part) => Number(part.trim()));
  return parts.length === 4 && parts.every(Number.isInteger) && parts[2] > 0 && parts[3] > 0 ? parts.join(",") : null;
}

function displayBounds(display, run = execFileSync) {
  if (!display) return null;
  try {
    return parseBounds(run(path.join(BIN, "GnuvilDisplayBounds.exe"), [String(display)],
      { encoding: "utf8", windowsHide: true, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    log(`미러 디스플레이 '${display}'를 찾지 못해 주 화면에 띄웁니다: ${String(error.stderr || error.message).trim()}`);
    return null;
  }
}

// MagicMirror에 넘길 환경변수. 이미 지정된 값은 덮어쓰지 않는다.
function mirrorEnvironment(environment, { bounds, visualizer }) {
  const result = { ...environment };
  if (bounds) result.GNUVIL_MIRROR_BOUNDS = bounds;
  else delete result.GNUVIL_MIRROR_BOUNDS;
  result.GNUVIL_NOW_PLAYING_URL ||= "http://127.0.0.1:8765/now-playing";
  if (visualizer && !result.GNUVIL_VISUALIZER_COMMAND) result.GNUVIL_VISUALIZER_COMMAND = visualizer;
  return result;
}

function runElectron(start, { now = Date.now, setTimer = setTimeout, exit = process.exit,
  stdout = process.stdout, stderr = process.stderr } = {}) {
  let relaunches = 0;
  const launch = () => {
    const startedAt = now();
    const child = start();
    let relaunching = false;
    const watch = (stream, output) => stream.on("data", (chunk) => {
      output.write(chunk);
      if (relaunching || relaunches >= MAX_RELAUNCHES || now() - startedAt > STARTUP_MS || !STARTUP_CRASH.test(String(chunk))) return;
      relaunching = true;
      relaunches += 1;
      log(`화면을 띄우는 중에 Electron 네트워크 서비스가 멈춰 다시 시작합니다 (${relaunches}/${MAX_RELAUNCHES})`);
      child.kill();
    });
    watch(child.stdout, stdout);
    watch(child.stderr, stderr);
    child.on("exit", (code) => (relaunching ? setTimer(launch, 3000) : exit(code ?? 1)));
  };
  launch();
}

function main() {
  const magicMirror = process.env.GNUVIL_MM_DIR || path.join(REPO, "..", "MagicMirror");
  if (!fs.existsSync(path.join(magicMirror, "js", "electron.js"))) {
    log(`MagicMirror 설치 폴더를 찾을 수 없습니다: ${magicMirror}`);
    process.exit(1);
  }
  linkRepository(magicMirror);
  log(`MagicMirror 연결 완료: ${magicMirror}`);
  const bounds = displayBounds(process.env.GNUVIL_MIRROR_DISPLAY);
  if (bounds) log(`미러 디스플레이 DISPLAY${process.env.GNUVIL_MIRROR_DISPLAY}: ${bounds}`);
  const visualizer = path.join(BIN, "GnuvilLoopbackBars.exe");
  const env = mirrorEnvironment(process.env, { bounds, visualizer: fs.existsSync(visualizer) ? visualizer : null });
  // electron 패키지는 실행 파일 경로를 내보낸다 (node --run start:windows와 같은 실행).
  const electron = require(path.join(magicMirror, "node_modules", "electron"));
  runElectron(() => spawn(electron, ["js/electron.js"], { cwd: magicMirror, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: false }));
}

if (require.main === module) main();

module.exports = { parseBounds, displayBounds, mirrorEnvironment, runElectron };
