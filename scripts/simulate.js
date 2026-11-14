'use strict';

// 收益曲线模拟：验证「熟练度」与「资源」两条线互不串台。
//   ① 熟练度 = 单局基础（C 10 / B 15 / A 23 / S 34 / F 0）+ 连 S 倍率
//      （第 k 连 S = round(34 × 1.5^(k-1))，10 层封顶）；每局独立取整，
//      低档局按档差逐档 ÷2 四舍五入、且不参与连 S；不吃品阶 / 难度 / 境界 / 属性；
//   ② 品阶 × 难度 × 境界 × 悟性 × 触类旁通，只连乘进灵气灵石。
// 用法：npm run sim（也可 node scripts/simulate.js）。固定种子的伪随机只用来模拟评级分布，
// 目的是在改数值前后可复现地比较曲线，不是预言真机数据。

const game = require('../utils/game.js');
const practice = require('../data/practice.js');
const world = require('../data/world.js');

// 各难度档的评级分布（经验值，真机数据出来后回来校准）。
const GRADE_DIST = {
  easy: { S: 0.25, A: 0.40, B: 0.25, C: 0.08, F: 0.02 },
  normal: { S: 0.20, A: 0.35, B: 0.30, C: 0.12, F: 0.03 },
  hard: { S: 0.13, A: 0.27, B: 0.35, C: 0.20, F: 0.05 },
  expert: { S: 0.08, A: 0.20, B: 0.35, C: 0.28, F: 0.09 },
  desperate: { S: 0.05, A: 0.15, B: 0.35, C: 0.33, F: 0.12 },
};

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

function expectedFactor(dist) {
  let sum = 0;
  for (const g of Object.keys(dist)) sum += dist[g] * world.GRADE_FACTOR[g];
  return sum;
}

// 资源基数期望：难度倍率 × 评级期望。评级只进灵气基数，倍数只由难度档给。
// 要求随档单调上升，否则玩家只会刷最简单档。
function expectedByDiff() {
  return practice.DIFFICULTIES.map(function (d) {
    return {
      key: d.key,
      name: d.name,
      mult: d.mult,
      expected: Math.round(d.mult * expectedFactor(GRADE_DIST[d.key]) * 1000) / 1000,
    };
  });
}

function run(opts) {
  const state = game.createNewState();
  state.skills[opts.skillId].unlocked = true;
  if (typeof opts.realmIndex === 'number') state.realmIndex = opts.realmIndex;
  const rng = makeRng(20261111);
  let profGain = 0;
  let sRuns = 0;
  let qi = 0;
  const marks = [];
  for (let i = 1; i <= opts.runs; i += 1) {
    const prof = state.skills[opts.skillId].prof;
    const maxIdx = practice.diffIndexOf(prof);
    let key;
    if (opts.mode === 'easy') key = 'easy';
    else if (opts.mode === 'below') key = practice.DIFFICULTIES[Math.max(0, maxIdx - 1)].key;
    else key = practice.DIFFICULTIES[maxIdx].key;
    const grade = pickGrade(rng, GRADE_DIST[key]);
    const r = game.applyPractice(state, opts.skillId, grade, { difficulty: key, score: 0 });
    profGain += r.gain;
    if (grade === 'S') sRuns += 1;
    qi += r.qi;
    if (i % 30 === 0) marks.push({ run: i, prof: state.skills[opts.skillId].prof, qi: qi });
  }
  return { profGain: profGain, sRuns: sRuns, qi: qi, marks: marks, prof: state.skills[opts.skillId].prof };
}

// 全 C 通关：一路按默认档（本门最高已解锁档）走，记录每段用了多少局。
function fullCRun() {
  const state = game.createNewState();
  state.skills.jian.unlocked = true;
  const milestones = [];
  for (let t = 1; t < world.TIERS.length; t += 1) milestones.push(null);
  let runs = 0;
  while (state.skills.jian.prof < world.PROF_MAX && runs < 20000) {
    const key = practice.DIFFICULTIES[practice.diffIndexOf(state.skills.jian.prof)].key;
    game.applyPractice(state, 'jian', 'C', { difficulty: key, score: 0 });
    runs += 1;
    for (let t = 1; t < world.TIERS.length; t += 1) {
      if (milestones[t - 1] === null && state.skills.jian.prof >= world.TIERS[t].threshold) {
        milestones[t - 1] = runs;
      }
    }
  }
  return { runs: runs, prof: state.skills.jian.prof, milestones: milestones, state: state };
}

// 全程不断 S：每局都打本门最高已解锁档，连击从第 1 连一路叠到封顶。
function fullSRun() {
  const state = game.createNewState();
  state.skills.jian.unlocked = true;
  const milestones = [];
  for (let t = 1; t < world.TIERS.length; t += 1) milestones.push(null);
  let runs = 0;
  let atTen = 0;
  while (state.skills.jian.prof < world.PROF_MAX && runs < 500) {
    const key = practice.DIFFICULTIES[practice.diffIndexOf(state.skills.jian.prof)].key;
    game.applyPractice(state, 'jian', 'S', { difficulty: key, score: 0 });
    runs += 1;
    if (runs === 10) atTen = state.skills.jian.prof;
    for (let t = 1; t < world.TIERS.length; t += 1) {
      if (milestones[t - 1] === null && state.skills.jian.prof >= world.TIERS[t].threshold) {
        milestones[t - 1] = runs;
      }
    }
  }
  return { runs: runs, prof: state.skills.jian.prof, milestones: milestones, atTen: atTen, state: state };
}

function fmt(n) { return String(n).padStart(7, ' '); }

console.log('== 单局基础与连 S 曲线（与品阶 / 难度 / 境界 / 属性无关）==');
console.log('  ' + Object.keys(world.PROF_BASE).map(function (g) {
  return g + ' ' + world.PROF_BASE[g] + ' 点';
}).join(' / ') + '  · 硬顶 ' + world.PROF_MAX);
console.log('  第 1～10 连 S：' + world.COMBO_TABLE.join(' / ')
  + ' 点 · 一轮 ' + world.COMBO_ROUND + ' 点 · 之后每局锁死 ' + world.COMBO_CAP_GAIN);

console.log('\n== 资源期望（难度倍率 × 评级期望）==');
const exp = expectedByDiff();
for (const e of exp) console.log('  ' + e.name + '  ×' + e.mult.toFixed(1) + '  期望 ' + e.expected.toFixed(3));

const fullC = fullCRun();
console.log('\n== 全 C 通关：按默认档一路走到大圆满 ==');
console.log('  段位        局数   门槛');
for (let t = 1; t < world.TIERS.length; t += 1) {
  console.log('  ' + world.TIERS[t].name.padEnd(10) + fmt(fullC.milestones[t - 1])
    + fmt(world.TIERS[t].threshold));
}

const fullS = fullSRun();
console.log('\n== 全程不断 S：按默认档一路走到大圆满 ==');
console.log('  段位        局数   门槛');
for (let t = 1; t < world.TIERS.length; t += 1) {
  console.log('  ' + world.TIERS[t].name.padEnd(10) + fmt(fullS.milestones[t - 1])
    + fmt(world.TIERS[t].threshold));
}

const RUNS = 120;
const strategies = [
  { name: '黄阶 · 只刷简单', skillId: 'jian', realmIndex: 0, mode: 'easy' },
  { name: '黄阶 · 逐档升', skillId: 'jian', realmIndex: 0, mode: 'auto' },
  { name: '黄阶 · 退一档刷', skillId: 'jian', realmIndex: 0, mode: 'below' },
  { name: '天阶 · 逐档升', skillId: 'taixu', realmIndex: 3, mode: 'auto' },
  { name: '黄阶 · 金丹后', skillId: 'jian', realmIndex: 2, mode: 'auto' },
];

console.log('\n== ' + RUNS + ' 局累计熟练度 ==');
console.log('  ' + ['策略', '第 30 局', '第 60 局', '第 90 局', '第 120 局'].join('   '));
const results = [];
for (const st of strategies) {
  const r = run({ skillId: st.skillId, realmIndex: st.realmIndex, runs: RUNS, mode: st.mode });
  results.push({ name: st.name, profGain: r.profGain, sRuns: r.sRuns, qi: r.qi, prof: r.prof });
  console.log('  ' + st.name.padEnd(16) + r.marks.map(function (m) { return fmt(m.prof); }).join('  '));
}
console.log('\n  熟练度构成（本局实得累计 / 其中 S 局数）与灵气：');
for (const r of results) {
  console.log('  ' + r.name.padEnd(16) + fmt(r.profGain) + ' / ' + fmt(r.sRuns)
    + ' = ' + fmt(r.prof) + '   灵气 ' + fmt(r.qi));
}

const easy = results[0];
const auto = results[1];
const belowOne = results[2];
const tian = results[3];
const decayed = results[4];

console.log('\n== 检查 ==');
let bad = 0;
function expect(cond, msg) {
  console.log('  ' + (cond ? 'OK  ' : 'FAIL') + ' ' + msg);
  if (!cond) bad += 1;
}

for (let i = 1; i < exp.length; i += 1) {
  expect(exp[i].expected > exp[i - 1].expected, exp[i].name + ' 的资源期望高于' + exp[i - 1].name);
}

// ① 全 C：一万局到 99999，每段局数正好是门槛 ÷ 10（最后一局补 9 点）。
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

// ①b 全程不断 S：前 10 局正好 3853 点，第 11 局起每局 1307，84 局毕业。
expect(fullS.atTen === world.COMBO_ROUND,
  '前 10 连累计 ' + fullS.atTen + ' 点，一轮应为 ' + world.COMBO_ROUND);
expect(fullS.runs === world.PROF_S_RUNS && world.PROF_S_RUNS === 84,
  '全程不断 S 用了 ' + fullS.runs + ' 局，理论最少 84 局');
expect(fullS.prof === world.PROF_MAX, '全程不断 S 最终到 ' + fullS.prof);
expect(fullS.runs < fullC.runs / 100,
  '全 S 与全 C 差了约 119 倍（' + fullS.runs + ' vs ' + fullC.runs + ' 局）');

// ② 连 S 曲线逐局复算：每局独立取整，第 11 连起锁死。
const comboState = game.createNewState();
comboState.skills.jian.unlocked = true;
comboState.skills.jian.prof = 24000;
const comboGains = [];
for (let i = 1; i <= 14; i += 1) {
  const r = game.applyPractice(comboState, 'jian', 'S', { difficulty: 'desperate', score: 0 });
  comboGains.push(r.gain);
  expect(r.gain === world.comboGain(i) && r.comboNow === Math.min(i, 10),
    '第 ' + i + ' 连 S：' + r.gain + ' 点 · 层数 ' + r.comboNow);
}
expect(comboGains.slice(10).every(function (g) { return g === world.COMBO_CAP_GAIN; }),
  '第 11～14 连都锁死 ' + world.COMBO_CAP_GAIN + ' 点');
expect(world.comboGain(4) !== Math.round(world.comboGain(3) * world.COMBO_STEP),
  '每局独立取整，不拿上一局整数接着乘');

// ②b 断连与收功：非 S / 走火 / breakCombo 都归零，下一局回到 34。
const breakState = game.createNewState();
game.applyPractice(breakState, 'jian', 'S', { difficulty: 'easy', score: 0 });
game.applyPractice(breakState, 'jian', 'S', { difficulty: 'easy', score: 0 });
const afterA = game.applyPractice(breakState, 'jian', 'A', { difficulty: 'easy', score: 0 });
expect(afterA.comboNow === 0 && afterA.gain === world.PROF_BASE.A, '非 S 归零并给固定基础值');
game.applyPractice(breakState, 'jian', 'S', { difficulty: 'easy', score: 0 });
game.breakCombo(breakState, 'jian');
const afterAbort = game.applyPractice(breakState, 'jian', 'S', { difficulty: 'easy', score: 0 });
expect(afterAbort.comboNow === 1 && afterAbort.gain === 34, '收功断连后下一局从 34 点重起');

// ③ 最高档基础值不受任何倍率影响：C 都是 10 点。
for (const d of practice.DIFFICULTIES) {
  const s = game.createNewState();
  s.skills.jian.unlocked = true;
  s.skills.jian.prof = d.need;   // 正好解锁这一档 = 最高档，不吃低档折减
  const r = game.applyPractice(s, 'jian', 'C', { difficulty: d.key, score: 0 });
  expect(r.gain === world.PROF_BASE.C,
    d.name + ' 档 C 仍是 ' + world.PROF_BASE.C + ' 点（实为 ' + r.gain + '）');
}
// ③b 退回低档：资源按 0.5^档差一次折完，熟练度逐档 ÷2 后四舍五入。
const ladder = [0.0625, 0.125, 0.25, 0.5, 1];
practice.DIFFICULTIES.forEach(function (d, i) {
  const st = game.createNewState();
  st.skills.jian.unlocked = true;
  st.skills.jian.prof = 24000;   // 最高已解锁档 = 绝境
  const r = game.applyPractice(st, 'jian', 'C', { difficulty: d.key, score: 0 });
  expect(r.diffBelowCapFactor === ladder[i]
    && r.gain === practice.profBelowCap(world.PROF_BASE.C, 24000, d.key),
    d.name + ' 折减复算：资源 ×' + r.diffBelowCapFactor + '，熟练度 ' + r.gain + ' 点');
});
expect(practice.profLadder(world.PROF_BASE.C).join(' / ') === '10 / 5 / 3 / 2 / 1',
  'C 逐档「÷2 四舍五入」= '
  + practice.profLadder(world.PROF_BASE.C).join(' / ') + ' 点');
// 低档局与连 S 解耦：不叠层、不砍连击收益、层数原样保留。
const lowCombo = game.createNewState();
lowCombo.skills.jian.unlocked = true;
lowCombo.skills.jian.prof = 1500;
game.applyPractice(lowCombo, 'jian', 'S', { difficulty: 'hard', score: 0 });
game.applyPractice(lowCombo, 'jian', 'S', { difficulty: 'hard', score: 0 });
const lowRound = game.applyPractice(lowCombo, 'jian', 'S', { difficulty: 'easy', score: 0 });
expect(lowRound.comboActive === false && lowRound.comboNow === 2
  && lowRound.gain === practice.profBelowCap(world.PROF_BASE.S, 1500, 'easy'),
  '低档 S 与连 S 解耦：不叠层、层数保留 2、收益 ' + lowRound.gain + ' 点');
const backTop = game.applyPractice(lowCombo, 'jian', 'S', { difficulty: 'hard', score: 0 });
expect(backTop.comboNow === 3 && backTop.gain === 77, '回最高档接上第 3 连 77 点');

const tierIds = { huang: 'jian', xuan: 'jingxin', di: 'wuxingzhen', tian: 'taixu' };
for (const tier of practice.TIERS) {
  const s = game.createNewState();
  const id = tierIds[tier.key];
  if (!s.skills[id]) continue;
  s.skills[id].unlocked = true;
  const r = game.applyPractice(s, id, 'C', { difficulty: 'easy', score: 0 });
  expect(r.gain === world.PROF_BASE.C, tier.label + ' C 仍是 ' + world.PROF_BASE.C + ' 点');
}
const decayState = game.createNewState();
decayState.skills.jian.unlocked = true;
decayState.realmIndex = 2;
const decayRun = game.applyPractice(decayState, 'jian', 'C', { difficulty: 'easy', score: 0 });
expect(decayRun.gain === world.PROF_BASE.C && decayRun.decayed,
  '境界衰减只砍资源，熟练度照给 ' + world.PROF_BASE.C + ' 点');

// ④ 到顶后熟练度封顶，资源、纪录、连 S 照常。
const cappedState = fullC.state;
const afterCap = game.applyPractice(cappedState, 'jian', 'S', { difficulty: 'desperate', score: 123 });
expect(afterCap.gain === 0 && afterCap.qi > 0 && afterCap.comboNow === 1
  && cappedState.skills.jian.prof === world.PROF_MAX,
  '到顶后熟练度不再涨（+' + afterCap.gain + '），灵气 ' + afterCap.qi + '、连 S 照常');

// ⑤ 品阶 / 难度 / 境界的倍率真的落在资源上。
expect(tian.qi > auto.qi, '天阶资源明显高于黄阶（' + tian.qi + ' vs ' + auto.qi + '）');
expect(decayed.qi < auto.qi * 0.5, '黄阶金丹后资源明显衰减（' + decayed.qi + ' vs ' + auto.qi + '）');
const lowRes = game.createNewState();
lowRes.skills.jian.unlocked = true;
lowRes.skills.jian.prof = 30000;
const lowQi = game.applyPractice(lowRes, 'jian', 'C', { difficulty: 'easy', score: 0 }).qi;
const highRes = game.createNewState();
highRes.skills.jian.unlocked = true;
highRes.skills.jian.prof = 30000;
const highQi = game.applyPractice(highRes, 'jian', 'C', { difficulty: 'desperate', score: 0 }).qi;
expect(lowQi * 8 < highQi, '退回四档后资源应被折到 1/16 量级（' + lowQi + ' vs ' + highQi + '）');

// ⑥ 只刷简单不反超逐档升：档差折减 + 连 S 只在最高档叠，两道闸都关着。
expect(easy.prof <= auto.prof,
  '只刷简单的总熟练度不该反超逐档升（' + easy.prof + ' vs ' + auto.prof + '）');
expect(belowOne.prof <= auto.prof,
  '退一档刷也不该反超逐档升（' + belowOne.prof + ' vs ' + auto.prof + '）');

// ⑦ 资源倍率封顶只防以后加系数，不许压正常最高组合。
const topState = game.createNewState();
topState.skills.taixu.unlocked = true;
topState.skills.taixu.prof = 30000;
topState.realmIndex = 3;
const top = game.applyPractice(topState, 'taixu', 'S', { difficulty: 'desperate', score: 0 });
expect(!top.capped, '正常最高组合（天阶 · 绝境 ×' + top.coreRaw + '）不该被资源封顶压住');

// ⑧ 走火整局作废，且断连。
const wipedState = game.createNewState();
wipedState.skills.jian.unlocked = true;
wipedState.sCombo.jian = 6;
const wipedRun = game.applyPractice(wipedState, 'jian', 'F', { difficulty: 'easy', score: 0 });
expect(wipedRun.gain === 0 && wipedRun.qi === 0 && wipedRun.stone === 0
  && wipedRun.comboNow === 0,
  '走火：熟练度 / 灵气 / 灵石一律 0，连 S 归零');

console.log(bad === 0 ? '\n收益曲线检查全部通过' : '\n有 ' + bad + ' 项不达标，需要调数值');
process.exit(bad === 0 ? 0 : 1);
