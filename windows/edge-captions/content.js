"use strict";

// YouTube 플레이어에 지금 보이는 자막 줄을 읽어 확장 백그라운드로 넘긴다.
// 영상이 재생 중인 탭에서만 보내므로, 멈춘 탭이나 다른 탭이 미러 자막을 덮어쓰지 않는다.
const READ_INTERVAL = 250;
const HEARTBEAT = 1000;
const MAX_UPCOMING = 3;
let lastText = null;
let lastSentAt = 0;

function captionText() {
  const lines = [...document.querySelectorAll(".ytp-caption-window-container .caption-visual-line")];
  const parts = lines.length ? lines : [...document.querySelectorAll(".ytp-caption-segment")];
  return parts.map((part) => part.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

// 서버가 SMTC 제목과 맞춰 보도록 영상 제목을 함께 보낸다.
function videoTitle() {
  return navigator.mediaSession?.metadata?.title
    || document.querySelector("ytd-watch-metadata h1")?.textContent.trim()
    || document.title.replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, "");
}

// 재생목록 패널에서 지금 곡 다음에 오는 곡들을 읽는다. 재생목록이 아닌 영상은 패널이 없어 빈 배열이다.
function upcoming() {
  const items = [...document.querySelectorAll("ytd-playlist-panel-video-renderer")];
  const current = items.findIndex((item) => item.hasAttribute("selected"));
  if (current < 0) return [];
  const text = (element) => (element?.getAttribute("title") || element?.textContent || "").replace(/\s+/g, " ").trim();
  return items.slice(current + 1, current + 1 + MAX_UPCOMING)
    .map((item) => ({ title: text(item.querySelector("#video-title")), channel: text(item.querySelector("#byline")) }))
    .filter((item) => item.title);
}

setInterval(() => {
  const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
  if (!video || video.paused || video.ended) return;
  const text = captionText();
  const now = Date.now();
  if (text === lastText && now - lastSentAt < HEARTBEAT) return;
  lastText = text;
  lastSentAt = now;
  try {
    chrome.runtime.sendMessage({ text, title: videoTitle(), queue: upcoming() });
  } catch {
    // 확장을 다시 불러오면 이전 페이지의 스크립트는 연결이 끊긴다. 새로고침하면 다시 동작한다.
  }
}, READ_INTERVAL);
