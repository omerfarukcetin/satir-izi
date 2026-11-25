// Yapay zekâ sonuçlarının onay ekranları (tek sayfa ve toplu) için ortak bileşenler.
import { el, uid, toast, confirmDialog, choiceDialog, debounce, normalizeText } from './utils.js';
import { icon } from './icons.js';
import { MARK_TYPES } from './database.js';
import { state, bookById, findDuplicate, saveHighlights, saveDraft, deleteDraft } from './store.js';
import { navigate } from './router.js';
import { button, pageHeader, emptyState, field, select } from './ui.js';

/**
 * Bir sayfanın alıntı grubunu düzenleyen bileşen.
 * opts: { book, title, imageSrc, page, pageHint, uncertain, items, onChange, compact }
 * Döner: { root, getPage(), getItems(), selected() }
 */
export function createReviewGroup({ book, title, imageSrc, page = '', pageHint = '', uncertain = [], items: initial = [], onChange = () => {}, compact = false }) {
  const items = initial.map(it => ({ key: uid(), selected: true, ...it }));
  const pageInput = el('input', { maxlength: 30, inputmode: 'numeric', value: page || '', placeholder: 'Bulunamadı — elle gir' });
  pageInput.oninput = () => onChange();
  const listEl = el('div', { class: 'review-list' });
  const mergeBtn = button('Seçilenleri birleştir', { icon: 'merge', small: true });
  const toggleAllBtn = button('Tümünü seç', { small: true, variant: 'ghost' });

  const updateTools = () => {
    mergeBtn.disabled = items.filter(i => i.selected).length < 2;
    const all = items.length && items.every(i => i.selected);
    toggleAllBtn.querySelector('span').textContent = all ? 'Seçimi kaldır' : 'Tümünü seç';
    toggleAllBtn.disabled = !items.length;
  };
  const changed = () => { updateTools(); onChange(); };

  const drawItems = () => {
    listEl.replaceChildren();
    if (!items.length) listEl.append(el('p', { class: 'muted small' }, 'Bu sayfada işaretli metin bulunamadı. Gerekirse elle ekleyebilirsin.'));
    items.forEach((it, i) => {
      const ta = el('textarea', { rows: Math.min(10, Math.max(3, Math.ceil(it.text.length / 60))), 'aria-label': `Alıntı ${i + 1} metni` });
      ta.value = it.text;
      const dupNote = el('p', { class: 'dup-note', hidden: true });
      const checkDup = () => {
        const d = it.text.trim() && findDuplicate(book.id, it.text);
        dupNote.hidden = !d;
        if (d) dupNote.replaceChildren(icon('alert', { size: 16 }), el('span', {}, `Bu alıntı zaten kayıtlı${d.page ? ` (sayfa ${d.page})` : ''}.`));
      };
      ta.oninput = () => { it.text = ta.value; checkDup(); changed(); };
      checkDup();
      const cb = el('input', { type: 'checkbox', checked: it.selected, 'aria-label': `Alıntı ${i + 1} kaydedilsin` });
      const mark = select(MARK_TYPES, it.markType || 'diger', { 'aria-label': 'İşaret türü', class: 'select-small' });
      mark.onchange = () => { it.markType = mark.value; changed(); };
      const card = el('div', { class: `review-item${it.needsReview ? ' needs-review' : ''}${it.selected ? '' : ' unselected'}` },
        el('div', { class: 'review-item-head' },
          el('label', { class: 'check' }, cb, el('span', {}, `Alıntı ${i + 1}`)),
          it.needsReview ? el('span', { class: 'badge-warn' }, icon('alert', { size: 15 }), 'Kontrol gerekli') : null,
          mark),
        ta, dupNote,
        el('div', { class: 'row-actions' },
          it.needsReview ? button('Kontrol ettim', { small: true, icon: 'check', variant: 'ghost', onClick: () => { it.needsReview = false; drawItems(); changed(); } }) : null,
          button('Ayır', { small: true, icon: 'split', variant: 'ghost', title: 'İmlecin bulunduğu yerden ikiye böl', onClick: () => {
            const pos = ta.selectionStart;
            const a = it.text.slice(0, pos).trim(), b = it.text.slice(pos).trim();
            if (!a || !b) { toast('Bölmek istediğin yere imleci yerleştirip tekrar dene.'); ta.focus(); return; }
            items.splice(i, 1, { ...it, key: uid(), text: a }, { ...it, key: uid(), text: b });
            drawItems(); changed();
          } }),
          button('Sil', { small: true, icon: 'trash', variant: 'ghost-danger', onClick: () => { items.splice(i, 1); drawItems(); changed(); } })));
      cb.onchange = () => { it.selected = cb.checked; card.classList.toggle('unselected', !cb.checked); changed(); };
      listEl.append(card);
    });
    updateTools();
  };

  mergeBtn.onclick = () => {
    const sel = items.filter(i => i.selected);
    if (sel.length < 2) return;
    const merged = { ...sel[0], key: uid(), text: sel.map(s => s.text.trim()).filter(Boolean).join(' '), needsReview: sel.some(s => s.needsReview) };
    const first = items.indexOf(sel[0]);
    for (const s of sel) items.splice(items.indexOf(s), 1);
    items.splice(first, 0, merged);
    drawItems(); changed();
  };
  toggleAllBtn.onclick = () => { const all = items.every(i => i.selected); items.forEach(i => { i.selected = !all; }); drawItems(); changed(); };
  const addBtn = button('Yeni alıntı', { icon: 'plus', small: true, onClick: () => {
    items.push({ key: uid(), text: '', markType: 'manuel', needsReview: false, selected: true });
    drawItems(); changed();
    listEl.lastElementChild?.querySelector('textarea')?.focus();
  } });

  drawItems();
  const photo = imageSrc
    ? el('details', { class: 'review-photo', open: !compact },
      el('summary', {}, compact ? 'Fotoğrafı göster' : 'Orijinal fotoğraf'),
      el('img', { src: imageSrc, alt: 'Taranan kitap sayfası', loading: 'lazy' }))
    : null;
  const root = el('div', { class: `review-layout${compact ? ' compact' : ''}` },
    photo,
    el('div', {},
      title ? el('h3', { class: 'review-group-title' }, title) : null,
      field('Sayfa numarası', pageInput, pageHint || (page ? 'Fotoğraftan algılandı; gerekirse düzelt.' : 'Fotoğrafta sayfa numarası bulunamadı.')),
      uncertain?.length ? el('div', { class: 'callout' }, icon('alert'), el('div', {}, el('strong', {}, 'Modelin emin olmadığı bölgeler'), el('ul', {}, uncertain.map(u => el('li', {}, u))))) : null,
      el('div', { class: 'row-actions' }, addBtn, mergeBtn, toggleAllBtn),
      listEl));

  return {
    root,
    getPage: () => pageInput.value.trim(),
    getItems: () => items.map(({ key, ...rest }) => rest),
    selected: () => items.filter(i => i.selected && i.text.trim()),
  };
}

/**
 * Seçilen alıntıları mükerrer ve [okunamadı] kontrolüyle kaydeder.
 * entries: [{ page, item }]  → kaydedilen kayıtlar veya kullanıcı vazgeçerse null
 */
export async function saveReviewed(book, entries) {
  if (!entries.length) return [];
  const seen = new Set();
  const dups = entries.filter(e => {
    const k = normalizeText(e.item.text);
    const d = findDuplicate(book.id, e.item.text) || seen.has(k);
    seen.add(k);
    return d;
  });
  let chosen = entries;
  if (dups.length) {
    const choice = await choiceDialog({
      title: 'Mükerrer alıntı',
      message: `${dups.length} alıntı bu kitapta zaten kayıtlı veya listede iki kez geçiyor.`,
      options: [
        { value: 'skip', label: 'Tekrarları atla', description: `${entries.length - dups.length} yeni alıntı kaydedilir` },
        { value: 'all', label: 'Hepsini kaydet', description: 'Tekrarlar ayrı kayıt olarak eklenir' },
      ],
    });
    if (!choice) return null;
    if (choice === 'skip') chosen = entries.filter(e => !dups.includes(e));
  }
  const unreadable = chosen.filter(e => /\[okunamadı\]/i.test(e.item.text)).length;
  if (unreadable && !await confirmDialog({ title: 'Okunamayan kelimeler var', message: `${unreadable} alıntıda “[okunamadı]” ifadesi duruyor. Düzeltmeden kaydetmek istiyor musun?`, confirmLabel: 'Yine de kaydet' })) return null;
  return saveHighlights(chosen.map(e => ({ bookId: book.id, text: e.item.text, page: e.page, markType: e.item.markType, source: 'tarama' })));
}

// ---------- Tek sayfa onay ekranı ----------
export function reviewView({ parts }) {
  const draft = state.drafts.find(d => d.id === parts[1]);
  if (!draft) return el('section', {}, pageHeader('Taslak bulunamadı', { back: '#/' }), emptyState('Bu tarama taslağı kaydedilmiş veya silinmiş olabilir.'));
  const book = bookById(draft.bookId);
  if (!book) return el('section', {}, pageHeader('Kitap bulunamadı', { back: '#/' }), emptyState('Taslağın ait olduğu kitap silinmiş.'));

  let closed = false; // kaydedildi/silindi: bekleyen otomatik kayıt taslağı geri yazmasın
  const persist = debounce(() => {
    if (closed || !state.drafts.some(d => d.id === draft.id)) return;
    saveDraft({ ...draft, page: group.getPage(), items: group.getItems() }).catch(() => {});
  }, 400);
  const saveBtn = button('Seçilenleri kaydet', { variant: 'primary', icon: 'check' });
  const updateCount = () => {
    const n = group.selected().length;
    saveBtn.querySelector('span').textContent = `Seçilenleri kaydet (${n})`;
    saveBtn.disabled = n === 0;
  };
  const group = createReviewGroup({
    book, imageSrc: draft.image, page: draft.page, uncertain: draft.uncertain, items: draft.items,
    onChange: () => { updateCount(); persist(); },
  });
  updateCount();

  saveBtn.onclick = async () => {
    const page = group.getPage();
    try {
      saveBtn.disabled = true;
      closed = true;
      const saved = await saveReviewed(book, group.selected().map(item => ({ page, item })));
      if (saved === null) { closed = false; saveBtn.disabled = false; return; }
      await deleteDraft(draft.id); // geçici fotoğraf da taslakla birlikte silinir
      toast(saved.length ? `${saved.length} alıntı kaydedildi.` : 'Yeni alıntı kaydedilmedi.');
      navigate(`kitap/${encodeURIComponent(book.id)}`, { replace: true });
    } catch (e) {
      closed = false;
      saveBtn.disabled = false;
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

  return el('section', { class: 'review' },
    pageHeader('Alıntıları kontrol et', { back: `#/kitap/${encodeURIComponent(book.id)}`, subtitle: `${book.title} · ${book.author}` }),
    reviewNotice(),
    group.root,
    el('div', { class: 'sticky-footer' },
      button('Taslağı sil', { variant: 'ghost-danger', icon: 'trash', onClick: discard }),
      saveBtn));
}

export function reviewNotice() {
  return el('p', { class: 'callout callout-soft' }, icon('alert'), el('span', {}, 'Metinleri fotoğrafla karşılaştır. Yapay zekâ işaretleri kaçırabilir veya kelimeleri yanlış okuyabilir. Onaylamadığın hiçbir şey arşive eklenmez.'));
}

/** Bekleyen tek sayfa taslakları ve toplu taramalar için bilgi kutusu. bookId verilirse yalnızca o kitap. */
export function pendingCallout(bookId = null) {
  const drafts = state.drafts.filter(d => !bookId || d.bookId === bookId);
  const jobs = state.jobs.filter(j => (!bookId || j.bookId === bookId));
  if (!drafts.length && !jobs.length) return null;
  const jobLabel = j => {
    const b = bookById(j.bookId);
    const st = { draft: 'hazırlanıyor', running: 'taranıyor', paused: 'duraklatıldı', done: 'onay bekliyor' }[j.status] || j.status;
    return `${bookId ? '' : (b?.title || 'Kitap') + ' · '}Toplu tarama (${j.order?.length || 0} sayfa) · ${st}`;
  };
  return el('div', { class: 'callout' }, icon('alert'),
    el('div', {},
      el('strong', {}, 'Onay bekleyen taramalar'),
      el('p', { class: 'muted small' }, 'Kontrol edip kaydetmediğin alıntılar arşive eklenmez.'),
      el('div', { class: 'row-actions' },
        drafts.map(d => {
          const b = bookById(d.bookId);
          return button(`${bookId ? '' : (b?.title || 'Kitap') + ' · '}${d.page ? 's. ' + d.page : 'sayfa ?'} · ${d.items.length} alıntı`, { small: true, href: `#/onay/${encodeURIComponent(d.id)}` });
        }),
        jobs.map(j => button(jobLabel(j), { small: true, icon: 'scan', href: `#/toplu/${encodeURIComponent(j.id)}` })))));
}
