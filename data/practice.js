'use strict';

// 参悟方式 = 一门功法 + 一套专属玩法 + 该门独有的规则花样(twist) + 表现主题(theme)。
// 19 门功法对应 19 套互不复用内核的小游戏；同是剑法、同是阵法，也不会点进去是同一个盘面。
// game 取值见 minigames/index.js：
//   click / hunt / memory / bridge / tempo / sword / lights / wuxing / mines / seal / link / blocks / match
//   / sudoku / merge / schulte / klotski / pushbox / biggest。
// forge 是刀法（weapon: 'dao'），剑法·断岳诀仍标 sword，但 hunt 引擎暂不读兵器轴。
// 兵器是功法属性，不是某个玩法的私有参数。charge 仅用于境界突破，不挂功法。
//
// 命名分工：「参悟方式」写这一门功课具体在做什么（斩桩 / 采露 / 观窍），
// 「玩法名」写盘面上的动作（顺光扫斩 / 循纹递推）。两者不可重名，也不可与功法本身相斥——
// 刀法不练数格子，丹道不练渡河，心法不练牵线——类别与盘面上的动作必须同源。
// 反例就发生在这一版之前：「符箓·照影符」练的是数格辨禁，可符是纸上画出来的东西，
// 与格盘推理毫无关系；已按「以游戏为准」改为「阵法·勘禁诀」，归入阵法黄阶。
// 同理，「丹道·凝露方」练的是一条竖向河道采露，与炼丹无关，已按玩法改为「水术·凝露诀」；
// 丹道这一门暂时空缺，留给以后真正炼丹的功课。
// id 是稳定键（存档、纪录都按它索引），改文案时不要动 id。
// base 是灵气基数（/4 后即 8–14），按各玩法的通关难度分别配平；熟练度走 world.PROF_GRADE 定额，不用 base。
//
// 一个维度只管一件事：
//   类型 → 玩什么（游戏族，见 FAMILIES）
//   兵器 → 怎么动（刀法走 click；剑 profile 预留，先不做剑法）
//   品阶 → 战力加成与灵气灵石倍率（见 TIERS，天地玄黄；不加速熟练度）
//   熟练度 → 可选难度档（见 DIFFICULTIES）
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
    id: 'absorb', name: '吸纳灵气', game: 'tempo', theme: 'absorb', twist: 'absorb',
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
    params: { duration: 70, cols: 6, rows: 8, dropMs: 620 },
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
    tip: '推不回来：推错方向只能重来',
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

// ---------------------------------------------------------------- 品阶：管战力与资源，不碰熟练度
// 熟练度是「这一门练得多熟」，只由本局难度、评级、境界衰减与触类旁通决定；
// 让高级功法练得更快，等于把低阶功法从成长线上直接淘汰，也和「难度跟人走」自相矛盾。
// 天地玄黄因此只决定三件事：灵气灵石倍率（resource）、属性加成系数（attr）、可修境界上限。
// 高品阶更强、产出更厚，门槛靠获取方式与境界限制来制衡，但不加速熟练度。
// needRealm 是学习门槛（1 炼气 / 2 筑基 / 3 金丹 / 4 元婴），maxRealm 是收益不衰减的上限。

const TIERS = [
  { key: 'huang', name: '黄', label: '黄阶', stars: 1, resource: 1.00, attr: 1.00, needRealm: 1, maxRealm: 2, color: '#8a8f83', desc: '最常见的外门功课，便宜、够用，前期靠它起步。' },
  { key: 'xuan', name: '玄', label: '玄阶', stars: 2, resource: 1.50, attr: 1.30, needRealm: 2, maxRealm: 3, color: '#3d8c74', desc: '藏经阁里换得到的中阶功法，灵气灵石更厚。' },
  { key: 'di', name: '地', label: '地阶', stars: 3, resource: 2.20, attr: 1.70, needRealm: 3, maxRealm: 4, color: '#b8893b', desc: '多从切磋首胜里得的高阶功法，属性加成明显。' },
  { key: 'tian', name: '天', label: '天阶', stars: 4, resource: 3.20, attr: 2.20, needRealm: 4, maxRealm: 9, color: '#b4453c', desc: '压箱底的绝学，战力与产出最高，也最难得到。' },
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
// 不随功法品阶变化，只看玩家在这门功法上的熟练度。档位越高倍率越高，
// 同时 pace 收紧、goal 抬高 —— 想拿高倍率必须真打得过。

const DIFFICULTIES = [
  { key: 'easy', name: '简单', need: 0, mult: 1.00, pace: 1.18, windowPace: 1.50, goal: 0.85, gear: 'normal', depth: 0, desc: '节奏最缓、目标最宽，先把这一门的手感练稳。' },
  { key: 'normal', name: '普通', need: 300, mult: 1.30, pace: 1.00, windowPace: 1.21, goal: 1.00, gear: 'normal', depth: 1, desc: '标准节奏与目标，入门之后才开。' },
  { key: 'hard', name: '困难', need: 1500, mult: 1.70, pace: 0.88, windowPace: 1.00, goal: 1.12, gear: 'hard', depth: 2, desc: '节奏收紧、目标抬高，失误的余地更小。' },
  { key: 'expert', name: '极难', need: 6000, mult: 2.10, pace: 0.78, windowPace: 0.83, goal: 1.22, gear: 'hard', depth: 3, desc: '几乎没有容错，一乱就掉档。' },
  { key: 'desperate', name: '绝境', need: 24000, mult: 2.60, pace: 0.70, windowPace: 0.64, goal: 1.32, gear: 'hard', depth: 4, desc: '给练到极处的人：最快节奏、最高目标、最高倍率。' },
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

// 低于「本门最高已解锁档」时，每低一档就把熟练度与资源再打一次对折。
//
// 为什么要有这一条：难度档是事前承诺，不是面板上的装饰。解锁了普通档却一直刷简单档，
// 等于既拿难度倍率又躲开难度本身——模拟里「只刷简单」曾经反超「逐档升」。
// 只把连 S 停掉不够：正常收益那一路仍在按全额走。
//
// 按落差累进：解锁普通后打简单 ×0.5；再解锁困难，简单 ×0.25、普通 ×0.5；
// 绝境都开了还回头刷简单就只剩 ×0.0625。「差几档折几次半」一句话讲完，
// 不需要记第二套规则。熟练度不到 300 时简单档就是最高档，本项不生效，新手不受罚。
const DIFF_BELOW_CAP = 0.5;

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

// 这一档比本门最高已解锁档低几档：0 = 就是最高档，1 = 低一档，以此类推。
function diffGapOf(prof, diffKey) {
  return Math.max(0, diffIndexOf(prof) - diffKeyIndex(diffKey));
}

// 实得系数 = 0.5^档差。熟练度、资源倍率、连 S 判定全从这一个函数取，
// 玩家只需记一句「只有最高已解锁档才算全额；每退一档再折半」。
function lowDiffFactor(prof, diffKey) {
  return Math.pow(DIFF_BELOW_CAP, diffGapOf(prof, diffKey));
}

// 0.0625 也要原样显示，toFixed(2) 会把它写成 0.06 骗人。
function factorText(f) {
  return '×' + String(Math.round(f * 10000) / 10000);
}

function belowCapOf(prof, diffKey) {
  return diffGapOf(prof, diffKey) > 0;
}

// 实际生效的难度倍率：每低一档再折半。结算与准备页都从这里取，别各算一遍。
function effectiveMultOf(prof, diffKey) {
  return difficultyOf(diffKey).mult * lowDiffFactor(prof, diffKey);
}

// 准备页那一行折减提示：说清低了几档、折成多少，只在真的折减时出现。
function belowCapText(prof, diffKey) {
  const gap = diffGapOf(prof, diffKey);
  if (!gap) return '';
  const cap = DIFFICULTIES[diffIndexOf(prof)];
  return '比已解锁的「' + cap.name + '」低 ' + gap + ' 档：每低一档再折半，熟练度与资源都只剩 '
    + factorText(lowDiffFactor(prof, diffKey)) + '，S 也不计连晋。'
    + '想快些练，回到「' + cap.name + '」打。';
}

// 给选择器用的五档列表，含解锁状态与所需熟练度。
function difficultyList(prof, current) {
  const idx = diffIndexOf(prof);
  const cur = current || DIFFICULTIES[idx].key;
  return DIFFICULTIES.map(function (d, i) {
    return {
      key: d.key,
      name: d.name,
      multText: '×' + d.mult.toFixed(2),
      mult: d.mult,
      // 选中低档时，胶囊上直接给实得倍率，别让玩家以为还是 ×1.30。
      realMultText: '×' + (d.mult * Math.pow(DIFF_BELOW_CAP, Math.max(0, idx - i))).toFixed(2),
      below: i < idx,
      need: d.need,
      desc: d.desc,
      unlocked: i <= idx,
      current: d.key === cur,
      lockedText: i <= idx ? '' : '需 ' + d.need + ' 熟练度',
    };
  });
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
const MINES_HEARTS = [3, 3, 3, 2, 2];
const MERGE_START_TILES = [2, 2, 3, 3, 4];
const PUSHBOX_CAP_FACTORS = [2.2, 2.0, 1.9, 1.75, 1.6];

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
// 所以这一门比的是「省」，不是「快」——和静心诀（记序列）、三秀诀（消消乐）彻底分开。
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
const KLOTSKI_LEVELS = [
  { minOpt: 2, maxOpt: 4 },
  { minOpt: 3, maxOpt: 6 },
  { minOpt: 4, maxOpt: 8 },
  { minOpt: 5, maxOpt: 10 },
  { minOpt: 6, maxOpt: 12 },
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
const PUSHBOX_LEVELS = [0, 1, 2, 3, 4];
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
const PACE_KEYS = ['interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'dropMs', 'window', 'msPerNote'];
// 判定窗口类：只影响「亮着的那一下有多久来得及」，收紧得比 pace 陡 ——
// 窗口每短一成，容错掉的不是一成。多个玩法共用同一个字段名也互不影响。
const WINDOW_KEYS = ['life'];
// 数量 / 目标类：goal 越大越难。均为整数。
const GOAL_KEYS = ['chainGoal', 'maxRound', 'segments', 'beats', 'scramble', 'mines', 'pairs', 'decoys', 'startLen', 'baseLen'];
// speed 是光环每 tick 的收缩量，方向与时间类相反。
const SPEED_KEY = 'speed';

const FIELD_LABELS = {
  interval: '灵光间隔', life: '刀光停留', flashMs: '亮起时长', gapMs: '闪烁间隔', windowMs: '相生之窗', msPerNote: '每字限时',
  shuffleMs: '水流变阵', flipMs: '翻牌停留', dropMs: '落石间隔', window: '判定窗', speed: '气机收敛',
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

function buildParams(method, diffKey) {
  const d = difficultyOf(diffKey);
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
    const lv = matchLevelOf(diffKey);
    out.kinds = lv.kinds;
    out.duration = lv.duration;
    out.missCost = lv.missCost;
    out.shuffleCost = lv.shuffleCost;
    out.hintCost = lv.hintCost;
    out.sLine = lv.sLine;
  }
  // 阵灯推演按「已走步数 / 最优步数」评级，盘面规格与步数预算由这一份表按档注入。
  if (method && method.game === 'lights') {
    const lv = lightsLevelOf(diffKey);
    out.size = lv.size;
    out.minSteps = lv.min;
    out.capSteps = lv.cap;
  }
  // 九宫填数：规格、挖洞数与三条时间线都按档注入，玩法层不再自己写死 4×4。
  if (method && method.game === 'sudoku') {
    const lv = sudokuLevelOf(diffKey);
    out.size = lv.size;
    out.holes = lv.holes;
    out.timeLimit = lv.timeLimit;
    out.tS = lv.tS;
    out.tA = lv.tA;
    out.tB = lv.tB;
  }
  // 滑块让路：只注入「本盘最优步数」的上下限，盘面固定 4×4。
  if (method && method.game === 'klotski') {
    const lv = klotskiLevelOf(diffKey);
    out.minOpt = lv.minOpt;
    out.maxOpt = lv.maxOpt;
  }
  // 档位表住在模块里的四门：只注入本档最关键的那个数，给准备页的难度说明用。
  if (method && method.game === 'merge') out.target = MERGE_TARGETS[d.depth];
  if (method && method.game === 'schulte') out.size = SCHULTE_SIZES[d.depth];
  if (method && method.game === 'pushbox') out.level = PUSHBOX_LEVELS[d.depth];
  if (method && method.game === 'biggest') {
    out.count = BIGGEST_LEVELS[d.depth].count;
    out.rounds = BIGGEST_LEVELS[d.depth].rounds;
  }
  // 四门原本只有一个可见参数在变：把第二个数按档注入，玩法层逐个读走（见上方表注释）。
  if (method && method.game === 'mines') out.hearts = MINES_HEARTS[d.depth];
  if (method && method.game === 'merge') out.startTiles = MERGE_START_TILES[d.depth];
  if (method && method.game === 'schulte') out.penaltySec = SCHULTE_PENALTIES[d.depth];
  if (method && method.game === 'pushbox') out.capFactor = PUSHBOX_CAP_FACTORS[d.depth];
  // steps 是「这盘最少几步」这类按档递增的量：params 里写的是简单档的值，每档 +1。
  if (typeof out.steps === 'number') out.steps += d.depth;
  if (typeof out[SPEED_KEY] === 'number') out[SPEED_KEY] = Math.round(out[SPEED_KEY] / d.pace * 10000) / 10000;
  return out;
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
  return String(Math.round(value));
}

// 给参悟准备页看的难度说明：与最简单档对比，列出这一档实际收紧了哪几处。
function diffDetail(method, diffKey) {
  const d = difficultyOf(diffKey);
  const base = buildParams(method, 'easy');
  const now = buildParams(method, diffKey);
  const changes = [];
  // 时辰与四门新注入的档位参数也要进「本档紧在哪」：不然准备页写了「入门基准」，
  // 盘上的倒计时 / 心神 / 起手块却真的变了，说明和局内对不上。
  const ordered = PACE_KEYS.concat(WINDOW_KEYS, GOAL_KEYS,
    ['duration', 'timeLimit', 'hearts', 'startTiles', 'penaltySec', 'capFactor', 'steps', SPEED_KEY]).filter(function (k) {
    return HIDDEN_FIELDS.indexOf(k) < 0;
  });
  for (let i = 0; i < ordered.length && changes.length < 3; i += 1) {
    const k = ordered[i];
    if (typeof now[k] !== 'number' || typeof base[k] !== 'number') continue;
    if (now[k] === base[k]) continue;
    changes.push({
      key: k,
      label: FIELD_LABELS[k] || k,
      text: FIELD_LABELS[k] + ' ' + fmtField(k, base[k]) + ' → ' + fmtField(k, now[k]),
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
    brief = '4×4 小盘 · 最优 ' + lv.minOpt + '～' + lv.maxOpt + ' 步';
  } else if (method && method.game === 'merge') {
    brief = '本档要合出 ' + now.target + ' 一块 · 起手 ' + now.startTiles + ' 块';
  } else if (method && method.game === 'schulte') {
    brief = now.size + '×' + now.size + ' 盘 · ' + now.size * now.size + ' 个数 · 点错罚 ' + SCHULTE_PENALTIES[d.depth] + ' 秒';
  } else if (method && method.game === 'pushbox') {
    brief = '第 ' + (now.level + 1) + ' 张石图 · 推数预算 ×' + now.capFactor.toFixed(2) + ' · 越少越好';
  } else if (method && method.game === 'biggest') {
    brief = '本档 ' + now.rounds + ' 轮 · 每轮盘上 ' + now.count + ' 个数';
  } else {
    brief = changes.length
      ? changes.map(function (c) { return c.text; }).join(' · ')
      : '入门基准：节奏最缓、目标最宽，先把这一门的手感练稳。';
  }
  return {
    key: d.key,
    name: d.name,
    mult: d.mult,
    multText: '×' + d.mult.toFixed(2),
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
  // 勘禁诀是黄阶入门功法，阶段新法只给「看得更清」的便利，不往经典扫雷里加新规则。
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
};

function stageRulesOf(methodId) {
  return STAGE_RULES[methodId] || [];
}

module.exports = {
  PRACTICE_METHODS: PRACTICE_METHODS,
  METHOD_MAP: METHOD_MAP,
  GAME_LABELS: GAME_LABELS,
  HINT_LABELS: HINT_LABELS,
  MATCH_LEVELS: MATCH_LEVELS,
  matchLevelOf: matchLevelOf,
  tipFor: tipFor,
  TIME_LEVELS: TIME_LEVELS,
  MINES_HEARTS: MINES_HEARTS,
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
  belowCapOf: belowCapOf,
  diffGapOf: diffGapOf,
  lowDiffFactor: lowDiffFactor,
  factorText: factorText,
  effectiveMultOf: effectiveMultOf,
  belowCapText: belowCapText,
  DIFF_BELOW_CAP: DIFF_BELOW_CAP,
  difficultyList: difficultyList,
  buildParams: buildParams,
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
