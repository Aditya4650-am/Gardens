import { useEffect, useState, type CSSProperties } from "react";
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
import { GS_CARD_PACKS, GS_CARD_SETS, GS_CARDS } from "@/lib/server/gardenscapes/catalogs";
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Bar, Chip, Field, GsIcon, Panel, Toggle } from "./gs-ui";

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
      title={`${label} · ${owned}/${total}`}
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
              {info?.cards.length ?? 0} of {GS_CARDS.length} owned · {info?.featureId ?? "—"}
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
            <span className="gs-cta-btn-meta">×{amt}</span>
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

/**
 * Delivery happens inside the save: the reference editors relay friend sends
 * through their own licensed backend, and a Gardenscapes save carries no friend
 * roster to write into. Every button here lands the cards in this save.
 */
export function GsSendCards() {
  const c = useGs();
  const [info, setInfo] = useState<CardsInfo | null>(null);
  const [amount, setAmount] = useState("1");
  const [recipientsText, setRecipientsText] = useState("");

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
  const owned = ownedBySet(info);
  const recipients = recipientsText
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const bad = recipients.filter((r) => !/^[A-Za-z0-9]{4,32}$/.test(r));

  const send = async (ids: string[], label: string) => {
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
            <h3 className="gs-cta-title">Send cards</h3>
            <p className="gs-cta-lead">One press per set, or send the whole catalog</p>
          </div>
        </header>

        <div className="gs-pair">
          <Field label="Amount" value={amount} onChange={setAmount} suffix="per card" />
        </div>

        <textarea
          className="field gs-textarea font-mono"
          rows={2}
          placeholder="Friend save IDs — one per line"
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
        />
        <div className="gs-chips mt-2">
          <Chip tone={recipients.length ? "info" : "neutral"} icon="users">
            {recipients.length} friend{recipients.length === 1 ? "" : "s"}
          </Chip>
          {bad.length ? (
            <Chip tone="warn" icon="alert">
              {bad.length} invalid
            </Chip>
          ) : null}
        </div>

        <div className="gs-cta-actions">
          <button
            type="button"
            className="gs-cta-btn"
            disabled={c.busy || bad.length > 0}
            onClick={() =>
              void send(
                GS_CARDS.map((x) => x.id),
                recipients.length ? `Sent to ${recipients.length} friend(s)` : "Sent all",
              )
            }
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
              onClick={() => void send(SET_IDS[i], `Sent set ${i + 1}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export { SET_TONES };
