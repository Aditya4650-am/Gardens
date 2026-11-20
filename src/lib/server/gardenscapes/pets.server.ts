// Pets — `CharacterProperties.<cluster>.<pet>.Active`.
//
// Ids come from the shipped `assets/base1/GardenPersons.xml` (the game's own
// character table, extracted from the installed APK) unioned with the animals
// a live save carries. For each pet:
//
//   exists in the cluster -> flip its `Active` flag (the shape the game writes)
//   absent                -> materialise it with `Active = true` and a
//                            `LastPosition` copied from the player in that
//                            cluster, so it spawns on screen instead of at 0,0.
//
// Nothing else is touched: models, settings and existing positions survive.

import { findTable, objEntries, type ObjChild } from "@/lib/gardenscapes/save-engine";
import { type AUDBDocument, type AUDBEntry } from "@/lib/gardenscapes/codec";
import { type EditResult } from "./common.server";
import { type GardenscapesSession } from "./session.server";
import { GS_PETS } from "./catalogs.ts";

const TABLE = "CharacterProperties";
/** Clusters where the player stands; used as the spawn anchor. */
const ANCHORS = ["MainOstin", "MainDog", "Cat", "Horse"];

export interface GsPetInfo {
  id: string;
  label: string;
  emoji?: string;
  /** Clusters where the character exists right now. */
  clusters: number;
  /** True when every existing copy is switched on. */
  active: boolean;
  /** True when the save has never spawned this character. */
  missing: boolean;
}

function clusterEntries(d: AUDBDocument): AUDBEntry[] {
  const t = findTable(d, TABLE);
  return t ? t.entries.filter((e) => e.type === "o") : [];
}

function petIn(cluster: AUDBEntry, id: string): ObjChild[] | null {
  const hit = objEntries(cluster).find(([k]) => k === id);
  return hit && hit[1][0] === "o" ? (hit[1][1] as ObjChild[]) : null;
}

/** A position already inside this cluster, so a new pet lands on screen. */
function anchorPosition(cluster: AUDBEntry): string | null {
  for (const name of ANCHORS) {
    const kids = petIn(cluster, name);
    const pos = kids?.find(([k]) => k === "LastPosition")?.[1][1];
    if (typeof pos === "string" && /^-?\d+,-?\d+/.test(pos)) return pos;
  }
  for (const [, [ty, v]] of objEntries(cluster)) {
    if (ty !== "o") continue;
    const pos = (v as ObjChild[]).find(([k]) => k === "LastPosition")?.[1][1];
    if (typeof pos === "string" && /^-?\d+,-?\d+/.test(pos)) return pos;
  }
  return null;
}

export function listPets(s: GardenscapesSession): GsPetInfo[] {
  const clusters = clusterEntries(s.decoded.doc);
  return GS_PETS.map((pet) => {
    let present = 0;
    let on = 0;
    for (const c of clusters) {
      const kids = petIn(c, pet.id);
      if (!kids) continue;
      present++;
      const a = kids.find(([k]) => k === "Active");
      if (a && a[1][1] === true) on++;
    }
    return {
      id: pet.id,
      label: pet.label,
      emoji: pet.emoji,
      clusters: present,
      active: present > 0 && on === present,
      missing: present === 0,
    };
  });
}

/** Switch one pet on / off, creating it where the save never had it. */
export function setPet(s: GardenscapesSession, id: string, on: boolean): EditResult {
  if (!GS_PETS.some((p) => p.id === id)) throw new Error(`pets: unknown pet "${id}"`);
  const changed: string[] = [];
  const missing: string[] = [];
  for (const c of clusterEntries(s.decoded.doc)) {
    const kids = petIn(c, id);
    if (!kids) {
      if (!on) continue;
      const pos = anchorPosition(c);
      const obj: ObjChild[] = [["Active", ["t", true]]];
      if (pos) obj.push(["LastPosition", ["s", pos]]);
      objEntries(c).push([id, ["o", obj]]);
      changed.push(`${TABLE}.${c.key}.${id}`);
      continue;
    }
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
  return { changed, missing };
}

/** Switch every listed pet on — creating the ones the save never had. */
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
