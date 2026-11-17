// Which saves decode, and the exact key names of the profile/card objects.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodeSave, findTable, findEntry, objEntries, arrItems } from "@/lib/gardenscapes/save-engine";
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
        if (/node_modules|\.git|decomp|@vitejs/.test(p)) continue;
        walk(p, depth + 1);
      } else if (/GameData\.db|SaveGame.*\.db|\.AUDB$/i.test(e)) files.push(p);
    } catch {}
  }
}
for (const r of roots) if (existsSync(r)) walk(r, 0);

for (const f of files) {
  let buf: Buffer;
  try { buf = readFileSync(f); } catch { continue; }
  const head = buf.toString("ascii", 0, 4);
  let status = "";
  let doc: any = null;
  try {
    doc = head === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
    status = "OK";
  } catch (e: any) { status = "FAIL " + String(e.message).slice(0, 80); }
  console.log(`\n== ${f} (${buf.length} B, head=${JSON.stringify(head)}) -> ${status}`);
  if (!doc) continue;

  // OwnProfile key names
  const se = findTable(doc, "SpecialEvents");
  const po = se ? findEntry(se, "PlayerProfileOwn") : undefined;
  if (po && po.type === "o") {
    const keys = objEntries(po).map(([k]) => k);
    console.log(`  PlayerProfileOwn keys: ${keys.join(",")}`);
    const op = objEntries(po).find(([k]) => k === "OwnProfile");
    if (op) console.log(`  OwnProfile keys: ${objEntries({ key: "x", type: op[1][0], value: op[1][1] } as any).map(([k, v]) => `${k}(${v[0]})`).join(",")}`);
  }

  // Features structures when non-empty
  const fe = findTable(doc, "Features");
  if (fe) {
    for (const name of ["ExpeditionTitlesGFF", "ObtainableAvatarStylesGFF", "ObtainablePlayerNameStylesGFF", "ProfileBadgesGFF"]) {
      const e = findEntry(fe, name);
      if (!e) continue;
      const kids = objEntries(e);
      console.log(`  ${name} keys: ${kids.map(([k, v]) => `${k}[${v[0]}:${Array.isArray(v[1]) ? v[1].length : Object.keys(v[1] ?? {}).length}]`).join(" ")}`);
      for (const [k, v] of kids) {
        if (v[0] !== "o" && v[0] !== "a") continue;
        const inner = v[0] === "o" ? objEntries({ key: k, type: v[0], value: v[1] } as any) : [];
        if (inner.length) console.log(`     ${k} -> ${inner.slice(0, 6).map(([ik, iv]) => `${ik}:${JSON.stringify(iv[1]).slice(0, 70)}`).join(" | ")}`);
      }
    }
    // Card collections: which CardC* have OwnedCards
    for (const cn of ["CardC3", "CardC4", "CardC5", "CardC6", "CardC7", "CardC8"]) {
      const c = findEntry(fe, cn);
      if (!c) continue;
      const core = objEntries(c).find(([k]) => k === "Core");
      if (!core) continue;
      const coreO = { key: "c", type: "o", value: core[1][1] } as any;
      const owned = objEntries(coreO).find(([k]) => k === "OwnedCards");
      const sets = objEntries(coreO).find(([k]) => k === "OwnedSets");
      const oc = owned && owned[1][0] === "a" ? arrItems({ key: "", type: "a", value: owned[1][1] } as any).length : -1;
      const os = sets && sets[1][0] === "a" ? arrItems({ key: "", type: "a", value: sets[1][1] } as any).length : -1;
      console.log(`  ${cn}: OwnedCards=${oc} OwnedSets=${os} coreKeys=${objEntries(coreO).length}`);
    }
  }

  // items table
  const it = findTable(doc, "items");
  if (it) console.log(`  items keys: ${it.entries.map((e: any) => `${e.key}=${JSON.stringify(e.value)}`).join(" ")}`);

  // repairs chapter list
  const rp = findTable(doc, "repairs");
  if (rp) console.log(`  repairs chapters: ${rp.entries.length} -> ${rp.entries.slice(0, 8).map((e: any) => e.key).join(",")} …`);
}
