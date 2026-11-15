'use strict';

// 难度区分度审计（只读，不改存档、不进 npm run check 的断言链）。
//
// 用法：npm run audit:diff
//
// 它回答一个静态断言回答不了的问题：五档「简单 / 普通 / 困难 / 极难 / 绝境」
// 对某一门功课来说，究竟改了什么？若只有评级线在变，玩家从第一秒到最后一秒
// 的操作对象、盘面、容错全一样，那一档就只是「结算时乘个数」，不是难度。
//
// 判据取自 docs/checklist-puzzle.md 第三节「难度系统」与第五节「评级标准可查」：
//   ① 每档至少两个玩家看得见的参数在变（盘面 / 预算 / 容错 / 节奏）；
//   ② 评级线随档变，或盘面规格随档变（否则说明页五档写同一行，玩家没法对照）。
// 不判「变得够不够难」——那要真机与收益曲线，静态只负责把「压根没变」揪出来。
//
// 另外报一列「主轴跨度」：五档里变化最大的那个参数，最大值 ÷ 最小值。
// 这一列不是断言，是给人看的——「有变化」和「变得够」是两件事。
// 滑格相合 8 倍、顺光扫斩 1.15 倍，在旧判据下都判「过」，可玩家感受完全不同。
// 经验值：跨度 1.7 倍摊到五档，每档 11%，玩家能明确说出「这档更紧」；
// 1.15 倍摊下来每档只有 3.5%，落在可辨阈值以下，等于五档一个手感。

const practice = require('../data/practice.js');
const index = require('../minigames/index.js');

const KEYS = ['easy', 'normal', 'hard', 'expert', 'desperate'];
// 唯一的内部键（档位索引）。名单住在 data/practice.js，审计与 rank.test 读同一份，
// 不许各抄一遍——曾经这里多出 gear / sBase / sStep 三个根本不存在的键。
const INTERNAL = new Set(practice.INTERNAL_PARAM_KEYS);

// 一个参数在五档间的跨度。只认数值：布尔（要不要重排）与字符串（哪张图）算不出来，
// 它们的变化已经由「可见参数」那一列体现。
function spanOf(params, k) {
  const vals = params.map(function (p) { return p[k]; }).filter(function (v) { return typeof v === 'number'; });
  if (vals.length < 2) return 0;
  const lo = Math.min.apply(null, vals);
  const hi = Math.max.apply(null, vals);
  if (lo <= 0) return 0;
  return hi / lo;
}

function audit(method) {
  const params = KEYS.map(function (k) { return practice.buildParams(method, k); });
  const all = new Set();
  for (let i = 0; i < params.length; i += 1) {
    Object.keys(params[i]).forEach(function (k) { all.add(k); });
  }
  const vary = [];
  all.forEach(function (k) {
    if (INTERNAL.has(k)) return;
    const seen = new Set(params.map(function (p) { return JSON.stringify(p[k]); }));
    if (seen.size > 1) vary.push(k);
  });
  let top = { k: '', r: 0 };
  vary.forEach(function (k) {
    const r = spanOf(params, k);
    if (r > top.r) top = { k: k, r: r };
  });
  const lines = params.map(function (p, i) {
    try {
      const r = index.MODULES[method.game].lines(p, practice.difficultyOf(KEYS[i]).gear);
      return (r.items || []).join('|');
    } catch (e) {
      return 'ERR ' + e.message;
    }
  });
  const lineVariants = new Set(lines).size;
  // 盘面规格变了也算「评级线有对照」：九宫 / 阵灯 / 目术的难写在盘上，不写在数字上。
  const boardChanged = vary.some(function (k) { return /size|holes|minSteps|hiSteps|budgetSlack|level/.test(k); });
  return {
    game: method.game,
    name: practice.GAME_LABELS[method.game] || method.game,
    vary: vary,
    top: top,
    lineVariants: lineVariants,
    ok: vary.length >= 2 && (lineVariants > 1 || boardChanged),
  };
}

function pad(s, n) {
  // 中文按两格宽算，表格才对得齐。
  const width = String(s).replace(/[^\x00-\xff]/g, 'xx').length;
  return String(s) + ' '.repeat(Math.max(1, n - width));
}

const rows = practice.PRACTICE_METHODS.map(audit);
console.log('== 五档难度区分度审计 ==');
console.log(pad('玩法', 14) + pad('可见参数', 10) + pad('评级线', 8)
  + pad('主轴跨度', 22) + pad('结论', 8) + '会变的字段');
console.log('-'.repeat(104));
for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i];
  const spanText = r.top.r ? r.top.r.toFixed(2) + '× ' + r.top.k : '—';
  const thin = r.top.r > 0 && r.top.r < 2 ? '*' : ' ';
  console.log(pad(r.name, 14) + pad(r.vary.length, 10) + pad(r.lineVariants + ' 种', 8)
    + pad(spanText, 22) + pad(thin + (r.ok ? '过' : '★ 欠'), 8) + r.vary.join(', '));
}
const weak = rows.filter(function (r) { return !r.ok; });
const thinRows = rows.filter(function (r) { return r.top.r > 0 && r.top.r < 2; });
console.log('-'.repeat(104));
console.log('共 ' + rows.length + ' 门，区分度不足 ' + weak.length + ' 门：'
  + (weak.map(function (r) { return r.name; }).join('、') || '无'));
console.log('* 主轴跨度不足 2 倍（' + thinRows.length + ' 门）：'
  + (thinRows.map(function (r) { return r.name; }).join('、') || '无'));
console.log('注：审计只看「有没有变」，不看「变得合不合理」；后者见 docs/checklist-puzzle.md 与真机验收。');
console.log('    主轴跨度 = 五档里变化最大的那个参数的最大值 ÷ 最小值。它不是断言，是给人看的：');
console.log('    1.7 倍摊到五档每档 11%（玩家能说出「这档更紧」），1.15 倍每档只有 3.5%（等于没变）。');
console.log('    跨度小不一定是错——时间轴本来就压不了太多，压很了是「不可能」不是「难」；');
console.log('    但这时就该换一根承重轴了（复杂度 / 信息 / 规模），而不是把时间再往下拧。');
