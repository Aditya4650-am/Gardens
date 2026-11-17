// Dump the full key list of one table entry: <table> <entryKey> [depth]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const path = "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.plain";
const data: Buffer = readFileSync(path);
const doc = parseAUDB(data);

const [, , tname, ekey] = process.argv;
const table = doc.tables.find((t) => t.name === tname);
if (!table) throw new Error("no table " + tname);
const entry = table.entries.find((e) => e.key === ekey);
if (!entry) throw new Error("no entry " + ekey);

function show(type: string, v: unknown): string {
  switch (type) {
    case "o": {
      const ents = v as [string, [string, unknown]][];
      return "obj{" + ents.length + "}";
    }
    case "a": return "arr{" + (v as unknown[]).length + "}";
    case "s": { const s = String(v); return "str:" + JSON.stringify(s.length > 60 ? s.slice(0, 60) + "…" : s); }
    default: return type + ":" + String(v).slice(0, 60);
  }
}

if (entry.type === "o") {
  const ents = entry.value as [string, [string, unknown]][];
  for (const [k, pair] of ents) console.log(k + "  =  " + show(pair[0], pair[1]));
} else {
  console.log(show(entry.type, entry.value));
}
