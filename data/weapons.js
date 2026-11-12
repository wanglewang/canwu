'use strict';

// 兵器轴：同一套「顺光划过刀桩」的引擎，靠 profile 分出刀与剑。
//
// 项目里已有的轴：类型 → 玩什么，品阶 → 收益，熟练度 → 难度，境界 → 上限，主题 → 长什么样。
// 缺的是「兵器 → 怎么动」。补上之后，将来加一门剑法不用新写玩法模块。
//
// 当前只做刀法：dao 挂「基础刀法·循光斩桩」，是唯一启用的 profile。
// 刀：单刃、靠重量劈砍、走弧线、力从腰发。轨迹是「刃扫过的面积」——
//     长、折、沉，容许多带过几桩；连击靠「势不断」。
// 剑 profile 只是预留：点刺式的短直线输入还没做，暂不挂任何功法。
// 先把「分得出来」写成可回归的事实，等真做剑法时补输入适配器即可。
//
// 手指划这个输入本身不分兵器：刀势、剑气都有轨迹。区别在轨迹的形态与判定。
// 这一套长扫、重后摇、连扫数桩的动作语汇是刀，所以功法名与实都归到刀法，
// 不再叫「基础剑法」——那是拿文案去补机制，早晚会串。
//
// 分工：本文件只管形态、判定、招式名与玩法层称谓；
//   配色与主题文案 → minigames/theme.js（按功法取）
//   长说明与术语表 → data/guides.js
// 再加一门刀法变体：data/practice.js 新增 method（game 仍指 click，weapon: 'dao'），
//   配一门 theme、补一份 guides 说明即可；minigames/click.js 一行不用改。

const PROFILES = {
  sword: {
    key: 'sword',
    label: '剑法',
    noun: '剑',
    // 轨迹：2–4 桩，直线为主，折线极少。预留，当前无功法挂它。
    baseLen: 2,
    maxLen: 4,
    bentBase: 0.18,
    bentStep: 0.12,
    stepMs: 126,
    stepDecay: 11,
    slack: 1,
    gap: 130,
    gradeScale: 1,
    names: { flat: '平削', vertical: '直刺', diagonal: '斜挑', bent: '绕指' },
    edgeName: '金锋',
    words: {
      ready: '凝神，等剑路亮起…',
      tip: '顺着箭头引剑过去，点亮不算',
      status: '剑路已起，顺箭头引剑',
      statusGold: '金锋已起，一剑挑尽',
      miss: '慢了一线，剑势散了',
      missGold: '金锋没接住，稳住',
      whiff: '刺偏了，剑势散了',
      streak: '剑势正盛，别断',
      next: '好，跟住下一道',
      meter: '剑势',
      hit: '一剑中的',
      hitGold: '金锋入手',
      missWord: '刺偏了',
      missFlash: '漏了一剑',
      missGoldFlash: '金锋溜走',
      summary: '刺中',
      praise: '剑随意走',
      banner: '剑光乍起',
      // 阶段新法的提示与失手语：都不含刀味词。
      holdHint: ' · 到靶心收住',
      chain: '剑势不断，接着来',
      ban: '触了禁制 · 剑势散',
      fake: '虚影无锋 · 剑势散',
      unhold: '收势未成 · 剑势散',
      unholdHit: '收势未成 · 半分',
    },
  },
  dao: {
    key: 'dao',
    label: '刀法',
    noun: '刀',
    // 轨迹：3–5 桩，折线为主，允许大转弯
    baseLen: 3,
    maxLen: 5,
    bentBase: 0.55,
    bentStep: 0.08,
    // 起手沉、光走得慢，扫完还有余势
    stepMs: 156,
    stepDecay: 9,
    // 刀势带过：允许多扫两桩
    slack: 2,
    gap: 190,
    gradeScale: 1.35,
    names: { flat: '横劈', vertical: '立劈', diagonal: '斜斩', bent: '游龙' },
    edgeName: '重斩',
    words: {
      ready: '沉肩，等刀势起来…',
      tip: '顺着箭头一刀扫过去，点亮不算',
      status: '刀势已起，顺箭头扫过去',
      statusGold: '重斩已起，一刀扫尽',
      miss: '慢了一步，刀势散了',
      missGold: '重斩落空，稳住',
      whiff: '扫偏了，刀势散了',
      streak: '刀势正盛，别断',
      next: '好，接住下一刀',
      meter: '刀势',
      hit: '一刀斩中',
      hitGold: '重斩得手',
      missWord: '劈空了',
      missFlash: '漏了一刀',
      missGoldFlash: '重斩落空',
      summary: '斩中',
      praise: '刀随意走',
      banner: '刀光乍起',
      // 阶段新法的提示与失手语：收势、禁桩、双锋各一句。
      holdHint: ' · 到靶心停一拍',
      chain: '连招不断，接着扫',
      ban: '斩到禁桩 · 刀势散',
      fake: '斩了虚影 · 刀势散',
      unhold: '收势未成 · 刀势散',
      unholdHit: '收势未成 · 半分',
    },
  },
};

function weaponOf(key) {
  // 没标兵器时按当前唯一启用的刀法回落，免得漏标的方法说出「一剑中的」。
  return PROFILES[key] || PROFILES.dao;
}

// 剑法里不该出现刀字，刀法里不该出现剑字。测试用这两张表守住兵器语言。
const FORBIDDEN = {
  sword: ['劈', '斩', '砍', '刀锋', '一刀', '扫过'],
  dao: ['剑', '刺中', '引剑', '一剑'],
};

function forbiddenOf(key) {
  return FORBIDDEN[key] || [];
}

module.exports = {
  PROFILES: PROFILES,
  weaponOf: weaponOf,
  forbiddenOf: forbiddenOf,
};
