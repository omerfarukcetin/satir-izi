// Alıntı kartı: alıntıyı kitap adı ve yazarla birlikte paylaşılabilir bir görsele çevirir (canvas, çevrimdışı çalışır).
// Seçenekler: biçim, düzen, renk paleti, arka plan türü (degrade/düz/desen/kitap kapağı/kendi fotoğrafın), özel renkler,
// yazı tipi, yazı boyutu, hizalama (sola/ortaya/sağa/iki yana) ve kartta görünecek bilgiler.
import { el, toast, download, slugify } from './utils.js';
import { icon } from './icons.js';
import { bookById } from './store.js';
import { button } from './ui.js';

export const FORMATS = [
  { id: 'post', label: 'Gönderi 4:5', w: 1080, h: 1350 },
  { id: 'story', label: 'Hikâye 9:16', w: 1080, h: 1920 },
  { id: 'square', label: 'Kare', w: 1080, h: 1080 },
  { id: 'wide', label: 'Yatay 16:9', w: 1600, h: 900 },
];
// Renk paletleri: iki zemin rengi (degrade), yazı, soluk yazı, vurgu
export const THEMES = [
  { id: 'gece', label: 'Gece', bg: '#13294b', bg2: '#1a3561', ink: '#f7f3ea', soft: '#a9b8d3', accent: '#e8b03c' },
  { id: 'gunduz', label: 'Gündüz', bg: '#eef2f8', bg2: '#ffffff', ink: '#15264a', soft: '#5a6a86', accent: '#128a88' },
  { id: 'kagit', label: 'Kâğıt', bg: '#f4ecdd', bg2: '#fbf6ec', ink: '#2b2418', soft: '#7a6a52', accent: '#9a6a45' },
  { id: 'zumrut', label: 'Zümrüt', bg: '#0f2a24', bg2: '#1d4a3f', ink: '#f2efe4', soft: '#a7c0b6', accent: '#e6b84f' },
  { id: 'siyah', label: 'Siyah', bg: '#0b0d10', bg2: '#1c2026', ink: '#eceae4', soft: '#9aa0aa', accent: '#e9b44a' },
  { id: 'kum', label: 'Kum', bg: '#ece4d6', bg2: '#f6f1e7', ink: '#3a2f24', soft: '#7d6d5a', accent: '#a8641e' },
  { id: 'gul', label: 'Gül', bg: '#f7e3e3', bg2: '#f0cdd5', ink: '#4a1f2b', soft: '#8a5a66', accent: '#b3475f' },
  { id: 'lavanta', label: 'Lavanta', bg: '#2a2347', bg2: '#4b3f7a', ink: '#f1ecff', soft: '#bdb3e0', accent: '#f0c46b' },
  { id: 'okyanus', label: 'Okyanus', bg: '#0b3a53', bg2: '#1b6b80', ink: '#effaff', soft: '#a8d3df', accent: '#ffd27a' },
  { id: 'gunbatimi', label: 'Gün batımı', bg: '#f39c5a', bg2: '#b8406a', ink: '#fff8ef', soft: '#ffe3d2', accent: '#fff1b8' },
];
export const LAYOUTS = [
  { id: 'klasik', label: 'Klasik' }, { id: 'ortali', label: 'Ortalı' }, { id: 'kapak', label: 'Kapak üstte' },
  { id: 'minimal', label: 'Sade' }, { id: 'kart', label: 'Kart' },
];
export const BACKGROUNDS = [
  { id: 'renk', label: 'Degrade' }, { id: 'duz', label: 'Düz' }, { id: 'desen', label: 'Desenli' },
  { id: 'kapak', label: 'Kitap kapağı' }, { id: 'foto', label: 'Fotoğrafım' },
];
export const ALIGNS = [
  { id: 'left', label: 'Sola yasla', icon: 'alignLeft' }, { id: 'center', label: 'Ortala', icon: 'alignCenter' },
  { id: 'right', label: 'Sağa yasla', icon: 'alignRight' }, { id: 'justify', label: 'İki yana yasla', icon: 'alignJustify' },
];
const SANS = (w, s) => `${w} ${s}px "Plus Jakarta Sans", system-ui, sans-serif`;
const SERIF = (w, s, it = false) => `${it ? 'italic ' : ''}${w >= 700 ? 700 : 500} ${s}px Georgia, "Noto Serif", "Times New Roman", serif`;
export const FONTS = [
  { id: 'sans', label: 'Modern', css: SANS },
  { id: 'serif', label: 'Klasik', css: (w, s) => SERIF(w, s) },
  { id: 'italic', label: 'İtalik', css: (w, s) => SERIF(w, s, true) },
];
export const SIZES = [{ id: 's', label: 'Küçük', k: 0.82 }, { id: 'm', label: 'Orta', k: 1 }, { id: 'l', label: 'Büyük', k: 1.2 }];
const PREF_KEY = 'satir-izi-card';

export const DEFAULTS = {
  format: 'post', layout: 'klasik', theme: 'gece', bg: 'renk', align: 'left', font: 'sans', size: 'm',
  custom: null, // { bg: '#rrggbb', ink: '#rrggbb' | null } — seçilirse paletin yerine geçer
  show: { title: true, author: true, page: true, cover: true, brand: true },
};

// ---- yardımcılar
const coverCache = new Map();
export function loadCover(src) {
  if (!src) return Promise.resolve(null);
  if (!coverCache.has(src)) {
    coverCache.set(src, new Promise(resolve => {
      const img = new Image();
      // Uzak adres yalnızca site CORS izni verirse çizilebilir (yoksa tuval "kirlenir" ve PNG alınamaz)
      if (!src.startsWith('data:') && !src.startsWith('blob:')) { img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; }
      const t = setTimeout(() => resolve(null), 8000);
      img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 20 && img.naturalHeight > 20 ? img : null); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = src;
    }));
  }
  return coverCache.get(src);
}
const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [128, 128, 128]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const shade = (h, f) => { const [r, g, b] = hex2rgb(h); const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join(''); };
const alpha = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };

// ---- Kapakla uyumlu paletler: kapağın baskın, ikincil ve canlı rengi cihazda çıkarılır
const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl(h, s, l) {
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Rengi, zemine karşı en az `min` kontrast verecek kadar açar/koyulaştırır */
function readable(col, bgs, min, dir) {
  let [h, s, l] = rgb2hsl(...hex2rgb(col));
  for (let i = 0; i < 40 && bgs.some(b => contrast(hsl(h, s, l), b) < min); i++) l += dir * 0.02;
  return hsl(h, s, l);
}
export const COVER_THEMES = [{ id: 'kapak-koyu', label: 'Koyu' }, { id: 'kapak-acik', label: 'Açık' }, { id: 'kapak-canli', label: 'Canlı' }];
const paletteCache = new WeakMap();
export function coverPalettes(img) {
  if (paletteCache.has(img)) return paletteCache.get(img);
  const N = 48, c = document.createElement('canvas'); c.width = N; c.height = N;
  const cx = c.getContext('2d'); drawFit(cx, img, 0, 0, N, N);
  let data;
  try { data = cx.getImageData(0, 0, N, N).data; } catch { return null; } // izin vermeyen uzak görsel
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const k = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4);
    const b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 }; b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; buckets.set(k, b);
  }
  const cols = [...buckets.values()].map(b => { const r = b.r / b.n, g = b.g / b.n, bl = b.b / b.n; const [h, s, l] = rgb2hsl(r, g, bl); return { n: b.n, h, s, l, hex: toHex(r, g, bl) }; }).sort((a, b) => b.n - a.n);
  if (!cols.length) return null;
  const dom = cols.find(c => c.l > 0.06 && c.l < 0.94) || cols[0];
  const total = cols.reduce((a, c) => a + c.n, 0);
  // Canlı renk sayılması için kapağın en az %2'sini kaplamalı (JPEG kenar lekeleri sayılmasın)
  const vividRaw = [...cols].filter(c => c.s > 0.3 && c.l > 0.2 && c.l < 0.82 && c.n >= total * 0.02).sort((a, b) => b.n * b.s * b.s - a.n * a.s * a.s)[0];
  const mono = !vividRaw && dom.s < 0.2; // renksiz (siyah-beyaz) kapak
  const vivid = vividRaw || dom;
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const second = cols.find(c => c !== dom && c.n >= total * 0.02 && (hueGap(c.h, dom.h) > 35 || Math.abs(c.l - dom.l) > 0.3)) || dom;
  const warm = '#e8b03c'; // renksiz kapakta vurgu
  const out = {};
  { // Koyu: baskın rengin koyu tonu, vurgu canlı rengin açık tonu
    const bg = hsl(dom.h, Math.min(dom.s, 0.6), 0.13), bg2 = hsl((dom.h + 12) % 360, Math.min(dom.s, 0.6), 0.23);
    const ink = '#f8f5ee';
    out['kapak-koyu'] = { bg, bg2, ink, soft: alpha(ink, 0.74), accent: mono ? warm : readable(hsl(vivid.h, Math.max(vivid.s, 0.5), 0.62), [bg, bg2], 3, 1) };
  }
  { // Açık: baskın rengin çok açık tonu, yazı aynı rengin koyusu
    const bg = hsl(dom.h, Math.min(dom.s, 0.45) * 0.6, 0.92), bg2 = hsl((dom.h + 12) % 360, Math.min(dom.s, 0.45) * 0.5, 0.97);
    const ink = readable(hsl(dom.h, Math.min(dom.s, 0.5), 0.16), [bg, bg2], 7, -1);
    out['kapak-acik'] = { bg, bg2, ink, soft: alpha(ink, 0.7), accent: mono ? '#9a6a12' : readable(hsl(vivid.h, Math.max(vivid.s, 0.5), 0.4), [bg, bg2], 3, -1) };
  }
  { // Canlı: zemin kapağın en canlı rengi; yazı beyaz ya da koyu (hangisi okunaklıysa). Renksiz kapakta siyah zemin.
    let bg, bg2;
    if (mono) { bg = '#121212'; bg2 = '#2a2a2a'; }
    else {
      bg = hsl(vivid.h, Math.max(vivid.s, 0.45), Math.min(0.46, Math.max(0.3, vivid.l)));
      bg2 = hsl((vivid.h + 18) % 360, Math.max(vivid.s, 0.45), Math.max(0.2, Math.min(0.46, vivid.l) - 0.12));
    }
    const light = '#ffffff', dark = '#14110d';
    const ink = Math.min(contrast(light, bg), contrast(light, bg2)) >= Math.min(contrast(dark, bg), contrast(dark, bg2)) ? light : dark;
    // yazı en az 4.5:1 okunsun diye zemin gerekirse koyulaştırılır/açılır
    bg = readable(bg, [ink], 4.5, ink === light ? -1 : 1); bg2 = readable(bg2, [ink], 4.5, ink === light ? -1 : 1);
    const acc = mono ? warm : ink === light ? readable(hsl(second.h, 0.6, 0.8), [bg, bg2], 3, 1) : readable(hsl(second.h, 0.6, 0.2), [bg, bg2], 3, -1);
    out['kapak-canli'] = { bg, bg2, ink, soft: alpha(ink, 0.78), accent: acc };
  }
  for (const k of Object.keys(out)) out[k] = { id: k, label: COVER_THEMES.find(t => t.id === k).label, ...out[k] };
  paletteCache.set(img, out);
  return out;
}

/** Kullanılacak renkler: palet ya da özel renk (yazı rengi otomatikse zemine göre açık/koyu seçilir) */
function colors(o, coverPal) {
  const P = (coverPal && coverPal[o.theme]) || THEMES.find(t => t.id === o.theme) || THEMES[0];
  if (!o.custom?.bg) return P;
  const dark = lum(o.custom.bg) < 0.3;
  const ink = o.custom.ink || (dark ? '#fbf8f1' : '#1d1a16');
  return { ...P, bg: o.custom.bg, bg2: shade(o.custom.bg, dark ? 0.12 : -0.06), ink, soft: alpha(ink, 0.72), accent: o.custom.ink || (dark ? '#e8b03c' : shade(o.custom.bg, -0.55)) };
}

/** Satırlara böl; her satır { t, last } (iki yana yaslamada paragrafın son satırı açılmaz) */
function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split(/\n+/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else { lines.push({ t: line, last: false }); line = word; }
    }
    if (line) lines.push({ t: line, last: true });
  }
  return lines;
}

function drawLine(ctx, L, x, y, w, align) {
  ctx.textAlign = 'left';
  if (align === 'justify' && !L.last) {
    const words = L.t.split(' ');
    if (words.length > 1) {
      const ww = words.map(s => ctx.measureText(s).width), gap = (w - ww.reduce((a, b) => a + b, 0)) / (words.length - 1);
      if (gap < ctx.measureText(' ').width * 3.5) { // boşluklar aşırı açılacaksa normal yaz
        let cx = x;
        words.forEach((s, i) => { ctx.fillText(s, cx, y); cx += ww[i] + gap; });
        return;
      }
    }
  }
  const lw = ctx.measureText(L.t).width;
  ctx.fillText(L.t, align === 'center' ? x + (w - lw) / 2 : align === 'right' ? x + w - lw : x, y);
}

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

/** Görseli kutuya kırparak sığdırır */
function drawFit(x, img, X, Y, w, h) {
  const iw0 = img.naturalWidth || img.width, ih0 = img.naturalHeight || img.height;
  const s = Math.max(w / iw0, h / ih0), iw = iw0 * s, ih = ih0 * s;
  x.drawImage(img, X + (w - iw) / 2, Y + (h - ih) / 2, iw, ih);
}

/** Kapağı gölgeli, köşeleri yuvarlatılmış bir "kitap" olarak çizer */
function drawBook(x, img, X, Y, w, h, T) {
  const r = Math.round(w * 0.05);
  x.save(); x.shadowColor = 'rgba(0,0,0,0.38)'; x.shadowBlur = w * 0.22; x.shadowOffsetY = w * 0.08;
  roundRect(x, X, Y, w, h, r); x.fillStyle = T.bg2; x.fill(); x.restore();
  x.save(); roundRect(x, X, Y, w, h, r); x.clip(); drawFit(x, img, X, Y, w, h);
  const g = x.createLinearGradient(X, 0, X + w * 0.12, 0); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(X, Y, w * 0.12, h); x.restore();
  x.save(); roundRect(x, X + 0.5, Y + 0.5, w - 1, h - 1, r); x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 2; x.stroke(); x.restore();
}

/** Zemin: degrade / düz / desen / bulanık kitap kapağı / kullanıcının fotoğrafı */
function drawBackground(x, F, o, T, img) {
  const g = x.createLinearGradient(0, 0, F.w, F.h); g.addColorStop(0, T.bg); g.addColorStop(1, T.bg2);
  x.fillStyle = o.bg === 'duz' ? T.bg : g; x.fillRect(0, 0, F.w, F.h);
  if (o.bg === 'desen') {
    x.fillStyle = alpha(T.accent, 0.16);
    const step = Math.round(F.w / 24), r = Math.max(2, F.w * 0.0032);
    for (let row = 0, yy = step / 2; yy < F.h; yy += step, row++) for (let xx = row % 2 ? step : step / 2; xx < F.w; xx += step) { x.beginPath(); x.arc(xx, yy, r, 0, Math.PI * 2); x.fill(); }
  }
  if ((o.bg === 'kapak' || o.bg === 'foto') && img) {
    if (o.bg === 'kapak') { // küçültüp büyüterek yumuşak bulanıklık (her tarayıcıda çalışır)
      // çok küçültüp iki adımda büyüt: yazılar okunmaz, renkler yumuşak geçer
      const sm = document.createElement('canvas'); sm.width = Math.max(6, Math.round(F.w / 70)); sm.height = Math.max(6, Math.round(F.h / 70));
      drawFit(sm.getContext('2d'), img, 0, 0, sm.width, sm.height);
      const mid = document.createElement('canvas'); mid.width = Math.round(F.w / 10); mid.height = Math.round(F.h / 10);
      const mx = mid.getContext('2d'); mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high'; mx.drawImage(sm, 0, 0, mid.width, mid.height);
      x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(mid, 0, 0, F.w, F.h); x.restore();
    } else drawFit(x, img, 0, 0, F.w, F.h);
    x.fillStyle = o.layout === 'kart' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.48)'; x.fillRect(0, 0, F.w, F.h);
  }
}

/** Seçenekleri tamamlar (eski { theme, cover } çağrılarıyla uyumlu) */
export function normalize(o = {}) {
  const n = { ...DEFAULTS, ...o, show: { ...DEFAULTS.show, ...(o.show || {}) } };
  if (o.cover === false) n.show.cover = false;
  if (o.cover === true) n.show.cover = true;
  for (const [k, list] of [['format', FORMATS], ['layout', LAYOUTS], ['theme', [...THEMES, ...COVER_THEMES]], ['bg', BACKGROUNDS], ['align', ALIGNS], ['font', FONTS], ['size', SIZES]])
    if (!list.some(i => i.id === n[k])) n[k] = DEFAULTS[k];
  if (n.custom && !/^#[0-9a-f]{6}$/i.test(n.custom.bg || '')) n.custom = null;
  return n;
}

/** Kartı çizer ve canvas döner. opts.photo: kullanıcının seçtiği görsel (yalnızca bellekte) */
export async function drawCard(h, opts = {}) {
  const o = normalize(opts);
  const F = FORMATS.find(f => f.id === o.format);
  const book = bookById(h.bookId) || {};
  const FONT = FONTS.find(f => f.id === o.font).css, SZ = SIZES.find(s => s.id === o.size).k;
  try { await Promise.all([document.fonts.load(SANS(600, 48)), document.fonts.load(SANS(800, 30))]); } catch { /* sistem yazı tipine düşer */ }
  const coverTheme = o.theme.startsWith('kapak-') && !o.custom?.bg;
  const coverWanted = o.show.cover || o.bg === 'kapak' || o.layout === 'kapak' || coverTheme;
  const coverImg = coverWanted ? await loadCover(book.cover) : null;
  const coverPal = coverTheme && coverImg ? coverPalettes(coverImg) : null;
  const photo = o.bg === 'foto' ? o.photo || null : null;
  const c = document.createElement('canvas');
  c.width = F.w; c.height = F.h;
  c.dataset.cover = !coverWanted ? 'off' : coverImg ? 'ok' : (book.cover ? 'fail' : 'none');
  c.dataset.palette = coverTheme ? (coverPal ? 'cover' : 'fallback') : 'preset';
  const x = c.getContext('2d');
  x.textBaseline = 'top';
  let T = colors(o, coverPal);
  const onImage = !!((o.bg === 'kapak' && coverImg) || (o.bg === 'foto' && photo));
  drawBackground(x, F, o, T, o.bg === 'kapak' ? coverImg : photo);
  const U = Math.min(F.w, F.h * 0.8); // ölçü birimi (yatay biçimde taşmasın)
  const pad = Math.round(Math.min(F.w, F.h) * 0.1);

  let A = { x: pad, y: pad, w: F.w - pad * 2, h: F.h - pad * 2 };
  if (o.layout === 'kart') {
    // İç kart: içerik onun içinde; fotoğraflı zeminde kart yarı saydam paletten
    const inset = Math.round(pad * 0.55), r = Math.round(U * 0.045);
    const K = { x: inset, y: inset, w: F.w - inset * 2, h: F.h - inset * 2 };
    x.save(); x.shadowColor = 'rgba(0,0,0,0.25)'; x.shadowBlur = U * 0.05; x.shadowOffsetY = U * 0.015;
    roundRect(x, K.x, K.y, K.w, K.h, r);
    x.fillStyle = onImage ? alpha(T.bg, 0.88) : (lum(T.bg) < 0.3 ? shade(T.bg2, 0.07) : '#ffffff');
    x.fill(); x.restore();
    x.save(); roundRect(x, K.x, K.y, K.w, K.h, r); x.strokeStyle = alpha(T.accent, 0.35); x.lineWidth = 3; x.stroke(); x.restore();
    const ip = Math.round(pad * 0.75);
    A = { x: K.x + ip, y: K.y + ip, w: K.w - ip * 2, h: K.h - ip * 2 };
  } else if (onImage) {
    T = { ...T, ink: '#ffffff', soft: 'rgba(255,255,255,0.82)' };
  } else {
    x.strokeStyle = alpha(T.accent, 0.3); x.lineWidth = 3;
    x.strokeRect(pad / 2, pad / 2, F.w - pad, F.h - pad);
  }
  const align = o.align;
  const ax = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

  // ---- kaynak (kitap adı, yazar · sayfa)
  const titleSize = Math.round(U * 0.034), metaSize = Math.round(U * 0.028), titleLh = U * 0.044;
  const meta = [o.show.author ? book.author : null, o.show.page && h.page ? `s. ${h.page}` : null].filter(Boolean).join(' · ');
  const creditBlock = maxW => {
    x.font = SANS(800, titleSize);
    const title = o.show.title && book.title ? wrap(x, book.title, maxW).slice(0, 2) : [];
    x.font = SANS(600, metaSize);
    const metaLines = meta ? wrap(x, meta, maxW).slice(0, 2) : [];
    const any = title.length || metaLines.length;
    return { title, metaLines, h: any ? 32 + title.length * titleLh + metaLines.length * metaSize * 1.35 : 0 };
  };
  const drawCredit = (cb, X, Y, W, al) => {
    if (!cb.h) return;
    const bw = U * 0.08;
    x.fillStyle = T.accent;
    x.fillRect(al === 'center' ? X + (W - bw) / 2 : al === 'right' ? X + W - bw : X, Y, bw, 6);
    let ty = Y + 32;
    x.fillStyle = T.ink; x.font = SANS(800, titleSize);
    for (const l of cb.title) { drawLine(x, { t: l.t, last: true }, X, ty, W, al); ty += titleLh; }
    x.fillStyle = T.soft; x.font = SANS(600, metaSize);
    for (const l of cb.metaLines) { drawLine(x, { t: l.t, last: true }, X, ty + 4, W, al); ty += metaSize * 1.35; }
  };
  const brandH = o.show.brand ? U * 0.055 : 0;
  const drawBrand = () => {
    if (!o.show.brand) return;
    x.font = SANS(700, Math.round(U * 0.022)); x.fillStyle = T.soft; x.globalAlpha = 0.85; x.textBaseline = 'bottom'; x.textAlign = 'left';
    const t = 'Satır İzi', tw = x.measureText(t).width;
    x.fillText(t, ax === 'right' ? A.x : ax === 'center' ? A.x + (A.w - tw) / 2 : A.x + A.w - tw, A.y + A.h);
    x.globalAlpha = 1; x.textBaseline = 'top';
  };

  // ---- alıntı metni: verilen alana sığacak en büyük boyut
  const fit = (maxW, maxH, top = 66) => {
    const k = U / 1080, min = Math.round(26 * k);
    let size = Math.round(top * SZ * k), lines, lh;
    for (; size >= min; size -= 2) {
      x.font = FONT(600, size); lh = size * (o.font === 'sans' ? 1.42 : 1.38);
      lines = wrap(x, h.text, maxW);
      if (lines.length * lh <= maxH) break;
    }
    const maxLines = Math.max(1, Math.floor(maxH / lh));
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); const L = lines[lines.length - 1]; L.t = L.t.replace(/\s+\S*$/, '') + ' …'; L.last = true; }
    return { size, lines, lh, h: lines.length * lh };
  };
  const drawText = (tb, X, Y, W) => { x.fillStyle = T.ink; x.font = FONT(600, tb.size); let y = Y; for (const L of tb.lines) { drawLine(x, L, X, y, W, align); y += tb.lh; } };
  const quoteMark = (size, Y) => {
    x.fillStyle = T.accent; x.font = (o.font === 'sans' ? SANS : FONTS[1].css)(800, size); x.textAlign = 'left';
    const w = x.measureText('“').width;
    x.fillText('“', ax === 'center' ? A.x + (A.w - w) / 2 : ax === 'right' ? A.x + A.w - w : A.x - size * 0.04, Y);
  };

  const L = o.layout === 'kapak' && !coverImg ? 'ortali' : o.layout;
  const gap = U * 0.06;
  if (L === 'klasik' || L === 'kart' || L === 'minimal') {
    const markSize = L === 'klasik' ? U * 0.2 : L === 'kart' ? U * 0.13 : 0;
    if (markSize) quoteMark(markSize, A.y - (L === 'klasik' ? pad * 0.25 : 0));
    const top = A.y + markSize * 0.72;
    // Alt kısım: kaynak (+ küçük kapak)
    const thumb = o.show.cover && coverImg;
    let footerTop, cb, cv = null;
    if (thumb) {
      const ch = Math.round(U * ({ story: 0.32, square: 0.18, wide: 0.2 }[o.format] || 0.22));
      const ratio = Math.min(0.78, Math.max(0.6, coverImg.naturalWidth / coverImg.naturalHeight)), cw = Math.round(ch * ratio);
      cb = creditBlock(A.w - cw - U * 0.05);
      const rowH = Math.max(ch, cb.h);
      footerTop = A.y + A.h - brandH - rowH;
      cv = { w: cw, h: ch, x: ax === 'right' ? A.x + A.w - cw : A.x, y: footerTop + (rowH - ch) / 2 };
    } else {
      cb = creditBlock(A.w);
      footerTop = A.y + A.h - brandH - cb.h;
    }
    const bar = L === 'minimal' && ax !== 'center' ? U * 0.012 : 0, barGap = bar ? U * 0.04 : 0;
    const textW = A.w - bar - barGap;
    const room = footerTop - top - gap;
    const tb = fit(textW, room);
    const ty = top + Math.max(0, (room - tb.h) / (L === 'minimal' ? 2 : 2.4));
    const tx = ax === 'right' ? A.x : A.x + bar + barGap;
    if (bar) { x.fillStyle = T.accent; x.fillRect(ax === 'right' ? A.x + A.w - bar : A.x, ty + tb.lh * 0.12, bar, tb.h - tb.lh * 0.25); }
    drawText(tb, tx, ty, textW);
    if (cv) {
      drawBook(x, coverImg, cv.x, cv.y, cv.w, cv.h, T);
      const tx2 = ax === 'right' ? A.x : cv.x + cv.w + U * 0.05, tw = A.w - cv.w - U * 0.05;
      drawCredit(cb, tx2, cv.y + Math.max(0, (cv.h - cb.h) / 2), tw, ax === 'center' ? 'left' : ax);
    } else drawCredit(cb, A.x, footerTop, A.w, ax);
  } else if (L === 'ortali') {
    const mark = U * 0.12;
    const cb = creditBlock(A.w);
    const tb = fit(A.w, (A.h - brandH - mark * 0.75 - cb.h - gap) * 0.92, 62);
    const groupH = mark * 0.75 + tb.h + gap + cb.h;
    let y = A.y + Math.max(0, (A.h - brandH - groupH) / 2);
    quoteMark(mark, y - mark * 0.1);
    y += mark * 0.75;
    drawText(tb, A.x, y, A.w); y += tb.h + gap;
    drawCredit(cb, A.x, y, A.w, ax);
  } else { // kapak üstte
    const ch = Math.round(U * ({ story: 0.52, square: 0.3, wide: 0.5 }[o.format] || 0.38));
    const ratio = Math.min(0.78, Math.max(0.6, coverImg.naturalWidth / coverImg.naturalHeight)), cw = Math.round(ch * ratio);
    if (o.format === 'wide') { // yatayda kapak solda, metin sağda
      drawBook(x, coverImg, A.x, A.y + (A.h - brandH - ch) / 2, cw, ch, T);
      const X = A.x + cw + U * 0.08, W = A.w - cw - U * 0.08;
      const cb = creditBlock(W);
      const tb = fit(W, A.h - brandH - cb.h - gap, 60);
      let y = A.y + Math.max(0, (A.h - brandH - tb.h - gap - cb.h) / 2);
      drawText(tb, X, y, W); y += tb.h + gap;
      drawCredit(cb, X, y, W, ax);
    } else {
      const cb = creditBlock(A.w);
      drawBook(x, coverImg, ax === 'right' ? A.x + A.w - cw : ax === 'center' ? A.x + (A.w - cw) / 2 : A.x, A.y, cw, ch, T);
      const top = A.y + ch + U * 0.08, room = A.h - brandH - (top - A.y) - cb.h - gap;
      const tb = fit(A.w, room, 58);
      let y = top + Math.max(0, (room - tb.h) / 2.2);
      drawText(tb, A.x, y, A.w); y += tb.h + gap;
      drawCredit(cb, A.x, y, A.w, ax);
    }
  }
  drawBrand();
  return c;
}

const toBlob = c => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Görsel hazırlanamadı.'))), 'image/png'));
function loadPrefs() { try { return normalize(JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch { return normalize(); } }
function savePrefs(o) {
  // Fotoğraf hiçbir yere kaydedilmez; bir sonraki kartta fotoğraf zemini yerine degrade gelir
  try { const { photo, ...rest } = o; localStorage.setItem(PREF_KEY, JSON.stringify({ ...rest, bg: rest.bg === 'foto' ? 'renk' : rest.bg })); } catch { /* özel pencerede yazılamayabilir */ }
}

export function openShareDialog(h) {
  const book = bookById(h.bookId) || {};
  const st = loadPrefs();
  if (st.bg === 'kapak' && !book.cover) st.bg = 'renk';
  if (st.layout === 'kapak' && !book.cover) st.layout = 'klasik';
  const preview = el('div', { class: 'share-preview' });
  const note = el('p', { class: 'muted small share-note', hidden: true });
  let current = null, queued = false;
  const render = async () => {
    if (queued) return; queued = true;
    await new Promise(r => requestAnimationFrame(r)); queued = false;
    const cv = await drawCard(h, st);
    current = cv;
    cv.classList.add('share-canvas');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Alıntı kartı önizlemesi');
    preview.replaceChildren(cv);
    const msgs = [];
    if (cv.dataset.cover === 'fail') msgs.push('Kitabın kapağı karta eklenemiyor: kapak, izin vermeyen bir siteden bağlantı olarak kaydedilmiş. Kitabı düzenleyip kapağı fotoğraf olarak yükleyebilirsin.');
    if (st.bg === 'foto' && !st.photo) msgs.push('Arka plan için “Fotoğraf seç”e dokun.');
    if (cv.dataset.palette === 'fallback' && cv.dataset.cover !== 'fail') msgs.push('Kapağın renkleri okunamadı; Gece paleti kullanıldı.');
    note.hidden = !msgs.length; note.textContent = msgs.join(' ');
    savePrefs(st);
  };
  const seg = (items, get, set, { iconsOnly = false } = {}) => {
    const wrapEl = el('div', { class: 'chips seg share-seg', role: 'group' });
    for (const it of items) {
      const b = el('button', { type: 'button', class: 'chip-btn chip-sm', 'aria-pressed': String(get() === it.id), title: it.label, 'aria-label': it.label, 'data-id': it.id },
        it.icon ? icon(it.icon, { size: 18 }) : null, iconsOnly ? null : it.label);
      b.onclick = () => { set(it.id); wrapEl.querySelectorAll('button').forEach(z => z.setAttribute('aria-pressed', String(z === b))); render(); };
      wrapEl.append(b);
    }
    return wrapEl;
  };
  const row = (label, control) => el('div', { class: 'share-row' }, el('span', { class: 'field-label' }, label), control);
  let coverRowWrap; // aşağıda (paletler hazır olunca görünür)

  // Renk örnekleri + özel renk
  const swatches = el('div', { class: 'share-swatches', role: 'group', 'aria-label': 'Renk' });
  const coverRow = el('div', { class: 'share-coverpal', role: 'group', 'aria-label': 'Kapakla uyumlu renkler', hidden: true });
  let coverPal = null;
  const drawSwatches = () => {
    if (coverPal) coverRow.replaceChildren(...COVER_THEMES.map(ct => {
      const t = coverPal[ct.id];
      const b = el('button', { type: 'button', class: 'chip-btn chip-sm share-cp', 'aria-pressed': String(!st.custom && st.theme === ct.id), title: `Kapakla uyumlu: ${ct.label}` }, el('span', { class: 'share-cp-dot', 'aria-hidden': 'true' }), ct.label);
      const dot = b.firstChild; dot.style.background = `linear-gradient(135deg, ${t.bg} 50%, ${t.bg2} 50%)`; dot.style.setProperty('--dot', t.accent);
      b.onclick = () => { st.theme = ct.id; st.custom = null; drawSwatches(); render(); };
      return b;
    }));
    swatches.replaceChildren(...THEMES.map(t => {
      const b = el('button', { type: 'button', class: 'share-sw', title: t.label, 'aria-label': t.label, 'aria-pressed': String(!st.custom && st.theme === t.id) });
      b.style.background = `linear-gradient(135deg, ${t.bg} 50%, ${t.bg2} 50%)`;
      b.style.setProperty('--dot', t.accent);
      b.onclick = () => { st.theme = t.id; st.custom = null; drawSwatches(); render(); };
      return b;
    }));
  };
  coverRowWrap = el('div', { class: 'share-row', hidden: true }, el('span', { class: 'field-label' }, 'Kapakla uyumlu'), coverRow);
  drawSwatches();
  // Kapak yüklenince (izin veren kaynaktansa) kapakla uyumlu paletler hazırlanır
  if (book.cover) loadCover(book.cover).then(img => {
    coverPal = img ? coverPalettes(img) : null;
    if (coverPal) { coverRow.hidden = false; coverRowWrap.hidden = false; drawSwatches(); }
  });
  if (st.theme.startsWith('kapak-') && !book.cover) st.theme = 'gece';
  const bgColor = el('input', { type: 'color', value: st.custom?.bg || '#2b4c7e', 'aria-label': 'Özel arka plan rengi' });
  const inkColor = el('input', { type: 'color', value: st.custom?.ink || '#ffffff', 'aria-label': 'Özel yazı rengi' });
  const inkAuto = el('input', { type: 'checkbox', checked: !st.custom?.ink });
  const applyCustom = () => { st.custom = { bg: bgColor.value, ink: inkAuto.checked ? null : inkColor.value }; inkColor.disabled = inkAuto.checked; drawSwatches(); render(); };
  bgColor.addEventListener('input', applyCustom);
  inkColor.addEventListener('input', () => { inkAuto.checked = false; applyCustom(); });
  inkAuto.addEventListener('change', applyCustom);
  inkColor.disabled = inkAuto.checked;
  const custom = el('div', { class: 'share-custom' },
    el('label', {}, bgColor, el('span', {}, 'Zemin')),
    el('label', {}, inkColor, el('span', {}, 'Yazı')),
    el('label', { class: 'check' }, inkAuto, 'Yazı rengi otomatik'));

  // Fotoğraf: yalnızca bu pencerede bellekte tutulur, hiçbir yere kaydedilmez veya gönderilmez
  const photoIn = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const bgItems = BACKGROUNDS.filter(b => b.id !== 'kapak' || book.cover);
  const bgSeg = seg(bgItems, () => st.bg, v => { st.bg = v; if (v === 'foto' && !st.photo) photoIn.click(); });
  photoIn.addEventListener('change', async () => {
    const f = photoIn.files?.[0]; if (!f) return;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Görsel açılamadı.')); i.src = URL.createObjectURL(f); });
      if (st.photo?.src?.startsWith('blob:')) URL.revokeObjectURL(st.photo.src);
      st.photo = img; st.bg = 'foto';
      bgSeg.querySelectorAll('button').forEach(z => z.setAttribute('aria-pressed', String(z.dataset.id === 'foto')));
      render();
    } catch (e) { toast(e.message, { type: 'error' }); }
  });
  const photoBtn = button('Fotoğraf seç', { small: true, icon: 'image', onClick: () => photoIn.click() });

  const show = (key, label) => {
    const c = el('input', { type: 'checkbox', checked: st.show[key] });
    c.addEventListener('change', () => { st.show[key] = c.checked; render(); });
    return el('label', { class: 'check' }, c, label);
  };

  const panels = {
    duzen: el('div', { class: 'share-panel' },
      row('Biçim', seg(FORMATS, () => st.format, v => { st.format = v; })),
      row('Düzen', seg(LAYOUTS.filter(l => l.id !== 'kapak' || book.cover), () => st.layout, v => { st.layout = v; })),
      row('Hizalama', seg(ALIGNS, () => st.align, v => { st.align = v; }, { iconsOnly: true }))),
    renk: el('div', { class: 'share-panel', hidden: true },
      coverRowWrap,
      row('Renk', swatches),
      row('Arka plan', el('div', { class: 'share-inline' }, bgSeg, photoBtn, photoIn)),
      row('Özel renk', custom)),
    yazi: el('div', { class: 'share-panel', hidden: true },
      row('Yazı tipi', seg(FONTS, () => st.font, v => { st.font = v; })),
      row('Yazı boyutu', seg(SIZES, () => st.size, v => { st.size = v; })),
      row('Kartta görünsün', el('div', { class: 'share-checks' },
        show('title', 'Kitap adı'), show('author', 'Yazar'), show('page', 'Sayfa'),
        book.cover ? show('cover', 'Küçük kapak') : null, show('brand', 'Satır İzi imzası')))),
  };
  const tabs = el('div', { class: 'share-tabs', role: 'tablist' });
  for (const [k, label] of [['duzen', 'Düzen'], ['renk', 'Renk ve zemin'], ['yazi', 'Yazı']]) {
    const t = el('button', { type: 'button', role: 'tab', class: 'share-tab', 'aria-selected': String(k === 'duzen'), 'data-tab': k }, label);
    t.onclick = () => { tabs.querySelectorAll('button').forEach(z => z.setAttribute('aria-selected', String(z === t))); for (const [pk, p] of Object.entries(panels)) p.hidden = pk !== k; };
    tabs.append(t);
  }

  const fileName = () => `satir-izi-${slugify(book.title || 'alinti')}${h.page ? '-s' + h.page : ''}.png`;
  const canShareFiles = !!(navigator.canShare && navigator.share);
  const shareBtn = button(canShareFiles ? 'Paylaş' : 'PNG indir', { variant: 'primary', icon: canShareFiles ? 'share' : 'download', onClick: async () => {
    try {
      const blob = await toBlob(current);
      const file = new File([blob], fileName(), { type: 'image/png' });
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: book.title || 'Alıntı', text: `“${h.text.slice(0, 200)}${h.text.length > 200 ? '…' : ''}” — ${book.author || ''}, ${book.title || ''}` });
      } else { download(fileName(), blob); toast('Kart indirildi.'); }
    } catch (e) { if (e?.name !== 'AbortError') toast('Paylaşılamadı: ' + (e.message || e), { type: 'error' }); }
  } });
  const dlBtn = canShareFiles ? button('İndir', { icon: 'download', onClick: async () => { download(fileName(), await toBlob(current)); toast('Kart indirildi.'); } }) : null;
  const resetBtn = button('Varsayılana dön', { variant: 'ghost', small: true, icon: 'rotateRight', onClick: () => {
    try { localStorage.removeItem(PREF_KEY); } catch { /* */ }
    dlg.close(); openShareDialog(h);
  } });
  const dlg = el('dialog', { class: 'dialog dialog-wide share-dialog' },
    el('div', { class: 'share-head' }, el('h2', {}, 'Alıntı kartı'), resetBtn),
    preview, note, tabs, panels.duzen, panels.renk, panels.yazi,
    el('p', { class: 'muted small' }, canShareFiles ? 'Paylaş menüsünden WhatsApp, Instagram veya başka bir uygulamayı seçebilirsin. Seçimlerin bir sonraki kart için hatırlanır.' : 'Bu tarayıcı doğrudan paylaşımı desteklemiyor; kartı indirip istediğin yerde paylaşabilirsin. Seçimlerin bir sonraki kart için hatırlanır.'),
    el('div', { class: 'row-actions end sticky-actions' }, button('Kapat', { variant: 'ghost', onClick: () => dlg.close() }), dlBtn, shareBtn));
  dlg.addEventListener('close', () => { if (st.photo?.src?.startsWith('blob:')) URL.revokeObjectURL(st.photo.src); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
  render();
}
