import { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// Gardenscapes app context.
//
// One object carries everything every panel needs: the license token, the
// active session id, the current snapshot, a busy flag and the four verbs
// (`act`, `note`, `reload`, `go`). Panels never touch gs-api.ts directly
// without going through `act`, so every server call gets the same busy state
// and the same error toast instead of each panel re-implementing it.
// ---------------------------------------------------------------------------

/** Mirrors `snapshot()` in session.server.ts — the field is `id`, not sessionId. */
export interface GsSnapshot {
  id: string;
  device: string;
  tables: number;
  /** AUDB container version (numeric in the codec). */
  version: number;
  log: string[];
}

/** `publicSnap()` of a verified license (license.server.ts `LicenseSnap`). */
export interface GsLicense {
  plan: string;
  /** True for a key shared by a group of devices. */
  group: boolean;
  lifetime: boolean;
  expiresAt: number;
  remainingMs: number;
  maxDevices: number;
  status: string;
  admin: boolean;
}

/** Every module returns this shape; `changed`/`missing` are dotted paths. */
export interface GsEditResult {
  changed: string[];
  missing: string[];
}

export type GsTab =
  | "dashboard"
  | "player"
  | "statistics"
  | "boosters"
  | "seasons"
  | "cards"
  | "send"
  | "decor"
  | "avatars"
  | "frames"
  | "styles"
  | "badges"
  | "titles"
  | "backups";

/** The eight tabs shown in the first row; the rest live in the overflow row. */
export const GS_PRIMARY_TABS: GsTab[] = [
  "dashboard",
  "player",
  "statistics",
  "boosters",
  "seasons",
  "cards",
  "send",
  "decor",
];

export const GS_OVERFLOW_TABS: GsTab[] = [
  "avatars",
  "frames",
  "styles",
  "badges",
  "titles",
  "backups",
];

export const GS_TAB_LABEL: Record<GsTab, string> = {
  dashboard: "Dashboard",
  player: "Player",
  statistics: "Statistics",
  boosters: "Boosters",
  seasons: "Seasons",
  cards: "Cards",
  send: "Send Cards",
  decor: "Decor",
  avatars: "Avatars",
  frames: "Frames",
  styles: "Styles",
  badges: "Badges",
  titles: "Titles",
  backups: "Backups",
};

/** Tab id -> gs-icons name (the OxxEditor icon vocabulary). */
export const GS_TAB_ICON: Record<GsTab, string> = {
  dashboard: "save",
  player: "player",
  statistics: "statistics",
  boosters: "boosters",
  seasons: "infinite",
  cards: "cards",
  send: "sendCards",
  decor: "decosets",
  avatars: "avatars",
  frames: "frames",
  styles: "styles",
  badges: "badges",
  titles: "titles",
  backups: "backups",
};

export interface GsCtxValue {
  token: string;
  sessionId: string | null;
  snap: GsSnapshot | null;
  license: GsLicense | null;
  busy: boolean;
  /** Serial of the attached emulator ("" when none has been found yet). */
  serial: string;
  /** Run a server call under the shared busy state; errors become a toast. */
  act<T>(fn: () => Promise<T>): Promise<T | undefined>;
  /** Toast an EditResult's changed/missing counts. */
  note(res: GsEditResult | undefined, label: string): void;
  /** Re-pull the snapshot (and the dashboard summaries). */
  reload(): Promise<void>;
  /** Switch tabs from inside a panel. */
  go(tab: GsTab): void;
}

export const GsCtx = createContext<GsCtxValue | null>(null);

export function useGs(): GsCtxValue {
  const v = useContext(GsCtx);
  if (!v) throw new Error("useGs: outside <GsCtx.Provider>");
  return v;
}

/** The `sess` half every session-taking wrapper expects. */
export function sessOf(c: GsCtxValue): { token: string; sessionId: string } {
  if (!c.sessionId) throw new Error("No save connected");
  return { token: c.token, sessionId: c.sessionId };
}
