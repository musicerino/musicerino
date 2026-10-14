// Linke Seitenleiste: Raum, Möbel, Oberflächen, Licht & Sonne.
import { store, chainWalls, innerArea, demoProject, emptyProject } from './store';
import { h, put, numField, textField, selectField, openModal, closeModal } from './dom';
import { CATALOG, CATEGORIES, TECH_CATEGORIES } from './catalog';
import { baseboardEditor } from './techui';
import { defaultRoomBaseboard } from './baseboards';
import type { CatalogEntry, P, SurfaceMat } from './types';
import { thumbnail } from './thumbs';
import { FLOOR_MATERIALS, WALL_MATERIALS, presetPreview, findPreset, type MatPreset } from './textures';
import { uid, bounds, polygonArea, fmtArea, fmtLen } from './geometry';
import { sunTimes, siteSun, fmtTime, compassName, timeZones } from './sun';
import type { Plan2D } from './plan2d';
import type { View3D } from './view3d';
import { ui, requestRedraw } from './shared';
import { openCustomFurniture } from './custom';

export interface Ctx {
  plan: Plan2D;
  view: View3D;
  status: (s: string) => void;
  afterInsert?: () => void;
  /** 2D-Plan sichtbar machen (z.B. wenn nur 3D angezeigt wird) */
  show2D?: () => void;
}

export function allEntries(): CatalogEntry[] {
  return [...store.project.customCatalog, ...CATALOG];
}
export function findEntry(id: string) {
  return allEntries().find((e) => e.id === id);
}

// ====================================================================== Raum

export function renderRoomTab(el: HTMLElement, ctx: Ctx) {
  const f = { name: 'Wohnzimmer', w: 450, l: 380, h: store.project.defaults.wallHeight, t: store.project.defaults.wallThickness, shape: 'rect', cw: 150, cl: 150 };
  const form = h('div', { class: 'card' });
  const draw = () => {
    form.innerHTML = '';
    put(form,
      h('h3', {}, 'Raum aus Maßen'),
      h('p', { class: 'hint' }, 'Gib die Innenmaße (lichte Maße) ein – Wände werden automatisch drumherum gesetzt.'),
      textField('Name', f.name, (v) => (f.name = v)),
      h('div', { style: 'height:6px' }),
      selectField('Form', f.shape, [
        { value: 'rect', label: 'Rechteck' },
        { value: 'L', label: 'L-Form' },
      ], (v) => {
        f.shape = v;
        draw();
      }),
      h('div', { style: 'height:6px' }),
      h('div', { class: 'grid2' },
        numField('Breite innen', f.w, (v) => (f.w = v), { unit: 'cm', min: 50, length: true }),
        numField('Länge innen', f.l, (v) => (f.l = v), { unit: 'cm', min: 50, length: true }),
      ),
      f.shape === 'L'
        ? h('div', { class: 'grid2' },
            numField('Ausschnitt Breite', f.cw, (v) => (f.cw = v), { unit: 'cm', min: 20, length: true }),
            numField('Ausschnitt Länge', f.cl, (v) => (f.cl = v), { unit: 'cm', min: 20, length: true }),
          )
        : null,
      h('div', { class: 'grid2' },
        numField('Raumhöhe', f.h, (v) => (f.h = v), { unit: 'cm', min: 150, max: 800, length: true }),
        numField('Wandstärke', f.t, (v) => (f.t = v), { unit: 'cm', min: 5, max: 80, length: true }),
      ),
      h('div', { class: 'btnrow fill' }, h('button', { class: 'primary', onclick: create }, 'Raum erstellen')),
    );
  };
  const create = () => {
    const p = store.project;
    const t = f.t;
    const existing = p.walls.flatMap((w) => [w.a, w.b]);
    // Wandachsen-Polygon mit linker oberer Ecke bei (0,0)
    const W = f.w + t;
    const L = f.l + t;
    let roomPts: P[];
    if (f.shape === 'L') {
      const cw = Math.min(f.cw, f.w - 30);
      const cl = Math.min(f.cl, f.l - 30);
      roomPts = [
        { x: 0, y: 0 },
        { x: W - cw, y: 0 },
        { x: W - cw, y: cl },
        { x: W, y: cl },
        { x: W, y: L },
        { x: 0, y: L },
      ];
    } else {
      roomPts = [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: L },
        { x: 0, y: L },
      ];
    }
    // Neuer Raum: ohne Bestand innen ab (0,0), sonst rechts an den Bestand angrenzend
    let ox = -t / 2;
    let oy = -t / 2;
    if (existing.length) {
      const b = bounds(existing);
      ox = b.maxX;
      oy = b.minY;
    }
    roomPts = roomPts.map((q) => ({ x: q.x + ox, y: q.y + oy }));
    const walls = chainWalls(roomPts, true, t, f.h);
    const id = uid();
    store.update((pp) => {
      const fresh = walls.filter((w) => !pp.walls.some((o) => (near(o.a, w.a) && near(o.b, w.b)) || (near(o.a, w.b) && near(o.b, w.a))));
      pp.walls.push(...fresh);
      pp.rooms.push({ id, name: f.name || 'Raum', points: roomPts, floor: { kind: 'eiche', color: '#ffffff' }, baseboard: defaultRoomBaseboard() });
      pp.defaults.wallHeight = f.h;
      pp.defaults.wallThickness = f.t;
    });
    store.select({ kind: 'room', id });
    ctx.plan.fit();
    ctx.view.fitView();
    ctx.status(`Raum „${f.name}“ erstellt: ${fmtLen(f.w)} × ${fmtLen(f.l)} innen.`);
  };
  draw();

  const tools = h('div', { class: 'card' },
    h('h3', {}, 'Selbst zeichnen'),
    h('div', { class: 'list' },
      toolLi('wall', 'Wände ziehen', 'Punkt für Punkt klicken; Längen eintippen + Enter. Startpunkt anklicken schließt den Raum.', ctx),
      toolLi('room', 'Rechteckraum aufziehen', 'Mit der Maus ein Rechteck ziehen.', ctx),
      toolLi('window', 'Fenster setzen', 'Auf eine Wand klicken.', ctx),
      toolLi('door', 'Tür setzen', 'Auf eine Wand klicken.', ctx),
      toolLi('french', 'Balkon-/Terrassentür', 'Auf eine Wand klicken.', ctx),
      toolLi('measure', 'Messen', 'Strecke im Plan ausmessen.', ctx),
    ),
  );

  const defaults = h('div', { class: 'card' });
  const roomsCard = h('div', { class: 'card' });
  const renderDyn = () => {
    const p = store.project;
    defaults.innerHTML = '';
    defaults.append(
      h('h3', {}, 'Standardwerte für neue Wände'),
      h('div', { class: 'grid2' },
        numField('Wandhöhe', p.defaults.wallHeight, (v) => store.update((pp) => (pp.defaults.wallHeight = v)), { unit: 'cm', min: 50, length: true }),
        numField('Wandstärke', p.defaults.wallThickness, (v) => store.update((pp) => (pp.defaults.wallThickness = v)), { unit: 'cm', min: 2, length: true }),
      ),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => store.update((pp) => pp.walls.forEach((w) => (w.height = pp.defaults.wallHeight))) }, 'Höhe auf alle Wände'),
      ),
    );
    roomsCard.innerHTML = '';
    const total = p.rooms.reduce((s, r) => s + Math.abs(polygonArea(innerArea(r, p))), 0);
    roomsCard.append(
      h('h3', {}, `Räume (${p.rooms.length}) · ${fmtArea(total)}`),
      p.rooms.length
        ? h('div', { class: 'list' }, ...p.rooms.map((r) => {
            const sel = store.selection?.kind === 'room' && store.selection.id === r.id;
            return h('div', { class: 'li' + (sel ? ' sel' : ''), onclick: () => store.select({ kind: 'room', id: r.id }) }, h('span', {}, r.name), h('span', { class: 'muted' }, fmtArea(Math.abs(polygonArea(innerArea(r, p))))));
          }))
        : h('p', { class: 'hint' }, 'Noch keine Räume. Lege oben einen Raum aus Maßen an oder zeichne Wände.'),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => confirmReset(ctx, false) }, 'Leeres Projekt'),
        h('button', { onclick: () => confirmReset(ctx, true) }, 'Beispiel laden'),
      ),
    );
  };
  renderDyn();
  store.on(renderDynThrottled(renderDyn, defaults));
  store.onSelect(renderDyn);
  el.append(form, tools, defaults, roomsCard);
}

function renderDynThrottled(fn: () => void, host: HTMLElement) {
  let t = 0;
  return () => {
    cancelAnimationFrame(t);
    t = requestAnimationFrame(() => {
      if (host.contains(document.activeElement)) return;
      fn();
    });
  };
}

const near = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y) < 1;

function toolLi(tool: string, title: string, desc: string, ctx: Ctx) {
  return h('div', { class: 'li', onclick: () => ctx.plan.setTool(tool as never) }, h('div', {}, h('div', { style: 'font-weight:600' }, title), h('div', { class: 'muted', style: 'font-size:11.5px' }, desc)));
}

function confirmReset(ctx: Ctx, demo: boolean) {
  openModal(
    h('div', {},
      h('h2', {}, demo ? 'Beispielprojekt laden?' : 'Neues, leeres Projekt?'),
      h('p', {}, 'Das aktuelle Projekt wird ersetzt. Speichere es vorher über „Speichern“, wenn du es behalten möchtest. (Rückgängig ist möglich.)'),
      h('div', { class: 'btnrow' },
        h('button', { onclick: closeModal }, 'Abbrechen'),
        h('button', { class: 'primary', onclick: () => {
          const keep = store.project.customCatalog;
          const site = store.project.site;
          const p = demo ? demoProject() : emptyProject();
          p.customCatalog = keep;
          p.site = { ...p.site, lat: site.lat, lon: site.lon, tz: site.tz };
          store.load(p);
          closeModal();
          ctx.plan.fit();
          ctx.view.fitView();
          if (!demo) ctx.plan.setTool('room');
        } }, demo ? 'Beispiel laden' : 'Neu beginnen'),
      ),
    ),
  );
}

// ====================================================================== Möbel

export function renderFurnitureTab(el: HTMLElement, ctx: Ctx) {
  let cat = 'Alle';
  let q = '';
  const search = h('input', { type: 'text', placeholder: 'Suchen … (z.B. BILLY, Sofa, 160)' }) as HTMLInputElement;
  search.addEventListener('input', () => {
    q = search.value.trim().toLowerCase();
    renderGrid();
  });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  const chips = h('div', { class: 'chips' });
  const grid = h('div', { class: 'catalog' });
  const renderChips = () => {
    chips.innerHTML = '';
    const cats = ['Alle', ...(store.project.customCatalog.length ? ['Meine Möbel'] : []), ...CATEGORIES];
    for (const c of cats) chips.append(h('button', { class: c === cat ? 'active' : '', onclick: () => { cat = c; renderChips(); renderGrid(); } }, c));
  };
  const renderGrid = () => {
    grid.innerHTML = '';
    const list = allEntries().filter((e) => {
      if (!e.custom && TECH_CATEGORIES.includes(e.category)) return false; // eigener Tab „Technik“
      const ec = e.custom ? 'Meine Möbel' : e.category;
      if (cat !== 'Alle' && ec !== cat) return false;
      if (!q) return true;
      return `${e.name} ${e.desc} ${e.category} ${e.w}x${e.d}x${e.h}`.toLowerCase().includes(q);
    });
    for (const e of list) {
      const img = h('img', { alt: '' }) as HTMLImageElement;
      thumbnail(e, (u) => (img.src = u));
      const card = h('div', { class: 'cat-card', draggable: 'true', title: `${e.name} – ${e.desc}\nKlicken: in den Plan einfügen · Ziehen: an Position ablegen` },
        h('div', { class: 'img' }, img),
        h('div', { class: 'txt' }, h('div', { class: 'nm' }, e.name), h('div', { class: 'dm' }, `${fmt(e.w)} × ${fmt(e.d)} × ${fmt(e.h)} cm`)),
      );
      card.addEventListener('click', () => {
        ctx.plan.placeEntry(e, smartSpot(ctx));
        ctx.afterInsert?.();
        ctx.status(`${e.name} eingefügt – im Plan oder in 3D verschieben, mit R drehen.`);
      });
      card.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData('text/catalog', e.id);
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
      });
      if (e.custom) {
        card.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          if (confirm(`„${e.name}“ aus „Meine Möbel“ entfernen?`)) store.update((p) => (p.customCatalog = p.customCatalog.filter((c) => c.id !== e.id)));
        });
      }
      grid.append(card);
    }
    if (!list.length) grid.append(h('p', { class: 'hint' }, 'Nichts gefunden.'));
  };
  renderChips();
  renderGrid();
  let lastCount = store.project.customCatalog.length;
  store.on(() => {
    if (store.project.customCatalog.length !== lastCount) {
      lastCount = store.project.customCatalog.length;
      renderChips();
      renderGrid();
    }
  });
  el.append(
    h('div', { class: 'card' },
      h('h3', {}, 'Eigenes Möbelstück'),
      h('p', { class: 'hint' }, 'Maße eingeben, Typ wählen – das 3D-Modell wird automatisch erzeugt.'),
      h('div', { class: 'btnrow fill' }, h('button', { class: 'primary', onclick: () => openCustomFurniture(ctx) }, '+ Möbel nach Maß')),
    ),
    search,
    chips,
    grid,
    h('p', { class: 'hint' }, 'Maße nach IKEA-Produktangaben (B × T × H). Die 3D-Modelle sind vereinfachte Nachbildungen; alle Maße und Farben lassen sich rechts anpassen.'),
  );
}

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Einfügeposition: Mitte der 2D-Ansicht, falls diese in einem Raum liegt, sonst Mitte des ersten Raums. */
function smartSpot(ctx: Ctx): P {
  const c = ctx.plan.viewCenter;
  const p = store.project;
  if (!p.rooms.length) return c;
  const sel = store.selection;
  const room = sel?.kind === 'room' ? store.room(sel.id) : undefined;
  const r = room ?? p.rooms[0];
  const b = bounds(r.points);
  if (!room && c.x > b.minX && c.x < b.maxX && c.y > b.minY && c.y < b.maxY) return c;
  return { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) };
}

// ====================================================================== Oberflächen

export const PAINT_COLORS = ['#ffffff', '#f4f1ec', '#ece4d8', '#e3d5c3', '#d9d4cc', '#c9cfcf', '#b7c4bf', '#9fb2a7', '#8e9f8b', '#c8d3de', '#93a7bd', '#3f5568', '#2f3437', '#d7b9a8', '#c47e65', '#e8cf8f'];
export const TINT_COLORS = ['#ffffff', '#f2ece2', '#e5dccb', '#d0c4b0', '#bfb6a8', '#9e9a92', '#77736c', '#5a4a3c'];

export function materialPicker(list: MatPreset[], current: SurfaceMat, onChange: (m: SurfaceMat) => void, colors = PAINT_COLORS): HTMLElement {
  const wrap = h('div', {});
  const sw = h('div', { class: 'swatches' });
  for (const m of list) {
    const tint = m.id === current.kind ? current.color : m.color;
    sw.append(h('button', { class: 'swatch' + (m.id === current.kind ? ' active' : ''), title: m.label, onclick: () => onChange({ kind: m.id, color: m.id === current.kind ? current.color : m.color }) },
      h('img', { src: presetPreview(m.id, tint), alt: '' }), h('span', {}, m.label)));
  }
  const pal = findPreset(current.kind).id === 'farbe' || findPreset(current.kind).id === 'kalkputz' ? colors : [...TINT_COLORS, ...colors.slice(8)];
  const input = h('input', { type: 'color', value: current.color }) as HTMLInputElement;
  input.addEventListener('change', () => onChange({ ...current, color: input.value }));
  wrap.append(
    sw,
    h('div', { class: 'field', style: 'margin-top:8px' }, h('span', {}, 'Farbe / Tönung'),
      h('div', { class: 'colors' }, input, ...pal.map((c) => h('button', { class: 'c', style: `background:${c}`, title: c, onclick: () => onChange({ ...current, color: c }) })))),
  );
  return wrap;
}

export function renderMaterialTab(el: HTMLElement) {
  let roomId = '';
  const render = () => {
    const p = store.project;
    el.innerHTML = '';
    el.append(
      h('div', { class: 'card' },
        h('h3', {}, 'Wände (alle)'),
        h('p', { class: 'hint' }, 'Gilt für alle Wände ohne eigenes Material. Einzelne Wände: Wand anklicken → rechts „Eigenes Material“.'),
        materialPicker(WALL_MATERIALS, p.wallMat, (m) => store.update((pp) => (pp.wallMat = m))),
        h('div', { class: 'btnrow' }, h('button', { onclick: () => store.update((pp) => pp.walls.forEach((w) => (w.material = null))) }, 'Eigene Wandmaterialien zurücksetzen')),
      ),
    );
    if (p.rooms.length) {
      if (!p.rooms.some((r) => r.id === roomId)) roomId = p.rooms[0].id;
      const sel = store.selection;
      if (sel?.kind === 'room') roomId = sel.id;
      const room = p.rooms.find((r) => r.id === roomId)!;
      el.append(
        h('div', { class: 'card' },
          h('h3', {}, 'Boden'),
          selectField('Raum', roomId, p.rooms.map((r) => ({ value: r.id, label: r.name })), (v) => {
            roomId = v;
            render();
          }),
          h('div', { style: 'height:8px' }),
          materialPicker(FLOOR_MATERIALS, room.floor, (m) => store.update((pp) => (pp.rooms.find((r) => r.id === roomId)!.floor = m)), TINT_COLORS),
          h('div', { class: 'btnrow' }, h('button', { onclick: () => store.update((pp) => pp.rooms.forEach((r) => (r.floor = { ...room.floor }))) }, 'Für alle Räume übernehmen')),
        ),
        h('div', { class: 'card' },
          h('h3', {}, `Fußleisten · ${room.name}`),
          baseboardEditor(roomId),
          room.baseboard?.on
            ? h('div', { class: 'btnrow' }, h('button', { onclick: () => store.update((pp) => pp.rooms.forEach((r) => (r.baseboard = { ...(r.baseboard ?? defaultRoomBaseboard()), ...room.baseboard!, skip: r.id === room.id ? room.baseboard!.skip : r.baseboard?.skip ?? [] }))) }, 'Für alle Räume übernehmen'))
            : null,
        ),
      );
    } else el.append(h('p', { class: 'hint' }, 'Lege zuerst einen Raum an, um Böden zu gestalten.'));
    const ceil = h('input', { type: 'color', value: p.ceilingColor }) as HTMLInputElement;
    ceil.addEventListener('change', () => store.update((pp) => (pp.ceilingColor = ceil.value)));
    el.append(h('div', { class: 'card' }, h('h3', {}, 'Decke'), h('div', { class: 'row' }, h('label', {}, 'Farbe'), ceil), h('p', { class: 'hint' }, 'Sichtbar im Rundgang-Modus (3D → „Rundgang“).')));
  };
  render();
  let key = '';
  const refresh = () => {
    const p = store.project;
    const k = JSON.stringify([
      p.wallMat,
      p.rooms.map((r) => [r.id, r.name, r.floor, r.baseboard, r.points]),
      p.walls.map((w) => [w.a, w.b, w.thickness]),
      p.openings.map((o) => [o.offset, o.width, o.sill]),
      p.baseboards.length,
      p.ceilingColor,
      store.selection?.kind === 'room' ? store.selection.id : '',
    ]);
    if (k !== key) {
      key = k;
      render();
    }
  };
  store.on(refresh);
  store.onSelect(refresh);
}

// ====================================================================== Sonne

const CITIES: [string, number, number, string][] = [
  ['Berlin', 52.52, 13.405, 'Europe/Berlin'],
  ['Hamburg', 53.551, 9.994, 'Europe/Berlin'],
  ['München', 48.137, 11.575, 'Europe/Berlin'],
  ['Köln', 50.938, 6.96, 'Europe/Berlin'],
  ['Frankfurt', 50.11, 8.682, 'Europe/Berlin'],
  ['Stuttgart', 48.776, 9.183, 'Europe/Berlin'],
  ['Leipzig', 51.34, 12.375, 'Europe/Berlin'],
  ['Wien', 48.208, 16.373, 'Europe/Vienna'],
  ['Zürich', 47.377, 8.541, 'Europe/Zurich'],
];

export function renderSunTab(el: HTMLElement, ctx: Ctx) {
  const info = h('div', { class: 'card' });
  const heatCard = h('div', { class: 'card' });
  const loc = h('div', { class: 'card' });
  const renderLoc = () => {
    const s = store.project.site;
    const coord = h('input', { type: 'text', value: `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`, placeholder: 'z.B. 52.5200, 13.4050' }) as HTMLInputElement;
    coord.addEventListener('keydown', (e) => e.stopPropagation());
    coord.addEventListener('change', () => {
      const parsed = parseCoords(coord.value);
      if (!parsed) {
        ctx.status('Koordinaten nicht erkannt. Format z.B. „52.5200, 13.4050“ oder „52°31′N 13°24′O“.');
        return;
      }
      store.update((p) => {
        p.site.lat = parsed[0];
        p.site.lon = parsed[1];
      });
    });
    const tzs = timeZones();
    loc.innerHTML = '';
    loc.append(
      h('h3', {}, 'Standort des Hauses'),
      h('label', { class: 'field' }, h('span', {}, 'Koordinaten (Breite, Länge) – z.B. aus Google Maps kopieren'), coord),
      h('div', { class: 'chips' }, ...CITIES.map(([n, la, lo, tz]) => h('button', { onclick: () => store.update((p) => Object.assign(p.site, { lat: la, lon: lo, tz })) }, n)),
        h('button', { title: 'Standort des Geräts verwenden', onclick: () => navigator.geolocation?.getCurrentPosition(
          (pos) => store.update((p) => Object.assign(p.site, { lat: pos.coords.latitude, lon: pos.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })),
          () => ctx.status('Standort konnte nicht ermittelt werden.'),
        ) }, '📍 Mein Standort')),
      selectField('Zeitzone', s.tz, tzs.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })), (v) => store.update((p) => (p.site.tz = v))),
      h('h4', {}, 'Ausrichtung'),
      h('p', { class: 'hint' }, 'In welche Richtung zeigt Norden im Grundriss? 0° = nach oben, 90° = nach rechts. Du kannst auch die Kompassnadel oben rechts im 2D-Plan drehen.'),
      northControl(s.north),
    );
  };
  const renderInfo = () => {
    const s = store.project.site;
    const t = sunTimes(s);
    const now = siteSun(s);
    const len = t.rise !== null && t.set !== null ? t.set - t.rise : t.maxAlt > 0 ? 1440 : 0;
    info.innerHTML = '';
    info.append(
      h('h3', {}, 'Sonnenstand'),
      h('div', { class: 'grid2' },
        stat('Aufgang', fmtTime(t.rise)),
        stat('Untergang', fmtTime(t.set)),
        stat('Tageslänge', `${Math.floor(len / 60)} h ${Math.round(len % 60)} min`),
        stat('Höchststand', `${t.maxAlt.toFixed(1).replace('.', ',')}° um ${fmtTime(t.noon)}`),
        stat('Jetzt: Höhe', `${now.altitude.toFixed(1).replace('.', ',')}°`),
        stat('Jetzt: Richtung', `${Math.round(now.bearing)}° (${compassName(now.bearing)})`),
      ),
      h('div', { class: 'chips' },
        ...[
          ['21. März', '03-21'],
          ['21. Juni', '06-21'],
          ['23. Sept.', '09-23'],
          ['21. Dez.', '12-21'],
        ].map(([l, md]) => h('button', { onclick: () => store.update((p) => (p.site.date = `${p.site.date.slice(0, 4)}-${md}`)) }, l)),
      ),
      h('p', { class: 'hint' }, 'Datum und Uhrzeit stellst du unter der 3D-Ansicht ein. ▶ spielt den Tagesverlauf ab; die Schatten fallen durch die Fenster in den Raum.'),
    );
  };
  const renderHeat = (progress?: number) => {
    heatCard.innerHTML = '';
    const bar = h('div', { class: 'progress' }, h('div', { style: `width:${Math.round((progress ?? 0) * 100)}%` }));
    put(heatCard,
      h('h3', {}, 'Sonnenstunden-Karte'),
      h('p', { class: 'hint' }, 'Berechnet für jeden Punkt am Boden, wie lange am gewählten Tag direktes Sonnenlicht durch die Fenster fällt – inklusive Abschattung durch Wände und Möbel.'),
      h('div', { class: 'btnrow fill' },
        h('button', { class: 'primary', disabled: progress !== undefined, onclick: async () => {
          ctx.plan.draw();
          renderHeat(0);
          const res = await ctx.view.computeSunHours(20, 15, (f) => {
            const d = heatCard.querySelector('.progress > div') as HTMLElement | null;
            if (d) d.style.width = Math.round(f * 100) + '%';
          });
          ui.heat = { ...res, label: store.project.site.date };
          ctx.view.showHeatmap(ui.heat);
          requestRedraw();
          renderHeat();
          const max = Math.max(0, ...res.cells.map((c) => c.hours));
          ctx.status(res.cells.length ? `Sonnenstunden berechnet (${store.project.site.date}): bis zu ${max.toFixed(1).replace('.', ',')} h direkte Sonne.` : 'Keine Räume vorhanden – bitte zuerst einen Raum anlegen.');
        } }, progress !== undefined ? 'Berechne …' : 'Für diesen Tag berechnen'),
        ui.heat ? h('button', { onclick: () => { ui.heat = null; ctx.view.showHeatmap(null); requestRedraw(); renderHeat(); } }, 'Ausblenden') : null,
      ),
      progress !== undefined ? bar : null,
      ui.heat ? h('div', {}, h('div', { class: 'legend' }), h('div', { class: 'legend-labels' }, h('span', {}, '0 h'), h('span', {}, `${Math.max(0, ...ui.heat.cells.map((c) => c.hours)).toFixed(1).replace('.', ',')} h`)), h('p', { class: 'hint' }, `Stand: ${ui.heat.label}. Nach Änderungen neu berechnen.`)) : null,
    );
  };
  renderLoc();
  renderInfo();
  renderHeat();
  let k1 = '';
  store.on(() => {
    const s = store.project.site;
    const k = JSON.stringify([s.lat, s.lon, s.tz, s.north]);
    if (k !== k1 && !loc.contains(document.activeElement)) {
      k1 = k;
      renderLoc();
    }
    renderInfo();
  });
  el.append(loc, info, heatCard);
}

function northControl(north: number): HTMLElement {
  const range = h('input', { type: 'range', min: 0, max: 359, step: 1, value: String(Math.round(north)) }) as HTMLInputElement;
  range.addEventListener('input', () => store.mutate((p) => (p.site.north = parseFloat(range.value))));
  range.addEventListener('change', () => store.commit());
  const presets = [
    ['↑ N oben', 0],
    ['→ N rechts', 90],
    ['↓ N unten', 180],
    ['← N links', 270],
  ] as const;
  return h('div', {},
    h('div', { class: 'row' }, range, numField('', north, (v) => store.update((p) => (p.site.north = ((v % 360) + 360) % 360)), { unit: '°', digits: 0 })),
    h('div', { class: 'chips' }, ...presets.map(([l, v]) => h('button', { onclick: () => store.update((p) => (p.site.north = v)) }, l))),
  );
}

function stat(label: string, value: string) {
  return h('div', { class: 'field' }, h('span', {}, label), h('div', { style: 'font-weight:600' }, value));
}

/** Liest "52.52, 13.40", "52,52 13,40", "52°31'12\"N 13°24'E" usw. */
export function parseCoords(s: string): [number, number] | null {
  const t = s.trim();
  const dms = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′])?\s*(?:(\d+(?:[.,]\d+)?)\s*(?:["″]|''))?\s*([NSOEW])?/gi)];
  if (dms.length >= 2) {
    const conv = (m: RegExpMatchArray) => {
      const v = parseFloat(m[1].replace(',', '.')) + (m[2] ? parseFloat(m[2].replace(',', '.')) / 60 : 0) + (m[3] ? parseFloat(m[3].replace(',', '.')) / 3600 : 0);
      return /[SW]/i.test(m[4] ?? '') ? -v : v;
    };
    return [conv(dms[0]), conv(dms[1])];
  }
  const nums = t.match(/-?\d+(?:\.\d+)?/g);
  // "52,52 13,40" (deutsches Komma) → "52.52 13.40"
  const alt = t.match(/-?\d+,\d+/g);
  let vals: number[] | null = null;
  if (alt && alt.length === 2) vals = alt.map((v) => parseFloat(v.replace(',', '.')));
  else if (nums && nums.length >= 2) vals = nums.slice(0, 2).map(parseFloat);
  if (!vals) return null;
  const [lat, lon] = vals;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}
