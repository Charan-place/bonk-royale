// One-drag slingshot control: pull back anywhere on screen, release to flick. Works with mouse and touch.
import { C } from '../../shared/sim.js';

export class FlickInput {
  constructor(el, { onAim, onFlick, isActive }) {
    this.el = el;
    this.onAim = onAim;
    this.onFlick = onFlick;
    this.isActive = isActive;
    this.id = null;
    this.sx = 0;
    this.sy = 0;
    this.angle = 0;
    this.power = 0;
    this.buffered = null;

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.cancel({ pointerId: this.id }));
  }

  get maxPx() {
    return Math.max(110, Math.min(this.el.clientWidth, this.el.clientHeight) * 0.26);
  }

  down(e) {
    if (!this.isActive() || this.id !== null) return;
    if (e.target.closest && e.target.closest('button, .hud-btn, .sheet, .emote-wheel')) return;
    this.id = e.pointerId;
    this.sx = e.clientX;
    this.sy = e.clientY;
    this.power = 0;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  }

  move(e) {
    if (e.pointerId !== this.id) return;
    const dx = this.sx - e.clientX; // slingshot: aim opposite to the pull
    const dy = this.sy - e.clientY;
    const d = Math.hypot(dx, dy);
    if (d < 14) {
      this.power = 0;
      this.onAim(0, 0);
      return;
    }
    this.pullX = dx;
    this.pullY = dy;
    this.power = Math.min(1, (d - 14) / (this.maxPx - 14));
    this.onAim(dx, dy, this.power);
  }

  up(e) {
    if (e.pointerId !== this.id) return;
    const had = this.power;
    this.id = null;
    this.onAim(0, 0, 0);
    if (had > 0.12) this.onFlick(this.pullX, this.pullY, had);
  }

  cancel(e) {
    if (e.pointerId !== this.id) return;
    this.id = null;
    this.power = 0;
    this.onAim(0, 0, 0);
  }
}

export const rangeOf = (power) => (power * C.flickMax) / C.drag;
