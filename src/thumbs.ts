// Vorschaubilder für Katalog-Einträge (offscreen gerendert).
import * as THREE from 'three';
import type { ItemSpec } from './types';
import { buildModel, disposeGroup } from './models';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
const cache = new Map<string, string>();
const queue: { spec: ItemSpec; cb: (url: string) => void }[] = [];
let busy = false;

function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(200, 150);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 200 / 150, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a898, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(3, 5, 4);
  scene.add(d);
}

export function thumbnail(spec: ItemSpec, cb: (url: string) => void) {
  const key = JSON.stringify([spec.type, spec.w, spec.d, spec.h, spec.color, spec.color2, spec.finish, spec.params]);
  const c = cache.get(key);
  if (c) {
    cb(c);
    return;
  }
  queue.push({
    spec,
    cb: (u) => {
      cache.set(key, u);
      cb(u);
    },
  });
  pump();
}

function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    const job = queue.shift();
    if (!job) {
      busy = false;
      return;
    }
    try {
      job.cb(render(job.spec));
    } catch {
      job.cb('');
    }
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

export function render(spec: ItemSpec, w = 200, h = 150, angle = 0.65): string {
  init();
  renderer!.setSize(w, h);
  camera.aspect = w / h;
  const g = buildModel(spec);
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z, 0.05) * 0.5;
  const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.05;
  const flat = size.y < 0.05;
  const dir = flat ? new THREE.Vector3(0.0, 1, 0.35).normalize() : new THREE.Vector3(Math.sin(angle), 0.55, Math.cos(angle)).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer!.render(scene, camera);
  const url = renderer!.domElement.toDataURL('image/png');
  scene.remove(g);
  disposeGroup(g);
  return url;
}
