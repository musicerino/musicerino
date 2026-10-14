// Pflanzendatenbank (Lichtansprüche gängiger Zimmerpflanzen und Kräuter), Suche und Standortempfehlung.
import type { P, Project } from './types';
import type { LightCell, LightMap, Zone } from './daylight';
import { cellsCenter, describeSpot, compassWord } from './daylight';

export type LightCat = 'vollsonne' | 'sonnig' | 'hellSonne' | 'hellIndirekt' | 'halbschatten' | 'schatten' | 'robust';

export const LIGHT_CATS: Record<LightCat, { label: string; text: string; ideal: Zone[]; ok: Zone[]; noMidday: boolean }> = {
  vollsonne: { label: 'Volle Sonne', text: 'Braucht möglichst viel direkte Sonne – mindestens 4 Stunden, am besten am Südfenster.', ideal: ['sonnig'], ok: ['halbschattig'], noMidday: false },
  sonnig: { label: 'Sonnig bis halbschattig', text: 'Mag direkte Sonne, kommt aber auch mit einigen Stunden Sonne am Tag gut zurecht.', ideal: ['sonnig', 'halbschattig'], ok: ['hell'], noMidday: false },
  hellSonne: { label: 'Hell mit etwas Sonne', text: 'Sehr hell, gerne mit Morgen- oder Abendsonne – aber keine pralle Mittagssonne im Sommer.', ideal: ['halbschattig', 'hell'], ok: ['sonnig'], noMidday: true },
  hellIndirekt: { label: 'Hell, ohne direkte Sonne', text: 'Viel Tageslicht in Fensternähe, aber geschützt vor praller Sonne.', ideal: ['hell'], ok: ['halbschattig', 'schattig'], noMidday: true },
  halbschatten: { label: 'Halbschattig bis schattig', text: 'Kommt mit weniger Licht aus; direkte Sonne besser meiden.', ideal: ['hell', 'schattig'], ok: ['halbschattig'], noMidday: true },
  schatten: { label: 'Schattig', text: 'Verträgt auch dunklere Ecken weit weg vom Fenster.', ideal: ['schattig', 'hell'], ok: ['dunkel', 'halbschattig'], noMidday: true },
  robust: { label: 'Sehr anpassungsfähig', text: 'Wächst von sonnig bis halbschattig, verträgt auch Schatten (wächst dann langsamer).', ideal: ['sonnig', 'halbschattig', 'hell'], ok: ['schattig'], noMidday: false },
};

export interface Plant {
  name: string;
  bot: string;
  aka: string[];
  light: LightCat;
  size: 'gross' | 'mittel' | 'klein';
  note: string;
}

const pl = (name: string, bot: string, aka: string[], light: LightCat, size: Plant['size'], note: string): Plant => ({ name, bot, aka, light, size, note });

export const PLANTS: Plant[] = [
  pl('Monstera', 'Monstera deliciosa', ['Fensterblatt', 'Monstera deliciosa', 'Philodendron Monstera'], 'hellIndirekt', 'gross', 'Verträgt auch etwas Morgensonne; pralle Mittagssonne verbrennt die Blätter.'),
  pl('Affenmaske', 'Monstera adansonii', ['Monstera adansonii', 'Monkey Mask'], 'hellIndirekt', 'mittel', 'Mag hohe Luftfeuchte, rankt gern.'),
  pl('Geigenfeige', 'Ficus lyrata', ['Ficus lyrata', 'Geigenblattfeige'], 'hellSonne', 'gross', 'Braucht sehr viel Licht; Standortwechsel möglichst vermeiden.'),
  pl('Gummibaum', 'Ficus elastica', ['Ficus elastica'], 'hellSonne', 'gross', 'Je heller, desto kompakter der Wuchs; pralle Mittagssonne meiden.'),
  pl('Birkenfeige', 'Ficus benjamina', ['Ficus benjamina', 'Benjamini'], 'hellSonne', 'gross', 'Wirft bei Lichtmangel oder nach einem Umzug gern Blätter ab.'),
  pl('Ficus Ginseng', "Ficus microcarpa 'Ginseng'", ['Ginseng-Ficus', 'Bonsai-Ficus', 'Ficus microcarpa'], 'hellSonne', 'klein', 'Hell, gern mit Morgen- oder Abendsonne.'),
  pl('Glücksfeder', 'Zamioculcas zamiifolia', ['Zamioculcas', 'ZZ-Pflanze', 'Zamie'], 'schatten', 'mittel', 'Sehr genügsam, kommt mit wenig Licht aus; keine pralle Sonne. Sparsam gießen.'),
  pl('Bogenhanf', 'Dracaena trifasciata', ['Sansevieria', 'Schwiegermutterzunge', 'Dracaena trifasciata', 'Sansevieria cylindrica'], 'robust', 'mittel', 'Wächst von sonnig bis schattig – bei wenig Licht nur langsamer. Sparsam gießen.'),
  pl('Efeutute', 'Epipremnum aureum', ['Epipremnum', 'Pothos', 'Scindapsus'], 'halbschatten', 'klein', 'Sehr anpassungsfähig; buntblättrige Sorten brauchen etwas mehr Licht.'),
  pl('Grünlilie', 'Chlorophytum comosum', ['Chlorophytum'], 'hellSonne', 'klein', 'Hell bis halbschattig, verträgt etwas Sonne.'),
  pl('Einblatt', 'Spathiphyllum', ['Spathiphyllum', 'Friedenslilie', 'Scheidenblatt'], 'halbschatten', 'mittel', 'Direkte Sonne meiden; mag gleichmäßig feuchte Erde.'),
  pl('Schusterpalme', 'Aspidistra elatior', ['Aspidistra', 'Metzgerpalme'], 'schatten', 'mittel', 'Eine der robustesten Pflanzen für dunkle Ecken.'),
  pl('Kentiapalme', 'Howea forsteriana', ['Kentia', 'Howea'], 'hellIndirekt', 'gross', 'Hell ohne Mittagssonne, verträgt auch Halbschatten.'),
  pl('Goldfruchtpalme', 'Dypsis lutescens', ['Areca', 'Arecapalme', 'Chrysalidocarpus'], 'hellIndirekt', 'gross', 'Braucht viel Licht, aber keine pralle Sonne.'),
  pl('Bergpalme', 'Chamaedorea elegans', ['Chamaedorea', 'Zimmerpalme'], 'halbschatten', 'mittel', 'Kommt mit wenig Licht aus; direkte Sonne meiden.'),
  pl('Yucca-Palme', 'Yucca elephantipes', ['Yucca', 'Palmlilie'], 'sonnig', 'gross', 'Braucht viel Licht und gern direkte Sonne; im Sommer auch draußen.'),
  pl('Drachenbaum', 'Dracaena marginata', ['Dracaena', 'Dracaena marginata'], 'hellIndirekt', 'gross', 'Hell bis halbschattig, keine pralle Sonne.'),
  pl('Duftdracaena', 'Dracaena fragrans', ['Dracaena fragrans', 'Massangeana'], 'halbschatten', 'gross', 'Verträgt auch halbschattige Plätze.'),
  pl('Elefantenfuß', 'Beaucarnea recurvata', ['Beaucarnea', 'Flaschenbaum'], 'sonnig', 'mittel', 'Sonnig und hell, wenig gießen.'),
  pl('Kakteen', 'Cactaceae', ['Kaktus', 'Opuntie', 'Feigenkaktus', 'Säulenkaktus'], 'vollsonne', 'klein', 'Möglichst viel direkte Sonne; im Winter kühl und trocken.'),
  pl('Aloe vera', 'Aloe vera', ['Aloe'], 'sonnig', 'klein', 'Sonnig bis hell; nach dem Winter langsam an pralle Sonne gewöhnen.'),
  pl('Geldbaum', 'Crassula ovata', ['Crassula', 'Pfennigbaum', 'Jadebaum'], 'sonnig', 'mittel', 'Verträgt direkte Sonne; sparsam gießen.'),
  pl('Sukkulenten', 'Echeveria u.a.', ['Echeverie', 'Echeveria', 'Sukkulente', 'Hauswurz'], 'vollsonne', 'klein', 'Brauchen viel direkte Sonne, sonst wachsen sie lang und blass.'),
  pl('Erbsenpflanze', 'Curio rowleyanus', ['Senecio rowleyanus', 'Perlenkette', 'String of Pearls'], 'hellSonne', 'klein', 'Hell mit Morgen- oder Abendsonne, sparsam gießen.'),
  pl('Olivenbaum', 'Olea europaea', ['Olive', 'Olivenbäumchen'], 'vollsonne', 'gross', 'Vollsonnig – drinnen nur am hellsten Südfenster, besser im Sommer draußen.'),
  pl('Zitronenbaum', 'Citrus limon', ['Zitrone', 'Zitruspflanze', 'Citrus', 'Calamondin', 'Orangenbäumchen', 'Kumquat'], 'vollsonne', 'gross', 'Sehr viel Sonne; im Winter hell und kühl.'),
  pl('Strelitzie', 'Strelitzia reginae', ['Paradiesvogelblume', 'Strelitzia', 'Strelitzia nicolai'], 'sonnig', 'gross', 'Sonnig bis hell, verträgt direkte Sonne.'),
  pl('Calathea', 'Goeppertia', ['Korbmarante', 'Goeppertia', 'Calathea orbifolia'], 'hellIndirekt', 'mittel', 'Keine direkte Sonne und hohe Luftfeuchte – ideal im hellen Bad.'),
  pl('Pfeilwurz', 'Maranta leuconeura', ['Maranta', 'Gebetspflanze'], 'halbschatten', 'klein', 'Keine direkte Sonne, hohe Luftfeuchte.'),
  pl('Schwertfarn', 'Nephrolepis exaltata', ['Farn', 'Nephrolepis', 'Boston-Farn', 'Zimmerfarn'], 'halbschatten', 'mittel', 'Hell bis halbschattig ohne direkte Sonne, mag Luftfeuchte.'),
  pl('Frauenhaarfarn', 'Adiantum raddianum', ['Adiantum', 'Venushaarfarn'], 'halbschatten', 'klein', 'Hohe Luftfeuchte, nie austrocknen lassen.'),
  pl('Orchidee', 'Phalaenopsis', ['Phalaenopsis', 'Schmetterlingsorchidee', 'Orchideen'], 'hellIndirekt', 'klein', 'Hell ohne direkte Mittagssonne – ideal ist ein Ost- oder Westfenster.'),
  pl('Elefantenohr', 'Alocasia', ['Alocasia', 'Pfeilblatt'], 'hellIndirekt', 'mittel', 'Hell ohne direkte Sonne, warm und luftfeucht.'),
  pl('Baumfreund', 'Philodendron', ['Philodendron', 'Kletterphilodendron', 'Philodendron scandens'], 'halbschatten', 'mittel', 'Hell bis halbschattig, keine pralle Sonne.'),
  pl('Philodendron Pink Princess', "Philodendron erubescens 'Pink Princess'", ['Pink Princess'], 'hellIndirekt', 'mittel', 'Viel indirektes Licht erhält die rosa Färbung.'),
  pl('Purpurtute', 'Syngonium podophyllum', ['Syngonium', 'Fußblatt'], 'halbschatten', 'klein', 'Hell bis halbschattig, keine pralle Sonne.'),
  pl('Ufopflanze', 'Pilea peperomioides', ['Pilea', 'Glückstaler', 'Bauchnabelpflanze'], 'hellSonne', 'klein', 'Hell, gern mit etwas Morgensonne; regelmäßig drehen.'),
  pl('Peperomie', 'Peperomia', ['Peperomia', 'Zwergpfeffer'], 'hellIndirekt', 'klein', 'Hell bis halbschattig, keine pralle Sonne.'),
  pl('Efeu', 'Hedera helix', ['Hedera', 'Zimmerefeu'], 'halbschatten', 'klein', 'Mag es halbschattig und eher kühl.'),
  pl('Zimmeraralie', 'Fatsia japonica', ['Fatsia'], 'halbschatten', 'gross', 'Halbschattig, ein kühler Standort wird gern genommen.'),
  pl('Dieffenbachie', 'Dieffenbachia', ['Dieffenbachia'], 'hellIndirekt', 'mittel', 'Hell ohne direkte Sonne, verträgt auch Halbschatten.'),
  pl('Kolbenfaden', 'Aglaonema', ['Aglaonema'], 'schatten', 'mittel', 'Kommt mit wenig Licht aus; grüne Sorten sind am genügsamsten.'),
  pl('Fittonie', 'Fittonia albivenis', ['Fittonia', 'Silbernetzblatt'], 'halbschatten', 'klein', 'Halbschattig und luftfeucht, z.B. im Bad.'),
  pl('Dreimasterblume', 'Tradescantia', ['Tradescantia', 'Zebrakraut'], 'hellSonne', 'klein', 'Bunte Sorten färben sich mit etwas Sonne kräftiger.'),
  pl('Wachsblume', 'Hoya carnosa', ['Hoya', 'Porzellanblume'], 'hellSonne', 'klein', 'Hell mit etwas Sonne – dann blüht sie auch.'),
  pl('Bananenpflanze', 'Musa', ['Banane', 'Musa'], 'sonnig', 'gross', 'Viel Licht und Wärme, verträgt Sonne.'),
  pl('Strahlenaralie', 'Schefflera arboricola', ['Schefflera'], 'hellSonne', 'gross', 'Hell bis halbschattig, verträgt Morgensonne.'),
  pl('Wunderstrauch', 'Codiaeum variegatum', ['Croton', 'Codiaeum'], 'sonnig', 'mittel', 'Braucht viel Licht für die bunte Färbung, auch etwas Sonne.'),
  pl('Glückskastanie', 'Pachira aquatica', ['Pachira', 'Wasserkastanie'], 'hellIndirekt', 'gross', 'Hell ohne pralle Mittagssonne.'),
  pl('Zimmertanne', 'Araucaria heterophylla', ['Araucaria', 'Norfolktanne'], 'hellIndirekt', 'gross', 'Hell und eher kühl, keine pralle Sonne.'),
  pl('Weihnachtsstern', 'Euphorbia pulcherrima', ['Poinsettie'], 'hellIndirekt', 'klein', 'Hell ohne pralle Sonne, keine Zugluft.'),
  pl('Christusdorn', 'Euphorbia milii', ['Euphorbia milii'], 'vollsonne', 'klein', 'Sonnig und warm.'),
  pl('Kalanchoe', 'Kalanchoe blossfeldiana', ['Flammendes Käthchen'], 'sonnig', 'klein', 'Sonnig bis hell, sparsam gießen.'),
  pl('Hibiskus', 'Hibiscus rosa-sinensis', ['Roseneibisch', 'Hibiscus'], 'sonnig', 'mittel', 'Viel Licht, gern auch Sonne.'),
  pl('Zyperngras', 'Cyperus alternifolius', ['Cyperus', 'Zypergras'], 'sonnig', 'mittel', 'Hell bis sonnig; steht gern mit den Füßen im Wasser.'),
  pl('Bubikopf', 'Soleirolia soleirolii', ['Soleirolia'], 'halbschatten', 'klein', 'Hell bis halbschattig, nie austrocknen lassen.'),
  pl('Begonie', 'Begonia', ['Begonia', 'Blattbegonie'], 'hellIndirekt', 'klein', 'Hell ohne direkte Sonne.'),
  pl('Flamingoblume', 'Anthurium', ['Anthurie', 'Anthurium'], 'hellIndirekt', 'mittel', 'Hell ohne direkte Sonne, warm und luftfeucht.'),
  pl('Bromelie', 'Guzmania', ['Guzmanie', 'Bromelien', 'Guzmania'], 'hellIndirekt', 'klein', 'Hell, keine pralle Sonne.'),
  pl('Usambaraveilchen', 'Saintpaulia', ['Saintpaulia'], 'hellIndirekt', 'klein', 'Hell ohne direkte Sonne – Ost- oder Westfenster.'),
  pl('Calla', 'Zantedeschia', ['Zantedeschia', 'Zimmercalla'], 'hellSonne', 'mittel', 'Hell, gern mit etwas Sonne.'),
  pl('Tillandsie', 'Tillandsia', ['Luftpflanze', 'Tillandsia'], 'hellSonne', 'klein', 'Hell mit etwas Morgen- oder Abendsonne; regelmäßig besprühen.'),
  pl('Venusfliegenfalle', 'Dionaea muscipula', ['Fleischfressende Pflanze', 'Dionaea'], 'vollsonne', 'klein', 'Sehr sonnig; mit Regenwasser gießen.'),
  pl('Rhipsalis', 'Rhipsalis', ['Korallenkaktus', 'Binsenkaktus'], 'hellIndirekt', 'klein', 'Dschungelkaktus: hell ohne pralle Sonne.'),
  pl('Basilikum', 'Ocimum basilicum', [], 'vollsonne', 'klein', 'Sonnigster Platz am Fenster, warm halten.'),
  pl('Rosmarin', 'Salvia rosmarinus', ['Rosmarinus officinalis'], 'vollsonne', 'klein', 'Vollsonnig; im Winter hell und kühl.'),
  pl('Thymian', 'Thymus vulgaris', [], 'vollsonne', 'klein', 'Vollsonnig und eher trocken.'),
  pl('Lavendel', 'Lavandula angustifolia', [], 'vollsonne', 'klein', 'Vollsonnig – drinnen nur am Südfenster.'),
  pl('Minze', 'Mentha', ['Pfefferminze'], 'sonnig', 'klein', 'Sonnig bis halbschattig, gleichmäßig feucht halten.'),
  pl('Petersilie', 'Petroselinum crispum', [], 'hellSonne', 'klein', 'Hell bis halbschattig, keine pralle Mittagssonne.'),
  pl('Schnittlauch', 'Allium schoenoprasum', [], 'sonnig', 'klein', 'Sonnig bis halbschattig.'),
  pl('Tomate', 'Solanum lycopersicum', ['Tomaten', 'Balkontomate', 'Cocktailtomate'], 'vollsonne', 'mittel', 'Braucht so viel Sonne wie möglich.'),
  pl('Chili', 'Capsicum', ['Paprika', 'Peperoni', 'Chilli'], 'vollsonne', 'mittel', 'Sehr sonnig und warm.'),
  pl('Erdbeere', 'Fragaria', ['Erdbeeren', 'Monatserdbeere'], 'vollsonne', 'klein', 'Sonnig, für süße Früchte viel Licht.'),
];

// ------------------------------------------------------------------ Suche

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function matchScore(q: string, cand: string): number {
  if (!q) return 0;
  if (cand === q) return 100;
  if (cand.startsWith(q)) return 88;
  const words = cand.split(' ');
  if (words.some((w) => w.startsWith(q))) return 80;
  if (cand.includes(q)) return 70;
  const allowed = q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0;
  if (!allowed) return 0;
  let best = lev(q, cand);
  // Tippfehler am Wortanfang erst ab 5 Zeichen zulassen (sonst findet „farn“ auch „carnosa“)
  const prefix = q.length >= 5;
  for (const w of words) best = Math.min(best, lev(q, w), prefix ? lev(q, w.slice(0, q.length)) : Infinity);
  if (prefix) best = Math.min(best, lev(q, cand.slice(0, q.length)));
  return best <= allowed ? 55 - best * 5 : 0;
}

/** Fehlertolerante Suche über deutsche Namen, botanische Namen und Synonyme. */
export function searchPlants(query: string, max = 8): Plant[] {
  const q = normalize(query);
  if (!q) return [];
  // Treffer im deutschen Namen vor botanischem Namen vor Synonymen (z.B. „monstra“ → Monstera vor Affenmaske)
  const bonus = (s: number, b: number) => (s > 0 ? s + b : 0);
  return PLANTS.map((p) => ({
    p,
    s: Math.max(bonus(matchScore(q, normalize(p.name)), 3), bonus(matchScore(q, normalize(p.bot)), 1), ...p.aka.map((c) => matchScore(q, normalize(c)))),
  }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name, 'de'))
    .slice(0, max)
    .map((x) => x.p);
}

/** Pflanzen, die sich für eine Zone besonders eignen (für Empfehlungen). */
export function plantsForZone(z: Zone, max = 8): Plant[] {
  const order: Record<Plant['size'], number> = { gross: 0, mittel: 1, klein: 2 };
  return PLANTS.filter((p) => LIGHT_CATS[p.light].ideal.includes(z))
    .sort((a, b) => order[a.size] - order[b.size] || a.name.localeCompare(b.name, 'de'))
    .slice(0, max);
}

// ------------------------------------------------------------------ Standortempfehlung

/** 2 = ideal, 1 = geeignet, 0 = ungeeignet */
export function suitability(cat: LightCat, c: LightCell): 0 | 1 | 2 {
  const lc = LIGHT_CATS[cat];
  let s: 0 | 1 | 2 = lc.ideal.includes(c.zone) ? 2 : lc.ok.includes(c.zone) ? 1 : 0;
  // empfindliche Pflanzen: viel Mittagssonne abwerten
  if (s > 0 && lc.noMidday && c.midday >= 1.5) s = 1;
  return s;
}

export interface Spot {
  roomId: string;
  roomName: string;
  x: number;
  y: number;
  score: 1 | 2;
  area: number; // m²
  where: string;
  zone: Zone;
}

export function recommendSpots(p: Project, map: LightMap, cat: LightCat, max = 4): Spot[] {
  const score = new Map<LightCell, 0 | 1 | 2>();
  for (const c of map.cells) score.set(c, c.covered ? 0 : suitability(cat, c));
  const seen = new Set<LightCell>();
  const comps: LightCell[][] = [];
  for (const c of map.cells) {
    if (seen.has(c) || !score.get(c)) continue;
    // zusammenhängende Flächen im selben Raum
    const comp: LightCell[] = [];
    const stack = [c];
    seen.add(c);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = cur.i + di;
        const j = cur.j + dj;
        if (i < 0 || j < 0 || i >= map.cols || j >= map.rows) continue;
        const nb = map.grid[j * map.cols + i];
        if (!nb || seen.has(nb) || !score.get(nb) || nb.roomId !== cur.roomId) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    comps.push(comp);
  }
  const spots: Spot[] = [];
  for (const comp of comps) {
    const best = Math.max(...comp.map((c) => score.get(c)!)) as 1 | 2;
    const top = comp.filter((c) => score.get(c) === best);
    if (top.length < 2) continue;
    const ctr = cellsCenter(top);
    // Punkt: bestgeeignete Zelle nahe der Mitte dieser Fläche
    let pick = top[0];
    let bd = Infinity;
    for (const c of top) {
      const d = Math.hypot(c.x - ctr.x, c.y - ctr.y);
      if (d < bd) {
        bd = d;
        pick = c;
      }
    }
    const room = p.rooms.find((r) => r.id === pick.roomId);
    spots.push({
      roomId: pick.roomId,
      roomName: room?.name ?? 'Raum',
      x: pick.x,
      y: pick.y,
      score: best,
      area: (top.length * map.step * map.step) / 10000,
      where: describeSpot(p, pick, (v: P) => compassWord(p, v)),
      zone: pick.zone,
    });
  }
  return spots.sort((a, b) => b.score - a.score || b.area - a.area).slice(0, max);
}
