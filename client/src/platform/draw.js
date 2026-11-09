// Hand-drawn props shared by the Bonk games (canvas): bomb, gem, heart, coin.
import { INK } from './creature.js';

export function drawBomb(c, x, y, r, t = 0, hot = false) {
  c.save();
  c.translate(x, y);
  const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, hot ? '#ff8a6a' : '#5a5780');
  g.addColorStop(1, hot ? '#b3200f' : '#1d1a3a');
  c.fillStyle = g;
  c.strokeStyle = INK;
  c.lineWidth = r * 0.12;
  c.beginPath();
  c.arc(0, 0, r, 0, 7);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.beginPath();
  c.ellipse(-r * 0.38, -r * 0.4, r * 0.2, r * 0.12, -0.6, 0, 7);
  c.fill();
  c.fillStyle = '#6b6894';
  c.fillRect(-r * 0.22, -r * 1.12, r * 0.44, r * 0.3);
  c.strokeStyle = '#c9a66b';
  c.lineWidth = r * 0.1;
  c.beginPath();
  c.moveTo(0, -r * 1.1);
  c.quadraticCurveTo(r * 0.3, -r * 1.5, r * 0.55, -r * 1.35);
  c.stroke();
  const f = 0.7 + Math.sin(t * 30) * 0.3;
  c.fillStyle = '#ffd23f';
  c.beginPath();
  c.arc(r * 0.58, -r * 1.38, r * 0.2 * f, 0, 7);
  c.fill();
  c.fillStyle = '#ff6a3d';
  c.beginPath();
  c.arc(r * 0.58, -r * 1.38, r * 0.11 * f, 0, 7);
  c.fill();
  c.restore();
}

export function drawGem(c, x, y, r, t = 0) {
  c.save();
  c.translate(x, y);
  c.scale(1 + Math.sin(t * 5) * 0.05, 1);
  c.lineJoin = 'round';
  const top = -r;
  const mid = -r * 0.25;
  c.fillStyle = '#4fd6ff';
  c.strokeStyle = INK;
  c.lineWidth = r * 0.16;
  c.beginPath();
  c.moveTo(-r * 0.6, mid);
  c.lineTo(-r * 0.34, top * 0.8);
  c.lineTo(r * 0.34, top * 0.8);
  c.lineTo(r * 0.6, mid);
  c.lineTo(0, r);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#b8f0ff';
  c.beginPath();
  c.moveTo(-r * 0.34, top * 0.8);
  c.lineTo(0, mid);
  c.lineTo(-r * 0.6, mid);
  c.closePath();
  c.fill();
  c.fillStyle = '#1b9bd1';
  c.beginPath();
  c.moveTo(r * 0.34, top * 0.8);
  c.lineTo(0, mid);
  c.lineTo(r * 0.6, mid);
  c.closePath();
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = r * 0.08;
  c.beginPath();
  c.moveTo(-r * 0.6, mid);
  c.lineTo(r * 0.6, mid);
  c.stroke();
  c.restore();
}

export function drawHeart(c, x, y, r, full = true) {
  c.save();
  c.translate(x, y);
  c.beginPath();
  c.moveTo(0, r * 0.9);
  c.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.8, -r * 1.1, 0, -r * 0.35);
  c.bezierCurveTo(r * 0.8, -r * 1.1, r * 1.5, -r * 0.1, 0, r * 0.9);
  c.closePath();
  c.fillStyle = full ? '#ff4d6d' : 'rgba(255,255,255,.18)';
  c.fill();
  c.strokeStyle = full ? INK : 'rgba(255,255,255,.35)';
  c.lineWidth = r * 0.16;
  c.stroke();
  if (full) {
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath();
    c.ellipse(-r * 0.5, -r * 0.35, r * 0.18, r * 0.1, -0.7, 0, 7);
    c.fill();
  }
  c.restore();
}
