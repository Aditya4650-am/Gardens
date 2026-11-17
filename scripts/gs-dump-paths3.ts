// What do the plain AUDB saves hold? Especially the objects that are empty in
// the reference save (ExpeditionTitles, Obtainable*Styles, cards).
import { readFileSync } from "node:fs";
import { parseAUDB } from "@/lib/gardenscapes/codec";
import { findTable, findEntry, objEntries, arrItems } from "@/lib/gardenscapes/save-engine";

const files = [
  "C:/Users/User/Downloads/gs-local-tool/gs-local-tool/dist/GameData.db",
  "C:/Users/User/Downloads/Telegram Desktop/GameData.db",
];

for (const f of files) {
  const buf = readFileSync(f);
  let doc: any;
  try { doc = parseAUDB(buf); } catch (e: any) { console.log(f, "FAIL", e.message); continue; }
  console.log(`\n######## ${f} ########`);
  console.log(`tables(${doc.tables.length}): ${doc.tables.map((t: any) => t.name).join(",")}`);

  const fe = findTable(doc, "Features");
  if (fe) {
    console.log(`Features: ${fe.entries.map((e: any) => e.key).join(",")}`);
    for (const name of ["ExpeditionTitlesGFF", "ObtainableAvatarStylesGFF", "ObtainablePlayerNameStylesGFF", "ProfileBadgesGFF"]) {
      const e = findEntry(fe, name);
      if (!e) { console.log(`  ${name}: <absent>`); continue; }
      const kids = objEntries(e);
      console.log(`  ${name}: ${kids.map(([k, v]) => `${k}[${v[0]}=${JSON.stringify(v[1]).slice(0, 300)}]`).join("  ")}`);
    }
    for (const cn of ["CardC3", "CardC4", "CardC5", "CardC6", "CardC7", "CardC8"]) {
      const c = findEntry(fe, cn);
      if (!c) { console.log(`  ${cn}: <absent>`); continue; }
      const core = objEntries(c).find(([k]) => k === "Core");
      if (!core) { console.log(`  ${cn}: no Core`); continue; }
      const coreO = { key: "c", type: "o", value: core[1][1] } as any;
      const owned = objEntries(coreO).find(([k]) => k === "OwnedCards");
      const sets = objEntries(coreO).find(([k]) => k === "OwnedSets");
      const packs = objEntries(coreO).find(([k]) => k === "GivenPackInfos");
      const oc = owned && owned[1][0] === "a" ? arrItems({ key: "", type: "a", value: owned[1][1] } as any) : [];
      console.log(`  ${cn}: OwnedCards=${oc.length} ${oc.slice(0, 3).map((i) => JSON.stringify(i[1])).join(" ")}`);
      if (sets && sets[1][0] === "a") {
        const os = arrItems({ key: "", type: "a", value: sets[1][1] } as any);
        console.log(`     OwnedSets=${os.length} first=${JSON.stringify(os[0]?.[1])}`);
      }
      if (packs && packs[1][0] === "a") {
        const op = arrItems({ key: "", type: "a", value: packs[1][1] } as any);
        console.log(`     GivenPackInfos=${op.length} ${op.slice(0, 3).map((i) => JSON.stringify(i[1])).join(" ")}`);
      }
    }
  }

  const se = findTable(doc, "SpecialEvents");
  if (se) {
    const seasons = se.entries.map((e: any) => e.key).filter((k: string) => /^Season\d+$/.test(k));
    console.log(`seasons: ${seasons.join(",")}`);
    const po = findEntry(se, "PlayerProfileOwn");
    if (po && po.type === "o") {
      const op = objEntries(po).find(([k]) => k === "OwnProfile");
      if (op) console.log(`OwnProfile: ${objEntries({ key: "x", type: "o", value: op[1][1] } as any).map(([k, v]) => `${k}=${JSON.stringify(v[1]).slice(0, 80)}`).join(" | ")}`);
    }
    // GoldPass on each season
    for (const s of seasons) {
      const e = findEntry(se, s);
      if (!e || e.type !== "o") continue;
      const kids = objEntries(e);
      const gp = kids.find(([k]) => k === "Purchases");
      const fs = kids.find(([k]) => k === "FreeStage");
      const gpk = gp ? objEntries({ key: "p", type: "o", value: gp[1][1] } as any) : [];
      const fsk = fs && fs[1][0] === "o" ? objEntries({ key: "f", type: "o", value: fs[1][1] } as any) : [];
      console.log(`  ${s}: keys=${kids.map(([k]) => k).join("/")} Purchases=${gpk.map(([k]) => k).join("+")} FreeStage=${fsk.length}`);
    }
  }

  const it = findTable(doc, "items");
  if (it) console.log(`items: ${it.entries.map((e: any) => `${e.key}=${JSON.stringify(e.value)}`).join(" ")}`);

  const rp = findTable(doc, "repairs");
  if (rp) {
    console.log(`repairs: ${rp.entries.length} chapters`);
    const c1 = findEntry(rp, "chapter1");
    if (c1 && c1.type === "o") {
      const kids = objEntries(c1);
      console.log(`  chapter1: ${kids.length} keys, first=${kids.slice(0, 5).map(([k, v]) => `${k}:${JSON.stringify(v[1]).slice(0, 60)}`).join(" | ")}`);
    }
  }
}
