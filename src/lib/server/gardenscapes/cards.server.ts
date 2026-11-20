// Cards â€” collection inventory, sets, packs, gifting and send-cards.
//
// Measured on 3 real saves (mined GameData.db, Telegram GameData.db, and the
// live MEmu save pulled this session). Every row below keeps its measured
// FIELD ORDER â€” nothing here invents a shape no save holds:
//   Features.<CardC*>            (CardC3..CardC9 exist per save)
//     Core (absent on CardC5/6/9):
//       OwnedCards     a  rows {cardId s, generatedCount i, inStockCount i, isNew f}
//       OwnedSets      a  rows {isRewardGiven f, lastSeenProgress i, setId s} â€” 15 rows
//       GivenPackInfos a  rows {count g, id s} â€” exactly 6 rows
//       PendingPacks   a  â€” always 0 rows; a row's shape was never observed,
//                            so this module never writes into it
//       Blockers       a  rows {BlockersPairs a, setId s} (CardC3 only; pairs are
//                            {blockerCardId s, trashCardId s} inside the set's group of 10)
//       TotalObtainedCardsCount i Â· FourthPack_CurrentStreak i
//     CardsGiftingCore {LastResetDay k, PendingReceivedCards a, PendingSendCards a,
//                       ReceivedCards a, SendCardsCount i, SentCards a}
//       ReceivedCards row (measured on the live save):
//         {belongingCollectionId s, cardId s, cardSourceId s, senderId s, uniqueGiftingId s}
//       SentCards / PendingSendCards rows were never non-empty in any save â€”
//       their shape is unknown, so they are NEVER written (read as counts only).
//     CardsRequester {RequestTimestamp k}
//     <CardC*>Loader  {IsEventActive f, IsGrandCollection f}
//
// Invariants this module re-establishes after every write (proven 3/3 saves):
//   - sum(generatedCount) == TotalObtainedCardsCount
//   - per set: lastSeenProgress == count(rows with isNew == false)
//   - no duplicate cardId; every id inside card_01..card_150
//   - cardâ†’set mapping is the group of ten: set = pad2(floor((n-1)/10)+1)
//     (verified 15/15 against the live save's lastSeenProgress)
//   - OwnedSets = 15 rows, GivenPackInfos = 6 rows, isRewardGiven all false
//   - a created OwnedCards row starts isNew=true, which moves no counter
//     (the game flips it to false when the player views the collection)
//
// Gifting: a Gardenscapes save holds NO friend roster (only an empty
// GameFriendsBridge) and no Playrix card-send endpoint exists, so nothing here
// pretends to deliver a card to another player. What does work locally â€” and
// is what the Cards tab uses â€” is the real row write: granting cards into the
// live save and accepting the save's own `ReceivedCards` inbox.

import {
  fitNumericType,
  getRef,
  objEntries,
  toInt,
  type ArrItem,
  type ObjChild,
} from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { applyOps, table, type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";
import { GS_CARDS, GS_CARD_PACKS, gsCardById } from "./catalogs.ts";

const FEATURES = "Features";
const CARD_FEATURE = /^CardC\d+$/;

/** OxxEditor's own `cardAmount` bounds (its card grid sends 1..9999 each). */
export const GS_CARD_AMOUNT_MIN = 1;
export const GS_CARD_AMOUNT_MAX = 9999;
/** `GivenPackInfos.count` is stored as type `g` = u16. */
export const GS_PACK_COUNT_MAX = 65535;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GsCardRow {
  cardId: string;
  number: number;
  setId: string;
  generatedCount: number;
  inStockCount: number;
  isNew: boolean;
}

export interface GsSetRow {
  setId: string;
  lastSeenProgress: number;
  isRewardGiven: boolean;
  /** Rows owned in this set (out of 10). */
  owned: number;
  /** Rows with isNew=false in this set. */
  seen: number;
  /** All 10 cards owned. */
  complete: boolean;
}

export interface GsPackRow {
  id: string;
  count: number;
}

export interface GsGiftRow {
  belongingCollectionId: string;
  cardId: string;
  cardSourceId: string;
  senderId: string;
  uniqueGiftingId: string;
}

export interface GsFeatureStatus {
  id: string;
  hasCore: boolean;
  ownedRows: number;
  active: boolean;
  isEventActive: boolean;
  isGrandCollection: boolean;
}

export interface GsBlockers {
  featureId: string;
  setId: string;
  pairs: { blockerCardId: string; trashCardId: string }[];
}

export interface GsCardsInfo {
  /** The CardC* this save actually plays (non-empty OwnedCards, newest first). */
  featureId: string;
  features: GsFeatureStatus[];
  /** Owned rows of the active feature, measured field order. */
  cards: GsCardRow[];
  /** The whole card_01..card_150 catalog joined with this save's state. */
  catalog: Array<GsCardRow & { owned: boolean }>;
  sets: GsSetRow[];
  packs: GsPackRow[];
  blockers: GsBlockers[];
  total: number;
  streak: number;
  pendingPacks: number;
  eventActive: boolean;
  grandCollection: boolean;
  gifting: {
    lastResetDay: number;
    sendCardsCount: number;
    requestTimestamp: number;
    received: GsGiftRow[];
    pendingReceived: number;
    pendingSend: number;
    sent: number;
  };
  /** Live self-check of the invariants after every edit. */
  invariants: {
    totalMatches: boolean;
    setsMatch: boolean;
    uniqueIds: boolean;
    knownIds: boolean;
    rowsWellFormed: boolean;
  };
}

// ---------------------------------------------------------------------------
// Feature / row helpers
// ---------------------------------------------------------------------------

function featureHits(d: AUDBDocument): { id: string; num: number; feat: AUDBEntry }[] {
  const t = table(d, FEATURES);
  if (!t) return [];
  return t.entries
    .filter((e) => CARD_FEATURE.test(e.key))
    .map((e) => ({ id: e.key, num: Number(e.key.slice(5)), feat: e }))
    .sort((a, b) => a.num - b.num);
}

/**
 * The feature this save plays: Core exists and OwnedCards is non-empty.
 * Proven on all 3 saves â€” CardC8 (mined + live) and CardC7 (Telegram), while
 * CardC3/4 carry an empty Core and CardC5/6/9 have no Core at all. Ties go to
 * the newest (highest) feature; a save whose every Core is empty falls back to
 * the newest feature that has a Core, so a fresh collection can still be edited.
 */
function activeFeature(d: AUDBDocument): { id: string; feat: AUDBEntry } {
  const hits = featureHits(d);
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]!;
    const rows = arrOf(h.feat, "Core.OwnedCards");
    if (rows && rows.length > 0) return h;
  }
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]!;
    if (coreKids(h.feat)) return h;
  }
  throw new Error("cards: save has no CardC* feature with a Core");
}

function coreKids(feat: AUDBEntry): ObjChild[] | null {
  const hit = childOf(feat, "Core");
  return hit && hit[1][0] === "o" ? (hit[1][1] as ObjChild[]) : null;
}

/** One child `[key, [type, value]]` of an object entry, or null. */
function childOf(entry: AUDBEntry, key: string): ObjChild | null {
  if (entry.type !== "o") return null;
  return objEntries(entry).find(([k]) => k === key) ?? null;
}

function arrOf(feat: AUDBEntry, path: string): ArrItem[] | null {
  const ref = getRef(feat, path);
  return ref && ref.type === "a" ? (ref.value as ArrItem[]) : null;
}

function kidVal(kids: ObjChild[], key: string): unknown {
  const h = kids.find(([k]) => k === key);
  return h ? h[1][1] : undefined;
}

function kidNum(kids: ObjChild[], key: string): number {
  const h = kids.find(([k]) => k === key);
  return h ? (toInt(h[1][1]) ?? 0) : 0;
}

function rowKids(row: ArrItem): ObjChild[] | null {
  return row[0] === "o" ? (row[1] as ObjChild[]) : null;
}

/** Set a numeric field of an array row, preserving its stored type. */
function rowSetNumber(kids: ObjChild[], key: string, value: number): boolean {
  const h = kids.find(([k]) => k === key);
  if (!h) return false;
  if (h[1][1] === value) return false;
  h[1] = [fitNumericType(h[1][0], value), value];
  return true;
}

/** Set a boolean field of an array row (`t`/`f` tag must match the value). */
function rowSetBool(kids: ObjChild[], key: string, value: boolean): boolean {
  const h = kids.find(([k]) => k === key);
  if (!h) return false;
  if (h[1][1] === value && h[1][0] === (value ? "t" : "f")) return false;
  h[1] = [value ? "t" : "f", value];
  return true;
}

/** Loader entry of a feature (`CardC8Loader`), searched by name then suffix. */
function loaderOf(feat: AUDBEntry): { key: string; kids: ObjChild[] } | null {
  const exact = childOf(feat, `${feat.key}Loader`);
  if (exact && exact[1][0] === "o") {
    return { key: exact[0], kids: exact[1][1] as ObjChild[] };
  }
  const kids = feat.type === "o" ? (feat.value as ObjChild[]) : [];
  for (const [k, v] of kids) {
    if (k.endsWith("Loader") && v[0] === "o") return { key: k, kids: v[1] as ObjChild[] };
  }
  return null;
}

function loaderFlag(feat: AUDBEntry, flag: string): { path: string; on: boolean } | null {
  const l = loaderOf(feat);
  if (!l) return null;
  const h = l.kids.find(([k]) => k === flag);
  return { path: `Features.${feat.key}.${l.key}.${flag}`, on: h ? h[1][1] === true : false };
}

function requireInt(value: number, min: number, max: number, what: string): number {
  if (!Number.isFinite(value)) throw new Error(`cards: ${what} must be a number`);
  const n = Math.trunc(value);
  if (n < min || n > max) throw new Error(`cards: ${what} must be ${min}..${max}`);
  return n;
}

function activeOrFail(s: GardenscapesSession): { id: string; feat: AUDBEntry } {
  return activeFeature(s.decoded.doc);
}

/**
 * Re-establish the two proven invariants after any OwnedCards change:
 * TotalObtainedCardsCount = sum(generatedCount), and each set's
 * lastSeenProgress = count of its rows with isNew=false. Returns the paths
 * that actually moved. A Core field the save does not hold is reported by the
 * caller's EditResult instead of being invented.
 */
function syncInvariants(feat: AUDBEntry): string[] {
  const changed: string[] = [];
  const core = coreKids(feat);
  if (!core) return changed;
  const rows = arrOf(feat, "Core.OwnedCards") ?? [];

  let sum = 0;
  const seenBySet = new Map<string, number>();
  for (const r of rows) {
    const k = rowKids(r);
    if (!k) continue;
    sum += kidNum(k, "generatedCount");
    const id = kidVal(k, "cardId");
    if (typeof id === "string" && kidVal(k, "isNew") !== true) {
      const set = gsCardById(id)?.setId;
      if (set) seenBySet.set(set, (seenBySet.get(set) ?? 0) + 1);
    }
  }

  const total = core.find(([k]) => k === "TotalObtainedCardsCount");
  if (total && (toInt(total[1][1]) ?? -1) !== sum) {
    total[1] = [fitNumericType(total[1][0], sum), sum];
    changed.push(`Features.${feat.key}.Core.TotalObtainedCardsCount`);
  }

  const sets = arrOf(feat, "Core.OwnedSets") ?? [];
  for (const r of sets) {
    const k = rowKids(r);
    if (!k) continue;
    const setId = kidVal(k, "setId");
    if (typeof setId !== "string") continue;
    const seen = seenBySet.get(setId) ?? 0;
    const h = k.find(([kk]) => kk === "lastSeenProgress");
    if (h && (toInt(h[1][1]) ?? -1) !== seen) {
      h[1] = [fitNumericType(h[1][0], seen), seen];
      changed.push(`Features.${feat.key}.Core.OwnedSets.${setId}.lastSeenProgress`);
    }
  }
  return changed;
}

/**
 * The one grant primitive: bump gen+stock on existing rows, create a row in
 * measured field order for ids the save does not hold yet (isNew=true, which
 * moves no counter), then re-derive both invariants.
 */
function applyGrant(
  s: GardenscapesSession,
  feat: AUDBEntry,
  ids: string[],
  amount: number,
): EditResult {
  const rows = arrOf(feat, "Core.OwnedCards");
  if (!rows) throw new Error("cards: save has no Core.OwnedCards array");
  const base = `Features.${feat.key}.Core.OwnedCards`;
  const changed: string[] = [];
  const missing: string[] = [];
  const index = new Map<string, ObjChild[]>();
  for (const r of rows) {
    const k = rowKids(r);
    if (!k) continue;
    const id = kidVal(k, "cardId");
    if (typeof id === "string") index.set(id, k);
  }
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (!gsCardById(id)) {
      missing.push(`${base}.${id}`);
      continue;
    }
    const k = index.get(id);
    if (k) {
      rowSetNumber(k, "generatedCount", kidNum(k, "generatedCount") + amount);
      rowSetNumber(k, "inStockCount", kidNum(k, "inStockCount") + amount);
      changed.push(`${base}.${id}`);
    } else {
      rows.push([
        "o",
        [
          ["cardId", ["s", id]],
          ["generatedCount", ["i", amount]],
          ["inStockCount", ["i", amount]],
          ["isNew", ["t", true]],
        ],
      ]);
      changed.push(`${base}.${id}`);
    }
  }
  changed.push(...syncInvariants(feat));
  return { changed, missing };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Everything the Cards tab shows before the user presses anything. */
export function readCards(s: GardenscapesSession): GsCardsInfo {
  const d: AUDBDocument = s.decoded.doc;
  const hits = featureHits(d);
  const act = activeFeature(d);
  const core = coreKids(act.feat);

  const cards: GsCardRow[] = [];
  const rows = arrOf(act.feat, "Core.OwnedCards") ?? [];
  let rowsWellFormed = true;
  for (const r of rows) {
    const k = rowKids(r);
    if (!k) {
      rowsWellFormed = false;
      continue;
    }
    const id = kidVal(k, "cardId");
    if (typeof id !== "string") {
      rowsWellFormed = false;
      continue;
    }
    const cat = gsCardById(id);
    cards.push({
      cardId: id,
      number: cat ? cat.number : -1,
      setId: cat ? cat.setId : "",
      generatedCount: kidNum(k, "generatedCount"),
      inStockCount: kidNum(k, "inStockCount"),
      isNew: kidVal(k, "isNew") === true,
    });
  }

  // Set rows with their derived progress state.
  const ownedBySet = new Map<string, { owned: number; seen: number }>();
  for (const c of cards) {
    if (!c.setId) continue;
    const cur = ownedBySet.get(c.setId) ?? { owned: 0, seen: 0 };
    cur.owned++;
    if (!c.isNew) cur.seen++;
    ownedBySet.set(c.setId, cur);
  }
  const sets: GsSetRow[] = [];
  for (const r of arrOf(act.feat, "Core.OwnedSets") ?? []) {
    const k = rowKids(r);
    if (!k) continue;
    const setId = kidVal(k, "setId");
    if (typeof setId !== "string") continue;
    const tally = ownedBySet.get(setId) ?? { owned: 0, seen: 0 };
    sets.push({
      setId,
      lastSeenProgress: kidNum(k, "lastSeenProgress"),
      isRewardGiven: kidVal(k, "isRewardGiven") === true,
      owned: tally.owned,
      seen: tally.seen,
      complete: tally.owned >= 10,
    });
  }

  const packs: GsPackRow[] = [];
  for (const r of arrOf(act.feat, "Core.GivenPackInfos") ?? []) {
    const k = rowKids(r);
    if (!k) continue;
    const id = kidVal(k, "id");
    if (typeof id !== "string") continue;
    packs.push({ id, count: kidNum(k, "count") });
  }

  const blockers: GsBlockers[] = [];
  for (const h of hits) {
    for (const r of arrOf(h.feat, "Core.Blockers") ?? []) {
      const k = rowKids(r);
      if (!k) continue;
      const setId = kidVal(k, "setId");
      if (typeof setId !== "string") continue;
      const pairs: GsBlockers["pairs"] = [];
      const inner = kidVal(k, "BlockersPairs");
      if (Array.isArray(inner)) {
        for (const p of inner as ArrItem[]) {
          const pk = rowKids(p);
          if (!pk) continue;
          const blockerCardId = kidVal(pk, "blockerCardId");
          const trashCardId = kidVal(pk, "trashCardId");
          if (typeof blockerCardId === "string" && typeof trashCardId === "string") {
            pairs.push({ blockerCardId, trashCardId });
          }
        }
      }
      blockers.push({ featureId: h.id, setId, pairs });
    }
  }

  const features: GsFeatureStatus[] = hits.map((h) => {
    const hk = coreKids(h.feat);
    const ev = loaderFlag(h.feat, "IsEventActive");
    const gr = loaderFlag(h.feat, "IsGrandCollection");
    return {
      id: h.id,
      hasCore: !!hk,
      ownedRows: (arrOf(h.feat, "Core.OwnedCards") ?? []).length,
      active: h.id === act.id,
      isEventActive: ev ? ev.on : false,
      isGrandCollection: gr ? gr.on : false,
    };
  });

  // Gifting state of the active feature.
  const gift = childOf(act.feat, "CardsGiftingCore");
  const giftKids = gift && gift[1][0] === "o" ? (gift[1][1] as ObjChild[]) : null;
  const giftArr = (key: string): ArrItem[] => {
    const h = giftKids?.find(([k]) => k === key);
    return h && h[1][0] === "a" ? (h[1][1] as ArrItem[]) : [];
  };
  const received: GsGiftRow[] = [];
  for (const r of giftArr("ReceivedCards")) {
    const k = rowKids(r);
    if (!k) continue;
    const str = (key: string): string => {
      const v = kidVal(k, key);
      return typeof v === "string" ? v : "";
    };
    received.push({
      belongingCollectionId: str("belongingCollectionId"),
      cardId: str("cardId"),
      cardSourceId: str("cardSourceId"),
      senderId: str("senderId"),
      uniqueGiftingId: str("uniqueGiftingId"),
    });
  }
  const giftNum = (key: string): number => {
    const h = giftKids?.find(([k]) => k === key);
    return h ? (toInt(h[1][1]) ?? 0) : 0;
  };
  const requester = childOf(act.feat, "CardsRequester");
  const reqKids = requester && requester[1][0] === "o" ? (requester[1][1] as ObjChild[]) : null;
  const reqTs = reqKids?.find(([k]) => k === "RequestTimestamp");

  const total = core ? kidNum(core, "TotalObtainedCardsCount") : 0;
  const sumGen = cards.reduce((a, c) => a + c.generatedCount, 0);
  const ids = cards.map((c) => c.cardId);

  const ev = loaderFlag(act.feat, "IsEventActive");
  const gr = loaderFlag(act.feat, "IsGrandCollection");

  return {
    featureId: act.id,
    features,
    cards,
    catalog: GS_CARDS.map((c) => {
      const owned = cards.find((x) => x.cardId === c.id);
      return {
        cardId: c.id,
        number: c.number,
        setId: c.setId,
        generatedCount: owned ? owned.generatedCount : 0,
        inStockCount: owned ? owned.inStockCount : 0,
        isNew: owned ? owned.isNew : false,
        owned: !!owned,
      };
    }),
    sets,
    packs,
    blockers,
    total,
    streak: core ? kidNum(core, "FourthPack_CurrentStreak") : 0,
    pendingPacks: (arrOf(act.feat, "Core.PendingPacks") ?? []).length,
    eventActive: ev ? ev.on : false,
    grandCollection: gr ? gr.on : false,
    gifting: {
      lastResetDay: giftNum("LastResetDay"),
      sendCardsCount: giftNum("SendCardsCount"),
      requestTimestamp: reqTs ? (toInt(reqTs[1][1]) ?? 0) : 0,
      received,
      pendingReceived: giftArr("PendingReceivedCards").length,
      pendingSend: giftArr("PendingSendCards").length,
      sent: giftArr("SentCards").length,
    },
    invariants: {
      totalMatches: sumGen === total,
      setsMatch: sets.every((x) => x.lastSeenProgress === x.seen),
      uniqueIds: ids.length === new Set(ids).size,
      knownIds: cards.every((c) => c.number > 0),
      rowsWellFormed,
    },
  };
}

/** Dashboard counts for the Cards section. */
export function cardsSummary(s: GardenscapesSession): {
  featureId: string;
  owned: number;
  total: number;
  setsComplete: number;
  pendingGifts: number;
} {
  const info = readCards(s);
  return {
    featureId: info.featureId,
    owned: info.cards.length,
    total: info.total,
    setsComplete: info.sets.filter((x) => x.complete).length,
    pendingGifts: info.gifting.received.length,
  };
}

// ---------------------------------------------------------------------------
// Inventory edits
// ---------------------------------------------------------------------------

/** Grant cards: bump gen+stock on rows the save holds, create rows it does not. */
export function grantCards(
  s: GardenscapesSession,
  ids: string[],
  amount = 1,
): EditResult {
  const amt = requireInt(amount, GS_CARD_AMOUNT_MIN, GS_CARD_AMOUNT_MAX, "amount");
  if (ids.length === 0) throw new Error("cards: no cards selected");
  const { feat } = activeOrFail(s);
  const res = applyGrant(s, feat, ids, amt);
  if (res.changed.length) {
    s.log.push(`Cards: granted ${new Set(ids).size} card(s) x${amt}`);
  }
  return res;
}

/**
 * Deliver cards into this save. A Gardenscapes gift is handed over by the game
 * server, so a save edit can only mint them for the account doing the editing —
 * which is exactly what this does, through the measured grant path.
 */
export function sendCardsToSelf(
  s: GardenscapesSession,
  req: { cardIds: string[]; amount: number },
): EditResult {
  const amount = requireInt(req.amount, GS_CARD_AMOUNT_MIN, GS_CARD_AMOUNT_MAX, "amount per card");
  if (!req.cardIds || req.cardIds.length === 0) throw new Error("cards: no cards selected");
  const res = grantCards(s, req.cardIds, amount);
  s.log.push(`Cards: delivered ${new Set(req.cardIds).size} card(s) x${amount}`);
  return res;
}

/**
 * Set one card's stock (and generatedCount â€” every measured row keeps the two
 * equal, so this module never writes gen != stock). Missing row is reported:
 * stock is edited, not created.
 */
export function setCardStock(
  s: GardenscapesSession,
  cardId: string,
  stock: number,
): EditResult {
  const n = requireInt(stock, GS_CARD_AMOUNT_MIN, GS_CARD_AMOUNT_MAX, "stock");
  if (!gsCardById(cardId)) throw new Error(`cards: unknown card id "${cardId}"`);
  const { id, feat } = activeOrFail(s);
  const rows = arrOf(feat, "Core.OwnedCards") ?? [];
  const base = `Features.${id}.Core.OwnedCards.${cardId}`;
  for (const r of rows) {
    const k = rowKids(r);
    if (!k || kidVal(k, "cardId") !== cardId) continue;
    const changed: string[] = [];
    if (rowSetNumber(k, "generatedCount", n)) changed.push(`${base}.generatedCount`);
    if (rowSetNumber(k, "inStockCount", n)) changed.push(`${base}.inStockCount`);
    changed.push(...syncInvariants(feat));
    if (changed.length) s.log.push(`Cards: ${cardId} stock -> ${n}`);
    return { changed, missing: [] };
  }
  return { changed: [], missing: [base] };
}

/** Set every owned row to one stock value (gen follows, as measured). */
export function setAllStock(s: GardenscapesSession, stock: number): EditResult {
  const n = requireInt(stock, GS_CARD_AMOUNT_MIN, GS_CARD_AMOUNT_MAX, "stock");
  const { id, feat } = activeOrFail(s);
  const rows = arrOf(feat, "Core.OwnedCards") ?? [];
  const changed: string[] = [];
  for (const r of rows) {
    const k = rowKids(r);
    if (!k) continue;
    const cardId = kidVal(k, "cardId");
    if (typeof cardId !== "string") continue;
    const base = `Features.${id}.Core.OwnedCards.${cardId}`;
    if (rowSetNumber(k, "generatedCount", n)) changed.push(`${base}.generatedCount`);
    if (rowSetNumber(k, "inStockCount", n)) changed.push(`${base}.inStockCount`);
  }
  changed.push(...syncInvariants(feat));
  if (changed.length) s.log.push(`Cards: all stock -> ${n}`);
  return { changed, missing: [] };
}

/** Flip the `isNew` dot on one owned card (both directions are legal). */
export function setCardNew(
  s: GardenscapesSession,
  cardId: string,
  isNew: boolean,
): EditResult {
  if (!gsCardById(cardId)) throw new Error(`cards: unknown card id "${cardId}"`);
  const { id, feat } = activeOrFail(s);
  const rows = arrOf(feat, "Core.OwnedCards") ?? [];
  for (const r of rows) {
    const k = rowKids(r);
    if (!k || kidVal(k, "cardId") !== cardId) continue;
    const changed: string[] = [];
    if (rowSetBool(k, "isNew", isNew)) {
      changed.push(`Features.${id}.Core.OwnedCards.${cardId}.isNew`);
    }
    changed.push(...syncInvariants(feat));
    if (changed.length) s.log.push(`Cards: ${cardId} isNew -> ${isNew}`);
    return { changed, missing: [] };
  }
  return { changed: [], missing: [`Features.${id}.Core.OwnedCards.${cardId}`] };
}

/** Clear (or restore) the new-card dots â€” `ids` omitted = every owned card. */
export function markCardsSeen(s: GardenscapesSession, ids?: string[]): EditResult {
  const { id, feat } = activeOrFail(s);
  const rows = arrOf(feat, "Core.OwnedCards") ?? [];
  const want = ids ? new Set(ids) : null;
  const changed: string[] = [];
  let flipped = 0;
  for (const r of rows) {
    const k = rowKids(r);
    if (!k) continue;
    const cardId = kidVal(k, "cardId");
    if (typeof cardId !== "string") continue;
    if (want && !want.has(cardId)) continue;
    if (rowSetBool(k, "isNew", false)) {
      changed.push(`Features.${id}.Core.OwnedCards.${cardId}.isNew`);
      flipped++;
    }
  }
  changed.push(...syncInvariants(feat));
  if (changed.length) s.log.push(`Cards: ${flipped} card(s) marked seen`);
  return { changed, missing: [] };
}

// ---------------------------------------------------------------------------
// Packs / streak / event flags
// ---------------------------------------------------------------------------

/** Set one `GivenPackInfos` count (type `g` = u16 preserved for any 0..65535). */
export function setPackCount(
  s: GardenscapesSession,
  packId: string,
  count: number,
): EditResult {
  if (!GS_CARD_PACKS.includes(packId)) throw new Error(`cards: unknown pack "${packId}"`);
  const n = requireInt(count, 0, GS_PACK_COUNT_MAX, "pack count");
  const { id, feat } = activeOrFail(s);
  const rows = arrOf(feat, "Core.GivenPackInfos") ?? [];
  for (const r of rows) {
    const k = rowKids(r);
    if (!k || kidVal(k, "id") !== packId) continue;
    const changed: string[] = [];
    if (rowSetNumber(k, "count", n)) {
      changed.push(`Features.${id}.Core.GivenPackInfos.${packId}.count`);
      s.log.push(`Cards: pack ${packId} count -> ${n}`);
    }
    return { changed, missing: [] };
  }
  return { changed: [], missing: [`Features.${id}.Core.GivenPackInfos.${packId}`] };
}

/** `Core.FourthPack_CurrentStreak` â€” measured 0 on every save. */
export function setPackStreak(s: GardenscapesSession, value: number): EditResult {
  const n = requireInt(value, 0, 9999, "streak");
  const { id, feat } = activeOrFail(s);
  const core = coreKids(feat);
  if (!core || !core.find(([k]) => k === "FourthPack_CurrentStreak")) {
    return { changed: [], missing: [`Features.${id}.Core.FourthPack_CurrentStreak`] };
  }
  const res = applyOps(s.decoded.doc, [
    { path: `Features.${id}.Core.FourthPack_CurrentStreak`, value: n },
  ]);
  if (res.changed.length) s.log.push(`Cards: pack streak -> ${n}`);
  return res;
}

/**
 * OxxEditor's "Activate Grand Collection" â€” its payload key `activate_grand`
 * is a view-layer key no real save holds; the real save key is the measured
 * `Loader.IsGrandCollection`, which is what this writes.
 */
export function setGrandCollection(s: GardenscapesSession, on: boolean): EditResult {
  const { id, feat } = activeOrFail(s);
  const flag = loaderFlag(feat, "IsGrandCollection");
  if (!flag) return { changed: [], missing: [`Features.${id}.<Loader>.IsGrandCollection`] };
  const res = applyOps(s.decoded.doc, [{ path: flag.path, value: on }]);
  if (res.changed.length) s.log.push(`Cards: grand collection -> ${on}`);
  return res;
}

/** `Loader.IsEventActive` â€” measured on every save's loader. */
export function setEventActive(s: GardenscapesSession, on: boolean): EditResult {
  const { id, feat } = activeOrFail(s);
  const flag = loaderFlag(feat, "IsEventActive");
  if (!flag) return { changed: [], missing: [`Features.${id}.<Loader>.IsEventActive`] };
  const res = applyOps(s.decoded.doc, [{ path: flag.path, value: on }]);
  if (res.changed.length) s.log.push(`Cards: event active -> ${on}`);
  return res;
}

// ---------------------------------------------------------------------------
// Gifting â€” real local writes over the one row shape a save has held
// ---------------------------------------------------------------------------

/**
 * Accept every pending gift: each ReceivedCards row grants its card into
 * OwnedCards (a duplicate raises gen+stock, a new card gets its row), then the
 * rows are cleared â€” exactly what accepting does. Rows whose cardId is outside
 * the catalog stay in the inbox rather than being destroyed, and land in
 * `missing` so the caller sees them.
 */
export function acceptReceivedCards(s: GardenscapesSession): EditResult {
  const { id, feat } = activeOrFail(s);
  const gift = childOf(feat, "CardsGiftingCore");
  if (!gift || gift[1][0] !== "o") throw new Error("cards: save has no CardsGiftingCore");
  const kids = gift[1][1] as ObjChild[];
  const hit = kids.find(([k]) => k === "ReceivedCards");
  if (!hit || hit[1][0] !== "a") {
    return { changed: [], missing: [`Features.${id}.CardsGiftingCore.ReceivedCards`] };
  }
  const arr = hit[1][1] as ArrItem[];
  if (arr.length === 0) {
    s.log.push("Cards: no pending gifts to accept");
    return { changed: [], missing: [] };
  }

  const toGrant: string[] = [];
  const keep: ArrItem[] = [];
  const missing: string[] = [];
  for (const row of arr) {
    const k = rowKids(row);
    const cardId = k ? kidVal(k, "cardId") : undefined;
    if (k && typeof cardId === "string" && gsCardById(cardId)) {
      toGrant.push(cardId);
    } else {
      keep.push(row);
      missing.push(`Features.${id}.CardsGiftingCore.ReceivedCards.${String(cardId)}`);
    }
  }

  const changed: string[] = [];
  if (toGrant.length) {
    const grant = applyGrant(s, feat, toGrant, 1);
    changed.push(...grant.changed);
  }
  if (keep.length !== arr.length) {
    // Remove only the rows we granted; unknown rows survive in the inbox.
    arr.length = 0;
    for (const row of keep) arr.push(row);
    changed.push(`Features.${id}.CardsGiftingCore.ReceivedCards`);
  }
  if (toGrant.length) {
    s.log.push(`Cards: accepted ${toGrant.length} gift(s)`);
  }
  return { changed, missing };
}

/**
 * Clear the incoming-gift inbox without granting. Only the two arrays whose
 * empty state every save holds are touched; SentCards / PendingSendCards are
 * never written (their non-empty row shape was never observed).
 */
export function clearGiftingInbox(s: GardenscapesSession): EditResult {
  const { id, feat } = activeOrFail(s);
  const gift = childOf(feat, "CardsGiftingCore");
  if (!gift || gift[1][0] !== "o") throw new Error("cards: save has no CardsGiftingCore");
  const kids = gift[1][1] as ObjChild[];
  const changed: string[] = [];
  const missing: string[] = [];
  for (const key of ["ReceivedCards", "PendingReceivedCards"]) {
    const hit = kids.find(([k]) => k === key);
    if (!hit || hit[1][0] !== "a") {
      missing.push(`Features.${id}.CardsGiftingCore.${key}`);
      continue;
    }
    const arr = hit[1][1] as ArrItem[];
    if (arr.length) {
      arr.length = 0;
      changed.push(`Features.${id}.CardsGiftingCore.${key}`);
    }
  }
  if (changed.length) s.log.push("Cards: gift inbox cleared");
  return { changed, missing };
}

export type { AUDBDocument, AUDBEntry, EditResult };
export { fitNumericType, getRef, toInt };
