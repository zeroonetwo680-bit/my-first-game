'use strict';
/* ============================================================
   NEON ESCAPE — rig.js
   Skeletal silhouette animation, the way Vector does it.

   Why a rig instead of sprite frames:
   * a sprite sheet is 12 discrete poses at ~20 fps, so a sprint looks steppy;
     the rig is evaluated every frame (60 fps) and is continuous.
   * sprite cycles cannot foot-plant. Here the stance foot is locked to the
     ground and the knee/ankle are solved with two-bone IK, so it never slips.
   * one rig covers run / jump / fall / slide / dash / wall and reacts to speed,
     lean, landing squash and dash lean — no extra art per state.

   Foot-planting math
   ------------------
   The body advances `v` px/s and runPhase advances at `v * K` rad/s, so the
   gait period is T = 2*pi/(v*K) — independent of speed. During stance a planted
   foot travels backwards in body space by `2*stride`, while the body advances
   `v * duty * T = duty * 2*pi / K`. Those must match:
        K = duty * pi / stride
   which is why K is derived from the pose constants below instead of tweaked.

   Local space: origin at the FEET (same pivot as the sprites), +x forward,
   -y up. Lengths are pixels at scale 1.
   ============================================================ */

const Rig = {
  enabled: true,

  /* ---------------- proportions ---------------- */
  P: {
    thigh: 18.0, shin: 17.5, foot: 7.5,
    spine: 21.0, neck: 3.0, headR: 6.8,
    upperArm: 13.5, forearm: 12.5,
    torsoW: 9.6, shoulderW: 4.4,
    hipDrop: 30.8,                 // hip height above the ground (rest)
    stride: 16.5,                  // half step length: +stride (front) .. -stride (back)
    duty: 0.42,                    // fraction of the gait cycle in ground contact
    lift: 10.5                     // swing foot lift
  },

  /* gait angular rate that makes the stance foot perfectly planted */
  gaitK() { const P = this.P; return P.duty * Math.PI / P.stride; },

  height() { const P = this.P; return P.hipDrop + P.spine + P.neck + P.headR * 2; },

  /* ---------------- math ---------------- */
  _cubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },

  /* two-bone IK: hip -> knee -> ankle, knee driven forward (+x) */
  _knee(hip, ankle, L1, L2) {
    let dx = ankle.x - hip.x, dy = ankle.y - hip.y;
    let d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const min = Math.abs(L1 - L2) + 0.8, max = L1 + L2 - 0.8;
    const dc = Math.min(Math.max(d, min), max);
    const a = (L1 * L1 - L2 * L2 + dc * dc) / (2 * dc);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / d, uy = dy / d;
    const k1 = { x: hip.x + ux * a - uy * h, y: hip.y + uy * a + ux * h };
    const k2 = { x: hip.x + ux * a + uy * h, y: hip.y + uy * a - ux * h };
    return { knee: (k1.x > k2.x ? k1 : k2), reach: d, max: L1 + L2 };
  },

  /* clamp a foot target onto the reachable circle around the hip */
  _reachable(hip, target, L1, L2) {
    const dx = target.x - hip.x, dy = target.y - hip.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const max = L1 + L2 - 0.8;
    if (d <= max) return { x: target.x, y: target.y, clamped: false };
    return { x: hip.x + (dx / d) * max, y: hip.y + (dy / d) * max, clamped: true };
  },

  /* ---------------- pose ---------------- */
  pose(p) {
    const P = this.P;
    const st = p.state || 'run';
    const spd = p.speedNow || p.baseSpeed || 310;
    const fast = clamp((spd - 300) / 430, 0, 1);

    const cyc = (p.runPhase || 0) % (Math.PI * 2);
    const step = cyc / (Math.PI * 2);                 // 0..1 over one full stride

    // body bob: lowest at mid-stance, two dips per stride
    let bob = -Math.cos(cyc * 2) * 1.9;
    let lean = 0.13 + fast * 0.12;                    // forward lean, radians
    let hipY = -P.hipDrop + bob;
    let stride = P.stride * (1 + fast * 0.10);
    let lift = P.lift;
    let armSwing = 1.0;
    let crouch = 0;
    let fixedFeet = null;                             // non-gait states set both feet

    if (st === 'run' || st === 'dash') {
      if (st === 'dash') { lean += 0.20; stride *= 1.18; lift *= 1.10; }
    } else if (st === 'jump' || st === 'fall' || (!p.onGround && st !== 'wall')) {
      const rising = (p.vy || 0) < 0;
      lean = rising ? 0.20 : 0.10;
      bob = 0;
      hipY = -P.hipDrop + (rising ? 4.2 : 1.2);
      crouch = rising ? 0.75 : 0.25;
      armSwing = 0.45;
      fixedFeet = rising
        ? [{ x: 13, y: -7 }, { x: -7, y: -15 }]        // lead knee up, trail heel back
        : [{ x: 11, y: -3 }, { x: -12, y: -6 }];      // legs reaching down for the landing
    } else if (st === 'slide') {
      lean = 1.16;
      bob = 0;
      hipY = -P.hipDrop * 0.52;
      armSwing = 0.25;
      fixedFeet = [{ x: 18, y: -2 }, { x: 2, y: -4 }];
    } else if (st === 'wall') {
      lean = -0.10;
      bob = 0;
      hipY = -P.hipDrop + 3.4;
      crouch = 0.85;
      armSwing = 0.2;
      fixedFeet = [{ x: 6, y: -13 }, { x: -5, y: -2 }];
    } else if (st === 'vault') {
      lean = 0.62;
      bob = 0;
      hipY = -P.hipDrop + 4.6;
      crouch = 0.5;
      armSwing = 0.45;
      fixedFeet = [{ x: 4, y: -11 }, { x: -9, y: -4 }];
    } else if (st === 'dead') {
      lean = 0.95;
      hipY = -P.hipDrop * 0.62;
      armSwing = 0.1;
      fixedFeet = [{ x: 10, y: -2 }, { x: -6, y: -1 }];
    }

    /* ---- spine ---- */
    const hip = { x: 0, y: hipY };
    const shoulder = { x: hip.x + Math.sin(lean) * P.spine, y: hip.y - Math.cos(lean) * P.spine };
    const neck = { x: shoulder.x + Math.sin(lean) * P.neck, y: shoulder.y - Math.cos(lean) * P.neck };
    const head = {
      x: neck.x + Math.sin(lean) * P.headR * 0.55 + P.headR * 0.22,
      y: neck.y - Math.cos(lean) * P.headR * 0.85
    };

    /* ---- legs ---- */
    const legs = [];
    for (let i = 0; i < 2; i++) {
      let target;
      if (fixedFeet) {
        target = { x: fixedFeet[i].x, y: fixedFeet[i].y };
      } else {
        const t01 = (step + (i === 1 ? 0.5 : 0)) % 1;
        if (t01 < P.duty) {
          const s = t01 / P.duty;                    // stance: planted foot slides back
          target = { x: stride * (1 - 2 * s), y: 0 };
        } else {
          const s = (t01 - P.duty) / (1 - P.duty);   // swing: lift, fold, reach
          const e = this._cubic(s);
          target = {
            x: -stride + 2 * stride * e,
            y: -lift * Math.sin(Math.PI * Math.pow(s, 0.82))
          };
        }
      }
      // crouch pulls the feet up towards the hips so the knees bend
      const crouchScale = (st === 'jump' || st === 'fall') ? 0.55 : 1;
      target = { x: target.x * (1 - crouch * 0.30 * crouchScale), y: target.y - crouch * 8 * crouchScale };

      const clamped = this._reachable(hip, target, P.thigh, P.shin);
      const sol = this._knee(hip, clamped, P.thigh, P.shin);
      const toeAng = -0.30 + (st === 'jump' ? -0.35 : 0) + (target.y > -2 ? 0.25 : 0);
      const toe = {
        x: clamped.x + Math.cos(toeAng) * P.foot,
        y: clamped.y + Math.sin(toeAng) * P.foot
      };
      legs.push({ hip, knee: sol.knee, ankle: clamped, toe, back: i === 1, stretch: sol.reach / sol.max });
    }

    /* ---- arms (hang from the shoulder, elbow ~90 deg, counter-swing) ---- */
    const arms = [];
    // side view: the arm hangs in front of the torso, otherwise the upper arm
    // is buried inside the silhouette and only a floating forearm shows
    const anchor = {
      x: shoulder.x + Math.cos(lean) * 3.2,
      y: shoulder.y + Math.sin(lean) * 3.2
    };
    for (let i = 0; i < 2; i++) {
      const aPh = (step + (i === 0 ? 0.5 : 0)) % 1;
      const sw = Math.sin(aPh * Math.PI * 2) * armSwing;    // +1 forward .. -1 back
      // angle 0 = straight down, +pi/2 = straight forward
      // narrow swing: a runner's elbow stays behind the hip, the hand reaches
      // chest height in front. Swinging wider than this reads as a wave.
      const upperAng = lean * 0.30 + sw * 0.52;
      const elbowBend = 1.38 + fast * 0.18 + Math.max(0, -sw) * 0.22;
      const elbow = {
        x: anchor.x + Math.sin(upperAng) * P.upperArm,
        y: anchor.y + Math.cos(upperAng) * P.upperArm
      };
      const foreAng = upperAng + elbowBend;
      const hand = {
        x: elbow.x + Math.sin(foreAng) * P.forearm,
        y: elbow.y + Math.cos(foreAng) * P.forearm
      };
      arms.push({ shoulder: anchor, elbow, hand, back: i === 1 });
    }

    return { hip, shoulder, neck, head, legs, arms, lean, st };
  },

  /* ---------------- drawing ---------------- */
  _line(ctx, a, b, w, colour) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  },

  draw(ctx, p, camX, skin, alpha) {
    if (!this.enabled) return false;
    const P = this.P;
    const col = (skin && skin.col) || '#eaf6ff';
    const far = (skin && skin.dark) || shadeHex(col, -0.45);
    const q = this.pose(p);

    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.translate(p.x - camX, p.y);

    if (p.flipT > 0) ctx.rotate((0.5 - p.flipT) * Math.PI * 4);
    else if (p.dashT > 0) ctx.rotate(-0.09);

    if (alpha === undefined && ctx.shadowBlur !== undefined) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 9;
    }

    const hip = q.hip, sh = q.shoulder;

    // ---- far side (darker = depth) ----
    const fl = q.legs[1];
    this._line(ctx, hip, fl.knee, 6.4, far);
    this._line(ctx, fl.knee, fl.ankle, 5.8, far);
    this._line(ctx, fl.ankle, fl.toe, 4.6, far);
    const fa = q.arms[1];
    this._line(ctx, fa.shoulder, fa.elbow, 5.0, far);
    this._line(ctx, fa.elbow, fa.hand, 4.4, far);
    ctx.fillStyle = far;
    ctx.beginPath(); ctx.arc(fa.hand.x, fa.hand.y, 2.7, 0, Math.PI * 2); ctx.fill();

    // ---- torso: tapered silhouette (shoulders wide, waist narrow) ----
    const dx = sh.x - hip.x, dy = sh.y - hip.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;                 // unit normal
    const wHip = P.torsoW * 0.36, wSh = P.torsoW * 0.56;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(hip.x + nx * wHip, hip.y + ny * wHip);
    ctx.quadraticCurveTo(
      hip.x + nx * (wHip + 1.1) + dx * 0.55, hip.y + ny * (wHip + 1.1) + dy * 0.55,
      sh.x + nx * wSh, sh.y + ny * wSh
    );
    ctx.lineTo(sh.x - nx * wSh, sh.y - ny * wSh);
    ctx.quadraticCurveTo(
      hip.x - nx * (wHip + 1.1) + dx * 0.55, hip.y - ny * (wHip + 1.1) + dy * 0.55,
      hip.x - nx * wHip, hip.y - ny * wHip
    );
    ctx.closePath();
    ctx.fill();

    // shoulder line
    this._line(ctx, { x: sh.x + nx * wSh * 0.75, y: sh.y + ny * wSh * 0.75 },
      { x: sh.x - nx * wSh * 0.75, y: sh.y - ny * wSh * 0.75 }, 6.2, col);

    // ---- neck + head ----
    this._line(ctx, sh, q.neck, 5.0, col);
    ctx.save();
    ctx.translate(q.head.x, q.head.y);
    ctx.rotate(q.lean * 0.85);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, P.headR * 0.92, P.headR, 0, 0, Math.PI * 2);
    ctx.fill();
    // swept hair (a small silhouette cue so the head reads at 70 px tall)
    ctx.beginPath();
    ctx.moveTo(-P.headR * 0.35, -P.headR * 0.95);
    ctx.quadraticCurveTo(-P.headR * 1.05, -P.headR * 1.02, -P.headR * 1.30, -P.headR * 0.55);
    ctx.quadraticCurveTo(-P.headR * 0.75, -P.headR * 0.62, -P.headR * 0.30, -P.headR * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ---- near side ----
    const nl = q.legs[0];
    this._line(ctx, hip, nl.knee, 7.0, col);
    this._line(ctx, nl.knee, nl.ankle, 6.2, col);
    this._line(ctx, nl.ankle, nl.toe, 5.0, col);
    const na = q.arms[0];
    this._line(ctx, na.shoulder, na.elbow, 5.4, col);
    this._line(ctx, na.elbow, na.hand, 4.8, col);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(na.hand.x, na.hand.y, 2.9, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    return true;
  }
};

/* darken a #rrggbb colour by |amt| (0..1) */
function shadeHex(hex, amt) {
  let h = String(hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
