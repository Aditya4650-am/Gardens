// Mine the full card vocabulary across every save given on argv:
//   - which CardC* entries exist and which loader says IsEventActive
//   - Core keys + types per feature
//   - every distinct cardId / setId / pack id seen anywhere
//   - Blockers pairs (blockerCardId, trashCardId)
//   - row field shapes for OwnedCards / OwnedSets / GivenPackInfos
// Read-only.

import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable, findEntry } from "../src/lib/gardenscapes/save-engine.ts";

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
/** Array items from a `[type, value]` pair (`type === "a"`), else null. */
function arrOf(pair: any): any[] | null {
  if (Array.isArray(pair) && pair[0] === "a" && Array.isArray(pair[1])) return pair[1];
  if (Array.isArray(pair) && pair[0] !== "a") return null;
  return null;
}

const allCardIds = new Set<string>();
const allSetIds = new Set<string>();
const allPackIds = new Set<string>();
const allBlockers = new Set<string>();

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} (${buf.length} B) =====`);

  const t: any = findTable(doc, "Features");
  if (!t) {
    console.log("no Features table");
    continue;
  }
  const cardEntries = t.entries.filter((e: any) => /^CardC\d+$/.test(e.key));
  console.log(`card entries: ${cardEntries.map((e: any) => e.key).join(", ")}`);

  for (const e of cardEntries) {
    const loaderName = `${e.key}Loader`;
    const loader = child(e, loaderName);
    const active = loader ? child(loader, "IsEventActive") : null;
    const activeStr = active ? `${active[0]}=${active[1]}` : "<no loader>";

    const core = child(e, "Core");
    const coreKeys = core ? kidsOf(core).map((c: any) => `${c[0]}[${c[1][0]}]`) : [];
    const ownedCards = arrOf(core ? child(core, "OwnedCards") : null);
    const ownedSets = arrOf(core ? child(core, "OwnedSets") : null);
    const packs = arrOf(core ? child(core, "GivenPackInfos") : null);
    const pending = arrOf(core ? child(core, "PendingPacks") : null);

    // Harvest ids.
    if (ownedCards) {
      for (const row of ownedCards) {
        const id = row[0] === "o" ? child(row, "cardId") : null;
        if (id && typeof id[1] === "string") allCardIds.add(id[1]);
      }
    }
    if (ownedSets) {
      for (const row of ownedSets) {
        const id = row[0] === "o" ? child(row, "setId") : null;
        if (id && typeof id[1] === "string") allSetIds.add(id[1]);
      }
    }
    if (packs) {
      for (const row of packs) {
        const id = row[0] === "o" ? child(row, "id") : null;
        if (id && typeof id[1] === "string") allPackIds.add(id[1]);
      }
    }
    // Blockers: [{BlockersPairs: [{blockerCardId, trashCardId}]}]
    const blockers = arrOf(core ? child(core, "Blockers") : null);
    if (blockers) {
      for (const row of blockers) {
        const pairs = row[0] === "o" ? arrOf(child(row, "BlockersPairs")) : null;
        if (!pairs) continue;
        for (const p of pairs) {
          for (const key of ["blockerCardId", "trashCardId"]) {
            const v = p[0] === "o" ? child(p, key) : null;
            if (v && typeof v[1] === "string") allBlockers.add(v[1]);
          }
        }
      }
    }

    const cnt = (a: any) => (Array.isArray(a) ? a.length : "<none>");
    console.log(
      `  ${e.key}: active ${activeStr} | OwnedCards=${cnt(ownedCards)} OwnedSets=${cnt(ownedSets)}` +
        ` GivenPackInfos=${cnt(packs)} PendingPacks=${cnt(pending)}`,
    );
    console.log(`    Core: ${coreKeys.join(" ")}`);
  }
}

console.log(`\n===== VOCABULARY =====`);
const sorted = (s: Set<string>) => [...s].sort();
console.log(`cardIds (${allCardIds.size}): ${sorted(allCardIds).join(" ")}`);
console.log(`setIds (${allSetIds.size}): ${sorted(allSetIds).join(" ")}`);
console.log(`packIds (${allPackIds.size}): ${sorted(allPackIds).join(" ")}`);
console.log(`blockerIds (${allBlockers.size}): ${sorted(allBlockers).join(" ")}`);
