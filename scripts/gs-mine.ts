// Dump the real shape of every table the edit modules need to touch, so the
// server modules target measured paths instead of guesses.
// Run: node --experimental-strip-types scripts/gs-mine.ts [savePath] [what]
import { readFileSync } from "node:fs";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";
import { parseAUDB, type AUDBEntry } from "../src/lib/gardenscapes/codec.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
const what = process.argv[3] ?? "all";
const raw = readFileSync(path);
const plain = path.endsWith(".plain") ? raw : Buffer.from(xorBytes(raw));
const doc = parseAUDB(plain);

const T = (n: string) => doc.tables.find((t) => t.name === n);
const show = (v: unknown, d = 0): string => {
  if (d > 3) return "…";
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    const first = v[0];
    if (Array.isArray(first) && first.length === 2 && typeof first[0] === "string") {
      // [type, value] or object child [key, [type, value]]
      const inner = first[1];
      if (Array.isArray(inner) && inner.length === 2 && typeof inner[0] === "string") {
        return `[${v.length} obj] { ${v
          .slice(0, 6)
          .map((c: any) => `${c[0]}: ${show(c[1][1], d + 1)}`)
          .join(" | ")}${v.length > 6 ? " …" : ""} }`;
      }
      return `[${v.length}] [${v.map((c: any) => show(c[1], d + 1)).join(", ")}]`;
    }
    return `[${v.length}] ${v.slice(0, 5).map((c) => show(c, d + 1)).join(", ")}`;
  }
  if (v && typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return JSON.stringify(v);
};

function dumpEntry(e: AUDBEntry, max = 40): void {
  if (e.type === "o") {
    const kids = e.value as [string, [string, unknown]][];
    console.log(`  ${e.key} [o] (${kids.length} keys)`);
    for (const [k, [kt, kv]] of kids.slice(0, max)) {
      console.log(`      ${k} [${kt}] = ${show(kv)}`);
    }
    if (kids.length > max) console.log(`      … ${kids.length - max} more`);
  } else {
    console.log(`  ${e.key} [${e.type}] = ${show(e.value)}`);
  }
}

if (what === "all" || what === "props") {
  const t = T("TableName");
  const p = t?.entries.find((e) => e.key === "Properties");
  console.log(`== TableName.Properties (${p ? (p.value as any).length : 0} keys) ==`);
  if (p && p.type === "o") {
    for (const [k, [kt, kv]] of (p.value as [string, [string, unknown]][])) {
      const s = JSON.stringify(kv);
      if (
        /coin|star|level|chapter|lives|energy|token|gem|cash|score|name|id$|exp|xp|progress/i.test(
          k,
        )
      ) {
        console.log(`  ${k} [${kt}] = ${s && s.length > 70 ? s.slice(0, 70) + "…" : s}`);
      }
    }
  }
}

if (what === "all" || what === "items") {
  const t = T("items");
  console.log(`== items (${t?.entries.length ?? 0}) ==`);
  t?.entries.forEach((e) => dumpEntry(e));
}

if (what === "all" || what === "season") {
  const t = T("SpecialEvents");
  console.log(`== SpecialEvents top keys (${t?.entries.length ?? 0}) ==`);
  const seasons = (t?.entries ?? []).filter((e) => /^Season\d+$/.test(e.key));
  for (const s of seasons) {
    console.log(`-- ${s.key} [${s.type}]`);
    if (s.type === "o") {
      for (const [k, [kt, kv]] of (s.value as [string, [string, unknown]][]).slice(0, 30)) {
        console.log(`     ${k} [${kt}] = ${show(kv)}`);
      }
    }
  }
  const others = (t?.entries ?? []).filter((e) => !/^Season\d+$/.test(e.key));
  console.log(`-- non-season keys: ${others.map((e) => e.key).join(", ")}`);
}

if (what === "all" || what === "profile") {
  const t = T("SpecialEvents");
  const p = t?.entries.find((e) => e.key === "PlayerProfileOwn");
  console.log(`== SpecialEvents.PlayerProfileOwn ==`);
  if (p) dumpEntry(p, 60);
}

if (what === "all" || what === "features") {
  const t = T("Features");
  console.log(`== Features (${t?.entries.length ?? 0} top keys) ==`);
  console.log(`   ${(t?.entries ?? []).map((e) => e.key).join(", ")}`);
  for (const want of ["ProfileBadgesGFF", "ObtainableAvatarStylesGFF", "CardC3"]) {
    const e = t?.entries.find((x) => x.key === want);
    if (e) {
      console.log(`-- ${want}`);
      dumpEntry(e, 30);
    } else {
      console.log(`-- ${want}: ABSENT`);
    }
  }
}

if (what === "all" || what === "repairs") {
  const t = T("repairs");
  console.log(`== repairs (${t?.entries.length ?? 0}) ==`);
  t?.entries.slice(0, 3).forEach((e) => dumpEntry(e, 30));
  if ((t?.entries.length ?? 0) > 3) console.log(`   … ${t!.entries.length - 3} more`);
}

if (what === "all" || what === "tables") {
  console.log(`== all tables ==`);
  console.log(doc.tables.map((t) => `${t.name}(${t.entries.length})`).join(", "));
}
