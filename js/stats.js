// Okuma istatistikleri: yıllık ve aylık özet.
// Kitap ve sayfa: "Tamamlandı" durumundaki kitapların bitirme tarihine göre.
// Alıntı ve not: eklenme tarihine göre (toplu elle girişte seçilen tarih).
import { el, compareTr, formatDate } from './utils.js';
import { icon } from './icons.js';
import { state } from './store.js';
import { refresh } from './router.js';
import { pageHeader, emptyState, cover, button } from './ui.js';
import { tagCounts } from './tags.js';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const view = { year: null, month: null }; // month: 0-11 veya null (tüm yıl)

const fmt = n => Number(n || 0).toLocaleString('tr-TR');
const ymOf = iso => { const d = new Date(iso); return isNaN(d) ? null : [d.getFullYear(), d.getMonth()]; };
const ymOfDate = s => (/^\d{4}-\d{2}/.test(s || '') ? [Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1] : null);

export function computeStats(year, month = null) {
  const inPeriod = ym => ym && ym[0] === year && (month === null || ym[1] === month);
  const finished = state.books.filter(b => b.status === 'tamamlandi' && inPeriod(ymOfDate(b.endDate)));
  const quotes = state.highlights.filter(h => inPeriod(ymOf(h.createdAt)));
  const notes = state.notes.filter(n => inPeriod(ymOf(n.createdAt)));
  const comments = quotes.filter(h => h.comment?.trim()).length;
  const pages = finished.reduce((t, b) => t + (b.totalPages || 0), 0);
  const noPages = finished.filter(b => !b.totalPages).length;
  const monthly = MONTHS.map((_, m) => ({
    books: state.books.filter(b => b.status === 'tamamlandi' && (ymOfDate(b.endDate) || [])[0] === year && ymOfDate(b.endDate)[1] === m),
    quotes: state.highlights.filter(h => { const ym = ymOf(h.createdAt); return ym && ym[0] === year && ym[1] === m; }).length,
  })).map(x => ({ books: x.books.length, pages: x.books.reduce((t, b) => t + (b.totalPages || 0), 0), quotes: x.quotes }));
  const authors = new Map(), cats = new Map();
  for (const b of finished) {
    for (const a of (b.author || '').split(',').map(s => s.trim()).filter(Boolean)) authors.set(a, (authors.get(a) || 0) + 1);
    if (b.category) cats.set(b.category, (cats.get(b.category) || 0) + 1);
  }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1] || compareTr(a[0], b[0])).slice(0, 5);
  return { finished, quotes: quotes.length, notes: notes.length + comments, pages, noPages, monthly, authors: top(authors), cats: top(cats) };
}

export function yearsAvailable() {
  const ys = new Set([new Date().getFullYear()]);
  state.books.forEach(b => { const ym = ymOfDate(b.endDate); if (ym) ys.add(ym[0]); });
  state.highlights.forEach(h => { const ym = ymOf(h.createdAt); if (ym) ys.add(ym[0]); });
  return [...ys].sort((a, b) => b - a);
}

/** Tek serili aylık çubuk grafik (bir eksen, değer üzerine gelince/odaklanınca görünür). */
function barChart(title, unit, values, { selected, onPick }) {
  const max = Math.max(...values, 0);
  const maxIdx = values.indexOf(max);
  const cols = values.map((v, i) => {
    const bar = el('span', { class: 'bar-fill' });
    bar.style.height = max ? `${Math.max(v ? 4 : 0, Math.round(v / max * 100))}%` : '0%';
    return el('button', {
      type: 'button', class: `bar-col${selected === i ? ' is-selected' : ''}${v ? '' : ' is-zero'}`,
      'aria-label': `${MONTHS[i]}: ${fmt(v)} ${unit}`, title: `${MONTHS[i]}: ${fmt(v)} ${unit}`,
      onclick: () => onPick(selected === i ? null : i),
    }, el('span', { class: `bar-value${i === maxIdx && max ? ' always' : ''}` }, fmt(v)), el('span', { class: 'bar-track' }, bar), el('span', { class: 'bar-label' }, MONTHS[i].slice(0, 3)));
  });
  return el('figure', { class: 'chart card' },
    el('figcaption', {}, el('strong', {}, title), el('span', { class: 'muted small' }, max ? ` · en yüksek ${MONTHS[maxIdx]} (${fmt(max)})` : ' · bu yıl veri yok')),
    el('div', { class: 'bars', role: 'group', 'aria-label': title }, cols));
}

function tile(value, label, sub) {
  return el('div', { class: 'stat' }, el('strong', {}, value), el('span', {}, label), sub ? el('small', { class: 'muted' }, sub) : null);
}

export function statsView() {
  const years = yearsAvailable();
  if (view.year === null || !years.includes(view.year)) view.year = years[0];
  const y = view.year, m = view.month;
  const s = computeStats(y, m);
  const yearStats = m === null ? s : computeStats(y, null);
  const pick = mm => { view.month = mm; refresh(); };

  const yearChips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Yıl' }, years.map(yy =>
    el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(yy === y), onclick: () => { view.year = yy; view.month = null; refresh(); } }, String(yy))));
  const monthSel = el('select', { 'aria-label': 'Ay', class: 'select-small' },
    el('option', { value: '', selected: m === null }, 'Tüm yıl'),
    MONTHS.map((name, i) => el('option', { value: String(i), selected: m === i }, name)));
  monthSel.onchange = () => pick(monthSel.value === '' ? null : Number(monthSel.value));

  const period = m === null ? String(y) : `${MONTHS[m]} ${y}`;
  const tiles = el('div', { class: 'stats' },
    tile(fmt(s.finished.length), 'Bitirilen kitap'),
    tile(fmt(s.pages), 'Okunan sayfa', s.noPages ? `${s.noPages} kitabın sayfası yok` : null),
    tile(fmt(s.quotes), 'Alıntı'),
    tile(fmt(s.notes), 'Kişisel not'));

  const undated = state.books.filter(b => b.status === 'tamamlandi' && !b.endDate);
  const allYears = years.slice().sort((a, b) => b - a).map(yy => ({ y: yy, ...computeStats(yy) }));

  const bookList = s.finished.length ? el('div', { class: 'mini-books' }, [...s.finished].sort((a, b) => b.endDate.localeCompare(a.endDate)).map(b =>
    el('a', { class: 'mini-book', href: `#/kitap/${encodeURIComponent(b.id)}` }, cover(b, 'sm'),
      el('span', {}, el('strong', {}, b.title), el('span', { class: 'muted small' }, `${b.author} · ${formatDate(b.endDate)}${b.totalPages ? ' · ' + fmt(b.totalPages) + ' sayfa' : ''}`)))))
    : emptyState(`${period} için bitirilmiş kitap yok.`);

  const rank = (title, rows) => rows.length ? el('div', { class: 'card rank' }, el('h3', {}, title),
    el('ol', {}, rows.map(([k, v]) => el('li', {}, el('span', {}, k), el('b', {}, fmt(v)))))) : null;

  const tagsTop = tagCounts().slice(0, 8);

  return el('section', { class: 'stats-page' },
    pageHeader('İstatistik', { subtitle: 'Kitaplar bitirme tarihine, alıntı ve notlar eklenme tarihine göre sayılır.' }),
    el('div', { class: 'toolbar' }, yearChips, monthSel),
    el('h2', { class: 'period' }, period),
    tiles,
    undated.length ? el('p', { class: 'callout callout-soft' }, icon('alert'), el('span', {}, `${undated.length} tamamlanmış kitabın bitirme tarihi yok, istatistiğe girmiyor. Kitabı düzenleyip tarih ekleyebilirsin.`)) : null,
    barChart(`${y} · aylara göre bitirilen kitap`, 'kitap', yearStats.monthly.map(x => x.books), { selected: m, onPick: pick }),
    barChart(`${y} · aylara göre okunan sayfa`, 'sayfa', yearStats.monthly.map(x => x.pages), { selected: m, onPick: pick }),
    barChart(`${y} · aylara göre eklenen alıntı`, 'alıntı', yearStats.monthly.map(x => x.quotes), { selected: m, onPick: pick }),
    el('div', { class: 'section-head' }, el('h2', {}, `${period} içinde bitirdiklerin`)),
    bookList,
    el('div', { class: 'grid-2 rank-grid' }, rank('En çok okunan yazarlar', s.authors), rank('Kategoriler', s.cats)),
    tagsTop.length ? el('div', { class: 'card' }, el('h3', {}, 'En çok kullanılan etiketler'),
      el('div', { class: 'tag-cloud' }, tagsTop.map(t => el('a', { class: 'tag-pill', href: `#/alintilar?etiket=${encodeURIComponent(t.name)}` }, '#' + t.name, el('span', {}, String(t.count)))))) : null,
    el('div', { class: 'card' }, el('h3', {}, 'Yıllara göre'),
      el('table', { class: 'year-table' },
        el('thead', {}, el('tr', {}, ['Yıl', 'Kitap', 'Sayfa', 'Alıntı', 'Not'].map(h => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, allYears.map(r => el('tr', { class: r.y === y ? 'is-current' : '' },
          el('th', { scope: 'row' }, el('button', { type: 'button', class: 'linklike', onclick: () => { view.year = r.y; view.month = null; refresh(); } }, String(r.y))),
          el('td', {}, fmt(r.finished.length)), el('td', {}, fmt(r.pages)), el('td', {}, fmt(r.quotes)), el('td', {}, fmt(r.notes))))))),
    el('div', { class: 'row-actions' }, button('Okuduğum bir kitabı ekle', { icon: 'plus', small: true, onClick: async () => { const { addPastBook } = await import('./books.js'); addPastBook(); } })));
}

/** Ana sayfa özeti */
export function yearSummaryCard() {
  const y = new Date().getFullYear();
  const s = computeStats(y);
  if (!s.finished.length && !s.quotes) return null;
  return el('a', { class: 'card summary-card', href: '#/istatistik' },
    el('div', {}, el('span', { class: 'eyebrow' }, `${y} özeti`),
      el('p', {}, el('strong', {}, `${fmt(s.finished.length)} kitap`), ` · ${fmt(s.pages)} sayfa · ${fmt(s.quotes)} alıntı · ${fmt(s.notes)} not`)),
    icon('chevron', { size: 20 }));
}
