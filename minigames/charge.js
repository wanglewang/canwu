'use strict';

// B1 突破瓶颈：长按蓄力，松手时停在朱线区间内即突破成功，比停位精度。
// 仅用于境界突破，不在 10 门功法的参悟里出现。

const C = require('./common.js');

function create(ctx) {
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const zoneWidth = (hard ? 11 : 16) + (perks.easy ? 6 : 0);
  const targetStart = 42 + C.randInt(30);
  const targetEnd = Math.min(96, targetStart + zoneWidth);
  const center = (targetStart + targetEnd) / 2;
  const vm = C.makeVm(0, 0, '长按蓄力，松手停在朱线区间', ctx.tip || '越靠近区间正中，评级越高');
  vm.stage = 'charge';
  vm.extras.showGrid = false;
  vm.extras.showCharge = true;
  vm.charge = { value: 0, start: targetStart, end: targetEnd, holding: false };
  vm.scoreText = '蓄力 0%';
  vm.goal = '朱线区间 ' + targetStart + '% — ' + targetEnd + '%';

  const bag = C.TimerBag();
  let value = 0;
  let dir = 1;
  let holding = false;
  let done = false;
  let started = false;
  let lastTouchAt = 0;

  function render() { ctx.render(vm); }

  function gradeAt(v) {
    if (v < targetStart || v > targetEnd) return 'F';
    const dist = Math.abs(v - center);
    return dist <= 3 ? 'S' : dist <= 7 ? 'A' : dist <= 12 ? 'B' : 'C';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    holding = false;
    vm.charge.holding = false;
    vm.phase = 'done';
    vm.status = '收功';
    vm.banner = grade === 'S' ? (theme.praise || '破关') : '';
    render();
    ctx.finish({ grade: grade, score: Math.round(value), summary: summary });
  }

  function tick() {
    value += dir * 4;
    if (value >= 100) { value = 100; dir = -1; }
    if (value <= 0) { value = 0; dir = 1; }
    vm.charge.value = value;
    vm.scoreText = '蓄力 ' + Math.round(value) + '%';
    vm.progress = Math.round(value);
    vm.progressText = Math.round(value) + '%';
    vm.gradeNow = gradeAt(value) === 'F' ? 'C' : gradeAt(value);
    const dist = Math.abs(value - center);
    vm.goal = gradeAt(value) === 'F'
      ? '尚未入朱线 · 再等一等'
      : '距正中 ' + Math.round(dist) + '% · ' + gradeAt(value) + ' 评';
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
    vm.banner = theme.banner || '一线之间';
    bag.every(tick, 55);
  }

  function release() {
    if (done || !holding) return;
    lastTouchAt = Date.now();
    holding = false;
    vm.charge.holding = false;
    bag.clear();
    const grade = gradeAt(value);
    if (grade === 'F') {
      C.flash(vm, theme.miss || '气机偏离', 'bad');
      finishOnce('F', '停在 ' + Math.round(value) + '%，气机偏离');
      return;
    }
    const dist = Math.abs(value - center);
    C.flash(vm, grade === 'S' ? (theme.praise || '一线中的') : '停在 ' + Math.round(value) + '%', grade === 'S' ? 'gold' : 'good');
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
      vm.banner = theme.banner || '一线之间';
      render();
    },
    press: press,
    release: release,
    tap: tapFallback,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'charge', name: '蓄力停区', create: create };
