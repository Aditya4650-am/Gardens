// Engine verification: decode -> read known paths -> write -> round-trip.
// Run: node --experimental-strip-types scripts/gs-verify-engine.ts [savePath]
//
// The default save is the device pull in %TEMP%/opencode/gs/snap/GameData.db
// (raw cipher bytes, exactly what ADB hands us). Any path may be passed as argv
// 2; a `.plain` file (already XOR-decoded) is detected and re-XORed first, so
// either snapshot shape works.
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseAUDB, serializeAUDB } from "../src/lib/gardenscapes/codec.ts";
import {
  decodeSave,
  encodeSave,
  findEntry,
  findTable,
  getAt,
  getTypeAt,
  objEntries,
  readPath,
  toInt,
  writeNumber,
  writeString,
} from "../src/lib/gardenscapes/save-engine.ts";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";

const DEFAULT =
  "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\gs\\snap\\GameData.db";
const path = process.argv[2] ?? DEFAULT;
const raw: Buffer = readFileSync(path);

// A `.plain` snapshot is already decoded, so it has to be re-XORed to get the
// shape ADB hands us. Everything else is taken as cipher bytes as-is.
const cipher = path.endsWith(".plain") ? Buffer.from(xorBytes(raw)) : raw;
const plain = path.endsWith(".plain") ? raw : Buffer.from(xorBytes(cipher));

const dec = decodeSave(cipher);
const doc = dec.doc;

let fail = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (ok) console.log(`  ok   ${name}${extra ? " — " + extra : ""}`);
  else {
    console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`);
    fail++;
  }
}

console.log(`== decode ${path} (${cipher.length} B) ==`);
check("parses", doc.tables.length > 0, `tables=${doc.tables.length}`);
check("version preserved", dec.version === parseAUDB(plain).version);

console.log("== round trip (no edit) ==");
const rt = encodeSave(dec.doc);
check(
  "byte exact",
  rt.length === cipher.length && rt.equals(cipher),
  `${rt.length} vs ${cipher.length}`,
);

console.log("== read known paths ==");
const coins = toInt(readPath(doc, "TableName", "Properties", "coins"));
const level = toInt(readPath(doc, "TableName", "Properties", "level"));
const stars = toInt(readPath(doc, "TableName", "Properties", "earnedStars"));
const chapter = readPath(doc, "TableName", "Properties", "GardenCurrentChapterId");
check("coins is int", coins !== null, `coins=${coins}`);
check("level is int", level !== null, `level=${level}`);
check("earnedStars is int", stars !== null, `stars=${stars}`);
check(
  "GardenCurrentChapterId is a string",
  typeof chapter === "string" && chapter.startsWith("chapter"),
  `chapter=${String(chapter)}`,
);
check(
  "items.BombsBoost is int",
  toInt(readPath(doc, "items", "BombsBoost", "")) !== null,
);

console.log("== object child shapes ==");
const props = findEntry(findTable(doc, "TableName")!, "Properties")!;
check("Properties is an object", props.type === "o");
const nProps = objEntries(props).length;
check("Properties holds hundreds of keys", nProps > 100, `n=${nProps}`);

const special = findTable(doc, "SpecialEvents");
check("SpecialEvents table present", Boolean(special));
const seasonKeys = special
  ? special.entries.filter((e) => /^Season\d+$/.test(e.key)).map((e) => e.key)
  : [];
check("season entries found", seasonKeys.length > 0, seasonKeys.join(","));

console.log("== write, then re-read ==");
const entryCount = (d: { tables: { entries: unknown[] }[] }): number =>
  d.tables.reduce((n, t) => n + t.entries.length, 0);
const before = serializeAUDB(doc);
const entriesBefore = entryCount(parseAUDB(plain));

writeNumber(doc, "TableName", "Properties", "coins", 9999999);
check(
  "coins now 9999999",
  toInt(readPath(doc, "TableName", "Properties", "coins")) === 9999999,
);
writeString(doc, "TableName", "Properties", "GardenCurrentChapterId", "chapter70");
check(
  'chapter now "chapter70"',
  readPath(doc, "TableName", "Properties", "GardenCurrentChapterId") === "chapter70",
);

// Golden pass: buy the first season the save actually holds.
const seasonKey = seasonKeys[0];
if (seasonKey) {
  writeNumber(doc, "SpecialEvents", seasonKey, "Purchases.GoldPass.BoughtCount", 1);
  check(
    `${seasonKey} GoldPass.BoughtCount == 1`,
    toInt(readPath(doc, "SpecialEvents", seasonKey, "Purchases.GoldPass.BoughtCount")) === 1,
  );
}

// Boosters: raise one.
writeNumber(doc, "items", "BombsBoost", "", 9999);
check("items.BombsBoost == 9999", toInt(readPath(doc, "items", "BombsBoost", "")) === 9999);

console.log("== type preservation ==");
const after = serializeAUDB(doc);
check("edited doc still serializes", after.length > 0 && after.length >= before.length, `${after.length} B`);
const reenc = encodeSave(dec.doc);
const redec = decodeSave(reenc);
check("edited cipher parses back", redec.doc.tables.length === doc.tables.length);
check(
  "coins kept int32 type",
  getTypeAt(
    findEntry(findTable(redec.doc, "TableName")!, "Properties")!,
    "coins",
  ) === "i",
);

console.log("== write is a small delta, not a rewrite ==");
const entriesAfter = entryCount(redec.doc);
check(
  "entry count unchanged",
  entriesBefore === entriesAfter,
  `${entriesBefore} vs ${entriesAfter}`,
);

console.log(fail === 0 ? "\nENGINE_OK" : `\nENGINE_FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
