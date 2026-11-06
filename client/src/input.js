// Flick controls. One goal: a 5 year old on a tablet and an adult on a laptop both get it in seconds.
//  - Touch / pen : slingshot. Pull back anywhere, let go to flick.
//  - Mouse       : point at where you want to go. Click = quick bonk, hold = more power, let go to flick.
//  - Keyboard    : left/right (or A/D) turn the aim, Space = tap for a quick bonk, hold for more power.
// The device in use is detected from the events themselves, so hybrid laptops just work.
import { C } from '../../shared/sim.js';

const TAP_MS = 160; // releasing before this is a "quick bonk"
const TAP_POWER = 0.55;
const FULL_CHARGE_MS = 900; // from TAP_MS to full power
const PREVIEW_POWER = 0.5; // length of the aim line while not charging
const TURN_SPEED = 3.2; // rad/s for keyboard aiming
const LEFT_KEYS = ['ArrowLeft', 'a', 'A'];
const RIGHT_KEYS = ['ArrowRight', 'd', 'D'];
const CHARGE_KEYS = [' ', 'Enter'];

export const chargeAt = (ms) => (ms < TAP_MS ? TAP_POWER : Math.min(1, 0.45 + ((ms - TAP_MS) / FULL_CHARGE_MS) * 0.55));

export class FlickInput {
  constructor(el, { onAim, onFlick, isActive, getOrigin, cursorToWorld, getDefaultAngle, onDevice }) {
    this.el = el;
    this.onAim = onAim;
    this.onFlick = onFlick;
    this.isActive = isActive;
    this.getOrigin = getOrigin;
    this.cursorToWorld = cursorToWorld;
    this.getDefaultAngle = getDefaultAngle;
    this.onDevice = onDevice || (() => {});
    this.device = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'mouse' : 'touch';

    // slingshot (touch / pen)
    this.id = null;
    this.sx = 0;
    this.sy = 0;
    this.power = 0;

    // mouse + keyboard
    this.mx = 0;
    this.my = 0;
    this.mouseSeen = false;
    this.keys = new Set();
    this.keyAngle = null;
    this.chargeStart = 0; // performance.now() of press, 0 = not charging
    this.chargeBy = ''; // 'mouse' | 'key'
    this.live = 0; // power currently shown to the player, for the HUD meter

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.cancelAll());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
  }

  get maxPx() {
    return Math.max(110, Math.min(this.el.clientWidth, this.el.clientHeight) * 0.26);
  }

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.onDevice(d);
  }

  blocked(e) {
    return !!(e.target && e.target.closest && e.target.closest('button, .hud-btn, .sheet, .emote-wheel'));
  }

  // ---- pointer events ------------------------------------------------------
  down(e) {
    if (!this.isActive() || this.blocked(e)) return;
    if (e.pointerType === 'mouse') {
      this.setDevice('mouse');
      this.mx = e.clientX;
      this.my = e.clientY;
      this.mouseSeen = true;
      if (e.button === 0) this.startCharge('mouse');
      else if (e.button === 2) this.cancelCharge();
      return;
    }
    if (this.id !== null) return;
    this.setDevice('touch');
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
    if (e.pointerType === 'mouse') {
      if (this.device !== 'mouse') this.setDevice('mouse');
      this.mx = e.clientX;
      this.my = e.clientY;
      this.mouseSeen = true;
      return;
    }
    if (e.pointerId !== this.id) return;
    const dx = this.sx - e.clientX; // slingshot: aim opposite to the pull
    const dy = this.sy - e.clientY;
    const d = Math.hypot(dx, dy);
    if (d < 14) {
      this.power = 0;
      this.onAim(0, 0, 0);
      return;
    }
    this.pullX = dx;
    this.pullY = dy;
    this.power = Math.min(1, (d - 14) / (this.maxPx - 14));
    this.onAim(dx, dy, this.power);
  }

  up(e) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && this.chargeBy === 'mouse') this.release();
      return;
    }
    if (e.pointerId !== this.id) return;
    const had = this.power;
    this.id = null;
    this.onAim(0, 0, 0);
    if (had > 0.12) this.onFlick(this.pullX, this.pullY, had);
  }

  cancel(e) {
    if (e.pointerType === 'mouse') return this.cancelCharge();
    if (e.pointerId !== this.id) return;
    this.id = null;
    this.power = 0;
    this.onAim(0, 0, 0);
  }

  // ---- keyboard ------------------------------------------------------------
  typing(e) {
    const t = e.target;
    return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
  }

  keyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || this.typing(e)) return;
    if (!this.isActive()) return;
    const turning = LEFT_KEYS.includes(e.key) || RIGHT_KEYS.includes(e.key);
    const charging = CHARGE_KEYS.includes(e.key);
    if (e.key === 'Escape') return this.cancelCharge();
    if (!turning && !charging) return;
    e.preventDefault();
    this.setDevice('key');
    if (this.keyAngle === null) this.keyAngle = this.getDefaultAngle();
    if (turning) this.keys.add(e.key);
    else if (!e.repeat) this.startCharge('key');
  }

  keyUp(e) {
    this.keys.delete(e.key);
    if (CHARGE_KEYS.includes(e.key) && this.chargeBy === 'key') this.release();
  }

  // ---- charge / release (mouse + keyboard) --------------------------------
  startCharge(by) {
    if (this.chargeStart) return;
    this.chargeStart = performance.now();
    this.chargeBy = by;
  }

  cancelCharge() {
    this.chargeStart = 0;
    this.chargeBy = '';
    this.live = 0;
  }

  cancelAll() {
    this.cancelCharge();
    this.keys.clear();
    if (this.id !== null) {
      this.id = null;
      this.power = 0;
      this.onAim(0, 0, 0);
    }
  }

  release() {
    const held = performance.now() - this.chargeStart;
    this.cancelCharge();
    if (!this.isActive()) return;
    const power = chargeAt(held);
    this.refresh(power);
    this.onFlick(0, 0, power);
  }

  /** Recompute the aim for mouse / keyboard. `power` forces a value (used on release). */
  refresh(power) {
    const charging = this.chargeStart > 0;
    const p = power ?? (charging ? chargeAt(performance.now() - this.chargeStart) : PREVIEW_POWER);
    this.live = charging ? p : 0;
    if (this.device === 'key' && this.keyAngle !== null) {
      this.onAim(Math.cos(this.keyAngle), Math.sin(this.keyAngle) * 0.87, p, !charging && power === undefined);
      return;
    }
    if (this.device === 'mouse' && this.mouseSeen) {
      const o = this.getOrigin();
      if (!o) return;
      const dx = this.mx - o[0];
      const dy = this.my - o[1];
      if (Math.hypot(dx, dy) < 24) return this.onAim(0, 0, 0);
      // aim at the exact spot on the floor under the cursor (the camera is tilted)
      const w = this.cursorToWorld(this.mx, this.my);
      if (!w) return;
      this.onAim(w[0], w[1] * 0.87, p, !charging && power === undefined);
    }
  }

  /** Call once per frame. */
  update(dt) {
    if (!this.isActive()) {
      if (this.chargeStart || this.keys.size) this.cancelAll();
      this.live = 0;
      return;
    }
    if (this.device === 'touch') return;
    if (this.device === 'key' && this.keyAngle !== null) {
      const turn = (this.keys.size && [...this.keys].some((k) => RIGHT_KEYS.includes(k)) ? 1 : 0) - ([...this.keys].some((k) => LEFT_KEYS.includes(k)) ? 1 : 0);
      this.keyAngle += turn * TURN_SPEED * dt;
    }
    this.refresh();
  }
}

export const rangeOf = (power) => (power * C.flickMax) / C.drag;
