// Nicht gespeicherter, ansichtsübergreifender Zustand.
export interface HeatData {
  cells: { x: number; y: number; hours: number }[];
  step: number;
  label: string;
}

export const ui = {
  heat: null as HeatData | null,
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
