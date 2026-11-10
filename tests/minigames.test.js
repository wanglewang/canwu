'use strict';

// 小游戏层常驻断言：用假时钟把每一局真的跑完，验证 10 套玩法各自独立、机制互不复用、HUD 齐全。
// 零依赖，直接 node tests/minigames.test.js 即可跑。
const assert = require('assert');
const index = require('../minigames/index.js');
const themes = require('../minigames/theme.js');
const data = require('../data/practice.js');
const skills = require('../data/skills.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log('OK  ' + name);
}

// ---------------------------------------------------------------- 假时钟
const REAL = {
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  setInterval: global.setInterval,
  clearInterval: global.clearInterval,
};
let nowMs = 0;
let nextId = 1;
let jobs = new Map();

function installClock() {
  jobs = new Map();
  nowMs = 0;
  nextId = 1;
  global.setTimeout = function (fn, ms) {
    const id = nextId++;
    jobs.set(id, { fn: fn, at: nowMs + (ms || 0), every: false, dead: false });
    return id;
  };
  global.setInterval = function (fn, ms) {
    const id = nextId++;
    jobs.set(id, { fn: fn, at: nowMs + (ms || 0), every: true, step: ms || 1, dead: false });
    return id;
  };
  global.clearTimeout = function (id) { const j = jobs.get(id); if (j) j.dead = true; };
  global.clearInterval = global.clearTimeout;
}

function restoreClock() {
  global.setTimeout = REAL.setTimeout;
  global.clearTimeout = REAL.clearTimeout;
  global.setInterval = REAL.setInterval;
  global.clearInterval = REAL.clearInterval;
}

function advance(ms) {
  const end = nowMs + ms;
  let guard = 0;
  while (guard < 200000) {
    guard += 1;
    let pick = null;
    for (const j of jobs.values()) {
      if (j.dead || j.at > end) continue;
      if (pick === null || j.at < pick.at) pick = j;
    }
    if (pick === null) break;
    nowMs = pick.at;
    if (pick.every) pick.at = nowMs + pick.step;
    else pick.dead = true;
    pick.fn();
  }
  nowMs = end;
}

// ---------------------------------------------------------------- 驱动
function makeCtx(method) {
  const st = { vm: null, finished: null, flash: [], roundKey: '', plan: null, planAt: 0, at: 0, pressed: false, seen: {} };
  const c = index.createGame(method.game, {
    params: method.params,
    difficulty: 'normal',
    perks: {},
    tip: method.tip,
    twist: method.twist,
    theme: themes.themeOf(method.id, method.game),
    render: function (vm) {
      st.vm = vm;
      if (vm.phase === 'flashing' && vm.meter && vm.meter.value === 1 && st.roundKey !== vm.timeText) {
        st.flash = [];
        st.roundKey = vm.timeText;
      }
      if (vm.phase === 'flashing') {
        for (let i = 0; i < vm.cells.length; i += 1) {
          if (vm.cells[i].cls.indexOf('cell--lit') >= 0 && st.flash[st.flash.length - 1] !== i) st.flash.push(i);
        }
      }
      // 符纹配对：记住翻开过的符纹与位置，供驱动策略使用。
      for (let i = 0; i < vm.cells.length; i += 1) {
        if (vm.cells[i].cls.indexOf('cell--flipped') >= 0) st.seen[vm.cells[i].label] = i;
      }
    },
    finish: function (r) { st.finished = r; },
  });
  return { st: st, c: c };
}

function toggle(board, size, i) {
  const r = Math.floor(i / size);
  const col = i % size;
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let k = 0; k < dirs.length; k += 1) {
    const nr = r + dirs[k][0];
    const nc = col + dirs[k][1];
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      const j = nr * size + nc;
      board[j] = !board[j];
    }
  }
}

function solve(board, size) {
  for (let mask = 0; mask < (1 << size); mask += 1) {
    const b = board.slice();
    const clicks = [];
    for (let c = 0; c < size; c += 1) {
      if (mask & (1 << c)) { clicks.push(c); toggle(b, size, c); }
    }
    for (let r = 1; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!b[(r - 1) * size + c]) { const k = r * size + c; clicks.push(k); toggle(b, size, k); }
      }
    }
    let all = true;
    for (let i = 0; i < b.length; i += 1) if (!b[i]) { all = false; break; }
    if (all) return clicks;
  }
  return [];
}

function actionFor(game) {
  if (game === 'click') {
    return function (vm, c) {
      for (let i = 0; i < vm.cells.length; i += 1) {
        if (vm.cells[i].cls.indexOf('cell--lit') >= 0) { c.tap(i); return; }
      }
    };
  }
  if (game === 'hunt') {
    return function (vm, c) {
      for (let i = 0; i < vm.cells.length; i += 1) {
        if (vm.cells[i].cls.indexOf('cell--gold') >= 0) { c.tap(i); return; }
      }
    };
  }
  if (game === 'memory') {
    return function (vm, c, st) {
      if (vm.phase === 'input' && vm.meter && vm.meter.value < st.flash.length) c.tap(st.flash[vm.meter.value]);
    };
  }
  if (game === 'bridge') {
    return function (vm, c) {
      if (!vm.lane) return;
      const from = vm.lane.activeRow * vm.lane.cols;
      for (let i = from; i < from + vm.lane.cols; i += 1) {
        if (vm.cells[i].tone === vm.lane.target) { c.tap(i); return; }
      }
    };
  }
  if (game === 'lights') {
    return function (vm, c, st) {
      if (st.plan === null) {
        const board = vm.cells.map(function (x) { return x.cls.indexOf('cell--lit') >= 0; });
        st.plan = solve(board, vm.cols);
      }
      if (st.planAt < st.plan.length) { c.tap(st.plan[st.planAt]); st.planAt += 1; }
    };
  }
  if (game === 'wuxing') {
    return function (vm, c) {
      if (vm.orbit) c.tap((vm.orbit.current + 1) % 5);
    };
  }
  if (game === 'mines') {
    return function (vm, c, st) {
      if (st.at < vm.cells.length) { c.tap(st.at); st.at += 1; }
    };
  }
  if (game === 'seal') {
    return function (vm, c, st) {
      if (vm.pair && vm.pair.locked) return;
      const cells = vm.cells;
      const known = st.seen;
      if (vm.pair && vm.pair.first >= 0) {
        const sym = cells[vm.pair.first].label;
        const mate = known[sym];
        if (mate !== undefined && mate !== vm.pair.first && cells[mate].cls.indexOf('cell--card') >= 0) {
          c.tap(mate);
          return;
        }
      }
      for (const sym of Object.keys(known)) {
        const i = known[sym];
        if (cells[i].cls.indexOf('cell--card') >= 0) { c.tap(i); return; }
      }
      for (let i = 0; i < cells.length; i += 1) {
        if (cells[i].cls.indexOf('cell--card') >= 0) { c.tap(i); return; }
      }
    };
  }
  if (game === 'sword') {
    return function (vm, c) {
      if (!vm.scroll) return;
      const move = vm.scroll.moves[vm.scroll.cursor];
      if (!move) return;
      for (const k of vm.scroll.keys) {
        if (k.glyph === move.glyph) { c.tap(k.index); return; }
      }
    };
  }
  if (game === 'tempo') {
    return function (vm, c) {
      if (vm.ring && Math.abs(vm.ring.scale - vm.ring.judge) <= vm.ring.window) c.tap(0);
    };
  }
  return function (vm, c, st) {
    if (!st.pressed) { c.press(); st.pressed = true; return; }
    const v = vm.charge.value;
    if (v >= vm.charge.start && v <= vm.charge.end) c.release();
  };
}

function drive(ctx, game, totalMs, stepMs) {
  const action = actionFor(game);
  let t = 0;
  while (t < totalMs && !ctx.st.finished) {
    advance(stepMs);
    t += stepMs;
    if (ctx.st.vm) action(ctx.st.vm, ctx.c, ctx.st);
  }
}

const LIMITS = {
  click: [20000, 60],
  hunt: [22000, 60],
  memory: [140000, 60],
  bridge: [50000, 60],
  tempo: [80000, 40],
  sword: [25000, 60],
  lights: [20000, 80],
  wuxing: [26000, 60],
  mines: [20000, 80],
  seal: [75000, 60],
  charge: [20000, 55],
};

// ---------------------------------------------------------------- 断言：十门十套
check('10 套常规玩法 + 突破专用玩法全部注册', function () {
  assert.deepStrictEqual(Object.keys(index.MODULES).sort(), [
    'bridge', 'charge', 'click', 'hunt', 'lights', 'memory', 'mines', 'seal', 'sword', 'tempo', 'wuxing',
  ]);
  assert.strictEqual(index.PRACTICE_GAMES.length, 10);
});

check('10 门功法对应 10 套互不重复的玩法', function () {
  const games = data.PRACTICE_METHODS.map(function (m) { return m.game; });
  assert.strictEqual(games.length, 10);
  assert.strictEqual(new Set(games).size, 10, '仍有功法共用同一套玩法内核');
  for (const g of games) assert.ok(index.MODULES[g], g + ' 未注册');
});

check('同类功法（剑法/阵法/心法）也各用各的玩法', function () {
  const byType = {};
  for (const s of skills.SKILLS) {
    const m = data.getMethod(s.method);
    if (!byType[s.type]) byType[s.type] = [];
    byType[s.type].push(m.game);
  }
  for (const type of Object.keys(byType)) {
    assert.strictEqual(new Set(byType[type]).size, byType[type].length, type + ' 里有两门功法共用玩法');
  }
  assert.strictEqual(new Set(byType['剑法']).size, 2);
  assert.strictEqual(new Set(byType['阵法']).size, 2);
});

check('玩法中文名与模块导出一致，功法表与注册表不漂移', function () {
  for (const m of data.PRACTICE_METHODS) {
    assert.strictEqual(m.gameName, index.MODULES[m.game].name, m.id + ' 玩法名不一致');
    assert.strictEqual(index.gameName(m.game), m.gameName);
  }
  assert.strictEqual(index.gameName('charge'), '蓄力停区');
});

check('10 套玩法覆盖 5 种以上不同舞台形态', function () {
  const stages = {};
  for (const m of data.PRACTICE_METHODS) {
    const ctx = makeCtx(m);
    stages[ctx.st.vm.stage] = (stages[ctx.st.vm.stage] || 0) + 1;
    ctx.c.destroy();
  }
  assert.ok(Object.keys(stages).length >= 5, '舞台形态不足：' + JSON.stringify(stages));
  assert.strictEqual(stages.board, 6);
  assert.strictEqual(stages.lane, 1);
  assert.strictEqual(stages.ring, 1);
  assert.strictEqual(stages.orbit, 1);
  assert.strictEqual(stages.scroll, 1);
});

check('每门功法的独有机制互不重复', function () {
  const twists = new Set(data.PRACTICE_METHODS.map(function (m) { return m.twist; }));
  assert.strictEqual(twists.size, 10);
});

check('10 门功法各有完整主题字段', function () {
  const keys = ['accent', 'soft', 'ink', 'bg', 'frame', 'glyph', 'motif', 'hit', 'miss', 'banner', 'praise'];
  for (const m of data.PRACTICE_METHODS) {
    const t = themes.themeOf(m.id, m.game);
    assert.strictEqual(t.key, m.theme);
    for (const k of keys) assert.ok(t[k], m.id + ' 缺少主题字段 ' + k);
  }
});

check('所有本门玩法都有名称与说明', function () {
  for (const m of data.PRACTICE_METHODS) {
    const t = themes.twistOf(m.twist);
    assert.ok(t.name && t.desc && t.name !== '常规功课', m.twist + ' 缺少说明');
    assert.ok(t.desc.length >= 20, m.twist + ' 规则说明过短');
  }
});

// ---------------------------------------------------------------- 断言：各自独有机制
check('辨伪夺宝：4×3 盘面同时出现真宝与影子', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('snatch'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.cells.length, 12);
    assert.strictEqual(ctx.st.vm.cols, 4);
    assert.ok(ctx.st.vm.cells.some(function (x) { return x.cls.indexOf('cell--gold') >= 0; }));
    assert.ok(ctx.st.vm.cells.filter(function (x) { return x.cls.indexOf('cell--decoy') >= 0; }).length >= 2);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('循纹渡河：竖向河道逐层推进，只有当前层可点', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('stones'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.stage, 'lane');
    assert.strictEqual(ctx.st.vm.lane.rows, 5);
    assert.ok(ctx.st.vm.cells.some(function (x) { return x.cls.indexOf('cell--fog') >= 0; }), '未到的层没有水雾');
    const row = ctx.st.vm.lane.activeRow * ctx.st.vm.lane.cols;
    const before = ctx.st.vm.lane.activeRow;
    ctx.c.tap(row - 1 < 0 ? row + ctx.st.vm.lane.cols : row - 1);
    assert.strictEqual(ctx.st.vm.lane.activeRow, before, '非当前层不该能点');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('剑招连段：卷轴 + 四个招式键，打错退这一招', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('combo'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.stage, 'scroll');
    assert.strictEqual(ctx.st.vm.scroll.keys.length, 4);
    assert.strictEqual(ctx.st.vm.scroll.total, 4);
    assert.strictEqual(ctx.st.vm.scroll.moves[0].state, 'active');
    const need = ctx.st.vm.scroll.moves[0].glyph;
    const wrong = ctx.st.vm.scroll.keys.find(function (k) { return k.glyph !== need; });
    const before = ctx.st.vm.scroll.cursor;
    ctx.c.tap(wrong.index);
    assert.strictEqual(ctx.st.vm.scroll.cursor, before, '打错不该推进招式');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('五行相生：五盏灯环 + 中央当前一行', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('wuxing'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.stage, 'orbit');
    assert.strictEqual(ctx.st.vm.orbit.lamps.length, 5);
    assert.ok(['木', '火', '土', '金', '水'].indexOf(ctx.st.vm.orbit.currentText) >= 0);
    const first = ctx.st.vm.orbit.current;
    ctx.c.tap((first + 1) % 5);
    assert.strictEqual(ctx.st.vm.orbit.chain, 1, '相生之位没接上');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('符纹配对：十二张牌扣着，符箓能照出一对', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('seal'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.cells.length, 12);
    assert.strictEqual(ctx.st.vm.cols, 4);
    assert.strictEqual(ctx.st.vm.extras.showHint, true);
    assert.ok(ctx.st.vm.cells.every(function (x) { return x.cls.indexOf('cell--card') >= 0; }));
    ctx.c.hint();
    assert.ok(ctx.st.vm.cells.filter(function (x) { return x.cls.indexOf('cell--hint') >= 0; }).length === 2);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('记忆序列闪烁时不再把序号写在格子上', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'));
    ctx.c.start();
    let sawLit = false;
    for (let i = 0; i < 40 && !sawLit; i += 1) {
      advance(60);
      const vm = ctx.st.vm;
      if (vm.phase === 'flashing') {
        for (const cell of vm.cells) {
          if (cell.cls.indexOf('cell--lit') >= 0) {
            sawLit = true;
            assert.ok(!/^\d+$/.test(cell.label), '闪烁格仍显示数字序号');
          }
        }
      }
    }
    assert.ok(sawLit, '未观察到闪烁');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('记忆序列第一轮内不出现重复格子', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'));
    ctx.c.start();
    let t = 0;
    while (t < 12000 && ctx.st.vm.phase !== 'input') { advance(60); t += 60; }
    assert.strictEqual(ctx.st.vm.phase, 'input', '未进入复述阶段');
    assert.ok(ctx.st.flash.length >= 2, '未收集到完整一轮');
    assert.strictEqual(new Set(ctx.st.flash).size, ctx.st.flash.length);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('触雷不再一击出局，只扣一盏心神并显形', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('tanlei'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.extras.showHint, false, '探禁不该有符箓照纹');
    let guard = 0;
    while (ctx.st.vm.hearts.value === 3 && guard < 40 && !ctx.st.finished) {
      ctx.c.tap(guard);
      advance(60);
      guard += 1;
    }
    assert.strictEqual(ctx.st.vm.hearts.value, 2);
    assert.strictEqual(ctx.st.finished, null);
    assert.ok(ctx.st.vm.cells.some(function (c) { return c.cls.indexOf('cell--mine') >= 0; }), '禁制未显形');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

// ---------------------------------------------------------------- 断言：每套玩法整局可跑完
for (const method of data.PRACTICE_METHODS) {
  check('整局可跑完：' + method.id + ' · ' + method.gameName, function () {
    installClock();
    try {
      const ctx = makeCtx(method);
      const limit = LIMITS[method.game];
      ctx.c.start();
      drive(ctx, method.game, limit[0], limit[1]);
      assert.ok(ctx.st.finished, method.id + ' 未能自行结算');
      assert.ok(['S', 'A', 'B', 'C', 'F'].indexOf(ctx.st.finished.grade) >= 0, '评级非法');
      assert.strictEqual(typeof ctx.st.finished.summary, 'string');
      const vm = ctx.st.vm;
      assert.strictEqual(typeof vm.progress, 'number');
      assert.strictEqual(typeof vm.gradeNow, 'string');
      assert.strictEqual(typeof vm.goal, 'string');
      assert.ok(vm.extras && typeof vm.extras === 'object');
      assert.ok(['board', 'lane', 'ring', 'orbit', 'scroll'].indexOf(vm.stage) >= 0, '舞台形态非法');
      ctx.c.destroy();
    } finally { restoreClock(); }
  });
}

check('突破瓶颈的蓄力停区也能跑完', function () {
  installClock();
  try {
    const ctx = makeCtx({ game: 'charge', params: {}, twist: '', tip: '', id: 'breakthrough' });
    ctx.c.start();
    drive(ctx, 'charge', LIMITS.charge[0], LIMITS.charge[1]);
    assert.ok(ctx.st.finished, '蓄力停区未能结算');
    assert.ok(['S', 'A', 'B', 'C', 'F'].indexOf(ctx.st.finished.grade) >= 0);
    assert.strictEqual(ctx.st.vm.stage, 'charge');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

console.log('\n小游戏层断言全部通过（' + passed + ' 项）');
