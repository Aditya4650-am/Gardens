// Gardenscapes server-side save transport: ADB pull/push of the raw
// GameData.db (AUDB container) plus the AUDB <-> XML codec glue.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import { writeSaveXml, decodeSave, type DecodedGardenscapesSave } from "@/lib/gardenscapes/save-engine";
import { adbRun, ADB_PATH, ADB_DEVICE, GAME_PACKAGE, SAVE_REMOTE_PATH } from "@/lib/gardenscapes/adb";

const execFileP = promisify(execFile);
const PULL_TMP = "/tmp/opencode/gs_pull_GameData.db";
const PUSH_TMP = "/tmp/opencode/gs_push_GameData.db";

export const GAME_SAVE_RELATIVE_PATH = `data/data/${GAME_PACKAGE}/Documents/GameData.db`;

export async function pullGameSaveRaw(serial: string = ADB_DEVICE): Promise<{ b64: string; file: string; size: number }> {
  const res = await execFileP(ADB_PATH, ["-s", serial, "pull", SAVE_REMOTE_PATH, PULL_TMP], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  const fs = await import("node:fs");
  const buf = fs.readFileSync(PULL_TMP);
  try {
    fs.unlinkSync(PULL_TMP);
  } catch {
    /* noop */
  }
  return { b64: buf.toString("base64"), file: SAVE_REMOTE_PATH, size: buf.length };
}

export async function pushGameSaveRaw(b64: string, serial: string = ADB_DEVICE): Promise<{ ok: boolean; size: number }> {
  const fs = await import("node:fs");
  fs.writeFileSync(PUSH_TMP, Buffer.from(b64, "base64"));
  await execFileP(ADB_PATH, ["-s", serial, "push", PUSH_TMP, SAVE_REMOTE_PATH], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  try {
    fs.unlinkSync(PUSH_TMP);
  } catch {
    /* noop */
  }
  return { ok: true, size: b64.length };
}

export async function decodeGameSave(b64: string): Promise<{ ok: true; data: DecodedGardenscapesSave } | { ok: false; error: string }> {
  try {
    const buf = Buffer.from(b64, "base64");
    const dec = decodeSave(buf);
    return { ok: true, data: dec };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Write an edited XML string back into the AUDB document carried by the given
 * cipher bytes, and re-encode to cipher bytes for the push.
 */
export function encodeGameSave(cipherB64: string, xml: string): { ok: true; cipherB64: string; size: number } | { ok: false; error: string } {
  try {
    const cipher = Buffer.from(cipherB64, "base64");
    const out = writeSaveXml(cipher, xml);
    return { ok: true, cipherB64: out.toString("base64"), size: out.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
