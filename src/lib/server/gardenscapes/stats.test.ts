import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeSave, encodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";
import { connectLoad, dropSession, type GardenscapesSession } from "./session.server.ts";
import { readStats, writeStats } from "./stats.server.ts";

const FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/send-friends.db";
const VN_FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/vn-save.db";
const TOKEN = "stats-test";

function withSave(t: { skip(msg: string): void }, fn: (s: GardenscapesSession) => void): void {
  if (!existsSync(FIXTURE)) {
    t.skip("fixture not present");
    return;
  }
  const s = connectLoad(TOKEN, "dev1", readFileSync(FIXTURE).toString("base64"));
  try {
    fn(s);
  } finally {
    dropSession(s.id, TOKEN);
  }
}

function withVn(t: { skip(msg: string): void }, fn: (s: GardenscapesSession) => void): void {
  if (!existsSync(VN_FIXTURE)) {
    t.skip("vn fixture not present");
    return;
  }
  const s = connectLoad(TOKEN, "vn", readFileSync(VN_FIXTURE).toString("base64"));
  try {
    fn(s);
  } finally {
    dropSession(s.id, TOKEN);
  }
}

const values = (s: GardenscapesSession) => new Map(readStats(s).map((f) => [f.key, f.value]));

const props = (s: GardenscapesSession) =>
  objEntries(findEntry(findTable(s.decoded.doc, "TableName")!, "Properties")!);
const propOf = (s: GardenscapesSession, key: string) => props(s).find(([k]) => k === key);

test("stats writes the counters a player recognises", (t) => {
  withSave(t, (s) => {
    const before = values(s);
    for (const key of ["coins", "level", "earnedStars"]) {
      assert.ok(before.has(key), `fixture holds ${key}`);
    }
    const res = writeStats(s, { coins: 123456, level: 77, earnedStars: 4321 });
    assert.equal(res.changed.length, 3);
    const after = values(s);
    assert.equal(after.get("coins"), 123456);
    assert.equal(after.get("level"), 77);
    assert.equal(after.get("earnedStars"), 4321);
  });
});

test("stats resolves renamed keys by case and alias family", (t) => {
  withSave(t, (s) => {
    assert.equal(writeStats(s, { COINS: 555 }).changed.length, 1, "case-insensitive");
    assert.equal(writeStats(s, { stars: 999 }).changed.length, 1, "alias of earnedStars");
    const after = values(s);
    assert.equal(after.get("coins"), 555);
    assert.equal(after.get("earnedStars"), 999);
  });
});

test("stats never invents a key and never overwrites a collection", (t) => {
  withSave(t, (s) => {
    const res = writeStats(s, { totallyMadeUpCounter: 1, lives: 9 });
    assert.equal(res.changed.length, 0);
    assert.equal(res.missing.length, 2);
  });
});

test("vn build: coins is stored as a string and the write keeps it a string", (t) => {
  withVn(t, (s) => {
    assert.equal(propOf(s, "coins")?.[1][0], "s", "VN stores coins as a string");
    const res = writeStats(s, { coins: 250000, level: 99 });
    assert.equal(res.changed.length, 2);
    assert.equal(propOf(s, "coins")?.[1][0], "s", "type preserved");
    assert.equal(propOf(s, "coins")?.[1][1], "250000");
    assert.equal(propOf(s, "level")?.[1][1], 99);
  });
});

test("vn build: earnedStars is created when the build never wrote it", (t) => {
  withVn(t, (s) => {
    assert.equal(propOf(s, "earnedStars"), undefined, "VN save has no earnedStars yet");
    const res = writeStats(s, { earnedStars: 4321 });
    assert.equal(res.changed.length, 1);
    const hit = propOf(s, "earnedStars");
    assert.ok(hit);
    assert.equal(hit![1][0], "i");
    assert.equal(hit![1][1], 4321);

    // Second write resolves the created field normally.
    assert.equal(writeStats(s, { earnedStars: 12 }).changed.length, 1);

    // And it survives the codec: encode -> decode keeps the entry.
    const round = decodeSave(encodeSave(s.decoded.doc, s.decoded.key));
    const back = objEntries(findEntry(findTable(round.doc, "TableName")!, "Properties")!).find(
      ([k]) => k === "earnedStars",
    );
    assert.equal(back?.[1][1], 12);
  });
});
