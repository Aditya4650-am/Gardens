// Every Properties key matching Frame/Style/Title/Badge/Coupon/Season in the
// two untouched real saves, to learn the real unlock conventions.
import { readFileSync } from "node:fs";
import { findTable, findEntry, objEntries } from "@/lib/gardenscapes/save-engine";
import { parseAUDB } from "@/lib/gardenscapes/codec";
import { decodeSave } from "@/lib/gardenscapes/save-engine";

const files = [
  "C:/Users/User/Downloads/gardenscapes/_ref/mined/GameData.db",
  "C:/Users/User/Downloads/Telegram Desktop/GameData.db",
];
const want = /frame|style|title|badge|skin|coupon|season|pass|ShownIds|Bought|Unlocked/i;

for (const f of files) {
  const buf = readFileSync(f);
  const doc = buf.toString("ascii", 0, 4) === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n######## ${f}`);
  const tn = findTable(doc, "TableName");
  const pe = tn ? findEntry(tn, "Properties") : undefined;
  if (pe && pe.type === "o") {
    const kids = objEntries(pe);
    const hits = kids.filter(([k]) => want.test(k));
    console.log(`Properties ${kids.length} keys, ${hits.length} match:`);
    for (const [k, v] of hits) {
      const s = JSON.stringify(v[1]);
      console.log(`  ${k} [${v[0]}] = ${s && s.length > 140 ? s.slice(0, 140) + "..." : s}`);
    }
  }
  // any other table with Frame/Style/Title/Badge in table name or entry key
  for (const t of doc.tables) {
    if (want.test(t.name)) console.log(`TABLE ${t.name} (${t.entries.length})`);
    for (const e of t.entries) {
      if (want.test(e.key) && e.key !== "Properties") {
        const s = JSON.stringify(e.value);
        console.log(`  ${t.name}.${e.key} [${e.type}] = ${s && s.length > 140 ? s.slice(0, 140) + "..." : s}`);
      }
    }
  }
}
