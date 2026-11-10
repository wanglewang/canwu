'use strict';

// 参悟方式 = 网文包装 + 底层小游戏编号 + 难度参数
// 底层只有 4 种玩法，换包装不增加开发量。技能绑定这里的 id。
// game 取值：click / memory / lights / mines / charge

const PRACTICE_METHODS = [
  {
    id: 'forge', name: '锻造敲击', game: 'click',
    desc: '炉火正旺，火星落处便是该下锤的地方。跟着亮起的炉眼一记记敲下去。',
    tip: '点中亮起的格子，点错不扣分。',
    base: 32,
    params: { duration: 15, interval: 760, grid: 9, cols: 3 },
  },
  {
    id: 'absorb', name: '吸纳灵气', game: 'click',
    desc: '天地灵气散落四方，眼疾手快才揽得住。',
    tip: '点中亮起的格子收入丹田。',
    base: 30,
    params: { duration: 15, interval: 820, grid: 9, cols: 3 },
  },
  {
    id: 'snatch', name: '夺宝抢手速', game: 'click',
    desc: '宝光只现一瞬，慢半步就被同门顺走了。',
    tip: '节奏更快，命中越多评级越高。',
    base: 36,
    params: { duration: 14, interval: 620, grid: 9, cols: 3 },
  },
  {
    id: 'recite', name: '背功法口诀', game: 'memory',
    desc: '口诀次第闪过，错一字则气机紊乱。记住顺序，再复述一遍。',
    tip: '看清闪烁顺序，依次点回去。',
    base: 38,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 560, gapMs: 260 },
  },
  {
    id: 'combo', name: '连招输入', game: 'memory',
    desc: '剑招起落有次序，一招不差才叫连招。',
    tip: '起手更长，别急着点。',
    base: 40,
    params: { grid: 9, cols: 3, startLen: 3, maxRound: 7, flashMs: 540, gapMs: 250 },
  },
  {
    id: 'stones', name: '踏石渡河', game: 'memory',
    desc: '水面下只有几块石板是实的，记住它们亮起的顺序。',
    tip: '踏错一次便落水，稳一点。',
    base: 36,
    params: { grid: 9, cols: 3, startLen: 2, maxRound: 7, flashMs: 520, gapMs: 240 },
  },
  {
    id: 'arrayEye', name: '参悟阵眼', game: 'lights',
    desc: '点亮一处，四面随之翻转。要让整座阵法同时亮起。',
    tip: '点一格会翻转它和上下左右。可撤销一步。',
    base: 42,
    params: { size: 3, scramble: 5 },
  },
  {
    id: 'wuxing', name: '排布阵灯', game: 'lights',
    desc: '五行相生相克，一灯动则四灯应。',
    tip: '盘面更大，步数越省评级越高。',
    base: 48,
    params: { size: 4, scramble: 7 },
  },
  {
    id: 'tanlei', name: '秘境探雷', game: 'mines',
    desc: '禁制藏在石格之下，翻遍所有安全格才算探明秘境。',
    tip: '点开格子，长按可插旗标记。数字表示周围雷数。',
    base: 50,
    params: { cols: 6, rows: 6, mines: 6 },
  },
  {
    id: 'seal', name: '破解封印', game: 'mines',
    desc: '封印下暗藏雷纹，逐格辨明，错一步前功尽弃。',
    tip: '雷更多，慢一点想清楚。',
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
