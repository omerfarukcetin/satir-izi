// Haftalık ve aylık özet: okuduklarını unutmamak için dönemin alıntı ve notlarından tarafsız bir özet.
// Rakamlar, seçilen alıntılar ve "hatırla" bölümü cihazda hesaplanır; değerlendirme metni (varsa) Gemini'den gelir ve doğrulanır.
import { el, toast, copyText, download, formatDate, nowISO, isOnline } from './utils.js';
import { icon } from './icons.js';
import * as db from './database.js';
import { state, bookById } from './store.js';
import { inlineTags, findItem } from './links.js';
import { refresh, parse } from './router.js';
import { button, pageHeader, emptyState, cover } from './ui.js';
import { periodDigest, hasApiKey } from './gemini.js';
import { currentUser, status as syncStatus, onSyncChange } from './sync.js';
import { openShareDialog } from './share.js';
import { periodOf, lastCompleted, periodById, periodItems, computeLocal, periodSig, sanitizeDigest, dayKey } from './digest-data.js';

const RETRY_AFTER_MS = 12 * 3600e3; // başarısız değerlendirme en erken 12 saat sonra kendiliğinden yeniden denenir
const busy = new Set();             // şu an hazırlanan dönemler

export async function getDigests() { return (await db.getSetting('digests', {})) || {}; }
async function saveDigest(d) {
  const all = await getDigests();
  all[d.id] = sanitizeDigest(d);
  await db.put('settings', { key: 'digests', value: all });
  db.notifyLocalChange(); // hesabı olan cihazlarda eşitlenir (diğer cihaz aynı özeti yeniden hazırlamaz)
}
export const autoEnabled = async () => (await db.getSetting('autoDigest', true)) !== false;
const canAI = () => hasApiKey() && isOnline();

/** Bir dönemin özetini hazırlar ve saklar. withAI: Gemini ile değerlendirme (1 istek). */
export async function buildDigest(p, { withAI = canAI() } = {}) {
  if (busy.has(p.id)) return null;
  busy.add(p.id); refreshIfShowing(p.id);
  try {
    const local = computeLocal(p);
    const { highlights, notes } = periodItems(p);
    const d = { id: p.id, type: p.type, createdAt: nowISO(), sig: periodSig(p), local, pick: local.pick, ai: null, aiError: '', aiErrorAt: '' };
    if (!highlights.length && !notes.length && !local.stats.pages && !local.started.length && !local.finished.length) d.empty = true;
    else if (withAI && highlights.length + notes.length >= 2) {
      const items = [...highlights.map(h => ({ id: h.id, kind: 'highlight', bookId: h.bookId, page: h.page, text: h.text, note: h.comment || '', tags: [...(h.tags || []), ...inlineTags(h.comment)] })),
        ...notes.map(n => ({ id: n.id, kind: 'note', bookId: n.bookId, page: '', text: n.text, note: '', tags: [...(n.tags || []), ...inlineTags(n.text)] }))]
        .sort((a, b) => String(a.bookId).localeCompare(String(b.bookId)));
      const books = local.books.map(b => ({ id: b.id, title: bookById(b.id)?.title || '', author: bookById(b.id)?.author || '', pages: b.pages }));
      try {
        const r = await periodDigest({ label: p.label, type: p.type, items, books });
        if (!r.overview.length && !r.books.length) throw new Error('Model boş ya da doğrulanamayan bir özet döndürdü.');
        d.ai = { model: r.model, overview: r.overview, books: r.books, themes: r.themes, dropped: r.dropped };
        if (r.pick.length) d.pick = r.pick;
      } catch (e) {
        d.aiError = (e.full || e.message || 'Değerlendirme hazırlanamadı.').slice(0, 300);
        d.aiErrorAt = nowISO();
      }
    }
    await saveDigest(d);
    return d;
  } finally {
    busy.delete(p.id); refreshIfShowing(p.id);
  }
}
function refreshIfShowing(id) {
  const { parts } = parse();
  if (!parts.length || parts[0] === 'ozetler' || (parts[0] === 'ozet' && parts[1] === id)) refresh();
}

/** Hafta/ay bitince son dönemin özetini kendiliğinden hazırlar (oturum başına bir kez, sırayla, en fazla 2 istek). */
let autoRan = false;
export async function autoDigests() {
  if (autoRan || !(state.highlights.length + state.notes.length)) return;
  autoRan = true;
  if (!(await autoEnabled())) return;
  // Hesap açıksa önce buluttan gelsin: diğer cihaz hazırladıysa yeniden istek harcanmaz
  if (currentUser() && syncStatus.state !== 'ok') {
    await new Promise(res => { const t = setTimeout(done, 25000); const off = onSyncChange(() => { if (syncStatus.state === 'ok' || syncStatus.state === 'error') done(); }); function done() { clearTimeout(t); off(); res(); } });
  }
  const all = await getDigests();
  for (const type of ['hafta', 'ay']) {
    const p = lastCompleted(type);
    const d = all[p.id];
    const items = periodItems(p);
    const hasItems = items.highlights.length + items.notes.length >= 2;
    const needAI = d && !d.empty && !d.ai && hasItems && canAI() && (!d.aiErrorAt || Date.now() - Date.parse(d.aiErrorAt) > RETRY_AFTER_MS);
    if (!d || needAI) {
      try { await buildDigest(p); } catch (e) { console.warn('Özet hazırlanamadı', e); }
    }
  }
}

// ---------- Görünüm yardımcıları ----------
const typeName = t => (t === 'hafta' ? 'Haftalık özet' : 'Aylık özet');
const statLine = d => {
  const s = d.local.stats, n = d.local.books.length;
  return [s.quotes ? `${s.quotes} alıntı` : '', s.notes ? `${s.notes} not` : '', n ? `${n} kitap` : '', s.pages ? `${s.pages} sayfa` : ''].filter(Boolean).join(' · ') || 'Kayıt yok';
};
const hlById = id => state.highlights.find(h => h.id === id);
function quoteCard(h, { small = false } = {}) {
  const b = bookById(h.bookId);
  return el('figure', { class: 'dg-quote' + (small ? ' small' : '') },
    el('blockquote', {}, h.text),
    el('figcaption', {}, el('a', { href: `#/kitap/${encodeURIComponent(h.bookId)}` }, b?.title || 'Kitap'), h.page ? ` · s. ${h.page}` : '', small ? ` · ${formatDate(h.createdAt)}` : '',
      el('button', { type: 'button', class: 'icon-btn dg-share', 'aria-label': 'Alıntı kartı olarak paylaş', onclick: () => openShareDialog(h) }, icon('share', { size: 16 }))));
}
const refLine = refs => {
  const parts = [];
  for (const id of refs) { const f = findItem(id); if (!f) continue; const b = bookById(f.item.bookId); const lab = `${b?.title || ''}${f.item.page ? ' s. ' + f.item.page : ''}`; if (!parts.includes(lab)) parts.push(lab); }
  return parts.length ? el('span', { class: 'dg-refs' }, 'Kaynak: ' + parts.slice(0, 4).join('; ') + (parts.length > 4 ? '…' : '')) : null;
};

/** Ana sayfa kartı: biten son haftanın (ve yeni biten ayın) özeti */
export async function digestHomeCard() {
  if (!(state.highlights.length + state.notes.length)) return null;
  const all = await getDigests();
  const w = lastCompleted('hafta'), m = lastCompleted('ay');
  const dw = all[w.id], dm = all[m.id];
  const monthFresh = dm && !dm.empty && Date.now() - new Date(periodOf('ay').from).getTime() < 8 * 864e5;
  if ((!dw || dw.empty) && !busy.has(w.id) && !monthFresh) return null;
  const row = (p, d) => {
    if (busy.has(p.id)) return el('div', { class: 'dg-row' }, el('span', { class: 'spinner spinner-sm', 'aria-hidden': 'true' }), el('span', {}, `${p.label} özeti hazırlanıyor…`));
    const first = d.ai?.overview?.[0]?.text;
    return el('a', { class: 'dg-row', href: `#/ozet/${p.id}` },
      el('span', { class: 'dg-kind' }, p.type === 'hafta' ? 'Geçen hafta' : 'Geçen ay'),
      el('strong', {}, p.label),
      el('span', { class: 'muted small' }, statLine(d)),
      first ? el('p', { class: 'dg-snip' }, first) : null);
  };
  return el('div', { class: 'card dg-home' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Okuduklarının izi'), el('a', { href: '#/ozetler' }, 'Tüm özetler')),
    (dw && !dw.empty) || busy.has(w.id) ? row(w, dw) : null,
    monthFresh ? row(m, dm) : null);
}

// ---------- Özet listesi ----------
let listType = 'hafta';
export async function digestsView() {
  const all = await getDigests();
  const dates = [...state.highlights, ...state.notes].map(x => x.createdAt).filter(Boolean).sort();
  if (!dates.length) return el('section', {}, pageHeader('Özetler'), emptyState('Alıntı ve not ekledikçe her hafta ve ay için özetin burada birikecek.'));
  // İlk kayıttan biten son döneme kadar olan dönemler (en fazla 26 hafta / 24 ay)
  const periods = [];
  let p = lastCompleted(listType);
  const first = dayKey(new Date(dates[0]));
  while (p.to > first && periods.length < (listType === 'hafta' ? 26 : 24)) {
    periods.push(p);
    const prev = new Date(p.from + 'T00:00:00'); prev.setDate(prev.getDate() - 1); p = periodOf(listType, prev);
  }
  const cur = periodOf(listType);
  const seg = el('div', { class: 'chips seg', role: 'group', 'aria-label': 'Dönem' },
    ...[['hafta', 'Haftalık'], ['ay', 'Aylık']].map(([v, l]) => el('button', { type: 'button', class: 'chip-btn chip-sm', 'aria-pressed': String(listType === v), onclick: () => { listType = v; refresh(); } }, l)));
  const rows = periods.map(p => {
    const d = all[p.id], n = periodItems(p);
    const count = n.highlights.length + n.notes.length;
    if (busy.has(p.id)) return el('div', { class: 'dg-item' }, el('div', {}, el('strong', {}, p.label), el('span', { class: 'muted small' }, 'Hazırlanıyor…')), el('span', { class: 'spinner spinner-sm' }));
    if (d && !d.empty) return el('a', { class: 'dg-item', href: `#/ozet/${p.id}` }, el('div', {}, el('strong', {}, p.label), el('span', { class: 'muted small' }, statLine(d) + (d.ai ? '' : ' · yalnızca rakamlar ve seçim'))), icon('chevron', { size: 18 }));
    if (!count) return el('div', { class: 'dg-item dg-empty' }, el('div', {}, el('strong', {}, p.label), el('span', { class: 'muted small' }, 'Bu dönemde kayıt yok')));
    return el('div', { class: 'dg-item' }, el('div', {}, el('strong', {}, p.label), el('span', { class: 'muted small' }, `${count} kayıt · özet henüz hazırlanmadı`)),
      button('Hazırla', { small: true, onClick: () => buildDigest(p).then(d => d && (location.hash = '#/ozet/' + p.id)) }));
  });
  const curN = periodItems(cur);
  return el('section', { class: 'digests' },
    pageHeader('Özetler', { back: '#/', subtitle: 'Hafta ve ay bitince o dönemin alıntılarından ve notlarından özet hazırlanır. Amaç: okuduklarını unutmamak.' }),
    seg,
    el('div', { class: 'dg-item dg-current' }, el('div', {}, el('strong', {}, `${listType === 'hafta' ? 'Bu hafta' : 'Bu ay'} · ${cur.label}`),
      el('span', { class: 'muted small' }, `${curN.highlights.length} alıntı, ${curN.notes.length} not · dönem bitince özetlenecek`)),
      curN.highlights.length + curN.notes.length ? button('Şimdiye kadarkini gör', { small: true, variant: 'ghost', href: `#/ozet/${cur.id}` }) : null),
    el('div', { class: 'dg-list' }, rows),
    el('p', { class: 'muted small' }, canAI() ? 'Her özet 1 Gemini isteği harcar ve bir kez hazırlanır. Anahtar ya da internet yoksa yalnızca rakamlar ve seçilen alıntılar hazırlanır.' : 'Gemini anahtarı olmadığı için özetlerde yalnızca rakamlar ve cihazın seçtiği alıntılar olur. Değerlendirme için Ayarlar’dan anahtar ekleyebilirsin.'));
}

// ---------- Özet ayrıntısı ----------
export async function digestView({ parts = [] } = {}) {
  const p = periodById(parts[1]);
  if (!p) return el('section', {}, pageHeader('Özet', { back: '#/ozetler' }), emptyState('Böyle bir dönem bulunamadı.'));
  const isCurrent = p.id === periodOf(p.type).id;
  let d = (await getDigests())[p.id];
  if (isCurrent) { // süren dönem: yalnızca cihazda hesaplanan önizleme, saklanmaz
    const local = computeLocal(p);
    d = { id: p.id, type: p.type, createdAt: nowISO(), local, pick: local.pick, ai: null };
  }
  const head = pageHeader(`${typeName(p.type)} · ${p.label}`, { back: '#/ozetler', subtitle: isCurrent ? 'Dönem sürüyor; bu bir önizleme. Dönem bitince değerlendirmeli özet hazırlanır.' : null });
  if (busy.has(p.id)) return el('section', { class: 'digest' }, head, el('div', { class: 'card' }, el('span', { class: 'spinner spinner-sm' }), ' Özet hazırlanıyor… (20–40 sn)'));
  if (!d) {
    const n = periodItems(p);
    return el('section', { class: 'digest' }, head, emptyState(n.highlights.length + n.notes.length ? 'Bu dönemin özeti henüz hazırlanmadı.' : 'Bu dönemde kayıt yok.',
      n.highlights.length + n.notes.length ? button('Özeti hazırla', { variant: 'primary', icon: 'sparkle', onClick: () => buildDigest(p) }) : null));
  }
  if (d.empty) return el('section', { class: 'digest' }, head, emptyState('Bu dönemde alıntı, not ya da okuma kaydı yok.'));
  const L = d.local, s = L.stats;
  const bookName = id => bookById(id)?.title || 'Silinmiş kitap';
  const aiBook = new Map((d.ai?.books || []).map(b => [b.bookId, b]));
  const changed = !isCurrent && d.sig && d.sig !== periodSig(p);

  const tiles = el('div', { class: 'stats dg-tiles' },
    tile(s.quotes, 'alıntı'), tile(s.notes + s.comments, 'not'), tile(L.books.length, 'kitap'), s.pages ? tile(s.pages, 'sayfa') : null);
  const overview = d.ai?.overview?.length ? el('div', { class: 'card dg-overview' }, d.ai.overview.map(o => el('div', { class: 'dg-par' }, el('p', {}, o.text), refLine(o.refs)))) : null;
  const themes = d.ai?.themes?.length || L.tags.length ? el('div', { class: 'dg-block' }, el('h2', {}, d.ai?.themes?.length ? 'Temalar' : 'Etiketler'),
    el('div', { class: 'chips seg' }, d.ai?.themes?.length
      ? d.ai.themes.map(t => el('span', { class: 'tag' }, t.title, el('span', { class: 'muted' }, ` ${t.refs.length}`)))
      : L.tags.map(([n, c]) => el('a', { class: 'tag', href: `#/alintilar?etiket=${encodeURIComponent(n)}` }, `#${n} ${c}`)))) : null;
  const books = L.books.length ? el('div', { class: 'dg-block' }, el('h2', {}, 'Kitaplar'),
    L.books.map(b => { const bk = bookById(b.id); if (!bk) return null; const a = aiBook.get(b.id);
      return el('div', { class: 'card dg-book' },
        el('a', { class: 'dg-book-head', href: `#/kitap/${encodeURIComponent(b.id)}` }, cover(bk, 'sm'),
          el('div', {}, el('strong', {}, bk.title), el('span', { class: 'muted small' }, [bk.author, [b.quotes ? `${b.quotes} alıntı` : '', b.notes ? `${b.notes} not` : '', b.pages ? `${b.pages} sayfa` : ''].filter(Boolean).join(', ')].filter(Boolean).join(' · ')),
            L.started.includes(b.id) || L.finished.includes(b.id) ? el('span', { class: 'dg-badges' }, L.started.includes(b.id) ? el('span', { class: 'chip' }, 'Başladın') : null, L.finished.includes(b.id) ? el('span', { class: 'chip chip-ok' }, 'Bitirdin') : null) : null)),
        a ? el('p', {}, a.text) : null);
    })) : null;
  const finishedOnly = L.finished.filter(id => !L.books.some(b => b.id === id) && bookById(id));
  const picks = d.pick.map(hlById).filter(Boolean);
  const pickBlock = picks.length ? el('div', { class: 'dg-block' }, el('h2', {}, 'Bu dönemin satırları'), picks.map(h => quoteCard(h))) : null;
  const rem = L.remember.map(hlById).filter(Boolean);
  const remBlock = rem.length ? el('div', { class: 'dg-block dg-remember' }, el('h2', {}, 'Unutma'),
    el('p', { class: 'muted small' }, L.rememberRelated ? 'Daha önce kaydettiğin, bu dönemin konularıyla ilgili satırlar:' : 'Daha önce kaydettiğin satırlardan:'),
    rem.map(h => quoteCard(h, { small: true }))) : null;

  const regen = async () => { await buildDigest(p, { withAI: true }); };
  const foot = isCurrent ? null : el('div', { class: 'dg-foot' },
    changed ? el('div', { class: 'callout' }, icon('info'), el('div', {}, el('strong', {}, 'Bu dönemde değişiklik oldu'), el('p', { class: 'muted small' }, 'Özet hazırlandıktan sonra bu döneme ait kayıtlar eklendi, değişti ya da silindi.'), button('Güncelle', { small: true, icon: 'refresh', onClick: regen, disabled: !canAI() && false }))) : null,
    d.ai ? el('p', { class: 'muted small' }, `Değerlendirme yalnızca bu dönemin kayıtlarından hazırlandı (${d.ai.model}, ${formatDate(d.createdAt, true)}). Alıntılar kayıtlı hâlleriyle gösterilir.${d.ai.dropped ? ` Kaynağı doğrulanamayan ${d.ai.dropped} bölüm çıkarıldı.` : ''}`)
      : el('div', { class: 'muted small dg-noai' },
        d.aiError ? `Değerlendirme hazırlanamadı: ${d.aiError}` : 'Bu özette yalnızca rakamlar ve cihazın seçtiği alıntılar var.',
        ' ', canAI() && s.quotes + s.notes >= 2 ? button('Değerlendirme ekle', { small: true, icon: 'sparkle', onClick: regen }) : null),
    el('div', { class: 'row-actions' },
      button('Markdown kopyala', { small: true, variant: 'ghost', icon: 'copy', onClick: async () => { await copyText(toMarkdown(p, d)); toast('Kopyalandı.'); } }),
      button('İndir', { small: true, variant: 'ghost', icon: 'download', onClick: () => download(`satir-izi-ozet-${p.id}.md`, new Blob([toMarkdown(p, d)], { type: 'text/markdown' })) })));

  return el('section', { class: 'digest' }, head, tiles, overview,
    finishedOnly.length ? el('p', { class: 'muted small' }, 'Bu dönemde bitirdiğin: ' + finishedOnly.map(bookName).join(', ')) : null,
    pickBlock, themes, books, remBlock, foot);
}
function tile(n, label) { return el('div', { class: 'stat' }, el('strong', {}, String(n)), el('span', {}, label)); }

export function toMarkdown(p, d) {
  const L = d.local, out = [`# ${typeName(p.type)} · ${p.label}`, '', `*${L.stats.quotes} alıntı, ${L.stats.notes + L.stats.comments} not, ${L.books.length} kitap${L.stats.pages ? `, ${L.stats.pages} sayfa` : ''}*`, ''];
  for (const o of d.ai?.overview || []) out.push(o.text, '');
  const picks = d.pick.map(hlById).filter(Boolean);
  if (picks.length) { out.push('## Bu dönemin satırları', ''); for (const h of picks) out.push(`> ${h.text}`, `> — ${bookById(h.bookId)?.title || ''}${h.page ? `, s. ${h.page}` : ''}`, ''); }
  if (d.ai?.themes?.length) out.push('## Temalar', '', ...d.ai.themes.map(t => `- ${t.title}`), '');
  if (L.books.length) {
    out.push('## Kitaplar', '');
    const ai = new Map((d.ai?.books || []).map(b => [b.bookId, b]));
    for (const b of L.books) { const bk = bookById(b.id); if (!bk) continue; out.push(`### ${bk.title}${bk.author ? ' — ' + bk.author : ''}`, ''); if (ai.get(b.id)) out.push(ai.get(b.id).text, ''); }
  }
  const rem = L.remember.map(hlById).filter(Boolean);
  if (rem.length) { out.push('## Unutma', ''); for (const h of rem) out.push(`> ${h.text}`, `> — ${bookById(h.bookId)?.title || ''}${h.page ? `, s. ${h.page}` : ''}`, ''); }
  return out.join('\n');
}
