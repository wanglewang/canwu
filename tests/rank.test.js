'use strict';

// 品阶与难度体系常驻断言：零依赖，node tests/rank.test.js 直接跑。
//
// 一句话约定：品阶（天地玄黄）管收益，难度档（简单→绝境）跟熟练度，境界管衰减。
// 三条线互不牵扯 —— 任何一条被写回另一条身上，这里的断言都要炸。

const assert = require('assert');
const game = require('../utils/game.js');
const practice = require('../data/practice.js');
const skills = require('../data/skills.js');
const world = require('../data/world.js');

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
  assert.deepStrictEqual(world.GRADE_FACTOR, { S: 1.5, A: 1.2, B: 1.0, C: 0.6, F: 0.2 });
  assert.strictEqual(world.MAX_MULTIPLIER, 8);
  assert.strictEqual(world.REALM_DECAY, 0.3);
  assert.ok(world.GRADE_FACTOR.S < practice.DIFFICULTIES[4].mult, 'S 倍率不该盖过最高难度档');
});

check('数据层：十三门功法、天地玄黄四阶都有人、分类合法', function () {
  assert.strictEqual(skills.SKILLS.length, 13);
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
  assert.strictEqual(zhen.tier, 'di', '阵灯推演是十门里最费脑的一门，不该留在低阶');
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

check('难度档只改倍率：同一门功法档越高收益越大', function () {
  const gains = [];
  for (const d of practice.DIFFICULTIES) {
    const s = freshState('jingxin', 6000, 1);
    const r = game.applyPractice(s, 'jingxin', 'B', { difficulty: d.key, score: 0 });
    assert.strictEqual(r.diffName, d.name);
    assert.strictEqual(r.realmDecay, 1);
    gains.push(r.gain);
  }
  for (let i = 1; i < gains.length; i += 1) {
    assert.ok(gains[i] > gains[i - 1], '第 ' + (i + 1) + ' 档收益没有更高');
  }
});

check('越权选高档自动回落到已解锁的最高档', function () {
  const s = freshState('jian', 0, 0);
  const r = game.applyPractice(s, 'jian', 'B', { difficulty: 'desperate', score: 0 });
  assert.strictEqual(r.diffFellBack, true);
  assert.strictEqual(r.diffKey, 'easy');
  assert.strictEqual(r.diffMaxName, '简单');
});

check('总倍率封顶：天阶 + 绝境 + S 被压在 8 倍', function () {
  const s = freshState('taixu', 6000, 3);
  s.realmIndex = 3;
  const r = game.applyPractice(s, 'taixu', 'S', { difficulty: 'desperate', score: 0 });
  assert.strictEqual(r.tierKey, 'tian');
  assert.strictEqual(r.capped, true);
  assert.strictEqual(r.coreMult, world.MAX_MULTIPLIER);
  assert.ok(r.coreRaw > world.MAX_MULTIPLIER);
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
  const old = freshState('jian', 0, 2);
  const r = game.applyPractice(old, 'jian', 'F', { difficulty: 'easy', score: 0 });
  assert.ok(r.gain >= 1);
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
  for (const m of practice.PRACTICE_METHODS) {
    // 阵灯推演的规格按档递增（3×3 → 4×4 → 5×5），由 LIGHTS_LEVELS 管，见下一条断言。
    if (m.game === 'lights') continue;
    const easy = practice.buildParams(m, 'easy');
    const hard = practice.buildParams(m, 'desperate');
    let changed = false;
    for (const key of Object.keys(m.params)) {
      if (['grid', 'cols', 'rows', 'size'].indexOf(key) >= 0) {
        assert.strictEqual(hard[key], m.params[key], m.id + ' 盘面尺寸被缩放');
      } else if (easy[key] !== hard[key]) changed = true;
    }
    assert.ok(changed, m.id + ' 各难度档参数没有区分度');
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
  assert.strictEqual(list.length, 13);
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

check('三套经典玩法都挂黄阶，价格也按品阶阶梯走', function () {
  for (const id of ['lingqi', 'leiyue', 'sanxiu']) {
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
