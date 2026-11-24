import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";
import { type AUDBEntry } from "@/lib/gardenscapes/codec";
import { addBounded, applyClone } from "./clone.server.ts";
import { connectLoad, dropSession } from "./session.server.ts";

const OWN =
  process.env.GS_CLONE_OWN ??
  join(process.env.TEMP ?? "", "gs-test", "clone-before.db");
const DONOR = join(process.cwd(), "data", "gardens-account.db");
const TOKEN = "test-token";

function prop(doc: ReturnType<typeof decodeSave>["doc"], key: string): unknown {
  const names = findTable(doc, "TableName");
  assert.ok(names, "save carries TableName");
  const table = findEntry(names, "Properties");
  assert.ok(table, "save carries TableName.Properties");
  const hit = objEntries(table).find(([k]) => k === key);
  return hit ? hit[1][1] : null;
}

function num(doc: ReturnType<typeof decodeSave>["doc"], key: string): number {
  const v = prop(doc, key);
  return typeof v === "number" ? v : 0;
}

test("clone: the optional progression is ADDED to ours, never replacing ours", (t) => {
  if (!existsSync(OWN) || !existsSync(DONOR)) {
    t.skip("fixture not present");
    return;
  }
  const ownDoc = decodeSave(readFileSync(OWN)).doc;
  const donorDoc = decodeSave(readFileSync(DONOR)).doc;

  const ourCoins = num(ownDoc, "coins");
  const ourEarned = num(ownDoc, "earnedStars");
  const ourSpent = num(ownDoc, "spentStars");
  const ourLevel = num(ownDoc, "level");
  const donorNet = num(donorDoc, "earnedStars") - num(donorDoc, "spentStars");
  assert.ok(num(donorDoc, "coins") > 0, "donor holds coins to add");

  const s = connectLoad(TOKEN, "dev1", readFileSync(OWN).toString("base64"));
  const r = applyClone(s, { withProgress: true });
  const after = s.decoded.doc;

  // Coins: ours + theirs, never theirs alone — but only while ours is below
  // the donor's share, so a repeat press cannot double the balance.
  const wantCoins = addBounded(ourCoins, num(donorDoc, "coins"), 2_000_000_000);
  if (wantCoins !== null) assert.equal(num(after, "coins"), wantCoins);
  else assert.equal(num(after, "coins"), ourCoins, "already at/above the donor — untouched");
  // Stars: the donor's NET stars land on ours; spentStars never moves.
  const wantStars = addBounded(ourEarned, donorNet, Number.MAX_SAFE_INTEGER);
  if (wantStars !== null) assert.equal(num(after, "earnedStars"), wantStars);
  else assert.equal(num(after, "earnedStars"), ourEarned, "already at/above the donor — untouched");
  assert.equal(num(after, "spentStars"), ourSpent);
  // Level follows the donor only when theirs is higher, and the jump is
  // reported rather than written silently.
  const donorLevel = num(donorDoc, "level");
  if (donorLevel > ourLevel) {
    assert.equal(num(after, "level"), donorLevel);
    assert.ok(
      donorLevel - ourLevel <= 200 || r.warnings.some((w) => w.includes("jump")),
      `a level jump is reported: ${r.warnings.join(", ")}`,
    );
  } else {
    assert.equal(num(after, "level"), ourLevel);
  }
  // Identity is untouched by the whole clone.
  assert.equal(prop(after, "name"), prop(ownDoc, "name"));
  // The level logs exactly when the donor's is higher — on a save that has
  // already taken it (a repeat clone) there is nothing left to move, and
  // asserting otherwise would make the idempotency rule fail its own test.
  if (donorLevel > ourLevel) {
    assert.ok(
      r.progress.some((p) => p.startsWith("level ")),
      `level is logged: ${r.progress.join(", ") || "(nothing)"}`,
    );
    assert.equal(num(after, "level"), donorLevel);
  } else {
    assert.equal(num(after, "level"), ourLevel, "an already-matched level never moves");
  }
  dropSession(s.id, TOKEN);
});

test("clone: only chapters the save never held are added, and nothing of ours is repainted", (t) => {
  if (!existsSync(OWN) || !existsSync(DONOR)) {
    t.skip("fixture not present");
    return;
  }
  const donorDoc = decodeSave(readFileSync(DONOR)).doc;
  const s = connectLoad(TOKEN, "dev1", readFileSync(OWN).toString("base64"));
  // What our own save says before the clone.
  const ownBefore = decodeSave(readFileSync(OWN)).doc;
  const ownRepairs = findTable(ownBefore, "repairs");
  const ownChapter2 = ownRepairs?.entries.find((e) => e.key === "chapter2");
  const ownQuests = findTable(ownBefore, "quests")?.entries.map((e) => e.key) ?? [];
  const ownHistory = findTable(ownBefore, "history_data")?.entries ?? [];
  const ownStat = (doc: ReturnType<typeof decodeSave>["doc"], key: string) => {
    const t = findTable(doc, "TableName");
    const p = t ? findEntry(t, "Properties") : undefined;
    const hit = p && p.type === "o" ? objEntries(p).find(([k]) => k === key) : undefined;
    return hit ? hit[1][1] : undefined;
  };
  const ownChapterId = ownStat(ownBefore, "GardenCurrentChapterId");
  const ownChapterKeys = ownRepairs?.entries.map((e) => e.key) ?? [];

  const r = applyClone(s);
  const after = s.decoded.doc;
  const donorRepairs = findTable(donorDoc, "repairs");
  const afterRepairs = findTable(after, "repairs");
  assert.ok(donorRepairs && afterRepairs, "repairs present on both sides");

  // A chapter the save never held is created with the donor's decoration items
  // and no story flags (so it stays closed until the story opens it).
  const missingDonorChapters = donorRepairs.entries.filter(
    (e) => !ownChapterKeys.includes(e.key),
  );
  assert.ok(missingDonorChapters.length > 0, "the donor holds chapters our save lacks");
  for (const e of missingDonorChapters) {
    const made: AUDBEntry | undefined = afterRepairs.entries.find((x) => x.key === e.key);
    assert.ok(made, `missing chapter ${e.key} is created`);
    assert.equal(objEntries(made).filter(([k]) => k.startsWith("@")).length, 0, `${e.key} gains no story flags`);
  }
  // Our own chapters survive untouched — items, steps and flags alike.
  for (const key of ownChapterKeys) {
    const before: AUDBEntry | undefined = ownRepairs?.entries.find((e) => e.key === key);
    const now: AUDBEntry | undefined = afterRepairs.entries.find((e) => e.key === key);
    assert.ok(now, `our chapter ${key} survives`);
    assert.equal(JSON.stringify(now), JSON.stringify(before), `our chapter ${key} is not repainted`);
  }
  assert.ok(ownChapter2, "our save holds chapter2");
  assert.ok(
    r.cloned.some((c) => c.startsWith("repairs")),
    `the decoration merge is reported: ${r.cloned.join(" | ")}`,
  );

  // Whole-replace roots still match the donor.
  for (const name of ["repairs_purchases_info", "CharacterProperties"]) {
    const d = findTable(donorDoc, name);
    if (!d) continue;
    const a = findTable(after, name);
    assert.ok(a, `${name} present after clone`);
    assert.equal(a.entries.length, d.entries.length, `${name} entry count matches donor`);
  }

  // The clone never re-themes the garden: no `Redesign` table arrives and the
  // donor's redesign event row stays out.
  if (!findTable(ownBefore, "Redesign")) {
    assert.equal(findTable(after, "Redesign"), undefined, "no redesign table is created");
  }
  const ownSpecial = findTable(ownBefore, "SpecialEvents")?.entries.find((e) => e.key === "special_redesign");
  const afterSpecial = findTable(after, "SpecialEvents")?.entries.find((e) => e.key === "special_redesign");
  assert.equal(JSON.stringify(afterSpecial), JSON.stringify(ownSpecial), "special_redesign stays ours");

  // The story pointer and every story table stay ours.
  assert.equal(ownStat(after, "GardenCurrentChapterId"), ownChapterId, "the current chapter is never moved by a clone");
  const afterQuests = findTable(after, "quests")?.entries.map((e) => e.key) ?? [];
  assert.deepEqual(afterQuests, ownQuests, "quests table is untouched");
  for (const name of ["main_pers_objects", "quest_targets"]) {
    assert.equal(
      findTable(after, name)?.entries.length ?? 0,
      findTable(ownBefore, name)?.entries.length ?? 0,
      `${name} is untouched`,
    );
  }
  const afterHistory = findTable(after, "history_data")?.entries ?? [];
  assert.deepEqual(afterHistory, ownHistory, "history_data is untouched");

  dropSession(s.id, TOKEN);
});

test("clone: the add is idempotent — a second press changes nothing", (t) => {
  if (!existsSync(OWN) || !existsSync(DONOR)) {
    t.skip("fixture not present");
    return;
  }
  const s = connectLoad(TOKEN, "dev1", readFileSync(OWN).toString("base64"));
  applyClone(s, { withProgress: true });
  const first = {
    coins: num(s.decoded.doc, "coins"),
    stars: num(s.decoded.doc, "earnedStars"),
    level: num(s.decoded.doc, "level"),
  };
  // Clone again on the already-cloned save — the balances must not double.
  applyClone(s, { withProgress: true });
  assert.equal(num(s.decoded.doc, "coins"), first.coins, "coins did not double");
  assert.equal(num(s.decoded.doc, "earnedStars"), first.stars, "stars did not double");
  assert.equal(num(s.decoded.doc, "level"), first.level, "level unchanged");
  dropSession(s.id, TOKEN);
});

test("clone: without the option no balance moves at all", (t) => {
  if (!existsSync(OWN) || !existsSync(DONOR)) {
    t.skip("fixture not present");
    return;
  }
  const ownDoc = decodeSave(readFileSync(OWN)).doc;
  const s = connectLoad(TOKEN, "dev1", readFileSync(OWN).toString("base64"));
  applyClone(s);
  const after = s.decoded.doc;
  assert.equal(num(after, "coins"), num(ownDoc, "coins"));
  assert.equal(num(after, "earnedStars"), num(ownDoc, "earnedStars"));
  assert.equal(num(after, "level"), num(ownDoc, "level"));
  dropSession(s.id, TOKEN);
});

test("clone: coins are held under the ceiling, and the add never doubles", () => {
  // The ceiling cannot be reached through the bundled donor (1,082,387 — a
  // sum only clears 2e9 if ours already sits above it, which the idempotency
  // rule refuses first), so the arithmetic is pinned on the helper itself.
  assert.equal(addBounded(1_010, 1_082_387, 2_000_000_000), 1_083_397, "fresh account takes the sum");
  assert.equal(addBounded(1_083_397, 1_082_387, 2_000_000_000), null, "a repeat press adds nothing");
  assert.equal(addBounded(5_000_000, 1_082_387, 2_000_000_000), null, "already richer than the donor — untouched");
  assert.equal(addBounded(1_998_000_000, 1_999_000_000, 2_000_000_000), 1_999_999_999, "held one under the ceiling");
  assert.equal(addBounded(100, 0, 2_000_000_000), null, "a donor with nothing contributes nothing");
  assert.equal(addBounded(100, -5, 2_000_000_000), null, "a negative donor contributes nothing");
});
