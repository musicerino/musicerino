// Gemeinsame Bearbeitungsfunktionen für 2D- und 3D-Ansicht.
import type { Item, Opening, Project, P, Wall } from './types';
import { pointInItem, rotCW, sub, add, projectOnSegment, wallDir, wallLength, perp, mul, dot, clamp } from './geometry';
import { CATALOG, isTech } from './catalog';
import { depthAt, faceRange, wallSideRooms } from './baseboards';
import { claddingDepthAt } from './claddings';
import { newItemFromEntry } from './items';

export const settings = {
  snapGrid: true,
  gridStep: 5, // cm
  stack: true,
  snapWalls: true,
  /** Maße für das Werkzeug „Halbe Wand“ */
  halfWall: { height: 110, thickness: 11.5 },
};

const NOT_SUPPORT = new Set(['rug', 'mirror', 'picture', 'curtain', 'pendant', 'plant', 'floorlamp', 'tablelamp', 'radiator']);
const canSupport = (o: Item) => !NOT_SUPPORT.has(o.type) && !isTech(o.type);

/** Alle Gegenstände, die (direkt oder indirekt) auf `it` stehen. */
export function stackedOn(p: Project, it: Item, acc: Item[] = []): Item[] {
  if (!canSupport(it)) return acc;
  for (const o of p.items) {
    if (o === it || acc.includes(o) || isTech(o.type)) continue;
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
    if (exclude.has(o.id) || !canSupport(o)) continue;
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
  // Haustechnik behält ihre Montagehöhe (Steckdosen hinter dem Sofa bleiben auf 30 cm)
  if (settings.stack && !it.locked && !isTech(it.type)) {
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

/** Abstand zur Wand (Wandhalter), z.B. Heizkörper ~4 cm. */
export const wallGap = (type: Item['type']) => (type === 'radiator' ? 4 : 0);

const norm360 = (d: number) => ((Math.round(d * 100) / 100) % 360 + 360) % 360;

/**
 * Abstand vor der Wandoberfläche: Verkleidungen (Fliesen, Paneele) und – bei Möbeln – Fußleisten.
 * Haustechnik sitzt auf der Verkleidung, Möbel stehen vor Verkleidung und Fußleiste.
 */
function frontOffset(p: Project, it: Item, w: Wall, side: 1 | -1, s: number): number {
  if (it.ceiling) return 0;
  const clad = claddingDepthAt(p, w, side, s, it.w / 2, it.z, it.z + it.h);
  if (isTech(it.type)) return clad;
  const bb = depthAt(p, w, side, s, it.w / 2);
  return Math.max(clad, bb.depth > 0 && it.z < bb.height ? bb.depth : 0);
}

/**
 * Dockt ein Möbel an eine nahe Wand an: Rückseite an die Wandoberfläche (bzw. vor die Fußleiste),
 * Ausrichtung parallel. Gibt true zurück, wenn angedockt wurde.
 */
export function snapItemToWall(p: Project, it: Item, threshold = 18): boolean {
  if (it.ceiling) return false;
  let best: { w: Wall; n: P; q: P; gap: number; side: 1 | -1; s: number } | null = null;
  for (const w of p.walls) {
    const pr = projectOnSegment({ x: it.x, y: it.y }, w.a, w.b);
    if (pr.t <= 0.001 || pr.t >= 0.999) continue;
    const dir = wallDir(w);
    let n = perp(dir);
    let side: 1 | -1 = 1;
    if (dot(sub({ x: it.x, y: it.y }, pr.q), n) < 0) {
      n = mul(n, -1);
      side = -1;
    }
    // Abstand der Rückseite (bei paralleler Ausrichtung) zur Wandoberfläche
    const gap = pr.d - w.thickness / 2 - Math.min(it.d, it.w) / 2;
    const gapD = pr.d - w.thickness / 2 - it.d / 2;
    const g = Math.min(Math.abs(gap), Math.abs(gapD));
    if (g < threshold && (!best || g < best.gap)) best = { w, n, q: pr.q, gap: g, side, s: pr.s };
  }
  if (!best) return false;
  const { w, n, q, side, s } = best;
  // Rückseite (lokal -y) zeigt zur Wand → Vorderseite (lokal +y) = n
  it.rot = norm360((Math.atan2(-n.x, n.y) * 180) / Math.PI);
  const extra = wallGap(it.type) + frontOffset(p, it, w, side, s);
  const c = add(q, mul(n, w.thickness / 2 + extra + it.d / 2));
  it.x = c.x;
  it.y = c.y;
  return true;
}

/**
 * Setzt ein Element mit der Rückseite an eine Wandseite; s = Mitte entlang der Wand (cm ab Anfang).
 * Mit Projekt `p` sitzt es auf einer eventuellen Verkleidung (Fliesen, Paneele).
 */
export function attachToWall(it: Item, w: Wall, side: 1 | -1, s: number, p?: Project) {
  const dir = wallDir(w);
  const n = mul(perp(dir), side);
  const L = wallLength(w);
  const ss = clamp(s, it.w / 2, Math.max(it.w / 2, L - it.w / 2));
  const extra = p ? frontOffset(p, it, w, side, ss) : 0;
  const c = add(add(w.a, mul(dir, ss)), mul(n, w.thickness / 2 + wallGap(it.type) + extra + it.d / 2));
  it.x = Math.round(c.x * 10) / 10;
  it.y = Math.round(c.y * 10) / 10;
  it.rot = norm360((Math.atan2(-n.x, n.y) * 180) / Math.PI);
}

export interface WallAttachment {
  wall: Wall;
  side: 1 | -1;
  s: number; // Mitte entlang der Wand
  left: number; // Abstand zur linken Innenecke (vom Raum aus auf die Wand geschaut)
  right: number;
  leftIsStart: boolean;
  face: { s0: number; s1: number };
}

/** An welcher Wand hängt/steht ein Element (Rückseite an der Wand)? */
export function wallAttachment(p: Project, it: Item): WallAttachment | null {
  if (it.ceiling) return null;
  const front = rotCW({ x: 0, y: 1 }, it.rot);
  const back = { x: it.x - (front.x * it.d) / 2, y: it.y - (front.y * it.d) / 2 };
  let best: WallAttachment | null = null;
  let bestErr = Infinity;
  for (const w of p.walls) {
    const pr = projectOnSegment(back, w.a, w.b);
    if (pr.t <= 0 || pr.t >= 1) continue;
    const nrm = perp(wallDir(w));
    const side: 1 | -1 = dot(sub(back, pr.q), nrm) >= 0 ? 1 : -1;
    const n = mul(nrm, side);
    if (dot(front, n) < 0.7) continue;
    const err = Math.abs(pr.d - w.thickness / 2 - wallGap(it.type) - frontOffset(p, it, w, side, pr.s));
    if (err > 6 || err >= bestErr) continue;
    bestErr = err;
    const face = faceRange(p, w, side);
    const distStart = pr.s - it.w / 2 - face.s0;
    const distEnd = face.s1 - (pr.s + it.w / 2);
    // Blick vom Raum auf die Wand (entgegen n): rechte Hand = (n.y, -n.x)
    const right = { x: n.y, y: -n.x };
    const endIsRight = dot(wallDir(w), right) > 0;
    best = {
      wall: w,
      side,
      s: pr.s,
      left: endIsRight ? distStart : distEnd,
      right: endIsRight ? distEnd : distStart,
      leftIsStart: endIsRight,
      face,
    };
  }
  return best;
}

/** Abstand zur linken oder rechten Innenecke setzen. */
export function setWallDistance(p: Project, it: Item, which: 'left' | 'right', v: number) {
  const a = wallAttachment(p, it);
  if (!a) return;
  const fromStart = (which === 'left') === a.leftIsStart;
  const s = fromStart ? a.face.s0 + v + it.w / 2 : a.face.s1 - v - it.w / 2;
  attachToWall(it, a.wall, a.side, s, p);
}

/** Wandseite, an der ein Raum liegt (bevorzugt +1). */
export function roomSide(p: Project, w: Wall, prefer: 1 | -1 = 1): 1 | -1 {
  const rooms = wallSideRooms(p, w);
  if (rooms[prefer]) return prefer;
  if (rooms[(-prefer) as 1 | -1]) return (-prefer) as 1 | -1;
  return prefer;
}

/** Heizkörper passend unter ein Fenster: ca. 85 % der Fensterbreite, Höhe nach Brüstung. */
export function radiatorUnderWindow(p: Project, o: Opening): Item | null {
  const w = p.walls.find((x) => x.id === o.wallId);
  const base = CATALOG.find((c) => c.id === 'hkTyp22');
  if (!w || !base) return null;
  const floorGap = 12;
  const free = o.sill - floorGap - 8;
  const h = [90, 60, 50, 40, 30].find((v) => v <= free);
  if (!h) return null;
  const width = clamp(Math.round((o.width * 0.85) / 10) * 10, 40, 300);
  const it = newItemFromEntry({ ...base, w: width, h, name: `Heizkörper Typ 22 · ${h} × ${width}` }, 0, 0, p);
  it.z = it.mount = floorGap;
  attachToWall(it, w, roomSide(p, w), o.offset, p);
  return it;
}

/** Lichtschalter neben eine Tür: Griffseite, 15 cm neben der Öffnung, in 105 cm Höhe. */
export function switchNextToDoor(p: Project, o: Opening): Item | null {
  const w = p.walls.find((x) => x.id === o.wallId);
  const base = CATALOG.find((c) => c.id === 'schalter');
  if (!w || !base) return null;
  const it = newItemFromEntry(base, 0, 0, p);
  const side: 1 | -1 = o.swingOut ? -1 : 1;
  const face = faceRange(p, w, side);
  const latchHigh = !o.hingeRight; // Anschlag links → Griff am Ende mit größerem s
  const candidates = [
    latchHigh ? o.offset + o.width / 2 + 15 + it.w / 2 : o.offset - o.width / 2 - 15 - it.w / 2,
    latchHigh ? o.offset - o.width / 2 - 15 - it.w / 2 : o.offset + o.width / 2 + 15 + it.w / 2,
  ];
  const s = candidates.find((c) => c - it.w / 2 >= face.s0 + 3 && c + it.w / 2 <= face.s1 - 3) ?? candidates[0];
  attachToWall(it, w, side, s, p);
  return it;
}

/** Element per Antippen an einer Wand (bzw. an der Decke) platzieren. */
export function placementAt(p: Project, it: Item, pt: P, tol: number): boolean {
  if (it.ceiling) {
    it.x = Math.round(pt.x);
    it.y = Math.round(pt.y);
    return true;
  }
  let best: { w: Wall; d: number; s: number; side: 1 | -1 } | null = null;
  for (const w of p.walls) {
    const pr = projectOnSegment(pt, w.a, w.b);
    if (pr.d > w.thickness / 2 + tol) continue;
    const side: 1 | -1 = dot(sub(pt, pr.q), perp(wallDir(w))) >= 0 ? 1 : -1;
    if (!best || pr.d < best.d) best = { w, d: pr.d, s: pr.s, side };
  }
  if (!best) return false;
  // Liegt der Klick fast auf der Wandachse, die Seite mit Raum wählen
  const side = best.d < best.w.thickness / 4 ? roomSide(p, best.w, best.side) : best.side;
  attachToWall(it, best.w, side, Math.round(best.s), p);
  return true;
}

export interface TechAttachment {
  id: string;
  wallId: string;
  side: 1 | -1;
}

/** Merkt sich, welche Haustechnik an welcher Wand hängt (vor dem Verschieben von Wänden). */
export function techAttachments(p: Project): TechAttachment[] {
  const out: TechAttachment[] = [];
  for (const it of p.items) {
    if (!isTech(it.type) || it.ceiling) continue;
    const a = wallAttachment(p, it);
    if (a) out.push({ id: it.id, wallId: a.wall.id, side: a.side });
  }
  return out;
}

/** Hängt die Haustechnik nach einer Wandänderung wieder an ihre Wand (Position entlang der Wand bleibt). */
export function reattachTech(p: Project, list: TechAttachment[]) {
  for (const a of list) {
    const it = p.items.find((i) => i.id === a.id);
    const w = p.walls.find((x) => x.id === a.wallId);
    if (!it || !w) continue;
    const pr = projectOnSegment({ x: it.x, y: it.y }, w.a, w.b);
    attachToWall(it, w, a.side, pr.s, p);
  }
}
