// Diagnose a Gardenscapes save: XOR-decrypt, dump the header, and locate the
// first place the AUDB grammar stops matching.
// Run: node --experimental-strip-types scripts/gs-diag.ts [savePath]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";
import { XOR_KEY } from "../src/lib/gardenscapes/key.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
const raw = readFileSync(path);
const plain = Buffer.from(xorBytes(raw));

console.log("file", path, raw.length, "B");
console.log("magic", JSON.stringify(plain.subarray(0, 4).toString("latin1")));
const ver = plain.readUInt32LE(4);
console.log("version", ver);
console.log("at8", JSON.stringify(plain.subarray(8, 40).toString("latin1")));

// Is the header even readable? Look for the first TBLE.
let idx = plain.indexOf("TBLE");
console.log("first TBLE at", idx);
let count = 0;
let positions: number[] = [];
while (idx >= 0 && count < 200) {
  positions.push(idx);
  idx = plain.indexOf("TBLE", idx + 4);
  count++;
}
console.log("TBLE count", count, "first 20", positions.slice(0, 20).join(","));

// Hex dump around the failure point reported by the parser.
const at = Number(process.argv[3] ?? 72984);
console.log(`\n-- hex around ${at} --`);
console.log(plain.subarray(at - 64, at + 64).toString("hex").replace(/(..)/g, "$1 "));
console.log("ascii:", JSON.stringify(plain.subarray(at - 64, at + 64).toString("latin1")));

// Try: maybe the key only applies to a prefix. Compare where the file stops
// looking like AUDB under a couple of alternate keys.
console.log("\n-- alternate key probe --");
for (const k of [XOR_KEY, XOR_KEY.slice(1), XOR_KEY + "X"]) {
  const p = Buffer.from(xorBytes(raw, k));
  console.log(
    JSON.stringify(k.slice(0, 12)),
    "magic",
    p.subarray(0, 4).toString("latin1"),
    "ver",
    p.readUInt32LE(4),
  );
}
