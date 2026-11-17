// Card invariant probe: for every CardC* feature with an OwnedCards array,
// print each row plus the sum(generatedCount) vs TotalObtainedCardsCount,
// the OwnedSets rows, GivenPackInfos rows and FourthPack_CurrentStreak.
// Read-only; answers whether the total-count invariant held BEFORE any edit.

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

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);
  const t: any = findTable(doc, "Features");
  if (!t) continue;

  for (const e of t.entries.filter((x: any) => /^CardC\d+$/.test(x.key))) {
    const core = child(e, "Core");
    const cards = arrOf(core ? child(core, "OwnedCards") : null);
    if (!cards || cards.length === 0) continue;
    console.log(`\n--- ${e.key} (OwnedCards=${cards.length}) ---`);

    let sumGen = 0;
    let sumStock = 0;
    let newCount = 0;
    const ids: string[] = [];
    for (const row of cards) {
      const k = row[1] as any[];
      const id = val(k.find((c: any) => c[0] === "cardId")?.[1]);
      const gen = val(k.find((c: any) => c[0] === "generatedCount")?.[1]);
      const stock = val(k.find((c: any) => c[0] === "inStockCount")?.[1]);
      const isNew = val(k.find((c: any) => c[0] === "isNew")?.[1]);
      const fields = k.map((c: any) => `${c[0]}=${c[1][0]}`).join(",");
      sumGen += Number(gen) || 0;
      sumStock += Number(stock) || 0;
      if (isNew === true) newCount++;
      ids.push(String(id));
      console.log(`  ${id} gen=${gen} stock=${stock} isNew=${isNew} [${fields}]`);
    }
    const total = val(child(core!, "TotalObtainedCardsCount"));
    const streak = val(child(core!, "FourthPack_CurrentStreak"));
    console.log(`  sum(gen)=${sumGen} sum(stock)=${sumStock} isNew=true:${newCount} TotalObtained=${total} streak=${streak}`);
    console.log(`  INVARIANT sum(gen)==TotalObtained: ${sumGen === total ? "HOLDS" : `BREAKS (${sumGen} vs ${total})`}`);
    console.log(`  dup ids: ${ids.length !== new Set(ids).size ? "YES" : "no"}`);

    const sets = arrOf(child(core!, "OwnedSets"));
    if (sets) {
      const reward = sets.filter((r) => val((r[1] as any[]).find((c: any) => c[0] === "isRewardGiven")?.[1]) === true);
      console.log(`  OwnedSets=${sets.length} isRewardGiven=true:${reward.length}`);
      console.log(`    ${sets.slice(0, 15).map((r) => {
        const k = r[1] as any[];
        return `${val(k.find((c: any) => c[0] === "setId")?.[1])}:${val(k.find((c: any) => c[0] === "lastSeenProgress")?.[1])}${val(k.find((c: any) => c[0] === "isRewardGiven")?.[1]) ? "*" : ""}`;
      }).join(" ")}`);
    }
    const packs = arrOf(child(core!, "GivenPackInfos"));
    if (packs) {
      console.log(`  GivenPackInfos: ${packs.map((r) => {
        const k = r[1] as any[];
        return `${val(k.find((c: any) => c[0] === "id")?.[1])}=${val(k.find((c: any) => c[0] === "count")?.[1])}[${k.map((c: any) => c[1][0]).join("")}]`;
      }).join(" ")}`);
    }
    const pend = arrOf(child(core!, "PendingPacks"));
    if (pend) console.log(`  PendingPacks: ${pend.length} rows`);
    const blockers = arrOf(child(core!, "Blockers"));
    if (blockers) console.log(`  Blockers: ${blockers.length} rows`);
  }
}
