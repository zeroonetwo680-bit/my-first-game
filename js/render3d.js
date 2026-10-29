'use strict';
/* ============================================================
   NEON WRECKAGE — render3d.js
   Optional WebGL (three.js) presentation layer.

   Design contract
   ---------------
   * The 2D game keeps ALL simulation, collision, AI, scoring and HUD. This
     file only decides how the world LOOKS, so gameplay and the headless test
     suite are unaffected.
   * The 3D canvas sits BEHIND the 2D canvas. The 2D renderer clears to
     transparent and skips the ground/cars it no longer needs to draw, while
     keeping FX, bullets, tracers, health bars and the DOM HUD on top.
   * The camera is a perspective camera looking STRAIGHT DOWN. Every point on
     the ground plane is then at the same distance, so ground positions project
     with a perfectly uniform scale — identical to the 2D transform. Raised
     geometry (cars, walls, pillars) still gets real perspective, which is what
     makes it read as 3D without ever desynchronising from the hitboxes.
   * Without WebGL, without three.js (e.g. the Node test sandbox) or when the
     player turns it off, everything degrades to the original 2D renderer.
   ============================================================ */

const Render3D = {
  /* state */
  supported: null,        // null = not probed yet
  enabled: false,         // user/intent flag (persisted)
  ready: false,           // renderer actually running
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  sun: null,
  world: null,            // { floor, walls, pillars, decal }
  mode: 'game',           // 'game' | 'showcase'

  /* tunables */
  cfg: {
    fov: 38,
    dprCap: 1.5,
    wallH: 96,
    carH: 9.5,
    shadowSize: 1024,
    fogNear: 1100,
    fogFar: 2600
  },

  _meshes: null,          // WeakMap entity -> group
  _seen: [],
  _allCars: [],
  _force: false,          // test seam: pretend a renderer exists
  _deadFrames: 0,
  _lastTris: 0,
  _lastMeshes: 0,
  _contextLost: false,
  _ring: null,
  _t: 0,
  _dpr: 1,

  /* ---------------- capability ---------------- */

  /* THREE available AND a WebGL context can be created */
  available() {
    if (this.supported !== null) return this.supported;
    this.supported = false;
    try {
      if (typeof THREE === 'undefined' || !THREE.WebGLRenderer) return this.supported;
      if (typeof document === 'undefined' || !document.createElement) return this.supported;
      const c = document.createElement('canvas');
      const gl = c.getContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
      if (!gl) return this.supported;
      this.supported = true;
    } catch (e) { this.supported = false; }
    return this.supported;
  },

  /* true when the 3D layer is the one drawing the world this frame */
  active() {
    if (this._force) return true;
    return !!(this.enabled && this.ready && this.renderer);
  },

  /* ---------------- setup ---------------- */

  /* One canvas, by construction.
     three.js draws into its OWN offscreen canvas and the game composites that
     image into the game canvas with drawImage(). There is no second canvas in
     the DOM, so there is no z-index, no CSS background and no stacking order
     that can hide the 3D view. This replaces the dual-canvas arrangement that
     produced a black screen three times in a row. */
  init() {
    if (this.ready || !this.available()) return false;
    try {
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, this.cfg.dprCap);
      this._dpr = dpr;

      const glCanvas = document.createElement('canvas');
      glCanvas.width = 2; glCanvas.height = 2;      // real size comes from resize()
      this.canvas = glCanvas;

      /* Listen for context loss BEFORE the context exists: a GPU can lose it
         the instant it is created. */
      const onLost = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this._contextLost = true;
        this.ready = false;
        this.enabled = false;
        try {
          if (document.body && document.body.classList) document.body.classList.remove('has3d');
          if (typeof sync3dButton === 'function') sync3dButton();
        } catch (err) {}
        try { console.warn('[Render3D] WebGL context lost - using the 2D renderer'); } catch (err) {}
      };
      if (glCanvas.addEventListener) glCanvas.addEventListener('webglcontextlost', onLost, false);

      const renderer = new THREE.WebGLRenderer({
        canvas: glCanvas,
        antialias: true,
        alpha: false,
        // the image is copied into a 2D canvas every frame, so the drawing
        // buffer must still be readable after the render call returns
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false
      });
      renderer.setPixelRatio(dpr);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      const ctx0 = renderer.getContext && renderer.getContext();
      if (!ctx0 || (ctx0.isContextLost && ctx0.isContextLost())) {
        try { console.warn('[Render3D] the WebGL context was lost at creation'); } catch (err) {}
        this._contextLost = true;
        this.ready = false; this.enabled = false;
        return false;
      }

      this.renderer = renderer;
      this._buildScene();
      if (this.scene && this.renderer) {
        this.sun.shadow.mapSize.set(this.cfg.shadowSize, this.cfg.shadowSize);
      }
      return true;
    } catch (e) {
      try { console.warn('[Render3D] init failed: ' + (e && e.message)); } catch (err) {}
      this.ready = false;
      this.supported = false;
      return false;
    }
  },

  /* Copy the rendered 3D frame into the game canvas. Called right after
     render(), in the same animation frame, so the drawing buffer is valid. */
  composite(ctx, vw, vh) {
    if (!this.active() || !this.renderer) return false;
    const src = this.renderer.domElement;
    if (!src || !src.width || !src.height) return false;
    try {
      ctx.drawImage(src, 0, 0, vw, vh);
      this._composited = (this._composited || 0) + 1;
      return true;
    } catch (e) {
      try { console.warn('[Render3D] composite failed: ' + (e && e.message)); } catch (err) {}
      return false;
    }
  },

  /* Scene graph + camera + lights. Kept separate from init() so the world
     builders can be exercised headlessly (no WebGL) by the test suite. */
  _buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060f);
    scene.fog = new THREE.Fog(0x04060f, this.cfg.fogNear, this.cfg.fogFar);

    const camera = new THREE.PerspectiveCamera(this.cfg.fov, 1, 1, 12000);
    camera.up.set(0, 0, -1);                         // world +Z => screen down

    scene.add(new THREE.AmbientLight(0xbcd6ff, 1.55));
    scene.add(new THREE.HemisphereLight(0x6ff4ff, 0x2a1436, 1.25));

    const sun = new THREE.DirectionalLight(0xeaf2ff, 2.4);
    sun.castShadow = true;
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 3600;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);

    /* magenta rim light from the opposite side for the neon feel */
    const rim = new THREE.DirectionalLight(0xff3d81, 0.85);
    rim.position.set(-800, 700, -900);
    rim.intensity = 1.1;
    scene.add(rim);

    /* An environment map is MANDATORY for MeshStandardMaterial metalness.
       A metal with nothing to reflect renders black; that is why the whole
       arena looked like a void. This procedural equirect sky gives every
       metal something bright to bounce. */
    const env = this._envTexture();
    if (env) {
      env.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = env;
      scene.environmentIntensity = 0.85;
    }

    this.scene = scene;
    this.camera = camera;
    this.sun = sun;
    this._meshes = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    this._seen = [];
    this._allCars = [];
    this.ready = true;
    return scene;
  },

  /* Procedural equirectangular environment: a dark sky with two bright neon
     lobes and a light horizon band. Cheap (one 512x256 canvas, built once) and
     it is what stops every metal surface from rendering black. */
  _envTexture() {
    try {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const g = c.getContext('2d');
      if (!g) return null;

      // vertical sky gradient
      const sky = g.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, '#2a4a7a');
      sky.addColorStop(0.42, '#16233d');
      sky.addColorStop(0.55, '#0c1424');
      sky.addColorStop(1, '#050810');
      g.fillStyle = sky;
      g.fillRect(0, 0, 512, 256);

      // neon lobes: what the car bodies reflect
      const lobe = (x, y, r, col) => {
        const rad = g.createRadialGradient(x, y, 0, x, y, r);
        rad.addColorStop(0, col);
        rad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      lobe(120, 70, 150, 'rgba(120, 245, 255, 0.95)');
      lobe(390, 95, 160, 'rgba(255, 90, 150, 0.75)');
      lobe(256, 30, 200, 'rgba(180, 220, 255, 0.40)');

      // bright horizon so metal edges catch a highlight
      const hz = g.createLinearGradient(0, 118, 0, 150);
      hz.addColorStop(0, 'rgba(0,0,0,0)');
      hz.addColorStop(0.5, 'rgba(150, 230, 255, 0.55)');
      hz.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hz;
      g.fillRect(0, 118, 512, 32);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    } catch (e) { return null; }
  },

  /* ---------------- sizing ---------------- */

  resize(vw, vh, qualityDpr) {
    if (!this.ready || !this.renderer) return;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, this.cfg.dprCap, qualityDpr || 99);
    this._dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(vw, vh, false);
    this._vw = vw; this._vh = vh;
  },

  /* ---------------- world (floor, walls, pillars) ---------------- */

  buildWorld(game) {
    if (!this.ready) return;
    const S = this.scene;
    const W = (typeof WORLD !== 'undefined' ? WORLD : { w: 2560, h: 2560 });

    /* tear down the previous arena */
    if (this.world) {
      if (this.world.group) {
        this.world.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => { if (m.map && m.map.dispose) m.map.dispose(); m.dispose(); });
          }
        });
        S.remove(this.world.group);
      }
      this.world = null;
    }

    const group = new THREE.Group();
    const C = this.cfg;

    /* --- floor: dark deck + neon tile grid --- */
    const gridTex = this._gridTexture();
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(W.w / 512, W.h / 512);
    if (this.renderer && this.renderer.capabilities) gridTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTex, color: 0xffffff, roughness: 0.55, metalness: 0.18,
      // the grid glows on its own so the deck can never read as a black void
      emissive: 0xffffff, emissiveMap: gridTex, emissiveIntensity: 0.55
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W.w, W.h), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W.w / 2, 0, W.h / 2);
    floor.receiveShadow = true;
    group.add(floor);

    /* --- skid marks / scorch decals live on their own layer --- */
    if (game && game.decals && game.decals.canvas) {
      const tex = new THREE.CanvasTexture(game.decals.canvas);
      tex.needsUpdate = true;
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(W.w, W.h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(W.w / 2, 0.6, W.h / 2);
      decal.renderOrder = 1;
      group.add(decal);
      this._decalTex = tex;
      this._decalMesh = decal;
    }

    /* --- arena walls: tall slabs with a bright top edge --- */
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c2740, roughness: 0.48, metalness: 0.20 });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x35f0ff });
    const t = 34;
    const sides = [
      { x: W.w / 2, z: -t / 2, w: W.w + t * 2, d: t },
      { x: W.w / 2, z: W.h + t / 2, w: W.w + t * 2, d: t },
      { x: -t / 2, z: W.h / 2, w: t, d: W.h + t * 2 },
      { x: W.w + t / 2, z: W.h / 2, w: t, d: W.h + t * 2 }
    ];
    for (const s of sides) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, C.wallH, s.d), wallMat);
      m.position.set(s.x, C.wallH / 2, s.z);
      m.receiveShadow = true;
      group.add(m);
      const e = new THREE.Mesh(new THREE.BoxGeometry(s.w, 3, s.d), edgeMat);
      e.position.set(s.x, C.wallH + 1.5, s.z);
      group.add(e);
    }

    /* --- pillars (they already exist in the simulation) --- */
    if (game && game.pillars) {
      const pMat = new THREE.MeshStandardMaterial({ color: 0x27324f, roughness: 0.42, metalness: 0.22 });
      const pTop = new THREE.MeshBasicMaterial({ color: 0xff3d81 });
      for (const p of game.pillars) {
        const r = (p.r || 40) * 0.92, h = 150;
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, h, 8), pMat);
        body.position.y = h / 2;
        body.castShadow = true; body.receiveShadow = true;
        g.add(body);
        // a solid cap would cover the whole column from a top-down camera;
        // a glowing ring keeps the column readable as a 3D object
        const capGeo = new THREE.TorusGeometry(r * 0.94, r * 0.11, 6, 8);
        capGeo.rotateX(Math.PI / 2);
        const cap = new THREE.Mesh(capGeo, pTop);
        cap.position.y = h + 2;
        g.add(cap);
        const lid = new THREE.Mesh(
          new THREE.CircleGeometry(r * 0.92, 8),
          new THREE.MeshStandardMaterial({ color: 0x33405f, roughness: 0.5, metalness: 0.2 })
        );
        lid.rotation.x = -Math.PI / 2;
        lid.position.y = h + 1.5;
        g.add(lid);
        g.position.set(p.x, 0, p.y);
        group.add(g);
      }
    }

    S.add(group);
    this.world = { group };
    this._harden();
  },

  /* 512x512 tileable neon deck texture */
  _gridTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#0c1526';
    g.fillRect(0, 0, 512, 512);

    // subtle plate shading
    const rad = g.createRadialGradient(256, 256, 40, 256, 256, 360);
    rad.addColorStop(0, 'rgba(42,62,104,0.70)');
    rad.addColorStop(1, 'rgba(4,6,15,0.0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, 512, 512);

    // fine grid
    g.strokeStyle = 'rgba(70,245,255,0.34)';
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
    }
    // major grid
    g.strokeStyle = 'rgba(255,61,129,0.40)';
    g.lineWidth = 3;
    for (let i = 0; i <= 512; i += 256) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
    }
    // glowing intersection dots
    g.fillStyle = 'rgba(120,250,255,0.55)';
    for (let y = 0; y <= 512; y += 256) {
      for (let x = 0; x <= 512; x += 256) {
        g.beginPath(); g.arc(x % 512, y % 512, 3, 0, Math.PI * 2); g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  /* ---------------- cars ---------------- */

  _carGroup(spec) {
    const C = this.cfg;
    const len = spec.len || 46, wid = spec.wid || 26;
    const bodyCol = spec.body || '#25c9e8';
    const glow = spec.glow || '#35f0ff';
    const heavy = !!spec.heavy;

    const g = new THREE.Group();
    const h = C.carH * (heavy ? 1.18 : 1);

    /* chassis: a box tapered toward the nose so it reads as a car, not a brick */
    const chassisGeo = new THREE.BoxGeometry(len, h, wid, 1, 1, 1);
    const pos = chassisGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const f = (x + len / 2) / len;                 // 0 at the tail, 1 at the nose
      pos.setZ(i, pos.getZ(i) * (1 - 0.26 * f));     // narrowing nose
      if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) * (1 - 0.42 * f)); // sloping bonnet
    }
    chassisGeo.computeVertexNormals();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(bodyCol), roughness: 0.30, metalness: 0.34,
      // a faint self-lit tint keeps the car readable even in shadow
      emissive: new THREE.Color(bodyCol), emissiveIntensity: 0.16
    });
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = h / 2 + 3;
    chassis.castShadow = true;
    g.add(chassis);

    /* cabin. Deliberately SMALL: the camera looks straight down, so anything
       big and dark up here would hide the body colour and the car would read
       as a black blob instead of a car. */
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.34, h * 0.62, wid * 0.58),
      new THREE.MeshStandardMaterial({ color: 0x2c4666, roughness: 0.10, metalness: 0.30 })
    );
    cab.position.set(-len * 0.07, h + 3 + h * 0.28, 0);
    cab.castShadow = true;
    g.add(cab);

    /* roof plate in the car's neon colour: this is what the top-down camera
       actually sees, so the silhouette stays the team colour at game scale */
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.30, 1.6, wid * 0.52),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(glow) })
    );
    roof.position.set(-len * 0.07, h + 3 + h * 0.60, 0);
    g.add(roof);

    /* wheels */
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.85, metalness: 0.05 });
    const wr = 6.4, ww = 3.6;
    const wheelGeo = new THREE.CylinderGeometry(wr, wr, ww, 12);
    wheelGeo.rotateX(Math.PI / 2);                   // axis along Z (lateral)
    const wx = len * 0.32, wz = wid * 0.5;
    [[wx, wz], [wx, -wz], [-wx, wz], [-wx, -wz]].forEach(([px, pz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(px, wr, pz);
      w.castShadow = true;
      g.add(w);
      const rimRing = new THREE.Mesh(
        new THREE.TorusGeometry(wr * 0.62, 0.9, 6, 12),
        new THREE.MeshBasicMaterial({ color: glow })
      );
      rimRing.position.set(px, wr, pz * 1.06);
      rimRing.rotation.y = Math.PI / 2;
      g.add(rimRing);
    });

    /* neon side strips + tail bar */
    const neonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow) });
    const strip = new THREE.BoxGeometry(len * 0.72, 1.6, 1.6);
    [wid * 0.5, -wid * 0.5].forEach((pz) => {
      const s = new THREE.Mesh(strip, neonMat);
      s.position.set(-len * 0.04, h * 0.62, pz);
      g.add(s);
    });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, wid * 0.78), neonMat);
    tail.position.set(-len / 2 + 1, h * 0.55, 0);
    g.add(tail);

    /* headlights */
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    [wid * 0.3, -wid * 0.3].forEach((pz) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 4.2), lightMat);
      l.position.set(len / 2 - 1.5, h * 0.42, pz);
      g.add(l);
    });

    /* underglow pool on the deck (the classic neon look) */
    const glowTex = this._glowTexture(glow);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(len * 2.1, wid * 2.6),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.85
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 1.2;
    pool.renderOrder = 2;
    g.add(pool);

    return g;
  },

  _glowTexture(colour) {
    if (!this._glowCache) this._glowCache = {};
    if (this._glowCache[colour]) return this._glowCache[colour];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, colour);
    grad.addColorStop(0.42, this._alpha(colour, 0.42));
    grad.addColorStop(1, this._alpha(colour, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._glowCache[colour] = tex;
    return tex;
  },

  _alpha(hex, a) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  },

  /* The arena is tiny (a few dozen meshes), so culling buys nothing and can
     only ever lose the whole scene if a bounding sphere or the camera basis is
     off. Turn it off for everything we own. */
  _harden() {
    if (!this.scene) return;
    this.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  },

  _meshFor(ent, spec) {
    let g = this._meshes ? this._meshes.get(ent) : null;
    if (!g) {
      g = this._carGroup(spec);
      if (this._meshes) this._meshes.set(ent, g);
      this.scene.add(g);
      if (!this._allCars) this._allCars = [];
      this._allCars.push(g);
      g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    }
    return g;
  },

  _syncCar(ent, spec, dt) {
    const g = this._meshFor(ent, spec);
    g.position.x = ent.x;
    g.position.z = ent.y;
    g.rotation.y = -ent.angle;
    g.visible = !ent.dead;
    this._turret(g, ent);
    if (this._seen.indexOf(g) < 0) this._seen.push(g);
    return g;
  },

  /* player turret rotates independently of the chassis */
  _turret(group, ent) {
    if (ent.turret === undefined || ent.team !== 'player') return;
    // the gun is a tiny barrel sticking out of the cabin
    let gun = group.userData.gun;
    if (!gun) {
      gun = new THREE.Mesh(
        new THREE.BoxGeometry(18, 2.4, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x3d4c6b, metalness: 0.35, roughness: 0.32 })
      );
      gun.position.y = this.cfg.carH + 4;
      gun.castShadow = true;
      group.add(gun);
      group.userData.gun = gun;
    }
    gun.rotation.y = -(ent.turret - ent.angle);
    gun.position.x = 6;
  },

  /* ---------------- camera ---------------- */

  _applyCamera(game) {
    const cam = game.cam;
    const vw = this._vw || 1280, vh = this._vh || 720;
    const zoom = cam.zoom || 1;
    const H = (vh / zoom) / (2 * Math.tan(this.cfg.fov * Math.PI / 360));
    this.camera.position.set(cam.x, H, cam.y);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(cam.x, 0, cam.y);
    this.camera.near = Math.max(1, H * 0.02);
    this.camera.far = H * 3.2;
    this.camera.aspect = vw / vh;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    /* Fog is measured from the CAMERA, and a straight-down camera sits ~1.4x
       the screen height above the deck. Fixed distances near 1100 therefore put
       the entire arena inside the fog and washed it out to the background
       colour. Scale it to the camera height so the deck itself is never fogged
       (the farthest visible ground point is only ~1.25 * H away). */
    if (this.scene && this.scene.fog) {
      this.scene.fog.near = H * 1.45;
      this.scene.fog.far = H * 3.6;
    }

    /* keep the shadow frustum tight around what the player can see */
    const half = Math.max(vw, vh) / (2 * zoom) + 260;
    const s = this.sun;
    s.position.set(cam.x + 320, 900, cam.y + 420);
    s.target.position.set(cam.x, 0, cam.y);
    s.target.updateMatrixWorld();
    const sc = s.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.updateProjectionMatrix();
  },

  /* ---------------- per-frame ---------------- */

  render(game) {
    if (!this.active() || !game) return false;

    /* Never bail out silently. A missing scene used to mean "return false,
       draw nothing, let the 2D pass be skipped" - another invisible failure. */
    if (!this.scene || !this.camera || !this.renderer) {
      this._noScene = (this._noScene || 0) + 1;
      if (this._noScene === 1) {
        try { console.warn('[Render3D] render() called with no scene; falling back to 2D'); } catch (e) {}
      }
      if (this._noScene > 10) {
        this._noScene = 0;
        this.setEnabled(false, null);
        try { if (typeof sync3dButton === 'function') sync3dButton(); } catch (e) {}
      }
      return false;
    }
    this._noScene = 0;
    const dt = 1 / 60;
    this._t += dt;

    /* decals: refresh the texture a few times a second, not every frame */
    if (this._decalTex && game.decals) {
      this._decalTick = (this._decalTick || 0) + 1;
      if (this._decalTick % 5 === 0) this._decalTex.needsUpdate = true;
    }

    this._seen.length = 0;

    /* Safety net: if no arena exists yet (a reset that ran before the layer was
       ready, a toggled state, a rebuilt world), build it here rather than
       rendering an empty void. */
    if (!this.world && game.pillars && game.pillars.length) this.buildWorld(game);

    /* enemies */
    if (game.enemies) {
      for (let i = 0; i < game.enemies.length; i++) {
        const e = game.enemies[i];
        const def = (typeof ENEMY_TYPES !== 'undefined') ? ENEMY_TYPES[e.type] : null;
        this._syncCar(e, {
          len: Math.max(34, (e.r || 19) * 2.35),
          wid: Math.max(20, (e.r || 19) * 1.34),
          body: def ? def.color : '#e0246e',
          glow: def ? def.glow : '#ff3d81',
          heavy: e.type === 'brute' || e.type === 'boss'
        }, dt);
      }
    }

    /* player */
    if (game.player && !game.player.dead) {
      const cardef = (typeof CARS !== 'undefined') ? (CARS[game.player.carId] || null) : null;
      const spr = (typeof SPRITES !== 'undefined' && SPRITES.pcars) ? SPRITES.pcars[game.player.carId] : null;
      this._syncCar(game.player, {
        len: spr ? spr.w : 46,
        wid: spr ? spr.h - 8 : 26,
        body: cardef ? cardef.body : '#25c9e8',
        glow: cardef ? cardef.glow : '#35f0ff',
        heavy: !!(cardef && cardef.heavy)
      }, dt);
    }

    /* hide meshes whose entity went away this frame */
    if (!this._seen) this._seen = [];
    if (!this._allCars) this._allCars = [];
    const cars = this._allCars;
    for (let i = 0; i < cars.length; i++) {
      if (this._seen.indexOf(cars[i]) < 0) cars[i].visible = false;
    }
    this._hideShowcase();

    this._applyPlayerRing(game);

    this._applyCamera(game);
    this.renderer.render(this.scene, this.camera);
    this._selfCheck();
    return true;
  },

  /* Watches what the GPU actually submitted. If the scene renders nothing at
     all for most of a second, the layer is useless, so drop back to the 2D
     renderer instead of leaving the player looking at a black screen. */
  /* Keeps the readout honest even on frames where render() bailed out. */
  diagTick() {
    this._diagTick = (this._diagTick || 0) + 1;
    if (this._diagTick % 10 !== 0) return;
    this._lastMeshes = this._meshCount();
    this._updateBadge();
  },

  _meshCount() {
    let n = 0;
    if (this.scene) this.scene.traverse((o) => { if (o.isMesh) n++; });
    return n;
  },

  /* THE REAL TEST: read the framebuffer back and look at the pixels.

     Counting triangles proved worthless - with frustum culling off, the counter
     includes geometry that never reaches a visible pixel. The only question
     that matters is "are there non-background pixels in the frame?", and the
     GPU can answer it directly. Cost is one readPixels of 5 tiny patches, run
     at most twice a second and only until the layer has proven itself. */
  _probe() {
    const r = this.renderer;
    if (!r) return null;
    const gl = r.getContext && r.getContext();
    if (!gl || !gl.readPixels) return null;
    if (gl.isContextLost && gl.isContextLost()) return null;

    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!w || !h) return { blank: true, reason: 'zero drawing buffer ' + w + 'x' + h };

    const N = 4;
    const buf = new Uint8Array(N * N * 4);
    /* sample the middle and the four quadrants - the arena always fills the
       screen, so a car, a wall or the deck grid must appear in at least one */
    const spots = [
      [(w >> 1) - (N >> 1), (h >> 1) - (N >> 1)],
      [Math.floor(w * 0.25), Math.floor(h * 0.25)],
      [Math.floor(w * 0.75), Math.floor(h * 0.25)],
      [Math.floor(w * 0.25), Math.floor(h * 0.75)],
      [Math.floor(w * 0.75), Math.floor(h * 0.75)]
    ];
    let lit = 0, samples = 0, maxc = 0;
    for (const [x, y] of spots) {
      const px = Math.max(0, Math.min(w - N, x));
      const py = Math.max(0, Math.min(h - N, y));
      try { gl.readPixels(px, py, N, N, gl.RGBA, gl.UNSIGNED_BYTE, buf); } catch (e) { continue; }
      for (let i = 0; i < buf.length; i += 4) {
        samples++;
        const v = buf[i] + buf[i + 1] + buf[i + 2];
        maxc = Math.max(maxc, v);
        if (v > 24) lit++;                       // brighter than the clear colour
      }
    }
    return { blank: lit === 0, lit, samples, maxc, w, h };
  },

  _selfCheck() {
    if (!this.renderer || !this.renderer.info) return;

    const ctx = this.renderer.getContext && this.renderer.getContext();
    if (ctx && ctx.isContextLost && ctx.isContextLost()) {
      if (!this._force) {
        this._contextLost = true;
        try { console.warn('[Render3D] WebGL context is lost; switching to the 2D renderer'); } catch (e) {}
        this.setEnabled(false, null);
        try { if (typeof sync3dButton === 'function') sync3dButton(); } catch (e) {}
      }
      return;
    }

    this._lastTris = this.renderer.info.render.triangles;
    this._lastMeshes = this._meshCount();

    /* prove the pixels, twice a second, until it works; then stop paying for it */
    this._probeTick = (this._probeTick || 0) + 1;
    if (!this._pixelsProven && this._probeTick % 30 === 0 && !this._force) {
      const p = this._probe();
      if (p) {
        this._probeResult = p;
        if (!p.blank) {
          this._pixelsProven = true;
          this._blankFrames = 0;
        } else {
          this._blankFrames = (this._blankFrames || 0) + 1;
          if (this._blankFrames === 1) {
            try {
              console.warn('[Render3D] the frame is blank', {
                canvas: p.w + 'x' + p.h, tris: this._lastTris, meshes: this._lastMeshes,
                camera: this.camera && this.camera.position,
                camNear: this.camera && this.camera.near, camFar: this.camera && this.camera.far,
                cssSize: this._vw + 'x' + this._vh
              });
            } catch (e) {}
          }
          /* three blank probes, half a second apart: give the player a game */
          if (this._blankFrames >= 4) {
            this._blankFrames = 0;
            try { console.warn('[Render3D] nothing visible after 2s - switching to the 2D renderer'); } catch (e) {}
            this.setEnabled(false, null);
            try { if (typeof sync3dButton === 'function') sync3dButton(); } catch (e) {}
          }
        }
      }
    }

    this._badgeTick = (this._badgeTick || 0) + 1;
    if (this._badgeTick % 8 === 0) this._updateBadge();
  },

  /* The live readout. If the screen is black but this says "3D 2434t", the GPU
     is drawing and the problem is layering; if it says "3D 0t", the scene is
     empty; if the badge is gone, the layer is off. One glance tells us which. */
  _updateBadge() {
    try {
      const b = (typeof document !== 'undefined') && document.getElementById
        ? document.getElementById('gl-badge') : null;
      if (!b) return;
      const live = this.active();
      b.classList.toggle('live', live);
      if (live) {
        const p = this._probeResult;
        const verdict = !p ? '?' : (p.blank ? 'BLANK' : 'px ok');
        b.textContent = '3D ' + (this._lastTris || 0) + 't \u00b7 ' + verdict;
      }
    } catch (e) {}
  },

  /* A bright, unlit ring under the player. It depends on nothing except the
     camera, so if this does not appear then the problem is compositing, not
     lighting. It also reads nicely as a player marker. */
  _applyPlayerRing(game) {
    const p = game && game.player;
    if (!p || p.dead) { if (this._ring) this._ring.visible = false; return; }
    if (!this._ring) {
      const geo = new THREE.TorusGeometry(30, 2.6, 8, 40);
      geo.rotateX(Math.PI / 2);
      this._ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x6ff4ff, transparent: true, opacity: 0.85, depthWrite: false
      }));
      this._ring.renderOrder = 3;
      this.scene.add(this._ring);
    }
    this._ring.visible = true;
    this._ring.position.set(p.x, 1.4, p.y);
  },

  _hideShowcase() {
    if (this._showCar) this._showCar.visible = false;
    if (this._showFloor) this._showFloor.visible = false;
  },

  /* menu backdrop: a slow orbiting hero car on the neon deck */
  showcase() {
    if (!this.active()) return false;
    if (!this.scene || !this.camera || !this.renderer) return false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - (this._lastShow || now)) / 1000));
    this._lastShow = now;
    this._t += dt;
    if (!this._showCar) {
      this._showCar = this._carGroup({ len: 150, wid: 84, body: '#25c9e8', glow: '#35f0ff' });
      this.scene.add(this._showCar);
      if (!this.world) {
        // a small private deck so the menu never depends on a running level
        const g = new THREE.Group();
        const tex = this._gridTexture();
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(8, 8);
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(2400, 2400),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.18, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        g.add(floor);
        this.scene.add(g);
        this._showFloor = g;
      }
    }
    if (this._ring) this._ring.visible = false;   // it belongs to the arena, not the menu
    this._showCar.visible = true;
    if (this._showFloor) this._showFloor.visible = true;
    const t = this._t;
    this._showCar.position.set(0, 6 + Math.sin(t * 0.9) * 5, 0);
    this._showCar.rotation.y = t * 0.42;

    const R = 430;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(Math.cos(t * 0.18) * R, 300 + Math.sin(t * 0.3) * 40, Math.sin(t * 0.18) * R);
    this.camera.lookAt(0, 20, 0);
    this.camera.aspect = (this._vw || 1280) / (this._vh || 720);
    this.camera.near = 10; this.camera.far = 5000;
    this.camera.updateProjectionMatrix();
    if (this.scene && this.scene.fog) { this.scene.fog.near = 900; this.scene.fog.far = 2400; }
    if (this.sun) {
      this.sun.position.set(400, 900, 400);
      this.sun.target.position.set(0, 0, 0);
      this.sun.target.updateMatrixWorld();
      const sc = this.sun.shadow.camera;
      sc.left = -700; sc.right = 700; sc.top = 700; sc.bottom = -700;
      sc.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
    this._selfCheck();
    return true;
  },

  /* ---------------- toggle ---------------- */

  setEnabled(on, game) {
    this.enabled = !!on;
    const live = !!(this.enabled && this.ready);
    this._deadFrames = 0;
    this._blankFrames = 0;
    this._pixelsProven = false;
    this._probeResult = null;

    try {
      if (typeof document !== 'undefined' && document.body && document.body.classList) {
        document.body.classList.toggle('has3d', live);
      }
    } catch (e) {}
    if (live) {
      this.resize(this._vw || (typeof window !== 'undefined' ? window.innerWidth : 1280),
        this._vh || (typeof window !== 'undefined' ? window.innerHeight : 720), 99);
      if (this.mode === 'game' && game && game.pillars) this.buildWorld(game);
    } else if (this._showCar) {
      this.scene.remove(this._showCar);
      this._showCar = null;
      if (this._showFloor) { this.scene.remove(this._showFloor); this._showFloor = null; }
    }
    try { if (typeof store !== 'undefined' && store.set) store.set('nw.3d', this.enabled); } catch (e) {}
    this._updateBadge();
    return this.enabled;
  },

    /* test hook: forget everything without touching the DOM */
  _reset() {
    this.ready = false; this.enabled = false; this.renderer = null; this.scene = null;
    this.camera = null; this.world = null; this._meshes = null; this._seen = [];
    this._showCar = null; this._showFloor = null; this._force = false;
    this._seen = []; this._allCars = [];
  }
};
