'use strict';

// 落石垒基（垒石筑基 / 土术·垒岳诀专属）：经典俄罗斯方块的小盘版。
// 六列八行，灵石按息往下落；把一层垒满就化去，化得越多分越高，堆到顶或时间到就收功。
//
// 交互走独立的方向键（vm.pad）：左 / 转 / 右 / 落。页面只在 showPad 的玩法里挂这一排键，
// 其余玩法一行不改；玩法层不碰坐标、不碰视觉，只认 move(dir)。
//
// 与扫雷、翻牌这类「静态盘面」的区别在于它是唯一一套持续运动的玩法：
// 判定不是点格子，而是每息一次的重力推进 + 满行消除。

const C = require('./common.js');

const SHAPES = [
  { name: '长石', tone: 1, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { name: '方石', tone: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { name: '曲石', tone: 3, cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
  { name: '丁石', tone: 4, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  { name: '折石', tone: 5, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
];

const LINE_SCORE = [0, 100, 260, 480, 800];

// 顺时针转 90° 后归一到左上角，形状表不必为每个朝向各写一份。
function rotateCells(cells) {
  const turned = cells.map(function (x) { return [x[1], -x[0]]; });
  let minR = 99;
  let minC = 99;
  for (let i = 0; i < turned.length; i += 1) {
    if (turned[i][0] < minR) minR = turned[i][0];
    if (turned[i][1] < minC) minC = turned[i][1];
  }
  return turned.map(function (x) { return [x[0] - minR, x[1] - minC]; });
}

// 满行化去，上面的整层落下来。纯函数，测试可以直接验「垒满一层真的会消」。
function clearLines(board, cols, rows) {
  const kept = [];
  let lines = 0;
  for (let r = 0; r < rows; r += 1) {
    let full = true;
    for (let c = 0; c < cols; c += 1) {
      if (!board[r * cols + c]) { full = false; break; }
    }
    if (!full) kept.push(board.slice(r * cols, (r + 1) * cols));
    else lines += 1;
  }
  const out = new Array(cols * rows).fill(0);
  for (let i = 0; i < kept.length; i += 1) {
    const r = rows - kept.length + i;
    for (let c = 0; c < cols; c += 1) out[r * cols + c] = kept[i][c];
  }
  return { board: out, lines: lines };
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = Math.max(4, p.cols || 6);
  const rows = Math.max(6, p.rows || 8);
  const n = cols * rows;
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
  const duration = Math.max(25, p.duration || 70);
  // 阶段新法：大成「稳基」放宽落石间隔，大圆满「层叠」把化层得分再抬一成。
  const dropMs = Math.max(180, Math.round((p.dropMs || 620) * (stage >= 3 ? 1.15 : 1)));
  const lineBonus = stage >= 5 ? 1.1 : 1;

  const vm = C.makeVm(cols, n, '灵石落定，把一层垒满化去', ctx.tip || '用方向键挪石、转石、速降，垒满一层即消');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.extras.showPad = true;
  vm.extras.showMeter = true;
  vm.extras.showCombo = true;
  vm.extras.compact = true;
  vm.pad = {
    keys: [
      { id: 0, dir: 'left', glyph: '←' },
      { id: 1, dir: 'rotate', glyph: '⟳' },
      { id: 2, dir: 'right', glyph: '→' },
      { id: 3, dir: 'drop', glyph: '⇓' },
    ],
  };

  const lim = gradeLimits(depth);
  const sLimit = lim.s;
  const aLimit = lim.a;
  const bLimit = lim.b;

  const bag = C.TimerBag();
  let board = new Array(n).fill(0);
  let piece = null;
  let score = 0;
  let lines = 0;
  let pieces = 0;
  let combo = 0;
  let left = duration;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function cellsOf(pc) {
    return pc.cells.map(function (x) { return [pc.r + x[0], pc.c + x[1]]; });
  }

  function fits(pc) {
    const pts = cellsOf(pc);
    for (let i = 0; i < pts.length; i += 1) {
      const r = pts[i][0];
      const c = pts[i][1];
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
      if (board[r * cols + c]) return false;
    }
    return true;
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      cell.arrow = -1;
      cell.end = false;
      cell.label = '';
      cell.tone = board[i] || 0;
      cell.cls = board[i] ? 'cell cell--lit cell--set' : 'cell cell--void';
    }
    if (piece) {
      const pts = cellsOf(piece);
      for (let i = 0; i < pts.length; i += 1) {
        const r = pts[i][0];
        const c = pts[i][1];
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const cell = vm.cells[r * cols + c];
        cell.cls = 'cell cell--lit cell--live';
        cell.tone = piece.tone;
      }
    }
    vm.blocks = {
      board: board.slice(), cols: cols, rows: rows, lines: lines,
      piece: piece ? { cells: piece.cells.map(function (x) { return x.slice(); }), r: piece.r, c: piece.c, tone: piece.tone } : null,
    };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连化 ' + combo + ' 层' : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '分');
    vm.meter = { label: '已化层', value: lines, max: Math.max(4, 2 + depth) };
    vm.hint = vm.costText;
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '层层皆化') : '';
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary });
  }

  function finish() {
    const grade = C.gradeBy(score, sLimit, aLimit, bLimit);
    finishOnce(grade, '化 ' + lines + ' 层 · 落 ' + pieces + ' 石');
  }

  function spawn() {
    const shape = SHAPES[C.randInt(SHAPES.length)];
    const cells = shape.cells.map(function (x) { return x.slice(); });
    let w = 0;
    for (let i = 0; i < cells.length; i += 1) w = Math.max(w, cells[i][1] + 1);
    piece = { cells: cells, tone: shape.tone, r: 0, c: Math.floor((cols - w) / 2) };
    pieces += 1;
    if (!fits(piece)) {
      piece = null;
      paint();
      syncHud();
      finishOnce('C', '灵石堆到了顶 · 化 ' + lines + ' 层');
      return;
    }
    paint();
    render();
  }

  function lock() {
    const pts = cellsOf(piece);
    for (let i = 0; i < pts.length; i += 1) {
      const r = pts[i][0];
      const c = pts[i][1];
      if (r >= 0 && r < rows && c >= 0 && c < cols) board[r * cols + c] = piece.tone;
    }
    const res = clearLines(board, cols, rows);
    board = res.board;
    if (res.lines > 0) {
      lines += res.lines;
      combo += res.lines;
      const gain = Math.round((LINE_SCORE[Math.min(4, res.lines)] || 800) * (1 + depth * 0.12) * lineBonus);
      score += gain;
      C.flash(vm, '化 ' + res.lines + ' 层 +' + gain, 'gold');
    } else {
      combo = 0;
    }
    piece = null;
    paint();
    syncHud();
    spawn();
  }

  function step() {
    if (done || !piece) return;
    const next = { cells: piece.cells, tone: piece.tone, r: piece.r + 1, c: piece.c };
    if (fits(next)) {
      piece = next;
      paint();
      render();
    } else {
      lock();
    }
  }

  function move(dir) {
    if (done || vm.phase !== 'playing' || !piece) return;
    let next = null;
    if (dir === 'left') next = { cells: piece.cells, tone: piece.tone, r: piece.r, c: piece.c - 1 };
    else if (dir === 'right') next = { cells: piece.cells, tone: piece.tone, r: piece.r, c: piece.c + 1 };
    else if (dir === 'rotate') {
      next = { cells: rotateCells(piece.cells), tone: piece.tone, r: piece.r, c: piece.c };
      // 贴墙旋转先往里让一格，让不出来才算转不动。
      if (!fits(next)) {
        const kick = { cells: next.cells, tone: next.tone, r: next.r, c: next.c - 1 };
        if (fits(kick)) next = kick;
        else {
          const kick2 = { cells: next.cells, tone: next.tone, r: next.r, c: next.c + 1 };
          if (fits(kick2)) next = kick2;
        }
      }
    } else if (dir === 'drop') {
      let steps = 0;
      while (fits({ cells: piece.cells, tone: piece.tone, r: piece.r + 1, c: piece.c })) {
        piece = { cells: piece.cells, tone: piece.tone, r: piece.r + 1, c: piece.c };
        steps += 1;
      }
      score += steps * 2;
      paint();
      syncHud();
      lock();
      return;
    }
    if (next && fits(next)) {
      piece = next;
      paint();
      render();
    }
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '灵石落定，把一层垒满化去';
    vm.banner = theme.banner || '';
    syncHud();
    spawn();
    bag.every(step, dropMs);
    bag.every(function () {
      if (done) return;
      left -= 1;
      syncHud();
      if (left <= 0) { finish(); return; }
      render();
    }, 1000);
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    move: move,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

function gradeLimits(depth) {
  const s = 420 + depth * 100;
  return { s: s, a: Math.ceil(s * 0.60), b: Math.ceil(s * 0.32) };
}

function lines(p) {
  const lim = gradeLimits(Math.max(0, Math.min(4, (p && p.depth) || 0)));
  return {
    rule: '按本局得分（化层越多、一次多消越多，分越高）',
    items: ['S ≥ ' + lim.s + ' 分', 'A ≥ ' + lim.a + ' 分', 'B ≥ ' + lim.b + ' 分', '其余为 C'],
  };
}

module.exports = {
  id: 'blocks', name: '落石垒基', create: create, lines: lines,
  rotateCells: rotateCells, clearLines: clearLines, SHAPES: SHAPES,
};
