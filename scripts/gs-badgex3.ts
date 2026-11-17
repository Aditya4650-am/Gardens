import { readFileSync } from "node:fs";
import { xorBytes } from "../src/lib/gardenscapes/crypto.ts";
import { parseAUDB } from "../src/lib/gardenscapes/codec.ts";

const path = "C:\\Users\\User\\Downloads\\gardenscapes\\_ref\\mined\\GameData.db";
const raw = readFileSync(path);
const doc = parseAUDB(Buffer.from(xorBytes(raw)));
const T = (n: string) => doc.tables.find((t: any) => t.name === n);

const se = T("SpecialEvents");
console.log("SpecialEvents entries:", se?.entries?.length);
console.log(
  "  keys sample:",
  se?.entries?.slice(0, 40).map((e: any) => `${e.key}:${e.type}`).join(" "),
);
const pp = se?.entries.find((e: any) => e.key === "PlayerProfileOwn");
console.log("pp:", pp ? pp.type : "MISSING");
if (pp) {
  console.log("pp.value:", JSON.stringify(pp.value).slice(0, 300));
}

const f = T("Features");
console.log("Features entries:", f?.entries?.length);
const pg = f?.entries.find((e: any) => e.key === "ProfileBadgesGFF");
console.log("pg:", pg ? pg.type : "MISSING");
if (pg) console.log("pg.value:", JSON.stringify(pg.value).slice(0, 500));
