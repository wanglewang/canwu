'use strict';

// 顺序点格（循数疾点 / 目术·逐数诀专属）：舒尔特方格。
//
// 与「数中取大」的区别：那里每一轮换一批数、只要挑最大的那一个；
// 这里数不动，考的是目光按 1→N 一路扫过去、不乱、不回头。
// 与「辨伪择真」的区别：剑法是「认准一个真招」，这里是「按序把一整个盘走完」。
//
// 一局一盘：N×N 格上打乱写着 1 到 N²，按序点过去，点完即完成。
// 点错不换格，罚时并重记一次错；时辰到还没点完是走火 F。
// 评级只看用时（含罚时），三条线由本模块 linesOf 按盘面尺寸与本档推——格子越多越长、档越高越紧。
//
// 盘面上**不标「下一个在哪」**：HUD 报的是「下一个几」，位置得自己扫出来。
// 这一门练的就是目光按序扫过整盘、不乱不回头；一旦替玩家把目标格圈亮，
// 就只剩「点发亮的格子」，与舒尔特方格本身无关了。难度全部由「格子多少 + 罚时 + 时限」承担。

const C = require('./common.js');

// 格子数随档递增，到 6×6 封顶：7×7 在 4.7 寸屏上每格只剩 98rpx、字 20rpx，
// 数字看不清就成了「猜」而不是「找」。到顶之后难度改由罚时与时限收紧。
const SIZES = [4, 5, 6, 6, 6];
// 点错的代价随档加重：简单档手滑不心疼，绝境档一次手滑就吃掉半条 S 线。
const PENALTIES = [2, 2, 3, 4, 5];
// 每格的时间预算（含找 + 点）：简单档最宽，越往后越紧。
const PER_CELL = [1.15, 1.05, 0.95, 0.88, 0.80];

function linesOf(p) {
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  const size = Math.max(3, Math.min(6, p && p.size ? p.size : SIZES[depth]));
  const n = size * size;
  const s = Math.round(n * PER_CELL[depth]);
  return [Math.max(8, s), Math.max(12, Math.round(s * 1.45)), Math.max(16, Math.round(s * 2.1))];
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const size = Math.max(3, Math.min(6, p.size || SIZES[depth]));
  const n = size * size;
  const lim = linesOf(Object.assign({}, p, { depth: depth, size: size }));
  const penaltySec = PENALTIES[depth];
  const timeLimit = Math.max(lim[0] + 10, p.timeLimit || Math.round(lim[2] * 1.35));
  const costText = ctx.tip ? ctx.tip + ' · 本档 ' + penaltySec + ' 秒' : '点错不换格，罚 ' + penaltySec + ' 秒';

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
      // 不标「下一个在哪」：点过的变灰，没点的与待找的一视同仁。
      if (v < next) cell.cls = 'cell cell--gone';
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
    if (wrong) notes.push('点错 ' + wrong + ' 次，罚了 ' + penalty + ' 秒：别用手指追着数走，目光放中间、用余光扫四周找下一个数。');
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
        penalty += penaltySec;
        C.flash(vm, '该点 ' + next + ' · 罚 ' + penaltySec + ' 秒', 'bad');
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
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  const size = Math.max(3, Math.min(6, p && p.size ? p.size : SIZES[depth]));
  return {
    rule: '按用时评级（含点错的罚时；点完整盘才算完成）',
    items: [
      size + '×' + size + ' 盘 · ' + size * size + ' 个数 · 点错罚 ' + PENALTIES[depth] + ' 秒',
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
  PENALTIES: PENALTIES,
};
