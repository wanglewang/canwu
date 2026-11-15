'use strict';

// 999 关：每一门功法各自从第 1 关打到第 999 关，章节与难度档一一对应。
//
// 为什么不再让玩家「选简单 / 普通 / 困难」：
//   五档是给设计看的刻度，不是给玩家走的路。玩家开口问的永远是「下一关是什么」，
//   而不是「今天想打第几档」。档位一旦落到界面上，就变成「反复刷最低那档」的最优解
//   （低档折减就是为了堵这条路而存在的补丁）。关卡制把这张表换成正向的进度：
//   第 1 关一定最容易，第 999 关一定最难，中间 998 步一格一格走上去。
//
// 结构：五章 × 200 关（末章 199 关，合计 999）。每章对应原来的一个难度档，
// 章内再切成 40 段，**每段 5 关**，同一段内所有参数逐位相同——
// 「五关之内难度没有变化，每五关一个小变化」就是这一条：
//   段号 stage = floor((章内第几关 - 1) / 5)，段内参数由 stage 决定，不关卡号尾数。
//
// 章内递进怎么来：把「本章参数」与「下一章参数」按段号线性混合。
// 连续量（时辰、落石间隔、翻牌停留、推数预算…）每段都动一点，
// 离散量（盘面几列、几处阵位、几盏心神）在段边界上按 1/8 的步长取整跳动。
// 第 5 章没有「下一章」，向最后一档再压 6%，所以第 999 关是真正的最难一关。

const LEVEL_MAX = 999;
const STAGE_SPAN = 5;      // 每 5 关一个段
const STAGES_PER_CHAPTER = 40;

const CHAPTERS = [
  { key: 'easy', name: '简单', label: '第一章', from: 1, to: 200, note: '规矩全露在外面，先把手感打热' },
  { key: 'normal', name: '普通', label: '第二章', from: 201, to: 400, note: '节奏归正，失误开始记账' },
  { key: 'hard', name: '困难', label: '第三章', from: 401, to: 600, note: '盘面收紧，容错变薄' },
  { key: 'expert', name: '极难', label: '第四章', from: 601, to: 800, note: '一步乱，整盘塌' },
  { key: 'desperate', name: '绝境', label: '第五章', from: 801, to: 999, note: '留给练到极处的人' },
];

function clampLevel(level) {
  const n = Math.round(Number(level) || 1);
  return Math.max(1, Math.min(LEVEL_MAX, n));
}

// 这一关落在第几章（0–4）。
function chapterOf(level) {
  const lv = clampLevel(level);
  for (let i = CHAPTERS.length - 1; i >= 0; i -= 1) {
    if (lv >= CHAPTERS[i].from) return i;
  }
  return 0;
}

function chapterRange(index) {
  return CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, index))];
}

function chapterKeyOf(level) {
  return CHAPTERS[chapterOf(level)].key;
}

// 章内第几段（0–39）。段号决定这一关的全部参数，所以同段五关是同一局难度。
function stageOf(level) {
  const ch = chapterOf(level);
  const c = CHAPTERS[ch];
  const inCh = clampLevel(level) - c.from;      // 0 起
  // 一章正好 200 关 = 40 段；末章 199 关的最后一关仍落在第 40 段。
  return Math.max(0, Math.min(STAGES_PER_CHAPTER - 1, Math.floor(inCh / STAGE_SPAN)));
}

// 章内第几关（1 起），给界面写「本章第 12 / 200 关」用。
function levelInChapter(level) {
  const c = CHAPTERS[chapterOf(level)];
  return clampLevel(level) - c.from + 1;
}

function chapterSize(index) {
  const c = chapterRange(index);
  return c.to - c.from + 1;
}

// 段内推进度：0 < f ≤ 1，第 1 段是最轻的 1/40，第 40 段逼近下一章。
// 用它当混合权重，所以「同段五关参数完全一致」与「章末几乎等于下一章」同时成立。
function progressOf(level) {
  return (stageOf(level) + 1) / STAGES_PER_CHAPTER;
}

// 某章第几段的起始关号：界面「跳到本章最前 / 下一段」都用它。
function levelOf(chapterIndex, stage) {
  const c = chapterRange(chapterIndex);
  const span = c.to - c.from + 1;
  const s = Math.max(0, Math.min(STAGES_PER_CHAPTER - 1, stage));
  return Math.min(c.to, c.from + Math.round(s * span / STAGES_PER_CHAPTER));
}

// 玩家能打的最高关 = 已解锁最高章的末关。章节由熟练度解锁（沿用原五档门槛），
// 章内不再设关卡锁：一关一关往前磨 200 局不叫「关卡」，叫罚站。
function maxLevelOf(chapterIndex) {
  return chapterRange(chapterIndex).to;
}

// ---------------------------------------------------------------- 混合键
// 只混合「连续、且玩家看得懂」的量。盘面规格（几列、几行、几处阵位）绝不在里面：
// 6 列混 7 列会算出 6.4 列，取整之后又退回 6 列，参数看着动了、盘面没动，
// 那是最坏的一种「假变化」。
const MIX_KEYS = [
  'duration', 'timeLimit', 'sLine',
  'interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'dropMs', 'msPerNote', 'life',
  'missCost', 'shuffleCost', 'hintCost', 'penaltySec', 'capFactor', 'capSteps', 'minSteps', 'minOpt', 'maxOpt',
];
const MS_KEYS = ['interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'dropMs', 'msPerNote', 'life'];

function roundBy(key, v) {
  if (key === 'window') return Math.round(v * 1000) / 1000;
  if (key === 'capFactor') return Math.round(v * 100) / 100;
  // 罚时留半秒精度：整秒取整会让一门没有连续量的玩法五关都不动。
  if (key === 'penaltySec') return Math.round(v * 2) / 2;
  if (MS_KEYS.indexOf(key) >= 0 || key === 'duration' || key === 'timeLimit'
    || key === 'sLine' || key === 'missCost' || key === 'shuffleCost' || key === 'hintCost'
    || key === 'capSteps' || key === 'minSteps' || key === 'minOpt' || key === 'maxOpt') {
    return Math.max(key === 'missCost' || key === 'shuffleCost' || key === 'hintCost' ? 0 : 1, Math.round(v));
  }
  return v;
}

// 两套参数按权重混：只碰 MIX_KEYS 里两边都是数字的键，其余一律取本章值。
function mixParams(a, b, f) {
  const out = {};
  const keys = Object.keys(a);
  for (let i = 0; i < keys.length; i += 1) out[keys[i]] = a[keys[i]];
  const w = Math.max(0, Math.min(1, f));
  for (let i = 0; i < MIX_KEYS.length; i += 1) {
    const k = MIX_KEYS[i];
    if (typeof a[k] !== 'number' || typeof b[k] !== 'number') continue;
    if (a[k] === b[k]) { out[k] = a[k]; continue; }
    out[k] = roundBy(k, a[k] + (b[k] - a[k]) * w);
  }
  return out;
}

// 少数几门的参数表全是离散量（没有时辰、没有间隔），章内收紧乘不到任何东西，
// 就给一门一个专属的连续旋钮。它们都真的被玩法层读走，不是给界面看的装饰：
//   merge   起手给 4 的比例：越往后越少白送 4，凑同数就得多走几步；
//   mines   S 线系数：盘面不变，S 线按段收紧，考的是推理不是手速；
//   klotski 步数预算系数：滑块让路本来只有「最优几步」两档，靠预算才有连续量。
function tweakParams(method, out, level) {
  if (!method || !out) return out;
  const lv = clampLevel(level);
  const t = (chapterOf(lv) + progressOf(lv)) / CHAPTERS.length;
  if (method.game === 'merge') out.fourRate = Math.round((0.45 - 0.25 * t) * 1000) / 1000;
  if (method.game === 'mines') out.lineScale = Math.round((1 - 0.30 * t) * 1000) / 1000;
  // 滑块让路的档位表已经有 capFactor（2.80 → 1.90），这里只按章内进度再收一次，
  // 不是覆盖。以前这一行把档位值整个盖掉，结果五档的预算系数都从 2.6 起算——
  // 「绝境比简单紧」这句话在参数里其实不成立。
  //
  // 也不能按全书进度收：buildParamsAt 已经对 capFactor 按时间键收过一次（1 − 0.30f），
  // 两刀叠上去，第 200 关（简单档末）的预算只剩 ×1.87，比第 201 关（绝境档首）的
  // ×2.37 还紧——低档被自己的章节进度吃掉了。这里先把前一刀除掉，再按一章 18% 重收。
  if (method.game === 'klotski') {
    const f = progressOf(lv);
    const pre = 1 - 0.30 * f;
    // 封底 2.05：C 线是「超过最优两倍才脱身」，预算一旦压到两倍以下，这一档的评价
    // 就从「C 或更好」变成「B 或困住」——那不是变难，是把一档评语删掉。
    out.capFactor = Math.max(2.05, Math.round(((out.capFactor || 2.8) / pre) * (1 - 0.18 * f) * 100) / 100);
  }
  // 落石垒基：章内两件事——起始级每 13 段抬一级（一章 40 段抬两级），
  // 每级层数每 10 段减一层。两个数玩法层都读：前者决定重力，后者决定 meter 与提速坡度。
  if (method.game === 'blocks') {
    const st = stageOf(lv);
    out.startLevel = Math.min(12, out.startLevel + Math.floor(st / 13));
    out.linesPerLevel = Math.max(4, out.linesPerLevel - Math.floor(st / 10));
  }
  // 辨术·一眼摘魁诀：这一门只有「数多长、几批」两个离散量，给一条明写的时辰——
  // 每一批认得快才来得及，慢下来就少认一批。玩法层本来就认 params.timeLimit。
  if (method.game === 'biggest') out.timeLimit = Math.round(88 - 34 * t);
  return out;
}

module.exports = {
  LEVEL_MAX: LEVEL_MAX,
  STAGE_SPAN: STAGE_SPAN,
  STAGES_PER_CHAPTER: STAGES_PER_CHAPTER,
  CHAPTERS: CHAPTERS,
  MIX_KEYS: MIX_KEYS,
  clampLevel: clampLevel,
  chapterOf: chapterOf,
  chapterRange: chapterRange,
  chapterKeyOf: chapterKeyOf,
  chapterSize: chapterSize,
  stageOf: stageOf,
  levelInChapter: levelInChapter,
  progressOf: progressOf,
  levelOf: levelOf,
  maxLevelOf: maxLevelOf,
  mixParams: mixParams,
  tweakParams: tweakParams,
};
