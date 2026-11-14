'use strict';

// 九宫填数（推填九宫 / 术数·九宫诀专属）：数独。
//
// 与「阵灯推演」的区别：阵灯是点一下改一片状态的联动推演，走的是「省步数」；
// 这里是静态约束求解，填下去的每一格都不会改动别人，比的是「看得准、填得快」。
// 与「记序复现」的区别也很清楚：那里是记位置、这里是推数字，靠的是排除法不是记性。
//
// 一局一盘：盘面按难度给规格（4×4 / 6×6 / 9×9），宫格与待填数由本档注入。
// 填满且全对即完成；填错一格罚 10 秒（数落错了地方，得回头改），时辰到还没填完是走火 F。
// 评级只看用时（含罚时）：S / A / B 三条线由 data/practice.js 的 SUDOKU_LEVELS 按档给，
// 准备页与说明页照同一份数写，局内只报下一条线。

const C = require('./common.js');

const WRONG_PENALTY = 10;   // 填错一格罚多少秒
const MAX_TRIES = 60;       // 挖洞时最多试几次

// 宫格尺寸：4×4 两行两列、6×6 两行三列、9×9 三行三列。
function dimsOf(size) {
  if (size <= 4) return { br: 2, bc: 2 };
  if (size <= 6) return { br: 2, bc: 3 };
  return { br: 3, bc: 3 };
}

function canPlace(grid, size, d, row, col, v) {
  for (let c = 0; c < size; c += 1) if (grid[row * size + c] === v) return false;
  for (let r = 0; r < size; r += 1) if (grid[r * size + col] === v) return false;
  const r0 = Math.floor(row / d.br) * d.br;
  const c0 = Math.floor(col / d.bc) * d.bc;
  for (let r = r0; r < r0 + d.br; r += 1) {
    for (let c = c0; c < c0 + d.bc; c += 1) {
      if (grid[r * size + c] === v) return false;
    }
  }
  return true;
}

// 随机填满一盘：从头到尾按候选数洗牌后递归，第一盘一定是合法解。
function fillGrid(grid, size, d, pos) {
  if (pos >= size * size) return true;
  const row = Math.floor(pos / size);
  const col = pos % size;
  if (grid[pos] !== 0) return fillGrid(grid, size, d, pos + 1);
  const pool = [];
  for (let v = 1; v <= size; v += 1) if (canPlace(grid, size, d, row, col, v)) pool.push(v);
  C.shuffle(pool);
  for (let i = 0; i < pool.length; i += 1) {
    grid[pos] = pool[i];
    if (fillGrid(grid, size, d, pos + 1)) return true;
    grid[pos] = 0;
  }
  return false;
}

// 数解：最多数到 cap 个就停（挖洞只需要知道「还是不是唯一解」）。
function countSolutions(grid, size, d, cap) {
  const board = grid.slice();
  let found = 0;
  function step() {
    let pos = -1;
    for (let i = 0; i < board.length; i += 1) {
      if (board[i] === 0) { pos = i; break; }
    }
    if (pos < 0) { found += 1; return found >= cap; }
    const row = Math.floor(pos / size);
    const col = pos % size;
    for (let v = 1; v <= size; v += 1) {
      if (!canPlace(board, size, d, row, col, v)) continue;
      board[pos] = v;
      if (step()) { board[pos] = 0; return true; }
      board[pos] = 0;
    }
    return false;
  }
  step();
  return found;
}

// 从完整解里挖洞：每挖一格都要验一遍「解还唯一」，验不过就填回去。
// 这样每一盘都能纯靠推理解完，不会出现要赌的局面。
function dig(solution, size, d, holes) {
  const grid = solution.slice();
  const order = [];
  for (let i = 0; i < grid.length; i += 1) order.push(i);
  C.shuffle(order);
  let left = holes;
  for (let k = 0; k < order.length && left > 0; k += 1) {
    const i = order[k];
    const keep = grid[i];
    grid[i] = 0;
    if (countSolutions(grid, size, d, 2) === 1) left -= 1;
    else grid[i] = keep;
  }
  return grid;
}

function makePuzzle(size, holes) {
  const d = dimsOf(size);
  for (let tries = 0; tries < MAX_TRIES; tries += 1) {
    const solution = new Array(size * size).fill(0);
    if (!fillGrid(solution, size, d, 0)) continue;
    const puzzle = dig(solution, size, d, holes);
    let blanks = 0;
    for (let i = 0; i < puzzle.length; i += 1) if (puzzle[i] === 0) blanks += 1;
    // 挖不满就重来一盘：挖不满说明这盘的解太「松」，盘面会比本档该有的简单。
    if (blanks >= Math.max(4, holes - 1)) return { puzzle: puzzle, solution: solution };
  }
  // 兜底：给一盘完整解 + 只挖正中一格，保证有解、也保证能完成。
  const solution = new Array(size * size).fill(0);
  fillGrid(solution, size, d, 0);
  const puzzle = solution.slice();
  puzzle[Math.floor(puzzle.length / 2)] = 0;
  return { puzzle: puzzle, solution: solution };
}

// 一行一行读回：同一行里连着两个空格要留出分隔，不然读起来像一格。
function summaryOf(filled, total, elapsed) {
  return '填满 ' + filled + ' / ' + total + ' 格 · 用 ' + elapsed + ' 秒';
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const size = Math.max(4, Math.min(9, p.size || 4));
  const d = dimsOf(size);
  const n = size * size;
  const holes = Math.max(1, Math.min(n - 2, p.holes || Math.round(n * 0.45)));
  const timeLimit = Math.max(60, p.timeLimit || 180);
  const lines = [
    Math.max(10, p.tS || 60),
    Math.max(20, p.tA || 90),
    Math.max(30, p.tB || 130),
  ];
  const costText = ctx.tip || '一格填错罚 ' + WRONG_PENALTY + ' 秒';

  const bag = C.TimerBag();
  const vm = C.makeVm(size, n, '每行每列每宫各填一遍 ' + size + ' 个数', costText);
  vm.extras.compact = size >= 9;
  vm.extras.showHint = false;
  vm.extras.showReset = false;
  // 填数要 1–9 的数字键：与落石的方向键共用同一排按钮，只是换成数字。
  const keys = [];
  for (let v = 1; v <= size; v += 1) keys.push({ id: 'k' + v, dir: String(v), glyph: String(v) });
  keys.push({ id: 'kx', dir: '0', glyph: '✕' });
  vm.pad = { keys: keys, digits: true };
  vm.extras.showPad = true;

  let puzzle, solution;
  let grid;
  let selected = -1;
  let wrong = 0;
  let elapsed = 0;
  let penalty = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function peers(i) {
    const r = Math.floor(i / size);
    const c = i % size;
    const r0 = Math.floor(r / d.br) * d.br;
    const c0 = Math.floor(c / d.bc) * d.bc;
    return function (j) {
      const jr = Math.floor(j / size);
      const jc = j % size;
      return jr === r || jc === c
        || (jr >= r0 && jr < r0 + d.br && jc >= c0 && jc < c0 + d.bc);
    };
  }

  function paint() {
    const same = selected >= 0 ? peers(selected) : null;
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const v = grid[i];
      const fixed = puzzle[i] !== 0;
      cell.arrow = -1;
      cell.end = false;
      cell.label = v ? String(v) : '';
      cell.tone = 0;
      let cls = 'cell';
      if (v) cls += fixed ? ' cell--given' : (v === solution[i] ? ' cell--open' : ' cell--bad');
      else cls += ' cell--off';
      if (selected >= 0 && i === selected) cls += ' cell--sel';
      else if (same && !fixed && v === 0 && same(i)) cls += ' cell--peer';
      cell.cls = cls;
    }
    vm.sudoku = { size: size, box: d, given: puzzle.slice(), grid: grid.slice() };
  }

  function filledCount() {
    let k = 0;
    for (let i = 0; i < n; i += 1) if (grid[i]) k += 1;
    return k;
  }

  function used() { return elapsed + penalty; }

  function syncHud() {
    const filled = filledCount();
    vm.timeText = C.mmss(Math.max(0, timeLimit - used()));
    vm.progress = C.pct(filled, n);
    vm.progressText = '已填 ' + filled + ' / ' + n;
    vm.scoreText = '用时 ' + used() + ' 秒';
    vm.goal = C.paceGoal(used(), lines, '填错 ' + wrong + ' 格');
    vm.gradeNow = used() <= lines[0] ? 'S' : used() <= lines[1] ? 'A' : used() <= lines[2] ? 'B' : 'C';
    vm.hint = costText + ' · 本档 ' + size + '×' + size + ' · ' + lines[0] + ' 秒内 S';
  }

  function gradeOf() {
    if (used() <= lines[0]) return 'S';
    if (used() <= lines[1]) return 'A';
    if (used() <= lines[2]) return 'B';
    return 'C';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = grade === 'F' ? '时辰到' : '填满';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({
      grade: grade,
      score: grade === 'F' ? 0 : Math.max(0, (lines[2] - used()) * 10 + 200),
      summary: summary,
      notes: notesOf(),
    });
  }

  function checkDone() {
    for (let i = 0; i < n; i += 1) if (grid[i] !== solution[i]) return false;
    return true;
  }

  function notesOf() {
    const notes = [];
    if (used() <= lines[0]) notes.push('用时 ' + used() + ' 秒，进了 S 线（' + lines[0] + ' 秒）。');
    else if (used() <= lines[1]) notes.push('用时 ' + used() + ' 秒 · S 线是 ' + lines[0] + ' 秒，差 ' + (used() - lines[0]) + ' 秒。');
    else if (used() <= lines[2]) notes.push('用时 ' + used() + ' 秒 · A 线是 ' + lines[1] + ' 秒。');
    else notes.push('用时 ' + used() + ' 秒，已过 B 线（' + lines[2] + ' 秒）。');
    if (wrong) notes.push('填错 ' + wrong + ' 格，罚了 ' + penalty + ' 秒：错数不改，最后还是要回头补。');
    return notes;
  }

  function finishOk() {
    const grade = gradeOf();
    C.flash(vm, '填满 · 用 ' + used() + ' 秒', 'gold');
    finishOnce(grade, summaryOf(n, n, used()));
  }

  function finishTimeUp() {
    C.flash(vm, '时辰到 · 没填完', 'bad');
    finishOnce('F', '时辰到，还剩 ' + (n - filledCount()) + ' 格没填');
  }

  function place(v) {
    if (done || vm.phase !== 'playing') return;
    if (selected < 0 || puzzle[selected] !== 0) {
      vm.status = '先点一个空格，再点下面的数字';
      render();
      return;
    }
    if (grid[selected] === v) { grid[selected] = 0; }
    else {
      grid[selected] = v;
      if (v !== solution[selected]) {
        wrong += 1;
        penalty += WRONG_PENALTY;
        C.flash(vm, '这一格不对 · 罚 ' + WRONG_PENALTY + ' 秒', 'bad');
      } else {
        C.flash(vm, '这一格对了', 'good');
      }
    }
    paint();
    syncHud();
    if (checkDone()) { finishOk(); return; }
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    vm.status = '点空格选中，再点下面的数字填进去';
    paint();
    syncHud();
    render();
    bag.every(function () {
      if (done) return;
      elapsed += 1;
      if (used() >= timeLimit) { syncHud(); finishTimeUp(); return; }
      syncHud();
      render();
    }, 1000);
  }

  // 开局先把盘摆好（不计时），玩家点「开始」才起表。
  (function build() {
    const made = makePuzzle(size, holes);
    puzzle = made.puzzle;
    solution = made.solution;
    grid = puzzle.slice();
    paint();
    syncHud();
    render();
  }());

  return C.fillController({
    start: start,
    tap: function (index) {
      if (done || vm.phase !== 'playing') return;
      if (index < 0 || index >= n) return;
      if (puzzle[index] !== 0) { vm.status = '这一格是题面，改不得'; render(); return; }
      selected = index;
      vm.status = '已选一格 · 点下面的数字填进去';
      paint();
      render();
    },
    move: function (dir) {
      if (dir === '0') {
        if (selected >= 0 && puzzle[selected] === 0) {
          grid[selected] = 0;
          paint();
          syncHud();
          render();
        }
        return;
      }
      const v = parseInt(dir, 10);
      if (v >= 1) place(v);
    },
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const t = [Math.max(10, (p && p.tS) || 60), Math.max(20, (p && p.tA) || 90), Math.max(30, (p && p.tB) || 130)];
  return {
    rule: '按用时评级（含填错的罚时；填满且全对才算完成）',
    items: [
      'S：' + t[0] + ' 秒内填满',
      'A：' + t[1] + ' 秒内',
      'B：' + t[2] + ' 秒内',
      'C：超过 ' + t[2] + ' 秒才填满',
    ],
    fail: '时辰到还没填完 → 走火 F，这一局没有收益',
  };
}

// 把一盘题面补成完整解。题面本身保证唯一解，所以随便怎么填都填到同一个答案。
// 测试拿它把一盘真的填完，验证「填满即完成」这条路是通的。
function solveGrid(grid, size) {
  const d = dimsOf(size);
  const board = grid.slice();
  fillGrid(board, size, d, 0);
  return board;
}

module.exports = {
  id: 'sudoku',
  name: '九宫填数',
  create: create,
  lines: lines,
  makePuzzle: makePuzzle,
  solveGrid: solveGrid,
  countSolutions: countSolutions,
  dimsOf: dimsOf,
};
