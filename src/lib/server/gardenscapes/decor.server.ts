// Decorations / repairs — `repairs` + `repairs_purchases_info` tables.
//
// Measured shape (mined GameData.db):
//   repairs: 60 entries (`chapter1` … `chapter60`, plus `*_redesign_chapter`).
//   A chapter is an object of `@completed` (t/f), `@opened` (t/f) and one child
//   per decor item: `{step}` | `{step, keep_step}` | `{step, keep_step,
//   base_step}` — the step values are *strings naming a stage* ("Christmas20",
//   "Clear", "empty", …). They are read-only here: no save in the corpus states
//   which string means "fully repaired" for an arbitrary item, and inventing one
//   is exactly the fabricated-shape failure this repo exists to avoid.
//   repairs_purchases_info: 7,556 entries keyed `chapter1,Paintings,frames`
//   (comma-separated, never dotted), each `{isBuy t|f}`.
//
// Writes are limited to the two chapter flags and `isBuy` — the fields real
// saves demonstrably flip.

import { findTable, getRef, toInt, type ObjChild } from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { applyOps, entry as entryOf, type EditOp, type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";

const TABLE = "repairs";
const PURCHASES = "repairs_purchases_info";

export interface GsDecorItem {
  name: string;
  step: string;
  keepStep: string | null;
  baseStep: string | null;
}

export interface GsChapterInfo {
  key: string;
  completed: boolean;
  opened: boolean;
  items: GsDecorItem[];
}

export interface GsPurchaseInfo {
  key: string;
  isBuy: boolean;
}

/** Keys are addressed by path, so a dotted key could never be written — skip it. */
function addressable(key: string): boolean {
  return key.length > 0 && !key.includes(".");
}

function boolAt(e: ReturnType<typeof entryOf>, path: string): boolean {
  const ref = e ? getRef(e, path) : null;
  return ref?.type === "t" || ref?.value === true;
}

/** Every chapter the save holds, with its items (steps shown, never written). */
export function listChapters(s: GardenscapesSession): GsChapterInfo[] {
  const d: AUDBDocument = s.decoded.doc;
  const t = findTable(d, TABLE);
  if (!t) return [];
  const out: GsChapterInfo[] = [];
  for (const e of t.entries) {
    if (e.type !== "o" || !addressable(e.key)) continue;
    const items: GsDecorItem[] = [];
    const kids = e.value as Array<[string, [string, unknown]]>;
    for (const [name, [kt, kv]] of kids) {
      if (name === "@completed" || name === "@opened") continue;
      if (kt !== "o") continue;
      const fields = kv as Array<[string, [string, unknown]]>;
      const str = (k: string): string | null => {
        const hit = fields.find(([fk]) => fk === k);
        return hit && typeof hit[1][1] === "string" ? (hit[1][1] as string) : null;
      };
      items.push({ name, step: str("step") ?? "", keepStep: str("keep_step"), baseStep: str("base_step") });
    }
    out.push({
      key: e.key,
      completed: boolAt(e, "@completed"),
      opened: boolAt(e, "@opened"),
      items,
    });
  }
  return out;
}

/** Create or update one `t`/`f` flag on a chapter object. */
function putFlag(e: AUDBEntry, key: string, value: boolean): boolean {
  const kids = e.value as ObjChild[];
  const hit = kids.find(([k]) => k === key);
  const tag = value ? "t" : "f";
  if (hit) {
    if (hit[1][0] === tag && hit[1][1] === value) return false;
    hit[1] = [tag, value];
    return true;
  }
  kids.push([key, [tag, value]]);
  return true;
}

/** Flip a chapter's `@completed` / `@opened` flags. */
export function writeChapter(
  s: GardenscapesSession,
  key: string,
  patch: { completed?: boolean; opened?: boolean },
): EditResult {
  if (!addressable(key)) throw new Error(`decor: bad chapter key "${key}"`);
  const d = s.decoded.doc;
  const e = entryOf(d, TABLE, key);
  if (!e) throw new Error(`decor: save has no chapter "${key}"`);
  const changed: string[] = [];
  // The `*_redesign_chapter` entries carry no `@completed` at all, so an
  // applyOps write reported them "not found" — the flag is created here the
  // same `t`/`f` shape every other chapter uses.
  if (patch.completed !== undefined && putFlag(e, "@completed", patch.completed)) {
    changed.push(`${TABLE}.${key}.@completed`);
  }
  if (patch.opened !== undefined && putFlag(e, "@opened", patch.opened)) {
    changed.push(`${TABLE}.${key}.@opened`);
  }
  if (changed.length) s.log.push(`Decor: ${key} ${JSON.stringify(patch)}`);
  return { changed, missing: [] };
}

/** Complete (or reset) several chapters in one pass. */
export function writeChapters(
  s: GardenscapesSession,
  keys: string[],
  patch: { completed?: boolean; opened?: boolean },
): EditResult {
  const changed: string[] = [];
  const missing: string[] = [];
  for (const k of keys) {
    const r = writeChapter(s, k, patch);
    changed.push(...r.changed);
    missing.push(...r.missing);
  }
  return { changed, missing };
}

/**
 * Purchase rows, optionally filtered by key prefix (`chapter3` matches
 * `chapter3,Paintings,frames`). 7,556 rows exist — the full list is never
 * shipped to the UI at once.
 */
export function listPurchases(s: GardenscapesSession, prefix = ""): GsPurchaseInfo[] {
  const d: AUDBDocument = s.decoded.doc;
  const t = findTable(d, PURCHASES);
  if (!t) return [];
  const out: GsPurchaseInfo[] = [];
  for (const e of t.entries) {
    if (e.type !== "o" || !addressable(e.key)) continue;
    if (prefix && !e.key.startsWith(prefix)) continue;
    out.push({ key: e.key, isBuy: boolAt(e, "isBuy") });
  }
  return out;
}

/** Set `isBuy` on purchase rows the save already holds. */
export function writePurchases(
  s: GardenscapesSession,
  changes: Record<string, boolean>,
): EditResult {
  const d = s.decoded.doc;
  const ops: EditOp[] = [];
  for (const [key, isBuy] of Object.entries(changes)) {
    if (!addressable(key)) continue;
    if (!entryOf(d, PURCHASES, key)) continue;
    ops.push({ path: `${PURCHASES}.${key}.isBuy`, value: isBuy });
  }
  const res = applyOps(d, ops);
  if (res.changed.length) s.log.push(`Decor: ${res.changed.length} purchase row(s) changed`);
  return res;
}

/** Buy every not-yet-bought row under a chapter prefix (or everything). */
export function buyPurchases(s: GardenscapesSession, prefix = ""): EditResult {
  const rows = listPurchases(s, prefix).filter((r) => !r.isBuy);
  const changes: Record<string, boolean> = {};
  for (const r of rows) changes[r.key] = true;
  return writePurchases(s, changes);
}

/** Chapter summary for the dashboard cards. */
export function decorSummary(s: GardenscapesSession): {
  chapters: number;
  completed: number;
  opened: number;
  items: number;
} {
  const list = listChapters(s);
  return {
    chapters: list.length,
    completed: list.filter((c) => c.completed).length,
    opened: list.filter((c) => c.opened).length,
    items: list.reduce((n, c) => n + c.items.length, 0),
  };
}

export type { AUDBDocument };
export { toInt };
