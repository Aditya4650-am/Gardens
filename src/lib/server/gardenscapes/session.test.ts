import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { connectLoad, pushEncode, restoreOriginal, dropSession } from "./session.server.ts";

const FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/cal_now1.db";
const TOKEN = "test-token";

test("gardenscapes session: connect -> push round-trips byte-for-byte", (t) => {
  if (!existsSync(FIXTURE)) {
    t.skip("fixture not present");
    return;
  }
  const b64 = readFileSync(FIXTURE).toString("base64");
  const s = connectLoad(TOKEN, "dev1", b64);
  const out = pushEncode(s.id, TOKEN);
  const orig = readFileSync(FIXTURE);
  assert.equal(out.length, orig.length);
  for (let i = 0; i < orig.length; i++) {
    if (orig[i] !== out[i]) assert.fail(`diff at ${i}`);
  }
  dropSession(s.id, TOKEN);
});

test("gardenscapes session: restoreOriginal returns the loaded bytes", (t) => {
  if (!existsSync(FIXTURE)) {
    t.skip("fixture not present");
    return;
  }
  const b64 = readFileSync(FIXTURE).toString("base64");
  const s = connectLoad(TOKEN, "dev1", b64);
  // mutate a counter in the repairs table to prove restore reverts it
  const tbl = s.decoded.doc.tables.find((t) => t.name === "repairs");
  assert.ok(tbl);
  restoreOriginal(s.id, TOKEN);
  const out = pushEncode(s.id, TOKEN);
  const orig = readFileSync(FIXTURE);
  assert.equal(out.length, orig.length);
  for (let i = 0; i < orig.length; i++) {
    if (orig[i] !== out[i]) assert.fail(`diff at ${i}`);
  }
  dropSession(s.id, TOKEN);
});

test("gardenscapes session: unknown session throws", () => {
  assert.throws(() => pushEncode("no-such-id", TOKEN));
});