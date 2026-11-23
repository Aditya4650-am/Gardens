// Gardenscapes server-side ADB transport helpers.
//
// This path is only reachable when the server itself runs on a machine that has
// the emulator attached — i.e. a local `npm start`. A hosted server is a Linux
// box with no ADB and no emulator, which is exactly why the Windows client
// drives its own ADB through the native bridge. Discovery here mirrors the
// client: find an adb binary, then take the first *attached* device, because an
// emulator hands out a different loopback port on every restart.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const GAME_PACKAGE = "com.playrix.gardenscapes";
/** Both Gardenscapes builds share the save format and the Documents layout. */
export const GAME_PACKAGES = [GAME_PACKAGE, "com.playrix.gardenscapes.vn"];
export const SAVE_FILENAME = "GameData.db";
export const SAVE_REMOTE_PATH = `/data/data/${GAME_PACKAGE}/Documents/${SAVE_FILENAME}`;

/** Absolute device path of `GameData.db` inside a package's Documents folder. */
export function saveRemotePath(pkg: string): string {
  return `/data/data/${pkg}/Documents/${SAVE_FILENAME}`;
}

const pkgCache = new Map<string, string>();

/** Which Gardenscapes build this device has (global first, then Vietnam). */
export async function resolveGamePackage(adb: string, serial: string): Promise<string> {
  const cached = pkgCache.get(serial);
  if (cached) return cached;
  for (const pkg of GAME_PACKAGES) {
    try {
      const res = await execFileP(adb, ["-s", serial, "shell", `pm path ${pkg}`], {
        timeout: 20000,
        encoding: "utf8",
      });
      if ((res.stdout ?? "").includes("package:")) {
        pkgCache.set(serial, pkg);
        return pkg;
      }
    } catch {
      /* try the next build */
    }
  }
  throw new Error(
    `Gardenscapes is not installed on ${serial} (checked the global and Vietnam builds).`,
  );
}

// Legacy constants kept so existing imports keep compiling. Both are empty on
// purpose: the real values are resolved per call, never fixed at build time.
export const ADB_PATH = "";
export const ADB_DEVICE = "";

function adbCandidates(): string[] {
  const found: string[] = [];
  const push = (p: string) => {
    if (p && !found.includes(p)) found.push(p);
  };

  for (const raw of (process.env.PATH ?? "").split(delimiter)) {
    const dir = raw.trim().replace(/^"|"$/g, "");
    if (dir) push(join(dir, "adb.exe"));
  }

  const local = process.env.LOCALAPPDATA || "";
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pfx = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const home = process.env.USERPROFILE || "";
  const bases = [
    pf,
    pfx,
    join(local, "Android", "Sdk"),
    join(home, "AppData", "Local", "Android", "Sdk"),
    join(home, "Desktop"),
    join(home, "Downloads"),
    join(pf, "Microvirt", "MEmu"),
    join(pfx, "Microvirt", "MEmu"),
    join(pf, "LDPlayer", "LDPlayer9"),
    join(pfx, "LDPlayer", "LDPlayer9"),
    join(pf, "Nox", "bin"),
    join(pfx, "Nox", "bin"),
    join(pf, "BlueStacks"),
  ];
  for (const base of bases) {
    push(join(base, "adb.exe"));
    push(join(base, "platform-tools", "adb.exe"));
  }
  return found.filter((p) => existsSync(p));
}

/** Locate an adb binary: explicit candidates first, then whatever is on PATH. */
export async function findAdb(): Promise<string> {
  const hit = adbCandidates()[0];
  if (hit) return hit;
  try {
    await execFileP("adb", ["version"], { timeout: 10000 });
    return "adb";
  } catch {
    throw new Error(
      "ADB was not found on this computer. Install Android platform-tools (adb), or run the tool from the EXE with the emulator open.",
    );
  }
}

/** First attached (state `device`) serial, or "" when nothing is connected. */
export async function findSerial(adb: string): Promise<string> {
  try {
    const out = await execFileP(adb, ["devices"], { timeout: 20000 });
    for (const line of out.stdout.split(/\r?\n/).slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1] === "device" && parts[0]) return parts[0];
    }
  } catch {
    /* fall through to the empty answer */
  }
  return "";
}

export interface AdbTarget {
  adb: string;
  serial: string;
}

/** Resolve both halves, refusing with an actionable message when adb is absent. */
export async function resolveAdb(serial?: string): Promise<AdbTarget> {
  const adb = await findAdb();
  const found = serial?.trim() || (await findSerial(adb));
  if (!found) {
    throw new Error("No emulator connected — start it, then press Refresh.");
  }
  return { adb, serial: found };
}

export async function adbRun(
  args: string[],
  serial?: string,
  adb?: string,
): Promise<string> {
  const target = await resolveAdb(serial);
  const res = await execFileP(adb || target.adb, ["-s", target.serial, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  return res.stdout;
}

export async function adbPull(
  remotePath: string,
  localPath: string,
  serial?: string,
): Promise<void> {
  await adbRun(["pull", remotePath, localPath], serial);
}

export async function adbPush(
  localPath: string,
  remotePath: string,
  serial?: string,
): Promise<void> {
  await adbRun(["push", localPath, remotePath], serial);
}
