// Dump SpecialEvents.GameFriends + EventsSystem.GameFriends fully on both saves.
import { readFileSync } from "node:fs";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";
import { decodeSave, findTable, findEntry } from "../src/lib/gardenscapes/save-engine.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("../_ref/mined/GameData.db");

function fmt(p: any, depth = 0): string {
  if (!Array.isArray(p)) return String(p);
  const [t, v] = p as [string, any];
  if (t === "a") return `[${v.length}]`;
  if (t === "o") return `{${v.length}}`;
  if (typeof v === "string") return JSON.stringify(v.length > 60 ? v.slice(0, 60) + "…" : v);
  return String(v);
}
function dump(label: string, e: any, depth = 0, maxKids = 40): void {
  if (!e) return console.log(`${"  ".repeat(depth)}${label}: <absent>`);
  const pad = "  ".repeat(depth);
  if (e.type === "o") {
    console.log(`${pad}${label}: {${e.value.length}}`);
    for (const [k, p] of (e.value as any[]).slice(0, maxKids)) {
      if ((p[0] === "o" || p[0] === "a") && depth < 4) dump(`${k} [${p[0]}]`, { type: p[0], value: p[1] }, depth + 1, maxKids);
      else console.log(`${pad}  ${k} [${p[0]}] ${fmt(p)}`);
    }
  } else if (e.type === "a") {
    console.log(`${pad}${label}: [${e.value.length}]`);
    (e.value as any[]).slice(0, 8).forEach((row, i) => {
      if (row[0] === "o") console.log(`${pad}  #${i}: ${(row[1] as any[]).map((c: any) => `${c[0]}=${fmt(c[1])}`).join(" ")}`);
      else console.log(`${pad}  #${i} [${row[0]}] ${JSON.stringify(row[1]).slice(0, 80)}`);
    });
  } else {
    console.log(`${pad}${label} [${e.type}] ${fmt([e.type, e.value])}`);
  }
}

for (const path of paths) {
  const buf = readFileSync(path);
  const doc = buf.subarray(0, 4).toString("latin1") === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc;
  console.log(`\n===== ${path} =====`);

  const se: any = findTable(doc, "SpecialEvents");
  if (se) {
    const gf = se.entries.find((x: any) => x.key === "GameFriends");
    dump("SpecialEvents.GameFriends", gf);
  }
  const ev: any = findTable(doc, "EventsSystem");
  if (ev) {
    const gf = ev.entries.find((x: any) => x.key === "GameFriends");
    dump("EventsSystem.GameFriends", gf);
    const inv = ev.entries.find((x: any) => x.key === "InviteFriends");
    dump("EventsSystem.InviteFriends", inv);
  }
}
