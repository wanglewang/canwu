'use strict';

// 小游戏层常驻断言：用假时钟把每一局真的跑完，验证 15 套玩法各自独立、机制互不复用、HUD 齐全。
// 零依赖，直接 node tests/minigames.test.js 即可跑。
const assert = require('assert');
const index = require('../minigames/index.js');
const themes = require('../minigames/theme.js');
const data = require('../data/practice.js');
const skills = require('../data/skills.js');
const guides = require('../data/guides.js');
const weapons = require('../data/weapons.js');
const worldData = require('../data/world.js');
const lightsMod = require('../minigames/lights.js');
const sudokuMod = require('../minigames/sudoku.js');
const klotskiMod = require('../minigames/klotski.js');
const pushboxMod = require('../minigames/pushbox.js');
const schulteMod = require('../minigames/schulte.js');

// getMethod 对未知 id 会静默回落到第一门（拿循光斩桩的参数去开三秀的盘，测试照样能绿）。
// 三秀的两个测试都要真参数，所以取法门时当场验 game，取错就红。
const sanxiu = function () {
  const m = data.getMethod('harvest');
  assert.ok(m && m.game === 'match', 'getMethod(\'harvest\') 取到的不是三连互换：' + (m && m.game));
  return m;
};

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
  const st = { vm: null, finished: null, flash: [], roundKey: '', plan: null, planAt: 0, at: 0, pressed: false, seen: {}, sawReverse: false, sawRepeat: false, hints: [] };
  st.method = method;
  const c = index.createGame(method.game, {
    params: params || method.params,
    difficulty: 'entry',
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
      if (vm.banner && vm.banner.indexOf('叠印') >= 0) st.sawRepeat = true;
      // 轮间预告：这一行是在下一轮闪起来之前报的，玩家靠它换脑子，所以单独记。
      if (vm.status && vm.status.indexOf('下一轮') === 0 && st.hints.indexOf(vm.status) < 0) st.hints.push(vm.status);
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
      // 这一门现在是「划」：沿 vm.trail 给出的刀路把整条轨迹送进去，点格子已经不判了。
      if (vm.trail && vm.trail.path) c.swipe(vm.trail.path.slice());
    };
  }
  if (game === 'memory') {
    return function (vm, c, st) {
      if (vm.phase !== 'input' || !vm.meter || vm.meter.value >= st.flash.length) return;
      // 逆诵轮要从末字往前点。判断依据就是 HUD 上那行「第 N / 7 轮 · 逆诵」——
      // 不认这一条，驱动每局一到第 3 轮就必然全错，逆诵等于从来没被测过。
      const back = vm.timeText && vm.timeText.indexOf('逆诵') >= 0;
      const i = back ? st.flash.length - 1 - vm.meter.value : vm.meter.value;
      c.tap(st.flash[i]);
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
  if (game === 'tempo') {
    return function (vm, c) {
      if (vm.ring && Math.abs(vm.ring.scale - vm.ring.judge) <= vm.ring.window) c.tap(0);
    };
  }
  if (game === 'link') {
    return function (vm, c, st) {
      st.tick = (st.tick || 0) + 1;
      if (st.tick % 4 !== 0 || !vm.link) return;
      const pair = index.MODULES.link.findPair(vm.link.board, vm.link.cols, vm.link.rows);
      if (pair) { c.tap(pair[0]); c.tap(pair[1]); }
    };
  }
  if (game === 'match') {
    return function (vm, c, st) {
      st.tick = (st.tick || 0) + 1;
      if (st.tick % 6 !== 0 || !vm.match) return;
      const move = index.MODULES.match.findMove(vm.match.board, vm.match.cols, vm.match.rows);
      if (move) { c.tap(move[0]); c.tap(move[1]); }
    };
  }
  if (game === 'blocks') {
    // 灵石自己会落、堆到顶就完成；方向键的手感由下面的专项断言单独验。
    return function () {};
  }
  if (game === 'sudoku') {
    // 先按题面把解算出来，再一格一格填：这条路就是玩家照着排除法推到底的那条。
    return function (vm, c, st) {
      if (!vm.sudoku) return;
      const g = vm.sudoku;
      if (!st.solution) st.solution = sudokuMod.solveGrid(g.given, g.size);
      for (let i = 0; i < g.given.length; i += 1) {
        if (g.given[i] === 0 && g.grid[i] === 0) { c.tap(i); c.move(String(st.solution[i])); return; }
      }
    };
  }
  if (game === 'merge') {
    return function (vm, c, st) {
      if (!vm.merge) return;
      const dirs = ['left', 'up', 'right', 'down'];
      c.move(dirs[st.at++ % 4]);
    };
  }
  if (game === 'schulte') {
    return function (vm, c) {
      if (!vm.schulte) return;
      const want = String(vm.schulte.next);
      for (let i = 0; i < vm.cells.length; i += 1) {
        if (vm.cells[i].label === want) { c.tap(i); return; }
      }
    };
  }
  if (game === 'klotski') {
    return function (vm, c, st) {
      if (!vm.klotski) return;
      if (!st.plan) {
        const state = vm.klotski.blocks.map(function (b) {
          return [Math.round(b.y / 25), Math.round(b.x / 25)];
        });
        st.plan = klotskiMod.solvePath(state, klotskiMod.SHAPES, 4, 4, 40) || [];
      }
      if (st.at >= st.plan.length) return;
      const step = st.plan[st.at];
      st.at += 1;
      c.tap(step.piece);
      const dir = step.dir[0] === -1 ? 'up' : step.dir[0] === 1 ? 'down' : step.dir[1] === -1 ? 'left' : 'right';
      c.move(dir);
    };
  }
  if (game === 'pushbox') {
    return function (vm, c, st) {
      if (!vm.pushbox) return;
      // 图每局现抽，解法要从这一局的盘面现算（vm.pushbox.layout 就是当局石图）。
      if (!st.plan) st.plan = pushboxMod.solutionMoves(vm.pushbox.layout) || [];
      if (st.at >= st.plan.length) return;
      c.move(st.plan[st.at]);
      st.at += 1;
    };
  }
  if (game === 'biggest') {
    return function (vm, c) {
      if (!vm.biggest) return;
      const want = String(vm.biggest.max);
      for (let i = 0; i < vm.cells.length; i += 1) {
        if (vm.cells[i].label === want) { c.tap(i); return; }
      }
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
  memory: [140000, 60],
  tempo: [80000, 40],
  lights: [46000, 80],
  mines: [20000, 80],
  seal: [75000, 60],
  link: [70000, 60],
  blocks: [80000, 80],
  match: [70000, 60],
  sudoku: [220000, 60],
  merge: [30000, 60],
  schulte: [70000, 60],
  klotski: [50000, 60],
  pushbox: [70000, 60],
  biggest: [70000, 60],
  charge: [20000, 55],
};

// ---------------------------------------------------------------- 断言：十五门十五套
check('15 套常规玩法 + 突破专用玩法全部注册', function () {
  assert.deepStrictEqual(Object.keys(index.MODULES).sort(), [
    'biggest', 'blocks', 'charge', 'click', 'klotski', 'lights', 'link',
    'match', 'memory', 'merge', 'mines', 'pushbox', 'schulte', 'seal', 'sudoku',
    'tempo',
  ]);
  assert.strictEqual(index.PRACTICE_GAMES.length, 15);
});

check('15 门功法对应 15 套互不重复的玩法', function () {
  const games = data.PRACTICE_METHODS.map(function (m) { return m.game; });
  assert.strictEqual(games.length, 15);
  assert.strictEqual(new Set(games).size, 15, '仍有功法共用同一套玩法内核');
  for (const g of games) assert.ok(index.MODULES[g], g + ' 未注册');
});

check('同类功法（刀法/阵法/心法）也各用各的玩法', function () {
  const byType = {};
  for (const s of skills.SKILLS) {
    const m = data.getMethod(s.method);
    if (!byType[s.type]) byType[s.type] = [];
    byType[s.type].push(m.game);
  }
  for (const type of Object.keys(byType)) {
    assert.strictEqual(new Set(byType[type]).size, byType[type].length, type + ' 里有两门功法共用玩法');
  }
  assert.strictEqual(new Set(byType['刀法']).size, 1, '刀法这一门只有一套内核');
  // 阵法三档：黄阶勘禁（数格辨禁）、黄阶九宫（填数推演）、地阶点灯（阵灯推演），
  // 三套内核互不复用——同族不等于同玩法，这是「一门功法一套内核」在最挤的族里的验。
  assert.strictEqual(new Set(byType['阵法']).size, 3);
});

check('每门玩法都给出本档 S/A/B/C 四条线，说明页与局内同源', function () {
  // 「怎么才能拿 C / B / A / S」以前散在各玩法里，玩家只看得到「下一条线还差多少」。
  // 现在由各模块的 lines() 统一给出，说明页照抄这一份数，不许另算一遍。
  for (const m of data.PRACTICE_METHODS) {
    const mod = index.MODULES[m.game];
    assert.strictEqual(typeof mod.lines, 'function', m.id + ' 没导出 lines()');
    for (const dk of ['novice', 'entry', 'full']) {
      const r = mod.lines(data.buildParams(m, dk), data.STAGES[data.stageIndexLike(dk)].gear);
      assert.ok(r && Array.isArray(r.items), m.id + ' 的 lines() 没给 items');
      assert.ok(r.items.length >= 4, m.id + ' 的 ' + dk + ' 档没给全四条线');
      const text = r.items.join('');
      assert.ok(!/undefined|NaN/.test(text), m.id + ' 的 ' + dk + ' 档线算出了空值：' + text);
      assert.ok(/C/.test(text), m.id + ' 没写 C 的条件');
    }
    // 数值型门槛要随档重标定——但方向不统一：按用时的玩法收时间，按分数的玩法
    // 也可能**降**线（三连互换按本档可得分标定，7 色 52 息的 950 分比 5 色 68 息
    // 的 1900 分更难拿）。所以这里只验「五档写的是不是同一行」，不验谁大谁小；
    // 谁大谁小由 tests/rank.test.js 的 MATCH_LEVELS 专条守。
    // 段数与步数类（步法 / 点灯）本身不随档变，只能靠盘面规格变难，这里不强行要求。
    // gear（normal / hard）要跟着档走：剑法的时长、五行的目标都按它再收一次。
    const easy = mod.lines(data.buildParams(m, 'novice'), data.STAGES[data.stageIndexLike('novice')].gear);
    const hard = mod.lines(data.buildParams(m, 'full'), data.STAGES[data.stageIndexLike('full')].gear);
    const nums = function (r) {
      return r.items.join(' ').match(/\d+(\.\d+)?/g) || [];
    };
    // 只有按分数 / 盘面规格的门才会让这几行数字随档变；纯按用时的几门评级线固定，
    // 难度由时辰、变阵间隔、心神盏数体现，线不变才是对的（本档事实另写在首行）。
    if (/分/.test(easy.items.join('')) && /分/.test(hard.items.join(''))) {
      const joinText = nums(easy).join(',') + '|' + nums(hard).join(',');
      assert.ok(joinText.split('|')[0] !== joinText.split('|')[1],
        m.id + ' 的门槛不随难度档变化：' + joinText);
    }
  }
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

check('15 套玩法覆盖 3 种舞台形态', function () {
  const stages = {};
  for (const m of data.PRACTICE_METHODS) {
    const ctx = makeCtx(m);
    stages[ctx.st.vm.stage] = (stages[ctx.st.vm.stage] || 0) + 1;
    ctx.c.destroy();
  }
  // 删掉辨锋截击（lane）/ 五行相生（orbit）/ 步法连环（scroll）后，舞台只剩三种形态。
  assert.ok(Object.keys(stages).length >= 3, '舞台形态不足：' + JSON.stringify(stages));
  assert.strictEqual(stages.board, 13);
  assert.strictEqual(stages.klotski, 1);
  assert.strictEqual(stages.ring, 1);
});

check('每门功法的独有机制互不重复', function () {
  const twists = new Set(data.PRACTICE_METHODS.map(function (m) { return m.twist; }));
  assert.strictEqual(twists.size, 15);
});

check('15 门功法各有完整主题字段', function () {
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
    advance(720);                       // 刀势起手沉，3 桩两步才走到收势桩（简单档 273ms/桩）
    assert.ok(ctx.st.vm.cells[last].life > 0, '收势桩没有寿命线，玩家看不出还剩多久');
    const before = ctx.st.vm.scoreText;
    // 站着不动等寿命线走完。这里不写死「推到第几毫秒」：漏刀报出状态之后 170ms
    // 就出新招，而新招会把 status 覆盖掉——写死一个数会被时序调整悄悄打红。
    // 逐小步推进，见到「慢」就停，测的是「漏刀有没有提示」这件事本身。
    let sawMiss = false;
    for (let i = 0; i < 40 && !sawMiss; i += 1) {
      advance(100);
      if (ctx.st.vm.status.indexOf('慢') >= 0) sawMiss = true;
    }
    assert.ok(sawMiss, '漏刀没有给出提示');
    assert.strictEqual(ctx.st.vm.scoreText, before, '漏刀不该加分');
    assert.strictEqual(ctx.st.vm.comboText, '', '漏刀之后刀势该断');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光扫斩：划偏罚一息，断刀势', function () {
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


// ---------------------------------------------------------------- 成对翻牌：阶段新法
// data/practice.js 的 STAGE_RULES 写着两条：大成「留影」（照见到点下一处才散）、
// 大圆满「记印」（翻错过的牌背留残影）。两条都只改「翻过的卦象留在盘上多久」，不改判定。
check('成对翻牌：大成「留影」照见不再到时就散，没到大成照样散', function () {
  installClock();
  try {
    const m = data.getMethod('seal');
    const params = data.buildParams(m, 'entry');
    const boot = function (tier) {
      const ctx = makeCtx(m, { tier: tier }, params);
      ctx.c.start();
      return ctx;
    };
    const peeksOf = function (ctx) {
      return ctx.st.vm.cells.filter(function (x) { return x.cls.indexOf('cell--hint') >= 0; });
    };

    // 没到大成：照见到时（1600ms）自己收回去。
    const low = boot(2);
    low.c.hint();
    assert.strictEqual(peeksOf(low).length, 2, '照见没亮出两处');
    advance(1700);
    assert.strictEqual(peeksOf(low).length, 0, '没到大成，照见却留着不散');
    low.c.destroy();

    // 大成：一直留着，直到玩家点下一处。
    const high = boot(3);
    high.c.hint();
    assert.strictEqual(peeksOf(high).length, 2, '大成照见没亮出两处');
    advance(5000);
    assert.strictEqual(peeksOf(high).length, 2, '大成照见到时又散了');
    const held = high.st.vm.cells.indexOf(peeksOf(high)[0]);
    high.c.tap(held);
    // 点下一处 = 这次照见结束：整对收回。玩家仍要靠刚才看的那一眼把第二处点开。
    assert.strictEqual(peeksOf(high).length, 0, '点下一处之后照见该整对收回');
    assert.ok(high.st.vm.cells[held].cls.indexOf('cell--flipped') >= 0, '点下去的那一处没翻开');
    // 照见次数照扣：留影不是白送多看一次。
    assert.ok(high.st.vm.hint.indexOf('剩 1 次') >= 0, '照见没用掉次数');
    high.c.destroy();
  } finally { restoreClock(); }
});

check('成对翻牌：大圆满「记印」只给翻错过的牌留残影，没到大圆满一处都不留', function () {
  installClock();
  try {
    const m = data.getMethod('seal');
    const params = data.buildParams(m, 'entry');
    const boot = function (tier) {
      const ctx = makeCtx(m, { tier: tier }, params);
      ctx.c.start();
      return ctx;
    };
    const ghostsOf = function (ctx) {
      const out = [];
      const cells = ctx.st.vm.cells;
      for (let i = 0; i < cells.length; i += 1) {
        if (cells[i].cls.indexOf('cell--ghost') >= 0) out.push(i);
      }
      return out;
    };
    // 翻出一对「不合」的牌，返回这两格与各自翻开时的卦象编号。
    const mismatch = function (ctx) {
      const n = ctx.st.vm.cells.length;
      for (let f = 0; f < n - 1; f += 1) {
        if (ctx.st.vm.cells[f].cls.indexOf('cell--matched') >= 0) continue;
        ctx.c.tap(f);
        if (ctx.st.vm.cells[f].cls.indexOf('cell--flipped') < 0) continue;
        const ef = ctx.st.vm.cells[f].emblem;
        for (let k = f + 1; k < n; k += 1) {
          if (ctx.st.vm.cells[k].cls.indexOf('cell--matched') >= 0) continue;
          ctx.c.tap(k);
          if (ctx.st.vm.cells[k].cls.indexOf('cell--flipped') < 0) continue;
          const ek = ctx.st.vm.cells[k].emblem;
          if (!ctx.st.vm.pair.locked) return null; // 翻上了，换下一个起始格
          return { a: f, b: k, ea: ef, eb: ek };
        }
        // 第一张还亮着却没锁上：只可能是自己跟自己，直接收工换一局。
        return null;
      }
      return null;
    };

    // 没到大圆满：一开局就没有残影，「不合」翻完之后也没有。
    for (let round = 0; round < 3; round += 1) {
      const low = boot(3);
      assert.strictEqual(ghostsOf(low).length, 0, '一开局就有残影');
      const pairLow = mismatch(low);
      if (pairLow) {
        advance(1200);
        assert.strictEqual(ghostsOf(low).length, 0, '没到大圆满，翻错的牌却留了残影');
      }
      low.c.destroy();
    }

    let seen = 0;
    for (let round = 0; round < 6 && seen < 2; round += 1) {
      const high = boot(5);
      assert.strictEqual(ghostsOf(high).length, 0, '一开局就有残影');
      const pair = mismatch(high);
      if (!pair) { high.c.destroy(); continue; }
      advance(1200);
      const ghosts = ghostsOf(high);
      assert.strictEqual(ghosts.length, 2, '翻错的两处该各留一道残影，实际 ' + ghosts.length);
      assert.strictEqual(ghosts.indexOf(pair.a) >= 0, true, '第一处没留残影');
      assert.strictEqual(ghosts.indexOf(pair.b) >= 0, true, '第二处没留残影');
      // 残影必须是「刚看过的那一象」，不是随手指一个卦象。
      assert.strictEqual(high.st.vm.cells[pair.a].emblem, pair.ea, '残影的卦象与翻开的对不上');
      assert.strictEqual(high.st.vm.cells[pair.b].emblem, pair.eb, '残影的卦象与翻开的对不上');
      // 再点开其中一处：那一处显示的是卦象本身，残影的样式要撤掉。
      high.c.tap(pair.a);
      assert.strictEqual(high.st.vm.cells[pair.a].cls.indexOf('cell--ghost') >= 0, false, '翻开的牌上还挂着残影');
      seen += 1;
      high.c.destroy();
    }
    assert.ok(seen > 0, '连开六局都没翻出一对「不合」，这条断言等于没跑');
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

check('记序复现：规则要变，得在前一轮结束时就说', function () {
  // 逆诵是「第 3 轮起」生效。等第 3 轮闪起来才写，玩家第一下已经点下去了，
  // 只会觉得「好好记着顺序，突然让倒着点」。预告必须落在上一轮的间隙里。
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'), { tier: 3 });
    ctx.c.start();
    drive(ctx, 'memory', 60000, 60);
    assert.ok(ctx.st.hints.some(function (h) { return h.indexOf('逆诵') >= 0; }),
      '逆诵没有在上一轮结束前预告：' + JSON.stringify(ctx.st.hints));
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('记序复现：把逆诵关掉，这一门就真的不逆诵了', function () {
  // 逆诵是「改规矩」：练到解锁之后，想安心练基础记忆的人该有退路。
  // 开关只影响这一门、这一局，不是「还没解锁」——所以断言的是「跑过第 3 轮但没逆诵」。
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('recite'), { tier: 3, offTwists: ['逆诵'] });
    ctx.c.start();
    drive(ctx, 'memory', 60000, 60);
    assert.ok(!ctx.st.sawReverse, '关掉逆诵之后还在倒着点');
    // 没跑到第 3 轮的话，上面那句等于没测：先证明它确实走过了逆诵本来该生效的那一轮。
    const txt = ctx.st.finished ? ctx.st.finished.summary : '';
    assert.ok(/第 [3-7] 轮|7 轮全过/.test(txt), '没跑到第 3 轮，这条断言等于没测：' + txt);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：关掉死门，盘上就没有不能点的格子', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    const on = makeCtx(m, { tier: 5 });
    on.c.start();
    drive(on, 'lights', 20000, 80);
    const deadWhenOn = on.st.vm.cells.filter(function (c) { return c.cls.indexOf('cell--dead') >= 0; }).length;
    assert.ok(deadWhenOn > 0, '大圆满开局居然没有死门，断言前提不成立');
    on.c.destroy();
  } finally { restoreClock(); }
  installClock();
  try {
    const off = makeCtx(data.getMethod('arrayEye'), { tier: 5, offTwists: ['死门'] });
    off.c.start();
    drive(off, 'lights', 20000, 80);
    const deadWhenOff = off.st.vm.cells.filter(function (c) { return c.cls.indexOf('cell--dead') >= 0; }).length;
    assert.strictEqual(deadWhenOff, 0, '关掉死门之后盘上还有 ' + deadWhenOff + ' 格不能点的');
    off.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：关掉双门只是回到一格死门，不是全没有', function () {
  installClock();
  try {
    const off = makeCtx(data.getMethod('arrayEye'), { tier: 5, offTwists: ['双门'] });
    off.c.start();
    drive(off, 'lights', 20000, 80);
    const n = off.st.vm.cells.filter(function (c) { return c.cls.indexOf('cell--dead') >= 0; }).length;
    assert.strictEqual(n, 1, '关掉双门后死门数不是 1：' + n);
    off.c.destroy();
  } finally { restoreClock(); }
});

check('记序复现：叠印的解锁段位与准备页说明一致（圆满，不是大圆满）', function () {
  // data/practice.js 的 STAGE_RULES.recite 写的是 at:4（圆满）解锁叠印，
  // 准备页据此把它标成「已解锁」。玩法内阈值若比它更晚，就是说了不兑现。
  const rule = data.STAGE_RULES.recite.filter(function (r) { return r.name === '叠印'; })[0];
  assert.ok(rule, 'STAGE_RULES 里没有叠印');
  installClock();
  try {
    const atTier = makeCtx(data.getMethod('recite'), { tier: rule.at });
    atTier.c.start();
    drive(atTier, 'memory', 140000, 60);
    assert.ok(atTier.st.sawRepeat, '说明写「' + worldData.TIERS[rule.at].name + '解锁叠印」，进局却没有叠印');
    atTier.c.destroy();
  } finally { restoreClock(); }
  installClock();
  try {
    const lower = makeCtx(data.getMethod('recite'), { tier: rule.at - 1 });
    lower.c.start();
    drive(lower, 'memory', 140000, 60);
    assert.ok(!lower.st.sawRepeat, '还没到「' + worldData.TIERS[rule.at].name + '」就出了叠印');
    lower.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：五档两条轴都单调，相邻两档不会两条轴都一样', function () {
  const m = data.getMethod('arrayEye');
  const rows = [];
  for (let i = 0; i < data.STAGES.length; i += 1) {
    const p = data.buildParams(m, data.STAGES[i].key);
    assert.strictEqual(typeof p.duration, 'undefined', '还在往这一门传限时，步数制不该有倒计时');
    assert.strictEqual(typeof p.capSteps, 'undefined', '还在传写死的步数预算：预算该按「最优 + 余量」现算');
    assert.ok(p.hiSteps >= p.minSteps, '最优步数区间反了');
    rows.push({
      name: data.STAGES[i].name,
      size: p.size, lo: p.minSteps, hi: p.hiSteps, slack: p.budgetSlack,
    });
  }
  assert.deepStrictEqual(rows.map(function (r) { return r.size; }), [3, 3, 4, 5, 5],
    '盘面规格没有逐档放大：' + rows.map(function (r) { return r.size; }).join('/'));
  // 相邻两档至少要有一条轴真的动了。旧表允许「盘面一样、区间重合三分之二」的两档并排，
  // 那样的两档玩家打起来是同一件事，只是标题换了。
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1];
    const b = rows[i];
    assert.ok(b.size > a.size || b.lo > a.hi,
      a.name + ' 与 ' + b.name + ' 两条轴都没拉开：' + a.size + '×' + a.size + ' ['
      + a.lo + ',' + a.hi + '] → ' + b.size + '×' + b.size + ' [' + b.lo + ',' + b.hi + ']');
    assert.ok(b.lo >= a.lo, b.name + ' 的最优步数反而更短');
  }
  // 余量低于 5 时 A 线（多 2 步）与 B 线（余量 − 2）会重合成一条：B 档当场消失。
  for (const r of rows) {
    assert.ok(r.slack >= 5, r.name + ' 的步数余量压到 B 档都不存在了：' + r.slack);
  }
});

check('阵灯推演：五档开出来的盘都解得开，且最优步数落在该档区间', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    for (let d = 0; d < data.STAGES.length; d += 1) {
      const p = data.buildParams(m, data.STAGES[d].key);
      for (let round = 0; round < 4; round += 1) {
        const ctx = makeCtx(m, {}, p);
        ctx.c.start();
        const vm = ctx.st.vm;
        assert.strictEqual(vm.cells.length, p.size * p.size, '格子数与盘面规格不符');
        const board = vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
        const allowed = [];
        for (let i = 0; i < vm.cells.length; i += 1) allowed.push(i);
        const plan = lightsMod.solve(board, p.size, allowed);
        assert.ok(plan && plan.length > 0,
          data.STAGES[d].name + ' 第 ' + (round + 1) + ' 盘开出来就是无解盘');
        assert.ok(plan.length >= p.minSteps && plan.length <= p.hiSteps,
          data.STAGES[d].name + ' 的最优步数跑出该档区间 [' + p.minSteps + ',' + p.hiSteps + ']：'
          + plan.length);
        ctx.c.destroy();
      }
    }
  } finally { restoreClock(); }
});

check('阵灯推演：正好走最优解是 S，破阵即结算', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'novice'));
    ctx.c.start();
    const vm = ctx.st.vm;
    const board = vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
    const allowed = [];
    for (let i = 0; i < vm.cells.length; i += 1) allowed.push(i);
    const plan = lightsMod.solve(board, vm.cols, allowed);
    for (let i = 0; i < plan.length; i += 1) ctx.c.tap(plan[i]);
    assert.ok(ctx.st.finished, '解开之后没有结算');
    assert.strictEqual(ctx.st.finished.grade, 'S', '一步没浪费却不是 S：' + ctx.st.finished.grade);
    assert.ok(/最优/.test(ctx.st.finished.summary), '结算没讲最优步数：' + ctx.st.finished.summary);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：S / A / B / C / F 五档都真的拿得到', function () {
  // 冗余手数用「同一格点两下」凑出来（两次翻转互相抵消，盘面不动），所以冗余只能是偶数。
  // 余量 7 时：0 → S、2 → A、4 → B、6 → C、8 → F，五档正好铺满，一档都不缺。
  // 旧口径（B = 两倍最优）在「最优 2 步」的盘上会让 A 线与 B 线重合，B 整档拿不到——
  // 这一条就是为了那个坑立的。
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    const cases = [
      { pairs: 0, grade: 'S' },
      { pairs: 1, grade: 'A' },
      { pairs: 2, grade: 'B' },
      { pairs: 3, grade: 'C' },
      { pairs: 4, grade: 'F' },
    ];
    for (const cs of cases) {
      const ctx = makeCtx(m, {}, data.buildParams(m, 'novice'));
      ctx.c.start();
      const vm = ctx.st.vm;
      const allowed = [];
      for (let i = 0; i < vm.cells.length; i += 1) allowed.push(i);
      const plan = lightsMod.solve(
        vm.cells.map(function (x) { return x.cls.indexOf('cell--lit') >= 0; }), vm.cols, allowed);
      let stray = -1;
      for (let i = 0; i < allowed.length; i += 1) {
        if (plan.indexOf(allowed[i]) < 0) { stray = allowed[i]; break; }
      }
      assert.ok(stray >= 0, '盘上没有解外的格子，凑不出冗余');
      for (let i = 0; i < cs.pairs * 2 && !ctx.st.finished; i += 1) ctx.c.tap(stray);
      for (let i = 0; i < plan.length && !ctx.st.finished; i += 1) ctx.c.tap(plan[i]);
      assert.ok(ctx.st.finished, '冗余 ' + cs.pairs * 2 + ' 手之后都没结算');
      assert.strictEqual(ctx.st.finished.grade, cs.grade,
        '冗余 ' + cs.pairs * 2 + ' 手该是 ' + cs.grade + '，实际 ' + ctx.st.finished.grade);
      ctx.c.destroy();
    }
  } finally { restoreClock(); }
});

check('阵灯推演：步数用尽还没全亮即阵溃，按失败 F 收场', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    // 余量收到 5 步：3×3 是唯一解，每次点一格「不在解里」的就不会提前破阵。
    const ctx = makeCtx(m, {}, { size: 3, minSteps: 2, hiSteps: 3, budgetSlack: 5 });
    ctx.c.start();
    let guard = 0;
    while (!ctx.st.finished && guard < 20) {
      const vm = ctx.st.vm;
      const board = vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
      // 挑一手「点了也不会全亮」的：只要有这么一格，步数就会被白白耗掉。
      let pick = -1;
      for (let i = 0; i < 9 && pick < 0; i += 1) {
        const nb = board.slice();
        const hit = lightsMod.effectOf(i, 3);
        for (let j = 0; j < hit.length; j += 1) nb[hit[j]] = !nb[hit[j]];
        if (!nb.every(Boolean)) pick = i;
      }
      assert.ok(pick >= 0, '盘上每一格都能一手点亮，凑不出阵溃');
      ctx.c.tap(pick);
      guard += 1;
    }
    assert.ok(ctx.st.finished, '步数用尽了还没结算');
    // 阵溃是「没解开」，不是「解得糙」：失败 F，与步数超两倍的 C 分开。
    assert.strictEqual(ctx.st.finished.grade, 'F', '阵溃不是失败 F：' + ctx.st.finished.grade);
    assert.ok(/阵溃/.test(ctx.st.finished.summary), '结算没写阵溃：' + ctx.st.finished.summary);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：阵眼感应照一格算 2 步，不是免费封顶', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'novice'));
    ctx.c.start();
    ctx.c.hint();
    assert.ok(/算 2 步/.test(ctx.st.vm.status), '感应没有当场交代它花了多少步：' + ctx.st.vm.status);
    assert.ok(/已走 2 步/.test(ctx.st.vm.goal), '感应没有记进步数：' + ctx.st.vm.goal);
    advance(1600);   // 感应照出的那一格是临时高亮，等它收回再读盘面
    const vm = ctx.st.vm;
    const board = vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
    const allowed = [];
    for (let i = 0; i < vm.cells.length; i += 1) allowed.push(i);
    const plan = lightsMod.solve(board, vm.cols, allowed);
    for (let i = 0; i < plan.length; i += 1) ctx.c.tap(plan[i]);
    // 看一眼 + 走完最优 = 冗余 2 步，正好压在 A 线上：辅助与走错落在同一把尺子上。
    assert.strictEqual(ctx.st.finished.grade, 'A', '用了感应却没掉到 A：' + ctx.st.finished.grade);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：余量买不起这一眼时，感应被挡回去且不扣步', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    // 余量 5：3×3 盘连续点同一格三下（六步，盘面不变），再点就买不起了。
    const ctx = makeCtx(m, {}, { size: 3, minSteps: 2, hiSteps: 3, budgetSlack: 5 });
    ctx.c.start();
    const vm = ctx.st.vm;
    const board = vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
    const allowed = [];
    for (let i = 0; i < vm.cells.length; i += 1) allowed.push(i);
    const plan = lightsMod.solve(board, vm.cols, allowed);
    let stray = -1;
    for (let i = 0; i < allowed.length; i += 1) {
      if (plan.indexOf(allowed[i]) < 0) { stray = allowed[i]; break; }
    }
    for (let i = 0; i < 6; i += 1) ctx.c.tap(stray);
    assert.ok(!ctx.st.finished, '六步就阵溃了，这个用例的前提不成立');
    const before = ctx.st.vm.goal;
    ctx.c.hint();
    assert.strictEqual(ctx.st.vm.goal, before, '买不起的那一眼还是扣了步数：' + ctx.st.vm.goal);
    assert.ok(ctx.st.vm.fx && ctx.st.vm.fx.tone === 'bad', '买不起时没有任何提示');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：重置阵局回开局、步数清零，但本盘同样封顶 A', function () {
  installClock();
  try {
    const m = data.getMethod('arrayEye');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'novice'));
    ctx.c.start();
    const vm0 = ctx.st.vm;
    const board0 = vm0.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }).join(',');
    const allowed = [];
    for (let i = 0; i < vm0.cells.length; i += 1) allowed.push(i);
    const plan0 = lightsMod.solve(
      vm0.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }), vm0.cols, allowed);
    let stray = -1;
    for (let i = 0; i < allowed.length; i += 1) {
      if (plan0.indexOf(allowed[i]) < 0) { stray = allowed[i]; break; }
    }
    ctx.c.tap(stray);
    assert.ok(/已走 1 步/.test(ctx.st.vm.goal), '走了一步却没记账：' + ctx.st.vm.goal);
    ctx.c.reset();
    const vm1 = ctx.st.vm;
    assert.strictEqual(
      vm1.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }).join(','), board0,
      '重置没有回到本局开局盘面');
    assert.ok(/已走 0 步/.test(vm1.goal), '重置没有把步数清零：' + vm1.goal);
    assert.ok(vm1.status.indexOf('最高 A') >= 0, '重置没有交代代价：' + vm1.status);
    // 每局只许复原一次：第二次必须被挡回来，盘面与步数都不动。
    const held = vm1.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }).join(',');
    ctx.c.reset();
    assert.ok(/只许 \d+ 次/.test(ctx.st.vm.status), '第二次复位没有被挡回：' + ctx.st.vm.status);
    assert.strictEqual(
      ctx.st.vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }).join(','), held,
      '第二次复位把盘面也动了');
    const plan = lightsMod.solve(
      vm1.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }), vm1.cols, allowed);
    for (let i = 0; i < plan.length; i += 1) ctx.c.tap(plan[i]);
    assert.strictEqual(ctx.st.finished.grade, 'A', '重置过却还是 S：' + ctx.st.finished.grade);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：破阵有整盘金光与破阵浮字，且一局只推一盘', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('arrayEye'));
    ctx.c.start();
    const vm = ctx.st.vm;
    const board = vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
    const allowed = [];
    for (let i = 0; i < vm.cells.length; i += 1) allowed.push(i);
    const plan = lightsMod.solve(board, vm.cols, allowed);
    for (let i = 0; i < plan.length - 1; i += 1) ctx.c.tap(plan[i]);
    ctx.c.tap(plan[plan.length - 1]);
    const now = ctx.st.vm;
    assert.ok(now.fx && now.fx.tone === 'gold', '破阵那一击没有走最亮的一档浮字');
    assert.ok(now.fx.text.indexOf('破阵') >= 0, '浮字没写破阵：' + now.fx.text);
    assert.ok(now.banner.indexOf('破阵') >= 0, '金框 banner 没有破阵提示');
    assert.strictEqual(
      now.cells.filter(function (c) { return c.cls.indexOf('cell--solved') >= 0; }).length,
      now.cells.length, '整盘没有一次性泛金');
    assert.strictEqual(now.phase, 'done', '破阵之后还停在对局中，应直接结算');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：大成开死门，误触只罚 2 步、盘面不动', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('arrayEye'), { tier: 3 });
    ctx.c.start();
    let deadAt = -1;
    for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
      if (ctx.st.vm.cells[i].cls.indexOf('cell--dead') >= 0) { deadAt = i; break; }
    }
    assert.ok(deadAt >= 0, '大成之后盘上没有死门');
    const held = ctx.st.vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }).join(',');
    ctx.c.tap(deadAt);
    assert.ok(ctx.st.vm.status.indexOf('死门') >= 0 || ctx.st.vm.fx.text.indexOf('死门') >= 0, '点死门没有反馈');
    assert.ok(/已走 2 步/.test(ctx.st.vm.goal), '死门没有罚 2 步：' + ctx.st.vm.goal);
    // 死门不再整盘复位：复位等于用一根手指的精度否掉一整盘已经推好的局。
    assert.strictEqual(
      ctx.st.vm.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; }).join(','), held,
      '点一次死门就把盘面推倒了');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('阵灯推演：点一格，被翻的五格同步闪一拍，跑完即收', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('arrayEye'));
    ctx.c.start();
    advance(100);
    // 挑一格「不在最优解里」的点，这样不会当场破阵，正好能看这一手的翻转范围。
    const vm0 = ctx.st.vm;
    const board0 = vm0.cells.map(function (c) { return c.cls.indexOf('cell--lit') >= 0; });
    const all = [];
    for (let i = 0; i < vm0.cells.length; i += 1) all.push(i);
    const plan = lightsMod.solve(board0, vm0.cols, all);
    let pick = 4;
    for (let i = 0; i < all.length; i += 1) {
      if (plan.indexOf(all[i]) < 0) { pick = all[i]; break; }
    }
    ctx.c.tap(pick);
    let vm = ctx.st.vm;
    assert.strictEqual(vm.phase, 'playing', '点一格不该直接结算');
    const flipped = [];
    for (let i = 0; i < vm.cells.length; i += 1) {
      if (/cell--flip[ab]/.test(vm.cells[i].cls)) flipped.push(i);
    }
    assert.strictEqual(flipped.join(','),
      lightsMod.effectOf(pick, vm.cols).slice().sort(function (a, b) { return a - b; }).join(','),
      '闪烁范围不是中心 + 四邻：' + flipped.join(','));
    advance(300);
    vm = ctx.st.vm;
    assert.ok(vm.cells.every(function (c) { return !/cell--flip[ab]/.test(c.cls); }),
      '微光没有收回，成了常驻动画');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('触雷不再一击出局，只扣一盏心神并显形', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('tanlei'));
    ctx.c.start();
    assert.strictEqual(ctx.st.vm.extras.showHint, false, '探禁不该有照见类提示按钮');
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

// ---------------------------------------------------------------- 洞微勘禁诀：经典扫雷深耕
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
  // 只认「探明秘境」：踩雷判 F 也是 finished，把它算成推完会让段差断言空转。
  return !!(ctx.st.finished && /探明秘境/.test(ctx.st.finished.summary));
}

check('洞微勘禁诀：开局不先布雷，首点九宫格全开且盘面无汉字', function () {
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

check('洞微勘禁诀：无猜布局能纯靠数字零失误翻完全盘', function () {
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

check('洞微勘禁诀：首点不会把整盘开完（否则 0 秒拿 S，等于没参悟）', function () {
  installClock();
  try {
    for (let round = 0; round < 30; round += 1) {
      const ctx = makeCtx(data.getMethod('tanlei'));
      ctx.c.start();
      ctx.c.tap(14);
      assert.ok(!ctx.st.finished, '第 ' + (round + 1) + ' 盘首点就全开：布阵挡掉了退化盘');
      ctx.c.destroy();
    }
  } finally { restoreClock(); }
});

check('洞微勘禁诀：阵钉数对上点数字格可连开，压错位置照样踩禁制', function () {
  installClock();
  try {
    const ctx = makeCtx(data.getMethod('tanlei'));
    ctx.c.start();
    ctx.c.tap(14);
    const cells = ctx.st.vm.cells;
    const isHidden = function (j) { return cells[j].cls.indexOf('cell--hidden') >= 0; };
    const isOpen = function (j) { return cells[j].cls.indexOf('cell--open') >= 0; };
    // 符数不合：只点数字格，不该翻开任何东西。
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
    assert.ok(/阵钉未合/.test(ctx.st.vm.fx && ctx.st.vm.fx.text), '没钉阵钉就点数字格，应该浮字提示阵钉未合');
    assert.strictEqual(openCount(), beforeOpen, '符数不合竟然连开了');

    // 钉够阵钉再点：要么连开安全格，要么钉错踩到禁制，两者都说明 chord 真的生效了。
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
    assert.ok(target >= 0, '构造不出符数对上的连开局面');
    for (let k = 0; k < toFlag.length; k += 1) ctx.c.longpress(toFlag[k]);
    const beforeHearts = ctx.st.vm.hearts.value;
    ctx.c.tap(target);
    const changed = openCount() > beforeOpen || ctx.st.vm.hearts.value < beforeHearts;
    assert.ok(changed, '符数对上后点数字格，既没连开也没判误触');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('洞微勘禁诀：结算分数越大越好，玩得快不会反而输给磨洋工', function () {
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

check('洞微勘禁诀：五档禁制数与心神数真的分开，不再叠一次 hard +3', function () {
  installClock();
  try {
    const keys = ['novice', 'entry', 'minor', 'major', 'full'];
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
    assert.deepStrictEqual(hearts, [3, 3, 2, 1, 1], '心神数没随档收紧到后两段零容错');
    assert.ok(mines[0] < mines[4], '绝境档的禁制数没比简单档多');
    for (let i = 1; i < mines.length; i += 1) {
      assert.ok(mines[i] >= mines[i - 1], '禁制数随档回退了：' + mines.join('/'));
    }
  } finally { restoreClock(); }
});

check('洞微勘禁诀：推理深度与猜局开关双段差——首段基础推得完，后段必须换推法', function () {
  installClock();
  try {
    const method = data.getMethod('tanlei');
    const keys = ['novice', 'entry', 'minor', 'major', 'full'];
    let prev = -1;
    for (let d = 0; d < keys.length; d += 1) {
      const params = data.buildParams(method, keys[d]);
      assert.strictEqual(params.deduce, d <= 1 ? 0 : d - 1,
        keys[d] + ' 的推理深度没按段递进：' + params.deduce);
      assert.ok(params.deduce >= prev, keys[d] + ' 推理深度比上一段还浅');
      prev = params.deduce;
      assert.strictEqual(params.allowGuess, d >= 3, keys[d] + ' 的猜局开关没按段放开');

      // 行为反证：只用「单格数字」的求解器去推这一段的盘。
      // 不能再拿 noGuess 当门闸——后两段它恒为 false，basicWins===0 会不证自明。
      let basicWins = 0;
      let noGuessCount = 0;
      for (let r = 0; r < 4; r += 1) {
        const ctx = makeCtx(method, {}, params);
        ctx.c.start();
        ctx.c.tap(Math.floor(params.cols * params.rows / 2));
        if (ctx.st.vm.extras.noGuess) noGuessCount += 1;
        if (solveMines(ctx, params.cols)) basicWins += 1;
        ctx.c.destroy();
      }
      if (d <= 1) {
        assert.strictEqual(basicWins, 4, keys[d] + ' 首段盘基础规则推不完，违背「一看就懂」');
        assert.strictEqual(noGuessCount, 4, keys[d] + ' 前两段不再保证无猜');
      } else if (d === 2) {
        assert.strictEqual(basicWins, 0, keys[d] + ' 小成盘用基础规则就推完了，段差是假的');
        assert.strictEqual(noGuessCount, 4, '小成段不再保证无猜');
      } else {
        assert.strictEqual(basicWins, 0, keys[d] + ' 后段盘用基础规则就推完了，段差是假的');
        assert.strictEqual(noGuessCount, 0, keys[d] + ' 后两段没留出两难处，段差倒挂');
      }
    }
  } finally { restoreClock(); }
});

check('洞微勘禁诀：章内 lineScale 真被读走，S 线随段收紧而不是只写在界面上', function () {
  installClock();
  try {
    const m = data.getMethod('tanlei');
    const first = data.buildParamsAt(m, 1);
    const last = data.buildParamsAt(m, 40);   // 一章 40 关：章内收紧只在本章里比
    assert.ok(typeof first.lineScale === 'number' && typeof last.lineScale === 'number', 'buildParamsAt 没给 lineScale');
    assert.ok(last.lineScale < first.lineScale, '章内 lineScale 没有随段收紧');
    // 只生成不消费是最容易漏的一种：界面报「S 线 −3%」，盘面一关都没变。
    const sOf = function (params) {
      const L = index.gradeLines('mines', params);
      return Number(String(L.items[1]).replace(/[^0-9]/g, ''));
    };
    const s1 = sOf(first);
    const s2 = sOf(last);
    assert.ok(s2 < s1, '末段的 S 线没比段首短（' + s1 + ' → ' + s2 + '），lineScale 没被 lines() 读走');
    assert.ok(Math.abs(s2 / s1 - last.lineScale) < 0.06, 'S 线收紧幅度与 lineScale 对不上（' + s1 + ' → ' + s2 + '）');
    // 局内的三条线也得是同一份：create 用的 line 与 lines() 报的必须一致。
    const ctx = makeCtx(m, {}, last);
    ctx.c.start();
    const goal = ctx.st.vm.goal || '';
    assert.ok(goal.indexOf(String(s2)) >= 0, '局内目标句没报出本段的 S 线（' + goal + '，应为 ' + s2 + '）');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('洞微勘禁诀：阵钉读数常驻，钉超了照实报 7 / 6', function () {
  installClock();
  try {
    const m = data.getMethod('tanlei');
    const params = data.buildParams(m, 'novice');
    const ctx = makeCtx(m, {}, params);
    ctx.c.start();
    ctx.c.tap(14);
    const total = params.mines;
    assert.strictEqual(ctx.st.vm.flagText, '阵钉 0 / ' + total, '开局阵钉读数不对：' + ctx.st.vm.flagText);
    let marked = 0;
    for (let i = 0; i < ctx.st.vm.cells.length && marked < total + 1; i += 1) {
      if (ctx.st.vm.cells[i].cls.indexOf('cell--hidden') < 0) continue;
      ctx.c.longpress(i);
      marked += 1;
    }
    assert.strictEqual(ctx.st.vm.flagText, '阵钉 ' + marked + ' / ' + total, '长按钉阵钉后读数没跟着走');
    assert.ok(marked > total, '没钉到超出的格数，这条断言没测到 7 / 6 的情况');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('洞微勘禁诀：开出一片要报格数，不能一律「石格无事」', function () {
  installClock();
  try {
    const m = data.getMethod('tanlei');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'novice'));
    ctx.c.start();
    // 首点必展开一片（mines.js 保证首点九邻无禁制），所以第一下就该报格数。
    ctx.c.tap(14);
    const flash = (ctx.st.vm.fx && ctx.st.vm.fx.text) || '';
    assert.ok(/^石开 [0-9]+ 格$/.test(flash), '首点开了一片却没报格数：' + flash);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('洞微勘禁诀：大成勘出 3 处、大圆满 5 处，已勘出的禁制点了不再扣心神', function () {
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
      assert.ok(['board', 'lane', 'ring', 'orbit', 'scroll', 'klotski'].indexOf(vm.stage) >= 0, '舞台形态非法');
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

check('15 套玩法都有「怎么玩」说明，盘面符号讲得清', function () {
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
  assert.ok(click.terms.some(function (t) { return /刀路/.test(t.name); }), '刀法·开锋破军诀没解释「刀路」');
  assert.ok(click.terms.some(function (t) { return /重斩/.test(t.name); }), '刀法·开锋破军诀没解释「重斩」');
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
        // 期望角度同样按宽高比算：格子高瘦时斜向不是 45°，照箭头划才不会偏。
        const want = index.MODULES.click.dirAngle(path[i], path[i + 1], 3, index.MODULES.click.DEFAULT_ASPECT);
        assert.strictEqual(cell.arrow, want, '箭头角度与下一桩中心连线不符：' + path.join(','));
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

check('斜向箭头按实测宽高比校正，页面回注比例会重画当前刀路', function () {
  const click = index.MODULES.click;
  // 正方形格子退回原来的八方向 45° 一档；3 列宽格（203/156≈1.30）右下只该是 127°。
  assert.strictEqual(click.dirAngle(0, 4, 3, 1), 135, '正方形盘面的斜向箭头算错了');
  assert.strictEqual(click.dirAngle(0, 4, 3, 1.30), 128, '宽格盘的右下箭头没按宽高比校正');
  assert.strictEqual(click.dirAngle(0, 2, 3, 1.30), 90, '正下方不该被校正偏');
  assert.strictEqual(click.angleOf([0, 4], 3, 1), 45, '正方形盘面白光应是 45°');
  assert.strictEqual(click.angleOf([0, 4], 3, 1.30), 38, '宽格盘白光没跟着校正');
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 12, life: 700 }));
    ctx.c.start();
    const path = ctx.st.vm.trail.path.slice();
    ctx.c.setAspect(1);
    for (let i = 0; i < path.length - 1; i += 1) {
      assert.strictEqual(ctx.st.vm.cells[path[i]].arrow, click.dirAngle(path[i], path[i + 1], 3, 1),
        '回注实测比例后当前刀路的箭头没重画');
    }
    ctx.c.destroy();
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

check('顺光扫斩：斜步擦到（或从角边那格拐过去）仍算同一刀', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    let covered = 0;
    for (let round = 0; round < 60; round += 1) {
      const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: round % 3, duration: 20, life: 900 }));
      ctx.c.start();
      const form = ctx.st.vm.trail.path.slice();
      const cols = ctx.st.vm.cols;
      // 找一处斜步，把一个「共边邻」塞进两桩之间，模拟直划擦角 / 绕角走 L。
      let carved = null;
      for (let k = 1; k < form.length; k += 1) {
        const a = form[k - 1];
        const b = form[k];
        const ar = Math.floor(a / cols);
        const ac = a % cols;
        const br = Math.floor(b / cols);
        const bc = b % cols;
        if (Math.abs(br - ar) !== 1 || Math.abs(bc - ac) !== 1) continue;
        const cand = [ar * cols + bc, br * cols + ac];
        let x = -1;
        for (let t = 0; t < cand.length; t += 1) {
          if (form.indexOf(cand[t]) < 0) { x = cand[t]; break; }
        }
        if (x < 0) continue;
        carved = form.slice(0, k).concat([x], form.slice(k));
        break;
      }
      if (carved) {
        ctx.c.swipe(carved);
        assert.ok(!ctx.st.vm.trail, '斜步擦角被判掉：' + carved.join(',') + ' / 刀路 ' + form.join(','));
        assert.ok(Number((ctx.st.vm.scoreText.match(/\d+/) || [0])[0]) > 0, '斜步擦角没得分');
        covered += 1;
      }
      ctx.c.destroy();
    }
    assert.ok(covered >= 5, '没测够带斜步的刀路：' + covered);
  } finally { restoreClock(); }
});

check('顺光扫斩：放宽斜步后，绕盘面乱划一大圈仍判劈空', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const ctx = makeCtx(m, {}, Object.assign({}, m.params, { depth: 0, duration: 12, life: 700 }));
    ctx.c.start();
    ctx.c.swipe([0, 1, 2, 5, 8, 7, 6, 3, 4]);
    assert.ok(/劈空/.test(ctx.st.vm.fx.text), '绕一大圈没有判劈空');
    assert.strictEqual(ctx.st.vm.scoreText, '得分 0', '绕一大圈竟然得分');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺光扫斩：档位越高刀路越长，重斩是更长的金桩长招', function () {
  installClock();
  try {
    const m = data.getMethod('forge');
    const keys = ['novice', 'entry', 'minor', 'major', 'full'];
    const maxLens = [];
    let sawGold = false;
    for (let d = 0; d <= 4; d += 1) {
      // 用 buildParams 而不是手拼 params：刀路桩数与盘面规格都是按档整表注入的
      // （CLICK_LEVELS），手拼会把 len / grid / cols 漏掉，五档就测成同一个盘面。
      // 时长与寿命仍然放宽，好让 30 挥之内能撞见重斩。
      const pr = data.buildParams(m, keys[d]);
      const ctx = makeCtx(m, {}, Object.assign({}, pr, { duration: 30, life: 700 }));
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
    assert.ok(maxLens[4] >= 6, '绝境档刀路太短（整表给的是 8 桩）：' + maxLens[4]);
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

check('刀法标 dao，buildParams 原样透传兵器字段', function () {
  const m = data.getMethod('forge');
  assert.strictEqual(m.params.weapon, 'dao', '刀法·开锋破军诀没标兵器');
  for (const k of ['novice', 'entry', 'minor', 'major', 'full']) {
    assert.strictEqual(data.buildParams(m, k).weapon, 'dao', k + ' 档把兵器字段弄丢了');
  }
  assert.strictEqual(weapons.weaponOf('nope'), weapons.PROFILES.dao, '漏标兵器时没回落到当前启用的刀法');
});

check('同一套 click 引擎，两套兵器 profile 仍分得开（剑预留、刀启用）', function () {
  installClock();
  try {
    function sample(weapon) {
      const m = data.getMethod('forge');
      const params = Object.assign({}, data.buildParams(m, 'novice'), { weapon: weapon, duration: 12, life: 700 });
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

check('预留的剑 profile 仍零刀字，等真做剑法时可直接挂', function () {
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
});

check('阵灯推演：首局手把手两步走完就全亮，点错不推进', function () {
  installClock();
  try {
    const teach = index.MODULES.lights.teach;
    assert.ok(teach, '星罗烛天诀没有教学脚本');
    assert.deepStrictEqual(teach.steps, [4, 0], '教学步骤被改了（第一手必须先点正中）');
    const startBoard = teach.board();
    assert.strictEqual(startBoard.filter(Boolean).length, 5,
      '教学盘初始亮灯数不对（应是全亮反推两手后剩五盏）');

    let vm = null;
    let done = 0;
    const c = index.createTeach('lights', {
      theme: themes.themeOf('arrayEye', 'lights'),
      render: function (v) { vm = v; },
      done: function () { done += 1; },
    });
    assert.ok(vm && vm.tutorial === true, '教学 vm 没标 tutorial，页面会当成正式局');
    assert.strictEqual(vm.extras.showHint, false, '教学里不该给提示按钮');
    assert.ok(vm.cells[4].cls.indexOf('cell--teach-next') >= 0, '第一手没标出正中那一格');

    // 点错不推进：只提示，不动盘面。
    c.tap(8);
    assert.ok(vm.teachText.indexOf('先点那一格') >= 0, '点错没有提示');
    assert.ok(vm.cells[4].cls.indexOf('cell--teach-next') >= 0, '点错把目标格弄丢了');

    c.tap(4);
    assert.ok(vm.cells[0].cls.indexOf('cell--teach-next') >= 0, '第二步没把目标换到左上');
    c.tap(0);
    const lit = vm.cells.filter(function (x) { return x.cls.indexOf('cell--lit') >= 0; }).length;
    assert.strictEqual(lit, 9, '两步走完没有全亮');

    // 全亮后停一拍再交棒：这一拍是给玩家看清「破阵长什么样」的。
    advance(500);
    assert.strictEqual(done, 0, '教学没停就切走了');
    advance(500);
    assert.strictEqual(done, 1, '教学走完没有交棒给正式局');
    c.destroy();
  } finally { restoreClock(); }
});

// 15 门参悟 × 5 段，每段的第 1 关各有一盘教学盘。判据在 docs/specs/spec/界面设计/12-teach-boards.md：
// ① 每一步只有一处可操作，点别处不推进；② 不计步、不评档、无命灯；
// ③ 走完停一拍再交棒，且只交棒一次；④ 首段讲整门机制（≥2 步），段界只讲这一段变的那件事（≤3 步）。
//
// 驱动方式改了：不再为每门手写一串输入，而是让教学盘把自己的「正确那一手」报出来
// （vm.teachPlan）。75 盘（15×5）不可能一条条手写，手写的那套每加一段就要补五行，
// 而漏补的那一段恰恰没人跑过——正是这一轮要修的问题。
check('引导：15 门 × 5 段各有教学盘，首段讲机制、段界讲变化，走完只交棒一次', function () {
  installClock();
  try {
    // 靠时间推进才能开始点的两门：记序复现要等闪完，节律判定要等环压到红圈。
    const PREP = {
      memory: function () { advance(6000); },
      tempo: function () { /* 逐步等环到位，见下面的 wait */ },
    };
    const statuses = {};

    for (const id of index.PRACTICE_GAMES) {
      statuses[id] = [];
      for (let stage = 0; stage < 5; stage += 1) {
        let vm = null;
        let done = 0;
        const c = index.createTeach(id, {
          stage: stage,
          theme: {},
          render: function (v) { vm = v; },
          done: function () { done += 1; },
        });
        const tag = id + ' 第 ' + (stage + 1) + ' 段';
        assert.ok(c, tag + ' 没有教学控制器');
        assert.strictEqual(vm.tutorial, true, tag + ' 教学 vm 没标 tutorial，页面会当成正式局');
        assert.strictEqual(vm.extras.showGradeNow, false, tag + ' 教学里不该报当前档位');
        assert.strictEqual(vm.extras.showProgress, false, tag + ' 教学里不该有进度条');
        assert.ok(vm.teachTotal >= 1 && vm.teachText, tag + ' 教学条没有第一步文案');
        assert.ok(Array.isArray(vm.teachPlan) && vm.teachPlan.length === vm.teachTotal,
          tag + ' 教学步骤与「正确那一手」对不上：' + vm.teachTotal + ' / '
          + (vm.teachPlan ? vm.teachPlan.length : 'null'));
        statuses[id].push(vm.status || '');

        // 首段要把整门机制讲完：一步过场只教得了「点一下」，教不了「这一门怎么算赢」。
        if (stage === 0) {
          assert.ok(vm.teachTotal >= 2, tag + ' 首段只有 1 步：讲不清整门机制');
        } else {
          // 段界只讲变化，三步封顶。记序复现是例外：它的「变化」就是记的音变多，
          // 步数天然等于音数（点几个音就要点几下），压到三步等于把变化本身删掉。
          const cap = id === 'memory' ? 5 : 3;
          assert.ok(vm.teachTotal <= cap, tag + ' 段界教了 ' + vm.teachTotal + ' 步：段界只该讲变化');
        }

        // 点错不推进、不记账：教学盘里没有失败，只有「还没点对」。
        const first = vm.teachPlan[0];
        if (first.k === 'tap' && first.at.length) {
          const wrong = first.at[0] === 0 ? 1 : 0;
          c.tap(wrong);
        } else if (first.k === 'move') {
          c.move('none');
        }
        assert.strictEqual(vm.teachStep, 1, tag + ' 点错却推进了步骤');

        if (PREP[id]) PREP[id]();
        // 按教学盘自己报的正确手一步步走。
        for (let i = 0; i < vm.teachPlan.length; i += 1) {
          const p = vm.teachPlan[i];
          const before = vm.teachStep;
          if (p.k === 'swipe') {
            c.swipe(p.answer.slice());
          } else if (p.k === 'move') {
            c.move(p.dir[0]);
          } else if (p.at.length) {
            c.tap(p.at[0]);
          } else {
            // 只有节律判定是「没有指定格、只看时机」的：等环压到红圈再点。
            let guard = 0;
            while (vm.ring && vm.ring.tone !== 'good' && guard < 400) { advance(16); guard += 1; }
            assert.ok(guard < 400, tag + ' 环一直没压到红圈');
            c.tap(0);
          }
          assert.ok(vm.teachStep > before || i === vm.teachPlan.length - 1,
            tag + ' 第 ' + (i + 1) + ' 步按正确手没推进');
        }
        assert.strictEqual(vm.teachStep, vm.teachTotal, tag + ' 按步走完却没到最后一步');

        // 走完停一拍再交棒：那一拍是给玩家看清「做对了是什么样」的。
        advance(1000);
        assert.strictEqual(done, 1, tag + ' 走完没有交棒（或交了不止一次）');
        c.destroy();
        advance(1000);
        assert.strictEqual(done, 1, tag + ' 交棒之后又交了一次');
      }
      // 五段不许是同一盘换个数字：段界要真的说另一件事。
      const uniq = statuses[id].filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      assert.ok(uniq.length >= 3, id + ' 五段的教学条只有 ' + uniq.length + ' 种说法，段界没讲出变化');
      assert.notStrictEqual(statuses[id][0], statuses[id][1], id + ' 第二段与首段的教学条一模一样');
    }
  } finally { restoreClock(); }
});

// 失败（F）与粗浅（C）是两个结论：前者是「这一局没走完」，后者是「走完了但糙」。
// 把没走完算成 C，玩家会以为再练练就好；把打得糙算成 F，又等于抹掉一局的努力。
check('失败：有失败态的玩法判负给 F，没有失败态的玩法不许瞎给', function () {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', 'minigames');
  const readMod = function (f) { return fs.readFileSync(path.join(root, f + '.js'), 'utf8'); };

  // 有「没走完」这个结果的：判负分支必须是 F。
  const mustBeF = {
    lights: /if \(failed\) return 'F'/,
    mines: /finishOnce\('F', '心神耗尽/,
    memory: /finishOnce\('口诀散在[^)]*, 'F'\)/,
    seal: /finishOnce\('F', '只通了/,
    link: /pairsDone < pairs[\s\S]{0,160}'F'/,
    sudoku: /finishOnce\('F', '时辰到/,
    merge: /finishOnce\('F', '盘满/,
    schulte: /finishOnce\('F', '时辰到/,
    klotski: /finishOnce\('F', '步数用尽/,
    pushbox: /finishOnce\('F', '推数用尽/,
    biggest: /finishOnce\('F', '时辰到/,
  };
  Object.keys(mustBeF).forEach(function (f) {
    assert.ok(mustBeF[f].test(readMod(f)), f + '.js 的判负分支没给失败 F');
  });

  // 没有「达成/未达成」的玩法（一局有自然终点）不许出现第二种 F：
  // 唯一合法的 F 是 abandon（中途结束），那是玩家自己退的，不是打崩的。
  ['click', 'tempo', 'match', 'blocks'].forEach(function (f) {
    const hits = readMod(f).match(/finishOnce\('F'|grade: 'F'/g) || [];
    assert.ok(hits.length <= 1, f + '.js 把「时间到」也判成了失败（F 只该留给中途结束）');
  });

  // 有失败态的玩法，说明页必须写出这条：玩家要能在开局前知道「崩了会掉到哪」。
  for (const m of data.PRACTICE_METHODS) {
    const mod = index.MODULES[m.game];
    const r = mod.lines(data.buildParams(m, 'entry'), 'entry');
    if (mustBeF[m.game]) {
      assert.ok(r.fail, m.id + ' 有失败态却没在说明页写 fail 线');
      assert.ok(/失败\s*F|失败（F）/.test(r.fail), m.id + ' 的 fail 线没说清是失败 F：' + r.fail);
    } else {
      assert.ok(!r.fail, m.id + ' 没有失败态，却写了 fail 线');
    }
  }
});

check('太虚照见诀：时辰到还没通完就是失败 F', function () {
  installClock();
  try {
    const method = data.getMethod('seal');
    const ctx = makeCtx(method, {}, Object.assign({}, method.params, { timeLimit: 1 }));
    ctx.c.start();
    for (let i = 0; i < 40 && !ctx.st.finished; i += 1) advance(100);
    assert.ok(ctx.st.finished, '时辰到了还没结算');
    assert.strictEqual(ctx.st.finished.grade, 'F', '没通完却给了 ' + ctx.st.finished.grade);
    assert.ok(/只通了/.test(ctx.st.finished.summary), '结算没说清通了几对：' + ctx.st.finished.summary);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺序点格：盘上不标「下一个在哪」，五档各自换盘面或换规则', function () {
  installClock();
  try {
    const method = data.getMethod('shumu');
    const sizes = [];
    for (let depth = 0; depth < 5; depth += 1) {
      const params = data.buildParams(method, data.STAGES[depth].key);
      const ctx = makeCtx(method, {}, params);
      ctx.c.start();
      const vm = ctx.st.vm;
      const n = vm.cells.length;
      sizes.push(n);
      // 开局：盘上只有「没点过的数」，没有任何一格被标成「下一个」。
      // 一旦替玩家描出目标格，这一门就退化成「点发亮的格子」，舒尔特方格练的目光扫盘全没了。
      const marked = vm.cells.filter(function (x) { return /cell--next|cell--lit|cell--hint|cell--hot/.test(x.cls); });
      assert.strictEqual(marked.length, 0, '第 ' + (depth + 1) + ' 档开局就替玩家标了位置');
      const labels = vm.cells.map(function (x) { return Number(x.label); }).sort(function (a, b) { return a - b; });
      assert.deepStrictEqual(labels, Array.from({ length: n }, function (_, i) { return i + 1; }), '盘上不是 1…N 各一次');

      // 点错一格的代价随档加重：简单 2 秒，绝境 6 秒。
      const wrongIdx = vm.schulte.order.indexOf(n);
      ctx.c.tap(wrongIdx);
      assert.strictEqual(vm.scoreText, '用时 ' + schulteMod.PENALTIES[depth] + ' 秒',
        '第 ' + (depth + 1) + ' 档点错没有按 ' + schulteMod.PENALTIES[depth] + ' 秒罚时');

      // 点过的格：前三档退成空位（cell--gone），极难起留在盘上（仍是 cell--num）。
      // 这是「同盘面的两档」之间唯一的难度差——它必须真的落到盘面上，不能只写在说明里。
      const firstIdx = vm.schulte.order.indexOf(1);
      ctx.c.tap(firstIdx);
      assert.strictEqual(vm.schulte.next, 2, '点对了「1」却没有前进');
      const gone = vm.cells[firstIdx].cls.indexOf('cell--gone') >= 0;
      assert.strictEqual(gone, params.fade,
        '第 ' + (depth + 1) + ' 档点过的格' + (params.fade ? '没有退场' : '还是退场了'));
      assert.ok(vm.cells[firstIdx].label === '1', '退场那一格的数被抹掉了：玩家回头找不到');

      // 按序点完：中途任何一步都不许冒出新的「下一个」标记。
      for (let v = 2; v <= n; v += 1) {
        const idx = vm.schulte.order.indexOf(v);
        ctx.c.tap(idx);
        const stray = vm.cells.filter(function (x) { return /cell--next/.test(x.cls); });
        assert.strictEqual(stray.length, 0, '点完 ' + v + ' 之后又把下一个标出来了');
      }
      assert.ok(ctx.st.finished, '点完整盘没有结算');
      ctx.c.destroy();
    }
    // 格子数随档不降，且最大到 7×7：8×8 每格只剩 84rpx、字 22rpx，两位数认不快就成了猜。
    for (let i = 1; i < sizes.length; i += 1) {
      assert.ok(sizes[i] >= sizes[i - 1], '第 ' + (i + 1) + ' 档格子比上一档还少：' + sizes.join('/'));
    }
    assert.ok(sizes[sizes.length - 1] <= 49, '盘面超过 7×7：' + sizes.join('/'));
    // 五档里至少四种规格：后三档同为 6×6 的那一版，档差全落在一两秒的秒表上，
    // 而同一尺寸换个布局本来就波动 3–5 秒——那样的五档在体感上是同一局。
    const uniq = {};
    sizes.forEach(function (s) { uniq[s] = true; });
    assert.ok(Object.keys(uniq).length >= 4, '只有 ' + Object.keys(uniq).length + ' 种盘面规格：' + sizes.join('/'));
  } finally { restoreClock(); }
});

check('顺序点格：罚时只吃评级，不提前收场', function () {
  // 失败（F）＝「一局没走完」，判据只能是实际经过的时辰。
  // 旧版把罚时也累进这个判据里，于是绝境档连错四次就能把一局打得不错的人判成 F，
  // 与「点错只是纪录变差」「本门只奖不罚」两句话都相反。
  installClock();
  try {
    const method = data.getMethod('shumu');
    const params = data.buildParams(method, 'full');
    const row = schulteMod.LEVELS[4];
    const ctx = makeCtx(method, {}, params);
    ctx.c.start();
    const vm = ctx.st.vm;
    const n = vm.cells.length;
    const wrongIdx = vm.schulte.order.indexOf(n);
    const times = Math.ceil(row.limit / row.penalty) + 2;
    for (let i = 0; i < times; i += 1) ctx.c.tap(wrongIdx);
    // 先把时钟推过十秒，逼它真的走几拍——若还按「实际 + 罚时」判，这里就该收场了。
    advance(10000);
    assert.strictEqual(ctx.st.finished, null, '罚时把一局判成了失败（F 只该留给「没走完」）');
    assert.ok(vm.timeText && vm.timeText !== '00:00', '时辰被罚时吃空了：倒计时该只走实际时间');
    for (let v = 1; v <= n; v += 1) ctx.c.tap(vm.schulte.order.indexOf(v));
    assert.ok(ctx.st.finished, '点完整盘没有结算');
    assert.strictEqual(ctx.st.finished.grade, 'C', '连错 ' + times + ' 次之后没有落到 C，实为 ' + ctx.st.finished.grade);
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('顺序点格：200 关都留得出 C 带，点完了但慢要有落处', function () {
  // 这一门的时辰不是参数，是「B 线 + 8」现推的。章内按 lineScale 往紧里收时，
  // 一旦把时辰收进 B 线里，C 档就没有落处：玩家过了 B 线却被判失败，
  // 而「C 是走完了但糙」正是这一门唯一给得起的耐心。这个坑在别的门里踩过三次
  // （预算 < 2×最优 → C 档不存在），所以逐关复算，而不是只看五档表头。
  installClock();
  try {
    const method = data.getMethod('shumu');
    for (let lv = 1; lv <= 200; lv += 1) {
      const p = data.buildParamsAt(method, lv);
      const line = schulteMod.lines(p);
      const b = Number(String(line.items[3]).replace(/[^0-9]/g, ''));
      const ctx = makeCtx(method, {}, p);
      ctx.c.start();
      const vm = ctx.st.vm;
      const mm = Number(vm.timeText.slice(0, 2));
      const ss = Number(vm.timeText.slice(3));
      const limit = mm * 60 + ss;
      assert.ok(limit - b >= schulteMod.C_WINDOW,
        '第 ' + lv + ' 关时辰 ' + limit + ' 秒、B 线 ' + b + ' 秒：C 带只剩 ' + (limit - b) + ' 秒');
      ctx.c.destroy();
    }
  } finally { restoreClock(); }
});

check('顺序点格：布局的走盘长度压在带宽内，一局一图', function () {
  // 档与档之间只差 1–3 秒，而同一尺寸换个随机布局的成绩波动就有 3–5 秒。
  // 不控制布局就等于让方差吃掉档差：玩家感受到的是「今天手气」，不是「这档更难」。
  for (let depth = 0; depth < 5; depth += 1) {
    const row = schulteMod.LEVELS[depth];
    const ideal = schulteMod.idealStep(row.size);
    const lo = ideal * (1 - 0.12);
    const hi = ideal * (1 + 0.12);
    let prev = null;
    let same = 0;
    for (let k = 0; k < 40; k += 1) {
      const order = schulteMod.deal(row.size);
      assert.strictEqual(order.length, row.size * row.size, '抽出来的盘少了几格');
      const m = schulteMod.pathMean(row.size, order);
      assert.ok(m >= lo - 1e-9 && m <= hi + 1e-9,
        row.size + '×' + row.size + ' 第 ' + k + ' 局的走盘长度 ' + m.toFixed(2) + ' 秒偏离带宽 ' + lo.toFixed(2) + '–' + hi.toFixed(2));
      if (prev && prev === order.join(',')) same += 1;
      prev = order.join(',');
    }
    // 40 局里连出两次同图的概率应当极低——固定布局会被背下来，这一门就只剩手速。
    assert.ok(same <= 1, row.size + '×' + row.size + ' 的布局重复了 ' + same + ' 次：一局一图退化了');
  }
});

check('按最优步数评级的三门：反悔过就本盘封顶 A', function () {
  // 三门都是「盘面固定 + 复位把计数清零」：不封顶的话「走一步 → 复位 → 再走」
  // 能把最优解白试出来，S 变成「肯反复重来」的奖励，而不是「一步没浪费」。
  // 阵灯推演的感应已改成折步数（每看一眼算 2 步），不再靠封顶兜；复位仍封顶 A。
  const cases = ['lights', 'klotski', 'pushbox'];
  for (const game of cases) {
    const m = data.PRACTICE_METHODS.filter(function (x) { return x.game === game; })[0];
    assert.ok(m, game + ' 没登记成功法');
    const p = data.buildParams(m, 'novice');

    // ① 干净一局：按最优路径走完，应当是 S。
    installClock();
    let clean;
    try {
      clean = makeCtx(m, {}, p);
      clean.c.start();
      drive(clean, game, LIMITS[game][0], LIMITS[game][1]);
      assert.ok(clean.st.finished, game + ' 干净局没走完');
      assert.strictEqual(clean.st.finished.grade, 'S',
        game + ' 一步没浪费却不是 S，断言前提不成立');
      clean.c.destroy();
    } finally { restoreClock(); }

    // ② 同一条路，先按一次复位再走：最高只能 A。
    installClock();
    try {
      const dirty = makeCtx(m, {}, p);
      dirty.c.start();
      assert.strictEqual(typeof dirty.c.reset, 'function', game + ' 没有 reset 接口');
      dirty.c.reset();
      drive(dirty, game, LIMITS[game][0], LIMITS[game][1]);
      assert.ok(dirty.st.finished, game + ' 复位局没走完');
      assert.strictEqual(dirty.st.finished.grade, 'A',
        game + ' 复位过还能拿 S——反悔就没有代价了');
      dirty.c.destroy();
    } finally { restoreClock(); }
  }
});

check('推石入位：撤销只退位置，不退推数', function () {
  installClock();
  try {
    const m = data.getMethod('tuisuo');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'novice'));
    ctx.c.start();
    const plan = pushboxMod.solutionMoves(ctx.st.vm.pushbox.layout) || [];
    assert.ok(plan.length >= 2, '这张图的最优解不到 2 步，断言前提不成立');
    // 解里的前几步可能只是「走人」，先走到第一下真正推箱子为止。
    let pushDir = null;
    for (let i = 0; i < plan.length && !pushDir; i += 1) {
      const before = ctx.st.vm.scoreText;
      ctx.c.move(plan[i]);
      if (ctx.st.vm.scoreText !== before) pushDir = plan[i];
    }
    assert.ok(pushDir, '这条解里没有推箱子的动作，断言前提不成立');
    const atOne = ctx.st.vm.scoreText;
    assert.strictEqual(atOne, '已推 1 次', '第一下推箱子的记账不对：' + atOne);
    ctx.c.undo();
    assert.strictEqual(ctx.st.vm.scoreText, atOne,
      '撤销把推数也退回去了：' + atOne + ' → ' + ctx.st.vm.scoreText);
    // 位置要真的退回去：同一方向再推一次还能推得动，且这次算第二推。
    ctx.c.move(pushDir);
    assert.strictEqual(ctx.st.vm.scoreText, '已推 2 次', '撤销后重推没有记账');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('推石入位：图每局现抽，可解、落在本档区间、同档不是同一张', function () {
  // 起因：这一门原来是五张固定图按档分配，简单永远第一张。图一固定，
  // 第三遍开始玩家记的是答案而不是走法，「先给谁让路」的推演就退化成回忆。
  // 现在档位只给规格（内盘多大、几处阵位、几道内墙、最优推数的区间），图现抽。
  const m = data.getMethod('tuisuo');
  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  const seen = new Set();
  let prevMin = 0;
  let prevBoxes = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const p = data.buildParams(m, keys[i]);
    // 档位表要单调：下界与阵位数都不许往回退，否则「越练越难」只是说法。
    assert.ok(p.minOpt >= prevMin, keys[i] + ' 的最优推数下界比上一档还低');
    assert.ok(p.boxes >= prevBoxes, keys[i] + ' 的阵位数比上一档还少');
    prevMin = p.minOpt;
    prevBoxes = p.boxes;
    for (let j = 0; j < 5; j += 1) {
      const board = pushboxMod.generateBoard(pushboxMod.specOf(p));
      assert.ok(board, keys[i] + ' 抽不出图');
      assert.ok(board.optimal >= p.minOpt && board.optimal <= p.maxOpt,
        keys[i] + ' 抽到的图最优 ' + board.optimal + ' 推，超出本档 ' + p.minOpt + '～' + p.maxOpt);
      // 真能走完：解不出来就是把一张死局丢给玩家，而这一门有失败 F，玩家得付灵石的账。
      assert.ok(pushboxMod.solutionMoves(board.rows), keys[i] + ' 抽到的图走不通');
      // 石箱与阵位必须一一对应：少一处阵位，这一局不用推就完成了。
      const flat = board.rows.join('');
      let boxCount = 0;
      let goalCount = 0;
      for (let k = 0; k < flat.length; k += 1) {
        const ch = flat[k];
        if (ch === 'b' || ch === '*') boxCount += 1;
        if (ch === 'o' || ch === '*' || ch === '+') goalCount += 1;
      }
      assert.strictEqual(boxCount, p.boxes, keys[i] + ' 石箱数与规格不符');
      assert.strictEqual(goalCount, p.boxes, keys[i] + ' 阵位数与规格不符');
      seen.add(flat);
    }
  }
  // 二十五局里至少二十张互不相同：生成器一旦退回「固定几张图」，这条立刻红。
  assert.ok(seen.size >= 20, '25 局只抽出 ' + seen.size + ' 张不同的图，图又固化了');
});

check('落石垒基：10×20 标准场地、7-bag、三块预告、落定延迟与 SRS 踢墙', function () {
  // 这一门的九样东西都查得到出处（Tetris Guideline），这一条逐样验：
  // 场地 10×20、重力表、每 N 层一级、7-bag、三块预告、暂存、落定延迟、踢墙、阶梯计分。
  // 少一样，这一门就退回「块自己掉、人跟着慌」的反应游戏。
  const mod = require('../minigames/blocks.js');
  const params = data.buildParamsAt(data.getMethod('stackstone'), 1);
  installClock();
  try {
    let vm = null;
    let res = null;
    const ctrl = mod.create({
      params: params, difficulty: 1, perks: { tier: 0 }, tip: 't', theme: {},
      render: function (v) { vm = v; }, finish: function (r) { res = r; },
    });
    ctrl.start();

    // ① 场地：10 列 × 20 行。行数不是难度旋钮，削行数等于削掉「留缝」。
    assert.strictEqual(vm.cols, 10, '盘面不是 10 列');
    assert.strictEqual(vm.cells.length, 200, '盘面不是 10×20');
    assert.strictEqual(vm.blocks.rows, 20, 'vm.blocks.rows 不是 20');

    // ② 三块预告：每一块都是四格，且都放得进四乘四的预告格。
    assert.strictEqual(vm.blocks.queue.length, 3, '预告不是三块');
    for (const q of vm.blocks.queue) {
      assert.strictEqual(q.cells.length, 4, '预告里的块不是四格');
      for (const c of q.cells) {
        assert.ok(c[0] >= 0 && c[0] <= 3 && c[1] >= 0 && c[1] <= 3, '预告块放不进 4×4 格');
      }
    }

    // ③ 落点虚影：四格，且只落在空格上。
    const ghosts = vm.cells.filter(function (c) { return String(c.cls).indexOf('cell--ghost') >= 0; });
    assert.strictEqual(ghosts.length, 4, '落点虚影不是四格（' + ghosts.length + '）');
    for (const g of ghosts) assert.ok(!g.label, '虚影格不该带内容');

    // ④ 7-bag：每一包都恰好七个形状各一个。
    for (let k = 0; k < 30; k += 1) {
      assert.deepStrictEqual(mod.bagOf().slice().sort(), [0, 1, 2, 3, 4, 5, 6], '这一包不是七种各一');
    }
    assert.strictEqual(mod.SHAPES.length, 7, '块型不是七种');

    // ⑤ 重力表：1 级 1 秒一格，15 级 7 毫秒（20G），再往上不再变。
    assert.strictEqual(mod.gravityOf(1), 1000);
    assert.strictEqual(mod.gravityOf(2), 793);
    assert.strictEqual(mod.gravityOf(15), 7);
    assert.strictEqual(mod.gravityOf(99), 7, '15 级以上还在加速');
    for (let lv = 2; lv <= 15; lv += 1) {
      assert.ok(mod.gravityOf(lv) < mod.gravityOf(lv - 1), '重力表第 ' + lv + ' 级没有更快');
    }

    // ⑥ 每 N 层一级 + 阶梯计分（× 级数，四行连出 1.5 倍）。
    assert.strictEqual(mod.levelOf(0, 1, 10), 1);
    assert.strictEqual(mod.levelOf(9, 1, 10), 1, '不到 10 层就升级了');
    assert.strictEqual(mod.levelOf(10, 1, 10), 2);
    assert.strictEqual(mod.levelOf(10, 4, 5), 6, '起手级数与每级层数没算进级数');
    assert.strictEqual(mod.clearScore(1, 1, false), 100);
    assert.strictEqual(mod.clearScore(2, 1, false), 300);
    assert.strictEqual(mod.clearScore(4, 1, false), 800);
    assert.strictEqual(mod.clearScore(4, 3, false), 2400, '四行没乘级数');
    assert.strictEqual(mod.clearScore(4, 3, true), 3600, '连续四行没有 1.5 倍');
    assert.strictEqual(mod.clearScore(4, 3, true) > mod.clearScore(3, 3, true), true);

    // ⑦ 落定延迟：落地之后还能挪，500ms 才写进盘面（旧版是撞到就锁，慢半拍等于白放）。
    const filled = function () { return vm.blocks.board.filter(function (v) { return v; }).length; };
    // 用导出的 cellsFit 判「这一块能不能再往下一格」：落地那一刻就是落定计时开始，
    // 不能靠「r 不再变」去猜——那要跨过一个完整的重力间隔，落定早就在窗口里发生了。
    const restingNow = function () {
      const pc = vm.blocks.piece;
      return !pc || !mod.cellsFit(vm.blocks.board, 10, 20, pc.cells, pc.r + 1, pc.c);
    };
    let guard = 0;
    while (guard < 400 && vm.blocks.piece && !restingNow()) {
      guard += 1;
      advance(100);
    }
    assert.strictEqual(filled(), 0, '还没到落定延迟就写进盘面了');
    assert.ok(vm.blocks.piece, '落地的块被直接抹掉了');
    const colBefore = vm.blocks.piece.c;
    ctrl.move('left');
    assert.notStrictEqual(vm.blocks.piece.c, colBefore, '落地后挪不动（没有落定延迟）');
    advance(300);
    assert.strictEqual(filled(), 0, '落定延迟不足 500ms');
    advance(250);
    assert.ok(filled() > 0, '过了 500ms 还没落定');

    // ⑧ 暂存：换出来的块回到出生朝向，同一块只能暂存一次。
    const shapeNow = vm.blocks.piece.shape;
    ctrl.move('hold');
    assert.ok(vm.blocks.hold, '暂存里没有块');
    assert.strictEqual(vm.blocks.hold.shape, shapeNow, '暂存的不是刚才那一块');
    assert.strictEqual(vm.blocks.holdUsed, true, '暂存没有记成「这一块已用掉」');
    const holdShape = vm.blocks.hold.shape;
    ctrl.move('hold');
    assert.strictEqual(vm.blocks.hold.shape, holdShape, '同一块被暂存了两次');

    // ⑨ SRS 踢墙：贴着障碍转不动时，按表上的顺位踢开，而不是直接判「转不动」。
    const T = mod.SHAPES.filter(function (s) { return s.key === 'T'; })[0];
    const board = new Array(200).fill(0);
    // 挡住「原地转」新占的那一格：T 原地转之后会往右多伸出一格，正好压在这块石上。
    board[5 * 10 + 1] = 1;
    const pc = { shape: T, rot: 0, cells: T.cells.map(function (x) { return x.slice(); }), tone: 3, r: 3, c: 0 };
    const moved = mod.planRotation(board, 10, 20, pc);
    assert.ok(moved, '贴着一格障碍就完全转不动了（没有踢墙）');
    // 原地转被挡，SRS 的第二顺位是「左移一格」——踢墙表真的被读走了。
    assert.deepStrictEqual([moved.r - pc.r, moved.c - pc.c], [0, -1], '没有按 SRS 的第二顺位（左移一格）踢墙');
    assert.strictEqual(moved.rot, 1, '转完的朝向不对');
    // 空盘上不该乱踢：原地转就够，偏移必须是 [0, 0]。
    const free = new Array(200).fill(0);
    const noKick = mod.planRotation(free, 10, 20, pc);
    assert.deepStrictEqual([noKick.r - pc.r, noKick.c - pc.c], [0, 0], '空盘上也踢墙了');
    assert.strictEqual(mod.cellsFit(board, 10, 20, moved.cells, moved.r, moved.c), true, '踢完还压着障碍');
    // 四个顺时针档、每档五个偏移，第一个是「原地转」。
    assert.strictEqual(mod.KICKS_JLSTZ.length, 4);
    for (const set of mod.KICKS_JLSTZ.concat(mod.KICKS_I)) {
      assert.strictEqual(set.length, 5, '踢墙表不是五个偏移');
      assert.deepStrictEqual(set[0], [0, 0], '第一个偏移不是原地转');
    }

    // ⑩ 满行判定与化层仍然是对的（纯函数，页面与测试同一份）。
    const b2 = new Array(10 * 4).fill(0);
    for (let c = 0; c < 10; c += 1) b2[3 * 10 + c] = 1;
    for (let c = 0; c < 10; c += 1) b2[2 * 10 + c] = 2;
    b2[10] = 1;
    assert.deepStrictEqual(mod.fullRows(b2, 10, 4), [2, 3], '满行报错');
    assert.strictEqual(mod.clearLines(b2, 10, 4).lines, 2, '化的行数与满行不符');

    // ⑪ 结束：中途结束只该报中途结束这一个 F，不能把「时间到」也判成失败。
    ctrl.destroy();
    assert.strictEqual(res, null, '还没结束就结算了');
  } finally {
    restoreClock();
  }
});

check('同数相合：合并处迸溅、合并格弹、新块由小长出来', function () {
  // 2048 的反馈只该给「合成了」：每一手都弹字，玩家半分钟就学会无视。
  // 这里真的推几手，验「合过的地方有粒子 + 合并格带 pop 类 + 新块带 fresh 类」。
  const mod = require('../minigames/merge.js');
  const params = data.buildParamsAt(data.getMethod('heyuan'), 1);
  let vm = null;
  const ctrl = mod.create({
    params: params, difficulty: 1, perks: { tier: 0 }, tip: 't', theme: {},
    render: function (v) { vm = v; }, finish: function () {},
  });
  ctrl.start();
  let sawMerge = false;
  let sawFresh = false;
  const dirs = ['left', 'up', 'right', 'down'];
  for (let i = 0; i < 40 && !sawMerge; i += 1) {
    const before = vm.cleared ? vm.cleared.key : 0;
    ctrl.move(dirs[i % 4]);
    const pops = vm.cells.filter(function (c) { return /cell--pop\d/.test(c.cls); });
    if (pops.length) {
      sawMerge = true;
      // 合并的格一定同时是「这一手收走/生成的位置」，页面靠它算粒子坐标。
      assert.ok(vm.cleared && vm.cleared.key > before, '合并了却没交出位置，粒子无处可落');
      assert.ok(pops.length <= vm.cleared.cells.length, '弹的格比合并的格还多');
    }
    if (vm.cells.some(function (c) { return /cell--fresh\d/.test(c.cls); })) sawFresh = true;
  }
  assert.ok(sawMerge, '推了 40 手一次合并都没被标出来');
  assert.ok(sawFresh, '新块从来没有出场标记');
  ctrl.destroy();
});

check('牵灵引线：连上的那一对真的画得出一条折线', function () {
  // 连连看考的是「能不能连上」。牌直接消失时，玩家只看得到结果，
  // 看不到它是从上边绕过去的 —— 于是这一门最该被学会的那条判法永远学不会。
  const mod = require('../minigames/link.js');
  const cols = 6;
  const rows = 4;
  const n = cols * rows;
  function mk(list) {
    const b = new Array(n).fill(0);
    for (const x of list) b[x[0]] = x[1];
    return b;
  }
  // 贴着的两枚：路径两点，一段。
  const near = mk([[0, 1], [1, 1]]);
  const p1 = mod.findPath(near, cols, rows, 0, 1);
  assert.ok(p1 && p1.length === 2, '相邻同纹找不到两点路径');
  // 中间挡着别的纹、上下被围：只能从盘外绕，四个转折点。
  const around = mk([[0, 1], [1, 2], [2, 2], [3, 1],
    [6, 3], [7, 3], [8, 3], [9, 3], [12, 3], [13, 3], [14, 3], [15, 3]]);
  const p2 = mod.findPath(around, cols, rows, 0, 3);
  assert.ok(p2 && p2.length >= 3, '绕行的连线找不到');
  // 相邻两点必定同行或同列：页面因此只画横线竖线，不用算角度。
  for (let i = 1; i < p2.length; i += 1) {
    const a = p2[i - 1];
    const b = p2[i];
    assert.ok(a.r === b.r || a.c === b.c, '路径里出现了斜线');
  }
  assert.ok(p2.some(function (p) { return p.r === 0 || p.c === 0; }), '这次绕行没有出盘面');
  // 判定与路径必须是同一个函数：两套实现迟早会分叉。
  assert.strictEqual(mod.canLink(around, cols, rows, 0, 3), true);
  assert.strictEqual(mod.findPath(near, cols, rows, 0, 2), null, '不同纹也给了路径');

  // 折数是段间难度轴：同一张盘，两折能从盘外绕通、一折接不上。
  // 若只剩默认两折在跑，这条会红——参数生成了却没人读的情况必须被挡住。
  assert.ok(mod.findPath(around, cols, rows, 0, 3, 2), '两折的绕行盘不通');
  assert.strictEqual(mod.findPath(around, cols, rows, 0, 3, 1), null, '一折也能绕盘外，折数没生效');
  assert.ok(mod.findPath(near, cols, rows, 0, 1, 1), '一折连相邻同纹都不通');
  // findPair 也要吃折数，否则「提示说能连、点上去连不上」。
  assert.deepStrictEqual(mod.findPair(around, cols, rows, null, 2), [0, 3], '两折没找到那对绕行的');
  // 一折下盘里仍有一对相邻同纹（索引 1/2），但不该再是那对要靠盘外绕行的 0/3。
  const oneTurnPair = mod.findPair(around, cols, rows, null, 1);
  assert.ok(oneTurnPair && (oneTurnPair[0] !== 0 || oneTurnPair[1] !== 3),
    '一折下 findPair 把绕行盘的那对也报成可连');
});

check('牵灵引线：派牌只按纹种均分，段内台阶由每对预算承担', function () {
  const mod = require('../minigames/link.js');
  const m = data.getMethod('linkpair');
  const sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  // 均分派牌：总数守恒、纹种数不变、每种最多差一对（余数从第一种往后加）。
  for (const spec of [[12, 4], [12, 5], [12, 6], [21, 6], [35, 6]]) {
    const cs = mod.pairCounts(spec[0], spec[1]);
    assert.strictEqual(cs.length, spec[1], '派牌把纹种挤掉了');
    assert.strictEqual(sum(cs), spec[0], '派牌改了总对数');
    assert.ok(cs.every(function (x) { return x >= 1; }), '有一种纹被挤没了');
    assert.ok(Math.max.apply(null, cs) - Math.min.apply(null, cs) <= 1, '派牌不再均分（布纹偏斜回来了）');
  }
  // 布纹偏斜已退役：它把同纹组合数从 15 抬到 66，可连量反而变多。签名里不许再有 weave。
  assert.strictEqual(mod.pairCounts.length, 2, 'pairCounts 又收了一个「偏斜档」参数');
  // 段内台阶：每一段的每对预算都逐关收紧，且段末接上下一段段首。
  const stages = require('../data/levels.js').STAGES;
  for (let i = 0; i < stages.length; i += 1) {
    const a = data.linkPerPairAt(stages[i].from);
    const b = data.linkPerPairAt(stages[i].to);
    assert.ok(b < a, '第 ' + (i + 1) + ' 段的每对预算没有收紧');
    assert.ok((a - b) / a >= 0.05, '第 ' + (i + 1) + ' 段每对只收了 ' + ((a - b) / a * 100).toFixed(1) + '%');
    if (i > 0) {
      assert.ok(Math.abs(a - data.linkPerPairAt(stages[i - 1].to)) < 1e-9,
        '第 ' + (i + 1) + ' 段的段首没接上上一段段末，会凭空多一个台阶');
    }
  }
  // 真开局：满盘、有解、纹种数真的到了 params 里那个数。
  const freshAt = function (lv) {
    const p = data.buildParamsAt(m, lv);
    let vm = null;
    const c = index.createGame('link', {
      params: p, difficulty: 'novice', perks: { tier: 0 }, tip: m.tip, twist: m.twist,
      theme: themes.themeOf(m.id, m.game),
      render: function (v) { vm = v; }, finish: function () {},
    });
    c.start();
    const counts = {};
    vm.link.board.forEach(function (v) { if (v) counts[v] = (counts[v] || 0) + 1; });
    assert.strictEqual(Object.keys(counts).length, p.kinds, '开局纹种数不对');
    assert.ok(mod.findPair(vm.link.board, vm.link.cols, vm.link.rows), '开局无可连对');
    assert.strictEqual(vm.link.board.length, p.cols * p.rows, '满盘格数不对');
    c.destroy();
    return vm.link.board.length;
  };
  assert.strictEqual(freshAt(1), 24, '未入门不是 4×6');
  assert.strictEqual(freshAt(201), 42, '大成不是 7×6');
  assert.strictEqual(freshAt(1000), 70, '圆满不是 10×7');
});

// 评级改看「收干净那一刻剩几息」之后，四档必须都能真打出来。旧版按分数评，
// 最低完成分 1200 > A 线 1199，B 与 C 是死线；这里把剩余息分别压到四条线上再收干净。
check('牵灵引线：S / A / B / C 四档都真的拿得到，未收干净才是 F', function () {
  const mod = require('../minigames/link.js');
  const m = data.getMethod('linkpair');
  const params = data.buildParams(m, 'novice');
  const g = mod.gradeLefts(params.duration);
  assert.ok(g.s > g.a && g.a > g.b && g.b > 0, '三条线挤在一起，C 带没了');
  assert.deepStrictEqual([g.s, g.a, g.b, g.b - 1].map(function (x) {
    return mod.gradeByLeft(x, params.duration);
  }), ['S', 'A', 'B', 'C']);
  const ls = mod.lines(params);
  // 前四条是 S/A/B/C，第五条是「本段容错」（自移 / 照纹各几次）。
  assert.strictEqual(ls.items.length, 5, '说明页少一条评级线或容错那行');
  assert.ok(ls.fail.indexOf('F') >= 0, '缺失败线：C 与 F 是两个结论');
  assert.ok(!/分/.test(ls.rule), '评级说明还在讲分数');

  installClock();
  try {
    const playTo = function (left) {
      let vm = null;
      let fin = null;
      const c = index.createGame('link', {
        params: params, difficulty: 'novice', perks: { tier: 0 }, tip: m.tip, twist: m.twist,
        theme: themes.themeOf(m.id, m.game),
        render: function (v) { vm = v; }, finish: function (r) { fin = r; },
      });
      c.start();
      const leftOf = function () { return Number(vm.progressText.replace(' 息', '')); };
      let guard = 0;
      while (leftOf() > left && guard < 200) {
        guard += 1;
        // 照纹每次少 2 息；差 1 息时走一秒，别把剩余息压穿到 0（那是失败）。
        if (leftOf() - left >= 2) c.hint();
        else advance(1000);
      }
      assert.strictEqual(leftOf(), left, '没能把剩余息压到 ' + left);
      let steps = 0;
      while (!fin && steps < 40) {
        steps += 1;
        const p = mod.findPair(vm.link.board, vm.link.cols, vm.link.rows);
        if (!p) break;
        c.tap(p[0]);
        c.tap(p[1]);
      }
      const grade = fin ? fin.grade : null;
      c.destroy();
      return grade;
    };
    assert.strictEqual(playTo(g.s), 'S', '剩 ' + g.s + ' 息没给 S');
    assert.strictEqual(playTo(g.a), 'A', '剩 ' + g.a + ' 息没给 A');
    assert.strictEqual(playTo(g.b), 'B', '剩 ' + g.b + ' 息没给 B');
    assert.strictEqual(playTo(g.b - 1), 'C', '剩 ' + (g.b - 1) + ' 息没给 C：C 是死线');
  } finally { restoreClock(); }
});

check('牵灵引线：局内不报「已入 S」，时辰到还剩对子才是失败 F', function () {
  const mod = require('../minigames/link.js');
  const m = data.getMethod('linkpair');
  const params = data.buildParams(m, 'novice');
  installClock();
  try {
    let vm = null;
    let fin = null;
    const c = index.createGame('link', {
      params: params, difficulty: 'novice', perks: { tier: 0 }, tip: m.tip, twist: m.twist,
      theme: themes.themeOf(m.id, m.game),
      render: function (v) { vm = v; }, finish: function (r) { fin = r; },
    });
    c.start();
    for (let i = 0; i < 9; i += 1) {
      const p = mod.findPair(vm.link.board, vm.link.cols, vm.link.rows);
      assert.ok(p, '第 ' + (i + 1) + ' 对找不到');
      c.tap(p[0]);
      c.tap(p[1]);
      advance(500);
    }
    assert.ok(!fin, '才收 9 对就结算了');
    assert.ok(!/已入 S/.test(vm.goal || ''), 'HUD 又在收完之前宣布 S，结算却会给 F');
    // 还差几对从盘面自己数：这一门的对数是「(格数 − 盘形空位) / 2」，不是固定的 10 / 16 / 22 对。
    const left = vm.link.pairs - 9;
    assert.ok(new RegExp('还差 ' + left + ' 对').test(vm.goal), 'HUD 没报还差几对');
    assert.ok(/S 线要剩/.test(vm.goal), 'HUD 没报 S 线要剩几息');
    assert.strictEqual(vm.extras.showGradeNow, false, '局内评级徽章又被打开了');
    advance(80000);
    assert.ok(fin, '时辰到没结算');
    assert.strictEqual(fin.grade, 'F', '没收干净却给了 ' + fin.grade);
    assert.ok(/还剩/.test(fin.summary), '失败的结算没说清是没走完');
    c.destroy();
  } finally { restoreClock(); }
});

check('牵灵引线：照纹按段位收费、双照一次照见两对、点空地不罚息', function () {
  const mod = require('../minigames/link.js');
  const m = data.getMethod('linkpair');
  const params = data.buildParams(m, 'novice');
  const open = function (tier) {
    let vm = null;
    let fin = null;
    const c = index.createGame('link', {
      params: params, difficulty: 'novice', perks: { tier: tier }, tip: m.tip, twist: m.twist,
      theme: themes.themeOf(m.id, m.game),
      render: function (v) { vm = v; }, finish: function (r) { fin = r; },
    });
    c.start();
    return { c: c, vm: function () { return vm; }, fin: function () { return fin; } };
  };
  const lit = function (vm) {
    return vm.cells.filter(function (x) { return /cell--hintpair/.test(x.cls); }).length;
  };
  installClock();
  try {
    const a = open(0);
    assert.strictEqual(a.vm().progressText, params.duration + ' 息');
    a.c.hint();
    assert.strictEqual(a.vm().progressText, (params.duration - 2) + ' 息', '照纹没扣 2 息');
    assert.strictEqual(a.vm().fx.text, '照纹 · 少 2 息', '代价写进了看不见的 vm.status');
    assert.strictEqual(lit(a.vm()), 2, '照纹没照见一对');
    a.c.destroy();

    const b = open(3);
    b.c.hint();
    assert.strictEqual(b.vm().progressText, (params.duration - 1) + ' 息', '大成起照纹不该免费');
    assert.strictEqual(b.vm().fx.text, '照纹 · 少 1 息');
    b.c.destroy();

    // 大圆满「双照」要照见两对不同的灵石；盘面随机，抽到只有一对可连的开局就重开。
    let twin = false;
    for (let t = 0; t < 12 && !twin; t += 1) {
      const c = open(5);
      const board = c.vm().link.board;
      const cols = c.vm().link.cols;
      const rows = c.vm().link.rows;
      const p1 = mod.findPair(board, cols, rows);
      const skip = {};
      if (p1) { skip[p1[0]] = true; skip[p1[1]] = true; }
      const p2 = p1 && mod.findPair(board, cols, rows, skip);
      if (p1 && p2) {
        c.c.hint();
        assert.strictEqual(c.vm().fx.text, '双照 · 少 1 息', '大圆满没一次照见两对');
        assert.strictEqual(lit(c.vm()), 4, '两对不同的灵石没同时亮起来');
        assert.strictEqual(c.vm().progressText, (params.duration - 1) + ' 息', '双照仍要付 1 息');
        twin = true;
      }
      c.c.destroy();
    }
    assert.ok(twin, '连开 12 局都没抽到「至少两对可连」的盘，双照没法验');

    // 空地是通路，不是牌：收走一对之后点它只把已选的那枚放下，不罚息。
    const d = open(0);
    const pair = mod.findPair(d.vm().link.board, d.vm().link.cols, d.vm().link.rows);
    assert.ok(pair, '开局没有可连的一对');
    d.c.tap(pair[0]);
    d.c.tap(pair[1]);
    const before = d.vm().progressText;
    const chip = d.vm().link.board.findIndex(function (v) { return v > 0; });
    d.c.tap(chip);
    d.c.tap(pair[0]);
    assert.strictEqual(d.vm().progressText, before, '点空地被当成错配扣息了');
    assert.ok(!/少 2 息/.test(d.vm().fx.text), '点空地不该报错配');
    d.c.destroy();
  } finally { restoreClock(); }
});

check('三连互换：一手分成「留空」与「落下」两个拍子，中间不许塌成一帧', function () {
  // 这一门收完立刻补满，盘面前后两帧都是满的：玩家靠什么知道「刚才收在哪儿」？
  // 只有中间真的空过一段。全压进一次渲染，盘面从满的跳到满的，
  // 看得见的只有浮字——连锁三层和一层在屏幕上长得一模一样。
  const mod = require('../minigames/match.js');
  installClock();
  try {
    let vm = null;
    const ctrl = mod.create({
      params: data.buildParamsAt(sanxiu(), 1),
      difficulty: 1, perks: { tier: 0 }, tip: 't', theme: {},
      render: function (v) { vm = v; }, finish: function () {},
    });
    ctrl.start();
    const cols = vm.cols;
    const rows = vm.match.rows;

    // 无效互换：两格抖一下，不许留下空格（抖完牌得回原位）。
    ctrl.tap(0);
    ctrl.tap(1);
    const shook = vm.cells.filter(function (c) { return /cell--shake\d/.test(c.cls); }).length;
    const clearedAfterBad = vm.cells.filter(function (c) { return c.cls.indexOf('cell--clear') >= 0; }).length;
    if (shook) {
      assert.strictEqual(shook, 2, '无效互换该抖两格，实际抖了 ' + shook + ' 格');
      assert.strictEqual(clearedAfterBad, 0, '无效互换把格子留空了');
    }
    advance(1200);

    // 有效互换：第一拍是「收走、留空」，牌和 label 都得从这几格撤掉。
    const move = mod.findMove(vm.match.board.slice(), cols, rows);
    assert.ok(move, '开局没有可行换位，这一门不该发出这种盘');
    ctrl.tap(move[0]);
    ctrl.tap(move[1]);
    const gone = vm.cells.filter(function (c) { return c.cls.indexOf('cell--clear') >= 0; });
    assert.ok(gone.length >= 3, '收走之后盘面上没有空格帧（空了 ' + gone.length + ' 格）');
    assert.ok(gone.every(function (c) { return c.crest === 0; }), '空格子上还挂着牌');
    // 空格的 label 会漏到屏幕上：paint 原来写 GLYPHS[v-1] || GLYPHS[0]，
    // v 为 0 时回落到第一张牌，wxml 在 crest / emblem 都为 0 时把 label 当文字画出来。
    assert.ok(gone.every(function (c) { return c.label === ''; }), '空格子上屏了字符');
    // 演出中不收输入：牌还在飞的时候点下一手，点到的是「即将被换掉」的位置。
    ctrl.tap(move[0]);
    assert.strictEqual(vm.match.first, -1, '演出中还能选中下一格');

    // 空格帧必须真的占住一段时间，不然等于没演。
    advance(120);
    assert.ok(vm.cells.some(function (c) { return c.cls.indexOf('cell--clear') >= 0; }),
      '空格帧不到 120ms 就被补上了，玩家看不到「这里少了三株」');

    // 第二拍：落下。每一格都要带距离与时长，两者缺一就退回「牌闪了一下」。
    // 推到 1420ms：空格帧在 170ms 处收，最短的一列也要 120ms 才落定，这一段一定在落。
    advance(100);
    const fell = vm.cells.filter(function (c) { return /cell--fall\d/.test(c.cls); });
    assert.ok(fell.length >= 3, '落下来这一拍没有任何一格在动（只有 ' + fell.length + ' 格）');
    assert.ok(fell.every(function (c) { return c.fall > 0 && c.fd > 0; }),
      '下落缺距离或时长：一格和十格会用同一个时长，读成瞬移');
    assert.strictEqual(vm.cells.filter(function (c) { return c.cls.indexOf('cell--clear') >= 0; }).length, 0,
      '落下之后盘面上还留着空格');
    assert.ok(fell.every(function (c) { return c.crest > 0; }), '落下来的格子上没有牌');

    // 一路演到底：连锁有几层都行，收场时盘面必须满了。
    advance(12000);
    assert.ok(vm.cells.every(function (c) { return c.crest > 0 && c.label !== ''; }),
      '一局打完盘面上还有空格或缺 label 的格子');
    assert.ok(vm.cells.every(function (c) { return c.cls.indexOf('cell--fall') < 0; }),
      '落到最后还有格子挂着下落类名');

    // 补苗的格数必须等于消掉后空出来的格数：少补一格，盘面会永久缺一块。
    const bc = 5;
    const br = 5;
    const board = new Array(bc * br).fill(0);
    for (let i = 0; i < board.length; i += 1) board[i] = (i % 3) + 1;
    board[20] = 0;
    board[21] = 0;
    board[22] = 0;
    const fills = [];
    const out = mod.collapse(board, bc, br, 5, fills);
    assert.strictEqual(fills.length, 3, '补苗格数与空格数不符');
    assert.ok(out.every(function (v) { return v > 0; }), '补完之后盘上还有空格');

    // 新苗从盘面外掉进来，掉几格必须报出来：报成 0 就等于「凭空出现」。
    const nc = 3;
    const nr = 4;
    const empty = new Array(nc * nr).fill(0);
    for (let i = 0; i < empty.length; i += 1) empty[i] = 1 + (i % 3);
    for (let r = 0; r < nr; r += 1) empty[r * nc] = 0;
    const nf = [];
    const nm = [];
    mod.collapse(empty, nc, nr, 3, nf, nm);
    assert.strictEqual(nf.length, nr, '整列清空该补 ' + nr + ' 株');
    assert.strictEqual(nm[0], 1, '顶行的新苗该按「从盘外掉 1 格」报距离');
    assert.strictEqual(nm[(nr - 1) * nc], nr, '最底行的新苗该按「从盘外掉 ' + nr + ' 格」报距离');
    ctrl.destroy();
  } finally { restoreClock(); }
});

check('三连互换：石皮封印格换不动、不扣息、收走才解封，重排用尽只变贵不判负', function () {
  // 这两条从第二段起逐段加密。它们的共同失败方式是「生成了但没生效」：
  // 参数进了表、盘上没画、点了没反应，或者反过来——点了就扣息，玩家会以为自己换错了。
  const mod = require('../minigames/match.js');
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'minigames', 'match.js'), 'utf8');
  installClock();
  try {
    const mk = function (lv) {
      let vm = null;
      const ctrl = mod.create({
        params: data.buildParamsAt(sanxiu(), lv),
        difficulty: 3, perks: { tier: 0 }, tip: 't', theme: {},
        render: function (v) { vm = v; }, finish: function () {},
      });
      ctrl.start();
      // 圆满段开局要先二选一劫变才发盘。这里挑不改石皮数的那条，
      // 好让「封印格数按段 2/5/9/14」这条断言仍然只量段表，不掺劫变。
      if (vm.twistPick && vm.twistPick.length) {
        const keepSeal = vm.twistPick.find(function (x) { return x.id === 'flood' || x.id === 'haste'; })
          || vm.twistPick[0];
        ctrl.pickTwist(keepSeal.id);
      }
      return { ctrl: ctrl, vm: vm };
    };
    const sealedIdx = function (vm) {
      const out = [];
      for (let i = 0; i < vm.cells.length; i += 1) {
        if (vm.cells[i].cls.indexOf('cell--sealed') >= 0) out.push(i);
      }
      return out;
    };
    const secs = function (vm) { return vm.timeText; };

    // 首段一格都不许封：第一段要先把「换两株凑三连」教会，加点石头就是干扰。
    const early = mk(1);
    assert.strictEqual(sealedIdx(early.vm).length, 0, '首段就出现了石皮（规则加法提前了）');
    early.ctrl.destroy();

    // 段二起逐段加密（2 / 5 / 9 / 14）：数量必须是「本段一直是这样」，不是逐关随机。
    const entry = mk(11);
    assert.strictEqual(sealedIdx(entry.vm).length, 2, '入门段封印格数不是 2');
    entry.ctrl.destroy();
    const minor = mk(51);
    assert.strictEqual(sealedIdx(minor.vm).length, 5, '小成段封印格数不是 5');
    minor.ctrl.destroy();

    const major = mk(201);
    const sealed = sealedIdx(major.vm);
    assert.strictEqual(sealed.length, 9, '大成段封印格数是 ' + sealed.length + '，不是 9');
    const full = mk(501);
    assert.strictEqual(sealedIdx(full.vm).length, 14, '圆满段封印格数不是 14');
    full.ctrl.destroy();

    // 点石皮：不选中、不扣息、当场说清是哪一格。
    const before = secs(major.vm);
    const firstBoard = major.vm.match.board.slice();
    major.ctrl.tap(sealed[0]);
    assert.strictEqual(major.vm.match.first, -1, '石皮格被选中了，接下来会真的尝试换位');
    assert.strictEqual(secs(major.vm), before, '点了一下石皮就扣息了（玩家会以为自己换错了）');
    assert.ok(major.vm.fx && /石皮/.test(major.vm.fx.text), '点了石皮没有任何说明，玩家只看到「没反应」');
    // 石皮格当起点也不行：先选旁边一格，再点石皮，两边都不许动。
    const neighbour = sealed[0] % major.vm.match.cols > 0 ? sealed[0] - 1 : sealed[0] + 1;
    major.ctrl.tap(neighbour);
    major.ctrl.tap(sealed[0]);
    assert.deepStrictEqual(major.vm.match.board, firstBoard, '石皮格被换动了');
    assert.strictEqual(secs(major.vm), before, '拿石皮格换位扣了息');
    advance(1200);
    assert.deepStrictEqual(major.vm.match.board, firstBoard, '石皮格的牌在演出之后又变了');

    // 石皮不能把开局盘做成死盘：create 里挑完格必须复验还有可行换位。
    // 这里从「能换的那一半」找一步，找到就必须真能换（不是把石头也当成可换格）。
    const cols = major.vm.match.cols;
    const rows = major.vm.match.rows;
    const sealedSet = {};
    sealed.forEach(function (i) { sealedSet[i] = true; });
    const move = mod.findMove(major.vm.match.board.slice(), cols, rows,
      major.vm.cells.map(function (c) { return c.cls.indexOf('cell--sealed') >= 0; }));
    assert.ok(move, '大成段开局没有可行换位（挑石皮时没复验）');
    assert.ok(move.every(function (i) { return !sealedSet[i]; }),
      'findMove 把石皮格当成了可换格');
    // 收走石皮格的牌即解封：牌一换位、成三连，那格就该从 sealed 名单里掉出去。
    const left0 = major.vm.timeText;
    major.ctrl.tap(move[0]);
    major.ctrl.tap(move[1]);
    advance(14000);
    assert.ok(sealedIdx(major.vm).length <= 9, '收牌之后封印格反而变多了');
    assert.ok(major.vm.timeText !== left0, '一手打完时辰没有动（表没在走）');
    major.ctrl.destroy();

    // 重排限次是「原价 N 次 + 用尽翻倍 + 不判负」，三条缺一就变成另一条规则。
    // 死局是随机的，测不出稳定复现，只能在源码这一层钉住这三句。
    assert.ok(/shufflesLeft > 0 \? realShuffleCost : realShuffleCost \* 2/.test(src),
      '重排用尽之后没有翻倍');
    assert.ok(/if \(shufflesLeft > 0\) shufflesLeft -= 1/.test(src),
      '重排没有计次');
    const rsh = src.slice(src.indexOf('function reshuffle'), src.indexOf('function reshuffle') + 900);
    assert.ok(!/finishOnce\(|finish\(/.test(rsh), '重排用尽把这一局判负了（死局是运气，不许罚运气）');
  } finally { restoreClock(); }
});

check('三连互换：灵种不能换、不进三连、随空位下落，落底即收并收工', function () {
  // 圆满段的目标从「数颜色」换成了「引苗落底」：盘上几枚灵种全落到底行才算达成。
  // 这一条的失败方式是「参数进了表、盘上没摆」或「摆了但永远不动」——
  // 前者玩家看不到目标，后者目标变成做不到的数。两头都得钉住。
  const mod = require('../minigames/match.js');
  installClock();
  try {
    // 纯函数层：灵种不是特效、不进三连、跟着 collapse 往下走。
    assert.ok(mod.isSeed(mod.FX.seed) && !mod.isSeed(mod.FX.row), 'isSeed 认错了牌');
    assert.ok(!mod.isFx(mod.FX.seed), '灵种被当成了特效（玩家能拿它当炸弹使）');
    // 第一列整列是灵种：只要它被当成一种「牌」，这里就会读出一条竖三连。
    // 其余两列各不相同，保证这条断言只可能因为灵种而红。
    const nb = [mod.FX.seed, 1, 2, mod.FX.seed, 2, 3, mod.FX.seed, 3, 1];
    assert.strictEqual(mod.matchesOf(nb, 3, 3).length, 0, '灵种被算进了三连');
    const cb = new Array(9).fill(1);
    cb[0] = mod.FX.seed;
    cb[3] = 0;
    assert.strictEqual(mod.collapse(cb, 3, 3, 4, null, null)[3], mod.FX.seed,
      '灵种没跟着下方的空位落下来（它会永远停在原格）');
    assert.deepStrictEqual(mod.seedsAtBottom([1, 1, 1, 1, 1, 1, 1, 1, mod.FX.seed], 3, 3), [8],
      'seedsAtBottom 没认出底行那一枚');
    // 本列塌一格，灵种沉一格；没塌的列不许动。
    // 这一条是「灵种会动」的唯一真源：只靠 collapse 的按空位下压，
    // 随机盘上下半部几乎不参与消除，灵种会永远停在原格（实测 200 局 0 次落底）。
    const sb = [1, 2, 1, 2, 1, 2, 1, 2, 1];
    sb[3] = mod.FX.seed;
    mod.sinkSeeds(sb, 3, 3, [1, 0, 0], null);
    assert.strictEqual(sb[6], mod.FX.seed, '本列塌了，灵种却没往下沉');
    assert.strictEqual(sb[3], 1, '灵种沉下去之后，原位没换成下面那一张（等于凭空多出一格）');
    const sb2 = [1, 2, 1, 2, 1, 2, 1, 2, 1];
    sb2[3] = mod.FX.seed;
    mod.sinkSeeds(sb2, 3, 3, [0, 0, 0], null);
    assert.strictEqual(sb2[3], mod.FX.seed, '这一列没塌，灵种却动了');

    // 圆满段盘上要有 goalCount 枚灵种，且都不在底行（摆底行等于目标白给）。
    let vm = null;
    const p = data.buildParamsAt(sanxiu(), 501);
    const ctrl = mod.create({
      params: p, difficulty: 4, perks: { tier: 4 }, tip: 't', theme: {},
      render: function (v) { vm = v; }, finish: function () {},
    });
    ctrl.start();
    if (vm.twistPick && vm.twistPick.length) {
      // 挑不改目标枚数的那条，好让「灵种数 = 目标数」只量段表。
      const keep = vm.twistPick.find(function (x) { return x.id !== 'brace'; }) || vm.twistPick[0];
      ctrl.pickTwist(keep.id);
    }
    const seedIdx = [];
    for (let i = 0; i < vm.cells.length; i += 1) {
      if (vm.cells[i].cls.indexOf('cell--seed') >= 0) seedIdx.push(i);
    }
    assert.ok(seedIdx.length > 0, '圆满段的盘上没有灵种，这个目标做不成');
    assert.strictEqual(seedIdx.length, p.goalCount,
      '灵种枚数与目标数不符：' + seedIdx.length + ' vs ' + p.goalCount);
    assert.ok(seedIdx.every(function (i) { return Math.floor(i / vm.match.cols) < vm.match.rows - 1; }),
      '灵种开局就摆在底行（等于白送目标）');

    // 点灵种：不选中、不换、不扣息，但要说清怎么让它动。
    const before = vm.timeText;
    const board0 = vm.match.board.slice();
    ctrl.tap(seedIdx[0]);
    assert.strictEqual(vm.match.first, -1, '灵种格被选中了');
    assert.deepStrictEqual(vm.match.board, board0, '灵种被换动了');
    assert.strictEqual(vm.timeText, before, '点了一下灵种就扣息了');
    assert.ok(/灵种/.test((vm.fx && vm.fx.text) || ''), '点灵种没有任何说明，玩家只会以为没点上');
    ctrl.destroy();

    // 段三目标是「做出 5 次连锁」，不是「凑一次 5 层连锁」：
    // 判定每手 chain>=2 记 1 次、与深度无关（goalAdvance 里的 goalChains += 1），
    // 文案就必须写「次」。写成「层」会让玩家对着 5 层去凑，那是「连收」才干的事。
    // 这里连源码一起钉：计数器不许改成按层数加，文案不许写回「层」。
    const matchSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'minigames', 'match.js'), 'utf8');
    assert.ok(/if \(chain >= 2\) goalChains \+= 1/.test(matchSrc), '连锁目标不再按「次数」计数');
    assert.ok(!/goalChains \+= chain/.test(matchSrc), '连锁目标被改成按层数累加了');
    let cvm = null;
    const c3 = mod.create({
      params: data.buildParamsAt(sanxiu(), 51), difficulty: 3, perks: { tier: 0 },
      tip: 't', theme: {}, render: function (v) { cvm = v; }, finish: function () {},
    });
    c3.start();
    assert.ok(cvm.meter && /目标.*连锁/.test(cvm.meter.label), '段三没有连锁目标进度条');
    assert.ok(/连锁 0\/5 次/.test(cvm.meter.label), '连锁目标文案没写「次」（写成「层」会让人去凑五连）：' + cvm.meter.label);
    assert.ok(!/层/.test(cvm.meter.label), '连锁目标文案还带着「层」：' + cvm.meter.label);
    const matchLines = mod.lines(data.buildParamsAt(sanxiu(), 51)).items.join(' ');
    assert.ok(/做出 5 次连锁/.test(matchLines), '评级卡把连锁目标写成了「层」：' + matchLines);
    c3.destroy();

    // 达成即收工：目标压到「收 1 株同色」，几手之内必然触发。
    // 这一条钉三件事：① 达成之后这一局真的结束，不再让玩家继续打；
    // ② 结算分里含「剩余时辰折的分」；③ 浮字里说清折了多少。
    const gp = Object.assign({}, data.buildParamsAt(sanxiu(), 11), {
      cols: 5, rows: 5, kinds: 3, goalType: 1, goalColor: 1, goalCount: 1,
      duration: 600, missCost: 1, shuffleCost: 1, seals: 0, special: 0, twist: 0, swapAny: 0,
    });
    let gvm = null;
    let result = null;
    const gctrl = mod.create({
      params: gp, difficulty: 1, perks: { tier: 0 }, tip: 't', theme: {},
      render: function (v) { gvm = v; }, finish: function (r) { result = r; },
    });
    gctrl.start();
    // 不能一直用 findMove：它永远返回「从左上数第一个」那一步，
    // 于是整局可能反复在同一处消同两种颜色，几十手一次都碰不到目标色——
    // 那不是玩法坏了，是驱动它的手太死板。这里随机挑一步可行换位，像真人在找。
    const anyMove = function (bd, lcols, lrows) {
      const cand = [];
      for (let r = 0; r < lrows; r += 1) {
        for (let c = 0; c < lcols; c += 1) {
          const a = r * lcols + c;
          for (const d of [[0, 1], [1, 0]]) {
            const nr = r + d[0];
            const nc = c + d[1];
            if (nr >= lrows || nc >= lcols) continue;
            const b = nr * lcols + nc;
            const va = bd[a];
            const vb = bd[b];
            if (va === vb || va <= 0 || vb <= 0) continue;
            bd[a] = vb; bd[b] = va;
            const ok = mod.matchesOf(bd, lcols, lrows).length > 0;
            bd[a] = va; bd[b] = vb;
            if (ok) cand.push([a, b]);
          }
        }
      }
      return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
    };
    let hit = false;
    for (let t = 0; t < 80 && !hit; t += 1) {
      const mv = anyMove(gvm.match.board.slice(), gvm.match.cols, gvm.match.rows);
      if (!mv) break;
      gctrl.tap(mv[0]);
      gctrl.tap(mv[1]);
      // 一句「目标达成」要等这一手彻底演完才报（见 settle）：达成可能夹在连锁里。
      // 判据读仪表而不是浮字：浮字会被同一手的连锁句换掉，仪表一直挂着「已达成」。
      advance(9000);
      if (/已达成/.test((gvm.meter && gvm.meter.detail) || '')) hit = true;
    }
    assert.ok(hit, '连走 80 手都没收到目标色，收工这条没被验证到'
      + '｜最后一句浮字=' + ((gvm.fx && gvm.fx.text) || '无')
      + '｜ended=' + !!result + '｜meter=' + JSON.stringify(gvm.meter));
    // 报账之后停一拍必须自己收工——不推进假时钟的话 busy 还挂着，所以推一拍。
    advance(2000);
    assert.ok(result, '目标达成后这一局没有收工：还在让玩家继续打');
    assert.ok(/折 \d+ 分/.test(gvm.fx.text || ''), '达成了却没在浮字里说清剩余时辰折了多少分：' + gvm.fx.text);
    assert.strictEqual(result.goalDone, true, '结算里没标出「这一局是做成目标收的工」');
    assert.ok(result.goalBonus > 0, '结算里没有剩余时辰折出来的分：' + result.goalBonus);
    assert.ok(result.score >= result.goalBonus + 12,
      '结算总分没把这一手真收的株算进去：' + result.score + ' vs 折算 ' + result.goalBonus);
    // 收工之后不许再有输入被接住：接住了就等于「达成还能继续打」，终点又软回去。
    const boardAfter = gvm.match.board.slice();
    gctrl.tap(0);
    gctrl.tap(1);
    assert.deepStrictEqual(gvm.match.board, boardAfter, '收工之后还能继续换牌');
    gctrl.destroy();

    // 落底收走：极小的双色盘上，灵种那一列几手之内必然被消到，
    // 落到底行后必须真的「收走并记账」——不是停在底行当一块死格。
    // 这一条抓的是「生成了但没消费」：盘上摆了、也会下落，但没人把它算进目标进度。
    const sp = Object.assign({}, data.buildParamsAt(sanxiu(), 501), {
      cols: 4, rows: 4, kinds: 2, goalType: 5, goalCount: 1,
      duration: 999, seals: 0, special: 0, twist: 0, swapAny: 0,
      missCost: 1, shuffleCost: 1,
    });
    let svm = null;
    let sResult = null;
    const sctrl = mod.create({
      params: sp, difficulty: 1, perks: { tier: 0 }, tip: 't', theme: {},
      render: function (v) { svm = v; }, finish: function (r) { sResult = r; },
    });
    sctrl.start();
    let landed = false;
    for (let t = 0; t < 220 && !landed; t += 1) {
      const mv = mod.findMove(svm.match.board.slice(), svm.match.cols, svm.match.rows);
      if (!mv) break;
      sctrl.tap(mv[0]);
      sctrl.tap(mv[1]);
      advance(900);
      // 落底即达成、达成即收工：结算里的 goalDone 是「真被收走并记了账」的最硬证据。
      if (sResult && sResult.goalDone) landed = true;
      else if (svm.meter && svm.meter.value >= 1) landed = true;
    }
    assert.ok(landed, '灵种在 220 手里一次都没落到底行（它根本不会动，或者落到了没人收）');
    sctrl.destroy();
  } finally { restoreClock(); }
});

check('两门的评级说明都写清「反悔封顶」，玩家查得到', function () {
  // 说明页照抄 lines().items，局内只在复位时 flash 一句；少这一条，
  // 玩家复位后会以为还能拿 S，结算给 A 就成了「凭什么」。
  for (const game of ['klotski', 'pushbox']) {
    const m = data.PRACTICE_METHODS.filter(function (x) { return x.game === game; })[0];
    const r = index.MODULES[game].lines(data.buildParams(m, 'novice'), 'entry');
    assert.ok(/最高(\s*只?到)?\s*A|最高 A/.test(r.items.join(' ')),
      game + ' 的评级说明没写复位后封顶 A');
  }
});

check('五档各生成一局：15 门 × 5 档都能开局，盘面不出空值', function () {
  // 上面那条整局驱动只跑「本门基础参数」一档。难度是五档，参数差最大的一档
  // （绝境：九宫 46 洞、毫厘 6×6、入位 3 处阵位、合数目标 1024）恰恰最少被走到，
  // 而「参数拼出一个不存在的盘面」这类错在低档看不出来。这里只建局、不跑完。
  installClock();
  try {
    const keys = ['novice', 'entry', 'minor', 'major', 'full'];
    for (const m of data.PRACTICE_METHODS) {
      for (const dk of keys) {
        const ctx = makeCtx(m, {}, data.buildParams(m, dk));
        const vm = ctx.st.vm;
        assert.ok(vm, m.id + ' 的 ' + dk + ' 档没渲染出第一帧');
        assert.ok(['board', 'lane', 'ring', 'orbit', 'scroll', 'klotski'].indexOf(vm.stage) >= 0,
          m.id + ' 的 ' + dk + ' 档舞台形态非法：' + vm.stage);
        // 格子盘要真有格子；华容道走 vm.klotski.blocks；环形 / 轨道 / 卷轴类改验自己那块结构。
        if (vm.stage === 'board') {
          assert.ok(vm.cells && vm.cells.length > 0, m.id + ' 的 ' + dk + ' 档盘面没有格子');
        } else if (vm.stage === 'klotski') {
          assert.ok(vm.klotski && vm.klotski.blocks && vm.klotski.blocks.length > 0,
            m.id + ' 的 ' + dk + ' 档没有块');
        } else {
          assert.ok(vm.ring || vm.orbit || vm.scroll || vm.lane,
            m.id + ' 的 ' + dk + ' 档（' + vm.stage + '）没有盘面结构');
        }
        assert.ok(typeof vm.goal === 'string' && vm.goal.length > 0,
          m.id + ' 的 ' + dk + ' 档没给这一局要做什么');
        assert.ok(typeof vm.hint === 'string' && vm.hint.length > 0,
          m.id + ' 的 ' + dk + ' 档没给代价句');
        // 参数拼错最典型的表现是「目标 / 进度里冒出 undefined 或 NaN」。
        assert.ok(!/undefined|NaN/.test(vm.goal + '|' + vm.timeText + '|' + vm.scoreText),
          m.id + ' 的 ' + dk + ' 档目标行算出空值：' + vm.goal + ' / ' + vm.timeText);
        ctx.c.destroy();
      }
    }
  } finally { restoreClock(); }
});

// ---------------------------------------------------------------- 推填九宫：可读性
check('推填九宫：选中空格时，同行列宫已有的数字在数字键上压暗，但照样能点', function () {
  installClock();
  try {
    const m = data.getMethod('shudu');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'minor'));
    ctx.c.start();
    const g = ctx.st.vm.sudoku;
    assert.ok(g && g.size === 9, '困难档不是 9×9');
    // 找一个空格，把它同行 / 同列 / 同宫出现过的数自己算一遍，和键上的 seen 对。
    let blank = -1;
    for (let i = 0; i < g.given.length; i += 1) if (g.given[i] === 0) { blank = i; break; }
    assert.ok(blank >= 0, '盘上没有空格');
    ctx.c.tap(blank);
    const vm = ctx.st.vm;
    const r = Math.floor(blank / 9);
    const c = blank % 9;
    const r0 = Math.floor(r / 3) * 3;
    const c0 = Math.floor(c / 3) * 3;
    const want = {};
    for (let i = 0; i < 81; i += 1) {
      const v = g.given[i];
      if (!v) continue;
      const ir = Math.floor(i / 9);
      const ic = i % 9;
      const inBox = ir >= r0 && ir < r0 + 3 && ic >= c0 && ic < c0 + 3;
      if (ir === r || ic === c || inBox) want[v] = true;
    }
    let marked = 0;
    for (let k = 0; k < vm.pad.keys.length; k += 1) {
      const key = vm.pad.keys[k];
      const v = parseInt(key.dir, 10);
      if (v < 1) { assert.strictEqual(key.seen, false, '✕ 键不该被压暗'); continue; }
      assert.strictEqual(key.seen, !!want[v], '数字 ' + v + ' 的压暗状态与同行列宫对不上');
      if (key.seen) marked += 1;
    }
    assert.ok(marked > 0, '9×9 的题面格不可能一个数都没用过');
    // 压暗是提示不是禁令：点下去照样落子。
    const src = require('fs').readFileSync(require('path').join(__dirname, '../pages/practice/practice.wxml'), 'utf8');
    assert.ok(src.indexOf('pad__key--seen') >= 0, '样式类没挂到按钮上');
    assert.ok(!/wx:if="{{!item.seen}}"/.test(src), '压暗的键被禁用了——压暗是提示不是禁令');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

// ---------------------------------------------------------------- 推填九宫：阶段新法
// data/practice.js 的 STAGE_RULES 写着两条：大成「密勘」标唯一空位、大圆满「唯余」描唯一候选。
// 这里守两件事：没到那一段一处都不许出现；出现了就必须是那件事，不许乱标。
check('推填九宫：大成「密勘」只标唯一空位，没到大成一处都不标', function () {
  installClock();
  try {
    const m = data.getMethod('shudu');
    const params = data.buildParams(m, 'minor');
    const boot = function (tier) {
      const ctx = makeCtx(m, { tier: tier }, params);
      ctx.c.start();
      return ctx;
    };
    const marksOf = function (ctx) {
      const out = [];
      const cells = ctx.st.vm.cells;
      for (let i = 0; i < cells.length; i += 1) {
        if (cells[i].cls.indexOf('cell--sole') >= 0) out.push(i);
      }
      return out;
    };
    for (let round = 0; round < 4; round += 1) {
      const ctx = boot(0);
      assert.strictEqual(marksOf(ctx).length, 0, '未到大成就出现了密勘标记');
      ctx.c.destroy();
    }

    let seen = 0;
    for (let round = 0; round < 8 && seen < 2; round += 1) {
      const ctx = boot(3);
      const g = ctx.st.vm.sudoku;
      const size = g.size;
      const d = g.box;
      const isSole = function (idx) {
        const r = Math.floor(idx / size);
        const c = idx % size;
        let row = 0;
        let col = 0;
        let box = 0;
        for (let j = 0; j < g.given.length; j += 1) {
          if (g.given[j]) continue;
          const jr = Math.floor(j / size);
          const jc = j % size;
          if (jr === r) row += 1;
          if (jc === c) col += 1;
          if (Math.floor(jr / d.br) === Math.floor(r / d.br)
            && Math.floor(jc / d.bc) === Math.floor(c / d.bc)) box += 1;
        }
        return row === 1 || col === 1 || box === 1;
      };
      const marks = marksOf(ctx);
      for (const i of marks) {
        assert.strictEqual(g.given[i], 0, '密勘标到了题面格');
        assert.ok(isSole(i), '第 ' + i + ' 格被标了密勘，但它所在的行列宫都不是只剩一个空位');
      }
      for (let i = 0; i < g.given.length; i += 1) {
        if (g.given[i]) continue;
        if (isSole(i)) assert.ok(marks.indexOf(i) >= 0, '第 ' + i + ' 格是唯一空位，却没标');
      }
      if (marks.length) seen += 1;
      ctx.c.destroy();
    }
    assert.ok(seen > 0, '连开八局都没见到密勘标记，这条断言等于没跑');
  } finally { restoreClock(); }
});

check('推填九宫：大圆满「唯余」只描唯一候选的键，没到大圆满一处都不描', function () {
  installClock();
  try {
    const m = data.getMethod('shudu');
    const params = data.buildParams(m, 'minor');
    const boot = function (tier) {
      const ctx = makeCtx(m, { tier: tier }, params);
      ctx.c.start();
      return ctx;
    };
    const onlyOf = function (ctx) {
      return ctx.st.vm.pad.keys.filter(function (k) { return k.only; });
    };

    const ctx0 = boot(0);
    const g0 = ctx0.st.vm.sudoku;
    for (let i = 0; i < g0.given.length; i += 1) {
      if (g0.given[i]) continue;
      ctx0.c.tap(i);
      assert.strictEqual(onlyOf(ctx0).length, 0, '未到大圆满就描金了');
    }
    ctx0.c.destroy();

    let hit = 0;
    for (let round = 0; round < 6 && hit < 3; round += 1) {
      const ctx = boot(5);
      const g = ctx.st.vm.sudoku;
      const size = g.size;
      const d = g.box;
      for (let i = 0; i < g.given.length; i += 1) {
        if (g.given[i]) continue;
        ctx.c.tap(i);
        const row = Math.floor(i / size);
        const col = i % size;
        const used = {};
        for (let j = 0; j < g.given.length; j += 1) {
          const v = ctx.st.vm.sudoku.given[j];
          if (!v) continue;
          const jr = Math.floor(j / size);
          const jc = j % size;
          const inBox = Math.floor(jr / d.br) === Math.floor(row / d.br)
            && Math.floor(jc / d.bc) === Math.floor(col / d.bc);
          if (jr === row || jc === col || inBox) used[v] = true;
        }
        let cnt = 0;
        let last = 0;
        for (let v = 1; v <= size; v += 1) {
          if (!used[v]) { cnt += 1; last = v; }
        }
        const keys = onlyOf(ctx);
        if (cnt === 1) {
          assert.strictEqual(keys.length, 1, '第 ' + i + ' 格只剩唯一候选，却描了 ' + keys.length + ' 个键');
          assert.strictEqual(parseInt(keys[0].dir, 10), last, '描金的不是那个唯一候选');
          hit += 1;
        } else {
          assert.strictEqual(keys.length, 0, '第 ' + i + ' 格还有 ' + cnt + ' 个候选，却描了金');
        }
      }
      ctx.c.destroy();
    }
    assert.ok(hit > 0, '连开六局都没遇到唯一候选格，这条断言等于没跑');
  } finally { restoreClock(); }
});


// ---------------------------------------------------------------- 推石入位：阶段新法
// data/practice.js 的 STAGE_RULES 写着两条：大成「死位」压暗纹、大圆满「临渊」描红。
// 守三件事：没到那一段一处都不许标；标出来的每一格都真的是死位；真的是死位的每一格都得标。
check('推石入位：大成「死位」只标真死位，没到大成一处都不标', function () {
  installClock();
  try {
    const m = data.getMethod('tuisuo');
    const params = data.buildParams(m, 'entry');
    const boot = function (tier) {
      const ctx = makeCtx(m, { tier: tier }, params);
      ctx.c.start();
      return ctx;
    };
    // 测试自己重算一遍：一块石箱站在某格，只认石壁（把别的箱子下人怎么绕都当成不存在），
    // 还推不推得到任何一处阵位。推不到就是死位。
    const deadOf = function (layout) {
      const rows = layout.length;
      const cols = layout[0].length;
      const wallAt = {};
      const goalAt = {};
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const ch = layout[r][c];
          const i = r * cols + c;
          if (ch === '#') wallAt[i] = true;
          if (ch === 'o' || ch === '*' || ch === '+') goalAt[i] = true;
        }
      }
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const out = {};
      for (let start = 0; start < cols * rows; start += 1) {
        if (wallAt[start] || goalAt[start]) continue;
        const seen = {};
        seen[start] = true;
        const queue = [start];
        let can = false;
        while (queue.length && !can) {
          const b = queue.shift();
          const r = Math.floor(b / cols);
          const c = b % cols;
          for (let k = 0; k < dirs.length; k += 1) {
            const nr = r + dirs[k][0];
            const nc = c + dirs[k][1];
            const sr = r - dirs[k][0];
            const sc = c - dirs[k][1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) continue;
            const to = nr * cols + nc;
            if (wallAt[to] || wallAt[sr * cols + sc]) continue;
            if (goalAt[to]) { can = true; break; }
            if (seen[to]) continue;
            seen[to] = true;
            queue.push(to);
          }
        }
        if (!can) out[start] = true;
      }
      return out;
    };
    const hasCls = function (cell, name) { return cell.cls.split(' ').indexOf(name) >= 0; };
    const marksOf = function (ctx) {
      const out = [];
      const cells = ctx.st.vm.cells;
      for (let i = 0; i < cells.length; i += 1) {
        if (hasCls(cells[i], 'cell--doom')) out.push(i);
      }
      return out;
    };

    for (let round = 0; round < 3; round += 1) {
      const ctx = boot(2);
      assert.strictEqual(marksOf(ctx).length, 0, '未到大成就压了死位暗纹');
      for (const cell of ctx.st.vm.cells) {
        assert.ok(!hasCls(cell, 'cell--doom-hit'), '未到大成就描了红线');
      }
      ctx.c.destroy();
    }

    let boxesOnDead = 0;
    for (let round = 0; round < 5; round += 1) {
      const ctx = boot(3);
      const box = ctx.st.vm.pushbox;
      const dead = deadOf(box.layout);
      const marks = marksOf(ctx);
      for (const i of marks) {
        assert.ok(dead[i], '第 ' + i + ' 格压了暗纹，但石箱站在那儿推得到阵位');
      }
      for (const k in dead) {
        assert.ok(marks.indexOf(parseInt(k, 10)) >= 0, '第 ' + k + ' 格是死位，却没压暗纹');
      }
      // 语义锚点：四角（不是石壁、也不是阵位时）一定推不动，也就一定是死位。
      const cols = box.cols;
      const rows = box.rows;
      const corners = [cols + 1, cols * 2 - 2, (rows - 2) * cols + 1, (rows - 1) * cols - 2];
      for (const i of corners) {
        if (box.layout[Math.floor(i / cols)][i % cols] === '#') continue;
        assert.ok(dead[i], '第 ' + i + ' 格是四角，却算成了活位');
      }
      // 箱子上的红线只许挂在死位上，活格绝不许描红。
      for (let i = 0; i < ctx.st.vm.cells.length; i += 1) {
        if (!hasCls(ctx.st.vm.cells[i], 'cell--doom-hit')) continue;
        assert.ok(dead[i], '第 ' + i + ' 格描了红，但它是活位');
        if (box.boxes.indexOf(i) >= 0) boxesOnDead += 1;
      }
      ctx.c.destroy();
    }
    // 生成器保证开局可解，箱子不该一开局就在死位上——这条是「没冤标」的旁证。
    assert.strictEqual(boxesOnDead, 0, '开局就有石箱站在死位上，生成器该重抽');
  } finally { restoreClock(); }
});

check('推石入位：大圆满「临渊」只描「一推就进死位」的那一格，没到大圆满不描', function () {
  installClock();
  try {
    const m = data.getMethod('tuisuo');
    const params = data.buildParams(m, 'entry');
    const boot = function (tier) {
      const ctx = makeCtx(m, { tier: tier }, params);
      ctx.c.start();
      return ctx;
    };
    const hasCls = function (cell, name) { return cell.cls.split(' ').indexOf(name) >= 0; };
    // 只看空地：箱子自己身上的红是「已经推进去了」，人站的那格也不该被当成警告。
    const redOnFloor = function (ctx) {
      const out = [];
      const cells = ctx.st.vm.cells;
      for (let i = 0; i < cells.length; i += 1) {
        if (!hasCls(cells[i], 'cell--doom-hit')) continue;
        if (hasCls(cells[i], 'cell--boxed') || hasCls(cells[i], 'cell--man')) continue;
        out.push(i);
      }
      return out;
    };

    const flat = boot(3);
    const box0 = flat.st.vm.pushbox;
    for (let i = 0; i < 8; i += 1) {
      if (box0.boxes.indexOf(i) < 0) {
        assert.ok(!hasCls(flat.st.vm.cells[i], 'cell--doom-hit'), '未到大圆满就给死位描了红');
      }
    }
    flat.c.destroy();

    let seen = 0;
    // 40 局而不是 10 局：死位要靠随机布局才出得来，10 局偶尔一局都没有，
    // 这条断言就会以「等于没跑」的名义偶发失败（实测 5 次里有 1 次）。
    // 上限抬到 40 只为把偶发率压到可忽略，判据没变：至少有一局描出了红。
    for (let round = 0; round < 40 && seen < 3; round += 1) {
      const ctx = boot(5);
      const box = ctx.st.vm.pushbox;
      const layout = box.layout;
      const cols = box.cols;
      const rows = box.rows;
      const wallAt = {};
      const goalAt = {};
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const ch = layout[r][c];
          const i = r * cols + c;
          if (ch === '#') wallAt[i] = true;
          if (ch === 'o' || ch === '*' || ch === '+') goalAt[i] = true;
        }
      }
      // 死位：与上一条同法，但这里只关心「哪些死格跟某块箱子只差一推」。
      const dead = {};
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let start = 0; start < cols * rows; start += 1) {
        if (wallAt[start] || goalAt[start]) continue;
        const seenAt = {};
        seenAt[start] = true;
        const queue = [start];
        let can = false;
        while (queue.length && !can) {
          const b = queue.shift();
          const r = Math.floor(b / cols);
          const c = b % cols;
          for (let k = 0; k < dirs.length; k += 1) {
            const nr = r + dirs[k][0];
            const nc = c + dirs[k][1];
            const sr = r - dirs[k][0];
            const sc = c - dirs[k][1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) continue;
            const to = nr * cols + nc;
            if (wallAt[to] || wallAt[sr * cols + sc]) continue;
            if (goalAt[to]) { can = true; break; }
            if (seenAt[to]) continue;
            seenAt[to] = true;
            queue.push(to);
          }
        }
        if (!can) dead[start] = true;
      }
      const want = {};
      for (const b of box.boxes) {
        if (goalAt[b]) continue;
        const r = Math.floor(b / cols);
        const c = b % cols;
        for (let k = 0; k < dirs.length; k += 1) {
          const nr = r + dirs[k][0];
          const nc = c + dirs[k][1];
          const sr = r - dirs[k][0];
          const sc = c - dirs[k][1];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) continue;
          const to = nr * cols + nc;
          if (!dead[to]) continue;
          if (wallAt[sr * cols + sc]) continue;
          if (box.boxes.indexOf(to) >= 0 || to === box.player) continue;
          want[to] = true;
        }
      }
      const got = redOnFloor(ctx);
      for (const i of got) {
        assert.ok(want[i], '第 ' + i + ' 格描了红，但没有哪块石箱一推就进去');
      }
      for (const k in want) {
        assert.ok(got.indexOf(parseInt(k, 10)) >= 0, '第 ' + k + ' 格一推就进死位，却没描红');
      }
      if (got.length) seen += 1;
      ctx.c.destroy();
    }
    assert.ok(seen > 0, '连开十局都没遇到「一推就进死位」，这条断言等于没跑');
  } finally { restoreClock(); }
});

check('推填九宫：点题面格 / 没选格就落子，要给浮字而不是写进没人看的 vm.status', function () {
  installClock();
  try {
    const m = data.getMethod('shudu');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'novice'));
    ctx.c.start();
    const g = ctx.st.vm.sudoku;
    let given = -1;
    for (let i = 0; i < g.given.length; i += 1) if (g.given[i] !== 0) { given = i; break; }
    ctx.c.tap(given);
    assert.ok(ctx.st.vm.fx && /题面/.test(ctx.st.vm.fx.text), '点题面格没有浮字：' + JSON.stringify(ctx.st.vm.fx));
    // 清掉浮字再验第二条，免得读到上一条。
    ctx.st.vm.fx = null;
    ctx.c.tap(-1);
    ctx.c.move('1');
    assert.ok(ctx.st.vm.fx && /先点一格空格/.test(ctx.st.vm.fx.text), '没选格落子没有浮字：' + JSON.stringify(ctx.st.vm.fx));
    ctx.c.destroy();
  } finally { restoreClock(); }
});

// ---------------------------------------------------------------- 滑块让路：看得见的三件事
check('滑块让路：选中块的四个方向先标在键上，标出来的一定按不动', function () {
  // 这一门的每一步都是「给谁让路」，不该花在「先按一下看能不能过」上。
  // 方向键压暗只是提示：按下去照样给浮字、照样不动，规则一个字没改。
  installClock();
  try {
    const m = data.getMethod('rongdao');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'minor'));
    ctx.c.start();
    const stepOf = function () {
      const hit = String(ctx.st.vm.goal || '').match(/已走\s*(\d+)\s*步/);
      return hit ? Number(hit[1]) : -1;
    };
    // 步数解析要是拿不到数（恒为 -1），下面「压暗的键按不动」会假通过。
    assert.strictEqual(stepOf(), 0, '开局步数解析不对，这条断言会空转');
    let checked = 0;
    // 主块先跳过：它恰好在出口上方时，一挪就脱身，后面就没盘可测了。
    for (let i = 1; i < 5; i += 1) {
      ctx.c.tap(i);
      for (let d = 0; d < 4; d += 1) {
        const key = ctx.st.vm.pad.keys[d];
        const shut = key.shut;
        const before = stepOf();
        ctx.c.move(key.dir);
        const after = stepOf();
        if (shut) assert.strictEqual(after, before, '键上压暗了，按下去却真的挪了：' + key.dir);
        else assert.strictEqual(after, before + 1, '键上没压暗，按下去却不动：' + key.dir);
        checked += 1;
        // 挪动过就复位回开局，后面的键才有同一个局面可比。
        if (after > before) { ctx.c.reset(); ctx.c.tap(i); }
      }
    }
    assert.ok(checked >= 16, '四个块 × 四个方向没测全（' + checked + '）');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('滑块让路：挪不动要说清是盘沿还是谁挡着，描红 460ms 后自己撤', function () {
  installClock();
  try {
    const m = data.getMethod('rongdao');
    const seen = { edge: false, block: false };
    // 一盘里未必同时出现两种情形，抽几盘凑。
    for (let round = 0; round < 14 && !(seen.edge && seen.block); round += 1) {
      const ctx = makeCtx(m, {}, data.buildParams(m, 'entry'));
      ctx.c.start();
      for (let i = 0; i < 5 && !(seen.edge && seen.block); i += 1) {
        ctx.c.tap(i);
        for (let d = 0; d < 4; d += 1) {
          const key = ctx.st.vm.pad.keys[d];
          if (!key.shut) continue;
          ctx.c.move(key.dir);
          const fx = ctx.st.vm.fx;
          assert.ok(fx, '挪不动却没有浮字');
          const red = ctx.st.vm.klotski.blocks.filter(function (b) { return b.blocked; });
          if (fx.text.indexOf('盘沿') >= 0) {
            assert.strictEqual(red.length, 0, '撞盘沿不该把某一块描红：' + fx.text);
            seen.edge = true;
          } else {
            assert.ok(/挡着$/.test(fx.text), '浮字没说清谁挡着：' + fx.text);
            assert.ok(red.length > 0, '浮字说了有人挡着，盘上却没有一块被描红：' + fx.text);
            seen.block = true;
          }
          advance(500);
          const still = ctx.st.vm.klotski.blocks.filter(function (b) { return b.blocked; });
          assert.strictEqual(still.length, 0, '描红过了 460ms 还挂着');
        }
      }
      ctx.c.destroy();
    }
    assert.ok(seen.edge && seen.block, '十四盘里没凑齐「盘沿」与「被块挡住」两种情形');

    // 四面都堵的块：四个键一起压暗，选中时要说一句，别让玩家一个个试完才知道。
    let stuckSeen = 0;
    for (let round = 0; round < 20 && stuckSeen < 2; round += 1) {
      const one = makeCtx(m, {}, data.buildParams(m, 'entry'));
      one.c.start();
      for (let i = 0; i < 5; i += 1) {
        one.c.tap(i);
        const keys = one.st.vm.pad.keys;
        const free = keys.filter(function (k) { return !k.shut; }).length;
        if (free > 0) continue;
        stuckSeen += 1;
        const fx = one.st.vm.fx || {};
        assert.ok(/四面都堵着/.test(fx.text || ''), '四键全压暗却没说话：' + JSON.stringify(fx));
      }
      one.c.destroy();
    }
    assert.ok(stuckSeen > 0, '二十盘里一次四面全堵都没遇到，这条断言没测到东西');
  } finally { restoreClock(); }
});

check('滑块让路：脱身时主块沉进出口，出口从缺口变成开着的门', function () {
  installClock();
  try {
    const m = data.getMethod('rongdao');
    const ctx = makeCtx(m, {}, data.buildParams(m, 'entry'));
    ctx.c.start();
    const toState = function () {
      return ctx.st.vm.klotski.blocks.map(function (b) {
        return [Math.round(b.y / 25), Math.round(b.x / 25)];
      });
    };
    const DIR_NAME = { "0,-1": 'left', "0,1": 'right', "-1,0": 'up', "1,0": 'down' };
    const plan = klotskiMod.solvePath(toState(), klotskiMod.SHAPES, 4, 4, 30);
    assert.ok(plan && plan.length, '这一盘解不出来，断言前提不成立');
    for (let s = 0; s < plan.length; s += 1) {
      ctx.c.tap(plan[s].piece);
      ctx.c.move(DIR_NAME[plan[s].dir[0] + ',' + plan[s].dir[1]]);
    }
    assert.ok(ctx.st.finished, '按最优路径走完却没结账');
    assert.strictEqual(ctx.st.finished.grade, 'S', '一步没浪费却不是 S');
    assert.strictEqual(ctx.st.vm.klotski.open, true, '脱身了出口没打开');
    const main = ctx.st.vm.klotski.blocks[0];
    assert.strictEqual(main.escaped, true, '主块到出口了却没沉进去');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

// ---------------------------------------------------------------- 断言：节律判定的谱面
// 这一门旧版只有一个动词（等环、点一下），五档只是把窗收窄：玩家在第一章就学会了
// 全部本事，后面一百六十关只是要求他糊弄得更准。现在每一档换一件东西（谱型 / 手数 /
// 提示），护栏也从「窗单调」换成「每档真的多学一样、而且盘面解得开」。

check('节律判定：五档各换一件东西，不是只换秒表', function () {
  const m = data.getMethod('absorb');
  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  const specs = keys.map(function (k) { return data.buildParams(m, k); });
  const cueRank = { all: 3, next: 2, bar: 1, none: 0 };
  for (let i = 1; i < specs.length; i += 1) {
    const a = specs[i - 1];
    const b = specs[i];
    const diff = [];
    if (JSON.stringify(a.pattern) !== JSON.stringify(b.pattern)) diff.push('谱型');
    if (a.hands !== b.hands) diff.push('手数');
    if (a.cue !== b.cue) diff.push('提示');
    // 环速也是盘面上看得见的一样东西：最短音符间隔拉开两成以上，环走得明显不一样快。
    const shot = function (q) {
      const sc = index.MODULES.tempo.score(q, { twist: m.twist });
      return Math.min.apply(null, sc.tracks.map(function (t) { return t.shortest; }));
    };
    if (Math.abs(shot(b) / shot(a) - 1) >= 0.2) diff.push('环速');
    // 只换一个数（窗、格长）等于「只换秒表」——那正是旧版的问题。
    assert.ok(diff.length >= 2,
      keys[i] + ' 档只换了 ' + (diff.length ? diff.join('/') : '秒表') + '，玩家学不到新东西');
    assert.ok(b.hands >= a.hands, keys[i] + ' 档的手数比上一档还少');
    assert.ok(cueRank[b.cue] <= cueRank[a.cue], keys[i] + ' 档的提示反而变多了');
  }
  // 第一档全标、最后一档无提示：这就是「跟着页面点 → 凭感觉点」这条线本身。
  assert.strictEqual(specs[0].cue, 'all', '第一档没有全标，玩家第一局无处可跟');
  assert.strictEqual(specs[4].cue, 'none', '最后一档还留着提示，绝境等于没到');
});

check('节律判定：拍号、BPM、音符时值三者对得上', function () {
  const m = data.getMethod('absorb');
  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  // 一格恒是八分音符。所以一小节的格数 = 拍号分子 × 2（分母 4）或 = 分子（分母 8）；
  // 一拍 = 分母那个音符：4/4、2/4 是四分音符（两格），6/8 是附点四分（三格）。
  // 这两条错一条，玩家拿节拍器一对就发现两个说法打架。
  for (let i = 0; i < keys.length; i += 1) {
    const p = data.buildParams(m, keys[i]);
    const parts = String(p.meter).split('/');
    const num = Number(parts[0]);
    const den = Number(parts[1]) || 4;
    const cellsPerBar = den === 8 ? num : num * 2;
    assert.strictEqual(p.bar, cellsPerBar,
      keys[i] + ' 档：' + p.meter + ' 一小节该是 ' + cellsPerBar + ' 个八分音符，表里写的是 ' + p.bar + ' 格');
    const cellsPerBeat = den === 8 ? 3 : 2;
    assert.strictEqual(p.bpm, Math.round(60000 / (p.unitMs * cellsPerBeat)),
      keys[i] + ' 档：BPM 与拍号不是一套（' + p.meter + '、一格 ' + p.unitMs + 'ms，算出来不是 ' + p.bpm + '）');
  }
  // 6/8 整条都成立，不只是首关：段内格长一收，BPM 要按附点四分跟着涨。
  for (let lv = 501; lv <= 1000; lv += 37) {
    const p = data.buildParamsAt(m, lv);
    assert.strictEqual(p.meter, '6/8', '第 ' + lv + ' 关不再是 6/8 了，这条断言要重写');
    assert.strictEqual(p.bpm, Math.round(60000 / (p.unitMs * 3)),
      '第 ' + lv + ' 关（6/8）BPM 没按附点四分算：一格 ' + p.unitMs + 'ms 却报 ' + p.bpm);
  }
});

check('节律判定：每一手的判定窗都不许吞掉下一个音符', function () {
  const m = data.getMethod('absorb');
  const mod = index.MODULES.tempo;
  const F = data.TEMPO_FLOOR;
  for (let lv = 1; lv <= 200; lv += 1) {
    const s = mod.score(data.buildParamsAt(m, lv), { twist: m.twist });
    for (const t of s.tracks) {
      assert.ok(t.winMs >= F.minWinMs - 1e-9,
        '第 ' + lv + ' 关第 ' + (t.hand + 1) + ' 手的判定窗破了下限');
      // 双手里左手三秒一下、右手一秒一下：窗口按左手定，右手的两个窗口会叠在一起。
      assert.ok(t.winMs <= t.shortest * F.maxWinFrac + 1e-9,
        '第 ' + lv + ' 关第 ' + (t.hand + 1) + ' 手的判定窗比四成间隔还宽，会吞掉下一个音符');
    }
  }
});

check('节律判定：双手是两条独立时间线，不是和弦', function () {
  const m = data.getMethod('absorb');
  const mod = index.MODULES.tempo;
  const two = mod.score(data.buildParams(m, 'major'), { twist: m.twist });
  assert.strictEqual(two.tracks.length, 2, '极难档没有起第二只手');
  const lg = two.tracks[0].notes[0].gap;
  const rg = two.tracks[1].notes[0].gap;
  assert.ok(Math.abs(lg / rg - 2) < 1e-9, '极难不是一与二：' + lg + ' / ' + rg);
  const lAt = two.tracks[0].notes.map(function (n) { return n.at; });
  const rAt = two.tracks[1].notes.map(function (n) { return n.at; });
  const shared = lAt.filter(function (t) { return rAt.indexOf(t) >= 0; });
  assert.ok(shared.length >= 2, '极难的两条线一个对齐点都没有，「同相位」是假的');
  const three = mod.score(data.buildParams(m, 'full'), { twist: m.twist });
  const l3 = three.tracks[0].notes[0].gap;
  const r3 = three.tracks[1].notes[0].gap;
  // 二对三：左手一小节 2 下、右手 3 下，所以间隔比是 3:2。
  assert.ok(Math.abs(l3 / r3 - 1.5) < 1e-9, '绝境的间隔比不是 3:2：' + l3 + ' / ' + r3);
  assert.strictEqual(three.tracks[0].onsets.length, 2, '绝境左手每小节不是 2 下');
  assert.strictEqual(three.tracks[1].onsets.length, 3, '绝境右手每小节不是 3 下');
});

check('节律判定：本门机制（判定带更宽）五档都成立', function () {
  const m = data.getMethod('absorb');
  const mod = index.MODULES.tempo;
  // 机制是乘性的，先拿一组不受四成上限夹的参考谱把倍数钉住。
  const ref = { bar: 8, unitMs: 500, bars: 2, hands: 1, pattern: [[0, 2]], winMs: 100 };
  const bare = mod.score(ref, {});
  const own = mod.score(ref, { twist: m.twist });
  assert.ok(Math.abs(own.tracks[0].winMs / bare.tracks[0].winMs - mod.TWIST_WIN) < 1e-9,
    '本门判定带不是 ×' + mod.TWIST_WIN);
  for (const k of ['novice', 'entry', 'minor', 'major', 'full']) {
    const a = mod.score(data.buildParams(m, k), {});
    const b = mod.score(data.buildParams(m, k), { twist: m.twist });
    assert.ok(b.tracks[0].winMs >= a.tracks[0].winMs - 1e-9,
      k + ' 档的判定带比本门该有的还窄（机制被别的修正抵消了）');
  }
});

check('节律判定：拍点落在固定网格上，点过之后继续收到底', function () {
  installClock();
  try {
    const m = data.getMethod('absorb');
    const ctx = makeCtx(m);
    ctx.c.start();
    let hit = false;
    for (let i = 0; i < 600 && !hit; i += 1) {
      advance(40);
      const r = ctx.st.vm.rings[0];
      if (Math.abs(r.scale - r.judge) <= r.window * 0.6) { hit = true; ctx.c.tap(0); }
    }
    assert.ok(hit, '第一音没等到判定带');
    const scaleAtTap = ctx.st.vm.rings[0].scale;
    const idxAtTap = ctx.st.vm.rings[0].index;
    // 点过之后环继续往底收，不弹回起点：弹回就等于每一拍都是一次全新的反应任务。
    advance(40);
    assert.ok(ctx.st.vm.rings[0].scale <= scaleAtTap + 1e-9,
      '点一下就复位：环又弹回起点了');
    assert.strictEqual(ctx.st.vm.rings[0].index, idxAtTap, '点一下就跳音符');
    // 连点不再加分，也不许把音符推走。
    for (let i = 0; i < 3; i += 1) { advance(40); ctx.c.tap(0); }
    assert.strictEqual(ctx.st.vm.rings[0].index, idxAtTap, '连点把音符推走了：判定被点击驱动');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

// 段首关 = 引导关：1 / 11 / 51 / 201 / 501。
// 玩家原话是「第 1 关就应该是个引导关啊，就是有教程引导的，这个声音引导着怎么一点点」——
// 这一门没法用文字教（规则就是「跟着声音点」），所以教程只能是**先听一小节**：
// 预拍那一小节全曲唯一不用做任何事，盘面正中一个字「听」，拍子已经在响。
// 五个段首各说本段新增的那一条（环入带 / 宁晚勿早 / 提示退到小节头 / 双手 / 无提示）。
check('节律判定：五个段首关是引导关，其余关不许出现引导', function () {
  installClock();
  try {
    const m = data.getMethod('absorb');
    const HEADS = data.STAGES.map(function (s) { return s.from; });
    assert.deepStrictEqual(HEADS, [1, 11, 51, 201, 501], '五段的段首关变了，引导表要跟着改');
    for (let i = 0; i < HEADS.length; i += 1) {
      const lv = HEADS[i];
      const ctx = makeCtx(m, null, data.buildParamsAt(m, lv));
      const vm = ctx.st.vm;
      // 开局（tick = 0）就在预拍里：环还在最外圈，拍子还没走完一小节。
      assert.strictEqual(vm.coachListen, true, '第 ' + lv + ' 关没进引导：开局该是「先听」');
      assert.ok(/先听/.test(vm.beatText), '第 ' + lv + ' 关的小字行没写「先听」');
      assert.ok(vm.ringTip && vm.ringTip !== '点按盘面 · 光环缩到红圈上时点击'
        && vm.ringTip !== '左右各点各的 · 光环缩到红圈上时点击',
        '第 ' + lv + ' 关的引导没说本段的新规矩，只摆了常规提示');
      ctx.c.destroy();
    }
    // 五段的引导必须说的是五件事，不许五段同一句复制粘贴。
    // 读的是**预拍之后那一句**（讲本段新规矩），预拍期的「只听着」本来就该长得一样。
    const seen = {};
    for (let i = 0; i < HEADS.length; i += 1) {
      const prm = data.buildParamsAt(m, HEADS[i]);
      const ctx = makeCtx(m, null, prm);
      ctx.c.start();
      // 走完预拍一小节、进第一小节但不点任何一手：这一句才不会因为「点中两音」被撤掉。
      advance(prm.bar * prm.unitMs + 80);
      const t = ctx.st.vm.ringTip;
      assert.ok(!/只听着/.test(t), '第 ' + HEADS[i] + ' 关过了预拍还在写「只听着」');
      assert.ok(!seen[t], '第 ' + HEADS[i] + ' 关的引导和第 ' + seen[t] + ' 关一模一样');
      seen[t] = HEADS[i];
      ctx.c.destroy();
    }
    // 非段首关一律不引导：段首是门口，摆在每一关就成了常驻提示。
    for (const lv of [2, 12, 52, 202, 502, 350, 900, 1000]) {
      const ctx = makeCtx(m, null, data.buildParamsAt(m, lv));
      assert.strictEqual(!!ctx.st.vm.coachListen, false, '第 ' + lv + ' 关不是段首关，却在放引导');
      assert.ok(!/先听/.test(ctx.st.vm.beatText), '第 ' + lv + ' 关不是段首关，却写了「先听」');
      ctx.c.destroy();
    }
  } finally { restoreClock(); }
});

check('节律判定：引导只用预拍那一小节、点中两音就撤；小节头有重音', function () {
  installClock();
  try {
    const m = data.getMethod('absorb');
    const p = data.buildParamsAt(m, 1);
    const ctx = makeCtx(m, null, p);
    const bar = p.bar;
    const unitMs = p.unitMs;
    ctx.c.start();
    // 预拍那一小节里点盘面不算：玩家跟着「先听」好奇碰一下，不该先吃一个「太早 · 空拍」，
    // 更不该把连拍打断——引导就摆在那一小节上，这一步必须无代价。
    ctx.c.tap(0);
    assert.ok(/^计 0 分$/.test(ctx.st.vm.scoreText), '预拍里点了一下就被记成一个空拍');
    assert.strictEqual(ctx.st.vm.rings[0].index, 0, '预拍里点了一下就把音符推走了');
    // 预拍正好是一整小节：还没到就还在「听」，到了就该撤。
    const leadFrames = Math.round(bar * unitMs / 40);
    let accent = {};
    for (let i = 0; i < 900; i += 1) {
      advance(40);
      const vm = ctx.st.vm;
      if (vm.beatKey !== undefined && accent[vm.beatKey] === undefined) {
        accent[vm.beatKey] = vm.beatAccent;
      }
      const r = vm.rings && vm.rings[0];
      if (!r) continue;
      // 走进判定带就点：这样引导会在点中第二个音符之后撤掉，不用等到整局跑完。
      if (Math.abs(r.scale - r.judge) <= r.window * 0.5) {
        const before = vm.scoreText;
        ctx.c.tap(0);
        if (vm.scoreText !== before) { /* 点中了 */ }
      }
      if (i === leadFrames - 2) {
        assert.strictEqual(ctx.st.vm.coachListen, true,
          '预拍还没走完，「听」就撤了：玩家少听了一截拍子');
      }
      if (i === leadFrames + 4) {
        assert.strictEqual(ctx.st.vm.coachListen, false, '预拍过完了，「听」还挂在盘面正中');
      }
    }
    // 点中两个音符之后，引导让位给常规提示（引导不是常驻提示）。
    assert.ok(!/只听着/.test(ctx.st.vm.ringTip), '点中两个音符之后引导还没撤');
    assert.ok(/光环缩到红圈上时点击/.test(ctx.st.vm.ringTip), '引导撤了，常规提示也没回来');
    // 小节头重音：第 0、bar、2bar 格是重音，中间那几格不是。
    // 没有强弱，一串哒声里数不出小节线，第三段起提示轨只剩小节头就等于什么都没剩。
    assert.strictEqual(accent[0], true, '第一格不是重音');
    assert.strictEqual(accent[bar], true, '第一个小节线没有重音');
    assert.strictEqual(accent[1], false, '小节中间那一格不该是重音');
    ctx.c.destroy();
  } finally { restoreClock(); }
});

check('节律判定：B 线不与 A 线挤成一道缝', function () {
  const mod = index.MODULES.tempo;
  for (const total of [12, 16, 18, 20]) {
    const b = mod.bands(total);
    assert.ok(b.sMin > b.aMin && b.aMin > b.bMin, total + ' 音的四条线没有严格递减');
    // 音符少时 ceil(n×0.5) 与 A 只差半分：整个 B 档只有半分的宽度，几乎打不出来。
    assert.ok(b.aMin - b.bMin >= 1, total + ' 音的 B 线离 A 线不到 1 分，B 会变成一道缝');
    assert.ok(b.bMin >= total * 0.4, total + ' 音的 B 线低到四成以下，等于没有门槛');
  }
});

check('节律判定：章内收紧同步到盘面，不许报盘面上没有的变化', function () {
  const m = data.getMethod('absorb');
  const mod = index.MODULES.tempo;
  const span = require('../data/levels.js').STAGE_SPAN;
  const eff = function (lv) { return mod.score(data.buildParamsAt(m, lv), { twist: m.twist }); };
  for (let lv = 2; lv <= 200; lv += 1) {
    const cur = eff(lv);
    const prev = eff(lv - span);
    for (const d of data.levelDelta(m, lv)) {
      if (d.key === 'unitMs') {
        assert.notStrictEqual(cur.unitMs, prev.unitMs,
          '第 ' + lv + ' 关报了「' + d.text + '」，可格长和上一关一样');
      }
      if (d.key === 'winMs') {
        assert.notStrictEqual(cur.tracks[0].winMs.toFixed(3), prev.tracks[0].winMs.toFixed(3),
          '第 ' + lv + ' 关报了「' + d.text + '」，可生效判定带和上一关一样');
      }
    }
  }
});

check('五档难度表不许留没人读的旋钮（windowPace / speed / window 已退役）', function () {
  for (const d of data.STAGES) {
    assert.ok(!Object.prototype.hasOwnProperty.call(d, 'windowPace'),
      d.key + ' 档还留着 windowPace：WINDOW_KEYS 已删，没有任何参数乘它');
  }
  // 反向也守一句：判定窗确实还随档收紧，别把「删死参数」做成「整张表不动」。
  const m = data.getMethod('absorb');
  assert.ok(data.buildParams(m, 'novice').winMs > data.buildParams(m, 'full').winMs,
    '五档的判定窗没有随档收紧');
  // 旧版的三个键已经没人读了：留着它们会让人以为这门还是「一个恒定速度的光环」。
  for (const k of ['novice', 'full']) {
    const q = data.buildParams(m, k);
    assert.ok(!Object.prototype.hasOwnProperty.call(q, 'speed'), k + ' 档还留着 speed');
    assert.ok(!Object.prototype.hasOwnProperty.call(q, 'window'), k + ' 档还留着 window');
    assert.ok(!Object.prototype.hasOwnProperty.call(q, 'beats'), k + ' 档还留着 beats');
  }
});

check('择大辨微：数距真的造进盘面，且分色不把答案标出来', function () {
  // 8b-5d 只守「生成了有人读、读了有人喂」，守不住「盘面是不是真的长这样」。
  // 这一条直接读开局的盘面数字：最大与次大之差必须等于本关数距 + 轮内递进，
  // 且同批数字同一个色（按绝对数值分档会在 9/10、49/50 临界处泄露答案）。
  const m = data.getMethod('zeda');
  for (const lv of [1, 100, 200]) {
    installClock();
    try {
    const q = data.buildParamsAt(m, lv);
    const made = makeCtx(m, {}, q);
    made.c.start();
    const vm = made.st.vm;
    assert.ok(vm.biggest, '第 ' + lv + ' 关没把盘面数字交给 vm');
    const vals = vm.biggest.values.filter(function (v) { return v > 0; })
      .slice().sort(function (a, b) { return b - a; });
    const want = Math.max(1, q.nearGap + Math.max(0, Math.round((q.rounds - 1) * 0.25)));
    assert.strictEqual(vals[0] - vals[1], want,
      '第 ' + lv + ' 关首批数距不是 ' + want + '：参数没造进盘面');
    assert.strictEqual(vals[0], vm.biggest.max, '第 ' + lv + ' 关最大值与盘面对不上');
    const tones = new Set(vm.cells.filter(function (c) { return c.label; })
      .map(function (c) { return c.tone; }));
    assert.strictEqual(tones.size, 1, '第 ' + lv + ' 关同批数字分了色，答案会漏出来');
    made.c.destroy();
    } finally { restoreClock(); }
  }
});

check('三连互换：九类方向真的生效，不是参数表里的摆设', function () {
  // 这一条守「生成了 ≠ 生效了」：特效 / 目标 / 主动 / 劫变四个新键，
  // 都得在真判定或真控制器里看得见。参数写进表里没人读，静态校验照样全绿。
  const mod = require('../minigames/match.js');
  const FX = mod.FX;
  const m = sanxiu();
  const cols = 6; const rows = 6; const kinds = 5;
  const blank = function () {
    const b = [];
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      b.push(((r * 2 + c) % kinds) + 1);
    }
    return b;
  };

  // 玩法结构：四连出直行、五连出同色、横竖交叉出四邻。
  const four = blank();
  for (let c = 0; c < 4; c += 1) four[c] = 3;
  const s4 = mod.matchShape(four, cols, rows, 3);
  assert.strictEqual(s4.fx, FX.row, '四连没凝出直行符');
  const five = blank();
  for (let c = 0; c < 5; c += 1) five[c] = 3;
  assert.strictEqual(mod.matchShape(five, cols, rows, 4).fx, FX.rainbow, '五连没凝出同色符');
  const cross = blank();
  for (let c = 0; c < 3; c += 1) cross[c] = 3;
  for (let r = 0; r < 3; r += 1) cross[r * cols] = 3;
  assert.strictEqual(mod.matchShape(cross, cols, rows, 0).fx, FX.bomb, '横竖交叉没凝出四邻符');
  // 符的清盘范围真落到盘上：横行符清整行，不是「换个颜色」。
  const fxBoard = blank();
  fxBoard[8] = FX.row;
  const cleared = mod.triggerFx(fxBoard, cols, rows, 8, kinds, 2);
  assert.strictEqual(cleared.length, cols, '直行符没有清整行');
  assert.ok(cleared.indexOf(8) >= 0, '直行符自己没被消耗');

  installClock();
  try {
    const mk = function (lv) {
      let vm = null;
      const ctrl = mod.create({
        params: data.buildParamsAt(m, lv), difficulty: 1, perks: { tier: 0 },
        tip: 't', theme: {}, render: function (v) { vm = v; }, finish: function () {},
      });
      return { ctrl: ctrl, get vm() { return vm; } };
    };
    // 目标类型：每段都有本局目标。终点是「做成即收工」，没有目标的段就没有终点条件——
    // 那一段的玩家会学成「等表走完」，而不是这一门的节奏。段一是「收灵草」，不指定色。
    const s1 = mk(1);
    s1.ctrl.start();
    assert.ok(/目标/.test(s1.vm.meter.label), '首段没有本局目标：这一档没有终点条件');
    assert.ok(/收灵草/.test(s1.vm.meter.label), '首段的目标不是「收灵草」：' + s1.vm.meter.label);
    s1.ctrl.destroy();
    const s2 = mk(11);
    s2.ctrl.start();
    assert.ok(/目标/.test(s2.vm.meter.label), '入门段没有本局目标进度');
    assert.ok(/收够指定色/.test(mod.lines(data.buildParamsAt(m, 11)).items.join(' ')),
      '评级卡旁没写清本局目标');
    s2.ctrl.destroy();

    // 主动手段：挪苗花息换一次不要求相邻的操作，次数用尽就不能再启。
    // 这一条只验挪苗的代价，所以把石皮关掉：段二盘上有 2 格封住的牌，
    // findMove 返回的第一对可能正好踩在封格上，点了不扣息——那会让这条断言变成看运气。
    let vm2 = null;
    const c2 = mod.create({
      params: Object.assign({}, data.buildParamsAt(m, 11), { seals: 0 }), difficulty: 1, perks: { tier: 0 },
      tip: 't', theme: {}, render: function (v) { vm2 = v; }, finish: function () {},
    });
    c2.start();
    assert.ok(vm2.extras.showActive, '段二没有挪苗按钮（主动手段没生效）');
    const before = vm2.timeText;
    c2.active();
    assert.ok(/点两株/.test(vm2.activeLabel), '挪苗启用了却没告诉玩家现在点两株');
    const mv = mod.findMove(vm2.match.board.slice(), vm2.match.cols, vm2.match.rows);
    assert.ok(mv, '开局没有可行换位');
    c2.tap(mv[0]); c2.tap(mv[1]);
    assert.notStrictEqual(vm2.timeText, before, '挪苗没扣息：主动手段没有代价');
    assert.ok(/挪苗 0/.test(vm2.activeLabel), '挪苗次数没减少');
    c2.destroy();

    // 本局变数：圆满段先二选一，选完才发盘、才开始走时辰；S 线随改后的时辰现算。
    let vm5 = null;
    const c5 = mod.create({
      params: data.buildParamsAt(m, 502), difficulty: 1, perks: { tier: 0 },
      tip: 't', theme: {}, render: function (v) { vm5 = v; }, finish: function () {},
    });
    c5.start();
    assert.strictEqual(vm5.phase, 'twist', '圆满段没有先让玩家二选一');
    assert.ok(vm5.twistPick && vm5.twistPick.length === 2, '开局没有摆出两条劫变');
    assert.ok(vm5.twistPick.every(function (x) { return x.tight && x.loose; }),
      '劫变不是一紧一松配对（缺收紧或放开的那一项）');
    const pick = vm5.twistPick[0];
    c5.pickTwist(pick.id);
    assert.strictEqual(vm5.phase, 'playing', '选完劫变还没开局');
    assert.strictEqual(vm5.twistPick, null, '选完劫变还在弹选择框');
    assert.ok(vm5.cells.some(function (c) { return c.crest; }), '选完劫变盘上还没有牌');
    assert.ok(data.matchTwistChoices(502).some(function (x) { return x.id === pick.id; }),
      '选到了不在候选里的劫变');
    // 同一关重开还是那两条：随机只决定摆哪两条，不决定玩家抽到哪条。
    assert.deepStrictEqual(data.matchTwistChoices(502).map(function (x) { return x.id; }),
      data.matchTwistChoices(502).map(function (x) { return x.id; }), '同一关候选随重开变了');
    c5.destroy();
  } finally { restoreClock(); }
});

console.log('\n小游戏层断言全部通过（' + passed + ' 项）');
