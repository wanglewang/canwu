'use strict';

// 阵灯推演（参悟阵眼 / 阵法入门专属）：点一格翻转它和上下左右，让整盘阵灯同时亮起。
//
// 原来是「解一道题、步数越少越好」——时间无限、撤销免费，等于允许慢慢穷举，没有压力。
// 现在改成「限时连解」：
//   1. 一整局固定时辰，解亮一盘立刻起下一盘，看这一局能解几盘；
//   2. 步数不再评级，但「阵眼感应」（提示）要花 4 秒，贪提示就少解一盘；
//   3. 大成的「死门」：盘上有一格点不得，点到整盘复位并罚 3 秒；
//      圆满再加一格。死门生成时保证不落在最优解上，所以每盘都解得开。
//
// 评级按解开的盘数：3×3 是 5 / 3 / 1 盘，4×4 放宽到 3 / 2 / 1 盘。

const C = require('./common.js');

const TICK = 100;
const HINT_COST = 4000;   // 阵眼感应：花 4 秒
const DEAD_COST = 3000;   // 触死门：罚 3 秒
const RESET_PAUSE = 320;  // 解完一盘到下一盘之间的顿挫

function toggle(board, size, index) {
  const r = Math.floor(index / size);
  const c = index % size;
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < dirs.length; i += 1) {
    const nr = r + dirs[i][0];
    const nc = c + dirs[i][1];
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      const k = nr * size + nc;
      board[k] = !board[k];
    }
  }
}

function allLit(board) {
  for (let i = 0; i < board.length; i += 1) if (!board[i]) return false;
  return true;
}

// 只允许点在 allowed 里的格子时，求一条解（死门不能点，所以不能用逐行下压那套）。
// 允许的格子最多 14 个，2^14 次穷举在提示那几下完全够用。
function solveAllowed(board, size, allowed) {
  const idx = allowed.slice();
  const total = 1 << idx.length;
  for (let mask = 0; mask < total; mask += 1) {
    const b = board.slice();
    const clicks = [];
    for (let i = 0; i < idx.length; i += 1) {
      if (mask & (1 << i)) { clicks.push(idx[i]); toggle(b, size, idx[i]); }
    }
    if (allLit(b)) return clicks;
  }
  return null;
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const stageIdx = typeof perks.tier === 'number' ? perks.tier : 0;
  const theme = ctx.theme || {};
  const size = Math.min(5, (p.size || 3) + (ctx.difficulty === 'hard' ? 1 : 0));
  const scramble = (p.scramble || 5) + (ctx.difficulty === 'hard' ? 2 : 0);
  const n = size * size;
  const deadCount = stageIdx >= 4 ? 2 : stageIdx >= 3 ? 1 : 0;
  const args = {
    S: size <= 3 ? 5 : 3,
    A: size <= 3 ? 3 : 2,
    B: size <= 3 ? 1 : 1,
  };

  const duration = Math.round((p.duration || 40) * 1000) + (perks.easy ? 8000 : 0);

  const vm = C.makeVm(size, n, '让所有阵灯同时亮起', ctx.tip || '点一格会翻转它和上下左右');
  vm.extras.showHint = true;
  vm.scoreText = '已解 0 盘';

  const bag = C.TimerBag();
  let board = new Array(n).fill(true);
  let startBoard = new Array(n).fill(true);
  let dead = [];
  let moves = 0;
  let solved = 0;
  let timeLeft = duration;
  let hintsLeft = 2 + (perks.easy ? 1 : 0);
  let paused = false;
  let done = false;
  let started = false;
  let tickTimer = null;

  function render() { ctx.render(vm); }

  function gradeOf() {
    if (solved >= args.S) return 'S';
    if (solved >= args.A) return 'A';
    if (solved >= args.B) return 'B';
    return 'C';
  }

  function syncTime() {
    vm.timeText = '余 ' + (timeLeft / 1000).toFixed(1) + ' 秒 · 第 ' + (solved + 1) + ' 盘';
    vm.goal = timeLeft > 0 ? '解亮 ' + n + ' 盏 · 本局已解 ' + solved + ' 盘' : '时辰已尽';
  }

  function syncHud() {
    vm.scoreText = '已解 ' + solved + ' 盘';
    vm.progress = C.pct(solved, args.S);
    vm.progressText = '已解 ' + solved + ' 盘 · 达标 ' + args.S + ' 盘';
    vm.gradeNow = gradeOf();
    vm.hint = deadCount > 0
      ? '阵眼感应剩 ' + hintsLeft + ' 次 · 死门 ' + deadCount + ' 处'
      : '阵眼感应剩 ' + hintsLeft + ' 次';
    syncTime();
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      if (dead.indexOf(i) >= 0) {
        vm.cells[i].cls = board[i] ? 'cell cell--dead cell--dead-lit' : 'cell cell--dead';
        vm.cells[i].label = '忌';
        vm.cells[i].tone = 0;
        continue;
      }
      vm.cells[i].cls = board[i] ? 'cell cell--lit' : 'cell cell--off';
      vm.cells[i].label = board[i] ? (theme.glyph || '明') : '暗';
      vm.cells[i].tone = 0;
    }
  }

  function newBoard() {
    // 死门先定，再用「点得动的格子」把全亮的阵打乱——
    // 这样反着走一遍就是解，任何时候都不会出现无解的盘。
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(i);
    C.shuffle(all);
    dead = all.slice(0, deadCount);
    const allowed = all.slice(deadCount);
    let guard = 0;
    do {
      for (let i = 0; i < n; i += 1) board[i] = true;
      for (let i = 0; i < scramble; i += 1) toggle(board, size, allowed[C.randInt(allowed.length)]);
      guard += 1;
    } while (allLit(board) && guard < 20);
    startBoard = board.slice();
    moves = 0;
  }

  function nextBoard() {
    newBoard();
    paused = false;
    vm.status = '第 ' + (solved + 1) + ' 盘 · 让全阵亮起';
    paint();
    syncHud();
    render();
  }

  function finishOnce(summary) {
    if (done) return;
    done = true;
    bag.clear();
    if (tickTimer !== null) { bag.off(tickTimer); tickTimer = null; }
    vm.phase = 'done';
    vm.status = '时辰已尽';
    const grade = gradeOf();
    vm.banner = grade === 'S' ? (theme.praise || '一眼破阵') : '';
    render();
    ctx.finish({ grade: grade, score: solved, summary: summary });
  }

  function tick() {
    tickTimer = null;
    if (done) return;
    if (paused) { tickTimer = bag.after(tick, TICK); return; }
    timeLeft -= TICK;
    if (timeLeft <= 0) {
      timeLeft = 0;
      syncTime();
      render();
      finishOnce('时辰已尽，解亮 ' + solved + ' 盘');
      return;
    }
    syncTime();
    render();
    tickTimer = bag.after(tick, TICK);
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    paint();
    syncHud();
    render();
    tickTimer = bag.after(tick, TICK);
  }

  function onDead(index) {
    board = startBoard.slice();
    timeLeft = Math.max(0, timeLeft - DEAD_COST);
    C.flash(vm, '触了死门 · 阵盘复位，罚三秒', 'bad');
    vm.status = '死门反噬，这一盘从头再来';
    paint();
    syncHud();
    render();
    if (timeLeft <= 0) finishOnce('时辰已尽，解亮 ' + solved + ' 盘');
  }

  function tap(index) {
    if (done || paused || vm.phase !== 'playing') return;
    if (dead.indexOf(index) >= 0) { onDead(index); return; }
    toggle(board, size, index);
    moves += 1;
    paint();
    syncHud();
    C.flash(vm, theme.hit || '阵灯转明', 'good');
    if (allLit(board)) {
      solved += 1;
      paused = true;
      vm.status = '这一盘解开了 · 用时 ' + moves + ' 步';
      vm.banner = '解 ' + solved + ' 盘';
      paint();
      syncHud();
      render();
      if (solved >= args.S + 6) { finishOnce('解亮 ' + solved + ' 盘，阵法已成'); return; }
      bag.after(function () {
        if (done) return;
        nextBoard();
      }, RESET_PAUSE);
      return;
    }
    render();
  }

  function hint() {
    if (done || paused || vm.phase !== 'playing') return;
    if (hintsLeft <= 0) {
      C.flash(vm, '阵眼感应已用尽', 'bad');
      render();
      return;
    }
    const allowed = [];
    for (let i = 0; i < n; i += 1) if (dead.indexOf(i) < 0) allowed.push(i);
    const clicks = solveAllowed(board, size, allowed);
    if (!clicks || clicks.length === 0) {
      vm.status = '阵眼已明，直接点完即可';
      render();
      return;
    }
    hintsLeft -= 1;
    timeLeft = Math.max(0, timeLeft - HINT_COST);
    const k = clicks[0];
    const prevCls = vm.cells[k].cls;
    const prevLabel = vm.cells[k].label;
    vm.cells[k].cls = 'cell cell--hint';
    vm.cells[k].label = theme.glyph || '明';
    vm.status = '阵眼感应：这一格该点 · 花去四秒';
    syncHud();
    render();
    bag.after(function () {
      if (done) return;
      vm.cells[k].cls = prevCls;
      vm.cells[k].label = prevLabel;
      render();
    }, 1400);
    if (timeLeft <= 0) finishOnce('时辰已尽，解亮 ' + solved + ' 盘');
  }

  newBoard();
  paint();
  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    hint: hint,
    abandon: function () { if (!done) { done = true; bag.clear(); ctx.finish({ grade: 'F', score: solved, summary: '中途收功' }); } },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'lights', name: '阵灯推演', create: create };
