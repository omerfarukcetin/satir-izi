// Toplu tarama kuyruğu. Fotoğraflar sırayla (asla paralel değil), aralarında bekleme süresiyle taranır.
// Kota dolması, geçersiz anahtar, bağlantı kopması gibi durumlarda iş duraklatılır; tamamlananlar kaybolmaz.
// Uygulama arka plandayken tarayıcı işlemi durdurabilir; kesintisiz arka plan çalışması vaat edilmez.
import { state, jobById, saveJob, getJobPhotos, savePhoto } from './store.js';
import { extractHighlights } from './gemini.js';
import { blobToBase64 } from './scanner.js';

// Bu hatalarda sıradaki fotoğraflar da başarısız olacağı için işi duraklat
const STOP_CODES = new Set(['quota', 'no_free_tier', 'invalid_key', 'forbidden', 'region', 'model_not_found',
  'unsupported_model', 'offline', 'network', 'no_key', 'bad_model_id']);
export const MAX_ATTEMPTS = 3;

const listeners = new Set();
let current = null; // { jobId, fetchCtrl, sleepCtrl }
let wakeLock = null;

export const onRunnerChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = jobId => listeners.forEach(fn => { try { fn(jobId); } catch (e) { console.error(e); } });
export const isRunning = jobId => current?.jobId === jobId;

async function lockScreen() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* desteklenmiyor */ }
}
function unlockScreen() { try { wakeLock?.release(); } catch { /* yok */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && current) lockScreen(); });

function sleep(ms, signal) {
  return new Promise(res => {
    if (!ms) { res(); return; }
    const t = setTimeout(res, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });
}

export function summarize(photos) {
  const s = { total: photos.length, done: 0, pending: 0, processing: 0, failed: 0, quotes: 0 };
  for (const p of photos) {
    s[p.status] = (s[p.status] || 0) + 1;
    if (p.status === 'done') s.quotes += p.result?.items?.length || 0;
  }
  s.finished = s.done + s.failed;
  s.pct = s.total ? Math.round(s.done / s.total * 100) : 0;
  return s;
}

function setTitle(summary) {
  document.title = summary ? `(${summary.done}/${summary.total}) Satır İzi` : 'Satır İzi';
}

/** İşi başlatır veya kaldığı yerden sürdürür. Aynı anda yalnızca bir iş çalışır. */
export async function startJob(jobId) {
  if (current) {
    if (current.jobId === jobId) return;
    throw new Error('Başka bir toplu tarama sürüyor. Önce onu duraklat.');
  }
  let job = jobById(jobId);
  if (!job) return;
  job = await saveJob({ ...job, status: 'running', pauseReason: '' });
  current = { jobId, fetchCtrl: null, sleepCtrl: null };
  lockScreen();
  notify(jobId);
  try {
    for (;;) {
      job = jobById(jobId);
      if (!job || job.status !== 'running') break;
      const photos = await getJobPhotos(jobId);
      const next = photos.find(p => p.status === 'pending');
      if (!next) {
        const s = summarize(photos);
        await saveJob({ ...job, status: s.failed ? 'paused' : 'done', pauseReason: s.failed ? `${s.failed} fotoğraf taranamadı. Yeniden deneyebilir veya atlayabilirsin.` : '' });
        break;
      }
      next.status = 'processing';
      await savePhoto(next);
      setTitle(summarize(photos));
      notify(jobId);

      current.fetchCtrl = new AbortController();
      let stopReason = '';
      try {
        const base64 = await blobToBase64(next.blob);
        const result = await extractHighlights({ base64, mimeType: next.blob.type || 'image/jpeg', signal: current.fetchCtrl.signal });
        Object.assign(next, { status: 'done', result, error: '' });
      } catch (e) {
        if (e.code === 'aborted') {
          next.status = 'pending';
        } else if (STOP_CODES.has(e.code)) {
          next.status = 'pending';
          stopReason = e.full || e.message;
        } else {
          next.attempts = (next.attempts || 0) + 1;
          Object.assign(next, { status: 'failed', error: e.full || e.message || 'Bilinmeyen hata' });
        }
      } finally {
        current.fetchCtrl = null;
      }
      await savePhoto(next);
      if (stopReason) {
        await saveJob({ ...jobById(jobId), status: 'paused', pauseReason: stopReason });
        notify(jobId);
        break;
      }
      notify(jobId);

      job = jobById(jobId);
      if (!job || job.status !== 'running') break;
      const remaining = (await getJobPhotos(jobId)).some(p => p.status === 'pending');
      if (!remaining) continue;
      // Ücretsiz katmanın dakikalık sınırını aşmamak için bekle
      current.sleepCtrl = new AbortController();
      await sleep((job.delaySec ?? 4) * 1000, current.sleepCtrl.signal);
      current.sleepCtrl = null;
    }
  } catch (e) {
    console.error(e);
    const j = jobById(jobId);
    if (j) await saveJob({ ...j, status: 'paused', pauseReason: 'Beklenmeyen hata: ' + (e.message || e) });
  } finally {
    current = null;
    unlockScreen();
    setTitle(null);
    notify(jobId);
  }
}

/** Mevcut fotoğraf bitince durur. */
export async function pauseJob(jobId, reason = 'Duraklatıldı.') {
  const job = jobById(jobId);
  if (!job) return;
  await saveJob({ ...job, status: 'paused', pauseReason: reason });
  if (current?.jobId === jobId) current.sleepCtrl?.abort();
  notify(jobId);
}

/** Hemen durdurur; işlenen fotoğrafın isteği iptal edilir ve sıraya geri döner. */
export async function stopJobNow(jobId) {
  await pauseJob(jobId, 'Durduruldu.');
  if (current?.jobId === jobId) current.fetchCtrl?.abort();
}

/** Başarısız fotoğrafları yeniden sıraya alır. */
export async function retryFailed(jobId, photoIds = null) {
  const photos = await getJobPhotos(jobId);
  for (const p of photos) {
    if (p.status === 'failed' && (!photoIds || photoIds.includes(p.id))) {
      await savePhoto({ ...p, status: 'pending', error: '' });
    }
  }
  notify(jobId);
}

/** Uygulama açılışında: yarıda kalan işleri "duraklatıldı" durumuna getir. */
export async function recoverJobs() {
  for (const job of state.jobs) {
    if (job.status !== 'running') continue;
    for (const p of await getJobPhotos(job.id)) {
      if (p.status === 'processing') await savePhoto({ ...p, status: 'pending' });
    }
    await saveJob({ ...job, status: 'paused', pauseReason: 'Uygulama kapandığı veya arka plana alındığı için tarama yarıda kaldı. Kaldığın yerden devam edebilirsin.' });
  }
}
