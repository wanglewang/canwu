'use strict';

// 首局教学盘的公用骨架。
//
// 结论来自 2026-11 的一轮研究（写在 docs/30-ui/12-teach-boards.md）：
//   ① 第一关必须不可能失败——所以教学盘没有失败态，错点只是「还没点对」；
//   ② 前几手由游戏指定——所以每一步只有一处可操作，点别处不推进；
//   ③ 盘面自己说话——正确的格呼吸，其余压暗，句子只当字幕；
//   ④ 学完要能迁移——两步以上的盘，第二步必须换位置或换方向。
//
// 每门玩法只提供三样：cells（盘面）、paint（怎么画）、steps（每步允许什么、做对了变什么样）。
// 其余（教学条、压暗、拒绝、停一拍交棒）都在这里，免得 15 门各写一套。

const C = require('./common.js');

const HOLD_MS = 900;          // 走完停一拍：让最后一帧留在屏上，再进正式局
const DIM_CLS = 'cell--teach-dim';
const NEXT_CLS = 'cell--teach-next';
const WRONG_TEXT = '点呼吸的那一格';

// 造一批空格：教学盘的 cells 与真局同构，只是内容由各门自己填。
function blank(cols, n) {
  return C.makeVm(cols || 0, n || 0).cells;
}

function base(spec) {
  const cells = spec.cells || [];
  const vm = C.makeVm(spec.cols || 0, cells.length, spec.status || '', spec.hint || '');
  vm.cells = cells;
  // 教学盘与真局同一套 vm：阶段必须写 playing，否则各门从真逻辑里借来的分支会 early return。
  vm.phase = 'playing';
  vm.tutorial = true;
  vm.teachTotal = spec.steps.length;
  vm.teachStep = 1;
  vm.teachText = (spec.steps[0] && spec.steps[0].text) || '';
  vm.timeText = '教学 · 不计步';
  vm.scoreText = '教学中';
  if (spec.stage) vm.stage = spec.stage;
  // 正式局的所有压力源一律关掉：教学不是一局，不评档、不计步、不给提示次数。
  const e = vm.extras;
  e.showHint = false;
  e.showReset = false;
  e.showUndo = false;
  e.showGradeNow = false;
  e.showProgress = false;
  e.showCharge = false;
  e.showCombo = false;
  e.showMeter = false;
  e.showHearts = false;
  e.showRing = false;
  return vm;
}

// spec:
//   cols / cells / status / hint / stage / pad —— 盘面规格
//   steps: [{ at?, dir?, text, take?(value, vm, step) → { text, tone } }]
//   paint(vm, step, over) —— 把 cells 写成真实状态（只写状态，不写教学类）
//   doneText / wrongText / holdMs / dim
function run(ctx, spec) {
  const vm = base(spec);
  const steps = spec.steps;
  let step = 0;
  let over = false;
  let timer = null;

  // 一层画状态，一层加教学类：两个东西分开写，才不会出现「点对了却还压暗」。
  function paint() {
    if (spec.paint) spec.paint(vm, step, over);
    const cells = vm.cells || [];
    const hot = over ? [] : (steps[step].at || []);
    for (let i = 0; i < cells.length; i += 1) {
      const c = cells[i];
      let cls = String(c.cls || 'cell');
      if (hot.indexOf(i) >= 0) cls += ' ' + NEXT_CLS;
      else if (spec.dim !== false) cls += ' ' + DIM_CLS;
      c.cls = cls;
    }
    vm.teachStep = Math.min(step + 1, steps.length);
    vm.teachText = over ? (spec.doneText || '') : (steps[step].text || '');
  }

  function draw() {
    paint();
    ctx.render(vm);
  }

  // 错点不记账、不扣时、不推进：只把该点哪儿再说一遍，并把那一格再呼吸一次。
  function reject(text) {
    C.flash(vm, text || (steps[step] && steps[step].wrongText) || spec.wrongText || WRONG_TEXT, 'bad');
    draw();
  }

  function settle(res) {
    step += 1;
    if (step >= steps.length) {
      over = true;
      C.flash(vm, (res && res.text) || spec.doneText || '', 'gold');
      draw();
      timer = setTimeout(function () {
        timer = null;
        ctx.done();
      }, spec.holdMs || HOLD_MS);
      return;
    }
    if (res && res.text) C.flash(vm, res.text, res.tone || 'good');
    draw();
  }

  function tap(index) {
    if (over) return;
    const cur = steps[step];
    if (!cur.at || cur.at.indexOf(index) < 0) { reject(); return; }
    settle(cur.take ? cur.take(index, vm, step) : null);
  }

  function move(dir) {
    if (over) return;
    const cur = steps[step];
    const want = cur.dir;
    const ok = Array.isArray(want) ? want.indexOf(dir) >= 0 : want === dir;
    if (!ok) { reject(); return; }
    settle(cur.take ? cur.take(dir, vm, step) : null);
  }

  function swipe(path) {
    if (over) return;
    const cur = steps[step];
    if (typeof cur.swipe !== 'function') { reject(); return; }
    const res = cur.swipe(path, vm, step);
    if (!res) { reject(cur.swipeWrongText); return; }
    settle(res);
  }

  draw();

  return C.fillController({
    // 教学盘开局即已摆好，不需要再起手。
    start: function () { /* 摆好就是开始 */ },
    tap: tap,
    move: move,
    swipe: swipe,
    destroy: function () {
      over = true;
      if (timer) { clearTimeout(timer); timer = null; }
    },
  });
}

module.exports = {
  HOLD_MS: HOLD_MS,
  DIM_CLS: DIM_CLS,
  NEXT_CLS: NEXT_CLS,
  blank: blank,
  base: base,
  run: run,
};
