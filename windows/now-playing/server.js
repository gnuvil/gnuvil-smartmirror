"use strict";

// Windows용 Now Playing API. HTTP 처리와 응답 형식은 Linux 에이전트(main-pc)의 서버를 그대로 쓰고,
// 재생 정보만 playerctl 대신 Windows 미디어 세션(SMTC)에서 읽는다.
const { createServer } = require("../../main-pc/now-playing-agent/server");
const { SmtcPlayer } = require("./smtc_player");
const { CaptionStore } = require("./caption_store");

function start() {
  const bind = process.env.GNUVIL_NOW_PLAYING_BIND || "127.0.0.1";
  const port = Number(process.env.GNUVIL_NOW_PLAYING_PORT || 8765);
  const token = process.env.GNUVIL_NOW_PLAYING_TOKEN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid now-playing port");
  if (!(["127.0.0.1", "::1", "localhost"].includes(bind)) && !token) {
    throw new Error("GNUVIL_NOW_PLAYING_TOKEN is required for non-loopback binding");
  }
  const captions = new CaptionStore();
  const player = new SmtcPlayer({ captions });
  player.start();
  const server = createServer({ player, token, extraRoute: (request, response) => captions.route(request, response) });
  server.listen(port, bind, () => console.log(`[gnuvil-now-playing] listening on ${bind}:${port}`));
  server.on("close", () => player.stop());
  return server;
}

if (require.main === module) start();

module.exports = { start };
