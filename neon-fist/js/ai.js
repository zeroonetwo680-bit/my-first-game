/* ============================================================
   NEON FIST — CPU opponent
   Emits the same input object a human would: {left,right,block,
   punch,kick,special,dash}. Personality + difficulty scale.
   ============================================================ */
'use strict';

const DIFFS = {
  easy:   { label: 'EASY',   tick: 0.16, blockProb: 0.1,  aggression: 0.5, retreat: 0.35, dashUse: 0.05, specUse: 0.3 },
  normal: { label: 'NORMAL', tick: 0.11, blockProb: 0.3,  aggression: 0.75, retreat: 0.22, dashUse: 0.15, specUse: 0.7 },
  hard:   { label: 'HARD',   tick: 0.07, blockProb: 0.55, aggression: 0.95, retreat: 0.12, dashUse: 0.3,  specUse: 0.95 }
};

const AI = {
  new(me, opp, diff) {
    return {
      me, opp,
      cfg: DIFFS[diff] || DIFFS.normal,
      timer: 0,
      input: { left: false, right: false, block: false, punch: false, kick: false, special: false, dash: false },
      blockHold: 0,
      retreatT: 0,
      seed: rand(1000)
    };
  },

  /** produce input for one frame; internally ticks decisions */
  update(ai, dt, time) {
    const inp = ai.input;
    inp.punch = false; inp.kick = false; inp.special = false; inp.dash = false;

    ai.timer -= dt;
    if (ai.blockHold > 0) {
      ai.blockHold -= dt;
      inp.block = true;
      inp.left = inp.right = false;
      return inp;
    }
    inp.block = false;
    if (ai.retreatT > 0) ai.retreatT -= dt;

    if (ai.timer > 0) {
      // keep executing current horizontal intent between ticks
      if (ai._moving !== 0) {
        inp.left = ai._moving < 0;
        inp.right = ai._moving > 0;
      }
      return inp;
    }
    ai.timer = ai.cfg.tick * rand(0.8, 1.25);

    const me = ai.me, opp = ai.opp;
    if (me.state === 'ko' || me.state === 'hit') {
      inp.left = inp.right = false;
      return inp;
    }

    const dx = opp.x - me.x;
    const dist = Math.abs(dx);
    const towardMe = Math.sign(dx) || 1;
    const cfg = ai.cfg;

    // react to incoming attack: block (skill-based)
    if ((opp.state === 'punch' || opp.state === 'kick') && opp.st < opp.def.punch.startup + 0.02) {
      if (dist < Math.max(opp.def.punch.reach, opp.def.kick.reach) + 40 && Math.random() < cfg.blockProb) {
        ai.blockHold = rand(0.25, 0.5);
        inp.block = true;
        return inp;
      }
    }

    // special when ready
    if (me.meter >= 100 && dist > 160 && Math.random() < cfg.specUse) {
      inp.special = true;
      return inp;
    }

    const inPunchRange = dist < me.def.punch.reach + 26;
    const inKickRange = dist < me.def.kick.reach + 26;

    if (inPunchRange || inKickRange) {
      // fight or brief retreat
      const r = Math.random();
      if (r < cfg.retreat) {
        ai.retreatT = rand(0.2, 0.45);
        ai._moving = -towardMe;
        inp.left = ai._moving < 0;
        inp.right = ai._moving > 0;
        return inp;
      }
      if (me.meter >= 100 && Math.random() < cfg.specUse * 0.8) {
        inp.special = true;
        return inp;
      }
      if (inKickRange && Math.random() < 0.42) inp.kick = true;
      else inp.punch = true;
      ai._moving = 0;
      inp.left = inp.right = false;
      return inp;
    }

    // approach — occasionally dash in
    if (dist > 300 && Math.random() < cfg.dashUse) {
      inp.dash = true;
      inp.left = towardMe < 0;
      inp.right = towardMe > 0;
      return inp;
    }
    ai._moving = towardMe;
    inp.left = towardMe < 0;
    inp.right = towardMe > 0;
    return inp;
  }
};
