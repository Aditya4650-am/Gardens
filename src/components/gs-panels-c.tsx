import { useEffect, useMemo, useState } from "react";
import {
  gsProfileCatalogs,
  gsReadProfile,
  gsUnlockAvatarStyles,
  gsUnlockBadges,
  gsUnlockFrames,
  gsUnlockNameStyles,
  gsUnlockTitles,
  gsUnlockAvatars,
  gsWearAvatar,
  gsWearAvatarStyle,
  gsWearBadgeById,
  gsWearFrame,
  gsWearNameStyle,
  gsWearTitle,
} from "@/lib/gs-api";
import {
  GS_AVATARS,
  GS_AVATAR_STYLES,
  GS_BADGES,
  GS_FRAMES,
  GS_FRAMES_ACTIVATABLE,
  GS_STYLES,
  GS_TITLES,
  type GsCatalogEntry,
} from "@/lib/server/gardenscapes/catalogs";
import { cn } from "@/lib/utils";
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Chip, GsIcon, Grid, Panel, Tile } from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group C — Avatars, Frames, Styles, Badges, Titles.
//
// Frames / Styles / Badges / Titles are three-across button grids: tick the
// items you want (a gold ring marks the tick), then one Apply press unlocks
// them — and wears the item when exactly one is ticked. "Select all" is the
// same grid, ticked.
// ---------------------------------------------------------------------------

interface OwnedBadge {
  cipher: string;
  id: string;
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

function useProfile() {
  const c = useGs();
  const [p, setP] = useState<ProfileInfo | null>(null);

  const load = async () => {
    if (!c.sessionId) return;
    const r = await c.act(() => gsReadProfile({ data: sessOf(c) }));
    if (r) setP(r as ProfileInfo);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sessionId]);

  useEffect(() => {
    if (!c.token) return;
    void c.act(() => gsProfileCatalogs({ data: { token: c.token } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.token]);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  const runSeq = async (fns: Array<() => Promise<unknown>>, label: string) => {
    let last: unknown;
    await c.act(async () => {
      for (const fn of fns) last = await fn();
      return last;
    });
    c.note(last as GsEditResult | undefined, label);
    await load();
  };

  return { c, p, load, run, runSeq };
}

// --- shared three-across picker ------------------------------------------

type Kind = "frames" | "styles" | "badges" | "titles" | "avatar-styles";

/** Every cosmetic icon lives at `/icons/<kind>/<id>.png` once supplied. */
function artFor(kind: Kind, id: string): string {
  return `/icons/${kind}/${id}.png`;
}

function PickGrid({
  kind,
  items,
  sel,
  owned,
  worn,
  busy,
  onToggle,
}: {
  kind: Kind;
  items: GsCatalogEntry[];
  sel: Set<string>;
  owned: (id: string) => boolean;
  worn: (id: string) => boolean;
  busy: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="gs-pick3">
      {items.map((e) => {
        const on = sel.has(e.id);
        const isWorn = worn(e.id);
        const isOwned = owned(e.id);
        return (
          <button
            key={e.id}
            type="button"
            className={cn("gs-pick3-btn", on && "is-sel", isWorn && "is-worn", isOwned && "is-owned")}
            aria-pressed={on}
            disabled={busy}
            onClick={() => onToggle(e.id)}
            title={`${e.label} — ${isWorn ? "worn" : isOwned ? "owned" : "locked"}`}
          >
            <span className="gs-pick3-icon" style={e.color ? { background: e.color } : undefined}>
              <img
                src={artFor(kind, e.id)}
                alt=""
                loading="lazy"
                draggable={false}
                onError={(ev) => {
                  const img = ev.currentTarget;
                  img.style.display = "none";
                  const sib = img.nextElementSibling as HTMLElement | null;
                  if (sib) sib.style.display = "";
                }}
              />
              <span aria-hidden style={{ display: "none" }}>
                {e.emoji ?? e.label.slice(0, 1).toUpperCase()}
              </span>
            </span>
            <span className="gs-pick3-body">
              <span className="gs-pick3-label">{e.label}</span>
              <span className="gs-pick3-sub">
                {isWorn ? "Worn" : isOwned ? "Owned" : "Locked"}
              </span>
            </span>
            <span className={cn("gs-pick3-tick", on && "on")} aria-hidden="true">
              {on ? <GsIcon name="check" className="size-3.5" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PickBar({
  count,
  total,
  busy,
  onAll,
  onClear,
  onApply,
}: {
  count: number;
  total: number;
  busy: boolean;
  onAll: () => void;
  onClear: () => void;
  onApply: () => void;
}) {
  return (
    <div className="gs-pickbar">
      <button type="button" className="gs-pickbar-btn" disabled={busy} onClick={onAll}>
        <GsIcon name="check" className="size-4" />
        Select all
      </button>
      <button type="button" className="gs-pickbar-btn gs-pickbar-btn--ghost" disabled={busy || count === 0} onClick={onClear}>
        Clear
      </button>
      <button
        type="button"
        className="gs-pickbar-btn gs-pickbar-btn--go"
        disabled={busy || count === 0}
        onClick={onApply}
      >
        <GsIcon name="spark" className="size-4" />
        {count > 0 ? `Apply ${count}` : `Apply`}
      </button>
      <span className="gs-pickbar-count tabular-nums">
        {count} / {total}
      </span>
    </div>
  );
}

// === Avatars ==============================================================

export function GsAvatars() {
  const { c, p, run } = useProfile();

  const owned = useMemo(() => {
    const s = new Set(p?.avatarsShown ?? []);
    if (p?.currentAvatarId) s.add(p.currentAvatarId);
    return s;
  }, [p]);

  return (
    <div className="gs-stack">
      <Panel
        title="Avatars"
        icon="avatars"
        actions={
          <button
            type="button"
            className="gs-pickbar-btn"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsUnlockAvatars({ data: { ...sessOf(c), ids: GS_AVATARS.map((a) => a.id) } }),
                "All avatars",
              )
            }
          >
            Unlock all
          </button>
        }
      >
        <div className="gs-chips">
          <Chip tone="ok" icon="check">
            {owned.size} / {GS_AVATARS.length}
          </Chip>
          <Chip tone="gold" icon="user">
            {p?.currentAvatarId || "—"}
          </Chip>
        </div>
        <Grid cols="narrow">
          {GS_AVATARS.map((a) => (
            <Tile
              key={a.id}
              label={a.label}
              sub={p?.currentAvatarId === a.id ? "Worn" : owned.has(a.id) ? "Owned" : "Unlock"}
              glyph={a.emoji ?? a.label.slice(0, 1).toUpperCase()}
              art={a.art}
              owned={owned.has(a.id)}
              worn={p?.currentAvatarId === a.id}
              disabled={c.busy}
              onClick={() => void run(() => gsWearAvatar({ data: { ...sessOf(c), id: a.id } }), a.label)}
            />
          ))}
        </Grid>
      </Panel>
    </div>
  );
}

// === Frames ===============================================================

export function GsFrames() {
  const { c, p, runSeq } = useProfile();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const all = useMemo(() => [...GS_FRAMES, ...GS_FRAMES_ACTIVATABLE], []);
  const owned = useMemo(() => new Set(p?.framesOwned ?? []), [p]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const apply = () => {
    const ids = [...sel];
    if (!ids.length) return;
    const fns: Array<() => Promise<unknown>> = [
      () => gsUnlockFrames({ data: { ...sessOf(c), ids } }),
    ];
    if (ids.length === 1) fns.push(() => gsWearFrame({ data: { ...sessOf(c), id: ids[0] } }));
    void runSeq(fns, ids.length === 1 ? ids[0] : `${ids.length} frames`);
    setSel(new Set());
  };

  return (
    <div className="gs-stack">
      <Panel title="Frames" icon="frames">
        <div className="gs-chips">
          <Chip tone="ok" icon="check">
            {owned.size} / {all.length}
          </Chip>
          <Chip tone="gold" icon="frames">
            {p?.wornAvatarStyle || "—"}
          </Chip>
        </div>
        <PickBar
          count={sel.size}
          total={all.length}
          busy={c.busy}
          onAll={() => setSel(new Set(all.map((f) => f.id)))}
          onClear={() => setSel(new Set())}
          onApply={apply}
        />
        <PickGrid
          kind="frames"
          items={all}
          sel={sel}
          owned={(id) => owned.has(id)}
          worn={(id) => p?.wornAvatarStyle === id}
          busy={c.busy}
          onToggle={toggle}
        />
      </Panel>
    </div>
  );
}

// === Styles ==============================================================

export function GsStyles() {
  const { c, p, runSeq } = useProfile();
  const [nameSel, setNameSel] = useState<Set<string>>(new Set());
  const [avSel, setAvSel] = useState<Set<string>>(new Set());

  const nameOwned = useMemo(() => new Set(p?.nameStylesShown ?? []), [p]);
  const avatarOwned = useMemo(() => new Set(p?.avatarStylesShown ?? []), [p]);

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  const applyName = () => {
    const ids = [...nameSel];
    if (!ids.length) return;
    const fns: Array<() => Promise<unknown>> = [
      () => gsUnlockNameStyles({ data: { ...sessOf(c), styles: ids } }),
    ];
    if (ids.length === 1) fns.push(() => gsWearNameStyle({ data: { ...sessOf(c), style: ids[0] } }));
    void runSeq(fns, ids.length === 1 ? ids[0] : `${ids.length} name styles`);
    setNameSel(new Set());
  };

  const applyAvatar = () => {
    const ids = [...avSel];
    if (!ids.length) return;
    const fns: Array<() => Promise<unknown>> = [
      () => gsUnlockAvatarStyles({ data: { ...sessOf(c), styles: ids } }),
    ];
    if (ids.length === 1) fns.push(() => gsWearAvatarStyle({ data: { ...sessOf(c), style: ids[0] } }));
    void runSeq(fns, ids.length === 1 ? ids[0] : `${ids.length} avatar styles`);
    setAvSel(new Set());
  };

  return (
    <div className="gs-stack">
      <Panel title="Name styles" icon="styles">
        <div className="gs-chips">
          <Chip tone="ok" icon="check">
            {nameOwned.size} / {GS_STYLES.length}
          </Chip>
          <Chip tone="gold" icon="styles">
            {p?.wornNameStyle || "—"}
          </Chip>
        </div>
        <PickBar
          count={nameSel.size}
          total={GS_STYLES.length}
          busy={c.busy}
          onAll={() => setNameSel(new Set(GS_STYLES.map((s) => s.id)))}
          onClear={() => setNameSel(new Set())}
          onApply={applyName}
        />
        <PickGrid
          kind="styles"
          items={GS_STYLES}
          sel={nameSel}
          owned={(id) => nameOwned.has(id)}
          worn={(id) => p?.wornNameStyle === id}
          busy={c.busy}
          onToggle={(id) => setNameSel((s) => toggle(s, id))}
        />
      </Panel>

      <Panel title="Avatar styles" icon="user">
        <div className="gs-chips">
          <Chip tone="ok" icon="check">
            {avatarOwned.size} / {GS_AVATAR_STYLES.length}
          </Chip>
          <Chip tone="gold" icon="user">
            {p?.wornAvatarStyle || "—"}
          </Chip>
        </div>
        <PickBar
          count={avSel.size}
          total={GS_AVATAR_STYLES.length}
          busy={c.busy}
          onAll={() => setAvSel(new Set(GS_AVATAR_STYLES.map((s) => s.id)))}
          onClear={() => setAvSel(new Set())}
          onApply={applyAvatar}
        />
        <PickGrid
          kind="avatar-styles"
          items={GS_AVATAR_STYLES}
          sel={avSel}
          owned={(id) => avatarOwned.has(id)}
          worn={(id) => p?.wornAvatarStyle === id}
          busy={c.busy}
          onToggle={(id) => setAvSel((s) => toggle(s, id))}
        />
      </Panel>
    </div>
  );
}

// === Badges ==============================================================

export function GsBadges() {
  const { c, p, runSeq } = useProfile();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const ownedIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of p?.ownedBadges ?? []) if (b.id) s.add(b.id);
    return s;
  }, [p]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const apply = () => {
    const ids = [...sel];
    if (!ids.length) return;
    const fns: Array<() => Promise<unknown>> = [
      () => gsUnlockBadges({ data: { ...sessOf(c), ids } }),
    ];
    if (ids.length === 1) fns.push(() => gsWearBadgeById({ data: { ...sessOf(c), id: ids[0] } }));
    void runSeq(fns, ids.length === 1 ? ids[0] : `${ids.length} badges`);
    setSel(new Set());
  };

  return (
    <div className="gs-stack">
      <Panel title="Badges" icon="badges">
        <div className="gs-chips">
          <Chip tone="ok" icon="check">
            {ownedIds.size} / {GS_BADGES.length}
          </Chip>
          <Chip tone="gold" icon="crown">
            {p?.wornBadgeId || "—"}
          </Chip>
        </div>
        <PickBar
          count={sel.size}
          total={GS_BADGES.length}
          busy={c.busy}
          onAll={() => setSel(new Set(GS_BADGES.map((b) => b.id)))}
          onClear={() => setSel(new Set())}
          onApply={apply}
        />
        <PickGrid
          kind="badges"
          items={GS_BADGES}
          sel={sel}
          owned={(id) => ownedIds.has(id)}
          worn={(id) => p?.wornBadgeId === id}
          busy={c.busy}
          onToggle={toggle}
        />
      </Panel>
    </div>
  );
}

// === Titles ==============================================================

export function GsTitles() {
  const { c, p, runSeq } = useProfile();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const earned = useMemo(() => new Set(p?.titlesEarned ?? []), [p]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const apply = () => {
    const ids = [...sel];
    if (!ids.length) return;
    const fns: Array<() => Promise<unknown>> = [
      () => gsUnlockTitles({ data: { ...sessOf(c), ids } }),
    ];
    if (ids.length === 1) fns.push(() => gsWearTitle({ data: { ...sessOf(c), titleId: ids[0] } }));
    void runSeq(fns, ids.length === 1 ? ids[0] : `${ids.length} titles`);
    setSel(new Set());
  };

  return (
    <div className="gs-stack">
      <Panel title="Titles" icon="titles">
        <div className="gs-chips">
          <Chip tone="ok" icon="check">
            {earned.size} / {GS_TITLES.length}
          </Chip>
          <Chip tone="gold" icon="titles">
            {p?.wornTitleId || "—"}
          </Chip>
        </div>
        <PickBar
          count={sel.size}
          total={GS_TITLES.length}
          busy={c.busy}
          onAll={() => setSel(new Set(GS_TITLES.map((t) => t.id)))}
          onClear={() => setSel(new Set())}
          onApply={apply}
        />
        <PickGrid
          kind="titles"
          items={GS_TITLES}
          sel={sel}
          owned={(id) => earned.has(id)}
          worn={(id) => p?.wornTitleId === id}
          busy={c.busy}
          onToggle={toggle}
        />
      </Panel>
    </div>
  );
}
