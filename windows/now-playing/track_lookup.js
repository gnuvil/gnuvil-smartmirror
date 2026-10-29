"use strict";

// YouTube 제목에서 뽑은 곡명·아티스트 후보를 iTunes 검색 결과와 맞춰 본다.
// 결과의 곡명이 후보와 맞을 때만 표지를 쓰고, 그 후보의 순서(곡명/아티스트)를 확정한다.
// 맞는 결과가 없으면 null을 돌려주고, 표지는 YouTube 썸네일을 쓴다.
// 검색 1위를 그대로 쓰면 곡이 스토어에 없을 때 같은 가수의 다른 곡 표지가 잡히므로 반드시 이름을 맞춰 본다.

const TIMEOUT_MS = 4000;
// 한국 스토어에 없는 곡이 있어 미국 스토어도 보고, 일본 곡은 일본 스토어가 원어 제목(海の幽霊)으로 돌려준다.
const STORES = [{ country: "KR" }, { country: "US" }, { country: "JP", lang: "ja_jp" }];

function key(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// "바다의 유령 (海の幽霊)"은 "바다의 유령", "海の幽霊" 어느 쪽으로도 맞을 수 있다.
function variants(value) {
  const text = String(value || "");
  const inner = [...text.matchAll(/[(\[【（]([^)\]】）]+)[)\]】）]/g)].map((match) => match[1]);
  const outer = text.replace(/\s*[(\[【（][^)\]】）]*[)\]】）]/g, "");
  return [text, outer, ...inner].map(key).filter((part) => part.length >= 2);
}

function same(a, b) {
  const left = variants(a);
  const right = variants(b);
  return left.some((x) => right.some((y) => x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)))));
}

function scripts(value) {
  const text = String(value || "").normalize("NFKC");
  return ["Latin", "Hangul", "Han", "Hiragana", "Katakana"].filter((name) => new RegExp(`\\p{Script=${name}}`, "u").test(text));
}

// 곡명만 맞는 결과는 다른 사람의 커버·연주곡일 수 있다. 제목이 덧붙인 말 없이 똑같고,
// 아티스트가 서로 다른 문자로 적혀 비교할 수 없을 때(Kenshi Yonezu와 米津玄師)만 같은 곡으로 본다.
function sameTitleOnly(result, candidate) {
  const title = key(result.title);
  if (!variants(candidate.title).includes(title)) return false;
  const ours = scripts(candidate.artist);
  return !scripts(result.artist).some((name) => ours.includes(name));
}

async function searchTracks(term, { country, lang }, { fetchImpl = fetch } = {}) {
  const url = new URL("https://itunes.apple.com/search");
  url.search = new URLSearchParams({ term, media: "music", entity: "song", limit: "10", country, ...(lang ? { lang } : {}) }).toString();
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const results = [];
  for (const item of (await response.json())?.results || []) {
    if (typeof item?.artworkUrl100 !== "string") continue;
    const art = new URL(item.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x600bb."));
    if (art.protocol === "https:") results.push({ title: item.trackName, artist: item.artistName, artUrl: art.href });
  }
  return results;
}

// candidates: [{ artist, title }, ...] 앞쪽이 더 그럴듯한 후보다.
async function lookupTrack(candidates, { search = searchTracks } = {}) {
  const first = candidates[0];
  if (!first?.title) return null;
  const term = `${first.artist} ${first.title}`.trim();
  const searched = [];
  const match = (results, needArtist) => {
    for (const result of results) {
      const index = candidates.findIndex((candidate) => (needArtist
        ? same(result.title, candidate.title) && same(result.artist, candidate.artist)
        : sameTitleOnly(result, candidate)));
      if (index >= 0) return { index, artUrl: result.artUrl };
    }
    return null;
  };
  // 모든 스토어에서 곡명과 아티스트가 다 맞는 결과를 먼저 찾고, 없으면 곡명만 맞는 결과를 쓴다.
  // 일본 스토어는 아티스트를 米津玄師처럼 원어로 돌려줘 영문 표기와 맞지 않는다.
  for (const store of STORES) {
    const results = await search(term, store);
    searched.push(results);
    const found = match(results, true);
    if (found) return found;
  }
  for (const results of searched) {
    const found = match(results, false);
    if (found) return found;
  }
  return null;
}

module.exports = { lookupTrack, searchTracks, same };
