'use strict';

// 滑格相合（同数相合 / 合术·叠元诀专属）：2048。
//
// 与「落石垒基」的区别：那里是一块一块往下落、靠形状填满整层；
// 这里是四条边任你推，整行整列一起挤，靠的是「同数相撞翻倍」。
// 与「三秀同收」的区别：三消是换相邻两格凑三连，这里是同一行整体滑到底、撞上才合。
//
// 一局一盘：四条方向键把全盘往那个方向挤，同数相撞合成双倍，空出来的格子里补一块新的。
// 合出本档的目标块即收功；盘满又推不动了就是走火 F（无路可走，不是「打得糙」）。
// 评级看最大那一块合到多大，倍率之外不再看别的；得分（合并值累加）只用来破纪录。

const C = require('./common.js');

// 目标块按档递进：一块 128 大约三四十手，1024 要一路合到底。
const TARGETS = [128, 256, 256, 512, 1024];

function linesOf(p) {
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  const goal = Math.max(8, p && p.target ? p.target : TARGETS[depth]);
  return [goal, Math.max(8, goal / 2), Math.max(8, goal / 4)];
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const cols = Math.max(3, Math.min(6, p.cols || 4));
  const rows = Math.max(3, Math.min(6, p.rows || 4));
  const n = cols * rows;
  const lim = linesOf(p);
  const target = lim[0];
  const costText = ctx.tip || '推不动就完了：盘满且相邻没有同数';

  const bag = C.TimerBag();
  const vm = C.makeVm(cols, n, '把同数挤到一起合上去', costText);
  vm.pad = {
    keys: [
      { id: 'up', dir: 'up', glyph: '▲' },
      { id: 'left', dir: 'left', glyph: '◀' },
      { id: 'down', dir: 'down', glyph: '▼' },
      { id: 'right', dir: 'right', glyph: '▶' },
    ],
  };
  vm.extras.showPad = true;
  vm.extras.showCombo = true;

  let grid = new Array(n).fill(0);
  let score = 0;
  let moves = 0;
  let best = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function tileTone(v) {
    let t = 1;
    let x = v;
    while (x > 2 && t < 8) { x /= 2; t += 1; }
    return t;
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const v = grid[i];
      cell.arrow = -1;
      cell.end = false;
      cell.label = v ? String(v) : '';
      cell.tone = v ? tileTone(v) : 0;
      cell.cls = v ? 'cell cell--num' : 'cell cell--void';
    }
    vm.merge = { board: grid.slice(), cols: cols, rows: rows, target: target };
  }

  function maxTile() {
    let m = 0;
    for (let i = 0; i < n; i += 1) if (grid[i] > m) m = grid[i];
    return m;
  }

  function syncHud() {
    best = maxTile();
    vm.timeText = '第 ' + moves + ' 手';
    vm.progress = C.pct(best, target);
    vm.progressText = '最大 ' + best + ' / ' + target;
    vm.scoreText = '得分 ' + score;
    vm.combo = best;
    vm.comboText = best ? '最大一块 ' + best : '';
    vm.goal = best >= target ? '已合出目标块' : '再合到 ' + target + ' 就收功';
    vm.gradeNow = best >= lim[0] ? 'S' : best >= lim[1] ? 'A' : best >= lim[2] ? 'B' : 'C';
    vm.hint = costText + ' · 本档目标 ' + target + ' 一块';
  }

  function emptyCells() {
    const out = [];
    for (let i = 0; i < n; i += 1) if (!grid[i]) out.push(i);
    return out;
  }

  function spawn() {
    const free = emptyCells();
    if (!free.length) return;
    const i = free[C.randInt(free.length)];
    // 四成给 4、六成给 2：全是 2 的盘推起来太慢，全是 4 又太送。
    grid[i] = Math.random() < 0.4 ? 4 : 2;
  }

  // 一条线上的挤压：先去掉空格，再让相邻同数两两相合，最后补空格。
  function squeeze(indices) {
    const vals = [];
    for (let i = 0; i < indices.length; i += 1) {
      if (grid[indices[i]]) vals.push(grid[indices[i]]);
    }
    const out = [];
    for (let i = 0; i < vals.length; i += 1) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        const merged = vals[i] * 2;
        out.push(merged);
        score += merged;
        i += 1;
      } else {
        out.push(vals[i]);
      }
    }
    let changed = false;
    for (let i = 0; i < indices.length; i += 1) {
      const v = i < out.length ? out[i] : 0;
      if (grid[indices[i]] !== v) changed = true;
      grid[indices[i]] = v;
    }
    return changed;
  }

  function lineOf(dir, k) {
    const list = [];
    if (dir === 'left' || dir === 'right') {
      for (let c = 0; c < cols; c += 1) list.push(k * cols + c);
      return dir === 'right' ? list.reverse() : list;
    }
    for (let r = 0; r < rows; r += 1) list.push(r * cols + k);
    return dir === 'down' ? list.reverse() : list;
  }

  function stuck() {
    if (emptyCells().length) return false;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const v = grid[r * cols + c];
        if (c + 1 < cols && grid[r * cols + c + 1] === v) return false;
        if (r + 1 < rows && grid[(r + 1) * cols + c] === v) return false;
      }
    }
    return true;
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = grade === 'F' ? '推不动了' : '合成了';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary, notes: notesOf(grade) });
  }

  function notesOf(grade) {
    const notes = [];
    if (grade === 'F') {
      notes.push('盘满且相邻没有同数，这一步之后再推也合不动了。');
      notes.push('下一局先把大块留在一角，别让它被小块围死。');
      return notes;
    }
    notes.push('合出 ' + best + ' 一块，用了 ' + moves + ' 手。');
    if (grade !== 'S') notes.push('本档 S 要合出 ' + lim[0] + ' 一块，还差 ' + (lim[0] - best) + '。');
    return notes;
  }

  function gradeOf() {
    if (best >= lim[0]) return 'S';
    if (best >= lim[1]) return 'A';
    if (best >= lim[2]) return 'B';
    return 'C';
  }

  function move(dir) {
    if (done || vm.phase !== 'playing') return;
    if (['up', 'down', 'left', 'right'].indexOf(dir) < 0) return;
    // 目标块是这一手刚合出来的才算「合出」：先记下推之前的最大块。
    const before = maxTile();
    let changed = false;
    const lines = dir === 'left' || dir === 'right' ? rows : cols;
    for (let k = 0; k < lines; k += 1) {
      if (squeeze(lineOf(dir, k))) changed = true;
    }
    if (!changed) {
      vm.status = '这个方向推不动';
      C.flash(vm, '推不动 · 换个方向', 'bad');
      render();
      return;
    }
    moves += 1;
    const promoted = maxTile() >= target && before < target;
    spawn();
    paint();
    syncHud();
    if (promoted) {
      C.flash(vm, '合出 ' + target + ' · 收功', 'gold');
      finishOnce(gradeOf(), '合出 ' + best + ' 一块 · ' + moves + ' 手');
      return;
    }
    if (stuck()) {
      C.flash(vm, '推不动了 · 盘满无同数', 'bad');
      paint();
      finishOnce('F', '盘满且无同数，推不动');
      return;
    }
    C.flash(vm, '合到 ' + best, 'good');
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    vm.status = '按方向键把同数挤到一起';
    grid = new Array(n).fill(0);
    score = 0;
    moves = 0;
    spawn();
    spawn();
    paint();
    syncHud();
    render();
  }

  paint();
  syncHud();
  render();

  return C.fillController({
    start: start,
    move: move,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const lim = linesOf(p);
  return {
    rule: '按最大那一块合到多大评级（合出本档目标块即收功）',
    items: [
      'S：合出 ' + lim[0] + ' 一块',
      'A：合出 ' + lim[1] + ' 一块',
      'B：合出 ' + lim[2] + ' 一块',
      'C：没合到 ' + lim[2] + ' 一块',
    ],
    fail: '盘满且相邻没有同数、再也推不动 → 走火 F，这一局没有收益',
  };
}

module.exports = {
  id: 'merge',
  name: '滑格相合',
  create: create,
  lines: lines,
  TARGETS: TARGETS,
};
