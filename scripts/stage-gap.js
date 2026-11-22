'use strict';

// 段差审计：段与段到底差多少，段内还剩多少坡度。
//
// 用法：npm run audit:gap
//
// `difficulty-audit.js` 回答「五档有没有变」，这一份回答两个它管不着的问题：
//   ① 换段那一步，玩家摸到的是「新盘 / 新规则」还是「秒表又拧紧了一点」？
//   ② 段内逐关还在动吗，还是几百关一个参数都不变？
//
// 判据（与 docs/specs/plan/50-balance/05-欠账与待拍板台账 D11 / D16 同一套口径）：
//   - 段界结构变化：`buildParamsAt(m, b)` 与 `buildParamsAt(m, b-1)` 在结构键上有差。
//     结构键 = 盘面 / 数量 / 规则开关（`practice.LEVEL_STRUCT_KEYS` 那一路）。
//   - 段界倒退：结构键朝「更好过」的方向走（起手级变低、每级层数变多、封印变少……）。
//   - 段内可报变化率：`levelDelta` 非空（严口径，玩家在准备页真能读到「这一关变了什么」）。
//   - 冻结段：连续多少关 `buildParamsAt` 每个键都一模一样（不含 level / chapter / depth）。
//
// 只读，不改存档，不进 `npm run check`：它判的是设计口径，不是代码正确性。

const practice = require('../data/practice.js');
const levelData = require('../data/levels.js');

const BOUNDS = [11, 51, 201, 501];
const STRUCT = practice.LEVEL_STRUCT_KEYS;
// 这几个键数值变小才是变难（折数 2→1、提示 99→3、每级层数 8→6、命灯 3→1）。
const HARDER_WHEN_DOWN = new Set(['turns', 'hints', 'reshuffles', 'nearGap', 'linesPerLevel', 'hearts']);
// 谱型 / 纹样：换的是形状不是深度，两个方向都不判。
const NEUTRAL = new Set(['bar', 'bars', 'pattern', 'theme']);
// 额度类：数值越大越松，不参与「倒退」判定。
const SLACK_WHEN_UP = new Set(['maxOpt', 'budgetSlack']);
const SIG_IGNORE = new Set(['level', 'chapter', 'depth', 'stage']);

function at(m, lv) { return practice.buildParamsAt(m, lv); }

function structDiff(m, b) {
  const a = at(m, b - 1);
  const z = at(m, b);
  const changed = STRUCT.filter(function (k) {
    return typeof a[k] === 'number' && typeof z[k] === 'number' && a[k] !== z[k];
  });
  const back = changed.filter(function (k) {
    if (SLACK_WHEN_UP.has(k) || NEUTRAL.has(k)) return false;
    return HARDER_WHEN_DOWN.has(k) ? z[k] > a[k] : z[k] < a[k];
  }).map(function (k) { return k + ' ' + a[k] + '→' + z[k]; });
  return { changed: changed, back: back };
}

function density(m) {
  const out = [];
  for (let s = 0; s < levelData.STAGES.length; s += 1) {
    const r = levelData.stageRange(s);
    let n = 0;
    for (let lv = r.from; lv <= r.to; lv += 1) {
      const d = (practice.levelDelta(m, lv) || []).filter(function (x) {
        return x.key !== 'start' && x.key !== 'final';
      });
      if (d.length) n += 1;
    }
    out.push({ n: n, size: r.to - r.from + 1 });
  }
  return out;
}

function sig(m, lv) {
  const p = at(m, lv);
  return Object.keys(p).sort().filter(function (k) { return !SIG_IGNORE.has(k); })
    .map(function (k) { return k + '=' + p[k]; }).join(',');
}

// 最长的一段「参数一个字没变」。段内盘面是现抽的，但参数冻结意味着难度带没动。
function frozen(m) {
  let prev = sig(m, 1);
  let start = 1;
  let best = { n: 0, from: 1, to: 1 };
  const runs = [];
  for (let lv = 2; lv <= levelData.LEVEL_MAX; lv += 1) {
    const s = sig(m, lv);
    if (s === prev) continue;
    const n = lv - start;
    if (n > best.n) best = { n: n, from: start, to: lv - 1 };
    if (n >= 20) runs.push(n);
    prev = s;
    start = lv;
  }
  const tail = levelData.LEVEL_MAX - start + 1;
  if (tail > best.n) best = { n: tail, from: start, to: levelData.LEVEL_MAX };
  if (tail >= 20) runs.push(tail);
  return { best: best, runs: runs };
}

function pad(s, n) {
  const width = String(s).replace(/[^\x00-\xff]/g, 'xx').length;
  return String(s) + ' '.repeat(Math.max(1, n - width));
}

const rows = practice.PRACTICE_METHODS.map(function (m) {
  return {
    name: practice.GAME_LABELS[m.game] || m.game,
    diff: BOUNDS.map(function (b) { return structDiff(m, b); }),
    dens: density(m),
    frozen: frozen(m),
  };
});

console.log('== 段差审计：段界换没换东西 · 段内还剩多少坡度 ==');
console.log(pad('玩法', 14) + pad('段界换结构', 12) + pad('段界倒退', 10) + pad('最长冻结', 10)
  + '段内可报变化率（段1→段5）');
console.log('-'.repeat(104));
for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i];
  const ok = r.diff.filter(function (d) { return d.changed.length; }).length;
  const back = r.diff.filter(function (d) { return d.back.length; });
  const dens = r.dens.map(function (d) {
    return Math.round((d.n / d.size) * 100) + '%';
  }).join(' ');
  console.log(pad(r.name, 14) + pad(ok + '/' + BOUNDS.length, 12)
    + pad(back.length ? back.map(function (d) { return BOUNDS[r.diff.indexOf(d)]; }).join(',') : '—', 10)
    + pad(r.frozen.best.n + ' 关', 10) + dens);
}
console.log('-'.repeat(104));
console.log('段界换结构 = 那一步有盘面 / 数量 / 规则键在变（秒表与毫秒不算）。');
console.log('段界倒退 = 结构键朝更好过的方向走（起手级变低、每级层数变多、折数变多）；列的是关号。');
console.log('最长冻结 = 连续多少关 buildParamsAt 每个键都一样。段内盘面照抽，但难度带没动。');
console.log('段内可报变化率 = levelDelta 非空的关数 ÷ 本段关数（玩家在准备页真能读到「变了什么」）。');

const back = rows.filter(function (r) { return r.diff.some(function (d) { return d.back.length; }); });
const flat = rows.filter(function (r) { return r.diff.some(function (d) { return !d.changed.length; }); });
const freeze = rows.filter(function (r) { return r.frozen.best.n >= 20; })
  .sort(function (a, b) { return b.frozen.best.n - a.frozen.best.n; });

console.log('');
console.log('== 明细 ==');
if (flat.length) {
  console.log('段界没换结构：');
  flat.forEach(function (r) {
    const miss = r.diff.filter(function (d) { return !d.changed.length; })
      .map(function (d) { return BOUNDS[r.diff.indexOf(d)]; });
    console.log('  ' + r.name + ' 第 ' + miss.join(' / ') + ' 关');
  });
}
if (back.length) {
  console.log('段界倒退：');
  back.forEach(function (r) {
    r.diff.forEach(function (d, i) {
      if (d.back.length) console.log('  ' + r.name + ' 第 ' + BOUNDS[i] + ' 关：' + d.back.join(' | '));
    });
  });
}
if (freeze.length) {
  console.log('冻结 ≥20 关（后段顶到上限）：');
  freeze.forEach(function (r) {
    console.log('  ' + r.name + ' ' + r.frozen.best.from + '–' + r.frozen.best.to
      + '（' + r.frozen.best.n + ' 关）' + (r.frozen.runs.length > 1 ? '，另有 ' + (r.frozen.runs.length - 1) + ' 段' : ''));
  });
}
