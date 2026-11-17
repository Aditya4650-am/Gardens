// Find every key matching a pattern across all tables, so cosmetics paths
// (frames / styles / titles / avatars) are measured rather than guessed.
import { readFileSync } from "node:fs";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";
import { parseAUDB, type AUDBEntry } from "../src/lib/gardenscapes/codec.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
const re = new RegExp(process.argv[3] ?? "frame|style|title|badge|avatar", "i");
const raw = readFileSync(path);
const plain = path.endsWith(".plain") ? raw : Buffer.from(xorBytes(raw));
const doc = parseAUDB(plain);

let hits = 0;

/** Walk children of an object/array, reporting keys that match `re`. */
function walk(entry: AUDBEntry, table: string, path: string, depth: number): void {
  if (hits > 500 || depth > 7) return;
  const kids: [string, string, unknown][] = [];
  if (entry.type === "o") {
    for (const [k, [kt, kv]] of entry.value as [string, [string, unknown]][]) {
      kids.push([k, kt, kv]);
    }
  } else if (entry.type === "a") {
    const items = entry.value as [string, unknown][];
    for (let i = 0; i < Math.min(items.length, 4); i++) {
      const [it, iv] = items[i]!;
      kids.push([String(i), it, iv]);
    }
  } else return;

  for (const [k, kt, kv] of kids) {
    const here = path ? `${path}.${k}` : k;
    if (re.test(k)) {
      const v = JSON.stringify(kv);
      console.log(`${table}: ${here} [${kt}] = ${v && v.length > 100 ? v.slice(0, 100) + "…" : v}`);
      hits++;
      if (hits > 500) return;
    }
    if (kt === "o" || kt === "a") {
      walk({ key: k, type: kt, value: kv }, table, here, depth + 1);
    }
  }
}

for (const t of doc.tables) {
  for (const e of t.entries) walk(e, t.name, e.key, 0);
  if (hits > 500) break;
}
console.log(`\n${hits} hits`);
