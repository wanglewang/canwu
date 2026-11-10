'use strict';

// A1-1 限时点击（打地鼠）：限时内点中随机亮起的目标，比命中数。

const C = require('./common.js');

function create(ctx) {
  const p = ctx.params;
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const duration = Math.max(8, p.duration + (perks.easy ? 3 : 0) - (hard ? 3 : 0));
  const interval = Math.max(320, p.interval + (perks.easy ? 120 : 0) - (hard ? 160 : 0));
  const grid = p.grid;
  const vm = C.makeVm(p.cols, grid, '凝神，等灵光出现…', ctx.tip || '点中亮起的格子');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '命中 0';

  const bag = C.TimerBag();
  let target = -1;
  let score = 0;
  let left = duration;
  let lastHitAt = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    render();
    ctx.finish({ grade: grade, score: score, summary: summary });
  }

  function moveTarget() {
    if (target >= 0 && vm.cells[target]) {
      vm.cells[target].label = '';
      vm.cells[target].cls = 'cell';
    }
    let next = C.randInt(grid);
    if (next === target) next = (next + 1) % grid;
    target = next;
    vm.cells[target].cls = 'cell cell--lit';
    vm.cells[target].label = '灵';
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '灵光已现，快！';
    moveTarget();
    bag.every(function () {
      left -= 1;
      vm.timeText = C.mmss(Math.max(0, left));
      if (left <= 0) {
        const s = Math.ceil(duration * 1.9);
        const a = Math.ceil(duration * 1.35);
        const b = Math.ceil(duration * 0.8);
        finishOnce(C.gradeBy(score, s, a, b), '命中 ' + score + ' 次');
        return;
      }
      render();
    }, 1000);
    bag.every(moveTarget, interval);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    const now = Date.now();
    if (index === target) {
      if (now - lastHitAt < 180) return;
      lastHitAt = now;
      score += 1;
      vm.scoreText = '命中 ' + score;
      vm.status = '好，再快一点';
      moveTarget();
    } else {
      vm.cells[index].cls = 'cell cell--bad';
      vm.status = '点空了';
      const i = index;
      bag.after(function () {
        if (!done && vm.phase === 'playing' && i !== target) {
          vm.cells[i].cls = 'cell';
          render();
        }
      }, 220);
      render();
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

module.exports = { id: 'click', name: '限时点击', create: create };
