'use strict';

// 参悟方式 = 一门功法 + 一套专属玩法 + 该门独有的规则花样(twist) + 表现主题(theme)。
// 10 门功法对应 10 套互不复用内核的小游戏；同是剑法、同是阵法，也不会点进去是同一个盘面。
// game 取值见 minigames/index.js：click / hunt / memory / bridge / tempo / sword / lights / wuxing / mines / seal。
// charge 仅用于境界突破，不挂功法。
// base 是熟练度收益基数，按各玩法的通关难度分别配平。

const PRACTICE_METHODS = [
  {
    id: 'forge', name: '锻造敲击', game: 'click', theme: 'forge', twist: 'forge',
    desc: '炉火正旺，火星落处便是该下锤的地方。连着敲不空手，炉子会越烧越旺。',
    tip: '3×3 炉眼里追着唯一亮起的火星点。连击到 5 记炉火升温、灵光游走更快；点空会断掉连击与火候。',
    base: 32,
    params: { duration: 15, interval: 760, grid: 9, cols: 3 },
  },
  {
    id: 'snatch', name: '夺宝抢手速', game: 'hunt', theme: 'snatch', twist: 'snatch',
    desc: '宝光只现一瞬，同门还会留下影子晃你的眼。认准金色那一道，慢半步就被顺走了。',
    tip: '4×3 盘面每轮同时亮三道宝光，只点金色真宝。点中影子会倒扣一件、少一息；连夺 4 记后宝光更快。',
    base: 36,
    params: { duration: 16, interval: 1000, grid: 12, cols: 4, decoys: 2 },
  },
  {
    id: 'recite', name: '背功法口诀', game: 'memory', theme: 'recite', twist: 'recite',
    desc: '口诀次第闪过，错一字则气机紊乱。这一门不给你看序号，全凭记住次序。',
    tip: '看清闪过的格子，依次点回去。闪烁时不再标序号，一轮内格子不重复；记岔一次即散功。',
    base: 38,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 560, gapMs: 260 },
  },
  {
    id: 'stones', name: '踏石渡河', game: 'bridge', theme: 'stones', twist: 'stones',
    desc: '石板各刻一道纹，该踩哪块不看运气看递推。水流一转，位置就全变了。',
    tip: '竖向河道逐层往对岸渡：这一层该踩的纹路是上一层加一、过三回到一。只点当前层；踩错扣一盏心神。',
    base: 36,
    params: { rows: 5, cols: 3, shuffleMs: 3200, timeLimit: 45 },
  },
  {
    id: 'absorb', name: '吸纳灵气', game: 'tempo', theme: 'absorb', twist: 'absorb',
    desc: '一呼一吸皆有节律，气机收到最匀处才纳得进去。慢些，反而更难走偏。',
    tip: '光环收进朱圈时点下。这一门判定窗更宽、收得更慢，适合稳住连拍，把每一息都纳匀。',
    base: 30,
    params: { beats: 8, speed: 0.026, window: 0.09 },
  },
  {
    id: 'combo', name: '连招输入', game: 'sword', theme: 'combo', twist: 'combo',
    desc: '卷轴上的剑招一气铺开，招与招之间容不得犹豫。四段下来，一段比一段密。',
    tip: '照卷轴上的招式依次点下方四个招式键。共四段、逐段变长；打错只断连势、这一招重出并少一息。',
    base: 40,
    params: { duration: 20, segments: 4, baseLen: 3, moves: ['劈', '刺', '撩', '格'] },
  },
  {
    id: 'arrayEye', name: '参悟阵眼', game: 'lights', theme: 'arrayEye', twist: 'arrayEye',
    desc: '点亮一处，四面随之翻转。要让整座阵法同时亮起，阵眼只在一处。',
    tip: '点一格会翻转它和上下左右。顶部标出最优步数，另有两次阵眼感应可用，可直接指出该点哪格。',
    base: 42,
    params: { size: 3, scramble: 5 },
  },
  {
    id: 'wuxing', name: '排布阵灯', game: 'wuxing', theme: 'wuxing', twist: 'wuxing',
    desc: '五盏阵灯围成一环，相生之位次第轮转。连得越长，留给你的一息越短。',
    tip: '中央亮出一行，按「木→火→土→金→水→木」点它的相生之位。连生越长判定窗越窄，断链要少两息。',
    base: 48,
    params: { duration: 20, chainGoal: 10, windowMs: 2600 },
  },
  {
    id: 'tanlei', name: '秘境探雷', game: 'mines', theme: 'tanlei', twist: 'tanlei',
    desc: '禁制藏在石格之下，翻遍所有安全格才算探明秘境。误触一次还稳得住心神。',
    tip: '点开格子，长按插旗。看四周数字推禁制位置；这一门有三盏心神，触雷只扣一盏并让禁制显形。',
    base: 50,
    params: { cols: 6, rows: 6, mines: 6 },
  },
  {
    id: 'seal', name: '破解封印', game: 'seal', theme: 'seal', twist: 'seal',
    desc: '十二张符牌扣在案上，纹样成对方能解开一层封印。手里还有符箓能照出一对。',
    tip: '翻开两张符牌，纹样相同才解得一对，不同就盖回，记住位置。用「符箓照纹」可亮出一对，每局两次。',
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
  sword: '剑招连段',
  lights: '阵灯推演',
  wuxing: '五行相生',
  mines: '辨纹探禁',
  seal: '符纹配对',
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

// ---------------------------------------------------------------- 功法品阶与难度阶梯
// 品阶挂在 data/skills.js 的每门功法上，参悟页据此自动套用难度，不再只靠玩家手选「常课/苦修」。
// pace 越小节奏越紧、goal 越大目标越高；reward 是熟练度加成，难度与收益同步递增。
// 只缩放纯数值字段，绝不改 grid / cols / rows / size —— 盘面列数受限于 wxss 的 grid--c3/4/6。

const RANKS = [
  { rank: 1, key: 'basic', name: '基础', stars: 1, pace: 1.18, goal: 0.85, reward: 1.00, desc: '节奏从容、目标从宽，先把手感练稳。' },
  { rank: 2, key: 'advance', name: '进阶', stars: 2, pace: 1.00, goal: 1.00, reward: 1.18, desc: '标准节奏与目标，开始要求连贯不出错。' },
  { rank: 3, key: 'superior', name: '上乘', stars: 3, pace: 0.86, goal: 1.15, reward: 1.40, desc: '节奏收紧、目标抬高，失误的余地更小。' },
  { rank: 4, key: 'peerless', name: '绝学', stars: 4, pace: 0.72, goal: 1.30, reward: 1.70, desc: '最快节奏与最高目标，一息都松不得。' },
];

function rankOf(rank) {
  const n = Math.floor(Number(rank) || 1);
  return RANKS[Math.max(1, Math.min(RANKS.length, n)) - 1];
}

// 时间 / 判定窗类：pace 越小越难。window 是 0~1 的小数，保留三位。
const PACE_KEYS = ['interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'window'];
// 数量 / 目标类：goal 越大越难。均为整数。
const GOAL_KEYS = ['chainGoal', 'maxRound', 'segments', 'beats', 'scramble', 'mines', 'pairs', 'decoys', 'startLen', 'baseLen'];
// speed 是光环每 tick 的收缩量，方向与时间类相反。
const SPEED_KEY = 'speed';

const FIELD_LABELS = {
  interval: '灵光间隔', flashMs: '闪烁时长', gapMs: '闪烁间隔', windowMs: '相生之窗',
  shuffleMs: '水流变阵', flipMs: '翻牌停留', window: '判定窗', speed: '气机收敛',
  chainGoal: '连生目标', maxRound: '口诀轮数', segments: '剑招段数', beats: '息数',
  scramble: '打乱步数', mines: '禁制数', pairs: '符对数', decoys: '影子数',
  startLen: '起始字数', baseLen: '每招长度',
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

function buildParams(method, rank) {
  const r = rankOf(rank);
  const src = (method && method.params) || {};
  const out = {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i += 1) out[keys[i]] = src[keys[i]];
  for (let i = 0; i < PACE_KEYS.length; i += 1) {
    const k = PACE_KEYS[i];
    if (typeof out[k] === 'number') out[k] = Math.round(out[k] * r.pace * 1000) / 1000;
  }
  for (let i = 0; i < GOAL_KEYS.length; i += 1) {
    const k = GOAL_KEYS[i];
    if (typeof out[k] === 'number') out[k] = Math.max(1, Math.min(capFor(k, out), Math.round(out[k] * r.goal)));
  }
  if (typeof out[SPEED_KEY] === 'number') out[SPEED_KEY] = Math.round(out[SPEED_KEY] / r.pace * 10000) / 10000;
  return out;
}

function fmtField(key, value) {
  const ms = key === 'interval' || key === 'flashMs' || key === 'gapMs' || key === 'windowMs' || key === 'shuffleMs' || key === 'flipMs';
  return value + (ms ? 'ms' : '');
}

// 给参悟准备页看的难度说明：与第一阶对比，列出本门实际收紧了哪几处。
function difficultyOf(method, rank) {
  const r = rankOf(rank);
  const base = buildParams(method, 1);
  const now = buildParams(method, rank);
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
  let starsText = '';
  for (let i = 0; i < r.stars; i += 1) starsText += '★';
  for (let i = r.stars; i < RANKS.length; i += 1) starsText += '☆';
  const brief = changes.length
    ? changes.map(function (c) { return c.text; }).join(' · ')
    : '入门基准：节奏最缓、目标最宽，先把这一门的手感练稳。';
  return {
    rank: r.rank,
    name: r.name,
    key: r.key,
    stars: r.stars,
    starsText: starsText,
    reward: r.reward,
    rewardText: '熟练度 ×' + r.reward.toFixed(2),
    desc: r.desc,
    brief: brief,
    changes: changes,
  };
}

module.exports = {
  PRACTICE_METHODS: PRACTICE_METHODS,
  METHOD_MAP: METHOD_MAP,
  GAME_LABELS: GAME_LABELS,
  RANKS: RANKS,
  getMethod: getMethod,
  rankOf: rankOf,
  buildParams: buildParams,
  difficultyOf: difficultyOf,
};
