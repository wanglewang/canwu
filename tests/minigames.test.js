'use strict';

// 小游戏层常驻断言：用假时钟把每一局真的跑完，验证 10 套玩法各自独立、机制互不复用、HUD 齐全。
// 零依赖，直接 node tests/minigames.test.js 即可跑。
const assert = require('assert');
const index = require('../minigames/index.js');
const themes = require('../minigames/theme.js');
const data = require('../data/practice.js');
const skills = require('../data/skills.js');
const guides = require('../data/guides.js');
const weapons = require('../data/weapons.js');

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
      // 这一门现在是「划」：沿 vm.trail 给出的刀路把整条轨迹送进去，点格子已经不判了。
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

check('同类功法（刀法/剑法/阵法/心法）也各用各的玩法', function () {
  const byType = {};
  for (const s of skills.SKILLS) {
    const m = data.getMethod(s.method);
    if (!byType[s.type]) byType[s.type] = [];
    byType[s.type].push(m.game);
  }
  for (const type of Object.keys(byType)) {
    assert.strictEqual(new Set(byType[type]).size, byType[type].length, type + ' 里有两门功法共用玩法');
  }
  // 这一版先只做刀法，剑法暂留天阶的剑诀·断岳一门。
  assert.strictEqual(new Set(byType['刀法']).size, 1);
  assert.strictEqual(new Set(byType['剑法']).size, 1);
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

check('顺光扫斩：刀路亮完才起寿命线，没划到就算漏', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    const trail = ctx.st.vm.trail;
    assert.ok(trail && trail.path.length >= 2, '开局没有连成刀路');
    assert.strictEqual(ctx.st.vm.cells.filter(function (c) { return c.cls.indexOf('cell--path') >= 0; }).length,
      trail.path.length, '亮起的桩数与刀路长度不符');
    const last = trail.path[trail.path.length - 1];
    assert.strictEqual(ctx.st.vm.cells[last].life, 0, '光还没走到收势桩就开始倒计时了');
    advance(720);                       // 刀势起手沉，3 桩两步才走到收势桩（简单档 343ms/桩）
    assert.ok(ctx.st.vm.cells[last].life > 0, '收势桩没有寿命线，玩家看不出还剩多久');
    const before = ctx.st.vm.scoreText;
    advance(720);                       // 站着不动，等寿命线走完（别等到下一招出来，否则状态被覆盖）
    assert.strictEqual(ctx.st.vm.scoreText, before, '漏刀不该加分');
    assert.strictEqual(ctx.st.vm.comboText, '', '漏刀之后刀势该断');
    assert.ok(ctx.st.vm.status.indexOf('慢') >= 0, '漏刀没有给出提示');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光扫斩：划偏罚一息，与剑诀·断岳同规矩', function () {
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

check('顺光扫斩：连击 5 记起算刀势，第 5 道换成重斩长招', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('forge'));
    ctx.c.start();
    let normalLen = 0;
    for (let n = 0; n < 4; n += 1) {
      const t = ctx.st.vm.trail;
      assert.ok(t && !t.gold, '第 ' + (n + 1) + ' 道刀路没有亮起');
      normalLen = t.path.length;
      ctx.c.swipe(t.path.slice());
      advance(450);                     // 刀的后摇 418ms，要等过换气空档
    }
    assert.strictEqual(ctx.st.vm.scoreText, '得分 80', '四道三桩刀路的分数不对');
    assert.ok(ctx.st.vm.meter && ctx.st.vm.meter.label.indexOf('刀势') >= 0, '没有刀势条');

    const gold = ctx.st.vm.trail;
    assert.ok(gold && gold.gold, '第 5 道没有换成重斩');
    assert.ok(gold.path.length > normalLen, '重斩没有比寻常刀路更长');
    assert.ok(ctx.st.vm.cells.some(function (x) { return x.cls.indexOf('cell--pathgold') >= 0; }), '盘面没有金色刀路');
    ctx.c.swipe(gold.path.slice());
    // 第 5 记刀势 ×1.5，重斩四桩 24 分 × 重斩 ×2 × 刀势 ×1.5 = 72
    assert.strictEqual(ctx.st.vm.scoreText, '得分 152');
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

// ---------------------------------------------------------------- 照影符：经典扫雷深耕
// 只读 vm.cells 的推理器，与 mines.js「无猜」判定同用最基础的单格规则。
// 它看不到 mineSet，推得完就说明这一盘真的不用猜，而不是玩法层自己说了算。
function mineNeighbors(i, cols, rows) {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

function solveMines(ctx, cols) {
  const cells = ctx.st.vm.cells;
  const rows = cells.length / cols;
  const isOpen = function (j) { return cells[j].cls.indexOf('cell--open') >= 0; };
  const isMarked = function (j) {
    return cells[j].cls.indexOf('cell--flag') >= 0 || cells[j].cls.indexOf('cell--mine') >= 0;
  };
  const isHidden = function (j) { return cells[j].cls.indexOf('cell--hidden') >= 0; };
  for (let pass = 0; pass < 200 && !ctx.st.finished; pass += 1) {
    let acted = false;
    for (let i = 0; i < cells.length && !ctx.st.finished; i += 1) {
      if (!isOpen(i) || !cells[i].label) continue;
      const num = Number(cells[i].label);
      const list = mineNeighbors(i, cols, rows);
      const unknown = list.filter(isHidden);
      const marked = list.filter(isMarked).length;
      if (unknown.length === 0) continue;
      const rest = num - marked;
      if (rest === 0) { ctx.c.tap(unknown[0]); acted = true; break; }
      if (rest === unknown.length) {
        for (let k = 0; k < unknown.length; k += 1) ctx.c.longpress(unknown[k]);
        acted = true;
        break;
      }
    }
    if (!acted) return false;
  }
  return !!ctx.st.finished;
}

check('照影符：开局不先布雷，首点九宫格全开且盘面无汉字', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('tanlei'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.cells.length, 36);
    assert.strictEqual(ctx.st.vm.cells.filter(function (c) { return c.cls.indexOf('cell--hidden') >= 0; }).length,
      36, '玩家还没点，禁制就已经布好了');
    const mid = 14;
    const zone = [mid - 7, mid - 6, mid - 5, mid - 1, mid, mid + 1, mid + 5, mid + 6, mid + 7];
    ctx.c.tap(mid);
    for (let k = 0; k < zone.length; k += 1) {
      assert.ok(ctx.st.vm.cells[zone[k]].cls.indexOf('cell--open') >= 0,
        '首点九宫格第 ' + zone[k] + ' 格没展开，开局会被数字堵死');
    }
    for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
      assert.ok(/^$|^[0-8]$|^✕$|^⚑$/.test(ctx.st.vm.cells[i].label),
        '盘面混进汉字：' + ctx.st.vm.cells[i].label);
    }
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('照影符：无猜布局能纯靠数字零失误翻完全盘', function () {
  installClock();
  try {
    let guessed = 0;
    for (let round = 0; round < 8; round += 1) {
      const ctx = makeCtx(data.getMethod('tanlei'));
      ctx.c.start();
      ctx.c.tap(14);
      const ok = ctx.st.vm.extras.noGuess;
      assert.strictEqual(/不必猜/.test(ctx.st.vm.status), ok, 'status 与无猜标志不一致');
      if (ok) {
        assert.ok(solveMines(ctx, 6), '第 ' + (round + 1) + ' 盘标了「无猜」，纯推理却推不完');
        assert.ok(ctx.st.finished && /探明秘境/.test(ctx.st.finished.summary), '推理走完却没结算成功');
        assert.strictEqual(ctx.st.vm.hearts.value, 3, '零失误推理不该折心神');
      } else guessed += 1;
      ctx.c.destroy();
    }
    assert.ok(guessed <= 1, '8 盘里有 ' + guessed + ' 盘仍需猜，无猜布局的重试次数不够');
  } finally { restoreClock(); }
});

check('照影符：旗数对上点数字格可连开，旗插错照样踩禁制', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('tanlei'));
    ctx.c.start();
    ctx.c.tap(14);
    const cells = ctx.st.vm.cells;
    const isHidden = function (j) { return cells[j].cls.indexOf('cell--hidden') >= 0; };
    const isOpen = function (j) { return cells[j].cls.indexOf('cell--open') >= 0; };
    // 旗数不合：只点数字格，不该翻开任何东西。
    let numCell = -1;
    for (let i = 0; i < cells.length && numCell < 0; i += 1) {
      if (isOpen(i) && cells[i].label && mineNeighbors(i, 6, 6).some(isHidden)) numCell = i;
    }
    assert.ok(numCell >= 0, '首点展开后找不到带数字且有未探邻格的格子');
    const openCount = function () {
      return cells.filter(function (c) { return c.cls.indexOf('cell--open') >= 0; }).length;
    };
    const beforeOpen = openCount();
    ctx.c.tap(numCell);
    assert.ok(/旗数未合/.test(ctx.st.vm.status), '没插旗就点数字格，应该提示旗数未合');
    assert.strictEqual(openCount(), beforeOpen, '旗数不合竟然连开了');

    // 插够旗数再点：要么连开安全格，要么旗插错踩到禁制，两者都说明 chord 真的生效了。
    let target = -1;
    let toFlag = [];
    for (let i = 0; i < cells.length && target < 0; i += 1) {
      if (!isOpen(i) || !cells[i].label) continue;
      const num = Number(cells[i].label);
      const unknown = mineNeighbors(i, 6, 6).filter(isHidden);
      const marked = mineNeighbors(i, 6, 6).filter(function (j) {
        return cells[j].cls.indexOf('cell--flag') >= 0 || cells[j].cls.indexOf('cell--mine') >= 0;
      }).length;
      if (num >= 1 && marked === 0 && unknown.length > num) { target = i; toFlag = unknown.slice(0, num); }
    }
    assert.ok(target >= 0, '构造不出旗数对上的连开局面');
    for (let k = 0; k < toFlag.length; k += 1) ctx.c.longpress(toFlag[k]);
    const beforeHearts = ctx.st.vm.hearts.value;
    ctx.c.tap(target);
    const changed = openCount() > beforeOpen || ctx.st.vm.hearts.value < beforeHearts;
    assert.ok(changed, '旗数对上后点数字格，既没连开也没判误触');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('照影符：结算分数越大越好，玩得快不会反而输给磨洋工', function () {
  installClock();
  try {
    function abandonScore(seconds) {
      const ctx = makeCtx(data.getMethod('tanlei'));
      ctx.c.start();
      if (seconds) advance(seconds * 1000);
      ctx.c.abandon();
      const score = ctx.st.finished.score;
      ctx.c.destroy();
      return score;
    }
    const fast = abandonScore(0);
    const slow = abandonScore(30);
    assert.ok(fast > slow, '耗时更久反而分更高：' + fast + ' / ' + slow);
  } finally { restoreClock(); }
});

check('照影符：五档禁制数与心神数真的分开，不再叠一次 hard +3', function () {
  installClock();
  try {
    const keys = ['easy', 'normal', 'hard', 'expert', 'desperate'];
    const mines = [];
    const hearts = [];
    for (let i = 0; i < keys.length; i += 1) {
      const params = data.buildParams(data.getMethod('tanlei'), keys[i]);
      const ctx = makeCtx(data.getMethod('tanlei'), {}, params);
      ctx.c.start();
      mines.push(params.mines);
      hearts.push(ctx.st.vm.hearts.max);
      ctx.c.destroy();
    }
    assert.deepStrictEqual(hearts, [3, 3, 3, 2, 2], '心神数没随档收紧');
    assert.ok(mines[0] < mines[4], '绝境档的禁制数没比简单档多');
    for (let i = 1; i < mines.length; i += 1) {
      assert.ok(mines[i] >= mines[i - 1], '禁制数随档回退了：' + mines.join('/'));
    }
  } finally { restoreClock(); }
});

check('照影符：大成照见 3 处、大圆满 5 处，已照见的禁制点了不再扣心神', function () {
  installClock();
  try {
    for (const pair of [[3, 3], [5, 5]]) {
      const ctx = makeCtx(data.getMethod('tanlei'), { tier: pair[0], easy: pair[0] >= 3 });
      ctx.c.start();
      ctx.c.tap(14);
      const seen = [];
      for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
        if (ctx.st.vm.cells[i].cls.indexOf('cell--mine') >= 0) seen.push(i);
      }
      assert.strictEqual(seen.length, pair[1], '阶段 ' + pair[0] + ' 照见数不对');
      assert.strictEqual(ctx.st.vm.cells[seen[0]].label, '✕', '照见的禁制没用符号标出');
      const before = ctx.st.vm.hearts.value;
      ctx.c.tap(seen[0]);
      assert.strictEqual(ctx.st.vm.hearts.value, before, '点已经照见的禁制不该再折心神');
      ctx.c.destroy();
    }
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
  assert.ok(click.terms.some(function (t) { return /刀路/.test(t.name); }), '基础刀法没解释「刀路」');
  assert.ok(click.terms.some(function (t) { return /重斩/.test(t.name); }), '基础刀法没解释「重斩」');
  assert.ok(/扫到靶心/.test(click.inline), '局内速记没说这一门是把刀扫到靶心');
  assert.ok(/重斩/.test(click.inline), '局内速记没写重斩');
});

// ---------------------------------------------------------------- 顺光扫斩专项
check('顺光扫斩：轻点不判，得顺着箭头正向划过整条刀路', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 12, life: 700 }));
    ctx.c.start();
    const path = ctx.st.vm.trail.path.slice();
    assert.ok(path.length >= 2, '刀路至少两桩');
    assert.ok(ctx.st.vm.extras.showSwipe, '没有打开划刀输入');
    ctx.c.tap(path[0]);
    assert.ok(ctx.st.vm.trail, '轻点一下不该把刀路判掉');
    ctx.c.swipe([path[0]]);
    assert.ok(ctx.st.vm.trail, '只划一桩也不该算一刀');
    ctx.c.swipe(path.slice());
    assert.ok(!ctx.st.vm.trail, '正向划过竟然没斩中');
    assert.ok(Number((ctx.st.vm.scoreText.match(/\d+/) || [0])[0]) > 0, '斩中没有得分');
    advance(20);
    assert.ok(ctx.st.vm.slash && typeof ctx.st.vm.slash.angle === 'number', '斩中没有扫过盘面的白光');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光扫斩：反向判劈空，扣一息且不得分', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 12, life: 700 }));
    ctx.c.start();
    const path = ctx.st.vm.trail.path.slice();
    const before = ctx.st.vm.progressText;
    ctx.c.swipe(path.slice().reverse());
    assert.ok(!ctx.st.vm.trail, '反向没有把这一招判掉');
    assert.notStrictEqual(ctx.st.vm.progressText, before, '反向没扣息');
    assert.strictEqual(ctx.st.vm.scoreText, '得分 0', '反向竟然得分');
    assert.ok(/劈空/.test(ctx.st.vm.fx.text), '反向没有给出劈空浮字');
    assert.strictEqual(ctx.st.vm.comboText, '', '反向没有断刀势');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光扫斩：刀路每桩箭头指向下一桩，收势是靶心，盘面不放汉字', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    for (let t = 0; t < 15; t += 1) {
      const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: t % 5, duration: 12, life: 700 }));
      ctx.c.start();
      const path = ctx.st.vm.trail.path.slice();
      for (let i = 0; i < path.length; i += 1) {
        const cell = ctx.st.vm.cells[path[i]];
        assert.strictEqual(cell.label, '', '刀路桩上还留着汉字：' + cell.label);
        if (i === path.length - 1) {
          assert.strictEqual(cell.end, true, '收势桩没有靶心');
          assert.strictEqual(cell.arrow, -1, '收势桩不该有方向箭头');
          continue;
        }
        const dr = Math.floor(path[i + 1] / 3) - Math.floor(path[i] / 3);
        const dc = (path[i + 1] % 3) - (path[i] % 3);
        const want = (Math.round(Math.atan2(dc, -dr) * 180 / Math.PI) + 360) % 360;
        assert.strictEqual(cell.arrow, want, '箭头角度与下一桩方向不符：' + path.join(','));
        assert.strictEqual(cell.end, false, '中途桩不该是靶心');
      }
      ctx.c.swipe(path.slice());
      for (let i = 0; i < path.length; i += 1) {
        assert.strictEqual(ctx.st.vm.cells[path[i]].arrow, -1, '斩中后箭头没清掉');
        assert.strictEqual(ctx.st.vm.cells[path[i]].end, false, '斩中后靶心没清掉');
      }
      ctx.c.destroy();
    }
  } finally { restoreClock(); }
});

check('顺光扫斩：划偏罚一息、断刀势，重斩漏了不断势', function () {
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
    assert.strictEqual(ctx.st.vm.combo, 0, '划偏没有断刀势');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光扫斩：档位越高刀路越长，重斩是更长的金桩长招', function () {
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
        advance(450);
      }
      maxLens.push(longest);
      ctx.c.destroy();
    }
    assert.ok(sawGold, '整局都没出现重斩');
    assert.ok(maxLens[0] <= 4, '简单档不该出现 5 桩长招：' + maxLens[0]);
    assert.ok(maxLens[4] >= 5, '绝境档应该有 5 桩长招：' + maxLens[4]);
    assert.ok(maxLens[0] < maxLens[4], '五档刀路长度没有拉开');
    for (let i = 1; i < maxLens.length; i += 1) {
      assert.ok(maxLens[i] >= maxLens[i - 1], '刀路长度随档位倒退了：' + maxLens.join(','));
    }
  } finally { restoreClock(); }
});

// ---------------------------------------------------------------- 刀法难度：数值与阶段
check('刀法四档：后摇更短、重斩更密、连击门槛更高、劈空更疼', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    function open(depth) {
      const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: depth, duration: 40, life: 700 }));
      ctx.c.start();
      return ctx;
    }

    // 后摇：斩中之后多少毫秒接下一招。简单档 418ms，绝境 142ms。
    const slow = open(0);
    slow.c.swipe(slow.st.vm.trail.path.slice());
    advance(145);
    assert.ok(!slow.st.vm.trail, '简单档的后摇不该短到 145ms');
    advance(300);
    assert.ok(slow.st.vm.trail, '简单档后摇过长，接不上下一招');
    slow.c.destroy();

    const fast = open(4);
    fast.c.swipe(fast.st.vm.trail.path.slice());
    advance(145);
    assert.ok(fast.st.vm.trail, '绝境档后摇没收紧到 145ms 以内');
    fast.c.destroy();

    // 重斩密度：绝境档每 3 道一记，第 3 道就该是。
    const dense = open(4);
    for (let n = 1; n <= 2; n += 1) {
      assert.ok(!dense.st.vm.trail.gold, '第 ' + n + ' 道还不该是重斩');
      dense.c.swipe(dense.st.vm.trail.path.slice());
      advance(160);
    }
    assert.ok(dense.st.vm.trail && dense.st.vm.trail.gold, '绝境档第 3 道没换成重斩');
    dense.c.destroy();

    // 劈空罚时：简单档一息，绝境两息。
    function costOf(depth) {
      const ctx = open(depth);
      const before = parseInt(ctx.st.vm.progressText, 10);
      ctx.c.swipe(ctx.st.vm.trail.path.slice().reverse());
      const after = parseInt(ctx.st.vm.progressText, 10);
      ctx.c.destroy();
      return before - after;
    }
    assert.strictEqual(costOf(0), 1, '简单档劈空不只罚一息');
    assert.strictEqual(costOf(4), 2, '绝境档劈空没有加重');
  } finally { restoreClock(); }
});

// 入门档是教学档：光得慢慢走，玩家才来得及看清整条刀路再起手。
// 这条断言盯的是「每桩耗时」，不是到达时间——简单档 3 桩、绝境档 5 桩，
// 比总时长会得出「简单档更慢」的假象。
check('刀法入门档留出读图时间：每桩明显慢于高档', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    function perStep(depth) {
      const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: depth, duration: 40, life: 700 }));
      ctx.c.start();
      const tl = ctx.st.vm.trail;
      const last = tl.path[tl.path.length - 1];
      const steps = tl.path.length - 1;
      let t = 0;
      while (t < 4000 && !(ctx.st.vm.cells[last].life > 0)) { advance(10); t += 10; }
      ctx.c.destroy();
      return t / steps;
    }
    const easy = perStep(0);
    const desperate = perStep(4);
    assert.ok(easy >= 300, '简单档每桩只要 ' + Math.round(easy) + 'ms，来不及读图');
    assert.ok(desperate <= 140, '绝境档每桩 ' + Math.round(desperate) + 'ms，没有收紧');
    assert.ok(easy > desperate * 1.7, '入门档与绝境档的光速没拉开：' + Math.round(easy) + ' / ' + Math.round(desperate));
  } finally { restoreClock(); }
});

// 评级门槛曾经按「每秒划 4 刀」的机器人配，简单档 S 要 3139 分（15 息内 157 刀），
// 人力只能靠抢在光头到达前盲划去刷——这才是「明明调慢了还是觉得被催」的根源。
// 这条断言按正常节奏整局跑一遍：等光走到收势桩才出手，不带任何抢划。
check('刀法评级门槛是人打得到的：简单档按正常节奏能拿 A 以上', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 15, life: 700 }));
    ctx.c.start();
    let guard = 0;
    while (!ctx.st.finished && guard < 3000) {
      guard += 1;
      const vm = ctx.st.vm;
      if (!vm.trail) { advance(40); continue; }
      const last = vm.trail.path[vm.trail.path.length - 1];
      // 光还没走到收势桩就继续等——这就是「不抢划」的定义。
      if (!vm.cells[last] || !(vm.cells[last].life > 0)) { advance(40); continue; }
      ctx.c.swipe(vm.trail.path.slice());
    }
    assert.ok(ctx.st.finished, '一局没跑完');
    const r = ctx.st.finished;
    assert.ok(r.score > 0, '正常节奏一分没拿到');
    assert.ok(r.grade === 'S' || r.grade === 'A',
      '正常速度只拿到 ' + r.grade + '（' + r.score + ' 分）：门槛还是在逼玩家抢划');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('刀法连击门槛随档抬：绝境档要连中 9 记才到 ×1.5', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 4, duration: 60, life: 700 }));
    ctx.c.start();
    for (let n = 1; n <= 8; n += 1) {
      assert.ok(ctx.st.vm.trail, '第 ' + n + ' 招没出来');
      ctx.c.swipe(ctx.st.vm.trail.path.slice());
      advance(150);
    }
    assert.strictEqual(ctx.st.vm.combo, 8);
    assert.ok(/×1$/.test(ctx.st.vm.meter.label), '绝境档连中 8 记就给到倍率了：' + ctx.st.vm.meter.label);
    ctx.c.swipe(ctx.st.vm.trail.path.slice());
    advance(150);
    assert.ok(/×1\.5/.test(ctx.st.vm.meter.label), '第 9 记没进 ×1.5：' + ctx.st.vm.meter.label);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('连招：连中三记起接招更快，断了就恢复', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 60, life: 700 }));
    ctx.c.start();
    ctx.c.swipe(ctx.st.vm.trail.path.slice());
    advance(120);
    assert.ok(!ctx.st.vm.trail, '第一招之后就开始连招了');
    advance(300);
    assert.ok(ctx.st.vm.trail, '单招之后接不上下一招');
    for (let n = 0; n < 2; n += 1) {
      ctx.c.swipe(ctx.st.vm.trail.path.slice());
      advance(450);
    }
    assert.strictEqual(ctx.st.vm.combo, 3);
    ctx.c.swipe(ctx.st.vm.trail.path.slice());
    advance(250);
    assert.ok(ctx.st.vm.trail, '连中三记后没有把接招间隔压短');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('收势：大成后到靶心不停住算收势未成，断势但不扣息', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, { tier: 3 }, Object.assign({}, m.params, { depth: 0, duration: 30, life: 700 }));
    ctx.c.start();
    const before = parseInt(ctx.st.vm.progressText, 10);
    assert.ok(ctx.st.vm.trail.hold, '大成后没开出收势');
    assert.ok(/停一拍/.test(ctx.st.vm.trail.rule), '局内提示没写收势');
    ctx.c.swipe(ctx.st.vm.trail.path.slice(), { hold: 0 });
    const weak = Number((ctx.st.vm.scoreText.match(/\d+/) || [0])[0]);
    assert.ok(weak > 0, '收势未成也该算斩中，只是半分');
    assert.ok(/收势/.test(ctx.st.vm.fx.text), '收势未成没有反馈');
    assert.strictEqual(ctx.st.vm.comboText, '', '收势未成没有断势');
    assert.strictEqual(parseInt(ctx.st.vm.progressText, 10), before, '收势未成不该扣息');
    advance(450);
    ctx.c.swipe(ctx.st.vm.trail.path.slice(), { hold: 160 });
    const full = Number((ctx.st.vm.scoreText.match(/\d+/) || [0])[0]) - weak;
    assert.ok(full > weak, '收住之后的得分没有明显高于半分：' + full + ' vs ' + weak);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('禁桩：圆满后红叉一定不在刀路上，划到即断势不罚息', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, { tier: 4 }, Object.assign({}, m.params, { depth: 0, duration: 30, life: 700 }));
    ctx.c.start();
    const path = ctx.st.vm.trail.path.slice();
    let ban = -1;
    for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
      if (ctx.st.vm.cells[i].cls.indexOf('cell--ban') >= 0) { ban = i; break; }
    }
    assert.ok(ban >= 0, '圆满后盘上没出现禁桩');
    assert.strictEqual(path.indexOf(ban), -1, '禁桩压到刀路上了');
    const before = parseInt(ctx.st.vm.progressText, 10);
    ctx.c.swipe([path[0], ban]);
    assert.ok(/禁桩/.test(ctx.st.vm.fx.text), '划到禁桩没有反馈');
    assert.strictEqual(ctx.st.vm.scoreText, '得分 0');
    assert.strictEqual(parseInt(ctx.st.vm.progressText, 10), before, '划到禁桩不该扣息');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('双锋：大圆满后两道刀路，只有靶心在呼吸的那道是真招', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, { tier: 5 }, Object.assign({}, m.params, { depth: 0, duration: 30, life: 700 }));
    ctx.c.start();
    const t = ctx.st.vm.trail;
    assert.ok(t.double && t.fake && t.fake.length >= 3, '大圆满没有同时亮两道刀路');
    assert.strictEqual(t.fake.filter(function (i) { return t.path.indexOf(i) >= 0; }).length, 0, '真假两条路共用格子');
    assert.ok(ctx.st.vm.cells.some(function (c) { return c.end && c.endLive; }), '真招靶心没有呼吸');
    assert.ok(ctx.st.vm.cells.some(function (c) { return c.end && !c.endLive; }), '虚招靶心不该呼吸');
    const before = parseInt(ctx.st.vm.progressText, 10);
    ctx.c.swipe(t.fake.slice());
    assert.ok(/虚影/.test(ctx.st.vm.fx.text), '划到虚影没有反馈');
    assert.strictEqual(ctx.st.vm.scoreText, '得分 0');
    assert.strictEqual(parseInt(ctx.st.vm.progressText, 10), before, '划到虚影不该扣息');
    advance(200);
    const real = ctx.st.vm.trail;
    ctx.c.swipe(real.path.slice(), { hold: 160 });
    assert.ok(Number((ctx.st.vm.scoreText.match(/\d+/) || [0])[0]) > 0, '划真招反而没斩中');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('刀法三重新法挂在大成 / 圆满 / 大圆满，准备页读得到', function () {
  const rules = data.stageRulesOf('forge');
  assert.strictEqual(rules.length, 3, '刀法阶段新法数量不对');
  assert.deepStrictEqual(rules.map(function (r) { return r.at; }), [3, 4, 5]);
  for (const r of rules) {
    assert.ok(r.name && r.desc, '阶段新法缺名字或说明');
    assert.ok(!/剑/.test(r.name + r.desc), '刀法新法里混进了剑字：' + r.name);
  }
});

check('生成层按 grid / cols 走：4×4 盘面也能连续出合法刀路', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { grid: 16, cols: 4, depth: 2, duration: 40, life: 700 }));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.cells.length, 16, '4×4 盘面格数不对');
    assert.strictEqual(ctx.st.vm.cols, 4);
    let saw = 0;
    for (let n = 0; n < 60 && saw < 8; n += 1) {
      const t = ctx.st.vm.trail;
      if (!t) { advance(220); continue; }
      saw += 1;
      for (let i = 0; i < t.path.length; i += 1) {
        const idx = t.path[i];
        assert.ok(idx >= 0 && idx < 16, '4×4 刀路越界：' + idx);
        assert.strictEqual(t.path.indexOf(idx), i, '4×4 刀路出现重复桩');
        if (i) {
          const dr = Math.abs(Math.floor(idx / 4) - Math.floor(t.path[i - 1] / 4));
          const dc = Math.abs((idx % 4) - (t.path[i - 1] % 4));
          assert.ok(dr <= 1 && dc <= 1 && dr + dc > 0, '4×4 刀路跳格了');
        }
      }
      ctx.c.swipe(t.path.slice());
      advance(200);
    }
    assert.ok(saw >= 8, '4×4 盘面没能连续出招，只出了 ' + saw + ' 招');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

// ---------------------------------------------------------------- 兵器轴
check('兵器轴：剑与刀在轨迹、判定、节奏、称谓上都可区分', function () {
  const sw = weapons.PROFILES.sword;
  const dao = weapons.PROFILES.dao;
  assert.ok(dao.baseLen > sw.baseLen && dao.maxLen > sw.maxLen, '刀法招式没有更长');
  assert.ok(dao.bentBase > sw.bentBase, '刀法折线招没有更多');
  assert.ok(dao.slack > sw.slack, '刀法没有更宽的带桩容差');
  assert.ok(dao.gap > sw.gap, '刀法后摇没有更沉');
  assert.ok(dao.gradeScale > sw.gradeScale, '刀法长招分数更高却没同步抬评级门槛');
  assert.ok(JSON.stringify(dao.names) !== JSON.stringify(sw.names), '两种兵器招式名没分开');
  assert.ok(sw.stepMs < dao.stepMs, '剑光没有比刀势更快');
});

check('刀法标 dao、剑诀·断岳仍标 sword，buildParams 原样透传兵器字段', function () {
  const m = data.getMethod('forge');
  assert.strictEqual(m.params.weapon, 'dao', '基础刀法没标兵器');
  assert.strictEqual(data.getMethod('snatch').params.weapon, 'sword', '剑诀·断岳没标兵器');
  for (const k of ['easy', 'normal', 'hard', 'expert', 'desperate']) {
    assert.strictEqual(data.buildParams(m, k).weapon, 'dao', k + ' 档把兵器字段弄丢了');
  }
  assert.strictEqual(weapons.weaponOf('nope'), weapons.PROFILES.dao, '漏标兵器时没回落到当前启用的刀法');
});

check('同一套 click 引擎，两套兵器 profile 仍分得开（剑预留、刀启用）', function () {
  installClock();
  try {
    function sample(weapon) {
      const m = data.getMethod('forge');
      const params = Object.assign({}, data.buildParams(m, 'easy'), { weapon: weapon, duration: 12, life: 700 });
      const ctx = makeCtx(m, {}, params);
      ctx.c.start();
      let total = 0;
      let n = 0;
      let bladeName = false;
      const flashes = [];
      for (let k = 0; k < 30; k += 1) {
        const t = ctx.st.vm.trail;
        if (t) {
          total += t.path.length;
          n += 1;
          if (/劈|斩|游龙/.test(t.name)) bladeName = true;
          ctx.c.swipe(t.path.slice());
          // 只记命中类浮字，别把随后「漏了一刀」这类失手浮字当成命中样本。
          if (ctx.st.vm.fx && ctx.st.vm.fx.text && ctx.st.vm.fx.tone !== 'bad') flashes.push(ctx.st.vm.fx.text);
        }
        advance(450);
      }
      const out = {
        avg: n ? total / n : 0,
        bladeName: bladeName,
        flashes: flashes,
        meter: ctx.st.vm.meter ? ctx.st.vm.meter.label : '',
      };
      ctx.c.destroy();
      return out;
    }
    const sw = sample('sword');
    const dao = sample('dao');
    assert.ok(n_ok(sw.avg) && n_ok(dao.avg), '采样没跑出刀路');
    assert.ok(dao.avg > sw.avg + 0.4, '刀法招式没有明显更长：剑 ' + sw.avg + ' / 刀 ' + dao.avg);
    assert.ok(/剑势/.test(sw.meter) && /刀势/.test(dao.meter), '剑势 / 刀势槽没跟着兵器换');
    assert.ok(!sw.bladeName, '剑法招式名里混进了刀字');
    assert.ok(dao.bladeName, '刀法招式名没换成刀的称谓');
    assert.ok(sw.flashes.some(function (x) { return /剑/.test(x); }), '剑法没有「一剑中的」这类命中浮字');
    assert.ok(dao.flashes.some(function (x) { return /斩|刀/.test(x); }), '刀法没有刀味命中浮字');
    assert.ok(sw.flashes.every(function (x) { return !/劈|斩|砍|刀锋|一刀/.test(x); }), '剑法命中浮字串进了刀字');
  } finally { restoreClock(); }
});

function n_ok(v) { return typeof v === 'number' && v > 0; }

check('刀法可见文案零剑字：招式、浮字、说明、命名、主题都对得上', function () {
  const bad = weapons.forbiddenOf('dao');
  function clean(label, text) {
    for (let i = 0; i < bad.length; i += 1) {
      assert.ok(text.indexOf(bad[i]) < 0, label + ' 混进剑味词「' + bad[i] + '」：' + text);
    }
  }
  const dao = weapons.PROFILES.dao;
  for (const k of Object.keys(dao.names)) clean('刀招名', dao.names[k]);
  for (const k of Object.keys(dao.words)) clean('刀法浮字 ' + k, dao.words[k]);
  clean('金色长招', dao.edgeName);
  const g = guides.guideOf('click');
  clean('玩法目标', g.goal);
  for (let i = 0; i < g.steps.length; i += 1) clean('玩法步骤', g.steps[i]);
  clean('局内速记', g.inline);
  clean('诀窍', g.tip);
  for (let i = 0; i < g.terms.length; i += 1) clean('术语名', g.terms[i].name);
  const m = data.getMethod('forge');
  clean('参悟方式', m.name);
  clean('准备页描述', m.desc);
  clean('准备页提示', m.tip);
  clean('玩法名', m.gameName);
  clean('forge 命中浮字', themes.THEMES.forge.hit);
  clean('forge 失手浮字', themes.THEMES.forge.miss);
});

check('预留的剑 profile 与剑法主题仍零刀字，等做剑法时可直接挂', function () {
  const bad = weapons.forbiddenOf('sword');
  function clean(label, text) {
    for (let i = 0; i < bad.length; i += 1) {
      assert.ok(text.indexOf(bad[i]) < 0, label + ' 混进刀味词「' + bad[i] + '」：' + text);
    }
  }
  const sw = weapons.PROFILES.sword;
  for (const k of Object.keys(sw.names)) clean('剑招名', sw.names[k]);
  for (const k of Object.keys(sw.words)) clean('剑法浮字 ' + k, sw.words[k]);
  clean('金色长招', sw.edgeName);
  clean('snatch 命中浮字', themes.THEMES.snatch.hit);
  clean('snatch 失手浮字', themes.THEMES.snatch.miss);
});

console.log('\n小游戏层断言全部通过（' + passed + ' 项）');
