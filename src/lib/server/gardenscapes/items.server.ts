// Boosters / items — the `items` table.
//
// Measured shape: exactly 10 int entries at top level, no nesting —
//   AdditionalMoves, BombsBoost, CrossBonus, DynamiteAndLightningBoost,
//   FanBoost, GloveBonus, HammerBonus, LightningBoost, LineHorBoost,
//   LineVertBoost
// (mined GameData.db: BombsBoost=1893, LightningBoost=1704, …).
//
// The Data Center tab already exposes these through `TableName.Properties`
// only where a save duplicates them; the canonical home the game reads for
// booster counts is this table, so the Boosters tab writes here. A key the
// save does not hold is reported, never created — 10 is the measured set.

import { findTable, toInt } from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument } from "@/lib/gardenscapes/codec";
import { applyOps, type EditOp, type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";

const TABLE = "items";

/** The 10 booster keys, in the order the game writes them. */
export const GS_BOOSTER_KEYS = [
  "AdditionalMoves",
  "BombsBoost",
  "CrossBonus",
  "DynamiteAndLightningBoost",
  "FanBoost",
  "GloveBonus",
  "HammerBonus",
  "LightningBoost",
  "LineHorBoost",
  "LineVertBoost",
] as const;

export type GsBoosterKey = (typeof GS_BOOSTER_KEYS)[number];

export interface GsBooster {
  key: string;
  value: number;
}

/** Every booster the save holds. */
export function readItems(s: GardenscapesSession): GsBooster[] {
  const d: AUDBDocument = s.decoded.doc;
  const t = findTable(d, TABLE);
  if (!t) return [];
  return t.entries.map((e) => ({ key: e.key, value: toInt(e.value) ?? 0 }));
}

/** Write a batch of booster counts. Unknown keys land in `missing`. */
export function writeItems(
  s: GardenscapesSession,
  changes: Record<string, number>,
): EditResult {
  const ops: EditOp[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (!Number.isFinite(value)) throw new Error(`items: ${key} needs a number`);
    if (value < 0) throw new Error(`items: ${key} cannot be negative`);
    ops.push({ path: `${TABLE}.${key}`, value: Math.floor(value) });
  }
  const res = applyOps(s.decoded.doc, ops);
  if (res.changed.length) s.log.push(`Boosters: ${res.changed.length} changed`);
  return res;
}

/** Raise every booster the save holds to at least `min`. */
export function minItems(s: GardenscapesSession, min: number): EditResult {
  if (!Number.isFinite(min) || min < 0) throw new Error("items: min must be >= 0");
  const changes: Record<string, number> = {};
  for (const b of readItems(s)) if (b.value < Math.floor(min)) changes[b.key] = Math.floor(min);
  return writeItems(s, changes);
}

/** Set every booster the save holds to one value (the "fill all" button). */
export function fillItems(s: GardenscapesSession, value: number): EditResult {
  const changes: Record<string, number> = {};
  for (const b of readItems(s)) changes[b.key] = Math.floor(value);
  return writeItems(s, changes);
}
