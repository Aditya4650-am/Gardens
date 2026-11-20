// Pets — `CharacterProperties.<cluster>.<pet>.Active`.
//
// Measured shape (live MEmu save):
//   CharacterProperties
//     cluster1 … cluster6      (one per garden area)
//       <Pet> { Active t|f, LastPosition s "x,y,z,dir", AddModel s … }
//
// Only characters that carry `Active` in at least one cluster are listed in
// `GS_PETS` — those are the ones the game itself switches on and off. The
// ambient animals (rabbits, ducks, swans, crabs, whales…) have no such flag in
// any save, so this module never invents one for them.
//
// Turning a pet on sets `Active = true` in every cluster that already holds
// the field. Turning it off does the opposite. Nothing else is touched, so a
// position or model the save already carries survives.

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
  /** Clusters where the character exists. */
  clusters: number;
  /** Clusters where it carries an `Active` field. */
  toggleable: number;
  /** True when every toggleable cluster is on. */
  active: boolean;
}

function clusterEntries(d: AUDBDocument): AUDBEntry[] {
  const t = findTable(d, TABLE);
  return t ? t.entries.filter((e) => e.type === "o") : [];
}

/** The pet object inside one cluster, or null. */
function petIn(cluster: AUDBEntry, id: string): ObjChild[] | null {
  const hit = objEntries(cluster).find(([k]) => k === id);
  return hit && hit[1][0] === "o" ? (hit[1][1] as ObjChild[]) : null;
}

export function listPets(s: GardenscapesSession): GsPetInfo[] {
  const clusters = clusterEntries(s.decoded.doc);
  return GS_PETS.map((pet) => {
    let present = 0;
    let toggleable = 0;
    let on = 0;
    for (const c of clusters) {
      const kids = petIn(c, pet.id);
      if (!kids) continue;
      present++;
      const a = kids.find(([k]) => k === "Active");
      if (!a) continue;
      toggleable++;
      if (a[1][1] === true) on++;
    }
    return {
      id: pet.id,
      label: pet.label,
      emoji: pet.emoji,
      clusters: present,
      toggleable,
      active: toggleable > 0 && on === toggleable,
    };
  }).filter((p) => p.clusters > 0);
}

/** Switch one pet on / off in every cluster that carries its `Active` flag. */
export function setPet(s: GardenscapesSession, id: string, on: boolean): EditResult {
  if (!GS_PETS.some((p) => p.id === id)) throw new Error(`pets: unknown pet "${id}"`);
  const changed: string[] = [];
  const missing: string[] = [];
  for (const c of clusterEntries(s.decoded.doc)) {
    const kids = petIn(c, id);
    if (!kids) continue;
    const a = kids.find(([k]) => k === "Active");
    if (!a) {
      missing.push(`${TABLE}.${c.key}.${id}.Active`);
      continue;
    }
    if (a[1][1] === on && a[1][0] === (on ? "t" : "f")) continue;
    a[1] = [on ? "t" : "f", on];
    changed.push(`${TABLE}.${c.key}.${id}.Active`);
  }
  if (changed.length) s.log.push(`Pets: ${id} ${on ? "active" : "off"}`);
  return { changed, missing };
}

/** Switch every listed pet on. */
export function unlockAllPets(s: GardenscapesSession): EditResult {
  const changed: string[] = [];
  const missing: string[] = [];
  for (const pet of GS_PETS) {
    const r = setPet(s, pet.id, true);
    changed.push(...r.changed);
    missing.push(...r.missing);
  }
  if (changed.length) s.log.push(`Pets: ${changed.length} flag(s) active`);
  return { changed, missing };
}
