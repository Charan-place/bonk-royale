// A fixed-timestep-free 2D canvas game host: crisp on any screen, resizes with the container,
// pauses when the tab is hidden, and normalises mouse / touch / pen into one pointer stream.
export class GameCanvas {
  constructor(parent, { maxDpr = 2 } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.style.touchAction = 'none';
    parent.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.maxDpr = maxDpr;
    this.w = 1;
    this.h = 1;
    this.paused = false;
    this.handlers = { down: [], move: [], up: [] };
    this.last = 0;
    this.raf = 0;
    this.update = () => {};
    this.draw = () => {};
    this.onResize = () => {};
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(parent);
    this.resize();
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.emit('down', e));
    c.addEventListener('pointermove', (e) => this.emit('move', e));
    c.addEventListener('pointerup', (e) => this.emit('up', e));
    c.addEventListener('pointercancel', (e) => this.emit('up', e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      this.last = 0;
    });
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    this.w = Math.max(160, r.width);
    this.h = Math.max(160, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.dpr = dpr;
    this.onResize(this.w, this.h);
  }

  on(type, fn) {
    this.handlers[type].push(fn);
  }

  emit(type, e) {
    const r = this.canvas.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId, type: e.pointerType, button: e.button, raw: e };
    if (type === 'down') {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* best effort */
      }
    }
    for (const f of this.handlers[type]) f(p);
  }

  start() {
    const frame = (now) => {
      this.raf = requestAnimationFrame(frame);
      if (this.paused) return;
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
      this.last = now;
      this.update(dt);
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      this.draw(c, this.w, this.h);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Tiny particle system for confetti, puffs and sparkles. */
export class Particles {
  constructor() {
    this.list = [];
  }

  burst(x, y, n, { colors = ['#ffd23f', '#ff5fa2', '#4fc3ff', '#8be04e'], speed = 220, life = 0.7, size = 6, gravity = 500 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life, max: life, size: size * (0.6 + Math.random() * 0.8), c: colors[(Math.random() * colors.length) | 0], g: gravity });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(c) {
    for (const p of this.list) {
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.c;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
  }
}
