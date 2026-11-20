// Account clone — put the bundled account's garden onto any connected client.
//
// The design is the one proven clean in the Homescapes tool: transplant
// **content**, never **progress**.
//
// Content that travels
//   repairs                     every garden chapter / decoration step
//   repairs_purchases_info      the decor purchases behind them
//   CharacterProperties         the characters and pets in the garden
//   cosmetic profile lists      avatars, frames/styles, badges, titles
//   the worn look               AvatarStyle / PlayerNameStyle / title / badge
//
// Progress that deliberately stays on the client
//   level, XP, coins, tokens, earned/spent stars, name, ids, lives, boosters,
//   card collections, season passes, quests, statistics
//
// Nothing identity-bearing is ever written: the clone only touches tables and
// keys whose values are the same for every account. That is also why there is
// no identity scrubber here — the donor's cityId / PlayerId / gameId / name /
// device id simply never enter the target.
//
// Optional, off by default: copy level, coins and stars, bounded exactly like
// the Homescapes tool (coins clamped below 2e9, a +200 level jump called out).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeSave, findEntry, findTable, objEntries, type ObjChild } from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";

const CONTENT_TABLES = ["repairs", "repairs_purchases_info", "CharacterProperties"] as const;
const CONTENT_FEATURE_ENTRIES = ["ProfileBadgesGFF"] as const;
const PROP_PREFIXES = ["BoughtAvatar_", "ObtainedStyle_", "UserAvatar_", "UserNameStyle_"] as const;
const OWN_CONTENT = ["AvatarStyle", "PlayerNameStyle", "PlayerTitleId", "PlayerTitleIdsEarned", "ProfileBadgeId"] as const;
const PROGRESS_LEAVES = ["level", "coins", "earnedStars", "spentStars"] as const;
const COIN_CEILING = 2_000_000_000;
const LEVEL_JUMP_WARN = 200;

export interface GsCloneInfo {
  donorName: string;
  donorLevel: number;
  chapters: number;
  purchases: number;
  characters: number;
  avatars: number;
}

export interface GsCloneResult extends EditResult {
  /** What actually landed, for the log. */
  cloned: string[];
  progress: string[];
  warnings: string[];
}

let donorCache: AUDBDocument | null = null;

function donorPath(): string {
  const candidates = [
    join(process.cwd(), "data", "gardens-account.db"),
    join(process.cwd(), "..", "data", "gardens-account.db"),
    join(process.cwd(), "client", "data", "gardens-account.db"),
  ];
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error("clone: bundled account is missing (data/gardens-account.db)");
  return hit;
}

function donor(): AUDBDocument {
  if (!donorCache) donorCache = decodeSave(readFileSync(donorPath())).doc;
  return donorCache;
}

function deepClone<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => deepClone(x)) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) out[k] = deepClone((v as Record<string, unknown>)[k]);
    return out as T;
  }
  return v;
}

function entry(d: AUDBDocument, table: string, key: string): AUDBEntry | undefined {
  const t = findTable(d, table);
  return t ? findEntry(t, key) : undefined;
}

function propTable(d: AUDBDocument): AUDBEntry | undefined {
  return entry(d, "TableName", "Properties");
}

function propGet(d: AUDBDocument, key: string): unknown {
  const p = propTable(d);
  const hit = p && p.type === "o" ? objEntries(p).find(([k]) => k === key) : undefined;
  return hit?.[1][1];
}

/** Donor facts for the panel. */
export function cloneInfo(): GsCloneInfo {
  const d = donor();
  const chapters = findTable(d, "repairs")?.entries.length ?? 0;
  const purchases = findTable(d, "repairs_purchases_info")?.entries.length ?? 0;
  const characters = findTable(d, "CharacterProperties")?.entries.length ?? 0;
  const p = propTable(d);
  const avatars = p && p.type === "o" ? objEntries(p).filter(([k, [t, v]]) => t === "t" && v === true && k.startsWith("BoughtAvatar_")).length : 0;
  return {
    donorName: String(propGet(d, "name") ?? "Garden"),
    donorLevel: Number(propGet(d, "level") ?? 0),
    chapters,
    purchases,
    characters,
    avatars,
  };
}

/**
 * Apply the clone to a session. `withProgress` is the optional opt-in; the
 * default carries content only.
 */
export function applyClone(
  s: GardenscapesSession,
  opts: { withProgress?: boolean } = {},
): GsCloneResult {
  const src = donor();
  const dst = s.decoded.doc;
  const cloned: string[] = [];
  const progress: string[] = [];
  const warnings: string[] = [];

  // 1. Whole content tables.
  for (const name of CONTENT_TABLES) {
    const st = findTable(src, name);
    const dt = findTable(dst, name);
    if (!st || !dt) continue;
    dt.entries = deepClone(st.entries);
    cloned.push(`${name} (${st.entries.length})`);
  }

  // 2. Cosmetic profile lists inside TableName.Properties (never identity).
  const sp = propTable(src);
  const dp = propTable(dst);
  if (sp && sp.type === "o" && dp && dp.type === "o") {
    const kids = objEntries(dp);
    let n = 0;
    for (const [k, [t, v]] of objEntries(sp)) {
      if (!PROP_PREFIXES.some((pre) => k.startsWith(pre))) continue;
      const hit = kids.find(([kk]) => kk === k);
      if (hit) hit[1] = [t, deepClone(v)];
      else kids.push([k, [t, deepClone(v)]]);
      n++;
    }
    if (n) cloned.push(`cosmetics (${n})`);
  }

  // 3. Owned badges.
  for (const name of CONTENT_FEATURE_ENTRIES) {
    const se = entry(src, "Features", name);
    const de = entry(dst, "Features", name);
    if (!se || !de) continue;
    de.value = deepClone(se.value);
    cloned.push(name);
  }

  // 4. The worn look (not identity: every account can wear any of these).
  const sOwn = entry(src, "SpecialEvents", "PlayerProfileOwn");
  const dOwn = entry(dst, "SpecialEvents", "PlayerProfileOwn");
  if (sOwn && dOwn) {
    const sk = (o: AUDBEntry): ObjChild[] => {
      const ref = (o.value as ObjChild[]).find(([k]) => k === "OwnProfile");
      return ref && ref[1][0] === "o" ? (ref[1][1] as ObjChild[]) : [];
    };
    const sKids = sk(sOwn);
    const dKids = sk(dOwn);
    for (const key of OWN_CONTENT) {
      const hit = sKids.find(([k]) => k === key);
      if (!hit || typeof hit[1][1] !== "string") continue;
      const tgt = dKids.find(([k]) => k === key);
      if (tgt) tgt[1] = ["s", hit[1][1]];
      else dKids.push([key, ["s", hit[1][1]]]);
    }
  }

  // 5. Optional, bounded progression.
  if (opts.withProgress) {
    const dp2 = propTable(dst);
    if (dp2 && dp2.type === "o") {
      const kids = objEntries(dp2);
      for (const key of PROGRESS_LEAVES) {
        const from = propGet(src, key);
        if (typeof from !== "number") continue;
        let value = from;
        if (key === "coins") value = Math.min(value, COIN_CEILING - 1);
        const hit = kids.find(([k]) => k === key);
        const before = hit ? Number(hit[1][1]) : 0;
        if (key === "level" && value - before > LEVEL_JUMP_WARN) {
          warnings.push(`level ${before} → ${value} is a ${value - before} jump`);
        }
        if (hit) hit[1] = ["i", Math.trunc(value)];
        else kids.push([key, ["i", Math.trunc(value)]]);
        progress.push(`${key} ${before} → ${Math.trunc(value)}`);
      }
    }
  }

  s.log.push(`Clone: ${cloned.length} content root(s) from the bundled account`);
  for (const p of progress) s.log.push(`Clone: ${p}`);
  return { changed: cloned, missing: [], cloned, progress, warnings };
}
