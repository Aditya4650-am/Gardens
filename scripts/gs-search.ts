// Search every key in every table for feature-relevant names.
// Run: node --experimental-strip-types scripts/gs-search.ts <regex>
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const path = "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.plain";
const data: Buffer = readFileSync(path);
const doc = parseAUDB(data);

const pat = new RegExp(process.argv[2] ?? "coin|money|level|star|decor|frame|style|badge|season|pass|golden", "i");

function show(type: string, v: unknown): string {
  switch (type) {
    case "o": {
      const ents = v as [string, [string, unknown]][];
      const keys = ents.slice(0, 10).map(([k]) => k.slice(0, 24));
      return "obj{" + ents.length + "} " + keys.join(",") + (ents.length > 10 ? "…" : "");
    }
    case "a": {
      const items = v as [string, unknown][];
      return "arr{" + items.length + "}";
    }
    case "s": {
      const s = String(v);
      return "str:" + JSON.stringify(s.length > 50 ? s.slice(0, 50) + "…" : s);
    }
    default:
      return type + ":" + String(v).slice(0, 50);
  }
}

let hits = 0;
for (const t of doc.tables) {
  const matched: string[] = [];
  for (const e of t.entries) {
    if (pat.test(e.key)) {
      matched.push("   [" + e.key.slice(0, 70) + "] " + show(e.type, e.value));
      hits++;
    }
  }
  if (matched.length) {
    console.log("=== " + t.name + " (" + matched.length + " hits)");
    for (const m of matched.slice(0, 25)) console.log(m);
    if (matched.length > 25) console.log("   ... +" + (matched.length - 25));
  }
}
console.log("TOTAL HITS=" + hits);
