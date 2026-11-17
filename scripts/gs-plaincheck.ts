import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { XOR_KEY } from "../src/lib/gardenscapes/key.ts";

const snap = "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\";
const enc = readFileSync(snap + "cal_now1.db");
const plainSaved = readFileSync(snap + "cal_now1.plain");

const fresh = Buffer.alloc(enc.length);
for (let i = 0; i < enc.length; i++) fresh[i] = enc[i]! ^ XOR_KEY.charCodeAt(i % XOR_KEY.length);

console.log("enc=" + enc.length + " saved=" + plainSaved.length + " fresh=" + fresh.length);
console.log("SAVED_EQ_FRESH=" + plainSaved.equals(fresh));
if (!plainSaved.equals(fresh)) {
  let first = -1;
  for (let i = 0; i < Math.min(fresh.length, plainSaved.length); i++) {
    if (fresh[i] !== plainSaved[i]) { first = i; break; }
  }
  console.log("firstDiff=" + first);
  if (first >= 0) {
    console.log("fresh @" + first + ": " + fresh.subarray(first, first + 24).toString("hex"));
    console.log("saved @" + first + ": " + plainSaved.subarray(first, first + 24).toString("hex"));
  }
}
