// Targeted dumps for the paths the edit modules write.
import { readFileSync } from "node:fs";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
const raw = readFileSync(path);
const plain = path.endsWith(".plain") ? raw : Buffer.from(xorBytes(raw));
const doc = parseAUDB(plain);

const T = (n: string) => doc.tables.find((t) => t.name === n);
const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s && s.length > 120 ? s.slice(0, 120) + "…" : String(s);
};
const kids = (e: any): [string, [string, unknown]][] =>
  e && e.type === "o" ? (e.value as [string, [string, unknown]][]) : [];

// --- every non-FreeStage key of each season, to find GoldPass/score -------
const se = T("SpecialEvents");
console.log("== seasons: non-FreeStage keys ==");
for (const s of (se?.entries ?? []).filter((e) => /^Season\d+$/.test(e.key))) {
  const ks = kids(s)
    .map(([k]) => k)
    .filter((k) => !k.startsWith("FreeStage"));
  console.log(`  ${s.key}: ${ks.join(", ")}`);
}

// --- Purchases / GoldPass / Score detail for each season ------------------
console.log("\n== season purchase + score detail ==");
for (const s of (se?.entries ?? []).filter((e) => /^Season\d+$/.test(e.key))) {
  for (const [k, [kt, kv]] of kids(s)) {
    if (/purchase|goldpass|score|stage|point/i.test(k) && kt === "o") {
      const inner = kv as [string, [string, unknown]][];
      const brief = inner
        .map(([ik, [ikt, ikv]]) => `${ik}[${ikt}]=${show(ikv)}`)
        .join(" | ");
      console.log(`  ${s.key}.${k} = ${brief.slice(0, 260)}`);
    } else if (/purchase|goldpass|score|point/i.test(k)) {
      console.log(`  ${s.key}.${k} [${kt}] = ${show(kv)}`);
    }
  }
}

// --- OwnProfile full -------------------------------------------------------
const pp = se?.entries.find((e) => e.key === "PlayerProfileOwn");
const own = kids(pp).find(([k]) => k === "OwnProfile");
console.log("\n== SpecialEvents.PlayerProfileOwn.OwnProfile ==");
if (own) for (const [k, [kt, kv]] of kids(own[1][1] as any)) console.log(`  ${k} [${kt}] = ${show(kv)}`);

// --- Features: cosmetics-ish tables ---------------------------------------
const f = T("Features");
console.log("\n== Features cosmetics ==");
for (const want of [
  "ObtainablePlayerNameStylesGFF",
  "CollectionsGFF",
  "SeasonalCardsCollection",
  "ExpeditionTitlesGFF",
  "StartScreensGFF",
]) {
  const e = f?.entries.find((x) => x.key === want);
  if (!e) {
    console.log(`  ${want}: ABSENT`);
    continue;
  }
  console.log(`  ${want}:`);
  for (const [k, [kt, kv]] of kids(e)) console.log(`     ${k} [${kt}] = ${show(kv)}`);
}

// --- items / boosters again with types ------------------------------------
console.log("\n== items types ==");
for (const e of T("items")?.entries ?? []) console.log(`  ${e.key} [${e.type}] = ${show(e.value)}`);

// --- lives / expedition in Properties -------------------------------------
const props = T("TableName")?.entries.find((e) => e.key === "Properties");
console.log("\n== lives / expedition / energy ==");
if (props) {
  for (const [k, [kt, kv]] of kids(props)) {
    if (/lives|energy|expedition|star|level$|^coins$/i.test(k)) console.log(`  ${k} [${kt}] = ${show(kv)}`);
  }
}
