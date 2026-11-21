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
  "spentStars",
  "GardenCurrentChapterId",
  "name",
  "dogname",
  "horse_name",
  "realCoins",
  "tokens",
  "lives",
  "expedition_energy",
  "LastPlayedLevel",
  "LastLevelAttempt",
  "PlayerId",
  "gameId",
];

const TABLE = "TableName";
const ENTRY = "Properties";

/** The ONLY fields this tool may ever write through the stats path. */
const WRITABLE = new Set<string>(HEAD);

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
 * Write a batch of Properties edits. A key the save does not hold is reported
 * in `missing` rather than created — Properties is a closed set the game
 * validates on load.
 */
export function writeStats(s: GardenscapesSession, changes: Record<string, number | string | boolean>): EditResult {
  const missing: string[] = [];
  const ops: EditOp[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (!WRITABLE.has(key)) {
      missing.push(`${TABLE}.${ENTRY}.${key}`);
      continue;
    }
    ops.push({ path: `${TABLE}.${ENTRY}.${key}`, value });
  }
  if (!ops.length) return { changed: [], missing };
  const res = applyOps(s.decoded.doc, ops);
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
