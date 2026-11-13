'use strict';

// 页面组织的单一真源：四个 tab、主页六宫格、以及每页的「说明」去向都写在这里。
//
// 为什么单独一层：改版前每个页面自己拼跳转，tabBar 里混着低频的「论道」，
// 最高频的「修炼」却只藏在洞府页一个吸底按钮后面；同一类入口在不同页面
// 还有 switchTab / navigateTo 两种写法。这里把导航收成纯数据：
//   - TAB_ORDER 与 app.json 的 tabBar.list 一一对应，verify.js 会核对；
//   - TILES 决定主页六宫格，六格**各自进自己的页面**，不再借道别的 tab；
//   - HELP_TOPICS 让每页页尾只有一个「说明」，点进去按主题展开。
// 低频信息（日志、仙榜）不占首屏，从六宫格进子页。

const TAB_ORDER = ['index', 'cultivate', 'skills', 'profile'];

const TAB_LABELS = {
    index: '主页',
    cultivate: '修炼',
    skills: '功法',
    profile: '人物',
};

// glyph 用一个汉字而不是符号：⚔ ✦ 这类字符在部分机型会渲染成彩色 emoji，
// 和墨底金线拼在一起非常跳；汉字单字在任何字体下都稳，也统一了视觉。
const TILES = [
    { key: 'battle', label: '仙门切磋', glyph: '剑', mode: 'page', url: '/pages/battle/battle' },
    { key: 'shop', label: '藏经阁', glyph: '经', mode: 'page', url: '/pages/shop/shop' },
    { key: 'board', label: '战力仙榜', glyph: '榜', mode: 'page', url: '/pages/board/board' },
    { key: 'titles', label: '称号簿', glyph: '印', mode: 'page', url: '/pages/titles/titles' },
    { key: 'log', label: '修行日志', glyph: '录', mode: 'page', url: '/pages/log/log' },
    { key: 'guide', label: '玩法说明', glyph: '典', mode: 'page', url: '/pages/guide/guide' },
];

// 说明页按主题取内容（见 data/help.js）；guide 是完整手册，help 是「这一页」。
const HELP_TOPICS = {
    index: 'home',
    cultivate: 'cultivate',
    skills: 'skills',
    shop: 'shop',
    profile: 'profile',
    battle: 'battle',
    board: 'board',
    titles: 'titles',
    log: 'log',
    guide: 'guide',
};

function helpUrl(pageKey) {
    return '/pages/help/help?topic=' + (HELP_TOPICS[pageKey] || 'home');
}

function openTile(app, tile) {
    wx.navigateTo({ url: tile.url });
}

module.exports = {
    TAB_ORDER: TAB_ORDER,
    TAB_LABELS: TAB_LABELS,
    TILES: TILES,
    HELP_TOPICS: HELP_TOPICS,
    helpUrl: helpUrl,
    openTile: openTile,
};
