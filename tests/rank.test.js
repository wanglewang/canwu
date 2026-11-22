'use strict';

// 品阶与难度体系常驻断言：零依赖，node tests/rank.test.js 直接跑。
//
// 一句话约定：熟练度只由「评级 + 连 S 层数」决定；品阶（天地玄黄）、难度档、境界只管
// 「一局烧多少灵力」与战力。连 S 与回关折减互不串联 —— 任何一条被写回另一条身上，
// 这里的断言都要炸。参悟不产资源，灵力只从闭关、份例与灵石兑换来（data/economy.js）。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const game = require('../utils/game.js');
const practice = require('../data/practice.js');
const skills = require('../data/skills.js');
const world = require('../data/world.js');
const index = require('../minigames/index.js');
const L = require('../data/levels.js');

const ROOT = path.join(__dirname, '..');

// 内核 2026-11 起按关注点拆到 utils/game/ 下（state / profs / idle / settle / battle / realm / view）。
// 读源码一律走下面两个：要整体就拼整个目录，要某一段就定向读子文件。
// 只读门面 utils/game.js 的话，负向断言（「不许再出现 xxx」）会静默通过，闸门等于被拆掉。
function engineSrc() {
  const dir = path.join(ROOT, 'utils', 'game');
  if (!fs.existsSync(dir)) return fs.readFileSync(path.join(ROOT, 'utils/game.js'), 'utf8');
  return fs.readdirSync(dir)
    .filter(function (f) { return f.endsWith('.js'); })
    .map(function (f) { return fs.readFileSync(path.join(dir, f), 'utf8'); })
    .join('\n');
}

function enginePart(name) {
  const p = path.join(ROOT, 'utils', 'game', name);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return fs.readFileSync(path.join(ROOT, 'utils/game.js'), 'utf8');
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log('OK  ' + name);
}

// 站到第 idx 段（0 起）的开头：把前面几段整段走通。
// 段位不再由玩家挑，也不再由熟练度换，只是「已走通几关」的另一个说法。
function clearedThrough(idx) {
  return idx <= 0 ? 0 : L.STAGE_GATES[idx - 1];
}

// 把某门的状态摆成「已走通 clear 关」——关号只进不退，这是唯一的进度入口。
function setCleared(s, skillId, clear) {
  s.skills[skillId].cleared = clear;
  return s;
}

function freshState(skillId, prof, realmIndex) {
  const s = game.createNewState();
  if (skillId) {
    s.skills[skillId].unlocked = true;
    s.skills[skillId].prof = prof || 0;
  }
  if (typeof realmIndex === 'number') s.realmIndex = realmIndex;
  // 参悟现在要先付灵力：这些断言测的是公式，不是钱包，一律给足。
  s.resources.qi = 100000;
  return s;
}

// ---------------------------------------------------------------- 常量层

check('四品阶：天地玄黄，耗气与属性系数逐级递增', function () {
  assert.strictEqual(practice.TIERS.length, 4);
  assert.deepStrictEqual(practice.TIERS.map(function (t) { return t.name; }), ['黄', '玄', '地', '天']);
  assert.deepStrictEqual(practice.TIERS.map(function (t) { return t.qiCost; }), [1, 1.15, 1.3, 1.45]);
  for (let i = 1; i < practice.TIERS.length; i += 1) {
    assert.ok(practice.TIERS[i].attr > practice.TIERS[i - 1].attr, '属性系数未递增');
    assert.ok(practice.TIERS[i].qiCost > practice.TIERS[i - 1].qiCost, '运功耗气系数未递增');
    assert.strictEqual(practice.TIERS[i].resource, undefined, '品阶还留着「资源产出倍率」的旧字段');
    assert.ok(practice.TIERS[i].needRealm >= practice.TIERS[i - 1].needRealm, '境界门槛倒挂');
    assert.ok(practice.TIERS[i].maxRealm >= practice.TIERS[i - 1].maxRealm, '可修上限倒挂');
  }
});

check('五段：段界 10/50/200/500/1000，段名与耗气基数逐段抬高', function () {
  const economy = require('../data/economy.js');
  assert.strictEqual(practice.STAGES.length, 5);
  assert.deepStrictEqual(practice.STAGES.map(function (d) { return d.name; }),
    ['未入门', '入门', '小成', '大成', '圆满']);
  // 段不是玩家可挑的档：没有 need（不拿熟练度开门），也没有 open（没有第二个入口）。
  for (const d of practice.STAGES) {
    assert.strictEqual(d.need, undefined, d.name + ' 还留着 need：段位已经不由熟练度解锁了');
    assert.strictEqual(d.open, undefined, d.name + ' 还留着 open：段位不是玩家挑的');
  }
  assert.deepStrictEqual(practice.STAGES.map(function (d) { return d.qi; }), economy.RUN_QI,
    '五段的耗气基数没跟 economy.RUN_QI 对齐');
  for (const d of practice.STAGES) {
    assert.strictEqual(d.mult, undefined, d.name + ' 还挂着早就没人用的收益倍率');
  }
  for (let i = 1; i < practice.STAGES.length; i += 1) {
    assert.ok(practice.STAGES[i].pace < practice.STAGES[i - 1].pace, '后一段节奏没有更紧');
    assert.ok(practice.STAGES[i].goal > practice.STAGES[i - 1].goal, '后一段目标没有更高');
    assert.ok(practice.STAGES[i].qi > practice.STAGES[i - 1].qi, '后一段耗气没有更贵');
  }
  // 段界是全系统唯一的关卡分层真源：10 + 40 + 150 + 300 + 500 = 1000。
  assert.deepStrictEqual(practice.STAGES.map(function (d) { return d.from; }), [1, 11, 51, 201, 501]);
  assert.deepStrictEqual(practice.STAGES.map(function (d) { return d.to; }), [10, 50, 200, 500, 1000]);
  assert.deepStrictEqual(practice.STAGES.map(function (d) { return d.depth; }), [0, 1, 2, 3, 4]);
});

check('熟练度六阶仍是硬顶，但不再兼任难度门槛', function () {
  assert.strictEqual(world.TIERS.length, 6);
  assert.deepStrictEqual(world.TIERS.map(function (t) { return t.threshold; }),
    [0, 300, 1500, 6000, 24000, 99999]);
  // 六阶火候还在（属性加成 ×1→×5 靠它），但它们已经不是关卡的门：
  // 关卡只看「走通了几关」，火候不换关号、不开段。
  assert.ok(practice.STAGES.every(function (d) { return d.need === undefined; }),
    '还有段位拿熟练度当门槛');
  assert.strictEqual(world.PROF_MAX, 99999);
  assert.strictEqual(world.PROF_C_RUNS, 9999);
  assert.strictEqual(world.PROF_S_RUNS, 84, '全程不断 S 的理论最少局数变了');
  assert.deepStrictEqual(world.PROF_BASE, { S: 34, A: 23, B: 15, C: 10, F: 0 });
  assert.strictEqual(world.COMBO_STEP, 1.5);
  assert.strictEqual(world.COMBO_MAX, 10);
});

check('连 S 曲线：1～10 连逐局独立取整，第 11 连起锁死 1307', function () {
  const table = [34, 51, 77, 115, 172, 258, 387, 581, 871, 1307];
  assert.deepStrictEqual(world.COMBO_TABLE, table, '1～10 连对照表不对');
  assert.strictEqual(world.COMBO_ROUND, 3853, '一轮十连合计不是 3853');
  assert.strictEqual(world.COMBO_CAP_GAIN, 1307);
  for (let k = 1; k <= 10; k += 1) {
    assert.strictEqual(world.comboGain(k), Math.round(34 * Math.pow(1.5, k - 1)),
      '第 ' + k + ' 连不是「34 × 1.5^(k-1) 一次取整」');
  }
  // 第 3 连精确值 76.5 取 77，与 A 的 22.5 取 23 同一个进位方向。
  assert.strictEqual(world.comboGain(3), 77);
  assert.strictEqual(world.PROF_BASE.A, 23);
  // 每局独立算，不拿上一局整数接着乘：第 4 连 115，不是 77 × 1.5 = 116。
  assert.notStrictEqual(world.comboGain(4), Math.round(world.comboGain(3) * 1.5));
  for (let k = 11; k <= 30; k += 1) {
    assert.strictEqual(world.comboGain(k), 1307, '第 ' + k + ' 连没锁死封顶值');
  }
});

check('评级倍率只剩 buff 档位用途：不进熟练度，也不进资源', function () {
  assert.deepStrictEqual(world.GRADE_FACTOR, { S: 1.5, A: 1.2, B: 1.0, C: 0.6, F: 0 });
  // 资源产出从参悟里整体撤出后，这条倍率不再有第二个出口。
  assert.strictEqual(world.MAX_MULTIPLIER, undefined, 'MAX_MULTIPLIER 已随资源产出退役');
  assert.strictEqual(world.REALM_DECAY, undefined, 'REALM_DECAY 已换成「超上限耗气 ×1.5」');
  assert.strictEqual(world.CROSS_BONUS, undefined, 'CROSS_BONUS 已换成「触类旁通耗气 ×0.92」');
});

check('数据层：十五门功法、品阶合法（天阶 2026-11 起暂空）', function () {
  assert.strictEqual(skills.SKILLS.length, 15);
  const tiers = {};
  for (const s of skills.SKILLS) {
    assert.ok(practice.TIERS.some(function (t) { return t.key === s.tier; }), s.name + ' 品阶非法');
    assert.ok(s.kind === 'main' || s.kind === 'skill', s.name + ' 分类非法');
    assert.ok(practice.METHOD_MAP[s.method], s.name + ' 指向不存在的参悟方式');
    tiers[s.tier] = true;
  }
  // 删掉唯一天阶功法后不再要求四阶都有人；黄阶是整套刻度的基准，它空了才算体系悬空。
  assert.ok(tiers.huang, '黄阶一门功法都没有，品阶体系悬空');
});

check('同族共用游戏族，族内变体不重样', function () {
  const byType = {};
  for (const s of skills.SKILLS) {
    if (!byType[s.type]) byType[s.type] = [];
    byType[s.type].push(practice.getMethod(s.method).game);
  }
  for (const type of Object.keys(byType)) {
    assert.strictEqual(new Set(byType[type]).size, byType[type].length, type + ' 族内出现重复玩法');
  }
  const family = practice.familyOf('剑法');
  assert.ok(family.core && family.kind === 'skill');
  assert.strictEqual(practice.familyOf('心法').kind, 'main');
});

check('同族同阶可并列，谱系不再按阶取槽丢门', function () {
  const s = game.createNewState();
  for (const f of game.getFamilies(s)) {
    // 谱系四个槽：有功法的一格必须有名字，缺变体的才允许是空档。
    assert.strictEqual(f.slots.length, 4, f.type + ' 谱系刻度不是四阶');
    // 同族同阶可并列（心法族两门黄阶）：每门功法都要能落在某个槽的 items 里。
    const shown = f.slots.reduce(function (n, sl) { return n + sl.items.length; }, 0);
    assert.strictEqual(shown, f.items.length, f.type + ' 谱系显示的功法数与实际不符（同阶被盖掉）');
  }
});

check('阵法难，挂地阶；扫雷轻，挂黄阶', function () {
  const zhen = skills.getSkill('zhen');
  const leifu = skills.getSkill('leifu');
  assert.strictEqual(zhen.tier, 'di', '阵灯推演是十五门里最费脑的一门，不该留在低阶');
  assert.strictEqual(leifu.tier, 'huang', '数格辨禁难度低于阵法，应挂黄阶');
  // 改名不动 id：存档、纪录、参悟进度都按 id 索引。
  assert.strictEqual(zhen.id, 'zhen');
  assert.ok(zhen.name.indexOf('入门') < 0, '地阶功法还叫「入门」，名实不副');
});

// ---------------------------------------------------------------- 段位

check('段位只由「已走通几关」判定，与熟练度、品阶无关', function () {
  // 站在第 cleared+1 关，就属于那一关所在的段：走通 10 关 → 站在第 11 关 → 入门。
  const cases = [
    [0, 0, '未入门'], [1, 0, '未入门'], [8, 0, '未入门'], [9, 0, '未入门'],
    [10, 1, '入门'], [49, 1, '入门'],
    [50, 2, '小成'], [199, 2, '小成'],
    [200, 3, '大成'], [499, 3, '大成'],
    [500, 4, '圆满'], [999, 4, '圆满'],
    [1000, 5, '大圆满'],
  ];
  for (const c of cases) {
    assert.strictEqual(L.stageIndexOfCleared(c[0]), c[1], '走通 ' + c[0] + ' 关的段号不对');
    assert.strictEqual(L.stageNameOfCleared(c[0]), c[2], '走通 ' + c[0] + ' 关的段名不对');
    assert.strictEqual(practice.stageIndexOfCleared(c[0]), c[1]);
    assert.strictEqual(practice.stageNameOfCleared(c[0]), c[2]);
  }
  // 走通 1000 关之后再没有段，只有「大圆满」这一个终点说法。
  assert.strictEqual(L.FINAL_STAGE_NAME, '大圆满');
  assert.strictEqual(L.stageIndexOfCleared(1000), L.STAGES.length);
  // 熟练度再高也不换段：这只证明「段不看 prof」，不看别的。
  assert.strictEqual(practice.stageIndexOfCleared(0), 0, '熟练度还在换段');
  const s = freshState('jingxin', 99999, 1);
  assert.strictEqual(practice.curLevelOf(s.skills.jingxin), 1, '满熟练度把玩家推到了后面的关');
  assert.strictEqual(practice.stageIndexOfCleared(practice.clearedOf(s.skills.jingxin)), 0);
});

// ---------------------------------------------------------------- 结算公式

check('熟练度基础值不吃品阶：各阶同为 15 点，品阶只抬高耗气', function () {
  const cases = [
    { id: 'jian', realm: 0 },
    { id: 'jingxin', realm: 1 },
    { id: 'zhen', realm: 2 },
  ];
  const gains = [];
  const costs = [];
  for (const c of cases) {
    const s = freshState(c.id, 0, c.realm);
    const r = game.applyPractice(s, c.id, 'B', { score: 0 });
    assert.strictEqual(r.realmAbove, false, c.id + ' 不该超可修上限');
    gains.push(r.gain);
    costs.push(r.qiCost);
  }
  assert.deepStrictEqual(gains, [15, 15, 15], '品阶插手了熟练度');
  // 时长系数各不相同，所以不比绝对值，只比「品阶这一层」：逐阶递增。
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1],
      '第 ' + (i + 1) + ' 阶的耗气没有更高：' + costs.join(' / '));
  }
});

check('熟练度基础值不吃关卡：每一段的当前关都是 15 点，段位只抬耗气', function () {
  // 站在本段第一关打 B：不管哪一段，都是基础值 B = 15 点。段只改参数与耗气，不改公式。
  const costs = [];
  practice.STAGES.forEach(function (d, i) {
    const clear = clearedThrough(i);
    const curNo = clear + 1;
    const s = setCleared(freshState('jingxin', 0, 1), 'jingxin', clear);
    assert.strictEqual(practice.curLevelOf(s.skills.jingxin), curNo, d.name + ' 的当前关不对');
    const r = game.applyPractice(s, 'jingxin', 'B', { level: curNo, score: 0 });
    assert.strictEqual(r.levelBelowCap, false, d.name + ' 的首关被当成回关了');
    assert.strictEqual(r.stageName, d.name, d.name + ' 判到了别的段');
    assert.strictEqual(r.gain, world.PROF_BASE.B, d.name + ' 的熟练度不是基础值');
    costs.push(r.qiCost);
  });
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1],
      '第 ' + (i + 1) + ' 段首关的耗气没有更高：' + costs.join(' / '));
  }
});

check('回打更早的段只折两道：关号与段基数，不复用旧的「逐档折半」', function () {
  // 走通 799 关（站在第 800 关），回打第 1 关：34 × (1/800 × 7/32) → 0 点。
  // 旧版「打低档再逐档折半」那一道刀必须消失——它是一整段一刀，
  // 而这里两道尺子都是连续的，玩家按两个除法就能自己复算。
  const s = setCleared(freshState('jingxin', 0, 1), 'jingxin', 799);
  const r = game.applyPractice(s, 'jingxin', 'S', { level: 1, score: 0 });
  assert.strictEqual(r.stageKey, 'novice', '第 1 关不在未入门段');
  assert.strictEqual(r.levelGap, 799, '没报出退了几关');
  assert.strictEqual(r.comboActive, false, '回打还叠连 S');
  assert.strictEqual(r.comboNow, 0, '回打 S 叠了层');
  assert.strictEqual(r.gain, practice.profByLevel(world.PROF_BASE.S, 1, 800),
    '回打熟练度没按 本关 ÷ 当前关 × 段基数比 折');
  assert.strictEqual(r.gain, 0, '34 × 1/800 × 7/32 应四舍五入为 0');

  // 打到半程第 400 关（大成段 24，当前关在圆满段 32）：34 × (400/800 × 24/32) → 13。
  const half = setCleared(freshState('jingxin', 0, 1), 'jingxin', 799);
  const rh = game.applyPractice(half, 'jingxin', 'S', { level: 400, score: 0 });
  assert.strictEqual(rh.gain, 13, '回打第 400 关应是 34 × (0.5 × 24/32) → 13');
  assert.strictEqual(rh.comboNow, 0, '回打第 400 关还叠了连 S');
});

check('回关折减：按 本关 ÷ 当前关 × 段基数比 折，当前关全额，不叠连 S，层数原样保留', function () {
  // 已走通 20 关 → 当前关 21（入门段 11）。回打 21 全额；回打 10（未入门 7）是 ×10/21 × 7/11。
  const curNo = 21;
  assert.strictEqual(practice.levelFactor(21, 21), 1, '当前关不是 ×1');
  // 两把尺子缺一不可：只按关号折时，「停在原地刷上一关」把当前关钉死，折减一直 ×0.95，
  // 而耗气按低段报 —— 每点灵力收益反而高于推进（实测反超 1.8 倍）。
  const economy = require('../data/economy.js');
  assert.strictEqual(practice.levelFactor(10, 21), (10 / 21) * (economy.RUN_QI[0] / economy.RUN_QI[1]),
    '回关系数不是 本关 ÷ 当前关 × 段基数比');
  assert.strictEqual(practice.levelFactor(20, 21), 20 / 21, '同段回关不该被第二把尺子再折一次');
  assert.strictEqual(practice.levelFactor(99, 21), 1, '回关系数不该超过 1');

  const top = setCleared(freshState('jingxin', 0, 1), 'jingxin', curNo - 1);
  const rt = game.applyPractice(top, 'jingxin', 'B', { level: curNo, score: 0 });
  assert.strictEqual(rt.gain, world.PROF_BASE.B, '当前关的 B 不是全额');
  assert.strictEqual(rt.levelBelowCap, false);

  const low = setCleared(freshState('jingxin', 0, 1), 'jingxin', curNo - 1);
  const rl = game.applyPractice(low, 'jingxin', 'S', { level: 10, score: 0 });
  assert.strictEqual(rl.levelBelowCap, true, '回关没被标成折减');
  assert.strictEqual(rl.levelGap, 11, '没报出退了几关');
  assert.strictEqual(rl.gain, practice.profByLevel(world.PROF_BASE.S, 10, curNo),
    '回关熟练度没按 本关 ÷ 当前关 × 段基数比 折');
  assert.strictEqual(rl.gain, 10, 'S 回打第 10 关应是 34 × (10/21 × 7/11) = 10.3 → 10');
  assert.strictEqual(rl.comboActive, false, '回关 S 走了连击曲线');
  assert.strictEqual(rl.comboNow, 0, '回关 S 叠了层');
  assert.strictEqual(low.sCombo.jingxin, 0, '回关 S 写进了连击存档');

  // 回关不砍已有层数：连两局 S 后回关打一局 B，层数原样保留；回当前关照接第 3 连。
  const kept = setCleared(freshState('jingxin', 0, 1), 'jingxin', curNo - 1);
  // 每一局都按「打完上一局之后的当前关」出手，否则第二局就成了回关。
  game.applyPractice(kept, 'jingxin', 'S', { level: curNo, score: 0 });
  game.applyPractice(kept, 'jingxin', 'S', { level: curNo + 1, score: 0 });
  assert.strictEqual(kept.sCombo.jingxin, 2);
  const back = game.applyPractice(kept, 'jingxin', 'B', { level: 5, score: 0 });
  assert.strictEqual(back.comboNow, 2, '回关把连 S 清了');
  assert.strictEqual(back.levelBelowCap, true);
  const third = game.applyPractice(kept, 'jingxin', 'S', { level: curNo + 2, score: 0 });
  assert.strictEqual(third.comboNow, 3);
  assert.strictEqual(third.gain, 77, '回关练手后第 3 连没按 34 × 1.5² 接上');
});

check('回关折减连续无断崖：越退越薄，走通满关后回打第 1 关归零', function () {
  // 最狠的一刀在「走通 1000 关之后回打第 1 关」= 1/1000 × 7/32。
  // 这也替代了旧版「低档再折半」那道封条：一道连续折减比两道乘法更算得清。
  const cur = L.LEVEL_MAX;
  const economy = require('../data/economy.js');
  assert.strictEqual(practice.levelFactor(1, cur),
    (1 / cur) * (economy.RUN_QI[0] / economy.RUN_QI[4]), '满关回打第 1 关的系数不对');
  assert.strictEqual(practice.profByLevel(world.PROF_BASE.S, 1, cur), 0,
    '满关回打第 1 关的 S 应是 34 × 1/1000 → 0 点');

  // 连续：退一关只差一点点，不存在「退一段砍一半」的台阶。
  let prev = 0;
  for (let lv = 1; lv <= cur; lv += 1) {
    const fv = practice.levelFactor(lv, cur);
    assert.ok(fv >= prev, '回关系数出现倒挂：第 ' + lv + ' 关');
    prev = fv;
  }
  assert.ok(practice.levelFactor(cur - 1, cur) > 0.99, '退一关就掉了超过 1%');

  // 失败仍是 0 点，且不分关一律断连。
  const s = setCleared(freshState('jingxin', 0, 1), 'jingxin', cur);
  s.sCombo.jingxin = 7;
  const r = game.applyPractice(s, 'jingxin', 'F', { level: 1, score: 0 });
  assert.strictEqual(r.gain, 0, '失败还给了熟练度');
  assert.strictEqual(r.comboNow, 0, '回关失败没断连');
});

check('失败：F 算一局，但熟练度为零——气照烧、灵石不动、连 S 归零', function () {
  // F 有两种来历，这里测的是「玩到一半被判负」的那种：
  // 它是一局真实打完的结果，所以要进结算（报价、断连），但结论是这一局作废——
  // 不是「最低一档」，所以一分熟练度都没有。主动结束不调 applyPractice，走 breakCombo()。
  const s = freshState('jingxin', 1200, 1);
  s.sCombo.jingxin = 2;
  const qiBefore = s.resources.qi;
  const stoneBefore = s.resources.stone;
  const profBefore = s.skills.jingxin.prof;
  const r = game.applyPractice(s, 'jingxin', 'F', { score: 0 });
  assert.strictEqual(r.gradeFactor, 0, '失败倍率不是 0');
  assert.strictEqual(r.wiped, true, '失败没被标记成整局作废');
  assert.strictEqual(r.gain, 0, '失败还给了熟练度');
  assert.strictEqual(s.skills.jingxin.prof, profBefore, '失败把熟练度写进存档了');
  // 气在起手时就烧掉了：失败不退，这才是「失败」真正的分量。
  assert.ok(r.qiCost > 0, '失败这一局没有报价');
  assert.strictEqual(s.resources.qi, qiBefore - r.qiCost, '失败没扣灵力（或扣错了数）');
  assert.strictEqual(s.resources.stone, stoneBefore, '失败动了灵石——灵石只从对战来');
  assert.strictEqual(s.buff.multiplier, 1, '失败还给了挂机加成');
  assert.strictEqual(r.comboNow, 0, '失败没有断连');
  assert.strictEqual(s.sCombo.jingxin, 0, '失败后存档里的连 S 没清');

  // 对照：同一门、同一档打出 S，熟练度必须有——F 与 S 是「有」和「没有」，不是「差几倍」。
  const s2 = freshState('jingxin', 1200, 1);
  const rs = game.applyPractice(s2, 'jingxin', 'S', { score: 0 });
  assert.ok(rs.gain > 0, 'S 没有熟练度收益');
  assert.ok(rs.qiCost > 0, 'S 这一局没有报价');

  // 失败不立纪录：没走完的这一局不该成为「本门最佳」。
  assert.strictEqual(s.records.jingxin, undefined, '失败被写成了本门纪录');
  // 而同一存档之后打出 S，纪录照常出现。
  const s3 = freshState('jingxin', 1200, 1);
  game.applyPractice(s3, 'jingxin', 'F', { score: 0 });
  game.applyPractice(s3, 'jingxin', 'S', { score: 640 });
  assert.strictEqual(s3.records.jingxin.score, 640, '失败之后的正常一局没立纪录');
});

check('参悟是纯支出：一百局里灵石一分不动，灵力只按 qiCost 减', function () {
  // 这条是「双货币分工」的底线守卫：参悟一旦又开始产资源，整张货币表就不成立了。
  // 灵感来自一个真实漏洞——旧版 6% 的机缘里有 88% 会给灵力或灵石，
  // 一晚上练三十局摸到的灵石比打十场切磋还多。
  const economy = require('../data/economy.js');
  const s = freshState('jingxin', 1200, 1);
  s.resources.qi = 5000;
  const stoneBefore = s.resources.stone;
  let spent = 0;
  for (let i = 0; i < 60; i += 1) {
    const before = s.resources.qi;
    const r = game.applyPractice(s, 'jingxin', 'B', { score: i });
    assert.strictEqual(r.ok, true, '第 ' + (i + 1) + ' 局没开起来');
    assert.strictEqual(before - s.resources.qi, r.qiCost,
      '第 ' + (i + 1) + ' 局的灵力差不是 qiCost');
    assert.strictEqual(r.qi, undefined, '结算还在返回灵力产出');
    assert.strictEqual(r.stone, undefined, '结算还在返回灵石产出');
    if (r.fortune) {
      assert.strictEqual(r.fortune.type, 'skill',
        '机缘又给出了资源：' + r.fortune.text);
    }
    spent += r.qiCost;
  }
  assert.strictEqual(s.resources.stone, stoneBefore, '参悟产出了灵石');
  assert.strictEqual(s.resources.qi, 5000 - spent, '灵力账不平');
  // 机缘的概率常量只有一个出处，且确实是「百局一册」的量级。
  assert.strictEqual(economy.FORTUNE_SCROLL_RATE, 0.012);
  // applyPractice 在 settle.js 里；函数体切片必须在同一个文件内取，跨文件会切到 module.exports。
  const eng = enginePart('settle.js');
  // 只在 applyPractice 的函数体里找：闭关与对战当然要给灵力灵石，参悟不许。
  const start = eng.indexOf('function applyPractice(');
  const end = eng.indexOf('\nfunction ', start + 10);
  assert.ok(start > 0 && end > start, '没找到 applyPractice 的函数体');
  const body = eng.slice(start, end);
  assert.ok(!/resources\.(qi|stone) \+=/.test(body),
    'applyPractice 里还有一处直接给存档加灵力或灵石');
});

check('默认关 = 已走通的关数 + 1（与熟练度无关）', function () {
  // 一门只有一条线，没有「挑哪一档」这个动作：当前关只由进度推出来。
  const cases = [
    [0, 1], [1, 2], [9, 10], [10, 11], [49, 50], [50, 51],
    [199, 200], [200, 201], [499, 500], [500, 501], [999, 1000], [1000, 1000],
  ];
  for (const c of cases) {
    assert.strictEqual(practice.curLevelOf({ cleared: c[0] }), c[1],
      '走通 ' + c[0] + ' 关之后当前关不对');
  }
  // 熟练度再高也不推关：这只证明「关不看 prof」，不看别的。
  assert.strictEqual(practice.curLevelOf({ prof: 99999 }), 1, '熟练度还在推进关卡');
});

// ---------------------------------------------------------------- 关卡
check('1000 关：五段 10/40/150/300/500，段界关属于本段', function () {
  assert.strictEqual(L.LEVEL_MAX, 1000);
  assert.strictEqual(L.STAGES.length, 5, '不是五段');
  const sizes = [];
  let total = 0;
  for (let i = 0; i < L.STAGES.length; i += 1) {
    const st = L.STAGES[i];
    const n = st.to - st.from + 1;
    sizes.push(n);
    total += n;
    assert.strictEqual(st.key, practice.STAGES[i].key, '第 ' + (i + 1) + ' 段的键与档位表分叉');
    assert.strictEqual(st.depth === undefined ? i : st.depth, i, '第 ' + (i + 1) + ' 段的 depth 不对');
    if (i > 0) assert.strictEqual(st.from, L.STAGES[i - 1].to + 1, '段之间有缝或重叠');
  }
  assert.deepStrictEqual(sizes, [10, 40, 150, 300, 500], '五段关数不是 10/40/150/300/500');
  assert.strictEqual(total, 1000, '五段加起来不是 1000 关');
  assert.deepStrictEqual(L.STAGE_GATES, [10, 50, 200, 500, 1000], '段界关不是 10/50/200/500/1000');
  // 段界关算在「本段」：走通第 10 关才站在第 11 关（入门）。
  assert.strictEqual(L.stageOfLevel(1), 0);
  assert.strictEqual(L.stageOfLevel(10), 0);
  assert.strictEqual(L.stageOfLevel(11), 1);
  assert.strictEqual(L.stageOfLevel(50), 1);
  assert.strictEqual(L.stageOfLevel(1000), 4);
  const entryRange = L.stageRange(1);
  assert.strictEqual(entryRange.from, 11, '入门从第几关开始不对');
  assert.strictEqual(entryRange.to, 50, '入门到第几关结束不对');
  assert.strictEqual(L.levelInStage(11), 1, '入门第一关不是本段第 1 关');
  assert.strictEqual(L.levelInStage(50), 40, '入门末关不是本段第 40 关');
});

check('关卡换算只剩老档迁移用：六锚与火候表同源、只增不减', function () {
  // 现行规则是「1000 关一条线、走通推进」，关卡不再由熟练度算。
  // legacyLevelFromProf() 只服务一件事：没有 cleared 字段的老存档里只有 prof，
  // 迁移时按它反推老玩家走到 200 关制的哪一关。所以这里守的是「换算本身没坏」。
  for (let i = 0; i < L.LEVEL_PROF_STEPS.length; i += 1) {
    assert.strictEqual(L.LEVEL_PROF_STEPS[i], world.TIERS[i].threshold,
      '第 ' + i + ' 个熟练度锚与火候表分叉');
  }
  assert.strictEqual(L.legacyLevelFromProf(0), 1);
  assert.strictEqual(L.legacyLevelFromProf(299), 40);
  assert.strictEqual(L.legacyLevelFromProf(300), 41);
  assert.strictEqual(L.legacyLevelFromProf(1500), 81);
  assert.strictEqual(L.legacyLevelFromProf(6000), 121);
  assert.strictEqual(L.legacyLevelFromProf(24000), 161);
  assert.strictEqual(L.legacyLevelFromProf(99999), 200);
  // 单调：熟练度涨，关号只能涨。这是「关不掉」的迁移依据。
  let prev = 0;
  for (let p = 0; p <= 99999; p += 37) {
    const lv = L.legacyLevelFromProf(p);
    assert.ok(lv >= prev, '熟练度 ' + p + ' 的关号 ' + lv + ' 比前一个小：' + prev);
    prev = lv;
  }
});

// 台阶数的下限按门给：这一门难度是「盘面规格 + 最优步数区间 + 余量」三段离散值。
// 阵灯推演原来凑到 30 级以上，靠的是把 `minSteps` 也塞进收紧表——可那个数乘 0.7 是
// 「段末要求更短的解」，方向是往简单走的，台阶数好看、难度反而倒退。把假台阶去掉之后
// 只剩十级，这里据实给 10：「做不到每段都动就据实写沿用上一段」，别为了让数字好看
// 去动一个方向相反的旋钮。
const STEP_FLOOR = { lights: 10 };

check('一关一段：段内只往难走，每门规格台阶不少于本条门的下限', function () {
  // 「规格台阶」= 相邻两关参数真的不同。规格类玩法（阵灯 3×3→5×5、辨魁 8→16 批）
  // 的难度是盘面规格，规格是离散的，量化到关号刻度上本来就只有十几级台阶。
  // 这条断言守两件事：台阶数不许再掉、方向只许变难。
  for (const m of practice.PRACTICE_METHODS) {
    let changed = 0;
    let prev = null;
    for (let lv = 1; lv <= L.LEVEL_MAX; lv += 1) {
      const p = practice.buildParamsAt(m, lv);
      if (prev) {
        const keys = Object.keys(p).filter(function (k) { return k !== 'level' && k !== 'stage' && p[k] !== prev[k]; });
        if (keys.length) changed += 1;
        for (const k of ['duration', 'timeLimit', 'flashMs', 'gapMs', 'flipMs', 'dropMs', 'msPerNote', 'capFactor', 'budgetSlack']) {
          if (typeof p[k] !== 'number' || typeof prev[k] !== 'number') continue;
          // 段界「回弹」是换盘面的代价（九宫 4×4→6×6 要多给读盘时间），只在段内要求单调。
          if (L.stageOfLevel(lv) !== L.stageOfLevel(lv - 1)) continue;
          assert.ok(p[k] <= prev[k], m.id + ' 第 ' + lv + ' 关的 ' + k + ' 反而放宽了');
        }
      }
      prev = p;
    }
    // 阵灯推演的最优步数只许换段时变：段内把它收紧 = 要求更短的解 = 更简单。
    if (m.game === 'lights') {
      let base = null;
      for (let lv = 1; lv <= L.LEVEL_MAX; lv += 1) {
        const p = practice.buildParamsAt(m, lv);
        if (lv === 1 || L.stageOfLevel(lv) !== L.stageOfLevel(lv - 1)) { base = p; continue; }
        assert.ok(p.minSteps === base.minSteps && p.hiSteps === base.hiSteps,
          '第 ' + lv + ' 关把最优步数区间改了：段内动这个数就是往简单走');
      }
    }
    const floor = STEP_FLOOR[m.game] || 30;
    assert.ok(changed >= floor, m.id + ' 只有 ' + changed + ' 级规格台阶，低于 ' + floor + ' 级的下限');
  }
});

check('换段要报出盘面规格，不许把结构变化藏在毫秒后面', function () {
  // 真机反馈「玩了一百多关没发现任何变化」：换段是长线里唯一一次玩家看得见的
  // 盘面变化，旧版 levelDelta 却按 PACE_KEYS 顺序只报两条，结果第一段里报的全是
  // 「亮起时长 0.66 → 0.65 秒」，换段那次的「气窍 5 → 6 对」被挤掉，五门直接报「同」。
  const struct = practice.LEVEL_STRUCT_KEYS;
  // 段界按轴去重补报的预算轴（capFactor）也是玩家读得懂的结构量，不是毫秒/时辰。
  const budget = practice.SEGMENT_BUDGET_KEYS;
  for (const m of practice.PRACTICE_METHODS) {
    for (const lv of [11, 51, 201, 501]) {
      const d = practice.levelDelta(m, lv);
      const now = practice.buildParamsAt(m, lv);
      const prev = practice.buildParamsAt(m, lv - 1);
      assert.ok(d.length, m.id + ' 第 ' + lv + ' 关换段没报任何变化');
      assert.ok(d[0].chapter === true, m.id + ' 第 ' + lv + ' 关没打换段标记');
      const changed = struct.filter(function (k) {
        return typeof now[k] === 'number' && typeof prev[k] === 'number' && now[k] !== prev[k];
      });
      for (const x of d.slice(1)) {
        // score / cue 是节律判定的「谱型」与「提示层级」：和盘面规格同类，
        // 换段时换的正是这两样（手数在 LEVEL_STRUCT_KEYS 里）。
        assert.ok(x.key === 'sameBoard' || x.key === 'cols' || x.key === 'perPair'
          || x.key === 'score' || x.key === 'cue'
          || struct.indexOf(x.key) >= 0 || budget.indexOf(x.key) >= 0,
        m.id + ' 第 ' + lv + ' 关把「' + x.key + '」当换段变化报了出来（那是毫秒/时辰，不是盘面）');
      }
      if (changed.length) {
        assert.ok(!d.some(function (x) { return x.key === 'sameBoard'; }),
          m.id + ' 第 ' + lv + ' 关明明换了盘，却报「沿用同一副盘」');
        assert.ok(d.length > 1, m.id + ' 第 ' + lv + ' 关有结构变化却一条都没报');
      }
      // 段首关不该是唯一知道「本段规格」的地方：任意一关都要能取到本段规格。
      const label = L.stageRange(L.stageOfLevel(lv)).label;
      for (const later of [lv + 3, lv + 9]) {
        if (L.stageOfLevel(later) !== L.stageOfLevel(lv)) continue;
        assert.ok(practice.stageSpec(m, later).indexOf(label) >= 0,
          m.id + ' 第 ' + later + ' 关取不到本段规格');
      }
    }
  }
});

check('第一关与最后一关不许报「与上一关规格相同」', function () {
  // 真机读准备页：第 1 关和第 1000 关读到的是同一句「与上一关规格相同」。
  // 第一关根本没有上一关；末关的 999 → 1000 又常被整秒取整抹平。
  // 两处必须据实报「起点是什么」和「一千关走下来变了什么」。
  for (const m of practice.PRACTICE_METHODS) {
    const first = practice.levelDelta(m, 1);
    const last = practice.levelDelta(m, L.LEVEL_MAX);
    assert.ok(first.some(function (x) { return x.key === 'start'; }),
      m.id + ' 第一关没报起手规格');
    assert.ok(last.some(function (x) { return x.key === 'final'; }),
      m.id + ' 最后一关没报跨度');
    const said = first.concat(last).map(function (x) { return x.text; }).join(' / ');
    assert.ok(!/与上一关/.test(said), m.id + ' 首关或末关仍在说「与上一关」');
    assert.ok(first[0].text.indexOf('本门第一关：') === 0
      && first[0].text.length > '本门第一关：'.length + 2,
    m.id + ' 第一关没报出起手规格：' + first[0].text);
    assert.ok(/比起手关/.test(last[0].text), m.id + ' 末关没说清跨度：' + last[0].text);
  }
});

check('段内结构副轴：数距沿全书只紧不松，换段不回卷', function () {
  // D7 待拍板方向之一：不靠收时间、不缩盘面，给离散门加一条盘面看得见的结构量。
  // 择大辨微的 nearGap 是「一批数里最大与次大差几」，按全书关号连续收，
  // 按段回卷会让第 11 关比第 10 关更好辨——正是 D9 里那条段末倒挂。
  const m = practice.getMethod('zeda');
  let prev = null;
  for (let lv = 1; lv <= L.LEVEL_MAX; lv += 1) {
    const q = practice.buildParamsAt(m, lv);
    assert.ok(typeof q.nearGap === 'number', '第 ' + lv + ' 关没给数距');
    assert.ok(q.nearGap >= 2, '第 ' + lv + ' 关数距压破 2：C 带会被吃掉');
    if (prev !== null) assert.ok(q.nearGap <= prev, '第 ' + lv + ' 关数距反而放宽了');
    prev = q.nearGap;
  }
  assert.ok(practice.buildParamsAt(m, 1).nearGap > practice.buildParamsAt(m, L.LEVEL_MAX).nearGap,
    '首尾两关数距一样，副轴等于没加');
});

check('关卡由走通推进：越权回落、回关与失败都不推进、满关不越界', function () {
  const s = game.createNewState();
  // 一关都没走通时只有第 1 关：传第 40 关一律回落到第 1 关。
  const r1 = game.applyPractice(s, 'jian', 'B', { level: 40, score: 10 });
  assert.strictEqual(r1.levelFellBack, true, '越权挑关没被回落');
  assert.strictEqual(r1.curLevel, 1);
  assert.strictEqual(r1.level, 1);
  assert.strictEqual(r1.advanced, true, '走通了第 1 关却没推进');
  assert.strictEqual(s.skills.jian.cleared, 1, '进度没记到存档里');
  // 下一局接第 2 关。
  const r2 = game.applyPractice(s, 'jian', 'B', { level: 2, score: 10 });
  assert.strictEqual(r2.levelFellBack, false);
  assert.strictEqual(r2.level, 2);
  assert.strictEqual(s.skills.jian.cleared, 2);
  // 回关：能打，但不推进（已经走过的那一关不该再算一次）。
  const r3 = game.applyPractice(s, 'jian', 'B', { level: 1, score: 10 });
  assert.strictEqual(r3.advanced, false, '回关也推进了进度');
  assert.strictEqual(s.skills.jian.cleared, 2);
  // 失败：不推进。
  const before = s.skills.jian.cleared;
  const r4 = game.applyPractice(s, 'jian', 'F', { level: 3, score: 0 });
  assert.strictEqual(r4.wiped, true);
  assert.strictEqual(r4.advanced, false, '失败把进度推上去了');
  assert.strictEqual(s.skills.jian.cleared, before);
  // 没做成目标（三连互换的终点是「做成即收工」）：这一关也不算走通。
  // 但它是「没做完」，不是「打崩」——熟练度照给，否则卡关一次就等于这一局白练。
  const beforeMiss = s.skills.jian.cleared;
  const r4b = game.applyPractice(s, 'jian', 'C', { level: 3, score: 40, goalMissed: true });
  assert.strictEqual(r4b.goalMissed, true, '结算没标出「目标未达成」');
  assert.strictEqual(r4b.advanced, false, '没做成目标却把进度推上去了');
  assert.ok(r4b.gain > 0, '没做成目标就不给熟练度：参悟练过的功夫不该白练');
  assert.strictEqual(s.skills.jian.cleared, beforeMiss);
  assert.ok(!r4b.fortune, '没走通还能拾到残卷：那「没过」就只是句空话');
  // 满关不越界：重打第 1000 关不再推进，也不会算出第 1001 关。
  const t = game.createNewState();
  t.skills.jian.cleared = L.LEVEL_MAX;
  const r5 = game.applyPractice(t, 'jian', 'S', { level: L.LEVEL_MAX, score: 99 });
  assert.strictEqual(t.skills.jian.cleared, L.LEVEL_MAX, '满关还往前推了');
  assert.strictEqual(r5.advanced, false);
  assert.strictEqual(r5.level, L.LEVEL_MAX);
  assert.strictEqual(r5.curLevel, L.LEVEL_MAX);
  // 老存档里还带着 levelBest，读档时整条忽略、不报错，也不会再被当成进度。
  const loaded = game.normalizeState({ skills: s.skills, worldId: s.worldId, levelBest: { jian: 999 } });
  assert.ok(!('levelBest' in loaded), 'levelBest 该已退役，却还在存档结构里');
  assert.strictEqual(loaded.skills.jian.cleared, 2, '老字段把关卡进度带偏了');
});

check('关卡越界夹回，段内第几关与段内进度都对得上', function () {
  assert.strictEqual(L.clampLevel(0), 1);
  assert.strictEqual(L.clampLevel(-5), 1);
  assert.strictEqual(L.clampLevel(5000), L.LEVEL_MAX);
  // 段内第几关：入门的第 1 关是本段第 1 关，末关是本段第 40 关。
  assert.strictEqual(L.levelInStage(11), 1);
  assert.strictEqual(L.levelInStage(50), 40);
  assert.strictEqual(L.levelInStage(501), 1);
  assert.strictEqual(L.levelInStage(1000), 500);
  assert.strictEqual(L.stageSize(0), 10);
  assert.strictEqual(L.stageSize(1), 40);
  assert.strictEqual(L.stageSize(4), 500);
  // 段内进度：段首关是 1/段长（不是 0），段界关正好 1。
  assert.ok(Math.abs(L.progressOf(11) - 1 / 40) < 1e-9);
  assert.strictEqual(L.progressOf(50), 1);
  assert.strictEqual(L.progressOf(1000), 1);
});

check('滑块让路：预算系数随档收紧，但永不压到 C 线以下', function () {
  // 这一门的两条轴是「最优步数」与「预算系数」。
  //
  // 以前预算系数固定 2.4，档越高最优步数越长、预算也跟着变宽——「越难容错越大」，
  // 方向是反的。现在系数随档收紧，但有一条硬约束：不能压到 2 以下。
  //
  // C 线是「超过最优两倍才脱身」。预算若小于两倍最优，玩家还没走到两倍就先判
  // 「困住了」——C 这一档永远拿不到，评级表里那行评语等于删掉。那不是变难，是断档。
  const DIFFS = ['novice', 'entry', 'minor', 'major', 'full'];
  let prev = null;
  const seen = [];
  for (const key of DIFFS) {
    const lv = practice.klotskiLevelOf(key);
    assert.strictEqual(typeof lv.capFactor, 'number', key + ' 没给预算系数：模块里那句 p.capFactor || 2.8 会永远走兜底');
    assert.ok(lv.capFactor >= 2, key + ' 的预算系数 ' + lv.capFactor + ' 压到两倍最优以下，C 这一档不存在了');
    if (prev !== null) assert.ok(lv.capFactor < prev, key + ' 的预算比上一档还宽（越难容错越大）');
    prev = lv.capFactor;
    seen.push(lv.capFactor);
  }
  assert.ok(seen[0] - seen[seen.length - 1] > 0.5, '五档预算系数几乎没有差别：' + seen.join(' / '));

  // 段内也要收：一段之内，预算只许紧不许松。
  const m = practice.getMethod('rongdao');
  let last = null;
  for (let lv = 501; lv <= 1000; lv += 20) {
    const q = practice.buildParamsAt(m, lv);
    if (last !== null) assert.ok(q.capFactor <= last, '第 ' + lv + ' 关的预算反而放宽了');
    assert.ok(q.capFactor >= 2, "第 " + lv + " 关的预算压到 C 线以下：" + q.capFactor);
    last = q.capFactor;
  }
});

check('越权挑关自动回落到本门当前关', function () {
  const s = freshState('jian', 0, 0);
  const r = game.applyPractice(s, 'jian', 'B', { level: 200, score: 0 });
  assert.strictEqual(r.levelFellBack, true);
  assert.strictEqual(r.curLevel, 1);
  assert.strictEqual(r.stageKey, 'novice');
  assert.strictEqual(r.level, 1);
});

check('耗气叠乘有底：地阶圆满段最贵，但也压不穿最低 1 点', function () {
  const economy = require('../data/economy.js');
  // 天阶 2026-11 起没有功法，最贵的一档现在是地阶（×1.3）。
  const s = freshState('zhen', 24000, 3);
  s.realmIndex = 3;
  s.skills.zhen.cleared = L.LEVEL_MAX;
  const r = game.applyPractice(s, 'zhen', 'S', { level: L.LEVEL_MAX, score: 0 });
  assert.strictEqual(r.tierKey, 'di');
  assert.ok(r.qiCost >= economy.QI_COST_MIN, '耗气低于绝对下限');
  const got = [];
  // 三段各取本段首关：段位越后越贵（与段内第几关无关）。
  for (const key of ['minor', 'major', 'full']) {
    const st = freshState('zhen', 0, 3);
    st.realmIndex = 3;
    st.skills.zhen.cleared = clearedThrough(practice.stageIndexOfKey(key));
    got.push(game.applyPractice(st, 'zhen', 'S', { level: st.skills.zhen.cleared + 1 }).qiCost);
  }
  assert.ok(got[1] > got[0] && got[2] > got[1],
    '地阶各段耗气没有一段比一段贵：' + got.join(' / '));
  // 反向：悟性拉满 + 心法省气封顶，也不能把耗气压到 0 或负数。
  const cheap = game.createNewState();
  cheap.skills.jian.unlocked = true;
  cheap.skills.jian.prof = 30000;
  cheap.resources.qi = 1e6;
  for (const id of Object.keys(cheap.skills)) {
    cheap.skills[id].unlocked = true;
    cheap.skills[id].prof = 6000;
  }
  const floor = game.applyPractice(cheap, 'jian', 'C', { score: 0 });
  assert.ok(floor.qiCost >= economy.QI_COST_MIN, '堆满省气后耗气压到了 ' + floor.qiCost + ' 点');
});

check('境界超上限只加价 1.5 倍，不禁练也不砍熟练度', function () {
  const economy = require('../data/economy.js');
  // 黄阶（门槛炼气、上限筑基）：炼气正常，金丹超上限要加价
  const low = freshState('jian', 0, 0);
  const r0 = game.applyPractice(low, 'jian', 'B', {});
  assert.strictEqual(r0.realmOverCost, 1);
  const old = freshState('jian', 0, 2);
  const r1 = game.applyPractice(old, 'jian', 'B', {});
  assert.strictEqual(r1.realmAbove, true);
  assert.strictEqual(r1.realmOverCost, economy.REALM_OVER);
  assert.ok(r1.realmReason.indexOf('上限') >= 0);
  assert.ok(r1.qiCost > r0.qiCost, '超上限后耗气没有更贵（' + r1.qiCost + ' vs ' + r0.qiCost + '）');
  // 加价不等于作废：熟练度照给，跟没超上限时一模一样。
  assert.strictEqual(r1.gain, world.PROF_BASE.B, '境界加价碰了熟练度基础值');
});

check('没到门槛不许开练，与「超上限只加价」是两件事', function () {
  // 地阶（门槛金丹）：炼气期连开练都不允许，返回 ok:false 而不是打折结算。
  const early = freshState('zhen', 0, 0);
  const r = game.applyPractice(early, 'zhen', 'B', {});
  assert.strictEqual(r.ok, false, '没到门槛也让它练了');
  assert.ok(String(r.msg).indexOf('境界') >= 0 || String(r.msg).indexOf('修') >= 0,
    '拒绝理由没提境界：' + r.msg);
  const proper = freshState('zhen', 0, 2);
  const rp = game.applyPractice(proper, 'zhen', 'B', {});
  assert.strictEqual(rp.ok, true);
  assert.strictEqual(rp.realmOverCost, 1);
});

check('属性加成乘品阶系数：同段位下地阶高于黄阶', function () {
  // 天阶 2026-11 起没有功法，能拿来对照品阶系数的只剩地 / 黄两级。
  // 同一品阶取两门、点数不同，才分得清「加的是点数」还是「乘了品阶」。
  const base = game.createNewState();
  const baseAttrs = game.computeAttributes(base);
  const a = freshState('jian', 300, 0);   // 黄阶 shen +3 × 1.0
  const b = freshState('leifu', 300, 0);  // 黄阶 ling +4 × 1.0（对照：同一品阶不出偏差）
  const c = freshState('zhen', 300, 0);   // 地阶 ling +3 × 1.7
  const addA = Math.round((game.computeAttributes(a).shen - baseAttrs.shen) * 10) / 10;
  const addB = Math.round((game.computeAttributes(b).ling - baseAttrs.ling) * 10) / 10;
  const addC = Math.round((game.computeAttributes(c).ling - baseAttrs.ling) * 10) / 10;
  assert.strictEqual(addA, 3);
  assert.strictEqual(addB, 4);
  assert.strictEqual(addC, 5.1);
  // 同一点数换品阶，加成就得按品阶系数放大，不许只做加法。
  assert.strictEqual(Math.round((addC / 3) * 10) / 10, practice.TIERS[2].attr);
  assert.strictEqual(Math.round((addB / 4) * 10) / 10, practice.TIERS[0].attr);
});

check('藏经阁按品阶拦境界：炼气买不了玄阶', function () {
  const s = freshState('', 0, 0);
  s.resources.qi = 9999;
  s.resources.stone = 9999;
  const fail = game.buySkill(s, 'jingxin');
  assert.strictEqual(fail.ok, false);
  assert.ok(fail.msg.indexOf('境界') >= 0);
  s.realmIndex = 1;
  const ok = game.buySkill(s, 'jingxin');
  assert.strictEqual(ok.ok, true);
});

// ---------------------------------------------------------------- 参数与展示

check('难度档缩放不碰盘面尺寸，且各档参数确有区分', function () {
  // 规格按档递增的几门由各自的档位表管（lights / sudoku / klotski / click / mines / link），
  // 见下面的专条断言。它们的盘面「该变」，所以不在这条里被判。
  // link 的 4×6 → 5×7 → 6×8 是 LINK_LEVELS 显式表：连连看加行加列买的是搜索空间，
  // 与「缩场地把手感挤成手速」不是一回事。
  // match 也进表了：MATCH_LEVELS 五段各给一副盘，不经通用缩放。
  const tableGames = ['lights', 'sudoku', 'klotski', 'click', 'mines', 'link', 'match'];
  // 档位表住在玩法模块里的四门（merge / schulte / pushbox / biggest）：params 只有 depth，
  // 「难度确实变了」要看它们的评级线随档收紧——线不变才是真没区分度。
  const internalGames = ['merge', 'schulte', 'pushbox', 'biggest'];
  for (const m of practice.PRACTICE_METHODS) {
    if (tableGames.indexOf(m.game) >= 0) continue;
    const easy = practice.buildParams(m, 'novice');
    const hard = practice.buildParams(m, 'full');
    if (internalGames.indexOf(m.game) >= 0) {
      const mod = require('../minigames/' + m.game + '.js');
      const a = mod.lines(easy, 'entry').items.join('');
      const b = mod.lines(hard, 'minor').items.join('');
      assert.notStrictEqual(a, b, m.id + ' 的评级线不随难度档收紧');
      continue;
    }
    let changed = false;
    for (const key of Object.keys(m.params)) {
      if (['grid', 'cols', 'rows', 'size'].indexOf(key) >= 0) {
        assert.strictEqual(hard[key], m.params[key], m.id + ' 盘面尺寸被缩放');
      } else if (easy[key] !== hard[key]) changed = true;
    }
    assert.ok(changed, m.id + ' 各难度档参数没有区分度');
  }
});

check('顺序点格：五档两两不同，同盘面的那两档必须差一条规则', function () {
  // 旧表是 4/5/6/6/6：后三档同一个 6×6，档与档只差 1–3 秒 S 线。
  // 而同一尺寸换个随机布局，成绩本来就波动 3–5 秒——档差被方差吃掉，
  // 三档在体感上是同一局，评级就变成「结算时乘个数」。
  // 所以判据不是「参数不同」（罚时也不同，照样过），而是「同盘面就必须差一条规则」。
  const schulte = require('../minigames/schulte.js');
  const method = practice.getMethod('shumu');
  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  const seen = keys.map(function (k) {
    const p = practice.buildParams(method, k);
    return { key: k, text: schulte.lines(p).items.join('|'), row: schulte.LEVELS[p.depth] };
  });
  const uniq = {};
  seen.forEach(function (s) { uniq[s.text] = true; });
  assert.strictEqual(Object.keys(uniq).length, 5, '五档里有说明页一字不差的档');
  for (let i = 1; i < seen.length; i += 1) {
    assert.notStrictEqual(seen[i].text, seen[i - 1].text,
      seen[i].key + ' 的说明页与 ' + seen[i - 1].key + ' 完全相同');
    if (seen[i].row.size !== seen[i - 1].row.size) continue;
    assert.notStrictEqual(seen[i].row.fade, seen[i - 1].row.fade,
      seen[i - 1].key + ' → ' + seen[i].key + ' 同盘面、同退场规则：这两档只差秒表');
  }
  // 盘面规格至少四种：五档挤在三种规格里，「盘面变难」只是名义上的。
  const specs = {};
  seen.forEach(function (s) { specs[s.row.size] = true; });
  assert.ok(Object.keys(specs).length >= 4,
    '顺序点格只有 ' + Object.keys(specs).length + ' 种盘面规格，撑不起五档阶梯');
});

check('换承重轴的两门：变的是复杂度与盘面，不是时间', function () {
  // 起因：五档时间参数走同一套 pace / TIME_LEVELS，跨度天然只有 1.7–2.3 倍，
  // 而且反应速度练不出来——把难度压在「快」上，玩家只会更焦虑。
  // 这两门把承重交给盘面、刀路与禁制，时间只负责让节奏别拖。
  // （原来第三门是步法连环，2026-11 随截锋断岳诀一起退役，所以只剩两门。）
  let prevGrid = 0;
  let prevLen = -1;
  for (const d of practice.STAGES) {
    const lv = practice.CLICK_LEVELS[d.depth];
    assert.ok(lv.grid >= prevGrid, d.name + ' 开锋破军诀盘面反而变小');
    assert.strictEqual(lv.cols * lv.cols, lv.grid, d.name + ' 开锋破军诀的 grid 与 cols 对不上');
    assert.ok(lv.lenStep >= prevLen, d.name + ' 开锋破军诀刀路变短');
    prevGrid = lv.grid;
    prevLen = lv.lenStep;
  }
  const c0 = practice.CLICK_LEVELS[0];
  const c4 = practice.CLICK_LEVELS[4];
  assert.ok(c4.grid / c0.grid >= 2.5,
    '开锋破军诀盘面跨度只有 ' + (c4.grid / c0.grid).toFixed(2) + ' 倍，承重轴没立起来');
  assert.ok((3 + c4.lenStep) / (3 + c0.lenStep) >= 2.5,
    '开锋破军诀刀路跨度只有 ' + ((3 + c4.lenStep) / (3 + c0.lenStep)).toFixed(2) + ' 倍');
  // 简单档的刀路要短到「一眼扫得完」：3 桩是 3×3 小盘上的直线，读完不用二次思考。
  assert.strictEqual(3 + c0.lenStep, 3, '开锋破军诀简单档刀路不是最短的 3 桩');

  let prevCells = 0;
  let prevMines = 0;
  for (const d of practice.STAGES) {
    const lv = practice.MINES_LEVELS[d.depth];
    const cells = lv.cols * lv.rows;
    // 前两档同为 6×6，靠禁制数（5→6）区分；盘面只许变大，不许缩回去。
    assert.ok(cells >= prevCells, d.name + ' 洞微勘禁诀盘面反而变小');
    assert.ok(lv.mines > prevMines, d.name + ' 洞微勘禁诀禁制数没有增加');
    const density = lv.mines / cells;
    // 密度必须稳在一个区间里：密度太低是空盘、太高是无处下脚，
    // 两种都不叫「变难」，叫「换了一盘棋」。
    assert.ok(density > 0.12 && density < 0.20,
      d.name + ' 洞微勘禁诀禁制密度 ' + (density * 100).toFixed(1) + '% 超出 12–20%');
    prevCells = cells;
    prevMines = lv.mines;
  }
  // 五档至少四种盘面规格，否则「盘面变难」只是名义上的。
  const mineSizes = {};
  for (const lv of practice.MINES_LEVELS) mineSizes[lv.cols] = true;
  assert.ok(Object.keys(mineSizes).length >= 4,
    '洞微勘禁诀盘面只有 ' + Object.keys(mineSizes).length + ' 种规格，撑不起五档阶梯');
  const m0 = practice.MINES_LEVELS[0];
  const m4 = practice.MINES_LEVELS[4];
  assert.ok((m4.cols * m4.rows) / (m0.cols * m0.rows) >= 2.2,
    '洞微勘禁诀盘面跨度只有 ' + ((m4.cols * m4.rows) / (m0.cols * m0.rows)).toFixed(2) + ' 倍');

});

check('九宫填数与滑块让路的档位表逐档变难', function () {
  let prevHoles = 0;
  let prevS = 0;
  for (const d of practice.STAGES) {
    const lv = practice.sudokuLevelOf(d.key);
    assert.ok(lv.size >= 4, d.name + ' 的盘面规格不合法');
    assert.ok(lv.holes > prevHoles, d.name + ' 要填的格数没有增加');
    assert.ok(lv.tS > prevS, d.name + ' 的 S 线没有收紧');
    assert.ok(lv.timeLimit > lv.tB, d.name + ' 的时限比 B 线还紧，填得慢就没有 C 了');
    prevHoles = lv.holes;
    prevS = lv.tS;
    const kl = practice.klotskiLevelOf(d.key);
    assert.ok(kl.maxOpt >= kl.minOpt, d.name + ' 的最优步数区间反了');
  }
  let prevOpt = 0;
  for (const d of practice.STAGES) {
    const kl = practice.klotskiLevelOf(d.key);
    assert.ok(kl.minOpt > prevOpt, d.name + ' 的最优步数下限没有提高');
    prevOpt = kl.minOpt;
  }
});

check('阵灯推演：两条轴递进，相邻两档不会两条轴都一样，余量压不破 B 档', function () {
  let prev = null;
  for (const d of practice.STAGES) {
    const lv = practice.lightsLevelOf(d.key);
    // 余量 < 5 时 A 线（多 2 步）与 B 线（余量 − 2）重合成一条，B 这一档就消失了。
    // 这是「收紧类参数有硬下限」在这一门的具体数字，改余量前先问：五档还齐吗？
    assert.ok(lv.slack >= 5, d.name + ' 的步数余量把 B 档压没了：' + lv.slack);
    assert.ok(lv.hi >= lv.min, d.name + ' 的最优步数区间反了');
    if (prev) {
      assert.ok(lv.size > prev.size || lv.min > prev.hi,
        d.name + ' 与上一档两条轴都没拉开（' + prev.size + '×' + prev.size + ' ['
        + prev.min + ',' + prev.hi + '] → ' + lv.size + '×' + lv.size + ' ['
        + lv.min + ',' + lv.hi + ']）');
      assert.ok(lv.min >= prev.min, d.name + ' 的最优步数反而更短');
    }
    prev = lv;
  }
  const p = practice.buildParams(practice.getMethod('arrayEye'), 'full');
  assert.deepStrictEqual([p.size, p.minSteps, p.hiSteps, p.budgetSlack],
    [practice.LIGHTS_LEVELS[4].size, practice.LIGHTS_LEVELS[4].min,
      practice.LIGHTS_LEVELS[4].hi, practice.LIGHTS_LEVELS[4].slack],
    '绝境档没拿到 5×5、最优区间与余量');
});

check('节奏不越过触屏安全下限', function () {
  for (const m of practice.PRACTICE_METHODS) {
    const out = practice.buildParams(m, 'full');
    for (const key of ['interval', 'life', 'flashMs', 'gapMs', 'flipMs', 'shuffleMs']) {
      if (typeof out[key] === 'number') {
        assert.ok(out[key] >= 150, m.id + ' 的 ' + key + ' 压到 ' + out[key] + 'ms，低于安全下限');
      }
    }
  }
});

check('getSkillList 输出品阶、可修境界与难度档', function () {
  const s = freshState('', 0, 0);
  const list = game.getSkillList(s);
  assert.strictEqual(list.length, 15);
  for (const item of list) {
    assert.ok(item.tierName && item.tierLabel && item.tierColor);
    assert.ok(item.starsText.length === 4);
    assert.ok(item.rewardText.indexOf('耗气') >= 0, '功法卡片没写运功耗气');
    assert.ok(item.maxRealmName && item.needRealmName);
    assert.ok(item.stageName && item.stageText.indexOf(item.stageName) >= 0,
      '功法卡片的关卡行没写站在哪一段');
    assert.ok(item.stageText.indexOf('已走通') >= 0, '功法卡片的关卡行把已走通数写成了关号');
    assert.ok(item.profTierName, '熟练度段位缺失');
    assert.strictEqual(typeof item.decayed, 'boolean');
  }
});

check('getTopSkills 与 getSkillList 报同一套段位与关数（人物页照抄的字段不许缺）', function () {
  // 2026-11 真机：人物页那行读的是 stageName / stageLevel / levelTotal，
  // 而 getTopSkills 当时只回 name / prof / tierName，整行直接变成
  // 「吐纳周天诀 · undefined · 已走通 undefined / undefined 关」。
  // 同一件事两处各算一套，字段名对不上时没有任何断言会红——所以这条按**两处相等**断言。
  const s = freshState('', 0, 0);
  s.skills.jian.unlocked = true; s.skills.jian.prof = 1200; s.skills.jian.cleared = 37;
  s.skills.zhen.unlocked = true; s.skills.zhen.prof = 300; s.skills.zhen.cleared = 5;
  const list = game.getSkillList(s);
  const top = game.getTopSkills(s, 3);
  assert.strictEqual(top.length, 3, '主修只该给三门');
  for (const item of top) {
    assert.strictEqual(typeof item.stageName, 'string', item.name + ' 没报段名');
    assert.ok(item.stageName.length > 0, item.name + ' 段名是空的');
    assert.strictEqual(typeof item.stageLevel, 'number', item.name + ' 没报已走通关数');
    assert.strictEqual(typeof item.levelTotal, 'number', item.name + ' 没报关数上限');
    const same = list.find(function (x) { return x.id === item.id; });
    assert.ok(same, item.name + ' 在功法列表里找不到同 id，两个数据源对不上');
    assert.strictEqual(item.stageName, same.stageName, item.name + ' 段名与功法列表不一致');
    assert.strictEqual(item.stageLevel, same.stageLevel, item.name + ' 关数与功法列表不一致');
    assert.strictEqual(item.levelTotal, same.levelTotal, item.name + ' 关数上限与功法列表不一致');
  }
});

check('功法页顺序三级：无时间戳的老存档不许退成按门名', function () {
  // 2026-11 真机翻车复现：那份存档有熟练度，但 lastAt 与 records.at 全是 0，
  // 于是「时间 → 正名」两级排序每次都落到字典序，14 门按码点严格递增，
  // 玩家看到的结论是「你改了，但跟没改一样」。这条按排序**结果**断言，不是静态匹配。
  const s = freshState('', 0, 0);
  const prof = { tuna: 11040, shumu: 1200, leifu: 1152, jian: 1140, lingqi: 1056, zeda: 69, shudu: 54 };
  const ids = Object.keys(prof);
  for (const id of ids) {
    s.skills[id].unlocked = true;
    s.skills[id].prof = prof[id];
    s.skills[id].lastAt = 0;
  }
  s.records = {};
  const learned = game.getSkillList(s).filter(function (x) { return x.unlocked; });
  const order = learned.slice().sort(game.orderLearned).map(function (x) { return x.id; });
  const nameOrder = learned.slice().sort(function (a, b) {
    const ka = a.name.split(skills.NAME_RULE.sep)[1] || a.name;
    const kb = b.name.split(skills.NAME_RULE.sep)[1] || b.name;
    return ka < kb ? -1 : (ka > kb ? 1 : 0);
  }).map(function (x) { return x.id; });
  assert.notDeepStrictEqual(order, nameOrder, '全表无时间戳时顺序等于按门名：兜底那一级没了');
  // 第二级必须是熟练度降序：练得最深的打头，而不是随便排。
  const top = order.slice(0, ids.length);
  const topProf = top.map(function (id) { return prof[id]; });
  for (let i = 1; i < topProf.length; i += 1) {
    assert.ok(topProf[i - 1] >= topProf[i], '熟练度兜底不是降序：' + topProf.join(' / '));
  }

  // 真的练过之后，时间戳压过熟练度——「最近玩的那门」永远打头，与深浅无关。
  s.resources.qi = 100000;
  game.applyPractice(s, 'shudu', 'C', { level: 1, score: 10 });
  const after = game.getSkillList(s).filter(function (x) { return x.unlocked; })
    .sort(game.orderLearned);
  assert.strictEqual(after[0].id, 'shudu',
    '刚练完的那门没排到第一位（它熟练度最低，正好检验时间戳压过熟练度）');
});

check('getFamilies 四档刻度齐全，缺变体的档位标空档', function () {
  const s = freshState('', 0, 0);
  const fams = game.getFamilies(s);
  assert.ok(fams.length >= 5);
  const dao = fams.find(function (f) { return f.type === '刀法'; });
  assert.ok(dao && dao.core, '新增的刀法族没进功法谱系');
  // 剑法 / 水术 / 身法三族 2026-11 起暂无功法：chainsOf 不分组，谱系里就不该冒出空族。
  for (const gone of ['剑法', '水术', '身法']) {
    assert.ok(!fams.some(function (f) { return f.type === gone; }),
      gone + '族已经一门不剩，谱系里还挂着空壳');
  }
  // 丹道 2026-11 起有门了（同源归一诀）：空壳走了，真门要进得来。
  assert.ok(fams.some(function (f) { return f.type === '丹道'; }),
    '丹道已有功法，谱系里却没有这一族');
  // 心法族两门黄阶（吐纳周天诀 / 太虚照见诀）必须都看得见：同阶并列，不许盖掉后一门。
  const heart = fams.find(function (f) { return f.type === '心法'; });
  assert.ok(heart, '心法族没进功法谱系');
  const heartHuang = heart.slots.find(function (x) { return x.tierKey === 'huang'; });
  assert.strictEqual(heartHuang.items.length, 2, '心法黄阶两门只剩 ' + heartHuang.items.length + ' 门');
  assert.deepStrictEqual(heartHuang.items.map(function (x) { return x.id; }).sort(), ['taixu', 'tuna'],
    '心法黄阶并列的门不对');
  for (const f of fams) {
    for (const node of f.slots) {
      assert.ok(node.tierName && node.starsText);
      if (!node.empty) assert.ok(node.gameName, node.name + ' 缺少玩法名');
    }
  }
});

check('纪录只记最高分，低分不覆盖', function () {
  const s = freshState('jian', 0, 0);
  game.applyPractice(s, 'jian', 'B', { score: 30 });
  const r = game.applyPractice(s, 'jian', 'S', { score: 8 });
  assert.strictEqual(r.newRecord, false);
  assert.strictEqual(r.bestScore, 30);
  assert.strictEqual(s.records.jian.score, 30);
});

check('v3 存档升到 v9，熟练度与纪录原样保留，灵力补到身家并夹到气海', function () {
  const old = freshState('jian', 812, 0);
  old.version = 3;
  old.records = { jian: { score: 42, grade: 'A', at: 1 } };
  old.resources.qi = 0;   // 老档的灵力没有任何意义（旧版参悟产灵力，攒下来的没处花）
  delete old.skills.jian.cleared;   // v3 存档里没有关卡进度这个字段，全靠迁移补
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 9);
  assert.strictEqual(n.skills.jian.prof, 812);
  assert.strictEqual(n.records.jian.score, 42);
  // 迁移补齐关卡进度：老档只有 prof，按 legacyLevelFromProf 反推老 200 关制的关号再 ×5。
  assert.ok(typeof n.skills.jian.cleared === 'number', '迁移没补出关卡进度');
  assert.strictEqual(n.skills.jian.cleared,
    (L.legacyLevelFromProf(812) - 1) * 5, '老档关卡进度折算不是 (老关号 − 1) × 5');
  assert.ok(!('levels' in n.skills.jian), '老档的五档进度字段没清掉');
  // 只补不削：抬到开局身家，否则更新后一局都开不了。
  const economy = require('../data/economy.js');
  assert.strictEqual(n.resources.qi, economy.START_QI, '老档灵力没补到开局身家');
  // 灵力有了气海上限：旧版没有上限，老档可能攒到几百点。读档时一次夹平，
  // 否则主页会写出「660 / 174」——上限在那一天才出现，玩家只会以为算错了。
  const rich = freshState('jian', 812, 0);
  rich.version = 3;
  rich.resources.qi = economy.START_QI + 500;
  const richState = game.normalizeState(rich);
  const richCap = game.qiCap(richState);
  assert.ok(richCap < economy.START_QI + 500, '夹具没造出超上限的余额');
  assert.strictEqual(richState.resources.qi, richCap, '读档没把超上限的灵力夹平');
  // 当日胜场记账要补上，否则切磋灵石会从「第 1 场」重新算。
  assert.strictEqual(typeof n.daily.battleWins, 'number');
});

check('九套经典 + 洞微勘禁诀默认已习得，藏经阁只留非经典', function () {
  // 经典盘面（连连看 / 俄罗斯方块 / 三消 / 数独 / 2048 / 舒尔特 / 华容道 / 推箱子 / 挑最大）
  // 加上扫雷，是「点进去就知道怎么玩」的那一批。这一批不该拿去卖：
  // 玩家第一次打开游戏，最想玩的正是它们，摆一道灵石墙只会把人挡在门口。
  const free = ['lingqi', 'leiyue', 'sanxiu', 'shudu', 'heyuan', 'shumu', 'rongdao', 'tuisuo', 'zeda', 'leifu'];
  for (const id of free) {
    const s = skills.getSkill(id);
    assert.strictEqual(s.tier, 'huang', id + ' 不是黄阶');
    assert.strictEqual(s.source.kind, 'start', s.name + ' 还没改成入门即得');
  }
  const shop = skills.SKILLS.filter(function (x) { return x.source.kind === 'shop'; });
  // 2026-11 删掉四门（含唯一一门玄阶以上的在售功法）之后，藏经阁只剩澄心默诵诀一门。
  // 这是内容欠账不是设计，已记进 docs/specs/plan/50-balance/04-open-issues.md；门槛先按现状写 1，
  // 补门时把这条抬回 2 —— 否则「阁里只有一门」会被断言替玩家认下来。
  assert.ok(shop.length >= 1, '藏经阁空了：非经典的功课至少要留一门');
  for (const s of shop) {
    assert.strictEqual(s.source.cost.qi, undefined, s.name + ' 的价格里还有灵力');
    assert.ok(s.source.cost.stone > 0, s.name + ' 没有灵石价格');
    // 藏经阁只剩非经典：经典那一批全在入门即得里，一件都不许再出现在价目表上。
    assert.notStrictEqual(s.tier, 'huang', s.name + ' 是黄阶却还在卖');
  }
  // 老存档不会被这道改动卡住：读档时入门即得的门类一律置为已习得。
  const engine = require('../utils/game.js');
  const st = engine.createNewState();
  st.skills.lingqi.unlocked = false;
  const fixed = engine.normalizeState(st);
  assert.strictEqual(fixed.skills.lingqi.unlocked, true, '老存档里没买过的经典功法读档后仍是锁的');
});

// ---------------------------------------------------------------- 五档区分度
// 这一组是「简单 / 普通 / 困难 / 极难 / 绝境」到底有没有真的分档的常驻守卫。
// scripts/difficulty-audit.js 是给人看的只读报告，这里才是 npm run check 会跑的断言。

check('三连互换：五档整表同管盘面、时辰、罚息与 S 线，不再只改分数线', function () {
  const lv = practice.MATCH_LEVELS;
  assert.strictEqual(lv.length, 5, '五档表不是五档');
  for (let i = 1; i < lv.length; i += 1) {
    assert.ok(lv[i].kinds >= lv[i - 1].kinds, '第 ' + (i + 1) + ' 档花色反而少了');
    assert.ok(lv[i].duration < lv[i - 1].duration, '第 ' + (i + 1) + ' 档时辰没收紧');
    // 换段先换盘：6×6 → 7×7 → 8×8 → 9×9 → 10×10，这是玩家一眼就看得见的台阶。
    assert.strictEqual(lv[i].cols, lv[0].cols + i, '第 ' + (i + 1) + ' 档盘面列没换副');
    assert.strictEqual(lv[i].rows, lv[0].rows + i, '第 ' + (i + 1) + ' 档盘面行没换副');
    // 盘变大时总时辰给足了，但每一格的预算必须还是收紧的——不然盘面只是变大，没变难。
    const budget = function (row) { return row.duration / (row.cols * row.rows); };
    assert.ok(budget(lv[i]) < budget(lv[i - 1]), '第 ' + (i + 1) + ' 档每格预算反而松了');
    assert.ok(lv[i].missCost >= lv[i - 1].missCost, '第 ' + (i + 1) + ' 档罚息反而轻了');
    assert.ok(lv[i].hintCost >= lv[i - 1].hintCost && lv[i].shuffleCost >= lv[i - 1].shuffleCost,
      '第 ' + (i + 1) + ' 档辅助代价反而轻了');
    // S 线不再是一张绝对分表：它 = 每手均分 × 可用手数 × 折算系数，按本盘产出现算。
    // perMove 只是把「一手」换算成分数的尺度，不再是评级的目标值。
    assert.ok(lv[i].perMove > 0, '第 ' + (i + 1) + ' 档没有每手均分：S 线没有换算尺度');
    assert.ok(lv[i].seals >= lv[i - 1].seals, '第 ' + (i + 1) + ' 档封印反而少了');
    assert.ok(lv[i].shuffleCap <= lv[i - 1].shuffleCap, '第 ' + (i + 1) + ' 档免费重排反而更多');
    // 每档都必须有目标。这一门是「做成即收工」，没有目标的档就没有终点条件——
    // 玩家会在那一档学会「等表走完」，而不是这一门的节奏（段一原先就是这样漏的）。
    assert.ok(lv[i].goalType > 0, '第 ' + (i + 1) + ' 档没有本局目标：这一档没有终点条件');
  }
  assert.ok(lv[4].kinds > lv[0].kinds && lv[0].duration > lv[4].duration,
    '绝境与简单的盘面拉不开：花色 / 时辰都没变');
  assert.ok(lv[3].seals > 0 && lv[4].seals > lv[3].seals, '大成起才有石皮，且圆满要多于大成');
  assert.ok(lv[4].perMove < lv[0].perMove, '每手均分没有随盘面变大而降');

  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  const method = practice.getMethod('harvest');
  assert.strictEqual(method.tip, practice.tipFor(method, 'novice'),
    '功法表里的兜底代价句和简单档罚息分叉了');
  const util = [];
  keys.forEach(function (k, i) {
    const p = practice.buildParams(method, k);
    assert.strictEqual(p.cols, lv[i].cols, k + ' 的盘面列没送进玩法层');
    assert.strictEqual(p.rows, lv[i].rows, k + ' 的盘面行没送进玩法层');
    assert.strictEqual(p.kinds, lv[i].kinds, k + ' 的花色没送进玩法层');
    assert.strictEqual(p.duration, lv[i].duration, k + ' 的时辰没送进玩法层');
    assert.strictEqual(p.missCost, lv[i].missCost, k + ' 的罚息没送进玩法层');
    assert.strictEqual(p.seals, lv[i].seals, k + ' 的封印格没送进玩法层');
    // 关级 S 线（玩家真照着打的那个数）与 buildParamsAt 同源，不再另算一套。
    assert.strictEqual(practice.sLineOf(method, { novice: 1, entry: 11, minor: 51, major: 201, full: 501 }[k]),
      practice.buildParamsAt(method, { novice: 1, entry: 11, minor: 51, major: 201, full: 501 }[k]).sLine,
      k + ' 的 S 线不是同一份真源');
    // 三条线同源，而且每条都钉在「用掉几成时辰」上——不是彼此的固定倍数。
    // 写成「A = S × 0.68」那种派生，时辰一收紧三条线会一起漂，标定就对不上。
    const lines = practice.gradeLinesOf(p);
    assert.strictEqual(p.sLine, lines.s, k + ' 的 S 线不是 gradeLinesOf 给的');
    assert.ok(lines.s > lines.a && lines.a > lines.b, k + ' 的三条线没拉开');
    const base = p.perMove * Math.floor(p.duration / practice.MATCH_MOVE_SEC);
    ['s', 'a', 'b'].forEach(function (g) {
      const x = practice.MATCH_GRADE_X[g];
      const want = Math.round(base * (practice.MATCH_CLEAR_K - (practice.MATCH_CLEAR_K - 1) * x));
      assert.ok(Math.abs(lines[g] - want) <= 1,
        k + ' 的 ' + g + ' 线没按用时比例算：' + lines[g] + ' vs ' + want);
    });
    util.push(lines.s / base);
    assert.ok(practice.tipFor(method, k).indexOf('少 ' + lv[i].missCost + ' 息') >= 0,
      k + ' 的代价句还在写别的档的罚息');
    assert.ok(practice.sLineText(method, { novice: 1, entry: 11, minor: 51, major: 201, full: 501 }[k])
      .indexOf('做成目标即收工') >= 0,
      k + ' 的准备页没说清终点是怎么算的');
  });
  // 「每一段都要求同样强度的操作」= 五档的 S 线折算系数同值。
  // 这一条比「五档分数线各不相同」重要：它守的是「一局要打成什么样」这件事不许随段变。
  const sFactor = practice.MATCH_CLEAR_K - (practice.MATCH_CLEAR_K - 1) * practice.MATCH_GRADE_X.s;
  assert.ok(util.every(function (u) { return Math.abs(u - sFactor) < 0.02; }),
    '五档的 S 线折算系数不一致：' + util.map(function (u) { return u.toFixed(2); }).join('/'));
  // 代价句按档变，不许五档共用一句写死的「少 2 息」。
  assert.strictEqual(new Set(keys.map(function (k) { return practice.tipFor(method, k); })).size, 3);
  assert.strictEqual(practice.tipFor(practice.getMethod('forge'), 'novice'),
    practice.tipFor(practice.getMethod('forge'), 'full'), '别的门不该被按档改写代价句');
});

check('时辰尺子与四门补的档位参数都只收紧不放宽，且玩法层真的拿得到', function () {
  assert.deepStrictEqual(practice.TIME_LEVELS, [1, 0.97, 0.94, 0.91, 0.88], '时辰尺子被改了');
  assert.deepStrictEqual(practice.MINES_HEARTS, [3, 3, 2, 1, 1]);
  assert.deepStrictEqual(practice.MERGE_START_TILES, [2, 2, 3, 3, 4]);
  assert.deepStrictEqual(practice.PUSHBOX_CAP_FACTORS, [2.2, 2.0, 1.9, 1.75, 1.6]);
  const mines = require('../minigames/mines.js');
  assert.deepStrictEqual(mines.HEARTS_BY_DEPTH, practice.MINES_HEARTS,
    '心神表的两份真源分叉了');
  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  const get = function (id, key, field) {
    return practice.buildParams(practice.getMethod(id), key)[field];
  };
  for (let i = 0; i < keys.length; i += 1) {
    assert.strictEqual(get('tanlei', keys[i], 'hearts'), practice.MINES_HEARTS[i]);
    assert.strictEqual(get('heyuan', keys[i], 'startTiles'), practice.MERGE_START_TILES[i]);
    assert.strictEqual(get('shumu', keys[i], 'penaltySec'), practice.SCHULTE_PENALTIES[i]);
    assert.strictEqual(get('tuisuo', keys[i], 'capFactor'), practice.PUSHBOX_CAP_FACTORS[i]);
  }
  // 时辰收紧对带限时的门生效，但准备页不许再写「入门基准」。
  assert.ok(get('forge', 'novice', 'duration') > get('forge', 'full', 'duration'));
  assert.ok(get('seal', 'novice', 'timeLimit') > get('seal', 'full', 'timeLimit'));
  const detail = practice.stageDetail(practice.getMethod('tanlei'), 'full');
  assert.ok(detail.changes.length >= 2, '绝境档的难度说明没写出两处收紧');
});

check('十五门五档都至少两个可见参数在变，且评级线或盘面规格给出对照', function () {
  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  const internal = practice.INTERNAL_PARAM_KEYS;   // 与 difficulty-audit.js 同一份，不许各抄
  for (const m of practice.PRACTICE_METHODS) {
    const ps = keys.map(function (k) { return practice.buildParams(m, k); });
    const all = new Set();
    ps.forEach(function (p) { Object.keys(p).forEach(function (k) { all.add(k); }); });
    const vary = [];
    all.forEach(function (k) {
      if (internal.indexOf(k) >= 0) return;
      if (new Set(ps.map(function (p) { return JSON.stringify(p[k]); })).size > 1) vary.push(k);
    });
    assert.ok(vary.length >= 2,
      m.id + '（' + practice.GAME_LABELS[m.game] + '）五档只有 ' + vary.length + ' 个可见参数在变：' + vary.join(','));
    const variants = new Set(ps.map(function (p, i) {
      return (index.MODULES[m.game].lines(p, practice.STAGES[practice.stageIndexLike(keys[i])].gear).items || []).join('|');
    })).size;
    const boardChanged = vary.some(function (k) { return /size|holes|minSteps|hiSteps|budgetSlack|level/.test(k); });
    assert.ok(variants > 1 || boardChanged,
      m.id + ' 的说明页五档写同一行，玩家没法对照');
  }
});

check('灵纹连线：五档换盘换纹种，每对预算只减不增，准备页与局内同一份时辰', function () {
  const m = practice.getMethod('linkpair');
  const link = require('../minigames/link.js');
  const keys = ['novice', 'entry', 'minor', 'major', 'full'];
  const ps = keys.map(function (k) { return practice.buildParams(m, k); });
  // 档差的判据不是「秒表差几秒」，是这一档换了哪种盘、纹种多了几种。
  const specs = ps.map(function (p) { return p.cols + '×' + p.rows + '/' + p.kinds + ' 种'; });
  assert.ok(new Set(specs).size >= 4, '五档盘面或纹种没换够：' + specs.join(' '));
  assert.ok(ps[4].cols > ps[0].cols, '圆满段没加列：五段又是同一张 4×6');
  assert.ok(ps[2].kinds > ps[0].kinds, '小成段没加纹种');
  for (let i = 1; i < ps.length; i += 1) {
    // 分母必须走 linkPairsOf：盘形挖了空位，cols*rows/2 不是对数。
    // 旧版自己算分母，奇数格盘（大成 5×7 留 3 空）会被误读成「每对预算放宽」。
    const before = ps[i - 1].duration / practice.linkPairsOf(ps[i - 1]);
    const after = ps[i].duration / practice.linkPairsOf(ps[i]);
    assert.ok(after < before, keys[i] + ' 的每对预算反而宽了（' + before.toFixed(3) + ' → ' + after.toFixed(3) + '）');
  }
  // 时辰由 linkDurationAt(段首关号) 现算；准备页 brief 里的息数必须就是局内那个数，
  // 否则「每对 5.50 息」与倒计时会是两张嘴。
  for (let i = 0; i < keys.length; i += 1) {
    assert.strictEqual(ps[i].duration, practice.linkDurationAt(L.stageRange(i).from),
      keys[i] + ' 的时辰不是按关号现算的');
    const brief = practice.stageDetail(m, keys[i]).brief;
    assert.ok(brief.indexOf(ps[i].duration + ' 息') >= 0, keys[i] + ' 准备页写的时辰与局内分叉了');
    assert.ok(/每对 /.test(brief), keys[i] + ' 准备页没写「一对平均给几息」');
    const g = link.gradeLefts(ps[i].duration);
    assert.ok(g.s > g.a && g.a > g.b && g.b > 0, keys[i] + ' 的评级线挤在一起，C 带没了');
    assert.ok(link.lines(ps[i]).fail, keys[i] + ' 缺失败线：C 与 F 得是两个结论');
  }
  // 一条 1–1000 的长线：每对预算只减不增；界面报得出的关数必须等于参数真变的关数
  //（旧版靠 flashMs 报「199 关真的变了」，其中一百多关只是提示短了 10ms）。
  //
  // 判据分两层，因为「每对 = 总息数 ÷ 对数」在换段时会换口径：
  //   ① 段内对数不变，除出来的商必须逐关不增——这是真刀；
  //   ② 换段时盘变大、总息数跟着变长，取的又是整秒，商允许 ±0.02 息的取整回弹
  //      （59÷12 = 4.917，69÷14 = 4.929：名义值在降，截断误差在变），
  //      这时比的是名义值 linkPerPairAt，那也是设计用的那一把尺子。
  let changed = 0;
  let reported = 0;
  // 分项账本：文档「总览 §5」引用的那串拆解必须与本表逐项相等。
  // 关数 ≠ 条数——一关最多报三条（换段那关报换段 / 换盘 / 换纹种），
  // 把 500 条当成 500 关、或把拆解当成「加起来正好 435」，都是把这份账读错。
  const tally = { chapter: 0, cols: 0, kinds: 0, turns: 0, theme: 0, perPair: 0 };
  let multi = 0;
  let prev = practice.buildParamsAt(m, 1);
  let prevPP = prev.duration / practice.linkPairsOf(prev);
  for (let lv = 2; lv <= L.LEVEL_MAX; lv += 1) {
    const q = practice.buildParamsAt(m, lv);
    // 分母是本关真能接几对（满盘就是 cols*rows/2）：这一门所有「每对」
    // 都走 practice.linkPairsOf，测试也不许自己再算一套。
    const pp = q.duration / practice.linkPairsOf(q);
    assert.ok(practice.linkPerPairAt(lv) <= practice.linkPerPairAt(lv - 1) + 1e-12,
      '第 ' + lv + ' 关每对预算的名义值往松走了');
    if (L.stageOfLevel(lv) === L.stageOfLevel(lv - 1)) {
      assert.ok(pp <= prevPP + 1e-9, '第 ' + lv + ' 关每对预算往松走');
    } else {
      assert.ok(pp <= prevPP + 0.02, '第 ' + lv + ' 关换段时每对预算松了 ' + (pp - prevPP).toFixed(3) + ' 息');
    }
    // 「真变」= 玩家在盘上看得见的东西变了：盘面 / 纹种 / 折数 / 纹样 / 时辰。
    // 盘面满盘无缺口，不再有盘形这根轴；布纹偏斜已退役（它把可连量抬高，方向反了）。
    if (q.duration !== prev.duration || q.cols !== prev.cols || q.rows !== prev.rows
      || q.kinds !== prev.kinds || q.turns !== prev.turns
      || q.theme !== prev.theme) changed += 1;
    const ds = practice.levelDelta(m, lv);
    // 「本门第一关」与「本门最后一关」回答的是起点/终点，不是「这一关比上一关变了什么」，
    // 不进「逐关真变 = 界面可报」这本账；末关常常只是整秒取整，本就没变。
    if (ds.some(function (x) { return x.key !== 'start' && x.key !== 'final'; })) reported += 1;
    for (const x of ds) {
      if (Object.prototype.hasOwnProperty.call(tally, x.key)) tally[x.key] += 1;
    }
    if (ds.length > 1 && ds.every(function (x) { return x.key !== 'start' && x.key !== 'final'; })) multi += 1;
    assert.ok(ds.every(function (x) { return !/flashMs|hintMs|亮起时长/.test(x.text); }),
      '第 ' + lv + ' 关又报毫秒假变化');
    prev = q;
    prevPP = pp;
  }
  assert.strictEqual(changed, reported, '逐关真变 ' + changed + ' 关、界面可报 ' + reported + ' 关，两者对不上');
  // 这张表是「段内那根轴真的有在动」的唯一硬证据：纹样每 5 关一套 → 195 条，
  // 每对预算按整秒取整跳变 → 58 条（段内自己一条直线之后从 54 涨到 59，再剪掉
  // 第 501 关那条跨段的 2.81 → 2.80：段界每对预算是连续的，那条是取整抖动）。
  // 改纹样周期 / 预算曲线 / 对数（取整粒度），这里必须跟着改，不顺带改就是文档与代码各说一套。
  assert.deepStrictEqual(tally,
    { chapter: 4, cols: 2, kinds: 2, turns: 1, theme: 195, perPair: 58 },
    '分项账本变了：总览 §5 的拆解要同批改');
  // 六项合计 262 条 + 末关那条「圆满」= 263 条，落在 246 关上（有 15 关报了多条）。
  // 关数、条数、拆解是三个不同的数，写成「加起来正好 438」就是一笔假账。
  // 布纹偏斜退役后少了一项（原七项），段内每对预算自己走一条直线 → perPair 54→59。
  assert.strictEqual(Object.keys(tally).reduce(function (a, k) { return a + tally[k]; }, 0), 262,
    '分项条目数变了（六项 262 + 末关 1 = 263 条）');
  assert.strictEqual(reported, 246, '有东西可报的关数变了（末关那条「本门最后一关」是终点总结，不计入）');
  assert.strictEqual(multi, 15, '一关报多条的次数变了（每对预算逐关收紧后，与纹样换套撞同一关的机会变多）');
  assert.ok(changed >= 30, '规格台阶掉到 ' + changed + ' 级');
  assert.strictEqual(m.tip, practice.tipFor(m, 'novice'), '功法表的兜底代价句与简单档分叉了');
  assert.ok(!/flashMs/.test(JSON.stringify(m.params)), '种子参数里还有 flashMs');
  assert.strictEqual(typeof m.params.hintMs, 'number', 'hintMs 没有生成端');
});

check('连 S 层数上限与存档版本对齐，三连晋级已彻底退役', function () {
  assert.strictEqual(game.COMBO_MAX, world.COMBO_MAX);
  assert.strictEqual(game.createNewState().version, 9);
  assert.strictEqual(game.S_STREAK_GOAL, undefined, '旧的三连目标常量还在导出');
  assert.deepStrictEqual(game.createNewState().sCombo, {});
  const engine = engineSrc();
  assert.ok(!/promotion|sStreakGoal|S_STREAK_GOAL/.test(engine),
    '结算里还留着三连晋级的字段（迁移注释里的 sStreak 除外）');
});

// ---------------------------------------------------------------- 练功 → 战力 → 破境
//
// 这一段的由来：玩家在功法卡上看到「体魄 +0.8」，破境门槛读的是「战力 170」，
// 中间那次换算从来没人算给他看。于是「练这门有什么用」只能猜，十五门就成了
// 十五个互不相干的小游戏。这两个函数就是那座桥，所以它们必须与重算同源。

check('战力增量：与把熟练度换成下一段门槛后重算的战力同源', function () {
  const s = freshState('jian', 100);
  const gain = game.skillPowerGain(s, 'jian');
  const info = game.tierInfo(100);
  const now = game.computePower(s);
  const clone = Object.assign({}, s, { skills: Object.assign({}, s.skills) });
  clone.skills.jian = Object.assign({}, s.skills.jian, { prof: info.nextThreshold });
  assert.strictEqual(gain, game.computePower(clone) - now, '战力增量与重算不一致');
  assert.ok(gain > 0, '未圆满的功法应当有正的战力增量');

  // 已大圆满没有下一段；未习得的功法不算——否则「还没学」会显示成「练了能涨」。
  assert.strictEqual(game.skillPowerGain(freshState('jian', world.PROF_MAX), 'jian'), 0,
    '大圆满还报战力增量');
  assert.strictEqual(game.skillPowerGain(freshState(), 'jingxin'), 0, '未习得的功法给了战力增量');
  // 只读：算完之后存档里的熟练度不能变。
  assert.strictEqual(s.skills.jian.prof, 100, 'skillPowerGain 改到了存档');
});

check('破境建议：给的是离下一段最近的那门，不是加成最大的那门', function () {
  const s = freshState('jian', 0);
  s.skills.zhen = { unlocked: true, prof: 1400, onboarded: true }; // 差 100 到小成
  s.skills.tuna = { unlocked: true, prof: 0, onboarded: true };    // 差 300 到入门
  const step = game.nextPowerStep(s);
  assert.ok(step, '一门未圆满却给不出建议');
  assert.strictEqual(step.id, 'zhen', '没选离下一段最近的那门');
  assert.strictEqual(step.gap, 100, 'gap 算错');
  // 建议的门必须是自己真的能练的
  assert.strictEqual(s.skills[step.id].unlocked, true, '建议了一门没习得的功法');

  // 破境信息里的 lack 与 need/power 同源：页面不许再自己减一遍。
  const bt = game.breakthroughInfo(s);
  assert.strictEqual(bt.lack, Math.max(0, bt.need - bt.power), 'lack 与 need/power 不一致');
  assert.ok(bt.fastest && bt.fastest.gain > 0, '差战力时没给出最快的路');
  // 战力够了 / 已是大境界顶点时，不再给「该练哪门」——那时这句话是废话。
  const strong = freshState('jian', 0);
  Object.keys(strong.skills).forEach(function (id) { strong.skills[id].prof = world.PROF_MAX; });
  assert.strictEqual(game.breakthroughInfo(strong).fastest, null, '全员大圆满还给了练功建议');
});


check('本场运功：十五门各炼成一式，招式名两字且首字互不复用', function () {
  const moves = require('../data/moves.js');
  const names = [];
  skills.SKILLS.forEach(function (sk) {
    const m = moves.MOVES[sk.id];
    assert.ok(m, sk.id + ' 没有招式：这门功法在切磋里出不了场');
    assert.strictEqual(m.name.length, 2, sk.id + ' 的招式名不是两个字：「' + m.name + '」');
    assert.ok(moves.ACTS[m.act], sk.id + ' 的出手时机不是 open / guard / qi 之一');
    assert.ok(m.line && m.line.length >= 6, sk.id + ' 缺一句门规，玩家不知道这一式在做什么');
    names.push(m.name.slice(0, 1));
  });
  assert.strictEqual(names.length, skills.SKILLS.length, '招式数与功法数对不上');
  // 印章取首字：两式撞字，结算卡上就分不清谁是谁。
  assert.strictEqual(new Set(names).size, names.length, '有两式的印章首字重复');
});

check('本场运功：选中才生效，至多三式，没入门运不出去', function () {
  const moves = require('../data/moves.js');
  // 一门都不运：加成必须是 0，而不是「挂着就自动生效」。
  const none = game.battleMoves(freshState(), []);
  assert.strictEqual(none.powerBonus, 0, '一式不运却拿到了战力加成');
  assert.strictEqual(none.floorBonus, 0, '一式不运却拿到了波动加成');
  assert.strictEqual(none.qiRelief, 0, '一式不运却省了灵力');
  assert.strictEqual(none.entries.length, 0);

  // 段位 0（未入门）的式运不出去：这一式还没成形。
  const raw = freshState();
  raw.skills.jian.unlocked = true;
  raw.skills.jian.prof = 0;
  assert.strictEqual(game.battleMoves(raw, ['jian']).entries.length, 0, '未入门的功法被运出去了');

  // 入门之后同一式才有值。
  const inited = freshState();
  inited.skills.jian.unlocked = true;
  inited.skills.jian.prof = 300;
  const one = game.battleMoves(inited, ['jian']);
  assert.strictEqual(one.entries.length, 1, '入门的功法没被运出去');
  assert.ok(one.entries[0].percent > 0, '起手式没有百分数');

  // 上限三式：多传只取前三，且不重复取同一门。
  const many = freshState();
  Object.keys(many.skills).forEach(function (id) {
    many.skills[id].unlocked = true;
    many.skills[id].prof = world.PROF_MAX;
  });
  const ids = Object.keys(many.skills);
  const over = game.battleMoves(many, ids);
  assert.strictEqual(over.entries.length, moves.MAX_MOVES, '超过三式没有被截断');
  assert.strictEqual(game.battleMoves(many, [ids[0], ids[0], ids[0]]).entries.length, 1,
    '同一门功法被运了两次');
});

check('本场运功：养息能抵灵力，但抵不穿底线', function () {
  const moves = require('../data/moves.js');
  const s = freshState();
  const qiIds = [];
  skills.SKILLS.forEach(function (sk) {
    if (moves.MOVES[sk.id].act === 'qi') { s.skills[sk.id].unlocked = true; s.skills[sk.id].prof = world.PROF_MAX; qiIds.push(sk.id); }
  });
  assert.ok(qiIds.length >= 3, '养息类功法不足三门，这条断言失去意义');
  const mv = game.battleMoves(s, qiIds);
  assert.ok(mv.qiRelief > 0, '三门养息没省下任何灵力');
  assert.ok(mv.qiRelief <= moves.QI_RELIEF_CAP, '养息省下的灵力超过了封顶');
  // 硬底线：运功永远不能压到 0，否则「切磋要烧气」这条取舍整条失效。
  const board = game.moveBoard(s, qiIds);
  assert.ok(board.qiCost >= 2, '养息把运功压到了 ' + board.qiCost + ' 点，底线穿了');
  assert.ok(board.qiCost < board.qiBase, '养息没有真的降低这一场的运功消耗');
});

check('本场运功：三处对战共用同一份掷骰，谁也不许自己拼战力', function () {
  const src = engineSrc();
  // 直调 rollBattle 只有 rollWithMoves 一处：多一处就是「有一路没走运功」。
  const direct = src.match(/rollBattle\(/g) || [];
  assert.strictEqual(direct.length, 2, 'rollBattle 出现了 ' + direct.length + ' 次（定义 + 唯一调用点各一）');
  assert.ok(/function rollWithMoves\(/.test(src), '没有 rollWithMoves');
  // 押上运功之后战力必须真的变：只改展示不改算，等于没做。
  const s = freshState();
  s.skills.leiyue.unlocked = true;
  s.skills.leiyue.prof = world.PROF_MAX;
  const bare = game.computePower(s);
  const mv = game.battleMoves(s, ['leiyue']);
  assert.ok(mv.powerBonus > 0);
  assert.ok(Math.round(bare * (1 + mv.powerBonus)) > bare, '运功没有抬高出战战力');
});

console.log('品阶与段位断言全部通过：' + passed + ' 项');
