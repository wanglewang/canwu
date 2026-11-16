'use strict';

// 局内音效层：assets/sfx/*.wav（由 scripts/gen-sfx.js 合成）用 InnerAudioContext 轮播。
// 不依赖 WebAudio，开发工具与真机行为一致；没有 wx 的环境（node 测试）全部静默降级。
//
// 用法：
//   sfx.play('hit')            // 直接点名
//   sfx.tone('gold')           // good / bad / gold 三种浮字语气 → hit / miss / gold
//   sfx.setLevel('off')        // 轻 / 中 / 关，落本地存储
//   sfx.stopAll()              // 页面隐藏时收声

const KEY = 'canwu.sfx.on';          // 旧版开关，保留兼容
const LEVEL_KEY = 'canwu.sfx.level';

// 轻 / 中 / 关：默认「轻」。觉得吵可以再降一档或关掉，不用改代码。
const LEVELS = { low: 0.75, mid: 1, off: 0 };

// 音量宁小勿大：wav 峰值只有 0.52，这里再压一档。
// pool 一律 1：连击时不允许同一个音叠三路（第一版「脑子嗡嗡」的主因）。
// gap 是同名最小间隔；VOICE 组内还共用一路声道，新判定音会掐掉上一个。
const ASSETS = {
  tap: { file: 'tap.wav', volume: 0.26, pool: 1, gap: 45 },
  hit: { file: 'hit.wav', volume: 0.34, pool: 1, gap: 95 },
  miss: { file: 'miss.wav', volume: 0.3, pool: 1, gap: 170 },
  gold: { file: 'gold.wav', volume: 0.36, pool: 1, gap: 150 },
  tick: { file: 'tick.wav', volume: 0.26, pool: 1, gap: 120 },
  // 节拍：节律判定每一格一下。
  // 音量不能按「比 tick 更轻」来给：tick.wav 峰值只有 0.52，再乘 0.15 再乘「轻」档 0.75
  // 只剩 0.058——真机上等于没响，玩家报的就是这一条。节拍是这门唯一的输入通道，
  // 它比判定音更需要被听见，给到与判定音同一档。
  // 它不进 VOICE 组、也不占全局间隔——拍子要准，且不许把紧随其后的判定音掐掉。
  beat: { file: 'beat.wav', volume: 0.36, pool: 1, gap: 90 },
  // 小节头那一格用重音。重音**不是靠音量**（播放音量上限 0.4，再压上去就是硬砸），
  // 而是低八度的一记「咚」：一串哒声里没有高低，玩家数不出小节线在哪，
  // 第三段起提示轨只剩小节头，那就没有东西可以锚定第几小节了。
  beataccent: { file: 'beataccent.wav', volume: 0.38, pool: 1, gap: 90 },
  go: { file: 'go.wav', volume: 0.3, pool: 1, gap: 220 },
  clear: { file: 'clear.wav', volume: 0.34, pool: 1, gap: 400 },
  settle: { file: 'settle.wav', volume: 0.3, pool: 1, gap: 400 },
  fail: { file: 'fail.wav', volume: 0.3, pool: 1, gap: 400 },
};

// 判定 / 结算音共用一路声道：任何时刻最多一个在响，绝不叠成和弦。
const VOICE = ['hit', 'miss', 'gold', 'go', 'clear', 'settle', 'fail', 'tick'];
// 两声之间的全局最小间隔（tap 跟手，单独放宽）。
const GLOBAL_GAP = 60;
const TAP_GAP = 28;

// 常用音效先建好上下文，避免第一次落子要等实例化。
// beat / beataccent 必须在这里：它们是「开局第一拍就要响」的音，而新建 InnerAudioContext
// 后立刻 play，在真机上首声经常直接丢掉（src 还没加载完）。节律这一门要是首拍就哑，
// 玩家根本进不去节奏——这不是「偶尔少一声」，是整门玩法失效。
const WARM = ['tap', 'hit', 'miss', 'gold', 'tick', 'go', 'beat', 'beataccent'];

const TONE = { good: 'hit', bad: 'miss', gold: 'gold' };

let levelCache = null;
const pools = {};
const lastAt = {};
let lastAnyAt = 0;
let warmed = false;

function supported() {
  return typeof wx !== 'undefined' && typeof wx.createInnerAudioContext === 'function';
}

function level() {
  if (levelCache !== null) return levelCache;
  levelCache = 'low';
  try {
    const v = wx.getStorageSync(LEVEL_KEY);
    if (Object.prototype.hasOwnProperty.call(LEVELS, v)) levelCache = v;
    else {
      const old = wx.getStorageSync(KEY);
      if (old === 0 || old === false || old === '0' || old === 'off') levelCache = 'off';
    }
  } catch (e) { /* 存储不可用就按默认「轻」 */ }
  return levelCache;
}

function isEnabled() {
  return level() !== 'off';
}

// 已经在响的池也要跟着改音量，不能只对新生成的生效。
function applyVolume() {
  const k = LEVELS[level()];
  const keys = Object.keys(pools);
  for (let i = 0; i < keys.length; i += 1) {
    const cfg = ASSETS[keys[i]];
    if (!cfg) continue;
    const list = pools[keys[i]].list;
    for (let j = 0; j < list.length; j += 1) {
      try { list[j].volume = cfg.volume * k; } catch (e) { /* 忽略 */ }
    }
  }
}

function setLevel(next) {
  if (!Object.prototype.hasOwnProperty.call(LEVELS, next)) return level();
  levelCache = next;
  try {
    wx.setStorageSync(LEVEL_KEY, next);
    wx.setStorageSync(KEY, next === 'off' ? 0 : 1);
  } catch (e) { /* 忽略 */ }
  if (next === 'off') stopAll();
  else applyVolume();
  return next;
}

function makePool(name) {
  const cfg = ASSETS[name];
  const list = [];
  for (let i = 0; i < cfg.pool; i += 1) {
    let audio = null;
    try {
      audio = wx.createInnerAudioContext();
      audio.src = '/assets/sfx/' + cfg.file;
      audio.volume = cfg.volume * LEVELS[level()];
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

// 掐掉声道里其它还在响的音；只有一声能留下来。
function cutVoice(except) {
  for (let i = 0; i < VOICE.length; i += 1) {
    const key = VOICE[i];
    if (key === except || !pools[key]) continue;
    const list = pools[key].list;
    for (let j = 0; j < list.length; j += 1) {
      try { list[j].stop(); } catch (e) { /* 忽略 */ }
    }
  }
}

function play(name) {
  if (!name || !ASSETS[name]) return;
  if (!isEnabled() || !supported()) return;
  const now = Date.now();
  if (lastAt[name] && now - lastAt[name] < ASSETS[name].gap) return;
  // 节拍音是「背景心跳」，两头都让路：既不吞紧接着的判定音，也不被它吞掉。
  // 否则玩家踩在拍点上点击时，那一下反而没有声音。
  if (name !== 'beat') {
    const globalGap = name === 'tap' ? TAP_GAP : GLOBAL_GAP;
    if (now - lastAnyAt < globalGap) return;
    lastAnyAt = now;
  }
  lastAt[name] = now;

  if (VOICE.indexOf(name) >= 0) cutVoice(name);
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

module.exports = {
  level: level,
  setLevel: setLevel,
  warm: warm,
  play: play,
  tone: tone,
  stopAll: stopAll,
};
