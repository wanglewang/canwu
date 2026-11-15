'use strict';

const economyData = require('./economy.js');
const levelData = require('./levels.js');

// 参悟方式 = 一门功法 + 一套专属玩法 + 该门独有的规则花样(twist) + 表现主题(theme)。
// 19 门功法对应 19 套互不复用内核的小游戏；同是剑法、同是阵法，也不会点进去是同一个盘面。
// game 取值见 minigames/index.js：
//   click / hunt / memory / bridge / tempo / sword / lights / wuxing / mines / seal / link / blocks / match
//   / sudoku / merge / schulte / klotski / pushbox / biggest。
// forge 是刀法（weapon: 'dao'），剑法·截锋断岳诀仍标 sword，但 hunt 引擎暂不读兵器轴。
// 兵器是功法属性，不是某个玩法的私有参数。charge 仅用于境界突破，不挂功法。
//
// 命名分工：「参悟方式」写这一门功课具体在做什么（斩桩 / 采露 / 观窍），
// 「玩法名」写盘面上的动作（顺光扫斩 / 循纹递推）。两者不可重名，也不可与功法本身相斥——
// 刀法不练数格子，丹道不练渡河，心法不练牵线——类别与盘面上的动作必须同源。
// 反例就发生在这一版之前：「符箓·照影符」练的是数格辨禁，可符是纸上画出来的东西，
// 与格盘推理毫无关系；已按「以游戏为准」改为「阵法·循数勘禁诀」，归入阵法黄阶。
// 同理，「丹道·凝露方」练的是一条竖向河道采露，与炼丹无关，已按玩法改为「水术·叠纹凝露诀」；
// 丹道这一门暂时空缺，留给以后真正炼丹的功课。
// id 是稳定键（存档、纪录都按它索引），改文案时不要动 id。
// base 是灵力基数（/4 后即 8–14），按各玩法的通关难度分别配平；熟练度走 world.PROF_BASE / comboGain，不用 base。
//
// 一个维度只管一件事：
//   类型 → 玩什么（游戏族，见 FAMILIES）
//   兵器 → 怎么动（刀法走 click；剑 profile 预留，先不做剑法）
//   品阶 → 战力加成与灵力灵石倍率（见 TIERS，天地玄黄；不加速熟练度）
//   熟练度 → 关卡（200 关，章由关号反推；见 DIFFICULTIES 的五档表）
//   境界 → 可修上限与收益衰减（品阶的 maxRealm）

const PRACTICE_METHODS = [
  {
    id: 'forge', name: '循光斩桩', game: 'click', theme: 'forge', twist: 'forge',
    desc: '刀光沿刀桩连成一道刀路，每桩箭头指向下一桩，顺箭头一刀扫到靶心才算斩中。反向或劈空一记，少一息。',
    tip: '反向、跳桩、绕圈都算劈空：扣 1 息、断刀势',
    base: 32,
    // weapon 是兵器轴：click 引擎读它分剑 / 刀，其余引擎目前忽略。
    params: { duration: 15, life: 700, grid: 9, cols: 3, weapon: 'dao' },
  },
  {
    id: 'snatch', name: '辨锋截击', game: 'hunt', theme: 'snatch', twist: 'snatch',
    desc: '几道剑光同时亮，只有一道是真招。认准了抢先截，慢了会被反制。',
    // 局内两行分工：tip 讲代价（截错会怎样），guides.inline 讲操作速记。
    tip: '截错扣分、少 1 息，连夺也断',
    base: 36,
    params: { duration: 16, interval: 1000, grid: 12, cols: 4, decoys: 2, weapon: 'sword' },
  },
  {
    id: 'recite', name: '背功法口诀', game: 'memory', theme: 'recite', twist: 'recite',
    desc: '口诀次第闪过，按原序点回。看漏了可以抢记，赌自己记住了多少。',
    tip: '点错罚 1.5 息、连断；整轮记岔折 1 盏心神',
    base: 38,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 560, gapMs: 260, msPerNote: 480 },
  },
  {
    id: 'stones', name: '循纹采露', game: 'bridge', theme: 'stones', twist: 'stones',
    desc: '灵露凝在河石上，每层只一道纹对得上方子。水流一转，石位就换。',
    tip: '采错折 1 盏心神，人留在原层',
    base: 36,
    params: { rows: 5, cols: 3, shuffleMs: 3200, timeLimit: 45 },
  },
  {
    id: 'absorb', name: '吸纳灵力', game: 'tempo', theme: 'absorb', twist: 'absorb',
    desc: '一呼一吸皆有节律，气机收到最匀处才纳得进去。慢些，反而更难走偏。',
    tip: '偏一点就断连，缩过头算失拍',
    base: 30,
    params: { beats: 8, speed: 0.026, window: 0.09 },
  },
  {
    id: 'combo', name: '照卷踏位', game: 'sword', theme: 'combo', twist: 'combo',
    desc: '卷轴铺开一串步位，落脚之处皆有次序。一步踏错，整套就散。',
    tip: '踏错要重走这一步，另扣 1 息',
    base: 40,
    params: { duration: 20, segments: 4, baseLen: 3, moves: ['进', '退', '侧', '转'] },
  },
  {
    id: 'arrayEye', name: '参悟阵眼', game: 'lights', theme: 'arrayEye', twist: 'arrayEye',
    desc: '点一格翻转它与上下左右四格，把整盘阵灯同时点亮。盘面规格与步数预算写在下面的档位表里。',
    tip: '触死门复位并罚 3 步',
    base: 42,
    // 盘面规格 / 最优步数下限 / 步数预算由 LIGHTS_LEVELS 按难度档注入，这里不再写死 3×3。
    params: {},
  },
  {
    id: 'wuxing', name: '排布阵灯', game: 'wuxing', theme: 'wuxing', twist: 'wuxing',
    desc: '五盏阵灯围成一环，相生之位次第轮转。连得越长，留给你的一息越短。',
    tip: '相生一断少 1 息，得从木重新起链',
    base: 48,
    params: { duration: 20, chainGoal: 10, windowMs: 2600 },
  },
  {
    id: 'tanlei', name: '勘位辨禁', game: 'mines', theme: 'tanlei', twist: 'tanlei',
    desc: '石格下埋着禁制，能看到只有周围露出的数字。按数字把禁位一格格勘出来，钉住再连开。',
    tip: '误触折 1 盏心神，耗尽即收功',
    base: 50,
    params: { cols: 6, rows: 6, mines: 6 },
  },
  {
    id: 'seal', name: '内视观窍', game: 'seal', theme: 'seal', twist: 'seal',
    desc: '十二处气窍阖着，两两相合才通一层。入定深了，会先照见一对。',
    tip: '翻错只是阖上，但多记一次翻牌、白费时',
    base: 56,
    params: { pairs: 6, cols: 4, flipMs: 850, timeLimit: 70 },
  },
  // 下面三门是「一看就懂」的经典玩法，都挂黄阶：规则不绕，前期就买得起。
  // 品阶只管收益与可修境界，难度仍由熟练度档位拧数值（flashMs / dropMs / depth）。
  {
    id: 'linkpair', name: '牵灵引线', game: 'link', theme: 'linkpair', twist: 'linkpair',
    desc: '同纹灵石两两相契，牵一条不过两折的灵线把这一对收回来。',
    tip: '错配或连不上都少 2 息，息尽收功',
    base: 34,
    params: { duration: 55, cols: 6, rows: 4, kinds: 6, flashMs: 900 },
  },
  {
    id: 'stackstone', name: '垒石筑基', game: 'blocks', theme: 'stackstone', twist: 'stackstone',
    desc: '灵石按息坠落，挪石转石把一层垒满，整层化去才算筑稳一分根基。',
    tip: '堆到顶立刻收功；垒满一层才化去',
    base: 36,
    // 盘面是标准场地 10×20，写在玩法层（minigames/blocks.js）里而不是这里——
    // 行数不是难度旋钮，改了这一门就不成立了。难度只拧两个数：
    // startLevel（起手第几级，决定落石速度）与 linesPerLevel（每化几层进一级）。
    params: { duration: 70, startLevel: 1, linesPerLevel: 10 },
  },
  {
    id: 'harvest', name: '换苗引秀', game: 'match', theme: 'harvest', twist: 'harvest',
    desc: '在灵畦里互换相邻两株，凑齐三株同色即采收；新苗落下还能再连锁。',
    // 这份是不带 params 的测试探针与「未选档」兜底，取简单档的值；局内与准备页一律走 tipFor()。
    // 由 tests/rank.test.js 守着它必须等于 tipFor(..., 'easy')，不许两处漂成不同的数。
    tip: '换不出三连少 1 息',
    base: 34,
    params: { duration: 60, cols: 6, rows: 6, kinds: 5, flashMs: 760 },
  },
  // 下面六门也是「看一眼就会玩」的经典盘面玩法，与上面三套一样挂黄阶：
  // 品阶按「这门功课有多难」定，这六门规则都直白，前期就该买得起。
  {
    id: 'shudu', name: '推填九宫', game: 'sudoku', theme: 'shudu', twist: 'shudu',
    desc: '九宫盘上留着空格，每行、每列、每宫都要把 1 到 9 各填一遍；填错一格会被记下。',
    tip: '填错一格罚 10 秒，时辰到没填完即收功',
    base: 38,
    // 盘面规格 / 挖洞数 / 时限与三条时间线由 SUDOKU_LEVELS 按难度档注入，这里不写死 4×4。
    params: {},
  },
  {
    id: 'heyuan', name: '同数相合', game: 'merge', theme: 'heyuan', twist: 'heyuan',
    desc: '整行整列往一个方向挤，同数相撞就合成双倍；空出来的格子里再补一块新的。',
    tip: '盘满又相邻无同数即走火，合出本档目标块就收功',
    base: 34,
    params: { cols: 4, rows: 4 },
  },
  {
    id: 'shumu', name: '循数疾点', game: 'schulte', theme: 'shumu', twist: 'shumu',
    desc: '盘上的数散乱摆着，从 1 顺着点到最后，点完即完成。',
    tip: '点错按档罚时',
    base: 32,
    params: {},
  },
  {
    id: 'rongdao', name: '挪块开路', game: 'klotski', theme: 'rongdao', twist: 'rongdao',
    desc: '盘上若干滑块，一次只挪一格；把 2×2 的主块一路让到底部的出口才算脱身。',
    tip: '步数用尽还没脱身，就是被困住了',
    base: 36,
    // 最优步数的上下限由 KLOTSKI_LEVELS 按难度档注入。
    params: {},
  },
  {
    id: 'tuisuo', name: '归箱入阵', game: 'pushbox', theme: 'tuisuo', twist: 'tuisuo',
    desc: '人走在石格上，石箱只推不拉；把每块石箱推到自己的阵位上，一处不落。',
    tip: '推错可退一步，推数照算；复位后本盘最高 A',
    base: 36,
    params: {},
  },
  {
    id: 'zeda', name: '择大辨微', game: 'biggest', theme: 'zeda', twist: 'zeda',
    desc: '一批数散在盘上，只管挑出最大的那一个；每挑对一次换一批新的。',
    tip: '点错不换轮，罚 2 秒',
    base: 30,
    params: {},
  },
];

// 玩法中文名：只写盘面上的动作，不写题材。与 minigames/ 各模块导出的 name 一一对应，
// 测试会断言两者不漂移。参悟方式名与这里不可重复（否则准备页标题和标签会撞词）。
const GAME_LABELS = {
  click: '顺光扫斩',
  hunt: '辨伪择真',
  memory: '记序复现',
  bridge: '循纹递推',
  tempo: '节律判定',
  sword: '步法连环',
  lights: '阵灯推演',
  wuxing: '五行相生',
  mines: '数格辨禁',
  seal: '成对翻牌',
  link: '灵纹连线',
  blocks: '落石垒基',
  match: '三秀同收',
  sudoku: '九宫填数',
  merge: '滑格相合',
  schulte: '顺序点格',
  klotski: '滑块让路',
  pushbox: '推石入位',
  biggest: '数中取大',
};

// 提示按钮各门叫法不同：跟着玩法名走，别在页面 JS 里散着写三元。
// 三秀同收的「照畦」必须和局内 HUD、名词速查同名叫法，不许一处写「提示」一处写「照畦」。
const HINT_LABELS = {
  match: '照畦',
  lights: '阵眼感应',
  seal: '入定照见',
};

function hintLabelOf(gameId) {
  return HINT_LABELS[gameId] || '提示';
}

// 游戏族：功法类别的分类标签，管谱系、色板与文案口吻。
// 玩法内核不按族复用——每门功法各有一套独立盘面（见 minigames/），同族也不共用。
// 加一族 = 这里补一行；加一门功法 = 补数据 + 一个玩法模块 + 主题 + 说明。
const FAMILIES = {
  刀法: { core: '顺光成路', note: '顺着箭头把刀扫到靶心，招长而折，容许多带两桩', kind: 'skill' },
  剑法: { core: '辨光取真', note: '在数道剑光里截真招，只有一门', kind: 'skill' },
  阵法: { core: '盘上推演', note: '同族都在方盘上推演：勘禁位、排五行、点阵灯', kind: 'skill' },
  心法: { core: '记忆与节律', note: '三门主修各考一样：节拍、记性、配对', kind: 'main' },
  // 丹道暂时空缺：凝露那门练的是河石采露（水术），不是炼丹。等真有一门「配药、控火、
  // 守炉」的功课再填进来，别为了凑满一门类把别的玩法硬塞给它。
  丹道: { core: '待补', note: '暂空缺：留给真正炼丹的功课', kind: 'skill' },
  水术: { core: '循纹递推', note: '看河石上的水纹递推，只有一门', kind: 'skill' },
  身法: { core: '步法连环', note: '照卷轴踏位，只有一门', kind: 'skill' },
  御灵: { core: '灵纹连线', note: '牵两枚同纹灵石，找一条不超过两折的通路', kind: 'skill' },
  土术: { core: '落石垒基', note: '挪石转石垒满一层，是唯一持续下落的盘面', kind: 'skill' },
  灵植: { core: '三秀同收', note: '互换相邻两株凑三连，采收后新苗落下还能连锁', kind: 'skill' },
  // 六门经典盘面各占一门类：都是黄阶，同阶不能撞类别，撞了谱系按阶取槽会盖掉后一门。
  术数: { core: '填数推演', note: '九宫盘上补数，行、列、宫各要一遍', kind: 'skill' },
  合术: { core: '同数相叠', note: '四向推盘，同数相撞就合上去', kind: 'skill' },
  目术: { core: '按序扫盘', note: '目光按序把整盘点一遍，考的是扫而不是记', kind: 'skill' },
  机巧: { core: '滑块让路', note: '一块一格地滑，给主块腾出底部的出口', kind: 'skill' },
  挪移: { core: '推石入位', note: '人走箱推、只推不拉，每块石箱对上自己的阵位', kind: 'skill' },
  辨术: { core: '择大辨微', note: '一堆数里挑最大的那个，考的是比较不是记性', kind: 'skill' },
};

const METHOD_MAP = {};
for (let i = 0; i < PRACTICE_METHODS.length; i += 1) {
  const m = PRACTICE_METHODS[i];
  m.gameName = GAME_LABELS[m.game] || m.game;
  METHOD_MAP[m.id] = m;
}

function getMethod(id) {
  return METHOD_MAP[id] || PRACTICE_METHODS[0];
}

function familyOf(type) {
  return FAMILIES[type] || { core: '', note: '', kind: 'skill' };
}

// ---------------------------------------------------------------- 品阶：管战力、耗气与可修境界
// 熟练度是「这一门练得多熟」，只由本局难度、评级与连 S 层数决定；
// 让高级功法练得更快，等于把低阶功法从成长线上直接淘汰，也和「难度跟人走」自相矛盾。
// 天地玄黄因此只决定三件事：运功耗气系数（qiCost，见 data/economy.js）、
// 属性加成系数（attr）、可修境界上下限。
// 高品阶更强，但练起来更费灵力，门槛靠获取方式与境界限制来制衡——不加速熟练度。
// needRealm 是学习门槛（1 炼气 / 2 筑基 / 3 金丹 / 4 元婴），maxRealm 是耗气不涨的上限。

const TIERS = [
  { key: 'huang', name: '黄', label: '黄阶', stars: 1, qiCost: economyData.TIER_QI.huang, attr: 1.00, needRealm: 1, maxRealm: 2, color: '#8a8f83', desc: '最常见的外门功课，便宜、够用，前期靠它起步。' },
  { key: 'xuan', name: '玄', label: '玄阶', stars: 2, qiCost: economyData.TIER_QI.xuan, attr: 1.30, needRealm: 2, maxRealm: 3, color: '#3d8c74', desc: '藏经阁里换得到的中阶功法，运功比黄阶费气。' },
  { key: 'di', name: '地', label: '地阶', stars: 3, qiCost: economyData.TIER_QI.di, attr: 1.70, needRealm: 3, maxRealm: 4, color: '#b8893b', desc: '多从切磋首胜里得的高阶功法，属性加成明显，也更耗灵力。' },
  { key: 'tian', name: '天', label: '天阶', stars: 4, qiCost: economyData.TIER_QI.tian, attr: 2.20, needRealm: 4, maxRealm: 9, color: '#b4453c', desc: '压箱底的绝学，战力最高，运功一次也最烧灵力。' },
];

const TIER_MAP = {};
for (let i = 0; i < TIERS.length; i += 1) TIER_MAP[TIERS[i].key] = TIERS[i];

function tierOf(key) {
  return TIER_MAP[key] || TIERS[0];
}

function tierIndexOf(key) {
  const t = TIER_MAP[key];
  return t ? TIERS.indexOf(t) : 0;
}

// ---------------------------------------------------------------- 难度档：跟人走
// 不随功法品阶变化，只看玩家在这门功法上的熟练度。档位越高，一局越贵（`qi` 是裸基数，
// 实价还要乘时长系数、品阶、悟性等系数，见 data/economy.js 的 practiceQiCost），
// 同时 pace 收紧、goal 抬高 —— 想拿全额熟练度与连 S 必须真打得过。
//
// 这里刻意没有「倍率」字段：熟练度不吃倍率（只由评级与连 S 决定），资源早已不在参悟里产出，
// 留着 mult 只会让卡片上写一个算不出来的 ×1.70。

const DIFFICULTIES = [
  { key: 'easy', name: '简单', need: 0, qi: economyData.RUN_QI[0], pace: 1.18, windowPace: 1.50, goal: 0.85, gear: 'normal', depth: 0, desc: '节奏最缓、目标最宽，也最省灵力，宜先练稳本门火候。' },
  { key: 'normal', name: '普通', need: 300, qi: economyData.RUN_QI[1], pace: 1.00, windowPace: 1.21, goal: 1.00, gear: 'normal', depth: 1, desc: '标准节奏与目标，入门之后方开。' },
  { key: 'hard', name: '困难', need: 1500, qi: economyData.RUN_QI[2], pace: 0.88, windowPace: 1.00, goal: 1.12, gear: 'hard', depth: 2, desc: '节奏收紧、目标抬高，失误余地更小。' },
  { key: 'expert', name: '极难', need: 6000, qi: economyData.RUN_QI[3], pace: 0.78, windowPace: 0.83, goal: 1.22, gear: 'hard', depth: 3, desc: '几乎没有容错，一乱即落。' },
  { key: 'desperate', name: '绝境', need: 24000, qi: economyData.RUN_QI[4], pace: 0.70, windowPace: 0.64, goal: 1.32, gear: 'hard', depth: 4, desc: '给练到极处的人：最快节奏、最高目标，也最耗灵力。' },
];

const DIFF_MAP = {};
for (let i = 0; i < DIFFICULTIES.length; i += 1) DIFF_MAP[DIFFICULTIES[i].key] = DIFFICULTIES[i];

function difficultyOf(key) {
  return DIFF_MAP[key] || DIFFICULTIES[0];
}

function diffKeyIndex(key) {
  const d = DIFF_MAP[key];
  return d ? DIFFICULTIES.indexOf(d) : 0;
}

// 这门功法当前熟练度实际解锁到第几档。
function diffIndexOf(prof) {
  const p = Math.max(0, Number(prof) || 0);
  let idx = 0;
  for (let i = 0; i < DIFFICULTIES.length; i += 1) {
    if (p >= DIFFICULTIES[i].need) idx = i;
  }
  return idx;
}

function bestDifficulty(prof) {
  return DIFFICULTIES[diffIndexOf(prof)].key;
}

// ---------------------------------------------------------------- 回关折减
// 关卡由熟练度算出（levels.levelFromProf），所以「打哪一关」就是「打多难」。
// 回打低关按「本关 ÷ 当前关」连续折减：
//
//   当前第 40 关，回打第 40 关 → ×1.00
//   当前第 40 关，回打第 30 关 → ×0.75
//   当前第 40 关，回打第 1  关 → ×0.025
//
// 为什么不用「每档折半」：档只有五级，同一章内第 1 关与第 40 关的折减系数都是 1，
// 而第 1 关的 S 率远高于第 40 关——**档内折减是空的**。老版最优点就是「在本章内刷第 1 关」，
// 这比刷最低档严重得多，因为章内第 1 关和第 40 关的收益完全一样，难度却差一整章。
// 按关折是连续的，也没有「一次退两档就 ×0.25」那种断崖。
function levelFactor(level, curLevel) {
  const cur = Math.max(1, Math.round(Number(curLevel) || 1));
  const lv = Math.max(1, Math.min(cur, Math.round(Number(level) || 1)));
  return lv / cur;
}

// 回关这一局的基础熟练度：四舍五入一次，不做逐档取整。
// 逐档取整是为「÷2 阶梯」服务的（34 → 17 → 9 → 5 要能对上），按关折是连续量，
// 只有一次乘法，取整也只有一次，玩家按「34 × 30 ÷ 40 = 25.5 → 26」能复算。
function profByLevel(base, level, curLevel) {
  return Math.round(Math.max(0, Math.round(Number(base) || 0)) * levelFactor(level, curLevel));
}

// 准备页那一行回关提示：说清退了几关、熟练度折成多少。只在真的回关时出现。
function retreatText(level, curLevel) {
  const cur = Math.max(1, Math.round(Number(curLevel) || 1));
  const lv = Math.max(1, Math.min(cur, Math.round(Number(level) || 1)));
  if (lv >= cur) return '';
  return '回打第 ' + lv + ' 关（本门当前第 ' + cur + ' 关）：熟练度按 ×'
    + String(Math.round(levelFactor(lv, cur) * 1000) / 1000) + ' 计，本局不叠连 S。'
    + '关只增不减，练到哪就在哪——回打只为找手感。';
}

// 小系数也要原样显示，toFixed(2) 会把 0.0625 写成 0.06 骗人。
function factorText(f) {
  return '×' + String(Math.round(f * 10000) / 10000);
}

// 五档的「时辰」共用一根尺子：所有带 duration / timeLimit 的玩法逐档收 3%。
// 以前档位只拧动画速度（flashMs / dropMs），时辰一动不动——玩家看不出这一档紧在哪。
// 三秀同收 / 九宫填数各有自己的整表（下面会覆盖），其余限时玩法一律走这里。
// 收 3% 而不是一成，是为了不把「高档」变成「来不及看清盘」；逐档累计到绝境是 88%。
const TIME_LEVELS = [1, 0.97, 0.94, 0.91, 0.88];

// 下面四张表是「审计找出来的区分度欠账」：这四门原本只有**一个**玩家看得见的参数
// 在五档间变化，其余全靠评级线在结算时乘个数。补的每一个数都由玩法层真的读：
//   mines → 心神盏数（HUD 上有几盏灯）；merge → 起手几块（开局盘面就少几格空地）；
//   schulte → 点错罚几秒（局内已经这么写）；pushbox → 推数预算系数（capPushes 直接读）。
// 不许为了过审计往 params 里塞一个玩法层不读的字段，那是假区分度。
const MERGE_START_TILES = [2, 2, 3, 3, 4];
const PUSHBOX_CAP_FACTORS = [2.2, 2.0, 1.9, 1.75, 1.6];

// 落石垒基的五档。这一门的规范来自 Tetris Guideline，五档只动两件事：
//   startLevel     起手第几级（重力档）：1 级 1000ms/格 → 15 级 7ms/格；
//   linesPerLevel  每化几层进一级：马拉松是 10，档位上收，速度爬得更快。
// 盘面固定 10×20、七种块、7-bag、三块预告、暂存、落定延迟 500ms 全部保持不变——
// 它们不是难度，是「这一门是俄罗斯方块」的定义。旧版把盘面从 8×8 到缩行数当难度，
// 结果行数越少越像罚站：三四块就顶到顶，留缝这件事根本没有余地。
// 章内的连续收紧在 levels.tweakParams 里做（起始级每 13 段抬一级、每级层数每 10 段减一层），
// 时辰仍走 LEVEL_TIME_KEYS 的逐段收紧。
//
// sLine 用启发式玩家实测标定（临时脚本 + 假时钟，每档 15 局取中位；脚本跑完即删）：
// 每局 60–70 秒。快手约 1.1 秒放一块、九成选最优列；熟练 1.5 秒、八成八；常人 2.0 秒、七成。
//   章 | 快手中位（下四分位） | 熟练中位 | 常人中位 || S 线 | A 线 | B 线
//    1 | 5184（4386）         | 2582     | 1092     || 4200 | 2520 | 1344
//    2 | 8248（6366）         | 3832     | 1846     || 6300 | 3780 | 2016
//    3 | 12466（11698）       | 5848     | 2352     || 9600 | 5760 | 3072
//    4 | 16982（14304）       | 9814     | 962      || 12600| 7560 | 4032
//    5 | 17838（9850）        | 6280     | 1194     || 10200| 6120 | 3264
// S 取快手的下四分位（四分之一打得快的也拿不到 S，这就是「S 要打得顺」）；
// A / B 是 gradeLimits 的 0.60 / 0.32 倍，落点对上「熟练 / 常人」那一列。
// **不是越难越高**：绝境起手第 8 级、更容易堆到顶，快手的下四分位反而比极难低，
// 所以第五章的 S 线比第四章低——照实写，不为了「看起来递增」往上抬。
const BLOCK_LEVELS = [
  { startLevel: 1, linesPerLevel: 10, sLine: 4200 },
  { startLevel: 2, linesPerLevel: 9, sLine: 6300 },
  { startLevel: 4, linesPerLevel: 8, sLine: 9600 },
  { startLevel: 6, linesPerLevel: 7, sLine: 12600 },
  { startLevel: 8, linesPerLevel: 6, sLine: 10200 },
];

// 下面三张表换的是「承重轴」：把难度从时间挪到复杂度上。
//
// 起因：五档的时间参数走同一套 pace / windowPace / TIME_LEVELS，跨度天然只有 1.7–2.3 倍，
// 而且人的反应时间练不出来——把难度压在「快」上，玩家越玩越焦虑而不是越玩越会。
// 复杂度不一样：盘面更大、路线更长、键位重排，玩家可以靠「想得透」跨过去。
//
// 三张表都只动「结构性」的量（盘面规格、需要记住的长度、要不要读符号），
// 不去压时间；时间在三门里几乎不动，只负责让节奏别拖。
//
// 顺光扫斩：旧版刀路 3→5 桩、盘面恒 3×3，真正的跨度全在光速（2.86 倍）。
// 现在盘面 3×3→5×5（9→25 格）、刀路 3→8 桩，复杂度 2.67 倍成为承重轴；
// 光速压缩同步收到 2.17 倍（见 weapons.js 的 dao.stepDecay 与 click.js 的 EASE_STEP），
// 刀光寿命从 windowPace 改走 pace，从 2.34 倍降到 1.69 倍——时间是佐味，不是主菜。
//
// lenStep 存的是「比本兵器的基准长几桩」，不是绝对桩数：params 是刀剑共用的，
// 存绝对值会把刀的 8 桩塞给剑（剑的 profile.maxLen 只有 4，语义就乱了）。
// 刀基准 3 桩 → 3/4/5/6/8；剑基准 2 桩 → 2/3/4/4/4（受 maxLen 封顶，剑本就只预留）。
const CLICK_LEVELS = [
  { grid: 9, cols: 3, lenStep: 0 },
  { grid: 9, cols: 3, lenStep: 1 },
  { grid: 16, cols: 4, lenStep: 2 },
  { grid: 16, cols: 4, lenStep: 3 },
  { grid: 25, cols: 5, lenStep: 5 },
];

// 步法连环：旧表 segments 3/4/4/5/5、baseLen 3/3/3/4/4——按模块的段长算法算，
// hard 与 normal 都是 18 步、expert 与 desperate 都是 30 步，五档实际只有三个配置。
// 现在五档各不相同（12/18/22/30/39 步，3.25 倍），并从困难档起「键位每段重排」：
// 玩家的位置记忆失效，必须真的读符号。时长反而从 20 调到 23（缩放后仍在 20 秒上下），
// 因为步数涨了三倍而时间不该跟着收——这一门练的是跟招，不是手速。
const SWORD_LEVELS = [
  { segments: 3, baseLen: 3, shuffle: false, duration: 20 },
  { segments: 4, baseLen: 3, shuffle: false, duration: 20 },
  { segments: 4, baseLen: 4, shuffle: true, duration: 21 },
  { segments: 5, baseLen: 4, shuffle: true, duration: 22 },
  { segments: 6, baseLen: 4, shuffle: true, duration: 23 },
];

// 数格辨禁：旧版盘面恒 6×6，五档只动禁制数（5→8）与心神（3→2），评级又只看用时——
// 复杂度几乎没有变化的空间，而 6×6 的扫雷本来就太浅。
// 现在盘面 6×6→9×9（36→81 格，2.25 倍）、禁制 5→12（2.4 倍，密度稳在 14–17%）。
// 时间线跟着格数走（见 mines.js 的 gradeLine），是「给足」不是「压缩」：
// 9×9 的 S 线 56 秒。推理链变长才是这一门真正的难，不是秒表。
const MINES_LEVELS = [
  { cols: 6, rows: 6, mines: 5, hearts: 3 },
  { cols: 6, rows: 6, mines: 6, hearts: 3 },
  { cols: 7, rows: 7, mines: 8, hearts: 3 },
  { cols: 8, rows: 8, mines: 10, hearts: 2 },
  { cols: 9, rows: 9, mines: 12, hearts: 2 },
];
// 旧的 MINES_HEARTS 仍然导出（测试与文档引用它），但改成从表里派生，只留一份真源。
const MINES_HEARTS = MINES_LEVELS.map(function (lv) { return lv.hearts; });

// 三秀同收的五档：盘面（花色）、时辰、三处罚息与评级线，一张表管全。
// 旧版只有「S 线 620 + depth×150」在变，60 息 / 5 色 / 罚 2 息四档全写死——
// 真控制器跑 12 局的结果：高手五档 12/12 全 S、常人绝境 10/12 S，等于同一局打五遍。
// 现在每档只收紧一到两个数（对应十二原则第三节「递增曲线平缓，无断崖」）：
//   简单→普通 收时辰与罚息；普通→困难 多一色；困难→极难 收时辰与罚息；极难→绝境 再多一色。
// sLine 不是「越难越高」，而是按**本档实测可得分**标定：花色越多，随机盘面凑出三连的
// 概率越低、连锁越短，同样的分数含金量不同。落点是「高手约 75–95% 拿得到、常人 5–25%」，
// 由 scripts/difficulty-audit.js 与 tests/rank.test.js 一起守，不许再拍脑袋 +150。
const MATCH_LEVELS = [
  { kinds: 5, duration: 68, missCost: 1, shuffleCost: 2, hintCost: 1, sLine: 1900 },
  { kinds: 5, duration: 60, missCost: 2, shuffleCost: 3, hintCost: 2, sLine: 1750 },
  { kinds: 6, duration: 58, missCost: 2, shuffleCost: 3, hintCost: 2, sLine: 1400 },
  { kinds: 6, duration: 55, missCost: 3, shuffleCost: 4, hintCost: 3, sLine: 1300 },
  { kinds: 7, duration: 52, missCost: 3, shuffleCost: 4, hintCost: 3, sLine: 950 },
];

function matchLevelOf(diffKey) {
  return MATCH_LEVELS[difficultyOf(diffKey).depth];
}

// 局内那行代价句要跟着本档罚息走：以前写死「少 2 息」，改了档就变成假话。
// 只有三秀同收的罚息按档变，其余门沿用 method.tip 这一份真源。
function tipFor(method, diffKey) {
  if (!method) return '';
  if (method.game === 'match') {
    return '换不出三连少 ' + matchLevelOf(diffKey).missCost + ' 息';
  }
  return method.tip;
}

// 阵灯推演的档位表：盘面规格 / 最优步数下限 / 步数预算。
// 以前是「限时 36 秒解尽量多盘」，按解开盘数评级；现在改成一盘推演、按步数评级，
// 所以这一门比的是「省」，不是「快」——和静心记诵诀（记序列）、三秀连收诀（消消乐）彻底分开。
// 规格按档递增：3×3 先把联动关系看懂，4×4 状态空间上一个量级，5×5 是拇指够得着的上限。
// 最优步数下限不写死：生成时解出来多长就是多长，落在 [min, min+2] 里才算数。
// 规格与「最优步数下限」都要单调递增：只放大盘面不够，4×4 上三两步就解开的盘
// 反而比 3×3 上四步的还轻松，档位会看起来倒挂。预算按最优步数留出三档余量。
const LIGHTS_LEVELS = [
  { size: 3, min: 2, cap: 9 },
  { size: 3, min: 3, cap: 12 },
  { size: 4, min: 4, cap: 16 },
  { size: 4, min: 5, cap: 18 },
  { size: 5, min: 5, cap: 22 },
];

function lightsLevelOf(diffKey) {
  return LIGHTS_LEVELS[difficultyOf(diffKey).depth];
}

// 九宫填数的档位表：盘面规格 / 挖洞数 / 时限 / 三条时间线。
// 规格按档递进：4×4 先把「行、列、宫各一遍」看懂，6×6 换宫格形状，9×9 才是正经数独。
// 挖洞越多越难；时限给得比 B 线宽一截，是为了让「填完但慢」还有个 C，
// 而不是一超线就直接判负——没填完（走火）和填得慢（C）是两件事。
const SUDOKU_LEVELS = [
  { size: 4, holes: 8, timeLimit: 150, tS: 45, tA: 70, tB: 100 },
  { size: 6, holes: 14, timeLimit: 240, tS: 80, tA: 120, tB: 170 },
  { size: 9, holes: 32, timeLimit: 420, tS: 170, tA: 240, tB: 330 },
  { size: 9, holes: 40, timeLimit: 420, tS: 190, tA: 270, tB: 370 },
  { size: 9, holes: 46, timeLimit: 420, tS: 210, tA: 300, tB: 410 },
];

function sudokuLevelOf(diffKey) {
  return SUDOKU_LEVELS[difficultyOf(diffKey).depth];
}

// 滑块让路的档位表：这一盘「最少几步脱身」的上下限。
// 只放最优步数不放盘面：4×4 的小盘已经够看，靠步数上下限就能一档一比一档难。
// 滑块让路的两条轴：最优步数（这一局有多绕）与预算系数（走错多少步还救得回来）。
// 预算以前固定 2.4，档越高最优步数越长、预算也越宽——「越难容错越大」，方向是反的。
// 系数一律不低于 2：C 线是「超过最优两倍才脱身」，预算若压到两倍以下，C 这一档就
// 直接不存在了（还没走到两倍就先判困住）。收紧的是「高档的余量比例」，不是把 C 砍掉。
// 现在系数随档收紧：简单 2.8 步余量宽，绝境 1.9 步余量窄，绝境才真会「困住了」。
// 系数只乘在最优步数上，另有 max(最优 + 2, …) 兜底——预算永远不会小于最优步数，
// 不会出现「明明能解却判 F」。
const KLOTSKI_LEVELS = [
  { minOpt: 2, maxOpt: 4, capFactor: 3.20 },
  { minOpt: 3, maxOpt: 6, capFactor: 2.90 },
  { minOpt: 4, maxOpt: 8, capFactor: 2.70 },
  { minOpt: 5, maxOpt: 10, capFactor: 2.50 },
  { minOpt: 6, maxOpt: 12, capFactor: 2.20 },
];

function klotskiLevelOf(diffKey) {
  return KLOTSKI_LEVELS[difficultyOf(diffKey).depth];
}

// 另外三门的档位表住在玩法模块里（合术 / 目术 / 挪移 / 辨术 各有一套自己的数），
// 这里只把「本档最关键的那个数」按档注入 params：准备页的难度说明要能写出
// 「这一档换成了什么」，不然高档位那行会照旧写「入门基准」。
// 模块里的默认表只在没带参数时兜底（测试探针直接 create 就是走那条路）。
const MERGE_TARGETS = [128, 256, 256, 512, 1024];
const SCHULTE_SIZES = [4, 5, 6, 6, 6];
// 与 minigames/schulte.js 的 PENALTIES 同值：这里只给准备页写「这一档罚几秒」，
// 局内判定仍以模块为准，两边由 verify 比对锁死（与 MERGE_TARGETS 同一套做法）。
const SCHULTE_PENALTIES = [2, 2, 3, 4, 5];
// 推石入位的档位表：原来是「第几张石图」——五张图固定，第三遍开始玩家记的是答案，
// 「先给谁让路」的推演就退化成回忆。现在这一列写的是**这一档的规格**：
// 盘面恒六格（4×4 内盘），变的是几处阵位、几道内墙、最优推数落在哪个区间。
// 玩法层按这三个数现抽一张图（每局不同），所以它们不是给人看的装饰，是生成参数。
// 与 minigames/pushbox.js 的 GEN 必须逐档同值：两处分叉时准备页写「3 处阵位」、
// 局内却抽到 2 箱，只有连打两局才看得出来，verify 会逐档比对。
const PUSHBOX_LEVELS = [
  { inner: 4, boxes: 1, walls: 0, minOpt: 2, maxOpt: 3 },
  { inner: 4, boxes: 1, walls: 1, minOpt: 2, maxOpt: 4 },
  { inner: 4, boxes: 2, walls: 1, minOpt: 3, maxOpt: 5 },
  { inner: 5, boxes: 2, walls: 2, minOpt: 4, maxOpt: 6 },
  { inner: 5, boxes: 3, walls: 2, minOpt: 5, maxOpt: 8 },
];
const BIGGEST_LEVELS = [
  { count: 9, rounds: 8 },
  { count: 11, rounds: 10 },
  { count: 13, rounds: 12 },
  { count: 15, rounds: 14 },
  { count: 16, rounds: 16 },
];

function sLineOf(method, diffKey) {
  if (!method || method.game !== 'match') return 0;
  return matchLevelOf(diffKey).sLine;
}

// 准备页那一整行 S 线文案：分数线与盘数线口径不同，别在页面 JS 里各拼一遍。
function sLineText(method, diffKey) {
  if (!method) return '';
  if (method.game === 'match') {
    const lv = matchLevelOf(diffKey);
    // 评级线随盘面变难而略降，这句必须当场说明，不然玩家会以为算错了。
    return '本档 ' + lv.kinds + ' 色 · ' + lv.duration + ' 息 · 换不出少 ' + lv.missCost + ' 息'
      + ' · S 线 ' + lv.sLine + ' 分（盘面越难，同样分数越难得）；评级只看总分';
  }
  if (method.game === 'lights') {
    const lv = lightsLevelOf(diffKey);
    return '本档 ' + lv.size + '×' + lv.size + ' 盘 · 步数预算 ' + lv.cap + ' 步 · 一步不浪费才入 S';
  }
  return '';
}

// ---------------------------------------------------------------- 参数缩放
// 时间 / 判定窗类：pace 越小越难。window 是 0~1 的小数，保留三位。
const PACE_KEYS = ['interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'dropMs', 'window', 'msPerNote', 'life'];
// 判定窗口类曾经单独一档：窗口每短一成，容错掉的不是一成，所以收紧得比 pace 陡。
// 现在只剩刀光寿命（`life`）一个成员，而它正是「把难度压在时间上」最典型的一处——
// 2.34 倍的压缩让扫斩的绝境档变成纯手速活。把它并回 PACE_KEYS（1.69 倍）之后，
// 扫斩的承重交给刀路与盘面，时间退成佐味。WINDOW_KEYS 保留为空数组，
// 是为了 diffDetail 的拼接不用改分支；将来真有第二个「窗口类」参数时把它放回来。
const WINDOW_KEYS = [];
// 数量 / 目标类：goal 越大越难。均为整数。
const GOAL_KEYS = ['chainGoal', 'maxRound', 'segments', 'beats', 'scramble', 'mines', 'pairs', 'decoys', 'startLen', 'baseLen'];
// speed 是光环每 tick 的收缩量，方向与时间类相反。
const SPEED_KEY = 'speed';

const FIELD_LABELS = {
  interval: '灵光间隔', life: '刀光停留', flashMs: '亮起时长', gapMs: '闪烁间隔', windowMs: '相生之窗', msPerNote: '每字限时',
  shuffleMs: '水流变阵', flipMs: '翻牌停留', dropMs: '落石间隔', window: '判定窗', speed: '气机收敛',
  startLevel: '起手级数', linesPerLevel: '每级层数',
  chainGoal: '连生目标', maxRound: '口诀轮数', segments: '步法段数', beats: '息数',
  scramble: '打乱步数', mines: '禁制数', pairs: '气窍对数', decoys: '影子数',
  startLen: '起始字数', baseLen: '每步长度', steps: '最少步数',
  duration: '时辰', timeLimit: '时辰', hearts: '心神', startTiles: '起手块',
  penaltySec: '点错罚', capFactor: '推数预算',
};

function capFor(key, src) {
  if (key === 'pairs') return 8;                       // seal.js 的 SIGNS 只有 8 个
  if (key === 'decoys') return (src.grid || 12) - 1;
  if (key === 'mines') return (src.cols || 6) * (src.rows || 6) - 2;
  if (key === 'startLen') return src.grid || 9;
  if (key === 'scramble') return (src.size || 3) * (src.size || 3);
  if (key === 'maxRound') return 12;
  if (key === 'chainGoal') return 20;
  if (key === 'segments') return 8;
  if (key === 'beats') return 16;
  if (key === 'baseLen') return 6;
  return 999;
}

// 一个难度档的原始参数，不做章内混合。depthIndex 允许取到 5：
// 第 5 章后面没有第 6 张表，就在绝境档上再压 6%，好让第 200 关真的是最难一关。
function pseudoDiff(depthIndex) {
  const idx = Math.round(depthIndex);
  if (idx <= 4) return DIFFICULTIES[Math.max(0, idx)];
  const base = DIFFICULTIES[4];
  return {
    key: 'desperate+', name: '绝境末段', need: base.need, qi: base.qi,
    pace: base.pace * 0.94, windowPace: base.windowPace * 0.94, goal: base.goal * 1.06,
    gear: 'hard', depth: 4,
  };
}

function rawParams(method, depthIndex) {
  const d = pseudoDiff(depthIndex);
  const src = (method && method.params) || {};
  const out = {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i += 1) out[keys[i]] = src[keys[i]];
  for (let i = 0; i < PACE_KEYS.length; i += 1) {
    const k = PACE_KEYS[i];
    if (typeof out[k] === 'number') out[k] = Math.round(out[k] * d.pace * 1000) / 1000;
  }
  for (let i = 0; i < WINDOW_KEYS.length; i += 1) {
    const k = WINDOW_KEYS[i];
    if (typeof out[k] === 'number') out[k] = Math.round(out[k] * d.windowPace);
  }
  for (let i = 0; i < GOAL_KEYS.length; i += 1) {
    const k = GOAL_KEYS[i];
    if (typeof out[k] === 'number') out[k] = Math.max(1, Math.min(capFor(k, out), Math.round(out[k] * d.goal)));
  }
  // 时辰按档收紧：这是「这一档到底紧在哪」最直白的一条，玩家一进局就看得见倒计时。
  // 放在各门整表注入之前，好让三秀同收 / 九宫填数用自己那张表覆盖。
  const timeScale = TIME_LEVELS[d.depth];
  if (typeof out.duration === 'number') out.duration = Math.max(8, Math.round(out.duration * timeScale));
  if (typeof out.timeLimit === 'number') out.timeLimit = Math.max(8, Math.round(out.timeLimit * timeScale));
  // depth 是「第几档」（0–4），不做任何缩放，直接透传。
  // gear 只有 normal / hard 两值，玩法拿它分不出困难与绝境，容易一档一个样。
  out.depth = d.depth;
  // 三秀同收的五档整表注入：玩法层只读 params，不再自己拼 620 + depth×150。
  // 这几个键不在 PACE / GOAL 缩放名单里，免得被 pace 又乘一遍（花色与罚息是整数）。
  if (method && method.game === 'match') {
    const lv = MATCH_LEVELS[d.depth];
    out.kinds = lv.kinds;
    out.duration = lv.duration;
    out.missCost = lv.missCost;
    out.shuffleCost = lv.shuffleCost;
    out.hintCost = lv.hintCost;
    out.sLine = lv.sLine;
  }
  // 阵灯推演按「已走步数 / 最优步数」评级，盘面规格与步数预算由这一份表按档注入。
  if (method && method.game === 'lights') {
    const lv = LIGHTS_LEVELS[d.depth];
    out.size = lv.size;
    out.minSteps = lv.min;
    out.capSteps = lv.cap;
  }
  // 九宫填数：规格、挖洞数与三条时间线都按档注入，玩法层不再自己写死 4×4。
  if (method && method.game === 'sudoku') {
    const lv = SUDOKU_LEVELS[d.depth];
    out.size = lv.size;
    out.holes = lv.holes;
    out.timeLimit = lv.timeLimit;
    out.tS = lv.tS;
    out.tA = lv.tA;
    out.tB = lv.tB;
  }
  // 滑块让路：本盘最优步数的上下限 + 步数预算系数，盘面固定 4×4。
  // capFactor 以前不注入，模块里那句 `p.capFactor || 2.4` 永远走兜底——
  // 界面上写着「预算 ×2.40」，五档其实一模一样。
  if (method && method.game === 'klotski') {
    const lv = KLOTSKI_LEVELS[d.depth];
    out.minOpt = lv.minOpt;
    out.maxOpt = lv.maxOpt;
    out.capFactor = lv.capFactor;
  }
  // 档位表住在模块里的四门：只注入本档最关键的那个数，给准备页的难度说明用。
  if (method && method.game === 'merge') out.target = MERGE_TARGETS[d.depth];
  if (method && method.game === 'schulte') out.size = SCHULTE_SIZES[d.depth];
  // 推石入位：档位不再指定「第几张图」，而是给生成器三样规格——几处阵位、几道内墙、
  // 最优推数区间。图每局现抽，玩家打第二局时盘面就是新的。
  if (method && method.game === 'pushbox') {
    const lv = PUSHBOX_LEVELS[d.depth];
    out.inner = lv.inner;
    out.boxes = lv.boxes;
    out.walls = lv.walls;
    out.minOpt = lv.minOpt;
    out.maxOpt = lv.maxOpt;
  }
  if (method && method.game === 'biggest') {
    out.count = BIGGEST_LEVELS[d.depth].count;
    out.rounds = BIGGEST_LEVELS[d.depth].rounds;
  }
  // 换承重轴的三门：盘面规格、刀路长度、键位是否重排，全由整表注入。
  // 表里每个数都真的被玩法层读走（grid/cols 决定生成层，len 决定刀路桩数，
  // shuffle 决定按键要不要重排），不塞「玩法不读」的字段去骗审计。
  if (method && method.game === 'click') {
    const lv = CLICK_LEVELS[d.depth];
    out.grid = lv.grid;
    out.cols = lv.cols;
    // 存增量而不是绝对值：见 CLICK_LEVELS 上方注释（刀剑共用 params）。
    out.lenStep = lv.lenStep;
  }
  if (method && method.game === 'sword') {
    const lv = SWORD_LEVELS[d.depth];
    out.segments = lv.segments;
    out.baseLen = lv.baseLen;
    out.shuffle = lv.shuffle;
    // 时长也走表：段数涨了三倍，时间不该跟着收——这一门练的是跟招，不是手速。
    out.duration = lv.duration;
  }
  if (method && method.game === 'mines') {
    const lv = MINES_LEVELS[d.depth];
    out.cols = lv.cols;
    out.rows = lv.rows;
    out.mines = lv.mines;
    out.hearts = lv.hearts;
  }
  // 落石垒基：盘面是标准场地，不进 params；五档只注入起始级、每级层数与 S 线。
  // 玩法层三样都真的读走（重力表按级取、meter 写「再 N 层进级」、评级看分）。
  if (method && method.game === 'blocks') {
    const lv = BLOCK_LEVELS[d.depth];
    out.startLevel = lv.startLevel;
    out.linesPerLevel = lv.linesPerLevel;
    out.sLine = lv.sLine;
  }
  if (method && method.game === 'merge') out.startTiles = MERGE_START_TILES[d.depth];
  if (method && method.game === 'schulte') out.penaltySec = SCHULTE_PENALTIES[d.depth];
  if (method && method.game === 'pushbox') out.capFactor = PUSHBOX_CAP_FACTORS[d.depth];
  // steps 是「这盘最少几步」这类按档递增的量：params 里写的是简单档的值，每档 +1。
  if (typeof out.steps === 'number') out.steps += d.depth;
  if (typeof out[SPEED_KEY] === 'number') out[SPEED_KEY] = Math.round(out[SPEED_KEY] / d.pace * 10000) / 10000;
  // 末章没有「下一档」，靠这一行继续收紧，否则第 161 关与第 200 关会一模一样。
  if (depthIndex > 4) {
    if (typeof out.duration === 'number') out.duration = Math.max(8, Math.round(out.duration * 0.94));
    if (typeof out.timeLimit === 'number') out.timeLimit = Math.max(8, Math.round(out.timeLimit * 0.94));
  }
  return out;
}

// 档位参数：老接口，按难度键取本章基准（第 1 段）。
function buildParams(method, diffKey) {
  return rawParams(method, difficultyOf(diffKey).depth);
}

// 章内收紧：一章 40 关，末关比首关紧三成。这个数只乘「越短越难」的量，
// 不碰盘面规格——6 列混 7 列算出来还是 6 列，那是假变化。
const LEVEL_TIGHTEN = 0.30;
const LEVEL_TIME_KEYS = ['duration', 'timeLimit', 'interval', 'flashMs', 'gapMs', 'windowMs',
  'shuffleMs', 'flipMs', 'dropMs', 'msPerNote', 'life', 'capFactor', 'capSteps', 'minSteps',
  'window', 'penaltySec'];

// 某一关的完整参数。一段一关，所以相邻两关本该逐位不同——但「本该」不等于「一定」：
// 七门的可动范围只够三五十格到一百多格（点灯破阵 31 / 踏云连环 36 / 一眼摘魁 37 /
// 扫目逐数 52 / 万石成岳 108 / 吐纳周天 123 / 让主出阵 166），其余各关参数一字不动。
// 界面据实报「与上一关规格相同」，见 `levelDelta`。
//
// 章内只做一件事：把本档的时间与预算按段收紧，方向永远是「更难」。
// 不朝下一章插值——九宫从 4×4 换 6×6 时下一章的时间反而更多（换盘要留读盘时间），
// 朝它插值会让章内时间越打越多，那是反的。
function buildParamsAt(method, level) {
  const lv = levelData.clampLevel(level);
  const ch = levelData.chapterOf(lv);
  const f = levelData.progressOf(lv);
  const out = rawParams(method, ch);
  const tighten = 1 - LEVEL_TIGHTEN * f;
  for (let i = 0; i < LEVEL_TIME_KEYS.length; i += 1) {
    const k = LEVEL_TIME_KEYS[i];
    if (typeof out[k] !== 'number') continue;
    const min = k === 'capSteps' || k === 'minSteps' ? 3 : k === 'timeLimit' || k === 'duration' ? 8 : 0;
    out[k] = Math.max(min, levelRound(k, out[k] * tighten));
  }
  out.depth = ch;
  out.level = lv;
  out.chapter = ch;
  out.stage = levelData.stageOf(lv);
  return levelData.tweakParams(method, out, lv);
}

// 逐键取整：小数比例（判定窗 0.09）与预算系数（×2.2）不能被四舍五入成整数，
// 否则「每段收紧一点」在第一段就把 2.2 变成 2，之后再怎么收都是 2。
function levelRound(key, v) {
  if (key === 'window') return Math.round(v * 1000) / 1000;
  if (key === 'capFactor') return Math.round(v * 100) / 100;
  if (key === 'penaltySec') return Math.round(v * 10) / 10;
  return Math.round(v);
}

// 这一关的「小变化」：拿上一关的参数逐项比，只报玩家看得懂的。
// 比较基准一定是同一门、本关减一（`STAGE_SPAN`），而不是「与简单档比」——玩家看的是脚下这一步。
function levelDelta(method, level) {
  const lv = levelData.clampLevel(level);
  const prevLv = lv - levelData.STAGE_SPAN;
  if (prevLv < 1) return [];
  const now = buildParamsAt(method, lv);
  const prev = buildParamsAt(method, prevLv);
  const ordered = PACE_KEYS.concat(WINDOW_KEYS, GOAL_KEYS,
    ['duration', 'timeLimit', 'sLine', 'hearts', 'startTiles', 'penaltySec', 'capFactor',
      'capSteps', 'minSteps', 'fourRate', 'lineScale', 'startLevel', 'linesPerLevel']).filter(function (k) {
    return k !== 'speed';
  });
  const out = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const k = ordered[i];
    if (typeof now[k] !== 'number' || typeof prev[k] !== 'number') continue;
    if (now[k] === prev[k]) continue;
    // 格式化之后一样就不再报：毫秒级差 1ms 写出来是「0.82 秒 → 0.82 秒」，
    // 玩家只会以为这游戏在骗他。
    const a = levelFmt(k, prev[k]);
    const b = levelFmt(k, now[k]);
    if (a === b) continue;
    out.push({ key: k, label: LEVEL_LABELS[k] || FIELD_LABELS[k] || k, text: (LEVEL_LABELS[k] || FIELD_LABELS[k] || k) + ' ' + a + ' → ' + b });
    if (out.length >= 2) break;
  }
  return out;
}

// 关卡表里独有的两个旋钮（合术起手 4 的比例、勘禁 S 线系数）没有通用标签。
const LEVEL_LABELS = { fourRate: '起手给 4', lineScale: 'S 线', startLevel: '起手级数', linesPerLevel: '每级层数' };

function levelFmt(key, value) {
  if (key === 'fourRate' || key === 'lineScale') return Math.round(value * 100) + '%';
  if (key === 'startTiles') return Math.round(value) + ' 块';
  // 判定窗与罚时是小数：fmtField 会四舍五入成整数，写出来就成了「0 → 0」「2 秒 → 2 秒」。
  if (key === 'window') return (Math.round(value * 1000) / 10).toFixed(1) + '%';
  if (key === 'penaltySec') return value.toFixed(1) + ' 秒';
  if (key === 'capFactor') return '×' + value.toFixed(2);
  if (key === 'startLevel') return '第 ' + Math.round(value) + ' 级';
  if (key === 'linesPerLevel') return Math.round(value) + ' 层';
  return fmtField(key, value);
}

// 这一行是给玩家读的：毫秒一律折成秒（660.8ms 这种数字没人会去比），
// 计数保持整数；判定窗 / 气机收敛是内部倍率，读不出意义，干脆不摆。
const MS_FIELDS = ['interval', 'life', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'dropMs', 'msPerNote'];
const HIDDEN_FIELDS = ['window', 'speed'];

function fmtField(key, value) {
  if (MS_FIELDS.indexOf(key) >= 0) return (value / 1000).toFixed(2) + ' 秒';
  if (key === 'duration' || key === 'timeLimit' || key === 'penaltySec') return Math.round(value) + ' 秒';
  if (key === 'hearts') return Math.round(value) + ' 盏';
  if (key === 'capFactor') return '×' + value.toFixed(2);
  if (key === 'startLevel') return '第 ' + Math.round(value) + ' 级';
  if (key === 'linesPerLevel') return Math.round(value) + ' 层';
  return String(Math.round(value));
}

// 给参悟准备页看的难度说明：与最简单档对比，列出这一档实际收紧了哪几处。
// 同一个字段在不同门里的叫法不同：capFactor 对推石入位是「推数预算」，对滑块让路是
// 「步数预算」。两边共用一个键，但玩家的口径不一样——写错一边就等于说明页在说别人的话。
function labelOf(method, key) {
  if (key === 'capFactor') return method && method.game === 'klotski' ? '步数预算' : '推数预算';
  return FIELD_LABELS[key] || key;
}

function diffDetail(method, diffKey) {
  const d = difficultyOf(diffKey);
  const base = buildParams(method, 'easy');
  const now = buildParams(method, diffKey);
  const changes = [];
  // 时辰与四门新注入的档位参数也要进「本档紧在哪」：不然准备页写了「入门基准」，
  // 盘上的倒计时 / 心神 / 起手块却真的变了，说明和局内对不上。
  const ordered = PACE_KEYS.concat(WINDOW_KEYS, GOAL_KEYS,
    ['duration', 'timeLimit', 'hearts', 'startTiles', 'penaltySec', 'capFactor', 'steps', SPEED_KEY,
      'startLevel', 'linesPerLevel']).filter(function (k) {
    return HIDDEN_FIELDS.indexOf(k) < 0;
  });
  for (let i = 0; i < ordered.length && changes.length < 3; i += 1) {
    const k = ordered[i];
    if (typeof now[k] !== 'number' || typeof base[k] !== 'number') continue;
    if (now[k] === base[k]) continue;
    changes.push({
      key: k,
      label: labelOf(method, k),
      text: labelOf(method, k) + ' ' + fmtField(k, base[k]) + ' → ' + fmtField(k, now[k]),
    });
  }
  // 阵灯推演的难度不是「快慢」而是「盘面多大、预算多紧」，按时间类字段拼 brief 只会
  // 拼出一句「入门基准」。这一门单独说清规格与预算，准备页的难度说明才不会自相矛盾。
  let brief;
  if (method && method.game === 'match') {
    const lv = matchLevelOf(diffKey);
    brief = lv.kinds + ' 色 · ' + lv.duration + ' 息 · 换不出少 ' + lv.missCost + ' 息'
      + ' · 重排少 ' + lv.shuffleCost + ' 息 · S ' + lv.sLine + ' 分';
  } else if (method && method.game === 'lights') {
    const lv = lightsLevelOf(diffKey);
    brief = lv.size + '×' + lv.size + ' 盘 · 最优 ' + lv.min + ' 步起 · 预算 ' + lv.cap + ' 步';
  } else if (method && method.game === 'sudoku') {
    const lv = sudokuLevelOf(diffKey);
    brief = lv.size + '×' + lv.size + ' 盘 · 要填 ' + lv.holes + ' 格 · S 线 ' + lv.tS + ' 秒';
  } else if (method && method.game === 'klotski') {
    const lv = klotskiLevelOf(diffKey);
    brief = '4×4 小盘 · 最优 ' + lv.minOpt + '～' + lv.maxOpt + ' 步 · 预算 ×' + lv.capFactor.toFixed(2);
  } else if (method && method.game === 'merge') {
    brief = '本档要合出 ' + now.target + ' 一块 · 起手 ' + now.startTiles + ' 块';
  } else if (method && method.game === 'schulte') {
    brief = now.size + '×' + now.size + ' 盘 · ' + now.size * now.size + ' 个数 · 误点罚 ' + SCHULTE_PENALTIES[d.depth] + ' 秒';
  } else if (method && method.game === 'pushbox') {
    // 每局现抽图，所以写「本档规格」而不是「第几张」：玩家要知道的是这一档会给他几处阵位、
    // 最难难到哪里，而不是一张他这辈子只会见到一次的图的编号。
    const side = now.inner + 2;
    brief = side + '×' + side + ' 盘 · ' + now.boxes + ' 处阵位'
      + (now.walls ? ' · ' + now.walls + ' 道内墙' : '')
      + ' · 每局重排 · 最优 ' + now.minOpt + '～' + now.maxOpt + ' 推';
  } else if (method && method.game === 'biggest') {
    brief = '本档 ' + now.rounds + ' 轮 · 每轮盘上 ' + now.count + ' 个数';
  } else if (method && method.game === 'click') {
    const lv = CLICK_LEVELS[d.depth];
    // 3 是刀的基准桩数（weapons.js 的 dao.baseLen）。CLICK_LEVELS 只服务刀这一套 profile，
    // 将来真有剑法挂上来时，基准要从 profile 里取，别把这个 3 抄过去。
    brief = lv.cols + '×' + lv.cols + ' 盘 · 刀路 ' + (lv.lenStep + 3) + ' 桩';
  } else if (method && method.game === 'sword') {
    const lv = SWORD_LEVELS[d.depth];
    brief = lv.segments + ' 段 · 段长 ' + lv.baseLen + ' 起' + (lv.shuffle ? ' · 每段键位重排' : '');
  } else if (method && method.game === 'mines') {
    const lv = MINES_LEVELS[d.depth];
    brief = lv.cols + '×' + lv.rows + ' 盘 · ' + lv.mines + ' 处禁制 · ' + lv.hearts + ' 盏心神';
  } else if (method && method.game === 'blocks') {
    // 盘面是标准场地（10×20），写出来是让玩家知道「这一门不是小盘俄罗斯方块」；
    // 真正随档变的是起手级数与每级层数——这两句才是难度。
    brief = '10×20 标准场地 · 起手第 ' + now.startLevel + ' 级 · 每化 '
      + now.linesPerLevel + ' 层进一级 · 七种块 · 三块预告';
  } else {
    brief = changes.length
      ? changes.map(function (c) { return c.text; }).join(' · ')
      : '入门基准：节奏最缓、目标最宽，宜先练稳本门火候。';
  }
  return {
    key: d.key,
    name: d.name,
    qiBase: d.qi,
    desc: d.desc,
    brief: brief,
    changes: changes,
  };
}

// ---------------------------------------------------------------- 阶段新法
// 熟练度不只是「解锁更难的同一件事」：到了某个阶段，这一门的规则本身会变。
// at 用的是熟练度阶段下标（world.TIERS）：0 未入门 / 1 入门 / 2 小成 / 3 大成 / 4 圆满 / 5 大圆满。
// 与难度档分工：档位只拧数值（多长、多快、门槛多高），阶段才换规则。
// 玩法层读 perks.tier 落地；这里同时供准备页列出「本门新法」。
// short 是给「怎么玩」收起时那一行速记用的：只写动作，不写第几轮起——
// 收起态是给已经会玩的人看一眼的，展开态才讲条件与代价。
// hard: true 标记这批新法是「改规则」而不是「给便利」——逆诵会改点击方向、死门会多一格
// 不能碰的，玩家可能想关掉专心练基础。只有带这个标记的才在准备页给开关；
// 勘位 / 照纹 / 稳基那类纯加成没有理由关，多一个开关只是多一处看不懂。
const STAGE_RULES = {
  recite: [
    { at: 3, name: '逆诵', short: '倒着点', hard: true, desc: '第 3 轮起，奇轮要从未字往前点回' },
    { at: 4, name: '叠印', short: '同一格连点两下', hard: true, desc: '第 5 轮起，口诀里会出现重复的格子' },
  ],
  arrayEye: [
    { at: 3, name: '死门', short: '✕ 格点不得', hard: true, desc: '盘上多一格暗红 ✕ 死门，点到整盘复位并罚 3 步' },
    { at: 4, name: '双门', short: '死门两处', hard: true, desc: '死门增至两格；想专心推演可在准备页关掉' },
  ],
  forge: [
    { at: 3, name: '收势', short: '到靶心停一拍', hard: true, desc: '扫到靶心要停一拍再抬手；抢着抬算收势未成，只给半分并断刀势' },
    { at: 4, name: '禁桩', short: '绕开红叉', hard: true, desc: '盘上多出红叉禁桩，划到即断刀势；绕开它把刀路走完才算数' },
    { at: 5, name: '双锋', short: '双刀路挑呼吸的', hard: true, desc: '同时亮两道刀路，只有靶心在呼吸的那道是真招，划错断势' },
  ],
  // 循数勘禁诀是黄阶入门功法，阶段新法只给「看得更清」的便利，不往经典扫雷里加新规则。
  tanlei: [
    { at: 3, name: '勘位', short: '开局标 3 处', desc: '大成起每局开局勘出 3 处禁位并标出' },
    { at: 5, name: '洞玄', short: '开局标 5 处', desc: '大圆满起每局开局勘出 5 处禁位' },
  ],
  // 九套经典玩法是黄阶里的入门功课，阶段新法只给「看得更清 / 手更稳」的便利，
  // 不往经典规则里塞新花样——看一眼就会玩，才配叫简单。
  linkpair: [
    { at: 3, name: '照纹', short: '提示不扣息', desc: '大成起「照纹」提示不再扣息' },
    { at: 5, name: '自移', short: '死局重排不扣息', desc: '大圆满起死局重排不再扣息' },
  ],
  stackstone: [
    { at: 3, name: '稳基', short: '落石放慢一拍', desc: '大成起落石间隔放宽一拍，留出转石的时间' },
    { at: 5, name: '层叠', short: '化层多一成', desc: '大圆满起每化一层的得分再高一成' },
  ],
  // 十二原则第十一节：阶段新法要「加规则」而不是「减难度」，便利必须留明码代价。
  // 所以「照畦不扣息 / 重排不扣息」改成「各少扣 1 息」——仍然要付，只是练到后面更划算；
  // 连锁加成也改成「连锁三层起才额外加成」，得先打出连锁才拿得到，不是白送。
  harvest: [
    { at: 3, name: '照畦', short: '提示少扣 1 息', desc: '大成起「照畦」少扣 1 息（仍要付），卡局时不必再为这两息犹豫' },
    { at: 5, name: '连收', short: '三层起加成', desc: '大圆满起连锁第 3 层起额外加成、重排少扣 1 息：奖励打出长连锁，不是白送分' },
  ],
  // 九宫填数同样是黄阶入门：阶段新法只给「看得更清」，不往数独里塞新规则。
  // 密勘只标「这里是唯一空位」，连校只标「同一个数在哪」——两条都不说该填几。
  shudu: [
    { at: 3, name: '密勘', short: '唯一空位描一圈', desc: '大成起某行 / 列 / 宫只剩一个空位时，那一格描一圈：省一次全盘扫视，填几仍要自己想' },
    { at: 5, name: '唯余', short: '唯一候选描金', desc: '大圆满起选中空格时，同行列宫排除后只剩一个数，那个键描金：省一次心算，填不填仍由你' },
  ],
  // 推石入位是挪移类的操作功课：阶段新法只给「看得更清」，不往推箱里加规则。
  // 死位说的是「推到这里就再也推不出来」，与「该往哪推」是两件事——后者仍是玩家的事。
  tuisuo: [
    { at: 3, name: '死位', short: '死格压暗纹', desc: '大成起，石箱推到那里就再也推不出来的格子压一道斜纹：省一次「推过去才发现卡死」，该往哪推仍要自己看' },
    { at: 5, name: '临渊', short: '一推就进死位先描红', desc: '大圆满起，石箱离死位只差一推时，那个死格描红：暗纹说「这格不能进」，描红说的是「再推一格就完了」' },
  ],
};

function stageRulesOf(methodId) {
  return STAGE_RULES[methodId] || [];
}

// 参数表里唯一的**内部键**：depth 是档位索引（0–4），玩家在盘上看不见它，
// 也不该被当成「这一档变难了」的证据。审计脚本与 tests/rank.test.js 都读这一份，
// 不许各抄一份名单——曾经这里写着 gear / sBase / sStep 三个键，实测一个都不在参数表里，
// 挂在名单上只会让人以为背后有机制（见 04-open-issues B4）。
const INTERNAL_PARAM_KEYS = ['depth'];

module.exports = {
  PRACTICE_METHODS: PRACTICE_METHODS,
  METHOD_MAP: METHOD_MAP,
  INTERNAL_PARAM_KEYS: INTERNAL_PARAM_KEYS,
  GAME_LABELS: GAME_LABELS,
  HINT_LABELS: HINT_LABELS,
  MATCH_LEVELS: MATCH_LEVELS,
  matchLevelOf: matchLevelOf,
  tipFor: tipFor,
  TIME_LEVELS: TIME_LEVELS,
  MINES_HEARTS: MINES_HEARTS,
  CLICK_LEVELS: CLICK_LEVELS,
  SWORD_LEVELS: SWORD_LEVELS,
  MINES_LEVELS: MINES_LEVELS,
  BLOCK_LEVELS: BLOCK_LEVELS,
  MERGE_START_TILES: MERGE_START_TILES,
  PUSHBOX_CAP_FACTORS: PUSHBOX_CAP_FACTORS,
  FAMILIES: FAMILIES,
  TIERS: TIERS,
  DIFFICULTIES: DIFFICULTIES,
  STAGE_RULES: STAGE_RULES,
  getMethod: getMethod,
  familyOf: familyOf,
  tierOf: tierOf,
  tierIndexOf: tierIndexOf,
  difficultyOf: difficultyOf,
  diffKeyIndex: diffKeyIndex,
  diffIndexOf: diffIndexOf,
  bestDifficulty: bestDifficulty,
  levelFactor: levelFactor,
  profByLevel: profByLevel,
  retreatText: retreatText,
  factorText: factorText,
  buildParams: buildParams,
  buildParamsAt: buildParamsAt,
  levelDelta: levelDelta,
  pseudoDiff: pseudoDiff,
  diffDetail: diffDetail,
  sLineOf: sLineOf,
  sLineText: sLineText,
  lightsLevelOf: lightsLevelOf,
  LIGHTS_LEVELS: LIGHTS_LEVELS,
  sudokuLevelOf: sudokuLevelOf,
  SUDOKU_LEVELS: SUDOKU_LEVELS,
  klotskiLevelOf: klotskiLevelOf,
  KLOTSKI_LEVELS: KLOTSKI_LEVELS,
  // 四门的「兜底值」真源：模块里各留一份不带 params 时的默认数组，
  // 但必须是这一份的拷贝——两处一旦分叉，准备页写「合出 512」、局内却收 1024。
  // verify 会逐个比对模块导出的同名常量。
  MERGE_TARGETS: MERGE_TARGETS,
  SCHULTE_SIZES: SCHULTE_SIZES,
  SCHULTE_PENALTIES: SCHULTE_PENALTIES,
  PUSHBOX_LEVELS: PUSHBOX_LEVELS,
  BIGGEST_LEVELS: BIGGEST_LEVELS,
  hintLabelOf: hintLabelOf,
  stageRulesOf: stageRulesOf,
};
