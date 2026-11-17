'use strict';

// 收支曲线模拟：验证「熟练度」与「灵力」这两条线各自的形状，以及两者之间的兑换比。
//   ① 熟练度 = 单局基础（C 10 / B 15 / A 23 / S 34 / F 0）+ 连 S 倍率
//      （第 k 连 S = round(34 × 1.5^(k-1))，10 层封顶）；每局独立取整，
//      回关局按「本关 ÷ 当前关」折一次、且不参与连 S；不吃品阶 / 品阶 / 境界 / 属性；
//   ② 灵力 = 参悟与对战的运功消耗，唯一真源 economy.practiceQiCost()；
//      它不产出，只从闭关（world.idle）与份例来。所以「一局练多久」的度量是
//      「这一局烧掉的气，要闭关几分钟才回得来」——本脚本把它一起算出来；
//   ③ 灵石 = 切磋与秘境所得，当日第 n 场按 0.85^(n-1) 衰减，只出不进的是花销。
// 用法：npm run sim（也可 node scripts/simulate.js）。固定种子的伪随机只用来模拟评级分布，
// 目的是在改数值前后可复现地比较曲线，不是预言真机数据。

const game = require('../utils/game.js');
const levels = require('../data/levels.js');
const practice = require('../data/practice.js');
const world = require('../data/world.js');
const economy = require('../data/economy.js');
const opponents = require('../data/opponents.js');

// 各段的评级分布（经验值，真机数据出来后回来校准）。
const GRADE_DIST = {
  novice: { S: 0.25, A: 0.40, B: 0.25, C: 0.08, F: 0.02 },
  entry: { S: 0.20, A: 0.35, B: 0.30, C: 0.12, F: 0.03 },
  minor: { S: 0.13, A: 0.27, B: 0.35, C: 0.20, F: 0.05 },
  major: { S: 0.08, A: 0.20, B: 0.35, C: 0.28, F: 0.09 },
  full: { S: 0.05, A: 0.15, B: 0.35, C: 0.33, F: 0.12 },
};

// 一次「闭关」的产量：world.idle.qiPerMinute，封顶 capHours。
// 但真正到手的是「产能」与「气海空位」的较小者——灵力有上限（见 economy.qiCapOf），
// 所以这里同时算两个数：8 小时坐得出来多少（产能）与一次装得下多少（气海）。
const IDLE = world.getWorld().idle;
const QI_PER_MIN = IDLE.qiPerMinute;
const QI_PER_CAP = Math.round(QI_PER_MIN * IDLE.capHours * 60);
const OPEN_QI_CAP = game.qiCap(game.createNewState());
const FILL_HOURS = (OPEN_QI_CAP / QI_PER_MIN / 60).toFixed(1);

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickGrade(rng, dist) {
  const r = rng();
  let acc = 0;
  const order = ['S', 'A', 'B', 'C', 'F'];
  for (let i = 0; i < order.length; i += 1) {
    acc += dist[order[i]];
    if (r <= acc) return order[i];
  }
  return 'F';
}

// 这一门打某一关要烧多少气：直接读引擎，和准备页、结算用的是同一把尺子。
// 关卡是显式参数——耗气看这一关落在哪一段，与段内第几关无关。
function costOf(state, skillId, level) {
  return game.practiceCostOf(state, skillId, level);
}

// 本门当前关（已走通 + 1，封顶 1000）。三种刷法都用它取「auto = 一路往前走」。
function frontierOf(rec) {
  return { level: practice.curLevelOf(rec) };
}

// 五段耗气：`cost` 是这一门在本段首关的实价（含时长系数与悟性），
// `base` 是 economy.RUN_QI 的裸基数——两者分开列，才不会把「基数」当成「到手价」。
function qiByDiff(skillId) {
  const state = game.createNewState();
  state.skills[skillId].unlocked = true;
  return practice.STAGES.map(function (d, i) {
    return {
      key: d.key,
      name: d.name,
      from: d.from,
      base: economy.RUN_QI[i],
      cost: costOf(state, skillId, d.from),
    };
  });
}

// 固定灵力预算下能练成什么样：几种模式都按「关由熟练度算出」推当前关。
// 预算制而不是局数制，是因为灵力才是约束——同样的局数在前面的章要烧的气少得多，
// 拿局数比会让「刷第 1 关」显得划算。
function runBudget(opts) {
  const state = game.createNewState();
  state.skills[opts.skillId].unlocked = true;
  if (typeof opts.realmIndex === 'number') state.realmIndex = opts.realmIndex;
  state.resources.qi = opts.budget;
  const rng = makeRng(20261111);
  let profGain = 0;
  let sRuns = 0;
  let runs = 0;
  let spent = 0;
  const marks = [];
  while (spent < opts.budget && runs < 5000) {
    const rec = state.skills[opts.skillId];
    if (rec.prof >= world.PROF_MAX) break;
    const frontier = frontierOf(rec);
    // 三种刷法都用「打第几关」表达：auto = 本门当前关；first = 回打第 1 关；
    // half = 回打当前关的一半。评级分布跟着这一关落在哪一段走。
    let lv;
    if (opts.mode === 'first') lv = 1;
    else if (opts.mode === 'half') lv = Math.max(1, Math.floor(frontier.level / 2));
    else lv = frontier.level;
    const key = levels.stageKeyOfLevel(lv);
    const cost = costOf(state, opts.skillId, lv);
    // 气不够这一局就停手：真机上这时该回去闭关，而不是「先欠着」。
    if (state.resources.qi < cost) break;
    const grade = pickGrade(rng, GRADE_DIST[key]);
    const r = game.applyPractice(state, opts.skillId, grade, { level: lv, score: 0 });
    if (!r.ok) break;
    profGain += r.gain;
    if (grade === 'S') sRuns += 1;
    spent += r.qiCost;
    runs += 1;
    if (runs % 20 === 0) marks.push({ run: runs, prof: state.skills[opts.skillId].prof, spent: spent });
  }
  return {
    profGain: profGain, sRuns: sRuns, runs: runs, spent: spent, marks: marks,
    prof: state.skills[opts.skillId].prof,
  };
}

// 全 C 通关：一路按本门当前关走，记录每章用了多少局、烧了多少气。
function fullCRun() {
  const state = game.createNewState();
  state.skills.jian.unlocked = true;
  state.resources.qi = 1e9;   // 预算另算：这条曲线只看「多少局」，气由 spent 单独累计
  const milestones = [];
  for (let t = 1; t < world.TIERS.length; t += 1) milestones.push(null);
  let runs = 0;
  let spent = 0;
  while (state.skills.jian.prof < world.PROF_MAX && runs < 20000) {
    const f = frontierOf(state.skills.jian);
    const r = game.applyPractice(state, 'jian', 'C', { level: f.level, score: 0 });
    spent += r.qiCost;
    runs += 1;
    for (let t = 1; t < world.TIERS.length; t += 1) {
      if (milestones[t - 1] === null && state.skills.jian.prof >= world.TIERS[t].threshold) {
        milestones[t - 1] = runs;
      }
    }
  }
  return { runs: runs, prof: state.skills.jian.prof, milestones: milestones, spent: spent, state: state };
}

// 全程不断 S：每局都打本门当前关，连击从第 1 连一路叠到封顶。
function fullSRun() {
  const state = game.createNewState();
  state.skills.jian.unlocked = true;
  state.resources.qi = 1e9;
  const milestones = [];
  for (let t = 1; t < world.TIERS.length; t += 1) milestones.push(null);
  let runs = 0;
  let spent = 0;
  let atTen = 0;
  while (state.skills.jian.prof < world.PROF_MAX && runs < 5000) {
    const f = frontierOf(state.skills.jian);
    const r = game.applyPractice(state, 'jian', 'S', { level: f.level, score: 0 });
    spent += r.qiCost;
    runs += 1;
    if (runs === 10) atTen = state.skills.jian.prof;
    for (let t = 1; t < world.TIERS.length; t += 1) {
      if (milestones[t - 1] === null && state.skills.jian.prof >= world.TIERS[t].threshold) {
        milestones[t - 1] = runs;
      }
    }
  }
  return {
    runs: runs, prof: state.skills.jian.prof, milestones: milestones,
    atTen: atTen, spent: spent, state: state,
  };
}

function fmt(n) { return String(n).padStart(7, ' '); }

console.log('== 单局基础与连 S 曲线（与品阶 / 难度 / 境界 / 属性无关）==');
console.log('  ' + Object.keys(world.PROF_BASE).map(function (g) {
  return g + ' ' + world.PROF_BASE[g] + ' 点';
}).join(' / ') + '  ·  硬顶 ' + world.PROF_MAX);
console.log('  第 1～10 连 S：' + world.COMBO_TABLE.join(' / ')
  + ' 点 · 一轮 ' + world.COMBO_ROUND + ' 点 · 之后每局锁死 ' + world.COMBO_CAP_GAIN);

console.log('\n== 五段耗气（黄阶 · 悟性 0 · 不换门 · 未超上限 · 各段首关）==');
const qiTable = qiByDiff('jian');
for (const q of qiTable) {
  const perQi = (world.PROF_BASE.S / q.cost).toFixed(2);
  console.log('  ' + q.name + '  基数 ' + String(q.base).padStart(3) + ' → 实价 '
    + String(q.cost).padStart(3) + ' 点（剑法时长系数 + 悟性 10）· 首局 S 每点灵力换 '
    + perQi + ' 点熟练度');
}
console.log('  单价随档上升、单点灵力的首局熟练度反而下降——这是刻意的：难盘该更贵。');
console.log('  往上走的回报不在单价，在「连 S 只在本门最高档叠、低档还要折半」（见文末预算实验）。');
console.log('  闭关 ' + QI_PER_MIN + ' 点/分：8 小时产能 ' + QI_PER_CAP + ' 点，但炼气气海只装 '
  + OPEN_QI_CAP + ' 点（' + FILL_HOURS + ' 小时即满，溢出 ' + (QI_PER_CAP - OPEN_QI_CAP) + ' 点收不到）');
console.log('  一池灵力 = 圆满 ' + Math.floor(OPEN_QI_CAP / qiTable[4].cost)
  + ' 局 / 困难 ' + Math.floor(OPEN_QI_CAP / qiTable[2].cost) + ' 局'
  + '；想把一池练大，靠破境（气海 150→620）与真元（每点 +2）。');

// 天阶 2026-11 起没有功法，最贵的一档落到地阶（×1.3）。
console.log('\n== 地阶对照（时长系数与品阶一起抬价）==');
const diTable = qiByDiff('zhen');
for (let i = 0; i < diTable.length; i += 1) {
  console.log('  ' + diTable[i].name.padEnd(6) + ' 黄阶 ' + String(qiTable[i].cost).padStart(3)
    + ' → 地阶 ' + String(diTable[i].cost).padStart(3)
    + '  （×' + (diTable[i].cost / qiTable[i].cost).toFixed(2) + '）');
}

const fullC = fullCRun();
console.log('\n== 全 C 通关：一路打本门当前关走到大圆满 ==');
console.log('  段位        局数   门槛');
for (let t = 1; t < world.TIERS.length; t += 1) {
  console.log('  ' + world.TIERS[t].name.padEnd(10) + fmt(fullC.milestones[t - 1])
    + fmt(world.TIERS[t].threshold));
}
console.log('  共烧灵力 ' + fullC.spent + ' 点 ≈ 闭关 ' + Math.round(fullC.spent / QI_PER_MIN / 60) + ' 小时');

const fullS = fullSRun();
console.log('\n== 全程不断 S：一路打本门当前关走到大圆满 ==');
console.log('  段位        局数   门槛');
for (let t = 1; t < world.TIERS.length; t += 1) {
  console.log('  ' + world.TIERS[t].name.padEnd(10) + fmt(fullS.milestones[t - 1])
    + fmt(world.TIERS[t].threshold));
}
console.log('  共烧灵力 ' + fullS.spent + ' 点 ≈ 闭关 ' + Math.round(fullS.spent / QI_PER_MIN / 60) + ' 小时');

const BUDGET = 6000;
// 三个 mode 的名字必须与 runBudget 认的那三个一致（first / auto / half）。
// 曾经这里写的是 novice / auto / below，两个不认识的落进 else 分支，
// 于是「只刷第 1 关」被算成了「逐关进」——三条曲线一模一样，护栏反而成了摆设。
const strategies = [
  { name: '黄阶 · 只刷第 1 关', skillId: 'jian', realmIndex: 0, mode: 'first' },
  { name: '黄阶 · 逐关进', skillId: 'jian', realmIndex: 0, mode: 'auto' },
  { name: '黄阶 · 退一章', skillId: 'jian', realmIndex: 0, mode: 'half' },
  { name: '地阶 · 逐关进', skillId: 'zhen', realmIndex: 3, mode: 'auto' },
  { name: '黄阶 · 金丹后', skillId: 'jian', realmIndex: 2, mode: 'auto' },
];

console.log('\n== 固定灵力预算 ' + BUDGET + ' 点（≈ 闭关 '
  + Math.round(BUDGET / QI_PER_MIN / 60) + ' 小时）：各刷法能练成什么样 ==');
const results = [];
for (const st of strategies) {
  const r = runBudget({ skillId: st.skillId, realmIndex: st.realmIndex, budget: BUDGET, mode: st.mode });
  results.push({ name: st.name, profGain: r.profGain, sRuns: r.sRuns, runs: r.runs, prof: r.prof, spent: r.spent });
  console.log('  ' + st.name.padEnd(16) + ' ' + fmt(r.runs) + ' 局 · 熟练度 ' + fmt(r.prof)
    + ' · 平均 ' + (r.profGain / Math.max(1, r.spent)).toFixed(2) + ' 点/灵力');
}

const easy = results[0];
const auto = results[1];
const belowOne = results[2];
const di = results[3];
const decayed = results[4];

// 切磋：灵石按当日第几场衰减，运功另扣 5 点灵力。
console.log('\n== 当日切磋灵石（0.85^(n-1)）==');
const stoneRow = [];
for (let n = 0; n < 10; n += 1) stoneRow.push(Math.round(economy.battleStoneFactor(n) * 1000) / 1000);
console.log('  第 1～10 场系数：' + stoneRow.join(' / '));
console.log('  撑到第 15 场只剩 ' + economy.battleStoneFactor(14).toFixed(3)
  + '：一场 ' + economy.BATTLE_QI + ' 点灵力换不回几枚，玩家自己会停手');

console.log('\n== 检查 ==');
let bad = 0;
function expect(cond, msg) {
  console.log('  ' + (cond ? 'OK  ' : 'FAIL') + ' ' + msg);
  if (!cond) bad += 1;
}

// ① 五段耗气按段单调上升；实价 = 基数 × 时长系数 ÷ 悟性，逐档都复算一遍。
for (let i = 0; i < qiTable.length; i += 1) {
  expect(qiTable[i].base === economy.RUN_QI[i],
    qiTable[i].name + ' 基数 ' + qiTable[i].base + ' 与 RUN_QI 一致');
  const want = economy.practiceQiCost({
    stageIndex: i, tierKey: 'huang', methodBase: practice.getMethod('jian').base,
    wu: world.getWorld().baseAttributes.wu,
  });
  expect(qiTable[i].cost === want,
    qiTable[i].name + ' 实价 ' + qiTable[i].cost + ' = 基数 × 时长系数 ÷ 悟性（应为 ' + want + '）');
  if (i > 0) expect(qiTable[i].cost > qiTable[i - 1].cost,
    qiTable[i].name + ' 比 ' + qiTable[i - 1].name + ' 贵（' + qiTable[i].cost + ' vs ' + qiTable[i - 1].cost + '）');
}
expect(diTable[4].cost > qiTable[4].cost, '地阶圆满比黄阶圆满贵（' + diTable[4].cost + ' vs ' + qiTable[4].cost + '）');

// ② 全 C：一万局到 99999，每段局数正好是门槛 ÷ 10（最后一局补 9 点）。
expect(fullC.prof === world.PROF_MAX, '全 C 最终到 ' + fullC.prof + '，硬顶是 ' + world.PROF_MAX);
expect(fullC.runs === world.PROF_C_RUNS + 1,
  '全 C 通关用了 ' + fullC.runs + ' 局（标定 ' + world.PROF_C_RUNS + ' 局 + 补零头 1 局）');
for (let t = 1; t < world.TIERS.length; t += 1) {
  const want = t === world.TIERS.length - 1
    ? fullC.runs
    : Math.ceil(world.TIERS[t].threshold / world.PROF_BASE.C);
  expect(fullC.milestones[t - 1] === want,
    world.TIERS[t].name + ' 应在第 ' + want + ' 局（实为 ' + fullC.milestones[t - 1] + '）');
}

// ②b 全程不断 S：前 10 局正好 3853 点，第 11 局起每局 1307，84 局毕业。
expect(fullS.atTen === world.COMBO_ROUND,
  '前 10 连累计 ' + fullS.atTen + ' 点，一轮应为 ' + world.COMBO_ROUND);
expect(fullS.runs === world.PROF_S_RUNS && world.PROF_S_RUNS === 84,
  '全程不断 S 用了 ' + fullS.runs + ' 局，理论最少 84 局');
expect(fullS.prof === world.PROF_MAX, '全程不断 S 最终到 ' + fullS.prof);
expect(fullS.runs < fullC.runs / 100,
  '全 S 与全 C 差了约 119 倍（' + fullS.runs + ' vs ' + fullC.runs + ' 局）');
expect(fullS.spent < fullC.spent / 50,
  '全 S 烧的气也少得多（' + fullS.spent + ' vs ' + fullC.spent + ' 点）');

// ③ 连 S 曲线逐局复算：每局独立取整，第 11 连起锁死。
const comboState = game.createNewState();
comboState.skills.jian.unlocked = true;
comboState.skills.jian.prof = 24000;
comboState.skills.jian.cleared = 800;
comboState.resources.qi = 1e6;
const comboGains = [];
for (let i = 1; i <= 14; i += 1) {
  // 一局一关：每局都打当时的当前关，才拿得到全额与连 S。
  const r = game.applyPractice(comboState, 'jian', 'S', { level: comboState.skills.jian.cleared + 1, score: 0 });
  comboGains.push(r.gain);
  expect(r.gain === world.comboGain(i) && r.comboNow === Math.min(i, 10),
    '第 ' + i + ' 连 S：' + r.gain + ' 点 · 层数 ' + r.comboNow);
}
expect(comboGains.slice(10).every(function (g) { return g === world.COMBO_CAP_GAIN; }),
  '第 11～14 连都锁死 ' + world.COMBO_CAP_GAIN + ' 点');
expect(world.comboGain(4) !== Math.round(world.comboGain(3) * world.COMBO_STEP),
  '每局独立取整，不拿上一局整数接着乘');

// ③b 断连与结束：非 S / 失败 / breakCombo 都归零，下一局回到 34。
const breakState = game.createNewState();
breakState.resources.qi = 1e6;
game.applyPractice(breakState, 'jian', 'S', { score: 0 });
game.applyPractice(breakState, 'jian', 'S', { score: 0 });
const afterA = game.applyPractice(breakState, 'jian', 'A', { score: 0 });
expect(afterA.comboNow === 0 && afterA.gain === world.PROF_BASE.A, '非 S 归零并给固定基础值');
game.applyPractice(breakState, 'jian', 'S', { score: 0 });
game.breakCombo(breakState, 'jian');
const afterAbort = game.applyPractice(breakState, 'jian', 'S', { score: 0 });
expect(afterAbort.comboNow === 1 && afterAbort.gain === 34, '结束断连后下一局从 34 点重起');

// ④ 各段基础值不受任何倍率影响：C 都是 10 点。
// 段位只看走通了几关，所以逐段把前面几段整段走通，才能站到那一段的首关。
for (const d of practice.STAGES) {
  const s = game.createNewState();
  s.skills.jian.unlocked = true;
  s.skills.jian.cleared = d.from - 1;
  s.resources.qi = 1e6;
  const r = game.applyPractice(s, 'jian', 'C', { level: d.from, score: 0 });
  expect(r.gain === world.PROF_BASE.C,
    d.name + ' 段 C 仍是 ' + world.PROF_BASE.C + ' 点（实为 ' + r.gain + '）');
}

// ④b 回关：只折熟练度（本关 ÷ 当前关 × 段基数比，四舍五入），耗气按这一关所在段照算。
const curTop = 21;   // 已走通 20 关 → 当前关 21（入门段 11）
[21, 15, 10, 5, 1].forEach(function (lv) {
  const st = game.createNewState();
  st.skills.jian.unlocked = true;
  st.skills.jian.cleared = curTop - 1;
  st.resources.qi = 1e6;
  const r = game.applyPractice(st, 'jian', 'C', { level: lv, score: 0 });
  const wantF = lv >= curTop ? 1 : practice.levelFactor(lv, curTop);
  expect(r.gain === practice.profByLevel(world.PROF_BASE.C, lv, curTop)
    && Math.abs(r.levelBelowFactor - wantF) < 1e-9,
    '回关到第 ' + lv + ' 关：熟练度 ×' + wantF.toFixed(3)
    + '、实得 ' + r.gain + ' 点，耗气按本段 ' + r.qiCost + ' 点');
});
// 折减是连续的：退一关只掉一点点（20/21 = 0.952），跨段的第二把尺子也是渐进的。
// 「只按关号折」那一版漏了一件事：回关同时省了段位的气，于是停在低段末反复刷
// 永远比推进到高段划算（见 data/practice.js 的 levelFactor 注释与 04-open-issues D12）。
expect(practice.profByLevel(world.PROF_BASE.C, 20, curTop) === 10,
  '第 21 → 20 关只该掉 5%（C 10 → 10），实为 '
  + practice.profByLevel(world.PROF_BASE.C, 20, curTop));

// ④c 回关与连 S 解耦：不叠层、不砍连击收益、层数原样保留。
const lowCombo = game.createNewState();
lowCombo.skills.jian.unlocked = true;
lowCombo.skills.jian.cleared = 8;
lowCombo.resources.qi = 1e6;
game.applyPractice(lowCombo, 'jian', 'S', { level: 9, score: 0 });
game.applyPractice(lowCombo, 'jian', 'S', { level: 10, score: 0 });
const lowRound = game.applyPractice(lowCombo, 'jian', 'S', { level: 3, score: 0 });
expect(lowRound.comboActive === false && lowRound.comboNow === 2
  && lowRound.gain === practice.profByLevel(world.PROF_BASE.S, 3, 11),
  '回关 S 与连 S 解耦：不叠层、层数保留 2、收益 ' + lowRound.gain + ' 点');
const backTop = game.applyPractice(lowCombo, 'jian', 'S', { level: 11, score: 0 });
expect(backTop.comboNow === 3 && backTop.gain === 77, '回当前关照接第 3 连 77 点');

// ⑤ 品阶只影响耗气与属性，不碰熟练度：各阶 C 都是 10 点，但价目不同。
// 天阶 2026-11 起没有功法，所以只核到地阶 —— 「四阶」那句话现在只剩三阶有实测。
const tierIds = { huang: 'jian', xuan: 'jingxin', di: 'zhen' };
const tierCost = {};
for (const tier of practice.TIERS) {
  const s = game.createNewState();
  const id = tierIds[tier.key];
  if (!s.skills[id]) continue;
  s.skills[id].unlocked = true;
  s.resources.qi = 1e6;
  // 四阶都摆到「刚好到门槛」的境界：未到门槛现在直接拒绝开局，测耗气就进不去了。
  s.realmIndex = tier.needRealm - 1;
  const r = game.applyPractice(s, id, 'C', { difficulty: 'novice', score: 0 });
  tierCost[tier.key] = r.qiCost;
  expect(r.gain === world.PROF_BASE.C, tier.label + ' C 仍是 ' + world.PROF_BASE.C + ' 点');
}
expect(tierCost.huang < tierCost.di,
  '地阶比黄阶费气（' + tierCost.di + ' vs ' + tierCost.huang + ' 点）');

// ⑥ 境界超上限只加价，不禁练。
const decayState = game.createNewState();
decayState.skills.jian.unlocked = true;
decayState.realmIndex = 2;
decayState.resources.qi = 1e6;
const decayRun = game.applyPractice(decayState, 'jian', 'C', { difficulty: 'novice', score: 0 });
expect(decayRun.gain === world.PROF_BASE.C && decayRun.realmAbove && decayRun.realmOverCost === economy.REALM_OVER,
  '境界超上限：熟练度照给 ' + world.PROF_BASE.C + ' 点，耗气 ×' + decayRun.realmOverCost);
expect(decayRun.qiCost > qiTable[0].cost,
  '金丹期练黄阶简单要 ' + decayRun.qiCost + ' 点，比标价 ' + qiTable[0].cost + ' 贵');

// ⑦ 耗气与结算同源：准备页的预判与结算扣的是同一个数。
const syncState = game.createNewState();
syncState.skills.jian.unlocked = true;
syncState.skills.jian.prof = 30000;
// 预判与结算要打同一关：段位只看走通了几关，所以逐段把进度摆到段首关再比。
syncState.resources.qi = 1e6;
for (const d of practice.STAGES) {
  syncState.skills.jian.cleared = d.from - 1;
  const guess = game.practiceCostOf(syncState, 'jian', d.from);
  const real = game.applyPractice(syncState, 'jian', 'C', { level: d.from, score: 0 }).qiCost;
  expect(guess === real, d.name + ' 预判 ' + guess + ' 点 = 结算扣除 ' + real + ' 点');
}

// ⑧ 灵力不足直接拒绝开局，不扣任何东西。
const poorState = game.createNewState();
poorState.skills.jian.unlocked = true;
// 摆到最后一关：那一段的耗气最贵，1 点灵力一定不够。
poorState.skills.jian.cleared = levels.LEVEL_MAX - 1;
poorState.resources.qi = 1;
const poor = game.applyPractice(poorState, 'jian', 'C', { level: levels.LEVEL_MAX, score: 0 });
expect(poor.ok === false && poor.lackQi > 0 && poorState.skills.jian.prof === 0
  && poorState.resources.qi === 1,
  '灵力不足被拦下（差 ' + poor.lackQi + ' 点），熟练度与灵力都没动');

// ⑨ 心法与悟性真的省气。
const saveState = game.createNewState();
saveState.skills.jian.unlocked = true;
saveState.skills.jian.prof = 30000;
saveState.resources.qi = 1e6;
const baseCost = game.practiceCostOf(saveState, 'jian', practice.STAGES[2].from);
saveState.skills.jingxin.unlocked = true;
saveState.skills.jingxin.prof = 6000;   // 精纯（特效 3/4）只为验证省气叠满，不再当作生效门槛
const savedCost = game.practiceCostOf(saveState, 'jian', practice.STAGES[2].from);
expect(savedCost < baseCost, '学了澄心默诵诀后耗气 ' + baseCost + ' → ' + savedCost + ' 点');

// ⑩ 到顶后熟练度封顶，但灵力照扣（到顶再练就是纯烧气）。
const cappedState = fullC.state;
cappedState.resources.qi = 1e6;
const qiBefore = cappedState.resources.qi;
const afterCap = game.applyPractice(cappedState, 'jian', 'S', { score: 123 });
expect(afterCap.gain === 0 && afterCap.comboNow === 1
  && cappedState.resources.qi === qiBefore - afterCap.qiCost
  && cappedState.skills.jian.prof === world.PROF_MAX,
  '到顶后熟练度不再涨，但灵力照扣 ' + afterCap.qiCost + ' 点、连 S 照记');

// ⑪ 参悟不再产出资源：结算里没有 qi / stone 这两个产出字段。
const prodState = game.createNewState();
prodState.skills.jian.unlocked = true;
prodState.resources.qi = 1e6;
const prodRun = game.applyPractice(prodState, 'jian', 'S', { score: 0 });
expect(prodRun.qi === undefined && prodRun.stone === undefined && prodRun.qiCost > 0,
  '参悟只耗不产：qiCost ' + prodRun.qiCost + ' 点，qi/stone 产出字段已不存在');

// ⑫ 失败：熟练度 0、断连，但烧掉的气不退。
const wipedState = game.createNewState();
wipedState.skills.jian.unlocked = true;
wipedState.sCombo.jian = 6;
wipedState.resources.qi = 200;
const wipedRun = game.applyPractice(wipedState, 'jian', 'F', { score: 0 });
expect(wipedRun.gain === 0 && wipedRun.comboNow === 0
  && wipedState.resources.qi === 200 - wipedRun.qiCost,
  '失败：熟练度 0、连 S 归零，已扣的 ' + wipedRun.qiCost + ' 点灵力不退');

// ⑬ 回关护栏：问的是「回打这一关，每点灵力换到的熟练度有没有高过打当前关」。
// **口径在 2026-11 改过一次，这里是新口径。** 旧口径是「6000 点预算下只刷第 1 关
// 不许反超逐关进」，它在 v9 之后其实一直不成立：段位耗气抬了四倍半、熟练度基数不动，
// 于是任何「停在低段反复刷」都比一路推进更省 —— 这是段成本曲线的性质，不是折减漏了。
// 折减能管、也该管的是**局部**：同一个当前关下，回打更低的关永远不划算。
for (const cur of [2, 21, 200, 800]) {
  const st = game.createNewState();
  st.skills.jian.unlocked = true;
  st.skills.jian.cleared = cur - 1;
  st.resources.qi = 1e6;
  const at = game.applyPractice(st, 'jian', 'S', { level: cur, score: 0 });
  const back = game.applyPractice(st, 'jian', 'S', { level: Math.max(1, cur - 1), score: 0 });
  const atRate = at.gain / at.qiCost;
  const backRate = back.gain / back.qiCost;
  expect(backRate <= atRate,
    '当前关 ' + cur + '：回打第 ' + (cur - 1) + ' 关每点灵力 ' + backRate.toFixed(2)
    + ' 高过当前关 ' + atRate.toFixed(2) + '（回关不该更划算）');
}
// 预算制下「只刷低关 vs 一路推进」的差值照实打出来：它不是护栏，是给人看的账。
console.log('  · 预算对照（随机评级、不算连 S）：只刷第 1 关 ' + easy.prof
  + ' / 逐关进 ' + auto.prof + ' / 回打半程 ' + belowOne.prof
  + ' —— 一路推进会走进贵段，随机评级下反而更少；靠连 S 的本事拿回来（见「全程不断 S」）。');
expect(decayed.prof < auto.prof,
  '金丹后练黄阶（耗气 ×' + economy.REALM_OVER + '）进度明显变慢（' + decayed.prof + ' vs ' + auto.prof + '）');
expect(di.profGain / Math.max(1, di.spent) > auto.profGain / Math.max(1, auto.spent) * 0.5,
  '地阶每点灵力的熟练度不该被品阶加价吃掉太多（'
  + (di.profGain / di.spent).toFixed(2) + ' vs ' + (auto.profGain / auto.spent).toFixed(2) + '）');

// ⑭ 切磋：先运功扣气，灵石按当日场次衰减，首胜另给 8 枚。
const battleState = game.createNewState();
battleState.resources.qi = 1e6;
battleState.realmIndex = 3;
for (const id of Object.keys(battleState.skills)) {
  battleState.skills[id].unlocked = true;
  battleState.skills[id].prof = world.PROF_MAX;
}
const list = opponents.OPPONENTS;
const c0 = list[0];
let firstBattle = null;
for (let i = 0; i < 200 && !firstBattle; i += 1) {
  const r = game.battle(battleState, c0.id);
  if (r.ok && r.win) firstBattle = r;
}
expect(!!firstBattle && firstBattle.firstClear && firstBattle.stone >= c0.reward.stone + economy.FIRST_CLEAR_STONE,
  '首胜另给 ' + economy.FIRST_CLEAR_STONE + ' 枚：这一场 ' + (firstBattle ? firstBattle.stone : 0) + ' 枚');
const qiBeforeBattle = battleState.resources.qi;
const second = game.battle(battleState, c0.id);
// 运功消耗不再是常数：养息式能把它压下来，所以断言的是「扣的与报的是同一个数」，
// 而不是「一定扣 5」。报了 2 却扣 5，比数值偏了更难查。
expect(second.ok && battleState.resources.qi === qiBeforeBattle - second.qiCost,
  '再来一场仍先运功扣气：报 ' + (second.ok ? second.qiCost : '?') + ' 实扣 '
  + (qiBeforeBattle - battleState.resources.qi));
// 但压不穿底线：这一场永远要真的付掉几点灵力，否则切磋就成了白打。
expect(second.ok && second.qiCost >= economy.BATTLE_QI - 3 && second.qiCost <= economy.BATTLE_QI,
  '运功消耗 ' + (second.ok ? second.qiCost : '?') + ' 不在 '
  + (economy.BATTLE_QI - 3) + '–' + economy.BATTLE_QI + ' 之间');
expect(second.stoneFactor <= 1 && second.battleNo >= 2,
  '第 ' + second.battleNo + ' 场系数 ' + second.stoneFactor + '（首胜之后开始衰减）');
const poorBattle = game.createNewState();
poorBattle.resources.qi = 0;
const refused = game.battle(poorBattle, c0.id);
expect(refused.ok === false && refused.lackQi > 0, '灵力不够时切磋直接拒绝，不许空手打');

console.log(bad === 0 ? '\n收支曲线检查全部通过' : '\n有 ' + bad + ' 项不达标，需要调数值');
process.exit(bad === 0 ? 0 : 1);
