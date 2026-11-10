'use strict';

// 零依赖静态校验：JSON 可解析、JS 语法、页面/组件四件套、主题变量、tabBar 图标、隐私清单格式。
// 不依赖微信开发者工具，CI 里直接 node scripts/verify.js 即可。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', '.workbuddy', 'node_modules', 'miniprogram_npm']);
const errors = [];
let checked = 0;

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile()) out.push(full);
  }
  return out;
}

const files = walk(ROOT, []);
const rel = function (f) { return path.relative(ROOT, f).replace(/\\/g, '/'); };

// 1. 所有 JSON 可解析
for (const f of files.filter(function (x) { return x.endsWith('.json'); })) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    checked += 1;
  } catch (e) {
    errors.push('JSON 解析失败: ' + rel(f) + ' — ' + e.message);
  }
}

// 隐藏的 .privacy.json 也是 JSON，单独核对格式
const privacy = files.filter(function (x) { return x.endsWith('.privacy.json'); });
for (const f of privacy) {
  try {
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(list)) { errors.push('隐私清单必须是数组: ' + rel(f)); continue; }
    for (const item of list) {
      const keys = Object.keys(item);
      if (keys.length !== 1 || typeof item[keys[0]] !== 'string') {
        errors.push('隐私清单每项必须是单键对象: ' + rel(f));
      }
    }
  } catch (e) {
    errors.push('隐私清单解析失败: ' + rel(f));
  }
}

// 2. 所有 JS 通过 node --check
for (const f of files.filter(function (x) { return x.endsWith('.js'); })) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) errors.push('JS 语法错误: ' + rel(f) + ' — ' + String(r.stderr || '').trim().split('\n')[0]);
  else checked += 1;
}

// 3. app.json 页面四件套齐全
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
for (const page of appJson.pages) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    if (!fs.existsSync(path.join(ROOT, page + ext))) errors.push('页面文件缺失: ' + page + ext);
    else checked += 1;
  }
}

// 4. 组件四件套
const components = [];
for (const page of appJson.pages) {
  const cfgPath = path.join(ROOT, page + '.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const using = cfg.usingComponents || {};
  for (const key of Object.keys(using)) {
    const p = using[key];
    if (p.indexOf('/') === 0) components.push(path.join(ROOT, p.slice(1)));
  }
}
for (const c of components) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    if (!fs.existsSync(c + ext)) errors.push('组件文件缺失: ' + rel(c + ext));
    else checked += 1;
  }
}

// 5. tabBar 图标存在
for (const item of appJson.tabBar.list) {
  for (const key of ['iconPath', 'selectedIconPath']) {
    if (item[key] && !fs.existsSync(path.join(ROOT, item[key]))) {
      errors.push('tabBar 图标缺失: ' + item[key]);
    } else if (item[key]) checked += 1;
  }
}

// 6. theme.json 覆盖 app.json 里的所有 @变量
const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'theme.json'), 'utf8'));
const refs = new Set();
JSON.stringify(appJson).replace(/"@([A-Za-z0-9_]+)"/g, function (_, name) { refs.add(name); return _; });
for (const mode of ['light', 'dark']) {
  if (!theme[mode]) { errors.push('theme.json 缺少 ' + mode + ' 配置'); continue; }
  for (const name of refs) {
    if (theme[mode][name] === undefined) errors.push('theme.json ' + mode + ' 缺少变量 ' + name);
    else checked += 1;
  }
}

// 7. 关键文件存在
for (const f of ['package.json', 'package-lock.json', 'README.md', 'project.config.json', 'utils/cloud.js', 'utils/cloud-save.js', 'utils/cloud-social.js', 'utils/store.js', 'utils/game.js']) {
  if (!fs.existsSync(path.join(ROOT, f))) errors.push('关键文件缺失: ' + f);
  else checked += 1;
}

if (errors.length > 0) {
  console.error('静态校验失败（' + errors.length + ' 项）:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('静态校验通过：' + checked + ' 项检查，0 错误');
