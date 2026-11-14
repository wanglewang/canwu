'use strict';

// 《参悟》世界与全局数值配置
// 所有可调数值集中在此文件与 skills.js / practice.js，加内容不改业务代码。

// 熟练度：玩家在这门功法上的进度，决定能选哪几档难度（难度跟人走）。
// 六段按「前密后疏」拉开，段间跨度约 ×4：入门 300 约六局 S 就能升，给新手留够手感；
// 大圆满取九数之极 99999，是熟练度的硬顶，只能靠绝境档一局局实打出来。
// 难度 need 取 TIERS 前五（0/300/1500/6000/24000），一段一档，不再有空级。
// 熟练度是「打了多少局、打得多好」的干净刻度：只吃「退回低档」这一个惩罚
// （每低一档除以 2 后四舍五入，见 practice.profBelowCap），不乘品阶、不乘难度倍率、不乘境界、不乘属性。
// 品阶 / 境界 / 悟性 / 触类旁通这些倍率全部只作用灵气灵石（见 utils/game.js 的 resMult）。
const PROF_MAX = 99999;
// 标定的基准局数：一个每局只拿 C 的人，9999 局累计 99990 点，第 10000 局补满 99999。
const PROF_C_RUNS = 9999;
// 评级定额：C 统一 10 点/局，是整套数值的锚；其余按评级依次加码。
// F 是走火，整局作废，0 点。没有连乘，所以打「本门最高已解锁档」时任何档位都是 10 点；
// 只有刻意退回低档才逐档折半取整。难度档的价值由资源、纪录与连晋资格承担。
const PROF_GRADE = { S: 25, A: 20, B: 17, C: 10, F: 0 };
const TIERS = [
  { key: 'none', name: '未入门', threshold: 0, bonus: 0, color: '#9aa39a', desc: '只能参悟简单档，尚无加成' },
  { key: 'basic', name: '入门', threshold: 300, bonus: 1, color: '#3d8c74', desc: '解锁「普通」难度与基础属性加成' },
  { key: 'skilled', name: '小成', threshold: 1500, bonus: 1.8, color: '#2f6b5b', desc: '解锁「困难」难度' },
  { key: 'master', name: '大成', threshold: 6000, bonus: 2.8, color: '#b8893b', desc: '解锁「极难」难度、技能特效与参悟便利' },
  { key: 'grand', name: '圆满', threshold: 24000, bonus: 4, color: '#b4453c', desc: '解锁「绝境」难度与称号' },
  { key: 'perfect', name: '大圆满', threshold: PROF_MAX, bonus: 5, color: '#8a5cb0', desc: '熟练度至此圆满，这一门练到头了' },
];

// 评级倍率：只反映这一局打得好不好，只进灵气产出与挂机加成，不进熟练度。
// S 压到 1.5，只进灵气产出与挂机加成；熟练度另走 PROF_GRADE 定额，不参与连乘。
// F 是 0，不是「最低一档」：走火＝这一局没走完，整局作废，熟练度、灵气、灵石、
// 挂机加成一律不给。C 才是「走完了但糙」的那一档（0.6），两者不是同一条线的两端。
const GRADE_FACTOR = { S: 1.5, A: 1.2, B: 1.0, C: 0.6, F: 0 };
const GRADE_COLOR = { S: '#b4453c', A: '#b8893b', B: '#3d8c74', C: '#8a8f83', F: '#8a8f83' };
// 评级中文名是玩家文案，归 data/copy.js 管；这里只留数值与颜色。

// 灵气灵石倍率的封顶：品阶 resource × 难度 mult × 境界衰减 × 悟性 × 触类旁通。
// 正常最高组合约 3.20 × 2.60 × 1.60 × 1.15 ≈ 15.3，上限取 16.0：
// 只防以后新增系数叠加失控，不许拿它去压正常玩法（压低了高档的资源优势会被抹平）。
// 注意：这是资源倍率；熟练度吃的是 PROF_GRADE 定额 × 低档折减，不进这一串。
const MAX_MULTIPLIER = 16.0;
// 境界超过功法可修上限后的收益衰减。不为 0：还能练，但该换功法了。
const REALM_DECAY = 0.3;
// 换一门功法参悟的「触类旁通」倍率：只奖不罚，鼓励多样化而不惩罚专精。
const CROSS_BONUS = 1.15;

// 世界是数据：首版只启用修仙，另外两个只保留元信息，验证同一套系统的可复用性。
const WORLDS = [
  {
    id: 'xian',
    label: '修仙',
    name: '青云界',
    enabled: true,
    intro: '灵气渐薄的外门，人人都在等一次顿悟。你不等，你去练。',
    roleName: '外门弟子',
    style: '清淡、带一点自嘲的修仙日常',
    attributes: [
      { key: 'ti', name: '体魄', weight: 1.0, glyph: '山' },
      { key: 'ling', name: '灵力', weight: 1.2, glyph: '气' },
      { key: 'wu', name: '悟性', weight: 0.8, glyph: '心' },
      { key: 'shen', name: '身法', weight: 1.0, glyph: '风' },
    ],
    baseAttributes: { ti: 12, ling: 12, wu: 10, shen: 11 },
    realms: [
      { name: '炼气', power: 0, bonus: 0, desc: '引气入体，方入门径。' },
      { name: '筑基', power: 75, bonus: 0.06, desc: '气沉丹田，根基初成。' },
      { name: '金丹', power: 170, bonus: 0.14, desc: '一颗金丹，从此不问外物。' },
      { name: '元婴', power: 300, bonus: 0.24, desc: '元婴既出，青云可期。' },
    ],
    resource: '灵气',
    currency: '灵石',
    idle: {
      qiPerMinute: 1.2,
      profPerHour: 2.5,
      capHours: 8,
      hint: '离线最多累计 8 小时，不玩也有进度，玩了明显更快。',
    },
    daily: { target: 3, qi: 30, stone: 10 },
  },
  {
    id: 'sci',
    label: '科幻',
    name: '星舰纪元',
    enabled: false,
    intro: '机甲驾驶员的神经同步率，靠一次次模拟舱校准。',
    roleName: '机甲驾驶员',
    style: '冷硬、带仪表盘质感的星舰日志',
  },
  {
    id: 'city',
    label: '都市',
    name: '打工纪',
    enabled: false,
    intro: '话术、副业与摸鱼，都是当代修行。',
    roleName: '打工人',
    style: '吐槽向、轻量玩梗',
  },
];

function getWorld(id) {
  for (let i = 0; i < WORLDS.length; i += 1) {
    if (WORLDS[i].id === id) return WORLDS[i];
  }
  return WORLDS[0];
}

module.exports = {
  PROF_MAX: PROF_MAX,
  PROF_C_RUNS: PROF_C_RUNS,
  PROF_GRADE: PROF_GRADE,
  TIERS: TIERS,
  GRADE_FACTOR: GRADE_FACTOR,
  GRADE_COLOR: GRADE_COLOR,
  MAX_MULTIPLIER: MAX_MULTIPLIER,
  REALM_DECAY: REALM_DECAY,
  CROSS_BONUS: CROSS_BONUS,
  WORLDS: WORLDS,
  getWorld: getWorld,
};
