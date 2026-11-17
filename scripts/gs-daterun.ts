// Walk backwards from a position while the `06 <6 digits> 6f 00` (key -> empty
// object) pattern holds, to find where a date-keyed map starts. The first byte
// before the run is the map's own count varint, which is where a desync shows.
// Run: node --experimental-strip-types scripts/gs-daterun.ts [startOffset]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";

const d = Buffer.from(
  xorBytes(readFileSync("C:/Users/User/AppData/Local/Temp/opencode/gs/snap/GameData.db")),
);

// A date key is a length-prefixed ASCII key whose value is an empty object
// (`6f 00`). Keys are DDMMYY, sometimes with a `-4events-test` suffix, so the
// length prefix varies.
function pairLen(p: number): number {
  const len = d[p]!;
  if (len === 0 || len > 40) return 0;
  if (d[p + 1 + len] !== 0x6f || d[p + 2 + len] !== 0x00) return 0;
  for (let i = 0; i < len; i++) {
    const c = d[p + 1 + i]!;
    const ok =
      (c >= 0x30 && c <= 0x39) || c === 0x2d || (c >= 0x41 && c <= 0x7a);
    if (!ok) return 0;
  }
  // first six chars must be digits
  for (let i = 0; i < 6 && i < len; i++) {
    const c = d[p + 1 + i]!;
    if (c < 0x30 || c > 0x39) return 0;
  }
  return 3 + len;
}

const from = Number(process.argv[2] ?? 72666);
let p = from;
if (pairLen(p) === 0) {
  console.log(`no date pair at ${p}`);
  process.exit(1);
}
let end = p;
let n = 0;
while (pairLen(p) > 0) {
  p += pairLen(p);
  n++;
  if (p > from + 4096) break;
}
end = p;
// now walk back from `from`
let q = from;
let back = 0;
while (q > 0 && pairLen(q) > 0) {
  q -= pairLen(q);
  back++;
  if (back > 5000) break;
}
console.log(`date run: ${q} .. ${end}  (${back} pairs back, ${n} forward)`);
console.log(
  "16 bytes before run start:",
  d.subarray(q - 16, q).toString("hex").replace(/(..)/g, "$1 "),
);
console.log("ascii:", JSON.stringify(d.subarray(q - 96, q).toString("latin1")));
const before = d[q - 1]!;
console.log(`byte at ${q - 1} = 0x${before.toString(16)} (${before})`);
