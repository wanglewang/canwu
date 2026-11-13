'use strict';

// 统一的分享文案：标题带当前境界与战力，落地到洞府页。
// 不指定 imageUrl，由微信截取当前页面；canvas 分享图仍走「生成道牒图」单独分享。

const engine = require('./game.js');

function titleOf(state) {
  const ov = engine.getOverview(state);
  return '我在《参悟》修到「' + ov.realmName + '」，战力 ' + ov.power + '，来切磋吗？';
}

function appMessage(state) {
  return {
    title: titleOf(state),
    path: '/pages/index/index?from=share',
  };
}

function timeline(state) {
  return {
    title: '参悟 · ' + titleOf(state),
    query: 'from=timeline',
  };
}

module.exports = {
  appMessage: appMessage,
  timeline: timeline,
};
