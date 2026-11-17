// Where do profileFrame / isGoldFrame live, and what values do they hold?
import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave } from "../src/lib/gardenscapes/save-engine.ts";

const files = [
  "../../_ref/mined/GameData.db",
  "../../Telegram Desktop/GameData.db",
  "../../gs-local-tool/gs-local-tool/dist/GameData.db",
];

for (const f of files) {
  let buf: Buffer;
  try { buf = readFileSync(f); } catch { console.log(`${f}: MISSING`); continue; }
  let doc: any;
  try {
    doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  } catch (e) { console.log(`${f}: decode failed`); continue; }
  console.log(`\n== ${f}`);
  for (const t of doc.tables) {
    for (const e of t.entries) {
      if (/^(profileFrame|isGoldFrame)$/.test(e.key)) {
        console.log(`  ${t.name}.${e.key} [${e.type}] = ${JSON.stringify(e.value).slice(0, 200)}`);
      }
      if (e.type === "o") {
        for (const [k, p] of e.value as any[]) {
          if (/^(profileFrame|isGoldFrame)$/.test(k)) {
            console.log(`  ${t.name}.${e.key}.${k} [${p[0]}] = ${JSON.stringify(p[1]).slice(0, 200)}`);
          }
          // one level deeper
          if (p[0] === "o") {
            for (const [k2, p2] of p[1] as any[]) {
              if (/^(profileFrame|isGoldFrame)$/.test(k2)) {
                console.log(`  ${t.name}.${e.key}.${k}.${k2} [${p2[0]}] = ${JSON.stringify(p2[1]).slice(0, 200)}`);
              }
            }
          }
        }
      }
    }
  }
  // Also: every key equal to a frame id from the catalogs (Frame_Birdhouse etc.)
  const wanted = new Set(["Frame_Birdhouse", "Frame_Cinema", "Frame_Cosmos", "TS_Ice", "TS_Violet", "Frame_Gold", "Frame_Default"]);
  const hits: string[] = [];
  function walk(v: any, path: string): void {
    if (!Array.isArray(v)) return;
    if (v.length === 2 && typeof v[0] === "string") {
      const second = v[1];
      if (Array.isArray(second) && second.length === 2 && typeof second[0] === "string") {
        if (wanted.has(v[0]) || /BoughtFrame|FramesShownIds|ShownIds/.test(v[0])) {
          hits.push(`${path}.${v[0]} = ${JSON.stringify(second[1]).slice(0, 120)}`);
        }
        walk(second[1], `${path}.${v[0]}`);
        return;
      }
      walk(second, path);
      return;
    }
    for (const x of v) walk(x, path);
  }
  for (const t of doc.tables) for (const e of t.entries) walk(e.value, `${t.name}.${e.key}`);
  console.log(`  frame-id key hits: ${hits.length ? hits.slice(0, 20).join(" | ") : "<none>"}`);
}
