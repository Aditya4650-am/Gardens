// Walk the AUDB table by table and report where each one ends, so a desync
// can be pinned to the exact table instead of the offset the parser died at.
// Run: node --experimental-strip-types scripts/gs-tablewalk.ts [savePath]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
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
  value(): void {
    const b = this.u8();
    switch (b) {
      case 0x69:
        this.p += 4;
        return;
      case 0x75:
      case 0x6b:
      case 0x64:
        this.p += 8;
        return;
      case 0x67:
        this.p += 2;
        return;
      case 0x63:
        this.p += 4;
        return;
      case 0x6a:
        // Gardenscapes bitmask fields: 4-byte LE unsigned int (see codec.ts).
        this.p += 4;
        return;
      case 0x65:
      case 0x62:
        this.p += 1;
        return;
      case 0x6f: {
        const n = this.varint();
        for (let i = 0; i < n; i++) {
          this.key();
          this.value();
        }
        return;
      }
      case 0x61: {
        const n = this.varint();
        for (let i = 0; i < n; i++) this.value();
        return;
      }
      case 0x74:
      case 0x66:
      case 0x6e:
        return;
      case 0x73: {
        this.raw(this.varint());
        return;
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
        this.raw(n);
      }
    }
  }
}

// Ground truth: every TBLE marker in the file.
const marks: number[] = [];
{
  let i = d.indexOf("TBLE");
  while (i >= 0) {
    marks.push(i);
    i = d.indexOf("TBLE", i + 4);
  }
}
console.log(`file ${d.length} B, ${marks.length} TBLE markers`);

const r = new R(d, 8);
let ti = 0;
while (r.p < d.length) {
  const magic = d.toString("latin1", r.p, r.p + 4);
  if (magic === "BDUA") {
    console.log(`BDUA at ${r.p} (file ends ${d.length})`);
    break;
  }
  if (magic !== "TBLE") {
    console.log(`DESYNC before table ${ti}: wanted TBLE at ${r.p}, found ${JSON.stringify(magic)}`);
    const expect = marks[ti];
    console.log(`  ground-truth TBLE #${ti} is at ${expect} (delta ${r.p - expect})`);
    console.log(
      "  around reader:",
      JSON.stringify(d.subarray(r.p - 32, r.p + 32).toString("latin1")),
    );
    break;
  }
  r.p += 4;
  const name = r.key();
  const ntop = r.varint();
  for (let i = 0; i < ntop; i++) {
    r.key();
    r.value();
  }
  const bd = d.indexOf("BDUA");
  const expectNext = marks[ti + 1] ?? (bd >= 0 ? bd : d.length - 4);
  const ok = r.p === expectNext;
  console.log(
    `#${String(ti).padStart(2)} ${name.padEnd(28)} ntop=${String(ntop).padStart(5)} ends=${String(r.p).padStart(8)} nextTBLE=${String(expectNext).padStart(8)} ${ok ? "ok" : `MISMATCH delta=${r.p - expectNext}`}`,
  );
  if (!ok) break;
  ti++;
}
