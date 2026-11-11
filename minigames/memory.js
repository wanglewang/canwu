'use strict';

// 背口诀（记序复现 / 静心诀专属）：口诀次第闪过，按原序点回，比这一局记到第几轮。
//
// 三处压力，让它不只是背题：
//   1. 复述有息数：本轮时限 = 题长 × 每字息数 + 起手半息，题越长给得越多，但永远不够宽裕；
//   2. 点错不致命，罚一息半——乱试会把时间试完，时间见底才折一盏心神；
//   3. 抢记：闪烁时可长按盘面抢先开口，跳过剩余闪烁、本轮分 ×1.5 —— 赌的是你记住了多少。
//
// 熟练度阶段解锁的新法（见 data/practice.js 的 STAGE_RULES）：
//   大成「逆诵」：第 3 轮起，奇轮要从末字往前点；
//   圆满「叠印」：第 5 轮起，口诀里会出现重复的格子（同一格要连点两下）。
//
// 分：每轮 10 × 题长 ×（抢记 1.5）。S 210 / A 110 / B 45。

const C = require('./common.js');

const TICK = 100;          // 计时粒度
const WRONG_COST = 1500;   // 点错罚一息半
const RUSH_MULT = 1.5;     // 抢记的分数倍率
const REVERSE_AT = 3;      // 逆诵：第 3 轮起，奇轮倒着点
const REPEAT_AT = 5;       // 叠印：第 5 轮起允许重复格子
const S_LIMIT = 210;
const A_LIMIT = 110;
const B_LIMIT = 45;

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const stageIdx = typeof perks.tier === 'number' ? perks.tier : 0;
  const theme = ctx.theme || {};
  const grid = p.grid || 9;
  const startLen = p.startLen || 2;
  const maxRound = p.maxRound || 7;
  const perNote = Math.max(360, p.msPerNote || 1100);
  const flashMs = Math.max(240, (p.flashMs || 560) + (perks.easy ? 80 : 0));
  const gapMs = p.gapMs || 260;
  const glyph = theme.glyph || '诀';
  const maxLives = perks.easy ? 4 : 3;

  const vm = C.makeVm(p.cols || 3, grid, '凝神记住闪过的次序…', ctx.tip || '看清顺序，依次点回去');
  vm.extras.showMeter = true;
  vm.extras.showHearts = true;

  const bag = C.TimerBag();
  let lives = maxLives;
  let sequence = [];
  let inputIndex = 0;
  let round = 1;
  let score = 0;
  let streak = 0;
  let reversed = false;
  let rushed = false;
  let timeLeft = 0;
  let accepting = false;
  let done = false;
  let started = false;
  let flashTimer = null;
  let tickTimer = null;

  vm.hearts = { value: lives, max: maxLives };
  vm.timeText = '第 1 / ' + maxRound + ' 轮';
  vm.scoreText = '得分 0';

  function render() { ctx.render(vm); }

  function roundLen(r) { return Math.min(grid, startLen + r - 1); }

  function roundMs(len) { return 600 + len * perNote; }

  function gradeNow() {
    return C.gradeBy(score, S_LIMIT, A_LIMIT, B_LIMIT);
  }

  function syncHud() {
    vm.timeText = '第 ' + Math.min(round, maxRound) + ' / ' + maxRound + ' 轮' + (reversed ? ' · 逆诵' : '');
    vm.scoreText = '得分 ' + score;
    vm.progress = C.pct(round - 1, maxRound);
    vm.progressText = (round - 1) + ' / ' + maxRound + ' 轮';
    vm.gradeNow = gradeNow();
    vm.comboText = streak >= 2 ? '连对 ×' + streak : '';
    vm.hearts = { value: lives, max: maxLives };
    const remainScore = (S_LIMIT - score);
    vm.goal = remainScore > 0 ? '再 ' + remainScore + ' 分可入 S' : '已入圆满 · 稳住这一局';
  }

  function stopTick() {
    if (tickTimer !== null) { bag.off(tickTimer); tickTimer = null; }
  }

  function stopFlash() {
    if (flashTimer !== null) { bag.off(flashTimer); flashTimer = null; }
  }

  function finishOnce(summary, forced) {
    if (done) return;
    done = true;
    bag.clear();
    stopTick();
    stopFlash();
    accepting = false;
    vm.phase = 'done';
    vm.status = '参悟已毕';
    const grade = forced || gradeNow();
    vm.banner = grade === 'S' ? (theme.praise || '倒背如流') : '';
    render();
    ctx.finish({ grade: grade, score: score, summary: summary });
  }

  // ---------------------------------------------------------------- 闪烁
  function flashStep(i) {
    if (done || vm.phase !== 'flashing') return;
    C.clearCells(vm.cells);
    if (i >= sequence.length) { beginInput(); return; }
    const idx = sequence[i];
    vm.cells[idx].cls = 'cell cell--lit';
    vm.cells[idx].label = glyph;
    vm.meter = { label: '口诀次第', value: i + 1, max: sequence.length };
    render();
    flashTimer = bag.after(function () {
      flashTimer = null;
      if (done || vm.phase !== 'flashing') return;
      C.clearCells(vm.cells);
      render();
      flashTimer = bag.after(function () { flashTimer = null; flashStep(i + 1); }, gapMs);
    }, flashMs);
  }

  function beginRound() {
    if (done) return;
    const len = roundLen(round);
    reversed = stageIdx >= REVERSE_AT && round >= REVERSE_AT && round % 2 === 1;
    const allowRepeat = stageIdx >= REPEAT_AT && round >= REPEAT_AT;
    const picked = [];
    if (allowRepeat) {
      for (let i = 0; i < len; i += 1) picked.push(C.randInt(grid));
    } else {
      const pool = [];
      for (let i = 0; i < grid; i += 1) pool.push(i);
      C.shuffle(pool);
      for (let i = 0; i < len; i += 1) picked.push(pool[i]);
    }
    sequence = picked;
    inputIndex = 0;
    rushed = false;
    accepting = false;
    vm.phase = 'flashing';
    vm.status = '第 ' + round + ' 轮 · 记住口诀次第';
    vm.banner = reversed ? '逆诵：从末字往前' : '';
    vm.meter = { label: '口诀次第', value: 0, max: len };
    C.clearCells(vm.cells);
    syncHud();
    vm.goal = '长按盘面可抢先开口';
    render();
    flashTimer = bag.after(function () { flashTimer = null; flashStep(0); }, 520);
  }

  // ---------------------------------------------------------------- 复述
  function beginInput() {
    if (done) return;
    accepting = true;
    vm.phase = 'input';
    const len = sequence.length;
    timeLeft = roundMs(len);
    vm.status = '请' + (reversed ? '倒着' : '依次') + '点出「' + len + '」字';
    vm.meter = { label: '已复述', value: 0, max: len };
    vm.goal = '余 ' + (timeLeft / 1000).toFixed(1) + ' 息';
    C.clearCells(vm.cells);
    render();
    stopTick();
    tickTimer = bag.after(tick, TICK);
  }

  function tick() {
    tickTimer = null;
    if (done || !accepting) return;
    timeLeft -= TICK;
    if (timeLeft <= 0) {
      timeLeft = 0;
      vm.goal = '息尽';
      render();
      foldRound();
      return;
    }
    vm.goal = '余 ' + (timeLeft / 1000).toFixed(1) + ' 息';
    render();
    tickTimer = bag.after(tick, TICK);
  }

  // 折一盏心神：还有心神就重整这一轮（题长不变），否则收功。
  function foldRound() {
    accepting = false;
    stopTick();
    lives -= 1;
    streak = 0;
    vm.hearts = { value: Math.max(0, lives), max: maxLives };
    vm.comboText = '';
    if (lives <= 0) {
      finishOnce('口诀散在第 ' + round + ' 轮 · 得分 ' + score);
      return;
    }
    vm.status = theme.miss || '气机一乱';
    vm.banner = '';
    C.flash(vm, '折一盏心神 · 还剩 ' + lives, 'bad');
    syncHud();
    render();
    bag.after(function () {
      if (done) return;
      // 折了心神不重闪题目：还是这一轮，从头点过——记不住就是记不住。
      C.clearCells(vm.cells);
      inputIndex = 0;
      beginInput();
    }, 700);
  }

  function onWrong(index) {
    timeLeft -= WRONG_COST;
    streak = 0;
    vm.comboText = '';
    vm.cells[index].cls = 'cell cell--bad';
    vm.status = theme.miss || '记岔了一个';
    C.flash(vm, '记岔 · 罚一息半', 'bad');
    if (timeLeft <= 0) { timeLeft = 0; vm.goal = '息尽'; render(); foldRound(); return; }
    vm.goal = '余 ' + (timeLeft / 1000).toFixed(1) + ' 息';
    render();
  }

  function onRight(index) {
    inputIndex += 1;
    vm.cells[index].cls = 'cell cell--ok';
    vm.cells[index].label = glyph;
    vm.meter = { label: '已复述', value: inputIndex, max: sequence.length };
    if (inputIndex >= sequence.length) { completeRound(); return; }
    render();
  }

  function completeRound() {
    accepting = false;
    stopTick();
    const gain = Math.round(10 * sequence.length * (rushed ? RUSH_MULT : 1));
    score += gain;
    streak += 1;
    C.flash(vm, (rushed ? '抢记成功' : theme.hit || '口诀无误') + ' +' + gain, 'gold');
    syncHud();
    render();
    if (round >= maxRound) {
      finishOnce(maxRound + ' 轮全过 · 得分 ' + score);
      return;
    }
    bag.after(function () {
      if (done) return;
      round += 1;
      C.clearCells(vm.cells);
      beginRound();
    }, 640);
  }

  // ---------------------------------------------------------------- 输入
  function start() {
    if (started) return;
    started = true;
    beginRound();
  }

  function tap(index) {
    if (done || !accepting || vm.phase !== 'input') return;
    const want = reversed ? sequence[sequence.length - 1 - inputIndex] : sequence[inputIndex];
    if (index === want) { onRight(index); return; }
    onWrong(index);
  }

  // 抢记：闪烁时长按盘面，跳过还没闪完的部分，直接开口。分 ×1.5，风险自负。
  function longpress() {
    if (done || vm.phase !== 'flashing') return;
    stopFlash();
    rushed = true;
    vm.banner = '抢记 · 本轮分 ×1.5';
    C.flash(vm, '抢先开口 · 分 ×1.5', 'gold');
    beginInput();
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    longpress: longpress,
    abandon: function () { finishOnce('中途收功', 'F'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'memory', name: '记序复现', create: create };
