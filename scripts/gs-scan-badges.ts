// For each save: ProfileBadgeId vs OwnedBadges ciphers — is worn always owned?
import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave } from "../src/lib/gardenscapes/save-engine.ts";

const files = [
  "../../_ref/mined/GameData.db",
  "../../Telegram Desktop/GameData.db",
  "../../gs-local-tool/gs-local-tool/dist/GameData.db",
];

for (const f of files) {
  let buf: Buffer;
  try { buf = readFileSync(f); } catch { console.log(`\n== ${f}: MISSING`); continue; }
  let doc: any;
  try {
    doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  } catch { console.log(`\n== ${f}: decode failed`); continue; }
  console.log(`\n== ${f}`);
  let worn = "";
  const se = doc.tables.find((t: any) => t.name === "SpecialEvents");
  if (se) {
    const ppo = se.entries.find((e: any) => e.key === "PlayerProfileOwn");
    if (ppo) {
      const own = ppo.value.find((c: any) => c[0] === "OwnProfile");
      if (own) {
        const get = (k: string) => own[1][1].find((c: any) => c[0] === k)?.[1][1];
        worn = get("ProfileBadgeId") ?? "";
        console.log(`  worn ProfileBadgeId = ${JSON.stringify(worn)}`);
        console.log(`  PlayerTitleId = ${JSON.stringify(get("PlayerTitleId"))}`);
        console.log(`  PlayerTitleIdsEarned = ${JSON.stringify(get("PlayerTitleIdsEarned"))}`);
        console.log(`  AvatarStyle = ${JSON.stringify(get("AvatarStyle"))}, PlayerNameStyle = ${JSON.stringify(get("PlayerNameStyle"))}`);
      }
    }
  }
  const ft = doc.tables.find((t: any) => t.name === "Features");
  if (ft) {
    const pb = ft.entries.find((e: any) => e.key === "ProfileBadgesGFF");
    if (pb) {
      const core = pb.value.find((c: any) => c[0] === "Core");
      const owned = core?.[1][1].find((c: any) => c[0] === "OwnedBadges")?.[1][1] ?? [];
      const ciphers = owned.map((r: any) => r[1].find((c: any) => c[0] === "badgeId")?.[1][1]);
      console.log(`  OwnedBadges (${ciphers.length}): ${ciphers.map((c: string) => String(c).slice(0, 12)).join(", ")}`);
      console.log(`  worn ∈ owned: ${worn ? ciphers.includes(worn) : "?"}`);
    }
    // Titles: does ExpeditionTitlesGFF hold an earned/owned list?
    const et = ft.entries.find((e: any) => e.key === "ExpeditionTitlesGFF");
    if (et) {
      const walk = (v: any, p: string, depth: number): void => {
        if (depth > 3 || !Array.isArray(v)) return;
        if (v.length === 2 && typeof v[0] === "string") {
          const s2 = v[1];
          if (Array.isArray(s2) && s2.length === 2 && typeof s2[0] === "string") {
            console.log(`  ExpeditionTitlesGFF.${p}.${v[0]} [${s2[0]}] = ${JSON.stringify(s2[1]).slice(0, 140)}`);
            walk(s2[1], `${p}.${v[0]}`, depth + 1);
            return;
          }
          walk(s2, p, depth);
          return;
        }
        for (const x of v) walk(x, p, depth);
      };
      walk(et.value, "", 0);
    } else {
      console.log(`  ExpeditionTitlesGFF: <absent>`);
    }
  }
}
