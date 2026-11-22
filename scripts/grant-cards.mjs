import { writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connectLoad, dropSession, pushEncode } from "@/lib/server/gardenscapes/session.server";
import { pullGameSaveRaw, pushGameSaveRaw } from "@/lib/server/gardenscapes/save.server";
import { grantCards, readCards } from "@/lib/server/gardenscapes/cards.server";
import { decodeSave, findTable } from "@/lib/gardenscapes/save-engine";

const execFileP = promisify(execFile);
const ADB = "C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
const PKG = "com.playrix.gardenscapes";
const TOKEN = "grant-cards";

const IDS = ["card_01", "card_02", "card_03", "card_04"];
const WANT = 2;

const pull = await pullGameSaveRaw();
const s = connectLoad(TOKEN, "cards", pull.b64);

function ownedStock() {
  const feat = findTable(s.decoded.doc, "Features");
  const c8 = feat?.entries.find((e) => e.key === "CardC8");
  const out = new Map();
  if (!c8 || !Array.isArray(c8.value)) return out;
  const core = c8.value.find((x) => Array.isArray(x) && x[0] === "Core");
  const coreKids = core && Array.isArray(core[1]) ? core[1][1] : null;
  const oc = Array.isArray(coreKids) ? coreKids.find((x) => Array.isArray(x) && x[0] === "OwnedCards") : null;
  const items = oc && Array.isArray(oc[1]) ? oc[1][1] : [];
  for (const row of items) {
    if (!Array.isArray(row)) continue;
    const kids = row[1];
    const idk = kids.find((x) => Array.isArray(x) && x[0] === "cardId");
    const sk = kids.find((x) => Array.isArray(x) && x[0] === "inStockCount");
    if (idk && Array.isArray(idk[1]) && sk && Array.isArray(sk[1])) out.set(String(idk[1][1]), Number(sk[1][1]));
  }
  return out;
}

console.log("before:", JSON.stringify([...ownedStock()]));
for (const id of IDS) {
  const cur = ownedStock().get(id) ?? 0;
  const need = WANT - cur;
  if (need > 0) {
    const r = grantCards(s, [id], need);
    console.log(`grant ${id} +${need} -> ${r.changed.length} field(s)`);
  }
}
console.log("after:", JSON.stringify([...ownedStock()]));
console.log("readCards owned count:", readCards(s).owned?.length ?? "?");

const out = pushEncode(s.id, TOKEN);
const v = decodeSave(out);
console.log("encoded", out.length, "B");
console.log("push:", JSON.stringify(await pushGameSaveRaw(out.toString("base64"))));
dropSession(s.id, TOKEN);

await execFileP(ADB, ["-s", "127.0.0.1:21503", "shell", `monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`], { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 40000));
const shot = await execFileP(ADB, ["-s", "127.0.0.1:21503", "exec-out", "screencap", "-p"], {
  encoding: "buffer",
  maxBuffer: 64 * 1024 * 1024,
  timeout: 60000,
});
const path = `${process.env.TEMP}\\gs-test\\cards-granted.png`;
writeFileSync(path, shot.stdout);
console.log("screenshot:", path);
