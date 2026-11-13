'use strict';

// 五行相生（排布阵灯 / 五行诀专属）：五盏阵灯围成一环，中央亮出当前一行，
// 要按「木生火、火生土、土生金、金生水、水生木」点出它的相生之位。
// 与「阵灯推演」的区别：阵灯推演是点一格翻十字的静态解谜；这里是环形反应接龙，
// 连生越长窗口越短，靠的是记生克次序与手速，不是推演步数。

const C = require('./common.js');

const ELEMENTS = ['木', '火', '土', '金', '水'];

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const duration = Math.max(12, (p.duration || 20) + (perks.easy ? 4 : 0) - (hard ? 2 : 0));
  const goal = (p.chainGoal || 10) + (hard ? 2 : 0);
  const startWindow = Math.max(1200, (p.windowMs || 2600) - (hard ? 400 : 0) + (perks.easy ? 400 : 0));
  const minWindow = 1100;
  const vm = C.makeVm(0, 0, '看中央一行，点它的相生之位', ctx.tip || '木生火、火生土、土生金、金生水、水生木');
  vm.stage = 'orbit';
  vm.extras.showGrid = false;
  vm.extras.showCombo = true;
  vm.extras.showMeter = true;
  vm.timeText = C.mmss(duration);
  vm.scoreText = '连生 0';
  vm.orbit = {
    lamps: ELEMENTS.map(function (g, i) { return { id: 'e' + i, label: g, tone: i + 1, cls: '' }; }),
    current: 0,
    currentText: ELEMENTS[0],
    chain: 0,
    best: 0,
    windowMs: startWindow,
    rule: '木→火→土→金→水→木',
  };

  const bag = C.TimerBag();
  let left = duration;
  let hits = 0;
  let chain = 0;
  let best = 0;
  let current = 0;
  let windowMs = startWindow;
  let token = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function gradeNow() {
    if (best >= goal) return 'S';
    if (best >= Math.ceil(goal * 0.7)) return 'A';
    if (best >= Math.ceil(goal * 0.4)) return 'B';
    return 'C';
  }

  function paintLamps(hitIndex) {
    for (let i = 0; i < vm.orbit.lamps.length; i += 1) {
      if (i === hitIndex) vm.orbit.lamps[i].cls = 'lamp--hit';
      else if (i === current) vm.orbit.lamps[i].cls = 'lamp--current';
      else vm.orbit.lamps[i].cls = '';
    }
    vm.orbit.current = current;
    vm.orbit.currentText = ELEMENTS[current];
    vm.orbit.chain = chain;
    vm.orbit.best = best;
    vm.orbit.windowMs = windowMs;
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(best, goal);
    vm.progressText = best + ' / ' + goal + ' 连生';
    vm.scoreText = '连生 ' + chain + ' · 最长 ' + best;
    vm.combo = chain;
    vm.comboText = chain >= 2 ? '相生 ×' + chain : '';
    vm.gradeNow = gradeNow();
    vm.goal = chain >= goal ? '已入 S · 稳住这一局' : '再连 ' + (goal - best) + ' 位可入 S';
    vm.meter = { label: '相生之窗', value: Math.round(windowMs / 100) / 10, max: Math.round(startWindow / 100) / 10 };
    vm.hint = vm.costText + ' · 中央 ' + ELEMENTS[current];
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '阵法通明') : '';
    render();
    ctx.finish({ grade: grade, score: best, summary: summary });
  }

  function armWindow() {
    token += 1;
    const mine = token;
    const delay = windowMs;
    bag.after(function () {
      if (done || mine !== token || vm.phase !== 'playing') return;
      chain = 0;
      left = Math.max(1, left - 2);
      current = C.randInt(ELEMENTS.length);
      windowMs = startWindow;
      vm.status = '气机散了，重新起一链';
      C.flash(vm, '相生断了 · 少两息', 'bad');
      paintLamps(-1);
      syncHud();
      render();
      armWindow();
    }, delay);
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '五行轮转，点相生之位';
    vm.banner = theme.banner || '五灯归位';
    current = C.randInt(ELEMENTS.length);
    paintLamps(-1);
    syncHud();
    render();
    bag.every(function () {
      left -= 1;
      syncHud();
      if (left <= 0) {
        finishOnce(gradeNow(), '最长连生 ' + best + ' 位 · 合 ' + hits + ' 次');
        return;
      }
      render();
    }, 1000);
    armWindow();
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (index < 0 || index >= ELEMENTS.length) return;
    const need = (current + 1) % ELEMENTS.length;
    if (index === need) {
      hits += 1;
      chain += 1;
      best = Math.max(best, chain);
      current = index;
      windowMs = Math.max(minWindow, windowMs - 120);
      C.flash(vm, (theme.hit || '五行相生') + (chain >= 4 ? ' · 相生 ×' + chain : ''), 'gold');
      vm.status = chain >= 4 ? '势成了，别断' : '好，接着往下生';
      paintLamps(index);
      syncHud();
      render();
      if (best >= goal) {
        finishOnce('S', '连生 ' + best + ' 位，五灯归位');
        return;
      }
      armWindow();
      return;
    }
    chain = 0;
    left = Math.max(1, left - 1);
    current = C.randInt(ELEMENTS.length);
    windowMs = startWindow;
    vm.status = theme.miss || '生克失序';
    C.flash(vm, '相生断了 · 少一息', 'bad');
    paintLamps(-1);
    syncHud();
    render();
    armWindow();
  }

  paintLamps(-1);
  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'wuxing', name: '五行相生', create: create };
