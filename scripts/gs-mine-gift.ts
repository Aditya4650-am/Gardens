// Probe the gifting / friends side of a Gardenscapes save:
//   - Features.CardC*.CardsGiftingCore row shapes (PendingSendCards/SentCards/ReceivedCards)
//   - any friends / clan / roster tables or entries
//   - any save-level key resembling card_sends / receiver / gift
// Read-only.

import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable } from "../src/lib/gardenscapes/save-engine.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("../_ref/mined/GameData.db");

function kidsOf(entry: any): any[] {
  const value = Array.isArray(entry) ? entry[1] : entry?.value;
  return Array.isArray(value) ? value : [];
}
function child(entry: any, key: string): any {
  const hit = kidsOf(entry).find((c: any) => c[0] === key);
  return hit ? hit[1] : null;
}
function arrOf(pair: any): any[] | null {
  return Array.isArray(pair) && pair[0] === "a" && Array.isArray(pair[1]) ? pair[1] : null;
}
function fmt(pair: any, depth = 0): string {
  if (!Array.isArray(pair)) return String(pair);
  const [t, v] = pair;
  if (t === "a") return `[${(v as any[]).length}]`;
  if (t === "o") return `{${(v as any[]).length}}`;
  if (typeof v === "string") return JSON.stringify(v.length > 50 ? v.slice(0, 50) + "…" : v);
  return String(v);
}
function dumpRow(row: any, indent: string): void {
  if (row[0] !== "o") {
    console.log(`${indent}[${row[0]}] ${JSON.stringify(row[1])}`);
    return;
  }
  for (const [k, p] of row[1] as any[]) {
    if (p[0] === "a" || p[0] === "o") console.log(`${indent}${k} [${p[0]}] ${fmt(p)}`);
    else console.log(`${indent}${k} [${p[0]}] ${JSON.stringify(p[1])}`);
  }
}

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);

  // --- gifting core ---
  const features: any = findTable(doc, "Features");
  if (features) {
    for (const e of features.entries.filter((x: any) => /^CardC\d+$/.test(x.key))) {
      const gifting = child(e, "CardsGiftingCore");
      if (!gifting) continue;
      console.log(`\n${e.key}.CardsGiftingCore:`);
      for (const [k, p] of kidsOf(gifting)) {
        if (p[0] === "a") {
          const rows = arrOf(p)!;
          console.log(`  ${k} [a] = ${rows.length} rows`);
          for (const r of rows.slice(0, 3)) dumpRow(r, "    ");
        } else {
          console.log(`  ${k} [${p[0]}] = ${JSON.stringify(p[1])}`);
        }
      }
    }
  }

  // --- tables that look like friends / clan / social ---
  console.log(`\ntables: ${doc.tables.map((t: any) => t.name).join(", ")}`);
  for (const t of doc.tables as any[]) {
    if (!/friend|clan|social|gift|player|user/i.test(t.name)) continue;
    console.log(`  ${t.name}: ${t.entries.slice(0, 30).map((e: any) => `${e.key}[${e.type}]`).join(" ")}`);
  }

  // --- any entry key anywhere resembling friends/gift/send ---
  for (const t of doc.tables as any[]) {
    const hits = t.entries.filter((e: any) => /friend|gift|send|receiver|clan/i.test(e.key));
    if (hits.length) {
      console.log(`  ${t.name} keys ~friend/gift/send: ${hits.slice(0, 25).map((e: any) => `${e.key}[${e.type}]`).join(" ")}`);
    }
  }
}
