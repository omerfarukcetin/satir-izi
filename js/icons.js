// Tutarlı, çizgisel SVG ikon seti (24x24, stroke tabanlı). İçerik sabittir, kullanıcı verisi içermez.
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h5v-6h4v6h5V9.5'],
  books: ['M4 4.5A1.5 1.5 0 0 1 5.5 3H9v18H5.5A1.5 1.5 0 0 1 4 19.5z', 'M9 3h4v18H9', 'm14 4.2 3.6-1 3.4 16.7-3.6 1z'],
  scan: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 9h10', 'M7 12h7', 'M7 15h10'],
  quote: ['M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5c0 3-1.5 5-4 6', 'M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5c0 3-1.5 5-4 6'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
  star: ['M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M9 18l6-6-6-6'],
  up: ['M12 19V5', 'm5 12 7-7 7 7'],
  share: ['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7', 'M16 6l-4-4-4 4', 'M12 2v13'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z', 'M8.5 11h.01', 'M12 11h.01', 'M15.5 11h.01'],
  send: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z'],
  down: ['M12 5v14', 'm19 12-7 7-7-7'],
  camera: ['M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  image: ['M4 4h16v16H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  rotateLeft: ['M3 4v5h5', 'M3.5 9A9 9 0 1 1 6 17'],
  rotateRight: ['M21 4v5h-5', 'M20.5 9A9 9 0 1 0 18 17'],
  crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  upload: ['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm21 21-4.3-4.3'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  merge: ['M8 6v4a4 4 0 0 0 4 4v6', 'M16 6v4a4 4 0 0 1-4 4'],
  split: ['M12 3v6', 'M12 9 6 15v6', 'M12 9l6 6v6'],
  note: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6', 'M8 13h8', 'M8 17h5'],
  shuffle: ['M16 3h5v5', 'M4 20 21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  wifiOff: ['M2 2l20 20', 'M8.5 16.5a5 5 0 0 1 7 0', 'M5 12.9a10 10 0 0 1 5.2-2.7', 'M19 12.9a10 10 0 0 0-2.3-1.6', 'M2 8.8a15 15 0 0 1 4.2-2.6', 'M22 8.8A15 15 0 0 0 10.7 5', 'M12 20h.01'],
  key: ['M15 7a4 4 0 1 1-3.9 4.9L3 20v-3l1-1h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z'],
};

export function icon(name, { size = 20, filled = false, label = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
