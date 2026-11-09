// Small line icons as inline SVG strings (no emoji in the UI chrome).
const wrap = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
export const ICON = {
  home: wrap('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  trophy: wrap('<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 20h8"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17.2v.1"/>'),
  soundOn: wrap('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: wrap('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  tap: wrap('<path d="M9 11V5a1.7 1.7 0 0 1 3.4 0v5"/><path d="M12.4 9.5a1.7 1.7 0 0 1 3.3.5v1.5a1.7 1.7 0 0 1 3.1.9V16a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.7-2.3L5 15.6a1.7 1.7 0 0 1 2.6-2.1L9 15"/>'),
  mouse: wrap('<rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5v7M6 9.5h12"/>'),
  keys: wrap('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M7 10h.1M10.5 10h.1M14 10h.1M17.5 10h.1M7 14h10"/>'),
  swipe: wrap('<path d="M4 12h13M13 7l5 5-5 5"/><circle cx="5" cy="12" r="1.3"/>'),
};
export const STAR = (on) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : 'off'}" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.2 6.3 20.3l1.1-6.3L2.8 9.5l6.4-.9L12 2.8z"/></svg>`;
export const stars = (n, max = 3) => Array.from({ length: max }, (_, i) => STAR(i < n)).join('');
