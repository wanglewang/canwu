'use strict';

// 小游戏公共工具。统一接口：create(ctx) -> controller
// ctx = { params, difficulty, perks, tip, twist, theme, render(vm), finish(result) }
// result = { grade: 'S'|'A'|'B'|'C'|'F', score, summary }
// controller = { start, tap, longpress, swipe, move, setAspect, undo, hint, press, release, abandon, destroy }
//   swipe(path, meta) 是「手指划过的格子序列 + 收势停留」，由页面用 touch 坐标命中并插值补全后送入；
//     只有需要划的玩法（目前是顺光扫斩）实现它，其余走默认的 noop。
//   move(dir) 是方向键，只有带 vm.extras.showPad 的玩法（俄罗斯方块）实现。
//   setAspect(w/h) 是页面量到真实格子矩形后回注的宽高比，给箭头 / 白光校正角度用。
// vm = { cols, cells, phase, status, hint, timeText, scoreText, charge, ring, trail, slash, pad, extras, HUD 字段 }
// cells[i] = { key, label, cls, tone, life, lifeDelay, arrow, end }；
//   arrow 是 0–359 的方向角（指向下一格），-1 为不画箭头；end 表示这一格是刀路收势（画靶心）。
// pad = { keys: [...] } 是盘面下方的方向键；compact 让格子压矮，给行数多的盘面留屏。
// HUD 字段：progress / progressText / combo / comboText / goal / gradeNow / banner / fx / hearts / meter
// stage = 'board' | 'lane' | 'ring' | 'charge' | 'orbit' | 'scroll'，由页面决定盘面形态。
// lane / orbit / scroll 是对应舞台的附加渲染数据，board/ring/charge 用不到时为 null。

function randInt(n) { return Math.floor(Math.random() * n); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// arrow / end / endLive 是「刀路指向」的可选字段：-1 / false 表示这一格不画方向图形。
// endLive 专给双锋用：两条路都有靶心，只有会呼吸的那个是真招。
// 在 vm 协议里给默认值，格子结构才不会因为某套玩法挂过箭头而变得不一致。
function makeCells(n) {
  const a = [];
  for (let i = 0; i < n; i += 1) a.push({ key: i, label: '', cls: 'cell', tone: 0, arrow: -1, end: false, endLive: false });
  return a;
}

function clearCells(cells) {
  for (let i = 0; i < cells.length; i += 1) {
    cells[i].label = '';
    cells[i].cls = 'cell';
    cells[i].tone = 0;
    cells[i].arrow = -1;
    cells[i].end = false;
    cells[i].endLive = false;
  }
}

function gradeBy(score, s, a, b) {
  if (score >= s) return 'S';
  if (score >= a) return 'A';
  if (score >= b) return 'B';
  return 'C';
}

function mmss(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function pct(part, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(part / total * 100)));
}

// 一次性的浮字反馈。n 在 0/1 间交替，让 wxml 的 class 变化以重播动画。
function flash(vm, text, tone) {
  vm.fxSeq = (vm.fxSeq || 0) + 1;
  vm.fx = { key: vm.fxSeq, n: vm.fxSeq % 2, text: text, tone: tone || 'good' };
}

// 目标句只讲「这一局还差什么」。「圆满」是段位名（未入门→入门→小成→大成→圆满），
// 拿它来形容已经拿到 S，玩家会当场以为自己晋了段；这里一律只说评级。
function goalFor(grade, remain, unit) {
  if (grade === 'S') return '已入 S · 稳住这一局';
  if (remain <= 0) return '再进一点就是 S';
  return '再 ' + remain + ' ' + unit + '可入 S';
}

// 按用时评级的玩法（探禁 / 搭桥 / 翻牌）不能摆「当前档位」：0 秒时按当前用时反推必然是 S，
// 玩家会以为 S 已经到手，之后只能看它往下掉。局内改报下一条线的时限，档位只在结算出现。
// 不写「已用几秒」——HUD 顶上那个计时就是它，写两遍只是换个说法重复同一个数。
// extra 是拿到 S 的附加条件（如「牌 ≤ 24」），只挂在 S 线上。
function paceGoal(elapsed, lines, extra) {
  const grade = ['S', 'A', 'B'];
  for (let i = 0; i < lines.length; i += 1) {
    if (elapsed <= lines[i]) {
      const tail = i === 0 && extra ? ' · ' + extra : '';
      return grade[i] + ' 线 ' + lines[i] + ' 秒' + tail;
    }
  }
  return '已过 B 线 · 收场只算 C';
}

function TimerBag() {
  const intervals = [];
  const timeouts = [];
  const flexes = [];
  return {
    every: function (fn, ms) {
      const id = setInterval(fn, ms);
      intervals.push(id);
      return id;
    },
    after: function (fn, ms) {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    },
    // 单独撤掉一个 after：光点换位、提前刺中时要把旧的寿命计时掐掉。
    off: function (id) {
      if (id === null || id === undefined) return;
      clearTimeout(id);
    },
    // 可变间隔的循环：msFn() 每轮取一次间隔，用于连击升温之类的节奏变化。
    everyFlex: function (fn, msFn) {
      const h = { alive: true, id: null };
      flexes.push(h);
      function run() {
        if (!h.alive) return;
        fn();
        if (!h.alive) return;
        h.id = setTimeout(run, Math.max(16, msFn()));
      }
      h.id = setTimeout(run, Math.max(16, msFn()));
      return h;
    },
    clear: function () {
      for (let i = 0; i < intervals.length; i += 1) clearInterval(intervals[i]);
      for (let i = 0; i < timeouts.length; i += 1) clearTimeout(timeouts[i]);
      for (let i = 0; i < flexes.length; i += 1) {
        flexes[i].alive = false;
        if (flexes[i].id !== null) clearTimeout(flexes[i].id);
      }
      intervals.length = 0;
      timeouts.length = 0;
      flexes.length = 0;
    },
  };
}

function makeVm(cols, cellCount, status, hint) {
  return {
    cols: cols,
    cells: makeCells(cellCount),
    stage: 'board',
    lane: null,
    orbit: null,
    scroll: null,
    phase: 'ready',
    status: status,
    hint: hint,
    timeText: '',
    scoreText: '',
    charge: null,
    ring: null,
    trail: null,      // 需要划的玩法：当前刀路 { path, name, angle, gold, on }
    slash: null,      // 刺中时掠过盘面的白光 { key, angle }
    pad: null,        // 需要方向键的玩法：{ keys: [{ id, dir, glyph }] }
    progress: 0,
    progressText: '',
    combo: 0,
    comboText: '',
    goal: '',
    gradeNow: 'C',
    banner: '',
    fx: null,
    fxSeq: 0,
    hearts: null,
    meter: null,
    extras: {
      showUndo: false,
      showHint: false,
      showCharge: false,
      showGrid: cellCount > 0,
      showRing: false,
      showHearts: false,
      showMeter: false,
      showProgress: true,
      // 局内评级徽章：只有「档位会一直往上爬」的玩法才值得显。按用时反推档位的玩法
      // （探禁）开局必是 S，摆出来就是骗人，那种玩法自己关掉。
      showGradeNow: true,
      showCombo: false,
      showSwipe: false,
      showPad: false,
      compact: false,
    },
  };
}

function noop() {}

function fillController(obj) {
  const base = {
    tap: noop,
    longpress: noop,
    swipe: noop,
    move: noop,
    setAspect: noop,
    undo: noop,
    hint: noop,
    press: noop,
    release: noop,
    abandon: noop,
    destroy: noop,
  };
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) base[keys[i]] = obj[keys[i]];
  return base;
}

module.exports = {
  randInt: randInt,
  shuffle: shuffle,
  clearCells: clearCells,
  gradeBy: gradeBy,
  mmss: mmss,
  pct: pct,
  flash: flash,
  goalFor: goalFor,
  paceGoal: paceGoal,
  TimerBag: TimerBag,
  makeVm: makeVm,
  fillController: fillController,
};
