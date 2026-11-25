// Ana sayfa.
import { el } from './utils.js';
import { icon } from './icons.js';
import { getSetting } from './database.js';
import { state } from './store.js';
import { button, bookCard, highlightCard, emptyState } from './ui.js';
import { addBook } from './books.js';
import { openHighlightEditor } from './highlights.js';
import { pendingCallout } from './review.js';
import { downloadBackup } from './backup.js';
import { refresh } from './router.js';

const BACKUP_REMINDER_DAYS = 14;

export async function homeView() {
  const reading = state.books.filter(b => b.status === 'okunuyor');
  const done = state.books.filter(b => b.status === 'tamamlandi');
  const counts = new Map();
  for (const h of state.highlights) counts.set(h.bookId, (counts.get(h.bookId) || 0) + 1);

  const stats = el('div', { class: 'stats' },
    stat(state.books.length, 'Kitap', '#/kitaplar'),
    stat(reading.length, 'Okunuyor', '#/kitaplar'),
    stat(done.length, 'Tamamlandı', '#/kitaplar'),
    stat(state.highlights.length, 'Alıntı', '#/alintilar'),
    stat(state.notes.length + state.highlights.filter(h => h.comment?.trim()).length, 'Kişisel not'));

  const hero = el('div', { class: 'hero' },
    el('p', { class: 'eyebrow' }, 'Satır İzi'),
    el('h1', {}, 'Okudukların kaybolmasın.'),
    el('div', { class: 'hero-actions' },
      button('Sayfa tara', { icon: 'camera', variant: 'primary', href: '#/tara' }),
      button('Kitap ekle', { icon: 'plus', onClick: addBook })));

  // Yedek hatırlatması
  let reminder = null;
  if (state.highlights.length) {
    const last = await getSetting('lastBackupAt', null);
    const days = last ? (Date.now() - Date.parse(last)) / 864e5 : Infinity;
    if (days > BACKUP_REMINDER_DAYS) {
      reminder = el('div', { class: 'callout' }, icon('shield'),
        el('div', {}, el('strong', {}, last ? `Son yedeğin üzerinden ${Math.floor(days)} gün geçti` : 'Henüz yedek almadın'),
          el('p', { class: 'muted small' }, 'Verilerin yalnızca bu cihazda. Bir JSON yedeği indirip güvenli bir yerde sakla.'),
          button('Şimdi yedekle', { small: true, variant: 'primary', icon: 'download', onClick: async () => { await downloadBackup(); refresh(); } })));
    }
  }

  if (!state.books.length) {
    return el('section', { class: 'home' }, hero,
      emptyState('Kütüphanen boş. Okuduğun bir kitabı ekle, sonra altını çizdiğin sayfaların fotoğrafını çek; işaretli satırlar arşivine dönüşsün.',
        button('İlk kitabını ekle', { icon: 'plus', variant: 'primary', onClick: addBook })));
  }

  const recent = [...state.highlights].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const randomBox = el('div');
  const older = state.highlights.length > 3 ? state.highlights.filter(h => !recent.includes(h)) : state.highlights;
  const drawRandom = () => {
    if (!older.length) { randomBox.replaceChildren(); return; }
    const h = older[Math.floor(Math.random() * older.length)];
    randomBox.replaceChildren(
      el('div', { class: 'section-head' }, el('h2', {}, 'Eski bir satır'),
        older.length > 1 ? button('Başka', { icon: 'shuffle', small: true, variant: 'ghost', onClick: drawRandom }) : null),
      highlightCard(h, { showBook: true, onEdit: edit }));
  };
  const edit = async h => { if (await openHighlightEditor(h)) refresh(); };
  drawRandom();

  return el('section', { class: 'home' },
    hero, pendingCallout(), reminder, stats,
    reading.length ? el('div', {},
      el('div', { class: 'section-head' }, el('h2', {}, 'Okumakta olduklarım'), el('a', { href: '#/kitaplar' }, 'Tümü')),
      el('div', { class: 'book-list compact' }, reading.slice(0, 4).map(b => bookCard(b, counts.get(b.id) || 0)))) : null,
    el('div', {},
      el('div', { class: 'section-head' }, el('h2', {}, 'Son alıntılar'), recent.length ? el('a', { href: '#/alintilar' }, 'Tümü') : null),
      recent.length ? el('div', { class: 'hl-list' }, recent.map(h => highlightCard(h, { showBook: true, onEdit: edit })))
        : emptyState('Henüz alıntı yok. “Sayfa tara” ile ilk alıntını ekle.')),
    state.highlights.length > 3 ? randomBox : null);
}

function stat(n, label, href) {
  const inner = [el('strong', {}, String(n)), el('span', {}, label)];
  return href ? el('a', { class: 'stat', href }, inner) : el('div', { class: 'stat' }, inner);
}
