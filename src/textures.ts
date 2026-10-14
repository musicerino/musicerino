// Prozedural erzeugte Materialien für Böden, Wände und Möbeloberflächen.
import * as THREE from 'three';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Draw = (ctx: CanvasRenderingContext2D, S: number, r: () => number) => void;

export interface MatPreset {
  id: string;
  label: string;
  size: number; // Kantenlänge der Textur in Metern
  color: string; // vorgeschlagene Tönung
  roughness: number;
  metalness?: number;
  bump?: number;
  draw: Draw;
}

const shade = (base: [number, number, number], f: number) =>
  `rgb(${Math.max(0, Math.min(255, base[0] * f)) | 0},${Math.max(0, Math.min(255, base[1] * f)) | 0},${Math.max(0, Math.min(255, base[2] * f)) | 0})`;

function noise(ctx: CanvasRenderingContext2D, S: number, r: () => number, amount: number, count = S * S * 0.15, size = 1) {
  for (let i = 0; i < count; i++) {
    const v = r();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${amount * r()})` : `rgba(0,0,0,${amount * r()})`;
    ctx.fillRect(r() * S, r() * S, size, size);
  }
}

function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number, horizontal: boolean, strength = 0.12) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const lines = horizontal ? h / 2.2 : w / 2.2;
  for (let i = 0; i < lines; i++) {
    ctx.strokeStyle = `rgba(${r() > 0.5 ? '60,35,15' : '255,240,220'},${strength * r()})`;
    ctx.lineWidth = 0.5 + r() * 1.6;
    ctx.beginPath();
    const off = r() * (horizontal ? h : w);
    const amp = 1 + r() * 3;
    const freq = 0.005 + r() * 0.02;
    const ph = r() * 10;
    if (horizontal) {
      for (let xx = x; xx <= x + w; xx += 6) {
        const yy = y + off + Math.sin(xx * freq + ph) * amp;
        if (xx === x) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
    } else {
      for (let yy = y; yy <= y + h; yy += 6) {
        const xx = x + off + Math.sin(yy * freq + ph) * amp;
        if (yy === y) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
    }
    ctx.stroke();
  }
  // Astlöcher
  if (r() < 0.25) {
    ctx.fillStyle = 'rgba(70,40,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + r() * w, y + r() * h, horizontal ? 7 : 3, horizontal ? 3 : 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function planks(base: [number, number, number], rows: number, minLen: number, var_: number, gap = 'rgba(40,25,15,0.55)'): Draw {
  return (ctx, S, r) => {
    const h = S / rows;
    for (let i = 0; i < rows; i++) {
      const x0 = -r() * S * 0.5;
      let x = x0;
      while (x < x0 + S - 1) {
        let l = S * (minLen + r() * var_);
        if (x + l > x0 + S - S * 0.12) l = x0 + S - x; // letztes Brett schließt genau an
        l = Math.min(l, x0 + S - x);
        const f = 0.85 + r() * 0.3;
        ctx.fillStyle = shade(base, f);
        // nahtlos: Brett, das rechts übersteht, links wiederholen
        ctx.fillRect(x, i * h, l, h);
        grain(ctx, x, i * h, l, h, r, true);
        // nahtlose Kachel: über den Rand ragende Bretter auf der Gegenseite wiederholen
        const wrap = x < 0 ? S : x + l > S ? -S : 0;
        if (wrap) {
          ctx.fillStyle = shade(base, f);
          ctx.fillRect(x + wrap, i * h, l, h);
          grain(ctx, x + wrap, i * h, l, h, r, true);
        }
        ctx.fillStyle = gap;
        ctx.fillRect(x, i * h, 1.5, h);
        if (wrap) ctx.fillRect(x + wrap, i * h, 1.5, h);
        x += l;
      }
      ctx.fillStyle = gap;
      ctx.fillRect(0, i * h, S, 1.5);
    }
  };
}

function tiles(base: [number, number, number], cols: number, rows: number, grout: string, vary = 0.06, stagger = false, groutW = 3): Draw {
  return (ctx, S, r) => {
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, S, S);
    const w = S / cols;
    const h = S / rows;
    for (let j = 0; j < rows; j++) {
      const off = stagger && j % 2 ? w / 2 : 0;
      for (let i = -1; i < cols + 1; i++) {
        ctx.fillStyle = shade(base, 1 - vary / 2 + r() * vary);
        ctx.fillRect(i * w + off + groutW / 2, j * h + groutW / 2, w - groutW, h - groutW);
      }
    }
    noise(ctx, S, r, 0.04);
  };
}

function marble(base: [number, number, number], vein: string): Draw {
  return (ctx, S, r) => {
    ctx.fillStyle = shade(base, 1);
    ctx.fillRect(0, 0, S, S);
    for (let k = 0; k < 18; k++) {
      ctx.strokeStyle = vein.replace('A', String(0.05 + r() * 0.25));
      ctx.lineWidth = 0.5 + r() * 2.5;
      ctx.beginPath();
      let x = r() * S;
      let y = r() * S;
      ctx.moveTo(x, y);
      const ang = r() * Math.PI * 2;
      for (let s = 0; s < 40; s++) {
        x += Math.cos(ang + (r() - 0.5) * 1.6) * 14;
        y += Math.sin(ang + (r() - 0.5) * 1.6) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    noise(ctx, S, r, 0.03);
  };
}

const solid =
  (base: [number, number, number], amt: number, blotches = 0): Draw =>
  (ctx, S, r) => {
    ctx.fillStyle = shade(base, 1);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < blotches; i++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 90);
      const dark = r() > 0.5;
      g.addColorStop(0, dark ? `rgba(0,0,0,${0.04 + r() * 0.05})` : `rgba(255,255,255,${0.04 + r() * 0.05})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(r() * S, r() * S);
      ctx.fillStyle = g;
      ctx.fillRect(-130, -130, 260, 260);
      ctx.restore();
    }
    noise(ctx, S, r, amt);
  };

const herringbone =
  (base: [number, number, number]): Draw =>
  (ctx, S, r) => {
    const W = S / 8;
    const L = W * 4;
    ctx.fillStyle = 'rgb(60,40,25)';
    ctx.fillRect(0, 0, S, S);
    const plank = (x: number, y: number, w: number, h: number) => {
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          const px = x + ox;
          const py = y + oy;
          if (px > S || py > S || px + w < 0 || py + h < 0) continue;
          ctx.fillStyle = shade(base, 0.82 + r() * 0.3);
          ctx.fillRect(px + 0.8, py + 0.8, w - 1.6, h - 1.6);
          grain(ctx, px + 0.8, py + 0.8, w - 1.6, h - 1.6, r, w > h, 0.1);
        }
    };
    for (let m = -3; m <= 3; m++)
      for (let k = -10; k <= 10; k++) {
        const bx = k * W + m * L;
        const by = k * W - m * L;
        if (bx > 2 * S || by > 2 * S || bx < -2 * S || by < -2 * S) continue;
        plank(((bx % S) + S) % S, ((by % S) + S) % S, L, W);
        plank(((bx % S) + S) % S, (((by + W) % S) + S) % S, W, L);
      }
  };

const bricks =
  (base: [number, number, number]): Draw =>
  (ctx, S, r) => {
    ctx.fillStyle = 'rgb(200,195,185)';
    ctx.fillRect(0, 0, S, S);
    const rows = 12;
    const cols = 4;
    const h = S / rows;
    const w = S / cols;
    for (let j = 0; j < rows; j++)
      for (let i = -1; i <= cols; i++) {
        const x = i * w + (j % 2 ? w / 2 : 0);
        ctx.fillStyle = shade(base, 0.75 + r() * 0.45);
        ctx.fillRect(x + 2, j * h + 2, w - 4, h - 4);
      }
    noise(ctx, S, r, 0.12, S * S * 0.3, 2);
  };

const stripes =
  (a: string, b: string, n: number): Draw =>
  (ctx, S, r) => {
    const w = S / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? a : b;
      ctx.fillRect(i * w, 0, w, S);
    }
    noise(ctx, S, r, 0.03);
  };

const pattern =
  (bg: string, fg: string): Draw =>
  (ctx, S, r) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = fg;
    const n = 6;
    const s = S / n;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const x = i * s + (j % 2 ? s / 2 : 0);
        const y = j * s;
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.22);
        ctx.lineTo(x + s * 0.14, y);
        ctx.lineTo(x, y + s * 0.22);
        ctx.lineTo(x - s * 0.14, y);
        ctx.closePath();
        ctx.fill();
      }
    noise(ctx, S, r, 0.03);
  };

const terrazzo: Draw = (ctx, S, r) => {
  ctx.fillStyle = 'rgb(232,228,220)';
  ctx.fillRect(0, 0, S, S);
  const cols = ['#b9b2a6', '#8d8a85', '#c97f5a', '#6f7f78', '#e8d9c0', '#3d3d3d'];
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = cols[(r() * cols.length) | 0];
    const x = r() * S;
    const y = r() * S;
    const s = 1 + r() * 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) ctx.lineTo(x + (r() - 0.5) * s * 2, y + (r() - 0.5) * s * 2);
    ctx.fill();
  }
};

const stone: Draw = (ctx, S, r) => {
  ctx.fillStyle = 'rgb(120,115,108)';
  ctx.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S) {
    const h = 30 + r() * 40;
    let x = -r() * 60;
    while (x < S) {
      const w = 40 + r() * 90;
      ctx.fillStyle = shade([190, 182, 170], 0.75 + r() * 0.35);
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      x += w;
    }
    y += h;
  }
  noise(ctx, S, r, 0.12, S * S * 0.3, 2);
};

const carpet: Draw = (ctx, S, r) => {
  ctx.fillStyle = 'rgb(225,222,215)';
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, r, 0.18, S * S * 0.8, 1);
};

const fabric: Draw = (ctx, S, r) => {
  ctx.fillStyle = 'rgb(236,236,236)';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
    ctx.fillRect(i, 0, 1, S);
    ctx.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`;
    ctx.fillRect(0, i, S, 1);
  }
  noise(ctx, S, r, 0.08, S * S * 0.3);
};

const woodLight: Draw = (ctx, S, r) => {
  ctx.fillStyle = 'rgb(245,240,232)';
  ctx.fillRect(0, 0, S, S);
  grain(ctx, 0, 0, S, S, r, true, 0.16);
};

export const FLOOR_MATERIALS: MatPreset[] = [
  { id: 'eiche', label: 'Eiche Landhausdiele', size: 2.0, color: '#ffffff', roughness: 0.6, bump: 0.002, draw: planks([196, 154, 108], 10, 0.35, 0.5) },
  { id: 'eiche_hell', label: 'Eiche hell geölt', size: 2.0, color: '#ffffff', roughness: 0.55, bump: 0.002, draw: planks([222, 196, 156], 10, 0.35, 0.5) },
  { id: 'nussbaum', label: 'Nussbaum Parkett', size: 2.0, color: '#ffffff', roughness: 0.5, bump: 0.002, draw: planks([120, 82, 56], 12, 0.3, 0.4) },
  { id: 'fischgraet', label: 'Fischgrät Eiche', size: 0.72, color: '#ffffff', roughness: 0.55, bump: 0.002, draw: herringbone([200, 160, 112]) },
  { id: 'dielen_weiss', label: 'Dielen weiß lasiert', size: 2.4, color: '#ffffff', roughness: 0.65, bump: 0.002, draw: planks([232, 226, 214], 8, 0.5, 0.5, 'rgba(120,110,95,0.5)') },
  { id: 'laminat_grau', label: 'Laminat Grau-Eiche', size: 2.0, color: '#ffffff', roughness: 0.5, bump: 0.002, draw: planks([160, 156, 148], 10, 0.4, 0.4) },
  { id: 'fliesen60', label: 'Fliesen 60×60', size: 1.2, color: '#e9e6e0', roughness: 0.35, bump: 0.003, draw: tiles([235, 235, 235], 2, 2, 'rgb(170,170,165)') },
  { id: 'fliesen30', label: 'Fliesen 30×30', size: 0.9, color: '#d8d2c8', roughness: 0.35, bump: 0.003, draw: tiles([235, 235, 235], 3, 3, 'rgb(160,160,155)') },
  { id: 'schachbrett', label: 'Schachbrett-Fliesen', size: 0.6, color: '#ffffff', roughness: 0.3, bump: 0.002, draw: (ctx, S, r) => {
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = (i + j) % 2 ? 'rgb(40,40,42)' : 'rgb(238,236,230)';
        ctx.fillRect((i * S) / 2, (j * S) / 2, S / 2, S / 2);
      }
    ctx.strokeStyle = 'rgba(128,128,128,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, S, S);
    ctx.beginPath();
    ctx.moveTo(S / 2, 0);
    ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2);
    ctx.lineTo(S, S / 2);
    ctx.stroke();
    noise(ctx, S, r, 0.03);
  } },
  { id: 'beton', label: 'Beton geschliffen', size: 3, color: '#c8c6c2', roughness: 0.55, draw: solid([225, 225, 225], 0.07, 60) },
  { id: 'marmor', label: 'Marmor Carrara', size: 1.2, color: '#ffffff', roughness: 0.2, draw: marble([238, 238, 236], 'rgba(120,120,125,A)') },
  { id: 'terrazzo', label: 'Terrazzo', size: 1.0, color: '#ffffff', roughness: 0.3, draw: terrazzo },
  { id: 'teppich', label: 'Teppichboden', size: 1.0, color: '#b9b3a7', roughness: 0.95, draw: carpet },
  { id: 'vinyl', label: 'Vinyl / Linoleum (einfarbig)', size: 2, color: '#9ea7a3', roughness: 0.45, draw: solid([235, 235, 235], 0.03, 20) },
];

export const WALL_MATERIALS: MatPreset[] = [
  { id: 'farbe', label: 'Putz gestrichen', size: 2, color: '#f4f1ec', roughness: 0.92, draw: solid([245, 245, 245], 0.035, 0) },
  { id: 'kalkputz', label: 'Kalkputz (wolkig)', size: 2, color: '#e7ddcf', roughness: 0.95, bump: 0.002, draw: solid([235, 235, 235], 0.06, 70) },
  { id: 'ziegel', label: 'Backstein', size: 1.0, color: '#ffffff', roughness: 0.9, bump: 0.004, draw: bricks([170, 88, 62]) },
  { id: 'ziegel_weiss', label: 'Backstein weiß gestrichen', size: 1.0, color: '#ffffff', roughness: 0.9, bump: 0.004, draw: bricks([236, 233, 226]) },
  { id: 'sichtbeton', label: 'Sichtbeton', size: 2.5, color: '#bdbab4', roughness: 0.8, draw: (ctx, S, r) => {
    solid([230, 230, 230], 0.08, 80)(ctx, S, r);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      ctx.beginPath();
      ctx.arc(x * S, y * S, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, S / 2, S, 2);
    ctx.fillRect(S / 2, 0, 2, S);
  } },
  { id: 'holzpaneel', label: 'Holzpaneele vertikal', size: 1.2, color: '#ffffff', roughness: 0.6, bump: 0.002, draw: (ctx, S, r) => {
    const n = 10;
    const w = S / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade([200, 166, 122], 0.85 + r() * 0.25);
      ctx.fillRect(i * w, 0, w, S);
      grain(ctx, i * w, 0, w, S, r, false);
      ctx.fillStyle = 'rgba(40,25,10,0.5)';
      ctx.fillRect(i * w, 0, 2, S);
    }
  } },
  { id: 'metro', label: 'Metro-Fliesen 10×20', size: 0.6, color: '#ffffff', roughness: 0.15, bump: 0.003, draw: tiles([245, 245, 243], 3, 6, 'rgb(190,190,186)', 0.04, true, 3) },
  { id: 'wandfliesen', label: 'Wandfliesen 30×60', size: 1.2, color: '#ece9e4', roughness: 0.25, bump: 0.003, draw: tiles([238, 238, 238], 2, 4, 'rgb(180,180,176)', 0.03, false, 3) },
  { id: 'tapete_streifen', label: 'Tapete Streifen', size: 1.0, color: '#ffffff', roughness: 0.85, draw: stripes('rgb(222,227,226)', 'rgb(240,240,236)', 10) },
  { id: 'tapete_muster', label: 'Tapete Rauten', size: 0.8, color: '#ffffff', roughness: 0.85, draw: pattern('rgb(234,230,222)', 'rgb(176,160,128)') },
  { id: 'naturstein', label: 'Naturstein', size: 1.5, color: '#ffffff', roughness: 0.9, bump: 0.006, draw: stone },
  { id: 'marmor', label: 'Marmor', size: 1.2, color: '#ffffff', roughness: 0.2, draw: marble([238, 238, 236], 'rgba(120,120,125,A)') },
];

export const ALL_MATERIALS = [...FLOOR_MATERIALS, ...WALL_MATERIALS];

export function findPreset(id: string, list: MatPreset[] = ALL_MATERIALS): MatPreset {
  return list.find((m) => m.id === id) ?? ALL_MATERIALS.find((m) => m.id === id) ?? WALL_MATERIALS[0];
}

const canvasCache = new Map<string, HTMLCanvasElement>();
function presetCanvas(p: MatPreset, S = 512): HTMLCanvasElement {
  const key = p.id + ':' + S;
  let c = canvasCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, S, S);
    p.draw(ctx, S, rng(hash(p.id)));
    canvasCache.set(key, c);
  }
  return c;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Vorschau-Daten-URL einer Material-Textur (für die Oberfläche). */
export function presetPreview(id: string, tint: string): string {
  const p = findPreset(id);
  const src = presetCanvas(p);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, 512 * Math.min(1, 0.6 / p.size + 0.3), 512 * Math.min(1, 0.6 / p.size + 0.3), 0, 0, 64, 64);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 64, 64);
  return c.toDataURL();
}

const texCache = new Map<string, THREE.Texture>();
export let maxAnisotropy = 4;
export function setMaxAnisotropy(n: number) {
  maxAnisotropy = n;
}

function presetTexture(p: MatPreset): THREE.Texture {
  let t = texCache.get(p.id);
  if (!t) {
    t = new THREE.CanvasTexture(presetCanvas(p));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAnisotropy;
    t.repeat.set(1 / p.size, 1 / p.size);
    texCache.set(p.id, t);
  }
  return t;
}

const surfCache = new Map<string, THREE.MeshStandardMaterial>();
/** Material für Boden/Wand. UVs der Geometrie müssen in Metern vorliegen. */
export function surfaceMaterial(kind: string, color: string): THREE.MeshStandardMaterial {
  const key = kind + color;
  let m = surfCache.get(key);
  if (!m) {
    const p = findPreset(kind);
    const tex = presetTexture(p);
    m = new THREE.MeshStandardMaterial({
      map: tex,
      color: new THREE.Color(color),
      roughness: p.roughness,
      metalness: p.metalness ?? 0,
    });
    if (p.bump) {
      m.bumpMap = tex;
      m.bumpScale = p.bump * 10;
    }
    surfCache.set(key, m);
  }
  return m;
}

const finishTex = new Map<string, THREE.Texture>();
function finishTexture(kind: 'holz' | 'stoff'): THREE.Texture {
  let t = finishTex.get(kind);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    (kind === 'holz' ? woodLight : fabric)(ctx, 256, rng(kind === 'holz' ? 7 : 11));
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAnisotropy;
    finishTex.set(kind, t);
  }
  return t;
}

const finCache = new Map<string, THREE.MeshStandardMaterial>();
export function finishMaterial(finish: string, color: string): THREE.MeshStandardMaterial {
  const key = finish + color;
  let m = finCache.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    switch (finish) {
      case 'holz':
        m = new THREE.MeshStandardMaterial({ color: c, map: finishTexture('holz'), roughness: 0.6 });
        break;
      case 'stoff':
        m = new THREE.MeshStandardMaterial({ color: c, map: finishTexture('stoff'), roughness: 0.95 });
        break;
      case 'metall':
        m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.8 });
        break;
      case 'glanz':
        m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0 });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    }
    finCache.set(key, m);
  }
  return m;
}
