import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  gsProfileCatalogs,
  gsReadProfile,
  gsUnlockAllBadges,
  gsUnlockAllTitles,
  gsUnlockAvatarStyles,
  gsUnlockAvatars,
  gsUnlockFrames,
  gsUnlockNameStyles,
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
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Chip, GsIcon, Grid, Panel, Tile } from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group C — Avatars, Frames, Styles, Badges, Titles.
//
// Each tab is one professional ENABLE button over a read-only gallery. The
// button mints every unlock the save is missing; pressing *Save & push* in the
// sidebar is what sends it to the device, after which the items show unlocked
// in game. Galleries carry no controls of their own — they only report what
// the save currently holds.
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
  framesShown: string[];
  titlesEarned: string[];
  boughtAvatars: number;
  boughtFrames: number;
  ownedBadges: OwnedBadge[];
}

/** Load the profile + the static id lists every cosmetic tab needs. */
function useProfile() {
  const c = useGs();
  const [p, setP] = useState<ProfileInfo | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [avatars, setAvatars] = useState<string[]>([]);

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
    void c.act(async () => {
      const r = await gsProfileCatalogs({ data: { token: c.token } });
      setFrames(r.frames);
      setAvatars(r.avatars);
      return r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.token]);

  /** Run an edit, toast its result, then re-read the save. */
  const run = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  return { c, p, frames, avatars, load, run };
}

// ---------------------------------------------------------------------------
// The ENABLE hero — one button, one purpose, per tab.
// ---------------------------------------------------------------------------

function EnableHero({
  icon,
  title,
  caption,
  count,
  total,
  ready,
  busy,
  onEnable,
}: {
  icon: string;
  title: string;
  caption: string;
  /** How many the save already holds. */
  count: number;
  /** How many exist in the catalog. */
  total: number;
  /** False when the save already holds everything. */
  ready: boolean;
  busy: boolean;
  onEnable: () => void;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <section className="gs-enable panel">
      <div className="gs-enable-icon" aria-hidden="true">
        <GsIcon name={icon} className="size-7" />
      </div>

      <div className="gs-enable-body">
        <h3 className="gs-enable-title">{title}</h3>
        <p className="gs-enable-caption">{caption}</p>

        <div className="gs-enable-progress">
          <span className="gs-enable-bar">
            <span className="gs-enable-bar-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="gs-enable-count tabular-nums">
            {count} <span className="gs-enable-count-total">/ {total}</span>
          </span>
        </div>
      </div>

      <div className="gs-enable-action">
        <button
          type="button"
          className="gs-enable-btn"
          disabled={busy || !ready}
          onClick={onEnable}
        >
          <GsIcon name={ready ? "lock" : "check"} className="size-5" />
          <span>{ready ? "ENABLE" : "UNLOCKED"}</span>
        </button>
        <p className="gs-enable-hint">
          {ready ? "Then press Save & push" : "Everything is unlocked"}
        </p>
      </div>
    </section>
  );
}

/** A read-only gallery section. Tiles never take clicks. */
function Gallery({
  title,
  icon,
  right,
  entries,
  isOwned,
  isWorn,
}: {
  title: string;
  icon: string;
  right?: ReactNode;
  entries: GsCatalogEntry[];
  isOwned: (id: string) => boolean;
  isWorn?: (id: string) => boolean;
}) {
  return (
    <Panel title={title} icon={icon} actions={right}>
      <Grid cols="narrow">
        {entries.map((e) => (
          <Tile
            key={e.id}
            label={e.label}
            sub={e.grand ? "Grand" : undefined}
            glyph={e.emoji}
            art={e.art}
            color={e.color}
            owned={isOwned(e.id)}
            worn={isWorn ? isWorn(e.id) : undefined}
            disabled
            title={e.label}
          />
        ))}
      </Grid>
    </Panel>
  );
}

// === Avatars ==============================================================

export function GsAvatars() {
  const { c, p, avatars, run } = useProfile();

  const owned = useMemo(() => {
    const s = new Set(p?.avatarsShown ?? []);
    if (p?.currentAvatarId) s.add(p.currentAvatarId);
    return s;
  }, [p]);

  const catalog = useMemo(
    () =>
      GS_AVATARS.map<GsCatalogEntry>((a) => ({
        ...a,
        grand: false,
        emoji: a.emoji ?? a.label.slice(0, 1).toUpperCase(),
      })),
    [],
  );

  return (
    <div className="gs-stack">
      <EnableHero
        icon="avatars"
        title="Unlock every avatar"
        caption="All profile pictures are added to your save in one click."
        count={owned.size}
        total={catalog.length}
        ready={owned.size < catalog.length}
        busy={c.busy}
        onEnable={() =>
          void run(
            () => gsUnlockAvatars({ data: { ...sessOf(c), ids: [...(avatars.length ? avatars : catalog.map((a) => a.id))] } }),
            "All avatars",
          )
        }
      />

      <div className="gs-chips">
        <Chip tone="gold" icon="user">wearing {p?.currentAvatarId || "—"}</Chip>
        <Chip tone="ok" icon="check">{owned.size} unlocked</Chip>
      </div>

      <Gallery
        title="Avatars"
        icon="avatars"
        entries={catalog}
        isOwned={(id) => owned.has(id)}
        isWorn={(id) => p?.currentAvatarId === id}
      />
    </div>
  );
}

// === Frames ===============================================================

export function GsFrames() {
  const { c, p, frames, run } = useProfile();

  const all = useMemo(
    () => [...GS_FRAMES, ...GS_FRAMES_ACTIVATABLE],
    [],
  );
  const owned = useMemo(() => new Set(p?.framesShown ?? []), [p]);

  return (
    <div className="gs-stack">
      <EnableHero
        icon="frames"
        title="Unlock every frame"
        caption="Every profile frame is unlocked on your save in one click."
        count={owned.size}
        total={all.length}
        ready={owned.size < all.length}
        busy={c.busy}
        onEnable={() =>
          void run(
            () => gsUnlockFrames({ data: { ...sessOf(c), ids: frames.length ? frames : all.map((f) => f.id) } }),
            "All frames",
          )
        }
      />

      <div className="gs-chips">
        <Chip tone="ok" icon="check">{owned.size} unlocked</Chip>
        <Chip tone="gold" icon="frames">{all.length} available</Chip>
      </div>

      <Gallery
        title="Frames"
        icon="frames"
        entries={all}
        isOwned={(id) => owned.has(id)}
      />
    </div>
  );
}

// === Styles ==============================================================

export function GsStyles() {
  const { c, p, run } = useProfile();

  const nameOwned = useMemo(() => new Set(p?.nameStylesShown ?? []), [p]);
  const avatarOwned = useMemo(() => new Set(p?.avatarStylesShown ?? []), [p]);
  const total = GS_STYLES.length + GS_AVATAR_STYLES.length;
  const count = nameOwned.size + avatarOwned.size;

  const enable = async () => {
    await run(
      () => gsUnlockNameStyles({ data: { ...sessOf(c), styles: GS_STYLES.map((s) => s.id) } }),
      "All name styles",
    );
    await run(
      () => gsUnlockAvatarStyles({ data: { ...sessOf(c), styles: GS_AVATAR_STYLES.map((s) => s.id) } }),
      "All avatar styles",
    );
  };

  return (
    <div className="gs-stack">
      <EnableHero
        icon="styles"
        title="Unlock every style"
        caption="Name styles and avatar styles are added to your save in one click."
        count={count}
        total={total}
        ready={count < total}
        busy={c.busy}
        onEnable={() => void enable()}
      />

      <div className="gs-chips">
        <Chip tone="gold" icon="styles">name {p?.wornNameStyle || "default"}</Chip>
        <Chip tone="gold" icon="user">avatar {p?.wornAvatarStyle || "default"}</Chip>
        <Chip tone="ok" icon="check">{count} unlocked</Chip>
      </div>

      <Gallery
        title="Name styles"
        icon="styles"
        entries={GS_STYLES}
        isOwned={(id) => nameOwned.has(id)}
        isWorn={(id) => p?.wornNameStyle === id}
      />

      <Gallery
        title="Avatar styles"
        icon="user"
        entries={GS_AVATAR_STYLES}
        isOwned={(id) => avatarOwned.has(id)}
        isWorn={(id) => p?.wornAvatarStyle === id}
      />
    </div>
  );
}

// === Badges ==============================================================

export function GsBadges() {
  const { c, p, run } = useProfile();

  const ownedIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of p?.ownedBadges ?? []) if (b.id) s.add(b.id);
    return s;
  }, [p]);

  return (
    <div className="gs-stack">
      <EnableHero
        icon="badges"
        title="Unlock every badge"
        caption="Every badge in the game is minted onto your save in one click."
        count={ownedIds.size}
        total={GS_BADGES.length}
        ready={ownedIds.size < GS_BADGES.length}
        busy={c.busy}
        onEnable={() => void run(() => gsUnlockAllBadges({ data: sessOf(c) }), "All badges")}
      />

      <div className="gs-chips">
        <Chip tone="gold" icon="crown">{p?.wornBadgeId || "no badge worn"}</Chip>
        <Chip tone="ok" icon="check">{ownedIds.size} unlocked</Chip>
      </div>

      <Gallery
        title="Badges"
        icon="badges"
        entries={GS_BADGES}
        isOwned={(id) => ownedIds.has(id)}
        isWorn={(id) => p?.wornBadgeId === id}
      />
    </div>
  );
}

// === Titles ==============================================================

export function GsTitles() {
  const { c, p, run } = useProfile();

  const earned = useMemo(() => new Set(p?.titlesEarned ?? []), [p]);

  return (
    <div className="gs-stack">
      <EnableHero
        icon="titles"
        title="Unlock every title"
        caption="Every player title is earned on your save in one click."
        count={earned.size}
        total={GS_TITLES.length}
        ready={earned.size < GS_TITLES.length}
        busy={c.busy}
        onEnable={() => void run(() => gsUnlockAllTitles({ data: sessOf(c) }), "All titles")}
      />

      <div className="gs-chips">
        <Chip tone="gold" icon="titles">wearing {p?.wornTitleId || "—"}</Chip>
        <Chip tone="ok" icon="check">{earned.size} unlocked</Chip>
      </div>

      <Gallery
        title="Titles"
        icon="titles"
        entries={GS_TITLES}
        isOwned={(id) => earned.has(id)}
        isWorn={(id) => p?.wornTitleId === id}
      />
    </div>
  );
}
