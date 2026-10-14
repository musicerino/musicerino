// Bedienoberfläche für Haustechnik und Fußleisten.
import { store } from './store';
import { h, put, numField, selectField, colorField, checkbox } from './dom';
import { CATALOG, TECH_CATEGORIES, FINISHES, isTech, trade } from './catalog';
import type { BaseboardProfile, BaseboardStyle, CatalogEntry, Finish, Item, Project, Room } from './types';
import { thumbnail } from './thumbs';
import { fmtLen, uid, pointInPolygon, polygonCentroid, perp, mul, wallDir } from './geometry';
import { BASEBOARD_PRESETS, defaultRoomBaseboard, demand, roomRuns, roomWalls, allRuns, styleOf, faceRange } from './baseboards';
import { radiatorUnderWindow, switchNextToDoor, wallAttachment } from './ops';
import { newItemFromEntry } from './items';
import { LEGEND, drawSymbol } from './symbols';
import { planDirForBearing } from './sun';
import type { Ctx } from './panels';

export const PROFILES: { value: BaseboardProfile; label: string }[] = [
  { value: 'gerade', label: 'Modern (gerade)' },
  { value: 'rund', label: 'Abgerundet' },
  { value: 'klassisch', label: 'Klassisch (profiliert)' },
];

export const BASEBOARD_COLORS = ['#f4f3ef', '#ebe4d6', '#c9c9c6', '#7d8084', '#3a3c3f', '#1f2022', '#c9a374', '#8a6440'];
export const TECH_COLORS = ['#f6f6f4', '#efe9dc', '#c4c7c9', '#9fa3a6', '#3f4245', '#1f2022'];

// ---------------------------------------------------------------- Himmelsrichtung einer Wand

const WIND = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
/** Himmelsrichtung, in die eine Wandseite (vom Raum aus) nach außen zeigt. */
export function wallCompass(p: Project, room: Room, wallId: string): string {
  const rw = roomWalls(p, room).find((x) => x.wall.id === wallId);
  if (!rw) return '';
  const out = mul(perp(wallDir(rw.wall)), -rw.side); // vom Raum weg
  const n = planDirForBearing(p.site.north, 0);
  const ang = Math.atan2(n.x * out.y - n.y * out.x, n.x * out.x + n.y * out.y);
  const bearing = (((ang * 180) / Math.PI) % 360 + 360) % 360;
  return WIND[Math.round(bearing / 45) % 8];
}

// ---------------------------------------------------------------- Stil-Editor (Höhe, Tiefe, Profil, Farbe)

export function baseboardStyleFields(style: BaseboardStyle, set: (fn: (s: BaseboardStyle) => void) => void): HTMLElement {
  return h('div', {},
    h('div', { class: 'chips' }, ...BASEBOARD_PRESETS.map((pr) => h('button', { class: 'preset', onclick: () => set((s) => Object.assign(s, pr.style)) }, pr.label))),
    h('div', { class: 'grid3' },
      numField('Höhe', style.height, (v) => set((s) => (s.height = v)), { unit: 'cm', min: 1, max: 40, length: true }),
      numField('Tiefe', style.depth, (v) => set((s) => (s.depth = v)), { unit: 'cm', min: 0.3, max: 6, length: true }),
      selectField('Profil', style.profile, PROFILES, (v) => set((s) => (s.profile = v as BaseboardProfile))),
    ),
    h('div', { class: 'grid2' },
      selectField('Material', style.finish, FINISHES.filter((f) => f.id !== 'stoff').map((f) => ({ value: f.id, label: f.label })), (v) => set((s) => (s.finish = v as Finish))),
      h('div', {}),
    ),
    colorField('Farbe', style.color, (v) => set((s) => (s.color = v)), BASEBOARD_COLORS),
  );
}

/** Fußleisten-Einstellungen eines Raums (rundum, Wände abwählbar, Bedarf, in Stücke umwandeln). */
export function baseboardEditor(roomId: string, ctx?: Ctx): HTMLElement {
  const p = store.project;
  const r = p.rooms.find((x) => x.id === roomId);
  const wrap = h('div', {});
  if (!r) return wrap;
  const bb = r.baseboard;
  const setRoom = (fn: (b: NonNullable<Room['baseboard']>) => void) =>
    store.update((pp) => {
      const rr = pp.rooms.find((x) => x.id === roomId);
      if (!rr) return;
      if (!rr.baseboard) rr.baseboard = { ...defaultRoomBaseboard(), on: false };
      fn(rr.baseboard);
    });
  const pieces = p.baseboards.filter((bp) => roomWalls(p, r).some((rw) => rw.wall.id === bp.wallId && rw.side === bp.side));
  put(wrap,
    checkbox('Fußleiste rundum (ganze Wände)', !!bb?.on, (v) => setRoom((b) => (b.on = v)), 'Läuft an allen Wänden des Raums entlang und spart Türen aus'),
  );
  if (bb?.on) {
    const runs = roomRuns(p, r);
    const dem = demand(runs, bb.pieceLength ?? 240);
    const walls = roomWalls(p, r);
    put(wrap,
      h('div', { style: 'height:6px' }),
      baseboardStyleFields(bb, (fn) => setRoom((b) => fn(b))),
      h('h4', {}, 'An welchen Wänden?'),
      h('div', { class: 'list' },
        ...walls.map((rw, i) => {
          const on = !(bb.skip ?? []).includes(rw.wall.id);
          const dir = wallCompass(p, r, rw.wall.id);
          const len = runs.filter((x) => x.wall.id === rw.wall.id).reduce((s, x) => s + x.s1 - x.s0, 0);
          return h('label', { class: 'li', style: 'cursor:pointer' },
            h('span', { style: 'display:flex;gap:8px;align-items:center' },
              h('input', { type: 'checkbox', checked: on, onchange: (e: Event) => setRoom((b) => {
                const skip = new Set(b.skip ?? []);
                if ((e.target as HTMLInputElement).checked) skip.delete(rw.wall.id);
                else skip.add(rw.wall.id);
                b.skip = [...skip];
              }) }),
              `Wand ${i + 1}${dir ? ` · ${dir}` : ''}`),
            h('span', { class: 'muted' }, on ? fmtLen(len) : 'ohne'),
          );
        }),
      ),
      h('div', { class: 'card', style: 'margin-top:8px;background:#fff' },
        h('div', { class: 'grid2' },
          h('div', { class: 'field' }, h('span', {}, 'Gesamtlänge'), h('b', {}, fmtLen(dem.total))),
          numField('Stücklänge', bb.pieceLength ?? 240, (v) => setRoom((b) => (b.pieceLength = v)), { unit: 'cm', min: 50, max: 600, length: true }),
        ),
        h('p', { class: 'hint', style: 'margin:4px 0 0' }, `Bedarf: ca. ${dem.pieces} Stück à ${fmtLen(bb.pieceLength ?? 240)} (inkl. 10 % Verschnitt).`),
      ),
      h('div', { class: 'btnrow' },
        h('button', { title: 'Jede Wand bekommt ein eigenes Stück, das du einzeln kürzen, verschieben oder teilen kannst', onclick: () => {
          const runsNow = roomRuns(store.project, store.project.rooms.find((x) => x.id === roomId)!);
          store.update((pp) => {
            for (const run of runsNow) pp.baseboards.push({ id: uid(), wallId: run.wall.id, side: run.side, start: Math.round(run.s0 * 10) / 10, length: Math.round((run.s1 - run.s0) * 10) / 10, ...styleOf(run.style) });
            const rr = pp.rooms.find((x) => x.id === roomId);
            if (rr?.baseboard) rr.baseboard.on = false;
          });
          ctx?.status(`${runsNow.length} Fußleisten-Stücke angelegt – im Plan anklicken (nah heranzoomen), um Länge und Position einzeln zu ändern.`);
        } }, 'In Einzelstücke umwandeln'),
      ),
    );
  } else {
    put(wrap, h('p', { class: 'hint' }, 'Tipp: Für Fußleisten nur an einzelnen Stellen eine Wand anklicken → „+ Fußleisten-Stück“. Dort gibst du Länge und Position frei ein.'));
  }
  if (pieces.length) {
    const total = pieces.reduce((s, x) => s + x.length, 0);
    put(wrap, h('p', { class: 'hint' }, `Dazu ${pieces.length} Einzelstück${pieces.length === 1 ? '' : 'e'} (${fmtLen(total)}) – im Plan oder über die Wand bearbeiten.`));
  }
  return wrap;
}

// ---------------------------------------------------------------- Technik-Tab

export function renderTechTab(el: HTMLElement, ctx: Ctx) {
  let cat = TECH_CATEGORIES[0];
  const chips = h('div', { class: 'chips' });
  const grid = h('div', { class: 'catalog' });
  const renderChips = () => {
    chips.innerHTML = '';
    for (const c of TECH_CATEGORIES) chips.append(h('button', { class: c === cat ? 'active' : '', onclick: () => { cat = c; renderChips(); renderGrid(); } }, c));
  };
  const renderGrid = () => {
    grid.innerHTML = '';
    for (const e of CATALOG.filter((x) => x.category === cat)) grid.append(techCard(e, ctx));
  };
  renderChips();
  renderGrid();

  const quick = h('div', { class: 'card' },
    h('h3', {}, 'Schnell ergänzen'),
    h('div', { class: 'list' },
      quickLi('Heizkörper unter alle Fenster', 'Typ 22, Breite ≈ 85 % des Fensters, Höhe nach Brüstung', () => addRadiators(ctx)),
      quickLi('Lichtschalter an alle Türen', '105 cm hoch, 15 cm neben der Tür auf der Griffseite', () => addSwitches(ctx)),
      quickLi('Rauchmelder in alle Räume', 'an die Decke, Raummitte', () => addSmoke(ctx)),
    ),
  );

  const heating = h('div', { class: 'card' });
  const bom = h('div', { class: 'card' });
  const renderDyn = () => {
    const p = store.project;
    heating.innerHTML = '';
    put(heating,
      h('h3', {}, 'Fußbodenheizung'),
      p.rooms.length
        ? h('div', { class: 'list' }, ...p.rooms.map((r) => checkbox(r.name, !!r.floorHeating, (v) => store.update((pp) => {
            const rr = pp.rooms.find((x) => x.id === r.id);
            if (rr) rr.floorHeating = v;
          }))))
        : h('p', { class: 'hint' }, 'Noch keine Räume.'),
    );
    bom.innerHTML = '';
    put(bom, h('h3', {}, 'Stückliste'), bomTable(p));
  };
  renderDyn();
  let key = '';
  store.on(() => {
    const p = store.project;
    const k = JSON.stringify([p.items.filter((i) => isTech(i.type)).map((i) => [i.name, i.params]), p.rooms.map((r) => [r.name, r.floorHeating, r.baseboard]), p.baseboards.length, p.walls.length]);
    if (k !== key) {
      key = k;
      renderDyn();
    }
  });

  el.append(
    h('div', { class: 'card' },
      h('h3', {}, 'Haustechnik setzen'),
      h('p', { class: 'hint' }, 'Element wählen, dann im Plan auf die Wand tippen bzw. klicken – mehrfach möglich. Die Höhe ist nach DIN 18015-3 voreingestellt (Dosenmitte über Fußboden) und rechts änderbar.'),
    ),
    chips,
    grid,
    quick,
    heating,
    h('div', { class: 'card' }, h('h3', {}, 'Legende'), legend(), h('p', { class: 'hint' }, 'Im Plan oben „Technik: Elektroplan“ wählen: Möbel werden blass, Montagehöhen stehen an den Symbolen.')),
    bom,
  );
}

function techCard(e: CatalogEntry, ctx: Ctx) {
  const img = h('img', { alt: '' }) as HTMLImageElement;
  thumbnail(e, (u) => (img.src = u));
  const height = e.ceiling ? 'Decke' : e.type === 'radiator' ? `ab ${e.mount ?? 0} cm` : `${Math.round((e.mount ?? 0) + e.h / 2)} cm`;
  const card = h('div', { class: 'cat-card', draggable: 'true', title: `${e.name} – ${e.desc}\nAntippen, dann im Plan auf eine Wand tippen` },
    h('div', { class: 'img' }, img),
    h('div', { class: 'txt' }, h('div', { class: 'nm' }, e.name), h('div', { class: 'dm' }, `${fmt(e.w)} × ${fmt(e.h)} cm · ${height}`)),
  );
  card.addEventListener('click', () => {
    ctx.show2D?.();
    ctx.plan.startPlacing(e);
    ctx.afterInsert?.();
  });
  card.addEventListener('dragstart', (ev) => {
    ev.dataTransfer?.setData('text/catalog', e.id);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  });
  return card;
}

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

function quickLi(title: string, desc: string, onclick: () => void) {
  return h('div', { class: 'li', onclick }, h('div', {}, h('div', { style: 'font-weight:600' }, title), h('div', { class: 'muted', style: 'font-size:11.5px' }, desc)));
}

function legend(): HTMLElement {
  return h('div', { class: 'legend-grid' },
    ...LEGEND.map((l) => {
      const c = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      c.width = 34 * dpr;
      c.height = 30 * dpr;
      c.style.width = '34px';
      c.style.height = '30px';
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 34, 30);
      g.strokeStyle = '#3b4148';
      g.lineWidth = 3;
      if (!l.it.ceiling) {
        g.beginPath();
        g.moveTo(3, 3);
        g.lineTo(31, 3);
        g.stroke();
        g.translate(17, 4.5);
      } else g.translate(17, 15);
      drawSymbol(g, l.it, 1);
      return h('div', { class: 'lg' }, c, l.name);
    }),
  );
}

// ---------------------------------------------------------------- Stückliste

export function bomTable(p: Project): HTMLElement {
  const groups = new Map<string, Map<string, number>>();
  let sockets = 0;
  for (const it of p.items) {
    if (!isTech(it.type)) continue;
    const g = trade(it.type, it.params);
    const m = groups.get(g) ?? new Map<string, number>();
    m.set(it.name, (m.get(it.name) ?? 0) + 1);
    groups.set(g, m);
    if (it.type === 'socket') sockets += it.params.n ?? 1;
  }
  const runs = allRuns(p);
  const rows: HTMLElement[] = [];
  for (const g of ['Elektro', 'Wasser', 'Heizung']) {
    const m = groups.get(g);
    if (!m) continue;
    rows.push(h('tr', { class: 'grp' }, h('td', { colspan: '2' }, g)));
    for (const [name, n] of [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))) rows.push(h('tr', {}, h('td', {}, name), h('td', { class: 'n' }, `${n} Stk.`)));
    if (g === 'Elektro' && sockets) rows.push(h('tr', {}, h('td', { class: 'muted' }, 'Steckplätze gesamt'), h('td', { class: 'n' }, String(sockets))));
  }
  const fbh = p.rooms.filter((r) => r.floorHeating);
  if (fbh.length) rows.push(h('tr', {}, h('td', {}, 'Räume mit Fußbodenheizung'), h('td', { class: 'n' }, String(fbh.length))));
  if (runs.length) {
    const d = demand(runs, 240);
    rows.push(h('tr', { class: 'grp' }, h('td', { colspan: '2' }, 'Fußleisten')));
    rows.push(h('tr', {}, h('td', {}, 'Gesamtlänge'), h('td', { class: 'n' }, fmtLen(d.total))));
    rows.push(h('tr', {}, h('td', {}, 'Stücke à 2,40 m (+10 %)'), h('td', { class: 'n' }, String(d.pieces))));
  }
  if (!rows.length) return h('p', { class: 'hint' }, 'Noch keine Haustechnik gesetzt.');
  return h('table', { class: 'bom' }, h('tbody', {}, ...rows));
}

// ---------------------------------------------------------------- Schnellaktionen

function addRadiators(ctx: Ctx) {
  const p = store.project;
  const add: Item[] = [];
  let skipped = 0;
  for (const o of p.openings) {
    if (o.type !== 'window') continue;
    const has = p.items.some((it) => {
      if (it.type !== 'radiator') return false;
      const a = wallAttachment(p, it);
      return !!a && a.wall.id === o.wallId && Math.abs(a.s - o.offset) < o.width / 2 + 10;
    });
    if (has) continue;
    const r = radiatorUnderWindow(p, o);
    if (r) add.push(r);
    else skipped++;
  }
  if (add.length) store.update((pp) => pp.items.push(...add));
  ctx.status(add.length ? `${add.length} Heizkörper unter Fenster gesetzt${skipped ? ` (${skipped} Fenster zu niedrig)` : ''}.` : 'Alle Fenster haben schon einen Heizkörper (oder sind zu niedrig).');
}

function addSwitches(ctx: Ctx) {
  const p = store.project;
  const add: Item[] = [];
  for (const o of p.openings) {
    if (o.type === 'window') continue;
    const has = p.items.some((it) => {
      if (it.type !== 'switch') return false;
      const a = wallAttachment(p, it);
      return !!a && a.wall.id === o.wallId && Math.abs(a.s - o.offset) < o.width / 2 + 45;
    });
    if (has) continue;
    const sw = switchNextToDoor(p, o);
    if (sw) add.push(sw);
  }
  if (add.length) store.update((pp) => pp.items.push(...add));
  ctx.status(add.length ? `${add.length} Lichtschalter neben Türen gesetzt (105 cm, Griffseite).` : 'Alle Türen haben schon einen Schalter.');
}

function addSmoke(ctx: Ctx) {
  const p = store.project;
  const e = CATALOG.find((c) => c.id === 'rauchmelder');
  if (!e) return;
  const add: Item[] = [];
  for (const r of p.rooms) {
    if (p.items.some((it) => it.type === 'smoke' && pointInPolygon({ x: it.x, y: it.y }, r.points))) continue;
    const c = polygonCentroid(r.points);
    // nicht auf einen vorhandenen Deckenauslass setzen
    if (p.items.some((it) => it.ceiling && Math.hypot(it.x - c.x, it.y - c.y) < 40)) c.x += 60;
    add.push(newItemFromEntry(e, Math.round(c.x), Math.round(c.y), p));
  }
  if (add.length) store.update((pp) => pp.items.push(...add));
  ctx.status(add.length ? `${add.length} Rauchmelder gesetzt. Pflicht sind sie in Schlafräumen, Kinderzimmern und Fluren.` : 'Alle Räume haben schon einen Rauchmelder.');
}

// ---------------------------------------------------------------- Fußleisten an einer Wand

/** Neues Einzelstück an einer Wandseite (ganze Wandlänge, Stil vom Raum). */
export function addPiece(wallId: string, side: 1 | -1, roomStyle?: BaseboardStyle): string | null {
  const p = store.project;
  const w = p.walls.find((x) => x.id === wallId);
  if (!w) return null;
  const face = faceRange(p, w, side);
  const id = uid();
  const style = roomStyle ? styleOf(roomStyle) : styleOf(defaultRoomBaseboard());
  store.update((pp) => pp.baseboards.push({ id, wallId, side, start: Math.round(face.s0 * 10) / 10, length: Math.max(10, Math.round((face.s1 - face.s0) * 10) / 10), ...style }));
  store.select({ kind: 'baseboard', id });
  return id;
}

/** Teilt ein Stück in der Mitte in zwei Stücke (z.B. um eine Lücke einzufügen). */
export function splitPiece(id: string, gap = 0): boolean {
  const bp0 = store.baseboard(id);
  if (!bp0 || (bp0.length - gap) / 2 < 5) return false;
  store.update((pp) => {
    const bp = pp.baseboards.find((x) => x.id === id);
    if (!bp) return;
    const half = (bp.length - gap) / 2;
    pp.baseboards.push({ ...bp, id: uid(), start: bp.start + half + gap, length: half });
    bp.length = half;
  });
  return true;
}

/** Länge, die an einer Wandseite für Fußleisten zur Verfügung steht. */
export function faceLength(wallId: string, side: 1 | -1): number {
  const p = store.project;
  const w = p.walls.find((x) => x.id === wallId);
  if (!w) return 0;
  const f = faceRange(p, w, side);
  return f.s1 - f.s0;
}

