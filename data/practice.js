'use strict';

// 参悟方式 = 一门功法 + 一套专属玩法 + 该门独有的规则花样(twist) + 表现主题(theme)。
// 10 门功法对应 10 套互不复用内核的小游戏；同是剑法、同是阵法，也不会点进去是同一个盘面。
// game 取值见 minigames/index.js：click / hunt / memory / bridge / tempo / sword / lights / wuxing / mines / seal。
// charge 仅用于境界突破，不挂功法。
// base 是熟练度收益基数，按各玩法的通关难度分别配平。
//
// 一个维度只管一件事：
//   类型 → 玩什么（游戏族，见 FAMILIES）
//   品阶 → 收益倍率与属性加成（见 TIERS，天地玄黄）
//   熟练度 → 可选难度档（见 DIFFICULTIES）
//   境界 → 可修上限与收益衰减（品阶的 maxRealm）

const PRACTICE_METHODS = [
  {
    id: 'forge', name: '锻造敲击', game: 'click', theme: 'forge', twist: 'forge',
    desc: '炉火正旺，火星落处便是该下锤的地方。连着敲不空手，炉子会越烧越旺。',
    tip: '火星亮起就点，连击满五记会更快',
    base: 32,
    params: { duration: 15, interval: 760, grid: 9, cols: 3 },
  },
  {
    id: 'snatch', name: '夺宝抢手速', game: 'hunt', theme: 'snatch', twist: 'snatch',
    desc: '宝光只现一瞬，同门还会留下影子晃你的眼。认准金色那一道，慢半步就被顺走了。',
    tip: '只点金色真宝，影子碰不得',
    base: 36,
    params: { duration: 16, interval: 1000, grid: 12, cols: 4, decoys: 2 },
  },
  {
    id: 'recite', name: '背功法口诀', game: 'memory', theme: 'recite', twist: 'recite',
    desc: '口诀次第闪过，错一字则气机紊乱。这一门不给你看序号，全凭记住次序。',
    tip: '按原序点回，记岔即散功',
    base: 38,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 560, gapMs: 260 },
  },
  {
    id: 'stones', name: '循纹渡河', game: 'bridge', theme: 'stones', twist: 'stones',
    desc: '石板各刻一道纹，该踩哪块不看运气看递推。水流一转，位置就全变了。',
    tip: '踩比上一层多一道的纹',
    base: 36,
    params: { rows: 5, cols: 3, shuffleMs: 3200, timeLimit: 45 },
  },
  {
    id: 'absorb', name: '吸纳灵气', game: 'tempo', theme: 'absorb', twist: 'absorb',
    desc: '一呼一吸皆有节律，气机收到最匀处才纳得进去。慢些，反而更难走偏。',
    tip: '光环收进朱圈时点下',
    base: 30,
    params: { beats: 8, speed: 0.026, window: 0.09 },
  },
  {
    id: 'combo', name: '步法连环', game: 'sword', theme: 'combo', twist: 'combo',
    desc: '落脚之处皆有次序，卷轴铺开一串步位。一步踏错，整套就散了。',
    tip: '照卷轴顺序，点对应步法键',
    base: 40,
    params: { duration: 20, segments: 4, baseLen: 3, moves: ['进', '退', '侧', '转'] },
  },
  {
    id: 'arrayEye', name: '参悟阵眼', game: 'lights', theme: 'arrayEye', twist: 'arrayEye',
    desc: '点亮一处，四面随之翻转。要让整座阵法同时亮起，阵眼只在一处。',
    tip: '点一格翻上下左右，全亮为成',
    base: 42,
    params: { size: 3, scramble: 5 },
  },
  {
    id: 'wuxing', name: '排布阵灯', game: 'wuxing', theme: 'wuxing', twist: 'wuxing',
    desc: '五盏阵灯围成一环，相生之位次第轮转。连得越长，留给你的一息越短。',
    tip: '按木火土金水相生点下一盏',
    base: 48,
    params: { duration: 20, chainGoal: 10, windowMs: 2600 },
  },
  {
    id: 'tanlei', name: '秘境探雷', game: 'mines', theme: 'tanlei', twist: 'tanlei',
    desc: '禁制藏在石格之下，翻遍所有安全格才算探明秘境。误触一次还稳得住心神。',
    tip: '看数字推禁制，长按插旗',
    base: 50,
    params: { cols: 6, rows: 6, mines: 6 },
  },
  {
    id: 'seal', name: '破解封印', game: 'seal', theme: 'seal', twist: 'seal',
    desc: '十二张符牌扣在案上，纹样成对方能解开一层封印。手里还有符箓能照出一对。',
    tip: '翻开两张，配成一对',
    base: 56,
    params: { pairs: 6, cols: 4, flipMs: 850, timeLimit: 70 },
  },
];

// 玩法中文名。与 minigames/ 各模块导出的 name 一一对应，测试会断言两者不漂移。
const GAME_LABELS = {
  click: '追光点击',
  hunt: '辨伪夺宝',
  memory: '记序复现',
  bridge: '循纹渡河',
  tempo: '节律判定',
  sword: '步法连环',
  lights: '阵灯推演',
  wuxing: '五行相生',
  mines: '辨纹探禁',
  seal: '符纹配对',
};

// 游戏族：同类功法共用一套手感内核，族内按品阶递进出变体。
// 只有新增「族」或新增变体才需要写代码，加功法只填数据。
const FAMILIES = {
  剑法: { core: '点格辨光', note: '同族都是看光点按，换的是判定与干扰', kind: 'skill' },
  阵法: { core: '阵灯推演', note: '同族都在推阵灯，换的是推演方向与步数目标', kind: 'skill' },
  心法: { core: '记忆与节律', note: '三门主修各考一样：节拍、记性、配对', kind: 'main' },
  丹道: { core: '循纹渡河', note: '看纹路递推，只有一门', kind: 'skill' },
  符箓: { core: '辨纹探禁', note: '看数字推禁制，只有一门', kind: 'skill' },
  身法: { core: '步法连环', note: '照卷轴踏位，只有一门', kind: 'skill' },
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
  { key: 'di', name: '地', label: '地阶', stars: 3, reward: 2.20, attr: 1.70, needRealm: 3, maxRealm: 4, color: '#b8893b', desc: '秘境与论道才得的高阶功法，属性加成明显。' },
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
  { key: 'easy', name: '简单', need: 0, mult: 1.00, pace: 1.18, goal: 0.85, gear: 'normal', desc: '节奏最缓、目标最宽，先把这一门的手感练稳。' },
  { key: 'normal', name: '普通', need: 400, mult: 1.30, pace: 1.00, goal: 1.00, gear: 'normal', desc: '标准节奏与目标，小成之后才开。' },
  { key: 'hard', name: '困难', need: 1000, mult: 1.70, pace: 0.88, goal: 1.12, gear: 'hard', desc: '节奏收紧、目标抬高，失误的余地更小。' },
  { key: 'expert', name: '极难', need: 2500, mult: 2.10, pace: 0.78, goal: 1.22, gear: 'hard', desc: '几乎没有容错，一乱就掉档。' },
  { key: 'desperate', name: '绝境', need: 6000, mult: 2.60, pace: 0.70, goal: 1.32, gear: 'hard', desc: '给练到极处的人：最快节奏、最高目标、最高倍率。' },
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
      lockedText: i <= idx ? '' : '熟练度 ' + d.need,
    };
  });
}

// ---------------------------------------------------------------- 参数缩放
// 时间 / 判定窗类：pace 越小越难。window 是 0~1 的小数，保留三位。
const PACE_KEYS = ['interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'window'];
// 数量 / 目标类：goal 越大越难。均为整数。
const GOAL_KEYS = ['chainGoal', 'maxRound', 'segments', 'beats', 'scramble', 'mines', 'pairs', 'decoys', 'startLen', 'baseLen'];
// speed 是光环每 tick 的收缩量，方向与时间类相反。
const SPEED_KEY = 'speed';

const FIELD_LABELS = {
  interval: '灵光间隔', flashMs: '闪烁时长', gapMs: '闪烁间隔', windowMs: '相生之窗',
  shuffleMs: '水流变阵', flipMs: '翻牌停留', window: '判定窗', speed: '气机收敛',
  chainGoal: '连生目标', maxRound: '口诀轮数', segments: '步法段数', beats: '息数',
  scramble: '打乱步数', mines: '禁制数', pairs: '符对数', decoys: '影子数',
  startLen: '起始字数', baseLen: '每步长度',
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
  for (let i = 0; i < GOAL_KEYS.length; i += 1) {
    const k = GOAL_KEYS[i];
    if (typeof out[k] === 'number') out[k] = Math.max(1, Math.min(capFor(k, out), Math.round(out[k] * d.goal)));
  }
  if (typeof out[SPEED_KEY] === 'number') out[SPEED_KEY] = Math.round(out[SPEED_KEY] / d.pace * 10000) / 10000;
  return out;
}

function fmtField(key, value) {
  const ms = key === 'interval' || key === 'flashMs' || key === 'gapMs' || key === 'windowMs' || key === 'shuffleMs' || key === 'flipMs';
  return value + (ms ? 'ms' : '');
}

// 给参悟准备页看的难度说明：与最简单档对比，列出这一档实际收紧了哪几处。
function diffDetail(method, diffKey) {
  const d = difficultyOf(diffKey);
  const base = buildParams(method, 'easy');
  const now = buildParams(method, diffKey);
  const changes = [];
  const ordered = PACE_KEYS.concat(GOAL_KEYS, [SPEED_KEY]);
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

module.exports = {
  PRACTICE_METHODS: PRACTICE_METHODS,
  METHOD_MAP: METHOD_MAP,
  GAME_LABELS: GAME_LABELS,
  FAMILIES: FAMILIES,
  TIERS: TIERS,
  DIFFICULTIES: DIFFICULTIES,
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
};
