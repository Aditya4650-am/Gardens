// List every Features.CardC* entry with its Core child keys and array lengths,
// so the cards module can pick the ACTIVE feature the same way the game does.
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
function arrLen(pair: any): number | null {
  return Array.isArray(pair) && pair[0] === "a" && Array.isArray(pair[1]) ? pair[1].length : null;
}

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);
  const t: any = findTable(doc, "Features");
  if (!t) continue;
  for (const e of t.entries.filter((x: any) => /^CardC\d+$/.test(x.key))) {
    const core = child(e, "Core");
    const keys = kidsOf(e).map((c: any) => c[0]).join(",");
    const coreKeys = core ? kidsOf(core).map((c: any) => c[0]).join(",") : "(none)";
    console.log(
      `  ${e.key}  entry=[${keys}]  Core=[${coreKeys}]  ` +
        `Owned=${arrLen(core ? child(core, "OwnedCards") : null)} ` +
        `Sets=${arrLen(core ? child(core, "OwnedSets") : null)} ` +
        `Packs=${arrLen(core ? child(core, "GivenPackInfos") : null)} ` +
        `Pending=${arrLen(core ? child(core, "PendingPacks") : null)} ` +
        `Blockers=${arrLen(core ? child(core, "Blockers") : null)}`,
    );
  }
}
