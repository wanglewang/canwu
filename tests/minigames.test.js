'use strict';

// 小游戏层常驻断言：用假时钟把每一局真的跑完，验证 10 套玩法各自独立、机制互不复用、HUD 齐全。
// 零依赖，直接 node tests/minigames.test.js 即可跑。
const assert = require('assert');
const index = require('../minigames/index.js');
const themes = require('../minigames/theme.js');
const data = require('../data/practice.js');
const skills = require('../data/skills.js');
const guides = require('../data/guides.js');

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
function makeCtx(method, perks, params) {
  const st = { vm: null, finished: null, flash: [], roundKey: '', plan: null, planAt: 0, at: 0, pressed: false, seen: {}, sawReverse: false };
  const c = index.createGame(method.game, {
    params: params || method.params,
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

// 阵灯：在「点得动的格子」里穷举，求这一盘最少几步（死门格不能点，但会被邻格翻转）。
function minStepsOf(vm) {
  const n = vm.cells.length;
  const board = [];
  const allowed = [];
  for (let i = 0; i < n; i += 1) {
    const cls = vm.cells[i].cls;
    board.push(cls.indexOf('lit') >= 0);
    if (cls.indexOf('cell--dead') < 0) allowed.push(i);
  }
  let best = 99;
  const total = 1 << allowed.length;
  for (let mask = 0; mask < total; mask += 1) {
    let k = 0;
    for (let i = 0; i < allowed.length; i += 1) if (mask & (1 << i)) k += 1;
    if (k >= best) continue;
    const b = board.slice();
    for (let i = 0; i < allowed.length; i += 1) if (mask & (1 << i)) toggle(b, vm.cols, allowed[i]);
    let all = true;
    for (let i = 0; i < n; i += 1) if (!b[i]) { all = false; break; }
    if (all) best = k;
  }
  return best;
}

function actionFor(game) {
  if (game === 'click') {
    return function (vm, c) {
      // 这一门现在是「划」：沿 vm.trail 给出的剑路把整条轨迹送进去，点格子已经不判了。
      if (vm.trail && vm.trail.path) c.swipe(vm.trail.path.slice());
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

check('顺光划斩：剑路亮完才起寿命线，没划到就算漏', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    const trail = ctx.st.vm.trail;
    assert.ok(trail && trail.path.length >= 2, '开局没有连成剑路');
    assert.strictEqual(ctx.st.vm.cells.filter(function (c) { return c.cls.indexOf('cell--path') >= 0; }).length,
      trail.path.length, '亮起的桩数与剑路长度不符');
    const last = trail.path[trail.path.length - 1];
    assert.strictEqual(ctx.st.vm.cells[last].life, 0, '光还没走到收势桩就开始倒计时了');
    advance(126);                       // 光走到收势桩
    assert.ok(ctx.st.vm.cells[last].life > 0, '收势桩没有寿命线，玩家看不出还剩多久');
    const before = ctx.st.vm.scoreText;
    advance(720);                       // 站着不动，等它自己灭
    assert.strictEqual(ctx.st.vm.scoreText, before, '漏剑不该加分');
    assert.strictEqual(ctx.st.vm.comboText, '', '漏剑之后剑势该断');
    assert.ok(ctx.st.vm.status.indexOf('慢') >= 0, '漏剑没有给出提示');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光划斩：划偏罚一息，与剑诀·断岳同规矩', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    const path = ctx.st.vm.trail.path.slice();
    const others = [];
    for (let i = 0; i < ctx.st.vm.cells.length; i += 1) if (path.indexOf(i) < 0) others.push(i);
    ctx.c.swipe(others.slice(0, 3));
    assert.strictEqual(ctx.st.vm.progressText, '14 息', '划偏没有扣掉一息');
    assert.ok(/劈空/.test(ctx.st.vm.fx.text), '划偏没有失手反馈');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光划斩：连击 5 记起算剑势，第 5 道换成金锋长招', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    let normalLen = 0;
    for (let n = 0; n < 4; n += 1) {
      const t = ctx.st.vm.trail;
      assert.ok(t && !t.gold, '第 ' + (n + 1) + ' 道剑路没有亮起');
      normalLen = t.path.length;
      ctx.c.swipe(t.path.slice());
      advance(160);
    }
    assert.strictEqual(ctx.st.vm.scoreText, '得分 64', '四道两桩剑路的分数不对');
    assert.ok(ctx.st.vm.meter && ctx.st.vm.meter.label.indexOf('剑势') >= 0, '没有剑势条');

    const gold = ctx.st.vm.trail;
    assert.ok(gold && gold.gold, '第 5 道没有换成金锋');
    assert.ok(gold.path.length > normalLen, '金锋没有比寻常剑路更长');
    assert.ok(ctx.st.vm.cells.some(function (x) { return x.cls.indexOf('cell--pathgold') >= 0; }), '盘面没有金色剑路');
    ctx.c.swipe(gold.path.slice());
    // 第 5 记剑势 ×1.5，金锋三桩 20 分 × 金锋 ×2 × 剑势 ×1.5 = 60
    assert.strictEqual(ctx.st.vm.scoreText, '得分 124');
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

check('记序复现：长按抢记跳过剩余闪烁，倍率看少看几个字', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'));
    ctx.c.start();
    let t = 0;
    while (t < 14000 && ctx.st.vm.phase !== 'flashing') { advance(60); t += 60; }

    // 一个字都还没闪：长按不算抢记，只是手按住了屏幕，不该把人送进复述。
    ctx.c.longpress(0);
    assert.strictEqual(ctx.st.vm.phase, 'flashing', '还没起头就长按，居然跳进了复述');
    assert.ok(ctx.st.vm.fx.text.indexOf('还没起头') >= 0, '未起头长按没有提示');

    // 等闪出两个字再抢（起手 520 + 一轮闪烁 ≈ 1340），这时倍率应当是这一档的较高值。
    advance(1600);
    ctx.c.longpress(0);
    assert.strictEqual(ctx.st.vm.phase, 'input', '抢记之后没有直接进入复述');
    assert.ok(ctx.st.vm.banner.indexOf('抢记 ×') >= 0, '抢记没有给出倍率：' + ctx.st.vm.banner);
    assert.ok(ctx.st.vm.banner.indexOf('已闪') >= 0, '抢记没有显示已闪几个字：' + ctx.st.vm.banner);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('记序复现：连对给分加成，全程无失误远超基线', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'));
    ctx.c.start();
    drive(ctx, 'memory', 60000, 60);
    assert.ok(ctx.st.finished, '一整局没跑完');
    // 无加成的基线是 10 × (2+3+4+5+6+7+8) = 350；连对加成满格应当到 460 上下。
    assert.ok(ctx.st.finished.score > 420,
      '连对加成没生效，满分只有 ' + ctx.st.finished.score);
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

check('阵灯推演：难度档只改「这盘最少几步」，盘子始终 3×3', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    const got = [];
    for (let i = 0; i < data.DIFFICULTIES.length; i += 1) {
      const p = data.buildParams(m, data.DIFFICULTIES[i].key);
      const ctx = makeCtx(m, {}, p);
      ctx.c.start();
      assert.strictEqual(ctx.st.vm.cells.length, 9, '盘面尺寸被难度改变了');
      const best = minStepsOf(ctx.st.vm);
      assert.strictEqual(best, p.steps,
        data.DIFFICULTIES[i].name + ' 这盘最少 ' + best + ' 步，参数写的是 ' + p.steps);
      got.push(best);
      ctx.c.destroy();
    }
    assert.deepStrictEqual(got, [2, 3, 4, 5, 6], '五档的最少步数没有逐档递增：' + got.join('/'));
  } finally { restoreClock(); }
});

check('阵灯推演：连续几盘都解得开，且解完立刻换盘', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    const params = data.buildParams(m, 'desperate');
    const ctx = makeCtx(m, {}, params);
    ctx.c.start();
    let solved = 0;
    for (let round = 0; round < 3; round += 1) {
      const vm = ctx.st.vm;
      let best = null;
      const board = [];
      const allowed = [];
      for (let i = 0; i < vm.cells.length; i += 1) {
        board.push(vm.cells[i].cls.indexOf('lit') >= 0);
        allowed.push(i);
      }
      const total = 1 << allowed.length;
      for (let mask = 0; mask < total && best === null; mask += 1) {
        const b = board.slice();
        let k = 0;
        for (let i = 0; i < allowed.length; i += 1) if (mask & (1 << i)) { k += 1; toggle(b, vm.cols, allowed[i]); }
        let all = true;
        for (let i = 0; i < b.length; i += 1) if (!b[i]) { all = false; break; }
        if (all) { best = { mask: mask, k: k }; }
      }
      assert.ok(best !== null, '第 ' + (round + 1) + ' 盘无解');
      for (let i = 0; i < allowed.length; i += 1) {
        if (best.mask & (1 << i)) ctx.c.tap(allowed[i]);
      }
      solved += 1;
      assert.ok(ctx.st.vm.scoreText.indexOf('已解 ' + solved) >= 0, '解开一盘没有计数');
      advance(300);
    }
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：阵眼感应花三秒', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('arrayEye'));
    ctx.c.start();
    advance(500);
    const before = ctx.st.vm.timeText;
    ctx.c.hint();
    advance(200);
    assert.ok(ctx.st.vm.status.indexOf('三秒') >= 0, '提示没有说明代价：' + ctx.st.vm.status);
    assert.notStrictEqual(ctx.st.vm.timeText, before, '提示没有扣时间');
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

check('11 套玩法都有「怎么玩」说明，盘面符号讲得清', function () {
  for (const id of Object.keys(index.MODULES)) {
    const g = guides.guideOf(id);
    assert.ok(g, id + ' 缺玩法说明');
    assert.ok(g.goal && g.inline && g.scoring && g.tip, id + ' 说明字段不全');
    assert.ok(g.steps.length >= 2, id + ' 没有操作步骤');
    assert.ok(g.terms.length >= 2, id + ' 没有盘面术语表');
    assert.ok(g.inline.length <= 48, id + ' 局内速记太长：' + g.inline.length);
    for (const t of g.terms) {
      assert.ok(t.name && t.desc, id + ' 的术语缺名字或解释：' + JSON.stringify(t));
    }
  }
  const click = guides.guideOf('click');
  assert.ok(click.terms.some(function (t) { return /剑路/.test(t.name); }), '基础剑法没解释「剑路」');
  assert.ok(click.terms.some(function (t) { return /金锋/.test(t.name); }), '基础剑法没解释「金锋」');
  assert.ok(/划/.test(click.inline), '局内速记没说这一门是划的');
  assert.ok(/金锋/.test(click.inline), '局内速记没写金锋');
});

// ---------------------------------------------------------------- 顺光划斩专项
check('顺光划斩：轻点不判，得划过整条剑路，反着划也算', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 12, life: 700 }));
    ctx.c.start();
    const path = ctx.st.vm.trail.path.slice();
    assert.ok(path.length >= 2, '剑路至少两桩');
    assert.ok(ctx.st.vm.extras.showSwipe, '没有打开划剑输入');
    ctx.c.tap(path[0]);
    assert.ok(ctx.st.vm.trail, '轻点一下不该把剑路判掉');
    ctx.c.swipe([path[0]]);
    assert.ok(ctx.st.vm.trail, '只划一桩也不该算一剑');
    ctx.c.swipe(path.slice().reverse());
    assert.ok(!ctx.st.vm.trail, '反着划竟然没斩中');
    assert.ok(Number((ctx.st.vm.scoreText.match(/\d+/) || [0])[0]) > 0, '斩中没有得分');
    advance(20);
    assert.ok(ctx.st.vm.slash && typeof ctx.st.vm.slash.angle === 'number', '斩中没有扫过盘面的白光');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光划斩：划偏罚一息、断剑势，金锋漏了不断势', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 12, life: 700 }));
    ctx.c.start();
    const path = ctx.st.vm.trail.path.slice();
    const others = [];
    for (let i = 0; i < 9; i += 1) if (path.indexOf(i) < 0) others.push(i);
    const before = ctx.st.vm.timeText;
    ctx.c.swipe(others.slice(0, 3));
    assert.notStrictEqual(ctx.st.vm.timeText, before, '划偏没有罚一息');
    assert.ok(/劈空/.test(ctx.st.vm.fx.text), '划偏没有给出失手反馈');
    assert.strictEqual(ctx.st.vm.combo, 0, '划偏没有断剑势');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光划斩：档位越高剑路越长，金锋是更长的金桩长招', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const maxLens = [];
    let sawGold = false;
    for (let d = 0; d <= 4; d += 1) {
      const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: d, duration: 30, life: 700 }));
      ctx.c.start();
      let longest = 0;
      for (let k = 0; k < 30; k += 1) {
        if (ctx.st.vm.trail) {
          const t = ctx.st.vm.trail;
          longest = Math.max(longest, t.path.length);
          if (t.gold) sawGold = true;
          ctx.c.swipe(t.path.slice());
        }
        advance(200);
      }
      maxLens.push(longest);
      ctx.c.destroy();
    }
    assert.ok(sawGold, '整局都没出现金锋');
    assert.ok(maxLens[0] <= 3, '简单档不该出现 4 桩长招：' + maxLens[0]);
    assert.ok(maxLens[4] >= 4, '绝境档应该有 4 桩长招：' + maxLens[4]);
    assert.ok(maxLens[0] < maxLens[4], '五档剑路长度没有拉开');
    for (let i = 1; i < maxLens.length; i += 1) {
      assert.ok(maxLens[i] >= maxLens[i - 1], '剑路长度随档位倒退了：' + maxLens.join(','));
    }
  } finally { restoreClock(); }
});

console.log('\n小游戏层断言全部通过（' + passed + ' 项）');
