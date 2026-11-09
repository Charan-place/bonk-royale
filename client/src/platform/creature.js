// The player's own creature, drawn the same way in every Bonk game (emoji face on a coloured body).
import { COLORS } from '../../../shared/cosmetics.js';

export const KIND_ICONS = ['\u{1F431}', '\u{1F430}', '\u{1F43B}', '\u{1F438}', '\u{1F996}', '\u{1F916}', '\u{1F47D}', '\u{1F427}'];
export const HAT_ICONS = ['', '\u{1F389}', '\u{1F681}', '\u{1F3A9}', '\u{1F920}', '\u{1F9D9}', '\u{1F451}', '\u{1F607}'];

/** Draws a creature centred at (x, y) with radius r. `look` is a profile or card. */
export function drawCreature(c, look, x, y, r, { squash = 1, rot = 0 } = {}) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1 / squash, squash);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath();
  c.ellipse(0, r * 0.95, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = COLORS[look.col]?.hex || '#ff7eb6';
  c.strokeStyle = '#2b2150';
  c.lineWidth = Math.max(2, r * 0.14);
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.font = `${r * 1.25}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(KIND_ICONS[look.kind] || KIND_ICONS[0], 0, r * 0.04);
  const hat = HAT_ICONS[look.hat];
  if (hat) {
    c.font = `${r * 0.95}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
    c.fillText(hat, 0, -r * 0.95);
  }
  c.restore();
}
