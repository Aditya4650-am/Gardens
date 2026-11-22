import { writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";
import { pullGameSaveRaw } from "@/lib/server/gardenscapes/save.server";

const execFileP = promisify(execFile);
const ADB = "C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
const TAG = process.argv[2] || "snap";
const SERIALS = [
  ["127.0.0.1:21503", "zen-sender"],
  ["127.0.0.1:21513", "test-receiver"],
];

const ser = (x) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? String(v) : v));

function kid(container, name) {
  if (!Array.isArray(container)) return null;
  const hit = container.find((x) => Array.isArray(x) && x[0] === name);
  return hit ? hit[1] : null;
}

function prop(doc, key) {
  const t = findTable(doc, "TableName");
  const e = t ? findEntry(t, "Properties") : undefined;
  if (!e || e.type !== "o") return null;
  const hit = objEntries(e).find(([n]) => n === key);
  return hit ? hit[1][1] : null;
}

const out = {};
for (const [serial, label] of SERIALS) {
  try {
    const pull = await pullGameSaveRaw(serial);
    const buf = Buffer.from(pull.b64, "base64");
    const d = decodeSave(buf);
    const feat = findTable(d.doc, "Features");
    const c8 = feat?.entries.find((e) => e.key === "CardC8");

    const owned = [];
    let received = [];
    let given = [];
    let giftKeys = [];
    if (c8 && Array.isArray(c8.value)) {
      const core = c8.value.find((x) => Array.isArray(x) && x[0] === "Core");
      const coreKids = core && Array.isArray(core[1]) ? core[1][1] : null;
      const oc = Array.isArray(coreKids) ? coreKids.find((x) => Array.isArray(x) && x[0] === "OwnedCards") : null;
      const items = oc && Array.isArray(oc[1]) ? oc[1][1] : [];
      if (Array.isArray(items)) {
        for (const row of items) {
          if (!Array.isArray(row)) continue;
          const kids = row[1];
          const idk = kids.find((x) => Array.isArray(x) && x[0] === "cardId");
          const sk = kids.find((x) => Array.isArray(x) && x[0] === "inStockCount");
          if (idk && Array.isArray(idk[1])) owned.push(`${idk[1][1]}:${sk && Array.isArray(sk[1]) ? sk[1][1] : "?"}`);
        }
      }
      const gift = c8.value.find((x) => Array.isArray(x) && x[0] === "CardsGiftingCore");
      const giftKids = gift && Array.isArray(gift[1]) ? gift[1][1] : null;
      if (Array.isArray(giftKids)) {
        giftKeys = giftKids.map((x) => (Array.isArray(x) ? x[0] : "?"));
        const rc = kid(giftKids, "ReceivedCards");
        if (Array.isArray(rc)) {
          const arr = Array.isArray(rc[1]) ? rc[1] : [];
          received = arr.map((row) => {
            if (!Array.isArray(row)) return "?";
            const kids = Array.isArray(row[1]) ? row[1] : [];
            const idk = kids.find((x) => Array.isArray(x) && x[0] === "cardId");
            const fk = kids.find((x) => Array.isArray(x) && x[0] === "from");
            return `${idk && Array.isArray(idk[1]) ? idk[1][1] : "?"}${fk ? "/from" : ""}`;
          });
        }
        const gc = kid(giftKids, "GivenCards");
        if (Array.isArray(gc)) {
          const arr = Array.isArray(gc[1]) ? gc[1] : [];
          given = arr.map((row) => {
            if (!Array.isArray(row)) return "?";
            const kids = Array.isArray(row[1]) ? row[1] : [];
            const idk = kids.find((x) => Array.isArray(x) && x[0] === "cardId");
            return idk && Array.isArray(idk[1]) ? idk[1][1] : "?";
          });
        }
      }
    }

    out[label] = {
      serial,
      name: prop(d.doc, "name"),
      PID: prop(d.doc, "PlayerId"),
      size: buf.length,
      ownedCount: owned.length,
      owned,
      giftKeys,
      received,
      given,
    };
    console.log(`${label} (${serial}): name=${out[label].name} PID=${out[label].PID} owned=${owned.length} Received=${received.length} Given=${given.length}`);

    const shot = await execFileP(ADB, ["-s", serial, "exec-out", "screencap", "-p"], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60000,
    });
    const path = `${process.env.TEMP}\\gs-test\\${label}-${TAG}.png`;
    writeFileSync(path, shot.stdout);
    console.log(`  shot: ${path}`);
  } catch (e) {
    console.log(`${label}: ERROR ${String(e).slice(0, 160)}`);
  }
}

const jsonPath = `${process.env.TEMP}\\gs-test\\state-${TAG}.json`;
writeFileSync(jsonPath, JSON.stringify(out, null, 2));
console.log("state:", jsonPath);
