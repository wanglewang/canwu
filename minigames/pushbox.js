'use strict';

// 推石入位（归箱入阵 / 挪移·入位诀专属）：推箱子。
//
// 与「滑块让路」的区别：华容道是整块滑、能左右挪，只求主块出去；
// 这里是人走、石箱只会被推、拉不回来，每个箱子都要对上自己的阵位。
// 与「垒石垒基」的区别：那边是按时间落石堆层，这里是静态盘上的搬运。
//
// 一局一图：方向键走人，走到石箱后面就能推它一格（推不回来，撞墙与撞箱都推不动）。
// 每个阵位都压上一块石箱即入位。推数预算按本图最优推数给，推满还没入位就是走火 F。
// 评级看「已推次数 / 本图最优推数」——用推数而不是步数，是因为走多少步不值钱，
// 把箱子推错方向才是真的费事。

const C = require('./common.js');

// 六张六格的图：# 墙 / . 地 / b 石箱 / o 阵位 / p 人 / * 箱在阵位上 / + 人在阵位上。
// 每张都验过能解；难度靠图与最优推数递进，不靠加大盘面。
const LEVELS = [
  // 两张两推：先教「绕到箱子背后才推得动」。
  [
    '######',
    '#....#',
    '#.b..#',
    '#..o.#',
    '#.p..#',
    '######',
  ],
  // 三推：中间多一道石壁，得把箱子推下去再横着挪。
  [
    '######',
    '#....#',
    '#.b#.#',
    '#...o#',
    '#.p..#',
    '######',
  ],
  // 四推：路被墙角收窄，推错方向就再也推不回来。
  [
    '######',
    '#....#',
    '#.b..#',
    '#.#..#',
    '#.o..#',
    '#..p.#',
    '######',
  ],
  // 四推、两个箱子：两处阵位各要一块，不能拿一块顶两处。
  [
    '######',
    '#....#',
    '#.b.b#',
    '#....#',
    '#.o.o#',
    '#.p..#',
    '######',
  ],
  // 六推：两箱两阵位，中间有隔断，得先给一块让路。
  [
    '######',
    '#....#',
    '#.b.b#',
    '#.#..#',
    '#.o.o#',
    '#..p.#',
    '######',
  ],
];

function parse(rows) {
  const out = { cols: 0, rows: rows.length, walls: [], boxes: [], goals: [], player: 0 };
  out.cols = rows[0].length;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const ch = rows[r][c];
      const i = r * out.cols + c;
      if (ch === '#') out.walls.push(i);
      if (ch === 'b' || ch === '*') out.boxes.push(i);
      if (ch === 'o' || ch === '*' || ch === '+') out.goals.push(i);
      if (ch === 'p' || ch === '+') out.player = i;
    }
  }
  return out;
}

function isWall(walls, cols, i) { return walls.indexOf(i) >= 0; }

// 人从 player 出发能走到的格子（箱子挡路）。判「推之前人能不能站到箱子后面」用它。
function reachable(walls, boxes, cols, rows, from) {
  const seen = {};
  const stack = [from];
  seen[from] = true;
  const out = [];
  while (stack.length) {
    const i = stack.pop();
    out.push(i);
    const r = Math.floor(i / cols);
    const c = i % cols;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let k = 0; k < dirs.length; k += 1) {
      const nr = r + dirs[k][0];
      const nc = c + dirs[k][1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const j = nr * cols + nc;
      if (seen[j] || isWall(walls, cols, j) || boxes.indexOf(j) >= 0) continue;
      seen[j] = true;
      stack.push(j);
    }
  }
  return out;
}

// 最少推数：按「推一次算一步」做 BFS，人在盘上怎么绕是无所谓的。
// 同一张图上重复算一次只要几毫秒，比在数据里手写最优推数可靠。
function solve(level) {
  const g = parse(level);
  const { cols, rows, walls } = g;
  const boxes = g.boxes.slice().sort(function (a, b) { return a - b; });
  const start = { player: g.player, boxes: boxes };
  const goalKey = g.goals.slice().sort(function (a, b) { return a - b; }).join(',');
  const keyOf = function (st) { return st.player + '|' + st.boxes.slice().sort(function (a, b) { return a - b; }).join(','); };
  const done = function (st) {
    const b = st.boxes.slice().sort(function (a, b2) { return a - b2; }).join(',');
    return b === goalKey;
  };
  if (done(start)) return 0;
  const seen = {};
  seen[keyOf(start)] = true;
  let frontier = [start];
  for (let depth = 1; depth <= 80; depth += 1) {
    const next = [];
    for (let f = 0; f < frontier.length; f += 1) {
      const st = frontier[f];
      const canWalk = reachable(walls, st.boxes, cols, rows, st.player);
      for (let w = 0; w < canWalk.length; w += 1) {
        const from = canWalk[w];
        const r = Math.floor(from / cols);
        const c = from % cols;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let k = 0; k < dirs.length; k += 1) {
          const nr = r + dirs[k][0];
          const nc = c + dirs[k][1];
          const tr = r + dirs[k][0] * 2;
          const tc = c + dirs[k][1] * 2;
          if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) continue;
          const box = nr * cols + nc;
          const to = tr * cols + tc;
          if (st.boxes.indexOf(box) < 0) continue;
          if (isWall(walls, cols, to) || st.boxes.indexOf(to) >= 0) continue;
          const nb = st.boxes.slice();
          nb[nb.indexOf(box)] = to;
          const cand = { player: box, boxes: nb };
          const kk = keyOf(cand);
          if (seen[kk]) continue;
          seen[kk] = true;
          if (done(cand)) return depth;
          next.push(cand);
        }
      }
    }
    if (!next.length) return -1;
    frontier = next;
  }
  return -1;
}

// 一张图上「人的最短走法」：只在空地上走，箱子当墙。
// 只给 solutionMoves 拼完整走法用，不参与评级。
function walkPath(walls, boxes, cols, rows, from, to) {
  if (from === to) return [];
  const prev = {};
  prev[from] = null;
  const queue = [from];
  const dirs = [[1, 0, 'down'], [-1, 0, 'up'], [0, 1, 'right'], [0, -1, 'left']];
  while (queue.length) {
    const i = queue.shift();
    const r = Math.floor(i / cols);
    const c = i % cols;
    for (let k = 0; k < dirs.length; k += 1) {
      const nr = r + dirs[k][0];
      const nc = c + dirs[k][1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const j = nr * cols + nc;
      if (prev[j] !== undefined || isWall(walls, cols, j) || boxes.indexOf(j) >= 0) continue;
      prev[j] = { at: i, dir: dirs[k][2] };
      if (j === to) {
        const out = [];
        let cur = j;
        while (prev[cur]) { out.push(prev[cur].dir); cur = prev[cur].at; }
        return out.reverse();
      }
      queue.push(j);
    }
  }
  return null;
}

// 解法回放：把「先走哪几步、再推哪一下」拼成一串方向。
// 评级用的仍是最少推数；这里只负责让一盘真的能走完（测试与自检用）。
function solutionMoves(level) {
  const g = parse(level);
  const { cols, rows, walls } = g;
  const goalKey = g.goals.slice().sort(function (a, b) { return a - b; }).join(',');
  const keyOf = function (st) { return st.player + '|' + st.boxes.slice().sort(function (a, b) { return a - b; }).join(','); };
  const sortedBoxes = g.boxes.slice().sort(function (a, b) { return a - b; });
  const done = function (boxes) {
    return boxes.slice().sort(function (a, b) { return a - b; }).join(',') === goalKey;
  };
  if (done(sortedBoxes)) return [];
  const prev = {};
  const startKey = keyOf({ player: g.player, boxes: sortedBoxes });
  prev[startKey] = null;
  let frontier = [{ player: g.player, boxes: sortedBoxes, key: startKey }];
  let goalNode = null;
  for (let depth = 1; depth <= 80 && !goalNode; depth += 1) {
    const next = [];
    for (let f = 0; f < frontier.length && !goalNode; f += 1) {
      const st = frontier[f];
      const walk = reachable(walls, st.boxes, cols, rows, st.player);
      for (let w = 0; w < walk.length && !goalNode; w += 1) {
        const from = walk[w];
        const r = Math.floor(from / cols);
        const c = from % cols;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let k = 0; k < dirs.length; k += 1) {
          const nr = r + dirs[k][0];
          const nc = c + dirs[k][1];
          const tr = r + dirs[k][0] * 2;
          const tc = c + dirs[k][1] * 2;
          if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) continue;
          const box = nr * cols + nc;
          const to = tr * cols + tc;
          if (st.boxes.indexOf(box) < 0) continue;
          if (isWall(walls, cols, to) || st.boxes.indexOf(to) >= 0) continue;
          const nb = st.boxes.slice();
          nb[nb.indexOf(box)] = to;
          const cand = { player: box, boxes: nb };
          const kk = keyOf(cand);
          if (prev[kk] !== undefined) continue;
          prev[kk] = { prev: st.key, player: st.player, box: box, to: to };
          cand.key = kk;
          if (done(nb)) { goalNode = cand; break; }
          next.push(cand);
        }
      }
    }
    frontier = next;
  }
  if (!goalNode) return null;
  // 倒着收集「推哪一下」，再正向回放成人走的每一步。
  const pushes = [];
  let cur = goalNode.key;
  while (prev[cur]) {
    const step = prev[cur];
    pushes.push({ player: step.player, box: step.box, to: step.to });
    cur = step.prev;
  }
  pushes.reverse();
  const dirName = function (from, to) {
    if (to === from + cols) return 'down';
    if (to === from - cols) return 'up';
    if (to === from + 1) return 'right';
    return 'left';
  };
  const moves = [];
  let player = g.player;
  let boxes = sortedBoxes.slice();
  for (let i = 0; i < pushes.length; i += 1) {
    const step = pushes[i];
    const behind = step.box - (step.to - step.box);
    const walk = walkPath(walls, boxes, cols, rows, player, behind);
    if (!walk) return null;
    for (let w = 0; w < walk.length; w += 1) moves.push(walk[w]);
    moves.push(dirName(step.box, step.to));
    player = step.box;
    boxes[boxes.indexOf(step.box)] = step.to;
  }
  return moves;
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const levelIdx = Math.max(0, Math.min(LEVELS.length - 1, typeof p.level === 'number' ? p.level : depth));
  const level = LEVELS[levelIdx];
  const g = parse(level);
  const cols = g.cols;
  const rows = g.rows;
  const n = cols * rows;
  const optimal = Math.max(1, solve(level));
  const capPushes = Math.max(optimal + 4, Math.ceil(optimal * (p.capFactor || 1.9)));
  const costText = ctx.tip || '推不回来：推错方向只能重来';

  const vm = C.makeVm(cols, n, '把每块石箱推到阵位上', costText);
  vm.extras.compact = true;
  vm.extras.showPad = true;
  vm.extras.showUndo = true;
  vm.extras.showReset = true;
  vm.pad = {
    keys: [
      { id: 'up', dir: 'up', glyph: '▲' },
      { id: 'left', dir: 'left', glyph: '◀' },
      { id: 'down', dir: 'down', glyph: '▼' },
      { id: 'right', dir: 'right', glyph: '▶' },
    ],
  };

  let player = g.player;
  let boxes = g.boxes.slice();
  let pushes = 0;
  let steps = 0;
  let history = [];
  let failed = false;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function onGoal(i) { return g.goals.indexOf(i) >= 0; }

  function placed() {
    let k = 0;
    for (let i = 0; i < boxes.length; i += 1) if (onGoal(boxes[i])) k += 1;
    return k;
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      cell.arrow = -1;
      cell.end = false;
      cell.tone = 0;
      if (isWall(g.walls, cols, i)) {
        cell.cls = 'cell cell--wall';
        cell.label = '';
      } else if (boxes.indexOf(i) >= 0) {
        const ok = onGoal(i);
        cell.cls = ok ? 'cell cell--boxed cell--on-goal' : 'cell cell--boxed';
        cell.label = ok ? '▩' : '▣';
      } else if (i === player) {
        cell.cls = onGoal(i) ? 'cell cell--man cell--on-goal' : 'cell cell--man';
        cell.label = '☉';
      } else if (onGoal(i)) {
        cell.cls = 'cell cell--goal';
        cell.label = '○';
      } else {
        cell.cls = 'cell cell--floor';
        cell.label = '';
      }
    }
    vm.pushbox = {
      cols: cols, rows: rows, boxes: boxes.slice(), goals: g.goals.slice(), player: player,
    };
  }

  function syncHud() {
    const ok = placed();
    vm.timeText = '余 ' + Math.max(0, capPushes - pushes) + ' 推';
    vm.progress = C.pct(ok, g.goals.length);
    vm.progressText = '入位 ' + ok + ' / ' + g.goals.length;
    vm.scoreText = '已推 ' + pushes + ' 次';
    vm.goal = '已推 ' + pushes + ' 次 · 最优 ' + optimal + ' 次 · 预算 ' + capPushes + ' 次';
    vm.gradeNow = failed ? 'F' : pushes <= optimal ? 'S' : pushes <= optimal + 2 ? 'A' : pushes <= optimal * 2 ? 'B' : 'C';
    vm.hint = costText + ' · 已走 ' + steps + ' 步 · 推不回来';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    vm.phase = 'done';
    vm.status = grade === 'F' ? '推不动了' : '入位';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({ grade: grade, score: failed ? 0 : Math.max(0, (capPushes - pushes) * 20 + 200), summary: summary, notes: notesOf() });
  }

  function notesOf() {
    const notes = [];
    if (failed) {
      notes.push('推数预算 ' + capPushes + ' 次走完，还有 ' + (g.goals.length - placed()) + ' 处阵位空着。');
      notes.push('这一图最优 ' + optimal + ' 次；推不回来的箱子卡在角落就早点重来，别硬推。');
      return notes;
    }
    const gap = pushes - optimal;
    if (gap <= 0) notes.push('正好推 ' + optimal + ' 次，一次没多。');
    else if (gap <= 2) notes.push('比最优多推 ' + gap + ' 次（最优 ' + optimal + ' 次）· S 要一次不多。');
    else if (pushes <= optimal * 2) notes.push('推了 ' + pushes + ' 次，最优 ' + optimal + ' 次 · A 线是多两次以内。');
    else notes.push('推了 ' + pushes + ' 次，超过最优的两倍（' + optimal * 2 + ' 次）。');
    return notes;
  }

  function checkFail() {
    if (done) return false;
    if (pushes >= capPushes && placed() < g.goals.length) {
      failed = true;
      C.flash(vm, '推数用尽 · 没能入位', 'bad');
      finishOnce('F', '推数用尽，石箱未全入位');
      return true;
    }
    return false;
  }

  function push(dir) {
    if (done || vm.phase !== 'playing') return;
    const k = { down: 0, up: 1, right: 2, left: 3 }[dir];
    if (k === undefined) return;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const dr = dirs[k][0];
    const dc = dirs[k][1];
    const r = Math.floor(player / cols);
    const c = player % cols;
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
    const target = nr * cols + nc;
    if (isWall(g.walls, cols, target)) {
      vm.status = '那边是石壁';
      render();
      return;
    }
    const bi = boxes.indexOf(target);
    if (bi >= 0) {
      const tr = nr + dr;
      const tc = nc + dc;
      if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) { vm.status = '箱子后面没地方了'; render(); return; }
      const to = tr * cols + tc;
      if (isWall(g.walls, cols, to) || boxes.indexOf(to) >= 0) {
        vm.status = '推不动：箱子后面被挡住了';
        C.flash(vm, '推不动', 'bad');
        render();
        return;
      }
      history.push({ player: player, boxes: boxes.slice(), pushes: pushes, steps: steps });
      boxes[bi] = to;
      player = target;
      pushes += 1;
      steps += 1;
      C.flash(vm, '推了一格', 'good');
    } else {
      history.push({ player: player, boxes: boxes.slice(), pushes: pushes, steps: steps });
      player = target;
      steps += 1;
    }
    paint();
    syncHud();
    if (placed() >= g.goals.length) {
      C.flash(vm, '全部入位 · ' + pushes + ' 推', 'gold');
      finishOnce(pushes <= optimal ? 'S' : pushes <= optimal + 2 ? 'A' : pushes <= optimal * 2 ? 'B' : 'C',
        '入位 · 用 ' + pushes + ' 推（最优 ' + optimal + ' 推）');
      return;
    }
    if (checkFail()) return;
    render();
  }

  function restore() {
    player = g.player;
    boxes = g.boxes.slice();
    pushes = 0;
    steps = 0;
    history = [];
    failed = false;
    paint();
    syncHud();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    restore();
    vm.status = '走到石箱后面，按方向键把它推出去';
    render();
  }

  paint();
  syncHud();
  render();

  return C.fillController({
    start: start,
    move: push,
    undo: function () {
      if (done || vm.phase !== 'playing' || !history.length) return;
      const h = history.pop();
      player = h.player;
      boxes = h.boxes.slice();
      pushes = h.pushes;
      steps = h.steps;
      paint();
      syncHud();
      render();
    },
    reset: function () {
      if (done || vm.phase !== 'playing') return;
      restore();
      C.flash(vm, '盘面复位 · 推数清零', 'good');
      render();
    },
    abandon: function () { finishOnce('F', '中途收功'); },
  });
}

// 每张图的最优推数只算一次：说明页、准备页、局内要的是同一条数，
// 每次重算一遍 BFS 没必要，算出来的结果也不会变。
const OPT_CACHE = {};

function levelIndexOf(p) {
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  return Math.max(0, Math.min(LEVELS.length - 1, p && typeof p.level === 'number' ? p.level : depth));
}

function optimalOf(levelIdx) {
  if (OPT_CACHE[levelIdx] === undefined) OPT_CACHE[levelIdx] = Math.max(1, solve(LEVELS[levelIdx]));
  return OPT_CACHE[levelIdx];
}

function lines(p) {
  const li = levelIndexOf(p);
  const opt = optimalOf(li);
  return {
    rule: '按已推次数与本图最优推数比（走多少步不算）',
    items: [
      'S：正好 ' + opt + ' 推（第 ' + (li + 1) + ' 张石图的最优）',
      'A：多 2 次以内',
      'B：不超过最优的两倍',
      'C：超过两倍才全部入位',
    ],
    fail: '推数预算用尽还没全部入位 → 走火 F，这一局没有收益',
  };
}

module.exports = {
  id: 'pushbox',
  name: '推石入位',
  create: create,
  lines: lines,
  solve: solve,
  solutionMoves: solutionMoves,
  LEVELS: LEVELS,
};
