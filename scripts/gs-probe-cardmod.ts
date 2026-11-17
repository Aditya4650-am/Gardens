// End-to-end probe of cards.server.ts against every save in the corpus.
// Read-only on disk (sessions are in-memory): loads each save, checks the
// measured invariants, exercises every public op, and proves the edited
// document survives an encode -> decode round trip with invariants intact.
// Exit code 1 on any FAIL.

import { readFileSync } from "node:fs";
import { connectLoad, pushEncode } from "../src/lib/server/gardenscapes/session.server.ts";
import {
  acceptReceivedCards,
  clearGiftingInbox,
  grantCards,
  markCardsSeen,
  planCardSend,
  readCards,
  setAllStock,
  setCardNew,
  setCardStock,
  setEventActive,
  setGrandCollection,
  setPackCount,
  setPackStreak,
  sendCardsToSelf,
} from "../src/lib/server/gardenscapes/cards.server.ts";
import { decodeSave } from "../src/lib/gardenscapes/save-engine.ts";
import { getRef } from "../src/lib/gardenscapes/save-engine.ts";
import { entry } from "../src/lib/server/gardenscapes/common.server.ts";
import { GS_CARDS } from "../src/lib/server/gardenscapes/catalogs.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("../_ref/mined/GameData.db");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function invariantsHold(label: string, s: ReturnType<typeof connectLoad>): void {
  const info = readCards(s);
  check(`${label}: total == sum(gen)`, info.invariants.totalMatches,
    `total=${info.total} rows=${info.cards.length}`);
  check(`${label}: lastSeenProgress == count(isNew=false) per set`, info.invariants.setsMatch);
  check(`${label}: no duplicate card ids`, info.invariants.uniqueIds);
  check(`${label}: all ids known (card_01..card_150)`, info.invariants.knownIds);
  check(`${label}: rows well formed`, info.invariants.rowsWellFormed);
  check(`${label}: 15 set rows`, info.sets.length === 15, `got ${info.sets.length}`);
  check(`${label}: 6 pack rows`, info.packs.length === 6, `got ${info.packs.length}`);
}

for (const path of paths) {
  const buf = readFileSync(path);
  console.log(`\n===== ${path} =====`);
  const s = connectLoad("probe", "none", buf.toString("base64"));

  // --- read + invariants on arrival -------------------------------------
  const info = readCards(s);
  console.log(`  active=${info.featureId} owned=${info.cards.length} total=${info.total} ` +
    `features=[${info.features.map((f) => `${f.id}${f.active ? "*" : ""}${f.hasCore ? "" : "(no Core)"}:${f.ownedRows}`).join(" ")}]`);
  invariantsHold("arrival", s);
  check("arrival: at least one CardC* feature", info.features.length >= 1);

  // --- grant an unowned card --------------------------------------------
  const unowned = info.catalog.filter((c) => !c.owned);
  const target = unowned[0];
  if (target) {
    const before = info.total;
    const r1 = grantCards(s, [target.cardId], 5);
    check("grant: reports the new row", r1.changed.some((p) => p.endsWith(target.cardId)));
    const after1 = readCards(s);
    check("grant: total rose by 5", after1.total === before + 5,
      `${before} -> ${after1.total}`);
    check("grant: new row starts isNew=true", after1.cards.find((c) => c.cardId === target.cardId)?.isNew === true);
    check("grant: created row field order", (() => {
      const e = entry(s.decoded.doc, "Features", after1.featureId)!;
      const ref = getRef(e, "Core.OwnedCards");
      if (!ref || ref.type !== "a") return false;
      for (const row of ref.value as any[]) {
        const kids = row[1];
        const id = kids.find((c: any) => c[0] === "cardId")?.[1][1];
        if (id !== target.cardId) continue;
        const keys = kids.map((c: any) => c[0]).join(",");
        const isNewType = kids.find((c: any) => c[0] === "isNew")?.[1][0];
        return keys === "cardId,generatedCount,inStockCount,isNew" && isNewType === "t";
      }
      return false;
    })(), "order/tag mismatch");
    invariantsHold("post-grant", s);

    // --- stock edit on an existing row -----------------------------------
    const r2 = setCardStock(s, target.cardId, 3);
    check("setCardStock: changed", r2.changed.length > 0);
    const row2 = readCards(s).cards.find((c) => c.cardId === target.cardId);
    check("setCardStock: gen == stock == 3",
      row2?.generatedCount === 3 && row2?.inStockCount === 3,
      `gen=${row2?.generatedCount} stock=${row2?.inStockCount}`);
    invariantsHold("post-stock", s);

    // --- stock edit on a row the save does not hold -----------------------
    const rMiss = setCardStock(s, unowned[1] ? unowned[1].cardId : "card_150", 4);
    check("setCardStock: missing row reported, nothing created",
      rMiss.changed.length === 0 && rMiss.missing.length === 1);

    // --- isNew both directions -------------------------------------------
    setCardNew(s, target.cardId, false);
    check("setCardNew(false): dot cleared and progress re-derived",
      readCards(s).invariants.setsMatch);
    setCardNew(s, target.cardId, true);
    check("setCardNew(true): progress still consistent",
      readCards(s).invariants.setsMatch);

    // --- unknown card id rejected ----------------------------------------
    const rBad = grantCards(s, ["card_999"], 1);
    check("grant: unknown id lands in missing", rBad.missing.length === 1 && rBad.changed.length === 0);
  } else {
    console.log("  (save already holds the full catalog — grant target skipped)");
  }

  // --- packs / streak / flags --------------------------------------------
  const rPack = setPackCount(s, "PackLevel3", 42);
  check("setPackCount: changed", rPack.changed.length > 0);
  const packType = (() => {
    const e = entry(s.decoded.doc, "Features", readCards(s).featureId)!;
    const ref = getRef(e, "Core.GivenPackInfos");
    if (!ref || ref.type !== "a") return "?";
    for (const row of ref.value as any[]) {
      const kids = row[1];
      if (kids.find((c: any) => c[0] === "id")?.[1][1] === "PackLevel3") {
        return kids.find((c: any) => c[0] === "count")?.[1][0];
      }
    }
    return "?";
  })();
  check("setPackCount: u16 type g preserved", packType === "g", `type=${packType}`);
  check("setPackCount: value", readCards(s).packs.find((p) => p.id === "PackLevel3")?.count === 42);
  let packThrew = "";
  try { setPackCount(s, "PackLevel9", 1); } catch (e) { packThrew = (e as Error).message; }
  check("setPackCount: unknown pack refused", packThrew.includes("unknown pack"));

  const rStreak = setPackStreak(s, 7);
  check("setPackStreak: changed", rStreak.changed.length > 0);
  check("setPackStreak: value", readCards(s).streak === 7);
  let threw = false;
  try { setPackStreak(s, -1); } catch { threw = true; }
  check("setPackStreak: negative refused", threw);

  const rGrand = setGrandCollection(s, true);
  check("setGrandCollection: changed", rGrand.changed.length > 0 && rGrand.missing.length === 0,
    `missing=${rGrand.missing.join(",")}`);
  check("setGrandCollection: read back", readCards(s).grandCollection === true);
  setGrandCollection(s, false);

  const evBefore = readCards(s).eventActive;
  const rEvent = setEventActive(s, true);
  if (evBefore) {
    check("setEventActive: already true is a clean noop", rEvent.changed.length === 0 && rEvent.missing.length === 0);
  } else {
    check("setEventActive: changed", rEvent.changed.length > 0 && rEvent.missing.length === 0);
    check("setEventActive: read back", readCards(s).eventActive === true);
    setEventActive(s, false);
  }

  // --- send plan (validates, never writes) --------------------------------
  const bytesBefore = Buffer.from(pushEncode(s.id, "probe"));
  let plan: any = null;
  let planErr = "";
  try {
    plan = planCardSend(s, {
      recipients: ["neQ2UfwwGz", "CsKEeUDtYh"],
      cardIds: ["card_01", "card_02", "card_03"],
      amount: 250,
    });
  } catch (e) {
    planErr = (e as Error).message;
  }
  check("plan: builds", !!plan, planErr);
  if (plan) {
    check("plan: deliverable is literally false", plan.deliverable === false);
    check("plan: notice present", typeof plan.notice === "string" && plan.notice.length > 40);
    check("plan: totalCards = cards x amount", plan.totalCards === 750, `got ${plan.totalCards}`);
    check("plan: 3 rows with sets", plan.rows.length === 3 && plan.rows.every((r: any) => /^set_\d{2}$/.test(r.setId)));
    check("plan: owned flags reported", typeof plan.ownedCount === "number" && typeof plan.unownedCount === "number");
  }
  const planSameDoc = Buffer.from(pushEncode(s.id, "probe")).equals(bytesBefore);
  check("plan: performs no writes", planSameDoc);

  for (const [name, fn] of [
    ["8 recipients over cap", () => planCardSend(s, { recipients: Array.from({ length: 8 }, (_, i) => `id0000${i}`), cardIds: ["card_01"], amount: 1 })],
    ["bad recipient id", () => planCardSend(s, { recipients: ["bad id!!"], cardIds: ["card_01"], amount: 1 })],
    ["amount 0", () => planCardSend(s, { recipients: ["abc123"], cardIds: ["card_01"], amount: 0 })],
    ["amount 10000", () => planCardSend(s, { recipients: ["abc123"], cardIds: ["card_01"], amount: 10000 })],
    ["unknown card", () => planCardSend(s, { recipients: ["abc123"], cardIds: ["card_151"], amount: 1 })],
    ["no cards", () => planCardSend(s, { recipients: ["abc123"], cardIds: [], amount: 1 })],
  ] as [string, () => unknown][]) {
    let t = false;
    try { fn(); } catch { t = true; }
    check(`plan refuses: ${name}`, t);
  }
  check("plan: doc untouched after all refusals",
    Buffer.from(pushEncode(s.id, "probe")).equals(bytesBefore));

  // --- receive into my save (real write) ----------------------------------
  const beforeSelf = readCards(s).total;
  const rSelf = sendCardsToSelf(s, { cardIds: ["card_01", "card_02"], amount: 300 });
  check("sendToSelf: wrote rows", rSelf.changed.length > 0);
  check("sendToSelf: total +600", readCards(s).total === beforeSelf + 600,
    `${beforeSelf} -> ${readCards(s).total}`);
  invariantsHold("post-sendToSelf", s);

  // --- gifting -------------------------------------------------------------
  const giftBefore = readCards(s).gifting.received.length;
  const rAccept = acceptReceivedCards(s);
  if (giftBefore > 0) {
    check("accept: granted and inbox emptied",
      rAccept.changed.length > 0 && readCards(s).gifting.received.length === 0);
    invariantsHold("post-accept", s);
  } else {
    check("accept: empty inbox is a clean no-op",
      rAccept.changed.length === 0 && rAccept.missing.length === 0);
  }
  const rClear = clearGiftingInbox(s);
  check("clearInbox: clean no-op when empty", rClear.changed.length === 0);

  // --- mark all seen + set-all-stock ---------------------------------------
  markCardsSeen(s);
  const mid = readCards(s);
  check("markAllSeen: no isNew left", mid.cards.every((c) => !c.isNew));
  check("markAllSeen: sets consistent", mid.invariants.setsMatch);
  check("markAllSeen: progress == owned for every set",
    mid.sets.every((x) => x.lastSeenProgress === x.owned),
    mid.sets.filter((x) => x.lastSeenProgress !== x.owned).map((x) => `${x.setId}:${x.lastSeenProgress}!=${x.owned}`).join(" "));
  setAllStock(s, 4);
  check("setAllStock: every owned row gen==stock==4",
    readCards(s).cards.every((c) => c.generatedCount === 4 && c.inStockCount === 4));
  invariantsHold("post-setAll", s);

  // --- complete collection --------------------------------------------------
  const stillMissing = readCards(s).catalog.filter((c) => !c.owned).map((c) => c.cardId);
  if (stillMissing.length) {
    grantCards(s, stillMissing, 1);
    markCardsSeen(s);
  }
  const full = readCards(s);
  check("complete: 150 rows, no dups", full.cards.length === 150 && full.invariants.uniqueIds,
    `rows=${full.cards.length}`);
  check("complete: all invariants", full.invariants.totalMatches && full.invariants.setsMatch && full.invariants.knownIds);
  check("complete: every set shows 10/10",
    full.sets.every((x) => x.owned === 10 && x.lastSeenProgress === 10 && x.complete),
    full.sets.map((x) => `${x.setId}:${x.owned}/${x.lastSeenProgress}`).join(" "));
  check("complete: catalog size 150", GS_CARDS.length === 150);

  // --- encode -> decode round trip -----------------------------------------
  const encoded = pushEncode(s.id, "probe");
  const again = decodeSave(encoded);
  const s2 = connectLoad("probe", "none", Buffer.from(pushEncode(s.id, "probe")).toString("base64"));
  void again;
  const rt = readCards(s2);
  check("roundtrip: 150 rows survive", rt.cards.length === full.cards.length,
    `${full.cards.length} -> ${rt.cards.length}`);
  check("roundtrip: totals survive", rt.total === full.total, `${full.total} -> ${rt.total}`);
  check("roundtrip: invariants hold after re-encode",
    rt.invariants.totalMatches && rt.invariants.setsMatch && rt.invariants.uniqueIds);
  check("roundtrip: streak/pack/flags survive",
    rt.streak === full.streak &&
    (full.packs.find((p) => p.id === "PackLevel3")?.count ?? -1) ===
    (rt.packs.find((p) => p.id === "PackLevel3")?.count ?? -2));

  console.log(`  log tail: ${s.log.slice(-4).join(" | ")}`);
}

console.log(`\n==== ${pass} pass, ${fail} fail ====`);
process.exit(fail ? 1 : 0);
