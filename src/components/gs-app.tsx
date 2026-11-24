import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isDeviceId, mintDeviceId, normalizeDeviceId } from "@/lib/device-id";
import {
  gsConnect,
  gsGetRelease,
  gsPush,
  gsRestore,
  gsSnapshot,
  verifyLicense,
} from "@/lib/gs-api";
import {
  gsDeviceSavePath,
  gsListDevices,
  gsPullFromDevice,
  gsPushToDevice,
  gsResolveSerial,
} from "@/lib/gardenscapes/transport";
import {
  GsCtx,
  GS_OVERFLOW_TABS,
  GS_PRIMARY_TABS,
  GS_TAB_ICON,
  GS_TAB_LABEL,
  type GsCtxValue,
  type GsEditResult,
  type GsLicense,
  type GsSnapshot,
  type GsTab,
} from "./gs-ctx";
import { GsIcon, downloadB64, fileToB64 } from "./gs-ui";
import { GsBoosters, GsDashboard, GsNewAccount, GsPlayer, GsStatistics } from "./gs-panels-a";
import { GsCards, GsDecor, GsSeasons, GsSendCards } from "./gs-panels-b";
import { GsAvatars, GsBadges, GsClone, GsFrames, GsPets, GsStyles, GsTitles } from "./gs-panels-c";

// ---------------------------------------------------------------------------
// Gardenscapes editor — login scene + application shell.
//
// Structure: header / sidebar / two-row tab strip / panel host. Every helper
// here is file-local so the shell can be reused without the panel components
// reaching into module scope.
// ---------------------------------------------------------------------------

const LS_KEY = "gs-garden-key";
const LS_HWID = "gs-garden-hwid";
const LS_PALETTE = "gs-garden-palette";
const LS_MODE = "gs-garden-mode";
// No hardcoded serial: emulators hand out a different loopback port on every
// restart (MEmu has been seen on 21503 *and* 21513), so the real target is
// discovered through the ADB bridge and this stays empty until it is known.
const DEFAULT_SERIAL = "";

// --- sidebar log colouring --------------------------------------------------
// The server ships the log as plain strings, so the *meaning* is decided here
// rather than in seventeen `log.push` call sites: one classifier, one place to
// tune. Order matters — a refusal must read red even when it also contains a
// word a success line would carry.
type GsLogKind = "ok" | "bad" | "warn" | "info";

const GS_LOG_BAD =
  /\b(error|errors|failed|failure|refused|refusal|rejected|denied|invalid|blocked|timeout|timed out|not found|no data|unsupported|unavailable|cannot|can't|wrong format|disconnected)\b/i;
const GS_LOG_WARN =
  /(no pending|nothing to change|no change|unchanged|unmeasured|no save|no cards|no rows|nothing was|skipped|warning|not possible|empty|partly|incomplete)/i;
const GS_LOG_OK =
  /(changed|unlocked|granted|restored|accepted|earned|reordered|loaded|wearing|worn|marked|streak|ready|saved|pushed|applied|done|complete|->|\b(?:on|off)\b|collected|cleared)/i;

function gsLogKind(line: string): GsLogKind {
  if (GS_LOG_BAD.test(line)) return "bad";
  if (GS_LOG_WARN.test(line)) return "warn";
  if (GS_LOG_OK.test(line)) return "ok";
  return "info";
}

/** The five light-theme color combinations (see styles.css `.gs-palette-*`). */
const GS_PALETTES: { id: string; label: string; swatch: string }[] = [
  { id: "garden", label: "Garden", swatch: "#2f9e6f" },
  { id: "rose", label: "Rose", swatch: "#e0527f" },
  { id: "ocean", label: "Ocean", swatch: "#2f7fd4" },
  { id: "sunrise", label: "Sunrise", swatch: "#e08a2f" },
  { id: "violet", label: "Violet", swatch: "#7c5cd6" },
];

/** The palette dot row, shared by the login scene and the app header. */
function PaletteSwitch({
  palette,
  onPick,
}: {
  palette: string;
  onPick: (p: string) => void;
}) {
  return (
    <div className="gs-palette-switch" role="group" aria-label="Color palette">
      {GS_PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.label}
          aria-label={`${p.label} palette`}
          aria-pressed={palette === p.id}
          style={{ background: p.swatch }}
          onClick={() => onPick(p.id)}
        />
      ))}
    </div>
  );
}

/**
 * Light / dark switch. It is a two-state pill rather than a bare icon so the
 * current mode is legible at a glance, and the sliding knob is what carries the
 * gold-on-green premium treatment shared with the ENABLE button.
 */
function ThemeSwitch({ dark, onPick }: { dark: boolean; onPick: (d: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="gs-theme-switch"
      onClick={() => onPick(!dark)}
    >
      <span className="gs-theme-switch-track" aria-hidden>
        <span className="gs-theme-switch-thumb">
          <GsIcon name={dark ? "moon" : "sun"} className="size-3.5" />
        </span>
      </span>
      <span className="gs-theme-switch-label">{dark ? "Dark" : "Light"}</span>
    </button>
  );
}

interface NativeBridge {
  deviceId?: () => Promise<string>;
  saveKey?: (k: string) => Promise<void>;
  loadSavedKey?: () => Promise<string>;
  clearSavedKey?: () => Promise<void>;
  version?: () => Promise<string>;
  installUpdate?: (release: {
    version: string;
    notes?: string;
    downloadUrl: string;
    sha256: string;
  }) => Promise<{ ok: boolean; version?: string; reason?: string }>;
}

function nativeBridge(): NativeBridge | undefined {
  return (window as unknown as { iggNative?: NativeBridge }).iggNative;
}

/**
 * Wait for the shell to install `window.iggNative`.
 *
 * The alias is installed only after navigation completes (its own poller runs
 * for up to 5 s), so a one-shot read returns nothing on a cold start. Used
 * wherever the bridge is required rather than merely nice to have — saving
 * the key among them, because falling back to localStorage there loses it on
 * the next EXE launch (private mode wipes storage).
 */
async function waitForNativeBridge(budgetMs: number): Promise<NativeBridge | undefined> {
  const existing = nativeBridge();
  if (existing) return existing;
  return new Promise((resolve) => {
    const finish = () => {
      window.clearInterval(tick);
      window.removeEventListener("igg-native-ready", onReady);
      resolve(nativeBridge());
    };
    const onReady = () => finish();
    const deadline = Date.now() + budgetMs;
    const tick = window.setInterval(() => {
      if (nativeBridge() || Date.now() >= deadline) finish();
    }, 50);
    window.addEventListener("igg-native-ready", onReady);
  });
}

// The WebView2 runtime injects window.chrome.webview before any page script
// runs, so it is the only signal that answers "are we inside the EXE?"
// synchronously at first paint.
function inWebView2(): boolean {
  try {
    return Boolean((window as unknown as { chrome?: { webview?: unknown } }).chrome?.webview);
  } catch {
    return false;
  }
}

function formatRemain(ms: number, lifetime: boolean): string {
  if (lifetime) return "Lifetime";
  if (ms <= 0) return "Expired";
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function Mark({ className }: { className?: string }) {
  return (
    <img
      src="/gs-hero.jpg"
      className={cn("shrink-0 rounded-md object-cover", className)}
      alt=""
      aria-hidden
      onError={(e) => {
        e.currentTarget.src = "/logo.jpeg";
      }}
    />
  );
}

type View = "login" | "app";

/**
 * A six-armed ice crystal. Six rotations of one arm with side branches gives
 * the faceted star the reference art shows, and it stays crisp at any size.
 */
function Snowflake({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}>
          <line x1="12" y1="12" x2="12" y2="1.7" />
          <line x1="12" y1="5.1" x2="9.2" y2="2.9" />
          <line x1="12" y1="5.1" x2="14.8" y2="2.9" />
          <line x1="12" y1="8.3" x2="9" y2="6.1" />
          <line x1="12" y1="8.3" x2="15" y2="6.1" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Deterministic snow field. A seeded generator (not `Math.random`) keeps the
 * server and client render identical, so hydration never mismatches.
 */
const SNOW = Array.from({ length: 46 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    left: r(1) * 100,
    size: 9 + r(2) * 13,
    dur: 12 + r(3) * 16,
    delay: -r(4) * 24,
    drift: (r(5) - 0.5) * 190,
    opacity: 0.35 + r(6) * 0.6,
    blur: r(7) > 0.78 ? 1.4 : 0,
    spin: 140 + r(8) * 260,
  };
});

export function GsApp() {
  // --- license / session -------------------------------------------------
  const [view, setView] = useState<View>("login");
  const [key, setKey] = useState("");
  const [token, setToken] = useState("");
  const [license, setLicense] = useState<GsLicense | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const [snap, setSnap] = useState<GsSnapshot | null>(null);
  const [tab, setTab] = useState<GsTab>("dashboard");
  const [tabReady, setTabReady] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- device transport --------------------------------------------------
  const [serial, setSerial] = useState(DEFAULT_SERIAL);
  const [devicePath, setDevicePath] = useState("");
  const [saveName, setSaveName] = useState("");

  // Discover the live emulator on boot. Serials move between restarts (MEmu
  // has answered on 21503 and on 21513), so a fixed target is what made
  // "Pull from device" fail while the game was running in front of the user.
  useEffect(() => {
    let stop = false;
    void (async () => {
      const found = await gsListDevices();
      if (stop || found.length === 0) return;
      const ids = found.map((d) => d.id);
      setSerial((cur) => (cur && ids.includes(cur) ? cur : ids[0]));
    })();
    return () => {
      stop = true;
    };
  }, []);

  // The path readout follows whichever serial is selected.
  useEffect(() => {
    let stop = false;
    if (!serial) {
      setDevicePath("");
      return;
    }
    void (async () => {
      const p = await gsDeviceSavePath(serial);
      if (!stop) setDevicePath(p);
    })();
    return () => {
      stop = true;
    };
  }, [serial]);

  // Refresh button: re-list the devices and re-read the on-device save path.
  const refreshDevice = useCallback(async () => {
    const found = await gsListDevices();
    const ids = found.map((d) => d.id);
    const next = (serial && ids.includes(serial) ? serial : ids[0]) || "";
    setSerial(next);
    setDevicePath(await gsDeviceSavePath(next || undefined));
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial]);

  // --- palette (one of five light-theme color combinations) --------------
  const [palette, setPalette] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_PALETTE) || "garden";
    } catch {
      return "garden";
    }
  });

  const pickPalette = (p: string) => {
    setPalette(p);
    try {
      localStorage.setItem(LS_PALETTE, p);
    } catch {
      /* private mode */
    }
  };

  // --- appearance: light / dark ------------------------------------------
  // Light stays the default so the shipped tool keeps the garden theme; dark is
  // opt-in per machine and rides the same node as `.gs-theme`.
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_MODE) === "dark";
    } catch {
      return false;
    }
  });

  const pickDark = (d: boolean) => {
    setDark(d);
    try {
      localStorage.setItem(LS_MODE, d ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };

  const modeClass = dark ? "gs-dark" : "gs-light";

  // --- verb wrappers -----------------------------------------------------

  const act = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const note = useCallback((res: GsEditResult | undefined, label: string) => {
    if (!res) return;
    if (res.changed.length) toast.success(`${label} · ${res.changed.length} changed`);
    else if (res.missing.length) toast.warning(`${label} · ${res.missing.length} not found`);
    else toast.info(`${label} · nothing to change`);
    if (res.missing.length) {
      toast.message(`${label}: ${res.missing.slice(0, 4).join(", ")}`);
    }
  }, []);

  const reload = useCallback(async () => {
    if (!token) return;
    const id = snap?.id;
    if (!id) return;
    const s = await act(() => gsSnapshot({ data: { token, sessionId: id } }));
    if (s) setSnap(s as GsSnapshot);
  }, [token, snap?.id, act]);

  const go = useCallback((t: GsTab) => setTab(t), []);

  const ctx = useMemo<GsCtxValue>(
    () => ({ token, sessionId: snap?.id ?? null, snap, license, busy, serial, act, note, reload, go }),
    [token, snap, license, busy, serial, act, note, reload, go],
  );

  // --- boot: device id, saved key ---------------------------------------

  useEffect(() => {
    let stop = false;

    // Boot order, most authoritative first: `?did=` on the URL, then the
    // bridge, then localStorage, then a fresh mint. Inside the EXE minting is
    // forbidden — pywebview runs WebView2 with private_mode=True, so storage
    // is empty on every launch and an allowed mint would win every launch.
    const inExe = inWebView2();

    const urlDeviceId = (() => {
      try {
        const v = new URLSearchParams(window.location.search).get("did");
        return v && isDeviceId(v) ? normalizeDeviceId(v) : null;
      } catch {
        return null;
      }
    })();

    const readStoredId = (): string | null => {
      try {
        const hwid = localStorage.getItem(LS_HWID);
        return hwid && isDeviceId(hwid) ? normalizeDeviceId(hwid) : null;
      } catch {
        return null;
      }
    };

    const mintNewId = (): string => {
      const fresh = mintDeviceId();
      try {
        localStorage.setItem(LS_HWID, fresh);
      } catch {
        /* ignore */
      }
      return fresh;
    };

    if (urlDeviceId) setDeviceId(urlDeviceId);
    else if (inExe) setDeviceId(readStoredId() ?? "");
    else setDeviceId(readStoredId() ?? mintNewId());

    const bridgeBudgetMs = inExe && !urlDeviceId ? 20_000 : 1_500;
    // The saved-key read always needs the FULL bridge budget inside the EXE.
    // bridgeBudgetMs is shortened when the id already arrived on the URL —
    // which it always does, because the shell appends ?did= — but that short
    // budget exists only for reading the id. The shell's alias poller runs up
    // to 5 s, so a 1.5 s wait here would give up before the bridge appeared
    // and leave the login field empty on a cold start.
    const keyBridgeBudgetMs = inExe ? 20_000 : 1_500;

    void (async () => {
      const readNative = async (): Promise<string | null> => {
        try {
          const fn = nativeBridge()?.deviceId;
          if (typeof fn !== "function") return null;
          const nid = await fn();
          return nid && isDeviceId(nid) ? normalizeDeviceId(nid) : null;
        } catch {
          return null;
        }
      };
      let nid = await readNative();
      if (!nid) {
        nid = await new Promise<string | null>((resolve) => {
          let settled = false;
          let waited = 0;
          const done = (v: string | null) => {
            if (settled) return;
            settled = true;
            window.clearInterval(tick);
            window.removeEventListener("igg-native-ready", onEvent);
            resolve(v);
          };
          const probe = (): boolean => {
            const bridge = nativeBridge();
            if (!bridge) return false;
            if (typeof bridge.deviceId !== "function") {
              done(null);
              return true;
            }
            void (async () => {
              try {
                const v = await bridge.deviceId!();
                done(v && isDeviceId(v) ? normalizeDeviceId(v) : null);
              } catch {
                done(null);
              }
            })();
            return true;
          };
          const onEvent = () => probe();
          const tick = window.setInterval(() => {
            waited += 1;
            if (probe() || waited * 50 >= bridgeBudgetMs) done(null);
          }, 50);
          window.addEventListener("igg-native-ready", onEvent);
          probe();
        });
      }
      if (!stop && nid) {
        try {
          localStorage.setItem(LS_HWID, nid);
        } catch {
          /* ignore */
        }
        setDeviceId(nid);
      }
    })();

    // Resume a previous session's key so a reload does not demand it again.
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setKey(saved);
    } catch {
      /* ignore */
    }

    // Inside the EXE localStorage is wiped on every launch (private mode), so
    // the file-backed key the shell keeps is the real "remember me" store.
    //
    // The shell installs window.iggNative only AFTER navigation completes —
    // its own alias poller runs for up to 5 s — so a one-shot read here saw
    // nothing on every cold start and the login field came up empty, forcing
    // the key to be retyped each launch. Wait for the bridge first (the
    // ready event, with a poll as fallback), bounded by the same budget the
    // device id read uses, then take the saved key.
    void (async () => {
      const readSaved = async (): Promise<string | null> => {
        try {
          const fn = nativeBridge()?.loadSavedKey;
          if (typeof fn !== "function") return null;
          const saved = await fn();
          return typeof saved === "string" && saved.trim().length >= 4 ? saved.trim() : null;
        } catch {
          return null;
        }
      };
      try {
        if (!nativeBridge()) {
          const deadline = Date.now() + keyBridgeBudgetMs;
          await new Promise<void>((resolve) => {
            const cleanup = () => {
              window.clearInterval(tick);
              window.removeEventListener("igg-native-ready", onReady);
              resolve();
            };
            const onReady = () => cleanup();
            const tick = window.setInterval(() => {
              // Only the deadline ends the wait without the bridge: bailing
              // out the moment a read starts would abort it every time.
              if (nativeBridge() || Date.now() >= deadline) cleanup();
            }, 50);
            window.addEventListener("igg-native-ready", onReady);
          });
        }
        const saved = await readSaved();
        if (!stop && saved) {
          setKey(saved);
        }
      } catch {
        /* ignore */
      }
    })();

    setTabReady(true);
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!license || license.lifetime) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [license]);

  // --- client auto-update (EXE only) --------------------------------------
  // Same contract as the release poller: poll, compare against the EXE's
  // own version, install once per version. A release with no download URL and
  // SHA-256 (env vars unset) never shows a banner and never installs.
  const [freshRelease, setFreshRelease] = useState<{
    version: string;
    notes: string;
    downloadUrl: string;
    sha256: string;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    const compareVersions = (a: string, b: string) => {
      const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
      const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
      }
      return 0;
    };
    const tick = async () => {
      try {
        const native = nativeBridge();
        if (!native?.version) return; // browser tab — nothing to update
        const current = await native.version();
        const r = await gsGetRelease({ data: { token } });
        if (stop || !current) return;
        if (!r.downloadUrl || !r.sha256) return;
        if (compareVersions(r.version, current) <= 0) return;
        const marker = `gs-auto-update-${r.version}`;
        try {
          if (localStorage.getItem(marker) === "done") return;
        } catch {
          /* ignore */
        }
        setFreshRelease(r);
        if (native.installUpdate) {
          try {
            const result = await native.installUpdate(r);
            if (result.ok) {
              try {
                localStorage.setItem(marker, "done");
              } catch {
                /* ignore */
              }
            }
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Update failed");
          }
        }
      } catch {
        /* keep the editor usable if the poll misses once */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 15 * 60 * 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [token]);

  const remainingMs = !license || license.lifetime ? 0 : Math.max(0, license.expiresAt - nowTick);

  // --- connect / save ----------------------------------------------------

  const connectWith = async (saveB64: string, source: string) => {
    const s = await act(() => gsConnect({ data: { token, device: source, saveB64 } }));
    if (s) {
      setSnap(s as GsSnapshot);
      return true;
    }
    return false;
  };

  const pullAndConnect = async () => {
    if (!token) return;
    const got = await act(() => gsPullFromDevice(serial || undefined));
    if (!got) return;
    if (got.serial && got.serial !== serial) setSerial(got.serial);
    const ok = await connectWith(got.b64, got.file);
    if (ok) {
      setSaveName(got.file);
      toast.success(`Save pulled · ${got.size} bytes`);
    }
  };

  const saveToDevice = async () => {
    if (!snap) return;
    const r = await act(() => gsPush({ data: { token, sessionId: snap.id } }));
    if (!r) return;
    const b64 = (r as { b64: string }).b64;
    downloadB64("GameData.db", b64);
    const pushed = await act(() => gsPushToDevice(b64, serial || undefined));
    if (pushed) {
      if (pushed.serial && pushed.serial !== serial) setSerial(pushed.serial);
      toast.success(`Pushed ${pushed.size} bytes to the device`);
    } else toast.info("Downloaded — device push skipped");
    await reload();
  };

  const restoreOriginal = async () => {
    if (!snap) return;
    const r = await act(() => gsRestore({ data: { token, sessionId: snap.id } }));
    if (r) {
      setSnap(r as GsSnapshot);
      toast.success("Rolled back to the bytes this session loaded with");
    }
  };

  const uploadSave = async (file: File) => {
    if (!token) return;
    const b64 = await fileToB64(file).catch((e: Error) => {
      toast.error(e.message);
      return "";
    });
    if (!b64) return;
    const ok = await connectWith(b64, file.name);
    if (ok) {
      setSaveName(file.name);
      toast.success(`Loaded ${file.name}`);
    }
  };

  // --- unlock ------------------------------------------------------------

  const unlock = async (providedKey?: string) => {
    const candidate = (providedKey ?? key).trim();
    setLoginErr("");
    if (candidate.length < 4) {
      setLoginErr("Enter your license key (at least 4 characters).");
      return;
    }
    // Never verify against an empty id: the server binds an unbound key to
    // whatever it is handed, so "" would bind the key to nothing and lock the
    // real machine out on its next launch.
    if (!deviceId) {
      setLoginErr("Device id is still resolving — try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      const r = await verifyLicense({ data: { key: candidate, deviceId } });
      setKey(candidate);
      setToken(r.token);
      setDeviceId(r.deviceId);
      setLicense(r.license as GsLicense);
      try {
        // Always remember the key. There is no opt-out any more: a key that
        // was not saved had to be retyped on every launch, which read as a
        // broken login. Wait for the bridge rather than falling back to
        // localStorage — inside the EXE storage is wiped on every launch, so
        // a key saved there is gone by the next one.
        const native = await waitForNativeBridge(inWebView2() ? 20_000 : 1_500);
        if (native?.saveKey) {
          const res = (await native.saveKey(candidate)) as { ok?: boolean } | void;
          if (res && typeof res === "object" && res.ok === false) {
            toast.error("Could not save the key on this device — you will be asked for it again");
          }
        } else {
          localStorage.setItem(LS_KEY, candidate);
        }
      } catch {
        /* ignore */
      }
      setView("app");
      toast.success("License verified");

      // Pull the device save straight away so the dashboard has data.
      const got = await act(() => gsPullFromDevice(serial || undefined));
      if (got) {
        if (got.serial && got.serial !== serial) setSerial(got.serial);
        const s = await act(() =>
          gsConnect({ data: { token: r.token, device: got.file, saveB64: got.b64 } }),
        );
        if (s) {
          setSnap(s as GsSnapshot);
          setSaveName(got.file);
          toast.success("Save loaded from device");
        }
      } else {
        toast.message("No device save found — load a GameData.db file from Backups.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unlock failed";
      if (/invalid key|key revoked|key expired|locked to another device|device not on this key/i.test(message)) {
        try {
          const native = nativeBridge();
          if (native?.clearSavedKey) await native.clearSavedKey();
          else localStorage.removeItem(LS_KEY);
        } catch {
          /* ignore */
        }
      }
      setLoginErr(message);
    } finally {
      setBusy(false);
    }
  };

  const sessionCount = snap ? 1 : 0;

  // Sign straight in when the shell handed over a saved key.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current) return;
    if (view !== "login" || license || busy) return;
    if (key.trim().length < 4 || !isDeviceId(deviceId)) return;
    autoTried.current = true;
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, license, busy, key, deviceId]);

  // --- login scene -------------------------------------------------------

  if (view === "login") {
    return (
      <main className={`login-scene gs-login gs-theme ${modeClass} gs-palette-${palette} relative min-h-dvh px-4 py-8 sm:px-8`}>
        <div className="login-bg" aria-hidden="true">
          <span className="login-aurora login-aurora--1" />
          <span className="login-aurora login-aurora--2" />
          <span className="login-grid3d" />
          <span className="login-orb login-orb--a" />
          <span className="login-orb login-orb--b" />
          <span className="login-orb login-orb--c" />
          <span className="login-shine" />
          <span className="login-crystal login-crystal--1" />
          <span className="login-crystal login-crystal--2" />
          <span className="login-crystal login-crystal--3" />
          <span className="login-frost" />
          <span className="login-snow">
            {SNOW.map((f, i) => (
              <i
                key={i}
                className="login-flake"
                style={{
                  left: `${f.left}%`,
                  width: f.size,
                  height: f.size,
                  opacity: f.opacity,
                  animationDuration: `${f.dur}s`,
                  animationDelay: `${f.delay}s`,
                  filter: f.blur ? `blur(${f.blur}px)` : undefined,
                  "--drift": `${f.drift}px`,
                  "--spin": `${f.spin}deg`,
                } as CSSProperties}
              >
                <Snowflake size={f.size} />
              </i>
            ))}
          </span>
        </div>
        <div className="login-grid mx-auto min-h-[calc(100dvh-8.5rem)] w-full max-w-6xl items-center gap-8">
          <section className="login-visual gate-in" aria-label="Garden Studio">
            <div className="gs-login-wordmark">
              <span className="gs-lw-top" role="img" aria-label="Gardenscapes">
                {"GARDENSCAPES".split("").map((ch, i) => (
                  <span
                    key={i}
                    className={`gs-lw-ch gs-lw-ch--${i % 4}`}
                    style={{ animationDelay: `${i * 0.07}s` }}
                    aria-hidden="true"
                  >
                    {ch}
                  </span>
                ))}
              </span>
              <span className="gs-lw-tool" aria-hidden="true">
                Tool
              </span>
            </div>
            <div className="gs-login-hero">
              <img src="/gs-hero.jpg" alt="" className="gs-login-hero-img" draggable={false} />
            </div>
          </section>

          <section className="login-card w-full p-6 sm:p-8" aria-labelledby="login-heading">
            <header className="login-card-heading gate-in flex items-start gap-3">
              <span className="login-card-mark"><Mark className="size-7" /></span>
              <div className="min-w-0">
                <p className="kicker">Garden Studio</p>
                <h1 id="login-heading" className="mt-1 font-display text-xl font-semibold tracking-tight">
                  Unlock the editor
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Your key is bound to this device id.
                </p>
              </div>
            </header>
            <div className="login-divider" />

            <div className="gate-in mt-5">
              <div className="login-label">
                <GsIcon name="device" />
                <span className="kicker">Device id</span>
              </div>
              <div className="device-id-card mt-2">
                <span className="device-id-icon"><GsIcon name="device" /></span>
                <div className="min-w-0 flex-1">
                  <span className="device-id-caption">Device id</span>
                  <code
                    className={cn(
                      "mt-1 block break-all font-mono text-xs leading-relaxed tabular-nums sm:text-sm",
                      deviceId ? "" : " device-id-pending",
                    )}
                  >
                    {deviceId || "resolving…"}
                  </code>
                </div>
                <button
                  type="button"
                  className="copy-button"
                  disabled={!deviceId}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(deviceId);
                    } catch {
                      /* clipboard unavailable */
                    }
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                  }}
                >
                  <GsIcon name={copied ? "check" : "copy"} className="size-4" />
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="gate-in mt-5">
              <div className="login-label">
                <GsIcon name="styles" />
                <span className="kicker">Palette</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <PaletteSwitch palette={palette} onPick={pickPalette} />
                <span className="text-xs text-muted">
                  {GS_PALETTES.find((p) => p.id === palette)?.label ?? "Garden"} theme
                </span>
              </div>
            </div>

            <div className="gate-in mt-5">
              <label className="login-label" htmlFor="gs-license">
                <GsIcon name="key" />
                <span className="kicker">License key</span>
              </label>
              <div className="field-shell mt-2">
                <GsIcon name="key" className="field-leading-icon" />
                <input
                  id="gs-license"
                  className="field login-field font-mono"
                  type="password"
                  autoComplete="off"
                  placeholder="XXXX-XXXX-XXXX"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void unlock();
                  }}
                />
              </div>
              {loginErr ? (
                <p className="login-error mt-3 flex items-start gap-2 px-3 py-2 text-sm text-err">
                  <GsIcon name="alert" />
                  <span>{loginErr}</span>
                </p>
              ) : null}
              <Button
                className="login-unlock mt-5 w-full"
                size="lg"
                disabled={busy || !deviceId}
                onClick={() => void unlock()}
              >
                <GsIcon name={busy ? "refresh" : "key"} className={cn("size-5", busy && "animate-spin")} />
                {busy ? "Unlocking…" : "Unlock"}
              </Button>
            </div>
          </section>
        </div>
        <footer className="login-footer gate-in">
          <span className="login-footer-rule" aria-hidden="true" />
          <p className="login-footer-credit">
            {"GARDEN STUDIO · "}
            <span className="login-brand-wordmark">GARDENSCAPES SAVE EDITOR</span>
          </p>
          <span className="login-footer-rule" aria-hidden="true" />
        </footer>
      </main>
    );
  }

  // --- application shell -------------------------------------------------

  return (
    <GsCtx.Provider value={ctx}>
      <div className={`app-root gs-theme ${modeClass} gs-palette-${palette} flex min-h-dvh flex-col`}>
        <header className="app-header sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <span className="header-logo"><Mark className="size-7" /></span>
          <p className="header-brand font-display font-semibold tracking-tight">
            Garden <span className="text-primary">Studio</span>
          </p>
          <div className="header-statuses ml-auto flex items-center gap-1">
            <ThemeSwitch dark={dark} onPick={pickDark} />
            <span className="hidden sm:inline-flex">
              <PaletteSwitch palette={palette} onPick={pickPalette} />
            </span>
            {license ? (
              <span className="status-chip status-chip--license inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-kicker font-semibold tracking-wide uppercase">
                <GsIcon name="key" className="size-3.5" />
                <span className="status-chip-label">License</span>
                <span>{formatRemain(remainingMs, license.lifetime)}</span>
              </span>
            ) : null}
            <span className="status-chip status-chip--online inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-kicker font-semibold tracking-wide uppercase">
              <span className="status-dot size-1.5 rounded-full" />
              <span>{snap ? "Online" : "No save"}</span>
            </span>
            <button
              type="button"
              className="header-action grid size-11 place-items-center rounded-md text-muted hover:text-fg"
              aria-label="Sign out"
              onClick={() => {
                try {
                  localStorage.removeItem(LS_KEY);
                } catch {
                  /* ignore */
                }
                void (async () => {
                  try {
                    const native = nativeBridge();
                    if (native?.clearSavedKey) await native.clearSavedKey();
                  } catch {
                    /* ignore */
                  }
                })();
                setKey("");
                setToken("");
                setLicense(null);
                setSnap(null);
                setView("login");
              }}
            >
              <GsIcon name="logout" className="size-4" />
            </button>
          </div>
        </header>

        {freshRelease ? (
          <div className="update-banner gs-update-banner flex shrink-0 items-center gap-3 px-4 py-2">
            <GsIcon name="star" className="size-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold text-primary">Update ready · v{freshRelease.version}</span>
              {freshRelease.notes ? <span className="hidden text-muted sm:inline"> · {freshRelease.notes}</span> : null}
            </p>
            <Button
              size="sm"
              className="primary-action"
              onClick={async () => {
                const native = nativeBridge();
                if (native?.installUpdate && freshRelease.downloadUrl && freshRelease.sha256) {
                  try {
                    await native.installUpdate(freshRelease);
                    return;
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Update failed");
                    return;
                  }
                }
                window.location.reload();
              }}
            >
              Update now
            </Button>
          </div>
        ) : null}

        <div className="console-shell app-workspace">
          <aside className="app-sidebar flex shrink-0 flex-col gap-4 rounded-lg p-4 lg:gap-5">
            <div className="sidebar-device-block">
              <p className="kicker mb-2">Device</p>
              <div className="device-selector-card">
                <span className="device-selector-icon"><GsIcon name="device" /></span>
                <div className="min-w-0 flex-1">
                  <span className="device-selector-caption">Emulator</span>
                  <input
                    className="device-selector-select font-mono"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    placeholder="auto-detect"
                    aria-label="ADB serial"
                  />
                  <span className={cn("device-selector-state", serial ? "device-selector-state--ready" : "")}>
                    {serial ? "target set" : "empty"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="icon-refresh device-refresh"
                  aria-label="Refresh device"
                  onClick={() => void refreshDevice()}
                >
                  <GsIcon name="refresh" className="size-4" />
                </Button>
              </div>

              {devicePath ? (
                <p className="gs-hint-line">
                  Save: <code>{devicePath}</code>
                </p>
              ) : null}

              <div className="sidebar-actions mt-3 flex flex-col gap-2">
                <Button className="primary-action w-full" disabled={busy || !token} onClick={() => void pullAndConnect()}>
                  <GsIcon name="device" className="size-5" />
                  Pull from device
                </Button>
                <Button
                  className="secondary-action w-full"
                  variant="outline"
                  disabled={busy || !snap}
                  onClick={() => void saveToDevice()}
                >
                  <GsIcon name="save" className="size-4" />
                  Save & push
                </Button>
                <Button variant="ghost" className="w-full" disabled={busy || !snap} onClick={() => void restoreOriginal()}>
                  <GsIcon name="reset" className="size-4" />
                  Restore original
                </Button>
                <label className="w-full">
                  <span className="sr-only">Load a save file</span>
                  <input
                    type="file"
                    accept=".db,.audb,.bin,*/*"
                    className="gs-file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadSave(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <p className="mt-2 hidden text-xs text-muted lg:block">
                {saveName ? `Loaded: ${saveName}` : "No save loaded"}
              </p>
              <p className="mt-1 hidden text-xs text-muted tabular-nums lg:block">
                {sessionCount ? `${snap?.tables ?? 0} tables · v${snap?.version || "?"}` : "—"}
              </p>
            </div>

            <div className="sidebar-log flex max-h-28 flex-col lg:max-h-none lg:min-h-28 lg:flex-1">
              <p className="kicker mb-2 flex items-center gap-1.5">
                <GsIcon name="terminal" className="size-3.5" /> Log
              </p>
              <div className="gs-log-body min-h-16 flex-1 overflow-auto rounded-md bg-input p-3 font-mono text-xs leading-relaxed">
                {(snap?.log?.length ? snap.log : ["ready"]).map((line, i) => {
                  const kind = gsLogKind(line);
                  return (
                    <p key={i} className={`gs-log-line gs-log-line--${kind}`}>
                      <span aria-hidden className="gs-log-dot" />
                      <span className="gs-log-text">{line}</span>
                    </p>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="app-main flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg shadow-hairline">
            <nav className="feature-tabs relative border-b border-border px-3 pt-3 pb-2">
              <span aria-hidden className={cn("tab-pill", tabReady && "ready")} />
              {[GS_PRIMARY_TABS, GS_OVERFLOW_TABS].map((row, ri) => (
                <div
                  key={ri}
                  className={cn(
                    "feature-tabs-row grid grid-cols-4 gap-1 sm:grid-cols-8",
                    ri === 1 && "feature-tabs-overflow mt-1 border-t border-border/60 pt-2",
                  )}
                >
                  {row.map((id) => {
                    const on = tab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        aria-current={on ? "page" : undefined}
                        aria-label={GS_TAB_LABEL[id]}
                        className={cn(
                          "feature-tab relative z-10 flex min-h-11 items-center justify-center gap-1 rounded-t-lg px-0.5 text-center text-xs font-semibold leading-tight transition-[color] duration-200 ease-smooth sm:text-sm",
                          on ? "feature-tab--active text-primary-fg" : "text-muted hover:text-fg",
                        )}
                      >
                        <span className="feature-tab-emoji gs-tab-icon" aria-hidden="true">
                          <GsIcon name={GS_TAB_ICON[id]} className="size-4" />
                        </span>
                        <span className="whitespace-nowrap">{GS_TAB_LABEL[id]}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="dashboard-content min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              {!snap && tab !== "clone" ? (
                <div className="panel-in grid min-h-64 place-items-center text-center">
                  <div>
                    <GsIcon name="device" className="empty-state-icon mx-auto size-8 text-muted" />
                    <p className="mt-3 text-sm text-muted">No save connected</p>
                    <p className="mt-1 text-xs text-muted">
                      Pull from the device, or load a GameData.db file.
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button size="sm" disabled={busy} onClick={() => void pullAndConnect()}>
                        <GsIcon name="device" className="size-4" /> Pull from device
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => go("newacct")}>
                        <GsIcon name="backups" className="size-4" /> Backups
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={tab} className="panel-in">
                  {tab === "dashboard" && <GsDashboard />}
                  {tab === "player" && <GsPlayer />}
                  {tab === "statistics" && <GsStatistics />}
                  {tab === "boosters" && <GsBoosters />}
                  {tab === "seasons" && <GsSeasons />}
                  {tab === "cards" && <GsCards />}
                  {tab === "send" && <GsSendCards />}
                  {tab === "decor" && <GsDecor />}
                  {tab === "avatars" && <GsAvatars />}
                  {tab === "frames" && <GsFrames />}
                  {tab === "styles" && <GsStyles />}
                  {tab === "badges" && <GsBadges />}
                  {tab === "titles" && <GsTitles />}
                  {tab === "pets" && <GsPets />}
                  {tab === "clone" && <GsClone />}
                  {tab === "newacct" && <GsNewAccount />}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </GsCtx.Provider>
  );
}
