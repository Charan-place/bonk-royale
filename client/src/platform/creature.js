// The Bonk creatures, drawn by hand in code (no emoji), so they look the same on every device.
// One function draws any kind + colour + hat; every game uses it.
import { COLORS } from '../../../shared/cosmetics.js';

export const KIND_NAMES = ['Kitty', 'Bunny', 'Bear', 'Froggy', 'Dino', 'Robo', 'Alien', 'Penguin'];
export const INK = '#13202f';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = (a) => `rgb(${a.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(',')})`;
export const shade = (h, k) => rgb(hex(h).map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k))));

function ellipse(c, x, y, rx, ry, fill, stroke, lw) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function eye(c, x, y, r, look = 1, blink = false) {
  if (blink) {
    c.strokeStyle = INK;
    c.lineWidth = r * 0.35;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - r * 0.7, y);
    c.lineTo(x + r * 0.7, y);
    c.stroke();
    return;
  }
  ellipse(c, x, y, r, r * 1.15, '#fff', INK, r * 0.28);
  ellipse(c, x + r * 0.15 * look, y + r * 0.1, r * 0.55, r * 0.65, INK);
  ellipse(c, x + r * 0.35 * look, y - r * 0.25, r * 0.22, r * 0.22, '#fff');
}

function hatShape(c, hat, r, t) {
  c.lineJoin = 'round';
  c.lineWidth = r * 0.08;
  c.strokeStyle = INK;
  const top = -r * 0.82;
  if (hat === 1) {
    c.fillStyle = '#ff5a8a';
    c.beginPath();
    c.moveTo(-r * 0.34, top);
    c.lineTo(0, top - r * 0.95);
    c.lineTo(r * 0.34, top);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffd23f';
    c.fillRect(-r * 0.22, top - r * 0.38, r * 0.44, r * 0.12);
    ellipse(c, 0, top - r * 0.97, r * 0.11, r * 0.11, '#fff', INK, r * 0.06);
  } else if (hat === 2) {
    c.fillStyle = '#3a8dff';
    c.beginPath();
    c.arc(0, top + r * 0.05, r * 0.4, Math.PI, 0);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffd23f';
    const w = Math.cos(t * 18) * r * 0.62;
    ellipse(c, 0, top - r * 0.38, Math.abs(w) + r * 0.05, r * 0.07, '#ffd23f', INK, r * 0.05);
    c.beginPath();
    c.moveTo(0, top - r * 0.35);
    c.lineTo(0, top - r * 0.1);
    c.stroke();
  } else if (hat === 3) {
    c.fillStyle = '#2b2a4a';
    c.beginPath();
    c.roundRect(-r * 0.3, top - r * 0.62, r * 0.6, r * 0.7, r * 0.05);
    c.fill();
    c.stroke();
    ellipse(c, 0, top + r * 0.08, r * 0.55, r * 0.13, '#2b2a4a', INK, r * 0.07);
    c.fillStyle = '#e34b5b';
    c.fillRect(-r * 0.3, top - r * 0.1, r * 0.6, r * 0.14);
  } else if (hat === 4) {
    c.fillStyle = '#b97a3e';
    ellipse(c, 0, top + r * 0.1, r * 0.72, r * 0.15, '#b97a3e', INK, r * 0.07);
    c.beginPath();
    c.moveTo(-r * 0.3, top + r * 0.08);
    c.quadraticCurveTo(-r * 0.3, top - r * 0.5, 0, top - r * 0.32);
    c.quadraticCurveTo(r * 0.3, top - r * 0.5, r * 0.3, top + r * 0.08);
    c.closePath();
    c.fillStyle = '#d29a57';
    c.fill();
    c.stroke();
  } else if (hat === 5) {
    c.fillStyle = '#2f5bd6';
    c.beginPath();
    c.moveTo(-r * 0.5, top + r * 0.1);
    c.lineTo(r * 0.06, top - r * 1.05);
    c.lineTo(r * 0.5, top + r * 0.1);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.arc(r * 0.02, top - r * 0.45, r * 0.1, 0, 7);
    c.fill();
  } else if (hat === 6) {
    c.fillStyle = '#ffc400';
    c.beginPath();
    c.moveTo(-r * 0.42, top + r * 0.1);
    c.lineTo(-r * 0.46, top - r * 0.42);
    c.lineTo(-r * 0.2, top - r * 0.18);
    c.lineTo(0, top - r * 0.5);
    c.lineTo(r * 0.2, top - r * 0.18);
    c.lineTo(r * 0.46, top - r * 0.42);
    c.lineTo(r * 0.42, top + r * 0.1);
    c.closePath();
    c.fill();
    c.stroke();
    ellipse(c, 0, top - r * 0.08, r * 0.07, r * 0.07, '#e34b5b');
  } else if (hat === 7) {
    c.strokeStyle = '#ffd23f';
    c.lineWidth = r * 0.14;
    c.beginPath();
    c.ellipse(0, top - r * 0.22 + Math.sin(t * 3) * r * 0.03, r * 0.45, r * 0.12, 0, 0, 7);
    c.stroke();
  }
}

/**
 * Draws a creature centred at (x, y), body radius r. `look` = { kind, col, hat }.
 * opts: squash (1 = round), rot (radians), shadow (bool), t (seconds, drives blink + propeller).
 */
export function drawCreature(c, look, x, y, r, { squash = 1, rot = 0, shadow = true, t = performance.now() / 1000 } = {}) {
  const base = COLORS[look.col]?.hex || '#ff7eb6';
  const kind = look.kind ?? 0;
  const light = shade(base, 0.35);
  const dark = shade(base, -0.28);
  const lw = Math.max(2, r * 0.09);
  const blink = (t * 1.0 + kind * 0.37) % 3.6 < 0.12;
  if (shadow) {
    c.fillStyle = 'rgba(20,18,50,.22)';
    c.beginPath();
    c.ellipse(x, y + r * 0.98, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1 / squash, squash);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const body = () => {
    const g = c.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, light);
    g.addColorStop(0.55, base);
    g.addColorStop(1, dark);
    ellipse(c, 0, 0, r, r * 0.96, g, INK, lw);
  };
  // parts behind the body
  if (kind === 0) {
    for (const s of [-1, 1]) {
      c.fillStyle = base;
      c.beginPath();
      c.moveTo(s * r * 0.82, -r * 0.35);
      c.lineTo(s * r * 0.62, -r * 1.12);
      c.lineTo(s * r * 0.2, -r * 0.8);
      c.closePath();
      c.fill();
      c.lineWidth = lw;
      c.strokeStyle = INK;
      c.stroke();
      c.fillStyle = '#ff9db8';
      c.beginPath();
      c.moveTo(s * r * 0.66, -r * 0.55);
      c.lineTo(s * r * 0.58, -r * 0.92);
      c.lineTo(s * r * 0.34, -r * 0.74);
      c.closePath();
      c.fill();
    }
  } else if (kind === 1) {
    for (const s of [-1, 1]) {
      ellipse(c, s * r * 0.38, -r * 1.12, r * 0.24, r * 0.6, base, INK, lw);
      ellipse(c, s * r * 0.38, -r * 1.1, r * 0.11, r * 0.4, '#ff9db8');
    }
  } else if (kind === 2) {
    for (const s of [-1, 1]) {
      ellipse(c, s * r * 0.7, -r * 0.72, r * 0.3, r * 0.3, base, INK, lw);
      ellipse(c, s * r * 0.7, -r * 0.72, r * 0.15, r * 0.15, light);
    }
  } else if (kind === 4) {
    for (let i = -1; i <= 1; i++) {
      c.fillStyle = shade(base, 0.5);
      c.beginPath();
      c.moveTo(i * r * 0.32 - r * 0.17, -r * 0.88 + Math.abs(i) * r * 0.1);
      c.lineTo(i * r * 0.32, -r * 1.2 + Math.abs(i) * r * 0.12);
      c.lineTo(i * r * 0.32 + r * 0.17, -r * 0.88 + Math.abs(i) * r * 0.1);
      c.closePath();
      c.fill();
      c.lineWidth = lw * 0.8;
      c.strokeStyle = INK;
      c.stroke();
    }
  } else if (kind === 5 || kind === 6) {
    for (const s of kind === 5 ? [0] : [-1, 1]) {
      c.strokeStyle = INK;
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(s * r * 0.35, -r * 0.85);
      c.lineTo(s * r * 0.55, -r * 1.2);
      c.stroke();
      ellipse(c, s * r * 0.57, -r * 1.25, r * 0.14, r * 0.14, kind === 5 ? '#ff5a5a' : '#8bff6a', INK, lw * 0.8);
    }
  } else if (kind === 7) {
    for (const s of [-1, 1]) ellipse(c, s * r * 0.95, r * 0.1, r * 0.2, r * 0.42, dark, INK, lw);
    for (const s of [-1, 1]) ellipse(c, s * r * 0.35, r * 0.98, r * 0.28, r * 0.12, '#ff9a3d', INK, lw * 0.8);
  }
  body();
  // front features
  if (kind === 7) {
    ellipse(c, 0, r * 0.25, r * 0.68, r * 0.66, '#fff');
    ellipse(c, 0, -r * 0.08, r * 0.2, r * 0.13, '#ff9a3d', INK, lw * 0.8);
  } else if (kind === 2) {
    ellipse(c, 0, r * 0.28, r * 0.42, r * 0.32, shade(base, 0.55), INK, lw * 0.6);
    ellipse(c, 0, r * 0.14, r * 0.13, r * 0.09, INK);
  } else if (kind === 0 || kind === 1) {
    c.fillStyle = '#ff7a9e';
    c.beginPath();
    c.moveTo(-r * 0.09, r * 0.08);
    c.lineTo(r * 0.09, r * 0.08);
    c.lineTo(0, r * 0.2);
    c.closePath();
    c.fill();
    if (kind === 0) {
      c.strokeStyle = INK;
      c.lineWidth = lw * 0.45;
      for (const s of [-1, 1]) for (const dy of [-0.04, 0.1]) {
        c.beginPath();
        c.moveTo(s * r * 0.5, r * (0.18 + dy));
        c.lineTo(s * r * 0.98, r * (0.1 + dy * 2));
        c.stroke();
      }
    }
  } else if (kind === 3) {
    for (const s of [-1, 1]) {
      ellipse(c, s * r * 0.42, -r * 0.62, r * 0.3, r * 0.3, base, INK, lw);
    }
  } else if (kind === 4) {
    for (const s of [-1, 1]) ellipse(c, s * r * 0.1, r * 0.1, r * 0.04, r * 0.05, INK);
  } else if (kind === 5) {
    c.fillStyle = '#26264a';
    c.beginPath();
    c.roundRect(-r * 0.62, -r * 0.4, r * 1.24, r * 0.55, r * 0.2);
    c.fill();
    c.lineWidth = lw * 0.7;
    c.strokeStyle = INK;
    c.stroke();
  }
  // face
  const ey = kind === 3 ? -r * 0.62 : kind === 5 ? -r * 0.13 : -r * 0.12;
  const ex = kind === 6 ? r * 0.34 : kind === 3 ? r * 0.42 : kind === 5 ? r * 0.28 : r * 0.3;
  const er = kind === 6 ? r * 0.26 : kind === 3 ? r * 0.15 : r * 0.17;
  if (kind === 5) {
    for (const s of [-1, 1]) ellipse(c, s * ex, ey, r * 0.13, blink ? r * 0.02 : r * 0.13, '#7dffea');
  } else if (kind === 6) {
    for (const s of [-1, 1]) {
      c.save();
      c.translate(s * ex, ey);
      c.rotate(s * -0.35);
      ellipse(c, 0, 0, er, er * 1.35, '#0f0e24', INK, lw * 0.5);
      ellipse(c, -er * 0.25, -er * 0.4, er * 0.28, er * 0.28, '#fff');
      c.restore();
    }
  } else {
    eye(c, -ex, ey, er, 1, blink);
    eye(c, ex, ey, er, 1, blink);
  }
  if (kind !== 5) {
    ellipse(c, -r * 0.55, r * 0.12, r * 0.13, r * 0.08, 'rgba(255,90,130,.45)');
    ellipse(c, r * 0.55, r * 0.12, r * 0.13, r * 0.08, 'rgba(255,90,130,.45)');
    c.strokeStyle = INK;
    c.lineWidth = lw * 0.55;
    c.beginPath();
    c.arc(0, r * (kind === 3 ? 0.14 : 0.3), r * (kind === 3 ? 0.4 : 0.16), 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  } else {
    c.strokeStyle = '#7dffea';
    c.lineWidth = lw * 0.6;
    c.beginPath();
    c.moveTo(-r * 0.16, r * 0.32);
    c.lineTo(r * 0.16, r * 0.32);
    c.stroke();
  }
  hatShape(c, look.hat || 0, r, t);
  c.restore();
}

/** A small canvas with just the creature's head, for use in HTML (buttons, lists). Cached by look. */
const iconCache = new Map();
export function creatureIcon(look, size = 64) {
  const key = `${look.kind}-${look.col}-${look.hat || 0}-${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = cv.height = size * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  drawCreature(c, look, size / 2, size * 0.56, size * 0.34, { shadow: false, t: 0 });
  const url = cv.toDataURL('image/png');
  iconCache.set(key, url);
  return url;
}

// Kept for places that still show a plain symbol for a kind (names only; art is drawn above).
export const KIND_ICONS = KIND_NAMES;
export const HAT_ICONS = [];
