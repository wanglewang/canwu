'use strict';

// 收益曲线模拟：验证「难度档越高，期望收益越高」，并检查没有明显的最优解。
//
// 用法：npm run sim（也可 node scripts/simulate.js）
// 说明：这里用固定种子的伪随机模拟评级分布，不是真机数据；目的是在改数值前后
// 能复现地比较各策略曲线，而不是预言真实玩家的表现。

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

function expectedMult(dist) {
  let sum = 0;
  for (const g of Object.keys(dist)) sum += dist[g] * world.GRADE_FACTOR[g];
  return sum;
}

// 每档「倍率 × 预期评级」：doc 要求这个数随档位单调上升，否则玩家只会刷最简单档。
function expectedByDiff() {
  const out = [];
  for (const d of practice.DIFFICULTIES) {
    out.push({ key: d.key, name: d.name, mult: d.mult, expected: Math.round(d.mult * expectedMult(GRADE_DIST[d.key]) * 1000) / 1000 });
  }
  return out;
}

function run({ skillId, realmIndex, runs, mode }) {
  const state = game.createNewState();
  state.skills[skillId].unlocked = true;
  if (typeof realmIndex === 'number') state.realmIndex = realmIndex;
  const rng = makeRng(20261111);
  let total = 0;
  let promoted = 0;
  const marks = [];
  for (let i = 1; i <= runs; i += 1) {
    const prof = state.skills[skillId].prof;
    // three modes: 只刷简单 / 只退一档 / 逐档升（默认最高已解锁档，也是准备页的默认值）
    const maxIdx = practice.diffIndexOf(prof);
    let key;
    if (mode === 'easy') key = 'easy';
    else if (mode === 'below') key = practice.DIFFICULTIES[Math.max(0, maxIdx - 1)].key;
    else key = practice.DIFFICULTIES[maxIdx].key;
    const grade = pickGrade(rng, GRADE_DIST[key]);
    const r = game.applyPractice(state, skillId, grade, { difficulty: key, score: 0 });
    total += r.gain;
    promoted += r.promotionGain;
    if (i % 30 === 0) marks.push({ run: i, prof: state.skills[skillId].prof, gain: total });
  }
  return { total: total, promoted: promoted, marks: marks, prof: state.skills[skillId].prof };
}

function fmt(n) { return String(n).padStart(6, ' '); }

const RUNS = 120;
const strategies = [
  { name: '黄阶 · 只刷简单', skillId: 'jian', realmIndex: 0, mode: 'easy' },
  { name: '黄阶 · 逐档升', skillId: 'jian', realmIndex: 0, mode: 'auto' },
  { name: '黄阶 · 退一档刷', skillId: 'jian', realmIndex: 0, mode: 'below' },
  { name: '天阶 · 逐档升', skillId: 'taixu', realmIndex: 3, mode: 'auto' },
  { name: '黄阶 · 金丹后', skillId: 'jian', realmIndex: 2, mode: 'auto' },
];

console.log('== 各难度档期望收益（倍率 × 评级期望）==');
const exp = expectedByDiff();
for (const e of exp) console.log('  ' + e.name + '  ×' + e.mult.toFixed(1) + '  期望 ' + e.expected.toFixed(3));

console.log('\n== ' + RUNS + ' 局熟练度曲线 ==');
const header = ['策略'];
for (let i = 30; i <= RUNS; i += 30) header.push('第 ' + i + ' 局');
console.log('  ' + header.join('  '));
const results = [];
for (const st of strategies) {
  const r = run({ skillId: st.skillId, realmIndex: st.realmIndex, runs: RUNS, mode: st.mode });
  results.push({ name: st.name, total: r.total, promoted: r.promoted, prof: r.prof });
  console.log('  ' + st.name.padEnd(16) + r.marks.map(function (m) { return fmt(m.prof); }).join('  '));
}

// 熟练度 = 正常收益 + 三连 S 直接晋级的补额。两者分开看，才知道曲线是被哪一截抬起来的。
console.log('\n== 熟练度构成（正常收益 / 三连 S 补额）==');
for (const r of results) {
  console.log('  ' + r.name.padEnd(16) + fmt(r.total) + ' / ' + fmt(r.promoted) + ' = ' + fmt(r.prof));
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
  expect(exp[i].expected > exp[i - 1].expected, exp[i].name + ' 的期望收益高于' + exp[i - 1].name);
}
expect(auto.total > easy.total * 1.2, '逐档升的累计熟练度明显高于只刷简单（' + auto.total + ' vs ' + easy.total + '）');
expect(tian.total > auto.total, '天阶累计高于黄阶（' + tian.total + ' vs ' + auto.total + '）');
expect(decayed.total < auto.total * 0.5, '黄阶在金丹后明显衰减（' + decayed.total + ' vs ' + auto.total + '）');
// 取消「同一门连练递减」后重标定：6000 就是大圆满，之后不再解锁段位 / 难度 / 属性，
// 多出来的只是数字。护栏只防数值失控，不再拿旧阈值假装曲线被压住。
expect(tian.prof >= 6000, '天阶 ' + RUNS + ' 局能练到大圆满（' + tian.prof + '）');
expect(tian.prof <= 80000, '天阶 ' + RUNS + ' 局数值不失控（' + tian.prof + '）');

// 封顶只防以后新增系数叠加，不许压正常组合：压到 8.0 时天阶的困难 / 极难 / 绝境
// 收益全部并列 8.0，最高两档就只剩挑战意义、没有收益意义。原来这里只验了单个品阶的
// 期望，正好漏掉这一类，现在按品阶逐档验一遍。
const topState = game.createNewState();
topState.skills.taixu.unlocked = true;
topState.skills.taixu.prof = 6000;
topState.realmIndex = 3;
const top = game.applyPractice(topState, 'taixu', 'S', { difficulty: 'desperate', score: 0 });
expect(!top.capped, '正常最高组合（天阶 · 绝境 · S = ×' + top.coreRaw + '）不该被封顶压住');
for (const tier of practice.TIERS) {
  const raws = practice.DIFFICULTIES.map(function (d) {
    return tier.reward * d.mult * world.GRADE_FACTOR.S;
  });
  const mono = raws.every(function (v, i) { return i === 0 || v > raws[i - 1]; });
  expect(mono && raws[raws.length - 1] <= world.MAX_MULTIPLIER,
    tier.label + '：五档 S 收益一档比一档高且不撞封顶（'
    + raws.map(function (v) { return v.toFixed(2); }).join(' < ') + '）');
}

// 低档两件事共用一根尺子：收益 ×0.5、S 不计连晋。守的是「奖励要奖励难度」——
// 修之前只刷简单靠补额反超逐档升（8424 vs 7339），只砍连 S 时仍有 4691。
expect(easy.prof <= auto.prof,
  '只刷简单的总熟练度不该反超逐档升（' + easy.prof + ' vs ' + auto.prof + '）');
expect(belowOne.prof <= auto.prof,
  '退一档刷也不该反超逐档升（' + belowOne.prof + ' vs ' + auto.prof + '）');

// 界线要能一句话讲给玩家：折半之后，普通档打个 C 就比简单档拿 S 多。
const easyS = practice.DIFFICULTIES[0].mult * practice.DIFF_BELOW_CAP * world.GRADE_FACTOR.S;
const normalC = practice.DIFFICULTIES[1].mult * world.GRADE_FACTOR.C;
expect(easyS < normalC,
  '折半后简单档 S（×' + easyS.toFixed(2) + '）低于普通档 C（×' + normalC.toFixed(2) + '）');

console.log(bad === 0 ? '\n收益曲线检查全部通过' : '\n有 ' + bad + ' 项不达标，需要调数值');
process.exit(bad === 0 ? 0 : 1);
