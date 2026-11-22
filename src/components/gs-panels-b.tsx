import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  gsAcceptReceivedCards,
  gsBuyPurchases,
  gsClaimGardenPass,
  gsClearGiftingInbox,
  gsGiftingStatus,
  gsGrantCards,
  gsListChapters,
  gsListPurchases,
  gsListSeasons,
  gsMarkCardsSeen,
  gsReadCards,
  gsReadFriends,
  gsScanDeviceFriends,
  gsSendCardsToFriends,
  gsSendCardsToSelf,
  gsSetAllStock,
  gsSetPackCount,
  gsSetPackStreak,
  gsWriteChapter,
  gsWriteChapters,
  gsWritePurchases,
} from "@/lib/gs-api";
import { GS_CARD_PACKS, GS_CARD_SETS, GS_CARDS } from "@/lib/server/gardenscapes/catalogs";
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Bar, Chip, Field, GsIcon, Panel, Toggle } from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group B â€” Seasons, Decor, Cards, Send Cards.
// ---------------------------------------------------------------------------

const SET_TONES = [
  "#7C3AED", "#F59E0B", "#38BDF8", "#E879F9", "#34D399",
  "#A78BFA", "#F472B6", "#FACC15", "#22D3EE", "#4ADE80",
  "#FB7185", "#818CF8", "#FDBA74", "#2DD4BF", "#C084FC",
];
// === Garden Pass ===========================================================

interface SeasonInfo {
  key: string;
  goldPassBought: number;
  score: number;
  scoreTotal: number;
  freeCollected: number;
  goldCollected: number;
  stages: number;
}

export function GsSeasons() {
  const c = useGs();
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsListSeasons({ data: sessOf(c) }));
    if (r) setSeasons(r as SeasonInfo[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const push = async () => {
    if (!seasons.length) return;
    const r = await c.act(() => gsClaimGardenPass({ data: sessOf(c) }));
    c.note(r as GsEditResult | undefined, "Garden Pass");
    await load();
  };

  return (
    <div className="gs-stack">
      <section className="gs-gp-card panel">
        <header className="gs-gp-head">
          <span className="gs-gp-emblem" aria-hidden="true">
            <GsIcon name="crown" className="size-7" />
          </span>
          <h3 className="gs-gp-title">Garden Pass</h3>
        </header>

        <button
          type="button"
          className="gs-gp-btn"
          disabled={c.busy || !seasons.length}
          onClick={() => void push()}
        >
          <span className="gs-gp-btn-icon">
            <GsIcon name="crown" className="size-6" />
          </span>
          <span className="gs-gp-btn-body">
            <span className="gs-gp-btn-title">Push Garden Pass</span>
            <span className="gs-gp-btn-sub">Every reward on both roads</span>
          </span>
          <span className="gs-gp-btn-go">
            <GsIcon name="check" className="size-5" />
          </span>
        </button>
      </section>
    </div>
  );
}

// === Decor ================================================================

interface DecorItem {
  name: string;
  step: string;
  keepStep: string | null;
  baseStep: string | null;
}
interface Chapter {
  key: string;
  completed: boolean;
  opened: boolean;
  items: DecorItem[];
}
interface Purchase {
  key: string;
  isBuy: boolean;
}

export function GsDecor() {
  const c = useGs();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!c.sessionId) return;
    const s = sessOf(c);
    const [a, b] = await Promise.all([
      c.act(() => gsListChapters({ data: s })),
      c.act(() => gsListPurchases({ data: s })),
    ]);
    if (a) setChapters(a as Chapter[]);
    if (b) setPurchases(b as Purchase[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const done = chapters.filter((x) => x.completed).length;
  const bought = purchases.filter((p) => p.isBuy).length;
  const items = chapters.reduce((n, x) => n + x.items.length, 0);

  const act2 = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  const toggle = (key: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const apply = () => {
    const keys = [...sel];
    if (!keys.length) return;
    void act2(
      () => gsWriteChapters({ data: { ...sessOf(c), keys, completed: true } }),
      `${keys.length} chapter(s)`,
    );
    setSel(new Set());
  };

  const name = (key: string) => key.replace(/_/g, " ").replace(/^chapter/i, "Chapter ");

  return (
    <div className="gs-stack">
      <section className="gs-cta-card panel">
        <header className="gs-cta-head">
          <span className="gs-cta-emblem" aria-hidden="true">
            <GsIcon name="decosets" className="size-6" />
          </span>
          <div>
            <h3 className="gs-cta-title">Decorations</h3>
            <p className="gs-cta-lead">Every garden chapter and its decor purchases</p>
          </div>
        </header>

        <div className="gs-chips">
          <Chip tone="ok" icon="check">
            {done} / {chapters.length} chapters
          </Chip>
          <Chip tone="gold" icon="cart">
            {bought} / {purchases.length} bought
          </Chip>
          <Chip tone="info" icon="layers">
            {items} items
          </Chip>
        </div>

        <div className="gs-cta-actions">
          <button
            type="button"
            className="gs-cta-btn"
            disabled={c.busy || !chapters.length}
            onClick={() =>
              void act2(
                () => gsWriteChapters({ data: { ...sessOf(c), keys: chapters.map((x) => x.key), completed: true } }),
                "All chapters",
              )
            }
          >
            <GsIcon name="check" className="size-5" />
            <span>Complete all</span>
          </button>
          <button
            type="button"
            className="gs-cta-btn gs-cta-btn--ghost"
            disabled={c.busy || !purchases.length}
            onClick={() => void act2(() => gsBuyPurchases({ data: sessOf(c) }), "Purchases")}
          >
            <GsIcon name="cart" className="size-5" />
            <span>Buy all purchases</span>
          </button>
          <button
            type="button"
            className="gs-cta-btn gs-cta-btn--ghost"
            disabled={c.busy || !chapters.length}
            onClick={() =>
              void act2(
                () =>
                  gsWriteChapters({
                    data: { ...sessOf(c), keys: chapters.map((x) => x.key), completed: false, opened: true },
                  }),
                "Reopen all",
              )
            }
          >
            <GsIcon name="refresh" className="size-5" />
            <span>Reopen all</span>
          </button>
        </div>

        <div className="gs-pickbar">
          <button
            type="button"
            className="gs-pickbar-btn"
            disabled={c.busy}
            onClick={() => setSel(new Set(chapters.map((x) => x.key)))}
          >
            <GsIcon name="check" className="size-4" />
            Select all
          </button>
          <button
            type="button"
            className="gs-pickbar-btn gs-pickbar-btn--ghost"
            disabled={c.busy || sel.size === 0}
            onClick={() => setSel(new Set())}
          >
            Clear
          </button>
          <button
            type="button"
            className="gs-pickbar-btn gs-pickbar-btn--go"
            disabled={c.busy || sel.size === 0}
            onClick={apply}
          >
            <GsIcon name="spark" className="size-4" />
            {sel.size ? `Apply ${sel.size}` : "Apply"}
          </button>
          <span className="gs-pickbar-count tabular-nums">
            {sel.size} / {chapters.length}
          </span>
        </div>

        <div className="gs-pick3">
          {chapters.map((ch) => {
            const on = sel.has(ch.key);
            return (
              <button
                key={ch.key}
                type="button"
                className={cn("gs-pick3-btn", on && "is-sel", ch.completed && "is-owned")}
                aria-pressed={on}
                disabled={c.busy}
                onClick={() => toggle(ch.key)}
                title={`${name(ch.key)} — ${ch.completed ? "done" : ch.opened ? "opened" : "locked"}`}
              >
                <span className="gs-pick3-icon">
                  <GsIcon name="decosets" className="size-5" />
                </span>
                <span className="gs-pick3-body">
                  <span className="gs-pick3-label">{name(ch.key)}</span>
                  <span className="gs-pick3-sub">
                    {ch.completed ? "Done" : ch.opened ? "Open" : "Locked"} · {ch.items.length}
                  </span>
                </span>
                <span className={cn("gs-pick3-tick", on && "on")} aria-hidden="true">
                  {on ? <GsIcon name="check" className="size-3.5" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Write every purchase key to `false` (unbuy) in one server call. */
function gsWritePurchasesSafe(c: ReturnType<typeof useGs>, keys: string[]) {
  const changes: Record<string, boolean> = {};
  for (const k of keys) changes[k] = false;
  return gsWritePurchases({ data: { ...sessOf(c), changes } });
}

// === Cards ================================================================

interface CardRow {
  cardId: string;
  number: number;
  setId: string;
  generatedCount: number;
  inStockCount: number;
  isNew: boolean;
}
interface SetRow {
  setId: string;
  lastSeenProgress: number;
  isRewardGiven: boolean;
  owned: number;
  seen: number;
  complete: boolean;
}
interface PackRow {
  id: string;
  count: number;
}
interface CardsInfo {
  featureId: string;
  features: { id: string; hasCore: boolean; ownedRows: number; active: boolean; isEventActive: boolean; isGrandCollection: boolean }[];
  cards: CardRow[];
  catalog: Array<CardRow & { owned: boolean }>;
  sets: SetRow[];
  packs: PackRow[];
  blockers: { featureId: string; setId: string; pairs: { blockerCardId: string; trashCardId: string }[] }[];
  total: number;
  streak: number;
  pendingPacks: number;
  eventActive: boolean;
  grandCollection: boolean;
  gifting: {
    lastResetDay: number;
    sendCardsCount: number;
    requestTimestamp: number;
    received: { belongingCollectionId: string; cardId: string; cardSourceId: string; senderId: string; uniqueGiftingId: string }[];
    pendingReceived: number;
    pendingSend: number;
    sent: number;
  };
  invariants: {
    totalMatches: boolean;
    setsMatch: boolean;
    uniqueIds: boolean;
    knownIds: boolean;
    rowsWellFormed: boolean;
  };
}

/** Card ids grouped by their set of ten. */
const SET_IDS: string[][] = GS_CARD_SETS.map((setId) =>
  GS_CARDS.filter((c) => c.setId === setId).map((c) => c.id),
);

/** One premium set button: number, owned count and a progress rail. */
function SetButton({
  index,
  owned,
  total,
  busy,
  label,
  onClick,
}: {
  index: number;
  owned: number;
  total: number;
  busy: boolean;
  label: string;
  onClick: () => void;
}) {
  const pct = total ? Math.round((owned / total) * 100) : 0;
  return (
    <button
      type="button"
      className={cn("gs-setbtn", owned >= total && "gs-setbtn--done")}
      style={{ "--tone": SET_TONES[index % SET_TONES.length] } as CSSProperties}
      disabled={busy}
      onClick={onClick}
      title={`${label} Â· ${owned}/${total}`}
    >
      <span className="gs-setbtn-top">
        <span className="gs-setbtn-no">{index + 1}</span>
        <span className="gs-setbtn-count">
          {owned}/{total}
        </span>
      </span>
      <span className="gs-setbtn-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

function ownedBySet(info: CardsInfo | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of info?.cards ?? []) m.set(c.setId, (m.get(c.setId) ?? 0) + 1);
  return m;
}

export function GsCards() {
  const c = useGs();
  const [info, setInfo] = useState<CardsInfo | null>(null);
  const [amount, setAmount] = useState("1");
  const [stock, setStock] = useState("1");
  const [packEdits, setPackEdits] = useState<Record<string, string>>({});

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsReadCards({ data: sessOf(c) }));
    if (r) {
      const d = r as CardsInfo;
      setInfo(d);
      setPackEdits(Object.fromEntries(d.packs.map((p) => [p.id, String(p.count)])));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const amt = Math.max(1, Math.min(9999, Math.floor(Number(amount) || 1)));
  const stk = Math.max(1, Math.min(9999, Math.floor(Number(stock) || 1)));
  const owned = ownedBySet(info);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  return (
    <div className="gs-stack">
      <section className="gs-cta-card panel">
        <header className="gs-cta-head">
          <span className="gs-cta-emblem" aria-hidden="true">
            <GsIcon name="cards" className="size-6" />
          </span>
          <div>
            <h3 className="gs-cta-title">Card collection</h3>
            <p className="gs-cta-lead">
              {info?.cards.length ?? 0} of {GS_CARDS.length} owned Â· {info?.featureId ?? "â€”"}
            </p>
          </div>
        </header>

        <div className="gs-pair">
          <Field label="Amount" value={amount} onChange={setAmount} suffix="per card" />
          <Field label="Stock" value={stock} onChange={setStock} suffix="each" />
        </div>

        <div className="gs-cta-actions">
          <button
            type="button"
            className="gs-cta-btn"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsGrantCards({ data: { ...sessOf(c), ids: GS_CARDS.map((x) => x.id), amount: amt } }),
                "All cards",
              )
            }
          >
            <GsIcon name="plus" className="size-5" />
            <span>Fill all {GS_CARDS.length}</span>
            <span className="gs-cta-btn-meta">Ã—{amt}</span>
          </button>
          <button
            type="button"
            className="gs-cta-btn gs-cta-btn--ghost"
            disabled={c.busy}
            onClick={() => void run(() => gsSetAllStock({ data: { ...sessOf(c), stock: stk } }), "All stock")}
          >
            <GsIcon name="layers" className="size-5" />
            <span>Set every stock</span>
          </button>
          <button
            type="button"
            className="gs-cta-btn gs-cta-btn--ghost"
            disabled={c.busy}
            onClick={() => void run(() => gsMarkCardsSeen({ data: sessOf(c) }), "Mark seen")}
          >
            <GsIcon name="check" className="size-5" />
            <span>Mark all seen</span>
          </button>
        </div>

        <div className="gs-setgrid">
          {GS_CARD_SETS.map((setId, i) => (
            <SetButton
              key={setId}
              index={i}
              owned={owned.get(setId) ?? 0}
              total={10}
              busy={c.busy}
              label={setId}
              onClick={() =>
                void run(
                  () => gsGrantCards({ data: { ...sessOf(c), ids: SET_IDS[i], amount: amt } }),
                  `Set ${i + 1}`,
                )
              }
            />
          ))}
        </div>
      </section>

      <Panel title="Card packs" icon="cards">
        <div className="gs-form">
          {GS_CARD_PACKS.map((id) => (
            <Field
              key={id}
              label={id}
              value={packEdits[id] ?? "0"}
              onChange={(v) => setPackEdits((p) => ({ ...p, [id]: v }))}
            />
          ))}
        </div>
        <div className="gs-actions mt-3">
          <Button
            size="sm"
            disabled={c.busy}
            onClick={() =>
              void run(async () => {
                const results: GsEditResult[] = [];
                for (const id of GS_CARD_PACKS) {
                  const n = Math.max(0, Math.min(65535, Math.floor(Number(packEdits[id]) || 0)));
                  const r = await gsSetPackCount({ data: { ...sessOf(c), packId: id, count: n } });
                  results.push(r as GsEditResult);
                }
                return results.reduce(
                  (acc, r) => ({ changed: [...acc.changed, ...r.changed], missing: [...acc.missing, ...r.missing] }),
                  { changed: [] as string[], missing: [] as string[] },
                );
              }, "Packs")
            }
          >
            Save packs
          </Button>
          <span className="gs-inline-field">
            <span className="kicker">Streak</span>
            <input
              className="field field-qty font-mono"
              value={packEdits.__streak ?? String(info?.streak ?? 0)}
              onChange={(e) => setPackEdits((p) => ({ ...p, __streak: e.target.value }))}
            />
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsSetPackStreak({ data: { ...sessOf(c), value: Math.max(0, Math.floor(Number(packEdits.__streak) || 0)) } }),
                "Streak",
              )
            }
          >
            Set streak
          </Button>
        </div>
      </Panel>

      {info?.gifting.received.length ? (
        <Panel title="Gifts" icon="mail">
          <div className="gs-chips">
            <Chip tone="gold" icon="mail">
              {info.gifting.received.length} received
            </Chip>
          </div>
          <div className="gs-actions mt-3">
            <Button size="sm" variant="success" disabled={c.busy}
              onClick={() => void run(() => gsAcceptReceivedCards({ data: sessOf(c) }), "Accept gifts")}>
              Accept all
            </Button>
            <Button size="sm" variant="ghost" disabled={c.busy}
              onClick={() => void run(() => gsClearGiftingInbox({ data: sessOf(c) }), "Clear inbox")}>
              Clear
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

// === Send Cards ===========================================================

type GsFriendSource = "received" | "sent" | "manual";
interface GsFriendEntry {
  id: string;
  source: GsFriendSource;
}

/** Friend ids the user added by hand survive reloads (localStorage). */
const MANUAL_FRIENDS_KEY = "gs-send-friends-v1";

function loadManualFriends(): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_FRIENDS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveManualFriends(ids: string[]): void {
  try {
    localStorage.setItem(MANUAL_FRIENDS_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — the list lives for this visit only */
  }
}

/** Stable avatar colour per id, from the set palette. */
function friendTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % SET_TONES.length;
  return SET_TONES[h];
}

/**
 * Two sends in one tab. The friend half writes the measured
 * `PendingSendCards` rows, pushes and restarts the game — the game's own
 * sync then posts every row to Playrix, which is what actually delivers
 * (proven on MEmu: 150 rows in one flush, receiver held all 150). The
 * collection half mints cards into this save.
 */
export function GsSendCards() {
  const c = useGs();
  const [info, setInfo] = useState<CardsInfo | null>(null);
  const [amount, setAmount] = useState("1");
  // friend roster + selection
  const [autoFriends, setAutoFriends] = useState<{ id: string; source: "received" | "sent" }[]>([]);
  const [manual, setManual] = useState<string[]>(() => loadManualFriends());
  const [friendSel, setFriendSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [manualId, setManualId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  // card selection — the whole catalog ticked by default, so Send is live at first paint
  const [cardSel, setCardSel] = useState<Set<string>>(() => new Set(GS_CARDS.map((x) => x.id)));
  // send flow
  const [phase, setPhase] = useState<"idle" | "queueing" | "waiting">("idle");
  const [progress, setProgress] = useState<{ queued: number; pending: number; seconds: number } | null>(null);
  const [verdict, setVerdict] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const stopRef = useRef(false);
  const bootedRef = useRef(false);
  const idsRef = useRef<string[]>([]);

  const log = (line: string) =>
    setLines((L) => [...L.slice(-11), `${new Date().toLocaleTimeString()}  ${line}`]);

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsReadCards({ data: sessOf(c) }));
    if (r) setInfo(r as CardsInfo);
    const f = await c.act(() => gsReadFriends({ data: sessOf(c) }));
    if (f) {
      const rows = (f as { friends: { id: string; source: "received" | "sent" }[] }).friends;
      setAutoFriends(rows);
      const all = [...new Set([...rows.map((x) => x.id), ...manual])];
      if (!bootedRef.current) {
        // first load: the whole roster starts ticked
        bootedRef.current = true;
        setFriendSel(new Set(all));
      } else {
        // later loads: keep the user's ticks, drop ids that no longer exist
        setFriendSel((prev) => new Set([...prev].filter((id) => all.includes(id))));
      }
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const rosterMap = new Map<string, GsFriendEntry>();
  for (const f of autoFriends) rosterMap.set(f.id, { id: f.id, source: f.source });
  for (const id of manual) if (!rosterMap.has(id)) rosterMap.set(id, { id, source: "manual" });
  const roster = [...rosterMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const needle = q.trim().toLowerCase();
  const visible = roster.filter((f) => !needle || f.id.toLowerCase().includes(needle));

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggleFriend = (id: string) => setFriendSel((prev) => toggle(prev, id));
  const toggleCard = (id: string) => setCardSel((prev) => toggle(prev, id));
  const setGroup = (ids: string[], on: boolean) =>
    setCardSel((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const addManual = () => {
    const id = manualId.trim();
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) {
      log(id ? `Invalid friend id: ${id}` : "Type a player id first");
      return;
    }
    if (rosterMap.has(id)) {
      setManualId("");
      return;
    }
    const next = [...manual, id];
    setManual(next);
    saveManualFriends(next);
    setFriendSel((prev) => new Set(prev).add(id));
    setManualId("");
    log(`Added friend ${id}`);
  };

  const dropManual = (id: string) => {
    const next = manual.filter((x) => x !== id);
    setManual(next);
    saveManualFriends(next);
    setFriendSel((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  };

  /** Read the roster out of the running game's memory (its caches are
   * encrypted on disk but parsed into the heap on load). */
  const scanDevice = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const r = await c.act(() =>
        gsScanDeviceFriends({ data: { token: c.token, serial: c.serial || undefined } }),
      );
      if (r) {
        const res = r as { friends: { id: string; name: string }[]; scannedMB: number };
        const names: Record<string, string> = {};
        for (const f of res.friends) if (f.name) names[f.id] = f.name;
        setDeviceNames((prev) => ({ ...prev, ...names }));
        const fresh = res.friends.filter((f) => !rosterMap.has(f.id));
        if (fresh.length) {
          const next = [...manual, ...fresh.map((f) => f.id)];
          setManual(next);
          saveManualFriends(next);
          setFriendSel((prev) => {
            const s = new Set(prev);
            for (const f of fresh) s.add(f.id);
            return s;
          });
        }
        log(
          res.friends.length
            ? `Device scan: ${res.friends.length} friend(s), ${fresh.length} new (${res.scannedMB} MB read)`
            : `Device scan found no friends (${res.scannedMB} MB read) — keep the game open`,
        );
      }
    } finally {
      setScanning(false);
    }
  };

  const total = friendSel.size * cardSel.size;
  const pct =
    progress && progress.queued > 0
      ? Math.round(((progress.queued - progress.pending) / progress.queued) * 100)
      : 0;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Honest drain verdict: SentCards rolls at ~150 rows, so the poll counts
   * this run's exact gifting ids instead of trusting a size delta. */
  const verdictFor = (queued: number, recorded: number): string =>
    recorded >= queued
      ? `Queue cleared — all ${queued} recorded as sent`
      : recorded === 0
        ? `Queue cleared — the server accepted none of the ${queued} (are they friends?)`
        : `Queue cleared — ${recorded}/${queued} recorded as sent`;

  const poll = async (): Promise<{ pendingSend: number; sent: number; recorded: number } | null> => {
    const r = await c.act(() =>
      gsGiftingStatus({
        data: { token: c.token, serial: c.serial || undefined, ids: idsRef.current },
      }),
    );
    return (r ?? null) as { pendingSend: number; sent: number; recorded: number } | null;
  };

  const send = async () => {
    const receivers = [...friendSel];
    const cards = [...cardSel];
    if (phase !== "idle" || !receivers.length || !cards.length) return;
    stopRef.current = false;
    setVerdict("");
    const queued = receivers.length * cards.length;
    setPhase("queueing");
    setProgress({ queued, pending: queued, seconds: 0 });
    log(`Queueing ${queued} gifts to ${receivers.length} friend(s)…`);
    const r = await c.act(() =>
      gsSendCardsToFriends({
        data: {
          ...sessOf(c),
          receiverIds: receivers,
          cardIds: cards,
          serial: c.serial || undefined,
        },
      }),
    );
    if (!r) {
      setPhase("idle");
      setProgress(null);
      log("Send failed — see the error message");
      return;
    }
    const res = r as {
      queued: number;
      receivers: number;
      changed: string[];
      missing: string[];
      launched: boolean;
      giftingIds: string[];
    };
    idsRef.current = res.giftingIds ?? [];
    c.note({ changed: res.changed, missing: res.missing }, "Send to friends");
    if (!res.launched) {
      setPhase("idle");
      setVerdict("Saved to the device — open Gardenscapes to deliver the queue, then press Check now.");
      log(`Queued ${res.queued} · pushed · start the game to deliver`);
      return;
    }
    log(`Queued ${res.queued} · pushed · game restarting — waiting for its sync`);
    setPhase("waiting");
    const t0 = Date.now();
    let lastPending = res.queued;
    while (!stopRef.current) {
      await sleep(4000);
      const secs = Math.round((Date.now() - t0) / 1000);
      const st = await poll();
      if (st) {
        lastPending = st.pendingSend;
        setProgress({ queued: res.queued, pending: st.pendingSend, seconds: secs });
        if (st.pendingSend === 0) {
          const v = verdictFor(res.queued, st.recorded ?? 0);
          setVerdict(v);
          log(v);
          break;
        }
        if (secs >= 300) {
          const v = `Still flushing: ${st.pendingSend} pending after ${secs}s — it finishes on its own; press Check now later`;
          setVerdict(v);
          log(v);
          break;
        }
      } else if (secs >= 300) {
        const v = `Could not read the device after ${secs}s — press Check now`;
        setVerdict(v);
        log(v);
        break;
      }
    }
    if (stopRef.current) {
      const v = `Stopped — ${lastPending} of ${res.queued} still pending`;
      setVerdict(v);
      log(v);
    }
    setPhase("idle");
    await load();
  };

  const checkNow = async () => {
    const st = await poll();
    if (!st) {
      log("Could not read the device");
      return;
    }
    const queued = progress?.queued ?? 0;
    setProgress((p) => (p ? { ...p, pending: st.pendingSend } : p));
    if (st.pendingSend === 0 && queued > 0) {
      const v = verdictFor(queued, st.recorded ?? 0);
      setVerdict(v);
      log(v);
    } else {
      log(`${st.pendingSend} pending · ${st.recorded ?? 0} recorded · SentCards ${st.sent}`);
    }
  };

  const amt = Math.max(1, Math.min(9999, Math.floor(Number(amount) || 1)));
  const owned = ownedBySet(info);

  const sendSelf = async (ids: string[], label: string) => {
    const r = await c.act(() => gsSendCardsToSelf({ data: { ...sessOf(c), cardIds: ids, amount: amt } }));
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  return (
    <div className="gs-stack">
      <section className="gs-cta-card panel">
        <header className="gs-cta-head">
          <span className="gs-cta-emblem gs-cta-emblem--send" aria-hidden="true">
            <GsIcon name="sendCards" className="size-6" />
          </span>
          <div>
            <h3 className="gs-cta-title">Send to friends</h3>
            <p className="gs-cta-lead">Pick friends, tick the cards, one press</p>
          </div>
          {phase !== "idle" ? (
            <span className="gs-chip gs-chip--info ml-auto animate-pulse">
              {phase === "queueing" ? "Queueing…" : `Syncing ${progress?.seconds ?? 0}s`}
            </span>
          ) : null}
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── friends ─────────────────────────────────────────── */}
          <div className="min-w-0">
            <Bar
              hint={`${friendSel.size} of ${roster.length} friends selected`}
              allLabel="Select shown"
              onAll={() => setFriendSel(new Set(visible.map((f) => f.id)))}
              onClear={() => setFriendSel(new Set())}
              extra={
                <input
                  className="field w-32 font-mono"
                  placeholder="Search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              }
            />
            <div className="mb-2 flex gap-2">
              <input
                className="field min-w-0 flex-1 font-mono"
                placeholder="Add player id — e.g. mhRwDZPm18"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManual();
                }}
              />
              <Button size="sm" variant="tool" onClick={addManual}>
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={c.busy || scanning}
                onClick={() => void scanDevice()}
              >
                {scanning ? "Scanning…" : "Scan device"}
              </Button>
            </div>
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 py-7 text-center text-xs text-muted">
                No friends yet — add a player id above
              </div>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {visible.map((f) => {
                  const on = friendSel.has(f.id);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleFriend(f.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-150",
                          on
                            ? "border-purple/55 bg-purple/10"
                            : "border-white/5 bg-white/[0.02] hover:border-cyan/30 hover:bg-input",
                        )}
                      >
                        <span
                          className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white/10"
                          style={{ background: friendTone(f.id) }}
                        >
                          {f.id.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-sm">{f.id}</span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {deviceNames[f.id] ?? (f.source === "manual" ? "added" : f.source)}
                        </span>
                        {f.source === "manual" ? (
                          <span
                            role="button"
                            tabIndex={-1}
                            title="Remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              dropManual(f.id);
                            }}
                            className="shrink-0 rounded px-1 text-muted hover:text-fg"
                          >
                            ✕
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded text-[10px] font-bold",
                            on ? "bg-purple text-white" : "bg-input text-transparent",
                          )}
                        >
                          ✓
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── cards ───────────────────────────────────────────── */}
          <div className="min-w-0">
            <Bar
              hint={`${cardSel.size} of ${GS_CARDS.length} cards selected`}
              onAll={() => setCardSel(new Set(GS_CARDS.map((x) => x.id)))}
              onClear={() => setCardSel(new Set())}
            />
            <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {SET_IDS.map((ids, gi) => {
                const allOn = ids.every((id) => cardSel.has(id));
                const onCount = ids.filter((id) => cardSel.has(id)).length;
                return (
                  <div
                    key={SET_IDS[gi][0]}
                    className="rounded-xl border border-white/5 bg-black/20 p-2"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={allOn}
                        onClick={() => setGroup(ids, !allOn)}
                        className={cn(
                          "rounded-lg border px-2 py-1 font-mono text-[11px] font-bold transition-all duration-150",
                          allOn
                            ? "border-amber/50 bg-amber/15 text-amber"
                            : "border-white/10 bg-black/30 text-muted hover:border-purple/40 hover:text-fg",
                        )}
                      >
                        set_{String(gi + 1).padStart(2, "0")}
                      </button>
                      <span className="text-[10px] text-muted tabular-nums">
                        {onCount}/{ids.length}
                      </span>
                      <span className="ml-auto text-[10px] text-muted tabular-nums">
                        {ids.filter((id) => (info?.catalog.find((x) => x.cardId === id)?.inStockCount ?? 0) > 0).length}
                        {" in stock"}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                      {ids.map((id) => {
                        const on = cardSel.has(id);
                        const stock = info?.catalog.find((x) => x.cardId === id)?.inStockCount ?? 0;
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleCard(id)}
                            title={`${id} · in stock ${stock}`}
                            className={cn(
                              "relative rounded-lg border py-1.5 font-mono text-xs font-semibold tabular-nums transition-all duration-150",
                              on
                                ? "border-purple/60 bg-purple/20 text-amber"
                                : "border-white/5 bg-black/25 text-muted hover:-translate-y-px hover:border-cyan/40 hover:text-fg",
                            )}
                          >
                            {id.split("_")[1]}
                            {on ? (
                              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── send ──────────────────────────────────────────────── */}
        <div className="gs-cta-actions mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="gs-cta-btn"
            disabled={c.busy || phase !== "idle" || total === 0}
            onClick={() => void send()}
          >
            <GsIcon name="sendCards" className="size-5" />
            <span>
              {phase === "queueing"
                ? "Queueing…"
                : phase === "waiting"
                  ? "Waiting for the game…"
                  : `Send ${total} cards`}
            </span>
            <span className="gs-cta-btn-meta">
              {friendSel.size} × {cardSel.size}
            </span>
          </button>
          {phase === "waiting" ? (
            <Button
              variant="danger"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              Stop
            </Button>
          ) : null}
          {progress && phase === "idle" ? (
            <Button variant="ghost" onClick={() => void checkNow()}>
              Check now
            </Button>
          ) : null}
        </div>

        {progress ? (
          <div className="mt-3 rounded-xl border border-white/5 bg-black/25 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs tabular-nums">
              <Chip>{progress.queued} queued</Chip>
              <Chip tone={progress.pending === 0 ? "ok" : "warn"}>
                {progress.queued - progress.pending} synced
              </Chip>
              <Chip>{progress.pending} pending</Chip>
              {phase === "waiting" ? <Chip tone="info">{progress.seconds}s</Chip> : null}
              <span className="ml-auto text-xs font-bold text-cyan">{pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple to-cyan transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {verdict ? <p className="mt-2 text-xs text-muted">{verdict}</p> : null}
          </div>
        ) : null}

        {lines.length ? (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-muted">
            {lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── collect for myself ──────────────────────────────────── */}
      <section className="gs-cta-card panel">
        <header className="gs-cta-head">
          <span className="gs-cta-emblem gs-cta-emblem--send" aria-hidden="true">
            <GsIcon name="cards" className="size-6" />
          </span>
          <div>
            <h3 className="gs-cta-title">To my collection</h3>
            <p className="gs-cta-lead">Add cards to this save — one press per set</p>
          </div>
        </header>

        <div className="gs-pair">
          <Field label="Amount" value={amount} onChange={setAmount} suffix="per card" />
        </div>

        <div className="gs-cta-actions">
          <button
            type="button"
            className="gs-cta-btn"
            disabled={c.busy}
            onClick={() => void sendSelf(GS_CARDS.map((x) => x.id), "Sent all")}
          >
            <GsIcon name="sendCards" className="size-5" />
            <span>Send all {GS_CARDS.length}</span>
            <span className="gs-cta-btn-meta">×{amt}</span>
          </button>
        </div>

        <div className="gs-setgrid">
          {GS_CARD_SETS.map((setId, i) => (
            <SetButton
              key={setId}
              index={i}
              owned={owned.get(setId) ?? 0}
              total={10}
              busy={c.busy}
              label={setId}
              onClick={() => void sendSelf(SET_IDS[i], `Sent set ${i + 1}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
