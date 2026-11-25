// IndexedDB katmanı, sürüm yönetimi ve v1 → v2 veri migrasyonu.
//
// v1 (ilk sürüm): tek bir "data" deposu; "books" anahtarında alıntıları gömülü kitap dizisi,
//                 "model" anahtarında model kimliği vardı.
// v2: books / highlights / notes / scanJobs / scanDrafts / settings depoları.
//     Eski "data" deposu silinmez; güvenlik için olduğu gibi bırakılır.

import { uid, nowISO } from './utils.js';

export const DB_NAME = 'satir-izi';
export const DB_VERSION = 2;
export const OLD_DEFAULT_MODEL = 'gemini-2.5-flash-lite';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export const BOOK_STATUSES = [
  { value: 'okunacak', label: 'Okunacak' },
  { value: 'okunuyor', label: 'Okunuyor' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'yarim', label: 'Yarım bırakıldı' },
];

export const MARK_TYPES = [
  { value: 'alt_cizgi', label: 'Altı çizili' },
  { value: 'fosforlu', label: 'Fosforlu kalem' },
  { value: 'kenar_cizgisi', label: 'Kenar çizgisi' },
  { value: 'parantez', label: 'Parantez' },
  { value: 'yildiz', label: 'Yıldız' },
  { value: 'diger', label: 'Diğer işaret' },
  { value: 'manuel', label: 'Elle eklendi' },
];
export const markLabel = v => MARK_TYPES.find(m => m.value === v)?.label || 'Diğer işaret';
export const statusLabel = v => BOOK_STATUSES.find(s => s.value === v)?.label || 'Okunacak';

const str = (v, max = 100000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const numOrNull = v => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const isoOr = (v, fallback) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : fallback);
const dateOnly = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 60)) : []);

// ---- Kayıt fabrikaları: her kaynaktan gelen veriyi güvenli tiplere indirger ----
export function makeBook(p = {}, now = nowISO()) {
  const status = BOOK_STATUSES.some(s => s.value === p.status) ? p.status : 'okunacak';
  const rating = Math.min(5, Math.max(0, Math.round(Number(p.rating) || 0)));
  const cover = typeof p.cover === 'string' && p.cover.startsWith('data:image/') ? p.cover : '';
  return {
    id: typeof p.id === 'string' && p.id ? p.id : uid(),
    title: str(p.title, 300).trim(),
    author: str(p.author, 200).trim(),
    publisher: str(p.publisher, 200).trim(),
    isbn: str(p.isbn, 20).replace(/[^0-9Xx-]/g, ''),
    category: str(p.category, 80).trim(),
    cover,
    totalPages: numOrNull(p.totalPages),
    readPages: numOrNull(p.readPages),
    startDate: dateOnly(p.startDate),
    endDate: dateOnly(p.endDate),
    status,
    review: str(p.review, 50000),
    rating,
    createdAt: isoOr(p.createdAt, now),
    updatedAt: isoOr(p.updatedAt, now),
  };
}

export function makeHighlight(p = {}, now = nowISO()) {
  return {
    id: typeof p.id === 'string' && p.id ? p.id : uid(),
    bookId: str(p.bookId, 100),
    text: str(p.text, 20000).trim(),
    page: str(p.page, 30).trim(),
    markType: MARK_TYPES.some(m => m.value === p.markType) ? p.markType : 'diger',
    comment: str(p.comment, 20000),
    tags: strList(p.tags),
    categories: strList(p.categories),
    favorite: p.favorite === true,
    source: ['tarama', 'manuel', 'eski', 'yedek'].includes(p.source) ? p.source : 'manuel',
    createdAt: isoOr(p.createdAt, now),
    updatedAt: isoOr(p.updatedAt, isoOr(p.createdAt, now)),
  };
}

export function makeNote(p = {}, now = nowISO()) {
  return {
    id: typeof p.id === 'string' && p.id ? p.id : uid(),
    bookId: str(p.bookId, 100),
    text: str(p.text, 50000),
    createdAt: isoOr(p.createdAt, now),
    updatedAt: isoOr(p.updatedAt, isoOr(p.createdAt, now)),
  };
}

/** v1 formatındaki kitap dizisini (alıntılar gömülü) v2 kayıtlarına dönüştürür. */
export function convertLegacyBooks(legacyBooks, { keepIds = true } = {}) {
  const books = [], highlights = [];
  const now = nowISO();
  for (const lb of Array.isArray(legacyBooks) ? legacyBooks : []) {
    if (!lb || typeof lb.title !== 'string') continue;
    const notes = Array.isArray(lb.notes) ? lb.notes : [];
    const created = notes.map(n => n?.created).filter(c => typeof c === 'string').sort();
    const book = makeBook({
      id: keepIds ? lb.id : undefined,
      title: lb.title,
      author: lb.author,
      status: 'okunuyor',
      createdAt: created[0] || now,
      updatedAt: created[created.length - 1] || now,
    }, now);
    if (!book.title) continue;
    books.push(book);
    for (const n of notes) {
      if (!n || typeof n.text !== 'string' || !n.text.trim()) continue;
      highlights.push(makeHighlight({
        id: keepIds ? n.id : undefined,
        bookId: book.id,
        text: n.text,
        page: n.page,
        markType: 'diger',
        source: 'eski',
        createdAt: n.created,
        updatedAt: n.created,
      }, now));
    }
  }
  return { books, highlights };
}

// ---- Bağlantı ----
let dbPromise = null;
let blockedHandler = () => {};
export function onUpgradeBlocked(fn) { blockedHandler = fn; }

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Bu tarayıcı IndexedDB desteklemiyor.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => upgrade(req.result, req.transaction, e.oldVersion);
    req.onblocked = () => blockedHandler();
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        alert('Satır İzi başka bir sekmede güncellendi. Sayfa yenilenecek.');
        location.reload();
      };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function upgrade(db, tx, oldVersion) {
  const ensure = (name, opts, indexes = []) => {
    const store = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, opts);
    for (const [idx, path] of indexes) if (!store.indexNames.contains(idx)) store.createIndex(idx, path);
    return store;
  };
  ensure('books', { keyPath: 'id' }, [['status', 'status'], ['updatedAt', 'updatedAt']]);
  ensure('highlights', { keyPath: 'id' }, [['bookId', 'bookId'], ['createdAt', 'createdAt']]);
  ensure('notes', { keyPath: 'id' }, [['bookId', 'bookId']]);
  ensure('scanJobs', { keyPath: 'id' }, [['bookId', 'bookId']]);
  ensure('scanDrafts', { keyPath: 'id' }, [['bookId', 'bookId']]);
  const settings = ensure('settings', { keyPath: 'key' });

  if (oldVersion >= 1 && oldVersion < 2 && db.objectStoreNames.contains('data')) {
    // v1 verisini aynı yükseltme işlemi içinde taşı. Eski depo silinmez.
    const legacy = tx.objectStore('data');
    const booksReq = legacy.get('books');
    const modelReq = legacy.get('model');
    booksReq.onsuccess = () => {
      const { books, highlights } = convertLegacyBooks(booksReq.result || []);
      for (const b of books) tx.objectStore('books').put(b);
      for (const h of highlights) tx.objectStore('highlights').put(h);
      settings.put({ key: 'migratedFromV1At', value: nowISO() });
      settings.put({ key: 'migratedFromV1Count', value: { books: books.length, highlights: highlights.length } });
    };
    modelReq.onsuccess = () => {
      const old = modelReq.result;
      // Eski varsayılanı kullanan kullanıcıyı yeni varsayılana taşı; özel seçimi koru.
      const model = typeof old === 'string' && old && old !== OLD_DEFAULT_MODEL ? old : DEFAULT_MODEL;
      settings.put({ key: 'model', value: model });
    };
  }
}

// ---- Genel işlemler ----
function promisify(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

/** Birden fazla depoda tek işlem (atomik). fn(tx) senkron olarak istek kuyruğa almalı. */
export async function runTx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let value;
    try { value = fn(tx); } catch (e) { try { tx.abort(); } catch { /* zaten bitti */ } reject(e); return; }
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Veritabanı işlemi iptal edildi.'));
  });
}

export async function getAll(store) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).get(key));
}
export async function getByIndex(store, index, value) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).index(index).getAll(value));
}
export async function count(store) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).count());
}
export const put = (store, value) => runTx([store], 'readwrite', tx => { tx.objectStore(store).put(value); return value; });
export const del = (store, key) => runTx([store], 'readwrite', tx => { tx.objectStore(store).delete(key); });

// ---- Ayarlar ----
export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row === undefined ? fallback : row.value;
}
export const setSetting = (key, value) => put('settings', { key, value });

/** Kalıcı depolama izni iste (tarayıcının veriyi kendiliğinden silmesini zorlaştırır). */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

/** Bütün kullanıcı verisini siler (ayarlar dahil, eski v1 deposu dahil). */
export function wipeAll() {
  return openDB().then(db => {
    const names = [...db.objectStoreNames];
    return runTx(names, 'readwrite', tx => { for (const n of names) tx.objectStore(n).clear(); });
  });
}
