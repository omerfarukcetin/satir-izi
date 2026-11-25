// Ortak arayüz parçaları.
import { el, formatDate, copyText, toast, confirmDialog } from './utils.js';
import { icon } from './icons.js';
import { markLabel, statusLabel } from './database.js';
import { bookById, toggleFavorite, deleteHighlight } from './store.js';
import { refresh } from './router.js';
import { renderRich, relatedOf, linkChip } from './links.js';

export function button(label, { icon: ic, onClick, variant = 'secondary', small = false, type = 'button', title, disabled, href, attrs = {} } = {}) {
  const cls = `btn btn-${variant}${small ? ' btn-small' : ''}`;
  const content = [ic ? icon(ic, { size: small ? 18 : 20 }) : null, label ? el('span', {}, label) : null];
  if (href) return el('a', { class: cls, href, title, ...attrs }, content);
  return el('button', { class: cls, type, title, disabled, onclick: onClick, ...attrs }, content);
}

export function iconButton(ic, label, onClick, { pressed, variant = 'ghost', filled = false } = {}) {
  return el('button', {
    class: `icon-btn icon-btn-${variant}`, type: 'button', title: label, 'aria-label': label,
    'aria-pressed': pressed === undefined ? undefined : String(!!pressed), onclick: onClick,
  }, icon(ic, { filled }));
}

export function pageHeader(title, { back, actions = [], subtitle } = {}) {
  return el('header', { class: 'page-header' },
    back ? el('a', { class: 'back-link', href: back }, icon('back', { size: 18 }), 'Geri') : null,
    el('div', { class: 'page-title-row' },
      el('div', {}, el('h1', {}, title), subtitle ? el('p', { class: 'muted' }, subtitle) : null),
      actions.length ? el('div', { class: 'row-actions' }, actions) : null));
}

export function emptyState(text, action) {
  return el('div', { class: 'empty' }, el('p', {}, text), action || null);
}

export function cover(book, size = 'md') {
  if (book?.cover) return el('img', { class: `cover cover-${size}`, src: book.cover, alt: '' });
  const initials = (book?.title || '?').trim().slice(0, 1).toLocaleUpperCase('tr');
  return el('div', { class: `cover cover-${size} cover-placeholder`, 'aria-hidden': 'true' }, el('span', {}, initials));
}

export function progressInfo(book) {
  if (!book.totalPages) return null;
  const read = Math.min(book.readPages || 0, book.totalPages);
  return { read, total: book.totalPages, pct: Math.round(read / book.totalPages * 100) };
}

export function progressBar(book) {
  const p = progressInfo(book);
  if (!p) return null;
  const fill = el('span');
  fill.style.width = `${p.pct}%`; // CSP: style özniteliği yerine CSSOM
  return el('div', { class: 'progress-wrap' },
    el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.pct), 'aria-label': 'Okuma ilerlemesi' }, fill),
    el('span', { class: 'muted small' }, `${p.read} / ${p.total} sayfa · %${p.pct}`));
}

export function statusChip(status) {
  return el('span', { class: `chip status-${status}` }, statusLabel(status));
}

export function bookCard(book, highlightCount) {
  return el('a', { class: 'book-card', href: `#/kitap/${encodeURIComponent(book.id)}` },
    cover(book, 'sm'),
    el('div', { class: 'book-card-body' },
      el('strong', { class: 'book-title' }, book.title),
      el('span', { class: 'muted' }, book.author || 'Yazar belirtilmedi'),
      el('div', { class: 'book-card-meta' }, statusChip(book.status), el('span', { class: 'muted small' }, `${highlightCount} alıntı`)),
      progressBar(book)));
}

/**
 * Alıntı kartı.
 * opts.showBook: kitap adını göster; opts.onEdit: düzenleme
 */
export function highlightCard(h, { showBook = false, onEdit } = {}) {
  const book = showBook ? bookById(h.bookId) : null;
  const meta = el('div', { class: 'hl-meta' },
    el('span', { class: 'hl-page' }, h.page ? `Sayfa ${h.page}` : 'Sayfa belirtilmedi'),
    el('span', { class: 'chip chip-soft' }, markLabel(h.markType)),
    book ? el('a', { class: 'hl-book', href: `#/kitap/${encodeURIComponent(book.id)}` }, book.title) : null);
  const card = el('article', { class: 'hl-card' + (h.favorite ? ' is-fav' : '') },
    meta,
    el('blockquote', { class: 'hl-text' }, h.text),
    h.comment?.trim() ? el('div', { class: 'hl-comment' }, el('span', { class: 'hl-comment-label' }, 'Kişisel not'), el('p', {}, renderRich(h.comment))) : null,
    h.tags?.length ? el('div', { class: 'tags' }, h.tags.map(t => el('a', { class: 'tag', href: `#/alintilar?etiket=${encodeURIComponent(t)}` }, '#' + t))) : null,
    relatedBlock(h.id),
    el('div', { class: 'hl-actions' },
      el('span', { class: 'muted small' }, formatDate(h.createdAt)),
      el('div', { class: 'row-actions' },
        iconButton('star', h.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle', async () => {
          await toggleFavorite(h.id); refresh();
        }, { pressed: h.favorite, filled: h.favorite }),
        iconButton('copy', 'Panoya kopyala', async () => {
          const src = bookById(h.bookId);
          const text = `“${h.text}”\n— ${src?.author || ''}, ${src?.title || ''}${h.page ? ', s. ' + h.page : ''}`;
          toast(await copyText(text) ? 'Alıntı panoya kopyalandı.' : 'Kopyalanamadı.');
        }),
        onEdit ? iconButton('edit', 'Düzenle', () => onEdit(h)) : null,
        iconButton('trash', 'Sil', async () => {
          if (!await confirmDialog({ title: 'Alıntı silinsin mi?', message: 'Bu işlem geri alınamaz.', confirmLabel: 'Sil', danger: true })) return;
          await deleteHighlight(h.id); toast('Alıntı silindi.'); refresh();
        }))));
  return card;
}

export function relatedBlock(id) {
  const rel = relatedOf(id);
  if (!rel.length) return null;
  return el('details', { class: 'related' }, el('summary', {}, `${rel.length} ilgili kayıt`), el('div', { class: 'link-list' }, rel.map(r => linkChip(r))));
}

export function field(label, input, hint) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), input, hint ? el('span', { class: 'field-hint' }, hint) : null);
}

export function select(options, value, attrs = {}) {
  return el('select', attrs, options.map(o => el('option', { value: o.value, selected: o.value === value }, o.label)));
}
