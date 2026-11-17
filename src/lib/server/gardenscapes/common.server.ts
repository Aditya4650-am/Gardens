// Shared helpers for the Gardenscapes edit modules.
//
// Every feature reads and writes the decoded AUDB document held by the
// session, so all of them go through the same two primitives here rather than
// each re-implementing type preservation. The codec is the only thing allowed
// to turn that document back into bytes.

import {
  findEntry,
  findTable,
  getRef,
  objEntries,
  toInt,
  writeBool,
  writeNumber,
  writeString,
  type ObjChild,
} from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry, type AUDBTable } from "@/lib/gardenscapes/codec";
import { type GardenscapesSession } from "./session.server";

/** One staged field edit: `table.entryKey.a.b.c` -> new value. */
export interface EditOp {
  path: string;
  value: number | string | boolean;
}

export interface EditResult {
  /** Paths that actually changed (a no-op write is not reported as a change). */
  changed: string[];
  /** Paths the save does not hold — reported, never silently created. */
  missing: string[];
}

export function doc(s: GardenscapesSession): AUDBDocument {
  return s.decoded.doc;
}

/** Split `table.entryKey.rest` into its three parts. */
export function splitOpPath(path: string): { table: string; entry: string; rest: string } {
  const segs = path.split(".").filter((x) => x.length > 0);
  if (segs.length < 2) throw new Error(`edit: path needs at least table.entry — "${path}"`);
  const [table, entry] = segs as [string, string];
  return { table, entry, rest: segs.slice(2).join(".") };
}

/**
 * Read `<table>.<entry>.<rest>`; null when any hop is absent.
 * An empty `rest` reads the entry's own value (the scalar case).
 */
export function readAt(d: AUDBDocument, path: string): unknown {
  const { table, entry, rest } = splitOpPath(path);
  const t = findTable(d, table);
  if (!t) return null;
  const e = findEntry(t, entry);
  if (!e) return null;
  return rest ? getRef(e, rest)?.value ?? null : e.value;
}

/** Type tag at `path` (`i`, `s`, `t`, …), or null when absent. */
export function typeAt(d: AUDBDocument, path: string): string | null {
  const { table, entry, rest } = splitOpPath(path);
  const t = findTable(d, table);
  if (!t) return null;
  const e = findEntry(t, entry);
  if (!e) return null;
  return rest ? getRef(e, rest)?.type ?? null : e.type;
}

/**
 * Apply one op, keeping whatever type the field already has. A field the save
 * does not hold is reported as missing instead of being invented: creating a
 * key the game never wrote is a shape no real save has.
 */
export function applyOp(d: AUDBDocument, op: EditOp): "changed" | "missing" | "noop" {
  const path = op.path;
  const { table, entry, rest } = splitOpPath(path);
  const t = findTable(d, table);
  if (!t) return "missing";
  const e = findEntry(t, entry);
  if (!e) return "missing";
  const before = rest ? getRef(e, rest) : { type: e.type, value: e.value };
  if (!before) return "missing";

  const changed =
    typeof op.value === "number"
      ? writeNumber(d, table, entry, rest, op.value)
      : typeof op.value === "boolean"
        ? writeBool(d, table, entry, rest, op.value)
        : writeString(d, table, entry, rest, op.value);
  return changed ? "changed" : "noop";
}

/** Apply a batch; reports what moved and what the save does not hold. */
export function applyOps(d: AUDBDocument, ops: EditOp[]): EditResult {
  const changed: string[] = [];
  const missing: string[] = [];
  for (const op of ops) {
    const r = applyOp(d, op);
    if (r === "changed") changed.push(op.path);
    else if (r === "missing") missing.push(op.path);
  }
  return { changed, missing };
}

/** Object children of an entry, or [] when it is not an object. */
export function children(e: AUDBEntry | undefined): ObjChild[] {
  if (!e || e.type !== "o") return [];
  return objEntries(e);
}

/** Find an entry in a table without throwing. */
export function entry(d: AUDBDocument, table: string, key: string): AUDBEntry | undefined {
  const t = findTable(d, table);
  return t ? findEntry(t, key) : undefined;
}

/** Find a table without throwing. */
export function table(d: AUDBDocument, name: string): AUDBTable | undefined {
  return findTable(d, name);
}

/** Integer at a path, or null. */
export function intAt(d: AUDBDocument, path: string): number | null {
  return toInt(readAt(d, path));
}

/** String at a path, or "". */
export function strAt(d: AUDBDocument, path: string): string {
  const v = readAt(d, path);
  return typeof v === "string" ? v : "";
}
