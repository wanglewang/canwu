'use strict';

// 兵器轴：同一套「顺光划过剑桩」的引擎，靠 profile 分出剑与刀。
//
// 项目里已有的轴：类型 → 玩什么，品阶 → 收益，熟练度 → 难度，境界 → 上限，主题 → 长什么样。
// 缺的是「兵器 → 怎么动」。补上之后，加一门刀法不用新写玩法模块。
//
// 剑：双刃、以刺点为核、走直线、发劲在腕。轨迹是「光走的点线」——
//     短、直、准，点到靶心即收；连击靠「准」，不许带桩。
// 刀：单刃、靠重量劈砍、走弧线、力从腰发。轨迹是「刃扫过的面积」——
//     长、折、沉，容许多带过几桩；连击靠「势不断」。
//
// 手指划这个输入本身不分兵器：御剑、剑气都有轨迹。区别在轨迹的形态与判定，
// 不在「有没有轨迹」。早期把水果忍者那套长扫轨迹直接挂到「基础剑法」下，
// 又用了一整串劈 / 斩 / 刀锋的词，才是这次要修的错位。
//
// 分工：本文件只管形态、判定、招式名与玩法层称谓；
//   配色与浮字文案 → minigames/theme.js（按功法取，加刀法会配自己的 theme）
//   长说明与术语表 → data/guides.js
// 加一门刀法：data/practice.js 新增 method（game 仍指 click，weapon: 'dao'），
//   配一门 theme、补一份 guides 说明即可；minigames/click.js 一行不用改。

const PROFILES = {
  sword: {
    key: 'sword',
    label: '剑法',
    noun: '剑',
    // 轨迹：2–4 桩，直线为主，折线极少
    baseLen: 2,
    maxLen: 4,
    bentBase: 0.18,
    bentStep: 0.12,
    // 光掠过一桩的时间：轻、快、收得干脆
    stepMs: 126,
    stepDecay: 11,
    // 划过路径比剑路多出的桩数上限（1 是抗边界抖动，不是「刀势带过」）
    slack: 1,
    // 后摇：短，下一道来得快
    gap: 130,
    // 长招分数更高时，评级门槛要同步抬，避免高难度反而人人 S
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
    },
  },
};

function weaponOf(key) {
  return PROFILES[key] || PROFILES.sword;
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
