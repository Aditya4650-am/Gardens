// Gardenscapes server-side save transport: ADB pull/push of the raw
// GameData.db (AUDB container) plus the AUDB <-> XML codec glue.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import { writeSaveXml, decodeSave, type DecodedGardenscapesSave } from "@/lib/gardenscapes/save-engine";
import { resolveAdb, resolveGamePackage, saveRemotePath } from "@/lib/gardenscapes/adb";

const execFileP = promisify(execFile);
const PULL_TMP = "/tmp/opencode/gs_pull_GameData.db";
const PUSH_TMP = "/tmp/opencode/gs_push_GameData.db";
const STAGE_TMP = "/data/local/tmp/gs_push_GameData.db";

export const GAME_SAVE_RELATIVE_PATH = "data/data/com.playrix.gardenscapes/Documents/GameData.db";

/** The relative save path for whichever Gardenscapes build this device has. */
export async function resolveSavePath(serial?: string): Promise<{ path: string; package: string }> {
  const { adb, serial: target } = await resolveAdb(serial);
  const pkg = await resolveGamePackage(adb, target);
  return { path: saveRemotePath(pkg).replace(/^\//, ""), package: pkg };
}

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

export async function pullGameSaveRaw(serial?: string): Promise<{ b64: string; file: string; size: number; package: string }> {
  const { adb, serial: target } = await resolveAdb(serial);
  const pkg = await resolveGamePackage(adb, target);
  const remote = saveRemotePath(pkg);
  const buf = await suCat(adb, target, remote);
  return { b64: buf.toString("base64"), file: remote, size: buf.length, package: pkg };
}

export async function pushGameSaveRaw(b64: string, serial?: string): Promise<{ ok: boolean; size: number; file: string }> {
  const { adb, serial: target } = await resolveAdb(serial);
  const pkg = await resolveGamePackage(adb, target);
  const remotePath = saveRemotePath(pkg);
  const fs = await import("node:fs");
  fs.writeFileSync(PUSH_TMP, Buffer.from(b64, "base64"));
  try {
    await execFileP(adb, ["-s", target, "push", PUSH_TMP, STAGE_TMP], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120000,
    });
    // The game rewrites this file as it closes, so it must be stopped first or
    // the new bytes are replaced by the old in-memory state.
    await execFileP(adb, ["-s", target, "shell", `am force-stop ${pkg}`], { timeout: 30000 });
    // Write through a redirect so the existing inode keeps its uid/gid and
    // SELinux context — a fresh root-owned file is unreadable by the game.
    const shell = `cat '${STAGE_TMP}' > '${remotePath}'; chmod 600 '${remotePath}'`;
    await execFileP(adb, ["-s", target, "shell", `su -c "${shell}"`], { timeout: 60000 });
    await execFileP(adb, ["-s", target, "shell", `rm -f ${STAGE_TMP}`], { timeout: 30000 });
    return { ok: true, size: Buffer.from(b64, "base64").length, file: remotePath };
  } finally {
    try {
      fs.unlinkSync(PUSH_TMP);
    } catch {
      /* noop */
    }
  }
}

/**
 * Start the game after a push. The gifting flush runs on launch: the game
 * reads `PendingSendCards`, posts every row to Playrix and moves it into
 * `SentCards` — so a queued send only leaves the device once the game has
 * been restarted here (pushGameSaveRaw force-stops it first).
 */
export async function launchGameSave(serial?: string): Promise<{ ok: boolean; output: string }> {
  const { adb, serial: target } = await resolveAdb(serial);
  const pkg = await resolveGamePackage(adb, target);
  const res = await execFileP(
    adb,
    ["-s", target, "shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"],
    { timeout: 30000, encoding: "utf8" },
  );
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (/Activity not started|No activities found|monkey aborted/i.test(out)) {
    throw new Error(`Could not start Gardenscapes: ${out.trim().slice(0, 200)}`);
  }
  return { ok: true, output: out.trim() };
}

/**
 * Tap the middle of the game screen a few times.
 *
 * Playrix reward modals ("Tap to Open" / "Tap to Claim") hold the game before
 * its save/sync cycle — measured live: a 150-row gifting queue stayed pending
 * for 3+ minutes behind one and flushed the moment it was dismissed.
 */
export async function tapGame(taps = 3, serial?: string): Promise<{ ok: boolean; taps: number }> {
  const { adb, serial: target } = await resolveAdb(serial);
  const size = await execFileP(adb, ["-s", target, "shell", "wm size"], {
    timeout: 15000,
    encoding: "utf8",
  });
  const m = /(\d+)\s*x\s*(\d+)/.exec(size.stdout ?? "");
  const w = m ? Number(m[1]) : 1600;
  const h = m ? Number(m[2]) : 900;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  let done = 0;
  for (let i = 0; i < Math.max(1, Math.min(taps, 6)); i++) {
    await execFileP(adb, ["-s", target, "shell", "input", "tap", String(cx), String(cy)], {
      timeout: 15000,
      encoding: "utf8",
    });
    done++;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { ok: done > 0, taps: done };
}

export interface GsDeviceFriend {
  id: string;
  name: string;
}

/**
 * Read the friend roster out of the running game's memory.
 *
 * The on-disk caches (`ProfileFriendshipCache.xml` and friends) are
 * PLXE-encrypted, but the game parses them into heap structures the moment it
 * loads — measured live: the friend record sits as three 24-byte fields
 * (`saveId | numeric id | name`) and the metrics buffer carries
 * `friends_saveid_list:["…"]`. Scanning `/proc/<pid>/mem` therefore yields the
 * roster with no crypto at all.
 *
 * Contiguous writable regions are merged first: one `dd` per merged run keeps
 * the scan to a handful of adb round-trips instead of ~1200.
 */
export async function scanDeviceFriends(serial?: string): Promise<{
  friends: GsDeviceFriend[];
  scannedMB: number;
  hint: string;
}> {
  const { adb, serial: target } = await resolveAdb(serial);
  const pkg = await resolveGamePackage(adb, target);
  const pidRes = await execFileP(adb, ["-s", target, "shell", `pidof ${pkg}`], {
    timeout: 15000,
    encoding: "utf8",
  });
  const pid = (pidRes.stdout ?? "").trim().split(/\s+/)[0];
  if (!pid || !/^\d+$/.test(pid)) {
    throw new Error("Gardenscapes is not running — open the game, then press Scan again.");
  }
  const mapsRes = await execFileP(adb, ["-s", target, "shell", `cat /proc/${pid}/maps`], {
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  type Range = { lo: number; hi: number };
  const ranges: Range[] = [];
  for (const line of (mapsRes.stdout ?? "").split("\n")) {
    const m = /^([0-9a-f]+)-([0-9a-f]+)\s+(....)/.exec(line.trim());
    if (!m || !m[3].includes("w")) continue;
    const lo = parseInt(m[1], 16);
    const hi = parseInt(m[2], 16);
    if (hi - lo <= 0 || hi - lo > 400 * 1024 * 1024) continue;
    if (/\[vvar\]|\[vdso\]/.test(line)) continue;
    const last = ranges[ranges.length - 1];
    if (last && lo === last.hi) last.hi = hi;
    else ranges.push({ lo, hi });
  }

  const ID_RE = /^(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,14}$/;
  // `friends_saveid_list` is authoritative — it is literally the account's
  // friend list. The id|numeric|name records are a broader player directory
  // (leaderboard / suggested players), so they only ever supply NAMES for ids
  // the friends list already holds; they never add a friend on their own.
  const REC_RE =
    /([A-Za-z0-9]{8,14})([^\x20-\x7e]{4,24})(\d{9,15})([^\x20-\x7e]{4,24})([A-Za-z0-9 _\-']{2,23})(?![A-Za-z0-9 _\-'])/g;
  const listIds = new Set<string>();
  const names = new Map<string, string>();
  const addListIds = (ids: string[]) => {
    for (const id of ids) if (ID_RE.test(id)) listIds.add(id);
  };

  const PAGE = 4096;
  let scanned = 0;
  const scanBlob = (blob: Buffer) => {
    if (!blob || blob.length < 64) return;
    scanned += blob.length;

    // the game's own metrics field: friends_saveid_list:["id", …]
    const key = Buffer.from('"friends_saveid_list":[');
    let at = blob.indexOf(key);
    while (at >= 0) {
      const end = blob.indexOf(Buffer.from("]"), at + key.length);
      if (end > at && end - at < 4096) {
        const arr = blob.subarray(at + key.length, end + 1).toString("utf8");
        addListIds([...arr.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
      }
      at = blob.indexOf(key, at + 1);
    }

    // player-directory records: id | numeric id | name (names for friends)
    const txt = blob.toString("latin1");
    let m: RegExpExecArray | null;
    REC_RE.lastIndex = 0;
    while ((m = REC_RE.exec(txt)) !== null) {
      const id = m[1];
      if (!ID_RE.test(id)) continue;
      const name = m[5].trim();
      if (name && !names.get(id)) names.set(id, name);
    }
  };

  // Dump regions with a small pool: adb multiplexes, so four streams cut the
  // transfer to ~30s instead of one long serial sweep.
  const CONCURRENCY = 4;
  let nextIdx = 0;
  const worker = async () => {
    for (;;) {
      const i = nextIdx++;
      if (i >= ranges.length) return;
      const r = ranges[i];
      const blocks = Math.floor((r.hi - r.lo) / PAGE);
      if (blocks <= 0) continue;
      try {
        const res = await execFileP(
          adb,
          ["-s", target, "exec-out", "su", "-c", `dd if=/proc/${pid}/mem bs=${PAGE} skip=${r.lo / PAGE} count=${blocks} 2>/dev/null`],
          { timeout: 60000, encoding: "buffer", maxBuffer: 512 * 1024 * 1024 },
        );
        scanBlob(res.stdout as Buffer);
      } catch {
        // a hole mid-range stops dd — skip the run
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const friends = [...listIds]
    .map((id) => ({ id, name: names.get(id) ?? "" }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    friends,
    scannedMB: Math.round(scanned / (1024 * 1024)),
    hint: friends.length ? "" : "Open the game's friend/Send screen once, then press Scan again.",
  };
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
