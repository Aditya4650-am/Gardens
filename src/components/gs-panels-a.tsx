import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  gsCardsSummary,
  gsConnect,
  gsDecorSummary,
  gsDrop,
  gsFillItems,
  gsListSeasons,
  gsMinItems,
  gsProfileSummary,
  gsPush,
  gsReadItems,
  gsReadPair,
  gsReadProfile,
  gsReadStats,
  gsRestore,
  gsWriteItems,
  gsWritePair,
  gsWriteStats,
} from "@/lib/gs-api";
import { useGs, sessOf, type GsEditResult, type GsTab } from "./gs-ctx";
import { gsDeviceSavePath, gsPullFromDevice, gsPushToDevice } from "@/lib/gardenscapes/transport";
import {
  Bar,
  Field,
  GsIcon,
  Grid,
  Panel,
  Stat,
  Tile,
  Toggle,
  downloadB64,
  fileToB64,
} from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group A — Dashboard, Player, Statistics, Boosters, Backups.
// ---------------------------------------------------------------------------

interface CardsSummary {
  featureId: string;
  owned: number;
  total: number;
  setsComplete: number;
  pendingGifts: number;
}
interface ProfileSummary {
  avatars: number;
  frames: number;
  badges: number;
  style: string;
}
interface DecorSummary {
  chapters: number;
  completed: number;
  opened: number;
  items: number;
}
interface SeasonLite {
  key: string;
  goldPassBought: number;
  score: number;
  scoreTotal: number;
  stages: number;
}
interface StatField {
  path: string;
  key: string;
  type: string;
  value: number | string | boolean | null;
}
interface OwnedBadge {
  cipher: string;
  isNew: boolean;
}
interface ProfileInfo {
  wornAvatarStyle: string;
  wornNameStyle: string;
  wornTitleId: string;
  wornBadgeCipher: string;
  wornBadgeId: string;
  currentAvatarId: string;
  avatarsShown: string[];
  avatarStylesShown: string[];
  nameStylesShown: string[];
  framesOwned: string[];
  titlesEarned: string[];
  boughtAvatars: number;
  ownedBadges: OwnedBadge[];
}
interface Booster {
  key: string;
  value: number;
}

/** The 10 booster keys, in the order the game writes them (items.server). */
const BOOSTER_KEYS = [
  "AdditionalMoves",
  "BombsBoost",
  "CrossBonus",
  "DynamiteAndLightningBoost",
  "FanBoost",
  "GloveBonus",
  "HammerBonus",
  "LightningBoost",
  "LineHorBoost",
  "LineVertBoost",
];

const BOOSTER_GLYPH: Record<string, string> = {
  AdditionalMoves: "➕",
  BombsBoost: "💣",
  CrossBonus: "✚",
  DynamiteAndLightningBoost: "⚡",
  FanBoost: "🌀",
  GloveBonus: "🧤",
  HammerBonus: "🔨",
  LightningBoost: "🌩",
  LineHorBoost: "↔",
  LineVertBoost: "↕",
};

function labelize(key: string): string {
  return key
    .replace(/_+([a-z0-9])/gi, (_m, c: string) => ` ${c.toUpperCase()}`)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
}

// === Dashboard =============================================================

export function GsDashboard() {
  const c = useGs();
  const [cards, setCards] = useState<CardsSummary | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [decor, setDecor] = useState<DecorSummary | null>(null);
  const [seasons, setSeasons] = useState<SeasonLite[]>([]);
  const [stats, setStats] = useState<StatField[]>([]);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!c.sessionId) return;
    const s = sessOf(c);
    const [a, b, d, se, st] = await Promise.all([
      c.act(() => gsCardsSummary({ data: s })),
      c.act(() => gsProfileSummary({ data: s })),
      c.act(() => gsDecorSummary({ data: s })),
      c.act(() => gsListSeasons({ data: s })),
      c.act(() => gsReadStats({ data: s })),
    ]);
    if (a) setCards(a as CardsSummary);
    if (b) setProfile(b as ProfileSummary);
    if (d) setDecor(d as DecorSummary);
    if (se) setSeasons(se as SeasonLite[]);
    if (st) setStats(st as StatField[]);
    if (!a && !b && !d && !se && !st) setErr("Could not read the save summary");
    else setErr("");
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const pick = (k: string) => stats.find((x) => x.key === k)?.value ?? "—";
  const season = seasons[0];

  return (
    <div className="gs-stack">
      <section className="gs-hero">
        <img src="/gs-dash.jpg" alt="" className="gs-hero-img" draggable={false} />
      </section>

      {err ? <p className="gs-msg gs-msg--err">{err}</p> : null}

      <Grid cols="wide">
        <Stat
          icon="statistics"
          tone={1}
          label="Level"
          value={String(pick("level"))}
          sub={`Stars ${pick("earnedStars")}`}
          onClick={() => c.go("statistics")}
        />
        <Stat
          icon="cart"
          tone={2}
          label="Coins"
          value={String(pick("coins"))}
          sub={`Tokens ${pick("tokens")}`}
          onClick={() => c.go("statistics")}
        />
        <Stat
          icon="cards"
          tone={3}
          label="Cards"
          value={cards ? `${cards.owned} / ${cards.total}` : "—"}
          sub={cards ? `${cards.setsComplete} sets complete · ${cards.featureId}` : "reading…"}
          onClick={() => c.go("cards")}
        />
        <Stat
          icon="badges"
          tone={4}
          label="Profile"
          value={profile ? `${profile.badges} badges` : "—"}
          sub={profile ? `${profile.avatars} avatars · ${profile.frames} frames` : "reading…"}
          onClick={() => c.go("badges")}
        />
        <Stat
          icon="decosets"
          tone={5}
          label="Decor"
          value={decor ? `${decor.completed} / ${decor.chapters}` : "—"}
          sub={decor ? `${decor.items} items · ${decor.opened} opened` : "reading…"}
          onClick={() => c.go("decor")}
        />
        <Stat
          icon="infinite"
          tone={6}
          label="Golden pass"
          value={season ? (season.goldPassBought ? "Owned" : "Free") : "—"}
          sub={season ? `${season.key} · ${season.score}/${season.scoreTotal}` : "no season"}
          onClick={() => c.go("seasons")}
        />
      </Grid>

      <Panel title="Quick actions" icon="spark">
        <div className="gs-actions">
          {(["cards", "seasons", "decor", "statistics", "backups"] as GsTab[]).map((t) => (
            <Button key={t} variant="tool" size="sm" onClick={() => c.go(t)}>
              <GsIcon name={t === "backups" ? "backups" : t} className="size-4" />
              {t === "backups" ? "Backups" : t[0].toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </Panel>

      <Panel title="Session log" icon="terminal">
        <div className="gs-log">
          {(c.snap?.log?.length ? c.snap.log : ["connected — no edits yet"]).map((l, i) => (
            <p key={i}>› {l}</p>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// === Player ================================================================

export function GsPlayer() {
  const c = useGs();
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [f, setF] = useState<Record<string, string>>({});

  const load = async () => {
    if (!c.sessionId) return;
    const s = sessOf(c);
    const [st, pf] = await Promise.all([
      c.act(() => gsReadStats({ data: s })),
      c.act(() => gsReadProfile({ data: s })),
    ]);
    if (st) {
      const next: Record<string, string> = {};
      for (const x of st as StatField[]) next[x.key] = String(x.value ?? "");
      setF(next);
    }
    if (pf) setInfo(pf as ProfileInfo);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const KEYS = ["name", "dogname", "horse_name", "level", "coins", "realCoins", "tokens", "earnedStars"];

  const apply = async () => {
    if (!c.sessionId) return;
    const changes: Record<string, string> = {};
    for (const k of KEYS) if (k in f) changes[k] = f[k];
    const r = await c.act(() => gsWriteStats({ data: { ...sessOf(c), changes } }));
    c.note(r as GsEditResult | undefined, "Player");
    await c.reload();
  };

  return (
    <div className="gs-stack">
      <Panel
        title="Identity"
        icon="player"
       
        actions={
          <Button size="sm" onClick={() => void apply()} disabled={c.busy}>
            <GsIcon name="save" className="size-4" /> Apply
          </Button>
        }
      >
        <div className="gs-form">
          {KEYS.map((k) => (
            <Field
              key={k}
              label={labelize(k)}
              value={f[k] ?? ""}
              placeholder="—"
              onChange={(v) => setF((p) => ({ ...p, [k]: v }))}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Worn appearance" icon="user">
        <Grid cols="wide">
          <Stat icon="avatars" tone={1} label="Avatar" value={info?.currentAvatarId || "—"} sub={info?.wornAvatarStyle || "default"} onClick={() => c.go("avatars")} />
          <Stat icon="titles" tone={2} label="Title" value={info?.wornTitleId || "—"} sub="tap to change" onClick={() => c.go("titles")} />
          <Stat icon="badges" tone={3} label="Badge" value={info?.wornBadgeCipher ? "worn" : "—"} sub={info ? `${info.ownedBadges.length} owned` : ""} onClick={() => c.go("badges")} />
          <Stat icon="frames" tone={4} label="Avatar frame" value={info?.framesOwned.length ? `${info.framesOwned.length} owned` : "—"} sub="tap to unlock" onClick={() => c.go("frames")} />
        </Grid>
        <div className="gs-actions">
          <Button variant="tool" size="sm" onClick={() => c.go("styles")}>
            <GsIcon name="styles" className="size-4" /> Styles
          </Button>
          <Button variant="tool" size="sm" onClick={() => c.go("avatars")}>
            <GsIcon name="avatars" className="size-4" /> Avatars
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={c.busy}>
            <GsIcon name="refresh" className="size-4" /> Re-read
          </Button>
        </div>
      </Panel>
    </div>
  );
}

// === Statistics (data center) =============================================

/** The only counters this tab shows (order is the on-screen order). */
const STAT_KEEP = [
  "coins",
  "level",
  "earnedStars",
  "spentStars",
  "GardenCurrentChapterId",
  "name",
  "dogname",
  "horse_name",
  "realCoins",
  "tokens",
  "lives",
  "expedition_energy",
  "LastPlayedLevel",
  "LastLevelAttempt",
  "PlayerId",
  "gameId",
];

const PAIR_KEYS = ["lives", "expedition_energy"] as const;

export function GsStatistics() {
  const c = useGs();
  const [fields, setFields] = useState<StatField[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pairs, setPairs] = useState<Record<string, { current: number; max: number }>>({});

  const load = async () => {
    if (!c.sessionId) return;
    const s = sessOf(c);
    const st = await c.act(() => gsReadStats({ data: s }));
    if (st) {
      setFields(st as StatField[]);
      const next: Record<string, string> = {};
      for (const x of st as StatField[]) next[x.key] = String(x.value ?? "");
      setEdits(next);
    }
    for (const key of PAIR_KEYS) {
      const p = await c.act(() => gsReadPair({ data: { ...s, key } }));
      const pair = (p as { pair: { current: number; max: number } | null } | undefined)?.pair;
      if (pair) setPairs((prev) => ({ ...prev, [key]: pair }));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const shown = STAT_KEEP.map((k) => fields.find((f) => f.key === k)).filter((f): f is StatField => !!f);
  const isPair = (key: string) => (PAIR_KEYS as readonly string[]).includes(key);

  const dirty =
    shown.filter((f) => !isPair(f.key) && edits[f.key] !== undefined && edits[f.key] !== String(f.value ?? "")).length +
    PAIR_KEYS.filter((k) => pairs[k]).length;

  const apply = async () => {
    const changes: Record<string, string> = {};
    for (const f of shown) {
      if (isPair(f.key)) continue;
      if (edits[f.key] !== undefined && edits[f.key] !== String(f.value ?? "")) changes[f.key] = edits[f.key];
    }
    let touched = 0;
    if (Object.keys(changes).length) {
      const r = await c.act(() => gsWriteStats({ data: { ...sessOf(c), changes } }));
      c.note(r as GsEditResult | undefined, "Statistics");
      touched++;
    }
    for (const key of PAIR_KEYS) {
      const p = pairs[key];
      if (!p) continue;
      const r = await c.act(() =>
        gsWritePair({ data: { ...sessOf(c), key, current: p.current, max: p.max } }),
      );
      c.note(r as GsEditResult | undefined, key === "lives" ? "Lives" : "Expedition energy");
      touched++;
    }
    if (!touched) {
      toast.info("Nothing changed");
      return;
    }
    await c.reload();
    await load();
  };

  const reset = () => {
    setEdits(Object.fromEntries(fields.map((f) => [f.key, String(f.value ?? "")])));
    setPairs((prev) => {
      const next = { ...prev };
      return next;
    });
    void load();
  };

  return (
    <div className="gs-stack">
      <Bar
        onClear={reset}
        clearLabel="Reset edits"
        extra={
          <Button size="sm" onClick={() => void apply()} disabled={c.busy}>
            <GsIcon name="save" className="size-4" /> Apply{dirty ? ` (${dirty})` : ""}
          </Button>
        }
      />

      <Grid cols="wide">
        {shown.map((f, i) => (
          <div key={f.path} className="gs-stat gs-stat--edit" data-tone={String((i % 7) + 1)}>
            <span className="gs-stat-head">
              <span className="kicker">{f.key}</span>
            </span>
            {isPair(f.key) ? (
              <div className="gs-pair gs-pair--inline mt-1.5">
                <input
                  className="field field-stat font-mono"
                  aria-label={`${f.key} current`}
                  value={String(pairs[f.key]?.current ?? "")}
                  onChange={(e) =>
                    setPairs((prev) => ({
                      ...prev,
                      [f.key]: { current: Math.max(0, Math.floor(Number(e.target.value) || 0)), max: prev[f.key]?.max ?? 0 },
                    }))
                  }
                />
                <input
                  className="field field-stat font-mono"
                  aria-label={`${f.key} max`}
                  value={String(pairs[f.key]?.max ?? "")}
                  onChange={(e) =>
                    setPairs((prev) => ({
                      ...prev,
                      [f.key]: { current: prev[f.key]?.current ?? 0, max: Math.max(0, Math.floor(Number(e.target.value) || 0)) },
                    }))
                  }
                />
              </div>
            ) : (
              <input
                className="field field-stat mt-1.5 font-mono"
                value={edits[f.key] ?? ""}
                onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </Grid>
      {!shown.length ? <p className="gs-empty">No stats in this save.</p> : null}
    </div>
  );
}

// === Boosters ==============================================================

export function GsBoosters() {
  const c = useGs();
  const [items, setItems] = useState<Booster[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [fill, setFill] = useState("999");

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsReadItems({ data: sessOf(c) }));
    if (r) {
      const list = r as Booster[];
      setItems(list);
      setEdits(Object.fromEntries(list.map((x) => [x.key, String(x.value)])));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const ordered = [...items].sort((a, b) => {
    const ai = BOOSTER_KEYS.indexOf(a.key);
    const bi = BOOSTER_KEYS.indexOf(b.key);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.key.localeCompare(b.key);
  });

  const apply = async () => {
    const changes: Record<string, number> = {};
    for (const it of items) {
      const v = Number(edits[it.key]);
      if (Number.isFinite(v) && v !== it.value) changes[it.key] = Math.floor(v);
    }
    if (!Object.keys(changes).length) {
      toast.info("Nothing changed");
      return;
    }
    const r = await c.act(() => gsWriteItems({ data: { ...sessOf(c), changes } }));
    c.note(r as GsEditResult | undefined, "Boosters");
    await load();
  };

  const bulk = async (kind: "fill" | "min") => {
    const v = Math.max(0, Math.min(999999, Math.floor(Number(fill) || 0)));
    const r = await c.act(() =>
      kind === "fill"
        ? gsFillItems({ data: { ...sessOf(c), value: v } })
        : gsMinItems({ data: { ...sessOf(c), min: v } }),
    );
    c.note(r as GsEditResult | undefined, kind === "fill" ? "Fill boosters" : "Top-up boosters");
    await load();
  };

  return (
    <div className="gs-stack">
      <Bar
       
        onAll={() => setEdits(Object.fromEntries(items.map((x) => [x.key, String(x.value)])))}
        onClear={() => setEdits(Object.fromEntries(items.map((x) => [x.key, String(x.value)])))}
        allLabel="Reset"
        clearLabel="Reset"
        extra={
          <Button size="sm" onClick={() => void apply()} disabled={c.busy}>
            <GsIcon name="save" className="size-4" /> Apply
          </Button>
        }
      />

      <Panel title="Bulk" icon="infinite">
        <div className="gs-pair">
          <Field label="Amount" value={fill} onChange={setFill} suffix="each" />
          <Button size="sm" variant="success" disabled={c.busy} onClick={() => void bulk("fill")}>
            Fill all
          </Button>
          <Button size="sm" variant="outline" disabled={c.busy} onClick={() => void bulk("min")}>
            Top-up to
          </Button>
        </div>
      </Panel>

      <Grid cols="wide">
        {ordered.map((it) => (
          <label key={it.key} className="gs-stat gs-stat--edit" data-tone={String((BOOSTER_KEYS.indexOf(it.key) % 7) + 1)}>
            <span className="gs-stat-head">
              <span aria-hidden className="gs-stat-emoji">{BOOSTER_GLYPH[it.key] ?? "✦"}</span>
              <span className="kicker">{labelize(it.key)}</span>
            </span>
            <input
              className="field field-qty mt-1.5 font-mono"
              inputMode="numeric"
              value={edits[it.key] ?? ""}
              onChange={(e) => setEdits((p) => ({ ...p, [it.key]: e.target.value }))}
            />
          </label>
        ))}
      </Grid>
      {!ordered.length ? <p className="gs-empty">The save's items table is empty.</p> : null}
    </div>
  );
}

// === Backups ==============================================================

export function GsBackups() {
  const c = useGs();
  const [path, setPath] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!c.token) return;
    void c.act(async () => {
      setPath(await gsDeviceSavePath(c.serial));
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.token, c.serial]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    const r = await fn();
    setMsg(`${label} · ok`);
    return r;
  };

  const downloadCurrent = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsPush({ data: sessOf(c) }));
    if (r) {
      downloadB64("GameData.db", (r as { b64: string }).b64);
      setMsg("Saved GameData.db to your downloads");
      toast.success("Backup downloaded");
    }
  };

  const restoreCurrent = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsRestore({ data: sessOf(c) }));
    if (r) {
      setMsg("Rolled back to the bytes this session loaded with");
      await c.reload();
      toast.success("Restored");
    }
  };

  const pushToDevice = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsPush({ data: sessOf(c) }));
    if (!r) return;
    const ok = await c.act(() => gsPushToDevice((r as { b64: string }).b64, c.serial || undefined));
    if (ok) {
      setMsg(`Pushed ${ok.size} bytes to the device`);
      toast.success("Pushed to device");
    }
  };

  const pullFromDevice = async () => {
    const got = await c.act(() => gsPullFromDevice(c.serial || undefined));
    if (!got) return;
    const s = await c.act(() =>
      gsConnect({ data: { token: c.token, device: got.file || "device", saveB64: got.b64 } }),
    );
    if (s) {
      setMsg(`Pulled ${got.size} bytes from the device`);
      await c.reload();
      toast.success("Pulled from device");
    }
  };

  const upload = async (file: File) => {
    const b64 = await fileToB64(file);
    const s = await c.act(() =>
      gsConnect({ data: { token: c.token, device: file.name, saveB64: b64 } }),
    );
    if (s) {
      setMsg(`Loaded ${file.name} · ${(b64.length * 3) / 4 | 0} bytes`);
      await c.reload();
      toast.success("Save loaded");
    }
  };

  return (
    <div className="gs-stack">
      <Panel title="This session" icon="backups">
        <div className="gs-actions">
          <Button size="sm" onClick={() => void downloadCurrent()} disabled={c.busy || !c.sessionId}>
            <GsIcon name="download" className="size-4" /> Download save
          </Button>
          <Button size="sm" variant="warn" onClick={() => void restoreCurrent()} disabled={c.busy || !c.sessionId}>
            <GsIcon name="reset" className="size-4" /> Restore original
          </Button>
          <Button size="sm" variant="ghost" disabled={c.busy || !c.sessionId} onClick={() => void run("Dropped", async () => { await gsDrop({ data: sessOf(c) }); window.location.reload(); })}>
            <GsIcon name="trash" className="size-4" /> Drop session
          </Button>
        </div>
        {path ? <p className="gs-hint-line">Device path: <code>{path}</code></p> : null}
      </Panel>

      <Panel title="Device" icon="device">
        <div className="gs-actions">
          <Button size="sm" variant="outline" onClick={() => void pullFromDevice()} disabled={c.busy}>
            <GsIcon name="refresh" className="size-4" /> Pull from device
          </Button>
          <Button size="sm" variant="outline" onClick={() => void pushToDevice()} disabled={c.busy || !c.sessionId}>
            <GsIcon name="cloudUp" className="size-4" /> Push to device
          </Button>
        </div>
      </Panel>

      <Panel title="Load a file" icon="save">
        <input
          ref={fileRef}
          type="file"
          accept=".db,.audb,.bin,*/*"
          className="gs-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </Panel>

      {msg ? <p className="gs-msg gs-msg--ok">{msg}</p> : null}
    </div>
  );
}
