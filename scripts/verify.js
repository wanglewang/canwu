'use strict';

// 零依赖静态校验：JSON 可解析、JS 语法、页面/组件四件套、主题变量、tabBar 图标、隐私清单格式。
// 不依赖微信开发者工具，CI 里直接 node scripts/verify.js 即可。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// .obsidian 是本地编辑器工作区（第三方插件），与 .workbuddy 同类，不进校验范围。
// 90-reference 是外部参考仓库（GDD 模板 / OpenGDD 规范 / game-forge），随设计文档放在
// docs/specs/plan/90-reference/，整目录连同上游 .git 一起被拉进来。它们是「读的资料」，
// 不是本项目的代码与文档：不解析它的 JSON、不扫它的 WXML 引用、更不把一千多个第三方文件算进静态项数。
// reviews（现为 docs/reviews/）是每轮审查卡与三份覆盖度的归档目录，逐轮累积、只增不减。
// 若计入静态项数，每新增一份审查卡 README 的项数就要改一次，项数会被与代码无关的审查动作持续推着走——跳过它。
const SKIP_DIRS = new Set(['.git', '.workbuddy', '.obsidian', 'node_modules', 'miniprogram_npm', '90-reference', 'reviews']);
const errors = [];
let checked = 0;
// 逐断言观测标记：关键静态断言通过时立刻打印一行 `OK  [SC-ID] ...`，供 audit:alerts 按 ID 匹配。
// 和末尾「静态校验通过：N 项」的整链绿灯不同——改弱哪条断言，哪一行就消失，能定位到具体场景。
// 只记「通过」不记「失败」：失败本身由 errors + 退出码报，不在这里重复。
function observe(id, label) { console.log('OK  [' + id + '] ' + label); }

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

// 内核源码：2026-11 起按关注点拆到 utils/game/ 下（state / profs / idle / settle / battle / realm / view）。
// 凡是「读内核源码找某个调用或字段」的断言，都必须扫整个目录。
// 只读门面 utils/game.js 的话，拆一次就把这批闸门悄悄拆没了——它们会静默通过，比报红更坏。
function engineSrc() {
  const dir = path.join(ROOT, 'utils', 'game');
  if (!fs.existsSync(dir)) return fs.readFileSync(path.join(ROOT, 'utils', 'game.js'), 'utf8');
  return fs.readdirSync(dir)
    .filter(function (f) { return f.endsWith('.js'); })
    .map(function (f) { return fs.readFileSync(path.join(dir, f), 'utf8'); })
    .join('\n');
}

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

// 1c. 发布必备的合规件：隐私授权、协议入口、客服、游客入口。
// 剪贴板与昵称输入在未同意隐私指引时会静默失败（errno 112），症状和「点了没反应」一样，
// 所以约定是「剪贴板调用必须包在 privacy.guard 里」，这里按调用数核对，不靠人记。
const appJsonEarly = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
if (appJsonEarly.__usePrivacyCheck__ !== true) {
  errors.push('app.json 没打开 __usePrivacyCheck__：隐私接口被拦时不会弹授权框');
} else checked += 1;

const privacySrc = fs.readFileSync(path.join(ROOT, 'utils/privacy.js'), 'utf8');
if (!/requirePrivacyAuthorize/.test(privacySrc) || !/function guard/.test(privacySrc)) {
  errors.push('utils/privacy.js 没有走 requirePrivacyAuthorize 或没有 guard');
} else checked += 1;

for (const page of ['pages/profile/profile.js', 'pages/battle/battle.js']) {
  const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const calls = (src.match(/wx\.(?:set|get)ClipboardData/g) || []).length;
  const guards = (src.match(/privacy\.guard\(/g) || []).length;
  if (!/utils\/privacy\.js/.test(src)) errors.push(page + ' 没接隐私授权模块');
  else if (guards < calls) errors.push(page + ' 有剪贴板调用没包进 privacy.guard（' + calls + ' 处调用 / ' + guards + ' 个守卫）');
  else checked += 1;
}

// 协议入口：登录页与人物页各一个，审核会点这两处。
for (const page of ['pages/login/login.js', 'pages/profile/profile.js']) {
  if (!/topic=privacy/.test(fs.readFileSync(path.join(ROOT, page), 'utf8'))) errors.push(page + ' 没有隐私与协议入口');
  else checked += 1;
}
const profileTplForLegal = fs.readFileSync(path.join(ROOT, 'pages/profile/profile.wxml'), 'utf8');
if (!/open-type="contact"/.test(profileTplForLegal)) errors.push('人物页没有客服入口（open-type="contact"）');
else checked += 1;

// 游客入口：不登录也要能进来，否则审核与玩家都卡在门口。
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
if (!/enterGuest/.test(appSrc) || !/canwu_guest/.test(appSrc)) {
  errors.push('app.js 缺游客态：没有 enterGuest 或没有落盘标记（冷启动会再挡一次登录页）');
} else checked += 1;
if (!/onGuest/.test(fs.readFileSync(path.join(ROOT, 'pages/login/login.js'), 'utf8'))) {
  errors.push('登录页没有「先不登录」入口');
} else checked += 1;

// 1d. 发布兜底的四件：分享、更新、错误、打包。
// 这四样都不影响开发时能跑，只在「发出去之后」显形：
//   - 子页没接 onShareAppMessage，右上角「转发」是灰的（玩家想发给自己都发不了）；
//   - 没有 getUpdateManager，审过的新版本玩家可能长期停在旧版；
//   - 没有 onError / onUnhandledRejection，真机上的异常线索当场蒸发；
//   - 打包不排除 docs 与 *.md，安装包白带一堆文档。
// 登录页是唯一例外：它是被 reLaunch 打开的入口页，分享它等于把登录框发给别人。
const SHARE_SKIP = ['pages/login/login'];
for (const page of appJsonEarly.pages) {
  if (SHARE_SKIP.indexOf(page) >= 0) continue;
  const src = fs.readFileSync(path.join(ROOT, page + '.js'), 'utf8');
  if (!/onShareAppMessage/.test(src)) errors.push(page + ' 没接 onShareAppMessage：右上角「转发」是灰的');
  else checked += 1;
  if (!/onShareTimeline/.test(src)) errors.push(page + ' 没接 onShareTimeline：朋友圈入口缺失');
  else checked += 1;
}

// 参悟页的分享必须带 skillId：不带就落在一门都没选的空静室上。
const practiceShare = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.js'), 'utf8');
if (!/pages\/practice\/practice\?skillId=/.test(practiceShare)) {
  errors.push('参悟页分享没带 skillId：点开的人不知道自己要看哪一门');
} else checked += 1;

// 分享文案是「让人进来」的钩子：外人看不懂门内黑话就不会点。
// 参悟那句必须带身份占位（境界 / 战力）且由页面用引擎现值填，不许退回「所修的是 X」那种自说自话。
const shareCopy = require(path.join(ROOT, 'data/copy.js')).SHARE;
const practiceShareCopy = shareCopy.practice || '';
if (!/\{skill\}/.test(practiceShareCopy) || !/\{realm\}/.test(practiceShareCopy) || !/\{power\}/.test(practiceShareCopy)) {
  errors.push('参悟分享文案缺身份占位（{skill}/{realm}/{power}）：好友看不出这是修仙战报');
} else checked += 1;
if (/\{game\}/.test(practiceShareCopy) || /所修的是/.test(practiceShareCopy)) {
  errors.push('参悟分享文案又写回了门内黑话（玩法名 / 所修的是）');
} else checked += 1;
if (!/\.replace\('\{realm\}',\s*ov\.realmName\)/.test(practiceShare)
  || !/\.replace\('\{power\}',\s*ov\.power\)/.test(practiceShare)) {
  errors.push('参悟页分享没填境界与战力：文案里的占位会原样发给好友');
} else checked += 1;

// 说明页的分享必须带回参悟那册的三个参数：topic=practice 的内容是按功法与本档
// 难度现拼的，缺 method / game / diff 就退化成一份不带功法名与门槛的泛稿。
const helpShare = fs.readFileSync(path.join(ROOT, 'pages/help/help.js'), 'utf8');
if (!/method=/.test(helpShare) || !/game=/.test(helpShare) || !/diff=/.test(helpShare)) {
  errors.push('说明页分享没带 method / game / diff：参悟那册转出去会变成泛稿');
} else checked += 1;

const APP_HOOKS = [
  ['getUpdateManager', '没有检查新版本：审核通过后玩家可能一直用旧版'],
  ['onError', '没有 onError：真机异常线索当场蒸发'],
  ['onUnhandledRejection', '没有 onUnhandledRejection：Promise 失败默认没人接'],
  ['onPageNotFound', '没有 onPageNotFound：旧链接跳空页时只剩一片空白'],
];
for (const hook of APP_HOOKS) {
  if (!new RegExp('\\b' + hook[0] + '\\s*\\(').test(appSrc)) errors.push('app.js 缺 ' + hook[0] + '：' + hook[1]);
  else checked += 1;
}

// 打包排除项：文档与工具链不该进安装包体积。
const projCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const ignores = (projCfg.packOptions && projCfg.packOptions.ignore) || [];
const hasIgnore = function (type, value) {
  return ignores.some(function (x) { return x.type === type && x.value === value; });
};
if (!hasIgnore('folder', 'docs')) errors.push('project.config.json 没排除 docs/：自检清单会一起打进安装包');
else checked += 1;
if (!hasIgnore('suffix', '.md')) errors.push('project.config.json 没排除 *.md：README 会一起打进安装包');
else checked += 1;

// 站点地图还是模板文案就等于没写：审核不看它，但它会出现在搜索结果里。
const sitemap = JSON.parse(fs.readFileSync(path.join(ROOT, 'sitemap.json'), 'utf8'));
if (!sitemap.desc || /WorkBuddy|模板/.test(sitemap.desc)) errors.push('sitemap.json 还是模板文案：' + sitemap.desc);
else checked += 1;

// 2. 所有 JS 通过 node --check
for (const f of files.filter(function (x) { return x.endsWith('.js'); })) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) errors.push('JS 语法错误: ' + rel(f) + ' — ' + String(r.stderr || '').trim().split('\n')[0]);
  else checked += 1;
}

// 3. app.json 页面四件套齐全（appJsonEarly 已在 1c 里读过，这里复用）
const appJson = appJsonEarly;
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

// 8. 功法品阶与段位约定：品阶管收益（天地玄黄），段位只由走通关数算（五段）
const skillMod = require('../data/skills.js');
const practiceMod = require('../data/practice.js');
// 功法数不写死：一门功法必须正好对应一套参悟方式，加内容时两处一起加。
if (skillMod.SKILLS.length !== practiceMod.PRACTICE_METHODS.length
  || practiceMod.TIERS.length !== 4 || practiceMod.STAGES.length !== 5) {
  errors.push('功法数与参悟方式数不等，或品阶数 / 关卡段数不符合约定');
} else {
  checked += 1;
  observe('SC-SKILL-ALL-COUNT', '功法数与参悟方式数相等，集齐门槛不写字面量');
}
const tierSeen = {};
for (const s of skillMod.SKILLS) {
  if (!practiceMod.TIERS.some((t) => t.key === s.tier)) errors.push('功法品阶非法: ' + s.id);
  else { tierSeen[s.tier] = true; checked += 1; }
  if (s.kind !== 'main' && s.kind !== 'skill') errors.push('功法分类非法: ' + s.id);
  else checked += 1;
  if (!practiceMod.METHOD_MAP[s.method]) errors.push('功法指向不存在的参悟方式: ' + s.id);
  else checked += 1;
}
// 2026-11：删掉唯一天阶功法（截锋断岳诀，另一门太虚翻卦诀降黄）后，天阶一门不剩。
// 这条从「天地玄黄四阶都非空」放宽为「黄阶必须有」——四阶非空会让删一门天阶功法
// 直接卡死校验；而黄阶是整套品阶刻度的基准，它空了才说明体系真的悬空。
if (!tierSeen.huang) errors.push('黄阶一门功法都没有，品阶体系悬空');
else checked += 1;

// 8a. 灵力体系：一种「运功的本钱」，不是钱包。
// 三条一起守，因为它们是一件事的三个面：叫什么、往哪涨、练什么才涨。
//  ① 资源名必须是「灵力」——旧名「灵气」留在页面上，玩家就会问「灵力能不能买功法」；
//  ② 气海基数随境界单调递增——若不单调，破境反而变穷，境界就只剩战力一个卖点；
//  ③ 扩容特效只能是心法（kind=main）——「练剑法把气海练大」在设定上讲不通，
//     而且会让「心法」这条主修线失去独占价值。
{
  const worldMod = require('../data/world.js');
  const economyMod = require('../data/economy.js');
  const w = worldMod.getWorld();
  if (w.resource !== '灵力') errors.push('资源名不是「灵力」：' + w.resource);
  else checked += 1;
  if (w.currency !== '灵石') errors.push('通货名不是「灵石」：' + w.currency);
  else checked += 1;
  // 四个属性各有一件正事：没有 role 就等于「练了也不知道有什么用」。
  for (const a of w.attributes) {
    if (!a.role) errors.push('属性缺 role（这一项管什么）：' + a.key);
    else checked += 1;
  }
  let prevCap = 0;
  for (const r of w.realms) {
    if (!(r.qiCap > prevCap)) errors.push('气海基数没有随境界递增：' + r.name + ' ' + r.qiCap);
    else checked += 1;
    prevCap = r.qiCap;
  }
  const effectTypes = new Set(['power', 'variance', 'qiSave', 'offline', 'qiCap']);
  for (const sk of skillMod.SKILLS) {
    if (!sk.effect || !effectTypes.has(sk.effect.type)) {
      errors.push('功法特效类型不在约定内：' + sk.id + ' → ' + (sk.effect && sk.effect.type));
      continue;
    }
    checked += 1;
    if (sk.effect.type === 'qiCap' && sk.kind !== 'main') {
      errors.push('扩容特效只能是心法：' + sk.id + ' 是 ' + sk.kind);
    } else checked += 1;
  }
  // 扩容比例有封顶（economy.QI_CAP_SKILL_MAX），全表加起来不许越过它。
  const capSum = skillMod.SKILLS.reduce(function (n, sk) {
    return n + (sk.effect.type === 'qiCap' ? sk.effect.value : 0);
  }, 0);
  if (capSum > economyMod.QI_CAP_SKILL_MAX + 1e-9) {
    errors.push('所有心法的扩容加起来超过了封顶：' + capSum + ' > ' + economyMod.QI_CAP_SKILL_MAX);
  } else checked += 1;
  // 旧名「灵气」不许再出现在玩家看得见的文字里（含 README 的当前事实段）。
  // 例外只有一类：外部资料的逐字摘录（docs/specs/constitution/07-外部实践资料.md）。
  // 它引用的是别家原文，改字就不是摘录了。但只放行 `>` 引用行——同一文件里的
  // 叙述段仍然不许写旧名，否则下一个人会把它当成我们的现行口径抄出去。
  const EXTERNAL_QUOTE_DOCS = new Set(['docs/specs/constitution/07-外部实践资料.md']);
  for (const f of files.filter(function (x) {
    return /\.(js|wxml|wxss|json|md)$/.test(x) && rel(x) !== 'scripts/verify.js';
  })) {
    const src = fs.readFileSync(f, 'utf8');
    const quoteOnly = EXTERNAL_QUOTE_DOCS.has(rel(f));
    const badLines = src.split(/\r?\n/).filter(function (line) {
      // 先去空白再匹配：旧名曾被人写成「灵 气」绕过字面量扫描，
      // 玩家读到的是同一个错口径，闸门不能只看连续两个字。
      const compact = line.replace(/\s+/g, '');
      return compact.indexOf('灵气') >= 0 && !(quoteOnly && /^\s*>/.test(line));
    });
    if (badLines.length) errors.push(rel(f) + ' 还写着旧资源名「灵气」（外部摘录的引用行除外）');
    else checked += 1;
  }
  // 反证守卫：白名单文件必须真的存在且确有引用行。否则删掉那篇文档后，
  // 上一段的例外就成了没人用的空口子，将来任何 md 都可能被顺手加进来。
  for (const doc of EXTERNAL_QUOTE_DOCS) {
    const p = path.join(ROOT, doc);
    if (!fs.existsSync(p)) { errors.push('外部摘录白名单文件不存在：' + doc); continue; }
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    const inQuote = lines.filter(function (line) {
      return /^\s*>/.test(line) && line.replace(/\s+/g, '').indexOf('灵气') >= 0;
    }).length;
    if (!inQuote) errors.push(doc + ' 没有含原文旧名的引用行：放行口子已失效，应从白名单移除');
    else checked += 1;
  }
}

// 8a-2. 约束分层框架：文档里的「不做」是默认值，不是硬约束。
// 2026-11 踩过一次：拿「体验目标第 5 条白纸黑字」否决业界回访手段，把产品判断当成了物理定律。
// 这里只钉框架的存在与口径，不钉具体结论——结论本来就该能翻案（§5.2 的浅色主题就是先例）。
// 少任何一处，下一个人就又会拿旧文档当硬约束。
const visionDoc = fs.readFileSync(path.join(ROOT, 'docs/specs/constitution/01-产品定位与体验目标.md'), 'utf8');
const LAYER_MARKS = [
  ['## 5. 约束分层：哪层真不能动，哪层只是默认值', '产品愿景丢了三层约束框架'],
  ['| **一 · 定义** |', '三层约束缺了「定义」层（修仙 + 功法即小游戏）'],
  ['| **二 · 一致性** |', '三层约束缺了「一致性」层（守恒 / 资质 / 评级线）'],
  ['| **三 · 默认值** |', '三层约束缺了「默认值」层'],
  ['**第一、二层才是硬约束**，第三层是产品判断', '产品愿景没写清哪两层才是硬约束'],
  ['**怎么分二、三层**', '产品愿景缺了「加内容 vs 换守恒」的判据'],
  ['### 5.1 默认值松绑时要连带重算什么', '缺了松绑时的连带重算表'],
  ['### 5.2 明确不做（默认值清单，按需可调整）', '「不做」清单没降级为可调整默认值'],
  ['**这是第三层默认值，不是硬约束**（判定见 §5）', '§3 的「参悟不产资源」咬合点没标注为默认值'],
  ['第 5 条属于第三层默认值（判定见 §5）', '§4 的「不惩罚离开」没标注为默认值'],
];
for (const [mark, msg] of LAYER_MARKS) {
  if (visionDoc.indexOf(mark) < 0) errors.push(msg);
  else checked += 1;
}
// 口径反证：不许把第三层默认值的「不惩罚离开」重新写成不可动的硬约束。
if (/第\s*5\s*条[^。\n]{0,24}硬约束/.test(visionDoc)) {
  errors.push('产品愿景又把「不惩罚离开」写成了硬约束（第三层默认值可被松绑）');
} else checked += 1;

// 8a-3. 今日机缘接线：纯叙事钩子，不许长成签到领奖系统。
// 真源 → 引擎 → 主页 → 说明页，四处都要在；少一处就是「文档写了但玩家看不到」。
const chanceSrc = fs.readFileSync(path.join(ROOT, 'data/world.js'), 'utf8');
if (!/DAILY_CHANCES/.test(chanceSrc)) errors.push('world.js 没有今日机缘真源 DAILY_CHANCES');
else checked += 1;
const chanceEngine = engineSrc();
if (!/function dailyChance\s*\(/.test(chanceEngine)) errors.push('内核没有 dailyChance()：今日机缘无法按日期选条');
else checked += 1;
const chanceIndexJs = fs.readFileSync(path.join(ROOT, 'pages/index/index.js'), 'utf8');
const chanceIndexWxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
if (!/chance:\s*engine\.dailyChance\(\)/.test(chanceIndexJs)) errors.push('主页没接 dailyChance：今日机缘不会随日期更新');
else checked += 1;
if (!/onChance/.test(chanceIndexJs) || !/bindtap="onChance"/.test(chanceIndexWxml)) {
  errors.push('今日机缘没有点击入口（onChance 或 wxml 绑定缺失）');
} else checked += 1;
const helpSrcForChance = fs.readFileSync(path.join(ROOT, 'data/help.js'), 'utf8');
if (!/title: '今日机缘'/.test(helpSrcForChance)) errors.push('说明页没有今日机缘一节：玩家不知道这是什么');
else checked += 1;
// 反证：真源里的每条机缘都必须指向已有导航键，不许出现「领奖 / 签到 / 补签」这类
// 会把纯钩子变成任务系统的动作词。
const chanceDefs = chanceSrc.match(/\{ key: '[^']+', text: '[^']+', action: '[^']+' \}/g) || [];
if (chanceDefs.length < 2) errors.push('今日机缘真源不足两条，跨天换不起来');
else checked += 1;
for (const def of chanceDefs) {
  if (/签到|领奖|补签|连续登录/.test(def)) errors.push('今日机缘出现签到/领奖语义：' + def);
  else checked += 1;
}

// 8a-4. 道牒图两页共用：人物页与静室页结算卡必须走同一份绘制，
// 且各自要有 canvas 节点。复制一份画布代码 = 两个入口迟早出两张不同的图。
const cardMod = require(path.join(ROOT, 'utils/card.js'));
if (typeof cardMod.drawCard === 'function' && typeof cardMod.dataOf === 'function') checked += 1;
else errors.push('utils/card.js 没导出 drawCard / dataOf：两页没法共用一张道牒');
for (const pg of ['pages/profile/profile.js', 'pages/practice/practice.js']) {
  const src = fs.readFileSync(path.join(ROOT, pg), 'utf8');
  if (!/card\.dataOf\(/.test(src) || !/card\.makeCard\(/.test(src)) {
    errors.push(pg + ' 没走共用的道牒绘制（card.dataOf / card.makeCard）');
  } else checked += 1;
  const wxml = fs.readFileSync(path.join(ROOT, pg.replace('.js', '.wxml')), 'utf8');
  if (!/id="shareCanvas"/.test(wxml)) errors.push(pg + ' 缺 shareCanvas 节点：道牒导出取不到画布');
  else checked += 1;
}
if (!/makeCard: '生成道牒'/.test(fs.readFileSync(path.join(ROOT, 'data/copy.js'), 'utf8'))) {
  errors.push('道牒入口文案没进 copy.js 真源');
} else checked += 1;

// 8a-5. 本局进境：结算卡正面必须把「这一局让修士变了的事」显示出来。
// 两套结算 UI（舞台演出 / 普通弹层）都要有，少一套就有一门看不到。
const settleSrc = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.js'), 'utf8');
const settleWxml = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.wxml'), 'utf8');
if (!/milestones:\s*milestones/.test(settleSrc) || !/const milestones = \[\]/.test(settleSrc)) {
  errors.push('结算没构造本局进境（milestones）：打一局与修仙变强之间没有可见因果');
} else checked += 1;
if ((settleWxml.match(/result\.milestones\.length > 0/g) || []).length < 2) {
  errors.push('本局进境没有在两套结算 UI 都显示（舞台演出 / 普通弹层缺一处）');
} else checked += 1;
if (!/走通第 ' \+ rec\.cleared \+ ' 关，入「/.test(engineSrc())) {
  errors.push('晋段没记进修行日志：玩家回看不到「我什么时候进的小成」');
} else checked += 1;

// 8b. 功法命名规范：前缀 = 类别、分隔符唯一、正名四到六字且用体裁字、不写等级词。
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
// 三字正名整批退役（2026-11）：三个字装不下一件东西加一个动作，十五门统一改五字，
// 旧名全部留在这里——名字一旦回退，玩家在同一门功法上就会看到两个名字。
const LEGACY_SKILL_NAMES = [
  '刀法·开锋诀', '阵法·燃灯诀', '心法·吐纳诀', '心法·静心诀', '身法·踏云步',
  '阵法·勘禁诀', '阵法·五行诀', '水术·凝露诀', '剑法·断岳诀', '心法·太虚诀',
  '御灵·并蒂引', '土术·垒岳诀', '灵植·三秀诀', '术数·九宫诀', '合术·叠元诀',
  '目术·逐数诀', '机巧·让路诀', '挪移·入位诀', '辨术·摘魁诀',
  // 2026-11 第二次整批退役：类别从「玩家在屏幕上做什么」改成「修士靠什么手段修行」
  // （术数→阵法、合术→丹道、目术 / 辨术→神识、机巧 / 挪移→机关、土术→土行），
  // 正名同时从操作描述改成意象。旧名回退 = 玩家在同一门功课上看到两个名字。
  '刀法·开锋斩桩诀', '阵法·点灯破阵诀', '心法·静心记诵诀', '心法·太虚翻卦诀',
  '御灵·并蒂牵线引', '土术·万石成岳诀', '术数·九宫排数诀', '合术·同数叠元诀',
  '目术·扫目逐数诀', '机巧·让主出阵诀', '挪移·石箱归位诀', '辨术·一眼摘魁诀',
  // 2026-11-18 第三批：五门从「物件 / 动作」正名换成纯意象正名。旧名回退 = 同一门两个名字。
  '阵法·星罗点灯诀', '阵法·循数勘禁诀', '灵植·三秀连收诀', '丹道·同源叠元诀', '机关·移山开路诀',
  // 更早的一批（无前缀 / 类别错置），一并留着。
  '基础刀法', '吐纳诀', '剑诀·断岳', '灵契·并蒂引', '阵法·小五行阵', '丹道·凝露丹方', '丹道·凝露方',
];
for (const f of files.filter(function (x) { return (x.endsWith('.js') || x.endsWith('.wxml')) && rel(x) !== 'scripts/verify.js'; })) {
  const src = fs.readFileSync(f, 'utf8');
  // 一个文件算一项：按「文件 × 名字」计数会让「多加一个旧名」凭空涨几十项，
  // 静态项数就不再是「查了多少处」，而是「名单有多长」。
  const back = LEGACY_SKILL_NAMES.filter(function (oldName) { return src.indexOf("name: '" + oldName + "'") >= 0; });
  if (back.length) errors.push(rel(f) + ' 又写回了旧功法名：' + back.join('、'));
  else checked += 1;
  // 三字正名不再单独做「形状扫描」：全项目里带「·」的 name 还有对手（妖兽·青鳞狸），
  // 扫形状只会误伤。真正的闸在 validateNames()：它逐门读 SKILLS，正名短于 titleMin 直接红。
}

// 8b-1. 玩法名同样会过期。旧功法「三秀连收诀」退役成「三秀撷英诀」之后，玩法名还留着
// 「三秀同收」——准备页就成了「三秀撷英诀 · 三秀同收」，同一门功课看着像两门
// （前者是门派里的叫法，后者是盘面上的动作，两层本该各说各的）。
// 只查真源（practice.GAME_LABELS 与各模块导出的 name），不扫全文：
// 文档与注释里的旧名要留着，否则历史叙述会变成「从 X 改成 X」。
const LEGACY_GAME_NAMES = ['三秀同收'];
for (const g of Object.keys(practiceMod.GAME_LABELS)) {
  const label = practiceMod.GAME_LABELS[g];
  if (LEGACY_GAME_NAMES.indexOf(label) >= 0) errors.push('玩法名还是旧名：' + g + ' → ' + label);
  else checked += 1;
}

// 8b-2. effect.text 的前缀是这门功法的门面（'九宫：参悟耗灵力 −9%'），改名时最易漏。
// 规则：门面词必须出现在这一门的正名里，只有两个意象词可以例外——刀意（开锋斩桩诀）、
// 灯势（点灯破阵诀），它们说的是「这一门的气」，不是动作。白名单同样反向自检：
// 有词没人用就得删，否则它只是给下一次漏改留了个后门。
// 另有 staleEffectWords 挡住更早的废弃名（择大）。
const EFFECT_IMAGE_WORDS = ['刀意', '灯势'];
const staleEffectWords = ['择大'];
for (const s of skillMod.SKILLS) {
  const effectText = (s.effect && s.effect.text) || '';
  for (const word of staleEffectWords) {
    if (effectText.indexOf(word) >= 0) errors.push('功法效果文案还写着旧名「' + word + '」：' + s.id + ' → ' + effectText);
    else checked += 1;
  }
  const title = String(s.name).split(skillMod.NAME_RULE.sep)[1] || '';
  const label = effectText.split('：')[0];
  if (!label) continue;
  if (title.indexOf(label) < 0 && EFFECT_IMAGE_WORDS.indexOf(label) < 0) {
    errors.push('功法效果的门面词「' + label + '」不在正名「' + title + '」里，改名漏了这一处：' + s.id);
  } else checked += 1;
}
for (const word of EFFECT_IMAGE_WORDS) {
  const used = skillMod.SKILLS.some(function (s) { return ((s.effect && s.effect.text) || '').indexOf(word + '：') === 0; });
  if (!used) errors.push('意象词「' + word + '」在 EFFECT_IMAGE_WORDS 里已无人使用，请从白名单删掉');
  else checked += 1;
}

// 8b-2b. 境界只回答两件事，必须是两个字段：realmReady（到没到学习门槛，管能不能开练）
// 与 decayed（超没超收益上限，只管打几折）。合成一个 realmOk 管两件事，就会出现
// 「金丹期练不了黄阶」——金丹 3 大于黄阶上限 2，被当成门槛未到。
// 这条断言挡两手：字段名不许回头，门槛判定不许把上界掺进去。
{
  const errsBeforeRealm = errors.length;
  const gameSrc = engineSrc();
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

// 8b-2c. 失败（F）是整局作废，不是「最低一档」：倍率必须是 0，
// 玩家看到的说法必须是「没有收益」，不许再写回「两成」这种打折口径。
{
  const worldMod = require('../data/world.js');
  if (worldMod.GRADE_FACTOR.F !== 0) errors.push('GRADE_FACTOR.F 不是 0：失败该整局作废，不是打两折');
  else checked += 1;
  let doubled = 0;
  for (const f of files.filter(function (x) { return /minigames[\\/][a-z]+\.js$/.test(x); })) {
    if (fs.readFileSync(f, 'utf8').indexOf('两成') >= 0) {
      errors.push(rel(f) + ' 的说明文案又写回了「两成收益」：失败是零收益');
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
  ['docs/specs/spec/00-契约/checklist-puzzle.md', fs.readFileSync(path.join(ROOT, 'docs/specs/spec/00-契约/checklist-puzzle.md'), 'utf8')],
];
for (const [name, src] of docPairs) {
  if (src.indexOf('有失败态的' + cnCount(failGames.length) + '门') < 0) {
    errors.push(name + ' 的 C/F 分组没跟上真源：现有 ' + failGames.length + ' 门有失败态（' + failGames.join(' / ') + '）');
  } else checked += 1;
  if (src.indexOf(cnCount(safeGames.length) + '门（刀法') < 0) {
    errors.push(name + ' 的 C/F 分组没跟上真源：现有 ' + safeGames.length + ' 门无失败态');
  } else checked += 1;
}

// 8b-3b. 灵石经济账：藏经阁门数、灵石总需求与缺口从真源现算，文档与玩家文案同步。
// 2026-11 删门后藏经阁只剩 1 门可换（澄心 70），需求从 783 掉到 490、缺口从 317 掉到 24。
// 当时三处都写旧账，验证脚本却全绿——因为没有任何断言读这本账。这里把账钉在真源上：
// 再删门、加门或改破境价，文档与 guide 不跟着改就报红，不再靠人肉发现。
{
  const econLedger = require('../data/economy.js');
  const oppLedger = require('../data/opponents.js');
  const shopList = skillMod.SKILLS.filter(function (s) { return s.source && s.source.kind === 'shop'; });
  const shopStoneSum = shopList.reduce(function (n, s) {
    return n + ((s.source.cost && s.source.cost.stone) || 0);
  }, 0);
  const breakSum = econLedger.BREAKTHROUGH_STONE.reduce(function (a, b) { return a + b; }, 0);
  const needSum = shopStoneSum + breakSum;
  const incomeSum = oppLedger.OPPONENTS.reduce(function (n, o) { return n + ((o.reward && o.reward.stone) || 0); }, 0)
    + oppLedger.SECRET_REALMS.reduce(function (n, o) { return n + ((o.reward && o.reward.stone) || 0); }, 0)
    + (oppLedger.OPPONENTS.length + oppLedger.SECRET_REALMS.length) * econLedger.FIRST_CLEAR_STONE;
  const gap = needSum - incomeSum;
  const ledgerSrc = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/系统设计/03-economy-flow.md'), 'utf8');
  const guideSrc = fs.readFileSync(path.join(ROOT, 'pages/guide/guide.js'), 'utf8');
  const readmeLedgerSrc = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const ledgerBad = [];
  const shopCount = String(shopList.length);
  if (ledgerSrc.indexOf('藏经阁 ' + shopCount + ' 门合计') < 0) ledgerBad.push('经济篇门数');
  if (ledgerSrc.indexOf('| **总需求** | **' + needSum + '** |') < 0) ledgerBad.push('经济篇总需求');
  if (ledgerSrc.indexOf('缺口 ' + gap + ' 枚') < 0) ledgerBad.push('经济篇缺口');
  if (guideSrc.indexOf(shopCount + ' 门，' + shopStoneSum + ' 枚') < 0) ledgerBad.push('玩法说明藏经阁文案');
  if (readmeLedgerSrc.indexOf('余 ' + shopCount + ' 门，' + shopStoneSum + ' 枚') < 0) ledgerBad.push('根 README 藏经阁数字');
  if (ledgerBad.length) {
    errors.push('灵石账没跟上真源：现算 ' + shopCount + ' 门 / ' + shopStoneSum + ' 石，需求 ' + needSum
      + '，缺口 ' + gap + '；不同步处：' + ledgerBad.join('、'));
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
  ['schulte', 'FADE', 'SCHULTE_FADE'],
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

// 8b-5b. 推石入位：档位表是「生成参数」而不是「第几张图」，两处一旦分叉，
// 准备页会写「7×7 盘 · 3 处阵位」，局内却按 4×4 抽一箱图——只有连打两局才看得出来。
// pulls 是模块自己的生成强度（不注入 params），不参与比对。
{
  const mod = gameMod.MODULES.pushbox;
  if (!mod || !Array.isArray(mod.GEN) || mod.GEN.length !== 5) {
    errors.push('pushbox.GEN 不是五档');
  } else {
    checked += 1;
    const keys = ['inner', 'boxes', 'walls', 'minOpt', 'maxOpt'];
    practiceMod.PUSHBOX_LEVELS.forEach(function (lv, i) {
      for (const k of keys) {
        if (mod.GEN[i][k] !== lv[k]) {
          errors.push('pushbox 第 ' + i + ' 档的 ' + k + ' 与 practice.PUSHBOX_LEVELS 分叉：'
            + mod.GEN[i][k] + ' vs ' + lv[k]);
        } else checked += 1;
      }
    });
  }
}

// 8b-5c. 落石垒基按 Tetris Guideline 做，九样机制里有两样最容易被「顺手改个数字」破坏：
//   ① 盘面是标准场地 10×20，不许从 params 读 cols / rows——行数一改，这一门就不成立了；
//   ② 重力表必须等于 (0.8 − (L−1)×0.007)^(L−1) 秒（15 级封顶 7ms），不是手拍的一串数。
// 评级线随档走（BLOCK_LEVELS 的 sLine）由 rank.test.js 与 audit:diff 另看着。
{
  const blocksMod = gameMod.MODULES.blocks;
  const blocksSrc = fs.readFileSync(path.join(ROOT, 'minigames/blocks.js'), 'utf8');
  // 原写法里 \b 被写成了真实的退格字符，这条守卫从落地起就没匹配过任何东西。
  // 落石盘面固定 10×20，不许从参数读 cols/rows。
  // 只扫代码行：注释里写着「不接 params.cols / rows」也会被字面量正则命中，
  // 那是规则说明，不是真在读参数。
  const blocksCode = blocksSrc.split(/\r?\n/).filter(function (l) { return !/^\s*(\/\/|\*)/.test(l); }).join('\n');
  if (/params\.(cols|rows)\b/.test(blocksCode)) {
    errors.push('落石垒基从 params 读盘面尺寸（标准场地固定 10×20，盘面不是难度旋钮）');
  } else checked += 1;
  if (!Array.isArray(blocksMod.GRAVITY_MS) || blocksMod.GRAVITY_MS.length !== 15) {
    errors.push('落石垒基的重力表不是 15 级');
  } else {
    for (let i = 0; i < 15; i += 1) {
      const want = Math.round(Math.pow(0.8 - i * 0.007, i) * 1000);
      if (Math.abs(blocksMod.GRAVITY_MS[i] - want) > 2) {
        errors.push('落石垒基重力表第 ' + (i + 1) + ' 级偏离 Guideline 曲线：' + blocksMod.GRAVITY_MS[i] + ' vs ' + want);
      } else checked += 1;
    }
  }
  if (blocksMod.SHAPES.length !== 7) errors.push('落石垒基不是七种块（7-bag 要求七种各一个）');
  else checked += 1;
}
// 8b-5d. 章内旋钮必须真被玩法层读走，而且必须真有人给值。只生成不消费是最隐蔽的一种
// 失效：界面上写着「S 线 94%」，盘面却一关都没变，200 关打下来是同一局——而且静态校验
// 全绿，因为值确实生成了。勘位辨禁的 lineScale 就这样静默失效过。
//
// 反过来也一样：玩法层写了 p.capFactor || 2.4，档位表却不给 capFactor，那句 || 就永远
// 生效——界面上写「预算 ×2.40」，五档一模一样。滑块让路的预算系数这样错过一次。
{
  const KNOB_READ = {
    merge: ['fourRate'],
    mines: ['lineScale'],
    klotski: ['capFactor'],
    blocks: ['startLevel', 'linesPerLevel'],
    biggest: ['timeLimit', 'nearGap'],
  };
  const practiceMod = require(path.join(ROOT, 'data/practice.js'));
  for (const knobGame of Object.keys(KNOB_READ)) {
    const knobSrc = fs.readFileSync(path.join(ROOT, 'minigames/' + knobGame + '.js'), 'utf8');
    for (const knobKey of KNOB_READ[knobGame]) {
      // 不用反斜杠转义（这个仓库的文件混着 CRLF / LF，手写 \\s 极易在转手中变成字面 s）：
      // 空格用字符类，点号用 [.]，词尾用否定前瞻。
      if (!new RegExp('(p|params)[ ]*[.][ ]*' + knobKey + '(?![a-zA-Z])').test(knobSrc)) {
        errors.push('minigames/' + knobGame + '.js 没读 ' + knobKey + '：章内旋钮只生成不消费，界面报的「本关变化」就是假话');
        continue;
      }
      checked += 1;
      // 消费端有人读，还得有人喂：档位表或章内收紧给出的参数里必须有这个键，
      // 否则模块里那句 || 兜底永远生效，五档其实是同一个数。
      const method = practiceMod.PRACTICE_METHODS.filter(function (x) { return x.game === knobGame; })[0];
      if (!method) { errors.push('PRACTICE_METHODS 里没有 ' + knobGame + '，8b-5d 查不了它的旋钮'); continue; }
      const seenAt = [1, 200].some(function (lv) {
        const q = practiceMod.buildParamsAt(method, lv);
        return q && typeof q[knobKey] === 'number';
      });
      if (!seenAt) errors.push(knobGame + ' 的 ' + knobKey + ' 没有任何一关给出数值：玩法层那句 || 兜底永远生效，五档其实是同一个数');
      else checked += 1;
    }
  }
}
// 8b-5e. 灵纹连线整段整改的守卫。这一门同时踩过四种「全绿但没生效」：
//   ① 生成了没消费：flashMs 按档缩放，玩法层根本不读，200 关报「0.75 → 0.74 秒」；
//   ② 消费了没生成：duration 写 p.duration || 55，档位表却没人给，五档一个数；
//   ③ 尺子量不出东西：最低完成分 1200 > A 线 1199，B/C 是死线，HUD 还报「已入 S」再结算 F；
//   ④ 方向反了：时辰「越小越难」却走「章内收三成、换章复位」，章末比下章首关还紧。
// 这一段守的是结果，不只是「参数有没有变」——A8 / A9 两次都是静态全绿、玩家层全错。
{
  const m = practiceMod.getMethod('linkpair');
  const linkMod = gameMod.MODULES.link;
  const linkSrc = fs.readFileSync(path.join(ROOT, 'minigames/link.js'), 'utf8');
  // 头注释里写着旧版怎么错的（「已入 S」是反面教材），断言只查真代码。
  const linkCode = linkSrc.replace(/\/\/[^\n]*/g, '');
  const seed = m.params || {};
  if (typeof seed.hintMs !== 'number' || typeof seed.flashMs === 'number') {
    errors.push('linkpair 的种子参数没换成 hintMs：flashMs 会被按档缩放并报毫秒假变化');
  } else checked += 1;
  if (!/(p|params)[ ]*[.][ ]*hintMs(?![a-zA-Z])/.test(linkSrc)) {
    errors.push('minigames/link.js 没读 hintMs：照纹高亮时长只生成不消费');
  } else checked += 1;
  if (/(p|params)[ ]*[.][ ]*flashMs(?![a-zA-Z])/.test(linkSrc)) {
    errors.push('minigames/link.js 还在读 flashMs：提示变短不是玩家本事要求变高');
  } else checked += 1;
  // 布纹偏斜已退役（实测方向反了：同纹成堆会把可连量抬高）。反过来钉住它不许回来：
  // 生成端不再出 weave，玩法层不再读 weave，派牌只按纹种均分。
  // 满盘同理：曾经 levels.js 生成 gaps、link.js 按空位派牌，那副「盘上缺块」已被否掉。
  const levelsSrc = fs.readFileSync(path.join(ROOT, 'data/levels.js'), 'utf8');
  if (/out\.weave\s*=/.test(levelsSrc)
      || /(p|params)[ ]*[.][ ]*weave(?![a-zA-Z])/.test(linkSrc)
      || /makeBoard\(hole, kinds, weave/.test(linkSrc)
      || typeof linkMod.pairCounts !== 'function') {
    errors.push('linkpair 又长出布纹偏斜了：它把同纹组合数抬高一截，可连量反而变多（实测 14.3 → 20.0）');
  } else checked += 1;
  if (/out\.gaps\s*=/.test(levelsSrc) || /linkGapsAt|LINK_LAYOUTS|out\.layout\s*=/.test(levelsSrc)) {
    errors.push('linkpair 又长出盘形空位了：并蒂引必须是满盘矩形，一格缺口都不许有');
  } else checked += 1;
  // 折数是段间难度轴：practice.js 生成 turns，link.js 的判定 / 提示 / 重排三处都得读。
  // 只生成不消费时盘面与提示会分叉（「照纹说能连、点上去连不上」），而界面不报错。
  const practiceSrc = fs.readFileSync(path.join(ROOT, 'data/practice.js'), 'utf8');
  const turnCalls = (linkSrc.match(/(?:findPath|findPair|canLink)\([^)]*board, cols, rows[^)]*\)/g) || []);
  if (!/LINK_LEVELS[\s\S]{0,900}turns/.test(practiceSrc)
      || !/const turnsLimit = turnsOf\(p\)/.test(linkSrc)
      || turnCalls.length < 6
      || turnCalls.some(function (s) { return !/turns(Limit)?\b/.test(s); })) {
    errors.push('linkpair 的折数没接成：生成端 turns 没到判定 / 提示 / 重排');
  } else checked += 1;
  let hintStable = true;
  let sourced = true;
  let perPairOk = true;
  let reportOk = true;
  let reported = 0;
  let prevPP = null;
  // 走完整门 1000 关：一关一副参数，只抽查前 200 关会把「后 800 关一动不动」漏掉。
  const linkMax = require(path.join(ROOT, 'data/levels.js')).LEVEL_MAX;
  for (let lv = 1; lv <= linkMax; lv += 1) {
    const q = practiceMod.buildParamsAt(m, lv);
    if (q.hintMs !== seed.hintMs) hintStable = false;
    // 时辰必须由 linkDurationAt(关号) 现算，不许退回「章内收三成、换章复位」。
    if (q.duration !== practiceMod.linkDurationAt(lv)) sourced = false;
    // 比的是「每对预算」而不是「总时辰 ÷ 对数」：后者是整数秒的商，
    // 换段时对数从 12 跳到 14，商的粒度变了会天然回弹一次，那不是变松。
    const pp = practiceMod.linkPerPairAt(lv);
    if (prevPP !== null && pp > prevPP + 1e-9) perPairOk = false;
    prevPP = pp;
    if (lv > 1) {
      const items = practiceMod.levelDelta(m, lv);
      const txt = items.map(function (x) { return x.text; }).join(' / ');
      if (/flashMs|hintMs|亮起时长/.test(txt)) reportOk = false;
      const mm = /每对时辰 ([\d.]+) → ([\d.]+) 息/.exec(txt);
      if (mm && Number(mm[2]) > Number(mm[1])) reportOk = false;
      // 末关那条「本门最后一关」回答的是终点，不是「这一关比上一关变了什么」，
      // 与 tests/rank.test.js 的「真变」逐关对齐时不能算进来——两处口径不一样，
      // 就会一个说 435、一个说 434，而两条闸门各自都是绿的。
      if (items.some(function (x) { return x.key !== 'final'; })) reported += 1;
    }
  }
  if (!hintStable) errors.push('linkpair 的 hintMs 在 1000 关里变了：照纹亮多久不是难度旋钮');
  else checked += 1;
  if (!sourced) errors.push('linkpair 的时辰没按 linkDurationAt(关号) 现算：章末会倒挂到下章首关之上');
  else checked += 1;
  if (!perPairOk) errors.push('linkpair 的每对预算有一关往松走：换章时辰变长可以，每对不该变宽');
  else checked += 1;
  if (!reportOk) errors.push('linkpair 的 levelDelta 又报毫秒假变化，或把变长的总时辰写成变难');
  else checked += 1;
  if (reported < 30) errors.push('linkpair 全书只有 ' + reported + ' 关有规格台阶，低于 30 级下限');
  else checked += 1;

  // 段内台阶：每一段的每对预算都要「段首最宽、段末最紧」，五段首尾相接（段末 = 下段首），
  // 且段内至少收 5%。旧版全书一条直线，第一段 10 关只收 1.5%——名义在收、体感是平的。
  // 布纹偏斜退役后，这一段内唯一在动的量就是它，所以逐段都要钉住。
  const levelsMod = require(path.join(ROOT, 'data/levels.js'));
  let rampOk = true;
  let rampWorst = 9;
  for (let i = 0; i < levelsMod.STAGES.length; i += 1) {
    const st = levelsMod.STAGES[i];
    const a = practiceMod.linkPerPairAt(st.from);
    const b = practiceMod.linkPerPairAt(st.to);
    const shrink = (a - b) / a;
    if (!(b < a) || shrink < 0.05) rampOk = false;
    if (shrink < rampWorst) rampWorst = shrink;
    if (i > 0) {
      const prevEnd = practiceMod.linkPerPairAt(levelsMod.STAGES[i - 1].to);
      if (Math.abs(a - prevEnd) > 1e-9) rampOk = false;
    }
  }
  if (!rampOk) errors.push('linkpair 的段内每对预算断了：段末没收紧（最少一档 ' + (rampWorst * 100).toFixed(1)
    + '%），或段首与上一段段末接不上（会凭空多出一个台阶）');
  else checked += 1;
  // 派牌的总对数守恒，每种纹至少留一对——否则「纹种数不变」是句假话。
  let countsOk = true;
  for (const spec of [[12, 4], [12, 5], [12, 6], [21, 6], [35, 6]]) {
    const cs = linkMod.pairCounts(spec[0], spec[1]);
    if (cs.length !== spec[1] || cs.reduce(function (a, b) { return a + b; }, 0) !== spec[0]
        || cs.some(function (x) { return x < 1; })) countsOk = false;
    if (Math.max.apply(null, cs) - Math.min.apply(null, cs) > 1) countsOk = false;
  }
  if (!countsOk) errors.push('linkpair 的派牌不守恒，或又开始偏斜了（只许均分，余数各加一对）');
  else checked += 1;

  // 评级四条线逐档可达，且 C 带非空；失败线必须单独给（C 与 F 是两个结论）。
  let gradesOk = true;
  for (const k of practiceMod.STAGES.map(function (d, i) { return i; })) {
    const p = practiceMod.buildParams(m, k);
    const g = linkMod.gradeLefts(p.duration);
    if (!(g.s > g.a && g.a > g.b && g.b > 0)) { gradesOk = false; break; }
    const got = [g.s, g.a, g.b, g.b - 1].map(function (x) { return linkMod.gradeByLeft(x, p.duration); });
    if (got.join('') !== 'SABC') { gradesOk = false; break; }
    const ls = linkMod.lines(p);
    // 前四条是 S/A/B/C，第五条是「本段容错」——评级的四条必须在最前面。
    if (ls.items.length !== 5 || !ls.fail) { gradesOk = false; break; }
  }
  if (!gradesOk) errors.push('linkpair 的 S/A/B/C 有一档取不到，或 lines() 缺失败线');
  else checked += 1;
  // 局内不许摆「当前评级」：评级按收干净那一刻的剩余息定，倒计时一开始是满的，摆出来必然是 S。
  if (/已入 S/.test(linkCode) || /goalFor\s*\(/.test(linkCode) || !/showGradeNow = false/.test(linkCode)) {
    errors.push('link.js 把局内评级摆回 HUD 了：收完之前评级定不下来，旧版会报「已入 S」再结算 F');
  } else checked += 1;
  // 死局自移：前两段必须免费（死局是运气），大成起收明码代价但**不许判负**——
  // 把玩家卡在死盘前，比多扣几息坏得多。三条一起钉：次数与代价来自 LINK_FAIR、
  // 用尽后翻倍而不是结束、扣息走「剩余息」且断连收。
  if (/function reshuffle\(\)[\s\S]*?\n  }/.test(linkSrc)) {
    const body = /function reshuffle\(\)[\s\S]*?\n  }/.exec(linkSrc)[0];
    const fair = practiceMod.LINK_FAIR;
    const freeOk = fair[0].shuffleCost === 0 && fair[1].shuffleCost === 0 && fair[2].shuffleCost === 0;
    // 原写法两个分支是同一个正则（复制粘贴），等价于只查一次。
    // 只拦「无条件判负」finishOnce('F')：reshuffle 末尾那种息尽收场调用 finish()
    // 是全局唯一的正常收场路径，不是「重排用尽就罚运气」，不能误伤。
    if (/finishOnce\('F'/.test(body)) {
      errors.push('link.js 的自移用尽会判负：死局是运气，罚到 F 就是罚运气');
    } else if (!/const over = reshufflesLeft <= 0/.test(body) || !/\* \(over \? 2 : 1\)/.test(body)) {
      errors.push('link.js 的自移没做成「原价 N 次、用尽翻倍」：有限次数的代价只剩一种写法');
    } else if (!/combo = 0/.test(body) || !/left = Math.max\(0, left - cost\)/.test(body)) {
      errors.push('link.js 的自移没扣剩余息或没断连收：代价看不见等于没代价');
    } else if (!freeOk) {
      errors.push('LINK_FAIR 的前三段开始收自移费了：死局是盘面随机摆的，罚息等于罚运气');
    } else checked += 1;
  }
  // 阶段新法要「加规则」不是「减难度」；旧版「照纹 / 自移不再扣息」两条都已退役。
  const names = practiceMod.stageRulesOf('linkpair').map(function (r) { return r.name; });
  if (names.join('/') !== '照纹/双照') errors.push('linkpair 的阶段新法不是「照纹 / 双照」：便利必须留明码代价');
  else checked += 1;
  const guidesSrc = fs.readFileSync(path.join(ROOT, 'data/guides.js'), 'utf8');
  const at = guidesSrc.indexOf('  link: {');
  const end = at >= 0 ? guidesSrc.indexOf('\n  },', at) : -1;
  const guide = at >= 0 && end > at ? guidesSrc.slice(at, end) : '';
  if (!guide || /不再扣息|少 3 息|按已收对数结算|剩余息数 ×4/.test(guide)) {
    errors.push('data/guides.js 的 link 段还写着旧代价句，说明页会照抄成假话');
  } else checked += 1;
  // 玩法文档十六门一律是「中文正名目录 + 总览.md + 五段」；单篇形态已退役，不再兜底。
  // 路径钉到中文正名，目录名被改回英文 stem 时这里会当场报错，不会静默读旧文件。
  const docPath = path.join(ROOT, 'docs/specs/spec/玩法设计/11-并蒂连枝引/总览.md');
  const doc = fs.readFileSync(docPath, 'utf8');
  // 「N 关有东西可报」不写字面量：N 就是上面逐关数出来的 reported。
  // 写死一个数字，改了轮换节奏之后文档会与代码各说各的，而且没有任何断言会红。
  if (!/收干净那一刻的剩余息/.test(doc) || doc.indexOf(reported + ' 关有东西可报') < 0
      || !/每对时辰/.test(guide) || !/满盘/.test(guide) || !/满盘/.test(doc)
      || /布纹/.test(guide)) {
    errors.push('11-并蒂连枝引 的玩法文档 / 说明页又是旧版（应为「' + reported
      + ' 关有东西可报」）：改了机制必须同批改那一篇');
  } else checked += 1;
}
// 8b-6a-2. 三秀撷英诀：石皮封印 / 重排计次 / S 线现算，三件事都容易「生成了但没生效」。
{
  const mgSrc = fs.readFileSync(path.join(ROOT, 'data/guides.js'), 'utf8');
  const mgAt = mgSrc.indexOf('  match: {');
  const mgEnd = mgAt >= 0 ? mgSrc.indexOf('\n  },', mgAt) : -1;
  const mg = mgAt >= 0 && mgEnd > mgAt ? mgSrc.slice(mgAt, mgEnd) : '';
  // 三秀每次重排本来就要扣息，写成「免费重排」是假话——玩家会以为前几次不要钱。
  // 这条不是文字洁癖：「原价 N 次」与「免费 N 次」是两条不同的规则。
  if (!mg || /免费(重排|\s*\d+\s*次)/.test(mg)) {
    errors.push('data/guides.js 的 match 段把「原价重排」写成了免费，重排每次都要扣息');
  } else checked += 1;
  if (!/石皮/.test(mg)) errors.push('说明页没讲石皮封印，玩家在盘上看到石壳查不到是什么意思');
  else checked += 1;
  const sx = practiceMod.getMethod('harvest');
  const lvMod = require(path.join(ROOT, 'data/levels.js'));
  if (!sx || sx.game !== 'match') errors.push('getMethod(harvest) 取不到三秀同法');
  else checked += 1;
  // 石皮按段给、段内恒定：首段 0 格，之后逐段加密（2 / 5 / 9 / 14）。
  // 「段内恒定」是关键——逐关随机封格会让同一段里凭空多出假台阶。
  const sealSeq = [];
  for (let st = 0; st < 5; st += 1) {
    const r0 = lvMod.stageRange(st);
    const q0 = practiceMod.buildParamsAt(sx, r0.from);
    const q1 = practiceMod.buildParamsAt(sx, r0.to);
    if (q0.seals !== q1.seals) {
      errors.push('三秀第 ' + (st + 1) + ' 段的石皮格数段内变了：' + q0.seals + ' → ' + q1.seals);
    }
    if (q0.shuffleCap !== q1.shuffleCap) {
      errors.push('三秀第 ' + (st + 1) + ' 段的重排次数段内变了：' + q0.shuffleCap + ' → ' + q1.shuffleCap);
    }
    sealSeq.push(q0.seals);
  }
  if (sealSeq.join(',') !== '0,2,5,9,14') {
    errors.push('三秀的石皮格数不是 0/2/5/9/14：' + sealSeq.join(','));
  } else checked += 1;
  // S 线现算：表里不许再写 sLine。写死绝对分就会与时辰脱钩——第 10 关时辰少 3 息、
  // S 线却一样，玩家读到的「本关更紧」就是假的。公式是唯一出处。
  const prSrc = fs.readFileSync(path.join(ROOT, 'data/practice.js'), 'utf8');
  const tblAt = prSrc.indexOf('const MATCH_LEVELS');
  const tbl = prSrc.slice(tblAt, prSrc.indexOf('];', tblAt));
  if (tblAt < 0 || /sLine/.test(tbl)) {
    errors.push('MATCH_LEVELS 里又写死了 sLine；它必须由 matchSLineOf 按本关时辰现算');
  } else checked += 1;
  const mDoc = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/玩法设计/13-三秀撷英诀/总览.md'), 'utf8');
  // reported 不写字面量：改了时辰曲线或 S 线公式，这个数就变，文档必须同批改。
  let mReported = 0;
  for (let lv = 2; lv <= lvMod.LEVEL_MAX; lv += 1) {
    const ds = practiceMod.levelDelta(sx, lv);
    if (ds.some(function (x) { return x.key !== 'start' && x.key !== 'final'; })) mReported += 1;
  }
  if (!/石皮/.test(mDoc) || mDoc.indexOf(mReported + ' 关真的变了') < 0
      || /S 线随游戏变难而降低|S 线随难度反而|越难越低的线/.test(mDoc)) {
    errors.push('13-三秀撷英诀/总览.md 又是旧版（应为「' + mReported + ' 关真的变了」）：'
      + '石皮、重排计次与 S 线现算必须同批改那一篇');
  } else checked += 1;
}
// 8b-6a-3. `getMethod(id)` 对未知 id 会静默回落到第一门。
// 写错一个字母不会报错，取到的是循光斩桩的参数，而调用方照样跑得通：
// 三秀那次是 `getMethod('sanxiu')`（真 id 是 harvest），测试拿点击的参数开了半年消消乐盘；
// 模拟脚本那次是 `getMethod('jian')`，取到的是 forge 的基数。两处都不报红。
// 所以逐处核 id：扫描范围内的每一处 getMethod('x')，x 必须在 PRACTICE_METHODS 里。
for (const f of files) {
  const name = rel(f);
  if (!/\.js$/.test(name)) continue;
  if (!/^(scripts|minigames|pages|utils|tests|components)\//.test(name)) continue;
  if (name === 'scripts/verify.js') continue;
  const src = fs.readFileSync(f, 'utf8');
  const re = /getMethod\(\s*['"]([A-Za-z_$][\w$]*)['"]\s*\)/g;
  let m = re.exec(src);
  let hits = 0;
  while (m) {
    hits += 1;
    if (!practiceMod.PRACTICE_METHODS.some(function (x) { return x.id === m[1]; })) {
      errors.push(name + ' 里 getMethod(\'' + m[1] + '\') 不是真法门 id——'
        + '它会静默回落到第一门（循光斩桩），取到的参数是错的，而代码照样跑得通');
    }
    m = re.exec(src);
  }
  if (hits) checked += 1;
}
// 8b-6a-4. 变化方向账：规矩写在设计原则 §13，账表在 05-axis-review §13，
// key→方向的唯一真源在 data/practice.js。三处必须同源，否则「每门都要有 N 条方向」又是一句空话。
{
  const axis = practiceMod.AXIS_KEY_OF;
  const labels = practiceMod.AXIS_LABELS;
  const content = practiceMod.AXIS_CONTENT;
  const rule = practiceMod.AXIS_RULE;
  const lvMod = require(path.join(ROOT, 'data/levels.js'));
  const ids = Object.keys(labels);
  const parseDoc = function (name) {
    const raw = fs.readFileSync(path.join(ROOT, name), 'utf8');
    return raw.replace(/\*/g, '');
  };
  const dp = parseDoc('docs/specs/constitution/02-十三条设计原则.md');
  const review = parseDoc('docs/specs/spec/数值平衡/05-axis-review.md');
  if (!/## 十三、变化方向/.test(dp) || !/## 13\. 变化方向账/.test(review)) {
    errors.push('变化方向的规矩没立：设计原则 §13 与 05-axis-review §13 必须同时存在');
  } else checked += 1;
  // 门槛数字不许各写各的：改了 AXIS_RULE 就得同批改两篇文档。
  const gateTexts = [dp, review];
  const gates = [rule.minKinds + ' 类', rule.minContent + ' 类内容轴',
    '≥' + rule.minStageAxes + ' 类方向', '≥' + rule.minStageContent + ' 类内容轴'];
  gates.forEach(function (g) {
    if (gateTexts.some(function (t) { return t.indexOf(g) < 0; })) {
      errors.push('设计原则 §13 或方向账 §13 的门槛没跟上 AXIS_RULE：应为「' + g + '」');
    } else checked += 1;
  });
  if (gateTexts.some(function (t) { return t.indexOf('AXIS_KEY_OF') < 0; })) {
    errors.push('方向文档没指向 AXIS_KEY_OF 唯一真源，容易造出第二份手填分类');
  } else checked += 1;

  // 逐关复算：levelDelta 的每一个 key 都得归类，未归类会混进真缺口里。
  const unknown = new Set();
  const ledger = new Map();
  for (const m of practiceMod.PRACTICE_METHODS) {
    const axes = {};
    let minStage = 99, minStageContent = 99;
    for (let lv = 2; lv <= lvMod.LEVEL_MAX; lv += 1) {
      const ds = practiceMod.levelDelta(m, lv).filter(function (x) {
        return x.key !== 'start' && x.key !== 'final';
      });
      ds.forEach(function (x) {
        const a = axis[x.key];
        if (!a) unknown.add(x.key);
        else if (labels[a]) axes[a] = true;
      });
      if (lvMod.stageOfLevel(lv) !== lvMod.stageOfLevel(lv - 1)) {
        let n = 0, c = 0; const seen = {};
        ds.forEach(function (x) {
          const a = axis[x.key];
          if (!a || !labels[a] || seen[a]) return;
          seen[a] = 1; n += 1;
          if (content.indexOf(a) >= 0) c += 1;
        });
        if (n < minStage) minStage = n;
        if (c < minStageContent) minStageContent = c;
      }
    }
    ledger.set(m.name, { axes: axes, n: ids.filter(function (a) { return axes[a]; }).length,
      c: ids.filter(function (a) { return axes[a] && content.indexOf(a) >= 0; }).length,
      minStage: minStage, minStageContent: minStageContent });
  }
  if (unknown.size) {
    errors.push('levelDelta 有 key 没归类到九类方向：' + [...unknown].join(','));
  } else checked += 1;

  // 账表逐格比对：不能只查「表在不在」，要查每一格与代码现算值相等。
  const at13 = review.indexOf('## 13. 变化方向账');
  const nextH = at13 >= 0 ? review.indexOf('\n## ', at13 + 4) : -1;
  const section = at13 >= 0 ? review.slice(at13, nextH < 0 ? review.length : nextH) : '';
  const tableRows = section.split('\n').filter(function (line) {
    if (!/^\|/.test(line)) return false;
    const c = line.split('|').map(function (x) { return x.trim(); });
    return c.length >= 17 && /^\d+$/.test(c[11])
      && ids.every(function (a, i) { return c[2 + i] === '✓' || c[2 + i] === '—'; });
  });
  if (tableRows.length !== practiceMod.PRACTICE_METHODS.length) {
    errors.push('05-axis-review §13 方向账行数不对：表 ' + tableRows.length
      + ' 行，PRACTICE_METHODS ' + practiceMod.PRACTICE_METHODS.length + ' 门');
  } else checked += 1;
  tableRows.forEach(function (line) {
    const cells = line.split('|').map(function (x) { return x.trim(); });
    const name = cells[1];
    const row = ledger.get(name);
    if (!row) { errors.push('方向账里的门名不是 PRACTICE_METHODS.name：' + name); return; }
    const gotAxes = ids.map(function (a, i) {
      return (cells[2 + i] === '✓') === !!row.axes[a];
    });
    const ok = gotAxes.every(Boolean) && Number(cells[11]) === row.n
      && Number(cells[12]) === row.c && Number(cells[13]) === row.minStage
      && Number(cells[14]) === row.minStageContent;
    if (!ok) {
      errors.push('方向账与代码不符：' + name + ' 应为 ' + ids.map(function (a) {
        return row.axes[a] ? '✓' : '—';
      }).join(' ') + ' / ' + row.n + ' / ' + row.c + ' / '
        + row.minStage + ' / ' + row.minStageContent);
    } else checked += 1;
  });
}
// 8b-6a-4b. 段界按「轴去重」补报：已有内容的门，四道段界都要真开两条不同轴。
// 门槛 minStageAxes=2 取四道段界最弱那道、且按轴类别去重——报两条同轴的数（minOpt 与
// maxOpt 都属目标轴）只算一条。这条断言钉住两件事：段界分支按轴去重补预算轴，
// 以及归箱入阵 / 挪块开路四道段界真开出两条不同轴。改任一处都会红。
{
  const src = fs.readFileSync(path.join(ROOT, 'data/practice.js'), 'utf8');
  if (!/const SEGMENT_BUDGET_KEYS = \[/.test(src)
    || !/AXIS_KEY_OF\[x\.key\] === ax/.test(src)) {
    errors.push('levelDelta 段界没按轴去重补预算轴：同轴两条会占满额度，段界只报一条');
  } else checked += 1;
  [['pushbox', '推数预算'], ['klotski', '步数预算']].forEach(function (pair) {
    const m = practiceMod.PRACTICE_METHODS.filter(function (x) { return x.game === pair[0]; })[0];
    let ok = !!m;
    [11, 51, 201, 501].forEach(function (lv) {
      if (!ok) return;
      const seen = {};
      const ds = practiceMod.levelDelta(m, lv);
      ds.forEach(function (x) {
        const a = practiceMod.AXIS_KEY_OF[x.key];
        if (a && practiceMod.AXIS_LABELS[a]) seen[a] = 1;
      });
      if (Object.keys(seen).length < 2 || !ds.some(function (x) { return x.text && x.text.indexOf(pair[1]) >= 0; })) {
        ok = false;
      }
    });
    if (!ok) errors.push(pair[0] + ' 段界没真开两条不同轴，或没报「' + pair[1] + '」');
    else checked += 1;
  });
}
// 8b-6a-5. 三秀九类方向的「生效」断言：参数进了表还必须真被玩法层读。
// 只查表里有没有这个键，会漏掉最常犯的错——生成了没人消费。
{
  const mtSrc = fs.readFileSync(path.join(ROOT, 'minigames/match.js'), 'utf8');
  const pgSrc = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.wxml'), 'utf8');
  const guide = fs.readFileSync(path.join(ROOT, 'data/guides.js'), 'utf8');
  // 段表必须真给九个键：special / goalType / swapAny / twist 四条新轴缺一不可。
  const want = { special: [0, 0, 1, 2, 3], goalType: [6, 1, 2, 3, 5],
    swapAny: [0, 1, 1, 2, 2], twist: [0, 0, 0, 0, 2] };
  Object.keys(want).forEach(function (k) {
    const seq = practiceMod.MATCH_LEVELS.map(function (q) { return q[k]; });
    if (seq.join(',') !== want[k].join(',')) {
      errors.push('MATCH_LEVELS 的 ' + k + ' 段表不是 ' + want[k].join('/')
        + '：' + seq.join('/'));
    } else checked += 1;
  });
  // 四个键都要有消费端；只写进 out. 就算生成，没人读就是假方向。
  let allConsumed = true;
  [['p.special', '特效等级'], ['p.goalType', '本局目标'],
    ['p.swapAny', '挪苗次数'], ['p.twist', '本局劫变']].forEach(function (pair) {
    if (mtSrc.indexOf(pair[0]) < 0) {
      allConsumed = false;
      errors.push('minigames/match.js 没有读 ' + pair[0] + '（' + pair[1]
        + '只是参数表里的摆设）');
    } else checked += 1;
  });
  if (allConsumed) observe('SC-DECIDE-ALL-CONSUMERS', '四个判定键都有消费端，目标判定/评级/settle 三处同改');
  // 目标必须走到玩家眼前：数据层给带数量的文案，准备页渲染，局内把 meter 放上屏。
  // 只钉 meter 算没用——WXML 用 showMeter 门控，少设一次就整局看不到要做什么。
  const goalDataSrc = fs.readFileSync(path.join(ROOT, 'data/practice.js'), 'utf8');
  if (!/function matchGoalLine\(p\)/.test(goalDataSrc)
      || !/practiceData\.matchGoalLine\(p\)/.test(mtSrc)
      || !/roundGoalText/.test(pgSrc) || !/class="lv-goal">\{\{roundGoalText\}\}/.test(wxml)
      || !/vm\.extras\.showMeter = true/.test(mtSrc)) {
    errors.push('三秀本局目标没接到准备页与局内 HUD：目标算出来玩家却看不到');
  } else checked += 1;
  const goalMethod = practiceMod.getMethod('harvest');
  const goalLines = [1, 11, 51, 201, 501].map(function (lv) {
    const q = practiceMod.buildParamsAt(goalMethod, lv);
    return practiceMod.matchGoalLine(q).indexOf(String(q.goalCount)) >= 0;
  });
  if (goalLines.some(function (ok) { return !ok; })) {
    errors.push('三秀准备页目标文案没写本关 goalCount，或没走 matchGoalLine 真源');
  } else checked += 1;
  if (!/showActive/.test(mtSrc) || !/showActive/.test(wxml) || !/onActive/.test(pgSrc)) {
    errors.push('挪苗按钮没有从玩法层接到 WXML 再到页面事件：玩家点不到这个主动手段');
  } else checked += 1;
  if (!/pickTwist/.test(mtSrc) || !/onPickTwist/.test(pgSrc) || !/twistPick/.test(wxml)) {
    errors.push('二选一劫变没有接到页面：玩法层选了，玩家却看不到两条候选');
  } else checked += 1;
  // 劫变一紧一松：每条都得同时有 tight 与 loose，少一边就成了纯加难/纯放水。
  const twists = practiceMod.MATCH_TWISTS || [];
  if (twists.length < 2 || twists.some(function (t) { return !t.tight || !t.loose; })) {
    errors.push('MATCH_TWISTS 有条目缺「一紧一松」中的一边');
  } else checked += 1;
  // 三条评级线必须随劫变后的时辰现算：抽到「穷息」还拿原分数线，等于抽卡定成败。
  // 现在走的是 gradeLinesOf（三条线同源），所以这里钉的是它，不是某一条线。
  if (!/gradeLinesOf\(\{ duration: duration/.test(mtSrc)) {
    errors.push('pickTwist 改了时辰却没有重算评级线，抽到穷息的局天然追不到 S');
  } else checked += 1;
  // 说明页要把四条新规则讲全，否则玩家在盘上看见符 / 目标却查不到意思。
  ['符', '本局目标', '挪苗', '劫变'].forEach(function (word) {
    if (guide.indexOf(word) < 0) {
      errors.push('data/guides.js 的 match 段没讲「' + word + '」，盘上出现了玩家查不到的东西');
    } else checked += 1;
  });
  const mDoc = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/玩法设计/13-三秀撷英诀/总览.md'), 'utf8');
  if (!/九类方向/.test(mDoc) || !/挪苗/.test(mDoc) || !/劫变/.test(mDoc)) {
    errors.push('13-三秀撷英诀/总览.md 没同步九类方向：符 / 目标 / 挪苗 / 劫变要同批改');
  } else checked += 1;
  // 方向账已经由 8b-6a-4 逐格比对；这里只钉住「达标」那一行不能悄悄写回旧账。
  const ledger = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/数值平衡/05-axis-review.md'), 'utf8');
  const row = ledger.split('\n').filter(function (l) { return /^\| 换苗引秀 \|/.test(l); })[0] || '';
  if (!/\| 9 \| 7 \| 5 \| 5 \| ✓ \|/.test(row)) {
    errors.push('方向账里换苗引秀不再是 9 类 / 7 内容轴 / 段界 5 条，九类全开的账被改回去了');
  } else checked += 1;
}

// 8b-6a-6. 三秀「五段各一副纹样」：表、注入、消费、文案、文档五处都要真接上。
// 只查表里有没有五套，会漏掉最常见的错 —— 表换了，盘上还按序号取前 N 格（一盘果子）。
{
  const CREST = require(path.join(ROOT, 'minigames/crest.js'));
  const lvMod = require(path.join(ROOT, 'data/levels.js'));
  const lvSrc = fs.readFileSync(path.join(ROOT, 'data/levels.js'), 'utf8');
  const mtSrc = fs.readFileSync(path.join(ROOT, 'minigames/match.js'), 'utf8');
  const guide = fs.readFileSync(path.join(ROOT, 'data/guides.js'), 'utf8');
  const mDoc = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/玩法设计/13-三秀撷英诀/总览.md'), 'utf8');
  const names = lvMod.MATCH_THEME_NAMES;

  // 一、真源只有一份：五套 × 七格，名字与数据层同序。
  if (CREST.MATCH_CRESTS.length !== 5 || CREST.MATCH_FAMILIES.length !== 7) {
    errors.push('MATCH_CRESTS 不是五套七格，换段会开出空牌或两色撞脸');
  } else checked += 1;
  if (JSON.stringify(names) !== JSON.stringify(CREST.MATCH_CRESTS.map(function (t) { return t.name; }))) {
    errors.push('MATCH_THEME_NAMES 与 MATCH_CRESTS 不同序：常驻规格会报出别段的纹样名');
  } else checked += 1;
  // 二、生成端按段注入、玩法层真消费，不许玩法层自己按段算兜底。
  if (!/out\.theme = matchThemeOf\(lv\)/.test(lvSrc)) {
    errors.push('data/levels.js 没按关号注入三秀纹样主题');
  } else checked += 1;
  // 只查「源码里有映射调用」会漏掉最常见的回归：调用还在，cell.crest 却改回 raw，
  // 那一行就成了没接上的死代码。必须同时钉住「crest 真的写进格子」。
  if (!/p\.theme/.test(mtSrc) || !/CREST\.matchCrestOf\(raw, crestTheme\)/.test(mtSrc)
      || /cell\.crest = raw\b/.test(mtSrc) || !/cell\.crest = crest;/.test(mtSrc)) {
    errors.push('minigames/match.js 没消费 p.theme，或 paint 又按花色序号取图了');
  } else checked += 1;
  if (!/CREST\.matchCrestOf\(board\[i\], stage\)/.test(mtSrc)) {
    errors.push('三秀教学盘没走族序映射，换主题那天教学盘会留在旧图上');
  } else checked += 1;
  // 三、运行时：段内恒定、五段各异、段界常驻规格写出本段名。
  const method = practiceMod.getMethod('harvest');
  let themeOk = true;
  for (let st = 0; st < 5; st += 1) {
    const r = lvMod.stageRange(st);
    const t0 = practiceMod.buildParamsAt(method, r.from).theme;
    if (t0 !== st || practiceMod.buildParamsAt(method, r.to).theme !== t0) themeOk = false;
    if (st > 0 && practiceMod.stageSpec(method, r.from).indexOf(names[st]) < 0) themeOk = false;
  }
  if (!themeOk) errors.push('三秀纹样主题不是「按段恒定、段界换套、常驻规格报得出」');
  else checked += 1;
  // 四、玩家文案与设计文档都讲清「五段换纹样」，不许只在代码里换。
  const matchGuide = guide.slice(guide.indexOf('  match: {'), guide.indexOf('  sudoku: {'));
  if (!/纹样/.test(matchGuide) || !/整副/.test(matchGuide)) {
    errors.push('data/guides.js 的 match 段没讲五段换整副纹样：盘上换了玩家查不到');
  } else checked += 1;
  names.forEach(function (name) {
    if (mDoc.indexOf(name) < 0) errors.push('三秀总览没写「' + name + '」这套纹样');
    else checked += 1;
  });
  ['00-未入门', '01-入门', '02-小成', '03-大成', '04-圆满'].forEach(function (stem, i) {
    const doc = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/玩法设计/13-三秀撷英诀/' + stem + '.md'), 'utf8');
    if (doc.indexOf('本段纹样') < 0 || doc.indexOf(names[i]) < 0) {
      errors.push(stem + '.md 没写本段纹样是哪一套');
    } else checked += 1;
  });
}

// 8b-6b. 玩法文档目录名 = 编号 + 功法正名（照 05-吐纳周天诀），单门六篇齐全。
// 目录名是 skills.js 里 name 的抄写，必须钉住：整批改回英文 stem 时不能静默过关。
{
  const docRoot = path.join(ROOT, 'docs/specs/spec/玩法设计');
  const dirs = fs.readdirSync(docRoot).filter(function (n) {
    return fs.statSync(path.join(docRoot, n)).isDirectory();
  });
  const names = dirs.map(function (n) { return n.replace(/^\d+-/, ''); });
  const proper = skillMod.SKILLS.map(function (s) { return s.name.split('·')[1] || s.name; });
  const missing = proper.filter(function (n) { return names.indexOf(n) < 0; });
  const extra = names.filter(function (n) { return proper.indexOf(n) < 0 && n !== '蓄力停区'; });
  const six = dirs.every(function (d) {
    const base = path.join(docRoot, d);
    return ['总览.md', '00-未入门.md', '01-入门.md', '02-小成.md', '03-大成.md', '04-圆满.md']
      .every(function (f) { return fs.existsSync(path.join(base, f)); });
  });
  if (dirs.length !== proper.length + 1 || missing.length || extra.length || !six) {
    errors.push('spec/玩法设计 目录名或篇数不对齐功法正名：缺 ' + (missing.join('/') || '无')
      + '，多 ' + (extra.join('/') || '无') + '，或某门不是六篇');
  } else checked += 1;
}
// 8b-7. 兑换只有一向。灵石买灵力是允许的，反过来永远不开——那是「挂机时长直接印钱」
// 的入口：气海一满就白坐着，最优解变成挂着不回来，灵石立刻退化成计件工资。
// 这一条靠三件事守：常量在、换算函数对、世界里没有反向接口。
{
  const ecoMod = require(path.join(ROOT, 'data/economy.js'));
  if (!(ecoMod.QI_PER_STONE > 0)) errors.push('economy.QI_PER_STONE 没给正数：兑换面板会写出「1 枚 = 0 点」');
  else checked += 1;
  if (typeof ecoMod.qiFromStone !== 'function' || ecoMod.qiFromStone(3) !== 3 * ecoMod.QI_PER_STONE) {
    errors.push('economy.qiFromStone 与 QI_PER_STONE 对不上：汇率会在面板与结算两处漂');
  } else checked += 1;
  const ecoSrc = fs.readFileSync(path.join(ROOT, 'data/economy.js'), 'utf8');
  if (/stoneFromQi|qiToStone|sellQi/.test(ecoSrc)) {
    errors.push('data/economy.js 出现了把灵力换成灵石的函数：反向兑换是挂机印钱的入口，永远不开');
  } else checked += 1;
}

// 8b-8. 一次性礼包的发放点。这一条不是「有没有这个功能」，是「发的时机对不对」：
// 发放若落在 normalizeState（读档）里，登录后 hydrate() 用云端那份覆盖 state 时，
// 云端存档里没有记账，就会被当成「没发过」——每次冷启动发一份，再写回云端之后
// 那一份也坐实，等于重开一次赚一次。所以只认 store.settle() 这一个发放点。
{
  const ecoGift = require(path.join(ROOT, 'data/economy.js'));
  const gifts = ecoGift.GIFTS || [];
  if (!gifts.length) errors.push('economy.GIFTS 是空的：一次性发放没有内容');
  else {
    const g = gifts[0];
    if (!g.id || !(g.stone > 0)) errors.push('礼包缺 id 或缺金额：记账键与到账数都落不下来');
    else checked += 1;
    const storeSrc = fs.readFileSync(path.join(ROOT, 'utils/store.js'), 'utf8');
    if (!/game\.grantGifts\(s\)/.test(storeSrc)) {
      errors.push('store.settle 没接 grantGifts：礼包永远不会发');
    } else checked += 1;
    const stSrc = fs.readFileSync(path.join(ROOT, 'utils/game/state.js'), 'utf8');
    const normBody = stSrc.split('function normalizeState')[1].split('\nfunction ')[0];
    if (/grantGifts\(/.test(normBody)) {
      errors.push('normalizeState 里调了 grantGifts：登录后云端覆盖会让礼包重复发放');
    } else checked += 1;
    const curDoc = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/系统设计/01-currency.md'), 'utf8');
    if (curDoc.indexOf('开山礼') < 0 || curDoc.indexOf(String(g.stone)) < 0) {
      errors.push('01-currency 没写开山礼的金额（' + g.stone + '）：文档与数据会各说一套');
    } else checked += 1;
  }
}
// 8b-6. 顺序点格不许替玩家标出「下一个在哪」。目标格一旦被描边，这一门就退化成
// 「点发亮的格子」——舒尔特方格练的是目光按序扫过整盘，替它找位置等于把功课做完。
for (const f of ['minigames/schulte.js', 'pages/practice/practice.wxss']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (src.indexOf('cell--next') >= 0) errors.push(f + ' 又给「下一个」标位置了：顺序点格的位置得玩家自己扫');
  else checked += 1;
}

// 8b-7. 遍观毫厘诀的五档必须「每换一档就换点东西」，而且换的东西要真的更难。
// 旧版只守「格子不降 + 罚时不降 + 盘面不超 6×6」，于是 4/5/6/6/6 这张表全绿通过——
// 后三档同一个 6×6、只差 1–3 秒 S 线，而同一尺寸换个布局本来就波动 3–5 秒，
// 档差被方差吃掉，三档在体感上是同一局。这一条现在守四件事：
//   ① 至少四种盘面规格（4/5/6/6/7 是四档规格，中间那一对同盘面另有规则分开）；
//   ② 同盘面的相邻两档，三条线与时辰都不许放宽，S 必须更紧；
//   ③ 盘面变大时，每格预算必须更紧（否则「变大」只是多给时间）；
//   ④ 时辰必须压在 B 线之上且留出 C 带——收进 B 线里，C 档就整个消失。
{
  const mod = gameMod.MODULES.schulte;
  const rows = mod.LEVELS || [];
  if (rows.length !== 5) errors.push('遍观毫厘诀的档位表不是五档');
  else checked += 1;
  const specs = {};
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const tag = '遍观毫厘诀第 ' + (i + 1) + ' 档';
    specs[r.size] = true;
    const n = r.size * r.size;
    if (!(r.s > 0 && r.a > r.s && r.b > r.a)) errors.push(tag + '的三条线没有递增');
    else checked += 1;
    // ④ C 带：时辰至少比 B 线多 leave 秒，否则「点完了但慢」无处可落。
    if (r.limit - r.b < mod.C_WINDOW) {
      errors.push(tag + '的时辰离 B 线只差 ' + (r.limit - r.b) + ' 秒，C 档会被挤没');
    } else checked += 1;
    if (i === 0) continue;
    const p = rows[i - 1];
    if (r.size < p.size) errors.push(tag + '的盘面比上一档还小：被调反了');
    else checked += 1;
    if (r.penalty <= p.penalty) errors.push(tag + '点错罚时没有加重：两档的手滑一样贵');
    else checked += 1;
    // ③ 每格预算（含找 + 点）只许递减：盘面变大时秒数可以变多，但每格不能越给越宽。
    const eta = r.s / n;
    const etaPrev = p.s / (p.size * p.size);
    if (!(eta < etaPrev)) {
      errors.push(tag + '的每格预算 ' + eta.toFixed(3) + ' 秒不比上一档 ' + etaPrev.toFixed(3) + ' 秒更紧');
    } else checked += 1;
    // ② 同盘面的相邻两档：三条线与时辰都不许放宽。
    if (r.size === p.size) {
      if (!(r.s < p.s)) errors.push(tag + '与上一档同盘面，S 线却没有更紧');
      else checked += 1;
      if (r.a > p.a || r.b > p.b || r.limit > p.limit) {
        errors.push(tag + '与上一档同盘面，A / B / 时辰却放宽了');
      } else checked += 1;
    }
    // 容错度：从 S 掉到 A 还能错几次（(A−S) ÷ 罚时），越往上只许越少——
    // 以前「普通」比「简单」还能多错 50%，与「简单档手滑不心疼」正好相反。
    const tol = (r.a - r.s) / r.penalty;
    const tolPrev = (p.a - p.s) / p.penalty;
    if (tol > tolPrev + 0.001) {
      errors.push(tag + '的容错 ' + tol.toFixed(2) + ' 次反而比上一档 ' + tolPrev.toFixed(2) + ' 次更宽');
    } else checked += 1;
  }
  if (Object.keys(specs).length < 4) {
    errors.push('遍观毫厘诀只有 ' + Object.keys(specs).length + ' 种盘面规格，撑不起五档阶梯');
  } else checked += 1;
  // 尺寸上限：8×8 每格只剩 84rpx（22rpx 字号），两位数认不快就变成猜。
  if (rows[rows.length - 1].size > 7) errors.push('遍观毫厘诀盘面超过 7×7：两位数在小屏上认不快，难度会变成猜');
  else checked += 1;
}

// 8b-8. 十五门功法与十五种玩法是两张表，靠 skill.method ↔ PRACTICE_METHODS[].id 关联。
// 漏一个的后果：功法在图鉴里显示「未习得」但点进去拿不到参数（白屏），或者反过来——
// 玩法在表里、却没有一门功法能玩到它（做了没人用）。这类错 check 全绿也拦不住。
{
  const methods = {};
  for (const m of practiceMod.PRACTICE_METHODS) methods[m.id] = m;
  const used = {};
  for (const s of skillMod.SKILLS) {
    if (!s.method) { errors.push(s.id + ' 没有 method 字段，接不到任何玩法'); continue; }
    if (!methods[s.method]) { errors.push(s.id + ' 指向的玩法 ' + s.method + ' 不在 PRACTICE_METHODS 里'); continue; }
    used[s.method] = true;
    checked += 1;
  }
  for (const m of practiceMod.PRACTICE_METHODS) {
    if (!used[m.id]) errors.push('玩法 ' + m.id + ' 没有任何功法能玩到它');
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
// 关卡五段：难度档整组退役，只剩「段」这一套。这里守四件事——
// ① 五段首尾相接、不重不漏，最后一段收在 LEVEL_MAX；
// ② 段界关就是 10 / 50 / 200 / 500 / 1000（前密后疏那条曲线的硬指标）；
// ③ 耗气逐段递增，否则「越难越贵」这条定价就断了；
// ④ 难度档那套字段（need / open）不许再回来。
const lvlMod = require(path.join(ROOT, 'data/levels.js'));
if (lvlMod.LEVEL_MAX !== 1000) errors.push('LEVEL_MAX 不是 1000（关卡总数变了要同批改文案与审计）');
else checked += 1;
if (lvlMod.STAGE_GATES.join('/') !== '10/50/200/500/1000') {
  errors.push('段界关不是 10/50/200/500/1000：' + lvlMod.STAGE_GATES.join('/'));
} else checked += 1;
for (let i = 0; i < practiceMod.STAGES.length; i += 1) {
  const cur = practiceMod.STAGES[i];
  if (cur.need !== undefined || cur.open !== undefined) {
    errors.push('段位上还留着难度档字段（need / open）: ' + cur.key);
  } else checked += 1;
  if (cur.from !== lvlMod.STAGES[i].from || cur.to !== lvlMod.STAGES[i].to) {
    errors.push('段边界与 levels.STAGES 不一致: ' + cur.key);
  } else checked += 1;
  if (i > 0) {
    const prev = practiceMod.STAGES[i - 1];
    if (cur.from !== prev.to + 1) errors.push('段没首尾相接: ' + prev.key + ' → ' + cur.key);
    else checked += 1;
    if (cur.qi <= prev.qi) errors.push('段耗气未递增: ' + cur.key);
    else checked += 1;
  }
}
if (practiceMod.STAGES[practiceMod.STAGES.length - 1].to !== lvlMod.LEVEL_MAX) {
  errors.push('最后一段没收到第 ' + lvlMod.LEVEL_MAX + ' 关');
} else checked += 1;
// 盘面尺寸只许按「显式规格表」变。规格阶梯写在 CLICK_LEVELS / MINES_LEVELS / MEMORY_LEVELS
// （以及 lights / sudoku / klotski / LINK_LEVELS 各自那张表）里，玩法层真的读它，玩家在
// 准备页也看得到「本档几乘几」。不允许的是另一件事：让 pace / goal 那套通用缩放顺手把
// grid / cols / rows 改掉——那是「调难度不小心改了盘面」，玩家会以为换了一门玩法。
// 灵纹连线 4×6→5×7→6×8 是显式的 LINK_LEVELS 表（行长也随段加），买的是搜索空间，不是「缩场地逼手速」。
// match 也在表里了：MATCH_LEVELS 五段各给一副盘（6×6 → 10×10），换段是这一门
// 唯一一眼看得见的台阶，不允许通用 pace / goal 缩放再顺手改它。
const BOARD_TABLE_GAMES = ['click', 'mines', 'lights', 'sudoku', 'klotski', 'pushbox', 'memory', 'link', 'match'];
let boardSafe = true;
let boardStray = '';
for (const m of practiceMod.PRACTICE_METHODS) {
  for (let di = 0; di < practiceMod.STAGES.length; di += 1) {
    const out = practiceMod.buildParams(m, di);
    for (const key of ['grid', 'cols', 'rows', 'size']) {
      if (typeof m.params[key] === 'number' && out[key] !== m.params[key]) {
        if (BOARD_TABLE_GAMES.indexOf(m.game) < 0) {
          boardSafe = false;
          boardStray = m.id + '.' + key;
        }
      }
    }
  }
}
if (!boardSafe) errors.push('盘面尺寸在没有规格表的门里被缩放了: ' + boardStray);
else checked += 1;

// 三秀的 9 / 10 列绝不能落进落石那套 408rpx 窄槽：没有满宽覆写，10 列每格只有 20px，
// 果器纹挤成一团，换段放大盘面反而变成「看不清」。样式守卫与数据层那张表一起走。
const practiceWxss = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.wxss'), 'utf8');
if (!/\.grid--c10\.grid--compact\s*\{[^}]*width:\s*100%/.test(practiceWxss)
  || !/\.grid--c10\.grid--compact \.cell\s*\{/.test(practiceWxss)
  || !/\.grid--c9\.grid--compact \.cell__crest/.test(practiceWxss)) {
  errors.push('三秀 9/10 列缺满宽 / 图案缩放样式：10 列会退化成落石的 20px 窄格');
} else checked += 1;

// 9. 页面规范：设计令牌单一真源、明暗一致性、导航栏标题与暗色、页面样式不写裸色值
const appWxss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
if (!/@import\s+"\.\/styles\/tokens\.wxss"/.test(appWxss)) {
  errors.push('app.wxss 没有引入 styles/tokens.wxss');
} else checked += 1;

const tokenSrc = fs.readFileSync(path.join(ROOT, 'styles/tokens.wxss'), 'utf8');
// 皮肤是三档设置（跟随系统 / 白天 / 夜晚），由 utils/theme.js 解析成 light / night，
// 页面根节点挂 .pg--t-night。CSS 里不许再留 prefers-color-scheme：两条路径同时存在时，
// 「系统说是夜、玩家选的是白天」只能靠选择器权重压过去，而权重是改样式的人看不见的。
// 曾经 app.wxss 里也藏过一块 prefers-color-scheme，只查 tokens 会漏。
// 全局样式（app.wxss + styles/）一律不许按系统明暗翻色。
const globalCss = [tokenSrc, fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8')].join('\n');
if (/@media\s*\(prefers-color-scheme/.test(globalCss)) {
  errors.push('全局样式仍有 prefers-color-scheme：皮肤档位只能由 utils/theme.js 解析，CSS 只留 .pg--t-night 一块');
} else checked += 1;
// 注释里也会提到 .pg--t-night，必须匹配带 { 的真正规则块。
const darkMatch = /\.pg--t-night\s*\{/.exec(tokenSrc);
const darkAt = darkMatch ? darkMatch.index : -1;
if (darkAt < 0) {
  errors.push('tokens.wxss 缺少 .pg--t-night 夜皮肤块');
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
  if (darkVars[key] === undefined) errors.push('夜皮肤块缺少 ' + key);
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

// 昼夜两套皮肤：色值只许有一份真源（tokens 亮色段的 --night-*）。
// 暗色段与 .pg--scene 都只许引用它——两处各写一份时，改了一处漏了另一处，
// 夜里页面与舞台就会悄悄对不上，而两边都还渲染得出来，不会有任何报错。
const sceneSrc = fs.readFileSync(path.join(ROOT, 'styles/scene.wxss'), 'utf8');
const nightKeys = Object.keys(lightVars).filter(function (k) { return k.indexOf('--night-') === 0; });
if (nightKeys.length < 20) {
  errors.push('夜色板过少，--night-* 只剩 ' + nightKeys.length + ' 个');
} else checked += 1;
// 原生栏四个是例外：上面那段拿它们与 theme.json 逐字比对，必须是字面量。
const NIGHT_LITERAL_OK = ['--c-nav', '--c-tab', '--c-tab-text', '--c-tab-active'];
for (const key of colorKeys) {
  if (NIGHT_LITERAL_OK.indexOf(key) >= 0) continue;
  const v = darkVars[key] === undefined ? '' : darkVars[key];
  if (v.indexOf('var(--night-') !== 0) {
    errors.push('夜皮肤块 ' + key + ' 必须引用 --night-*，不许另写一份色值：' + v);
  } else checked += 1;
}
// 夜板里每个键都要真被用到：生成了没人消费的键，等于留下一份没人维护的第二真源。
const nightUsed = new Set();
for (const src of [tokenSrc, sceneSrc]) {
  for (const m of src.matchAll(/var\((--night-[\w-]+)\)/g)) nightUsed.add(m[1]);
}
for (const key of nightKeys) {
  if (!nightUsed.has(key)) errors.push('夜色板 ' + key + ' 没有任何地方引用');
  else checked += 1;
}
// 两套皮肤必须真的不一样。上一版就是「暗色段与亮色段同值」，
// 于是 app.json 开着 darkmode、theme.json 有 dark 段，看起来全套就位，实际一点都没切。
if (darkVars['--c-imm-bg'] === lightVars['--c-imm-bg']) {
  errors.push('夜皮肤块的页面底色与白天相同，两套皮肤等于没切');
} else checked += 1;
if (darkVars['--c-imm-text'] === lightVars['--c-imm-text']) {
  errors.push('夜皮肤块的正文色与白天相同，两套皮肤等于没切');
} else checked += 1;
// 舞台也是夜皮肤，不许自己写第二份色值：.pg--scene 里的 --c-imm-* 必须全部引用 --night-*。
const sceneBlock = (/\.pg--scene\s*\{([\s\S]*?)\n\}/.exec(sceneSrc) || [])[1];
if (!sceneBlock) {
  errors.push('scene.wxss 找不到 .pg--scene 规则块');
} else {
  let sceneVars = 0;
  for (const m of sceneBlock.matchAll(/(--c-imm-[\w-]+):\s*([^;]+);/g)) {
    sceneVars += 1;
    if (m[2].trim().indexOf('var(--night-') !== 0) {
      errors.push('scene.wxss 的 ' + m[1] + ' 必须引用 --night-*，不许写死：' + m[2].trim());
    } else checked += 1;
  }
  if (sceneVars < 20) errors.push('scene.wxss 的 .pg--scene 只映射了 ' + sceneVars + ' 个令牌');
  else checked += 1;
}
// tabBar 图标是纯色 png，不认 theme.json 的 @变量：夜版必须另有一份文件，
// app.js 在切主题时用 wx.setTabBarItem 换。少了就会在深底上整片消失。
function nightIconOf(p) {
  const isOn = /-on\.png$/.test(p);
  const stem = p.replace(/-on\.png$/, '.png').replace(/\.png$/, '');
  return stem + '-night' + (isOn ? '-on' : '') + '.png';
}
for (const item of appJson.tabBar.list) {
  for (const key of ['iconPath', 'selectedIconPath']) {
    if (!item[key]) continue;
    const nightPath = nightIconOf(item[key]);
    if (!fs.existsSync(path.join(ROOT, nightPath))) {
      errors.push('夜版 tabBar 图标缺失: ' + nightPath);
    } else checked += 1;
  }
}


// 夜块写在 tokens、舞台写在 scene：同一个元素上两个类权重相同，靠引入顺序决定谁赢。
// 顺序反了，参悟页的盘面会被夜皮肤盖住（或反过来），而且只在这一页显形。
const importTokensAt = appWxss.indexOf('styles/tokens.wxss');
const importSceneAt = appWxss.indexOf('styles/scene.wxss');
if (importTokensAt < 0 || importSceneAt < 0 || importTokensAt > importSceneAt) {
  errors.push('app.wxss 的 @import 顺序必须是 tokens → immortal → scene（.pg--scene 要能盖住 .pg--t-night）');
} else checked += 1;

// 三档皮肤必须真的落到每一页：类名挂在页面根节点、同步调在 onLoad/onShow。
// 漏一页的症状是「这一页永远是白天」，而且不报错——只能一页一页翻着找。
const uiTheme = require(path.join(ROOT, 'utils/theme.js'));
let themeSyncAll = true;
for (const pagePath of appJson.pages) {
  const pageWxml = path.join(ROOT, pagePath + '.wxml');
  const pageJs = path.join(ROOT, pagePath + '.js');
  if (!fs.existsSync(pageWxml) || !fs.existsSync(pageJs)) {
    themeSyncAll = false;
    errors.push('页面文件缺失: ' + pagePath);
    continue;
  }
  const wxmlSrc = fs.readFileSync(pageWxml, 'utf8');
  if (!/^<view class="[^"]*pg--t-\{\{themeTone\}\}/.test(wxmlSrc)) {
    themeSyncAll = false;
    errors.push(pagePath + ' 的根节点没挂 pg--t-{{themeTone}}，这一页不会跟着皮肤换');
  } else checked += 1;
  const jsSrc = fs.readFileSync(pageJs, 'utf8');
  // 只数调用次数不算数：两处都写在 onLoad 里也能混过。要逐钩子查函数体，
  // 且同时兼容 onLoad: function () {} 与 login 页的 onLoad() {} 两种写法。
  const syncIn = function (hook) {
    const m = new RegExp(hook + '\\s*(?::\\s*function\\s*\\([^)]*\\)|\\([^)]*\\))\\s*\\{([\\s\\S]*?)\\n\\s*\\}').exec(jsSrc);
    return !!m && /pageTheme\.syncPage\(this\)/.test(m[1]);
  };
  const missingHooks = ['onLoad', 'onShow'].filter(function (h) { return !syncIn(h); });
  if (missingHooks.length) {
    themeSyncAll = false;
    errors.push(pagePath + ' 的 ' + missingHooks.join('/') + ' 没调 pageTheme.syncPage(this)：原生栏不会跟着皮肤换');
  } else checked += 1;
}
if (themeSyncAll) observe('SC-UI-THEME-SYNC', '每页根节点挂了主题令牌且 onLoad/onShow 都同步皮肤');
// 运行时的原生栏颜色只有一份真源（theme.js 的 CHROME），theme.json 必须与它逐字相同；
// 不同值时冷启动那一瞬间（JS 还没跑）会先闪一帧错的导航栏，之后再被改回来。
const CHROME_PAIRS = [
  ['light', 'navBgColor', 'nav'], ['light', 'tabBgColor', 'tabBg'],
  ['light', 'tabColor', 'tabColor'], ['light', 'tabSelectedColor', 'tabSelected'],
  ['light', 'bgColor', 'window'],
  ['dark', 'navBgColor', 'nav'], ['dark', 'tabBgColor', 'tabBg'],
  ['dark', 'tabColor', 'tabColor'], ['dark', 'tabSelectedColor', 'tabSelected'],
  ['dark', 'bgColor', 'window'],
];
for (const pair of CHROME_PAIRS) {
  const jsonMode = pair[0];
  const toneKey = jsonMode === 'light' ? 'light' : 'night';
  const chrome = uiTheme.CHROME[toneKey] || {};
  if (chrome[pair[2]] !== theme[jsonMode][pair[1]]) {
    errors.push('utils/theme.js 的 CHROME.' + toneKey + '.' + pair[2] + ' 与 theme.json ' + jsonMode + '.' + pair[1] + ' 不同值');
  } else checked += 1;
}
// 三档都要在：只剩两档时「跟随系统」与「白天」会被当成同一件事。
for (const m of ['auto', 'light', 'night']) {
  if (uiTheme.MODES.indexOf(m) < 0) errors.push('utils/theme.js 的 MODES 缺少 ' + m);
  else checked += 1;
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
// --fall / --fd 由消消乐按格写进 style（掉几格、这一格该花多久），同样属于运行时注入。
// --fx-size / --fx-half 由探禁按盘面列数算好环直径再写进 style：6×6 到 12×12 每格差一倍，
// 写死一个值必然在末段跨格压住数字。
const tokenDefs = new Set([...tokenSrc.matchAll(/(--[\w-]+)\s*:/g)].map(function (m) { return m[1]; }));
const runtimeVars = new Set(['--acc', '--soft', '--ink', '--bg', '--frame', '--glow', '--deep', '--well', '--a', '--d', '--fall', '--fd', '--fx-size', '--fx-half']);
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
  copy.UI.loading, copy.UI.errorTitle, copy.UI.errorDesc,
  copy.UI.emptyLog, copy.UI.emptyBoard, copy.UI.emptySkills,
  copy.UI.sections.today, copy.UI.sections.battleCode,
  // 切磋与秘境共用「我的战力」与对手列表标题：两页各抄一遍就会有一页先改。
  copy.UI.sections.myPower, copy.UI.sections.rivals,
  // 局内/结算/主页/人物页共用的短标签：散回 WXML 就会出现「本段盘面」和「本段」两套叫法。
  copy.UI.labels.boardSpec, copy.UI.labels.boardChange,
  copy.UI.labels.todayDone, copy.UI.labels.dailyLeft, copy.UI.labels.times,
  copy.UI.labels.progress, copy.UI.labels.rank,
];
for (const text of sharedCopy) {
  // 表里出现 undefined 等于这条闸门空转：indexOf('>undefined<') 永远 -1，
  // 每次都「通过」，守的却是空。文案真源删了键、这里忘了同步，必须当场红。
  if (typeof text !== 'string' || !text) { errors.push('共享文案表里有空项（copy 键已删但表没同步）'); continue; }
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
  // 六格不许再带 tone。曾经每格一个色相（剑石青 / 秘绛紫 / …），六个同权重的字各带一色，
  // 既没有信息又把一屏彩点从 0 抬到 6，玩家反馈「花里胡哨刺眼」。这条断言就是防它回来：
  // 判据是「颜色只给需要挑一个或看状态的东西」，宫格是并排罗列的一组，不该上色。
  if (tile.tone) errors.push('六宫格不该再有 tone 字段（宫格字形一律墨褐）：' + tile.key);
  else checked += 1;
}
// 字形色变体如果还在，说明 css 里的六色没删干净——数据删了、样式还在，等于留了个开关等人接回去。
const glyphTones = (fs.readFileSync(path.join(ROOT, 'styles/immortal.wxss'), 'utf8').match(/\.imm-tile__glyph--/g) || []).length;
if (glyphTones !== 0) errors.push('immortal.wxss 里还有 ' + glyphTones + ' 条 .imm-tile__glyph--* 变体，宫格字形应统一墨褐');
else checked += 1;
if (/imm-tile__glyph--\{\{/.test(fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8'))) {
  errors.push('主页宫格仍按 tone 出类名，宫格字形应统一墨褐');
} else checked += 1;
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
const checklistPath = path.join(ROOT, 'docs/specs/spec/00-契约/checklist-puzzle.md');
if (!fs.existsSync(checklistPath)) {
  errors.push('缺少玩法设计自检清单：docs/specs/spec/00-契约/checklist-puzzle.md');
} else {
  const doc = fs.readFileSync(checklistPath, 'utf8');
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
  // 关卡只由走通关数推：清单必须写「1000 关五段、走通段界关才进下一段」，
  // 且不许再留「熟练度到 X 解锁某档」的旧口径——那是这次改版特意拆掉的一层。
  if (doc.indexOf('1000 关') < 0) errors.push('自检清单没写「1000 关」');
  else checked += 1;
  if (doc.indexOf('段界关') < 0) errors.push('自检清单没写「段界关」的分段口径');
  else checked += 1;
  if (/熟练度到 \d+ 才开/.test(doc) || /熟练度解锁难度/.test(doc)) {
    errors.push('自检清单还留着「熟练度解锁难度」的旧口径');
  } else checked += 1;
  // 经济口径：参悟从「产出资源」改成「消耗灵力」，清单必须写明唯一真源与各档耗气。
  // 旧版守的是资源总倍率 MAX_MULTIPLIER，那条常量已随资源产出一起退役。
  const economyData = require(path.join(ROOT, 'data/economy.js'));
  if (doc.indexOf('practiceQiCost') < 0) errors.push('自检清单没讲明耗气走 economy.practiceQiCost()');
  else checked += 1;
  const runQiLine = economyData.RUN_QI.join(' / ');
  if (doc.indexOf(runQiLine) < 0) errors.push('自检清单的五档耗气与 RUN_QI 不一致（应为 ' + runQiLine + '）');
  else checked += 1;
  // 兑换口径：灵石单向兑灵力。这条必须写进清单，而且要带上汇率——
  // 反向（灵力换灵石）永远不开：那是「挂机时长直接印钱」的入口，比数值失衡严重得多。
  // 原写法只查数字「100」出没出现：文档里随便一个 1000 关就能让它通过，
  // 汇率本身写错也无人拦。改成查「1 枚 = 100 点」这个完整口径。
  const exchangeLine = '1 枚 = ' + economyData.QI_PER_STONE + ' 点';
  if (doc.indexOf('灵石可单向兑灵力') < 0 || doc.indexOf(exchangeLine) < 0) {
    errors.push('自检清单没写「灵石可单向兑灵力（1 枚 = ' + economyData.QI_PER_STONE + ' 点），灵力换不回灵石」的兑换口径');
  } else checked += 1;
  // 结算按钮文案抄自 copy.js 真源，不硬编码——文案换词时断言自动跟随，
  // 否则会出现「改了真源反而断言报错」的倒挂（留在本页 → 留于此处那次就踩过）。
  const againWord = copyData.UI.actions.again;
  const stayWord = copyData.UI.actions.stay;
  if (doc.indexOf(againWord) < 0 || doc.indexOf(stayWord) < 0) {
    errors.push('自检清单的结算按钮文案没跟 copy.js 真源（应为「' + againWord + '」与「' + stayWord + '」）');
  } else checked += 1;
  // 新手引导的口径：首局手把手，不是「读完再玩」的弹窗，也不许再写回「明确不做」。
  if (doc.indexOf('首局手把手') < 0) errors.push('自检清单没写首局手把手的引导口径');
  else checked += 1;
  if (/分步新手引导[^\n]*明确不做/.test(doc)) errors.push('自检清单还把新手引导写成「明确不做」');
  else checked += 1;
  // 关卡只由「走通」推进，回关不推：文档与代码必须是同一套口径。
  if (doc.indexOf('回关不推进度') < 0) errors.push('自检清单没写「回关不推进度」的口径');
  else checked += 1;
  if (doc.indexOf('走通段界关') < 0) errors.push('自检清单没写「走通段界关才进下一段」');
  else checked += 1;
  const gameSrc = engineSrc();
  // 熟练度折减与连 S 曲线已整条删除：再出现这些符号就是把旧机制接回来了。
  if (/practiceData\.profByLevel\(/.test(gameSrc)) errors.push('utils/game.js 又用 profByLevel() 折熟练度（这条线已删）');
  else checked += 1;
  if (/worldData\.(comboGain|PROF_BASE|PROF_MAX|COMBO_MAX)|engine\.breakCombo|M\.breakCombo/.test(gameSrc)) {
    errors.push('utils/game.js 还引用着已删的熟练度 / 连 S 符号');
  } else checked += 1;
  // 关号只许由「走通了几关」推进；档位只许由同一套段界算。
  if (/levelData\.levelFromProf\(/.test(gameSrc)) errors.push('utils/game.js 又用 levelFromProf() 算关卡了');
  else checked += 1;
  if (!/levelData\.stageIndexOfCleared\(/.test(gameSrc)) errors.push('utils/game.js 没按走通关数算段位');
  else checked += 1;
  if (!/\.cleared/.test(gameSrc)) errors.push('utils/game.js 没读写 cleared（本门走通了几关）');
  else checked += 1;
  // 功法的级只有一个来源：TIERS 六档门槛必须等于段界关（data/levels.js 的 STAGES）。
  const worldSrc = fs.readFileSync(path.join(ROOT, 'data/world.js'), 'utf8');
  if (/function comboGain\(|PROF_BASE|PROF_MAX|COMBO_MAX/.test(worldSrc)) {
    errors.push('data/world.js 还留着熟练度 / 连 S 的常量或曲线');
  } else checked += 1;
  const levelMod = require(path.join(ROOT, 'data/levels.js'));
  const worldMod = require(path.join(ROOT, 'data/world.js'));
  const gates = levelMod.STAGES.map(function (x) { return x.to; });
  if (worldMod.TIERS.length !== gates.length + 1) {
    errors.push('TIERS 档位数不是「段数 + 1」：功法的级必须与关卡段一一对应');
  } else checked += 1;
  for (let i = 0; i < gates.length; i += 1) {
    if (worldMod.TIERS[i + 1].threshold !== gates[i]) {
      errors.push('TIERS 第 ' + (i + 1) + ' 档门槛不是段界关（' + gates[i] + '）：两套尺子漂了');
    } else checked += 1;
  }
  const pageSrc = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.js'), 'utf8');
  // 中途结束只许走一个结账口；那个口子不许进 applyPractice（作废＝一分数值都不发）。
  if (!/closeAbandonedRound: function/.test(pageSrc)) errors.push('参悟页没有 closeAbandonedRound()：中途结束没有统一结账口');
  else checked += 1;
  if (/S_STREAK_GOAL|promotionGain|sStreakGoal/.test(gameSrc)) {
    errors.push('utils/game.js 还留着三连 S 晋级的旧字段');
  } else checked += 1;
  const engineApi = require(path.join(ROOT, 'utils/game.js'));
  if (engineApi.SAVE_VERSION !== 10) errors.push('存档版本没升到 v10（熟练度删除、功法的级改由 cleared 算）');
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
  if (readmeSrc.indexOf('docs/specs/spec/00-契约/checklist-puzzle.md') < 0) errors.push('README 没有指到 docs/specs/spec/00-契约/checklist-puzzle.md');
  else checked += 1;
  // 最差那一档必须写清是「没走完」而不是「做糙了」：失败（F）与粗浅（C）是两个结论。
  // 曾经所有 F 都被页面当成「中途结束」，打崩了一分收益都没有、还被说成「这回不算数」。
  // 断言盯住「F 叫失败」这个具体表述，不是「文档里有没有『失败』两个字」——后者满篇都是。
  if (readmeSrc.indexOf('F「失败」') < 0) errors.push('README 没写「F＝失败」这一档');
  else checked += 1;
  if (doc.indexOf('`F` 是失败') < 0) errors.push('自检清单没写「F 是失败」：最差结局的语义没人守');
  else checked += 1;
  // 教学盘的外部引用必须留档：12 里出现的每个外链，原文摘录都得在 13 里。
  // 守的不是「有没有链接」，是「摘要读起来很顺、但原文没这么说」——
  // 2026-11 首轮整理时，四处口径错全都 check 全绿：专利里没有的关号、
  // 不是官方口径的说法被写成官方、反例被当成通例、出处串到了另一篇头上。
  // 静态断言判不了语义，但能逼着引用回到原文旁边。
  const teachDocSrc = fs.readFileSync(path.join(ROOT, 'docs/specs/spec/界面设计/12-teach-boards.md'), 'utf8');
  const researchPath = path.join(ROOT, 'docs/specs/spec/界面设计/13-teach-research.md');
  if (!fs.existsSync(researchPath)) {
    errors.push('缺少 docs/specs/spec/界面设计/13-teach-research.md：教学盘的外部引用没有原文存档');
  } else {
    checked += 1;
    const researchSrc = fs.readFileSync(researchPath, 'utf8');
    const extRe = /https?:\/\/[^\s)>\]]+/g;
    const seenLink = {};
    let ext = extRe.exec(teachDocSrc);
    while (ext) {
      const url = ext[0].replace(/[.,;，。；]+$/, '');
      if (!seenLink[url]) {
        seenLink[url] = true;
        if (researchSrc.indexOf(url) < 0) {
          errors.push('12-teach-boards.md 引了没留档的外部链接：' + url
            + '（原文摘录要补进 docs/specs/spec/界面设计/13-teach-research.md）');
        } else checked += 1;
      }
      ext = extRe.exec(teachDocSrc);
    }
    if (Object.keys(seenLink).length === 0) {
      errors.push('12-teach-boards.md 一个外部链接都没有：结论没有可复查的出处');
    } else checked += 1;
  }
  // 有失败态的玩法必须在说明页给出 fail 线，缺了就等于玩家开局前不知道崩了会怎样。
  const failMods = ['lights', 'mines', 'memory', 'seal', 'link',
    'sudoku', 'merge', 'schulte', 'klotski', 'pushbox', 'biggest'];
  failMods.forEach(function (g) {
    const src = fs.readFileSync(path.join(ROOT, 'minigames', g + '.js'), 'utf8');
    if (!/fail:/.test(src)) errors.push(g + '.js 有失败态却没给 lines().fail');
    else checked += 1;
  });
}

// 每套玩法都要导出 lines()：说明页的「C/B/A/S 各自要什么」从这里取，
// 缺一门就退回一句「按总分评」——玩家问过的问题会原样回来。
// crest.js 是并蒂引与三秀共用的图案表，不是一套玩法，没有 lines() 可导出。
const SKIP_MG = ['index.js', 'common.js', 'theme.js', 'charge.js', 'teach-kit.js', 'crest.js'];
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

// 说明页讲的是「怎么玩」，不是「这东西怎么被命名出来的」。
// 曾经有一节「功法命名」把 NAME_RULE 的字段（体裁字、字数区间、同族共用一个字）
// 抄给玩家看，还写着已经被撤掉的那一族体裁字——玩家读不懂，改规则时也没人记得来改它。
// 命名规范只有一处真源：docs/specs/spec/系统设计/11-skill-taxonomy.md。
if (/体裁字/.test(helpSrc)) errors.push('说明页又在讲命名规范（体裁字），那是设计文档的事，不是玩家规则');
else {
  checked += 1;
  observe('SC-TEACH-HELP-PLAYER-RULE', '说明页只讲玩家规则，没有泄回命名规范体裁字');
}

if (errors.length > 0) {
  console.error('静态校验失败（' + errors.length + ' 项）:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
// ---------------- 10 组：规格文档新鲜度（S/T/D 链条自检） ----------------
// 前 9 组查代码与文案，这一组查「规格自己有没有过期」。2026-11-24 复查发现：
// 删熟练度整条线之后，三张覆盖度卡仍把已删机制当活承诺，而 npm run check 全绿——
// 机器守卫只盯着实现，不盯顶层视图。这里补三条最小自检，把「人肉扫出来」变成「当场报红」。
const SPEC_DIRS = ['constitution', 'spec', 'plan', 'tasks'];
const specRoot = path.join(ROOT, 'docs/specs');
const specReadme = fs.readFileSync(path.join(specRoot, 'README.md'), 'utf8');
const specLayerReadme = fs.readFileSync(path.join(specRoot, 'spec/README.md'), 'utf8');
const methodDoc = fs.readFileSync(path.join(specRoot, 'constitution/06-评审方法论.md'), 'utf8');
const rootReadmeFresh = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const courseSrc = fs.readFileSync(path.join(ROOT, '.workbuddy/memory/MEMORY.md'), 'utf8');
const actualCounts = {};
for (const layer of SPEC_DIRS) {
  actualCounts[layer] = walk(path.join(specRoot, layer), []).filter(function (f) { return f.endsWith('.md'); }).length;
}
// 1) 四层篇数：三份文档声明必须等于实际文件数。spec 层 140（原 141，v10 删两篇新建一篇）。
if (actualCounts.spec !== 140) errors.push('spec 层实际 ' + actualCounts.spec + ' 篇，期望 140（篇数声明要一起改）');
else checked += 1;
const countClaims = [
  ['docs/specs/README.md', specReadme, 140],
  ['docs/specs/spec/README.md', specLayerReadme, 140],
  ['docs/specs/constitution/06-评审方法论.md', methodDoc, 140],
  ['README.md', rootReadmeFresh, 140],
  ['.workbuddy/memory/MEMORY.md', courseSrc, 140],
];
for (const [where, src, n] of countClaims) {
  if (src.indexOf(n + ' 篇') < 0 && src.indexOf(n + '篇') < 0) errors.push(where + ' 的 spec 篇数没同步到 ' + n);
  else checked += 1;
}
// 只守总数不够：反证时把「系统设计 18」改成 19，总数 140 没动，校验照样绿。
// 分项也逐组核实际目录，防止篇数在几份文档里互相抄错却保持总和。
// 每项两份文档都要对：spec/README.md 用「`目录/` N」逐组列，docs/specs/README.md 用中文名空格列。
// 契约那组在总目录里合并写成「六份行为契约」，不在分项表里，所以只核 spec/README.md。
const subDirs = [
  ['00-契约', '00-契约', 7, false],
  ['系统设计', '系统设计', 18, true],
  ['玩法设计', '玩法设计', 97, true],
  ['界面设计', '界面', 13, true],
  ['数值平衡', '数值', 4, true],
];
for (const [dirName, label, claim, inTopReadme] of subDirs) {
  const actual = walk(path.join(specRoot, 'spec', dirName), []).filter(function (f) { return f.endsWith('.md'); }).length;
  if (actual !== claim) errors.push('spec/' + dirName + ' 实际 ' + actual + ' 篇，声明 ' + claim);
  else checked += 1;
  if (specLayerReadme.indexOf('`' + dirName + '/` ' + claim) < 0) errors.push('spec/README.md 的 ' + dirName + ' 分项篇数没同步');
  else checked += 1;
  if (inTopReadme) {
    if (specReadme.indexOf(label + ' ' + claim) < 0) errors.push('docs/specs/README.md 的 ' + dirName + ' 分项篇数没同步');
    else checked += 1;
  }
}
// 2) R 卡引用的 spec 路径必须真实存在。只抽反引号里的 .md 路径，避开通配符和历史叙述。
const reviewCards = ['10-规格覆盖.md', '11-测试覆盖.md', '12-运行覆盖.md'];
for (const card of reviewCards) {
  const src = fs.readFileSync(path.join(ROOT, 'docs/reviews', card), 'utf8');
  const refs = new Set();
  for (const m of src.matchAll(/`(docs\/[^`\s]+\.md)`/g)) refs.add(m[1]);
  for (const ref of refs) {
    if (!fs.existsSync(path.join(ROOT, ref))) errors.push(card + ' 引用了不存在的文档：' + ref);
    else checked += 1;
  }
}
// 3) 场景 ID 跨 R_S/R_T 一致。ID 一旦退役必须从两张活表里一起消失——
//    上一版 R_S 还挂着 SC-PROF-CAP / SC-COMBO-CAP，差集从此不可信。
function liveSceneIds(file) {
  const src = fs.readFileSync(path.join(ROOT, 'docs/reviews', file), 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/`(SC-[A-Z0-9-]+)`/g)) out.add(m[1]);
  return out;
}
const rsIds = liveSceneIds('10-规格覆盖.md');
const rtIds = liveSceneIds('11-测试覆盖.md');
if (rsIds.size !== 31) errors.push('R_S 活场景 ID 应有 31 个，实为 ' + rsIds.size);
else checked += 1;
const idDiff = [];
for (const id of rsIds) if (!rtIds.has(id)) idDiff.push('R_T 缺 ' + id);
for (const id of rtIds) if (!rsIds.has(id)) idDiff.push('R_T 多 ' + id);
if (idDiff.length > 0) errors.push('场景 ID 跨 R 卡不一致：' + idDiff.join('、'));
else checked += 1;
const RETIRED_IDS = ['SC-PROF-CAP', 'SC-PROF-NO-RESOURCE', 'SC-COMBO-CAP', 'SC-NAME-NO-MIX'];
for (const card of reviewCards) {
  const src = fs.readFileSync(path.join(ROOT, 'docs/reviews', card), 'utf8');
  for (const id of RETIRED_IDS) {
    if (src.indexOf('`' + id + '`') >= 0) errors.push(card + ' 还在用已退役的场景 ID：' + id);
    else checked += 1;
  }
}
// 退役 ID 也会被当「现行例子」写进活文档（方法论 §3 就漏过一次），三张 R 卡之外也要扫。
// R_S 的退役表刻意不用反引号包 ID，所以这条不会误报那张说明表。历史轮次卡按纪律不回改，不扫。
const liveDocs = ['README.md', 'docs/specs/README.md', 'docs/reviews/OVERVIEW.md',
  'docs/reviews/10-规格覆盖.md', 'docs/reviews/11-测试覆盖.md', 'docs/reviews/12-运行覆盖.md'];
for (const layer of SPEC_DIRS) {
  for (const f of walk(path.join(specRoot, layer), [])) {
    if (f.endsWith('.md')) liveDocs.push(path.relative(ROOT, f));
  }
}
const retiredLeaks = [];
for (const file of liveDocs) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const id of RETIRED_IDS) {
    if (src.indexOf('`' + id + '`') >= 0) retiredLeaks.push(file + ' → ' + id);
  }
}
if (retiredLeaks.length > 0) errors.push('已退役场景 ID 还在活文档里当例子：' + retiredLeaks.join('、'));
else checked += 1;

// 文档里的项数必须等于本次实际检查数。这个数字最容易漏改：它每加一条断言都会变，
// 而人只会记得改代码。放在最后是因为 checked 到这里才定稿——只提示不递归。
// 三个锚点都必须在场：只查一个「N 项」，会被正文里别的四位数（历史快照写的 1422 项、
// 布局的 107 项）蒙过去——那一版就出现过「1801 与 1800 并存、校验照样绿」。
const finalReadme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const countAnchors = [
  '（' + checked + ' 项，含',
  checked + ' 项静态检查',
  checked + ' 项静态 +',
  checked + ' 项里守着三页 IA',
];
const missingAnchor = countAnchors.filter(function (a) { return finalReadme.indexOf(a) < 0; });
// 不能只打印自己这一条：上面任何一组红了，checked 也会跟着变，这里必然同时红。
// 只报项数会把真正的根因（比如「系统设计 19」）掩盖掉——反证时亲眼见过。
if (errors.length > 0 || missingAnchor.length > 0) {
  const all = errors.slice();
  if (missingAnchor.length > 0) all.push('README 里的静态项数没同步：本次实际 ' + checked + ' 项，缺「' + missingAnchor.join('」「') + '」');
  console.error('静态校验失败（' + all.length + ' 项）:');
  for (const e of all) console.error('  - ' + e);
  process.exit(1);
}
console.log('静态校验通过：' + checked + ' 项检查，0 错误');
