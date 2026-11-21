// Report the facts that matter for the clone test: identity, progress, content.
//   node clone-verify.mjs [file...]
import { readFileSync } from "node:fs";
import { decodeSave, findEntry, findTable, objEntries } from "@/lib/gardenscapes/save-engine";
import { XOR_KEY, FRESH_KEY } from "@/lib/gardenscapes/key";

const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [`${process.env.TEMP}\\gs-test\\clone-before.db`, `${process.env.TEMP}\\gs-test\\clone-verify.db`];

const PROGRESS = ["level", "coins", "earnedStars", "spentStars", "name", "PlayerId", "gameId", "vietnamBuild", "GardenCurrentChapterId", "dogname"];

function facts(doc) {
  const t = findTable(doc, "TableName");
  const p = t ? findEntry(t, "Properties") : undefined;
  const get = (k) => {
    const hit = p && p.type === "o" ? objEntries(p).find(([kk]) => kk === k) : undefined;
    return hit ? hit[1][1] : undefined;
  };
  const out = {};
  for (const k of PROGRESS) out[k] = get(k);
  out.tables = doc.tables.length;
  out.repairs = findTable(doc, "repairs")?.entries.length ?? 0;
  out.purchases = findTable(doc, "repairs_purchases_info")?.entries.length ?? 0;
  out.characters = findTable(doc, "CharacterProperties")?.entries.length ?? 0;
  out.redesign = findTable(doc, "Redesign")?.entries.length ?? 0;
  return out;
}

const rows = [];
for (const f of FILES) {
  const buf = readFileSync(f);
  const dec = decodeSave(buf);
  const k = dec.key === XOR_KEY ? "XOR_KEY" : dec.key === FRESH_KEY ? "FRESH_KEY" : "recovered";
  rows.push({ file: f.split(/[\\/]/).pop(), size: buf.length, key: k, facts: facts(dec.doc) });
}

for (const r of rows) {
  console.log(`\n=== ${r.file}  ${r.size}B  key=${r.key}`);
  for (const [k, v] of Object.entries(r.facts)) console.log(`    ${k.padEnd(22)} ${JSON.stringify(v)}`);
}

if (rows.length === 2) {
  const [a, b] = rows;
  const changed = Object.keys(a.facts).filter((k) => JSON.stringify(a.facts[k]) !== JSON.stringify(b.facts[k]));
  console.log(`\ndiffers: ${changed.length ? changed.join(", ") : "(none)"}`);
  const idOk = ["PlayerId", "gameId", "name", "level", "coins", "earnedStars", "spentStars", "vietnamBuild"].every(
    (k) => JSON.stringify(a.facts[k]) === JSON.stringify(b.facts[k]),
  );
  const contentKept = b.facts.repairs > a.facts.repairs && b.facts.characters > a.facts.characters && b.facts.purchases > a.facts.purchases;
  console.log(`identity + progress kept : ${idOk ? "PASS" : "FAIL"}`);
  console.log(`cloned content kept      : ${contentKept ? "PASS" : "FAIL"}`);
}
