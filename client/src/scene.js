// Three.js stage: candy-coloured floating arena, sky, abyss, post-processing and event-driven effects.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { C, MODES, layoutTiles, pillarSpots } from '../../shared/sim.js';
import { COLORS } from '../../shared/cosmetics.js';
import { Fx } from './fx.js';
import { createPuck, updatePuck, bumpPuck } from './puck.js';

const TILE_H = 46;
const PALETTE = ['#ff6fae', '#4fc0ff', '#ffd04a'];
const ORB_COLORS = { mega: '#ffb000', shield: '#4fe0ff', rocket: '#ff4d2a', quake: '#b86bff' };
const ORB_ICONS = { mega: '\u{1F4AA}', shield: '\u{1F6E1}️', rocket: '\u{1F680}', quake: '\u{1F4A5}' };

const FinalPass = {
  uniforms: {
    tDiffuse: { value: null },
    aberration: { value: 0 },
    vignette: { value: 0.32 },
    flash: { value: 0 },
    danger: { value: 0 },
    time: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float aberration, vignette, flash, danger, time; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 off = c * aberration * 0.018 * (0.4 + d);
      vec4 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col.a = 1.0;
      col.rgb *= 1.0 - smoothstep(0.35, 0.95, d) * vignette;
      col.rgb += vec3(1.0, 0.95, 0.8) * flash * (1.0 - d);
      col.rgb = mix(col.rgb, col.rgb * vec3(1.15, 0.75, 0.8), danger * smoothstep(0.2, 0.9, d));
      float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = mix(vec3(l), col.rgb, 1.12);
      gl_FragColor = col;
    }`,
};

const ABYSS_FRAG = /* glsl */ `
  varying vec2 vUv; uniform float time;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  vec3 pal(float t){ return 0.55 + 0.45*cos(6.28318*(vec3(1.0,1.0,1.0)*t + vec3(0.0,0.33,0.67))); }
  void main(){
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x) + r * 3.2 - time * 0.35;
    float n = noise(vec2(a * 2.0, r * 6.0 - time * 0.8)) * 0.6 + noise(vec2(a * 5.0, r * 14.0 + time)) * 0.4;
    vec3 col = pal(a / 6.28318 + n * 0.35 + time * 0.03);
    col *= (smoothstep(0.02, 0.55, r) * 0.9 + 0.1) * 0.85;
    col = mix(col, vec3(1.0, 0.9, 1.0), pow(1.0 - r, 6.0) * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vPos;
  void main(){
    float h = normalize(vPos).y;
    vec3 top = vec3(0.30, 0.36, 0.95);
    vec3 mid = vec3(0.98, 0.55, 0.85);
    vec3 hor = vec3(1.0, 0.86, 0.62);
    vec3 low = vec3(0.45, 0.85, 1.0);
    vec3 c = h > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.25, 0.9, h)), smoothstep(0.0, 0.35, h)) : mix(hor, low, smoothstep(0.0, -0.5, h));
    gl_FragColor = vec4(c, 1.0);
  }`;

function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const paths = [
    [[128, 128], [90, 96], [70, 50], [52, 24]],
    [[128, 128], [170, 108], [196, 70], [214, 40]],
    [[128, 128], [112, 170], [84, 200], [70, 236]],
    [[128, 128], [160, 160], [200, 176], [236, 190]],
    [[90, 96], [50, 100], [20, 92]],
    [[170, 108], [210, 124], [240, 120]],
  ];
  for (const [w, col] of [[16, 'rgba(60,30,80,0.55)'], [7, 'rgba(255,255,255,0.9)']]) {
    x.lineWidth = w;
    x.strokeStyle = col;
    for (const p of paths) {
      x.beginPath();
      x.moveTo(...p[0]);
      for (let i = 1; i < p.length; i++) x.lineTo(...p[i]);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripeTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? a : b;
    x.fillRect(0, i * 16, 128, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

function emojiSprite(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.font = '88px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 20, 12000);
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 1200, 900);
    this.quality = 2;
    this.frameTimes = [];
    this.shake = 0;
    this.fovKick = 0;
    this.aberration = 0;
    this.flash = 0;
    this.danger = 0;
    this.pk = new Map();
    this.lastView = new Map();
    this.orbMeshes = new Map();
    this.arenaKey = '';
    this.time = 0;
    this.camMode = 'match';
    this.orbit = 0;
    this.cinematic = 0;
    this.uiScale = 1;

    this._lights();
    this._backdrop();
    this.fx = new Fx(this.scene);
    this._aim();
    this._gems();
    this.setQuality(this._autoQuality());
    this.resize();
  }

  _autoQuality() {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency || 4;
    if (mobile) return cores >= 6 ? 1 : 0;
    return 2;
  }

  _lights() {
    const hemi = new THREE.HemisphereLight('#fff0fb', '#8fa6ff', 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
    sun.position.set(700, 1500, 800);
    sun.castShadow = true;
    sun.shadow.camera.left = -1400;
    sun.shadow.camera.right = 1400;
    sun.shadow.camera.top = 1400;
    sun.shadow.camera.bottom = -1400;
    sun.shadow.camera.near = 200;
    sun.shadow.camera.far = 4000;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 2;
    this.scene.add(sun);
    this.sun = sun;
    const rim = new THREE.DirectionalLight('#9fd8ff', 0.9);
    rim.position.set(-900, 600, -700);
    this.scene.add(rim);
  }

  _backdrop() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(6000, 24, 16),
      new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: SKY_FRAG })
    );
    this.scene.add(sky);

    this.abyssMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: ABYSS_FRAG });
    const abyss = new THREE.Mesh(new THREE.CircleGeometry(4200, 64), this.abyssMat);
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = -900;
    this.scene.add(abyss);

    // fluffy clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffd9f2', emissiveIntensity: 0.35 });
    const sph = new THREE.SphereGeometry(1, 14, 10);
    this.clouds = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(sph, cloudMat);
        m.scale.set(160 + Math.random() * 120, 100 + Math.random() * 70, 130 + Math.random() * 90);
        m.position.set((k - n / 2) * 170 + Math.random() * 60, Math.random() * 60, Math.random() * 80);
        g.add(m);
      }
      const a = (i / 12) * Math.PI * 2;
      const R = 2100 + Math.random() * 900;
      g.position.set(Math.cos(a) * R, -250 + Math.random() * 500, Math.sin(a) * R);
      g.userData = { a, R, speed: 0.01 + Math.random() * 0.02, y: g.position.y };
      this.scene.add(g);
      this.clouds.push(g);
    }

    // floating candy: donuts, lollipops, balloons
    this.candy = [];
    const donutGeo = new THREE.TorusGeometry(120, 52, 14, 28);
    const stickGeo = new THREE.CylinderGeometry(7, 7, 220, 8);
    const candyColors = ['#ff6fb0', '#6fd6ff', '#ffd84a', '#9d7bff', '#7be86a', '#ff8a4d'];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const col = candyColors[i % candyColors.length];
      const kind = i % 3;
      if (kind === 0) {
        const d = new THREE.Mesh(donutGeo, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 1 }));
        d.castShadow = false;
        g.add(d);
      } else if (kind === 1) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(95, 20, 14), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 1 }));
        l.position.y = 130;
        const s = new THREE.Mesh(stickGeo, new THREE.MeshStandardMaterial({ color: '#fff7e8' }));
        g.add(l, s);
      } else {
        const b = new THREE.Mesh(new THREE.SphereGeometry(100, 20, 14), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.2, clearcoat: 1 }));
        b.scale.y = 1.2;
        g.add(b);
      }
      const a = Math.random() * Math.PI * 2;
      const R = 1500 + Math.random() * 1700;
      g.position.set(Math.cos(a) * R, -500 + Math.random() * 1200, Math.sin(a) * R);
      g.userData = { y: g.position.y, ph: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6 };
      g.rotation.set(Math.random() * 2, Math.random() * 2, 0);
      this.scene.add(g);
      this.candy.push(g);
    }
  }

  _gems() {
    this.gemMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: '#7be8ff', emissive: '#2fc8ff', emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.1 }),
      40
    );
    this.gemMesh.frustumCulled = false;
    this.gemMesh.castShadow = true;
    this.scene.add(this.gemMesh);
    this.dummy = new THREE.Object3D();
  }

  _aim() {
    this.aim = new THREE.Group();
    this.aimDots = [];
    const dotGeo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }));
      this.aim.add(m);
      this.aimDots.push(m);
    }
    this.aimHead = new THREE.Mesh(new THREE.ConeGeometry(1, 1.6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false }));
    this.aimHead.rotation.x = Math.PI / 2;
    this.aim.add(this.aimHead);
    const ringGeo = new THREE.RingGeometry(0.7, 1, 36);
    ringGeo.rotateX(-Math.PI / 2);
    this.aimStop = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    this.aim.add(this.aimStop);
    this.aim.visible = false;
    this.scene.add(this.aim);
  }

  // ---------------------------------------------------------------- arena

  loadArena(mode) {
    const key = mode;
    if (key === this.arenaKey) return;
    this.arenaKey = key;
    if (this.arena) {
      this.scene.remove(this.arena);
      this.arena.traverse((o) => o.geometry && o.geometry.dispose && o !== this.gemMesh && o.geometry.dispose());
    }
    const N = (MODES[mode] || MODES.ffa).radius;
    this.N = N;
    this.layout = layoutTiles(N);
    const arena = new THREE.Group();
    this.arena = arena;
    this.scene.add(arena);

    const R = C.tile * 0.93;
    const bevel = 9;
    const shape = new THREE.Shape();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 3;
      const x = Math.cos(a) * (R - bevel);
      const y = Math.sin(a) * (R - bevel);
      k ? shape.lineTo(x, y) : shape.moveTo(x, y);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: TILE_H - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -(TILE_H - bevel), 0);
    const tileMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    this.tiles = new THREE.InstancedMesh(geo, tileMat, this.layout.length);
    this.tiles.castShadow = true;
    this.tiles.receiveShadow = true;
    this.tiles.frustumCulled = false;
    arena.add(this.tiles);

    const crackGeo = new THREE.PlaneGeometry(C.tile * 1.5, C.tile * 1.5);
    crackGeo.rotateX(-Math.PI / 2);
    this.cracks = new THREE.InstancedMesh(crackGeo, new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.layout.length);
    this.cracks.frustumCulled = false;
    arena.add(this.cracks);

    this.tileBase = this.layout.map((t, i) => {
      const c = new THREE.Color(PALETTE[(((t.q - t.r) % 3) + 3) % 3]);
      c.offsetHSL(0, 0, (((i * 37) % 11) / 11 - 0.5) * 0.06);
      if (t.ring === 0) c.set('#ffd56a');
      return c;
    });
    this.tileState = this.layout.map(() => ({ st: 'ok', fallAt: 0, hp: 2 }));
    this.tileMat = tileMat;

    // Pillars
    this.pillarMeshes = [];
    const stripe = stripeTexture('#ff6fb0', '#ffffff');
    for (const p of pillarSpots(mode)) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(C.pillarR, C.pillarR * 1.1, 130, 24), new THREE.MeshPhysicalMaterial({ map: stripe, roughness: 0.3, clearcoat: 0.8 }));
      body.position.y = 65;
      body.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(C.pillarR * 1.08, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#ffd84a', roughness: 0.2, clearcoat: 1, emissive: '#ffb000', emissiveIntensity: 0.25 }));
      cap.position.y = 135;
      cap.castShadow = true;
      g.add(body, cap);
      g.position.set(p.x, 0, p.y);
      arena.add(g);
      this.pillarMeshes.push(g);
    }
  }

  setTiles(states) {
    // states: array of {st,hp} aligned to layout
    if (!this.tiles) return;
    const d = this.dummy;
    const t = this.time;
    const col = new THREE.Color();
    for (let i = 0; i < this.layout.length; i++) {
      const L = this.layout[i];
      const s = states[i] || { st: 'ok', hp: 2 };
      const ts = this.tileState[i];
      if (s.st !== ts.st) {
        if (s.st === 'fall') ts.fallAt = t;
        ts.st = s.st;
      }
      ts.hp = s.hp;
      let y = 0;
      let sc = 1;
      let ox = 0;
      let oz = 0;
      let rx = 0;
      let rz = 0;
      col.copy(this.tileBase[i]);
      if (s.hp === 1) col.multiplyScalar(0.82);
      if (s.st === 'warn') {
        const f = (Math.sin(t * 16) + 1) / 2;
        col.lerp(new THREE.Color('#ff5a3c'), 0.35 + f * 0.5);
        y = Math.sin(t * 16) * 2;
      } else if (s.st === 'shake') {
        ox = (Math.random() - 0.5) * 8;
        oz = (Math.random() - 0.5) * 8;
        col.lerp(new THREE.Color('#ff3a2a'), 0.7);
      } else if (s.st === 'fall') {
        const dt = t - ts.fallAt;
        y = -dt * dt * 1100 - dt * 60;
        rx = dt * 1.6 * (i % 2 ? 1 : -1);
        rz = dt * 1.1;
        sc = Math.max(0.01, 1 - dt * 0.35);
        if (y < -1600) sc = 0.0001;
      }
      d.position.set(L.x + ox, y, L.y + oz);
      d.rotation.set(rx, 0, rz);
      d.scale.set(sc, sc, sc);
      d.updateMatrix();
      this.tiles.setMatrixAt(i, d.matrix);
      this.tiles.setColorAt(i, col);

      const showCrack = (s.hp === 1 && s.st === 'ok') || s.st === 'shake' || s.st === 'warn';
      d.position.y = y + 1.2;
      d.scale.setScalar(showCrack ? sc : 0.0001);
      d.rotation.y = i * 0.9;
      d.updateMatrix();
      this.cracks.setMatrixAt(i, d.matrix);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.cracks.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- pucks

  syncPucks(list, meId) {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, o] of this.pk) {
      if (!ids.has(id)) {
        this.scene.remove(o.root);
        this.pk.delete(id);
      }
    }
    for (const p of list) {
      const have = this.pk.get(p.id);
      const sig = `${p.kind}|${p.col}|${p.hat}|${p.name}|${p.id === meId}`;
      if (have && have.sig === sig) continue;
      if (have) this.scene.remove(have.root);
      const o = createPuck({ ...p, lives: p.lives }, p.id === meId);
      o.sig = sig;
      o.root.traverse((m) => {
        if (m.isMesh) m.castShadow = m.castShadow !== false;
      });
      this.scene.add(o.root);
      this.pk.set(p.id, o);
    }
  }

  // ---------------------------------------------------------------- aim

  setAim(puck, angle, power, rangeFn) {
    if (!puck || power <= 0) {
      this.aim.visible = false;
      return;
    }
    this.aim.visible = true;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const range = rangeFn(power);
    const col = new THREE.Color().setHSL(0.33 - power * 0.33, 0.95, 0.58);
    this.aim.position.set(puck.x, 6, puck.y);
    const n = this.aimDots.length;
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      const m = this.aimDots[i];
      m.position.set(dx * (puck.r + 26 + f * range), 0, dz * (puck.r + 26 + f * range));
      m.scale.setScalar((9 + f * 12 + Math.sin(this.time * 12 - i) * 1.2) * this.uiScale);
      m.material.color.copy(col);
      m.material.opacity = 0.35 + f * 0.65;
    }
    this.aimHead.position.set(dx * (puck.r + 36 + range), 0, dz * (puck.r + 36 + range));
    this.aimHead.rotation.set(Math.PI / 2, 0, 0);
    this.aimHead.rotation.order = 'YXZ';
    this.aimHead.rotation.y = -angle + Math.PI / 2;
    this.aimHead.scale.setScalar((34 + power * 22) * this.uiScale);
    this.aimHead.material.color.copy(col);
    this.aimStop.position.set(dx * range, 1, dz * range);
    this.aimStop.scale.setScalar(puck.r * 0.9 * this.uiScale);
    this.aimStop.material.color.copy(col);
  }

  // ---------------------------------------------------------------- events -> effects

  event(e, view) {
    const fx = this.fx;
    const P = (id) => this.pk.get(id);
    switch (e.type) {
      case 'flick': {
        fx.puff(e.x, 10, e.y, e.rocket ? '#ffb27a' : '#ffffff', 6, 80);
        fx.ring(e.x, 8, e.y, e.rocket ? '#ff7a3c' : '#ffffff', 170, 0.35);
        const o = P(e.id);
        if (o) bumpPuck(o, 1.2 + e.p * 2);
        this.fovKick = Math.max(this.fovKick, e.p * 3);
        break;
      }
      case 'hit': {
        const k = Math.min(1, e.s / 900);
        fx.burst(e.x, 70, e.y, { n: 8 + Math.floor(k * 22), color: '#fff3a0', speed: 300 + k * 500, size: 56 + k * 40, life: 0.7, shape: 1 });
        fx.burst(e.x, 60, e.y, { n: 6, color: '#ff9ad2', speed: 220, size: 38, life: 0.5, shape: 0 });
        fx.ring(e.x, 20, e.y, '#fff3a0', 150 + k * 260, 0.4);
        this.shake = Math.max(this.shake, 6 + k * 22);
        this.aberration = Math.max(this.aberration, 0.25 + k * 0.9);
        this.flash = Math.max(this.flash, k * 0.2);
        const a = P(e.a);
        const b = P(e.b);
        if (a) bumpPuck(a, 2 + k * 5);
        if (b) {
          bumpPuck(b, 4 + k * 9);
          b.hurtT = 0.7;
        }
        break;
      }
      case 'bounce':
        fx.burst(e.x, 80, e.y, { n: 10, color: '#ffd84a', speed: 260, size: 44, life: 0.5 });
        fx.ring(e.x, 20, e.y, '#ffd84a', 120, 0.3);
        break;
      case 'bank':
        fx.burst(e.x, 90, e.y, { n: 40, color: '#ffd84a', speed: 650, size: 70, life: 1.0, shape: 1 });
        fx.ring(e.x, 20, e.y, '#ffd84a', 420, 0.6);
        this.shake = Math.max(this.shake, 24);
        break;
      case 'ko':
        fx.burst(e.x, 120, e.y, { n: 46, color: '#ff9ad2', speed: 700, size: 86, life: 1.1, shape: 1 });
        fx.burst(e.x, 120, e.y, { n: 30, color: '#8ee8ff', speed: 520, size: 60, life: 0.9, shape: 0 });
        fx.ring(e.x, 20, e.y, '#ffffff', 520, 0.7);
        this.shake = Math.max(this.shake, 30);
        this.aberration = Math.max(this.aberration, 1.2);
        this.flash = Math.max(this.flash, 0.25);
        break;
      case 'tile': {
        const L = this.layout && this.layout[e.i];
        if (L) fx.puff(L.x, 20, L.y, '#e8d9ff', 5, 90);
        break;
      }
      case 'tilefall': {
        const L = this.layout && this.layout[e.i];
        if (L) fx.puff(L.x, 10, L.y, '#ffffff', 8, 130);
        this.shake = Math.max(this.shake, 6);
        break;
      }
      case 'orb':
        fx.burst(e.x, 80, e.y, { n: 30, color: ORB_COLORS[e.kind] || '#fff', speed: 520, size: 70, life: 0.9, shape: 1 });
        fx.ring(e.x, 20, e.y, ORB_COLORS[e.kind] || '#fff', 380, 0.6);
        if (e.kind === 'quake') {
          fx.ring(e.x, 16, e.y, '#ffffff', 700, 0.7);
          this.shake = Math.max(this.shake, 26);
        }
        break;
      case 'gem':
        fx.burst(e.x, 60, e.y, { n: 10, color: '#7be8ff', speed: 300, size: 44, life: 0.6 });
        break;
      case 'respawn':
        fx.ring(e.x, 10, e.y, '#8ee8ff', 360, 0.7);
        fx.burst(e.x, 40, e.y, { n: 24, color: '#8ee8ff', speed: 400, size: 56, life: 0.9, up: 1.4 });
        break;
      case 'over': {
        const win = view && view.pucks.find((p) => e.winner && e.winner.ids.includes(p.id));
        if (win) {
          fx.confetti(win.x, 60, win.y, 120, 800);
          fx.ring(win.x, 12, win.y, '#ffd84a', 700, 1.0);
        }
        this.flash = Math.max(this.flash, 0.35);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- quality / size

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    r.shadowMap.enabled = q >= 1;
    this.sun.castShadow = q >= 1;
    this.sun.shadow.mapSize.set(q >= 2 ? 2048 : 1024, q >= 2 ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.pixel = Math.min(window.devicePixelRatio || 1, q >= 2 ? 2 : q === 1 ? 1.5 : 1);
    this._buildComposer();
    this.resize();
  }

  _buildComposer() {
    if (this.quality === 0) {
      this.composer = null;
      return;
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x || 4, size.y || 4, { type: THREE.HalfFloatType, samples: this.quality >= 2 ? 4 : 2 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x || 4, size.y || 4), 0.3, 0.6, 0.95);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(FinalPass);
    this.composer.addPass(this.finalPass);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const p = this.canvas.parentElement;
    const w = Math.max(2, p.clientWidth);
    const h = Math.max(2, p.clientHeight);
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.pixel || 1);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixel || 1);
      this.composer.setSize(w, h);
    }
    this.fx.setScale(h * (this.pixel || 1) * 0.5);
  }

  project(x, y, h = 0) {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h, v.z];
  }

  /** Converts a screen point to ground (x, y) coordinates in sim space. */
  unproject(sx, sy) {
    const v = new THREE.Vector3((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const t = -this.camera.position.y / dir.y;
    return [this.camera.position.x + dir.x * t, this.camera.position.z + dir.z * t];
  }

  // ---------------------------------------------------------------- frame

  frame(view, dt, now, ctx) {
    this.time += dt;
    const t = this.time;

    // adaptive quality
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 100) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      if (avg > 0.026 && this.quality > 0 && !document.hidden) this.setQuality(this.quality - 1);
    }

    this.abyssMat.uniforms.time.value = t;
    for (const c of this.clouds) {
      c.userData.a += c.userData.speed * dt;
      c.position.x = Math.cos(c.userData.a) * c.userData.R;
      c.position.z = Math.sin(c.userData.a) * c.userData.R;
    }
    for (const c of this.candy) {
      c.position.y = c.userData.y + Math.sin(t * 0.6 + c.userData.ph) * 40;
      c.rotation.y += c.userData.spin * dt;
      c.rotation.x += c.userData.spin * 0.5 * dt;
    }

    this.setTiles(view.tiles);
    this.syncPucks(view.pucks, ctx.meId);
    this._orbs(view.orbs, t);
    this._gemsUpdate(view.gems, t);

    const look = { x: 0, y: 0 };
    for (const v of view.pucks) {
      const o = this.pk.get(v.id);
      if (!o) continue;
      this.lastView.set(v.id, v);
      // pupils look toward the nearest foe
      let near = null;
      let nd = 1e9;
      for (const w of view.pucks) {
        if (w === v || w.state !== 'live') continue;
        const d = Math.hypot(w.x - v.x, w.y - v.y);
        if (d < nd) {
          nd = d;
          near = w;
        }
      }
      if (near && v.state === 'live') {
        const a = Math.atan2(near.x - v.x, near.y - v.y) - o.heading;
        look.x = Math.sin(a);
        look.y = 0.2;
      } else {
        look.x = 0;
        look.y = 0;
      }
      updatePuck(o, v, dt, now, { look, meId: ctx.meId, charging: ctx.charging, showRings: ctx.showRings, ui: this.uiScale });
      if (v.state === 'live' && Math.hypot(v.vx, v.vy) > 120 && Math.random() < dt * 40) {
        this.fx.trail(v.x, 0, v.y, ctx.trails ? ctx.trails.get(v.id) || 0 : 0, (COLORS[v.col] || COLORS[0]).hex);
      }
    }

    this._camera(view, dt, ctx);
    this.fx.update(dt);

    this.shake *= Math.exp(-8 * dt);
    this.aberration *= Math.exp(-5 * dt);
    this.flash *= Math.exp(-6 * dt);
    this.fovKick *= Math.exp(-6 * dt);
    this.danger += ((ctx.danger || 0) - this.danger) * Math.min(1, dt * 6);

    if (this.finalPass) {
      const u = this.finalPass.uniforms;
      u.aberration.value = this.aberration;
      u.flash.value = this.flash;
      u.danger.value = this.danger;
      u.time.value = t;
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  _orbs(orbs, t) {
    const seen = new Set();
    for (const o of orbs) {
      seen.add(o.id);
      let m = this.orbMeshes.get(o.id);
      if (!m) {
        m = new THREE.Group();
        const col = ORB_COLORS[o.kind] || '#fff';
        const core = new THREE.Mesh(new THREE.SphereGeometry(30, 20, 14), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, roughness: 0.2 }));
        const halo = new THREE.Mesh(new THREE.TorusGeometry(46, 4, 8, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
        halo.rotation.x = Math.PI / 2;
        const icon = emojiSprite(ORB_ICONS[o.kind] || '?');
        icon.scale.set(52, 52, 1);
        icon.position.y = 4;
        m.add(core, halo, icon);
        m.userData = { halo, ph: Math.random() * 6 };
        this.scene.add(m);
        this.orbMeshes.set(o.id, m);
        this.fx.ring(o.x, 10, o.y, col, 300, 0.6);
      }
      m.position.set(o.x, 70 + Math.sin(t * 3 + m.userData.ph) * 10, o.y);
      m.userData.halo.rotation.z = t * 2;
    }
    for (const [id, m] of this.orbMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.orbMeshes.delete(id);
      }
    }
  }

  _gemsUpdate(gems, t) {
    const d = this.dummy;
    const n = Math.min(gems.length, 40);
    for (let i = 0; i < n; i++) {
      const g = gems[i];
      d.position.set(g.x, 44 + Math.sin(t * 3 + i) * 6, g.y);
      d.rotation.set(0.3, t * 2 + i, 0);
      d.scale.setScalar(15);
      d.updateMatrix();
      this.gemMesh.setMatrixAt(i, d.matrix);
    }
    this.gemMesh.count = n;
    this.gemMesh.instanceMatrix.needsUpdate = true;
  }

  _camera(view, dt, ctx) {
    const cam = this.camera;
    const aspect = this.w / this.h;
    let target = new THREE.Vector3(0, 0, 0);
    let radius = 900;
    let elev = (60 * Math.PI) / 180;
    let yaw = 0;

    if (this.camMode === 'showcase') {
      this.orbit += dt * 0.25;
      target.set(0, 45, 0);
      radius = 300;
      elev = (24 * Math.PI) / 180;
      yaw = Math.sin(this.orbit) * 0.5;
    } else {
      const live = view.pucks.filter((p) => p.state === 'live');
      let focus = live.length ? live : view.pucks;
      // follow the player and their three nearest rivals so the action stays big on screen
      const me = live.find((p) => p.id === ctx.meId);
      if (me && live.length > 4) {
        const others = live.filter((p) => p !== me).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
        focus = [me, me, ...others.slice(0, 3)];
      }
      if (focus.length) {
        let cx = 0;
        let cz = 0;
        for (const p of focus) {
          cx += p.x;
          cz += p.y;
        }
        cx /= focus.length;
        cz /= focus.length;
        cx *= 0.9;
        cz *= 0.9;
        let far = 0;
        for (const p of focus) far = Math.max(far, Math.hypot(p.x - cx, p.y - cz));
        radius = Math.max(520, Math.min(900, far * 0.95 + 260));
        target.set(cx, 0, cz);
      }
      if (this.cinematic > 0) {
        this.cinematic -= dt;
        radius *= 0.8;
      }
    }

    const vf = (cam.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const half = Math.min(vf, hf) / 2;
    const dist = radius / (Math.tan(half) * 0.9);
    this.uiScale = THREE.MathUtils.clamp(dist / 1700, 0.85, 2.1);
    const want = new THREE.Vector3(
      target.x + Math.sin(yaw) * dist * Math.cos(elev),
      target.y + dist * Math.sin(elev),
      target.z + Math.cos(yaw) * dist * Math.cos(elev)
    );
    const k = 1 - Math.exp(-3.2 * dt);
    this.camPos.lerp(want, this.camMode === 'showcase' ? 1 : k);
    this.camTarget.lerp(target, this.camMode === 'showcase' ? 1 : k);
    cam.position.copy(this.camPos);
    if (this.shake > 0.1) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      cam.position.z += (Math.random() - 0.5) * this.shake;
    }
    cam.lookAt(this.camTarget);
    const fov = 42 + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.sun.target.position.copy(this.camTarget);
    this.sun.target.updateMatrixWorld();
  }
}
