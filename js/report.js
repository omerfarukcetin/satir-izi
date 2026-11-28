// Kitap raporu: kullanıcının yalnızca o kitaptaki alıntı ve notlarından yapay zekâ ile hazırlanır.
import { el, toast, confirmDialog, copyText, formatDate, nowISO, isOnline } from './utils.js';
import { icon } from './icons.js';
import { highlightsOf, notesOf, saveBook } from './store.js';
import { refresh } from './router.js';
import { button } from './ui.js';
import { bookReport, hasApiKey } from './gemini.js';

const MIN_ITEMS = 3;

/** Raporun dayandığı içeriğin imzası (değişince "yenile" uyarısı) */
export function reportSig(book) {
  const hs = highlightsOf(book.id), ns = notesOf(book.id);
  const last = [...hs, ...ns].map(x => x.updatedAt).sort().pop() || '';
  return `${hs.length}|${ns.length}|${last}|${(book.review || '').length}`;
}

export function reportToMarkdown(r) {
  if (!r?.data) return '';
  const d = r.data, out = ['## Rapor', '', `*${formatDate(r.createdAt)} tarihinde alıntılarından ve notlarından hazırlandı.*`, ''];
  if (d.summary) out.push(d.summary, '');
  if (d.themes.length) {
    out.push('### Temalar', '');
    for (const t of d.themes) out.push(`- **${t.title}:** ${t.text}${t.pages.length ? ` (s. ${t.pages.join(', ')})` : ''}`);
    out.push('');
  }
  if (d.quotes.length) {
    out.push('### Öne çıkan alıntılar', '');
    for (const q of d.quotes) out.push(`> ${q.text}${q.page ? ` (s. ${q.page})` : ''}`, '', q.why ? `${q.why}` : '', '');
  }
  if (d.thoughts.length) { out.push('### Düşüncelerim', '', ...d.thoughts.map(x => `- ${x}`), ''); }
  if (d.questions.length) { out.push('### Düşünmek için', '', ...d.questions.map(x => `- ${x}`), ''); }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

async function generate(book, btn) {
  const hs = highlightsOf(book.id), ns = notesOf(book.id);
  btn.disabled = true;
  const label = btn.querySelector('span');
  const old = label?.textContent;
  if (label) label.textContent = 'Hazırlanıyor… (20–40 sn)';
  try {
    const r = await bookReport({ book, highlights: hs, notes: ns });
    const { data } = r;
    if (!data.summary && !data.themes.length) throw new Error('Rapor oluşturulamadı; model boş yanıt verdi. Tekrar dene.');
    await saveBook({ ...book, report: { createdAt: nowISO(), model: r.model, basedOn: { highlights: hs.length, notes: ns.length, sig: reportSig(book) }, data } });
    reportOpen.add(book.id); // yeni hazırlanan rapor açık gösterilsin
    toast(r.sampled ? `Rapor hazır. Alıntılar çok olduğu için ${r.used} tanesi kullanıldı.` : 'Rapor hazır.');
    refresh();
  } catch (e) {
    toast(e.full || e.message || 'Rapor oluşturulamadı.', { type: 'error', duration: 8000 });
  } finally {
    btn.disabled = false;
    if (label) label.textContent = old;
  }
}

// Açılan raporlar oturum boyunca açık kalır (sayfa yenilense de katlanmasın)
const reportOpen = new Set();

export function reportSection(book) {
  const hs = highlightsOf(book.id), ns = notesOf(book.id);
  const total = hs.length + ns.length;
  const r = book.report;
  const canAI = hasApiKey() && isOnline();
  const genBtn = button(r ? 'Yenile' : 'Rapor oluştur', { icon: r ? 'rotateRight' : 'note', small: true, variant: r ? 'ghost' : 'primary', disabled: !canAI || total < MIN_ITEMS });
  genBtn.onclick = async () => {
    if (r && !await confirmDialog({ title: 'Rapor yenilensin mi?', message: 'Mevcut rapor, şu anki alıntı ve notlarınla yeniden hazırlanır (1 Gemini isteği).', confirmLabel: 'Yenile' })) return;
    generate(book, genBtn);
  };
  const hint = !canAI ? 'Rapor için internet ve Ayarlar’da Gemini anahtarı gerekli.'
    : total < MIN_ITEMS ? `Rapor için en az ${MIN_ITEMS} alıntı veya not gerekli (şu an ${total}).` : '';

  if (!r) {
    // Rapor yokken tek satır: ne olduğu kısa, koşul eksikse neden yapılamadığı
    genBtn.querySelector('span:last-child')?.replaceChildren('Oluştur');
    genBtn.title = 'Alıntı ve notlarından kısa rapor: temalar, öne çıkan alıntılar, kendi düşüncelerin. Yalnızca senin kayıtların kullanılır. 1 Gemini isteği.';
    return el('section', { class: 'report-slim' },
      icon('note', { size: 18 }),
      el('div', {}, el('strong', {}, 'Kitap raporu'), el('span', { class: 'muted small' }, hint || 'Alıntılarından ve notlarından kısa özet')),
      genBtn);
  }

  const d = r.data;
  const stale = r.basedOn?.sig && r.basedOn.sig !== reportSig(book);
  const pageChips = pages => (pages.length ? el('span', { class: 'report-pages' }, 's. ' + pages.join(', ')) : null);
  const box = el('details', { class: 'card report report-fold', open: reportOpen.has(book.id) });
  box.addEventListener('toggle', () => { if (box.open) reportOpen.add(book.id); else reportOpen.delete(book.id); });
  box.append(el('summary', {}, el('span', {}, 'Kitap raporu'), el('span', { class: 'muted small' }, `${formatDate(r.createdAt)}${stale ? ' · güncel değil' : ''}`)));
  box.append(...el('div', {}, el('section', { class: 'report-inner' },
    el('div', { class: 'section-head report-head' }, el('span', {}),
      el('div', { class: 'row-actions' },
        el('button', { type: 'button', class: 'icon-btn icon-btn-ghost', title: 'Markdown olarak kopyala', 'aria-label': 'Raporu kopyala', onclick: async () => toast(await copyText(`# ${book.title}\n\n${reportToMarkdown(r)}`) ? 'Rapor kopyalandı.' : 'Kopyalanamadı.') }, icon('copy')),
        el('button', { type: 'button', class: 'icon-btn icon-btn-ghost', title: 'Raporu sil', 'aria-label': 'Raporu sil', onclick: async () => {
          if (!await confirmDialog({ title: 'Rapor silinsin mi?', message: 'Alıntıların ve notların silinmez; yalnızca rapor kalkar.', confirmLabel: 'Sil', danger: true })) return;
          await saveBook({ ...book, report: null }); refresh();
        } }, icon('trash')),
        genBtn)),
    el('p', { class: 'muted small' }, `${formatDate(r.createdAt)} · ${r.basedOn?.highlights || 0} alıntı ve ${r.basedOn?.notes || 0} nottan hazırlandı · yalnızca senin kayıtların`),
    stale ? el('p', { class: 'small warn-text' }, 'Rapordan sonra alıntı veya not eklendi/değişti. Güncel hâli için “Yenile”.') : null,
    hint && stale ? el('p', { class: 'small muted' }, hint) : null,
    d.summary ? el('p', { class: 'report-summary' }, d.summary) : null,
    d.themes.length ? el('div', {}, el('h3', {}, 'Temalar'),
      el('ul', { class: 'report-themes' }, d.themes.map(t => el('li', {}, el('strong', {}, t.title), ' ', el('span', {}, t.text), ' ', pageChips(t.pages))))) : null,
    d.quotes.length ? el('div', {}, el('h3', {}, 'Öne çıkan alıntılar'),
      d.quotes.map(q => el('figure', { class: 'report-quote' },
        el('blockquote', { class: 'hl-text' }, q.text),
        el('figcaption', { class: 'muted small' }, [q.page ? `s. ${q.page}` : null, q.why].filter(Boolean).join(' · '))))) : null,
    d.thoughts.length ? el('div', {}, el('h3', {}, 'Düşüncelerim'), el('ul', { class: 'report-list' }, d.thoughts.map(x => el('li', {}, x)))) : null,
    d.questions.length ? el('div', {}, el('h3', {}, 'Düşünmek için'), el('ul', { class: 'report-list' }, d.questions.map(x => el('li', {}, x)))) : null,
    el('p', { class: 'muted small report-note' }, 'Yapay zekâ tarafından senin alıntı ve notlarından derlendi; öne çıkan alıntılar kayıtlarınla birebir eşleşenlerden seçildi.'))).childNodes);
  return box;
}
