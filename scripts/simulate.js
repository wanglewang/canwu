'use strict';

// 收支曲线模拟：验证「进度」与「灵力」这两条线各自的形状，以及两者之间的兑换比。
//   ① 进度 = 这门走通了几关（skills[id].cleared，0–1000）。一局只推一关，
//      评级再高也不多推——S 与 C 的唯一差别是结算观感与 30 分钟挂机加成。
//      段位（未入门…大圆满）就是这条线的位置，门槛直接取段界关 10/50/200/500/1000；
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

// 固定灵力预算下能推几关。预算制而不是局数制，是因为灵力才是约束。
// 三种刷法都用「打第几关」表达：auto = 本门当前关；first = 永远打第 1 关；
// half = 回打当前关的一半。**只有 auto 会推进度**——回关不推，这是这条成长线的地基。
function runBudget(opts) {
  const state = game.createNewState();
  state.skills[opts.skillId].unlocked = true;
  if (typeof opts.realmIndex === 'number') state.realmIndex = opts.realmIndex;
  state.resources.qi = opts.budget;
  const rng = makeRng(20261111);
  let runs = 0;
  let sRuns = 0;
  let spent = 0;
  while (spent < opts.budget && runs < 5000) {
    const rec = state.skills[opts.skillId];
    const frontier = frontierOf(rec);
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
    if (grade === 'S') sRuns += 1;
    spent += r.qiCost;
    runs += 1;
  }
  return {
    steps: state.skills[opts.skillId].cleared,
    sRuns: sRuns, runs: runs, spent: spent,
    state: state,
  };
}

// 一路打本门当前关走完 1000 关。grade 只传一种：这条曲线要证明的正是
// 「评级不改进度」——全 C 与全 S 都是 1000 局，烧的气也一分不差。
// 记录每一档是在第几局到达的，用来核对「门槛 = 段界关」。
function walkAll(grade) {
  const state = game.createNewState();
  state.skills.jian.unlocked = true;
  state.resources.qi = 1e9;   // 预算另算：这条曲线只看「多少局」，气由 spent 单独累计
  const milestones = [];
  for (let t = 1; t < world.TIERS.length; t += 1) milestones.push(null);
  let runs = 0;
  let spent = 0;
  while (state.skills.jian.cleared < levels.LEVEL_MAX && runs < 3000) {
    const f = frontierOf(state.skills.jian);
    const r = game.applyPractice(state, 'jian', grade, { level: f.level, score: 0 });
    spent += r.qiCost;
    runs += 1;
    for (let t = 1; t < world.TIERS.length; t += 1) {
      if (milestones[t - 1] === null && state.skills.jian.cleared >= world.TIERS[t].threshold) {
        milestones[t - 1] = runs;
      }
    }
  }
  return { runs: runs, cleared: state.skills.jian.cleared, milestones: milestones, spent: spent, state: state };
}

function fmt(n) { return String(n).padStart(7, ' '); }

console.log('== 一门 1000 关：进度只有「走通一关推一关」这一条 ==');
console.log('  段位门槛：' + world.TIERS.map(function (t) { return t.name + ' ' + t.threshold; }).join(' / '));
console.log('  走完 1000 关恒为 1000 局——S 与 C 只差结算观感与挂机加成，不换关数。');
console.log('  熟练度 / 连 S 那一整套已删（存档 v10），这里没有任何点数曲线可算。');

console.log('\n== 五段耗气（黄阶 · 悟性 0 · 不换门 · 未超上限 · 各段首关）==');
const qiTable = qiByDiff('jian');
for (const q of qiTable) {
  console.log('  ' + q.name + '  基数 ' + String(q.base).padStart(3) + ' → 实价 '
    + String(q.cost).padStart(3) + ' 点（剑法时长系数 + 悟性 10）· 每点灵力推 '
    + (1 / q.cost).toFixed(3) + ' 关');
}
console.log('  单价随段上升是刻意的：往后走每一关都更贵，灵力（与灵石）才是真约束。');
console.log('  闭关 ' + QI_PER_MIN + ' 点/分：8 小时产能 ' + QI_PER_CAP + ' 点，但炼气气海只装 '
  + OPEN_QI_CAP + ' 点（' + FILL_HOURS + ' 小时即满，溢出 ' + (QI_PER_CAP - OPEN_QI_CAP) + ' 点收不到）');
console.log('  一池灵力 = 圆满 ' + Math.floor(OPEN_QI_CAP / qiTable[4].cost)
  + ' 局 / 小成 ' + Math.floor(OPEN_QI_CAP / qiTable[2].cost) + ' 局'
  + '；想把一池练大，靠破境（气海 150→620）与真元（每点 +2）。');

// 天阶 2026-11 起没有功法，最贵的一档落到地阶（×1.3）。
console.log('\n== 地阶对照（时长系数与品阶一起抬价）==');
const diTable = qiByDiff('zhen');
for (let i = 0; i < diTable.length; i += 1) {
  console.log('  ' + diTable[i].name.padEnd(6) + ' 黄阶 ' + String(qiTable[i].cost).padStart(3)
    + ' → 地阶 ' + String(diTable[i].cost).padStart(3)
    + '  （×' + (diTable[i].cost / qiTable[i].cost).toFixed(2) + '）');
}

const fullC = walkAll('C');
console.log('\n== 全 C 走完 1000 关：一路打本门当前关 ==');
console.log('  段位        局数   门槛');
for (let t = 1; t < world.TIERS.length; t += 1) {
  console.log('  ' + world.TIERS[t].name.padEnd(10) + fmt(fullC.milestones[t - 1])
    + fmt(world.TIERS[t].threshold));
}
console.log('  共烧灵力 ' + fullC.spent + ' 点 ≈ 闭关 ' + Math.round(fullC.spent / QI_PER_MIN / 60) + ' 小时');

const fullS = walkAll('S');
console.log('\n== 全 S 走完 1000 关：对照「评级不换进度」==');
console.log('  局数 ' + fullS.runs + '（与全 C 相同）· 烧气 ' + fullS.spent
  + ' 点（与全 C 相同，耗气与评级无关）');

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
  + Math.round(BUDGET / QI_PER_MIN / 60) + ' 小时）：各刷法能推几关 ==');
const results = [];
for (const st of strategies) {
  const r = runBudget({ skillId: st.skillId, realmIndex: st.realmIndex, budget: BUDGET, mode: st.mode });
  results.push({ name: st.name, steps: r.steps, sRuns: r.sRuns, runs: r.runs, spent: r.spent });
  console.log('  ' + st.name.padEnd(16) + ' ' + fmt(r.runs) + ' 局 · 推了 ' + fmt(r.steps) + ' 关'
    + ' · 每关 ' + (r.spent / Math.max(1, r.steps)).toFixed(0) + ' 点灵力');
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
    // 这里只是拿一个黄阶法门的基数复算五段耗气表，用哪一门不影响结论；
    // 但 id 必须是真 id——`getMethod` 对未知 id 会静默回落到第一门，写错了也不会报。
    stageIndex: i, tierKey: 'huang', methodBase: practice.getMethod('forge').base,
    wu: world.getWorld().baseAttributes.wu,
  });
  expect(qiTable[i].cost === want,
    qiTable[i].name + ' 实价 ' + qiTable[i].cost + ' = 基数 × 时长系数 ÷ 悟性（应为 ' + want + '）');
  if (i > 0) expect(qiTable[i].cost > qiTable[i - 1].cost,
    qiTable[i].name + ' 比 ' + qiTable[i - 1].name + ' 贵（' + qiTable[i].cost + ' vs ' + qiTable[i - 1].cost + '）');
}
expect(diTable[4].cost > qiTable[4].cost, '地阶圆满比黄阶圆满贵（' + diTable[4].cost + ' vs ' + qiTable[4].cost + '）');

// ② 全 C 与全 S 都是 1000 局：评级不再换进度，也不该换烧气。
expect(fullC.cleared === levels.LEVEL_MAX,
  '全 C 最终走到 ' + fullC.cleared + ' / ' + levels.LEVEL_MAX + ' 关');
expect(fullC.runs === levels.LEVEL_MAX,
  '全 C 走完用了 ' + fullC.runs + ' 局（一门 1000 关就该 1000 局）');
expect(fullS.runs === fullC.runs,
  '全 S 与全 C 局数应当相同（实为 ' + fullS.runs + ' vs ' + fullC.runs + '）：评级不换进度');
expect(fullS.spent === fullC.spent,
  '全 S 与全 C 烧气应当相同（实为 ' + fullS.spent + ' vs ' + fullC.spent + ' 点）：耗气不受评级影响');
// 每一档都在门槛那一局到达：段位是读出来的，不是额外发的。
for (let t = 1; t < world.TIERS.length; t += 1) {
  expect(fullC.milestones[t - 1] === world.TIERS[t].threshold,
    world.TIERS[t].name + ' 应在第 ' + world.TIERS[t].threshold + ' 局（实为 ' + fullC.milestones[t - 1] + '）');
}

// ③ 进度与评级完全解耦：四档评级在同一关都只推一关。
for (const g of ['S', 'A', 'B', 'C']) {
  const st = game.createNewState();
  st.skills.jian.unlocked = true;
  st.resources.qi = 1e6;
  const r = game.applyPractice(st, 'jian', g, { score: 0 });
  expect(r.advanced === true && st.skills.jian.cleared === 1,
    g + ' 走通当前关 → 已走通 ' + st.skills.jian.cleared + ' 关');
}

// ③b 失败与回关都不推进度。
const failState = game.createNewState();
failState.skills.jian.unlocked = true;
failState.skills.jian.cleared = 40;
failState.resources.qi = 1e6;
const failRun = game.applyPractice(failState, 'jian', 'F', { level: 41, score: 0 });
expect(failRun.advanced === false && failState.skills.jian.cleared === 40,
  '失败：进度停在 ' + failState.skills.jian.cleared + ' 关，气照烧 ' + failRun.qiCost + ' 点');
const backRun = game.applyPractice(failState, 'jian', 'S', { level: 10, score: 0 });
expect(backRun.advanced === false && failState.skills.jian.cleared === 40,
  '回关到第 10 关：进度仍是 ' + failState.skills.jian.cleared + ' 关');

// ④ 各段首关都只推一关：段位不额外发关，也不额外罚关。
for (const d of practice.STAGES) {
  const st = game.createNewState();
  st.skills.jian.unlocked = true;
  st.skills.jian.cleared = d.from - 1;
  st.resources.qi = 1e6;
  const r = game.applyPractice(st, 'jian', 'C', { level: d.from, score: 0 });
  expect(r.advanced === true && st.skills.jian.cleared === d.from,
    d.name + ' 段首关走通 → 已走通 ' + st.skills.jian.cleared + ' 关（应为 ' + d.from + '）');
}

// ④b 回关：不推进度，耗气按这一关所在段照算——回关不便宜，才没有「停着刷」的路。
const curTop = 21;   // 已走通 20 关 → 当前关 21（入门段 11）
[21, 15, 10, 5, 1].forEach(function (lv) {
  const st = game.createNewState();
  st.skills.jian.unlocked = true;
  st.skills.jian.cleared = curTop - 1;
  st.resources.qi = 1e6;
  const r = game.applyPractice(st, 'jian', 'C', { level: lv, score: 0 });
  const isCurrent = lv >= curTop;
  expect(r.advanced === isCurrent && st.skills.jian.cleared === (isCurrent ? curTop : curTop - 1),
    '打第 ' + lv + ' 关：' + (isCurrent ? '推进一关' : '回关不推') + '，耗气按本段 ' + r.qiCost + ' 点');
});

// ⑤ 品阶只影响耗气与属性，不推进度：各阶 C 都只 +1 关，但价目不同。
// 天阶 2026-11 起没有功法，所以只核到地阶 —— 「四阶」那句话现在只剩三阶有实测。
const tierIds = { huang: 'jian', xuan: 'jingxin', di: 'zhen' };
const tierCost = {};
for (const tier of practice.TIERS) {
  const s2 = game.createNewState();
  const id = tierIds[tier.key];
  if (!s2.skills[id]) continue;
  s2.skills[id].unlocked = true;
  s2.resources.qi = 1e6;
  // 各阶都摆到「刚好到门槛」的境界：未到门槛现在直接拒绝开局，测耗气就进不去了。
  s2.realmIndex = tier.needRealm - 1;
  const r = game.applyPractice(s2, id, 'C', { score: 0 });
  tierCost[tier.key] = r.qiCost;
  expect(r.advanced === true && s2.skills[id].cleared === 1,
    tier.label + ' 走通一关 → 已走通 ' + s2.skills[id].cleared + ' 关');
}
expect(tierCost.huang < tierCost.di,
  '地阶比黄阶费气（' + tierCost.di + ' vs ' + tierCost.huang + ' 点）');

// ⑥ 境界超上限只加价，不禁练，也不减进度。
const decayState = game.createNewState();
decayState.skills.jian.unlocked = true;
decayState.realmIndex = 2;
decayState.resources.qi = 1e6;
const decayRun = game.applyPractice(decayState, 'jian', 'C', { score: 0 });
expect(decayRun.advanced === true && decayRun.realmAbove && decayRun.realmOverCost === economy.REALM_OVER,
  '境界超上限：进度照推一关，耗气 ×' + decayRun.realmOverCost);
expect(decayRun.qiCost > qiTable[0].cost,
  '金丹期练黄阶第 1 关要 ' + decayRun.qiCost + ' 点，比标价 ' + qiTable[0].cost + ' 贵');

// ⑦ 耗气与结算同源：准备页的预判与结算扣的是同一个数。
const syncState = game.createNewState();
syncState.skills.jian.unlocked = true;
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
expect(poor.ok === false && poor.lackQi > 0
  && poorState.skills.jian.cleared === levels.LEVEL_MAX - 1
  && poorState.resources.qi === 1,
  '灵力不足被拦下（差 ' + poor.lackQi + ' 点），进度与灵力都没动');

// ⑨ 心法与悟性真的省气。
const saveState = game.createNewState();
saveState.skills.jian.unlocked = true;
saveState.skills.jian.cleared = 400;
saveState.resources.qi = 1e6;
const baseCost = game.practiceCostOf(saveState, 'jian', practice.STAGES[2].from);
saveState.skills.jingxin.unlocked = true;
saveState.skills.jingxin.cleared = 200;   // 大成（特效 3/4）：只为验证省气叠满
const savedCost = game.practiceCostOf(saveState, 'jian', practice.STAGES[2].from);
expect(savedCost < baseCost, '学了澄心默诵诀后耗气 ' + baseCost + ' → ' + savedCost + ' 点');

// ⑩ 走到 1000 关就到顶：进度不再涨，但灵力照扣（到顶再练就是纯烧气）。
const cappedState = fullC.state;
cappedState.resources.qi = 1e6;
const qiBefore = cappedState.resources.qi;
const afterCap = game.applyPractice(cappedState, 'jian', 'S', { score: 123 });
expect(afterCap.advanced === false
  && cappedState.resources.qi === qiBefore - afterCap.qiCost
  && cappedState.skills.jian.cleared === levels.LEVEL_MAX,
  '到顶后进度不再涨，但灵力照扣 ' + afterCap.qiCost + ' 点');

// ⑪ 参悟不再产出资源：结算里没有 qi / stone 这两个产出字段。
const prodState = game.createNewState();
prodState.skills.jian.unlocked = true;
prodState.resources.qi = 1e6;
const prodRun = game.applyPractice(prodState, 'jian', 'S', { score: 0 });
expect(prodRun.qi === undefined && prodRun.stone === undefined && prodRun.qiCost > 0,
  '参悟只耗不产：qiCost ' + prodRun.qiCost + ' 点，qi/stone 产出字段已不存在');

// ⑫ 失败：进度不动，但烧掉的气不退。
const wipedState = game.createNewState();
wipedState.skills.jian.unlocked = true;
wipedState.skills.jian.cleared = 30;
wipedState.resources.qi = 200;
const wipedRun = game.applyPractice(wipedState, 'jian', 'F', { score: 0 });
expect(wipedRun.advanced === false && wipedState.skills.jian.cleared === 30
  && wipedState.resources.qi === 200 - wipedRun.qiCost,
  '失败：进度停在 30 关，已扣的 ' + wipedRun.qiCost + ' 点灵力不退');

// ⑬ 回关护栏：问的是「回打这一关，每点灵力换到的进度有没有高过打当前关」。
// 现在这条护栏是结构性的、不是系数性的：回关的进度恒为 0，所以「往回刷」永远 0 收益。
// 预算实验里那两条曲线（只刷第 1 关 / 退一章）实测只推得动第一关，就是它的证据。
console.log('  · 预算对照（随机评级）：只刷第 1 关推 ' + easy.steps
  + ' 关 / 逐关进推 ' + auto.steps + ' 关 / 回打半程推 ' + belowOne.steps
  + ' 关 —— 回关不推进度，两条「往回刷」的路都卡在第 1 关。');
expect(easy.steps === 1, '只刷第 1 关推了 ' + easy.steps + ' 关（应恒为 1：第 2 局起就是回关）');
expect(belowOne.steps === 1, '回打半程推了 ' + belowOne.steps + ' 关（应恒为 1）');
expect(auto.steps > easy.steps, '逐关进比只刷第 1 关多推关（' + auto.steps + ' vs ' + easy.steps + '）');
expect(decayed.steps <= auto.steps,
  '金丹后练黄阶（耗气 ×' + economy.REALM_OVER + '）也推得动，只比逐关进少一点（' + decayed.steps + ' vs ' + auto.steps + ' 关）');
// 地阶更贵，所以同一个预算推的关数不多于黄阶；但差价被「品阶不改进度」这一点兜住，
// 也就是说贵只体现在「要花更多灵力」，不体现在「推得更少」之外的任何地方。
expect(di.steps <= auto.steps + 2,
  '地阶同预算推 ' + di.steps + ' 关 vs 黄阶 ' + auto.steps + ' 关，只贵一档、推得略少');

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
