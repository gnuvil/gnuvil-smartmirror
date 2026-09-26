"use strict";

const http = require("node:http");
const { timingSafeEqual } = require("node:crypto");
const { PlayerState } = require("./player_state");

function authorized(header, token) {
  if (!token) return true;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createServer({ player = new PlayerState(), token = process.env.GNUVIL_NOW_PLAYING_TOKEN } = {}) {
  return http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" || request.url !== "/now-playing") {
      response.writeHead(404).end();
      return;
    }
    if (!authorized(request.headers.authorization, token)) {
      response.writeHead(401).end();
      return;
    }
    try {
      const data = await player.get();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(data));
    } catch {
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "playerctl unavailable" }));
    }
  });
}

function start() {
  const bind = process.env.GNUVIL_NOW_PLAYING_BIND || "127.0.0.1";
  const port = Number(process.env.GNUVIL_NOW_PLAYING_PORT || 8765);
  const token = process.env.GNUVIL_NOW_PLAYING_TOKEN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid now-playing port");
  if (!(["127.0.0.1", "::1", "localhost"].includes(bind)) && !token) {
    throw new Error("GNUVIL_NOW_PLAYING_TOKEN is required for non-loopback binding");
  }
  const server = createServer({ token });
  server.listen(port, bind, () => console.log(`Now Playing API listening on ${bind}:${port}`));
  return server;
}

if (require.main === module) start();

module.exports = { authorized, createServer, start };
