"use strict";

// YouTube 영상 제목과 채널명에서 "아티스트"와 "곡명"을 뽑는다.
// 커버 영상과 원곡 영상은 제목을 쓰는 방식이 달라 먼저 커버인지 가린 뒤 따로 읽는다.
// - 커버: "곡명 - 원곡 가수 | 부른 사람 Cover" 꼴이 많다. 아티스트는 부른 사람(없으면 채널)이다.
// - 원곡: "아티스트 - 곡명", "아티스트 '곡명'", "곡명 / 아티스트" 꼴이 많다.
// 제목 형식이 제각각이라 흔한 형식만 처리하고, 모르는 형식은 제목은 그대로 두고 채널명을 아티스트로 쓴다.
// 순서를 확신할 수 없으면 alternate(반대 순서)와 search(iTunes로 확인할 후보)를 함께 돌려준다.

const TAG = /^(?:official\s*)?(?:music\s*video|m\/?v|video|audio|lyrics?(?:\s*video)?|visuali[sz]er|performance\s*video|special\s*video|live\s*clip|color\s*coded\s*lyrics.*|가사|4k|hd|hq|official)$/i;
const TRAILING_TAG = /[\s\-–—:：|｜]*(?:official\s*)?(?:music\s*video|m\/v|mv|lyrics?\s*video|lyrics|audio|video|visuali[sz]er)\s*$/i;
const BRACKETS = /\s*[(\[【（]([^)\]】）]*)[)\]】）]/g;
const QUOTED = /(^|\s)[‘'"“「『]([^’'"”」』]+)[’'"”」』](?=\s|$)/;
const DASH = /\s+[-–—_]\s+/;
const SLASH = /\s+[/／]\s+/;
const PIPE = /\s+[|｜]\s+/;
const COVER_WORD = /\b(?:cover(?:ed)?|covers)\b|커버|歌ってみた/i;
// "곡명 ✧ Cover by 부른 사람", "원곡 가수 Cover 부른 사람", "부른 사람 Cover"
const COVER_PART = /^(.*?)[\s✧✦★☆♪◆・·\-–—/]*(?:\b(?:cover(?:ed)?|covers)\b|커버|歌ってみた)(?:\s+by\b)?[\s:：]*(.*)$/i;
// 【COVER】, (cover), [Cover by 부른 사람]
const COVER_BRACKET = /^\s*(?:cover(?:ed)?|covers|커버|歌ってみた)(?:\s+by\s+(.+?))?\s*$/i;
const HANGUL_BAR = /\s*[ㅣᅵ]\s*/g;

// 𝐫𝐚𝐲처럼 꾸밈용 유니코드 글자나 전각 문자로 쓴 제목을 보통 글자로 바꾼다.
// 한글 모음 'ㅣ'를 구분선으로 쓰는 제목이 있어(TOKOTOKOㅣ아라하시 타비) '|'로 바꾼다. 낱자 'ㅣ'는 보통 낱말에 쓰지 않는다.
function normalize(value) {
  return String(value || "").replace(HANGUL_BAR, " | ").normalize("NFKC");
}

function isTag(text) {
  const value = text.trim();
  return TAG.test(value) || value.split(/\s*[/,·&]\s*/).every((part) => part && TAG.test(part));
}

// "시라유키 히나 SHIRAYUKI HINA"처럼 로마자 표기를 덧붙인 이름은 앞부분만 쓴다.
function stripRomanized(name) {
  return name.replace(/^(.*[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}].*?)\s+[A-Z][A-Z0-9 .'&-]*$/u, "$1");
}

function cleanChannel(channel) {
  return stripRomanized(normalize(channel).trim()
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*(?:official\s*)?(?:youtube\s*)?channel$/i, "")
    .replace(/\s*공식\s*(?:채널)?$/, "")
    .replace(/^official\s+|\s+official$/i, "")
    .trim()).trim();
}

// "NewJeans (뉴진스)"처럼 다른 표기를 괄호로 덧붙인 아티스트명은 앞부분만 쓴다.
function stripAlias(artist) {
  const match = /^(.+?)\s*[(（][^)）]*[)）]$/.exec(artist);
  return match ? match[1].trim() : artist;
}

function trimSeparators(text) {
  return text.replace(/^[\s\-–—_:：|｜/✧✦★☆♪◆・·]+|[\s\-–—_:：|｜/✧✦★☆♪◆・·]+$/g, "").trim();
}

function tidyTitle(text) {
  return trimSeparators(text).replace(/([(\[【])\s+/g, "$1").replace(/\s+([)\]】])/g, "$1");
}

function cleanName(text) {
  return stripRomanized(stripAlias(trimSeparators(text))).trim();
}

// "[星街すいせい]"처럼 통째로 괄호에 싼 이름은 괄호를 벗긴다.
function unwrap(text) {
  const match = /^\s*[(\[【（]([^)\]】）]+)[)\]】）]\s*$/.exec(text);
  return match ? match[1].trim() : text;
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

function outsideBrackets(text) {
  return text.replace(BRACKETS, " ");
}

function isCover(text) {
  if (COVER_WORD.test(outsideBrackets(text))) return true;
  return [...text.matchAll(BRACKETS)].some((match) => COVER_BRACKET.test(match[1]));
}

function stripTrailingTags(text) {
  let result = text;
  for (let previous = ""; previous !== result;) {
    previous = result;
    result = result.replace(TRAILING_TAG, "").trim();
  }
  return result;
}

// 커버 영상: 첫 조각이 곡명, Cover가 붙은 조각이 부른 사람, 나머지 조각이 원곡 가수다.
function parseCover(text, { hint, channel }) {
  let performer = "";
  const body = text.replace(BRACKETS, (whole, inner) => {
    const match = COVER_BRACKET.exec(inner);
    if (!match) return whole;
    if (match[1]) performer = match[1];
    return " ";
  }).replace(/\s+/g, " ").trim();

  const parts = splitOutside(body, PIPE)
    .flatMap((part) => splitOutside(part, DASH))
    .flatMap((part) => splitOutside(part, SLASH))
    .map((part) => stripTrailingTags(part.trim()))
    .filter(Boolean);
  let song = parts.shift() || body;
  let originalArtist = "";
  // "ray ✧ Cover by 이샤"처럼 곡명 조각 안에 커버 표시가 있으면 거기서 나눈다.
  const inSong = COVER_WORD.test(outsideBrackets(song)) && COVER_PART.exec(song);
  if (inSong && inSong[1].trim()) {
    song = inSong[1];
    performer ||= inSong[2];
  }
  for (const part of parts) {
    const match = COVER_WORD.test(outsideBrackets(part)) && COVER_PART.exec(part);
    if (match) {
      const [, before, after] = match;
      // "Mrs. GREEN APPLE ✧ Cover 이샤"는 앞이 원곡 가수, 뒤가 부른 사람이다.
      if (after.trim()) {
        performer ||= after;
        if (before.trim()) originalArtist ||= before;
      } else {
        performer ||= before;
      }
    } else {
      originalArtist ||= unwrap(part);
    }
  }

  const artist = cleanName(performer) || hint || channel;
  const title = tidyTitle(song);
  originalArtist = cleanName(originalArtist);
  if (!originalArtist) return { artist, title, cover: true, alternate: null, search: [] };
  // "아이유 - 밤편지 (cover)"처럼 원곡 가수가 앞에 오는 제목도 있어 반대 순서도 iTunes로 확인한다.
  return {
    artist,
    title,
    cover: true,
    alternate: { artist, title: originalArtist },
    search: [{ artist: originalArtist, title }, { artist: title, title: originalArtist }]
  };
}

function parseOriginal(text, { hint, channel }) {
  text = stripTrailingTags(splitOutside(text, PIPE)[0]);
  let artist = "";
  let title = text;
  let alternate = null;
  const quoted = QUOTED.exec(text);
  const dashed = splitOutside(text, DASH);
  const slashed = splitOutside(text, SLASH);
  if (quoted) {
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
    const isChannel = (value) => channel && value.trim().toLowerCase() === channel.toLowerCase();
    if (isChannel(rest) && !isChannel(left)) {
      // "곡명 - 아티스트" 순서인 영상은 오른쪽이 채널명과 같다.
      artist = rest;
      title = left;
    } else {
      artist = left;
      title = rest;
      alternate = { artist: rest, title: left };
    }
  } else if (slashed.length > 1) {
    // "곡명 / 아티스트"는 일본 곡에서 흔하다.
    const [left, ...right] = slashed;
    title = left;
    artist = right.join(" / ");
    alternate = { artist: left, title: artist };
  }
  artist = stripAlias(trimSeparators(artist || hint || channel)) || channel;
  title = tidyTitle(title);
  if (alternate) alternate = { artist: stripAlias(trimSeparators(alternate.artist)), title: trimSeparators(alternate.title) };
  if (!alternate?.artist || !alternate.title) alternate = null;
  const primary = { artist, title };
  return { artist, title, cover: false, alternate, search: [primary, ...(alternate ? [alternate] : [])] };
}

// cover: 커버 영상인지, alternate: 순서를 확신할 수 없을 때 반대 순서의 표시 후보,
// search: iTunes로 확인할 후보 (search[i]가 맞으면 i가 0일 때 그대로, 1일 때 alternate로 표시)
function parseYouTubeTitle(rawTitle, rawChannel) {
  const channel = cleanChannel(rawChannel);
  let text = normalize(rawTitle).replace(/\s+/g, " ").trim();
  const original = text;

  // 맨 앞의 【아티스트】 꼬리표는 아티스트 후보로 남긴다.
  let hint = "";
  const leading = /^[\[【]([^\]】]+)[\]】]\s*/.exec(text);
  if (leading && !isTag(leading[1]) && !COVER_BRACKET.test(leading[1])) {
    hint = stripAlias(leading[1].trim());
    text = text.slice(leading[0].length);
  }
  text = text.replace(BRACKETS, (whole, inner) => (isTag(inner) ? "" : whole)).trim();

  const parsed = isCover(text) ? parseCover(text, { hint, channel }) : parseOriginal(text, { hint, channel });
  return { ...parsed, title: parsed.title || original };
}

function cleanYouTubeTitle(rawTitle, rawChannel) {
  const { artist, title } = parseYouTubeTitle(rawTitle, rawChannel);
  return { artist, title };
}

module.exports = { cleanYouTubeTitle, parseYouTubeTitle, cleanChannel };
