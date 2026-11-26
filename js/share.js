// Alıntı kartı: alıntıyı kitap adı ve yazarla birlikte paylaşılabilir bir görsele çevirir (canvas, çevrimdışı çalışır).
import { el, toast, download, slugify } from './utils.js';
import { icon } from './icons.js';
import { bookById } from './store.js';
import { button } from './ui.js';

export const FORMATS = [
  { id: 'post', label: 'Gönderi 4:5', w: 1080, h: 1350 },
  { id: 'story', label: 'Hikâye 9:16', w: 1080, h: 1920 },
  { id: 'square', label: 'Kare', w: 1080, h: 1080 },
];
// Renkler Sefer ile aynı (Gece / Gündüz) + sıcak kâğıt teması
export const THEMES = [
  { id: 'gece', label: 'Gece', bg: '#13294b', bg2: '#1a3561', ink: '#f7f3ea', soft: '#a9b8d3', accent: '#e8b03c', mark: '#2bb3b1' },
  { id: 'gunduz', label: 'Gündüz', bg: '#eef2f8', bg2: '#ffffff', ink: '#15264a', soft: '#5a6a86', accent: '#128a88', mark: '#d99a1e' },
  { id: 'kagit', label: 'Kâğıt', bg: '#f4ecdd', bg2: '#fbf6ec', ink: '#2b2418', soft: '#7a6a52', accent: '#9a6a45', mark: '#c9a36a' },
];
const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

// Kapak görseli: veri adresi her zaman çizilebilir; uzak adres yalnızca site CORS izni verirse
// (yoksa tuval "kirlenir" ve PNG alınamaz — bu durumda kapaksız devam edilir).
const coverCache = new Map();
export function loadCover(src) {
  if (!src) return Promise.resolve(null);
  if (!coverCache.has(src)) {
    coverCache.set(src, new Promise(resolve => {
      const img = new Image();
      if (!src.startsWith('data:')) { img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; }
      const t = setTimeout(() => resolve(null), 8000);
      img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 20 && img.naturalHeight > 20 ? img : null); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = src;
    }));
  }
  return coverCache.get(src);
}

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

/** Kapağı gölgeli, köşeleri yuvarlatılmış bir "kitap" olarak çizer (görseli kutuya kırparak sığdırır). */
function drawCover(x, img, X, Y, w, h, T) {
  const r = Math.round(w * 0.05);
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.38)'; x.shadowBlur = w * 0.22; x.shadowOffsetY = w * 0.08;
  roundRect(x, X, Y, w, h, r); x.fillStyle = T.bg2; x.fill();
  x.restore();
  x.save();
  roundRect(x, X, Y, w, h, r); x.clip();
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  x.drawImage(img, X + (w - iw) / 2, Y + (h - ih) / 2, iw, ih);
  // sırt gölgesi: basılı kitap hissi
  const g = x.createLinearGradient(X, 0, X + w * 0.12, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(X, Y, w * 0.12, h);
  x.restore();
  x.save();
  roundRect(x, X + 0.5, Y + 0.5, w - 1, h - 1, r);
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 2; x.stroke();
  x.restore();
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split(/\n+/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Kartı çizer ve canvas döner. */
export async function drawCard(h, { format = 'post', theme = 'gece', cover = false } = {}) {
  const F = FORMATS.find(f => f.id === format) || FORMATS[0];
  const T = THEMES.find(t => t.id === theme) || THEMES[0];
  const book = bookById(h.bookId) || {};
  try { await Promise.all([document.fonts.load(`600 48px ${FONT}`), document.fonts.load(`800 30px ${FONT}`)]); } catch { /* sistem yazı tipine düşer */ }
  const c = document.createElement('canvas');
  c.width = F.w; c.height = F.h;
  const x = c.getContext('2d');
  const pad = Math.round(F.w * 0.1);
  const coverImg = cover ? await loadCover(book.cover) : null;
  c.dataset.cover = !cover ? 'off' : coverImg ? 'ok' : 'fail';

  // Zemin ve iç kart
  const g = x.createLinearGradient(0, 0, F.w, F.h);
  g.addColorStop(0, T.bg); g.addColorStop(1, T.bg2);
  x.fillStyle = g; x.fillRect(0, 0, F.w, F.h);
  x.strokeStyle = T.mark; x.globalAlpha = 0.35; x.lineWidth = 3;
  x.strokeRect(pad / 2, pad / 2, F.w - pad, F.h - pad);
  x.globalAlpha = 1;

  // Büyük tırnak işareti
  x.fillStyle = T.accent;
  x.font = `800 ${Math.round(F.w * 0.2)}px ${FONT}`;
  x.textBaseline = 'top';
  x.fillText('“', pad - 6, pad * 0.75);

  // Alt bölüm (kaynak) yerleşimi: kapak varsa solda kitap, sağda ad/yazar
  const maxW = F.w - pad * 2;
  const top = pad + F.w * 0.17;
  let footerTop, cv = null;
  if (coverImg) {
    const ch = Math.round(F.w * (F.id === 'story' ? 0.36 : F.id === 'square' ? 0.2 : 0.24));
    const ratio = Math.min(0.78, Math.max(0.6, coverImg.naturalWidth / coverImg.naturalHeight));
    cv = { w: Math.round(ch * ratio), h: ch, x: pad, y: F.h - pad - ch };
    footerTop = cv.y - F.w * 0.02;
  } else {
    footerTop = F.h - F.w * 0.24 - pad * 0.1;
  }
  const maxH = footerTop - top - pad * 0.5;

  // Metni sığacak en büyük boyutta yerleştir
  let size = 64, lines, lh;
  for (; size >= 28; size -= 2) {
    x.font = `600 ${size}px ${FONT}`;
    lh = size * 1.42;
    lines = wrap(x, h.text, maxW);
    if (lines.length * lh <= maxH) break;
  }
  const maxLines = Math.max(1, Math.floor(maxH / lh));
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+\S*$/, '') + ' …'; }
  x.fillStyle = T.ink;
  x.font = `600 ${size}px ${FONT}`;
  const blockH = lines.length * lh;
  let y = top + Math.max(0, (maxH - blockH) / 2.4);
  for (const l of lines) { x.fillText(l, pad, y); y += lh; }

  // Ayraç + kaynak
  const titleSize = Math.round(F.w * 0.034), metaSize = Math.round(F.w * 0.028), titleLh = F.w * 0.044;
  const meta = [book.author, h.page ? `s. ${h.page}` : ''].filter(Boolean).join(' · ');
  if (cv) {
    drawCover(x, coverImg, cv.x, cv.y, cv.w, cv.h, T);
    const tx = cv.x + cv.w + F.w * 0.05, tw = F.w - pad - tx;
    x.font = `800 ${titleSize}px ${FONT}`;
    const title = wrap(x, book.title || '', tw).slice(0, 3);
    x.font = `600 ${metaSize}px ${FONT}`;
    const metaLines = wrap(x, meta, tw).slice(0, 2);
    const blk = 6 + 26 + title.length * titleLh + metaLines.length * metaSize * 1.35;
    let ty = cv.y + Math.max(0, (cv.h - blk) / 2);
    x.fillStyle = T.accent; x.fillRect(tx, ty, F.w * 0.07, 6);
    ty += 32;
    x.fillStyle = T.ink; x.font = `800 ${titleSize}px ${FONT}`;
    for (const l of title) { x.fillText(l, tx, ty); ty += titleLh; }
    x.fillStyle = T.soft; x.font = `600 ${metaSize}px ${FONT}`;
    for (const l of metaLines) { x.fillText(l, tx, ty + 4); ty += metaSize * 1.35; }
  } else {
    x.fillStyle = T.accent;
    x.fillRect(pad, footerTop, F.w * 0.09, 6);
    x.fillStyle = T.ink;
    x.font = `800 ${titleSize}px ${FONT}`;
    const title = wrap(x, book.title || '', maxW).slice(0, 2);
    let ty = footerTop + 32;
    for (const l of title) { x.fillText(l, pad, ty); ty += titleLh; }
    x.fillStyle = T.soft;
    x.font = `600 ${metaSize}px ${FONT}`;
    x.fillText(meta, pad, ty + 4);
  }

  // Marka
  x.font = `700 ${Math.round(F.w * 0.022)}px ${FONT}`;
  x.fillStyle = T.soft; x.globalAlpha = 0.8;
  x.textAlign = 'right';
  x.fillText('Satır İzi', F.w - pad, F.h - pad * (cv ? 0.85 : 0.95));
  x.textAlign = 'left'; x.globalAlpha = 1;
  return c;
}

const toBlob = c => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Görsel hazırlanamadı.'))), 'image/png'));

export function openShareDialog(h) {
  const book = bookById(h.bookId) || {};
  const hasCover = !!book.cover;
  const state = { format: 'post', theme: 'gece', cover: hasCover ? 'on' : 'off' };
  const coverNote = el('p', { class: 'muted small', hidden: true }, 'Bu kitabın kapağı karta eklenemiyor: kapak, izin vermeyen bir siteden geliyor. Kitabı düzenleyip kapağı yeniden çekmeyi ya da fotoğraf yüklemeyi deneyebilirsin.');
  const preview = el('div', { class: 'share-preview' });
  let current = null;
  const render = async () => {
    current = await drawCard(h, { ...state, cover: state.cover === 'on' });
    coverNote.hidden = current.dataset.cover !== 'fail';
    current.classList.add('share-canvas');
    current.setAttribute('role', 'img');
    current.setAttribute('aria-label', 'Alıntı kartı önizlemesi');
    preview.replaceChildren(current);
  };
  const seg = (items, key) => {
    const wrapEl = el('div', { class: 'chips seg', role: 'group' });
    for (const it of items) {
      const b = el('button', { type: 'button', class: 'chip-btn chip-sm', 'aria-pressed': String(state[key] === it.id) }, it.label);
      b.onclick = () => { state[key] = it.id; wrapEl.querySelectorAll('button').forEach(z => z.setAttribute('aria-pressed', String(z === b))); render(); };
      wrapEl.append(b);
    }
    return wrapEl;
  };
  const fileName = () => `satir-izi-${slugify(book.title || 'alinti')}${h.page ? '-s' + h.page : ''}.png`;
  const canShareFiles = !!(navigator.canShare && navigator.share);
  const shareBtn = button(canShareFiles ? 'Paylaş' : 'PNG indir', { variant: 'primary', icon: canShareFiles ? 'share' : 'download', onClick: async () => {
    try {
      const blob = await toBlob(current);
      const file = new File([blob], fileName(), { type: 'image/png' });
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: book.title || 'Alıntı', text: `“${h.text.slice(0, 200)}${h.text.length > 200 ? '…' : ''}” — ${book.author || ''}, ${book.title || ''}` });
      } else {
        download(fileName(), blob);
        toast('Kart indirildi.');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Paylaşılamadı: ' + (e.message || e), { type: 'error' });
    }
  } });
  const dlBtn = canShareFiles ? button('İndir', { icon: 'download', onClick: async () => { download(fileName(), await toBlob(current)); toast('Kart indirildi.'); } }) : null;
  const dlg = el('dialog', { class: 'dialog dialog-wide share-dialog' },
    el('h2', {}, 'Alıntı kartı'),
    preview,
    el('span', { class: 'field-label' }, 'Biçim'), seg(FORMATS, 'format'),
    el('span', { class: 'field-label seg-label' }, 'Tema'), seg(THEMES, 'theme'),
    hasCover ? [el('span', { class: 'field-label seg-label' }, 'Kitap kapağı'), seg([{ id: 'on', label: 'Ekle' }, { id: 'off', label: 'Ekleme' }], 'cover'), coverNote] : null,
    el('p', { class: 'muted small' }, canShareFiles ? 'Paylaş menüsünden WhatsApp, Instagram veya başka bir uygulamayı seçebilirsin.' : 'Bu tarayıcı doğrudan paylaşımı desteklemiyor; kartı indirip istediğin yerde paylaşabilirsin.'),
    el('div', { class: 'row-actions end sticky-actions' }, button('Kapat', { variant: 'ghost', onClick: () => dlg.close() }), dlBtn, shareBtn));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  render();
}
