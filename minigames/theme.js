'use strict';

// 参悟主题：每门功法一套配色、符号与文案。只影响表现层，不参与数值计算。
// practice 页把 accent / soft / ink / bg / frame 写成根容器的 CSS 变量，wxss 用 var() 取用。
// 10 门功法各自有独立的玩法内核，主题只是同一门功法的视觉外衣。

const THEMES = {
  forge: {
    key: 'forge', name: '炉火', accent: '#c8672f', soft: '#f8e6d3', ink: '#7c3d16',
    bg: '#efe0cd', frame: '#fff8ee', glyph: '火', motif: '炉',
    hit: '一记落锤', miss: '敲空了', banner: '炉火旺盛', praise: '炉火纯青',
  },
  snatch: {
    key: 'snatch', name: '宝光', accent: '#a9791f', soft: '#f8ecc9', ink: '#745214',
    bg: '#f1e6c9', frame: '#fffbe9', glyph: '宝', motif: '夺',
    hit: '宝光入手', miss: '慢了半步', banner: '宝光乍现', praise: '眼疾手快',
  },
  recite: {
    key: 'recite', name: '口诀', accent: '#3d8c74', soft: '#dff0e7', ink: '#225a4a',
    bg: '#e4efe8', frame: '#f7fcf8', glyph: '诀', motif: '诵',
    hit: '口诀无误', miss: '记岔一字', banner: '心不浮，气自沉', praise: '倒背如流',
  },
  stones: {
    key: 'stones', name: '渡石', accent: '#3b7a8c', soft: '#dcecf1', ink: '#22505f',
    bg: '#e2eff3', frame: '#f5fbfe', glyph: '石', motif: '渡',
    hit: '踏稳了', miss: '踩空落水', banner: '石板留痕', praise: '步步踏实',
  },
  absorb: {
    key: 'absorb', name: '吐纳', accent: '#2f8c7b', soft: '#dbf0e9', ink: '#1d5a4e',
    bg: '#e2f0ea', frame: '#f5fcf8', glyph: '气', motif: '纳',
    hit: '气合周天', miss: '气机散了', banner: '一息绵长', praise: '吐纳自如',
  },
  combo: {
    key: 'combo', name: '剑招', accent: '#b4453c', soft: '#f7ded9', ink: '#782b25',
    bg: '#f3e2dd', frame: '#fff4f1', glyph: '剑', motif: '招',
    hit: '招式合拍', miss: '断了招', banner: '剑势连绵', praise: '一气呵成',
  },
  arrayEye: {
    key: 'arrayEye', name: '阵眼', accent: '#6f5b9e', soft: '#e9e3f5', ink: '#453771',
    bg: '#ece7f6', frame: '#faf7ff', glyph: '阵', motif: '眼',
    hit: '阵灯转明', miss: '推演偏了', banner: '阵眼已现', praise: '一眼破阵',
  },
  wuxing: {
    key: 'wuxing', name: '五行', accent: '#9c7427', soft: '#f4e9cf', ink: '#66501c',
    bg: '#f1e8d4', frame: '#fffbee', glyph: '灯', motif: '行',
    hit: '五行相生', miss: '生克失序', banner: '五灯归位', praise: '阵法通明',
  },
  tanlei: {
    key: 'tanlei', name: '探禁', accent: '#a2553f', soft: '#f4e2da', ink: '#6d3527',
    bg: '#efe1d8', frame: '#fff7f1', glyph: '禁', motif: '探',
    hit: '石格无事', miss: '触了禁制', banner: '禁制显形', praise: '步步不惊',
  },
  seal: {
    key: 'seal', name: '封印', accent: '#5d5b8a', soft: '#e5e4f0', ink: '#3a3860',
    bg: '#e9e8f3', frame: '#f8f7ff', glyph: '印', motif: '封',
    hit: '符纹渐明', miss: '雷纹炸开', banner: '封松动了', praise: '破印而出',
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
  charge: 'breakthrough',
};

// 每门功法「本门玄机」：这一套玩法自己的规则与花样，展示在开局准备页。
// 10 条彼此不同，且对应 10 套互不复用的玩法内核。
const TWIST_INFO = {
  forge: {
    name: '炉火升温 · 追光点击',
    desc: '3×3 炉眼追着唯一火星下锤。连击满 5 记炉火转旺、灵光游走更快；点空则连击与火候一并断掉。',
  },
  snatch: {
    name: '辨伪夺宝 · 多目标择真',
    desc: '4×3 盘面每轮同时亮起三道宝光，只有金色那道是真宝，其余是同门的影子。点错倒扣一件、少一息；连夺 4 记后宝光更快。',
  },
  recite: {
    name: '不示序号 · 记序复现',
    desc: '口诀依次闪过，闪烁时只显印记、不标先后，一轮内格子不重复；要按原次序点回去，记岔一次即散功。',
  },
  stones: {
    name: '循纹渡河 · 逐层递推',
    desc: '竖向河道每层三块石板各刻一道纹，该踩的纹路是上一层加一、周而复始。水流会打乱当前层；踩错扣一盏心神，留在原层。',
  },
  absorb: {
    name: '一息绵长 · 节律判定',
    desc: '光环向内收敛，收进朱圈的一瞬点下判「圆满」。这一门收得更慢、判定窗更宽，适合稳住连拍。',
  },
  combo: {
    name: '剑招连段 · 卷轴出招',
    desc: '卷轴铺开一串剑招，四个招式键要按序把整套打完。共四段、逐段变长；打错只断连势、这一招重出并少一息。',
  },
  arrayEye: {
    name: '阵眼明示 · 十字翻转',
    desc: '点一格翻转它和上下左右，让全阵同时亮起。开局标出最优步数，另有两次阵眼感应可直接指出该点哪格。',
  },
  wuxing: {
    name: '五行相生 · 灯环接龙',
    desc: '五盏阵灯围成一环，中央亮出一行，按「木→火→土→金→水→木」点它的相生之位。连生越长，留给你的一息越短。',
  },
  tanlei: {
    name: '三盏心神 · 辨纹探禁',
    desc: '看四周数字推禁制位置，翻遍所有安全石格；长按可插旗。误触只扣一盏心神并让那处显形，三盏耗尽才收功。',
  },
  seal: {
    name: '符纹配对 · 翻牌记忆',
    desc: '十二张符牌扣在案上，翻开两张、纹样相同才解得一对，不同就盖回。另有两次「符箓照纹」替你亮出一对。',
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
