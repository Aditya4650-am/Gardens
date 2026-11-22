import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";
import { pullGameSaveRaw } from "@/lib/server/gardenscapes/save.server";

const SERIALS = ["127.0.0.1:21503", "127.0.0.1:21513"];

function prop(doc, key) {
  const t = findTable(doc, "TableName");
  const e = t ? findEntry(t, "Properties") : undefined;
  if (!e || e.type !== "o") return null;
  const hit = objEntries(e).find(([n]) => n === key);
  return hit ? hit[1][1] : null;
}

for (const serial of SERIALS) {
  try {
    const pull = await pullGameSaveRaw(serial);
    const buf = Buffer.from(pull.b64, "base64");
    const d = decodeSave(buf);
    const feat = findTable(d.doc, "Features");
    const c8 = feat?.entries.find((e) => e.key === "CardC8");
    let owned = -1;
    let stockTotal = 0;
    if (c8 && Array.isArray(c8.value)) {
      const core = c8.value.find((x) => Array.isArray(x) && x[0] === "Core");
      const coreKids = core && Array.isArray(core[1]) ? core[1][1] : null;
      const oc = Array.isArray(coreKids) ? coreKids.find((x) => Array.isArray(x) && x[0] === "OwnedCards") : null;
      const items = oc && Array.isArray(oc[1]) ? oc[1][1] : [];
      if (Array.isArray(items)) {
        owned = items.length;
        for (const row of items) {
          if (!Array.isArray(row)) continue;
          const kids = row[1];
          const sk = kids.find((x) => Array.isArray(x) && x[0] === "inStockCount");
          if (sk && Array.isArray(sk[1])) stockTotal += Number(sk[1][1]);
        }
      }
    }
    console.log(`${serial}: name=${prop(d.doc, "name")} level=${prop(d.doc, "level")} PID=${prop(d.doc, "PlayerId")} size=${buf.length}B owned=${owned} stockTotal=${stockTotal}`);
  } catch (e) {
    console.log(`${serial}: ERROR ${String(e).slice(0, 140)}`);
  }
}
