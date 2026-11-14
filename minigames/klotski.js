'use strict';

// 滑块让路（挪块开路 / 机巧·让路诀专属）：华容道。
//
// 与「落石垒基」的区别：垒石是按时间下落、一块一块堆；这里是静态的若干块，
// 每次只挪一格，谁也落不下来，考的是「先给谁让路」。
// 与「推石入位」的区别：推箱是走人、只推不拉、要把箱子推进阵位；
// 这里是整块滑、能左右挪动，目标只有一个：把主块挪到底部出口。
//
// 一局一盘：四路方向键挪当前选中的块，一块一格地滑。主块落到盘底的出口即脱身。
// 步数预算按本盘最优步数给，走满还没脱身就是走火 F（困住了，不是挪得糙）。
// 评级看「已走步数 / 本盘最优步数」，与阵灯推演同一把尺子——但盘面与操作完全不同：
// 那边点一格改一片，这里挪一块只动一块。

const C = require('./common.js');

// 4×4 的小盘：主块 2×2、横块 1×2、竖块 2×1、两个散块 1×1，空格六格。
// 块越少空越多，越容易挪开；难度靠「最优步数」上下限控制，不靠加大盘面。
const SHAPES = [
  { id: 'main', w: 2, h: 2, glyph: '主' },
  { id: 'wide', w: 2, h: 1, glyph: '' },
  { id: 'tall', w: 1, h: 2, glyph: '' },
  { id: 'ga', w: 1, h: 1, glyph: '' },
  { id: 'gb', w: 1, h: 1, glyph: '' },
];

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function occupancy(state, shapes, cols, rows) {
  const grid = new Array(cols * rows).fill(-1);
  for (let i = 0; i < shapes.length; i += 1) {
    const s = shapes[i];
    const p = state[i];
    for (let r = 0; r < s.h; r += 1) {
      for (let c = 0; c < s.w; c += 1) {
        const rr = p[0] + r;
        const cc = p[1] + c;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return null;
        const k = rr * cols + cc;
        if (grid[k] !== -1) return null;
        grid[k] = i;
      }
    }
  }
  return grid;
}

// 两个散块互换不算新局：把它们的坐标排一下序，BFS 的 visited 才不会被同构状态挤满。
function keyOf(state) {
  const parts = [];
  for (let i = 0; i < state.length; i += 1) {
    parts.push(state[i][0] + ',' + state[i][1]);
  }
  const tail = [parts[3], parts[4]].sort();
  parts[3] = tail[0];
  parts[4] = tail[1];
  return parts.join(';');
}

function isSolved(state, cols, rows) {
  // 主块要落在盘底正中：列数减二再折半是唯一位。
  return state[0][0] === rows - 2 && state[0][1] === Math.floor((cols - 2) / 2);
}

function neighbors(state, shapes, cols, rows) {
  const out = [];
  for (let i = 0; i < shapes.length; i += 1) {
    for (let k = 0; k < DIRS.length; k += 1) {
      const next = state.map(function (p) { return [p[0], p[1]]; });
      next[i][0] += DIRS[k][0];
      next[i][1] += DIRS[k][1];
      if (next[i][0] < 0 || next[i][1] < 0) continue;
      if (next[i][0] + shapes[i].h > rows || next[i][1] + shapes[i].w > cols) continue;
      if (!occupancy(next, shapes, cols, rows)) continue;
      out.push(next);
    }
  }
  return out;
}

// 广度优先：这块盘的状态空间只有几千个，比穷举猜步数靠谱得多。
// 返回最少几步能脱身；无解返回 -1。
function solve(state, shapes, cols, rows, cap) {
  if (isSolved(state, cols, rows)) return 0;
  const limit = cap || 40;
  const seen = {};
  let frontier = [state];
  seen[keyOf(state)] = true;
  for (let depth = 1; depth <= limit; depth += 1) {
    const next = [];
    for (let i = 0; i < frontier.length; i += 1) {
      const list = neighbors(frontier[i], shapes, cols, rows);
      for (let j = 0; j < list.length; j += 1) {
        const k = keyOf(list[j]);
        if (seen[k]) continue;
        seen[k] = true;
        if (isSolved(list[j], cols, rows)) return depth;
        next.push(list[j]);
      }
    }
    if (!next.length) return -1;
    frontier = next;
  }
  return -1;
}

// 与 solve 同一套搜索，但把「怎么走」也带回来：每一步是「挪第几块、往哪个方向」。
// 测试用它真的把一盘走完，免得「能解」只是算出来而没人走过。
function solvePath(state, shapes, cols, rows, cap) {
  const limit = cap || 40;
  const seen = {};
  const startKey = keyOf(state);
  seen[startKey] = null;
  let frontier = [{ state: state, key: startKey }];
  for (let depth = 1; depth <= limit; depth += 1) {
    const next = [];
    for (let f = 0; f < frontier.length; f += 1) {
      const node = frontier[f];
      for (let i = 0; i < shapes.length; i += 1) {
        for (let k = 0; k < DIRS.length; k += 1) {
          const cand = node.state.map(function (q) { return [q[0], q[1]]; });
          cand[i][0] += DIRS[k][0];
          cand[i][1] += DIRS[k][1];
          if (cand[i][0] < 0 || cand[i][1] < 0) continue;
          if (cand[i][0] + shapes[i].h > rows || cand[i][1] + shapes[i].w > cols) continue;
          if (!occupancy(cand, shapes, cols, rows)) continue;
          const kk = keyOf(cand);
          if (seen[kk] !== undefined) continue;
          seen[kk] = { prev: node.key, piece: i, dir: DIRS[k] };
          if (isSolved(cand, cols, rows)) {
            const moves = [];
            let cur = kk;
            while (seen[cur]) {
              const step = seen[cur];
              moves.push({ piece: step.piece, dir: step.dir });
              cur = step.prev;
            }
            return moves.reverse();
          }
          next.push({ state: cand, key: kk });
        }
      }
    }
    if (!next.length) return null;
    frontier = next;
  }
  return null;
}

function randomState(shapes, cols, rows) {  const state = [];
  const grid = new Array(cols * rows).fill(0);
  for (let i = 0; i < shapes.length; i += 1) {
    const s = shapes[i];
    const spots = [];
    for (let r = 0; r + s.h <= rows; r += 1) {
      for (let c = 0; c + s.w <= cols; c += 1) {
        let ok = true;
        for (let rr = 0; rr < s.h && ok; rr += 1) {
          for (let cc = 0; cc < s.w && ok; cc += 1) {
            if (grid[(r + rr) * cols + (c + cc)]) ok = false;
          }
        }
        if (ok) spots.push([r, c]);
      }
    }
    if (!spots.length) return null;
    const pick = spots[C.randInt(spots.length)];
    for (let rr = 0; rr < s.h; rr += 1) {
      for (let cc = 0; cc < s.w; cc += 1) grid[(pick[0] + rr) * cols + (pick[1] + cc)] = 1;
    }
    state.push(pick);
  }
  return state;
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const cols = 4;
  const rows = 4;
  const minOpt = Math.max(1, p.minOpt || 3);
  const maxOpt = Math.max(minOpt, p.maxOpt || minOpt + 3);
  const capFactor = Math.max(1.6, p.capFactor || 2.4);

  const vm = C.makeVm(cols, 0, '把主块挪到盘底的出口', '一步一格 · 只挪一块');
  vm.stage = 'klotski';
  vm.extras.showGrid = false;
  vm.extras.showProgress = true;
  vm.extras.showPad = true;
  // 挪错一步就退不回去：给一个「盘面复位」，步数清零但最优步数不变。
  vm.extras.showReset = true;
  vm.pad = {
    keys: [
      { id: 'up', dir: 'up', glyph: '▲' },
      { id: 'left', dir: 'left', glyph: '◀' },
      { id: 'down', dir: 'down', glyph: '▼' },
      { id: 'right', dir: 'right', glyph: '▶' },
    ],
  };

  const costText = ctx.tip || '步数用尽还没脱身就是困住了';
  let state = [];
  let startState = [];
  let optimal = minOpt;
  let capSteps = Math.ceil(optimal * capFactor);
  let moves = 0;
  let selected = 0;
  let failed = false;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function paint() {
    const blocks = [];
    for (let i = 0; i < SHAPES.length; i += 1) {
      const s = SHAPES[i];
      blocks.push({
        id: s.id,
        x: state[i][1] * 25,
        y: state[i][0] * 25,
        w: s.w * 25,
        h: s.h * 25,
        sel: i === selected,
        main: i === 0,
      });
    }
    vm.klotski = { cols: cols, rows: rows, blocks: blocks, exitC: Math.floor((cols - 2) / 2) };
  }

  function syncHud() {
    vm.timeText = '余 ' + Math.max(0, capSteps - moves) + ' 步';
    vm.progress = C.pct(moves, capSteps);
    vm.progressText = '已走 ' + moves + ' / ' + capSteps;
    vm.scoreText = '已走 ' + moves + ' 步';
    vm.goal = '已走 ' + moves + ' 步 · 最优 ' + optimal + ' 步 · 预算 ' + capSteps + ' 步';
    vm.gradeNow = failed ? 'F' : moves <= optimal ? 'S' : moves <= optimal + 2 ? 'A' : moves <= optimal * 2 ? 'B' : 'C';
    vm.hint = costText + ' · 先点一块选中，再按方向键挪';
  }

  function newBoard() {
    let pick = null;
    for (let t = 0; t < 40 && !pick; t += 1) {
      const cand = randomState(SHAPES, cols, rows);
      if (!cand) continue;
      if (isSolved(cand, cols, rows)) continue;
      const steps = solve(cand, SHAPES, cols, rows, maxOpt + 6);
      if (steps < minOpt || steps > maxOpt) continue;
      pick = { state: cand, steps: steps };
    }
    if (!pick) {
      // 兜底：主块放在出口正上方一格，挪一步就到。绝不把无解盘丢给玩家。
      const fallback = [[rows - 3, Math.floor((cols - 2) / 2)], [0, 0], [0, 2], [0, 3], [1, 3]];
      pick = { state: fallback, steps: Math.max(1, solve(fallback, SHAPES, cols, rows, 20)) };
    }
    state = pick.state.map(function (q) { return [q[0], q[1]]; });
    startState = pick.state.map(function (q) { return [q[0], q[1]]; });
    optimal = pick.steps;
    capSteps = Math.max(optimal + 5, Math.ceil(optimal * capFactor));
    moves = 0;
    selected = 0;
    failed = false;
    vm.banner = theme.banner || '';
    vm.status = '先点一块选中，再按方向键挪';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    vm.phase = 'done';
    vm.status = grade === 'F' ? '困住了' : '脱身';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({ grade: grade, score: failed ? 0 : Math.max(0, (capSteps - moves) * 10), summary: summary, notes: notesOf() });
  }

  function notesOf() {
    const notes = [];
    if (failed) {
      notes.push('预算 ' + capSteps + ' 步走完，主块还堵在盘里。');
      notes.push('这一盘最优是 ' + optimal + ' 步；下一局先看主块上下两条路，别先动散块。');
      return notes;
    }
    const gap = moves - optimal;
    if (gap <= 0) notes.push('正好 ' + optimal + ' 步，一步没浪费。');
    else if (gap <= 2) notes.push('比最优多走 ' + gap + ' 步（最优 ' + optimal + ' 步）· S 要一步不差。');
    else if (moves <= optimal * 2) notes.push('走了 ' + moves + ' 步，最优 ' + optimal + ' 步 · A 线是多两步以内。');
    else notes.push('走了 ' + moves + ' 步，超过最优的两倍（' + optimal * 2 + ' 步）。');
    return notes;
  }

  function checkFail() {
    if (done) return false;
    if (moves >= capSteps && !isSolved(state, cols, rows)) {
      failed = true;
      C.flash(vm, '步数用尽 · 困住了', 'bad');
      finishOnce('F', '步数用尽，主块未脱身');
      return true;
    }
    return false;
  }

  function slide(dir) {
    if (done || vm.phase !== 'playing') return;
    const k = { up: 0, down: 1, left: 2, right: 3 }[dir];
    if (k === undefined) return;
    const next = state.map(function (q) { return [q[0], q[1]]; });
    next[selected][0] += DIRS[k][0];
    next[selected][1] += DIRS[k][1];
    if (!occupancy(next, SHAPES, cols, rows)) {
      vm.status = '那边挪不动，换一块或换个方向';
      C.flash(vm, '挪不动', 'bad');
      render();
      return;
    }
    state = next;
    moves += 1;
    paint();
    syncHud();
    if (isSolved(state, cols, rows)) {
      C.flash(vm, '脱身 · ' + moves + ' 步', 'gold');
      finishOnce(moves <= optimal ? 'S' : moves <= optimal + 2 ? 'A' : moves <= optimal * 2 ? 'B' : 'C',
        '脱身 · 用 ' + moves + ' 步（最优 ' + optimal + ' 步）');
      return;
    }
    if (checkFail()) return;
    C.flash(vm, '挪了一格', 'good');
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    paint();
    syncHud();
    render();
  }

  newBoard();
  paint();
  syncHud();
  render();

  return C.fillController({
    start: start,
    tap: function (index) {
      if (done || vm.phase !== 'playing') return;
      if (index < 0 || index >= SHAPES.length) return;
      selected = index;
      vm.status = '已选中一块 · 按方向键挪';
      paint();
      render();
    },
    move: slide,
    reset: function () {
      if (done || vm.phase !== 'playing') return;
      state = startState.map(function (q) { return [q[0], q[1]]; });
      moves = 0;
      failed = false;
      paint();
      syncHud();
      vm.status = '盘面已复位 · 步数清零';
      C.flash(vm, '盘面复位 · 步数清零', 'good');
      render();
    },
    abandon: function () { finishOnce('F', '中途收功'); },
  });
}

function lines(p) {
  const minOpt = Math.max(1, (p && p.minOpt) || 3);
  return {
    rule: '按已走步数与本盘最优步数比（不论用时，想得久不扣）',
    items: [
      'S：正好走最优步数',
      'A：多 2 步以内',
      'B：不超过最优的两倍',
      'C：超过两倍才脱身（本档最优约 ' + minOpt + ' 步起）',
    ],
    fail: '步数预算走完主块还没到出口（困住了）→ 走火 F，只算两成收益',
  };
}

module.exports = {
  id: 'klotski',
  name: '滑块让路',
  create: create,
  lines: lines,
  solve: solve,
  solvePath: solvePath,
  SHAPES: SHAPES,
};
