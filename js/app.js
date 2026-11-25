// Uygulama girişi: kabuk, navigasyon, yönlendirme, Service Worker ve başlatma.
import { $, el, toast } from './utils.js';
import { icon } from './icons.js';
import { openDB, onUpgradeBlocked, requestPersistence, getSetting, setSetting } from './database.js';
import { loadState } from './store.js';
import * as router from './router.js';
import { homeView } from './home.js';
import { booksView, bookDetailView } from './books.js';
import { highlightsView } from './highlights.js';
import { reviewView } from './review.js';
import { batchView } from './batch.js';
import { recoverJobs } from './batch-runner.js';
import { scanView } from './scan.js';
import { settingsView, applyAppearance } from './settings.js';

const NAV = [
  { key: 'home', href: '#/', label: 'Ana Sayfa', icon: 'home' },
  { key: 'books', href: '#/kitaplar', label: 'Kitaplarım', icon: 'books' },
  { key: 'scan', href: '#/tara', label: 'Tara', icon: 'camera', primary: true },
  { key: 'highlights', href: '#/alintilar', label: 'Alıntılarım', icon: 'quote' },
  { key: 'settings', href: '#/ayarlar', label: 'Ayarlar', icon: 'settings' },
];

function buildNav() {
  const links = NAV.map(n => el('a', { class: `nav-link${n.primary ? ' nav-primary' : ''}`, href: n.href, dataset: { key: n.key } },
    el('span', { class: 'nav-icon' }, icon(n.icon, { size: 22 })), el('span', { class: 'nav-label' }, n.label)));
  $('#nav').replaceChildren(
    el('a', { class: 'nav-brand', href: '#/' }, el('img', { src: 'assets/icons/icon-192.png', alt: '', width: 36, height: 36 }), el('span', {}, 'Satır İzi')),
    el('div', { class: 'nav-links' }, links));
}

function markNav(key) {
  for (const a of document.querySelectorAll('.nav-link')) {
    if (a.dataset.key === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

function updateOnline() {
  document.body.classList.toggle('offline', !navigator.onLine);
  $('#offline-banner').hidden = navigator.onLine;
}

// ---- Service Worker ve güncelleme bildirimi ----
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Yalnızca kullanıcı "Güncelle" dediğinde yenile (ilk kurulumdaki controllerchange sayfayı yenilememeli)
  let updateRequested = false, reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const prompt = worker => toast('Satır İzi’nin yeni sürümü hazır.', {
      actionLabel: 'Güncelle', duration: 0,
      action: () => { updateRequested = true; worker.postMessage({ type: 'SKIP_WAITING' }); },
    });
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w);
      });
    });
    // Uygulama uzun süre açık kalırsa güncellemeyi ara sıra kontrol et
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(err => console.warn('Service Worker kaydedilemedi:', err));
}

async function init() {
  buildNav();
  updateOnline();
  window.addEventListener('online', () => { updateOnline(); router.refresh(); });
  window.addEventListener('offline', () => { updateOnline(); router.refresh(); });

  onUpgradeBlocked(() => toast('Güncelleme için Satır İzi’nin açık olan diğer sekmelerini kapatın.', { duration: 0 }));

  try {
    await openDB();
    await applyAppearance();
    await loadState();
  } catch (e) {
    console.error(e);
    $('#view').replaceChildren(el('div', { class: 'callout callout-error' }, icon('alert'),
      el('div', {}, el('strong', {}, 'Veritabanı açılamadı.'),
        el('p', {}, 'Tarayıcın gizli modda olabilir veya depolama izni kapalı olabilir. Verilerin silinmedi; normal pencerede tekrar dene.'),
        el('p', { class: 'muted small' }, String(e?.message || e)))));
    return;
  }

  await recoverJobs().catch(e => console.warn(e));

  const migrated = await getSetting('migratedFromV1Count', null);
  if (migrated && !(await getSetting('migrationNoticeShown', false))) {
    await setSetting('migrationNoticeShown', true);
    toast(`Satır İzi güncellendi. ${migrated.books} kitap ve ${migrated.highlights} alıntın yeni yapıya taşındı.`, { duration: 9000 });
  }

  router.register('', homeView, 'home');
  router.register('kitaplar', booksView, 'books');
  router.register('kitap', bookDetailView, 'books');
  router.register('tara', scanView, 'scan');
  router.register('onay', reviewView, 'scan');
  router.register('toplu', batchView, 'scan');
  router.register('alintilar', highlightsView, 'highlights');
  router.register('ayarlar', settingsView, 'settings');
  router.setup($('#view'), markNav);
  await router.refresh({ keepScroll: false });

  // Veri yazıldıktan sonra kalıcı depolama iste (Chrome kurulu PWA'da sessizce verir)
  requestPersistence();
  registerSW();
}

init();
