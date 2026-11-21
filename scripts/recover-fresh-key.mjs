/**
 * Recover the repeating-XOR key of a fresh-account Gardenscapes save whose key
 * is not the shipped XOR_KEY.
 *
 * Method: known-plaintext statistical attack (the same one that recovered the
 * Homescapes f205 key). The key has period 731; for each key index we score
 * every candidate byte by the log-likelihood of the plaintext bytes it implies
 * under a byte-frequency model built from a known-plain save of the same game,
 * then sharpen with a bigram model in a coordinate-ascent pass.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { XOR_KEY } from "@/lib/gardenscapes/key";
import { decodeSave, findTable, findEntry, objEntries } from "@/lib/gardenscapes/save-engine";

const P = 731;
const K0 = Uint8Array.from(XOR_KEY, (c) => c.charCodeAt(0));
if (K0.length !== P) throw new Error(`XOR_KEY length ${K0.length}`);
const T = `${process.env.TEMP}\\gs-test\\`;
const refPath = process.argv[2] || `${T}stats.db`;
const targetPath = process.argv[3] || `${T}live2.db`;

const C_ref = readFileSync(refPath);
// A reference may be given as plaintext AUDB (the shipped donor is) or as an
// XOR_KEY-encrypted save of this game — normalise to plaintext either way.
const isPlain = C_ref[0] === 0x41 && C_ref[1] === 0x55 && C_ref[2] === 0x44 && C_ref[3] === 0x42;
const P_ref = new Uint8Array(C_ref.length);
if (isPlain) P_ref.set(C_ref);
else for (let i = 0; i < C_ref.length; i++) P_ref[i] = C_ref[i] ^ K0[i % P];
console.log(`ref ${refPath} ${C_ref.length}B plaintext=${isPlain} head=${JSON.stringify(Buffer.from(P_ref.subarray(0, 8)).toString("latin1"))}`);

const C = readFileSync(targetPath);
const N = C.length;
console.log(`target ${targetPath} ${N}B  residues/sample=${(N / P).toFixed(1)}`);

// --- models from the known-plain reference ---
const cnt = new Float64Array(256);
for (const b of P_ref) cnt[b]++;
const tot = P_ref.length;
const logp = new Float64Array(256);
for (let b = 0; b < 256; b++) logp[b] = Math.log((cnt[b] + 0.5) / (tot + 128));

const bg = new Float64Array(65536);
for (let i = 0; i + 1 < P_ref.length; i++) bg[(P_ref[i] << 8) | P_ref[i + 1]]++;
const logbg = new Float64Array(65536);
for (let i = 0; i < 65536; i++) logbg[i] = Math.log((bg[i] + 0.02) / (tot + 0.02 * 65536));

// --- residue classes ---
const res = Array.from({ length: P }, () => []);
for (let p = 0; p < N; p++) res[p % P].push(p);

// --- pass 1: unigram ---
const K = new Uint8Array(P);
const margins = new Float64Array(P);
for (let i = 0; i < P; i++) {
  let best = -Infinity, second = -Infinity, bb = 0;
  const rs = res[i];
  for (let b = 0; b < 256; b++) {
    let s = 0;
    for (let j = 0; j < rs.length; j++) s += logp[C[rs[j]] ^ b];
    if (s > best) { second = best; best = s; bb = b; } else if (s > second) second = s;
  }
  K[i] = bb;
  margins[i] = best - second;
}
const strong = [...margins].filter((m) => m > 5).length;
const sorted = [...margins].sort((a, b) => a - b);
console.log(`unigram: ${strong}/${P} indices with margin > 5 nats; median margin ${sorted[P >> 1].toFixed(2)}`);

// --- pass 2: bigram coordinate ascent ---
for (let round = 0; round < 6; round++) {
  let changed = 0;
  for (let i = 0; i < P; i++) {
    const prev = K[(i - 1 + P) % P], next = K[(i + 1) % P];
    let best = -Infinity, bb = K[i];
    const rs = res[i];
    for (let b = 0; b < 256; b++) {
      let s = 0;
      for (let j = 0; j < rs.length; j++) {
        const p = rs[j];
        const cur = C[p] ^ b;
        if (p > 0) s += logbg[((C[p - 1] ^ prev) << 8) | cur];
        if (p + 1 < N) s += logbg[(cur << 8) | (C[p + 1] ^ next)];
      }
      if (s > best) { best = s; bb = b; }
    }
    if (bb !== K[i]) { K[i] = bb; changed++; }
  }
  console.log(`bigram round ${round + 1}: ${changed} key bytes changed`);
  if (!changed) break;
}

// --- decrypt ---
const out = Buffer.alloc(N);
for (let p = 0; p < N; p++) out[p] = C[p] ^ K[p % P];
const head = out.subarray(0, 64);
console.log("head hex:", head.subarray(0, 24).toString("hex"));
console.log("head asc:", head.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
for (const m of ["AUDB", "TBLE", "BDUA", "UPK1", "{", "TableName"]) {
  const at = out.indexOf(Buffer.from(m));
  if (at >= 0) console.log(`magic ${m} at ${at}`);
}
let printable = 0;
for (let i = 0; i < Math.min(N, 8192); i++) { const c = out[i]; if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++; }
console.log(`printable(first 8k) = ${(printable / Math.min(N, 8192) * 100).toFixed(1)}%`);

writeFileSync(`${T}recovered-key.bin`, Buffer.from(K));
writeFileSync(`${T}fresh-decoded.db`, out);

try {
  const doc = decodeSave(out).doc;
  const p = findEntry(findTable(doc, "TableName"), "Properties");
  const get = (k) => objEntries(p).find(([kk]) => kk === k)?.[1][1];
  console.log(`DECODE OK — tables=${doc.tables.length} level=${get("level")} coins=${get("coins")} name=${JSON.stringify(get("name"))} PlayerId=${get("PlayerId")} vn=${get("vietnamBuild")}`);
} catch (e) {
  console.log("decodeSave FAIL:", e.message);
}
