// Gegenstände aus Katalogeinträgen erzeugen.
import type { CatalogEntry, Item, Project } from './types';
import { uid } from './geometry';

/** Raumhöhe für Deckenelemente: höchste Wand bzw. Standardhöhe. */
export function ceilingHeight(p: Project): number {
  return p.walls.length ? Math.max(...p.walls.map((w) => w.height)) : p.defaults.wallHeight;
}

export function newItemFromEntry(e: CatalogEntry, x: number, y: number, p?: Project): Item {
  const z = e.ceiling && p ? Math.max(0, ceilingHeight(p) - e.h) : e.mount ?? 0;
  return {
    id: uid(),
    name: e.name,
    catalogId: e.id,
    type: e.type,
    w: e.w,
    d: e.d,
    h: e.h,
    color: e.color,
    color2: e.color2,
    finish: e.finish,
    params: { ...e.params },
    x,
    y,
    z,
    mount: e.ceiling ? z : e.mount ?? 0,
    ceiling: e.ceiling || undefined,
    rot: 0,
  };
}
