// Hesap arayüzü: giriş/kayıt diyaloğu, şifre yenileme, hesap kartı, bulut yedekleri.
import { el, toast, confirmDialog, choiceDialog, formatDate } from './utils.js';
import { icon } from './icons.js';
import { getSetting, setSetting } from './database.js';
import { state } from './store.js';
import { refresh } from './router.js';
import { button } from './ui.js';
import * as sync from './sync.js';
import { parseBackup, applyRestore } from './backup.js';

export function openAuthDialog() {
  return new Promise(resolve => {
    const email = el('input', { type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ornek@eposta.com', 'aria-label': 'E-posta' });
    const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'En az 6 karakter', 'aria-label': 'Şifre' });
    const msg = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const say = (text, ok = false) => { msg.textContent = text; msg.hidden = !text; msg.classList.toggle('form-ok', ok); };
    const valid = needPass => {
      if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) { say('Geçerli bir e-posta adresi girin.'); email.focus(); return false; }
      if (needPass && pass.value.length < 6) { say('Şifre en az 6 karakter olmalı.'); pass.focus(); return false; }
      return true;
    };
    const busy = async (btn, label, fn) => {
      const old = btn.querySelector('span').textContent;
      btn.disabled = true; btn.querySelector('span').textContent = label; say('');
      try { await fn(); } catch (e) { say(e.message); } finally { btn.disabled = false; btn.querySelector('span').textContent = old; }
    };
    let result = false;
    const inBtn = button('Giriş yap', { variant: 'primary', type: 'submit' });
    const upBtn = button('Hesap oluştur');
    const showBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-ghost inline-btn', 'aria-label': 'Şifreyi göster', onclick: () => {
      pass.type = pass.type === 'password' ? 'text' : 'password';
      showBtn.setAttribute('aria-label', pass.type === 'password' ? 'Şifreyi göster' : 'Şifreyi gizle');
    } }, icon('key'));

    const form = el('form', { class: 'form', novalidate: true },
      el('div', { class: 'auth-brand' }, el('img', { src: 'assets/icons/icon-192.png', alt: '', width: 44, height: 44 }), el('strong', {}, 'Satır İzi')),
      el('h2', {}, 'Hesabına giriş yap'),
      el('p', { class: 'muted' }, 'Emanet ve SEFER’de kullandığın hesapla giriş yapabilirsin. Kitapların, alıntıların, ayarların ve Gemini API anahtarın bütün cihazlarında eşitlenir.'),
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'E-posta'), email),
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Şifre'), el('div', { class: 'input-with-btn' }, pass, showBtn)),
      msg,
      el('div', { class: 'auth-actions' }, inBtn, upBtn),
      el('div', { class: 'row-actions' },
        button('Şifremi unuttum', { variant: 'ghost', small: true, onClick: () => { if (valid(false)) busy(inBtn, 'Gönderiliyor…', async () => { await sync.resetPassword(email.value.trim()); say('Şifre yenileme bağlantısı e-posta adresinize gönderildi.', true); }); } }),
        button('Vazgeç', { variant: 'ghost', small: true, onClick: () => dlg.close() })),
      el('p', { class: 'muted small' }, 'Verilerin hesabına özel saklanır; başka kimse göremez. Giriş yapmazsan her şey yalnızca bu cihazda kalır.'));

    form.onsubmit = e => {
      e.preventDefault();
      if (!valid(true)) return;
      busy(inBtn, 'Giriş yapılıyor…', async () => {
        await sync.signIn(email.value.trim(), pass.value);
        result = true; dlg.close(); toast('Giriş yapıldı; verilerin eşitleniyor.');
      });
    };
    upBtn.onclick = () => {
      if (!valid(true)) return;
      busy(upBtn, 'Hesap açılıyor…', async () => {
        const r = await sync.signUp(email.value.trim(), pass.value);
        if (r === 'signed-in') { result = true; dlg.close(); toast('Hesap oluşturuldu.'); }
        else say('Onay e-postası gönderildi. Gelen kutundaki bağlantıya tıkla, sonra giriş yap.', true);
      });
    };
    const dlg = el('dialog', { class: 'dialog' }, form);
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); refresh(); });
    document.body.append(dlg);
    dlg.showModal();
    email.focus();
  });
}

export function openNewPasswordDialog() {
  const pass = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'En az 6 karakter' });
  const msg = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const dlg = el('dialog', { class: 'dialog' },
    el('h2', {}, 'Yeni şifre belirle'),
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Yeni şifre'), pass), msg,
    el('div', { class: 'row-actions end' },
      button('Vazgeç', { onClick: () => dlg.close() }),
      button('Kaydet', { variant: 'primary', onClick: async () => {
        if (pass.value.length < 6) { msg.textContent = 'Şifre en az 6 karakter olmalı.'; msg.hidden = false; return; }
        try { await sync.changePassword(pass.value); dlg.close(); toast('Şifren değiştirildi.'); }
        catch (e) { msg.textContent = e.message; msg.hidden = false; }
      } })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

/** Bu cihazdaki arşiv başka bir hesaba aitse ne yapılacağını sor. */
export async function askOtherOwner({ email }) {
  const c = await choiceDialog({
    title: 'Bu cihazda başka bir hesabın arşivi var',
    message: `${email} ile giriş yapıyorsun, ama bu cihazdaki kitaplar daha önce başka bir hesapla eşitlenmiş.`,
    options: [
      { value: 'replace', label: 'Bu cihazdakileri kaldır', description: `${email} hesabının verileri yüklenir. Diğer hesabın verisi bulutta durmaya devam eder.` },
      { value: 'merge', label: 'Bu hesaba ekle', description: 'Bu cihazdaki kitaplar ve alıntılar bu hesaba da kopyalanır.' },
    ],
  });
  return c || 'cancel';
}

const STATUS_TEXT = {
  syncing: 'Eşitleniyor…', ok: 'Eşitlendi', offline: 'Çevrimdışı', error: 'Eşitlenemedi', signedout: '', off: '',
};

export async function accountCard() {
  if (!sync.isConfigured()) return null;
  const user = sync.currentUser();
  const card = el('section', { class: 'card settings-card' }, el('h2', {}, 'Hesap ve eşitleme'));
  if (!user) {
    card.append(
      el('p', {}, 'Giriş yaparsan kitapların, alıntıların, notların, ayarların ve Gemini API anahtarın telefonunla bilgisayarın arasında eşitlenir. Emanet ve SEFER’deki hesabını kullanabilirsin.'),
      el('div', { class: 'row-actions' }, button('Giriş yap / Hesap oluştur', { variant: 'primary', icon: 'key', onClick: openAuthDialog })),
      el('p', { class: 'muted small' }, 'Giriş yapmadan da kullanabilirsin; o durumda veriler yalnızca bu cihazda kalır.'));
    return card;
  }
  const st = sync.status;
  const last = await getSetting('lastSyncAt', null);
  card.append(
    el('p', {}, 'Giriş yapılan hesap: ', el('strong', {}, user.email || '')),
    el('p', { class: `sync-line sync-${st.state}` },
      st.state === 'syncing' ? el('span', { class: 'spinner spinner-sm', 'aria-hidden': 'true' }) : icon(st.state === 'ok' ? 'check' : st.state === 'error' ? 'alert' : st.state === 'offline' ? 'wifiOff' : 'check', { size: 16 }),
      el('span', {}, st.state === 'error' || st.state === 'offline' ? st.message : STATUS_TEXT[st.state] || ''),
      last ? el('span', { class: 'muted small' }, ` · son eşitleme ${formatDate(last, true)}`) : null),
    el('p', { class: 'muted small' }, 'Gemini API anahtarın da hesabına kaydedilir ve satır güvenliğiyle yalnızca senin hesabın okuyabilir. Otomatik bulut yedeklerine anahtar girmez.'),
    el('div', { class: 'row-actions' },
      button('Şimdi eşitle', { small: true, icon: 'rotateRight', onClick: async () => { await sync.syncNow(); refresh(); } }),
      button('Bulut yedekleri', { small: true, icon: 'shield', onClick: openCloudBackups }),
      button('Şifre değiştir', { small: true, variant: 'ghost', onClick: openNewPasswordDialog }),
      button('Çıkış yap', { small: true, variant: 'ghost-danger', onClick: async () => {
        const c = await choiceDialog({
          title: 'Çıkış yap',
          message: 'Verilerin bulutta kalır. Bu cihazda ne olsun?',
          options: [
            { value: 'keep', label: 'Bu cihazda kalsın', description: 'Arşivi girişsiz kullanmaya devam edersin.' },
            { value: 'wipe', label: 'Bu cihazdan sil', description: 'Ortak kullanılan cihazlar için. Kitaplar, alıntılar ve API anahtarı bu cihazdan silinir.', danger: true },
          ],
        });
        if (!c) return;
        await sync.signOut({ wipeLocal: c === 'wipe' });
        toast('Çıkış yapıldı.');
        refresh();
      } })));
  return card;
}

async function openCloudBackups() {
  const body = el('div', {}, el('p', { class: 'muted' }, 'Yedekler getiriliyor…'));
  const dlg = el('dialog', { class: 'dialog' },
    el('h2', {}, 'Otomatik bulut yedekleri'),
    el('p', { class: 'muted small' }, 'Giriş yaptığın sürece her günün son hâli 30 gün saklanır. Geri yüklemek, bütün cihazlarındaki arşivi o günkü hâline getirir.'),
    body,
    el('div', { class: 'row-actions end' }, button('Kapat', { onClick: () => dlg.close() })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  try {
    const rows = await sync.listCloudBackups();
    if (!rows.length) { body.replaceChildren(el('p', {}, 'Henüz yedek yok. İlk yedek bir sonraki eşitlemede alınır.')); return; }
    body.replaceChildren(el('div', { class: 'choice-list' }, rows.map(r => el('button', {
      class: 'choice', type: 'button', onclick: async () => {
        if (!await confirmDialog({ title: `${formatDate(r.day)} yedeği yüklensin mi?`, message: 'Şu anki arşivin yerine o günkü hâli gelir ve bütün cihazlarına eşitlenir. Önce mevcut arşivin JSON yedeğini indirmeni öneririz.', confirmLabel: 'Yedeği yükle', danger: true })) return;
        try {
          const data = parseBackup(JSON.stringify(await sync.getCloudBackup(r.day)));
          await applyRestore(data, 'overwrite');
          await sync.syncNow({ authoritative: true });
          dlg.close(); toast('Bulut yedeği yüklendi.'); refresh();
        } catch (e) { toast(e.message, { type: 'error' }); }
      },
    }, el('strong', {}, formatDate(r.day)), el('span', {}, `${r.meta?.books ?? 0} kitap · ${r.meta?.highlights ?? 0} alıntı · ${r.meta?.notes ?? 0} not`)))));
  } catch (e) { body.replaceChildren(el('p', { class: 'form-error' }, e.message)); }
}

/** Ana sayfada, giriş yapılmamışsa bir kez gösterilen öneri kartı. */
export async function loginSuggestion() {
  if (!sync.isConfigured() || sync.currentUser() || sync.status.state === 'off') return null;
  if (await getSetting('loginSuggestionDismissed', false)) return null;
  if (!state.books.length) return null;
  const card = el('div', { class: 'callout callout-soft' }, icon('key'),
    el('div', {},
      el('strong', {}, 'Arşivin bütün cihazlarında olsun'),
      el('p', { class: 'small' }, 'Emanet ve SEFER’deki hesabınla giriş yap; kitapların, alıntıların ve API anahtarın telefon ile bilgisayar arasında eşitlensin ve her gün otomatik yedeklensin.'),
      el('div', { class: 'row-actions' },
        button('Giriş yap', { small: true, variant: 'primary', onClick: openAuthDialog }),
        button('Şimdi değil', { small: true, variant: 'ghost', onClick: async () => { await setSetting('loginSuggestionDismissed', true); card.remove(); } }))));
  return card;
}

export function wireSync() {
  sync.setLoginHandler(async info => (info.type === 'other-owner' ? askOtherOwner(info) : 'merge'));
  sync.setRecoveryHandler(openNewPasswordDialog);
}
