import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { gsIcon, hasGsIcon } from "@/lib/gs-icons";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Shared Gardenscapes UI primitives.
//
// `GsIcon` renders the OxxEditor 24x24 stroke paths verbatim; `Panel`, `Bar`,
// `Tile`, `Field` and `Chip` give every tab the same shell so the fourteen
// panels read as one tool rather than fourteen experiments.
// ---------------------------------------------------------------------------

export function GsIcon({
  name,
  className,
  size,
}: {
  name: string;
  className?: string;
  size?: number;
}) {
  // Unknown names fall back to the spark glyph rather than rendering nothing —
  // a tab whose icon silently vanished looked like a broken button.
  const d = gsIcon(hasGsIcon(name) ? name : "spark");
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("gs-icon shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export function Panel({
  title,
  hint,
  icon,
  actions,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("gs-panel panel", className)}>
      {title ? (
        <header className="gs-panel-head">
          <h3 className="gs-panel-title">
            {icon ? <GsIcon name={icon} className="size-4" /> : null}
            <span>{title}</span>
          </h3>
          {actions ? <div className="gs-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      {hint ? <p className="gs-panel-hint">{hint}</p> : null}
      {children}
    </section>
  );
}

/** The toolbar above a picker grid: hint text + All / Clear. */
export function Bar({
  hint,
  onAll,
  onClear,
  allLabel = "Select all",
  clearLabel = "Clear",
  extra,
}: {
  hint?: string;
  onAll?: () => void;
  onClear?: () => void;
  allLabel?: string;
  clearLabel?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="gs-bar">
      {hint ? <p className="gs-bar-hint">{hint}</p> : null}
      <div className="gs-bar-actions">
        {extra}
        {onAll ? (
          <Button size="sm" variant="outline" onClick={onAll}>
            {allLabel}
          </Button>
        ) : null}
        {onClear ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            {clearLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A labelled input with an optional trailing unit. */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  suffix,
  disabled,
  mono = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  suffix?: string;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="gs-field">
      <span className="kicker">{label}</span>
      <span className="gs-field-row">
        <input
          className={cn("field", mono && "font-mono")}
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix ? <span className="gs-field-suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function Chip({
  tone = "neutral",
  icon,
  children,
  title,
}: {
  tone?: "neutral" | "ok" | "warn" | "gold" | "info";
  icon?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={cn("gs-chip", `gs-chip--${tone}`)} title={title}>
      {icon ? <GsIcon name={icon} className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/** A toggle button that reads as on/off at a glance. */
export function Toggle({
  on,
  onClick,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn("gs-toggle", on && "gs-toggle--on")}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="gs-toggle-dot" aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * One cell in a catalog grid (card, avatar, frame, badge, title, style).
 * `selected` drives the ring, `owned` the filled state, `worn` the crown.
 */
export function Tile({
  label,
  sub,
  glyph,
  art,
  color,
  owned,
  selected,
  worn,
  isNew,
  onClick,
  disabled,
  title,
}: {
  label: string;
  sub?: string;
  glyph?: string;
  art?: string;
  color?: string;
  owned?: boolean;
  selected?: boolean;
  worn?: boolean;
  isNew?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "gs-tile",
        owned && "gs-tile--owned",
        selected && "gs-tile--on",
        worn && "gs-tile--worn",
        disabled && "gs-tile--off",
      )}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-pressed={selected}
    >
      <span className="gs-tile-art" style={color ? { background: color } : undefined}>
        {art ? (
          <img
            src={art}
            alt=""
            loading="lazy"
            draggable={false}
            onError={(e) => {
              // Art that never shipped must not leave a broken-image icon in
              // the grid — swap to the glyph the cell already carries.
              const img = e.currentTarget;
              img.style.display = "none";
              const sib = img.nextElementSibling as HTMLElement | null;
              if (sib) sib.style.display = "";
            }}
          />
        ) : null}
        <span aria-hidden style={art ? { display: "none" } : undefined}>
          {glyph ?? label.slice(0, 1).toUpperCase()}
        </span>
        {worn ? <span className="gs-tile-crown" aria-hidden="true">★</span> : null}
        {isNew ? <span className="gs-tile-new" aria-hidden="true">•</span> : null}
      </span>
      <span className="gs-tile-label">{label}</span>
      {sub ? <span className="gs-tile-sub">{sub}</span> : null}
    </button>
  );
}

/** A small read-only number tile for dashboard summaries. */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: string;
  tone?: number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="gs-stat-head">
        {icon ? <GsIcon name={icon} className="size-4" /> : null}
        <span className="kicker">{label}</span>
      </span>
      <span className="gs-stat-value">{value}</span>
      {sub ? <span className="gs-stat-sub">{sub}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="gs-stat gs-stat--btn" data-tone={tone} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="gs-stat" data-tone={tone}>
      {body}
    </div>
  );
}

/** Inline success / error line under a form. */
export function Msg({ kind, children }: { kind: "ok" | "err" | "info"; children: ReactNode }) {
  if (!children) return null;
  return <p className={`gs-msg gs-msg--${kind}`}>{children}</p>;
}

/** A grid of tiles with a responsive column count. */
export function Grid({ cols = "auto", children }: { cols?: "auto" | "wide" | "narrow"; children: ReactNode }) {
  return <div className={cn("gs-grid", `gs-grid--${cols}`)}>{children}</div>;
}

/** Run `fn` once on mount and whenever `deps` change. */
export function useLoad(fn: () => Promise<void>, deps: unknown[]) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let stop = false;
    void (async () => {
      await fn();
      if (!stop) setLoaded(true);
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return loaded;
}

/** Trigger a browser download of raw base64 bytes. */
export function downloadB64(name: string, b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  // WebView2 ignores clicks on detached anchors, so attach first.
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read a user-picked file into base64 (the plain-browser save fallback). */
export function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Could not read that file"));
    fr.onload = () => {
      const r = String(fr.result ?? "");
      const i = r.indexOf(",");
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    fr.readAsDataURL(file);
  });
}

/** debounce for text inputs that write on change */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
