import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const data: Buffer = readFileSync("C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.plain");
const doc = parseAUDB(data);

let maxDepth = 0;
let deepPath = "";

function walk(v: unknown, d: number, path: string): void {
  if (d > maxDepth) { maxDepth = d; deepPath = path; }
  if (d > 4000) throw new Error("depth guard at " + path);
  if (Array.isArray(v)) {
    // ["o", entries] / ["a", items] / ["s", str] tagged tuples
    if (v.length === 2 && typeof v[0] === "string") {
      walk(v[1], d + 1, path + "/" + v[0]);
    } else {
      v.forEach((e, i) => walk(e, d + 1, path + "[" + i + "]"));
    }
  }
}

for (const t of doc.tables) {
  for (const e of t.entries) {
    maxDepth = 0;
    try { walk(e.value, 0, t.name + "/" + e.key); } catch (err) { console.log("GUARD " + (err as Error).message); }
    if (maxDepth > 60) console.log("DEEP " + t.name + "/" + e.key + " depth=" + maxDepth + " at " + deepPath.slice(0, 300));
  }
}
console.log("done");
