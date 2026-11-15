'use strict';

// 200 关：每一门功法各自从第 1 关打到第 200 关，章节与难度档一一对应。
//
// 为什么从 999 关改成 200 关：999 关的真实分辨率本来就是 200。
// 旧版「每 5 关一段、一章 40 段」，同段五关参数逐位相同——玩家看到「第 437 关」，
// 实际是「第三章第 37 段第 2 关」，第 436 关与第 440 关完全一样。
// 对外标 999、对内只有 200 种盘面，这是虚标；而且一局 S 能跨四五关，关号一直在跳，
// 玩家反而没有「我到了」的实感。现在一段一关：200 关就是 200 种盘面。
//
// 关卡也不再由「打过多少关」累加，而由熟练度算出（levelFromProf）：
// 熟练度是这套系统里唯一只增的数，关卡是它的另一个刻度。
// 于是没有「跳关」这个动作，也没有「先把关号点高」的博弈——练到哪，就在哪。
//
// 结构：五章 × 40 关（合计 200）。每章对应原来的一个难度档。
// 章内 40 关对应原来的 40 段，一段一关。参数本该逐关不同——实测十二门做到了，
// 七门做不到（点灯破阵 31 / 踏云连环 36 / 一眼摘魁 37 / 扫目逐数 52 / 万石成岳 108 /
// 吐纳周天 123 / 让主出阵 166 级台阶），见 07-difficulty §7.1。
//
// 章内递进怎么来：以「本章基准参数」为底，把时间与预算按关内进度收紧最多三成
// （`data/practice.js` 的 `buildParamsAt`），再叠一门自己的连续旋钮（`tweakParams`）。
// 盘面规格（几列、几处阵位、几盏心神）章内一律不动——它挂在章节上，换章才换一副。
// 第 5 章没有「下一章」，再压 6%，所以第 200 关是真正的最难一关。
//
// 否决过的做法：把本章与下一章参数按关内进度混合（`mixParams`），想让连续量每关动一点。
// 实测离散量混完取整又退回原值——6 列混 7 列得 6.4 列、取整还是 6 列，参数看着动了、
// 盘面没动，正是最坏的一种「假变化」（`verify` 8b-5d 守的就是这一类）。代码已删。

// 熟练度 → 关卡的六个锚：与 world.TIERS 的 threshold 同源（0/300/1500/6000/24000/99999）。
// 放在这里而不是 require world.js，是因为 levels.js 要被测试与审计脚本直接 require，
// 保持零依赖；两者一致由 tests/rank.test.js 断言锁住。
const LEVEL_PROF_STEPS = [0, 300, 1500, 6000, 24000, 99999];

const LEVEL_MAX = 200;
const STAGE_SPAN = 1;      // 一段一关：关号就是段号
const STAGES_PER_CHAPTER = 40;

const CHAPTERS = [
  { key: 'easy', name: '简单', label: '第一章', from: 1, to: 40, note: '规矩全露在外面，先把手感打热' },
  { key: 'normal', name: '普通', label: '第二章', from: 41, to: 80, note: '节奏归正，失误开始记账' },
  { key: 'hard', name: '困难', label: '第三章', from: 81, to: 120, note: '盘面收紧，容错变薄' },
  { key: 'expert', name: '极难', label: '第四章', from: 121, to: 160, note: '一步乱，整盘塌' },
  { key: 'desperate', name: '绝境', label: '第五章', from: 161, to: 200, note: '留给练到极处的人' },
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

// 章内第几段（0–39）。一段一关，所以它同时就是「章内第几关 - 1」。
function stageOf(level) {
  const ch = chapterOf(level);
  const c = CHAPTERS[ch];
  const inCh = clampLevel(level) - c.from;      // 0 起
  return Math.max(0, Math.min(STAGES_PER_CHAPTER - 1, Math.floor(inCh / STAGE_SPAN)));
}

// 章内第几关（1 起），给界面写「本章第 12 / 40 关」用。
function levelInChapter(level) {
  const c = CHAPTERS[chapterOf(level)];
  return clampLevel(level) - c.from + 1;
}

function chapterSize(index) {
  const c = chapterRange(index);
  return c.to - c.from + 1;
}

// 章内推进度：0 < f ≤ 1，第 1 关是最轻的 1/40，第 40 关正好等于下一章。
// 用它当混合权重，所以「逐关参数都不同」与「章末等于下一章」同时成立。
function progressOf(level) {
  return (stageOf(level) + 1) / STAGES_PER_CHAPTER;
}

// 某章第几关：界面「跳到本章最前」用它。
function levelOf(chapterIndex, stage) {
  const c = chapterRange(chapterIndex);
  const span = c.to - c.from + 1;
  const s = Math.max(0, Math.min(STAGES_PER_CHAPTER - 1, stage));
  return Math.min(c.to, c.from + Math.round(s * span / STAGES_PER_CHAPTER));
}

// 熟练度 → 当前关。这是整套关卡制的唯一入口。
//
// 章内线性：第一章 0–300 熟练度铺满 1–40 关，第二章 300–1500 铺 41–80，
// 以此类推。所以「一局拿多少熟练度」直接换成「往前走了几关」：
// 第一章一局 S（34 点）约走 4 关，第五章一局 S（1307 点）约走 0.7 关。
// 前者快得看得见，后者慢到「这一关要磨」——两头都对。
//
// 关卡只由熟练度决定，而熟练度只增不减，所以关卡也只增不减。
// 「打不过就掉关」在这套结构里不存在：惩罚落在这一局（F = 本局作废），
// 不落在长期进度上。
function levelFromProf(prof) {
  const p = Math.max(0, Number(prof) || 0);
  for (let i = 0; i < CHAPTERS.length; i += 1) {
    const lo = LEVEL_PROF_STEPS[i];
    const hi = LEVEL_PROF_STEPS[i + 1];
    if (p >= hi) continue;
    const c = CHAPTERS[i];
    const span = c.to - c.from;               // 39：章内从首关走到末关的步数
    const f = hi > lo ? (p - lo) / (hi - lo) : 1;
    const step = Math.round(span * Math.max(0, Math.min(1, f)));
    return Math.min(c.to, c.from + step);
  }
  return LEVEL_MAX;
}

// 这一段位（章）的末关。关卡不再靠「解锁」开放，所以它只用于界面文案与测试。
function maxLevelOf(chapterIndex) {
  return chapterRange(chapterIndex).to;
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
  // 顺序点格：盘面与罚时都是整数、档内不变，时辰又不是参数（模块按 B 线现推），
  // 章内没有任何能收的数——不收的话一章 40 关一字不差，关卡制在这一门上就是假的。
  // 于是给它一根和勘禁诀同形的连续旋钮：整条评级线（S/A/B 与时辰）按关收紧，全书收 18%。
  //
  // 为什么不复用 buildParamsAt 那 30%：那一刀只能落在 params.timeLimit 上，可这一门的时辰
  // 是「B 线 + 8」现推的，收进 B 线里 C 档就没了。要么收成「参数收了、盘面没变」，
  // 要么收出一个不存在的 C 档——所以这里不动时辰键，只按比例缩三条线。
  // 18% 而不是 30%：S 线在绝境档已经压到「优秀」档位，再收三成就成「没人到得了」。
  if (method.game === 'schulte') out.lineScale = Math.round((1 - 0.18 * t) * 1000) / 1000;
  // 滑块让路的档位表已经有 capFactor（2.80 → 1.90），这里只按章内进度再收一次，
  // 不是覆盖。以前这一行把档位值整个盖掉，结果五档的预算系数都从 2.6 起算——
  // 「绝境比简单紧」这句话在参数里其实不成立。
  //
  // 也不能按全书进度收：buildParamsAt 已经对 capFactor 按时间键收过一次（1 − 0.30f），
  // 两刀叠上去，第 40 关（简单档末）的预算只剩 ×1.87，比第 41 关（绝境档首）的
  // ×2.37 还紧——低档位被自己的章节进度吃掉了。这里先把前一刀除掉，再按一章 18% 重收。
  if (method.game === 'klotski') {
    const f = progressOf(lv);
    const pre = 1 - 0.30 * f;
    // 封底 2.05：C 线是「超过最优两倍才脱身」，预算一旦压到两倍以下，这一档的评价
    // 就从「C 或更好」变成「B 或困住」——那不是变难，是把一档评语删掉。
    out.capFactor = Math.max(2.05, Math.round(((out.capFactor || 2.8) / pre) * (1 - 0.18 * f) * 100) / 100);
  }
  // 落石垒基：章内两件事——起始级每 20 关抬一级（一章 40 关抬两级），
  // 每级层数每 10 关减一层。两个数玩法层都读：前者决定重力，后者决定 meter 与提速坡度。
  if (method.game === 'blocks') {
    const st = stageOf(lv);
    out.startLevel = Math.min(12, out.startLevel + Math.floor(st / 20));
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
  LEVEL_PROF_STEPS: LEVEL_PROF_STEPS,
  CHAPTERS: CHAPTERS,
  clampLevel: clampLevel,
  chapterOf: chapterOf,
  chapterRange: chapterRange,
  chapterKeyOf: chapterKeyOf,
  chapterSize: chapterSize,
  stageOf: stageOf,
  levelInChapter: levelInChapter,
  progressOf: progressOf,
  levelOf: levelOf,
  levelFromProf: levelFromProf,
  maxLevelOf: maxLevelOf,
  tweakParams: tweakParams,
};
