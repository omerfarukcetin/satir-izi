// Hesap (Supabase) ve cihazlar arası eşitleme.
//
// Emanet / SEFER ile aynı Supabase projesi ve aynı hesap. Her kullanıcının verisi satir_izi_state
// tablosunda tek satırdadır ve yalnızca sahibi erişebilir (RLS).
//
// Eşitleme kayıt düzeyindedir: iki cihazda ayrı ayrı eklenen alıntıların ikisi de korunur.
// Aynı kayıt iki yerde değiştiyse updatedAt'i yeni olan kazanır. Silinen kayıtlar "silme izi"
// (tombstone) olarak taşınır ki diğer cihazlar da silsin.
// Taslaklar, toplu tarama fotoğrafları ve yerel tercihler (son kitap vb.) eşitlenmez.
import { CONFIG } from './config.js';
import * as db from './database.js';
import { state, loadState } from './store.js';
import { getApiKey, setApiKey, isKeyRemembered, getKeyUpdatedAt, onKeyChange } from './gemini.js';
import { nowISO, debounce } from './utils.js';

export const SYNC_SCHEMA = 2;
const TOMBSTONE_DAYS = 180;
const BACKUP_MARK = 'satir-izi-cloud-backup';

let sb = null;
let user = null;
let syncing = false, again = false;
const listeners = new Set();
export const status = { state: 'off', message: '', at: null };

export const isConfigured = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseKey && window.supabase?.createClient);
export const currentUser = () => user;
export const onSyncChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
function setStatus(st, message = '') {
  Object.assign(status, { state: st, message, at: st === 'ok' ? new Date() : status.at });
  listeners.forEach(fn => { try { fn(status); } catch (e) { console.error(e); } });
}

// ---------- Hata mesajları ----------
const AUTH_ERR = {
  'Invalid login credentials': 'E-posta veya şifre hatalı.',
  'Email not confirmed': 'E-posta adresiniz henüz onaylanmamış. Gelen kutunuzdaki bağlantıya tıklayın.',
  'User already registered': 'Bu e-posta ile zaten bir hesap var. Giriş yapın.',
};
export function authMessage(e) {
  const m = e?.message || String(e || '');
  return AUTH_ERR[m] || (/rate limit/i.test(m) ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.'
    : /password/i.test(m) ? 'Şifre en az 6 karakter olmalı.'
      : /fetch|network|Failed to/i.test(m) ? 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'
        : 'İşlem tamamlanamadı: ' + m);
}
function dbMessage(e) {
  const m = e?.message || String(e || '');
  if (/satir_izi|relation|schema cache|does not exist|not find/i.test(m)) return 'Bulut tablosu henüz kurulmamış. Supabase SQL Editor’de supabase/satir-izi.sql dosyasını bir kez çalıştırın.';
  if (/JWT|token|401|permission|policy/i.test(m)) return 'Oturum süresi dolmuş olabilir. Çıkış yapıp yeniden giriş yapın.';
  if (/fetch|network|Failed to/i.test(m)) return 'Buluta ulaşılamadı; değişiklikler cihazda duruyor.';
  return 'Eşitlenemedi: ' + m;
}

// ---------- Anlık görüntü ve birleştirme ----------
async function localSnapshot() {
  const settings = {};
  for (const k of db.SYNCED_SETTINGS) {
    const v = await db.getSetting(k, null);
    if (v !== null && v !== undefined) settings[k] = v;
  }
  return {
    schemaVersion: SYNC_SCHEMA,
    books: state.books,
    highlights: state.highlights,
    notes: state.notes,
    tombstones: (await db.getSetting('tombstones', {})) || {},
    settings,
    settingsUpdatedAt: (await db.getSetting('settingsUpdatedAt', 0)) || 0,
    secrets: { geminiKey: getApiKey(), keyUpdatedAt: getKeyUpdatedAt() },
  };
}

const t = r => Date.parse(r?.updatedAt) || 0;

/** Uzak veriyi doğrular (bozuk/yabancı içerik uygulamaya girmez). */
function sanitizeRemote(d) {
  if (!d || typeof d !== 'object') return null;
  const arr = v => (Array.isArray(v) ? v : []);
  const tombs = {};
  if (d.tombstones && typeof d.tombstones === 'object') {
    for (const [k, v] of Object.entries(d.tombstones)) if (typeof v === 'string' && !isNaN(Date.parse(v))) tombs[k] = v;
  }
  const settings = {};
  if (d.settings && typeof d.settings === 'object') {
    for (const k of db.SYNCED_SETTINGS) if (k in d.settings && (typeof d.settings[k] === 'string' || typeof d.settings[k] === 'number')) settings[k] = d.settings[k];
  }
  return {
    schemaVersion: Number(d.schemaVersion) || 0,
    books: arr(d.books).map(b => db.makeBook(b)).filter(b => b.title),
    highlights: arr(d.highlights).map(h => db.makeHighlight(h)).filter(h => h.text && h.bookId),
    notes: arr(d.notes).map(n => db.makeNote(n)).filter(n => n.bookId),
    tombstones: tombs,
    settings,
    settingsUpdatedAt: Number(d.settingsUpdatedAt) || 0,
    secrets: {
      geminiKey: typeof d.secrets?.geminiKey === 'string' ? d.secrets.geminiKey.slice(0, 200) : '',
      keyUpdatedAt: Number(d.secrets?.keyUpdatedAt) || 0,
    },
  };
}

export function mergeSnapshots(local, remote) {
  if (!remote) return local;
  const cutoff = Date.now() - TOMBSTONE_DAYS * 864e5;
  const tombstones = {};
  for (const src of [local.tombstones, remote.tombstones]) {
    for (const [id, at] of Object.entries(src || {})) {
      if (Date.parse(at) < cutoff) continue;
      if (!tombstones[id] || at > tombstones[id]) tombstones[id] = at;
    }
  }
  const mergeList = (a, b) => {
    const map = new Map();
    for (const r of [...a, ...b]) {
      const cur = map.get(r.id);
      if (!cur || t(r) > t(cur)) map.set(r.id, r);
    }
    // Silme izi kayıttan yeniyse kayıt silinmiş sayılır
    return [...map.values()].filter(r => !(tombstones[r.id] && Date.parse(tombstones[r.id]) >= t(r)));
  };
  const books = mergeList(local.books, remote.books);
  const bookIds = new Set(books.map(b => b.id));
  const highlights = mergeList(local.highlights, remote.highlights).filter(h => bookIds.has(h.bookId));
  const notes = mergeList(local.notes, remote.notes).filter(n => bookIds.has(n.bookId));
  const useRemoteSettings = remote.settingsUpdatedAt > local.settingsUpdatedAt;
  const useRemoteKey = remote.secrets.keyUpdatedAt > local.secrets.keyUpdatedAt;
  return {
    schemaVersion: SYNC_SCHEMA,
    books, highlights, notes, tombstones,
    settings: useRemoteSettings ? remote.settings : local.settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
    secrets: useRemoteKey ? remote.secrets : local.secrets,
  };
}

function signature(s) {
  if (!s) return '';
  const part = list => list.map(r => r.id + '@' + t(r)).sort().join(',');
  return [part(s.books), part(s.highlights), part(s.notes), Object.keys(s.tombstones).length,
    s.settingsUpdatedAt, s.secrets.keyUpdatedAt, s.secrets.keyUpdatedAt ? s.secrets.geminiKey.length : 0].join('|');
}
const dataSig = s => (s ? [s.books, s.highlights, s.notes].map(list => list.map(r => r.id + '@' + t(r)).sort().join(',')).join('|') : '');

/** Birleşmiş veriyi bu cihaza yazar (tek işlem). */
async function applyLocal(merged, local) {
  const changedData = dataSig(merged) !== dataSig(local);
  if (changedData) {
    const keep = { books: new Set(merged.books.map(r => r.id)), highlights: new Set(merged.highlights.map(r => r.id)), notes: new Set(merged.notes.map(r => r.id)) };
    const localMap = { books: new Map(local.books.map(r => [r.id, r])), highlights: new Map(local.highlights.map(r => [r.id, r])), notes: new Map(local.notes.map(r => [r.id, r])) };
    await db.runTx(['books', 'highlights', 'notes'], 'readwrite', tx => {
      for (const store of ['books', 'highlights', 'notes']) {
        const os = tx.objectStore(store);
        for (const r of merged[store]) { const cur = localMap[store].get(r.id); if (!cur || t(cur) !== t(r)) os.put(r); }
        for (const r of local[store]) if (!keep[store].has(r.id)) os.delete(r.id);
      }
    });
  }
  await db.put('settings', { key: 'tombstones', value: merged.tombstones });
  let changedSettings = false;
  if (merged.settingsUpdatedAt > local.settingsUpdatedAt) {
    await db.runTx(['settings'], 'readwrite', tx => {
      for (const [k, v] of Object.entries(merged.settings)) tx.objectStore('settings').put({ key: k, value: v });
      tx.objectStore('settings').put({ key: 'settingsUpdatedAt', value: merged.settingsUpdatedAt });
    });
    changedSettings = true;
  }
  if (merged.secrets.keyUpdatedAt > local.secrets.keyUpdatedAt) {
    setApiKey(merged.secrets.geminiKey, isKeyRemembered(), { at: merged.secrets.keyUpdatedAt, silent: true });
  }
  if (changedData) await loadState();
  return { changedData, changedSettings };
}

// ---------- Eşitleme ----------
let afterApply = () => {};
export function onRemoteApplied(fn) { afterApply = fn; }

export async function syncNow({ authoritative = false } = {}) {
  if (!sb || !user) return;
  if (navigator.onLine === false) { setStatus('offline', 'Çevrimdışı · değişiklikler cihazda duruyor'); return; }
  if (syncing) { again = true; return; }
  syncing = true;
  setStatus('syncing', 'Eşitleniyor…');
  try {
    const r = await sb.from(CONFIG.stateTable).select('data,updated_at').eq('user_id', user.id).maybeSingle();
    if (r.error) throw r.error;
    const remote = sanitizeRemote(r.data?.data);
    if (remote && remote.schemaVersion > SYNC_SCHEMA) {
      setStatus('error', 'Buluttaki veri uygulamanın daha yeni bir sürümüyle kaydedilmiş. Uygulamayı güncelleyin.');
      return;
    }
    const local = await localSnapshot();
    let merged;
    if (authoritative && remote) {
      // Geri yükleme / tümünü silme: bu cihazdaki hâl esas alınır.
      const now = nowISO();
      const localIds = new Set([...local.books, ...local.highlights, ...local.notes].map(x => x.id));
      const tombs = { ...local.tombstones };
      for (const x of [...remote.books, ...remote.highlights, ...remote.notes]) if (!localIds.has(x.id)) tombs[x.id] = now;
      const bump = list => list.map(x => ({ ...x, updatedAt: now }));
      merged = { ...local, books: bump(local.books), highlights: bump(local.highlights), notes: bump(local.notes), tombstones: tombs };
      await db.runTx(['books', 'highlights', 'notes'], 'readwrite', tx => {
        merged.books.forEach(x => tx.objectStore('books').put(x));
        merged.highlights.forEach(x => tx.objectStore('highlights').put(x));
        merged.notes.forEach(x => tx.objectStore('notes').put(x));
      });
      await db.put('settings', { key: 'tombstones', value: tombs });
      await loadState();
    } else {
      merged = mergeSnapshots(local, remote);
      const applied = await applyLocal(merged, local);
      if (applied.changedData || applied.changedSettings) afterApply(applied);
    }
    if (!remote || signature(merged) !== signature(remote)) {
      const w = await sb.from(CONFIG.stateTable).upsert({ user_id: user.id, data: merged, updated_at: Date.now() });
      if (w.error) throw w.error;
    }
    await db.setSetting('lastSyncAt', nowISO());
    setStatus('ok', 'Eşitlendi');
    cloudBackup(merged).catch(() => {});
  } catch (e) {
    console.warn('Eşitleme hatası', e?.message || e);
    setStatus('error', dbMessage(e));
  } finally {
    syncing = false;
    if (again) { again = false; scheduleSync(); }
  }
}

const scheduleSync = debounce(() => syncNow(), 1500);

// ---------- Günlük bulut yedeği (API anahtarı hariç) ----------
async function cloudBackup(snap) {
  if (!user || !(snap.books.length || snap.highlights.length)) return;
  const day = new Date().toISOString().slice(0, 10);
  let last = {};
  try { last = JSON.parse(localStorage.getItem(BACKUP_MARK) || '{}') || {}; } catch { /* yok */ }
  if (last.u === user.id && last.d === day && Date.now() - last.t < 30 * 60e3) return;
  const data = { app: 'satir-izi', schemaVersion: 2, exportedAt: nowISO(), books: snap.books, highlights: snap.highlights, notes: snap.notes };
  const meta = { books: snap.books.length, highlights: snap.highlights.length, notes: snap.notes.length };
  const { error } = await sb.from(CONFIG.backupTable).upsert({ user_id: user.id, day, data, meta, updated_at: nowISO() }, { onConflict: 'user_id,day' });
  if (error) return;
  localStorage.setItem(BACKUP_MARK, JSON.stringify({ u: user.id, d: day, t: Date.now() }));
  if (last.d !== day) {
    const old = new Date(Date.now() - CONFIG.backupDays * 864e5).toISOString().slice(0, 10);
    sb.from(CONFIG.backupTable).delete().eq('user_id', user.id).lt('day', old).then(() => {}, () => {});
  }
}

export async function listCloudBackups() {
  const r = await sb.from(CONFIG.backupTable).select('day,meta,updated_at').eq('user_id', user.id).order('day', { ascending: false }).limit(40);
  if (r.error) throw new Error(dbMessage(r.error));
  return r.data || [];
}
export async function getCloudBackup(day) {
  const r = await sb.from(CONFIG.backupTable).select('data').eq('user_id', user.id).eq('day', day).single();
  if (r.error || !r.data?.data) throw new Error('Yedek okunamadı.');
  return r.data.data;
}

// ---------- Oturum ----------
let loginHandler = async () => true;
/** Hesap değişimi gibi kullanıcı onayı gereken durumlar için arayüz bağlanır. */
export function setLoginHandler(fn) { loginHandler = fn; }
let recoveryHandler = () => {};
export function setRecoveryHandler(fn) { recoveryHandler = fn; }

async function onLogin(u) {
  if (user?.id === u.id) return;
  const owner = await db.getSetting('cloudOwner', null);
  const hasLocal = state.books.length || state.highlights.length || state.notes.length;
  if (owner && owner !== u.id && hasLocal) {
    // Bu cihazdaki arşiv başka bir hesaba ait: kullanıcıya sor
    const choice = await loginHandler({ type: 'other-owner', email: u.email });
    if (choice === 'cancel') { await sb.auth.signOut(); return; }
    if (choice === 'replace') {
      await db.runTx(['books', 'highlights', 'notes', 'scanDrafts', 'scanJobs'], 'readwrite', tx => {
        ['books', 'highlights', 'notes', 'scanDrafts', 'scanJobs'].forEach(s => tx.objectStore(s).clear());
      });
      await db.put('settings', { key: 'tombstones', value: {} });
      await loadState();
    }
  }
  user = u;
  await db.setSetting('cloudOwner', u.id);
  setStatus('syncing', 'Eşitleniyor…');
  await syncNow();
}

export async function initSync() {
  if (!isConfigured()) { setStatus('off', ''); return; }
  try {
    sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  } catch (e) { console.warn(e); sb = null; return; }

  db.onLocalChange(() => { if (user) scheduleSync(); });
  onKeyChange(() => { if (user) scheduleSync(); });
  window.addEventListener('online', () => user && syncNow());
  window.addEventListener('offline', () => user && setStatus('offline', 'Çevrimdışı · değişiklikler cihazda duruyor'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) syncNow(); });

  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') setTimeout(() => recoveryHandler(), 0);
    else if (ev === 'SIGNED_IN' && session && user?.id !== session.user.id) setTimeout(() => onLogin(session.user), 0);
    else if (ev === 'SIGNED_OUT') { user = null; setStatus('signedout', ''); }
  });
  let session = null;
  try { session = (await sb.auth.getSession()).data.session; } catch { /* çevrimdışı */ }
  if (session) await onLogin(session.user);
  else setStatus('signedout', '');
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authMessage(error));
  if (data?.user) await onLogin(data.user);
}
export async function signUp(email, password) {
  const back = location.origin + location.pathname;
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: back } });
  if (error) throw new Error(authMessage(error));
  if (data?.session) { await onLogin(data.session.user); return 'signed-in'; }
  return 'confirm-email';
}
export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(authMessage(error));
}
export async function changePassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(authMessage(error));
}
/** wipeLocal: true ise bu cihazdaki arşiv ve anahtar da silinir. */
export async function signOut({ wipeLocal = false } = {}) {
  if (user) await syncNow();
  await sb.auth.signOut();
  user = null;
  if (wipeLocal) {
    await db.runTx(['books', 'highlights', 'notes', 'scanDrafts', 'scanJobs'], 'readwrite', tx => {
      ['books', 'highlights', 'notes', 'scanDrafts', 'scanJobs'].forEach(s => tx.objectStore(s).clear());
    });
    await db.put('settings', { key: 'tombstones', value: {} });
    await db.put('settings', { key: 'cloudOwner', value: null });
    setApiKey('', false, { silent: true, at: 0 });
    await loadState();
  }
  setStatus('signedout', '');
}
