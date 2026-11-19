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

import { gsPullDevice, gsPushDevice } from "@/lib/gs-api";

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
