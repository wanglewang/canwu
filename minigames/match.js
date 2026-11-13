'use strict';

// 三秀同收（换苗引秀 / 灵植·三秀诀专属）：经典三消。
// 点相邻两株灵草换位，让三株同色的连成一线即可收走；上面的落下来、顶上补新苗，
// 落下来又凑成一线的算连锁，一层比一层值钱。
//
// 与「灵纹连线」的区别：连线是找通路、消完变少；这里是换位造形、消完还会补满，
// 盘面永远是满的，考的是「换哪一步能连出更多层」。
// 无可行换位时会自动重排灵畦，绝不把玩家卡在死局里。

const C = require('./common.js');

const GLYPHS = ['✿', '❋', '✦', '◆', '●'];

// 所有横 / 竖 ≥3 连的格子。纯函数：判定与测试共用，改规则不会让断言悄悄失效。
function matchesOf(board, cols, rows) {
  const hit = {};
  const out = [];
  function mark(list) {
    if (list.length < 3) return;
    for (let i = 0; i < list.length; i += 1) hit[list[i]] = true;
  }
  for (let r = 0; r < rows; r += 1) {
    let run = [];
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (run.length && board[run[0]] === board[i]) run.push(i);
      else { mark(run); run = [i]; }
    }
    mark(run);
  }
  for (let c = 0; c < cols; c += 1) {
    let run = [];
    for (let r = 0; r < rows; r += 1) {
      const i = r * cols + c;
      if (run.length && board[run[0]] === board[i]) run.push(i);
      else { mark(run); run = [i]; }
    }
    mark(run);
  }
  for (let i = 0; i < cols * rows; i += 1) if (hit[i]) out.push(i);
  return out;
}

function adjacent(a, b, cols) {
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

// 找一个真能凑出三连的相邻换位；纯函数，也供「死局重排」判定使用。
function findMove(board, cols, rows) {
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * cols + c;
      for (const d of [[0, 1], [1, 0]]) {
        const nr = r + d[0];
        const nc = c + d[1];
        if (nr >= rows || nc >= cols) continue;
        const b = nr * cols + nc;
        if (board[a] === board[b]) continue;
        const va = board[a];
        const vb = board[b];
        board[a] = vb;
        board[b] = va;
        const ok = matchesOf(board, cols, rows).length > 0;
        board[a] = va;
        board[b] = vb;
        if (ok) return [a, b];
      }
    }
  }
  return null;
}

// 收走三连后，同列上面的落下来，顶上补新苗。新苗可能再凑出一条线 —— 那就是连锁。
function collapse(board, cols, rows, kinds) {
  const out = board.slice();
  for (let c = 0; c < cols; c += 1) {
    const kept = [];
    for (let r = rows - 1; r >= 0; r -= 1) {
      const v = out[r * cols + c];
      if (v) kept.push(v);
    }
    for (let r = rows - 1; r >= 0; r -= 1) {
      const k = rows - 1 - r;
      out[r * cols + c] = k < kept.length ? kept[k] : 1 + C.randInt(kinds);
    }
  }
  return out;
}

function makeBoard(cols, rows, kinds) {
  const n = cols * rows;
  for (let t = 0; t < 80; t += 1) {
    const board = new Array(n).fill(0);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const pool = [];
        for (let v = 1; v <= kinds; v += 1) {
          // 生成时避开横 / 竖已成两连的颜色，开局盘面不该白送三连。
          if (c >= 2 && board[r * cols + c - 1] === v && board[r * cols + c - 2] === v) continue;
          if (r >= 2 && board[(r - 2) * cols + c] === v && board[(r - 1) * cols + c] === v) continue;
          pool.push(v);
        }
        board[r * cols + c] = pool.length ? pool[C.randInt(pool.length)] : 1 + C.randInt(kinds);
      }
    }
    if (!matchesOf(board, cols, rows).length && findMove(board, cols, rows)) return board;
  }
  // 兜底：按列循环填一个必定有交换的盘。
  const board = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) board[i] = 1 + (Math.floor(i / cols) + i % cols) % kinds;
  return board;
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = Math.max(4, p.cols || 6);
  const rows = Math.max(4, p.rows || 6);
  const n = cols * rows;
  const kinds = Math.min(GLYPHS.length, Math.max(3, p.kinds || 5));
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
  const duration = Math.max(25, p.duration || 60);
  const hintMs = Math.max(200, p.flashMs || 760);
  const freeHint = stage >= 3;
  const freeShuffle = stage >= 5;
  const chainBonus = stage >= 5 ? 0.5 : 0;
  // 代价句由准备页的 method.tip 传进来，局内一直挂在 hint 上。以前 syncHud()
  // 每帧都把它冲成纯计数，玩家整局都看不到「换不出要少 2 息」，等于规则只在准备页写着。
  const costText = ctx.tip || '换不出三连少 2 息';

  const vm = C.makeVm(cols, n, '换两株相邻灵草，三株同色连成一线就收走', costText);
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.extras.showHint = true;
  vm.extras.showCombo = true;
  vm.extras.compact = true;

  // 一格三连 12 分，连锁每层 ×(1 + 0.5×(层数-1))；一局打得顺能收十几次。
  // S 线的基数与每档增量由 data/practice.js 的 params 同源送入，准备页照同一份数写给玩家看。
  const sLimit = (p.sBase || 620) + depth * (p.sStep || 150);
  const aLimit = Math.ceil(sLimit * 0.68);
  const bLimit = Math.ceil(sLimit * 0.40);

  const bag = C.TimerBag();
  let board = new Array(n).fill(0);
  let selected = -1;
  let hintPair = null;
  let hintTimer = null;
  let score = 0;
  let harvested = 0;
  let mistakes = 0;
  let shuffles = 0;
  let maxChain = 0;
  let left = duration;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      cell.arrow = -1;
      cell.end = false;
      cell.cls = 'cell cell--lit cell--chip'
        + (i === selected ? ' cell--sel' : '')
        + (hintPair && (hintPair[0] === i || hintPair[1] === i) ? ' cell--hintpair' : '');
      cell.label = GLYPHS[board[i] - 1] || GLYPHS[0];
      cell.tone = board[i];
    }
    vm.match = { board: board.slice(), cols: cols, rows: rows, first: selected };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = maxChain;
    vm.comboText = maxChain >= 2 ? '最高连锁 ' + maxChain : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '分');
    vm.meter = { label: '已收灵草', value: Math.min(100, harvested), max: 100 };
    vm.hint = costText + ' · 无效互换 ' + mistakes + ' · 重排 ' + shuffles;
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '一畦三秀') : '';
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary });
  }

  function finish() {
    const grade = C.gradeBy(score, sLimit, aLimit, bLimit);
    finishOnce(grade, '收 ' + harvested + ' 株 · 最高连锁 ' + maxChain + ' · 无效互换 ' + mistakes);
  }

  function clearHint() {
    if (hintTimer !== null) { bag.off(hintTimer); hintTimer = null; }
    hintPair = null;
  }

  // 死局重排：保留颜色数量，只换位置；重排到有可行换位为止。
  function reshuffle() {
    const vals = board.slice();
    for (let t = 0; t < 40; t += 1) {
      C.shuffle(vals);
      board = vals.slice();
      if (!matchesOf(board, cols, rows).length && findMove(board, cols, rows)) break;
    }
    shuffles += 1;
    if (!freeShuffle) left = Math.max(0, left - 3);
    C.flash(vm, freeShuffle ? '灵畦自整 · 不扣息' : '灵畦自整 · 少 3 息', 'good');
  }

  function resolve() {
    let chain = 0;
    let guard = 0;
    while (guard < 12) {
      guard += 1;
      const hits = matchesOf(board, cols, rows);
      if (!hits.length) break;
      chain += 1;
      harvested += hits.length;
      const mult = 1 + (chain - 1) * (0.5 + chainBonus);
      const gain = Math.round(hits.length * 12 * mult);
      score += gain;
      for (let i = 0; i < hits.length; i += 1) board[hits[i]] = 0;
      board = collapse(board, cols, rows, kinds);
      // 递进反馈只分三档：普通三连淡光、一次收四株以上提亮、连锁逐层再提亮。
      // 不新增常驻循环动画，也不往盘面里塞汉字——浮字只落在 HUD 那一层。
      const bright = chain > 1 || hits.length >= 4;
      const label = chain > 1 ? '连锁 ' + chain + ' 层'
        : (hits.length >= 4 ? hits.length + ' 株齐收' : '三秀同收');
      C.flash(vm, label + ' +' + gain, bright ? 'gold' : 'good');
    }
    if (chain > maxChain) maxChain = chain;
    if (!findMove(board, cols, rows)) reshuffle();
  }

  function tap(index) {
    if (done || vm.phase !== 'playing' || index < 0 || index >= n) return;
    clearHint();
    if (selected < 0) { selected = index; paint(); render(); return; }
    if (selected === index) { selected = -1; paint(); render(); return; }
    const a = selected;
    if (!adjacent(a, index, cols)) { selected = index; paint(); render(); return; }
    selected = -1;
    const va = board[a];
    const vb = board[index];
    board[a] = vb;
    board[index] = va;
    if (!matchesOf(board, cols, rows).length) {
      board[a] = va;
      board[index] = vb;
      mistakes += 1;
      left = Math.max(0, left - 2);
      C.flash(vm, '换不出三连 · 少 2 息', 'bad');
    } else {
      resolve();
    }
    paint();
    syncHud();
    if (left <= 0) { finish(); return; }
    render();
  }

  function hint() {
    if (done || vm.phase !== 'playing') return;
    const move = findMove(board, cols, rows);
    if (!move) { reshuffle(); paint(); syncHud(); render(); return; }
    clearHint();
    hintPair = move;
    if (!freeHint) left = Math.max(0, left - 2);
    vm.status = freeHint ? '照畦：换这两株' : '照畦：少 2 息，换这两株';
    paint();
    syncHud();
    render();
    hintTimer = bag.after(function () {
      if (done) return;
      hintPair = null;
      paint();
      render();
    }, hintMs);
    if (left <= 0) finish();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '换两株相邻灵草，三株同色连成一线就收走';
    vm.banner = theme.banner || '';
    board = makeBoard(cols, rows, kinds);
    paint();
    syncHud();
    render();
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
    tap: tap,
    hint: hint,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = {
  id: 'match', name: '三秀同收', create: create,
  matchesOf: matchesOf, findMove: findMove, collapse: collapse, GLYPHS: GLYPHS,
};
