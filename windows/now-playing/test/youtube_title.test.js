"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanYouTubeTitle, parseYouTubeTitle, cleanChannel } = require("../youtube_title");

// 실제 YouTube 제목과 채널명 (이 PC의 SMTC 실측 포함)
const cases = [
  ["NewJeans (뉴진스) 'Ditto' Official MV", "HYBE LABELS", "NewJeans", "Ditto"],
  ["BLACKPINK - 'Shut Down' M/V", "BLACKPINK", "BLACKPINK", "Shut Down"],
  ["[MV] IU(아이유) _ Love wins all", "1theK (원더케이)", "IU", "Love wins all"],
  ["아이유 - 밤편지 (Lyrics)", "가사 채널", "아이유", "밤편지"],
  ["W/X/Y - Tani Yuuki (Official Lyric Video)", "Tani Yuuki", "Tani Yuuki", "W/X/Y"],
  ["怪獣の花唄 / Vaundy ： MUSIC VIDEO", "Vaundy", "Vaundy", "怪獣の花唄"],
  ["青のすみか / キタニタツヤ - Where Our Blue Is / Tatsuya Kitani", "キタニタツヤ / Tatsuya Kitani", "キタニタツヤ", "青のすみか"],
  ["【아야츠노 유니 X 아이리 칸나】 점묘의 노래 (点描の唄) | Cover", "아야츠노 유니 AYATSUNO YUNI",
    "아야츠노 유니 X 아이리 칸나", "점묘의 노래 (点描の唄)"],
  ["불가행력 [不可幸力 / Vaundy ] / 아오쿠모 린 (Aokumo Rin) Cover", "아오쿠모 린 AOKUMO RIN",
    "아오쿠모 린", "불가행력 [不可幸力 / Vaundy]"],
  ["나라는 것 (Mrs. GREEN APPLE) / 아카네 리제 Cover", "아카네 리제 AKANE LIZE", "아카네 리제", "나라는 것 (Mrs. GREEN APPLE)"],
  ["Brand New - Mrs. GREEN APPLE ✧ Cover 이샤 ISHA", "이샤", "이샤", "Brand New"],
  ["바다의 유령 (海の幽霊) - Kenshi Yonezu | 시라유키 히나 Cover", "시라유키 히나 SHIRAYUKI HINA", "시라유키 히나", "바다의 유령 (海の幽霊)"],
  ["𝐫𝐚𝐲 (超かぐや姫！ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧) ✧ 𝐂𝐨𝐯𝐞𝐫 𝐛𝐲 이샤 𝐈𝐒𝐇𝐀", "이샤", "이샤", "ray (超かぐや姫! Version)"],
  ["밤새도록 널 생각해[夜もすがら君想ふ] - TOKOTOKOㅣ아라하시 타비 Cover", "아라하시 타비 ARAHASHI TABI",
    "아라하시 타비", "밤새도록 널 생각해[夜もすがら君想ふ]"],
  ["아이유 - 밤편지 (cover)", "어떤 커버 채널", "아이유", "밤편지 (cover)"],
  ["Shape of You (Official Music Video)", "Ed Sheeran", "Ed Sheeran", "Shape of You"],
  ["Don't Stop Me Now (Official Video)", "Queen Official", "Queen", "Don't Stop Me Now"],
  ["Blinding Lights", "The Weeknd - Topic", "The Weeknd", "Blinding Lights"],
  ["Anti-Hero", "TaylorSwiftVEVO", "TaylorSwift", "Anti-Hero"],
  ["Hype Boy [4K]", "NewJeans", "NewJeans", "Hype Boy"]
];

for (const [title, channel, artist, song] of cases) {
  test(`cleans "${title}"`, () => {
    assert.deepEqual(cleanYouTubeTitle(title, channel), { artist, title: song });
  });
}

test("keeps the raw title when nothing is left after cleaning", () => {
  assert.deepEqual(cleanYouTubeTitle("Official MV", "Someone"), { artist: "Someone", title: "Official MV" });
});

test("marks covers and offers the reversed order when the dash order is a guess", () => {
  const cover = parseYouTubeTitle("바다의 유령 (海の幽霊) - Kenshi Yonezu | 시라유키 히나 Cover", "시라유키 히나 SHIRAYUKI HINA");
  assert.equal(cover.cover, true);
  assert.equal(cover.alternate, null);
  const plain = parseYouTubeTitle("Lemon - Kenshi Yonezu", "음악 모음");
  assert.deepEqual([plain.cover, plain.alternate], [false, { artist: "Kenshi Yonezu", title: "Lemon" }]);
  assert.equal(parseYouTubeTitle("BLACKPINK - 'Shut Down' M/V", "BLACKPINK").alternate, null);
});

test("cleans channel suffixes", () => {
  assert.equal(cleanChannel("시라유키 히나 SHIRAYUKI HINA"), "시라유키 히나");
  assert.equal(cleanChannel("Tani Yuuki"), "Tani Yuuki");
  assert.equal(cleanChannel("아이유 - Topic"), "아이유");
  assert.equal(cleanChannel("JYP Official YouTube Channel"), "JYP");
  assert.equal(cleanChannel(undefined), "");
});
