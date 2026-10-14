// Plansymbole für Haustechnik im Grundriss (angelehnt an Elektro-Installationspläne).
// Koordinaten in Bildschirmpixeln: Ursprung = Wandoberfläche (Mitte der Rückseite),
// +y zeigt in den Raum. Deckenelemente: Ursprung = Mittelpunkt.
import type { ModelType } from './types';

export interface SymbolItem {
  type: ModelType;
  params: Record<string, number>;
  ceiling?: boolean;
}

export function symbolColor(it: SymbolItem): string {
  switch (it.type) {
    case 'socket':
    case 'power':
      return '#c92a2a';
    case 'switch':
    case 'lightpoint':
      return '#d97706';
    case 'data':
      return '#6741d9';
    case 'smoke':
      return '#495057';
    case 'thermostat':
    case 'radiator':
      return '#d9480f';
    case 'water': {
      const k = it.params.kind ?? 0;
      if (k === 2) return '#e03131';
      if (k === 4) return '#5c636a';
      return '#1971c2';
    }
    default:
      return '#495057';
  }
}

/** Mittelpunkt des Symbols relativ zum Ursprung (für Treffertest). */
export function symbolCenter(it: SymbolItem, k: number): { x: number; y: number; r: number } {
  if (it.ceiling) return { x: 0, y: 0, r: 8 * k };
  return { x: 0, y: 9 * k, r: 10 * k };
}

let textRot = 0;
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, bold = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(textRot); // Schrift bleibt lesbar, egal wie die Wand liegt
  ctx.fillStyle = color;
  ctx.font = `${bold ? '700 ' : ''}${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Zeichnet das Symbol; k = Größenfaktor (1 ≈ 18 px). */
export function drawSymbol(ctx: CanvasRenderingContext2D, it: SymbolItem, k: number, opts: { color?: string; bg?: string; textRot?: number } = {}) {
  textRot = opts.textRot ?? 0;
  const col = opts.color ?? symbolColor(it);
  const bg = opts.bg ?? '#ffffff';
  const p = it.params;
  ctx.save();
  ctx.scale(k, k);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = col;
  ctx.fillStyle = bg;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stem = (to: number) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, to);
    ctx.stroke();
  };
  switch (it.type) {
    case 'socket': {
      stem(3);
      // Halbkreis (Rundung zur Wand) mit Schutzkontakt-Strich
      ctx.beginPath();
      ctx.arc(0, 10, 7, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 13);
      ctx.lineTo(5, 13);
      ctx.stroke();
      const n = p.n ?? 1;
      if (n > 1) label(ctx, String(n), 0, 7, 7, col);
      if (p.usb) label(ctx, 'USB', 0, 18.5, 5, col);
      if (p.outdoor) label(ctx, 'IP', 0, 18.5, 5.5, col);
      break;
    }
    case 'switch': {
      stem(5);
      ctx.beginPath();
      ctx.arc(0, 8.5, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const levers = p.dimmer ? 1 : Math.max(1, Math.min(3, p.n ?? 1));
      for (let i = 0; i < levers; i++) {
        const a = Math.PI / 4 + i * 0.32;
        const sx = Math.cos(a) * 3.3;
        const sy = 8.5 + Math.sin(a) * 3.3;
        const ex = Math.cos(a) * 11;
        const ey = 8.5 + Math.sin(a) * 11;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        // Querstrich am Hebelende
        ctx.lineTo(ex + Math.cos(a - Math.PI / 2) * 3, ey + Math.sin(a - Math.PI / 2) * 3);
        ctx.stroke();
      }
      if (p.dimmer) {
        ctx.beginPath();
        ctx.moveTo(-6, 15);
        ctx.lineTo(4, 3);
        ctx.lineTo(1, 3.5);
        ctx.moveTo(4, 3);
        ctx.lineTo(3.5, 6);
        ctx.stroke();
      }
      break;
    }
    case 'power': {
      stem(3);
      ctx.beginPath();
      ctx.rect(-7.5, 3, 15, 13);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      const style = p.style ?? 0;
      label(ctx, style === 2 ? 'EV' : style === 1 ? 'CEE' : '3~', 0, 9.8, style === 1 ? 5.5 : 7, col);
      break;
    }
    case 'data': {
      stem(3);
      ctx.beginPath();
      ctx.moveTo(-7.5, 3);
      ctx.lineTo(7.5, 3);
      ctx.lineTo(0, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const kind = p.kind ?? 0;
      label(ctx, kind === 1 ? 'TV' : kind === 2 ? 'TAE' : 'LAN', 0, 21, 5.5, col);
      break;
    }
    case 'lightpoint': {
      const cy = it.ceiling ? 0 : 9;
      if (!it.ceiling) stem(2.5);
      ctx.beginPath();
      ctx.arc(0, cy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const d = 4.6;
      ctx.beginPath();
      ctx.moveTo(-d, cy - d);
      ctx.lineTo(d, cy + d);
      ctx.moveTo(d, cy - d);
      ctx.lineTo(-d, cy + d);
      ctx.stroke();
      break;
    }
    case 'smoke': {
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, 'RM', 0, 0.5, 6, col);
      break;
    }
    case 'thermostat': {
      stem(3);
      ctx.beginPath();
      ctx.arc(0, 9.5, 6.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, 'ϑ', 0, 10, 8, col);
      break;
    }
    case 'water': {
      const kind = p.kind ?? 0;
      const circle = (x: number, text: string, c: string) => {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, 9.5, 6.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        label(ctx, text, x, 9.9, 5.6, c);
      };
      if (kind === 0) {
        circle(-7, 'WW', '#e03131');
        circle(7, 'KW', '#1971c2');
      } else circle(0, ['KW', 'KW', 'WW', 'WM', 'AW', 'AH'][kind] ?? 'W', col);
      break;
    }
  }
  ctx.restore();
}

/** Legende: Name je Symbol (für die Seitenleiste). */
export const LEGEND: { name: string; it: SymbolItem }[] = [
  { name: 'Steckdose (Zahl = Fach)', it: { type: 'socket', params: { n: 2 } } },
  { name: 'Lichtschalter', it: { type: 'switch', params: { n: 1 } } },
  { name: 'Serienschalter', it: { type: 'switch', params: { n: 2 } } },
  { name: 'Dimmer', it: { type: 'switch', params: { dimmer: 1 } } },
  { name: 'Herdanschluss 400 V', it: { type: 'power', params: { style: 0 } } },
  { name: 'CEE / Wallbox 400 V', it: { type: 'power', params: { style: 1 } } },
  { name: 'Netzwerk / TV / Telefon', it: { type: 'data', params: { kind: 0 } } },
  { name: 'Deckenauslass (Lampe)', it: { type: 'lightpoint', params: {}, ceiling: true } },
  { name: 'Wandauslass', it: { type: 'lightpoint', params: { wall: 1 } } },
  { name: 'Rauchmelder', it: { type: 'smoke', params: {}, ceiling: true } },
  { name: 'Raumthermostat', it: { type: 'thermostat', params: {} } },
  { name: 'Warm- / Kaltwasser', it: { type: 'water', params: { kind: 0 } } },
  { name: 'Waschmaschine', it: { type: 'water', params: { kind: 3 } } },
  { name: 'Abwasser', it: { type: 'water', params: { kind: 4 } } },
];
