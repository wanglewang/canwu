'use strict';

// 品阶与难度体系常驻断言：零依赖，node tests/rank.test.js 直接跑。
//
// 一句话约定：熟练度只由「评级 + 连 S 层数」决定；品阶（天地玄黄）、难度档、境界只管
// 「一局烧多少灵力」与战力。连 S 与低档折减互不串联 —— 任何一条被写回另一条身上，
// 这里的断言都要炸。参悟不产资源，灵力只从闭关与份例来（data/economy.js）。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const game = require('../utils/game.js');
const practice = require('../data/practice.js');
const skills = require('../data/skills.js');
const world = require('../data/world.js');
const index = require('../minigames/index.js');

const ROOT = path.join(__dirname, '..');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log('OK  ' + name);
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

check('五难度档：门槛与耗气基数都单调递增，且不再挂倍率', function () {
  const economy = require('../data/economy.js');
  assert.strictEqual(practice.DIFFICULTIES.length, 5);
  assert.deepStrictEqual(practice.DIFFICULTIES.map(function (d) { return d.name; }), ['简单', '普通', '困难', '极难', '绝境']);
  assert.deepStrictEqual(practice.DIFFICULTIES.map(function (d) { return d.need; }), [0, 300, 1500, 6000, 24000]);
  assert.deepStrictEqual(practice.DIFFICULTIES.map(function (d) { return d.qi; }), economy.RUN_QI,
    '五档耗气基数没跟 economy.RUN_QI 对齐');
  for (const d of practice.DIFFICULTIES) {
    assert.strictEqual(d.mult, undefined, d.name + ' 还挂着早就没人用的收益倍率');
  }
  for (let i = 1; i < practice.DIFFICULTIES.length; i += 1) {
    assert.ok(practice.DIFFICULTIES[i].pace < practice.DIFFICULTIES[i - 1].pace, '高档节奏没有更紧');
    assert.ok(practice.DIFFICULTIES[i].goal > practice.DIFFICULTIES[i - 1].goal, '高档目标没有更高');
    assert.ok(practice.DIFFICULTIES[i].qi > practice.DIFFICULTIES[i - 1].qi, '高档耗气没有更贵');
  }
});

check('熟练度六阶与难度档门槛对齐，大圆满是硬顶', function () {
  assert.strictEqual(world.TIERS.length, 6);
  assert.deepStrictEqual(world.TIERS.map(function (t) { return t.threshold; }),
    [0, 300, 1500, 6000, 24000, 99999]);
  assert.deepStrictEqual(practice.DIFFICULTIES.map(function (d) { return d.need; }),
    world.TIERS.slice(0, 5).map(function (t) { return t.threshold; }), '五档门槛没取前五段');
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

check('数据层：十九门功法、天地玄黄四阶都有人、分类合法', function () {
  assert.strictEqual(skills.SKILLS.length, 19);
  const tiers = {};
  for (const s of skills.SKILLS) {
    assert.ok(practice.TIERS.some(function (t) { return t.key === s.tier; }), s.name + ' 品阶非法');
    assert.ok(s.kind === 'main' || s.kind === 'skill', s.name + ' 分类非法');
    assert.ok(practice.METHOD_MAP[s.method], s.name + ' 指向不存在的参悟方式');
    tiers[s.tier] = true;
  }
  assert.strictEqual(Object.keys(tiers).length, 4);
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

check('一族一个品阶只放一门：撞阶会让谱系按阶取槽时丢门', function () {
  const s = game.createNewState();
  for (const f of game.getFamilies(s)) {
    const seen = {};
    for (const it of f.items) {
      assert.ok(!seen[it.tierKey], f.type + ' 族内「' + it.tierName + '」阶撞车：' + it.name + ' / ' + seen[it.tierKey]);
      seen[it.tierKey] = it.name;
    }
    // 谱系四个槽：有功法的一格必须有名字，缺变体的才允许是空档。
    assert.strictEqual(f.slots.length, 4, f.type + ' 谱系刻度不是四阶');
    assert.strictEqual(f.slots.filter(function (x) { return !x.empty; }).length, f.items.length,
      f.type + ' 谱系显示的功法数与实际不符（同阶被盖掉）');
  }
});

check('阵法难，挂地阶；扫雷轻，挂黄阶', function () {
  const zhen = skills.getSkill('zhen');
  const wuxing = skills.getSkill('wuxingzhen');
  const leifu = skills.getSkill('leifu');
  assert.strictEqual(zhen.tier, 'di', '阵灯推演是十九门里最费脑的一门，不该留在低阶');
  assert.strictEqual(wuxing.tier, 'xuan', '五行相生与燃灯诀要排成玄 → 地，撞阶会让谱系丢门');
  assert.strictEqual(leifu.tier, 'huang', '数格辨禁难度低于阵法，应挂黄阶');
  // 改名不动 id：存档、纪录、参悟进度都按 id 索引。
  assert.strictEqual(zhen.id, 'zhen');
  assert.ok(zhen.name.indexOf('入门') < 0, '地阶功法还叫「入门」，名实不副');
});

// ---------------------------------------------------------------- 难度解锁

check('难度档只由本门熟练度解锁', function () {
  const samples = [[0, 0], [299, 0], [300, 1], [1499, 1], [1500, 2], [5999, 2], [6000, 3], [23999, 3], [24000, 4]];
  for (const pair of samples) {
    assert.strictEqual(practice.diffIndexOf(pair[0]), pair[1], pair[0] + ' 解锁档位错误');
    assert.strictEqual(practice.bestDifficulty(pair[0]), practice.DIFFICULTIES[pair[1]].key);
  }
});

check('difficultyList 标出未解锁档与所需熟练度', function () {
  const list = practice.difficultyList(1500, 'hard');
  assert.strictEqual(list.length, 5);
  assert.strictEqual(list.filter(function (d) { return d.unlocked; }).length, 3);
  assert.strictEqual(list[2].current, true);
  for (let i = 3; i < list.length; i += 1) {
    assert.strictEqual(list[i].unlocked, false);
    assert.ok(list[i].lockedText.indexOf(String(list[i].need)) >= 0);
  }
});

// ---------------------------------------------------------------- 结算公式

check('熟练度基础值不吃品阶：四阶同为 15 点，品阶只抬高耗气', function () {
  const cases = [
    { id: 'jian', realm: 0 },
    { id: 'jingxin', realm: 1 },
    { id: 'dan', realm: 2 },
    { id: 'duanyue', realm: 3 },
  ];
  const gains = [];
  const costs = [];
  for (const c of cases) {
    const s = freshState(c.id, 0, c.realm);
    const r = game.applyPractice(s, c.id, 'B', { difficulty: 'easy', score: 0 });
    assert.strictEqual(r.realmAbove, false, c.id + ' 不该超可修上限');
    gains.push(r.gain);
    costs.push(r.qiCost);
  }
  assert.deepStrictEqual(gains, [15, 15, 15, 15], '品阶插手了熟练度');
  // 时长系数各不相同，所以不比绝对值，只比「品阶这一层」：逐阶递增。
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1],
      '第 ' + (i + 1) + ' 阶的耗气没有更高：' + costs.join(' / '));
  }
});

check('熟练度基础值不吃难度：五档同为 15 点，难度只抬高耗气', function () {
  // 拿「刚好解锁这一档」的熟练度去比：每一局都是「本门最高档」，不吃低档折减。
  const gains = [];
  const costs = [];
  for (const d of practice.DIFFICULTIES) {
    const s = freshState('jingxin', d.need, 1);
    const r = game.applyPractice(s, 'jingxin', 'B', { difficulty: d.key, score: 0 });
    assert.strictEqual(r.diffName, d.name);
    assert.strictEqual(r.realmAbove, false);
    assert.strictEqual(r.diffBelowCap, false, d.name + ' 是最高已解锁档，不该折减');
    assert.strictEqual(r.gain, world.PROF_BASE.B, d.name + ' 的熟练度不是基础值');
    gains.push(r.gain);
    costs.push(r.qiCost);
  }
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1], '第 ' + (i + 1) + ' 档耗气没有更高：' + costs.join(' / '));
  }
});

check('退回低档：资源与基础熟练度折半；连 S 不叠层也不断连', function () {
  // 已被解锁的最高档是「困难」（1500），偏偏去玩简单档：低 2 档 = 0.5² = 0.25。
  const prof = 1500;
  assert.strictEqual(practice.bestDifficulty(prof), 'hard', '默认档不是最高已解锁档');
  assert.strictEqual(practice.diffGapOf(prof, 'easy'), 2, '简单档的落差算错了');
  assert.strictEqual(practice.lowDiffFactor(prof, 'easy'), 0.25, '低两档没折两次半');
  assert.strictEqual(practice.belowCapOf(prof, 'easy'), true, '低档没被判成折减');
  assert.strictEqual(practice.belowCapOf(prof, 'hard'), false, '最高档被误判成折减');

  // 低档 S 给「基础 34 逐档折半」的 9 点，既不走连击曲线，也不砍连击收益。
  const low = freshState('jingxin', prof, 1);
  const r = game.applyPractice(low, 'jingxin', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(r.diffBelowCap, true, '结算没标出折减');
  assert.strictEqual(r.diffBelowGap, 2, '结算没报出低了几档');
  assert.strictEqual(r.diffBelowCapFactor, 0.25, '结算系数不是 0.5²');
  assert.strictEqual(r.gain, practice.profBelowCap(world.PROF_BASE.S, prof, 'easy'),
    '熟练度没按档差逐档 ÷2 四舍五入');
  assert.strictEqual(r.gain, 9, 'S 低两档应是 34 → 17 → 9');
  assert.strictEqual(r.comboActive, false, '低档 S 走了连击曲线');
  assert.strictEqual(r.comboTransparent, true, '低档局没标成「与连 S 无关」');
  assert.strictEqual(r.comboNow, 0, '低档 S 叠了层');
  assert.strictEqual(r.comboGain, 0);
  assert.strictEqual(low.sCombo.jingxin, 0, '低档 S 写进了连击存档');

  // 先在最高档连两局 S，再去简单档打一局 B：层数原样保留，回高档照常接第 3 连。
  const kept = freshState('jingxin', prof, 1);
  game.applyPractice(kept, 'jingxin', 'S', { difficulty: 'hard', score: 0 });
  game.applyPractice(kept, 'jingxin', 'S', { difficulty: 'hard', score: 0 });
  assert.strictEqual(kept.sCombo.jingxin, 2);
  const back = game.applyPractice(kept, 'jingxin', 'B', { difficulty: 'easy', score: 0 });
  assert.strictEqual(back.comboNow, 2, '低档局把连 S 清了');
  assert.strictEqual(back.comboActive, false);
  assert.strictEqual(back.gain, practice.profBelowCap(world.PROF_BASE.B, prof, 'easy'));
  const third = game.applyPractice(kept, 'jingxin', 'S', { difficulty: 'hard', score: 0 });
  assert.strictEqual(third.comboNow, 3);
  assert.strictEqual(third.gain, 77, '低档练手后第 3 连没按 34 × 1.5² 接上');

  // 界线要能一句话讲：只解锁普通时打简单，S 只剩 17 点，而普通档 S 是 34 点。
  // 耗气不跟着折——低档本来就便宜，再折就等于奖励「刷低档」。
  const lowS = freshState('jingxin', 300, 1);
  const easyS = game.applyPractice(lowS, 'jingxin', 'S', { difficulty: 'easy', score: 0 });
  const topS = freshState('jingxin', 300, 1);
  const normalS = game.applyPractice(topS, 'jingxin', 'S', { difficulty: 'normal', score: 0 });
  assert.strictEqual(easyS.gain, practice.profBelowCap(world.PROF_BASE.S, 300, 'easy'),
    '简单档 S 的熟练度没按 ÷2 四舍五入折半');
  assert.strictEqual(easyS.gain, 17, '低一档的 S 应是 34 → 17');
  assert.strictEqual(normalS.gain, world.PROF_BASE.S, '最高档的 S 不该被折');
  assert.ok(easyS.qiCost < normalS.qiCost,
    '简单档该比普通档便宜（' + easyS.qiCost + ' vs ' + normalS.qiCost + '）');
  assert.ok(easyS.gain / easyS.qiCost < normalS.gain / normalS.qiCost,
    '折半后简单档 S 的「每点灵力熟练度」不该还高过普通档 S');

  // 熟练度还没到 300 时，简单档就是最高档：不折减，新手照常起手 34 点。
  const rookie = freshState('jingxin', 120, 1);
  const rr = game.applyPractice(rookie, 'jingxin', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(rr.diffBelowCap, false, '新手在简单档也被折减了');
  assert.strictEqual(rr.gain, 34, '新手第一局 S 不是 34 点');
  assert.strictEqual(rr.comboActive, true);
  assert.strictEqual(rr.comboNow, 1);
});

check('折减按落差累进：解锁困难后简单 ×0.25、普通 ×0.5，绝境后简单 ×0.0625', function () {
  // 玩家定的口径：解锁普通 → 简单折半；再解锁困难 → 简单再折半、普通跟着折半；以此类推。
  assert.strictEqual(practice.lowDiffFactor(300, 'easy'), 0.5, '刚解锁普通时简单不是 ×0.5');
  assert.strictEqual(practice.lowDiffFactor(1500, 'easy'), 0.25, '解锁困难后简单没再折半');
  assert.strictEqual(practice.lowDiffFactor(1500, 'normal'), 0.5, '解锁困难后普通没跟着折半');
  assert.strictEqual(practice.lowDiffFactor(6000, 'easy'), 0.125, '解锁极难后简单不是 ×0.125');
  assert.strictEqual(practice.lowDiffFactor(24000, 'easy'), 0.0625, '绝境全开后简单不是 ×0.0625');

  // 绝境解锁后五档的系数：0.5^4 / 0.5^3 / 0.5^2 / 0.5 / 1。
  const prof = 24000;
  const factors = [0.0625, 0.125, 0.25, 0.5, 1];
  practice.DIFFICULTIES.forEach(function (d, i) {
    assert.strictEqual(practice.lowDiffFactor(prof, d.key), factors[i], d.name + ' 的档差系数不对');
    assert.strictEqual(practice.belowCapOf(prof, d.key), i < 4, d.name + ' 的折减判定不对');
  });

  // 折减只落在熟练度上：耗气仍按各档自己的基数，不吃 lowDiffFactor。
  const costs = practice.DIFFICULTIES.map(function (d) {
    const r = game.applyPractice(freshState('jingxin', prof, 1), 'jingxin', 'C', { difficulty: d.key, score: 0 });
    return r.qiCost;
  });
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1], '第 ' + (i + 1) + ' 档耗气没跟着档位走（' + costs.join(' / ') + '）');
  }

  // 熟练度吃的是同一个档差，但按整数点逐档 ÷2 四舍五入：越退越薄，且不会归零。
  const gains = [];
  practice.DIFFICULTIES.forEach(function (d, i) {
    const s = freshState('jingxin', prof, 1);
    const r = game.applyPractice(s, 'jingxin', 'C', { difficulty: d.key, score: 0 });
    assert.strictEqual(r.gain, practice.profBelowCap(world.PROF_BASE.C, prof, d.key),
      d.name + ' 的熟练度没按 ' + factors[i] + ' 逐档折');
    gains.push(r.gain);
  });
  for (let i = 1; i < gains.length; i += 1) {
    assert.ok(gains[i] >= gains[i - 1], '折减后熟练度出现倒挂：' + gains.join(' / '));
  }

  // 四档低档的 S 都不叠连 S：层数保持 0，收益也不会被连击曲线抬起来。
  ['easy', 'normal', 'hard', 'expert'].forEach(function (key, i) {
    const s = freshState('jingxin', prof, 1);
    const r = game.applyPractice(s, 'jingxin', 'S', { difficulty: key, score: 0 });
    assert.strictEqual(r.diffBelowCap, true, key + ' 没被判成折减');
    assert.strictEqual(r.diffBelowCapFactor, factors[i], key + ' 的折减系数不对');
    assert.strictEqual(r.comboActive, false, key + ' 的 S 走了连击曲线');
    assert.strictEqual(r.comboNow, 0, key + ' 的 S 叠了层');
    assert.strictEqual(s.sCombo.jingxin || 0, 0, key + ' 的 S 写进了连击存档');
  });
});

check('低档熟练度：每档 ÷2 后四舍五入，不是最后取整一次', function () {
  // 玩家定的口径：除以 2 就四舍五入，拿得到的整数继续除下一次，退到最低档也不会归零。
  const ladder = {
    S: [34, 17, 9, 5, 3],
    A: [23, 12, 6, 3, 2],
    B: [15, 8, 4, 2, 1],
    C: [10, 5, 3, 2, 1],
  };
  const capProf = practice.DIFFICULTIES[practice.DIFFICULTIES.length - 1].need;
  Object.keys(ladder).forEach(function (g) {
    assert.deepStrictEqual(practice.profLadder(world.PROF_BASE[g]), ladder[g],
      g + ' 的逐档折减不是「除以 2 后四舍五入」');
    ladder[g].forEach(function (want, gap) {
      const key = practice.DIFFICULTIES[practice.DIFFICULTIES.length - 1 - gap].key;
      assert.strictEqual(practice.profBelowCap(world.PROF_BASE[g], capProf, key), want,
        g + ' 低 ' + gap + ' 档算错了');
    });
  });
  // 必须真的和「先乘 0.5^档差、最后取整一次」分得开，否则这条规则等于没改。
  // 34 低三档：逐档 34 → 17 → 9 → 5，一次性 34 × 0.125 = 4.25 只给 4。
  assert.notStrictEqual(practice.profBelowCap(world.PROF_BASE.S, 6000, 'easy'),
    Math.round(world.PROF_BASE.S * 0.125), '逐档取整与一次性取整撞在一起，取整规则没生效');
  // 走火仍是 0 点，且不分档位一律断连。
  const s = freshState('jingxin', capProf, 1);
  s.sCombo.jingxin = 7;
  const r = game.applyPractice(s, 'jingxin', 'F', { difficulty: 'easy', score: 0 });
  assert.strictEqual(r.gain, 0, '走火还给了熟练度');
  assert.strictEqual(r.comboNow, 0, '低档走火没断连');
});

check('走火：F 算一局，但熟练度为零——气照烧、灵石不动、连 S 归零', function () {
  // F 有两种来历，这里测的是「玩到一半被判负」的那种：
  // 它是一局真实打完的结果，所以要进结算（报价、断连），但结论是这一局作废——
  // 不是「最低一档」，所以一分熟练度都没有。主动收功不调 applyPractice，走 breakCombo()。
  const s = freshState('jingxin', 1200, 1);
  s.sCombo.jingxin = 2;
  const qiBefore = s.resources.qi;
  const stoneBefore = s.resources.stone;
  const profBefore = s.skills.jingxin.prof;
  const r = game.applyPractice(s, 'jingxin', 'F', { difficulty: 'hard', score: 0 });
  assert.strictEqual(r.gradeFactor, 0, '走火倍率不是 0');
  assert.strictEqual(r.wiped, true, '走火没被标记成整局作废');
  assert.strictEqual(r.gain, 0, '走火还给了熟练度');
  assert.strictEqual(s.skills.jingxin.prof, profBefore, '走火把熟练度写进存档了');
  // 气在起手时就烧掉了：走火不退，这才是「走火」真正的分量。
  assert.ok(r.qiCost > 0, '走火这一局没有报价');
  assert.strictEqual(s.resources.qi, qiBefore - r.qiCost, '走火没扣灵力（或扣错了数）');
  assert.strictEqual(s.resources.stone, stoneBefore, '走火动了灵石——灵石只从对战来');
  assert.strictEqual(s.buff.multiplier, 1, '走火还给了挂机加成');
  assert.strictEqual(r.comboNow, 0, '走火没有断连');
  assert.strictEqual(s.sCombo.jingxin, 0, '走火后存档里的连 S 没清');

  // 对照：同一门、同一档打出 S，熟练度必须有——F 与 S 是「有」和「没有」，不是「差几倍」。
  const s2 = freshState('jingxin', 1200, 1);
  const rs = game.applyPractice(s2, 'jingxin', 'S', { difficulty: 'hard', score: 0 });
  assert.ok(rs.gain > 0, 'S 没有熟练度收益');
  assert.ok(rs.qiCost > 0, 'S 这一局没有报价');

  // 走火不立纪录：没走完的这一局不该成为「本门最佳」。
  assert.strictEqual(s.records.jingxin, undefined, '走火被写成了本门纪录');
  // 而同一存档之后打出 S，纪录照常出现。
  const s3 = freshState('jingxin', 1200, 1);
  game.applyPractice(s3, 'jingxin', 'F', { difficulty: 'hard', score: 0 });
  game.applyPractice(s3, 'jingxin', 'S', { difficulty: 'hard', score: 640 });
  assert.strictEqual(s3.records.jingxin.score, 640, '走火之后的正常一局没立纪录');
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
    const r = game.applyPractice(s, 'jingxin', 'B', { difficulty: 'hard', score: i });
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
  const eng = fs.readFileSync(path.join(ROOT, 'utils/game.js'), 'utf8');
  // 只在 applyPractice 的函数体里找：闭关与对战当然要给灵力灵石，参悟不许。
  const start = eng.indexOf('function applyPractice(');
  const end = eng.indexOf('\nfunction ', start + 10);
  assert.ok(start > 0 && end > start, '没找到 applyPractice 的函数体');
  const body = eng.slice(start, end);
  assert.ok(!/resources\.(qi|stone) \+=/.test(body),
    'applyPractice 里还有一处直接给存档加灵力或灵石');
});

check('默认难度跟熟练度走：门槛一到就默认最高档，不记忆手选', function () {
  const pairs = [[0, 'easy'], [299, 'easy'], [300, 'normal'], [1499, 'normal'],
    [1500, 'hard'], [6000, 'expert'], [24000, 'desperate']];
  for (const pair of pairs) {
    assert.strictEqual(practice.bestDifficulty(pair[0]), pair[1],
      pair[0] + ' 熟练度的默认档不是 ' + pair[1]);
  }
  // 准备页每次重算默认档，只把「本次停留里的手选」放在内存里（diffOverride）。
  const page = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.js'), 'utf8');
  assert.ok(/this\.diffOverride = ''/.test(page), '准备页没把手选难度标成「本次停留有效」');
  assert.ok(/keepOverride \? this\.diffOverride : practiceData\.DIFFICULTIES\[maxIdx\]\.key/.test(page),
    '准备页默认档没按最高已解锁档取');
  assert.ok(/maxIdx > this\.maxIdxSeen/.test(page), '解锁新档时没清掉手选、回到新档');
});

check('越权选高档自动回落到已解锁的最高档', function () {
  const s = freshState('jian', 0, 0);
  const r = game.applyPractice(s, 'jian', 'B', { difficulty: 'desperate', score: 0 });
  assert.strictEqual(r.diffFellBack, true);
  assert.strictEqual(r.diffKey, 'easy');
  assert.strictEqual(r.diffMaxName, '简单');
});

check('耗气叠乘有底：天阶绝境最贵，但也压不穿最低 1 点', function () {
  const economy = require('../data/economy.js');
  const s = freshState('taixu', 24000, 3);
  s.realmIndex = 3;
  const r = game.applyPractice(s, 'taixu', 'S', { difficulty: 'desperate', score: 0 });
  assert.strictEqual(r.tierKey, 'tian');
  assert.ok(r.qiCost >= economy.QI_COST_MIN, '耗气低于绝对下限');
  const got = [];
  for (const d of ['hard', 'expert', 'desperate']) {
    const st = freshState('taixu', 24000, 3);
    st.realmIndex = 3;
    got.push(game.applyPractice(st, 'taixu', 'S', { difficulty: d }).qiCost);
  }
  assert.ok(got[1] > got[0] && got[2] > got[1],
    '天阶各难度档耗气没有一档比一档贵：' + got.join(' / '));
  // 反向：悟性拉满 + 心法省气封顶，也不能把耗气压到 0 或负数。
  const cheap = game.createNewState();
  cheap.skills.jian.unlocked = true;
  cheap.skills.jian.prof = 30000;
  cheap.resources.qi = 1e6;
  for (const id of Object.keys(cheap.skills)) {
    cheap.skills[id].unlocked = true;
    cheap.skills[id].prof = 6000;
  }
  const floor = game.applyPractice(cheap, 'jian', 'C', { difficulty: 'easy', score: 0 });
  assert.ok(floor.qiCost >= economy.QI_COST_MIN, '堆满省气后耗气压到了 ' + floor.qiCost + ' 点');
});

check('境界超上限只加价 1.5 倍，不禁练也不砍熟练度', function () {
  const economy = require('../data/economy.js');
  // 黄阶（门槛炼气、上限筑基）：炼气正常，金丹超上限要加价
  const low = freshState('jian', 0, 0);
  const r0 = game.applyPractice(low, 'jian', 'B', { difficulty: 'easy' });
  assert.strictEqual(r0.realmOverCost, 1);
  const old = freshState('jian', 0, 2);
  const r1 = game.applyPractice(old, 'jian', 'B', { difficulty: 'easy' });
  assert.strictEqual(r1.realmAbove, true);
  assert.strictEqual(r1.realmOverCost, economy.REALM_OVER);
  assert.ok(r1.realmReason.indexOf('上限') >= 0);
  assert.ok(r1.qiCost > r0.qiCost, '超上限后耗气没有更贵（' + r1.qiCost + ' vs ' + r0.qiCost + '）');
  // 加价不等于作废：熟练度照给，跟没超上限时一模一样。
  assert.strictEqual(r1.gain, world.PROF_BASE.B, '境界加价碰了熟练度基础值');
});

check('没到门槛不许开练，与「超上限只加价」是两件事', function () {
  // 天阶（门槛元婴）：炼气期连开练都不允许，返回 ok:false 而不是打折结算。
  const early = freshState('duanyue', 0, 0);
  const r = game.applyPractice(early, 'duanyue', 'B', { difficulty: 'easy' });
  assert.strictEqual(r.ok, false, '没到门槛也让它练了');
  assert.ok(String(r.msg).indexOf('境界') >= 0 || String(r.msg).indexOf('修') >= 0,
    '拒绝理由没提境界：' + r.msg);
  const proper = freshState('duanyue', 0, 3);
  const rp = game.applyPractice(proper, 'duanyue', 'B', { difficulty: 'easy' });
  assert.strictEqual(rp.ok, true);
  assert.strictEqual(rp.realmOverCost, 1);
});

check('属性加成乘品阶系数：同段位下天阶高于黄阶', function () {
  const base = game.createNewState();
  const baseShen = game.computeAttributes(base).shen;
  const a = freshState('jian', 300, 0);
  const b = freshState('duanyue', 300, 3);
  const addA = Math.round((game.computeAttributes(a).shen - baseShen) * 10) / 10;
  const addB = Math.round((game.computeAttributes(b).shen - baseShen) * 10) / 10;
  // 黄阶 shen +3 × 1.0；天阶 shen +4 × 2.2
  assert.strictEqual(addA, 3);
  assert.strictEqual(addB, 8.8);
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
  // 规格按档递增的五门由各自的档位表管（lights / sudoku / klotski / click / mines），
  // 见下面的专条断言。它们的盘面「该变」，所以不在这条里被判。
  const tableGames = ['lights', 'sudoku', 'klotski', 'click', 'mines'];
  // 档位表住在玩法模块里的四门（merge / schulte / pushbox / biggest）：params 只有 depth，
  // 「难度确实变了」要看它们的评级线随档收紧——线不变才是真没区分度。
  const internalGames = ['merge', 'schulte', 'pushbox', 'biggest'];
  for (const m of practice.PRACTICE_METHODS) {
    if (tableGames.indexOf(m.game) >= 0) continue;
    const easy = practice.buildParams(m, 'easy');
    const hard = practice.buildParams(m, 'desperate');
    if (internalGames.indexOf(m.game) >= 0) {
      const mod = require('../minigames/' + m.game + '.js');
      const a = mod.lines(easy, 'normal').items.join('');
      const b = mod.lines(hard, 'hard').items.join('');
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

check('换承重轴的三门：变的是复杂度与盘面，不是时间', function () {
  // 起因：五档时间参数走同一套 pace / TIME_LEVELS，跨度天然只有 1.7–2.3 倍，
  // 而且反应速度练不出来——把难度压在「快」上，玩家只会更焦虑。
  // 这三门把承重交给盘面、刀路、键位与禁制，时间只负责让节奏别拖。
  let prevGrid = 0;
  let prevLen = -1;
  for (const d of practice.DIFFICULTIES) {
    const lv = practice.CLICK_LEVELS[d.depth];
    assert.ok(lv.grid >= prevGrid, d.name + ' 开锋诀盘面反而变小');
    assert.strictEqual(lv.cols * lv.cols, lv.grid, d.name + ' 开锋诀的 grid 与 cols 对不上');
    assert.ok(lv.lenStep >= prevLen, d.name + ' 开锋诀刀路变短');
    prevGrid = lv.grid;
    prevLen = lv.lenStep;
  }
  const c0 = practice.CLICK_LEVELS[0];
  const c4 = practice.CLICK_LEVELS[4];
  assert.ok(c4.grid / c0.grid >= 2.5,
    '开锋诀盘面跨度只有 ' + (c4.grid / c0.grid).toFixed(2) + ' 倍，承重轴没立起来');
  assert.ok((3 + c4.lenStep) / (3 + c0.lenStep) >= 2.5,
    '开锋诀刀路跨度只有 ' + ((3 + c4.lenStep) / (3 + c0.lenStep)).toFixed(2) + ' 倍');
  // 简单档的刀路要短到「一眼扫得完」：3 桩是 3×3 小盘上的直线，读完不用二次思考。
  assert.strictEqual(3 + c0.lenStep, 3, '开锋诀简单档刀路不是最短的 3 桩');

  let prevCells = 0;
  let prevMines = 0;
  for (const d of practice.DIFFICULTIES) {
    const lv = practice.MINES_LEVELS[d.depth];
    const cells = lv.cols * lv.rows;
    // 前两档同为 6×6，靠禁制数（5→6）区分；盘面只许变大，不许缩回去。
    assert.ok(cells >= prevCells, d.name + ' 勘禁诀盘面反而变小');
    assert.ok(lv.mines > prevMines, d.name + ' 勘禁诀禁制数没有增加');
    const density = lv.mines / cells;
    // 密度必须稳在一个区间里：密度太低是空盘、太高是无处下脚，
    // 两种都不叫「变难」，叫「换了一盘棋」。
    assert.ok(density > 0.12 && density < 0.20,
      d.name + ' 勘禁诀禁制密度 ' + (density * 100).toFixed(1) + '% 超出 12–20%');
    prevCells = cells;
    prevMines = lv.mines;
  }
  // 五档至少四种盘面规格，否则「盘面变难」只是名义上的。
  const mineSizes = {};
  for (const lv of practice.MINES_LEVELS) mineSizes[lv.cols] = true;
  assert.ok(Object.keys(mineSizes).length >= 4,
    '勘禁诀盘面只有 ' + Object.keys(mineSizes).length + ' 种规格，撑不起五档阶梯');
  const m0 = practice.MINES_LEVELS[0];
  const m4 = practice.MINES_LEVELS[4];
  assert.ok((m4.cols * m4.rows) / (m0.cols * m0.rows) >= 2.2,
    '勘禁诀盘面跨度只有 ' + ((m4.cols * m4.rows) / (m0.cols * m0.rows)).toFixed(2) + ' 倍');

  // 步法：五档必须是五个不同配置。旧表 segments 3/4/4/5/5、baseLen 3/3/3/4/4，
  // 算下来 hard 与 normal 都是 18 步、expert 与 desperate 都是 30 步——五档只有三个配置。
  const seen = {};
  for (const d of practice.DIFFICULTIES) {
    const lv = practice.SWORD_LEVELS[d.depth];
    const sig = lv.segments + '段/' + lv.baseLen + '起';
    assert.ok(!seen[sig], d.name + ' 步法连环与前面某档配置完全一样（' + sig + '）');
    seen[sig] = true;
    if (d.depth >= 2) assert.strictEqual(lv.shuffle, true, d.name + ' 步法键位没有每段重排');
    else assert.strictEqual(lv.shuffle, false, d.name + ' 步法入门档不该重排键位');
  }
});

check('九宫填数与滑块让路的档位表逐档变难', function () {
  let prevHoles = 0;
  let prevS = 0;
  for (const d of practice.DIFFICULTIES) {
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
  for (const d of practice.DIFFICULTIES) {
    const kl = practice.klotskiLevelOf(d.key);
    assert.ok(kl.minOpt > prevOpt, d.name + ' 的最优步数下限没有提高');
    prevOpt = kl.minOpt;
  }
});

check('阵灯推演的规格与预算逐档递增，且预算宽于最优步数下限', function () {
  let prevSize = 0;
  let prevCap = 0;
  for (const d of practice.DIFFICULTIES) {
    const lv = practice.lightsLevelOf(d.key);
    assert.ok(lv.size >= prevSize, d.name + ' 的盘面规格比上一档还小');
    assert.ok(lv.cap > prevCap, d.name + ' 的步数预算没有放宽');
    assert.ok(lv.cap > lv.min + 2, d.name + ' 的预算太紧，A/B 档没留余量');
    prevSize = lv.size;
    prevCap = lv.cap;
  }
  const p = practice.buildParams(practice.getMethod('arrayEye'), 'desperate');
  assert.deepStrictEqual([p.size, p.minSteps, p.capSteps],
    [practice.LIGHTS_LEVELS[4].size, practice.LIGHTS_LEVELS[4].min, practice.LIGHTS_LEVELS[4].cap],
    '绝境档没拿到 5×5 与对应预算');
});

check('节奏不越过触屏安全下限', function () {
  for (const m of practice.PRACTICE_METHODS) {
    const out = practice.buildParams(m, 'desperate');
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
  assert.strictEqual(list.length, 19);
  for (const item of list) {
    assert.ok(item.tierName && item.tierLabel && item.tierColor);
    assert.ok(item.starsText.length === 4);
    assert.ok(item.rewardText.indexOf('耗气') >= 0, '功法卡片没写运功耗气');
    assert.ok(item.maxRealmName && item.needRealmName);
    assert.ok(item.diffName && item.diffText.indexOf(item.diffName) >= 0,
      '功法卡片的难度行没写「最高可选哪一档」');
    assert.ok(item.profTierName, '熟练度段位缺失');
    assert.strictEqual(typeof item.decayed, 'boolean');
  }
});

check('getFamilies 四档刻度齐全，缺变体的档位标空档', function () {
  const s = freshState('', 0, 0);
  const fams = game.getFamilies(s);
  assert.ok(fams.length >= 5);
  const dao = fams.find(function (f) { return f.type === '刀法'; });
  assert.ok(dao && dao.core, '新增的刀法族没进功法谱系');
  const sword = fams.find(function (f) { return f.type === '剑法'; });
  assert.strictEqual(sword.slots.length, 4);
  assert.ok(sword.core, '游戏族核心玩法缺失');
  // 这一版先不做剑法：初始功法改刀法后，剑法族只余天阶的剑法·断岳诀。
  assert.strictEqual(sword.slots.filter(function (x) { return x.empty; }).length, 3, '剑法族应只剩一门、空三档');
  for (const f of fams) {
    for (const node of f.slots) {
      assert.ok(node.tierName && node.starsText);
      if (!node.empty) assert.ok(node.gameName, node.name + ' 缺少玩法名');
    }
  }
});

check('纪录只记最高分，低分不覆盖', function () {
  const s = freshState('jian', 0, 0);
  game.applyPractice(s, 'jian', 'B', { difficulty: 'easy', score: 30 });
  const r = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 8 });
  assert.strictEqual(r.newRecord, false);
  assert.strictEqual(r.bestScore, 30);
  assert.strictEqual(s.records.jian.score, 30);
});

check('v3 存档升到 v7，熟练度与纪录原样保留，灵力补到身家并夹到气海', function () {
  const old = freshState('jian', 812, 0);
  old.version = 3;
  old.records = { jian: { score: 42, grade: 'A', at: 1 } };
  old.resources.qi = 0;   // 老档的灵力没有任何意义（旧版参悟产灵力，攒下来的没处花）
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 7);
  assert.strictEqual(n.skills.jian.prof, 812);
  assert.strictEqual(n.records.jian.score, 42);
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

check('九套经典玩法都挂黄阶，价格也按品阶阶梯走', function () {
  const classics = ['lingqi', 'leiyue', 'sanxiu', 'shudu', 'heyuan', 'shumu', 'rongdao', 'tuisuo', 'zeda'];
  for (const id of classics) {
    assert.strictEqual(skills.getSkill(id).tier, 'huang', id + ' 不是黄阶');
  }
  const shop = skills.SKILLS.filter(function (x) { return x.source.kind === 'shop'; });
  const huang = shop.filter(function (x) { return x.tier === 'huang'; });
  const xuan = shop.filter(function (x) { return x.tier === 'xuan'; });
  assert.ok(huang.length >= 4 && xuan.length >= 2);
  for (const h of huang) {
    for (const x of xuan) {
      assert.ok(h.source.cost.stone <= x.source.cost.stone, h.name + ' 灵石比玄阶还贵');
    }
  }
  // 功法只收灵石：灵力是练功的燃料，不进价目表。
  for (const s of shop) {
    assert.strictEqual(s.source.cost.qi, undefined, s.name + ' 的价格里还有灵力');
    assert.ok(s.source.cost.stone > 0, s.name + ' 没有灵石价格');
  }
});

// ---------------------------------------------------------------- 五档区分度
// 这一组是「简单 / 普通 / 困难 / 极难 / 绝境」到底有没有真的分档的常驻守卫。
// scripts/difficulty-audit.js 是给人看的只读报告，这里才是 npm run check 会跑的断言。

check('三秀同收：五档整表同管盘面、时辰、罚息与 S 线，不再只改分数线', function () {
  const lv = practice.MATCH_LEVELS;
  assert.strictEqual(lv.length, 5, '五档表不是五档');
  for (let i = 1; i < lv.length; i += 1) {
    assert.ok(lv[i].kinds >= lv[i - 1].kinds, '第 ' + (i + 1) + ' 档花色反而少了');
    assert.ok(lv[i].duration < lv[i - 1].duration, '第 ' + (i + 1) + ' 档时辰没收紧');
    assert.ok(lv[i].missCost >= lv[i - 1].missCost, '第 ' + (i + 1) + ' 档罚息反而轻了');
    assert.ok(lv[i].hintCost >= lv[i - 1].hintCost && lv[i].shuffleCost >= lv[i - 1].shuffleCost,
      '第 ' + (i + 1) + ' 档辅助代价反而轻了');
    // 按本档实测标定：盘面更难，同样分数更难得，S 线应当略降而不是 +150。
    assert.ok(lv[i].sLine < lv[i - 1].sLine, '第 ' + (i + 1) + ' 档 S 线还在随档抬高');
  }
  assert.ok(lv[4].kinds > lv[0].kinds && lv[0].duration > lv[4].duration,
    '绝境与简单的盘面拉不开：花色 / 时辰都没变');

  const keys = ['easy', 'normal', 'hard', 'expert', 'desperate'];
  const method = practice.getMethod('harvest');
  assert.strictEqual(method.tip, practice.tipFor(method, 'easy'),
    '功法表里的兜底代价句和简单档罚息分叉了');
  keys.forEach(function (k, i) {
    const p = practice.buildParams(method, k);
    assert.strictEqual(p.kinds, lv[i].kinds, k + ' 的花色没送进玩法层');
    assert.strictEqual(p.duration, lv[i].duration, k + ' 的时辰没送进玩法层');
    assert.strictEqual(p.missCost, lv[i].missCost, k + ' 的罚息没送进玩法层');
    assert.strictEqual(p.sLine, lv[i].sLine, k + ' 的 S 线没送进玩法层');
    assert.strictEqual(practice.sLineOf(method, k), lv[i].sLine, k + ' 的 S 线不是同一份真源');
    assert.ok(practice.tipFor(method, k).indexOf('少 ' + lv[i].missCost + ' 息') >= 0,
      k + ' 的代价句还在写别的档的罚息');
    assert.ok(practice.sLineText(method, k).indexOf('盘面越难') >= 0,
      k + ' 的说明没讲清「S 线为什么反而低」');
  });
  // 代价句按档变，不许五档共用一句写死的「少 2 息」。
  assert.strictEqual(new Set(keys.map(function (k) { return practice.tipFor(method, k); })).size, 3);
  assert.strictEqual(practice.tipFor(practice.getMethod('forge'), 'easy'),
    practice.tipFor(practice.getMethod('forge'), 'desperate'), '别的门不该被按档改写代价句');
});

check('时辰尺子与四门补的档位参数都只收紧不放宽，且玩法层真的拿得到', function () {
  assert.deepStrictEqual(practice.TIME_LEVELS, [1, 0.97, 0.94, 0.91, 0.88], '时辰尺子被改了');
  assert.deepStrictEqual(practice.MINES_HEARTS, [3, 3, 3, 2, 2]);
  assert.deepStrictEqual(practice.MERGE_START_TILES, [2, 2, 3, 3, 4]);
  assert.deepStrictEqual(practice.PUSHBOX_CAP_FACTORS, [2.2, 2.0, 1.9, 1.75, 1.6]);
  const mines = require('../minigames/mines.js');
  assert.deepStrictEqual(mines.HEARTS_BY_DEPTH, practice.MINES_HEARTS,
    '心神表的两份真源分叉了');
  const keys = ['easy', 'normal', 'hard', 'expert', 'desperate'];
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
  assert.ok(get('forge', 'easy', 'duration') > get('forge', 'desperate', 'duration'));
  assert.ok(get('stones', 'easy', 'timeLimit') > get('stones', 'desperate', 'timeLimit'));
  const detail = practice.diffDetail(practice.getMethod('tanlei'), 'desperate');
  assert.ok(detail.changes.length >= 2, '绝境档的难度说明没写出两处收紧');
});

check('十九门五档都至少两个可见参数在变，且评级线或盘面规格给出对照', function () {
  const keys = ['easy', 'normal', 'hard', 'expert', 'desperate'];
  const internal = ['depth', 'gear', 'sBase', 'sStep'];
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
      return (index.MODULES[m.game].lines(p, practice.difficultyOf(keys[i]).gear).items || []).join('|');
    })).size;
    const boardChanged = vary.some(function (k) { return /size|holes|minSteps|capSteps|level/.test(k); });
    assert.ok(variants > 1 || boardChanged,
      m.id + ' 的说明页五档写同一行，玩家没法对照');
  }
});

check('连 S 层数上限与存档版本对齐，三连晋级已彻底退役', function () {
  assert.strictEqual(game.COMBO_MAX, world.COMBO_MAX);
  assert.strictEqual(game.createNewState().version, 7);
  assert.strictEqual(game.S_STREAK_GOAL, undefined, '旧的三连目标常量还在导出');
  assert.deepStrictEqual(game.createNewState().sCombo, {});
  const engine = fs.readFileSync(path.join(ROOT, 'utils/game.js'), 'utf8');
  assert.ok(!/promotion|sStreakGoal|S_STREAK_GOAL/.test(engine),
    '结算里还留着三连晋级的字段（迁移注释里的 sStreak 除外）');
});

console.log('品阶与难度断言全部通过：' + passed + ' 项');
