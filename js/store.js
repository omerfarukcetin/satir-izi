// Bellekteki uygulama durumu + IndexedDB'ye yazan değişiklik fonksiyonları.
import * as db from './database.js';
import { nowISO, normalizeText } from './utils.js';

export const state = {
  books: [],
  highlights: [],
  notes: [],
  drafts: [],
};

export async function loadState() {
  const [books, highlights, notes, drafts] = await Promise.all([
    db.getAll('books'), db.getAll('highlights'), db.getAll('notes'), db.getAll('scanDrafts'),
  ]);
  Object.assign(state, { books, highlights, notes, drafts });
  return state;
}

export const bookById = id => state.books.find(b => b.id === id) || null;
export const highlightsOf = bookId => state.highlights.filter(h => h.bookId === bookId);
export const notesOf = bookId => state.notes.filter(n => n.bookId === bookId);

function upsert(list, item) {
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
}

// ---- Kitaplar ----
export async function saveBook(input) {
  const existing = input.id ? bookById(input.id) : null;
  const book = db.makeBook({ ...existing, ...input, createdAt: existing?.createdAt, updatedAt: nowISO() });
  if (!book.title || !book.author) throw new Error('Kitap adı ve yazar zorunludur.');
  await db.put('books', book);
  upsert(state.books, book);
  return book;
}

/** Kitabı, alıntılarını, notlarını ve taslaklarını tek işlemde siler. */
export async function deleteBook(bookId) {
  const hIds = state.highlights.filter(h => h.bookId === bookId).map(h => h.id);
  const nIds = state.notes.filter(n => n.bookId === bookId).map(n => n.id);
  const dIds = state.drafts.filter(d => d.bookId === bookId).map(d => d.id);
  await db.runTx(['books', 'highlights', 'notes', 'scanDrafts'], 'readwrite', tx => {
    tx.objectStore('books').delete(bookId);
    hIds.forEach(id => tx.objectStore('highlights').delete(id));
    nIds.forEach(id => tx.objectStore('notes').delete(id));
    dIds.forEach(id => tx.objectStore('scanDrafts').delete(id));
  });
  state.books = state.books.filter(b => b.id !== bookId);
  state.highlights = state.highlights.filter(h => h.bookId !== bookId);
  state.notes = state.notes.filter(n => n.bookId !== bookId);
  state.drafts = state.drafts.filter(d => d.bookId !== bookId);
}

function touchBook(bookId, tx) {
  const b = bookById(bookId);
  if (!b) return;
  const updated = { ...b, updatedAt: nowISO() };
  tx.objectStore('books').put(updated);
  upsert(state.books, updated);
}

// ---- Alıntılar ----
/** Aynı kitapta aynı metin (Türkçe büyük/küçük harf ve boşluk farkı yok sayılarak) var mı? */
export function findDuplicate(bookId, text, exceptId = null) {
  const key = normalizeText(text);
  if (!key) return null;
  return state.highlights.find(h => h.bookId === bookId && h.id !== exceptId && normalizeText(h.text) === key) || null;
}

/** Bir veya daha fazla alıntıyı tek işlemde kaydeder (yeni veya güncelleme). */
export async function saveHighlights(items) {
  const now = nowISO();
  const records = items.map(it => {
    const existing = it.id ? state.highlights.find(h => h.id === it.id) : null;
    return db.makeHighlight({ ...existing, ...it, createdAt: existing?.createdAt || now, updatedAt: now }, now);
  }).filter(h => h.text && h.bookId);
  if (!records.length) return [];
  const bookIds = [...new Set(records.map(r => r.bookId))];
  await db.runTx(['highlights', 'books'], 'readwrite', tx => {
    records.forEach(r => tx.objectStore('highlights').put(r));
    bookIds.forEach(id => touchBook(id, tx));
  });
  records.forEach(r => upsert(state.highlights, r));
  return records;
}

export async function deleteHighlight(id) {
  await db.del('highlights', id);
  state.highlights = state.highlights.filter(h => h.id !== id);
}

export async function toggleFavorite(id) {
  const h = state.highlights.find(x => x.id === id);
  if (!h) return null;
  const updated = { ...h, favorite: !h.favorite, updatedAt: nowISO() };
  await db.put('highlights', updated);
  upsert(state.highlights, updated);
  return updated;
}

// ---- Kişisel notlar (kitap düzeyinde) ----
export async function saveNote(input) {
  const existing = input.id ? state.notes.find(n => n.id === input.id) : null;
  const note = db.makeNote({ ...existing, ...input, createdAt: existing?.createdAt, updatedAt: nowISO() });
  if (!note.text.trim()) throw new Error('Not boş olamaz.');
  await db.put('notes', note);
  upsert(state.notes, note);
  return note;
}
export async function deleteNote(id) {
  await db.del('notes', id);
  state.notes = state.notes.filter(n => n.id !== id);
}

// ---- Tarama taslakları ----
export async function saveDraft(draft) {
  const d = { ...draft, updatedAt: nowISO() };
  await db.put('scanDrafts', d);
  upsert(state.drafts, d);
  return d;
}
export async function deleteDraft(id) {
  await db.del('scanDrafts', id);
  state.drafts = state.drafts.filter(d => d.id !== id);
}
