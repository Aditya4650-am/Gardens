// Gardenscapes server-side save transport: ADB pull/push of the raw
// GameData.db (AUDB container) plus the AUDB <-> XML codec glue.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import { writeSaveXml, decodeSave, type DecodedGardenscapesSave } from "@/lib/gardenscapes/save-engine";
import { resolveAdb, GAME_PACKAGE, SAVE_REMOTE_PATH } from "@/lib/gardenscapes/adb";

const execFileP = promisify(execFile);
const PULL_TMP = "/tmp/opencode/gs_pull_GameData.db";
const PUSH_TMP = "/tmp/opencode/gs_push_GameData.db";
const STAGE_TMP = "/data/local/tmp/gs_push_GameData.db";

export const GAME_SAVE_RELATIVE_PATH = `data/data/${GAME_PACKAGE}/Documents/GameData.db`;

/**
 * Read a root-only file through `su -c cat`. `adb pull` cannot be used here:
 * the save lives in the package's private storage, which the shell user (what
 * `adb pull` runs as) cannot read.
 */
async function suCat(adb: string, serial: string, remote: string): Promise<Buffer> {
  const res = await execFileP(adb, ["-s", serial, "exec-out", "su", "-c", `cat '${remote}'`], {
    maxBuffer: 256 * 1024 * 1024,
    timeout: 120000,
    encoding: "buffer",
  });
  const buf = res.stdout;
  if (!buf || buf.length < 64) {
    throw new Error("Could not read GameData.db — enable root and open Gardenscapes once.");
  }
  return buf;
}

export async function pullGameSaveRaw(serial?: string): Promise<{ b64: string; file: string; size: number }> {
  const { adb, serial: target } = await resolveAdb(serial);
  const buf = await suCat(adb, target, SAVE_REMOTE_PATH);
  return { b64: buf.toString("base64"), file: SAVE_REMOTE_PATH, size: buf.length };
}

export async function pushGameSaveRaw(b64: string, serial?: string): Promise<{ ok: boolean; size: number; file: string }> {
  const { adb, serial: target } = await resolveAdb(serial);
  const fs = await import("node:fs");
  fs.writeFileSync(PUSH_TMP, Buffer.from(b64, "base64"));
  try {
    await execFileP(adb, ["-s", target, "push", PUSH_TMP, STAGE_TMP], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120000,
    });
    // The game rewrites this file as it closes, so it must be stopped first or
    // the new bytes are replaced by the old in-memory state.
    await execFileP(adb, ["-s", target, "shell", `am force-stop ${GAME_PACKAGE}`], { timeout: 30000 });
    // Write through a redirect so the existing inode keeps its uid/gid and
    // SELinux context — a fresh root-owned file is unreadable by the game.
    const shell = `cat '${STAGE_TMP}' > '${SAVE_REMOTE_PATH}'; chmod 600 '${SAVE_REMOTE_PATH}'`;
    await execFileP(adb, ["-s", target, "shell", `su -c "${shell}"`], { timeout: 60000 });
    await execFileP(adb, ["-s", target, "shell", `rm -f ${STAGE_TMP}`], { timeout: 30000 });
    return { ok: true, size: Buffer.from(b64, "base64").length, file: SAVE_REMOTE_PATH };
  } finally {
    try {
      fs.unlinkSync(PUSH_TMP);
    } catch {
      /* noop */
    }
  }
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
