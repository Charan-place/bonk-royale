// The Bonk family: what the hub and the cross-promo cards show.
export const CATALOG = [
  { id: 'royale', title: 'Bonk Royale', color: '#ff6b4a', path: '/', tag: 'Multiplayer', blurb: 'Flick rivals off a crumbling candy island. Last one standing wins!' },
  { id: 'golf', title: 'Bonk Golf', color: '#86e05a', path: '/play/golf/', tag: 'Solo · 40 courses', blurb: 'Flick your creature into the hole. Bumpers, ice and portals. Earn 3 stars!' },
  { id: 'merge', title: 'Bonk Merge', color: '#ff7a59', path: '/play/merge/', tag: 'Solo · Relaxing', blurb: 'Drop creatures. Two the same merge into a bigger one. Reach the Legendary Bonk!' },
  { id: 'potato', title: 'Hot Potato Bonk', color: '#ffb020', path: '/play/potato/', tag: 'Party vs bots', blurb: 'Pass the bomb by bumping rivals. Do not be holding it when it pops!' },
  { id: 'rush', title: 'Bonk Rush', color: '#4cc3ff', path: '/play/rush/', tag: 'Solo · One thumb', blurb: 'Dash across icy platforms, grab gems and never stop. How far can you go?' },
  { id: 'daily', title: 'Daily Bonk', color: '#3ddbb0', path: '/play/daily/', tag: 'New every day', blurb: 'One quick puzzle a day. Same for everyone. Keep your streak alive!' },
];
export const byId = (id) => CATALOG.find((g) => g.id === id);
