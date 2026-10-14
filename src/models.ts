// Prozedurale 3D-Modelle für alle Möbeltypen.
// Konvention: Ursprung = Mitte der Grundfläche, Breite entlang x, Tiefe entlang z, Vorderseite zeigt nach +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ItemSpec } from './types';
import { finishMaterial, rng, hash } from './textures';

type M = THREE.Material;

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xdfeef0,
  roughness: 0.05,
  metalness: 0,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
});
const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xe8eef0, metalness: 1, roughness: 0.03 });
const darkMat = () => finishMaterial('lack', '#2b2b2c');
const blackGlass = () => finishMaterial('glanz', '#121314');
const chrome = () => finishMaterial('metall', '#c9ccce');
const porcelain = () => finishMaterial('glanz', '#f7f7f5');

class Builder {
  g = new THREE.Group();

  box(w: number, h: number, d: number, m: M, x: number, y: number, z: number, r = 0): THREE.Mesh {
    const geo = r > 0 ? new RoundedBoxGeometry(Math.max(w, 2 * r + 1e-4), Math.max(h, 2 * r + 1e-4), Math.max(d, 2 * r + 1e-4), 3, r) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y + h / 2, z);
    this.g.add(mesh);
    return mesh;
  }

  cyl(rt: number, rb: number, h: number, m: M, x: number, y: number, z: number, seg = 24, open = false): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m);
    mesh.position.set(x, y + h / 2, z);
    this.g.add(mesh);
    return mesh;
  }

  sphere(r: number, m: M, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    this.g.add(mesh);
    return mesh;
  }
}

const P = (spec: ItemSpec, k: string, def: number) => (spec.params && spec.params[k] !== undefined ? spec.params[k] : def);

export function buildModel(spec: ItemSpec): THREE.Group {
  const W = Math.max(0.01, spec.w / 100);
  const D = Math.max(0.01, spec.d / 100);
  const H = Math.max(0.005, spec.h / 100);
  const b = new Builder();
  const m1 = finishMaterial(spec.finish, spec.color);
  const fn = GENERATORS[spec.type] ?? GENERATORS.box;
  fn(b, spec, W, D, H, m1);
  b.g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      const transparent = (mesh.material as THREE.Material).transparent;
      mesh.castShadow = !transparent;
      mesh.receiveShadow = true;
    }
  });
  return b.g;
}

type Gen = (b: Builder, s: ItemSpec, W: number, D: number, H: number, m1: M) => void;

function handleBar(b: Builder, x: number, y: number, z: number, vertical: boolean, len = 0.12) {
  const m = chrome();
  if (vertical) b.box(0.012, len, 0.02, m, x, y - len / 2, z + 0.01);
  else b.box(len, 0.012, 0.02, m, x, y - 0.006, z + 0.01);
}

function fronts(b: Builder, m: M, x0: number, x1: number, y0: number, y1: number, z: number, cols: number, rows: number, gap = 0.003, t = 0.018, draw = true): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  const fw = (x1 - x0 - gap * (cols - 1)) / cols;
  const fh = (y1 - y0 - gap * (rows - 1)) / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = x0 + i * (fw + gap) + fw / 2;
      const y = y0 + j * (fh + gap);
      if (draw) b.box(fw, fh, t, m, x, y, z + t / 2);
      out.push({ x, y, w: fw, h: fh });
    }
  return out;
}

function sofaCore(b: Builder, s: ItemSpec, W: number, D: number, H: number, m1: M, seats: number, A: number, legs: boolean) {
  const legH = legs ? 0.14 : 0.03;
  const seatTop = Math.min(0.46, H * 0.55);
  const cushionH = 0.13;
  const Bd = Math.min(0.24, D * 0.25);
  const armH = Math.min(H * 0.78, seatTop + 0.2);
  const baseH = seatTop - cushionH - legH;
  if (legs) {
    const lm = finishMaterial('holz', s.color2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.018, 0.014, legH, lm, sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06), 10);
  } else {
    b.box(W - 0.06, legH, D - 0.06, darkMat(), 0, 0, 0);
  }
  b.box(W, baseH, D, m1, 0, legH, 0, 0.015);
  // Rückenlehne
  b.box(W, H - legH - baseH, Bd, m1, 0, legH + baseH, -D / 2 + Bd / 2, 0.03);
  // Armlehnen
  if (A > 0.01)
    for (const sx of [-1, 1]) {
      const rr = Math.min(0.06, A / 2.2);
      b.box(A, armH - legH, D, m1, sx * (W / 2 - A / 2), legH, 0, rr);
    }
  const innerW = W - 2 * A;
  const cw = innerW / seats;
  for (let i = 0; i < seats; i++) {
    const x = -innerW / 2 + cw * i + cw / 2;
    b.box(cw - 0.01, cushionH, D - Bd - 0.02, m1, x, seatTop - cushionH, Bd / 2 + 0.01, 0.04);
    const bh = Math.max(0.1, (H - seatTop) * 0.92);
    const back = b.box(cw - 0.015, bh, 0.17, m1, x, seatTop - 0.01, -D / 2 + Bd + 0.07, 0.05);
    back.rotation.x = -0.12;
  }
}

const GENERATORS: Partial<Record<ItemSpec['type'], Gen>> & { box: Gen } = {
  box(b, _s, W, D, H, m1) {
    b.box(W, H, D, m1, 0, 0, 0, Math.min(0.005, W / 4, H / 4, D / 4));
  },

  cylinder(b, _s, W, D, H, m1) {
    const c = b.cyl(W / 2, W / 2, H, m1, 0, 0, 0, 40);
    c.scale.z = D / W;
  },

  bookcase(b, s, W, D, H, m1) {
    const t = 0.018;
    const n = P(s, 'shelves', 4);
    for (const sx of [-1, 1]) b.box(t, H, D, m1, sx * (W / 2 - t / 2), 0, 0);
    b.box(W, t, D, m1, 0, H - t, 0);
    b.box(W - 2 * t, 0.06, t, m1, 0, 0, D / 2 - t / 2 - 0.012);
    b.box(W - 2 * t, H - t, 0.004, finishMaterial('lack', s.color), 0, 0, -D / 2 + 0.002);
    const y0 = 0.06;
    const step = (H - t - y0) / (n + 1);
    for (let i = 0; i <= n; i++) b.box(W - 2 * t, t, D - 0.01, m1, 0, y0 + i * step, 0.005);
  },

  cubeshelf(b, s, W, D, H, m1) {
    const t = Math.min(0.039, W / 10, H / 10);
    const ti = 0.016;
    const cols = Math.max(1, P(s, 'cols', 2));
    const rows = Math.max(1, P(s, 'rows', 2));
    for (const sx of [-1, 1]) b.box(t, H, D, m1, sx * (W / 2 - t / 2), 0, 0);
    b.box(W - 2 * t, t, D, m1, 0, 0, 0);
    b.box(W - 2 * t, t, D, m1, 0, H - t, 0);
    const cw = (W - 2 * t - (cols - 1) * ti) / cols;
    const ch = (H - 2 * t - (rows - 1) * ti) / rows;
    for (let i = 1; i < cols; i++) b.box(ti, H - 2 * t, D, m1, -W / 2 + t + i * cw + (i - 1) * ti + ti / 2, t, 0);
    for (let j = 1; j < rows; j++) b.box(W - 2 * t, ti, D, m1, 0, t + j * ch + (j - 1) * ti, 0);
  },

  openshelf(b, s, W, D, H, m1) {
    const n = Math.max(2, P(s, 'shelves', 5));
    const glass = P(s, 'glass', 0) > 0;
    const post = glass ? 0.016 : 0.032;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) b.box(post, H, post, m1, sx * (W / 2 - post / 2), 0, sz * (D / 2 - post / 2));
    if (!glass)
      for (const sx of [-1, 1])
        for (const y of [0.1, H - 0.06]) b.box(post * 0.6, 0.03, D - post, m1, sx * (W / 2 - post / 2), y, 0);
    const shelfMat = glass ? glassMat : m1;
    for (let i = 0; i < n; i++) {
      const y = 0.08 + (i * (H - 0.1)) / (n - 1);
      b.box(W - (glass ? 0.01 : 2 * post), glass ? 0.008 : 0.02, D - 0.01, shelfMat, 0, Math.min(y, H - 0.02), 0);
    }
  },

  wardrobe(b, s, W, D, H, m1) {
    const n = Math.max(1, P(s, 'doors', 2));
    const sliding = P(s, 'sliding', 0) > 0;
    const glass = P(s, 'glass', 0) > 0;
    const split = P(s, 'split', 0) > 0;
    const bodyD = D - 0.022;
    b.box(W, H, bodyD, m1, 0, 0, -0.011);
    const zf = D / 2 - 0.022;
    if (sliding) {
      const dw = W / n + 0.02;
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (W / n) * i + W / n / 2;
        const z = zf + (i % 2 ? 0.0 : 0.012);
        b.box(dw, H - 0.04, 0.012, m1, x, 0.02, z + 0.006);
        b.box(0.01, H - 0.04, 0.015, chrome(), x + (i % 2 ? -dw / 2 : dw / 2), 0.02, z + 0.008);
      }
      b.box(W, 0.03, 0.03, chrome(), 0, H - 0.03, zf + 0.015);
      return;
    }
    const rowsY: [number, number][] = split ? [[0.02, H * 0.62], [H * 0.62 + 0.003, H - 0.01]] : [[0.02, H - 0.01]];
    for (const [y0, y1] of rowsY) {
      const fr = fronts(b, m1, -W / 2 + 0.002, W / 2 - 0.002, y0, y1, zf, n, 1, 0.003, 0.018, !glass);
      fr.forEach((f, i) => {
        if (glass) {
          const fw = 0.05;
          b.box(f.w, fw, 0.02, m1, f.x, f.y, zf);
          b.box(f.w, fw, 0.02, m1, f.x, f.y + f.h - fw, zf);
          b.box(fw, f.h, 0.02, m1, f.x - f.w / 2 + fw / 2, f.y, zf);
          b.box(fw, f.h, 0.02, m1, f.x + f.w / 2 - fw / 2, f.y, zf);
          b.box(f.w - 2 * fw, f.h - 2 * fw, 0.006, glassMat, f.x, f.y + fw, zf);
        }
        const right = n === 1 ? true : n % 2 === 0 ? i % 2 === 0 : i < n / 2;
        const hx = f.x + (right ? f.w / 2 - 0.04 : -f.w / 2 + 0.04);
        const hy = y1 - y0 > 1.2 ? 1.05 : y0 + (y1 - y0) / 2 + 0.06;
        handleBar(b, hx, Math.min(hy, y1 - 0.05), zf + 0.018, true, 0.16);
      });
    }
  },

  dresser(b, s, W, D, H, m1) {
    const rows = Math.max(1, P(s, 'rows', 3));
    const cols = Math.max(1, P(s, 'cols', 1));
    const plinth = P(s, 'plinth', 0) / 100;
    const open = P(s, 'open', 0) > 0;
    const knobs = P(s, 'knobs', 0) > 0;
    const noh = P(s, 'nohandles', 0) > 0;
    if (plinth > 0) b.box(W - 0.04, plinth, D - 0.06, m1, 0, 0, -0.02);
    b.box(W, H - plinth, D - 0.018, m1, 0, plinth, -0.009);
    b.box(W + 0.01, 0.02, D + 0.005, m1, 0, H - 0.02, 0);
    const zf = D / 2 - 0.018;
    let yTop = H - 0.025;
    if (open) {
      const oh = (H - plinth) / (rows + 1);
      b.box(W - 0.04, oh - 0.03, 0.01, darkMat(), 0, yTop - oh + 0.01, zf - 0.02);
      yTop -= oh;
    }
    const fr = fronts(b, m1, -W / 2 + 0.003, W / 2 - 0.003, plinth + 0.003, yTop, zf, cols, rows);
    for (const f of fr) {
      if (noh) continue;
      if (knobs) {
        const km = finishMaterial('metall', s.color2);
        const kk = f.w > 0.5 ? [-f.w / 4, f.w / 4] : [0];
        for (const dx of kk) {
          const k = b.cyl(0.012, 0.012, 0.025, km, f.x + dx, f.y + f.h / 2 - 0.0125, zf + 0.03);
          k.rotation.x = Math.PI / 2;
        }
      } else {
        b.box(f.w * 0.9, 0.012, 0.004, darkMat(), f.x, f.y + f.h - 0.016, zf + 0.0185);
      }
    }
  },

  bed(b, s, W, D, H, m1) {
    const F = P(s, 'frame', 35) / 100;
    const legs = P(s, 'legs', 0) > 0;
    const foot = P(s, 'foot', 0) / 100;
    const headT = 0.06;
    const linen = finishMaterial('stoff', s.color2);
    const y0 = legs ? 0.12 : 0;
    if (legs)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, y0 + 0.02, 0.06, m1, sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.05));
    // Rahmen (Seitenwangen + Fußende)
    b.box(W, F - y0, D - headT, m1, 0, y0, headT / 2, s.finish === 'stoff' ? 0.02 : 0);
    // Kopfteil
    b.box(W, H, headT, m1, 0, 0, -D / 2 + headT / 2, s.finish === 'stoff' ? 0.025 : 0);
    if (foot > 0) b.box(W, foot, 0.05, m1, 0, 0, D / 2 - 0.025);
    // Matratze
    const mw = W - 0.12;
    const md = D - headT - (foot > 0 ? 0.08 : 0.06);
    const mz = -D / 2 + headT + md / 2 + 0.01;
    const mattressTop = F + 0.14;
    b.box(mw, 0.2, md, finishMaterial('stoff', '#f3f2ee'), 0, F - 0.06, mz, 0.04);
    // Decke
    b.box(mw + 0.03, 0.06, md * 0.7, linen, 0, mattressTop - 0.01, mz + md * 0.15 + 0.01, 0.025);
    // Kissen
    const np = mw > 1.2 ? 2 : 1;
    const pw = Math.min(0.75, mw / np - 0.06);
    for (let i = 0; i < np; i++) {
      const x = np === 1 ? 0 : (i === 0 ? -1 : 1) * (mw / 4);
      const p = b.box(pw, 0.13, 0.4, linen, x, mattressTop - 0.02, -D / 2 + headT + 0.25, 0.05);
      p.rotation.x = -0.25;
    }
  },

  sofa(b, s, W, D, H, m1) {
    sofaCore(b, s, W, D, H, m1, Math.max(1, P(s, 'seats', 3)), P(s, 'arm', 20) / 100, P(s, 'legs', 0) > 0);
  },

  cornersofa(b, s, W, D, H, m1) {
    const C = Math.min(W * 0.6, P(s, 'chaise', 90) / 100);
    const left = P(s, 'left', 0) > 0 ? -1 : 1;
    const Dm = Math.min(0.95, D * 0.62);
    const seatTop = Math.min(0.45, H * 0.7);
    const Bd = 0.2;
    const baseH = seatTop - 0.12;
    const cx = left * (W / 2 - C / 2); // Mitte Récamiere
    const mx = -left * (C / 2); // Mitte Hauptteil
    const mainW = W - C;
    b.box(W - 0.06, 0.03, Dm - 0.06, darkMat(), 0, 0, -D / 2 + Dm / 2);
    b.box(mainW, baseH, Dm, m1, mx, 0, -D / 2 + Dm / 2, 0.015);
    b.box(C, baseH, D, m1, cx, 0, 0, 0.015);
    b.box(W, H, Bd, m1, 0, 0, -D / 2 + Bd / 2, 0.03);
    // Armlehne am Hauptteil
    const A = 0.14;
    b.box(A, seatTop + 0.12, Dm, m1, -left * (W / 2 - A / 2), 0, -D / 2 + Dm / 2, 0.05);
    const seats = Math.max(1, Math.round((mainW - A) / 0.7));
    const sw = (mainW - A) / seats;
    for (let i = 0; i < seats; i++) {
      const x = -left * (W / 2 - A - sw / 2 - i * sw);
      b.box(sw - 0.01, 0.12, Dm - Bd - 0.02, m1, x, baseH, -D / 2 + Bd + (Dm - Bd) / 2, 0.04);
      const back = b.box(sw - 0.015, (H - seatTop) * 0.92, 0.17, m1, x, seatTop - 0.01, -D / 2 + Bd + 0.07, 0.05);
      back.rotation.x = -0.12;
    }
    b.box(C - 0.02, 0.12, D - Bd - 0.02, m1, cx, baseH, Bd / 2 + 0.01, 0.04);
    const back = b.box(C - 0.02, (H - seatTop) * 0.92, 0.17, m1, cx, seatTop - 0.01, -D / 2 + Bd + 0.07, 0.05);
    back.rotation.x = -0.12;
  },

  armchair(b, s, W, D, H, m1) {
    const style = P(s, 'style', 0);
    if (style === 2) {
      // Schwingsessel (POÄNG-Stil)
      const wood = finishMaterial('holz', s.color2);
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - 0.025);
        b.box(0.035, 0.03, D * 0.95, wood, x, 0, 0.0);
        const arm = b.box(0.035, 0.03, D * 0.6, wood, x, 0.52, -0.02);
        arm.rotation.x = 0.08;
        const front = b.box(0.035, 0.55, 0.035, wood, x, 0.0, D / 2 - 0.08);
        front.rotation.x = 0.35;
        const rear = b.box(0.03, H * 0.95, 0.03, wood, x, 0.12, -D / 2 + 0.12);
        rear.rotation.x = -0.32;
      }
      const seat = b.box(W - 0.1, 0.09, D * 0.55, m1, 0, 0.32, 0.08, 0.04);
      seat.rotation.x = -0.18;
      const back = b.box(W - 0.1, H * 0.62, 0.09, m1, 0, 0.36, -D / 2 + 0.24, 0.04);
      back.rotation.x = -0.38;
      return;
    }
    const A = Math.min(0.22, W * 0.17);
    sofaCore(b, s, W, D, H, m1, 1, A, style === 1);
    if (style === 1) {
      for (const sx of [-1, 1]) {
        const wing = b.box(0.08, H * 0.42, 0.32, m1, sx * (W / 2 - 0.06), H * 0.58, -D / 2 + 0.3, 0.035);
        wing.rotation.y = sx * -0.15;
      }
    }
  },

  chair(b, s, W, D, H, m1) {
    const metal = P(s, 'metal', 0) > 0;
    const shell = P(s, 'shell', 0) > 0;
    const spindles = P(s, 'spindles', 0) > 0;
    const seatY = 0.45;
    const lm = metal ? chrome() : shell ? finishMaterial('holz', s.color2) : m1;
    const lw = metal ? 0.016 : 0.035;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        if (metal) b.cyl(lw / 2, lw / 2, seatY, lm, sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.05), 8);
        else b.box(lw, seatY, lw, lm, sx * (W / 2 - 0.035), 0, sz * (D / 2 - 0.04));
      }
    if (shell) {
      b.box(W, 0.06, D * 0.85, m1, 0, seatY - 0.02, 0.03, 0.025);
      const back = b.box(W, H - seatY, 0.05, m1, 0, seatY + 0.02, -D / 2 + 0.06, 0.02);
      back.rotation.x = -0.12;
      return;
    }
    b.box(W, 0.035, D * 0.9, m1, 0, seatY - 0.035, 0.02, 0.006);
    if (metal) {
      b.box(W * 0.95, H - seatY - 0.08, 0.02, m1, 0, seatY + 0.08, -D / 2 + 0.03, 0.006);
      for (const sx of [-1, 1]) b.cyl(lw / 2, lw / 2, H - seatY, lm, sx * (W / 2 - 0.04), seatY, -D / 2 + 0.04, 8);
      return;
    }
    for (const sx of [-1, 1]) b.box(0.035, H - seatY, 0.035, m1, sx * (W / 2 - 0.035), seatY, -D / 2 + 0.04);
    b.box(W - 0.02, 0.07, 0.03, m1, 0, H - 0.08, -D / 2 + 0.04, 0.008);
    if (spindles) for (let i = -1; i <= 1; i++) b.box(0.02, H - seatY - 0.1, 0.02, m1, i * (W / 4.5), seatY, -D / 2 + 0.04);
    else b.box(W - 0.06, 0.06, 0.02, m1, 0, seatY + 0.18, -D / 2 + 0.04);
  },

  officechair(b, s, W, D, H, m1) {
    const base = finishMaterial('metall', s.color2);
    const R = Math.min(W, D) / 2 - 0.02;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = b.box(R, 0.04, 0.05, base, (Math.cos(a) * R) / 2, 0.04, (Math.sin(a) * R) / 2);
      leg.rotation.y = -a;
      b.sphere(0.03, darkMat(), Math.cos(a) * R, 0.03, Math.sin(a) * R);
    }
    b.cyl(0.03, 0.03, 0.4, base, 0, 0.07, 0);
    const seatY = 0.47;
    b.box(W * 0.8, 0.08, D * 0.78, m1, 0, seatY - 0.04, 0.03, 0.035);
    const low = P(s, 'low', 0) > 0;
    const backH = H - seatY - 0.05;
    const back = b.box(W * 0.75, backH, 0.07, m1, 0, seatY + 0.05, -D / 2 + 0.08, 0.03);
    back.rotation.x = -0.1;
    if (!low) b.box(W * 0.5, 0.15, 0.07, m1, 0, H - 0.17, -D / 2 + 0.03, 0.03);
    for (const sx of [-1, 1]) {
      b.box(0.03, 0.2, 0.03, base, sx * (W * 0.42), seatY, 0, 0);
      b.box(0.06, 0.03, 0.26, darkMat(), sx * (W * 0.42), seatY + 0.2, 0.02, 0.01);
    }
  },

  stool(b, s, W, D, H, m1) {
    const round = P(s, 'round', 1) > 0;
    if (round) b.cyl(W / 2, W / 2, 0.03, m1, 0, H - 0.03, 0, 28).scale.z = D / W;
    else b.box(W, 0.03, D, m1, 0, H - 0.03, 0);
    const n = round ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4;
      const leg = b.cyl(0.014, 0.016, H - 0.03, m1, Math.cos(a) * W * 0.32, 0, Math.sin(a) * D * 0.32, 10);
      leg.rotation.z = Math.cos(a) * -0.08;
      leg.rotation.x = Math.sin(a) * 0.08;
    }
  },

  bench(b, _s, W, D, H, m1) {
    b.box(W, 0.04, D, m1, 0, H - 0.04, 0, 0.004);
    for (const sx of [-1, 1]) b.box(0.04, H - 0.04, D - 0.04, m1, sx * (W / 2 - 0.12), 0, 0);
  },

  table(b, s, W, D, H, m1) {
    const T = P(s, 'top', 3) / 100;
    const lw = P(s, 'legW', 5) / 100;
    const round = P(s, 'round', 0) > 0;
    const pedestal = P(s, 'pedestal', 0) > 0;
    if (round) {
      const top = b.cyl(W / 2, W / 2, T, m1, 0, H - T, 0, 48);
      top.scale.z = D / W;
    } else {
      b.box(W, T, D, m1, 0, H - T, 0, Math.min(0.004, T / 3));
    }
    if (pedestal) {
      b.cyl(0.06, 0.08, H - T, m1, 0, 0, 0, 24);
      b.cyl(W * 0.25, W * 0.28, 0.03, m1, 0, 0, 0, 32);
      return;
    }
    const inset = round ? W * 0.2 : lw / 2 + (lw >= 0.05 && P(s, 'shelf', 0) ? 0 : 0.03);
    const splay = P(s, 'splay', 0) > 0;
    const legs: [number, number][] = round
      ? [0, 1, 2, 3].map((i) => [Math.cos(i * Math.PI / 2 + Math.PI / 4) * (W / 2 - inset), Math.sin(i * Math.PI / 2 + Math.PI / 4) * (D / 2 - inset)])
      : [
          [-(W / 2 - inset), -(D / 2 - inset)],
          [W / 2 - inset, -(D / 2 - inset)],
          [-(W / 2 - inset), D / 2 - inset],
          [W / 2 - inset, D / 2 - inset],
        ];
    const lm = m1;
    for (const [x, z] of legs) {
      const leg = lw < 0.03 ? b.cyl(lw / 2, lw / 2, H - T, lm, x, 0, z, 10) : b.box(lw, H - T, lw, lm, x, 0, z);
      if (splay) {
        leg.rotation.z = Math.sign(x) * -0.06;
        leg.rotation.x = Math.sign(z) * 0.06;
      }
    }
    if (P(s, 'shelf', 0) > 0) b.box(W - 2 * lw, 0.02, D - 2 * lw, m1, 0, 0.12, 0);
    if (P(s, 'apron', 0) > 0) {
      b.box(W - 2 * inset, 0.08, 0.02, m1, 0, H - T - 0.08, D / 2 - inset);
      b.box(W - 2 * inset, 0.08, 0.02, m1, 0, H - T - 0.08, -(D / 2 - inset));
      b.box(0.02, 0.08, D - 2 * inset, m1, W / 2 - inset, H - T - 0.08, 0);
      b.box(0.02, 0.08, D - 2 * inset, m1, -(W / 2 - inset), H - T - 0.08, 0);
    }
  },

  desk(b, s, W, D, H, m1) {
    const T = 0.03;
    b.box(W, T, D, m1, 0, H - T, 0, 0.003);
    const drawers = P(s, 'drawers', 1) > 0;
    const panel = P(s, 'panel', 0) > 0;
    const tframe = P(s, 'tframe', 0) > 0;
    if (panel) {
      for (const sx of [-1, 1]) b.box(0.03, H - T, D, m1, sx * (W / 2 - 0.015), 0, 0);
      b.box(W - 0.06, 0.4, 0.02, m1, 0, H - T - 0.4, -D / 2 + 0.05);
      return;
    }
    if (tframe) {
      const fm = finishMaterial('metall', s.color2);
      for (const sx of [-1, 1]) {
        b.box(0.06, H - T - 0.03, 0.06, fm, sx * (W / 2 - 0.1), 0.03, 0);
        b.box(0.06, 0.03, D - 0.08, fm, sx * (W / 2 - 0.1), 0, 0);
        b.box(0.05, 0.04, D - 0.1, fm, sx * (W / 2 - 0.1), H - T - 0.04, 0);
      }
      b.box(W - 0.2, 0.05, 0.03, fm, 0, H - T - 0.06, -D / 4);
      return;
    }
    const cw = drawers ? Math.min(0.4, W * 0.3) : 0;
    const legs: [number, number][] = [
      [-(W / 2 - 0.03), -(D / 2 - 0.03)],
      [-(W / 2 - 0.03), D / 2 - 0.03],
    ];
    if (!drawers) legs.push([W / 2 - 0.03, -(D / 2 - 0.03)], [W / 2 - 0.03, D / 2 - 0.03]);
    for (const [x, z] of legs) b.box(0.04, H - T, 0.04, m1, x, 0, z);
    if (drawers) {
      const x = W / 2 - cw / 2;
      b.box(cw, H - T, D - 0.02, m1, x, 0, -0.01);
      const n = Math.max(1, P(s, 'side', 2));
      fronts(b, m1, x - cw / 2 + 0.003, x + cw / 2 - 0.003, 0.003, H - T - 0.003, D / 2 - 0.02, 1, n + 1);
    }
  },

  tvbench(b, s, W, D, H, m1) {
    const legs = P(s, 'legs', 1) > 0;
    const n = P(s, 'doors', 2);
    const shelf = P(s, 'shelf', 0) > 0;
    const y0 = legs ? 0.1 : 0;
    if (legs) {
      const lm = chrome();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.012, 0.012, y0, lm, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), 8);
    }
    const zf = D / 2 - 0.018;
    if (n === 0) {
      // offenes Lowboard
      b.box(W, 0.05, D, m1, 0, H - 0.05, 0);
      b.box(W, 0.05, D, m1, 0, y0, 0);
      for (const sx of [-1, 1]) b.box(0.05, H - y0, D, m1, sx * (W / 2 - 0.025), y0, 0);
      b.box(W - 0.1, 0.02, D - 0.02, m1, 0, y0 + (H - y0) / 2, 0);
      return;
    }
    b.box(W, H - y0, D - 0.018, m1, 0, y0, -0.009);
    const fy0 = shelf ? y0 + (H - y0) * 0.4 : y0 + 0.003;
    if (shelf) b.box(W - 0.04, (H - y0) * 0.4 - 0.04, 0.01, darkMat(), 0, y0 + 0.02, zf - 0.03);
    const fr = fronts(b, m1, -W / 2 + 0.003, W / 2 - 0.003, fy0, H - 0.003, zf, n, 1);
    for (const f of fr) b.box(0.08, 0.01, 0.015, finishMaterial('metall', s.color2), f.x, f.y + f.h - 0.04, zf + 0.025);
  },

  kitchenbase(b, s, W, D, H, m1) {
    const top = finishMaterial('holz', s.color2);
    const plinth = 0.1;
    b.box(W - 0.002, plinth, D - 0.1, darkMat(), 0, 0, -0.05);
    b.box(W, H - plinth - 0.04, D - 0.075, m1, 0, plinth, -0.0375 - 0.01);
    b.box(W, 0.04, D, top, 0, H - 0.04, 0);
    const zf = D / 2 - 0.035;
    const drawers = P(s, 'drawers', 0);
    const doors = Math.max(1, P(s, 'doors', 1));
    const fr = drawers > 0 ? fronts(b, m1, -W / 2 + 0.002, W / 2 - 0.002, plinth + 0.002, H - 0.045, zf, 1, drawers) : fronts(b, m1, -W / 2 + 0.002, W / 2 - 0.002, plinth + 0.002, H - 0.045, zf, doors, 1);
    for (const f of fr) handleBar(b, f.x, f.y + f.h - 0.04, zf + 0.018, false, Math.min(0.2, f.w * 0.5));
  },

  kitchenwall(b, s, W, D, H, m1) {
    b.box(W, H, D - 0.018, m1, 0, 0, -0.009);
    const zf = D / 2 - 0.018;
    const fr = fronts(b, m1, -W / 2 + 0.002, W / 2 - 0.002, 0.002, H - 0.002, zf, Math.max(1, P(s, 'doors', 1)), 1);
    fr.forEach((f, i) => handleBar(b, f.x + (i % 2 ? -1 : 1) * (f.w / 2 - 0.04), 0.16, zf + 0.018, true, 0.12));
  },

  sink(b, s, W, D, H, m1) {
    GENERATORS.kitchenbase!(b, s, W, D, H, m1);
    const steel = chrome();
    const bw = Math.min(W - 0.12, 0.6);
    b.box(bw, 0.004, 0.42, steel, 0, H, 0.02);
    b.box(bw - 0.06, 0.002, 0.34, finishMaterial('metall', '#8f9497'), 0, H + 0.004, 0.02);
    b.cyl(0.02, 0.025, 0.25, steel, 0, H, -D / 2 + 0.08, 16);
    const spout = b.box(0.025, 0.025, 0.2, steel, 0, H + 0.23, -D / 2 + 0.17);
    spout.rotation.x = 0.15;
  },

  stove(b, s, W, D, H, m1) {
    const top = finishMaterial('holz', s.color2);
    const plinth = 0.1;
    b.box(W - 0.002, plinth, D - 0.1, darkMat(), 0, 0, -0.05);
    b.box(W, H - plinth - 0.04, D - 0.075, m1, 0, plinth, -0.0475);
    b.box(W, 0.04, D, top, 0, H - 0.04, 0);
    const zf = D / 2 - 0.035;
    b.box(W - 0.004, 0.18, 0.018, m1, 0, plinth + 0.002, zf + 0.009);
    handleBar(b, 0, plinth + 0.16, zf + 0.018, false, 0.3);
    b.box(W - 0.004, H - plinth - 0.24, 0.02, blackGlass(), 0, plinth + 0.185, zf + 0.01);
    handleBar(b, 0, H - 0.08, zf + 0.03, false, W * 0.7);
    // Kochfeld
    b.box(W - 0.04, 0.006, D - 0.1, blackGlass(), 0, H, 0.01);
    for (const [x, z, r] of [[-0.14, -0.1, 0.09], [0.14, -0.1, 0.07], [-0.14, 0.13, 0.07], [0.14, 0.13, 0.09]] as const)
      b.cyl(r, r, 0.002, finishMaterial('lack', '#3c3d3f'), (x * W) / 0.6, H + 0.006, z, 32);
  },

  fridge(b, s, W, D, H, m1) {
    b.box(W, H, D - 0.03, m1, 0, 0, -0.015);
    const zf = D / 2 - 0.03;
    const split = H * 0.62;
    b.box(W - 0.004, split - 0.012, 0.03, m1, 0, 0.01, zf + 0.015);
    b.box(W - 0.004, H - split - 0.012, 0.03, m1, 0, split + 0.004, zf + 0.015);
    handleBar(b, -W / 2 + 0.05, split - 0.08, zf + 0.03, true, 0.4);
    handleBar(b, -W / 2 + 0.05, split + 0.42, zf + 0.03, true, 0.3);
  },

  washer(b, _s, W, D, H, m1) {
    b.box(W, H, D, m1, 0, 0, 0, 0.01);
    b.box(W - 0.02, 0.1, 0.005, finishMaterial('lack', '#d9dbdc'), 0, H - 0.12, D / 2);
    const ring = b.cyl(0.2, 0.2, 0.03, chrome(), 0, 0, 0);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, H * 0.45, D / 2 + 0.01);
    const glass = b.cyl(0.15, 0.15, 0.035, blackGlass(), 0, 0, 0);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, H * 0.45, D / 2 + 0.015);
  },

  bathtub(b, _s, W, D, H, m1) {
    const t = 0.07;
    b.box(W, H, t, m1, 0, 0, -D / 2 + t / 2, 0.01);
    b.box(W, H, t, m1, 0, 0, D / 2 - t / 2, 0.01);
    b.box(t, H, D, m1, -W / 2 + t / 2, 0, 0, 0.01);
    b.box(t, H, D, m1, W / 2 - t / 2, 0, 0, 0.01);
    b.box(W - 2 * t, 0.12, D - 2 * t, m1, 0, 0, 0);
    b.box(W - 2 * t - 0.02, 0.01, D - 2 * t - 0.02, finishMaterial('glanz', '#e6e9ea'), 0, 0.12, 0);
    b.cyl(0.02, 0.02, 0.12, chrome(), W / 2 - 0.15, H, -D / 2 + 0.04);
  },

  shower(b, s, W, D, H, m1) {
    b.box(W, 0.05, D, m1, 0, 0, 0, 0.01);
    b.box(W, H - 0.05, 0.008, glassMat, 0, 0.05, D / 2 - 0.004);
    b.box(0.008, H - 0.05, D, glassMat, W / 2 - 0.004, 0.05, 0);
    const met = finishMaterial('metall', s.color2);
    b.box(0.02, 0.02, D, met, W / 2 - 0.01, H - 0.02, 0);
    b.box(W, 0.02, 0.02, met, 0, H - 0.02, D / 2 - 0.01);
    b.cyl(0.012, 0.012, H - 0.95, met, 0, 0.95, -D / 2 + 0.03, 10);
    b.cyl(0.11, 0.11, 0.015, met, 0, H - 0.05, -D / 2 + 0.15, 28);
    b.box(0.02, 0.02, 0.14, met, 0, H - 0.04, -D / 2 + 0.08);
  },

  toilet(b, s, W, D, H, m1) {
    const wall = P(s, 'wall', 1) > 0;
    const p = porcelain();
    if (wall) {
      b.box(W, H - 0.1, D - 0.04, p, 0, 0.1, 0.02, 0.06);
      b.box(W, 0.02, D - 0.06, m1, 0, H, 0.03, 0.009);
      b.box(0.24, 0.16, 0.012, finishMaterial('glanz', '#e8e8e6'), 0, 0.95, -D / 2 + 0.006);
      return;
    }
    const seatH = Math.min(0.42, H * 0.55);
    b.box(W * 0.6, seatH - 0.05, D * 0.45, p, 0, 0, 0.05, 0.04);
    b.box(W, 0.12, D * 0.72, p, 0, seatH - 0.14, D * 0.12, 0.06);
    b.box(W, 0.02, D * 0.68, p, 0, seatH - 0.02, D * 0.13, 0.008);
    b.box(W, H - seatH, 0.18, p, 0, seatH, -D / 2 + 0.09, 0.02);
  },

  washbasin(b, s, W, D, H, m1) {
    const top = finishMaterial('glanz', s.color2);
    const bh = 0.06;
    b.box(W - 0.01, H - bh, D - 0.03, m1, 0, 0, -0.015);
    const n = Math.max(0, P(s, 'drawers', 2));
    if (n > 0) {
      const fr = fronts(b, m1, -W / 2 + 0.008, W / 2 - 0.008, 0.003, H - bh - 0.005, D / 2 - 0.03, 1, n);
      for (const f of fr) b.box(f.w * 0.5, 0.01, 0.015, chrome(), f.x, f.y + f.h - 0.04, D / 2 - 0.005);
    }
    b.box(W, bh, D, top, 0, H - bh, 0, 0.012);
    b.box(W - 0.14, 0.004, D - 0.2, finishMaterial('glanz', '#e5e8ea'), 0, H, 0.03);
    b.cyl(0.018, 0.022, 0.16, chrome(), 0, H, -D / 2 + 0.06, 16);
    b.box(0.022, 0.022, 0.12, chrome(), 0, H + 0.13, -D / 2 + 0.11);
  },

  floorlamp(b, s, W, _D, H, m1) {
    const shadeMetal = P(s, 'shade', 0) > 0;
    const metal = shadeMetal ? m1 : finishMaterial('metall', s.color2);
    b.cyl(Math.min(0.15, W / 2.5), Math.min(0.16, W / 2.4), 0.025, metal, 0, 0, 0, 28);
    b.cyl(0.011, 0.011, H - 0.28, metal, 0, 0.025, 0, 10);
    let shade: THREE.Mesh;
    if (shadeMetal) {
      shade = b.cyl(0.05, W / 2, 0.3, m1, 0, H - 0.3, 0, 32, true);
      (shade.material as THREE.Material).side = THREE.DoubleSide;
    } else {
      shade = b.cyl(W / 2 - 0.02, W / 2, 0.32, finishMaterial('stoff', s.color), 0, H - 0.32, 0, 32, true);
    }
    shade.userData.lampShade = true;
    b.g.userData.lightY = H - 0.2;
  },

  tablelamp(b, s, W, _D, H, m1) {
    const cloth = P(s, 'cloth', 0) > 0;
    const base = cloth ? finishMaterial('metall', s.color2) : m1;
    b.cyl(W / 2.6, W / 2.4, 0.02, base, 0, 0, 0, 24);
    b.cyl(0.008, 0.008, H * 0.6, base, 0, 0.02, 0, 8);
    const shade = cloth ? b.cyl(W / 2 - 0.03, W / 2, H * 0.42, finishMaterial('stoff', s.color), 0, H * 0.58, 0, 28, true) : b.cyl(0.03, W / 2, H * 0.35, m1, 0, H * 0.65, 0, 28, true);
    (shade.material as THREE.Material).side = THREE.DoubleSide;
    shade.userData.lampShade = true;
    b.g.userData.lightY = H * 0.7;
  },

  pendant(b, s, W, _D, H, m1) {
    const geo = new THREE.SphereGeometry(W / 2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = (m1 as THREE.MeshStandardMaterial).clone();
    mat.side = THREE.DoubleSide;
    const dome = new THREE.Mesh(geo, mat);
    dome.scale.y = (H * 0.8) / (W / 2);
    dome.position.y = 0;
    dome.userData.lampShade = true;
    b.g.add(dome);
    b.cyl(0.004, 0.004, 0.8, finishMaterial('lack', s.color2), 0, H * 0.8, 0, 6);
    b.g.userData.lightY = 0.05;
  },

  plant(b, s, W, D, H, _m1) {
    const r = rng(hash(`${W}|${D}|${H}`));
    const pot = finishMaterial('lack', s.color2);
    const potH = Math.min(H * 0.3, 0.35);
    const pr = Math.min(W, D) / 2.6;
    b.cyl(pr, pr * 0.8, potH, pot, 0, 0, 0, 24);
    b.cyl(pr * 0.95, pr * 0.95, 0.01, finishMaterial('lack', '#3e2f22'), 0, potH - 0.02, 0, 20);
    const leaf = finishMaterial('lack', s.color);
    const leaf2 = finishMaterial('lack', new THREE.Color(s.color).offsetHSL(0.03, 0, 0.08).getStyle());
    if (P(s, 'tall', 0) > 0) {
      b.cyl(0.012, 0.015, H - potH - 0.2, finishMaterial('holz', '#7a5a3a'), 0, potH, 0, 6);
      for (let i = 0; i < 14; i++) {
        const y = potH + 0.3 + r() * (H - potH - 0.35);
        const a = r() * Math.PI * 2;
        const rr = 0.05 + r() * (W / 2 - 0.08);
        const l = b.sphere(0.07 + r() * 0.06, r() > 0.5 ? leaf : leaf2, Math.cos(a) * rr, y, Math.sin(a) * rr, 1.6, 0.35, 0.9);
        l.rotation.y = a;
        l.rotation.z = (r() - 0.5) * 0.8;
      }
    } else {
      const fh = H - potH;
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const rr = r() * W * 0.25;
        b.sphere(Math.min(W, fh) * (0.22 + r() * 0.12), r() > 0.5 ? leaf : leaf2, Math.cos(a) * rr, potH + fh * (0.35 + r() * 0.35), Math.sin(a) * rr, 1, 0.8, 1);
      }
    }
  },

  rug(b, s, W, D, H, m1) {
    const round = P(s, 'round', 0) > 0;
    if (round) {
      b.cyl(W / 2, W / 2, H, m1, 0, 0, 0, 48).scale.z = D / W;
      return;
    }
    b.box(W, H, D, m1, 0, 0, 0);
    if (P(s, 'stripes', 0) > 0) {
      const sm = finishMaterial('stoff', s.color2);
      const n = 7;
      for (let i = 0; i < n; i++) b.box(W, 0.001, D / (n * 2.2), sm, 0, H, -D / 2 + (D / n) * (i + 0.5));
    }
  },

  mirror(b, s, W, D, H, m1) {
    const round = P(s, 'round', 0) > 0;
    if (round) {
      const fr = b.cyl(W / 2, W / 2, D, m1, 0, 0, 0, 48);
      fr.rotation.x = Math.PI / 2;
      fr.position.set(0, H / 2, 0);
      fr.scale.z = H / W;
      const mi = b.cyl(W / 2 - 0.025, W / 2 - 0.025, D + 0.004, mirrorMat, 0, 0, 0, 48);
      mi.rotation.x = Math.PI / 2;
      mi.position.set(0, H / 2, 0.001);
      mi.scale.z = H / W;
      return;
    }
    b.box(W, H, D, m1, 0, 0, 0);
    b.box(W - 0.05, H - 0.05, 0.004, mirrorMat, 0, 0.025, D / 2);
  },

  picture(b, s, W, D, H, m1) {
    const canvasOnly = P(s, 'canvas', 0) > 0;
    const art = artMaterial(s.color2, hash(`${W}${H}${s.color2}`));
    if (canvasOnly) {
      b.box(W, H, D, m1, 0, 0, 0);
      b.box(W - 0.004, H - 0.004, 0.002, art, 0, 0.002, D / 2);
      return;
    }
    const f = 0.025;
    b.box(W, f, D, m1, 0, 0, 0);
    b.box(W, f, D, m1, 0, H - f, 0);
    b.box(f, H, D, m1, -W / 2 + f / 2, 0, 0);
    b.box(f, H, D, m1, W / 2 - f / 2, 0, 0);
    b.box(W - 2 * f, H - 2 * f, 0.004, finishMaterial('lack', '#f4f2ee'), 0, f, 0);
    b.box(W - 2 * f - 0.08, H - 2 * f - 0.08, 0.002, art, 0, f + 0.04, 0.004);
  },

  wallshelf(b, s, W, D, H, m1) {
    b.box(W, H, D, m1, 0, 0, 0, Math.min(0.003, H / 3));
    if (P(s, 'brackets', 0) > 0) {
      const bm = finishMaterial('metall', s.color2);
      for (const sx of [-1, 1]) {
        b.box(0.02, 0.003, D * 0.8, bm, sx * W * 0.35, -0.003, -D * 0.1);
        b.box(0.02, 0.12, 0.003, bm, sx * W * 0.35, -0.12, -D / 2 + 0.0015);
      }
    }
  },

  tv(b, s, W, D, H, m1) {
    const stand = P(s, 'stand', 1) > 0;
    const y0 = stand ? 0.07 : 0;
    const t = Math.min(0.045, D);
    b.box(W, H - y0, t, darkMat(), 0, y0, stand ? 0 : 0);
    b.box(W - 0.012, H - y0 - 0.012, 0.002, finishMaterial('glanz', '#0b0c0e'), 0, y0 + 0.006, t / 2);
    if (stand) {
      b.box(W * 0.3, 0.012, Math.max(0.18, D * 0.8), m1, 0, 0, 0);
      b.box(0.05, y0 + 0.1, 0.03, darkMat(), 0, 0, -0.02);
    }
  },

  radiator(b, s, W, D, H, m1) {
    if (P(s, 'towel', 0) > 0) {
      for (const sx of [-1, 1]) b.cyl(0.015, 0.015, H, m1, sx * (W / 2 - 0.015), 0, 0, 10);
      const n = Math.max(3, Math.round(H / 0.06));
      for (let i = 0; i < n; i++) {
        const bar = b.cyl(0.01, 0.01, W - 0.03, m1, 0, 0, 0, 8);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, 0.04 + (i * (H - 0.08)) / (n - 1), 0);
      }
      return;
    }
    b.box(W, H, D * 0.6, m1, 0, 0, -D * 0.2);
    const n = Math.max(4, Math.round(W / 0.05));
    for (let i = 0; i < n; i++) b.box(0.03, H - 0.04, D * 0.4, m1, -W / 2 + 0.025 + (i * (W - 0.05)) / (n - 1), 0.02, D * 0.3 - 0.01);
  },

  curtain(b, s, W, D, H, m1) {
    const n = Math.max(3, Math.round(W / 0.07));
    const r = Math.max(0.02, D / 2);
    for (let i = 0; i < n; i++) b.cyl(r, r * 1.15, H - 0.04, m1, -W / 2 + (i + 0.5) * (W / n), 0, 0, 10);
    const rod = b.cyl(0.012, 0.012, W + 0.2, finishMaterial('metall', '#3a3a3a'), 0, 0, 0, 10);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, H - 0.02, 0);
  },
};

const artCache = new Map<string, THREE.MeshStandardMaterial>();
function artMaterial(base: string, seed: number): THREE.MeshStandardMaterial {
  const key = base + seed;
  let m = artCache.get(key);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const r = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const palette = ['#e8dccb', '#c46a4a', '#2f4858', '#d9a441', '#86a397', '#1d1d1f', '#f2efe9'];
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = palette[(r() * palette.length) | 0];
      ctx.globalAlpha = 0.85;
      if (r() > 0.5) {
        ctx.beginPath();
        ctx.arc(r() * 256, r() * 256, 20 + r() * 70, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(r() * 200, r() * 200, 30 + r() * 120, 20 + r() * 100);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
    artCache.set(key, m);
  }
  return m;
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}
