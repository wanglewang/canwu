'use strict';

// A3-43 点灯（Lights Out）：点一格翻转十字，令全盘点亮，比步数。
// 盘面由「全亮」随机翻转生成，保证一定有解。

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
  const p = ctx.params;
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const size = Math.min(5, p.size + (hard ? 1 : 0));
  const scramble = p.scramble + (hard ? 3 : 0);
  const n = size * size;
  const vm = C.makeVm(size, n, '让所有阵灯同时亮起', ctx.tip || '点一格会翻转它和上下左右');
  vm.scoreText = '步数 0';
  vm.extras.showUndo = true;
  vm.extras.showHint = !!perks.easy;

  const bag = C.TimerBag();
  const board = new Array(n).fill(true);
  const history = [];
  let moves = 0;
  let done = false;
  let started = false;

  // 生成可解且非已解的盘面
  for (let i = 0; i < scramble; i += 1) toggle(board, size, C.randInt(n));
  if (allLit(board)) toggle(board, size, C.randInt(n));

  function render() { ctx.render(vm); }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      vm.cells[i].cls = board[i] ? 'cell cell--lit' : 'cell cell--off';
      vm.cells[i].label = board[i] ? '明' : '暗';
    }
    vm.scoreText = '步数 ' + moves;
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '全阵皆明';
    render();
    ctx.finish({ grade: grade, score: moves, summary: summary });
  }

  function gradeMoves(m) {
    const s = size <= 3 ? 6 : size === 4 ? 10 : 14;
    const a = size <= 3 ? 10 : size === 4 ? 16 : 22;
    const b = size <= 3 ? 16 : size === 4 ? 24 : 32;
    if (m <= s) return 'S';
    if (m <= a) return 'A';
    if (m <= b) return 'B';
    return 'C';
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '推演阵眼…';
    paint();
    render();
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    history.push(index);
    toggle(board, size, index);
    moves += 1;
    paint();
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
    render();
  }

  function hint() {
    if (done || vm.phase !== 'playing') return;
    const clicks = solve(board, size);
    if (clicks.length === 0) {
      vm.status = '阵眼已明，直接点完即可';
      render();
      return;
    }
    const k = clicks[0];
    const prevCls = vm.cells[k].cls;
    vm.cells[k].cls = 'cell cell--hint';
    vm.status = '阵眼感应：这一格该点';
    render();
    bag.after(function () {
      if (done || vm.phase !== 'playing') return;
      vm.cells[k].cls = prevCls;
      render();
    }, 1600);
  }

  paint();
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

module.exports = { id: 'lights', name: '点灯', create: create };
