// Haftalık / aylık özet: dönem hesapları, cihazda hesaplanan bölümler ve eşitleme için doğrulama.
// Özetler alıntı metni değil yalnızca kayıt kimliklerini saklar; metin her zaman kayıtlı alıntının kendisinden gösterilir.
import { state, bookById } from './store.js';
import { inlineTags } from './links.js';

const pad = n => String(n).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** Dönem: { id, type, from, to (hariç), label } — hafta pazartesi başlar */
export function periodOf(type, date = new Date()) {
  if (type === 'hafta') {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const end = new Date(d); end.setDate(end.getDate() + 7);
    const last = new Date(end); last.setDate(last.getDate() - 1);
    const label = d.getMonth() === last.getMonth()
      ? `${d.getDate()}–${last.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      : `${d.getDate()} ${MONTHS[d.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
    return { id: 'H-' + dayKey(d), type, from: dayKey(d), to: dayKey(end), label };
  }
  const d = new Date(date.getFullYear(), date.getMonth(), 1), end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { id: `A-${d.getFullYear()}-${pad(d.getMonth() + 1)}`, type: 'ay', from: dayKey(d), to: dayKey(end), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
}
/** Biten son dönem */
export function lastCompleted(type, now = new Date()) {
  const cur = periodOf(type, now);
  const prev = parseDay(cur.from); prev.setDate(prev.getDate() - 1);
  return periodOf(type, prev);
}
export function periodById(id) {
  const m = /^(H|A)-(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(id || '');
  if (!m) return null;
  return m[1] === 'H' ? periodOf('hafta', new Date(+m[2], +m[3] - 1, +m[4] || 1)) : periodOf('ay', new Date(+m[2], +m[3] - 1, 1));
}

const inRange = (iso, p) => { if (!iso) return false; const k = dayKey(new Date(iso)); return k >= p.from && k < p.to; };
export const periodItems = p => ({
  highlights: state.highlights.filter(h => inRange(h.createdAt, p)),
  notes: state.notes.filter(n => inRange(n.createdAt, p)),
});

/** Sefer'in bu cihazdaki kayıtlarından dönemde okunan sayfalar (kitap başına). Sefer yoksa boş. */
export function seferPages(p) {
  const out = new Map();
  try {
    const S = JSON.parse(localStorage.getItem('sefer-v1') || 'null');
    if (!S?.tasks || !S.days) return out;
    for (const t of S.tasks) {
      if (!t?.siBook) continue;
      let n = 0;
      for (const [k, r] of Object.entries(S.days)) {
        if (k < p.from || k >= p.to || !r) continue;
        const e = r.done?.[t.id];
        n += e ? (+e.n || 0) : (+r.prog?.[t.id] || 0);
      }
      if (n > 0) out.set(t.siBook, (out.get(t.siBook) || 0) + n);
    }
  } catch { /* Sefer verisi okunamadı: sayfa bilgisi olmadan devam */ }
  return out;
}

const itemTags = x => [...(x.tags || []), ...inlineTags(x.comment ?? x.text)];

/** İmza: dönemin içeriği değişince "güncelle" önerilir */
export function periodSig(p) {
  const { highlights, notes } = periodItems(p);
  const last = [...highlights, ...notes].map(x => x.updatedAt).sort().pop() || '';
  return `${highlights.length}|${notes.length}|${last}`;
}

// Basit tekrarlanabilir sıralama (aynı dönem hep aynı "hatırla" seçimini verir)
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Yapay zekâ olmadan hesaplanan bölümler */
export function computeLocal(p) {
  const { highlights, notes } = periodItems(p);
  const pages = seferPages(p);
  const per = new Map();
  const bump = (id, k) => { const e = per.get(id) || { id, quotes: 0, notes: 0, pages: 0 }; e[k]++; per.set(id, e); };
  highlights.forEach(h => bump(h.bookId, 'quotes'));
  notes.forEach(n => bump(n.bookId, 'notes'));
  for (const [id, n] of pages) { if (!bookById(id)) continue; const e = per.get(id) || { id, quotes: 0, notes: 0, pages: 0 }; e.pages = n; per.set(id, e); }
  const books = [...per.values()].filter(b => bookById(b.id)).sort((a, b) => (b.quotes + b.notes) - (a.quotes + a.notes) || b.pages - a.pages);
  const started = state.books.filter(b => b.startDate && b.startDate >= p.from && b.startDate < p.to).map(b => b.id);
  const finished = state.books.filter(b => b.status === 'tamamlandi' && b.endDate && b.endDate >= p.from && b.endDate < p.to).map(b => b.id);
  const tagMap = new Map();
  for (const x of [...highlights, ...notes]) for (const t of new Set(itemTags(x).map(s => s.trim()).filter(Boolean))) { const k = t.toLocaleLowerCase('tr'); const e = tagMap.get(k) || [t, 0]; e[1]++; tagMap.set(k, e); }
  const tags = [...tagMap.values()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  // Cihazın seçimi: yorumlu/etiketli olanlar önce, kitaplara dağılmış en fazla 6 alıntı
  const score = h => (h.comment?.trim() ? 3 : 0) + ((h.tags || []).length ? 2 : 0) + Math.min(2, h.text.length / 200);
  const byBook = new Map();
  [...highlights].sort((a, b) => score(b) - score(a)).forEach(h => (byBook.get(h.bookId) || byBook.set(h.bookId, []).get(h.bookId)).push(h));
  const pick = [];
  for (let round = 0; pick.length < 6 && round < 6; round++) for (const list of byBook.values()) if (list[round] && pick.length < 6) pick.push(list[round].id);
  // Unutmamak için: dönemden en az 3 hafta önceki, bu dönemin etiketleriyle ilgili alıntılar
  const cutoff = new Date(parseDay(p.from)); cutoff.setDate(cutoff.getDate() - 21);
  const older = state.highlights.filter(h => h.createdAt && new Date(h.createdAt) < cutoff);
  const tagKeys = new Set(tags.map(t => t[0].toLocaleLowerCase('tr')));
  const related = older.filter(h => itemTags(h).some(t => tagKeys.has(t.toLocaleLowerCase('tr'))));
  const pool = (related.length >= 2 ? related : older).slice().sort((a, b) => hash(p.id + a.id) - hash(p.id + b.id));
  const remember = pool.slice(0, 3).map(h => h.id);
  return {
    stats: { quotes: highlights.length, notes: notes.length, comments: highlights.filter(h => h.comment?.trim()).length, pages: books.reduce((t, b) => t + b.pages, 0) },
    books, started, finished, tags, pick, remember, rememberRelated: related.length >= 2,
  };
}

// ---------- Saklama / eşitleme doğrulaması ----------
const s = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const ids = (v, max = 40) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length <= 80).slice(0, max) : []);
const num = v => (Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : 0);
export function sanitizeDigest(d) {
  const p = periodById(d?.id);
  if (!p || !d || typeof d !== 'object' || isNaN(Date.parse(d.createdAt))) return null;
  const L = d.local || {};
  const ai = d.ai && typeof d.ai === 'object' ? {
    model: s(d.ai.model, 80),
    overview: (Array.isArray(d.ai.overview) ? d.ai.overview : []).slice(0, 6).map(x => ({ text: s(x?.text, 2000), refs: ids(x?.refs, 12) })).filter(x => x.text),
    books: (Array.isArray(d.ai.books) ? d.ai.books : []).slice(0, 30).map(x => ({ bookId: s(x?.bookId, 80), text: s(x?.text, 1500), refs: ids(x?.refs, 12) })).filter(x => x.text && x.bookId),
    themes: (Array.isArray(d.ai.themes) ? d.ai.themes : []).slice(0, 8).map(x => ({ title: s(x?.title, 80), refs: ids(x?.refs, 12) })).filter(x => x.title),
    dropped: num(d.ai.dropped),
  } : null;
  return {
    id: p.id, type: p.type, createdAt: d.createdAt, sig: s(d.sig, 200), empty: d.empty === true,
    local: {
      stats: { quotes: num(L.stats?.quotes), notes: num(L.stats?.notes), comments: num(L.stats?.comments), pages: num(L.stats?.pages) },
      books: (Array.isArray(L.books) ? L.books : []).slice(0, 60).map(b => ({ id: s(b?.id, 80), quotes: num(b?.quotes), notes: num(b?.notes), pages: num(b?.pages) })).filter(b => b.id),
      started: ids(L.started), finished: ids(L.finished),
      tags: (Array.isArray(L.tags) ? L.tags : []).slice(0, 8).filter(t => Array.isArray(t)).map(t => [s(t[0], 60), num(t[1])]).filter(t => t[0]),
      pick: ids(L.pick, 10), remember: ids(L.remember, 5), rememberRelated: L.rememberRelated === true,
    },
    pick: ids(d.pick, 10),
    ai,
    aiError: s(d.aiError, 300), aiErrorAt: isNaN(Date.parse(d.aiErrorAt)) ? '' : d.aiErrorAt,
  };
}
export function sanitizeDigests(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const d of Object.values(v).slice(0, 400)) { const x = sanitizeDigest(d); if (x) out[x.id] = x; }
  return out;
}
export function mergeDigests(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, d] of Object.entries(b || {})) {
    const cur = out[id];
    // Yapay zekâ bölümü olan özet tercih edilir; ikisi de aynıysa yenisi
    if (!cur || (d.ai && !cur.ai) || (!!d.ai === !!cur.ai && d.createdAt > cur.createdAt)) out[id] = d;
  }
  return out;
}
export const digestsSig = v => Object.values(v || {}).map(d => `${d.id}@${d.createdAt}${d.ai ? '+' : ''}`).sort().join(',');
