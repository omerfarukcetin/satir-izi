// Arşivle sohbet: sorular yalnızca kullanıcının alıntı ve notlarından, kaynak gösterilerek yanıtlanır.
// 1) Cihazda ilgili kayıtlar bulunur (arşiv küçükse hepsi gönderilir).  2) Gemini yalnızca bu kayıtlarla cevaplar.
// 3) Cevap doğrulanır: kaynağı olmayan veya kayıtlarda geçmeyen alıntı içeren paragraf atılır.
import { el, toast, normalizeText, isOnline } from './utils.js';
import { icon } from './icons.js';
import { state, bookById } from './store.js';
import { inlineTags } from './links.js';
import { button, pageHeader, emptyState } from './ui.js';
import { askArchive, hasApiKey } from './gemini.js';
import { tagCounts } from './tags.js';

const MAX_CHARS = 45000;
const STOP = new Set(('hangi hangisi kitap kitaplar kitaplarda kitapta kitabı kitabın ne neler neyi not notlar notlarım notlarımda notum ' +
  'almıştım aldım almışım hakkında ile ve veya bir bu şu için gibi daha çok nasıl neden niye nedir var yok olan olarak ' +
  'benim ben bana alıntı alıntılar alıntılarım alıntılarımda söyle göster bul listele özetle ki ise kadar sonra önce neydi nerede ' +
  'okuduğum okudum okuduklarım ilgili konusunda üzerine dair mı mi mu mü misin miyim yazdım yazmıştım işaretledim çizdiğim').split(/\s+/));

const conv = { turns: [] }; // oturum boyunca saklanır (cihazda kalıcı değil)

function tokens(q) {
  return normalizeText(q).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !STOP.has(w));
}
// Kaba Türkçe ek toleransı: kelimenin kökü kabul edilecek kadar baş kısmı
const stem = w => w.slice(0, Math.max(4, Math.ceil(w.length * 0.7)));

/** Bütün kayıtlar (alıntı + not) tek biçimde */
function corpus() {
  const out = [];
  for (const h of state.highlights) {
    const b = bookById(h.bookId);
    out.push({ id: h.id, kind: 'highlight', bookId: h.bookId, book: b?.title || '', author: b?.author || '', page: h.page, text: h.text, note: h.comment || '', tags: [...(h.tags || []), ...inlineTags(h.comment)], at: h.createdAt });
  }
  for (const n of state.notes) {
    const b = bookById(n.bookId);
    out.push({ id: n.id, kind: 'note', bookId: n.bookId, book: b?.title || '', author: b?.author || '', page: '', text: n.text, note: '', tags: [...(n.tags || []), ...inlineTags(n.text)], at: n.createdAt });
  }
  return out;
}

/** Soruyla ilgili kayıtları sırala; kalan yeri diğer kayıtlarla doldur (anlamsal eşleşmeler için). */
export function selectItems(question) {
  const toks = tokens(question).map(stem);
  const all = corpus();
  const scored = all.map(it => {
    const hay = normalizeText(`${it.text} ${it.note}`), meta = normalizeText(`${it.book} ${it.author}`), tags = it.tags.map(t => normalizeText(t));
    let s = 0;
    for (const t of toks) {
      if (hay.includes(t)) s += 2;
      if (tags.some(x => x.startsWith(t))) s += 3;
      if (meta.includes(t)) s += 1;
    }
    return { it, s };
  });
  scored.sort((a, b) => b.s - a.s || String(b.it.at).localeCompare(String(a.it.at)));
  const picked = [];
  let size = 0;
  for (const { it } of scored) {
    const len = it.text.length + it.note.length + it.book.length + 80;
    if (size + len > MAX_CHARS) continue;
    picked.push(it); size += len;
  }
  return { items: picked.map((it, i) => ({ ...it, key: 'K' + (i + 1) })), total: all.length, matched: scored.filter(x => x.s > 0).length };
}

function sourceCard(it, n) {
  return el('a', { class: 'ask-source', href: `#/kitap/${encodeURIComponent(it.bookId)}` },
    el('span', { class: 'ask-num' }, String(n)),
    el('span', { class: 'ask-src-body' },
      el('span', { class: 'link-kind' }, `${it.kind === 'note' ? 'Notun' : 'Alıntı'} · ${it.book}${it.page ? ' · s. ' + it.page : ''}`),
      el('span', { class: 'ask-src-text' }, it.text.length > 260 ? it.text.slice(0, 260) + '…' : it.text),
      it.note ? el('span', { class: 'ask-src-note' }, 'Notun: ' + (it.note.length > 160 ? it.note.slice(0, 160) + '…' : it.note)) : null));
}

function renderAnswer(turn) {
  if (turn.error) return el('div', { class: 'ask-a ask-error' }, turn.error);
  if (turn.pending) return el('div', { class: 'ask-a' }, el('span', { class: 'spinner spinner-sm', 'aria-hidden': 'true' }), ' Arşivin inceleniyor…');
  const { result, items } = turn;
  const byKey = new Map(items.map(i => [i.key, i]));
  const order = result.related; // kaynak numaraları bu sıraya göre
  const num = k => order.indexOf(k) + 1;
  return el('div', { class: 'ask-a' },
    result.paragraphs.map(p => el('p', {}, p.text, ' ',
      p.keys.map(k => el('sup', { class: 'ask-ref', title: `${byKey.get(k).book}${byKey.get(k).page ? ', s. ' + byKey.get(k).page : ''}` }, `[${num(k)}]`)))),
    result.notFound && !result.paragraphs.length ? el('p', {}, 'Arşivinde bu soruyla ilgili bir kayıt bulamadım.') : null,
    order.length ? el('div', { class: 'ask-sources' }, el('span', { class: 'field-label' }, 'Kaynaklar'), order.map((k, i) => sourceCard(byKey.get(k), i + 1))) : null,
    el('p', { class: 'muted small' }, `${turn.considered} kayıt incelendi${result.dropped ? ` · kaynağı doğrulanamayan ${result.dropped} paragraf çıkarıldı` : ''} · yalnızca senin kayıtların`));
}

export function askView({ params } = {}) {
  const total = state.highlights.length + state.notes.length;
  const canAI = hasApiKey() && isOnline();
  const list = el('div', { class: 'ask-list', 'aria-live': 'polite' });
  let examplesBox = null;
  const draw = () => {
    list.replaceChildren(...conv.turns.map(t => el('div', { class: 'ask-turn' }, el('div', { class: 'ask-q' }, t.q), renderAnswer(t))));
  };
  const input = el('textarea', { rows: 2, maxlength: 500, placeholder: 'Ör. Sabır hakkında hangi kitaplarda ne not almıştım?', 'aria-label': 'Sorun' });
  if (params?.get('q')) input.value = params.get('q').slice(0, 500); // haritadan gelen hazır soru (gönderilmez, kullanıcı onaylar)
  const send = button('Sor', { icon: 'send', variant: 'primary', disabled: !canAI || !total });
  const ask = async q => {
    q = (q || '').trim();
    if (!q) return;
    if (!canAI) { toast('Sormak için internet ve Ayarlar’da Gemini anahtarı gerekli.'); return; }
    const { items } = selectItems(q);
    const turn = { q, pending: true, items, considered: items.length };
    conv.turns.push(turn);
    if (examplesBox) examplesBox.hidden = true;
    input.value = ''; send.disabled = true; draw();
    list.lastElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    try {
      const history = conv.turns.filter(t => t !== turn && t.result).map(t => ({ q: t.q, a: t.result.paragraphs.map(p => p.text).join(' ') }));
      turn.result = await askArchive({ question: q, items, history });
    } catch (e) {
      turn.error = e.full || e.message || 'Cevap alınamadı.';
    } finally {
      turn.pending = false; send.disabled = !canAI; draw();
    }
  };
  send.onclick = () => ask(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });

  const topTags = tagCounts().slice(0, 3).map(t => t.name);
  const examples = [
    ...topTags.map(t => `${t.charAt(0).toLocaleUpperCase('tr') + t.slice(1)} hakkında hangi kitaplarda ne not almıştım?`),
    'En çok hangi konuların altını çizmişim?',
    'Kendi notlarımda tekrar eden düşünceler neler?',
  ].slice(0, 4);
  draw();

  if (!total) return el('section', {}, pageHeader('Arşivine sor'), emptyState('Önce birkaç alıntı veya not ekle; sorularını onlardan yanıtlayayım.'));
  return el('section', { class: 'ask' },
    pageHeader('Arşivine sor', { back: '#/alintilar', subtitle: 'Cevaplar yalnızca senin alıntı ve notlarından gelir; her paragrafın kaynağı gösterilir.' }),
    !canAI ? el('div', { class: 'callout' }, icon('key'), el('div', {}, el('strong', {}, 'İnternet ve Gemini anahtarı gerekli'), el('p', {}, 'Ayarlar’dan anahtarını girdikten sonra arşivine soru sorabilirsin.'), button('Ayarlara git', { small: true, href: '#/ayarlar' }))) : null,
    conv.turns.length ? null : (examplesBox = el('div', { class: 'ask-examples' }, el('span', { class: 'field-label' }, 'Örnek sorular'),
      el('div', { class: 'chips seg' }, examples.map(x => el('button', { type: 'button', class: 'chip-btn chip-sm', disabled: !canAI, onclick: () => ask(x) }, x))))),
    list,
    el('div', { class: 'ask-input sticky-actions' }, input, send),
    el('div', { class: 'row-actions end' },
      conv.turns.length ? button('Sohbeti temizle', { small: true, variant: 'ghost', icon: 'trash', onClick: () => { conv.turns = []; draw(); location.hash = '#/sor'; } }) : null),
    el('p', { class: 'muted small' }, `Her soru 1 Gemini isteği harcar. ${total} kaydından soruyla ilgili olanlar gönderilir; kitaplar hakkında dışarıdan bilgi eklenmez.`));
}
