// Kitap listesi, kitap detay ekranı, kitap formu ve kişisel notlar.
import { el, includesTr, compareTr, comparePage, toast, confirmDialog, choiceDialog, formatDate } from './utils.js';
import { icon } from './icons.js';
import { BOOK_STATUSES, statusLabel } from './database.js';
import { state, bookById, highlightsOf, notesOf, saveBook, deleteBook, saveNote, deleteNote } from './store.js';
import { navigate, refresh } from './router.js';
import { button, iconButton, pageHeader, emptyState, cover, bookCard, progressBar, statusChip, highlightCard, field, select } from './ui.js';
import { fileToCover } from './scanner.js';
import { lookupIsbn, normalizeIsbn, photoForReading } from './bookinfo.js';
import { extractBookInfo, extractBookFromUrl, hasApiKey } from './gemini.js';
import { openHighlightEditor } from './highlights.js';
import { exportBook } from './export.js';
import { pendingCallout } from './review.js';
import { tagInput } from './tags.js';
import { renderRich, backlinksToBook, linkChip, wikiButton, relatedEditor, syncBacklinks } from './links.js';
import { relatedBlock } from './ui.js';
import { saveHighlights, findDuplicate } from './store.js';
import { queuePages, pendingInbox } from './bridge.js';
import { formatDate as fmtDay } from './utils.js';

// ---------- Otomatik doldurma (kapak fotoğrafı / ISBN) ----------
function append(parent, ...children) { parent.append(...children.filter(Boolean)); return parent; }
let dlgAbort = null;

function autoFillBox({ f, more, hasCover, setCover }) {
  let ctrl = null;
  const status = el('p', { class: 'autofill-status', role: 'status', 'aria-live': 'polite' });
  const cam = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const gal = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const isbnIn = el('input', { inputmode: 'numeric', placeholder: 'ISBN (ör. 9789750726439)', 'aria-label': 'ISBN', maxlength: 20 });
  const online = navigator.onLine !== false, key = hasApiKey();
  const camBtn = button('Kapağın fotoğrafını çek', { icon: 'camera', small: true, variant: 'primary', disabled: !online || !key, onClick: () => cam.click() });
  const galBtn = button('Fotoğraf seç', { icon: 'image', small: true, disabled: !online || !key, onClick: () => gal.click() });
  const findBtn = button('Bul', { icon: 'search', small: true, disabled: !online, onClick: () => byIsbn(isbnIn.value) });
  const urlIn = el('input', { type: 'url', inputmode: 'url', placeholder: 'Kitap bağlantısı (1000kitap, Kitapyurdu, D&R…)', 'aria-label': 'Kitap bağlantısı' });
  const urlBtn = button('Getir', { icon: 'download', small: true, disabled: !online || !key, onClick: () => byUrl(urlIn.value) });
  urlIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); byUrl(urlIn.value); } });
  urlIn.addEventListener('paste', () => setTimeout(() => { if (/^https?:\/\//.test(urlIn.value.trim()) && !urlBtn.disabled) byUrl(urlIn.value); }, 0));
  isbnIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); byIsbn(isbnIn.value); } });

  const say = (text, kind = '') => {
    status.replaceChildren(...[kind === 'busy' ? el('span', { class: 'spinner spinner-sm', 'aria-hidden': 'true' }) : null, text].filter(Boolean));
    status.dataset.kind = kind;
  };
  const busy = on => { [camBtn, galBtn, findBtn, isbnIn, urlBtn, urlIn].forEach(b => { b.disabled = on || (b !== findBtn && b !== isbnIn && (!online || !key)) || (!online); }); };

  /** Yalnızca boş alanları doldurur; doldurulanların adlarını döner. */
  const apply = info => {
    const filled = [];
    const set = (input, value, label) => {
      if (value === null || value === undefined || value === '') return;
      if (String(input.value).trim()) return;
      input.value = String(value);
      filled.push(label);
    };
    set(f.title, info.title, 'kitap adı');
    set(f.author, info.author, 'yazar');
    set(f.publisher, info.publisher, 'yayınevi');
    set(f.isbn, info.isbn && normalizeIsbn(info.isbn) ? normalizeIsbn(info.isbn) : '', 'ISBN');
    set(f.totalPages, info.totalPages, 'sayfa sayısı');
    if (info.cover && !hasCover()) { setCover(info.cover); filled.push('kapak'); }
    if (filled.some(x => ['yayınevi', 'ISBN', 'sayfa sayısı', 'kapak'].includes(x))) more.open = true;
    return filled;
  };

  async function byIsbn(raw, { quiet = false, prefix = [] } = {}) {
    const isbn = normalizeIsbn(raw);
    if (!isbn) { if (!quiet) say('Geçerli bir ISBN değil. 13 (veya 10) haneli numarayı kontrol et.', 'error'); return; }
    ctrl?.abort(); ctrl = new AbortController(); busy(true);
    say('Kataloglarda aranıyor…', 'busy');
    try {
      const r = await lookupIsbn(isbn, { signal: ctrl.signal });
      if (!f.isbn.value.trim()) f.isbn.value = isbn;
      if (!r.found) {
        say(prefix.length ? `Doldurulan: ${prefix.join(', ')}. ISBN kataloglarda bulunamadı; kalan bilgileri elle girebilirsin.` : r.reason === 'offline' ? 'İnternet bağlantısı yok.' : 'Bu ISBN ücretsiz kataloglarda bulunamadı. Kapağın fotoğrafını çekmeyi dene.', r.found ? 'ok' : 'warn');
        return;
      }
      const filled = [...prefix, ...apply(r)];
      say(filled.length ? `Doldurulan: ${[...new Set(filled)].join(', ')} (${r.sources.join(' + ')}). Kontrol edip kaydet.` : 'Kitap bulundu ama doldurulacak boş alan kalmadı.', 'ok');
    } finally { busy(false); }
  }

  async function byPhoto(files) {
    const list = [...files].filter(x => !x.type || x.type.startsWith('image/')).slice(0, 3);
    if (!list.length) return;
    ctrl?.abort(); ctrl = new AbortController(); busy(true);
    say('Kapak okunuyor…', 'busy');
    try {
      const images = [];
      for (const file of list) images.push(await photoForReading(file)); // yalnızca okuma için; saklanmaz
      const info = await extractBookInfo({ images, signal: ctrl.signal });
      if (!info.title && !info.author && !info.isbn) { say('Fotoğrafta kitap bilgisi okunamadı. Kapağı düz ve yakından çekmeyi dene.', 'warn'); return; }
      const filled = apply(info);
      if (normalizeIsbn(info.isbn)) { busy(false); await byIsbn(info.isbn, { quiet: true, prefix: filled }); return; }
      say(`Doldurulan: ${filled.join(', ') || 'yok'}.${info.isbn ? '' : ' ISBN için arka kapağın fotoğrafını da ekleyebilirsin.'} Kontrol edip kaydet.`, 'ok');
    } catch (e) {
      if (e.code !== 'aborted') say(e.full || e.message || 'Okunamadı.', 'error');
    } finally { busy(false); }
  }
  async function byUrl(raw) {
    if (!raw.trim()) { say('Önce bir bağlantı yapıştır.', 'warn'); return; }
    ctrl?.abort(); ctrl = new AbortController(); busy(true);
    say('Bağlantı okunuyor… (10–30 saniye sürebilir)', 'busy');
    try {
      const info = await extractBookFromUrl({ url: raw, signal: ctrl.signal });
      if (!info.title && !info.author && !info.isbn) {
        say(info.pageOpened ? 'Sayfa açıldı ama kitap bilgisi bulunamadı.' : 'Sayfa açılamadı ve aramada da kitap bulunamadı. Kapağın fotoğrafını veya ISBN’i dene.', 'warn');
        return;
      }
      const filled = apply(info);
      const how = info.pageOpened || info.via === 'sayfa' ? 'sayfadan okundu' : 'sayfa açılamadı, Google aramasıyla bulundu — kontrol etmeni öneririm';
      if (normalizeIsbn(info.isbn)) { busy(false); await byIsbn(info.isbn, { quiet: true, prefix: filled }); say(`${status.textContent} (${how})`, 'ok'); return; }
      say(`Doldurulan: ${filled.join(', ') || 'yok'} (${how}). Kontrol edip kaydet.`, info.pageOpened ? 'ok' : 'warn');
    } catch (e) {
      if (e.code !== 'aborted') say(e.full || e.message || 'Bağlantı okunamadı.', 'error');
    } finally { busy(false); }
  }

  for (const inp of [cam, gal]) inp.onchange = () => { const files = [...inp.files]; inp.value = ''; byPhoto(files); };

  const root = el('div', { class: 'autofill' },
    el('p', { class: 'autofill-title' }, icon('scan', { size: 18 }), el('strong', {}, 'Otomatik doldur')),
    el('div', { class: 'row-actions' }, camBtn, galBtn),
    el('div', { class: 'isbn-row' }, isbnIn, findBtn),
    el('div', { class: 'isbn-row' }, urlIn, urlBtn),
    status, cam, gal,
    el('p', { class: 'muted small' }, !online ? 'Otomatik doldurma için internet gerekiyor.'
      : !key ? 'Fotoğrafla doldurmak için Ayarlar’dan Gemini anahtarını gir. ISBN ile arama anahtarsız çalışır.'
        : 'İpucu: ön kapakla birlikte arka kapağı (barkod) da seçersen ISBN ve yayınevi de okunur. Fotoğraf yalnızca okumak için Gemini’ye gönderilir; kapak olarak kullanılmaz ve saklanmaz. Bağlantı da Gemini’ye gönderilir; sayfa açılamazsa kitap adıyla Google’da aranır.'));
  return { root, abort: () => ctrl?.abort() };
}

// ---------- Kitap formu ----------
export function openBookForm(book = null, { past = false } = {}) {
  return new Promise(resolve => {
    const b = book || (past ? { status: 'tamamlandi' } : {});
    let coverData = b.cover || '';
    const f = {
      title: el('input', { required: true, maxlength: 300, value: b.title || '', autocomplete: 'off' }),
      author: el('input', { required: true, maxlength: 200, value: b.author || '', autocomplete: 'off' }),
      publisher: el('input', { maxlength: 200, value: b.publisher || '' }),
      isbn: el('input', { maxlength: 20, inputmode: 'numeric', value: b.isbn || '' }),
      category: el('input', { maxlength: 80, value: b.category || '', list: 'category-list' }),
      status: select(BOOK_STATUSES, b.status || (book ? 'okunacak' : 'okunuyor')),
      totalPages: el('input', { type: 'number', min: 0, max: 100000, inputmode: 'numeric', value: b.totalPages ?? '' }),
      readPages: el('input', { type: 'number', min: 0, max: 100000, inputmode: 'numeric', value: b.readPages ?? '', disabled: !!b.sefer }),
      startDate: el('input', { type: 'date', value: b.startDate || '' }),
      endDate: el('input', { type: 'date', value: b.endDate || '' }),
      rating: select([{ value: '0', label: 'Puan yok' }, ...[1, 2, 3, 4, 5].map(n => ({ value: String(n), label: '★'.repeat(n) + '☆'.repeat(5 - n) }))], String(b.rating || 0)),
      review: el('textarea', { rows: 4, maxlength: 50000 }, b.review || ''),
    };
    f.review.value = b.review || '';
    const categories = [...new Set(state.books.map(x => x.category).filter(Boolean))];
    const datalist = el('datalist', { id: 'category-list' }, categories.map(c => el('option', { value: c })));

    const coverPreview = el('div', { class: 'cover-edit' });
    const coverInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const drawCover = () => coverPreview.replaceChildren(
      cover({ title: f.title.value || '?', cover: coverData }, 'md'),
      el('div', { class: 'row-actions' },
        button(coverData ? 'Kapağı değiştir' : 'Kapak ekle', { icon: 'image', small: true, onClick: () => coverInput.click() }),
        coverData ? button('Kaldır', { small: true, variant: 'ghost', onClick: () => { coverData = ''; drawCover(); } }) : null));
    coverInput.onchange = async () => {
      const file = coverInput.files[0]; coverInput.value = '';
      if (!file) return;
      try { coverData = await fileToCover(file); drawCover(); } catch (e) { toast(e.message, { type: 'error' }); }
    };
    drawCover();

    // Durum değişince tarihleri akıllıca doldur
    f.status.onchange = () => {
      const today = new Date().toISOString().slice(0, 10);
      if (f.status.value === 'okunuyor' && !f.startDate.value) f.startDate.value = today;
      if (f.status.value === 'tamamlandi') {
        if (!f.endDate.value) f.endDate.value = today;
        if (f.totalPages.value && !f.readPages.value) f.readPages.value = f.totalPages.value;
      }
    };

    const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
    let result = null;
    const more = el('details', { class: 'more-fields', open: !!book || past });
    const auto = autoFillBox({
      f, more,
      hasCover: () => !!coverData,
      setCover: c => { coverData = c; drawCover(); },
    });
    dlgAbort = auto.abort;
    const form = el('form', { class: 'form', novalidate: true },
      el('h2', {}, book ? 'Kitabı düzenle' : past ? 'Okuduğum bir kitap' : 'Yeni kitap'),
      past ? el('p', { class: 'muted small' }, 'Daha önce okuduğun kitabı ekle. Bitirme tarihini (bilmiyorsan yaklaşık ayın ilk gününü) girersen istatistiklerde o aya sayılır.') : null,
      book ? el('details', { class: 'autofill-wrap' }, el('summary', {}, 'Bilgileri otomatik doldur'), auto.root) : auto.root,
      field('Kitap adı *', f.title),
      field('Yazar *', f.author),
      append(more,
        el('summary', {}, 'Diğer bilgiler (isteğe bağlı)'),
        coverPreview, coverInput,
        el('div', { class: 'grid-2' },
          field('Okuma durumu', f.status),
          field('Kategori', f.category), datalist,
          field('Yayınevi', f.publisher),
          field('ISBN', f.isbn),
          field('Toplam sayfa', f.totalPages),
          field('Okunan sayfa', f.readPages, b.sefer ? 'Sefer’e bağlı: okunan sayfa Sefer’deki kayıtlardan gelir.' : undefined),
          field('Başlama tarihi', f.startDate),
          field('Bitirme tarihi', f.endDate),
          field('Puan', f.rating)),
        field('Kişisel değerlendirme', f.review)),
      error,
      el('div', { class: 'row-actions end sticky-actions' },
        button('Vazgeç', { onClick: () => dlg.close() }),
        button('Kaydet', { variant: 'primary', type: 'submit', icon: 'check' })));

    form.onsubmit = async e => {
      e.preventDefault();
      const title = f.title.value.trim(), author = f.author.value.trim();
      if (!title || !author) { error.textContent = 'Kitap adı ve yazar zorunludur.'; error.hidden = false; (title ? f.author : f.title).focus(); return; }
      const total = f.totalPages.value === '' ? null : Number(f.totalPages.value);
      let read = b.sefer ? (b.readPages ?? null) : (f.readPages.value === '' ? null : Number(f.readPages.value));
      if (f.status.value === 'tamamlandi' && read === null && total !== null) read = total; // bitmiş kitap: okunan = toplam
      if (total !== null && read !== null && read > total) { error.textContent = 'Okunan sayfa, toplam sayfadan büyük olamaz.'; error.hidden = false; return; }
      if (f.startDate.value && f.endDate.value && f.endDate.value < f.startDate.value) { error.textContent = 'Bitirme tarihi başlama tarihinden önce olamaz.'; error.hidden = false; return; }
      try {
        result = await saveBook({
          id: book?.id, title, author,
          publisher: f.publisher.value, isbn: f.isbn.value, category: f.category.value,
          status: f.status.value, totalPages: total, readPages: read,
          startDate: f.startDate.value, endDate: f.endDate.value,
          rating: Number(f.rating.value), review: f.review.value, cover: coverData,
        });
        dlg.close();
      } catch (err) { error.textContent = err.message; error.hidden = false; }
    };

    const dlg = el('dialog', { class: 'dialog dialog-wide' }, form);
    dlg.addEventListener('close', () => { dlgAbort?.(); dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    f.title.focus();
    if (past) f.status.value = 'tamamlandi';
  });
}

// ---------- Kitaplarım ----------
const listState = { q: '', status: 'hepsi', sort: 'updated' };

export function booksView() {
  const counts = new Map();
  for (const h of state.highlights) counts.set(h.bookId, (counts.get(h.bookId) || 0) + 1);

  const list = el('div', { class: 'book-list' });
  const draw = () => {
    let books = state.books.filter(b =>
      (listState.status === 'hepsi' || b.status === listState.status) &&
      (includesTr(`${b.title} ${b.author} ${b.publisher} ${b.category} ${b.isbn}`, listState.q)));
    const sorters = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      title: (a, b) => compareTr(a.title, b.title),
      author: (a, b) => compareTr(a.author, b.author) || compareTr(a.title, b.title),
      highlights: (a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0),
    };
    books.sort(sorters[listState.sort]);
    list.replaceChildren(...(books.length
      ? books.map(b => bookCard(b, counts.get(b.id) || 0))
      : [emptyState(state.books.length ? 'Aramaya uygun kitap bulunamadı.' : 'Henüz kitap eklemedin. İlk kitabını ekleyerek başla.',
        state.books.length ? null : button('Kitap ekle', { icon: 'plus', variant: 'primary', onClick: addBook }))]));
  };

  const search = el('input', { type: 'search', placeholder: 'Kitap, yazar, yayınevi ara…', value: listState.q, 'aria-label': 'Kitaplarda ara' });
  search.oninput = () => { listState.q = search.value; draw(); };
  const filters = el('div', { class: 'chips', role: 'group', 'aria-label': 'Duruma göre filtrele' },
    [{ value: 'hepsi', label: 'Hepsi' }, ...BOOK_STATUSES].map(s => {
      const n = s.value === 'hepsi' ? state.books.length : state.books.filter(b => b.status === s.value).length;
      const b = el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(listState.status === s.value) }, `${s.label} (${n})`);
      b.onclick = () => { listState.status = s.value; filters.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); };
      return b;
    }));
  const sort = select([
    { value: 'updated', label: 'Son güncellenen' }, { value: 'created', label: 'Son eklenen' },
    { value: 'title', label: 'Kitap adı (A–Z)' }, { value: 'author', label: 'Yazar (A–Z)' }, { value: 'highlights', label: 'En çok alıntı' },
  ], listState.sort, { 'aria-label': 'Sıralama' });
  sort.onchange = () => { listState.sort = sort.value; draw(); };

  draw();
  return el('section', {},
    pageHeader('Kitaplarım', { actions: [
      button('İstatistik', { icon: 'note', small: true, href: '#/istatistik' }),
      button('Okuduğum bir kitap', { icon: 'check', small: true, onClick: addPastBook }),
      button('Kitap ekle', { icon: 'plus', variant: 'primary', onClick: addBook })] }),
    el('div', { class: 'toolbar' }, el('div', { class: 'search' }, icon('search', { size: 18 }), search), sort),
    filters, list);
}

export async function addPastBook() {
  const b = await openBookForm(null, { past: true });
  if (b) { toast('Kitap eklendi. Alıntılarını “Toplu alıntı gir” ile ekleyebilirsin.'); navigate(`kitap/${encodeURIComponent(b.id)}`); }
}

export async function addBook() {
  const b = await openBookForm();
  if (b) { toast('Kitap eklendi.'); navigate(`kitap/${encodeURIComponent(b.id)}`); }
}

// ---------- Kitap detayı ----------
const detailSort = { by: 'page' };

export function bookDetailView({ parts }) {
  const book = bookById(parts[1]);
  if (!book) return el('section', {}, pageHeader('Kitap bulunamadı', { back: '#/kitaplar' }), emptyState('Bu kitap silinmiş olabilir.'));

  const hls = highlightsOf(book.id);
  const notes = notesOf(book.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const info = el('div', { class: 'book-hero' },
    cover(book, 'lg'),
    el('div', { class: 'book-hero-body' },
      el('h1', {}, book.title),
      el('p', { class: 'book-author' }, book.author),
      el('div', { class: 'book-card-meta' }, statusChip(book.status), book.rating ? el('span', { class: 'rating', 'aria-label': `${book.rating} / 5 puan` }, '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating)) : null),
      progressBar(book),
      el('dl', { class: 'facts' },
        fact('Alıntı', String(hls.length)),
        fact('Not', String(notes.length)),
        book.publisher ? fact('Yayınevi', book.publisher) : null,
        book.category ? fact('Kategori', book.category) : null,
        book.isbn ? fact('ISBN', book.isbn) : null,
        book.startDate ? fact('Başlama', formatDate(book.startDate)) : null,
        book.endDate ? fact('Bitirme', formatDate(book.endDate)) : null)));

  const actions = el('div', { class: 'action-grid' },
    button('Sayfa tara', { icon: 'camera', variant: 'primary', href: `#/tara?kitap=${encodeURIComponent(book.id)}` }),
    button('Toplu tara', { icon: 'scan', href: `#/toplu?kitap=${encodeURIComponent(book.id)}` }),
    button('Elle alıntı ekle', { icon: 'plus', onClick: async () => { if (await openHighlightEditor({ bookId: book.id })) refresh(); } }),
    button('Toplu alıntı gir', { icon: 'quote', onClick: () => openBulkEntry(book) }),
    button('Not ekle', { icon: 'note', onClick: () => openNoteEditor(book.id) }),
    button('Dışa aktar', { icon: 'download', onClick: async () => {
      const f = await choiceDialog({ title: 'Dışa aktar', message: `${book.title} için biçim seçin.`, options: [
        { value: 'md', label: 'Markdown (.md)', description: 'Obsidian ve not uygulamalarıyla uyumlu' },
        { value: 'txt', label: 'Düz metin (.txt)' },
        { value: 'csv', label: 'Tablo (.csv)', description: 'Excel / Google E-Tablolar' },
      ] });
      if (f) exportBook(book, f);
    } }),
    button('Düzenle', { icon: 'edit', onClick: async () => { if (await openBookForm(book)) { toast('Kitap güncellendi.'); refresh(); } } }),
    button('Sil', { icon: 'trash', variant: 'ghost-danger', onClick: async () => {
      const ok = await confirmDialog({
        title: 'Kitap silinsin mi?',
        message: `“${book.title}” ile birlikte ${hls.length} alıntı ve ${notes.length} not kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
        confirmLabel: 'Kitabı sil', danger: true,
      });
      if (!ok) return;
      await deleteBook(book.id);
      toast('Kitap silindi.');
      navigate('kitaplar');
    } }));

  const draftBox = pendingCallout(book.id);
  const seferBox = seferInfo(book);

  const review = book.review?.trim() ? el('section', { class: 'card' }, el('h2', {}, 'Değerlendirmem'), el('p', { class: 'prewrap' }, book.review)) : null;

  const notesSection = notes.length ? el('section', {},
    el('h2', {}, 'Kişisel notlar'),
    notes.map(n => el('article', { class: 'note-card' },
      el('p', { class: 'prewrap' }, renderRich(n.text)),
      n.tags?.length ? el('div', { class: 'tags' }, n.tags.map(t => el('a', { class: 'tag', href: `#/alintilar?etiket=${encodeURIComponent(t)}` }, '#' + t))) : null,
      relatedBlock(n.id),
      el('div', { class: 'hl-actions' }, el('span', { class: 'muted small' }, formatDate(n.updatedAt, true)),
        el('div', { class: 'row-actions' },
          iconButton('edit', 'Notu düzenle', () => openNoteEditor(book.id, n)),
          iconButton('trash', 'Notu sil', async () => {
            if (await confirmDialog({ title: 'Not silinsin mi?', confirmLabel: 'Sil', danger: true })) { await deleteNote(n.id); refresh(); }
          })))))) : null;

  const back = backlinksToBook(book.id);
  const backSection = back.length ? el('section', {},
    el('h2', {}, 'Bu kitaba bağlantı verenler'),
    el('p', { class: 'muted small' }, 'Başka kitaplardaki notlarında [[' + book.title + ']] diye andığın yerler.'),
    el('div', { class: 'link-list' }, back.map(r => linkChip(r)))) : null;

  const sortSel = select([{ value: 'page', label: 'Sayfaya göre' }, { value: 'new', label: 'Yeniden eskiye' }, { value: 'old', label: 'Eskiden yeniye' }], detailSort.by, { 'aria-label': 'Alıntı sıralaması' });
  sortSel.onchange = () => { detailSort.by = sortSel.value; refresh(); };
  const sorted = [...hls].sort(detailSort.by === 'page'
    ? (a, b) => comparePage(a.page, b.page) || a.createdAt.localeCompare(b.createdAt)
    : detailSort.by === 'new' ? (a, b) => b.createdAt.localeCompare(a.createdAt) : (a, b) => a.createdAt.localeCompare(b.createdAt));
  const edit = async h => { if (await openHighlightEditor(h)) refresh(); };

  return el('section', {},
    el('a', { class: 'back-link', href: '#/kitaplar' }, icon('back', { size: 18 }), 'Kitaplarım'),
    info, seferBox, actions, draftBox, review, notesSection, backSection,
    el('div', { class: 'section-head' }, el('h2', {}, `Alıntılar (${hls.length})`), hls.length > 1 ? sortSel : null),
    hls.length ? el('div', { class: 'hl-list' }, sorted.map(h => highlightCard(h, { onEdit: edit })))
      : emptyState('Henüz alıntı yok. Altını çizdiğin bir sayfanın fotoğrafını tara veya elle ekle.'));
}

function seferInfo(book) {
  const embedded = document.documentElement.classList.contains('embedded');
  const target = embedded ? '_top' : undefined;
  if (!book.sefer) {
    if (book.status !== 'okunuyor') return null;
    return el('p', { class: 'muted small sefer-hint' }, icon('chevron', { size: 14 }),
      'Bu kitabı Sefer’deki bir okuma görevine bağlarsan sayfa ilerlemen ve serin otomatik güncellenir. Sefer’de görevi aç → “Kitabı değiştir” → “Satır İzi’nden seç”. ',
      el('a', { href: '../sefer/#bugun', target }, 'Sefer’i aç'));
  }
  const s = book.sefer;
  if (book.status === 'tamamlandi') {
    return el('div', { class: 'sefer-box' }, el('div', {}, el('strong', {}, 'Sefer’de tamamlandı'), el('span', { class: 'muted small' }, ` · ${s.task}`)),
      button('Sefer’de aç', { small: true, href: '../sefer/#takip', attrs: { target } }));
  }
  const pending = pendingInbox(book.id);
  const parts = [s.goal ? `günde ${s.goal} sayfa` : null, s.streak ? `${s.streak} günlük seri` : null, s.due ? `hedef ${fmtDay(s.due)}` : null].filter(Boolean);
  return el('div', { class: 'sefer-box' },
    el('div', {}, el('strong', {}, 'Sefer’de takip ediliyor'), el('span', { class: 'muted small' }, ` · ${s.task}${parts.length ? ' · ' + parts.join(' · ') : ''}`),
      pending ? el('p', { class: 'small warn-text' }, `${pending} sayfa Sefer açıldığında işlenecek.`) : null),
    el('div', { class: 'row-actions' },
      button('Bugün okudum', { small: true, variant: 'primary', icon: 'plus', onClick: () => openReadDialog(book) }),
      button('Sefer’de aç', { small: true, href: '../sefer/#bugun', attrs: { target } })));
}

function openReadDialog(book) {
  const inp = el('input', { type: 'number', min: 1, max: 2000, inputmode: 'numeric', value: '10', 'aria-label': 'Sayfa sayısı' });
  const embedded = document.documentElement.classList.contains('embedded');
  const dlg = el('dialog', { class: 'dialog' },
    el('h2', {}, 'Bugün kaç sayfa okudun?'),
    el('p', { class: 'muted' }, `${book.title} · Kayıt Sefer’deki “${book.sefer.task}” görevine eklenir; serin ve ilerlemen oradan hesaplanır.`),
    inp,
    el('div', { class: 'row-actions end' },
      button('Vazgeç', { onClick: () => dlg.close() }),
      button('Kaydet', { variant: 'primary', icon: 'check', onClick: () => {
        const n = Math.round(Number(inp.value));
        if (!(n > 0)) { toast('Bir sayfa sayısı yaz.'); return; }
        queuePages(book.id, n);
        dlg.close();
        toast(embedded ? `${n} sayfa Sefer’e kaydedildi.` : `${n} sayfa Sefer’e iletildi; Sefer’i açtığında işlenecek.`, embedded ? {} : { actionLabel: 'Sefer’i aç', action: () => { location.href = '../sefer/#bugun'; } });
        refresh();
      } })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  inp.select();
}

function fact(k, v) { return el('div', {}, el('dt', {}, k), el('dd', {}, v)); }

export function openNoteEditor(bookId, note = null) {
  const ta = el('textarea', { rows: 8, maxlength: 50000, placeholder: 'Bu kitapla ilgili düşüncelerin… Başka kitaba [[Kitap adı]], konuya #etiket ile bağlanabilirsin.' });
  ta.value = note?.text || '';
  const tags = tagInput(note?.tags || []);
  const related = relatedEditor(note?.id);
  const dlg = el('dialog', { class: 'dialog dialog-wide' },
    el('h2', {}, note ? 'Notu düzenle' : 'Kişisel not'),
    el('p', { class: 'muted' }, 'Kitaptan alıntı değil, kendi düşüncen. Alıntılardan ayrı saklanır.'),
    ta,
    el('div', { class: 'row-actions' }, wikiButton(ta)),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Etiketler'), tags.root),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'İlgili alıntılar ve notlar'), related.root),
    el('div', { class: 'row-actions end sticky-actions' },
      button('Vazgeç', { onClick: () => dlg.close() }),
      button('Kaydet', { variant: 'primary', icon: 'check', onClick: async () => {
        try {
          const saved = await saveNote({ id: note?.id, bookId, text: ta.value, tags: tags.get(), links: related.get() });
          await syncBacklinks(saved.id, related.get(), { highlight: saveHighlights, note: saveNote });
          dlg.close(); toast('Not kaydedildi.'); refresh();
        } catch (e) { toast(e.message, { type: 'error' }); }
      } })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  ta.focus();
}

// ---------- Toplu elle alıntı girişi (eski kitaplar için) ----------
const QUOTES = /^[“"«„']+|[”"»']+$/g;
/** Yapıştırılan metni alıntılara böler; "s. 42", "42:", "(s. 42)" gibi sayfa işaretlerini ayırır. */
export function parseBulk(text, { perLine = false } = {}) {
  const blocks = String(text || '').replace(/\r\n?/g, '\n').split(perLine ? /\n+/ : /\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return blocks.map(b => {
    let page = '', t = b;
    let m = t.match(/^\s*(?:s\.?|sf\.?|sayfa)\s*(\d{1,5})\s*[:\-–—.)]?\s+/i) || t.match(/^\s*(\d{1,5})\s*[:–—-]\s+/);
    if (m) { page = m[1]; t = t.slice(m[0].length); }
    else if ((m = t.match(/\s*\(\s*(?:s\.?|sf\.?|sayfa)\s*(\d{1,5})\s*\)\s*$/i) || t.match(/\s+[-–—]\s*(?:s\.?|sf\.?|sayfa)\s*(\d{1,5})\s*$/i))) { page = m[1]; t = t.slice(0, m.index); }
    t = t.trim().replace(QUOTES, '').trim();
    return { text: t, page };
  }).filter(x => x.text);
}

export function openBulkEntry(book) {
  const ta = el('textarea', { rows: 12, placeholder: 's. 42 İnsan, okuduğu kitapların toplamıdır.\n\ns. 57 Bir başka alıntı…\n\nSayfa numarası yazmazsan boş kalır.' });
  const perLine = el('input', { type: 'checkbox' });
  const count = el('p', { class: 'muted small' }, 'Henüz alıntı yok.');
  const today = new Date().toISOString().slice(0, 10);
  const defDate = book.status === 'tamamlandi' && book.endDate ? book.endDate : today;
  const date = el('input', { type: 'date', value: defDate, max: today });
  const tags = tagInput([]);
  const upd = () => {
    const items = parseBulk(ta.value, { perLine: perLine.checked });
    const pages = items.filter(i => i.page).length;
    count.textContent = items.length ? `${items.length} alıntı bulundu${pages ? `, ${pages} tanesinde sayfa numarası var` : ''}.` : 'Henüz alıntı yok.';
  };
  ta.oninput = upd; perLine.onchange = upd;
  const dlg = el('dialog', { class: 'dialog dialog-wide' },
    el('h2', {}, 'Toplu alıntı gir'),
    el('p', { class: 'muted' }, `${book.title} · Alıntıları yapıştır veya yaz; her alıntıyı boş bir satırla ayır. Başına “s. 42” ya da “42:”, sonuna “(s. 42)” yazarsan sayfa numarası ayrılır.`),
    ta,
    el('label', { class: 'check' }, perLine, el('span', {}, 'Her satır ayrı bir alıntı')),
    count,
    el('div', { class: 'grid-2' },
      field('Eklenme tarihi', date, book.endDate ? 'Varsayılan: kitabı bitirdiğin tarih. İstatistikler bu tarihe göre sayar.' : 'İstatistiklerde bu tarihe sayılır.'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Hepsine etiket'), tags.root)),
    el('div', { class: 'row-actions end sticky-actions' },
      button('Vazgeç', { onClick: () => dlg.close() }),
      button('Kaydet', { variant: 'primary', icon: 'check', onClick: async () => {
        let items = parseBulk(ta.value, { perLine: perLine.checked });
        if (!items.length) { toast('Kaydedilecek alıntı yok.'); return; }
        const dups = items.filter(i => findDuplicate(book.id, i.text));
        if (dups.length) {
          const c = await choiceDialog({ title: 'Mükerrer alıntı', message: `${dups.length} alıntı bu kitapta zaten kayıtlı.`, options: [
            { value: 'skip', label: 'Tekrarları atla', description: `${items.length - dups.length} yeni alıntı kaydedilir` },
            { value: 'all', label: 'Hepsini kaydet' }] });
          if (!c) return;
          if (c === 'skip') items = items.filter(i => !dups.includes(i));
        }
        const d = date.value || today;
        const createdAt = new Date(`${d}T12:00:00`).toISOString();
        const t = tags.get();
        const saved = await saveHighlights(items.map(i => ({ bookId: book.id, text: i.text, page: i.page, markType: 'manuel', source: 'manuel', tags: t, createdAt })));
        dlg.close();
        toast(`${saved.length} alıntı kaydedildi.`);
        refresh();
      } })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  ta.focus();
}

export { statusLabel };
