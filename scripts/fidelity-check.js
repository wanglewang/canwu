#!/usr/bin/env node
'use strict';

// 保真度校验（R_S → S、R_T → 测试本体）：方法论 docs/specs/constitution/06-评审方法论.md §7 / §10。
// 三份 R 可以完美对齐、同时一起漏掉硬规则——所以最前面要有「本体 ↔ 覆盖度」这一道。
//
// R_S 侧真源：docs/reviews/10-规格覆盖.md「保真锚点表」，每个活 ID 钉一句契约/宪法原文。
//   正查 - 活 ID 都钉了锚点；锚点能在缩写对应的 S 文件精确找到；锚点表不含退役 ID。
//   反查 - 六契约「契约与守卫」每个加粗条目都被某锚点指回（本体有承诺、R 漏提取）。
// R_T 侧真源：docs/reviews/11-测试覆盖.md「测试锚点表」，每个活 ID 钉一句测试/脚本原文。
//   正查 - 活 ID 都钉了锚点；锚点能在缩写对应的测试文件精确找到；锚点表不含退役 ID。
//   反查 - 测试本体用例几百条，不可能逐条挂 ID；R_T 侧只做正查，漏挂由 audit:alerts 的盲区间接守。
// R_D 侧：挂接表本身即「指回哪次运行哪行输出」，命中校验由 scripts/diff-alerts.js 承担，不在此重复。
//
// 锚点成立的前提：锚点短语必须是本体文件里的可辨字面量（用例标题 / 断言消息 / 源码串）。
// 本体自己被删掉一条（锚点也跟着删）不在能力内——那是「本体变更要人审」，不是保真度。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CARD_S = 'docs/reviews/10-规格覆盖.md';
const CARD_T = 'docs/reviews/11-测试覆盖.md';

const CONTRACT_FILE = {
  '01': 'docs/specs/spec/00-契约/01-对局.md',
  '02': 'docs/specs/spec/00-契约/02-成长.md',
  '03': 'docs/specs/spec/00-契约/03-经济.md',
  '04': 'docs/specs/spec/00-契约/04-存档.md',
  '05': 'docs/specs/spec/00-契约/05-界面.md',
  '06': 'docs/specs/spec/00-契约/06-教学.md',
  '宪法': 'docs/specs/constitution/README.md',
};

const TEST_FILE = {
  G: 'tests/game.test.js',
  S: 'tests/store.test.js',
  R: 'tests/rank.test.js',
  L: 'tests/layout.test.js',
  M: 'tests/minigames.test.js',
  V: 'scripts/verify.js',
  SIM: 'scripts/simulate.js',
};

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function slice(src, startMarker, endMarker) {
  const from = src.indexOf(startMarker);
  if (from < 0) return '';
  const to = src.indexOf(endMarker, from + startMarker.length);
  return src.slice(from, to < 0 ? src.length : to);
}

// 活 ID 集合（场景 ID 总表段）
function liveIds(src, start, end) {
  const seg = slice(src, start, end);
  const out = new Set();
  for (const m of seg.matchAll(/`(SC-[A-Z0-9-]+)`/g)) out.add(m[1]);
  return out;
}

// 锚点表：id -> [{ab, phrase}, ...]
function anchors(src, start, end) {
  const seg = slice(src, start, end);
  const out = new Map();
  for (const line of seg.split('\n')) {
    const m = line.match(/^\|\s*`(SC-[A-Z0-9-]+)`\s*\|\s*(.+?)\s*\|$/);
    if (!m) continue;
    const list = [];
    for (const a of m[2].matchAll(/`([^`]+)`/g)) {
      const pair = a[1].match(/^([^:]+):(.+)$/);
      if (pair) list.push({ ab: pair[1], phrase: pair[2] });
    }
    out.set(m[1], list);
  }
  return out;
}

// 六契约「契约与守卫」段的加粗条目 → 形如 "01:开局前必须先报代价"
function contractClaims() {
  const out = [];
  for (const ab of ['01', '02', '03', '04', '05', '06']) {
    const seg = slice(read(CONTRACT_FILE[ab]), '## 契约与守卫', '## 外部依赖');
    for (const m of seg.matchAll(/^- \*\*(.+?)\*\*：/gm)) {
      out.push(ab + ':' + m[1]);
    }
  }
  return out;
}

// 通用正查：给定活 ID / 锚点表 / 缩写→文件映射，返回三类告警与锚点扁平表
function checkAnchors(ids, amap, fileMap) {
  const pairs = [];
  const noAnchor = [];
  const badAnchor = [];
  for (const id of ids) {
    const list = amap.get(id) || [];
    if (!list.length) noAnchor.push(id);
    for (const a of list) {
      pairs.push(a.ab + ':' + a.phrase);
      const file = fileMap[a.ab];
      if (!file) {
        badAnchor.push(id + ' → 未知缩写 ' + a.ab);
        continue;
      }
      if (read(file).indexOf(a.phrase) < 0) {
        badAnchor.push(id + ' → ' + a.ab + ' 找不到「' + a.phrase + '」');
      }
    }
  }
  const extraIds = [...amap.keys()].filter(function (id) { return !ids.has(id); });
  return { pairs: pairs, noAnchor: noAnchor, badAnchor: badAnchor, extraIds: extraIds };
}

// ---- R_S → S ----
const cardS = read(CARD_S);
const sIds = liveIds(cardS, '## 场景 ID 总表', '## 1. 身份');
const sAm = anchors(cardS, '## 保真锚点表', '## 差异标记');
const sClaims = contractClaims();
const sRes = checkAnchors(sIds, sAm, CONTRACT_FILE);
const covered = new Set(sRes.pairs);
const uncovered = sClaims.filter(function (c) { return !covered.has(c); });

// ---- R_T → 测试本体 ----
const cardT = read(CARD_T);
const tIds = liveIds(cardT, '## 场景 ID 表', '## 测试锚点表');
const tAm = anchors(cardT, '## 测试锚点表', '## 差异标记');
const tRes = checkAnchors(tIds, tAm, TEST_FILE);

function lines(label, items) {
  if (!items.length) return label + '：0 项';
  return label + '：' + items.length + ' 项\n' + items.map(function (x) { return '  - ' + x; }).join('\n');
}

const text = [
  '保真度校验（R_S 活 ID ' + sIds.size + ' / 锚点 ' + sRes.pairs.length + ' / 契约条目 ' + sClaims.length +
    '；R_T 活 ID ' + tIds.size + ' / 锚点 ' + tRes.pairs.length + '）',
  '========================================',
  'R_S → 规格本体',
  lines('  正查·活 ID 没钉锚点', sRes.noAnchor),
  lines('  正查·锚点指不回本体', sRes.badAnchor),
  lines('  正查·锚点表含退役 ID', sRes.extraIds),
  lines('  反查·契约条目无 R 指回', uncovered),
  'R_T → 测试本体',
  lines('  正查·活 ID 没钉锚点', tRes.noAnchor),
  lines('  正查·锚点指不回测试文件', tRes.badAnchor),
  lines('  正查·锚点表含退役 ID', tRes.extraIds),
  'R_D → 运行观测：挂接表命中校验由 npm run audit:alerts 承担，不在此重复',
].join('\n');

const result = {
  s: { ids: [...sIds].sort(), anchorPairs: sRes.pairs.sort(), claims: sClaims,
    noAnchor: sRes.noAnchor, badAnchor: sRes.badAnchor, extraIds: sRes.extraIds, uncovered: uncovered },
  t: { ids: [...tIds].sort(), anchorPairs: tRes.pairs.sort(),
    noAnchor: tRes.noAnchor, badAnchor: tRes.badAnchor, extraIds: tRes.extraIds },
};
if (process.argv.indexOf('--json') >= 0) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(text);
}

const total = sRes.noAnchor.length + sRes.badAnchor.length + sRes.extraIds.length + uncovered.length +
  tRes.noAnchor.length + tRes.badAnchor.length + tRes.extraIds.length;
if (total > 0) {
  console.error('\n有 ' + total + ' 项保真度告警，按 06-评审方法论.md §11 诊断根因：改本体或重提 R，不要直接改锚点消警。');
  process.exit(1);
}
