'use strict';

// 顺序点格（循数疾点 / 目术·逐数诀专属）：舒尔特方格。
//
// 与「数中取大」的区别：那里每一轮换一批数、只要挑最大的那一个；
// 这里数不动，考的是目光按 1→N 一路扫过去、不乱、不回头。
// 与「辨伪择真」的区别：剑法是「认准一个真招」，这里是「按序把一整个盘走完」。
//
// 一局一盘：N×N 格上打乱写着 1 到 N²，按序点过去，点完即完成。
// 点错不换格，只罚 2 秒并重记一次错；时辰到还没点完是走火 F。
// 评级只看用时（含罚时），三条线由本模块 linesOf 按盘面尺寸与本档推——格子越多越长、档越高越紧。

const C = require('./common.js');

const WRONG_PENALTY = 2;

const SIZES = [4, 5, 5, 6, 6];

function linesOf(p) {
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  const size = Math.max(3, Math.min(6, p && p.size ? p.size : SIZES[depth]));
  const n = size * size;
  // 一格约 0.9 秒起步：4×4 十四秒上下，6×6 四十几秒。档越高线越紧。
  const s = Math.round(n * (0.9 - depth * 0.06));
  return [Math.max(8, s), Math.max(12, Math.round(s * 1.5)), Math.max(16, Math.round(s * 2.2))];
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const size = Math.max(3, Math.min(6, p.size || SIZES[depth]));
  const n = size * size;
  const lim = linesOf(Object.assign({}, p, { depth: depth, size: size }));
  const timeLimit = Math.max(lim[0] + 10, p.timeLimit || Math.round(lim[2] * 1.35));
  const costText = ctx.tip || '点错不换格，罚 ' + WRONG_PENALTY + ' 秒';

  const bag = C.TimerBag();
  const vm = C.makeVm(size, n, '按 1 到 ' + n + ' 的顺序点过去', costText);
  vm.extras.compact = size >= 6;

  let order = [];
  let posOf = [];
  let next = 1;
  let wrong = 0;
  let elapsed = 0;
  let penalty = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function used() { return elapsed + penalty; }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const v = order[i];
      cell.arrow = -1;
      cell.end = false;
      cell.label = String(v);
      cell.tone = 0;
      if (v < next) cell.cls = 'cell cell--gone';
      else if (v === next) cell.cls = 'cell cell--num cell--next';
      else cell.cls = 'cell cell--num';
    }
    vm.schulte = { size: size, order: order.slice(), next: next };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, timeLimit - used()));
    vm.progress = C.pct(next - 1, n);
    vm.progressText = '已点 ' + (next - 1) + ' / ' + n;
    vm.scoreText = '用时 ' + used() + ' 秒';
    vm.goal = next > n ? '已点完' : '下一个 ' + next + (wrong ? ' · 点错 ' + wrong + ' 次' : '');
    vm.gradeNow = used() <= lim[0] ? 'S' : used() <= lim[1] ? 'A' : used() <= lim[2] ? 'B' : 'C';
    vm.hint = costText + ' · ' + size + '×' + size + ' · ' + lim[0] + ' 秒内 S';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = grade === 'F' ? '时辰到' : '点完了';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({
      grade: grade,
      score: grade === 'F' ? 0 : Math.max(0, (lim[2] - used()) * 10 + n * 10),
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
    if (wrong) notes.push('点错 ' + wrong + ' 次，罚了 ' + penalty + ' 秒：错的都在邻格，别用手指记位置，用眼睛找下一个数。');
    return notes;
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    vm.status = '从 1 开始，按顺序点';
    order = [];
    for (let v = 1; v <= n; v += 1) order.push(v);
    C.shuffle(order);
    posOf = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i += 1) posOf[order[i]] = i;
    next = 1;
    paint();
    syncHud();
    render();
    bag.every(function () {
      if (done) return;
      elapsed += 1;
      if (used() >= timeLimit) {
        syncHud();
        C.flash(vm, '时辰到 · 还差 ' + (n - next + 1) + ' 个', 'bad');
        finishOnce('F', '时辰到，还差 ' + (n - next + 1) + ' 个没点');
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
      if (index < 0 || index >= n) return;
      if (order[index] !== next) {
        wrong += 1;
        penalty += WRONG_PENALTY;
        C.flash(vm, '该点 ' + next + ' · 罚 ' + WRONG_PENALTY + ' 秒', 'bad');
        paint();
        syncHud();
        render();
        return;
      }
      next += 1;
      if (next > n) {
        paint();
        syncHud();
        C.flash(vm, '点完 · 用 ' + used() + ' 秒', 'gold');
        finishOnce(gradeOf(), '点完 ' + n + ' 格 · 用 ' + used() + ' 秒');
        return;
      }
      paint();
      syncHud();
      C.flash(vm, String(next - 1) + ' 点过了', 'good');
      render();
    },
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const lim = linesOf(p);
  return {
    rule: '按用时评级（含点错的罚时；点完整盘才算完成）',
    items: [
      'S：' + lim[0] + ' 秒内点完',
      'A：' + lim[1] + ' 秒内',
      'B：' + lim[2] + ' 秒内',
      'C：超过 ' + lim[2] + ' 秒才点完',
    ],
    fail: '时辰到还没点完 → 走火 F，这一局没有收益',
  };
}

module.exports = {
  id: 'schulte',
  name: '顺序点格',
  create: create,
  lines: lines,
  SIZES: SIZES,
};
