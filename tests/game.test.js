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

check('新档版本为 6，带纪录与连 S 层数，不再有头像字段', function () {
  const s = game.createNewState();
  assert.strictEqual(s.version, 6);
  assert.strictEqual('avatar' in s, false, '头像已下线，存档里不该再留空字段');
  assert.deepStrictEqual(s.records, {});
  assert.deepStrictEqual(s.sCombo, {});
  assert.strictEqual(game.COMBO_MAX, 10);
});

check('v1 存档可迁移到 v6', function () {
  const old = game.createNewState();
  delete old.records;
  old.version = 1;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 6);
  assert.strictEqual('avatar' in n, false);
  assert.deepStrictEqual(n.records, {});
  assert.ok(n.skills && Object.keys(n.skills).length > 0);
});

check('v2 存档迁移后补出空纪录表与连 S 层数', function () {
  const old = game.createNewState();
  delete old.records;
  old.version = 2;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 6);
  assert.deepStrictEqual(n.records, {});
});

check('无 version 的老存档也能兜底', function () {
  const old = game.createNewState();
  delete old.version;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 6);
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
  assert.strictEqual(r.state.version, 6);
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

check('道号与道相可改，头像补丁不再生效', function () {
  const s = game.createNewState();
  assert.strictEqual(game.updateRole(s, { name: '小道', portrait: 4 }).ok, true);
  assert.strictEqual(s.roleName, '小道');
  assert.strictEqual(s.portrait, 4);
  // 头像下线后 updateRole 忽略这个键：既不写档，也不报错（老存档只有读没有写）。
  assert.strictEqual(game.updateRole(s, { avatar: 'users/abc/avatars/a.png' }).ok, true);
  assert.strictEqual('avatar' in s, false);
  // 道相编号仍然归一化到 0–5。
  game.updateRole(s, { portrait: 9 });
  assert.strictEqual(s.portrait, 3);
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

check('v5 存档升到 v6：熟练度与纪录原样保留，旧三连计数不换算', function () {
  const world = require('../data/world.js');
  const old = game.createNewState();
  old.version = 5;
  old.skills.jian.prof = 812;
  old.records = { jian: { score: 42, grade: 'A', at: 1 } };
  old.sStreak = { jian: 2 };
  delete old.sCombo;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 6);
  assert.strictEqual(n.skills.jian.prof, 812);
  assert.strictEqual(n.records.jian.score, 42);
  assert.deepStrictEqual(n.sCombo, {}, '旧的三连计数被当成连击层数了');
  assert.strictEqual('sStreak' in n, false, '旧字段没摘干净');
  assert.strictEqual(world.COMBO_MAX, 10);
});

check('连 S 层数随存档码往返，伪造的超额层数被截到 10', function () {
  const s = game.createNewState();
  s.sCombo = { jian: 3, tuna: 99 };
  const r = game.importSaveCode(game.exportSaveCode(s));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.sCombo.jian, 3);
  assert.strictEqual(r.state.sCombo.tuna, game.COMBO_MAX);
});

check('第 1～14 连 S：前十局走 1.5 曲线，之后每局锁死 1307', function () {
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.skills.jian.unlocked = true;
  s.skills.jian.prof = 24000;   // 绝境已开，每局都打最高档，不吃低档折减
  for (let i = 1; i <= 14; i += 1) {
    const r = game.applyPractice(s, 'jian', 'S', { difficulty: 'desperate', score: 0 });
    assert.strictEqual(r.comboNow, Math.min(i, 10), '第 ' + i + ' 连层数不对');
    assert.strictEqual(r.gain, world.comboGain(i), '第 ' + i + ' 连收益不是曲线值');
    assert.strictEqual(r.comboActive, true);
    assert.strictEqual(r.comboNextGain, world.comboGain(i + 1), '结算没报下一局的点数');
    assert.strictEqual(r.profAfter, r.profBefore + r.gain, '入账与实际增长对不上');
    assert.strictEqual(r.promotion, undefined, '三连晋级的回执字段还在');
    assert.strictEqual(r.totalGain, undefined, '补额时代的 totalGain 还在');
  }
  assert.strictEqual(s.sCombo.jian, 10);
});

check('第 3 连取 77 而不是 76，第 4 连不拿上局整数接着乘', function () {
  const world = require('../data/world.js');
  assert.strictEqual(34 * 1.5 * 1.5, 76.5);
  assert.strictEqual(world.comboGain(3), 77);
  assert.strictEqual(world.PROF_BASE.A, 23, '22.5 与 76.5 的进位方向不一致');
  assert.strictEqual(world.comboGain(4), 115);
  assert.notStrictEqual(world.comboGain(4), Math.round(77 * 1.5));
});

check('非 S、走火、主动收功都归零，下一局 S 重新从 34 点起', function () {
  const world = require('../data/world.js');
  const s = game.createNewState();
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const a = game.applyPractice(s, 'jian', 'A', { difficulty: 'easy', score: 0 });
  assert.strictEqual(a.comboNow, 0, 'A 档没有断掉连 S');
  assert.strictEqual(a.gain, world.PROF_BASE.A);
  const one = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(one.comboNow, 1);
  assert.strictEqual(one.gain, 34, '断连后没从第 1 连重起');
  const f = game.applyPractice(s, 'jian', 'F', { difficulty: 'easy', score: 0 });
  assert.strictEqual(f.comboNow, 0, '走火没有断连');
  assert.strictEqual(f.gain, 0);
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const br = game.breakCombo(s, 'jian');   // 主动收功：不进结算，只断连
  assert.strictEqual(br.ok, true);
  assert.strictEqual(s.sCombo.jian, 0, '收功没断连，能靠中途退出保住连击');
  const restart = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(restart.comboNow, 1);
  assert.strictEqual(restart.gain, 34);
});

check('连 S 按功法各算各的，换一门不会蹭到别人的层数', function () {
  const s = game.createNewState();
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  const r = game.applyPractice(s, 'tuna', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(s.sCombo.jian, 2);
  assert.strictEqual(r.comboNow, 1);
  assert.strictEqual(r.gain, 34, '跨功法凑连击把第一局抬成了第 3 连');
  game.breakCombo(s, 'jian');
  assert.strictEqual(s.sCombo.tuna, 1, '收功把别的门的连击也清了');
});

check('低档局与连 S 无关：不叠层、不砍连击收益、层数原样保留', function () {
  const practice = require('../data/practice.js');
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.skills.jian.unlocked = true;
  s.skills.jian.prof = 1500;   // 最高已解锁档 = 困难，简单档低 2 档
  game.applyPractice(s, 'jian', 'S', { difficulty: 'hard', score: 0 });
  game.applyPractice(s, 'jian', 'S', { difficulty: 'hard', score: 0 });
  const low = game.applyPractice(s, 'jian', 'S', { difficulty: 'easy', score: 0 });
  assert.strictEqual(low.comboActive, false, '低档 S 走了连击曲线');
  assert.strictEqual(low.comboNow, 2, '低档 S 动了两局攒下的层数');
  assert.strictEqual(low.gain, practice.profBelowCap(world.PROF_BASE.S, 1500, 'easy'));
  assert.strictEqual(low.gain, 9, '低两档 S 应是 34 → 17 → 9');
  const third = game.applyPractice(s, 'jian', 'S', { difficulty: 'hard', score: 0 });
  assert.strictEqual(third.comboNow, 3);
  assert.strictEqual(third.gain, 77, '回高档没接上第 3 连');
});

check('大圆满后熟练度封顶，但连 S、资源与纪录照常给', function () {
  const s = game.createNewState();
  s.skills.jian.prof = 99999;
  const r = game.applyPractice(s, 'jian', 'S', { difficulty: 'desperate', score: 123 });
  assert.strictEqual(r.gain, 0);
  assert.strictEqual(s.skills.jian.prof, 99999);
  assert.strictEqual(r.comboNow, 1, '到顶后连 S 不该停');
  assert.ok(r.qi > 0 && r.stone > 0, '到顶后资源停发了');
  assert.strictEqual(r.tierAfter, 5);
});

check('全程不断 S、都打最高档：84 局到大圆满；全 C 是 10000 局', function () {
  const practice = require('../data/practice.js');
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.skills.jian.unlocked = true;
  let runs = 0;
  while (s.skills.jian.prof < world.PROF_MAX && runs < 500) {
    runs += 1;
    const key = practice.DIFFICULTIES[practice.diffIndexOf(s.skills.jian.prof)].key;
    game.applyPractice(s, 'jian', 'S', { difficulty: key, score: 0 });
  }
  assert.strictEqual(runs, world.PROF_S_RUNS, '全程不断 S 的最少局数不是标定值');
  assert.strictEqual(runs, 84);
  assert.strictEqual(s.skills.jian.prof, world.PROF_MAX);
  assert.strictEqual(world.PROF_C_RUNS + 1, 10000, '全 C 的 10000 局基准变了');
  // 断一次连就得重新叠：在第 10 连后插一局 A，总局数必然变多。
  const b = game.createNewState();
  b.skills.jian.unlocked = true;
  let broken = 0;
  while (b.skills.jian.prof < world.PROF_MAX && broken < 500) {
    broken += 1;
    const key = practice.DIFFICULTIES[practice.diffIndexOf(b.skills.jian.prof)].key;
    game.applyPractice(b, 'jian', broken === 11 ? 'A' : 'S', { difficulty: key, score: 0 });
  }
  assert.ok(broken > runs, '中途断连不该和全程不断一样快');
});

check('getSkillList 输出每门功法的连 S 层数与下一局收益', function () {
  const s = game.createNewState();
  s.sCombo.jian = 2;
  const item = game.getSkillList(s).find(function (x) { return x.id === 'jian'; });
  assert.strictEqual(item.sCombo, 2);
  assert.strictEqual(item.sComboMax, 10);
  assert.strictEqual(item.comboNextGain, 77);
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
  const altGains = [];
  const altQi = [];
  seq.forEach(function (id) {
    const rr = game.applyPractice(alt, id, 'A', { difficulty: 'easy', score: 0 });
    altGains.push(rr.gain);
    altQi.push(rr.qi);
  });
  const sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  // 换门加成只进灵气灵石，熟练度是评级定额：两条线都不该被连练惩罚。
  assert.ok(sum(gains) >= sum(altGains) * 0.85,
    '连练与轮换的熟练度差距超过换门加成（' + sum(gains) + ' vs ' + sum(altGains) + '）');
  assert.ok(altQi[1] > altQi[0], '换门那一局没拿到触类旁通');
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

check('功法页排序与主页推荐同源，境界吃亏的整段压后', function () {
  const s = game.createNewState();
  for (const id of Object.keys(s.skills)) s.skills[id].unlocked = true;
  s.skills.jingxin.prof = 392; // 距小成很近，但玄阶在炼气期只有三成收益
  s.skills.jian.prof = 20;
  const scored = game.getSkillList(s).slice().sort(function (a, b) {
    return game.recommendScore(a).score - game.recommendScore(b).score;
  });
  assert.strictEqual(scored[0].id, game.recommend(s).id, '列表首位与主页推荐不一致');
  const firstDecayed = scored.findIndex(function (x) { return x.decayed; });
  const lastFull = scored.map(function (x) { return x.decayed; }).lastIndexOf(false);
  assert.ok(firstDecayed > lastFull, '境界吃亏的功法没被整段压到后面');
});

check('金丹期练得了黄阶：门槛管能不能开练，上限只管收益打几折', function () {
  const s = game.createNewState();
  s.realmIndex = 2; // 金丹，此时已是黄阶「收益不衰减上限（筑基）」之外
  const list = game.getSkillList(s);
  const huang = list.filter(function (x) { return x.tierKey === 'huang'; });
  assert.ok(huang.length > 0, '没有黄阶功法可测');
  for (const x of huang) {
    assert.strictEqual(x.realmReady, true, '金丹期被判成练不了黄阶：' + x.id);
    assert.strictEqual(x.realmAbove, true, '金丹期没被判成超出黄阶上限：' + x.id);
    assert.strictEqual(x.decayed, true, '金丹期练黄阶该是打折，不是不打折：' + x.id);
    assert.ok(x.decayText.indexOf('还能') >= 0 || x.decayText.indexOf('仅剩 30%') >= 0,
      '衰减文案没说清「还能练」：' + x.id);
  }
  // 真的结算一局：能进、有收益，只是按 0.3 折。
  const r = game.applyPractice(s, huang[0].id, 'S', { difficulty: 'easy' });
  assert.strictEqual(r.ok, true, '金丹期开不了黄阶的局');
  assert.ok(r.gain >= 1, '金丹期练黄阶拿不到熟练度');
  assert.strictEqual(r.realmReady, true, '结算把金丹期黄阶判成门槛未到');
  assert.strictEqual(r.realmAbove, true, '结算没认出已超上限');
  assert.strictEqual(r.realmDecay, 0.3, '超上限该按三成结算');
  // 首页推荐不能因为「黄阶都打折」就把整批滤掉、推不出任何一门。
  const rec = game.recommend(s);
  assert.ok(rec.id, '金丹期推不出该练哪门');
  // 反过来：没到门槛才是硬门槛（炼气期拿不到天阶的开练资格）。
  const low = game.createNewState();
  const tian = game.getSkillList(low).filter(function (x) { return x.tierKey === 'tian'; })[0];
  assert.ok(tian, '没有天阶功法可测');
  assert.strictEqual(tian.realmReady, false, '炼气期不该能开天阶');
  assert.strictEqual(tian.decayed, true, '未达门槛同样该标成收益受损');
});

check('首局引导标记：与技能同级存，老档读出来是「没看过」', function () {
  const s = game.createNewState();
  assert.strictEqual(game.hasOnboarded(s, 'jian'), false, '新档不该已经标记看过引导');

  game.markOnboarded(s, 'jian');
  assert.strictEqual(game.hasOnboarded(s, 'jian'), true);
  // 存档回环：标记过的那门还在，别的门不受影响。
  const back = game.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(game.hasOnboarded(back, 'jian'), true, '引导标记被 normalizeState 丢了');
  assert.strictEqual(game.hasOnboarded(back, 'jingxin'), false, '标记串到别的门去了');

  // 老存档没有这个键：默认 false，等于老玩家第一次进也会看到一次引导。
  const old = game.createNewState();
  delete old.skills.jian.onboarded;
  old.version = 4;
  const migrated = game.normalizeState(old);
  assert.strictEqual(migrated.version, 6);
  assert.strictEqual(game.hasOnboarded(migrated, 'jian'), false);
});

console.log('\ngame.test: ' + passed + ' assertions passed');
