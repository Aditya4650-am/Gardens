import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeSave, encodeSave } from "./save-engine.ts";

const FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/cal_now1.db";

test("gardenscapes AUDB codec round-trips a real save byte-for-byte", (t) => {
  if (!existsSync(FIXTURE)) {
    t.skip("fixture not present");
    return;
  }
  const cipher = readFileSync(FIXTURE);
  const dec = decodeSave(cipher);
  const out = encodeSave(dec.doc);
  assert.equal(out.length, cipher.length, "length must match");
  for (let i = 0; i < cipher.length; i++) {
    if (cipher[i] !== out[i]) {
      assert.fail(`byte mismatch at offset ${i}`);
    }
  }
});

test("gardenscapes AUDB codec parses the magic header", (t) => {
  if (!existsSync(FIXTURE)) {
    t.skip("fixture not present");
    return;
  }
  const cipher = readFileSync(FIXTURE);
  const dec = decodeSave(cipher);
  assert.equal(dec.version, 1);
  assert.ok(dec.doc.tables.length > 0, "expected at least one table");
});