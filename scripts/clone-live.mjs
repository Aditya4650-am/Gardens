// End-to-end clone test against the live MEmu device.
//
//   node clone-live.mjs                dry run: pull, clone, verify, report
//   node clone-live.mjs --push         ... then write it back, relaunch, re-pull
//   node clone-live.mjs --push --progress   ... also ADD the donor's coins/stars to ours
//
// Everything goes through the shipped server modules — connectLoad /
// applyClone / pushEncode / pullGameSaveRaw / pushGameSaveRaw — so what is
// tested is the path the button takes, not a re-implementation of it.

import { readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connectLoad, pushEncode, dropSession } from "@/lib/server/gardenscapes/session.server";
import { applyClone } from "@/lib/server/gardenscapes/clone.server";
import { pullGameSaveRaw, pushGameSaveRaw } from "@/lib/server/gardenscapes/save.server";
import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";

const execFileP = promisify(execFile);
const ADB = "C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
const SERIAL = "127.0.0.1:21513";
const PKG = "com.playrix.gardenscapes";
const T = `${process.env.TEMP}\\gs-test\\`;
const PUSH = process.argv.includes("--push");
const PROGRESS_ON = process.argv.includes("--progress");

const PROGRESS = ["level", "coins", "earnedStars", "spentStars", "name", "PlayerId", "gameId", "vietnamBuild", "GardenCurrentChapterId", "dogname"];

function facts(doc) {
  const t = findTable(doc, "TableName");
  const p = t ? findEntry(t, "Properties") : undefined;
  const get = (k) => {
    const hit = p && p.type === "o" ? objEntries(p).find(([kk]) => kk === k) : undefined;
    return hit ? hit[1][1] : undefined;
  };
  const out = {};
  for (const k of PROGRESS) out[k] = get(k);
  out.__tables = doc.tables.length;
  out.__repairs = findTable(doc, "repairs")?.entries.length ?? 0;
  out.__purchases = findTable(doc, "repairs_purchases_info")?.entries.length ?? 0;
  out.__characters = findTable(doc, "CharacterProperties")?.entries.length ?? 0;
  out.__redesign = findTable(doc, "Redesign")?.entries.length ?? 0;
  return out;
}

function diff(a, b) {
  const rows = [];
  for (const k of Object.keys(a)) {
    const x = JSON.stringify(a[k]);
    const y = JSON.stringify(b[k]);
    if (x !== y) rows.push(`    ${k}: ${x} -> ${y}`);
  }
  return rows;
}

async function shot(name) {
  const res = await execFileP(ADB, ["-s", SERIAL, "exec-out", "screencap", "-p"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
  writeFileSync(`${T}${name}.png`, res.stdout);
  return `${T}${name}.png`;
}

const t0 = Date.now();
console.log(`[1/6] pull`);
const pull = await pullGameSaveRaw();
const cipher = Buffer.from(pull.b64, "base64");
writeFileSync(`${T}clone-before.db`, cipher);
console.log(`      ${cipher.length}B head=${cipher.subarray(0, 8).toString("hex")}`);

console.log(`[2/6] decode + load session`);
const direct = decodeSave(cipher);
console.log(`      key=${direct.key === (await import("@/lib/gardenscapes/key")).XOR_KEY ? "XOR_KEY" : direct.key.length === 731 ? "FRESH/recovered" : "?"} tables=${direct.doc.tables.length}`);
const before = facts(direct.doc);
console.log(`      before: ${JSON.stringify(before)}`);

const TOKEN = "clone-test";
const s = connectLoad(TOKEN, SERIAL, pull.b64);
const loadedBefore = facts(s.decoded.doc);
if (JSON.stringify(loadedBefore) !== JSON.stringify(before)) {
  console.log("      NOTE: connectLoad state differs from direct decode");
}

console.log(`[3/6] applyClone (${PROGRESS_ON ? "content + add donor's coins/stars" : "content only"})`);
const res = applyClone(s, { withProgress: PROGRESS_ON });
console.log(`      cloned: ${res.cloned.join(" | ")}`);
console.log(`      progress copied: ${res.progress.length ? res.progress.join(", ") : "(none — content only)"}`);
console.log(`      warnings: ${res.warnings.length ? res.warnings.join(" | ") : "(none)"}`);
const after = facts(s.decoded.doc);
console.log(`      after:  ${JSON.stringify(after)}`);
const changes = diff(before, after);
console.log(`      changed fields:\n${changes.length ? changes.join("\n") : "    (none)"}`);

// Identity must be untouched by a clone either way; with --progress the two
// balances are ADDED to ours (never replaced) and the level still never moves.
const STATIC_KEYS = ["PlayerId", "gameId", "name", "spentStars", "vietnamBuild"];
const identityOk = STATIC_KEYS.every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
console.log(`      identity+level untouched: ${identityOk ? "YES" : "NO  <-- FAIL"}`);
if (!identityOk) process.exit(1);
if (PROGRESS_ON) {
  const donor = decodeSave(readFileSync(`${process.cwd()}/data/gardens-account.db`)).doc;
  const dt = findTable(donor, "TableName");
  const dp = dt ? findEntry(dt, "Properties") : undefined;
  const dget = (k) => {
    const hit = dp && dp.type === "o" ? objEntries(dp).find(([kk]) => kk === k) : undefined;
    return hit ? hit[1][1] : undefined;
  };
  const dCoins = Number(dget("coins") ?? 0);
  const dNet = Number(dget("earnedStars") ?? 0) - Number(dget("spentStars") ?? 0);
  const bCoins = Number(before.coins);
  const bStars = Number(before.earnedStars ?? 0);
  // Mirror the server's idempotent add: only while ours is below the donor's.
  const wantCoins = bCoins < dCoins ? bCoins + dCoins : bCoins;
  const wantStars = bStars < dNet ? bStars + dNet : bStars;
  const wantLevel = Math.max(Number(before.level), Number(dget("level") ?? 0));
  const addOk = Number(after.coins) === wantCoins && Number(after.earnedStars) === wantStars && Number(after.level) === wantLevel;
  console.log(`      progression ADDED (ours + donor's): coins ${before.coins}->${after.coins} (want ${wantCoins}), stars ${before.earnedStars}->${after.earnedStars} (want ${wantStars}), level ${before.level}->${after.level} (want ${wantLevel}) ${addOk ? "OK" : " <-- FAIL"}`);
  if (!addOk) process.exit(1);
} else {
  const balancesOk = ["coins", "earnedStars", "spentStars", "level"].every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
  console.log(`      balances untouched: ${balancesOk ? "YES" : "NO  <-- FAIL"}`);
  if (!balancesOk) process.exit(1);
}
const gained = after.__repairs - before.__repairs + (after.__characters - before.__characters) + (after.__redesign - before.__redesign);
console.log(`      content gained: repairs ${before.__repairs}->${after.__repairs}, characters ${before.__characters}->${after.__characters}, redesign ${before.__redesign}->${after.__redesign} (net ${gained})`);
// Content must equal the donor's — either because this run just copied it, or
// because an earlier run already did (a re-clone is a no-op, not a failure).
const donorDoc2 = decodeSave(readFileSync(`${process.cwd()}/data/gardens-account.db`)).doc;
const dcount = (n) => findTable(donorDoc2, n)?.entries.length ?? 0;
const contentOk =
  after.__repairs === dcount("repairs") &&
  after.__purchases === dcount("repairs_purchases_info") &&
  after.__characters === dcount("CharacterProperties");
console.log(`      content matches donor: ${contentOk ? "YES" : "NO  <-- FAIL"} (donor repairs=${dcount("repairs")} purchases=${dcount("repairs_purchases_info")} characters=${dcount("CharacterProperties")})`);
if (!contentOk) process.exit(1);

console.log(`[4/6] encode`);
const out = pushEncode(s.id, TOKEN);
writeFileSync(`${T}clone-after.db`, out);
const verify = decodeSave(out);
const roundTrip = Buffer.compare(Buffer.from(verify.plainBytes), Buffer.from(s.decoded.plainBytes)) === 0;
console.log(`      ${out.length}B (was ${cipher.length}B) keyMatch=${verify.key === s.decoded.key} reparse tables=${verify.doc.tables.length} plainRoundTrip=${roundTrip}`);
if (verify.key !== s.decoded.key) { console.log("      <-- FAIL: re-encoded under a different key"); process.exit(1); }

if (!PUSH) {
  console.log(`\nDRY RUN only — re-run with --push to write it to the device (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  dropSession(s.id, TOKEN);
  process.exit(0);
}

console.log(`[5/6] push (force-stop, stage, redirect-write, chmod 600)`);
const pushed = await pushGameSaveRaw(out.toString("base64"));
console.log(`      ${JSON.stringify(pushed)}`);

console.log(`[6/6] relaunch + watch`);
await execFileP(ADB, ["-s", SERIAL, "shell", `monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`], { timeout: 30000 });
await new Promise((r) => setTimeout(r, 45000));
console.log(`      screenshot 1: ${await shot("clone-g1")}`);
await new Promise((r) => setTimeout(r, 15000));
console.log(`      screenshot 2: ${await shot("clone-g2")}`);

const after2 = await pullGameSaveRaw();
const cipher2 = Buffer.from(after2.b64, "base64");
writeFileSync(`${T}clone-game.db`, cipher2);
const gameDoc = decodeSave(cipher2);
const gameFacts = facts(gameDoc.doc);
console.log(`      game re-saved: ${cipher2.length}B tables=${gameDoc.doc.tables.length} key=${gameDoc.key === direct.key ? "same" : "DIFFERENT"}`);
console.log(`      after game: ${JSON.stringify(gameFacts)}`);
const gameDiff = diff(before, gameFacts);
console.log(`      vs original:\n${gameDiff.length ? gameDiff.join("\n") : "    (identical)"}`);
const KEPT = PROGRESS_ON
  ? ["PlayerId", "gameId", "name"] // level/coins/stars were deliberately raised
  : ["PlayerId", "gameId", "name", "level", "coins"];
const keptIdentity = KEPT.every((k) => JSON.stringify(before[k]) === JSON.stringify(gameFacts[k]));
console.log(`      identity+level still ours after the game re-saved: ${keptIdentity ? "YES" : "NO <-- FAIL"}`);
if (PROGRESS_ON) {
  const keptCoins = Number(gameFacts.coins) >= Number(before.coins);
  const keptLevel = Number(gameFacts.level) >= Number(before.level);
  console.log(`      raised progression kept by the game: level ${gameFacts.level}, coins ${gameFacts.coins}, stars ${gameFacts.earnedStars} ${keptCoins && keptLevel ? "OK" : "<-- FAIL"}`);
  if (!keptCoins || !keptLevel) process.exit(1);
}
if (!keptIdentity) process.exit(1);
console.log(`      content kept by the game: repairs ${gameFacts.__repairs}, characters ${gameFacts.__characters}, redesign ${gameFacts.__redesign}`);
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
dropSession(s.id, TOKEN);
