import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { XOR_KEY } from "../src/lib/gardenscapes/key.ts";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const enc = readFileSync("C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.db");
const klen = XOR_KEY.length;
const plain = Buffer.alloc(enc.length);
for (let i = 0; i < enc.length; i++) plain[i] = enc[i]! ^ XOR_KEY.charCodeAt(i % klen);
const doc = parseAUDB(plain);
console.log("VER=" + doc.version);
console.log("TABLES=" + doc.tables.length);
for (const t of doc.tables) {
  console.log("TABLE[" + t.name + "] n=" + t.entries.length);
  for (const e of t.entries) {
    const v = typeof e.value === "string" ? "STR(" + e.value.length + ")" : JSON.stringify(e.value);
    console.log("   [" + e.key + "] type=" + e.type + " :: " + String(v).slice(0, 600));
  }
}
console.log("PLEN=" + plain.length);
