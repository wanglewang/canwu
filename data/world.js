'use strict';

// 《参悟》世界与全局数值配置
// 所有可调数值集中在此文件与 skills.js / practice.js，加内容不改业务代码。

// 功法只有一条进度线：这门走通了几关（`rec.cleared`，0–1000）。
// 属性加成、本门新法、特效兑现全部由它决定，另起一个「熟练度」的做法已经删掉——
// 两条进度线并存时，玩家分不清「我这门到底算几级」，文档也一直在两套名字之间漂。
//
// 六档就是关卡段位（data/levels.js 的 STAGES + FINAL_STAGE_NAME），门槛直接取段界关：
//   未入门 0 → 入门 10 → 小成 50 → 大成 200 → 圆满 500 → 大圆满 1000。
// 也就是「走通第 50 关」与「这门小成了」是同一句话，不再有两种意思。
// verify 8b-2 守着「六档门槛 = 段界关」，两边不会漂。
const TIERS = [
  { key: 'none', name: '未入门', threshold: 0, bonus: 0, color: '#9aa39a', desc: '一关未通，暂无属性加成' },
  { key: 'entry', name: '入门', threshold: 10, bonus: 1, color: '#3d8c74', desc: '属性加成 ×1' },
  { key: 'minor', name: '小成', threshold: 50, bonus: 1.8, color: '#2f6b5b', desc: '属性加成 ×1.8' },
  { key: 'major', name: '大成', threshold: 200, bonus: 2.8, color: '#b8893b', desc: '属性加成 ×2.8，本门新法从这一档起逐条解锁' },
  { key: 'full', name: '圆满', threshold: 500, bonus: 4, color: '#b4453c', desc: '属性加成 ×4' },
  { key: 'perfect', name: '大圆满', threshold: 1000, bonus: 5, color: '#8a5cb0', desc: '属性加成 ×5，本门新法开到最后一条' },
];

// 评级不再给任何数值，只决定结算观感与 30 分钟的挂机加速档位。
// 参悟已经不产灵力灵石了（见 data/economy.js）。
// F 是 0，不是「最低一档」：失败＝这一局没走完，整局作废，挂机加成也不给，
// 已经烧掉的灵力不退。C 才是「走完了但糙」的那一档（0.6）。
const GRADE_FACTOR = { S: 1.5, A: 1.2, B: 1.0, C: 0.6, F: 0 };
const GRADE_COLOR = { S: '#b4453c', A: '#b8893b', B: '#3d8c74', C: '#8a8f83', F: '#8a8f83' };
// 评级中文名是玩家文案，归 data/copy.js 管；这里只留数值与颜色。

// 世界是数据：首版只启用修仙，另外两个只保留元信息，验证同一套系统的可复用性。
const WORLDS = [
  {
    id: 'xian',
    label: '修仙',
    name: '青云界',
    enabled: true,
    intro: '灵力渐薄的外门，人人都在等一次顿悟。你不等，你去练。',
    roleName: '外门弟子',
    style: '清淡、带一点自嘲的修仙日常',
    // 四个属性各有「一件正事」，另有共同的一项（战力基础 ×权重）。
    // 这样「练哪一门」才有方向：练真元是为了气海更深，练悟性是为了少烧灵力，
    // 练身法是为了切磋更稳，练体魄是为了战力更硬。role 直接上人物页，不另写一份解释。
    attributes: [
      { key: 'ti', name: '体魄', weight: 1.0, glyph: '山', role: '战力根基' },
      { key: 'ling', name: '真元', weight: 1.2, glyph: '气', role: '每点 +2 灵力上限' },
      { key: 'wu', name: '悟性', weight: 0.8, glyph: '心', role: '参悟省灵力' },
      { key: 'shen', name: '身法', weight: 1.0, glyph: '风', role: '切磋波动更稳' },
    ],
    baseAttributes: { ti: 12, ling: 12, wu: 10, shen: 11 },
    // qiCap 是气海的境界基数（见 data/economy.js 的 qiCapOf）：
    // 上限 =（qiCap + 真元 × 2）×（1 + 心法扩池）。炼气一趟能存十局困难档，
    // 元婴能存四十局——「往上走」因此不只是战力数字变大。
    realms: [
      { name: '炼气', power: 0, bonus: 0, qiCap: 150, desc: '引气入体，方入门径。' },
      { name: '筑基', power: 75, bonus: 0.06, qiCap: 260, desc: '气沉丹田，根基初成。' },
      { name: '金丹', power: 170, bonus: 0.14, qiCap: 420, desc: '一颗金丹，从此不问外物。' },
      { name: '元婴', power: 300, bonus: 0.24, qiCap: 620, desc: '元婴既出，青云可期。' },
    ],
    resource: '灵力',
    currency: '灵石',
    idle: {
      // 闭关养回灵力：每分钟 0.5 点。速率固定，但「能存多少」由气海上限管（见 qiCap）。
      // 炼气 174 点约五个多小时坐满，所以「睡一晚回来只收一池」是设计，不是 bug：
      // 想让一趟存更多，去破境、去练真元，而不是把小程序挂在后台。
      qiPerMinute: 0.5,
      // 闭关**不推进度**：挂机能涨属性，等于挂着不玩也在涨，「参悟才是唯一的路」就成了假话。
      // 这里没有「每小时多少关」这种键，也不该有。
      // 离线最多累计 8 小时：这是「一次离开能算多久」的上限，与气海容量是两回事。
      // 两个都留着——气海管「存得下多少」，这条管「一次最多算多久」。
      capHours: 8,
      hint: '灵力满则不再生，气海深浅看境界与真元。离线最多累计 8 小时。',
    },
    // 每日份例只给灵力：它是「今天练过了」的补给，不是一笔工钱。
    // 灵石一分不给——那个只能靠切磋与秘境挣（见 data/economy.js）。
    daily: { target: 3, qi: 60, stone: 0 },
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

// 今日机缘：每天一件「今天可做的修仙小事」，给回访一个叙事理由，不给任何资源。
// 与「机缘」（参悟 1.2% 拾残卷）、「份例」（练 3 局领 60 灵力）、「今日之课」（recommend 推荐）
// 三件事都不同：那三件分别管偶遇、补给、练哪门，这件只管「今天有一桩什么可顺手做」。
// 每条指向一个已有动作（切磋/闭关/换门/功法/日志），点下去落到对应页面，不新造玩法。
// 文案是现代白话 + 修仙名词，不写仿古句（见 04-文案口吻规范.md）。
// action 是导航键，页面据此跳已有页面；引擎不认识具体路径，保持内核不碰 wx API。
const DAILY_CHANCES = [
  { key: 'cross', text: '今日气机活络，换一门没连着练的功法，这一局能省 8% 灵力。', action: 'skills' },
  { key: 'duel', text: '同门今日多在论道，去切磋一场，赢得的灵石能添些布阵本钱。', action: 'battle' },
  { key: 'idle', text: '灵脉渐满，先去闭关收一池灵力，参悟才接得上。', action: 'home' },
  { key: 'secret', text: '秘境今日风平，探一处，首过也有一笔灵石。', action: 'secret' },
  { key: 'log', text: '翻翻修行日志，看看这些天的进境走到了哪一步。', action: 'log' },
  { key: 'guide', text: '说明页记着各门的新法，去看看有没有该用上的。', action: 'guide' },
  { key: 'titles', text: '称号簿里还有没拿到的名号，去看看差哪一步。', action: 'titles' },
];

function getWorld(id) {
  for (let i = 0; i < WORLDS.length; i += 1) {
    if (WORLDS[i].id === id) return WORLDS[i];
  }
  return WORLDS[0];
}

module.exports = {
  TIERS: TIERS,
  GRADE_FACTOR: GRADE_FACTOR,
  GRADE_COLOR: GRADE_COLOR,
  WORLDS: WORLDS,
  getWorld: getWorld,
  DAILY_CHANCES: DAILY_CHANCES,
};
