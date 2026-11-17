// Dump the exact shape of every path the edit modules will write, across every
// AUDB save on disk, so no module guesses at a structure.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodeSave } from "@/lib/gardenscapes/save-engine";
import { findTable, findEntry, objEntries, arrItems } from "@/lib/gardenscapes/save-engine";

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
console.log("saves found:", files.length);

function path(doc: any, table: string, entry: string, rest: string): string {
  const t = findTable(doc, table);
  if (!t) return `<no table ${table}>`;
  const e = findEntry(t, entry);
  if (!e) return `<no entry ${entry}>`;
  if (!rest) return fmt(e.type, e.value);
  let cur: any = { type: e.type, value: e.value };
  for (const seg of rest.split(".")) {
    if (cur.type === "o") {
      const hit = objEntries(cur).find(([k]) => k === seg);
      if (!hit) return `<no key ${seg}>`;
      cur = { type: hit[1][0], value: hit[1][1] };
    } else if (cur.type === "a") {
      const items = arrItems(cur);
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return `<arr idx ${seg} of ${items.length}>`;
      cur = { type: items[idx][0], value: items[idx][1] };
    } else return `<scalar at ${seg}>`;
  }
  return fmt(cur.type, cur.value);
}
function fmt(type: string, v: unknown): string {
  if (type === "a") {
    const n = Array.isArray(v) ? v.length : "?";
    const sample = Array.isArray(v) && n > 0 ? JSON.stringify(v.slice(0, 3)).slice(0, 400) : "";
    return `[${n}] ${sample}`;
  }
  if (type === "o") {
    const k = v && typeof v === "object" ? Object.keys(v as object) : [];
    return `{${k.length}} ${k.slice(0, 24).join(",")}`;
  }
  const s = JSON.stringify(v);
  return `${type} ${s && s.length > 200 ? s.slice(0, 200) + "…" : s}`;
}

const TARGETS: [string, string, string][] = [
  // table, entry, rest
  ["SpecialEvents", "PlayerProfileOwn", "OwnProfile"],
  ["SpecialEvents", "PlayerProfileOwn", "OwnProfile.AvatarStyle"],
  ["SpecialEvents", "PlayerProfileOwn", "OwnProfile.PlayerNameStyle"],
  ["SpecialEvents", "PlayerProfileOwn", "OwnProfile.PlayerTitleId"],
  ["SpecialEvents", "PlayerProfileOwn", "OwnProfile.PlayerTitleIdsEarned"],
  ["SpecialEvents", "PlayerProfileOwn", "OwnProfile.ProfileBadgeId"],
  ["SpecialEvents", "PlayerProfileOwn", "OwnProfile.ProfileSkinId"],
  ["SpecialEvents", "PlayerProfileOwn", "AvatarStyleHistory"],
  ["SpecialEvents", "PlayerProfileOwn", "NameStyleHistory"],
  ["Features", "ProfileBadgesGFF", "Core.OwnedBadges"],
  ["Features", "ExpeditionTitlesGFF", "ExpeditionTitles"],
  ["Features", "ObtainableAvatarStylesGFF", "ObtainableAvatarStyles"],
  ["Features", "ObtainablePlayerNameStylesGFF", "ObtainablePlayerNameStyles"],
  ["Features", "CardC3", "Core.OwnedCards"],
  ["Features", "CardC3", "Core.OwnedSets"],
  ["Features", "CardC3", "Core.GivenPackInfos"],
  ["Features", "CardC3", "CardsGiftingCore"],
  ["Features", "CardC8", "Core.OwnedCards"],
  ["items", "", ""],
  ["repairs", "chapter1", "@completed"],
  ["repairs", "chapter1", "@opened"],
  ["repairs", "chapter1", "Gate"],
];

for (const f of files) {
  let buf: Buffer;
  try { buf = readFileSync(f); } catch { continue; }
  if (buf.length < 16) continue;
  let doc: any;
  try { doc = decodeSave(buf).doc; } catch { continue; }
  const plain = buf.toString("ascii", 0, 4) === "AUDB" ? "plain" : "xor";
  console.log(`\n######## ${f} (${buf.length} B, ${plain}) ########`);
  for (const [tb, en, rest] of TARGETS) {
    console.log(`  ${tb}.${en}${rest ? "." + rest : ""} = ${path(doc, tb, en, rest)}`);
  }
  // seasons present
  const se = findTable(doc, "SpecialEvents");
  if (se) {
    const all = se.entries.map((e: any) => e.key).filter((k: string) => /^Season\d+$/.test(k));
    console.log(`  SpecialEvents seasons: ${all.join(",")}`);
  }
  // Features keys
  const fe = findTable(doc, "Features");
  if (fe) console.log(`  Features keys: ${fe.entries.map((e: any) => e.key).join(",")}`);
  // Properties sample
  const pt = findTable(doc, "TableName");
  if (pt) {
    const pe = findEntry(pt, "Properties");
    if (pe) {
      const kids = objEntries(pe);
      const want = ["garden_max", "goldpass", "diamondpass", "goldpass_rewards", "diamondpass_rewards", "goldticket", "ticketrewards", "lightning10", "rainbow", "golden_cups", "level", "coins", "GardenCurrentChapterId"];
      const hits = kids.filter(([k]) => want.includes(k));
      console.log(`  Properties hits: ${hits.map(([k, v]) => `${k}=${JSON.stringify(v[1]).slice(0, 60)}`).join(" | ")}`);
    }
  }
}
