// Basit hash tabanlı yönlendirici. GitHub Pages alt dizininde sorunsuz çalışır.
const routes = [];
let viewRoot = null;
let afterRender = () => {};
let renderToken = 0;

export function setup(root, onAfter) { viewRoot = root; afterRender = onAfter || afterRender; }
export function register(pattern, view, navKey) { routes.push({ pattern, view, navKey }); }

export function parse(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(query) };
}

export function navigate(path, { replace = false } = {}) {
  const target = '#/' + path.replace(/^#?\/?/, '');
  if (location.hash === target) { refresh(); return; }
  if (replace) { history.replaceState(null, '', target); refresh(); }
  else location.hash = target;
}

export async function refresh({ keepScroll = true } = {}) {
  if (!viewRoot) return;
  const token = ++renderToken;
  const { parts, params } = parse();
  const scroll = window.scrollY;
  const route = routes.find(r => r.pattern === (parts[0] || '')) || routes.find(r => r.pattern === '');
  try {
    const node = await route.view({ parts, params });
    if (token !== renderToken) return; // daha yeni bir yönlendirme başladı
    viewRoot.replaceChildren(node);
  } catch (e) {
    console.error(e);
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Bu ekran yüklenemedi: ' + (e?.message || 'bilinmeyen hata');
    viewRoot.replaceChildren(p);
  }
  afterRender(route.navKey);
  if (keepScroll) window.scrollTo(0, scroll);
}

window.addEventListener('hashchange', () => { refresh({ keepScroll: false }).then(() => window.scrollTo(0, 0)); });
