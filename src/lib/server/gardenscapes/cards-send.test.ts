import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { findTable, type ArrItem, type ObjChild } from "@/lib/gardenscapes/save-engine";
import { sendCardsToFriend, readFriends, readGiftingState } from "./cards.server.ts";
import { connectLoad, dropSession, pushEncode, type GardenscapesSession } from "./session.server.ts";

// A real MEmu save (zen, post-gifting experiments): CardC8 holds the gifting
// core, 7 owned rows, SentCards already recording earlier sends.
const FIXTURE = "C:/Users/User/AppData/Local/Temp/opencode/gs/snap/send-friends.db";
const TOKEN = "test-token";

function withSave(t: { skip(msg: string): void }, fn: (s: GardenscapesSession) => void): void {
  if (!existsSync(FIXTURE)) {
    t.skip("fixture not present");
    return;
  }
  const b64 = readFileSync(FIXTURE).toString("base64");
  const s = connectLoad(TOKEN, "dev1", b64);
  try {
    fn(s);
  } finally {
    dropSession(s.id, TOKEN);
  }
}

/** The CardsGiftingCore children of the save's gifting feature. */
function giftKids(s: GardenscapesSession): ObjChild[] {
  const feat = findTable(s.decoded.doc, "Features")?.entries.find(
    (e) =>
      /^CardC\d+$/.test(e.key) &&
      Array.isArray(e.value) &&
      (e.value as ArrItem[]).some((x) => Array.isArray(x) && x[0] === "CardsGiftingCore"),
  );
  assert.ok(feat, "fixture must hold a gifting feature");
  const gift = (feat.value as ArrItem[]).find(
    (x) => Array.isArray(x) && x[0] === "CardsGiftingCore",
  );
  assert.ok(gift, "fixture must hold CardsGiftingCore");
  return (gift[1] as [string, unknown])[1] as ObjChild[];
}

function rowsOf(kids: ObjChild[], name: string): ArrItem[] {
  const h = kids.find(([k]) => k === name);
  return h && h[1][0] === "a" ? (h[1][1] as ArrItem[]) : [];
}

function kidValue(kids: ObjChild[], name: string): unknown {
  const h = kids.find(([k]) => k === name);
  return h ? h[1][1] : undefined;
}

function rowKids(row: ArrItem): ObjChild[] | null {
  return row[0] === "o" ? (row[1] as ObjChild[]) : null;
}

test("sendCardsToFriend writes the measured PendingSendCards row shape", (t) => {
  withSave(t, (s) => {
    const res = sendCardsToFriend(s, {
      receiverIds: ["mhRwDZPm18", "friendBee9"],
      cardIds: ["card_01"],
    });
    assert.equal(res.queued, 2);
    assert.equal(res.receivers, 2);
    assert.equal(res.cards, 1);

    const kids = giftKids(s);
    const queue = rowsOf(kids, "PendingSendCards");
    assert.equal(queue.length, 2, "one row per friend");

    const first = rowKids(queue[0]!);
    assert.ok(first);
    assert.deepEqual(
      first.map(([k]) => k),
      ["CardId", "CardSourceId", "CollectionId", "ReceiverId", "UniqueGiftingId"],
      "field order the real Send dialog writes",
    );
    assert.equal(kidValue(first, "CardId"), "card_01");
    assert.equal(kidValue(first, "CardSourceId"), "SendFriend");
    assert.equal(kidValue(first, "ReceiverId"), "mhRwDZPm18");
    const gid = String(kidValue(first, "UniqueGiftingId"));
    assert.match(gid, /^[A-Za-z0-9]{16}$/, "16-char base62 gifting id");

    const second = rowKids(queue[1]!);
    assert.ok(second);
    assert.equal(kidValue(second, "ReceiverId"), "friendBee9");
    assert.notEqual(kidValue(first, "UniqueGiftingId"), kidValue(second, "UniqueGiftingId"));
    assert.equal(res.changed.length > 0, true, "reports what it touched");
  });
});

test("every gift is backed by stock and the collection invariants hold", (t) => {
  withSave(t, (s) => {
    // card_01 arrives at stock 0 in the fixture; card_04 at 1.
    sendCardsToFriend(s, {
      receiverIds: ["mhRwDZPm18", "friendBee9", "friendCee9"],
      cardIds: ["card_01", "card_04"],
    });

    // Core lives on the feature, not inside the gifting core — walk the feature.
    const feat = findTable(s.decoded.doc, "Features")!.entries.find((e) => e.key === "CardC8");
    assert.ok(feat);
    const featKids = feat.value as ObjChild[];
    const corePair = featKids.find(([k]) => k === "Core");
    assert.ok(corePair);
    const coreKids = corePair[1][1] as ObjChild[];
    const owned = coreKids.find(([k]) => k === "OwnedCards");
    assert.ok(owned);
    const items = owned[1][1] as ArrItem[];

    let sumGen = 0;
    for (const row of items) {
      const k = rowKids(row);
      assert.ok(k, "every owned row is an object");
      const gen = Number(kidValue(k, "generatedCount"));
      const stock = Number(kidValue(k, "inStockCount"));
      assert.ok(Number.isFinite(gen) && Number.isFinite(stock));
      assert.equal(gen, stock, "gen == stock after a send (measured invariant)");
      assert.ok(stock >= 0, "stock never goes negative");
      sumGen += gen;
    }
    const total = Number(kidValue(coreKids, "TotalObtainedCardsCount"));
    assert.equal(total, sumGen, "TotalObtainedCardsCount == sum(generatedCount)");
  });
});

test("a card the save never held gains a measured row", (t) => {
  withSave(t, (s) => {
    const res = sendCardsToFriend(s, { receiverIds: ["mhRwDZPm18"], cardIds: ["card_07"] });
    assert.equal(res.queued, 1);

    const feat = findTable(s.decoded.doc, "Features")!.entries.find((e) => e.key === "CardC8");
    assert.ok(feat);
    const corePair = (feat.value as ObjChild[]).find(([k]) => k === "Core");
    assert.ok(corePair);
    const coreKids = corePair[1][1] as ObjChild[];
    const owned = coreKids.find(([k]) => k === "OwnedCards");
    assert.ok(owned);
    const row = (owned[1][1] as ArrItem[]).find((r) => {
      const k = rowKids(r);
      return k ? kidValue(k, "cardId") === "card_07" : false;
    });
    assert.ok(row, "row created for the unowned card");
    const k = rowKids(row)!;
    assert.equal(k.map(([name]) => name).join(","), "cardId,generatedCount,inStockCount,isNew");
    assert.equal(kidValue(k, "generatedCount"), kidValue(k, "inStockCount"));
  });
});

test("the daily counter resets the way a new day resets it", (t) => {
  withSave(t, (s) => {
    const kids = giftKids(s);
    const scc = kids.find(([k]) => k === "SendCardsCount");
    const lrd = kids.find(([k]) => k === "LastResetDay");
    assert.ok(scc && lrd, "fixture holds both counters");
    scc[1] = ["i", 7];
    lrd[1] = ["k", 20779];

    sendCardsToFriend(s, { receiverIds: ["mhRwDZPm18"], cardIds: ["card_02"] });

    assert.equal(kidValue(kids, "SendCardsCount"), 0, "count zeroed");
    assert.equal(kidValue(kids, "LastResetDay"), 20778, "LastResetDay stepped back one day");
  });
});

test("bad input refuses before anything is written", (t) => {
  withSave(t, (s) => {
    assert.throws(
      () => sendCardsToFriend(s, { receiverIds: [], cardIds: ["card_01"] }),
      /no friends selected/,
    );
    assert.throws(
      () => sendCardsToFriend(s, { receiverIds: ["okFriend1"], cardIds: [] }),
      /no cards selected/,
    );
    assert.throws(
      () => sendCardsToFriend(s, { receiverIds: ["../etc/passwd"], cardIds: ["card_01"] }),
      /invalid friend id/,
    );
    assert.throws(
      () => sendCardsToFriend(s, { receiverIds: ["okFriend1"], cardIds: ["card_999"] }),
      /unknown card id/,
    );
    assert.equal(rowsOf(giftKids(s), "PendingSendCards").length, 0, "queue untouched");
  });
});

test("readFriends lists who this save has exchanged gifts with", (t) => {
  withSave(t, (s) => {
    const { friends } = readFriends(s);
    const ids = friends.map((f) => f.id);
    assert.ok(ids.includes("mhRwDZPm18"), "earlier sends record their receiver");
    const row = friends.find((f) => f.id === "mhRwDZPm18");
    assert.equal(row?.source, "sent");
    assert.equal(new Set(ids).size, ids.length, "no duplicates");
  });
});

test("readGiftingState counts a queue as it is written", (t) => {
  if (!existsSync(FIXTURE)) {
    t.skip("fixture not present");
    return;
  }
  const b64 = readFileSync(FIXTURE).toString("base64");
  const before = readGiftingState(b64);
  assert.ok(before, "fixture decodes");
  assert.equal(before.pendingSend, 0);

  const s = connectLoad(TOKEN, "dev1", b64);
  try {
    const res = sendCardsToFriend(s, {
      receiverIds: ["mhRwDZPm18", "friendBee9"],
      cardIds: ["card_01", "card_02", "card_03"],
    });
    assert.equal(res.queued, 6);
    const after = readGiftingState(pushEncode(s.id, TOKEN).toString("base64"));
    assert.ok(after);
    assert.equal(after.pendingSend, 6, "queue visible in the encoded bytes");
    assert.equal(after.sent, before.sent, "SentCards untouched by queueing");
    assert.equal(after.sendCardsCount, 0);
  } finally {
    dropSession(s.id, TOKEN);
  }
});
