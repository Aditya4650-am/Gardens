import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  gsClearBadgeNew,
  gsProfileCatalogs,
  gsReadProfile,
  gsReorderBadges,
  gsSetBadgeNew,
  gsUnlockAvatars,
  gsUnlockAvatarStyles,
  gsUnlockFrames,
  gsUnlockNameStyles,
  gsWearAvatar,
  gsWearAvatarStyle,
  gsWearBadge,
  gsWearNameStyle,
  gsWearTitle,
} from "@/lib/gs-api";
import {
  GS_AVATARS,
  GS_BADGES,
  GS_FRAMES,
  GS_FRAMES_ACTIVATABLE,
  GS_STYLES,
  GS_TITLES,
  type GsCatalogEntry,
} from "@/lib/server/gardenscapes/catalogs";
import { useGs, sessOf, type GsEditResult } from "./gs-ctx";
import { Bar, Chip, Field, GsIcon, Grid, Panel, Tile, Toggle } from "./gs-ui";

// ---------------------------------------------------------------------------
// Tab group C — Avatars, Frames, Styles, Badges, Titles.
//
// All five read the save through `gsReadProfile` and write through the
// profile module. Three limits are shown in the UI rather than hidden:
//   · badges are cipher rows — the cipher↔catalog mapping does not exist, so
//     the catalog is a gallery and the rows are what you can actually wear;
//   · titles are wear-only (the earned-list format was never observed);
//   · frames are unlock-only (no wear key has been identified).
// ---------------------------------------------------------------------------

interface OwnedBadge {
  cipher: string;
  isNew: boolean;
}
interface ProfileInfo {
  wornAvatarStyle: string;
  wornNameStyle: string;
  wornTitleId: string;
  wornBadgeCipher: string;
  currentAvatarId: string;
  avatarsShown: string[];
  avatarStylesShown: string[];
  nameStylesShown: string[];
  framesShown: string[];
  boughtAvatars: number;
  boughtFrames: number;
  ownedBadges: OwnedBadge[];
}

/** A shared loader for the four appearance tabs. */
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

  const run = async (fn: () => Promise<unknown>, label: string) => {
    const r = await c.act(fn);
    c.note(r as GsEditResult | undefined, label);
    await load();
  };

  return { c, p, frames, avatars, load, run };
}

// === Avatars ==============================================================

export function GsAvatars() {
  const { c, p, run } = useProfile();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const owned = useMemo(() => new Set(p?.avatarsShown ?? []), [p]);
  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="gs-stack">
      <Bar
        hint="Profile pictures. Unlock writes BoughtAvatar_* plus the shown-ids CSV; wear unlocks and equips in one write."
        onAll={() => setSel(new Set(GS_AVATARS.map((a) => a.id)))}
        onClear={() => setSel(new Set())}
        allLabel="Select all"
        clearLabel="Clear"
        extra={
          <>
            <Button
              size="sm"
              disabled={c.busy || !sel.size}
              onClick={() => void run(() => gsUnlockAvatars({ data: { ...sessOf(c), ids: [...sel] } }), "Unlock avatars")}
            >
              <GsIcon name="lock" className="size-4" /> Unlock {sel.size}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void run(() => gsReadProfile({ data: sessOf(c) }), "Refresh")}>
              <GsIcon name="refresh" className="size-4" /> Refresh
            </Button>
          </>
        }
      />

      <div className="gs-chips">
        <Chip tone="info" icon="avatars">{p?.boughtAvatars ?? 0} bought</Chip>
        <Chip tone="neutral" icon="check">{p?.avatarsShown.length ?? 0} shown</Chip>
        <Chip tone="gold" icon="star">wearing {p?.currentAvatarId || "—"}</Chip>
      </div>

      <Panel title={`Catalog · ${GS_AVATARS.length}`} icon="avatars" hint="Tap to wear (it unlocks itself); tick with Select, then Unlock to add without wearing.">
        <Grid cols="narrow">
          {GS_AVATARS.map((a) => (
            <Tile
              key={a.id}
              label={a.label}
              sub={a.id}
              glyph={a.emoji}
              art={a.art}
              color={a.color}
              owned={owned.has(a.id)}
              worn={p?.currentAvatarId === a.id}
              selected={sel.has(a.id)}
              onClick={() => {
                if (sel.size) toggle(a.id);
                else void run(() => gsWearAvatar({ data: { ...sessOf(c), id: a.id } }), a.label);
              }}
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
  const [sel, setSel] = useState<Set<string>>(new Set());
  const all = useMemo(() => [...GS_FRAMES, ...GS_FRAMES_ACTIVATABLE], []);
  const shown = useMemo(() => new Set(p?.framesShown ?? []), [p]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="gs-stack">
      <Bar
        hint="Frames unlock only — no wear key has been identified in the save, so the tool never guesses one. Activatable frames ride the same list."
        onAll={() => setSel(new Set(all.map((f) => f.id)))}
        onClear={() => setSel(new Set())}
        allLabel="Select all"
        clearLabel="Clear"
        extra={
          <Button
            size="sm"
            disabled={c.busy || !sel.size}
            onClick={() => void run(() => gsUnlockFrames({ data: { ...sessOf(c), ids: [...sel] } }), "Unlock frames")}
          >
            <GsIcon name="lock" className="size-4" /> Unlock {sel.size}
          </Button>
        }
      />

      <div className="gs-chips">
        <Chip tone="info" icon="frames">{p?.boughtFrames ?? 0} bought</Chip>
        <Chip tone="neutral" icon="check">{p?.framesShown.length ?? 0} shown</Chip>
        <Chip tone="gold" icon="star">{all.length} in catalog</Chip>
      </div>

      <Panel title="Frames" icon="frames">
        <Grid cols="narrow">
          {all.map((f) => (
            <Tile
              key={f.id}
              label={f.label}
              sub={f.id}
              art={f.art}
              color={f.color}
              owned={shown.has(f.id)}
              selected={sel.has(f.id)}
              onClick={() => toggle(f.id)}
            />
          ))}
        </Grid>
      </Panel>
    </div>
  );
}

// === Styles ===============================================================

export function GsStyles() {
  const { c, p, run } = useProfile();
  const [avatarStyle, setAvatarStyle] = useState("");

  const nameShown = useMemo(() => new Set(p?.nameStylesShown ?? []), [p]);
  const avatarShown = useMemo(() => new Set(p?.avatarStylesShown ?? []), [p]);

  return (
    <div className="gs-stack">
      <Bar
        hint="Name styles come from a closed measured vocabulary — an unknown one is refused. Avatar style ids are open (frame ids appear on them in the wild), so they are entered by hand."
        onClear={() => void run(() => gsReadProfile({ data: sessOf(c) }), "Refresh")}
        clearLabel="Refresh"
      />

      <div className="gs-chips">
        <Chip tone="gold" icon="styles">name: {p?.wornNameStyle || "default"}</Chip>
        <Chip tone="gold" icon="user">avatar: {p?.wornAvatarStyle || "default"}</Chip>
        <Chip tone="neutral" icon="check">{nameShown.size} name · {avatarShown.size} avatar shown</Chip>
      </div>

      <Panel title={`Name styles · ${GS_STYLES.length}`} icon="styles" hint="Tap to wear; tick then Unlock to add without wearing.">
        <Grid cols="narrow">
          {GS_STYLES.map((s) => (
            <NameStyleTile
              key={s.id}
              entry={s}
              owned={nameShown.has(s.id)}
              worn={p?.wornNameStyle === s.id}
              onWear={() => void run(() => gsWearNameStyle({ data: { ...sessOf(c), style: s.id } }), s.label)}
              onUnlock={() => void run(() => gsUnlockNameStyles({ data: { ...sessOf(c), styles: [s.id] } }), s.label)}
              busy={c.busy}
            />
          ))}
        </Grid>
      </Panel>

      <Panel title="Avatar styles" icon="user" hint="Open vocabulary — any well-formed token is accepted; shape only, never membership.">
        <div className="gs-pair">
          <Field label="Style id" value={avatarStyle} onChange={setAvatarStyle} placeholder="Frame_Birdhouse" />
          <Button
            size="sm"
            variant="outline"
            disabled={c.busy || !avatarStyle.trim()}
            onClick={() => void run(() => gsWearAvatarStyle({ data: { ...sessOf(c), style: avatarStyle.trim() } }), "Avatar style")}
          >
            Wear
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={c.busy || !avatarStyle.trim()}
            onClick={() => void run(() => gsUnlockAvatarStyles({ data: { ...sessOf(c), styles: [avatarStyle.trim()] } }), "Avatar style")}
          >
            Unlock
          </Button>
          <Button
            size="sm"
            variant="success"
            disabled={c.busy || !avatarShown.size}
            onClick={() =>
              void run(
                () => gsUnlockAvatarStyles({ data: { ...sessOf(c), styles: [...avatarShown] } }),
                "All avatar styles",
              )
            }
          >
            Re-unlock shown
          </Button>
        </div>
        {avatarShown.size ? (
          <div className="gs-chips mt-3">
            {[...avatarShown].map((s) => (
              <Chip key={s} tone="neutral">{s}</Chip>
            ))}
          </div>
        ) : (
          <p className="gs-empty mt-3">The save shows no avatar styles yet.</p>
        )}
      </Panel>
    </div>
  );
}

function NameStyleTile({
  entry,
  owned,
  worn,
  onWear,
  onUnlock,
  busy,
}: {
  entry: GsCatalogEntry;
  owned: boolean;
  worn: boolean;
  onWear: () => void;
  onUnlock: () => void;
  busy: boolean;
}) {
  return (
    <div className="gs-tile-wrap">
      <Tile
        label={entry.label}
        sub={entry.id}
        glyph={entry.emoji}
        art={entry.art}
        color={entry.color}
        owned={owned}
        worn={worn}
        onClick={onWear}
        disabled={busy}
      />
      {!owned ? (
        <button type="button" className="gs-tile-sub-action" disabled={busy} onClick={onUnlock}>
          Unlock
        </button>
      ) : null}
    </div>
  );
}

// === Badges ===============================================================

export function GsBadges() {
  const { c, p, run } = useProfile();
  const rows = p?.ownedBadges ?? [];
  const worn = p?.wornBadgeCipher ?? "";

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const order = rows.map((r) => r.cipher);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
    await run(() => gsReorderBadges({ data: { ...sessOf(c), order } }), "Reorder badges");
  };

  return (
    <div className="gs-stack">
      <Bar
        hint="Badges are stored as opaque ciphers and the cipher↔catalog mapping does not exist — so the rows below are what this save can actually wear. The catalog underneath is a gallery."
        onClear={() => void run(() => gsClearBadgeNew({ data: sessOf(c) }), "Clear new dots")}
        clearLabel="Clear all “new”"
        extra={
          <Button size="sm" variant="ghost" onClick={() => void run(() => gsReadProfile({ data: sessOf(c) }), "Refresh")}>
            <GsIcon name="refresh" className="size-4" /> Refresh
          </Button>
        }
      />

      <div className="gs-chips">
        <Chip tone="info" icon="badges">{rows.length} owned</Chip>
        <Chip tone="gold" icon="crown">{worn ? "badge worn" : "no badge worn"}</Chip>
        <Chip tone="neutral" icon="star">{GS_BADGES.length} known</Chip>
      </div>

      <Panel title="Owned badges" icon="badges" hint="Tap to wear · ↑↓ reorder · toggle the “new” dot. Reorder must stay a full permutation, which is why rows move rather than disappear.">
        {rows.length ? (
          <div className="gs-list">
            {rows.map((r, i) => (
              <div key={r.cipher} className="gs-row">
                <span className="gs-row-main">
                  <GsIcon name="badges" className="size-4" />
                  <span className="gs-row-title gs-break">{r.cipher}</span>
                  {worn === r.cipher ? <Chip tone="gold" icon="crown">worn</Chip> : null}
                  {r.isNew ? <Chip tone="info">new</Chip> : null}
                </span>
                <span className="gs-row-tools">
                  <button type="button" className="gs-mini" disabled={c.busy || i === 0} onClick={() => void move(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="gs-mini" disabled={c.busy || i === rows.length - 1} onClick={() => void move(i, 1)} aria-label="Move down">↓</button>
                  <Button size="sm" variant="outline" disabled={c.busy} onClick={() => void run(() => gsWearBadge({ data: { ...sessOf(c), cipher: r.cipher } }), "Wear badge")}>
                    Wear
                  </Button>
                  <Toggle on={r.isNew} disabled={c.busy}
                    onClick={() => void run(() => gsSetBadgeNew({ data: { ...sessOf(c), cipher: r.cipher, isNew: !r.isNew } }), "Badge dot")}>
                    New
                  </Toggle>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="gs-empty">This save holds no owned badges.</p>
        )}
      </Panel>

      <Panel title={`Catalog · ${GS_BADGES.length}`} icon="star" hint="Reference only — a badge that is not in your rows cannot be worn until the save holds it.">
        <Grid cols="narrow">
          {GS_BADGES.map((b) => (
            <Tile
              key={b.id}
              label={b.label}
              sub={b.grand ? "grand" : b.id}
              glyph={b.emoji}
              art={b.art}
              color={b.color}
              owned={false}
              disabled
              title={`${b.label} — cipher unknown, shown for reference`}
            />
          ))}
        </Grid>
      </Panel>
    </div>
  );
}

// === Titles ===============================================================

export function GsTitles() {
  const { c, p, run } = useProfile();
  const [filter, setFilter] = useState("");

  const shown = filter
    ? GS_TITLES.filter((t) => (t.label + t.id).toLowerCase().includes(filter.toLowerCase()))
    : GS_TITLES;

  return (
    <div className="gs-stack">
      <Bar
        hint="Titles are wear-only. `PlayerTitleIdsEarned` is empty on every save measured and its non-empty format was never observed, so the tool does not invent one — if the game checks that list first, a worn-but-unearned title may not render."
        extra={
          <input
            className="field field-qty font-mono"
            placeholder="filter titles…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        }
      />

      <div className="gs-chips">
        <Chip tone="gold" icon="titles">wearing {p?.wornTitleId || "—"}</Chip>
        <Chip tone="neutral" icon="check">{GS_TITLES.length} known</Chip>
      </div>

      <Panel title="Titles" icon="titles">
        <Grid cols="narrow">
          {shown.map((t) => (
            <Tile
              key={t.id}
              label={t.label}
              sub={t.grand ? "grand" : t.id}
              art={t.art}
              color={t.color}
              glyph={t.emoji}
              owned
              worn={p?.wornTitleId === t.id}
              disabled={c.busy}
              onClick={() => void run(() => gsWearTitle({ data: { ...sessOf(c), titleId: t.id } }), t.label)}
            />
          ))}
        </Grid>
        {!shown.length ? <p className="gs-empty">No title matches “{filter}”.</p> : null}
      </Panel>
    </div>
  );
}
