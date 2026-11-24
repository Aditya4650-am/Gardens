import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { connectLoad, dropSession, type GardenscapesSession } from "./session.server.ts";
import { claimAllSeasons, claimAllStages, listSeasons, readStages } from "./season.server.ts";

const FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/send-friends.db";
const TOKEN = "season-test";

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

test("garden pass unlocks both roads AND activates the premium row", (t) => {
  withSave(t, (s) => {
    const before = listSeasons(s).find((x) => x.stages > 0);
    assert.ok(before, "fixture holds a season with stages");
    assert.equal(before.goldPassBought, 0, "starts without the golden pass");

    const res = claimAllStages(s, before.key);
    assert.ok(res.changed.length > 50, "stages + score + purchase flag moved");

    const after = listSeasons(s).find((x) => x.key === before.key);
    assert.ok(after);
    assert.equal(after.goldPassBought, 1, "golden row activated");
    assert.ok(after.score >= 600, "score raised to the declared threshold");

    const gold = readStages(s, before.key, "gold");
    const free = readStages(s, before.key, "free");
    assert.ok(gold.length > 0 && free.length > 0);
    assert.ok(gold.every((x) => x.state === "Claim"), "every gold slot claimable");
    assert.ok(free.every((x) => x.state === "Claim"), "every free slot claimable");
  });
});

test("claimAllSeasons activates every season that holds stages", (t) => {
  withSave(t, (s) => {
    const res = claimAllSeasons(s);
    assert.ok(res.changed.length > 50);
    for (const season of listSeasons(s)) {
      if (season.stages === 0) continue;
      assert.equal(season.goldPassBought, 1, `${season.key} golden row activated`);
    }
  });
});
