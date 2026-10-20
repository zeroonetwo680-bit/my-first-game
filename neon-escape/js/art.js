'use strict';
/* ============================================================
   NEON ESCAPE — art.js
   Real sprite atlases, sliced from generated art (tools/slice.js).

   Every hero sprite is a WHITE silhouette on transparency, so the
   skin system can recolour it at runtime (one cached tinted canvas
   per skin colour, built on first use). When the images are not
   available yet — node tests, the first frames of a cold load, or a
   failed request — Runner.draw falls back to the vector silhouette,
   so the game is never blocked by art.
   ============================================================ */

const SPRITES = {
  dir: 'assets/sprites/',
  heroH: 72,          // standing height on screen, px (matches the 72px hitbox)
  run: {
    file: 'hero-run.png',
    cw: 236, ch: 328, refH: 320,
    frames: [
    {x:8,y:4,w:220,h:309},
    {x:258,y:4,w:192,h:318},
    {x:488,y:4,w:204,h:318},
    {x:712,y:4,w:228,h:302},
    {x:967,y:4,w:191,h:320},
    {x:1203,y:4,w:191,h:319},
    {x:1430,y:4,w:208,h:296},
    {x:1676,y:4,w:189,h:298},
    {x:1907,y:4,w:199,h:285},
    {x:2134,y:4,w:217,h:284},
    {x:2388,y:4,w:181,h:297},
    {x:2607,y:4,w:215,h:297}
    ]
  },
  poses: {
    file: 'hero-poses.png',
    h: {tuck:56, fall:66, slide:40, wall:74, vault:60, dive:40},
    frames: {
    'tuck': {x:137,y:4,w:130,h:280},
    'fall': {x:510,y:4,w:192,h:366},
    'slide': {x:853,y:4,w:315,h:223},
    'wall': {x:1341,y:4,w:146,h:414},
    'vault': {x:1706,y:4,w:225,h:315},
    'dive': {x:2024,y:4,w:396,h:219}
    }
  },
  botHunter: { file: 'bot-hunter.png', w: 90, h: 54 },
  botWasp:   { file: 'bot-wasp.png',   w: 69, h: 38 }
};

const Art = {
  img: { run: null, poses: null, hunter: null, wasp: null },
  ready: false,
  _loading: false,
  _tints: Object.create(null),
  _tintCount: 0,

  /* ---------------- loading ---------------- */
  load() {
    if (this._loading || this.ready) return;
    if (typeof Image === 'undefined') return;   // node tests: use the vector fallback
    this._loading = true;
    const map = [
      ['run', SPRITES.run.file], ['poses', SPRITES.poses.file],
      ['hunter', SPRITES.botHunter.file], ['wasp', SPRITES.botWasp.file]
    ];
    let left = map.length;
    const done = () => { if (--left <= 0) this.ready = true; };
    for (let i = 0; i < map.length; i++) {
      const slot = map[i][0];
      try {
        const img = new Image();
        img.onload = () => { this.img[slot] = img; done(); };
        img.onerror = () => { done(); };
        img.src = SPRITES.dir + map[i][1];
      } catch (e) { done(); }
    }
  },

  /* ---------------- tinting ---------------- */
  // white silhouette -> flat skin colour, one small canvas per (sprite, colour)
  _tint(key, f, colour) {
    const ck = key + '|' + colour;
    let c = this._tints[ck];
    if (c) return c;
    const img = this.img[key];
    if (!img || typeof document === 'undefined' || !document.createElement) return null;
    try {
      const cv = document.createElement('canvas');
      cv.width = f.w; cv.height = f.h;
      const cx = cv.getContext('2d');
      if (!cx) return null;
      cx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = colour;
      cx.fillRect(0, 0, f.w, f.h);
      this._tints[ck] = cv;
      this._tintCount++;
      return cv;
    } catch (e) { return null; }
  },

  _blit(ctx, key, f, dx, dy, dw, dh, colour) {
    const img = this.img[key];
    if (!img) return false;
    const t = colour ? this._tint(key, f, colour) : null;
    if (t) ctx.drawImage(t, dx, dy, dw, dh);
    else ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
    return true;
  },

  /* ---------------- which frame is the hero in ---------------- */
  heroFrame(p) {
    if (p.slideT > 0 || p.state === 'slide') return { key: 'poses', name: 'slide' };
    if (p.state === 'wall' || p.wallT > 0) return { key: 'poses', name: 'wall' };
    if (p.vaultT > 0 || p.state === 'vault') return { key: 'poses', name: 'vault' };
    if (p.state === 'dead') return { key: 'poses', name: 'fall' };
    if (!p.onGround) {
      if (p.vy > 700) return { key: 'poses', name: 'dive' };
      return { key: 'poses', name: p.vy < 0 ? 'tuck' : 'fall' };
    }
    return { key: 'run', index: true };
  },

  /* ---------------- hero ---------------- */
  drawHero(ctx, p, camX, skin, alpha) {
    if (!this.ready) return false;
    const colour = (skin && skin.col) || '#eaf6ff';
    const x = p.x - camX, y = p.y;
    const sel = this.heroFrame(p);

    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.translate(x, y);

    // spin / lean, exactly like the vector version
    if (p.flipT > 0) ctx.rotate((0.5 - p.flipT) * Math.PI * 4);
    else if (p.dashT > 0) ctx.rotate(-0.12);

    // speed streaks behind a dashing runner
    if (alpha === undefined && (p.dashT > 0 || p.precT > 0)) {
      ctx.fillStyle = 'rgba(53,240,255,0.16)';
      ctx.fillRect(-96, -62, 74, 52);
    }

    // rim glow: keeps the silhouette readable over dark facility walls
    if (alpha === undefined && ctx.shadowBlur !== undefined) {
      ctx.shadowColor = colour;
      ctx.shadowBlur = 14;
    }

    let drawn = false;
    if (sel.key === 'run') {
      const R = SPRITES.run;
      const ph = p.runPhase || 0;
      const TAU = Math.PI * 2;
      let idx = Math.floor(((ph % TAU) + TAU) % TAU / TAU * R.frames.length);
      if (idx >= R.frames.length) idx = R.frames.length - 1;
      const f = R.frames[idx];
      const s = SPRITES.heroH / R.refH;
      const w = f.w * s, h = f.h * s;
      drawn = this._blit(ctx, 'run', f, -w / 2, -h, w, h, colour);
    } else {
      const f = SPRITES.poses.frames[sel.name];
      if (f) {
        const th = SPRITES.poses.h[sel.name] || 60;
        const s = th / f.h;
        const w = f.w * s, h = f.h * s;
        // slide keeps the body low on the ground; everything else is feet-pivoted
        drawn = this._blit(ctx, 'poses', f, -w / 2, -h, w, h, colour);
      }
    }
    ctx.restore();
    return drawn;
  },

  /* ---------------- swarm bots ---------------- */
  drawBot(ctx, kind, x, y, size, alpha, rot) {
    if (!this.ready) return false;
    const meta = kind === 'wasp' ? SPRITES.botWasp : SPRITES.botHunter;
    const key = kind === 'wasp' ? 'wasp' : 'hunter';
    const img = this.img[key];
    if (!img) return false;
    const s = size / meta.h;
    const w = meta.w * s, h = meta.h * s;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  },

  /* ---------------- test / debug ---------------- */
  reset() {
    this.img = { run: null, poses: null, hunter: null, wasp: null };
    this.ready = false;
    this._loading = false;
    this._tints = Object.create(null);
    this._tintCount = 0;
  }
};
