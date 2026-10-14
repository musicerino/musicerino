// Gemeinsame Bearbeitungsfunktionen für 2D- und 3D-Ansicht.
import type { Item, Project, P, Wall } from './types';
import { pointInItem, rotCW, sub, add, projectOnSegment, wallDir, perp, mul, dot } from './geometry';

export const settings = {
  snapGrid: true,
  gridStep: 5, // cm
  stack: true,
  snapWalls: true,
};

const NOT_SUPPORT = new Set(['rug', 'mirror', 'picture', 'curtain', 'pendant', 'plant', 'floorlamp', 'tablelamp', 'radiator']);

/** Alle Gegenstände, die (direkt oder indirekt) auf `it` stehen. */
export function stackedOn(p: Project, it: Item, acc: Item[] = []): Item[] {
  if (NOT_SUPPORT.has(it.type)) return acc;
  for (const o of p.items) {
    if (o === it || acc.includes(o)) continue;
    if (Math.abs(o.z - (it.z + it.h)) < 1.5 && pointInItem(it, { x: o.x, y: o.y })) {
      acc.push(o);
      stackedOn(p, o, acc);
    }
  }
  return acc;
}

/** Oberstes Möbel unter Punkt (x,y), auf das man etwas stellen kann. */
export function supportAt(p: Project, pt: P, exclude: Set<string>): Item | null {
  let best: Item | null = null;
  for (const o of p.items) {
    if (exclude.has(o.id) || NOT_SUPPORT.has(o.type)) continue;
    if (!pointInItem(o, pt)) continue;
    if (!best || o.z + o.h > best.z + best.h) best = o;
  }
  return best;
}

/** Bewegt ein Möbel (inkl. daraufstehender Dinge) nach (x,y) und bestimmt die Stapelhöhe. */
export function moveItemTo(p: Project, it: Item, x: number, y: number, children: Item[]) {
  const dx = x - it.x;
  const dy = y - it.y;
  const oldZ = it.z;
  it.x = x;
  it.y = y;
  if (settings.stack && !it.locked) {
    const ex = new Set([it.id, ...children.map((c) => c.id)]);
    const sup = supportAt(p, { x, y }, ex);
    it.z = sup ? sup.z + sup.h : it.mount ?? 0;
  }
  const dz = it.z - oldZ;
  for (const c of children) {
    c.x += dx;
    c.y += dy;
    c.z += dz;
  }
}

export function rotateItemTo(it: Item, rot: number, children: Item[]) {
  const d = rot - it.rot;
  it.rot = ((rot % 360) + 360) % 360;
  for (const c of children) {
    const v = rotCW(sub({ x: c.x, y: c.y }, { x: it.x, y: it.y }), d);
    const np = add({ x: it.x, y: it.y }, v);
    c.x = np.x;
    c.y = np.y;
    c.rot = (((c.rot + d) % 360) + 360) % 360;
  }
}

/**
 * Dockt ein Möbel an eine nahe Wand an: Rückseite an die Wandoberfläche, Ausrichtung parallel.
 * Gibt true zurück, wenn angedockt wurde.
 */
export function snapItemToWall(p: Project, it: Item, threshold = 18): boolean {
  let best: { w: Wall; n: P; q: P; gap: number } | null = null;
  for (const w of p.walls) {
    const pr = projectOnSegment({ x: it.x, y: it.y }, w.a, w.b);
    if (pr.t <= 0.001 || pr.t >= 0.999) continue;
    const dir = wallDir(w);
    let n = perp(dir);
    if (dot(sub({ x: it.x, y: it.y }, pr.q), n) < 0) n = mul(n, -1);
    // Abstand der Rückseite (bei paralleler Ausrichtung) zur Wandoberfläche
    const gap = pr.d - w.thickness / 2 - Math.min(it.d, it.w) / 2;
    const gapD = pr.d - w.thickness / 2 - it.d / 2;
    const g = Math.min(Math.abs(gap), Math.abs(gapD));
    if (g < threshold && (!best || g < best.gap)) best = { w, n, q: pr.q, gap: g };
  }
  if (!best) return false;
  const { w, n, q } = best;
  // Rückseite (lokal -y) zeigt zur Wand → Vorderseite (lokal +y) = n
  const rot = (Math.atan2(-n.x, n.y) * 180) / Math.PI;
  it.rot = ((Math.round(rot * 100) / 100) % 360 + 360) % 360;
  const c = add(q, mul(n, w.thickness / 2 + it.d / 2));
  it.x = c.x;
  it.y = c.y;
  return true;
}
