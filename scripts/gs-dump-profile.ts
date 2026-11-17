// Dump OwnProfile.ProfileValues.Main + any avatar/frame wear candidates.
import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable, findEntry } from "../src/lib/gardenscapes/save-engine.ts";

const buf = readFileSync(process.argv[2] ?? "../../_ref/mined/GameData.db");
const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;

function dump(label: string, pair: any, depth = 0): void {
  const [type, value] = pair;
  const pad = "  ".repeat(depth);
  if (type !== "o" && type !== "a") {
    console.log(`${pad}${label} [${type}] = ${JSON.stringify(value)}`);
    return;
  }
  if (type === "o") {
    console.log(`${pad}${label} [o] = ${value.length}`);
    for (const [k, p] of value as any[]) dump(k, p, depth + 1);
  } else {
    console.log(`${pad}${label} [a] = ${value.length}`);
    (value as any[]).forEach((r, i) => dump(`#${i}`, r, depth + 1));
  }
}

{
  const t: any = findTable(doc, "SpecialEvents");
  const e = findEntry(t, "PlayerProfileOwn");
  const own = (e.value as any[]).find((c: any) => c[0] === "OwnProfile")![1];
  dump("OwnProfile", own);
}

// search every table for keys mentioning avatar/frame wear
{
  const hits: string[] = [];
  for (const t of doc.tables) {
    for (const e of t.entries) {
      if (/avatar|frame/i.test(e.key) && e.type === "o") {
        for (const [k] of e.value as any[]) {
          if (/worn|current|selected|active|equipped|avatar|frame/i.test(k)) hits.push(`${t.name}.${e.key}.${k}`);
        }
      }
    }
  }
  console.log("\nwear candidates:", hits.slice(0, 60).join(" | ") || "<none>");
}
