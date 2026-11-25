// Obsidian tarzı bağlantılar: metin içinde [[Kitap adı]] ve #etiket, alıntılar/notlar arası "ilgili" bağlantıları,
// geri bağlantılar. Bütün görüntüleme textContent ile yapılır (HTML olarak yorumlanmaz).
import { el, normalizeText, includesTr } from './utils.js';
import { icon } from './icons.js';
import { state, bookById } from './store.js';

const WIKI = /\[\[([^\[\]\n]{1,200})\]\]/g;
const TAG = /(^|[\s(])#([\p{L}\p{N}_-]{2,40})/gu;

/** [[Hedef|görünen ad]] → { target, label } */
function parseWiki(inner) {
  const [target, label] = inner.split('|');
  return { target: target.trim(), label: (label || target).trim() };
}

export function findBookByTitle(title) {
  const key = normalizeText(title);
  return state.books.find(b => normalizeText(b.title) === key) || null;
}

/** Metindeki [[...]] bağlantılarının işaret ettiği kitap kimlikleri */
export function bookRefs(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(WIKI)) {
    const b = findBookByTitle(parseWiki(m[1]).target);
    if (b) out.add(b.id);
  }
  return [...out];
}

/** Metindeki #etiketler (küçük harfe indirilmemiş, yazıldığı gibi) */
export function inlineTags(text) {
  return [...String(text || '').matchAll(TAG)].map(m => m[2]);
}

/** Düz metni bağlantılı DOM parçasına çevirir. */
export function renderRich(text) {
  const frag = document.createDocumentFragment();
  const src = String(text || '');
  const tokens = [];
  for (const m of src.matchAll(WIKI)) tokens.push({ i: m.index, len: m[0].length, kind: 'wiki', v: m[1] });
  for (const m of src.matchAll(TAG)) tokens.push({ i: m.index + m[1].length, len: m[0].length - m[1].length, kind: 'tag', v: m[2] });
  tokens.sort((a, b) => a.i - b.i);
  let pos = 0;
  for (const t of tokens) {
    if (t.i < pos) continue; // iç içe geçen eşleşmeleri atla
    if (t.i > pos) frag.append(document.createTextNode(src.slice(pos, t.i)));
    if (t.kind === 'wiki') {
      const { target, label } = parseWiki(t.v);
      const b = findBookByTitle(target);
      frag.append(b
        ? el('a', { class: 'wikilink', href: `#/kitap/${encodeURIComponent(b.id)}`, title: `${b.title} · ${b.author}` }, label)
        : el('span', { class: 'wikilink missing', title: 'Bu adla bir kitap yok' }, label));
    } else {
      frag.append(el('a', { class: 'taglink', href: `#/alintilar?etiket=${encodeURIComponent(t.v)}` }, '#' + t.v));
    }
    pos = t.i + t.len;
  }
  if (pos < src.length) frag.append(document.createTextNode(src.slice(pos)));
  return frag;
}

// ---- Kayıtlar arası bağlantılar ----
export function findItem(id) {
  const h = state.highlights.find(x => x.id === id);
  if (h) return { type: 'highlight', item: h };
  const n = state.notes.find(x => x.id === id);
  if (n) return { type: 'note', item: n };
  return null;
}

/** İki yönlü ilgili kayıtlar: kendi links listesi + kendisine bağlanan kayıtlar */
export function relatedOf(id) {
  const self = findItem(id)?.item;
  const ids = new Set(self?.links || []);
  for (const x of [...state.highlights, ...state.notes]) if (x.id !== id && (x.links || []).includes(id)) ids.add(x.id);
  return [...ids].map(findItem).filter(Boolean);
}

/** Bir kitaba [[ad]] ile bağlantı veren alıntı yorumları ve notlar */
export function backlinksToBook(bookId) {
  const out = [];
  for (const h of state.highlights) if (bookRefs(`${h.comment} ${h.text}`).includes(bookId) && h.bookId !== bookId) out.push({ type: 'highlight', item: h });
  for (const n of state.notes) if (bookRefs(n.text).includes(bookId) && n.bookId !== bookId) out.push({ type: 'note', item: n });
  return out;
}

export function itemLabel({ type, item }) {
  const b = bookById(item.bookId);
  const text = type === 'highlight' ? item.text : item.text;
  const short = text.length > 90 ? text.slice(0, 90).trim() + '…' : text;
  return { book: b ? b.title : '', text: short, kind: type === 'highlight' ? (item.page ? `Alıntı · s. ${item.page}` : 'Alıntı') : 'Not' };
}

export function linkChip(ref, { onRemove } = {}) {
  const l = itemLabel(ref);
  return el('div', { class: 'link-chip' },
    el('a', { href: `#/kitap/${encodeURIComponent(ref.item.bookId)}`, class: 'link-chip-body' },
      el('span', { class: 'link-kind' }, `${l.kind} · ${l.book}`), el('span', {}, l.text)),
    onRemove ? el('button', { type: 'button', class: 'icon-btn icon-btn-ghost', 'aria-label': 'Bağlantıyı kaldır', onclick: onRemove }, icon('x', { size: 16 })) : null);
}

/**
 * Bağlantı seçici. mode: 'book' ([[Kitap]] eklemek için) veya 'item' (ilgili alıntı/not).
 * Seçilen { type, id, title } döner; vazgeçilirse null.
 */
export function openLinkPicker({ mode = 'item', exclude = [] } = {}) {
  return new Promise(resolve => {
    let result = null;
    const q = el('input', { type: 'search', placeholder: mode === 'book' ? 'Kitap ara…' : 'Alıntı, not veya kitap ara…', 'aria-label': 'Ara' });
    const list = el('div', { class: 'choice-list picker-list' });
    const draw = () => {
      const term = q.value;
      let rows = [];
      if (mode === 'book') {
        rows = state.books.filter(b => includesTr(`${b.title} ${b.author}`, term)).slice(0, 40)
          .map(b => ({ type: 'book', id: b.id, title: b.title, sub: b.author }));
      } else {
        const hs = state.highlights.filter(h => !exclude.includes(h.id) && includesTr(`${h.text} ${h.comment} ${bookById(h.bookId)?.title}`, term))
          .map(h => ({ type: 'highlight', id: h.id, title: (h.text.length > 120 ? h.text.slice(0, 120) + '…' : h.text), sub: `Alıntı · ${bookById(h.bookId)?.title || ''}${h.page ? ' · s. ' + h.page : ''}` }));
        const ns = state.notes.filter(n => !exclude.includes(n.id) && includesTr(`${n.text} ${bookById(n.bookId)?.title}`, term))
          .map(n => ({ type: 'note', id: n.id, title: (n.text.length > 120 ? n.text.slice(0, 120) + '…' : n.text), sub: `Not · ${bookById(n.bookId)?.title || ''}` }));
        rows = [...hs, ...ns].slice(0, 40);
      }
      list.replaceChildren(...(rows.length ? rows.map(r => el('button', { type: 'button', class: 'choice', onclick: () => { result = r; dlg.close(); } },
        el('strong', {}, r.title), el('span', {}, r.sub))) : [el('p', { class: 'muted' }, 'Sonuç yok.')]));
    };
    q.oninput = draw;
    const dlg = el('dialog', { class: 'dialog' },
      el('h2', {}, mode === 'book' ? 'Kitaba bağlantı ekle' : 'İlgili alıntı veya not bağla'),
      el('p', { class: 'muted small' }, mode === 'book' ? 'Metne [[Kitap adı]] eklenir; tıklayınca o kitaba gider.' : 'Bağlantı iki yönlü görünür: iki kayıtta da “İlgili” olarak listelenir.'),
      q, list,
      el('div', { class: 'row-actions end' }, el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => dlg.close() }, 'Vazgeç')));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    draw();
    q.focus();
  });
}

export function insertAtCursor(ta, str) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
  ta.value = ta.value.slice(0, s) + str + ta.value.slice(e);
  const p = s + str.length;
  ta.focus();
  ta.setSelectionRange(p, p);
  ta.dispatchEvent(new Event('input'));
}

/** "Kitaba bağlantı" düğmesi: imlecin olduğu yere [[Kitap adı]] ekler. */
export function wikiButton(textarea) {
  return el('button', { type: 'button', class: 'btn btn-ghost btn-small', title: 'Metne başka bir kitaba bağlantı ekle', onclick: async () => {
    const r = await openLinkPicker({ mode: 'book' });
    if (r) insertAtCursor(textarea, `[[${r.title}]]`);
  } }, icon('books', { size: 16 }), el('span', {}, '[[Kitap]] bağlantısı'));
}

/** İlgili alıntı/not bağlantılarını düzenleme bileşeni. { root, get() } */
export function relatedEditor(selfId) {
  let ids = selfId ? relatedOf(selfId).map(r => r.item.id) : [];
  const box = el('div', { class: 'link-list' });
  const draw = () => box.replaceChildren(...ids.map(findItem).filter(Boolean).map(ref =>
    linkChip(ref, { onRemove: () => { ids = ids.filter(x => x !== ref.item.id); draw(); } })));
  const add = el('button', { type: 'button', class: 'btn btn-secondary btn-small', onclick: async () => {
    const r = await openLinkPicker({ mode: 'item', exclude: [selfId, ...ids].filter(Boolean) });
    if (r && !ids.includes(r.id)) { ids.push(r.id); draw(); }
  } }, icon('merge', { size: 16 }), el('span', {}, 'İlgili alıntı/not bağla'));
  draw();
  return { root: el('div', { class: 'related-editor' }, box, add), get: () => [...ids] };
}

/**
 * Kaydedilen kaydın bağlantılarını tutarlı hâle getirir: bağlantılar kaydın kendisinde saklanır;
 * kullanıcı kaldırdıysa karşı taraftaki eski bağlantı da silinir.
 * saveFns: { highlight: list => Promise, note: item => Promise }
 */
export async function syncBacklinks(selfId, finalIds, saveFns) {
  for (const x of [...state.highlights, ...state.notes]) {
    if (x.id === selfId || !(x.links || []).includes(selfId) || finalIds.includes(x.id)) continue;
    const next = { ...x, links: x.links.filter(id => id !== selfId) };
    if (state.highlights.includes(x)) await saveFns.highlight([next]); else await saveFns.note(next);
  }
}
