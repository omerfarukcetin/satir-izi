// Kitap bilgisini otomatik doldurma: kapak / arka kapak fotoğrafından (Gemini) ve ISBN'den (açık kataloglar).
// Çekilen fotoğraf yalnızca okumak için Gemini'ye gönderilir; kapak olarak kullanılmaz ve saklanmaz.
// Kapak yalnızca katalogdan gelirse eklenir.
import { canvasToJpeg, fileToCanvas } from './scanner.js';

const LOOKUP_TIMEOUT = 12000;

/** ISBN'i temizler ve sağlama basamağını doğrular. Geçersizse '' döner. */
export function normalizeIsbn(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (s.length === 13 && /^\d{13}$/.test(s)) {
    const sum = [...s.slice(0, 12)].reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(s[12]) ? s : '';
  }
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((t, d, i) => t + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    return sum % 11 === 0 ? s : '';
  }
  return '';
}

async function getJson(url, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT);
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

const clean = s => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const pages = n => (Number.isInteger(n) && n > 0 && n < 20000 ? n : null);
const https = u => (typeof u === 'string' && u ? u.replace(/^http:\/\//, 'https://') : '');

async function fromGoogle(isbn, signal) {
  const d = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`, signal);
  const v = d?.items?.[0]?.volumeInfo;
  if (!v?.title) return null;
  return {
    source: 'Google Books',
    title: clean(v.subtitle ? `${v.title}: ${v.subtitle}` : v.title),
    author: clean((v.authors || []).join(', ')),
    publisher: clean(v.publisher),
    totalPages: pages(v.pageCount),
    coverUrl: https(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail),
  };
}

async function fromOpenLibrary(isbn, signal) {
  const d = await getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, signal);
  const v = d?.[`ISBN:${isbn}`];
  if (!v?.title) return null;
  return {
    source: 'Open Library',
    title: clean(v.subtitle ? `${v.title}: ${v.subtitle}` : v.title),
    author: clean((v.authors || []).map(a => a?.name).filter(Boolean).join(', ')),
    publisher: clean((v.publishers || []).map(p => p?.name).filter(Boolean)[0]),
    totalPages: pages(v.number_of_pages),
    coverUrl: https(v.cover?.medium || v.cover?.large || `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`),
  };
}

/** Kapak görselini indirip küçük bir JPEG'e çevirir. Site izin vermezse null (kapaksız devam edilir). */
async function fetchCover(url, signal) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT);
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') || blob.size < 1500) return null; // boş/yer tutucu görseller
    const c = await fileToCanvas(blob);
    if (c.width < 40 || c.height < 60) return null;
    return (await canvasToJpeg(c, 480, 0.82)).dataUrl;
  } catch { return null; }
}

/**
 * ISBN ile açık kataloglarda arar (önce Google Books, sonra Open Library).
 * Bulunan alanları birleştirir; kapağı indirmeyi dener.
 */
export async function lookupIsbn(raw, { signal, withCover = true } = {}) {
  const isbn = normalizeIsbn(raw);
  if (!isbn) return { isbn: '', found: false, reason: 'invalid' };
  if (navigator.onLine === false) return { isbn, found: false, reason: 'offline' };
  const [g, o] = await Promise.all([fromGoogle(isbn, signal), fromOpenLibrary(isbn, signal)]);
  if (!g && !o) return { isbn, found: false, reason: 'notfound' };
  const pick = k => g?.[k] || o?.[k] || (k === 'totalPages' ? null : '');
  const result = {
    isbn, found: true,
    sources: [g?.source, o?.source].filter(Boolean),
    title: pick('title'), author: pick('author'), publisher: pick('publisher'), totalPages: pick('totalPages'),
    cover: null,
  };
  if (withCover) result.cover = (await fetchCover(g?.coverUrl, signal)) || (await fetchCover(o?.coverUrl, signal));
  return result;
}

/** Fotoğraf dosyasını Gemini'ye gönderilecek hâle getirir (yalnızca okuma için). */
export async function photoForReading(file) {
  const c = await fileToCanvas(file);
  const img = await canvasToJpeg(c, 1600, 0.85);
  return { base64: img.base64, mimeType: img.mimeType };
}
