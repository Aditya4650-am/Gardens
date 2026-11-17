import { readFileSync } from "node:fs";
import { decodeSave, encodeSave } from "../src/lib/gardenscapes/save-engine.ts";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";

const enc = new Uint8Array(readFileSync("C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.db"));

const d = decodeSave(Buffer.from(enc));
console.log("VERSION=" + d.version);
console.log("TABLES=" + d.doc.tables.length);
console.log("PLAINHEAD=" + Array.from(d.plainBytes.slice(0, 16)).join(","));
const re = encodeSave(d.doc);
let same = true;
for (let i = 0; i < enc.length; i++) {
  if (enc[i] !== re[i]) { console.log("DIFF at " + i); same = false; break; }
}
console.log("ROUNDTRIP_EXACT=" + same);