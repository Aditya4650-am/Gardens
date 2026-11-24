import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeSave, encodeSave, findTable, objEntries } from "@/lib/gardenscapes/save-engine";
import { connectLoad, dropSession, type GardenscapesSession } from "./session.server.ts";
import { listChapters, maxDecor } from "./decor.server.ts";
import { DECOR_FINAL_STEPS } from "./decor-steps.ts";

const FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/send-friends.db";
const TOKEN = "decor-test";

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

test("max decor completes the decorations visually without touching the story flags", (t) => {
  withSave(t, (s) => {
    const before = listChapters(s);
    const ch2 = before.find((c) => c.key === "chapter2");
    assert.ok(ch2, "fixture holds chapter2");
    assert.equal(ch2.completed, false);
    const catalog = DECOR_FINAL_STEPS.chapter2;
    assert.ok(catalog && Object.keys(catalog).length > 0, "chapter2 has a measured catalog");

    const res = maxDecor(s);
    assert.ok(res.chapters >= 1);
    assert.ok(res.items > 0);

    const after = listChapters(s).find((c) => c.key === "chapter2");
    assert.ok(after);
    // Visual steps applied...
    for (const [name, want] of Object.entries(catalog)) {
      const item: { name: string; step: string } | undefined = after.items.find((x) => x.name === name);
      assert.ok(item, `${name} present after max`);
      assert.equal(item.step, want.step, `${name} final step`);
    }
    // ...the chapter flag is untouched (the game's story chain stays intact).
    assert.equal(after.completed, false, "chapter flag untouched");
    const raw = decodeSave(encodeSave(s.decoded.doc, s.decoded.key));
    const ch2r = findTable(raw.doc, "repairs")?.entries.find((e) => e.key === "chapter2");
    assert.ok(ch2r);
    const flag = objEntries(ch2r).find(([k]) => k === "@completed");
    assert.ok(!flag || flag[1][0] !== "t", "still not marked complete after round-trip");
  });
});

test("max decor keeps purchases untouched", (t) => {
  withSave(t, (s) => {
    const before = new Map(
      (findTable(s.decoded.doc, "repairs_purchases_info")?.entries ?? []).map((e) => [
        e.key,
        objEntries(e).find(([k]) => k === "isBuy")?.[1][1],
      ]),
    );
    maxDecor(s);
    for (const e of findTable(s.decoded.doc, "repairs_purchases_info")?.entries ?? []) {
      assert.equal(objEntries(e).find(([k]) => k === "isBuy")?.[1][1], before.get(e.key), "isBuy untouched");
    }
  });
});
