'use strict';

// 参悟主题：每门功法一套配色、符号与文案。只影响表现层，不参与数值计算。
// practice 页把 accent / soft / ink / bg / frame 写成根容器的 CSS 变量，wxss 用 var() 取用。
// 13 门功法各自有独立的玩法内核，主题只是同一门功法的视觉外衣。

const THEMES = {
  forge: {
    key: 'forge', name: '刀光', accent: '#4a6b86', soft: '#dee8f1', ink: '#254253',
    // 顺光扫斩的刀路用 CSS 箭头指方向，盘面不放字形；glyph 只为保持主题字段齐备。
    // hit / miss / banner / praise 保留字段完整性，但 click 引擎的浮字统一由
    // data/weapons.js 按兵器给，避免主题与兵器浮字说出两套话。
    bg: '#e6edf3', frame: '#f8fbfd', glyph: '刀', motif: '刀',
    hit: '一刀斩中', miss: '劈空了', banner: '刀光乍起', praise: '刀随意走',
  },
  snatch: {
    key: 'snatch', name: '剑影', accent: '#39465c', soft: '#dfe4ec', ink: '#1d2632',
    bg: '#e7eaf0', frame: '#f8f9fc', glyph: '剑', motif: '截',
    hit: '截住真招', miss: '误截虚影', banner: '剑光乱眼', praise: '后发先至',
  },
  recite: {
    key: 'recite', name: '静心', accent: '#3d8c74', soft: '#dff0e7', ink: '#225a4a',
    bg: '#e4efe8', frame: '#f7fcf8', glyph: '诀', motif: '诵',
    hit: '口诀无误', miss: '记岔一字', banner: '心不浮，气自沉', praise: '倒背如流',
  },
  stones: {
    key: 'stones', name: '露石', accent: '#3b7a8c', soft: '#dcecf1', ink: '#22505f',
    bg: '#e2eff3', frame: '#f5fbfe', glyph: '露', motif: '采',
    hit: '露已入瓶', miss: '踏空落水', banner: '露纹初现', praise: '一滴不洒',
  },
  absorb: {
    key: 'absorb', name: '吐纳', accent: '#2f8c7b', soft: '#dbf0e9', ink: '#1d5a4e',
    bg: '#e2f0ea', frame: '#f5fcf8', glyph: '气', motif: '纳',
    hit: '气合周天', miss: '气机散了', banner: '一息绵长', praise: '吐纳自如',
  },
  combo: {
    key: 'combo', name: '步法', accent: '#b4453c', soft: '#f7ded9', ink: '#782b25',
    bg: '#f3e2dd', frame: '#fff4f1', glyph: '步', motif: '步',
    hit: '步位合拍', miss: '踏错了', banner: '踏云连环', praise: '一气呵成',
  },
  arrayEye: {
    key: 'arrayEye', name: '阵灯', accent: '#6f5b9e', soft: '#e9e3f5', ink: '#453771',
    bg: '#ece7f6', frame: '#faf7ff', glyph: '阵', motif: '眼',
    hit: '阵灯转明', miss: '推演偏了', banner: '阵眼已现', praise: '一眼破阵',
  },
  wuxing: {
    key: 'wuxing', name: '五灯', accent: '#9c7427', soft: '#f4e9cf', ink: '#66501c',
    bg: '#f1e8d4', frame: '#fffbee', glyph: '灯', motif: '行',
    hit: '五行相生', miss: '生克失序', banner: '五灯归位', praise: '阵法通明',
  },
  tanlei: {
    key: 'tanlei', name: '禁纹', accent: '#a2553f', soft: '#f4e2da', ink: '#6d3527',
    bg: '#efe1d8', frame: '#fff7f1', glyph: '禁', motif: '照',
    hit: '石格无事', miss: '触了禁制', banner: '照影起符', praise: '步步不惊',
  },
  seal: {
    key: 'seal', name: '卦象', accent: '#5d5b8a', soft: '#e5e4f0', ink: '#3a3860',
    bg: '#e9e8f3', frame: '#f8f7ff', glyph: '窍', motif: '观',
    hit: '气窍相合', miss: '观岔了', banner: '灵光一线', praise: '洞若观火',
  },
  linkpair: {
    key: 'linkpair', name: '契纹', accent: '#3b7f8c', soft: '#dceef0', ink: '#20515c',
    bg: '#e4f0f2', frame: '#f7fcfd', glyph: '契', motif: '引',
    hit: '灵契相合', miss: '纹不合', banner: '并蒂引', praise: '一纹不隔',
  },
  stackstone: {
    key: 'stackstone', name: '垒石', accent: '#8a6a3c', soft: '#efe4cf', ink: '#5b4526',
    bg: '#f0e8d8', frame: '#fdf8ec', glyph: '石', motif: '垒',
    hit: '化去一层', miss: '堆到了顶', banner: '垒岳起基', praise: '层层皆化',
  },
  harvest: {
    key: 'harvest', name: '灵畦', accent: '#4e8b5b', soft: '#dfeedf', ink: '#2c5b38',
    bg: '#e6f1e5', frame: '#f7fcf6', glyph: '苗', motif: '秀',
    hit: '三秀同收', miss: '换不出三连', banner: '灵畦初开', praise: '一畦三秀',
  },
  breakthrough: {
    key: 'breakthrough', name: '冲关', accent: '#b4453c', soft: '#f7e4d5', ink: '#7a3129',
    bg: '#f0e1d2', frame: '#fff7ec', glyph: '关', motif: '冲',
    hit: '气机正盛', miss: '气机偏离', banner: '一线之间', praise: '破关',
  },
};

const FALLBACK = {
  click: 'forge',
  hunt: 'snatch',
  memory: 'recite',
  bridge: 'stones',
  tempo: 'absorb',
  sword: 'combo',
  lights: 'arrayEye',
  wuxing: 'wuxing',
  mines: 'tanlei',
  seal: 'seal',
  link: 'linkpair',
  blocks: 'stackstone',
  match: 'harvest',
  charge: 'breakthrough',
};

// 每门功法「本门玄机」：这一套玩法自己的规则与花样，展示在开局准备页。
// 13 条彼此不同，且对应 13 套互不复用的玩法内核。
const TWIST_INFO = {
  forge: {
    name: '刀势渐盛',
    desc: '连击 5 / 10 / 20 记起给 ×1.5 / ×2 / ×3，档位越高门槛越高；一漏一空尽散。',
  },
  snatch: {
    name: '真招虚影',
    desc: '数道剑光只有一道真招，截错扣分。连截四记出手更快。',
  },
  recite: {
    name: '可抢记',
    desc: '按原序点回；长按可跳过剩下的闪烁，少看一字多一分。',
  },
  stones: {
    name: '逐层加纹',
    desc: '每层采对那道纹：比上一层加一，循环接续。采错扣心神。',
  },
  absorb: {
    name: '一息绵长',
    desc: '光环收进朱圈时点下判圆满。收得更缓，判定更宽。',
  },
  combo: {
    name: '一步不错',
    desc: '照卷轴上的步位，用四个键按序踏完。踏错重来。',
  },
  arrayEye: {
    name: '限时连解',
    desc: '解亮一盘立刻换下一盘，每盘最少要几步写在盘上。',
  },
  wuxing: {
    name: '相生接龙',
    desc: '按相生次序点下一盏灯。连得越长，留给你的时间越短。',
  },
  tanlei: {
    name: '三盏心神',
    desc: '看数字推禁制，翻遍所有安全格。误触扣一盏心神。',
  },
  seal: {
    name: '入定照见',
    desc: '翻开两处气窍配成一对。另有两道灵光替你照见一对。',
  },
  linkpair: {
    name: '两折可连',
    desc: '同纹两枚之间最多转两次弯，盘外一圈也能绕；收干净才算圆满。',
  },
  stackstone: {
    name: '满层即化',
    desc: '灵石按息下落，用四个方向键挪、转、速降；垒满一层化去一层，堆到顶就收功。',
  },
  harvest: {
    name: '落苗连锁',
    desc: '换相邻两株凑三连，收完上头落下来补新苗，再凑成一线就是连锁，分越滚越高。',
  },
};

function themeOf(methodId, gameId) {
  if (methodId && THEMES[methodId]) return THEMES[methodId];
  return THEMES[FALLBACK[gameId] || 'forge'];
}

function twistOf(twist) {
  return TWIST_INFO[twist] || { name: '常规功课', desc: '照着提示稳稳练完这一局。' };
}

module.exports = {
  THEMES: THEMES,
  FALLBACK: FALLBACK,
  TWIST_INFO: TWIST_INFO,
  themeOf: themeOf,
  twistOf: twistOf,
};
