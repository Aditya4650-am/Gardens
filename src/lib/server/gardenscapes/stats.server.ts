// Data Center — every scalar field the save actually holds.
//
// The tab lists the whole `TableName.Properties` object (737 keys on the
// measured save) rather than a hand-picked dozen: a counter the game writes is
// a counter the user may want to edit, and a curated allow-list is exactly the
// "only some items were collected" failure this repo exists to avoid. The
// well-known fields are only *ordered* first, never filtered to.

import {
  findEntry,
  findTable,
  getRef,
  objEntries,
  toInt,
  type ObjChild,
} from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument } from "@/lib/gardenscapes/codec";
import { applyOps, type EditOp, type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";

export interface StatField {
  /** Path used by the UI: `TableName.Properties.<key>` */
  path: string;
  key: string;
  type: string;
  value: number | string | boolean | null;
}

/** Shown first because they are what a player recognises; still just ordering. */
const HEAD = [
  "coins",
  "level",
  "earnedStars",
  "GardenCurrentChapterId",
  "name",
  "dogname",
  "horse_name",
  "LastPlayedLevel",
];

/**
 * Profile screen counters, stored as strings under
 * `PlayerProfileOwn.OwnProfile.ProfileValues.Main`.
 *
 * `WinStreak` = Current Streak, `LivesSent` = Helps Made,
 * `CollectionsCompleted` = Collections Done, `FirstTryWins` = First Try Wins.
 * "Helps Received" has no field in any save — it is server-side only.
 */
const PROFILE = ["WinStreak", "LivesSent", "CollectionsCompleted", "FirstTryWins"] as const;
const PROFILE_PATH = "SpecialEvents.PlayerProfileOwn.OwnProfile.ProfileValues.Main";

const TABLE = "TableName";
const ENTRY = "Properties";

/**
 * Alternate spellings different builds use for the same counter. The Vietnam
 * build (and some save revisions) rename a few of these, so a write resolves
 * through its family before giving up.
 */
const KEY_ALIASES: Record<string, string[]> = {
  coins: ["coins", "coin", "money", "cash"],
  level: ["level", "levelup", "level_up", "playerlevel", "player_level", "currentlevel"],
  earnedStars: [
    "earnedStars",
    "earned_stars",
    "stars",
    "totalstars",
    "total_stars",
    "starscount",
    "stars_count",
  ],
  name: ["name", "playername", "player_name", "username"],
  LastPlayedLevel: ["LastPlayedLevel", "lastplayedlevel", "last_played_level"],
};

/** Types that hold a single writable value (never objects/arrays). */
const SCALAR_TYPES = new Set(["i", "s", "f", "d", "k", "g", "u", "t", "b"]);

function plain(v: unknown): number | string | boolean | null {
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (v === null) return null;
  if (typeof v === "bigint") return Number(v);
  // Objects/arrays are shown as a count rather than JSON so the row stays
  // readable; they are not scalar-editable from this tab.
  if (Array.isArray(v)) return `${v.length} items`;
  if (typeof v === "object") return `${Object.keys(v as object).length} keys`;
  return String(v);
}

/** Every scalar in Properties, well-known fields first. */
export function readStats(s: GardenscapesSession): StatField[] {
  const d: AUDBDocument = s.decoded.doc;
  const t = findTable(d, TABLE);
  const e = t ? findEntry(t, ENTRY) : undefined;
  if (!e || e.type !== "o") return [];
  const kids: ObjChild[] = objEntries(e);

  const out: StatField[] = [];
  const seen = new Set<string>();
  for (const key of HEAD) {
    const hit = kids.find(([k]) => k === key);
    if (!hit) continue;
    seen.add(key);
    out.push({
      path: `${TABLE}.${ENTRY}.${key}`,
      key,
      type: hit[1][0],
      value: plain(hit[1][1]),
    });
  }
  // Profile-screen counters (stored as strings under ProfileValues.Main).
  const sp = findTable(d, "SpecialEvents");
  const ownEntry = sp ? findEntry(sp, "PlayerProfileOwn") : undefined;
  const pvRef = ownEntry ? getRef(ownEntry, "OwnProfile.ProfileValues.Main") : null;
  if (pvRef && pvRef.type === "o") {
    const pvKids = objEntries({ key: "Main", type: "o", value: pvRef.value });
    for (const key of PROFILE) {
      const hit = pvKids.find(([k]) => k === key);
      if (!hit) continue;
      const raw = hit[1][1];
      out.push({
        path: `${PROFILE_PATH}.${key}`,
        key,
        type: "s",
        value: typeof raw === "string" && /^-?\d+$/.test(raw) ? Number(raw) : plain(raw),
      });
    }
  }
  for (const [key, [type, value]] of kids) {
    if (seen.has(key)) continue;
    out.push({ path: `${TABLE}.${ENTRY}.${key}`, key, type, value: plain(value) });
  }
  return out;
}

/** Scalar field lookup used by the dashboard cards. */
export function readStat(s: GardenscapesSession, key: string): number | string | boolean | null {
  const d = s.decoded.doc;
  const t = findTable(d, TABLE);
  const e = t ? findEntry(t, ENTRY) : undefined;
  if (!e || e.type !== "o") return null;
  const hit = objEntries(e).find(([k]) => k === key);
  return hit ? plain(hit[1][1]) : null;
}

/**
 * Write a batch of Properties edits.
 *
 * Resolution is build-tolerant: an exact key wins, then a case-insensitive
 * match, then the alias family (the Vietnam build renames a few counters).
 * Only keys the save ALREADY holds are ever written — Properties is a closed
 * set the game validates on load — and only scalar fields, so a collection is
 * never replaced by a number. Anything unresolvable is reported in `missing`
 * rather than invented.
 */
export function writeStats(s: GardenscapesSession, changes: Record<string, number | string | boolean>): EditResult {
  const d = s.decoded.doc;
  const t = findTable(d, TABLE);
  const e = t ? findEntry(t, ENTRY) : undefined;
  if (!e || e.type !== "o") {
    return { changed: [], missing: Object.keys(changes).map((k) => `${TABLE}.${ENTRY}.${k}`) };
  }
  const kids = objEntries(e);
  const byLower = new Map<string, string>();
  for (const [k] of kids) if (!byLower.has(k.toLowerCase())) byLower.set(k.toLowerCase(), k);

  const resolve = (want: string): string | null => {
    if (kids.some(([k]) => k === want)) return want;
    const lower = want.toLowerCase();
    const ci = byLower.get(lower);
    if (ci) return ci;
    for (const family of Object.values(KEY_ALIASES)) {
      if (!family.some((alias) => alias.toLowerCase() === lower)) continue;
      for (const alias of family) {
        const hit = byLower.get(alias.toLowerCase());
        if (hit) return hit;
      }
    }
    return null;
  };

  const missing: string[] = [];
  const ops: EditOp[] = [];
  for (const [requested, value] of Object.entries(changes)) {
    if ((PROFILE as readonly string[]).includes(requested)) {
      // ProfileValues are stored as strings, exactly as the game writes them.
      ops.push({ path: `${PROFILE_PATH}.${requested}`, value: String(value) });
      continue;
    }
    const key = resolve(requested);
    const hit = key ? kids.find(([k]) => k === key) : undefined;
    if (!key || !hit || !SCALAR_TYPES.has(hit[1][0])) {
      missing.push(`${TABLE}.${ENTRY}.${requested}`);
      continue;
    }
    ops.push({ path: `${TABLE}.${ENTRY}.${key}`, value });
  }
  if (!ops.length) return { changed: [], missing };
  const res = applyOps(d, ops);
  if (res.changed.length) s.log.push(`Stats: ${res.changed.length} field(s) changed`);
  return { changed: res.changed, missing: [...missing, ...res.missing] };
}

/**
 * Lives and expedition energy are `{current, max}` objects, not scalars, so
 * they get their own writer: raising `max` without `current` leaves a save
 * that disagrees with itself in a field the game reads for free.
 */
export function writePair(
  s: GardenscapesSession,
  key: "lives" | "expedition_energy",
  current: number,
  max: number,
): EditResult {
  if (!Number.isFinite(current) || !Number.isFinite(max)) throw new Error(`${key}: numbers required`);
  if (current < 0 || max < 0) throw new Error(`${key}: values cannot be negative`);
  const ops: EditOp[] = [
    { path: `${TABLE}.${ENTRY}.${key}.current`, value: Math.floor(current) },
    { path: `${TABLE}.${ENTRY}.${key}.max`, value: Math.floor(max) },
  ];
  const res = applyOps(s.decoded.doc, ops);
  if (res.changed.length) s.log.push(`${key}: ${Math.floor(current)}/${Math.floor(max)}`);
  return res;
}

/** Read a `{current, max}` pair. */
export function readPair(
  s: GardenscapesSession,
  key: "lives" | "expedition_energy",
): { current: number; max: number } | null {
  const d = s.decoded.doc;
  const t = findTable(d, TABLE);
  const e = t ? findEntry(t, ENTRY) : undefined;
  if (!e || e.type !== "o") return null;
  const hit = objEntries(e).find(([k]) => k === key);
  if (!hit || hit[1][0] !== "o") return null;
  const inner = objEntries({ key, type: "o", value: hit[1][1] });
  const cur = toInt(getRef({ key, type: "o", value: hit[1][1] }, "current")?.value ?? null);
  const max = toInt(getRef({ key, type: "o", value: hit[1][1] }, "max")?.value ?? null);
  if (cur === null && max === null && inner.length === 0) return null;
  return { current: cur ?? 0, max: max ?? 0 };
}
