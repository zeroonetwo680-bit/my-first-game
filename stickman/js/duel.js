/* STICKMAN — one-on-one sword duel. A separate side-view mode: the house,
 * weapons, enemies and saved progression are not modified by a match. */
'use strict';

var Duel = {
  phase: 'idle',
  player: null,
  rival: null,
  clock: 90,
  result: '',
  mouseBlock: false,
  touch: { left: false, right: false, block: false },

  fighter: function (x, cpu) {
    return { x: x, hp: 100, guard: 100, block: false, broken: 0,
      vx: 0, facing: cpu ? -1 : 1, phase: 0, gait: 0, hurt: 0,
      attack: null, attackCd: 0, dodgeT: 0, dodgeCd: 0,
      cpu: cpu, think: 0.45, defendT: 0 };
  },

  start: function () {
    Game.reset('duel');
    this.player = this.fighter(410, false);
    this.rival = this.fighter(870, true);
    this.clock = 90; this.phase = 'fight'; this.result = ''; this.mouseBlock = false;
    this.touch = { left: false, right: false, block: false };
    Input.keys = Object.create(null); Input.mouse.down = false;
  },

  exit: function () {
    this.phase = 'idle'; this.mouseBlock = false;
    this.touch = { left: false, right: false, block: false };
    Input.keys = Object.create(null); Input.mouse.down = false;
    Game.reset('menu');
  },

  pause: function () {
    if (this.phase === 'fight') { this.phase = 'paused'; this.mouseBlock = false; this.touch = { left: false, right: false, block: false }; }
    else if (this.phase === 'paused') this.phase = 'fight';
  },

  strike: function (f) {
    if (this.phase !== 'fight' || !f || f.attack || f.attackCd > 0 || f.dodgeT > 0 || f.block || f.broken > 0) return false;
    f.attack = { move: 'sword', aim: f.facing === 1 ? 0 : Math.PI,
      time: 0, duration: 0.48, hit: false };
    f.attackCd = 0.58;
    if (typeof Sfx.swing === 'function') Sfx.swing('sword');
    return true;
  },

  dodge: function (f, direction) {
    if (this.phase !== 'fight' || !f || f.dodgeCd > 0 || f.dodgeT > 0 || f.attack || f.broken > 0) return false;
    f.block = false; f.dodgeT = 0.23; f.dodgeCd = 1.0;
    f.vx = (direction || -f.facing) * 690;
    if (typeof Sfx.dash === 'function') Sfx.dash();
    return true;
  },

  hit: function (attacker, defender) {
    var a = attacker.attack;
    if (!a || a.hit) return;
    a.hit = true;
    var direction = Math.cos(a.aim) >= 0 ? 1 : -1;
    var delta = defender.x - attacker.x;
    // A strike must face its target, be in reach, and meet no dodge i-frames.
    if (Math.abs(delta) > 172 || delta * direction <= 0 || defender.dodgeT > 0) return;
    if (defender.block && defender.guard > 0 && defender.broken <= 0) {
      defender.guard = Math.max(0, defender.guard - 30);
      defender.hurt = 0.08;
      if (defender.guard <= 0) { defender.broken = 1.0; defender.block = false; }
      if (typeof Sfx.hit === 'function') Sfx.hit();
      return;
    }
    defender.hp = Math.max(0, defender.hp - 20);
    defender.hurt = 0.22;
    defender.x = clamp(defender.x + direction * 17, 100, W - 100);
    if (typeof Sfx.hit === 'function') Sfx.hit();
  },

  update: function (dt) {
    if (this.phase !== 'fight') return;
    dt = Math.min(0.05, dt);
    var p = this.player, e = this.rival;
    this.clock = Math.max(0, this.clock - dt);
    var fighters = [p, e];
    for (var i = 0; i < fighters.length; i++) {
      var f = fighters[i];
      f.hurt = Math.max(0, f.hurt - dt);
      f.broken = Math.max(0, f.broken - dt);
      f.attackCd = Math.max(0, f.attackCd - dt);
      f.dodgeCd = Math.max(0, f.dodgeCd - dt);
      if (f.dodgeT > 0) {
        f.dodgeT = Math.max(0, f.dodgeT - dt);
        f.x += f.vx * dt;
      } else f.vx = 0;
      if (!f.attack) f.facing = (f === p ? e.x - p.x : p.x - e.x) >= 0 ? 1 : -1;
    }

    var move = ((Input.down('KeyD') || Input.down('ArrowRight') || this.touch.right) ? 1 : 0) -
      ((Input.down('KeyA') || Input.down('ArrowLeft') || this.touch.left) ? 1 : 0);
    p.block = (Input.down('KeyS') || Input.down('ArrowDown') || this.touch.block || this.mouseBlock) &&
      p.guard > 0 && p.broken <= 0 && !p.attack && p.dodgeT <= 0;
    if (p.dodgeT <= 0 && !p.block && p.broken <= 0) p.x += move * (p.attack ? 70 : 235) * dt;
    p.gait = p.dodgeT > 0 || (move && !p.block) ? 1 : 0;
    p.phase += dt * (p.gait ? 12 : 2);

    e.defendT = Math.max(0, e.defendT - dt);
    e.block = e.defendT > 0 && e.guard > 0 && e.broken <= 0 && !e.attack && e.dodgeT <= 0;
    var distance = Math.abs(e.x - p.x);
    if (!e.attack && !e.block && e.dodgeT <= 0 && e.broken <= 0) {
      if (distance > 150) e.x += e.facing * 155 * dt;
      else if (distance < 90) e.x -= e.facing * 65 * dt;
    }
    e.gait = e.dodgeT > 0 || (!e.attack && !e.block && (distance > 150 || distance < 90)) ? 1 : 0;
    e.phase += dt * (e.gait ? 10 : 2);
    e.think -= dt;
    if (e.think <= 0) {
      e.think = 0.28 + Math.random() * 0.22;
      if (p.attack && distance < 185 && !e.attack && e.guard > 20 && Math.random() < 0.4) {
        e.defendT = 0.48;
      } else if (distance < 170 && !e.block && !e.attack && e.attackCd <= 0) {
        this.strike(e);
      }
    }

    p.x = clamp(p.x, 100, W - 100); e.x = clamp(e.x, 100, W - 100);
    if (Math.abs(p.x - e.x) < 70) {
      var mid = (p.x + e.x) / 2, sign = p.x <= e.x ? -1 : 1;
      p.x = clamp(mid + sign * 35, 100, W - 100);
      e.x = clamp(mid - sign * 35, 100, W - 100);
    }
    for (i = 0; i < fighters.length; i++) {
      f = fighters[i];
      if (!f.block) f.guard = Math.min(100, f.guard + 18 * dt);
      if (f.attack) {
        f.attack.time += dt;
        if (f.attack.time / f.attack.duration >= 0.45) this.hit(f, f === p ? e : p);
        if (f.attack.time >= f.attack.duration) f.attack = null;
      }
    }
    if (p.hp <= 0 || e.hp <= 0 || this.clock <= 0) {
      this.phase = 'over';
      this.result = p.hp === e.hp ? 'DRAW' : (p.hp > e.hp ? 'YOU WIN' : 'YOU LOSE');
    }
  },

  drawFighter: function (ctx, f) {
    var aim = f.facing === 1 ? 0 : Math.PI;
    var attack = f.attack;
    if (attack) aim = attack.aim;
    var pose = Rig.pose({ x: f.x, y: 540, size: 210, phase: f.phase, gait: f.gait,
      t: Game.t, seed: f.cpu ? 11 : 7, aim: aim, attack: attack,
      crouch: f.dodgeT > 0 ? 0.55 : 0, lean: f.dodgeT > 0 ? f.facing * 0.5 : 0 });
    Rig.draw(ctx, pose, { color: '#252428', lw: 7, scarf: f.cpu ? '#666c78' : '#c42d32',
      t: Game.t, flash: f.hurt > 0 ? 'rgba(208,52,53,0.75)' : null,
      alpha: f.dodgeT > 0 ? 0.65 : 1, face: true });
    var hand = pose.armPairs[0].right.hand;
    var angle = aim;
    if (attack) angle = aim - 1.15 + 2.3 * clamp(attack.time / attack.duration, 0, 1);
    ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(angle);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#252428'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.strokeStyle = f.cpu ? '#666c78' : '#c42d32'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(2, 0); ctx.stroke();
    ctx.strokeStyle = '#252428'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, -11); ctx.lineTo(8, 11); ctx.stroke();
    ctx.fillStyle = '#fffdf6'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(9, -5); ctx.lineTo(78, -3); ctx.lineTo(92, 0);
    ctx.lineTo(78, 3); ctx.lineTo(9, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (attack) {
      var t = clamp(attack.time / attack.duration, 0, 1);
      if (t > 0.18 && t < 0.82) {
        ctx.save(); ctx.globalAlpha = Math.sin((t - 0.18) / 0.64 * Math.PI) * 0.75;
        ctx.strokeStyle = f.cpu ? '#5c6370' : '#bc3033'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(pose.shoulder.x, pose.shoulder.y, 155,
          aim - 1.15, aim - 1.15 + 2.3 * t); ctx.stroke(); ctx.restore();
      }
    }
    if (f.block) {
      ctx.save(); ctx.strokeStyle = f.cpu ? '#777e88' : '#bd3032'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(pose.shoulder.x + f.facing * 45, pose.shoulder.y + 12, 55,
        f.facing === 1 ? -1.1 : Math.PI - 1.1, f.facing === 1 ? 1.1 : Math.PI + 1.1); ctx.stroke(); ctx.restore();
    }
    if (f.broken > 0) {
      ctx.fillStyle = '#b82d32'; ctx.textAlign = 'center'; ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillText('GUARD BROKEN', f.x, 285);
    }
  },

  render: function (ctx) {
    if (!ctx || !this.player) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Game.canvas.width || W, Game.canvas.height || H);
    ctx.setTransform(Game.viewScale || 1, 0, 0, Game.viewScale || 1, Game.viewX || 0, Game.viewY || 0);
    Game.drawPaper(ctx);
    // A readable side-view dojo, with no obstacles or hidden collision shapes.
    ctx.fillStyle = 'rgba(115,97,80,0.065)'; ctx.fillRect(120, 190, 1040, 370);
    ctx.strokeStyle = 'rgba(65,55,50,0.25)'; ctx.lineWidth = 3; ctx.strokeRect(120, 190, 1040, 370);
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(120, 540); ctx.lineTo(1160, 540); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,48,50,0.2)'; ctx.beginPath(); ctx.arc(640, 350, 105, 0, TAU); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(45,40,40,0.35)'; ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText('SWORD DOJO', 640, 218);
    this.drawFighter(ctx, this.player); this.drawFighter(ctx, this.rival);

    function bar(x, label, f, right) {
      ctx.fillStyle = 'rgba(255,253,246,0.9)'; ctx.fillRect(x, 24, 400, 70);
      ctx.strokeStyle = 'rgba(45,40,40,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x, 24, 400, 70);
      ctx.textAlign = right ? 'right' : 'left'; ctx.fillStyle = '#28272a';
      ctx.font = 'bold 15px ui-monospace, monospace'; ctx.fillText(label, right ? x+386 : x+14, 45);
      ctx.fillStyle = '#d2cec5'; ctx.fillRect(x+14, 53, 372, 13);
      ctx.fillStyle = right ? '#606979' : '#ba3033';
      var width = 372 * f.hp / 100; ctx.fillRect(right ? x+386-width : x+14, 53, width, 13);
      ctx.fillStyle = '#c9c3b9'; ctx.fillRect(x+14, 74, 372, 6);
      ctx.fillStyle = '#79766c'; width = 372 * f.guard / 100;
      ctx.fillRect(right ? x+386-width : x+14, 74, width, 6);
      ctx.fillStyle = '#817b72'; ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText('GUARD', right ? x+386 : x+14, 90);
    }
    bar(32, 'YOU', this.player, false); bar(848, 'CPU', this.rival, true);
    ctx.textAlign = 'center'; ctx.fillStyle = '#28272a'; ctx.font = 'bold 29px ui-monospace, monospace';
    ctx.fillText(String(Math.ceil(this.clock)).padStart(2, '0'), 640, 61);
    ctx.fillStyle = '#827a70'; ctx.font = 'bold 11px ui-monospace, monospace'; ctx.fillText('SECONDS', 640, 80);
    ctx.fillStyle = '#4a4642'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText('A / D  MOVE    •    F  SLASH    •    HOLD S  BLOCK    •    SHIFT  DODGE', 640, 615);
    ctx.fillStyle = this.player.dodgeCd > 0 ? '#a09a91' : '#ac3032';
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillText(this.player.dodgeCd > 0 ? 'DODGE RECHARGING' : 'DODGE READY', 640, 585);
    ctx.fillStyle = '#827a70'; ctx.font = '12px ui-monospace, monospace'; ctx.fillText('P: PAUSE     ESC: MAIN MENU', 640, 643);
    if (this.phase === 'paused' || this.phase === 'over') {
      ctx.fillStyle = 'rgba(244,241,232,0.94)'; ctx.fillRect(260, 220, 760, 320);
      ctx.strokeStyle = 'rgba(38,35,32,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(260, 220, 760, 320);
      ctx.textAlign = 'center'; ctx.fillStyle = '#222126'; ctx.font = 'bold 48px ui-monospace, monospace';
      ctx.fillText(this.phase === 'paused' ? 'PAUSED' : this.result, 640, 320);
      ctx.font = 'bold 15px ui-monospace, monospace'; ctx.fillStyle = '#a82d30';
      if (this.phase === 'paused') ctx.fillText('PRESS P TO CONTINUE  /  ESC TO MENU', 640, 390);
      else {
        ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#4b4540'; ctx.lineWidth = 2;
        ctx.fillRect(380, 400, 240, 55); ctx.strokeRect(380, 400, 240, 55);
        ctx.fillRect(660, 400, 240, 55); ctx.strokeRect(660, 400, 240, 55);
        ctx.fillStyle = '#a82d30'; ctx.fillText('ENTER  /  RETRY', 500, 433);
        ctx.fillStyle = '#343034'; ctx.fillText('ESC  /  MENU', 780, 433);
      }
    }
    ctx.restore();
  }
};
