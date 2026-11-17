// Deep-walk a few consecutive top-level entries of one table, printing the
// offset after every child, so a value whose declared child-count does not
// match the bytes can be pinned to its key.
// Run: node --experimental-strip-types scripts/gs-deep.ts [table] [firstEntry] [count]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
const want = process.argv[3] ?? "Features";
const first = Number(process.argv[4] ?? 26);
const howMany = Number(process.argv[5] ?? 4);
const DEEP = process.argv[6] === "deep";
const raw = readFileSync(path);
const d = path.endsWith(".plain") ? raw : Buffer.from(xorBytes(raw));

class R {
  d: Buffer;
  p = 0;
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
  /** Read one value, reporting the byte that dispatched it. */
  value(): string {
    const start = this.p;
    const b = this.u8();
    switch (b) {
      case 0x69: {
        const v = this.d.readInt32LE(this.p);
        this.p += 4;
        return `i=${v}`;
      }
      case 0x75:
      case 0x6b: {
        const v = this.d.readBigUInt64LE(this.p);
        this.p += 8;
        return `${b === 0x75 ? "u" : "k"}=${v}`;
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
        return `s=${JSON.stringify(s.slice(0, 30))}`;
      }
      case 0x6f: {
        const n = this.varint();
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const k = this.key();
          const before = this.p;
          const v = this.value();
          parts.push(`${k}@${before}=${v}`);
        }
        const show = DEEP ? parts : parts.slice(0, 8);
        return `{${n}}@${start}..${this.p} [${show.join(" | ")}${parts.length > show.length ? " | …" : ""}]`;
      }
      case 0x61: {
        const n = this.varint();
        const parts: string[] = [];
        for (let i = 0; i < n; i++) parts.push(this.value());
        const show = DEEP ? parts : parts.slice(0, 6);
        return `[${n}]@${start}..${this.p} [${show.join(" | ")}${parts.length > show.length ? " | …" : ""}]`;
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
        return `s*=${JSON.stringify(s.slice(0, 30))}`;
      }
    }
  }
}

// Locate the table.
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
console.log(`table ${want} ntop=${ntop}`);
for (let i = 0; i < ntop; i++) {
  const start = r.p;
  const key = r.key();
  const vstart = r.p;
  let desc = "";
  try {
    desc = r.value();
  } catch (e) {
    desc = `THREW ${String(e)}`;
  }
  if (i >= first && i < first + howMany) {
    console.log(`\n#${i} key=${key} key@${start} value@${vstart}..${r.p}`);
    console.log(`   ${desc.slice(0, 2000)}`);
  }
  if (i >= first + howMany) break;
}
