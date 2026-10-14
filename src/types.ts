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

export type WallKind = 'solid' | 'glass';

export interface Wall {
  id: ID;
  a: P;
  b: P;
  thickness: number;
  height: number;
  material?: SurfaceMat | null; // null/undefined = Standard-Wandmaterial des Projekts
  kind?: WallKind; // Massivwand (Standard) oder Glaswand
}

/** Verkleidung auf einem Teil einer Wandseite (Fliesen, Paneele, Backstein, Farbfläche …). */
export interface Cladding {
  id: ID;
  wallId: ID;
  side: 1 | -1;
  start: number; // cm ab Wandanfang (Achse)
  length: number; // cm
  bottom: number; // Unterkante über Fußboden (cm)
  top: number; // Oberkante über Fußboden (cm)
  material: SurfaceMat;
  thickness: number; // cm, z.B. Fliese + Kleber ≈ 1, Paneele ≈ 2
}

export type OpeningType = 'window' | 'door' | 'french' | 'passage';

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
  overhang?: number; // Balkon / Vordach über der Öffnung (Tiefe in cm, außen)
}

export type Finish = 'lack' | 'holz' | 'stoff' | 'metall' | 'glanz';

export type BaseboardProfile = 'gerade' | 'rund' | 'klassisch';

export interface BaseboardStyle {
  height: number; // cm
  depth: number; // cm (Stärke, ab Wandoberfläche)
  color: string;
  finish: Finish;
  profile: BaseboardProfile;
}

/** Fußleiste rundum für einen Raum (folgt den Wänden automatisch, Türen werden ausgespart). */
export interface RoomBaseboard extends BaseboardStyle {
  on: boolean;
  skip?: ID[]; // Wände, an denen keine Fußleiste sein soll
  pieceLength?: number; // handelsübliche Stücklänge für die Bedarfsrechnung (cm)
}

/** Einzelnes Fußleisten-Stück an einer Wandseite (für geteilte / teilweise Fußleisten). */
export interface Baseboard extends BaseboardStyle {
  id: ID;
  wallId: ID;
  side: 1 | -1; // Wandseite (Richtung der Wand-Normalen)
  start: number; // Abstand ab Wandanfang (Achse) in cm
  length: number; // cm
}

export interface Room {
  id: ID;
  name: string;
  points: P[]; // Polygon auf Wandachsen
  floor: SurfaceMat;
  baseboard?: RoomBaseboard | null;
  floorHeating?: boolean;
}

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
  | 'curtain'
  // Haustechnik
  | 'socket'
  | 'switch'
  | 'power'
  | 'data'
  | 'lightpoint'
  | 'smoke'
  | 'thermostat'
  | 'water'
  | 'distbox';

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
  ceiling?: boolean; // an der Decke montiert (Deckenauslass, Rauchmelder)
  locked?: boolean;
}

export interface Site {
  lat: number;
  lon: number;
  north: number; // Grad: Richtung von Norden im Grundriss, im Uhrzeigersinn ab "oben"
  tz: string; // IANA-Zeitzone
  date: string; // YYYY-MM-DD
  minutes: number; // Uhrzeit (lokal) in Minuten seit Mitternacht
  horizon?: number; // Verschattung durch Nachbarbebauung/Bäume: Horizonthöhe in Grad
}

export interface CatalogEntry extends ItemSpec {
  id: string;
  name: string;
  desc: string;
  category: string;
  mount?: number;
  ceiling?: boolean;
  custom?: boolean;
}

export interface Project {
  version: 1;
  name: string;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
  baseboards: Baseboard[];
  claddings: Cladding[];
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
  | { kind: 'baseboard'; id: ID }
  | { kind: 'cladding'; id: ID }
  | null;
