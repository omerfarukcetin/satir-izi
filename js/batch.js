// Toplu tarama ekranları: hazırlık (çoklu fotoğraf), ilerleme ve toplu onay.
import { el, uid, nowISO, toast, confirmDialog, debounce, isOnline, compareTr } from './utils.js';
import { icon } from './icons.js';
import { getSetting, setSetting } from './database.js';
import { state, bookById, jobById, saveJob, getJobPhotos, savePhoto, deletePhotos, deleteJob } from './store.js';
import { navigate, refresh, parse } from './router.js';
import { button, pageHeader, emptyState, field, select } from './ui.js';
import { createImageEditor, prepareBlob, fileToCanvas, rotateCanvas, canvasToJpeg } from './scanner.js';
import { hasApiKey } from './gemini.js';
import { startJob, pauseJob, stopJobNow, retryFailed, onRunnerChange, isRunning, summarize, MAX_ATTEMPTS } from './batch-runner.js';
import { createReviewGroup, saveReviewed, reviewNotice } from './review.js';
import { QUALITY } from './scan.js';
import { addBook } from './books.js';

const MAX_PHOTOS = 60;
const DELAYS = [0, 2, 4, 6, 10, 15, 30, 60];

// Çalıştırıcı ilerledikçe ilgili ekranı tazele
onRunnerChange(jobId => {
  const { parts } = parse();
  if (parts[0] === 'toplu' && parts[1] === jobId && parts[2] !== 'onay') refresh();
  else if (parts[0] === '' || parts[0] === undefined) refresh();
});

// Küçük resimler için nesne URL önbelleği (blob değişince yenilenir)
const thumbs = new Map();
function thumbUrl(p) {
  // IndexedDB her okumada yeni Blob nesnesi döndürür; değişikliği updatedAt ile anla
  const hit = thumbs.get(p.id);
  const ver = `${p.updatedAt}|${p.blob.size}`;
  if (hit && hit.ver === ver) return hit.url;
  if (hit) URL.revokeObjectURL(hit.url);
  const url = URL.createObjectURL(p.blob);
  thumbs.set(p.id, { ver, url });
  return url;
}

const STATUS = {
  pending: { label: 'Bekliyor', cls: '' },
  processing: { label: 'Taranıyor', cls: 'status-okunuyor' },
  done: { label: 'Tamamlandı', cls: 'status-tamamlandi' },
  failed: { label: 'Başarısız', cls: 'status-yarim' },
};

export async function batchView({ parts, params }) {
  if (parts[1] && parts[2] === 'onay') return bulkReviewView(parts[1]);
  if (parts[1]) {
    const job = jobById(parts[1]);
    if (!job) return el('section', {}, pageHeader('Toplu tarama bulunamadı', { back: '#/' }), emptyState('Bu tarama tamamlanıp kaydedilmiş veya silinmiş olabilir.'));
    return job.status === 'draft' ? setupView(job) : progressView(job);
  }
  return setupView(null, params.get('kitap'));
}

// ---------- Fotoğraf ekleme ----------
async function addFiles(job, bookId, files) {
  const images = [...files].filter(f => !f.type || f.type.startsWith('image/'));
  if (!images.length) { toast('Görsel dosyası seçilmedi.'); return job; }
  if (!job) {
    job = await saveJob({ id: uid(), bookId, status: 'draft', order: [], delaySec: await getSetting('batchDelaySec', 4), createdAt: nowISO() });
  }
  const room = MAX_PHOTOS - job.order.length;
  if (images.length > room) toast(`Bir toplu taramada en fazla ${MAX_PHOTOS} fotoğraf olabilir; ilk ${room} tanesi eklendi.`);
  const quality = await getSetting('scanQuality', 'standard');
  const status = document.querySelector('.batch-adding');
  let added = 0, failed = 0;
  for (const [i, file] of images.slice(0, room).entries()) {
    if (status) status.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), ` Fotoğraflar hazırlanıyor… ${i + 1} / ${Math.min(images.length, room)}`);
    try {
      const blob = await prepareBlob(file, QUALITY[quality] || QUALITY.standard);
      const photo = { id: uid(), jobId: job.id, bookId: job.bookId, blob, status: 'pending', error: '', result: null, page: '', attempts: 0, name: file.name || '', createdAt: nowISO() };
      await savePhoto(photo);
      job = await saveJob({ ...jobById(job.id) || job, order: [...(jobById(job.id) || job).order, photo.id] });
      added++;
    } catch { failed++; }
  }
  if (status) status.replaceChildren();
  if (failed) toast(`${failed} dosya açılamadı (HEIC olabilir; JPEG olarak paylaşmayı deneyin).`, { type: 'error' });
  else if (added) toast(`${added} fotoğraf eklendi.`);
  return job;
}

function pickers(onFiles, { compact = false } = {}) {
  const gallery = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  for (const inp of [gallery, camera]) inp.onchange = () => { const files = [...inp.files]; inp.value = ''; if (files.length) onFiles(files); };
  const buttons = el('div', { class: `row-actions${compact ? '' : ' center'}` },
    button(compact ? 'Fotoğraf ekle' : 'Galeriden çoklu seç', { icon: 'image', variant: compact ? 'secondary' : 'primary', small: compact, onClick: () => gallery.click() }),
    button('Kamerayla ekle', { icon: 'camera', small: compact, onClick: () => camera.click() }),
    gallery, camera);
  if (compact) return buttons;
  return el('div', { class: 'dropzone', tabindex: '0' },
    icon('image', { size: 32 }),
    el('p', {}, el('strong', {}, 'Aynı kitabın sayfalarını tek seferde ekle')),
    el('p', { class: 'muted small' }, 'Galeriden birden fazla fotoğraf seçebilir, kamerayla tek tek çekebilir veya bilgisayarda dosyaları buraya sürükleyebilirsin.'),
    buttons);
}

function enableDrop(section, onFiles) {
  section.addEventListener('dragover', e => { e.preventDefault(); section.classList.add('drag'); });
  section.addEventListener('dragleave', e => { if (!section.contains(e.relatedTarget)) section.classList.remove('drag'); });
  section.addEventListener('drop', e => {
    e.preventDefault(); section.classList.remove('drag');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) onFiles(files); else toast('Lütfen görsel dosyaları bırak.');
  });
  const onPaste = e => {
    if (!document.body.contains(section)) { document.removeEventListener('paste', onPaste); return; }
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); onFiles(files); }
  };
  document.addEventListener('paste', onPaste);
}

// ---------- Tek fotoğraf düzenleme (döndür / kırp) ----------
async function rotatePhoto(photo, dir) {
  const quality = await getSetting('scanQuality', 'standard');
  const c = rotateCanvas(await fileToCanvas(photo.blob), dir);
  const { blob } = await canvasToJpeg(c, QUALITY[quality] || QUALITY.standard);
  await savePhoto({ ...photo, blob, status: photo.status === 'done' ? 'pending' : photo.status, result: photo.status === 'done' ? null : photo.result });
}

function openCropDialog(photo) {
  return new Promise(resolve => {
    let changed = false;
    const editor = createImageEditor({ onChange: () => upd() });
    const cropBtn = button('Alan seç', { icon: 'crop', small: true, onClick: () => editor.setCropMode(!editor.cropMode) });
    const apply = button('Kırpmayı uygula', { icon: 'check', small: true, variant: 'primary', onClick: () => { if (editor.applyCrop()) changed = true; } });
    const upd = () => { cropBtn.setAttribute('aria-pressed', String(editor.cropMode)); apply.hidden = !editor.cropMode; apply.disabled = !editor.hasSelection; };
    const save = button('Kaydet', { variant: 'primary', icon: 'check', onClick: async () => {
      if (!changed) { dlg.close(); return; }
      const quality = await getSetting('scanQuality', 'standard');
      const { blob } = await editor.export(QUALITY[quality] || QUALITY.standard);
      await savePhoto({ ...photo, blob, status: photo.status === 'done' ? 'pending' : photo.status, result: photo.status === 'done' ? null : photo.result });
      resolve(true); dlg.close();
    } });
    const dlg = el('dialog', { class: 'dialog dialog-wide' },
      el('h2', {}, 'Fotoğrafı düzenle'),
      editor.root,
      el('div', { class: 'editor-tools' },
        button('', { icon: 'rotateLeft', small: true, attrs: { 'aria-label': 'Sola döndür' }, onClick: () => { editor.rotate(-1); changed = true; } }),
        button('', { icon: 'rotateRight', small: true, attrs: { 'aria-label': 'Sağa döndür' }, onClick: () => { editor.rotate(1); changed = true; } }),
        cropBtn, apply,
        button('Sıfırla', { small: true, variant: 'ghost', onClick: () => { editor.reset(); changed = false; } })),
      el('p', { class: 'muted small' }, 'Kırpmak için “Alan seç”e bas, sonra fotoğraf üzerinde sürükle.'),
      el('div', { class: 'row-actions end' }, button('Vazgeç', { onClick: () => dlg.close() }), save));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(false); });
    document.body.append(dlg);
    dlg.showModal();
    editor.load(photo.blob).then(upd).catch(e => { toast(e.message, { type: 'error' }); dlg.close(); });
  });
}

function photoRow(job, photo, index, total, { editable, onChanged }) {
  const st = STATUS[photo.status] || STATUS.pending;
  const busy = isRunning(job.id) && photo.status === 'processing';
  const move = async dir => {
    const order = [...jobById(job.id).order];
    const i = order.indexOf(photo.id), j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await saveJob({ ...jobById(job.id), order });
    onChanged();
  };
  const found = photo.status === 'done' ? photo.result?.items?.length || 0 : null;
  return el('li', { class: `batch-item is-${photo.status}`, dataset: { id: photo.id } },
    el('span', { class: 'batch-num' }, String(index + 1)),
    el('img', { class: 'batch-thumb', src: thumbUrl(photo), alt: `Fotoğraf ${index + 1}`, loading: 'lazy' }),
    el('div', { class: 'batch-info' },
      el('div', { class: 'row-actions' },
        el('span', { class: `chip ${st.cls}` }, busy ? el('span', { class: 'spinner spinner-sm', 'aria-hidden': 'true' }) : null, st.label),
        found !== null ? el('span', { class: 'muted small' }, `${found} alıntı${photo.result?.page ? ' · s. ' + photo.result.page : ''}`) : null),
      photo.status === 'failed' ? el('p', { class: 'batch-error' }, photo.error, photo.attempts >= MAX_ATTEMPTS ? ' (Birkaç kez denendi; kırparak veya elle eklemeyi düşün.)' : '') : null,
      editable ? el('div', { class: 'row-actions batch-tools' },
        el('button', { class: 'icon-btn icon-btn-ghost', type: 'button', 'aria-label': 'Yukarı taşı', title: 'Yukarı taşı', disabled: index === 0, onclick: () => move(-1) }, icon('up', { size: 18 })),
        el('button', { class: 'icon-btn icon-btn-ghost', type: 'button', 'aria-label': 'Aşağı taşı', title: 'Aşağı taşı', disabled: index === total - 1, onclick: () => move(1) }, icon('down', { size: 18 })),
        el('button', { class: 'icon-btn icon-btn-ghost', type: 'button', 'aria-label': 'Sağa döndür', title: 'Döndür', onclick: async () => { await rotatePhoto(photo, 1); onChanged(); } }, icon('rotateRight', { size: 18 })),
        el('button', { class: 'icon-btn icon-btn-ghost', type: 'button', 'aria-label': 'Kırp', title: 'Kırp / düzenle', onclick: async () => { if (await openCropDialog(photo)) onChanged(); } }, icon('crop', { size: 18 })),
        photo.status === 'failed' ? el('button', { class: 'icon-btn icon-btn-ghost', type: 'button', 'aria-label': 'Yeniden dene', title: 'Yeniden dene', onclick: async () => { await retryFailed(job.id, [photo.id]); onChanged(); } }, icon('rotateLeft', { size: 18 })) : null,
        el('button', { class: 'icon-btn icon-btn-ghost danger', type: 'button', 'aria-label': 'Listeden çıkar', title: 'Listeden çıkar', onclick: async () => {
          if (photo.status === 'done' && !await confirmDialog({ title: 'Fotoğraf çıkarılsın mı?', message: 'Bu fotoğraftan çıkarılan alıntılar da silinecek.', confirmLabel: 'Çıkar', danger: true })) return;
          await deletePhotos(job.id, [photo.id]); onChanged();
        } }, icon('trash', { size: 18 }))) : null));
}

// ---------- Hazırlık ekranı ----------
async function setupView(job, bookParam) {
  if (!state.books.length) {
    return el('section', {}, pageHeader('Toplu tarama'),
      emptyState('Önce bir kitap ekle; sayfalar o kitabın arşivine kaydedilir.', button('Kitap ekle', { icon: 'plus', variant: 'primary', onClick: addBook })));
  }
  const section = el('section', { class: 'batch' });
  let bookId = job?.bookId;
  let bookSel = null;
  if (!job) {
    const lastBook = await getSetting('lastBookId', '');
    const preferred = bookById(bookParam)?.id || bookById(lastBook)?.id || state.books.find(b => b.status === 'okunuyor')?.id || state.books[0].id;
    const books = [...state.books].sort((a, b) => (a.status === 'okunuyor' ? 0 : 1) - (b.status === 'okunuyor' ? 0 : 1) || compareTr(a.title, b.title));
    bookSel = select(books.map(b => ({ value: b.id, label: `${b.title} — ${b.author}` })), preferred, { 'aria-label': 'Kitap' });
    bookId = preferred;
    bookSel.onchange = () => { bookId = bookSel.value; };
  }
  const book = bookById(bookId);
  const onFiles = async files => {
    const j = await addFiles(job ? jobById(job.id) : null, bookId, files);
    await setSetting('lastBookId', bookId);
    if (!job && j) navigate(`toplu/${encodeURIComponent(j.id)}`, { replace: true });
    else refresh();
  };
  enableDrop(section, onFiles);

  const photos = job ? await getJobPhotos(job.id) : [];
  const delaySel = select(DELAYS.map(d => ({ value: String(d), label: d ? `${d} saniye` : 'Beklemeden' })), String(job?.delaySec ?? 4), { 'aria-label': 'İstekler arası bekleme' });
  delaySel.onchange = async () => { const d = Number(delaySel.value); await setSetting('batchDelaySec', d); if (job) await saveJob({ ...jobById(job.id), delaySec: d }); };

  const offline = !isOnline(), noKey = !hasApiKey();
  const startBtn = button(`Taramayı başlat (${photos.length} fotoğraf)`, { icon: 'scan', variant: 'primary', disabled: !photos.length || offline || noKey, onClick: async () => {
    startJob(job.id).catch(e => toast(e.message, { type: 'error' }));
    refresh();
  } });

  section.append(...[
    pageHeader('Toplu tarama', { back: book ? `#/kitap/${encodeURIComponent(book.id)}` : '#/tara', subtitle: job ? `${book?.title} · ${book?.author}` : 'Aynı kitabın birden fazla sayfasını sırayla tara.' }),
    offline ? el('div', { class: 'callout' }, icon('wifiOff'), el('div', {}, el('strong', {}, 'Çevrimdışısın'), el('p', {}, 'Fotoğrafları şimdi ekleyebilirsin; tarama internet gelince başlatılabilir.'))) : null,
    noKey ? el('div', { class: 'callout' }, icon('key'), el('div', {}, el('strong', {}, 'Gemini API anahtarı gerekli'), el('p', {}, 'Fotoğrafları ekleyebilirsin; taramayı başlatmak için anahtarını Ayarlar’dan gir.'), button('Ayarlara git', { small: true, href: '#/ayarlar' }))) : null,
    bookSel ? field('Hangi kitap?', bookSel) : null,
    photos.length ? pickers(onFiles, { compact: true }) : pickers(onFiles),
    el('p', { class: 'batch-adding scan-status', role: 'status', 'aria-live': 'polite' }),
    photos.length ? el('ol', { class: 'batch-list' }, photos.map((p, i) => photoRow(job, p, i, photos.length, { editable: true, onChanged: () => refresh() }))) : null,
    photos.length ? el('div', { class: 'card' },
      field('İstekler arasında bekleme', delaySel, 'Ücretsiz katmanın dakikalık istek sınırını aşmamak için. Kota hatası alırsan süreyi artır.'),
      el('ul', { class: 'plain-list muted small' },
        el('li', {}, `${photos.length} fotoğraf = ${photos.length} Gemini isteği. Günlük ücretsiz kota dolarsa tarama duraklar; tamamlananlar kaybolmaz, sonra kaldığın yerden devam edersin.`),
        el('li', {}, 'Tarama sırasında ekranı açık ve uygulamayı önde tut. Telefon kilitlenir veya başka uygulamaya geçersen tarayıcı taramayı durdurabilir.'),
        el('li', {}, 'Fotoğraflar yalnızca tarama için Google Gemini’ye gönderilir ve kaydettikten sonra silinir.'))) : null,
    photos.length ? el('div', { class: 'sticky-footer' },
      button('Vazgeç ve sil', { variant: 'ghost-danger', icon: 'trash', onClick: async () => {
        if (!await confirmDialog({ title: 'Toplu tarama silinsin mi?', message: 'Eklenen fotoğraflar silinecek.', confirmLabel: 'Sil', danger: true })) return;
        await deleteJob(job.id); navigate(`kitap/${encodeURIComponent(job.bookId)}`, { replace: true });
      } }),
      startBtn) : null,
  ].filter(Boolean));
  return section;
}

// ---------- İlerleme ekranı ----------
async function progressView(job) {
  const book = bookById(job.bookId);
  const photos = await getJobPhotos(job.id);
  const s = summarize(photos);
  const running = isRunning(job.id) && job.status === 'running';
  const offline = !isOnline(), noKey = !hasApiKey();
  const section = el('section', { class: 'batch' });
  const onFiles = async files => { await addFiles(jobById(job.id), job.bookId, files); refresh(); };
  if (!running) enableDrop(section, onFiles);

  const fill = el('span');
  fill.style.width = `${s.pct}%`;
  const stat = (n, label, cls = '') => el('div', { class: `stat ${cls}` }, el('strong', {}, String(n)), el('span', {}, label));
  const statusBox = running
    ? el('div', { class: 'callout callout-soft' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }),
      el('div', {}, el('strong', {}, `Taranıyor… ${s.done + s.failed + 1} / ${s.total}`),
        el('p', { class: 'small' }, 'Ekranı açık ve uygulamayı önde tut. İstersen duraklatıp daha sonra devam edebilirsin.')))
    : job.status === 'done' && !s.pending && !s.failed
      ? el('div', { class: 'callout callout-ok' }, icon('check'), el('div', {}, el('strong', {}, 'Bütün fotoğraflar tarandı.'), el('p', { class: 'small' }, 'Alıntıları kontrol edip kaydedebilirsin.')))
      : job.pauseReason ? el('div', { class: 'callout' }, icon('alert'), el('div', {}, el('strong', {}, 'Tarama duraklatıldı'), el('p', {}, job.pauseReason))) : null;

  const actions = [];
  if (running) {
    actions.push(button('Duraklat', { onClick: () => pauseJob(job.id), title: 'Şu anki fotoğraf bitince durur' }));
    actions.push(button('Hemen durdur', { variant: 'ghost-danger', onClick: () => stopJobNow(job.id) }));
  } else {
    if (s.pending) actions.push(button(`Devam et (${s.pending} bekliyor)`, { icon: 'scan', variant: 'primary', disabled: offline || noKey, onClick: () => { startJob(job.id).catch(e => toast(e.message, { type: 'error' })); } }));
    if (s.failed) actions.push(button(`Başarısızları yeniden dene (${s.failed})`, { icon: 'rotateLeft', onClick: async () => { await retryFailed(job.id); startJob(job.id).catch(e => toast(e.message, { type: 'error' })); } }));
  }
  const reviewBtn = s.done ? button(`Sonuçları kontrol et (${s.quotes} alıntı, ${s.done} sayfa)`, { icon: 'check', variant: s.pending && !running ? 'secondary' : 'primary', href: `#/toplu/${encodeURIComponent(job.id)}/onay` }) : null;

  section.append(...[
    pageHeader('Toplu tarama', { back: `#/kitap/${encodeURIComponent(job.bookId)}`, subtitle: `${book?.title || ''} · ${book?.author || ''}` }),
    el('div', { class: 'stats stats-6' },
      stat(s.total, 'Toplam'), stat(s.done, 'Tamamlanan'), stat(s.pending + s.processing, 'Bekleyen'),
      stat(s.failed, 'Başarısız', s.failed ? 'stat-bad' : ''), stat(s.quotes, 'Bulunan alıntı'), stat(`%${s.pct}`, 'İlerleme')),
    el('div', { class: 'progress progress-lg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(s.pct), 'aria-label': 'Tarama ilerlemesi' }, fill),
    statusBox,
    offline && !running ? el('p', { class: 'muted small' }, 'Çevrimdışısın; devam etmek için internet gerekiyor.') : null,
    noKey && !running ? el('p', { class: 'muted small' }, 'Devam etmek için Ayarlar’dan Gemini API anahtarını gir.') : null,
    el('div', { class: 'row-actions' }, actions, reviewBtn),
    el('div', { class: 'section-head' }, el('h2', {}, 'Fotoğraflar'), !running ? pickers(onFiles, { compact: true }) : null),
    el('p', { class: 'batch-adding scan-status', role: 'status', 'aria-live': 'polite' }),
    el('ol', { class: 'batch-list' }, photos.map((p, i) => photoRow(job, p, i, photos.length, { editable: !running, onChanged: () => refresh() }))),
    !running ? el('div', { class: 'row-actions end' }, button('Toplu taramayı sil', { variant: 'ghost-danger', icon: 'trash', onClick: async () => {
      if (!await confirmDialog({ title: 'Toplu tarama silinsin mi?', message: s.done ? `${s.quotes} alıntı henüz kaydedilmedi; fotoğraflarla birlikte silinecek.` : 'Eklenen fotoğraflar silinecek.', confirmLabel: 'Sil', danger: true })) return;
      await deleteJob(job.id); toast('Toplu tarama silindi.'); navigate(`kitap/${encodeURIComponent(job.bookId)}`, { replace: true });
    } })) : null,
  ].filter(Boolean));
  return section;
}

// ---------- Toplu onay ----------
async function bulkReviewView(jobId) {
  const job = jobById(jobId);
  const book = job && bookById(job.bookId);
  if (!job || !book) return el('section', {}, pageHeader('Toplu tarama bulunamadı', { back: '#/' }), emptyState('Bu tarama kaydedilmiş veya silinmiş olabilir.'));
  if (isRunning(jobId)) return el('section', {}, pageHeader('Tarama sürüyor', { back: `#/toplu/${encodeURIComponent(jobId)}` }), emptyState('Sonuçları kontrol etmek için taramanın bitmesini bekle veya duraklat.'));
  const all = await getJobPhotos(jobId);
  const photos = all.filter(p => p.status === 'done' && p.result);
  if (!photos.length) return el('section', {}, pageHeader('Kontrol edilecek sonuç yok', { back: `#/toplu/${encodeURIComponent(jobId)}` }), emptyState('Henüz tamamlanmış bir tarama yok.'));

  let closed = false;
  const saveBtn = button('Seçilenleri kaydet', { variant: 'primary', icon: 'check' });
  const groups = [];
  const updateCount = () => {
    const n = groups.reduce((t, g) => t + g.group.selected().length, 0);
    saveBtn.querySelector('span').textContent = `Seçilenleri kaydet (${n})`;
    saveBtn.disabled = n === 0 && !groups.length;
  };
  photos.forEach((p, i) => {
    const persist = debounce(() => {
      if (closed) return;
      savePhoto({ ...p, page: g.getPage(), result: { ...p.result, items: g.getItems() } }).catch(() => {});
    }, 500);
    const g = createReviewGroup({
      book, compact: true,
      title: `Fotoğraf ${all.indexOf(p) + 1}`,
      imageSrc: thumbUrl(p),
      page: p.page || p.result.page,
      uncertain: p.result.uncertain,
      items: p.result.items,
      onChange: () => { updateCount(); persist(); },
    });
    groups.push({ photo: p, group: g });
  });
  updateCount();
  saveBtn.disabled = false;

  const remaining = all.length - photos.length;
  saveBtn.onclick = async () => {
    const entries = groups.flatMap(({ group }) => group.selected().map(item => ({ page: group.getPage(), item })));
    try {
      saveBtn.disabled = true;
      closed = true;
      const saved = await saveReviewed(book, entries);
      if (saved === null) { closed = false; saveBtn.disabled = false; return; }
      // Onaylanan sayfaların fotoğrafları silinir; taranmamış/başarısız olanlar işte kalır
      const left = await deletePhotos(jobId, photos.map(p => p.id));
      if (!left || !left.order.length) await deleteJob(jobId);
      else if (left.status === 'done') await saveJob({ ...left, status: 'paused', pauseReason: `${left.order.length} fotoğraf henüz taranmadı veya başarısız oldu.` });
      toast(saved.length ? `${saved.length} alıntı kaydedildi.` : 'Yeni alıntı kaydedilmedi.');
      navigate(left?.order.length ? `toplu/${encodeURIComponent(jobId)}` : `kitap/${encodeURIComponent(book.id)}`, { replace: true });
    } catch (e) {
      closed = false;
      saveBtn.disabled = false;
      toast('Kaydedilemedi: ' + e.message, { type: 'error' });
    }
  };

  return el('section', { class: 'review' },
    pageHeader('Toplu onay', { back: `#/toplu/${encodeURIComponent(jobId)}`, subtitle: `${book.title} · ${photos.length} sayfa` }),
    reviewNotice(),
    remaining ? el('p', { class: 'muted small' }, `${remaining} fotoğraf henüz taranmadı veya başarısız oldu; onlar bu kayıttan sonra listede kalır.`) : null,
    el('div', { class: 'bulk-groups' }, groups.map(({ group }) => el('div', { class: 'bulk-group card' }, group.root))),
    el('div', { class: 'sticky-footer' },
      button('Geri', { variant: 'ghost', href: `#/toplu/${encodeURIComponent(jobId)}` }),
      saveBtn));
}
