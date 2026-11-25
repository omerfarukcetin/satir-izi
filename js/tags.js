// Etiketler: girişi (çip + öneri), etiket listesi ekranı.
import { el, normalizeText, compareTr } from './utils.js';
import { icon } from './icons.js';
import { state } from './store.js';
import { inlineTags } from './links.js';
import { pageHeader, emptyState } from './ui.js';

// Proje tanımındaki örnek etiketler (kullanıcı kendi etiketlerini de oluşturur)
export const PRESET_TAGS = ['ahlak', 'psikoloji', 'eğitim', 'tarih', 'din', 'kişisel gelişim', 'ekonomi', 'aile', 'çocuk yetiştirme', 'bilim ve teknoloji'];

const cleanTag = t => String(t || '').replace(/^#/, '').replace(/\s+/g, ' ').trim().slice(0, 40);

/** Bütün etiketler ve kullanım sayıları (alıntı + not, metin içi #etiketler dahil) */
export function tagCounts() {
  const map = new Map(); // anahtar: normalize → { name, count }
  const add = (t, id) => {
    const name = cleanTag(t); if (!name) return;
    const k = normalizeText(name);
    const e = map.get(k) || { name, ids: new Set() };
    e.ids.add(id); map.set(k, e);
  };
  for (const h of state.highlights) { (h.tags || []).forEach(t => add(t, h.id)); inlineTags(h.comment).forEach(t => add(t, h.id)); }
  for (const n of state.notes) { (n.tags || []).forEach(t => add(t, n.id)); inlineTags(n.text).forEach(t => add(t, n.id)); }
  return [...map.values()].map(e => ({ name: e.name, count: e.ids.size })).sort((a, b) => b.count - a.count || compareTr(a.name, b.name));
}

/** Kayıt bu etikete sahip mi (alan veya metin içi) */
export function hasTag(item, tag, textField) {
  const k = normalizeText(cleanTag(tag));
  return (item.tags || []).some(t => normalizeText(t) === k) || inlineTags(item[textField]).some(t => normalizeText(t) === k);
}

/** Çipli etiket girişi. { root, get() } */
export function tagInput(initial = []) {
  let tags = [...new Set(initial.map(cleanTag).filter(Boolean))];
  const chips = el('div', { class: 'tag-chips' });
  const input = el('input', { placeholder: 'Etiket yaz, Enter’a bas', 'aria-label': 'Etiket ekle', list: 'tag-suggest' });
  const all = [...new Set([...tagCounts().map(t => t.name), ...PRESET_TAGS])];
  const datalist = el('datalist', { id: 'tag-suggest' }, all.map(t => el('option', { value: t })));
  const sugg = el('div', { class: 'tag-suggest' });
  const has = t => tags.some(x => normalizeText(x) === normalizeText(t));
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
  return { root: el('div', { class: 'tag-input' }, chips, datalist, sugg), get: () => { if (input.value.trim()) add(input.value); return [...tags]; } };
}

export function tagsView() {
  const list = tagCounts();
  return el('section', {},
    pageHeader('Etiketler', { subtitle: 'Alıntılarını ve notlarını konulara göre gez. Notlarda #etiket yazarak da etiketleyebilirsin.' }),
    list.length
      ? el('div', { class: 'tag-cloud' }, list.map(t => el('a', { class: 'tag-pill', href: `#/alintilar?etiket=${encodeURIComponent(t.name)}` }, '#' + t.name, el('span', {}, String(t.count)))))
      : emptyState('Henüz etiket yok. Bir alıntıyı düzenleyip etiket ekleyebilir ya da notuna #etiket yazabilirsin.'));
}
