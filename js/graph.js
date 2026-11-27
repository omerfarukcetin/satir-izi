// Bağlantı haritası: etiketler, kitaplar ve aralarındaki bağlar (Obsidian'daki grafik görünümü gibi).
// Konu kümeleri etiketlerin birlikte kullanımından kendiliğinden çıkarılır; ayrı bir "konu" alanı yoktur.
import { el, compareTr } from './utils.js';
import { icon } from './icons.js';
import { state, bookById } from './store.js';
import { inlineTags, bookRefs, findItem } from './links.js';
import { tagKey, tagParents, tagCounts } from './tags.js';
import { pageHeader, emptyState, button } from './ui.js';
import { refresh } from './router.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v); return e; };
// Yerel replaceChildren iç içe dizileri ve null'ı metne çevirir; önce el() ile düzleştir
const setKids = (node, ...kids) => node.replaceChildren(...el('div', {}, ...kids).childNodes);
const MAX_TAGS = 150, MAX_BOOKS = 120, LABELS = 28;
const opts = { books: true, view: 'map' }; // oturum boyunca hatırlanır

// Basit, tekrarlanabilir rastgele sayı (aynı arşiv her açılışta aynı yerleşimi verir)
function rng(seed) { let x = 2166136261; for (const ch of seed) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return () => { x = Math.imul(x ^ (x >>> 15), 2246822507); x = Math.imul(x ^ (x >>> 13), 3266489909); return ((x ^= x >>> 16) >>> 0) / 4294967296; }; }

/** Grafik verisi: düğümler (etiket/kitap), kenarlar, konu kümeleri */
export function buildGraph({ books: withBooks = true } = {}) {
  const counts = tagCounts({ withParents: true });
  const keep = new Map(); // key → tag info
  for (const t of counts.slice(0, MAX_TAGS)) keep.set(tagKey(t.name), t);
  for (const t of [...keep.values()]) for (const p of tagParents(t.name)) { const pk = tagKey(p); if (!keep.has(pk)) { const pe = counts.find(c => tagKey(c.name) === pk); if (pe) keep.set(pk, pe); } }

  const nodes = new Map();
  for (const [k, t] of keep) nodes.set('t:' + k, { id: 't:' + k, type: 'tag', key: k, name: t.name, label: '#' + t.name, count: t.count, virtual: t.virtual });
  const edges = new Map();
  const addEdge = (a, b, w, kind) => {
    if (a === b || !nodes.has(a) || !nodes.has(b)) return;
    const id = a < b ? a + '|' + b : b + '|' + a;
    const e = edges.get(id) || { id, a: a < b ? a : b, b: a < b ? b : a, w: 0, kinds: new Set() };
    e.w += w; e.kinds.add(kind); edges.set(id, e);
  };
  const bookItems = new Map(); // bookId → kayıt sayısı (etiketli/bağlantılı)
  const items = [
    ...state.highlights.map(h => ({ id: h.id, bookId: h.bookId, tags: [...(h.tags || []), ...inlineTags(h.comment)], text: h.comment, links: h.links || [] })),
    ...state.notes.map(n => ({ id: n.id, bookId: n.bookId, tags: [...(n.tags || []), ...inlineTags(n.text)], text: n.text, links: n.links || [] })),
  ];
  const pend = []; // kitap kenarları, kitap düğümleri oluşunca eklenir
  for (const it of items) {
    const leaf = [...new Set(it.tags.map(tagKey).filter(k => keep.has(k)))];
    for (let i = 0; i < leaf.length; i++) for (let j = i + 1; j < leaf.length; j++) addEdge('t:' + leaf[i], 't:' + leaf[j], 1, 'birlikte');
    if (withBooks && it.bookId) {
      for (const k of leaf) pend.push(['b:' + it.bookId, 't:' + k, 1, 'kitap']);
      const refs = new Set(bookRefs(it.text));
      for (const l of it.links) { const f = findItem(l); if (f?.item?.bookId) refs.add(f.item.bookId); }
      refs.delete(it.bookId);
      for (const r of refs) pend.push(['b:' + it.bookId, 'b:' + r, 1, 'bağlantı']);
      if (leaf.length || refs.size) bookItems.set(it.bookId, (bookItems.get(it.bookId) || 0) + 1);
      for (const r of refs) if (!bookItems.has(r)) bookItems.set(r, 0);
    }
  }
  // Üst-alt etiket bağı
  for (const [k, t] of keep) { const p = tagParents(t.name).slice(-1)[0]; if (p) addEdge('t:' + k, 't:' + tagKey(p), 2, 'alt etiket'); }
  if (withBooks) {
    const top = [...bookItems.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_BOOKS);
    for (const [id, c] of top) { const b = bookById(id); if (b) nodes.set('b:' + id, { id: 'b:' + id, type: 'book', bookId: id, name: b.title, label: b.title, sub: b.author || '', count: c }); }
    for (const e of pend) addEdge(...e);
  }
  // Bağlantısız kitapları çıkar
  const deg = new Map();
  for (const e of edges.values()) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
  for (const [id, n] of nodes) if (n.type === 'book' && !deg.get(id)) nodes.delete(id);

  const clusters = findClusters(nodes, edges);
  return { nodes: [...nodes.values()], edges: [...edges.values()], clusters };
}

/** Etiket konu kümeleri: etiket düğümleri üzerinde etiket yayılımı (kitaplar köprü olarak sayılır). */
function findClusters(nodes, edges) {
  const tags = [...nodes.values()].filter(n => n.type === 'tag');
  const adj = new Map(tags.map(t => [t.id, new Map()]));
  const link = (a, b, w) => { if (!adj.has(a) || !adj.has(b) || a === b) return; adj.get(a).set(b, (adj.get(a).get(b) || 0) + w); adj.get(b).set(a, (adj.get(b).get(a) || 0) + w); };
  const viaBook = new Map();
  for (const e of edges.values()) {
    if (e.a.startsWith('t:') && e.b.startsWith('t:')) link(e.a, e.b, e.w);
    else { const [bk, tg] = e.a.startsWith('b:') ? [e.a, e.b] : [e.b, e.a]; if (tg.startsWith('t:')) (viaBook.get(bk) || viaBook.set(bk, []).get(bk)).push([tg, e.w]); }
  }
  for (const list of viaBook.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) link(list[i][0], list[j][0], 0.5 * Math.min(list[i][1], list[j][1]));
  const order = [...tags].sort((a, b) => b.count - a.count || compareTr(a.name, b.name));
  const rank = new Map(order.map((t, i) => [t.id, i]));
  const label = new Map(order.map(t => [t.id, t.id]));
  for (let round = 0; round < 25; round++) {
    let changed = false;
    for (const t of order) {
      const score = new Map();
      for (const [nb, w] of adj.get(t.id)) { const l = label.get(nb); score.set(l, (score.get(l) || 0) + w); }
      if (!score.size) continue;
      let best = label.get(t.id), bs = score.get(best) || 0;
      for (const [l, s] of score) if (s > bs + 1e-9 || (Math.abs(s - bs) < 1e-9 && rank.get(l) < rank.get(best))) { best = l; bs = s; }
      if (best !== label.get(t.id)) { label.set(t.id, best); changed = true; }
    }
    if (!changed) break;
  }
  const groups = new Map();
  for (const t of order) { const l = label.get(t.id); (groups.get(l) || groups.set(l, []).get(l)).push(t); }
  return [...groups.values()].filter(g => g.length >= 2)
    .map((g, i) => ({ id: 'k' + i, tags: g, size: g.reduce((s, t) => s + t.count, 0), name: g.slice(0, 3).map(t => t.name).join(' · ') }))
    .sort((a, b) => b.size - a.size);
}

/** Kuvvet yönelimli yerleşim (sabit sayıda adım; düğüm sayısı sınırlı olduğundan doğrudan hesap yeterli). */
export function layout(nodes, edges, clusters, aspect = 1) { // aspect = yükseklik / genişlik
  const n = nodes.length, rand = rng(nodes.map(x => x.id).join());
  const idx = new Map(nodes.map((x, i) => [x.id, i]));
  const cl = new Map(); clusters.forEach((c, ci) => c.tags.forEach(t => cl.set(t.id, ci)));
  const R = 120 + Math.sqrt(n) * 38;
  const P = nodes.map(x => {
    const ci = cl.get(x.id);
    const a = ci !== undefined ? (ci / Math.max(1, clusters.length)) * Math.PI * 2 : rand() * Math.PI * 2;
    const r = ci !== undefined ? R * 0.55 : R * (0.3 + rand() * 0.7);
    return { x: Math.cos(a) * r / Math.sqrt(aspect) + (rand() - 0.5) * 60, y: Math.sin(a) * r * Math.sqrt(aspect) + (rand() - 0.5) * 60, vx: 0, vy: 0 };
  });
  const E = edges.map(e => [idx.get(e.a), idx.get(e.b), Math.min(4, Math.log2(1 + e.w))]).filter(e => e[0] !== undefined && e[1] !== undefined);
  const gx = 0.012 * Math.sqrt(aspect), gy = 0.012 / Math.sqrt(aspect); // dikey ekranda grafik de dikey yayılsın
  const k = 46, steps = n > 220 ? 220 : 320;
  for (let s = 0; s < steps; s++) {
    const temp = 18 * (1 - s / steps) + 0.6;
    for (let i = 0; i < n; i++) { P[i].vx = 0; P[i].vy = 0; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = rand() - 0.5; dy = rand() - 0.5; d2 = 0.5; }
      if (d2 > 160000) continue;
      const f = (k * k) / d2;
      P[i].vx += dx * f; P[i].vy += dy * f; P[j].vx -= dx * f; P[j].vy -= dy * f;
    }
    for (const [a, b, w] of E) {
      const dx = P[a].x - P[b].x, dy = P[a].y - P[b].y, d = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const f = (d / k) * (0.35 + w * 0.25);
      P[a].vx -= dx * f / d * k * 0.1; P[a].vy -= dy * f / d * k * 0.1; P[b].vx += dx * f / d * k * 0.1; P[b].vy += dy * f / d * k * 0.1;
    }
    for (let i = 0; i < n; i++) {
      P[i].vx -= P[i].x * gx; P[i].vy -= P[i].y * gy; // merkeze çekim
      const v = Math.sqrt(P[i].vx ** 2 + P[i].vy ** 2) || 1, m = Math.min(v, temp);
      P[i].x += P[i].vx / v * m; P[i].y += P[i].vy / v * m;
    }
  }
  nodes.forEach((x, i) => { x.x = P[i].x; x.y = P[i].y; });
}

const radius = x => x.type === 'book' ? 7 + Math.min(7, Math.sqrt(x.count) * 1.8) : 5 + Math.min(11, Math.sqrt(x.count) * 2.4); // ekran pikseli

export function graphView() {
  const g = buildGraph({ books: opts.books });
  if (!g.nodes.some(n => n.type === 'tag')) {
    return el('section', {}, pageHeader('Bağlantı haritası', { back: '#/etiketler' }),
      emptyState('Harita etiketlerinden oluşur. Birkaç alıntıya etiket ekleyince konuların ve kitapların arasındaki bağlar burada görünür.', button('Etiketlere git', { href: '#/etiketler', small: true })));
  }
  const stageW = Math.max(280, Math.min(innerWidth >= 1000 ? innerWidth - 300 : innerWidth, 900) - 40), stageH = Math.min(innerHeight * (innerWidth < 600 ? 0.7 : 0.6), 640);
  layout(g.nodes, g.edges, g.clusters, Math.min(2.6, Math.max(0.5, stageH / stageW)));
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const nbr = new Map(g.nodes.map(n => [n.id, new Map()]));
  for (const e of g.edges) { nbr.get(e.a).set(e.b, e); nbr.get(e.b).set(e.a, e); }
  const clusterOf = new Map(); g.clusters.forEach(c => c.tags.forEach(t => clusterOf.set(t.id, c)));
  const labelled = new Set([...g.nodes].sort((a, b) => b.count - a.count || (a.type === 'tag' ? -1 : 1)).slice(0, innerWidth < 600 ? 12 : g.nodes.length <= 45 ? Infinity : LABELS).map(n => n.id)); // dar ekranda kalabalık olmasın

  // ---- SVG çizimi
  const pad = 40;
  const xs = g.nodes.map(n => n.x), ys = g.nodes.map(n => n.y);
  const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  const view = { ...box };
  const svg = svgEl('svg', { class: 'graph-svg', role: 'img', 'aria-label': `Bağlantı haritası: ${g.nodes.filter(n => n.type === 'tag').length} etiket, ${g.nodes.filter(n => n.type === 'book').length} kitap, ${g.edges.length} bağ` });
  let lastK = 0;
  const setView = () => { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); rescale(); };
  // Düğüm ve yazı boyutu ekranda sabit kalsın: harita birimi başına ekran pikseline göre yeniden boyutlandır
  function rescale() {
    const w = svg.getBoundingClientRect().width; if (!w) return;
    const k = view.w / w; if (Math.abs(k - lastK) < 1e-6) return; lastK = k;
    for (const n of g.nodes) {
      const r = radius(n) * k, e = nodeEls.get(n.id), t = labelEls.get(n.id);
      if (n.type === 'book') { e.setAttribute('x', n.x - r * 0.8); e.setAttribute('y', n.y - r); e.setAttribute('width', r * 1.6); e.setAttribute('height', r * 2); e.setAttribute('rx', 2.5 * k); }
      else e.setAttribute('r', r);
      t.setAttribute('x', n.x + r + 4 * k); t.setAttribute('y', n.y + 4.2 * k);
    }
    gLabels.setAttribute('font-size', (12.5 * k).toFixed(3));
    gLabels.setAttribute('stroke-width', (3.5 * k).toFixed(3));
  }
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const gEdges = svgEl('g', { class: 'g-edges' }), gNodes = svgEl('g', { class: 'g-nodes' }), gLabels = svgEl('g', { class: 'g-labels' });
  svg.append(gEdges, gNodes, gLabels);
  const edgeEls = new Map(), nodeEls = new Map(), labelEls = new Map();
  for (const e of g.edges) {
    const a = byId.get(e.a), b = byId.get(e.b);
    const line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'vector-effect': 'non-scaling-stroke', class: 'g-edge' + (e.kinds.has('alt etiket') ? ' g-edge-hier' : e.kinds.has('bağlantı') ? ' g-edge-ref' : ''), 'stroke-width': (0.8 + Math.min(2.6, Math.log2(1 + e.w) * 0.8)).toFixed(2) });
    gEdges.append(line); edgeEls.set(e.id, line);
  }
  for (const n of g.nodes) {
    const r = radius(n);
    const shape = n.type === 'book'
      ? svgEl('rect', { x: n.x - r, y: n.y - r * 1.2, width: r * 2, height: r * 2.4, rx: 3, 'vector-effect': 'non-scaling-stroke', class: 'g-node g-book' })
      : svgEl('circle', { cx: n.x, cy: n.y, r, 'vector-effect': 'non-scaling-stroke', class: 'g-node g-tag' + (n.virtual ? ' g-virtual' : '') });
    shape.setAttribute('tabindex', '0');
    shape.setAttribute('role', 'button');
    shape.setAttribute('aria-label', n.type === 'book' ? `Kitap: ${n.name}` : `Etiket ${n.label}, ${n.count} kayıt`);
    shape.dataset.id = n.id;
    gNodes.append(shape); nodeEls.set(n.id, shape);
    const t = svgEl('text', { x: n.x + r + 4, y: n.y + 4, class: 'g-label' + (n.type === 'book' ? ' g-label-book' : '') });
    t.textContent = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
    gLabels.append(t); labelEls.set(n.id, t);
  }

  // ---- Seçim ve ayrıntı paneli
  const panel = el('div', { class: 'graph-panel', 'aria-live': 'polite' });
  const tip = el('div', { class: 'graph-tip', hidden: true });
  let sel = null; // { kind: 'node'|'cluster', id }
  const paint = () => {
    let focus = null;
    if (sel?.kind === 'node') focus = new Set([sel.id, ...nbr.get(sel.id).keys()]);
    if (sel?.kind === 'cluster') { const c = g.clusters.find(x => x.id === sel.id); focus = new Set(c.tags.map(t => t.id)); }
    svg.classList.toggle('has-focus', !!focus);
    for (const [id, e] of nodeEls) { e.classList.toggle('is-on', !!focus?.has(id)); e.classList.toggle('is-sel', sel?.kind === 'node' && sel.id === id); }
    for (const [id, t] of labelEls) t.classList.toggle('is-shown', focus ? focus.has(id) : labelled.has(id));
    for (const e of g.edges) edgeEls.get(e.id).classList.toggle('is-on', !!focus && focus.has(e.a) && focus.has(e.b) && (sel.kind === 'cluster' || e.a === sel.id || e.b === sel.id));
    drawPanel();
  };
  const select = s => { sel = s; paint(); };
  const chipFor = id => { const n = byId.get(id); return el('button', { type: 'button', class: 'chip-btn chip-sm' + (n.type === 'book' ? ' chip-book' : ''), onclick: () => { select({ kind: 'node', id }); centerOn(n); } }, n.type === 'book' ? n.name : n.label); };
  function drawPanel() {
    if (!sel) {
      setKids(panel, el('p', { class: 'muted small' }, 'Bir etikete ya da kitaba dokun: bağlı olduğu konular ve kitaplar öne çıkar. İki parmakla veya tekerlekle yakınlaş, sürükleyerek gez.'));
      return;
    }
    if (sel.kind === 'cluster') {
      const c = g.clusters.find(x => x.id === sel.id);
      const books = new Map();
      for (const t of c.tags) for (const [nb, e] of nbr.get(t.id)) if (nb.startsWith('b:')) books.set(nb, (books.get(nb) || 0) + e.w);
      setKids(panel, 
        el('h2', {}, 'Konu: ' + c.name),
        el('p', { class: 'muted small' }, `${c.tags.length} etiket birlikte kullanılıyor. Bu küme etiketlerinden kendiliğinden çıkarıldı.`),
        el('div', { class: 'chips seg' }, c.tags.map(t => chipFor(t.id))),
        books.size ? [el('span', { class: 'field-label' }, 'Bu konunun kitapları'), el('div', { class: 'chips seg' }, [...books.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => chipFor(id)))] : null,
        el('div', { class: 'row-actions' }, button('Bu konuyu arşivine sor', { small: true, icon: 'chat', href: `#/sor?q=${encodeURIComponent(c.tags.slice(0, 3).map(t => t.name).join(', ') + ' hakkında hangi kitaplarda ne not almıştım?')}` })));
      return;
    }
    const n = byId.get(sel.id);
    const list = [...nbr.get(n.id).entries()].sort((a, b) => b[1].w - a[1].w);
    const tagsN = list.filter(([id]) => id.startsWith('t:')).slice(0, 14), booksN = list.filter(([id]) => id.startsWith('b:')).slice(0, 12);
    const c = clusterOf.get(n.id);
    setKids(panel, 
      el('h2', {}, n.type === 'book' ? n.name : n.label),
      el('p', { class: 'muted small' }, n.type === 'book' ? [n.sub, `${n.count} etiketli/bağlantılı kayıt`].filter(Boolean).join(' · ') : `${n.count} kayıt${n.virtual ? ' (alt etiketleriyle)' : ''}${c ? ' · konu: ' + c.name : ''}`),
      tagsN.length ? [el('span', { class: 'field-label' }, n.type === 'book' ? 'Etiketleri' : 'Birlikte kullanılan etiketler'), el('div', { class: 'chips seg' }, tagsN.map(([id]) => chipFor(id)))] : null,
      booksN.length ? [el('span', { class: 'field-label' }, n.type === 'book' ? 'Bağlantılı kitaplar' : 'Geçtiği kitaplar'), el('div', { class: 'chips seg' }, booksN.map(([id]) => chipFor(id)))] : null,
      el('div', { class: 'row-actions' },
        n.type === 'book'
          ? button('Kitabı aç', { small: true, variant: 'primary', icon: 'books', href: `#/kitap/${encodeURIComponent(n.bookId)}` })
          : button('Alıntıları gör', { small: true, variant: 'primary', icon: 'quote', href: `#/alintilar?etiket=${encodeURIComponent(n.name)}` }),
        n.type === 'tag' ? button('Arşivine sor', { small: true, icon: 'chat', href: `#/sor?q=${encodeURIComponent(n.name + ' hakkında hangi kitaplarda ne not almıştım?')}` }) : null,
        button('Seçimi kaldır', { small: true, variant: 'ghost', onClick: () => select(null) })));
  }

  // ---- Yakınlaştırma / kaydırma
  const toSvg = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: view.x + ((cx - r.left) / r.width) * view.w, y: view.y + ((cy - r.top) / r.height) * view.h }; };
  const zoom = (f, cx, cy) => {
    const p = cx === undefined ? { x: view.x + view.w / 2, y: view.y + view.h / 2 } : toSvg(cx, cy);
    const nw = Math.min(box.w * 2.5, Math.max(box.w / 12, view.w * f)), k2 = nw / view.w;
    view.x = p.x - (p.x - view.x) * k2; view.y = p.y - (p.y - view.y) * k2; view.w = nw; view.h *= k2;
    setView();
  };
  const fit = () => {
    Object.assign(view, box); fitAspect();
    const w = svg.getBoundingClientRect().width;
    if (w) { const k = view.w / w; view.x -= 18 * k; view.w += 130 * k; view.y -= 14 * k; view.h += 28 * k; fitAspect(); } // yazılar için ekran pikseli payı
    setView();
  };
  function fitAspect() { // kutuyu ekran oranına uydur (kenarlar kırpılmasın)
    const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
    const want = r.width / r.height, have = view.w / view.h;
    if (have > want) { const nh = view.w / want; view.y -= (nh - view.h) / 2; view.h = nh; } else { const nw = view.h * want; view.x -= (nw - view.w) / 2; view.w = nw; }
  }
  const centerOn = n => { view.x = n.x - view.w / 2; view.y = n.y - view.h / 2; setView(); };
  svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  const ptrs = new Map(); let drag = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', e => {
    tip.hidden = true;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: view.w }; drag = null; }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) {
      const id = e.target?.dataset?.id; // fareyle üzerine gelince küçük bilgi
      if (id && e.pointerType === 'mouse') { const n = byId.get(id); tip.textContent = n.type === 'book' ? `${n.name} · ${n.count} kayıt` : `${n.label} · ${n.count} kayıt`; tip.hidden = false; const r = svg.parentElement.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px'; }
      else tip.hidden = true;
      return;
    }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > 0) { zoom((pinch.w / view.w) * (pinch.d / d), (a.x + b.x) / 2, (a.y + b.y) / 2); moved = true; } return; }
    if (drag) {
      const r = svg.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId); }
      if (moved) { view.x = drag.vx - dx * (view.w / r.width); view.y = drag.vy - dy * (view.h / r.height); setView(); }
    }
  });
  const up = e => {
    const wasTap = ptrs.size === 1 && !moved;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null;
    if (wasTap && e.type === 'pointerup') { const id = e.target?.dataset?.id; select(id ? { kind: 'node', id } : null); }
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  svg.addEventListener('keydown', e => { const id = e.target?.dataset?.id; if (id && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select({ kind: 'node', id }); } });

  // ---- Filtreler (tek satır, haritanın üstünde)
  const search = el('input', { type: 'search', placeholder: 'Etiket veya kitap bul…', 'aria-label': 'Haritada ara', list: 'graph-names' });
  const names = el('datalist', { id: 'graph-names' }, g.nodes.map(n => el('option', { value: n.type === 'book' ? n.name : n.label })));
  const find = () => {
    const q = search.value.trim().replace(/^#/, '').toLocaleLowerCase('tr'); if (!q) return;
    const n = g.nodes.find(x => x.name.toLocaleLowerCase('tr') === q) || g.nodes.find(x => x.name.toLocaleLowerCase('tr').includes(q));
    if (n) { select({ kind: 'node', id: n.id }); centerOn(n); }
  };
  search.addEventListener('change', find);
  search.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
  const toggle = (label, key, val) => el('button', { type: 'button', class: 'chip-btn chip-sm', 'aria-pressed': String(opts[key] === val), onclick: () => { opts[key] = val; refresh(); } }, label);
  const filters = el('div', { class: 'graph-filters' },
    el('div', { class: 'chips seg', role: 'group', 'aria-label': 'Görünüm' }, toggle('Harita', 'view', 'map'), toggle('Liste', 'view', 'list')),
    el('div', { class: 'chips seg', role: 'group', 'aria-label': 'Kitaplar' }, el('button', { type: 'button', class: 'chip-btn chip-sm', 'aria-pressed': String(opts.books), onclick: () => { opts.books = !opts.books; refresh(); } }, 'Kitapları göster')),
    opts.view === 'map' ? el('div', { class: 'graph-search' }, search, names) : null);

  const legend = el('div', { class: 'graph-legend', 'aria-hidden': 'true' },
    el('span', {}, el('i', { class: 'lg-tag' }), 'Etiket'),
    opts.books ? el('span', {}, el('i', { class: 'lg-book' }), 'Kitap') : null,
    el('span', {}, el('i', { class: 'lg-hier' }), 'Alt etiket'),
    opts.books ? el('span', {}, el('i', { class: 'lg-ref' }), 'Kitaplar arası bağlantı') : null,
    el('span', { class: 'muted' }, 'büyüklük = kayıt sayısı'));

  const konular = g.clusters.length
    ? el('div', { class: 'graph-clusters' }, el('span', { class: 'field-label' }, 'Konular (etiketlerinden çıkarıldı)'),
      el('div', { class: 'chips seg' }, g.clusters.slice(0, 10).map(c => el('button', { type: 'button', class: 'chip-btn chip-sm', onclick: () => { if (opts.view === 'list') { document.getElementById('konu-' + c.id)?.scrollIntoView({ behavior: 'smooth' }); return; } select({ kind: 'cluster', id: c.id }); } }, c.name))))
    : null;

  // Liste görünümü: haritanın metin karşılığı (ekran okuyucu ve hızlı gezinme için)
  const listView = () => el('div', { class: 'graph-list' },
    g.clusters.map(c => {
      const books = new Map();
      for (const t of c.tags) for (const [nb, e] of nbr.get(t.id)) if (nb.startsWith('b:')) books.set(nb, (books.get(nb) || 0) + e.w);
      return el('section', { class: 'card graph-list-card', id: 'konu-' + c.id }, el('h2', {}, c.name),
        el('div', { class: 'chips seg' }, c.tags.map(t => el('a', { class: 'tag', href: `#/alintilar?etiket=${encodeURIComponent(t.name)}` }, `${t.label} ${t.count}`))),
        books.size ? el('p', { class: 'muted small' }, 'Kitaplar: ', [...books.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id], i) => [i ? ', ' : '', el('a', { href: `#/kitap/${encodeURIComponent(byId.get(id).bookId)}` }, byId.get(id).name)])) : null);
    }),
    (() => { const alone = g.nodes.filter(n => n.type === 'tag' && !clusterOf.has(n.id)); return alone.length ? el('section', { class: 'card graph-list-card' }, el('h2', {}, 'Tek başına kalan etiketler'), el('div', { class: 'chips seg' }, alone.map(t => el('a', { class: 'tag', href: `#/alintilar?etiket=${encodeURIComponent(t.name)}` }, `${t.label} ${t.count}`)))) : null; })());

  const stage = el('div', { class: 'graph-stage' }, svg, tip,
    el('div', { class: 'graph-zoom' },
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Yakınlaş', onclick: () => zoom(1 / 1.3) }, icon('plus', { size: 18 })),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Uzaklaş', onclick: () => zoom(1.3) }, icon('minus', { size: 18 })),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tümünü sığdır', onclick: fit }, icon('expand', { size: 18 }))));
  requestAnimationFrame(() => { fit(); paint(); });
  if (window.ResizeObserver) new ResizeObserver(() => { lastK = 0; rescale(); }).observe(stage);
  paint();

  return el('section', { class: 'graph' },
    pageHeader('Bağlantı haritası', { back: '#/etiketler', subtitle: `${g.nodes.filter(n => n.type === 'tag').length} etiket${opts.books ? `, ${g.nodes.filter(n => n.type === 'book').length} kitap` : ''}, ${g.edges.length} bağ` }),
    filters,
    konular,
    opts.view === 'map' ? [stage, legend, panel] : listView());
}
