// Möbelkatalog. Maße (B × T × H in cm) orientieren sich an den Herstellerangaben
// der jeweiligen IKEA-Serie; die 3D-Modelle sind vereinfachte Nachbildungen.
import type { CatalogEntry, Finish, ModelType } from './types';

export const COLORS = {
  weiss: '#f1efea',
  schwarzbraun: '#3a2e29',
  eicheWeiss: '#dccbb0',
  eiche: '#c9a374',
  birke: '#e2c99d',
  kiefer: '#e0bd86',
  grau: '#8b8e90',
  anthrazit: '#45484b',
  beige: '#cfc5b3',
  hellgrau: '#bfc1c0',
  dunkelgrau: '#5a5d60',
  gruen: '#5f7a64',
  blau: '#4d6683',
  senf: '#c99a3a',
  schwarz: '#202122',
  chrom: '#c9ccce',
  weissStoff: '#e9e6df',
  terrakotta: '#b4674a',
};

const C = COLORS;

function e(
  id: string,
  category: string,
  name: string,
  desc: string,
  type: ModelType,
  w: number,
  d: number,
  h: number,
  color: string,
  finish: Finish = 'lack',
  params: Record<string, number> = {},
  color2 = C.weiss,
  mount?: number,
): CatalogEntry {
  return { id, category, name, desc, type, w, d, h, color, color2, finish, params, mount };
}

export const CATEGORIES = [
  'Wohnzimmer',
  'Schlafzimmer',
  'Aufbewahrung',
  'Essen',
  'Arbeiten',
  'Küche',
  'Bad',
  'Licht & Deko',
  'Grundformen',
];

export const CATALOG: CatalogEntry[] = [
  // Wohnzimmer
  e('kivik3', 'Wohnzimmer', 'KIVIK 3er-Sofa', 'Hillared anthrazit', 'sofa', 228, 95, 83, C.anthrazit, 'stoff', { seats: 3, arm: 26, legs: 0 }),
  e('kivik2', 'Wohnzimmer', 'KIVIK 2er-Sofa', 'Tibbleby beige', 'sofa', 190, 95, 83, C.beige, 'stoff', { seats: 2, arm: 26, legs: 0 }),
  e('ektorp3', 'Wohnzimmer', 'EKTORP 3er-Sofa', 'Hallarp beige', 'sofa', 218, 88, 88, C.beige, 'stoff', { seats: 3, arm: 20, legs: 0, round: 1 }),
  e('landskrona3', 'Wohnzimmer', 'LANDSKRONA 3er-Sofa', 'Gunnared dunkelgrau / Holz', 'sofa', 204, 89, 78, C.dunkelgrau, 'stoff', { seats: 3, arm: 12, legs: 1 }, C.eiche),
  e('friheten', 'Wohnzimmer', 'FRIHETEN Eckbettsofa', 'Skiftebo dunkelgrau', 'cornersofa', 230, 151, 66, C.dunkelgrau, 'stoff', { chaise: 90 }),
  e('soederhamn', 'Wohnzimmer', 'SÖDERHAMN 3er-Sofa', 'Viarp beige/braun', 'sofa', 198, 99, 83, C.beige, 'stoff', { seats: 3, arm: 0, legs: 0 }),
  e('poaeng', 'Wohnzimmer', 'POÄNG Sessel', 'Birkenfurnier / Knisa hellbeige', 'armchair', 68, 82, 100, C.weissStoff, 'stoff', { style: 2 }, C.birke),
  e('strandmon', 'Wohnzimmer', 'STRANDMON Ohrensessel', 'Djuparp dunkelgrün', 'armchair', 82, 96, 101, C.gruen, 'stoff', { style: 1 }, C.schwarzbraun),
  e('ektorpSessel', 'Wohnzimmer', 'EKTORP Sessel', 'Hallarp grau', 'armchair', 104, 88, 88, C.hellgrau, 'stoff', { style: 0 }),
  e('lackCouch', 'Wohnzimmer', 'LACK Couchtisch', 'weiß', 'table', 90, 55, 45, C.weiss, 'lack', { legW: 5, top: 5, shelf: 1 }),
  e('lackBeistell', 'Wohnzimmer', 'LACK Beistelltisch', 'schwarzbraun', 'table', 55, 55, 45, C.schwarzbraun, 'lack', { legW: 5, top: 5 }),
  e('listerby', 'Wohnzimmer', 'LISTERBY Couchtisch', 'Eichenfurnier', 'table', 140, 60, 45, C.eiche, 'holz', { legW: 5, top: 3 }),
  e('gladom', 'Wohnzimmer', 'GLADOM Tabletttisch', 'schwarz, Ø45', 'table', 45, 45, 53, C.schwarz, 'metall', { round: 1, legW: 1.5, top: 2 }),
  e('bestaTv', 'Wohnzimmer', 'BESTÅ TV-Bank', 'weiß, Schubladen', 'tvbench', 180, 42, 38, C.weiss, 'lack', { doors: 3, legs: 1 }, C.chrom),
  e('lackTv', 'Wohnzimmer', 'LACK TV-Bank', 'schwarzbraun', 'tvbench', 160, 35, 36, C.schwarzbraun, 'lack', { doors: 0, legs: 0 }),
  e('hemnesTv', 'Wohnzimmer', 'HEMNES TV-Bank', 'weiß gebeizt', 'tvbench', 148, 47, 57, C.eicheWeiss, 'holz', { doors: 2, legs: 1, shelf: 1 }),
  e('tv55', 'Wohnzimmer', 'Fernseher 55"', 'Bildschirm mit Standfuß', 'tv', 123, 25, 77, C.schwarz, 'glanz', { stand: 1 }),
  e('tv65wall', 'Wohnzimmer', 'Fernseher 65" (Wand)', 'Wandmontage', 'tv', 145, 4, 84, C.schwarz, 'glanz', { stand: 0 }, C.weiss, 95),
  e('stockholmRug', 'Wohnzimmer', 'STOCKHOLM Teppich', '170×240, gestreift', 'rug', 170, 240, 1, C.beige, 'stoff', { stripes: 1 }, C.hellgrau),
  e('lohals', 'Wohnzimmer', 'LOHALS Teppich', 'Flachgewebe natur 160×230', 'rug', 160, 230, 1, '#c4b08c', 'stoff'),
  e('rugRound', 'Wohnzimmer', 'Teppich rund Ø140', 'Hochflor', 'rug', 140, 140, 2, C.hellgrau, 'stoff', { round: 1 }),

  // Schlafzimmer
  e('malm160', 'Schlafzimmer', 'MALM Bettgestell hoch 160×200', 'Eichenfurnier weiß lasiert', 'bed', 176, 209, 100, C.eicheWeiss, 'holz', { frame: 38 }, C.weissStoff),
  e('malm140', 'Schlafzimmer', 'MALM Bettgestell hoch 140×200', 'weiß', 'bed', 156, 209, 100, C.weiss, 'lack', { frame: 38 }, C.weissStoff),
  e('hemnesBed', 'Schlafzimmer', 'HEMNES Bettgestell 160×200', 'weiß gebeizt', 'bed', 174, 211, 112, C.weiss, 'holz', { frame: 40, legs: 1, foot: 66 }, C.weissStoff),
  e('neiden90', 'Schlafzimmer', 'NEIDEN Bettgestell 90×200', 'Kiefer', 'bed', 96, 206, 76, C.kiefer, 'holz', { frame: 30, legs: 1, foot: 40 }, C.weissStoff),
  e('slattum', 'Schlafzimmer', 'SLATTUM Polsterbett 160×200', 'Vissle dunkelgrau', 'bed', 166, 216, 85, C.dunkelgrau, 'stoff', { frame: 30 }, C.weissStoff),
  e('malmKommode6', 'Schlafzimmer', 'MALM Kommode 6 Schubladen', 'weiß, 160×78', 'dresser', 160, 48, 78, C.weiss, 'lack', { rows: 3, cols: 2 }),
  e('malmKommode4', 'Schlafzimmer', 'MALM Kommode 4 Schubladen', 'Eichenfurnier, 80×100', 'dresser', 80, 48, 100, C.eiche, 'holz', { rows: 4, cols: 1 }),
  e('malmNacht', 'Schlafzimmer', 'MALM Nachttisch', '2 Schubladen, weiß', 'dresser', 40, 48, 55, C.weiss, 'lack', { rows: 2, cols: 1 }),
  e('hemnesKommode8', 'Schlafzimmer', 'HEMNES Kommode 8 Schubladen', 'weiß gebeizt', 'dresser', 160, 50, 96, C.weiss, 'holz', { rows: 4, cols: 2, plinth: 8, knobs: 1 }, C.schwarzbraun),
  e('hemnesNacht', 'Schlafzimmer', 'HEMNES Nachttisch', 'schwarzbraun', 'dresser', 46, 35, 70, C.schwarzbraun, 'holz', { rows: 2, cols: 1, plinth: 8, knobs: 1, open: 1 }, C.chrom),
  e('pax100', 'Schlafzimmer', 'PAX Kleiderschrank 100', '2 Türen, weiß, 100×58×236', 'wardrobe', 100, 58, 236, C.weiss, 'lack', { doors: 2 }, C.chrom),
  e('pax150', 'Schlafzimmer', 'PAX Kleiderschrank 150', '3 Türen, weiß', 'wardrobe', 150, 58, 236, C.weiss, 'lack', { doors: 3 }, C.chrom),
  e('pax200', 'Schlafzimmer', 'PAX Kleiderschrank 200', '4 Türen, Eiche weiß lasiert', 'wardrobe', 200, 58, 236, C.eicheWeiss, 'holz', { doors: 4 }, C.chrom),
  e('pax200s', 'Schlafzimmer', 'PAX Schiebetürschrank 200', 'Hasvik weiß hochglanz', 'wardrobe', 200, 66, 236, C.weiss, 'glanz', { doors: 2, sliding: 1 }, C.chrom),
  e('kleppstad', 'Schlafzimmer', 'KLEPPSTAD Kleiderschrank', '2 Türen, weiß, 117×55×176', 'wardrobe', 117, 55, 176, C.weiss, 'lack', { doors: 2 }, C.weiss),
  e('nissedal', 'Schlafzimmer', 'NISSEDAL Spiegel', '65×150, weiß', 'mirror', 65, 3, 150, C.weiss, 'lack', {}, C.weiss, 40),

  // Aufbewahrung
  e('billy80', 'Aufbewahrung', 'BILLY Bücherregal 80', 'weiß, 80×28×202', 'bookcase', 80, 28, 202, C.weiss, 'lack', { shelves: 5 }),
  e('billy40', 'Aufbewahrung', 'BILLY Bücherregal 40', 'weiß, 40×28×202', 'bookcase', 40, 28, 202, C.weiss, 'lack', { shelves: 5 }),
  e('billy80low', 'Aufbewahrung', 'BILLY Bücherregal 80 niedrig', 'Eichenfurnier, 80×28×106', 'bookcase', 80, 28, 106, C.eiche, 'holz', { shelves: 2 }),
  e('kallax2x2', 'Aufbewahrung', 'KALLAX Regal 2×2', 'weiß, 77×39×77', 'cubeshelf', 77, 39, 77, C.weiss, 'lack', { cols: 2, rows: 2 }),
  e('kallax2x4', 'Aufbewahrung', 'KALLAX Regal 2×4', 'weiß, 77×39×147', 'cubeshelf', 77, 39, 147, C.weiss, 'lack', { cols: 2, rows: 4 }),
  e('kallax4x2', 'Aufbewahrung', 'KALLAX Regal 4×2 liegend', 'Eiche weiß lasiert, 147×39×77', 'cubeshelf', 147, 39, 77, C.eicheWeiss, 'holz', { cols: 4, rows: 2 }),
  e('kallax4x4', 'Aufbewahrung', 'KALLAX Regal 4×4', 'schwarzbraun, 147×39×147', 'cubeshelf', 147, 39, 147, C.schwarzbraun, 'lack', { cols: 4, rows: 4 }),
  e('kallax1x4', 'Aufbewahrung', 'KALLAX Regal 1×4', 'weiß, 42×39×147', 'cubeshelf', 42, 39, 147, C.weiss, 'lack', { cols: 1, rows: 4 }),
  e('ivar', 'Aufbewahrung', 'IVAR Regal', 'Kiefer massiv, 89×30×179', 'openshelf', 89, 30, 179, C.kiefer, 'holz', { shelves: 5, posts: 1 }),
  e('vittsjo', 'Aufbewahrung', 'VITTSJÖ Regal', 'schwarzbraun / Glas, 100×36×175', 'openshelf', 100, 36, 175, C.schwarz, 'metall', { shelves: 4, glass: 1 }),
  e('hemnesVitrine', 'Aufbewahrung', 'HEMNES Vitrine', 'weiß gebeizt, 90×37×197', 'wardrobe', 90, 37, 197, C.weiss, 'holz', { doors: 2, glass: 1 }, C.chrom),
  e('bestaShelf', 'Aufbewahrung', 'BESTÅ Schrank mit Türen', 'weiß, 120×42×64', 'tvbench', 120, 42, 64, C.weiss, 'lack', { doors: 2, legs: 0 }, C.chrom),
  e('lackWand', 'Aufbewahrung', 'LACK Wandregal', 'weiß, 110×26', 'wallshelf', 110, 26, 5, C.weiss, 'lack', {}, C.weiss, 150),
  e('ekby', 'Aufbewahrung', 'BERGSHULT Wandregal', 'Eiche, 80×30', 'wallshelf', 80, 30, 2, C.eiche, 'holz', { brackets: 1 }, C.schwarz, 160),

  // Essen
  e('melltorp', 'Essen', 'MELLTORP Tisch', 'weiß, 125×75', 'table', 125, 75, 74, C.weiss, 'lack', { legW: 4, top: 2.5 }, C.weiss),
  e('ekedalen', 'Essen', 'EKEDALEN Ausziehtisch', 'Eiche, 120×80', 'table', 120, 80, 75, C.eiche, 'holz', { legW: 6, top: 3, apron: 1 }),
  e('lisabo', 'Essen', 'LISABO Tisch', 'Eschenfurnier, 140×78', 'table', 140, 78, 74, C.birke, 'holz', { legW: 5, top: 3, splay: 1 }),
  e('docksta', 'Essen', 'DOCKSTA Tisch rund', 'weiß, Ø103', 'table', 103, 103, 75, C.weiss, 'lack', { round: 1, pedestal: 1, top: 2.5 }),
  e('moerbylanga', 'Essen', 'MÖRBYLÅNGA Tisch', 'Eichenfurnier braun, 220×100', 'table', 220, 100, 75, '#8a6440', 'holz', { legW: 7, top: 4 }),
  e('ingolf', 'Essen', 'INGOLF Stuhl', 'weiß', 'chair', 43, 52, 91, C.weiss, 'lack', { spindles: 1 }),
  e('stefan', 'Essen', 'STEFAN Stuhl', 'braunschwarz', 'chair', 42, 49, 90, C.schwarzbraun, 'holz', { spindles: 1 }),
  e('adde', 'Essen', 'ADDE Stuhl', 'schwarz', 'chair', 39, 47, 77, C.schwarz, 'lack', { metal: 1 }, C.chrom),
  e('odger', 'Essen', 'ODGER Stuhl', 'anthrazit', 'chair', 45, 51, 81, C.anthrazit, 'lack', { shell: 1 }, C.eiche),
  e('frosta', 'Essen', 'FROSTA Hocker', 'Birkenfurnier', 'stool', 35, 35, 45, C.birke, 'holz', { round: 1 }),
  e('nordviken', 'Essen', 'Sitzbank', 'Eiche, 140×38', 'bench', 140, 38, 45, C.eiche, 'holz'),

  // Arbeiten
  e('micke', 'Arbeiten', 'MICKE Schreibtisch', 'weiß, 105×50', 'desk', 105, 50, 75, C.weiss, 'lack', { drawers: 1, side: 1 }),
  e('lagkapten', 'Arbeiten', 'LAGKAPTEN / ALEX Schreibtisch', 'weiß, 140×60', 'desk', 140, 60, 73, C.weiss, 'lack', { drawers: 1, side: 2 }),
  e('malmDesk', 'Arbeiten', 'MALM Schreibtisch', 'Eichenfurnier weiß lasiert, 140×65', 'desk', 140, 65, 73, C.eicheWeiss, 'holz', { drawers: 0, panel: 1 }),
  e('bekant', 'Arbeiten', 'Schreibtisch sitz/steh', 'weiß / schwarz, 160×80', 'desk', 160, 80, 72, C.weiss, 'lack', { drawers: 0, tframe: 1 }, C.schwarz),
  e('alex', 'Arbeiten', 'ALEX Schubladenelement', 'weiß, 36×58×70', 'dresser', 36, 58, 70, C.weiss, 'lack', { rows: 5, cols: 1, nohandles: 1 }),
  e('markus', 'Arbeiten', 'MARKUS Bürostuhl', 'Vissle dunkelgrau', 'officechair', 62, 60, 129, C.dunkelgrau, 'stoff', {}, C.schwarz),
  e('flintan', 'Arbeiten', 'FLINTAN Bürostuhl', 'schwarz', 'officechair', 67, 67, 95, C.schwarz, 'stoff', { low: 1 }, C.schwarz),

  // Küche
  e('metodU60', 'Küche', 'METOD Unterschrank 60', 'Tür, weiß / Arbeitsplatte Eiche', 'kitchenbase', 60, 63.5, 90, C.weiss, 'lack', { doors: 1 }, C.eiche),
  e('metodU80', 'Küche', 'METOD Unterschrank 80', '2 Türen', 'kitchenbase', 80, 63.5, 90, C.weiss, 'lack', { doors: 2 }, C.eiche),
  e('metodS60', 'Küche', 'METOD Schubladenschrank 60', '3 Schubladen', 'kitchenbase', 60, 63.5, 90, C.weiss, 'lack', { drawers: 3 }, C.eiche),
  e('metodSpuele', 'Küche', 'METOD Spülenschrank 80', 'mit Einbauspüle & Armatur', 'sink', 80, 63.5, 90, C.weiss, 'lack', { doors: 2 }, C.eiche),
  e('metodHerd', 'Küche', 'METOD Herdumbau 60', 'Backofen + Kochfeld', 'stove', 60, 63.5, 90, C.weiss, 'lack', {}, C.eiche),
  e('metodO60', 'Küche', 'METOD Oberschrank 60', '60×37×80, weiß', 'kitchenwall', 60, 37, 80, C.weiss, 'lack', { doors: 1 }, C.chrom, 140),
  e('metodO80', 'Küche', 'METOD Oberschrank 80', '80×37×80, weiß', 'kitchenwall', 80, 37, 80, C.weiss, 'lack', { doors: 2 }, C.chrom, 140),
  e('metodH60', 'Küche', 'METOD Hochschrank 60', '60×60×228', 'wardrobe', 60, 62, 228, C.weiss, 'lack', { doors: 1, split: 1 }, C.chrom),
  e('kuehl', 'Küche', 'Kühl-/Gefrierkombination', '60×65×186, Edelstahl', 'fridge', 60, 65, 186, C.chrom, 'metall', {}),
  e('waschm', 'Küche', 'Waschmaschine', '60×60×85', 'washer', 60, 60, 85, '#f4f4f2', 'glanz', {}),

  // Bad
  e('godmorgon80', 'Bad', 'GODMORGON Waschbeckenschrank 80', 'mit Waschbecken, Eiche', 'washbasin', 80, 49, 58, C.eiche, 'holz', { drawers: 2 }, '#f6f6f4', 30),
  e('godmorgon60', 'Bad', 'GODMORGON Waschbeckenschrank 60', 'weiß hochglanz', 'washbasin', 60, 49, 58, C.weiss, 'glanz', { drawers: 2 }, '#f6f6f4', 30),
  e('wanne', 'Bad', 'Badewanne 170×75', 'Acryl weiß', 'bathtub', 170, 75, 58, '#f6f6f4', 'glanz'),
  e('dusche', 'Bad', 'Dusche 90×90', 'mit Glaswand', 'shower', 90, 90, 200, '#f6f6f4', 'glanz', {}, C.chrom),
  e('wc', 'Bad', 'WC (wandhängend)', '37×54', 'toilet', 37, 54, 40, '#f6f6f4', 'glanz', { wall: 1 }),
  e('wcStand', 'Bad', 'Stand-WC mit Spülkasten', '37×68', 'toilet', 37, 68, 80, '#f6f6f4', 'glanz', {}),
  e('heizkoerper', 'Bad', 'Heizkörper', '100×10×60', 'radiator', 100, 10, 60, '#f3f3f1', 'lack', {}, C.weiss, 15),
  e('handtuchHk', 'Bad', 'Handtuchheizkörper', '60×5×120', 'radiator', 60, 5, 120, '#f3f3f1', 'lack', { towel: 1 }, C.weiss, 40),

  // Licht & Deko
  e('hektar', 'Licht & Deko', 'HEKTAR Stehleuchte', 'dunkelgrau', 'floorlamp', 40, 40, 181, C.anthrazit, 'metall', { shade: 1 }),
  e('hoelvik', 'Licht & Deko', 'Stehleuchte mit Stoffschirm', 'weiß / Messing', 'floorlamp', 45, 45, 155, C.weissStoff, 'stoff', { shade: 0 }, '#b8975a'),
  e('ranarp', 'Licht & Deko', 'RANARP Tischleuchte', 'schwarz', 'tablelamp', 20, 20, 37, C.schwarz, 'metall'),
  e('skaftet', 'Licht & Deko', 'Tischleuchte Stoffschirm', 'weiß', 'tablelamp', 25, 25, 45, C.weissStoff, 'stoff', { cloth: 1 }, C.chrom),
  e('pendel', 'Licht & Deko', 'Pendelleuchte', 'Ø40, weiß', 'pendant', 40, 40, 30, C.weiss, 'lack', {}, C.schwarz, 200),
  e('fejkaGross', 'Licht & Deko', 'Zimmerpflanze groß', 'im Topf, Ø35', 'plant', 50, 50, 150, C.gruen, 'lack', { tall: 1 }, C.terrakotta),
  e('fejkaKlein', 'Licht & Deko', 'Zimmerpflanze klein', 'im Topf', 'plant', 25, 25, 45, C.gruen, 'lack', {}, C.weiss),
  e('ribba', 'Licht & Deko', 'RIBBA Bilderrahmen 50×70', 'schwarz, Wand', 'picture', 50, 4, 70, C.schwarz, 'lack', {}, '#b9c6c9', 130),
  e('bild100', 'Licht & Deko', 'Leinwandbild 100×70', 'Wand', 'picture', 100, 3, 70, C.eiche, 'holz', { canvas: 1 }, '#d4b483', 120),
  e('spiegelRund', 'Licht & Deko', 'Spiegel rund Ø60', 'Wand', 'mirror', 60, 3, 60, '#b8975a', 'metall', { round: 1 }, C.weiss, 140),
  e('vorhang', 'Licht & Deko', 'Vorhang', '145×250, leinen', 'curtain', 145, 8, 250, C.weissStoff, 'stoff'),

  // Grundformen
  e('box', 'Grundformen', 'Quader', 'frei skalierbar', 'box', 60, 60, 60, C.hellgrau, 'lack'),
  e('zyl', 'Grundformen', 'Zylinder', 'frei skalierbar', 'cylinder', 50, 50, 80, C.hellgrau, 'lack'),
  e('saeule', 'Grundformen', 'Stütze / Pfeiler', '30×30, raumhoch', 'box', 30, 30, 250, '#e5e3df', 'lack'),
  e('podest', 'Grundformen', 'Podest', '200×100×20', 'box', 200, 100, 20, C.eiche, 'holz'),
];

/** Möbeltypen, die man im "Eigenes Möbel"-Formular wählen kann, inkl. sinnvoller Parameter. */
export const TYPE_INFO: Record<ModelType, { label: string; params?: { key: string; label: string; min: number; max: number; def: number }[] }> = {
  box: { label: 'Quader / Korpus' },
  cylinder: { label: 'Zylinder / rund' },
  bookcase: { label: 'Bücherregal (Rückwand)', params: [{ key: 'shelves', label: 'Böden', min: 0, max: 12, def: 4 }] },
  cubeshelf: {
    label: 'Fächerregal (KALLAX-Stil)',
    params: [
      { key: 'cols', label: 'Spalten', min: 1, max: 8, def: 2 },
      { key: 'rows', label: 'Reihen', min: 1, max: 8, def: 2 },
    ],
  },
  openshelf: { label: 'Offenes Regal (Pfosten)', params: [{ key: 'shelves', label: 'Böden', min: 2, max: 12, def: 5 }] },
  wardrobe: { label: 'Schrank mit Türen', params: [{ key: 'doors', label: 'Türen', min: 1, max: 8, def: 2 }, { key: 'sliding', label: 'Schiebetüren (0/1)', min: 0, max: 1, def: 0 }, { key: 'glass', label: 'Glastüren (0/1)', min: 0, max: 1, def: 0 }] },
  dresser: {
    label: 'Kommode / Schubladen',
    params: [
      { key: 'rows', label: 'Reihen', min: 1, max: 8, def: 3 },
      { key: 'cols', label: 'Spalten', min: 1, max: 4, def: 1 },
      { key: 'plinth', label: 'Sockel (cm)', min: 0, max: 20, def: 0 },
    ],
  },
  bed: { label: 'Bett', params: [{ key: 'frame', label: 'Rahmenhöhe (cm)', min: 15, max: 60, def: 35 }, { key: 'foot', label: 'Fußteil (cm, 0=ohne)', min: 0, max: 100, def: 0 }] },
  sofa: {
    label: 'Sofa',
    params: [
      { key: 'seats', label: 'Sitzplätze', min: 1, max: 6, def: 3 },
      { key: 'arm', label: 'Armlehnenbreite (cm)', min: 0, max: 40, def: 20 },
      { key: 'legs', label: 'Holzfüße (0/1)', min: 0, max: 1, def: 0 },
    ],
  },
  cornersofa: { label: 'Ecksofa', params: [{ key: 'chaise', label: 'Breite Récamiere (cm)', min: 60, max: 150, def: 90 }, { key: 'left', label: 'Récamiere links (0/1)', min: 0, max: 1, def: 0 }] },
  armchair: { label: 'Sessel', params: [{ key: 'style', label: 'Stil (0=Polster,1=Ohren,2=Schwinger)', min: 0, max: 2, def: 0 }] },
  chair: { label: 'Stuhl' },
  officechair: { label: 'Bürostuhl' },
  stool: { label: 'Hocker', params: [{ key: 'round', label: 'rund (0/1)', min: 0, max: 1, def: 1 }] },
  bench: { label: 'Bank' },
  table: {
    label: 'Tisch',
    params: [
      { key: 'round', label: 'rund (0/1)', min: 0, max: 1, def: 0 },
      { key: 'legW', label: 'Beinstärke (cm)', min: 2, max: 15, def: 5 },
      { key: 'top', label: 'Plattenstärke (cm)', min: 1, max: 10, def: 3 },
      { key: 'pedestal', label: 'Mittelfuß (0/1)', min: 0, max: 1, def: 0 },
    ],
  },
  desk: { label: 'Schreibtisch', params: [{ key: 'drawers', label: 'Schubladencontainer (0/1)', min: 0, max: 1, def: 1 }] },
  tvbench: { label: 'Lowboard / Sideboard', params: [{ key: 'doors', label: 'Fronten', min: 0, max: 6, def: 2 }, { key: 'legs', label: 'Füße (0/1)', min: 0, max: 1, def: 1 }] },
  kitchenbase: { label: 'Küchen-Unterschrank', params: [{ key: 'doors', label: 'Türen', min: 0, max: 3, def: 1 }, { key: 'drawers', label: 'Schubladen (statt Türen)', min: 0, max: 5, def: 0 }] },
  kitchenwall: { label: 'Küchen-Hängeschrank', params: [{ key: 'doors', label: 'Türen', min: 1, max: 3, def: 1 }] },
  sink: { label: 'Spülenschrank', params: [{ key: 'doors', label: 'Türen', min: 1, max: 3, def: 2 }] },
  stove: { label: 'Herd / Backofen' },
  fridge: { label: 'Kühlschrank' },
  washer: { label: 'Wasch-/Spülmaschine' },
  bathtub: { label: 'Badewanne' },
  shower: { label: 'Dusche' },
  toilet: { label: 'WC', params: [{ key: 'wall', label: 'wandhängend (0/1)', min: 0, max: 1, def: 1 }] },
  washbasin: { label: 'Waschtisch', params: [{ key: 'drawers', label: 'Schubladen', min: 0, max: 3, def: 2 }] },
  floorlamp: { label: 'Stehleuchte', params: [{ key: 'shade', label: 'Schirm (0=Stoff,1=Metall)', min: 0, max: 1, def: 0 }] },
  tablelamp: { label: 'Tischleuchte' },
  pendant: { label: 'Pendelleuchte' },
  plant: { label: 'Pflanze' },
  rug: { label: 'Teppich', params: [{ key: 'round', label: 'rund (0/1)', min: 0, max: 1, def: 0 }, { key: 'stripes', label: 'gestreift (0/1)', min: 0, max: 1, def: 0 }] },
  mirror: { label: 'Spiegel', params: [{ key: 'round', label: 'rund (0/1)', min: 0, max: 1, def: 0 }] },
  picture: { label: 'Bild / Rahmen' },
  wallshelf: { label: 'Wandboard' },
  tv: { label: 'Fernseher', params: [{ key: 'stand', label: 'Standfuß (0/1)', min: 0, max: 1, def: 1 }] },
  radiator: { label: 'Heizkörper' },
  curtain: { label: 'Vorhang' },
};

export const FINISHES: { id: Finish; label: string }[] = [
  { id: 'lack', label: 'Matt lackiert' },
  { id: 'glanz', label: 'Hochglanz' },
  { id: 'holz', label: 'Holz' },
  { id: 'stoff', label: 'Stoff / Polster' },
  { id: 'metall', label: 'Metall' },
];
