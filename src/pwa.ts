// Installierbare Web-App: Offline-Cache, Installieren-Knopf, dauerhafter Speicher.
import { h, openModal, closeModal } from './dom';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function inFrame() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function initPWA(status: (s: string) => void) {
  const installBtn = document.getElementById('btnInstall') as HTMLButtonElement;
  const badge = document.getElementById('offlineBadge')!;
  // Nur auf einer echten Webadresse (nicht als Einzeldatei, nicht eingebettet)
  const hosted = location.protocol.startsWith('http') && !inFrame() && import.meta.env.MODE !== 'single';

  // Offline-Hinweis
  const syncOnline = () => (badge.hidden = navigator.onLine);
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  if (!hosted) return;

  // Browser bitten, die Projektdaten nicht automatisch zu löschen
  navigator.storage?.persist?.().catch(() => undefined);

  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state !== 'activated') return;
            status(hadController ? 'Neue Version geladen – sie ist beim nächsten Öffnen der App aktiv.' : 'Offline bereit: Der Raumplaner funktioniert jetzt auch ohne Internet.');
          });
        });
        // Beim Öffnen nach Updates schauen
        reg.update().catch(() => undefined);
      })
      .catch(() => undefined);
  }

  if (isStandalone()) return;

  // Chrome, Edge, Android: echter Installationsdialog
  let deferred: InstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    installBtn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    status('Raumplaner installiert – du findest ihn jetzt bei deinen Apps.');
  });
  // iPad/iPhone: Safari hat keinen Dialog, also Anleitung zeigen
  if (isIOS()) installBtn.hidden = false;

  installBtn.onclick = async () => {
    if (deferred) {
      await deferred.prompt();
      deferred = null;
      installBtn.hidden = true;
      return;
    }
    showInstallHelp();
  };
}

export function showInstallHelp() {
  const ios = isIOS();
  openModal(
    h('div', {},
      h('h2', {}, 'Raumplaner als App installieren'),
      ios
        ? h('ol', { class: 'install-steps' },
            h('li', {}, 'Diese Seite in ', h('b', {}, 'Safari'), ' öffnen (nicht in einer anderen App).'),
            h('li', {}, 'Oben auf das Teilen-Symbol ', h('span', { class: 'kbd' }, '□↑'), ' tippen.'),
            h('li', {}, 'Nach unten scrollen und ', h('b', {}, '„Zum Home-Bildschirm“'), ' wählen, dann „Hinzufügen“.'),
            h('li', {}, 'Den Raumplaner ab jetzt über das neue Symbol auf dem Home-Bildschirm starten – er öffnet im Vollbild und funktioniert offline.'),
          )
        : h('ol', { class: 'install-steps' },
            h('li', {}, 'In Chrome oder Edge in der Adressleiste auf das Installieren-Symbol klicken'),
            h('li', {}, 'oder im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.'),
          ),
      h('p', { class: 'hint' }, 'Nach dem ersten Öffnen ist alles auf dem Gerät gespeichert: Programm, Möbelkatalog und Materialien. Internet brauchst du danach nicht mehr. Deine Projekte bleiben auf dem Gerät – sichere wichtige Pläne zusätzlich über „Speichern“ (z.B. in der Dateien-App oder iCloud).'),
      h('div', { class: 'btnrow', style: 'justify-content:flex-end' }, h('button', { class: 'primary', onclick: closeModal }, 'Verstanden')),
    ),
  );
}
