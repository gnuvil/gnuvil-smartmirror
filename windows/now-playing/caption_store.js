"use strict";

// Edge 확장(windows/edge-captions)이 보내는 YouTube 자막을 받아 두었다가 /now-playing 응답에 붙인다.
// 확장은 재생 중인 탭에서만 1초마다 보내므로, 잠시 소식이 없으면 자막을 지운다.
// 같은 메시지에 재생목록의 다음 곡(queue)도 실려 오며, 같은 방식으로 다룬다.

const STALE_AFTER = 3000;
const MAX_BODY = 8192;
const MAX_QUEUE = 3;
const MAX_LINES = 2;
const MAX_LENGTH = 200;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function cleanCaption(value) {
  return String(value || "").normalize("NFKC").split(/\r?\n/)
    .map((line) => line.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean).slice(-MAX_LINES).join("\n").slice(0, MAX_LENGTH);
}

function cleanQueue(value) {
  const text = (item) => String(item || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  return (Array.isArray(value) ? value : []).slice(0, MAX_QUEUE)
    .map((item) => ({ title: text(item?.title), channel: text(item?.channel) }))
    .filter((item) => item.title);
}

function sameVideo(a, b) {
  const left = String(a || "").normalize("NFKC").trim();
  const right = String(b || "").normalize("NFKC").trim();
  return !left || !right || left === right || left.includes(right) || right.includes(left);
}

class CaptionStore {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.caption = null;
  }

  update({ text, title, queue } = {}) {
    this.caption = { text: cleanCaption(text), title: String(title || ""), queue: cleanQueue(queue), receivedAt: this.now() };
  }

  // 지금 미러에 보이는 영상과 같은 영상의 재생목록에서 다음에 올 곡들 (원래 제목과 채널 이름).
  upcoming(sessionTitle) {
    const caption = this.caption;
    if (!caption?.queue.length || this.now() - caption.receivedAt > STALE_AFTER) return [];
    return sameVideo(caption.title, sessionTitle) ? caption.queue : [];
  }

  // 지금 미러에 보이는 영상과 같은 영상의 최신 자막만 돌려준다.
  current(sessionTitle) {
    const caption = this.caption;
    if (!caption || !caption.text || this.now() - caption.receivedAt > STALE_AFTER) return null;
    return sameVideo(caption.title, sessionTitle) ? caption.text : null;
  }

  // POST /caption. 웹 페이지가 보내지 못하도록 이 PC에서 온 JSON 요청과 전용 헤더만 받는다.
  // (헤더가 붙은 교차 출처 요청은 사전 요청이 필요한데, 이 서버는 OPTIONS에 응답하지 않는다.)
  route(request, response) {
    if (request.url !== "/caption") return false;
    if (request.method !== "POST" || request.headers["x-gnuvil-caption"] !== "1"
      || !String(request.headers["content-type"] || "").startsWith("application/json")
      || !LOOPBACK.has(request.socket?.remoteAddress)) {
      response.writeHead(403).end();
      return true;
    }
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) tooLarge = true;
    });
    request.on("end", () => {
      if (tooLarge) {
        response.writeHead(413).end();
        return;
      }
      try {
        this.update(JSON.parse(body));
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
    return true;
  }
}

module.exports = { CaptionStore, cleanCaption, cleanQueue, sameVideo };
