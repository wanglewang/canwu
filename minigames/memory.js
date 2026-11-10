'use strict';

// 记序复现（背功法口诀 / 静心诀专属）：记住闪烁次序再依次点回，比通关轮数。
// 本门机制「不示序号」：闪烁时只显口诀印记、不标先后，格子一轮内不重复，全凭记住次序。
// 踩错一次即散功（精通以上多一盏心神）。

const C = require('./common.js');

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const startLen = Math.min(p.grid || 9, (p.startLen || 2) + (hard ? 1 : 0));
  const flashMs = Math.max(260, (p.flashMs || 560) - (hard ? 130 : 0) + (perks.easy ? 90 : 0));
  const gapMs = p.gapMs || 260;
  const maxRound = p.maxRound || 7;
  const glyph = theme.glyph || '诀';
  const vm = C.makeVm(p.cols || 3, p.grid || 9, '凝神记住闪过的次序…', ctx.tip || '看清顺序，依次点回去');
  vm.timeText = '第 1 / ' + maxRound + ' 轮';
  vm.scoreText = '连对 0';
  vm.extras.showMeter = true;
  vm.goal = C.goalFor('C', 6, '轮');

  const bag = C.TimerBag();
  const maxLives = 1;
  let lives = Math.max(maxLives, perks.easy ? 2 : 1);
  let sequence = [];
  let inputIndex = 0;
  let round = 1;
  let accepting = false;
  let done = false;
  let started = false;

  vm.extras.showHearts = lives > 1;
  vm.hearts = { value: lives, max: lives };

  function render() { ctx.render(vm); }

  function syncHud() {
    const completed = round - 1;
    vm.timeText = '第 ' + Math.min(round, maxRound) + ' / ' + maxRound + ' 轮';
    vm.scoreText = '连对 ' + completed;
    vm.progress = C.pct(completed, maxRound);
    vm.progressText = completed + ' / ' + maxRound + ' 轮';
    vm.gradeNow = C.gradeBy(completed, 6, 4, 2);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, 6 - completed), '轮');
    vm.hearts = { value: lives, max: vm.hearts ? vm.hearts.max : lives };
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    accepting = false;
    vm.banner = grade === 'S' ? (theme.praise || '倒背如流') : '';
    render();
    ctx.finish({ grade: grade, score: round - 1, summary: summary });
  }

  function pool(grid) {
    const a = [];
    for (let i = 0; i < grid; i += 1) a.push(i);
    return C.shuffle(a);
  }

  function flashStep(i) {
    if (done || vm.phase !== 'flashing') return;
    C.clearCells(vm.cells);
    if (i >= sequence.length) {
      vm.phase = 'input';
      accepting = true;
      inputIndex = 0;
      vm.status = '第 ' + round + ' 轮 · 请依次点出';
      vm.meter = { label: '该复述', value: 0, max: sequence.length };
      C.clearCells(vm.cells);
      render();
      return;
    }
    const idx = sequence[i];
    vm.cells[idx].cls = 'cell cell--lit';
    vm.cells[idx].label = glyph;
    vm.meter = { label: '口诀次第', value: i + 1, max: sequence.length };
    render();
    bag.after(function () {
      if (done || vm.phase !== 'flashing') return;
      C.clearCells(vm.cells);
      render();
      bag.after(function () { flashStep(i + 1); }, gapMs);
    }, flashMs);
  }

  function beginRound() {
    if (done) return;
    accepting = false;
    const len = Math.min(p.grid || 9, startLen + round - 1);
    sequence = pool(p.grid || 9).slice(0, len);
    vm.phase = 'flashing';
    vm.status = '第 ' + round + ' 轮 · 记住顺序';
    vm.banner = '';
    vm.meter = { label: '口诀次第', value: 0, max: len };
    syncHud();
    C.clearCells(vm.cells);
    render();
    bag.after(function () { flashStep(0); }, 500);
  }

  function start() {
    if (started) return;
    started = true;
    beginRound();
  }

  function tap(index) {
    if (done || !accepting || vm.phase !== 'input') return;
    if (index === sequence[inputIndex]) {
      inputIndex += 1;
      vm.cells[index].cls = 'cell cell--ok';
      vm.cells[index].label = glyph;
      vm.meter = { label: '该复述', value: inputIndex, max: sequence.length };
      if (inputIndex >= sequence.length) {
        accepting = false;
        C.flash(vm, theme.hit || '口诀无误', 'good');
        vm.combo = round;
        vm.comboText = '连对 ×' + round;
        if (round >= maxRound) {
          finishOnce('S', (theme.praise || '倒背如流') + '，' + round + ' 轮全过');
          return;
        }
        vm.status = '第 ' + round + ' 轮 · 对了';
        syncHud();
        render();
        const finishedRound = round;
        bag.after(function () {
          if (done) return;
          round = finishedRound + 1;
          C.clearCells(vm.cells);
          beginRound();
        }, 650);
      } else {
        render();
      }
      return;
    }
    lives -= 1;
    vm.combo = 0;
    vm.comboText = '';
    vm.cells[index].cls = 'cell cell--bad';
    vm.status = theme.miss || '记岔了一次';
    vm.hearts = { value: Math.max(0, lives), max: vm.hearts ? vm.hearts.max : lives };
    C.flash(vm, theme.miss || '记岔了', 'bad');
    render();
    if (lives <= 0) {
      finishOnce(C.gradeBy(round - 1, 6, 4, 2), '复述至第 ' + round + ' 轮');
      return;
    }
    bag.after(function () {
      if (done) return;
      inputIndex = 0;
      accepting = true;
      vm.status = '再试一遍这一轮';
      vm.meter = { label: '该复述', value: 0, max: sequence.length };
      C.clearCells(vm.cells);
      render();
    }, 550);
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'memory', name: '记序复现', create: create };
