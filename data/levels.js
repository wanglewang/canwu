'use strict';

// 每门功法一条 1000 关的长线，五段。段名就是「这门练到哪」：
//   未入门 1–10（10 关）→ 入门 11–50（40）→ 小成 51–200（150）
//   → 大成 201–500（300）→ 圆满 501–1000（500）→ 走通第 1000 关即大圆满
// 前密后疏：头一小时能连跨两段，后两段要磨。段界关（10/50/200/500/1000）是
// 「晋阶关」——走通它当场进下一段，所以段长 10 / 40 / 150 / 300 / 500，合计 1000。
//
// **不再有难度档。** 以前是「简单/普通/困难/极难/绝境」五档各 40 关，玩家挑档；
// 现在是一段一条线，难度跟着关号走（段内进度），玩家只有一个动作：往前走或回关。
// 段位由已走通的关数决定（stageIndexOfCleared）：属性加成与阶段新法按同一档取，
// 不再另算一条线，也不再用段位去换关号或开难度。
//
// 段内递进：以「本段基准参数」为底，把时间与预算按段内进度收紧最多三成
// （`data/practice.js` 的 `buildParamsAt`），再叠一门自己的连续旋钮（`tweakParams`）。
// 盘面规格（几列、几处阵位、几盏心神）挂在段上——一段一副主盘，换段才换一副。
//
// **已知欠账（不许装看不见）**：段长 10/40/150/300/500 意味着「每关都不同」只在前两段
// 成立。圆满段 500 关共用一副主盘、参数逐关只收 0.06%，玩家看不出相邻两关的差别。
// 这一段的密度要靠后续补「段内变体」（见 08-待拍板清单.md D11），现在先把骨架和
// 前两段的内容做实。
//
// 否决过的做法：把本段与下一段参数按关内进度混合（`mixParams`），想让连续量每关动一点。
// 实测离散量混完取整又退回原值——6 列混 7 列得 6.4 列、取整还是 6 列，参数看着动了、
// 盘面没动，正是最坏的一种「假变化」（`verify` 8b-5d 守的就是这一类）。代码已删。

// 熟练度 → 老 200 关关号的六个锚。**只剩迁移用途**：v7 及以前的存档只有 prof，
// 要靠它反推当时走到第几关，再折成 1000 关制。运行时没有任何代码按它算关。
// 放在这里而不是 require world.js，是因为 levels.js 要被测试与审计脚本直接 require，
// 保持零依赖。
const LEVEL_PROF_STEPS = [0, 300, 1500, 6000, 24000, 99999];

const LEVEL_MAX = 1000;

// 五段。from / to 是关号（1 起），闭区间；段界关属于当前段，走通它才进下一段。
const STAGES = [
  { key: 'novice', name: '未入门', label: '第一段', from: 1, to: 10, note: '一关一条规矩，先把手上认熟' },
  { key: 'entry', name: '入门', label: '第二段', from: 11, to: 50, note: '规矩齐了，开始讲节奏' },
  { key: 'minor', name: '小成', label: '第三段', from: 51, to: 200, note: '盘面收紧，容错变薄' },
  { key: 'major', name: '大成', label: '第四段', from: 201, to: 500, note: '一步乱，整盘塌' },
  { key: 'full', name: '圆满', label: '第五段', from: 501, to: 1000, note: '留给练到极处的人' },
];

// 走通第 1000 关之后的那个名字：它不是一个可玩的段，只是终点。
const FINAL_STAGE_NAME = '大圆满';

// 段界关。走通 gates[i] 即从第 i 段进第 i+1 段；走通最后一个进「大圆满」。
const STAGE_GATES = STAGES.map(function (s) { return s.to; });

function clampLevel(level) {
  const n = Math.round(Number(level) || 1);
  return Math.max(1, Math.min(LEVEL_MAX, n));
}

// 这一关落在第几段（0–4）。
function stageOfLevel(level) {
  const lv = clampLevel(level);
  for (let i = STAGES.length - 1; i >= 0; i -= 1) {
    if (lv >= STAGES[i].from) return i;
  }
  return 0;
}

// 已走通 N 关，这门现在是第几段（0–5）。5 = 大圆满（1000 关全通）。
// 这是段位的唯一出处：只看走通关数，不看品阶、不看评级。
function stageIndexOfCleared(cleared) {
  const n = Math.max(0, Math.min(LEVEL_MAX, Math.round(Number(cleared) || 0)));
  let idx = 0;
  for (let i = 0; i < STAGE_GATES.length; i += 1) {
    if (n >= STAGE_GATES[i]) idx = i + 1;
  }
  return idx;
}

function stageNameOfCleared(cleared) {
  const idx = stageIndexOfCleared(cleared);
  return idx >= STAGES.length ? FINAL_STAGE_NAME : STAGES[idx].name;
}

function stageRange(index) {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
}

function stageKeyOfLevel(level) {
  return STAGES[stageOfLevel(level)].key;
}

function stageSize(index) {
  const s = stageRange(index);
  return s.to - s.from + 1;
}

// 段内第几关（1 起）。界面写「第 12 关」用它；也是段内折减与 blocks 那类旋钮的口径。
function levelInStage(level) {
  const s = STAGES[stageOfLevel(level)];
  return clampLevel(level) - s.from + 1;
}

// 段内第几关（0 起）——沿用旧名 stageOf，玩法层与 tweakParams 里按「段内第几格」算。
function stageOf(level) {
  return levelInStage(level) - 1;
}

// 段内推进度：0 < f ≤ 1。第 1 关是 1/段长，段界关正好 1。
function progressOf(level) {
  const s = STAGES[stageOfLevel(level)];
  return levelInStage(level) / (s.to - s.from + 1);
}

// 整条线的进度（0–1），准备页那条进度条用它。
function totalProgressOf(level) {
  return clampLevel(level) / LEVEL_MAX;
}

// 灵纹牌的主题轮换：每 LINK_THEME_EVERY 关换一套纹样（灵植 / 甜点 / 海洋 / 灵兽）。
// 这是并蒂引「难度不变、盘面变了」的第一条旋钮（第二条是下面的盘形）——段内其余参数
// 都是逐关微收，相邻两关在屏幕上几乎一样（D9 记的就是这一笔）。
// 敢换得这么勤，是因为四套共用同一套轮廓族骨架（见 minigames/link.js）：玩家要重新认的
// 只是「这一套的圆族长什么样」，一两秒；要判「哪两枚同纹」的那套判断不用重建。
const LINK_THEME_EVERY = 5;
const LINK_THEME_COUNT = 4;
// 主题名只在这一处（数据层要拿它写「本关变化」那句白话）；纹样本身在
// minigames/link.js 的 CREST_THEMES 里。两处顺序必须一致，由 layout.test 断言
// 「名字表 === CREST_THEMES.map(name)」，不是靠人记。
const LINK_THEME_NAMES = ['灵植', '甜点', '海洋', '灵兽'];
function linkThemeOf(level) {
  const lv = Math.max(1, Math.round(Number(level) || 1));
  return Math.floor((lv - 1) / LINK_THEME_EVERY) % LINK_THEME_COUNT;
}

// 三连互换的纹样主题按段给（五段五套），段内恒定。
// 与并蒂引的「每五关轮换」不同：消消乐段内变化交给时辰与闪现，纹样只在换段时整副换掉，
// 让段界不用读字也看得出来。名字与格位表的顺序由 layout.test 断言，不靠人记。
// 图案表在 minigames/crest.js 的 MATCH_CRESTS。
const MATCH_THEME_COUNT = 5;
const MATCH_THEME_NAMES = ['灵植', '甜点', '海洋', '灵兽', '荟萃'];
function matchThemeOf(level) {
  return Math.max(0, Math.min(MATCH_THEME_COUNT - 1, stageOfLevel(level)));
}

// 并蒂引：**满盘、无缺口**。
// 这一门的盘面就该是一整块矩形——缺口只会被读成「盘被敲坏了」，不是「换了副形状」。
// 曾经为了换盘形在边沿挖四格，四角那一副尤其像被敲掉两块；砍掉之后对数改成
// 整盘格数除以二（12 / 21 / 35），时辰仍按同一条「每对预算 × 对数」公式算。
//
// 2026-11-19 后两段再放大一档（7×6 / 10×7）：对数从 18 / 24 推到 21 / 35，
// 规模差与业界困难档（144 张 / 72 对）从 3 倍压到 2 倍，是这一门唯一还没用满的轴。
// 满盘不是死盘：`findPath` 本来就允许多走盘外一圈当走廊，开局与每次消除后
// 若摆不出可连的一对，玩法层会按本段的次数与代价自移（见 `LINK_FAIR`）。
// 旧笔记里「满盘可连对数为 0」是拿固定条纹模板测出来的，不是真生成器——
// 那个模板同纹全落在对角线上，跟有没有空位无关，别再拿它当反例。
//
// 段内的变化交给两件真在动的事：纹样每 5 关换一套（看得见）、每对预算逐关收紧（算得出）。
// 段间的几何台阶是列数 4 → 7 → 10（格子约 93 → 53 → 37px），行数 6 → 6 → 7。
// 曾经的「布纹偏斜」已删：它把同纹组合数从 15 抬到 66，开局可连线对从 14.3 涨到 20.0，
// 方向与难度相反（实测见 minigames/link.js 的 pairCounts）。

// 少数几门的参数表全是离散量（没有时辰、没有间隔），段内收紧乘不到任何东西，
// 就给一门一个专属的连续旋钮。它们都真的被玩法层读走，不是给界面看的装饰：
//   merge   起手给 4 的比例：越往后越少白送 4，凑同数就得多走几步；
//   mines   S 线系数：盘面不变，S 线按段收紧，考的是推理不是手速；
//   klotski 步数预算系数：滑块让路本来只有「最优几步」两档，靠预算才有连续量。
// 并蒂连枝引的段内台阶不在这里：它是「每对预算」那条线，按关号现算（data/practice.js 的
// linkPerPairAt），不写进 params 表——写进来就会被当成第二个真源。
function tweakParams(method, out, level) {
  if (!method || !out) return out;
  const lv = clampLevel(level);
  const t = (stageOfLevel(lv) + progressOf(lv)) / STAGES.length;
  if (method.game === 'merge') out.fourRate = Math.round((0.45 - 0.25 * t) * 1000) / 1000;
  if (method.game === 'mines') out.lineScale = Math.round((1 - 0.30 * t) * 1000) / 1000;
  // 顺序点格：盘面与罚时都是整数、段内不变，时辰又不是参数（模块按 B 线现推），
  // 段内没有能收的数——不收的话一整段一字不差，关卡制在这一门上就是假的。
  // 于是给它一根和勘禁诀同形的连续旋钮：整条评级线（S/A/B 与时辰）按关收紧，全书收 18%。
  //
  // 为什么不复用 buildParamsAt 那 30%：那一刀只能落在 params.timeLimit 上，可这一门的时辰
  // 是「B 线 + 8」现推的，收进 B 线里 C 档就没了。要么收成「参数收了、盘面没变」，
  // 要么收出一个不存在的 C 档——所以这里不动时辰键，只按比例缩三条线。
  // 18% 而不是 30%：S 线在圆满段已经压到「优秀」档位，再收三成就成「没人到得了」。
  if (method.game === 'schulte') out.lineScale = Math.round((1 - 0.18 * t) * 1000) / 1000;
  // 滑块让路的段位表已经有 capFactor（3.20 → 2.20），这里只按段内进度再收 18%，
  // 不是覆盖。以前这一行把段位值整个盖掉，结果五段的预算系数都从 2.6 起算——
  // 「圆满比未入门紧」这句话在参数里其实不成立。
  //
  // 这一门不吃 buildParamsAt 那 30% 的一刀（那里按 capOwned 跳过了 capFactor）：
  // 两刀叠加要么得「先除掉一刀再乘」，除法 + 两次取整会让段内冒出
  // 「×2.66 → ×2.67」的反向回弹；要么得把前一刀整个抹掉。收成一刀，段内严格单调。
  // 封底 2.05：C 线是「超过最优两倍才脱身」，预算一旦压到两倍以下，这一段的评价
  // 就从「C 或更好」变成「B 或困住」——那不是变难，是把一档评语删掉。
  if (method.game === 'klotski') {
    const f = progressOf(lv);
    out.capFactor = Math.max(2.05, Math.round((out.capFactor || 2.8) * (1 - 0.18 * f) * 100) / 100);
  }
  // 落石垒基：段内两件事——起始级每 20 关抬一级，每级层数每 10 关减一层。
  // 两个数玩法层都读：前者决定重力，后者决定 meter 与提速坡度。
  // 后两段很长（300 / 500 关），两个旋钮会早早顶到上限，这是内容密度欠账的一部分。
  if (method.game === 'blocks') {
    const st = stageOf(lv);
    out.startLevel = Math.min(12, out.startLevel + Math.floor(st / 20));
    out.linesPerLevel = Math.max(4, out.linesPerLevel - Math.floor(st / 10));
  }
  // 神识·摘星辨魁诀：这一门只有「数多长、几批」两个离散量，给一条明写的时辰——
  // 每一批认得快才来得及，慢下来就少认一批。玩法层本来就认 params.timeLimit。
  if (method.game === 'biggest') {
    out.timeLimit = Math.round(88 - 34 * t);
    // 结构副轴：一批数里「最大的」与「次大的」差几。盘面规格（每批几个数、几批）挂段表，
    // 段内一律不动；这一条改的是**信息复杂度**——数挨得越近，越不能一眼扫出来，得逐位比。
    // 不缩时辰、不缩盘面、不改秒表，正对 D7 否决过的两种假副轴。
    // 按全书关号算而不是按段内进度算：按段回卷会让下一段第 1 关比上一段末关更好辨。
    // 下限 2 是硬的：差 1 时两个数只差末位，等于把「看一眼」改成「读两遍」，C 带会被吃掉。
    out.nearGap = Math.max(2, Math.round(12 - 10 * (lv - 1) / (LEVEL_MAX - 1)));
  }
  // 御灵·并蒂连枝引：段内只换纹样。盘面规格与纹种数照旧挂段表，每对预算按关号现算。
  // 纹样每五关换一套（灵植 / 甜点 / 海洋 / 灵兽）：这是这一门「难度不变、手感变了」
  // 的那条旋钮——段内其余参数都是逐关微收，玩家看不出相邻两关的差别（D9）。
  if (method.game === 'link') {
    out.theme = linkThemeOf(lv);
  }
  // 三连互换：主题按段注入，段内恒定。段界整副图案换掉，是这一门最直观的台阶。
  if (method.game === 'match') {
    out.theme = matchThemeOf(lv);
  }
  return out;
}

// 老 200 关制下的「熟练度 → 第几关」。**只为迁移**：v7 及以前的存档没有关卡进度，
// 只有 prof，要靠它反推当时走到第几关（1–200），再乘 5 折成 1000 关制。
// 新代码一律不许调它——关号现在只由「走通了几关」推进。
function legacyLevelFromProf(prof) {
  const p = Math.max(0, Number(prof) || 0);
  const OLD_SPAN = 40;
  for (let i = 0; i < 5; i += 1) {
    const lo = LEVEL_PROF_STEPS[i];
    const hi = LEVEL_PROF_STEPS[i + 1];
    const from = i * OLD_SPAN + 1;
    if (p >= hi) continue;
    const f = hi > lo ? (p - lo) / (hi - lo) : 1;
    const step = Math.round((OLD_SPAN - 1) * Math.max(0, Math.min(1, f)));
    return from + step;
  }
  return 200;
}

module.exports = {
  LEVEL_MAX: LEVEL_MAX,
  LEVEL_PROF_STEPS: LEVEL_PROF_STEPS,
  STAGES: STAGES,
  STAGE_GATES: STAGE_GATES,
  FINAL_STAGE_NAME: FINAL_STAGE_NAME,
  clampLevel: clampLevel,
  stageOfLevel: stageOfLevel,
  stageIndexOfCleared: stageIndexOfCleared,
  stageNameOfCleared: stageNameOfCleared,
  stageRange: stageRange,
  stageKeyOfLevel: stageKeyOfLevel,
  stageSize: stageSize,
  levelInStage: levelInStage,
  stageOf: stageOf,
  progressOf: progressOf,
  totalProgressOf: totalProgressOf,
  linkThemeOf: linkThemeOf,
  LINK_THEME_EVERY: LINK_THEME_EVERY,
  LINK_THEME_COUNT: LINK_THEME_COUNT,
  LINK_THEME_NAMES: LINK_THEME_NAMES,
  matchThemeOf: matchThemeOf,
  MATCH_THEME_COUNT: MATCH_THEME_COUNT,
  MATCH_THEME_NAMES: MATCH_THEME_NAMES,
  tweakParams: tweakParams,
  legacyLevelFromProf: legacyLevelFromProf,
};
