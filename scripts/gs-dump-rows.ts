// Dump exact child shapes of the array rows profile/cards modules mutate.
// Read-only; prints field names + types of row #0..#2 for:
//   Features.ProfileBadgesGFF.Core.OwnedBadges
//   Features.CardC8.Core.{OwnedCards, OwnedSets, GivenPackInfos, PendingPacks}
// plus Properties BoughtAvatar_* key samples and ShownIds/Title keys.

import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable, findEntry } from "../src/lib/gardenscapes/save-engine.ts";

const path = process.argv[2] ?? "../../_ref/mined/GameData.db";
const buf = readFileSync(path);
const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;

function kidsOf(entry: any): any[] {
  // Accept either an entry `{type, value}` or a raw `[type, value]` pair.
  const value = Array.isArray(entry) ? entry[1] : entry?.value;
  return Array.isArray(value) ? value : [];
}
function child(entry: any, key: string): any {
  const hit = kidsOf(entry).find((c: any) => c[0] === key);
  return hit ? hit[1] : null;
}
function dumpRow(label: string, row: any): void {
  const type = row[0];
  const value = row[1];
  if (type !== "o") {
    console.log(`${label} [${type}] = ${JSON.stringify(value)}`);
    return;
  }
  console.log(`${label} [o] = ${value.length} children:`);
  for (const [k, kt, kv] of value.map((c: any) => [c[0], c[1][0], c[1][1]])) {
    let s: string;
    if (typeof kv === "string") s = JSON.stringify(kv.length > 60 ? kv.slice(0, 60) + "\u2026" : kv);
    else s = String(kv);
    console.log(`    ${k} [${kt}] = ${s}`);
  }
}
function dumpArray(label: string, pair: any): void {
  // `pair` is `[type, items]` when it came from `child()`.
  const arr = Array.isArray(pair) && pair[0] === "a" ? pair[1] : pair;
  console.log(`${label}: ${arr.length} rows`);
  arr.slice(0, Math.min(3, arr.length)).forEach((r: any, i: number) => dumpRow(`  #${i}`, r));
}

// --- badges ---
{
  const t: any = findTable(doc, "Features");
  const e = findEntry(t, "ProfileBadgesGFF");
  const core = child(e, "Core");
  dumpArray("OwnedBadges", child(core, "OwnedBadges"));
}

// --- cards ---
{
  const t: any = findTable(doc, "Features");
  const e = findEntry(t, "CardC8");
  const core = child(e, "Core");
  for (const field of ["OwnedCards", "OwnedSets", "GivenPackInfos", "PendingPacks"]) {
    const hit = child(core, field);
    if (!hit) {
      console.log(`CardC8.Core.${field}: <absent>`);
      continue;
    }
    dumpArray(`CardC8.Core.${field}`, hit);
  }
}

// --- Properties: BoughtAvatar_* samples + ShownIds/Title keys ---
{
  const t: any = findTable(doc, "TableName");
  const e = t ? findEntry(t, "Properties") : undefined;
  if (!e || e.type !== "o") {
    console.log("\nTableName.Properties: <absent>");
  } else {
    const kids: any[] = e.value;
    const keys: string[] = kids.map((c) => c[0]);
    const bought = keys.filter((k) => k.startsWith("BoughtAvatar_"));
    console.log(`\nBoughtAvatar_*: ${bought.length} — samples:`);
    for (const k of bought.slice(0, 5)) {
      const pair = kids.find((c) => c[0] === k)![1];
      console.log(`  ${k} [${pair[0]}] = ${JSON.stringify(pair[1])}`);
    }
    const other = keys.filter((k) => /Bought(Style|Title|Frame|Badge|NameStyle)|ShownIds|PlayerTitle|AvatarShown/i.test(k));
    console.log(`other Bought*/ShownIds/Title keys: ${other.length}`);
    for (const k of other.slice(0, 40)) {
      const pair = kids.find((c) => c[0] === k)![1];
      let v: any = pair[1];
      if (typeof v === "string" && v.length > 90) v = v.slice(0, 90) + "\u2026";
      console.log(`  ${k} [${pair[0]}] = ${JSON.stringify(v)}`);
    }
  }
}
