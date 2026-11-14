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

const practice = require('../data/practice.js');
const index = require('../minigames/index.js');

const KEYS = ['easy', 'normal', 'hard', 'expert', 'desperate'];
// 这三个是内部档位索引 / 系数来源，不是玩家在盘上看得见的东西。
const INTERNAL = new Set(['depth', 'gear', 'sBase', 'sStep']);

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
  const boardChanged = vary.some(function (k) { return /size|holes|minSteps|capSteps|level/.test(k); });
  return {
    game: method.game,
    name: practice.GAME_LABELS[method.game] || method.game,
    vary: vary,
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
console.log(pad('玩法', 14) + pad('可见参数', 12) + pad('评级线', 10) + pad('结论', 8) + '会变的字段');
console.log('-'.repeat(96));
for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i];
  console.log(pad(r.name, 14) + pad(r.vary.length, 12) + pad(r.lineVariants + ' 种', 10)
    + pad(r.ok ? '过' : '★ 欠', 8) + r.vary.join(', '));
}
const weak = rows.filter(function (r) { return !r.ok; });
console.log('-'.repeat(96));
console.log('共 ' + rows.length + ' 门，区分度不足 ' + weak.length + ' 门：'
  + (weak.map(function (r) { return r.name; }).join('、') || '无'));
console.log('注：审计只看「有没有变」，不看「变得合不合理」；后者见 docs/checklist-puzzle.md 与真机验收。');
