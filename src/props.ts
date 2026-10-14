// Rechte Leiste: Eigenschaften der Auswahl.
import { store, moveNode, innerArea } from './store';
import { h, numField, textField, selectField, colorField, checkbox, paramField } from './dom';
import { TYPE_INFO, FINISHES, COLORS, HEIGHT_PRESETS, isTech, trade } from './catalog';
import type { Item, Wall, Opening, Room, Finish, OpeningType, Project, Baseboard } from './types';
import { wallLength, wallDir, add, mul, perp, dot, fmtArea, fmtLen, polygonArea, uid, clamp } from './geometry';
import { stackedOn, rotateItemTo, moveItemTo, snapItemToWall, supportAt, wallAttachment, setWallDistance, radiatorUnderWindow, switchNextToDoor, techAttachments, reattachTech } from './ops';
import { faceRange, wallSideRooms } from './baseboards';
import { ceilingHeight } from './items';
import { baseboardEditor, baseboardStyleFields, addPiece, splitPiece, TECH_COLORS } from './techui';
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
      if (it) el.append(...(isTech(it.type) ? techProps(it, ctx) : itemProps(it, ctx)));
    } else if (s.kind === 'wall') {
      const w = store.wall(s.id);
      if (w) el.append(...wallProps(w, ctx));
    } else if (s.kind === 'opening') {
      const o = store.opening(s.id);
      if (o) el.append(...openingProps(o, ctx));
    } else if (s.kind === 'room') {
      const r = store.room(s.id);
      if (r) el.append(...roomProps(r, ctx));
    } else if (s.kind === 'baseboard') {
      const bp = store.baseboard(s.id);
      if (bp) el.append(...baseboardProps(bp, ctx));
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
      ? h('div', {}, h('h4', {}, 'Aufbau'), h('div', { class: 'grid2' }, ...info.params.map((pp) => paramField(pp, it.params[pp.key] ?? pp.def, (v) => set((x) => (x.params = { ...x.params, [pp.key]: v }))))))
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
  // Haustechnik an den Wänden wandert mit, wenn sich Länge, Winkel oder Stärke ändern
  const set = (fn: (x: Wall, p: Project) => void) =>
    upd((p) => p.walls, w.id, (x, p) => {
      const att = techAttachments(p);
      fn(x, p);
      reattachTech(p, att);
    });
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
    own ? materialPicker(WALL_MATERIALS, mat, (m) => set((x) => (x.material = m))) : h('p', { class: 'hint' }, 'Verwendet das Standard-Wandmaterial (Tab „Material“).'),
    wallBaseboards(w),
  ];
}

/** Fußleisten einer Wand: Rundum-Leiste des Raums an/aus und Einzelstücke. */
function wallBaseboards(w: Wall): HTMLElement {
  const p = store.project;
  const rooms = wallSideRooms(p, w);
  const box = h('div', {}, h('h4', {}, 'Fußleisten an dieser Wand'));
  for (const side of [1, -1] as const) {
    const room = rooms[side];
    const pieces = p.baseboards.filter((b) => b.wallId === w.id && b.side === side);
    if (!room && !pieces.length) continue;
    const label = room ? room.name : side === 1 ? 'Seite A' : 'Seite B';
    const face = faceRange(p, w, side);
    const card = h('div', { class: 'card' }, h('div', { style: 'font-weight:600;margin-bottom:6px' }, `Seite „${label}“ · ${fmtLen(face.s1 - face.s0)}`));
    if (room?.baseboard?.on) {
      const on = !(room.baseboard.skip ?? []).includes(w.id);
      card.append(checkbox('Rundum-Fußleiste des Raums hier', on, (v) => upd((pp) => pp.rooms, room.id, (r) => {
        const skip = new Set(r.baseboard!.skip ?? []);
        if (v) skip.delete(w.id);
        else skip.add(w.id);
        r.baseboard!.skip = [...skip];
      })));
    }
    if (pieces.length)
      card.append(h('div', { class: 'list', style: 'margin-top:6px' }, ...pieces.map((bp, i) => h('div', { class: 'li', onclick: () => store.select({ kind: 'baseboard', id: bp.id }) }, h('span', {}, `Stück ${i + 1}: ${fmtLen(bp.start - face.s0)} ab Ecke`), h('span', { class: 'muted' }, fmtLen(bp.length))))));
    card.append(h('div', { class: 'btnrow' }, h('button', { onclick: () => addPiece(w.id, side, room?.baseboard ?? undefined) }, '+ Fußleisten-Stück')));
    box.append(card);
  }
  if (box.children.length === 1) box.append(h('p', { class: 'hint' }, 'An dieser Wand liegt kein Raum. Lege zuerst einen Raum an.'));
  return box;
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

function openingProps(o: Opening, ctx: Ctx): HTMLElement[] {
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
    h('h4', {}, 'Haustechnik'),
    o.type === 'window'
      ? h('div', { class: 'btnrow' }, h('button', { onclick: () => {
          const r = radiatorUnderWindow(store.project, o);
          if (!r) return ctx.status('Unter diesem Fenster ist zu wenig Platz für einen Heizkörper (Brüstung zu niedrig).');
          store.update((p) => p.items.push(r));
          store.select({ kind: 'item', id: r.id });
          ctx.status(`${r.name} unter das Fenster gesetzt (12 cm über Boden, 4 cm Wandabstand).`);
        } }, 'Heizkörper darunter setzen'))
      : h('div', { class: 'btnrow' }, h('button', { onclick: () => {
          const sw = switchNextToDoor(store.project, o);
          if (!sw) return;
          store.update((p) => p.items.push(sw));
          store.select({ kind: 'item', id: sw.id });
          ctx.status('Lichtschalter neben die Tür gesetzt (105 cm, Griffseite).');
        } }, 'Lichtschalter daneben setzen')),
    h('h4', {}, 'Rahmen'),
    colorField('Rahmenfarbe', o.frameColor ?? '#f4f4f2', (v) => set((x) => (x.frameColor = v)), ['#f4f4f2', '#d9d6cf', '#7b7f83', '#3a3d40', '#202122', '#8a6440', '#c9a374']),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => {
      store.update((p) => (p.openings = p.openings.filter((x) => x.id !== o.id)));
      store.select(null);
    } }, 'Löschen')),
  ].filter(Boolean) as HTMLElement[];
}

// ---------------------------------------------------------------- Raum

function roomProps(r: Room, ctx: Ctx): HTMLElement[] {
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
    h('div', { style: 'height:8px' }),
    checkbox('Fußbodenheizung', !!r.floorHeating, (v) => set((x) => (x.floorHeating = v))),
    h('h4', {}, 'Fußleisten'),
    baseboardEditor(r.id, ctx),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => {
      store.update((p) => (p.rooms = p.rooms.filter((x) => x.id !== r.id)));
      store.select(null);
    } }, 'Raum entfernen (Wände bleiben)')),
  ];
}

// ---------------------------------------------------------------- Haustechnik

const TECH_HINTS: Partial<Record<Item['type'], string>> = {
  socket: 'DIN 18015-3: Steckdosen in Wohnräumen 30 cm, über Arbeitsflächen 115 cm (Dosenmitte). Zu Ecken, Türen und Fenstern mind. 15 cm Abstand (Installationszonen).',
  switch: 'Schalter neben Türen auf der Griffseite, ca. 105 cm hoch und 15–20 cm neben der Zarge.',
  power: 'Starkstrom (400 V) nur von einer Elektrofachkraft anschließen lassen.',
  data: 'Netzwerk- und Antennendosen am besten neben Steckdosen planen (gleiche Höhe).',
  water: 'Üblich: warm links, kalt rechts. Abfluss mittig darunter.',
  radiator: 'Heizkörper möglichst unter Fenstern; Breite ca. 75–100 % der Fensterbreite. Wandabstand 4 cm.',
  thermostat: 'Raumthermostat an einer Innenwand, nicht über Heizkörpern oder in der Sonne.',
  smoke: 'Rauchmelder sind in Schlafräumen, Kinderzimmern und Fluren Pflicht – mittig an der Decke.',
  lightpoint: 'Deckenauslässe meist in Raummitte bzw. über dem Esstisch.',
};

function techProps(it: Item, ctx: Ctx): HTMLElement[] {
  const set = (fn: (x: Item, p: Project) => void) => upd((p) => p.items, it.id, fn);
  const p = store.project;
  const info = TYPE_INFO[it.type];
  const att = wallAttachment(p, it);
  const presets = HEIGHT_PRESETS[it.type] ?? [];
  const bottomBased = it.type === 'radiator';
  const setHeight = (v: number) => set((x) => {
    x.z = Math.max(0, bottomBased ? v : v - x.h / 2);
    x.mount = x.z;
  });
  const height = it.ceiling
    ? h('div', {},
        stat('Montage', `an der Decke (Unterkante ${fmtLen(it.z)})`),
        h('div', { class: 'btnrow' }, h('button', { onclick: () => set((x, pp) => (x.z = x.mount = Math.max(0, ceilingHeight(pp) - x.h))) }, 'An Raumhöhe anpassen')))
    : h('div', {},
        numField(bottomBased ? 'Bodenabstand (Unterkante)' : 'Höhe Mitte über Fußboden', bottomBased ? it.z : it.z + it.h / 2, setHeight, { unit: 'cm', min: 0, length: true }),
        presets.length ? h('div', { class: 'chips' }, ...presets.map((pr) => h('button', { class: 'preset', onclick: () => setHeight(pr.v) }, pr.label))) : null,
      );
  const position = it.ceiling
    ? h('div', { class: 'grid2' },
        numField('x', it.x, (v) => set((x) => (x.x = v)), { unit: 'cm', length: true }),
        numField('y', it.y, (v) => set((x) => (x.y = v)), { unit: 'cm', length: true }),
      )
    : att
      ? h('div', {},
          h('div', { class: 'grid2' },
            numField('Abstand links', att.left, (v) => set((x, pp) => setWallDistance(pp, x, 'left', v)), { unit: 'cm', min: 0, length: true }),
            numField('Abstand rechts', att.right, (v) => set((x, pp) => setWallDistance(pp, x, 'right', v)), { unit: 'cm', min: 0, length: true }),
          ),
          h('p', { class: 'hint', style: 'margin-top:0' }, 'Vom Raum aus auf die Wand geschaut, gemessen bis zur Innenecke.'),
        )
      : h('div', {},
          h('p', { class: 'hint' }, 'Hängt nicht an einer Wand.'),
          h('div', { class: 'btnrow' }, h('button', { onclick: () => set((x, pp) => void snapItemToWall(pp, x, 400)) }, 'An nächste Wand setzen')),
        );
  return [
    h('h3', {}, it.name),
    h('p', { class: 'hint', style: 'margin-top:-6px' }, `${trade(it.type, it.params)} · ${info.label}`),
    textField('Bezeichnung', it.name, (v) => set((x) => (x.name = v))),
    h('h4', {}, 'Montagehöhe'),
    height,
    h('h4', {}, 'Position'),
    position,
    info.params?.length
      ? h('div', {}, h('h4', {}, 'Ausführung'), h('div', { class: 'grid2' }, ...info.params.map((pp) => paramField(pp, it.params[pp.key] ?? pp.def, (v) => set((x) => {
          x.params = { ...x.params, [pp.key]: v };
          // Mehrfachsteckdosen: Breite mitwachsen lassen
          if (x.type === 'socket' && pp.key === 'n') x.w = 7 * v + 1;
        })))))
      : null,
    h('h4', {}, 'Maße'),
    h('div', { class: 'grid3' },
      numField('Breite', it.w, (v) => set((x) => (x.w = v)), { unit: 'cm', min: 1, length: true }),
      numField('Tiefe', it.d, (v) => set((x) => (x.d = v)), { unit: 'cm', min: 0.5, length: true }),
      numField('Höhe', it.h, (v) => set((x) => {
        const c = x.z + x.h / 2;
        x.h = v;
        if (!bottomBased && !x.ceiling) x.z = x.mount = Math.max(0, c - v / 2);
      }), { unit: 'cm', min: 0.5, length: true }),
    ),
    colorField('Farbe', it.color, (v) => set((x) => (x.color = v)), it.type === 'radiator' ? ['#f4f4f2', '#e9e4da', '#9fa3a6', '#45484b', '#202122'] : TECH_COLORS),
    TECH_HINTS[it.type] ? h('p', { class: 'hint' }, TECH_HINTS[it.type]!) : null,
    h('h4', {}, 'Aktionen'),
    h('div', { class: 'btnrow' },
      h('button', { onclick: () => duplicateItem(it.id) }, 'Daneben kopieren'),
      h('button', { onclick: () => set((x) => (x.locked = !x.locked)) }, it.locked ? '🔒 Entsperren' : 'Sperren'),
      h('button', { class: 'danger', onclick: () => ctx.plan.deleteSelection() }, 'Löschen'),
    ),
  ].filter(Boolean) as HTMLElement[];
}

// ---------------------------------------------------------------- Fußleisten-Stück

function baseboardProps(bp: Baseboard, ctx: Ctx): HTMLElement[] {
  const set = (fn: (x: Baseboard, p: Project) => void) => upd((p) => p.baseboards, bp.id, fn);
  const p = store.project;
  const w = p.walls.find((x) => x.id === bp.wallId);
  if (!w) return [];
  const face = faceRange(p, w, bp.side);
  const rooms = wallSideRooms(p, w);
  // Vom Raum aus gesehen: liegt das Wandende rechts?
  const n = mul(perp(wallDir(w)), bp.side);
  const endIsRight = dot(wallDir(w), { x: n.y, y: -n.x }) > 0;
  const distStart = bp.start - face.s0;
  const distEnd = face.s1 - bp.start - bp.length;
  const setLeft = (v: number) => set((x) => (x.start = endIsRight ? face.s0 + v : face.s1 - v - x.length));
  const setRight = (v: number) => set((x) => (x.start = endIsRight ? face.s1 - v - x.length : face.s0 + v));
  const sideLabel = (sd: 1 | -1) => rooms[sd]?.name ?? (sd === 1 ? 'Seite A (ohne Raum)' : 'Seite B (ohne Raum)');
  return [
    h('h3', {}, 'Fußleisten-Stück'),
    h('p', { class: 'hint', style: 'margin-top:-6px' }, `An einer Wand mit ${fmtLen(face.s1 - face.s0)} Innenlänge · Türen werden ausgespart`),
    selectField('Wandseite', String(bp.side), [
      { value: '1', label: sideLabel(1) },
      { value: '-1', label: sideLabel(-1) },
    ], (v) => set((x) => (x.side = (parseInt(v, 10) === -1 ? -1 : 1)))),
    h('h4', {}, 'Lage & Länge'),
    h('div', { class: 'grid3' },
      numField('Abstand links', endIsRight ? distStart : distEnd, setLeft, { unit: 'cm', min: -20, length: true }),
      numField('Länge', bp.length, (v) => set((x) => (x.length = v)), { unit: 'cm', min: 2, length: true }),
      numField('Abstand rechts', endIsRight ? distEnd : distStart, setRight, { unit: 'cm', min: -20, length: true }),
    ),
    h('div', { class: 'btnrow' },
      h('button', { onclick: () => set((x) => {
        x.start = face.s0;
        x.length = face.s1 - face.s0;
      }) }, 'Ganze Wand'),
      h('button', { title: 'In der Mitte in zwei Stücke teilen', onclick: () => splitPiece(bp.id) || ctx.status('Das Stück ist zu kurz zum Teilen.') }, 'Teilen'),
      h('button', { title: 'In der Mitte teilen und 50 cm Lücke lassen (z.B. für ein Möbel)', onclick: () => splitPiece(bp.id, 50) || ctx.status('Das Stück ist zu kurz für eine Lücke von 50 cm.') }, 'Teilen mit Lücke'),
    ),
    h('h4', {}, 'Profil & Material'),
    baseboardStyleFields(bp, (fn) => set((x) => fn(x))),
    h('div', { class: 'btnrow' },
      h('button', { onclick: () => store.select({ kind: 'wall', id: w.id }) }, 'Zur Wand'),
      h('button', { class: 'danger', onclick: () => ctx.plan.deleteSelection() }, 'Löschen'),
    ),
  ];
}
