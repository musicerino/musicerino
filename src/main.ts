import './style.css';
import { store, emptyProject } from './store';
import { Plan2D, type Tool } from './plan2d';
import { View3D } from './view3d';
import { h, download, openModal, closeModal, modalOpen } from './dom';
import { renderRoomTab, renderFurnitureTab, renderMaterialTab, renderSunTab, findEntry, type Ctx } from './panels';
import { initProps, duplicateItem } from './props';
import { settings, stackedOn, rotateItemTo, moveItemTo } from './ops';
import { ui, requestRedraw } from './shared';
import { sunTimes, siteSun, fmtTime, compassName } from './sun';
import type { Project } from './types';
import { initPWA, isStandalone } from './pwa';
import { initPanels, initMenu, initWallBar, initSelectionBar, initJoystick, afterInsert, saveProject, COARSE } from './touch';

const $ = (id: string) => document.getElementById(id)!;
const statusEl = $('status');
const status = (s: string) => (statusEl.textContent = s);

const plan = new Plan2D($('plan'));
const view = new View3D($('view3d'));
plan.findEntry = findEntry;
view.findEntry = findEntry;
plan.onStatus = status;
view.onStatus = status;
const ctx: Ctx = { plan, view, status, afterInsert };

// ------------------------------------------------------------- Seitenleiste
renderRoomTab($('tab-raum'), ctx);
renderFurnitureTab($('tab-moebel'), ctx);
renderMaterialTab($('tab-material'));
renderSunTab($('tab-sonne'), ctx);
initProps($('props'), ctx);

const tabs = $('tabs');
function showTab(name: string) {
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpanel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
}
tabs.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b?.dataset.tab) showTab(b.dataset.tab);
});

// ------------------------------------------------------------- Ansicht
const views = $('views');
function setView(v: string) {
  views.className = 'views ' + (v === '2d' ? 'only2d' : v === '3d' ? 'only3d' : 'split');
  $('viewSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  requestAnimationFrame(() => {
    plan.resize();
    plan.fit();
    view.resize();
  });
}
$('viewSeg').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b?.dataset.view) setView(b.dataset.view);
});

// ------------------------------------------------------------- 2D-Werkzeugleiste
const ICONS: Record<string, string> = {
  select: '<path d="M4 3l12 6-5 1.5L9 16z" fill="currentColor"/>',
  wall: '<path d="M3 15V5h10" fill="none" stroke="currentColor" stroke-width="3"/>',
  room: '<rect x="3" y="4" width="13" height="11" fill="none" stroke="currentColor" stroke-width="2.5"/>',
  window: '<rect x="3" y="7" width="13" height="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9.5h13" stroke="currentColor"/>',
  door: '<path d="M4 15V4M4 4a11 11 0 0 1 11 11" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  french: '<path d="M3 15V5M16 15V5M3 5a6.5 6.5 0 0 1 6.5 6.5M16 5a6.5 6.5 0 0 0-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  measure: '<path d="M2 13l11-11 4 4-11 11z M6 9l1.5 1.5M8.5 6.5l1.5 1.5M11 4l1.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  fit: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" stroke-width="2"/>',
};
const icon = (k: string) => `<svg viewBox="0 0 19 19">${ICONS[k]}</svg>`;
const toolDefs: [Tool, string, string][] = [
  ['select', 'Auswahl', 'V'],
  ['wall', 'Wand', 'W'],
  ['room', 'Raum', ''],
  ['window', 'Fenster', 'F'],
  ['door', 'Tür', 'T'],
  ['french', 'Balkontür', ''],
  ['measure', 'Messen', 'M'],
];
const tb2 = $('toolbar2d');
const toolButtons = new Map<Tool, HTMLButtonElement>();
for (const [t, label, key] of toolDefs) {
  const b = h('button', { class: 'tool', title: `${label}${key ? ` (${key})` : ''}`, onclick: () => plan.setTool(t) }) as HTMLButtonElement;
  b.innerHTML = icon(t) + `<span>${label}</span>`;
  toolButtons.set(t, b);
  tb2.append(b);
}
plan.onToolChange = (t) => toolButtons.forEach((b, k) => b.classList.toggle('active', k === t));
tb2.append(h('div', { class: 'sep' }));
const toggle = (label: string, title: string, get: () => boolean, set: (v: boolean) => void) => {
  const b = h('button', { title, 'aria-pressed': String(get()) }, label) as HTMLButtonElement;
  b.onclick = () => {
    set(!get());
    b.setAttribute('aria-pressed', String(get()));
    requestRedraw();
  };
  return b;
};
tb2.append(
  toggle('Raster', 'Am Raster (5 cm) einrasten', () => settings.snapGrid, (v) => (settings.snapGrid = v)),
  toggle('Stapeln', 'Möbel automatisch auf andere Möbel stellen', () => settings.stack, (v) => (settings.stack = v)),
  toggle('Andocken', 'Möbel an Wände andocken (beim Ziehen Alt halten = aus)', () => settings.snapWalls, (v) => (settings.snapWalls = v)),
  toggle('Maße', 'Wandmaße und Möbelabstände anzeigen', () => ui.showDims, (v) => {
    ui.showDims = v;
    ui.showItemDims = v;
  }),
);
const fitBtn = h('button', { title: 'Alles zeigen', onclick: () => plan.fit() }) as HTMLButtonElement;
fitBtn.innerHTML = icon('fit');
tb2.append(h('div', { class: 'spacer' }), fitBtn);
plan.setTool('select');

// ------------------------------------------------------------- 3D-Werkzeugleiste
const tb3 = $('toolbar3d');
const modeOrbit = h('button', { class: 'active', onclick: () => setMode('orbit') }, 'Umkreisen');
const modeWalk = h('button', { onclick: () => setMode('walk') }, 'Rundgang');
function setMode(m: 'orbit' | 'walk') {
  view.setMode(m);
  showJoystick(m === 'walk' && COARSE.matches);
  modeOrbit.classList.toggle('active', m === 'orbit');
  modeWalk.classList.toggle('active', m === 'walk');
  if (COARSE.matches) {
    status(m === 'walk' ? 'Rundgang: Joystick unten links = gehen, mit dem Finger wischen = umsehen.' : '3D: Ein Finger dreht, zwei Finger zoomen/verschieben. Möbel antippen, dann ziehen – auf andere Möbel ziehen zum Stapeln.');
    return;
  }
  status(m === 'walk' ? 'Rundgang: Maus ziehen = umsehen, W/A/S/D oder Pfeiltasten = gehen, Shift = schneller, Mausrad = Brennweite. Erst in die 3D-Ansicht klicken.' : '3D: Linke Maustaste = drehen, rechte = verschieben, Rad = zoomen. Möbel anklicken und ziehen – auf andere Möbel ziehen zum Stapeln.');
}
tb3.append(
  h('div', { class: 'seg' }, modeOrbit, modeWalk),
  h('div', { class: 'sep' }),
  h('button', { onclick: () => view.setCameraPreset('iso'), title: 'Schrägansicht' }, 'Schräg'),
  h('button', { onclick: () => view.setCameraPreset('top'), title: 'Draufsicht' }, 'Oben'),
  h('button', { onclick: () => view.setCameraPreset('front'), title: 'Augenhöhe von vorn' }, 'Vorne'),
  h('div', { class: 'sep' }),
  toggle('Wände ausblenden', 'Wände zwischen Kamera und Raum transparent machen', () => view.cutaway, (v) => {
    view.cutaway = v;
    view.invalidate();
  }),
  toggle('Sonnenbahn', 'Sonnenbahn und Kompass anzeigen', () => view.showSunPath, (v) => {
    view.showSunPath = v;
    view.updateSun();
  }),
);

// ------------------------------------------------------------- Zeitleiste
const timebar = $('timebar');
const playBtn = h('button', { class: 'icon', title: 'Tagesverlauf abspielen' }, '▶') as HTMLButtonElement;
const timeLabel = h('span', { class: 'time' });
const slider = h('input', { type: 'range', min: 0, max: 1439, step: 1 }) as HTMLInputElement;
const dateIn = h('input', { type: 'date' }) as HTMLInputElement;
const sunMini = h('span', { class: 'sunmini' });
const speedSel = h('select', { style: 'width:auto' }, h('option', { value: '30' }, '30 min/s'), h('option', { value: '60', selected: true }, '1 h/s'), h('option', { value: '180' }, '3 h/s')) as HTMLSelectElement;
timebar.append(playBtn, timeLabel, slider, dateIn, speedSel, sunMini);
let playing = false;
let lastT = 0;
let pendingCommit = 0;
function syncTime() {
  const s = store.project.site;
  slider.value = String(s.minutes);
  timeLabel.textContent = fmtTime(s.minutes);
  if (document.activeElement !== dateIn) dateIn.value = s.date;
  const sp = siteSun(s);
  const t = sunTimes(s);
  sunMini.textContent = sp.altitude > 0 ? `☀ ${Math.round(sp.altitude)}° · ${compassName(sp.bearing)}  (${fmtTime(t.rise)}–${fmtTime(t.set)})` : `☾ Sonne unter dem Horizont (${fmtTime(t.rise)}–${fmtTime(t.set)})`;
}
slider.addEventListener('input', () => {
  store.mutate((p) => (p.site.minutes = parseInt(slider.value, 10)));
});
slider.addEventListener('change', () => store.commit());
dateIn.addEventListener('change', () => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateIn.value)) store.update((p) => (p.site.date = dateIn.value));
});
playBtn.onclick = () => {
  playing = !playing;
  playBtn.textContent = playing ? '❚❚' : '▶';
  if (playing) {
    lastT = performance.now();
    const s = store.project.site;
    const t = sunTimes(s);
    if (t.set !== null && (s.minutes >= t.set || (t.rise !== null && s.minutes < t.rise - 30))) store.mutate((p) => (p.site.minutes = Math.max(0, Math.round((t.rise ?? 360) - 20))));
    requestAnimationFrame(animate);
  } else store.commit();
};
function animate(now: number) {
  if (!playing) return;
  const dt = (now - lastT) / 1000;
  lastT = now;
  const speed = parseFloat(speedSel.value);
  const s = store.project.site;
  let m = s.minutes + dt * speed;
  const t = sunTimes(s);
  if (t.set !== null && m > t.set + 30) m = Math.max(0, (t.rise ?? 360) - 20);
  if (m >= 1440) m = 0;
  store.mutate((p) => (p.site.minutes = m));
  clearTimeout(pendingCommit);
  requestAnimationFrame(animate);
}

let lastSiteKey = '';
store.on(() => {
  const s = store.project.site;
  const key = JSON.stringify(s);
  if (key !== lastSiteKey) {
    lastSiteKey = key;
    syncTime();
    view.updateSun();
    plan.draw();
  }
  updateUndo();
  if (document.activeElement !== nameIn) nameIn.value = store.project.name;
});
syncTime();

// ------------------------------------------------------------- Topbar
const nameIn = $('projectName') as HTMLInputElement;
nameIn.value = store.project.name;
nameIn.addEventListener('change', () => store.update((p) => (p.name = nameIn.value || 'Mein Projekt')));
nameIn.addEventListener('keydown', (e) => e.stopPropagation());
const undoBtn = $('btnUndo') as HTMLButtonElement;
const redoBtn = $('btnRedo') as HTMLButtonElement;
function updateUndo() {
  undoBtn.disabled = !store.canUndo();
  redoBtn.disabled = !store.canRedo();
}
undoBtn.onclick = () => store.undo();
redoBtn.onclick = () => store.redo();
updateUndo();

$('btnNew').onclick = () => {
  showTab('raum');
  ($('tab-raum').querySelector('.btnrow button') as HTMLButtonElement | null)?.focus();
  openModal(
    h('div', {},
      h('h2', {}, 'Neues Projekt'),
      h('p', {}, 'Möchtest du mit einem leeren Projekt beginnen? Das aktuelle Projekt wird ersetzt (vorher ggf. „Speichern“).'),
      h('div', { class: 'btnrow' },
        h('button', { onclick: closeModal }, 'Abbrechen'),
        h('button', { class: 'primary', onclick: () => {
          const p = emptyProject();
          p.customCatalog = store.project.customCatalog;
          p.site = { ...p.site, lat: store.project.site.lat, lon: store.project.site.lon, tz: store.project.site.tz, north: store.project.site.north };
          store.load(p);
          closeModal();
          plan.fit();
          view.fitView();
          status('Leeres Projekt. Lege links unter „Raum“ einen Raum aus Maßen an oder zeichne Wände (W).');
        } }, 'Leeres Projekt'),
      ),
    ),
  );
};
$('btnSave').onclick = () => {
  const name = (store.project.name || 'raumplan').replace(/[^\wäöüÄÖÜß -]+/g, '').trim() || 'raumplan';
  void saveProject(name, JSON.stringify(store.project, null, 1), status, download);
};
const fileInput = $('fileInput') as HTMLInputElement;
$('btnOpen').onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try {
    const p = JSON.parse(await f.text()) as Project;
    if (!p || !Array.isArray(p.walls)) throw new Error('Keine Raumplaner-Datei');
    store.load(p);
    plan.fit();
    view.fitView();
    status(`„${p.name}“ geladen.`);
  } catch (e) {
    status('Datei konnte nicht gelesen werden: ' + (e as Error).message);
  }
  fileInput.value = '';
};
$('btnShot').onclick = () => {
  const mode = views.classList.contains('only2d') ? '2d' : '3d';
  const url = mode === '2d' ? plan.exportPNG() : view.screenshot();
  download(`${store.project.name || 'raumplan'}-${mode}.png`, url);
  openModal(h('div', {},
    h('h2', {}, 'Bild der Ansicht'),
    h('p', { class: 'hint' }, 'Falls kein Download startet: Bild mit Rechtsklick bzw. langem Tippen sichern.'),
    h('img', { src: url, style: 'width:100%;border-radius:8px;border:1px solid var(--line)' }),
    h('div', { class: 'btnrow', style: 'justify-content:flex-end' }, h('button', { class: 'primary', onclick: closeModal }, 'Schließen')),
  ));
};
$('btnHelp').onclick = showHelp;

function showHelp() {
  openModal(
    h('div', {},
      h('h2', {}, 'Raumplaner – Kurzanleitung'),
      h('div', { class: 'help-grid' },
        h('div', {},
          h('h4', {}, '1 · Räume'),
          h('p', {}, '„Raum aus Maßen“ (links) erzeugt einen Raum mit exakten Innenmaßen. Mit dem Wand-Werkzeug (W) klickst du Punkt für Punkt – tippe dabei eine Länge (z.B. 3,45m) und drücke Enter. Endpunkte und ganze Wände lassen sich ziehen; Doppelklick auf eine Wand teilt sie.'),
          h('h4', {}, '2 · Fenster & Türen'),
          h('p', {}, 'Werkzeug wählen und auf eine Wand klicken. Rechts Breite, Höhe, Brüstung und Abstände eingeben. Im Plan entlang der Wand ziehbar.'),
          h('h4', {}, '3 · Möbel'),
          h('p', {}, 'Im Katalog anklicken (Einfügen in der Plan-Mitte) oder per Drag & Drop in 2D/3D ablegen. Möbel docken an Wände an; auf ein anderes Möbel gezogen, werden sie gestapelt. Drehen über den runden Griff, R-Taste oder rechts. „Möbel nach Maß“ baut beliebige Stücke als 3D-Modell.'),
        ),
        h('div', {},
          h('h4', {}, '4 · Oberflächen'),
          h('p', {}, 'Material & Farbe für alle Wände, einzelne Wände und jeden Boden.'),
          h('h4', {}, '5 · Licht & Sonne'),
          h('p', {}, 'Koordinaten des Hauses eingeben (z.B. aus Google Maps: Rechtsklick → Koordinaten kopieren) und Norden ausrichten – per Kompass im Plan oder Regler. Unter der 3D-Ansicht Datum und Uhrzeit wählen oder ▶ für den Tagesverlauf. Die Sonnenstunden-Karte zeigt, wo wie lange Sonne hinfällt.'),
          h('h4', {}, 'iPad & Touch'),
          h('p', {}, 'Ein Finger verschiebt Möbel und Wände, zwei Finger zoomen und verschieben den Plan. In 3D Möbel erst antippen, dann ziehen. Beim Wand-Werkzeug erscheint unten eine Leiste: Länge eingeben und Richtungspfeil antippen. Die Knöpfe ◧ und ◨ oben öffnen die Seitenleisten. Als App installieren: „App installieren“ oben bzw. Safari → Teilen → „Zum Home-Bildschirm“.'),
          h('h4', {}, 'Speichern'),
          h('p', {}, 'Alles wird automatisch im Browser gespeichert. „Speichern“ lädt zusätzlich eine Projektdatei herunter, die du mit „Öffnen“ wieder lädst. „Bild“ speichert die aktuelle Ansicht als PNG.'),
        ),
      ),
      h('div', { class: 'btnrow', style: 'justify-content:flex-end' }, h('button', { class: 'primary', onclick: closeModal }, 'Los geht’s')),
    ),
  );
}

// ------------------------------------------------------------- Tastatur
window.addEventListener('keydown', (e) => {
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (modalOpen()) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (view.mode === 'walk' && document.activeElement === view.renderer.domElement) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
    return;
  }
  if (plan.handleKey(e)) {
    e.preventDefault();
    return;
  }
  const sel = store.selection;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
    e.preventDefault();
    plan.deleteSelection();
    return;
  }
  if (mod && e.key.toLowerCase() === 'd' && sel?.kind === 'item') {
    e.preventDefault();
    duplicateItem(sel.id);
    return;
  }
  if (mod) return;
  if (sel?.kind === 'item') {
    const it = store.item(sel.id);
    if (it && !it.locked) {
      if (e.key.toLowerCase() === 'r') {
        store.update((p) => rotateItemTo(it, it.rot + (e.shiftKey ? 15 : 90), stackedOn(p, it)));
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        store.mutate((p) => moveItemTo(p, it, it.x + d[0], it.y + d[1], stackedOn(p, it)));
        clearTimeout(pendingCommit);
        pendingCommit = window.setTimeout(() => store.commit(), 400);
        return;
      }
    }
  }
  if (e.key === 'Escape') {
    store.select(null);
    return;
  }
  const map: Record<string, Tool> = { v: 'select', w: 'wall', f: 'window', t: 'door', m: 'measure' };
  const t = map[e.key.toLowerCase()];
  if (t) plan.setTool(t);
});

// ------------------------------------------------------------- Touch, Seitenleisten, App
const showJoystick = initJoystick(view);
initPanels(() => {
  plan.resize();
  view.resize();
});
initMenu();
initWallBar(plan);
initSelectionBar(plan);
initPWA(status);
if (window.innerWidth < 700) setView('2d');

// Erststart-Hinweis
let seenHelp = false;
try {
  seenHelp = !!localStorage.getItem('raumplaner.seenHelp');
  localStorage.setItem('raumplaner.seenHelp', '1');
} catch {
  /* Speicher nicht verfügbar */
}
if (!seenHelp) setTimeout(showHelp, 400);
status(isStandalone() ? 'Bereit – läuft als App, auch offline.' : 'Bereit. Tipp: „?“ oben rechts zeigt die Kurzanleitung.');

// Für Fehlersuche / Power-User in der Browser-Konsole
(window as unknown as Record<string, unknown>).raumplaner = { store, plan, view };
