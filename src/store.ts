import type { Project, Selection, Wall, Room, Item, CatalogEntry, Opening, P } from './types';
import { uid, same, insetPolygon } from './geometry';
import { CATALOG } from './catalog';

const STORAGE_KEY = 'raumplaner.project.v1';

export function emptyProject(): Project {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    version: 1,
    name: 'Mein Projekt',
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    wallMat: { kind: 'farbe', color: '#f4f1ec' },
    ceilingColor: '#ffffff',
    defaults: { wallHeight: 250, wallThickness: 15 },
    site: { lat: 52.52, lon: 13.405, north: 0, tz: 'Europe/Berlin', date: iso, minutes: 14 * 60 },
    customCatalog: [],
  };
}

/** Rechteckiger Raum: Innenmaße (lichte Maße) in cm, linke obere Innenecke bei (x,y). */
export function rectRoomWalls(x: number, y: number, w: number, l: number, t: number, h: number): { walls: Wall[]; pts: P[] } {
  const pts = [
    { x: x - t / 2, y: y - t / 2 },
    { x: x + w + t / 2, y: y - t / 2 },
    { x: x + w + t / 2, y: y + l + t / 2 },
    { x: x - t / 2, y: y + l + t / 2 },
  ];
  return { walls: chainWalls(pts, true, t, h), pts };
}

export function chainWalls(pts: P[], closed: boolean, t: number, h: number): Wall[] {
  const walls: Wall[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    walls.push({ id: uid(), a: { ...a }, b: { ...b }, thickness: t, height: h });
  }
  return walls;
}

export function demoProject(): Project {
  const p = emptyProject();
  p.name = 'Beispiel-Wohnung';
  const t = 15;
  const h = 260;
  // Wohnraum 520 × 420 (innen) + Schlafzimmer 360 × 420 rechts daneben
  const A = { x: 0, y: 0 };
  const pts = [
    { x: A.x, y: A.y },
    { x: 535, y: 0 },
    { x: 910, y: 0 },
    { x: 910, y: 435 },
    { x: 535, y: 435 },
    { x: 0, y: 435 },
  ];
  const outer = [pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]];
  p.walls = chainWalls(outer, true, t, h);
  const inner: Wall = { id: uid(), a: { x: 535, y: 0 }, b: { x: 535, y: 435 }, thickness: 10, height: h };
  p.walls.push(inner);
  p.rooms = [
    { id: uid(), name: 'Wohnen', points: [pts[0], pts[1], pts[4], pts[5]].map((q) => ({ ...q })), floor: { kind: 'eiche', color: '#ffffff' } },
    { id: uid(), name: 'Schlafen', points: [pts[1], pts[2], pts[3], pts[4]].map((q) => ({ ...q })), floor: { kind: 'eiche_hell', color: '#ffffff' } },
  ];
  const [top1, top2, right, bottom2, bottom1, left] = p.walls;
  p.openings = [
    { id: uid(), wallId: bottom1.id, type: 'french', offset: 180, width: 120, height: 225, sill: 0 },
    { id: uid(), wallId: bottom1.id, type: 'window', offset: 400, width: 130, height: 140, sill: 85 },
    { id: uid(), wallId: left.id, type: 'window', offset: 215, width: 110, height: 140, sill: 85 },
    { id: uid(), wallId: bottom2.id, type: 'window', offset: 190, width: 120, height: 140, sill: 85 },
    { id: uid(), wallId: right.id, type: 'window', offset: 140, width: 100, height: 140, sill: 85 },
    { id: uid(), wallId: top1.id, type: 'door', offset: 90, width: 90, height: 205, sill: 0 },
    { id: uid(), wallId: inner.id, type: 'door', offset: 70, width: 85, height: 205, sill: 0, hingeRight: true },
  ];
  void top2;
  const put = (id: string, x: number, y: number, rot = 0, z?: number) => {
    const e = CATALOG.find((c) => c.id === id);
    if (!e) return;
    const it = newItemFromEntry(e, x, y);
    it.rot = rot;
    if (z !== undefined) it.z = z;
    p.items.push(it);
  };
  put('stockholmRug', 300, 175, 90);
  put('kivik3', 300, 56, 0);
  put('lackCouch', 300, 175);
  put('strandmon', 140, 160, 60);
  put('hektar', 470, 40);
  put('fejkaGross', 500, 395);
  put('kallax4x2', 510, 250, 90);
  put('ranarp', 510, 220, 90, 77);
  put('lisabo', 140, 330);
  put('ingolf', 105, 290, 180);
  put('ingolf', 175, 290, 180);
  put('ingolf', 105, 370);
  put('ingolf', 175, 370);
  put('malm160', 720, 112);
  put('malmNacht', 606, 32);
  put('malmNacht', 834, 32);
  put('pax200', 873, 330, 90);
  put('lohals', 720, 260, 90);
  return p;
}

type Listener = () => void;

class Store {
  project: Project;
  selection: Selection = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private committed: string;
  private listeners = new Set<Listener>();
  private selListeners = new Set<Listener>();
  private saveTimer = 0;

  constructor() {
    let loaded: Project | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loaded = migrate(JSON.parse(raw));
    } catch {
      loaded = null;
    }
    this.project = loaded ?? demoProject();
    this.committed = JSON.stringify(this.project);
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onSelect(fn: Listener) {
    this.selListeners.add(fn);
    return () => this.selListeners.delete(fn);
  }

  emit() {
    for (const l of this.listeners) l();
    this.scheduleSave();
  }

  /** Änderung ohne Undo-Schritt (z.B. während eines Ziehvorgangs). */
  mutate(fn: (p: Project) => void) {
    fn(this.project);
    this.emit();
  }

  /** Änderung mit Undo-Schritt. */
  update(fn: (p: Project) => void) {
    fn(this.project);
    this.commit();
  }

  commit() {
    const now = JSON.stringify(this.project);
    if (now !== this.committed) {
      this.undoStack.push(this.committed);
      if (this.undoStack.length > 150) this.undoStack.shift();
      this.redoStack = [];
      this.committed = now;
    }
    this.validateSelection();
    this.emit();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.committed);
    this.committed = prev;
    this.project = JSON.parse(prev);
    this.validateSelection();
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.committed);
    this.committed = next;
    this.project = JSON.parse(next);
    this.validateSelection();
    this.emit();
  }

  load(p: Project) {
    this.undoStack.push(this.committed);
    this.project = migrate(p);
    this.committed = JSON.stringify(this.project);
    this.redoStack = [];
    this.select(null);
    this.emit();
  }

  select(sel: Selection) {
    this.selection = sel;
    for (const l of this.selListeners) l();
  }

  private validateSelection() {
    const s = this.selection;
    if (!s) return;
    const p = this.project;
    const exists =
      (s.kind === 'wall' && p.walls.some((w) => w.id === s.id)) ||
      (s.kind === 'opening' && p.openings.some((o) => o.id === s.id)) ||
      (s.kind === 'item' && p.items.some((o) => o.id === s.id)) ||
      (s.kind === 'room' && p.rooms.some((o) => o.id === s.id));
    if (!exists) this.select(null);
    else for (const l of this.selListeners) l();
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      } catch {
        /* Speicher voll oder nicht verfügbar */
      }
    }, 400);
  }

  // Abfragen
  wall(id: string) {
    return this.project.walls.find((w) => w.id === id);
  }
  item(id: string) {
    return this.project.items.find((w) => w.id === id);
  }
  opening(id: string) {
    return this.project.openings.find((w) => w.id === id);
  }
  room(id: string) {
    return this.project.rooms.find((w) => w.id === id);
  }
  selected<T extends NonNullable<Selection>['kind']>(kind: T): (T extends 'wall' ? Wall : T extends 'item' ? Item : T extends 'room' ? Room : Opening) | undefined {
    const s = this.selection;
    if (!s || s.kind !== kind) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map: any = { wall: this.wall(s.id), item: this.item(s.id), room: this.room(s.id), opening: this.opening(s.id) };
    return map[kind];
  }

  catalog(): CatalogEntry[] {
    return this.project.customCatalog;
  }
}

function migrate(p: Project): Project {
  const base = emptyProject();
  const out: Project = { ...base, ...p, site: { ...base.site, ...(p.site || {}) }, defaults: { ...base.defaults, ...(p.defaults || {}) } };
  out.walls = out.walls || [];
  out.openings = out.openings || [];
  out.rooms = out.rooms || [];
  out.items = (out.items || []).map((it) => ({ ...it, params: it.params || {} }));
  out.customCatalog = out.customCatalog || [];
  return out;
}

export const store = new Store();

// ---------- Projekt-Operationen ----------

/** Verschiebt einen Knoten (alle Wandenden + Raumecken, die dort liegen). */
export function moveNode(p: Project, from: P, to: P, eps = 1) {
  for (const w of p.walls) {
    if (same(w.a, from, eps)) w.a = { ...to };
    if (same(w.b, from, eps)) w.b = { ...to };
  }
  for (const r of p.rooms) r.points = r.points.map((q) => (same(q, from, eps) ? { ...to } : q));
}

export function deleteWall(p: Project, id: string) {
  p.walls = p.walls.filter((w) => w.id !== id);
  p.openings = p.openings.filter((o) => o.wallId !== id);
}

export function innerArea(r: Room, p: Project): P[] {
  // Raumfläche = Polygon auf Wandachsen, um halbe (mittlere) Wandstärke nach innen versetzt
  const ts = p.walls.map((w) => w.thickness);
  const t = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : 15;
  return insetPolygon(r.points, t / 2);
}

export function newItemFromEntry(e: CatalogEntry, x: number, y: number): Item {
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
    z: e.mount ?? 0,
    mount: e.mount ?? 0,
    rot: 0,
  };
}
