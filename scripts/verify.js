'use strict';

// 零依赖静态校验：JSON 可解析、JS 语法、页面/组件四件套、主题变量、tabBar 图标、隐私清单格式。
// 不依赖微信开发者工具，CI 里直接 node scripts/verify.js 即可。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// .obsidian 是本地编辑器工作区（第三方插件），与 .workbuddy 同类，不进校验范围。
const SKIP_DIRS = new Set(['.git', '.workbuddy', '.obsidian', 'node_modules', 'miniprogram_npm']);
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

// 8. 功法品阶与难度档约定：品阶管收益（天地玄黄），难度档跟熟练度（五档）
const skillMod = require('../data/skills.js');
const practiceMod = require('../data/practice.js');
// 功法数不写死：一门功法必须正好对应一套参悟方式，加内容时两处一起加。
if (skillMod.SKILLS.length !== practiceMod.PRACTICE_METHODS.length
  || practiceMod.TIERS.length !== 4 || practiceMod.STAGES.length !== 5) {
  errors.push('功法数与参悟方式数不等，或品阶数 / 关卡段数不符合约定');
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
  for (const f of files.filter(function (x) {
    return /\.(js|wxml|wxss|json|md)$/.test(x) && rel(x) !== 'scripts/verify.js';
  })) {
    const src = fs.readFileSync(f, 'utf8');
    if (src.indexOf('灵气') >= 0) errors.push(rel(f) + ' 还写着旧资源名「灵气」');
    else checked += 1;
  }
}

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

// 8b-2. effect.text 的前缀是这门功法的门面（'九宫：参悟熟练度 +9%'），改名时最易漏。
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
  if (/ps*.s*(cols|rows)/.test(blocksSrc)) {
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
      const txt = practiceMod.levelDelta(m, lv).map(function (x) { return x.text; }).join(' / ');
      if (/flashMs|hintMs|亮起时长/.test(txt)) reportOk = false;
      const mm = /每对时辰 ([\d.]+) → ([\d.]+) 息/.exec(txt);
      if (mm && Number(mm[2]) > Number(mm[1])) reportOk = false;
      if (txt) reported += 1;
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

  // 评级四条线逐档可达，且 C 带非空；失败线必须单独给（C 与 F 是两个结论）。
  let gradesOk = true;
  for (const k of practiceMod.STAGES.map(function (d, i) { return i; })) {
    const p = practiceMod.buildParams(m, k);
    const g = linkMod.gradeLefts(p.duration);
    if (!(g.s > g.a && g.a > g.b && g.b > 0)) { gradesOk = false; break; }
    const got = [g.s, g.a, g.b, g.b - 1].map(function (x) { return linkMod.gradeByLeft(x, p.duration); });
    if (got.join('') !== 'SABC') { gradesOk = false; break; }
    const ls = linkMod.lines(p);
    if (ls.items.length !== 4 || !ls.fail) { gradesOk = false; break; }
  }
  if (!gradesOk) errors.push('linkpair 的 S/A/B/C 有一档取不到，或 lines() 缺失败线');
  else checked += 1;
  // 局内不许摆「当前评级」：评级按收干净那一刻的剩余息定，倒计时一开始是满的，摆出来必然是 S。
  if (/已入 S/.test(linkCode) || /goalFor\s*\(/.test(linkCode) || !/showGradeNow = false/.test(linkCode)) {
    errors.push('link.js 把局内评级摆回 HUD 了：收完之前评级定不下来，旧版会报「已入 S」再结算 F');
  } else checked += 1;
  if (/function reshuffle\(\)[\s\S]*?\n  }/.test(linkSrc)) {
    const body = /function reshuffle\(\)[\s\S]*?\n  }/.exec(linkSrc)[0];
    if (/left\s*=/.test(body) || !/combo = 0/.test(body)) {
      errors.push('link.js 的死局重排又罚息了，或没断连收：死局是运气，罚息是罚运气');
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
  const doc = fs.readFileSync(path.join(ROOT, 'docs/20-minigames/11-linkpair.md'), 'utf8');
  if (!/收干净那一刻的剩余息/.test(doc) || !/44 关参数真变/.test(doc)) {
    errors.push('11-linkpair.md 又是旧版：改了机制必须同批改那一篇');
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
// 灵纹连线 6×4 → 8×4 是显式的 LINK_LEVELS 表，买的是搜索空间，不是「缩场地逼手速」。
const BOARD_TABLE_GAMES = ['click', 'mines', 'lights', 'sudoku', 'klotski', 'pushbox', 'memory', 'link'];
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
  // 关卡不再由熟练度算：清单必须写「1000 关五段、走通段界关才进下一段」，
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
  if (doc.indexOf('灵石可单向兑灵力') < 0 || doc.indexOf(String(economyData.QI_PER_STONE)) < 0) {
    errors.push('自检清单没写「灵石可单向兑灵力（1 枚 = ' + economyData.QI_PER_STONE + ' 点），灵力换不回灵石」的兑换口径');
  } else checked += 1;
  // 结算主按钮是上一轮刚定的「留在本页」，文档不许写回「再来一局」当默认动作。
  if (doc.indexOf('留在本页') < 0) errors.push('自检清单没写结算主按钮「留在本页」');
  else checked += 1;
  // 新手引导的口径：首局手把手，不是「读完再玩」的弹窗，也不许再写回「明确不做」。
  if (doc.indexOf('首局手把手') < 0) errors.push('自检清单没写首局手把手的引导口径');
  else checked += 1;
  if (/分步新手引导[^\n]*明确不做/.test(doc)) errors.push('自检清单还把新手引导写成「明确不做」');
  else checked += 1;
  // 回关折减与「关卡由走通推进」是同一根尺子的两面：文档写成另一套口径，
  // 以后照文档调数值，玩家看到的和代码算的就对不上。
  if (doc.indexOf('回关折减') < 0) errors.push('自检清单没写「回关折减」的口径');
  else checked += 1;
  if (doc.indexOf('走通段界关') < 0) errors.push('自检清单没写「走通段界关才进下一段」');
  else checked += 1;
  const gameSrc = fs.readFileSync(path.join(ROOT, 'utils/game.js'), 'utf8');
  if (!/practiceData\.profByLevel\(/.test(gameSrc)) errors.push('utils/game.js 没走 profByLevel() 按关折减');
  else checked += 1;
  // 关号只许由「走通了几关」推进；段位只许由 stageIndexOfCleared 算。
  // levelFromProf 现在只剩迁移用途，运行时再调它就是把熟练度又接回关卡。
  if (/levelData\.levelFromProf\(/.test(gameSrc)) errors.push('utils/game.js 又用 levelFromProf() 算关卡了');
  else checked += 1;
  if (!/levelData\.stageIndexOfCleared\(/.test(gameSrc)) errors.push('utils/game.js 没按走通关数算段位');
  else checked += 1;
  if (!/\.cleared/.test(gameSrc)) errors.push('utils/game.js 没读写 cleared（本门走通了几关）');
  else checked += 1;
  if (/Math\.round\(profBase \* lowFactor\)/.test(gameSrc)) {
    errors.push('熟练度折减又退回「先乘总系数、最后取整一次」');
  } else checked += 1;
  if (doc.indexOf('四舍五入') < 0) errors.push('自检清单没写取整口径');
  else checked += 1;
  // 连 S 叠倍率是熟练度的唯一曲线：三连 S 晋级的旧字段必须整体消失，收功必须断连。
  const worldSrc = fs.readFileSync(path.join(ROOT, 'data/world.js'), 'utf8');
  if (!/function comboGain\(/.test(worldSrc)) errors.push('data/world.js 没有连 S 曲线真源 comboGain()');
  else checked += 1;
  if (doc.indexOf('连 S 叠倍率') < 0) errors.push('自检清单没写「连 S 叠倍率」机制');
  else checked += 1;
  if (doc.indexOf('1307') < 0) errors.push('自检清单没写连 S 第 10 层封顶值 1307');
  else checked += 1;
  const pageSrc = fs.readFileSync(path.join(ROOT, 'pages/practice/practice.js'), 'utf8');
  if (!/engine\.breakCombo\(/.test(pageSrc)) errors.push('参悟页收功没接 breakCombo()，连击能靠中途退出保住');
  else checked += 1;
  if (/S_STREAK_GOAL|promotionGain|sStreakGoal/.test(gameSrc)) {
    errors.push('utils/game.js 还留着三连 S 晋级的旧字段');
  } else checked += 1;
  const engineApi = require(path.join(ROOT, 'utils/game.js'));
  if (engineApi.SAVE_VERSION !== 9) errors.push('存档版本没升到 v9（关卡改成 1000 关一条线，进度要按 cleared 存）');
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
