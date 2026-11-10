'use strict';

// 参悟方式 = 包装 + 底层玩法 + 该功法独有的变数(twist) + 表现主题(theme)
// 10 门功法平均挂到 5 类玩法上，每类 2 门，且各有一个别的功法没有的机制。
// game 取值：click / memory / lights / mines / tempo（charge 仅用于境界突破）
// gradeScale 用于平衡「额外计分」类变数，避免同评级门槛被轻松刷过。

const PRACTICE_METHODS = [
  {
    id: 'forge', name: '锻造敲击', game: 'click', theme: 'forge', twist: 'forge',
    desc: '炉火正旺，火星落处便是该下锤的地方。连着敲不空手，炉子会越烧越旺。',
    tip: '点中亮起的炉眼。连击到 5 记炉火升温，节奏会更快；点空会断掉连击。',
    base: 32,
    params: { duration: 15, interval: 760, grid: 9, cols: 3 },
  },
  {
    id: 'snatch', name: '夺宝抢手速', game: 'click', theme: 'snatch', twist: 'snatch',
    desc: '宝光只现一瞬，慢半步就被同门顺走了。金色宝光比寻常灵光更值钱。',
    tip: '点中亮起的格子。金色宝光算两次命中，但圆满门槛也更高。',
    base: 36,
    params: { duration: 14, interval: 620, grid: 9, cols: 3, gradeScale: 1.35 },
  },
  {
    id: 'recite', name: '背功法口诀', game: 'memory', theme: 'recite', twist: 'recite',
    desc: '口诀次第闪过，错一字则气机紊乱。这一门不给你看序号，全凭记住次序。',
    tip: '看清闪过的格子，依次点回去。闪烁时不再标序号，得自己记住。',
    base: 38,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 560, gapMs: 260 },
  },
  {
    id: 'stones', name: '踏石渡河', game: 'memory', theme: 'stones', twist: 'stones',
    desc: '水面下只有几块石板是实的，记住它们亮起的顺序。踩空一次还扶得住。',
    tip: '踏过的石板会留下痕迹；这一门有两次踩空的机会。',
    base: 36,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 520, gapMs: 240 },
  },
  {
    id: 'absorb', name: '吸纳灵气', game: 'tempo', theme: 'absorb', twist: 'absorb',
    desc: '一呼一吸皆有节律，气机收到最匀处才纳得进去。慢些，反而更难走偏。',
    tip: '光环收进朱圈时点下。这一门判定窗更宽、收得更慢，适合稳住连拍。',
    base: 30,
    params: { beats: 8, speed: 0.026, window: 0.09 },
  },
  {
    id: 'combo', name: '连招输入', game: 'tempo', theme: 'combo', twist: 'combo',
    desc: '剑招起落只在瞬息，一拍慢了整套就散。招快，判定也窄。',
    tip: '光环收进朱圈时点下。这一门收得更快、判定更窄，连拍越久势越盛。',
    base: 40,
    params: { beats: 8, speed: 0.026, window: 0.09 },
  },
  {
    id: 'arrayEye', name: '参悟阵眼', game: 'lights', theme: 'arrayEye', twist: 'arrayEye',
    desc: '点亮一处，四面随之翻转。要让整座阵法同时亮起，阵眼只在一处。',
    tip: '点一格会翻转它和上下左右。顶部标出最优步数，另有两次阵眼感应可用。',
    base: 42,
    params: { size: 3, scramble: 5 },
  },
  {
    id: 'wuxing', name: '排布阵灯', game: 'lights', theme: 'wuxing', twist: 'wuxing',
    desc: '五行相生相克，一灯动则四灯应。盘面按五行分色，看色推生克。',
    tip: '点一格会翻转它和上下左右。格子按五行着色，步数越省评级越高。',
    base: 48,
    params: { size: 4, scramble: 7 },
  },
  {
    id: 'tanlei', name: '秘境探雷', game: 'mines', theme: 'tanlei', twist: 'tanlei',
    desc: '禁制藏在石格之下，翻遍所有安全格才算探明秘境。误触一次还稳得住心神。',
    tip: '点开格子，长按插旗。这一门有三盏心神，触雷只扣一盏并让禁制显形。',
    base: 50,
    params: { cols: 6, rows: 6, mines: 6 },
  },
  {
    id: 'seal', name: '破解封印', game: 'mines', theme: 'seal', twist: 'seal',
    desc: '封印下暗藏雷纹，逐格辨明。手里还有符箓，能替你照出一处雷纹。',
    tip: '点开格子，长按插旗。用「符箓照纹」可显形一颗雷，每局两次。',
    base: 56,
    params: { cols: 6, rows: 6, mines: 8 },
  },
];

const METHOD_MAP = {};
for (let i = 0; i < PRACTICE_METHODS.length; i += 1) {
  METHOD_MAP[PRACTICE_METHODS[i].id] = PRACTICE_METHODS[i];
}

function getMethod(id) {
  return METHOD_MAP[id] || PRACTICE_METHODS[0];
}

module.exports = {
  PRACTICE_METHODS: PRACTICE_METHODS,
  METHOD_MAP: METHOD_MAP,
  getMethod: getMethod,
};
