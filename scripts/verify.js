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
const components = new Set();
for (const page of appJson.pages) {
  const cfgPath = path.join(ROOT, page + '.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const using = cfg.usingComponents || {};
  for (const key of Object.keys(using)) {
    const p = using[key];
    // 绝对路径从项目根算，相对路径从页面所在目录算；两种写法都要验四件套。
    components.add(p.indexOf('/') === 0
      ? path.join(ROOT, p.slice(1))
      : path.resolve(path.dirname(cfgPath), p));
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

// 8b. 功法命名规范：前缀 = 类别、分隔符唯一、正名三字且用体裁字、不写等级词。
// 规则写在 data/skills.js，这里只做兜底，避免有人直接改 name 绕过校验函数。
const nameIssues = skillMod.validateNames();
if (nameIssues.length) errors.push('功法命名不规范：' + nameIssues.join('；'));
else checked += 1;
const allowedTypes = new Set(Object.keys(practiceMod.FAMILIES));
for (const s of skillMod.SKILLS) {
  if (!allowedTypes.has(s.type)) errors.push('功法类别不在游戏族表内: ' + s.id);
  else checked += 1;
  const prefix = s.name.split(skillMod.NAME_RULE.sep)[0];
  if (prefix !== s.type) errors.push('功法名前缀与类别不一致: ' + s.id);
  else checked += 1;
}
// 旧命名口径黑名单：这些写法一回来，统一感就散了。
// 黑名单字面量本身写在 scripts/verify.js 里，跳过自身，否则会自己把自己检出来。
for (const f of files.filter(function (x) { return (x.endsWith('.js') || x.endsWith('.wxml')) && rel(x) !== 'scripts/verify.js'; })) {
  const src = fs.readFileSync(f, 'utf8');
  for (const bad of ["name: '基础刀法'", "name: '吐纳诀'", "name: '剑诀·断岳'", "name: '灵契·并蒂引'", "name: '阵法·小五行阵'", "name: '丹道·凝露丹方'"]) {
    if (src.indexOf(bad) >= 0) errors.push(rel(f) + ' 又写回了旧功法名：' + bad);
    else checked += 1;
  }
}

// 8c. 图鉴详情：未习得功法也必须能取到完整玩法与习得路径。
const engineMod = require('../utils/game.js');
const freshState = engineMod.createNewState();
for (const s of skillMod.SKILLS) {
  const d = engineMod.getSkillDetail(freshState, s.id);
  if (!d || !d.guide || !d.guide.steps.length || !d.gainLines.length || !d.unlock.label) {
    errors.push('图鉴详情缺内容: ' + s.id);
  } else checked += 1;
  if (!s.source || !s.source.kind) errors.push('功法缺获取方式: ' + s.id);
  else checked += 1;
}
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
const TITLES = ['主页', '修炼', '功法', '人物', '仙门切磋', '参悟', '登录', '修行指南', '说明', '修行日志',
  '藏经阁', '战力仙榜', '称号簿'];
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
  'styles/immortal.wxss',
  'pages/index/index.wxss',
  'pages/cultivate/cultivate.wxss',
  'pages/skills/skills.wxss',
  'pages/battle/battle.wxss',
  'pages/profile/profile.wxss',
  'pages/guide/guide.wxss',
  'pages/help/help.wxss',
  'pages/log/log.wxss',
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
const styleFiles = ['app.wxss', 'styles/scene.wxss', 'styles/immortal.wxss'].concat(appJson.pages.map(function (pg) { return pg + '.wxss'; }));
const undefinedVars = [];
for (const f of styleFiles) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!tokenDefs.has(m[1]) && !runtimeVars.has(m[1])) undefinedVars.push(f + ' -> ' + m[1]);
  }
}
if (undefinedVars.length) errors.push('样式引用了未定义的 CSS 变量：' + undefinedVars.slice(0, 5).join(', '));
else checked += 1;

// 10. 文案与页面组织：真源唯一、术语可查、区块标题说人话
const copy = require(path.join(ROOT, 'data/copy.js'));
const wxmlFiles = files.filter(function (f) { return f.endsWith('.wxml'); });
const allWxml = wxmlFiles.map(function (f) { return fs.readFileSync(f, 'utf8'); }).join('\n');

const termKeys = new Set();
for (const t of copy.TERMS) {
  if (!t.key || !t.name || !t.desc || !t.group || termKeys.has(t.key) || t.desc.length < 10) {
    errors.push('术语词典条目不合法或重复：' + JSON.stringify(t));
  } else checked += 1;
  termKeys.add(t.key);
}
if (copy.TERMS.length < 15) errors.push('术语词典覆盖不足');
else checked += 1;

for (const m of allWxml.matchAll(/<term[^>]*term-key="([^"]+)"/g)) {
  if (!termKeys.has(m[1])) errors.push('页面引用了不存在的术语：' + m[1]);
  else checked += 1;
}

// 跨页复用文案若再抄回 WXML，同一句话就会出现两种版本。
const sharedCopy = [
  copy.UI.footHint, copy.UI.loading, copy.UI.errorTitle, copy.UI.errorDesc,
  copy.UI.emptyLog, copy.UI.emptyBoard, copy.UI.emptySkills,
  copy.UI.sections.today, copy.UI.sections.more, copy.UI.sections.nearTier,
  copy.UI.sections.settings, copy.UI.sections.battleCode,
];
for (const text of sharedCopy) {
  if (allWxml.indexOf('>' + text + '<') >= 0) errors.push('WXML 又硬编码了共享文案：' + text);
  else checked += 1;
}

// 旧口径黑名单：含糊标题、拟人 loading、每页重复的品牌口号。
const staleCopy = ['就差一点', '正在推演气机', '正在翻检藏经阁', '正在整理论道台',
  '正在展开道牒', '参 悟 · 等是保底，练才是加速'];
for (const text of staleCopy) {
  if (allWxml.indexOf(text) >= 0) errors.push('旧文案口径又回来了：' + text);
  else checked += 1;
}

// 用了 <term> 的页面必须在 json 里注册组件，否则真机上整块文字消失。
for (const page of appJson.pages) {
  const wxml = fs.readFileSync(path.join(ROOT, page + '.wxml'), 'utf8');
  if (wxml.indexOf('<term') < 0) continue;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, page + '.json'), 'utf8'));
  if (!cfg.usingComponents || !cfg.usingComponents.term) errors.push(page + '.json 没注册术语组件');
  else checked += 1;
}

// 11. 四页信息架构：tabBar 与导航真源一致、说明真源覆盖每页、解释不回页面
const nav = require(path.join(ROOT, 'data/navigation.js'));
const helpData = require(path.join(ROOT, 'data/help.js'));
const tabPaths = appJson.tabBar.list.map(function (x) { return x.pagePath; });
if (tabPaths.length !== 4) errors.push('四个 tab 的结构被改动');
else checked += 1;
for (let i = 0; i < nav.TAB_ORDER.length; i += 1) {
  const expect = 'pages/' + nav.TAB_ORDER[i] + '/' + nav.TAB_ORDER[i];
  if (tabPaths[i] !== expect) errors.push('tabBar 第 ' + (i + 1) + ' 项与导航真源不一致：' + tabPaths[i]);
  else checked += 1;
}
if (nav.TILES.length !== 6) errors.push('主页六宫格不是 6 个入口');
else checked += 1;
for (const tile of nav.TILES) {
  const target = tile.url.replace(/^\//, '');
  if (appJson.pages.indexOf(target) < 0) errors.push('六宫格指向不存在的页面：' + tile.url);
  else checked += 1;
  if (!tile.label || !tile.glyph || !tile.mode || !tile.key) errors.push('六宫格条目字段不全：' + JSON.stringify(tile));
  else checked += 1;
}
// 每个页面右上角的「说明」都要有对应主题，且主题里有可展开的分节。
for (const pageKey of Object.keys(nav.HELP_TOPICS)) {
  const topic = helpData.TOPICS[nav.HELP_TOPICS[pageKey]];
  if (!topic) errors.push('说明真源缺少主题：' + pageKey);
  else checked += 1;
}
for (const key of Object.keys(helpData.TOPICS)) {
  const t = helpData.TOPICS[key];
  if (!t.title || !t.lead || !t.sections || t.sections.length === 0) {
    errors.push('说明主题不完整：' + key);
    continue;
  }
  checked += 1;
  for (const sec of t.sections) {
    if (!sec.key || !sec.title || !sec.lines || sec.lines.length === 0) errors.push('说明分节不完整：' + key + '/' + sec.key);
    else checked += 1;
  }
}
// 说明页与日志页默认全折叠，别把说明书一次糊到脸上。
const helpJs = fs.readFileSync(path.join(ROOT, 'pages/help/help.js'), 'utf8');
if (!/open: false/.test(helpJs) || !/termsOpen: false/.test(helpJs)) errors.push('说明页没有默认折叠');
else checked += 1;
// 四个 tab 页：统一仙箓皮肤 + 说明入口，首屏不再出现长解释。
for (const page of tabPaths) {
  const src = fs.readFileSync(path.join(ROOT, page + '.wxml'), 'utf8');
  if (!/class="pg pg--imm/.test(src)) errors.push(page + '.wxml 没用仙箓皮肤');
  else checked += 1;
  if (!/bindtap="onGoHelp"/.test(src)) errors.push(page + '.wxml 缺少「说明」入口');
  else checked += 1;
  if (/怎么提升战力|powerLines|copy\.hints\.|class="muted mt8"/.test(src)) {
    errors.push(page + '.wxml 又把解释性文字印回首屏');
  } else checked += 1;
}
// 低频信息不占首屏：日志与诸界要么进子页，要么默认折叠。
const indexWxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
if (/onToggleWorld|worlds|修行记录/.test(indexWxml)) errors.push('主页还留着日志 / 诸界长区块');
else checked += 1;

if (errors.length > 0) {
  console.error('静态校验失败（' + errors.length + ' 项）:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('静态校验通过：' + checked + ' 项检查，0 错误');
