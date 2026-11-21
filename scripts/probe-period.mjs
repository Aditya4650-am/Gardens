import { readFileSync } from "node:fs";
import { XOR_KEY } from "@/lib/gardenscapes/key";
import { decodeSave, findTable, findEntry, objEntries } from "@/lib/gardenscapes/save-engine";

const T = `${process.env.TEMP}\\gs-test\\`;
const K0 = Uint8Array.from(XOR_KEY, (c) => c.charCodeAt(0));
const target = process.argv[2] || `${T}dev-now.db`;
const refPath = process.argv[3] || "data/gardens-account.db";

const C = readFileSync(target);
const N = C.length;
console.log(`target ${target} ${N}B head=${C.subarray(0, 16).toString("hex")}`);

// --- lag scan: repeating-key XOR shows elevated C[i]==C[i+L] at multiples of the period
const peaks = [];
for (let L = 1; L <= 4000; L++) {
  let hit = 0, n = 0;
  const stop = N - L;
  for (let i = 0; i < stop; i += 3) { n++; if (C[i] === C[i + L]) hit++; }
  peaks.push({ L, rate: hit / n });
}
peaks.sort((a, b) => b.rate - a.rate);
console.log("top lags by match rate:");
for (const p of peaks.slice(0, 8)) console.log(`  lag ${p.L}  ${(p.rate * 100).toFixed(2)}%`);
const baseEntry = peaks.find((p) => p.L === 1);
const base = baseEntry ? baseEntry.rate : 0;
console.log(`  baseline lag1 = ${(base * 100).toFixed(2)}%`);

// --- reference plaintext (the shipped donor is plaintext AUDB)
const C_ref = readFileSync(refPath);
const isPlain = C_ref[0] === 0x41 && C_ref[1] === 0x55 && C_ref[2] === 0x44 && C_ref[3] === 0x42;
const P_ref = new Uint8Array(C_ref.length);
if (isPlain) P_ref.set(C_ref);
else for (let i = 0; i < C_ref.length; i++) P_ref[i] = C_ref[i] ^ K0[i % 731];
console.log(`ref ${refPath} ${C_ref.length}B plain=${isPlain}`);

const cnt = new Float64Array(256);
for (const b of P_ref) cnt[b]++;
const tot = P_ref.length;
const logp = new Float64Array(256);
for (let b = 0; b < 256; b++) logp[b] = Math.log((cnt[b] + 0.5) / (tot + 128));

function attack(P) {
  const res = Array.from({ length: P }, () => []);
  for (let p = 0; p < N; p++) res[p % P].push(p);
  const K = new Uint8Array(P);
  const margins = [];
  for (let i = 0; i < P; i++) {
    let best = -Infinity, second = -Infinity, bb = 0;
    const rs = res[i];
    for (let b = 0; b < 256; b++) {
      let s = 0;
      for (let j = 0; j < rs.length; j++) s += logp[C[rs[j]] ^ b];
      if (s > best) { second = best; best = s; bb = b; } else if (s > second) second = s;
    }
    K[i] = bb;
    margins.push(best - second);
  }
  const out = Buffer.alloc(N);
  for (let p = 0; p < N; p++) out[p] = C[p] ^ K[p % P];
  const strong = margins.filter((m) => m > 5).length;
  const sorted = [...margins].sort((a, b) => a - b);
  const head = out.subarray(0, 24);
  const isAu = out[0] === 0x41 && out[1] === 0x55 && out[2] === 0x44 && out[3] === 0x42;
  return { K, out, strong, median: sorted[sorted.length >> 1], head, isAu };
}

const periods = [...new Set([731, ...peaks.slice(0, 4).map((p) => p.L)])];
for (const P of periods) {
  const r = attack(P);
  console.log(`\nperiod ${P}: strong ${r.strong}/${P} median margin ${r.median.toFixed(1)} AUDB=${r.isAu} head=${r.head.toString("hex")}`);
  if (r.isAu) {
    try {
      const doc = decodeSave(r.out).doc;
      const pr = findEntry(findTable(doc, "TableName"), "Properties");
      const get = (k) => objEntries(pr).find(([kk]) => kk === k)?.[1][1];
      console.log(`  DECODE OK tables=${doc.tables.length} level=${get("level")} coins=${get("coins")} name=${JSON.stringify(get("name"))} PlayerId=${get("PlayerId")} vn=${get("vietnamBuild")}`);
      const { writeFileSync } = await import("node:fs");
      writeFileSync(`${T}key-period-${P}.bin`, Buffer.from(r.K));
      writeFileSync(`${T}dev-decoded.db`, r.out);
    } catch (e) {
      console.log("  parse fail:", e.message);
    }
  }
}
