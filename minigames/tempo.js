'use strict';

// 节律判定（吸纳灵气 / 心法·吐纳诀专属）：光环不断向内收敛，收进朱圈的一瞬点击判「圆满」，
// 连续若干拍后按命中数评级。本门机制「一息绵长」：判定窗更宽、收得更慢，适合稳住连拍。
// 与「剑招连段」的区别：这里只判时机、不看符号；与蓄力停区的区别是「连续多拍单点」而非「长按松手」。
// 纯数据驱动，不需要触摸坐标，也不依赖 canvas。

const C = require('./common.js');

const START_SCALE = 1.75;
const JUDGE_SCALE = 1.0;
const TICK_MS = 40;
const FLOOR_SCALE = 0.72;

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const twist = ctx.twist || '';
  const theme = ctx.theme || {};
  const total = Math.max(4, Math.floor(p.beats || 8));
  let window = Number(p.window || 0.09);
  let step = Number(p.speed || 0.026);
  if (twist === 'absorb') { window += 0.035; step -= 0.004; }
  if (hard) { window -= 0.012; step += 0.004; }
  if (perks.easy) window += 0.02;
  window = Math.max(0.045, window);
  step = Math.max(0.012, step);

  const vm = C.makeVm(0, 0, '气机收敛，合拍时点下', ctx.tip || '光环收进朱圈时点击');
  vm.stage = 'ring';
  vm.extras.showGrid = false;
  vm.extras.showRing = true;
  vm.extras.showCombo = true;
  vm.ring = {
    scale: START_SCALE, judge: JUDGE_SCALE, window: window,
    beat: 1, total: total, tone: 'idle',
  };
  vm.timeText = '第 1 / ' + total + ' 拍';
  vm.scoreText = '圆满 0';
  vm.goal = C.goalFor('C', total - 1, '个圆满');
  vm.hint = vm.costText;

  const bag = C.TimerBag();
  let beat = 1;
  let perfect = 0;
  let good = 0;
  let miss = 0;
  let combo = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function points() { return perfect + good * 0.5; }

  function gradeNow() {
    const pts = points();
    if (pts >= total - 1) return 'S';
    if (pts >= total - 2.5) return 'A';
    if (pts >= Math.ceil(total * 0.5)) return 'B';
    return 'C';
  }

  function syncHud() {
    vm.timeText = '第 ' + Math.min(beat, total) + ' / ' + total + ' 拍';
    vm.scoreText = '圆满 ' + perfect;
    vm.progress = C.pct(beat - 1, total);
    vm.progressText = (beat - 1) + ' / ' + total + ' 拍';
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连拍 ×' + combo : '';
    vm.gradeNow = gradeNow();
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, Math.ceil(total - 1 - points())), '个圆满');
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '一气呵成') : '';
    render();
    ctx.finish({ grade: grade, score: perfect, summary: summary });
  }

  function nextBeat() {
    beat += 1;
    if (beat > total) {
      finishOnce(gradeNow(), '圆满 ' + perfect + ' 拍 · 合拍 ' + good + ' 拍 · 失拍 ' + miss + ' 拍');
      return;
    }
    vm.ring.scale = START_SCALE;
    vm.ring.beat = beat;
    vm.ring.tone = 'idle';
    syncHud();
    render();
  }

  function tick() {
    if (done || vm.phase !== 'playing') return;
    vm.ring.scale -= step;
    if (vm.ring.scale <= FLOOR_SCALE) {
      miss += 1;
      combo = 0;
      vm.ring.tone = 'miss';
      C.flash(vm, '失拍', 'bad');
      nextBeat();
      return;
    }
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '随气机收放，一拍一拍来';
    vm.banner = theme.banner || '凝神';
    syncHud();
    render();
    bag.every(tick, TICK_MS);
  }

  function tap() {
    if (done || vm.phase !== 'playing') return;
    const dist = Math.abs(vm.ring.scale - JUDGE_SCALE);
    let tone;
    let text;
    if (dist <= window) {
      perfect += 1;
      combo += 1;
      tone = 'perfect';
      text = combo >= 3 ? '圆满 · 连拍 ×' + combo : (theme.hit || '圆满');
      C.flash(vm, text, 'gold');
    } else if (dist <= window * 2.2) {
      good += 1;
      combo = 0;
      tone = 'good';
      text = '合拍';
      C.flash(vm, text, 'good');
    } else {
      miss += 1;
      combo = 0;
      tone = 'miss';
      text = theme.miss || '失拍';
      C.flash(vm, text, 'bad');
    }
    vm.ring.tone = tone;
    if (combo >= 4) vm.banner = theme.banner || '气机连绵';
    syncHud();
    nextBeat();
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

module.exports = { id: 'tempo', name: '节律判定', create: create };
