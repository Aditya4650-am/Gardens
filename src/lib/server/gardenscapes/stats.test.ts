import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { connectLoad, dropSession, type GardenscapesSession } from "./session.server.ts";
import { readStats, writeStats } from "./stats.server.ts";

const FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/send-friends.db";
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

const values = (s: GardenscapesSession) => new Map(readStats(s).map((f) => [f.key, f.value]));

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
