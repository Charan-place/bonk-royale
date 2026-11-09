// The Bonk family: what the hub and the cross-promo cards show.
export const CATALOG = [
  { id: 'royale', title: 'Bonk Royale', emoji: '\u{1F94A}', color: '#8c5cff', path: '/', tag: 'Multiplayer', blurb: 'Flick rivals off a crumbling candy island. Last one standing wins!' },
  { id: 'golf', title: 'Bonk Golf', emoji: '⛳', color: '#3ee06a', path: '/play/golf/', tag: 'Solo · 40 courses', blurb: 'Flick your creature into the hole. Bumpers, ice and portals. Earn 3 stars!' },
  { id: 'merge', title: 'Bonk Merge', emoji: '\u{1F36D}', color: '#ff5fa2', path: '/play/merge/', tag: 'Solo · Relaxing', blurb: 'Drop creatures. Two the same merge into a bigger one. Reach the Legendary Bonk!' },
  { id: 'potato', title: 'Hot Potato Bonk', emoji: '\u{1F4A3}', color: '#ff8a3d', path: '/play/potato/', tag: 'Party vs bots', blurb: 'Pass the bomb by bumping rivals. Do not be holding it when it pops!' },
  { id: 'rush', title: 'Bonk Rush', emoji: '\u{1F3C3}', color: '#4fc3ff', path: '/play/rush/', tag: 'Solo · One thumb', blurb: 'Dash across icy platforms, grab gems and never stop. How far can you go?' },
  { id: 'daily', title: 'Daily Bonk', emoji: '\u{1F4C5}', color: '#ffd23f', path: '/play/daily/', tag: 'New every day', blurb: 'One quick puzzle a day. Same for everyone. Keep your streak alive!' },
];
export const byId = (id) => CATALOG.find((g) => g.id === id);
