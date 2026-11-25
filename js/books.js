// Kitap listesi, kitap detay ekranı, kitap formu ve kişisel notlar.
import { el, includesTr, compareTr, comparePage, toast, confirmDialog, choiceDialog, formatDate } from './utils.js';
import { icon } from './icons.js';
import { BOOK_STATUSES, statusLabel } from './database.js';
import { state, bookById, highlightsOf, notesOf, saveBook, deleteBook, saveNote, deleteNote } from './store.js';
import { navigate, refresh } from './router.js';
import { button, iconButton, pageHeader, emptyState, cover, bookCard, progressBar, statusChip, highlightCard, field, select } from './ui.js';
import { fileToCover } from './scanner.js';
import { openHighlightEditor } from './highlights.js';
import { exportBook } from './export.js';
import { pendingCallout } from './review.js';
import { queuePages, pendingInbox } from './bridge.js';
import { formatDate as fmtDay } from './utils.js';

// ---------- Kitap formu ----------
export function openBookForm(book = null) {
  return new Promise(resolve => {
    const b = book || {};
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
    const form = el('form', { class: 'form', novalidate: true },
      el('h2', {}, book ? 'Kitabı düzenle' : 'Yeni kitap'),
      field('Kitap adı *', f.title),
      field('Yazar *', f.author),
      el('details', { class: 'more-fields', open: !!book },
        el('summary', {}, 'Diğer bilgiler (isteğe bağlı)'),
        coverPreview, coverInput,
        el('div', { class: 'grid-2' },
          field('Okuma durumu', f.status),
          field('Kategori', f.category), datalist,
          field('Yayınevi', f.publisher),
          field('ISBN', f.isbn),
          field('Toplam sayfa', f.totalPages),
          field('Okunan sayfa', f.readPages, b.sefer ? 'SEFER’e bağlı: okunan sayfa SEFER’deki kayıtlardan gelir.' : undefined),
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
      const read = b.sefer ? (b.readPages ?? null) : (f.readPages.value === '' ? null : Number(f.readPages.value));
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
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    f.title.focus();
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
    pageHeader('Kitaplarım', { actions: [button('Kitap ekle', { icon: 'plus', variant: 'primary', onClick: addBook })] }),
    el('div', { class: 'toolbar' }, el('div', { class: 'search' }, icon('search', { size: 18 }), search), sort),
    filters, list);
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
      el('p', { class: 'prewrap' }, n.text),
      el('div', { class: 'hl-actions' }, el('span', { class: 'muted small' }, formatDate(n.updatedAt, true)),
        el('div', { class: 'row-actions' },
          iconButton('edit', 'Notu düzenle', () => openNoteEditor(book.id, n)),
          iconButton('trash', 'Notu sil', async () => {
            if (await confirmDialog({ title: 'Not silinsin mi?', confirmLabel: 'Sil', danger: true })) { await deleteNote(n.id); refresh(); }
          })))))) : null;

  const sortSel = select([{ value: 'page', label: 'Sayfaya göre' }, { value: 'new', label: 'Yeniden eskiye' }, { value: 'old', label: 'Eskiden yeniye' }], detailSort.by, { 'aria-label': 'Alıntı sıralaması' });
  sortSel.onchange = () => { detailSort.by = sortSel.value; refresh(); };
  const sorted = [...hls].sort(detailSort.by === 'page'
    ? (a, b) => comparePage(a.page, b.page) || a.createdAt.localeCompare(b.createdAt)
    : detailSort.by === 'new' ? (a, b) => b.createdAt.localeCompare(a.createdAt) : (a, b) => a.createdAt.localeCompare(b.createdAt));
  const edit = async h => { if (await openHighlightEditor(h)) refresh(); };

  return el('section', {},
    el('a', { class: 'back-link', href: '#/kitaplar' }, icon('back', { size: 18 }), 'Kitaplarım'),
    info, seferBox, actions, draftBox, review, notesSection,
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
      'Bu kitabı SEFER’deki bir okuma görevine bağlarsan sayfa ilerlemen ve serin otomatik güncellenir. SEFER’de görevi aç → “Kitabı değiştir” → “Satır İzi’nden seç”. ',
      el('a', { href: '../sefer/#bugun', target }, 'SEFER’i aç'));
  }
  const s = book.sefer;
  if (book.status === 'tamamlandi') {
    return el('div', { class: 'sefer-box' }, el('div', {}, el('strong', {}, 'SEFER’de tamamlandı'), el('span', { class: 'muted small' }, ` · ${s.task}`)),
      button('SEFER’de aç', { small: true, href: '../sefer/#takip', attrs: { target } }));
  }
  const pending = pendingInbox(book.id);
  const parts = [s.goal ? `günde ${s.goal} sayfa` : null, s.streak ? `${s.streak} günlük seri` : null, s.due ? `hedef ${fmtDay(s.due)}` : null].filter(Boolean);
  return el('div', { class: 'sefer-box' },
    el('div', {}, el('strong', {}, 'SEFER’de takip ediliyor'), el('span', { class: 'muted small' }, ` · ${s.task}${parts.length ? ' · ' + parts.join(' · ') : ''}`),
      pending ? el('p', { class: 'small warn-text' }, `${pending} sayfa SEFER açıldığında işlenecek.`) : null),
    el('div', { class: 'row-actions' },
      button('Bugün okudum', { small: true, variant: 'primary', icon: 'plus', onClick: () => openReadDialog(book) }),
      button('SEFER’de aç', { small: true, href: '../sefer/#bugun', attrs: { target } })));
}

function openReadDialog(book) {
  const inp = el('input', { type: 'number', min: 1, max: 2000, inputmode: 'numeric', value: '10', 'aria-label': 'Sayfa sayısı' });
  const embedded = document.documentElement.classList.contains('embedded');
  const dlg = el('dialog', { class: 'dialog' },
    el('h2', {}, 'Bugün kaç sayfa okudun?'),
    el('p', { class: 'muted' }, `${book.title} · Kayıt SEFER’deki “${book.sefer.task}” görevine eklenir; serin ve ilerlemen oradan hesaplanır.`),
    inp,
    el('div', { class: 'row-actions end' },
      button('Vazgeç', { onClick: () => dlg.close() }),
      button('Kaydet', { variant: 'primary', icon: 'check', onClick: () => {
        const n = Math.round(Number(inp.value));
        if (!(n > 0)) { toast('Bir sayfa sayısı yaz.'); return; }
        queuePages(book.id, n);
        dlg.close();
        toast(embedded ? `${n} sayfa SEFER’e kaydedildi.` : `${n} sayfa SEFER’e iletildi; SEFER’i açtığında işlenecek.`, embedded ? {} : { actionLabel: 'SEFER’i aç', action: () => { location.href = '../sefer/#bugun'; } });
        refresh();
      } })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  inp.select();
}

function fact(k, v) { return el('div', {}, el('dt', {}, k), el('dd', {}, v)); }

export function openNoteEditor(bookId, note = null) {
  const ta = el('textarea', { rows: 8, maxlength: 50000, placeholder: 'Bu kitapla ilgili düşüncelerin…' });
  ta.value = note?.text || '';
  const dlg = el('dialog', { class: 'dialog' },
    el('h2', {}, note ? 'Notu düzenle' : 'Kişisel not'),
    el('p', { class: 'muted' }, 'Kitaptan alıntı değil, kendi düşüncen. Alıntılardan ayrı saklanır.'),
    ta,
    el('div', { class: 'row-actions end' },
      button('Vazgeç', { onClick: () => dlg.close() }),
      button('Kaydet', { variant: 'primary', icon: 'check', onClick: async () => {
        try { await saveNote({ id: note?.id, bookId, text: ta.value }); dlg.close(); toast('Not kaydedildi.'); refresh(); }
        catch (e) { toast(e.message, { type: 'error' }); }
      } })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  ta.focus();
}

export { statusLabel };
