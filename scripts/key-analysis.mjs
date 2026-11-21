import { readFileSync, existsSync, readdirSync } from "node:fs";
import { XOR_KEY } from "@/lib/gardenscapes/key";
import { decodeSave, encodeSave, findTable, findEntry, objEntries } from "@/lib/gardenscapes/save-engine";

const T = `${process.env.TEMP}\\gs-test\\`;
const P = 731;
const K0 = Uint8Array.from(XOR_KEY, (c) => c.charCodeAt(0));
const KR = new Uint8Array(readFileSync(`${T}recovered-key.bin`));
if (KR.length !== P) throw new Error("recovered key length " + KR.length);

// --- relation to the shipped key ---
let same = 0;
for (let i = 0; i < P; i++) if (KR[i] === K0[i]) same++;
let bestRot = { rot: -1, n: 0 };
for (let r = 0; r < P; r++) {
  let n = 0;
  for (let i = 0; i < P; i++) if (KR[i] === K0[(i + r) % P]) n++;
  if (n > bestRot.n) bestRot = { rot: r, n };
}
const xorKeyBuf = Buffer.from(K0);
const recKeyBuf = Buffer.from(KR);
const crypto = await import("node:crypto");
console.log(`vs XOR_KEY: identical indices=${same}/${P}; best rotation=${bestRot.rot} matches=${bestRot.n}`);
console.log("XOR_KEY   sha256", crypto.createHash("sha256").update(xorKeyBuf).digest("hex").slice(0, 16));
console.log("recovered sha256", crypto.createHash("sha256").update(recKeyBuf).digest("hex").slice(0, 16));
console.log("recovered head:", recKeyBuf.subarray(0, 32).toString("latin1").replace(/[^\x20-\x7e]/g, "."));

// --- does the recovered key read every fresh-era file we hold? ---
const candidates = [
  `${T}live.db`, `${T}live2.db`, `${T}bak.db`, `${T}fresh198.db`,
  `${process.env.APPDATA}\\IGG-VIP-Studio\\backups\\garden-20261122-000311\\GameData.db`,
  `${T}cur.db`,
];
function tryDecode(bytes, key) {
  const out = Buffer.alloc(bytes.length);
  for (let p = 0; p < bytes.length; p++) out[p] = bytes[p] ^ key[p % P];
  try {
    const doc = decodeSave(out).doc;
    const pr = findEntry(findTable(doc, "TableName"), "Properties");
    const get = (k) => objEntries(pr).find(([kk]) => kk === k)?.[1][1];
    return { ok: true, tables: doc.tables.length, level: get("level"), coins: get("coins"), name: get("name"), pid: get("PlayerId"), bytes: out, doc };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}
for (const f of candidates) {
  if (!existsSync(f)) { console.log(`  --  ${f} (absent)`); continue; }
  const b = readFileSync(f);
  const a = tryDecode(b, K0), c = tryDecode(b, KR);
  const tag = (r) => (r.ok ? `OK tables=${r.tables} lvl=${r.level} coins=${r.coins} name=${JSON.stringify(r.name)} pid=${r.pid}` : `fail(${r.why})`);
  console.log(`  ${f.split("\\").slice(-2).join("\\")} ${b.length}B\n      XOR_KEY: ${tag(a)}\n      recov : ${tag(c)}`);
}

// --- round-trip: decode the fresh save with the recovered key, re-encode, compare ---
const fresh = readFileSync(`${T}live2.db`);
const dec = tryDecode(fresh, KR);
if (!dec.ok) throw new Error("fresh decode failed: " + dec.why);
const re = encodeSave(dec.doc);
const sameBytes = re.length === fresh.length && Buffer.compare(re, fresh) === 0;
console.log(`round-trip: encoded ${re.length}B vs source ${fresh.length}B -> ${sameBytes ? "BYTE-IDENTICAL" : "DIFFERS"}`);
if (!sameBytes) {
  let diff = 0, first = -1;
  for (let i = 0; i < Math.min(re.length, fresh.length); i++) if (re[i] !== fresh[i]) { diff++; if (first < 0) first = i; }
  console.log(`  differing bytes=${diff} first@${first} (lenDelta=${re.length - fresh.length})`);
}
