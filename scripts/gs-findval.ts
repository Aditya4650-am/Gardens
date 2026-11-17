// Find every table/entry/key path whose value equals a given number (or matches a string).
// Run: node --experimental-strip-types scripts/gs-findval.ts <needle>
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const path = "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.plain";
const data: Buffer = readFileSync(path);
const doc = parseAUDB(data);

const needle = process.argv[2];
if (!needle) {
  console.error("usage: gs-findval.ts <number|string>");
  process.exit(1);
}
const num = Number(needle);

type Pair = [string, unknown];

function walk(table: string, entryKey: string, prefix: string, type: string, v: unknown): void {
  if ((type === "i" || type === "u" || type === "k" || type === "c" || type === "g" || type === "e" || type === "d")
      && typeof v === "number" && v === num) {
    console.log(`NUM  ${table} :: ${entryKey} :: ${prefix || "(root)"} = ${v} [${type}]`);
    return;
  }
  if (type === "s" && typeof v === "string" && v === needle) {
    console.log(`STR  ${table} :: ${entryKey} :: ${prefix || "(root)"} = ${JSON.stringify(v)}`);
    return;
  }
  if (type === "o") {
    for (const [k, pair] of v as Pair[]) {
      walk(table, entryKey, prefix ? prefix + "." + k : k, String(pair[0]), pair[1]);
    }
  } else if (type === "a") {
    const items = v as Pair[];
    for (let i = 0; i < items.length; i++) {
      walk(table, entryKey, `${prefix}[${i}]`, String(items[i][0]), items[i][1]);
    }
  }
}

for (const t of doc.tables) {
  for (const e of t.entries) walk(t.name, e.key, "", e.type, e.value);
}
