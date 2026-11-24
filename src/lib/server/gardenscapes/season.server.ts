// Seasons / golden pass — `SpecialEvents.SeasonNN`.
//
// Measured shape (mined GameData.db, Season58 = 229 children):
//   Purchases.GoldPass.BoughtCount (i)
//   FreeStage.0..30 / GoldStage.0..30 — each {Collected t|f, CollectingTime i,
//   LastItemState s ("Claim" | "Collected" | "UnlockedNotReached")}
//   …and the SAME three fields mirrored as flat top-level keys on the season
//   object itself (`FreeStage.0.Collected`, `GoldStage.30.LastItemState`, …).
//   Score.{CurrentValue, TotalValue} (i)
//   Stages.{Threshold.0..30, ThresholdCount, SafeRequiredScore, WasActive}
//
// A stage write therefore goes to the nested copy and — when the save holds
// one — to the flat mirror too. Leaving one copy stale would be a save that
// disagrees with itself about a stage state in a field the game reads for
// free. The flat mirror is only ever *updated*, never created: a season that
// ships no flat keys gains none.

import {
  findEntry,
  findTable,
  getRef,
  objFind,
  objPut,
  toInt,
  type ObjChild,
} from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { applyOps, entry as entryOf, type EditOp, type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";

const TABLE = "SpecialEvents";

export type GsStageTrack = "free" | "gold";

export interface GsSeasonInfo {
  /** Entry key, e.g. `Season58`. */
  key: string;
  goldPassBought: number;
  score: number;
  scoreTotal: number;
  freeCollected: number;
  goldCollected: number;
  /** Stage slots the save actually holds (31 on the measured season). */
  stages: number;
}

function trackName(track: GsStageTrack): "FreeStage" | "GoldStage" {
  return track === "free" ? "FreeStage" : "GoldStage";
}

/** The season entry, or throw — a season the save does not hold is never created. */
function requireSeason(d: AUDBDocument, season: string): AUDBEntry {
  if (!/^Season\d+$/.test(season)) throw new Error(`season: bad key "${season}"`);
  const e = entryOf(d, TABLE, season);
  if (!e || e.type !== "o") throw new Error(`season: save has no ${season}`);
  return e;
}

function countCollected(e: AUDBEntry, track: "FreeStage" | "GoldStage"): number {
  const ref = getRef(e, track);
  if (!ref || ref.type !== "o") return 0;
  let n = 0;
  for (const [, [t, v]] of ref.value as Array<[string, [string, unknown]]>) {
    if (t !== "o") continue;
    const kids = v as Array<[string, [string, unknown]]>;
    const c = kids.find(([k]) => k === "Collected");
    if (c && (c[1][0] === "t" || c[1][1] === true)) n++;
  }
  return n;
}

function stageCount(e: AUDBEntry, track: "FreeStage" | "GoldStage"): number {
  const ref = getRef(e, track);
  if (!ref || ref.type !== "o") return 0;
  return (ref.value as unknown[]).length;
}

/** Every `SeasonNN` entry the save holds, in document order. */
export function listSeasons(s: GardenscapesSession): GsSeasonInfo[] {
  const d: AUDBDocument = s.decoded.doc;
  const t = findTable(d, TABLE);
  if (!t) return [];
  const out: GsSeasonInfo[] = [];
  for (const e of t.entries) {
    if (!/^Season\d+$/.test(e.key) || e.type !== "o") continue;
    const bought = toInt(getRef(e, "Purchases.GoldPass.BoughtCount")?.value ?? null) ?? 0;
    const score = toInt(getRef(e, "Score.CurrentValue")?.value ?? null) ?? 0;
    const total = toInt(getRef(e, "Score.TotalValue")?.value ?? null) ?? 0;
    out.push({
      key: e.key,
      goldPassBought: bought,
      score,
      scoreTotal: total,
      freeCollected: countCollected(e, "FreeStage"),
      goldCollected: countCollected(e, "GoldStage"),
      stages: stageCount(e, "FreeStage"),
    });
  }
  return out;
}

/** Gold pass purchase flag: `Purchases.GoldPass.BoughtCount` 1 / 0. */
export function setGoldPass(s: GardenscapesSession, season: string, bought: boolean): EditResult {
  requireSeason(s.decoded.doc, season);
  const res = applyOps(s.decoded.doc, [
    { path: `${TABLE}.${season}.Purchases.GoldPass.BoughtCount`, value: bought ? 1 : 0 },
  ]);
  if (res.changed.length) s.log.push(`Season: ${season} gold pass ${bought ? "on" : "off"}`);
  return res;
}

/**
 * Season score. `CurrentValue` and `TotalValue` move together — a current
 * above the total is a pair no real save holds. The total may be raised but
 * never dropped below what the save already had unless the caller states it.
 */
export function setScore(
  s: GardenscapesSession,
  season: string,
  current: number,
  total?: number,
): EditResult {
  requireSeason(s.decoded.doc, season);
  if (!Number.isFinite(current) || current < 0) throw new Error("season: score must be >= 0");
  const e = entryOf(s.decoded.doc, TABLE, season)!;
  const oldTotal = toInt(getRef(e, "Score.TotalValue")?.value ?? null) ?? 0;
  const wantTotal = Math.max(Math.floor(current), Math.floor(total ?? oldTotal));
  const res = applyOps(s.decoded.doc, [
    { path: `${TABLE}.${season}.Score.CurrentValue`, value: Math.floor(current) },
    { path: `${TABLE}.${season}.Score.TotalValue`, value: wantTotal },
  ]);
  if (res.changed.length) s.log.push(`Season: ${season} score ${Math.floor(current)}/${wantTotal}`);
  return res;
}

/**
 * One stage's collect state. Writes the nested triple and mirrors it onto the
 * flat top-level keys when the season carries them.
 */
export function setStage(
  s: GardenscapesSession,
  season: string,
  track: GsStageTrack,
  index: number,
  collected: boolean,
): EditResult {
  const d = s.decoded.doc;
  const e = requireSeason(d, season);
  const tn = trackName(track);
  if (!Number.isInteger(index) || index < 0 || index >= stageCount(e, tn)) {
    throw new Error(`season: stage ${index} out of range for ${season}.${tn}`);
  }
  const state = collected ? "Claim" : "UnlockedNotReached";
  const ops: EditOp[] = [
    { path: `${TABLE}.${season}.${tn}.${index}.Collected`, value: collected },
    { path: `${TABLE}.${season}.${tn}.${index}.LastItemState`, value: state },
    { path: `${TABLE}.${season}.${tn}.${index}.CollectingTime`, value: 0 },
  ];
  const res = applyOps(d, ops);
  // Flat mirror — only keys the save already holds.
  for (const field of ["Collected", "LastItemState", "CollectingTime"]) {
    const flat = `${tn}.${index}.${field}`;
    if (objFind(e, flat) === undefined) continue;
    const ref = getRef(e, `${tn}.${index}.${field}`);
    if (ref) objPut(e, flat, ref.type, ref.value);
  }
  if (res.changed.length) s.log.push(`Season: ${season} ${tn}.${index} ${state}`);
  return res;
}

/** Flip every stage slot of a track (or both tracks) to collected / not. */
export function setAllStages(
  s: GardenscapesSession,
  season: string,
  track: GsStageTrack | "both",
  collected: boolean,
): EditResult {
  const d = s.decoded.doc;
  const e = requireSeason(d, season);
  const tracks: GsStageTrack[] = track === "both" ? ["free", "gold"] : [track];
  const changed: string[] = [];
  const missing: string[] = [];
  for (const tr of tracks) {
    const tn = trackName(tr);
    const n = stageCount(e, tn);
    for (let i = 0; i < n; i++) {
      const r = setStage(s, season, tr, i, collected);
      changed.push(...r.changed);
      missing.push(...r.missing);
    }
  }
  s.log.push(`Season: ${season} ${track} stages -> ${collected ? "collected" : "reset"}`);
  return { changed, missing };
}

/** Highest `Stages.Threshold.N` the season declares (0 when it states none). */
function maxThreshold(e: AUDBEntry): number {
  const ref = getRef(e, "Stages");
  if (!ref || ref.type !== "o") return 0;
  let max = 0;
  for (const [k, [t, v]] of ref.value as ObjChild[]) {
    if (t !== "i" || !/^Threshold\.\d+$/.test(k)) continue;
    max = Math.max(max, toInt(v) ?? 0);
  }
  return max;
}

/**
 * Unlock the whole pass: raise the score to the last threshold the season
 * declares, then leave every slot on BOTH roads *claimable*.
 *
 * Writing `Collected = true` was the mistake — the game pays a reward out when
 * it processes the claim, so a save that arrives already marked collected
 * shows green ticks and hands over nothing. `LastItemState = "Claim"` is the
 * state a reached-but-unclaimed slot carries, which is what puts every reward
 * on screen with its claim button.
 */
export function claimAllStages(s: GardenscapesSession, season: string): EditResult {
  const d = s.decoded.doc;
  const e = requireSeason(d, season);
  const changed: string[] = [];
  const missing: string[] = [];
  const score = Math.max(
    maxThreshold(e),
    toInt(getRef(e, "Score.CurrentValue")?.value ?? null) ?? 0,
    toInt(getRef(e, "Score.TotalValue")?.value ?? null) ?? 0,
  );
  if (score > 0) {
    const r = setScore(s, season, score, score);
    changed.push(...r.changed);
    missing.push(...r.missing);
  }
  for (const tr of ["free", "gold"] as const) {
    const tn = trackName(tr);
    const n = stageCount(e, tn);
    if (n === 0) continue;
    const ops: EditOp[] = [];
    for (let i = 0; i < n; i++) {
      ops.push({ path: `${TABLE}.${season}.${tn}.${i}.Collected`, value: false });
      ops.push({ path: `${TABLE}.${season}.${tn}.${i}.LastItemState`, value: "Claim" });
      ops.push({ path: `${TABLE}.${season}.${tn}.${i}.CollectingTime`, value: 0 });
    }
    const res = applyOps(d, ops);
    changed.push(...res.changed);
    missing.push(...res.missing);
    // Cursor keys: open the pass at the start with every slot unlocked.
    const counters: Array<[string, number]> = [
      ["CachedFirstLockedStageIndex", -1],
      ["LastCollectedIndex", -1],
      ["LastStage", 0],
      ["LastProgressValue", score],
      ["ProgressBarIndex", 0],
      ["LastCounterUncollectedRewards", n],
      ["SafeCurrentScore", score],
      ["SafeGlobalScore", score],
    ];
    const cOps: EditOp[] = [];
    for (const [k, v] of counters) {
      if (getRef(e, k)) cOps.push({ path: `${TABLE}.${season}.${k}`, value: v });
    }
    if (cOps.length) changed.push(...applyOps(d, cOps).changed);
  }
  // The golden row is a PURCHASE FLAG, not a stage state: every real
  // "Activated" pass carries `Purchases.GoldPass.BoughtCount = 1`, and stage
  // writes alone leave the premium road locked. Activate the pass here so one
  // press puts both roads on screen with working claim buttons.
  if ((toInt(getRef(e, "Purchases.GoldPass.BoughtCount")?.value ?? null) ?? 0) !== 1) {
    const gp = applyOps(d, [
      { path: `${TABLE}.${season}.Purchases.GoldPass.BoughtCount`, value: 1 },
    ]);
    changed.push(...gp.changed);
    missing.push(...gp.missing);
  }
  if (changed.length) s.log.push(`Season: ${season} garden pass unlocked (score ${score})`);
  return { changed, missing };
}

/** Claim every season the save holds in one pass. */
export function claimAllSeasons(s: GardenscapesSession): EditResult {
  const changed: string[] = [];
  const missing: string[] = [];
  const seasons = listSeasons(s);
  for (const season of seasons) {
    if (season.stages === 0) continue;
    const r = claimAllStages(s, season.key);
    changed.push(...r.changed);
    missing.push(...r.missing);
  }
  return { changed, missing };
}

/** Read one season's stage row for the UI. */
export function readStages(
  s: GardenscapesSession,
  season: string,
  track: GsStageTrack,
): Array<{ index: number; collected: boolean; state: string }> {
  const e = requireSeason(s.decoded.doc, season);
  const tn = trackName(track);
  const n = stageCount(e, tn);
  const out: Array<{ index: number; collected: boolean; state: string }> = [];
  for (let i = 0; i < n; i++) {
    const c = getRef(e, `${tn}.${i}.Collected`);
    const st = getRef(e, `${tn}.${i}.LastItemState`);
    out.push({
      index: i,
      collected: c?.type === "t" || c?.value === true,
      state: typeof st?.value === "string" ? st.value : "",
    });
  }
  return out;
}

export type { AUDBDocument };
