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

check('新档版本为 2 且带头像字段', function () {
  const s = game.createNewState();
  assert.strictEqual(s.version, 2);
  assert.strictEqual(s.avatar, '');
});

check('v1 存档可迁移到 v2', function () {
  const old = game.createNewState();
  delete old.avatar;
  old.version = 1;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 2);
  assert.strictEqual(n.avatar, '');
  assert.ok(n.skills && Object.keys(n.skills).length > 0);
});

check('无 version 的老存档也能兜底', function () {
  const old = game.createNewState();
  delete old.version;
  const n = game.normalizeState(old);
  assert.strictEqual(n.version, 2);
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
  assert.strictEqual(r.state.version, 2);
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

console.log('\ngame.test: ' + passed + ' assertions passed');
