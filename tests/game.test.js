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

check('新档是 v10：带纪录与双货币身家，没有熟练度也没有连 S 层数', function () {
  const economy = require('../data/economy.js');
  const s = game.createNewState();
  assert.strictEqual(s.version, game.SAVE_VERSION);
  assert.strictEqual(game.SAVE_VERSION, 10, '这次改版把存档推到 v10');
  assert.strictEqual(s.resources.qi, economy.START_QI, '开局灵力不是 START_QI');
  assert.strictEqual(s.resources.stone, economy.START_STONE, '开局灵石不是 START_STONE');
  assert.strictEqual(s.daily.battleWins, 0, '当日胜场没初始化');
  assert.strictEqual('avatar' in s, false, '头像已下线，存档里不该再留空字段');
  assert.deepStrictEqual(s.records, {});
  assert.strictEqual('sCombo' in s, false, '连 S 层数已随熟练度一起删掉');
  assert.strictEqual('prof' in s.skills.jian, false, '功法记录里不该再有 prof');
  assert.strictEqual(s.skills.jian.cleared, 0, '新档的已走通关数不是 0');
  assert.strictEqual(game.COMBO_MAX, undefined, 'COMBO_MAX 这个常量已删');
});

check('一次性礼包：发一次记账，重读不重发，读档本身不发', function () {
  const economy = require('../data/economy.js');
  assert.ok(economy.GIFTS.length > 0, '礼包表是空的，grantGifts 会永远什么都不发');
  const gift = economy.GIFTS[0];
  assert.ok(gift.id && gift.stone > 0, '礼包缺 id 或缺金额');

  const s = game.createNewState();
  assert.deepStrictEqual(s.gifts, {}, '新档不该预置发放记录');

  // 读档不许发钱：登录后 hydrate() 会拿云端那份整个覆盖 state，若在读档里发，
  // 每次冷启动都会把「没记账」的云端档当成没发过——重开一次赚一次。
  const loaded = game.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(loaded.resources.stone, economy.START_STONE, '读档时就发了钱');
  assert.deepStrictEqual(loaded.gifts, {}, '读档不该写发放记录');

  const before = s.resources.stone;
  const r1 = game.grantGifts(s);
  assert.ok(r1 && r1.stone === gift.stone, '第一次没发出礼包');
  assert.strictEqual(s.resources.stone, before + gift.stone, '灵石没加上');
  assert.ok(s.gifts[gift.id] > 0, '发过却没记账');
  assert.ok(s.log[0] && s.log[0].text.indexOf('灵石 +' + gift.stone) >= 0, '动向里没留这一笔');

  const r2 = game.grantGifts(s);
  assert.strictEqual(r2, null, '同一份档发了第二次');
  assert.strictEqual(s.resources.stone, before + gift.stone, '第二次又加钱了');

  // 存读一轮：记账存在，钱不多不少。
  const again = game.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(again.resources.stone, before + gift.stone, '存读后余额变了');
  assert.strictEqual(game.grantGifts(again), null, '存读后又被当成没发过');
});

check('v1 存档可迁移到 v10', function () {
  const old = game.createNewState();
  delete old.records;
  old.version = 1;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, game.SAVE_VERSION);
  assert.strictEqual('avatar' in n, false);
  assert.deepStrictEqual(n.records, {});
  assert.ok(n.skills && Object.keys(n.skills).length > 0);
});

check('v2 存档迁移后补出空纪录表、不补回已删字段', function () {
  const old = game.createNewState();
  delete old.records;
  old.version = 2;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, game.SAVE_VERSION);
  assert.deepStrictEqual(n.records, {});
  // 迁移只补该补的，不许顺手把删掉的连 S 层数再造回来。
  assert.strictEqual('sCombo' in n, false, 'v10 里不该再有 sCombo');
});

check('无 version 的老存档也能兜底', function () {
  const old = game.createNewState();
  delete old.version;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, game.SAVE_VERSION);
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
  assert.strictEqual(r.state.version, game.SAVE_VERSION);
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

check('正常离线 1 小时只结算灵力，不推进度', function () {
  const s = game.createNewState();
  const clearedBefore = Object.keys(s.skills).map(function (id) { return s.skills[id].cleared; });
  s.lastSeen = Date.now() - 3600000;
  const report = game.settleOffline(s);
  assert.ok(report && report.qi > 0, '一小时没结算出灵力');
  // 闭关不推进度：挂了也能推关，等于「参悟才是提速」是假话。
  assert.strictEqual(report.prof, undefined, '报告里还带着熟练度');
  assert.strictEqual(report.cleared, undefined, '报告里不该带进度');
  assert.deepStrictEqual(
    Object.keys(s.skills).map(function (id) { return s.skills[id].cleared; }),
    clearedBefore,
    '挂机把进度推出去了'
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

check('v5 存档升到 v10：旧 prof 摘掉，进度按旧规则折成 cleared', function () {
  const levels = require('../data/levels.js');
  const old = game.createNewState();
  old.version = 5;
  // v5 存档里没有 cleared，只有 prof——插件的模拟要真删掉这个键，
  // 否则迁移会以为「已经有进度」而跳过折算（这条曾经把断言测成了空跑）。
  delete old.skills.jian.cleared;
  old.skills.jian.prof = 812;
  old.records = { jian: { score: 42, grade: 'A', at: 1 } };
  old.sStreak = { jian: 2 };
  delete old.sCombo;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, game.SAVE_VERSION);
  assert.strictEqual('prof' in n.skills.jian, false, '熟练度字段没摘干净');
  // 折算口径：旧熟练度 → 老 200 关制的关号 → ×5 成 1000 关制。
  const want = Math.min(levels.LEVEL_MAX, (levels.legacyLevelFromProf(812) - 1) * 5);
  assert.strictEqual(n.skills.jian.cleared, want, '旧熟练度折成的关数不对');
  assert.strictEqual(n.records.jian.score, 42);
  assert.strictEqual('sCombo' in n, false, '连 S 层数没摘干净');
  assert.strictEqual('sStreak' in n, false, '旧字段没摘干净');
});

check('存档码往返带回 cleared，旧 prof / sCombo 不会复活', function () {
  const s = game.createNewState();
  s.skills.jian.unlocked = true;
  s.skills.jian.cleared = 37;
  const r = game.importSaveCode(game.exportSaveCode(s));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.skills.jian.cleared, 37, '走通关数没随存档码带回来');
  assert.strictEqual('prof' in r.state.skills.jian, false, '读档又造出了 prof');
  assert.strictEqual('sCombo' in r.state, false, '读档又造出了连 S 层数');
});

check('一局只推一关：S 与 C 都只 +1，评级不再换进度', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.unlocked = true;
  const a = game.applyPractice(s, 'jian', 'S', { level: 1, score: 90 });
  assert.strictEqual(a.advanced, true, 'S 走通当前关没推进');
  assert.strictEqual(a.clearedAfter, 1);
  const b = game.applyPractice(s, 'jian', 'C', { level: 2, score: 0 });
  assert.strictEqual(b.advanced, true, 'C 走通当前关也该推进');
  assert.strictEqual(b.clearedAfter, 2, 'C 推的关数与 S 不一样');
  assert.strictEqual(b.clearedBefore, 1);
});

check('失败、回关、目标没达成都不推进度', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.unlocked = true;
  s.skills.jian.cleared = 20;
  const f = game.applyPractice(s, 'jian', 'F', { level: 21, score: 0 });
  assert.strictEqual(f.advanced, false, '失败推进了进度');
  assert.strictEqual(s.skills.jian.cleared, 20);
  // 回关：打的是第 3 关，本门当前关是第 21 关。
  const back = game.applyPractice(s, 'jian', 'S', { level: 3, score: 0 });
  assert.strictEqual(back.advanced, false, '回关推进了进度');
  assert.strictEqual(back.levelBelowCap, true, '回关没被标出来');
  assert.strictEqual(back.levelGap, 18, '回关退了几关报错了');
  assert.strictEqual(s.skills.jian.cleared, 20, '回关推进了进度');
  // 目标没达成：不推，但也不判失败——两件事要分开报。
  const miss = game.applyPractice(s, 'jian', 'A', { level: 21, score: 0, goalMissed: true });
  assert.strictEqual(miss.advanced, false, '目标没达成也推进了');
  assert.strictEqual(miss.wiped, false, '目标没达成被当成失败');
  assert.strictEqual(s.skills.jian.cleared, 20);
});

check('走通段界关当场晋段：走通第 50 关就是小成', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.unlocked = true;
  s.skills.jian.cleared = 49;
  const r = game.applyPractice(s, 'jian', 'A', { level: 50, score: 0 });
  assert.strictEqual(r.advanced, true);
  assert.strictEqual(r.tierBefore, 1, '走通前不是入门');
  assert.strictEqual(r.tierAfter, 2, '走通第 50 关没到小成');
  assert.strictEqual(r.tierName, '小成');
  assert.strictEqual(r.tierUp, true, '晋档没被报出来');
  assert.strictEqual(r.promoted, true, '跨段没被报出来');
  assert.strictEqual(r.stageAfterName, '小成', '跨段后的段名不对');
});

check('六档门槛逐档等于段界关，段名与属性系数固定', function () {
  const world = require('../data/world.js');
  const levels = require('../data/levels.js');
  assert.deepStrictEqual(world.TIERS.map(function (t) { return t.threshold; }),
    [0].concat(levels.STAGE_GATES), '六档门槛不等于段界关');
  assert.deepStrictEqual(world.TIERS.map(function (t) { return t.name; }),
    ['未入门', '入门', '小成', '大成', '圆满', '大圆满']);
  assert.deepStrictEqual(world.TIERS.map(function (t) { return t.bonus; }),
    [0, 1, 1.8, 2.8, 4, 5]);
  // 门槛是「走通几关」：走到第 49 关还算入门，走通第 50 关才是小成。
  assert.strictEqual(game.tierIndexOfCleared(0), 0);
  assert.strictEqual(game.tierIndexOfCleared(49), 1);
  assert.strictEqual(game.tierIndexOfCleared(50), 2);
  assert.strictEqual(game.tierIndexOfCleared(1000), 5);
  assert.strictEqual(game.tierIndexOfCleared(9999), 5, '超过 1000 关不该越到第七档');
});

check('走完 1000 关即大圆满：进度封顶，灵力照扣', function () {
  const s = game.createNewState();
  s.resources.qi = 100000;   // 参悟要先付灵力，这些断言测公式、不测钱包
  s.skills.jian.unlocked = true;
  s.skills.jian.cleared = 1000;
  const before = s.resources.qi;
  const r = game.applyPractice(s, 'jian', 'S', { level: 1000, score: 123 });
  assert.strictEqual(r.advanced, false, '走完 1000 关还在推进');
  assert.strictEqual(s.skills.jian.cleared, 1000, '走完 1000 关还往前推');
  assert.strictEqual(r.tierAfter, 5);
  // 到顶再练就是纯烧气：进度不涨，气照样烧掉——所以到顶就该换门。
  assert.strictEqual(s.resources.qi, before - r.qiCost, '到顶后灵力该照扣');
  assert.ok(r.qiCost >= 1);
});

check('一门 1000 关就是 1000 局：评级再高也缩短不了这条路', function () {
  const s = game.createNewState();
  s.resources.qi = 1000000;
  s.skills.jian.unlocked = true;
  let runs = 0;
  while (s.skills.jian.cleared < 1000 && runs < 1500) {
    runs += 1;
    const g = runs % 2 ? 'S' : 'C';
    game.applyPractice(s, 'jian', g, { level: s.skills.jian.cleared + 1, score: 0 });
  }
  assert.strictEqual(runs, 1000, '走完 1000 关不是 1000 局');
  assert.strictEqual(s.skills.jian.cleared, 1000);
  assert.strictEqual(game.tierInfo(s.skills.jian.cleared).index, 5, '走完没到大圆满');
});

check('中途结束在内核里没有入口：作废靠「不进 applyPractice」保证', function () {
  // 以前这里有个 abandonRound()，唯一的活是断连 S。连 S 删掉之后它就成了空函数——
  // 留着只会让人以为「结束」还要在内核里结一次账。现在作废的保证是结构性的：
  // 页面那条路根本不调 applyPractice，进度自然一分不推。
  assert.strictEqual(game.abandonRound, undefined, 'abandonRound 这个空壳还挂着');
  assert.strictEqual(game.breakCombo, undefined, 'breakCombo 还挂着');
});

check('getSkillList 报出段位、段位色与已走通关数', function () {
  const world = require('../data/world.js');
  const s = game.createNewState();
  s.skills.jian.unlocked = true;
  s.skills.jian.cleared = 60;
  const item = game.getSkillList(s).find(function (x) { return x.id === 'jian'; });
  assert.strictEqual(item.cleared, 60);
  assert.strictEqual(item.rankName, '小成');
  assert.strictEqual(item.rankIndex, 2);
  assert.strictEqual(item.rankColor, world.TIERS[2].color);
  assert.ok(item.rankDesc && item.rankDesc.length > 0, '段位没带说明');
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
  // 真的结算一局：能进、进度照推，只是耗气 ×1.5。
  const r = game.applyPractice(s, huang[0].id, 'S', {});
  assert.strictEqual(r.ok, true, '金丹期开不了黄阶的局');
  assert.strictEqual(r.advanced, true, '金丹期练黄阶推不动一关');
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
  assert.strictEqual(migrated.version, game.SAVE_VERSION);
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
  // 真元：洞微勘禁诀加 ling，练满之后每点换 2 点上限。
  s.realmIndex = 0;
  const before = game.qiCap(s);
  s.skills.leifu = { unlocked: true, cleared: 1000, onboarded: true };
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
  for (const id of Object.keys(s.skills)) {
    s.skills[id].unlocked = true;
    s.skills[id].cleared = 1000;
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
  s.skills.jian.cleared = w.TIERS[1].threshold;     // 入门（走通 10 关）
  assert.ok(Math.abs(game.effectValue(s, 'power') - 0.06 * 0.25) < 1e-9, '入门不是 1/4');
  s.skills.jian.cleared = w.TIERS[3].threshold;     // 大成（走通 200 关）
  assert.ok(Math.abs(game.effectValue(s, 'power') - 0.06 * 0.75) < 1e-9, '大成不是 3/4');
  s.skills.jian.cleared = w.TIERS[5].threshold;     // 大圆满（走通 1000 关）
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
  s.skills.shumu = { unlocked: true, cleared: 1000, onboarded: true };  // 神识 +身法，练满
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

check('今日机缘：同一天同条、跨天换条，且不碰存档不产资源', function () {
  const world = require('../data/world.js');
  const list = world.DAILY_CHANCES;
  assert.ok(list.length >= 2, '今日机缘的文案不足两条，跨天换不起来');
  // 每条都指向一个已有动作，且文案是现代白话 + 修仙名词，不许是空壳。
  for (const c of list) {
    assert.ok(c.key && c.text && c.action, '机缘条目缺字段：' + JSON.stringify(c));
    assert.ok(!/暂且|另择|方才|尚未|无从/.test(c.text), '机缘文案出现仿古句：' + c.text);
  }
  // 确定性：同一天的两次调用必须同条（刷新页面不许换一句话）。
  const day = new Date(2026, 0, 15, 8, 0, 0).getTime();
  const a = game.dailyChance(day);
  const b = game.dailyChance(day + 3600000);
  assert.deepStrictEqual(a, b, '同一天两次调用给出了不同的机缘');
  assert.ok(list.some(function (c) { return c.key === a.key; }), '机缘返回了真源里没有的条目');
  // 跨天：七条里至少能取到两条不同的（hash 对连续日期不会恒定）。
  const seen = {};
  for (let d = 1; d <= 20; d += 1) {
    seen[game.dailyChance(day + d * 86400000).key] = true;
  }
  assert.ok(Object.keys(seen).length >= 2, '连着二十天机缘都是同一条');
  // 纯函数：调用前后存档一个字节都不动（它不许变成签到领奖系统）。
  const s = game.createNewState();
  const before = JSON.stringify(s);
  game.dailyChance(day);
  assert.strictEqual(JSON.stringify(s), before, '读一次今日机缘就改了存档');
});

check('晋段会记进日志并排在最新一条：打一局的进境可回看', function () {
  const s = game.createNewState();
  const id = 'jian';
  s.skills[id].unlocked = true;
  s.skills[id].cleared = 9; // 第 10 关走通即入「入门」
  const r = game.applyPractice(s, id, 'S', { level: 10, score: 100 });
  assert.strictEqual(r.promoted, true, '走通段末关却没报晋段');
  assert.strictEqual(r.stageAfterName, '入门', '晋段后的段名不对');
  assert.ok(s.log.length > 0 && s.log[0].kind === 'stage', '晋段没排到日志最上面');
  assert.ok(/走通第 10 关，入「入门」/.test(s.log[0].text), '晋段日志没写关号与新段名：' + s.log[0].text);
  assert.ok(s.log[0].at > 0, '晋段日志没带时间戳');
});

check('道牒数据：从 state 现算的字段与人物页同源，且不缺项', function () {
  const card = require('../utils/card.js');
  const s = game.createNewState();
  const d = card.dataOf(s, game);
  for (const k of ['worldLabel', 'worldName', 'roleName', 'equippedTitleName', 'realmName',
    'power', 'attrsLine', 'statsLine', 'myCode']) {
    assert.ok(d[k] !== undefined && d[k] !== '', '道牒缺字段 ' + k);
  }
  assert.strictEqual(d.realmName, '炼气', '道牒境界与新档不符');
  assert.strictEqual(d.topSkills.length, 3, '道牒代表功法不是三门');
  assert.ok(/习得 13 \/ 15 门/.test(d.statsLine), '道牒的习得数与图鉴不符：' + d.statsLine);
  // getTopSkills 的第一个参数是 state（不是 skillList）——曾经猜错过，这里钉住。
  assert.ok(d.topSkills[0].name && d.topSkills[0].rankName, '代表功法没有正名或段位');
});

console.log('\ngame.test: ' + passed + ' assertions passed');
