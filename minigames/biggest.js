'use strict';

// 数中取大（择大辨微 / 辨术·摘魁诀专属）：一眼挑出盘上最大的那个数。
//
// 与「顺序点格」的区别：舒尔特是固定盘从 1 点到 N，考的是按序扫一遍；
// 这里每一轮都换一批数，只要当场认出最大的一个，考的是比较而不是记忆。
// 与「辨伪择真」的区别：剑法是数道剑光里认一道真招，靠的是「真 / 假」两态；
// 这里是十几个数字里挑最大，靠的是大小关系。
//
// 一局固定若干轮：每轮盘上重排一批数，点最大的那个进下一轮，走完即完成。
// 点错不换轮，只罚 2 秒；时辰到还没走完是走火 F。
// 评级只看用时（含罚时），三条线由本模块 linesOf 按本档轮数与档位推。

const C = require('./common.js');

const WRONG_PENALTY = 2;
const COLS = 4;
const CELLS = 16;

// 每轮盘上有几个数：3×3 起，最高摆满 4×4。
const COUNTS = [9, 11, 13, 15, 16];
// 一局几轮：轮数越多越考耐力，档越高轮数越多。
const ROUNDS = [8, 10, 12, 14, 16];

function linesOf(p) {
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  const rounds = Math.max(4, p && p.rounds ? p.rounds : ROUNDS[depth]);
  // 一轮约 2.2 秒：扫一遍、比一遍、点一下。
  const s = Math.round(rounds * (2.2 - depth * 0.15));
  return [Math.max(8, s), Math.max(12, Math.round(s * 1.5)), Math.max(16, Math.round(s * 2.2))];
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const count = Math.max(6, Math.min(CELLS, p.count || COUNTS[depth]));
  const rounds = Math.max(4, p.rounds || ROUNDS[depth]);
  const lim = linesOf(Object.assign({}, p, { depth: depth, count: count, rounds: rounds }));
  const timeLimit = Math.max(lim[0] + 10, p.timeLimit || Math.round(lim[2] * 1.3));
  const costText = ctx.tip || '点错不换轮，罚 ' + WRONG_PENALTY + ' 秒';

  const bag = C.TimerBag();
  const vm = C.makeVm(COLS, CELLS, '点出盘上最大的那个数', costText);
  vm.extras.compact = true;

  let order = new Array(CELLS).fill(0);
  let maxVal = 0;
  let round = 1;
  let wrong = 0;
  let elapsed = 0;
  let penalty = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function used() { return elapsed + penalty; }

  function deal() {
    // 数值范围随轮数往上抬：越往后数越长，扫起来越费眼。
    const span = 10 + Math.floor((round - 1) * 6);
    const pool = [];
    while (pool.length < count) {
      const v = 1 + C.randInt(span);
      if (pool.indexOf(v) < 0) pool.push(v);
    }
    maxVal = Math.max.apply(null, pool);
    const slots = [];
    for (let i = 0; i < CELLS; i += 1) slots.push(i);
    C.shuffle(slots);
    order = new Array(CELLS).fill(0);
    for (let i = 0; i < count; i += 1) order[slots[i]] = pool[i];
  }

  function paint() {
    for (let i = 0; i < CELLS; i += 1) {
      const cell = vm.cells[i];
      const v = order[i];
      cell.arrow = -1;
      cell.end = false;
      cell.label = v ? String(v) : '';
      // 按位数分色（个位 / 十位 / 五十以上）只是让数字更好读，不等于把答案标出来：
      // 同一档里的数颜色一样，最大的那个还是得自己比。
      cell.tone = v ? (v >= 50 ? 3 : v >= 10 ? 2 : 1) : 0;
      cell.cls = v ? 'cell cell--num' : 'cell cell--void';
    }
    vm.biggest = { cols: COLS, values: order.slice(), max: maxVal };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, timeLimit - used()));
    vm.progress = C.pct(round - 1, rounds);
    vm.progressText = '第 ' + round + ' / ' + rounds + ' 轮';
    vm.scoreText = '用时 ' + used() + ' 秒';
    vm.goal = '第 ' + round + ' / ' + rounds + ' 轮' + (wrong ? ' · 点错 ' + wrong + ' 次' : '');
    vm.gradeNow = used() <= lim[0] ? 'S' : used() <= lim[1] ? 'A' : used() <= lim[2] ? 'B' : 'C';
    vm.hint = costText + ' · 本档 ' + rounds + ' 轮 · ' + lim[0] + ' 秒内 S';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = grade === 'F' ? '时辰到' : '走完了';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({
      grade: grade,
      score: grade === 'F' ? 0 : Math.max(0, (lim[2] - used()) * 10 + rounds * 20),
      summary: summary,
      notes: notesOf(),
    });
  }

  function gradeOf() {
    if (used() <= lim[0]) return 'S';
    if (used() <= lim[1]) return 'A';
    if (used() <= lim[2]) return 'B';
    return 'C';
  }

  function notesOf() {
    const notes = [];
    const g = gradeOf();
    if (g === 'S') notes.push('用时 ' + used() + ' 秒，进了 S 线（' + lim[0] + ' 秒）。');
    else notes.push('用时 ' + used() + ' 秒 · S 线 ' + lim[0] + ' 秒、A 线 ' + lim[1] + ' 秒。');
    if (wrong) notes.push('点错 ' + wrong + ' 次，罚了 ' + penalty + ' 秒：先看位数，两位一定比一位大。');
    return notes;
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    round = 1;
    deal();
    paint();
    syncHud();
    vm.status = '点最大的那个数';
    render();
    bag.every(function () {
      if (done) return;
      elapsed += 1;
      if (used() >= timeLimit) {
        syncHud();
        C.flash(vm, '时辰到 · 第 ' + round + ' 轮没走完', 'bad');
        finishOnce('F', '时辰到，走到第 ' + round + ' / ' + rounds + ' 轮');
        return;
      }
      syncHud();
      render();
    }, 1000);
  }

  paint();
  syncHud();
  render();

  return C.fillController({
    start: start,
    tap: function (index) {
      if (done || vm.phase !== 'playing') return;
      if (index < 0 || index >= CELLS) return;
      if (!order[index]) return;
      if (order[index] !== maxVal) {
        wrong += 1;
        penalty += WRONG_PENALTY;
        C.flash(vm, '这个不是最大 · 罚 ' + WRONG_PENALTY + ' 秒', 'bad');
        render();
        return;
      }
      if (round >= rounds) {
        paint();
        syncHud();
        C.flash(vm, '走完 ' + rounds + ' 轮 · ' + used() + ' 秒', 'gold');
        finishOnce(gradeOf(), '走完 ' + rounds + ' 轮 · 用 ' + used() + ' 秒');
        return;
      }
      round += 1;
      deal();
      paint();
      syncHud();
      C.flash(vm, '对了 · 第 ' + round + ' 轮', 'good');
      render();
    },
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const lim = linesOf(p);
  const rounds = Math.max(4, (p && p.rounds) || 8);
  return {
    rule: '按用时评级（含点错的罚时；' + rounds + ' 轮全走完才算完成）',
    items: [
      'S：' + lim[0] + ' 秒内走完',
      'A：' + lim[1] + ' 秒内',
      'B：' + lim[2] + ' 秒内',
      'C：超过 ' + lim[2] + ' 秒才走完',
    ],
    fail: '时辰到还没走完 → 走火 F，只算两成收益',
  };
}

module.exports = {
  id: 'biggest',
  name: '数中取大',
  create: create,
  lines: lines,
  COUNTS: COUNTS,
  ROUNDS: ROUNDS,
};
