// Alıntı düzenleme, Alıntılarım ekranı ve yapay zekâ sonuçlarının onay ekranı.
import { el, includesTr, comparePage, compareTr, toast, confirmDialog, debounce, formatDate } from './utils.js';
import { icon } from './icons.js';
import { MARK_TYPES } from './database.js';
import { state, bookById, findDuplicate, saveHighlights } from './store.js';
import { refresh } from './router.js';
import { button, pageHeader, emptyState, highlightCard, field, select } from './ui.js';
import { tagInput, hasTag, suggestForOne } from './tags.js';
import { hasApiKey } from './gemini.js';
import { wikiButton, relatedEditor, syncBacklinks } from './links.js';
import { saveNote } from './store.js';


// ---------- Tek alıntı düzenleyici (manuel ekleme dahil; çevrimdışı çalışır) ----------
export function openHighlightEditor(h) {
  return new Promise(resolve => {
    const isNew = !h.id;
    const book = bookById(h.bookId);
    const text = el('textarea', { rows: 6, maxlength: 20000, placeholder: 'Kitaptaki metni olduğu gibi yaz…', 'aria-required': 'true' });
    text.value = h.text || '';
    const page = el('input', { maxlength: 30, inputmode: 'numeric', value: h.page || '', placeholder: 'örn. 42' });
    const mark = select(MARK_TYPES, h.markType || (isNew ? 'manuel' : 'diger'));
    const comment = el('textarea', { rows: 3, maxlength: 20000, placeholder: 'Bu alıntı sana ne düşündürdü?' });
    comment.value = h.comment || '';
    const tags = tagInput(h.tags || []);
    const related = relatedEditor(h.id);
    const suggOut = el('div', { class: 'chips' });
    const suggBtn = button('Etiket öner', { icon: 'scan', small: true, variant: 'ghost', disabled: !hasApiKey() || navigator.onLine === false,
      title: hasApiKey() ? 'Yapay zekâ mevcut etiketlerine bakarak öneri yapar' : 'Ayarlar’dan Gemini anahtarı gir', onClick: async () => {
        if (!text.value.trim()) { toast('Önce alıntı metnini yaz.'); return; }
        suggBtn.disabled = true; suggOut.replaceChildren(el('span', { class: 'spinner spinner-sm', 'aria-hidden': 'true' }), el('span', { class: 'muted small' }, ' Düşünülüyor…'));
        try {
          const list = (await suggestForOne({ text: text.value, comment: comment.value, bookTitle: book?.title })).filter(t => !tags.has(t));
          suggOut.replaceChildren(...(list.length ? list.map(t => el('button', { type: 'button', class: 'chip-btn chip-sm', onclick: e => { tags.add(t); e.currentTarget.remove(); } }, '+ #' + t))
            : [el('span', { class: 'muted small' }, 'Yeni öneri yok.')]));
        } catch (e) { suggOut.replaceChildren(el('span', { class: 'form-error' }, e.full || e.message)); }
        finally { suggBtn.disabled = false; }
      } });
    const suggestRow = el('div', { class: 'suggest-row' }, suggBtn, suggOut);
    const fav = el('input', { type: 'checkbox', checked: !!h.favorite });
    const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
    let result = null;

    const save = async () => {
      const t = text.value.trim();
      if (!t) { error.textContent = 'Alıntı metni boş olamaz.'; error.hidden = false; text.focus(); return; }
      const dup = findDuplicate(h.bookId, t, h.id);
      if (dup && !await confirmDialog({
        title: 'Bu alıntı zaten kayıtlı',
        message: `Aynı metin bu kitapta ${dup.page ? dup.page + '. sayfada' : 'kayıtlı'} (${formatDate(dup.createdAt)}). Yine de ayrı bir kayıt olarak eklensin mi?`,
        confirmLabel: 'Yine de kaydet',
      })) return;
      try {
        [result] = await saveHighlights([{
          ...h, text: t, page: page.value.trim(), markType: mark.value,
          comment: comment.value, tags: tags.get(), favorite: fav.checked, links: related.get(),
          source: h.source || 'manuel',
        }]);
        await syncBacklinks(result.id, related.get(), { highlight: saveHighlights, note: saveNote });
        dlg.close();
        toast(isNew ? 'Alıntı kaydedildi.' : 'Alıntı güncellendi.');
      } catch (e) { error.textContent = 'Kaydedilemedi: ' + e.message; error.hidden = false; }
    };

    const dlg = el('dialog', { class: 'dialog dialog-wide' },
      el('h2', {}, isNew ? 'Alıntı ekle' : 'Alıntıyı düzenle'),
      book ? el('p', { class: 'muted' }, `${book.title} · ${book.author}`) : null,
      field('Kitaptan alıntı *', text),
      el('div', { class: 'grid-2' }, field('Sayfa', page), field('İşaret türü', mark)),
      el('div', { class: 'comment-field' }, field('Kişisel not (kendi yorumun)', comment, 'Başka bir kitaba [[Kitap adı]], konuya #etiket ile bağlantı verebilirsin.'),
        el('div', { class: 'row-actions' }, wikiButton(comment))),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Etiketler'), tags.root, suggestRow),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'İlgili alıntılar ve notlar'), related.root),
      el('label', { class: 'check' }, fav, el('span', {}, 'Favorilere ekle')),
      error,
      el('div', { class: 'row-actions end sticky-actions' },
        button('Vazgeç', { onClick: () => dlg.close() }),
        button('Kaydet', { variant: 'primary', icon: 'check', onClick: save })));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    text.focus();
  });
}

// ---------- Alıntılarım ----------
const hlState = { q: '', book: '', fav: false, sort: 'new', limit: 60, tag: '' };

export function highlightsView({ params } = {}) {
  if (params?.has('etiket')) { hlState.tag = params.get('etiket') || ''; hlState.limit = 60; }
  const list = el('div', { class: 'hl-list' });
  const countEl = el('p', { class: 'muted small' });
  const draw = () => {
    let items = state.highlights.filter(h => {
      if (hlState.book && h.bookId !== hlState.book) return false;
      if (hlState.fav && !h.favorite) return false;
      if (hlState.tag && !hasTag(h, hlState.tag, 'comment')) return false;
      if (!hlState.q) return true;
      const b = bookById(h.bookId);
      return includesTr(`${h.text} ${h.comment} ${(h.tags || []).join(' ')} ${h.page} ${b?.title} ${b?.author}`, hlState.q);
    });
    const s = {
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      old: (a, b) => a.createdAt.localeCompare(b.createdAt),
      book: (a, b) => compareTr(bookById(a.bookId)?.title, bookById(b.bookId)?.title) || comparePage(a.page, b.page),
    }[hlState.sort];
    items.sort(s);
    countEl.textContent = `${items.length} alıntı`;
    const shown = items.slice(0, hlState.limit);
    const edit = async h => { if (await openHighlightEditor(h)) refresh(); };
    list.replaceChildren(...(shown.length ? shown.map(h => highlightCard(h, { showBook: true, onEdit: edit }))
      : [emptyState(state.highlights.length ? 'Aramaya uygun alıntı bulunamadı.' : 'Henüz alıntı yok. Bir kitap sayfası tarayarak başla.',
        state.highlights.length ? null : button('Sayfa tara', { icon: 'camera', variant: 'primary', href: '#/tara' }))]));
    if (items.length > shown.length) list.append(button(`Daha fazla göster (${items.length - shown.length})`, { onClick: () => { hlState.limit += 60; draw(); } }));
  };
  const search = el('input', { type: 'search', placeholder: 'Alıntı, not, etiket, sayfa ara…', value: hlState.q, 'aria-label': 'Alıntılarda ara' });
  search.oninput = debounce(() => { hlState.q = search.value; hlState.limit = 60; draw(); }, 150);
  const bookSel = select([{ value: '', label: 'Tüm kitaplar' }, ...[...state.books].sort((a, b) => compareTr(a.title, b.title)).map(b => ({ value: b.id, label: b.title }))], hlState.book, { 'aria-label': 'Kitap filtresi' });
  bookSel.onchange = () => { hlState.book = bookSel.value; draw(); };
  const sortSel = select([{ value: 'new', label: 'Yeniden eskiye' }, { value: 'old', label: 'Eskiden yeniye' }, { value: 'book', label: 'Kitap ve sayfa' }], hlState.sort, { 'aria-label': 'Sıralama' });
  sortSel.onchange = () => { hlState.sort = sortSel.value; draw(); };
  const favBtn = el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(hlState.fav) }, icon('star', { size: 16 }), 'Favoriler');
  favBtn.onclick = () => { hlState.fav = !hlState.fav; favBtn.setAttribute('aria-pressed', String(hlState.fav)); draw(); };
  draw();
  return el('section', {},
    pageHeader('Alıntılarım', { actions: [button('Arşivine sor', { icon: 'chat', small: true, variant: 'primary', href: '#/sor' }), button('Etiketler', { icon: 'note', small: true, href: '#/etiketler' }), button('Harita', { icon: 'graph', small: true, href: '#/harita' })] }),
    hlState.tag ? el('div', { class: 'active-filter' }, el('span', {}, 'Etiket: ', el('strong', {}, '#' + hlState.tag)),
      button('Filtreyi kaldır', { small: true, variant: 'ghost', icon: 'x', onClick: () => { hlState.tag = ''; location.hash = '#/alintilar'; } })) : null,
    el('div', { class: 'toolbar' }, el('div', { class: 'search' }, icon('search', { size: 18 }), search)),
    el('div', { class: 'toolbar' }, bookSel, sortSel, favBtn),
    countEl, list);
}
