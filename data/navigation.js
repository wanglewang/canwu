'use strict';

// 页面组织的单一真源：四个 tab、主页六宫格、以及每页的「说明」去向都写在这里。
//
// 为什么单独一层：改版前每个页面自己拼跳转，tabBar 里混着低频的「论道」，
// 最高频的「修炼」却只藏在洞府页一个吸底按钮后面；同一类入口在不同页面
// 还有 switchTab / navigateTo 两种写法。这里把导航收成纯数据：
//   - TAB_ORDER 与 app.json 的 tabBar.list 一一对应，verify.js 会核对；
//   - TILES 决定主页六宫格，页面只负责分发 mode；
//   - HELP_TOPICS 让每页右上角只有一个「说明」，点进去按主题展开。
// 低频信息（日志、诸界）不占首屏，从六宫格进子页。

const TAB_ORDER = ['index', 'cultivate', 'skills', 'profile'];

const TAB_LABELS = {
    index: '主页',
    cultivate: '修炼',
    skills: '功法',
    profile: '人物',
};

// glyph 是纯字符图形，不依赖图片资源；与图标一样走深色金线描边。
const TILES = [
    { key: 'battle', label: '仙门切磋', glyph: '⚔', mode: 'page', url: '/pages/battle/battle' },
    { key: 'shop', label: '藏经阁', glyph: '▤', mode: 'tab', url: '/pages/skills/skills', section: 'locked' },
    { key: 'board', label: '战力仙榜', glyph: '☷', mode: 'page', url: '/pages/battle/battle', query: 'focus=board' },
    { key: 'titles', label: '称号簿', glyph: '✦', mode: 'tab', url: '/pages/profile/profile', section: 'titles' },
    { key: 'log', label: '修行日志', glyph: '☰', mode: 'page', url: '/pages/log/log' },
    { key: 'guide', label: '玩法说明', glyph: '◇', mode: 'page', url: '/pages/guide/guide' },
];

// 说明页按主题取内容（见 data/help.js）；guide 是完整手册，help 是「这一页」。
const HELP_TOPICS = {
    index: 'home',
    cultivate: 'cultivate',
    skills: 'skills',
    profile: 'profile',
    battle: 'battle',
    log: 'log',
    guide: 'guide',
};

function helpUrl(pageKey) {
    return '/pages/help/help?topic=' + (HELP_TOPICS[pageKey] || 'home');
}

// tab 页不能带 query，落地后要展开的区块用 globalData.pendingSection 传一次。
function openTile(app, tile) {
    if (tile.section) app.globalData.pendingSection = tile.section;
    const url = tile.url + (tile.query ? '?' + tile.query : '');
    if (tile.mode === 'tab') wx.switchTab({ url: url });
    else wx.navigateTo({ url: url });
}

module.exports = {
    TAB_ORDER: TAB_ORDER,
    TAB_LABELS: TAB_LABELS,
    TILES: TILES,
    HELP_TOPICS: HELP_TOPICS,
    helpUrl: helpUrl,
    openTile: openTile,
};
