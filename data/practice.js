'use strict';

// 参悟方式 = 一门功法 + 一套专属玩法 + 该门独有的规则花样(twist) + 表现主题(theme)。
// 13 门功法对应 13 套互不复用内核的小游戏；同是剑法、同是阵法，也不会点进去是同一个盘面。
// game 取值见 minigames/index.js：
//   click / hunt / memory / bridge / tempo / sword / lights / wuxing / mines / seal / link / blocks / match。
// forge 是刀法（weapon: 'dao'），剑法·断岳诀仍标 sword，但 hunt 引擎暂不读兵器轴。
// 兵器是功法属性，不是某个玩法的私有参数。charge 仅用于境界突破，不挂功法。
//
// 命名分工：「参悟方式」写这一门功课具体在做什么（斩桩 / 采露 / 观窍），
// 「玩法名」写盘面上的动作（顺光扫斩 / 循纹递推）。两者不可重名，也不可与功法本身相斥——
// 刀法不练数格子，丹道不练渡河，符箓不练探雷。
// id 是稳定键（存档、纪录都按它索引），改文案时不要动 id。
// base 是熟练度收益基数，按各玩法的通关难度分别配平。
//
// 一个维度只管一件事：
//   类型 → 玩什么（游戏族，见 FAMILIES）
//   兵器 → 怎么动（刀法走 click；剑 profile 预留，先不做剑法）
//   品阶 → 收益倍率与属性加成（见 TIERS，天地玄黄）
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
    desc: '点一格翻转它与上下左右四格，让九盏阵灯同时亮起；破阵有一拍金光与提示，不计时辰。',
    tip: '触死门复位并罚 3 秒',
    base: 42,
    params: { size: 3, steps: 2, duration: 36 },
  },
  {
    id: 'wuxing', name: '排布阵灯', game: 'wuxing', theme: 'wuxing', twist: 'wuxing',
    desc: '五盏阵灯围成一环，相生之位次第轮转。连得越长，留给你的一息越短。',
    tip: '相生一断少 1 息，得从木重新起链',
    base: 48,
    params: { duration: 20, chainGoal: 10, windowMs: 2600 },
  },
  {
    id: 'tanlei', name: '持符探禁', game: 'mines', theme: 'tanlei', twist: 'tanlei',
    desc: '照影符照出石格下的禁制。看数字推位置、布镇符连开，把安全石格一处处翻明。',
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
    tip: '换不出三连少 2 息',
    base: 34,
    params: { duration: 60, cols: 6, rows: 6, kinds: 5, flashMs: 760 },
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
};

// 提示按钮各门叫法不同：跟着玩法名走，别在页面 JS 里散着写三元。
// 三秀同收的「照畦」必须和局内 HUD、名词速查同名叫法，不许一处写「提示」一处写「照畦」。
const HINT_LABELS = {
  match: '照畦',
  lights: '阵眼感应',
  seal: '符箓照纹',
};

function hintLabelOf(gameId) {
  return HINT_LABELS[gameId] || '提示';
}

// 游戏族：同类功法共用一套手感内核，族内按品阶递进出变体。
// 只有新增「族」或新增变体才需要写代码，加功法只填数据。
const FAMILIES = {
  刀法: { core: '顺光成路', note: '顺着箭头把刀扫到靶心，招长而折，容许多带两桩', kind: 'skill' },
  剑法: { core: '辨光取真', note: '先不做剑法，眼下只余剑法·断岳诀一门，在数道剑光里截真招', kind: 'skill' },
  阵法: { core: '阵灯推演', note: '同族都在推阵灯，换的是推演方向与步数目标', kind: 'skill' },
  心法: { core: '记忆与节律', note: '三门主修各考一样：节拍、记性、配对', kind: 'main' },
  丹道: { core: '循纹递推', note: '看纹路递推，只有一门', kind: 'skill' },
  符箓: { core: '数格辨禁', note: '看数字推禁制，只有一门', kind: 'skill' },
  身法: { core: '步法连环', note: '照卷轴踏位，只有一门', kind: 'skill' },
  御灵: { core: '灵纹连线', note: '牵两枚同纹灵石，找一条不超过两折的通路', kind: 'skill' },
  土术: { core: '落石垒基', note: '挪石转石垒满一层，是唯一持续下落的盘面', kind: 'skill' },
  灵植: { core: '三秀同收', note: '互换相邻两株凑三连，采收后新苗落下还能连锁', kind: 'skill' },
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

// ---------------------------------------------------------------- 品阶：管收益
// 天地玄黄只决定三件事：熟练度收益倍率、属性加成系数、可修境界上限。
// 高品阶又快又强，门槛靠获取方式与境界限制来制衡。
// needRealm 是学习门槛（1 炼气 / 2 筑基 / 3 金丹 / 4 元婴），maxRealm 是收益不衰减的上限。

const TIERS = [
  { key: 'huang', name: '黄', label: '黄阶', stars: 1, reward: 1.00, attr: 1.00, needRealm: 1, maxRealm: 2, color: '#8a8f83', desc: '最常见的外门功课，便宜、够用，前期靠它起步。' },
  { key: 'xuan', name: '玄', label: '玄阶', stars: 2, reward: 1.50, attr: 1.30, needRealm: 2, maxRealm: 3, color: '#3d8c74', desc: '藏经阁里换得到的中阶功法，收益高出一截。' },
  { key: 'di', name: '地', label: '地阶', stars: 3, reward: 2.20, attr: 1.70, needRealm: 3, maxRealm: 4, color: '#b8893b', desc: '秘境与切磋才得的高阶功法，属性加成明显。' },
  { key: 'tian', name: '天', label: '天阶', stars: 4, reward: 3.20, attr: 2.20, needRealm: 4, maxRealm: 9, color: '#b4453c', desc: '压箱底的绝学，收益最高，也最难得到。' },
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
  { key: 'normal', name: '普通', need: 400, mult: 1.30, pace: 1.00, windowPace: 1.21, goal: 1.00, gear: 'normal', depth: 1, desc: '标准节奏与目标，小成之后才开。' },
  { key: 'hard', name: '困难', need: 1000, mult: 1.70, pace: 0.88, windowPace: 1.00, goal: 1.12, gear: 'hard', depth: 2, desc: '节奏收紧、目标抬高，失误的余地更小。' },
  { key: 'expert', name: '极难', need: 2500, mult: 2.10, pace: 0.78, windowPace: 0.83, goal: 1.22, gear: 'hard', depth: 3, desc: '几乎没有容错，一乱就掉档。' },
  { key: 'desperate', name: '绝境', need: 6000, mult: 2.60, pace: 0.70, windowPace: 0.64, goal: 1.32, gear: 'hard', depth: 4, desc: '给练到极处的人：最快节奏、最高目标、最高倍率。' },
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

// 给选择器用的五档列表，含解锁状态与所需熟练度。
function difficultyList(prof, current) {
  const idx = diffIndexOf(prof);
  const cur = current || DIFFICULTIES[idx].key;
  return DIFFICULTIES.map(function (d, i) {
    return {
      key: d.key,
      name: d.name,
      multText: '×' + d.mult.toFixed(1),
      mult: d.mult,
      need: d.need,
      desc: d.desc,
      unlocked: i <= idx,
      current: d.key === cur,
      lockedText: i <= idx ? '' : '需 ' + d.need + ' 熟练度',
    };
  });
}

// 三秀同收的评级线：基数 + 每档增量。玩法层（match.js 的 sLimit）与准备页
// 都从这一份数取，不许一边算 620 + depth×150、另一边照着再抄一遍。
const MATCH_S = { base: 620, step: 150 };

function sLineOf(method, diffKey) {
  if (!method || method.game !== 'match') return 0;
  return MATCH_S.base + difficultyOf(diffKey).depth * MATCH_S.step;
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
  scramble: '打乱步数', mines: '禁制数', pairs: '符对数', decoys: '影子数',
  startLen: '起始字数', baseLen: '每步长度', steps: '最少步数',
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
  // depth 是「第几档」（0–4），不做任何缩放，直接透传。
  // gear 只有 normal / hard 两值，玩法拿它分不出困难与绝境，容易一档一个样。
  out.depth = d.depth;
  // 评级线只在三秀同收这一门用得上，由同一份常量注入 params，玩法层不再自己写死。
  if (method && method.game === 'match') {
    out.sBase = MATCH_S.base;
    out.sStep = MATCH_S.step;
  }
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
  return String(Math.round(value));
}

// 给参悟准备页看的难度说明：与最简单档对比，列出这一档实际收紧了哪几处。
function diffDetail(method, diffKey) {
  const d = difficultyOf(diffKey);
  const base = buildParams(method, 'easy');
  const now = buildParams(method, diffKey);
  const changes = [];
  const ordered = PACE_KEYS.concat(WINDOW_KEYS, GOAL_KEYS, ['steps', SPEED_KEY]).filter(function (k) {
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
  const brief = changes.length
    ? changes.map(function (c) { return c.text; }).join(' · ')
    : '入门基准：节奏最缓、目标最宽，先把这一门的手感练稳。';
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
// 照影 / 照纹 / 稳基那类纯加成没有理由关，多一个开关只是多一处看不懂。
const STAGE_RULES = {
  recite: [
    { at: 3, name: '逆诵', short: '倒着点', hard: true, desc: '第 3 轮起，奇轮要从未字往前点回' },
    { at: 4, name: '叠印', short: '同一格连点两下', hard: true, desc: '第 5 轮起，口诀里会出现重复的格子' },
  ],
  arrayEye: [
    { at: 3, name: '死门', short: '✕ 格点不得', hard: true, desc: '盘上多一格暗红 ✕ 死门，点到整盘复位并罚 3 秒' },
    { at: 4, name: '双门', short: '死门两处', hard: true, desc: '死门增至两格；想专心推演可在准备页关掉' },
  ],
  forge: [
    { at: 3, name: '收势', short: '到靶心停一拍', hard: true, desc: '扫到靶心要停一拍再抬手；抢着抬算收势未成，只给半分并断刀势' },
    { at: 4, name: '禁桩', short: '绕开红叉', hard: true, desc: '盘上多出红叉禁桩，划到即断刀势；绕开它把刀路走完才算数' },
    { at: 5, name: '双锋', short: '双刀路挑呼吸的', hard: true, desc: '同时亮两道刀路，只有靶心在呼吸的那道是真招，划错断势' },
  ],
  // 照影符是黄阶入门功法，阶段新法只给「看得更清」的便利，不往经典扫雷里加新规则。
  tanlei: [
    { at: 3, name: '照影', short: '开局标 3 处', desc: '大成起每局开局照见 3 处禁制并标出' },
    { at: 5, name: '圆照', short: '开局标 5 处', desc: '大圆满起每局开局照见 5 处禁制' },
  ],
  // 三套经典玩法是黄阶里的入门功课，阶段新法只给「看得更清 / 手更稳」的便利，
  // 不往经典规则里塞新花样——看一眼就会玩，才配叫简单。
  linkpair: [
    { at: 3, name: '照纹', short: '提示不扣息', desc: '大成起「照纹」提示不再扣息' },
    { at: 5, name: '自移', short: '死局重排不扣息', desc: '大圆满起死局重排不再扣息' },
  ],
  stackstone: [
    { at: 3, name: '稳基', short: '落石放慢一拍', desc: '大成起落石间隔放宽一拍，留出转石的时间' },
    { at: 5, name: '层叠', short: '化层多一成', desc: '大圆满起每化一层的得分再高一成' },
  ],
  harvest: [
    { at: 3, name: '照畦', short: '提示不扣息', desc: '大成起「照畦」提示不再扣息，卡局时不必再省这两息' },
    { at: 5, name: '连收', short: '连锁加成提高', desc: '大圆满起连锁加成提高、死局重排不扣息，一局能滚出更长的连锁' },
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
  MATCH_S: MATCH_S,
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
  difficultyList: difficultyList,
  buildParams: buildParams,
  diffDetail: diffDetail,
  sLineOf: sLineOf,
  hintLabelOf: hintLabelOf,
  stageRulesOf: stageRulesOf,
};
