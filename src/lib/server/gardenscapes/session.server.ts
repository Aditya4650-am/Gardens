// Gardenscapes session store + connect/push pipeline.
//
// Mirrors the IGG Township studio.server.ts contract: a long-lived in-memory
// Map of sessions keyed by id, each holding the decoded AUDB document. The
// device transport (pull/push via ADB) lives in save.server.ts; this module
// owns the decode -> edit -> encode round trip that the Connect/Save/Push flow
// depends on, so a Gardenscapes save never gets re-serialized outside the
// byte-exact AUDB codec.

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { decodeSave, encodeSave, findEntry, findTable, objEntries, type DecodedGardenscapesSave } from "@/lib/gardenscapes/save-engine";

export type GardenscapesSession = {
  id: string;
  token: string;
  device: string;
  /** The decoded save the edits mutate. */
  decoded: DecodedGardenscapesSave;
  /** Cipher bytes exactly as loaded, before any edit (undo source). */
  originalCipher: Buffer;
  log: string[];
};

const sessions = new Map<string, GardenscapesSession>();

export function connectLoad(
  token: string,
  device: string,
  saveB64: string,
): GardenscapesSession {
  const buf = Buffer.from(saveB64.trim(), "base64");
  if (buf.length < 8) throw new Error("Gardenscapes save is too small");
  const decoded = decodeSave(buf);
  const session: GardenscapesSession = {
    id: randomUUID(),
    token,
    device,
    decoded,
    originalCipher: Buffer.from(buf),
    log: ["Save loaded", `Tables: ${decoded.doc.tables.length}`],
  };
  sessions.set(session.id, session);
  return session;
}

/**
 * A save written by the Vietnam build is refused by every other client with
 * "this version is no longer supported". Turning the regional flag off is a
 * one-field normalisation, and it is the difference between a save that loads
 * and one that cannot open at all.
 */
function normaliseRegionBuild(s: GardenscapesSession): void {
  const table = findTable(s.decoded.doc, "TableName");
  if (!table) return;
  const props = findEntry(table, "Properties");
  if (!props || props.type !== "o") return;
  const hit = objEntries(props).find(([k]) => k === "vietnamBuild");
  if (!hit || hit[1][1] !== true) return;
  hit[1] = ["f", false];
  s.log.push("Region build flag normalised (VN build off)");
}

export function getSession(id: string, token: string): GardenscapesSession {
  const s = sessions.get(id);
  if (!s || s.token !== token) throw new Error("Session expired - connect again");
  return s;
}

export function listSessions(token: string): GardenscapesSession[] {
  return [...sessions.values()].filter((s) => s.token === token);
}

export function dropSession(id: string, token: string): boolean {
  const s = sessions.get(id);
  if (!s || s.token !== token) return false;
  sessions.delete(id);
  return true;
}

/** Re-encode the (possibly edited) session document to device cipher bytes. */
export function pushEncode(sessionId: string, token: string): Buffer {
  const s = getSession(sessionId, token);
  // The session's key, not the shipped default: a fresh-account save is
  // wrapped in a key recovered at load time (see gardenscapes/key-recover.ts).
  return encodeSave(s.decoded.doc, s.decoded.key);
}

/** Byte-exact undo: restore the document from the originally loaded bytes. */
export function restoreOriginal(sessionId: string, token: string): void {
  const s = getSession(sessionId, token);
  s.decoded = decodeSave(s.originalCipher);
  s.log.push("Restored original save");
}

export function snapshot(s: GardenscapesSession) {
  return {
    id: s.id,
    device: s.device,
    tables: s.decoded.doc.tables.length,
    version: s.decoded.version,
    log: s.log,
  };
}