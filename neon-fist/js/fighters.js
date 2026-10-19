/* ============================================================
   NEON FIST — fighter roster + procedural neon body rendering
   Fighters are stylized neon humanoids drawn from joint points;
   every state (idle/walk/punch/kick/block/hit/special/ko/win) is
   a parametric pose so animation stays smooth at any timescale.
   ============================================================ */
'use strict';

const FIGHTER_DEFS = {
  blaze: {
    id: 'blaze', name: 'BLAZE',
    color: '#35f0ff', accent: '#ff3d81',
    desc: 'Fast striker. Short reach, rapid punches.',
    hp: 100, speed: 330, dashSpeed: 660,
    dmgMul: 0.95,
    punch: { dmg: 7, reach: 100, startup: 0.08, active: 0.1, recovery: 0.2, kb: 130, stun: 0.26 },
    kick: { dmg: 12, reach: 130, startup: 0.15, active: 0.12, recovery: 0.3, kb: 230, stun: 0.34 },
    special: { dmg: 24, dashDist: 560, active: 0.34, recovery: 0.4, kb: 460, stun: 0.55 }
  },
  titan: {
    id: 'titan', name: 'TITAN',
    color: '#ffb84d', accent: '#ff5e3d',
    desc: 'Heavy brawler. Slower, hits like a truck.',
    hp: 118, speed: 240, dashSpeed: 560,
    dmgMul: 1.18,
    punch: { dmg: 9, reach: 112, startup: 0.11, active: 0.11, recovery: 0.26, kb: 170, stun: 0.3 },
    kick: { dmg: 15, reach: 145, startup: 0.19, active: 0.13, recovery: 0.38, kb: 290, stun: 0.4 },
    special: { dmg: 30, dashDist: 470, active: 0.36, recovery: 0.5, kb: 560, stun: 0.6 }
  },
  volt: {
    id: 'volt', name: 'VOLT',
    color: '#ff3d81', accent: '#35f0ff',
    desc: 'Technical duelist. Perfect blocks PARRY!',
    hp: 105, speed: 290, dashSpeed: 640,
    dmgMul: 1.0,
    parry: 0.22,
    punch: { dmg: 8, reach: 105, startup: 0.07, active: 0.09, recovery: 0.18, kb: 140, stun: 0.27 },
    kick: { dmg: 12, reach: 135, startup: 0.14, active: 0.11, recovery: 0.28, kb: 240, stun: 0.36 },
    special: { dmg: 26, dashDist: 620, active: 0.26, recovery: 0.42, kb: 500, stun: 0.55 }
  }
};

const BODY = {
  ground: 440,          // logical ground y
  hipH: 62,             // hip height above ground
  torso: 50,            // hip -> neck
  headR: 13,
  upperArm: 30,
  foreArm: 28,
  thigh: 33,
  shin: 31,
  shoulderW: 9
};

/** compute all joints for a fighter, in logical arena space.
    f: fighter state; t: global time; p: pose progress 0..1 (attacks) */
function computePose(f, t) {
  const d = f.dir; // facing: 1 right, -1 left
  const B = BODY;
  const px = f.x;
  const ground = B.ground;

  let hipY = ground - B.hipH, hipX = px;
  let lean = 0;             // torso lean (positive = toward facing)
  let headOff = 0;
  // feet
  let footF = { x: px + 16 * d, y: ground };
  let footB = { x: px - 14 * d, y: ground };
  let kneeF = { x: px + 10 * d, y: ground - B.shin * 0.9 };
  let kneeB = { x: px - 8 * d, y: ground - B.shin * 0.95 };
  // hands (guard stance defaults)
  let handF = { x: px + 26 * d, y: hipY - B.torso * 0.72 };
  let handB = { x: px + 10 * d, y: hipY - B.torso * 0.62 };
  let elbowF = { x: px + 20 * d, y: hipY - B.torso * 0.45 };
  let elbowB = { x: px + 4 * d, y: hipY - B.torso * 0.42 };

  const bob = Math.sin(t * 4.2 + f.seed) * 2;
  hipY += bob;

  switch (f.state) {
    case 'walk': {
      const wt = t * 9;
      footF = { x: px + (16 + Math.sin(wt) * 15) * d, y: ground - Math.max(0, Math.sin(wt)) * 7 };
      footB = { x: px + (-14 + Math.sin(wt + Math.PI) * 15) * d, y: ground - Math.max(0, Math.sin(wt + Math.PI)) * 7 };
      kneeF = { x: (hipX + footF.x) / 2 + 4 * d, y: (hipY + footF.y) / 2 };
      kneeB = { x: (hipX + footB.x) / 2 + 4 * d, y: (hipY + footB.y) / 2 };
      handF = { x: px + (24 + Math.sin(wt + 1) * 4) * d, y: hipY - B.torso * 0.7 };
      handB = { x: px + (8 - Math.sin(wt + 1) * 4) * d, y: hipY - B.torso * 0.6 };
      break;
    }
    case 'punch': {
      // p: 0 startup -> 1 active/recovery blend
      const p = f.attackPhase;
      const ext = Math.sin(Math.min(1, p * 1.25) * Math.PI); // out & back
      lean = 5 * ext;
      hipX += 6 * ext * d;
      handF = { x: px + (26 + ext * (f.def.punch.reach - 34)) * d, y: hipY - B.torso * 0.78 };
      elbowF = { x: px + (20 + ext * (f.def.punch.reach - 40) * 0.55) * d, y: hipY - B.torso * 0.78 };
      handB = { x: px + 2 * d, y: hipY - B.torso * 0.55 };
      elbowB = { x: px + 6 * d, y: hipY - B.torso * 0.4 };
      footF = { x: px + 26 * d, y: ground };
      break;
    }
    case 'kick': {
      const p = f.attackPhase;
      const ext = Math.sin(Math.min(1, p * 1.15) * Math.PI);
      lean = -7 * ext;
      hipX -= 4 * ext * d;
      const reach = f.def.kick.reach;
      footF = { x: px + (14 + ext * (reach - 20)) * d, y: ground - B.hipH * 0.55 - ext * 34 };
      kneeF = { x: px + (10 + ext * reach * 0.5) * d, y: ground - B.hipH * 0.75 };
      handF = { x: px + 14 * d, y: hipY - B.torso * 0.85 };
      handB = { x: px - 12 * d, y: hipY - B.torso * 0.5 };
      elbowB = { x: px - 6 * d, y: hipY - B.torso * 0.45 };
      break;
    }
    case 'block': {
      hipX -= 3 * d;
      handF = { x: px + 20 * d, y: hipY - B.torso * 0.92 };
      handB = { x: px + 17 * d, y: hipY - B.torso * 0.68 };
      elbowF = { x: px + 10 * d, y: hipY - B.torso * 0.72 };
      elbowB = { x: px + 8 * d, y: hipY - B.torso * 0.5 };
      break;
    }
    case 'hit': {
      const p = Math.min(1, f.st / 0.18);
      lean = -9 * p;
      headOff = -8 * p * d;
      handF = { x: px + 14 * d, y: hipY - B.torso * 0.9 };
      handB = { x: px - 16 * d, y: hipY - B.torso * 0.4 };
      elbowB = { x: px - 10 * d, y: hipY - B.torso * 0.42 };
      footF = { x: px + 24 * d, y: ground };
      break;
    }
    case 'special': {
      const p = f.attackPhase;
      const ext = Math.min(1, p * 1.6);
      lean = 8;
      handF = { x: px + (30 + ext * 40) * d, y: hipY - B.torso * 0.8 };
      elbowF = { x: px + (24 + ext * 24) * d, y: hipY - B.torso * 0.8 };
      handB = { x: px - 20 * d, y: hipY - B.torso * 0.3 };
      elbowB = { x: px - 12 * d, y: hipY - B.torso * 0.45 };
      footF = { x: px + 34 * d, y: ground - 6 * ext };
      footB = { x: px - 30 * d, y: ground };
      kneeB = { x: px - 20 * d, y: ground - B.shin * 0.8 };
      break;
    }
    case 'ko': {
      const p = Math.min(1, f.st / 0.5);
      const e = 1 - Math.pow(1 - p, 3);
      // crumple to the ground behind facing
      hipX = px - 14 * e * d;
      hipY = ground - B.hipH * (1 - e * 0.75);
      headOff = -30 * e * d;
      footF = { x: px + 30 * d, y: ground - 6 * (1 - e) };
      footB = { x: px - 34 * e * d, y: ground };
      kneeF = { x: px + 18 * d, y: ground - B.shin * (1 - e * 0.9) };
      kneeB = { x: px - 20 * d, y: ground - B.shin * (1 - e * 0.85) };
      handF = { x: px + (26 - 40 * e) * d, y: ground - (hipY + 10) * (1 - e) - 6 * e };
      handB = { x: px + (-18 - 26 * e) * d, y: ground - 8 };
      elbowF = { x: px + (20 - 22 * e) * d, y: ground - 22 * (1 - e) - 6 };
      elbowB = { x: px - 10 * d, y: ground - 20 * (1 - e) - 4 };
      lean = -50 * e;
      break;
    }
    case 'win': {
      const wob = Math.sin(t * 6) * 4;
      handF = { x: px + (20 + wob) * d, y: hipY - B.torso - 26 };
      handB = { x: px + (-20 + wob) * d, y: hipY - B.torso - 22 };
      elbowF = { x: px + 16 * d, y: hipY - B.torso * 0.62 };
      elbowB = { x: px - 16 * d, y: hipY - B.torso * 0.6 };
      break;
    }
    default: { // idle
      handF = { x: px + (26 + bob * 0.4) * d, y: hipY - B.torso * 0.74 };
      handB = { x: px + (10 + bob * 0.3) * d, y: hipY - B.torso * 0.62 };
    }
  }

  const neck = { x: hipX + lean * d * 0.6, y: hipY - B.torso };
  const head = { x: neck.x + lean * d * 0.4 + headOff, y: neck.y - B.headR - 4 };
  const shoulderF = { x: neck.x + B.shoulderW * 0.6 * d, y: neck.y + 4 };
  const shoulderB = { x: neck.x - B.shoulderW * 0.6 * d, y: neck.y + 4 };
  if (f.state === 'idle' || f.state === 'walk' || f.state === 'block' || f.state === 'win') {
    // keep default guard elbows anchored to shoulders
    elbowF = elbowF && elbowF.x !== undefined ? elbowF : shoulderF;
  }

  return { hip: { x: hipX, y: hipY }, neck, head, shoulderF, shoulderB, kneeF, kneeB, footF, footB, elbowF, elbowB, handF, handB };
}

function limb(ctx, a, b, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** draw the neon body: soft outer glow pass + bright core pass */
function drawFighter(ctx, f, t) {
  const j = computePose(f, t);
  const col = f.def.color;
  const acc = f.def.accent;

  // shadow
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(f.x, BODY.ground + 4, 44, 8, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // blocking shield hint
  if (f.state === 'block') {
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 10);
    ctx.strokeStyle = '#9fb4d8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x + f.dir * 18, BODY.ground - 85, 56, -Math.PI / 2 - 0.5, Math.PI / 2 + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // charge aura on the striking hand/foot
  let weapon = null;
  if (f.state === 'punch' || f.state === 'special') weapon = j.handF;
  else if (f.state === 'kick') weapon = j.footF;
  if (weapon) {
    const spr = FX.makeGlow(acc);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(spr, weapon.x - 20, weapon.y - 20, 40, 40);
    ctx.globalAlpha = 1;
  }

  const joints = [
    [j.neck, j.hip, 11],          // torso
    [j.hip, j.kneeF, 9], [j.kneeF, j.footF, 7],
    [j.hip, j.kneeB, 9], [j.kneeB, j.footB, 7],
    [j.shoulderF, j.elbowF, 7], [j.elbowF, j.handF, 6],
    [j.shoulderB, j.elbowB, 7], [j.elbowB, j.handB, 6]
  ];

  // glow pass
  for (const [a, b, w] of joints) limb(ctx, a, b, col, w * 2.6);
  // core pass
  for (const [a, b, w] of joints) limb(ctx, a, b, col, w);

  // head
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, BODY.headR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(4,6,15,0.85)';
  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, BODY.headR * 0.62, 0, TAU);
  ctx.fill();
  // visor
  ctx.fillStyle = acc;
  ctx.fillRect(j.head.x + (f.dir > 0 ? 1 : -BODY.headR * 0.9), j.head.y - 4, BODY.headR * 0.9, 3.4);

  // hands & feet nubs
  ctx.fillStyle = acc;
  for (const pt of [j.handF, j.footF]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.6, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.85;
  for (const pt of [j.handB, j.footB]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** tiny portrait for the roster cards */
function drawPortrait(canvasEl, def) {
  const g = canvasEl.getContext('2d');
  const S = 2;
  canvasEl.width = 54 * S;
  canvasEl.height = 54 * S;
  g.scale(S, S);
  g.clearRect(0, 0, 54, 54);
  g.strokeStyle = def.color;
  g.lineCap = 'round';
  // stylized fighting stance
  const seg = (x1, y1, x2, y2, w) => {
    g.lineWidth = w * 2.2; g.globalAlpha = 0.35;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.lineWidth = w; g.globalAlpha = 1;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  seg(27, 12, 27, 28, 5);    // torso
  seg(27, 12, 27, 12, 0);    // noop
  seg(27, 28, 20, 44, 4);    // leg B
  seg(27, 28, 35, 44, 4);    // leg F
  seg(27, 15, 37, 22, 3.4);  // arm F
  seg(27, 16, 18, 24, 3.4);  // arm B
  g.fillStyle = def.color;
  g.beginPath(); g.arc(29, 8, 5.4, 0, TAU); g.fill();
  g.fillStyle = def.accent;
  g.beginPath(); g.arc(38, 22, 2.6, 0, TAU); g.fill();
  g.beginPath(); g.arc(14, 25, 2.2, 0, TAU); g.fill();
}


/** translucent neon afterimage from a pose snapshot (dash / NOVA trails) */
function drawGhostBody(ctx, g) {
  const j = g.joints;
  const a = Math.max(0, (g.life / g.max) * 0.45);
  ctx.globalAlpha = a;
  const segs = [
    [j.neck, j.hip, 9], [j.hip, j.kneeF, 7], [j.kneeF, j.footF, 6],
    [j.hip, j.kneeB, 7], [j.kneeB, j.footB, 6],
    [j.shoulderF, j.elbowF, 6], [j.elbowF, j.handF, 5],
    [j.shoulderB, j.elbowB, 6], [j.elbowB, j.handB, 5]
  ];
  for (const [p, q, w] of segs) limb(ctx, p, q, g.col, w);
  ctx.fillStyle = g.col;
  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, BODY.headR * 0.9, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}
