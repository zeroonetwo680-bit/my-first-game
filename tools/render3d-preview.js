#!/usr/bin/env node
/* ============================================================
   NEON WRECKAGE — offline scene preview
   The sandbox has no GPU, so this walks the REAL three.js scene graph
   (same meshes, same materials, same camera that the game uses) and
   rasterises it in software: triangles are projected through the actual
   camera and flat-shaded with the scene's own lights.

   It is not a pixel-exact WebGL screenshot — there is no shadows or
   reflections here — but it answers the only question that matters when
   a player reports "everything is black": are the cars there, at the
   right places, with the right colours and the right lighting response?

   Run: node tools/render3d-preview.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas, Image } = require('@napi-rs/canvas');

const R = path.join(__dirname, '..');
const VW = 1280, VH = 720;

/* ---------------- sandbox ---------------- */
const makeEl = (id) => ({
  id, style: {},
  classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); return f; }, contains(c) { return this._s.has(c); } },
  addEventListener() {}, appendChild() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: VW, height: VH })
});

const sandbox = {
  console, Math, JSON, Date, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
  Image,
  document: {
    getElementById: () => makeEl('x'),
    createElement: (t) => (t === 'canvas' ? createCanvas(1, 1) : makeEl('dyn')),
    addEventListener() {}, body: makeEl('body')
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  innerWidth: VW, innerHeight: VH, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {}, removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(R, 'vendor/three.min.js'), 'utf8'), sandbox, { filename: 'three.min.js' });
const THREE = sandbox.THREE;
vm.runInContext(fs.readFileSync(path.join(R, 'js/core.js'), 'utf8'), sandbox, { filename: 'core.js' });
vm.runInContext(fs.readFileSync(path.join(R, 'js/render3d.js'), 'utf8'), sandbox, { filename: 'render3d.js' });
const Render3D = vm.runInContext('Render3D', sandbox);

/* ---------------- build the same scene the game builds ---------------- */
Render3D._buildScene();
Render3D._vw = VW; Render3D._vh = VH;

const WORLD_W = 2560;
const pillars = [
  { x: 300, y: 300, r: 46 }, { x: 2200, y: 420, r: 46 },
  { x: 520, y: 1500, r: 52 }, { x: 1850, y: 1950, r: 46 },
  { x: 1280, y: 1280, r: 40 }
];
Render3D.buildWorld({ decals: null, pillars });

/* a plausible fight: player in the middle, enemies closing in */
const cars = [
  { x: 1280, y: 1280, angle: 0, spec: { len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff' } },
  { x: 1280 + 190, y: 1280 - 150, angle: 2.4, spec: { len: 45, wid: 26, body: '#e0246e', glow: '#ff3d81' } },
  { x: 1280 - 220, y: 1280 + 120, angle: 0.9, spec: { len: 45, wid: 26, body: '#e07f22', glow: '#ff9a3d' } },
  { x: 1280 - 120, y: 1280 - 260, angle: 3.0, spec: { len: 47, wid: 27, body: '#1dbb6a', glow: '#58ff9b' } },
  { x: 1280 + 260, y: 1280 + 210, angle: 1.7, spec: { len: 70, wid: 40, body: '#8a3fd4', glow: '#b06cff', heavy: true } }
];
for (const c of cars) {
  const g = Render3D._carGroup(c.spec);
  g.position.set(c.x, 0, c.y);
  g.rotation.y = -c.angle;
  Render3D.scene.add(g);
}

/* ---------------- camera exactly as the game sets it ---------------- */
const camX = 1280, camY = 1280, zoom = 0.86;
Render3D._applyCamera({ cam: { x: camX, y: camY, zoom } });
const camera = Render3D.camera;
const H = camera.position.y;

/* ---------------- lighting model (matches the scene's lights) ---------------- */
const sunDir = new THREE.Vector3().subVectors(Render3D.sun.position, Render3D.sun.target.position).normalize();
const sunCol = new THREE.Color(0xeaf2ff).multiplyScalar(2.4);
const ambCol = new THREE.Color(0xbcd6ff).multiplyScalar(1.55 * 0.42);
const hemiCol = new THREE.Color(0x6ff4ff).multiplyScalar(1.25 * 0.25);
const rimDir = new THREE.Vector3(-800, 700, -900).normalize();
const rimCol = new THREE.Color(0xff3d81).multiplyScalar(1.1 * 0.35);
const envCol = new THREE.Color(0x2a4a7a).multiplyScalar(0.55);   // env-map lift

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const to255 = (v) => Math.round(clamp01(Math.pow(v, 0.85)) * 255);

function shade(mat, n) {
  let base = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);

  /* MeshBasicMaterial ignores lights in three.js — it IS its colour.
     Emissive accents (neon strips, roof plates, wall edges) must be drawn
     unlit here too or the preview would understate them. */
  if (mat.isMeshBasicMaterial) {
    const tm0 = (v) => v / (1 + v);
    return 'rgb(' + Math.round(clamp01(Math.pow(tm0(base.r), 0.85)) * 255) + ',' +
      Math.round(clamp01(Math.pow(tm0(base.g), 0.85)) * 255) + ',' +
      Math.round(clamp01(Math.pow(tm0(base.b), 0.85)) * 255) + ')';
  }
  if (mat.map) base.multiply(new THREE.Color(0x2b3a55));   // the deck texture is dark
  const metal = mat.metalness === undefined ? 0 : mat.metalness;
  const rough = mat.roughness === undefined ? 0.8 : mat.roughness;

  const dSun = Math.max(0, n.dot(sunDir));
  const dRim = Math.max(0, n.dot(rimDir));

  // diffuse: darkens as metalness rises (metals have almost no diffuse term)
  const diff = (1 - metal * 0.85);
  let r = base.r * (ambCol.r + hemiCol.r + sunCol.r * dSun * diff + rimCol.r * dRim * diff);
  let g = base.g * (ambCol.g + hemiCol.g + sunCol.g * dSun * diff + rimCol.g * dRim * diff);
  let b = base.b * (ambCol.b + hemiCol.b + sunCol.b * dSun * diff + rimCol.b * dRim * diff);

  // specular-ish lift from the environment (this is what saves the metals)
  const spec = (1 - rough) * (0.35 + 0.65 * Math.pow(Math.max(0, n.y), 2)) * (0.25 + metal * 1.1);
  r += envCol.r * spec * 1.15;
  g += envCol.g * spec * 1.35;
  b += envCol.b * spec * 1.55;

  // emissive
  if (mat.emissive && mat.emissiveIntensity) {
    const e = mat.emissiveIntensity * (mat.emissiveMap ? 0.55 : 1);
    r += mat.emissive.r * e; g += mat.emissive.g * e; b += mat.emissive.b * e;
  }
  // Reinhard tone map, like the real renderer's ACES pass (kinder to highlights)
  const tm = (v) => v / (1 + v);
  return 'rgb(' + to255(tm(r)) + ',' + to255(tm(g)) + ',' + to255(tm(b)) + ')';
}

/* ---------------- projection helper ---------------- */
function project(p) {
  const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * VW, y: (0.5 - v.y * 0.5) * VH, z: v.z, ok: v.z > -1 && v.z < 1 };
}

/* ---------------- collect triangles ---------------- */
const tris = [];
const m = new THREE.Matrix4();
const nm = new THREE.Matrix3();

Render3D.scene.updateMatrixWorld(true);

Render3D.scene.traverse((obj) => {
  if (!obj.isMesh || !obj.geometry) return;
  const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
  if (!mat) return;
  if (mat.transparent && mat.map) return;          // glow pools / decals: skip
  if (obj.material && obj.material.map && obj.geometry.type === 'PlaneGeometry' && obj.position.y < 1 && obj.type === 'Mesh' && mat.transparent) return;

  m.copy(obj.matrixWorld);
  nm.getNormalMatrix(m);

  const pos = obj.geometry.attributes.position;
  const idx = obj.geometry.index;
  const count = idx ? idx.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

  for (let i = 0; i < count; i += 3) {
    const i0 = idx ? idx.getX(i) : i;
    const i1 = idx ? idx.getX(i + 1) : i + 1;
    const i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(m);
    b.fromBufferAttribute(pos, i1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i2).applyMatrix4(m);

    const pa = project(a), pb = project(b), pc = project(c);
    if (!pa.ok && !pb.ok && !pc.ok) continue;

    // face normal in world space
    const e1 = new THREE.Vector3().subVectors(b, a);
    const e2 = new THREE.Vector3().subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (n.y < 0) n.negate();                        // light both sides of thin slabs

    const depth = a.distanceTo(camera.position);
    tris.push({ pa, pb, pc, colour: shade(mat, n), depth, height: (a.y + b.y + c.y) / 3 });
  }
});

/* painter's algorithm: farther first, lower first within the same slab */
tris.sort((p, q) => (q.depth - p.depth));

/* ---------------- draw ---------------- */
const out = createCanvas(VW, VH);
const ctx = out.getContext('2d');
ctx.fillStyle = '#04060f';
ctx.fillRect(0, 0, VW, VH);

for (const t of tris) {
  ctx.beginPath();
  ctx.moveTo(t.pa.x, t.pa.y);
  ctx.lineTo(t.pb.x, t.pb.y);
  ctx.lineTo(t.pc.x, t.pc.y);
  ctx.closePath();
  ctx.fillStyle = t.colour;
  ctx.fill();
}

/* the deck grid, drawn with the uniform ground mapping (same as the texture) */
const s = zoom;                                   // px per world unit for y = 0
const gx = (wx) => (wx - camX) * s + VW / 2;
const gy = (wy) => (wy - camY) * s + VH / 2;
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const tile = 128;                                 // texture repeats every 512/4 world units
for (let wx = 0; wx <= WORLD_W; wx += tile) {
  const major = wx % 1024 === 0;
  ctx.strokeStyle = major ? 'rgba(255,80,140,0.30)' : 'rgba(70,245,255,0.20)';
  ctx.lineWidth = major ? 2 : 1;
  ctx.beginPath(); ctx.moveTo(gx(wx), 0); ctx.lineTo(gx(wx), VH); ctx.stroke();
}
for (let wy = 0; wy <= WORLD_W; wy += tile) {
  const major = wy % 1024 === 0;
  ctx.strokeStyle = major ? 'rgba(255,80,140,0.30)' : 'rgba(70,245,255,0.20)';
  ctx.lineWidth = major ? 2 : 1;
  ctx.beginPath(); ctx.moveTo(0, gy(wy)); ctx.lineTo(VW, gy(wy)); ctx.stroke();
}
ctx.restore();

/* label the frame so the image is self-explaining */
ctx.fillStyle = 'rgba(4,6,15,0.72)';
ctx.fillRect(0, 0, 430, 52);
ctx.fillStyle = '#7ef6ff';
ctx.font = 'bold 15px monospace';
ctx.fillText('NEON WRECKAGE — 3D scene, software preview', 12, 22);
ctx.fillStyle = '#9aa8c4';
ctx.font = '12px monospace';
ctx.fillText('camera H=' + H.toFixed(0) + '  zoom=' + zoom + '  triangles=' + tris.length +
  '  fog.near=' + (Render3D.scene.fog.near | 0), 12, 41);

fs.writeFileSync('/tmp/3d-scene.png', out.encodeSync('png'));
console.log('wrote /tmp/3d-scene.png');
console.log('triangles: ' + tris.length + '   camera height: ' + H.toFixed(0) +
  '   fog.near: ' + (Render3D.scene.fog.near | 0) + '   metal max: ' +
  Math.max.apply(null, tris.map(() => 0)));
