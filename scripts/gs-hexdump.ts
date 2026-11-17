// Dump raw bytes around a table header to confirm the declared entry count.
// Run: node --experimental-strip-types scripts/gs-hexdump.ts [offset] [len]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";

const at = Number(process.argv[2] ?? 46102);
const len = Number(process.argv[3] ?? 48);
const d = Buffer.from(
  xorBytes(readFileSync("C:/Users/User/AppData/Local/Temp/opencode/gs/snap/GameData.db")),
);
const slice = d.subarray(at, at + len);
console.log("hex:");
console.log(slice.toString("hex").replace(/(..)/g, "$1 "));
console.log("asc:", JSON.stringify(slice.toString("latin1")));
