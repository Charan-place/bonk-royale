// Key art for each game's hub tile, painted in code with the same creatures and props the games use.
import { drawCreature, INK } from './creature.js';
import { drawBomb, drawGem } from './draw.js';

const L = (kind, col, hat = 0) => ({ kind, col, hat });
const W = 300;
const H = 150;

const COVERS = {
  royale(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1f73');
    g.addColorStop(1, '#5a2f9e');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#ff9ac1';
    c.beginPath();
    c.ellipse(150, 118, 140, 58, 0, 0, 7);
    c.fill();
    c.fillStyle = '#ffd1e3';
    c.beginPath();
    c.ellipse(150, 110, 118, 46, 0, 0, 7);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.stroke();
    drawCreature(c, L(0, 4, 6), 108, 78, 30);
    drawCreature(c, L(4, 2), 196, 84, 28, { rot: 0.2 });
    c.strokeStyle = '#fff';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(142, 70);
    c.lineTo(164, 66);
    c.stroke();
    drawCreature(c, L(7, 3), 248, 30, 18, { rot: 0.7 });
  },
  golf(c) {
    for (let y = 0; y < H; y += 30) {
      c.fillStyle = (y / 30) % 2 ? '#58b552' : '#62c15b';
      c.fillRect(0, y, W, 30);
    }
    c.strokeStyle = 'rgba(255,255,255,.8)';
    c.lineWidth = 4;
    c.setLineDash([2, 12]);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(80, 108);
    c.quadraticCurveTo(150, 40, 220, 68);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#0e1a14';
    c.beginPath();
    c.ellipse(232, 74, 15, 13, 0, 0, 7);
    c.fill();
    c.strokeStyle = '#f4f1ff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(234, 74);
    c.lineTo(234, 22);
    c.stroke();
    c.fillStyle = '#e5484d';
    c.beginPath();
    c.moveTo(234, 22);
    c.lineTo(262, 32);
    c.lineTo(234, 42);
    c.fill();
    c.fillStyle = '#e8cf9f';
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(150, 96, 90, 18, 6);
    c.fill();
    c.stroke();
    drawCreature(c, L(1, 0), 74, 104, 22);
  },
  merge(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c4a5e');
    g.addColorStop(1, '#0f2430');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.strokeStyle = 'rgba(255,255,255,.35)';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(78, 8, 144, 160, 20);
    c.fill();
    c.stroke();
    drawCreature(c, L(3, 2), 150, 112, 34, { shadow: false });
    drawCreature(c, L(1, 3), 108, 124, 17, { shadow: false });
    drawCreature(c, L(1, 3), 192, 124, 17, { shadow: false });
    drawCreature(c, L(0, 0), 126, 76, 22, { shadow: false });
    drawCreature(c, L(2, 5), 184, 76, 22, { shadow: false });
    drawCreature(c, L(7, 10), 150, 36, 15, { shadow: false });
  },
  potato(c) {
    const g = c.createRadialGradient(150, 80, 10, 150, 80, 170);
    g.addColorStop(0, '#3a2142');
    g.addColorStop(1, '#1a1030');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#d8693a';
    c.beginPath();
    c.ellipse(150, 112, 140, 50, 0, 0, 7);
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#ffc83d';
    c.stroke();
    drawCreature(c, L(2, 5), 90, 100, 24);
    drawCreature(c, L(0, 4), 214, 96, 22);
    drawCreature(c, L(3, 2), 150, 100, 26);
    drawBomb(c, 150, 54, 15, 0.3, true);
  },
  rush(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2a6b');
    g.addColorStop(0.6, '#6a63c9');
    g.addColorStop(1, '#f3b3a0');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#3d3f9a';
    c.beginPath();
    c.moveTo(0, H);
    c.lineTo(0, 90);
    c.lineTo(60, 54);
    c.lineTo(110, 92);
    c.lineTo(170, 44);
    c.lineTo(240, 96);
    c.lineTo(300, 62);
    c.lineTo(300, H);
    c.fill();
    for (const [x, w] of [[-10, 120], [150, 150]]) {
      const pg = c.createLinearGradient(0, 112, 0, H);
      pg.addColorStop(0, '#dff4ff');
      pg.addColorStop(1, '#3d4fa8');
      c.fillStyle = pg;
      c.strokeStyle = INK;
      c.lineWidth = 3.5;
      c.beginPath();
      c.roundRect(x, 112, w, 60, 10);
      c.fill();
      c.stroke();
    }
    drawCreature(c, L(5, 1, 2), 142, 64, 22, { rot: -0.1, squash: 0.95 });
    for (const [x, y] of [[196, 60], [226, 50], [256, 60]]) drawGem(c, x, y, 9, 0);
  },
  daily(c) {
    const g = c.createRadialGradient(150, 20, 10, 150, 80, 200);
    g.addColorStop(0, '#2a2760');
    g.addColorStop(1, '#12112b');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const rows = [[L(0, 3), L(1, 0), L(2, 9), L(3, 2)], [L(4, 6), L(1, 0), L(5, 1), L(3, 2)]];
    rows.forEach((row, r) => {
      c.fillStyle = '#1c1a42';
      c.beginPath();
      c.roundRect(46, 22 + r * 52, 208, 44, 12);
      c.fill();
      row.forEach((lk, i) => drawCreature(c, lk, 76 + i * 44, 44 + r * 52, 14, { shadow: false, t: 0 }));
      for (let i = 0; i < 4; i++) {
        c.fillStyle = r === 1 && i < 2 ? '#4be07f' : r === 0 && i === 1 ? '#ffc83d' : 'rgba(255,255,255,.14)';
        c.beginPath();
        c.arc(236 + (i % 2) * 0 - 6 + (i % 2) * 12, 38 + r * 52 + Math.floor(i / 2) * 12, 4, 0, 7);
        c.fill();
      }
    });
    c.fillStyle = 'rgba(255,255,255,.06)';
    c.beginPath();
    c.roundRect(46, 126, 208, 14, 7);
    c.fill();
  },
};

export function paintCover(canvas, game) {
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  (COVERS[game] || COVERS.royale)(c);
}
