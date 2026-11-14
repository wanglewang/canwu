'use strict';

// 品阶与难度体系常驻断言：零依赖，node tests/rank.test.js 直接跑。
//
// 一句话约定：品阶（天地玄黄）管收益，难度档（简单→绝境）跟熟练度，境界管衰减。
// 三条线互不牵扯 —— 任何一条被写回另一条身上，这里的断言都要炸。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const game = require('../utils/game.js');
const practice = require('../data/practice.js');
const skills = require('../data/skills.js');
const world = require('../data/world.js');

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
  return s;
}

// ---------------------------------------------------------------- 常量层

check('四品阶：天地玄黄，倍率与属性系数逐级递增', function () {
  assert.strictEqual(practice.TIERS.length, 4);
  assert.deepStrictEqual(practice.TIERS.map(function (t) { return t.name; }), ['黄', '玄', '地', '天']);
  assert.deepStrictEqual(practice.TIERS.map(function (t) { return t.reward; }), [1, 1.5, 2.2, 3.2]);
  for (let i = 1; i < practice.TIERS.length; i += 1) {
    assert.ok(practice.TIERS[i].attr > practice.TIERS[i - 1].attr, '属性系数未递增');
    assert.ok(practice.TIERS[i].needRealm >= practice.TIERS[i - 1].needRealm, '境界门槛倒挂');
    assert.ok(practice.TIERS[i].maxRealm >= practice.TIERS[i - 1].maxRealm, '可修上限倒挂');
  }
});

check('五难度档：门槛与倍率都单调递增', function () {
  assert.strictEqual(practice.DIFFICULTIES.length, 5);
  assert.deepStrictEqual(practice.DIFFICULTIES.map(function (d) { return d.name; }), ['简单', '普通', '困难', '极难', '绝境']);
  assert.deepStrictEqual(practice.DIFFICULTIES.map(function (d) { return d.need; }), [0, 400, 1000, 2500, 6000]);
  assert.deepStrictEqual(practice.DIFFICULTIES.map(function (d) { return d.mult; }), [1, 1.3, 1.7, 2.1, 2.6]);
  for (let i = 1; i < practice.DIFFICULTIES.length; i += 1) {
    assert.ok(practice.DIFFICULTIES[i].pace < practice.DIFFICULTIES[i - 1].pace, '高档节奏没有更紧');
    assert.ok(practice.DIFFICULTIES[i].goal > practice.DIFFICULTIES[i - 1].goal, '高档目标没有更高');
  }
});

check('熟练度六阶与难度档门槛对齐', function () {
  assert.strictEqual(world.TIERS.length, 6);
  for (let i = 1; i < world.TIERS.length; i += 1) {
    assert.ok(world.TIERS[i].threshold > world.TIERS[i - 1].threshold, '熟练度阈值未递增');
  }
  assert.strictEqual(world.TIERS[world.TIERS.length - 1].threshold, practice.DIFFICULTIES[4].need);
});

check('评级倍率按设计文档压低，S 不再一家独大', function () {
  assert.deepStrictEqual(world.GRADE_FACTOR, { S: 1.5, A: 1.2, B: 1.0, C: 0.6, F: 0 });
  assert.strictEqual(world.MAX_MULTIPLIER, 13);
  assert.strictEqual(world.REALM_DECAY, 0.3);
  assert.ok(world.GRADE_FACTOR.S < practice.DIFFICULTIES[4].mult, 'S 倍率不该盖过最高难度档');
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
  const samples = [[0, 0], [399, 0], [400, 1], [999, 1], [1000, 2], [2499, 2], [2500, 3], [5999, 3], [6000, 4]];
  for (const pair of samples) {
    assert.strictEqual(practice.diffIndexOf(pair[0]), pair[1], pair[0] + ' 解锁档位错误');
    assert.strictEqual(practice.bestDifficulty(pair[0]), practice.DIFFICULTIES[pair[1]].key);
  }
});

check('difficultyList 标出未解锁档与所需熟练度', function () {
  const list = practice.difficultyList(1000, 'hard');
  assert.strictEqual(list.length, 5);
  assert.strictEqual(list.filter(function (d) { return d.unlocked; }).length, 3);
  assert.strictEqual(list[2].current, true);
  for (let i = 3; i < list.length; i += 1) {
    assert.strictEqual(list[i].unlocked, false);
    assert.ok(list[i].lockedText.indexOf(String(list[i].need)) >= 0);
  }
});

// ---------------------------------------------------------------- 结算公式

check('品阶只改收益：同档同评级，黄 < 玄 < 地 < 天', function () {
  const cases = [
    { id: 'jian', realm: 0 },
    { id: 'jingxin', realm: 1 },
    { id: 'dan', realm: 2 },
    { id: 'duanyue', realm: 3 },
  ];
  const cores = [];
  for (const c of cases) {
    const s = freshState(c.id, 0, c.realm);
    const r = game.applyPractice(s, c.id, 'B', { difficulty: 'easy', score: 0 });
    assert.strictEqual(r.realmDecay, 1, c.id + ' 不应触发衰减');
    cores.push(r.coreRaw);
  }
  assert.deepStrictEqual(cores, [1, 1.5, 2.2, 3.2]);
});

check('难度档只改倍率：在各自门槛上同评级比较，档越高收益越大', function () {
  // 拿「刚好解锁这一档」的熟练度去比：这样每一局都是「本门最高档」，不吃低档折减，
  // 比的才是倍率本身。拿一个 6000 的存档去打五档，前四档都会被折半，比出来的是折减。
  const gains = [];
  for (const d of practice.DIFFICULTIES) {
    const s = freshState('jingxin', d.need, 1);
    const r = game.applyPractice(s, 'jingxin', 'B', { difficulty: d.key, score: 0 });
    assert.strictEqual(r.diffName, d.name);
    assert.strictEqual(r.realmDecay, 1);
    assert.strictEqual(r.diffBelowCap, false, d.name + ' 是最高已解锁档，不该折减');
    gains.push(r.gain);
  }
  for (let i = 1; i < gains.length; i += 1) {
    assert.ok(gains[i] > gains[i - 1], '第 ' + (i + 1) + ' 档收益没有更高');
  }
});

check('退回低档：熟练度折半、S 不计连晋，两者同一判定', function () {
  // 已被解锁的最高档是「困难」（1000），偏偏去玩简单档。
  const prof = 1200;
  assert.strictEqual(practice.bestDifficulty(prof), 'hard', '默认档不是最高已解锁档');
  assert.strictEqual(practice.belowCapOf(prof, 'easy'), true, '低档没被判成折减');
  assert.strictEqual(practice.belowCapOf(prof, 'hard'), false, '最高档被误判成折减');
  assert.strictEqual(practice.effectiveMultOf(prof, 'easy'),
    practice.DIFFICULTIES[0].mult * practice.DIFF_BELOW_CAP, '实得倍率没折半');

  const low = freshState('jingxin', prof, 1);
  const r = game.applyPractice(low, 'jingxin', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(r.diffBelowCap, true, '结算没标出折减');
  assert.strictEqual(r.diffMult, 0.5, '结算倍率没按折半报（应为 0.5）');
  assert.strictEqual(r.diffMultRaw, 1, '原始档位倍率丢了');
  assert.strictEqual(r.sStreak, 0, '折减档的 S 计进了连晋');
  assert.strictEqual(low.sStreak.jingxin, 0, '折减档的 S 写进了存档');

  // 同一存档在最高档拿 S，就该正常计数。
  const top = freshState('jingxin', prof, 1);
  const r2 = game.applyPractice(top, 'jingxin', 'S', { difficulty: 'hard', score: 0 });
  assert.strictEqual(r2.diffBelowCap, false, '最高档被误判成折减');
  assert.strictEqual(r2.sStreak, 1, '最高档的 S 没计连晋');

  // 界线要能一句话讲：折半之后，普通档打个 C 也比简单档 S 多。
  // 取 400（刚开普通档）来比：这时普通是最高档、不折减，简单已经折半，比的才是界线的位置。
  const lowS = freshState('jingxin', 400, 1);
  const easyS = game.applyPractice(lowS, 'jingxin', 'S', { difficulty: 'easy', score: 0 });
  const midC = freshState('jingxin', 400, 1);
  const normalC = game.applyPractice(midC, 'jingxin', 'C', { difficulty: 'normal', score: 0 });
  assert.ok(easyS.gain < normalC.gain,
    '折半后简单档 S（' + easyS.gain + '）仍不低于普通档 C（' + normalC.gain + '）');

  // 熟练度还没到 400 时，简单档就是最高档：不折减，新手不受罚。
  const rookie = freshState('jingxin', 120, 1);
  const rr = game.applyPractice(rookie, 'jingxin', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(rr.diffBelowCap, false, '新手在简单档也被折减了');
  assert.strictEqual(rr.sStreak, 1, '新手在简单档拿 S 不计连晋');
});

check('折减只看「是不是最高档」，不看落差：低两档也是 ×0.5，不叠加', function () {
  // 玩家问的那个场景：解锁普通后简单折半；继续解锁困难后，普通也要跟着折半。
  // 关键在于「凡是低于最高已解锁档的档位都折半」——不是只折最近那一档，
  // 也不是按落差层层相乘（×0.5 的 n 次方）。这两件事以前没有断言守着。
  const prof = 6000; // 最高已解锁档 = 绝境
  const expectBelow = [true, true, true, true, false];
  practice.DIFFICULTIES.forEach(function (d, i) {
    assert.strictEqual(practice.belowCapOf(prof, d.key), expectBelow[i],
      d.name + ' 的折减判定不对（最高档是绝境）');
  });

  const eff = practice.DIFFICULTIES.map(function (d) { return practice.effectiveMultOf(prof, d.key); });
  // 折的是「这一档自己的倍率 ×0.5」：普通是 1.30→0.65，不是拍平成 0.50。
  assert.ok(Math.abs(eff[0] - practice.DIFFICULTIES[0].mult * practice.DIFF_BELOW_CAP) < 1e-9,
    '退四档的简单档没停在 ×0.5（实得 ×' + eff[0].toFixed(2) + '），折减被按落差叠加了');
  // 折半之后低档之间仍严格有序，最高档不折：档位不能倒挂，也不能把最高档一起压了。
  for (let i = 1; i < eff.length; i += 1) {
    assert.ok(eff[i] > eff[i - 1], '折减后第 ' + (i + 1) + ' 档不高于第 ' + i + ' 档（倍率倒挂）');
  }

  // 连 S 走的是同一个判定：低两档、低三档的 S 同样不计数，不是只有「低一档」不计数。
  ['easy', 'normal', 'hard', 'expert'].forEach(function (key) {
    const i = practice.diffKeyIndex(key);
    const s = freshState('jingxin', prof, 1);
    const r = game.applyPractice(s, 'jingxin', 'S', { difficulty: key, score: 0 });
    assert.strictEqual(r.diffBelowCap, true, key + ' 没被判成折减');
    assert.strictEqual(r.diffMult, practice.DIFFICULTIES[i].mult * practice.DIFF_BELOW_CAP,
      key + ' 的实得倍率不是折半');
    assert.strictEqual(r.diffMultRaw, practice.DIFFICULTIES[i].mult, key + ' 丢了原始档位倍率');
    assert.strictEqual(r.sStreak, 0, key + ' 的 S 计进了连晋');
    assert.strictEqual(s.sStreak.jingxin || 0, 0, key + ' 的 S 写进了存档');
  });
});

check('走火：F 算一局，但零收益——熟练度、资源、加成都不给，连 S 断', function () {
  // F 有两种来历，这里测的是「玩到一半被判负」的那种：
  // 它是一局真实打完的结果，所以要进结算（报价、断连），但结论是这一局作废——
  // 不是「最低一档」，所以一分收益都没有。主动收功根本不调 applyPractice，不归这条管。
  const s = freshState('jingxin', 1200, 1);
  s.sStreak.jingxin = 2;
  const qiBefore = s.resources.qi;
  const stoneBefore = s.resources.stone;
  const profBefore = s.skills.jingxin.prof;
  const r = game.applyPractice(s, 'jingxin', 'F', { difficulty: 'hard', score: 0 });
  assert.strictEqual(r.gradeFactor, 0, '走火倍率不是 0');
  assert.strictEqual(r.wiped, true, '走火没被标记成整局作废');
  assert.strictEqual(r.gain, 0, '走火还给了熟练度');
  assert.strictEqual(s.skills.jingxin.prof, profBefore, '走火把熟练度写进存档了');
  assert.strictEqual(r.qi, 0, '走火还给了灵气');
  assert.strictEqual(r.stone, 0, '走火还给了灵石');
  assert.strictEqual(s.resources.qi, qiBefore, '走火把灵气写进存档了');
  assert.strictEqual(s.resources.stone, stoneBefore, '走火把灵石写进存档了');
  assert.strictEqual(s.buff.multiplier, 1, '走火还给了挂机加成');
  assert.strictEqual(r.sStreak, 0, '走火没有断连');
  assert.strictEqual(s.sStreak.jingxin, 0, '走火后存档里的连 S 没清');

  // 对照：同一门、同一档打出 S，熟练度与资源都得有——F 与 S 不是「差几倍」，是「有」和「没有」。
  const s2 = freshState('jingxin', 1200, 1);
  const rs = game.applyPractice(s2, 'jingxin', 'S', { difficulty: 'hard', score: 0 });
  assert.ok(rs.gain > 0, 'S 没有熟练度收益');
  assert.ok(rs.qi > 0 && rs.stone > 0, 'S 没有资源收益');

  // 走火不立纪录：没走完的这一局不该成为「本门最佳」。
  assert.strictEqual(s.records.jingxin, undefined, '走火被写成了本门纪录');
  // 而同一存档之后打出 S，纪录照常出现。
  const s3 = freshState('jingxin', 1200, 1);
  game.applyPractice(s3, 'jingxin', 'F', { difficulty: 'hard', score: 0 });
  game.applyPractice(s3, 'jingxin', 'S', { difficulty: 'hard', score: 640 });
  assert.strictEqual(s3.records.jingxin.score, 640, '走火之后的正常一局没立纪录');
});

check('默认难度跟熟练度走：门槛一到就默认最高档，不记忆手选', function () {
  const pairs = [[0, 'easy'], [399, 'easy'], [400, 'normal'], [999, 'normal'],
    [1000, 'hard'], [2500, 'expert'], [6000, 'desperate']];
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

check('封顶只防叠加失控：正常最高组合不被压，天阶三档收益仍递增', function () {
  const s = freshState('taixu', 6000, 3);
  s.realmIndex = 3;
  const r = game.applyPractice(s, 'taixu', 'S', { difficulty: 'desperate', score: 0 });
  assert.strictEqual(r.tierKey, 'tian');
  // 12.48 是正常参数下的天花板。封顶压到 8.0 时，天阶的困难 / 极难 / 绝境收益
  // 全部并列 8.0，最高两档就只剩挑战意义、没有收益意义——那是把难度档做废。
  assert.strictEqual(r.capped, false, '正常最高组合被总倍率封顶压住了');
  assert.ok(r.coreRaw <= world.MAX_MULTIPLIER, '封顶值低于正常最高组合');
  const got = [];
  for (const d of ['hard', 'expert', 'desperate']) {
    const st = freshState('taixu', 6000, 3);
    st.realmIndex = 3;
    got.push(game.applyPractice(st, 'taixu', 'S', { difficulty: d }).coreRaw);
  }
  assert.ok(got[1] > got[0] && got[2] > got[1],
    '天阶各难度档收益没有一档比一档高：' + got.join(' / '));
});

check('境界衰减：未到门槛与超过上限都只剩 30%', function () {
  // 黄阶（门槛炼气、上限筑基）：炼气正常，金丹衰减
  const low = freshState('jian', 0, 0);
  assert.strictEqual(game.applyPractice(low, 'jian', 'B', { difficulty: 'easy' }).realmDecay, 1);
  const old = freshState('jian', 0, 2);
  const r1 = game.applyPractice(old, 'jian', 'B', { difficulty: 'easy' });
  assert.strictEqual(r1.realmDecay, world.REALM_DECAY);
  assert.ok(r1.realmReason.indexOf('上限') >= 0);

  // 天阶（门槛元婴）：炼气修不动，元婴正常
  const early = freshState('duanyue', 0, 0);
  const r2 = game.applyPractice(early, 'duanyue', 'B', { difficulty: 'easy' });
  assert.strictEqual(r2.realmDecay, world.REALM_DECAY);
  assert.ok(r2.realmReason.indexOf('门槛') >= 0);
  const proper = freshState('duanyue', 0, 3);
  assert.strictEqual(game.applyPractice(proper, 'duanyue', 'B', { difficulty: 'easy' }).realmDecay, 1);
});

check('衰减后的收益仍大于 0，不会让功法突然作废', function () {
  // 境界衰减（×0.3）与走火（×0）是两件事：前者是「还能练、拿得少」，后者是「整局作废」。
  // 所以这条要用有评级的 B 档来测衰减，不能借 F——F 归零是设计，不是衰减打出来的。
  const old = freshState('jian', 0, 2);
  const r = game.applyPractice(old, 'jian', 'B', { difficulty: 'easy', score: 0 });
  assert.strictEqual(r.realmDecay, world.REALM_DECAY, '金丹期练黄阶没有衰减');
  assert.ok(r.gain >= 1, '境界衰减把收益打到 0，等于功法作废');
});

check('属性加成乘品阶系数：同段位下天阶高于黄阶', function () {
  const base = game.createNewState();
  const baseShen = game.computeAttributes(base).shen;
  const a = freshState('jian', 100, 0);
  const b = freshState('duanyue', 100, 3);
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
  // 规格按档递增的三门由各自的档位表管（lights / sudoku / klotski），见下面的专条断言。
  const tableGames = ['lights', 'sudoku', 'klotski'];
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
    assert.ok(item.rewardText.indexOf('×') >= 0);
    assert.ok(item.maxRealmName && item.needRealmName);
    assert.ok(item.diffName && item.diffText.indexOf('×') >= 0);
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

check('v3 存档升到 v5，熟练度与纪录原样保留', function () {
  const old = freshState('jian', 812, 0);
  old.version = 3;
  old.records = { jian: { score: 42, grade: 'A', at: 1 } };
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 5);
  assert.strictEqual(n.skills.jian.prof, 812);
  assert.strictEqual(n.records.jian.score, 42);
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
      assert.ok(h.source.cost.qi <= x.source.cost.qi, h.name + ' 卖得比玄阶 ' + x.name + ' 还贵');
      assert.ok(h.source.cost.stone <= x.source.cost.stone, h.name + ' 灵石比玄阶还贵');
    }
  }
});

check('三连 S 目标常量与段位门槛对齐', function () {
  assert.strictEqual(game.S_STREAK_GOAL, 3);
  assert.strictEqual(game.createNewState().version, 5);
});

console.log('品阶与难度断言全部通过：' + passed + ' 项');
