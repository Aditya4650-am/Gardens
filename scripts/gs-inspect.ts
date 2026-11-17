// Inspect top-level structure of the interesting Gardenscapes tables.
// Run: node --experimental-strip-types scripts/gs-inspect.ts [tableName]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const path = "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.plain";
const data: Buffer = readFileSync(path);
const doc = parseAUDB(data);

// entry = { key, type, value }
function show(type: string, v: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);
  switch (type) {
    case "o": {
      const ents = v as [string, [string, unknown]][];
      const keys = ents.slice(0, 16).map(([k, pair]) => k.slice(0, 24));
      return "obj{" + ents.length + "} " + keys.join(",");
    }
    case "a": {
      const items = v as [string, unknown][];
      const kinds = items.slice(0, 6).map((pair) => show(String(pair[0]), pair[1]));
      return "arr{" + items.length + "} " + kinds.join(" ");
    }
    case "s": {
      const s = String(v);
      return "str:" + JSON.stringify(s.length > 60 ? s.slice(0, 60) + "…" : s);
    }
    case "i":
    case "u":
    case "k":
    case "c":
    case "g":
      return type + ":" + String(v);
    case "d":
      return "d:" + String(v);
    case "t":
    case "f":
    case "n":
      return type;
    default:
      return type + ":" + String(v).slice(0, 40);
  }
}

const want = process.argv[2];
for (const t of doc.tables) {
  if (want && t.name !== want) continue;
  console.log("=== TABLE " + t.name + " n=" + t.entries.length);
  const list = want ? t.entries : t.entries.slice(0, 8);
  for (const e of list) {
    console.log("   [" + e.key.slice(0, 60) + "] " + show(e.type, e.value));
  }
  if (!want && t.entries.length > 8) console.log("   ...");
}
