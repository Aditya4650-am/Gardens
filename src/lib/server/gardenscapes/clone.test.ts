import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";
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

test("clone: decoration roots the target never held are CREATED, not skipped", (t) => {
  if (!existsSync(OWN) || !existsSync(DONOR)) {
    t.skip("fixture not present");
    return;
  }
  const donorDoc = decodeSave(readFileSync(DONOR)).doc;
  const donorRedesign = findTable(donorDoc, "Redesign");
  assert.ok(donorRedesign && donorRedesign.entries.length > 0, "donor carries redesign decor");
  const s = connectLoad(TOKEN, "dev1", readFileSync(OWN).toString("base64"));
  const hadRedesign = !!findTable(s.decoded.doc, "Redesign");

  const r = applyClone(s);
  const after = s.decoded.doc;

  // The device save has no `Redesign` table — the clone used to skip it and
  // report success while the garden kept none of its redesign state.
  const got = findTable(after, "Redesign");
  assert.ok(got, "Redesign table now exists on the target");
  assert.equal(got.entries.length, donorRedesign.entries.length);
  if (!hadRedesign) {
    assert.ok(
      r.cloned.some((c) => c.startsWith("Redesign") && c.includes("new")),
      `the created root is reported: ${r.cloned.join(" | ")}`,
    );
  }

  // Every decoration root the donor holds lands on the target.
  for (const name of ["repairs", "repairs_purchases_info", "CharacterProperties", "main_pers_objects", "quest_targets"]) {
    const d = findTable(donorDoc, name);
    if (!d) continue;
    const a = findTable(after, name);
    assert.ok(a, `${name} present after clone`);
    assert.equal(a.entries.length, d.entries.length, `${name} entry count matches donor`);
  }

  // The donor's decor quests arrive, and a quest only our save holds survives.
  const dq = findTable(donorDoc, "quests");
  const aq = findTable(after, "quests");
  if (dq && aq) {
    for (const e of dq.entries) assert.ok(aq.entries.some((x) => x.key === e.key), `donor quest ${e.key} landed`);
  }

  // The redesign render flags — the device starts with none at all, and
  // without them the garden keeps its base look instead of the donor's.
  const dh = findTable(donorDoc, "history_data");
  const ah = findTable(after, "history_data");
  assert.ok(dh, "donor carries history_data");
  assert.ok(dh.entries.length > 0, "donor carries history_data");
  assert.ok(ah, "history_data present after clone");
  const redesignFlags = dh.entries.filter((e) => /Redesign$/i.test(e.key));
  assert.ok(redesignFlags.length > 0, `donor holds redesign flags (${redesignFlags.length})`);
  for (const e of redesignFlags) {
    const hit = ah.entries.find((x) => x.key === e.key) as { key: string; value: unknown } | undefined;
    assert.ok(hit, `render flag ${e.key} landed`);
    assert.equal(hit.value, e.value, `render flag ${e.key} keeps the donor's value`);
  }

  // The named SpecialEvents decor rows arrive too.
  for (const key of ["special_redesign", "RoomDesignVSO", "GardenMeta"]) {
    const de = findTable(donorDoc, "SpecialEvents")?.entries.find((x) => x.key === key);
    if (!de) continue;
    const ae = findTable(after, "SpecialEvents")?.entries.find((x) => x.key === key);
    assert.ok(ae, `SpecialEvents.${key} landed`);
    assert.equal(JSON.stringify(ae.value), JSON.stringify(de.value), `SpecialEvents.${key} matches donor`);
  }
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
