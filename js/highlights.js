// Alıntı düzenleme, Alıntılarım ekranı ve yapay zekâ sonuçlarının onay ekranı.
import { el, uid, includesTr, comparePage, compareTr, toast, confirmDialog, choiceDialog, debounce, formatDate } from './utils.js';
import { icon } from './icons.js';
import { MARK_TYPES } from './database.js';
import { state, bookById, findDuplicate, saveHighlights, saveDraft, deleteDraft } from './store.js';
import { navigate, refresh } from './router.js';
import { button, iconButton, pageHeader, emptyState, highlightCard, field, select, cover } from './ui.js';

const parseTags = s => [...new Set(String(s || '').split(/[,#]/).map(t => t.trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 20);

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
    const tags = el('input', { value: (h.tags || []).join(', '), placeholder: 'eğitim, ahlak, tarih', list: 'tag-list' });
    const allTags = [...new Set(state.highlights.flatMap(x => x.tags || []))];
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
          comment: comment.value, tags: parseTags(tags.value), favorite: fav.checked,
          source: h.source || 'manuel',
        }]);
        dlg.close();
        toast(isNew ? 'Alıntı kaydedildi.' : 'Alıntı güncellendi.');
      } catch (e) { error.textContent = 'Kaydedilemedi: ' + e.message; error.hidden = false; }
    };

    const dlg = el('dialog', { class: 'dialog dialog-wide' },
      el('h2', {}, isNew ? 'Alıntı ekle' : 'Alıntıyı düzenle'),
      book ? el('p', { class: 'muted' }, `${book.title} · ${book.author}`) : null,
      field('Kitaptan alıntı *', text),
      el('div', { class: 'grid-2' }, field('Sayfa', page), field('İşaret türü', mark)),
      el('div', { class: 'comment-field' }, field('Kişisel not (kendi yorumun)', comment)),
      field('Etiketler', tags, 'Virgülle ayır.'), el('datalist', { id: 'tag-list' }, allTags.map(t => el('option', { value: t }))),
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
const hlState = { q: '', book: '', fav: false, sort: 'new', limit: 60 };

export function highlightsView() {
  const list = el('div', { class: 'hl-list' });
  const countEl = el('p', { class: 'muted small' });
  const draw = () => {
    let items = state.highlights.filter(h => {
      if (hlState.book && h.bookId !== hlState.book) return false;
      if (hlState.fav && !h.favorite) return false;
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
    pageHeader('Alıntılarım'),
    el('div', { class: 'toolbar' }, el('div', { class: 'search' }, icon('search', { size: 18 }), search)),
    el('div', { class: 'toolbar' }, bookSel, sortSel, favBtn),
    countEl, list);
}

// ---------- Onay ekranı ----------
export function reviewView({ parts }) {
  const draft = state.drafts.find(d => d.id === parts[1]);
  if (!draft) return el('section', {}, pageHeader('Taslak bulunamadı', { back: '#/' }), emptyState('Bu tarama taslağı kaydedilmiş veya silinmiş olabilir.'));
  const book = bookById(draft.bookId);
  if (!book) return el('section', {}, pageHeader('Kitap bulunamadı', { back: '#/' }), emptyState('Taslağın ait olduğu kitap silinmiş.'));

  const items = draft.items.map(it => ({ key: uid(), selected: true, ...it }));
  let closed = false; // kaydedildi/silindi: bekleyen otomatik kayıt taslağı geri yazmasın
  const persist = debounce(() => !closed && state.drafts.some(d => d.id === draft.id) && saveDraft({ ...draft, page: pageInput.value.trim(), items: items.map(({ key, ...rest }) => rest) }).catch(() => {}), 400);

  const pageInput = el('input', { maxlength: 30, inputmode: 'numeric', value: draft.page || '', placeholder: 'Bulunamadı — elle gir' });
  pageInput.oninput = persist;
  const listEl = el('div', { class: 'review-list' });
  const saveBtn = button('Seçilenleri kaydet', { variant: 'primary', icon: 'check' });
  const mergeBtn = button('Seçilenleri birleştir', { icon: 'merge', small: true });
  const toggleAllBtn = button('', { small: true, variant: 'ghost' });

  const updateCounts = () => {
    const sel = items.filter(i => i.selected && i.text.trim()).length;
    saveBtn.querySelector('span').textContent = `Seçilenleri kaydet (${sel})`;
    saveBtn.disabled = sel === 0;
    mergeBtn.disabled = items.filter(i => i.selected).length < 2;
    const all = items.length && items.every(i => i.selected);
    toggleAllBtn.replaceChildren(el('span', {}, all ? 'Seçimi kaldır' : 'Tümünü seç'));
    toggleAllBtn.disabled = !items.length;
  };

  const drawItems = () => {
    listEl.replaceChildren();
    if (!items.length) listEl.append(emptyState('Bu sayfada işaretli metin bulunamadı. Gerekirse elle ekleyebilirsin.'));
    items.forEach((it, i) => {
      const ta = el('textarea', { rows: Math.min(10, Math.max(3, Math.ceil(it.text.length / 60))), 'aria-label': `Alıntı ${i + 1} metni` });
      ta.value = it.text;
      const dupNote = el('p', { class: 'dup-note', hidden: true });
      const checkDup = () => {
        const d = it.text.trim() && findDuplicate(book.id, it.text);
        dupNote.hidden = !d;
        if (d) dupNote.replaceChildren(icon('alert', { size: 16 }), el('span', {}, `Bu alıntı zaten kayıtlı${d.page ? ` (sayfa ${d.page})` : ''}.`));
      };
      ta.oninput = () => { it.text = ta.value; checkDup(); updateCounts(); persist(); };
      checkDup();
      const cb = el('input', { type: 'checkbox', checked: it.selected, 'aria-label': `Alıntı ${i + 1} kaydedilsin` });
      cb.onchange = () => { it.selected = cb.checked; card.classList.toggle('unselected', !cb.checked); updateCounts(); };
      const mark = select(MARK_TYPES, it.markType || 'diger', { 'aria-label': 'İşaret türü', class: 'select-small' });
      mark.onchange = () => { it.markType = mark.value; persist(); };
      const card = el('div', { class: `review-item${it.needsReview ? ' needs-review' : ''}${it.selected ? '' : ' unselected'}` },
        el('div', { class: 'review-item-head' },
          el('label', { class: 'check' }, cb, el('span', {}, `Alıntı ${i + 1}`)),
          it.needsReview ? el('span', { class: 'badge-warn' }, icon('alert', { size: 15 }), 'Kontrol gerekli') : null,
          mark),
        ta, dupNote,
        el('div', { class: 'row-actions' },
          it.needsReview ? button('Kontrol ettim', { small: true, icon: 'check', variant: 'ghost', onClick: () => { it.needsReview = false; persist(); drawItems(); } }) : null,
          button('Ayır', { small: true, icon: 'split', variant: 'ghost', title: 'İmlecin bulunduğu yerden ikiye böl', onClick: () => {
            const pos = ta.selectionStart;
            const a = it.text.slice(0, pos).trim(), b = it.text.slice(pos).trim();
            if (!a || !b) { toast('Bölmek istediğin yere imleci yerleştirip tekrar dene.'); ta.focus(); return; }
            items.splice(i, 1, { ...it, key: uid(), text: a }, { ...it, key: uid(), text: b });
            persist(); drawItems();
          } }),
          button('Sil', { small: true, icon: 'trash', variant: 'ghost-danger', onClick: () => { items.splice(i, 1); persist(); drawItems(); } })));
      listEl.append(card);
    });
    updateCounts();
  };

  mergeBtn.onclick = () => {
    const sel = items.filter(i => i.selected);
    if (sel.length < 2) return;
    const merged = { ...sel[0], key: uid(), text: sel.map(s => s.text.trim()).filter(Boolean).join(' '), needsReview: sel.some(s => s.needsReview) };
    const first = items.indexOf(sel[0]);
    for (const s of sel) items.splice(items.indexOf(s), 1);
    items.splice(first, 0, merged);
    persist(); drawItems();
  };
  toggleAllBtn.onclick = () => { const all = items.every(i => i.selected); items.forEach(i => { i.selected = !all; }); drawItems(); };

  saveBtn.onclick = async () => {
    const page = pageInput.value.trim();
    let chosen = items.filter(i => i.selected && i.text.trim());
    if (!chosen.length) return;
    const seen = new Set();
    const dups = chosen.filter(i => {
      const k = i.text.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
      const d = findDuplicate(book.id, i.text) || seen.has(k);
      seen.add(k);
      return d;
    });
    if (dups.length) {
      const choice = await choiceDialog({
        title: 'Mükerrer alıntı',
        message: `${dups.length} alıntı bu kitapta zaten kayıtlı veya listede iki kez geçiyor.`,
        options: [
          { value: 'skip', label: 'Tekrarları atla', description: `${chosen.length - dups.length} yeni alıntı kaydedilir` },
          { value: 'all', label: 'Hepsini kaydet', description: 'Tekrarlar ayrı kayıt olarak eklenir' },
        ],
      });
      if (!choice) return;
      if (choice === 'skip') chosen = chosen.filter(i => !dups.includes(i));
    }
    const unreadable = chosen.filter(i => /\[okunamadı\]/i.test(i.text)).length;
    if (unreadable && !await confirmDialog({ title: 'Okunamayan kelimeler var', message: `${unreadable} alıntıda “[okunamadı]” ifadesi duruyor. Düzeltmeden kaydetmek istiyor musun?`, confirmLabel: 'Yine de kaydet' })) return;
    try {
      saveBtn.disabled = true;
      closed = true;
      const saved = await saveHighlights(chosen.map(i => ({ bookId: book.id, text: i.text, page, markType: i.markType, source: 'tarama' })));
      await deleteDraft(draft.id); // geçici fotoğraf da taslakla birlikte silinir
      toast(saved.length ? `${saved.length} alıntı kaydedildi.` : 'Yeni alıntı kaydedilmedi.');
      navigate(`kitap/${encodeURIComponent(book.id)}`, { replace: true });
    } catch (e) {
      saveBtn.disabled = false;
      closed = false;
      toast('Kaydedilemedi: ' + e.message, { type: 'error' });
    }
  };

  const discard = async () => {
    if (!await confirmDialog({ title: 'Taslak silinsin mi?', message: 'Bu taramadan çıkarılan alıntılar ve geçici fotoğraf silinecek.', confirmLabel: 'Taslağı sil', danger: true })) return;
    closed = true;
    await deleteDraft(draft.id);
    toast('Taslak silindi.');
    navigate(`kitap/${encodeURIComponent(book.id)}`, { replace: true });
  };

  drawItems();
  return el('section', { class: 'review' },
    pageHeader('Alıntıları kontrol et', { back: `#/kitap/${encodeURIComponent(book.id)}`, subtitle: `${book.title} · ${book.author}` }),
    el('p', { class: 'callout callout-soft' }, icon('alert'), el('span', {}, 'Metinleri fotoğrafla karşılaştır. Yapay zekâ işaretleri kaçırabilir veya kelimeleri yanlış okuyabilir. Onaylamadığın hiçbir şey arşive eklenmez.')),
    el('div', { class: 'review-layout' },
      draft.image ? el('details', { class: 'review-photo', open: true },
        el('summary', {}, 'Orijinal fotoğraf'),
        el('img', { src: draft.image, alt: 'Taranan kitap sayfası', loading: 'lazy' })) : el('div', { class: 'review-photo muted' }, 'Fotoğraf saklanmadı.'),
      el('div', {},
        field('Sayfa numarası', pageInput, draft.page ? 'Fotoğraftan algılandı; gerekirse düzelt.' : 'Fotoğrafta sayfa numarası bulunamadı.'),
        draft.uncertain?.length ? el('div', { class: 'callout' }, icon('alert'), el('div', {}, el('strong', {}, 'Modelin emin olmadığı bölgeler'), el('ul', {}, draft.uncertain.map(u => el('li', {}, u))))) : null,
        el('div', { class: 'row-actions' },
          button('Yeni alıntı', { icon: 'plus', small: true, onClick: () => { items.push({ key: uid(), text: '', markType: 'manuel', needsReview: false, selected: true }); drawItems(); listEl.lastElementChild?.querySelector('textarea')?.focus(); } }),
          mergeBtn, toggleAllBtn),
        listEl)),
    el('div', { class: 'sticky-footer' },
      button('Taslağı sil', { variant: 'ghost-danger', icon: 'trash', onClick: discard }),
      saveBtn));
}

/** Ana sayfa / kitap ekranında kullanılacak bekleyen taslak kartı */
export function draftsCallout() {
  if (!state.drafts.length) return null;
  return el('div', { class: 'callout' }, icon('alert'),
    el('div', {}, el('strong', {}, `${state.drafts.length} tarama onayını bekliyor`),
      el('p', { class: 'muted small' }, 'Kontrol edip kaydetmediğin alıntılar arşive eklenmez.'),
      el('div', { class: 'row-actions' }, state.drafts.map(d => {
        const b = bookById(d.bookId);
        return button(`${b?.title || 'Kitap'} · ${d.page ? 's. ' + d.page : 'sayfa ?'} · ${d.items.length}`, { small: true, href: `#/onay/${encodeURIComponent(d.id)}` });
      }))));
}

export { cover, iconButton };
