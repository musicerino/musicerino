// Fußleisten: Verlauf entlang der Wandoberflächen berechnen (für 2D, 3D und Bedarf).
//
// Zwei Arten:
//  • Raum-Fußleiste „rundum“: folgt automatisch allen Wänden des Raums, spart Türen aus
//    und lässt abgewählte Wände weg.
//  • Einzelstücke (geteilte / teilweise Fußleisten): an einer Wandseite mit Start und Länge.
//
// Alle Positionen entlang einer Wand werden als s (cm ab Wandanfang, auf der Achse) angegeben.
import type { Baseboard, BaseboardStyle, P, Project, Room, RoomBaseboard, Wall } from './types';
import { add, cross, dot, mul, norm, perp, polygonArea, sub, wallDir, wallLength } from './geometry';

export interface Run {
  wall: Wall;
  side: 1 | -1;
  s0: number;
  s1: number;
  style: BaseboardStyle;
  roomId?: string;
  pieceId?: string;
}

export const DEFAULT_BASEBOARD: RoomBaseboard = {
  on: true,
  height: 6,
  depth: 1.6,
  color: '#f4f3ef',
  finish: 'lack',
  profile: 'gerade',
  pieceLength: 240,
};

export const BASEBOARD_PRESETS: { label: string; style: Partial<BaseboardStyle> }[] = [
  { label: 'Modern weiß 6 cm', style: { height: 6, depth: 1.6, color: '#f4f3ef', finish: 'lack', profile: 'gerade' } },
  { label: 'Hoch weiß 10 cm', style: { height: 10, depth: 1.8, color: '#f4f3ef', finish: 'lack', profile: 'gerade' } },
  { label: 'Altbau 14 cm', style: { height: 14, depth: 2.2, color: '#f4f3ef', finish: 'lack', profile: 'klassisch' } },
  { label: 'Eiche 6 cm', style: { height: 6, depth: 1.6, color: '#c9a374', finish: 'holz', profile: 'rund' } },
  { label: 'Fliesensockel 8 cm', style: { height: 8, depth: 0.9, color: '#e9e6e0', finish: 'glanz', profile: 'gerade' } },
  { label: 'Schwarz 4 cm', style: { height: 4, depth: 1.2, color: '#2b2c2e', finish: 'lack', profile: 'gerade' } },
];

export function defaultRoomBaseboard(): RoomBaseboard {
  return { ...DEFAULT_BASEBOARD, skip: [] };
}

export function styleOf(b: BaseboardStyle): BaseboardStyle {
  return { height: b.height, depth: b.depth, color: b.color, finish: b.finish, profile: b.profile };
}

/** Liegt die Kante a→b auf der Wand w (kollinear, überlappend)? Gibt die Überlappung in s zurück. */
function coverage(w: Wall, a: P, b: P): { lo: number; hi: number; sa: number; sb: number } | null {
  const L = wallLength(w);
  if (L < 0.5) return null;
  const dir = wallDir(w);
  const nrm = perp(dir);
  const da = Math.abs(dot(sub(a, w.a), nrm));
  const db = Math.abs(dot(sub(b, w.a), nrm));
  if (da > 1.5 || db > 1.5) return null;
  const sa = dot(sub(a, w.a), dir);
  const sb = dot(sub(b, w.a), dir);
  const lo = Math.max(Math.min(sa, sb), 0);
  const hi = Math.min(Math.max(sa, sb), L);
  if (hi - lo < 1) return null;
  return { lo, hi, sa, sb };
}

/** Schnittpunkt zweier Geraden (Punkt + Richtung). */
function intersect(p1: P, d1: P, p2: P, d2: P): P | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, mul(d1, t));
}

/** Türen (und bodentiefe Öffnungen) einer Wand als s-Intervalle. */
function doorGaps(p: Project, w: Wall): [number, number][] {
  return p.openings
    .filter((o) => o.wallId === w.id && o.sill < 3)
    .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as [number, number]);
}

function subtract(s0: number, s1: number, gaps: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[s0, s1]];
  for (const [g0, g1] of gaps) {
    const next: [number, number][] = [];
    for (const [a, b] of parts) {
      if (g1 <= a || g0 >= b) next.push([a, b]);
      else {
        if (g0 > a) next.push([a, g0]);
        if (g1 < b) next.push([g1, b]);
      }
    }
    parts = next;
  }
  return parts.filter(([a, b]) => b - a > 0.5);
}

/** Wände eines Raums: je Raumkante die passenden Wände samt Wandseite (zum Raum hin). */
export function roomWalls(p: Project, r: Room): { wall: Wall; side: 1 | -1; edge: number }[] {
  const pts = r.points;
  const n = pts.length;
  if (n < 3) return [];
  const sign = polygonArea(pts) > 0 ? 1 : -1;
  const out: { wall: Wall; side: 1 | -1; edge: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const inward = mul(perp(norm(sub(b, a))), sign);
    for (const w of p.walls) {
      if (!coverage(w, a, b)) continue;
      const side: 1 | -1 = dot(inward, perp(wallDir(w))) >= 0 ? 1 : -1;
      if (!out.some((o) => o.wall === w && o.side === side)) out.push({ wall: w, side, edge: i });
    }
  }
  return out;
}

/** Automatische Fußleiste rundum für einen Raum. */
export function roomRuns(p: Project, r: Room): Run[] {
  const bb = r.baseboard;
  if (!bb || !bb.on) return [];
  const pts = r.points;
  const n = pts.length;
  if (n < 3) return [];
  const sign = polygonArea(pts) > 0 ? 1 : -1;
  const edges = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dir = norm(sub(b, a));
    const inward = mul(perp(dir), sign);
    const walls = p.walls.map((w) => ({ w, cov: coverage(w, a, b) })).filter((x) => x.cov);
    const t = walls.length ? Math.max(...walls.map((x) => x.w.thickness)) : 0;
    return { a, b, dir, inward, walls, t };
  });
  // Innenecken = Schnitt der um die halbe Wandstärke nach innen versetzten Kanten
  const corners: P[] = edges.map((e, i) => {
    const prev = edges[(i - 1 + n) % n];
    const p1 = add(prev.a, mul(prev.inward, prev.t / 2));
    const p2 = add(e.a, mul(e.inward, e.t / 2));
    return intersect(p1, prev.dir, p2, e.dir) ?? p2;
  });
  // Außenecken (Raumwinkel > 180°): dort umläuft die Leiste die Ecke
  const reflex = edges.map((e, i) => cross(edges[(i - 1 + n) % n].dir, e.dir) * sign < -1e-6);
  const runs: Run[] = [];
  const skip = new Set(bb.skip ?? []);
  edges.forEach((e, i) => {
    for (const { w, cov } of e.walls) {
      if (!cov || skip.has(w.id)) continue;
      const dirW = wallDir(w);
      const side: 1 | -1 = dot(e.inward, perp(dirW)) >= 0 ? 1 : -1;
      // s-Werte der Innenecken auf dieser Wand
      const cA = dot(sub(corners[i], w.a), dirW);
      const cB = dot(sub(corners[(i + 1) % n], w.a), dirW);
      const forward = cov.sb >= cov.sa; // Kante läuft in Wandrichtung?
      const [startCorner, endCorner] = forward ? [cA, cB] : [cB, cA];
      const startIsCorner = Math.abs(cov.lo - Math.min(cov.sa, cov.sb)) < 1;
      const endIsCorner = Math.abs(cov.hi - Math.max(cov.sa, cov.sb)) < 1;
      let s0 = startIsCorner ? startCorner : cov.lo;
      let s1 = endIsCorner ? endCorner : cov.hi;
      // An Außenecken um die Leistenstärke verlängern
      const reflexStart = forward ? reflex[i] : reflex[(i + 1) % n];
      const reflexEnd = forward ? reflex[(i + 1) % n] : reflex[i];
      if (startIsCorner && reflexStart) s0 -= bb.depth;
      if (endIsCorner && reflexEnd) s1 += bb.depth;
      if (s1 - s0 < 1) continue;
      for (const [a, b] of subtract(s0, s1, doorGaps(p, w))) runs.push({ wall: w, side, s0: a, s1: b, style: styleOf(bb), roomId: r.id });
    }
  });
  return runs;
}

export function pieceRun(p: Project, bp: Baseboard): Run[] {
  const w = p.walls.find((x) => x.id === bp.wallId);
  if (!w) return [];
  return subtract(bp.start, bp.start + bp.length, doorGaps(p, w)).map(([a, b]) => ({ wall: w, side: bp.side, s0: a, s1: b, style: styleOf(bp), pieceId: bp.id }));
}

export function allRuns(p: Project): Run[] {
  const out: Run[] = [];
  for (const r of p.rooms) out.push(...roomRuns(p, r));
  for (const bp of p.baseboards ?? []) out.push(...pieceRun(p, bp));
  return out;
}

export const runLength = (r: Run) => Math.max(0, r.s1 - r.s0);

/** Gesamtlänge und Stückzahl (mit 10 % Verschnitt). */
export function demand(runs: Run[], pieceLength = 240): { total: number; pieces: number } {
  const total = runs.reduce((s, r) => s + runLength(r), 0);
  return { total, pieces: total > 0 ? Math.ceil((total * 1.1) / Math.max(50, pieceLength)) : 0 };
}

/** Die Innenkante (Wandoberfläche) einer Wandseite, als s-Bereich, z.B. für „ganze Wand“. */
export function faceRange(p: Project, w: Wall, side: 1 | -1): { s0: number; s1: number } {
  // Bevorzugt aus einem angrenzenden Raum bestimmen (exakte Innenecken)
  for (const r of p.rooms) {
    const tmp: Room = { ...r, baseboard: { ...DEFAULT_BASEBOARD, on: true, depth: 0, skip: [] } };
    const runs = roomRuns({ ...p, openings: [] }, tmp).filter((x) => x.wall.id === w.id && x.side === side);
    if (runs.length) return { s0: Math.min(...runs.map((x) => x.s0)), s1: Math.max(...runs.map((x) => x.s1)) };
  }
  // sonst: halbe Stärke der anschließenden Wände abziehen
  const L = wallLength(w);
  const at = (q: P) => Math.max(0, ...p.walls.filter((o) => o !== w && (dist2(o.a, q) < 1 || dist2(o.b, q) < 1)).map((o) => o.thickness / 2));
  return { s0: at(w.a), s1: L - at(w.b) };
}

const dist2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Tiefe der Fußleiste an einer Stelle (für Möbel, die vor der Leiste stehen). */
export function depthAt(p: Project, w: Wall, side: 1 | -1, s: number, halfWidth: number): { depth: number; height: number } {
  let depth = 0;
  let height = 0;
  for (const r of allRuns(p)) {
    if (r.wall.id !== w.id || r.side !== side) continue;
    if (r.s1 < s - halfWidth || r.s0 > s + halfWidth) continue;
    if (r.style.depth > depth) {
      depth = r.style.depth;
      height = r.style.height;
    }
  }
  return { depth, height };
}

/** Welche Räume liegen an den beiden Seiten einer Wand? */
export function wallSideRooms(p: Project, w: Wall): Record<1 | -1, Room | undefined> {
  const res: Record<1 | -1, Room | undefined> = { 1: undefined, [-1]: undefined } as Record<1 | -1, Room | undefined>;
  for (const r of p.rooms) for (const rw of roomWalls(p, r)) if (rw.wall.id === w.id && !res[rw.side]) res[rw.side] = r;
  return res;
}
