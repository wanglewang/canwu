'use strict';

// 阵灯推演（参悟阵眼 / 阵法·燃灯诀专属）：点一格翻转它和上下左右，让整盘阵灯同时亮起。
//
// 一局是「限时连解」：固定时辰，解亮一盘立刻起下一盘，看这一局能解几盘。
//
// 难度不在盘面大小，在「这一盘最少要几步」——3×3 上最优步数恰好等于需要点几个不同的格子
// （满秩，点集不会互相抵消），所以生成时点 k 个互不相同的格，这盘就一定要 k 步。
// 五档是 2 / 3 / 4 / 5 / 6 步，每档只多一步，但多一步就得多推一层。
//
// 三处压力：
//   1. 一局就是这么多时辰，解一盘立刻换下一盘，想得久就解得少；
//   2. 阵眼感应（提示）花三秒，只照出一格，贪提示就少解一盘；
//   3. 大成的「死门」：盘上有一格点不得，点到整盘复位并罚三秒；圆满再加一格。
//      死门先定，再只用「点得动的格子」生成，所以每盘都解得开。
//
// 评级按解开的盘数，档位越高、每盘越慢，达标盘数相应递减。

const C = require('./common.js');

const TICK = 100;
const HINT_COST = 3000;   // 阵眼感应：花三秒
const DEAD_COST = 3000;   // 触死门：罚三秒
const RESET_PAUSE = 160;  // 解完一盘到下一盘之间的顿挫（要短，别把节奏切断）
const BASE_STEPS = 2;     // 参数里没写 steps 时的简单档步数

// 达标盘数：[S, A, B]，下标是 depth（0 简单 … 4 绝境）。
// 步数越多每盘越慢，所以档位越高要求的盘数越少。
// 按假时钟标定：机器人（读盘 0.4s / 每步 0.4s）能解 12 / 11 / 10 / 10 / 9 盘，
// 真人节奏（读盘 2.5s / 每步 0.9s）能解 11 / 8 / 7 / 6 / 5 盘。
// S 取真人的七五折——练到位才拿得到；B 兜住新手第一局。
const TARGETS = [
  [9, 6, 3],
  [7, 4, 2],
  [6, 4, 2],
  [5, 3, 2],
  [4, 3, 2],
];

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
// 3×3 最多 2^9 次，只在提示时调用。
function solveAllowed(board, size, allowed) {
  const total = 1 << allowed.length;
  for (let mask = 0; mask < total; mask += 1) {
    const b = board.slice();
    const clicks = [];
    for (let i = 0; i < allowed.length; i += 1) {
      if (mask & (1 << i)) { clicks.push(allowed[i]); toggle(b, size, allowed[i]); }
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
  const depth = typeof p.depth === 'number' ? p.depth : 0;
  const size = Math.min(5, p.size || 3);
  const n = size * size;
  const steps = Math.min(n - 1, p.steps || (BASE_STEPS + depth));
  const deadCount = (function () {
    // 死门 / 双门是「多一格不能碰的」，玩家可以在准备页关掉；
    // 关双门只回到一格死门，关死门才是整盘无死门。
    const off = Array.isArray(perks.offTwists) ? perks.offTwists : [];
    if (off.indexOf('死门') >= 0) return 0;
    const base = stageIdx >= 4 ? 2 : stageIdx >= 3 ? 1 : 0;
    return off.indexOf('双门') >= 0 ? Math.min(base, 1) : base;
  })();
  const target = TARGETS[Math.min(TARGETS.length - 1, depth)];

  const duration = Math.round((p.duration || 36) * 1000) + (perks.easy ? 8000 : 0);

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
    if (solved >= target[0]) return 'S';
    if (solved >= target[1]) return 'A';
    if (solved >= target[2]) return 'B';
    return 'C';
  }

  function syncTime() {
    vm.timeText = '余 ' + (timeLeft / 1000).toFixed(1) + ' 秒 · 第 ' + (solved + 1) + ' 盘';
    vm.goal = timeLeft > 0 ? '解亮 ' + n + ' 盏 · 本盘最少 ' + steps + ' 步' : '时辰已尽';
  }

  function syncHud() {
    vm.scoreText = '已解 ' + solved + ' 盘';
    vm.progress = C.pct(solved, target[0]);
    vm.progressText = '已解 ' + solved + ' 盘 · 达标 ' + target[0] + ' 盘';
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

  // 死门先定，再从「点得动的格子」里点 k 个互不相同的格把全亮的阵打乱。
  // 3×3 上点集互不抵消，所以这一盘的最优解就正好是 k 步——难度因此可控。
  // 3×3 之外的点集可能互相抵消，这里用一次穷举核一下，不达标就重来。
  function newBoard() {
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(i);
    C.shuffle(all);
    dead = all.slice(0, deadCount);
    const allowed = all.slice(deadCount);
    const k = Math.min(steps, allowed.length);

    for (let tries = 0; tries < 40; tries += 1) {
      for (let i = 0; i < n; i += 1) board[i] = true;
      const pool = allowed.slice();
      C.shuffle(pool);
      for (let i = 0; i < k; i += 1) toggle(board, size, pool[i]);
      if (allLit(board)) continue;
      if (size === 3) break;
      const best = solveAllowed(board, size, allowed);
      if (best && best.length === k) break;
    }
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
    moves = 0;
    timeLeft = Math.max(0, timeLeft - DEAD_COST);
    C.flash(vm, '触了死门 · 阵盘复位，罚 3 秒', 'bad');
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
      vm.status = '解开了 · ' + moves + ' 步';
      vm.banner = '解 ' + solved + ' 盘';
      paint();
      syncHud();
      render();
      if (solved >= target[0] + 6) { finishOnce('解亮 ' + solved + ' 盘，阵法已成'); return; }
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
    vm.status = '阵眼感应：这一格该点 · 花去 3 秒';
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
