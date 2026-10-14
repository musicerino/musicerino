// Alle Längen im Datenmodell in Zentimetern. Grundriss-Koordinaten: x nach rechts, y nach unten.

export type ID = string;

export interface P {
  x: number;
  y: number;
}

export interface SurfaceMat {
  kind: string; // id aus textures.ts (FLOOR_MATERIALS / WALL_MATERIALS)
  color: string; // Tönung (#rrggbb)
}

export interface Wall {
  id: ID;
  a: P;
  b: P;
  thickness: number;
  height: number;
  material?: SurfaceMat | null; // null/undefined = Standard-Wandmaterial des Projekts
}

export type OpeningType = 'window' | 'door' | 'french';

export interface Opening {
  id: ID;
  wallId: ID;
  type: OpeningType;
  offset: number; // Abstand Wandanfang → Mitte der Öffnung
  width: number;
  height: number;
  sill: number; // Brüstungshöhe (Unterkante über Boden)
  hingeRight?: boolean; // Tür: Anschlag rechts
  swingOut?: boolean; // Tür: öffnet zur anderen Wandseite
  frameColor?: string;
}

export interface Room {
  id: ID;
  name: string;
  points: P[]; // Polygon auf Wandachsen
  floor: SurfaceMat;
}

export type Finish = 'lack' | 'holz' | 'stoff' | 'metall' | 'glanz';

export type ModelType =
  | 'box'
  | 'cylinder'
  | 'bookcase'
  | 'cubeshelf'
  | 'openshelf'
  | 'wardrobe'
  | 'dresser'
  | 'bed'
  | 'sofa'
  | 'cornersofa'
  | 'armchair'
  | 'chair'
  | 'officechair'
  | 'stool'
  | 'bench'
  | 'table'
  | 'desk'
  | 'tvbench'
  | 'kitchenbase'
  | 'kitchenwall'
  | 'sink'
  | 'stove'
  | 'fridge'
  | 'washer'
  | 'bathtub'
  | 'shower'
  | 'toilet'
  | 'washbasin'
  | 'floorlamp'
  | 'tablelamp'
  | 'pendant'
  | 'plant'
  | 'rug'
  | 'mirror'
  | 'picture'
  | 'wallshelf'
  | 'tv'
  | 'radiator'
  | 'curtain';

export interface ItemSpec {
  type: ModelType;
  w: number; // Breite (x)
  d: number; // Tiefe (y im Grundriss / z in 3D)
  h: number; // Höhe
  color: string;
  color2: string;
  finish: Finish;
  params: Record<string, number>;
}

export interface Item extends ItemSpec {
  id: ID;
  name: string;
  catalogId?: string;
  x: number; // Mittelpunkt im Grundriss
  y: number;
  z: number; // Unterkante über Boden
  rot: number; // Grad, im Uhrzeigersinn (Draufsicht)
  mount?: number; // Montagehöhe, wenn nicht gestapelt (z.B. Hängeschrank)
  locked?: boolean;
}

export interface Site {
  lat: number;
  lon: number;
  north: number; // Grad: Richtung von Norden im Grundriss, im Uhrzeigersinn ab "oben"
  tz: string; // IANA-Zeitzone
  date: string; // YYYY-MM-DD
  minutes: number; // Uhrzeit (lokal) in Minuten seit Mitternacht
}

export interface CatalogEntry extends ItemSpec {
  id: string;
  name: string;
  desc: string;
  category: string;
  mount?: number;
  custom?: boolean;
}

export interface Project {
  version: 1;
  name: string;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
  wallMat: SurfaceMat;
  ceilingColor: string;
  defaults: { wallHeight: number; wallThickness: number };
  site: Site;
  customCatalog: CatalogEntry[];
}

export type Selection =
  | { kind: 'wall'; id: ID }
  | { kind: 'opening'; id: ID }
  | { kind: 'item'; id: ID }
  | { kind: 'room'; id: ID }
  | null;
