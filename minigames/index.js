'use strict';

// 小游戏注册表。5 类底层玩法，10 门功法各挂一类中的一种变数（twist）。
// 换包装只改 data/practice.js 与 minigames/theme.js，不动玩法内核。

const MODULES = {
  click: require('./click.js'),
  memory: require('./memory.js'),
  lights: require('./lights.js'),
  mines: require('./mines.js'),
  tempo: require('./tempo.js'),
  charge: require('./charge.js'),
};

const GAME_NAMES = {
  click: '追光点击',
  memory: '记序复现',
  lights: '阵灯推演',
  mines: '辨纹探禁',
  tempo: '节律判定',
  charge: '蓄力停区',
};

function createGame(gameId, ctx) {
  const mod = MODULES[gameId] || MODULES.click;
  return mod.create(ctx);
}

function gameName(gameId) { return GAME_NAMES[gameId] || '追光点击'; }

module.exports = {
  MODULES: MODULES,
  GAME_NAMES: GAME_NAMES,
  createGame: createGame,
  gameName: gameName,
};
