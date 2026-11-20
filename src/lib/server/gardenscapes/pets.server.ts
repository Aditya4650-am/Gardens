// Pets — `CharacterProperties.<cluster>.<pet>.Active`.
//
// The tab lists only the animals the loaded save actually holds. Ids and
// labels come from the game's own `assets/base1/GardenPersons.xml`, but a pet
// with no entry in any cluster is not offered at all: the garden engine cannot
// spawn a character the area never created, so a button for it would be a lie.
//
// Writing is the measured shape and nothing else:
//   CharacterProperties.<cluster>.<pet>.Active = t|f

import { findTable, objEntries, type ObjChild } from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";
import { GS_PETS } from "./catalogs.ts";

const TABLE = "CharacterProperties";

export interface GsPetInfo {
  id: string;
  label: string;
  emoji?: string;
  /** Clusters where the character exists in this save. */
  clusters: number;
  /** True when every copy is switched on. */
  active: boolean;
}

function clusterEntries(d: AUDBDocument): AUDBEntry[] {
  const t = findTable(d, TABLE);
  return t ? t.entries.filter((e) => e.type === "o") : [];
}

function petIn(cluster: AUDBEntry, id: string): ObjChild[] | null {
  const hit = objEntries(cluster).find(([k]) => k === id);
  return hit && hit[1][0] === "o" ? (hit[1][1] as ObjChild[]) : null;
}

/** Only the pets this save actually holds, in catalog order. */
export function listPets(s: GardenscapesSession): GsPetInfo[] {
  const clusters = clusterEntries(s.decoded.doc);
  const out: GsPetInfo[] = [];
  for (const pet of GS_PETS) {
    let present = 0;
    let on = 0;
    for (const c of clusters) {
      const kids = petIn(c, pet.id);
      if (!kids) continue;
      present++;
      const a = kids.find(([k]) => k === "Active");
      if (a && a[1][1] === true) on++;
    }
    if (present === 0) continue;
    out.push({
      id: pet.id,
      label: pet.label,
      emoji: pet.emoji,
      clusters: present,
      active: on === present,
    });
  }
  return out;
}

/** Switch one pet on / off wherever this save holds it. */
export function setPet(s: GardenscapesSession, id: string, on: boolean): EditResult {
  if (!GS_PETS.some((p) => p.id === id)) throw new Error(`pets: unknown pet "${id}"`);
  const changed: string[] = [];
  for (const c of clusterEntries(s.decoded.doc)) {
    const kids = petIn(c, id);
    if (!kids) continue;
    const a = kids.find(([k]) => k === "Active");
    if (!a) {
      kids.push(["Active", [on ? "t" : "f", on]]);
      changed.push(`${TABLE}.${c.key}.${id}.Active`);
      continue;
    }
    if (a[1][1] === on && a[1][0] === (on ? "t" : "f")) continue;
    a[1] = [on ? "t" : "f", on];
    changed.push(`${TABLE}.${c.key}.${id}.Active`);
  }
  if (changed.length) s.log.push(`Pets: ${id} ${on ? "active" : "off"}`);
  return { changed, missing: [] };
}

/** Switch on every pet the save holds. */
export function unlockAllPets(s: GardenscapesSession): EditResult {
  const changed: string[] = [];
  for (const pet of listPets(s)) {
    const r = setPet(s, pet.id, true);
    changed.push(...r.changed);
  }
  if (changed.length) s.log.push(`Pets: ${changed.length} flag(s) active`);
  return { changed, missing: [] };
}
