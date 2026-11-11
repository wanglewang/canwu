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
function makeCtx(method, perks) {
  const st = { vm: null, finished: null, flash: [], roundKey: '', plan: null, planAt: 0, at: 0, pressed: false, seen: {}, sawReverse: false };
  const c = index.createGame(method.game, {
    params: method.params,
    difficulty: 'normal',
    perks: perks || {},
    tip: method.tip,
    twist: method.twist,
    theme: themes.themeOf(method.id, method.game),
    render: function (vm) {
      st.vm = vm;
      if (vm.phase === 'flashing' && vm.meter && vm.meter.value === 1 && st.roundKey !== vm.timeText) {
        st.flash = [];
        st.roundKey = vm.timeText;
      }
      if (vm.timeText && vm.timeText.indexOf('逆诵') >= 0) st.sawReverse = true;
      if (vm.phase === 'flashing') {
        for (let i = 0; i < vm.cells.length; i += 1) {
          if (vm.cells[i].cls.indexOf('cell--lit') >= 0 && st.flash[st.flash.length - 1] !== i) st.flash.push(i);
        }
      }
      // 成对翻牌：记住翻开过的卦象与位置，供驱动策略使用。
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
    return function (vm, c) {
      // 限时连解：盘面会换，每一步都按当前盘重算最优解。
      const board = vm.cells.map(function (x) { return x.cls.indexOf('cell--dead') >= 0 ? true : x.cls.indexOf('cell--lit') >= 0; });
      const plan = solve(board, vm.cols);
      const dead = [];
      for (let i = 0; i < vm.cells.length; i += 1) {
        if (vm.cells[i].cls.indexOf('cell--dead') >= 0) dead.push(i);
      }
      for (let i = 0; i < plan.length; i += 1) {
        if (dead.indexOf(plan[i]) < 0) { c.tap(plan[i]); return; }
      }
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
  lights: [46000, 80],
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

// 命名分四层：功法名（典籍）/ 参悟方式（这门功课在做什么）/ 玩法名（盘面动作）/ 主题名（2 字意象）。
// 前三层任意两层撞词，准备页就会出现「步法连环 · 步法连环」这种叠字，故固化为断言。
check('参悟方式、玩法名、本门玄机三层互不撞词', function () {
  const methodNames = data.PRACTICE_METHODS.map(function (m) { return m.name; });
  const labels = Object.keys(data.GAME_LABELS).map(function (k) { return data.GAME_LABELS[k]; });
  const twistNames = data.PRACTICE_METHODS.map(function (m) { return themes.twistOf(m.twist).name; });
  const groups = [
    { name: '参悟方式', list: methodNames },
    { name: '玩法名', list: labels },
    { name: '本门玄机', list: twistNames },
  ];
  for (const g of groups) {
    assert.strictEqual(new Set(g.list).size, g.list.length, g.name + ' 内部有重名');
  }
  for (const n of methodNames) {
    assert.ok(labels.indexOf(n) < 0, '参悟方式与玩法名撞词：' + n);
    assert.ok(twistNames.indexOf(n) < 0, '参悟方式与本门玄机撞词：' + n);
  }
  for (const n of twistNames) {
    assert.ok(labels.indexOf(n) < 0, '本门玄机与玩法名撞词：' + n);
  }
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
check('辨伪择真：4×3 盘面同时出现真招与虚影', function () {
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

check('循光劈刺：剑光带寿命，线的尽头没劈到就算漏', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    const lit = ctx.st.vm.cells.filter(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
    assert.strictEqual(lit.length, 1, '同一时刻只该有一道剑光');
    assert.ok(lit[0].life > 0, '剑光没有寿命，玩家看不出还剩多久');
    const before = ctx.st.vm.scoreText;
    advance(900);                       // 站着一动不动，等它自己灭
    assert.strictEqual(ctx.st.vm.scoreText, before, '漏剑不该加分');
    assert.strictEqual(ctx.st.vm.comboText, '', '漏剑之后剑势该断');
    assert.ok(ctx.st.vm.status.indexOf('慢') >= 0, '漏剑没有给出提示');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('循光劈刺：劈空罚一息，与剑诀·断岳同规矩', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    let wrong = -1;
    for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
      if (ctx.st.vm.cells[i].cls.indexOf('cell--lit') < 0) { wrong = i; break; }
    }
    assert.ok(wrong >= 0);
    ctx.c.tap(wrong);
    assert.strictEqual(ctx.st.vm.progressText, '14 息', '劈空没有扣掉一息');
    assert.ok(ctx.st.vm.status.indexOf('空') >= 0);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('循光劈刺：连击 5 记起算剑势，第 5 道剑光换成金锋', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    function pick(cls) {
      for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
        if (ctx.st.vm.cells[i].cls.indexOf(cls) >= 0) return i;
      }
      return -1;
    }
    for (let n = 0; n < 4; n += 1) {
      const i = pick('cell--lit');
      assert.ok(i >= 0, '第 ' + (n + 1) + ' 道剑光没有亮起');
      ctx.c.tap(i);
      advance(120);
    }
    assert.strictEqual(ctx.st.vm.scoreText, '得分 40');
    assert.ok(ctx.st.vm.meter && ctx.st.vm.meter.label.indexOf('剑势') >= 0, '没有剑势条');

    // 第五道换成金锋：只有它亮着，寿命比寻常剑光短
    const edge = pick('cell--edge');
    assert.ok(edge >= 0, '第 5 道剑光没有换成金锋');
    assert.strictEqual(pick('cell--lit'), -1, '金锋该取代寻常剑光，而不是同时亮两格');
    assert.ok(ctx.st.vm.cells[edge].life > 0 && ctx.st.vm.cells[edge].life < 700, '金锋寿命没有缩短');

    ctx.c.tap(edge);
    // 连到第 5 记，剑势 ×1.5，金锋 20 分算 30 分
    assert.strictEqual(ctx.st.vm.scoreText, '得分 70');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('循纹递推：竖向河道逐层推进，只有当前层可点', function () {
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

check('成对翻牌：十二处气窍阖着，入定能照见一对', function () {
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

check('记序复现：复述有息数，息尽折一盏心神', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'));
    ctx.c.start();
    let t = 0;
    while (t < 14000 && ctx.st.vm.phase !== 'input') { advance(60); t += 60; }
    assert.strictEqual(ctx.st.vm.phase, 'input', '未进入复述阶段');
    assert.ok(ctx.st.vm.goal.indexOf('余') >= 0, '复述阶段没有显示剩余息数');
    const before = ctx.st.vm.hearts.value;
    for (let i = 0; i < 400 && ctx.st.vm.hearts.value === before && !ctx.st.finished; i += 1) advance(100);
    assert.ok(ctx.st.vm.hearts.value < before, '干等着不点，居然不折心神');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('记序复现：长按抢记跳过剩余闪烁', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'));
    ctx.c.start();
    let t = 0;
    while (t < 14000 && ctx.st.vm.phase !== 'flashing') { advance(60); t += 60; }
    ctx.c.longpress(0);
    assert.strictEqual(ctx.st.vm.phase, 'input', '抢记之后没有直接进入复述');
    assert.ok(ctx.st.vm.banner.indexOf('抢记') >= 0, '抢记没有给出倍率提示');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('记序复现：大成解锁逆诵', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'), { tier: 3 });
    ctx.c.start();
    drive(ctx, 'memory', 60000, 60);
    assert.ok(ctx.st.sawReverse, '大成之后没有出现逆诵轮');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：解亮一盘立刻起下一盘', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('arrayEye'));
    ctx.c.start();
    drive(ctx, 'lights', 16000, 60);
    const s = ctx.st.vm.scoreText;
    assert.ok(/已解 [1-9]/.test(s), '限时连解没有累计解阵数：' + s);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：大成开死门，点到整盘复位并罚时', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('arrayEye'), { tier: 3 });
    ctx.c.start();
    let deadAt = -1;
    for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
      if (ctx.st.vm.cells[i].cls.indexOf('cell--dead') >= 0) { deadAt = i; break; }
    }
    assert.ok(deadAt >= 0, '大成之后盘上没有死门');
    const before = ctx.st.vm.timeText;
    ctx.c.tap(deadAt);
    assert.ok(ctx.st.vm.status.indexOf('死门') >= 0 || ctx.st.vm.fx.text.indexOf('死门') >= 0, '点死门没有反馈');
    assert.notStrictEqual(ctx.st.vm.timeText, before);
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
