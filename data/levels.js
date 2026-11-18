'use strict';

// 每门功法一条 1000 关的长线，五段。段名就是「这门练到哪」：
//   未入门 1–10（10 关）→ 入门 11–50（40）→ 小成 51–200（150）
//   → 大成 201–500（300）→ 圆满 501–1000（500）→ 走通第 1000 关即大圆满
// 前密后疏：头一小时能连跨两段，后两段要磨。段界关（10/50/200/500/1000）是
// 「晋阶关」——走通它当场进下一段，所以段长 10 / 40 / 150 / 300 / 500，合计 1000。
//
// **不再有难度档。** 以前是「简单/普通/困难/极难/绝境」五档各 40 关，玩家挑档；
// 现在是一段一条线，难度跟着关号走（段内进度），玩家只有一个动作：往前走或回关。
// 段位由已走通的关数决定（stageIndexOfCleared），与熟练度无关——熟练度是另一条线，
// 只管火候（属性加成与阶段新法），不再算关号、不再开难度。
//
// 段内递进：以「本段基准参数」为底，把时间与预算按段内进度收紧最多三成
// （`data/practice.js` 的 `buildParamsAt`），再叠一门自己的连续旋钮（`tweakParams`）。
// 盘面规格（几列、几处阵位、几盏心神）挂在段上——一段一副主盘，换段才换一副。
//
// **已知欠账（不许装看不见）**：段长 10/40/150/300/500 意味着「每关都不同」只在前两段
// 成立。圆满段 500 关共用一副主盘、参数逐关只收 0.06%，玩家看不出相邻两关的差别。
// 这一段的密度要靠后续补「段内变体」（见 04-open-issues D11），现在先把骨架和
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
// 这是段位的唯一出处：只看走通关数，不看熟练度、不看品阶。
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

// 并蒂引的盘形：段内每关都在收预算，屏幕上却几乎一样（相邻两关差 0.06%）。
// 业界同类的做法不是加特效，是换盘形——麻将 solitaire 收了 650+ 套布局，
// 宠物连连看的九关就是九套布局，三消也把 board geometry 单列为一项难度驱动。
// 盘形是配对类真正的内容单位：牌面不变、规则不变，扫描路径换了。
//
// 空位只挖在边上，不挖中腹：中腹挖空会变成一条免费通道（实测每对可连量 +43%），
// 那是变松不是变样；边上挖口子只减「牌数」，通路结构几乎不动。四副的实测带宽
// （kinds 6 / 6×4：每对可连 0.73–0.82；kinds 4：1.24–1.32）写在
// docs/20-minigames/11-并蒂连枝引/总览.md。
//
// **每段之内空位数恒定（四格），一副不落**。不是舍不得挖，是因为对数就是时辰的分母：
// 段内若有一关少一对，floor(每对预算 × 对数) 会在那一关把每对预算顶高 0.03 息——
// 盘上写着「每对时辰 5.42 → 5.45」，玩家读到的是这一关变松了，而这纯是取整的回弹。
// 空位数恒定，段内对数就不动，每对预算才会严格只减不增。
const LINK_LAYOUTS = [
  { id: 'both', name: '上下缺' },   // 上下两沿正中各缺两格
  { id: 'side', name: '两侧缺' },   // 左右两边正中各缺两格
  { id: 'cross', name: '四门缺' },  // 四边正中各缺一格（十字对称）
  { id: 'corner', name: '角位缺' }, // 四角各缺一格
];
// 空位数：**每一段都挖四格，一格都不能省**。
// 试过「盘形正好等于目标格数，不挖空位」（5×4 满盘），实测两折下可连对数为 0——
// 开局就是一副死盘：连线要有一条空的行或列当走廊，满盘时任何两折路径都被牌堵死。
// 空位不是装饰，是这一门成立的前提。
// 四格也刚好让三副盘形都落在偶数上（24−4=20 / 36−4=32 / 48−4=44），
// 不会出现「挖四个剩奇数、只能丢掉一个角」的三缺一——5×7 那一版就是这么残的。
// 数量挂段不挂盘形：对数就是时辰的分母，段内必须恒定。
const LINK_GAP_COUNT = [4, 4, 4, 4, 4];
// 4 关一轮，按段内进度算（段首关是四副里的第一副，换段换的是盘面规格，不是布局）。
// 与纹样的 5 关不同周期，所以大多数关只有一个轴在变，偶尔两件一起换。
// 按段内进度而不是按全书关号：按全书算的话，段首关会从四副里随便一副开始，
// 「换段」这件事在盘面上就看不出来了。
const LINK_LAYOUT_EVERY = 4;

function linkLayoutOf(level) {
  const lv = Math.max(1, Math.round(Number(level) || 1));
  const off = lv - stageRange(stageOfLevel(lv)).from;
  return Math.floor(off / LINK_LAYOUT_EVERY) % LINK_LAYOUTS.length;
}

function linkLayoutNameOf(level) {
  const spec = LINK_LAYOUTS[linkLayoutOf(level)];
  return spec ? spec.name : LINK_LAYOUTS[0].name;
}

// 空位是「格子下标」，由数据层一次算清，玩法层只消费（p.gaps）。
// 不给玩法层自己算的理由：对数（时辰的分母）也算在这里，两处各算一套迟早对不上。
function linkGapsAt(level, cols, rows) {
  const lv = Math.max(1, Math.round(Number(level) || 1));
  const want = LINK_GAP_COUNT[stageOfLevel(lv)] || 0;
  // 这一段的盘形不需要空位：直接给空表。调用方（对数、时辰、规格串）都从
  // 返回值的长度反推，所以「不挖」和「挖四个」走的是同一条路，没有第二套算法。
  if (!want) return [];
  const spec = LINK_LAYOUTS[linkLayoutOf(lv)] || LINK_LAYOUTS[0];
  const c = Math.max(3, Math.round(cols) || 6);
  const r = Math.max(3, Math.round(rows) || 4);
  const c0 = Math.floor((c - 2) / 2);
  const r0 = Math.floor((r - 2) / 2);
  const at = function (rr, cc) { return rr * c + cc; };
  let gaps = [];
  if (spec.id === 'both') gaps = [at(0, c0), at(0, c0 + 1), at(r - 1, c0), at(r - 1, c0 + 1)];
  else if (spec.id === 'side') gaps = [at(r0, 0), at(r0 + 1, 0), at(r0, c - 1), at(r0 + 1, c - 1)];
  else if (spec.id === 'cross') gaps = [at(0, c0), at(r - 1, c0), at(r0, 0), at(r0, c - 1)];
  else if (spec.id === 'corner') gaps = [at(0, 0), at(0, c - 1), at(r - 1, 0), at(r - 1, c - 1)];
  // 小盘上几种挖法可能撞格：去重、去越界，再保证剩下的格子仍是偶数
  // （奇数就没法成对，玩法层会当场少一张牌）。
  const uniq = [];
  for (let i = 0; i < gaps.length; i += 1) {
    const g = gaps[i];
    if (g < 0 || g >= c * r) continue;
    if (uniq.indexOf(g) >= 0) continue;
    uniq.push(g);
  }
  // 上限就是本段该挖的数量：撞格去重后不够四个时宁可少挖，也不从别处补——
  // 补出来的位置不在布局的形状里，盘面会变成一副谁也不认识的缺口。
  while (uniq.length > want) uniq.pop();
  if ((c * r - uniq.length) % 2) uniq.pop();
  return uniq;
}

// 少数几门的参数表全是离散量（没有时辰、没有间隔），段内收紧乘不到任何东西，
// 就给一门一个专属的连续旋钮。它们都真的被玩法层读走，不是给界面看的装饰：
//   merge   起手给 4 的比例：越往后越少白送 4，凑同数就得多走几步；
//   mines   S 线系数：盘面不变，S 线按段收紧，考的是推理不是手速；
//   klotski 步数预算系数：滑块让路本来只有「最优几步」两档，靠预算才有连续量。
//   link    段内布纹：盘面规格与纹种数不变，只改每种纹各有几对——段首均匀、段末偏斜。
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
  // 御灵·并蒂连枝引：段内布纹。盘面规格与纹种数照旧挂段表，这里只改每种纹各有几对。
  // 段首均匀铺开、段末一种纹占六对另一种只剩一对，玩家在盘上直接看得见牌阵换了。
  // 按段内进度走：每一段的头关都从均匀起手，末关都是最偏的那一副，段差不被回卷吃掉。
  // 数字只到 3：再偏就有纹种被挤掉，而纹种数是换段才动的事。
  if (method.game === 'link') {
    out.weave = Math.min(3, Math.floor(4 * progressOf(lv)));
    // 纹样主题：每五关换一套（灵植 / 甜点 / 海洋 / 灵兽）。这是这一门「难度不变、
    // 手感变了」的第一条旋钮 —— 段内其余参数都是逐关微收，玩家看不出相邻两关的差别（D9）。
    out.theme = linkThemeOf(lv);
    // 盘形：每四关换一副空位分布，与纹样错开。空位列表在这里一次算清，
    // 玩法层只读 p.gaps；对数（时辰的分母）也由它的长度决定，两处不能各算一套。
    out.layout = linkLayoutOf(lv);
    out.gaps = linkGapsAt(lv, out.cols, out.rows);
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
  LINK_LAYOUTS: LINK_LAYOUTS,
  LINK_GAP_COUNT: LINK_GAP_COUNT,
  LINK_LAYOUT_EVERY: LINK_LAYOUT_EVERY,
  linkLayoutOf: linkLayoutOf,
  linkLayoutNameOf: linkLayoutNameOf,
  linkGapsAt: linkGapsAt,
  tweakParams: tweakParams,
  legacyLevelFromProf: legacyLevelFromProf,
};
