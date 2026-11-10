'use strict';

// 单一状态源：页面只读 get()，写操作一律走 commit()，跨页面刷新靠 subscribe。
// 本地存储是同步落盘的权威缓存；云端是跨设备的权威存档。
// 每次写本地都留一个 pending 标记，云端确认成功后才清除——这样即使切后台被冻结、
// 断网或云写入失败，下次启动也会先补写，不会静默丢档。
// 页面仍全部使用同步 API，云端读写在后台异步完成，不阻塞交互。

const game = require('./game.js');

const PENDING_KEY = 'canwu_pending_v1';
const SYNC_KEY = 'canwu_sync_v1';
const DEBOUNCE_MS = 1200;

let state = null;
let offlineReport = null;
let cloudAdapter = null;
const listeners = [];
let saveTimer = null;
let lastCloudError = '';
let hasConflict = false;
let cloudVersion = null;
let serverUpdatedAt = '';
let syncing = false;
let syncingPromise = null;

function notify() {
  for (let i = 0; i < listeners.length; i += 1) {
    try { listeners[i](state); } catch (e) { /* 单个页面刷新失败不影响其他页面 */ }
  }
}

function readPending() {
  const v = game.readStorage(PENDING_KEY);
  return v && typeof v === 'object' ? v : null;
}

function markPending() {
  game.writeStorage(PENDING_KEY, { at: Date.now(), baseVersion: cloudVersion });
}

function clearPending() {
  try {
    if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(PENDING_KEY);
  } catch (e) { /* 非小程序运行时忽略 */ }
}

function saveLocal() {
  if (!state) return;
  game.save(state);
  markPending();
}

function recordSync(ok, message) {
  lastCloudError = ok ? '' : (message || '云端存档保存失败');
  hasConflict = false;
  if (ok) {
    serverUpdatedAt = new Date().toISOString();
    clearPending();
    game.writeStorage(SYNC_KEY, { at: Date.now(), version: cloudVersion });
  }
  game.writeStorage('canwu_sync_error_v1', lastCloudError);
}

function getSyncStatus() {
  const meta = game.readStorage(SYNC_KEY);
  return {
    pending: !!readPending(),
    error: lastCloudError,
    conflict: hasConflict,
    syncing: syncing,
    lastSyncedAt: meta && meta.at ? meta.at : 0,
    serverUpdatedAt: serverUpdatedAt,
  };
}

function setCloudAdapter(adapter) {
  cloudAdapter = adapter;
}

function getCloudError() {
  return lastCloudError;
}

function scheduleCloudSave() {
  if (!cloudAdapter) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveTimer = null;
    flushCloud();
  }, DEBOUNCE_MS);
}

// 并发的 flush 复用同一个在途请求，既不丢写，也不会让调用方拿到「正在同步中」这种假失败。
async function flushCloud() {
  if (!cloudAdapter || !state) return { ok: false, message: '云端存档未初始化' };
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (syncingPromise) return syncingPromise;
  syncing = true;
  syncingPromise = (async function () {
    let result;
    try {
      result = await cloudAdapter.save(state, cloudVersion);
    } catch (e) {
      result = { ok: false, message: '云端存档保存失败，请检查网络' };
    }
    if (result && result.ok) {
      if (result.version !== undefined && result.version !== null) cloudVersion = result.version;
      else if (typeof cloudAdapter.getVersion === 'function') cloudVersion = cloudAdapter.getVersion();
      if (result.updatedAt) serverUpdatedAt = result.updatedAt;
      recordSync(true, '');
    } else if (result && result.conflict) {
      hasConflict = true;
      lastCloudError = result.message || '另一台设备更新了这份进度';
      game.writeStorage('canwu_sync_error_v1', lastCloudError);
    } else {
      recordSync(false, result ? result.message : '云端存档保存失败');
    }
    notify();
    return result;
  })();
  try {
    return await syncingPromise;
  } finally {
    syncingPromise = null;
    syncing = false;
  }
}

function init() {
  state = game.load();
  const report = game.settleOffline(state);
  if (report) offlineReport = report;
  game.save(state);
  const err = game.readStorage('canwu_sync_error_v1');
  if (typeof err === 'string') lastCloudError = err;
  return state;
}

function get() {
  if (!state) init();
  return state;
}

function commit(mutator, options) {
  const s = get();
  let result;
  if (typeof mutator === 'function') result = mutator(s);
  saveLocal();
  if (options && options.immediate) flushCloud();
  else scheduleCloudSave();
  notify();
  return result;
}

// 关键节点（突破、结算、领奖、改名、导入）用它：跳过防抖窗口立即回写。
// 即使这次请求被系统冻结，pending 标记仍会在下次启动补写。
function commitCritical(mutator) {
  return commit(mutator, { immediate: true });
}

function settle() {
  const s = get();
  const report = game.settleOffline(s);
  if (report) offlineReport = report;
  saveLocal();
  scheduleCloudSave();
  notify();
  return report;
}

function consumeOfflineReport() {
  const r = offlineReport;
  offlineReport = null;
  return r;
}

function flush() {
  saveLocal();
  return flushCloud();
}

function replace(next) {
  state = game.normalizeState(next);
  saveLocal();
  flushCloud();          // 导入存档是破坏性操作，立即落云端，不走防抖窗口
  notify();
  return state;
}

function reset() {
  state = game.createNewState();
  offlineReport = null;
  saveLocal();
  flushCloud();
  notify();
  return state;
}

function subscribe(fn) {
  if (listeners.indexOf(fn) < 0) listeners.push(fn);
}

function unsubscribe(fn) {
  const i = listeners.indexOf(fn);
  if (i >= 0) listeners.splice(i, 1);
}

// 登录成功后调用：用云端存档覆盖本地缓存；云端还没有存档时建立一份新档。
// 若上次退出时有未确认的本地改动，先把本地补写成功再读云端，避免把进度覆盖掉。
// 注意：本机旧进度不会自动上云，需用户主动用「道牒」页的存档码导入。
async function hydrate() {
  if (!cloudAdapter) return { status: 'error', message: '云端存档未初始化' };

  const pending = readPending();
  if (pending) {
    const pushed = await flushCloud();
    if (pushed && pushed.conflict) {
      return { status: 'conflict', message: pushed.message };
    }
    if (!pushed || !pushed.ok) {
      // 网络不通：保留本机这份状态，允许离线继续玩，绝不拿云端旧档覆盖。
      return { status: 'offline', message: '暂时无法连接云端，已先用本机进度' };
    }
  }

  let result;
  try {
    result = await cloudAdapter.load();
  } catch (e) {
    return { status: 'offline', message: '云端存档读取失败，已先用本机进度' };
  }

  if (result.status === 'signed-out') return result;
  if (result.status === 'error') {
    return { status: 'offline', message: '云端存档读取失败，已先用本机进度' };
  }

  if (result.status === 'ok') {
    state = game.normalizeState(result.state);
    cloudVersion = result.version === undefined ? null : result.version;
    if (result.updatedAt) serverUpdatedAt = result.updatedAt;
    game.save(state);
    clearPending();
    notify();
    return { status: 'ok', message: '' };
  }

  if (result.status === 'empty') {
    state = game.createNewState();
    game.save(state);
    cloudVersion = null;
    const created = await flushCloud();
    if (!created || !created.ok) {
      return { status: 'offline', message: created && created.message ? created.message : '云端存档创建失败' };
    }
    notify();
    return { status: 'ok', message: '' };
  }
  return { status: 'offline', message: result.message || '云端暂时不可用，已先用本机进度' };
}

// 冲突处理：useCloud=true 放弃本机未同步改动、拉回云端；false 则用本机强制覆盖云端。
async function resolveConflict(useCloud) {
  if (!cloudAdapter) return { ok: false, message: '云端存档未初始化' };
  if (useCloud) {
    const result = await cloudAdapter.load();
    if (result.status !== 'ok') return { ok: false, message: result.message || '读取云端进度失败' };
    state = game.normalizeState(result.state);
    cloudVersion = result.version === undefined ? null : result.version;
    if (result.updatedAt) serverUpdatedAt = result.updatedAt;
    game.save(state);
    clearPending();
    hasConflict = false;
    lastCloudError = '';
    game.writeStorage('canwu_sync_error_v1', '');
    notify();
    return { ok: true, message: '' };
  }
  const forced = typeof cloudAdapter.forceOverwrite === 'function'
    ? await cloudAdapter.forceOverwrite(state)
    : await flushCloud();
  if (forced && forced.ok) {
    if (forced.version !== undefined && forced.version !== null) cloudVersion = forced.version;
    hasConflict = false;
    recordSync(true, '');
    notify();
    return { ok: true, message: '' };
  }
  return { ok: false, message: forced && forced.message ? forced.message : '覆盖失败' };
}

// 退出登录：清掉本机缓存、待写标记与同步状态，切回干净默认态，避免串号。
async function signOut() {
  // 先等在途写入结束，避免它完成后又把同步元数据写回来。
  if (syncingPromise) {
    try { await syncingPromise; } catch (e) { /* 在途写入失败也要继续登出 */ }
  }
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (cloudAdapter && typeof cloudAdapter.resetRow === 'function') cloudAdapter.resetRow();
  clearPending();
  for (const key of [game.STORAGE_KEY, SYNC_KEY, 'canwu_sync_error_v1']) {
    try {
      if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(key);
    } catch (e) { /* 非小程序运行时忽略 */ }
  }
  offlineReport = null;
  lastCloudError = '';
  hasConflict = false;
  cloudVersion = null;
  serverUpdatedAt = '';
  state = game.createNewState();
  notify();
}

module.exports = {
  init: init,
  get: get,
  commit: commit,
  commitCritical: commitCritical,
  settle: settle,
  flush: flush,
  flushCloud: flushCloud,
  replace: replace,
  reset: reset,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  consumeOfflineReport: consumeOfflineReport,
  setCloudAdapter: setCloudAdapter,
  getCloudError: getCloudError,
  getSyncStatus: getSyncStatus,
  hydrate: hydrate,
  resolveConflict: resolveConflict,
  signOut: signOut,
};
