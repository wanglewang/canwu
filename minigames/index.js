'use strict';

// 小游戏注册表。首版 4 个底层玩法 + 1 个境界突破专用玩法。
// 换网文包装只改 data/practice.js，不动这里。

const MODULES = {
  click: require('./click.js'),
  memory: require('./memory.js'),
  lights: require('./lights.js'),
  mines: require('./mines.js'),
  charge: require('./charge.js'),
};

const GAME_NAMES = {
  click: '限时点击',
  memory: '记忆序列',
  lights: '点灯',
  mines: '扫雷',
  charge: '蓄力停区',
};

function createGame(gameId, ctx) {
  const mod = MODULES[gameId] || MODULES.click;
  return mod.create(ctx);
}

function gameName(gameId) { return GAME_NAMES[gameId] || '限时点击'; }

module.exports = {
  MODULES: MODULES,
  GAME_NAMES: GAME_NAMES,
  createGame: createGame,
  gameName: gameName,
};
