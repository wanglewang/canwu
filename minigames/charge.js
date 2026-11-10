'use strict';

// B1-1 突破瓶颈：长按蓄力，松手时停在朱线区间内即突破成功，比停位精度。

const C = require('./common.js');

function create(ctx) {
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const zoneWidth = (hard ? 11 : 16) + (perks.easy ? 6 : 0);
  const targetStart = 42 + C.randInt(30);
  const targetEnd = Math.min(96, targetStart + zoneWidth);
  const vm = C.makeVm(0, 0, '长按蓄力，松手停在朱线区间', ctx.tip || '越靠近区间正中，评级越高');
  vm.extras.showCharge = true;
  vm.charge = { value: 0, start: targetStart, end: targetEnd, holding: false };
  vm.scoreText = '蓄力 0%';

  const bag = C.TimerBag();
  let value = 0;
  let dir = 1;
  let holding = false;
  let done = false;
  let started = false;
  let lastTouchAt = 0;

  function render() { ctx.render(vm); }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    holding = false;
    vm.charge.holding = false;
    vm.phase = 'done';
    vm.status = '收功';
    render();
    ctx.finish({ grade: grade, score: Math.round(value), summary: summary });
  }

  function tick() {
    value += dir * 4;
    if (value >= 100) { value = 100; dir = -1; }
    if (value <= 0) { value = 0; dir = 1; }
    vm.charge.value = value;
    vm.scoreText = '蓄力 ' + Math.round(value) + '%';
    render();
  }

  function press() {
    if (done) return;
    lastTouchAt = Date.now();
    if (!started) { started = true; vm.phase = 'playing'; }
    if (holding) return;
    holding = true;
    vm.charge.holding = true;
    vm.status = '气机正盛…松手定生死';
    bag.every(tick, 55);
  }

  function release() {
    if (done || !holding) return;
    lastTouchAt = Date.now();
    holding = false;
    vm.charge.holding = false;
    bag.clear();
    if (value < targetStart || value > targetEnd) {
      finishOnce('F', '停在 ' + Math.round(value) + '%，气机偏离');
      return;
    }
    const center = (targetStart + targetEnd) / 2;
    const dist = Math.abs(value - center);
    const grade = dist <= 3 ? 'S' : dist <= 7 ? 'A' : dist <= 12 ? 'B' : 'C';
    finishOnce(grade, '停在 ' + Math.round(value) + '%，偏差 ' + Math.round(dist) + '%');
  }

  // 桌面预览里鼠标可能只触发 tap：短按一下作为兜底，真正的触屏走 press/release。
  function tapFallback() {
    if (done) return;
    if (Date.now() - lastTouchAt < 500) return;
    press();
    bag.after(function () { release(); }, 520);
  }

  render();
  return C.fillController({
    start: function () {
      if (started) return;
      started = true;
      vm.phase = 'playing';
      vm.status = '按住下方按钮开始蓄力';
      render();
    },
    press: press,
    release: release,
    tap: tapFallback,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'charge', name: '突破瓶颈', create: create };
