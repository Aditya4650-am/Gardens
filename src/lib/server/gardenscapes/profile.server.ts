// Profile — avatars, styles, titles, badges, frames.
//
// Measured shape (mined GameData.db + Telegram GameData.db):
//   TableName.Properties holds the unlock conventions as flat keys:
//     BoughtAvatar_<id>            (t=true)   …25–37 keys per save
//     BoughtFrame_<id>             (t=true)   BOTH grammars always come in
//     BoughtFrame_Frame_<id>       (t=true)   pairs (`unlock_all.py` style)
//     UserAvatar_AvatarsShownIds   (s) comma CSV of avatar ids
//     UserAvatar_AvatarStylesShownIds (s) CSV — measured vocab
//       `Pink,Orange,Marine,Wood,gold,Blue,Purple,Red,Violet`
//       (a clan cache also shows `Frame_Firefly` in `avatarStyle`, so frame
//       ids are legal style values too — the vocab is not closed)
//     UserNameStyle_StylesShownIds (s) CSV — vocab = GS_STYLES ∪ {gold, Default}
//     UserAvatar_FramesShownIds    (s) CSV — absent on one measured save
//     UserAvatar_CurrentAvatarId   (s) e.g. "ExpHOCUSPOCUS_Cat"
//   SpecialEvents.PlayerProfileOwn.OwnProfile holds the WORN state:
//     AvatarStyle / PlayerNameStyle / PlayerTitleId / PlayerTitleIdsEarned /
//     ProfileBadgeId / ProfileSkinId (all s) + ProfileValues + RegistrationDate
//   Features.ProfileBadgesGFF.Core.OwnedBadges is an ARRAY of rows
//     {badgeId s, isNew f} — 6 rows measured.
//
// Rules this module lives by:
//   - Badge ids are opaque ciphertexts: the encoding was never identified, so
//     badges ship as wear / reorder / isNew of rows the save ALREADY holds.
//     The worn `ProfileBadgeId` is NOT in `OwnedBadges` (measured on 2 saves),
//     so wear accepts owned ciphers ∪ the currently worn one only.
//   - Titles are wear-only: `PlayerTitleIdsEarned` is `""` on all 4 corpus
//     saves and its non-empty format is unknown — never written.
//   - `ExpeditionTitlesGFF.ExpeditionTitles` is an empty object on every save;
//     its child shape is unknown and nothing here creates children in it.
//   - Frame wear key was never found in any save (own-profile frames do not
//     exist in the corpus) → frames are UNLOCK-only, documented as a
//     convention-extend: `BoughtFrame_*` mirrors the proven `BoughtAvatar_*`
//     grammar (same table, same `t` type, same ShownIds CSV).
//   - Wear implies unlock for avatars (OxxEditor literal: "Tap an avatar to
//     wear it. Unlockable ones are added on the first tap") — atomic.
//   - Array rows are mutated in place (`getRef` returns the live value);
//     `applyOps`/`setAt` cannot descend into arrays and would throw.

import {
  findEntry,
  findTable,
  getRef,
  objEntries,
  objPut,
  toInt,
  type ArrItem,
  type ObjChild,
} from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { decodeBadgeCipher, encodeBadgeCipher } from "@/lib/gardenscapes/badge-cipher";
import { applyOps, entry as entryOf, readAt, strAt, type EditOp, type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";
import { GS_AVATARS, GS_BADGES, GS_FRAMES, GS_FRAMES_ACTIVATABLE, GS_STYLES, GS_TITLES } from "./catalogs.ts";

const PROPS_TABLE = "TableName";
const PROPS_ENTRY = "Properties";
const OWN_TABLE = "SpecialEvents";
const OWN_ENTRY = "PlayerProfileOwn";
const OWN_PATH = "OwnProfile";
const BADGES_TABLE = "Features";
const BADGES_ENTRY = "ProfileBadgesGFF";
const BADGES_PATH = "Core.OwnedBadges";

/** Every style value measured in a real save's `AvatarStyle` field. */
const MEASURED_AVATAR_STYLES = new Set([
  "Pink", "Orange", "Marine", "Wood", "gold", "Blue", "Purple", "Red", "Violet",
]);
/** `PlayerNameStyle` measured vocabulary. */
const MEASURED_NAME_STYLES = new Set(["gold", "Default", ...GS_STYLES.map((s) => s.id)]);

export interface GsOwnedBadge {
  /** Opaque ciphertext exactly as stored — never a catalog id. */
  cipher: string;
  /** Catalog id decoded from the cipher ("" when the row is unreadable). */
  id: string;
  isNew: boolean;
}

export interface GsProfileInfo {
  wornAvatarStyle: string;
  wornNameStyle: string;
  wornTitleId: string;
  wornBadgeCipher: string;
  /** Catalog id of the worn badge, decoded. */
  wornBadgeId: string;
  currentAvatarId: string;
  avatarsShown: string[];
  avatarStylesShown: string[];
  nameStylesShown: string[];
  framesShown: string[];
  /** `PlayerTitleIdsEarned`, decoded and split. */
  titlesEarned: string[];
  boughtAvatars: number;
  boughtFrames: number;
  ownedBadges: GsOwnedBadge[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function props(s: GardenscapesSession): AUDBEntry {
  const e = entryOf(s.decoded.doc, PROPS_TABLE, PROPS_ENTRY);
  if (!e || e.type !== "o") throw new Error("profile: save has no TableName.Properties");
  return e;
}

function ownProfile(s: GardenscapesSession): AUDBEntry {
  const e = entryOf(s.decoded.doc, OWN_TABLE, OWN_ENTRY);
  if (!e || e.type !== "o") throw new Error("profile: save has no PlayerProfileOwn");
  const ref = getRef(e, OWN_PATH);
  if (!ref || ref.type !== "o") throw new Error("profile: save has no OwnProfile");
  return { key: OWN_PATH, type: "o", value: ref.value };
}

/** Split a ShownIds CSV ("" → []). */
function csv(v: unknown): string[] {
  if (typeof v !== "string" || v.length === 0) return [];
  return v.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
}

/**
 * Merge ids into a Properties CSV, keeping the save's own order and appending
 * only what is missing. A CSV the save does not hold is created (the same
 * purchase convention as `BoughtAvatar_*` — the game writes this key on every
 * save that reaches the avatar screen).
 */
function mergeCsv(s: GardenscapesSession, key: string, ids: string[]): boolean {
  const before = csv(strAt(s.decoded.doc, `${PROPS_TABLE}.${PROPS_ENTRY}.${key}`));
  const held = new Set(before);
  let added = 0;
  for (const id of ids) {
    if (!held.has(id)) {
      held.add(id);
      before.push(id);
      added++;
    }
  }
  if (added === 0) return false;
  const res = applyOps(s.decoded.doc, [
    { path: `${PROPS_TABLE}.${PROPS_ENTRY}.${key}`, value: before.join(",") },
  ]);
  if (res.changed.length) return true;
  // The save holds no such key yet — create it (applyOps never creates).
  return propPut(s, key, "s", before.join(","));
}

/** Set (or create) one flat Properties key with an explicit type. */
function propPut(s: GardenscapesSession, key: string, type: string, value: unknown): boolean {
  const e = props(s);
  const hit = objEntries(e).find(([k]) => k === key);
  if (hit && hit[1][0] === type && hit[1][1] === value) return false;
  objPut(e, key, type, value);
  return true;
}

function ownPut(s: GardenscapesSession, key: string, value: string): EditResult {
  return applyOps(s.decoded.doc, [
    { path: `${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.${key}`, value },
  ]);
}

function requireToken(id: string, what: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(id)) throw new Error(`profile: bad ${what} id "${id}"`);
  return id;
}

/** Decode a stored badge ciphertext to its catalog id ("" when unreadable). */
function safeDecode(cipher: string): string {
  try {
    return decodeBadgeCipher(cipher);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Everything the Profile tab shows before the user presses anything. */
export function readProfile(s: GardenscapesSession): GsProfileInfo {
  const d: AUDBDocument = s.decoded.doc;
  const p = entryOf(d, PROPS_TABLE, PROPS_ENTRY);
  const kids: ObjChild[] = p && p.type === "o" ? objEntries(p) : [];
  const flat = (key: string): unknown => kids.find(([k]) => k === key)?.[1][1];
  const own = entryOf(d, OWN_TABLE, OWN_ENTRY);
  const ownRef = own ? getRef(own, OWN_PATH) : null;
  const ownKids: ObjChild[] = ownRef && ownRef.type === "o"
    ? (ownRef.value as ObjChild[])
    : [];
  const worn = (key: string): string => {
    const hit = ownKids.find(([k]) => k === key);
    return hit && typeof hit[1][1] === "string" ? (hit[1][1] as string) : "";
  };

  const badgesEntry = entryOf(d, BADGES_TABLE, BADGES_ENTRY);
  const badgeRef = badgesEntry ? getRef(badgesEntry, BADGES_PATH) : null;
  const rows: GsOwnedBadge[] = [];
  if (badgeRef && badgeRef.type === "a") {
    for (const item of badgeRef.value as ArrItem[]) {
      if (item[0] !== "o") continue;
      const fields = item[1] as ObjChild[];
      const id = fields.find(([k]) => k === "badgeId")?.[1][1];
      const nw = fields.find(([k]) => k === "isNew")?.[1][1];
      if (typeof id === "string") rows.push({ cipher: id, id: safeDecode(id), isNew: nw === true });
    }
  }

  let boughtAvatars = 0;
  let boughtFrames = 0;
  for (const [k, [t, v]] of kids) {
    if (t !== "t" || v !== true) continue;
    if (k.startsWith("BoughtAvatar_")) boughtAvatars++;
    else if (k.startsWith("BoughtFrame_")) boughtFrames++;
  }

  const titlesEarnedCsv = worn("PlayerTitleIdsEarned");

  return {
    wornAvatarStyle: worn("AvatarStyle"),
    wornNameStyle: worn("PlayerNameStyle"),
    wornTitleId: worn("PlayerTitleId"),
    wornBadgeCipher: worn("ProfileBadgeId"),
    wornBadgeId: safeDecode(worn("ProfileBadgeId")),
    currentAvatarId: typeof flat("UserAvatar_CurrentAvatarId") === "string"
      ? (flat("UserAvatar_CurrentAvatarId") as string)
      : "",
    avatarsShown: csv(flat("UserAvatar_AvatarsShownIds")),
    avatarStylesShown: csv(flat("UserAvatar_AvatarStylesShownIds")),
    nameStylesShown: csv(flat("UserNameStyle_StylesShownIds")),
    framesShown: csv(flat("UserAvatar_FramesShownIds")),
    titlesEarned: csv(titlesEarnedCsv),
    boughtAvatars,
    boughtFrames,
    ownedBadges: rows,
  };
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

/** Unlock avatars: `BoughtAvatar_<id>` + merge into the ShownIds CSV. */
export function unlockAvatars(s: GardenscapesSession, ids: string[]): EditResult {
  const changed: string[] = [];
  const missing: string[] = [];
  const clean = ids.map((id) => requireToken(id, "avatar"));
  for (const id of clean) {
    if (propPut(s, `BoughtAvatar_${id}`, "t", true)) changed.push(`BoughtAvatar_${id}`);
  }
  if (clean.length && mergeCsv(s, "UserAvatar_AvatarsShownIds", clean)) {
    changed.push("UserAvatar_AvatarsShownIds");
  }
  if (changed.length) s.log.push(`Profile: unlocked ${clean.length} avatar(s)`);
  return { changed, missing };
}

/**
 * Wear an avatar — atomic unlock + wear, matching the reference editor's own
 * first-tap behaviour. Writes `UserAvatar_CurrentAvatarId` (creating it when
 * a save somehow lacks the key the game writes on every avatar screen).
 */
export function wearAvatar(s: GardenscapesSession, id: string): EditResult {
  requireToken(id, "avatar");
  const unlock = unlockAvatars(s, [id]);
  const res = applyOps(s.decoded.doc, [
    { path: `${PROPS_TABLE}.${PROPS_ENTRY}.UserAvatar_CurrentAvatarId`, value: id },
  ]);
  if (res.missing.length) {
    // applyOps never creates — use the same create convention as BoughtAvatar_*.
    res.missing.length = 0;
    if (propPut(s, "UserAvatar_CurrentAvatarId", "s", id)) {
      res.changed.push(`${PROPS_TABLE}.${PROPS_ENTRY}.UserAvatar_CurrentAvatarId`);
    }
  }
  if (res.changed.length) s.log.push(`Profile: wearing avatar ${id}`);
  return { changed: [...unlock.changed, ...res.changed], missing: [...unlock.missing, ...res.missing] };
}

// ---------------------------------------------------------------------------
// Avatar styles / name styles
// ---------------------------------------------------------------------------

/**
 * Avatar style wear + unlock in one write. The measured vocabulary is not
 * closed (frame ids appear in `avatarStyle` on a clan cache), so any
 * well-formed token is accepted — only shape is validated, never membership.
 */
export function wearAvatarStyle(s: GardenscapesSession, style: string): EditResult {
  requireToken(style, "avatar style");
  const wear = ownPut(s, "AvatarStyle", style);
  const merged = mergeCsv(s, "UserAvatar_AvatarStylesShownIds", [style]);
  const known = MEASURED_AVATAR_STYLES.has(style);
  const changed = [...wear.changed];
  if (merged) changed.push("UserAvatar_AvatarStylesShownIds");
  if (changed.length) s.log.push(`Profile: avatar style ${style}${known ? "" : " (unmeasured vocab)"}`);
  return { changed, missing: wear.missing };
}

/** Unlock several avatar styles into the ShownIds CSV without wearing them. */
export function unlockAvatarStyles(s: GardenscapesSession, styles: string[]): EditResult {
  const clean = styles.map((x) => requireToken(x, "avatar style"));
  const ok = mergeCsv(s, "UserAvatar_AvatarStylesShownIds", clean);
  if (ok) s.log.push(`Profile: unlocked ${clean.length} avatar style(s)`);
  return { changed: ok ? ["UserAvatar_AvatarStylesShownIds"] : [], missing: [] };
}

/** Name style wear + unlock. Vocabulary IS closed here (measured). */
export function wearNameStyle(s: GardenscapesSession, style: string): EditResult {
  requireToken(style, "name style");
  if (!MEASURED_NAME_STYLES.has(style)) {
    throw new Error(`profile: unknown name style "${style}"`);
  }
  const wear = ownPut(s, "PlayerNameStyle", style);
  const merged = mergeCsv(s, "UserNameStyle_StylesShownIds", [style]);
  const changed = [...wear.changed];
  if (merged) changed.push("UserNameStyle_StylesShownIds");
  if (changed.length) s.log.push(`Profile: name style ${style}`);
  return { changed, missing: wear.missing };
}

export function unlockNameStyles(s: GardenscapesSession, styles: string[]): EditResult {
  const clean = styles.map((x) => {
    requireToken(x, "name style");
    if (!MEASURED_NAME_STYLES.has(x)) throw new Error(`profile: unknown name style "${x}"`);
    return x;
  });
  const ok = mergeCsv(s, "UserNameStyle_StylesShownIds", clean);
  if (ok) s.log.push(`Profile: unlocked ${clean.length} name style(s)`);
  return { changed: ok ? ["UserNameStyle_StylesShownIds"] : [], missing: [] };
}

// ---------------------------------------------------------------------------
// Titles — wear only
// ---------------------------------------------------------------------------

/**
 * Wear a title. `PlayerTitleIdsEarned` is NEVER written: it is `""` on every
 * save in the corpus and its non-empty format was never observed, so claiming
 * an earned list we cannot format would be an invented shape. Honest limit:
 * if the game checks the earned list before rendering, a worn-but-uneared
 * title may not display.
 */
export function wearTitle(s: GardenscapesSession, titleId: string): EditResult {
  if (titleId !== "" && !GS_TITLES.some((t) => t.id === titleId)) {
    throw new Error(`profile: unknown title "${titleId}"`);
  }
  const res = ownPut(s, "PlayerTitleId", titleId);
  if (res.changed.length) s.log.push(`Profile: title ${titleId || "(cleared)"}`);
  return res;
}

// ---------------------------------------------------------------------------
// Badges — wear / reorder / isNew over the rows the save already holds
// ---------------------------------------------------------------------------

function badgeRows(s: GardenscapesSession): ArrItem[] | null {
  const e = entryOf(s.decoded.doc, BADGES_TABLE, BADGES_ENTRY);
  if (!e) return null;
  const ref = getRef(e, BADGES_PATH);
  if (!ref || ref.type !== "a") return null;
  return ref.value as ArrItem[];
}

function rowCipher(row: ArrItem): string | null {
  if (row[0] !== "o") return null;
  const hit = (row[1] as ObjChild[]).find(([k]) => k === "badgeId");
  return hit && typeof hit[1][1] === "string" ? (hit[1][1] as string) : null;
}

/**
 * Wear a badge. Accepts only ciphers the save holds: the owned rows plus the
 * one already worn (measured — the worn cipher is NOT among the owned rows on
 * 2/2 saves, so rejecting it would strand the badge the profile already shows).
 * The cipher↔catalog-badge mapping does not exist, so the UI shows cipher rows.
 */
export function wearBadge(s: GardenscapesSession, cipher: string): EditResult {
  const rows = badgeRows(s);
  if (!rows) throw new Error("profile: save has no OwnedBadges array");
  const held = new Set(rows.map(rowCipher).filter((x): x is string => !!x));
  held.add(strAt(s.decoded.doc, `${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.ProfileBadgeId`));
  if (!held.has(cipher)) {
    throw new Error("profile: badge cipher is not in this save");
  }
  const res = ownPut(s, "ProfileBadgeId", cipher);
  if (res.changed.length) s.log.push("Profile: badge worn");
  return res;
}

/**
 * Reorder the owned badge rows. `order` must be a permutation of the ciphers
 * the save holds — a cipher that is not present is refused rather than dropped,
 * so a bad request can never silently delete a row.
 */
export function reorderBadges(s: GardenscapesSession, order: string[]): EditResult {
  const rows = badgeRows(s);
  if (!rows) throw new Error("profile: save has no OwnedBadges array");
  const current = rows.map(rowCipher);
  const missing = order.filter((c) => !current.includes(c));
  if (missing.length || order.length !== current.length) {
    throw new Error("profile: reorder must be a permutation of the owned badges");
  }
  const byCipher = new Map<string, ArrItem>();
  for (const row of rows) {
    const c = rowCipher(row);
    if (c) byCipher.set(c, row);
  }
  const before = current.join("|");
  rows.length = 0;
  for (const c of order) rows.push(byCipher.get(c)!);
  const after = rows.map(rowCipher).join("|");
  if (before === after) return { changed: [], missing: [] };
  s.log.push(`Profile: badges reordered (${order.length})`);
  return { changed: [`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_PATH}`], missing: [] };
}

/** Flip the `isNew` dot on one owned badge row. */
export function setBadgeNew(s: GardenscapesSession, cipher: string, isNew: boolean): EditResult {
  const rows = badgeRows(s);
  if (!rows) throw new Error("profile: save has no OwnedBadges array");
  for (const row of rows) {
    if (rowCipher(row) !== cipher) continue;
    const fields = row[1] as ObjChild[];
    const hit = fields.find(([k]) => k === "isNew");
    if (!hit) throw new Error("profile: badge row has no isNew field");
    if ((hit[1][1] === true) === isNew) return { changed: [], missing: [] };
    // The tag byte drives serialization (`t`/`f`), so it must match the value.
    hit[1] = [isNew ? "t" : "f", isNew];
    s.log.push(`Profile: badge isNew -> ${isNew}`);
    return { changed: [`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_PATH}.isNew`], missing: [] };
  }
  throw new Error("profile: badge cipher is not in this save");
}

/** Clear the `isNew` dot on every owned badge ("mark all seen"). */
export function clearBadgeNew(s: GardenscapesSession): EditResult {
  const rows = badgeRows(s);
  if (!rows) throw new Error("profile: save has no OwnedBadges array");
  let n = 0;
  for (const row of rows) {
    if (row[0] !== "o") continue;
    const hit = (row[1] as ObjChild[]).find(([k]) => k === "isNew");
    if (hit && hit[1][1] === true) {
      hit[1] = ["f", false];
      n++;
    }
  }
  if (n) s.log.push(`Profile: ${n} badge(s) marked seen`);
  return {
    changed: n ? [`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_PATH}.isNew`] : [],
    missing: [],
  };
}

/** Every badge id the catalog offers. */
export function allBadgeIds(): string[] {
  return GS_BADGES.map((b) => b.id);
}

/** Every title id the catalog offers. */
export function allTitleIds(): string[] {
  return GS_TITLES.map((t) => t.id);
}

/**
 * Mint badge rows the save does not hold yet. Each catalog id is encoded to
 * the game's own ciphertext with the solved key, appended to `OwnedBadges`
 * as a fresh `{badgeId, isNew:true}` row — the exact shape the game writes
 * when a badge is earned. Rows are deduped by decoded id so pressing twice
 * never duplicates a badge.
 */
export function unlockBadges(s: GardenscapesSession, ids: string[]): EditResult {
  const rows = badgeRows(s);
  if (!rows) throw new Error("profile: save has no OwnedBadges array");
  const have = new Set(rows.map((r) => rowCipher(r)).filter((x): x is string => !!x).map(safeDecode));
  const changed: string[] = [];
  const missing: string[] = [];
  let added = 0;
  for (const id of ids) {
    if (!GS_BADGES.some((b) => b.id === id)) {
      missing.push(id);
      continue;
    }
    if (have.has(id)) continue;
    have.add(id);
    const cipher = encodeBadgeCipher(id);
    rows.push(["o", [["badgeId", ["s", cipher]], ["isNew", ["t", true]]]]);
    added++;
  }
  if (added) {
    s.log.push(`Profile: unlocked ${added} badge(s)`);
    changed.push(`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_PATH}`);
  }
  return { changed, missing };
}

/** Unlock every catalog badge the save does not hold. */
export function unlockAllBadges(s: GardenscapesSession): EditResult {
  return unlockBadges(s, allBadgeIds());
}

/**
 * Earn titles: union `ids` into `PlayerTitleIdsEarned` (a comma CSV with a
 * trailing newline, the format measured on a real save) and keep the ones
 * already there.
 */
export function unlockTitles(s: GardenscapesSession, ids: string[]): EditResult {
  const changed: string[] = [];
  const missing: string[] = [];
  const held = new Set(csv(strAt(s.decoded.doc, `${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.PlayerTitleIdsEarned`)));
  let added = 0;
  const clean: string[] = [];
  for (const id of ids) {
    if (!GS_TITLES.some((t) => t.id === id)) {
      missing.push(id);
      continue;
    }
    if (held.has(id)) continue;
    held.add(id);
    clean.push(id);
    added++;
  }
  if (added === 0) return { changed, missing };
  const before = csv(strAt(s.decoded.doc, `${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.PlayerTitleIdsEarned`));
  const next = [...before, ...clean].join(",") + "\n";
  const res = applyOps(s.decoded.doc, [
    { path: `${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.PlayerTitleIdsEarned`, value: next },
  ]);
  if (res.changed.length) {
    changed.push(...res.changed);
  } else if (res.missing.length) {
    // applyOps never creates — create the key through the own-profile object.
    const own = entryOf(s.decoded.doc, OWN_TABLE, OWN_ENTRY);
    const ref = own ? getRef(own, OWN_PATH) : null;
    if (ref && ref.type === "o") {
      objPut({ key: OWN_PATH, type: "o", value: ref.value }, "PlayerTitleIdsEarned", "s", next);
      changed.push(`${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.PlayerTitleIdsEarned`);
    }
  }
  if (changed.length) s.log.push(`Profile: earned ${added} title(s)`);
  return { changed, missing };
}

/** Earn every catalog title the save does not hold. */
export function unlockAllTitles(s: GardenscapesSession): EditResult {
  return unlockTitles(s, allTitleIds());
}

// ---------------------------------------------------------------------------
// Frames — unlock only (no wear key exists in any save)
// ---------------------------------------------------------------------------

/**
 * Unlock frames: BOTH grammars per id (`BoughtFrame_<id>` + `BoughtFrame_Frame_<id>`,
 * exactly the pair `unlock_all.py` writes and every measured save holds) plus
 * the ShownIds CSV. The CSV is created when absent — the one measured save
 * without `UserAvatar_FramesShownIds` still carries all four other keys, so a
 * frame unlock against it must not be a silent no-op.
 *
 * There is deliberately no `wearFrame`: no own-profile worn-frame key exists
 * in any save in the corpus (`profileFrame` is StellarRace bot rows,
 * `isGoldFrame` is opponent bot info). Unlock-only is the honest feature.
 */
export function unlockFrames(s: GardenscapesSession, ids: string[]): EditResult {
  const changed: string[] = [];
  const clean = ids.map((id) => requireToken(id, "frame"));
  for (const id of clean) {
    if (propPut(s, `BoughtFrame_${id}`, "t", true)) changed.push(`BoughtFrame_${id}`);
    if (propPut(s, `BoughtFrame_Frame_${id}`, "t", true)) changed.push(`BoughtFrame_Frame_${id}`);
  }
  if (clean.length && mergeCsv(s, "UserAvatar_FramesShownIds", clean)) {
    changed.push("UserAvatar_FramesShownIds");
  }
  if (changed.length) s.log.push(`Profile: unlocked ${clean.length} frame(s)`);
  return { changed, missing: [] };
}

/** Every frame id the catalogs offer (owned + activatable). */
export function allFrameIds(): string[] {
  return [...GS_FRAMES, ...GS_FRAMES_ACTIVATABLE].map((f) => f.id);
}

/** Every avatar id the catalog offers. */
export function allAvatarIds(): string[] {
  return GS_AVATARS.map((a) => a.id);
}

/** Dashboard counts. */
export function profileSummary(s: GardenscapesSession): {
  avatars: number;
  frames: number;
  badges: number;
  style: string;
} {
  const p = readProfile(s);
  return {
    avatars: p.boughtAvatars,
    frames: p.boughtFrames,
    badges: p.ownedBadges.length,
    style: p.wornAvatarStyle,
  };
}

export type { AUDBDocument, AUDBEntry, EditOp, EditResult };
export { findTable, toInt };
