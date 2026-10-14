import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Erzeugt beim Build einen Service Worker (sw.js), der alle Dateien der App
 * vorab zwischenspeichert. Danach läuft die App vollständig offline.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'raumplaner-offline-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const pub = readdirSync('public').filter((f) => !f.startsWith('.'));
      const assets = [...new Set(['./', './index.html', ...[...files, ...pub].map((f) => './' + f)])];
      const hash = createHash('sha1')
        .update(
          Object.values(bundle)
            .map((c) => ('code' in c ? c.code : String(c.source)))
            .join('|'),
        )
        .digest('hex')
        .slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(hash, assets) });
    },
  };
}

function swSource(version: string, assets: string[]): string {
  return `// Automatisch erzeugt – Offline-Cache des Raumplaners
const CACHE = 'raumplaner-${version}';
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('raumplaner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Seite: erst Netz (für Updates), sonst Cache
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || caches.match('./index.html'))),
    );
    return;
  }
  // Dateien: Cache zuerst (Dateinamen enthalten einen Hash)
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}

// `npm run build` → installierbare Web-App (PWA) in dist/
// `npm run build:single` → eine einzige, eigenständige HTML-Datei in dist-single/
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [offlineServiceWorker()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    copyPublicDir: mode !== 'single',
    chunkSizeWarningLimit: 2000,
  },
}));
