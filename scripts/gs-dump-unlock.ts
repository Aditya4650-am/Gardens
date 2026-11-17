// Verify the unlock_all.py write keys against every AUDB save on disk, and find
// the Properties keys that hold avatar/frame/style/badge/title unlocks.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodeSave, findTable, findEntry, objEntries } from "@/lib/gardenscapes/save-engine";
import { parseAUDB } from "@/lib/gardenscapes/codec";

const roots = ["C:/Users/User/Downloads"];
const files: string[] = [];
function walk(dir: string, depth: number) {
  if (depth > 4) return;
  let ents: string[];
  try { ents = readdirSync(dir); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e);
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        if (/node_modules|\.git|decomp|@vitejs|\.venv/.test(p)) continue;
        walk(p, depth + 1);
      } else if (/GameData.*\.db$|\.AUDB$/i.test(e)) files.push(p);
    } catch {}
  }
}
for (const r of roots) if (existsSync(r)) walk(r, 0);

const want = /Bought|ShownIds|WasUnlocked|^Unlocked|SP_|Badge|Title|Style|Frame|Avatar|Pass|Cup/i;

for (const f of files) {
  let buf: Buffer;
  try { buf = readFileSync(f); } catch { continue; }
  if (buf.length < 16) continue;
  let doc: any = null;
  try { doc = buf.toString("ascii", 0, 4) === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc; } catch { continue; }
  console.log(`\n######## ${f} ########`);

  // tables present
  const names = doc.tables.map((t: any) => t.name);
  for (const t of ["repairs_purchases_info", "EventsSystem", "SpecialBonuses", "Redesign", "items", "repairs", "Features", "SpecialEvents", "TableName", "quests", "InfiniteBoosters", "SpecialEvents"]) {
    console.log(`  table ${t}: ${names.includes(t) ? "YES" : "no"}`);
  }

  // Properties unlock-ish keys
  const tn = findTable(doc, "TableName");
  const pe = tn ? findEntry(tn, "Properties") : undefined;
  if (pe && pe.type === "o") {
    const kids = objEntries(pe);
    const hits = kids.filter(([k]) => want.test(k));
    console.log(`  Properties ${kids.length} keys, ${hits.length} match:`);
    for (const [k, v] of hits.slice(0, 120)) {
      const s = JSON.stringify(v[1]);
      console.log(`     ${k} [${v[0]}] = ${s && s.length > 90 ? s.slice(0, 90) + "…" : s}`);
    }
  }

  // EventsSystem / SpecialBonuses shapes
  for (const tname of ["EventsSystem", "SpecialBonuses", "repairs_purchases_info"]) {
    const t = findTable(doc, tname);
    if (!t) continue;
    console.log(`  ${tname}: ${t.entries.length} entries -> ${t.entries.slice(0, 10).map((e: any) => `${e.key}[${e.type}]`).join(", ")}`);
    // one level deep for first entry
    const e0 = t.entries[0];
    if (e0 && e0.type === "o") {
      const k0 = objEntries(e0).slice(0, 14);
      console.log(`     ${e0.key}: ${k0.map(([k, v]) => `${k}=${JSON.stringify(v[1]).slice(0, 40)}`).join(" | ")}`);
    }
  }

  // OwnProfile full values
  const se = findTable(doc, "SpecialEvents");
  const po = se ? findEntry(se, "PlayerProfileOwn") : undefined;
  if (po && po.type === "o") {
    const op = objEntries(po).find(([k]) => k === "OwnProfile");
    if (op && op[1][0] === "o") {
      const inner = objEntries({ key: "x", type: "o", value: op[1][1] } as any);
      console.log(`  OwnProfile: ${inner.map(([k, v]) => `${k}=${JSON.stringify(v[1]).slice(0, 70)}`).join(" | ")}`);
    }
    const hist = objEntries(po).filter(([k]) => /History|Legacy|Merged/.test(k));
    console.log(`  PlayerProfileOwn extras: ${hist.map(([k, v]) => `${k}=${JSON.stringify(v[1]).slice(0, 70)}`).join(" | ")}`);
  }
}
