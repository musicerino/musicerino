// 2D-Grundriss-Editor (Canvas).
import { store, moveNode, chainWalls, newItemFromEntry, innerArea, deleteWall } from './store';
import type { P, Wall, Item, Opening, OpeningType, CatalogEntry } from './types';
import {
  add, sub, mul, dist, norm, perp, dot, len, same, round, projectOnSegment, wallLength, wallDir,
  polygonArea, polygonCentroid, pointInPolygon, pointInItem, itemCorners, rotCW, fmtLen, fmtArea, parseLength, bounds, uid, toItemLocal, cross, clamp,
} from './geometry';
import { settings, stackedOn, moveItemTo, rotateItemTo, snapItemToWall, supportAt } from './ops';
import { ui, onRedraw } from './shared';
import { siteSun, planDirForBearing } from './sun';
import { heatColor } from './view3d';
import { findPreset } from './textures';

export type Tool = 'select' | 'wall' | 'room' | 'window' | 'door' | 'french' | 'measure';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'item'; id: string; off: P; children: Item[]; moved: boolean; start: P }
  | { kind: 'rotate'; id: string; children: Item[] }
  | { kind: 'node'; at: P; moved: boolean }
  | { kind: 'wall'; id: string; start: P; a0: P; b0: P; moved: boolean }
  | { kind: 'opening'; id: string; moved: boolean }
  | { kind: 'room'; start: P; cur: P }
  | { kind: 'measure'; start: P; cur: P }
  | { kind: 'compass' };

const COL = {
  bg: '#f7f6f3',
  grid: '#e7e5e0',
  grid2: '#d6d3cc',
  wall: '#3b4148',
  wallSel: '#2f7cf6',
  accent: '#2f7cf6',
  text: '#2b3036',
  dim: '#6b7280',
};

export class Plan2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scale = 0.9; // px pro cm
  ox = 0;
  oy = 0;
  tool: Tool = 'select';
  private chain: P[] = [];
  private cursor: P = { x: 0, y: 0 };
  private guides: { x?: number; y?: number } = {};
  private typed = '';
  private drag: Drag | null = null;
  private hoverWall: { w: Wall; s: number } | null = null;
  private shift = false;
  private spaceDown = false;
  private dpr = 1;
  private measure: { a: P; b: P } | null = null;
  onToolChange: (t: Tool) => void = () => {};
  onStatus: (s: string) => void = () => {};
  findEntry?: (id: string) => CatalogEntry | undefined;

  constructor(public container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.fit();
    this.bind();
    store.on(() => this.draw());
    store.onSelect(() => this.draw());
    onRedraw(() => this.draw());
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = Math.max(1, w * this.dpr);
    this.canvas.height = Math.max(1, h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.draw();
  }

  get w() {
    return this.canvas.width / this.dpr;
  }
  get h() {
    return this.canvas.height / this.dpr;
  }

  fit() {
    const p = store.project;
    const pts: P[] = [...p.walls.flatMap((w) => [w.a, w.b]), ...p.items.map((i) => ({ x: i.x, y: i.y }))];
    if (!pts.length) {
      this.scale = 0.9;
      this.ox = this.w / 2;
      this.oy = this.h / 2;
      this.draw();
      return;
    }
    const b = bounds(pts);
    const bw = Math.max(200, b.maxX - b.minX);
    const bh = Math.max(200, b.maxY - b.minY);
    this.scale = Math.min((this.w - 120) / bw, (this.h - 120) / bh);
    this.scale = clamp(this.scale, 0.05, 8);
    this.ox = this.w / 2 - ((b.minX + b.maxX) / 2) * this.scale;
    this.oy = this.h / 2 - ((b.minY + b.maxY) / 2) * this.scale;
    this.draw();
  }

  toScreen(p: P): P {
    return { x: p.x * this.scale + this.ox, y: p.y * this.scale + this.oy };
  }
  toWorld(x: number, y: number): P {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  }

  setTool(t: Tool) {
    if (this.chain.length >= 2) this.finishChain(false);
    this.chain = [];
    this.typed = '';
    this.tool = t;
    this.measure = null;
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.onToolChange(t);
    const hints: Record<Tool, string> = {
      select: 'Auswählen: Klicken zum Markieren, Ziehen zum Verschieben. Leere Fläche ziehen = Ansicht verschieben, Mausrad = Zoom. Doppelklick auf Wand = Wand teilen.',
      wall: 'Wände zeichnen: Klicken setzt Punkte. Länge eintippen + Enter für exakte Maße. Shift = freier Winkel. Klick auf Startpunkt schließt den Raum. Doppelklick/Esc beendet.',
      room: 'Raum: Rechteck aufziehen (Wandachsen). Für exakte Innenmaße „Raum aus Maßen“ links verwenden.',
      window: 'Fenster: Auf eine Wand klicken, um ein Fenster einzusetzen.',
      door: 'Tür: Auf eine Wand klicken, um eine Tür einzusetzen.',
      french: 'Balkon-/Terrassentür: Auf eine Wand klicken.',
      measure: 'Messen: Ziehen, um eine Strecke zu messen.',
    };
    this.onStatus(hints[t]);
    this.draw();
  }

  // ---------------------------------------------------------------- Fangen

  private nodes(): P[] {
    const out: P[] = [];
    for (const w of store.project.walls)
      for (const q of [w.a, w.b]) if (!out.some((o) => same(o, q))) out.push(q);
    return out;
  }

  private snap(raw: P, from?: P): P {
    this.guides = {};
    const tol = 12 / this.scale;
    // 1. Knoten
    let best: P | null = null;
    let bd = tol;
    for (const n of [...this.nodes(), ...(this.chain.length > 2 ? [this.chain[0]] : [])]) {
      const d = dist(n, raw);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) return { ...best };
    const step = settings.snapGrid ? settings.gridStep : 0.1;
    if (from && !this.shift) {
      // 2. Winkel (15°) + Länge
      const v = sub(raw, from);
      const l = len(v);
      const a = Math.atan2(v.y, v.x);
      const sa = (Math.round((a * 180) / Math.PI / 15) * 15 * Math.PI) / 180;
      const L = round(l, step);
      let p = { x: from.x + Math.cos(sa) * L, y: from.y + Math.sin(sa) * L };
      // Ausrichtung an anderen Knoten bei waagerecht/senkrecht
      const horiz = Math.abs(Math.sin(sa)) < 1e-6;
      const vert = Math.abs(Math.cos(sa)) < 1e-6;
      for (const n of this.nodes()) {
        if (horiz && Math.abs(n.x - p.x) < tol) {
          p = { x: n.x, y: p.y };
          this.guides.x = n.x;
        }
        if (vert && Math.abs(n.y - p.y) < tol) {
          p = { x: p.x, y: n.y };
          this.guides.y = n.y;
        }
      }
      return p;
    }
    // 3. Auf Wand
    for (const w of store.project.walls) {
      const pr = projectOnSegment(raw, w.a, w.b);
      if (pr.d < tol * 0.8 && pr.t > 0.02 && pr.t < 0.98) return { x: round(pr.q.x, 0.1), y: round(pr.q.y, 0.1) };
    }
    // 4. Ausrichtung + Raster
    let p = { x: round(raw.x, step), y: round(raw.y, step) };
    for (const n of [...this.nodes(), ...this.chain]) {
      if (Math.abs(n.x - raw.x) < tol) {
        p = { x: n.x, y: p.y };
        this.guides.x = n.x;
      }
      if (Math.abs(n.y - raw.y) < tol) {
        p = { x: p.x, y: n.y };
        this.guides.y = n.y;
      }
    }
    return p;
  }

  // ---------------------------------------------------------------- Treffer

  private hitItem(p: P): Item | null {
    const items = [...store.project.items].sort((a, b) => b.z + b.h - (a.z + a.h) || a.w * a.d - b.w * b.d);
    for (const it of items) if (pointInItem(it, p, 2 / this.scale)) return it;
    return null;
  }

  private rotHandle(it: Item): P {
    const off = it.d / 2 + 22 / this.scale;
    return add({ x: it.x, y: it.y }, rotCW({ x: 0, y: -off }, it.rot));
  }

  private hitWall(p: P, tolPx = 4): { w: Wall; s: number } | null {
    let best: { w: Wall; s: number; d: number } | null = null;
    for (const w of store.project.walls) {
      const pr = projectOnSegment(p, w.a, w.b);
      const lim = w.thickness / 2 + tolPx / this.scale;
      if (pr.d <= lim && (!best || pr.d < best.d)) best = { w, s: pr.s, d: pr.d };
    }
    return best ? { w: best.w, s: best.s } : null;
  }

  private hitOpening(p: P): Opening | null {
    for (const o of store.project.openings) {
      const w = store.wall(o.wallId);
      if (!w) continue;
      const pr = projectOnSegment(p, w.a, w.b);
      if (pr.d <= w.thickness / 2 + 4 / this.scale && Math.abs(pr.s - o.offset) <= o.width / 2) return o;
    }
    return null;
  }

  private hitNode(p: P): P | null {
    const tol = 9 / this.scale;
    for (const n of this.nodes()) if (dist(n, p) < tol) return n;
    return null;
  }

  private hitCompass(sx: number, sy: number): boolean {
    const c = this.compassCenter();
    return Math.hypot(sx - c.x, sy - c.y) < 34;
  }

  private compassCenter(): P {
    return { x: this.w - 52, y: 52 };
  }

  // ---------------------------------------------------------------- Ereignisse

  private bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const before = this.toWorld(sx, sy);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.scale = clamp(this.scale * f, 0.05, 10);
      this.ox = sx - before.x * this.scale;
      this.oy = sy - before.y * this.scale;
      this.draw();
    }, { passive: false });

    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e));
    c.addEventListener('dblclick', (e) => this.dbl(e));
    c.addEventListener('dragover', (e) => e.preventDefault());
    c.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer?.getData('text/catalog');
      const entry = id ? this.findEntry?.(id) : undefined;
      if (!entry) return;
      const r = c.getBoundingClientRect();
      const wp = this.toWorld(e.clientX - r.left, e.clientY - r.top);
      this.placeEntry(entry, { x: Math.round(wp.x), y: Math.round(wp.y) });
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.shift = true;
      if (e.key === ' ' && document.activeElement === c) {
        this.spaceDown = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.shift = false;
      if (e.key === ' ') this.spaceDown = false;
    });
  }

  placeEntry(entry: CatalogEntry, at?: P) {
    const pos = at ?? this.toWorld(this.w / 2, this.h / 2);
    const it = newItemFromEntry(entry, Math.round(pos.x), Math.round(pos.y));
    store.update((p) => {
      p.items.push(it);
      if (settings.snapWalls && it.type !== 'rug') snapItemToWall(p, it);
      const sup = settings.stack ? supportAt(p, { x: it.x, y: it.y }, new Set([it.id])) : null;
      if (sup) it.z = sup.z + sup.h;
    });
    store.select({ kind: 'item', id: it.id });
  }

  /** Tastatureingaben für den Wand-Werkzeug (Länge tippen). Gibt true zurück, wenn verbraucht. */
  handleKey(e: KeyboardEvent): boolean {
    if (this.tool === 'wall' && this.chain.length) {
      if (/^[0-9.,m]$/.test(e.key)) {
        this.typed += e.key;
        this.draw();
        return true;
      }
      if (e.key === 'Backspace') {
        if (this.typed) this.typed = this.typed.slice(0, -1);
        else if (this.chain.length > 1) this.chain.pop();
        this.draw();
        return true;
      }
      if (e.key === 'Enter') {
        const L = parseLength(this.typed);
        if (L && L > 0) {
          const from = this.chain[this.chain.length - 1];
          let dir = norm(sub(this.cursor, from));
          if (!len(sub(this.cursor, from))) dir = { x: 1, y: 0 };
          const pnt = add(from, mul(dir, L));
          this.chain.push({ x: round(pnt.x, 0.1), y: round(pnt.y, 0.1) });
          this.typed = '';
          this.draw();
        } else if (this.chain.length >= 2) {
          this.finishChain(false);
        }
        return true;
      }
      if (e.key === 'Escape') {
        if (this.chain.length >= 2) this.finishChain(false);
        else this.chain = [];
        this.typed = '';
        this.draw();
        return true;
      }
    }
    if (e.key === 'Escape') {
      if (this.tool !== 'select') {
        this.setTool('select');
        return true;
      }
    }
    return false;
  }

  private evtPos(e: PointerEvent | MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { sx, sy, w: this.toWorld(sx, sy) };
  }

  private down(e: PointerEvent) {
    this.canvas.focus();
    const { sx, sy, w } = this.evtPos(e);
    this.shift = e.shiftKey;
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      if (e.button === 2 && this.tool === 'wall' && this.chain.length) {
        if (this.chain.length >= 2) this.finishChain(false);
        else this.chain = [];
        this.draw();
        return;
      }
      this.drag = { kind: 'pan', sx, sy, ox: this.ox, oy: this.oy };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (this.hitCompass(sx, sy)) {
      this.drag = { kind: 'compass' };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    const t = this.tool;
    if (t === 'wall') {
      const p = this.snap(w, this.chain[this.chain.length - 1]);
      const typedL = parseLength(this.typed);
      if (this.chain.length && typedL) {
        const from = this.chain[this.chain.length - 1];
        const pnt = add(from, mul(norm(sub(p, from)), typedL));
        this.chain.push(pnt);
        this.typed = '';
      } else if (this.chain.length >= 3 && same(p, this.chain[0], 0.5)) {
        this.finishChain(true);
        return;
      } else if (!this.chain.length || !same(p, this.chain[this.chain.length - 1], 0.5)) {
        this.chain.push(p);
      }
      this.draw();
      return;
    }
    if (t === 'room') {
      const p = this.snap(w);
      this.drag = { kind: 'room', start: p, cur: p };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (t === 'measure') {
      const p = this.snap(w);
      this.drag = { kind: 'measure', start: p, cur: p };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (t === 'window' || t === 'door' || t === 'french') {
      const hw = this.hitWall(w, 10);
      if (!hw) {
        this.onStatus('Bitte direkt auf eine Wand klicken.');
        return;
      }
      this.insertOpening(hw.w, hw.s, t);
      return;
    }
    // Auswahl-Werkzeug
    const sel = store.selection;
    if (sel?.kind === 'item') {
      const it = store.item(sel.id);
      if (it && !it.locked && dist(this.rotHandle(it), w) < 10 / this.scale) {
        this.drag = { kind: 'rotate', id: it.id, children: stackedOn(store.project, it) };
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
    const it = this.hitItem(w);
    if (it) {
      store.select({ kind: 'item', id: it.id });
      if (!it.locked) {
        this.drag = { kind: 'item', id: it.id, off: sub({ x: it.x, y: it.y }, w), children: stackedOn(store.project, it), moved: false, start: w };
        this.canvas.setPointerCapture(e.pointerId);
      }
      return;
    }
    const node = this.hitNode(w);
    if (node) {
      this.drag = { kind: 'node', at: { ...node }, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    const op = this.hitOpening(w);
    if (op) {
      store.select({ kind: 'opening', id: op.id });
      this.drag = { kind: 'opening', id: op.id, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    const hw = this.hitWall(w);
    if (hw) {
      store.select({ kind: 'wall', id: hw.w.id });
      this.drag = { kind: 'wall', id: hw.w.id, start: w, a0: { ...hw.w.a }, b0: { ...hw.w.b }, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    const room = [...store.project.rooms].reverse().find((r) => pointInPolygon(w, r.points));
    store.select(room ? { kind: 'room', id: room.id } : null);
    this.drag = { kind: 'pan', sx, sy, ox: this.ox, oy: this.oy };
    this.canvas.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent) {
    const { sx, sy, w } = this.evtPos(e);
    this.shift = e.shiftKey;
    const d = this.drag;
    if (!d) {
      if (this.tool === 'wall') this.cursor = this.snap(w, this.chain[this.chain.length - 1]);
      else if (this.tool === 'window' || this.tool === 'door' || this.tool === 'french') this.hoverWall = this.hitWall(w, 10);
      else if (this.tool === 'room' || this.tool === 'measure') this.cursor = this.snap(w);
      else this.updateHoverCursor(w, sx, sy);
      this.draw();
      return;
    }
    switch (d.kind) {
      case 'pan':
        this.ox = d.ox + (sx - d.sx);
        this.oy = d.oy + (sy - d.sy);
        this.draw();
        break;
      case 'compass': {
        const c = this.compassCenter();
        let ang = (Math.atan2(sx - c.x, -(sy - c.y)) * 180) / Math.PI;
        if (!e.shiftKey) ang = Math.round(ang / 5) * 5;
        store.mutate((p) => (p.site.north = ((ang % 360) + 360) % 360));
        this.onStatus(`Norden zeigt im Plan auf ${Math.round(store.project.site.north)}° (im Uhrzeigersinn von oben). Shift = feiner.`);
        break;
      }
      case 'item': {
        if (!d.moved && dist(w, d.start) * this.scale < 3) return;
        d.moved = true;
        const p = store.project;
        const it = p.items.find((i) => i.id === d.id)!;
        let target = add(w, d.off);
        if (settings.snapGrid) target = { x: round(target.x, 1), y: round(target.y, 1) };
        // Wand-Andocken an einer Kopie prüfen
        let rot = it.rot;
        if (settings.snapWalls && !e.altKey && !['rug'].includes(it.type)) {
          const tmp = { ...it, x: target.x, y: target.y };
          if (snapItemToWall(p, tmp)) {
            target = { x: tmp.x, y: tmp.y };
            rot = tmp.rot;
          }
        }
        store.mutate((pp) => {
          const ii = pp.items.find((i) => i.id === d.id)!;
          if (rot !== ii.rot) rotateItemTo(ii, rot, d.children);
          moveItemTo(pp, ii, target.x, target.y, d.children);
        });
        const ii = store.item(d.id)!;
        const sup = settings.stack ? supportAt(store.project, { x: ii.x, y: ii.y }, new Set([ii.id, ...d.children.map((c) => c.id)])) : null;
        this.onStatus(`${ii.name}: x ${Math.round(ii.x)} / y ${Math.round(ii.y)} cm${sup ? ` · gestapelt auf ${sup.name} (${Math.round(ii.z)} cm)` : ''} · Alt = nicht an Wand andocken`);
        break;
      }
      case 'rotate': {
        const it = store.item(d.id)!;
        let ang = (Math.atan2(w.x - it.x, -(w.y - it.y)) * 180) / Math.PI;
        if (!e.shiftKey) ang = Math.round(ang / 15) * 15;
        store.mutate(() => rotateItemTo(it, ang, d.children));
        this.onStatus(`Drehung: ${Math.round(it.rot)}° (Shift = stufenlos)`);
        break;
      }
      case 'node': {
        const to = this.snapExcluding(w, d.at);
        if (same(to, d.at, 0.01)) return;
        d.moved = true;
        store.mutate((p) => moveNode(p, d.at, to, 0.5));
        d.at = to;
        break;
      }
      case 'wall': {
        const wall = store.wall(d.id);
        if (!wall) return;
        const n = perp(norm(sub(d.b0, d.a0)));
        let off = dot(sub(w, d.start), n);
        if (settings.snapGrid) off = round(off, settings.gridStep);
        if (!d.moved && Math.abs(off) < 0.5) return;
        d.moved = true;
        const na = add(d.a0, mul(n, off));
        const nb = add(d.b0, mul(n, off));
        store.mutate((p) => {
          const ww = p.walls.find((x) => x.id === d.id)!;
          const ca = { ...ww.a };
          const cb = { ...ww.b };
          moveNode(p, ca, na, 0.5);
          moveNode(p, cb, nb, 0.5);
        });
        this.onStatus(`Wand verschoben um ${fmtLen(off)}`);
        break;
      }
      case 'opening': {
        const o = store.opening(d.id);
        if (!o) return;
        d.moved = true;
        const hw = this.hitWall(w, 25);
        store.mutate(() => {
          const wall = hw ? hw.w : store.wall(o.wallId)!;
          const pr = projectOnSegment(w, wall.a, wall.b);
          o.wallId = wall.id;
          const L = wallLength(wall);
          let s = pr.s;
          if (settings.snapGrid) s = round(s, 1);
          o.offset = clamp(s, o.width / 2, Math.max(o.width / 2, L - o.width / 2));
        });
        const wall = store.wall(o.wallId)!;
        this.onStatus(`Abstand zur Wandecke: links ${fmtLen(o.offset - o.width / 2)} · rechts ${fmtLen(wallLength(wall) - o.offset - o.width / 2)}`);
        break;
      }
      case 'room':
      case 'measure':
        d.cur = this.snap(w);
        this.draw();
        break;
    }
  }

  private snapExcluding(raw: P, exclude: P): P {
    const tol = 10 / this.scale;
    for (const n of this.nodes()) if (!same(n, exclude, 0.5) && dist(n, raw) < tol) return { ...n };
    const step = settings.snapGrid ? settings.gridStep : 0.1;
    let p = { x: round(raw.x, step), y: round(raw.y, step) };
    this.guides = {};
    for (const n of this.nodes()) {
      if (same(n, exclude, 0.5)) continue;
      if (Math.abs(n.x - raw.x) < tol) {
        p = { x: n.x, y: p.y };
        this.guides.x = n.x;
      }
      if (Math.abs(n.y - raw.y) < tol) {
        p = { x: p.x, y: n.y };
        this.guides.y = n.y;
      }
    }
    return p;
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    this.guides = {};
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* egal */
    }
    if (!d) return;
    if (d.kind === 'compass') store.commit();
    if ((d.kind === 'item' || d.kind === 'node' || d.kind === 'wall' || d.kind === 'opening') && d.moved) store.commit();
    if (d.kind === 'rotate') store.commit();
    if (d.kind === 'room') {
      const a = d.start;
      const b = d.cur;
      if (Math.abs(a.x - b.x) > 20 && Math.abs(a.y - b.y) > 20) {
        const pts = [
          { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
          { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
          { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
          { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
        ];
        this.createRoom(pts);
      }
      this.draw();
    }
    if (d.kind === 'measure') {
      this.measure = { a: d.start, b: d.cur };
      this.draw();
    }
  }

  private dbl(e: MouseEvent) {
    const { w } = this.evtPos(e);
    if (this.tool === 'wall') {
      if (this.chain.length >= 2) this.finishChain(false);
      return;
    }
    if (this.tool !== 'select') return;
    if (this.hitItem(w) || this.hitOpening(w)) return;
    const hw = this.hitWall(w);
    if (hw) this.splitWall(hw.w.id, hw.s);
  }

  splitWall(id: string, s?: number) {
    const w = store.wall(id);
    if (!w) return;
    const L = wallLength(w);
    const at = s ?? L / 2;
    if (at < 5 || at > L - 5) return;
    const dir = wallDir(w);
    const m = add(w.a, mul(dir, round(at, 0.1)));
    store.update((p) => {
      const ww = p.walls.find((x) => x.id === id)!;
      const nw: Wall = { ...ww, id: uid(), a: { ...m }, b: { ...ww.b } };
      ww.b = { ...m };
      p.walls.push(nw);
      for (const o of p.openings)
        if (o.wallId === id && o.offset > at) {
          o.wallId = nw.id;
          o.offset -= at;
        }
      // Raumpolygone um neuen Punkt ergänzen
      for (const r of p.rooms) {
        for (let i = 0; i < r.points.length; i++) {
          const a = r.points[i];
          const b = r.points[(i + 1) % r.points.length];
          const pr = projectOnSegment(m, a, b);
          if (pr.d < 0.5 && pr.t > 0 && pr.t < 1) {
            r.points.splice(i + 1, 0, { ...m });
            break;
          }
        }
      }
    });
    this.onStatus('Wand geteilt – den neuen Knoten kannst du jetzt verschieben.');
  }

  private updateHoverCursor(w: P, sx: number, sy: number) {
    let cur = 'default';
    if (this.hitCompass(sx, sy)) cur = 'grab';
    else {
      const sel = store.selection;
      const it = sel?.kind === 'item' ? store.item(sel.id) : undefined;
      if (it && dist(this.rotHandle(it), w) < 10 / this.scale) cur = 'alias';
      else if (this.hitItem(w)) cur = 'move';
      else if (this.hitNode(w)) cur = 'crosshair';
      else if (this.hitOpening(w)) cur = 'ew-resize';
      else if (this.hitWall(w)) cur = 'pointer';
    }
    this.canvas.style.cursor = cur;
  }

  private insertOpening(w: Wall, s: number, type: OpeningType) {
    const def = type === 'window' ? { width: 100, height: 135, sill: 90 } : type === 'door' ? { width: 90, height: 205, sill: 0 } : { width: 110, height: 220, sill: 0 };
    const L = wallLength(w);
    const width = Math.min(def.width, L - 10);
    const o: Opening = { id: uid(), wallId: w.id, type, offset: clamp(round(s, 1), width / 2, L - width / 2), ...def, width };
    store.update((p) => p.openings.push(o));
    store.select({ kind: 'opening', id: o.id });
  }

  private finishChain(closed: boolean) {
    const pts = this.chain;
    this.chain = [];
    this.typed = '';
    if (pts.length < 2) return;
    const d = store.project.defaults;
    store.update((p) => {
      p.walls.push(...chainWalls(pts, closed, d.wallThickness, d.wallHeight));
      if (closed && pts.length >= 3) {
        p.rooms.push({ id: uid(), name: `Raum ${p.rooms.length + 1}`, points: pts.map((q) => ({ ...q })), floor: { kind: 'eiche', color: '#ffffff' } });
      }
    });
    this.draw();
  }

  createRoom(pts: P[]) {
    const d = store.project.defaults;
    let roomId = '';
    store.update((p) => {
      // vorhandene Wände an gleicher Stelle nicht doppelt anlegen
      const nw = chainWalls(pts, true, d.wallThickness, d.wallHeight).filter(
        (w) => !p.walls.some((o) => (same(o.a, w.a) && same(o.b, w.b)) || (same(o.a, w.b) && same(o.b, w.a))),
      );
      p.walls.push(...nw);
      roomId = uid();
      p.rooms.push({ id: roomId, name: `Raum ${p.rooms.length + 1}`, points: pts.map((q) => ({ ...q })), floor: { kind: 'eiche', color: '#ffffff' } });
    });
    store.select({ kind: 'room', id: roomId });
  }

  deleteSelection() {
    const s = store.selection;
    if (!s) return;
    store.update((p) => {
      if (s.kind === 'item') {
        const it = p.items.find((i) => i.id === s.id);
        if (it) {
          const kids = stackedOn(p, it);
          // gestapelte Dinge fallen eine Ebene herunter
          for (const k of kids) k.z = Math.max(0, k.z - it.h);
        }
        p.items = p.items.filter((i) => i.id !== s.id);
      }
      if (s.kind === 'opening') p.openings = p.openings.filter((o) => o.id !== s.id);
      if (s.kind === 'wall') deleteWall(p, s.id);
      if (s.kind === 'room') p.rooms = p.rooms.filter((r) => r.id !== s.id);
    });
    store.select(null);
  }

  // ---------------------------------------------------------------- Zeichnen

  private raf = 0;
  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private render() {
    const ctx = this.ctx;
    const p = store.project;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid();

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    const px = 1 / this.scale;

    // Räume
    for (const r of p.rooms) {
      if (r.points.length < 3) continue;
      const sel = store.selection?.kind === 'room' && store.selection.id === r.id;
      ctx.beginPath();
      r.points.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = this.floorTint(r.floor.kind, r.floor.color);
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = COL.accent;
        ctx.lineWidth = 3 * px;
        ctx.setLineDash([8 * px, 5 * px]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Sonnenstunden
    if (ui.heat) {
      const max = Math.max(1, ...ui.heat.cells.map((c) => c.hours));
      const st = ui.heat.step;
      for (const c of ui.heat.cells) {
        ctx.fillStyle = '#' + heatColor(c.hours / max).getHexString();
        ctx.globalAlpha = 0.72;
        ctx.fillRect(c.x - st / 2, c.y - st / 2, st + 0.5, st + 0.5);
      }
      ctx.globalAlpha = 1;
    }

    // Raumbeschriftung (unter den Möbeln)
    for (const r of p.rooms) {
      if (r.points.length < 3) continue;
      const c = polygonCentroid(r.points);
      const area = Math.abs(polygonArea(innerArea(r, p)));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(px, px);
      ctx.textAlign = 'center';
      ctx.font = '600 13px Inter, system-ui, sans-serif';
      const tw = Math.max(ctx.measureText(r.name).width, 60) + 14;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.beginPath();
      ctx.roundRect(-tw / 2, -17, tw, 36, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(43,48,54,0.9)';
      ctx.fillText(r.name, 0, -2);
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText(fmtArea(area), 0, 13);
      ctx.restore();
    }


    // Möbel
    const items = [...p.items].sort((a, b) => a.z - b.z || (a.type === 'rug' ? -1 : 0));
    for (const it of items) this.drawItem(it, px);

    // Wände
    for (const w of p.walls) this.drawWall(w, px);
    for (const o of p.openings) this.drawOpening(o, px);

    // Maße
    if (ui.showDims) for (const w of p.walls) this.drawWallDim(w, px);

    // Auswahl
    const s = store.selection;
    if (s?.kind === 'item') {
      const it = store.item(s.id);
      if (it) {
        this.drawItemSelection(it, px);
        if (ui.showItemDims) this.drawClearances(it, px);
      }
    }
    if (s?.kind === 'wall') {
      const w = store.wall(s.id);
      if (w)
        for (const q of [w.a, w.b]) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = COL.accent;
          ctx.lineWidth = 2 * px;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 6 * px, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
    }

    // Werkzeug-Vorschau
    this.drawToolPreview(px);
    ctx.restore();

    this.drawCompass();
    this.drawScaleBar();
  }

  private tintCache = new Map<string, string>();
  private floorTint(kind: string, color: string): string {
    const key = kind + color;
    let c = this.tintCache.get(key);
    if (!c) {
      const pr = findPreset(kind);
      // Durchschnittsfarbe grob aus Material-ID ableiten
      const base: Record<string, string> = {
        eiche: '#d9bf98', eiche_hell: '#e8d9bd', nussbaum: '#a07f63', fischgraet: '#d9bc93', dielen_weiss: '#eeeae1',
        laminat_grau: '#c9c6c0', beton: '#d6d5d2', marmor: '#f0f0ee', terrazzo: '#e7e3dc', teppich: '#dedbd4', schachbrett: '#bdbcb9',
      };
      const b = base[pr.id] ?? '#eeeeee';
      c = mix(b, color);
      this.tintCache.set(key, c);
    }
    return c;
  }

  private drawGrid() {
    const ctx = this.ctx;
    const steps = [10, 50, 100, 500, 1000];
    let minor = steps.find((s) => s * this.scale >= 9) ?? 1000;
    const major = minor < 100 ? 100 : minor * 5;
    if (minor === major) minor = major / 5;
    const tl = this.toWorld(0, 0);
    const br = this.toWorld(this.w, this.h);
    ctx.lineWidth = 1;
    for (const [step, color] of [
      [minor, COL.grid],
      [major, COL.grid2],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
        const sx = Math.round(x * this.scale + this.ox) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.h);
      }
      for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
        const sy = Math.round(y * this.scale + this.oy) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.w, sy);
      }
      ctx.stroke();
    }
  }

  private wallQuad(w: Wall, s0: number, s1: number): P[] {
    const dir = wallDir(w);
    const n = perp(dir);
    const t = w.thickness / 2;
    const a = add(w.a, mul(dir, s0));
    const b = add(w.a, mul(dir, s1));
    return [add(a, mul(n, t)), add(b, mul(n, t)), add(b, mul(n, -t)), add(a, mul(n, -t))];
  }

  private drawWall(w: Wall, px: number) {
    const ctx = this.ctx;
    const p = store.project;
    const L = wallLength(w);
    if (L < 0.1) return;
    const connA = p.walls.some((o) => o !== w && (same(o.a, w.a) || same(o.b, w.a)));
    const connB = p.walls.some((o) => o !== w && (same(o.a, w.b) || same(o.b, w.b)));
    const e0 = connA ? -w.thickness / 2 : 0;
    const e1 = connB ? L + w.thickness / 2 : L;
    const ops = p.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset);
    const segs: [number, number][] = [];
    let cur = e0;
    for (const o of ops) {
      const a = o.offset - o.width / 2;
      const b = o.offset + o.width / 2;
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < e1) segs.push([cur, e1]);
    const sel = store.selection?.kind === 'wall' && store.selection.id === w.id;
    ctx.fillStyle = sel ? COL.wallSel : COL.wall;
    for (const [a, b] of segs) {
      const q = this.wallQuad(w, a, b);
      ctx.beginPath();
      q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
      ctx.fill();
    }
    void px;
  }

  private drawOpening(o: Opening, px: number) {
    const ctx = this.ctx;
    const w = store.wall(o.wallId);
    if (!w) return;
    const dir = wallDir(w);
    const n = perp(dir);
    const t = w.thickness / 2;
    const sel = store.selection?.kind === 'opening' && store.selection.id === o.id;
    const a = add(w.a, mul(dir, o.offset - o.width / 2));
    const b = add(w.a, mul(dir, o.offset + o.width / 2));
    const q = this.wallQuad(w, o.offset - o.width / 2, o.offset + o.width / 2);
    ctx.fillStyle = sel ? '#dbe8ff' : '#ffffff';
    ctx.beginPath();
    q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = sel ? COL.accent : COL.wall;
    ctx.lineWidth = 1.2 * px;
    ctx.stroke();
    if (o.type === 'window' || o.type === 'french') {
      ctx.beginPath();
      for (const f of [-0.25, 0.25]) {
        const pa = add(a, mul(n, t * f * 2 * 0.5));
        const pb = add(b, mul(n, t * f * 2 * 0.5));
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();
    }
    if (o.type === 'door' || o.type === 'french') {
      const side = o.swingOut ? -1 : 1;
      const wings = o.type === 'french' && o.width > 125 ? 2 : 1;
      const leaves: { hinge: P; free: P }[] = [];
      if (wings === 1) leaves.push(o.hingeRight ? { hinge: b, free: a } : { hinge: a, free: b });
      else {
        const m = add(a, mul(dir, o.width / 2));
        leaves.push({ hinge: a, free: m }, { hinge: b, free: m });
      }
      ctx.setLineDash([]);
      for (const lf of leaves) {
        const h = add(lf.hinge, mul(n, side * t));
        const r = dist(lf.hinge, lf.free);
        const open = add(h, mul(n, side * r));
        ctx.strokeStyle = sel ? COL.accent : '#59616b';
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(open.x, open.y);
        ctx.stroke();
        ctx.lineWidth = 1 * px;
        ctx.setLineDash([4 * px, 3 * px]);
        const a0 = Math.atan2(open.y - h.y, open.x - h.x);
        const f = add(lf.free, mul(n, side * t));
        const a1 = Math.atan2(f.y - h.y, f.x - h.x);
        ctx.beginPath();
        const ccw = cross(sub(open, h), sub(f, h)) < 0;
        ctx.arc(h.x, h.y, r, a0, a1, ccw);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawWallDim(w: Wall, px: number) {
    const ctx = this.ctx;
    const L = wallLength(w);
    if (L * this.scale < 30) return;
    const dir = wallDir(w);
    let n = perp(dir);
    // Maß nach außen (weg vom Schwerpunkt aller Wände)
    const all = store.project.walls.flatMap((x) => [x.a, x.b]);
    const c = all.reduce((acc, q) => add(acc, q), { x: 0, y: 0 });
    const cc = mul(c, 1 / all.length);
    const mid = mul(add(w.a, w.b), 0.5);
    if (dot(sub(mid, cc), n) < 0) n = mul(n, -1);
    const off = w.thickness / 2 + 16 * px;
    const a = add(w.a, mul(n, off));
    const b = add(w.b, mul(n, off));
    ctx.strokeStyle = COL.dim;
    ctx.lineWidth = 1 * px;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    for (const e of [a, b]) {
      const t1 = add(e, mul(add(dir, n), 4 * px));
      const t2 = add(e, mul(add(dir, n), -4 * px));
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
    }
    ctx.stroke();
    const m = mul(add(a, b), 0.5);
    let ang = Math.atan2(dir.y, dir.x);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(ang);
    ctx.scale(px, px);
    const txt = fmtLen(L);
    ctx.font = '11px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(txt).width + 6;
    ctx.fillStyle = COL.bg;
    ctx.fillRect(-tw / 2, -7, tw, 14);
    ctx.fillStyle = COL.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  private drawItem(it: Item, px: number) {
    const ctx = this.ctx;
    const corners = itemCorners(it);
    ctx.beginPath();
    if (['cylinder', 'plant'].includes(it.type) || ((it.type === 'table' || it.type === 'rug' || it.type === 'stool' || it.type === 'mirror') && it.params.round)) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate((it.rot * Math.PI) / 180);
      ctx.ellipse(0, 0, it.w / 2, it.d / 2, 0, 0, Math.PI * 2);
      ctx.restore();
    } else corners.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    const wallMounted = it.z > 0 && !store.project.items.some((o) => o !== it && Math.abs(o.z + o.h - it.z) < 1.5);
    ctx.fillStyle = hexA(it.color, it.type === 'rug' ? 0.55 : 0.82);
    ctx.fill();
    ctx.strokeStyle = shadeHex(it.color, -0.45);
    ctx.lineWidth = 1.2 * px;
    if (wallMounted) ctx.setLineDash([5 * px, 3 * px]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Detailstriche je Typ
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate((it.rot * Math.PI) / 180);
    ctx.strokeStyle = shadeHex(it.color, -0.35);
    ctx.lineWidth = 1 * px;
    const hw = it.w / 2;
    const hd = it.d / 2;
    ctx.beginPath();
    switch (it.type) {
      case 'bed':
        ctx.rect(-hw + 6, -hd + 6, it.w - 12, it.d - 12);
        ctx.moveTo(-hw + 6, -hd + 50);
        ctx.lineTo(hw - 6, -hd + 50);
        ctx.moveTo(-hw, -hd + 6);
        ctx.lineTo(hw, -hd + 6);
        break;
      case 'sofa':
      case 'armchair': {
        const A = it.type === 'sofa' ? (it.params.arm ?? 20) : it.w * 0.17;
        ctx.rect(-hw + A, -hd + 22, it.w - 2 * A, it.d - 22);
        const seats = it.type === 'sofa' ? it.params.seats ?? 3 : 1;
        for (let i = 1; i < seats; i++) {
          const x = -hw + A + ((it.w - 2 * A) * i) / seats;
          ctx.moveTo(x, -hd + 22);
          ctx.lineTo(x, hd);
        }
        break;
      }
      case 'wardrobe':
      case 'kitchenbase':
      case 'kitchenwall':
      case 'dresser':
      case 'tvbench':
        ctx.moveTo(-hw, hd - 2);
        ctx.lineTo(hw, hd - 2);
        break;
      case 'table':
      case 'desk':
        if (!it.params.round) ctx.rect(-hw + 4, -hd + 4, it.w - 8, it.d - 8);
        break;
      case 'sink':
        ctx.rect(-Math.min(hw - 6, 30), -hd + 10, Math.min(it.w - 12, 60), 40);
        break;
      case 'stove':
        for (const [x, y] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.22], [0.25, 0.22]]) {
          ctx.moveTo(x * it.w + 8, y * it.d);
          ctx.arc(x * it.w, y * it.d, 8, 0, Math.PI * 2);
        }
        break;
      case 'bathtub':
        ctx.roundRect(-hw + 7, -hd + 7, it.w - 14, it.d - 14, 20);
        break;
      case 'shower':
        ctx.moveTo(-hw, -hd);
        ctx.lineTo(hw, hd);
        ctx.moveTo(hw, -hd);
        ctx.lineTo(-hw, hd);
        break;
      case 'toilet':
      case 'washbasin':
        ctx.ellipse(0, 4, hw * 0.75, hd * 0.6, 0, 0, Math.PI * 2);
        break;
    }
    ctx.stroke();
    ctx.restore();
    // Beschriftung
    const size = Math.min(it.w, it.d) * this.scale;
    if (size > 26 && it.w * this.scale > 40) {
      ctx.save();
      ctx.translate(it.x, it.y);
      // Text entlang der längeren Seite, nie auf dem Kopf
      let deg = it.rot + (it.d > it.w * 1.4 ? 90 : 0);
      deg = ((deg % 360) + 360) % 360;
      if (deg > 90 && deg <= 270) deg -= 180;
      ctx.rotate((deg * Math.PI) / 180);
      ctx.scale(px, px);
      ctx.fillStyle = lum(it.color) > 0.55 ? 'rgba(30,34,40,0.85)' : 'rgba(255,255,255,0.92)';
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = it.name.replace(/^([A-ZÄÖÜÅ]{3,})\s.*$/, '$1');
      ctx.fillText(name.length > 18 ? name.slice(0, 17) + '…' : name, 0, it.z > 0 ? -5 : 0);
      if (it.z > 0) {
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillText(`↑ ${Math.round(it.z)} cm`, 0, 7);
      }
      ctx.restore();
    }
  }

  private drawItemSelection(it: Item, px: number) {
    const ctx = this.ctx;
    const corners = itemCorners(it);
    ctx.strokeStyle = COL.accent;
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    corners.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.stroke();
    // Vorderseite markieren
    ctx.lineWidth = 4 * px;
    ctx.beginPath();
    ctx.moveTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.stroke();
    if (it.locked) return;
    const h = this.rotHandle(it);
    const top = add({ x: it.x, y: it.y }, rotCW({ x: 0, y: -it.d / 2 }, it.rot));
    ctx.lineWidth = 1.5 * px;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(h.x, h.y, 7 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(h.x, h.y, 3.5 * px, -2.4, 1.6);
    ctx.stroke();
  }

  /** Abstände von den Möbelkanten zu den nächsten Wandoberflächen. */
  private drawClearances(it: Item, px: number) {
    const ctx = this.ctx;
    const dirs: P[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const dl of dirs) {
      const half = dl.x ? it.w / 2 : it.d / 2;
      const o = add({ x: it.x, y: it.y }, rotCW(mul(dl, half), it.rot));
      const d = rotCW(dl, it.rot);
      let best = Infinity;
      for (const w of store.project.walls) {
        const n = perp(wallDir(w));
        for (const s of [-1, 1]) {
          const a = add(w.a, mul(n, (s * w.thickness) / 2));
          const b = add(w.b, mul(n, (s * w.thickness) / 2));
          const t = raySeg(o, d, a, b);
          if (t !== null && t > -0.5 && t < best) best = t;
        }
      }
      if (!isFinite(best) || best > 800 || best < 1) continue;
      const e = add(o, mul(d, best));
      ctx.strokeStyle = '#e0532f';
      ctx.lineWidth = 1 * px;
      ctx.setLineDash([3 * px, 3 * px]);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const m = mul(add(o, e), 0.5);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(px, px);
      const txt = fmtLen(best);
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(txt).width + 8;
      ctx.fillStyle = '#e0532f';
      ctx.beginPath();
      ctx.roundRect(-tw / 2, -8, tw, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, 0, 0.5);
      ctx.restore();
    }
  }

  private drawToolPreview(px: number) {
    const ctx = this.ctx;
    // Hilfslinien
    ctx.strokeStyle = 'rgba(47,124,246,0.6)';
    ctx.lineWidth = 1 * px;
    ctx.setLineDash([6 * px, 4 * px]);
    const tl = this.toWorld(0, 0);
    const br = this.toWorld(this.w, this.h);
    if (this.guides.x !== undefined) {
      ctx.beginPath();
      ctx.moveTo(this.guides.x, tl.y);
      ctx.lineTo(this.guides.x, br.y);
      ctx.stroke();
    }
    if (this.guides.y !== undefined) {
      ctx.beginPath();
      ctx.moveTo(tl.x, this.guides.y);
      ctx.lineTo(br.x, this.guides.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (this.tool === 'wall') {
      const t = store.project.defaults.wallThickness;
      const pts = [...this.chain];
      let end = this.cursor;
      const L = parseLength(this.typed);
      if (pts.length && L) {
        const from = pts[pts.length - 1];
        end = add(from, mul(norm(sub(this.cursor, from)), L));
      }
      if (pts.length) pts.push(end);
      ctx.strokeStyle = 'rgba(59,65,72,0.55)';
      ctx.lineWidth = t;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = COL.accent;
      for (const q of [...this.chain, this.cursor]) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, 4 * px, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.chain.length) {
        const from = this.chain[this.chain.length - 1];
        const l = dist(from, end);
        const ang = (Math.atan2(-(end.y - from.y), end.x - from.x) * 180) / Math.PI;
        const label = this.typed ? `Länge: ${this.typed} ⏎` : `${fmtLen(l)} · ${Math.round(((ang % 360) + 360) % 360)}°`;
        this.label(end, label, px, 14, -18);
      } else this.label(this.cursor, 'Startpunkt klicken', px, 14, -18);
    }
    if (this.drag?.kind === 'room') {
      const a = this.drag.start;
      const b = this.drag.cur;
      const t = store.project.defaults.wallThickness;
      ctx.strokeStyle = 'rgba(59,65,72,0.55)';
      ctx.lineWidth = t;
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      const iw = Math.abs(a.x - b.x) - t;
      const il = Math.abs(a.y - b.y) - t;
      this.label(b, `innen ${fmtLen(Math.max(0, iw))} × ${fmtLen(Math.max(0, il))} · ${fmtArea(Math.max(0, iw) * Math.max(0, il))}`, px, 14, 18);
    }
    if (this.tool === 'room' && !this.drag) this.label(this.cursor, 'Rechteck aufziehen', px, 14, -18);
    const m = this.drag?.kind === 'measure' ? { a: this.drag.start, b: this.drag.cur } : this.measure;
    if (m) {
      ctx.strokeStyle = '#e0532f';
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      ctx.moveTo(m.a.x, m.a.y);
      ctx.lineTo(m.b.x, m.b.y);
      ctx.stroke();
      this.label(mul(add(m.a, m.b), 0.5), fmtLen(dist(m.a, m.b)), px, 0, -14);
    }
    if ((this.tool === 'window' || this.tool === 'door' || this.tool === 'french') && this.hoverWall) {
      const w = this.hoverWall.w;
      const width = this.tool === 'window' ? 100 : this.tool === 'door' ? 90 : 110;
      const L = wallLength(w);
      const s = clamp(this.hoverWall.s, width / 2, L - width / 2);
      const q = this.wallQuad(w, s - width / 2, s + width / 2);
      ctx.fillStyle = 'rgba(47,124,246,0.5)';
      ctx.beginPath();
      q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
      ctx.fill();
      this.label(add(w.a, mul(wallDir(w), s)), `${fmtLen(s - width / 2)} ab Wandanfang`, px, 0, -20);
    }
  }

  private label(at: P, text: string, px: number, dx = 0, dy = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.scale(px, px);
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(30,34,40,0.88)';
    ctx.beginPath();
    ctx.roundRect(dx - (dx === 0 ? tw / 2 : 0), dy - 10, tw, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = dx === 0 ? 'center' : 'left';
    ctx.fillText(text, dx === 0 ? 0 : dx + 6, dy);
    ctx.restore();
  }

  private drawCompass() {
    const ctx = this.ctx;
    const c = this.compassCenter();
    const site = store.project.site;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#cfd3d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Sonne
    const sp = siteSun(site);
    if (sp.altitude > 0) {
      const d = planDirForBearing(site.north, sp.bearing);
      ctx.strokeStyle = '#f0a020';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(d.x * 30, d.y * 30);
      ctx.lineTo(d.x * 12, d.y * 12);
      ctx.stroke();
      ctx.fillStyle = '#f7b928';
      ctx.beginPath();
      ctx.arc(d.x * 30, d.y * 30, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate((site.north * Math.PI) / 180);
    ctx.fillStyle = '#d6453d';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(7, 0);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.lineTo(7, 0);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6453d';
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -27 + 0);
    ctx.restore();
  }

  private drawScaleBar() {
    const ctx = this.ctx;
    const options = [10, 25, 50, 100, 200, 500, 1000];
    const target = 110 / this.scale;
    const len_ = options.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    const pxl = len_ * this.scale;
    const x = 16;
    const y = this.h - 18;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - 6, y - 18, pxl + 12, 26);
    ctx.strokeStyle = COL.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + pxl, y);
    ctx.lineTo(x + pxl, y - 4);
    ctx.stroke();
    ctx.fillStyle = COL.text;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmtLen(len_), x + pxl / 2, y - 6);
  }

  exportPNG(): string {
    return this.canvas.toDataURL('image/png');
  }

  centerOn(p: P) {
    this.ox = this.w / 2 - p.x * this.scale;
    this.oy = this.h / 2 - p.y * this.scale;
    this.draw();
  }

  get viewCenter(): P {
    return this.toWorld(this.w / 2, this.h / 2);
  }
}

function raySeg(o: P, d: P, a: P, b: P): number | null {
  const s = sub(b, a);
  const den = cross(d, s);
  if (Math.abs(den) < 1e-9) return null;
  const ao = sub(a, o);
  const t = cross(ao, s) / den;
  const u = cross(ao, d) / den;
  if (u < 0 || u > 1 || t < 0) return null;
  return t;
}

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function hexA(h: string, a: number) {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}
function shadeHex(h: string, f: number) {
  const [r, g, b] = hexToRgb(h);
  const k = (v: number) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}
function lum(h: string) {
  const [r, g, b] = hexToRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function mix(base: string, tint: string) {
  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(tint);
  return `rgb(${Math.round((r1 * r2) / 255)},${Math.round((g1 * g2) / 255)},${Math.round((b1 * b2) / 255)})`;
}

export { toItemLocal };
