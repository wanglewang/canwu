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
    const key = mode === 'easy' ? 'easy' : practice.bestDifficulty(prof);
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
const tian = results[2];
const decayed = results[3];

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

// 单局最高收益不能离谱：天阶 + 绝境 + S 已被 MAX_MULTIPLIER 压住。
const topState = game.createNewState();
topState.skills.taixu.unlocked = true;
topState.skills.taixu.prof = 6000;
topState.realmIndex = 3;
const top = game.applyPractice(topState, 'taixu', 'S', { difficulty: 'desperate', score: 0 });
expect(top.capped === true && top.coreMult === world.MAX_MULTIPLIER, '极端组合被总倍率上限压住（×' + top.coreMult + '）');

// 已知问题，只报告不判失败：简单档 S 概率高，三连 S 的补额更容易触发，
// 熟练度可能反超逐档升；但正常收益（上表第一列）仍是逐档升更高。
if (easy.prof > auto.prof) {
  console.log('  WARN 只刷简单的熟练度反超逐档升：连 S 晋级补额在低难度更易触发，见 README 已知问题');
}

console.log(bad === 0 ? '\n收益曲线检查全部通过' : '\n有 ' + bad + ' 项不达标，需要调数值');
process.exit(bad === 0 ? 0 : 1);
