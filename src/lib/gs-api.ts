import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Gardenscapes server functions.
//
// Mirrors studio-api.ts: one createServerFn wrapper per server-module op, each
// importing the module lazily inside the handler (server-only code never
// reaches the browser bundle) and gating on requireToken wherever a session or
// license is involved. The six edit modules (cards/season/decor/items/stats/
// profile) all take the session object, so every wrapper resolves it the same
// way: getSession(sessionId, token) â€” a token that does not own the session
// throws, which is the same gate the IGG tool relies on.
// ---------------------------------------------------------------------------

const sess = z.object({ token: z.string(), sessionId: z.string() });

/** Resolve the session for a wrapper body (license gate + session lookup). */
async function sessionOf(token: string, sessionId: string) {
  const { getSession } = await import("./server/gardenscapes/session.server");
  return getSession(sessionId, token);
}

// --- license ---------------------------------------------------------------

export const verifyLicense = createServerFn({ method: "POST" })
  .validator(z.object({ key: z.string(), deviceId: z.string() }))
  .handler(async ({ data }) => {
    const { verifyLicenseKey } = await import("./server/license.server");
    return verifyLicenseKey(data.key, data.deviceId);
  });

export const getLicense = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { licenseStatus } = await import("./server/license.server");
    return licenseStatus(data.token);
  });

/** Current client release (EXE auto-update: version + download URL + SHA-256). */
export const gsGetRelease = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { getRelease } = await import("./server/update.server");
    return getRelease(data.token);
  });

// --- session / save pipeline ----------------------------------------------

/** Decode a save (file bytes or device pull) into an editable session. */
export const gsConnect = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string(),
      device: z.string(),
      saveB64: z.string().max(24_000_000),
    }),
  )
  .handler(async ({ data }) => {
    const { connectLoad, snapshot } = await import("./server/gardenscapes/session.server");
    const s = connectLoad(data.token, data.device, data.saveB64);
    return snapshot(s);
  });

export const gsSnapshot = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const { getSession, snapshot } = await import("./server/gardenscapes/session.server");
    return snapshot(getSession(data.sessionId, data.token));
  });

export const gsSessions = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { listSessions, snapshot } = await import("./server/gardenscapes/session.server");
    return listSessions(data.token).map(snapshot);
  });

/** Re-encode the edited document to cipher bytes (base64) for push/download. */
export const gsPush = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const { pushEncode } = await import("./server/gardenscapes/session.server");
    return { b64: pushEncode(data.sessionId, data.token).toString("base64") };
  });

/** Byte-exact undo back to the bytes the session loaded with. */
export const gsRestore = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const { restoreOriginal, getSession, snapshot } = await import("./server/gardenscapes/session.server");
    restoreOriginal(data.sessionId, data.token);
    return snapshot(getSession(data.sessionId, data.token));
  });

export const gsDrop = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const { dropSession } = await import("./server/gardenscapes/session.server");
    return { dropped: dropSession(data.sessionId, data.token) };
  });

// --- device transport (ADB pull/push) -------------------------------------

export const gsPullDevice = createServerFn({ method: "POST" })
  .validator(z.object({ serial: z.string().optional() }))
  .handler(async ({ data }) => {
    const { pullGameSaveRaw } = await import("./server/gardenscapes/save.server");
    return pullGameSaveRaw(data.serial || undefined);
  });

export const gsPushDevice = createServerFn({ method: "POST" })
  .validator(z.object({ b64: z.string().max(24_000_000), serial: z.string().optional() }))
  .handler(async ({ data }) => {
    const { pushGameSaveRaw } = await import("./server/gardenscapes/save.server");
    return pushGameSaveRaw(data.b64, data.serial || undefined);
  });

export const gsSavePath = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { requireToken } = await import("./server/license.server");
    requireToken(data.token);
    const { GAME_SAVE_RELATIVE_PATH } = await import("./server/gardenscapes/save.server");
    return { path: GAME_SAVE_RELATIVE_PATH };
  });

// --- cards -----------------------------------------------------------------

export const gsReadCards = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.readCards(await sessionOf(data.token, data.sessionId));
  });

export const gsCardsSummary = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.cardsSummary(await sessionOf(data.token, data.sessionId));
  });

export const gsGrantCards = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      ids: z.array(z.string()).min(1).max(150),
      // 1..9999 is the module's own bound (GS_CARD_AMOUNT_MIN/MAX).
      amount: z.number().int().min(1).max(9999),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.grantCards(await sessionOf(data.token, data.sessionId), data.ids, data.amount);
  });

/** Deliver ticked cards into this save (the only delivery a save edit can do). */
export const gsSendCardsToSelf = createServerFn({ method: "POST" })
  .validator(sess.extend({ cardIds: z.array(z.string()).min(1).max(150), amount: z.number().int().min(1).max(9999) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.sendCardsToSelf(await sessionOf(data.token, data.sessionId), {
      cardIds: data.cardIds,
      amount: data.amount,
    });
  });

export const gsSetCardStock = createServerFn({ method: "POST" })
  .validator(sess.extend({ cardId: z.string(), stock: z.number().int().min(1).max(9999) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.setCardStock(await sessionOf(data.token, data.sessionId), data.cardId, data.stock);
  });

export const gsSetAllStock = createServerFn({ method: "POST" })
  .validator(sess.extend({ stock: z.number().int().min(1).max(9999) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.setAllStock(await sessionOf(data.token, data.sessionId), data.stock);
  });

export const gsSetCardNew = createServerFn({ method: "POST" })
  .validator(sess.extend({ cardId: z.string(), isNew: z.boolean() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.setCardNew(await sessionOf(data.token, data.sessionId), data.cardId, data.isNew);
  });

export const gsMarkCardsSeen = createServerFn({ method: "POST" })
  .validator(sess.extend({ ids: z.array(z.string()).max(150).optional() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.markCardsSeen(await sessionOf(data.token, data.sessionId), data.ids);
  });

export const gsSetPackCount = createServerFn({ method: "POST" })
  .validator(sess.extend({ packId: z.string(), count: z.number().int().min(0).max(65535) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.setPackCount(await sessionOf(data.token, data.sessionId), data.packId, data.count);
  });

export const gsSetPackStreak = createServerFn({ method: "POST" })
  .validator(sess.extend({ value: z.number().int().min(0).max(65535) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.setPackStreak(await sessionOf(data.token, data.sessionId), data.value);
  });

export const gsSetGrandCollection = createServerFn({ method: "POST" })
  .validator(sess.extend({ on: z.boolean() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.setGrandCollection(await sessionOf(data.token, data.sessionId), data.on);
  });

export const gsSetEventActive = createServerFn({ method: "POST" })
  .validator(sess.extend({ on: z.boolean() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.setEventActive(await sessionOf(data.token, data.sessionId), data.on);
  });

export const gsAcceptReceivedCards = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.acceptReceivedCards(await sessionOf(data.token, data.sessionId));
  });

export const gsClearGiftingInbox = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.clearGiftingInbox(await sessionOf(data.token, data.sessionId));
  });

// --- send to friends --------------------------------------------------------

/**
 * Queue cards to friends in the session — no device I/O. The panel pushes the
 * encoded save through the device transport (EXE bridge first, so it works on
 * every client's own MEmu), which restarts the game; the game's own sync then
 * posts every row to Playrix.
 */
export const gsQueueCardsToFriends = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      receiverIds: z.array(z.string().min(1).max(40)).min(1).max(100),
      cardIds: z.array(z.string().min(1).max(16)).min(1).max(150),
    }),
  )
  .handler(async ({ data }) => {
    const s = await sessionOf(data.token, data.sessionId);
    const m = await import("./server/gardenscapes/cards.server");
    const edit = m.sendCardsToFriend(s, { receiverIds: data.receiverIds, cardIds: data.cardIds });
    // The queue's gifting ids travel to the panel: it passes them back when it
    // polls, which reports how many the game recorded in SentCards (the array
    // rolls at ~150 rows, and rows the server refuses are consumed unrecorded).
    const giftingIds = m.queuedGiftingIds(s);
    return { ...edit, giftingIds };
  });

/**
 * Decode device bytes into gifting counters — the flush poll's second half.
 * Decoding is pure logic over bytes the client already pulled from its own
 * device, so it carries no license gate (same class as gsPullDevice).
 */
export const gsGiftingStatusB64 = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string(),
      saveB64: z.string().max(24_000_000),
      ids: z.array(z.string().max(40)).max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.readGiftingState(data.saveB64, data.ids);
  });

/** Start the game — the plain-browser path's pushes stop it, so it needs a relaunch.
 * Device-only like gsPullDevice/gsPushDevice, so it carries no token. */
export const gsLaunchGame = createServerFn({ method: "POST" })
  .validator(z.object({ serial: z.string().optional() }))
  .handler(async ({ data }) => {
    const { launchGameSave } = await import("./server/gardenscapes/save.server");
    return launchGameSave(data.serial);
  });

/** Every player this save has exchanged gifts with — the Send panel roster. */
export const gsReadFriends = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/cards.server");
    return m.readFriends(await sessionOf(data.token, data.sessionId));
  });

/**
 * Read the friend roster out of the running game's memory — the on-disk
 * caches are PLXE-encrypted but the game parses them on load, so the live
 * heap holds every friend (id + name) in the clear. Device-only like
 * gsPullDevice, so it carries no license gate.
 */
export const gsScanDeviceFriends = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string(), serial: z.string().optional() }))
  .handler(async ({ data }) => {
    const { scanDeviceFriends } = await import("./server/gardenscapes/save.server");
    return scanDeviceFriends(data.serial);
  });

// --- season (golden pass / stages) ----------------------------------------

export const gsListSeasons = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/season.server");
    return m.listSeasons(await sessionOf(data.token, data.sessionId));
  });

export const gsSetGoldPass = createServerFn({ method: "POST" })
  .validator(sess.extend({ season: z.string(), bought: z.boolean() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/season.server");
    return m.setGoldPass(await sessionOf(data.token, data.sessionId), data.season, data.bought);
  });

export const gsSetScore = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      season: z.string(),
      current: z.number().int().min(0).max(1_000_000_000),
      total: z.number().int().min(0).max(1_000_000_000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/season.server");
    return m.setScore(await sessionOf(data.token, data.sessionId), data.season, data.current, data.total);
  });

export const gsSetStage = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      season: z.string(),
      // GsStageTrack in season.server.ts: the premium road's game id is "gold".
      track: z.enum(["free", "gold"]),
      index: z.number().int().min(0).max(999),
      collected: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/season.server");
    return m.setStage(await sessionOf(data.token, data.sessionId), data.season, data.track, data.index, data.collected);
  });

export const gsSetAllStages = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      season: z.string(),
      track: z.enum(["free", "gold", "both"]),
      collected: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/season.server");
    return m.setAllStages(await sessionOf(data.token, data.sessionId), data.season, data.track, data.collected);
  });

export const gsReadStages = createServerFn({ method: "POST" })
  .validator(sess.extend({ season: z.string(), track: z.enum(["free", "gold"]) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/season.server");
    return m.readStages(await sessionOf(data.token, data.sessionId), data.season, data.track);
  });

/** One press: max score + every reward on both roads, for every season held. */
export const gsClaimGardenPass = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/season.server");
    return m.claimAllSeasons(await sessionOf(data.token, data.sessionId));
  });

// --- pets ------------------------------------------------------------------

/** The bundled clone account's facts (no session needed, token still gated). */
export const gsCloneInfo = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { requireToken } = await import("./server/license.server");
    requireToken(data.token);
    const m = await import("./server/gardenscapes/clone.server");
    return m.cloneInfo();
  });

/** Clone the bundled account's content onto this session's save. */
export const gsApplyClone = createServerFn({ method: "POST" })
  .validator(sess.extend({ withProgress: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/clone.server");
    return m.applyClone(await sessionOf(data.token, data.sessionId), { withProgress: data.withProgress });
  });

/** Region build flag: Vietnam clients refuse a save that says otherwise. */
export const gsSetRegionBuild = createServerFn({ method: "POST" })
  .validator(sess.extend({ on: z.boolean() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/clone.server");
    return m.setRegionBuild(await sessionOf(data.token, data.sessionId), data.on);
  });

export const gsListPets = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/pets.server");
    return m.listPets(await sessionOf(data.token, data.sessionId));
  });

export const gsSetPet = createServerFn({ method: "POST" })
  .validator(sess.extend({ id: z.string(), on: z.boolean() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/pets.server");
    return m.setPet(await sessionOf(data.token, data.sessionId), data.id, data.on);
  });

export const gsUnlockAllPets = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/pets.server");
    return m.unlockAllPets(await sessionOf(data.token, data.sessionId));
  });

// --- decorations / repairs --------------------------------------------------

export const gsListChapters = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/decor.server");
    return m.listChapters(await sessionOf(data.token, data.sessionId));
  });

export const gsWriteChapter = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      key: z.string(),
      completed: z.boolean().optional(),
      opened: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/decor.server");
    return m.writeChapter(await sessionOf(data.token, data.sessionId), data.key, {
      completed: data.completed,
      opened: data.opened,
    });
  });

export const gsWriteChapters = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      keys: z.array(z.string()).min(1),
      completed: z.boolean().optional(),
      opened: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/decor.server");
    return m.writeChapters(await sessionOf(data.token, data.sessionId), data.keys, {
      completed: data.completed,
      opened: data.opened,
    });
  });

export const gsListPurchases = createServerFn({ method: "POST" })
  .validator(sess.extend({ prefix: z.string().optional() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/decor.server");
    return m.listPurchases(await sessionOf(data.token, data.sessionId), data.prefix ?? "");
  });

export const gsWritePurchases = createServerFn({ method: "POST" })
  .validator(sess.extend({ changes: z.record(z.string(), z.boolean()) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/decor.server");
    return m.writePurchases(await sessionOf(data.token, data.sessionId), data.changes);
  });

export const gsBuyPurchases = createServerFn({ method: "POST" })
  .validator(sess.extend({ prefix: z.string().optional() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/decor.server");
    return m.buyPurchases(await sessionOf(data.token, data.sessionId), data.prefix ?? "");
  });

export const gsDecorSummary = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/decor.server");
    return m.decorSummary(await sessionOf(data.token, data.sessionId));
  });

// --- boosters / items ------------------------------------------------------

export const gsReadItems = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/items.server");
    return m.readItems(await sessionOf(data.token, data.sessionId));
  });

export const gsWriteItems = createServerFn({ method: "POST" })
  .validator(sess.extend({ changes: z.record(z.string(), z.number().int().min(0).max(999999)) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/items.server");
    return m.writeItems(await sessionOf(data.token, data.sessionId), data.changes);
  });

export const gsMinItems = createServerFn({ method: "POST" })
  .validator(sess.extend({ min: z.number().int().min(0).max(999999) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/items.server");
    return m.minItems(await sessionOf(data.token, data.sessionId), data.min);
  });

export const gsFillItems = createServerFn({ method: "POST" })
  .validator(sess.extend({ value: z.number().int().min(0).max(999999) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/items.server");
    return m.fillItems(await sessionOf(data.token, data.sessionId), data.value);
  });

// --- data center (stats) ----------------------------------------------------

export const gsReadStats = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/stats.server");
    return m.readStats(await sessionOf(data.token, data.sessionId));
  });

export const gsReadStat = createServerFn({ method: "POST" })
  .validator(sess.extend({ key: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/stats.server");
    return { value: m.readStat(await sessionOf(data.token, data.sessionId), data.key) };
  });

export const gsWriteStats = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      // Values arrive as strings from the stat inputs; the module coerces.
      changes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/stats.server");
    return m.writeStats(await sessionOf(data.token, data.sessionId), data.changes);
  });

export const gsWritePair = createServerFn({ method: "POST" })
  .validator(
    sess.extend({
      key: z.enum(["lives", "expedition_energy"]),
      current: z.number().int().min(0).max(999999),
      max: z.number().int().min(0).max(999999),
    }),
  )
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/stats.server");
    return m.writePair(await sessionOf(data.token, data.sessionId), data.key, data.current, data.max);
  });

export const gsReadPair = createServerFn({ method: "POST" })
  .validator(sess.extend({ key: z.enum(["lives", "expedition_energy"]) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/stats.server");
    return { pair: m.readPair(await sessionOf(data.token, data.sessionId), data.key) };
  });

// --- profile (avatars, styles, frames, badges, titles) ---------------------

export const gsReadProfile = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.readProfile(await sessionOf(data.token, data.sessionId));
  });

export const gsProfileSummary = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.profileSummary(await sessionOf(data.token, data.sessionId));
  });

export const gsUnlockAvatars = createServerFn({ method: "POST" })
  .validator(sess.extend({ ids: z.array(z.string()).min(1).max(2000) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockAvatars(await sessionOf(data.token, data.sessionId), data.ids);
  });

export const gsWearAvatar = createServerFn({ method: "POST" })
  .validator(sess.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.wearAvatar(await sessionOf(data.token, data.sessionId), data.id);
  });

export const gsWearAvatarStyle = createServerFn({ method: "POST" })
  .validator(sess.extend({ style: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.wearAvatarStyle(await sessionOf(data.token, data.sessionId), data.style);
  });

export const gsUnlockAvatarStyles = createServerFn({ method: "POST" })
  .validator(sess.extend({ styles: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockAvatarStyles(await sessionOf(data.token, data.sessionId), data.styles);
  });

export const gsWearNameStyle = createServerFn({ method: "POST" })
  .validator(sess.extend({ style: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.wearNameStyle(await sessionOf(data.token, data.sessionId), data.style);
  });

export const gsUnlockNameStyles = createServerFn({ method: "POST" })
  .validator(sess.extend({ styles: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockNameStyles(await sessionOf(data.token, data.sessionId), data.styles);
  });

export const gsWearTitle = createServerFn({ method: "POST" })
  .validator(sess.extend({ titleId: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.wearTitle(await sessionOf(data.token, data.sessionId), data.titleId);
  });

export const gsWearBadge = createServerFn({ method: "POST" })
  .validator(sess.extend({ cipher: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.wearBadge(await sessionOf(data.token, data.sessionId), data.cipher);
  });

/** Wear a badge by catalog id â€” the cipher is encoded server-side. */
export const gsWearBadgeById = createServerFn({ method: "POST" })
  .validator(sess.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.wearBadge(await sessionOf(data.token, data.sessionId), data.id);
  });

export const gsSetBadgeNew = createServerFn({ method: "POST" })
  .validator(sess.extend({ cipher: z.string(), isNew: z.boolean() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.setBadgeNew(await sessionOf(data.token, data.sessionId), data.cipher, data.isNew);
  });

export const gsClearBadgeNew = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.clearBadgeNew(await sessionOf(data.token, data.sessionId));
  });

export const gsUnlockFrames = createServerFn({ method: "POST" })
  .validator(sess.extend({ ids: z.array(z.string()).min(1).max(500) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockFrames(await sessionOf(data.token, data.sessionId), data.ids);
  });

/** Unlock and wear a frame (frames are shown through `AvatarStyle`). */
export const gsWearFrame = createServerFn({ method: "POST" })
  .validator(sess.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.wearFrame(await sessionOf(data.token, data.sessionId), data.id);
  });

export const gsUnlockBadges = createServerFn({ method: "POST" })
  .validator(sess.extend({ ids: z.array(z.string()).min(1).max(200) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockBadges(await sessionOf(data.token, data.sessionId), data.ids);
  });

export const gsUnlockAllBadges = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockAllBadges(await sessionOf(data.token, data.sessionId));
  });

export const gsUnlockTitles = createServerFn({ method: "POST" })
  .validator(sess.extend({ ids: z.array(z.string()).min(1).max(200) }))
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockTitles(await sessionOf(data.token, data.sessionId), data.ids);
  });

export const gsUnlockAllTitles = createServerFn({ method: "POST" })
  .validator(sess)
  .handler(async ({ data }) => {
    const m = await import("./server/gardenscapes/profile.server");
    return m.unlockAllTitles(await sessionOf(data.token, data.sessionId));
  });

/** Frame / avatar catalogs (static â€” no session needed, token still gated). */
export const gsProfileCatalogs = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { requireToken } = await import("./server/license.server");
    requireToken(data.token);
    const m = await import("./server/gardenscapes/profile.server");
    return { frames: m.allFrameIds(), avatars: m.allAvatarIds() };
  });

// --- catalogs (browser-safe lists: cards, sets, packs, icons) --------------

export const gsCatalogs = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const { requireToken } = await import("./server/license.server");
    requireToken(data.token);
    const m = await import("./server/gardenscapes/catalogs");
    return {
      badges: m.GS_BADGES,
      titles: m.GS_TITLES,
      avatars: m.GS_AVATARS,
      frames: m.GS_FRAMES,
      framesActivatable: m.GS_FRAMES_ACTIVATABLE,
      styles: m.GS_STYLES,
      cards: m.GS_CARDS,
      cardSets: m.GS_CARD_SETS,
      cardPacks: m.GS_CARD_PACKS,
      sizes: m.GS_CATALOG_SIZES,
      // Art maps stay on the server side of the wire as data; the UI resolves
      // them through gsAssetUrl-style paths (never filesystem paths).
      art: {
        badges: m.GS_BADGE_ART,
        titles: m.GS_TITLE_ART,
        avatars: m.GS_AVATAR_ART,
        frames: m.GS_FRAME_ART,
        boosters: m.GS_BOOSTER_ART,
        assets: m.GS_ASSETS,
      },
    };
  });
