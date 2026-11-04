// GPU-drawn particle system: one Points object per blending mode, circles and stars in one shader.
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute float shape;
  attribute vec3 tint;
  varying float vAlpha;
  varying float vShape;
  varying vec3 vTint;
  uniform float scale;
  void main() {
    vAlpha = alpha;
    vShape = shape;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vShape;
  varying vec3 vTint;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a;
    if (vShape < 0.5) {
      a = smoothstep(1.0, 0.55, length(p));
    } else {
      float ang = atan(p.y, p.x);
      float k = 0.5 + 0.5 * cos(ang * 5.0);
      float rad = mix(0.38, 1.0, pow(k, 1.6));
      a = smoothstep(rad, rad - 0.2, length(p));
    }
    if (a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vTint, a * vAlpha);
  }
`;

class Layer {
  constructor(max, additive) {
    this.max = max;
    this.n = 0;
    this.p = new Array(max);
    for (let i = 0; i < max; i++) this.p[i] = { life: 0 };
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.shape = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('shape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 800 } },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.cursor = 0;
  }

  emit(o) {
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    Object.assign(p, o);
    p.max = o.life;
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= (p.g || 0) * dt;
      const d = Math.exp(-(p.drag || 0) * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.life / p.max;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.size[n] = p.size * (p.grow ? 1 + (1 - t) * p.grow : 0.4 + 0.6 * t);
      this.alpha[n] = Math.min(1, t * 2.2);
      this.shape[n] = p.shape || 0;
      this.tint[n * 3] = p.r;
      this.tint[n * 3 + 1] = p.g2;
      this.tint[n * 3 + 2] = p.b;
      n++;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'size', 'alpha', 'shape', 'tint']) this.geo.attributes[k].needsUpdate = true;
  }
}

const tmp = new THREE.Color();

export class Fx {
  constructor(scene) {
    this.glow = new Layer(1400, true);
    this.solid = new Layer(900, false);
    scene.add(this.glow.points, this.solid.points);
    this.rings = [];
    this.scene = scene;
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  setScale(h) {
    // point size scales with the drawing-buffer height so effects look the same at any resolution
    this.glow.mat.uniforms.scale.value = h * 1.2;
    this.solid.mat.uniforms.scale.value = h * 1.2;
  }

  _emit(layer, x, y, z, vx, vy, vz, color, size, life, extra = {}) {
    tmp.set(color);
    layer.emit({ x, y, z, vx, vy, vz, size, life, r: tmp.r, g2: tmp.g, b: tmp.b, ...extra });
  }

  burst(x, y, z, { n = 20, color = '#ffe14d', speed = 400, size = 40, life = 0.7, shape = 1, g = 500, additive = true, up = 0.5 } = {}) {
    const layer = additive ? this.glow : this.solid;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      this._emit(layer, x, y, z, Math.cos(a) * s, speed * up * (0.3 + Math.random()), Math.sin(a) * s, color, size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), { shape, g, drag: 1.4 });
    }
  }

  confetti(x, y, z, n = 40, spread = 500) {
    const cols = ['#ff7eb6', '#4fc3ff', '#8be04e', '#ffd23f', '#9b6bff', '#ff8a3d'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * Math.random();
      this._emit(this.solid, x, y, z, Math.cos(a) * s, 500 + Math.random() * 600, Math.sin(a) * s, cols[i % cols.length], 26 + Math.random() * 18, 1.6 + Math.random() * 1.2, { shape: Math.random() < 0.4 ? 1 : 0, g: 650, drag: 1.0 });
    }
  }

  puff(x, y, z, color = '#ffffff', n = 6, size = 70) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this._emit(this.solid, x, y + 6, z, Math.cos(a) * 90, 60 + Math.random() * 80, Math.sin(a) * 90, color, size * (0.6 + Math.random() * 0.6), 0.55 + Math.random() * 0.3, { grow: 1.6, drag: 3 });
    }
  }

  trail(x, y, z, kind, color) {
    const o = { life: 0.6, drag: 2, g: 0 };
    if (kind === 1) this._emit(this.glow, x, y + 30, z, 0, 80, 0, '#ff6fa6', 46, 0.8, { ...o, shape: 1, g: -60 });
    else if (kind === 2) this._emit(this.glow, x + (Math.random() - 0.5) * 30, y + 30, z + (Math.random() - 0.5) * 30, 0, 40, 0, '#ffe14d', 44, 0.8, { ...o, shape: 1 });
    else if (kind === 3) this._emit(this.solid, x, y + 30, z, (Math.random() - 0.5) * 40, 70, (Math.random() - 0.5) * 40, '#bfeaff', 34, 1.0, { ...o, g: -80 });
    else if (kind === 4) {
      tmp.setHSL((performance.now() / 700) % 1, 0.9, 0.6);
      this._emit(this.glow, x, y + 24, z, 0, 10, 0, '#' + tmp.getHexString(), 52, 0.9, o);
    } else this._emit(this.glow, x + (Math.random() - 0.5) * 20, y + 30, z + (Math.random() - 0.5) * 20, 0, 30, 0, color, 30, 0.5, { ...o, shape: 1 });
  }

  ring(x, y, z, color = '#ffffff', size = 260, life = 0.5, width = 1) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.set(x, y + 4, z);
    m.scale.setScalar(20);
    this.scene.add(m);
    this.rings.push({ m, life, max: life, size, width });
  }

  update(dt) {
    this.glow.update(dt);
    this.solid.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      if (r.life <= 0) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      r.m.scale.set(20 + r.size * e, 1, 20 + r.size * e);
      r.m.material.opacity = 0.9 * (1 - t);
    }
  }
}
