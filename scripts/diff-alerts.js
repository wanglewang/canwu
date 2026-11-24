#!/usr/bin/env node
'use strict';

// 四类差集告警：盲区（S 有 T 无）、缺陷（S 有 D 观测无）、
// 超范围（D 挂接有 S 无）、失败（校验命令跑红）。
// 原理见 docs/specs/constitution/06-评审方法论.md §4 / §6 / §10。
//
// D 侧不是读代码得出的结论：本脚本真跑 npm run check 与 npm run audit:gap，
// 拿真实输出按 docs/reviews/12-运行覆盖.md 的挂接表匹配，命中才算观测到。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CARD_S = 'docs/reviews/10-规格覆盖.md';
const CARD_T = 'docs/reviews/11-测试覆盖.md';
const CARD_D = 'docs/reviews/12-运行覆盖.md';

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function slice(src, startMarker, endMarker) {
  const from = src.indexOf(startMarker);
  if (from < 0) return '';
  const to = src.indexOf(endMarker, from + startMarker.length);
  return src.slice(from, to < 0 ? src.length : to);
}

function idsFrom(src) {
  const out = new Set();
  for (const m of src.matchAll(/`(SC-[A-Z0-9-]+)`/g)) out.add(m[1]);
  return out;
}

function parseObservationRows(src) {
  const rows = [];
  for (const line of src.split('\n')) {
    if (!/^\|\s*`SC-/.test(line)) continue;
    const cells = line.split('|').map(function (c) { return c.trim(); });
    const id = (cells[1].match(/SC-[A-Z0-9-]+/) || [])[0];
    const source = cells[2];
    const features = [];
    for (const m of cells[3].matchAll(/`([^`]+)`/g)) features.push(m[1]);
    if (!id || !features.length) continue;
    rows.push({ id: id, source: source, features: features });
  }
  return rows;
}

function run(cmd) {
  const r = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    cmd: cmd,
    code: r.status,
    out: (r.stdout || '') + '\n' + (r.stderr || ''),
  };
}

function sortIds(set) {
  return Array.from(set).sort();
}

const sIds = idsFrom(slice(read(CARD_S), '## 场景 ID 总表', '## 1. 身份'));
const tIds = idsFrom(slice(read(CARD_T), '## 场景 ID 表', '## 差异标记'));
const dRows = parseObservationRows(slice(read(CARD_D), '## 6. 场景 ID 观测挂接表', '## 7. 运行观测接入清单'));
const dDeclared = new Set(dRows.map(function (r) { return r.id; }));

const check = run('npm run check');
const gap = run('npm run audit:gap');

const dObserved = new Set();
for (const row of dRows) {
  const out = row.source === 'gap' ? gap.out : check.out;
  const hit = row.features.some(function (f) {
    try {
      return new RegExp(f).test(out);
    } catch (e) {
      return false;
    }
  });
  if (hit) dObserved.add(row.id);
}

const blind = sortIds(new Set([...sIds].filter(function (id) { return !tIds.has(id); })));
const defect = sortIds(new Set([...sIds].filter(function (id) { return !dObserved.has(id); })));
const over = sortIds(new Set([...dDeclared].filter(function (id) { return !sIds.has(id); })));
const failed = [check, gap].filter(function (r) { return r.code !== 0; });

function lines(label, items) {
  if (!items.length) return label + '：0 项\n';
  return label + '：' + items.length + ' 项\n' + items.map(function (x) { return '  - ' + x; }).join('\n') + '\n';
}

function report() {
  const out = [];
  out.push('差集告警（R_S ' + sIds.size + ' / R_T ' + tIds.size + ' / R_D 挂接 ' + dDeclared.size + ' / 观测命中 ' + dObserved.size + '）');
  out.push('========================================');
  out.push(lines('盲区（规格有 · 测试无）', blind).trimEnd());
  out.push(lines('缺陷（规格有 · 运行观测无）', defect).trimEnd());
  out.push(lines('超范围（D 挂接有 · 规格无）', over).trimEnd());
  out.push(lines('失败（校验命令跑红）', failed.map(function (r) { return r.cmd + ' 退出码 ' + r.code; })).trimEnd());
  return out.join('\n');
}

const text = report();
if (process.argv.indexOf('--json') >= 0) {
  console.log(JSON.stringify({
    s: sortIds(sIds), t: sortIds(tIds), declared: sortIds(dDeclared),
    observed: sortIds(dObserved), blind, defect, over,
    failed: failed.map(function (r) { return { cmd: r.cmd, code: r.code }; }),
  }, null, 2));
} else {
  console.log(text);
}

const total = blind.length + defect.length + over.length + failed.length;
if (total > 0) {
  console.error('\n有 ' + total + ' 项告警，按 06-评审方法论.md §11 诊断根因后改本体、重出三份 R。');
  process.exit(1);
}
