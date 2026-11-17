// Parse -> serialize round-trip exactness for the Gardenscapes AUDB codec.
// Run: node --experimental-strip-types scripts/gs-roundtrip.ts
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB, serializeAUDB } from "../src/lib/gardenscapes/codec.ts";

const path = process.argv[2] ?? "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.plain";
const data: Buffer = readFileSync(path);

const doc = parseAUDB(data);
const out = serializeAUDB(doc);

console.log("IN=" + data.length + " OUT=" + out.length + " TABLES=" + doc.tables.length);

if (data.length === out.length && data.equals(out)) {
  console.log("ROUNDTRIP_EXACT=true");
} else {
  const n = Math.min(data.length, out.length);
  let diffs = 0;
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (data[i] !== out[i]) {
      if (first < 0) first = i;
      diffs++;
    }
  }
  console.log("ROUNDTRIP_EXACT=false firstDiff=" + first + " byteDiffs=" + diffs);
  if (first >= 0) {
    const a = data.subarray(Math.max(0, first - 16), first + 24);
    const b = out.subarray(Math.max(0, first - 16), first + 24);
    console.log("IN  @" + first + ": " + a.toString("hex"));
    console.log("OUT @" + first + ": " + b.toString("hex"));
  }
}
