// Parse a single AUDB table entry by entry, printing the key and the offset
// after each, so the first desyncing value can be pinned to its key.
// Run: node --experimental-strip-types scripts/gs-entrywalk.ts [savePath] [tableName]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
const want = process.argv[3] ?? "Features";
const raw = readFileSync(path);
const d = path.endsWith(".plain") ? raw : Buffer.from(xorBytes(raw));

class R {
  d: Buffer;
  p = 0;
  depth = 0;
  constructor(d: Buffer, p: number) {
    this.d = d;
    this.p = p;
  }
  u8(): number {
    return this.d[this.p++]!;
  }
  varint(): number {
    let r = 0,
      s = 0;
    for (;;) {
      const b = this.d[this.p++]!;
      r |= (b & 0x7f) << s;
      if ((b & 0x80) === 0) break;
      s += 7;
    }
    return r;
  }
  raw(n: number): Buffer {
    const v = this.d.subarray(this.p, this.p + n);
    this.p += n;
    return v;
  }
  key(): string {
    const b = this.raw(this.varint());
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
    return s;
  }
  describe(b: number): string {
    switch (b) {
      case 0x69: {
        const v = this.d.readInt32LE(this.p);
        this.p += 4;
        return `i=${v}`;
      }
      case 0x75: {
        const v = this.d.readBigUInt64LE(this.p);
        this.p += 8;
        return `u=${v}`;
      }
      case 0x6b: {
        const v = this.d.readBigUInt64LE(this.p);
        this.p += 8;
        return `k=${v}`;
      }
      case 0x64: {
        const v = this.d.readDoubleLE(this.p);
        this.p += 8;
        return `d=${v}`;
      }
      case 0x67: {
        const v = this.d.readUInt16LE(this.p);
        this.p += 2;
        return `g=${v}`;
      }
      case 0x63: {
        const v = this.d.readUInt32LE(this.p);
        this.p += 4;
        return `c=${v}`;
      }
      case 0x6a: {
        const v = this.d.readUInt32LE(this.p);
        this.p += 4;
        return `j=${v}`;
      }
      case 0x65:
        return `e=${this.u8()}`;
      case 0x62:
        return `b=${this.u8()}`;
      case 0x74:
        return "true";
      case 0x66:
        return "false";
      case 0x6e:
        return "null";
      case 0x73: {
        const s = this.raw(this.varint()).toString("utf8");
        return `s=${JSON.stringify(s.slice(0, 40))}`;
      }
      case 0x6f: {
        const n = this.varint();
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const k = this.key();
          parts.push(`${k}:${this.value()}`);
        }
        return `{${n}}[${parts.slice(0, 6).join(", ")}${parts.length > 6 ? ", …" : ""}]`;
      }
      case 0x61: {
        const n = this.varint();
        const parts: string[] = [];
        for (let i = 0; i < n; i++) parts.push(this.value());
        return `[${n}][${parts.slice(0, 6).join(", ")}${parts.length > 6 ? ", …" : ""}]`;
      }
      default: {
        let n = b & 0x7f;
        if ((b & 0x80) !== 0) {
          let s = 7;
          for (;;) {
            const c = this.u8();
            n |= (c & 0x7f) << s;
            if ((c & 0x80) === 0) break;
            s += 7;
          }
        }
        const s = this.raw(n).toString("utf8");
        return `s*=${JSON.stringify(s.slice(0, 40))}`;
      }
    }
  }
  value(): string {
    const b = this.u8();
    return this.describe(b);
  }
}

// Find the table.
let p = 8;
for (;;) {
  const magic = d.toString("latin1", p, p + 4);
  if (magic === "BDUA") throw new Error("no table " + want);
  if (magic !== "TBLE") throw new Error("bad magic at " + p);
  p += 4;
  const r0 = new R(d, p);
  const name = r0.key();
  if (name === want) {
    p = r0.p;
    break;
  }
  const ntop = r0.varint();
  for (let i = 0; i < ntop; i++) {
    r0.key();
    r0.value();
  }
  p = r0.p;
}

const r = new R(d, p);
const ntop = r.varint();
console.log(`table ${want} ntop=${ntop} starts entries at ${r.p}`);
for (let i = 0; i < ntop; i++) {
  const start = r.p;
  let key = "";
  try {
    key = r.key();
    const desc = r.value();
    console.log(
      `  ${String(i).padStart(3)} @${String(start).padStart(8)} -> ${String(r.p).padStart(8)}  ${key.padEnd(34)} ${desc.slice(0, 140)}`,
    );
  } catch (e) {
    console.log(`  ${String(i).padStart(3)} @${start} KEY=${JSON.stringify(key)} THREW ${String(e)}`);
    break;
  }
  if (r.p > d.length) {
    console.log("  ran off the end");
    break;
  }
}
console.log(`entries ended at ${r.p}`);
console.log(
  "  tail:",
  JSON.stringify(d.subarray(r.p, r.p + 96).toString("latin1")),
);
