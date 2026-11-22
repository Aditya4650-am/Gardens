// Decode PLXE device caches (LocalGameData = token/URL, friends caches).
// Run: node --import ./scripts/register-ts-resolve.mjs --experimental-strip-types scripts/decode-gs-caches.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { decodeContainer, extractXml } from "@/lib/server/township/save-decode.server";

const dir = join(process.env.TEMP, "gs-test", "caches");
const outDir = join(process.env.TEMP, "gs-test", "decoded");
import { mkdirSync } from "node:fs";
mkdirSync(outDir, { recursive: true });

for (const name of readdirSync(dir)) {
  const raw = readFileSync(join(dir, name));
  let xml = null;
  const dec = decodeContainer(raw);
  if (dec) xml = extractXml(dec) ?? dec.toString("utf8");
  if (!xml) {
    const asText = raw.toString("utf8");
    if (asText.includes("<")) xml = asText;
  }
  if (xml && xml.includes("<")) {
    writeFileSync(join(outDir, name), xml);
    console.log(`OK   ${name} -> ${xml.length} chars`);
  } else {
    console.log(`FAIL ${name} (raw ${raw.length}B, dec=${dec ? dec.length : "null"})`);
  }
}
