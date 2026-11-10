'use strict';

// 单一状态源：页面只读 store.get()，写操作一律走 commit，保证跨页面同步与本地落盘。

const game = require('./game.js');

let state = null;
let offlineReport = null;
const listeners = [];

function notify() {
  for (let i = 0; i < listeners.length; i += 1) {
    try { listeners[i](state); } catch (e) { /* 单个页面刷新失败不影响其他页面 */ }
  }
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
  game.save(s);
  notify();
  return result;
}

function settle() {
  const s = get();
  const report = game.settleOffline(s);
  if (report) offlineReport = report;
  game.save(s);
  notify();
  return report;
}

function consumeOfflineReport() {
  const r = offlineReport;
  offlineReport = null;
  return r;
}

function flush() {
  if (state) game.save(state);
}

function replace(next) {
  state = game.normalizeState(next);
  game.save(state);
  notify();
  return state;
}

function reset() {
  state = game.createNewState();
  offlineReport = null;
  game.save(state);
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

module.exports = {
  init: init,
  get: get,
  commit: commit,
  settle: settle,
  flush: flush,
  replace: replace,
  reset: reset,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  consumeOfflineReport: consumeOfflineReport,
};
