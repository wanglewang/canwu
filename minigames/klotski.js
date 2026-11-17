'use strict';

// 滑块让路（挪块开路 / 机关·移山开路诀专属）：华容道。
//
// 与「落石垒基」的区别：垒石是按时间下落、一块一块堆；这里是静态的若干块，
// 每次只挪一格，谁也落不下来，考的是「先给谁让路」。
// 与「推石入位」的区别：推箱是走人、只推不拉、要把箱子推进阵位；
// 这里是整块滑、能左右挪动，目标只有一个：把主块挪到底部出口。
//
// 一局一盘：四路方向键挪当前选中的块，一块一格地滑。主块落到盘底的出口即脱身。
// 步数预算按本盘最优步数给，走满还没脱身就是失败 F（困住了，不是挪得糙）。
// 评级看「已走步数 / 本盘最优步数」，与阵灯推演同一把尺子——但盘面与操作完全不同：
// 那边点一格改一片，这里挪一块只动一块。

const C = require('./common.js');
const K = require('./teach-kit.js');

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

// 挪不动时要说清是谁挡着。只说「挪不动」等于让玩家自己在盘上找一遍——
// 这一门的每一步都是「给谁让路」的判断，不该花在找障碍上。
const BLOCK_NAME = { main: '主块', wide: '横石', tall: '竖石', ga: '散石', gb: '散石' };
// 方向键的键序是「上 / 左 / 下 / 右」，DIRS 是「上 / 下 / 左 / 右」：两套下标不能混用。
const KEY_DIR = { up: 0, down: 1, left: 2, right: 3 };

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
    // shut 由 paint() 每次重算：选中块在这一边挪不动时键上压暗。
    // 压暗不是禁用——按下去照样给「挪不动」的浮字，规则一个字没改；
    // 压掉的只是「先按一下试试能不能过」这件试错。
    keys: [
      { id: 'up', dir: 'up', icon: 'up', glyph: '上', shut: false },
      { id: 'left', dir: 'left', icon: 'left', glyph: '左', shut: false },
      { id: 'down', dir: 'down', icon: 'down', glyph: '下', shut: false },
      { id: 'right', dir: 'right', icon: 'right', glyph: '右', shut: false },
    ],
  };

  const costText = ctx.tip || '步数用尽还没脱身就是困住了';
  const bag = C.TimerBag();
  let blockedIds = [];
  let blockTimer = null;
  let escaped = false;
  let state = [];
  let startState = [];
  let optimal = minOpt;
  let capSteps = Math.ceil(optimal * capFactor);
  let moves = 0;
  let selected = 0;
  let failed = false;
  // 复位过就本盘封顶 A：容错是给走死的人一条退路，不是免费重抽。
  // 盘面固定、复位又把步数清零，不封顶的话「挪一步→复位→再挪」能白试出最优解。
  let resetUsed = false;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  // 挪一步之后的局面：能把越界与相撞一次问清，不必在调用处各写一遍。
  function tryStep(i, k) {
    const next = state.map(function (q) { return [q[0], q[1]]; });
    next[i][0] += DIRS[k][0];
    next[i][1] += DIRS[k][1];
    return occupancy(next, SHAPES, cols, rows) ? next : null;
  }

  // 目标位被哪几块占着。只要「是 / 不是」，不要格数——拦路的是块，不是格子。
  function blockersOf(i, k) {
    const s = SHAPES[i];
    const r0 = state[i][0] + DIRS[k][0];
    const c0 = state[i][1] + DIRS[k][1];
    const out = [];
    for (let j = 0; j < SHAPES.length; j += 1) {
      if (j === i) continue;
      const o = SHAPES[j];
      if (r0 + s.h <= state[j][0] || state[j][0] + o.h <= r0) continue;
      if (c0 + s.w <= state[j][1] || state[j][1] + o.w <= c0) continue;
      out.push(j);
    }
    return out;
  }

  function namesOf(list) {
    const seen = {};
    const names = [];
    for (let i = 0; i < list.length; i += 1) {
      const n = BLOCK_NAME[SHAPES[list[i]].id] || '一块';
      if (seen[n]) continue;
      seen[n] = true;
      names.push(n);
    }
    return names.join('、');
  }

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
        blocked: blockedIds.indexOf(i) >= 0,
        escaped: escaped && i === 0,
        emblem: s.id === 'main' ? 20 : 0,
      });
    }
    // 选中块的四个方向现在能不能挪，在键上先标出来。
    for (let d = 0; d < vm.pad.keys.length; d += 1) {
      const key = vm.pad.keys[d];
      key.shut = !tryStep(selected, KEY_DIR[key.dir]);
    }
    const exitC = Math.floor((cols - 2) / 2);
    vm.klotski = {
      cols: cols,
      rows: rows,
      blocks: blocks,
      exitC: exitC,
      // 主块与出口同一列时，出口亮起来：这条道是对的，只差把下面让开。
      aligned: state[0][1] === exitC,
      // 脱身那一步出口从「缺口」变成「开了的门」。
      open: escaped,
    };
  }

  // 评级只认「走了几步」，不认时间：推演类玩法不该因为想得久而被扣。
  // 借过外力（复位本盘）就封顶到 A——S 是同一条推演路径上一步没浪费的结果。
  function gradeOf() {
    if (failed) return 'F';
    let g;
    if (moves <= optimal) g = 'S';
    else if (moves <= optimal + 2) g = 'A';
    else if (moves <= optimal * 2) g = 'B';
    else g = 'C';
    if (g === 'S' && resetUsed) return 'A';
    return g;
  }

  function syncHud() {
    vm.timeText = '余 ' + Math.max(0, capSteps - moves) + ' 步';
    vm.progress = C.pct(moves, capSteps);
    vm.progressText = '已走 ' + moves + ' / ' + capSteps;
    vm.scoreText = '已走 ' + moves + ' 步';
    vm.goal = '已走 ' + moves + ' 步 · 最优 ' + optimal + ' 步 · 预算 ' + capSteps + ' 步';
    vm.gradeNow = gradeOf();
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
    capSteps = Math.max(optimal + 2, Math.ceil(optimal * capFactor));
    moves = 0;
    selected = 0;
    failed = false;
    resetUsed = false;
    vm.banner = theme.banner || '';
    // 选中提示留在 vm.hint 里（HUD 那一行取 goal || status，写 status 永远不会露面）。
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    vm.phase = 'done';
    vm.goal = grade === 'F' ? '困住了' : '脱身 · 用 ' + moves + ' 步';
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
    const k = KEY_DIR[dir];
    if (k === undefined) return;
    const next = tryStep(selected, k);
    if (!next) {
      // 挪不动要指名道姓。盘沿与被占是两件事：一个是「到头了」，一个是「谁挡着」，
      // 玩家下一步要做的动作完全不同。
      const s = SHAPES[selected];
      const tr = state[selected][0] + DIRS[k][0];
      const tc = state[selected][1] + DIRS[k][1];
      const edge = tr < 0 || tc < 0 || tr + s.h > rows || tc + s.w > cols;
      blockedIds = edge ? [] : blockersOf(selected, k);
      paint();
      C.flash(vm, edge ? '那边是盘沿' : namesOf(blockedIds) + '挡着', 'bad');
      if (blockTimer !== null) bag.off(blockTimer);
      // 描红留一小会儿就撤：它是「刚才是谁挡的」，不是常驻状态。
      blockTimer = bag.after(function () {
        blockTimer = null;
        blockedIds = [];
        paint();
        render();
      }, 460);
      render();
      return;
    }
    // 能挪的时候上一手的描红要收掉：它还挂在「刚才是谁挡的」那个方向上，
    // 再留着会让玩家以为现在这一块也被挡着。
    if (blockTimer !== null) { bag.off(blockTimer); blockTimer = null; }
    blockedIds = [];
    state = next;
    moves += 1;
    paint();
    syncHud();
    if (isSolved(state, cols, rows)) {
      // 主块沉进出口、出口从缺口变成开着的门：这一手做对了，盘面自己会说。
      escaped = true;
      paint();
      C.flash(vm, '脱身 · ' + moves + ' 步', 'gold');
      finishOnce(gradeOf(), '脱身 · 用 ' + moves + ' 步（最优 ' + optimal + ' 步）');
      return;
    }
    if (checkFail()) return;
    // 挪成功不给浮字：块已经滑过去了，再报一句「挪了一格」是噪音。
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
      // 选中本身就是反馈（金环箍住），不必另写一句。
      paint();
      // 四面都堵的块：四个键会一起压暗，玩家要一个个试完才知道它根本动不了。
      // 这种情况在 4×4 上并不罕见（横石被主块与散石夹在角上），值得说一句。
      let free = 0;
      for (let d = 0; d < vm.pad.keys.length; d += 1) {
        if (!vm.pad.keys[d].shut) free += 1;
      }
      if (!free) C.flash(vm, '这块四面都堵着 · 换一块', 'bad');
      render();
    },
    move: slide,
    reset: function () {
      if (done || vm.phase !== 'playing') return;
      state = startState.map(function (q) { return [q[0], q[1]]; });
      moves = 0;
      failed = false;
      resetUsed = true;
      paint();
      syncHud();
      // flash 已经说了「本盘最高 A」，不再写一遍进 status。
      C.flash(vm, '盘面复位 · 本盘最高 A', 'good');
      render();
    },
    // 中途结束也要撤掉描红计时：它会在结完账之后再调一次 render。
    abandon: function () { bag.clear(); finishOnce('F', '中途结束'); },
    destroy: function () { bag.clear(); },
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
      'C：超过两倍才脱身（本段最优约 ' + minOpt + ' 步起）',
      '复位过本盘，最高只到 A',
    ],
    fail: '步数预算走完主块还没到出口（困住了）→ 失败 F，这一局没有收益。预算 = max(最优 + 2, 最优 × 本段系数)',
  };
}

// 首局手把手：4×4、只有主块，差一步就落到盘底正中。
// 要教的是「一次只挪一格」与「主块必须走到盘底正中」——所以只留一步。
const TEACH_COLS = 4;
const TEACH_ROWS = 4;

function createTeach(ctx) {
  const cells = K.blank(TEACH_COLS, 0);
  let moved = false;
  return K.run(ctx, {
    cols: TEACH_COLS,
    cells: cells,
    status: '教学 · 把主块让到盘底正中',
    steps: [
      {
        at: [0],
        text: '先点主块 · 它要从盘底正中那一格出去',
        take: function () { return { text: '选中了 · 一次只挪一格' }; },
      },
      {
        dir: ['down'],
        wrongText: '这一步按「下」· 主块差一格就到正中',
        text: '按「下」· 主块落到正中就通了',
        take: function () {
          moved = true;
          return { text: '落到盘底正中 · 主块要从这一格出去' };
        },
      },
    ],
    paint: function (vm) {
      vm.extras.showGrid = false;
      vm.extras.showPad = true;
      vm.pad = {
        keys: [
          { id: 'up', dir: 'up', icon: 'up', glyph: '上', shut: false },
          { id: 'left', dir: 'left', icon: 'left', glyph: '左', shut: false },
          { id: 'down', dir: 'down', icon: 'down', glyph: '下', shut: false },
          { id: 'right', dir: 'right', icon: 'right', glyph: '右', shut: false },
        ],
      };
      vm.klotski = {
        cols: TEACH_COLS,
        rows: TEACH_ROWS,
        exitC: 1,
        aligned: true,
        open: moved,
        blocks: [{
          id: 'main',
          x: 25,
          y: moved ? 50 : 25,
          w: 50,
          h: 50,
          sel: true,
          main: true,
          blocked: false,
          escaped: moved,
          emblem: 20,
        }],
      };
    },
    doneText: '一次一格 · 主块从盘底正中出去',
  });
}

const teach = { create: createTeach };

module.exports = {
  id: 'klotski',
  name: '滑块让路',
  create: create,
  lines: lines,
  teach: teach,
  solve: solve,
  solvePath: solvePath,
  SHAPES: SHAPES,
};
