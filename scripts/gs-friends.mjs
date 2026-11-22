// Pull GameData.db (binary-safe) and list friend-related tables via the repo's save engine.
// Run: node --import ./scripts/register-ts-resolve.mjs --experimental-strip-types scripts/gs-friends.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";

const ADB = "C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
const SERIAL = "127.0.0.1:21503";
const REMOTE = "/data/data/com.playrix.gardenscapes/Documents/GameData.db";
const tmp = join(process.env.TEMP, "gs-test");
mkdirSync(tmp, { recursive: true });

const buf = execFileSync(ADB, ["-s", SERIAL, "exec-out", `su -c 'cat ${REMOTE}'`], {
  maxBuffer: 64 * 1024 * 1024,
});
const out = join(tmp, "GameData.db");
writeFileSync(out, buf);
console.log("pulled GameData.db", buf.length, "bytes, head:", buf.subarray(0, 8).toString("latin1"));

const save = decodeSave(buf);
if (!save) {
  console.log("decodeSave failed");
  process.exit(1);
}
const names = [];
const walk = (node, depth) => {
  if (!node || depth > 4) return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
  if (typeof node !== "object") return;
  if (node.name) names.push(String(node.name));
  for (const v of Object.values(node)) walk(v, depth + 1);
};
walk(save, 0);
const uniq = [...new Set(names)];
console.log("entries:", uniq.length);
const interesting = uniq.filter((n) => /friend|social|player|profile|card|box|clan|town/i.test(n));
console.log("interesting:", JSON.stringify(interesting, null, 1));

// dump friend-ish tables
for (const key of interesting.slice(0, 12)) {
  try {
    const t = findTable(save, key) ?? findEntry(save, key);
    if (t) {
      const s = JSON.stringify(t);
      console.log(`--- ${key} (${s.length}B) ---`);
      console.log(s.slice(0, 1200));
    }
  } catch (e) {
    console.log(`--- ${key}: err ${e.message}`);
  }
}
