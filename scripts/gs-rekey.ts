// Re-decrypt cal_now1.db with the (repaired) XOR key and verify parse depth.
import { readFileSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { XOR_KEY } from "../src/lib/gardenscapes/key.ts";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const snap = "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\";
const enc = readFileSync(snap + "cal_now1.db");
const fresh = Buffer.alloc(enc.length);
for (let i = 0; i < enc.length; i++) fresh[i] = enc[i]! ^ XOR_KEY.charCodeAt(i % XOR_KEY.length);

writeFileSync(snap + "cal_now1.plain", fresh);
console.log("decrypted " + fresh.length + " bytes, tail=" + fresh.subarray(-4).toString("latin1"));

const doc = parseAUDB(fresh);
console.log("TABLES=" + doc.tables.length);

let maxDepth = 0;
let deepPath = "";
function walk(v: unknown, d: number, path: string): void {
  if (d > maxDepth) { maxDepth = d; deepPath = path; }
  if (d > 8000) throw new Error("depth guard at " + path);
  if (Array.isArray(v)) {
    if (v.length === 2 && typeof v[0] === "string") walk(v[1], d + 1, path + "/" + v[0]);
    else v.forEach((e, i) => walk(e, d + 1, path + "[" + i + "]"));
  }
}
for (const t of doc.tables) {
  for (const e of t.entries) {
    maxDepth = 0;
    try { walk(e.value, 0, t.name + "/" + e.key); }
    catch (err) { console.log("GUARD " + (err as Error).message); }
    if (maxDepth > 40) console.log("DEEP " + t.name + "/" + e.key + " depth=" + maxDepth + " at " + deepPath.slice(0, 200));
  }
}
console.log("done maxDepth=" + maxDepth);
