// Profile — avatars, frames, name styles, titles, badges.
//
// Every key below was measured against a working, fully-unlocked save
// (`GameData (3).db`), not inferred from a convention:
//
//   TableName.Properties
//     BoughtAvatar_<id>                 t true
//     ObtainedStyle_<id>                t true   ← flat mirror of the GFF below
//     UserAvatar_AvatarsShownIds        s  CSV
//     UserAvatar_AvatarStylesShownIds   s  CSV   ← colour styles AND Frame_* ids
//     UserNameStyle_StylesShownIds      s  CSV   ← NameStyle_* + gold + Default
//
//   Features.ObtainableAvatarStylesGFF.ObtainableAvatarStyles
//       .ObtainedStyle_<id>                          t true
//   Features.ObtainablePlayerNameStylesGFF.ObtainablePlayerNameStyles
//       .ObtainedPlayerNameStyle_<id>                t true
//   Features.ProfileBadgesGFF.Core.OwnedBadges        a  [{badgeId <cipher>, isNew f}]
//   Features.ProfileBadgesGFF.ProfileBadgesLoader
//       .IsBadgesLibraryWasLoaded                    t true
//
//   SpecialEvents.PlayerProfileOwn.OwnProfile
//     AvatarStyle        s  worn frame **or** colour ("gold" / "Frame_Feather")
//     PlayerNameStyle    s  worn name style
//     PlayerTitleId      s  worn title, plain id ("" = none)
//     PlayerTitleIdsEarned s cipher of the earned-title CSV, newline-padded
//     ProfileBadgeId     s  cipher of the worn badge id
//
// Two consequences the old writers got wrong and this one fixes:
//   - A frame is not a `BoughtFrame_*` boolean. The game reads the GFF map plus
//     the shared AvatarStyles CSV, and wears one through `AvatarStyle`.
//   - `PlayerTitleIdsEarned` is badge-cipher text, not a plain CSV.
//
// Nothing here creates keys the reference save does not carry.

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
import { entry as entryOf, strAt, type EditOp, type EditResult } from "./common.server";
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
const BADGES_LOADER = "ProfileBadgesLoader";
const FRAMES_GFF = "ObtainableAvatarStylesGFF";
const FRAMES_INNER = "ObtainableAvatarStyles";
const STYLES_GFF = "ObtainablePlayerNameStylesGFF";
const STYLES_INNER = "ObtainablePlayerNameStyles";

/** Flat Properties prefix that mirrors the frame GFF map. */
const FRAME_KEY = "ObtainedStyle_";
/** Deep GFF key prefix for a name style. */
const NAME_STYLE_KEY = "ObtainedPlayerNameStyle_";

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
  /** Frame ids the save has obtained (flat mirror ∪ AvatarStyles CSV). */
  framesOwned: string[];
  /** `PlayerTitleIdsEarned`, decoded and split. */
  titlesEarned: string[];
  boughtAvatars: number;
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

function propGet(s: GardenscapesSession, key: string): unknown {
  return objEntries(props(s)).find(([k]) => k === key)?.[1][1];
}

/** Set (or create) one flat Properties key with an explicit type. */
function propPut(s: GardenscapesSession, key: string, type: string, value: unknown): boolean {
  const e = props(s);
  const hit = objEntries(e).find(([k]) => k === key);
  if (hit && hit[1][0] === type && hit[1][1] === value) return false;
  objPut(e, key, type, value);
  return true;
}

/**
 * Merge ids into a Properties CSV, keeping the save's own order and appending
 * only what is missing. The key is created when the save does not hold it.
 */
function mergeCsv(s: GardenscapesSession, key: string, ids: string[]): boolean {
  const before = csv(propGet(s, key));
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
  return propPut(s, key, "s", before.join(","));
}

/**
 * Resolve (or create) the object one level inside a `Features.<GFF>` entry,
 * e.g. `Features.ObtainableAvatarStylesGFF.ObtainableAvatarStyles`.
 */
function gffInner(s: GardenscapesSession, gffEntry: string, innerKey: string): AUDBEntry {
  const t = findTable(s.decoded.doc, BADGES_TABLE);
  if (!t) throw new Error("profile: save has no Features table");
  let top = findEntry(t, gffEntry);
  if (!top || top.type !== "o") {
    top = { key: gffEntry, type: "o", value: [] as ObjChild[] };
    t.entries.push(top);
  }
  let inner = objEntries(top).find(([k]) => k === innerKey)?.[1];
  if (!inner || inner[0] !== "o") {
    objPut(top, innerKey, "o", [] as ObjChild[]);
    inner = objEntries(top).find(([k]) => k === innerKey)![1];
  }
  return { key: innerKey, type: "o", value: inner[1] };
}

/** Write `t true` into a GFF inner object, returning whether it changed. */
function gffFlag(s: GardenscapesSession, gffEntry: string, innerKey: string, key: string): boolean {
  const obj = gffInner(s, gffEntry, innerKey);
  const hit = objEntries(obj).find(([k]) => k === key);
  if (hit && hit[1][0] === "t" && hit[1][1] === true) return false;
  objPut(obj, key, "t", true);
  return true;
}

/** True when the GFF inner object already carries `key = true`. */
function gffHas(s: GardenscapesSession, gffEntry: string, innerKey: string, key: string): boolean {
  const t = findTable(s.decoded.doc, BADGES_TABLE);
  const top = t ? findEntry(t, gffEntry) : null;
  if (!top || top.type !== "o") return false;
  const inner = objEntries(top).find(([k]) => k === innerKey)?.[1];
  if (!inner || inner[0] !== "o") return false;
  const hit = (inner[1] as ObjChild[]).find(([k]) => k === key);
  return Boolean(hit && hit[1][0] === "t" && hit[1][1] === true);
}

function ownPut(s: GardenscapesSession, key: string, value: string): EditResult {
  const own = ownProfile(s);
  const hit = objEntries(own).find(([k]) => k === key);
  if (hit && hit[1][1] === value) return { changed: [], missing: [] };
  objPut(own, key, "s", value);
  return { changed: [`${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.${key}`], missing: [] };
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

/**
 * Encode an earned-title list the way the game stores it: comma CSV encrypted
 * with the badge cipher, newline-padded to the 32-byte stride the reference
 * save carries (284 chars → 3 `\n` → 287 bytes → 384 base64 chars).
 */
function encodeTitleList(ids: string[]): string {
  let plain = ids.join(",");
  while (plain.length % 32 !== 31) plain += "\n";
  return encodeBadgeCipher(plain);
}

/** Decode `PlayerTitleIdsEarned` into ids. */
function decodeTitleList(stored: unknown): string[] {
  if (typeof stored !== "string" || stored.length === 0) return [];
  try {
    return csv(decodeBadgeCipher(stored));
  } catch {
    return [];
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
  const ownKids: ObjChild[] = ownRef && ownRef.type === "o" ? (ownRef.value as ObjChild[]) : [];
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
  const framesOwned = new Set<string>();
  for (const [k, [t, v]] of kids) {
    if (t === "t" && v === true) {
      if (k.startsWith("BoughtAvatar_")) boughtAvatars++;
      else if (k.startsWith(FRAME_KEY)) framesOwned.add(k.slice(FRAME_KEY.length));
    }
  }
  const avatarStylesShown = csv(flat("UserAvatar_AvatarStylesShownIds"));
  for (const id of avatarStylesShown) if (id.startsWith("Frame_") || id.startsWith("TS_")) framesOwned.add(id);

  return {
    wornAvatarStyle: worn("AvatarStyle"),
    wornNameStyle: worn("PlayerNameStyle"),
    wornTitleId: worn("PlayerTitleId"),
    wornBadgeCipher: worn("ProfileBadgeId"),
    wornBadgeId: safeDecode(worn("ProfileBadgeId")),
    currentAvatarId: typeof flat("UserAvatar_CurrentAvatarId") === "string" ? (flat("UserAvatar_CurrentAvatarId") as string) : "",
    avatarsShown: csv(flat("UserAvatar_AvatarsShownIds")),
    avatarStylesShown,
    nameStylesShown: csv(flat("UserNameStyle_StylesShownIds")),
    framesOwned: [...framesOwned],
    titlesEarned: decodeTitleList(worn("PlayerTitleIdsEarned")),
    boughtAvatars,
    ownedBadges: rows,
  };
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

/** Unlock avatars: `BoughtAvatar_<id>` + merge into the ShownIds CSV. */
export function unlockAvatars(s: GardenscapesSession, ids: string[]): EditResult {
  const changed: string[] = [];
  const clean = ids.map((id) => requireToken(id, "avatar"));
  for (const id of clean) {
    if (propPut(s, `BoughtAvatar_${id}`, "t", true)) changed.push(`BoughtAvatar_${id}`);
  }
  if (clean.length && mergeCsv(s, "UserAvatar_AvatarsShownIds", clean)) {
    changed.push("UserAvatar_AvatarsShownIds");
  }
  if (changed.length) s.log.push(`Profile: unlocked ${clean.length} avatar(s)`);
  return { changed, missing: [] };
}

/**
 * Wear an avatar — atomic unlock + wear, matching the reference editor's own
 * first-tap behaviour. Writes `UserAvatar_CurrentAvatarId`.
 */
export function wearAvatar(s: GardenscapesSession, id: string): EditResult {
  requireToken(id, "avatar");
  const unlock = unlockAvatars(s, [id]);
  const changed = [...unlock.changed];
  if (propPut(s, "UserAvatar_CurrentAvatarId", "s", id)) changed.push("UserAvatar_CurrentAvatarId");
  if (changed.length) s.log.push(`Profile: wearing avatar ${id}`);
  return { changed, missing: [] };
}

// ---------------------------------------------------------------------------
// Frames — GFF map + shared AvatarStyles CSV + wear through `AvatarStyle`
// ---------------------------------------------------------------------------

/**
 * Unlock frames. Each id is written three ways, exactly as the reference save
 * carries it: the flat `Properties.ObtainedStyle_*` mirror, the deep
 * `ObtainableAvatarStylesGFF` map, and the shared `AvatarStylesShownIds` CSV
 * (frames and colour styles share that one list).
 */
export function unlockFrames(s: GardenscapesSession, ids: string[]): EditResult {
  const changed: string[] = [];
  const clean = ids.map((id) => requireToken(id, "frame"));
  for (const id of clean) {
    if (propPut(s, `${FRAME_KEY}${id}`, "t", true)) changed.push(`${FRAME_KEY}${id}`);
    if (gffFlag(s, FRAMES_GFF, FRAMES_INNER, `${FRAME_KEY}${id}`)) changed.push(`${FRAMES_GFF}.${id}`);
  }
  if (clean.length && mergeCsv(s, "UserAvatar_AvatarStylesShownIds", clean)) {
    changed.push("UserAvatar_AvatarStylesShownIds");
  }
  if (changed.length) s.log.push(`Profile: unlocked ${clean.length} frame(s)`);
  return { changed, missing: [] };
}

/** Unlock + wear a frame (`AvatarStyle` holds the frame id). */
export function wearFrame(s: GardenscapesSession, id: string): EditResult {
  requireToken(id, "frame");
  const unlock = unlockFrames(s, [id]);
  const wear = ownPut(s, "AvatarStyle", id);
  const changed = [...unlock.changed, ...wear.changed];
  if (changed.length) s.log.push(`Profile: wearing frame ${id}`);
  return { changed, missing: [...unlock.missing, ...wear.missing] };
}

/** Every frame id the catalogs offer (owned + activatable). */
export function allFrameIds(): string[] {
  return [...GS_FRAMES, ...GS_FRAMES_ACTIVATABLE].map((f) => f.id);
}

// ---------------------------------------------------------------------------
// Avatar colour styles (the `Wood/Blue/...` set) + name styles
// ---------------------------------------------------------------------------

/** Unlock several avatar colour styles into the ShownIds CSV. */
export function unlockAvatarStyles(s: GardenscapesSession, styles: string[]): EditResult {
  const clean = styles.map((x) => requireToken(x, "avatar style"));
  const ok = mergeCsv(s, "UserAvatar_AvatarStylesShownIds", clean);
  if (ok) s.log.push(`Profile: unlocked ${clean.length} avatar style(s)`);
  return { changed: ok ? ["UserAvatar_AvatarStylesShownIds"] : [], missing: [] };
}

/** Unlock + wear an avatar colour style. */
export function wearAvatarStyle(s: GardenscapesSession, style: string): EditResult {
  requireToken(style, "avatar style");
  const wear = ownPut(s, "AvatarStyle", style);
  const changed = [...wear.changed];
  if (mergeCsv(s, "UserAvatar_AvatarStylesShownIds", [style])) {
    changed.push("UserAvatar_AvatarStylesShownIds");
  }
  if (changed.length) s.log.push(`Profile: avatar style ${style}`);
  return { changed, missing: wear.missing };
}

/** Unlock name styles: the deep GFF map + the ShownIds CSV. */
export function unlockNameStyles(s: GardenscapesSession, styles: string[]): EditResult {
  const changed: string[] = [];
  const clean = styles.map((x) => {
    requireToken(x, "name style");
    if (!GS_STYLES.some((st) => st.id === x)) throw new Error(`profile: unknown name style "${x}"`);
    return x;
  });
  for (const id of clean) {
    if (gffFlag(s, STYLES_GFF, STYLES_INNER, `${NAME_STYLE_KEY}${id}`)) changed.push(`${STYLES_GFF}.${id}`);
  }
  if (clean.length && mergeCsv(s, "UserNameStyle_StylesShownIds", clean)) {
    changed.push("UserNameStyle_StylesShownIds");
  }
  if (changed.length) s.log.push(`Profile: unlocked ${clean.length} name style(s)`);
  return { changed, missing: [] };
}

/** Unlock + wear a name style. */
export function wearNameStyle(s: GardenscapesSession, style: string): EditResult {
  requireToken(style, "name style");
  if (!GS_STYLES.some((st) => st.id === style)) throw new Error(`profile: unknown name style "${style}"`);
  const unlock = unlockNameStyles(s, [style]);
  const wear = ownPut(s, "PlayerNameStyle", style);
  const changed = [...unlock.changed, ...wear.changed];
  if (changed.length) s.log.push(`Profile: name style ${style}`);
  return { changed, missing: wear.missing };
}

// ---------------------------------------------------------------------------
// Titles — earned list is cipher text; worn id is plain
// ---------------------------------------------------------------------------

/** Every title id the catalog offers. */
export function allTitleIds(): string[] {
  return GS_TITLES.map((t) => t.id);
}

/** Union `ids` into the earned list (cipher-encoded, game shape). */
export function unlockTitles(s: GardenscapesSession, ids: string[]): EditResult {
  const changed: string[] = [];
  const missing: string[] = [];
  const own = ownProfile(s);
  const stored = objEntries(own).find(([k]) => k === "PlayerTitleIdsEarned")?.[1][1];
  const held = new Set(decodeTitleList(stored));
  const next = [...held];
  let added = 0;
  for (const id of ids) {
    if (!GS_TITLES.some((t) => t.id === id)) {
      missing.push(id);
      continue;
    }
    if (held.has(id)) continue;
    held.add(id);
    next.push(id);
    added++;
  }
  if (added === 0) return { changed, missing };
  objPut(own, "PlayerTitleIdsEarned", "s", encodeTitleList(next));
  changed.push(`${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.PlayerTitleIdsEarned`);
  s.log.push(`Profile: earned ${added} title(s)`);
  return { changed, missing };
}

/** Earn every catalog title the save does not hold. */
export function unlockAllTitles(s: GardenscapesSession): EditResult {
  return unlockTitles(s, allTitleIds());
}

/** Earn + wear a title. */
export function wearTitle(s: GardenscapesSession, titleId: string): EditResult {
  if (titleId !== "" && !GS_TITLES.some((t) => t.id === titleId)) {
    throw new Error(`profile: unknown title "${titleId}"`);
  }
  const unlock = titleId ? unlockTitles(s, [titleId]) : { changed: [], missing: [] };
  const wear = ownPut(s, "PlayerTitleId", titleId);
  const changed = [...unlock.changed, ...wear.changed];
  if (changed.length) s.log.push(`Profile: title ${titleId || "(cleared)"}`);
  return { changed, missing: unlock.missing };
}

// ---------------------------------------------------------------------------
// Badges — cipher rows in `OwnedBadges`, worn cipher in `ProfileBadgeId`
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

/** Mark the badge library loaded — the reference save always carries it. */
function markBadgeLibrary(s: GardenscapesSession): boolean {
  return gffFlag(s, BADGES_ENTRY, BADGES_LOADER, "IsBadgesLibraryWasLoaded");
}

/**
 * Wear a badge. Accepts a catalog id (encoded here with the solved cipher) or
 * a cipher the save already holds.
 */
export function wearBadge(s: GardenscapesSession, idOrCipher: string): EditResult {
  const known = GS_BADGES.some((b) => b.id === idOrCipher);
  const cipher = known ? encodeBadgeCipher(idOrCipher) : idOrCipher;
  const rows = badgeRows(s);
  if (!known && rows) {
    const held = new Set(rows.map(rowCipher).filter((x): x is string => !!x));
    held.add(strAt(s.decoded.doc, `${OWN_TABLE}.${OWN_ENTRY}.${OWN_PATH}.ProfileBadgeId`));
    if (!held.has(cipher)) throw new Error("profile: badge cipher is not in this save");
  }
  const res = ownPut(s, "ProfileBadgeId", cipher);
  const changed = [...res.changed];
  if (markBadgeLibrary(s)) changed.push(`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_LOADER}`);
  if (changed.length) s.log.push(`Profile: wearing badge ${known ? idOrCipher : "(owned cipher)"}`);
  return { changed, missing: res.missing };
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
  return { changed: n ? [`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_PATH}.isNew`] : [], missing: [] };
}

/** Every badge id the catalog offers. */
export function allBadgeIds(): string[] {
  return GS_BADGES.map((b) => b.id);
}

/**
 * Mint badge rows the save does not hold yet: encode each catalog id to the
 * game's own ciphertext and append a fresh `{badgeId, isNew:true}` row — the
 * exact shape the game writes when a badge is earned.
 */
export function unlockBadges(s: GardenscapesSession, ids: string[]): EditResult {
  const rows = badgeRows(s);
  const changed: string[] = [];
  const missing: string[] = [];
  if (!rows) {
    for (const id of ids) if (!GS_BADGES.some((b) => b.id === id)) missing.push(id);
    return { changed, missing };
  }
  const have = new Set(rows.map((r) => rowCipher(r)).filter((x): x is string => !!x).map(safeDecode));
  let added = 0;
  for (const id of ids) {
    if (!GS_BADGES.some((b) => b.id === id)) {
      missing.push(id);
      continue;
    }
    if (have.has(id)) continue;
    have.add(id);
    rows.push(["o", [["badgeId", ["s", encodeBadgeCipher(id)]], ["isNew", ["t", true]]]]);
    added++;
  }
  if (added) {
    changed.push(`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_PATH}`);
    s.log.push(`Profile: unlocked ${added} badge(s)`);
  }
  if (markBadgeLibrary(s)) changed.push(`${BADGES_TABLE}.${BADGES_ENTRY}.${BADGES_LOADER}`);
  return { changed, missing };
}

/** Unlock every catalog badge the save does not hold. */
export function unlockAllBadges(s: GardenscapesSession): EditResult {
  return unlockBadges(s, allBadgeIds());
}

// ---------------------------------------------------------------------------
// Catalog ids
// ---------------------------------------------------------------------------

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
    avatars: p.avatarsShown.length,
    frames: p.framesOwned.length,
    badges: p.ownedBadges.length,
    style: p.wornAvatarStyle || p.wornNameStyle || "default",
  };
}

export type { AUDBDocument, AUDBEntry, EditOp, EditResult };
export { findTable, toInt };
