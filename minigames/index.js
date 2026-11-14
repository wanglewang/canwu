'use strict';

// 小游戏注册表：13 门功法各有 1 套独立玩法，另有 1 套只在境界突破时用。
// 玩法名由模块自己导出，注册表不重复维护一份名字。
// ctx.theme / ctx.twist 决定每门功法的配色与本门玄机，但玩法内核彼此独立：
// 两门同类功法（如两门剑法）也不会共用同一套盘面、交互或胜负规则。

const practiceData = require('../data/practice.js');

const MODULES = {
  click: require('./click.js'),
  hunt: require('./hunt.js'),
  memory: require('./memory.js'),
  bridge: require('./bridge.js'),
  tempo: require('./tempo.js'),
  sword: require('./sword.js'),
  lights: require('./lights.js'),
  wuxing: require('./wuxing.js'),
  mines: require('./mines.js'),
  seal: require('./seal.js'),
  link: require('./link.js'),
  blocks: require('./blocks.js'),
  match: require('./match.js'),
  charge: require('./charge.js'),
};

// 中文玩法名统一由 data/practice.js 提供，charge 是突破专用、不在功法表里，取模块自己的名字。
const GAME_NAMES = Object.assign({ charge: MODULES.charge.name }, practiceData.GAME_LABELS);

// 突破专用，不参与功法参悟。
const PRACTICE_GAMES = Object.keys(MODULES).filter(function (k) { return k !== 'charge'; });

function createGame(gameId, ctx) {
  const mod = MODULES[gameId] || MODULES.click;
  return mod.create(ctx);
}

// 首局手把手：不是每套玩法都有，模块自己导出 teach 才算有。
// 没有脚本的玩法直接跳过引导进正式局——引导是给「第一手看不懂」的玩法补的，
// 不是给所有玩法硬塞一段过场。
function hasTeach(gameId) {
  const mod = MODULES[gameId];
  return !!(mod && mod.teach && typeof mod.teach.create === 'function');
}

function createTeach(gameId, ctx) {
  const mod = MODULES[gameId];
  if (!mod || !mod.teach || typeof mod.teach.create !== 'function') return null;
  return mod.teach.create(ctx);
}

function gameName(gameId) { return GAME_NAMES[gameId] || '顺光扫斩'; }

module.exports = {
  MODULES: MODULES,
  GAME_NAMES: GAME_NAMES,
  PRACTICE_GAMES: PRACTICE_GAMES,
  createGame: createGame,
  gameName: gameName,
  hasTeach: hasTeach,
  createTeach: createTeach,
};
