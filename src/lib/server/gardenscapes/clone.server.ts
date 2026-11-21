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
import { decodeSave, ensureTable, findEntry, findTable, objEntries, type ObjChild } from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";

const CONTENT_TABLES = [
  "repairs",
  "repairs_purchases_info",
  "CharacterProperties",
  "Redesign",
  "main_pers_objects",
  "quest_targets",
] as const;
/**
 * Decor quests — `chBRO_day1_Decorate*`, `PlantLawn`, `PlaceLanterns` … the
 * completion half of `quest_targets`, exactly the `Quests` / `QuestTargets`
 * pair the Homescapes reference classifies as content behind `Repairs`.
 *
 * Merged rather than replaced: the donor's row wins on a shared id, but an id
 * only our save holds (a fresh account's `chTUT_Trash`) survives, so cloning
 * never deletes a task the game still has open.
 */
const MERGED_TABLES = ["quests", "history_data"] as const;
/**
 * Specific `SpecialEvents` rows the garden renders from.
 *
 * Measured: the donor carries `special_redesign` (`UsingRedesigns` — the
 * redesign themes this account has applied, plus `lastActiveRedesign`),
 * `RoomDesignVSO` and `GardenMeta`, and the device has **none** of the three.
 * These are named one by one rather than copying `SpecialEvents` wholesale:
 * that table also holds event counters, offers and analytics, and the whole of
 * it is progression the server scores — the same reason the Homescapes
 * reference lists `SpecialEvents` among its `PROGRESS_ROOTS`.
 */
const CONTENT_EVENT_ENTRIES = ["special_redesign", "RoomDesignVSO", "GardenMeta"] as const;
const CONTENT_FEATURE_ENTRIES = [
  "ProfileBadgesGFF",
  "LocationsRedesign",
  "RedesignCascade",
  "GardeningDuties",
] as const;
const PROP_PREFIXES = ["BoughtAvatar_", "ObtainedStyle_", "UserAvatar_", "UserNameStyle_"] as const;
/** Decoration economy — the redesign shop, not level/coins/stars. */
const DECOR_PROPS = [
  "boughtRoomTokens",
  "earnedRoomTokensCount",
  "spentRoomTokensCount",
  "realRoomTokens",
  "room_design_tokens",
  "coinsForDesign",
  "boughtClusterRedesignTokens",
  "earnedClusterRedesignTokensCount",
  "spentClusterRedesignTokensCount",
  "realClusterRedesignTokens",
  "RedesignManagerFinishingModeAVChapter",
  "RedesignManagerFinishingModeState",
  "ShowGardenMapButton",
  /** Which chapter's decoration set the garden renders. */
  "GardenCurrentChapterId",
] as const;
const OWN_CONTENT = ["AvatarStyle", "PlayerNameStyle", "PlayerTitleId", "PlayerTitleIdsEarned", "ProfileBadgeId"] as const;
const COIN_CEILING = 2_000_000_000;
/** A level move bigger than this is reported, never silently written. */
const LEVEL_JUMP_WARN = 200;

/**
 * Add the donor's share to ours — **idempotently**, and under `ceiling`.
 *
 * Returns the value to write, or `null` when nothing should move.
 *
 * Two rules in one number:
 *
 * - *Idempotent*: the add only happens while ours is still below what the
 *   donor contributes. Without this, pressing Clone again doubles the balance
 *   every time (measured: 1,083,397 → 2,165,784 → 4.3M), and a balance that
 *   doubles on each press is the shape a server reads for free. Once we hold
 *   at least the donor's share there is nothing left to add.
 * - *Bounded*: the sum is held under `ceiling`, which is the largest value
 *   the container round-trips safely.
 */
export function addBounded(ours: number, theirs: number, ceiling: number): number | null {
  if (!(theirs > 0) || !(ours < theirs)) return null;
  return Math.min(ours + theirs, ceiling - 1);
}

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

/** Region build flag — Vietnam clients refuse a save that says otherwise. */
export function setRegionBuild(s: GardenscapesSession, on: boolean): EditResult {
  const t = findTable(s.decoded.doc, "TableName");
  const p = t ? findEntry(t, "Properties") : undefined;
  if (!p || p.type !== "o") throw new Error("clone: save has no Properties");
  const hit = objEntries(p).find(([k]) => k === "vietnamBuild");
  if (!hit) throw new Error("clone: save has no vietnamBuild flag");
  if (hit[1][1] === on) return { changed: [], missing: [] };
  hit[1] = [on ? "t" : "f", on];
  s.log.push(`Region build: ${on ? "Vietnam" : "standard"}`);
  return { changed: ["TableName.Properties.vietnamBuild"], missing: [] };
}

/** Donor facts for the panel. */export function cloneInfo(): GsCloneInfo {
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

  // 1. Whole content tables. A root the target has never held is **created**,
  //    not skipped: the device save has no `Redesign` table at all, and
  //    skipping it is what left the cloned garden without its redesign state.
  //    (The Homescapes reference creates missing content roots for the same
  //    reason — a clone that quietly drops a root reports success and changes
  //    nothing in game.)
  for (const name of CONTENT_TABLES) {
    const st = findTable(src, name);
    if (!st) continue;
    const dt = ensureTable(dst, name);
    const created = dt.entries.length === 0;
    dt.entries = deepClone(st.entries);
    cloned.push(`${name} (${st.entries.length}${created ? ", new" : ""})`);
  }

  // 1b. Merged content tables — donor rows win, ours survive by id.
  for (const name of MERGED_TABLES) {
    const st = findTable(src, name);
    if (!st) continue;
    const dt = ensureTable(dst, name);
    let added = 0;
    for (const e of st.entries) {
      const hit = dt.entries.find((x) => x.key === e.key);
      if (hit) hit.value = deepClone(e.value);
      else {
        dt.entries.push(deepClone(e));
        added++;
      }
    }
    cloned.push(`${name} (${st.entries.length}, +${added} new)`);
  }

  // 1c. Named `SpecialEvents` rows the garden renders from.
  for (const key of CONTENT_EVENT_ENTRIES) {
    const st = findTable(src, "SpecialEvents");
    const se = st ? findEntry(st, key) : undefined;
    if (!se) continue;
    const dt = ensureTable(dst, "SpecialEvents");
    const hit = findEntry(dt, key);
    const fresh = !hit;
    if (hit) hit.value = deepClone(se.value);
    else dt.entries.push(deepClone(se));
    cloned.push(`SpecialEvents.${key}${fresh ? " (new)" : ""}`);
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
    // Decoration economy leaves, copied as-is so the redesign shop matches.
    for (const key of DECOR_PROPS) {
      const from = objEntries(sp).find(([k]) => k === key);
      if (!from) continue;
      const hit = kids.find(([k]) => k === key);
      if (hit) hit[1] = [from[1][0], deepClone(from[1][1])];
      else kids.push([key, [from[1][0], deepClone(from[1][1])]]);
      n++;
    }
    if (n) cloned.push(`cosmetics + decor (${n})`);
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

  // 5. Optional progression — **added**, never replacing what we already have.
  //
  // The rule comes from the request behind this option: keep *some of ours*
  // alongside the donor's, so nothing the account already earned is lost.
  // Taking their numbers outright would write their balances over ours. What
  // travels is exactly the three the operator asked for — level, coins, stars
  // — each bounded (coins under the container ceiling, the level jump reported)
  // and each landing on top of our own rather than in place of it. Every other
  // progress leaf (XP, lives, statistics, ids) stays exactly as loaded, and
  // nothing identity-bearing is ever written.
  if (opts.withProgress) {
    const dp2 = propTable(dst);
    if (dp2 && dp2.type === "o") {
      const kids = objEntries(dp2);
      const write = (key: string, before: number, value: number): void => {
        const hit = kids.find(([k]) => k === key);
        if (hit) hit[1] = ["i", Math.trunc(value)];
        else kids.push([key, ["i", Math.trunc(value)]]);
        progress.push(`${key} ${before} → ${Math.trunc(value)}`);
      };
      const num = (d: AUDBDocument, key: string): number => {
        const v = propGet(d, key);
        return typeof v === "number" ? v : 0;
      };

      // Coins: ours + theirs, idempotent and bounded — see `addBounded`.
      // Pressing Clone twice would otherwise double the balance every time
      // (measured: the first run took 1,083,397 → 2,165,784, the second would
      // have reached 4.3M), and a balance that doubles on each press is the
      // shape a server reads for free.
      const ourCoins = num(dst, "coins");
      const donorCoins = num(src, "coins");
      const coinTotal = addBounded(ourCoins, donorCoins, COIN_CEILING);
      if (coinTotal !== null) {
        if (coinTotal === COIN_CEILING - 1 && ourCoins + donorCoins >= COIN_CEILING) {
          warnings.push(`coins capped at ${COIN_CEILING - 1}`);
        }
        write("coins", ourCoins, coinTotal);
      }

      // Level: taken from the donor only when theirs is higher, and never
      // lowered. Gardenscapes has no XP counter to keep in step (measured —
      // the only `exp*` keys are cheat-time offsets), and level is driven by
      // stars, which this same block is raising, so the pair lands together
      // rather than a level appearing over an empty star count. The jump is
      // reported so the operator sees exactly what moved.
      const ourLevel = num(dst, "level");
      const donorLevel = num(src, "level");
      if (donorLevel > ourLevel) {
        if (donorLevel - ourLevel > LEVEL_JUMP_WARN) {
          warnings.push(`level ${ourLevel} → ${donorLevel} (a ${donorLevel - ourLevel} jump)`);
        }
        write("level", ourLevel, donorLevel);
      }

      // Stars: the donor's **net** stars (earned − spent, i.e. what their HUD
      // shows) are added to ours — under the same idempotency rule as coins,
      // so a repeat press adds nothing. Adding the raw earned counter instead
      // would import their spending history as free stars, and overwriting
      // spentStars would walk a lifetime counter backwards — both are pairs a
      // server reads without any history at all.
      const ourEarned = num(dst, "earnedStars");
      const donorNet = num(src, "earnedStars") - num(src, "spentStars");
      const starTotal = addBounded(ourEarned, donorNet, Number.MAX_SAFE_INTEGER);
      if (starTotal !== null) write("earnedStars", ourEarned, starTotal);
      // spentStars is deliberately untouched: it only ever grows in game.
    }
  }

  s.log.push(`Clone: ${cloned.length} content root(s) from the bundled account`);
  for (const p of progress) s.log.push(`Clone: ${p}`);
  return { changed: cloned, missing: [], cloned, progress, warnings };
}
