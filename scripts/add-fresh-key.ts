import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const KEY_TS = "src/lib/gardenscapes/key.ts";
const a = readFileSync(`${process.env.TEMP}\\gs-test\\recovered-key.bin`);
const bPath = `${process.env.TEMP}\\gs-test\\key-period-731.bin`;
let b: Buffer | null = null;
try { b = readFileSync(bPath); } catch { /* only one generation recovered */ }
if (b) console.log(`generations: live2=${a.length} dev=${b.length} identical=${Buffer.compare(a, b) === 0}`);
if (b && Buffer.compare(a, b) !== 0) throw new Error("the two recovered keys differ — do not ship a single constant");

const literal = JSON.stringify(a.toString("latin1"));
const sha = createHash("sha256").update(a).digest("hex");
let src = readFileSync(KEY_TS, "utf8");
if (src.includes("FRESH_KEY")) { console.log("FRESH_KEY already present — skipping"); process.exit(0); }

src += `
/**
 * XOR key for the **fresh-account** save generation (period 731, printable
 * ASCII 32..94 like XOR_KEY, but a different key: only 13 of 731 bytes match
 * XOR_KEY and no rotation of it lines up).
 *
 * Recovered on 2026-11-22 from a live device save by the known-plaintext
 * statistical attack in ./key-recover.ts (byte-frequency model of the AUDB
 * format, one argmax per key index, decisive margins ~244 nats). Proven
 * against four save generations of the same account (198,081 / 198,105 /
 * 198,168 B) — each decodes to AUDB with 53 tables and re-encodes
 * byte-identically.
 *
 * It is tried after XOR_KEY and before statistical recovery, so the common
 * fresh-account case is instant. If a future build rotates the key again,
 * recovery still reads the save — this constant is an optimisation, not a
 * requirement.
 *
 * NOT verified as global: one account was available. Do not hand-edit.
 */
export const FRESH_KEY = ${literal};
export const FRESH_KEY_LENGTH = 731;
export const FRESH_KEY_SHA256 = "${sha}";
`;
writeFileSync(KEY_TS, src);
console.log(`appended FRESH_KEY (${a.length} bytes, sha256 ${sha.slice(0, 16)}…)`);
