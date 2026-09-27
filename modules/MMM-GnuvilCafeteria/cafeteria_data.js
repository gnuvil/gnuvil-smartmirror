"use strict";

const CAFETERIAS = [
  { id: "h203", name: "한그릇 식당" },
  { id: "h202", name: "외대한상 식당" },
  { id: "h205", name: "HufsDorm 식당" }
];

function textOf(html) {
  return html.replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (entity[0] !== "#") return named[entity.toLowerCase()] || " ";
      const number = entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isInteger(number) && number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number) : " ";
    })
    .replace(/\s+/g, " ").trim();
}

function parseMenu(html, cafeteria, date) {
  if (typeof html !== "string" || html.length > 512_000) throw new Error("HUFS menu response is invalid");
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if (!table || !/메뉴 상세/.test(table)) throw new Error("HUFS menu table is missing");
  const head = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1];
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!head || !body) throw new Error("HUFS menu table is incomplete");
  const dates = [...head.matchAll(/id=["']date_(\d{4}-\d{2}-\d{2})["']/gi)].map((match) => match[1]);
  const column = dates.indexOf(date);
  if (column < 0 || dates.length > 7) throw new Error("HUFS menu date is missing");

  const meals = [];
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const header = row[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)?.[1];
    if (!header) continue;
    const cells = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (cells.length !== dates.length) throw new Error("HUFS menu columns have changed");
    const [attributes, cell] = [cells[column][1], cells[column][2]];
    if (!/\bclass=["'][^"']*\bmenu\b/i.test(attributes)
      || /\bclass=["'][^"']*\bno-menu\b/i.test(attributes)) continue;
    const menu = [...cell.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => textOf(match[1])).filter(Boolean);
    if (!menu.length || (menu.length === 1 && /^(운영\s*없음|이전\s*운영|추\s*석|연\s*휴|휴\s*무)$/.test(menu[0]))) continue;
    const label = textOf(header);
    const hours = label.match(/(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})/);
    meals.push({
      mealType: label.replace(/\(\d{2}:\d{2}\s*~\s*\d{2}:\d{2}\)/, "").trim(),
      start: hours?.[1] || null,
      end: hours?.[2] || null,
      menu,
      price: textOf(cell.match(/<p\b[^>]*class=["'][^"']*\bpay\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "") || null
    });
  }
  return { id: cafeteria.id, name: cafeteria.name, meals };
}

function koreanDay(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const utc = Date.UTC(year, month - 1, day);
  const weekday = new Date(utc).getUTCDay();
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year: String(year),
    month: String(month).padStart(2, "0"),
    firstDay: String(Math.max(1, day - weekday)),
    lastDay: String(Math.min(new Date(Date.UTC(year, month, 0)).getUTCDate(), day + 6 - weekday))
  };
}

module.exports = { CAFETERIAS, koreanDay, parseMenu };
