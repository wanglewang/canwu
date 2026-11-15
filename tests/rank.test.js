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
  assert.strictEqual(wuxing.tier, 'xuan', '五行相生与点灯破阵诀要排成玄 → 地，撞阶会让谱系丢门');
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

check('熟练度基础值不吃关卡：每一关都是 15 点，关卡只抬耗气', function () {
  // 在本门当前关打 B：不管在哪一章，都是基础值 15 点。关卡只改参数与耗气，不改公式。
  const costs = [];
  practice.DIFFICULTIES.forEach(function (d) {
    const s = freshState('jingxin', d.need, 1);
    const lv = L.levelFromProf(d.need);
    const r = game.applyPractice(s, 'jingxin', 'B', { level: lv, score: 0 });
    assert.strictEqual(r.levelBelowCap, false, d.name + ' 的首关被当成回关了');
    assert.strictEqual(r.gain, world.PROF_BASE.B, d.name + ' 的熟练度不是基础值');
    costs.push(r.qiCost);
  });
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1], '第 ' + (i + 1) + ' 章首关的耗气没有更高：' + costs.join(' / '));
  }
});

check('回关折减：按 本关 ÷ 当前关 连续折，不叠连 S，层数原样保留', function () {
  // 熟练度 300 → 第 41 关（第二章首关）。回打第 41 关全额，回打第 21 关是 ×0.512。
  const prof = 300;
  const cur = L.levelFromProf(prof);
  assert.strictEqual(cur, 41, '熟练度 300 该落在第 41 关');
  assert.strictEqual(practice.levelFactor(41, 41), 1, '当前关不是 ×1');
  assert.strictEqual(practice.levelFactor(21, 41), 21 / 41, '回关系数不是 本关 ÷ 当前关');
  assert.strictEqual(practice.levelFactor(99, 41), 1, '回关系数不该超过 1');

  const top = freshState('jingxin', prof, 1);
  const rt = game.applyPractice(top, 'jingxin', 'B', { level: cur, score: 0 });
  assert.strictEqual(rt.gain, world.PROF_BASE.B, '当前关的 B 不是全额');
  assert.strictEqual(rt.levelBelowCap, false);

  const low = freshState('jingxin', prof, 1);
  const rl = game.applyPractice(low, 'jingxin', 'S', { level: 21, score: 0 });
  assert.strictEqual(rl.levelBelowCap, true, '回关没被标成折减');
  assert.strictEqual(rl.levelGap, 20, '没报出退了几关');
  assert.strictEqual(rl.gain, practice.profByLevel(world.PROF_BASE.S, 21, cur),
    '回关熟练度没按 本关 ÷ 当前关 折');
  assert.strictEqual(rl.gain, 17, 'S 在 21/41 处应是 34 × 0.512 → 17');
  assert.strictEqual(rl.comboActive, false, '回关 S 走了连击曲线');
  assert.strictEqual(rl.comboNow, 0, '回关 S 叠了层');
  assert.strictEqual(low.sCombo.jingxin, 0, '回关 S 写进了连击存档');

  // 回关不砍已有层数：连两局 S 后回关打一局 B，层数原样保留；回当前关照接第 3 连。
  const kept = freshState('jingxin', prof, 1);
  // 每一局都按「打完上一局之后的当前关」出手，否则第二局就成了回关。
  game.applyPractice(kept, 'jingxin', 'S', { level: L.levelFromProf(kept.skills.jingxin.prof), score: 0 });
  game.applyPractice(kept, 'jingxin', 'S', { level: L.levelFromProf(kept.skills.jingxin.prof), score: 0 });
  assert.strictEqual(kept.sCombo.jingxin, 2);
  const back = game.applyPractice(kept, 'jingxin', 'B', { level: 21, score: 0 });
  assert.strictEqual(back.comboNow, 2, '回关把连 S 清了');
  assert.strictEqual(back.levelBelowCap, true);
  const nowLv = L.levelFromProf(kept.skills.jingxin.prof);
  const third = game.applyPractice(kept, 'jingxin', 'S', { level: nowLv, score: 0 });
  assert.strictEqual(third.comboNow, 3);
  assert.strictEqual(third.gain, 77, '回关练手后第 3 连没按 34 × 1.5² 接上');
});

check('回关折减连续无断崖：越退越薄，第 1 关几乎归零', function () {
  // 这一条是「刷最低关」这条老最优解的封条：第 1 关在熟练度 24000 时只值 0.6%。
  const cur = L.levelFromProf(24000);
  assert.strictEqual(cur, 161, '熟练度 24000 该落在第 161 关');
  const f1 = practice.levelFactor(1, cur);
  assert.ok(f1 < 0.01, '第 1 关在当前第 161 关时还值 ' + f1 + '，刷最低关仍然划算');
  assert.strictEqual(practice.profByLevel(world.PROF_BASE.S, 1, cur), 0, '第 1 关还给了熟练度');

  // 连续：退一关只差一点点，不存在「退一档砍一半」的台阶。
  let prev = 0;
  for (let lv = 1; lv <= cur; lv += 1) {
    const fv = practice.levelFactor(lv, cur);
    assert.ok(fv >= prev, '回关系数出现倒挂：第 ' + lv + ' 关');
    prev = fv;
  }
  assert.ok(practice.levelFactor(cur - 1, cur) > 0.99, '退一关就掉了超过 1%');

  // 同一章内也堵死：第 121 关（第四章首关）在第 161 关时只值 ×0.75，S 是 26 点不是 34 点。
  assert.strictEqual(practice.levelFactor(121, cur), 121 / 161);
  assert.strictEqual(practice.profByLevel(world.PROF_BASE.S, 121, cur), 26,
    '回关到第四章首关仍拿满额，章内折减是空的');

  // 走火仍是 0 点，且不分关一律断连。
  const s = freshState('jingxin', 24000, 1);
  s.sCombo.jingxin = 7;
  const r = game.applyPractice(s, 'jingxin', 'F', { level: 1, score: 0 });
  assert.strictEqual(r.gain, 0, '走火还给了熟练度');
  assert.strictEqual(r.comboNow, 0, '回关走火没断连');
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

check('默认难度跟熟练度走：门槛一到就默认最高档', function () {
  const pairs = [[0, 'easy'], [299, 'easy'], [300, 'normal'], [1499, 'normal'],
    [1500, 'hard'], [6000, 'expert'], [24000, 'desperate']];
  for (const pair of pairs) {
    assert.strictEqual(practice.bestDifficulty(pair[0]), pair[1],
      pair[0] + ' 熟练度的默认档不是 ' + pair[1]);
  }
});

// ---------------------------------------------------------------- 关卡
check('200 关：五章各 40 关，章 = 原难度档', function () {
  assert.strictEqual(L.LEVEL_MAX, 200);
  assert.strictEqual(L.CHAPTERS.length, 5, '章节不是五章');
  let total = 0;
  for (let i = 0; i < L.CHAPTERS.length; i += 1) {
    const c = L.CHAPTERS[i];
    total += c.to - c.from + 1;
    assert.strictEqual(c.to - c.from + 1, 40, '第 ' + (i + 1) + ' 章不是 40 关');
    assert.strictEqual(c.key, practice.DIFFICULTIES[i].key, '第 ' + (i + 1) + ' 章的难度键与档位表分叉');
    if (i > 0) assert.strictEqual(c.from, L.CHAPTERS[i - 1].to + 1, '章节之间有缝或重叠');
  }
  assert.strictEqual(total, 200, '五章加起来不是 200 关');
  assert.strictEqual(L.chapterOf(1), 0);
  assert.strictEqual(L.chapterOf(40), 0);
  assert.strictEqual(L.chapterOf(41), 1);
  assert.strictEqual(L.chapterOf(200), 4);
});

check('关卡由熟练度算出：章内线性、只增不减，六个锚与段位表同源', function () {
  for (let i = 0; i < L.LEVEL_PROF_STEPS.length; i += 1) {
    assert.strictEqual(L.LEVEL_PROF_STEPS[i], i < practice.DIFFICULTIES.length
      ? practice.DIFFICULTIES[i].need : world.PROF_MAX,
      '第 ' + i + ' 个熟练度锚与档位表 / 上限分叉');
  }
  assert.strictEqual(L.levelFromProf(0), 1);
  assert.strictEqual(L.levelFromProf(299), 40);
  assert.strictEqual(L.levelFromProf(300), 41);
  assert.strictEqual(L.levelFromProf(1500), 81);
  assert.strictEqual(L.levelFromProf(6000), 121);
  assert.strictEqual(L.levelFromProf(24000), 161);
  assert.strictEqual(L.levelFromProf(99999), 200);
  // 单调：熟练度涨，关号只能涨。这是「关不掉」的全部依据。
  let prev = 0;
  for (let p = 0; p <= 99999; p += 37) {
    const lv = L.levelFromProf(p);
    assert.ok(lv >= prev, '熟练度 ' + p + ' 的关号 ' + lv + ' 比前一个小：' + prev);
    prev = lv;
  }
});

// 台阶数的下限按门给：这一门难度是「盘面规格 + 最优步数区间 + 余量」三段离散值，
// 200 关里真能变的地方本来就少。阵灯推演原来凑到 30 级以上，靠的是把 `minSteps`
// 也塞进收紧表——可那个数乘 0.7 是「章末要求更短的解」，方向是往简单走的，
// 台阶数好看、难度反而倒退。把假台阶去掉之后还剩 10 级，这里据实给 10：
// 「做不到每段都动就据实写沿用上一段」，别为了让数字好看去动一个方向相反的旋钮。
const STEP_FLOOR = { lights: 10 };

check('一关一段：章内只往难走，每门规格台阶不少于本条门的下限', function () {
  // 「规格台阶」= 相邻两关参数真的不同。规格类玩法（阵灯 3×3→5×5、摘魁 8→16 批）
  // 的难度是盘面规格，规格是离散的，量化到 200 关刻度上本来就只有 10–40 级台阶。
  // 这条断言守两件事：台阶数不许再掉、方向只许变难。
  for (const m of practice.PRACTICE_METHODS) {
    let changed = 0;
    let prev = null;
    for (let lv = 1; lv <= 200; lv += 1) {
      const p = practice.buildParamsAt(m, lv);
      if (prev) {
        const keys = Object.keys(p).filter(function (k) { return k !== 'level' && k !== 'stage' && p[k] !== prev[k]; });
        if (keys.length) changed += 1;
        for (const k of ['duration', 'timeLimit', 'flashMs', 'gapMs', 'flipMs', 'dropMs', 'msPerNote', 'capFactor', 'budgetSlack']) {
          if (typeof p[k] !== 'number' || typeof prev[k] !== 'number') continue;
          // 章界「回弹」是换盘面的代价（九宫 4×4→6×6 要多给读盘时间），只在本章内要求单调。
          if (L.chapterOf(lv) !== L.chapterOf(lv - 1)) continue;
          assert.ok(p[k] <= prev[k], m.id + ' 第 ' + lv + ' 关的 ' + k + ' 反而放宽了');
        }
      }
      prev = p;
    }
    // 阵灯推演的最优步数只许换章时变：章内把它收紧 = 要求更短的解 = 更简单。
    if (m.game === 'lights') {
      let base = null;
      for (let lv = 1; lv <= 200; lv += 1) {
        const p = practice.buildParamsAt(m, lv);
        if (lv === 1 || L.chapterOf(lv) !== L.chapterOf(lv - 1)) { base = p; continue; }
        assert.ok(p.minSteps === base.minSteps && p.hiSteps === base.hiSteps,
          '第 ' + lv + ' 关把最优步数区间改了：章内动这个数就是往简单走');
      }
    }
    const floor = STEP_FLOOR[m.game] || 30;
    assert.ok(changed >= floor, m.id + ' 只有 ' + changed + ' 级规格台阶，低于 ' + floor + ' 级的下限');
  }
});

check('换章要报出盘面规格，不许把结构变化藏在毫秒后面', function () {
  // 真机反馈「玩了一百多关没发现任何变化」：换章是 200 关里唯一一次玩家看得见的
  // 盘面变化，旧版 levelDelta 却按 PACE_KEYS 顺序只报两条，结果第一章里报的全是
  // 「亮起时长 0.66 → 0.65 秒」，换章那次的「气窍 5 → 6 对」被挤掉，五门直接报「同」。
  const struct = practice.LEVEL_STRUCT_KEYS;
  for (const m of practice.PRACTICE_METHODS) {
    for (const lv of [41, 81, 121, 161]) {
      const d = practice.levelDelta(m, lv);
      const now = practice.buildParamsAt(m, lv);
      const prev = practice.buildParamsAt(m, lv - 1);
      assert.ok(d.length, m.id + ' 第 ' + lv + ' 关换章没报任何变化');
      assert.ok(d[0].chapter === true, m.id + ' 第 ' + lv + ' 关没打换章标记');
      const changed = struct.filter(function (k) {
        return typeof now[k] === 'number' && typeof prev[k] === 'number' && now[k] !== prev[k];
      });
      for (const x of d.slice(1)) {
        assert.ok(x.key === 'sameBoard' || x.key === 'cols' || x.key === 'perPair'
          || struct.indexOf(x.key) >= 0,
        m.id + ' 第 ' + lv + ' 关把「' + x.key + '」当换章变化报了出来（那是毫秒/时辰，不是盘面）');
      }
      if (changed.length) {
        assert.ok(!d.some(function (x) { return x.key === 'sameBoard'; }),
          m.id + ' 第 ' + lv + ' 关明明换了盘，却报「沿用同一副盘」');
        assert.ok(d.length > 1, m.id + ' 第 ' + lv + ' 关有结构变化却一条都没报');
      }
      // 关号一局能跳四五关，章首关常被整个跨过去：第 46 关也得拿到本章规格。
      const label = L.chapterRange(L.chapterOf(lv)).label;
      for (const later of [lv + 3, lv + 9]) {
        if (L.chapterOf(later) !== L.chapterOf(lv)) continue;
        assert.ok(practice.chapterSpec(m, later).indexOf(label) >= 0,
          m.id + ' 第 ' + later + ' 关取不到本章规格（跳关把换章提示跨过去了）');
      }
    }
  }
});

check('章内结构副轴：数距沿全书只紧不松，换章不回卷', function () {
  // D7 待拍板方向之一：不靠收时间、不缩盘面，给离散门加一条盘面看得见的结构量。
  // 择大辨微的 nearGap 是「一批数里最大与次大差几」，按全书关号连续收，
  // 按章回卷会让第 41 关比第 40 关更好辨——正是 D9 里那条章末倒挂。
  const m = practice.getMethod('zeda');
  let prev = null;
  for (let lv = 1; lv <= 200; lv += 1) {
    const q = practice.buildParamsAt(m, lv);
    assert.ok(typeof q.nearGap === 'number', '第 ' + lv + ' 关没给数距');
    assert.ok(q.nearGap >= 2, '第 ' + lv + ' 关数距压破 2：C 带会被吃掉');
    if (prev !== null) assert.ok(q.nearGap <= prev, '第 ' + lv + ' 关数距反而放宽了');
    prev = q.nearGap;
  }
  assert.ok(practice.buildParamsAt(m, 1).nearGap > practice.buildParamsAt(m, 200).nearGap,
    '首尾两关数距一样，副轴等于没加');
});

check('关卡由熟练度决定进度：越权回落、走火不倒退', function () {
  const s = game.createNewState();
  assert.strictEqual(L.levelFromProf(s.skills.jian.prof), 1);
  // 熟练度 0 时只有第 1 关：传第 40 关一律回落到第 1 关。
  const r1 = game.applyPractice(s, 'jian', 'B', { level: 40, score: 10 });
  assert.strictEqual(r1.levelFellBack, true, '越权挑关没被回落');
  assert.strictEqual(r1.curLevel, 1);
  assert.strictEqual(r1.level, 1);
  // 打一局 B：熟练度 15 → 第 3 关（15/300 铺满 39 关台阶）。
  assert.strictEqual(s.skills.jian.prof, 15);
  assert.strictEqual(L.levelFromProf(15), 3);
  const r2 = game.applyPractice(s, 'jian', 'B', { level: 3, score: 10 });
  assert.strictEqual(r2.levelFellBack, false);
  assert.strictEqual(r2.level, 3);
  // 走火：熟练度不涨，关号不动。
  const before = s.skills.jian.prof;
  const r3 = game.applyPractice(s, 'jian', 'F', { level: 3, score: 0 });
  assert.strictEqual(r3.wiped, true);
  assert.strictEqual(s.skills.jian.prof, before, '走火也涨了熟练度');
  assert.strictEqual(L.levelFromProf(s.skills.jian.prof), L.levelFromProf(before), '走火把关号推上去了');
  // 老存档里还带着 levelBest，读档时整条忽略、不报错，也不会再被当成进度。
  const loaded = game.normalizeState({ skills: s.skills, worldId: s.worldId, levelBest: { jian: 999 } });
  assert.ok(!('levelBest' in loaded), 'levelBest 该已退役，却还在存档结构里');
  assert.strictEqual(L.levelFromProf(loaded.skills.jian.prof), L.levelFromProf(s.skills.jian.prof),
    '关号仍该由熟练度算，不能被老字段带偏');
});

check('关卡越界夹回、章末取本章末关，段号一关一段', function () {
  assert.strictEqual(L.clampLevel(0), 1);
  assert.strictEqual(L.clampLevel(-5), 1);
  assert.strictEqual(L.clampLevel(5000), 200);
  assert.strictEqual(L.maxLevelOf(0), 40);
  assert.strictEqual(L.maxLevelOf(4), 200);
  // 段号：一段一关，章内第 1 关是第 0 段、第 40 关是第 39 段。
  assert.strictEqual(L.stageOf(1), 0);
  assert.strictEqual(L.stageOf(5), 4);
  assert.strictEqual(L.stageOf(40), 39);
  assert.strictEqual(L.stageOf(41), 0);
  assert.strictEqual(L.stageOf(200), 39);
});

check('滑块让路：预算系数随档收紧，但永不压到 C 线以下', function () {
  // 这一门的两条轴是「最优步数」与「预算系数」。
  //
  // 以前预算系数固定 2.4，档越高最优步数越长、预算也跟着变宽——「越难容错越大」，
  // 方向是反的。现在系数随档收紧，但有一条硬约束：不能压到 2 以下。
  //
  // C 线是「超过最优两倍才脱身」。预算若小于两倍最优，玩家还没走到两倍就先判
  // 「困住了」——C 这一档永远拿不到，评级表里那行评语等于删掉。那不是变难，是断档。
  const DIFFS = ['easy', 'normal', 'hard', 'expert', 'desperate'];
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

  // 章内也要收：一章 40 关里，预算只许紧不许松。
  const m = practice.getMethod('rongdao');
  let last = null;
  for (let lv = 401; lv <= 600; lv += 5) {
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
  assert.strictEqual(r.diffKey, 'easy');
  assert.strictEqual(r.level, 1);
});

check('耗气叠乘有底：天阶绝境最贵，但也压不穿最低 1 点', function () {
  const economy = require('../data/economy.js');
  const s = freshState('taixu', 24000, 3);
  s.realmIndex = 3;
  const r = game.applyPractice(s, 'taixu', 'S', { difficulty: 'desperate', score: 0 });
  assert.strictEqual(r.tierKey, 'tian');
  assert.ok(r.qiCost >= economy.QI_COST_MIN, '耗气低于绝对下限');
  const got = [];
  // 三档各取本章首关：关号决定档位，关越后档越贵。
  for (const lv of [81, 121, 161]) {
    const st = freshState('taixu', 24000, 3);
    st.realmIndex = 3;
    got.push(game.applyPractice(st, 'taixu', 'S', { level: lv }).qiCost);
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
  // 规格按档递增的几门由各自的档位表管（lights / sudoku / klotski / click / mines / link），
  // 见下面的专条断言。它们的盘面「该变」，所以不在这条里被判。
  // link 的 6×4 → 8×4 是 LINK_LEVELS 显式表：连连看加列买的是搜索空间，
  // 与「缩场地把手感挤成手速」不是一回事。
  const tableGames = ['lights', 'sudoku', 'klotski', 'click', 'mines', 'link'];
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

check('顺序点格：五档两两不同，同盘面的那两档必须差一条规则', function () {
  // 旧表是 4/5/6/6/6：后三档同一个 6×6，档与档只差 1–3 秒 S 线。
  // 而同一尺寸换个随机布局，成绩本来就波动 3–5 秒——档差被方差吃掉，
  // 三档在体感上是同一局，评级就变成「结算时乘个数」。
  // 所以判据不是「参数不同」（罚时也不同，照样过），而是「同盘面就必须差一条规则」。
  const schulte = require('../minigames/schulte.js');
  const method = practice.getMethod('shumu');
  const keys = ['easy', 'normal', 'hard', 'expert', 'desperate'];
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

check('换承重轴的三门：变的是复杂度与盘面，不是时间', function () {
  // 起因：五档时间参数走同一套 pace / TIME_LEVELS，跨度天然只有 1.7–2.3 倍，
  // 而且反应速度练不出来——把难度压在「快」上，玩家只会更焦虑。
  // 这三门把承重交给盘面、刀路、键位与禁制，时间只负责让节奏别拖。
  let prevGrid = 0;
  let prevLen = -1;
  for (const d of practice.DIFFICULTIES) {
    const lv = practice.CLICK_LEVELS[d.depth];
    assert.ok(lv.grid >= prevGrid, d.name + ' 开锋斩桩诀盘面反而变小');
    assert.strictEqual(lv.cols * lv.cols, lv.grid, d.name + ' 开锋斩桩诀的 grid 与 cols 对不上');
    assert.ok(lv.lenStep >= prevLen, d.name + ' 开锋斩桩诀刀路变短');
    prevGrid = lv.grid;
    prevLen = lv.lenStep;
  }
  const c0 = practice.CLICK_LEVELS[0];
  const c4 = practice.CLICK_LEVELS[4];
  assert.ok(c4.grid / c0.grid >= 2.5,
    '开锋斩桩诀盘面跨度只有 ' + (c4.grid / c0.grid).toFixed(2) + ' 倍，承重轴没立起来');
  assert.ok((3 + c4.lenStep) / (3 + c0.lenStep) >= 2.5,
    '开锋斩桩诀刀路跨度只有 ' + ((3 + c4.lenStep) / (3 + c0.lenStep)).toFixed(2) + ' 倍');
  // 简单档的刀路要短到「一眼扫得完」：3 桩是 3×3 小盘上的直线，读完不用二次思考。
  assert.strictEqual(3 + c0.lenStep, 3, '开锋斩桩诀简单档刀路不是最短的 3 桩');

  let prevCells = 0;
  let prevMines = 0;
  for (const d of practice.DIFFICULTIES) {
    const lv = practice.MINES_LEVELS[d.depth];
    const cells = lv.cols * lv.rows;
    // 前两档同为 6×6，靠禁制数（5→6）区分；盘面只许变大，不许缩回去。
    assert.ok(cells >= prevCells, d.name + ' 循数勘禁诀盘面反而变小');
    assert.ok(lv.mines > prevMines, d.name + ' 循数勘禁诀禁制数没有增加');
    const density = lv.mines / cells;
    // 密度必须稳在一个区间里：密度太低是空盘、太高是无处下脚，
    // 两种都不叫「变难」，叫「换了一盘棋」。
    assert.ok(density > 0.12 && density < 0.20,
      d.name + ' 循数勘禁诀禁制密度 ' + (density * 100).toFixed(1) + '% 超出 12–20%');
    prevCells = cells;
    prevMines = lv.mines;
  }
  // 五档至少四种盘面规格，否则「盘面变难」只是名义上的。
  const mineSizes = {};
  for (const lv of practice.MINES_LEVELS) mineSizes[lv.cols] = true;
  assert.ok(Object.keys(mineSizes).length >= 4,
    '循数勘禁诀盘面只有 ' + Object.keys(mineSizes).length + ' 种规格，撑不起五档阶梯');
  const m0 = practice.MINES_LEVELS[0];
  const m4 = practice.MINES_LEVELS[4];
  assert.ok((m4.cols * m4.rows) / (m0.cols * m0.rows) >= 2.2,
    '循数勘禁诀盘面跨度只有 ' + ((m4.cols * m4.rows) / (m0.cols * m0.rows)).toFixed(2) + ' 倍');

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

check('阵灯推演：两条轴递进，相邻两档不会两条轴都一样，余量压不破 B 档', function () {
  let prev = null;
  for (const d of practice.DIFFICULTIES) {
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
  const p = practice.buildParams(practice.getMethod('arrayEye'), 'desperate');
  assert.deepStrictEqual([p.size, p.minSteps, p.hiSteps, p.budgetSlack],
    [practice.LIGHTS_LEVELS[4].size, practice.LIGHTS_LEVELS[4].min,
      practice.LIGHTS_LEVELS[4].hi, practice.LIGHTS_LEVELS[4].slack],
    '绝境档没拿到 5×5、最优区间与余量');
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
  // 这一版先不做剑法：初始功法改刀法后，剑法族只余天阶的剑法·截锋断岳诀。
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

check('九套经典 + 循数勘禁诀默认已习得，藏经阁只留非经典', function () {
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
  assert.ok(shop.length >= 2, '藏经阁空了：非经典的功课至少要留两门');
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
      return (index.MODULES[m.game].lines(p, practice.difficultyOf(keys[i]).gear).items || []).join('|');
    })).size;
    const boardChanged = vary.some(function (k) { return /size|holes|minSteps|hiSteps|budgetSlack|level/.test(k); });
    assert.ok(variants > 1 || boardChanged,
      m.id + ' 的说明页五档写同一行，玩家没法对照');
  }
});

check('灵纹连线：五档换盘换纹种，每对预算只减不增，准备页与局内同一份时辰', function () {
  const m = practice.getMethod('linkpair');
  const link = require('../minigames/link.js');
  const keys = ['easy', 'normal', 'hard', 'expert', 'desperate'];
  const ps = keys.map(function (k) { return practice.buildParams(m, k); });
  // 档差的判据不是「秒表差几秒」，是这一档换了哪种盘、纹种多了几种。
  const specs = ps.map(function (p) { return p.cols + '×' + p.rows + '/' + p.kinds + ' 种'; });
  assert.ok(new Set(specs).size >= 4, '五档盘面或纹种没换够：' + specs.join(' '));
  assert.ok(ps[4].cols > ps[0].cols, '绝境档没加列：五档又是同一张 6×4');
  assert.ok(ps[2].kinds > ps[0].kinds, '困难档没加纹种');
  for (let i = 1; i < ps.length; i += 1) {
    const before = ps[i - 1].duration / (ps[i - 1].cols * ps[i - 1].rows / 2);
    const after = ps[i].duration / (ps[i].cols * ps[i].rows / 2);
    assert.ok(after < before, keys[i] + ' 的每对预算反而宽了（' + before + ' → ' + after + '）');
  }
  // 时辰由 linkDurationAt(章首关号) 现算；准备页 brief 里的息数必须就是局内那个数，
  // 否则「每对 5.50 息」与倒计时会是两张嘴。
  for (let i = 0; i < keys.length; i += 1) {
    assert.strictEqual(ps[i].duration, practice.linkDurationAt(L.chapterRange(i).from),
      keys[i] + ' 的时辰不是按关号现算的');
    const brief = practice.diffDetail(m, keys[i]).brief;
    assert.ok(brief.indexOf(ps[i].duration + ' 息') >= 0, keys[i] + ' 准备页写的时辰与局内分叉了');
    assert.ok(/每对 /.test(brief), keys[i] + ' 准备页没写「一对平均给几息」');
    const g = link.gradeLefts(ps[i].duration);
    assert.ok(g.s > g.a && g.a > g.b && g.b > 0, keys[i] + ' 的评级线挤在一起，C 带没了');
    assert.ok(link.lines(ps[i]).fail, keys[i] + ' 缺失败线：C 与 F 得是两个结论');
  }
  // 200 关：每对预算只减不增；界面报得出的关数必须等于参数真变的关数
  //（旧版靠 flashMs 报「199 关真的变了」，其中一百多关只是提示短了 10ms）。
  let changed = 0;
  let reported = 0;
  let prev = practice.buildParamsAt(m, 1);
  let prevPP = prev.duration / (prev.cols * prev.rows / 2);
  for (let lv = 2; lv <= 200; lv += 1) {
    const q = practice.buildParamsAt(m, lv);
    const pp = q.duration / (q.cols * q.rows / 2);
    assert.ok(pp <= prevPP + 1e-9, '第 ' + lv + ' 关每对预算往松走：章界倒挂了');
    if (q.duration !== prev.duration || q.cols !== prev.cols || q.rows !== prev.rows
      || q.kinds !== prev.kinds) changed += 1;
    const ds = practice.levelDelta(m, lv);
    if (ds.length) reported += 1;
    assert.ok(ds.every(function (x) { return !/flashMs|hintMs|亮起时长/.test(x.text); }),
      '第 ' + lv + ' 关又报毫秒假变化');
    prev = q;
    prevPP = pp;
  }
  assert.strictEqual(changed, reported, '逐关真变 ' + changed + ' 关、界面可报 ' + reported + ' 关，两者对不上');
  assert.ok(changed >= 30, '规格台阶掉到 ' + changed + ' 级');
  assert.strictEqual(m.tip, practice.tipFor(m, 'easy'), '功法表的兜底代价句与简单档分叉了');
  assert.ok(!/flashMs/.test(JSON.stringify(m.params)), '种子参数里还有 flashMs');
  assert.strictEqual(typeof m.params.hintMs, 'number', 'hintMs 没有生成端');
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

// ---------------------------------------------------------------- 练功 → 战力 → 破境
//
// 这一段的由来：玩家在功法卡上看到「体魄 +0.8」，破境门槛读的是「战力 170」，
// 中间那次换算从来没人算给他看。于是「练这门有什么用」只能猜，十九门就成了
// 十九个互不相干的小游戏。这两个函数就是那座桥，所以它们必须与重算同源。

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
  assert.strictEqual(game.skillPowerGain(freshState(), 'duanyue'), 0, '未习得的功法给了战力增量');
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


check('本场运功：十九门各炼成一式，招式名两字且首字互不复用', function () {
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
  const src = fs.readFileSync(path.join(__dirname, '../utils/game.js'), 'utf8');
  // 直调 rollBattle 只有 rollWithMoves 一处：多一处就是「有一路没走运功」。
  const direct = src.match(/rollBattle\(/g) || [];
  assert.strictEqual(direct.length, 2, 'rollBattle 出现了 ' + direct.length + ' 次（定义 + 唯一调用点各一）');
  assert.ok(/function rollWithMoves\(/.test(src), '没有 rollWithMoves');
  // 押上运功之后战力必须真的变：只改展示不改算，等于没做。
  const s = freshState();
  s.skills.duanyue.unlocked = true;
  s.skills.duanyue.prof = world.PROF_MAX;
  const bare = game.computePower(s);
  const mv = game.battleMoves(s, ['duanyue']);
  assert.ok(mv.powerBonus > 0);
  assert.ok(Math.round(bare * (1 + mv.powerBonus)) > bare, '运功没有抬高出战战力');
});

console.log('品阶与难度断言全部通过：' + passed + ' 项');
