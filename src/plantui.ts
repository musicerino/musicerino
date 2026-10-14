// Oberfläche: Lichtzonen für Pflanzen und Pflanzensuche mit Standortempfehlung.
import { store } from './store';
import { h, put, selectField, checkbox } from './dom';
import { computeLight, ZONES, SEASONS, zoneInfo, mapCanvas, cellAt, cellText, zoneShares, fmtHours, type LightMap, type Zone, type Season, type LightCell } from './daylight';
import { LIGHT_CATS, searchPlants, plantsForZone, recommendSpots, suitability, type Plant, type LightCat, type Spot } from './plants';
import { ui, requestRedraw, type Overlay } from './shared';
import { CATALOG } from './catalog';
import { newItemFromEntry } from './items';
import { supportAt } from './ops';
import type { Ctx } from './panels';

type Mode = 'zones' | 'sun' | 'sky' | 'plant';

const state = {
  map: null as LightMap | null,
  key: '',
  mode: 'zones' as Mode,
  show: true,
  season: 'jahr' as Season,
  height: 50,
  plant: null as Plant | null,
  spots: [] as Spot[],
  computing: false,
  progress: 0,
  query: '',
};

let ctxRef: Ctx | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

/** Schlüssel der lichtrelevanten Projektdaten (um veraltete Ergebnisse zu erkennen). */
function projectKey(): string {
  const p = store.project;
  return JSON.stringify([
    p.walls.map((w) => [w.a, w.b, w.thickness, w.height, w.kind]),
    p.openings.map((o) => [o.wallId, o.offset, o.width, o.height, o.sill, o.overhang]),
    p.rooms.map((r) => r.points),
    p.items.map((i) => [i.type, i.x, i.y, i.z, i.w, i.d, i.h, i.rot]),
    [p.site.lat, p.site.lon, p.site.north, p.site.tz, p.site.horizon, state.season === 'datum' ? p.site.date : ''],
  ]);
}

const isStale = () => !!state.map && state.key !== projectKey();

// ------------------------------------------------------------------ Farbverläufe

function ramp(f: number, stops: [number, number, number][]): string {
  const x = Math.max(0, Math.min(1, f)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const t = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const SUN_RAMP: [number, number, number][] = [
  [43, 58, 103],
  [47, 143, 157],
  [242, 214, 75],
  [240, 123, 43],
];
const SKY_RAMP: [number, number, number][] = [
  [52, 58, 64],
  [116, 192, 252],
  [178, 242, 187],
  [255, 245, 200],
];

function cellColor(c: LightCell): string | null {
  const m = state.map!;
  switch (state.mode) {
    case 'sun': {
      const max = Math.max(1, ...m.cells.map((x) => x.sun));
      return ramp(c.sun / max, SUN_RAMP);
    }
    case 'sky':
      return ramp(c.sky / 8, SKY_RAMP);
    case 'plant': {
      if (!state.plant) return zoneInfo(c.zone).color;
      const s = suitability(state.plant.light, c);
      return s === 2 ? '#2f9e44' : s === 1 ? '#a9e34b' : 'rgba(90,96,104,0.35)';
    }
    default:
      return zoneInfo(c.zone).color;
  }
}

function applyOverlay() {
  const ctx = ctxRef;
  const m = state.map;
  if (!ctx) return;
  if (!m || !state.show) {
    ui.overlay = null;
    ctx.view.showOverlay(null);
    requestRedraw();
    return;
  }
  const plant = state.plant;
  const ov: Overlay = {
    canvas: mapCanvas(m, cellColor),
    x0: m.x0,
    y0: m.y0,
    step: m.step,
    clip: store.project.rooms.map((r) => r.points),
    alpha: state.mode === 'plant' ? 0.62 : 0.55,
    markers: state.mode === 'plant' ? state.spots.map((s, i) => ({ x: s.x, y: s.y, label: String(i + 1), color: s.score === 2 ? '#2b8a3e' : '#74b816' })) : undefined,
    info: (pt) => {
      const c = cellAt(m, pt);
      if (!c) return null;
      let txt = cellText(c);
      if (plant) {
        const s = suitability(plant.light, c);
        txt += ` · ${plant.name}: ${s === 2 ? 'ideal' : s === 1 ? 'geeignet' : 'ungeeignet'}`;
      }
      return txt;
    },
  };
  ui.overlay = ov;
  ctx.view.showOverlay(ov);
  requestRedraw();
}

async function compute() {
  if (state.computing) return;
  const ctx = ctxRef!;
  if (!store.project.rooms.length) {
    ctx.status('Bitte zuerst einen Raum anlegen.');
    return;
  }
  state.computing = true;
  state.progress = 0;
  changed();
  const t0 = performance.now();
  const map = await computeLight(store.project, {
    season: state.season,
    height: state.height,
    onProgress: (f) => {
      state.progress = f;
      const bar = document.querySelector('#lightProgress > div') as HTMLElement | null;
      if (bar) bar.style.width = Math.round(f * 100) + '%';
    },
  });
  state.computing = false;
  state.map = map;
  state.key = projectKey();
  if (state.plant && map) state.spots = recommendSpots(store.project, map, state.plant.light);
  if (state.mode === 'plant' && !state.plant) state.mode = 'zones';
  applyOverlay();
  changed();
  const secs = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
  ctx.status(map ? `Lichtzonen berechnet (${map.label}, ${map.cells.length} Messpunkte, ${secs} s). Tippe in den Plan, um die Werte einer Stelle zu sehen.` : 'Keine Räume vorhanden.');
}

function selectPlant(p: Plant | null) {
  state.plant = p;
  state.spots = p && state.map ? recommendSpots(store.project, state.map, p.light) : [];
  if (p && state.map) state.mode = 'plant';
  else if (!p && state.mode === 'plant') state.mode = 'zones';
  applyOverlay();
  changed();
}

function placePlant(spot: Spot) {
  const ctx = ctxRef!;
  const plant = state.plant;
  if (!plant) return;
  const entry = CATALOG.find((c) => c.id === (plant.size === 'gross' ? 'fejkaGross' : 'fejkaKlein'));
  if (!entry) return;
  const it = newItemFromEntry({ ...entry, name: plant.name }, Math.round(spot.x), Math.round(spot.y), store.project);
  store.update((p) => {
    p.items.push(it);
    const sup = supportAt(p, { x: it.x, y: it.y }, new Set([it.id]));
    if (sup) it.z = sup.z + sup.h;
  });
  store.select({ kind: 'item', id: it.id });
  ctx.status(`${plant.name} in „${spot.roomName}“ gesetzt (${spot.where}). Nach dem Verschieben von Möbeln am besten neu berechnen.`);
}

// ------------------------------------------------------------------ Karten

export function renderLightCards(ctx: Ctx): HTMLElement[] {
  ctxRef = ctx;
  const zonesCard = h('div', { class: 'card', id: 'lightCard' });
  const plantCard = h('div', { class: 'card', id: 'plantCard' });
  const renderZones = () => {
    zonesCard.innerHTML = '';
    const m = state.map;
    put(zonesCard,
      h('h3', {}, 'Lichtzonen für Pflanzen'),
      h('p', { class: 'hint' }, 'Aus Sonnenstand, Fenstern, Wänden und Möbeln wird für jede Stelle im Raum berechnet, wie viel direkte Sonne und Tageslicht ankommt – daraus ergeben sich sonnige, halbschattige und schattige Plätze.'),
      h('div', { class: 'grid2' },
        selectField('Zeitraum', state.season, SEASONS.map((s) => ({ value: s.id, label: s.label })), (v) => {
          state.season = v as Season;
          changed();
        }),
        selectField('Pflanzenhöhe', String(state.height), [
          { value: '50', label: 'Boden (Kübel)' },
          { value: '90', label: 'Tisch / Fensterbank' },
        ], (v) => {
          state.height = parseInt(v, 10);
          changed();
        }),
      ),
      h('div', { class: 'btnrow fill' }, h('button', { class: 'primary', disabled: state.computing, onclick: () => void compute() }, state.computing ? 'Berechne …' : m ? (isStale() ? 'Neu berechnen (Plan geändert)' : 'Neu berechnen') : 'Lichtzonen berechnen')),
      state.computing ? h('div', { class: 'progress', id: 'lightProgress' }, h('div', { style: `width:${Math.round(state.progress * 100)}%` })) : null,
    );
    if (!m) return;
    const modeBtn = (mode: Mode, label: string) =>
      h('button', { class: state.mode === mode ? 'active' : '', onclick: () => { state.mode = mode; applyOverlay(); changed(); } }, label);
    const shares = zoneShares(m);
    put(zonesCard,
      h('div', { class: 'seg', style: 'margin-top:8px;display:flex' },
        modeBtn('zones', 'Zonen'),
        modeBtn('sun', 'Sonnenstunden'),
        modeBtn('sky', 'Tageslicht'),
        state.plant ? modeBtn('plant', state.plant.name) : null,
      ),
      h('div', { style: 'margin-top:6px' }, checkbox('Im Plan und in 3D anzeigen', state.show, (v) => { state.show = v; applyOverlay(); })),
      state.mode === 'zones' || state.mode === 'plant'
        ? h('div', { class: 'zone-legend' },
            ...(state.mode === 'plant'
              ? [
                  zoneRow('#2f9e44', 'Ideal', `für ${state.plant?.name}`),
                  zoneRow('#a9e34b', 'Geeignet', 'verträgt den Platz'),
                  zoneRow('rgba(90,96,104,0.5)', 'Ungeeignet', ''),
                ]
              : ZONES.map((z) => zoneRow(z.color, z.label, z.desc, shares[z.id]))),
          )
        : h('div', {},
            h('div', { class: 'legend', style: `background:linear-gradient(90deg, ${(state.mode === 'sun' ? SUN_RAMP : SKY_RAMP).map((c) => `rgb(${c.join(',')})`).join(',')})` }),
            h('div', { class: 'legend-labels' },
              h('span', {}, state.mode === 'sun' ? '0 h' : '0 %'),
              h('span', {}, state.mode === 'sun' ? fmtHours(Math.max(...m.cells.map((c) => c.sun))) : '≥ 8 % Tageslicht'),
            ),
          ),
      h('p', { class: 'hint' }, `Stand: ${m.label}, Höhe ${m.height} cm.${isStale() ? ' Der Plan wurde seitdem geändert.' : ''}`),
      h('h4', {}, 'Räume'),
      h('div', { class: 'list' }, ...store.project.rooms.map((r) => roomBar(m, r.id, r.name))),
      h('h4', {}, 'Empfehlungen'),
      ...ZONES.filter((z) => shares[z.id] >= 0.03).map((z) => recRow(z.id)),
    );
  };
  const renderPlant = () => {
    plantCard.innerHTML = '';
    const input = h('input', { type: 'text', id: 'plantSearch', placeholder: 'Pflanze suchen, z.B. Monstera, Olive, Basilikum …', value: state.query, autocomplete: 'off' }) as HTMLInputElement;
    const sugg = h('div', { class: 'list', style: 'margin-top:6px' });
    const showSugg = () => {
      sugg.innerHTML = '';
      const q = input.value.trim();
      state.query = q;
      if (!q || (state.plant && state.plant.name === q)) return;
      const res = searchPlants(q, 6);
      for (const p of res)
        sugg.append(h('div', { class: 'li', onclick: () => { state.query = p.name; selectPlant(p); } },
          h('span', {}, h('b', {}, p.name), h('span', { class: 'muted' }, ` · ${p.bot}`)),
          h('span', { class: 'muted' }, LIGHT_CATS[p.light].label)));
      if (!res.length)
        put(sugg,
          h('p', { class: 'hint' }, `„${q}“ ist nicht in der Liste. Wähle den Lichtbedarf (steht meist auf dem Etikett):`),
          h('div', { class: 'chips' }, ...(Object.keys(LIGHT_CATS) as LightCat[]).map((k) => h('button', { onclick: () => selectPlant({ name: q, bot: 'eigene Angabe', aka: [], light: k, size: 'mittel', note: '' }) }, LIGHT_CATS[k].label))),
        );
    };
    input.addEventListener('input', showSugg);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const first = searchPlants(input.value, 1)[0];
        if (first) {
          state.query = first.name;
          selectPlant(first);
        }
      }
    });
    put(plantCard, h('h3', {}, 'Pflanze suchen'), input, sugg);
    const p = state.plant;
    if (p) {
      const cat = LIGHT_CATS[p.light];
      put(plantCard,
        h('div', { class: 'plant-head' },
          h('div', {}, h('div', { class: 'plant-name' }, p.name), h('div', { class: 'muted', style: 'font-style:italic' }, p.bot)),
          h('button', { class: 'icon', title: 'Auswahl aufheben', onclick: () => { state.query = ''; selectPlant(null); } }, '✕'),
        ),
        h('div', { class: 'plant-need' }, h('b', {}, cat.label), h('div', {}, cat.text), p.note ? h('div', { class: 'muted' }, p.note) : null),
        h('div', { class: 'zone-chips' }, h('span', { class: 'muted' }, 'Ideal:'), ...cat.ideal.map((z) => zoneChip(z)), cat.ok.length ? h('span', { class: 'muted' }, 'geht auch:') : null, ...cat.ok.map((z) => zoneChip(z, true))),
      );
      if (!state.map) {
        put(plantCard, h('div', { class: 'btnrow fill' }, h('button', { class: 'primary', disabled: state.computing, onclick: () => void compute() }, state.computing ? 'Berechne …' : 'Lichtzonen berechnen und Plätze finden')));
      } else {
        put(plantCard, h('h4', {}, 'Beste Plätze'));
        if (!state.spots.length) {
          const sunLover = cat.ideal.includes('sonnig');
          put(plantCard, h('p', { class: 'hint' }, sunLover
            ? 'In der Wohnung gibt es dafür nicht genug direkte Sonne. Tipp: Pflanzenlampe, im Sommer auf den Balkon – oder eine robustere Pflanze wählen.'
            : 'Kein passender Platz gefunden – die hellen Plätze sind zu sonnig. Tipp: etwas weiter weg vom Fenster oder mit einem leichten Vorhang.'));
        } else {
          put(plantCard, h('div', { class: 'list' }, ...state.spots.map((sp, i) =>
            h('div', { class: 'li spot' },
              h('div', {},
                h('div', { style: 'font-weight:600' }, `${i + 1} · ${sp.roomName}`, h('span', { class: `spot-tag ${sp.score === 2 ? 'ideal' : ''}` }, sp.score === 2 ? 'ideal' : 'geeignet')),
                h('div', { class: 'muted', style: 'font-size:12px' }, `${sp.where} · ${zoneInfo(sp.zone).label} · ${sp.area.toFixed(1).replace('.', ',')} m²`),
              ),
              h('div', { class: 'btnrow', style: 'margin:0;flex-wrap:nowrap' },
                h('button', { title: 'Im Plan zeigen', onclick: () => { state.mode = 'plant'; applyOverlay(); changed(); ctxRef?.show2D?.(); ctxRef?.plan.centerOn({ x: sp.x, y: sp.y }); } }, 'Zeigen'),
                h('button', { class: 'primary', onclick: () => placePlant(sp) }, 'Hier platzieren'),
              ),
            ))));
        }
        if (isStale()) put(plantCard, h('p', { class: 'hint' }, 'Der Plan wurde geändert – oben neu berechnen, damit die Plätze stimmen.'));
      }
    }
  };
  listeners.add(renderZones);
  listeners.add(renderPlant);
  renderZones();
  renderPlant();
  // veraltete Ergebnisse markieren
  let lastStale = false;
  store.on(() => {
    const st = isStale();
    if (st !== lastStale) {
      lastStale = st;
      renderZones();
      renderPlant();
    }
  });
  return [zonesCard, plantCard];
}

function zoneRow(color: string, label: string, desc: string, share?: number) {
  return h('div', { class: 'zone-row' },
    h('span', { class: 'sw', style: `background:${color}` }),
    h('span', { class: 'zl' }, h('b', {}, label), desc ? h('span', { class: 'muted' }, ` – ${desc}`) : null),
    share !== undefined ? h('span', { class: 'zp' }, `${Math.round(share * 100)} %`) : null,
  );
}

function zoneChip(z: Zone, faint = false) {
  const info = zoneInfo(z);
  return h('span', { class: 'zone-chip' + (faint ? ' faint' : ''), style: `--zc:${info.color}` }, info.label);
}

function roomBar(m: LightMap, roomId: string, name: string) {
  const sh = zoneShares(m, roomId);
  return h('div', { class: 'room-bar' },
    h('div', { class: 'rb-name' }, name),
    h('div', { class: 'rb-bar' }, ...ZONES.filter((z) => sh[z.id] > 0).map((z) => h('span', { title: `${z.label}: ${Math.round(sh[z.id] * 100)} %`, style: `flex:${sh[z.id]};background:${z.color}` }))),
  );
}

function recRow(z: Zone) {
  const info = zoneInfo(z);
  const plants = plantsForZone(z, 7);
  return h('div', { class: 'rec-row' },
    h('div', {}, h('span', { class: 'sw', style: `background:${info.color}` }), h('b', {}, info.label)),
    plants.length
      ? h('div', { class: 'chips' }, ...plants.map((p) => h('button', { onclick: () => { state.query = p.name; selectPlant(p); document.getElementById('plantCard')?.scrollIntoView({ behavior: 'smooth' }); } }, p.name)))
      : h('p', { class: 'hint' }, z === 'dunkel' ? 'Zu dunkel für die meisten Pflanzen – Pflanzenlampe nutzen oder Kunstpflanzen.' : ''),
  );
}
