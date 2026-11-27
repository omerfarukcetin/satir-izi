// Etiketler: girişi (çip + öneri), etiket listesi ekranı.
import { el, normalizeText, compareTr, toast, confirmDialog, choiceDialog, isOnline } from './utils.js';
import { icon } from './icons.js';
import { state, bookById, saveHighlights, saveNote } from './store.js';
import { inlineTags } from './links.js';
import { pageHeader, emptyState, button, iconButton } from './ui.js';
import { refresh } from './router.js';
import { suggestTags, hasApiKey } from './gemini.js';

// Proje tanımındaki örnek etiketler (kullanıcı kendi etiketlerini de oluşturur)
export const PRESET_TAGS = ['ahlak', 'psikoloji', 'eğitim', 'tarih', 'din', 'kişisel gelişim', 'ekonomi', 'aile', 'çocuk yetiştirme', 'bilim ve teknoloji'];

// Etiket karşılaştırma anahtarı: büyük/küçük harf, tire, alt çizgi ve boşluk farkı yok sayılır (#zihin-dünyası = zihin dünyası)
// Kademeli etiket: "felsefe/stoacılık" → üst etiket "felsefe" (eğik çizgi çevresindeki boşluk yok sayılır)
export const tagKey = t => normalizeText(String(t || '').replace(/^#/, '').replace(/[-_]+/g, ' ').replace(/\s*\/\s*/g, '/'));
const cleanTag = t => String(t || '').replace(/^#/, '').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '').trim().slice(0, 60);
/** "a/b/c" → ["a", "a/b"] */
export const tagParents = name => { const p = cleanTag(name).split('/'); return p.slice(0, -1).map((_, i) => p.slice(0, i + 1).join('/')); };

/** Bütün etiketler ve kullanım sayıları (alıntı + not, metin içi #etiketler dahil) */
export function tagCounts({ withParents = false } = {}) {
  const map = new Map(); // anahtar: normalize → { name, count }
  const add = (t, id) => {
    const name = cleanTag(t); if (!name) return;
    const k = tagKey(name);
    const e = map.get(k) || { name, ids: new Set() };
    e.ids.add(id); map.set(k, e);
    // Üst etiketler alt etiketlerin kayıtlarını da sayar (yazılmamış üst etiket "sanal" olarak eklenir)
    if (withParents) for (const pn of tagParents(name)) {
      const pk = tagKey(pn);
      const pe = map.get(pk) || { name: pn, ids: new Set(), virtual: true };
      pe.ids.add(id); map.set(pk, pe);
    }
  };
  for (const h of state.highlights) { (h.tags || []).forEach(t => add(t, h.id)); inlineTags(h.comment).forEach(t => add(t, h.id)); }
  for (const n of state.notes) { (n.tags || []).forEach(t => add(t, n.id)); inlineTags(n.text).forEach(t => add(t, n.id)); }
  return [...map.values()].map(e => ({ name: e.name, count: e.ids.size, ...(withParents ? { virtual: !!e.virtual, ids: e.ids } : {}) })).sort((a, b) => b.count - a.count || compareTr(a.name, b.name));
}

/** Kayıt bu etikete sahip mi (alan veya metin içi) */
export function hasTag(item, tag, textField) {
  const k = tagKey(cleanTag(tag));
  const m = t => { const x = tagKey(t); return x === k || x.startsWith(k + '/'); }; // alt etiketler de dahil
  return (item.tags || []).some(m) || inlineTags(item[textField]).some(m);
}

/** Çipli etiket girişi. { root, get() } */
export function tagInput(initial = []) {
  let tags = [...new Set(initial.map(cleanTag).filter(Boolean))];
  const chips = el('div', { class: 'tag-chips' });
  const input = el('input', { placeholder: 'Etiket yaz, Enter’a bas', 'aria-label': 'Etiket ekle', list: 'tag-suggest' });
  const all = [...new Set([...tagCounts().map(t => t.name), ...PRESET_TAGS])];
  const datalist = el('datalist', { id: 'tag-suggest' }, all.map(t => el('option', { value: t })));
  const sugg = el('div', { class: 'tag-suggest' });
  const has = t => tags.some(x => tagKey(x) === tagKey(t));
  const add = t => { const c = cleanTag(t); if (c && !has(c) && tags.length < 20) tags.push(c); input.value = ''; draw(); };
  const draw = () => {
    chips.replaceChildren(...tags.map((t, i) => el('span', { class: 'tag tag-edit' }, '#' + t,
      el('button', { type: 'button', 'aria-label': `${t} etiketini kaldır`, onclick: () => { tags.splice(i, 1); draw(); } }, icon('x', { size: 12 })))), input);
    sugg.replaceChildren(...all.filter(t => !has(t)).slice(0, 12).map(t => el('button', { type: 'button', class: 'chip-btn chip-sm', onclick: () => add(t) }, '+ ' + t)));
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
    else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); }
  });
  input.addEventListener('change', () => { if (input.value.trim()) add(input.value); });
  draw();
  return { root: el('div', { class: 'tag-input' }, chips, datalist, sugg), add, has, get: () => { if (input.value.trim()) add(input.value); return [...tags]; } };
}

// ---------- Etiket yönetimi ----------
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_-]{2,40})/gu;
/** Metindeki #eski etiketlerini değiştirir (newName null ise # işaretini kaldırır, kelime kalır). */
function replaceInline(text, oldName, newName) {
  const k = tagKey(oldName);
  return String(text || '').replace(TAG_RE, (m, pre, name) => {
    if (tagKey(name) !== k) return m;
    return pre + (newName === null ? name.replace(/[-_]+/g, ' ') : '#' + newName.replace(/\s+/g, '-'));
  });
}
function retag(list, oldName, newName) {
  const k = tagKey(oldName);
  const out = [];
  for (const t of list || []) {
    const v = tagKey(t) === k ? newName : t;
    if (v && !out.some(x => tagKey(x) === tagKey(v))) out.push(v);
  }
  return out;
}

/** Etiketi her yerde yeniden adlandırır / birleştirir (newName) veya siler (null). Değişen kayıt sayısını döner. */
export async function changeTag(oldName, newName) {
  const hl = [], nt = [];
  for (const h of state.highlights) {
    const tags = retag(h.tags, oldName, newName), comment = replaceInline(h.comment, oldName, newName);
    if (JSON.stringify(tags) !== JSON.stringify(h.tags || []) || comment !== (h.comment || '')) hl.push({ ...h, tags, comment });
  }
  for (const n of state.notes) {
    const tags = retag(n.tags, oldName, newName), text = replaceInline(n.text, oldName, newName);
    if (JSON.stringify(tags) !== JSON.stringify(n.tags || []) || text !== n.text) nt.push({ ...n, tags, text });
  }
  if (hl.length) await saveHighlights(hl);
  for (const n of nt) await saveNote(n);
  return hl.length + nt.length;
}

function askName(title, value, hint) {
  return new Promise(resolve => {
    let result = null;
    const inp = el('input', { value, maxlength: 40, 'aria-label': 'Etiket adı' });
    const dlg = el('dialog', { class: 'dialog' }, el('h2', {}, title), hint ? el('p', { class: 'muted' }, hint) : null, inp,
      el('div', { class: 'row-actions end' },
        button('Vazgeç', { onClick: () => dlg.close() }),
        button('Kaydet', { variant: 'primary', onClick: () => { result = inp.value.replace(/^#/, '').replace(/\s+/g, ' ').trim(); dlg.close(); } })));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { result = inp.value.replace(/^#/, '').trim(); dlg.close(); } });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result || null); });
    document.body.append(dlg); dlg.showModal(); inp.select();
  });
}

async function renameFlow(t) {
  const name = await askName('Etiketi yeniden adlandır', t.name, `#${t.name} etiketi ${t.count} kayıtta kullanılıyor. Notların içindeki #${t.name} yazıları da değişir.`);
  if (!name || name === t.name) return;
  const n = await changeTag(t.name, name);
  toast(`${n} kayıtta #${t.name} → #${name} yapıldı.`); refresh();
}
async function mergeFlow(t, all) {
  const others = all.filter(x => x.name !== t.name);
  if (!others.length) { toast('Birleştirilecek başka etiket yok.'); return; }
  const target = await choiceDialog({ title: `#${t.name} hangi etiketle birleşsin?`, message: `${t.count} kayıttaki #${t.name}, seçtiğin etikete dönüşür.`,
    options: others.slice(0, 40).map(o => ({ value: o.name, label: '#' + o.name, description: `${o.count} kayıt` })) });
  if (!target) return;
  const n = await changeTag(t.name, target);
  toast(`#${t.name}, #${target} ile birleştirildi (${n} kayıt).`); refresh();
}
async function deleteFlow(t) {
  if (!await confirmDialog({ title: `#${t.name} silinsin mi?`, message: `Etiket ${t.count} kayıttan kaldırılır. Alıntılar ve notlar silinmez; metin içindeki #${t.name} yazısı düz kelimeye döner.`, confirmLabel: 'Etiketi sil', danger: true })) return;
  const n = await changeTag(t.name, null);
  toast(`#${t.name} ${n} kayıttan kaldırıldı.`); refresh();
}

// ---------- Yapay zekâ ile toplu etiketleme ----------
const isUntagged = h => !(h.tags || []).length && !inlineTags(h.comment).length;
const CHUNK = 20, MAX_PER_RUN = 100;

async function bulkSuggestFlow() {
  const targets = state.highlights.filter(isUntagged).slice(0, MAX_PER_RUN);
  if (!targets.length) { toast('Etiketsiz alıntı yok.'); return; }
  const existing = tagCounts().map(t => t.name);
  const status = el('p', { class: 'scan-status', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { class: 'suggest-list' });
  const saveBtn = button('Seçilenleri kaydet', { variant: 'primary', icon: 'check', disabled: true });
  const stopBtn = button('Durdur', { variant: 'ghost' });
  const ctrl = new AbortController();
  const picks = new Map(); // id → Set(tag)
  stopBtn.onclick = () => ctrl.abort();
  const dlg = el('dialog', { class: 'dialog dialog-wide' },
    el('h2', {}, 'Yapay zekâ ile etiketle'),
    el('p', { class: 'muted small' }, `${targets.length} etiketsiz alıntı ${Math.ceil(targets.length / CHUNK)} istekte incelenecek. Mevcut etiketlerin öncelikli; önerileri onaylamadan hiçbir şey kaydedilmez.`),
    status, list,
    el('div', { class: 'row-actions end sticky-actions' }, stopBtn, button('Kapat', { onClick: () => dlg.close() }), saveBtn));
  dlg.addEventListener('close', () => { ctrl.abort(); dlg.remove(); });
  document.body.append(dlg); dlg.showModal();

  const render = (h, tags) => {
    const b = bookById(h.bookId);
    picks.set(h.id, new Set(tags));
    list.append(el('div', { class: 'suggest-item' },
      el('p', { class: 'suggest-text' }, h.text.length > 220 ? h.text.slice(0, 220) + '…' : h.text),
      el('span', { class: 'muted small' }, `${b?.title || ''}${h.page ? ' · s. ' + h.page : ''}`),
      el('div', { class: 'chips' }, tags.length ? tags.map(t => {
        const isNew = !existing.some(x => tagKey(x) === tagKey(t));
        const c = el('button', { type: 'button', class: 'chip-btn chip-sm', 'aria-pressed': 'true' }, '#' + t, isNew ? el('em', { class: 'new-tag' }, ' yeni') : null);
        c.onclick = () => { const on = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', String(on)); const s = picks.get(h.id); on ? s.add(t) : s.delete(t); };
        return c;
      }) : [el('span', { class: 'muted small' }, 'Öneri yok')])));
    saveBtn.disabled = false;
  };

  let done = 0;
  try {
    for (let i = 0; i < targets.length; i += CHUNK) {
      if (ctrl.signal.aborted) break;
      const chunk = targets.slice(i, i + CHUNK);
      status.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), ` Öneriler hazırlanıyor… ${done} / ${targets.length}`);
      const res = await suggestTags({ items: chunk.map(h => ({ id: h.id, text: h.text, comment: h.comment, book: bookById(h.bookId)?.title })), existing, signal: ctrl.signal });
      for (const h of chunk) render(h, res.get(h.id) || []);
      done += chunk.length;
    }
    status.textContent = `${done} alıntı için öneri hazır. İstemediğin etiketlere dokunup kapat, sonra kaydet.`;
  } catch (e) {
    status.textContent = e.code === 'aborted' ? `Durduruldu. ${done} alıntının önerisi hazır.` : `${e.full || e.message}${done ? ` (${done} alıntının önerisi hazır)` : ''}`;
  } finally { stopBtn.hidden = true; }

  saveBtn.onclick = async () => {
    const updates = [];
    for (const h of targets) {
      const s = picks.get(h.id);
      if (!s?.size) continue;
      const tags = [...(h.tags || [])];
      for (const t of s) if (!tags.some(x => tagKey(x) === tagKey(t))) tags.push(t);
      updates.push({ ...h, tags });
    }
    if (!updates.length) { toast('Seçili etiket yok.'); return; }
    await saveHighlights(updates);
    dlg.close(); toast(`${updates.length} alıntı etiketlendi.`); refresh();
  };
}

/** Tek alıntı için öneri (düzenleme penceresinde). */
export async function suggestForOne({ text, comment, bookTitle }) {
  const res = await suggestTags({ items: [{ id: 'x', text, comment, book: bookTitle }], existing: tagCounts().map(t => t.name) });
  return res.get('x') || [];
}

export function tagsView() {
  // Kademeli sıralama: üst etiket, hemen altında alt etiketleri
  const flat = tagCounts({ withParents: true });
  const roots = flat.filter(t => !tagParents(t.name).length);
  const list = [];
  const walk = (t, depth) => {
    list.push({ ...t, depth });
    const k = tagKey(t.name);
    flat.filter(c => tagParents(c.name).slice(-1)[0] && tagKey(tagParents(c.name).slice(-1)[0]) === k)
      .sort((a, b) => b.count - a.count || compareTr(a.name, b.name)).forEach(c => walk(c, depth + 1));
  };
  roots.forEach(r => walk(r, 0));
  for (const t of flat) if (!list.some(x => x.name === t.name)) list.push({ ...t, depth: 0 }); // güvenlik
  const untagged = state.highlights.filter(isUntagged).length;
  const canAI = hasApiKey() && isOnline();
  const ai = untagged ? el('div', { class: 'callout callout-soft' }, icon('scan'),
    el('div', {}, el('strong', {}, `${untagged} alıntının etiketi yok`),
      el('p', { class: 'small' }, canAI ? 'Yapay zekâ mevcut etiketlerine bakarak öneri yapsın; sen onaylayınca kaydedilir.' : 'Yapay zekâ önerisi için internet ve Ayarlar’da Gemini anahtarı gerekli.'),
      button('Yapay zekâ ile etiketle', { small: true, variant: 'primary', icon: 'scan', disabled: !canAI, onClick: bulkSuggestFlow }))) : null;
  return el('section', {},
    pageHeader('Etiketler', { back: '#/alintilar', subtitle: 'Alıntılarını ve notlarını konulara göre gez. Notlarda #etiket yazarak da etiketleyebilirsin. Alt etiket için eğik çizgi kullan: felsefe/stoacılık.', actions: [button('Harita', { icon: 'graph', small: true, href: '#/harita' })] }),
    ai,
    list.length
      ? el('div', { class: 'tag-rows' }, list.map(t => el('div', { class: 'tag-row' + (t.depth ? ' tag-row-child' : ''), 'data-depth': String(Math.min(t.depth, 3)) },
        el('a', { class: 'tag-pill', href: `#/alintilar?etiket=${encodeURIComponent(t.name)}`, title: t.virtual ? 'Alt etiketlerin toplamı' : null }, '#' + (t.depth ? t.name.split('/').pop() : t.name), el('span', {}, String(t.count))),
        t.virtual ? el('span', { class: 'muted small' }, 'alt etiketlerin toplamı') : el('div', { class: 'row-actions' },
          iconButton('edit', `#${t.name} etiketini yeniden adlandır`, () => renameFlow(t)),
          iconButton('merge', `#${t.name} etiketini başka etiketle birleştir`, () => mergeFlow(t, list)),
          iconButton('trash', `#${t.name} etiketini sil`, () => deleteFlow(t))))))
      : emptyState('Henüz etiket yok. Bir alıntıyı düzenleyip etiket ekleyebilir ya da notuna #etiket yazabilirsin.'));
}
