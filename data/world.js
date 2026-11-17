'use strict';

// 《参悟》世界与全局数值配置
// 所有可调数值集中在此文件与 skills.js / practice.js，加内容不改业务代码。

// 熟练度：玩家在这门功法上练得多深，决定属性加成倍率与本门新法开到第几条。
// 它**不管**难度：五档难度各 40 关、互不相干，走通本档 40 关就开下一档（见 data/practice.js）。
// 六段按「前密后疏」拉开，段间跨度约 ×4；大圆满取九数之极 99999，是熟练度硬顶。
// 阶段门槛取 0/300/1500/6000/24000/99999；关卡表 LEVEL_PROF_STEPS 与这六个锚同源，
// 但那是给老存档（v7 及以前只存 prof）反推关号用的，新存档按 levels 逐档记。
// 熟练度只由「本局评级 + 连 S 层数」决定：不乘品阶、不乘难度倍率、不乘境界、不乘属性。
// 品阶 / 境界 / 悟性 / 触类旁通 / 心法省气这些系数全部只作用「一局烧多少灵力」
// （见 data/economy.js 的 practiceQiCost），参悟本身不产任何资源。
const PROF_MAX = 99999;
// 全 C 基准：一个每局只拿 C 的人，9999 局累计 99990 点，第 10000 局补满 99999。
const PROF_C_RUNS = 9999;

// 单局基础（连 S 层数 0 时）：C 10 是整套数值的锚，B 15、A 22.5→23、S 33.75→34。
// F 是失败，整局作废，0 点。C/B/A 固定不叠层，且会把连 S 归零。
const PROF_BASE = { S: 34, A: 23, B: 15, C: 10, F: 0 };
// 连 S：只有「本门当前关」的 S 才叠层，每局独立从 34 起算 ×1.5^(k-1) 后四舍五入，
// 不是拿上一局的整数接着乘，也不是最后总和再取整。第 10 层封顶，第 11 局起锁死 1307。
// 回关局与连 S 完全解耦：不叠层、不砍连击收益、连击层数原样保留（见 utils/game.js）。
const COMBO_STEP = 1.5;
const COMBO_MAX = 10;

function comboGain(k) {
  const n = Math.max(1, Math.min(COMBO_MAX, Math.floor(Number(k) || 1)));
  return Math.round(PROF_BASE.S * Math.pow(COMBO_STEP, n - 1));
}

const COMBO_TABLE = (function () {
  const out = [];
  for (let i = 1; i <= COMBO_MAX; i += 1) out.push(comboGain(i));
  return out;
}());
// 34 / 51 / 77 / 115 / 172 / 258 / 387 / 581 / 871 / 1307，一轮 3853 点。
const COMBO_ROUND = COMBO_TABLE.reduce(function (a, b) { return a + b; }, 0);
const COMBO_CAP_GAIN = COMBO_TABLE[COMBO_MAX - 1];
// 全程不断 S、都打最高档的理论最少局数：前 10 局走曲线，之后每局都是封顶的 1307。
const PROF_S_RUNS = (function () {
  let prof = 0;
  let runs = 0;
  while (prof < PROF_MAX && runs < 100000) {
    runs += 1;
    prof += comboGain(runs);
  }
  return runs;
}());
// 熟练度的六级「火候」。**这不是段位**——段位（未入门…大圆满）现在归关卡，
// 由「走通了几关」决定（见 data/levels.js 的 STAGES）。两条线各有各的名字，
// 不许再混用：熟练度管属性加成与阶段新法，关卡管内容与难度。
// 火候名取「生→窥→熟→纯→玄→化」这一路，与段位名（未入门 / 入门 / 小成 / 大成 / 圆满）
// 一个也不重：重名会让「我小成了」有两种意思。
// 也不许同音（旧的「初熟 / 纯熟」念出来一样，隔着屏幕看也分不清是哪一级）。
const TIERS = [
  { key: 'none', name: '生涩', threshold: 0, bonus: 0, color: '#9aa39a', desc: '暂无属性加成' },
  { key: 'basic', name: '初窥', threshold: 300, bonus: 1, color: '#3d8c74', desc: '属性加成 ×1' },
  { key: 'skilled', name: '渐熟', threshold: 1500, bonus: 1.8, color: '#2f6b5b', desc: '属性加成 ×1.8' },
  { key: 'master', name: '精纯', threshold: 6000, bonus: 2.8, color: '#b8893b', desc: '属性加成 ×2.8，本门新法从这一级起逐条解锁' },
  { key: 'grand', name: '通玄', threshold: 24000, bonus: 4, color: '#b4453c', desc: '属性加成 ×4' },
  { key: 'perfect', name: '化境', threshold: PROF_MAX, bonus: 5, color: '#8a5cb0', desc: '属性加成 ×5，本门新法开到最后一条' },
];

// 评级倍率：只决定这一局的挂机加速与评级观感，既不进熟练度，也不进资源产出。
// 参悟已经不产灵力灵石了（见 data/economy.js），这一档现在只影响 buff 时长档位。
// F 是 0，不是「最低一档」：失败＝这一局没走完，整局作废，熟练度、挂机加成都不给，
// 已经烧掉的灵力也不退。C 才是「走完了但糙」的那一档（0.6）。
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
      // 闭关**不产熟练度**：挂机能涨熟练度，等于挂着不玩也在涨属性，「参悟才是提速」就成了假话。
      // 这里没有 profPerHour 这个键。
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

function getWorld(id) {
  for (let i = 0; i < WORLDS.length; i += 1) {
    if (WORLDS[i].id === id) return WORLDS[i];
  }
  return WORLDS[0];
}

module.exports = {
  PROF_MAX: PROF_MAX,
  PROF_C_RUNS: PROF_C_RUNS,
  PROF_S_RUNS: PROF_S_RUNS,
  PROF_BASE: PROF_BASE,
  COMBO_STEP: COMBO_STEP,
  COMBO_MAX: COMBO_MAX,
  COMBO_TABLE: COMBO_TABLE,
  COMBO_ROUND: COMBO_ROUND,
  COMBO_CAP_GAIN: COMBO_CAP_GAIN,
  comboGain: comboGain,
  TIERS: TIERS,
  GRADE_FACTOR: GRADE_FACTOR,
  GRADE_COLOR: GRADE_COLOR,
  WORLDS: WORLDS,
  getWorld: getWorld,
};
