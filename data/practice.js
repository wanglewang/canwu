'use strict';

const economyData = require('./economy.js');
const levelData = require('./levels.js');

// 参悟方式 = 一门功法 + 一套专属玩法 + 该门独有的规则花样(twist) + 表现主题(theme)。
// 15 门功法对应 15 套互不复用内核的小游戏；同是阵法，也不会点进去是同一个盘面。
// game 取值见 minigames/index.js：
//   click / memory / tempo / lights / mines / seal / link / blocks / match
//   / sudoku / merge / schulte / klotski / pushbox / biggest。
// forge 是刀法（weapon: 'dao'）。兵器是功法属性，不是某个玩法的私有参数。
// charge 仅用于境界突破，不挂功法。
//
// 命名分工：「参悟方式」写这一门功课具体在做什么（斩桩 / 观窍 / 填数），
// 「玩法名」写盘面上的动作（顺光扫斩 / 数格辨禁）。两者不可重名，也不可与功法本身相斥——
// 刀法不练数格子，心法不练牵线——类别与盘面上的动作必须同源。
// 反例：「符箓·照影符」练的是数格辨禁，可符是纸上画出来的东西，与格盘推理毫无关系；
// 已按「以游戏为准」改为「阵法·洞微勘禁诀」，归入阵法黄阶。
// 2026-11 起剑法 / 水术 / 身法 / 丹道四族暂无功法（截锋断岳、叠纹凝露、踏云连环步已删），
// 族定义保留在 FAMILIES，留给以后同源的功课。
// id 是稳定键（存档、纪录都按它索引），改文案时不要动 id。
// base 是灵力基数（/4 后即 8–14），按各玩法的通关难度分别配平；熟练度走 world.PROF_BASE / comboGain，不用 base。
//
// 一个维度只管一件事：
//   类型 → 玩什么（游戏族，见 FAMILIES）
//   兵器 → 怎么动（刀法走 click，其余门暂不读兵器轴）
//   品阶 → 战力加成与灵力灵石倍率（见 TIERS，天地玄黄；不加速熟练度）
//   关卡   → 内容与难度（1000 关五段，见 STAGES；段内逐关收紧）
//   熟练度 → 火候（属性加成、阶段新法、特效兑现比例；不算关号、不开段）
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
    id: 'recite', name: '背功法口诀', game: 'memory', theme: 'recite', twist: 'recite',
    desc: '口诀次第闪过，按原序点回。看漏了可以抢记，赌自己记住了多少。',
    tip: '点错罚 1.5 息、连断；整轮记岔折 1 盏心神',
    base: 38,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 560, gapMs: 260, msPerNote: 480 },
  },
  {
    id: 'absorb', name: '吸纳灵力', game: 'tempo', theme: 'absorb', twist: 'absorb',
    desc: '一呼一吸皆有节律，气机收到最匀处才纳得进去。谱越到后头越难，最后要靠身子记住拍子。',
    tip: '早一点晚一点只算半拍，漏掉一音就空一拍',
    base: 30,
    // 谱由 TEMPO_SCORES 按档整表注入，这里留简单档的数当兜底（准备页取参时也读得到）。
    params: { bar: 8, unitMs: 500, bars: 4, hands: 1, cue: 'all', winMs: 320, pattern: [[0, 2, 4, 6]] },
  },
  {
    id: 'arrayEye', name: '参悟阵眼', game: 'lights', theme: 'arrayEye', twist: 'arrayEye',
    desc: '点一格翻转它与上下左右四格，把整盘阵灯同时点亮。盘面规格与步数余量写在下面的段位表里。',
    tip: '触死门罚 2 步 · 这一格点不动',
    base: 42,
    // 盘面规格 / 最优步数区间 / 步数余量由 LIGHTS_LEVELS 按难度档注入，这里不再写死 3×3。
    params: {},
  },
  {
    id: 'tanlei', name: '勘位辨禁', game: 'mines', theme: 'tanlei', twist: 'tanlei',
    desc: '石格下埋着禁制，能看到只有周围露出的数字。按数字把禁位一格格勘出来，钉住再连开。',
    tip: '误触折 1 盏心神，耗尽即失败',
    base: 50,
    params: { cols: 6, rows: 6, mines: 6 },
  },
  {
    id: 'seal', name: '内视观窍', game: 'seal', theme: 'seal', twist: 'seal',
    desc: '十二处气窍都合着，两两相合才通一层。入定深了，会先照见一对。',
    tip: '翻错只是合上，但多记一次翻牌、白费时间',
    base: 56,
    params: { pairs: 6, cols: 4, flipMs: 850, timeLimit: 70 },
  },
  // 下面三门是「一看就懂」的经典玩法，都挂黄阶：规则不绕，前期就买得起。
  // 品阶只管收益与可修境界；难度档位自己拧自己那 40 关的数值（dropMs / depth 等）。
  {
    id: 'linkpair', name: '牵灵引线', game: 'link', theme: 'linkpair', twist: 'linkpair',
    desc: '同纹灵石两两相契，牵一条灵线把这一对收回来；越往后折数收得越紧。',
    tip: '错配或连不上都少 2 息，时辰到还没收干净就是失败',
    base: 34,
    // cols / rows / kinds 由 LINK_LEVELS 按档整表覆盖，这里只是简单档的种子。
    // duration 不写种子：它由 linkDurationAt(关号) 现算，写一个没人读的 55 只会
    // 让人误以为「时辰 55 秒」是这一门的基准。hintMs 是照纹高亮时长，与难度无关，
    // 故意不叫 flashMs——那个键在 PACE_KEYS 里，会被按档缩放、还会在 200 关里
    // 报出一百多处「0.75 秒 → 0.74 秒」的假变化。
    params: { cols: 6, rows: 4, kinds: 6, hintMs: 900 },
  },
  {
    id: 'stackstone', name: '垒石筑基', game: 'blocks', theme: 'stackstone', twist: 'stackstone',
    desc: '灵石按息坠落，挪石转石把一层垒满，整层化去才算筑稳一分根基。',
    tip: '堆到顶立刻结束；垒满一层才化去',
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
    tip: '填错一格罚 10 秒，时辰到还没填完就是失败',
    base: 38,
    // 盘面规格 / 挖洞数 / 时限与三条时间线由 SUDOKU_LEVELS 按难度档注入，这里不写死 4×4。
    params: {},
  },
  {
    id: 'heyuan', name: '同数相合', game: 'merge', theme: 'heyuan', twist: 'heyuan',
    desc: '整行整列往一个方向挤，同数相撞就合成双倍；空出来的格子里再补一块新的。',
    tip: '盘满又相邻无同数即失败，合出本段目标块就完成',
    base: 34,
    params: { cols: 4, rows: 4 },
  },
  {
    id: 'shumu', name: '循数疾点', game: 'schulte', theme: 'shumu', twist: 'shumu',
    desc: '盘上的数散乱摆着，从 1 顺着点到最后，点完即完成；盯住盘心、用余光扫四周，别用手指追着数走。',
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
  memory: '记序复现',
  tempo: '节律判定',
  lights: '阵灯推演',
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
  // 剑法 / 水术 / 身法 三族 2026-11 起暂无功法（截锋断岳、叠纹凝露、踏云连环步已删），
  // 族定义先留着：加回功法或新增同族课程时直接用。谱系按 chainsOf() 分组，空族不会显示。
  剑法: { core: '辨光取真', note: '在数道剑光里截真招（暂无功法）', kind: 'skill' },
  阵法: { core: '盘上推演', note: '同族都在方盘上推演：勘禁位、点阵灯、补九宫', kind: 'skill' },
  心法: { core: '记忆与节律', note: '主修各考一样：节拍、记性、配对', kind: 'main' },
  丹道: { core: '同级合炼', note: '同级相合，合出更高一阶——炼丹的路子', kind: 'skill' },
  水术: { core: '循纹递推', note: '看河石上的水纹递推（暂无功法）', kind: 'skill' },
  身法: { core: '步法连环', note: '照卷轴踏位（暂无功法）', kind: 'skill' },
  御灵: { core: '灵纹连线', note: '牵两枚同纹灵石，找一条通路；越往后越紧', kind: 'skill' },
  土行: { core: '落石垒基', note: '挪石转石垒满一层，是唯一持续下落的盘面', kind: 'skill' },
  灵植: { core: '三秀同收', note: '互换相邻两株凑三连，采收后新苗落下还能连锁', kind: 'skill' },
  // 类别按「修士靠什么手段」分，不按「玩家在屏幕上做什么」分——
  // 后者会生出「目术 / 辨术 / 合术」这种读着像《封神演义》左道旁门的门类。
  // 同族同阶可并列（心法两门黄阶在先），谱系照 chainsOf() 全列出来，不按阶取槽。
  神识: { core: '神念览物', note: '神念扫过全域：按序点格、辨气机强弱', kind: 'skill' },
  机关: { core: '移位让路', note: '挪块让路、推石归阵，考的是腾挪次序', kind: 'skill' },
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
// 熟练度是「这一门练得多熟」，只由本局评级与连 S 层数决定（回关、降档另折）；
// 让高级功法练得更快，等于把低阶功法从成长线上直接淘汰，也和「熟练度只认本事」自相矛盾。
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

// ---------------------------------------------------------------- 难度档：玩家自己挑
// 不随功法品阶变化，也不再由熟练度解锁。五个档位是五条并列的线，每档固定 40 关，
// 各自记自己的进度（存档 `skills[id].levels`），走通本段 40 关才开下一档。
//
// 为什么把「熟练度解锁难度」拆掉：原来一条熟练度轴同时管三件事——能打哪一档、
// 当前第几关、段位与属性加成。玩家看到的「解锁普通难度」其实是「刷够 300 分」，
// 于是他要么刷简单档刷到吐，要么以为难度是个可以挑的按钮却点不动。
// 现在难度靠过关（本事），熟练度只管段位与加成（积累），两件事互不代偿。
//
// 档位越高，一局越贵（`qi` 是裸基数，实价还要乘时长系数、品阶、悟性等系数，
// 见 data/economy.js 的 practiceQiCost），同时 pace 收紧、goal 抬高。
//
// 这里刻意没有「倍率」字段：熟练度不吃倍率（只由评级与连 S 决定），资源早已不在参悟里产出，
// 留着 mult 只会让卡片上写一个算不出来的 ×1.70。

// 五段。段的边界与名字只有一处出处（levelData.STAGES），这里只补「这一段紧在哪」：
//   qi    本段一局的灵力裸基数（实价还要乘时长系数、品阶、悟性等，见 data/economy.js）
//   pace  时间类参数的整体倍率（越紧越小）；goal 目标类（越大越高）
//   gear  盘面难度的粗分档，只有 normal / hard 两值
// 段间是「换一副盘 + 换一次节奏」，段内是「同一副盘逐关收紧」。
const STAGE_TUNE = [
  { qi: economyData.RUN_QI[0], pace: 1.18, goal: 0.85, gear: 'normal', desc: '一关一条规矩，最省灵力，先把手上认熟。' },
  { qi: economyData.RUN_QI[1], pace: 1.00, goal: 1.00, gear: 'normal', desc: '规矩齐了，本门第一副真盘面。' },
  { qi: economyData.RUN_QI[2], pace: 0.88, goal: 1.12, gear: 'hard', desc: '盘面收紧、目标抬高，失误余地更小。' },
  { qi: economyData.RUN_QI[3], pace: 0.78, goal: 1.22, gear: 'hard', desc: '几乎没有容错，一乱即落。' },
  { qi: economyData.RUN_QI[4], pace: 0.70, goal: 1.32, gear: 'hard', desc: '给练到极处的人：最快节奏、最高目标，也最耗灵力。' },
];

const STAGES = levelData.STAGES.map(function (s, i) {
  const t = STAGE_TUNE[i] || STAGE_TUNE[STAGE_TUNE.length - 1];
  return {
    key: s.key, name: s.name, label: s.label, from: s.from, to: s.to, note: s.note,
    qi: t.qi, pace: t.pace, goal: t.goal, gear: t.gear, depth: i, desc: t.desc,
  };
});

const STAGE_MAP = {};
for (let i = 0; i < STAGES.length; i += 1) STAGE_MAP[STAGES[i].key] = STAGES[i];

function stageOfKey(key) {
  return STAGE_MAP[key] || STAGES[0];
}

function stageIndexOfKey(key) {
  const s = STAGE_MAP[key];
  return s ? STAGES.indexOf(s) : 0;
}

// 段序夹取（0–4）。参数表一律按段序取，越界就落到最近的段，不抛错。
function clampStageIndex(i) {
  const n = Math.round(Number(i) || 0);
  return Math.max(0, Math.min(STAGES.length - 1, n));
}

// 对外的段参数一律走这一个入口：传段序（0–4）或段名（novice/entry/minor/major/full）都认。
// 旧词 easy/normal/hard/expert/desperate 已整组退役，传进来会落到第 1 段——
// verify 有一条断言禁止这些词再出现在代码里，所以「静默落到第 1 段」不会长期藏着。
function stageIndexLike(x) {
  if (typeof x === 'string' && !/^\d+$/.test(x)) return stageIndexOfKey(x);
  return clampStageIndex(x);
}

// 存档里的关卡进度：`cleared` = 本门已走通几关（0–1000）。
// 缺省、越界、非数字一律当 0，读档不因为一个脏字段把整门判成已通。
function clearedOf(rec) {
  const v = Math.floor(Number(rec && rec.cleared) || 0);
  return Math.max(0, Math.min(levelData.LEVEL_MAX, v));
}

// 本门当前该打第几关：已走通 +1；走通 1000 关后停在 1000（重打不推进，也不越界）。
function curLevelOf(rec) {
  return Math.min(levelData.LEVEL_MAX, clearedOf(rec) + 1);
}

// 这门现在是第几段（0–5，5 = 大圆满）。段位只由走通关数定，与熟练度无关。
function stageIndexOfCleared(cleared) {
  return levelData.stageIndexOfCleared(cleared);
}

function stageNameOfCleared(cleared) {
  return levelData.stageNameOfCleared(cleared);
}

// ---------------------------------------------------------------- 回关折减
// 一门就是一条 1–1000 的长线，所以「回关」= 回打本门更早的关。
//
//   本关 ÷ 当前关 × 本关段基数 ÷ 当前关段基数，唯独当前关 ×1
//
//   本门当前第 800 关（圆满段，基数 32）时：回打 800 → ×1.00，700 → ×0.875，
//   400（大成 24）→ ×0.375，100（小成 17）→ ×0.066，第 1 关（未入门 7）→ ×0.00027
//   本门当前第 20 关（入门段，基数 11）时：回打 10 → ×0.50，第 1 关 → ×0.032
//
// **为什么要两把尺子。** 只有「本关 ÷ 当前关」时，玩家可以**不往前走**而停在原地刷：
// 走通必推一关没错，但「打上一条已走通的关」也算走通，`当前关` 就钉死不动了。
// 于是折减一直停在 ×0.95 左右，而耗气按本关所在段报（低段便宜四倍）——
// 停在入门段末反复刷，每点灵力换到的熟练度永远高于推进到圆满段（实测 6000 灵力：
// 只刷第 1 关 11551 vs 逐关进 6399，反超 1.8 倍）。第二把尺子把「回关同时省下的气」
// 也折进去，回关的每点灵力收益就再也高不过打当前关：
//   当前关 ×1 永远最优；回关越深、跨的段越早，折得越狠，且仍然连续、无断崖。
function levelFactor(level, curLevel) {
  const cur = Math.max(1, Math.round(Number(curLevel) || 1));
  const lv = Math.max(1, Math.min(cur, Math.round(Number(level) || 1)));
  // 当前关永远 ×1：那是「往前打」，不该打折。
  if (lv >= cur) return 1;
  const qiNow = economyData.RUN_QI[levelData.stageOfLevel(lv)] || 1;
  const qiCur = economyData.RUN_QI[levelData.stageOfLevel(cur)] || 1;
  // 同段回关时这一项恒为 1，退化回「本关 ÷ 当前关」——所以段内回关的手感不变。
  return (lv / cur) * Math.min(1, qiNow / qiCur);
}

// 回关这一局的基础熟练度：四舍五入一次。
// 只有一次乘法，取整也只有一次，玩家按「34 × 400 ÷ 800 = 17」能复算。
function profByLevel(base, level, curLevel) {
  return Math.round(Math.max(0, Math.round(Number(base) || 0)) * levelFactor(level, curLevel));
}

// 准备页那一行回关提示：说清退到第几关、熟练度折成多少。只在真的回关时出现。
function retreatText(level, curLevel) {
  const cur = Math.max(1, Math.round(Number(curLevel) || 1));
  const lv = Math.max(1, Math.min(cur, Math.round(Number(level) || 1)));
  if (lv >= cur) return '';
  return '回打第 ' + lv + ' 关（本门已走到第 ' + cur + ' 关）：熟练度按 ×'
    + String(Math.round(levelFactor(lv, cur) * 1000) / 1000) + ' 计，本局不叠连 S。'
    + '关卡只进不退，回打只为找手感。';
}

// 小系数也要原样显示，toFixed(2) 会把 0.0625 写成 0.06 骗人。
function factorText(f) {
  return '×' + String(Math.round(f * 10000) / 10000);
}

// 五段的「时辰」共用一根尺子：所有带 duration / timeLimit 的玩法逐档收 3%。
// 以前档位只拧动画速度（flashMs / dropMs），时辰一动不动——玩家看不出这一档紧在哪。
// 三秀同收 / 九宫填数各有自己的整表（下面会覆盖），其余限时玩法一律走这里。
// 收 3% 而不是一成，是为了不把「高档」变成「来不及看清盘」；逐档累计到绝境是 88%。
const TIME_LEVELS = [1, 0.97, 0.94, 0.91, 0.88];

// 下面四张表是「审计找出来的区分度欠账」：这四门原本只有**一个**玩家看得见的参数
// 在五段间变化，其余全靠评级线在结算时乘个数。补的每一个数都由玩法层真的读：
//   mines → 心神盏数（HUD 上有几盏灯）；merge → 起手几块（开局盘面就少几格空地）；
//   schulte → 点错罚几秒（局内已经这么写）；pushbox → 推数预算系数（capPushes 直接读）。
// 不许为了过审计往 params 里塞一个玩法层不读的字段，那是假区分度。
const MERGE_START_TILES = [2, 2, 3, 3, 4];
const PUSHBOX_CAP_FACTORS = [2.2, 2.0, 1.9, 1.75, 1.6];

// 落石垒基的五段。这一门的规范来自 Tetris Guideline，五段只动两件事：
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
// 起因（改版前，windowPace 已退役）：五段的时间参数走同一套 pace / windowPace / TIME_LEVELS，跨度天然只有 1.7–2.3 倍，
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
// 如今段表里已无 windowPace 字段，下面几行是改版理由的存档，不是现行口径。
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

// 数格辨禁：旧版盘面恒 6×6，五段只动禁制数（5→8）与心神（3→2），评级又只看用时——
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

// 三秀同收的五段：盘面规格、花色、时辰、三处罚息与评级线，一张表管全。
// 旧版只有「S 线 620 + depth×150」在变，60 息 / 5 色 / 罚 2 息四档全写死——
// 真控制器跑 12 局的结果：高手五段 12/12 全 S、常人绝境 10/12 S，等于同一局打五遍。
// 后来补了花色与罚息，但盘面仍是 6×6：换段只多一张果器纹、少几息，玩家一眼看不出来。
// 现在换段先换盘——6×6 → 7×7 → 8×8 → 9×9 → 10×10，这是长线里唯一一次
// 「不用读字就知道换段了」的台阶；花色、时辰、罚息继续各管一档的松紧。
// 时辰没有跟着旧表继续大收，是因为盘变大后扫一圈要更久：68/66/64/62/60 递减，
// 每格预算却从 1.89 息一路收到 0.60 息，主承重轴从「快」挪回「看得清」。
// sLine 保持原五值：用同一套启发式玩家在旧盘与新盘各跑 15 局，快手得分比是
// 0.99 / 1.17 / 1.06 / 0.97 / 0.94，常人 1.20 / 0.91 / 0.98 / 1.02 / 0.83，
// 换盘没有改变可得分的量级，动分数线只会把已标定的档位打乱。
// 标定口径仍是「高手约 75–95% 拿得到、常人 5–25%」，由 tests/rank.test.js 守。
const MATCH_LEVELS = [
  { cols: 6, rows: 6, kinds: 5, duration: 68, missCost: 1, shuffleCost: 2, hintCost: 1, sLine: 1900 },
  { cols: 7, rows: 7, kinds: 5, duration: 66, missCost: 2, shuffleCost: 3, hintCost: 2, sLine: 1750 },
  { cols: 8, rows: 8, kinds: 6, duration: 64, missCost: 2, shuffleCost: 3, hintCost: 2, sLine: 1400 },
  { cols: 9, rows: 9, kinds: 6, duration: 62, missCost: 3, shuffleCost: 4, hintCost: 3, sLine: 1300 },
  { cols: 10, rows: 10, kinds: 7, duration: 60, missCost: 3, shuffleCost: 4, hintCost: 3, sLine: 950 },
];

function matchLevelOf(stageIndex) {
  return MATCH_LEVELS[stageIndexLike(stageIndex)];
}

// 灵纹连线的五段：盘面与纹种是这一门的主轴。
//
// 旧版五段只差时辰（55→48，1.15 倍）与「照纹亮多久」（flashMs 1062→630）。后者不是难度，
// 是把帮助变短，而审计把它记成「主轴跨度 1.69 倍」——于是这一门在复杂度 / 信息 / 规模
// 三根轴上用了 0 根，还躲过了「跨度不够 2 倍该换轴」那条提示。
// 现在按档加盘：24 格 → 28 → 32 格，纹种 4 → 6。8 列在 375px 屏上每格仍有 43px，
// 用的是已有的 .grid--c7 / .grid--c8，不新造样式。
//
// 时辰不在这张表里。这一门只有盘面与时辰两根轴，而「章内收三成、换章回一口气」
// 会让第 40 关（约 39 秒）比第 41 关（约 51 秒）还紧——界面上白纸黑字写着
// 「时辰 39 秒 → 51 秒」，等于承认上一章更难。所以时辰改按「每对预算」沿关号
// 连续收，见下面的 linkPerPairAt / linkDurationAt。
// 五段规格：前三段 4×6（24 格 − 4 空位 = 20 格 · 10 对），大成 5×7（35 − 3 = 32 格 · 16 对），
// 圆满 6×8（48 − 4 = 44 格 · 22 对）。行数不是摆设：业界连连看的简单 / 中等 / 困难是
// 10×6 / 12×8 / 16×9，行列一起长；麻将接龙的 12 副布局从 60 张到 144 张。
//
// 2026-11-18 把盘形转成竖的。原来是 6×4 / 7×5 / 8×6——横着长，而手机是竖的：
// 横盘只能占满宽度、高度只用掉一屏的三分之一，底下全是空；而格子宽度被列数锁死，
// 7 列时每格只有 49px，再怎么调边距也大不了一格像素。**列数是格子大小的唯二旋钮**
// （另一个是屏宽），减列才是真的放大格子。
// 只转盘形、不动对数：10 / 16 / 22 一枚没变，所以每对预算这把尺子、评级线、
// 全书的难度台阶全部照旧——盘形只改「看起来多大」，不改「有多难」。
// 段间台阶也保住了：4 列 → 5 列 → 6 列，格子一级级缩小、行长一级级加上去。
// 但「盘变大」不等于「变难」——难度只由每对预算这把尺子管，大盘只是玩家最先看见的变化。
// 换盘时对数变了，时辰由 linkDurationAt 按本段对数现算，不许在表里写死总秒数。
// 折数上限是并蒂引的复杂度轴：前三段 2 折（能绕盘外），大成起 1 折。
// 实测（150 局 × 各段盘）1 折把「每对可连量」压掉约四成：大成 0.88→0.53、
// 圆满 0.92→0.57；死局由玩法层的重排兜住（换盘不扣息、只断连收）。
// 盘面尺寸决定「一对有几息」，折数决定「这一息里找得到几对」——两条轴互不顶替。
const LINK_LEVELS = [
  { cols: 4, rows: 6, kinds: 4, turns: 2 },   // 挖四格 = 20 格 · 10 对 · 4 种纹：段首多的一种 6 枚，路径好找
  { cols: 4, rows: 6, kinds: 5, turns: 2 },   // 10 对 · 5 种纹
  { cols: 4, rows: 6, kinds: 6, turns: 2 },   // 10 对 · 6 种纹：换段只换纹种，盘还是这一副
  { cols: 6, rows: 6, kinds: 6, turns: 1 },   // 挖四格 = 32 格 · 16 对：大成第一次加列，同时收紧到一折
  { cols: 8, rows: 6, kinds: 6, turns: 1 },   // 挖四格 = 44 格 · 22 对：圆满加到八列，行数不动
];
// 每对预算（息）：第 1 关 5.5 → 第 200 关 2.75，正好 2 倍。
// 拿「每对」而不是「总秒数」当主承重：换章盘面变大，总秒数跟着变长是应该的，
// 玩家比较难度的尺子只能是「一对平均给几息」。
const LINK_BUDGET = [5.5, 2.75];

// 段内布纹的名字。weave 由 levels.js 的 tweakParams 按段内进度生成（0–3），
// 玩法层按它决定每种纹各有几对；这里只管怎么把同一件事说给玩家听。
const WEAVE_NAMES = ['均匀', '微偏', '偏斜', '极偏'];

function weaveNameOf(weave) {
  return WEAVE_NAMES[Math.max(0, Math.min(WEAVE_NAMES.length - 1, Math.round(Number(weave) || 0)))];
}

// 纹样主题的名字：真源在 data/levels.js 的 LINK_THEME_NAMES（数据层要拿它写「本关变化」），
// 图案在 minigames/link.js 的 CREST_THEMES。两处顺序由 layout.test 断言，不靠人记。
function linkThemeNameOf(theme) {
  const names = levelData.LINK_THEME_NAMES;
  const i = Math.max(0, Math.min(names.length - 1, Math.round(Number(theme) || 0)));
  return names[i];
}

// 这一关每对给几息：沿全书进度线性收，不按章回卷——「章内收三成、换章复位」
// 正是倒挂的来源。
function linkPerPairAt(level) {
  const lv = Math.max(1, Math.min(levelData.LEVEL_MAX, Math.round(level) || 1));
  const f = (lv - 1) / (levelData.LEVEL_MAX - 1);
  return LINK_BUDGET[0] + (LINK_BUDGET[1] - LINK_BUDGET[0]) * f;
}

// 这一关的时辰 = 本段对数 × 每对预算（消费端在 minigames/link.js 的 p.duration）。
// 盘面台阶（换章）与关内台阶（预算）分开承担：换章时辰会变长，但每对只会更紧。
// 向下取整而不是四舍五入：取整只会让实际每对预算比名义值更紧，方向永远朝难；
// 四舍五入在换章时会把 46.27 抬成 46、53.78 抬成 54，实际每对从 3.83 息涨到
// 3.86 息——界面上就会出现「每对时辰 3.83 → 3.86」这种往松走的假台阶。
function linkDurationAt(level) {
  const lv = Math.max(1, Math.min(levelData.LEVEL_MAX, Math.round(level) || 1));
  const stage = levelData.stageOfLevel(lv);
  const board = LINK_LEVELS[stage];
  const pairs = linkPairsAt(lv, board.cols, board.rows);
  let out = Math.floor(linkPerPairAt(lv) * pairs);
  if (stage > 0) {
    // 换段封顶：新盘的对数变了，floor 的取整粒度也变了（10 对是 0.1 息、16 对是 0.0625）。
    // 名义每对明明在降，实际每对却可能因为「这次少扣了一点零头」看起来松了 0.037 息——
    // 这正是之前反复踩的假回弹。拿上一段末关的**实际**每对（不是名义值）封顶，
    // 玩家看到的「每对几息」就永远只紧不松。封顶只作用在新盘，不改段内逐关收紧。
    const prev = levelData.stageRange(stage - 1).to;
    const prevBoard = LINK_LEVELS[stage - 1];
    const prevPairs = linkPairsAt(prev, prevBoard.cols, prevBoard.rows);
    const prevLeft = Math.floor(linkPerPairAt(prev) * prevPairs) / prevPairs;
    out = Math.min(out, Math.floor(prevLeft * pairs));
  }
  return Math.max(20, out);
}

// 本关能接几对 = (格数 − 空位数) / 2。**这一门所有「每对」的分母都只从这一个函数出**
// （时辰 / 规格串 / 末关跨度 / 本关变化），空位一加就有四处要改，各算一套必然对不上。
function linkPairsAt(level, cols, rows) {
  const gaps = levelData.linkGapsAt(level, cols, rows);
  return Math.max(1, (cols * rows - gaps.length) / 2);
}

// 同一件事的「按参数算」版本：上面那个吃关号，这个吃已经算好的 params（q.gaps 在里头）。
function linkPairsOf(q) {
  const cells = (q.cols || 0) * (q.rows || 0);
  const holes = Array.isArray(q.gaps) ? q.gaps.length : 0;
  return Math.max(1, (cells - holes) / 2);
}

// 局内那行代价句要跟着本段罚息走：以前写死「少 2 息」，改了档就变成假话。
// 只有三秀同收的罚息按档变，其余门沿用 method.tip 这一份真源。
function tipFor(method, stageIndex) {
  if (!method) return '';
  if (method.game === 'match') {
    return '换不出三连少 ' + matchLevelOf(stageIndexLike(stageIndex)).missCost + ' 息';
  }
  return method.tip;
}

// 阵灯推演的段位表：盘面规格 / 最优步数区间 / 步数余量。
// 以前是「限时 36 秒解尽量多盘」，按解开盘数评级；现在改成一盘推演、按步数评级，
// 所以这一门比的是「省」，不是「快」——和澄心默诵诀（记序列）、三秀撷英诀（消消乐）彻底分开。
//
// 三件事一起改过，缺一档都会塌：
//   ① 最优步数写成**区间** min–hi，且相邻两档的区间不重叠。旧表是 [min, min+2]，于是
//      简单 [2,4] 与普通 [3,5] 大约三分之二的盘重合——两档都是 3×3、规则一样、预算都不咬人，
//      玩家体感上根本没换档。
//   ② 预算不再写死绝对值，改由「本盘最优 + 余量」现算。旧表预算是最优的 3–4.5 倍，
//      阵溃要浪费到四倍才触发，等于没有压力；余量写在玩法层（`minigames/lights.js` 的
//      `budgetSlack`），这一档只给「最多多走几步」。
//   ③ 规格与最优步数同时递增，且不让相邻两档在两条轴上同时相同：
//      3×3 2–3 → 3×3 4–5 → 4×4 4–5 → 5×5 6–7 → 5×5 8–9。
//      4×4 只出现一次是有意的：4×4 恰好是「行追法必成」的尺寸（零空间维数 4 = 首行的 2⁴），
//      任何 4×4 盘都能用同一套机械手法追通，放在中间档当「学方法」的一档正合适，
//      放在高档就变成「背口诀拿 S」。
const LIGHTS_LEVELS = [
  { size: 3, min: 2, hi: 3, slack: 7 },
  { size: 3, min: 4, hi: 5, slack: 7 },
  { size: 4, min: 4, hi: 5, slack: 7 },
  { size: 5, min: 6, hi: 7, slack: 7 },
  { size: 5, min: 8, hi: 9, slack: 7 },
];

function lightsLevelOf(stageIndex) {
  return LIGHTS_LEVELS[stageIndexLike(stageIndex)];
}

// 九宫填数的段位表：盘面规格 / 挖洞数 / 时限 / 三条时间线。
// 规格按档递进：4×4 先把「行、列、宫各一遍」看懂，6×6 换宫格形状，9×9 才是正经数独。
// 挖洞越多越难；时限给得比 B 线宽一截，是为了让「填完但慢」还有个 C，
// 而不是一超线就直接判负——没填完（失败）和填得慢（C）是两件事。
const SUDOKU_LEVELS = [
  { size: 4, holes: 8, timeLimit: 150, tS: 45, tA: 70, tB: 100 },
  { size: 6, holes: 14, timeLimit: 240, tS: 80, tA: 120, tB: 170 },
  { size: 9, holes: 32, timeLimit: 420, tS: 170, tA: 240, tB: 330 },
  { size: 9, holes: 40, timeLimit: 420, tS: 190, tA: 270, tB: 370 },
  { size: 9, holes: 46, timeLimit: 420, tS: 210, tA: 300, tB: 410 },
];

function sudokuLevelOf(stageIndex) {
  return SUDOKU_LEVELS[stageIndexLike(stageIndex)];
}

// 滑块让路的段位表：这一盘「最少几步脱身」的上下限。
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

function klotskiLevelOf(stageIndex) {
  return KLOTSKI_LEVELS[stageIndexLike(stageIndex)];
}

// 另外三门的段位表住在玩法模块里（丹道 / 神识 / 机关 各有一套自己的数），
// 这里只把「本段最关键的那个数」按档注入 params：准备页的难度说明要能写出
// 「这一档换成了什么」，不然高档位那行会照旧写「入门基准」。
// 模块里的默认表只在没带参数时兜底（测试探针直接 create 就是走那条路）。
const MERGE_TARGETS = [128, 256, 256, 512, 1024];
// 顺序点格：盘面 4→5→6→7，且「困难」之后不再只靠秒表收紧。
// 旧表是 4/5/6/6/6：后三档同一个 6×6，档与档只差 1–3 秒 S 线，
// 而同一尺寸换个随机布局的成绩本来就波动 3–5 秒——段差被方差吃掉，三档在体感上是同一局。
// 现在最后一档换 7×7（每格仍 98×96rpx，两倍于「每格 ≥25px」的下限），
// 中间那一对同盘面的档改用一条规则分开：极难起点过的格不再退场。
const SCHULTE_SIZES = [4, 5, 6, 6, 7];
// 与 minigames/schulte.js 的 PENALTIES 同值：这里只给准备页写「这一档罚几秒」，
// 局内判定仍以模块为准，两边由 verify 比对锁死（与 MERGE_TARGETS 同一套做法）。
const SCHULTE_PENALTIES = [2, 3, 4, 5, 6];
// 点过的格退不退场。真源在 minigames/schulte.js 的 LEVELS，这里只为准备页那一行。
const SCHULTE_FADE = [true, true, true, false, false];
// 推石入位的段位表：原来是「第几张石图」——五张图固定，第三遍开始玩家记的是答案，
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

function sLineOf(method, stageIndex) {
  if (!method || method.game !== 'match') return 0;
  return matchLevelOf(stageIndexLike(stageIndex)).sLine;
}

// 准备页那一整行 S 线文案：分数线与盘数线口径不同，别在页面 JS 里各拼一遍。
function sLineText(method, stageIndex) {
  if (!method) return '';
  if (method.game === 'match') {
    const lv = matchLevelOf(stageIndexLike(stageIndex));
    // 评级线随盘面变难而略降，这句必须当场说明，不然玩家会以为算错了。
    return '本段 ' + lv.kinds + ' 色 · ' + lv.duration + ' 息 · 换不出少 ' + lv.missCost + ' 息'
      + ' · S 线 ' + lv.sLine + ' 分（盘面越难，同样分数越难得）；评级只看总分';
  }
  if (method.game === 'lights') {
    const lv = lightsLevelOf(stageIndexLike(stageIndex));
    // 预算不再是固定秒数 / 步数，是本盘最优 + 余量，所以这里只能说「余量」，
    // 说死一个绝对数会和局内「余 N 步」对不上（最优是区间，两盘能差一步）。
    return '本段 ' + lv.size + '×' + lv.size + ' 盘 · 最优 ' + lv.min + '～' + lv.hi
      + ' 步 · 最多多走 ' + lv.slack + ' 步';
  }
  return '';
}

// ---------------------------------------------------------------- 参数缩放
// 节律判定的判定带按毫秒给，两边一起守：
// ① 单侧不得短于 minWinMs（合计 200ms，全站反应下限）；
// ② 单侧不得超过该手「最短音符间隔」的四成（maxWinFrac）——双手里左手三秒一下、
//    右手一秒一下，窗口若按左手定，右手相邻两个窗口会互相吞掉。
// 这两个下限在 minigames/tempo.js 的 score() 里算（那里才知道每手的间隔），
// 参数层只给「这一档本来想要多宽」，最终值由玩法层落定并回写，见 buildParamsAt。
// 这几个数由 minigames/tempo.js 直接引用，不许再抄第二份。
const TEMPO_FLOOR = {
  minWinMs: 100, tickMs: 40, maxWinFrac: 0.4,
  twistWin: 1.45, perkWin: 1.12,
};

// 节律判定五段的谱。这一门以前「五段只收一个窗」，200 关打下来是同一局；
// 现在每一档换一件东西，玩家每次都要学一样新的：
//   拍号定分组、速度定心跳、音符时值定疏密、手数定分工、cue 定提示还剩多少。
// pattern 是「一小节里的格位」：格长 unitMs，小节长 bar 格。
// 一手多个格位时，环的周期就是相邻格位的差，所以长短拍在盘面上快慢不同。
const TEMPO_SCORES = [
  {
    key: 'novice', meter: '4/4', bpm: 60, bar: 8, unitMs: 500, bars: 3,
    hands: 1, cue: 'all', pattern: [[0, 2, 4, 6]], winMs: 320,
    label: '每拍一下', note: '一格一步，心跳先立住',
  },
  {
    key: 'entry', meter: '4/4', bpm: 60, bar: 8, unitMs: 500, bars: 3,
    hands: 1, cue: 'all', pattern: [[0, 3, 4, 6]], winMs: 260,
    label: '长短交替', note: '速度没变，改的是音符时值',
  },
  {
    key: 'minor', meter: '4/4', bpm: 75, bar: 8, unitMs: 400, bars: 4,
    hands: 1, cue: 'next', pattern: [[0, 2, 4, 7]], winMs: 200,
    label: '带上休止', note: '谱里有空档，空档不许点',
  },
  {
    key: 'major', meter: '2/4', bpm: 60, bar: 4, unitMs: 500, bars: 6,
    hands: 2, cue: 'bar', pattern: [[0], [0, 2]], winMs: 220,
    label: '双手 · 一与二', note: '左手一拍、右手两拍，相位相同',
  },
  {
    key: 'full', meter: '6/8', bpm: 40, bar: 6, unitMs: 500, bars: 4,
    hands: 2, cue: 'none', pattern: [[0, 3], [0, 2, 4]], winMs: 200,
    label: '双手 · 二与三', note: '左手两拍对右手三拍，只有小节头尾对齐',
  },
];
const TEMPO_SCORE_MAP = {};
for (let i = 0; i < TEMPO_SCORES.length; i += 1) TEMPO_SCORE_MAP[TEMPO_SCORES[i].key] = TEMPO_SCORES[i];

function tempoScoreOf(key) {
  return TEMPO_SCORE_MAP[key] || TEMPO_SCORES[0];
}
// 绝境后段换比例（181–200）：章内只许变难，二对三换三对四更难。
// 这一条由 buildParamsAt 按关号写进 pattern，档表里只留基准谱。
// 右手加切分的切换点必须落在**圆满段的中段**（501–1000 的中点 751）。
// 这个数是全书关号：五档各 40 关的时代写 181（绝境段第 21 关），
// 关卡收成 1–1000 之后 181 落在小成段——那里是单手，条件不成立；
// 而 201 起（大成段）条件立刻成立，于是大成从第 1 关就顶着最难的谱，
// 段内那一次「看得见的变化」反而消失了。751 = 501 + 250。
const TEMPO_DESPERATE_LATE = { from: 751, pattern: [[0, 3], [0, 2, 3, 4]], label: '右手加切分' };

const TEMPO_CUE_NAMES = { all: '全标', next: '只标下一音', bar: '只标小节首拍', none: '无提示' };

// 节律判定的章内收紧。两件事：
// ① 格长按章内进度收 12%（越往后心跳越快），判定窗收 18%；
// ② 圆满段后段（751 关起）右手谱加两个切分音——段内只许变难，这一条是「看得见」的那一半：
//    格长收 12% 玩家听不出来，谱里多两个音一进局就看得出来。
// 只在生成端算一次，玩法层不再二次收紧（否则「本关小变化」会报出盘面上没有的变化）。
function tempoShortest(q) {
  const bar = Math.max(2, Math.round(q.bar || 8));
  const unit = Math.max(120, Math.round(q.unitMs || 500));
  const rows = Array.isArray(q.pattern) ? q.pattern : [[0]];
  let min = Infinity;
  for (let h = 0; h < rows.length; h += 1) {
    const onsets = (rows[h] || []).filter(function (v) { return v >= 0 && v < bar; })
      .slice().sort(function (a, b) { return a - b; });
    if (!onsets.length) continue;
    for (let j = 0; j < onsets.length; j += 1) {
      const next = j + 1 < onsets.length ? onsets[j + 1] : onsets[0] + bar;
      min = Math.min(min, (next - onsets[j]) * unit);
    }
  }
  return isFinite(min) ? min : bar * unit;
}

// 拍号分母定「一拍值几分音符」：分母 4 → 一拍是四分音符 = 两个八分格；
// 分母 8（6/8 这类复拍子）→ 一拍是**附点四分音符** = 三个八分格。
// BPM 的「拍」按音乐惯例永远指拍号的那一拍，所以换算是 `60000 ÷ (一格 × 每拍几格)`，
// 不是恒定的 ÷2。写成 ÷2 会让 6/8 段报出 60，而玩家拿附点四分对表只能对上 40。
function tempoBpm(meter, unitMs) {
  const den = Number(String(meter || '4/4').split('/')[1]) || 4;
  const cellsPerBeat = den === 8 ? 3 : 2;
  return Math.round(60000 / (Math.max(1, unitMs) * cellsPerBeat));
}

function tempoAt(out, level) {
  const f = levelData.progressOf(level);
  const lv = levelData.clampLevel(level);
  out.unitMs = Math.max(240, Math.round(out.unitMs * (1 - 0.12 * f) / 10) * 10);
  // 速度跟着格长走：章内格长一收，BPM 就真涨。
  // 档表上那个 60 / 75 / 40 只是本段首关的数，不能留着不动。
  out.bpm = tempoBpm(out.meter, out.unitMs);
  // 判定窗在生成端就落到「生效值」：玩法层还要乘本门的 ×1.45、再按四成间隔封顶，
  // 若这里只给「想要的宽」，被上限夹住的那几十关会报出「319 → 317 毫秒」而盘面一动不动。
  const cap = tempoShortest(out) * TEMPO_FLOOR.maxWinFrac / TEMPO_FLOOR.twistWin;
  out.winMs = Math.max(TEMPO_FLOOR.minWinMs,
    Math.min(Math.round(out.winMs * (1 - 0.18 * f)), Math.round(cap)));
  if (out.hands === 2 && lv >= TEMPO_DESPERATE_LATE.from) {
    out.pattern = TEMPO_DESPERATE_LATE.pattern.map(function (row) { return row.slice(); });
    out.scoreLabel = TEMPO_DESPERATE_LATE.label;
  }
  return out;
}
// 时间 / 判定窗类：pace 越小越难。window 是 0~1 的小数，保留三位。
const PACE_KEYS = ['interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'dropMs', 'window', 'msPerNote', 'life'];
// 判定窗口类曾经单独一档（WINDOW_KEYS = ['life'] × windowPace，2.34 倍）：
// 「窗口每短一成，容错掉的不是一成」，结果把扫斩的绝境档压成纯手速活。
// life 已并回 PACE_KEYS（1.69 倍），独立的 windowPace 字段与那个空数组一并删掉——
// 五段写了一列数却没有任何消费者，正是「生成了没生效」。时间是佐味，不是主菜。
// 节律判定的判定窗 `window` 也走 pace；它的硬下限另见 TEMPO_FLOOR。
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
  penaltySec: '点错罚', capFactor: '推数预算', budgetSlack: '步数余量',
  // 结构键：换章时真正换了盘面的那些数。以前 levelDelta 的候选列里没有它们，
  // 于是「气窍 5 → 6 对」「要合出 128 → 256」这种玩家一眼就看见的变化，
  // 被「亮起时长 0.70 → 0.84 秒」挤掉，五门换章甚至直接报「与上一关规格相同」。
  cols: '盘面列', rows: '盘面行', size: '盘面', kinds: '纹种', holes: '待填格',
  count: '每批数目', rounds: '批数', target: '合出', minOpt: '最优下限', maxOpt: '最优上限',
  boxes: '石箱', walls: '壁垒', minSteps: '最优下限', hiSteps: '最优上限',
  lenStep: '刀路桩数', missCost: '认错罚息', grid: '盘面', nearGap: '数距',
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

// 一个段的原始参数，不做段内混合。depthIndex 就是段序（0–4）。
// 越界时在最后一段上再压一档：段表只有五张，超出的段按「比圆满还紧 6%」兜底，
// 这样新增段时不会突然掉回第 1 段的参数。
function pseudoDiff(depthIndex) {
  const idx = Math.round(depthIndex);
  if (idx <= STAGES.length - 1) return STAGES[Math.max(0, idx)];
  const base = STAGES[STAGES.length - 1];
  return {
    key: base.key + '+', name: base.name, label: base.label,
    from: base.from, to: base.to, qi: base.qi,
    pace: base.pace * 0.94, goal: base.goal * 1.06,
    gear: 'hard', depth: base.depth, note: base.note, desc: base.desc,
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
  // 三秀同收的五段整表注入：玩法层只读 params，不再自己拼 620 + depth×150。
  // 这几个键不在 PACE / GOAL 缩放名单里，免得被 pace 又乘一遍（花色与罚息是整数）。
  if (method && method.game === 'match') {
    const lv = MATCH_LEVELS[d.depth];
    // cols/rows 覆盖 method.params 里的 6×6 种子值：五段各一副盘，盘面规格从这里出。
    out.cols = lv.cols;
    out.rows = lv.rows;
    out.kinds = lv.kinds;
    out.duration = lv.duration;
    out.missCost = lv.missCost;
    out.shuffleCost = lv.shuffleCost;
    out.hintCost = lv.hintCost;
    out.sLine = lv.sLine;
  }
  // 灵纹连线：盘面规格、纹种、时辰全部按整表 + 关号现算，不通用缩放。
  // 时辰特意放在 TIME_LEVELS 与 LEVEL_TIGHTEN 之外：盘变大时本该多给息，
  // 而「章内收三成、换章复位」会让第 40 关（约 39 息）比第 41 关（约 53 息）还紧。
  // 现在换章时总时辰可以变长，但「一对平均给几息」永远只减不增——这才是玩家比较难度的尺子。
  if (method && method.game === 'link') {
    const lv = LINK_LEVELS[d.depth];
    out.cols = lv.cols;
    out.rows = lv.rows;
    out.kinds = lv.kinds;
    out.turns = lv.turns;
    out.duration = linkDurationAt(levelData.stageRange(d.depth).from);
    // 段基准是「均匀布纹」，段内一级一级偏过去（tweakParams）。写在这里是为了
    // buildParams(method, stage) 那些段级读者也有同一个起点，不会出现 undefined。
    out.weave = 0;
    // 纹样主题同理：段首关（1/11/51/201/501）都给第一套，按关号的轮换由 tweakParams 注入。
    out.theme = levelData.linkThemeOf(levelData.stageRange(d.depth).from);
    // 盘形同理：段级读者拿到的是段首关那一副（未入门段是整块），段内轮换由 tweakParams 注入。
    // 空位列表要跟 duration 同源：时辰的分母是「本关能接几对」，挖了空位就不是 cols*rows/2。
    out.layout = levelData.linkLayoutOf(levelData.stageRange(d.depth).from);
    out.gaps = levelData.linkGapsAt(levelData.stageRange(d.depth).from, out.cols, out.rows);
  }
  // 阵灯推演按「比最优多走几步」评级，盘面规格、最优步数区间与步数余量由这一份表按档注入。
  if (method && method.game === 'lights') {
    const lv = LIGHTS_LEVELS[d.depth];
    out.size = lv.size;
    out.minSteps = lv.min;
    out.hiSteps = lv.hi;
    out.budgetSlack = lv.slack;
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
  // 节律判定：整副谱按档注入。以前这里只给 beats / speed / window 三个数，
  // 五段谱型一模一样，玩家在第一章就学会了全部本事——后面 160 关只是把窗收窄。
  // 现在每档给「拍号 + 速度 + 音符时值 + 手数 + 提示层级」五项，
  // 玩法层的 score() 再把它们折成两条时间线。
  if (method && method.game === 'tempo') {
    const sc = tempoScoreOf(d.key);
    out.meter = sc.meter;
    out.bpm = sc.bpm;
    out.bar = sc.bar;
    out.unitMs = sc.unitMs;
    out.bars = sc.bars;
    out.hands = sc.hands;
    out.cue = sc.cue;
    out.winMs = sc.winMs;
    out.pattern = sc.pattern.map(function (row) { return row.slice(); });
    out.scoreLabel = sc.label;
  }
  // 滑块让路：本盘最优步数的上下限 + 步数预算系数，盘面固定 4×4。
  // capFactor 以前不注入，模块里那句 `p.capFactor || 2.4` 永远走兜底——
  // 界面上写着「预算 ×2.40」，五段其实一模一样。
  if (method && method.game === 'klotski') {    const lv = KLOTSKI_LEVELS[d.depth];
    out.minOpt = lv.minOpt;
    out.maxOpt = lv.maxOpt;
    out.capFactor = lv.capFactor;
  }
  // 段位表住在模块里的四门：只注入本段最关键的那个数，给准备页的难度说明用。
  if (method && method.game === 'merge') out.target = MERGE_TARGETS[d.depth];
  // 顺序点格注三样：盘面边长、点错罚几秒、点过的格退不退场。
  // 前两样决定「换了几格」与「一次失误多贵」，第三样是高档唯一的新规则，
  // 三样玩法层都真的读（`size` 定生成、`penaltySec` 进罚时、`fade` 进 paint）。
  if (method && method.game === 'schulte') {
    out.size = SCHULTE_SIZES[d.depth];
    out.fade = SCHULTE_FADE[d.depth];
    out.penaltySec = SCHULTE_PENALTIES[d.depth];
  }
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
  if (method && method.game === 'mines') {
    const lv = MINES_LEVELS[d.depth];
    out.cols = lv.cols;
    out.rows = lv.rows;
    out.mines = lv.mines;
    out.hearts = lv.hearts;
  }
  // 落石垒基：盘面是标准场地，不进 params；五段只注入起始级、每级层数与 S 线。
  // 玩法层三样都真的读走（重力表按级取、meter 写「再 N 层进级」、评级看分）。
  if (method && method.game === 'blocks') {
    const lv = BLOCK_LEVELS[d.depth];
    out.startLevel = lv.startLevel;
    out.linesPerLevel = lv.linesPerLevel;
    out.sLine = lv.sLine;
  }
  if (method && method.game === 'merge') out.startTiles = MERGE_START_TILES[d.depth];
  if (method && method.game === 'pushbox') out.capFactor = PUSHBOX_CAP_FACTORS[d.depth];
  // steps 是「这盘最少几步」这类按档递增的量：params 里写的是简单档的值，每档 +1。
  if (typeof out.steps === 'number') out.steps += d.depth;
  if (typeof out[SPEED_KEY] === 'number') out[SPEED_KEY] = Math.round(out[SPEED_KEY] / d.pace * 10000) / 10000;
  // 段表只有五张，超出的段（depthIndex > 4）靠这一行继续收紧，
  // 否则新加的那一段会和圆满段首关一模一样。
  if (depthIndex > 4) {
    if (typeof out.duration === 'number') out.duration = Math.max(8, Math.round(out.duration * 0.94));
    if (typeof out.timeLimit === 'number') out.timeLimit = Math.max(8, Math.round(out.timeLimit * 0.94));
  }
  return out;
}

// 段基准参数：按段序取这一段的原始参数（不做段内收紧）。
// 准备页「本段换了什么」与说明页的对照表都走它。
function buildParams(method, stageIndex) {
  return rawParams(method, stageIndexLike(stageIndex));
}

// 章内收紧：一章 40 关，末关比首关紧三成。这个数只乘「越短越难」的量，
// 不碰盘面规格——6 列混 7 列算出来还是 6 列，那是假变化。
//
// 阵灯推演的两个键是特意从这张表里摘出去的：
//   · `minSteps`（本段最优步数的下限）**不是**「越紧越难」的量——把它乘 0.7，
//     等于章末要求更短的解，盘反而更好解。它原来在表里，于是每章最后几关
//     都比头几关容易，和「章内只许变难」正好相反。
//   · `capSteps` 已经没有这个参数了（预算按最优 + 余量现算），留在表里只会让
//     下一档预算被乘成一个和最优脱钩的数。
// 这一门章内真正收紧的是 `budgetSlack`（余量 7 → 5），下限 5：余量压到 4，
// A 线（冗余 2）与 B 线（余量 − 2 = 2）重合成一条，B 档当场消失。
const LEVEL_TIGHTEN = 0.30;
// 罚时不在这一列里：它是「代价」，方向与时间类相反——乘 0.7 只会让越深的关卡手滑越便宜，
// 是这一整章里唯一一处「越往后越松」。罚时按档走整表（SCHULTE_PENALTIES），章内不动。
const LEVEL_TIME_KEYS = ['duration', 'timeLimit', 'interval', 'flashMs', 'gapMs', 'windowMs',
  'shuffleMs', 'flipMs', 'dropMs', 'msPerNote', 'life', 'capFactor', 'budgetSlack',
  'window'];

// 某一关的完整参数。一段一关，相邻两关按参数口径（`buildParamsAt`）逐位不同；
// 但界面真报得出来的是 `practice.levelDelta`（严口径）：只认结构键（盘面规格、规则开关），
// 不认毫秒微调。两者不同源是有意的——「盘面换了台阶」和「这一档紧了一点」是两件事，
// 混在一起会让 199 级台阶读起来等于零级（见 `50-balance/04-open-issues` D11）。
// 界面据实报「与上一关规格相同」，见 `levelDelta`。
//
// 章内只做一件事：把本段的时间与预算按段收紧，方向永远是「更难」。
// 不朝下一章插值——九宫从 4×4 换 6×6 时下一章的时间反而更多（换盘要留读盘时间），
// 朝它插值会让章内时间越打越多，那是反的。
function buildParamsAt(method, level) {
  const lv = levelData.clampLevel(level);
  const ch = levelData.stageOfLevel(lv);
  const f = levelData.progressOf(lv);
  const out = rawParams(method, ch);
  const tighten = 1 - LEVEL_TIGHTEN * f;
  // 灵纹连线的时辰不进这一刀：它按「每对预算 × 本段对数」沿关号连续收，
  // 再叠一次章内三成，就会在章末压出一个比下一章首关还紧的倒挂。
  const linkGame = method && method.game === 'link';
  // 滑块让路的预算系数也不进这一刀：它在 tweakParams 里按段内进度单独收 18%。
  // 两刀叠起来要先把这一刀除掉再乘（除法 + 两次四舍五入），段内会出现
  // 「预算 ×2.66 → ×2.67」这种反向回弹——数值只差 0.4%，但它是**变松**，
  // 正是「段内只许紧」这条断言要挡的东西。收成一刀就没有中间取整。
  const capOwned = method && method.game === 'klotski';
  for (let i = 0; i < LEVEL_TIME_KEYS.length; i += 1) {
    const k = LEVEL_TIME_KEYS[i];
    if (linkGame && k === 'duration') continue;
    if (capOwned && k === 'capFactor') continue;
    if (typeof out[k] !== 'number') continue;
    const min = k === 'budgetSlack' ? 5 : k === 'timeLimit' || k === 'duration' ? 8 : 0;
    out[k] = Math.max(min, levelRound(k, out[k] * tighten));
  }
  out.depth = ch;
  out.level = lv;
  out.chapter = ch;
  out.stage = levelData.stageOf(lv);
  const tuned = levelData.tweakParams(method, out, lv);
  // 节律判定的谱与格长在生成端一次收口：参数与盘面必须一起停，
  // 否则「本关小变化」会写出一个盘面上根本没有的变化。
  if (method.game === 'tempo') tempoAt(tuned, lv);
  // 灵纹连线的时辰在这一步统一收口：一关一个数，沿全书连续收，不按章回卷。
  if (linkGame) tuned.duration = linkDurationAt(lv);
  return tuned;
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
// 比较基准一定是同一门、本关减一，而不是「与简单档比」——玩家看的是脚下这一步。
// 结构键：玩家进局一眼能看见的盘面 / 数量 / 目标。段内一律不动，换段才换。
// 候选列里要是没有它们，「本关变化」就永远只剩毫秒级微调。
const LEVEL_STRUCT_KEYS = ['cols', 'rows', 'size', 'grid', 'kinds', 'holes', 'count', 'rounds',
  'target', 'minOpt', 'maxOpt', 'boxes', 'walls', 'startTiles', 'hearts', 'steps',
  'minSteps', 'hiSteps', 'startLevel', 'linesPerLevel', 'lenStep', 'decoys', 'pairs',
  'mines', 'beats', 'segments', 'chainGoal', 'maxRound', 'scramble', 'startLen',
  'baseLen', 'budgetSlack', 'missCost', 'nearGap', 'hands', 'bar', 'bars', 'turns'];
// 沿全书关号连续收的结构旋钮不属于「本段换了哪一副盘」，换段时不与盘面规格抢那两条额度。
const CONTINUOUS_STRUCT_KEYS = ['nearGap'];

// 一关的「规格串」：只给第一关与最后一关用。
// 这两关没有「上一关」可比（首关前面是空的，末关常常因为取整与上一关一字不差），
// 旧版于是都落到页面那句「与上一关规格相同」——第一关读到这句，玩家会以为自己漏了前一关；
// 第 1000 关读到这句，玩家读不出「到此为止」。
// 挑的是进局第一眼就看得见的数，顺序永远是「盘面 → 规则 → 时辰」，不报毫秒。
function levelSpecItems(method, q, limit) {
  const out = [];
  const num = function (v) { return typeof v === 'number'; };
  if (num(q.cols) && num(q.rows)) out.push('盘面 ' + q.cols + '×' + q.rows);
  else if (num(q.size)) out.push('盘面 ' + Math.round(q.size) + '×' + Math.round(q.size));
  else if (num(q.grid)) out.push('盘面 ' + Math.round(q.grid) + ' 格');
  else if (num(q.cols)) out.push('盘面 ' + q.cols + ' 列');
  if (num(q.kinds)) out.push(labelOf(method, 'kinds') + ' ' + q.kinds + ' 种');
  // 节律判定先报手数与谱面：它的盘面是谱，不是格子。
  if (num(q.hands)) out.push(q.hands >= 2 ? '双手' : '单手');
  if (q.meter) out.push('拍号 ' + q.meter);
  if (num(q.bars)) out.push(Math.round(q.bars) + ' 小节');
  if (num(q.beats)) out.push(q.beats + ' 息');
  if (num(q.mines)) out.push('禁制 ' + q.mines);
  if (num(q.holes)) out.push('待填 ' + q.holes + ' 格');
  if (num(q.pairs)) out.push('气窍 ' + q.pairs + ' 对');
  if (num(q.boxes)) out.push('石箱 ' + q.boxes);
  if (num(q.walls) && q.walls > 0) out.push('壁垒 ' + q.walls);
  if (num(q.startLevel)) out.push('起手第 ' + Math.round(q.startLevel) + ' 级');
  if (num(q.linesPerLevel)) out.push('每级 ' + q.linesPerLevel + ' 层');
  if (num(q.minSteps) && num(q.hiSteps)) out.push('最优 ' + q.minSteps + '–' + q.hiSteps + ' 步');
  else if (num(q.minOpt) && num(q.maxOpt)) out.push('最优 ' + q.minOpt + '–' + q.maxOpt + ' 步');
  if (num(q.startLen)) out.push('起始 ' + q.startLen + ' 字');
  if (num(q.maxRound)) out.push('口诀 ' + q.maxRound + ' 轮');
  if (num(q.target)) out.push('合出 ' + q.target);
  if (num(q.startTiles)) out.push('起手 ' + q.startTiles + ' 块');
  if (num(q.fourRate)) out.push('给 4 比例 ' + Math.round(q.fourRate * 100) + '%');
  if (num(q.hearts)) out.push('心神 ' + q.hearts + ' 盏');
  if (num(q.count)) out.push('每批 ' + q.count + ' 个');
  if (num(q.rounds)) out.push(q.rounds + ' 批');
  if (num(q.penaltySec)) out.push('点错罚 ' + q.penaltySec.toFixed(1) + ' 秒');
  if (num(q.capFactor)) out.push(labelOf(method, 'capFactor') + ' ×' + q.capFactor.toFixed(2));
  if (num(q.lenStep) && q.lenStep > 0) out.push('刀路多 ' + q.lenStep + ' 桩');
  // 灵纹连线的总时辰换章时会被盘变大顶上去，能比的是「一对平均给几息」。
  if (method && method.game === 'link' && num(q.duration) && num(q.cols) && num(q.rows)) {
    out.push('每对 ' + (q.duration / linkPairsOf(q)).toFixed(2) + ' 息');
  } else if (num(q.duration)) out.push('时辰 ' + Math.round(q.duration) + ' 秒');
  else if (num(q.timeLimit)) out.push('时辰 ' + Math.round(q.timeLimit) + ' 秒');
  return out.slice(0, limit || 3);
}

// 末关那一行：从起手关走到这里，累计变了哪几处。
// 比的是「本关 vs 第一关」，不是「本关 vs 上一关」——末关要回答的是「一千关走下来变了什么」。
function levelSpanItems(method, from, to, limit) {
  const out = [];
  const skip = {};
  const cap = limit || 2;
  const num = function (v) { return typeof v === 'number'; };
  const add = function (s) { if (s && out.length < cap) out.push(s); };
  const pair = function (k) {
    if (!num(from[k]) || !num(to[k]) || from[k] === to[k]) return;
    const a = levelFmt(k, from[k]);
    const b = levelFmt(k, to[k]);
    if (a === b) return;
    add(labelOf(method, k) + ' ' + a + ' → ' + b);
  };
  // 时辰只报「变短」。九宫从 4×4 换 9×9 会多给时间，报出来等于说这一关变松了；
  // 灵纹连线连总时辰也不报，报「一对平均给几息」——盘变大本来就该多给时间。
  if (method && method.game === 'link' && num(from.duration) && num(to.duration)
    && num(from.cols) && num(from.rows) && num(to.cols) && num(to.rows)) {
    add('每对时辰 ' + (from.duration / linkPairsOf(from)).toFixed(2)
      + ' → ' + (to.duration / linkPairsOf(to)).toFixed(2) + ' 息');
    skip.duration = true;
  } else if (num(from.duration) && num(to.duration) && to.duration < from.duration) {
    pair('duration');
    skip.duration = true;
  } else if (num(from.timeLimit) && num(to.timeLimit) && to.timeLimit < from.timeLimit) {
    pair('timeLimit');
    skip.timeLimit = true;
  }
  // 盘面：能数格子就数格子（刀盘「9 格 → 25 格」比「3 列 → 5 列」直观），
  // 其次方块边长，最后行列。
  if (num(from.grid) && num(to.grid) && from.grid !== to.grid) {
    add('盘面 ' + Math.round(from.grid) + ' 格 → ' + Math.round(to.grid) + ' 格');
    skip.grid = true;
  } else if (num(from.size) && num(to.size) && from.size !== to.size) {
    add('盘面 ' + from.size + '×' + from.size + ' → ' + to.size + '×' + to.size);
    skip.size = true;
  } else if (num(from.cols) && num(from.rows) && num(to.cols) && num(to.rows)
    && (from.cols !== to.cols || from.rows !== to.rows)) {
    add('盘面 ' + from.cols + '×' + from.rows + ' → ' + to.cols + '×' + to.rows);
    skip.cols = true;
    skip.rows = true;
  }
  // 最优步数：下限与上限是一件事，分开报会读成「下限 2 → 6 · 上限 4 → 12」。
  const optPairs = [['minOpt', 'maxOpt'], ['minSteps', 'hiSteps']];
  for (let i = 0; i < optPairs.length; i += 1) {
    const lo = optPairs[i][0];
    const hi = optPairs[i][1];
    if (num(from[lo]) && num(to[lo]) && num(from[hi]) && num(to[hi])
      && (from[lo] !== to[lo] || from[hi] !== to[hi])) {
      add('最优 ' + from[lo] + '–' + from[hi] + ' 步 → ' + to[lo] + '–' + to[hi] + ' 步');
      skip[lo] = true;
      skip[hi] = true;
    }
  }
  for (let i = 0; i < LEVEL_STRUCT_KEYS.length && out.length < cap; i += 1) {
    const k = LEVEL_STRUCT_KEYS[i];
    if (skip[k] || CONTINUOUS_STRUCT_KEYS.indexOf(k) >= 0) continue;
    // 这两句的标签自带量词，再套 levelFmt 会写成「起手块 2 块」「起手级数 第 1 级」。
    if (k === 'startLevel' && num(from[k]) && num(to[k]) && from[k] !== to[k]) {
      add('起手第 ' + Math.round(from[k]) + ' 级 → 第 ' + Math.round(to[k]) + ' 级');
      continue;
    }
    if (k === 'startTiles' && num(from[k]) && num(to[k]) && from[k] !== to[k]) {
      add('起手 ' + from[k] + ' 块 → ' + to[k] + ' 块');
      continue;
    }
    pair(k);
  }
  // 罚时与预算不在结构键里，但它们是段差的真承重轴。
  pair('penaltySec');
  pair('capFactor');
  return out;
}

// 这一关的「小变化」：拿上一关的参数逐项比，只报玩家看得懂的。
// 比较基准一定是同一门、本关减一，而不是「与简单档比」——玩家看的是脚下这一步。
//
// 换段是另一种事：盘面规格换一副，同时时辰 / 停留一律回弹给读盘（段末比下段首关还紧）。
// 这时若照旧按 PACE_KEYS 顺序报，玩家看到的是「翻牌停留 0.70 → 0.84 秒」——
// 又细、又像变简单，真正的大变化反而藏在后面。所以换段只报结构键，并给一个 chapter 标记。
function levelDelta(method, level) {
  const lv = levelData.clampLevel(level);
  const prevLv = lv - 1;   // 一关一步：本关与上一关比
  // 第一关没有上一关。旧版在这里直接返回空，准备页于是兜底写「与上一关规格相同」——
  // 玩家在第一关读到这句，只会以为自己漏了前一关。据实报本关的起手规格。
  if (prevLv < 1) {
    const spec = levelSpecItems(method, buildParamsAt(method, lv), 3).join(' · ');
    return [{ key: 'start', label: '起手', start: true,
      text: '本门第一关' + (spec ? '：' + spec : '') }];
  }
  const now = buildParamsAt(method, lv);
  const prev = buildParamsAt(method, prevLv);
  // 最后一关：999 → 1000 常常因为整秒取整一字未动，旧版落到「与上一关规格相同」，
  // 玩家读不出「到此为止」。这里改说「比起手关累计变了什么」。
  const isLast = lv >= levelData.LEVEL_MAX;
  let first = null;
  const finalLine = function (items) {
    if (first === null) first = buildParamsAt(method, 1);
    const list = items || levelSpanItems(method, first, now, 2);
    return [{ key: 'final', label: '圆满', final: true,
      text: '本门最后一关' + (list.length ? ' · 比起手关：' + list.join(' · ') : '') }];
  };
  // 末关统一收口：999 → 1000 常常因为整秒取整一字未动，不论上一关有没有变化，
  // 最后一关都该说「到此为止」和「一千关走下来变了什么」。
  // 节律判定的跨度是手数与谱型，不是毫秒。
  if (isLast) {
    if (method && method.game === 'tempo') {
      const base = buildParamsAt(method, 1);
      const items = [];
      if (base.hands !== now.hands) {
        items.push('手数 ' + (base.hands >= 2 ? '双手 → 单手' : '单手 → 双手'));
      }
      if (base.scoreLabel !== now.scoreLabel) {
        items.push('谱型「' + base.scoreLabel + '」→「' + now.scoreLabel + '」');
      }
      return finalLine(items.length ? items : null);
    }
    return finalLine();
  }
  // 灵纹连线只报四样玩家真看得见的东西：换段、换盘、换纹种、布纹与每对时辰。
  // 总时辰在换章时会因盘变大而变长，直接报「时辰 46 → 54 息」等于说这一关变松了；
  // 玩家该看的是「一对平均给几息」，那个数永远只减不增。
  // 照纹高亮时长（hintMs）恒定，旧版的 flashMs 会报出一百多关「0.75 → 0.74 秒」——
  // 参数真的动了 10ms、盘面一点没动，正是这一条要挡住的假变化。
  if (method && method.game === 'link') {
    const chStart = levelData.stageOfLevel(lv) !== levelData.stageOfLevel(prevLv);
    const out = [];
    if (chStart) {
      const c = levelData.stageRange(levelData.stageOfLevel(lv));
      out.push({ key: 'chapter', label: '换段', chapter: true,
        text: '踏入' + c.label + '（' + c.name + '）' });
    }
    if (now.cols !== prev.cols || now.rows !== prev.rows) {
      out.push({ key: 'cols', label: '盘面', text: '盘面 ' + prev.cols + '×' + prev.rows
        + ' → ' + now.cols + '×' + now.rows });
    }
    if (now.kinds !== prev.kinds) {
      out.push({ key: 'kinds', label: '灵纹', text: '灵纹 ' + prev.kinds + ' → ' + now.kinds + ' 种' });
    }
    // 折数是换段才动的规则：大成起从两折收到一折，盘面没变也让可连对数塌了一截。
    // 它比「盘面变大」更该让玩家先看见——玩家照老习惯找线会连不上。
    if (now.turns !== prev.turns) {
      out.push({ key: 'turns', label: '转折',
        text: '连线只准转折 ' + now.turns + ' 次（原 ' + prev.turns + ' 次）' });
    }
    // 盘形与纹样是段内一眼看得见的两件事：每四 / 五关换一副，所以排在最前，
    // 优先于「布纹」（每 10 关才动一格）与「每对时辰」（几乎每关都在动）。
    // 换段那关不报——段首本来就是整块 + 新纹种，前三条额度已经说完了。
    if (!chStart && now.layout !== prev.layout) {
      out.push({ key: 'layout', label: '盘形',
        text: '盘形 ' + levelData.linkLayoutNameOf(prevLv) + ' → ' + levelData.linkLayoutNameOf(lv) });
    }
    if (!chStart && now.theme !== prev.theme) {
      out.push({ key: 'theme', label: '纹样',
        text: '纹样 ' + linkThemeNameOf(prev.theme) + ' → ' + linkThemeNameOf(now.theme) });
    }
    // 布纹只在段内报：下一段首关会从「极偏」回到「均匀」，那是新段的起手牌阵，
    // 不是这一关变松了。换段那关前三条额度留给换段 / 换盘 / 换纹种。
    if (!chStart && now.weave !== prev.weave) {
      out.push({ key: 'weave', label: '布纹',
        text: '布纹 ' + weaveNameOf(prev.weave) + ' → ' + weaveNameOf(now.weave) });
    }
    const perPair = function (q) { return (q.duration / linkPairsOf(q)).toFixed(2); };
    const a = perPair(prev);
    const b = perPair(now);
    // 只报「变紧」。换段时对数从 12 跳到 14，总时辰是整数秒、每对的粒度跟着变细，
    // 四舍五入后可能高 0.01 息——那是取整的回弹，不是这一关变松了。
    // 把回弹写成「每对时辰 5.42 → 5.43」等于告诉玩家这一关更好过，比不报更糟。
    if (Number(b) < Number(a)) out.push({ key: 'perPair', label: '每对时辰', text: '每对时辰 ' + a + ' → ' + b + ' 息' });
    return out.slice(0, chStart ? 3 : 2);
  }

  const isChapter = levelData.stageOfLevel(lv) !== levelData.stageOfLevel(prevLv);
  const push = function (out, k) {
    if (typeof now[k] !== 'number' || typeof prev[k] !== 'number') return;
    if (now[k] === prev[k]) return;
    // 格式化之后一样就不再报：毫秒级差 1ms 写出来是「0.82 秒 → 0.82 秒」，
    // 玩家只会以为这游戏在骗他。
    const a = levelFmt(k, prev[k]);
    const b = levelFmt(k, now[k]);
    if (a === b) return;
    out.push({ key: k, label: lineLabelOf(method, k), text: lineLabelOf(method, k) + ' ' + a + ' → ' + b });
  };

  // 节律判定只报四样玩家真看得见的东西：换章、手数、谱型、提示还剩多少。
  // 以前这里报的是「判定窗 5.5% → 5.4%」——盘面上一整局一模一样，
  // 玩家打一百多关说不出哪里变了，正是这一条要挡住的假变化。
  if (method && method.game === 'tempo') {
    const out = [];
    if (isChapter) {
      const c = levelData.stageRange(levelData.stageOfLevel(lv));
      out.push({ key: 'chapter', label: '换段', chapter: true,
        text: '踏入' + c.label + '（' + c.name + '）' });
    }
    if (now.hands !== prev.hands) {
      out.push({ key: 'hands', label: '手数',
        text: now.hands >= 2 ? '单手 → 双手，左右各守一条节拍' : '双手 → 单手' });
    }
    if (JSON.stringify(now.pattern) !== JSON.stringify(prev.pattern)) {
      out.push({ key: 'score', label: '谱型',
        text: '谱型「' + (prev.scoreLabel || '') + '」→「' + (now.scoreLabel || '') + '」' });
    }
    if (now.cue !== prev.cue) {
      out.push({ key: 'cue', label: '提示',
        text: '提示 ' + TEMPO_CUE_NAMES[prev.cue] + ' → ' + TEMPO_CUE_NAMES[now.cue] });
    }
    // 章内那点收紧（格长一关 2 毫秒、判定窗一关 1 毫秒）不报：报出来就是
    // 「判定窗 319 → 317 毫秒」，玩家一个字都看不出来，和「把 20 秒写成 19.5 秒」是同一种假变化。
    // 有 3% 的实质变化才开口，其余关据实写「与上一关规格相同」。
    if (!isChapter && out.length < 3 && Math.abs(now.unitMs / prev.unitMs - 1) >= 0.03) push(out, 'unitMs');
    if (!isChapter && out.length < 3 && Math.abs(now.winMs / prev.winMs - 1) >= 0.03) push(out, 'winMs');
    return out.slice(0, 3);
  }

  if (isChapter) {
    const ch = levelData.stageRange(levelData.stageOfLevel(lv));
    const out = [{ key: 'chapter', label: '换段', chapter: true,
      text: '踏入' + ch.label + '（' + ch.name + '）' }];
    // 盘面宽高合并成一条，比「盘面列 6 → 7 / 盘面行 6 → 7」好读，也不占两条额度。
    if (now.cols && now.rows && (now.cols !== prev.cols || now.rows !== prev.rows)) {
      out.push({ key: 'cols', label: '盘面', text: '盘面 ' + prev.cols + '×' + prev.rows
        + ' → ' + now.cols + '×' + now.rows });
    }
    for (let i = 0; i < LEVEL_STRUCT_KEYS.length && out.length < 3; i += 1) {
      const k = LEVEL_STRUCT_KEYS[i];
      if (k === 'cols' || k === 'rows' || CONTINUOUS_STRUCT_KEYS.indexOf(k) >= 0) continue;
      push(out, k);
    }
    if (out.length === 1) {
      out.push({ key: 'sameBoard', label: '本章',
        text: '这一章沿用同一副盘，改的是时辰与节奏' });
    }
    // 换章不报时间类：那些数一律回弹给读盘，报出来只会像「变简单了」。
    return out;
  }

  const ordered = LEVEL_STRUCT_KEYS.concat(PACE_KEYS, GOAL_KEYS,
    ['duration', 'timeLimit', 'sLine', 'penaltySec', 'capFactor', 'fourRate', 'lineScale'])
    .filter(function (k, i, arr) { return k !== 'speed' && arr.indexOf(k) === i; });
  const out = [];
  for (let i = 0; i < ordered.length && out.length < 2; i += 1) push(out, ordered[i]);
  return out;
}

// 本段规格：换段那一关「踏入第 X 段」的提示，按任意关号常驻返回。
// 段界关（11 / 51 / 201 / 501）只是段内的最后一关，玩家可能打了十几局都还在同一段里，
// 所以不能说「换段那一关才有提示」——准备页任何时候都要能写清「你现在这副盘是哪一段的」。
// 页面不自己拼这一句。
function stageSpec(method, level) {
  const ch = levelData.stageOfLevel(level);
  if (ch === 0) return '';
  const c = levelData.stageRange(ch);
  const d = levelDelta(method, c.from);
  const spec = d.filter(function (x) { return x.key !== 'chapter' && x.key !== 'sameBoard'; })
    .map(function (x) { return x.text; }).join(' · ');
  return c.label + '（' + c.name + '）· '
    + (spec ? '本段换了一副：' + spec : '沿用上一副盘，改的是时辰与节奏');
}

// 关卡表里独有的两个旋钮（丹道起手 4 的比例、勘禁 S 线系数）没有通用标签。
const LEVEL_LABELS = { fourRate: '起手给 4', lineScale: 'S 线', startLevel: '起手级数', linesPerLevel: '每级层数',
  unitMs: '格长', winMs: '判定窗', bar: '每小节', bars: '小节数', hands: '手数', bpm: '速度',
  meter: '拍号', cue: '提示', scoreLabel: '谱型' };
// lineScale 在勘禁诀里只缩 S 线，在遍观毫厘诀里缩的是整条尺子（S/A/B 与时辰）——同一个键，两种口径。
// 写错一边，第 3 关的「本关小变化」就会说「S 线 96% → 95%」，而实际连 A 线也收了。
function lineLabelOf(method, key) {
  if (key === 'lineScale' && method && method.game === 'schulte') return '评级线';
  // 同一个键在不同门里不是一回事：三秀的 kinds 是花色、灵纹连线的是纹种；
  // 滑块让路的 capFactor 是步数预算、推石入位的是推数预算。局内与准备页要说同一句话。
  if (key === 'kinds' || key === 'capFactor') return labelOf(method, key);
  return LEVEL_LABELS[key] || FIELD_LABELS[key] || key;
}

function levelFmt(key, value) {
  if (key === 'fourRate') return Math.round(value * 100) + '%';
  // 节律判定的格长 / 判定窗都要写到毫秒：一章收 12% 摊到 40 关，每关只动几毫秒，
  // 四舍五入成整数就永远是「500 → 500」，那一行会一直是空的。
  if (key === 'hands') return value >= 2 ? '双手' : '单手';
  if (key === 'bar') return Math.round(value) + ' 格';
  if (key === 'bpm') return Math.round(value) + ' 拍/分';
  // 评级线每关只动 0.09%（全书 18% ÷ 200 关），取整到 1% 就永远是「96% → 96%」，
  // 「本关小变化」那一行会一直是空的——玩家会以为这一关什么都没变。
  if (key === 'lineScale') return (Math.round(value * 1000) / 10).toFixed(1) + '%';
  if (key === 'startTiles') return Math.round(value) + ' 块';
  if (key === 'size') return Math.round(value) + '×' + Math.round(value);
  if (key === 'grid') return Math.round(value) + ' 格';
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
  // 节律判定的格长与判定窗按毫秒写：折成秒会变成「0.50 秒 → 0.44 秒」，看不出收了多少。
  if (key === 'unitMs' || key === 'winMs') return Math.round(value) + ' 毫秒';
  if (MS_FIELDS.indexOf(key) >= 0) return (value / 1000).toFixed(2) + ' 秒';
  if (key === 'duration' || key === 'timeLimit' || key === 'penaltySec') return Math.round(value) + ' 秒';
  if (key === 'hearts') return Math.round(value) + ' 盏';
  if (key === 'capFactor') return '×' + value.toFixed(2);
  if (key === 'startLevel') return '第 ' + Math.round(value) + ' 级';
  if (key === 'linesPerLevel') return Math.round(value) + ' 层';
  if (key === 'budgetSlack') return '多 ' + Math.round(value) + ' 步';
  return String(Math.round(value));
}

// 给参悟准备页看的难度说明：与最简单档对比，列出这一档实际收紧了哪几处。
// 同一个字段在不同门里的叫法不同：capFactor 对推石入位是「推数预算」，对滑块让路是
// 「步数预算」。两边共用一个键，但玩家的口径不一样——写错一边就等于说明页在说别人的话。
function labelOf(method, key) {
  if (key === 'capFactor') return method && method.game === 'klotski' ? '步数预算' : '推数预算';
  if (key === 'lineScale') return lineLabelOf(method, key);
  // 同一个键在不同门里不是同一件事：三秀同收的 kinds 是花色，灵纹连线的是纹样。
  if (key === 'kinds') return method && method.game === 'match' ? '花色' : '灵纹';
  if (key === 'cols') return '盘面宽';
  if (key === 'rows') return '盘面高';
  return LEVEL_LABELS[key] || FIELD_LABELS[key] || key;
}

function stageDetail(method, stageIndex) {
  const idx = stageIndexLike(stageIndex);
  const d = STAGES[idx];
  const base = buildParams(method, 0);
  const now = buildParams(method, idx);
  const changes = [];
  // 时辰与四门新注入的档位参数也要进「本段紧在哪」：不然准备页写了「入门基准」，
  // 盘上的倒计时 / 心神 / 起手块却真的变了，说明和局内对不上。
  // 节律判定的「段差」是谱型/手数/格长，不是旧版的 speed / window（那两个键已经退役）。
  const ordered = ['cols', 'rows', 'kinds', 'hands', 'bar', 'bars', 'unitMs', 'winMs']
    .concat(PACE_KEYS, GOAL_KEYS,
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
    const lv = matchLevelOf(idx);
    brief = lv.cols + '×' + lv.rows + ' 盘 · ' + lv.kinds + ' 色 · ' + lv.duration + ' 息'
      + ' · 换不出少 ' + lv.missCost + ' 息 · 重排少 ' + lv.shuffleCost + ' 息 · S ' + lv.sLine + ' 分';
  } else if (method && method.game === 'lights') {
    const lv = lightsLevelOf(idx);
    brief = lv.size + '×' + lv.size + ' 盘 · 最优 ' + lv.min + '～' + lv.hi + ' 步'
      + ' · 最多多走 ' + lv.slack + ' 步';
  } else if (method && method.game === 'sudoku') {
    const lv = sudokuLevelOf(idx);
    brief = lv.size + '×' + lv.size + ' 盘 · 要填 ' + lv.holes + ' 格 · S 线 ' + lv.tS + ' 秒';
  } else if (method && method.game === 'klotski') {
    const lv = klotskiLevelOf(idx);
    brief = '4×4 小盘 · 最优 ' + lv.minOpt + '～' + lv.maxOpt + ' 步 · 预算 ×' + lv.capFactor.toFixed(2);
  } else if (method && method.game === 'merge') {
    brief = '本段要合出 ' + now.target + ' 一块 · 起手 ' + now.startTiles + ' 块';
  } else if (method && method.game === 'schulte') {
    brief = now.size + '×' + now.size + ' 盘 · ' + now.size * now.size + ' 个数 · 误点罚 '
      + SCHULTE_PENALTIES[d.depth] + ' 秒'
      + (SCHULTE_FADE[d.depth] ? ' · 点过的格退场' : ' · 点过的格不退场');
  } else if (method && method.game === 'pushbox') {
    // 每局现抽图，所以写「本段规格」而不是「第几张」：玩家要知道的是这一档会给他几处阵位、
    // 最难难到哪里，而不是一张他这辈子只会见到一次的图的编号。
    const side = now.inner + 2;
    brief = side + '×' + side + ' 盘 · ' + now.boxes + ' 处阵位'
      + (now.walls ? ' · ' + now.walls + ' 道内墙' : '')
      + ' · 每局重排 · 最优 ' + now.minOpt + '～' + now.maxOpt + ' 推';
  } else if (method && method.game === 'biggest') {
    brief = '本段 ' + now.rounds + ' 轮 · 每轮盘上 ' + now.count + ' 个数';
  } else if (method && method.game === 'click') {
    const lv = CLICK_LEVELS[d.depth];
    // 3 是刀的基准桩数（weapons.js 的 dao.baseLen）。CLICK_LEVELS 只服务刀这一套 profile，
    // 将来真有剑法挂上来时，基准要从 profile 里取，别把这个 3 抄过去。
    brief = lv.cols + '×' + lv.cols + ' 盘 · 刀路 ' + (lv.lenStep + 3) + ' 桩';
  } else if (method && method.game === 'mines') {
    const lv = MINES_LEVELS[d.depth];
    brief = lv.cols + '×' + lv.rows + ' 盘 · ' + lv.mines + ' 处禁制 · ' + lv.hearts + ' 盏心神';
  } else if (method && method.game === 'link') {
    // 这一门的难度不写在总秒数上（盘变大时辰就变长），写在「一对平均给几息」上。
    // 每对时辰从本段真实参数现算，不另抄一份 linkPerPairAt——向下取整之后两者会差到
    // 0.08 息，准备页说 5.50、局内却是 5.42，玩家一眼就看得出是两张嘴。
    // 对数也要读 linkPairsOf：盘形挖掉四格之后，cols*rows/2 已经不是牌的对数了。
    const pairs = linkPairsOf(now);
    brief = now.cols + '×' + now.rows + ' 盘 · ' + pairs + ' 对 · ' + now.kinds + ' 种灵纹 · '
      + now.duration + ' 息 · 每对 ' + (now.duration / pairs).toFixed(2) + ' 息 · 连线只准 '
      + now.turns + ' 折 · 布纹由均匀渐至极偏 · 盘形四副轮换';
  } else if (method && method.game === 'tempo') {
    // 这一门的段差是「换了一副谱」，不是「快了几毫秒」：谱型 / 手数 / 提示三样写在一句里，
    // 准备页才不会写着「最快节奏」而玩家进局发现只是窗窄了一点。
    brief = (now.meter || '') + ' · ' + (now.scoreLabel || '') + ' · ' + (now.hands > 1 ? '双手' : '单手')
      + ' · 每小节 ' + now.bar + ' 格 · 共 ' + now.bars + ' 小节 · 一格 ' + now.unitMs + ' 毫秒'
      + ' · 提示「' + (TEMPO_CUE_NAMES[now.cue] || '') + '」';
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
  // brief 是准备页用的整句（含罚时与 S 线），局内 HUD 塞不下。短版取前两截：
  // 每门的前两截都是「盘多大 + 本段最要紧的那条规格」，不另写一张与 brief 会漂的表。
  const short = brief.split(' · ').slice(0, 2).join(' · ');
  return {
    key: d.key,
    name: d.name,
    qiBase: d.qi,
    desc: d.desc,
    brief: brief,
    short: short,
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
    { at: 3, name: '死门', short: '✕ 格点不动', hard: true, desc: '盘上多一格暗红 ✕ 死门，这一格点不动；误触罚 2 步，盘面不动' },
    { at: 4, name: '双门', short: '死门两处', hard: true, desc: '死门增至两格；想专心推演可在准备页关掉' },
  ],
  forge: [
    { at: 3, name: '收势', short: '到靶心停一拍', hard: true, desc: '扫到靶心要停一拍再抬手；抢着抬算收势未成，只给半分并断刀势' },
    { at: 4, name: '禁桩', short: '绕开红叉', hard: true, desc: '盘上多出红叉禁桩，划到即断刀势；绕开它把刀路走完才算数' },
    { at: 5, name: '双锋', short: '双刀路挑呼吸的', hard: true, desc: '同时亮两道刀路，只有靶心在呼吸的那道是真招，划错断势' },
  ],
  // 洞微勘禁诀是黄阶入门功法，阶段新法只给「看得更清」的便利，不往经典扫雷里加新规则。
  tanlei: [
    { at: 3, name: '勘位', short: '开局标 3 处', desc: '精纯起每局开局勘出 3 处禁位并标出' },
    { at: 5, name: '洞玄', short: '开局标 5 处', desc: '化境起每局开局勘出 5 处禁位' },
  ],
  // 九套经典玩法是黄阶里的入门功课，阶段新法只给「看得更清 / 手更稳」的便利，
  // 不往经典规则里塞新花样——看一眼就会玩，才配叫简单。
  linkpair: [
    // 原则第十一节：阶段新法要「加规则」而不是「减难度」，便利必须留明码代价。
    // 旧版两条都是「不再扣息」，等于把代价整段删掉；而「重排不扣息」锁在一件平均
    // 十局才发生一次的事上（实测 0.10 次/局），解锁了也看不见。
    // 现在：照纹从 2 息降到 1 息（仍要付），大圆满把「照见一对」变成「一次照见两对」——
    // 多给的是「一次看两处」，不是「不花钱」。
    { at: 3, name: '照纹', short: '提示少扣 1 息', desc: '精纯起「照纹」少扣 1 息（仍要付）：卡局时不必再为这两息犹豫' },
    { at: 5, name: '双照', short: '一次照见两对', desc: '化境起「照纹」一次照见两对（四枚），仍是 1 息：省一次来回找，路径还得自己连' },
  ],
  stackstone: [
    { at: 3, name: '稳基', short: '落石放慢一拍', desc: '精纯起落石间隔放宽一拍，留出转石的时间' },
    { at: 5, name: '层叠', short: '化层多一成', desc: '化境起每化一层的得分再高一成' },
  ],
  // 十二原则第十一节：阶段新法要「加规则」而不是「减难度」，便利必须留明码代价。
  // 所以「照畦不扣息 / 重排不扣息」改成「各少扣 1 息」——仍然要付，只是练到后面更划算；
  // 连锁加成也改成「连锁三层起才额外加成」，得先打出连锁才拿得到，不是白送。
  harvest: [
    { at: 3, name: '照畦', short: '提示少扣 1 息', desc: '精纯起「照畦」少扣 1 息（仍要付），卡局时不必再为这两息犹豫' },
    { at: 5, name: '连收', short: '三层起加成', desc: '化境起连锁第 3 层起额外加成、重排少扣 1 息：奖励打出长连锁，不是白送分' },
  ],
  // 九宫填数同样是黄阶入门：阶段新法只给「看得更清」，不往数独里塞新规则。
  // 密勘只标「这里是唯一空位」，连校只标「同一个数在哪」——两条都不说该填几。
  shudu: [
    { at: 3, name: '密勘', short: '唯一空位描一圈', desc: '精纯起某行 / 列 / 宫只剩一个空位时，那一格描一圈：省一次全盘扫视，填几仍要自己想' },
    { at: 5, name: '唯余', short: '唯一候选描金', desc: '化境起选中空格时，同行列宫排除后只剩一个数，那个键描金：省一次心算，填不填仍由你' },
  ],
  // 推石入阵是机关类的操作功课：阶段新法只给「看得更清」，不往推箱里加规则。
  // 死位说的是「推到这里就再也推不出来」，与「该往哪推」是两件事——后者仍是玩家的事。
  tuisuo: [
    { at: 3, name: '死位', short: '死格压暗纹', desc: '精纯起，石箱推到那里就再也推不出来的格子压一道斜纹：省一次「推过去才发现卡死」，该往哪推仍要自己看' },
    { at: 5, name: '临渊', short: '一推就进死位先描红', desc: '化境起，石箱离死位只差一推时，那个死格描红：暗纹说「这格不能进」，描红说的是「再推一格就完了」' },
  ],
  // 成对翻牌是心法里的入门功课：阶段新法只给「记性上的便利」，不改配对规则。
  // 留影只是把照见的那一对多留一会儿；记印只记「自己刚看过的那一象」——两条都没替玩家翻过一张牌。
  seal: [
    { at: 3, name: '留影', short: '照见到点下一处才散', desc: '精纯起入定照见的这一对留到点下一处才收：省一次「看一眼就得赶紧背下来」，照见次数照样扣' },
    { at: 5, name: '记印', short: '翻错过的牌背留痕', desc: '化境起翻错的两处合上后，牌背留一道极淡的卦象——记的是你自己刚看过的那一象，不是替你看牌' },
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
  LINK_LEVELS: LINK_LEVELS,
  LINK_BUDGET: LINK_BUDGET,
  WEAVE_NAMES: WEAVE_NAMES,
  weaveNameOf: weaveNameOf,
  linkPerPairAt: linkPerPairAt,
  linkDurationAt: linkDurationAt,
  // 本关对数（= 时辰的分母）：盘上挖了空位就不再是 cols*rows/2。
  // 界面上每一句「每对几息」都必须走这两个之一，各算一套就会在换盘那关报出假回弹。
  linkPairsAt: linkPairsAt,
  linkPairsOf: linkPairsOf,
  linkThemeNameOf: linkThemeNameOf,
  tipFor: tipFor,
  TEMPO_FLOOR: TEMPO_FLOOR,
  TEMPO_SCORES: TEMPO_SCORES,
  tempoScoreOf: tempoScoreOf,
  tempoAt: tempoAt,
  tempoBpm: tempoBpm,
  LEVEL_STRUCT_KEYS: LEVEL_STRUCT_KEYS,
  stageSpec: stageSpec,
  TIME_LEVELS: TIME_LEVELS,
  MINES_HEARTS: MINES_HEARTS,
  CLICK_LEVELS: CLICK_LEVELS,
  MINES_LEVELS: MINES_LEVELS,
  BLOCK_LEVELS: BLOCK_LEVELS,
  MERGE_START_TILES: MERGE_START_TILES,
  PUSHBOX_CAP_FACTORS: PUSHBOX_CAP_FACTORS,
  FAMILIES: FAMILIES,
  TIERS: TIERS,
  STAGES: STAGES,
  STAGE_TUNE: STAGE_TUNE,
  STAGE_RULES: STAGE_RULES,
  getMethod: getMethod,
  familyOf: familyOf,
  tierOf: tierOf,
  tierIndexOf: tierIndexOf,
  stageOfKey: stageOfKey,
  stageIndexOfKey: stageIndexOfKey,
  clampStageIndex: clampStageIndex,
  stageIndexLike: stageIndexLike,
  clearedOf: clearedOf,
  curLevelOf: curLevelOf,
  stageIndexOfCleared: stageIndexOfCleared,
  stageNameOfCleared: stageNameOfCleared,
  levelFactor: levelFactor,
  profByLevel: profByLevel,
  retreatText: retreatText,
  factorText: factorText,
  buildParams: buildParams,
  buildParamsAt: buildParamsAt,
  levelDelta: levelDelta,
  pseudoDiff: pseudoDiff,
  stageDetail: stageDetail,
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
  SCHULTE_FADE: SCHULTE_FADE,
  PUSHBOX_LEVELS: PUSHBOX_LEVELS,
  BIGGEST_LEVELS: BIGGEST_LEVELS,
  hintLabelOf: hintLabelOf,
  stageRulesOf: stageRulesOf,
};
