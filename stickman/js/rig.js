/* STICKMAN — the figure itself.
 *
 * One articulated rig, drawn as ink strokes. Everything is computed in Rig.pose
 * first (plain numbers, no canvas), so the tests can assert the geometry --
 * "the head is above the hips", "a foot is on the ground" -- without needing a
 * rendering context.
 */
'use strict';

var Rig = (function () {

  /* Hand-drawn wobble. Quantised in time so a stroke does not shimmer at
   * 60fps; it should look like the same drawing breathing, not like noise. */
  function wob(seed, frame, i, amt) {
    return hash1(seed * 12.9898 + frame * 3.137 + i * 7.77) * amt;
  }

  var JITTER = 1.15;

  function pose(o) {
    var size = o.size || 60;
    var phase = o.phase || 0;
    var gait = clamp(o.gait === undefined ? 0 : o.gait, 0, 1);
    var t = o.t || 0;
    var frame = Math.floor(t * 11);
    var seed = o.seed || 1;

    /* `size` is the figure's total height, head to foot. The segment lengths
     * below are the classic ink-figure proportions: legs a little under half
     * the height, torso just under a third, and a head that reads as a head
     * even at 60 pixels. */
    var headR = size * 0.098;
    var torso = size * 0.315;
    var legUp = size * 0.215;
    var legLow = size * 0.205;
    var armUp = size * 0.175;
    var armLow = size * 0.165;

    var crouch = clamp(o.crouch || 0, 0, 1) * size * 0.09;
    var lean = (o.lean || 0) * size * 0.12;
    var bob = Math.sin(phase * 2) * size * 0.012 * gait - crouch;

    /* the caller gives us the point on the floor the figure stands on */
    var hipX = (o.x || 0) + lean;
    var hipY = (o.y || 0) + bob - (legUp + legLow) * 0.97;
    var shoulderX = hipX + lean * 0.45;
    var shoulderY = hipY - torso * 0.96;
    var neckX = hipX + lean * 0.7;
    var neckY = hipY - torso;
    var headX = hipX + lean * 0.85;
    var headY = neckY - headR * 1.02;

    /* legs: swing from the hip, knee bends only on the trailing leg */
    var sw = Math.sin(phase);
    var lSwing = sw * 0.62 * gait;
    var rSwing = -sw * 0.62 * gait;
    var lBend = Math.max(0, -Math.cos(phase)) * 1.15 * gait + 0.06;
    var rBend = Math.max(0, Math.cos(phase)) * 1.15 * gait + 0.06;

    function leg(hx, hy, swing, bend) {
      var kx = hx + Math.sin(swing) * legUp;
      var ky = hy + Math.cos(swing) * legUp;
      var a2 = swing - bend;
      return {
        knee: { x: kx, y: ky },
        foot: { x: kx + Math.sin(a2) * legLow, y: ky + Math.cos(a2) * legLow }
      };
    }
    /* a small permanent stance: standing with both legs on one line reads as
     * a single stick, and the figure loses its footing */
    var stance = 0.075 + 0.02 * gait;
    var legL = leg(hipX - size * stance, hipY, lSwing + (gait < 0.2 ? -0.10 : 0), lBend);
    var legR = leg(hipX + size * stance, hipY, rSwing + (gait < 0.2 ? 0.10 : 0), rBend);

    /* Arms. Two rules keep them readable:
     *   1. a hanging arm is tilted OUT from the torso, never straight down,
     *      otherwise it is drawn on top of the body and disappears into it;
     *   2. the elbow continues the upper arm instead of folding back across
     *      the chest, which is what turns a stick figure into a knot. */
    var aim = (o.aim === undefined || o.aim === null) ? null : o.aim;
    var pairCount = Math.max(1, o.arms || 1);
    var spreads = o.aimSpreads || [0];
    var idle = Math.sin(phase) * 0.10 * gait;
    var HANG_R = Math.PI / 2 - 0.34;      // down and to the right
    var HANG_L = Math.PI / 2 + 0.34;      // down and to the left
    var armPairs = [];

    for (var p2 = 0; p2 < pairCount; p2++) {
      var sx = shoulderX;
      /* the extra pairs sit lower and further apart, so six arms read as six
       * arms instead of a bundle of sticks around the shoulders */
      var sy = shoulderY + p2 * size * 0.105;
      var fan = spreads[p2] || 0;

      var rightAng, leftAng;
      if (aim === null) {
        rightAng = HANG_R + idle + fan;
        leftAng = HANG_L + idle - fan;
      } else if (p2 === 0) {
        /* the main pair aims; the second arm hangs out of the way */
        rightAng = aim + fan;
        leftAng = aim - fan;
      } else {
        rightAng = aim + fan;
        leftAng = aim - fan;
      }

      /* the elbow bends away from the body, not across it */
      var bendR = (aim === null || p2 > 0) ? 0.20 : 0.10;
      var bendL = (aim === null || p2 > 0) ? -0.20 : -0.10;

      function arm2(ang, bendAmt) {
        var ex = sx + Math.cos(ang) * armUp;
        var ey = sy + Math.sin(ang) * armUp;
        var a2 = ang + bendAmt;
        return {
          elbow: { x: ex, y: ey },
          hand: { x: ex + Math.cos(a2) * armLow, y: ey + Math.sin(a2) * armLow }
        };
      }
      armPairs.push({ left: arm2(leftAng, bendL), right: arm2(rightAng, bendR), sy: sy });
    }

    /* wobble every joint a little, consistently within one "frame" */
    var pts = {
      head: { x: headX, y: headY },
      neck: { x: neckX, y: neckY },
      shoulder: { x: shoulderX, y: shoulderY },
      hip: { x: hipX, y: hipY },
      legL: legL,
      legR: legR
    };
    var n = 0;
    function jit(pt) {
      n++;
      pt.x += wob(seed, frame, n, JITTER) * (size / 60);
      pt.y += wob(seed + 91, frame, n, JITTER) * (size / 60);
      return pt;
    }
    jit(pts.head); jit(pts.neck); jit(pts.shoulder); jit(pts.hip);
    jit(pts.legL.knee); jit(pts.legL.foot);
    jit(pts.legR.knee); jit(pts.legR.foot);

    var hands = [];
    for (var q = 0; q < armPairs.length; q++) {
      var pr = armPairs[q];
      jit(pr.left.elbow); jit(pr.left.hand);
      jit(pr.right.elbow); jit(pr.right.hand);
      hands.push(pr.left.hand, pr.right.hand);
    }

    return {
      size: size, headR: headR,
      head: pts.head, neck: pts.neck, shoulder: pts.shoulder, hip: pts.hip,
      legL: pts.legL, legR: pts.legR,
      armPairs: armPairs, hands: hands,
      /* the lowest point, used for the ground shadow */
      feetY: Math.max(pts.legL.foot.y, pts.legR.foot.y),
      aim: aim
    };
  }

  function stroke(ctx, a, b) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  function path(ctx, pts) {
    ctx.beginPath();
    var i;
    for (i = 0; i < pts.length; i++) stroke(ctx, pts[i], pts[i + 1] || pts[i]);
    ctx.stroke();
  }

  /* Draw a posed figure. Two passes: a soft wider underneath so the ink reads
   * on any background, then the crisp line on top. */
  function draw(ctx, p, o) {
    o = o || {};
    var color = o.color || '#111';
    var lw = o.lw || Math.max(1.6, p.size * 0.045);
    var alpha = o.alpha === undefined ? 1 : o.alpha;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* ground smudge */
    if (o.shadow !== false) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(p.hip.x, p.feetY + lw * 0.6, p.size * 0.30,
                  Math.max(2, p.size * 0.045), 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    function drawScarf() {
      /* A neckerchief, kept deliberately thin: a band at the base of the neck
       * and one narrow tail hanging straight down the chest with a slow sway.
       * It is the only colour on the page, so the player is never lost in a
       * crowd of ink figures -- but it must stay thin, or it reads as a flag
       * stuck to the character's face. */
      var sway = Math.sin((o.t || 0) * 6) * p.size * 0.012;
      var nx = p.neck.x;
      var ny = p.neck.y + p.size * 0.006;
      var len = p.size * 0.20;
      var halfW = Math.max(1.4, p.size * 0.013);
      ctx.save();
      ctx.fillStyle = o.scarf;
      ctx.beginPath();
      ctx.moveTo(nx - halfW * 1.6, ny - halfW * 0.4);
      ctx.quadraticCurveTo(nx + sway * 0.4, ny + len * 0.5,
                           nx + sway - halfW, ny + len);
      ctx.lineTo(nx + sway + halfW, ny + len);
      ctx.quadraticCurveTo(nx + sway * 0.5 + halfW * 1.2, ny + len * 0.45,
                           nx + halfW * 1.6, ny - halfW * 0.4);
      ctx.closePath();
      ctx.fill();
      /* the band around the neck, on top of the tail */
      ctx.beginPath();
      ctx.ellipse(nx, ny, p.size * 0.052, p.size * 0.021, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    function body(extra) {
      /* spine */
      path(ctx, [p.neck, p.hip]);
      /* legs */
      path(ctx, [p.hip, p.legL.knee, p.legL.foot]);
      path(ctx, [p.hip, p.legR.knee, p.legR.foot]);
      /* arms */
      for (var i = 0; i < p.armPairs.length; i++) {
        var pr = p.armPairs[i];
        path(ctx, [p.shoulder, pr.left.elbow, pr.left.hand]);
        path(ctx, [p.shoulder, pr.right.elbow, pr.right.hand]);
      }
      /* head */
      ctx.beginPath();
      ctx.arc(p.head.x, p.head.y, p.headR + extra, 0, TAU);
      ctx.stroke();
    }

    if (o.flash) {
      ctx.strokeStyle = o.flash;
      ctx.lineWidth = lw * 3.4;
      body(lw * 0.5);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    body(0);

    /* the scarf sits on top of the ink: a neckerchief is worn over the body,
     * and underneath it would simply be covered by the spine line */
    if (o.scarf) drawScarf();

    /* face: two ink dots looking along the aim, only when close enough */
    if (o.face && p.aim !== null) {
      var ex = Math.cos(p.aim), ey = Math.sin(p.aim);
      var px = -ey, py = ex;
      var d = p.headR * 0.42;
      var fw = p.headR * 0.5;
      ctx.fillStyle = color;
      for (var s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.arc(p.head.x + ex * fw + px * d * s,
                p.head.y + ey * fw + py * d * s,
                Math.max(1.1, p.headR * 0.16), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return { pose: pose, draw: draw, wob: wob };
})();
