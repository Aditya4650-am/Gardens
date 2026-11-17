// Dump one entry as an indented tree: <table> <entryKey> [maxDepth]
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const path = "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\cal_now1.plain";
const data: Buffer = readFileSync(path);
const doc = parseAUDB(data);

const [, , tname, ekey, depthArg] = process.argv;
const maxDepth = Number(depthArg ?? 4);
const table = doc.tables.find((t) => t.name === tname);
if (!table) throw new Error("no table " + tname);
const entry = table.entries.find((e) => e.key === ekey);
if (!entry) throw new Error("no entry " + ekey);

function val(type: string, v: unknown): string {
  switch (type) {
    case "s": { const s = String(v); return JSON.stringify(s.length > 80 ? s.slice(0, 80) + "…" : s); }
    case "o": return "obj{" + (v as unknown[]).length + "}";
    case "a": return "arr{" + (v as unknown[]).length + "}";
    default: return String(v).slice(0, 80);
  }
}

function dump(prefix: string, type: string, v: unknown, depth: number): void {
  console.log("  ".repeat(depth) + prefix + " [" + type + "] = " + val(type, v));
  if (depth >= maxDepth) return;
  if (type === "o") {
    for (const [k, pair] of v as [string, [string, unknown]][]) dump(k + ".", String(pair[0]), pair[1], depth + 1);
  } else if (type === "a") {
    const items = v as [string, unknown][];
    for (let i = 0; i < Math.min(items.length, 24); i++) dump("[" + i + "]", String(items[i][0]), items[i][1], depth + 1);
    if (items.length > 24) console.log("  ".repeat(depth + 1) + "… +" + (items.length - 24));
  }
}

dump("", entry.type, entry.value, 0);
