// Look for friend-list storage + gifting paths in Gardenscapes saves.
import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave } from "../src/lib/gardenscapes/save-engine.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("../_ref/mined/GameData.db");

const RE = /friend|UserProfile|neighbor|social/i;

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);
  let hits = 0;
  for (const t of doc.tables as any[]) {
    for (const e of t.entries) {
      if (RE.test(e.key)) {
        const fmt =
          e.type === "o" ? `{${(e.value as any[]).length}}` :
          e.type === "a" ? `[${(e.value as any[]).length}]` :
          JSON.stringify(e.value).slice(0, 100);
        console.log(`  ${t.name}.${e.key} [${e.type}] ${fmt}`);
        hits++;
      }
      if (e.type === "o" && Array.isArray(e.value)) {
        for (const [k, p] of e.value as any[]) {
          if (RE.test(k)) {
            const f = p[0] === "a" ? `[${p[1].length}]` : p[0] === "o" ? `{${p[1].length}}` : JSON.stringify(p[1]).slice(0, 80);
            console.log(`  ${t.name}.${e.key}.${k} [${p[0]}] ${f}`);
            hits++;
          }
        }
      }
    }
  }
  console.log(`  hits=${hits}`);
}
