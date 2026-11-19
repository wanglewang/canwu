'use strict';

// 灵纹牌：剪影族 → sprite 格位的唯一真源。
//
// 二十六格图由 scripts/gen-crest.js 同一次出（assets/crest.png + styles/crest.wxss），
// 这里只记「第几族用第几格」，不记颜色也不记画法。
//
// 配对类盘面的第一条硬规则是「先看剪影，后看颜色」：去色成单色、眯眼仍要分得清。
// 按 sprite 序号取前 N 格会踩这个坑 —— 前五格全是果子，一盘里五个圆，颜色一撤就糊。
// 所以两门都按族序取图：并蒂引按关号轮换四套主题，三秀按段换一整副图案。
// 换皮不换骨架：玩家学的是「第几族长什么样」，不是「这一格画的是什么东西」。

const THEME_FAMILIES = ['圆润', '方框', '伞锥', '竖长', '成簇', '带尖'];

const CREST_THEMES = [
  // 灵植：果器八格里挑出来的六格。灵橘与灵果同为「圆 + 瓣」、
  // 灵葫与灵梨同为「上窄下宽竖长」，是最容易被读混的两对，所以不上场。
  { name: '灵植', ids: [1, 6, 8, 2, 3, 4] },
  { name: '甜点', ids: [9, 10, 11, 12, 13, 14] },
  { name: '海洋', ids: [15, 16, 17, 18, 19, 20] },
  { name: '灵兽', ids: [21, 22, 23, 24, 25, 26] },
];

// board 里存的是族序号（1..kinds），不是 sprite 序号 —— 换主题只动这张表。
function crestOf(v, theme) {
  const set = CREST_THEMES[theme] || CREST_THEMES[0];
  return set.ids[v - 1] || 0;
}

// 三秀比并蒂引多一色：四套主题每套只有六族，第七色从别套借一枚形状独占的
// 「异纹」，不跟本段任何一族抢轮廓（借的那一格与本段六格都分得开）。
// 段五「荟萃」从四套各请一族 —— 圆满段集大成，也和前四段都不撞。
// 跨段允许借到同一格（玩家不会同时看见两段），段内绝不许重复。
const MATCH_FAMILIES = ['圆润', '方框', '伞锥', '竖长', '成簇', '带尖', '异纹'];

const MATCH_CRESTS = [
  { name: '灵植', ids: [1, 6, 8, 2, 3, 4, 20] },   // 异纹：海星，五角放射独占
  { name: '甜点', ids: [9, 10, 11, 12, 13, 14, 7] }, // 异纹：灵葫，双球 8 字独占
  { name: '海洋', ids: [15, 16, 17, 18, 19, 20, 7] }, // 异纹：灵葫，避开与海星同为放射形
  { name: '灵兽', ids: [21, 22, 23, 24, 25, 26, 20] }, // 异纹：海星，与六族全不撞
  { name: '荟萃', ids: [1, 10, 17, 24, 19, 14, 7] }, // 四套各一族 + 灵葫
];

function matchCrestOf(v, theme) {
  const set = MATCH_CRESTS[theme] || MATCH_CRESTS[0];
  return set.ids[v - 1] || 0;
}

module.exports = {
  THEME_FAMILIES: THEME_FAMILIES,
  CREST_THEMES: CREST_THEMES,
  crestOf: crestOf,
  MATCH_FAMILIES: MATCH_FAMILIES,
  MATCH_CRESTS: MATCH_CRESTS,
  matchCrestOf: matchCrestOf,
};
