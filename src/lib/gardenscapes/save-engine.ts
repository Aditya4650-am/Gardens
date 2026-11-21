// Gardenscapes save engine.
//
// The device file `Documents/GameData.db` is an AUDB typed key/value store
// (see ./codec.ts), NOT an XML document. Editing a Gardenscapes save therefore
// means reading and writing typed table entries — `TableName.Properties.coins`,
// `SpecialEvents.Season58.Purchases.GoldPass.BoughtCount`, `repairs.chapter1.Area_Main.step`
// and so on — and re-serializing the whole document.
//
// The proven edit path is a plaintext push: XOR the container with the
// 731-char key, edit the AUDB document, re-serialize, XOR back. A byte-exact
// round trip (IN == OUT) has been measured against a real save, so an edit
// that changes nothing leaves the file identical.
//
// This module deliberately carries no game knowledge. It answers "what is at
// this path" and "put this value at that path"; every rule about which path
// means what lives in src/lib/server/gardenscapes/*.server.ts where it can be
// measured against a real save.

import { Buffer } from "node:buffer";
import { xorBytes } from "./crypto.ts";
import { XOR_KEY, FRESH_KEY } from "./key.ts";
import { recoverXorKey } from "./key-recover.ts";
import {
  parseAUDB,
  serializeAUDB,
  type AUDBDocument,
  type AUDBEntry,
  type AUDBTable,
} from "./codec.ts";

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface DecodedGardenscapesSave {
  version: number;
  /** The parsed AUDB document — the thing every edit mutates. */
  doc: AUDBDocument;
  /** XOR-decrypted bytes the document was parsed from. */
  plainBytes: Buffer;
  /** Raw device bytes (still XOR'd). */
  cipherBytes: Buffer;
  /**
   * The key string that actually decoded this save. Pass it to `encodeSave`
   * so an edit writes back with the same key it was read with — the save may
   * not be using the shipped `XOR_KEY` (see ./key-recover.ts).
   */
  key: string;
}

/** Keys tried before falling back to statistical recovery, in order. */
const KEY_CANDIDATES: readonly string[] = [XOR_KEY, FRESH_KEY];

/** True when the bytes are already a plaintext AUDB document (editor export). */
function isPlainAuDb(buf: Buffer): boolean {
  // The device always writes the XOR form, and a cipher byte can only equal
  // 'A' if the key byte at that offset were 0 — impossible (key chars are
  // ASCII 32..94) — so this test cannot misfire on an encrypted save.
  return buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "AUDB";
}

/**
 * Decode a save and parse it, working out which key wrapped it.
 *
 * Order: the key the caller names (when it passes one explicitly), then the
 * shipped keys, then recovery from the file itself. A key is only accepted
 * when the plaintext parses as AUDB, so a wrong candidate costs one parse
 * attempt and never a silently corrupted document.
 */
export function decodeSave(cipher: Buffer, key?: string): DecodedGardenscapesSave {
  if (isPlainAuDb(cipher)) {
    const plain = Buffer.from(cipher);
    const doc = parseAUDB(plain);
    return { version: doc.version, doc, plainBytes: plain, cipherBytes: cipher, key: key ?? XOR_KEY };
  }

  const tried = new Set<string>();
  const candidates = key ? [key, ...KEY_CANDIDATES] : KEY_CANDIDATES;
  let firstError: unknown = null;
  for (const k of candidates) {
    if (tried.has(k)) continue;
    tried.add(k);
    try {
      const plain = Buffer.from(xorBytes(cipher, k));
      const doc = parseAUDB(plain);
      return { version: doc.version, doc, plainBytes: plain, cipherBytes: cipher, key: k };
    } catch (e) {
      if (firstError === null) firstError = e;
    }
  }

  // Neither shipped key fits: recover the key from the file itself.
  try {
    const k = recoverXorKey(cipher);
    const plain = Buffer.from(xorBytes(cipher, k));
    const doc = parseAUDB(plain);
    return { version: doc.version, doc, plainBytes: plain, cipherBytes: cipher, key: k };
  } catch {
    throw firstError instanceof Error
      ? firstError
      : new Error("save: not a Gardenscapes AUDB container");
  }
}

/** Re-serialize an (edited) AUDB document back to device cipher bytes. */
export function encodeSave(doc: AUDBDocument, key: string = XOR_KEY): Buffer {
  return Buffer.from(xorBytes(serializeAUDB(doc), key));
}

/** Convenience: decrypt without caring about the document. */
export function readPlain(cipher: Buffer, key?: string): Buffer {
  return decodeSave(cipher, key).plainBytes;
}

/**
 * Backwards-compatible alias used by older transport code / probes.
 * Gardenscapes saves are AUDB documents, not XML; an "xml" argument is ignored
 * and the document is re-serialized verbatim (byte-exact round trip).
 *
 * Re-encodes with the key the cipher was read with, so a save wrapped in a
 * recovered key is written back under that same key.
 */
export function writeSaveXml(cipher: Buffer | Uint8Array, _xml?: string, key?: string): Buffer {
  const buf = Buffer.isBuffer(cipher) ? cipher : Buffer.from(cipher);
  const dec = decodeSave(buf, key);
  return encodeSave(dec.doc, dec.key);
}

// ---------------------------------------------------------------------------
// Tables & entries
// ---------------------------------------------------------------------------

export function findTable(doc: AUDBDocument, name: string): AUDBTable | undefined {
  return doc.tables.find((t) => t.name === name);
}

export function requireTable(doc: AUDBDocument, name: string): AUDBTable {
  const t = findTable(doc, name);
  if (!t) throw new Error(`save: no table named "${name}"`);
  return t;
}

/** Find a table, creating an empty one if the save has never held it. */
export function ensureTable(doc: AUDBDocument, name: string): AUDBTable {
  let t = findTable(doc, name);
  if (!t) {
    t = { name, entries: [] };
    doc.tables.push(t);
  }
  return t;
}

export function findEntry(table: AUDBTable, key: string): AUDBEntry | undefined {
  return table.entries.find((e) => e.key === key);
}

export function requireEntry(table: AUDBTable, key: string): AUDBEntry {
  const e = findEntry(table, key);
  if (!e) throw new Error(`save: ${table.name} has no entry "${key}"`);
  return e;
}

/** Find an entry, creating it (as an empty object) when absent. */
export function ensureEntry(table: AUDBTable, key: string): AUDBEntry {
  let e = findEntry(table, key);
  if (!e) {
    e = { key, type: "o", value: [] };
    table.entries.push(e);
  }
  return e;
}

// ---------------------------------------------------------------------------
// Object / array value shapes
// ---------------------------------------------------------------------------

/** Object children are `[key, [type, value]]`. */
export type ObjChild = [string, [string, unknown]];
/** Array items are `[type, value]`. */
export type ArrItem = [string, unknown];

export function objEntries(entry: AUDBEntry): ObjChild[] {
  if (entry.type !== "o") throw new Error(`save: ${entry.key} is [${entry.type}], not an object`);
  return entry.value as ObjChild[];
}

export function arrItems(entry: AUDBEntry): ArrItem[] {
  if (entry.type !== "a") throw new Error(`save: ${entry.key} is [${entry.type}], not an array`);
  return entry.value as ArrItem[];
}

/** Look up one child of an object entry. */
export function objFind(entry: AUDBEntry, key: string): [string, unknown] | undefined {
  return objEntries(entry).find(([k]) => k === key)?.[1];
}

/** Set (or insert) one child of an object entry, preserving the key's position. */
export function objPut(entry: AUDBEntry, key: string, type: string, value: unknown): void {
  const ents = objEntries(entry);
  const hit = ents.find(([k]) => k === key);
  if (hit) hit[1] = [type, value];
  else ents.push([key, [type, value]]);
}

/** Remove one child of an object entry. Returns true when something went. */
export function objDelete(entry: AUDBEntry, key: string): boolean {
  const ents = objEntries(entry);
  const i = ents.findIndex(([k]) => k === key);
  if (i < 0) return false;
  ents.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Scalar coercion
// ---------------------------------------------------------------------------
//
// A Gardenscapes counter is stored with one of several numeric types (`i` int32,
// `u` u64, `d` double, `c` u32, `g` u16, `k` u64). The game writes whichever
// fits, and a save can hold the *same* logical counter under different types in
// different places. When we write, we therefore keep the type already on the
// value wherever that type can still hold the new number — rewriting an `i` as
// a `d` is a shape a real save never has, and one a server reads for free.

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

export function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return null;
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Coerce a stored value to an integer, or null when it is not numeric. */
export function toInt(v: unknown): number | null {
  const n = asNumber(v);
  if (n === null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/** Keep `oldType` when it can represent `value`, else pick the narrowest fit. */
export function fitNumericType(oldType: string, value: number): string {
  if (!Number.isFinite(value)) return "d";
  if (Number.isInteger(value)) {
    if (oldType === "i" && value >= INT32_MIN && value <= INT32_MAX) return "i";
    if (oldType === "c" && value >= 0 && value <= 0xffffffff) return "c";
    if (oldType === "g" && value >= 0 && value <= 0xffff) return "g";
    if (oldType === "u" && value >= 0 && value <= Number.MAX_SAFE_INTEGER) return "u";
    if (oldType === "k" && value >= 0 && value <= Number.MAX_SAFE_INTEGER) return "k";
    if (value >= INT32_MIN && value <= INT32_MAX) return "i";
    if (value >= 0 && value <= 0xffffffff) return "c";
    if (value >= 0 && value <= Number.MAX_SAFE_INTEGER) return "u";
  }
  return "d";
}

// ---------------------------------------------------------------------------
// Path access: "A.B.0.C" over objects and arrays
// ---------------------------------------------------------------------------
//
// A path segment names an object key, or an array index when the running value
// is an array. Reading returns the stored `[type, value]` pair so a caller can
// tell an int 5 from a double 5.0.

export type ValueRef = { type: string; value: unknown };

/** Walk `path` from `root`; returns null when any hop is missing. */
export function getRef(root: AUDBEntry, path: string): ValueRef | null {
  let cur: ValueRef = { type: root.type, value: root.value };
  for (const seg of splitPath(path)) {
    if (cur.type === "o") {
      const hit = (cur.value as ObjChild[]).find(([k]) => k === seg)?.[1];
      if (!hit) return null;
      cur = { type: hit[0], value: hit[1] };
    } else if (cur.type === "a") {
      const items = cur.value as ArrItem[];
      const i = Number(seg);
      if (!Number.isInteger(i) || i < 0 || i >= items.length) return null;
      cur = { type: items[i]![0], value: items[i]![1] };
    } else {
      return null;
    }
  }
  return cur;
}

export function getAt(root: AUDBEntry, path: string): unknown {
  return getRef(root, path)?.value ?? null;
}

export function getTypeAt(root: AUDBEntry, path: string): string | null {
  return getRef(root, path)?.type ?? null;
}

/**
 * Put `value` at `path`, creating any missing object hops (never array hops —
 * inventing an array slot is a shape no real save has). Keeps the existing
 * type where it can; returns true when the value actually changed.
 */
export function setAt(root: AUDBEntry, path: string, type: string, value: unknown): boolean {
  const segs = splitPath(path);
  if (segs.length === 0) {
    // `getRef(root, "")` returns the entry itself, so a write with no path
    // has to address the entry too — that is how a scalar entry such as
    // `items.BombsBoost` is updated (it has no children to descend into).
    const changed = root.type !== type || !sameScalar(root.value, value);
    root.type = type;
    root.value = value;
    return changed;
  }
  const leaf = segs[segs.length - 1]!;
  // `parent` is the object entry that owns the leaf key. Every intermediate hop
  // must already be (or become) an object; we never invent array slots.
  let parent: ObjChild[] = objEntries(root);
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    let hit = parent.find(([k]) => k === seg);
    if (!hit) {
      hit = [seg, ["o", []]];
      parent.push(hit);
    } else if (hit[1][0] !== "o") {
      throw new Error(`save: cannot descend into [${hit[1][0]}] at "${segs.slice(0, i + 1).join(".")}"`);
    }
    parent = hit[1][1] as ObjChild[];
  }
  const found = parent.find(([k]) => k === leaf);
  if (!found) {
    parent.push([leaf, [type, value]]);
    return true;
  }
  const changed = found[1][0] !== type || !sameScalar(found[1][1], value);
  found[1] = [type, value];
  return changed;
}

/** Set a numeric value at `path`, keeping the type already stored there. */
export function setNumberAt(root: AUDBEntry, path: string, value: number): boolean {
  const old = getTypeAt(root, path);
  return setAt(root, path, fitNumericType(old ?? "i", value), value);
}

/** Set a string value at `path` (always stored as `s`). */
export function setStringAt(root: AUDBEntry, path: string, value: string): boolean {
  return setAt(root, path, "s", value);
}

/** Set a boolean value at `path` (always stored as `t` / `f`). */
export function setBoolAt(root: AUDBEntry, path: string, value: boolean): boolean {
  return setAt(root, path, value ? "t" : "f", value);
}

function sameScalar(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b);
  return a === b;
}

function splitPath(path: string): string[] {
  return path.split(".").filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Table/entry shorthand
// ---------------------------------------------------------------------------

/** Read a value from `<table>.<entryKey>.<path>`; null when absent. */
export function readPath(doc: AUDBDocument, table: string, entryKey: string, path = ""): unknown {
  const t = findTable(doc, table);
  if (!t) return null;
  const e = findEntry(t, entryKey);
  if (!e) return null;
  return path ? getAt(e, path) : e.value;
}

/** Write a value into `<table>.<entryKey>.<path>`, creating hops as needed. */
export function writePath(
  doc: AUDBDocument,
  table: string,
  entryKey: string,
  path: string,
  type: string,
  value: unknown,
): boolean {
  const t = ensureTable(doc, table);
  const e = ensureEntry(t, entryKey);
  // An empty path writes the entry's own value, which is allowed whatever its
  // type; only a real descent needs an object to descend into.
  if (splitPath(path).length > 0 && e.type !== "o") {
    throw new Error(`save: ${table}.${entryKey} is [${e.type}], not an object`);
  }
  return setAt(e, path, type, value);
}

export function writeNumber(doc: AUDBDocument, table: string, entryKey: string, path: string, value: number): boolean {
  const t = ensureTable(doc, table);
  const e = ensureEntry(t, entryKey);
  const old = getRef(e, path)?.type;
  return setAt(e, path, fitNumericType(old ?? "i", value), value);
}

export function writeString(doc: AUDBDocument, table: string, entryKey: string, path: string, value: string): boolean {
  return writePath(doc, table, entryKey, path, "s", value);
}

export function writeBool(doc: AUDBDocument, table: string, entryKey: string, path: string, value: boolean): boolean {
  return writePath(doc, table, entryKey, path, value ? "t" : "f", value);
}
