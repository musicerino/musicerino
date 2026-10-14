// Dialog „Möbel nach Maß“: eigene Maße → prozedurales 3D-Modell.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { h, put, numField, paramField, textField, selectField, colorField, openModal, closeModal } from './dom';
import { TYPE_INFO, FINISHES, CATALOG, COLORS } from './catalog';
import type { CatalogEntry, Item, ItemSpec, ModelType, Finish } from './types';
import { buildModel, disposeGroup } from './models';
import { store } from './store';
import { uid } from './geometry';
import type { Ctx } from './panels';

const PALETTE = Object.values(COLORS).slice(0, 14);

function defaultsFor(type: ModelType): Omit<ItemSpec, 'type'> {
  const e = CATALOG.find((c) => c.type === type);
  const params: Record<string, number> = {};
  for (const p of TYPE_INFO[type].params ?? []) params[p.key] = p.def;
  if (e) return { w: e.w, d: e.d, h: e.h, color: e.color, color2: e.color2, finish: e.finish, params: { ...params, ...e.params } };
  return { w: 80, d: 40, h: 80, color: COLORS.weiss, color2: COLORS.eiche, finish: 'lack', params };
}

/**
 * Öffnet den Dialog. Mit `edit` wird ein vorhandenes Möbel bearbeitet,
 * sonst wird ein neues erzeugt (und optional im Katalog gespeichert).
 */
export function openCustomFurniture(ctx: Ctx, edit?: Item) {
  const type0: ModelType = edit?.type ?? 'dresser';
  const spec: ItemSpec & { name: string; mount: number } = edit
    ? { name: edit.name, type: edit.type, w: edit.w, d: edit.d, h: edit.h, color: edit.color, color2: edit.color2, finish: edit.finish, params: { ...edit.params }, mount: edit.mount ?? 0 }
    : { name: 'Mein Möbel', type: type0, ...defaultsFor(type0), mount: 0 };

  // --- 3D-Vorschau
  const host = h('div', { class: 'preview3d' });
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a898, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 2.4);
  dl.position.set(2, 4, 3);
  dl.castShadow = true;
  scene.add(dl);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  let model: THREE.Group | null = null;
  let alive = true;
  const dims = h('div', { class: 'hint', style: 'text-align:center' });
  const rebuild = (refit = false) => {
    if (model) {
      scene.remove(model);
      disposeGroup(model);
    }
    model = buildModel(spec);
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    if (refit) {
      const r = Math.max(size.x, size.y, size.z) * 0.6 + 0.1;
      controls.target.copy(c);
      cam.position.set(c.x + r * 1.6, c.y + r * 1.1, c.z + r * 2.2);
      dl.shadow.camera.left = dl.shadow.camera.bottom = -r * 2;
      dl.shadow.camera.right = dl.shadow.camera.top = r * 2;
      dl.shadow.camera.updateProjectionMatrix();
    }
    dims.textContent = `${spec.w} × ${spec.d} × ${spec.h} cm (B × T × H) · ziehen zum Drehen`;
  };
  const loop = () => {
    if (!alive) return;
    requestAnimationFrame(loop);
    const w = host.clientWidth || 300;
    const hh = host.clientHeight || 260;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, hh);
      cam.aspect = w / hh;
      cam.updateProjectionMatrix();
    }
    controls.update();
    renderer.render(scene, cam);
  };
  host.append(renderer.domElement);

  // --- Formular
  const form = h('div', {});
  const renderForm = () => {
    form.innerHTML = '';
    const info = TYPE_INFO[spec.type];
    put(form,
      h('div', { class: 'grid2' },
        textField('Bezeichnung', spec.name, (v) => (spec.name = v)),
        selectField('Typ / Bauform', spec.type, (Object.keys(TYPE_INFO) as ModelType[]).map((t) => ({ value: t, label: TYPE_INFO[t].label })), (v) => {
          const t = v as ModelType;
          const keepDims = { w: spec.w, d: spec.d, h: spec.h };
          Object.assign(spec, { type: t, ...defaultsFor(t) });
          if (edit) Object.assign(spec, keepDims);
          renderForm();
          rebuild(true);
        }),
      ),
      h('h4', {}, 'Maße'),
      h('div', { class: 'grid3' },
        numField('Breite', spec.w, (v) => { spec.w = v; rebuild(true); }, { unit: 'cm', min: 1, max: 2000, length: true }),
        numField('Tiefe', spec.d, (v) => { spec.d = v; rebuild(true); }, { unit: 'cm', min: 0.5, max: 2000, length: true }),
        numField('Höhe', spec.h, (v) => { spec.h = v; rebuild(true); }, { unit: 'cm', min: 0.5, max: 1000, length: true }),
      ),
      numField('Montagehöhe über Boden (z.B. Hängeschrank)', spec.mount, (v) => (spec.mount = v), { unit: 'cm', min: 0, max: 500, length: true }),
      info.params?.length
        ? h('div', {}, h('h4', {}, 'Aufbau'), h('div', { class: 'grid2' }, ...info.params.map((p) => paramField(p, spec.params[p.key] ?? p.def, (v) => { spec.params[p.key] = v; rebuild(); }))))
        : null,
      h('h4', {}, 'Aussehen'),
      selectField('Oberfläche', spec.finish, FINISHES.map((f) => ({ value: f.id, label: f.label })), (v) => { spec.finish = v as Finish; rebuild(); }),
      h('div', { style: 'height:6px' }),
      colorField('Hauptfarbe', spec.color, (v) => { spec.color = v; renderForm(); rebuild(); }, PALETTE),
      h('div', { style: 'height:6px' }),
      colorField('Akzent (Griffe, Beine, Bettwäsche, Arbeitsplatte …)', spec.color2, (v) => { spec.color2 = v; renderForm(); rebuild(); }, PALETTE),
    );
  };
  renderForm();
  rebuild(true);
  loop();

  const finish = (mode: 'place' | 'save' | 'both' | 'apply') => {
    const entry: CatalogEntry = {
      id: 'custom-' + uid(),
      name: spec.name || 'Eigenes Möbel',
      desc: `${TYPE_INFO[spec.type].label}, nach Maß`,
      category: 'Meine Möbel',
      type: spec.type,
      w: spec.w,
      d: spec.d,
      h: spec.h,
      color: spec.color,
      color2: spec.color2,
      finish: spec.finish,
      params: { ...spec.params },
      mount: spec.mount || undefined,
      custom: true,
    };
    if (mode === 'apply' && edit) {
      store.update((p) => {
        const it = p.items.find((i) => i.id === edit.id);
        if (!it) return;
        Object.assign(it, { name: entry.name, type: entry.type, w: entry.w, d: entry.d, h: entry.h, color: entry.color, color2: entry.color2, finish: entry.finish, params: entry.params, mount: spec.mount });
      });
    }
    if (mode === 'save' || mode === 'both') store.update((p) => p.customCatalog.unshift(entry));
    if (mode === 'place' || mode === 'both') ctx.plan.placeEntry(entry);
    close();
    ctx.status(mode === 'save' ? `„${entry.name}“ unter „Meine Möbel“ gespeichert.` : `„${entry.name}“ eingefügt.`);
  };
  const close = () => {
    alive = false;
    controls.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    if (model) disposeGroup(model);
    closeModal();
  };

  openModal(
    h('div', {},
      h('h2', {}, edit ? 'Möbel bearbeiten' : 'Möbel nach Maß'),
      h('div', { class: 'custom-grid' },
        form,
        h('div', {}, host, dims, h('p', { class: 'hint' }, 'Tipp: Für Dinge, die es nicht als Typ gibt, „Quader“ oder „Zylinder“ wählen und Maße/Farbe anpassen – damit lassen sich auch Kamine, Nischen, Podeste oder Geräte nachbauen.')),
      ),
      h('div', { class: 'btnrow', style: 'justify-content:flex-end;margin-top:12px' },
        h('button', { onclick: close }, 'Abbrechen'),
        edit ? h('button', { class: 'primary', onclick: () => finish('apply') }, 'Übernehmen') : null,
        edit ? h('button', { onclick: () => finish('save') }, 'Zusätzlich in „Meine Möbel“ speichern') : null,
        !edit ? h('button', { onclick: () => finish('save') }, 'Nur im Katalog speichern') : null,
        !edit ? h('button', { onclick: () => finish('place') }, 'Einfügen') : null,
        !edit ? h('button', { class: 'primary', onclick: () => finish('both') }, 'Speichern & einfügen') : null,
      ),
    ),
    () => {
      alive = false;
      renderer.dispose();
    },
  );
}
