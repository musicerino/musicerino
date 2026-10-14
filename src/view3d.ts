import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { store, newItemFromEntry } from './store';
import type { Item, Opening, Project, Wall, P } from './types';
import { buildModel, disposeGroup } from './models';
import { surfaceMaterial, setMaxAnisotropy, finishMaterial } from './textures';
import { wallLength, same, bounds, pointInPolygon, perp, wallDir, sub, add, mul, cross } from './geometry';
import type { Overlay } from './shared';
import { siteSun, planDirForBearing } from './sun';
import { stackedOn, moveItemTo, settings, supportAt, snapItemToWall, placementAt } from './ops';
import type { CatalogEntry, BaseboardProfile } from './types';
import { allRuns, type Run } from './baseboards';
import { claddingRects } from './claddings';
import { isTech } from './catalog';

const S = 0.01; // cm → m

export class View3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7d6b, 0.6);
  root = new THREE.Group();
  wallGroup = new THREE.Group();
  floorGroup = new THREE.Group();
  ceilGroup = new THREE.Group();
  itemGroup = new THREE.Group();
  helperGroup = new THREE.Group();
  heatGroup = new THREE.Group();
  ground: THREE.Mesh;
  sunMarker: THREE.Mesh;
  sunPath: THREE.Line | null = null;
  selBox = new THREE.BoxHelper(new THREE.Object3D(), 0x2f7cf6);
  lampLights: THREE.PointLight[] = [];
  private itemCache = new Map<string, { key: string; obj: THREE.Group }>();
  private needsRender = true;
  private raycaster = new THREE.Raycaster();
  private wallMeshes: { group: THREE.Group; wall: Wall; ext: boolean; inside: number }[] = [];
  private center = new THREE.Vector3();
  private radius = 6;
  mode: 'orbit' | 'walk' = 'orbit';
  showSunPath = true;
  cutaway = true;
  private keys = new Set<string>();
  /** Bewegung vom Touch-Joystick: x = seitwärts, y = vorwärts, jeweils -1…1 */
  joy = { x: 0, y: 0 };
  private lastT = performance.now();
  private drag: { item: Item; children: Item[]; startX: number; startY: number; moved: boolean; offset: P } | null = null;
  private walkLook: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private yaw = 0;
  private pitch = 0;
  onStatus: (s: string) => void = () => {};
  private lastFit = '';

  constructor(public container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.camera.position.set(4, 9, 11);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.invalidate());

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xa9b29b, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.003;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.sunMarker = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
    this.helperGroup.add(this.sunMarker);

    this.root.add(this.floorGroup, this.wallGroup, this.ceilGroup, this.itemGroup, this.heatGroup);
    this.scene.add(this.root, this.helperGroup, this.selBox);
    this.selBox.visible = false;

    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 6, 1.6);
      l.visible = false;
      this.lampLights.push(l);
      this.scene.add(l);
    }

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.bindEvents();
    store.on(() => this.rebuild());
    store.onSelect(() => this.updateSelection());
    this.rebuild();
    this.fitView();
    const loop = () => {
      requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  invalidate() {
    this.needsRender = true;
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.mode === 'walk') {
      this.walkStep(dt);
    } else {
      this.controls.update();
    }
    if (!this.needsRender) return;
    if (!this.container.offsetParent) return; // unsichtbar
    this.needsRender = false;
    this.updateCutaway();
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ Aufbau

  rebuild() {
    const p = store.project;
    this.buildWalls(p);
    this.buildFloors(p);
    this.buildItems(p);
    this.updateSun();
    this.updateSelection();
    const key = JSON.stringify(p.walls.map((w) => [w.a, w.b]));
    if (key !== this.lastFit && this.lastFit === '') this.lastFit = key;
    this.invalidate();
  }

  private allPoints(p: Project): P[] {
    const pts: P[] = [];
    for (const w of p.walls) pts.push(w.a, w.b);
    for (const r of p.rooms) pts.push(...r.points);
    for (const it of p.items) pts.push({ x: it.x, y: it.y });
    return pts;
  }

  fitView() {
    this.buildWallsBoundsOnly();
    this.setCameraPreset('iso');
  }

  private buildWallsBoundsOnly() {
    const pts = this.allPoints(store.project);
    if (!pts.length) pts.push({ x: -300, y: -300 }, { x: 300, y: 300 });
    const b = bounds(pts);
    this.center.set(((b.minX + b.maxX) / 2) * S, 0, ((b.minY + b.maxY) / 2) * S);
    this.radius = Math.max(3, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * S * 0.5 + 1);
  }

  private clearGroup(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      disposeGroup(c);
    }
  }

  /** Fußleisten-Profil (Querschnitt: Tiefe × Höhe) entlang der Länge extrudiert. */
  private baseboardMesh(run: Run, t: number): THREE.Mesh {
    const d = Math.max(0.002, run.style.depth * S);
    const h = Math.max(0.005, run.style.height * S);
    const len = Math.max(0.005, (run.s1 - run.s0) * S);
    const sh = new THREE.Shape();
    const profile: BaseboardProfile = run.style.profile;
    sh.moveTo(0, 0);
    sh.lineTo(d, 0);
    if (profile === 'rund') {
      const r = Math.min(d * 0.95, h * 0.5);
      sh.lineTo(d, h - r);
      sh.quadraticCurveTo(d, h, d - r, h);
    } else if (profile === 'klassisch') {
      sh.lineTo(d, h * 0.62);
      sh.lineTo(d * 0.72, h * 0.66);
      sh.quadraticCurveTo(d * 0.72, h * 0.86, d * 0.38, h * 0.9);
      sh.lineTo(d * 0.38, h);
    } else {
      const c = Math.min(d * 0.35, 0.003);
      sh.lineTo(d, h - c);
      sh.lineTo(d - c, h);
    }
    sh.lineTo(0, h);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 6 });
    // Extrusionsrichtung auf die Wandrichtung drehen, Profil zur jeweiligen Wandseite
    geo.rotateY(run.side === 1 ? -Math.PI / 2 : Math.PI / 2);
    const mesh = new THREE.Mesh(geo, finishMaterial(run.style.finish, run.style.color));
    mesh.position.set((run.side === 1 ? run.s1 : run.s0) * S, 0, run.side * (t / 2 + (run.offset ?? 0) * S));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.baseboard = run.pieceId ?? run.roomId;
    return mesh;
  }

  private buildWalls(p: Project) {
    this.clearGroup(this.wallGroup);
    this.clearGroup(this.ceilGroup);
    this.wallMeshes = [];
    const runsByWall = new Map<string, Run[]>();
    for (const r of allRuns(p)) {
      const list = runsByWall.get(r.wall.id) ?? [];
      list.push(r);
      runsByWall.set(r.wall.id, list);
    }
    const pts = this.allPoints(p);
    if (pts.length) {
      const b = bounds(pts);
      this.center.set(((b.minX + b.maxX) / 2) * S, 0, ((b.minY + b.maxY) / 2) * S);
      this.radius = Math.max(3, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * S * 0.5 + 1);
    }
    p.walls.forEach((w, idx) => {
      const L = wallLength(w) * S;
      if (L < 0.01) return;
      const t = w.thickness * S;
      const H = w.height * S + idx * 0.0002;
      // Innen/Außen bestimmen
      const mid = mul(add(w.a, w.b), 0.5);
      const n = perp(wallDir(w));
      const off = w.thickness / 2 + 8;
      const inA = p.rooms.some((r) => pointInPolygon(add(mid, mul(n, off)), r.points));
      const inB = p.rooms.some((r) => pointInPolygon(add(mid, mul(n, -off)), r.points));
      const outside: 1 | -1 = inA && !inB ? -1 : !inA && inB ? 1 : -1;
      const connA = p.walls.some((o) => o !== w && (same(o.a, w.a) || same(o.b, w.a)));
      const connB = p.walls.some((o) => o !== w && (same(o.a, w.b) || same(o.b, w.b)));
      const e0 = connA ? t / 2 : 0;
      const e1 = connB ? t / 2 : 0;
      const shape = new THREE.Shape();
      shape.moveTo(-e0, 0);
      shape.lineTo(L + e1, 0);
      shape.lineTo(L + e1, H);
      shape.lineTo(-e0, H);
      shape.closePath();
      const ops = p.openings.filter((o) => o.wallId === w.id);
      for (const o of ops) {
        const x0 = Math.max(0.01, (o.offset - o.width / 2) * S);
        const x1 = Math.min(L - 0.01, (o.offset + o.width / 2) * S);
        const y0 = Math.max(0, o.sill * S);
        const y1 = Math.min(H - 0.02, (o.sill + o.height) * S);
        if (x1 - x0 < 0.02 || y1 - y0 < 0.02) continue;
        const hole = new THREE.Path();
        // Öffnungen, die bis zum Boden reichen: minimal anheben, damit die Lochkontur gültig bleibt
        const yy0 = y0 < 0.001 ? 0.0005 : y0;
        hole.moveTo(x0, yy0);
        hole.lineTo(x0, y1);
        hole.lineTo(x1, y1);
        hole.lineTo(x1, yy0);
        hole.closePath();
        shape.holes.push(hole);
      }
      const g = new THREE.Group();
      if (w.kind === 'glass') {
        g.add(this.buildGlassWall(L, H, t, ops));
      } else {
        const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, steps: 1 });
        const mat = w.material ? surfaceMaterial(w.material.kind, w.material.color) : surfaceMaterial(p.wallMat.kind, p.wallMat.color);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = -t / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.wallId = w.id;
        g.add(mesh);
        // Verkleidungen (Fliesen, Paneele …) auf Teilflächen
        for (const c of p.claddings) {
          if (c.wallId !== w.id) continue;
          const th = Math.max(0.001, c.thickness * S);
          const cm = surfaceMaterial(c.material.kind, c.material.color);
          for (const r of claddingRects(p, c)) {
            const sh = new THREE.Shape();
            sh.moveTo(r.s0 * S, r.z0 * S);
            sh.lineTo(r.s1 * S, r.z0 * S);
            sh.lineTo(r.s1 * S, Math.min(r.z1 * S, H));
            sh.lineTo(r.s0 * S, Math.min(r.z1 * S, H));
            sh.closePath();
            const cmesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }), cm);
            cmesh.position.z = c.side === 1 ? t / 2 : -t / 2 - th;
            cmesh.castShadow = true;
            cmesh.receiveShadow = true;
            cmesh.userData.cladding = c.id;
            g.add(cmesh);
          }
        }
      }
      for (const o of ops) g.add(this.buildOpening(o, t, w.height * S, outside));
      for (const run of runsByWall.get(w.id) ?? []) g.add(this.baseboardMesh(run, t));
      const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
      g.position.set(w.a.x * S, 0, w.a.y * S);
      g.rotation.y = -ang;
      this.wallGroup.add(g);
      this.wallMeshes.push({ group: g, wall: w, ext: inA !== inB, inside: inA ? 1 : inB ? -1 : 0 });
    });
    // Decke (wirft Schatten, im Orbit-Modus unsichtbar)
    const ceilMat = this.mode === 'walk' ? new THREE.MeshStandardMaterial({ color: p.ceilingColor, roughness: 0.95, side: THREE.DoubleSide }) : new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    const polys = p.rooms.length ? p.rooms.map((r) => r.points) : [];
    for (const poly of polys) {
      const h = Math.max(...p.walls.map((w) => w.height), p.defaults.wallHeight) * S;
      const mesh = new THREE.Mesh(this.polyGeometry(poly), ceilMat);
      mesh.position.y = h;
      mesh.castShadow = true;
      this.ceilGroup.add(mesh);
      const slab = new THREE.Mesh(this.polyGeometry(poly), ceilMat);
      slab.position.y = h + 0.12;
      slab.castShadow = true;
      this.ceilGroup.add(slab);
    }
  }

  /** Glastrennwand im Loft-Stil: schwarze Stahlprofile, Glasfelder (lassen Licht durch). */
  private buildGlassWall(L: number, H: number, t: number, ops: Opening[]): THREE.Group {
    const g = new THREE.Group();
    const steel = finishMaterial('metall', '#1f2022');
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.03, transparent: true, opacity: 0.16, depthWrite: false });
    const fd = Math.min(0.05, t);
    const pw = 0.04;
    const box = (x0: number, x1: number, y0: number, y1: number, m: THREE.Material, d = fd) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.002, x1 - x0), Math.max(0.002, y1 - y0), d), m);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      mesh.castShadow = !m.transparent;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    // Abschnitte zwischen Türen/Durchgängen
    const gaps = ops.map((o) => [(o.offset - o.width / 2) * S, (o.offset + o.width / 2) * S] as [number, number]).sort((a, b) => a[0] - b[0]);
    const segs: [number, number][] = [];
    let cur = 0;
    for (const [a, b] of gaps) {
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < L) segs.push([cur, L]);
    box(0, L, H - pw, H, steel);
    for (const [a, b] of segs) {
      box(a, b, 0, pw, steel);
      box(a, b, 0.9, 0.9 + pw * 0.75, steel);
      const n = Math.max(1, Math.round((b - a) / 0.9));
      const step = (b - a) / n;
      for (let i = 0; i <= n; i++) {
        const x = a + i * step;
        box(Math.max(a, x - pw / 2), Math.min(b, x + pw / 2), 0, H, steel);
      }
      box(a, b, pw, H - pw, glass, 0.008);
    }
    return g;
  }

  private buildOpening(o: Opening, t: number, wallH: number, outside: 1 | -1 = -1): THREE.Group {
    const g = new THREE.Group();
    if (o.overhang && o.overhang > 0) {
      // Balkon / Vordach darüber (außen, auf Deckenhöhe)
      const od = o.overhang * S;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(o.width * S + 0.6, 0.18, od), finishMaterial('lack', '#b9b7b2'));
      slab.position.set(o.offset * S, wallH + 0.09, outside * (t / 2 + od / 2));
      slab.castShadow = true;
      slab.receiveShadow = true;
      g.add(slab);
    }
    if (o.type === 'passage') {
      // Durchgang ohne Tür; mit Brüstung als Durchreiche mit Ablage
      if (o.sill > 5) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(o.width * S + 0.04, 0.03, t + 0.06), finishMaterial('holz', '#c9a374'));
        board.position.set(o.offset * S, o.sill * S - 0.015, 0);
        board.castShadow = true;
        board.receiveShadow = true;
        g.add(board);
      }
      return g;
    }
    const w = o.width * S;
    const h = Math.min(o.height * S, wallH - 0.02);
    const x = o.offset * S;
    const y0 = o.sill * S;
    const frameMat = finishMaterial('lack', o.frameColor ?? '#f4f4f2');
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.03, transparent: true, opacity: 0.18, depthWrite: false });
    const fw = 0.065;
    const fd = Math.min(0.08, t);
    const box = (bw: number, bh: number, bd: number, m: THREE.Material, cx: number, cy: number, cz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m);
      mesh.position.set(cx, cy + bh / 2, cz);
      mesh.castShadow = !m.transparent;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    if (o.type === 'door') {
      // Zarge
      const zd = t + 0.02;
      box(0.04, h, zd, frameMat, x - w / 2 + 0.02, y0);
      box(0.04, h, zd, frameMat, x + w / 2 - 0.02, y0);
      box(w, 0.04, zd, frameMat, x, y0 + h - 0.04);
      // Türblatt (geschlossen)
      const side = o.swingOut ? -1 : 1;
      const leaf = box(w - 0.08, h - 0.05, 0.04, frameMat, x, y0 + 0.005, side * (t / 2 - 0.02));
      leaf.userData.door = true;
      const handleX = o.hingeRight ? x - w / 2 + 0.12 : x + w / 2 - 0.12;
      const hm = finishMaterial('metall', '#b9bcbe');
      for (const s of [-1, 1]) box(0.12, 0.018, 0.02, hm, handleX + (o.hingeRight ? 0.04 : -0.04), y0 + 1.03, side * (t / 2 - 0.02) + s * 0.035);
      return g;
    }
    // Fenster / Fenstertür
    box(fw, h, fd, frameMat, x - w / 2 + fw / 2, y0);
    box(fw, h, fd, frameMat, x + w / 2 - fw / 2, y0);
    box(w, fw, fd, frameMat, x, y0);
    box(w, fw, fd, frameMat, x, y0 + h - fw);
    const wings = w > 1.25 ? 2 : 1;
    if (wings === 2) box(fw * 1.2, h, fd, frameMat, x, y0);
    if (o.type === 'window' && h > 1.9) box(w, fw, fd, frameMat, x, y0 + h * 0.75);
    box(w - 2 * fw, h - 2 * fw, 0.012, glass, x, y0 + fw);
    if (o.type === 'window' && o.sill > 5) {
      // Fensterbank innen und außen
      box(w + 0.06, 0.025, t / 2 + 0.04, finishMaterial('glanz', '#f0efeb'), x, y0 - 0.025, t / 4 + 0.02);
      box(w + 0.04, 0.02, t / 2 + 0.05, finishMaterial('metall', '#9a9fa3'), x, y0 - 0.03, -t / 4 - 0.025);
    }
    return g;
  }

  private polyGeometry(pts: P[]): THREE.BufferGeometry {
    const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x * S, -q.y * S)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    // UVs in Metern (x, z)
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i);
      uv[i * 2 + 1] = pos.getZ(i);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }

  private buildFloors(p: Project) {
    this.clearGroup(this.floorGroup);
    if (p.rooms.length) {
      for (const r of p.rooms) {
        if (r.points.length < 3) continue;
        const mesh = new THREE.Mesh(this.polyGeometry(r.points), surfaceMaterial(r.floor.kind, r.floor.color));
        mesh.position.y = 0.0005;
        mesh.receiveShadow = true;
        mesh.userData.roomId = r.id;
        this.floorGroup.add(mesh);
      }
    } else if (p.walls.length) {
      const pts = p.walls.flatMap((w) => [w.a, w.b]);
      const b = bounds(pts);
      const poly = [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ];
      const mesh = new THREE.Mesh(this.polyGeometry(poly), surfaceMaterial('eiche', '#ffffff'));
      mesh.position.y = 0.0005;
      mesh.receiveShadow = true;
      this.floorGroup.add(mesh);
    }
  }

  private buildItems(p: Project) {
    const seen = new Set<string>();
    for (const it of p.items) {
      seen.add(it.id);
      // Heizkörper-Anschlussrohre hängen von der Montagehöhe ab
      const key = JSON.stringify([it.type, it.w, it.d, it.h, it.color, it.color2, it.finish, it.params, it.type === 'radiator' ? it.z : 0]);
      let c = this.itemCache.get(it.id);
      if (!c || c.key !== key) {
        if (c) {
          this.itemGroup.remove(c.obj);
          disposeGroup(c.obj);
        }
        const obj = buildModel(it);
        obj.userData.itemId = it.id;
        obj.traverse((o) => (o.userData.itemId = it.id));
        c = { key, obj };
        this.itemCache.set(it.id, c);
        this.itemGroup.add(obj);
      }
      c.obj.position.set(it.x * S, it.z * S, it.y * S);
      c.obj.rotation.y = (-it.rot * Math.PI) / 180;
    }
    for (const [id, c] of this.itemCache) {
      if (!seen.has(id)) {
        this.itemGroup.remove(c.obj);
        disposeGroup(c.obj);
        this.itemCache.delete(id);
      }
    }
  }

  updateSelection() {
    const s = store.selection;
    if (s && s.kind === 'item') {
      const c = this.itemCache.get(s.id);
      if (c) {
        this.selBox.setFromObject(c.obj);
        this.selBox.visible = true;
        this.invalidate();
        return;
      }
    }
    this.selBox.visible = false;
    this.invalidate();
  }

  // ------------------------------------------------------------------ Sonne

  updateSun() {
    const p = store.project;
    const site = p.site;
    const pos = siteSun(site);
    const alt = pos.altitude;
    const dir2 = planDirForBearing(site.north, pos.bearing);
    const altR = (Math.max(alt, -5) * Math.PI) / 180;
    const dir = new THREE.Vector3(dir2.x * Math.cos(altR), Math.sin(altR), dir2.y * Math.cos(altR)).normalize();
    const R = this.radius;
    this.sun.position.copy(this.center).addScaledVector(dir, R * 3 + 10);
    this.sun.target.position.copy(this.center);
    const cam = this.sun.shadow.camera;
    cam.left = -R * 1.2;
    cam.right = R * 1.2;
    cam.top = R * 1.2;
    cam.bottom = -R * 1.2;
    cam.near = 0.5;
    cam.far = R * 6 + 30;
    cam.updateProjectionMatrix();

    const day = THREE.MathUtils.smoothstep(alt, -4, 8);
    const warm = 1 - THREE.MathUtils.smoothstep(alt, 2, 30);
    // Nachbarbebauung/Bäume: unter der Horizonthöhe keine direkte Sonne
    const behindHorizon = alt < (site.horizon ?? 0);
    this.sun.intensity = behindHorizon ? 0 : 4.2 * THREE.MathUtils.smoothstep(alt, -0.5, 10);
    this.sun.color.setRGB(1, 0.94 - warm * 0.28, 0.86 - warm * 0.5);
    this.sun.visible = alt > -0.5;
    this.hemi.intensity = 0.08 + 0.42 * day;
    this.hemi.color.setRGB(0.75 + 0.1 * day, 0.82 + 0.06 * day, 1);
    this.scene.environmentIntensity = 0.05 + 0.15 * day;
    const night = new THREE.Color(0x0e1626);
    const dusk = new THREE.Color(0xf0a878);
    const sky = new THREE.Color(0xbcd6ec);
    const bg = night.clone().lerp(dusk, THREE.MathUtils.smoothstep(alt, -8, 0)).lerp(sky, THREE.MathUtils.smoothstep(alt, 2, 20));
    this.scene.background = bg;
    (this.ground.material as THREE.MeshStandardMaterial).color.setHex(0xa9b29b).multiplyScalar(0.4 + 0.6 * day);

    // Sonnenbahn + Marker
    this.sunMarker.visible = this.showSunPath && alt > -2;
    this.sunMarker.position.copy(this.center).addScaledVector(dir, R + 2);
    if (this.sunPath) {
      this.helperGroup.remove(this.sunPath);
      this.sunPath.geometry.dispose();
      this.sunPath = null;
    }
    if (this.showSunPath) {
      const pts: THREE.Vector3[] = [];
      for (let m = 0; m <= 1440; m += 10) {
        const sp = siteSun(site, m);
        if (sp.altitude < -1) continue;
        const d2 = planDirForBearing(site.north, sp.bearing);
        const a = (sp.altitude * Math.PI) / 180;
        pts.push(new THREE.Vector3(d2.x * Math.cos(a), Math.sin(a), d2.y * Math.cos(a)).multiplyScalar(R + 2).add(this.center));
      }
      if (pts.length > 1) {
        this.sunPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffb340, dashSize: 0.2, gapSize: 0.12 }));
        this.sunPath.computeLineDistances();
        this.helperGroup.add(this.sunPath);
      }
    }
    this.updateCompass();
    this.updateLamps(alt);
    this.invalidate();
  }

  private compass: THREE.Group | null = null;
  private compassKey = '';
  private updateCompass() {
    const p = store.project;
    const key = `${p.site.north}|${this.center.x}|${this.center.z}|${this.radius}`;
    if (key === this.compassKey) return;
    this.compassKey = key;
    if (this.compass) {
      this.helperGroup.remove(this.compass);
      disposeGroup(this.compass);
    }
    const g = new THREE.Group();
    const R = this.radius + 1.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.03, R, 96), new THREE.MeshBasicMaterial({ color: 0x55606b, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const labels: [string, number][] = [
      ['N', 0],
      ['O', 90],
      ['S', 180],
      ['W', 270],
    ];
    for (const [txt, bearing] of labels) {
      const d = planDirForBearing(p.site.north, bearing);
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = txt === 'N' ? '#d6453d' : '#33404d';
      ctx.beginPath();
      ctx.arc(64, 64, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, 64, 68);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
      spr.scale.set(0.6, 0.6, 0.6);
      spr.position.set(d.x * (R + 0.4), 0.3, d.y * (R + 0.4));
      g.add(spr);
    }
    g.position.set(this.center.x, 0.005, this.center.z);
    this.compass = g;
    this.helperGroup.add(g);
  }

  private updateLamps(alt: number) {
    const on = alt < 4;
    let i = 0;
    for (const [, c] of this.itemCache) {
      let isLamp = false;
      c.obj.traverse((o) => {
        if (o.userData.lampShade) {
          isLamp = true;
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (!o.userData.ownMat) {
            (o as THREE.Mesh).material = m.clone();
            o.userData.ownMat = true;
          }
          const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mm.emissive.setHex(0xffc27a);
          mm.emissiveIntensity = on ? 0.9 : 0;
        }
      });
      if (isLamp && on && i < this.lampLights.length) {
        const l = this.lampLights[i++];
        l.visible = true;
        l.intensity = 2.2;
        l.position.copy(c.obj.position);
        l.position.y += (c.obj.userData.lightY ?? 1.2) - 0.05;
      }
    }
    for (; i < this.lampLights.length; i++) this.lampLights[i].visible = false;
  }

  // ------------------------------------------------------------------ Wände ausblenden

  private fadeCache = new Map<THREE.Material, THREE.Material>();
  private faded(m: THREE.Material): THREE.Material {
    let f = this.fadeCache.get(m);
    if (!f) {
      f = m.clone();
      f.transparent = true;
      f.opacity = 0.13;
      f.depthWrite = false;
      this.fadeCache.set(m, f);
    }
    return f;
  }

  private updateCutaway() {
    const cam = this.camera.position;
    const camP = { x: cam.x / S, y: cam.z / S };
    const tgt = this.controls.target;
    const tgtP = { x: tgt.x / S, y: tgt.z / S };
    for (const wm of this.wallMeshes) {
      let fade = false;
      if (this.cutaway && this.mode === 'orbit') {
        const w = wm.wall;
        const n = perp(wallDir(w));
        const side = Math.sign((camP.x - w.a.x) * n.x + (camP.y - w.a.y) * n.y);
        if (wm.ext) fade = side !== 0 && side !== wm.inside;
        else fade = segmentsIntersect(camP, tgtP, w.a, w.b);
        // Bei Draufsicht nichts ausblenden
        if (cam.y - tgt.y > 0.93 * cam.distanceTo(tgt)) fade = false;
      }
      wm.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!mesh.userData.baseMat) mesh.userData.baseMat = mesh.material;
        const base = mesh.userData.baseMat as THREE.Material;
        mesh.material = fade && !base.transparent ? this.faded(base) : base;
      });
    }
  }

  // ------------------------------------------------------------------ Interaktion

  setMode(mode: 'orbit' | 'walk') {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'walk') {
      this.controls.enabled = false;
      const t = this.controls.target;
      const start = new THREE.Vector3(t.x, 1.6, t.z);
      // in einen Raum stellen
      const r = store.project.rooms[0];
      if (r) {
        const b = bounds(r.points);
        start.set(((b.minX + b.maxX) / 2) * S, 1.6, ((b.minY + b.maxY) / 2) * S);
      }
      this.camera.position.copy(start);
      this.yaw = Math.atan2(-(t.x - start.x), -(t.z - start.z));
      this.pitch = 0;
      this.applyLook();
      this.camera.fov = 70;
    } else {
      this.controls.enabled = true;
      this.camera.fov = 50;
      this.fitView();
    }
    this.camera.updateProjectionMatrix();
    this.buildWalls(store.project);
    this.invalidate();
  }

  private applyLook() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.invalidate();
  }

  private walkStep(dt: number) {
    if (!this.keys.size && !this.joy.x && !this.joy.y) return;
    const speed = (this.keys.has('shift') ? 3 : 1.4) * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3();
    if (this.keys.has('w') || this.keys.has('arrowup')) mv.add(fwd);
    if (this.keys.has('s') || this.keys.has('arrowdown')) mv.sub(fwd);
    if (this.keys.has('d')) mv.add(right);
    if (this.keys.has('a')) mv.sub(right);
    if (this.joy.x || this.joy.y) mv.addScaledVector(fwd, this.joy.y).addScaledVector(right, this.joy.x);
    if (this.keys.has('arrowleft')) {
      this.yaw += dt * 1.5;
      this.applyLook();
    }
    if (this.keys.has('arrowright')) {
      this.yaw -= dt * 1.5;
      this.applyLook();
    }
    if (mv.lengthSq() > 0) {
      const joyMag = Math.min(1, Math.hypot(this.joy.x, this.joy.y));
      mv.normalize().multiplyScalar(this.keys.size ? speed : 1.6 * dt * joyMag);
      this.camera.position.add(mv);
      this.invalidate();
    }
  }

  private pointer(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pickItem(e: PointerEvent | MouseEvent, exclude?: Set<string>): { item: Item; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.itemGroup.children, true);
    for (const h of hits) {
      const id = h.object.userData.itemId as string | undefined;
      if (!id || exclude?.has(id)) continue;
      const it = store.item(id);
      if (!it) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      return { item: it, point: h.point, normal: n };
    }
    return null;
  }

  private floorPoint(e: { clientX: number; clientY: number }, y = 0): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      el.focus({ preventScroll: true });
      if (this.mode === 'walk') {
        this.walkLook = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
        el.setPointerCapture(e.pointerId);
        const hit = this.pickItem(e);
        store.select(hit ? { kind: 'item', id: hit.item.id } : store.selection);
        return;
      }
      if (e.button !== 0) return;
      const hit = this.pickItem(e);
      // Mit dem Finger: erst antippen (auswählen), dann ziehen – sonst könnte man in einem
      // vollen Raum die Kamera kaum noch drehen.
      const sel = store.selection;
      if (hit && e.pointerType === 'touch' && !(sel?.kind === 'item' && sel.id === hit.item.id)) {
        this.clickStart = { x: e.clientX, y: e.clientY, itemId: hit.item.id };
        return;
      }
      if (hit) {
        store.select({ kind: 'item', id: hit.item.id });
        if (hit.item.locked) return;
        const fp = this.floorPoint(e, hit.point.y) ?? hit.point;
        this.drag = {
          item: hit.item,
          children: stackedOn(store.project, hit.item),
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          offset: { x: hit.item.x - fp.x / S, y: hit.item.y - fp.z / S },
        };
        this.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
      } else {
        this.clickStart = { x: e.clientX, y: e.clientY };
      }
    }, { capture: true });
    el.addEventListener('pointermove', (e) => {
      if (this.walkLook) {
        this.yaw = this.walkLook.yaw - (e.clientX - this.walkLook.x) * 0.004;
        this.pitch = THREE.MathUtils.clamp(this.walkLook.pitch - (e.clientY - this.walkLook.y) * 0.004, -1.3, 1.3);
        this.applyLook();
        return;
      }
      if (!this.drag) return;
      const d = this.drag;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
      d.moved = true;
      const ex = new Set([d.item.id, ...d.children.map((c) => c.id)]);
      const hit = settings.stack ? this.pickItem(e, ex) : null;
      let x: number;
      let y: number;
      if (hit && hit.normal.y > 0.6) {
        x = hit.point.x / S;
        y = hit.point.z / S;
      } else {
        const fp = this.floorPoint(e, 0);
        if (!fp) return;
        x = fp.x / S + d.offset.x;
        y = fp.z / S + d.offset.y;
      }
      if (settings.snapGrid) {
        x = Math.round(x);
        y = Math.round(y);
      }
      store.mutate((p) => {
        const it = p.items.find((i) => i.id === d.item.id)!;
        moveItemTo(p, it, x, y, d.children);
        // Haustechnik bleibt an der Wand
        if (isTech(it.type) && !it.ceiling) snapItemToWall(p, it, 60);
      });
      const it = store.item(d.item.id)!;
      const sup = supportAt(store.project, { x: it.x, y: it.y }, ex);
      this.onStatus(sup && settings.stack ? `Gestapelt auf: ${sup.name} (Höhe ${Math.round(it.z)} cm)` : `Position: ${Math.round(it.x)} / ${Math.round(it.y)} cm`);
    });
    const end = (e: PointerEvent) => {
      if (this.walkLook) {
        this.walkLook = null;
        return;
      }
      if (this.drag) {
        if (this.drag.moved) store.commit();
        this.drag = null;
        this.controls.enabled = true;
        return;
      }
      if (this.clickStart && Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y) < (e.pointerType === 'touch' ? 12 : 4))
        store.select(this.clickStart.itemId ? { kind: 'item', id: this.clickStart.itemId } : null);
      this.clickStart = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      if (this.mode !== 'walk') return;
      this.keys.add(e.key.toLowerCase());
      if (e.shiftKey) this.keys.add('shift');
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
    });
    el.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (!e.shiftKey) this.keys.delete('shift');
    });
    el.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('wheel', (e) => {
      if (this.mode !== 'walk') return;
      e.preventDefault();
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + e.deltaY * 0.03, 30, 100);
      this.camera.updateProjectionMatrix();
      this.invalidate();
    });
    // Drag & Drop aus dem Katalog
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer?.getData('text/catalog');
      if (!id) return;
      const entry = this.findEntry?.(id);
      const fp = this.floorPoint(e);
      if (!entry || !fp) return;
      const it = newItemFromEntry(entry, Math.round(fp.x / S), Math.round(fp.z / S), store.project);
      store.update((p) => {
        p.items.push(it);
        if (isTech(it.type)) {
          placementAt(p, it, { x: it.x, y: it.y }, 80);
          return;
        }
        const sup = settings.stack ? supportAt(p, { x: it.x, y: it.y }, new Set([it.id])) : null;
        if (sup) it.z = sup.z + sup.h;
      });
      store.select({ kind: 'item', id: it.id });
    });
  }
  private clickStart: { x: number; y: number; itemId?: string } | null = null;
  findEntry?: (id: string) => CatalogEntry | undefined;

  screenshot(): string {
    this.updateCutaway();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  setCameraPreset(preset: 'top' | 'iso' | 'front') {
    this.setMode('orbit');
    const c = this.center;
    // Abstand so wählen, dass das Haus auch in schmalen Ansichten ganz sichtbar ist
    const R = this.radius * Math.max(1, 1.25 / Math.max(0.3, this.camera.aspect));
    this.controls.target.set(c.x, 0.5, c.z);
    if (preset === 'top') this.camera.position.set(c.x, R * 2.6 + 3, c.z + 0.01);
    else if (preset === 'iso') this.camera.position.set(c.x + R * 1.1, R * 1.4 + 2, c.z + R * 1.3);
    else this.camera.position.set(c.x, 1.7, c.z + R * 1.6);
    this.controls.update();
    this.invalidate();
  }

  // ------------------------------------------------------------------ Analyse-Ebene

  /** Zeigt eine Analyse (z.B. Lichtzonen) als weiche, farbige Fläche knapp über dem Boden. */
  showOverlay(ov: Overlay | null) {
    this.clearGroup(this.heatGroup);
    if (ov) {
      const tex = new THREE.CanvasTexture(ov.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      const w = ov.canvas.width * ov.step * S;
      const d = ov.canvas.height * ov.step * S;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: ov.alpha, depthWrite: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((ov.x0 - ov.step / 2) * S + w / 2, 0.012, (ov.y0 - ov.step / 2) * S + d / 2);
      plane.renderOrder = 2;
      this.heatGroup.add(plane);
    }
    this.invalidate();
  }
}

export function heatColor(f: number, out = new THREE.Color()): THREE.Color {
  // dunkelblau → türkis → gelb → orange
  const stops = [
    [0, 0x2b3a67],
    [0.25, 0x2f8f9d],
    [0.55, 0xf2d64b],
    [1, 0xf07b2b],
  ] as const;
  for (let i = 1; i < stops.length; i++) {
    if (f <= stops[i][0]) {
      const t = (f - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return out.setHex(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), t);
    }
  }
  return out.setHex(stops[stops.length - 1][1]);
}

function segmentsIntersect(p1: P, p2: P, q1: P, q2: P): boolean {
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return false;
  const t = cross(sub(q1, p1), s) / den;
  const u = cross(sub(q1, p1), r) / den;
  return t > 0 && t < 1 && u > 0 && u < 1;
}
