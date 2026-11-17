// Distinct card ids across every CardC* feature (OwnedCards + Blockers) on the
// given saves, plus the Blockers row shape. Read-only; answers "what is the
// card id universe a real save names".

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
function val(pair: any): any {
  return Array.isArray(pair) ? pair[1] : pair;
}

const all = new Set<string>();
const blockers = new Set<string>();

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);
  const t: any = findTable(doc, "Features");
  if (!t) continue;
  for (const e of t.entries.filter((x: any) => /^CardC\d+$/.test(x.key))) {
    const core = child(e, "Core");
    if (!core) continue;
    const owned = arrOf(child(core, "OwnedCards")) ?? [];
    for (const row of owned) {
      const k = row[1] as any[];
      const id = val(k.find((c: any) => c[0] === "cardId")?.[1]);
      if (typeof id === "string") all.add(id);
    }
    const bl = arrOf(child(core, "Blockers"));
    if (bl && bl.length) {
      console.log(`  ${e.key} Blockers row shape: ${bl.slice(0, 3).map((r: any) => (r[1] as any[]).map((c: any) => `${c[0]}:${c[1][0]}`).join(",")).join(" | ")}`);
      for (const row of bl) {
        const k = row[1] as any[];
        const id = val(k.find((c: any) => c[0] === "cardId")?.[1]) ?? val(k.find((c: any) => c[0] === "id")?.[1]);
        if (typeof id === "string") blockers.add(id);
      }
    }
  }
  const nums = [...all].map((x) => Number(/(\d+)/.exec(x)?.[1] ?? -1)).filter((n) => n >= 0);
  console.log(`  owned ids: ${all.size}, range ${Math.min(...nums)}..${Math.max(...nums)}`);
  const bnums = [...blockers].map((x) => Number(/(\d+)/.exec(x)?.[1] ?? -1)).filter((n) => n >= 0);
  console.log(`  blocker ids: ${blockers.size}, range ${bnums.length ? `${Math.min(...bnums)}..${Math.max(...bnums)}` : "-"}`);
}

console.log("\nALL owned ids:", [...all].sort().join(" "));
console.log("ALL blocker ids:", [...blockers].sort().join(" "));
