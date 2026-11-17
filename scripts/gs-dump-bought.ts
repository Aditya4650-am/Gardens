// Every Properties key matching Bought*/ShownIds/Unlocked* across all saves.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodeSave, findTable, findEntry, objEntries } from "@/lib/gardenscapes/save-engine";
import { parseAUDB } from "@/lib/gardenscapes/codec";

const roots = ["C:/Users/User/Downloads"];
const files: string[] = [];
function walk(dir: string, depth: number) {
  if (depth > 4) return;
  let ents: string[];
  try { ents = readdirSync(dir); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e);
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        if (/node_modules|\.git|decomp|@vitejs|\.venv/.test(p)) continue;
        walk(p, depth + 1);
      } else if (/GameData.*\.db$|\.AUDB$/i.test(e)) files.push(p);
    } catch {}
  }
}
for (const r of roots) if (existsSync(r)) walk(r, 0);

const re = /^(Bought|User|.*ShownIds|.*WasUnlocked|Unlocked)/;
for (const f of files) {
  let buf: Buffer;
  try { buf = readFileSync(f); } catch { continue; }
  if (buf.length < 16) continue;
  let doc: any = null;
  try { doc = buf.toString("ascii", 0, 4) === "AUDB" ? parseAUDB(buf) : decodeSave(buf).doc; } catch { continue; }
  const tn = findTable(doc, "TableName");
  const pe = tn ? findEntry(tn, "Properties") : undefined;
  if (!pe || pe.type !== "o") continue;
  const kids = objEntries(pe);
  const hits = kids.filter(([k]) => re.test(k));
  const groups: Record<string, string[]> = {};
  for (const [k, v] of hits) {
    const g = k.startsWith("BoughtAvatar_") ? "BoughtAvatar_*"
      : k.startsWith("BoughtFrame_") ? "BoughtFrame_*"
      : k.startsWith("Bought") ? "Bought(other)"
      : /ShownIds/.test(k) ? "ShownIds"
      : /WasUnlocked/.test(k) ? "WasUnlocked"
      : k.startsWith("Unlocked") ? "Unlocked*"
      : "other";
    (groups[g] ??= []).push(`${k}=${JSON.stringify(v[1]).slice(0, 60)}`);
  }
  console.log(`\n== ${f}`);
  for (const [g, list] of Object.entries(groups)) {
    console.log(`  ${g} (${list.length}): ${list.slice(0, 25).join(" | ")}${list.length > 25 ? " …" : ""}`);
  }
}
