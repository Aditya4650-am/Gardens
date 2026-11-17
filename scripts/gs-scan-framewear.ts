// Full-path walk for profileFrame / isGoldFrame / *Frame* keys under own-profile-ish
// parents, plus every Properties key matching /frame|gold/i in each save.
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
  try { buf = readFileSync(f); } catch { console.log(`\n== ${f}: MISSING`); continue; }
  let doc: any;
  try {
    doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  } catch { console.log(`\n== ${f}: decode failed`); continue; }
  console.log(`\n== ${f}`);
  const found: string[] = [];
  const props: string[] = [];
  function walk(v: any, path: string): void {
    if (!Array.isArray(v)) return;
    if (v.length === 2 && typeof v[0] === "string") {
      const second = v[1];
      if (Array.isArray(second) && second.length === 2 && typeof second[0] === "string") {
        const k = v[0];
        if (/profileFrame|isGoldFrame|WornFrame|ActiveFrame|CurrentFrame|FrameStyle|GoldFrame/i.test(k)) {
          found.push(`${path}.${k} [${second[0]}] = ${JSON.stringify(second[1]).slice(0, 100)}`);
        }
        if (path === "TableName.Properties" && /frame|gold/i.test(k)) {
          props.push(`${k} [${second[0]}] = ${JSON.stringify(second[1]).slice(0, 100)}`);
        }
        walk(second[1], `${path}.${k}`);
        return;
      }
      walk(second, path);
      return;
    }
    for (const x of v) walk(x, path);
  }
  for (const t of doc.tables) for (const e of t.entries) walk(e.value, `${t.name}.${e.key}`);
  console.log(`  profileFrame-ish: ${found.length}`);
  for (const x of found.slice(0, 25)) console.log(`    ${x}`);
  console.log(`  Properties frame/gold keys: ${props.length}`);
  for (const x of props.slice(0, 30)) console.log(`    ${x}`);
}
