// Full JSON dump of the gifting/trade/requester objects on every CardC* and
// SeasonalCardsCollection feature, plus any entry name containing chest/tokens.
// Read-only.

import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable } from "../src/lib/gardenscapes/save-engine.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("../_ref/live/GameData.db");

function kidsOf(entry: any): any[] {
  const value = Array.isArray(entry) ? entry[1] : entry?.value;
  return Array.isArray(value) ? value : [];
}
function child(entry: any, key: string): any {
  const hit = kidsOf(entry).find((c: any) => c[0] === key);
  return hit ? hit[1] : null;
}
function show(pair: any, depth = 0): string {
  if (!Array.isArray(pair)) return String(pair);
  const [t, v] = pair;
  if (t === "o" && Array.isArray(v)) {
    return "{ " + v.map((c: any) => `${c[0]}: ${show(c[1], depth + 1)}`).join(", ") + " }";
  }
  if (t === "a" && Array.isArray(v)) {
    return `[${v.length} rows` + (v.length && depth < 3 ? ": " + v.slice(0, 3).map((r: any) => show(r, depth + 1)).join(" | ") : "") + `]`;
  }
  return `${JSON.stringify(v)}`;
}

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);
  const t: any = findTable(doc, "Features");
  if (!t) continue;
  for (const e of t.entries.filter((x: any) => /^(CardC\d+|SeasonalCardsCollection)$/.test(x.key))) {
    console.log(`  -- ${e.key} --`);
    for (const name of ["CardsGiftingCore", "CardsTradeCore", "CardsRequester", "CardsCollectionTrade", "CardsCollectionMainComponents", "AnomalyCounter"]) {
      const c = child(e, name);
      if (c) console.log(`     ${name}: ${show(c)}`);
    }
  }
  // anything chest / token / star shaped anywhere
  for (const tb of doc.tables as any[]) {
    for (const en of tb.entries as any[]) {
      if (/chest|tokens|cardstar/i.test(en.key)) console.log(`  KEY ${tb.name}::${en.key} = ${show([en.type, en.value])}`.slice(0, 220));
      if (en.type === "o") {
        for (const [k, v] of kidsOf(en)) {
          if (/chest|cardstar|tokens/i.test(k)) console.log(`  FLAT ${tb.name}.${en.key}.${k} = ${show(v)}`.slice(0, 220));
        }
      }
    }
  }
}
