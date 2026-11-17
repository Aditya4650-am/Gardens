// Which key names mention Frame across the three decodable saves?
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave } from "../src/lib/gardenscapes/save-engine.ts";

const files = [
  "../../_ref/mined/GameData.db",
  "../../gs-local-tool/gs-local-tool/dist/GameData.db",
  "../../gs-local-tool/dist/GameData.db",
  "../../Telegram Desktop/GameData.db",
  "../../gs-local-tool/gs-local-tool/GameData.db",
];

function collect(v: any, out: Set<string>): void {
  if (!Array.isArray(v)) return;
  if (v.length === 2 && typeof v[0] === "string") {
    const second = v[1];
    if (Array.isArray(second) && second.length === 2 && typeof second[0] === "string") {
      // obj child [key, [type, value]]
      out.add(v[0]);
      collect(second[1], out);
      return;
    }
    // arr item [type, value]
    collect(second, out);
    return;
  }
  for (const x of v) collect(x, out);
}

for (const f of files) {
  if (!existsSync(f)) { console.log(`${f}: MISSING`); continue; }
  let buf: Buffer;
  try { buf = readFileSync(f); } catch { console.log(`${f}: unreadable`); continue; }
  let doc: any;
  try {
    doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  } catch (e) { console.log(`${f}: decode failed ${e}`); continue; }
  const keys = new Set<string>();
  for (const t of doc.tables) {
    keys.add(t.name);
    for (const e of t.entries) {
      keys.add(`${t.name}.${e.key}`);
      collect(e.value, keys);
    }
  }
  const frame = [...keys].filter((k) => /frame/i.test(k));
  console.log(`\n${f} — ${keys.size} keys, ${frame.length} frame-ish:`);
  for (const k of frame.slice(0, 40)) console.log(`  ${k}`);
}
