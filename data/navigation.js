'use strict';

// 页面组织的单一真源：三个 tab、主页六宫格、以及每页的「说明」去向都写在这里。
//
// 为什么单独一层：改版前每个页面自己拼跳转，tabBar 里混着低频的「论道」，
// 最高频的「修炼」却只藏在洞府页一个吸底按钮后面；同一类入口在不同页面
// 还有 switchTab / navigateTo 两种写法。这里把导航收成纯数据：
//   - TAB_ORDER 与 app.json 的 tabBar.list 一一对应，verify.js 会核对；
//   - TILES 决定主页宫格，六格**各自进自己的页面**，不再借道别的 tab；
//   - HELP_TOPICS 让每页只有一个「说明」，点进去按主题展开。
// 低频信息（日志、仙榜）不占首屏，从宫格进子页。

// 三个 tab：修炼不是一级页面，它是「功法卡片」点进去的详情子页（pages/cultivate）。
// 这样点哪门功法就进哪门的静室，不必先去修炼页再换一次功法。
const TAB_ORDER = ['index', 'skills', 'profile'];

const TAB_LABELS = {
    index: '主页',
    skills: '功法',
    profile: '人物',
};

// glyph 用一个汉字而不是符号：⚔ ✦ 这类字符在部分机型会渲染成彩色 emoji，
// 和墨底金线拼在一起非常跳；汉字单字在任何字体下都稳，也统一了视觉。
// 藏经阁不再是独立页：它是功法页的第二个标签（未习得的都在那儿换）。
// 秘境探索曾经和同门对手挤在「仙门切磋」一页里，两段列表各自有按钮、各自有结算，
// 首屏得先分清「哪一段是同门」才能点——它现在是一格，一个页面只说一件事。
const TILES = [
    { key: 'battle', label: '仙门切磋', glyph: '剑', mode: 'page', url: '/pages/battle/battle' },
    { key: 'secret', label: '秘境探索', glyph: '秘', mode: 'page', url: '/pages/secret/secret' },
    { key: 'board', label: '战力仙榜', glyph: '榜', mode: 'page', url: '/pages/board/board' },
    { key: 'titles', label: '称号簿', glyph: '印', mode: 'page', url: '/pages/titles/titles' },
    { key: 'log', label: '修行日志', glyph: '录', mode: 'page', url: '/pages/log/log' },
    { key: 'guide', label: '玩法说明', glyph: '典', mode: 'page', url: '/pages/guide/guide' },
];

// 二级页的导航标题（页面 json 的 navigationBarTitleText）也只此一份：
// 之前 scripts/verify.js 与 tests/layout.test.js 各有一张表，拆秘境页时只改了其中一张，
// 「加一页要记得改两处」这种约定等于没有约定。
const PAGE_TITLES = [
    '仙门切磋',
    '秘境探索',
    '参悟',
    '登录',
    '修行指南',
    '修行日志',
    '战力仙榜',
    '称号簿',
];

// 说明页按主题取内容（见 data/help.js）；guide 是完整手册，help 是「这一页」。
const HELP_TOPICS = {
    index: 'home',
    cultivate: 'cultivate',
    skills: 'skills',
    profile: 'profile',
    battle: 'battle',
    secret: 'secret',
    board: 'board',
    titles: 'titles',
    log: 'log',
    guide: 'guide',
};

function helpUrl(pageKey) {
    return '/pages/help/help?topic=' + (HELP_TOPICS[pageKey] || 'home');
}

// 参悟页的说明不是「一页一节」，而是「一门一册」：整篇规则按功法生成，
// 所以它不进 HELP_TOPICS（那里是静态主题表），单独给一个带参数的入口。
// 传 method 就按参悟方式生成；冲关局没有功法，传 game 直接取蓄力停区的玩法说明。
// diff 带上当前难度档：说明页要把「本档 S/A/B/C 各要多少」写成具体数字，
// 不带档就只能给个笼统口径，等于没写清。
function practiceHelpUrl(methodId, gameId, diffKey) {
    let url = '/pages/help/help?topic=practice';
    if (methodId) url += '&method=' + methodId;
    else if (gameId) url += '&game=' + gameId;
    if (diffKey) url += '&diff=' + diffKey;
    return url;
}

function openTile(app, tile) {
    wx.navigateTo({ url: tile.url });
}

module.exports = {
    TAB_ORDER: TAB_ORDER,
    TAB_LABELS: TAB_LABELS,
    TILES: TILES,
    PAGE_TITLES: PAGE_TITLES,
    HELP_TOPICS: HELP_TOPICS,
    helpUrl: helpUrl,
    practiceHelpUrl: practiceHelpUrl,
    openTile: openTile,
};
