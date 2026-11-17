// Gardenscapes AUDB container codec — faithful port of the reverse-engineered
// Python reference (gs-copy-garden/audb.py). Round-trips the file byte-for-byte.

import { Buffer } from "node:buffer";

export interface AUDBValue {
  type: string;
  value: unknown;
}

export interface AUDBEntry {
  key: string;
  type: string;
  value: unknown;
}

export interface AUDBTable {
  name: string;
  entries: AUDBEntry[];
}

export interface AUDBDocument {
  version: number;
  tables: AUDBTable[];
}

export const T_INT = 0x69;
export const T_UINT = 0x75;
export const T_DOUBLE = 0x64;
export const T_OBJ = 0x6f;
export const T_ARR = 0x61;
export const T_TRUE = 0x74;
export const T_FALSE = 0x66;
export const T_NULL = 0x6e;
export const T_STR = 0x73;
export const T_BYTE = 0x62;
export const T_K = 0x6b;
export const T_G = 0x67;
export const T_C = 0x63;
export const T_E = 0x65;
// Gardenscapes' newer builds tag bitmask fields (`*Mask`) with their own
// 4-byte little-endian unsigned integer, `0x6a` ('j'). It is a distinct type
// from T_INT (`0x69`), which reads the same 4 bytes signed, and from T_C
// (`0x63`): the Features table carries `StageFinishedSentMask` as
// `6a 00 00 00 00` immediately beside `StageLevelsAttempted` as
// `69 00 00 00 00`, so both the dispatch byte and the width are measured
// rather than assumed. Without a case here the reader falls through to the
// compact-string default, under-consumes, and every later table boundary in
// the file desyncs (first failure: Features, delta -32321 bytes).
export const T_MASK = 0x6a;

class Reader {
  d: Buffer;
  p = 0;

  constructor(d: Buffer) {
    this.d = d;
  }

  u8(): number {
    const v = this.d[this.p]!;
    this.p += 1;
    return v;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.d[this.p]!;
      this.p += 1;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  raw(n: number): Buffer {
    const v = this.d.subarray(this.p, this.p + n);
    this.p += n;
    return v;
  }

  key(): string {
    const n = this.varint();
    const b = this.raw(n);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
    return s;
  }

  value(): [string, unknown] {
    const b = this.u8();
    switch (b) {
      case T_INT: {
        const v = this.d.readInt32LE(this.p);
        this.p += 4;
        return ["i", v];
      }
      case T_UINT: {
        const raw = this.d.readBigUInt64LE(this.p);
        this.p += 8;
        // u64 values above MAX_SAFE_INTEGER (hashes, opaque ids) would lose
        // precision through Number and break the byte-exact round trip.
        return ["u", raw <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(raw) : raw];
      }
      case T_DOUBLE: {
        const v = this.d.readDoubleLE(this.p);
        this.p += 8;
        return ["d", v];
      }
      case T_K: {
        const raw = this.d.readBigUInt64LE(this.p);
        this.p += 8;
        return ["k", raw <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(raw) : raw];
      }
      case T_G: {
        const v = this.d.readUInt16LE(this.p);
        this.p += 2;
        return ["g", v];
      }
      case T_C: {
        const v = this.d.readUInt32LE(this.p);
        this.p += 4;
        return ["c", v];
      }
      case T_MASK: {
        const v = this.d.readUInt32LE(this.p);
        this.p += 4;
        return ["j", v];
      }
      case T_E:
        return ["e", this.u8() as number];
      case T_BYTE:
        return ["b", this.u8() as number];
      case T_OBJ: {
        const n = this.varint();
        const out: [string, [string, unknown]][] = [];
        for (let i = 0; i < n; i++) {
          const k = this.key();
          out.push([k, this.value()]);
        }
        return ["o", out];
      }
      case T_ARR: {
        const n = this.varint();
        const out: [string, unknown][] = [];
        for (let i = 0; i < n; i++) out.push(this.value() as [string, unknown]);
        return ["a", out];
      }
      case T_TRUE:
        return ["t", true];
      case T_FALSE:
        return ["f", false];
      case T_NULL:
        return ["n", null];
      case T_STR: {
        const n = this.varint();
        const b = this.raw(n);
        return ["s", utf8(b)];
      }
      // Compact string: Python calls `varint()` without advancing past the
      // dispatch byte, so that byte is the FIRST byte of the length varint.
      // We already consumed it with u8(), so rebuild the varint from `b` and
      // pull its continuation bytes only when the high bit says it is longer.
      // Reading a second length byte here would desync the whole stream.
      default: {
        let n = b & 0x7f;
        if ((b & 0x80) !== 0) {
          let shift = 7;
          for (;;) {
            const c = this.u8();
            n |= (c & 0x7f) << shift;
            if ((c & 0x80) === 0) break;
            shift += 7;
          }
        }
        return ["s", utf8(this.raw(n))];
      }
    }
  }
}

// String VALUES are UTF-8 (Python: raw(n).decode("utf-8", "replace")).
// Decoding byte-by-byte here and re-encoding with Buffer.from(s, "utf8") in
// utf8Bytes() would turn one non-ASCII character into two on every round trip.
// Keys stay latin1 (see key() / latin1Bytes), matching the reference.
export function utf8(b: Buffer): string {
  return b.toString("utf8");
}

function writeVarint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    let b = v & 0x7f;
    v >>= 7;
    if (v) out.push(b | 0x80);
    else {
      out.push(b);
      return out;
    }
  }
}

function serializeValue(t: string, v: unknown): number[] {
  const out: number[] = [];
  switch (t) {
    case "i": {
      out.push(T_INT);
      out.push(...int32Bytes(v as number));
      break;
    }
    case "u": {
      out.push(T_UINT);
      out.push(...u64Bytes(BigInt(v as number)));
      break;
    }
    case "d": {
      out.push(T_DOUBLE);
      out.push(...doubleBytes(v as number));
      break;
    }
    case "k": {
      out.push(T_K);
      out.push(...u64Bytes(BigInt(v as number)));
      break;
    }
    case "g": {
      out.push(T_G);
      out.push(...u16Bytes(v as number));
      break;
    }
    case "c": {
      out.push(T_C);
      out.push(...u32Bytes(v as number));
      break;
    }
    case "j": {
      out.push(T_MASK);
      out.push(...u32Bytes(v as number));
      break;
    }
    case "e":
      out.push(T_E);
      out.push((v as number) & 0xff);
      break;
    case "b":
      out.push(T_BYTE);
      out.push((v as number) & 0xff);
      break;
    case "o": {
      out.push(T_OBJ);
      const entries = v as [string, [string, unknown]][];
      out.push(...writeVarint(entries.length));
      for (const [k, [kt, kv]] of entries) {
        const kb = latin1Bytes(k);
        out.push(...writeVarint(kb.length));
        for (const b of kb) out.push(b);
        out.push(...serializeValue(kt, kv));
      }
      break;
    }
    case "a": {
      out.push(T_ARR);
      const arr = v as [string, unknown][];
      out.push(...writeVarint(arr.length));
      for (const e of arr) out.push(...serializeValue(e[0], e[1]));
      break;
    }
    case "t":
      out.push(T_TRUE);
      break;
    case "f":
      out.push(T_FALSE);
      break;
    case "n":
      out.push(T_NULL);
      break;
    case "s": {
      const b = utf8Bytes(v as string);
      out.push(T_STR);
      out.push(...writeVarint(b.length));
      for (const x of b) out.push(x);
      break;
    }
    default:
      throw new Error("bad type " + t);
  }
  return out;
}

function int32Bytes(v: number): number[] {
  const b = Buffer.alloc(4);
  b.writeInt32LE(v, 0);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) out.push(b[i]!);
  return out;
}
function u64Bytes(v: bigint): number[] {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v, 0);
  const out: number[] = [];
  for (let i = 0; i < 8; i++) out.push(b[i]!);
  return out;
}
function doubleBytes(v: number): number[] {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(v, 0);
  const out: number[] = [];
  for (let i = 0; i < 8; i++) out.push(b[i]!);
  return out;
}
function u16Bytes(v: number): number[] {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v, 0);
  const out: number[] = [];
  for (let i = 0; i < 2; i++) out.push(b[i]!);
  return out;
}
function u32Bytes(v: number): number[] {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) out.push(b[i]!);
  return out;
}
function latin1Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}
function utf8Bytes(s: string): number[] {
  const b = Buffer.from(s, "utf8");
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) out.push(b[i]!);
  return out;
}

export function parseAUDB(data: Buffer): AUDBDocument {
  if (data.length < 8) throw new Error("AUDB: file too short");
  const magic = data.toString("latin1", 0, 4);
  if (magic !== "AUDB") throw new Error("AUDB: bad magic " + magic);
  let ver = 0;
  // version is the u32le at offset 4 (the magic occupies 0..4)
  for (let i = 0; i < 4; i++) ver |= data[4 + i]! << (8 * i);
  const r = new Reader(data);
  r.p = 8;
  const tables: AUDBTable[] = [];
  while (r.p < data.length) {
    const magic4 = data.toString("latin1", r.p, r.p + 4);
    if (magic4 === "BDUA") break;
    if (magic4 !== "TBLE") throw new Error("AUDB: bad table magic at " + r.p);
    r.p += 4;
    const name = r.key();
    const ntop = r.varint();
    const entries: AUDBEntry[] = [];
    for (let i = 0; i < ntop; i++) {
      const k = r.key();
      const [t, v] = r.value();
      entries.push({ key: k, type: t, value: v });
    }
    tables.push({ name, entries });
  }
  return { version: ver, tables };
}

export function serializeAUDB(doc: AUDBDocument): Buffer {
  const parts: number[] = [];
  parts.push(0x41, 0x55, 0x44, 0x42); // AUDB
  for (let i = 0; i < 4; i++) parts.push((doc.version >> (8 * i)) & 0xff);
  for (const t of doc.tables) {
    parts.push(0x54, 0x42, 0x4c, 0x45); // TBLE
    const nb = latin1Bytes(t.name);
    for (const b of writeVarint(nb.length)) parts.push(b);
    for (const b of nb) parts.push(b);
    for (const b of writeVarint(t.entries.length)) parts.push(b);
    for (const e of t.entries) {
      const kb = latin1Bytes(e.key);
      for (const b of writeVarint(kb.length)) parts.push(b);
      for (const b of kb) parts.push(b);
      for (const b of serializeValue(e.type, e.value)) parts.push(b);
    }
  }
  parts.push(0x42, 0x44, 0x55, 0x41); // BDUA
  const out = Buffer.alloc(parts.length);
  parts.forEach((b, i) => {
    out[i] = b;
  });
  return out;
}
