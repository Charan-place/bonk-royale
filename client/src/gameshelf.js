// "More Bonk Games" strip on the Royale home screen and the "next up" card on its results screen.
import { CATALOG } from './platform/catalog.js';
import { paintCover } from './platform/art.js';
import { dayKey } from '../../shared/progress.js';

const SOLO = CATALOG.filter((g) => g.id !== 'royale');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function seenToday(id) {
  try {
    return localStorage.getItem(`bonk_seen_${id}`) === dayKey();
  } catch {
    return true;
  }
}

export function mountShelf(host) {
  host.textContent = '';
  const head = el('div', 'shelf-head');
  head.append(el('b', '', 'More Bonk games'), Object.assign(el('a', '', 'See all'), { href: '/games/' }));
  const row = el('div', 'shelf-row');
  for (const g of SOLO) {
    const a = el('a', 'shelf-tile');
    a.href = g.path;
    a.style.setProperty('--c', g.color);
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    paintCover(cv, g.id);
    a.append(cv, el('span', '', g.title.replace('Bonk ', '').replace('Hot Potato', 'Potato')));
    a.setAttribute('aria-label', `${g.title}: ${g.tag}`);
    if (g.id === 'daily' && !seenToday('daily')) a.append(el('i', 'shelf-dot'));
    row.append(a);
  }
  host.append(head, row);
}

export function mountNextUp(host) {
  const next = SOLO[Math.floor(Math.random() * SOLO.length)];
  host.textContent = '';
  host.href = next.path;
  host.style.setProperty('--c', next.color);
  host.append(el('b', '', `Next up: ${next.title}`), el('small', '', next.blurb));
  host.hidden = false;
}
