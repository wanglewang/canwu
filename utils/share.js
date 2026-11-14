'use strict';

// 统一的分享文案：标题带当前境界与战力，落地到洞府页。
// 不指定 imageUrl，由微信截取当前页面；canvas 分享图仍走「生成道牒图」单独分享。

const engine = require('./game.js');
const copy = require('../data/copy.js');

const PREFIX = copy.BRAND.name + ' · ';
const HOME = '/pages/index/index?from=share';

function titleOf(state) {
  const ov = engine.getOverview(state);
  return '我在《' + copy.BRAND.name + '》修到「' + ov.realmName + '」，战力 ' + ov.power + '，来切磋吗？';
}

function appMessage(state) {
  return {
    title: titleOf(state),
    path: HOME,
  };
}

function timeline(state) {
  return {
    title: PREFIX + titleOf(state),
    query: 'from=timeline',
  };
}

// 子页分享。以前只有四个主页面接过分享，其余页面右上角「转发」是灰的：
// 玩家刚看完称号簿想发给人，发现自己这边没有入口。
//
// 落地页不写死首页——子页把人送回首页，等于把刚看到的东西丢了；
// 每一页落在自己身上，只有参悟页带 ?skillId（点开就是同一门静室，
// 未习得会在 onLoad 里说一句并退回，不留空页）。
function page(text, path) {
  return { title: PREFIX + text, path: path || HOME };
}

// 朋友圈的落地路径固定是当前页，只有 query 能改，所以单独一支。
function pageTimeline(text, query) {
  return { title: PREFIX + text, query: query || 'from=timeline' };
}

module.exports = {
  appMessage: appMessage,
  timeline: timeline,
  page: page,
  pageTimeline: pageTimeline,
};
