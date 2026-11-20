import { useEffect, useState } from "react";
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
  gsReadCards,
  gsSendCardsToSelf,
  gsSetAllStages,
  gsSetAllStock,
  gsSetGoldPass,
  gsSetPackCount,
  gsSetPackStreak,
  gsSetScore,
  gsWriteChapter,
  gsWriteChapters,
  gsWritePurchases,
} from "@/lib/gs-api";
import { GS_CARD_PACKS, GS_CARDS } from "@/lib/server/gardenscapes/catalogs";
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Bar, Chip, Field, GsIcon, Grid, Panel, Toggle } from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group B — Seasons, Decor, Cards, Send Cards.
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

  /** One press: gold pass on, score maxed, every reward on both roads. */
  const push = async () => {
    if (!seasons.length) return;
    const r = await c.act(async () => {
      let last: unknown;
      for (const s of seasons) {
        const top = Math.max(s.scoreTotal, s.score);
        last = await gsSetGoldPass({ data: { ...sessOf(c), season: s.key, bought: true } });
        last = await gsSetScore({ data: { ...sessOf(c), season: s.key, current: top, total: top } });
        last = await gsSetAllStages({ data: { ...sessOf(c), season: s.key, track: "both", collected: true } });
      }
      return last;
    });
    c.note(r as GsEditResult | undefined, "Garden Pass");
    await load();
  };

  const stages = seasons.reduce((n, s) => n + s.stages, 0);
  const gold = seasons.filter((s) => s.goldPassBought).length;

  return (
    <div className="gs-stack">
      <section className="gs-gp-card panel">
        <header className="gs-gp-head">
          <span className="gs-gp-emblem" aria-hidden="true">
            <GsIcon name="crown" className="size-7" />
          </span>
          <div>
            <h3 className="gs-gp-title">Garden Pass</h3>
            <p className="gs-gp-lead">Gold pass · max score · every reward claimed</p>
          </div>
        </header>

        <div className="gs-chips">
          <Chip tone="info" icon="infinite">
            {seasons.length} season{seasons.length === 1 ? "" : "s"}
          </Chip>
          <Chip tone="gold" icon="star">
            {stages} stages
          </Chip>
          <Chip tone={gold ? "ok" : "neutral"} icon="check">
            {gold} gold
          </Chip>
        </div>

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
            <span className="gs-gp-btn-sub">One click, every season the save holds</span>
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

      <Panel title="Buy every purchase" icon="cart">
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

/** The full 150-card grid. Each cell is a button. */
function CardCells({
  info,
  busy,
  onPick,
}: {
  info: CardsInfo | null;
  busy: boolean;
  onPick: (id: string) => void;
}) {
  const owned = new Map((info?.cards ?? []).map((r) => [r.cardId, r]));
  return (
    <div className="gs-cards">
      {GS_CARDS.map((card) => {
        const row = owned.get(card.id);
        return (
          <button
            key={card.id}
            type="button"
            className={cn("gs-card", row && "gs-card--owned")}
            title={`${card.id} · set ${card.setId} · ${row?.inStockCount ?? 0} in stock`}
            disabled={busy}
            onClick={() => onPick(card.id)}
          >
            <span className="gs-card-no">{card.number}</span>
            <span className="gs-card-state">{row ? `×${row.inStockCount}` : "—"}</span>
            {row?.isNew ? <span className="gs-card-new" aria-hidden="true">•</span> : null}
          </button>
        );
      })}
    </div>
  );
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

  const run = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  return (
    <div className="gs-stack">
      <div className="gs-chips">
        <Chip tone="info" icon="cards">
          {info?.featureId ?? "—"} · {info?.cards.length ?? 0} / {GS_CARDS.length}
        </Chip>
        <Chip tone="gold" icon="star">
          total {info?.total ?? 0}
        </Chip>
        <Chip tone={info?.eventActive ? "ok" : "neutral"} icon="infinite">
          {info?.eventActive ? "event live" : "event idle"}
        </Chip>
      </div>

      <Panel title="Collection" icon="cards">
        <div className="gs-pair">
          <Field label="Amount" value={amount} onChange={setAmount} suffix="per card" />
          <Field label="Stock" value={stock} onChange={setStock} suffix="each" />
        </div>
        <div className="gs-actions mt-3">
          <Button
            size="sm"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsGrantCards({ data: { ...sessOf(c), ids: GS_CARDS.map((x) => x.id), amount: amt } }),
                "All cards",
              )
            }
          >
            <GsIcon name="plus" className="size-4" /> Fill all 150 ×{amt}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() => void run(() => gsSetAllStock({ data: { ...sessOf(c), stock: stk } }), "All stock")}
          >
            Set every stock
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={c.busy}
            onClick={() => void run(() => gsMarkCardsSeen({ data: sessOf(c) }), "Mark seen")}
          >
            <GsIcon name="check" className="size-4" /> Mark seen
          </Button>
        </div>
        <CardCells
          info={info}
          busy={c.busy}
          onPick={(id) => void run(() => gsGrantCards({ data: { ...sessOf(c), ids: [id], amount: amt } }), id)}
        />
      </Panel>

      <Panel title="Sets" icon="layers">
        <Grid cols="wide">
          {(info?.sets ?? []).map((s, i) => (
            <div key={s.setId} className="gs-stat" data-tone={String((i % 7) + 1)}>
              <span className="gs-stat-head">
                <span className="gs-dot" style={{ background: SET_TONES[i % SET_TONES.length] }} />
                <span className="kicker">{s.setId}</span>
                {s.complete ? <GsIcon name="star" className="size-3.5 text-amber" /> : null}
              </span>
              <span className="gs-stat-value">{s.owned}/10</span>
            </div>
          ))}
        </Grid>
      </Panel>

      <Panel title="Packs" icon="cards">
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

      <Panel title="Gifts" icon="mail">
        <div className="gs-chips">
          <Chip tone={info?.gifting.received.length ? "gold" : "neutral"} icon="mail">
            {info?.gifting.received.length ?? 0} received
          </Chip>
        </div>
        <div className="gs-actions mt-3">
          <Button
            size="sm"
            variant="success"
            disabled={c.busy || !(info?.gifting.received.length ?? 0)}
            onClick={() => void run(() => gsAcceptReceivedCards({ data: sessOf(c) }), "Accept gifts")}
          >
            Accept all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={c.busy}
            onClick={() => void run(() => gsClearGiftingInbox({ data: sessOf(c) }), "Clear inbox")}
          >
            Clear inbox
          </Button>
        </div>
      </Panel>
    </div>
  );
}

// === Send Cards ===========================================================

/**
 * Delivery happens inside the save: the reference editors relay friend sends
 * through their own licensed backend, and a Gardenscapes save holds no friend
 * roster to write into. What this tab therefore does — and what is proven to
 * land in game — is put the ticked cards straight into this save's collection,
 * one button per card, in the chosen amount.
 */
export function GsSendCards() {
  const c = useGs();
  const [info, setInfo] = useState<CardsInfo | null>(null);
  const [amount, setAmount] = useState("1");

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsReadCards({ data: sessOf(c) }));
    if (r) setInfo(r as CardsInfo);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  const amt = Math.max(1, Math.min(9999, Math.floor(Number(amount) || 1)));

  const send = async (ids: string[]) => {
    const r = await c.act(() => gsSendCardsToSelf({ data: { ...sessOf(c), cardIds: ids, amount: amt } }));
    c.note(r as GsEditResult | undefined, "Cards delivered");
    await load();
  };

  return (
    <div className="gs-stack">
      <Panel
        title="Send cards"
        icon="sendCards"
        actions={
          <Button
            size="sm"
            disabled={c.busy}
            onClick={() => void send(GS_CARDS.map((x) => x.id))}
          >
            <GsIcon name="sendCards" className="size-4" /> Send all ×{amt}
          </Button>
        }
      >
        <div className="gs-pair">
          <Field label="Amount" value={amount} onChange={setAmount} suffix="per card" />
        </div>
        <div className="gs-chips mt-2">
          <Chip tone="info" icon="cards">
            {info?.cards.length ?? 0} owned · {GS_CARDS.length} cards
          </Chip>
          <Chip tone="ok" icon="check">
            delivered to this save
          </Chip>
        </div>
        <CardCells info={info} busy={c.busy} onPick={(id) => void send([id])} />
      </Panel>
    </div>
  );
}

export { SET_TONES };
