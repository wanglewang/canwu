'use strict';

// 视觉标准唯一真源：舞台色板、四类主题、动效预算、结算分镜。
// 四类＝兵刃 / 心法 / 丹道 / 阵法。原「符箓」一类已随功法归类调整撤掉：
// 那门改为阵法·勘禁诀，色板归阵法；太虚诀是心法，归心法。
// 只被 pages/practice 与 styles/scene.wxss 消费；minigames/ 下一行都不许引用。
// 舞台固定深色（游戏该有固定氛围），外围页面仍由 prefers-color-scheme 管双主题。

const STAGE = {
  base: '#08131c',
  sky: '#0e2030',
  haze: '#153146',
  ground: '#0b1a26',
  moon: '#e3f1f8',
  ridgeFar: '#173347',
  ridgeMid: '#102437',
  ridgeNear: '#0c1c29',
  gate: '#07121b',
  altar: '#0b2331',
  altarEdge: '#2a6280',
  stone: '#102c3e',
  stoneEdge: '#1b3b50',
  text: '#e3f1f8',
  textDim: '#9fc3d4',
};

// 统一的是品质与骨架，不同的是母题、色彩、道具、动画与音色。
// 每类 = 主辉光 + 辅光 + 场景暗底；盘面永远是全场最高对比。
const FAMILIES = {
  // key 只是内部标识，不对外显示；刀法与剑法共用这一类青蓝锋芒色板。
  sword: {
    key: 'sword', name: '兵刃', glow: '#6FD4E8', deep: '#2B7FA8', well: '#0D202B',
    motif: '山门 · 锋芒 · 刃痕',
  },
  mind: {
    key: 'mind', name: '心法', glow: '#A8E6CF', deep: '#3D8C74', well: '#0D2420',
    motif: '经脉 · 呼吸光环',
  },
  alchemy: {
    key: 'alchemy', name: '丹道', glow: '#F0A35C', deep: '#B4453C', well: '#291713',
    motif: '丹炉 · 灵液 · 火',
  },
  array: {
    key: 'array', name: '阵法', glow: '#B39CE8', deep: '#6F5B9E', well: '#191628',
    motif: '阵盘 · 灯阵 · 五行环',
  },
};

const FAMILY_OF = {
  forge: 'sword', snatch: 'sword',
  recite: 'mind', absorb: 'mind',
  stones: 'alchemy', combo: 'alchemy',
  // 勘禁诀练的是格盘推演，不是画符，色板归阵法；太虚诀是心法，归心法。
  tanlei: 'array', seal: 'mind',
  arrayEye: 'array', wuxing: 'array',
  // 六门经典盘面：填数 / 让路 / 推箱是盘上推演，归阵法；逐数 / 择大是眼力，归心法；
  // 叠元是「合」的功课，归丹道那一支暖色（丹道门类暂时空缺，色板先留着）。
  shudu: 'array', rongdao: 'array', tuisuo: 'array',
  shumu: 'mind', zeda: 'mind', heyuan: 'alchemy',
  breakthrough: 'alchemy',
};

// 样板阶段只给刀法·开锋诀开沉浸舞台。真机验过再逐个放开，避免一次改十套、方向错了全废。
const ENABLED = { forge: true };

// 低端机红线：粒子与循环动画有上限，所有动画只动 transform / opacity。
const MOTION = {
  particles: 8,
  particleCap: 12,
  loops: 3,
  hitMs: 180,
  missMs: 120,
  slashMs: 260,
  blurMax: 12,
  cloudSec: 18,
  qiSec: 12,
};

// 结算五段：暗场 → 评级落定 → 熟练度条 → 奖励逐条 → 按钮淡入。
// S/A 满演出；B/C/F 压到 900ms，一局才十几秒，不让人天天等演出。
const SETTLE = {
  full: [0, 300, 700, 1200, 1800],
  short: [0, 150, 350, 600, 900],
  fullGrades: ['S', 'A'],
};

function isOn(themeKey) {
  return !!ENABLED[themeKey];
}

function stageOf(themeKey) {
  const f = FAMILIES[FAMILY_OF[themeKey] || 'sword'];
  return {
    family: f.key,
    familyName: f.name,
    glow: f.glow,
    deep: f.deep,
    well: f.well,
    motif: f.motif,
    on: isOn(themeKey),
  };
}

function settleTimeline(grade) {
  const full = SETTLE.fullGrades.indexOf(grade) >= 0;
  return (full ? SETTLE.full : SETTLE.short).slice();
}

module.exports = {
  STAGE: STAGE,
  FAMILIES: FAMILIES,
  FAMILY_OF: FAMILY_OF,
  ENABLED: ENABLED,
  MOTION: MOTION,
  SETTLE: SETTLE,
  isOn: isOn,
  stageOf: stageOf,
  settleTimeline: settleTimeline,
};
