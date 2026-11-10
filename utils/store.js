'use strict';

// 单一状态源：页面只读 get()，写操作一律走 commit()，跨页面刷新靠 subscribe。
// 本地存储只是缓存；登录后的权威存档在云端，按用户隔离（见 cloud-save.js）。
// 页面仍全部使用同步 API，云端读写在后台异步完成，不阻塞交互。

const game = require('./game.js');

let state = null;
let offlineReport = null;
let cloudAdapter = null;
const listeners = [];
let saveTimer = null;
let lastCloudError = '';

function notify() {
  for (let i = 0; i < listeners.length; i += 1) {
    try { listeners[i](state); } catch (e) { /* 单个页面刷新失败不影响其他页面 */ }
  }
}

function saveLocal() {
  if (state) game.save(state);
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
  }, 1200);
}

async function flushCloud() {
  if (!cloudAdapter || !state) return { ok: false, message: '云端存档未初始化' };
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  let result;
  try {
    result = await cloudAdapter.save(state);
  } catch (e) {
    result = { ok: false, message: '云端存档保存失败，请检查网络' };
  }
  lastCloudError = result.ok ? '' : (result.message || '云端存档保存失败');
  return result;
}

function init() {
  state = game.load();
  const report = game.settleOffline(state);
  if (report) offlineReport = report;
  game.save(state);
  return state;
}

function get() {
  if (!state) init();
  return state;
}

function commit(mutator) {
  const s = get();
  let result;
  if (typeof mutator === 'function') result = mutator(s);
  saveLocal();
  scheduleCloudSave();
  notify();
  return result;
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
  scheduleCloudSave();
  notify();
  return state;
}

function reset() {
  state = game.createNewState();
  offlineReport = null;
  saveLocal();
  scheduleCloudSave();
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
// 注意：本机旧进度不会自动上云，需用户主动用「道牒」页的存档码导入。
async function hydrate() {
  if (!cloudAdapter) return { status: 'error', message: '云端存档未初始化' };
  let result;
  try {
    result = await cloudAdapter.load();
  } catch (e) {
    return { status: 'error', message: '云端存档读取失败，请检查网络' };
  }
  if (result.status === 'ok') {
    state = game.normalizeState(result.state);
    saveLocal();
    notify();
    return { status: 'ok', message: '' };
  }
  if (result.status === 'empty') {
    state = game.createNewState();
    saveLocal();
    notify();
    const created = await flushCloud();
    if (!created.ok) {
      return { status: 'error', message: created.message || '云端存档创建失败' };
    }
    return { status: 'ok', message: '' };
  }
  return result;
}

// 退出登录：清掉本机缓存与待写的云端任务，切回干净默认态，避免串号。
async function signOut() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (cloudAdapter && typeof cloudAdapter.resetRow === 'function') cloudAdapter.resetRow();
  try { wx.removeStorageSync('canwu_save_v1'); } catch (e) { /* 非小程序运行时忽略 */ }
  offlineReport = null;
  lastCloudError = '';
  state = game.createNewState();
  notify();
}

module.exports = {
  init: init,
  get: get,
  commit: commit,
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
  hydrate: hydrate,
  signOut: signOut,
};
