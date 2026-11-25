// Görsel hazırlama: açma (EXIF yönü dahil), döndürme, kırpma ve API için optimize etme.
import { el } from './utils.js';

const EDIT_MAX_EDGE = 3200; // düzenleme sırasında bellekte tutulan en büyük kenar

export async function fileToCanvas(file) {
  if (!file) throw new Error('Dosya seçilmedi.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('Lütfen bir görsel dosyası seçin.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Görsel çok büyük (40 MB üstü).');
  let source, w, h;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = source.width; h = source.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img; w = img.naturalWidth; h = img.naturalHeight;
    } catch {
      throw new Error('Bu görsel açılamadı. iPhone HEIC fotoğraflarını JPEG olarak paylaşmayı veya ekran görüntüsü almayı deneyin.');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
  const scale = Math.min(1, EDIT_MAX_EDGE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  source.close?.();
  return c;
}

export function rotateCanvas(src, dir) {
  const c = document.createElement('canvas');
  c.width = src.height; c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function cropCanvas(src, r) {
  const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
  const w = Math.min(src.width - x, Math.round(r.w)), h = Math.min(src.height - y, Math.round(r.h));
  if (w < 40 || h < 40) return src;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

/** API'ye gönderilecek JPEG. Okunabilirliği koruyacak çözünürlükte küçültür. */
export async function canvasToJpeg(src, maxEdge = 2048, quality = 0.85) {
  const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
  let c = src;
  if (scale < 1) {
    c = document.createElement('canvas');
    c.width = Math.round(src.width * scale);
    c.height = Math.round(src.height * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }
  const blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Görsel hazırlanamadı.'))), 'image/jpeg', quality));
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg', bytes: blob.size, width: c.width, height: c.height };
}

/** Küçük kapak görseli (kitap kapağı için). */
export async function fileToCover(file) {
  const c = await fileToCanvas(file);
  return (await canvasToJpeg(c, 480, 0.8)).dataUrl;
}

/**
 * Önizleme + döndürme + kırpma düzenleyicisi.
 * editor.root DOM'a eklenir; editor.load(file), editor.export(maxEdge)
 */
export function createImageEditor({ onChange } = {}) {
  let original = null, current = null, cropMode = false, sel = null, start = null;
  const canvasHolder = el('div', { class: 'editor-canvas' });
  const selection = el('div', { class: 'crop-selection', hidden: true });
  const stage = el('div', { class: 'editor-stage' }, canvasHolder, selection);

  const show = () => {
    canvasHolder.replaceChildren(current);
    current.setAttribute('role', 'img');
    current.setAttribute('aria-label', 'Taranacak sayfanın önizlemesi');
    onChange?.();
  };
  const toCanvasPoint = e => {
    const r = current.getBoundingClientRect();
    return {
      x: Math.min(Math.max(0, e.clientX - r.left), r.width) / r.width * current.width,
      y: Math.min(Math.max(0, e.clientY - r.top), r.height) / r.height * current.height,
    };
  };
  const drawSelection = () => {
    if (!sel) { selection.hidden = true; return; }
    const r = current.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const k = r.width / current.width;
    Object.assign(selection.style, {
      left: `${r.left - sr.left + sel.x * k}px`, top: `${r.top - sr.top + sel.y * k}px`,
      width: `${sel.w * k}px`, height: `${sel.h * k}px`,
    });
    selection.hidden = false;
  };

  stage.addEventListener('pointerdown', e => {
    if (!cropMode || !current) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    start = toCanvasPoint(e);
    sel = { x: start.x, y: start.y, w: 0, h: 0 };
    drawSelection();
  });
  stage.addEventListener('pointermove', e => {
    if (!cropMode || !start) return;
    const p = toCanvasPoint(e);
    sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    drawSelection();
  });
  const end = () => { start = null; onChange?.(); };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => cropMode && drawSelection());

  return {
    root: stage,
    get hasImage() { return !!current; },
    get cropMode() { return cropMode; },
    get hasSelection() { return !!sel && sel.w > 40 && sel.h > 40; },
    async load(file) {
      const c = await fileToCanvas(file);
      original = c; current = c; sel = null; cropMode = false;
      stage.classList.remove('cropping');
      show();
    },
    rotate(dir) { if (!current) return; current = rotateCanvas(current, dir); sel = null; drawSelection(); show(); },
    setCropMode(on) {
      cropMode = !!on && !!current; sel = null; drawSelection();
      stage.classList.toggle('cropping', cropMode);
      onChange?.();
    },
    applyCrop() {
      if (!current || !this.hasSelection) return false;
      current = cropCanvas(current, sel);
      sel = null; cropMode = false; stage.classList.remove('cropping'); drawSelection(); show();
      return true;
    },
    reset() { if (!original) return; current = original; sel = null; cropMode = false; stage.classList.remove('cropping'); drawSelection(); show(); },
    clear() { original = current = sel = null; cropMode = false; canvasHolder.replaceChildren(); selection.hidden = true; onChange?.(); },
    export(maxEdge) { if (!current) throw new Error('Önce bir fotoğraf seçin.'); return canvasToJpeg(current, maxEdge); },
  };
}
