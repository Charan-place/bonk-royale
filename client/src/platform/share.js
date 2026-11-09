// Share card: draws a picture of the result, then shares it with the system share sheet
// (phones and tablets), or downloads it and copies the link (computers).
import { drawCreature } from './creature.js';
import { byId } from './catalog.js';

const W = 1200;
const H = 630;
const NIGHT = '#0e1a2b';
const PANEL = '#152a44';
const TEXT = '#f7f3e8';
const MUTED = '#9db2c9';
const DISPLAY = '"Lilita One", "Baloo 2", system-ui, sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';

const origin = () => (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'https://playbonkroyale.com' : location.origin);

function stars(c, n, x, y, size, accent) {
  for (let i = 0; i < 3; i++) {
    const cx = x + i * size * 1.25;
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? size * 0.22 : size * 0.5;
      c[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = i < n ? accent : 'rgba(255,255,255,0.12)';
    c.fill();
  }
}

/** Draws the card. `info`: { game, title, big: [value, label], lines, starCount, look } */
export function drawShareCard(info) {
  const g = byId(info.game) || { title: 'Bonk Games', color: '#ffb627' };
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = NIGHT;
  c.fillRect(0, 0, W, H);
  // accent glow behind the creature
  const glow = c.createRadialGradient(900, 300, 20, 900, 300, 420);
  glow.addColorStop(0, g.color + '66');
  glow.addColorStop(1, g.color + '00');
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);
  c.fillStyle = g.color;
  c.fillRect(0, 0, 18, H);

  c.fillStyle = MUTED;
  c.font = `800 34px ${BODY}`;
  c.fillText('BONK GAMES', 70, 80);
  c.fillStyle = TEXT;
  c.font = `400 76px ${DISPLAY}`;
  c.fillText(g.title, 70, 170);

  let y = 300;
  if (info.big) {
    c.fillStyle = g.color;
    c.font = `400 150px ${DISPLAY}`;
    c.fillText(info.big[0], 70, y);
    const w = c.measureText(info.big[0]).width;
    c.fillStyle = MUTED;
    c.font = `800 38px ${BODY}`;
    c.fillText(info.big[1], 70 + w + 24, y);
    y += 34;
  }
  if (info.starCount != null) {
    stars(c, info.starCount, 100, y + 36, 70, g.color);
    y += 92;
  }
  c.fillStyle = TEXT;
  c.font = `800 34px ${BODY}`;
  for (const l of (info.lines || []).slice(0, 2)) {
    c.fillText(l.length > 44 ? l.slice(0, 43) + '…' : l, 70, y + 34);
    y += 44;
  }

  if (info.look) drawCreature(c, info.look, 900, 320, 170, { shadow: true, t: 0 });

  c.fillStyle = PANEL;
  c.fillRect(0, H - 110, W, 110);
  c.fillStyle = TEXT;
  c.font = `400 44px ${DISPLAY}`;
  c.fillText('Can you beat it? Play free', 70, H - 42);
  c.fillStyle = g.color;
  c.textAlign = 'right';
  c.font = `800 38px ${BODY}`;
  c.fillText(origin().replace(/^https?:\/\//, '') + (g.path || '/'), W - 60, H - 44);
  c.textAlign = 'left';
  return cv;
}

const toBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

/** Shares the result. Returns 'shared', 'downloaded', 'copied' or 'failed'. */
export async function shareResult(info) {
  const g = byId(info.game);
  const url = origin() + (g ? g.path : '/');
  const score = info.big ? `${info.big[0]} ${info.big[1]}` : info.title;
  const text = `${info.title} ${score} in ${g ? g.title : 'Bonk Games'}. Can you beat it?`;
  let blob = null;
  try {
    await document.fonts?.ready;
    blob = await toBlob(drawShareCard(info));
  } catch {
    /* share text only */
  }
  try {
    if (blob && navigator.canShare) {
      const file = new File([blob], 'bonk-score.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, url });
        return 'shared';
      }
    }
    if (navigator.share) {
      await navigator.share({ text, url });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'failed';
  }
  let copied = false;
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    copied = true;
  } catch {
    /* no clipboard permission */
  }
  if (blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bonk-score.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'downloaded';
  }
  return copied ? 'copied' : 'failed';
}
