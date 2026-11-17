// Probe the box / request / friend tables of a Gardenscapes save to find
// where a card send would be recorded. Read-only.

import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable } from "../src/lib/gardenscapes/save-engine.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("../_ref/mined/GameData.db");

function kidsOf(entry: any): any[] {
  const value = Array.isArray(entry) ? entry[1] : entry?.value;
  return Array.isArray(value) ? value : [];
}
function fmtVal(p: any): string {
  if (!Array.isArray(p)) return String(p);
  const [t, v] = p;
  if (t === "a") return `[${(v as any[]).length} rows]`;
  if (t === "o") return `{${(v as any[]).length}}`;
  if (typeof v === "string") return JSON.stringify(v.length > 60 ? v.slice(0, 60) + "…" : v);
  return String(v);
}
function dumpEntry(label: string, e: any, maxKids = 25): void {
  if (!e) return console.log(`${label}: <absent>`);
  if (e.type !== "o") return console.log(`${label} [${e.type}] = ${fmtVal([e.type, e.value])}`);
  const kids = e.value as any[];
  console.log(`${label}: ${kids.length} children`);
  for (const [k, p] of kids.slice(0, maxKids)) {
    if (p[0] === "a") {
      const rows = p[1] as any[];
      console.log(`  ${k} [a] = ${rows.length} rows`);
      for (const r of rows.slice(0, 2)) {
        if (r[0] === "o") {
          console.log(`    row: ${(r[1] as any[]).map((c: any) => `${c[0]}=${fmtVal(c[1])}`).join(" ")}`);
        } else {
          console.log(`    row [${r[0]}] ${JSON.stringify(r[1])}`);
        }
      }
    } else if (p[0] === "o") {
      console.log(`  ${k} [o] = {${(p[1] as any[]).length}} ${kidsOf(p).slice(0, 8).map((c: any) => `${c[0]}=${fmtVal(c[1])}`).join(" ")}`);
    } else {
      console.log(`  ${k} [${p[0]}] = ${fmtVal(p)}`);
    }
  }
  if (kids.length > maxKids) console.log(`  … ${kids.length - maxKids} more`);
}

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);

  for (const name of ["boxes", "sent_requests", "fb_boxes", "npc_boxes", "clan_boxes", "clan_consumed_boxes", "main_pers_objects"]) {
    const t: any = findTable(doc, name);
    if (!t) { console.log(`\n${name}: <no table>`); continue; }
    console.log(`\n${name}: ${t.entries.length} entries`);
    for (const e of t.entries.slice(0, 6)) dumpEntry(`  ${e.key}`, e, 12);
  }

  // GameFriends / InviteFriends / clan_chest event shapes
  for (const [table, keys] of [
    ["SpecialEvents", ["GameFriends", "clan_chest"]],
    ["EventsSystem", ["GameFriends", "InviteFriends"]],
  ] as const) {
    const t: any = findTable(doc, table);
    if (!t) continue;
    for (const key of keys) {
      const e = t.entries.find((x: any) => x.key === key);
      if (e) dumpEntry(`${table}.${key}`, e, 20);
    }
  }

  // Any entry whose KEY looks like a friend id pattern or holds friend-ish rows
  const tn: any = findTable(doc, "TableName");
  if (tn) {
    const hits = tn.entries.filter((e: any) => /friend|neighbor|social|invite/i.test(e.key));
    console.log(`\nTableName keys ~friend: ${hits.slice(0, 20).map((e: any) => `${e.key}[${e.type}]`).join(" ") || "<none>"}`);
  }
}
