/* ============================================================
   NEON WRECKAGE — achievements (persisted, toast notifications)
   ============================================================ */
'use strict';

const Achievements = {
  defs: [
    { id: 'first-blood',   icon: '\u{1FA78}', name: 'FIRST BLOOD',     desc: 'Wreck your first rival' },
    { id: 'combo-4',       icon: '\u26D3\uFE0F',  name: 'CHAIN GANG',      desc: 'Reach a x4 kill combo' },
    { id: 'combo-8',       icon: '\uD83D\uDD25',  name: 'UNSTOPPABLE',     desc: 'Reach the max x8 combo' },
    { id: 'kills-100',     icon: '\uD83D\uDC80',  name: 'DEMOLITION TOUR', desc: 'Wreck 100 rivals in total' },
    { id: 'kills-500',     icon: '\uD83C\uDFED\uFE0F', name: 'SCRAP TYCOON', desc: 'Wreck 500 rivals in total' },
    { id: 'wave-5',        icon: '\uD83C\uDFC1',  name: 'WARM-UP DONE',    desc: 'Clear wave 5' },
    { id: 'wave-10',       icon: '\uD83E\uDD47',  name: 'ARENA VETERAN',   desc: 'Clear wave 10' },
    { id: 'wave-20',       icon: '\uD83D\uDC51',  name: 'NEON LEGEND',     desc: 'Clear wave 20' },
    { id: 'boss-1',        icon: '\u2694\uFE0F',  name: 'WARLORD SLAYER',  desc: 'Take down your first WARLORD' },
    { id: 'boss-3',        icon: '\uD83D\uDDE1\uFE0F', name: 'THRONE TOPPLER', desc: 'Destroy 3 WARLORDs in total' },
    { id: 'score-25k',     icon: '\uD83D\uDC8E',  name: 'HIGH ROLLER',     desc: 'Score 25,000 in one run' },
    { id: 'score-100k',    icon: '\uD83C\uDFC6',  name: 'JACKPOT',         desc: 'Score 100,000 in one run' },
    { id: 'flawless-5',    icon: '\u2728',        name: 'PERFECT FIVE',    desc: 'Clear 5 waves in a row without hull damage' },
    { id: 'rocket-ace',    icon: '\uD83D\uDE80',  name: 'ROCKET ACE',      desc: 'Kill 2+ rivals with a single rocket' },
    { id: 'bomber-juggler',icon: '\uD83D\uDCA3',  name: 'HOT POTATO',      desc: 'Survive 10 bomber detonations' },
    { id: 'garage-king',   icon: '\uD83D\uDDDD\uFE0F', name: 'GARAGE KING', desc: 'Own every car in the garage' }
  ],

  byId: {},
  unlocked: store.get('nw.ach', {}),
  stats: Object.assign({ kills: 0, bosses: 0, bombed: 0 }, store.get('nw.stats', {})),
  queue: [],
  showing: false,
  showT: 0,
  hideT: 0,

  init() {
    for (const d of this.defs) this.byId[d.id] = d;
    this.renderGrid();
  },

  has(id) { return !!this.unlocked[id]; },

  unlock(id) {
    if (this.unlocked[id] || !this.byId[id]) return;
    this.unlocked[id] = Date.now();
    store.set('nw.ach', this.unlocked);
    this.queue.push(this.byId[id]);
    AudioSys.achieve();
  },

  /* ---------------- event hooks (called by Game) ---------------- */
  onKill(e) {
    this.stats.kills++;
    if (this.stats.kills >= 1) this.unlock('first-blood');
    if (this.stats.kills >= 100) this.unlock('kills-100');
    if (this.stats.kills >= 500) this.unlock('kills-500');
    if (Game.combo >= 4) this.unlock('combo-4');
    if (Game.combo >= 8) this.unlock('combo-8');
  },

  onMultiRocket(n) {
    if (n >= 2) this.unlock('rocket-ace');
  },

  onBoss() {
    this.stats.bosses++;
    this.unlock('boss-1');
    if (this.stats.bosses >= 3) this.unlock('boss-3');
    this.save();
  },

  onBombed() {
    this.stats.bombed++;
    if (this.stats.bombed >= 10) this.unlock('bomber-juggler');
  },

  onWave(n, flawlessStreak) {
    if (n >= 5) this.unlock('wave-5');
    if (n >= 10) this.unlock('wave-10');
    if (n >= 20) this.unlock('wave-20');
    if (flawlessStreak >= 5) this.unlock('flawless-5');
    this.save();
  },

  onGameOver(score) {
    if (score >= 25000) this.unlock('score-25k');
    if (score >= 100000) this.unlock('score-100k');
    this.checkGarage();
    this.save();
  },

  checkGarage() {
    if (typeof Game === 'undefined' || !Game.carList) return;
    const all = Game.carList().every(id => !!Game.unlocked[id]);
    if (all) this.unlock('garage-king');
  },

  save() { store.set('nw.stats', this.stats); },

  /* ---------------- UI ---------------- */
  renderGrid() {
    const el = document.getElementById('ach-grid');
    if (!el) return;
    let html = '';
    let count = 0;
    for (const d of this.defs) {
      const got = !!this.unlocked[d.id];
      if (got) count++;
      html += '<div class="ach-tile' + (got ? ' got' : '') + '" title="' + escapeHtml(d.desc) + '">' +
        '<span class="ic">' + d.icon + '</span>' +
        '<span class="nm">' + d.name + '</span></div>';
    }
    el.innerHTML = html;
    const c = document.getElementById('ach-count');
    if (c) c.textContent = count + '/' + this.defs.length;
  },

  /** toast sequencer — call every frame */
  update(dt) {
    if (this.showing) {
      this.showT -= dt;
      if (this.showT <= 0) {
        const el = document.getElementById('ach-toast');
        if (el) el.classList.remove('show');
        this.showing = false;
        this.hideT = 0.4;
      }
    } else if (this.queue.length) {
      this.hideT -= dt;
      if (this.hideT <= 0) {
        const d = this.queue.shift();
        const el = document.getElementById('ach-toast');
        if (el) {
          const ic = el.querySelector('.ic');
          const nm = document.getElementById('ach-name');
          if (ic) ic.textContent = d.icon;
          if (nm) nm.textContent = d.name;
          el.classList.remove('show');
          void el.offsetWidth;
          el.classList.add('show');
        }
        this.showing = true;
        this.showT = 2.4;
      }
    }
  }
};
