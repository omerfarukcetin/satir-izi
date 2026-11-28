// Ana sayfa.
import { el } from './utils.js';
import { icon } from './icons.js';
import { getSetting } from './database.js';
import { state, bookById } from './store.js';
import { button, cover, emptyState } from './ui.js';
import { addBook } from './books.js';
import { pendingCallout } from './review.js';
import { loginSuggestion } from './account.js';
import { digestHomeCard } from './digest.js';
import { computeStats } from './stats.js';
import { currentUser } from './sync.js';
import { downloadBackup } from './backup.js';
import { refresh } from './router.js';

const BACKUP_REMINDER_DAYS = 14;

export async function homeView() {
  const reading = state.books.filter(b => b.status === 'okunuyor');
  const total = state.highlights.length + state.notes.length;

  // 1) Başlık: yalnızca iki ana eylem ve tek satırlık "sor"
  const hero = el('div', { class: 'hero hero-slim' },
    el('h1', {}, 'Okudukların kaybolmasın.'),
    el('div', { class: 'hero-actions' },
      button('Sayfa tara', { icon: 'camera', variant: 'primary', href: '#/tara' }),
      button('Kitap ekle', { icon: 'plus', onClick: addBook })),
    total ? el('a', { class: 'hero-ask', href: '#/sor' }, icon('chat', { size: 18 }), el('span', {}, 'Arşivine sor…')) : null);

  if (!state.books.length) {
    return el('section', { class: 'home' }, hero,
      emptyState('Kütüphanen boş. Okuduğun bir kitabı ekle, sonra altını çizdiğin sayfaların fotoğrafını çek; işaretli satırlar arşivine dönüşsün.',
        button('İlk kitabını ekle', { icon: 'plus', variant: 'primary', onClick: addBook })));
  }

  // 2) Uyarılar: aynı anda en fazla bir tane (bekleyen tarama > giriş önerisi > yedek)
  let notice = pendingCallout() || await loginSuggestion();
  if (!notice && !currentUser() && state.highlights.length) {
    const last = await getSetting('lastBackupAt', null);
    const days = last ? (Date.now() - Date.parse(last)) / 864e5 : Infinity;
    if (days > BACKUP_REMINDER_DAYS) {
      notice = el('div', { class: 'notice-slim' }, icon('shield', { size: 18 }),
        el('span', {}, last ? `Son yedek ${Math.floor(days)} gün önce` : 'Henüz yedek almadın'),
        button('Yedekle', { small: true, variant: 'ghost', onClick: async () => { await downloadBackup(); refresh(); } }));
    }
  }

  // 3) Tek satırlık sayılar (ayrıntı İstatistik sayfasında)
  const y = new Date().getFullYear(), ys = computeStats(y);
  const strip = el('a', { class: 'home-strip', href: '#/istatistik', 'aria-label': 'İstatistikleri aç' },
    num(state.books.length, 'kitap'), num(state.highlights.length, 'alıntı'), num(ys.finished.length, `${y}'de biten`),
    icon('chevron', { size: 18 }));

  // 4) Okumakta olduklarım: kısa satırlar
  const readingBlock = reading.length ? el('div', { class: 'home-sec' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Okuduklarım'), reading.length > 3 ? el('a', { href: '#/kitaplar' }, 'Tümü') : null),
    el('div', { class: 'home-books' }, reading.slice(0, 3).map(b => readingRow(b)))) : null;

  // 5) Son alıntılar: sade önizleme (düzenleme ve paylaşım alıntı/kitap sayfasında)
  const recent = [...state.highlights].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const quotes = el('div', { class: 'home-sec' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Son alıntılar'), recent.length ? el('a', { href: '#/alintilar' }, 'Tümü') : null),
    recent.length ? el('div', { class: 'home-quotes' }, recent.map(h => quoteRow(h)))
      : el('p', { class: 'muted small' }, 'Henüz alıntı yok. “Sayfa tara” ile ilk alıntını ekle.'));

  // 6) Hatırlat: eski bir satır (tek, sade)
  const older = state.highlights.length > 3 ? state.highlights.filter(h => !recent.includes(h)) : [];
  const randomBox = el('div', { class: 'home-sec' });
  const drawRandom = () => {
    const h = older[Math.floor(Math.random() * older.length)];
    randomBox.replaceChildren(
      el('div', { class: 'section-head' }, el('h2', {}, 'Eski bir satır'),
        older.length > 1 ? button('Başka', { icon: 'shuffle', small: true, variant: 'ghost', onClick: drawRandom }) : null),
      quoteRow(h, true));
  };
  if (older.length) drawRandom();

  return el('section', { class: 'home' },
    hero, notice, strip, readingBlock, await digestHomeCard(), quotes, older.length ? randomBox : null);
}

function num(n, label) { return el('span', { class: 'hs-item' }, el('strong', {}, String(n)), el('span', {}, label)); }

function readingRow(b) {
  const pct = b.totalPages ? Math.min(100, Math.round(((b.readPages || 0) / b.totalPages) * 100)) : null;
  const bar = el('span', { class: 'hb-bar' }, el('i'));
  if (pct !== null) bar.firstChild.style.width = pct + '%';
  return el('a', { class: 'home-book', href: `#/kitap/${encodeURIComponent(b.id)}` },
    cover(b, 'xs'),
    el('span', { class: 'hb-body' },
      el('strong', {}, b.title),
      el('span', { class: 'muted small' }, [b.author, pct !== null ? `%${pct}` : null].filter(Boolean).join(' · ')),
      pct !== null ? bar : null));
}

function quoteRow(h, old = false) {
  const b = bookById(h.bookId);
  return el('a', { class: 'home-quote' + (old ? ' is-old' : ''), href: `#/kitap/${encodeURIComponent(h.bookId)}` },
    el('span', { class: 'hq-text' }, h.text),
    el('span', { class: 'hq-meta' }, [b?.title, h.page ? `s. ${h.page}` : null].filter(Boolean).join(' · ')));
}
