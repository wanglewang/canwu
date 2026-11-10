'use strict';

// A3 阵灯推演（Lights Out）：点一格翻转十字，令全盘点亮，比步数。
// 盘面由「全亮」随机翻转生成，保证一定有解；用求解器给出最优步数目标。
// twist arrayEye：标出最优步数；twist wuxing：按行列分五行色。

const C = require('./common.js');

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

function litCount(board) {
  let n = 0;
  for (let i = 0; i < board.length; i += 1) if (board[i]) n += 1;
  return n;
}

// 经典「逐行下压」求解：枚举第一行点法，其余行由上一行是否亮决定。
function solve(board, size) {
  const combos = 1 << size;
  for (let mask = 0; mask < combos; mask += 1) {
    const b = board.slice();
    const clicks = [];
    for (let c = 0; c < size; c += 1) {
      if (mask & (1 << c)) { clicks.push(c); toggle(b, size, c); }
    }
    for (let r = 1; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const above = (r - 1) * size + c;
        if (!b[above]) { const k = r * size + c; clicks.push(k); toggle(b, size, k); }
      }
    }
    if (allLit(b)) return clicks;
  }
  return [];
}

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const twist = ctx.twist || '';
  const theme = ctx.theme || {};
  const size = Math.min(5, (p.size || 3) + (hard ? 1 : 0));
  const scramble = (p.scramble || 5) + (hard ? 3 : 0);
  const n = size * size;
  const vm = C.makeVm(size, n, '让所有阵灯同时亮起', ctx.tip || '点一格会翻转它和上下左右');
  vm.scoreText = '步数 0';
  vm.extras.showUndo = true;
  vm.extras.showHint = true;

  const bag = C.TimerBag();
  const board = new Array(n).fill(true);
  const history = [];
  let moves = 0;
  let hintsLeft = 2 + (perks.easy ? 1 : 0);
  let done = false;
  let started = false;

  for (let i = 0; i < scramble; i += 1) toggle(board, size, C.randInt(n));
  if (allLit(board)) toggle(board, size, C.randInt(n));
  const best = solve(board, size).length;

  function render() { ctx.render(vm); }

  function gradeMoves(m) {
    const s = size <= 3 ? 6 : size === 4 ? 10 : 14;
    const a = size <= 3 ? 10 : size === 4 ? 16 : 22;
    const b = size <= 3 ? 16 : size === 4 ? 24 : 32;
    if (m <= s) return 'S';
    if (m <= a) return 'A';
    if (m <= b) return 'B';
    return 'C';
  }

  function syncHud() {
    vm.progress = C.pct(litCount(board), n);
    vm.progressText = litCount(board) + ' / ' + n + ' 盏';
    vm.scoreText = '步数 ' + moves;
    vm.gradeNow = gradeMoves(moves);
    const target = Math.max(best, size <= 3 ? 6 : size === 4 ? 10 : 14);
    vm.goal = twist === 'arrayEye'
      ? '最优 ' + target + ' 步 · 已走 ' + moves + ' 步'
      : '目标 ' + target + ' 步内点亮 · 已走 ' + moves + ' 步';
    vm.hint = '阵眼感应剩 ' + hintsLeft + ' 次';
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      vm.cells[i].cls = board[i] ? 'cell cell--lit' : 'cell cell--off';
      vm.cells[i].label = board[i] ? (theme.glyph || '明') : '暗';
      vm.cells[i].tone = twist === 'wuxing' ? 1 + (Math.floor(i / size) + (i % size)) % 5 : 0;
    }
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '全阵皆明';
    vm.banner = grade === 'S' ? (theme.praise || '一眼破阵') : '';
    render();
    ctx.finish({ grade: grade, score: moves, summary: summary });
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '推演阵眼…';
    vm.banner = theme.banner || '';
    paint();
    syncHud();
    render();
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    history.push(index);
    toggle(board, size, index);
    moves += 1;
    paint();
    syncHud();
    C.flash(vm, theme.hit || '阵灯转明', 'good');
    if (allLit(board)) {
      finishOnce(gradeMoves(moves), moves + ' 步点亮全阵');
      return;
    }
    render();
  }

  function undo() {
    if (done || vm.phase !== 'playing' || history.length === 0) return;
    const index = history.pop();
    toggle(board, size, index);
    moves = Math.max(0, moves - 1);
    vm.status = '收回一步';
    paint();
    syncHud();
    render();
  }

  function hint() {
    if (done || vm.phase !== 'playing') return;
    if (hintsLeft <= 0) {
      C.flash(vm, '阵眼感应已用尽', 'bad');
      render();
      return;
    }
    const clicks = solve(board, size);
    if (clicks.length === 0) {
      vm.status = '阵眼已明，直接点完即可';
      render();
      return;
    }
    hintsLeft -= 1;
    const k = clicks[0];
    const prevCls = vm.cells[k].cls;
    vm.cells[k].cls = 'cell cell--hint';
    vm.status = '阵眼感应：这一格该点';
    syncHud();
    render();
    bag.after(function () {
      if (done || vm.phase !== 'playing') return;
      vm.cells[k].cls = prevCls;
      render();
    }, 1600);
  }

  paint();
  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    undo: undo,
    hint: hint,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'lights', name: '阵灯推演', create: create };
