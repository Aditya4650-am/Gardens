// Cross-save badge ciphertext comparison: are badge ids deterministic?
// Usage: node --experimental-strip-types scripts/gs-badgex.ts [file...]
import { readFileSync } from "node:fs";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const FILES =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        "C:\\Users\\User\\Downloads\\gardenscapes\\_ref\\mined\\GameData.db",
        "C:\\Users\\User\\Downloads\\gs-local-tool\\gs-local-tool\\dist\\GameData.db",
        "C:\\Users\\User\\Downloads\\gs-local-tool\\gs-local-tool\\dist\\GameData.UNLOCKED.db",
        "C:\\Users\\User\\Downloads\\gs-local-tool\\gs-local-tool\\GameData.UNLOCKED.db",
        "C:\\Users\\User\\Downloads\\Telegram Desktop\\GameData.db",
      ];

type Node = { type: string; value: unknown };
const kids = (e: any): [string, [string, unknown]][] =>
  e && e.type === "o" ? (e.value as [string, [string, unknown]][]) : [];

const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s && s.length > 200 ? s.slice(0, 200) + "…" : String(s);
};

for (const path of FILES) {
  console.log("\n================ " + path);
  let doc: any;
  try {
    const raw = readFileSync(path);
    const candidates = [
      raw.subarray(0, 4).toString("latin1") === "AUDB" ? raw : Buffer.from(xorBytes(raw)),
      raw.subarray(0, 4).toString("latin1") === "AUDB" ? Buffer.from(xorBytes(raw)) : raw,
    ];
    let lastErr: any = null;
    for (const c of candidates) {
      try {
        doc = parseAUDB(c);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!doc) throw lastErr;
  } catch (err: any) {
    console.log("  PARSE FAIL: " + err.message);
    continue;
  }
  const T = (n: string) => doc.tables.find((t: any) => t.name === n);

  // 1. worn badge
  const se = T("SpecialEvents");
  const pp = se?.entries.find((e: any) => e.key === "PlayerProfileOwn");
  const own = kids(pp).find(([k]) => k === "OwnProfile");
  console.log("  OwnProfile:");
  if (own)
    for (const [k, [kt, kv]] of own[1][1] as [string, [string, unknown]][])
      console.log(`    ${k} [${kt}] = ${show(kv)}`);

  // 2. owned badges array
  const f = T("Features");
  const pg = f?.entries.find((e: any) => e.key === "ProfileBadgesGFF");
  const core = kids(pg).find(([k]) => k === "Core");
  console.log("  ProfileBadgesGFF.Core:");
  if (core)
    for (const [k, [kt, kv]] of core[1][1] as [string, [string, unknown]][]) {
      if (kt === "a") {
        const arr = kv as [string, unknown][];
        console.log(`    ${k} [a] len=${arr.length}`);
        for (const it of arr) {
          const [itkt, itkv] = it as [string, unknown];
          if (itkt === "o") {
            const pairs = (itkv as [string, [string, unknown]][])
              .map(([ik, [ikt, ikv]]) => `${ik}=${show(ikv)}`)
              .join(" ");
            console.log(`      { ${pairs} }`);
          } else console.log(`      ${itkt} = ${show(itkv)}`);
        }
      } else console.log(`    ${k} [${kt}] = ${show(kv)}`);
    }
}
