import { readFileSync } from "node:fs";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const FILES = [
  "C:\\Users\\User\\Downloads\\gardenscapes\\_ref\\mined\\GameData.db",
  "C:\\Users\\User\\Downloads\\gs-local-tool\\gs-local-tool\\dist\\GameData.db",
  "C:\\Users\\User\\Downloads\\Telegram Desktop\\GameData.db",
];

for (const path of FILES) {
  console.log("\n== " + path);
  const raw = readFileSync(path);
  console.log(
    "  raw[0..15] =",
    raw.subarray(0, 16).toString("latin1").replace(/[^\x20-\x7e]/g, "."),
    "| hex",
    raw.subarray(0, 8).toString("hex"),
  );
  const x = Buffer.from(xorBytes(raw));
  console.log(
    "  xor[0..15] =",
    x.subarray(0, 16).toString("latin1").replace(/[^\x20-\x7e]/g, "."),
    "| hex",
    x.subarray(0, 8).toString("hex"),
  );
  try {
    const doc = parseAUDB(x);
    console.log(
      "  tables(" + doc.tables.length + "):",
      doc.tables.map((t: any) => t.name).join(", ").slice(0, 400),
    );
  } catch (e: any) {
    console.log("  PARSE FAIL:", e.message);
  }
  try {
    const doc2 = parseAUDB(raw);
    console.log(
      "  RAW-plain tables(" + doc2.tables.length + "):",
      doc2.tables.map((t: any) => t.name).join(", ").slice(0, 400),
    );
  } catch (e: any) {
    console.log("  RAW parse fail:", e.message);
  }
}
