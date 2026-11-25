// JSON yedekleme ve geri yükleme. API anahtarı ve ayarlar yedeğe hiçbir zaman girmez.
import * as db from './database.js';
import { state, loadState } from './store.js';
import { APP_VERSION, nowISO, normalizeText, download } from './utils.js';

export const BACKUP_SCHEMA_VERSION = 2;

export function buildBackup() {
  return {
    app: 'satir-izi',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowISO(),
    books: state.books,
    highlights: state.highlights,
    notes: state.notes,
  };
}

export async function downloadBackup(prefix = 'satir-izi-yedek') {
  const data = buildBackup();
  const stamp = new Date().toISOString().slice(0, 10);
  download(`${prefix}-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
  await db.setSetting('lastBackupAt', nowISO());
}

/** Yedek metnini doğrular ve temiz kayıtlara dönüştürür. Veritabanına dokunmaz. */
export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('Dosya okunamadı: geçerli bir JSON yedeği değil.'); }
  if (!raw || typeof raw !== 'object') throw new Error('Yedek dosyası boş veya bozuk.');

  // v1: { version: 1, books: [{ title, author, notes: [...] }] }
  if (raw.version === 1 && Array.isArray(raw.books)) {
    const { books, highlights } = db.convertLegacyBooks(raw.books);
    return { books, highlights, notes: [], schemaVersion: 1, dropped: 0 };
  }

  const v = raw.schemaVersion;
  if (typeof v !== 'number') throw new Error('Bu dosya bir Satır İzi yedeği gibi görünmüyor.');
  if (v > BACKUP_SCHEMA_VERSION) throw new Error('Bu yedek uygulamanın daha yeni bir sürümüyle alınmış. Önce uygulamayı güncelleyin.');
  if (!Array.isArray(raw.books) || !Array.isArray(raw.highlights)) throw new Error('Yedek dosyasında kitap veya alıntı listesi eksik.');

  const books = raw.books.map(b => db.makeBook(b)).filter(b => b.title);
  const ids = new Set(books.map(b => b.id));
  if (ids.size !== books.length) throw new Error('Yedekte aynı kimliğe sahip birden fazla kitap var; dosya bozuk olabilir.');
  const hl = raw.highlights.map(h => db.makeHighlight(h));
  const highlights = hl.filter(h => h.text && ids.has(h.bookId));
  const nt = (Array.isArray(raw.notes) ? raw.notes : []).map(n => db.makeNote(n));
  const notes = nt.filter(n => n.text.trim() && ids.has(n.bookId));
  return { books, highlights, notes, schemaVersion: v, dropped: (hl.length - highlights.length) + (nt.length - notes.length) };
}

const newer = (a, b) => (Date.parse(a.updatedAt) || 0) >= (Date.parse(b.updatedAt) || 0);

/**
 * mode: 'overwrite' → mevcut kitap/alıntı/notları siler, yedeği yazar.
 *       'merge'     → mevcut veriyi korur; yeni kayıtları ekler, aynı kayıtlarda daha yeni olanı tutar.
 * Tümü tek IndexedDB işleminde yapılır; hata olursa hiçbir şey değişmez.
 */
export async function applyRestore(data, mode) {
  const result = { books: 0, highlights: 0, notes: 0, skipped: 0 };
  const stores = ['books', 'highlights', 'notes', 'scanDrafts'];

  if (mode === 'overwrite') {
    await db.runTx(stores, 'readwrite', tx => {
      stores.forEach(s => tx.objectStore(s).clear());
      data.books.forEach(b => tx.objectStore('books').put(b));
      data.highlights.forEach(h => tx.objectStore('highlights').put(h));
      data.notes.forEach(n => tx.objectStore('notes').put(n));
    });
    Object.assign(result, { books: data.books.length, highlights: data.highlights.length, notes: data.notes.length });
  } else {
    const byId = new Map(state.books.map(b => [b.id, b]));
    const byName = new Map(state.books.map(b => [normalizeText(b.title) + '|' + normalizeText(b.author), b]));
    const bookMap = new Map(); // yedek kitap id → hedef id
    const bookWrites = [];
    for (const b of data.books) {
      const same = byId.get(b.id) || byName.get(normalizeText(b.title) + '|' + normalizeText(b.author));
      if (same) {
        bookMap.set(b.id, same.id);
        if (same.id === b.id && !newer(same, b)) { bookWrites.push(b); result.books++; }
      } else {
        bookMap.set(b.id, b.id);
        bookWrites.push(b);
        result.books++;
      }
    }
    const hById = new Map(state.highlights.map(h => [h.id, h]));
    const hKeys = new Set(state.highlights.map(h => h.bookId + '|' + normalizeText(h.text)));
    const hWrites = [];
    for (const h0 of data.highlights) {
      const h = { ...h0, bookId: bookMap.get(h0.bookId) };
      const existing = hById.get(h.id);
      if (existing) {
        if (!newer(existing, h)) { hWrites.push(h); result.highlights++; } else result.skipped++;
        continue;
      }
      const key = h.bookId + '|' + normalizeText(h.text);
      if (hKeys.has(key)) { result.skipped++; continue; }
      hKeys.add(key);
      hWrites.push(h);
      result.highlights++;
    }
    const nById = new Map(state.notes.map(n => [n.id, n]));
    const nWrites = [];
    for (const n0 of data.notes) {
      const n = { ...n0, bookId: bookMap.get(n0.bookId) };
      const existing = nById.get(n.id);
      if (existing && newer(existing, n)) { result.skipped++; continue; }
      nWrites.push(n);
      result.notes++;
    }
    await db.runTx(['books', 'highlights', 'notes'], 'readwrite', tx => {
      bookWrites.forEach(b => tx.objectStore('books').put(b));
      hWrites.forEach(h => tx.objectStore('highlights').put(h));
      nWrites.forEach(n => tx.objectStore('notes').put(n));
    });
  }
  await loadState();
  return result;
}
