'use strict';

// 辨伪择真（辨锋截击 / 剑诀·断岳专属）：每轮同时亮起数道剑光，只有一道是真招，其余是虚影。
// 与「顺光扫斩」的区别：那边是顺着一道流动的刀路把刀扫到靶心，这里是多目标里辨真伪，截错要倒扣分数与时间。
// 盘面 4×3、有虚影、连截提速，规则和观感都与循光斩桩不同。

const C = require('./common.js');

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const duration = Math.max(9, (p.duration || 16) + (perks.easy ? 3 : 0) - (hard ? 2 : 0));
  const baseInterval = Math.max(420, (p.interval || 1000) + (perks.easy ? 160 : 0) - (hard ? 180 : 0));
  const grid = p.grid || 12;
  const decoys = Math.min(grid - 1, (p.decoys || 2) + (hard ? 1 : 0));
  const sLimit = Math.ceil(duration * 0.8);
  const aLimit = Math.ceil(duration * 0.6);
  const bLimit = Math.ceil(duration * 0.35);
  const vm = C.makeVm(p.cols || 4, grid, '凝神，辨出哪一道是真招', ctx.tip || '只截真招，虚影是陷阱');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '截击 0';
  vm.extras.showCombo = true;
  vm.goal = C.goalFor('C', sLimit, '道剑光');

  const bag = C.TimerBag();
  let real = -1;
  let lit = [];
  let score = 0;
  let combo = 0;
  let fast = false;
  let left = duration;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '截击 ' + score;
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连截 ×' + combo : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '道剑光');
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '后发先至') : '';
    render();
    ctx.finish({ grade: grade, score: score, summary: summary });
  }

  function clearLit() {
    for (let i = 0; i < lit.length; i += 1) {
      vm.cells[lit[i]].label = '';
      vm.cells[lit[i]].cls = 'cell';
    }
    lit = [];
  }

  function nextRound() {
    // 上一轮真宝没被点到（自动换轮），连夺就断了；点中后主动换轮不清连击。
    if (real >= 0) combo = 0;
    clearLit();
    const pool = C.shuffle((function () {
      const a = [];
      for (let i = 0; i < grid; i += 1) a.push(i);
      return a;
    })());
    real = pool[0];
    for (let i = 0; i <= decoys; i += 1) {
      const k = pool[i];
      lit.push(k);
      if (i === 0) {
        vm.cells[k].cls = 'cell cell--gold' + (fast ? ' cell--hot' : '');
        vm.cells[k].label = theme.glyph || '剑';
      } else {
        vm.cells[k].cls = 'cell cell--decoy';
        vm.cells[k].label = '影';
      }
    }
    syncHud();
    render();
  }

  function intervalNow() { return fast ? Math.max(400, Math.round(baseInterval * 0.72)) : baseInterval; }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '剑光乱眼，辨清再出手';
    vm.banner = theme.banner || '剑光乱眼';
    nextRound();
    bag.every(function () {
      left -= 1;
      syncHud();
      if (left <= 0) {
        finishOnce(C.gradeBy(score, sLimit, aLimit, bLimit), '截住 ' + score + ' 道真招');
        return;
      }
      render();
    }, 1000);
    bag.everyFlex(nextRound, intervalNow);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (index === real) {
      score += 1;
      combo += 1;
      C.flash(vm, (theme.hit || '截住真招') + (combo >= 3 ? ' · 连夺 ×' + combo : ''), 'gold');
      if (combo >= 4 && !fast) {
        fast = true;
        vm.banner = '剑势已起 · 剑光更快';
      }
      vm.status = combo >= 3 ? '手稳，别被影子骗了' : '好，再看下一道';
      real = -1;
      nextRound();
      return;
    }
    score = Math.max(0, score - 1);
    left = Math.max(1, left - 1);
    combo = 0;
    fast = false;
    vm.cells[index].cls = 'cell cell--bad';
    vm.cells[index].label = '';
    vm.status = theme.miss || '误截虚影';
    C.flash(vm, '截错 -1 · 少一息', 'bad');
    syncHud();
    const i = index;
    bag.after(function () {
      if (done || vm.phase !== 'playing') return;
      if (lit.indexOf(i) < 0) { vm.cells[i].cls = 'cell'; render(); }
    }, 240);
    render();
  }

  nextRound();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'hunt', name: '辨伪择真', create: create };
