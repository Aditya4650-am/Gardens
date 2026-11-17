// Scan every table/entry/flat key for card-, star-, attempt-, gift- and
// send-shaped names across the given saves. Read-only: answers "what does a
// real Gardenscapes save actually hold for the cards + send-cards features".

import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable } from "../src/lib/gardenscapes/save-engine.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("../_ref/mined/GameData.db");

const WANT = /card|star|attempt|gift|send|roster|friend/i;

function kidsOf(entry: any): any[] {
  const value = Array.isArray(entry) ? entry[1] : entry?.value;
  return Array.isArray(value) ? value : [];
}

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);
  for (const t of doc.tables as any[]) {
    for (const e of t.entries as any[]) {
      if (WANT.test(e.key)) {
        const kids = kidsOf(e).map((c: any) => c[0]);
        console.log(`  TABLE ${t.name} :: ${e.key} [${e.type}] ${kids.length ? `kids=${kids.slice(0, 14).join(",")}${kids.length > 14 ? ",…" : ""}` : `val=${JSON.stringify(e.value)?.slice(0, 80)}`}`);
      }
      if (e.type === "o") {
        for (const [k, v] of kidsOf(e)) {
          if (WANT.test(k)) {
            console.log(`  FLAT  ${t.name}.${e.key}.${k} [${v[0]}] ${JSON.stringify(v[1])?.slice(0, 90)}`);
          }
        }
      }
    }
  }
}
