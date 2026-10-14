// Nicht gespeicherter, ansichtsübergreifender Zustand.
export interface HeatData {
  cells: { x: number; y: number; hours: number }[];
  step: number;
  label: string;
}

import type { P } from './types';

/** Farbige Analyse-Ebene über dem Boden (z.B. Lichtzonen), 1 Pixel = 1 Rasterzelle. */
export interface Overlay {
  canvas: HTMLCanvasElement;
  x0: number; // Weltkoordinate (cm) der Mitte der ersten Zelle
  y0: number;
  step: number; // Zellgröße in cm
  clip: P[][]; // Raumpolygone
  alpha: number;
  markers?: { x: number; y: number; label: string; color: string }[];
  info?: (p: P) => string | null;
}

export const ui = {
  heat: null as HeatData | null,
  overlay: null as Overlay | null,
  showDims: true,
  showItemDims: true,
  /** Haustechnik im Plan: anzeigen, hervorheben (Möbel blass) oder ausblenden */
  tech: 'show' as 'show' | 'focus' | 'hide',
};

type Fn = () => void;
const redrawers = new Set<Fn>();
export function onRedraw(fn: Fn) {
  redrawers.add(fn);
}
export function requestRedraw() {
  for (const f of redrawers) f();
}
