import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Chip, Grid, Panel, Tile } from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group C — Avatars, Frames, Styles, Badges, Titles.
//
// Every item is its own button, exactly like the reference editor: pressing a
// cell unlocks it (when needed) and puts it on, and the cell then reads "worn".
// A single "All" action in each panel header unlocks the whole set.
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

  /** Run one edit, toast it, then re-read the save. */
  const run = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  /** Run two edits in order (unlock → wear) as one gesture. */
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

/** A compact count strip — numbers only, no prose. */
function Counts({ owned, total, extra }: { owned: number; total: number; extra?: ReactNode }) {
  return (
    <div className="gs-chips">
      <Chip tone="ok" icon="check">
        {owned} / {total}
      </Chip>
      {extra}
    </div>
  );
}

/** One clickable catalog cell. */
function PickTile({
  entry,
  owned,
  worn,
  busy,
  onClick,
  sub,
}: {
  entry: GsCatalogEntry;
  owned: boolean;
  worn?: boolean;
  busy: boolean;
  onClick: () => void;
  sub?: string;
}) {
  return (
    <Tile
      label={entry.label}
      sub={sub ?? (worn ? "Worn" : owned ? "Owned" : "Unlock")}
      glyph={entry.emoji ?? entry.label.slice(0, 1).toUpperCase()}
      art={entry.art}
      color={entry.color}
      owned={owned}
      worn={worn}
      disabled={busy}
      onClick={onClick}
      title={`${entry.label} — ${worn ? "worn" : owned ? "click to wear" : "click to unlock"}`}
    />
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
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsUnlockAvatars({ data: { ...sessOf(c), ids: GS_AVATARS.map((a) => a.id) } }),
                "All avatars",
              )
            }
          >
            Unlock all
          </Button>
        }
      >
        <Counts
          owned={owned.size}
          total={GS_AVATARS.length}
          extra={<Chip tone="gold" icon="user">{p?.currentAvatarId || "—"}</Chip>}
        />
        <Grid cols="narrow">
          {GS_AVATARS.map((a) => (
            <PickTile
              key={a.id}
              entry={a}
              owned={owned.has(a.id)}
              worn={p?.currentAvatarId === a.id}
              busy={c.busy}
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
  const { c, p, run } = useProfile();

  const all = useMemo(() => [...GS_FRAMES, ...GS_FRAMES_ACTIVATABLE], []);
  const owned = useMemo(() => new Set(p?.framesOwned ?? []), [p]);

  return (
    <div className="gs-stack">
      <Panel
        title="Frames"
        icon="frames"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsUnlockFrames({ data: { ...sessOf(c), ids: all.map((f) => f.id) } }),
                "All frames",
              )
            }
          >
            Unlock all
          </Button>
        }
      >
        <Counts
          owned={owned.size}
          total={all.length}
          extra={<Chip tone="gold" icon="frames">{p?.wornAvatarStyle || "—"}</Chip>}
        />
        <Grid cols="narrow">
          {all.map((f) => (
            <PickTile
              key={f.id}
              entry={f}
              owned={owned.has(f.id)}
              worn={p?.wornAvatarStyle === f.id}
              busy={c.busy}
              onClick={() => void run(() => gsWearFrame({ data: { ...sessOf(c), id: f.id } }), f.label)}
            />
          ))}
        </Grid>
      </Panel>
    </div>
  );
}

// === Styles ==============================================================

export function GsStyles() {
  const { c, p, run } = useProfile();

  const nameOwned = useMemo(() => new Set(p?.nameStylesShown ?? []), [p]);
  const avatarOwned = useMemo(() => new Set(p?.avatarStylesShown ?? []), [p]);

  return (
    <div className="gs-stack">
      <Panel
        title="Name styles"
        icon="styles"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsUnlockNameStyles({ data: { ...sessOf(c), styles: GS_STYLES.map((s) => s.id) } }),
                "All name styles",
              )
            }
          >
            Unlock all
          </Button>
        }
      >
        <Counts
          owned={nameOwned.size}
          total={GS_STYLES.length}
          extra={<Chip tone="gold" icon="styles">{p?.wornNameStyle || "—"}</Chip>}
        />
        <Grid cols="narrow">
          {GS_STYLES.map((s) => (
            <PickTile
              key={s.id}
              entry={s}
              owned={nameOwned.has(s.id)}
              worn={p?.wornNameStyle === s.id}
              busy={c.busy}
              onClick={() => void run(() => gsWearNameStyle({ data: { ...sessOf(c), style: s.id } }), s.label)}
            />
          ))}
        </Grid>
      </Panel>

      <Panel
        title="Avatar styles"
        icon="user"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsUnlockAvatarStyles({ data: { ...sessOf(c), styles: GS_AVATAR_STYLES.map((s) => s.id) } }),
                "All avatar styles",
              )
            }
          >
            Unlock all
          </Button>
        }
      >
        <Counts
          owned={avatarOwned.size}
          total={GS_AVATAR_STYLES.length}
          extra={<Chip tone="gold" icon="user">{p?.wornAvatarStyle || "—"}</Chip>}
        />
        <Grid cols="narrow">
          {GS_AVATAR_STYLES.map((s) => (
            <PickTile
              key={s.id}
              entry={s}
              owned={avatarOwned.has(s.id)}
              worn={p?.wornAvatarStyle === s.id}
              busy={c.busy}
              onClick={() => void run(() => gsWearAvatarStyle({ data: { ...sessOf(c), style: s.id } }), s.label)}
            />
          ))}
        </Grid>
      </Panel>
    </div>
  );
}

// === Badges ==============================================================

export function GsBadges() {
  const { c, p, run, runSeq } = useProfile();

  const ownedIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of p?.ownedBadges ?? []) if (b.id) s.add(b.id);
    return s;
  }, [p]);

  const pick = (id: string) => {
    if (ownedIds.has(id)) {
      void run(() => gsWearBadgeById({ data: { ...sessOf(c), id } }), "Badge");
      return;
    }
    void runSeq(
      [
        () => gsUnlockBadges({ data: { ...sessOf(c), ids: [id] } }),
        () => gsWearBadgeById({ data: { ...sessOf(c), id } }),
      ],
      "Badge",
    );
  };

  return (
    <div className="gs-stack">
      <Panel
        title="Badges"
        icon="badges"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsUnlockBadges({ data: { ...sessOf(c), ids: GS_BADGES.map((b) => b.id) } }),
                "All badges",
              )
            }
          >
            Unlock all
          </Button>
        }
      >
        <Counts
          owned={ownedIds.size}
          total={GS_BADGES.length}
          extra={<Chip tone="gold" icon="crown">{p?.wornBadgeId || "—"}</Chip>}
        />
        <Grid cols="narrow">
          {GS_BADGES.map((b) => (
            <PickTile
              key={b.id}
              entry={b}
              sub={b.grand ? "Grand" : undefined}
              owned={ownedIds.has(b.id)}
              worn={p?.wornBadgeId === b.id}
              busy={c.busy}
              onClick={() => pick(b.id)}
            />
          ))}
        </Grid>
      </Panel>
    </div>
  );
}

// === Titles ==============================================================

export function GsTitles() {
  const { c, p, run } = useProfile();

  const earned = useMemo(() => new Set(p?.titlesEarned ?? []), [p]);

  return (
    <div className="gs-stack">
      <Panel
        title="Titles"
        icon="titles"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy}
            onClick={() =>
              void run(
                () => gsUnlockTitles({ data: { ...sessOf(c), ids: GS_TITLES.map((t) => t.id) } }),
                "All titles",
              )
            }
          >
            Unlock all
          </Button>
        }
      >
        <Counts
          owned={earned.size}
          total={GS_TITLES.length}
          extra={<Chip tone="gold" icon="titles">{p?.wornTitleId || "—"}</Chip>}
        />
        <Grid cols="narrow">
          {GS_TITLES.map((t) => (
            <PickTile
              key={t.id}
              entry={t}
              sub={t.grand ? "Grand" : undefined}
              owned={earned.has(t.id)}
              worn={p?.wornTitleId === t.id}
              busy={c.busy}
              onClick={() => void run(() => gsWearTitle({ data: { ...sessOf(c), titleId: t.id } }), t.label)}
            />
          ))}
        </Grid>
      </Panel>
    </div>
  );
}
