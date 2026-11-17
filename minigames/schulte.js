'use strict';

// 顺序点格（循数疾点 / 神识·遍观毫厘诀专属）：舒尔特方格。
//
// 与「数中取大」的区别：那里每一轮换一批数、只要挑最大的那一个；
// 这里数不动，考的是目光按 1→N 一路扫过去、不乱、不回头。
// 与「辨伪择真」的区别：剑法是「认准一个真招」，这里是「按序把一整个盘走完」。
//
// 一局一盘：N×N 格上打乱写着 1 到 N²，按序点过去，点完即完成。
// 点错不换格，罚时并重记一次错；时辰到还没点完是失败 F。
// 评级只看用时（含罚时），三条线与时辰由本模块的 LEVELS 逐档给死。
//
// 盘面上**不标「下一个在哪」**：HUD 报的是「下一个几」，位置得自己扫出来。
// 这一门练的就是目光按序扫过整盘、不乱不回头；一旦替玩家把目标格圈亮，
// 就只剩「点发亮的格子」，与舒尔特方格本身无关了。
//
// 五档的难度只走两根轴，不许退化成「同一盘棋换个秒表」：
//   ① 盘面 4 → 5 → 6 → 7（规模）；② 点过的格退不退场（信息）。
// 尺寸到 7×7 封顶：8×8 每格只剩 84rpx，两位数在 22rpx 字号下认不快；
// 而 7×7 的每格仍有约 100×76rpx（50×38px），远在项目「每格 ≥25px」的下限之上。
//
// 为什么必须每档换点东西：6×6 上两档只差 2 秒时，档差小于同一尺寸不同布局的
// 成绩波动（多方舒尔特参照都指向 3–5 秒），玩家感受到的是「今天手气」而不是「这档更难」。
// 所以「困难 → 极难」这一对同盘面，差别只有一条规则：极难起，点过的格不再退场。

const C = require('./common.js');
const K = require('./teach-kit.js');

// 五档整表。每一列都是玩家看得见、且玩法层真的读走的：
//   size    盘面边长（规格）；fade 点过的格退不退场（信息；不退色 = 盘面始终是满的）；
//   s/a/b   三条用时线；limit 时辰；penalty 点错罚时。
//
// 三条线不写成「S 的几个固定倍数」：不同尺寸的用时分布形状不一样，用同一组倍数切，
// 低档的 B 线会慢到没人掉出去（评级退化成 S/A 两档），高档的 C 带又会窄到不存在。
// 标定口径（成人 18–40 岁舒尔特参照，折成每格用时）：
//   简单 4×4 1.00 秒/格 ≈ 一般偏上      ｜普通 5×5 0.96 ≈ 一般偏上
//   困难 6×6 0.92 ≈ 中等                ｜极难 6×6 0.89 ≈ 中等偏上（另有「不退场」加码）
//   绝境 7×7 0.88 ≈ 优秀
// 每格预算逐档递减，所以「越往上越紧」在每格口径上成立；秒数随盘面变大而变大。
const LEVELS = [
  { size: 4, fade: true, s: 16, a: 22, b: 28, limit: 38, penalty: 2 },
  { size: 5, fade: true, s: 24, a: 33, b: 40, limit: 54, penalty: 3 },
  { size: 6, fade: true, s: 33, a: 44, b: 56, limit: 74, penalty: 4 },
  { size: 6, fade: false, s: 32, a: 43, b: 56, limit: 72, penalty: 5 },
  { size: 7, fade: false, s: 43, a: 56, b: 73, limit: 95, penalty: 6 },
];

const SIZES = LEVELS.map(function (l) { return l.size; });
const PENALTIES = LEVELS.map(function (l) { return l.penalty; });
const FADE = LEVELS.map(function (l) { return l.fade; });

// 时辰与 B 线之间至少留这么多秒：章内时辰按 30% 收紧，收到底之后如果压到 B 线以下，
// 「点完了但慢」这一档就整个消失——玩家会看到「明明过了 B 线却是失败」。
const C_WINDOW = 8;
// 档位越界（第 5 章末段的伪档）时兜底到最后一档，别让 size 变成 undefined。
const LEVEL_MAX = LEVELS.length - 1;

function levelOf(depth) {
  const d = Math.max(0, Math.min(LEVEL_MAX, typeof depth === 'number' ? depth : 0));
  return LEVELS[d];
}

// 布局的「走盘长度」：把 1→N 一路走完，平均每一步横竖挪几格。
// 纯随机的均值是 2(size²−1)/(3size)（每轴 |Δ| 的期望 × 2），实测同一尺寸上下浮动可达 ±15%；
// 而档与档之间只差 1–3 秒——布局方差大于档差，档位就退化成运气。
const DEAL_BAND = 0.12;
const DEAL_TRIES = 60;

function pathMean(size, order) {
  const n = order.length;
  const pos = new Array(n + 1);
  for (let i = 0; i < n; i += 1) pos[order[i]] = i;
  let sum = 0;
  for (let v = 2; v <= n; v += 1) {
    const p = pos[v - 1];
    const q = pos[v];
    sum += Math.abs((p % size) - (q % size)) + Math.abs(Math.floor(p / size) - Math.floor(q / size));
  }
  return sum / Math.max(1, n - 1);
}

function idealStep(size) {
  const n = size * size;
  return 2 * (n - 1) / (3 * size);
}

// 抽一局：随机打乱后按「走盘长度落在带宽内」筛一遍，超带宽就重抽；
// 抽满次数仍不合格时退而取最接近的那一局（宁可偏慢，不许卡死）。
// 内容仍然是一局一图，不固定——固定布局会被背下来，这一门就只剩手速。
function deal(size) {
  const n = size * size;
  const bag = [];
  for (let v = 1; v <= n; v += 1) bag.push(v);
  const ideal = idealStep(size);
  const tol = ideal * DEAL_BAND;
  let best = null;
  let bestGap = Infinity;
  for (let t = 0; t < DEAL_TRIES; t += 1) {
    const order = C.shuffle(bag.slice());
    const gap = Math.abs(pathMean(size, order) - ideal);
    if (gap <= tol) return order;
    if (gap < bestGap) { bestGap = gap; best = order; }
  }
  return best;
}

// 说明页与准备页读的是同一张表，所以这里不再有「按每格预算现算」的第二套算法。
// lineScale 是章内那根连续旋钮（真源 data/levels.js 的 tweakParams）：整条尺子按关收紧，
// 三条线与时辰一起缩，比例只在 0.5–1 之间。它是这一门唯一的「每关都不同」的来源——
// 盘面与罚时都是整数、档内不变，没有它，一章 40 关会一字不差。
function linesOf(p) {
  const row = levelOf(p && p.depth);
  const raw = p && typeof p.lineScale === 'number' ? p.lineScale : 1;
  const scale = Math.max(0.5, Math.min(1, raw));
  const pen = p && typeof p.penaltySec === 'number' ? p.penaltySec : row.penalty;
  const s = Math.max(4, Math.round(row.s * scale));
  const a = Math.max(s + 1, Math.round(row.a * scale));
  const b = Math.max(a + 1, Math.round(row.b * scale));
  return {
    row: row,
    scale: scale,
    s: s,
    a: a,
    b: b,
    // 时辰跟着尺子一起收，但不许收进 B 线里——C 带是「点完了但慢」唯一的落处。
    limit: Math.max(b + C_WINDOW, Math.round(row.limit * scale)),
    penalty: pen,
  };
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const depth = Math.max(0, Math.min(LEVEL_MAX, typeof p.depth === 'number' ? p.depth : 0));
  const row = levelOf(depth);
  // 盘面边长优先读注入值，与 penaltySec / fade 一个口径：三样都由 buildParams 按档注入，
  // 玩法层就得真的读走（不然准备页写「7×7 盘」、局内却按表兜底成 6×6，只有连打两局才看得出）。
  // 注入值与模块表同源，verify 8b-5 逐项比对；不一致时先红在那条断言上。
  const size = typeof p.size === 'number' && p.size >= 3 && p.size <= 7 ? Math.round(p.size) : row.size;
  const n = size * size;
  const lim = linesOf(Object.assign({}, p, { depth: depth }));
  // 罚时由 buildParams 按档注入（与 LEVELS 同源，verify 逐项比对）；
  // 不带 params 的测试探针仍走模块里那张兜底表。
  const penaltySec = lim.penalty;
  // 点过的格退不退场由档位定：高档不退场，盘面始终是满的，找数只能靠眼。
  const fade = typeof p.fade === 'boolean' ? p.fade : row.fade;
  // 章内时辰会被 lineScale 收紧，linesOf 已经把它压在 B 线之上，这里再兜一层。
  const timeLimit = Math.max(lim.b + C_WINDOW, p.timeLimit || lim.limit);
  const costText = ctx.tip ? ctx.tip + ' · 本段 ' + penaltySec + ' 秒' : '点错不换格，罚 ' + penaltySec + ' 秒';

  const bag = C.TimerBag();
  const vm = C.makeVm(size, n, '按 1 到 ' + n + ' 的顺序点过去', costText);
  vm.extras.compact = size >= 6;

  let order = [];
  let next = 1;
  let wrong = 0;
  let elapsed = 0;
  let penalty = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  // 用时 = 实际经过 + 罚时。罚时只进这一条，不进时辰判定——见 bag.every。
  function used() { return elapsed + penalty; }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const v = order[i];
      cell.arrow = -1;
      cell.end = false;
      cell.label = typeof v === 'number' ? String(v) : '';
      cell.tone = 0;
      // 不标「下一个在哪」：没点的与待找的一视同仁。
      // 点过的那一格：低档退成空位（玉牌被取走），高档留在盘上、和没点的一模一样。
      if (fade && typeof v === 'number' && v < next) cell.cls = 'cell cell--gone';
      else cell.cls = 'cell cell--num';
    }
    vm.schulte = { size: size, order: order.slice(), next: next, fade: fade };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, timeLimit - elapsed));
    vm.progress = C.pct(next - 1, n);
    vm.progressText = '已点 ' + (next - 1) + ' / ' + n;
    vm.scoreText = '用时 ' + used() + ' 秒';
    vm.goal = next > n ? '已点完' : '下一个 ' + next + (wrong ? ' · 点错 ' + wrong + ' 次' : '');
    vm.gradeNow = used() <= lim.s ? 'S' : used() <= lim.a ? 'A' : used() <= lim.b ? 'B' : 'C';
    vm.hint = costText + ' · ' + size + '×' + size + ' · ' + lim.s + ' 秒内 S';
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
      score: grade === 'F' ? 0 : Math.max(0, (lim.b - used()) * 10 + n * 10),
      summary: summary,
      notes: notesOf(),
    });
  }

  function gradeOf() {
    if (used() <= lim.s) return 'S';
    if (used() <= lim.a) return 'A';
    if (used() <= lim.b) return 'B';
    return 'C';
  }

  function notesOf() {
    const notes = [];
    const g = gradeOf();
    if (g === 'S') notes.push('用时 ' + used() + ' 秒，进了 S 线（' + lim.s + ' 秒）。');
    else notes.push('用时 ' + used() + ' 秒 · S 线 ' + lim.s + ' 秒、A 线 ' + lim.a + ' 秒。');
    if (wrong) notes.push('点错 ' + wrong + ' 次，罚了 ' + penalty + ' 秒：别用手指追着数走，目光放中间、用余光扫四周找下一个数。');
    return notes;
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    vm.status = '从 1 开始，按顺序点';
    order = deal(size);
    next = 1;
    paint();
    syncHud();
    render();
    bag.every(function () {
      if (done) return;
      elapsed += 1;
      // 失败只看「实际经过」：罚时改写评级，不改这一局能不能走完。
      // 以前这里比的是「实际 + 罚时」，于是绝境档连错四次就能把一局本来打得不错的人判成 F——
      // 与「点错只是纪录变差」的说法正好相反，也和「本门只奖不罚」的调性相反。
      if (elapsed >= timeLimit) {
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
    abandon: function () { finishOnce('F', '中途结束'); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const l = linesOf(p);
  const row = l.row;
  // 说明页也要和局内同一块盘：边长读注入值，三条线仍按档取（同源由 verify 8b-5 锁死）。
  const size = p && typeof p.size === 'number' && p.size >= 3 && p.size <= 7 ? Math.round(p.size) : row.size;
  const n = size * size;
  const fade = p && typeof p.fade === 'boolean' ? p.fade : row.fade;
  return {
    rule: '盯住盘心，用余光扫四周去找下一个数——手指只负责点，别追着数字走。按用时评级（含点错的罚时），点完整盘才算完成。',
    items: [
      size + '×' + size + ' 盘 · ' + n + ' 个数 · 点错罚 ' + l.penalty + ' 秒',
      fade ? '点过的格退场：盘面越点越空' : '点过的格不退场：盘面始终是满的，找数只能靠眼',
      'S：' + l.s + ' 秒内点完',
      'A：' + l.a + ' 秒内',
      'B：' + l.b + ' 秒内',
      'C：超过 ' + l.b + ' 秒才点完',
    ],
    fail: '时辰到还没点完 → 失败 F，这一局没有收益',
  };
}

// 首局手把手：只走一步——把「1」点掉。
// 这一门唯一要讲的是「顺序是死的」，让手先走一遍，比写一句「从 1 点到 N」有用。
const TEACH_ORDER = [7, 2, 12, 5, 1, 14, 9, 16, 4, 11, 6, 13, 8, 15, 3, 10];

function createTeach(ctx) {
  const cells = K.blank(4, TEACH_ORDER.length);
  return K.run(ctx, {
    cols: 4,
    cells: cells,
    status: '教学 · 从 1 点到 16',
    steps: [{
      at: [TEACH_ORDER.indexOf(1)],
      text: '先点 1 · 之后按 2、3 一路点到 16',
      take: function () { return { text: '1 点掉了 · 跳号不算，得按顺序来' }; },
    }],
    paint: function () {
      for (let i = 0; i < cells.length; i += 1) {
        cells[i].cls = 'cell cell--num';
        cells[i].label = String(TEACH_ORDER[i]);
      }
    },
    doneText: '顺序是死的：1 之后是 2',
  });
}

const teach = { create: createTeach };

module.exports = {
  id: 'schulte',
  name: '顺序点格',
  create: create,
  lines: lines,
  teach: teach,
  LEVELS: LEVELS,
  SIZES: SIZES,
  PENALTIES: PENALTIES,
  FADE: FADE,
  C_WINDOW: C_WINDOW,
  deal: deal,
  pathMean: pathMean,
  idealStep: idealStep,
};
