/**
 * Feature / tab button icon paths.
 *
 * Source: OxxEditor (Gardenscapes reference editor) bundled UI icon set,
 * extracted verbatim from the name -> SVG path map used by its icon helper
 * (24x24 viewBox, stroke-rendered). Reused here so every feature button in
 * this tool matches the reference editor's icon vocabulary exactly.
 *
 * Render with:
 *   <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
 *        stroke="currentColor" strokeWidth={2} strokeLinecap="round"
 *        strokeLinejoin="round"><path d={gsIcon("frames")} /></svg>
 */

export const GS_ICONS = {save:"M5 3h12l2 2v16H5zM8 3v6h7V3M8 18h8",user:"M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10",player:"M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10",statistics:"M4 20V10M10 20V4M16 20v-7M22 20H2",boosters:"M13 2 4 14h7l-1 8 9-12h-7z",infinite:"M6.5 8.5C3 8.5 3 15.5 6.5 15.5c3 0 8-7 11-7 3.5 0 3.5 7 0 7-3 0-8-7-11-7z",cards:"M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6",sendCards:"M22 2 11 13M22 2l-7 20-4-9-9-4z",avatars:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",frames:"M3 3h18v18H3zM7 7h10v10H7z",styles:"M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1 3.7A2 2 0 0 1 12 22zM7.5 10.5h.01M12 7h.01M16.5 10.5h.01",badges:"M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.2 13.9 7 22l5-3 5 3-1.2-8.1",titles:"M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01",quests:"M4 22V4M4 4h13l-2 4 2 4H4",decosets:"M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",backups:"M3 7h18v4H3zM5 11v9h14v-9M10 15h4",barn:"M3 21V9l9-6 9 6v12M2 21h20M8 21v-7h8v7M8 14l8 7M16 14l-8 7",coupons:"M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM15 7v2M15 11v2M15 15v2",regata:"M4 3v18M4 4h12l-2 4 2 4H4M6 21h8",back:"M15 18l-6-6 6-6",zoom:"M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3M11 8v6M8 11h6",check:"M20 6 9 17l-5-5",star:"M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",spark:"M12 2l2.7 6.8L22 12l-7.3 3.2L12 22l-2.7-6.8L2 12l7.3-3.2z",minus:"M5 12h14",plus:"M12 5v14M5 12h14",logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",globe:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",refresh:"M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M21 4v5h-5M3 20v-5h5",play:"M7 4l13 8-13 8z",stop:"M6 6h12v12H6z",grip:"M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",reset:"M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",device:"M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",shield:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",cloud:"M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19z",level:"M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",calendar:"M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",chevron:"M6 9l6 6 6-6",next:"M9 18l6-6-6-6",speed:"M12 14l4-4M3.3 17a10 10 0 1 1 17.4 0",layers:"M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",clock:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",key:"M21 2l-2 2M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM11.4 11.6 15.5 7.5M15.5 7.5l3 3L22 7l-3-3M15.5 7.5 19 4",download:"M12 3v12M7 10l5 5 5-5M5 21h14",games:"M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6L2 15.4A2.9 2.9 0 0 0 7 17.6L9 15h6l2 2.6a2.9 2.9 0 0 0 5-2.2l-.7-6.8A4 4 0 0 0 17.3 5z",lock:"M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",trash:"M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6",pencil:"M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5zM15 5l4 4",crown:"M2 18h20M3 7l5 4 4-7 4 7 5-4-2 11H5z",x:"M18 6 6 18M6 6l12 12",eye:"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",eyeOff:"M9.9 4.2A9.6 9.6 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.4 9.4 0 0 0 5.4-1.6M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20",alert:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v6M12 16.5h.01",search:"M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",info:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01",bug:"M8 6a4 4 0 0 1 8 0M7 9h10v6a5 5 0 0 1-10 0zM12 9v11M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-2M20 20l-3-2",mail:"M3 5h18v14H3zM3 6l9 7 9-7",bell:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",external:"M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",gear:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",megaphone:"M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",eraser:"M7 21h13M5.6 15.6l7.8-7.8a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L12 18.8a2 2 0 0 1-1.4.6H8.2a2 2 0 0 1-1.4-.6l-1.2-1.2a2 2 0 0 1 0-2zM9 12l5 5",cart:"M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6M10 21h.01M18 21h.01",copy:"M9 9h11v11H9zM5 15H4V4h11v1",terminal:"M4 4h16v16H4zM8 9l3 3-3 3M13 15h3",card:"M3 6h18v12H3zM3 10h18M7 15h4",crypto:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9 7h5a2.5 2.5 0 0 1 0 5H9zM9 12h5.5a2.5 2.5 0 0 1 0 5H9zM9 7v10M11 5v2M11 17v2",tag:"M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",users:"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.7",sun:"M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1.5v2M12 20.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4",moon:"M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",reload:"M20 11a8 8 0 1 0-2.3 6.6M20 4v7h-7",cloudUp:"M7 18.5H6a4 4 0 0 1-.6-8 6.5 6.5 0 0 1 12.4-1.7A4.8 4.8 0 0 1 18 18.5h-1M12 21v-8.5M8.8 15.5 12 12.3l3.2 3.2"} as const;

export type GsIconName = keyof typeof GS_ICONS;

/** All icon names, in the reference editor's declaration order. */
export const GS_ICON_NAMES = [
  "save",
  "user",
  "player",
  "statistics",
  "boosters",
  "infinite",
  "cards",
  "sendCards",
  "avatars",
  "frames",
  "styles",
  "badges",
  "titles",
  "quests",
  "decosets",
  "backups",
  "barn",
  "coupons",
  "regata",
  "back",
  "zoom",
  "check",
  "star",
  "spark",
  "minus",
  "plus",
  "logout",
  "globe",
  "refresh",
  "play",
  "stop",
  "grip",
  "reset",
  "device",
  "shield",
  "cloud",
  "level",
  "calendar",
  "chevron",
  "next",
  "speed",
  "layers",
  "clock",
  "key",
  "download",
  "games",
  "lock",
  "trash",
  "pencil",
  "crown",
  "x",
  "eye",
  "eyeOff",
  "alert",
  "search",
  "info",
  "bug",
  "mail",
  "bell",
  "external",
  "gear",
  "megaphone",
  "eraser",
  "cart",
  "copy",
  "terminal",
  "card",
  "crypto",
  "tag",
  "users",
  "sun",
  "moon",
  "reload",
  "cloudUp",
] as const;

/** Look up an icon path. Unknown names fall back to the "spark" glyph. */
export function gsIcon(name: string): string {
  const map = GS_ICONS as Record<string, string | undefined>;
  return map[name] ?? map.spark ?? "";
}

/** True when the icon name exists in the set. */
export function hasGsIcon(name: string): name is GsIconName {
  return Object.prototype.hasOwnProperty.call(GS_ICONS, name);
}
