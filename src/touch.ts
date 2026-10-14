// Bedienung für Touch-Geräte und schmale Bildschirme:
// ausklappbare Seitenleisten, Datei-Menü, Wand-Leiste, Auswahl-Leiste, Joystick.
import { store } from './store';
import { h, put, openModal, closeModal } from './dom';
import { parseLength, fmtLen, wallLength, uid } from './geometry';
import { stackedOn, rotateItemTo } from './ops';
import { duplicateItem } from './props';
import type { Plan2D } from './plan2d';
import type { View3D } from './view3d';
import type { OpeningType } from './types';

const $ = (id: string) => document.getElementById(id)!;
const NARROW = window.matchMedia('(max-width: 1180px)');
export const COARSE = window.matchMedia('(pointer: coarse)');

// ------------------------------------------------------------------ Seitenleisten

export const panels = {
  left: !NARROW.matches,
  right: !NARROW.matches,
  apply: () => {},
  narrow: () => NARROW.matches,
};

export function initPanels(onResize: () => void) {
  const main = $('main');
  const bl = $('btnLeft');
  const br = $('btnRight');
  panels.apply = () => {
    main.classList.toggle('left-closed', !panels.left);
    main.classList.toggle('right-closed', !panels.right);
    bl.setAttribute('aria-pressed', String(panels.left));
    br.setAttribute('aria-pressed', String(panels.right));
    requestAnimationFrame(onResize);
  };
  bl.onclick = () => {
    panels.left = !panels.left;
    if (panels.left && NARROW.matches) panels.right = false;
    panels.apply();
  };
  br.onclick = () => {
    panels.right = !panels.right;
    if (panels.right && NARROW.matches) panels.left = false;
    panels.apply();
  };
  // Auf schmalen Bildschirmen schließen sich die Leisten, sobald man in den Plan oder in 3D tippt
  $('views').addEventListener('pointerdown', () => {
    if (NARROW.matches && (panels.left || panels.right)) {
      panels.left = panels.right = false;
      panels.apply();
    }
  }, { capture: true });
  NARROW.addEventListener('change', () => {
    panels.left = panels.right = !NARROW.matches;
    panels.apply();
  });
  panels.apply();
}

/** Nach dem Einfügen eines Möbels auf schmalen Bildschirmen den Plan freigeben. */
export function afterInsert() {
  if (NARROW.matches && panels.left) {
    panels.left = false;
    panels.apply();
  }
}

export function openProps() {
  panels.right = true;
  if (NARROW.matches) panels.left = false;
  panels.apply();
}

// ------------------------------------------------------------------ Datei-Menü (schmale Bildschirme)

export function initMenu() {
  $('btnMenu').onclick = () => {
    const act = (id: string) => () => {
      closeModal();
      setTimeout(() => ($(id) as HTMLButtonElement).click(), 0);
    };
    openModal(
      h('div', {},
        h('h2', {}, 'Projekt'),
        h('div', { class: 'list' },
          menuLi('Neues Projekt', 'Leeren Plan beginnen', act('btnNew')),
          menuLi('Öffnen …', 'Projektdatei (.json) laden, z.B. aus der Dateien-App', act('btnOpen')),
          menuLi('Speichern …', 'Projekt als Datei sichern oder teilen', act('btnSave')),
          menuLi('Bild', 'Aktuelle Ansicht als Bild', act('btnShot')),
        ),
        h('div', { class: 'btnrow', style: 'justify-content:flex-end' }, h('button', { onclick: closeModal }, 'Schließen')),
      ),
    );
  };
}

function menuLi(title: string, desc: string, onclick: () => void) {
  return h('div', { class: 'li', onclick }, h('div', {}, h('div', { style: 'font-weight:600' }, title), h('div', { class: 'muted', style: 'font-size:12px' }, desc)));
}

// ------------------------------------------------------------------ Wand-Leiste

/** Leiste unter dem Plan, solange das Wand-Werkzeug aktiv ist: Länge eintippen + Richtung antippen. */
export function initWallBar(plan: Plan2D) {
  const bar = $('wallbar');
  const lenIn = h('input', { type: 'text', class: 'lenin', inputMode: 'decimal', placeholder: 'Länge, z.B. 3,45m', id: 'wallLen' }) as HTMLInputElement;
  lenIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') lenIn.blur();
  });
  const info = h('span', { class: 'lbl' });
  const add = (deg: number) => {
    const L = parseLength(lenIn.value);
    if (!L || L <= 0) {
      lenIn.focus();
      info.textContent = 'Erst Länge eingeben';
      return;
    }
    plan.addSegment(L, deg);
    lenIn.select();
  };
  const dirBtn = (label: string, deg: number, title: string) => h('button', { title, onclick: () => add(deg) }, label);
  const undoBtn = h('button', { title: 'Letzten Punkt entfernen', onclick: () => plan.undoPoint() }, '↶ Punkt');
  const closeBtn = h('button', { onclick: () => plan.closeChain() }, 'Raum schließen') as HTMLButtonElement;
  const doneBtn = h('button', { class: 'primary', onclick: () => { plan.finishWalls(); plan.setTool('select'); } }, 'Fertig') as HTMLButtonElement;
  put(bar,
    info,
    lenIn,
    h('div', { class: 'dirs' },
      dirBtn('→', 0, 'nach rechts'),
      dirBtn('↓', 270, 'nach unten'),
      dirBtn('←', 180, 'nach links'),
      dirBtn('↑', 90, 'nach oben'),
    ),
    undoBtn,
    closeBtn,
    doneBtn,
  );
  let last = '';
  plan.onChainChange = () => {
    const show = plan.tool === 'wall';
    if (bar.hidden === show) bar.hidden = !show;
    if (!show) return;
    const n = plan.chainCount;
    const key = String(n);
    if (key === last) return;
    last = key;
    info.textContent = n === 0 ? 'Startpunkt antippen – oder gleich Länge + Richtung:' : `${n} Punkt${n === 1 ? '' : 'e'} · nächste Wand:`;
    closeBtn.disabled = n < 3;
    (undoBtn as HTMLButtonElement).disabled = n === 0;
  };
}

// ------------------------------------------------------------------ Auswahl-Leiste

/** Schnellaktionen für die Auswahl, unten im Plan (für Finger statt Tastenkürzel). */
export function initSelectionBar(plan: Plan2D) {
  const bar = $('selbar');
  const render = () => {
    const s = store.selection;
    const show = !!s && plan.tool === 'select' && (COARSE.matches || !panels.right);
    bar.hidden = !show;
    if (!show || !s) return;
    bar.innerHTML = '';
    const propsBtn = h('button', { onclick: openProps }, 'Eigenschaften');
    const del = h('button', { class: 'danger', onclick: () => plan.deleteSelection() }, 'Löschen');
    if (s.kind === 'item') {
      const it = store.item(s.id);
      if (!it) return;
      const rot = (d: number) => () => store.update((p) => {
        const x = p.items.find((i) => i.id === s.id)!;
        rotateItemTo(x, x.rot + d, stackedOn(p, x));
      });
      put(bar,
        h('span', { class: 'lbl' }, it.name.length > 22 ? it.name.slice(0, 21) + '…' : it.name),
        h('button', { title: '90° nach links drehen', onclick: rot(-90) }, '⟲'),
        h('button', { title: '15° drehen', onclick: rot(15) }, '15°'),
        h('button', { title: '90° nach rechts drehen', onclick: rot(90) }, '⟳'),
        h('button', { onclick: () => duplicateItem(s.id) }, 'Kopie'),
        propsBtn,
        del,
      );
    } else if (s.kind === 'wall') {
      const w = store.wall(s.id);
      if (!w) return;
      const addOp = (type: OpeningType) => () => {
        const L = wallLength(w);
        const def = type === 'window' ? { width: 100, height: 135, sill: 90 } : { width: 90, height: 205, sill: 0 };
        const o = { id: uid(), wallId: w.id, type, offset: L / 2, ...def, width: Math.min(def.width, L - 10) };
        store.update((p) => p.openings.push(o));
        store.select({ kind: 'opening', id: o.id });
      };
      put(bar,
        h('span', { class: 'lbl' }, `Wand ${fmtLen(wallLength(w))}`),
        h('button', { onclick: () => plan.splitWall(s.id) }, 'Teilen'),
        h('button', { onclick: addOp('window') }, '+ Fenster'),
        h('button', { onclick: addOp('door') }, '+ Tür'),
        propsBtn,
        del,
      );
    } else {
      const label = s.kind === 'room' ? store.room(s.id)?.name ?? 'Raum' : 'Öffnung';
      put(bar, h('span', { class: 'lbl' }, label), propsBtn, s.kind === 'room' ? null : del);
    }
  };
  store.onSelect(render);
  store.on(() => {
    // Name/Länge aktualisieren, aber nicht bei jedem Ziehschritt neu aufbauen
    if (!bar.hidden) requestAnimationFrame(render);
  });
  const origSetTool = plan.onToolChange;
  plan.onToolChange = (t) => {
    origSetTool(t);
    render();
  };
  COARSE.addEventListener('change', render);
  render();
  return render;
}

// ------------------------------------------------------------------ Joystick

export function initJoystick(view: View3D) {
  const joy = $('joystick');
  const knob = joy.querySelector('.knob') as HTMLElement;
  let active: number | null = null;
  const R = 50;
  const set = (dx: number, dy: number) => {
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    view.joy.x = dx / R;
    view.joy.y = -dy / R;
    view.invalidate();
  };
  const center = () => {
    const r = joy.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  joy.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    active = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    const c = center();
    set(e.clientX - c.x, e.clientY - c.y);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    const c = center();
    set(e.clientX - c.x, e.clientY - c.y);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    set(0, 0);
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
  return (walk: boolean) => {
    joy.hidden = !walk;
    if (!walk) set(0, 0);
  };
}

// ------------------------------------------------------------------ Speichern

/** Projekt sichern: Teilen-Dialog (iPad: „In Dateien sichern“), Download oder Text zum Kopieren. */
export async function saveProject(name: string, json: string, status: (s: string) => void, download: (n: string, d: string) => void) {
  const fileName = `${name}.raumplan.json`;
  let shared = false;
  try {
    const file = new File([json], fileName, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (COARSE.matches && nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      shared = true;
      status('Projekt geteilt bzw. gesichert.');
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  if (shared) return;
  download(fileName, json);
  const ta = h('textarea', { id: 'saveText', readOnly: true, style: 'width:100%;height:200px;font:12px ui-monospace,monospace;border:1px solid var(--line);border-radius:8px;padding:8px' }, json) as HTMLTextAreaElement;
  openModal(
    h('div', {},
      h('h2', {}, 'Projekt gespeichert'),
      h('p', { class: 'hint' }, `Die Datei „${fileName}“ wurde heruntergeladen. Falls kein Download startet, kannst du den Text kopieren und als .json-Datei sichern – „Öffnen“ liest beides wieder ein.`),
      ta,
      h('div', { class: 'btnrow', style: 'justify-content:flex-end' },
        h('button', { onclick: () => navigator.clipboard?.writeText(json).then(() => status('Projekt in die Zwischenablage kopiert.'), () => { ta.focus(); ta.select(); }) }, 'Text kopieren'),
        h('button', { class: 'primary', onclick: closeModal }, 'Fertig'),
      ),
    ),
  );
}
