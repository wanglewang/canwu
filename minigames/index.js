'use strict';

// 小游戏注册表：15 门功法各有 1 套独立玩法，另有 1 套只在境界突破时用。
// 玩法名由模块自己导出，注册表不重复维护一份名字。
// ctx.theme / ctx.twist 决定每门功法的配色与本门玄机，但玩法内核彼此独立：
// 同类功法（如三门阵法、三门心法）也不会共用同一套盘面、交互或胜负规则。

const practiceData = require('../data/practice.js');

const MODULES = {
  click: require('./click.js'),
  memory: require('./memory.js'),
  tempo: require('./tempo.js'),
  lights: require('./lights.js'),
  mines: require('./mines.js'),
  seal: require('./seal.js'),
  link: require('./link.js'),
  blocks: require('./blocks.js'),
  match: require('./match.js'),
  // 六门「看一眼就会玩」的经典盘面玩法，都挂黄阶。
  sudoku: require('./sudoku.js'),
  merge: require('./merge.js'),
  schulte: require('./schulte.js'),
  klotski: require('./klotski.js'),
  pushbox: require('./pushbox.js'),
  biggest: require('./biggest.js'),
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

// 触感调性：玩法模块自己声明（如 haptic.bad = 'light' 表示误判轻震），没声明就是空表。
// 特效层据此决定震不震、震多重——「哪一门误判该震」是玩法的反馈设计，不是页面该认的门名。
function hapticOf(gameId) {
  const mod = MODULES[gameId];
  return mod && mod.haptic && typeof mod.haptic === 'object' ? mod.haptic : {};
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

// 本段 S/A/B/C 四条线。各玩法自己导出 lines()，说明页从这里取，
// 与局内 HUD、结算用同一份算法——门槛只许有一个出处。
function gradeLines(gameId, params, gear) {
  const mod = MODULES[gameId];
  if (!mod || typeof mod.lines !== 'function') return null;
  return mod.lines(params || {}, gear || 'normal');
}

module.exports = {
  MODULES: MODULES,
  GAME_NAMES: GAME_NAMES,
  PRACTICE_GAMES: PRACTICE_GAMES,
  createGame: createGame,
  hapticOf: hapticOf,
  gameName: gameName,
  gradeLines: gradeLines,
  hasTeach: hasTeach,
  createTeach: createTeach,
};
