#!/usr/bin/env node
/* ============================================================
   NEON WRECKAGE — render3d verification
   The sandbox has no GPU, so instead of eyeballing a screenshot this
   proves the two things that can actually be wrong:

   1. The scene graph: cars, arena, pillars and textures are built with the
      right shapes, colours and transforms.
   2. The projection: a point on the ground must land on EXACTLY the same
      screen pixel in the three.js camera as it does in the 2D canvas
      transform. That is what guarantees the 3D cars sit on top of their
      hitboxes (and that FX drawn in 2D still line up with them).

   It also writes /tmp/3d-proof.png: the real 2D frame with every car's
   projected 3D footprint drawn on top, so misalignment would be obvious.

   Run: node tools/render3d-test.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas, Image, loadImage } = require('@napi-rs/canvas');

const R = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-6 : eps);

/* ---------------- sandbox with real three.js ---------------- */
const mkCanvas = () => {
  const c = createCanvas(1, 1);
  return c;
};
const els = {};
const makeEl = (id) => ({
  id, style: {}, textContent: '', innerHTML: '', hidden: false,
  classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); return f; }, contains(c) { return this._s.has(c); } },
  addEventListener() {}, appendChild() {}, getAttribute: () => null, setAttribute() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  getContext() { return createCanvas(1, 1).getContext('2d'); }
});

const sandbox = {
  console, Math, JSON, Date, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
  Image,
  document: {
    getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
    createElement(tag) { return tag === 'canvas' ? createCanvas(1, 1) : makeEl('dyn'); },
    addEventListener() {}, body: makeEl('body')
  },
  localStorage: { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  THREE: undefined
};
sandbox.window = { addEventListener() {}, devicePixelRatio: 1, AudioContext: undefined, matchMedia: () => ({ matches: false }), innerWidth: 1280, innerHeight: 720 };
sandbox.navigator = { userAgent: 'node', maxTouchPoints: 0 };
sandbox.innerWidth = 1280;
sandbox.innerHeight = 720;
sandbox.devicePixelRatio = 1;
sandbox.matchMedia = () => ({ matches: false, addEventListener() {} });
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* three.js UMD needs a window/self it can hang globals off */
vm.runInContext(fs.readFileSync(path.join(R, 'vendor/three.min.js'), 'utf8'), sandbox, { filename: 'three.min.js' });
const THREE = sandbox.THREE || vm.runInContext('THREE', sandbox);
ok('three.js loads and exposes a usable API', !!THREE && typeof THREE.Scene === 'function' && typeof THREE.WebGLRenderer === 'function', THREE && THREE.REVISION);

/* game globals the renderer reads */
vm.runInContext(fs.readFileSync(path.join(R, 'js/core.js'), 'utf8'), sandbox, { filename: 'core.js' });
vm.runInContext(fs.readFileSync(path.join(R, 'js/render3d.js'), 'utf8'), sandbox, { filename: 'render3d.js' });
const Render3D = vm.runInContext('Render3D', sandbox);
ok('render3d.js loads', !!Render3D);

/* ---------------- capability detection ---------------- */
ok('available() is false without a WebGL context', Render3D.available() === false);
ok('active() stays false when there is no renderer', Render3D.active() === false);

/* ---------------- build the scene headlessly ---------------- */
Render3D._buildScene();
ok('scene builds with camera + sun', !!Render3D.scene && !!Render3D.camera && !!Render3D.sun);
ok('scene has ambient + hemisphere + sun + rim light', Render3D.scene.children.filter(o => o.isLight).length === 4,
  Render3D.scene.children.filter(o => o.isLight).length);
ok('camera is a straight-down perspective camera', near(Render3D.camera.up.z, -1) && near(Render3D.camera.up.y, 0),
  JSON.stringify(Render3D.camera.up));

/* ---------------- car mesh ---------------- */
const car = Render3D._carGroup({ len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff' });
ok('car group is built', !!car && car.children.length >= 10, car && car.children.length);
const chassis = car.children.find(o => o.geometry && o.geometry.attributes && o.geometry.attributes.position &&
  o.material && o.material.color && o.castShadow);
ok('car has a shadow-casting chassis', !!chassis);
ok('chassis is tapered (nose narrower than tail)', (function () {
  const pos = chassis.geometry.attributes.position;
  let tailW = 0, noseW = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = Math.abs(pos.getZ(i));
    if (x < -1) tailW = Math.max(tailW, z);
    if (x > 1) noseW = Math.max(noseW, z);
  }
  return noseW < tailW;
})());
ok('car has 4 wheels', car.children.filter(o => o.geometry && o.geometry.type === 'CylinderGeometry').length === 4,
  car.children.filter(o => o.geometry && o.geometry.type === 'CylinderGeometry').length);
ok('car has an additive underglow pool', car.children.some(o => o.material && o.material.blending === THREE.AdditiveBlending));
ok('glow textures are cached per colour', (function () {
  const a = Render3D._glowTexture('#35f0ff'), b = Render3D._glowTexture('#35f0ff'), c = Render3D._glowTexture('#ff3d81');
  return a === b && a !== c;
})());

/* ---------------- arena ---------------- */
const fakeGame = {
  decals: { canvas: createCanvas(256, 256) },
  pillars: [{ x: 400, y: 400, r: 40 }, { x: 900, y: 1200, r: 55 }]
};
Render3D.buildWorld(fakeGame);
ok('arena builds a group', !!Render3D.world && !!Render3D.world.group);
const meshes = Render3D.world.group.children;
ok('arena has a floor plane', meshes.some(o => o.geometry && o.geometry.type === 'PlaneGeometry' && o.receiveShadow));
ok('arena has 4 walls', meshes.filter(o => o.geometry && o.geometry.type === 'BoxGeometry' && o.material && o.material.type === 'MeshStandardMaterial').length === 4);
ok('arena has neon wall caps', meshes.filter(o => o.material && o.material.type === 'MeshBasicMaterial' && o.geometry.type === 'BoxGeometry').length === 4);
ok('each pillar becomes a body + cap', meshes.filter(o => o.type === 'Group').length === 2);
ok('decals become a canvas texture on the deck', !!Render3D._decalTex && Render3D._decalTex.isTexture === true);

/* ---------------- regression: the three bugs that made it black ---------------- */
console.log('\n--- black-screen regressions ---');

/* BUG 1: canvas#game paints an opaque CSS background straight over #gl. */
(() => {
  const css = fs.readFileSync(path.join(R, 'css/style.css'), 'utf8');
  const gameHasBg = /canvas#game\s*\{[^}]*background:\s*var\(--ink\)/.test(css);
  const neutralised = /body\.has3d\s+canvas#game\s*\{[^}]*background:\s*transparent/.test(css);
  ok('canvas#game still opts into an opaque background', gameHasBg);
  ok('that background is neutralised while 3D is live', neutralised);
  ok('#gl sits BEHIND #game in the stacking order', (function () {
    const gl = Number((/#gl\s*\{[^}]*z-index:\s*(-?\d+)/.exec(css) || [])[1]);
    const gm = Number((/#game\s*\{\s*z-index:\s*(-?\d+)/.exec(css) || [])[1]);
    return isFinite(gl) && isFinite(gm) && gl < gm;
  })());
})();

/* BUG 2: a metal with nothing to reflect renders black. */
ok('the scene has an environment map', !!Render3D.scene.environment);
ok('the environment map is equirectangular', Render3D.scene.environment.mapping === THREE.EquirectangularReflectionMapping);
ok('no lit material is dangerously metallic without reflections', (function () {
  let worstMetal = 0, count = 0;
  const check = (mat) => {
    if (!mat || !mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
    count++;
    worstMetal = Math.max(worstMetal, mat.metalness || 0);
  };
  Render3D.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(check); });
  const car = Render3D._carGroup({ len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff' });
  car.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(check); });
  return count >= 6 && worstMetal <= 0.6;
})());
ok('car bodies self-illuminate a little (never pure shadow)', (function () {
  const car = Render3D._carGroup({ len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff' });
  const body = car.children.find((o) => o.material && o.material.emissive && o.material.emissiveIntensity > 0);
  return !!body && body.material.emissiveIntensity > 0.05;
})());
ok('the deck texture emits its own grid lines', (function () {
  const floor = Render3D.world.group.children.find((o) => o.geometry && o.geometry.type === 'PlaneGeometry');
  return !!floor && !!floor.material.emissiveMap && floor.material.emissiveIntensity > 0.2;
})());

/* BUG 3: fog measured from a camera that sits ~1.4x the screen height up. */
ok('fog never swallows the deck', (function () {
  const VW = 1280, VH = 720;
  Render3D._vw = VW; Render3D._vh = VH;
  return [0.62, 0.8, 1.05].every((zoom) => {
    Render3D._applyCamera({ cam: { x: 1280, y: 1280, zoom } });
    const H = Render3D.camera.position.y;             // camera -> ground distance
    const f = Render3D.scene.fog;
    return f && f.near > H * 1.15;
  });
})());

/* the player's own car must actually land inside the frustum */
ok('a car under the camera lands inside the frustum and passes depth', (function () {
  const VW = 1280, VH = 720, z = 0.9;
  Render3D._vw = VW; Render3D._vh = VH;
  Render3D._applyCamera({ cam: { x: 1280, y: 1280, zoom: z } });
  const v = new THREE.Vector3(1280, 8, 1280);   // body height of a car at the focus point
  v.project(Render3D.camera);
  return Math.abs(v.x) < 0.02 && Math.abs(v.y) < 0.05 && v.z > -1 && v.z < 1;
})());

/* toggling 3D must set the body class that drops the opaque background */
ok('setEnabled toggles the has3d body class', (function () {
  Render3D.ready = true;
  Render3D.setEnabled(true, null);
  const on = sandbox.document.body.classList.contains('has3d');
  Render3D.setEnabled(false, null);
  const off = sandbox.document.body.classList.contains('has3d');
  Render3D.enabled = false;
  return on === true && off === false;
})());

/* ---------------- layering is enforced inline, not by CSS ---------------- */
console.log('\n--- inline layering (immune to a stale stylesheet) ---');
(() => {
  const glEl = sandbox.document.getElementById('gl');
  const gameEl = sandbox.document.getElementById('game');
  Render3D.canvas = glEl;
  Render3D.ready = true;

  Render3D.setEnabled(true, null);
  ok('3D on: #gl is positioned and visible inline', glEl.style.display === 'block' && glEl.style.zIndex === '0' && glEl.style.width === '100%');
  ok('3D on: #game background is cleared inline', gameEl.style.background === 'transparent');
  ok('3D on: body.has3d is set too (belt and braces)', sandbox.document.body.classList.contains('has3d'));

  Render3D.setEnabled(false, null);
  ok('3D off: #gl is hidden inline', glEl.style.display === 'none');
  ok('3D off: #game keeps its own background', gameEl.style.background === '');
  ok('3D off: body.has3d is removed', !sandbox.document.body.classList.contains('has3d'));
})();

/* ---------------- it gives up on itself instead of showing a black screen --- */
console.log('\n--- dead-frame self check ---');
(() => {
  Render3D.ready = true;
  Render3D.enabled = true;
  Render3D.renderer = { info: { render: { triangles: 0 } } };
  for (let i = 0; i < 50; i++) Render3D._selfCheck();
  ok('a layer that submits no geometry falls back to 2D', Render3D.enabled === false && Render3D.ready === true);

  Render3D.enabled = true;
  Render3D.renderer = { info: { render: { triangles: 1200 } } };
  Render3D._deadFrames = 40;
  Render3D._selfCheck();
  ok('a layer that draws geometry is left alone', Render3D.enabled === true && Render3D._deadFrames === 0);
  Render3D.renderer = null;
})();

/* -------- a dead WebGL context must fall back, never fake a render -------- */
console.log('\n--- lost context ---');
(() => {
  Render3D.ready = true;
  Render3D.enabled = true;

  /* three.js returns silently from render() when the context is gone, so the
     only symptom is "0 triangles and a black screen". Detect the cause. */
  Render3D.renderer = {
    getContext: () => ({ isContextLost: () => true }),
    info: { render: { triangles: 0 } }
  };
  Render3D._selfCheck();
  ok('a lost context disables the layer on the first frame', Render3D.enabled === false && Render3D._contextLost === true);

  /* and the 2D canvas gets its own background back */
  Render3D.ready = true;
  Render3D._contextLost = false;
  Render3D.renderer = { getContext: () => ({ isContextLost: () => false }), info: { render: { triangles: 0 } } };
  Render3D.enabled = true;
  Render3D.setEnabled(true, null);
  const cleared = sandbox.document.getElementById('game').style.background === 'transparent';
  for (let i = 0; i < 25; i++) Render3D._selfCheck();
  const restored = sandbox.document.getElementById('game').style.background === '';
  ok('a live context that draws nothing recovers within ~0.3s', Render3D.enabled === false && cleared && restored);

  /* a healthy layer is never touched */
  Render3D.enabled = true;
  Render3D.ready = true;
  Render3D.renderer = { getContext: () => ({ isContextLost: () => false }), info: { render: { triangles: 2400 } } };
  for (let i = 0; i < 60; i++) Render3D._selfCheck();
  ok('a healthy layer keeps running', Render3D.enabled === true && Render3D._lastTris === 2400);
  Render3D.renderer = null;
  Render3D.enabled = false;
})();

/* ---------------- the player marker ---------------- */
(() => {
  const p = { x: 700, y: 900, dead: false, angle: 0 };
  Render3D._applyPlayerRing({ player: p });
  ok('a player ring is created and placed on the deck', !!Render3D._ring && Render3D._ring.position.x === 700 && Math.abs(Render3D._ring.position.z - 900) < 1e-6);
  ok('the ring is unlit (independent of the lighting setup)', Render3D._ring.material.type === 'MeshBasicMaterial');
  Render3D._applyPlayerRing({ player: { x: 0, y: 0, dead: true } });
  ok('the ring hides when the player dies', Render3D._ring.visible === false);
})();

/* ---------------- camera projection = the critical property ---------------- */
const VW = 1280, VH = 720;
Render3D._vw = VW; Render3D._vh = VH;

function projectGround(wx, wy, camX, camY, zoom) {
  Render3D._applyCamera({ cam: { x: camX, y: camY, zoom } });
  const v = new THREE.Vector3(wx, 0, wy);
  v.project(Render3D.camera);
  return { x: (v.x * 0.5 + 0.5) * VW, y: (0.5 - v.y * 0.5) * VH };
}
/* exactly what the 2D canvas transform does */
function project2D(wx, wy, camX, camY, zoom) {
  return { x: (wx - camX) * zoom + VW / 2, y: (wy - camY) * zoom + VH / 2 };
}

let worst = 0;
const cases = [
  [1280, 1280, 1280, 1280, 1.0],
  [1500, 1100, 1280, 1280, 0.85],
  [200, 2400, 900, 1500, 0.62],
  [2500, 100, 1280, 1280, 1.05],
  [1280, 1280, 1280, 1280, 0.5]
];
for (const [wx, wy, cx, cy, z] of cases) {
  const a = projectGround(wx, wy, cx, cy, z);
  const b = project2D(wx, wy, cx, cy, z);
  worst = Math.max(worst, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
ok('3D ground projection matches the 2D transform exactly', worst < 0.01, 'worst error ' + worst.toFixed(6) + ' px');

/* raised geometry must gain perspective (that is the whole point of 3D) */
(() => {
  const onGround = projectGround(1280 + 300, 1280, 1280, 1280, 1);
  Render3D._applyCamera({ cam: { x: 1280, y: 1280, zoom: 1 } });
  const high = new THREE.Vector3(1280 + 300, 60, 1280);
  high.project(Render3D.camera);
  const hx = (high.x * 0.5 + 0.5) * VW;
  ok('raised geometry shifts outward (perspective is real)', hx > onGround.x + 1, (hx - onGround.x).toFixed(2) + ' px');
})();

/* ---------------- entity sync ---------------- */
const ent = { x: 640, y: 480, angle: Math.PI / 3, dead: false, turret: Math.PI / 3, team: 'player' };
Render3D._allCars = [];
Render3D._seen = [];
const g1 = Render3D._syncCar(ent, { len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff' });
ok('car mesh sits on the entity, on the ground plane', near(g1.position.x, 640) && near(g1.position.z, 480) && near(g1.position.y, 0));
ok('2D angle maps to a -Y rotation', near(g1.rotation.y, -Math.PI / 3));
ok('the same entity reuses one mesh', Render3D._syncCar(ent, { len: 46, wid: 26, body: '#25c9e8', glow: '#35f0ff' }) === g1);
ok('dead entities hide their mesh', (function () { const e = { x: 0, y: 0, angle: 0, dead: true }; const g = Render3D._syncCar(e, { len: 40, wid: 24 }); return g.visible === false; })());

/* a full render pass must not throw without a GPU */
Render3D._vw = VW; Render3D._vh = VH;
let renderErr = null;
try {
  Render3D.renderer = null;   // active() stays false, so render() returns early
  Render3D.render({ cam: { x: 0, y: 0, zoom: 1 }, enemies: [], pillars: [] });
} catch (e) { renderErr = e; }
ok('render() is a safe no-op without a renderer', renderErr === null && Render3D.active() === false);

/* ---------------- visual proof ---------------- */
(async () => {
  const game = await loadRealGame();
  const c = createCanvas(1280, 720);
  const ctx = c.getContext('2d');
  /* the real 2D renderer output */
  const img = await loadImage(game.framePng);
  ctx.drawImage(img, 0, 0, 1280, 720);

  /* overlay: project every entity through the actual three.js camera */
  let overlaid = 0;
  for (const e of game.entities) {
    const p = projectGround(e.x, e.y, game.cam.x, game.cam.y, game.cam.zoom);
    const q = project2D(e.x, e.y, game.cam.x, game.cam.y, game.cam.zoom);
    ctx.strokeStyle = e.isPlayer ? '#35f0ff' : '#ff3d81';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, e.r * game.cam.zoom, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y);
    ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
    if (Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) overlaid++;
  }
  fs.writeFileSync('/tmp/3d-proof.png', c.encodeSync('png'));
  ok('every live entity projects onto its 2D position (visual proof)', overlaid === game.entities.length,
    overlaid + '/' + game.entities.length);

  console.log('\n----------------------------------------');
  console.log('PASSED: ' + pass + '   FAILED: ' + fail);
  console.log('wrote /tmp/3d-proof.png');
  if (fail) process.exit(1);
  console.log('RENDER3D VERIFICATION OK');
})().catch(e => { console.error(e); process.exit(1); });

/* ---------------- boot the real 2D game for the proof image ---------------- */
async function loadRealGame() {
  const sb = Object.assign({}, sandbox);
  const sb2 = {
    console, Math, JSON, Date, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
    Image,
    document: {
      getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
      createElement(t) { return t === 'canvas' ? createCanvas(1, 1) : makeEl('dyn'); },
      addEventListener() {}, body: makeEl('body')
    },
    localStorage: { _m: {}, getItem() { return null; }, setItem() {}, removeItem() {} },
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    navigator: { userAgent: 'node' },
    Audio: function () { return { play() {}, pause() {} }; },
    THREE: undefined
  };
  sb2.addEventListener = () => {};
  sb2.removeEventListener = () => {};
  sb2.window = sb2;
  sb2.self = sb2;
  sb2.globalThis = sb2;
  vm.createContext(sb2);

  const canvasEl = Object.assign(makeEl('game'), { width: 1280, height: 720 });
  const realCanvas = createCanvas(1280, 720);
  canvasEl.getContext = () => realCanvas.getContext('2d');
  els['game'] = canvasEl;

  ['js/core.js', 'js/input.js', 'js/audio.js', 'js/fx.js', 'js/platform.js', 'js/achievements.js', 'js/game.js'].forEach((f) => {
    try { vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), sb2, { filename: f }); } catch (e) { /* optional modules */ }
  });
  vm.runInContext('Game.init()', sb2);
  vm.runInContext("Game.startRun()", sb2);
  for (let i = 0; i < 420; i++) {
    vm.runInContext('Game.update(0.016)', sb2);
    if (i % 8 === 0) vm.runInContext('Game.render()', sb2);
  }
  vm.runInContext('Game.render()', sb2);

  const entities = vm.runInContext(
    'Game.enemies.map(function(e){return {x:e.x,y:e.y,r:e.r,isPlayer:false};}).concat([{x:Game.player.x,y:Game.player.y,r:Game.player.r,isPlayer:true}])',
    sb2);
  const cam = vm.runInContext('({x:Game.cam.x,y:Game.cam.y,zoom:Game.cam.zoom})', sb2);
  return { framePng: realCanvas.toBuffer('image/png'), entities, cam };
}
