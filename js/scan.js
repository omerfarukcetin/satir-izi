// Tara ekranı: kitap seç → fotoğraf çek/yükle → döndür/kırp → Gemini → onay taslağı.
import { el, uid, nowISO, compareTr, toast, isOnline, formatBytes } from './utils.js';
import { icon } from './icons.js';
import { getSetting, setSetting } from './database.js';
import { state, bookById, saveDraft } from './store.js';
import { navigate } from './router.js';
import { button, pageHeader, emptyState, field, select } from './ui.js';
import { createImageEditor } from './scanner.js';
import { extractHighlights, hasApiKey, getModel } from './gemini.js';
import { addBook } from './books.js';

let activeController = null;
window.addEventListener('hashchange', () => { activeController?.abort(); activeController = null; });

export const QUALITY = { standard: 2048, high: 3072 };

export async function scanView({ params }) {
  if (!state.books.length) {
    return el('section', {}, pageHeader('Sayfa tara'),
      emptyState('Tarama yapmak için önce bir kitap ekle. Alıntılar seçtiğin kitabın arşivine kaydedilir.',
        button('Kitap ekle', { icon: 'plus', variant: 'primary', onClick: addBook })));
  }
  const lastBook = await getSetting('lastBookId', '');
  const quality = await getSetting('scanQuality', 'standard');
  const model = await getModel();
  const reading = state.books.filter(b => b.status === 'okunuyor');
  const preferred = bookById(params.get('kitap'))?.id || bookById(lastBook)?.id || reading[0]?.id || state.books[0].id;

  const books = [...state.books].sort((a, b) => (a.status === 'okunuyor' ? 0 : 1) - (b.status === 'okunuyor' ? 0 : 1) || compareTr(a.title, b.title));
  const bookSel = select(books.map(b => ({ value: b.id, label: `${b.title} — ${b.author}` })), preferred, { 'aria-label': 'Kitap' });
  bookSel.onchange = () => setSetting('lastBookId', bookSel.value);

  const pageInput = el('input', { maxlength: 30, inputmode: 'numeric', placeholder: 'Boş bırakırsan fotoğraftan okunur' });
  const statusEl = el('div', { class: 'scan-status', role: 'status', 'aria-live': 'polite' });
  const errorEl = el('div', { class: 'callout callout-error', role: 'alert', hidden: true });

  const cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const galleryInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const editor = createImageEditor({ onChange: () => updateTools() });

  const rotL = button('', { icon: 'rotateLeft', small: true, title: 'Sola döndür', attrs: { 'aria-label': 'Sola döndür' }, onClick: () => editor.rotate(-1) });
  const rotR = button('', { icon: 'rotateRight', small: true, title: 'Sağa döndür', attrs: { 'aria-label': 'Sağa döndür' }, onClick: () => editor.rotate(1) });
  const cropBtn = button('Kırp', { icon: 'crop', small: true, onClick: () => editor.setCropMode(!editor.cropMode) });
  const applyCrop = button('Kırpmayı uygula', { icon: 'check', small: true, variant: 'primary', onClick: () => editor.applyCrop() });
  const resetBtn = button('Sıfırla', { small: true, variant: 'ghost', onClick: () => editor.reset() });
  const changeBtn = button('Başka fotoğraf', { small: true, variant: 'ghost', icon: 'image', onClick: () => galleryInput.click() });
  const cropHint = el('p', { class: 'muted small', hidden: true }, 'Fotoğraf üzerinde parmağınla veya fareyle sürükleyerek alan seç.');
  const tools = el('div', { class: 'editor-tools', hidden: true }, rotL, rotR, cropBtn, applyCrop, resetBtn, changeBtn);

  const analyzeBtn = button('İşaretli metinleri çıkar', { icon: 'scan', variant: 'primary', onClick: analyze });
  const cancelBtn = button('İptal', { variant: 'ghost', hidden: true, onClick: () => activeController?.abort() });
  cancelBtn.hidden = true;

  const offline = !isOnline();
  const noKey = !hasApiKey();
  const blockers = offline
    ? el('div', { class: 'callout' }, icon('wifiOff'), el('div', {}, el('strong', {}, 'Çevrimdışısın'), el('p', {}, 'Yapay zekâ taraması internet gerektirir. Bu sırada alıntıyı elle ekleyebilirsin.'), button('Elle alıntı ekle', { small: true, href: `#/kitap/${encodeURIComponent(preferred)}` })))
    : noKey ? el('div', { class: 'callout' }, icon('key'), el('div', {}, el('strong', {}, 'Gemini API anahtarı gerekli'), el('p', {}, 'Ücretsiz anahtarını Ayarlar ekranından bir kez girmen yeterli.'), button('Ayarlara git', { small: true, variant: 'primary', href: '#/ayarlar' })))
      : null;

  const picker = el('div', { class: 'dropzone', tabindex: '0' },
    icon('image', { size: 32 }),
    el('p', {}, el('strong', {}, 'Sayfanın fotoğrafını çek veya yükle')),
    el('p', { class: 'muted small' }, 'Sayfayı düz tut, gölgeden kaçın; çizgilerin net görünmesine dikkat et. Bilgisayarda dosyayı buraya sürükleyebilir veya yapıştırabilirsin.'),
    el('div', { class: 'row-actions center' },
      button('Kamera', { icon: 'camera', variant: 'primary', onClick: () => cameraInput.click() }),
      button('Galeriden seç', { icon: 'image', onClick: () => galleryInput.click() })));

  async function loadFile(file) {
    if (!file) return;
    errorEl.hidden = true;
    statusEl.textContent = 'Fotoğraf hazırlanıyor…';
    try {
      await editor.load(file);
      statusEl.textContent = '';
    } catch (e) {
      statusEl.textContent = '';
      showError(e.message);
    }
    updateTools();
  }
  for (const inp of [cameraInput, galleryInput]) inp.onchange = () => { const f = inp.files[0]; inp.value = ''; loadFile(f); };

  const section = el('section', { class: 'scan' });
  section.addEventListener('dragover', e => { e.preventDefault(); picker.classList.add('drag'); });
  section.addEventListener('dragleave', e => { if (!section.contains(e.relatedTarget)) picker.classList.remove('drag'); });
  section.addEventListener('drop', e => {
    e.preventDefault(); picker.classList.remove('drag');
    const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/'));
    if (f) loadFile(f); else toast('Lütfen bir görsel dosyası bırak.');
  });
  const onPaste = e => {
    if (!document.body.contains(section)) { document.removeEventListener('paste', onPaste); return; }
    const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); loadFile(f); }
  };
  document.addEventListener('paste', onPaste);

  function updateTools() {
    const has = editor.hasImage;
    picker.hidden = has;
    tools.hidden = !has;
    editor.root.hidden = !has;
    cropBtn.setAttribute('aria-pressed', String(editor.cropMode));
    applyCrop.hidden = !editor.cropMode;
    applyCrop.disabled = !editor.hasSelection;
    cropHint.hidden = !editor.cropMode;
    analyzeBtn.disabled = !has || offline || noKey || !!activeController || editor.cropMode;
  }

  function showError(message, hint) {
    errorEl.replaceChildren(icon('alert'), el('div', {}, el('strong', {}, message), hint ? el('p', {}, hint) : null));
    errorEl.hidden = false;
  }

  async function analyze() {
    if (!editor.hasImage || activeController) return;
    errorEl.hidden = true;
    const book = bookById(bookSel.value);
    if (!book) { showError('Kitap seçilmedi.'); return; }
    activeController = new AbortController();
    const signal = activeController.signal;
    updateTools();
    cancelBtn.hidden = false;
    [bookSel, pageInput].forEach(x => { x.disabled = true; });
    try {
      statusEl.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Fotoğraf küçültülüyor…');
      const img = await editor.export(QUALITY[quality] || QUALITY.standard);
      statusEl.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), `Gemini sayfayı inceliyor (${formatBytes(img.bytes)})… Bu 10–40 saniye sürebilir.`);
      const result = await extractHighlights({ base64: img.base64, mimeType: img.mimeType, signal });
      const draft = await saveDraft({
        id: uid(), bookId: book.id,
        page: pageInput.value.trim() || result.page,
        items: result.items,
        uncertain: result.uncertain,
        image: img.dataUrl, // geçici: onay/silme sonrasında taslakla birlikte silinir
        model, createdAt: nowISO(),
      });
      await setSetting('lastBookId', book.id);
      activeController = null;
      editor.clear();
      navigate(`onay/${encodeURIComponent(draft.id)}`);
    } catch (e) {
      activeController = null;
      statusEl.textContent = '';
      if (e.code === 'aborted') toast('Tarama iptal edildi.');
      else showError(e.message || 'Bilinmeyen hata', e.hint);
    } finally {
      cancelBtn.hidden = true;
      [bookSel, pageInput].forEach(x => { x.disabled = false; });
      updateTools();
    }
  }

  section.append(...[
    pageHeader('Sayfa tara'),
    blockers,
    field('Hangi kitap?', bookSel),
    picker, cameraInput, galleryInput,
    editor.root, tools, cropHint,
    field('Sayfa numarası (isteğe bağlı)', pageInput),
    errorEl, statusEl,
    el('div', { class: 'row-actions sticky-actions' }, analyzeBtn, cancelBtn),
    el('p', { class: 'muted small privacy-note' }, icon('shield', { size: 16 }),
      ` Fotoğraf yalnızca tarama için Google Gemini’ye (${model}) gönderilir ve kalıcı olarak saklanmaz. Ücretsiz katmanda Google gönderilen içeriği ürünlerini geliştirmek için kullanabilir; özel veya hassas sayfaları tarama.`),
  ].filter(Boolean));
  updateTools();
  return section;
}
