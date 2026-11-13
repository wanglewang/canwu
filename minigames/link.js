'use strict';

// 灵纹连线（牵灵引线 / 御灵·并蒂引专属）：经典连连看。
// 盘面只放六种形状，点两枚同纹、且能用不超过两次转折的线连起来，就收走这一对。
//
// 与「成对翻牌」的区别：翻牌考记位置，这里考找通路——盘外一圈是空的，边上的灵纹
// 可以绕盘外走；同类却隔着一堵纹的，就得先清掉挡路的那一对。
//
// 经典玩法最容易劝退的两处都补齐了：
//   ① 开局与每次消除后都保证「至少还有一对可连」，否则自动把剩余灵纹重排；
//   ② 提示照见一对真能连上的纹，不是随便指两格。
// 重排与照纹只收一点时间，不扣心神——这一门是黄阶里的入门功课，不该靠惩罚教规则。

const C = require('./common.js');

const GLYPHS = ['✦', '◆', '●', '▲', '■', '✿'];
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// 最多两次转折的连线判定。把盘面外扩一圈空位，边上的灵纹也能从盘外绕过去。
// 纯函数：玩法层和测试用同一套规则，改判定不会偷偷改掉测试期望。
function canLink(board, cols, rows, a, b) {
  if (a === b || a < 0 || b < 0 || a >= board.length || b >= board.length) return false;
  const va = board[a];
  if (!va || va !== board[b]) return false;
  const W = cols + 2;
  const H = rows + 2;
  const ext = new Array(W * H).fill(0);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (board[r * cols + c]) ext[(r + 1) * W + c + 1] = board[r * cols + c];
    }
  }
  const ar = Math.floor(a / cols) + 1;
  const ac = a % cols + 1;
  const br = Math.floor(b / cols) + 1;
  const bc = b % cols + 1;
  // 状态是 (r, c, dir, turns)：dir=-1 是还没定向的起手，换一次方向记一次转折。
  const best = {};
  const queue = [{ r: ar, c: ac, dir: -1, turns: 0 }];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    for (let d = 0; d < 4; d += 1) {
      const turns = cur.dir === -1 || cur.dir === d ? cur.turns : cur.turns + 1;
      if (turns > 2) continue;
      const nr = cur.r + DIRS[d][0];
      const nc = cur.c + DIRS[d][1];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      if (nr === br && nc === bc) return true;
      if (ext[nr * W + nc]) continue;             // 中间格必须为空，终点已在上面判过
      const key = (nr * W + nc) * 4 + d;
      if (best[key] !== undefined && best[key] <= turns) continue;
      best[key] = turns;
      queue.push({ r: nr, c: nc, dir: d, turns: turns });
    }
  }
  return false;
}

function findPair(board, cols, rows) {
  const left = [];
  for (let i = 0; i < board.length; i += 1) if (board[i]) left.push(i);
  const byKind = {};
  for (let i = 0; i < left.length; i += 1) {
    const v = board[left[i]];
    if (!byKind[v]) byKind[v] = [];
    byKind[v].push(left[i]);
  }
  const kinds = Object.keys(byKind);
  for (let k = 0; k < kinds.length; k += 1) {
    const list = byKind[kinds[k]];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (canLink(board, cols, rows, list[i], list[j])) return [list[i], list[j]];
      }
    }
  }
  return null;
}

function makeBoard(n, kinds) {
  const pairs = n / 2;
  const deck = [];
  for (let i = 0; i < pairs; i += 1) {
    const v = 1 + (i % kinds);
    deck.push(v, v);
  }
  C.shuffle(deck);
  return deck;
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = p.cols || 6;
  const rows = p.rows || 4;
  const n = cols * rows;
  const kinds = Math.min(GLYPHS.length, Math.max(3, p.kinds || 6));
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
  const duration = Math.max(20, p.duration || 55);
  const hintMs = Math.max(200, p.flashMs || 900);
  const freeHint = stage >= 3;
  const freeShuffle = stage >= 5;
  const pairs = n / 2;

  const vm = C.makeVm(cols, n, '点两枚同纹灵石，能连起来就收走一对', ctx.tip || '点两枚同纹，转折不超过两次');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.extras.showHint = true;
  vm.extras.compact = true;
  vm.hint = vm.costText;

  // 门槛按「一盘收干净能拿多少」标：满收 pairs×100 + 剩余息数×4，
  // 简单档满收基本是 S，漏几对或错配多了自然掉档。
  const sLimit = Math.ceil(pairs * (88 + depth * 10));
  const aLimit = Math.ceil(sLimit * 0.78);
  const bLimit = Math.ceil(sLimit * 0.55);

  const bag = C.TimerBag();
  let board = [];
  let selected = -1;
  let hintPair = null;
  let pairsDone = 0;
  let mistakes = 0;
  let combo = 0;
  let score = 0;
  let left = duration;
  let shuffles = 0;
  let done = false;
  let started = false;
  let hintTimer = null;

  function render() { ctx.render(vm); }

  function reshuffle() {
    const rest = [];
    for (let i = 0; i < n; i += 1) if (board[i]) rest.push(board[i]);
    C.shuffle(rest);
    let k = 0;
    for (let i = 0; i < n; i += 1) {
      if (!board[i]) continue;
      board[i] = rest[k];
      k += 1;
    }
    shuffles += 1;
    // 极小的概率重排后仍无可连对（剩余纹全被自己围住），再洗几次；绝不死循环。
    for (let t = 0; t < 24 && !findPair(board, cols, rows); t += 1) {
      C.shuffle(rest);
      k = 0;
      for (let i = 0; i < n; i += 1) {
        if (!board[i]) continue;
        board[i] = rest[k];
        k += 1;
      }
    }
    if (!freeShuffle) left = Math.max(0, left - 3);
    C.flash(vm, freeShuffle ? '灵纹自移 · 不扣息' : '灵纹自移 · 少 3 息', 'good');
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const v = board[i];
      cell.arrow = -1;
      cell.end = false;
      if (!v) {
        cell.cls = 'cell cell--gone';
        cell.label = '';
        cell.tone = 0;
        continue;
      }
      cell.cls = 'cell cell--lit cell--chip'
        + (i === selected ? ' cell--sel' : '')
        + (hintPair && (hintPair[0] === i || hintPair[1] === i) ? ' cell--hintpair' : '');
      cell.label = GLYPHS[v - 1];
      cell.tone = v;
    }
    vm.link = { first: selected, board: board.slice(), cols: cols, rows: rows, pairs: pairs };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = combo;
    vm.comboText = combo >= 3 ? '连收 ' + combo : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '分');
    vm.meter = { label: '已收灵契', value: pairsDone, max: pairs };
    vm.hint = vm.costText + ' · 照纹 · 剩 ' + (pairs - pairsDone) + ' 对 · 重排 ' + shuffles + ' 次';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '一纹不隔') : '';
    vm.link = { first: -1, board: board.slice(), cols: cols, rows: rows, pairs: pairs };
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary });
  }

  function finish() {
    const grade = C.gradeBy(score, sLimit, aLimit, bLimit);
    finishOnce(grade, '收 ' + pairsDone + ' / ' + pairs + ' 对 · 错配 ' + mistakes + ' · 重排 ' + shuffles);
  }

  function addScore(base) {
    const mult = combo >= 8 ? 2 : combo >= 4 ? 1.5 : 1;
    const gain = Math.round(base * mult);
    score += gain;
    return gain;
  }

  function clearHint() {
    if (hintTimer !== null) { bag.off(hintTimer); hintTimer = null; }
    hintPair = null;
  }

  function tap(index) {
    if (done || vm.phase !== 'playing' || index < 0 || index >= n || !board[index]) return;
    clearHint();
    if (selected < 0) { selected = index; paint(); render(); return; }
    if (selected === index) { selected = -1; paint(); render(); return; }
    const a = selected;
    const b = index;
    if (board[a] !== board[b]) {
      selected = b;                    // 点错纹只是改选，别让玩家再点一次取消
      mistakes += 1;
      combo = 0;
      left = Math.max(0, left - 2);
      C.flash(vm, '纹不合 · 少 2 息', 'bad');
    } else if (!canLink(board, cols, rows, a, b)) {
      selected = -1;
      mistakes += 1;
      combo = 0;
      left = Math.max(0, left - 2);
      C.flash(vm, '隔着纹，连不上 · 少 2 息', 'bad');
    } else {
      board[a] = 0;
      board[b] = 0;
      selected = -1;
      pairsDone += 1;
      combo += 1;
      const gain = addScore(100);
      C.flash(vm, '灵契相合 +' + gain, 'good');
      if (pairsDone >= pairs) {
        score += Math.max(0, left) * 4;
        paint();
        syncHud();
        render();
        finish();
        return;
      }
      if (!findPair(board, cols, rows)) reshuffle();
    }
    paint();
    syncHud();
    if (left <= 0) { finish(); return; }
    render();
  }

  function hint() {
    if (done || vm.phase !== 'playing') return;
    const pair = findPair(board, cols, rows);
    if (!pair) { reshuffle(); paint(); syncHud(); render(); return; }
    clearHint();
    hintPair = pair;
    if (!freeHint) left = Math.max(0, left - 2);
    vm.status = freeHint ? '照纹：这两枚连得上' : '照纹：少 2 息，这两枚连得上';
    paint();
    syncHud();
    render();
    hintTimer = bag.after(function () {
      if (done) return;
      hintPair = null;
      paint();
      render();
    }, hintMs);
    // 提示高亮期间继续操作不该把高亮留在已收走的格子上：tap 会清掉它。
    if (left <= 0) finish();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '点两枚同纹灵石，能连起来就收走一对';
    vm.banner = theme.banner || '';
    for (let t = 0; t < 40; t += 1) {
      board = makeBoard(n, kinds);
      if (findPair(board, cols, rows)) break;
    }
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
  id: 'link', name: '灵纹连线', create: create,
  canLink: canLink, findPair: findPair, GLYPHS: GLYPHS,
};
