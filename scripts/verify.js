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

// 1b. 微信头像能力已下线：人物形象只走 CSS 道相（components/portrait）。
//     chooseAvatar 要用户信息隐私声明、头像进云存储要内容安全检测、签名 URL 还要
//     downloadFile 合法域名——三样维护成本换一个小圆头像不划算，形象后续交给自制皮肤。
//     这两条断言是防复发的：以后谁再引回 open-type="chooseAvatar"，静态校验当场红。
const appSources = files.filter(function (x) {
  const r = rel(x);
  return /\.(js|wxml)$/.test(r) && /^(pages|components|utils|data)\//.test(r);
});
const avatarHits = appSources.filter(function (x) {
  return /chooseAvatar|avatars\//.test(fs.readFileSync(x, 'utf8'));
}).map(rel);
if (avatarHits.length) errors.push('微信头像能力又回来了（形象只用道相）: ' + avatarHits.join(', '));
else checked += 1;

const profileTpl = fs.readFileSync(path.join(ROOT, 'pages/profile/profile.wxml'), 'utf8');
if (!/<portrait/.test(profileTpl) || /__avatar/.test(profileTpl)) {
  errors.push('人物页形象不再只走道相组件：__avatar 又出现了');
} else checked += 1;

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

// 3b. 磁盘上的每个页面目录都必须注册进 app.json.pages。
// 只查「注册了但文件缺失」是不够的：功法详情页从 tab 降为子页时，pages 数组里那一行
// 被顺手一起删了，四件套齐全、旧断言全绿，真机上 wx.navigateTo 找不到页面直接静默失败
// ——「点参悟没反应 / 功法详情打不开」就是这么来的。
const pageDirs = fs.readdirSync(path.join(ROOT, 'pages')).filter(function (n) {
  return fs.statSync(path.join(ROOT, 'pages', n)).isDirectory();
});
for (const dir of pageDirs) {
  const page = 'pages/' + dir + '/' + dir;
  if (appJson.pages.indexOf(page) < 0) errors.push('页面目录没在 app.json.pages 注册，跳转会静默失败: ' + page);
  else checked += 1;
}

// 3c. 代码里写死的跳转目标必须是注册过的页面。上一条守着「目录忘了注册」，
// 这条守着「手滑写成别的名字」——两者在真机上都是同一个症状：点了没反应。
const routeFiles = files.filter(function (f) {
  const r = rel(f);
  return /\.(js|wxml)$/.test(r) && /^(pages|utils|components|data)\//.test(r);
});
for (const f of routeFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /\/pages\/([a-z]+)\/([a-z]+)/g;
  let m = re.exec(src);
  while (m) {
    const target = 'pages/' + m[1] + '/' + m[2];
    if (appJson.pages.indexOf(target) < 0) {
      errors.push('跳转目标不是注册页面: ' + target + '（' + rel(f) + '）');
    } else checked += 1;
    m = re.exec(src);
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
  for (const bad of ["name: '基础刀法'", "name: '吐纳诀'", "name: '剑诀·断岳'", "name: '灵契·并蒂引'", "name: '阵法·小五行阵'", "name: '丹道·凝露丹方'", "name: '丹道·凝露方'"]) {
    if (src.indexOf(bad) >= 0) errors.push(rel(f) + ' 又写回了旧功法名：' + bad);
    else checked += 1;
  }
}

// 8b-2. effect.text 的前缀是这门功法的门面（'九宫：参悟熟练度 +9%'），改名时最易漏。
// 不硬性要求「等于正名前二字」——刀意 / 灯势是刻意的意象词——只挡住已废弃的旧正名：
// 它一旦留在文案里，玩家就会在同一门功法上看到两个名字。
const staleEffectWords = ['择大'];
for (const s of skillMod.SKILLS) {
  const effectText = (s.effect && s.effect.text) || '';
  for (const word of staleEffectWords) {
    if (effectText.indexOf(word) >= 0) errors.push('功法效果文案还写着旧名「' + word + '」：' + s.id + ' → ' + effectText);
    else checked += 1;
  }
}

// 8b-2b. 境界只回答两件事，必须是两个字段：realmReady（到没到学习门槛，管能不能开练）
// 与 decayed（超没超收益上限，只管打几折）。合成一个 realmOk 管两件事，就会出现
// 「金丹期练不了黄阶」——金丹 3 大于黄阶上限 2，被当成门槛未到。
// 这条断言挡两手：字段名不许回头，门槛判定不许把上界掺进去。
{
  const errsBeforeRealm = errors.length;
  const gameSrc = fs.readFileSync(path.join(ROOT, 'utils/game.js'), 'utf8');
  if (/\.realmOk\b/.test(gameSrc)) errors.push('utils/game.js 又用回 realmOk：境界门槛与收益衰减必须分成两个字段');
  else checked += 1;
  // realmReady 的定义里不许出现 maxRealm：那会把「收益上限」重新变成「能不能练」。
  const readyLines = gameSrc.split('\n').filter(function (l) { return /const realmReady =/.test(l); });
  if (readyLines.length < 2) errors.push('realmReady 的定义不见了：applyPractice 与 getSkillList 都要各自算一次');
  else checked += 1;
  for (const l of readyLines) {
    if (/maxRealm/.test(l)) errors.push('realmReady 掺进了 maxRealm：' + l.trim());
    else checked += 1;
  }
  for (const f of files.filter(function (x) { return (x.endsWith('.js') || x.endsWith('.wxml')) && rel(x) !== 'scripts/verify.js'; })) {
    const src = fs.readFileSync(f, 'utf8');
    if (/\.realmOk\b/.test(src)) errors.push(rel(f) + ' 又用回 realmOk 判断能不能修习');
  }
  // 整体只记一项：按文件记会让项数随文件数上涨，读者看不出这一条到底查了什么。
  if (errors.length === errsBeforeRealm) checked += 1;
}

// 8b-2c. 走火（F）是整局作废，不是「最低一档」：倍率必须是 0，
// 玩家看到的说法必须是「没有收益」，不许再写回「两成」这种打折口径。
{
  const worldMod = require('../data/world.js');
  if (worldMod.GRADE_FACTOR.F !== 0) errors.push('GRADE_FACTOR.F 不是 0：走火该整局作废，不是打两折');
  else checked += 1;
  let doubled = 0;
  for (const f of files.filter(function (x) { return /minigames[\\/][a-z]+\.js$/.test(x); })) {
    if (fs.readFileSync(f, 'utf8').indexOf('两成') >= 0) {
      errors.push(rel(f) + ' 的说明文案又写回了「两成收益」：走火是零收益');
      doubled += 1;
    }
  }
  if (!doubled) checked += 1;
}

// 8b-3. C / F 的门数口径：文档写「有失败态的十二门 / 没有失败态的七门」，这个数必须现算。// 加一门玩法、或给某门补上去掉 fail 线，都该让文档同步——分组错了，读者就会把「时辰到」
// 当成「还能拿 C」，判负的语义立刻失真。
const gameMod = require('../minigames/index.js');
const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cnCount(n) {
  if (n <= 10) return CN_DIGIT[n];
  if (n < 20) return '十' + CN_DIGIT[n - 10];
  return String(n);
}
const failGames = [];
const safeGames = [];
for (const m of practiceMod.PRACTICE_METHODS) {
  const mod = gameMod.MODULES[m.game];
  let failLine = '';
  try {
    failLine = (mod.lines({}, {}) || {}).fail || '';
  } catch (e) {
    errors.push('玩法 ' + m.game + ' 的 lines() 在空参数下就抛错，说明页会白屏：' + e.message);
  }
  (failLine ? failGames : safeGames).push(m.game);
}
const docPairs = [
  ['README.md', fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')],
  ['docs/checklist-puzzle.md', fs.readFileSync(path.join(ROOT, 'docs/checklist-puzzle.md'), 'utf8')],
];
for (const [name, src] of docPairs) {
  if (src.indexOf('有失败态的' + cnCount(failGames.length) + '门') < 0) {
    errors.push(name + ' 的 C/F 分组没跟上真源：现有 ' + failGames.length + ' 门有失败态（' + failGames.join(' / ') + '）');
  } else checked += 1;
  if (src.indexOf(cnCount(safeGames.length) + '门（刀法') < 0) {
    errors.push(name + ' 的 C/F 分组没跟上真源：现有 ' + safeGames.length + ' 门无失败态');
  } else checked += 1;
}

// 8b-4. 主题键 → 场景色板必须全覆盖。缺一行不会报错：stageTheme() 会静默落到
// sword 兜底，结果盘面是青绿、辉光是剑法青蓝，两种颜色各说各话，只有真机才看得出来。
const themeMod = require('../minigames/theme.js');
const visualMod = require('../data/visual.js');
const paletteKeys = new Set(Object.keys(visualMod.FAMILIES));
for (const key of Object.keys(themeMod.THEMES)) {
  if (!visualMod.FAMILY_OF[key]) {
    errors.push('主题「' + key + '」没在 visual.FAMILY_OF 里登记色板，场景辉光会落到 sword 兜底');
  } else if (!paletteKeys.has(visualMod.FAMILY_OF[key])) {
    errors.push('主题「' + key + '」的色板「' + visualMod.FAMILY_OF[key] + '」不在四支之内');
  } else checked += 1;
}

// 8b-5. 兜底值与真源同值：玩法模块在不带 params 时各留一份默认档表（测试与说明页会用到），
// 它必须是 practice.js 那一份的拷贝。两处分叉时最典型的症状是「准备页写合出 512、局内要 1024」，
// 而且只有真机连打两局才看得出来，静态断言比真机便宜得多。
const fallbackPairs = [
  ['merge', 'TARGETS', 'MERGE_TARGETS'],
  ['schulte', 'SIZES', 'SCHULTE_SIZES'],
  ['schulte', 'PENALTIES', 'SCHULTE_PENALTIES'],
];
for (const [game, modKey, dataKey] of fallbackPairs) {
  const modVal = gameMod.MODULES[game] && gameMod.MODULES[game][modKey];
  if (JSON.stringify(modVal) !== JSON.stringify(practiceMod[dataKey])) {
    errors.push(game + '.' + modKey + ' 与 practice.' + dataKey + ' 分叉了：' + JSON.stringify(modVal) + ' vs ' + JSON.stringify(practiceMod[dataKey]));
  } else checked += 1;
}
const biggestMod = gameMod.MODULES.biggest;
practiceMod.BIGGEST_LEVELS.forEach(function (lv, i) {
  if (biggestMod.COUNTS[i] !== lv.count || biggestMod.ROUNDS[i] !== lv.rounds) {
    errors.push('biggest 第 ' + i + ' 档与 practice.BIGGEST_LEVELS 分叉：'
      + biggestMod.COUNTS[i] + '/' + biggestMod.ROUNDS[i] + ' vs ' + lv.count + '/' + lv.rounds);
  } else checked += 1;
});

// 8b-6. 顺序点格不许替玩家标出「下一个在哪」。目标格一旦被描边，这一门就退化成
// 「点发亮的格子」——舒尔特方格练的是目光按序扫过整盘，替它找位置等于把功课做完。
for (const f of ['minigames/schulte.js', 'pages/practice/practice.wxss']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (src.indexOf('cell--next') >= 0) errors.push(f + ' 又给「下一个」标位置了：顺序点格的位置得玩家自己扫');
  else checked += 1;
}

// 8b-7. 逐数诀的难度只由「格子多少 + 罚时 + 时限」承担，三件事都得随档变重，
// 但盘面到 6×6 封顶（7×7 在 4.7 寸屏上每格不到 100rpx，数字看不清就成了猜）。
{
  const sizes = practiceMod.SCHULTE_SIZES;
  const pens = practiceMod.SCHULTE_PENALTIES;
  if (sizes.length !== 5 || pens.length !== 5) errors.push('逐数诀的档位表不是五档');
  else checked += 1;
  for (let i = 1; i < 5; i += 1) {
    if (sizes[i] < sizes[i - 1]) errors.push('逐数诀第 ' + i + ' 档比上一档格子还少：被调反了');
    else checked += 1;
    if (pens[i] < pens[i - 1]) errors.push('逐数诀第 ' + i + ' 档点错罚时反而更轻：被调反了');
    else checked += 1;
  }
  if (sizes[sizes.length - 1] > 6) errors.push('逐数诀盘面超过 6×6：小屏上数字看不清，难度会变成猜');
  else checked += 1;
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

// 导航栏标题：tab 页一律留空（页名由底部 tabBar 承担，顶部再写一遍就是同一行字出现两次）；
// 子页必须用统一命名表里的页面名；配色交给 app.json 的 @变量（页面写死会在暗色下穿帮）。
const TITLES = require(path.join(ROOT, 'data/navigation.js')).PAGE_TITLES;
// 说明页是共用容器，导航标题在 onLoad 里按主题动态给出「人物 · 说明」，json 里必须留空。
// 说明页是共用容器，标题按主题动态给，json 里必须留空。
// （原「功法详情」页已并进参悟页，不再是单独一页。）
const DYNAMIC_TITLES = ['pages/help/help'];
const tabPages = appJson.tabBar.list.map(function (t) { return t.pagePath; });
if (appJson.window.navigationBarTitleText) {
  errors.push('app.json window 写了导航标题，tab 页漏写就会回落成它：' + appJson.window.navigationBarTitleText);
} else checked += 1;
for (const page of appJson.pages) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, page + '.json'), 'utf8'));
  const isTab = tabPages.indexOf(page) >= 0;
  if (DYNAMIC_TITLES.indexOf(page) >= 0) {
    if (cfg.navigationBarTitleText) {
      errors.push(page + '.json 的标题由页面动态设置，json 里要留空：' + cfg.navigationBarTitleText);
    } else checked += 1;
  } else if (isTab) {
    if (cfg.navigationBarTitleText) {
      errors.push(page + '.json 是 tab 页，导航标题要与 tabBar 重复了：' + cfg.navigationBarTitleText);
    } else checked += 1;
  } else if (TITLES.indexOf(cfg.navigationBarTitleText) < 0) {
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
  'pages/skills/skills.wxss',
  'pages/battle/battle.wxss',
  'pages/secret/secret.wxss',
  'components/duel-result/duel-result.wxss',
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
const styleFiles = ['app.wxss', 'styles/scene.wxss', 'styles/immortal.wxss', 'components/duel-result/duel-result.wxss'].concat(appJson.pages.map(function (pg) { return pg + '.wxss'; }));
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
  // {{item.demo}} 这类动态绑定由页面数据给，改读页面里的字面量常量来校验，不在这里放过。
  if (m[1].indexOf('{{') === 0) continue;
  if (!termKeys.has(m[1])) errors.push('页面引用了不存在的术语：' + m[1]);
  else checked += 1;
}

const demoTerm = /DEMO_TERM = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'pages/guide/guide.js'), 'utf8'));
if (!demoTerm || !termKeys.has(demoTerm[1])) {
  errors.push('指南名词速查的示范术语不存在：' + (demoTerm ? demoTerm[1] : '未声明 DEMO_TERM'));
} else checked += 1;

// 跨页复用文案若再抄回 WXML，同一句话就会出现两种版本。
const sharedCopy = [
  copy.UI.footHint, copy.UI.loading, copy.UI.errorTitle, copy.UI.errorDesc,
  copy.UI.emptyLog, copy.UI.emptyBoard, copy.UI.emptySkills,
  copy.UI.sections.today, copy.UI.sections.more,
  copy.UI.sections.settings, copy.UI.sections.battleCode,
  // 切磋与秘境共用「我的战力」与对手列表标题：两页各抄一遍就会有一页先改。
  copy.UI.sections.myPower, copy.UI.sections.rivals,
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

// 11. 三页信息架构：tabBar 与导航真源一致、说明真源覆盖每页、解释不回页面
const nav = require(path.join(ROOT, 'data/navigation.js'));
const helpData = require(path.join(ROOT, 'data/help.js'));
const tabPaths = appJson.tabBar.list.map(function (x) { return x.pagePath; });
if (tabPaths.length !== 3) errors.push('三个 tab 的结构被改动');
else checked += 1;
for (let i = 0; i < nav.TAB_ORDER.length; i += 1) {
  const expect = 'pages/' + nav.TAB_ORDER[i] + '/' + nav.TAB_ORDER[i];
  if (tabPaths[i] !== expect) errors.push('tabBar 第 ' + (i + 1) + ' 项与导航真源不一致：' + tabPaths[i]);
  else checked += 1;
  // tab 页导航栏已不写标题，tabBar 文字就是唯一的页面名，必须与真源同字。
  const label = nav.TAB_LABELS[nav.TAB_ORDER[i]];
  if (appJson.tabBar.list[i].text !== label) {
    errors.push('tabBar 第 ' + (i + 1) + ' 项的文案与导航真源不一致：' + appJson.tabBar.list[i].text);
  } else checked += 1;
}
if (nav.TILES.length !== 6) errors.push('主页宫格不是 6 个入口');
else checked += 1;
for (const tile of nav.TILES) {
  const target = tile.url.replace(/^\//, '');
  if (appJson.pages.indexOf(target) < 0) errors.push('六宫格指向不存在的页面：' + tile.url);
  else checked += 1;
  if (!tile.label || !tile.glyph || !tile.mode || !tile.key) errors.push('六宫格条目字段不全：' + JSON.stringify(tile));
  else checked += 1;
}
// 每个页面页尾的「说明」都要有对应主题，且主题里有可展开的分节。
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
  // 「说明」沉到页尾一行小字：顶部再给它单独一条空行，首屏上方就是一整条留白。
  if (/class="imm-head"/.test(src)) errors.push(page + '.wxml 又把「说明」单独占了一行');
  else checked += 1;
  if (/怎么提升战力|powerLines|copy\.hints\.|class="muted mt8"/.test(src)) {
    errors.push(page + '.wxml 又把解释性文字印回首屏');
  } else checked += 1;
}
// 低频信息不占首屏：日志与诸界要么进子页，要么默认折叠。
const indexWxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
if (/onToggleWorld|worlds|修行记录/.test(indexWxml)) errors.push('主页还留着日志 / 诸界长区块');
else checked += 1;

// 玩法设计自检清单：文档必须跟真源同步，否则以后会照着过期口径打勾。
const checklistPath = path.join(ROOT, 'docs/checklist-puzzle.md');
if (!fs.existsSync(checklistPath)) {
  errors.push('缺少玩法设计自检清单：docs/checklist-puzzle.md');
} else {
  const doc = fs.readFileSync(checklistPath, 'utf8');
  const worldData = require(path.join(ROOT, 'data/world.js'));
  const practiceData = require(path.join(ROOT, 'data/practice.js'));
  const copyData = require(path.join(ROOT, 'data/copy.js'));

  // 十二个维度一个都不能少。
  const DIMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const missingDims = DIMS.filter(function (d) { return doc.indexOf('## ' + d + '、') < 0; });
  if (missingDims.length > 0) errors.push('自检清单缺维度：' + missingDims.join('、'));
  else checked += 1;

  // 评级与难度门槛逐字对上真源：真源加了档，文档不跟就红。
  const gradeLine = Object.keys(copyData.GRADE_TITLE).join(' / ');
  if (doc.indexOf(gradeLine) < 0) errors.push('自检清单的评级档位与 copy.GRADE_TITLE 不一致（应为 ' + gradeLine + '）');
  else checked += 1;
  const needLine = practiceData.DIFFICULTIES.map(function (d) { return d.need; }).join(' / ');
  if (doc.indexOf(needLine) < 0) errors.push('自检清单的难度门槛与 DIFFICULTIES 不一致（应为 ' + needLine + '）');
  else checked += 1;
  if (doc.indexOf('MAX_MULTIPLIER') < 0) errors.push('自检清单没讲明收益总倍率封顶走 MAX_MULTIPLIER');
  else checked += 1;
  const capText = worldData.MAX_MULTIPLIER.toFixed(1);
  if (doc.indexOf(capText) < 0) errors.push('自检清单的收益封顶与 MAX_MULTIPLIER 不一致（应为 ' + capText + '）');
  else checked += 1;
  // 结算主按钮是上一轮刚定的「留在本页」，文档不许写回「再来一局」当默认动作。
  if (doc.indexOf('留在本页') < 0) errors.push('自检清单没写结算主按钮「留在本页」');
  else checked += 1;
  // 新手引导的口径：首局手把手，不是「读完再玩」的弹窗，也不许再写回「明确不做」。
  if (doc.indexOf('首局手把手') < 0) errors.push('自检清单没写首局手把手的引导口径');
  else checked += 1;
  if (/分步新手引导[^\n]*明确不做/.test(doc)) errors.push('自检清单还把新手引导写成「明确不做」');
  else checked += 1;
  // 低档折减与默认档是同一根尺子的两面，文档必须写成真源里的那个数，
  // 否则以后照文档调数值，玩家看到的和代码算的就对不上。
  const belowCapLine = '低档折减 ×' + practiceData.DIFF_BELOW_CAP.toFixed(1);
  if (doc.indexOf(belowCapLine) < 0) errors.push('自检清单的低档折减与 DIFF_BELOW_CAP 不一致（应为 ' + belowCapLine + '）');
  else checked += 1;
  if (doc.indexOf('最高已解锁档') < 0) errors.push('自检清单没写「默认档 = 本门最高已解锁档」');
  else checked += 1;
  // 参悟页的说明是按功法现拼的，不能塞进静态主题表（那里只放整页主题）。
  const navData = require(path.join(ROOT, 'data/navigation.js'));
  if (navData.HELP_TOPICS.practice) errors.push('practice 被塞进了静态 HELP_TOPICS，说明页会拼不出这一门的规则');
  else checked += 1;
  if (typeof navData.practiceHelpUrl !== 'function') errors.push('导航真源缺 practiceHelpUrl');
  else checked += 1;

  // 文档里点名的文件都得真实存在，别指向已删除的模块。
  const seenRefs = {};
  const refRe = /(data|minigames|pages|tests|scripts|styles|assets|utils)\/[A-Za-z0-9_./-]+\.(?:js|wxss|json)/g;
  let hit = refRe.exec(doc);
  while (hit) {
    const ref = hit[0];
    if (!seenRefs[ref]) {
      seenRefs[ref] = true;
      if (!fs.existsSync(path.join(ROOT, ref))) errors.push('自检清单指向不存在的文件：' + ref);
      else checked += 1;
    }
    hit = refRe.exec(doc);
  }
  const readmeSrc = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  if (readmeSrc.indexOf('docs/checklist-puzzle.md') < 0) errors.push('README 没有指到 docs/checklist-puzzle.md');
  else checked += 1;
  // 最差那一档必须写清是「没走完」而不是「做糙了」：走火（F）与粗浅（C）是两个结论。
  // 曾经所有 F 都被页面当成「中途收功」，打崩了一分收益都没有、还被说成「这回不算数」。
  if (readmeSrc.indexOf('走火') < 0) errors.push('README 没写「走火（F）」这一档');
  else checked += 1;
  if (doc.indexOf('走火') < 0) errors.push('自检清单没写「走火（F）」：最差结局的语义没人守');
  else checked += 1;
  // 有失败态的玩法必须在说明页给出 fail 线，缺了就等于玩家开局前不知道崩了会怎样。
  const failMods = ['lights', 'mines', 'memory', 'seal', 'bridge', 'link',
    'sudoku', 'merge', 'schulte', 'klotski', 'pushbox', 'biggest'];
  failMods.forEach(function (g) {
    const src = fs.readFileSync(path.join(ROOT, 'minigames', g + '.js'), 'utf8');
    if (!/fail:/.test(src)) errors.push(g + '.js 有失败态却没给 lines().fail');
    else checked += 1;
  });
}

// 每套玩法都要导出 lines()：说明页的「C/B/A/S 各自要什么」从这里取，
// 缺一门就退回一句「按总分评」——玩家问过的问题会原样回来。
const SKIP_MG = ['index.js', 'common.js', 'theme.js', 'charge.js'];
fs.readdirSync(path.join(ROOT, 'minigames'))
  .filter(function (f) { return /\.js$/.test(f) && SKIP_MG.indexOf(f) < 0; })
  .forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, 'minigames', f), 'utf8');
    if (!/function lines\s*\(/.test(src)) errors.push(f + ' 没有 lines()：说明页的评级四条线会缺这一门');
    else checked += 1;
    if (!/lines: lines/.test(src)) errors.push(f + ' 没导出 lines，index.gradeLines 取不到');
    else checked += 1;
  });

// 说明页拿不到玩法模块就等于没数据，这条守住接线。
const helpSrc = fs.readFileSync(path.join(ROOT, 'data/help.js'), 'utf8');
if (!/minigames\.gradeLines\(/.test(helpSrc)) errors.push('说明页没接 minigames.gradeLines，评级四条线写不出来');
else checked += 1;

if (errors.length > 0) {
  console.error('静态校验失败（' + errors.length + ' 项）:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
// 文档里的项数必须等于本次实际检查数。这个数字最容易漏改：它每加一条断言都会变，
// 而人只会记得改代码。放在最后是因为 checked 到这里才定稿——只提示不递归。
const finalReadme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
if (finalReadme.indexOf(checked + ' 项') < 0) {
  console.error('静态校验失败（1 项）:');
  console.error('  - README 里的静态项数没同步：本次实际 ' + checked + ' 项，请搜「项静态」或「项，含」对齐');
  process.exit(1);
}
console.log('静态校验通过：' + checked + ' 项检查，0 错误');
