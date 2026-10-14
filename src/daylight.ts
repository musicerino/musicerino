// Lichtanalyse für Pflanzenstandorte.
//
// Für jeden Punkt auf einem Raster über den Räumen (in Pflanzenhöhe) wird berechnet:
//  • direkte Sonne: Stunden pro Tag (Mittel über die gewählte Jahreszeit), davon Mittagssonne (11–15 Uhr)
//  • Himmelslicht: Tageslichtquotient in % (bedeckter Himmel nach CIE, durch Fenster sichtbarer Himmelsanteil)
// Die Szene wird dafür analytisch als Quader beschrieben (Wände mit ausgesparten Öffnungen, Möbel,
// Balkon-Überstände, Decke). Das ist schnell genug für Tablets und berücksichtigt Laibungen,
// Abschattung durch Möbel und Nachbarräume.
import type { P, Project, Item } from './types';
import { bounds, pointInPolygon, projectOnSegment, wallDir, wallLength, perp, mul, add } from './geometry';
import { sunPosition, zonedToUtc, planDirForBearing } from './sun';
import { isTech } from './catalog';
import { ceilingHeight } from './items';

export type Zone = 'sonnig' | 'halbschattig' | 'hell' | 'schattig' | 'dunkel';
export type Season = 'jahr' | 'sommer' | 'winter' | 'datum';

export const ZONES: { id: Zone; label: string; short: string; color: string; desc: string }[] = [
  { id: 'sonnig', label: 'Sonnig', short: '☀', color: '#f08c00', desc: 'mind. 4 Stunden direkte Sonne am Tag' },
  { id: 'halbschattig', label: 'Halbschattig', short: '⛅', color: '#fcc419', desc: '1,5–4 Stunden direkte Sonne (z.B. Morgen- oder Abendsonne)' },
  { id: 'hell', label: 'Hell, ohne Sonne', short: '◐', color: '#8ce99a', desc: 'kaum direkte Sonne, aber viel Tageslicht (≥ 2 %)' },
  { id: 'schattig', label: 'Schattig', short: '☁', color: '#74c0fc', desc: 'wenig Tageslicht (0,7–2 %)' },
  { id: 'dunkel', label: 'Sehr dunkel', short: '●', color: '#5c6670', desc: 'unter 0,7 % Tageslicht – nur mit Pflanzenlampe' },
];
export const zoneInfo = (z: Zone) => ZONES.find((x) => x.id === z)!;

export const SEASONS: { id: Season; label: string }[] = [
  { id: 'jahr', label: 'Jahresmittel' },
  { id: 'sommer', label: 'Sommer (21. Juni)' },
  { id: 'winter', label: 'Winter (21. Dez.)' },
  { id: 'datum', label: 'Gewähltes Datum' },
];

export interface LightCell {
  i: number;
  j: number;
  x: number;
  y: number;
  sun: number; // h/Tag
  midday: number; // h/Tag zwischen 11 und 15 Uhr
  sky: number; // Tageslichtquotient in %
  zone: Zone;
  covered: boolean; // von Möbeln belegt
  roomId: string;
}

export interface LightMap {
  step: number;
  height: number;
  season: Season;
  label: string;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  grid: (LightCell | null)[];
  cells: LightCell[];
}

export function classify(sun: number, sky: number): Zone {
  if (sun >= 4) return 'sonnig';
  if (sun >= 1.5) return 'halbschattig';
  if (sky >= 2) return 'hell';
  if (sky >= 0.7) return 'schattig';
  return 'dunkel';
}

// ------------------------------------------------------------------ Szene als Quader

interface Box {
  cx: number;
  cy: number;
  hw: number;
  hd: number;
  cos: number;
  sin: number;
  z0: number;
  z1: number;
}

interface Scene {
  boxes: Box[];
  H: number;
  foot: { minX: number; minY: number; maxX: number; maxY: number };
  rooms: P[][];
}

const NO_SHADOW = new Set(['rug', 'picture', 'mirror', 'plant', 'floorlamp', 'tablelamp', 'pendant', 'wallshelf']);

/** Welcher Teil eines Möbels wirft Schatten (bei Tischen nur die Platte usw.). */
function itemProfile(it: Item): [number, number] {
  switch (it.type) {
    case 'table':
    case 'desk':
    case 'stool':
    case 'bench':
      return [it.z + it.h - 5, it.z + it.h];
    case 'chair':
    case 'officechair':
      return [it.z + 40, it.z + it.h];
    default:
      return [it.z, it.z + it.h];
  }
}

function boxAlong(a: P, dir: P, s0: number, s1: number, t: number, z0: number, z1: number, nOff = 0): Box {
  const n = perp(dir);
  const c = add(add(a, mul(dir, (s0 + s1) / 2)), mul(n, nOff));
  return { cx: c.x, cy: c.y, hw: (s1 - s0) / 2, hd: t / 2, cos: dir.x, sin: dir.y, z0, z1 };
}

function buildScene(p: Project): Scene {
  const boxes: Box[] = [];
  for (const w of p.walls) {
    if (w.kind === 'glass') continue; // Glas lässt Licht durch
    const L = wallLength(w);
    if (L < 1) continue;
    const dir = wallDir(w);
    const t = w.thickness;
    const H = w.height;
    const ops = p.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset);
    // Wandstücke zwischen den Öffnungen (Enden leicht verlängert, damit Ecken dicht sind)
    let cur = -t / 2;
    for (const o of ops) {
      const a = o.offset - o.width / 2;
      const b = o.offset + o.width / 2;
      if (a > cur) boxes.push(boxAlong(w.a, dir, cur, a, t, 0, H));
      if (o.sill > 0.5) boxes.push(boxAlong(w.a, dir, a, b, t, 0, o.sill));
      if (o.sill + o.height < H - 0.5) boxes.push(boxAlong(w.a, dir, a, b, t, o.sill + o.height, H));
      cur = Math.max(cur, b);
      if (o.overhang && o.overhang > 0) {
        // Balkon/Vordach außen über der Öffnung
        const mid = add(w.a, mul(dir, o.offset));
        const n = perp(dir);
        const inA = p.rooms.some((r) => pointInPolygon(add(mid, mul(n, t / 2 + 8)), r.points));
        const out = inA ? -1 : 1;
        boxes.push(boxAlong(w.a, dir, a - 30, b + 30, o.overhang, H, H + 18, out * (t / 2 + o.overhang / 2)));
      }
    }
    if (cur < L + t / 2) boxes.push(boxAlong(w.a, dir, cur, L + t / 2, t, 0, H));
  }
  for (const it of p.items) {
    if (NO_SHADOW.has(it.type) || it.ceiling) continue;
    if (isTech(it.type) && it.type !== 'radiator' && it.type !== 'distbox') continue;
    const r = (it.rot * Math.PI) / 180;
    const [z0, z1] = itemProfile(it);
    boxes.push({ cx: it.x, cy: it.y, hw: it.w / 2, hd: it.d / 2, cos: Math.cos(r), sin: Math.sin(r), z0, z1 });
  }
  const pts = p.walls.flatMap((w) => [w.a, w.b]);
  const b = pts.length ? bounds(pts) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const pad = Math.max(30, ...p.walls.map((w) => w.thickness)) + 5;
  return {
    boxes,
    H: ceilingHeight(p),
    foot: { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad },
    rooms: p.rooms.map((r) => r.points),
  };
}

/** Wird der Strahl von o in Richtung d (Einheitsvektor, z nach oben) verdeckt? */
function occluded(sc: Scene, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
  // Strahl verlässt das Haus seitlich bei tExit
  let tExit = Infinity;
  if (dx > 1e-9) tExit = Math.min(tExit, (sc.foot.maxX - ox) / dx);
  else if (dx < -1e-9) tExit = Math.min(tExit, (sc.foot.minX - ox) / dx);
  if (dy > 1e-9) tExit = Math.min(tExit, (sc.foot.maxY - oy) / dy);
  else if (dy < -1e-9) tExit = Math.min(tExit, (sc.foot.minY - oy) / dy);
  // Decke: trifft der Strahl die Deckenhöhe noch über einem Raum, ist er verdeckt
  if (dz > 1e-9) {
    const tc = (sc.H - oz) / dz;
    if (tc < tExit) {
      const cx = ox + dx * tc;
      const cy = oy + dy * tc;
      for (const poly of sc.rooms) if (pointInPolygon({ x: cx, y: cy }, poly)) return true;
    }
  }
  for (const b of sc.boxes) {
    const rx = ox - b.cx;
    const ry = oy - b.cy;
    const lx = rx * b.cos + ry * b.sin;
    const ly = -rx * b.sin + ry * b.cos;
    const ldx = dx * b.cos + dy * b.sin;
    const ldy = -dx * b.sin + dy * b.cos;
    let tmin = -Infinity;
    let tmax = Infinity;
    // Slab-Test je Achse
    if (Math.abs(ldx) < 1e-12) {
      if (lx < -b.hw || lx > b.hw) continue;
    } else {
      let t1 = (-b.hw - lx) / ldx;
      let t2 = (b.hw - lx) / ldx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    if (Math.abs(ldy) < 1e-12) {
      if (ly < -b.hd || ly > b.hd) continue;
    } else {
      let t1 = (-b.hd - ly) / ldy;
      let t2 = (b.hd - ly) / ldy;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    if (Math.abs(dz) < 1e-12) {
      if (oz < b.z0 || oz > b.z1) continue;
    } else {
      let t1 = (b.z0 - oz) / dz;
      let t2 = (b.z1 - oz) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    // Ursprung im Quader (z.B. Punkt unter dem Sofa) zählt nicht als Verdeckung
    if (tmax >= tmin && tmin > 0.01 && tmin < tExit) return true;
  }
  return false;
}

// ------------------------------------------------------------------ Himmels- und Sonnenrichtungen

interface Dir {
  x: number;
  y: number;
  z: number;
  w: number;
  midday?: boolean;
}

/** Richtungen über dem Horizont mit Gewicht für horizontale Beleuchtungsstärke (CIE bedeckter Himmel). */
function skyDirs(horizon: number): { dirs: Dir[]; total: number } {
  const dirs: Dir[] = [];
  let total = 0;
  const bands = 9;
  const az = 24;
  for (let i = 0; i < bands; i++) {
    const alt = ((i + 0.5) * (90 / bands) * Math.PI) / 180;
    const lum = (1 + 2 * Math.sin(alt)) / 3;
    const w = lum * Math.sin(alt) * Math.cos(alt);
    for (let k = 0; k < az; k++) {
      const a = ((k + (i % 2) * 0.5) / az) * Math.PI * 2;
      total += w;
      if ((alt * 180) / Math.PI < horizon) continue; // Nachbarbebauung verdeckt diesen Himmelsteil
      dirs.push({ x: Math.cos(a) * Math.cos(alt), y: Math.sin(a) * Math.cos(alt), z: Math.sin(alt), w });
    }
  }
  return { dirs, total };
}

function seasonDates(p: Project, season: Season): string[] {
  const year = p.site.date.slice(0, 4);
  if (season === 'sommer') return [`${year}-06-21`];
  if (season === 'winter') return [`${year}-12-21`];
  if (season === 'datum') return [p.site.date];
  return [`${year}-03-21`, `${year}-06-21`, `${year}-09-23`, `${year}-12-21`];
}

/** Sonnenrichtungen (alle 20 min) für die Tage der Jahreszeit; Gewicht = Stunden pro Tag. */
function sunDirs(p: Project, season: Season): Dir[] {
  const dates = seasonDates(p, season);
  const stepMin = 20;
  const horizon = Math.max(1, p.site.horizon ?? 0);
  const out: Dir[] = [];
  for (const date of dates) {
    for (let m = stepMin / 2; m < 1440; m += stepMin) {
      const sp = sunPosition(zonedToUtc(date, m, p.site.tz), p.site.lat, p.site.lon);
      if (sp.altitude < horizon) continue;
      const d2 = planDirForBearing(p.site.north, sp.bearing);
      const a = (sp.altitude * Math.PI) / 180;
      out.push({ x: d2.x * Math.cos(a), y: d2.y * Math.cos(a), z: Math.sin(a), w: stepMin / 60 / dates.length, midday: m >= 660 && m < 900 });
    }
  }
  return out;
}

// ------------------------------------------------------------------ Berechnung

const TRANSMISSION = 0.6; // Verglasung, Rahmen, Verschmutzung

function covering(p: Project, pt: P): boolean {
  for (const it of p.items) {
    if (it.h < 15 || NO_SHADOW.has(it.type) || isTech(it.type) || it.ceiling || it.z > 60) continue;
    const r = (-it.rot * Math.PI) / 180;
    const dx = pt.x - it.x;
    const dy = pt.y - it.y;
    const lx = dx * Math.cos(r) - dy * Math.sin(r);
    const ly = dx * Math.sin(r) + dy * Math.cos(r);
    if (Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.d / 2) return true;
  }
  return false;
}

export async function computeLight(
  p: Project,
  opts: { step?: number; height?: number; season?: Season; onProgress?: (f: number) => void } = {},
): Promise<LightMap | null> {
  const step = opts.step ?? 20;
  const height = opts.height ?? 50;
  const season = opts.season ?? 'jahr';
  if (!p.rooms.length) return null;
  const sc = buildScene(p);
  const sky = skyDirs(p.site.horizon ?? 0);
  const sun = sunDirs(p, season);
  const b = bounds(p.rooms.flatMap((r) => r.points));
  const x0 = b.minX + step / 2;
  const y0 = b.minY + step / 2;
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / step));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / step));
  const grid: (LightCell | null)[] = new Array(cols * rows).fill(null);
  const cells: LightCell[] = [];
  const todo: { i: number; j: number; x: number; y: number; roomId: string }[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * step;
      const y = y0 + j * step;
      const room = p.rooms.find((r) => pointInPolygon({ x, y }, r.points));
      if (!room) continue;
      if (p.walls.some((w) => projectOnSegment({ x, y }, w.a, w.b).d < w.thickness / 2 + 1)) continue;
      todo.push({ i, j, x, y, roomId: room.id });
    }
  let t0 = performance.now();
  for (let k = 0; k < todo.length; k++) {
    const c = todo[k];
    let skyVis = 0;
    for (const d of sky.dirs) if (!occluded(sc, c.x, c.y, height, d.x, d.y, d.z)) skyVis += d.w;
    let sunH = 0;
    let mid = 0;
    for (const d of sun)
      if (!occluded(sc, c.x, c.y, height, d.x, d.y, d.z)) {
        sunH += d.w;
        if (d.midday) mid += d.w;
      }
    const skyPct = (skyVis / sky.total) * 100 * TRANSMISSION;
    const cell: LightCell = { i: c.i, j: c.j, x: c.x, y: c.y, sun: sunH, midday: mid, sky: skyPct, zone: classify(sunH, skyPct), covered: covering(p, c), roomId: c.roomId };
    grid[c.j * cols + c.i] = cell;
    cells.push(cell);
    if (performance.now() - t0 > 30) {
      opts.onProgress?.(k / todo.length);
      await new Promise((r) => setTimeout(r, 0));
      t0 = performance.now();
    }
  }
  opts.onProgress?.(1);
  const label = SEASONS.find((s) => s.id === season)!.label + (season === 'datum' ? ` (${p.site.date})` : '');
  return { step, height, season, label, x0, y0, cols, rows, grid, cells };
}

export function cellAt(map: LightMap, pt: P): LightCell | null {
  const i = Math.round((pt.x - map.x0) / map.step);
  const j = Math.round((pt.y - map.y0) / map.step);
  if (i < 0 || j < 0 || i >= map.cols || j >= map.rows) return null;
  return map.grid[j * map.cols + i];
}

/** Bild mit einer Farbe je Zelle (für die weiche Darstellung im Plan und in 3D). */
export function mapCanvas(map: LightMap, color: (c: LightCell) => string | null): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = map.cols;
  cv.height = map.rows;
  const ctx = cv.getContext('2d')!;
  for (const c of map.cells) {
    const col = color(c);
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(c.i, c.j, 1, 1);
  }
  return cv;
}

export function fmtHours(h: number): string {
  return (Math.round(h * 10) / 10).toString().replace('.', ',') + ' h';
}

export function cellText(c: LightCell): string {
  const z = zoneInfo(c.zone);
  const mid = c.midday >= 0.3 ? ` (davon ${fmtHours(c.midday)} mittags)` : '';
  return `Hier: ${z.label} · ${fmtHours(c.sun)} direkte Sonne/Tag${mid} · Tageslicht ${c.sky.toFixed(1).replace('.', ',')} %${c.covered ? ' · von Möbeln belegt' : ''}`;
}

/** Anteile der Zonen je Raum (für die Übersicht). */
export function zoneShares(map: LightMap, roomId?: string): Record<Zone, number> {
  const res: Record<Zone, number> = { sonnig: 0, halbschattig: 0, hell: 0, schattig: 0, dunkel: 0 };
  const list = roomId ? map.cells.filter((c) => c.roomId === roomId) : map.cells;
  for (const c of list) res[c.zone]++;
  const n = Math.max(1, list.length);
  for (const k of Object.keys(res) as Zone[]) res[k] = res[k] / n;
  return res;
}

/** Beschreibt eine Stelle relativ zum nächsten Fenster, z.B. „1,2 m vor dem Südfenster“. */
export function describeSpot(p: Project, pt: P, compass: (bearingOut: P) => string): string {
  let best: { d: number; name: string } | null = null;
  for (const o of p.openings) {
    if (o.type !== 'window' && o.type !== 'french') continue;
    const w = p.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const dir = wallDir(w);
    const c = add(w.a, mul(dir, o.offset));
    const n = perp(dir);
    const inA = p.rooms.some((r) => pointInPolygon(add(c, mul(n, w.thickness / 2 + 8)), r.points));
    const out = inA ? mul(n, -1) : n; // vom Raum nach außen
    const d = Math.hypot(pt.x - c.x, pt.y - c.y);
    const name = o.type === 'french' ? `von der ${compass(out)}-Balkontür` : `vom ${compass(out)}fenster`;
    if (!best || d < best.d) best = { d, name };
  }
  if (!best) return 'im Raum';
  if (best.d > 450) return 'weiter weg vom Fenster';
  const m = Math.max(0.2, Math.round(best.d / 10) / 10);
  return `≈ ${m.toString().replace('.', ',')} m ${best.name}`;
}

/** Himmelsrichtung (ausgeschrieben) einer Richtung im Grundriss. */
export function compassWord(p: Project, v: P): string {
  const n = planDirForBearing(p.site.north, 0);
  const ang = Math.atan2(n.x * v.y - n.y * v.x, n.x * v.x + n.y * v.y);
  const bearing = (((ang * 180) / Math.PI) % 360 + 360) % 360;
  return ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'][Math.round(bearing / 45) % 8];
}

/** Mittelpunkt (Durchschnitt) einer Menge von Zellen. */
export function cellsCenter(cells: LightCell[]): P {
  const n = Math.max(1, cells.length);
  return { x: cells.reduce((a, c) => a + c.x, 0) / n, y: cells.reduce((a, c) => a + c.y, 0) / n };
}
