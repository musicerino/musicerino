import type { P, Wall, Item } from './types';

export const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: P, s: number): P => ({ x: a.x * s, y: a.y * s });
export const dot = (a: P, b: P): number => a.x * b.x + a.y * b.y;
export const cross = (a: P, b: P): number => a.x * b.y - a.y * b.x;
export const len = (a: P): number => Math.hypot(a.x, a.y);
export const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: P): P => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const perp = (a: P): P => ({ x: -a.y, y: a.x });
export const same = (a: P, b: P, eps = 1): boolean => dist(a, b) <= eps;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const round = (v: number, step: number): number => Math.round(v / step) * step;
export const deg = (r: number): number => (r * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;

/** Dreht einen Vektor im Grundriss (y nach unten) um `deg` Grad im Uhrzeigersinn. */
export function rotCW(v: P, degrees: number): P {
  const t = rad(degrees);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function wallLength(w: Wall): number {
  return dist(w.a, w.b);
}

export function wallDir(w: Wall): P {
  return norm(sub(w.b, w.a));
}

/** Projektion eines Punktes auf eine Strecke: t in [0,1], Abstand und Fußpunkt. */
export function projectOnSegment(p: P, a: P, b: P): { t: number; d: number; q: P; s: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1;
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  const q = add(a, mul(ab, t));
  return { t, d: dist(p, q), q, s: t * Math.sqrt(l2) };
}

export function polygonArea(pts: P[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonCentroid(pts: P[]): P {
  const A = polygonArea(pts);
  if (Math.abs(A) < 1e-6) {
    const s = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return mul(s, 1 / Math.max(1, pts.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

export function pointInPolygon(p: P, pts: P[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Verschiebt ein geschlossenes Polygon um `d` nach innen (Gehrung an den Ecken). */
export function insetPolygon(pts: P[], d: number): P[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const sign = polygonArea(pts) > 0 ? 1 : -1; // y nach unten: positiv = im Uhrzeigersinn am Bildschirm
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const dir = norm(sub(q, p));
    // Innen-Normale
    const nrm = mul(perp(dir), sign);
    return { p: add(p, mul(nrm, d)), dir };
  });
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = cross(l1.dir, l2.dir);
    if (Math.abs(den) < 1e-9) {
      out.push(l2.p);
      continue;
    }
    const t = cross(sub(l2.p, l1.p), l2.dir) / den;
    out.push(add(l1.p, mul(l1.dir, t)));
  }
  return out;
}

/** Ecken eines (gedrehten) Möbel-Grundrisses. */
export function itemCorners(it: { x: number; y: number; w: number; d: number; rot: number }): P[] {
  const hw = it.w / 2;
  const hd = it.d / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((c) => add(rotCW(c, it.rot), { x: it.x, y: it.y }));
}

/** Punkt in lokale Möbelkoordinaten umrechnen. */
export function toItemLocal(it: Item, p: P): P {
  return rotCW(sub(p, { x: it.x, y: it.y }), -it.rot);
}

export function pointInItem(it: Item, p: P, margin = 0): boolean {
  const l = toItemLocal(it, p);
  return Math.abs(l.x) <= it.w / 2 + margin && Math.abs(l.y) <= it.d / 2 + margin;
}

export function bounds(pts: P[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function fmtLen(cm: number): string {
  if (Math.abs(cm) >= 100) return (cm / 100).toFixed(2).replace('.', ',') + ' m';
  return Math.round(cm * 10) / 10 + ' cm';
}

export function fmtArea(cm2: number): string {
  return (Math.abs(cm2) / 10000).toFixed(2).replace('.', ',') + ' m²';
}

/** Parst Benutzereingaben wie "3,45m", "120", "120cm", "1.2 m" → Zentimeter. */
export function parseLength(s: string): number | null {
  const t = s.trim().toLowerCase().replace(',', '.');
  const m = t.match(/^(-?\d*\.?\d+)\s*(mm|cm|m)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = m[2] ?? 'cm';
  if (unit === 'mm') return v / 10;
  if (unit === 'm') return v * 100;
  return v;
}
