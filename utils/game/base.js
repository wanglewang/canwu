'use strict';

// 共用底座：data 依赖、存档常量、存储读写、时间与校验小工具
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。
// 本层不依赖任何界面，所有内容由 data/ 下的世界数据驱动。

const worldData = require('../../data/world.js');
const skillData = require('../../data/skills.js');
const practiceData = require('../../data/practice.js');
const economyData = require('../../data/economy.js');
const levelData = require('../../data/levels.js');
const guideData = require('../../data/guides.js');
const opponentData = require('../../data/opponents.js');
const moveData = require('../../data/moves.js');
const titleData = require('../../data/titles.js');
const achievementData = require('../../data/achievements.js');
const copy = require('../../data/copy.js');

const STORAGE_KEY = 'canwu_save_v1';
const SAVE_PREFIX = 'CANWU1:';
const BATTLE_PREFIX = 'CW1-';
const SAVE_VERSION = 9;
// 连 S 叠倍率：同一门功法连续完成 S，本局熟练度 = round(34 × 1.5^(层数-1))，10 层封顶。
// 层数真源在 world.COMBO_MAX；每门各算各的，非 S / 失败 / 主动结束都归零，
// 低档局不参与连 S（层数原样保留）。旧的「三连 S 直接晋级」已整体退役。

function readStorage(key) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) return wx.getStorageSync(key);
  } catch (e) { /* 存储不可用时退回内存态 */ }
  return null;
}

function writeStorage(key, value) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(key, value);
  } catch (e) { /* 忽略写入失败，不阻断游戏 */ }
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function todayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function checkCode(raw) {
  return hashString(raw).toString(36).slice(-4).toUpperCase();
}

module.exports = {
  BATTLE_PREFIX: BATTLE_PREFIX,
  SAVE_PREFIX: SAVE_PREFIX,
  SAVE_VERSION: SAVE_VERSION,
  STORAGE_KEY: STORAGE_KEY,
  achievementData: achievementData,
  checkCode: checkCode,
  copy: copy,
  economyData: economyData,
  guideData: guideData,
  hashString: hashString,
  levelData: levelData,
  moveData: moveData,
  opponentData: opponentData,
  pad2: pad2,
  practiceData: practiceData,
  readStorage: readStorage,
  skillData: skillData,
  titleData: titleData,
  todayKey: todayKey,
  worldData: worldData,
  writeStorage: writeStorage,
};
