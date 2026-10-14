// Rechte Leiste: Eigenschaften der Auswahl.
import { store, moveNode, innerArea } from './store';
import { h, numField, textField, selectField, colorField, checkbox } from './dom';
import { TYPE_INFO, FINISHES, COLORS } from './catalog';
import type { Item, Wall, Opening, Room, Finish, OpeningType, Project } from './types';
import { wallLength, wallDir, add, mul, fmtArea, fmtLen, polygonArea, uid, clamp } from './geometry';
import { stackedOn, rotateItemTo, moveItemTo, snapItemToWall, supportAt } from './ops';
import { materialPicker, TINT_COLORS, type Ctx } from './panels';
import { WALL_MATERIALS, FLOOR_MATERIALS } from './textures';
import { openCustomFurniture } from './custom';

const PALETTE = Object.values(COLORS).slice(0, 14);

export function initProps(el: HTMLElement, ctx: Ctx) {
  let pending = false;
  const render = () => {
    if (el.contains(document.activeElement) && document.activeElement !== document.body && (document.activeElement as HTMLElement).tagName !== 'BUTTON') {
      if (!pending) {
        pending = true;
        document.activeElement!.addEventListener('blur', () => {
          pending = false;
          setTimeout(render, 0);
        }, { once: true });
      }
      return;
    }
    el.innerHTML = '';
    const s = store.selection;
    if (!s) return el.append(...overview());
    if (s.kind === 'item') {
      const it = store.item(s.id);
      if (it) el.append(...itemProps(it, ctx));
    } else if (s.kind === 'wall') {
      const w = store.wall(s.id);
      if (w) el.append(...wallProps(w, ctx));
    } else if (s.kind === 'opening') {
      const o = store.opening(s.id);
      if (o) el.append(...openingProps(o));
    } else if (s.kind === 'room') {
      const r = store.room(s.id);
      if (r) el.append(...roomProps(r));
    }
  };
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  };
  store.on(schedule);
  store.onSelect(schedule);
  render();
}

function upd<T extends { id: string }>(pick: (p: Project) => T[], id: string, fn: (x: T, p: Project) => void) {
  store.update((p) => {
    const x = pick(p).find((i) => i.id === id);
    if (x) fn(x, p);
  });
}

function overview(): HTMLElement[] {
  const p = store.project;
  const area = p.rooms.reduce((s, r) => s + Math.abs(polygonArea(innerArea(r, p))), 0);
  return [
    h('h3', {}, 'Projekt'),
    h('div', { class: 'card' },
      h('div', { class: 'grid2' },
        stat('Räume', String(p.rooms.length)),
        stat('Wohnfläche', fmtArea(area)),
        stat('Wände', String(p.walls.length)),
        stat('Fenster/Türen', String(p.openings.length)),
        stat('Möbel', String(p.items.length)),
        stat('Standort', `${p.site.lat.toFixed(2)}°, ${p.site.lon.toFixed(2)}°`),
      ),
    ),
    h('p', { class: 'hint' }, 'Klicke im Plan oder in 3D auf ein Element, um es hier zu bearbeiten.'),
    h('h4', {}, 'So geht’s'),
    h('ol', { class: 'hint', style: 'padding-left:18px;margin:0' },
      h('li', {}, 'Links unter „Raum“ einen Raum aus Maßen anlegen oder Wände ziehen.'),
      h('li', {}, 'Fenster & Türen setzen (Werkzeugleiste über dem Plan), dann Maße hier anpassen.'),
      h('li', {}, 'Unter „Möbel“ Katalogteile anklicken oder in den Plan/3D ziehen.'),
      h('li', {}, 'Unter „Oberflächen“ Wand- und Bodenmaterial wählen.'),
      h('li', {}, 'Unter „Licht & Sonne“ Koordinaten & Nordrichtung eingeben, dann unten die Uhrzeit bewegen.'),
    ),
    h('h4', {}, 'Tastenkürzel'),
    h('div', { class: 'hint' },
      shortcut('Entf', 'Auswahl löschen'),
      shortcut('Strg+D', 'Duplizieren'),
      shortcut('R / Shift+R', 'Drehen 90° / 15°'),
      shortcut('Pfeiltasten', 'Verschieben 1 cm (Shift: 10 cm)'),
      shortcut('Strg+Z / Strg+Y', 'Rückgängig / Wiederholen'),
      shortcut('V W F T M', 'Auswahl · Wand · Fenster · Tür · Messen'),
      shortcut('Esc', 'Werkzeug beenden'),
    ),
  ];
}

function shortcut(k: string, d: string) {
  return h('div', { style: 'display:flex;justify-content:space-between;gap:8px;margin:2px 0' }, h('span', { class: 'kbd' }, k), h('span', {}, d));
}

function stat(label: string, value: string) {
  return h('div', { class: 'field' }, h('span', {}, label), h('div', { style: 'font-weight:600' }, value));
}

// ---------------------------------------------------------------- Möbel

function itemProps(it: Item, ctx: Ctx): HTMLElement[] {
  const info = TYPE_INFO[it.type];
  const set = (fn: (x: Item, p: Project) => void) => upd((p) => p.items, it.id, fn);
  const sup = supportAt(store.project, { x: it.x, y: it.y }, new Set([it.id, ...stackedOn(store.project, it).map((c) => c.id)]));
  const onTop = sup && Math.abs(sup.z + sup.h - it.z) < 1.5 ? sup : null;
  return [
    h('h3', {}, it.name),
    h('p', { class: 'hint', style: 'margin-top:-6px' }, info.label + (onTop ? ` · steht auf ${onTop.name}` : '')),
    textField('Bezeichnung', it.name, (v) => set((x) => (x.name = v))),
    h('h4', {}, 'Maße'),
    h('div', { class: 'grid3' },
      numField('Breite', it.w, (v) => set((x) => (x.w = v)), { unit: 'cm', min: 1, length: true }),
      numField('Tiefe', it.d, (v) => set((x) => (x.d = v)), { unit: 'cm', min: 0.5, length: true }),
      numField('Höhe', it.h, (v) => set((x, p) => {
        const kids = stackedOn(p, x);
        const dh = v - x.h;
        x.h = v;
        for (const k of kids) k.z += dh;
      }), { unit: 'cm', min: 0.5, length: true }),
    ),
    h('h4', {}, 'Position'),
    h('div', { class: 'grid3' },
      numField('x', it.x, (v) => set((x, p) => moveItemTo(p, x, v, x.y, stackedOn(p, x))), { unit: 'cm', length: true }),
      numField('y', it.y, (v) => set((x, p) => moveItemTo(p, x, x.x, v, stackedOn(p, x))), { unit: 'cm', length: true }),
      numField('über Boden', it.z, (v) => set((x, p) => {
        const kids = stackedOn(p, x);
        const dz = v - x.z;
        x.z = v;
        x.mount = v;
        for (const k of kids) k.z += dz;
      }), { unit: 'cm', min: 0, length: true }),
    ),
    h('div', { class: 'row' },
      numField('Drehung', it.rot, (v) => set((x, p) => rotateItemTo(x, v, stackedOn(p, x))), { unit: '°', digits: 0 }),
      h('div', { class: 'btnrow', style: 'margin-top:16px;flex-wrap:nowrap' },
        h('button', { class: 'icon', title: '90° links', onclick: () => set((x, p) => rotateItemTo(x, x.rot - 90, stackedOn(p, x))) }, '⟲'),
        h('button', { class: 'icon', title: '90° rechts', onclick: () => set((x, p) => rotateItemTo(x, x.rot + 90, stackedOn(p, x))) }, '⟳'),
      ),
    ),
    h('div', { class: 'btnrow' },
      h('button', { title: 'Rückseite an die nächste Wand', onclick: () => set((x, p) => {
        const kids = stackedOn(p, x);
        const ox = x.x, oy = x.y, or = x.rot;
        if (!snapItemToWall(p, x, 200)) return;
        const nx = x.x, ny = x.y, nr = x.rot;
        x.x = ox; x.y = oy; x.rot = or;
        rotateItemTo(x, nr, kids);
        moveItemTo(p, x, nx, ny, kids);
      }) }, 'An Wand stellen'),
      h('button', { onclick: () => set((x, p) => {
        const kids = stackedOn(p, x);
        const dz = -x.z;
        x.z = 0;
        x.mount = 0;
        for (const k of kids) k.z += dz;
      }) }, 'Auf den Boden'),
    ),
    info.params?.length
      ? h('div', {}, h('h4', {}, 'Aufbau'), h('div', { class: 'grid2' }, ...info.params.map((pp) => numField(pp.label, it.params[pp.key] ?? pp.def, (v) => set((x) => (x.params = { ...x.params, [pp.key]: Math.round(v) })), { min: pp.min, max: pp.max, digits: 0 }))))
      : null,
    h('h4', {}, 'Aussehen'),
    selectField('Oberfläche', it.finish, FINISHES.map((f) => ({ value: f.id, label: f.label })), (v) => set((x) => (x.finish = v as Finish))),
    h('div', { style: 'height:6px' }),
    colorField('Hauptfarbe', it.color, (v) => set((x) => (x.color = v)), PALETTE),
    h('div', { style: 'height:6px' }),
    colorField('Akzentfarbe', it.color2, (v) => set((x) => (x.color2 = v)), PALETTE),
    h('h4', {}, 'Aktionen'),
    h('div', { class: 'btnrow' },
      h('button', { onclick: () => duplicateItem(it.id) }, 'Duplizieren'),
      h('button', { onclick: () => openCustomFurniture(ctx, it) }, 'Bauform ändern …'),
      h('button', { onclick: () => set((x) => (x.locked = !x.locked)) }, it.locked ? '🔒 Entsperren' : 'Sperren'),
      h('button', { class: 'danger', onclick: () => ctx.plan.deleteSelection() }, 'Löschen'),
    ),
    h('p', { class: 'hint' }, 'Stapeln: Ein Möbel auf ein anderes ziehen (2D oder 3D) – es wird automatisch auf dessen Oberseite gestellt und bewegt sich danach mit.'),
  ].filter(Boolean) as HTMLElement[];
}

export function duplicateItem(id: string) {
  const it = store.item(id);
  if (!it) return;
  const copy: Item = { ...JSON.parse(JSON.stringify(it)), id: uid() };
  const off = rotOffset(it);
  copy.x += off.x;
  copy.y += off.y;
  if (!supportAt(store.project, { x: copy.x, y: copy.y }, new Set([id]))) copy.z = copy.mount ?? 0;
  store.update((p) => p.items.push(copy));
  store.select({ kind: 'item', id: copy.id });
}

function rotOffset(it: Item) {
  const a = (it.rot * Math.PI) / 180;
  return { x: Math.cos(a) * (it.w + 5), y: Math.sin(a) * (it.w + 5) };
}

// ---------------------------------------------------------------- Wand

function wallProps(w: Wall, ctx: Ctx): HTMLElement[] {
  const set = (fn: (x: Wall, p: Project) => void) => upd((p) => p.walls, w.id, fn);
  const L = wallLength(w);
  const ang = ((Math.atan2(-(w.b.y - w.a.y), w.b.x - w.a.x) * 180) / Math.PI + 360) % 360;
  const own = !!w.material;
  const mat = w.material ?? store.project.wallMat;
  return [
    h('h3', {}, 'Wand'),
    h('p', { class: 'hint', style: 'margin-top:-6px' }, `Länge ${fmtLen(L)} (Achsmaß) · Endpunkte im Plan ziehbar`),
    h('div', { class: 'grid2' },
      numField('Länge', L, (v) => set((x, p) => {
        const nb = add(x.a, mul(wallDir(x), v));
        moveNode(p, { ...x.b }, nb, 0.5);
      }), { unit: 'cm', min: 5, length: true }),
      numField('Winkel', ang, (v) => set((x, p) => {
        const r = (v * Math.PI) / 180;
        const nb = { x: x.a.x + Math.cos(r) * L, y: x.a.y - Math.sin(r) * L };
        moveNode(p, { ...x.b }, nb, 0.5);
      }), { unit: '°', digits: 1 }),
      numField('Stärke', w.thickness, (v) => set((x) => (x.thickness = v)), { unit: 'cm', min: 1, max: 100, length: true }),
      numField('Höhe', w.height, (v) => set((x) => (x.height = v)), { unit: 'cm', min: 10, max: 1000, length: true }),
    ),
    h('div', { class: 'btnrow' },
      h('button', { onclick: () => ctx.plan.splitWall(w.id) }, 'In der Mitte teilen'),
      h('button', { onclick: () => addOpening(w, 'window') }, '+ Fenster'),
      h('button', { onclick: () => addOpening(w, 'door') }, '+ Tür'),
      h('button', { class: 'danger', onclick: () => ctx.plan.deleteSelection() }, 'Löschen'),
    ),
    h('h4', {}, 'Oberfläche dieser Wand'),
    checkbox('Eigenes Material statt Standard', own, (v) => set((x, p) => (x.material = v ? { ...p.wallMat } : null))),
    own ? materialPicker(WALL_MATERIALS, mat, (m) => set((x) => (x.material = m))) : h('p', { class: 'hint' }, 'Verwendet das Standard-Wandmaterial (Tab „Oberflächen“).'),
  ];
}

function addOpening(w: Wall, type: OpeningType) {
  const L = wallLength(w);
  const def = type === 'window' ? { width: 100, height: 135, sill: 90 } : { width: 90, height: 205, sill: 0 };
  const width = Math.min(def.width, L - 10);
  const o: Opening = { id: uid(), wallId: w.id, type, offset: L / 2, ...def, width };
  store.update((p) => p.openings.push(o));
  store.select({ kind: 'opening', id: o.id });
}

// ---------------------------------------------------------------- Fenster / Tür

function openingProps(o: Opening): HTMLElement[] {
  const set = (fn: (x: Opening, p: Project) => void) => upd((p) => p.openings, o.id, fn);
  const w = store.wall(o.wallId);
  const L = w ? wallLength(w) : 0;
  const names: Record<OpeningType, string> = { window: 'Fenster', door: 'Tür', french: 'Balkon-/Terrassentür' };
  const left = o.offset - o.width / 2;
  const right = L - o.offset - o.width / 2;
  return [
    h('h3', {}, names[o.type]),
    selectField('Art', o.type, (Object.keys(names) as OpeningType[]).map((k) => ({ value: k, label: names[k] })), (v) => set((x) => {
      x.type = v as OpeningType;
      if (v !== 'window') x.sill = 0;
      if (v === 'window' && x.sill === 0) x.sill = 90;
    })),
    h('h4', {}, 'Maße'),
    h('div', { class: 'grid2' },
      numField('Breite', o.width, (v) => set((x) => {
        x.width = Math.min(v, L - 2);
        x.offset = clamp(x.offset, x.width / 2, L - x.width / 2);
      }), { unit: 'cm', min: 20, length: true }),
      numField('Höhe', o.height, (v) => set((x) => (x.height = v)), { unit: 'cm', min: 20, length: true }),
      numField('Brüstung', o.sill, (v) => set((x) => (x.sill = v)), { unit: 'cm', min: 0, length: true }),
      stat('Oberkante', fmtLen(o.sill + o.height)),
    ),
    h('h4', {}, 'Lage in der Wand'),
    h('div', { class: 'grid2' },
      numField('Abstand links', left, (v) => set((x) => (x.offset = clamp(v + x.width / 2, x.width / 2, L - x.width / 2))), { unit: 'cm', min: 0, length: true }),
      numField('Abstand rechts', right, (v) => set((x) => (x.offset = clamp(L - v - x.width / 2, x.width / 2, L - x.width / 2))), { unit: 'cm', min: 0, length: true }),
    ),
    h('p', { class: 'hint' }, 'Gemessen ab Wandanfang/-ende (Achse). Im Plan kannst du die Öffnung entlang der Wand ziehen – auch auf eine andere Wand.'),
    h('div', { class: 'btnrow' }, h('button', { onclick: () => set((x) => (x.offset = L / 2)) }, 'Mittig setzen')),
    o.type !== 'window'
      ? h('div', {}, h('h4', {}, 'Öffnungsrichtung'),
          h('div', { class: 'btnrow' },
            h('button', { onclick: () => set((x) => (x.hingeRight = !x.hingeRight)) }, `Anschlag ${o.hingeRight ? 'rechts' : 'links'} ⇄`),
            h('button', { onclick: () => set((x) => (x.swingOut = !x.swingOut)) }, 'Seite wechseln ⇅'),
          ))
      : null,
    h('h4', {}, 'Rahmen'),
    colorField('Rahmenfarbe', o.frameColor ?? '#f4f4f2', (v) => set((x) => (x.frameColor = v)), ['#f4f4f2', '#d9d6cf', '#7b7f83', '#3a3d40', '#202122', '#8a6440', '#c9a374']),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => {
      store.update((p) => (p.openings = p.openings.filter((x) => x.id !== o.id)));
      store.select(null);
    } }, 'Löschen')),
  ].filter(Boolean) as HTMLElement[];
}

// ---------------------------------------------------------------- Raum

function roomProps(r: Room): HTMLElement[] {
  const set = (fn: (x: Room, p: Project) => void) => upd((p) => p.rooms, r.id, fn);
  const inner = innerArea(r, store.project);
  const area = Math.abs(polygonArea(inner));
  let per = 0;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    per += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return [
    h('h3', {}, r.name),
    textField('Name', r.name, (v) => set((x) => (x.name = v))),
    h('div', { class: 'grid2', style: 'margin-top:8px' }, stat('Fläche (innen)', fmtArea(area)), stat('Umfang (innen)', fmtLen(per))),
    h('h4', {}, 'Boden'),
    materialPicker(FLOOR_MATERIALS, r.floor, (m) => set((x) => (x.floor = m)), TINT_COLORS),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => {
      store.update((p) => (p.rooms = p.rooms.filter((x) => x.id !== r.id)));
      store.select(null);
    } }, 'Raum entfernen (Wände bleiben)')),
  ];
}
