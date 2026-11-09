// Procedural "Bonkling" characters: body, face, species parts, hats, name tag, cooldown ring.
import * as THREE from 'three';
import { COLORS, TEAM_COLORS } from '../../shared/cosmetics.js';

const sphereGeo = new THREE.SphereGeometry(1, 28, 20);
const coneGeo = new THREE.ConeGeometry(1, 1, 16);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const torusGeo = new THREE.TorusGeometry(1, 0.22, 10, 28);

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...opts });
    matCache.set(key, m);
  }
  return m;
}
const glossy = (hex) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.18, sheen: 0.4 });

function mesh(geo, material, s, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(...s);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

function addKindParts(g, kind, body, color) {
  const dark = mat('#2a2438');
  const pink = mat('#ff9fb8');
  const white = mat('#ffffff');
  const orange = mat('#ff9f2e');
  const tint = body.material;
  if (kind === 0) {
    for (const s of [-1, 1]) {
      g.add(mesh(coneGeo, tint, [0.32, 0.55, 0.32], [s * 0.55, 0.88, -0.05], [0, 0, -s * 0.25]));
      g.add(mesh(coneGeo, pink, [0.18, 0.34, 0.18], [s * 0.55, 0.86, 0.04], [0, 0, -s * 0.25]));
    }
  } else if (kind === 1) {
    for (const s of [-1, 1]) {
      g.add(mesh(sphereGeo, tint, [0.2, 0.62, 0.16], [s * 0.34, 1.32, -0.1], [0, 0, -s * 0.12]));
      g.add(mesh(sphereGeo, pink, [0.1, 0.42, 0.08], [s * 0.34, 1.32, -0.02], [0, 0, -s * 0.12]));
    }
  } else if (kind === 2) {
    for (const s of [-1, 1]) g.add(mesh(sphereGeo, tint, [0.26, 0.26, 0.2], [s * 0.66, 0.74, -0.05]));
    g.add(mesh(sphereGeo, mat('#fff1dc'), [0.34, 0.26, 0.2], [0, -0.1, 0.9]));
  } else if (kind === 3) {
    g.userData.bulge = true;
    for (const s of [-1, 1]) g.add(mesh(sphereGeo, tint, [0.34, 0.34, 0.34], [s * 0.42, 0.92, 0.35]));
  } else if (kind === 4) {
    for (let i = 0; i < 4; i++) g.add(mesh(coneGeo, mat('#ffd23f'), [0.16, 0.34 - i * 0.03, 0.16], [0, 0.95 - i * 0.18, -0.25 - i * 0.2], [-0.6 - i * 0.2, 0, 0]));
    g.add(mesh(coneGeo, tint, [0.22, 0.6, 0.22], [0, -0.1, -1.1], [Math.PI / 2 + 0.2, 0, 0]));
  } else if (kind === 5) {
    g.add(mesh(cylGeo, mat('#c9d4e6', { metalness: 0.7, roughness: 0.3 }), [0.04, 0.45, 0.04], [0, 1.15, 0]));
    g.add(mesh(sphereGeo, mat('#ff4d5e', { emissive: '#ff2b44', emissiveIntensity: 0.9 }), [0.12, 0.12, 0.12], [0, 1.42, 0]));
    for (const s of [-1, 1]) g.add(mesh(cylGeo, mat('#c9d4e6', { metalness: 0.7, roughness: 0.3 }), [0.16, 0.14, 0.16], [s * 0.98, 0.0, 0], [0, 0, Math.PI / 2]));
  } else if (kind === 6) {
    for (const s of [-1, 1]) {
      g.add(mesh(cylGeo, mat('#6f5cff'), [0.035, 0.5, 0.035], [s * 0.42, 1.1, 0], [0, 0, -s * 0.5]));
      g.add(mesh(sphereGeo, mat('#7dffb0', { emissive: '#41ff8a', emissiveIntensity: 1.1 }), [0.14, 0.14, 0.14], [s * 0.64, 1.38, 0]));
    }
  } else if (kind === 7) {
    g.add(mesh(sphereGeo, white, [0.72, 0.8, 0.5], [0, -0.1, 0.55]));
    g.add(mesh(coneGeo, orange, [0.14, 0.34, 0.14], [0, 0.0, 1.1], [Math.PI / 2, 0, 0]));
    for (const s of [-1, 1]) g.add(mesh(sphereGeo, tint, [0.14, 0.5, 0.3], [s * 1.0, -0.05, 0], [0, 0, s * 0.35]));
  }
}

function buildHat(idx) {
  const g = new THREE.Group();
  const gold = mat('#ffc400', { metalness: 0.6, roughness: 0.28, emissive: '#7a5200', emissiveIntensity: 0.25 });
  if (idx === 1) {
    g.add(mesh(coneGeo, mat('#ff5fa2'), [0.34, 0.8, 0.34], [0, 0.4, 0]));
    g.add(mesh(torusGeo, mat('#ffe14d'), [0.28, 0.28, 0.5], [0, 0.22, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(sphereGeo, mat('#ffffff'), [0.1, 0.1, 0.1], [0, 0.82, 0]));
  } else if (idx === 2) {
    g.add(mesh(cylGeo, mat('#ff4d5e'), [0.22, 0.1, 0.22], [0, 0.05, 0]));
    const blades = new THREE.Group();
    blades.name = 'prop';
    blades.position.y = 0.16;
    blades.add(mesh(sphereGeo, mat('#4fc3ff'), [0.8, 0.04, 0.14], [0, 0, 0]));
    blades.add(mesh(sphereGeo, mat('#ffd23f'), [0.14, 0.04, 0.8], [0, 0, 0]));
    g.add(blades);
  } else if (idx === 3) {
    g.add(mesh(cylGeo, mat('#2a2438'), [0.42, 0.55, 0.42], [0, 0.32, 0]));
    g.add(mesh(cylGeo, mat('#2a2438'), [0.62, 0.06, 0.62], [0, 0.04, 0]));
    g.add(mesh(cylGeo, mat('#ff4d5e'), [0.43, 0.1, 0.43], [0, 0.18, 0]));
  } else if (idx === 4) {
    g.add(mesh(cylGeo, mat('#b4784f'), [0.78, 0.06, 0.78], [0, 0.04, 0]));
    g.add(mesh(cylGeo, mat('#c98a5b'), [0.38, 0.32, 0.38], [0, 0.22, 0]));
    g.add(mesh(cylGeo, mat('#7a4b2d'), [0.39, 0.07, 0.39], [0, 0.1, 0]));
  } else if (idx === 5) {
    g.add(mesh(coneGeo, mat('#6f5cff'), [0.5, 1.15, 0.5], [0, 0.58, 0], [0, 0, 0.12]));
    g.add(mesh(cylGeo, mat('#5444d6'), [0.7, 0.05, 0.7], [0, 0.04, 0]));
    g.add(mesh(sphereGeo, mat('#ffe14d', { emissive: '#ffcc00', emissiveIntensity: 0.9 }), [0.1, 0.1, 0.1], [0.08, 1.0, 0.1]));
  } else if (idx === 6) {
    g.add(mesh(cylGeo, gold, [0.45, 0.26, 0.45], [0, 0.14, 0]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(coneGeo, gold, [0.1, 0.24, 0.1], [Math.cos(a) * 0.4, 0.38, Math.sin(a) * 0.4]));
    }
    g.add(mesh(sphereGeo, mat('#ff4d5e', { emissive: '#ff2244', emissiveIntensity: 0.6 }), [0.08, 0.08, 0.08], [0, 0.16, 0.45]));
  } else if (idx === 7) {
    const halo = mesh(torusGeo, mat('#fff3a8', { emissive: '#ffe066', emissiveIntensity: 1.6 }), [0.5, 0.5, 0.5], [0, 0.35, 0], [Math.PI / 2, 0, 0]);
    halo.name = 'halo';
    halo.castShadow = false;
    g.add(halo);
  }
  return g;
}

const labelCache = new Map();
const ME_COLOR = '#0a7cff';
let youTex = null;
function youTexture() {
  if (youTex) return youTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 110;
  const x = c.getContext('2d');
  x.lineJoin = 'round';
  x.fillStyle = ME_COLOR;
  x.strokeStyle = '#ffffff';
  x.lineWidth = 12;
  x.beginPath();
  x.roundRect(14, 10, 228, 90, 40);
  x.stroke();
  x.fill();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '800 66px "Baloo 2", system-ui, sans-serif';
  x.strokeStyle = 'rgba(40,30,70,0.9)';
  x.lineWidth = 3;
  x.strokeText('YOU', 128, 58);
  x.fillStyle = '#ffffff';
  x.fillText('YOU', 128, 58);
  youTex = new THREE.CanvasTexture(c);
  youTex.colorSpace = THREE.SRGBColorSpace;
  return youTex;
}

function labelTexture(name, hearts, color) {
  const key = `${name}|${hearts}|${color}`;
  let t = labelCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.lineJoin = 'round';
  x.font = '800 62px "Baloo 2", system-ui, sans-serif';
  x.lineWidth = 14;
  x.strokeStyle = 'rgba(40,30,70,0.9)';
  x.strokeText(name, 256, 68);
  x.fillStyle = color || '#fff';
  x.fillText(name, 256, 68);
  if (hearts > 0) {
    x.font = '56px system-ui, sans-serif';
    const hs = '♥'.repeat(hearts);
    x.lineWidth = 10;
    x.strokeStyle = 'rgba(40,30,70,0.9)';
    x.strokeText(hs, 256, 138);
    x.fillStyle = '#ff5a7a';
    x.fillText(hs, 256, 138);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  labelCache.set(key, t);
  if (labelCache.size > 300) {
    const first = labelCache.keys().next().value;
    labelCache.get(first).dispose();
    labelCache.delete(first);
  }
  return t;
}

export function createPuck(info, isMe = false) {
  const root = new THREE.Group();
  const wob = new THREE.Group(); // squash & stretch lives here
  root.add(wob);
  const hex = (COLORS[info.col] || COLORS[0]).hex;
  const bodyMat = glossy(hex);
  if (info.col === 11) {
    bodyMat.metalness = 0.75;
    bodyMat.roughness = 0.22;
  }
  const body = mesh(sphereGeo, bodyMat, [1, 0.92, 1], [0, 0, 0]);
  body.receiveShadow = false;
  wob.add(body);

  if (isMe) {
    // violet outline hull (the floor is pink, blue and yellow, so violet never blends in): only my creature has it, so I can find myself in a crowd
    const hull = mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: ME_COLOR, side: THREE.BackSide }), [1.12, 1.04, 1.12], [0, 0, 0]);
    hull.castShadow = false;
    hull.receiveShadow = false;
    wob.add(hull);
  }

  const face = new THREE.Group();
  wob.add(face);

  const eyeW = mat('#ffffff', { roughness: 0.2 });
  const pupilM = mat('#2a2438', { roughness: 0.2 });
  const eyes = [];
  const bulge = info.kind === 3;
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * (bulge ? 0.42 : 0.34), bulge ? 0.92 : 0.2, bulge ? 0.5 : 0.82);
    const sc = bulge ? 0.26 : 0.24;
    const w = mesh(sphereGeo, eyeW, [sc, sc * 1.15, sc * 0.6], [0, 0, 0]);
    const p = mesh(sphereGeo, pupilM, [sc * 0.52, sc * 0.62, sc * 0.3], [0, 0, sc * 0.45]);
    const shine = mesh(sphereGeo, eyeW, [sc * 0.16, sc * 0.16, sc * 0.1], [sc * 0.12, sc * 0.2, sc * 0.65]);
    e.add(w, p, shine);
    e.userData = { w, p, sc };
    face.add(e);
    eyes.push(e);
  }
  const mouth = mesh(sphereGeo, mat('#4a1f3a'), [0.2, 0.1, 0.1], [0, -0.12, 0.93]);
  mouth.castShadow = false;
  face.add(mouth);
  for (const s of [-1, 1]) {
    const cheek = mesh(sphereGeo, mat('#ff7a9c', { transparent: true, opacity: 0.55 }), [0.13, 0.09, 0.04], [s * 0.55, -0.05, 0.78]);
    cheek.castShadow = false;
    face.add(cheek);
  }
  addKindParts(face, info.kind, body, hex);

  const hatG = info.hat ? buildHat(info.hat) : null;
  if (hatG) {
    hatG.position.set(0, 0.86, -0.02);
    face.add(hatG);
  }

  // Cooldown ring on the ground
  const ringGeo = new THREE.RingGeometry(1.15, 1.38, 40, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 3;
  root.add(ring);
  const ringIdx = ringGeo.index.count;

  // Team / ownership disc
  const discMat = new THREE.MeshBasicMaterial({ color: TEAM_COLORS[0], transparent: true, opacity: 0.0, depthWrite: false });
  const discGeo = new THREE.CircleGeometry(1.3, 36);
  discGeo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 2;
  root.add(disc);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(info.name, info.lives ?? 0, '#fff'), depthWrite: false, transparent: true }));
  label.scale.set(270, 84, 1);
  if (isMe) {
    label.material.depthTest = false;
    label.renderOrder = 19;
  }
  root.add(label);

  const you = new THREE.Mesh(coneGeo, mat('#ffe14d', { emissive: '#ffcc00', emissiveIntensity: 0.8 }), [18, 34, 18]);
  you.geometry = coneGeo;
  you.scale.set(26, 48, 26);
  you.rotation.x = Math.PI;
  you.visible = isMe;
  you.castShadow = false;
  root.add(you);

  let halo = null;
  let youTag = null;
  if (isMe) {
    // violet ring with a white rim on each side: readable on pink, blue and yellow tiles alike
    halo = new THREE.Group();
    for (const [a, b, color] of [[1.42, 1.5, '#ffffff'], [1.5, 2.0, ME_COLOR], [2.0, 2.08, '#ffffff']]) {
      const g = new THREE.RingGeometry(a, b, 56, 1);
      g.rotateX(-Math.PI / 2);
      halo.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide })));
    }
    root.add(halo);
    youTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: youTexture(), depthWrite: false, depthTest: false, transparent: true }));
    youTag.renderOrder = 20;
    root.add(youTag);
  }

  const shield = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: '#8ee8ff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
  shield.visible = false;
  root.add(shield);

  return {
    root, wob, body, face, eyes, mouth, ring, ringIdx, ringGeo, disc, label, you, halo, youTag, shield, hatG,
    info, isMe,
    heading: info.angle || 0,
    wobble: 0,
    wobbleV: 0,
    blink: Math.random() * 3,
    lastHearts: info.lives ?? 0,
    lastLabelColor: '#fff',
    tmpScale: 1,
    fallSpin: 0,
    hurtT: 0,
  };
}

const lerpAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Per-frame update from a view puck. Returns nothing; mutates the mesh. */
export function updatePuck(o, v, dt, now, ctx) {
  const root = o.root;
  const speed = Math.hypot(v.vx, v.vy);
  const falling = v.state !== 'live';
  const showing = v.state !== 'out';
  root.visible = showing;
  if (!showing) return;

  // spring wobble (jelly) driven by impacts via o.wobbleV
  o.wobbleV += (-o.wobble * 180 - o.wobbleV * 9) * dt;
  o.wobble += o.wobbleV * dt;

  const targetHeading = speed > 40 ? Math.atan2(v.vx, v.vy) : v.angle !== undefined ? Math.PI / 2 - v.angle : o.heading;
  o.heading = lerpAngle(o.heading, targetHeading, Math.min(1, dt * 10));

  const r = v.r;
  const stretch = 1 + Math.min(0.38, speed / 2600) + o.wobble * 0.22;
  const squash = 1 / Math.sqrt(stretch);
  o.wob.rotation.y = o.heading;
  o.wob.scale.set(r * squash, r * (0.92 + (stretch - 1) * -0.25), r * stretch);

  const bob = falling ? 0 : Math.sin(now / 160 + v.id) * 1.5 * (speed < 60 ? 1 : 0);
  let y = r * 0.9 + 18 + bob;
  if (v.state === 'falling') {
    o.fallSpin += dt * 9;
    y -= v.fallT * v.fallT * 1500;
    root.rotation.z = Math.sin(o.fallSpin) * 0.6;
    root.rotation.x = o.fallSpin * 0.35;
    const s = Math.max(0.15, 1 - v.fallT * 0.55);
    o.wob.scale.multiplyScalar(s);
  } else {
    root.rotation.set(0, 0, 0);
    o.fallSpin = 0;
  }
  root.position.set(v.x, y, v.y);

  // expressions
  const charging = ctx.charging && v.id === ctx.meId;
  o.hurtT = Math.max(0, o.hurtT - dt);
  const dizzy = o.wobble > 0.25 || o.hurtT > 0;
  o.blink -= dt;
  const blinkNow = o.blink < 0.12 && o.blink > 0 && !dizzy;
  if (o.blink < 0) o.blink = 2 + Math.random() * 3;
  for (const e of o.eyes) {
    const { w, p, sc } = e.userData;
    const open = blinkNow ? 0.12 : v.state === 'falling' ? 1.5 : 1;
    w.scale.y = sc * 1.15 * open;
    p.visible = !blinkNow;
    const look = ctx.look;
    p.position.x = THREE.MathUtils.clamp(look.x, -1, 1) * sc * 0.28;
    p.position.y = THREE.MathUtils.clamp(look.y, -1, 1) * sc * 0.2;
    p.scale.setScalar(sc * (v.state === 'falling' ? 0.3 : dizzy ? 0.8 : charging ? 0.4 : 0.52));
    p.scale.z = sc * 0.3;
    e.rotation.z = charging ? (e.position.x > 0 ? -0.35 : 0.35) : 0;
  }
  const mouthOpen = v.state === 'falling' ? 2.8 : dizzy ? 2.0 : charging ? 0.5 : 1;
  o.mouth.scale.set(0.2 * (charging ? 1.4 : 1), 0.1 * mouthOpen, 0.1);

  if (o.hatG) {
    const prop = o.hatG.getObjectByName('prop');
    if (prop) prop.rotation.y += dt * (12 + speed / 40);
    const halo = o.hatG.getObjectByName('halo');
    if (halo) halo.position.y = 0.35 + Math.sin(now / 250) * 0.05;
    o.hatG.position.y = 0.86 + Math.max(0, (stretch - 1)) * -0.2;
  }

  // power-up visuals
  o.shield.visible = v.shield;
  if (v.shield) {
    o.shield.scale.setScalar(r * 1.35 * (1 + Math.sin(now / 120) * 0.03));
    o.shield.position.y = 0;
  }
  const bm = o.body.material;
  if (v.mega) {
    bm.emissive.set('#ffb000');
    bm.emissiveIntensity = 0.35 + Math.sin(now / 100) * 0.15;
  } else if (v.rocket) {
    bm.emissive.set('#ff4d2a');
    bm.emissiveIntensity = 0.5 + Math.sin(now / 70) * 0.3;
  } else bm.emissiveIntensity = 0;

  // ground helpers
  o.ring.position.set(0, 3 - y + 0, 0);
  o.disc.position.set(0, 2 - y, 0);
  o.ring.scale.setScalar(r * 1.05);
  o.disc.scale.setScalar(r * 1.0);
  const ready = v.cd <= 0 && v.state === 'live';
  const f = v.cdMax > 0 ? 1 - v.cd / v.cdMax : 1;
  o.ringGeo.setDrawRange(0, Math.max(6, Math.floor(o.ringIdx * Math.min(1, f))));
  o.ring.material.color.set(ready ? '#ffffff' : '#ffd0e8');
  o.ring.material.opacity = ready ? 0.55 + Math.sin(now / 140) * 0.2 : 0.45;
  o.ring.visible = v.state === 'live' && (o.isMe || ctx.showRings);
  o.disc.material.opacity = v.teamColor ? 0.35 : 0;
  if (v.teamColor) o.disc.material.color.set(v.teamColor);

  // name tag
  const hearts = v.lives;
  const lc = v.teamColor || '#ffffff';
  if (hearts !== o.lastHearts || lc !== o.lastLabelColor) {
    o.lastHearts = hearts;
    o.lastLabelColor = lc;
    o.label.material.map = labelTexture(o.info.name, Math.max(0, hearts), lc);
    o.label.material.needsUpdate = true;
  }
  o.label.position.set(0, r * 1.6 + 85 * ctx.ui, 0);
  o.label.scale.set(270 * ctx.ui, 84 * ctx.ui, 1);
  o.label.visible = v.state === 'live' && v.id !== 0;
  o.you.visible = false; // the YOU tag replaces the old arrow
  o.you.scale.set(26 * ctx.ui, 48 * ctx.ui, 26 * ctx.ui);
  o.you.position.set(0, r * 1.6 + 190 * ctx.ui + Math.sin(now / 200) * 12, 0);
  if (o.halo) {
    const pulse = 1 + Math.sin(now / 170) * 0.08;
    o.halo.visible = v.state === 'live';
    o.halo.position.set(0, 4 - y, 0);
    o.halo.scale.setScalar(r * 1.05 * pulse);
    o.youTag.visible = v.state === 'live';
    o.youTag.position.set(0, r * 1.6 + 215 * ctx.ui + Math.sin(now / 200) * 12, 0);
    o.youTag.scale.set(150 * ctx.ui, 64 * ctx.ui, 1);
  }
}

export function bumpPuck(o, strength) {
  o.wobbleV += strength * 9;
}
