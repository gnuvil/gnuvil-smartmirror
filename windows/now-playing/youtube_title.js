"use strict";

// YouTube 영상 제목과 채널명에서 "아티스트"와 "곡명"을 뽑는다.
// 제목 형식이 제각각이라 흔한 형식만 처리하고, 모르는 형식은 제목은 그대로 두고 채널명을 아티스트로 쓴다.

const TAG = /^(?:official\s*)?(?:music\s*video|m\/?v|video|audio|lyrics?(?:\s*video)?|visuali[sz]er|performance\s*video|special\s*video|live\s*clip|color\s*coded\s*lyrics.*|가사|4k|hd|hq|official)$/i;
const TRAILING_TAG = /[\s\-–—:：|｜]*(?:official\s*)?(?:music\s*video|m\/v|mv|lyrics?\s*video|lyrics|audio|video|visuali[sz]er)\s*$/i;
const BRACKETS = /\s*[(\[【（]([^)\]】）]*)[)\]】）]/g;
const QUOTED = /(^|\s)[‘'"“「『]([^’'"”」』]+)[’'"”」』](?=\s|$)/;
const DASH = /\s+[-–—_]\s+/;
const SLASH = /\s+[/／]\s+/;
const PIPE = /\s+[|｜]\s+/;
const COVER_BY = /\s*[✧✦★☆♪◆・·\-–—/]?\s*cover\s+by\s+.*$/i;

// 𝐫𝐚𝐲처럼 꾸밈용 유니코드 글자나 전각 문자로 쓴 제목을 보통 글자로 바꾼다.
function normalize(value) {
  return String(value || "").normalize("NFKC");
}

function isTag(text) {
  const value = text.trim();
  return TAG.test(value) || value.split(/\s*[/,·&]\s*/).every((part) => part && TAG.test(part));
}

function cleanChannel(channel) {
  return normalize(channel).trim()
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*(?:official\s*)?(?:youtube\s*)?channel$/i, "")
    .replace(/\s*공식\s*(?:채널)?$/, "")
    .replace(/^official\s+|\s+official$/i, "")
    .trim();
}

// "NewJeans (뉴진스)"처럼 다른 표기를 괄호로 덧붙인 아티스트명은 앞부분만 쓴다.
function stripAlias(artist) {
  const match = /^(.+?)\s*[(（][^)）]*[)）]$/.exec(artist);
  return match ? match[1].trim() : artist;
}

function trimSeparators(text) {
  return text.replace(/^[\s\-–—_:：|｜/]+|[\s\-–—_:：|｜/]+$/g, "").trim();
}

function cleanYouTubeTitle(rawTitle, rawChannel) {
  const channel = cleanChannel(rawChannel);
  let text = normalize(rawTitle).replace(/\s+/g, " ").trim();
  const original = text;

  // 맨 앞의 【아티스트】 꼬리표는 아티스트 후보로 남긴다.
  let hint = "";
  const leading = /^[\[【]([^\]】]+)[\]】]\s*/.exec(text);
  if (leading && !isTag(leading[1])) {
    hint = leading[1].trim();
    text = text.slice(leading[0].length);
  }
  text = text.replace(BRACKETS, (whole, inner) => (isTag(inner) ? "" : whole)).trim();
  text = text.split(PIPE)[0].replace(COVER_BY, "");
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(TRAILING_TAG, "").trim();
  }

  let artist = "";
  let title = text;
  const quoted = QUOTED.exec(text);
  if (quoted) {
    title = quoted[2];
    artist = trimSeparators(text.slice(0, quoted.index));
  } else if (DASH.test(text) && SLASH.test(text.split(DASH)[0])) {
    // "곡명 / 아티스트 - English Title / Artist"처럼 두 언어를 이어 붙인 제목은 앞쪽만 쓴다.
    const [left, ...right] = text.split(DASH)[0].split(SLASH);
    title = left;
    artist = right.join(" / ");
  } else if (DASH.test(text)) {
    const [left, ...right] = text.split(DASH);
    const rest = right.join(" - ");
    // "곡명 - 원곡 가수 Cover 부른 사람"이면 앞쪽이 곡명이고 부른 사람은 채널이다.
    if (/\bcover\b/i.test(rest.replace(BRACKETS, ""))) {
      title = left;
    } else {
      artist = left;
      title = rest;
    }
  } else if (SLASH.test(text)) {
    // "곡명 / 아티스트"는 일본 곡에서 흔하다. 커버 영상은 "/ 부른 사람 Cover"로 쓴다.
    const [left, ...right] = text.split(SLASH);
    title = left;
    artist = right.join(" / ").replace(/\s*cover$/i, "");
  }
  artist = stripAlias(trimSeparators(artist || hint || channel));
  title = trimSeparators(title) || original;
  return { artist: artist || channel, title };
}

module.exports = { cleanYouTubeTitle, cleanChannel };
