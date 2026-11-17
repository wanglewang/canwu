'use strict';

// 内核已按关注点拆到 utils/game/ 下（state / profs / idle / settle / battle / realm / view）。
// 这里只做转发：所有 require('…/utils/game.js') 的调用点一个字都不用改。
module.exports = require('./game/index.js');
