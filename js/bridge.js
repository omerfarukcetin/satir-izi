// Satır İzi ↔ Sefer köprüsü.
// Sefer aynı alan adında (omerfarukcetin.github.io) çalıştığı için bu modülü doğrudan içe aktarır:
//   const si = await import('../satir-izi/js/bridge.js');
// Bilerek bağımsızdır (başka modül içe aktarmaz) ve veritabanını SÜRÜM BELİRTMEDEN açar;
// böylece Satır İzi'nin şema yükseltmelerini asla tetiklemez veya engellemez. Her işlemden sonra bağlantıyı kapatır.
//
// Sayfa ilerlemesinin kaynağı Sefer'in günlük kayıtlarıdır:
//   Sefer → setProgress(...) ile bağlı kitabın "okunan sayfa"sını mutlak değer olarak yazar.
//   Satır İzi → queuePages(...) ile "bugün N sayfa okudum" kaydını Sefer'in gelen kutusuna bırakır.

export const BRIDGE_VERSION = 1;
const DB = 'satir-izi';
export const INBOX_KEY = 'satir-izi-sefer-inbox';
export const CHANGE_KEY = 'satir-izi-external-change';

async function openDb() {
  if (!('indexedDB' in self)) return null;
  try {
    if (indexedDB.databases) {
      const list = await indexedDB.databases();
      if (!list.some(d => d.name === DB)) return null; // Satır İzi bu cihazda hiç açılmamış
    }
  } catch { /* databases() desteklenmiyor olabilir */ }
  return new Promise(resolve => {
    const req = indexedDB.open(DB);
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch { /* yok */ } }; // boş veritabanı oluşturma
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains('books') || !db.objectStoreNames.contains('highlights')) { db.close(); resolve(null); return; }
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function withDb(fn, fallback) {
  const db = await openDb();
  if (!db) return fallback;
  try { return await fn(db); } finally { db.close(); }
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Satır İzi bu cihazda kurulu mu (en az bir kez açılmış mı)? */
export const available = () => withDb(() => true, false);

const bookInfo = b => ({
  id: b.id, title: b.title, author: b.author, status: b.status,
  totalPages: b.totalPages ?? null, readPages: b.readPages ?? null, linked: !!b.sefer?.task,
});

export const listBooks = () => withDb(async db => {
  const books = await reqP(db.transaction('books').objectStore('books').getAll());
  const order = { okunuyor: 0, okunacak: 1, yarim: 2, tamamlandi: 3 };
  return books.map(bookInfo).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.title.localeCompare(b.title, 'tr'));
}, []);

export const getBook = id => withDb(async db => {
  const b = await reqP(db.transaction('books').objectStore('books').get(id));
  if (!b) return null;
  const hl = await reqP(db.transaction('highlights').objectStore('highlights').index('bookId').count(id));
  return { ...bookInfo(b), highlights: hl };
}, null);

/**
 * Sefer'deki ilerlemeyi Satır İzi kitabına yazar (mutlak değerler).
 * p: { readPages, totalPages, finished, link: { task, goal, due, streak } }
 */
export const setProgress = (bookId, p) => withDb(async db => {
  const tx = db.transaction('books', 'readwrite');
  const st = tx.objectStore('books');
  const b = await reqP(st.get(bookId));
  if (!b) return false;
  const now = new Date().toISOString(), today = now.slice(0, 10);
  const next = { ...b };
  const total = Number(p.totalPages) > 0 ? Math.round(p.totalPages) : null;
  if (total && !b.totalPages) next.totalPages = total;
  if (Number.isFinite(p.readPages) && p.readPages >= 0) next.readPages = Math.round(Math.min(p.readPages, next.totalPages || p.readPages));
  if (p.finished) {
    next.status = 'tamamlandi';
    if (!next.endDate) next.endDate = today;
    if (next.totalPages) next.readPages = next.totalPages;
  } else if (next.readPages > 0 && (b.status === 'okunacak' || !b.status)) {
    next.status = 'okunuyor';
    if (!next.startDate) next.startDate = today;
  }
  next.sefer = p.link === null ? null : {
    task: String(p.link?.task || b.sefer?.task || '').slice(0, 120),
    goal: Math.max(0, Math.round(Number(p.link?.goal) || 0)),
    due: /^\d{4}-\d{2}-\d{2}$/.test(p.link?.due || '') ? p.link.due : '',
    streak: Math.max(0, Math.round(Number(p.link?.streak) || 0)),
    at: now,
  };
  const same = ['readPages', 'totalPages', 'status', 'endDate', 'startDate'].every(k => next[k] === b[k])
    && JSON.stringify({ ...next.sefer, at: 0 }) === JSON.stringify({ ...(b.sefer || {}), at: 0 });
  if (same) return true;
  next.updatedAt = now;
  st.put(next);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  try { localStorage.setItem(CHANGE_KEY, String(Date.now())); } catch { /* yok */ }
  return true;
}, false);

/** Sefer'deki bağlantı kaldırıldığında */
export const unlink = bookId => setProgress(bookId, { link: null });

/** Günün alıntısı: aynı gün hep aynı alıntı döner. */
export const quoteOfDay = (day = new Date().toISOString().slice(0, 10)) => withDb(async db => {
  const hl = await reqP(db.transaction('highlights').objectStore('highlights').getAll());
  if (!hl.length) return null;
  hl.sort((a, b) => a.id.localeCompare(b.id));
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const q = hl[h % hl.length];
  const b = await reqP(db.transaction('books').objectStore('books').get(q.bookId));
  return { text: q.text, page: q.page || '', bookId: q.bookId, title: b?.title || '', author: b?.author || '' };
}, null);

// ---- Satır İzi → Sefer gelen kutusu (aynı cihaz) ----
export function queuePages(bookId, pages) {
  const n = Math.round(Number(pages));
  if (!bookId || !(n > 0)) return false;
  let box = [];
  try { box = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]') || []; } catch { box = []; }
  box.push({ id: Math.random().toString(36).slice(2), bookId, pages: Math.min(n, 2000), at: new Date().toISOString() });
  localStorage.setItem(INBOX_KEY, JSON.stringify(box.slice(-50)));
  return true;
}
/** Sefer çağırır: bekleyen kayıtları alır ve kutuyu boşaltır. */
export function takeInbox() {
  let box = [];
  try { box = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]') || []; localStorage.removeItem(INBOX_KEY); } catch { box = []; }
  return Array.isArray(box) ? box.filter(x => x && typeof x.bookId === 'string' && Number(x.pages) > 0) : [];
}
export function pendingInbox(bookId) {
  try { return (JSON.parse(localStorage.getItem(INBOX_KEY) || '[]') || []).filter(x => x.bookId === bookId).reduce((t, x) => t + (Number(x.pages) || 0), 0); } catch { return 0; }
}
