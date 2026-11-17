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

check('新档版本为 8，带纪录、连 S 层数、五档进度与双货币身家，不再有头像字段', function () {
  const economy = require('../data/economy.js');
  const s = game.createNewState();
  assert.strictEqual(s.version, 9);
  assert.strictEqual(s.resources.qi, economy.START_QI, '开局灵力不是 START_QI');
  assert.strictEqual(s.resources.stone, economy.START_STONE, '开局灵石不是 START_STONE');
  assert.strictEqual(s.daily.battleWins, 0, '当日胜场没初始化');
  assert.strictEqual('avatar' in s, false, '头像已下线，存档里不该再留空字段');
  assert.deepStrictEqual(s.records, {});
  assert.deepStrictEqual(s.sCombo, {});
  assert.strictEqual(game.COMBO_MAX, 10);
});

check('v1 存档可迁移到 v7', function () {
  const old = game.createNewState();
  delete old.records;
  old.version = 1;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 9);
  assert.strictEqual('avatar' in n, false);
  assert.deepStrictEqual(n.records, {});
  assert.ok(n.skills && Object.keys(n.skills).length > 0);
});

check('v2 存档迁移后补出空纪录表与连 S 层数', function () {
  const old = game.createNewState();
  delete old.records;
  old.version = 2;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 9);
  assert.deepStrictEqual(n.records, {});
});

check('无 version 的老存档也能兜底', function () {
  const old = game.createNewState();
  delete old.version;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 9);
});

check('存档码导出导入往返一致', function () {
  const s = game.createNewState();
  s.roleName = '青云散人';
  s.portrait = 3;
  // 灵力有气海上限（炼气 174），夹具取上限内的数——超出的部分读档会夹平，
  // 那是「存档规范化」的规则，不归往返一致性这一条管。
  s.resources.qi = 120;
  const r = game.importSaveCode(game.exportSaveCode(s));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.roleName, '青云散人');
  assert.strictEqual(r.state.portrait, 3);
  assert.strictEqual(r.state.resources.qi, 120);
  assert.strictEqual(r.state.version, 9);
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

check('存档不推进闭关起点：save() 不许动 lastSeen', function () {
  // 这条是真机上「提示 +90 但一分没到账」的一半根因：每次存档都把 lastSeen 写成现在，
  // 于是领份例、换门、参悟结算……任何一次保存都会把攒下的闭关时长抹掉。
  const s = game.createNewState();
  const back = Date.now() - 3 * 3600 * 1000;
  s.lastSeen = back;
  game.save(s);
  assert.strictEqual(s.lastSeen, back, 'save() 把闭关起点推到了现在');
  assert.ok(Date.now() - s.lastSeen >= 170 * 60000);
});

check('正常离线 1 小时只结算灵力，不涨熟练度', function () {
  const s = game.createNewState();
  const profBefore = Object.keys(s.skills).map(function (id) { return s.skills[id].prof; });
  s.lastSeen = Date.now() - 3600000;
  const report = game.settleOffline(s);
  assert.ok(report && report.qi > 0, '一小时没结算出灵力');
  // 闭关不产熟练度：挂了也能推关卡，等于「参悟才是提速」是假话（关卡由熟练度算出）。
  assert.strictEqual(report.prof, undefined, '报告里还带着熟练度');
  assert.deepStrictEqual(
    Object.keys(s.skills).map(function (id) { return s.skills[id].prof; }),
    profBefore,
    '挂机把熟练度推出去了'
  );
});

check('离线收益受 8 小时上限约束', function () {
  const s = game.createNewState();
  s.lastSeen = Date.now() - 30 * 3600000;
  const report = game.settleOffline(s);
  assert.ok(report && report.capped === true);
  assert.ok(report.minutes <= 480);
});

check('打坐：灵力见底时不用退出重进也能补，且不产灵石', function () {
  const economy = require('../data/economy.js');
  const s = game.createNewState();
  s.resources.qi = 0;
  s.lastSeen = Date.now() - 10 * 60000;   // 坐（挂了）10 分钟
  const stoneBefore = s.resources.stone;

  // 预演只算不写：点之前页面要能报出「收下去能得多少」。
  const pending = game.idlePending(s);
  assert.strictEqual(pending.minutes, 10);
  assert.strictEqual(pending.qi, Math.floor(10 * require('../data/world.js').getWorld().idle.qiPerMinute));
  assert.strictEqual(s.resources.qi, 0, 'idlePending 动了存档');

  const r = game.meditate(s);
  assert.strictEqual(r.ok, true, '打坐没成：' + r.msg);
  assert.strictEqual(s.resources.qi, pending.qi, '打坐收到手的灵力与预演不一致');
  assert.ok(s.resources.qi >= economy.QI_COST_MIN, '打坐十分钟还不够开一局最简单的');
  assert.strictEqual(s.resources.stone, stoneBefore, '打坐产出了灵石');

  // 收过一次就清零：不许连点刷灵力。
  assert.strictEqual(game.idlePending(s).minutes, 0);
  const again = game.meditate(s);
  assert.strictEqual(again.ok, false, '连着点两下都收到了');
  assert.ok(again.msg.length > 0, '被拒时没给一句人话');
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
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.stats.practiceCount = 10;
  const list = game.getAchievements(s);
  assert.strictEqual(list.find(function (a) { return a.id === 'practice_10'; }).unlocked, true);
  assert.strictEqual(list.find(function (a) { return a.id === 'practice_50'; }).unlocked, false);
});

check('道号与道相可改，头像补丁不再生效', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
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
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
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
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
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
  assert.strictEqual(n.version, 9);
  assert.strictEqual(n.skills.jian.prof, 812);
  assert.strictEqual(n.records.jian.score, 42);
  assert.deepStrictEqual(n.sCombo, {}, '旧的三连计数被当成连击层数了');
  assert.strictEqual('sStreak' in n, false, '旧字段没摘干净');
  assert.strictEqual(world.COMBO_MAX, 10);
});

check('连 S 层数随存档码往返，伪造的超额层数被截到 10', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.sCombo = { jian: 3, tuna: 99 };
  const r = game.importSaveCode(game.exportSaveCode(s));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.sCombo.jian, 3);
  assert.strictEqual(r.state.sCombo.tuna, game.COMBO_MAX);
});

check('第 1～14 连 S：前十局走 1.5 曲线，之后每局锁死 1307', function () {
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.unlocked = true;
  s.skills.jian.prof = 24000;   // 绝境已开，每局都打当前关，不吃回关折减
  const levels = require('../data/levels.js');
  for (let i = 1; i <= 14; i += 1) {
    const r = game.applyPractice(s, 'jian', 'S', { level: levels.legacyLevelFromProf(s.skills.jian.prof), score: 0 });
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

check('非 S、失败、主动结束都归零，下一局 S 重新从 34 点起', function () {
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  game.applyPractice(s, 'jian', 'S', { score: 0 });
  game.applyPractice(s, 'jian', 'S', { score: 0 });
  const a = game.applyPractice(s, 'jian', 'A', { score: 0 });
  assert.strictEqual(a.comboNow, 0, 'A 档没有断掉连 S');
  assert.strictEqual(a.gain, world.PROF_BASE.A);
  const one = game.applyPractice(s, 'jian', 'S', { score: 0 });
  assert.strictEqual(one.comboNow, 1);
  assert.strictEqual(one.gain, 34, '断连后没从第 1 连重起');
  const f = game.applyPractice(s, 'jian', 'F', { score: 0 });
  assert.strictEqual(f.comboNow, 0, '失败没有断连');
  assert.strictEqual(f.gain, 0);
  game.applyPractice(s, 'jian', 'S', { score: 0 });
  const br = game.breakCombo(s, 'jian');   // 主动结束：不进结算，只断连
  assert.strictEqual(br.ok, true);
  assert.strictEqual(s.sCombo.jian, 0, '结束没断连，能靠中途退出保住连击');
  const restart = game.applyPractice(s, 'jian', 'S', { score: 0 });
  assert.strictEqual(restart.comboNow, 1);
  assert.strictEqual(restart.gain, 34);
});

check('连 S 按功法各算各的，换一门不会蹭到别人的层数', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  game.applyPractice(s, 'jian', 'S', { score: 0 });
  game.applyPractice(s, 'jian', 'S', { score: 0 });
  const r = game.applyPractice(s, 'tuna', 'S', { score: 0 });
  assert.strictEqual(s.sCombo.jian, 2);
  assert.strictEqual(r.comboNow, 1);
  assert.strictEqual(r.gain, 34, '跨功法凑连击把第一局抬成了第 3 连');
  game.breakCombo(s, 'jian');
  assert.strictEqual(s.sCombo.tuna, 1, '结束把别的门的连击也清了');
});

check('回关局与连 S 无关：不叠层、不砍连击收益、层数原样保留', function () {
  const practice = require('../data/practice.js');
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.unlocked = true;
  // 一门就是一条 1–1000 的线：已走通 8 关 → 当前关是第 9 关。
  // 进度只看存档 cleared，不看 prof（熟练度已经不参与关卡）。
  s.skills.jian.cleared = 8;
  game.applyPractice(s, 'jian', 'S', { level: 9, score: 0 });
  game.applyPractice(s, 'jian', 'S', { level: 10, score: 0 });
  // 回打第 3 关（当前关已经是 11）
  const low = game.applyPractice(s, 'jian', 'S', { level: 3, score: 0 });
  assert.strictEqual(low.comboActive, false, '回关 S 走了连击曲线');
  assert.strictEqual(low.comboNow, 2, '回关 S 动了两局攒下的层数');
  // 回关折减按「本关 ÷ 当前关」：回打第 3 关 = 3/11。
  assert.strictEqual(low.gain, practice.profByLevel(world.PROF_BASE.S, 3, 11));
  assert.ok(low.gain < world.PROF_BASE.S / 2, '回关到第 3 关还拿了一半以上：折减没生效');
  const third = game.applyPractice(s, 'jian', 'S', { level: 11, score: 0 });
  assert.strictEqual(third.comboNow, 3);
  assert.strictEqual(third.gain, 77, '回关练手后没接上第 3 连');
});

check('大圆满后熟练度封顶，连 S 与纪录照常，但灵力照扣', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.prof = 99999;
  s.resources.qi = 500;
  const before = s.resources.qi;
  const r = game.applyPractice(s, 'jian', 'S', { score: 123 });
  assert.strictEqual(r.gain, 0);
  assert.strictEqual(s.skills.jian.prof, 99999);
  assert.strictEqual(r.comboNow, 1, '到顶后连 S 不该停');
  // 到顶再练就是纯烧气：没有熟练度，气照样烧掉——所以到顶就该换门。
  assert.strictEqual(s.resources.qi, before - r.qiCost, '到顶后灵力该照扣');
  assert.ok(r.qiCost >= 1);
  assert.strictEqual(r.tierAfter, 5);
});

check('全程不断 S、每局都打本门当前关：84 局到火候封顶；全 C 是 10000 局', function () {
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.unlocked = true;
  // 一局一关：要拿全额熟练度就得打当前关，打完自动推进一关。
  let runs = 0;
  while (s.skills.jian.prof < world.PROF_MAX && runs < 5000) {
    runs += 1;
    game.applyPractice(s, 'jian', 'S', { level: s.skills.jian.cleared + 1, score: 0 });
  }
  assert.strictEqual(runs, world.PROF_S_RUNS, '全程不断 S 的最少局数不是标定值');
  assert.strictEqual(runs, 84);
  assert.strictEqual(s.skills.jian.prof, world.PROF_MAX);
  assert.strictEqual(world.PROF_C_RUNS + 1, 10000, '全 C 的 10000 局基准变了');
  // 断一次连就得重新叠：在第 10 连后插一局 A，总局数必然变多。
  const b = game.createNewState();
  b.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  b.skills.jian.unlocked = true;
  let broken = 0;
  while (b.skills.jian.prof < world.PROF_MAX && broken < 5000) {
    broken += 1;
    game.applyPractice(b, 'jian', broken === 11 ? 'A' : 'S', { level: b.skills.jian.cleared + 1, score: 0 });
  }
  assert.ok(broken > runs, '中途断连不该和全程不断一样快');
});

check('getSkillList 输出每门功法的连 S 层数与下一局收益', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.sCombo.jian = 2;
  const item = game.getSkillList(s).find(function (x) { return x.id === 'jian'; });
  assert.strictEqual(item.sCombo, 2);
  assert.strictEqual(item.sComboMax, 10);
  assert.strictEqual(item.comboNextGain, 77);
});

check('同一门连练不减收益：换门只给正激励，不罚专精', function () {
  const solo = game.createNewState();
  solo.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  solo.skills.jian.unlocked = true;
  const gains = [];
  for (let i = 0; i < 6; i += 1) {
    gains.push(game.applyPractice(solo, 'jian', 'A', { score: 0 }).gain);
  }
  for (let i = 1; i < gains.length; i += 1) {
    assert.strictEqual(gains[i], gains[0], '第 ' + (i + 1) + ' 局收益变了，连练又被罚了');
  }
  assert.strictEqual(solo.repeatCount, undefined, '连练计数不该再写进存档');

  const alt = game.createNewState();
  alt.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  alt.skills.jian.unlocked = true;
  alt.skills.tuna.unlocked = true;
  const seq = ['jian', 'tuna', 'jian', 'tuna', 'jian', 'tuna'];
  const altGains = [];
  const altQi = [];
  seq.forEach(function (id) {
    const rr = game.applyPractice(alt, id, 'A', { score: 0 });
    altGains.push(rr.gain);
    altQi.push(rr.qiCost);
  });
  const sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  // 换门只省气，不加减熟练度：熟练度是评级定额，连练与轮换必须一模一样。
  assert.strictEqual(sum(gains), sum(altGains), '连练与轮换的熟练度被写成了两套（'
    + sum(gains) + ' vs ' + sum(altGains) + '）');
  // 触类旁通从「多拿资源」换成了「少花灵力」：换门那一局比同一门便宜。
  assert.ok(altQi[1] < altQi[0],
    '换门那一局没拿到触类旁通（' + altQi[1] + ' vs ' + altQi[0] + ' 点灵力）');
  const r = game.applyPractice(solo, 'jian', 'A', { score: 0 });
  assert.strictEqual(r.restless, undefined, '结算里不该再出现递减文案的数据');
  assert.strictEqual(r.cross, false, '同一门连练不该算换门');
  const crossRun = game.applyPractice(alt, 'jian', 'A', { score: 0 });
  assert.strictEqual(crossRun.cross, true, '换回另一门没被认成触类旁通');
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
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
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

check('金丹期练得了黄阶：门槛管能不能开练，上限只管这一局多费气', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.realmIndex = 2; // 金丹，此时已是黄阶「收益不衰减上限（筑基）」之外
  const list = game.getSkillList(s);
  const huang = list.filter(function (x) { return x.tierKey === 'huang'; });
  assert.ok(huang.length > 0, '没有黄阶功法可测');
  for (const x of huang) {
    assert.strictEqual(x.realmReady, true, '金丹期被判成练不了黄阶：' + x.id);
    assert.strictEqual(x.realmAbove, true, '金丹期没被判成超出黄阶上限：' + x.id);
    assert.strictEqual(x.decayed, true, '金丹期练黄阶该是加价，不是不加价：' + x.id);
    assert.ok(x.decayText.indexOf('照样能练') >= 0 && x.decayText.indexOf('×1.5') >= 0,
      '衰减文案没说清「还能练、只是更费气」：' + x.id);
  }
  // 真的结算一局：能进、熟练度照给，只是耗气 ×1.5。
  const r = game.applyPractice(s, huang[0].id, 'S', {});
  assert.strictEqual(r.ok, true, '金丹期开不了黄阶的局');
  assert.ok(r.gain >= 1, '金丹期练黄阶拿不到熟练度');
  assert.strictEqual(r.realmReady, true, '结算把金丹期黄阶判成门槛未到');
  assert.strictEqual(r.realmAbove, true, '结算没认出已超上限');
  assert.strictEqual(r.realmOverCost, 1.5, '超上限该按耗气 ×1.5 结算');
  // 首页推荐不能因为「黄阶都打折」就把整批滤掉、推不出任何一门。
  const rec = game.recommend(s);
  assert.ok(rec.id, '金丹期推不出该练哪门');
  // 反过来：没到门槛才是硬门槛（炼气期拿不到最高阶功法的开练资格）。
  // 2026-11 删减后天阶已空，这里取「当前实际存在的最高阶」（现为地阶）来测同一条硬门槛。
  const low = game.createNewState();
  low.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  const lowList = game.getSkillList(low);
  const topTier = ['tian', 'di', 'xuan', 'huang']
    .filter(function (k) { return lowList.some(function (x) { return x.tierKey === k; }); })[0];
  const top = lowList.filter(function (x) { return x.tierKey === topTier; })[0];
  assert.ok(top, '没有高阶功法可测');
  assert.strictEqual(top.realmReady, false, '炼气期不该能开最高阶功法');
  assert.strictEqual(top.decayed, true, '未达门槛同样该标成不可修');
  // 未到门槛是硬门槛：不在「更贵」这一档，而是根本不开局。
  const refused = game.applyPractice(low, top.id, 'S', {});
  assert.strictEqual(refused.ok, false, '炼气期竟然开了一局最高阶功法');
});

check('首局引导标记：与技能同级存，老档读出来是「没看过」', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  assert.strictEqual(game.hasOnboarded(s, 'jian'), false, '新档不该已经标记看过引导');

  game.markOnboarded(s, 'jian');
  assert.strictEqual(game.hasOnboarded(s, 'jian'), true);
  // 存档回环：标记过的那门还在，别的门不受影响。
  const back = game.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(game.hasOnboarded(back, 'jian'), true, '引导标记被 normalizeState 丢了');
  assert.strictEqual(game.hasOnboarded(back, 'jingxin'), false, '标记串到别的门去了');

  // 老存档没有这个键：默认 false，等于老玩家第一次进也会看到一次引导。
  const old = game.createNewState();
  old.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  delete old.skills.jian.onboarded;
  old.version = 4;
  const migrated = game.normalizeState(old);
  assert.strictEqual(migrated.version, 9);
  assert.strictEqual(game.hasOnboarded(migrated, 'jian'), false);
});

check('引导按段记：一门五格各记各的，老档的 onboarded 只等价第 0 段', function () {
  const s = game.createNewState();
  assert.ok(Array.isArray(s.skills.jian.teachSeen), '新档该自带 teachSeen');
  assert.strictEqual(s.skills.jian.teachSeen.length, 5, 'teachSeen 必须五格（一门五段）');
  assert.ok(s.skills.jian.teachSeen.every(function (v) { return v === false; }), '新档不该有段被标成看过');

  // 一段一格：标了第 2 段（第 51 关）不等于标了首段。
  game.markTaught(s, 'jian', 2);
  assert.strictEqual(game.hasTaught(s, 'jian', 2), true);
  assert.strictEqual(game.hasTaught(s, 'jian', 0), false, '标了第 2 段却把第 0 段也算看过');
  assert.strictEqual(game.hasTaught(s, 'jian', 1), false, '标了第 2 段却把第 1 段也算看过');
  assert.strictEqual(game.hasOnboarded(s, 'jian'), false, 'onboarded 只该跟首段走');
  assert.strictEqual(s.skills.jian.onboarded, false, '第 2 段不该写旧的 onboarded');

  // 首段同时写旧字段：分享码与老断言还读 onboarded。
  game.markTaught(s, 'jian', 0);
  assert.strictEqual(s.skills.jian.onboarded, true, '首段看过没同步写 onboarded');
  assert.strictEqual(game.hasOnboarded(s, 'jian'), true);
  assert.strictEqual(game.hasTaught(s, 'jingxin', 0), false, '标记串到别的门去了');

  // 存档回环：五格原样回来，不塌成一个布尔。
  const back = game.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(back.skills.jian.teachSeen, [true, false, true, false, false],
    'teachSeen 过一遍 normalizeState 变形了');

  // 越界段号夹到两端，不抛错也不写进第 6 格。
  game.markTaught(back, 'jian', 9);
  assert.strictEqual(back.skills.jian.teachSeen.length, 5, '段号越界把数组撑长了');
  assert.strictEqual(game.hasTaught(back, 'jian', 9), true, '越界段号该夹到末段');

  // 老档只有 onboarded 一个布尔：等号右边是「首段看过」，其余四段按没看过处理。
  const old = game.createNewState();
  delete old.skills.jian.teachSeen;
  old.skills.jian.onboarded = true;
  const mig = game.normalizeState(old);
  assert.strictEqual(game.hasTaught(mig, 'jian', 0), true, '老档的 onboarded 没映射成首段');
  assert.strictEqual(game.hasTaught(mig, 'jian', 1), false,
    '老档被当成了「五段全看过」——升级上来的玩家就再也看不到段界引导了');
  assert.strictEqual(mig.skills.jian.teachSeen.length, 5, '老档没补出五格');
});

check('气海：炼气 174 起，破境与真元都能把它拓深', function () {
  const economy = require('../data/economy.js');
  const w = require('../data/world.js');
  const s = game.createNewState();
  const open = game.qiCap(s);
  assert.strictEqual(open, w.getWorld().realms[0].qiCap + 12 * economy.QI_CAP_PER_LING,
    '炼气气海不等于「境界基数 + 真元 × 2」');
  // 境界：炼气 150 → 元婴 620，一路单调变深。
  let prev = 0;
  for (let i = 0; i < w.getWorld().realms.length; i += 1) {
    s.realmIndex = i;
    const cap = game.qiCap(s);
    assert.ok(cap > prev, '第 ' + i + ' 境的谷气海没有比上一境更深');
    prev = cap;
  }
  // 真元：循数勘禁诀加 ling，练满之后每点换 2 点上限。
  s.realmIndex = 0;
  const before = game.qiCap(s);
  s.skills.leifu = { unlocked: true, prof: w.PROF_MAX, onboarded: true };
  const after = game.qiCap(s);
  const ling = game.computeAttributes(s).ling;
  assert.ok(after > before, '真元涨了，气海却没变深');
  assert.strictEqual(after - before, Math.round((ling - 12) * economy.QI_CAP_PER_LING),
    '真元到气海的换算不是每点 2 点');
});

check('闭关溢出：气海装不下的部分收不到，且如实报出来', function () {
  const s = game.createNewState();
  s.resources.qi = 100;
  s.lastSeen = Date.now() - 8 * 3600 * 1000;
  const p = game.idlePending(s);
  const cap = game.qiCap(s);
  assert.strictEqual(p.qi, cap - 100, '收紧的灵力不等于气海空位');
  assert.ok(p.overflow > 0, '溢出没被算出来');
  assert.strictEqual(p.qi + p.overflow, p.qiRaw, '三个数对不上：收到 + 溢出 ≠ 坐出来的');
});

check('满池打坐不静默：说清「灵力已满」而不是「还没攒够」', function () {
  const s = game.createNewState();
  s.resources.qi = game.qiCap(s);
  s.lastSeen = Date.now() - 60 * 1000;
  const r = game.meditate(s);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.full, true, '满池被当成了「坐得不够久」');
  assert.ok(/已满/.test(r.msg), '满池提示没写清原因：' + r.msg);
});

check('突破：气海随境界变宽，破境即补满', function () {
  const s = game.createNewState();
  const w = require('../data/world.js');
  for (const id of Object.keys(s.skills)) {
    s.skills[id].unlocked = true;
    s.skills[id].prof = w.PROF_MAX;
  }
  s.resources.stone = 1000;
  s.resources.qi = 5;
  const info = game.breakthroughInfo(s);
  assert.strictEqual(info.available, true, '夹具没造出可突破的状态');
  assert.ok(info.qiCapAfter > info.qiCap, '突破预告里气海没变宽');
  const r = game.applyBreakthrough(s, 'S');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.resources.qi, r.qiCapAfter, '破境之后气海没补满');
  assert.strictEqual(r.qiCapAfter, info.qiCapAfter, '结算与预告的气海不一致');
});

check('功法特效按段位兑现：入门 25%，圆满满额，未入门不给', function () {
  const s = game.createNewState();
  const w = require('../data/world.js');
  assert.strictEqual(game.effectValue(s, 'power'), 0, '还没入门就给了特效');
  s.skills.jian.prof = w.TIERS[1].threshold;        // 入门
  assert.ok(Math.abs(game.effectValue(s, 'power') - 0.06 * 0.25) < 1e-9, '入门不是 1/4');
  s.skills.jian.prof = w.TIERS[3].threshold;        // 大成
  assert.ok(Math.abs(game.effectValue(s, 'power') - 0.06 * 0.75) < 1e-9, '大成不是 3/4');
  s.skills.jian.prof = w.PROF_MAX;                  // 大圆满
  assert.ok(Math.abs(game.effectValue(s, 'power') - 0.06) < 1e-9, '满级没给满额');
});

check('四个属性各有一件正事：真元换气海、悟性省灵力、身法稳波动', function () {
  const w = require('../data/world.js').getWorld();
  const roles = {};
  for (const a of w.attributes) roles[a.key] = a.role || '';
  assert.ok(/灵力上限/.test(roles.ling), '真元没有说明它管气海');
  assert.ok(/省灵力/.test(roles.wu), '悟性没有说明它省灵力');
  assert.ok(/波动/.test(roles.shen), '身法没有说明它稳波动');
  assert.ok(roles.ti, '体魄没有说明它管什么');

  const s = game.createNewState();
  const base = game.shenFloorBonus(s);
  assert.ok(base > 0, '基础身法没有换来波动下限');
  s.skills.shumu = { unlocked: true, prof: 99999, onboarded: true };  // 神识 +身法，练满
  assert.ok(game.shenFloorBonus(s) > base, '身法涨了，波动下限没跟着涨');
  assert.ok(game.shenFloorBonus(s) <= 0.10 + 1e-9, '身法波动超过了 10% 的封顶');

  // 换算必须是「每 30 点 +1%」——注释、09-attributes 4.3、玩家指南第 55 行都这么写。
  // 这条曾经掉过 10 倍（代码 1/300，身法 30 点就吃满封顶），而原来的断言只守「涨了、不超顶」，
  // 两头都满足，漂移了也发现不了。这里用一个没封顶的独立存档反算每点系数。
  const fresh = game.createNewState();
  const shen = game.computeAttributes(fresh).shen || 0;
  const perPoint = game.shenFloorBonus(fresh) / shen;
  assert.ok(Math.abs(perPoint - 1 / 3000) < 1e-12,
    '身法换算不是每 30 点 +1%：实测 ' + (perPoint * 30 * 100).toFixed(2) + '% / 30 点');
});


// ---------------------------------------------------------------- 份例：装多少领多少
check('份例按空位领：气海装不下的部分散去，并照实报出散了多少', function () {
  const economy = require('../data/economy.js');
  const s = game.createNewState();
  s.daily.count = 3;
  const cap = game.qiCap(s);
  // 留 21 点空位：旧版这里会整份拒领，而「参悟满三次」时这正好是最常见的情形。
  s.resources.qi = cap - 21;
  const r = game.claimDaily(s);
  assert.strictEqual(r.ok, true, '有空位却领不了：' + r.msg);
  assert.strictEqual(r.qi, 21, '领到的不是空位那 21 点');
  assert.strictEqual(r.quota, economy.DAILY_QI, '份例总额没如实报出');
  assert.strictEqual(r.lost, economy.DAILY_QI - 21, '散去的点数对不上');
  assert.strictEqual(s.resources.qi, cap, '领完没有刚好装满气海');
  assert.strictEqual(s.daily.claimed, true, '领过之后没有标记');
  // 同一天再点一次：拒绝，且不能再加。
  const again = game.claimDaily(s);
  assert.strictEqual(again.ok, false, '份例一天能领两次');
});

check('份例在气海一点空位都没有时拒领，且说明是满池不是次数不够', function () {
  const s = game.createNewState();
  s.daily.count = 3;
  s.resources.qi = game.qiCap(s);
  const r = game.claimDaily(s);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.full, true, '满池没被标记成 full，提示会写成「次数不够」');
  assert.ok(/先练一局/.test(r.msg), '满池提示没给出下一步：' + r.msg);
});

// ---------------------------------------------------------------- 灵石兑灵力
check('灵石兑灵力：1 枚 = 100 点，只此一向', function () {
  const economy = require('../data/economy.js');
  const s = game.createNewState();
  s.resources.qi = 10;
  const stoneBefore = s.resources.stone;
  const r = game.exchangeQi(s, 1);
  assert.strictEqual(r.ok, true, '开局付得起却换不成：' + r.msg);
  assert.strictEqual(r.qi, economy.QI_PER_STONE, '换到的灵力不是 QI_PER_STONE');
  assert.strictEqual(r.qi, 100, '汇率被改成了 100 以外');
  assert.strictEqual(s.resources.stone, stoneBefore - 1, '灵石没扣');
  assert.strictEqual(s.resources.qi, 110, '灵力没加');
  // 反向没有入口：公开接口里不许出现「灵力换灵石」。
  const names = Object.keys(game).filter(function (k) { return /stoneFromQi|qiToStone|sellQi/i.test(k); });
  assert.deepStrictEqual(names, [], '出现了把灵力换成灵石的接口：' + names.join(','));
});

check('灵石兑灵力：灵石不够 / 气海装不下都换不成，且一个子儿都不扣', function () {
  const s = game.createNewState();
  s.resources.qi = 10;
  s.resources.stone = 0;
  const poor = game.exchangeQi(s, 1);
  assert.strictEqual(poor.ok, false, '灵石为 0 也换成了');
  assert.strictEqual(s.resources.qi, 10, '换不成却动了灵力');
  // 气海只剩 4 点：100 点装不下。
  s.resources.stone = 5;
  s.resources.qi = game.qiCap(s) - 4;
  const tight = game.exchangeQi(s, 1);
  assert.strictEqual(tight.ok, false, '气海装不下也换成了');
  assert.strictEqual(tight.qiRoom, 4, '没报出气海还剩多少空位');
  assert.strictEqual(s.resources.stone, 5, '换不成却扣了灵石');
  assert.strictEqual(s.resources.qi, game.qiCap(s) - 4, '换不成却动了灵力');
});

check('兑换面板的报价与真正执行同源：写着能换就一定换得成', function () {
  const s = game.createNewState();
  s.resources.qi = 10;
  const q = game.exchangeQuote(s);
  assert.strictEqual(q.ready, true, '报价说不能换，其实付得起：' + q.hint);
  assert.ok(q.can >= 1, '可换枚数算成了 0');
  assert.strictEqual(game.exchangeQi(s, 1).ok, true, '报价亮着，点下去却换不成');
  // 换完之后空位只剩 64 点（174 − 110），报价必须立刻变成「换不了」。
  const q2 = game.exchangeQuote(s);
  assert.strictEqual(q2.ready, false, '气海已经不装第二枚，报价还说能换');
  assert.ok(/先练一局/.test(q2.hint), '换不了时的说明没给下一步：' + q2.hint);
});

console.log('\ngame.test: ' + passed + ' assertions passed');
