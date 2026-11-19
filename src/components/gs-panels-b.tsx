import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  gsAcceptReceivedCards,
  gsBuyPurchases,
  gsClearGiftingInbox,
  gsGrantCards,
  gsListChapters,
  gsListPurchases,
  gsListSeasons,
  gsMarkCardsSeen,
  gsPlanCardSend,
  gsReadCards,
  gsReadStages,
  gsSendCardsToSelf,
  gsSetAllStages,
  gsSetAllStock,
  gsSetCardNew,
  gsSetCardStock,
  gsSetEventActive,
  gsSetGoldPass,
  gsSetGrandCollection,
  gsSetPackCount,
  gsSetPackStreak,
  gsSetScore,
  gsSetStage,
  gsWriteChapter,
  gsWriteChapters,
  gsWritePurchases,
} from "@/lib/gs-api";
import {
  GS_CARD_PACKS,
  GS_CARD_SETS,
  GS_CARDS,
} from "@/lib/server/gardenscapes/catalogs";
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Bar, Chip, Field, GsIcon, Grid, Panel, Tile, Toggle } from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group B — Seasons, Decor, Cards, Send Cards.
// ---------------------------------------------------------------------------

const SET_TONES = [
  "#7C3AED", "#F59E0B", "#38BDF8", "#E879F9", "#34D399",
  "#A78BFA", "#F472B6", "#FACC15", "#22D3EE", "#4ADE80",
  "#FB7185", "#818CF8", "#FDBA74", "#2DD4BF", "#C084FC",
];

// === Seasons ===============================================================

interface SeasonInfo {
  key: string;
  goldPassBought: number;
  score: number;
  scoreTotal: number;
  freeCollected: number;
  goldCollected: number;
  stages: number;
}
interface StageRow {
  index: number;
  collected: boolean;
  state: string;
}

export function GsSeasons() {
  const c = useGs();
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [sel, setSel] = useState("");
  const [free, setFree] = useState<StageRow[]>([]);
  const [gold, setGold] = useState<StageRow[]>([]);
  const [score, setScore] = useState("");
  const [total, setTotal] = useState("");

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsListSeasons({ data: sessOf(c) }));
    if (!r) return;
    const list = r as SeasonInfo[];
    setSeasons(list);
    const first = list.find((x) => x.key === sel) ?? list[0];
    if (first) {
      setSel(first.key);
      setScore(String(first.score));
      setTotal(String(first.scoreTotal));
      await loadStages(first.key);
    }
  };

  const loadStages = async (season: string) => {
    if (!c.sessionId || !season) return;
    const [f, g] = await Promise.all([
      c.act(() => gsReadStages({ data: { ...sessOf(c), season, track: "free" } })),
      c.act(() => gsReadStages({ data: { ...sessOf(c), season, track: "gold" } })),
    ]);
    if (f) setFree(f as StageRow[]);
    if (g) setGold(g as StageRow[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const season = seasons.find((x) => x.key === sel);

  const act2 = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  return (
    <div className="gs-stack">
      <Bar
        hint="Golden pass, season score and every reward stage on both roads."
        extra={
          <Button size="sm" onClick={() => void load()} disabled={c.busy}>
            <GsIcon name="refresh" className="size-4" /> Refresh
          </Button>
        }
      />

      <Panel title="Seasons" icon="infinite" hint="Only seasons the save already holds — a season is never created.">
        <Grid cols="wide">
          {seasons.map((s) => (
            <Tile
              key={s.key}
              label={s.key}
              sub={`${s.score}/${s.scoreTotal} · ${s.stages} stages`}
              glyph={s.goldPassBought ? "👑" : "🎟"}
              owned={!!s.goldPassBought}
              selected={sel === s.key}
              onClick={() => {
                setSel(s.key);
                setScore(String(s.score));
                setTotal(String(s.scoreTotal));
                void loadStages(s.key);
              }}
            />
          ))}
        </Grid>
        {!seasons.length ? <p className="gs-empty">This save holds no season.</p> : null}
      </Panel>

      {season ? (
        <>
          <Panel
            title={`${season.key} · pass`}
            icon="crown"
            actions={
              <Toggle
                on={!!season.goldPassBought}
                disabled={c.busy}
                onClick={() => void act2(() => gsSetGoldPass({ data: { ...sessOf(c), season: season.key, bought: !season.goldPassBought } }), "Golden pass")}
              >
                {season.goldPassBought ? "Gold pass owned" : "Buy gold pass"}
              </Toggle>
            }
          >
            <div className="gs-pair">
              <Field label="Score" value={score} onChange={setScore} />
              <Field label="Total" value={total} onChange={setTotal} />
              <Button
                size="sm"
                variant="outline"
                disabled={c.busy}
                onClick={() =>
                  void act2(
                    () =>
                      gsSetScore({
                        data: {
                          ...sessOf(c),
                          season: season.key,
                          current: Math.max(0, Math.floor(Number(score) || 0)),
                          total: total ? Math.max(0, Math.floor(Number(total) || 0)) : undefined,
                        },
                      }),
                    "Season score",
                  )
                }
              >
                Set score
              </Button>
            </div>
            <div className="gs-chips">
              <Chip tone="ok" icon="check">{season.freeCollected} free claimed</Chip>
              <Chip tone="gold" icon="crown">{season.goldCollected} gold claimed</Chip>
            </div>
          </Panel>

          <Panel title="Reward stages" icon="star" hint="Click a stage to claim or unclaim it, or sweep a whole road.">
            <div className="gs-actions">
              <Button size="sm" variant="success" disabled={c.busy}
                onClick={() => void act2(() => gsSetAllStages({ data: { ...sessOf(c), season: season.key, track: "both", collected: true } }), "All stages")}>
                Claim all
              </Button>
              <Button size="sm" variant="ghost" disabled={c.busy}
                onClick={() => void act2(() => gsSetAllStages({ data: { ...sessOf(c), season: season.key, track: "both", collected: false } }), "All stages")}>
                Unclaim all
              </Button>
              <Button size="sm" variant="outline" disabled={c.busy}
                onClick={() => void act2(() => gsSetAllStages({ data: { ...sessOf(c), season: season.key, track: "gold", collected: true } }), "Gold road")}>
                Claim gold road
              </Button>
            </div>

            <div className="gs-road">
              <p className="kicker">Free road</p>
              <div className="gs-stages">
                {free.map((st) => (
                  <button
                    key={st.index}
                    type="button"
                    className={cn("gs-stage", st.collected && "gs-stage--on")}
                    title={`stage ${st.index} · ${st.state}`}
                    disabled={c.busy}
                    onClick={() =>
                      void act2(
                        () => gsSetStage({ data: { ...sessOf(c), season: season.key, track: "free", index: st.index, collected: !st.collected } }),
                        "Stage",
                      )
                    }
                  >
                    {st.index + 1}
                  </button>
                ))}
                {!free.length ? <span className="gs-empty">none</span> : null}
              </div>
            </div>

            <div className="gs-road">
              <p className="kicker">Gold road</p>
              <div className="gs-stages">
                {gold.map((st) => (
                  <button
                    key={st.index}
                    type="button"
                    className={cn("gs-stage gs-stage--gold", st.collected && "gs-stage--on")}
                    title={`stage ${st.index} · ${st.state}`}
                    disabled={c.busy}
                    onClick={() =>
                      void act2(
                        () => gsSetStage({ data: { ...sessOf(c), season: season.key, track: "gold", index: st.index, collected: !st.collected } }),
                        "Stage",
                      )
                    }
                  >
                    {st.index + 1}
                  </button>
                ))}
                {!gold.length ? <span className="gs-empty">none</span> : null}
              </div>
            </div>
          </Panel>
        </>
      ) : null}
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
  const [open, setOpen] = useState<string | null>(null);

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

  const shown = chapters;
  const bought = purchases.filter((p) => p.isBuy).length;

  const act2 = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  return (
    <div className="gs-stack">
      <Bar
        hint="Garden chapters and their repair / decor purchases. Opened opens a chapter, completed finishes it."
        onAll={() => void act2(() => gsWriteChapters({ data: { ...sessOf(c), keys: chapters.map((x) => x.key), completed: true } }), "All chapters")}
        onClear={() => void act2(() => gsWriteChapters({ data: { ...sessOf(c), keys: chapters.map((x) => x.key), completed: false, opened: true } }), "All chapters")}
        allLabel="Complete all"
        clearLabel="Reopen all"
        extra={
          <Button size="sm" onClick={() => void load()} disabled={c.busy}>
            <GsIcon name="refresh" className="size-4" /> Refresh
          </Button>
        }
      />

      <Grid cols="wide">
        <div className="gs-stat" data-tone="1">
          <span className="gs-stat-head"><GsIcon name="decosets" className="size-4" /><span className="kicker">Chapters</span></span>
          <span className="gs-stat-value">{chapters.filter((x) => x.completed).length} / {chapters.length}</span>
          <span className="gs-stat-sub">completed</span>
        </div>
        <div className="gs-stat" data-tone="5">
          <span className="gs-stat-head"><GsIcon name="check" className="size-4" /><span className="kicker">Purchases</span></span>
          <span className="gs-stat-value">{bought} / {purchases.length}</span>
          <span className="gs-stat-sub">bought</span>
        </div>
        <div className="gs-stat" data-tone="3">
          <span className="gs-stat-head"><GsIcon name="layers" className="size-4" /><span className="kicker">Decor items</span></span>
          <span className="gs-stat-value">{chapters.reduce((n, x) => n + x.items.length, 0)}</span>
          <span className="gs-stat-sub">across all chapters</span>
        </div>
      </Grid>

      <Panel title="Buy every purchase" icon="cart" hint="One click marks every purchase row the save holds as bought.">
        <div className="gs-actions">
          <Button size="sm" variant="success" disabled={c.busy || !purchases.length}
            onClick={() => void act2(() => gsBuyPurchases({ data: sessOf(c) }), "Purchases")}>
            Buy all
          </Button>
          <Button size="sm" variant="ghost" disabled={c.busy || !purchases.length}
            onClick={() =>
              void act2(
                () => gsWritePurchasesSafe(c, purchases.map((p) => p.key)),
                "Purchases",
              )
            }>
            Unbuy all
          </Button>
        </div>
      </Panel>

      <Panel title="Chapters" icon="quests">
        <div className="gs-list">
          {shown.map((ch) => (
            <div key={ch.key} className="gs-row">
              <button type="button" className="gs-row-main" onClick={() => setOpen(open === ch.key ? null : ch.key)}>
                <GsIcon name={open === ch.key ? "minus" : "plus"} className="size-4" />
                <span className="gs-row-title">{ch.key}</span>
                <span className="gs-row-meta">{ch.items.length} items</span>
                {ch.opened ? <Chip tone="info">opened</Chip> : null}
                {ch.completed ? <Chip tone="ok" icon="check">done</Chip> : <Chip tone="warn">in progress</Chip>}
              </button>
              <div className="gs-row-tools">
                <Toggle on={ch.completed} disabled={c.busy}
                  onClick={() => void act2(() => gsWriteChapter({ data: { ...sessOf(c), key: ch.key, completed: !ch.completed } }), ch.key)}>
                  Completed
                </Toggle>
                <Toggle on={ch.opened} disabled={c.busy}
                  onClick={() => void act2(() => gsWriteChapter({ data: { ...sessOf(c), key: ch.key, opened: !ch.opened } }), ch.key)}>
                  Opened
                </Toggle>
              </div>
              {open === ch.key ? (
                <div className="gs-row-body">
                  {ch.items.map((it) => (
                    <div key={it.name} className="gs-item">
                      <span className="gs-item-name">{it.name}</span>
                      <span className="gs-item-meta">step {it.step}{it.baseStep ? ` · base ${it.baseStep}` : ""}</span>
                    </div>
                  ))}
                  {!ch.items.length ? <p className="gs-empty">No items recorded.</p> : null}
                </div>
              ) : null}
            </div>
          ))}
          {!shown.length ? <p className="gs-empty">No chapter matches.</p> : null}
        </div>
      </Panel>
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

/**
 * The shared 150-card grid. `mode="pick"` ticks ids for a batch op or a send
 * plan; `mode="edit"` selects one card for a single-stock write.
 */
export function CardGrid({
  info,
  mode,
  sel,
  onToggle,
  onAll,
  onNone,
  showStock = true,
}: {
  info: CardsInfo | null;
  mode: "pick" | "edit";
  sel: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
  showStock?: boolean;
}) {
  const [set, setSet] = useState("");
  const rows = info?.catalog ?? [];

  const shown = set ? rows.filter((r) => r.setId === set) : rows;

  return (
    <>
      <div className="gs-setbar">
        <div className="gs-settabs">
          <button type="button" className={cn("gs-settab", !set && "on")} onClick={() => setSet("")}>All</button>
          {GS_CARD_SETS.map((id, i) => (
            <button
              key={id}
              type="button"
              className={cn("gs-settab", set === id && "on")}
              style={set === id ? { background: SET_TONES[i % SET_TONES.length] } : undefined}
              onClick={() => setSet(id)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="gs-settools">
          <Button size="sm" variant="outline" onClick={onAll}>Select set</Button>
          <Button size="sm" variant="ghost" onClick={onNone}>Clear</Button>
        </div>
      </div>

      <div className="gs-cards">
        {shown.map((r) => {
          const on = sel.has(r.cardId);
          return (
            <button
              key={r.cardId}
              type="button"
              className={cn("gs-card", r.owned && "gs-card--owned", on && "gs-card--on", mode === "edit" && on && "gs-card--edit")}
              aria-pressed={on}
              title={`${r.cardId} · set ${r.setId} · ${r.inStockCount} in stock`}
              onClick={() => onToggle(r.cardId)}
            >
              <span className="gs-card-no">{r.number}</span>
              <span className="gs-card-state">
                {r.owned ? (showStock ? `×${r.inStockCount}` : "owned") : "—"}
              </span>
              {r.isNew && r.owned ? <span className="gs-card-new" aria-hidden="true">•</span> : null}
            </button>
          );
        })}
      </div>
      {!shown.length ? <p className="gs-empty">No cards.</p> : null}
    </>
  );
}

export function GsCards() {
  const c = useGs();
  const [info, setInfo] = useState<CardsInfo | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
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

  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectSet = () => {
    if (!info) return;
    const ids = info.catalog.filter((r) => !sel.has(r.cardId)).map((r) => r.cardId);
    setSel(new Set(ids));
  };

  const allOwned = () => setSel(new Set((info?.catalog ?? []).filter((r) => r.owned).map((r) => r.cardId)));

  const amt = Math.max(1, Math.min(9999, Math.floor(Number(amount) || 1)));
  const stk = Math.max(1, Math.min(9999, Math.floor(Number(stock) || 1)));

  const run = async (fn: () => Promise<unknown>, label: string, clear = false) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    if (clear) setSel(new Set());
    await load();
  };

  const inv = info?.invariants;
  const invOk = inv && inv.totalMatches && inv.setsMatch && inv.uniqueIds && inv.knownIds && inv.rowsWellFormed;

  return (
    <div className="gs-stack">
      <Bar
        hint="150 cards in 15 sets of ten. Grant writes stock and counters together."
        onAll={selectSet}
        onClear={() => setSel(new Set())}
        allLabel="Tick everything"
        clearLabel="Clear"
        extra={
          <>
            <Button size="sm" variant="outline" onClick={allOwned}>Owned only</Button>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={c.busy}>
              <GsIcon name="refresh" className="size-4" /> Refresh
            </Button>
          </>
        }
      />

      <div className="gs-chips">
        <Chip tone={invOk ? "ok" : "warn"} icon={invOk ? "check" : "alert"}>
          {invOk ? "invariants hold" : "invariant drift"}
        </Chip>
        <Chip tone="info" icon="cards">{info?.featureId ?? "—"} · {info?.cards.length ?? 0} rows</Chip>
        <Chip tone="gold" icon="star">total {info?.total ?? 0}</Chip>
        <Chip tone="neutral" icon="infinite">streak {info?.streak ?? 0}</Chip>
        <Chip tone="neutral" icon="sendCards">gifts in {info?.gifting.received.length ?? 0}</Chip>
      </div>

      <Panel
        title="Batch"
        icon="cards"
        hint="Amount is per ticked card. Stock 1–9999."
      >
        <div className="gs-pair">
          <Field label="Grant amount" value={amount} onChange={setAmount} suffix={`× ${sel.size} cards`} />
          <Field label="Set stock" value={stock} onChange={setStock} suffix="each" />
        </div>
        <div className="gs-actions">
          <Button
            size="sm"
            disabled={c.busy || !sel.size}
            onClick={() => void run(() => gsGrantCards({ data: { ...sessOf(c), ids: [...sel], amount: amt } }), "Grant cards")}
          >
            <GsIcon name="plus" className="size-4" /> Grant {sel.size}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy || !sel.size}
            onClick={() => void run(async () => {
              const results: GsEditResult[] = [];
              for (const id of sel) {
                const r = await gsSetCardStock({ data: { ...sessOf(c), cardId: id, stock: stk } });
                results.push(r as GsEditResult);
              }
              return results.reduce(
                (acc, r) => ({ changed: [...acc.changed, ...r.changed], missing: [...acc.missing, ...r.missing] }),
                { changed: [] as string[], missing: [] as string[] },
              );
            }, "Set stock")}
          >
            Set stock
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={c.busy || !sel.size}
            onClick={() => void run(() => gsMarkCardsSeen({ data: { ...sessOf(c), ids: [...sel] } }), "Mark seen", true)}
          >
            <GsIcon name="check" className="size-4" /> Mark seen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={c.busy}
            onClick={() => void run(() => gsSetAllStock({ data: { ...sessOf(c), stock: stk } }), "All stock")}
          >
            Set every stock
          </Button>
        </div>
      </Panel>

      <Panel title="Catalog" icon="cards">
        <CardGrid info={info} mode="pick" sel={sel} onToggle={toggle} onAll={selectSet} onNone={() => setSel(new Set())} />
      </Panel>

      <Panel title="Sets" icon="layers" hint="Collection progress per set of ten.">
        <Grid cols="wide">
          {(info?.sets ?? []).map((s, i) => (
            <div key={s.setId} className="gs-stat" data-tone={String((i % 7) + 1)}>
              <span className="gs-stat-head">
                <span className="gs-dot" style={{ background: SET_TONES[i % SET_TONES.length] }} />
                <span className="kicker">{s.setId}</span>
                {s.complete ? <GsIcon name="star" className="size-3.5 text-amber" /> : null}
              </span>
              <span className="gs-stat-value">{s.owned}/10</span>
              <span className="gs-stat-sub">seen {s.seen} · progress {s.lastSeenProgress}</span>
            </div>
          ))}
        </Grid>
      </Panel>

      <Panel title="Packs" icon="cards" hint="Card pack counts, 0–65535.">
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
          <Button size="sm" variant="outline" disabled={c.busy}
            onClick={() => void run(() => gsSetPackStreak({ data: { ...sessOf(c), value: Math.max(0, Math.floor(Number(packEdits.__streak) || 0)) } }), "Pack streak")}>
            Set streak
          </Button>
          <span className="gs-inline-field">
            <span className="kicker">Streak</span>
            <input className="field field-qty font-mono" value={packEdits.__streak ?? String(info?.streak ?? 0)}
              onChange={(e) => setPackEdits((p) => ({ ...p, __streak: e.target.value }))} />
          </span>
        </div>
      </Panel>

      <Panel title="Feature flags" icon="gear" hint="Event window and the Grand Collection switch.">
        <div className="gs-actions">
          <Toggle on={!!info?.eventActive} disabled={c.busy}
            onClick={() => void run(() => gsSetEventActive({ data: { ...sessOf(c), on: !info?.eventActive } }), "Event")}>
            Event active
          </Toggle>
          <Toggle on={!!info?.grandCollection} disabled={c.busy}
            onClick={() => void run(() => gsSetGrandCollection({ data: { ...sessOf(c), on: !info?.grandCollection } }), "Grand collection")}>
            Grand collection
          </Toggle>
        </div>
        <div className="gs-actions mt-3">
          <Button size="sm" variant="success" disabled={c.busy}
            onClick={() => void run(() => gsAcceptReceivedCards({ data: sessOf(c) }), "Accept gifts")}>
            Accept {info?.gifting.received.length ?? 0} received
          </Button>
          <Button size="sm" variant="ghost" disabled={c.busy}
            onClick={() => void run(() => gsClearGiftingInbox({ data: sessOf(c) }), "Gifting inbox")}>
            Clear gifting inbox
          </Button>
        </div>
        {info?.gifting.received.length ? (
          <div className="gs-list mt-3">
            {info.gifting.received.map((g, i) => (
              <div key={`${g.uniqueGiftingId}-${i}`} className="gs-row">
                <span className="gs-row-main">
                  <GsIcon name="mail" className="size-4" />
                  <span className="gs-row-title">{g.cardId}</span>
                  <span className="gs-row-meta">from {g.senderId}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      {info?.blockers.length ? (
        <Panel title="Blockers" icon="lock" hint="Hold-back switches a set may carry.">
          <div className="gs-list">
            {info.blockers.map((b) => (
              <div key={`${b.featureId}-${b.setId}`} className="gs-row">
                <span className="gs-row-main">
                  <span className="gs-row-title">{b.featureId} · {b.setId}</span>
                  <span className="gs-row-meta">{b.pairs.length} pairs</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

// === Send Cards ===========================================================

interface SendPlan {
  recipients: string[];
  rows: { cardId: string; setId: string; amount: number; owned: boolean }[];
  cardCount: number;
  totalCards: number;
  recipientCap: number;
  ownedCount: number;
  unownedCount: number;
  deliverable: false;
  notice: string;
}

export function GsSendCards() {
  const c = useGs();
  const [info, setInfo] = useState<CardsInfo | null>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("1");
  const [plan, setPlan] = useState<SendPlan | null>(null);

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsReadCards({ data: sessOf(c) }));
    if (r) setInfo(r as CardsInfo);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const recipients = useMemo(
    () =>
      recipientsText
        .split(/[\s,;]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    [recipientsText],
  );
  const bad = recipients.filter((r) => !/^[A-Za-z0-9]{4,32}$/.test(r));

  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const amt = Math.max(1, Math.min(9999, Math.floor(Number(amount) || 1)));

  const buildPlan = async () => {
    if (!recipients.length || !sel.size) {
      toast.error("Add at least one recipient and tick at least one card");
      return;
    }
    if (bad.length) {
      toast.error(`Bad recipient id: ${bad[0]}`);
      return;
    }
    const r = await c.act(() =>
      gsPlanCardSend({ data: { ...sessOf(c), recipients, cardIds: [...sel], amount: amt } }),
    );
    if (r) setPlan(r as SendPlan);
  };

  const receive = async () => {
    if (!sel.size) {
      toast.error("Tick the cards to grant");
      return;
    }
    const r = await c.act(() =>
      gsSendCardsToSelf({ data: { ...sessOf(c), cardIds: [...sel], amount: amt } }),
    );
    c.note(r as GsEditResult | undefined, "Receive into my save");
    setPlan(null);
    await c.reload();
    await load();
  };

  return (
    <div className="gs-stack">
      <Panel
        title="Recipients"
        icon="users"
        hint="One save id per line (4–32 letters/digits). Your plan is checked against your own collection first."
      >
        <textarea
          className="field gs-textarea font-mono"
          rows={3}
          placeholder={"one save id per line\nAb12Cd34"}
          value={recipientsText}
          onChange={(e) => {
            setRecipientsText(e.target.value);
            setPlan(null);
          }}
        />
        <div className="gs-chips mt-2">
          <Chip tone={recipients.length ? "info" : "neutral"} icon="users">{recipients.length} recipients</Chip>
          {bad.length ? <Chip tone="warn" icon="alert">{bad.length} invalid</Chip> : null}
          <Chip tone="neutral" icon="lock">max {plan?.recipientCap ?? 7} cards each</Chip>
        </div>
      </Panel>

      <Bar
        hint="Tick the cards to send. Quantity is per (recipient × card), 1–9999."
        onAll={() => setSel(new Set((info?.catalog ?? []).filter((r) => r.owned).map((r) => r.cardId)))}
        onClear={() => setSel(new Set())}
        allLabel="All owned"
        clearLabel="Clear"
        extra={<Field label="Amount" value={amount} onChange={setAmount} />}
      />

      <Panel title="Cards" icon="cards">
        <CardGrid
          info={info}
          mode="pick"
          sel={sel}
          onToggle={toggle}
          onAll={() => setSel(new Set((info?.catalog ?? []).filter((r) => r.owned).map((r) => r.cardId)))}
          onNone={() => setSel(new Set())}
        />
      </Panel>

      <div className="gs-actions">
        <Button size="sm" disabled={c.busy || !sel.size || !recipients.length} onClick={() => void buildPlan()}>
          <GsIcon name="sendCards" className="size-4" /> Build plan ({sel.size})
        </Button>
        <Button size="sm" variant="success" disabled={c.busy || !sel.size} onClick={() => void receive()}>
          <GsIcon name="download" className="size-4" /> Receive into my save
        </Button>
      </div>

      {plan ? (
        <Panel title="Plan" icon="info" hint={plan.notice}>
          <div className="gs-chips">
            <Chip tone="info" icon="users">{plan.recipients.length} recipients</Chip>
            <Chip tone="gold" icon="cards">{plan.totalCards} cards total</Chip>
            <Chip tone="ok" icon="check">{plan.ownedCount} owned</Chip>
            {plan.unownedCount ? <Chip tone="warn" icon="alert">{plan.unownedCount} unowned</Chip> : null}
          </div>
          <div className="gs-list mt-3">
            {plan.rows.map((r) => (
              <div key={r.cardId} className="gs-row">
                <span className="gs-row-main">
                  <GsIcon name={r.owned ? "check" : "minus"} className="size-4" />
                  <span className="gs-row-title">{r.cardId}</span>
                  <span className="gs-row-meta">{r.setId}</span>
                </span>
                <span className="gs-row-meta">×{r.amount} → {plan.recipients.length} recipients</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

// re-exported so gs-app can reuse the tone table for set chips
export { SET_TONES };
