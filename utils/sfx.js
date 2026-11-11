'use strict';

// 局内音效层：assets/sfx/*.wav（由 scripts/gen-sfx.js 合成）用 InnerAudioContext 轮播。
// 不依赖 WebAudio，开发工具与真机行为一致；没有 wx 的环境（node 测试）全部静默降级。
//
// 用法：
//   sfx.play('hit')            // 直接点名
//   sfx.tone('gold')           // good / bad / gold 三种浮字语气 → hit / miss / gold
//   sfx.setEnabled(false)      // 开关，落本地存储
//   sfx.stopAll()              // 页面隐藏时收声

const KEY = 'canwu.sfx.on';

// pool：同名音效同时最多响几路（连击时不能互相掐断）；gap：同名最小间隔，防糊成一片。
const ASSETS = {
  tap: { file: 'tap.wav', volume: 0.42, pool: 3, gap: 26 },
  hit: { file: 'hit.wav', volume: 0.55, pool: 3, gap: 38 },
  miss: { file: 'miss.wav', volume: 0.5, pool: 2, gap: 90 },
  gold: { file: 'gold.wav', volume: 0.6, pool: 2, gap: 80 },
  tick: { file: 'tick.wav', volume: 0.4, pool: 2, gap: 60 },
  go: { file: 'go.wav', volume: 0.5, pool: 1, gap: 120 },
  clear: { file: 'clear.wav', volume: 0.55, pool: 1, gap: 300 },
  settle: { file: 'settle.wav', volume: 0.48, pool: 1, gap: 300 },
  fail: { file: 'fail.wav', volume: 0.5, pool: 1, gap: 300 },
};

// 常用音效先建好上下文，避免第一次落子要等实例化。
const WARM = ['tap', 'hit', 'miss', 'gold', 'tick', 'go'];

const TONE = { good: 'hit', bad: 'miss', gold: 'gold' };

let enabledCache = null;
const pools = {};
const lastAt = {};
let warmed = false;

function supported() {
  return typeof wx !== 'undefined' && typeof wx.createInnerAudioContext === 'function';
}

function isEnabled() {
  if (enabledCache !== null) return enabledCache;
  enabledCache = true;
  try {
    const v = wx.getStorageSync(KEY);
    if (v === 0 || v === false || v === '0' || v === 'off') enabledCache = false;
  } catch (e) { /* 存储不可用就按默认开 */ }
  return enabledCache;
}

function setEnabled(on) {
  enabledCache = !!on;
  try { wx.setStorageSync(KEY, enabledCache ? 1 : 0); } catch (e) { /* 忽略 */ }
  if (!enabledCache) stopAll();
  return enabledCache;
}

function toggle() {
  return setEnabled(!isEnabled());
}

function makePool(name) {
  const cfg = ASSETS[name];
  const list = [];
  for (let i = 0; i < cfg.pool; i += 1) {
    let audio = null;
    try {
      audio = wx.createInnerAudioContext();
      audio.src = '/assets/sfx/' + cfg.file;
      audio.volume = cfg.volume;
      // 静音键不该吃掉音效：这类短促反馈玩家是按「有声音」在玩。
      audio.obeyMuteSwitch = false;
      audio.autoplay = false;
      audio.onError(function () { /* 某个机型播不了就静音，不影响玩法 */ });
    } catch (e) {
      audio = null;
    }
    if (audio) list.push(audio);
  }
  const pool = { list: list, cursor: 0 };
  pools[name] = pool;
  return pool;
}

function warm() {
  if (warmed || !isEnabled() || !supported()) return;
  warmed = true;
  for (let i = 0; i < WARM.length; i += 1) {
    if (!pools[WARM[i]]) makePool(WARM[i]);
  }
}

function play(name) {
  if (!name || !ASSETS[name]) return;
  if (!isEnabled() || !supported()) return;
  const now = Date.now();
  if (lastAt[name] && now - lastAt[name] < ASSETS[name].gap) return;
  lastAt[name] = now;

  const pool = pools[name] || makePool(name);
  if (!pool.list.length) return;
  const audio = pool.list[pool.cursor % pool.list.length];
  pool.cursor += 1;
  try {
    audio.stop();
    audio.play();
  } catch (e) { /* 播不动就算了 */ }
}

// 浮字语气直接转音效，页面不用自己查表。
function tone(name) {
  play(TONE[name] || 'tap');
}

function stopAll() {
  const keys = Object.keys(pools);
  for (let i = 0; i < keys.length; i += 1) {
    const list = pools[keys[i]].list;
    for (let j = 0; j < list.length; j += 1) {
      try { list[j].stop(); } catch (e) { /* 忽略 */ }
    }
  }
}

function destroy() {
  stopAll();
  const keys = Object.keys(pools);
  for (let i = 0; i < keys.length; i += 1) {
    const list = pools[keys[i]].list;
    for (let j = 0; j < list.length; j += 1) {
      try { list[j].destroy(); } catch (e) { /* 忽略 */ }
    }
    delete pools[keys[i]];
  }
  warmed = false;
}

module.exports = {
  ASSETS: ASSETS,
  TONE: TONE,
  supported: supported,
  isEnabled: isEnabled,
  setEnabled: setEnabled,
  toggle: toggle,
  warm: warm,
  play: play,
  tone: tone,
  stopAll: stopAll,
  destroy: destroy,
};
