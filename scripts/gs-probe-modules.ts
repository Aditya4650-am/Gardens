// Deep structure probe for the five edit modules: season, decor, profile,
// items, cards. Prints exact child paths + types, 3 levels deep.
import { readFileSync } from "node:fs";
import { findTable, findEntry, objEntries, arrItems, toInt } from "@/lib/gardenscapes/save-engine";
import { parseAUDB } from "@/lib/gardenscapes/codec";
import { decodeSave } from "@/lib/gardenscapes/save-engine";

const f = "C:/Users/User/Downloads/gardenscapes/_ref/mined/GameData.db";
const buf = readFileSync(f);
const doc = buf.toString("ascii", 0, 4) === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;

function val(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v.length > 60 ? v.slice(0, 60) + "…" : v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "bigint") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).length}}`;
  return String(v);
}

function dump(e: { key: string; type: string; value: unknown }, depth: number, maxDepth: number, prefix: string) {
  const pad = "  ".repeat(depth);
  console.log(`${pad}${prefix}${e.key} [${e.type}] = ${val(e.value)}`);
  if (depth >= maxDepth) return;
  if (e.type === "o") {
    const ent = { key: e.key, type: e.type, value: e.value } as never;
    for (const [k, [t, v]] of objEntries(ent)) {
      dump({ key: k, type: t, value: v }, depth + 1, maxDepth, "");
    }
  } else if (e.type === "a") {
    const ent = { key: e.key, type: e.type, value: e.value } as never;
    const items = arrItems(ent);
    for (let i = 0; i < Math.min(items.length, 3); i++) {
      const [t, v] = items[i];
      dump({ key: `#${i}`, type: t, value: v }, depth + 1, maxDepth, "");
    }
    if (items.length > 3) console.log(`${pad}  … ${items.length - 3} more`);
  }
}

// 1. SEASON — SpecialEvents.Season58 (2 deep is plenty)
console.log("===== SEASON: SpecialEvents.Season58 =====");
{
  const t = findTable(doc, "SpecialEvents");
  const e = t ? findEntry(t, "Season58") : undefined;
  if (e) dump(e, 0, 2, "");
  else console.log("  <absent>");
}
console.log("----- SpecialEvents table entries:");
{
  const t = findTable(doc, "SpecialEvents");
  if (t) console.log("  " + t.entries.map((e) => `${e.key}[${e.type}]`).join(", "));
}

// 1b. Purchases + stages deep
console.log("----- Season58.Purchases:");
{
  const t = findTable(doc, "SpecialEvents");
  const e = t ? findEntry(t, "Season58") : undefined;
  if (e && e.type === "o") {
    const p = objEntries(e).find(([k]) => k === "Purchases");
    if (p) dump({ key: "Purchases", type: p[1][0], value: p[1][1] }, 0, 3, "");
    const fs = objEntries(e).find(([k]) => k === "FreeStage");
    if (fs) dump({ key: "FreeStage", type: fs[1][0], value: fs[1][1] }, 0, 2, "");
    const sc = objEntries(e).find(([k]) => k === "Score");
    if (sc) dump({ key: "Score", type: sc[1][0], value: sc[1][1] }, 0, 1, "");
    const st = objEntries(e).find(([k]) => k === "Stages");
    if (st) dump({ key: "Stages", type: st[1][0], value: st[1][1] }, 0, 1, "");
  }
}
console.log("----- Season58 top-level keys:");
{
  const t = findTable(doc, "SpecialEvents");
  const e = t ? findEntry(t, "Season58") : undefined;
  if (e && e.type === "o") console.log("  " + objEntries(e).map(([k, v]) => `${k}[${v[0]}]`).join(", "));
}

// 2. DECOR — repairs table, first 2 chapters
console.log("\n===== DECOR: repairs table =====");
{
  const t = findTable(doc, "repairs");
  if (!t) console.log("  <absent>");
  else {
    console.log(`  ${t.entries.length} entries: ${t.entries.slice(0, 8).map((e) => e.key).join(", ")} …`);
    const c = t.entries.find((e) => e.key.startsWith("chapter"));
    if (c) dump(c, 0, 3, "");
    const t2 = findTable(doc, "repairs_purchases_info");
    if (t2) {
      console.log(`  repairs_purchases_info: ${t2.entries.length} entries`);
      const p = t2.entries[0];
      if (p) dump(p, 0, 2, "");
    }
  }
}

// 3. PROFILE — PlayerProfileOwn + badges
console.log("\n===== PROFILE: SpecialEvents.PlayerProfileOwn =====");
{
  const t = findTable(doc, "SpecialEvents");
  const e = t ? findEntry(t, "PlayerProfileOwn") : undefined;
  if (e) dump(e, 0, 3, "");
  else console.log("  <absent>");
}
console.log("----- Features.ProfileBadgesGFF:");
{
  const t = findTable(doc, "Features");
  const e = t ? findEntry(t, "ProfileBadgesGFF") : undefined;
  if (e) dump(e, 0, 3, "");
  else console.log("  <absent>");
}
console.log("----- Properties unlock keys (BoughtAvatar count / ShownIds):");
{
  const t = findTable(doc, "TableName");
  const e = t ? findEntry(t, "Properties") : undefined;
  if (e && e.type === "o") {
    const kids = objEntries(e);
    const bought = kids.filter(([k]) => k.startsWith("BoughtAvatar_"));
    const shown = kids.filter(([k]) => k.includes("ShownIds"));
    const frames = kids.filter(([k]) => k.includes("Frame"));
    console.log(`  BoughtAvatar_*: ${bought.length}`);
    console.log(`  ShownIds: ${shown.map(([k, v]) => `${k}=${JSON.stringify(v[1]).slice(0, 80)}`).join(" | ")}`);
    console.log(`  *Frame*: ${frames.map(([k]) => k).join(", ") || "<none>"}`);
    const pend = kids.filter(([k]) => /Pending|Badge|Title/i.test(k));
    console.log(`  Pending/Badge/Title: ${pend.map(([k, v]) => `${k}[${v[0]}]=${JSON.stringify(v[1]).slice(0, 60)}`).join(" | ")}`);
  }
}

// 4. ITEMS — booster table
console.log("\n===== ITEMS: items table =====");
{
  const t = findTable(doc, "items");
  if (!t) console.log("  <absent>");
  else console.log(`  ${t.entries.length} entries: ${t.entries.map((e) => `${e.key}[${e.type}]=${val(e.value)}`).join(", ")}`);
}

// 5. CARDS — Features.CardC3 etc.
console.log("\n===== CARDS: Features.CardC* =====");
{
  const t = findTable(doc, "Features");
  if (!t) console.log("  <absent>");
  else {
    const cards = t.entries.filter((e) => /^CardC\d/.test(e.key));
    console.log(`  card entries: ${cards.map((e) => e.key).join(", ") || "<none>"}`);
    for (const c of cards) dump(c, 0, 3, "");
    const other = t.entries.filter((e) => /Card|Pack|Collection/i.test(e.key) && !/^CardC\d/.test(e.key));
    console.log(`  other card-ish: ${other.map((e) => e.key).join(", ") || "<none>"}`);
  }
}
// quests + InfiniteBoosters + SpecialEvents tables quick view
console.log("\n===== quests / InfiniteBoosters =====");
for (const n of ["quests", "InfiniteBoosters", "Redesign", "EventsSystem"]) {
  const t = findTable(doc, n);
  if (!t) { console.log(`  ${n}: <absent>`); continue; }
  console.log(`  ${n}: ${t.entries.length} entries -> ${t.entries.slice(0, 12).map((e) => `${e.key}[${e.type}]`).join(", ")}${t.entries.length > 12 ? " …" : ""}`);
}
