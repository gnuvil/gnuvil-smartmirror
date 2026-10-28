"use strict";

// 자막을 이 PC의 Now Playing API로 보낸다. 확장 권한으로 보내므로 YouTube 페이지의 CORS 제한을 받지 않는다.
// X-Gnuvil-Caption 헤더가 없으면 서버가 받지 않는다.
chrome.runtime.onMessage.addListener((message) => {
  fetch("http://127.0.0.1:8765/caption", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Gnuvil-Caption": "1" },
    body: JSON.stringify({ text: message?.text || "", title: message?.title || "" })
  }).catch(() => {
    // 미러 API가 꺼져 있으면 조용히 무시한다.
  });
});
