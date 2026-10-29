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
    // "시라유키 히나 SHIRAYUKI HINA"처럼 로마자 표기를 덧붙인 채널명은 앞부분만 쓴다.
    .replace(/^(.*[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}].*?)\s+[A-Z][A-Z0-9 .'&-]*$/u, "$1")
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

// 괄호 밖에 있는 구분자에서만 나눈다. "곡명 [원제 / 원곡 가수] / 부른 사람"의 괄호 안 '/'는 구분자가 아니다.
function splitOutside(text, separator) {
  const masked = text.replace(/[(\[【]([^)\]】]*)[)\]】]/g, (whole) => "\u0000".repeat(whole.length));
  const parts = [];
  let start = 0;
  for (const match of masked.matchAll(new RegExp(separator.source, "g"))) {
    parts.push(text.slice(start, match.index));
    start = match.index + match[0].length;
  }
  parts.push(text.slice(start));
  return parts;
}

// cover: 커버 영상인지, alternate: 곡명과 아티스트 순서를 확신할 수 없을 때 반대 순서 후보
function parseYouTubeTitle(rawTitle, rawChannel) {
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
  // "곡명 - 원곡 가수 | 부른 사람 Cover"의 '|' 뒤는 버리기 전에 커버 정보만 읽어 둔다.
  const [beforePipe, ...afterPipe] = splitOutside(text, PIPE);
  const pipeCover = /^(.*?)\s*\bcover\b\s*$/i.exec(trimSeparators(afterPipe.join(" ").replace(BRACKETS, "")));
  const cover = Boolean(pipeCover) || /\bcover\b/i.test(original);
  if (pipeCover?.[1] && !hint) hint = pipeCover[1].trim();
  text = beforePipe.replace(COVER_BY, "");
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(TRAILING_TAG, "").trim();
  }

  let artist = "";
  let title = text;
  let alternate = null;
  const quoted = QUOTED.exec(text);
  const dashed = splitOutside(text, DASH);
  const slashed = splitOutside(text, SLASH);
  // "곡명 - 원곡 가수 Cover 부른 사람"이면 앞쪽이 곡명이고 부른 사람은 채널이다.
  const dashCover = dashed.length > 1 && Boolean(pipeCover || /\bcover\b/i.test(dashed.slice(1).join(" ").replace(BRACKETS, "")));
  // 커버 영상의 "Lilac 「ライラック」"에서 따옴표 부분은 곡명의 다른 표기라 아티스트를 나누지 않는다.
  if (quoted && !dashCover) {
    title = quoted[2];
    artist = trimSeparators(text.slice(0, quoted.index));
  } else if (dashed.length > 1 && splitOutside(dashed[0], SLASH).length > 1) {
    // "곡명 / 아티스트 - English Title / Artist"처럼 두 언어를 이어 붙인 제목은 앞쪽만 쓴다.
    const [left, ...right] = splitOutside(dashed[0], SLASH);
    title = left;
    artist = right.join(" / ");
  } else if (dashed.length > 1) {
    const [left, ...right] = dashed;
    const rest = right.join(" - ");
    const isChannel = (text) => channel && text.trim().toLowerCase() === channel.toLowerCase();
    if (dashCover) {
      title = left;
    } else if (isChannel(rest) && !isChannel(left)) {
      // "곡명 - 아티스트" 순서인 영상은 오른쪽이 채널명과 같다.
      artist = rest;
      title = left;
    } else {
      artist = left;
      title = rest;
      alternate = { artist: rest, title: left };
    }
  } else if (slashed.length > 1) {
    // "곡명 / 아티스트"는 일본 곡에서 흔하다. 커버 영상은 "/ 부른 사람 Cover"로 쓴다.
    const [left, ...right] = slashed;
    title = left;
    artist = right.join(" / ").replace(/\s*cover$/i, "");
    if (!cover) alternate = { artist: left, title: artist };
  }
  artist = stripAlias(trimSeparators(artist || hint || channel));
  title = trimSeparators(title).replace(/([(\[【])\s+/g, "$1").replace(/\s+([)\]】])/g, "$1") || original;
  const clean = (value) => stripAlias(trimSeparators(value));
  if (alternate) alternate = { artist: clean(alternate.artist), title: trimSeparators(alternate.title) };
  return { artist: artist || channel, title, cover, alternate: alternate?.artist && alternate.title ? alternate : null };
}

function cleanYouTubeTitle(rawTitle, rawChannel) {
  const { artist, title } = parseYouTubeTitle(rawTitle, rawChannel);
  return { artist, title };
}

module.exports = { cleanYouTubeTitle, parseYouTubeTitle, cleanChannel };
