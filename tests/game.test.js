'use strict';

// 养成内核常驻断言：零依赖，直接 node tests/game.test.js 即可跑。
const assert = require('assert');
const game = require('../utils/game.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log('OK  ' + name);
}

check('新档版本为 5，带头像、纪录与连 S 计数', function () {
  const s = game.createNewState();
  assert.strictEqual(s.version, 5);
  assert.strictEqual(s.avatar, '');
  assert.deepStrictEqual(s.records, {});
  assert.deepStrictEqual(s.sStreak, {});
  assert.strictEqual(game.S_STREAK_GOAL, 3);
});

check('v1 存档可迁移到 v5', function () {
  const old = game.createNewState();
  delete old.avatar;
  delete old.records;
  old.version = 1;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 5);
  assert.strictEqual(n.avatar, '');
  assert.deepStrictEqual(n.records, {});
  assert.ok(n.skills && Object.keys(n.skills).length > 0);
});

check('v2 存档迁移后补出空纪录表与连 S 计数', function () {
  const old = game.createNewState();
  delete old.records;
  old.version = 2;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 5);
  assert.deepStrictEqual(n.records, {});
});

check('无 version 的老存档也能兜底', function () {
  const old = game.createNewState();
  delete old.version;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 5);
});

check('存档码导出导入往返一致', function () {
  const s = game.createNewState();
  s.roleName = '青云散人';
  s.portrait = 3;
  s.resources.qi = 321;
  const r = game.importSaveCode(game.exportSaveCode(s));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.roleName, '青云散人');
  assert.strictEqual(r.state.portrait, 3);
  assert.strictEqual(r.state.resources.qi, 321);
  assert.strictEqual(r.state.version, 5);
});

check('非法存档码被拒绝', function () {
  assert.strictEqual(game.importSaveCode('hello').ok, false);
  assert.strictEqual(game.importSaveCode('CANWU1:{broken').ok, false);
});

check('每日份例不会因时钟回拨而重开', function () {
  const s = game.createNewState();
  s.daily.date = '2099-12-31';
  s.daily.count = 3;
  s.daily.claimed = true;
  game.checkDaily(s);
  assert.strictEqual(s.daily.claimed, true);
  assert.strictEqual(s.daily.count, 3);
});

check('时钟倒退时不结算离线收益也不写入回拨值', function () {
  const s = game.createNewState();
  const future = Date.now() + 3600000;
  s.lastSeen = future;
  s.resources.qi = 0;
  const report = game.settleOffline(s);
  assert.strictEqual(report, null);
  assert.strictEqual(s.lastSeen, future);
  assert.strictEqual(s.resources.qi, 0);
});

check('正常离线 1 小时会结算灵气与熟练度', function () {
  const s = game.createNewState();
  s.lastSeen = Date.now() - 3600000;
  const report = game.settleOffline(s);
  assert.ok(report && report.qi > 0);
  assert.ok(report.prof >= 0);
});

check('离线收益受 8 小时上限约束', function () {
  const s = game.createNewState();
  s.lastSeen = Date.now() - 30 * 3600000;
  const report = game.settleOffline(s);
  assert.ok(report && report.capped === true);
  assert.ok(report.minutes <= 480);
});

check('成就共 14 项且字段完整', function () {
  const list = game.getAchievements(game.createNewState());
  assert.strictEqual(list.length, 14);
  for (const a of list) {
    assert.ok(a.id && a.name && a.desc && a.group);
    assert.strictEqual(typeof a.unlocked, 'boolean');
    assert.ok(a.goal > 0);
  }
});

check('参悟次数达标后对应成就解锁', function () {
  const s = game.createNewState();
  s.stats.practiceCount = 10;
  const list = game.getAchievements(s);
  assert.strictEqual(list.find(function (a) { return a.id === 'practice_10'; }).unlocked, true);
  assert.strictEqual(list.find(function (a) { return a.id === 'practice_50'; }).unlocked, false);
});

check('道号与道相可改，非法头像路径被拒', function () {
  const s = game.createNewState();
  assert.strictEqual(game.updateRole(s, { name: '小道', portrait: 4 }).ok, true);
  assert.strictEqual(s.roleName, '小道');
  assert.strictEqual(s.portrait, 4);
  assert.strictEqual(game.updateRole(s, { avatar: '../evil' }).ok, false);
  assert.strictEqual(game.updateRole(s, { avatar: 'users/abc/avatars/a.png' }).ok, true);
  assert.strictEqual(s.avatar, 'users/abc/avatars/a.png');
});

check('战力码可解析且能打镜像', function () {
  const s = game.createNewState();
  const code = game.battleCode(s);
  assert.ok(code.indexOf('CW1-') === 0);
  const parsed = game.parseBattleCode(code);
  assert.strictEqual(parsed.ok, true);
  const r = game.battleMirror(s, code);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(typeof r.win, 'boolean');
});

check('真实玩家镜像对战返回完整结果', function () {
  const s = game.createNewState();
  const wins = s.stats.wins;
  const r = game.battleRival(s, { name: '榜单道友', power: 120, realmName: '筑基' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.challengeName, '榜单道友');
  assert.strictEqual(r.enemyPower, 120);
  assert.ok(s.stats.wins >= wins);
});

check('v4 存档升到 v5：熟练度与纪录原样保留，连 S 从 0 重数', function () {
  const old = game.createNewState();
  old.version = 4;
  old.skills.jian.prof = 812;
  old.records = { jian: { score: 42, grade: 'A', at: 1 } };
  delete old.sStreak;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 5);
  assert.strictEqual(n.skills.jian.prof, 812);
  assert.strictEqual(n.records.jian.score, 42);
  assert.deepStrictEqual(n.sStreak, {});
});

check('连 S 计数随存档码往返，伪造的超额计数被截到目标-1', function () {
  const s = game.createNewState();
  s.sStreak = { jian: 2, tuna: 99 };
  const r = game.importSaveCode(game.exportSaveCode(s));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.sStreak.jian, 2);
  assert.strictEqual(r.state.sStreak.tuna, game.S_STREAK_GOAL - 1);
});

check('同一门连续三局 S：直接补到下一个段位门槛', function () {
  const s = game.createNewState();
  s.skills.jian.prof = 400;                   // 小成，离大成还差 600，正常三局根本补不满
  const goal = 1000;                          // world.TIERS[3].threshold
  const r1 = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 10 });
  const r2 = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 10 });
  assert.strictEqual(r1.promotion, null);
  assert.strictEqual(r2.promotion, null);
  assert.strictEqual(r1.sStreak, 1);
  assert.strictEqual(r2.sStreak, 2);
  const r3 = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 10 });
  assert.ok(r3.promotion && !r3.promotion.maxed, '第三局 S 没有触发直接晋级');
  assert.ok(r3.promotion.added > 0, '晋级没有补熟练度');
  assert.strictEqual(r3.profAfter, goal);
  assert.strictEqual(r3.tierAfter, 3);
  assert.strictEqual(r3.totalGain, r3.gain + r3.promotionGain);
  assert.strictEqual(r3.sStreak, 0, '领过晋级后没有重新数');
  assert.strictEqual(s.sStreak.jian, 0);
});

check('非 S 断连，中途收功（F）不增不减', function () {
  const s = game.createNewState();
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const a = game.applyPractice(s, 'jian', 'A', { difficulty: 'easy', score: 0 });
  assert.strictEqual(a.sStreak, 0, 'A 档没有断掉连 S');
  const f = game.applyPractice(s, 'jian', 'F', { difficulty: 'easy', score: 0 });
  assert.strictEqual(f.sStreak, 0, 'F 不该算完成，也不该把计数清成负数');
  assert.strictEqual(f.promotion, null);
  const one = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(one.sStreak, 1, '断连后要重新数');
});

check('连 S 按功法各算各的，换一门不会蹭到别人的进度', function () {
  const s = game.createNewState();
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const r = game.applyPractice(s, 'tuna', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(s.sStreak.jian, 2);
  assert.strictEqual(r.sStreak, 1);
  assert.strictEqual(r.promotion, null, '跨功法凑三局不该直接晋级');
});

check('已至大圆满时三连 S 不再补熟练度，也不会越界', function () {
  const s = game.createNewState();
  s.skills.jian.prof = 6000;
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const r = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  assert.ok(r.promotion && r.promotion.maxed, '大圆满没有如实回报');
  assert.strictEqual(r.promotionGain, 0);
  assert.strictEqual(r.tierAfter, 5);
});

check('三连 S 晋级：只补到开场段位的下一门槛，不白送两段', function () {
  const s = game.createNewState();
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const r = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const tiers = require('../data/world.js').TIERS;
  assert.ok(r.promotion && !r.promotion.maxed, '第三局仍该给出三连圆满回执');
  // 以前「补额恰好为 0」是连练递减压出来的巧合；该守的是「只晋一段」这条语义。
  assert.strictEqual(r.promotion.threshold, tiers[r.tierBefore + 1].threshold, '补的不是开场段位的下一门槛');
  assert.ok(r.profAfter >= r.promotion.threshold, '没补到下一门槛');
  const nextNext = tiers[r.tierBefore + 2];
  assert.ok(!nextNext || r.profAfter < nextNext.threshold, '不该顺手把玩家送到下下段');
  assert.strictEqual(r.profAfter, r.profBefore + r.totalGain, '入账与实际增长对不上');
});
check('getSkillList 输出每门功法的连 S 进度', function () {
  const s = game.createNewState();
  s.sStreak.jian = 2;
  const item = game.getSkillList(s).find(function (x) { return x.id === 'jian'; });
  assert.strictEqual(item.sStreak, 2);
  assert.strictEqual(item.sStreakGoal, 3);
});

check('同一门连练不减收益：换门只给正激励，不罚专精', function () {
  const solo = game.createNewState();
  solo.skills.jian.unlocked = true;
  const gains = [];
  for (let i = 0; i < 6; i += 1) {
    gains.push(game.applyPractice(solo, 'jian', 'A', { difficulty: 'easy', score: 0 }).gain);
  }
  for (let i = 1; i < gains.length; i += 1) {
    assert.strictEqual(gains[i], gains[0], '第 ' + (i + 1) + ' 局收益变了，连练又被罚了');
  }
  assert.strictEqual(solo.repeatCount, undefined, '连练计数不该再写进存档');

  const alt = game.createNewState();
  alt.skills.jian.unlocked = true;
  alt.skills.tuna.unlocked = true;
  const seq = ['jian', 'tuna', 'jian', 'tuna', 'jian', 'tuna'];
  const altGains = seq.map(function (id) {
    return game.applyPractice(alt, id, 'A', { difficulty: 'easy', score: 0 }).gain;
  });
  const sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  // 轮换只该多拿 15% 的「触类旁通」，不该像旧机制那样拉开 56%。
  assert.ok(sum(gains) >= sum(altGains) * 0.85,
    '连练与轮换的差距超过换门加成（' + sum(gains) + ' vs ' + sum(altGains) + '）');
  assert.ok(altGains[1] > altGains[0], '换门那一局没拿到触类旁通');
  const r = game.applyPractice(solo, 'jian', 'A', { difficulty: 'easy', score: 0 });
  assert.strictEqual(r.restless, undefined, '结算里不该再出现递减文案的数据');
  assert.strictEqual(r.crossBonus, 1, '同一门连练不该算换门');
});

check('旧存档的连练计数字段被丢弃，上一门记录仍在', function () {
  const old = game.createNewState();
  old.repeatCount = 4;
  old.lastPractice = { skillId: 'jian', at: 1 };
  const n = game.normalizeState(old);
  assert.strictEqual(n.repeatCount, undefined, '废弃字段不该被写回存档');
  assert.strictEqual(n.lastPractice.skillId, 'jian', '换门加成要用的上一门记录仍在');
});

check('功法页排序与主页推荐同源，境界不符的整段压后', function () {
  const s = game.createNewState();
  for (const id of Object.keys(s.skills)) s.skills[id].unlocked = true;
  s.skills.jingxin.prof = 392; // 距小成很近，但玄阶在炼气期只有三成收益
  s.skills.jian.prof = 20;
  const scored = game.getSkillList(s).slice().sort(function (a, b) {
    return game.recommendScore(a).score - game.recommendScore(b).score;
  });
  assert.strictEqual(scored[0].id, game.recommend(s).id, '列表首位与主页推荐不一致');
  const firstDecayed = scored.findIndex(function (x) { return !x.realmOk; });
  const lastFull = scored.map(function (x) { return x.realmOk; }).lastIndexOf(true);
  assert.ok(firstDecayed > lastFull, '境界不符的功法没被整段压到后面');
});

console.log('\ngame.test: ' + passed + ' assertions passed');
