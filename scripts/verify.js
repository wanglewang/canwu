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
for (const f of ['package.json', 'package-lock.json', 'README.md', 'project.config.json', 'utils/cloud.js', 'utils/cloud-save.js', 'utils/cloud-social.js', 'utils/store.js', 'utils/game.js', 'utils/sfx.js', 'data/visual.js', 'data/weapons.js', 'styles/tokens.wxss', 'styles/scene.wxss']) {
  if (!fs.existsSync(path.join(ROOT, f))) errors.push('关键文件缺失: ' + f);
  else checked += 1;
}

// 8. 功法品阶与难度档约定：品阶管收益（天地玄黄），难度档跟熟练度（五档）
const skillMod = require('../data/skills.js');
const practiceMod = require('../data/practice.js');
// 功法数不写死：一门功法必须正好对应一套参悟方式，加内容时两处一起加。
if (skillMod.SKILLS.length !== practiceMod.PRACTICE_METHODS.length
  || practiceMod.TIERS.length !== 4 || practiceMod.DIFFICULTIES.length !== 5) {
  errors.push('功法数与参悟方式数不等，或品阶数 / 难度档数不符合约定');
} else checked += 1;
const tierSeen = {};
for (const s of skillMod.SKILLS) {
  if (!practiceMod.TIERS.some((t) => t.key === s.tier)) errors.push('功法品阶非法: ' + s.id);
  else { tierSeen[s.tier] = true; checked += 1; }
  if (s.kind !== 'main' && s.kind !== 'skill') errors.push('功法分类非法: ' + s.id);
  else checked += 1;
  if (!practiceMod.METHOD_MAP[s.method]) errors.push('功法指向不存在的参悟方式: ' + s.id);
  else checked += 1;
}
if (Object.keys(tierSeen).length !== 4) errors.push('天地玄黄中存在空阶');
else checked += 1;
for (let i = 1; i < practiceMod.DIFFICULTIES.length; i += 1) {
  const prev = practiceMod.DIFFICULTIES[i - 1];
  const cur = practiceMod.DIFFICULTIES[i];
  if (cur.need <= prev.need || cur.mult <= prev.mult) errors.push('难度档门槛或倍率未递增: ' + cur.key);
  else checked += 1;
}
let boardSafe = true;
for (const m of practiceMod.PRACTICE_METHODS) {
  for (const d of practiceMod.DIFFICULTIES) {
    const out = practiceMod.buildParams(m, d.key);
    for (const key of ['grid', 'cols', 'rows', 'size']) {
      if (typeof m.params[key] === 'number' && out[key] !== m.params[key]) boardSafe = false;
    }
  }
}
if (!boardSafe) errors.push('难度档缩放改动了盘面尺寸字段');
else checked += 1;

// 9. 页面规范：设计令牌单一真源、明暗一致性、导航栏标题与暗色、页面样式不写裸色值
const appWxss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
if (!/@import\s+"\.\/styles\/tokens\.wxss"/.test(appWxss)) {
  errors.push('app.wxss 没有引入 styles/tokens.wxss');
} else checked += 1;

const tokenSrc = fs.readFileSync(path.join(ROOT, 'styles/tokens.wxss'), 'utf8');
// 文件头注释里也会提到这条媒体查询，必须匹配带 { 的真正规则块。
const darkMatch = /@media \(prefers-color-scheme: dark\)\s*\{/.exec(tokenSrc);
const darkAt = darkMatch ? darkMatch.index : -1;
if (darkAt < 0) {
  errors.push('tokens.wxss 缺少暗色令牌段');
} else checked += 1;

function varsOf(text) {
  const out = {};
  for (const m of text.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const lightVars = varsOf(tokenSrc.slice(0, darkAt < 0 ? undefined : darkAt));
const darkVars = varsOf(tokenSrc.slice(darkAt < 0 ? 0 : darkAt));
const colorKeys = Object.keys(lightVars).filter(function (k) { return k.indexOf('--c-') === 0; });
if (colorKeys.length < 30) errors.push('颜色令牌过少，可能没写全：' + colorKeys.length);
else checked += 1;
for (const key of colorKeys) {
  if (darkVars[key] === undefined) errors.push('暗色令牌缺少 ' + key);
  else checked += 1;
}
// theme.json 的 @变量与令牌必须同值，否则明暗切换时原生栏与页面会脱节。
const themeToToken = {
  navBgColor: '--c-nav',
  tabBgColor: '--c-tab',
  tabColor: '--c-tab-text',
  tabSelectedColor: '--c-tab-active',
};
for (const mode of ['light', 'dark']) {
  const vars = mode === 'light' ? lightVars : darkVars;
  for (const name of Object.keys(themeToToken)) {
    if (theme[mode][name] === undefined) continue;
    if (vars[themeToToken[name]] !== theme[mode][name]) {
      errors.push('theme.json ' + mode + '.' + name + ' 与 ' + themeToToken[name] + ' 不同值');
    } else checked += 1;
  }
}

// 导航栏标题统一为「页面名」，配色交给 app.json 的 @变量（页面写死会在暗色下穿帮）。
const TITLES = ['洞府', '功法', '论道', '道牒', '参悟', '登录', '修行指南'];
for (const page of appJson.pages) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, page + '.json'), 'utf8'));
  if (TITLES.indexOf(cfg.navigationBarTitleText) < 0) {
    errors.push(page + '.json 的导航标题不符合统一命名：' + cfg.navigationBarTitleText);
  } else checked += 1;
  if (cfg.navigationBarBackgroundColor || cfg.navigationBarTextStyle) {
    errors.push(page + '.json 写死了导航栏配色，暗色下会变成白条');
  } else checked += 1;
}

// 常规页面与全局基础层不允许再出现裸色值；tokens.wxss / scene.wxss /
// practice.wxss 的玩法主题色板是白名单例外（见各自文件头注释）。
const RAW_COLOR = /#[0-9a-fA-F]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;
const TOKENIZED = [
  'app.wxss',
  'pages/index/index.wxss',
  'pages/skills/skills.wxss',
  'pages/battle/battle.wxss',
  'pages/profile/profile.wxss',
  'pages/guide/guide.wxss',
  'pages/login/login.wxss',
];
for (const f of TOKENIZED) {
  const hits = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(RAW_COLOR) || []);
  if (hits.length) errors.push(f + ' 出现裸色值，请改用 tokens.wxss：' + hits.slice(0, 3).join(', '));
  else checked += 1;
}

// CSS 变量拼错在小程序里是静默失效（不会报错，样式直接消失），必须静态兜住。
// 运行时由 minigames/theme.js / data/visual.js 注入的盘面变量在这里白名单放行。
const tokenDefs = new Set([...tokenSrc.matchAll(/(--[\w-]+)\s*:/g)].map(function (m) { return m[1]; }));
const runtimeVars = new Set(['--acc', '--soft', '--ink', '--bg', '--frame', '--glow', '--deep', '--well', '--a', '--d']);
const styleFiles = ['app.wxss', 'styles/scene.wxss'].concat(appJson.pages.map(function (pg) { return pg + '.wxss'; }));
const undefinedVars = [];
for (const f of styleFiles) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!tokenDefs.has(m[1]) && !runtimeVars.has(m[1])) undefinedVars.push(f + ' -> ' + m[1]);
  }
}
if (undefinedVars.length) errors.push('样式引用了未定义的 CSS 变量：' + undefinedVars.slice(0, 5).join(', '));
else checked += 1;

if (errors.length > 0) {
  console.error('静态校验失败（' + errors.length + ' 项）:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('静态校验通过：' + checked + ' 项检查，0 错误');
