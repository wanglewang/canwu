'use strict';

// 存档云同步行为断言：用内存 wx 存储 + 可编排的假云端适配器，不触网。
// 零依赖，直接 node tests/store.test.js 即可跑。
const assert = require('assert');

const mem = {};
global.wx = {
  getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : ''; },
  setStorageSync: function (k, v) { mem[k] = v; },
  removeStorageSync: function (k) { delete mem[k]; },
};

const game = require('../utils/game.js');
const store = require('../utils/store.js');

function clearMem() {
  for (const k of Object.keys(mem)) delete mem[k];
}

function makeAdapter(plan) {
  const calls = { save: 0, load: 0, force: 0 };
  return {
    calls: calls,
    setPlan: function (next) { plan = next; },
    load: async function () {
      calls.load += 1;
      return plan.load();
    },
    save: async function (state, version) {
      calls.save += 1;
      return plan.save(state, version);
    },
    forceOverwrite: async function (state) {
      calls.force += 1;
      return plan.force ? plan.force(state) : { ok: true, version: 1, message: '' };
    },
    resetRow: function () {},
    getVersion: function () { return 0; },
  };
}

const okSave = function () { return { ok: true, conflict: false, message: '', version: 1, updatedAt: new Date().toISOString() }; };

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('OK  ' + name);
}

async function main() {
  await check('commit 会留下待同步标记', async function () {
    clearMem();
    const a = makeAdapter({ save: okSave, load: async function () { return { status: 'empty' }; } });
    store.setCloudAdapter(a);
    store.init();
    store.commit(function (s) { s.resources.qi += 7; });
    assert.strictEqual(store.getSyncStatus().pending, true);
    await store.flushCloud();
  });

  await check('云端确认成功后清除待同步标记', async function () {
    clearMem();
    const a = makeAdapter({ save: okSave, load: async function () { return { status: 'empty' }; } });
    store.setCloudAdapter(a);
    store.init();
    store.commitCritical(function (s) { s.resources.qi += 1; });
    const r = await store.flushCloud();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(store.getSyncStatus().pending, false);
    assert.strictEqual(store.getSyncStatus().error, '');
    assert.ok(store.getSyncStatus().lastSyncedAt > 0);
  });

  await check('写失败时保留标记并把错误暴露给页面', async function () {
    clearMem();
    const a = makeAdapter({
      save: function () { return { ok: false, conflict: false, message: '网络断开' }; },
      load: async function () { return { status: 'empty' }; },
    });
    store.setCloudAdapter(a);
    store.init();
    store.commitCritical(function (s) { s.resources.qi += 1; });
    const r = await store.flushCloud();
    assert.strictEqual(r.ok, false);
    assert.strictEqual(store.getSyncStatus().pending, true);
    assert.strictEqual(store.getSyncStatus().error, '网络断开');
    assert.strictEqual(store.getCloudError(), '网络断开');
  });

  await check('版本冲突被标记为冲突而不是静默覆盖', async function () {
    clearMem();
    const a = makeAdapter({
      save: function () { return { ok: false, conflict: true, message: '另一台设备更新了这份进度' }; },
      load: async function () { return { status: 'empty' }; },
    });
    store.setCloudAdapter(a);
    store.init();
    store.commitCritical(function (s) { s.resources.qi += 1; });
    await store.flushCloud();
    assert.strictEqual(store.getSyncStatus().conflict, true);
    assert.ok(store.getSyncStatus().error.indexOf('另一台设备') >= 0);
  });

  await check('断网补写失败时 hydrate 保留本机进度并返回 offline', async function () {
    clearMem();
    const a = makeAdapter({
      save: function () { return { ok: false, conflict: false, message: '网络断开' }; },
      load: async function () { return { status: 'error', message: '网络断开' }; },
    });
    store.setCloudAdapter(a);
    store.init();
    store.commitCritical(function (s) { s.roleName = '本机道友'; });
    const result = await store.hydrate();
    assert.strictEqual(result.status, 'offline');
    assert.strictEqual(store.get().roleName, '本机道友');
    assert.strictEqual(store.getSyncStatus().pending, true);
  });

  await check('云端存档存在时 hydrate 用云端覆盖本地', async function () {
    clearMem();
    const cloudState = game.createNewState();
    cloudState.roleName = '云端道友';
    cloudState.resources.qi = 999;
    const a = makeAdapter({
      save: okSave,
      load: async function () { return { status: 'ok', state: cloudState, version: 5, updatedAt: new Date().toISOString() }; },
    });
    store.setCloudAdapter(a);
    store.init();
    const result = await store.hydrate();
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(store.get().roleName, '云端道友');
    assert.strictEqual(store.get().resources.qi, 999);
  });

  await check('云端无档时 hydrate 立刻建档', async function () {
    clearMem();
    const a = makeAdapter({
      save: okSave,
      load: async function () { return { status: 'empty', message: '' }; },
    });
    store.setCloudAdapter(a);
    store.init();
    const result = await store.hydrate();
    assert.strictEqual(result.status, 'ok');
    assert.ok(a.calls.save > 0);
    assert.strictEqual(store.getSyncStatus().pending, false);
  });

  await check('未登录时 hydrate 返回 signed-out 且不写云端', async function () {
    clearMem();
    const a = makeAdapter({
      save: okSave,
      load: async function () { return { status: 'signed-out', message: '请先登录' }; },
    });
    store.setCloudAdapter(a);
    store.init();
    const result = await store.hydrate();
    assert.strictEqual(result.status, 'signed-out');
    assert.strictEqual(a.calls.save, 0);
  });

  await check('冲突时可用本机强制覆盖并清除标记', async function () {
    clearMem();
    const a = makeAdapter({
      save: function () { return { ok: false, conflict: true, message: '冲突' }; },
      load: async function () { return { status: 'empty' }; },
      force: function () { return { ok: true, version: 9, message: '' }; },
    });
    store.setCloudAdapter(a);
    store.init();
    store.commitCritical(function (s) { s.roleName = '本机优先'; });
    await store.flushCloud();
    const r = await store.resolveConflict(false);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(a.calls.force, 1);
    assert.strictEqual(store.getSyncStatus().conflict, false);
    assert.strictEqual(store.getSyncStatus().pending, false);
  });

  await check('登出清空本机缓存、标记与错误', async function () {
    clearMem();
    const a = makeAdapter({ save: okSave, load: async function () { return { status: 'empty' }; } });
    store.setCloudAdapter(a);
    store.init();
    store.commitCritical(function (s) { s.resources.qi += 3; });
    await store.flushCloud();
    await store.signOut();
    assert.strictEqual(mem[game.STORAGE_KEY], undefined);
    assert.strictEqual(mem.canwu_pending_v1, undefined);
    assert.strictEqual(mem.canwu_sync_v1, undefined);
    assert.strictEqual(store.getSyncStatus().error, '');
  });

  await check('commitCritical 不等待防抖窗口', async function () {
    clearMem();
    const a = makeAdapter({ save: okSave, load: async function () { return { status: 'empty' }; } });
    store.setCloudAdapter(a);
    store.init();
    store.commitCritical(function (s) { s.resources.qi += 1; });
    assert.ok(a.calls.save >= 1, 'commitCritical 应立即触发一次云端写入');
    await store.flushCloud();
  });

  console.log('\nstore.test: ' + passed + ' assertions passed');
  await store.signOut();
  process.exit(0);
}

main().catch(function (e) {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
