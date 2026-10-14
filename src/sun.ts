// Sonnenstandsberechnung (nach dem bekannten SunCalc-Algorithmus, Genauigkeit ~0,1–0,5°)
// und Zeitzonen-Hilfen.

import type { Site } from './types';

const RAD = Math.PI / 180;
const DAY_MS = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // Schiefe der Ekliptik

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;
const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + RAD * 102.9372 + Math.PI;
}

export interface SunPos {
  altitude: number; // Grad über dem Horizont
  bearing: number; // Kompassrichtung in Grad (0 = Nord, 90 = Ost, 180 = Süd, 270 = West)
}

export function sunPosition(utcMs: number, lat: number, lon: number): SunPos {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(utcMs);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // atmosphärische Refraktion (nur in Horizontnähe relevant)
  const h = alt / RAD;
  const refr = h > -0.575 ? 0.0167 / Math.tan(RAD * (h + 10.3 / (h + 5.11))) : 0;
  return { altitude: h + refr, bearing: ((az / RAD + 180) % 360 + 360) % 360 };
}

/** Versatz der Zeitzone in Minuten zu einem UTC-Zeitpunkt. */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function tzOffsetMinutes(tz: string, utcMs: number): number {
  try {
    let f = fmtCache.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      });
      fmtCache.set(tz, f);
    }
    const parts: Record<string, number> = {};
    for (const p of f.formatToParts(new Date(utcMs))) if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
  } catch {
    return 0;
  }
}

/** Lokale Wandzeit (Datum + Minuten) in einer Zeitzone → UTC-Millisekunden. */
export function zonedToUtc(date: string, minutes: number, tz: string): number {
  const [y, m, d] = date.split('-').map((v) => parseInt(v, 10));
  const guess = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0) + minutes * 60000;
  let off = tzOffsetMinutes(tz, guess);
  let utc = guess - off * 60000;
  const off2 = tzOffsetMinutes(tz, utc);
  if (off2 !== off) {
    off = off2;
    utc = guess - off * 60000;
  }
  return utc;
}

export function siteSun(site: Site, minutes = site.minutes): SunPos {
  return sunPosition(zonedToUtc(site.date, minutes, site.tz), site.lat, site.lon);
}

/** Sonnenaufgang/-untergang (lokale Minuten) für den Tag; null wenn Polartag/-nacht. */
export function sunTimes(site: Site): { rise: number | null; set: number | null; noon: number; maxAlt: number } {
  let prev = siteSun(site, 0).altitude;
  let rise: number | null = null;
  let set: number | null = null;
  let noon = 720;
  let maxAlt = -90;
  const step = 5;
  for (let t = step; t <= 1440; t += step) {
    const a = siteSun(site, t).altitude;
    if (a > maxAlt) {
      maxAlt = a;
      noon = t;
    }
    if (prev < -0.833 && a >= -0.833 && rise === null) rise = refine(site, t - step, t, true);
    if (prev >= -0.833 && a < -0.833) set = refine(site, t - step, t, false);
    prev = a;
  }
  return { rise, set, noon, maxAlt };
}

function refine(site: Site, lo: number, hi: number, rising: boolean): number {
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const above = siteSun(site, mid).altitude >= -0.833;
    if (above === rising) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function fmtTime(min: number | null): string {
  if (min === null) return '–';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function compassName(bearing: number): string {
  const names = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(bearing / 22.5) % 16];
}

/**
 * Richtung (Einheitsvektor im Grundriss, y nach unten) für eine Kompassrichtung,
 * abhängig davon, wohin Norden im Plan zeigt.
 */
export function planDirForBearing(north: number, bearing: number): { x: number; y: number } {
  const t = ((north + bearing) * Math.PI) / 180;
  return { x: Math.sin(t), y: -Math.cos(t) };
}

export function timeZones(): string[] {
  try {
    const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    if (anyIntl.supportedValuesOf) return anyIntl.supportedValuesOf('timeZone');
  } catch {
    /* ignorieren */
  }
  return ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'UTC'];
}
