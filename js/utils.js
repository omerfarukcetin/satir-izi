// Ortak yardımcılar. Bütün DOM üretimi textContent üzerinden yapılır; innerHTML kullanılmaz.

export const APP_VERSION = '2.2.0';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const nowISO = () => new Date().toISOString();

/**
 * Element oluşturur.
 * el('button', {class: 'btn', onclick: fn, 'aria-label': 'x'}, 'Metin', childNode)
 * Metin çocukları her zaman text node olarak eklenir.
 */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'required' || k === 'multiple') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  append(e, children);
  return e;
}

function append(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    parent.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Türkçe duyarlı, boşlukları sadeleştirilmiş karşılaştırma anahtarı. */
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('tr')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesTr(haystack, needle) {
  const n = normalizeText(needle);
  return !n || normalizeText(haystack).includes(n);
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
export const compareTr = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));

/** Sayfa numarasına göre sırala; sayfasızlar sonda. */
export function comparePage(a, b) {
  const pa = String(a ?? '').trim(), pb = String(b ?? '').trim();
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  return collator.compare(pa, pb);
}

export function formatDate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('tr-TR', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString('tr-TR', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function slugify(s) {
  return normalizeText(s)
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'kitap';
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { value: text, class: 'visually-hidden' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* yok */ }
    ta.remove();
    return ok;
  }
}

// ---- Bildirim (toast) ----
let toastTimer;
export function toast(message, { action, actionLabel, duration = 5000, type = 'info' } = {}) {
  const box = $('#toast');
  if (!box) return;
  box.replaceChildren(el('span', {}, message));
  box.dataset.type = type;
  if (action) {
    box.append(el('button', { class: 'btn btn-small btn-on-dark', type: 'button', onclick: () => { hide(); action(); } }, actionLabel || 'Tamam'));
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  if (duration > 0) toastTimer = setTimeout(hide, duration);
  function hide() { box.hidden = true; }
}

// ---- Basit diyalog yardımcıları ----
/** Onay diyaloğu. Promise<boolean> döner. */
export function confirmDialog({ title, message, confirmLabel = 'Onayla', cancelLabel = 'Vazgeç', danger = false, requireText = null }) {
  return new Promise(resolve => {
    const input = requireText ? el('input', { type: 'text', autocomplete: 'off', 'aria-label': `Onay için ${requireText} yazın` }) : null;
    const ok = el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button' }, confirmLabel);
    const cancel = el('button', { class: 'btn btn-secondary', type: 'button' }, cancelLabel);
    const dlg = el('dialog', { class: 'dialog' },
      el('h2', {}, title),
      message ? el('p', {}, message) : null,
      requireText ? el('label', {}, `Devam etmek için büyük harflerle “${requireText}” yazın`, input) : null,
      el('div', { class: 'row-actions end' }, cancel, ok));
    let result = false;
    if (input) {
      ok.disabled = true;
      input.addEventListener('input', () => { ok.disabled = input.value.trim().toLocaleUpperCase('tr') !== requireText; });
    }
    ok.onclick = () => { result = true; dlg.close(); };
    cancel.onclick = () => dlg.close();
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    (input || cancel).focus();
  });
}

/** Seçenek diyaloğu: [{value,label,description}] → seçilen value veya null */
export function choiceDialog({ title, message, options }) {
  return new Promise(resolve => {
    let result = null;
    const dlg = el('dialog', { class: 'dialog' }, el('h2', {}, title), message ? el('p', {}, message) : null);
    const list = el('div', { class: 'choice-list' });
    for (const o of options) {
      list.append(el('button', {
        class: `choice ${o.danger ? 'danger' : ''}`, type: 'button',
        onclick: () => { result = o.value; dlg.close(); }
      }, el('strong', {}, o.label), o.description ? el('span', {}, o.description) : null));
    }
    dlg.append(list, el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => dlg.close() }, 'Vazgeç')));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function readFileAsText(file) {
  return file.text ? file.text() : new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file);
  });
}

export const isOnline = () => navigator.onLine !== false;
