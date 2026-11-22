// Gardenscapes device transport.
//
// There are two ways to reach the emulator, and they are not interchangeable:
//
//  * **Inside the EXE** (`window.iggNative`) the ADB binary runs on the same
//    Windows machine as the emulator, so it can actually find the game.
//  * **In a plain browser** there is no local ADB, so the call falls through to
//    the server functions — which only work when the server itself is running
//    on a machine that has the emulator attached (a local `npm start`).
//
// The old code always took the server path, so a client sitting next to a live
// MEmu still asked the Render Linux box to spawn `C:\Program Files\Microvirt\
// MEmu\adb.exe` and got `spawn … ENOENT`. Everything below exists so the EXE
// path wins whenever the bridge is present, and so a missing ADB reads as a
// sentence a user can act on rather than a Node error.

import { gsLaunchGame, gsPullDevice, gsPushDevice, gsScanDeviceFriends, gsTapGame } from "@/lib/gs-api";

export interface GsBridgeDevice {
  id: string;
  label?: string;
}

export interface GsBridge {
  devices?: () => Promise<GsBridgeDevice[]>;
  /** Read the binary AUDB `GameData.db` off the device. */
  gardenPull?: (serial: string) => Promise<{ b64: string; file: string; size?: number }>;
  /** Write it back and relaunch the game. */
  gardenPush?: (
    serial: string,
    b64: string,
    options?: Record<string, unknown>,
  ) => Promise<{ ok?: boolean; size?: number; file?: string; paths?: Record<string, string> }>;
  /** Save path the device is using, for the sidebar readout. */
  gardenPath?: (serial: string) => Promise<{ path?: string; package?: string }>;
  /** Read the friend roster (id + name) out of the running game's memory. */
  gardenFriends?: (serial: string) => Promise<{
    friends?: Array<{ id?: string; name?: string }>;
    scannedMB?: number;
    hint?: string;
  }>;
  /** Tap the middle of the game screen (clears reward modals). */
  gardenTap?: (serial: string, taps?: number) => Promise<{ ok?: boolean; taps?: number }>;
  /** Copy the whole save folder to this PC. */
  gardenBackup?: (serial: string) => Promise<{ ok?: boolean; path: string; count: number }>;
  /** Back up, reset the device identity, delete the save, relaunch. */
  gardenNewAccount?: (serial: string) => Promise<{
    ok?: boolean;
    backup: string;
    files: number;
    androidId?: string;
  }>;
  /** Put a backup folder back on the device and relaunch. */
  gardenRestoreBackup?: (serial: string, path: string) => Promise<{ ok?: boolean; restored: string[] }>;
}

export interface GsPulled {
  b64: string;
  file: string;
  size: number;
  serial: string;
}

export interface GsPushed {
  size: number;
  file: string;
  serial: string;
}

export function gsBridge(): GsBridge | undefined {
  return (window as unknown as { iggNative?: GsBridge }).iggNative;
}

/** Turn a transport-level failure into something the sidebar can show. */
export function gsTransportError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);
  if (/ENOENT|spawn .*adb|adb\.exe/i.test(raw)) {
    return new Error(
      "ADB was not found on this computer. Install Android platform-tools (adb) or update Garden Studio, then press Refresh.",
    );
  }
  if (!/emulator|adb|device|gardenscapes|root|save/i.test(raw)) {
    return new Error(raw || "Device connection failed.");
  }
  return e instanceof Error ? e : new Error(raw);
}

/**
 * Pick the serial to talk to: the one the user typed when it is really
 * attached, otherwise the first live device. Emulators move ports between
 * restarts (MEmu hands out 21503, 21513, …), so a hardcoded serial is what
 * made a running emulator look absent.
 */
export async function gsResolveSerial(preferred?: string): Promise<string> {
  const bridge = gsBridge();
  const want = (preferred ?? "").trim();
  if (!bridge?.devices) return want;
  let list: GsBridgeDevice[] = [];
  try {
    list = await bridge.devices();
  } catch {
    list = [];
  }
  const ids = (list ?? []).map((d) => d?.id).filter((x): x is string => Boolean(x));
  if (want && ids.includes(want)) return want;
  if (ids.length > 0) return ids[0];
  // Nothing attached. Fall back to the typed serial only when the caller gave
  // one, so an explicit target is still attempted rather than silently dropped.
  return want;
}

/** Every attached device, for the refresh button. Empty when ADB is absent. */
export async function gsListDevices(): Promise<GsBridgeDevice[]> {
  const bridge = gsBridge();
  if (!bridge?.devices) return [];
  try {
    const list = await bridge.devices();
    return (list ?? []).filter((d) => d && d.id);
  } catch {
    return [];
  }
}

export async function gsPullFromDevice(preferred?: string): Promise<GsPulled> {
  const bridge = gsBridge();
  try {
    if (bridge?.gardenPull) {
      const serial = await gsResolveSerial(preferred);
      if (!serial) {
        throw new Error(
          "No emulator connected. Start your emulator, wait for it to load, then press Refresh.",
        );
      }
      const got = await bridge.gardenPull(serial);
      return {
        b64: got.b64,
        file: got.file || "GameData.db",
        size: got.size ?? Math.floor((got.b64.length * 3) / 4),
        serial,
      };
    }
    if (bridge) {
      // The EXE is present but too old to drive Gardenscapes itself.
      throw new Error(
        "This build of Garden Studio cannot reach the emulator yet — use Help → Update to get the latest version.",
      );
    }
    const got = (await gsPullDevice({ data: { serial: preferred || undefined } })) as {
      b64: string;
      file?: string;
      size?: number;
    };
    return {
      b64: got.b64,
      file: got.file || "GameData.db",
      size: got.size ?? Math.floor((got.b64.length * 3) / 4),
      serial: preferred || "",
    };
  } catch (e) {
    throw gsTransportError(e);
  }
}

export async function gsPushToDevice(
  b64: string,
  preferred?: string,
): Promise<GsPushed> {
  const bridge = gsBridge();
  try {
    if (bridge?.gardenPush) {
      const serial = await gsResolveSerial(preferred);
      if (!serial) {
        throw new Error(
          "No emulator connected. Start your emulator, wait for it to load, then press Refresh.",
        );
      }
      const res = await bridge.gardenPush(serial, b64, { restart: true });
      return {
        size: res?.size ?? Math.floor((b64.length * 3) / 4),
        file: res?.file || "GameData.db",
        serial,
      };
    }
    if (bridge) {
      throw new Error(
        "This build of Garden Studio cannot reach the emulator yet — use Help → Update to get the latest version.",
      );
    }
    const res = (await gsPushDevice({ data: { b64, serial: preferred || undefined } })) as {
      size?: number;
      file?: string;
    };
    // The server-side push force-stops the game; relaunch it so its sync reads
    // the new save. The EXE bridge does this inside gardenPush({restart:true}).
    try {
      await gsLaunchGame({ data: { serial: preferred || undefined } });
    } catch {
      /* the user can start the game manually */
    }
    return {
      size: res?.size ?? Math.floor((b64.length * 3) / 4),
      file: res?.file || "GameData.db",
      serial: preferred || "",
    };
  } catch (e) {
    throw gsTransportError(e);
  }
}

/** Save path the device is using, or "" when the bridge cannot answer. */
export async function gsDeviceSavePath(serial?: string): Promise<string> {
  const bridge = gsBridge();
  if (!bridge?.gardenPath || !serial) return "";
  try {
    const r = await bridge.gardenPath(serial);
    return r?.path ?? "";
  } catch {
    return "";
  }
}

export interface GsScannedFriend {
  id: string;
  name: string;
}

/**
 * Tap the middle of the game screen — the EXE bridge taps its own emulator;
 * the plain-browser path asks the server (local `npm start` only). Used after
 * a send's restart to clear "Tap to Open/Claim" modals that hold the save.
 */
export async function gsTapFromDevice(
  preferred?: string,
  taps = 3,
): Promise<{ ok: boolean; taps: number }> {
  const bridge = gsBridge();
  try {
    if (bridge?.gardenTap) {
      const serial = await gsResolveSerial(preferred);
      if (!serial) return { ok: false, taps: 0 };
      const r = await bridge.gardenTap(serial, taps);
      return { ok: Boolean(r?.ok), taps: r?.taps ?? 0 };
    }
    const r = (await gsTapGame({
      data: { serial: preferred || undefined, taps },
    })) as { ok?: boolean; taps?: number };
    return { ok: Boolean(r?.ok), taps: r?.taps ?? 0 };
  } catch (e) {
    throw gsTransportError(e);
  }
}

/**
 * Friend roster (id + name) from the running game's memory.
 *
 * The EXE bridge does the scan locally — its ADB sits next to the emulator.
 * The plain-browser path asks the server, which only works when `npm start`
 * runs on the emulator's machine; the Render host has no device, which is
 * exactly why the EXE (or that local server) is the way in.
 */
export async function gsScanFriendsFromDevice(
  token: string,
  preferred?: string,
): Promise<{ friends: GsScannedFriend[]; scannedMB: number; hint: string }> {
  const bridge = gsBridge();
  try {
    if (bridge?.gardenFriends) {
      const serial = await gsResolveSerial(preferred);
      if (!serial) {
        throw new Error(
          "No emulator connected. Start your emulator, wait for it to load, then press Refresh.",
        );
      }
      const r = await bridge.gardenFriends(serial);
      const friends = (r?.friends ?? [])
        .filter((f): f is { id: string; name?: string } => typeof f?.id === "string" && f.id !== "")
        .map((f) => ({ id: f.id, name: typeof f.name === "string" ? f.name : "" }));
      return { friends, scannedMB: r?.scannedMB ?? 0, hint: typeof (r as { hint?: string })?.hint === "string" ? (r as { hint?: string }).hint ?? "" : "" };
    }
    if (bridge) {
      throw new Error(
        "This build of Garden Studio cannot scan friends yet — use Help → Update to get the latest version.",
      );
    }
    const r = (await gsScanDeviceFriends({
      data: { token, serial: preferred || undefined },
    })) as { friends?: Array<{ id: string; name?: string }>; scannedMB?: number; hint?: string };
    const friends = (r?.friends ?? []).map((f) => ({ id: f.id, name: f.name ?? "" }));
    return { friends, scannedMB: r?.scannedMB ?? 0, hint: r?.hint ?? "" };
  } catch (e) {
    throw gsTransportError(e);
  }
}

// --- new account / backups ------------------------------------------------

export interface GsBackupResult {
  path: string;
  count: number;
}

function requireBridge() {
  const bridge = gsBridge();
  if (!bridge) {
    throw new Error(
      "New account needs the Garden Studio desktop app — it copies and deletes files on your PC.",
    );
  }
  return bridge;
}

/** Copy the save folder to this PC (no device changes). */
export async function gsBackupDevice(preferred?: string): Promise<GsBackupResult> {
  const bridge = requireBridge();
  if (!bridge.gardenBackup) {
    throw new Error("This build of Garden Studio cannot back up yet — update the app.");
  }
  const serial = await gsResolveSerial(preferred);
  if (!serial) throw new Error("No emulator connected. Start it, then press Refresh.");
  const res = await bridge.gardenBackup(serial);
  return { path: res.path, count: res.count };
}

/** Back up, reset the device identity, delete the save, relaunch. */
export async function gsNewAccountDevice(preferred?: string): Promise<GsBackupResult & { androidId: string }> {
  const bridge = requireBridge();
  if (!bridge.gardenNewAccount) {
    throw new Error("This build of Garden Studio cannot create a new account yet — update the app.");
  }
  const serial = await gsResolveSerial(preferred);
  if (!serial) throw new Error("No emulator connected. Start it, then press Refresh.");
  const res = await bridge.gardenNewAccount(serial);
  return { path: res.backup, count: res.files, androidId: res.androidId ?? "" };
}

/** Restore a backup folder and relaunch. */
export async function gsRestoreDeviceBackup(path: string, preferred?: string): Promise<number> {
  const bridge = requireBridge();
  if (!bridge.gardenRestoreBackup) {
    throw new Error("This build of Garden Studio cannot restore yet — update the app.");
  }
  const serial = await gsResolveSerial(preferred);
  if (!serial) throw new Error("No emulator connected. Start it, then press Refresh.");
  const res = await bridge.gardenRestoreBackup(serial, path);
  return res.restored?.length ?? 0;
}
