import { readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connectLoad, dropSession, pushEncode } from "@/lib/server/gardenscapes/session.server";
import { pullGameSaveRaw, pushGameSaveRaw } from "@/lib/server/gardenscapes/save.server";
import { writeStats, readStat } from "@/lib/server/gardenscapes/stats.server";
import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";

const execFileP = promisify(execFile);
const ADB = "C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
const SERIAL = "127.0.0.1:21513";
const PKG = "com.playrix.gardenscapes";
const TOKEN = "level-test";

const TARGET_HUD = 45;
const WANT = TARGET_HUD - 1; // the game renders level+1

function prop(doc, key) {
  const t = findTable(doc, "TableName");
  const e = t ? findEntry(t, "Properties") : undefined;
  if (!e || e.type !== "o") return null;
  const hit = objEntries(e).find(([n]) => n === key);
  return hit ? hit[1][1] : null;
}

const pull = await pullGameSaveRaw();
const before = decodeSave(Buffer.from(pull.b64, "base64"));
console.log(`before: name=${prop(before.doc, "name")} level=${prop(before.doc, "level")} coins=${prop(before.doc, "coins")} PID=${prop(before.doc, "PlayerId")}`);

const s = connectLoad(TOKEN, SERIAL, pull.b64);
console.log("current level (readStat):", readStat(s, "level"));
const res = writeStats(s, { level: WANT });
console.log("writeStats:", JSON.stringify(res));
console.log("after write (readStat):", readStat(s, "level"));

const out = pushEncode(s.id, TOKEN);
const verify = decodeSave(out);
console.log(`encoded ${out.length}B -> level=${prop(verify.doc, "level")} (HUD ${Number(prop(verify.doc, "level")) + 1}) identity PID=${prop(verify.doc, "PlayerId")}`);

const pushed = await pushGameSaveRaw(out.toString("base64"));
console.log("push:", JSON.stringify(pushed));
dropSession(s.id, TOKEN);

await execFileP(ADB, ["-s", SERIAL, "shell", `monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`], { timeout: 30000 });
await new Promise((r) => setTimeout(r, 40000));
const shot = await execFileP(ADB, ["-s", SERIAL, "exec-out", "screencap", "-p"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
const path = `${process.env.TEMP}\\gs-test\\level45.png`;
writeFileSync(path, shot.stdout);
console.log("screenshot:", path);
