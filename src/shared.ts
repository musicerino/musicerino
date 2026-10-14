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
};

type Fn = () => void;
const redrawers = new Set<Fn>();
export function onRedraw(fn: Fn) {
  redrawers.add(fn);
}
export function requestRedraw() {
  for (const f of redrawers) f();
}
