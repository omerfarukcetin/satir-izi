// Ayarlar ekranı ve tema/yazı boyutu uygulama.
import { el, APP_VERSION, toast, confirmDialog, choiceDialog, readFileAsText, formatBytes, formatDate } from './utils.js';
import { icon } from './icons.js';
import { getSetting, setSetting, wipeAll, requestPersistence, DEFAULT_MODEL } from './database.js';
import { state, loadState } from './store.js';
import { refresh } from './router.js';
import { button, pageHeader, field, select } from './ui.js';
import { getApiKey, setApiKey, isKeyRemembered, getModel, setModel, testConnection, validateModelId } from './gemini.js';
import { downloadBackup, parseBackup, applyRestore } from './backup.js';
import { exportAll } from './export.js';
import { accountCard } from './account.js';
import * as sync from './sync.js';

// ---- Tema ve yazı boyutu (Sefer ile aynı seçenekler) ----
// Tema: dark (Gece) · light (Gündüz) · auto (Cihaza göre). Yazı boyutu: 0.8 · 0.9 · 1 · 1.12 · 1.25.
// "Sefer ile aynı" açıkken (varsayılan) seçimler Sefer'den okunur (aynı alan adı → aynı localStorage).
export const THEMES = [['dark', 'Gece'], ['light', 'Gündüz'], ['auto', 'Cihaza göre']];
export const FONT_SCALES = [['0.8', 'Çok küçük'], ['0.9', 'Küçük'], ['1', 'Normal'], ['1.12', 'Büyük'], ['1.25', 'Çok büyük']];
const OLD_FONT = { normal: 1, large: 1.12, xlarge: 1.25 };

export function seferUI() {
  try {
    const raw = localStorage.getItem('sefer-v1');
    if (!raw) return null;
    const ui = JSON.parse(raw)?.ui;
    if (!ui) return null;
    return { theme: ['dark', 'light', 'auto'].includes(ui.theme) ? ui.theme : 'dark', font: Number(ui.font) > 0 ? Number(ui.font) : 1 };
  } catch { return null; }
}

/** Geçerli görünüm: { theme, font, source: 'sefer' | 'own' } */
export async function currentAppearance() {
  const embedded = document.documentElement.classList.contains('embedded');
  const follow = embedded || (await getSetting('followSefer', true));
  const sf = follow ? seferUI() : null;
  if (sf) return { ...sf, source: 'sefer' };
  let theme = await getSetting('theme', 'auto');
  if (theme === 'system') theme = 'auto';
  let font = Number(await getSetting('fontScale', 0));
  if (!font) font = OLD_FONT[await getSetting('fontSize', 'normal')] || 1;
  return { theme, font, source: 'own' };
}

export async function applyAppearance() {
  const { theme, font } = await currentAppearance();
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = theme;
  root.style.fontSize = `${Math.round(16 * font * 100) / 100}px`;
  root.removeAttribute('data-font');
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#13294b' : '#eef2f8');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyAppearance());
// Sefer'de görünüm değişince (aynı tarayıcıda) uygula
window.addEventListener('storage', e => { if (e.key === 'sefer-v1') applyAppearance(); });

function segmented(options, value, onPick, { disabled = false, label } = {}) {
  const wrap = el('div', { class: 'chips seg', role: 'group', 'aria-label': label });
  for (const [v, l] of options) {
    const b = el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(String(value) === v), disabled }, l);
    b.onclick = async () => { wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); await onPick(v); };
    wrap.append(b);
  }
  return wrap;
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });

const card = (title, ...children) => el('section', { class: 'card settings-card' }, el('h2', {}, title), ...children);

export async function settingsView() {
  const model = await getModel();
  const look = await currentAppearance();
  const followSefer = await getSetting('followSefer', true);
  const quality = await getSetting('scanQuality', 'standard');
  const lastBackup = await getSetting('lastBackupAt', null);

  // --- Gemini ---
  const keyInput = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', value: getApiKey(), placeholder: 'AIza…', 'aria-describedby': 'key-help' });
  const showKey = el('button', { type: 'button', class: 'icon-btn icon-btn-ghost inline-btn', 'aria-label': 'Anahtarı göster', onclick: () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    showKey.setAttribute('aria-label', keyInput.type === 'password' ? 'Anahtarı göster' : 'Anahtarı gizle');
  } }, icon('key'));
  const remember = el('input', { type: 'checkbox', checked: isKeyRemembered() });
  const modelInput = el('input', { value: model, autocomplete: 'off', spellcheck: 'false' });
  const testResult = el('div', { role: 'status', 'aria-live': 'polite' });
  const saveGemini = async () => {
    try {
      const m = validateModelId(modelInput.value);
      setApiKey(keyInput.value, remember.checked);
      await setModel(m);
      modelInput.value = m;
      toast('Gemini ayarları kaydedildi.');
      return true;
    } catch (e) { toast(e.full || e.message, { type: 'error' }); return false; }
  };
  const testBtn = button('Bağlantıyı test et', { icon: 'check', onClick: async () => {
    testResult.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Test ediliyor…');
    testBtn.disabled = true;
    try {
      const r = await testConnection(keyInput.value.trim(), modelInput.value);
      testResult.replaceChildren(el('p', { class: 'ok-text' }, icon('check', { size: 16 }), ` Bağlantı başarılı: ${r.displayName}. Ayarları kaydetmeyi unutma.`));
    } catch (e) {
      testResult.replaceChildren(el('p', { class: 'form-error' }, e.full || e.message));
    } finally { testBtn.disabled = false; }
  } });

  const gemini = card('Gemini yapay zekâ',
    field('API anahtarı', el('div', { class: 'input-with-btn' }, keyInput, showKey)),
    el('p', { class: 'field-hint', id: 'key-help' }, 'Anahtar ',
      el('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer' }, 'Google AI Studio'),
      '’dan ücretsiz alınır. Ücretsiz kotada kalmak için faturalandırması açık olmayan bir proje kullan. Uygulama kendiliğinden ücretli kullanıma geçmez.'),
    el('label', { class: 'check' }, remember, el('span', {}, 'Anahtarı bu cihazda hatırla')),
    sync.currentUser() ? el('p', { class: 'field-hint' }, 'Hesabınla giriş yaptığın için anahtar hesabına kaydedilir ve diğer cihazlarında kendiliğinden gelir.') : null,
    el('p', { class: 'field-hint warn' }, 'Varsayılan olarak anahtar yalnızca bu oturum boyunca bellekte tutulur; sayfa kapanınca silinir. “Hatırla” seçilirse tarayıcının yerel deposuna şifrelenmeden yazılır; bu cihaza erişen biri veya tarayıcıda çalışan zararlı bir eklenti anahtarı okuyabilir. Ortak kullanılan cihazlarda işaretleme. Anahtar hiçbir yedeğe veya dışa aktarma dosyasına eklenmez.'),
    field('Model kimliği', modelInput, `Varsayılan: ${DEFAULT_MODEL}. Google model adlarını değiştirirse buradan güncelleyebilirsin.`),
    el('div', { class: 'row-actions' }, button('Kaydet', { variant: 'primary', onClick: saveGemini }), testBtn,
      button('Varsayılan model', { variant: 'ghost', small: true, onClick: () => { modelInput.value = DEFAULT_MODEL; } })),
    testResult);

  // --- Tarama ---
  const qualitySel = select([
    { value: 'standard', label: 'Standart (2048 px) — hızlı, önerilen' },
    { value: 'high', label: 'Yüksek (3072 px) — küçük puntolu veya silik kurşun kalem için' },
  ], quality);
  qualitySel.onchange = async () => { await setSetting('scanQuality', qualitySel.value); toast('Tarama kalitesi kaydedildi.'); };
  const scan = card('Tarama', field('Gönderilecek fotoğraf çözünürlüğü', qualitySel));
  const autoDg = el('input', { type: 'checkbox', checked: (await getSetting('autoDigest', true)) !== false });
  autoDg.addEventListener('change', async () => { await setSetting('autoDigest', autoDg.checked); toast(autoDg.checked ? 'Özetler hafta ve ay bitince hazırlanacak.' : 'Özetler yalnızca sen isteyince hazırlanacak.'); });
  const digestCard = card('Haftalık ve aylık özet',
    el('label', { class: 'check' }, autoDg, el('span', {}, 'Hafta ve ay bitince otomatik hazırla')),
    el('p', { class: 'muted small' }, 'Uygulamayı açtığında, biten son hafta ve ayın özeti yoksa hazırlanır. Her özet 1 Gemini isteği harcar ve bir kez hazırlanır; hesabın açıksa diğer cihazlarla paylaşılır. Anahtar yoksa yalnızca rakamlar ve seçilen alıntılar hazırlanır.'),
    button('Özetleri aç', { small: true, href: '#/ozetler' }));

  // --- Görünüm ---

  const embeddedNow = document.documentElement.classList.contains('embedded');
  const hasSefer = !!seferUI();
  const locked = look.source === 'sefer';
  const followBox = el('input', { type: 'checkbox', class: 'follow-sefer', checked: followSefer || embeddedNow, disabled: embeddedNow });
  followBox.onchange = async () => {
    // Kapatırken o anki görünümden (Sefer'deki son hâl) devam et
    if (!followBox.checked) { const cur = await currentAppearance(); await setSetting('theme', cur.theme); await setSetting('fontScale', cur.font); }
    await setSetting('followSefer', followBox.checked);
    await applyAppearance(); refresh();
  };
  const appearance = card('Görünüm',
    el('label', { class: 'check' }, followBox, el('span', {}, 'Sefer ile aynı olsun')),
    el('p', { class: 'muted small' }, embeddedNow ? 'Sefer’in içinden açtığın için görünüm Sefer’den alınıyor.'
      : locked ? 'Tema ve yazı boyutu Sefer’deki ayarlardan alınıyor; Sefer’de değiştirdiğinde burada da değişir.'
        : followSefer && !hasSefer ? 'Bu cihazda Sefer henüz açılmamış; şimdilik buradaki ayarlar kullanılıyor.' : 'Satır İzi’nin kendi görünüm ayarları kullanılıyor.'),
    el('span', { class: 'field-label' }, 'Tema'),
    segmented(THEMES, look.theme, async v => { await setSetting('theme', v); applyAppearance(); }, { disabled: locked, label: 'Tema' }),
    el('span', { class: 'field-label seg-label' }, 'Yazı boyutu'),
    segmented(FONT_SCALES, String(look.font), async v => { await setSetting('fontScale', Number(v)); applyAppearance(); }, { disabled: locked, label: 'Yazı boyutu' }));

  // --- Yedekleme ---
  const restoreInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  restoreInput.onchange = async () => {
    const file = restoreInput.files[0]; restoreInput.value = '';
    if (!file) return;
    let data;
    try { data = parseBackup(await readFileAsText(file)); }
    catch (e) { toast(e.message, { type: 'error', duration: 8000 }); return; }
    const mode = await choiceDialog({
      title: 'Yedeği geri yükle',
      message: `Yedekte ${data.books.length} kitap, ${data.highlights.length} alıntı ve ${data.notes.length} not var.${data.dropped ? ` ${data.dropped} bozuk kayıt atlanacak.` : ''}`,
      options: [
        { value: 'merge', label: 'Birleştir (önerilen)', description: 'Mevcut verin korunur; yedekteki yeni kayıtlar eklenir.' },
        { value: 'overwrite', label: 'Üzerine yaz', description: 'Mevcut kitap, alıntı ve notlar silinip yedekle değiştirilir. Önce mevcut verinin yedeği indirilir.', danger: true },
      ],
    });
    if (!mode) return;
    try {
      if (mode === 'overwrite') {
        if (!await confirmDialog({ title: 'Mevcut veri silinecek', message: 'Güvenlik için önce mevcut arşivin yedeği indirilecek, ardından seçtiğin yedek yüklenecek.', confirmLabel: 'Devam et', danger: true })) return;
        if (state.books.length || state.highlights.length) await downloadBackup('satir-izi-geri-yukleme-oncesi');
      }
      const r = await applyRestore(data, mode);
      if (sync.currentUser()) await sync.syncNow({ authoritative: mode === 'overwrite' });
      toast(`Geri yükleme tamamlandı: ${r.books} kitap, ${r.highlights} alıntı, ${r.notes} not${r.skipped ? `, ${r.skipped} tekrar atlandı` : ''}.`, { duration: 8000 });
      refresh();
    } catch (e) {
      toast('Geri yükleme başarısız, mevcut verin değiştirilmedi: ' + e.message, { type: 'error', duration: 10000 });
    }
  };
  const backup = card('Yedekleme ve dışa aktarma',
    el('p', {}, 'Verilerin yalnızca bu cihazdaki tarayıcıda saklanır ve cihazlar arasında eşitlenmez. Tarayıcı verilerini temizlemek arşivi silebilir; düzenli yedek al.'),
    el('p', { class: 'muted small' }, lastBackup ? `Son yedek: ${formatDate(lastBackup, true)}` : 'Henüz yedek alınmadı.'),
    el('div', { class: 'row-actions' },
      button('JSON yedeği indir', { icon: 'download', variant: 'primary', onClick: async () => { await downloadBackup(); toast('Yedek indirildi.'); refresh(); } }),
      button('Yedekten geri yükle', { icon: 'upload', onClick: () => restoreInput.click() }), restoreInput),
    el('h3', {}, 'Tüm kitapları dışa aktar'),
    el('div', { class: 'row-actions' },
      button('Markdown', { small: true, onClick: () => exportAll('md') }),
      button('TXT', { small: true, onClick: () => exportAll('txt') }),
      button('CSV', { small: true, onClick: () => exportAll('csv') })));

  // --- Depolama ---
  const storageInfo = el('p', { class: 'muted' }, 'Hesaplanıyor…');
  (async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      const parts = [];
      if (est) parts.push(`Kullanılan alan: ${formatBytes(est.usage)}${est.quota ? ` / ${formatBytes(est.quota)}` : ''}`);
      parts.push(persisted ? 'Kalıcı depolama: açık (tarayıcı verini kendiliğinden silmez).' : 'Kalıcı depolama: kapalı. Tarayıcı yer darlığında veriyi silebilir; uygulamayı ana ekrana eklemek ve düzenli yedek almak önerilir.');
      storageInfo.textContent = parts.join(' · ');
    } catch { storageInfo.textContent = 'Depolama bilgisi alınamadı.'; }
  })();
  const storage = card('Depolama',
    el('p', {}, `${state.books.length} kitap · ${state.highlights.length} alıntı · ${state.notes.length} not · ${state.drafts.length} bekleyen taslak`),
    storageInfo,
    button('Kalıcı depolama iste', { small: true, onClick: async () => {
      const ok = await requestPersistence();
      toast(ok ? 'Kalıcı depolama açık.' : 'Tarayıcı izni vermedi. Uygulamayı ana ekrana ekledikten sonra tekrar dene.');
      refresh();
    } }));

  // --- Kurulum ---
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const install = card('Uygulamayı yükle',
    standalone ? el('p', {}, 'Satır İzi uygulama olarak çalışıyor.') : el('div', {},
      installPrompt ? button('Ana ekrana ekle', { variant: 'primary', icon: 'download', onClick: async () => { await installPrompt.prompt(); installPrompt = null; refresh(); } }) : null,
      el('ul', { class: 'plain-list' },
        el('li', {}, el('strong', {}, 'Android (Chrome): '), 'menü ⋮ → “Ana ekrana ekle” veya “Uygulamayı yükle”.'),
        el('li', {}, el('strong', {}, 'iPhone / iPad (Safari): '), 'Paylaş düğmesi → “Ana Ekrana Ekle”.'),
        el('li', {}, el('strong', {}, 'Bilgisayar (Chrome/Edge): '), 'adres çubuğundaki yükleme simgesi.'))),
    el('p', { class: 'muted small' }, 'İlk açılıştan sonra arşivin ve elle not ekleme internetsiz de çalışır.'));

  // --- Gizlilik ---
  const privacy = card('Gizlilik',
    el('ul', { class: 'plain-list' },
      el('li', {}, 'Giriş yapmazsan kitapların, alıntıların ve notların yalnızca bu cihazda, tarayıcının IndexedDB deposunda tutulur.'),
      el('li', {}, 'Giriş yaparsan aynı veriler, ayarların ve Gemini API anahtarın hesabına özel olarak Supabase’de (Emanet ve Sefer ile aynı proje) saklanır; satır güvenliği sayesinde yalnızca senin hesabın okuyabilir. Taslaklar ve tarama fotoğrafları buluta gitmez.'),
      el('li', {}, 'Tarama yaptığında yalnızca o sayfanın fotoğrafı, senin API anahtarınla doğrudan Google Gemini API’ye gönderilir.'),
      el('li', {}, 'Gemini’nin ücretsiz katmanında Google, gönderilen içerikleri ürünlerini geliştirmek için kullanabilir ve insan incelemesinden geçirebilir. Kişisel veya hassas içerik barındıran sayfaları tarama.'),
      el('li', {}, 'Fotoğraflar kalıcı arşivde saklanmaz; onay ekranında kaydettiğinde veya taslağı sildiğinde geçici fotoğraf da silinir.'),
      el('li', {}, 'API anahtarın JSON yedeklerine, otomatik bulut yedeklerine, dışa aktarma dosyalarına ve uygulama önbelleğine hiçbir zaman eklenmez.')),
    el('p', {}, el('a', { href: 'https://ai.google.dev/gemini-api/terms', target: '_blank', rel: 'noopener noreferrer' }, 'Gemini API kullanım koşulları')));

  // --- Sefer ---
  const embedded = document.documentElement.classList.contains('embedded');
  const sefer = card('Sefer ile bağlantı',
    el('p', {}, 'Satır İzi, Sefer’deki kitap okuma görevleriyle bağlantılıdır: Sefer’de bir görevi Satır İzi kitabına bağlarsan okuduğun sayfalar iki tarafta da görünür, Sefer’in Bugün ekranında günün alıntısı çıkar.'),
    embedded ? el('p', { class: 'muted small' }, 'Şu an Sefer’in içinden açıyorsun.') : button('Sefer’e geç', { icon: 'chevron', href: '../sefer/' }));

  // --- Tehlikeli bölge ---
  const danger = card('Tüm verileri sil',
    el('p', {}, 'Bu cihazdaki bütün kitaplar, alıntılar, notlar, taslaklar ve ayarlar silinir. Geri alınamaz.'),
    button('Tüm verileri sil', { variant: 'danger', icon: 'trash', onClick: async () => {
      if (!await confirmDialog({ title: 'Emin misin?', message: `${state.books.length} kitap ve ${state.highlights.length} alıntı kalıcı olarak silinecek. Önce yedek almanı öneririz.`, confirmLabel: 'Evet, devam et', danger: true })) return;
      let cloud = false;
      if (sync.currentUser()) {
        const c = await choiceDialog({ title: 'Buluttaki veriler', message: 'Hesabınla giriş yapmışsın. Bulut ne olsun?', options: [
          { value: 'local', label: 'Yalnızca bu cihazdan sil', description: 'Çıkış yapılır; bulut ve diğer cihazların etkilenmez.' },
          { value: 'cloud', label: 'Buluttan ve bütün cihazlardan sil', description: 'Hesabındaki arşiv de boşaltılır. Son 30 günün otomatik bulut yedekleri kalır.', danger: true },
        ] });
        if (!c) return;
        cloud = c === 'cloud';
      }
      if (!await confirmDialog({ title: 'Son onay', message: 'Bu işlem geri alınamaz.', confirmLabel: 'Hepsini sil', danger: true, requireText: 'SİL' })) return;
      if (sync.currentUser() && !cloud) await sync.signOut({ wipeLocal: true });
      await wipeAll();
      setApiKey('', false);
      await loadState();
      if (cloud) await sync.syncNow({ authoritative: true });
      await applyAppearance();
      toast('Bütün veriler silindi.');
      location.hash = '#/';
    } }));

  return el('section', { class: 'settings' },
    pageHeader('Ayarlar'),
    await accountCard(),
    gemini, scan, digestCard, appearance, backup, sefer, storage, embedded ? null : install, privacy, danger,
    el('p', { class: 'muted small center' }, `Satır İzi v${APP_VERSION} · Okudukların kaybolmasın.`));
}
