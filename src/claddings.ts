// Wandverkleidungen auf Teilflächen einer Wandseite: Fliesenspiegel, halbhoch gefliest,
// Holzpaneele, Akustikpaneele, Backstein, Tapete, zweifarbiger Anstrich …
import type { Cladding, Project, SurfaceMat, Wall } from './types';
import { faceRange } from './baseboards';
import { uid } from './geometry';
import { FLOOR_MATERIALS, WALL_MATERIALS } from './textures';

export interface CladdingPreset {
  id: string;
  label: string;
  desc: string;
  bottom: number;
  top: number | 'decke';
  material: SurfaceMat;
  thickness: number;
}

export const CLADDING_PRESETS: CladdingPreset[] = [
  { id: 'kueche', label: 'Küchenrückwand', desc: 'Fliesenspiegel zwischen Arbeitsplatte und Oberschränken (90–150 cm)', bottom: 90, top: 150, material: { kind: 'metro', color: '#ffffff' }, thickness: 1 },
  { id: 'badHalb', label: 'Bad halbhoch', desc: 'Fliesen bis 120 cm, darüber Farbe', bottom: 0, top: 120, material: { kind: 'wandfliesen', color: '#ece9e4' }, thickness: 1 },
  { id: 'dusche', label: 'Raumhoch gefliest', desc: 'Dusche oder Bad: Fliesen vom Boden bis zur Decke', bottom: 0, top: 'decke', material: { kind: 'wandfliesen', color: '#ece9e4' }, thickness: 1 },
  { id: 'vertaefelung', label: 'Holzpaneele halbhoch', desc: 'Wandvertäfelung bis 100 cm', bottom: 0, top: 100, material: { kind: 'holzpaneel', color: '#ffffff' }, thickness: 2 },
  { id: 'akustik', label: 'Akustikpaneele', desc: 'Holzlamellen auf Filz, raumhoch', bottom: 0, top: 'decke', material: { kind: 'akustik', color: '#ffffff' }, thickness: 2.2 },
  { id: 'backstein', label: 'Backstein unverputzt', desc: 'Klinker bzw. Riemchen, raumhoch', bottom: 0, top: 'decke', material: { kind: 'ziegel', color: '#ffffff' }, thickness: 1.5 },
  { id: 'beton', label: 'Sichtbeton', desc: 'Betonoptik, raumhoch', bottom: 0, top: 'decke', material: { kind: 'sichtbeton', color: '#bdbab4' }, thickness: 0.5 },
  { id: 'tapete', label: 'Tapete (Akzentwand)', desc: 'Mustertapete auf der ganzen Fläche', bottom: 0, top: 'decke', material: { kind: 'tapete_muster', color: '#ffffff' }, thickness: 0.1 },
  { id: 'zweiton', label: 'Zweifarbig gestrichen', desc: 'Untere Wandhälfte in einer anderen Farbe (bis 110 cm)', bottom: 0, top: 110, material: { kind: 'farbe', color: '#93a7bd' }, thickness: 0.1 },
];

/** Materialien, die sich als Verkleidung eignen (Wandmaterialien + Fliesen/Holz vom Boden). */
export const CLADDING_MATERIALS = [
  ...WALL_MATERIALS,
  ...FLOOR_MATERIALS.filter((m) => ['fliesen60', 'fliesen30', 'schachbrett', 'terrazzo', 'eiche', 'nussbaum'].includes(m.id)),
];

/** Fliesen-Materialien: am Boden ersetzen sie die Fußleiste (Fliesensockel). */
export const TILE_KINDS = new Set(['metro', 'wandfliesen', 'marmor', 'naturstein', 'fliesen60', 'fliesen30', 'schachbrett', 'terrazzo']);

export const replacesBaseboard = (c: Cladding) => c.bottom < 1 && TILE_KINDS.has(c.material.kind);

/** Neue Verkleidung über die ganze Breite einer Wandseite nach Vorlage. */
export function makeCladding(p: Project, w: Wall, side: 1 | -1, presetId: string): Cladding {
  const pr = CLADDING_PRESETS.find((x) => x.id === presetId) ?? CLADDING_PRESETS[0];
  const face = faceRange(p, w, side);
  return {
    id: uid(),
    wallId: w.id,
    side,
    start: Math.round(face.s0 * 10) / 10,
    length: Math.max(10, Math.round((face.s1 - face.s0) * 10) / 10),
    bottom: pr.bottom,
    top: pr.top === 'decke' ? w.height : Math.min(pr.top, w.height),
    material: { ...pr.material },
    thickness: pr.thickness,
  };
}

/** Vorlage auf eine bestehende Verkleidung anwenden (Höhen, Material, Stärke). */
export function applyPreset(c: Cladding, w: Wall, presetId: string) {
  const pr = CLADDING_PRESETS.find((x) => x.id === presetId);
  if (!pr) return;
  c.bottom = pr.bottom;
  c.top = pr.top === 'decke' ? w.height : Math.min(pr.top, w.height);
  c.material = { ...pr.material };
  c.thickness = pr.thickness;
}

export interface Rect {
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

function subtractRect(r: Rect, h: Rect): Rect[] {
  if (h.s1 <= r.s0 || h.s0 >= r.s1 || h.z1 <= r.z0 || h.z0 >= r.z1) return [r];
  const out: Rect[] = [];
  if (h.s0 > r.s0) out.push({ s0: r.s0, s1: h.s0, z0: r.z0, z1: r.z1 });
  if (h.s1 < r.s1) out.push({ s0: h.s1, s1: r.s1, z0: r.z0, z1: r.z1 });
  const s0 = Math.max(r.s0, h.s0);
  const s1 = Math.min(r.s1, h.s1);
  if (h.z0 > r.z0) out.push({ s0, s1, z0: r.z0, z1: h.z0 });
  if (h.z1 < r.z1) out.push({ s0, s1, z0: h.z1, z1: r.z1 });
  return out;
}

/** Flächen der Verkleidung abzüglich Fenster, Türen und Durchgänge (cm, wandlokal). */
export function claddingRects(p: Project, c: Cladding): Rect[] {
  const w = p.walls.find((x) => x.id === c.wallId);
  if (!w) return [];
  let rects: Rect[] = [{ s0: c.start, s1: c.start + c.length, z0: Math.max(0, c.bottom), z1: Math.min(w.height, c.top) }];
  for (const o of p.openings) {
    if (o.wallId !== w.id) continue;
    const hole = { s0: o.offset - o.width / 2, s1: o.offset + o.width / 2, z0: o.sill, z1: o.sill + o.height };
    rects = rects.flatMap((r) => subtractRect(r, hole));
  }
  return rects.filter((r) => r.s1 - r.s0 > 0.5 && r.z1 - r.z0 > 0.5);
}

/** Wie weit steht die Verkleidung an dieser Stelle vor (für Möbel, Steckdosen, Fußleisten davor)? */
export function claddingDepthAt(p: Project, w: Wall, side: 1 | -1, s: number, halfWidth: number, z0: number, z1: number): number {
  let d = 0;
  for (const c of p.claddings ?? []) {
    if (c.wallId !== w.id || c.side !== side) continue;
    if (c.start > s + halfWidth || c.start + c.length < s - halfWidth) continue;
    if (c.bottom >= z1 || c.top <= z0) continue;
    d = Math.max(d, c.thickness);
  }
  return d;
}
