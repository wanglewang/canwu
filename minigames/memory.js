'use strict';

// A2-23 记忆序列：记住闪烁顺序再复现，比通关轮数。

const C = require('./common.js');

function create(ctx) {
  const p = ctx.params;
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const startLen = Math.min(p.grid, p.startLen + (hard ? 1 : 0));
  const flashMs = Math.max(260, p.flashMs - (hard ? 130 : 0) + (perks.easy ? 90 : 0));
  const gapMs = p.gapMs;
  const maxRound = p.maxRound;
  const vm = C.makeVm(p.cols, p.grid, '凝神记住闪烁的次序…', ctx.tip || '看清顺序，依次点回去');
  vm.timeText = '第 1 / ' + maxRound + ' 轮';
  vm.scoreText = '连对 0';

  const bag = C.TimerBag();
  let sequence = [];
  let inputIndex = 0;
  let round = 1;
  let accepting = false;
  let lives = perks.easy ? 2 : 1;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    accepting = false;
    render();
    ctx.finish({ grade: grade, score: round - 1, summary: summary });
  }

  function flashStep(i) {
    if (done || vm.phase !== 'flashing') return;
    C.clearCells(vm.cells);
    if (i >= sequence.length) {
      vm.phase = 'input';
      accepting = true;
      inputIndex = 0;
      vm.status = '第 ' + round + ' 轮 · 请依次点出';
      render();
      return;
    }
    const idx = sequence[i];
    vm.cells[idx].cls = 'cell cell--lit';
    vm.cells[idx].label = String(i + 1);
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
    const len = Math.min(p.grid, startLen + round - 1);
    sequence = [];
    for (let i = 0; i < len; i += 1) sequence.push(C.randInt(p.grid));
    vm.phase = 'flashing';
    vm.timeText = '第 ' + round + ' / ' + maxRound + ' 轮';
    vm.scoreText = '连对 ' + (round - 1);
    vm.status = '第 ' + round + ' 轮 · 记住顺序';
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
      vm.cells[index].cls = 'cell cell--ok';
      vm.cells[index].label = String(inputIndex + 1);
      inputIndex += 1;
      if (inputIndex >= sequence.length) {
        accepting = false;
        vm.scoreText = '连对 ' + round;
        if (round >= maxRound) {
          finishOnce('S', '口诀倒背如流，' + round + ' 轮全过');
          return;
        }
        vm.status = '第 ' + round + ' 轮 · 对了';
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
    } else {
      lives -= 1;
      vm.cells[index].cls = 'cell cell--bad';
      vm.status = '记岔了一次';
      render();
      if (lives <= 0) {
        const completed = round - 1;
        finishOnce(C.gradeBy(completed, 6, 4, 2), '复述至第 ' + round + ' 轮');
      } else {
        bag.after(function () {
          if (done) return;
          inputIndex = 0;
          accepting = true;
          C.clearCells(vm.cells);
          vm.status = '再试一遍这一轮';
          render();
        }, 550);
      }
    }
  }

  render();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'memory', name: '记忆序列', create: create };
