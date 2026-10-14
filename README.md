# Raumplaner

Ein Werkzeug im Browser, mit dem du Räume nachbaust und einrichtest. Du zeichnest den Grundriss in 2D und siehst ihn gleichzeitig in 3D. Möbel stellst du aus einem IKEA-Katalog oder als eigene Maßanfertigung hinein. Außerdem kannst du den Sonnenstand für deinen Standort simulieren und dir zeigen lassen, wo im Raum sonnige, halbschattige und schattige Plätze für Pflanzen sind.

## Als App auf dem iPad (offline)

Der Raumplaner ist eine installierbare Web-App (PWA). Nach dem ersten Öffnen liegt alles auf dem Gerät, danach brauchst du kein Internet mehr.

1. **Einmalig GitHub Pages einschalten:** im Repository unter *Settings → Pages → Build and deployment → Source* die Option **„GitHub Actions“** wählen. Danach baut der Workflow `.github/workflows/pages.yml` die App bei jedem Push automatisch und veröffentlicht sie unter `https://musicerino.github.io/musicerino/`.
2. Die Adresse auf dem iPad in **Safari** öffnen.
3. **Teilen-Symbol → „Zum Home-Bildschirm“** wählen. Danach startet der Raumplaner über das Symbol im Vollbild und offline.

Auf Android sowie in Chrome und Edge am Computer erscheint oben der Knopf **„App installieren“**.

**Touch-Bedienung:**
- Ein Finger wählt aus und verschiebt.
- Zwei Finger zoomen und verschieben den Plan.
- In 3D tippst du ein Möbel erst an und ziehst es dann.
- Beim Wand-Werkzeug erscheint eine Leiste: Länge eingeben und Richtungspfeil antippen.
- Für die Auswahl gibt es eine Leiste mit Drehen, Kopie, Eigenschaften und Löschen.
- Im Rundgang steuerst du mit dem Joystick.
- Die Seitenleisten öffnest du über ◧ und ◨.

**Daten:** Projekte bleiben auf dem Gerät gespeichert. Sichere wichtige Pläne zusätzlich über „Speichern“, z.B. in der Dateien-App oder in iCloud. Mit „Öffnen“ lädst du sie wieder.

## Starten

```bash
npm install
npm run dev          # Entwicklungsserver auf http://localhost:5173
npm run build        # Produktions-Build in dist/
npm run build:single # eine einzige, eigenständige HTML-Datei in dist-single/index.html
```

Die Datei `dist-single/index.html` läuft ohne Server: Doppelklick genügt, oder du legst sie auf einen beliebigen Webspace.

## Funktionen

### Räume nachbauen
- **Raum aus Maßen**: Innenmaße eingeben (Rechteck oder L-Form, Raumhöhe, Wandstärke). Die Wände werden automatisch erzeugt. Weitere Räume werden rechts angesetzt und teilen sich die Wand.
- **Wände ziehen** (Taste `W`): Punkt für Punkt klicken. Eine Länge eintippen (z.B. `3,45m` oder `120`) und mit Enter bestätigen, dann entsteht eine Wand mit exaktem Maß. Winkel rasten in 15°-Schritten ein, mit Shift zeichnest du frei. Ein Klick auf den Startpunkt schließt den Raum und legt automatisch eine Bodenfläche an.
- **Rechteckraum aufziehen** mit der Maus.
- Wandenden und ganze Wände lassen sich verschieben, angeschlossene Wände und Räume passen sich an. Ein Doppelklick auf eine Wand teilt sie.
- Länge, Winkel, Stärke und Höhe jeder Wand sind numerisch editierbar. Bei jeder Wand werden die Maße angezeigt, Räume zeigen ihre Fläche und ihren Umfang.
- **Halbe Wände** (Taste `H`): Tresen, Brüstungen, Raumteiler oder Kniestöcke, standardmäßig 110 cm hoch. Jede Wand lässt sich über Vorlagen auf Brüstung 100, Theke 110, Halbhoch 120, Raumteiler 150 oder raumhoch stellen.
- **Glaswände:** Bei jeder Wand die Wandart auf „Glas“ stellen, z.B. für eine Glastrennwand, eine Dusche oder einen begehbaren Kleiderschrank. Sie hat ein Stahlrahmen-Raster, lässt Licht durch und wirft keinen Schatten.

### Fenster, Türen & Durchgänge
- Fenster, Türen und Balkontüren setzt du per Klick auf eine Wand.
- **Durchgang** (Taste `D`): Öffnung ohne Tür. Vorlagen gibt es für einen Durchgang, eine **Durchreiche** zur Küche (mit Ablagebrett) und einen raumhohen Durchbruch.
- **Balkon oder Vordach:** Über Fenstern und Balkontüren trägst du einen Überstand ein, z.B. 150 cm für den Balkon darüber. Er ist in 3D zu sehen und verschattet in der Lichtberechnung.
- Breite, Höhe, Brüstung sowie der Abstand zur linken und rechten Wandecke sind exakt einstellbar. Bei Türen lassen sich Anschlag und Öffnungsseite wählen, außerdem die Rahmenfarbe.
- Öffnungen lassen sich entlang der Wand ziehen, auch auf eine andere Wand.

### Möbel
- Der **IKEA-Katalog** enthält rund 100 Teile mit Maßen nach Herstellerangaben, z.B. BILLY, KALLAX, PAX, MALM, HEMNES, KIVIK, EKTORP, POÄNG, STRANDMON, LACK, BESTÅ, METOD, GODMORGON und MICKE. Dazu kommen Bad, Küche, Licht und Deko. Du kannst suchen und nach Kategorien filtern.
- Einfügen geht per Klick oder per Drag & Drop in den 2D-Plan oder in die 3D-Ansicht.
- **Verschieben, drehen** (Griff, `R` oder `Shift+R`) und **stapeln**: Ziehst du ein Möbel auf ein anderes, steht es auf dessen Oberseite und bewegt sich danach mit.
- Möbel docken mit der Rückseite an Wände an. Mit Alt beim Ziehen schaltest du das aus.
- Ist ein Möbel ausgewählt, siehst du die Abstände zu den Wänden.
- **Möbel nach Maß**: Maße, Bauform (Schrank, Kommode, Regal, Sofa, Bett, Tisch, Küchenschrank usw.), Aufbau (Türen, Schubladen, Fächer …), Farben und Oberfläche wählen. Das 3D-Modell entsteht live und kann unter „Meine Möbel“ gespeichert werden.

### Oberflächen
- Wände: Putz, Kalkputz, Backstein, Sichtbeton, Holzpaneele, Akustikpaneele, Metro-Fliesen, Tapeten, Naturstein und Marmor. Farbe und Tönung sind frei wählbar. Du kannst sie für alle Wände oder für einzelne Wände festlegen.
- Böden je Raum: Eiche, Nussbaum, Fischgrät, Dielen, Laminat, Fliesen, Schachbrett, Beton, Marmor, Terrazzo, Teppich und Vinyl.

### Wandverkleidungen (Fliesen, Paneele … auf Teilflächen)
- Wand anklicken und eine Vorlage wählen: **Küchenrückwand** (Fliesenspiegel 90–150 cm), **Bad halbhoch** (Fliesen bis 120 cm), **raumhoch gefliest**, **Holzpaneele halbhoch**, **Akustikpaneele**, **Backstein**, **Sichtbeton**, **Tapete als Akzentwand** oder **zweifarbig gestrichen**.
- Jede Verkleidung hat eigene Werte für Abstand links und rechts, Breite, Höhe von/bis und Stärke. Der Rest der Wand bleibt unverkleidet, du kannst also z.B. nur den Bereich hinter der Arbeitsplatte fliesen.
- Material und Farbe sind frei wählbar, dazu kommen Fliesen 60×60 und 30×30, Schachbrett, Terrazzo, Eiche und Nussbaum. Mehrere Verkleidungen pro Wandseite sind möglich.
- Fenster und Türen werden ausgespart. Im Plan erscheint die Verkleidung als farbiges Band an der Wand und lässt sich entlang der Wand ziehen.
- Steckdosen und Schalter sitzen auf der Verkleidung, Möbel stehen davor. Fliesen, die am Boden beginnen, ersetzen die Fußleiste (wie ein Fliesensockel). Paneele schieben sie nach vorne.

### Fußleisten
- **Rundum je Raum:** Die Leiste folgt automatisch allen Wänden. Türen werden ausgespart, Innen- und Außenecken sauber geschlossen. Einzelne Wände lassen sich abwählen, z.B. die Küchen- oder Fliesenwand.
- **Geteilt / teilweise:** Wand anklicken → „+ Fußleisten-Stück“. Jedes Stück hat eigene Werte für Abstand links und rechts, Länge, Höhe und Tiefe. Du kannst Stücke teilen (auch mit Lücke) oder im Plan entlang der Wand ziehen. „In Einzelstücke umwandeln“ macht aus der Rundum-Leiste bearbeitbare Stücke.
- **Aussehen:** Profil gerade, abgerundet oder klassisch. Material und Farbe sind frei wählbar, dazu gibt es Vorlagen wie „Altbau 14 cm“ oder „Eiche 6 cm“.
- **Bedarf:** Die App rechnet die Gesamtlänge und die Stückzahl in handelsüblicher Länge (+10 % Verschnitt) aus.
- **Möbel stehen davor:** Möbel, die an die Wand andocken, stehen automatisch vor der Fußleiste.

### Haustechnik (Tab „Technik“)
- **Elektro:** Steckdosen (1–4-fach, USB, Feuchtraum), Licht- und Serienschalter, Dimmer, Starkstrom 400 V (Herdanschlussdose, CEE-Steckdose, Wallbox), Netzwerk-, TV- und Telefondosen, Decken- und Wandauslässe, Rauchmelder, Sicherungskasten und Medienverteiler.
- **Wasser:** Kalt- und Warmwasser-Eckventile, Waschmaschinenanschluss, Abfluss DN 50 und Außenwasserhahn.
- **Heizung:** Plattenheizkörper Typ 11/22/33, Flach-, Röhren-, Design- und Handtuchheizkörper (mit Thermostatventil und Anschlussrohren), Raumthermostat, Heizkreisverteiler und Fußbodenheizung je Raum.
- **Setzen:** Element antippen, dann auf Wände tippen. Das geht mehrfach hintereinander (Stempel-Modus). Die Montagehöhe ist nach DIN 18015-3 voreingestellt (Dosenmitte über Fußboden) und lässt sich mit einem Tipp auf Vorlagen wie 30 / 105 / 115 cm ändern. Die Position gibst du als „Abstand links/rechts“ zur Innenecke ein.
- **Schnell ergänzen:**
  - Heizkörper unter alle Fenster, passend zur Fensterbreite und Brüstung
  - Lichtschalter neben alle Türen (Griffseite)
  - Rauchmelder in alle Räume

  Einzelne Fenster und Türen haben dieselben Knöpfe.
- **Plan:**
  - Eigene Plansymbole mit Legende.
  - „Technik: Elektroplan“ blendet die Möbel blass und zeigt die Montagehöhen.
  - Eine Stückliste zählt alle Elemente samt Steckplätzen.
  - Wandmontierte Technik wandert mit, wenn Wände verschoben werden.

### Licht & Sonne
- Den **Standort** gibst du als Koordinaten ein, z.B. aus Google Maps: `52.52, 13.405` oder `52°31′N 13°24′O`. Alternativ wählst du eine Stadt oder den Gerätestandort. Dazu kommt die Zeitzone.
- Die **Nordrichtung** stellst du ein, indem du die Kompassnadel im Plan drehst, oder über den Regler bzw. die Gradeingabe.
- Datum und Uhrzeit wählst du über die Zeitleiste unter der 3D-Ansicht. ▶ spielt den Tagesverlauf ab. Echtzeit-Schatten zeigen, wie das Licht durch die Fenster fällt. Wände, Decke und Möbel werfen Schatten, Glas nicht.
- Angezeigt werden Sonnenauf- und -untergang, Höchststand und Sonnenbahn, dazu Schnellwahl für die Sonnenwenden und Tagundnachtgleichen.
- **Umgebung:** Verschatten Nachbarhäuser oder Bäume die Sonne, gibst du die Höhe des Horizonts in Grad an (z.B. 20° ≈ gegenüberliegendes Haus in Straßenbreite).
- Nachts leuchten Steh-, Tisch- und Pendelleuchten.

### Lichtzonen & Pflanzen (Tab „Licht“)
- **Lichtzonen berechnen** teilt jeden Raum in Zonen ein: *sonnig* (mindestens 4 Stunden direkte Sonne), *halbschattig* (1,5–4 Stunden, z.B. Morgen- oder Abendsonne), *hell ohne Sonne*, *schattig* und *sehr dunkel*. Wahlweise im Jahresmittel, für Sommer, Winter oder ein bestimmtes Datum, für Kübelpflanzen am Boden oder auf Tisch- bzw. Fensterbankhöhe.
- Berücksichtigt werden Fensterlage und -größe, Nordrichtung, Standort, Wände, Möbel, Balkone und der Horizont. Das Himmelslicht wird nach dem bedeckten CIE-Himmel gewichtet.
- Die Zonen erscheinen farbig im Plan und in 3D. Tippst du auf eine Stelle, siehst du die Sonnenstunden und den Tageslichtanteil. Dazu gibt es eine Flächenaufteilung je Raum.
- **Empfehlungen:** Für jede Zone werden passende Pflanzen vorgeschlagen.
- **Pflanzensuche:** Gib eine Pflanze ein (über 70 Zimmerpflanzen und Kräuter, mit Tippfehler-Toleranz sowie botanischen und Synonym-Namen, z.B. „Monstera“, „ZZ-Pflanze“, „Olivenbaum“, „Basilikum“). Die App nennt die Lichtansprüche und empfiehlt die besten Plätze, z.B. „Wohnen · ≈ 1,1 m vom Westfenster“. Die Plätze werden im Plan markiert. „Hier platzieren“ stellt direkt einen passenden Pflanzentopf hin. Pflanzen, die nicht in der Liste stehen, ordnest du selbst einer Lichtkategorie zu.
- Die Lichtberechnung ist eine vereinfachte Abschätzung, kein Ersatz für ein Luxmeter. Für die meisten Pflanzen reicht sie aber gut, um sonnige von schattigen Plätzen zu unterscheiden.

### Ansichten & Speichern
- 2D-Plan, 3D oder beides nebeneinander. In 3D gibt es die Modi „Umkreisen“ und „Rundgang“ (WASD und Maus, auf Augenhöhe). Wände vor der Kamera werden automatisch transparent.
- Rückgängig und Wiederholen gehen über `Strg+Z` und `Strg+Y`. Das Projekt wird automatisch im Browser gespeichert. Mit „Speichern“ und „Öffnen“ nutzt du Projektdateien (`.json`), mit „Bild“ exportierst du die Ansicht als PNG.

## Technik

TypeScript, [Vite](https://vitejs.dev) und [three.js](https://threejs.org). Alle Möbelmodelle und Materialtexturen werden prozedural erzeugt, es werden also keine externen Assets geladen. Den Sonnenstand berechnet der SunCalc-Algorithmus.

| Datei | Inhalt |
| --- | --- |
| `src/plan2d.ts` | 2D-Grundriss-Editor (Canvas) |
| `src/view3d.ts` | 3D-Szene, Sonne, Schatten, Rundgang, Analyse-Ebene |
| `src/models.ts` | prozedurale 3D-Modelle aller Möbeltypen |
| `src/catalog.ts` | Möbelkatalog mit Maßen |
| `src/textures.ts` | Boden- und Wandmaterialien |
| `src/sun.ts` | Sonnenstand und Zeitzonen |
| `src/store.ts` | Projektzustand, Rückgängig, automatisches Speichern |
| `src/baseboards.ts` | Fußleisten: Verlauf an den Wandoberflächen, Ecken, Türen, Bedarf |
| `src/claddings.ts` | Wandverkleidungen: Vorlagen, Aussparungen, Tiefe für Möbel und Steckdosen |
| `src/daylight.ts` | Lichtberechnung: direkte Sonne, Himmelslicht, Lichtzonen |
| `src/plants.ts` | Pflanzendatenbank, Suche und Standortempfehlung |
| `src/symbols.ts` | Plansymbole für Elektro, Wasser und Heizung |
| `src/ops.ts` | Stapeln, Andocken an Wände, Platzieren von Haustechnik |
| `src/panels.ts`, `src/props.ts`, `src/techui.ts`, `src/plantui.ts`, `src/custom.ts`, `src/touch.ts` | Bedienoberfläche |

> Hinweis: Die IKEA-Produktnamen dienen nur der Orientierung. Die Modelle sind vereinfachte Nachbildungen und keine offiziellen IKEA-Daten. Maße bitte vor dem Kauf beim Hersteller prüfen.
