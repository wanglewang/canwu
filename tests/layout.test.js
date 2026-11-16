'use strict';

// 布局与按钮约定常驻断言：零依赖，直接 node tests/layout.test.js 即可跑。
// 目标是把「按钮位置/层级」这类容易在后续迭代中被改回去的约定固化下来。
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log('OK  ' + name);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function pageFiles(ext) {
  const out = [];
  const dir = path.join(ROOT, 'pages');
  for (const d of fs.readdirSync(dir)) {
    const f = path.join(dir, d, d + ext);
    if (fs.existsSync(f)) out.push({ name: d, rel: 'pages/' + d + '/' + d + ext });
  }
  return out;
}

function walkWxml(dirRel) {
  const out = [];
  const dir = path.join(ROOT, dirRel);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = dirRel + '/' + entry.name;
    if (entry.isDirectory()) out.push(...walkWxml(rel));
    else if (entry.name.endsWith('.wxml')) out.push(rel);
  }
  return out;
}

const WXML = walkWxml('pages').concat(walkWxml('components'));

check('所有 wxml 的主要标签都配平', function () {
  for (const rel of WXML) {
    const s = read(rel);
    for (const tag of ['view', 'block', 'button', 'text']) {
      const open = (s.match(new RegExp('<' + tag + '(?=[\\s>])', 'g')) || []).length;
      const self = (s.match(new RegExp('<' + tag + '[^>]*/>', 'g')) || []).length;
      const close = (s.match(new RegExp('</' + tag + '>', 'g')) || []).length;
      assert.strictEqual(open - self, close, rel + ' 的 <' + tag + '> 未配平');
    }
  }
});

check('每个页面绑定的事件处理方法都在同名 js 里有定义', function () {
  const re = /bind(?:tap|longpress|input|chooseavatar|touchstart|touchend|touchcancel|signedin)="([A-Za-z_$][\w$]*)"/g;
  for (const p of pageFiles('.wxml')) {
    const wxml = read(p.rel);
    const js = read(p.rel.replace(/\.wxml$/, '.js'));
    const names = [...new Set([...wxml.matchAll(re)].map(function (m) { return m[1]; }))];
    for (const n of names) {
      const defined = new RegExp('(^|[^\\w])' + n.replace(/\$/g, '\\$') + '\\s*[:(]', 'm').test(js);
      assert.ok(defined, p.rel + ' 绑定了 ' + n + '，但 js 中找不到该方法');
    }
  }
});

check('洞府页有常驻吸底主按钮，且不再重复 tabBar 的跳转', function () {
  const s = read('pages/index/index.wxml');
  assert.ok(/class="sticky-bar"/.test(s), '缺少吸底操作条');
  assert.ok(/bindtap="onQuickPractice"/.test(s), '主按钮未绑定 onQuickPractice');
  assert.ok(/pg--with-bar/.test(s), '未给吸底条预留页面底部空间');
  assert.ok(!/bindtap="onGoBattle"/.test(s), '仍保留与 tabBar 重复的「去切磋」');
  assert.ok(!/>看道牒</.test(s), '仍保留与 tabBar 重复的「看道牒」');
});

check('低频信息不占首屏：日志独立成页，诸界与设置默认折叠', function () {
  const index = read('pages/index/index.wxml');
  const profile = read('pages/profile/profile.wxml');
  const log = read('pages/log/log.wxml');
  assert.ok(!/onToggleWorld|worlds|修行记录/.test(index), '主页还留着日志 / 诸界长区块');
  assert.ok(/bindtap="onToggleWorld"/.test(profile) && /wx:if="\{\{worldOpen\}\}"/.test(profile), '人物页诸界不能折叠');
  assert.ok(/bindtap="onToggleWorld"/.test(log) && /wx:if="\{\{worldOpen\}\}"/.test(log), '日志页诸界不能折叠');
  assert.ok(/onToggleWorld\s*:/.test(read('pages/profile/profile.js')));
  assert.ok(/onToggleWorld\s*:/.test(read('pages/log/log.js')));
  // 人物页低频区块都有独立折叠开关，称号已独立成页，只剩成 / 背包 / 设置。
  for (const fn of ['onToggleAchBlock', 'onToggleMore', 'onToggleSettings']) {
    assert.ok(new RegExp(fn + '\\s*:').test(read('pages/profile/profile.js')), '人物页缺折叠方法 ' + fn);
  }
  // 称号本不再埋在人物页，而是六宫格里的独立页；人物页只留一行入口。
  assert.ok(/bindtap="onGoTitles"/.test(profile), '人物页没有通往称号簿的入口');
  assert.ok(!/titlesOpen/.test(profile), '称号仍然埋在人物页折叠区里');
});

check('所有弹窗统一「次操作在左、主操作在右」', function () {
  let blocks = 0;
  for (const rel of WXML) {
    const s = read(rel);
    const re = /<view class="modal__actions">([\s\S]*?)<\/view>/g;
    let m = re.exec(s);
    while (m) {
      const buttons = [...m[1].matchAll(/<button[^>]*class="([^"]*)"[^>]*>/g)].map(function (x) { return x[1]; });
      const major = [];
      let lastMinor = -1;
      buttons.forEach(function (c, i) {
        if (/btn--primary|btn--gold|imm-btn(?![\w-])/.test(c)) major.push(i);
        else lastMinor = i;
      });
      if (major.length > 0) {
        // wx:if / wx:elif 互斥的主按钮在静态文本里会同时出现，全部都必须在次要按钮之后
        assert.ok(Math.min(...major) > lastMinor, rel + ' 的主按钮没有排在次要按钮之后：' + buttons.join(' | '));
      }
      blocks += 1;
      m = re.exec(s);
    }
  }
  assert.ok(blocks >= 7, '弹窗数量异常：' + blocks);
});

check('不可撤销操作使用警示样式并与常规操作分区', function () {
  const s = read('pages/profile/profile.wxml');
  const reset = (s.match(/<button[^>]*bindtap="onReset"[^>]*>/) || [])[0] || '';
  const signOut = (s.match(/<button[^>]*bindtap="onSignOut"[^>]*>/) || [])[0] || '';
  assert.ok(/imm-btn--danger/.test(reset), '重置存档未用警示样式');
  assert.ok(/imm-btn--danger/.test(signOut), '退出登录未用警示样式');
  assert.ok(/以下操作不可撤销/.test(s), '缺少危险操作提示');
  // 危险按钮只有一支：immortal.wxss 的 .imm-btn--danger。旧通用按钮族的 .btn--warn 已随改版删除。
  assert.ok(/\.imm-btn--danger\s*\{/.test(read('styles/immortal.wxss')), 'immortal.wxss 未定义 .imm-btn--danger');
});

check('参悟局内收功放在屏幕上方且带二次确认', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  assert.ok(/class="hud__quit" bindtap="onAbandon"/.test(s), '收功不在局内 HUD 上方的独立小入口');
  const bar = (s.match(/<view[^>]*class="sticky-bar[^"]*"[\s\S]*?<\/view>/) || [])[0] || '';
  assert.ok(bar.length > 0, '局内缺少吸底辅助操作条');
  assert.ok(!/onAbandon/.test(bar), '收功仍放在拇指热区，容易误触');
  assert.ok(/bindtap="onUndo"/.test(s) && /bindtap="onHint"/.test(s), '撤销/提示未放进吸底条');
  assert.ok(/中途收功/.test(js) && /wx\.showModal/.test(js), '收功缺少二次确认');
});

check('参悟局内隐藏功法头卡，盘面优先', function () {
  const s = read('pages/practice/practice.wxml');
  assert.ok(/wx:if="\{\{!started \|\| showResult\}\}" class="card card--ink pr-head"/.test(s), '局内仍渲染功法头卡，挤占盘面');
});

check('参悟吸底条只在有操作时出现', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  assert.ok(/class="pg pg--imm \{\{barMode \? 'pg--with-bar' : ''\}\}[^"]*"/.test(s), '页面未按 barMode 留底部空间');
  assert.ok(/sceneOn && started && !showResult \? 'pg--scene' : ''/.test(s), '沉浸舞台没有按样板开关与局内状态挂载');
  assert.ok(/barMode === 'start'/.test(s) && /barMode === 'tools'/.test(s), '吸底条缺少开始/工具两种形态');
  assert.ok(/syncBar: function/.test(js), '缺少吸底条状态同步');
  const start = (s.match(/barMode === 'start'[\s\S]*?<\/view>/) || [])[0] || '';
  assert.ok(/bindtap="onStart"/.test(start), '准备页的开始按钮不在吸底条里');
  assert.ok(/bindtap="onBack"/.test(start), '准备页缺少退出入口');
});

check('两种 F 分开处置：收功作废，走火照常结算', function () {
  // 同一条 grade === 'F' 有两个来历，处置必须不同：
  //   ① 玩家点「收功」→ 整局作废，不进 applyPractice，由 breakCombo 把连 S 归零；
  //   ② 玩法判负（阵溃 / 心神尽 / 时辰到）→ 一局打完的结果，进结算、断连，但零收益。
  // 旧写法把所有 F 都当 ①，于是「蓄力偏离」「阵溃」也被显示成「中途收功 · 这回不算数」，
  // 玩家既看不到自己栽在哪，也拿不到结算卡。
  const js = read('pages/practice/practice.js');
  assert.ok(/this\.aborting = false/.test(js), '新一局没清掉收功标记');
  assert.ok(/self\.aborting = true/.test(js), '玩家收功时没置位，结算分不出是哪种 F');
  assert.ok(/grade === 'F' && \(this\.aborting \|\| this\.mode === 'breakthrough'\)/.test(js),
    '所有 F 都被当成收功，走火拿不到结算');
  assert.ok(/未走完，按「走火」不计所得/.test(js), '走火结算没写清「一分不给」');
  assert.ok(/r\.wiped/.test(js), '结算卡没把走火与正常局分开，会显示一排 +0');
  assert.ok(/engine\.breakCombo\(/.test(js), '收功没把连 S 归零，能靠中途退出保住连击');
  assert.ok(/连 S 归零/.test(js), '收功确认框没写明连 S 会断');
});

check('说明页写清本档四条线：C / B / A / S 各自要什么', function () {
  // 玩家问过「每个小游戏怎么才能拿 C、B、A、S」——以前只有一句「按总分评」，
  // 门槛数字埋在玩法文件里，局内还只看得到下一条线。现在由各玩法 lines() 统一给出。
  const help = require('../data/help.js');
  const pd = require('../data/practice.js');
  for (const m of pd.PRACTICE_METHODS) {
    const t = help.practiceTopic({ method: m.id, stage: 'minor' });
    const sec = t.sections.filter(function (x) { return x.key === 'score'; })[0];
    assert.ok(sec, m.id + ' 的说明页没有评级节');
    const text = sec.lines.join(' ');
    assert.ok(/本段「小成」/.test(text), m.id + ' 没写清是哪一段的门槛');
    ['S', 'A', 'B', 'C'].forEach(function (g) {
      assert.ok(text.indexOf(g) >= 0, m.id + ' 的四条线缺 ' + g);
    });
  }
  // 链接没带档时按简单档给，不许留空或写「见局内」。
  const plain = help.practiceTopic({ method: 'tanlei' });
  const line = plain.sections.filter(function (x) { return x.key === 'score'; })[0].lines.join(' ');
  assert.ok(/本段「未入门」/.test(line), '没带段位时没回落到第一段');
});

check('规则分层：准备页一行、局内两行、整篇在说明页', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  // 准备页只留一行「这一局做什么」：整篇步骤与术语表搬去了说明页。
  assert.ok(/\{\{ruleText\}\}/.test(s), '准备页没有一行「本局规则」');
  assert.ok(/guides\.guideOf\(method\.game\)/.test(js) && /ruleText: ruleText/.test(js),
    '本局规则没从 guides 取，又抄了一遍');
  assert.ok(!/guide\.steps/.test(s) && !/guide\.terms/.test(s),
    '准备页又在铺整篇步骤与术语表（一屏塞不下，等于没人看）');
  // 长解释只有一个入口：按功法现拼的说明页。局中切页即本局作废，所以入口只能在开局前。
  assert.ok(/bindtap="onGoHelp"/.test(s) && /onGoHelp: function/.test(js), '准备页缺「说明」入口');
  assert.ok(/nav\.practiceHelpUrl/.test(js), '说明入口没走导航真源');
  const navSrc = read('data/navigation.js');
  assert.ok(/function practiceHelpUrl/.test(navSrc) && /topic=practice/.test(navSrc),
    '导航真源没有按功法生成的说明入口');
  const help = read('data/help.js');
  assert.ok(/function practiceTopic/.test(help) && /guides\.guideOf\(gameId\)/.test(help),
    '说明页没有按功法现拼规则');
  assert.ok(/guide\.steps/.test(help) && /guide\.terms/.test(help), '说明页没接住步骤与术语表');
  assert.ok(/practiceTopic/.test(read('pages/help/help.js')), '说明页没接上 practice 主题');
  assert.ok(/class="pr-hint__terms"[\s\S]*?guide\.inline/.test(s), '局内没有常驻术语速记');
  const click = read('minigames/click.js');
  assert.ok(/edgeName: '金锋'/.test(read('data/weapons.js')), '预留剑 profile 的金色长招没叫金锋');
  assert.ok(/profile\.edgeName/.test(click), '金色长招名没走兵器轴，容易串回剑法');
  assert.ok(/顺着每桩箭头把刀扫到靶心/.test(read('data/guides.js')), '刀法·开锋斩桩诀说明没讲清顺箭头扫到靶心');
});

check('顺光扫斩：透明触摸层 + 坐标插值还原划动轨迹', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  const css = read('pages/practice/practice.wxss');
  const common = read('minigames/common.js');
  assert.ok(/class="swipe-layer"/.test(s) && /catchtouchmove="onBoardTouchMove"/.test(s), '盘面没有独立的划动触摸层');
  assert.ok(/bindtouchstart="onBoardTouchStart"/.test(s) && /bindtouchend="onBoardTouchEnd"/.test(s), '触摸层缺起手或抬手事件');
  assert.ok(/measureBoard/.test(js) && /boundingClientRect/.test(js), '没有预先量格子矩形');
  assert.ok(/Math\.sqrt\(dx \* dx \+ dy \* dy\)/.test(read('utils/swipe.js')), '相邻 move 之间没插值，划快了会漏桩');
  assert.ok(/swipeInput\.sampleLine/.test(js), '页面没有用插值结果补格');
  assert.ok(/controller\.swipe\(path, \{ hold: hold \}\)/.test(js), '页面没有把轨迹与收势停留交给玩法层');
  assert.ok(/lastStepAt/.test(js), '页面没有记录最后一次换格的时刻，收势判不出来');
  assert.ok(/showSwipe/.test(common) && /swipe: noop/.test(common), '统一协议里没有 swipe 与 showSwipe');
  assert.ok(/\.grid__slash-beam/.test(css) && /slashSweep/.test(css), '斩中缺少按招式角度掠过的白光');
  assert.ok(/\.cell--path\b/.test(css) && /\.cell--pathon/.test(css), '刀路缺光痕与光头两种状态');
  assert.ok(/\.cell--pathfake/.test(css), '双锋的虚招没有单独的暗色刀路');
  assert.ok(/\.cell--ban/.test(css), '禁桩没有盘面标记');
  assert.ok(/endBreath/.test(css) && /\.cell__end--live/.test(css), '双锋的真招靶心没有呼吸');
});

check('音效保持柔和不叠加（刺耳问题不退回去）', function () {
  const sfx = read('utils/sfx.js');
  const gen = read('scripts/gen-sfx.js');
  assert.ok(/const VOICE = \[/.test(sfx) && /cutVoice\(/.test(sfx), '判定音没有共用单声道，连击会叠成嗡鸣');
  assert.ok(/GLOBAL_GAP/.test(sfx), '缺少全局最小间隔');
  for (const m of sfx.matchAll(/volume:\s*([\d.]+)/g)) {
    assert.ok(Number(m[1]) <= 0.4, '播放音量又调大了：' + m[1]);
  }
  for (const m of sfx.matchAll(/pool:\s*(\d+)/g)) {
    assert.strictEqual(Number(m[1]), 1, '音效池又允许并发叠加');
  }
  assert.ok(/soften\(/.test(gen) && /PEAK = 0\.52/.test(gen), '合成端没有低通软起音与峰值限制');
});

check('局内音效有资源、有开关、跟着判定浮字走', function () {
  const sfx = read('utils/sfx.js');
  const practice = read('pages/practice/practice.js');
  const profile = read('pages/profile/profile.wxml');
  for (const f of ['tap', 'hit', 'miss', 'gold', 'tick', 'go', 'clear', 'settle', 'fail']) {
    assert.ok(new RegExp('\\b' + f + ':\\s*\\{').test(sfx), 'sfx 缺少音效：' + f);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/sfx', f + '.wav')), '缺少音效文件 assets/sfx/' + f + '.wav');
  }
  assert.ok(/sfx\.tone\(vm\.fx\.tone\)/.test(practice), '局内浮字没有接音效');
  assert.ok(/sfx\.warm\(\)/.test(practice), '进入参悟页没有预热音频上下文');
  assert.ok(/onToggleSfx/.test(profile), '道牒页缺少音效开关');
});

check('切磋与秘境拆成两页：各自只排自己的列表，按钮层级也不一样', function () {
  const battle = read('pages/battle/battle.wxml');
  const secret = read('pages/secret/secret.wxml');
  // 切磋页只剩同门对手，按钮是行内紧凑按钮；再不出现「入秘境」。
  let fights = 0;
  for (const line of battle.split('\n')) {
    if (/bindtap="onFight"/.test(line)) {
      fights += 1;
      assert.ok(!/imm-btn--block/.test(line), '仍有整宽重复按钮：' + line.trim());
      assert.ok(/imm-btn--sm/.test(line), '未使用行内紧凑按钮：' + line.trim());
    }
  }
  // 同门那一段是一个 wx:for 里的行内按钮（六位对手共用一行模板），不再有第二个列表。
  assert.strictEqual(fights, 1, '切磋页出现了第二个对手列表（秘境是不是又搬回来了）');
  assert.ok(battle.indexOf('入秘境') < 0, '秘境列表又回到切磋页了：两页各排一份必然有一页先改');
  assert.ok(battle.indexOf('onGoSecret') < 0, '切磋页又留了一条去秘境的指路：秘境在自己的宫格里，不必在别页再开一个门');
  // 秘境行必须是细描边的次操作，不能和「挑战」同为金色实心。
  let walks = 0;
  for (const line of secret.split('\n')) {
    if (!/bindtap="onFight"/.test(line)) continue;
    walks += 1;
    assert.ok(/imm-btn--ghost/.test(line), '秘境按钮没和战斗按钮拉开层级：' + line.trim());
    assert.ok(/imm-btn--sm/.test(line), '秘境按钮不是行内紧凑按钮：' + line.trim());
  }
  assert.ok(walks >= 1, '秘境页没有「入秘境」按钮');
  // 两页共用一份结算卡：抄成两份的话，改一处就有一处会忘。
  for (const src of [battle, secret]) {
    assert.ok(/<duel-result\b/.test(src), '对决结算没走共用组件');
    assert.ok(!/class="modal"/.test(src), '页面里又自绘了一份结算弹窗');
  }
  // 秘境页不复述对手名单，也不在页尾再开一个去切磋的门：两页都由主页宫格进。
  assert.ok(secret.indexOf('onGoBattle') < 0 && secret.indexOf('战力码') < 0, '秘境页又把切磋那份东西抄过来了');
});

check('不再使用会被 .btn-row 覆盖的 mt12 / mt16 组合', function () {
  for (const rel of WXML) {
    assert.ok(!/class="btn-row mt\d+"/.test(read(rel)), rel + ' 仍有失效的间距组合');
  }
});

check('按钮与文字链尺寸取自令牌，且令牌满足最小触控高度', function () {
  const css = read('app.wxss');
  const tokens = read('styles/tokens.wxss');
  const size = function (name) {
    const m = tokens.match(new RegExp('--' + name + ':\\s*(\\d+)rpx'));
    return m ? Number(m[1]) : 0;
  };
  assert.ok(size('touch') >= 84, '--touch 低于 84rpx 主操作下限');
  assert.ok(size('touch-sm') >= 72, '--touch-sm 低于 72rpx 次操作下限');
  assert.ok(size('touch-xs') >= 64, '--touch-xs 低于 64rpx 紧凑操作下限');
  const btn = (css.match(/\.btn \{[\s\S]*?\}/) || [])[0] || '';
  assert.ok(/min-height:\s*var\(--touch\)/.test(btn), '.btn 没有取主操作令牌');
  const small = (css.match(/\.btn--small \{[^}]*\}/) || [])[0] || '';
  assert.ok(/min-height:\s*var\(--touch-sm\)/.test(small), '.btn--small 没有取次操作令牌');
  const link = (css.match(/\.text-link \{[\s\S]*?\}/) || [])[0] || '';
  assert.ok(/min-height:\s*var\(--touch-xs\)/.test(link), '.text-link 没有可点热区');
});

check('吸底条适配安全区且有高优先级底部留白', function () {
  const css = read('app.wxss');
  assert.ok(/env\(safe-area-inset-bottom\)/.test((css.match(/\.sticky-bar \{[\s\S]*?\}/) || [])[0] || ''));
  assert.ok(/\.pg\.pg--with-bar \{/.test(css), '留白选择器优先级不足');
});

check('视觉标准落在唯一真源，样板阶段只对刀法·开锋斩桩诀开', function () {
  const v = require('../data/visual.js');
  assert.strictEqual(Object.keys(v.FAMILIES).length, 4, '四类主题色板不齐（兵刃 / 心法 / 丹道 / 阵法）');
  assert.deepStrictEqual(Object.keys(v.ENABLED), ['forge'], '样板阶段不该一次改十套');
  assert.ok(v.isOn('forge') && !v.isOn('seal'), '沉浸舞台开关没按主题生效');
  assert.ok(v.MOTION.particles <= v.MOTION.particleCap && v.MOTION.particleCap <= 12, '粒子超预算');
  assert.ok(v.MOTION.loops <= 3, '常驻循环动画超预算');
  assert.strictEqual(v.settleTimeline('S')[4], 1800, 'S 级结算不是 1.8 秒');
  assert.strictEqual(v.settleTimeline('C')[4], 900, 'B/C/F 结算没压到 900ms');
  assert.ok(/@import\s+"\.\/styles\/scene\.wxss"/.test(read('app.wxss')), '场景样式没有全局引入');
});

check('三层场景与游戏化 HUD 已接线，玩法模块不碰视觉', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  for (const cls of ['scene__sky', 'scene__moon', 'scene__ridge', 'scene__gate', 'scene__clouds', 'scene__qi']) {
    assert.ok(s.indexOf(cls) >= 0, '缺少场景层：' + cls);
  }
  for (const cls of ['scene-hud__incense', 'scene-hud__lamp', 'scene-hud__meter', 'scene-hud__score-num']) {
    assert.ok(s.indexOf(cls) >= 0, '缺少游戏化 HUD：' + cls);
  }
  assert.ok(/visual\.stageOf\(this\.theme\.key\)/.test(js), '舞台主题没有从唯一真源取');
  assert.ok(/incensePercent/.test(js) && /makeBurst/.test(js), '香炷或命中爆发没接线');
  for (const f of fs.readdirSync(path.join(ROOT, 'minigames'))) {
    if (!/\.js$/.test(f)) continue;
    const src = read('minigames/' + f);
    assert.ok(!/require\(.*visual|scene__|--glow/.test(src), '玩法模块混进了视觉字段：' + f);
  }
});

check('结算五段演出可跳过，且只替换样板玩法的弹窗', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  for (let i = 1; i <= 4; i += 1) {
    assert.ok(s.indexOf('settlePhase >= ' + i) >= 0, '结算缺少第 ' + i + ' 段');
  }
  assert.ok(/bindtap="onSkipSettle"/.test(s), '演出没有跳过入口');
  assert.ok(/onSkipSettle: function/.test(js) && /startSettle: function/.test(js), '演出时序没有落地');
  assert.ok(/visual\.settleTimeline\(grade\)/.test(js), '没有按评级选满/短演出');
  const settleAt = s.indexOf('class="settle"');
  const oldModal = s.indexOf('wx:elif="{{showResult && result}}"');
  assert.ok(settleAt > 0 && oldModal > settleAt, '旧结算卡没有作为非样板玩法的 wx:elif 分支保留');
  assert.ok(/catchtap="onPrimary"/.test(s), '结算按钮会冒泡触发跳过');
});

check('舞台动画只动 transform / opacity，不超循环预算', function () {
  const css = read('styles/scene.wxss');
  const blocks = css.match(/@keyframes\s+[\w-]+\s*\{[\s\S]*?\n\}/g) || [];
  assert.ok(blocks.length >= 10, '关键帧数量不对');
  for (const b of blocks) {
    assert.ok(!/\b(left|top|right|bottom|width|height|background|box-shadow|filter)\s*:/.test(b),
      '关键帧里出现会触发重排 / 重绘的属性：' + b.slice(0, 40));
  }
  const v = require('../data/visual.js');
  assert.ok((css.match(/infinite/g) || []).length <= v.MOTION.loops, '常驻循环动画超过 3 路');
});

check('刀路用形状指方向：箭头节点、纯 CSS 图形、盘面无汉字', function () {
  const wxml = read('pages/practice/practice.wxml');
  const css = read('pages/practice/practice.wxss');
  const click = read('minigames/click.js');
  assert.ok(/class="cell__arrow"/.test(wxml), '盘面没有箭头节点');
  assert.ok(/rotate\(\{\{item\.arrow\}\}deg\)/.test(wxml), '箭头没有按格子方向旋转');
  assert.ok(/class="cell__end/.test(wxml), '收势桩没有靶心节点');
  assert.ok(/\.cell__arrow-head/.test(css) && /\.cell__arrow-shaft/.test(css), '箭头不是纯 CSS 画的，不能靠文字字形');
  assert.ok(/function dirAngle/.test(click), '玩法层没有算相邻桩方向');
  assert.ok(!/theme\.glyph \|\| '锋'/.test(click), '刀路还在写「锋」字');
  assert.ok(!/回锋/.test(click), '还留着「回锋」这种反向招式名');
  assert.ok(!/containsSeq\(path, form\.slice\(\)\.reverse\(\)\)/.test(click), '判定还允许反着划');
});

check('局内提示明确禁止反向，不再写「反着划也算」', function () {
  const wxml = read('pages/practice/practice.wxml');
  const guides = read('data/guides.js');
  assert.ok(!/反着划也算/.test(wxml), 'HUD 还在说反着划也行');
  assert.ok(/反向算劈空/.test(wxml), 'HUD 没写清方向约束');
  assert.ok(/箭头/.test(guides) && /不能反/.test(guides), '玩法说明没讲箭头与禁反向');
});

check('兵器语言收在 data/weapons.js，玩法模块不硬编码招式名与称谓', function () {
  const click = read('minigames/click.js');
  const w = read('data/weapons.js');
  assert.ok(/require\('\.\.\/data\/weapons\.js'\)/.test(click), 'click 引擎没接兵器轴');
  assert.ok(/W\.weaponOf\(p\.weapon\)/.test(click), '兵器没从 params 读');
  assert.ok(/profile\.names/.test(click) && /words\./.test(click), '招式名与文案没走 profile');
  assert.ok(!/'平削'|'直刺'|'横劈'|'立劈'|'一剑中的'|'一刀斩中'/.test(click), '玩法模块里又硬编码了兵器称谓');
  assert.ok(/PROFILES = \{[\s\S]*sword:[\s\S]*dao:/.test(w), '兵器表没有剑 / 刀两套 profile');
  assert.ok(/weapon: 'dao'/.test(read('data/practice.js')), '刀法·开锋斩桩诀没标兵器');
  // 剑法·截锋断岳诀 2026-11 退役，practice 里已经没有剑法门；weapons.js 的 sword 一套
  // 留着待回填（它是兵器语言表，不是某一门的实现），所以这里只守「刀法标了兵器」。
});

check('战力明细收进「说明」真源，首屏只留数值；指南保留完整算法', function () {
  const help = require('../data/help.js');
  const power = help.topicOf('home').sections.filter(function (s) { return s.key === 'power'; })[0];
  const lines = (power ? power.lines : []).join('');
  assert.ok(lines.length > 0, '说明页缺战力专节');
  assert.ok(/体魄 ×1\.0/.test(lines) && /境界加成/.test(lines) && /功法特效/.test(lines), '说明没讲公式三项');
  assert.ok(/突破境界/.test(lines) && /化境/.test(lines) && /另择一门/.test(lines)
    && /不减所得/.test(lines), '说明没讲突破、特效与「只奖不罚」');
  const index = read('pages/index/index.wxml');
  const indexJs = read('pages/index/index.js');
  assert.ok(!/powerOpen|powerLines|怎么提升战力/.test(index + indexJs), '主页又把长公式印回脸上');
  assert.ok(/ov\.power/.test(index), '主页连战力数值都不显示了');
  const guide = read('pages/guide/guide.js');
  assert.ok(/title: '四 · 战力从哪来'/.test(guide), '修行指南没有战力专节');
  assert.ok(/战力 = 属性加权/.test(guide) && /同一门连练不减所得/.test(guide), '指南没讲公式与「只奖不罚」');
  assert.ok(/title: '二 · 离线吐纳之规'/.test(guide), '插了新专节，后面章节编号没顺延');
});

check('循数勘禁诀按经典扫雷深耕：无猜、首点空白、连开、分数方向', function () {
  const m = read('minigames/mines.js');
  const g = read('data/guides.js');
  const p = read('data/practice.js');
  assert.ok(/function solvable/.test(m) && /LAYOUT_TRIES/.test(m), '布禁制没验「不用猜」');
  assert.ok(/firstZone/.test(m), '首点及其八邻没有免禁制');
  assert.ok(/function chord/.test(m), '布符后没有连开');
  assert.ok(/scoreOf\(\)/.test(m) && !/score: elapsed/.test(m), '结算分仍是耗时，破纪录方向是反的');
  assert.ok(!/hard \? 3/.test(m), '还在 ctx.difficulty 上叠 +3，三档会挤成一盘');
  assert.ok(/MINE_GLYPH = '✕'/.test(m) && /FLAG_GLYPH = '⚑'/.test(m), '盘面还在写汉字');
  assert.ok(/不必猜/.test(g) && /连开/.test(g) && /⚑/.test(g), '玩法说明没讲无猜与连开');
  assert.ok(/tanlei: \[/.test(p) && /洞玄/.test(p), '阶段新法没登记循数勘禁诀');
});

check('循数勘禁诀局内只讲「在追哪一档」：不摆当前评级，HUD 不重复计数', function () {
  const m = read('minigames/mines.js');
  const g = read('data/guides.js');
  const w = read('pages/practice/practice.wxml');
  // 评级只看用时，按当前用时反推出来的档，开局那一刻必是 S。摆进 HUD 等于告诉玩家
  // 「已经拿到 S 了」，之后只能看它一路往下掉。局内改成只报下一档的时限。
  assert.ok(/showGradeNow = false/.test(m), '循数勘禁诀又把「当前评级」摆回 HUD 了');
  // 时间线跟着盘面格数走（9×9 的 S 线是 56 秒而不是 25 秒），所以第二个实参
  // 可能是 GRADE_LINE 也可能是本盘算出来的 line；两者都算「给了下一档的时限」。
  assert.ok(/C\.paceGoal\(elapsed,\s*(GRADE_LINE|line)\)/.test(m), '局内没给「下一档还差几秒」');
  // 同样的反推逻辑不止探禁一家：搭桥、翻牌也按用时评级。凡是这类玩法都不许摆当前档位。
  for (const name of ['seal']) {
    const src = read('minigames/' + name + '.js');
    assert.ok(/showGradeNow = false/.test(src), 'minigames/' + name + '.js 还在 HUD 上摆按用时反推的档位');
    assert.ok(/C\.paceGoal\(elapsed, GRADE_LINE/.test(src), 'minigames/' + name + '.js 没给「下一档还差几秒」');
  }
  assert.ok(m.indexOf("'还剩 '") < 0, 'HUD 又用「还剩 N 格」重复「已探 X / Y」');
  assert.ok(/不必靠猜/.test(m), '提示区没讲「此盘不必猜」');
  // 扫雷原生词一律换题材词：旗 → 阵钉（盘面上的 ⚑ 只是个记号，不落汉字）。
  assert.ok(!/插旗|旗数/.test(m + g), '还在用「插旗 / 旗数」，扫雷既视感没洗掉');
  assert.ok(/阵钉/.test(m) && /阵钉/.test(g), '阵钉没进玩法与说明');
  // 玩法名一屏只写一处：页头那一处，其余卡片的 tag 都该收掉。
  assert.strictEqual((w.match(/\{\{gameName\}\}/g) || []).length, 1, '同一屏上写了两遍玩法名');
});

check('突破只有战力一个门槛：文案不许再讲「功法条件」', function () {
  // world.realms[].power 是唯一判据，「主修三门大成」只是面板上的参考项。
  // 上一版把参考项写成了条件，主页还会提示「还差功法条件」——那是永远不会出现的状态
  //（战力够了就已经 available），属于死分支 + 误导文案。
  const index = read('pages/index/index.js');
  const help = read('data/help.js');
  const profile = read('pages/profile/profile.js');
  assert.ok(!/功法条件/.test(index + help), '又把「功法条件」当成突破门槛了');
  assert.ok(/imm-check__mark--ref/.test(profile), '主修三门又被当成条件打了勾叉');
});

check('战力是阶梯：结算与主页都要说「跳到多少」，不能只报缺口', function () {
  const game = require('../utils/game.js');
  const s = game.createNewState();
  // 境界加成是乘数：突破之后战力必然高于现在。只写「还差 46」玩家算不出这一步的收益。
  const bt = game.breakthroughInfo(s);
  assert.ok(bt.powerAfter > bt.power, '没算出突破后的战力：' + bt.power + ' → ' + bt.powerAfter);
  assert.ok(bt.powerGain > 0, '突破的战力增量算成了 0');

  // 属性 = 功法条目 × 段位系数，段位是阶梯。所以练一局常常「熟练度涨了、战力没动」，
  // 这不是 bug，是设计。界面必须能如实表达它，而不是每局丢一个 +0 给玩家。
  const id = Object.keys(s.skills).filter(function (k) { return s.skills[k].unlocked; })[0];
  const r = game.applyPractice(s, id, 'S', { difficulty: 'novice', score: 100 });
  assert.ok(r.ok, '参悟结算没跑通');
  assert.ok(typeof r.powerBefore === 'number' && typeof r.powerAfter === 'number', '结算没带战力前后值');
  assert.ok(r.profAfter > r.profBefore, '熟练度没涨，断言前提不成立');

  const page = read('pages/practice/practice.js');
  assert.ok(/k: '战力'/.test(page), '结算面板没摆战力');
  assert.ok(/距离「/.test(page), '结算面板没摆「离下一境还差多少」');
  assert.ok(/跨段才涨/.test(page), '战力没跳时没解释原因，玩家会以为白练');
  assert.ok(/powerBefore: info\.power/.test(read('utils/game.js')), '突破结算没带战力前后值');

  const index = read('pages/index/index.js');
  assert.ok(/powerGain/.test(index), '主页只报缺口，没说突破能得到什么');
});

check('局内两行不说同一句话：tip 讲代价，inline 讲操作', function () {
  const practice = require('../data/practice.js');
  const guides = require('../data/guides.js');
  for (const m of practice.PRACTICE_METHODS) {
    const gd = guides.guideOf(m.game);
    assert.ok(gd && gd.inline, m.id + ' 没有局内速记');
    // 中文里连续 6 个字一模一样，读起来就是同一句话说了两遍；两行的分工是
    // 「这一局的代价」vs「手怎么动」，不该有长段落重合。
    const a = m.tip;
    const b = gd.inline;
    let best = 0;
    for (let i = 0; i < a.length; i += 1) {
      for (let j = 0; j < b.length; j += 1) {
        let k = 0;
        while (a[i + k] && b[j + k] && a[i + k] === b[j + k]) k += 1;
        if (k > best) best = k;
      }
    }
    assert.ok(best < 6, m.id + ' 的提示与速记重合了 ' + best + ' 个字：' + a + ' / ' + b);
  }
});

check('准备页交代「下一段给什么」与「这一段收紧了什么」', function () {
  const wxml = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  const world = require('../data/world.js');
  const practice = require('../data/practice.js');
  // 只写「距小成还差 114」等于只给数字：练到那一步能拿什么，得从 world.TIERS 里搬出来。
  assert.ok(/nextBenefit/.test(wxml) && /nextTier\.desc/.test(js), '准备页没交代下一段给什么');
  for (const t of world.TIERS) assert.ok(t.desc && t.desc.length >= 4, t.name + ' 没写收益');
  // 难度档：倍率之外实际收紧了哪几处，diffDetail.brief 早就算好了，以前没渲染。
  assert.ok(/stageBoardBrief/.test(wxml) && /stageBoardBrief: stageInfo\.brief/.test(js), '段位只摆了名号，没摆本段收紧了什么');
  const d = practice.stageDetail(practice.getMethod('recite'), 'entry');
  assert.ok(d.brief.indexOf('→') >= 0, '难度对比没算出任何变化：' + d.brief);
});

check('局内速记只列已解锁的进阶机制，收起态不吓新手', function () {
  const wxml = read('pages/practice/practice.wxml');
  const guides = require('../data/guides.js');
  const practice = require('../data/practice.js');
  // 逆诵（大成）与死门（大成）都是后面才有的规则，收起态里不该先出现。
  assert.ok(guides.guideOf('memory').inline.indexOf('逆诵') < 0, '记序复现的速记又提前写了逆诵');
  assert.ok(guides.guideOf('lights').inline.indexOf('忌') < 0, '阵灯推演的速记又提前写了死门');
  // 折叠态把「已解锁且开着」的阶段新法缩成一行（死门＝✕ 格点不得）；
  // 未解锁的、被玩家关掉的都不列——速记里也不许提前剧透。
  assert.ok(/stageBrief/.test(wxml) && /'＝' \+ r\.short/.test(read('pages/practice/practice.js')),
    '折叠态没接已解锁的阶段新法');
  assert.ok(!/guide__inline-more/.test(wxml), '速记里又塞了一遍未解锁的规则');
  for (const id of Object.keys(practice.STAGE_RULES)) {
    for (const r of practice.STAGE_RULES[id]) {
      assert.ok(r.short && r.short.length >= 2, id + '/' + r.name + ' 缺速记写法 short');
    }
  }
});

check('阶段新法可关：只有「改规矩」的才给开关，关了真的不触发', function () {
  const practice = require('../data/practice.js');
  const engine = require('../utils/game.js');
  const wxml = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');

  // 逆诵会改点击方向、死门会多一格不能碰的、收势要求停一拍——这些是「改规矩」，
  // 练到解锁之后玩家该能关掉。照影 / 照纹 / 稳基是纯加成，关掉没有任何好处，
  // 给它们开关只是多一处看不懂的东西。
  assert.ok(practice.STAGE_RULES.recite.some(function (r) { return r.name === '逆诵' && r.hard; }),
    '逆诵没被标成可关');
  assert.ok(practice.STAGE_RULES.arrayEye.some(function (r) { return r.hard; }),
    '死门没被标成可关');
  assert.ok(!practice.STAGE_RULES.tanlei.some(function (r) { return r.hard; }),
    '循数勘禁诀的纯加成也被给了开关');
  assert.ok(!practice.STAGE_RULES.stackstone.some(function (r) { return r.hard; }),
    '万石成岳诀的纯加成也被给了开关');

  // 开关要一路通到底：准备页有 UI、页面把开关塞进 perks、玩法模块真的读它。
  // 用自己的胶囊不用原生 switch：后者在墨底上未选中轨道是一块白，与皮肤冲突。
  assert.ok(/stage-rule__toggle/.test(wxml) && /onToggleTwist/.test(wxml), '准备页没有阶段新法的开关');
  assert.ok(!/stage-rule__switch/.test(wxml) && !/<switch/.test(wxml), '准备页又用回了原生 switch');
  assert.ok(/offTwists: engine\.twistsOff/.test(js), '开关没传进这一局');
  for (const m of ['memory', 'lights', 'click']) {
    assert.ok(/perks\.offTwists/.test(read('minigames/' + m + '.js')), m + ' 玩法没读开关');
  }

  // 关掉的要跟着存档走，重开还在；新档默认全开。
  const s = engine.createNewState();
  assert.deepStrictEqual(engine.twistsOff(s, 'jian'), [], '新档默认应是全开');
  engine.setTwist(s, 'jian', '逆诵', false);
  assert.deepStrictEqual(engine.twistsOff(s, 'jian'), ['逆诵'], '关掉的规则没记下来');
  assert.deepStrictEqual(engine.normalizeState(JSON.parse(JSON.stringify(s))).twists.jian, ['逆诵'],
    '关掉的规则没跟着存档往返');
  engine.setTwist(s, 'jian', '逆诵', true);
  assert.deepStrictEqual(engine.twistsOff(s, 'jian'), [], '开回来之后还挂着关闭记录');
});

check('局内代价句用阿拉伯数字，与 HUD 的「余 12.3 息」同一套写法', function () {
  const practice = require('../data/practice.js');
  const bad = [];
  for (const m of practice.PRACTICE_METHODS) {
    // 局内是实时读的，「罚一息半」要在脑子里换算，「罚 1.5 息」不用。
    if (/[一二两三四五六七八九十][息盏秒]/.test(m.tip)) bad.push(m.id + ': ' + m.tip);
  }
  assert.deepStrictEqual(bad, [], '代价句里还有中文数词：' + bad.join(' / '));
  assert.ok(/折 1 盏心神/.test(read('minigames/memory.js')), '记序复现的浮字又写成「一盏」');
  assert.ok(/罚 ' \+ DEAD_PENALTY \+ ' 步/.test(read('minigames/lights.js')), '阵灯推演的浮字又写成「三步」');
});

check('斜向擦角：插值只认中心内圈，抬手仍用整格命中补定', function () {
  const swipeInput = require('../utils/swipe.js');
  const rects = [];
  const w = 100;
  const h = 140;
  for (let i = 0; i < 9; i += 1) {
    const c = i % 3;
    const r = Math.floor(i / 3);
    rects.push({ left: c * w, top: r * h, right: (c + 1) * w, bottom: (r + 1) * h });
  }
  const center = function (i) {
    return { x: (rects[i].left + rects[i].right) / 2, y: (rects[i].top + rects[i].bottom) / 2 };
  };
  // 0 → 4 是斜向一步：直线精确擦过 1 与 3 的公共顶点，两格都不该被当成走桩。
  const diag = swipeInput.sampleLine(rects, center(0), center(4), 10);
  assert.ok(diag.indexOf(1) < 0 && diag.indexOf(3) < 0, '斜划把擦角格补进了轨迹');
  assert.ok(diag.indexOf(4) >= 0, '斜划连收势桩都没采到');
  // 横向 0 → 2 仍要补出中间的 1，内圈不能把正常插值也挡掉。
  const row = swipeInput.sampleLine(rects, center(0), center(2), 10);
  assert.ok(row.indexOf(1) >= 0 && row.indexOf(2) >= 0, '横划漏了中间桩');
  // 起手 / 抬手是静止点：按在桩边上也要认得出来。
  assert.strictEqual(swipeInput.boxIndexOf(rects, 2, 2), 0, '整格命中丢了起手的边角');
  assert.strictEqual(swipeInput.coreIndexOf(rects, 2, 2), -1, '内圈命中不该把桩边角算作走桩');
  assert.ok(swipeInput.CORE_RATIO < 0.5, '内圈半径必须小于半格，否则挡不住擦角');
});

check('斜向擦角：页面接了输入工具，玩法层摘掉擦角桩再判，说明里讲清', function () {
  const js = read('pages/practice/practice.js');
  const click = read('minigames/click.js');
  const g = read('data/guides.js');
  assert.ok(/require\('\.\.\/\.\.\/utils\/swipe\.js'\)/.test(js), '页面没接划刀输入工具');
  assert.ok(/swipeInput\.sampleLine/.test(js), '插值补格没走中心内圈命中');
  assert.ok(/pushCell\(swipeInput\.boxIndexOf/.test(js), '抬手没用整格命中补定收势桩');
  assert.ok(/if \(!quiet\) this\.lastStepAt/.test(js), '抬手补定会把收势停留时间清零');
  assert.ok(/function cornerOf/.test(click) && /function trimCorners/.test(click), '玩法层没处理斜步擦角');
  assert.ok(/trimCorners\(compress\(path\), form, cols, guarded\)/.test(click), '擦角桩没在判定前摘掉');
  assert.ok(/guarded\.indexOf/.test(click), '禁桩 / 虚影不能被当擦角抹掉');
  assert.ok(/斜斩的角/.test(g) && /斜斩擦角不算/.test(g), '玩法说明没讲清斜斩擦角');
});

check('刀法局内：得分不叫灵石，新法生效范围只说一次，两条阶段规则同屏', function () {
  const wxml = read('pages/practice/practice.wxml');
  const click = read('minigames/click.js');
  const guides = read('data/guides.js');
  const practice = read('data/practice.js');

  // 灵石是能换功法的资源，局内分数一枚灵石都不是：同一局里「灵石 608」会和结算「灵石 +3」当场打架。
  assert.ok(/scene-hud__score-label">得分</.test(wxml), '场次 HUD 又把局内得分写成了灵石');

  // 新法生效范围：标题右侧一句说透，条目里不许逐条重复。
  assert.ok(/习得后每局生效/.test(wxml), '本门新法没讲清是永久被动还是每局重来');
  assert.ok(!/只在本局生效/.test(practice), '新法条目又逐条重复「只在本局生效」');

  // 局内速记只写常驻规则：未入门的玩家不该在常驻行里读到「大成后……」。
  const clickGuide = guides.slice(guides.indexOf('  click: {'));
  const inline = (clickGuide.match(/inline: '([^']+)'/) || ['', ''])[1];
  assert.ok(inline && !/大成|圆满/.test(inline), '局内速记又写死了阶段新法的触发条件');
  assert.ok(/单点不判/.test(inline), '局内速记没讲「轻点一下不判也不罚」');

  // 大圆满同时开着双锋与收势：只报一条，另一条就悄悄消失。
  assert.ok(/bits\.push\('真招会呼吸'\)/.test(click) && /bits\.push\('停一拍再抬'\)/.test(click),
    '两条阶段规则不能同时显示');
  assert.ok(/bits\.join\(' · '\)/.test(click), '阶段规则没有拼成一句');

  // 禁桩「划到就断势」，看不出来就是手感事故：玉牌底上必须用朱砂字 + 淡朱底单独标出来。
  const scene = read('styles/scene.wxss');
  assert.ok(/\.pg--scene \.cell--ban \{[^}]*?background: #f2dad4[^}]*?color: #a83b32/.test(scene),
    '舞台上的禁桩又看不清了');
});

check('「圆满」是段位名：任何玩法都不许拿它讲评级', function () {
  const dir = path.join(ROOT, 'minigames');
  for (const name of fs.readdirSync(dir)) {
    if (!/\.js$/.test(name)) continue;
    const s = read('minigames/' + name);
    // 只查「已入圆满」这类拿段位名当评级说的句子；注释里说明段位体系不算。
    const code = s.split('\n').filter(function (line) { return !/^\s*\/\//.test(line); }).join('\n');
    assert.ok(!/已入圆满/.test(code), 'minigames/' + name + ' 又用段位名讲「已拿到 S」');
  }
  assert.ok(/已入 S/.test(read('minigames/common.js')), '目标句没统一走「已入 S」');
});

check('「息」有解释：HUD、香炷与罚时都按它走，名词速查里查得到', function () {
  const copy = read('data/copy.js');
  assert.ok(/key: 'xi', name: '息'/.test(copy), '术语表没有「息」，玩家不知道一息是多久');
  assert.ok(/一息即一秒/.test(copy), '「息」没说清等于几秒');
  assert.ok(/息/.test(read('data/guides.js')) && /一息即一秒/.test(read('data/guides.js')),
    '玩法说明的盘上所见里也该有「息」');
});

check('九套经典玩法落地：注册、黄阶定位、盘面与方向键都接进页面', function () {
  const skills = read('data/skills.js');
  const practice = read('data/practice.js');
  const index = read('minigames/index.js');
  const wxml = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  const guides = read('data/guides.js');
  const classics = [
    ['lingqi', 'link', '灵纹连线'], ['leiyue', 'blocks', '落石垒基'], ['sanxiu', 'match', '三秀同收'],
    ['shudu', 'sudoku', '九宫填数'], ['heyuan', 'merge', '滑格相合'], ['shumu', 'schulte', '顺序点格'],
    ['rongdao', 'klotski', '滑块让路'], ['tuisuo', 'pushbox', '推石入位'], ['zeda', 'biggest', '数中取大'],
  ];
  for (const [skillId, game, label] of classics) {
    const re = new RegExp("id: '" + skillId + "'[^\\n]*tier: 'huang'");
    assert.ok(re.test(skills), skillId + ' 没挂黄阶');
    assert.ok(new RegExp(game + ": require\\('\\./" + game + "\\.js'\\)").test(index), game + ' 没进注册表');
    assert.ok(new RegExp(game + ": '" + label + "'").test(practice), game + ' 的玩法名没登记');
    assert.ok(new RegExp('\\b' + game + ': \\{').test(guides), game + ' 没有「怎么玩」说明');
  }
  assert.ok(/onPad/.test(js) && /data-dir/.test(wxml) && /controller\.move\(dir\)/.test(js), '落石玩法没有方向键');
  assert.ok(/showPad/.test(wxml) && /grid--compact/.test(wxml), '盘面没接矮格与按键台');
});

check('连 S 叠倍率：准备页有十格点数、结算页有回执、指南有专节', function () {
  const js = read('pages/practice/practice.js');
  const wxml = read('pages/practice/practice.wxml');
  const css = read('pages/practice/practice.wxss');
  const guide = read('pages/guide/guide.js');
  const engine = read('utils/game.js');
  const world = require('../data/world.js');
  assert.ok(/COMBO_MAX/.test(engine) && /comboNextGain/.test(engine), '内核没有连 S 层数');
  assert.ok(/comboDots/.test(js) && /comboText/.test(js), '准备页没算连 S 层数');
  // 十格小圆点看层数，句子只写「下一局 S 值多少点」，整条曲线留给说明页。
  assert.ok(/class="row combo-line/.test(wxml) && /combo-dot--on/.test(wxml), '准备页没画十格连 S 圆点');
  assert.ok(/\.combo-dot--on\s*\{[^}]*var\(--c-imm-gold\)/.test(css), '连 S 圆点没有落在墨金体系里');
  assert.ok(!/@media\s*\(\s*prefers-color-scheme/.test(css), '参悟页又按系统明暗翻转了，盘面会突然换色');
  assert.ok(/r\.gain > 0/.test(js), '结算卡没用本局实得点数');
  assert.ok(/r\.comboActive/.test(js) && /r\.comboNextGain/.test(js), '结算页没写连 S 回执');
  assert.ok(/title: '七 · 连 S 叠倍率'/.test(guide) && /1307/.test(guide), '指南没有连 S 专节');
  assert.ok(/title: '二 · 离线吐纳之规'/.test(guide), '新增专节后章节编号没顺延');
  assert.ok(!/三连 S 直接晋级|promotionGain|sStreakGoal|r\.totalGain/.test(js),
    '三连晋级的旧口径还留在参悟页');
  assert.strictEqual(world.COMBO_MAX, 10);
  assert.strictEqual(world.PROF_S_RUNS, 84);
});

check('页面骨架统一：三 tab + 子页用仙箓皮肤，导航只留原生一层', function () {
  const main = ['index', 'skills', 'profile', 'battle', 'board', 'titles', 'guide', 'help', 'log'];
  for (const name of main) {
    const wxml = read('pages/' + name + '/' + name + '.wxml');
    assert.ok(/^<view class="pg pg--imm/m.test(wxml), name + ' 根节点不是 .pg--imm');
    // 返回箭头与标题都由小程序原生导航栏承担。
    // 页面里再画一遍就是两层导航：用户看到两个返回，点哪个、回到哪一层都说不清。
    assert.ok(!/imm-head/.test(wxml), name + ' 又在顶部留了一条只放「说明」的空行');
    // 说明页自己就是解释，不需要再嵌一个说明入口。
    if (name !== 'help') {
      assert.ok(/class="pg__foot"[\s\S]*此处说明/.test(wxml), name + ' 页尾缺「说明」入口');
      assert.ok(/bindtap="onGoHelp"/.test(wxml), name + ' 缺「说明」入口');
    }
    assert.ok(!/class="pg__head"|class="muted mt8"/.test(wxml),
      name + ' 又把「大标题 + 说明句」印回首屏');
  }
  // 每个页面只有一个说明入口，不再有重复的页脚口号。
  for (const name of main) {
    const wxml = read('pages/' + name + '/' + name + '.wxml');
    assert.strictEqual((wxml.match(/bindtap="onGoHelp"/g) || []).length, name === 'help' ? 0 : 1,
      name + ' 的说明入口不唯一');
    assert.ok(!/copy\.footHint/.test(wxml), name + ' 还留着重复页脚口号');
  }
  assert.ok(/\{\{copy\.footGuide\}\}/.test(read('pages/guide/guide.wxml')), '指南页页脚品牌行丢了');
  assert.ok(/class="pg--imm login-page"/.test(read('pages/login/login.wxml')), '登录页根节点没接上墨金映射');
  // 参悟页也进仙箓皮肤：根容器同时是 .pg（页面骨架）与 .pg--imm（墨金映射）。
  assert.ok(/^<view class="pg pg--imm/.test(read('pages/practice/practice.wxml')), '参悟页根节点不是 .pg--imm');
});

check('加载 / 空 / 错误状态统一用 .state 占位，不再白屏', function () {
  const index = read('pages/index/index.wxml');
  assert.ok(/class="state"/.test(index) && /\{\{copy\.errorTitle\}\}/.test(index), '洞府页状态占位不完整');
  for (const name of ['skills', 'battle', 'profile', 'board']) {
    assert.ok(/class="state[ "]/.test(read('pages/' + name + '/' + name + '.wxml')),
      name + ' 数据未就绪时没有状态占位');
  }
  // 参悟页不设空态：没习得这门功法就直接说一句并退回，不把人留在一张空页上。
  assert.ok(/toast\('尚未习得这门功法'\)/.test(read('pages/practice/practice.js')),
    '参悟页没有「尚未习得」的兜底');
  // 榜单的内联错误态跟着榜单走，现在它在战力仙榜页。
  assert.ok(/class="state state--inline"/.test(read('pages/board/board.wxml')), '榜单错误没有用内嵌状态');
  const css = read('app.wxss');
  for (const cls of ['.state {', '.state--inline', '.state__glyph', '.state__title', '.state__desc']) {
    assert.ok(css.indexOf(cls) >= 0, '全局基础层缺少 ' + cls);
  }
});

check('可点 view 统一按压反馈，反馈样式落在全局基础层', function () {
  const css = read('app.wxss');
  assert.ok(/\.pressable \{/.test(css) && /\.pressable--on \{/.test(css), '按压反馈样式没定义');
  let total = 0;
  const perPage = {};
  for (const rel of WXML) {
    const text = read(rel);
    // 按「出现次数」数，不按标签切：practice.wxml 里有 `wx:if="{{a > b}}"` 这种含 `>` 的标签，
    // 用 `<view[^>]*>` 去切会漏掉一大半（曾经就这么少算了 11 处）。
    const hover = (text.match(/hover-class="pressable--on"/g) || []).length;
    const cls = (text.match(/class="[^"]*\bpressable\b[^"]*"/g) || []).length;
    assert.ok(cls >= hover, rel + ' 的按压元素没挂常态类：' + cls + ' 处 class / ' + hover + ' 处 hover-class');
    total += hover;
    perPage[rel] = hover;
  }
  // 门槛按页面算，不是全项目一个数：原来是「总数 ≥ 5」，删掉四五十处也不会红——
  // 它守的是「样式类存在」，不是「覆盖完整」（见 04-open-issues C1）。
  // 每个页面至少一处；四个主交互页按现状留两成余量（现 6 / 18 / 9 / 4）。
  const floor = {
    'pages/index/index.wxml': 4,
    'pages/practice/practice.wxml': 12,
    'pages/profile/profile.wxml': 6,
    'pages/skills/skills.wxml': 3,
  };
  Object.keys(floor).forEach(function (page) {
    assert.ok((perPage[page] || 0) >= floor[page],
      '主页面的按压反馈掉了：' + page + ' 只有 ' + (perPage[page] || 0) + ' 处，下限 ' + floor[page]);
  });
  Object.keys(perPage).forEach(function (page) {
    // 纯展示组件（duel-result）本来就没有可点元素，不按页面算。
    if (page.indexOf('components/') === 0) return;
    assert.ok(perPage[page] >= 1, page + ' 整页没有一处按压反馈');
  });
  assert.ok(total >= WXML.length * 3, '按压反馈总数不足：' + total + ' 处 / ' + WXML.length + ' 页');
});

check('全局基础层与常规页样式不写裸色值，尺寸走令牌', function () {
  const files = [
    'app.wxss', 'styles/immortal.wxss',
    'pages/index/index.wxss',
    'pages/skills/skills.wxss', 'pages/battle/battle.wxss',
    'pages/profile/profile.wxss', 'pages/guide/guide.wxss',
    'pages/help/help.wxss', 'pages/log/log.wxss', 'pages/login/login.wxss',
  ];
  const raw = /#[0-9a-fA-F]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;
  for (const f of files) {
    const hits = read(f).match(raw) || [];
    assert.strictEqual(hits.length, 0, f + ' 出现裸色值：' + hits.join(', '));
  }
  const css = read('app.wxss');
  assert.ok(/padding: var\(--page-top\) var\(--page-x\)/.test(css), '页面留白没走令牌');
  assert.ok(/var\(--z-sticky\)/.test(css) && /var\(--z-mask\)/.test(css), '层级没走令牌');
  assert.ok(/var\(--r-lg\)/.test(css) && /var\(--sh-card\)/.test(css), '圆角或阴影没走令牌');
  assert.ok(/var\(--fs-body\)/.test(css) && /var\(--fs-caption\)/.test(css), '字号没走令牌');
});

check('导航栏标题简洁统一，tab 页不重复 tabBar，配色交给主题变量', function () {
  const titles = require('../data/navigation.js').PAGE_TITLES;
  const appCfg = require('../app.json');
  const tabs = appCfg.tabBar.list.map(function (t) { return t.pagePath; });
  // 说明页的标题在 onLoad 里按主题动态设置（人物 · 说明），json 里留空。
  const dynamic = ['pages/help/help'];
  for (const p of pageFiles('.json')) {
    const cfg = JSON.parse(read(p.rel));
    const page = p.rel.replace(/\.json$/, '');
    if (dynamic.indexOf(page) >= 0 || tabs.indexOf(page) >= 0) {
      assert.ok(!cfg.navigationBarTitleText,
        p.rel + ' 的标题已交给别处（tabBar / 动态设置），json 里不该再写：' + cfg.navigationBarTitleText);
    } else {
      assert.ok(titles.indexOf(cfg.navigationBarTitleText) >= 0, p.rel + ' 标题不在统一命名表：' + cfg.navigationBarTitleText);
    }
    assert.ok(!cfg.navigationBarBackgroundColor && !cfg.navigationBarTextStyle,
      p.rel + ' 写死了导航栏配色，暗色下会穿帮');
  }
  // 说明页把「看的是哪一页」写进导航栏，页内就不再画第二个标题。
  const helpJs = read('pages/help/help.js');
  assert.ok(/setNavigationBarTitle/.test(helpJs), '说明页没有把主题写进导航栏');
  assert.ok(!/help-topic/.test(read('pages/help/help.wxml')), '说明页又画了页内标题');
});

check('设计令牌覆盖色彩 / 字号 / 间距 / 圆角 / 层级 / 触控 / 动效 / 安全区', function () {
  const t = read('styles/tokens.wxss');
  for (const key of ['--c-bg', '--fs-body', '--sp-4', '--r-lg', '--sh-card', '--z-sticky',
    '--touch:', '--dur-fast', '--safe-bottom', '--lh-body', '--page-x', '--card-gap']) {
    assert.ok(t.indexOf(key) >= 0, '令牌表缺少 ' + key);
  }
  assert.ok(/@media \(prefers-color-scheme: dark\)/.test(t), '没有暗色令牌段');
  assert.ok(/@import\s+"\.\/styles\/tokens\.wxss"/.test(read('app.wxss')), 'app.wxss 没引入令牌表');
});

check('文案真源：跨页复用文案只在 data/copy.js 写一次', function () {
  const copy = require('../data/copy.js');
  const all = WXML.map(read).join('\n');
  const shared = [
    copy.UI.footHint, copy.UI.loading, copy.UI.errorTitle, copy.UI.errorDesc,
    copy.UI.emptyLog, copy.UI.emptyBoard, copy.UI.emptySkills,
    copy.UI.sections.today, copy.UI.sections.more,
    copy.UI.sections.settings, copy.UI.sections.battleCode,
  ];
  for (const text of shared) {
    assert.ok(all.indexOf('>' + text + '<') < 0, '页面又硬编码了共享文案：' + text);
  }
  for (const name of ['index', 'skills', 'battle', 'profile', 'guide', 'practice', 'help', 'log']) {
    const js = read('pages/' + name + '/' + name + '.js');
    assert.ok(/require\('\.\.\/\.\.\/data\/copy\.js'\)/.test(js), name + ' 没有引用文案真源');
    assert.ok(/copy: copy\.UI/.test(js), name + ' 没有把文案挂进 data');
  }
  // 「参悟」是入口，「开始参悟」才是打一局，两级不许混成一个词：
  //   practice = 从功法列表点进参悟页（不开局，看关卡与这一门）
  //   start    = 在参悟页里真的打一局（换熟练度）
  assert.ok(copy.UI.actions.start === '开始参悟', '打一局的按钮不叫「开始参悟」');
  assert.ok(copy.UI.actions.practice === '参悟', '进详情的按钮不叫「参悟」');
  assert.notStrictEqual(copy.UI.actions.start, copy.UI.actions.practice,
    '两个动作又叫成一个名字了');
  for (const bad of ['正在推演气机', '正在翻检藏经阁', '正在整理论道台', '正在展开道牒',
    '就差一点', '参 悟 · 等是保底，练才是加速']) {
    assert.ok(all.indexOf(bad) < 0, '旧文案口径又回来了：' + bad);
  }
});

check('术语解释：组件、词典与指南速查读同一份数据', function () {
  const copy = require('../data/copy.js');
  const keys = new Set();
  for (const t of copy.TERMS) {
    assert.ok(t.key && t.name && t.desc && t.group, '术语字段不全：' + JSON.stringify(t));
    assert.ok(!keys.has(t.key), '术语 key 重复：' + t.key);
    assert.ok(t.desc.length >= 10, t.name + ' 的解释太短');
    keys.add(t.key);
  }
  assert.ok(copy.TERMS.length >= 15, '术语词典覆盖不足');
  assert.strictEqual(copy.termOf('fene').name, '份例', 'termOf 查不到术语');
  assert.strictEqual(copy.termOf('not-exist'), null, 'termOf 对未知 key 应返回 null');
  let used = 0;
  for (const rel of WXML) {
    for (const m of read(rel).matchAll(/<term[^>]*term-key="([^"]+)"/g)) {
      // 动态绑定（{{item.demo}}）读页面里的字面量常量，见下面单独一条断言。
      if (m[1].indexOf('{{') === 0) continue;
      assert.ok(keys.has(m[1]), rel + ' 引用了不存在的术语：' + m[1]);
      used += 1;
    }
  }
  const demoTerm = /DEMO_TERM = '([^']+)'/.exec(read('pages/guide/guide.js'));
  assert.ok(demoTerm && keys.has(demoTerm[1]),
    '指南名词速查的示范术语不存在：' + (demoTerm ? demoTerm[1] : '未声明 DEMO_TERM'));
  // 改版后术语角标不再常驻首屏：解释统一进说明页的「名词速查」，
  // 只在局内准备页、人物设置等少数地方保留就地角标。
  assert.ok(used >= 4, '局内 / 设置的就地术语角标被删光了：' + used + ' 处');
  assert.ok(/copy\.TERMS/.test(read('pages/help/help.js')) && /help-term/.test(read('pages/help/help.wxml')),
    '说明页没有由词典生成的名词速查');
  for (const rel of WXML) {
    if (!/<term[^>]*term-key=/.test(read(rel))) continue;
    const cfgPath = rel.replace(/\.wxml$/, '.json');
    const cfg = JSON.parse(read(cfgPath));
    assert.ok(cfg.usingComponents && cfg.usingComponents.term === '../../components/term/term',
      cfgPath + ' 用了术语组件却没注册');
  }
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'components/term/term' + ext)), '术语组件缺 ' + ext);
  }
  const guide = read('pages/guide/guide.js');
  assert.ok(/glossarySection\('十二'\)/.test(guide) && /copy\.TERMS/.test(guide),
    '指南名词速查不是由术语词典生成的');
});

check('信息架构：主页只做导航，说明独立成页，低频内容默认折叠', function () {
  const nav = require('../data/navigation.js');
  const appJson = require('../app.json');
  assert.strictEqual(appJson.tabBar.list.length, 3, 'tabBar 不是三页结构');
  assert.deepStrictEqual(appJson.tabBar.list.map(function (x) { return x.text; }),
    ['主页', '功法', '人物'], '三个 tab 的名称或顺序不对');
  // 参悟不是 tab：它要带 ?skillId 才能对着某一门，而 tab 页不能带 query。
  // 留成 tab 的话，「点哪门功法练哪门」就做不到——只会进「上一次练的那门」。
  assert.ok(appJson.tabBar.list.every(function (t) { return t.pagePath !== 'pages/practice/practice'; }),
    '参悟页又回到 tabBar 了：那样点功法卡片只能进「上一次练的那门」');
  assert.strictEqual(nav.TILES.length, 6, '主页宫格不是 6 个入口');
  const index = read('pages/index/index.wxml');
  assert.ok(/class="imm-grid"/.test(index) && /bindtap="onTile"/.test(index), '主页没有宫格导航');
  assert.strictEqual((index.match(/bindtap="onQuickPractice"/g) || []).length, 1,
    '主页主行动入口重复：吸底按钮之外不该再放一个');
  assert.ok(index.indexOf('近况') < 0 && index.indexOf('就差一点') < 0, '主页仍有含糊区块标题');
  assert.ok(!/class="card card--ink rec-card"/.test(index), '主页还留着整张「今日之课」长卡');
  const skills = read('pages/skills/skills.wxml');
  assert.ok(/bindtap="onTab"/.test(skills) && /\{\{tab ===/.test(skills), '功法页没有两个分区');
  // 一个容器两个分区，不再有第二个「功法列表页」：藏经阁并进来了。
  assert.ok(/copy\.skillsTabs\.learned/.test(skills) && /copy\.skillsTabs\.shop/.test(skills),
    '功法页的两个分区不是「已持玉简 / 藏经阁」');
  assert.ok(appJson.pages.indexOf('pages/shop/shop') < 0, '藏经阁又变成独立页面了');
  assert.ok(nav.TILES.every(function (t) { return t.url !== '/pages/shop/shop'; }),
    '主页宫格里还有藏经阁那一格');
  const battle = read('pages/battle/battle.wxml');
  assert.ok(/onToggleCode/.test(battle) && /\{\{codeOpen\}\}/.test(battle), '战力码没折叠');
  const profile = read('pages/profile/profile.wxml');
  assert.ok(/onToggleSfx/.test(profile) && /onToggleSettings/.test(profile), '设置没独立成折叠区');
  assert.ok(/imm-attrs/.test(profile) && /breakList/.test(profile), '人物页缺属性格或突破清单');
  const help = read('pages/help/help.wxml');
  assert.ok(/bindtap="onToggle"/.test(help) && /bindtap="onToggleTerms"/.test(help), '说明页分节不能展开');
  assert.ok(/open: false/.test(read('pages/help/help.js')), '说明页没有默认折叠');
  const guide = read('pages/guide/guide.wxml');
  assert.ok(/guide-toc/.test(guide) && /onJump/.test(guide) && /onToggleAll/.test(guide), '指南缺目录或全部展开');
  // 展开态只有 sections[i].open 一套：再并存一个 showAll，全局展开时点单节标题会「点了没反应」。
  assert.ok(/wx:if="\{\{item\.open\}\}"/.test(guide), '指南章节不能折叠');
  assert.ok(!/showAll/.test(guide), '指南又并存了 showAll 与 item.open 两套展开状态');
  assert.ok(/copy\.actions\.collapseAll/.test(guide) && /copy\.actions\.expandAll/.test(guide),
    '「全部展开」没有配套的「全部收起」');
  assert.ok(/onGoAction/.test(guide), '指南章节里没有「前去 XX」的下一步按钮');
  assert.ok(/guide-demo/.test(guide) && /<term term-key="\{\{item\.demo\}\}" \/>/.test(guide),
    '名词速查没有真的「?」示范');
  assert.ok(/id="\{\{item\.id\}\}"/.test(guide) && /pageScrollTo/.test(read('pages/guide/guide.js')),
    '目录点了只展开不滚动，不算直达');
  // 进度只有「X / Y」一种写法：斜杠两侧留空格，不写成 a/b，也不在 WXML 里拼中文单位。
  let progress = 0;
  for (const rel of WXML) {
    const s = read(rel);
    const pairs = s.match(/\}\}[ \t]*\/[ \t]*\{\{/g) || [];
    const bad = pairs.filter(function (x) { return x !== '}} / {{'; });
    assert.deepStrictEqual(bad, [], rel + ' 的进度写成了无空格的 a/b');
    progress += pairs.length;
  }
  assert.ok(progress >= 5, '进度写法疑似被改散：只找到 ' + progress + ' 处「X / Y」');
  assert.ok(/copy\.formatCost/.test(read('pages/skills/skills.js'))
    && /copy\.formatGain/.test(read('pages/index/index.js')), '文案真源的格式化函数没接进页面');
});

check('指南目录按新手阅读流排：先挂机保底与资源，主动玩法在后', function () {
  const src = read('pages/guide/guide.js');
  const names = [];
  for (const m of src.matchAll(/title: '[一二三四五六七八九十]+ · ([^']+)'/g)) names.push(m[1]);
  assert.deepStrictEqual(names, [
    '怎么变强', '离线吐纳之规', '灵力与灵石', '战力从哪来', '熟练度与境界',
    '参悟与盘面', '连 S 叠倍率', '切磋与战力码', '称号与道牒',
    '存档与换设备', '成就与榜单',
  ], '指南目录顺序又变了：新手要先搞懂挂机保底与资源，再学主动玩法');
  assert.ok(/SECTIONS\.push\(glossarySection\('十二'\)\)/.test(src), '名词速查不在最后一节');
  const no = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];
  let i = 0;
  for (const m of src.matchAll(/title: '([一二三四五六七八九十]+) · /g)) {
    assert.strictEqual(m[1], no[i], '第 ' + (i + 1) + ' 节编号不是「' + no[i] + '」');
    i += 1;
  }
});

check('功法命名统一：类别·四到六字正名，前缀严格等于类别', function () {
  const skills = require('../data/skills.js');
  const practice = require('../data/practice.js');
  assert.deepStrictEqual(skills.validateNames(), [], '命名规范校验没通过');
  assert.ok(skills.NAME_RULE && skills.NAME_RULE.sep === '·', '缺少命名规则真源');
  assert.ok(skills.NAME_RULE.titleMin >= 4, '正名下限低于四字：三字说不清盘上做什么');
  assert.ok(skills.NAME_RULE.titleMax <= 6, '正名上限高于六字：卡片一行放不下');
  for (const s of skills.SKILLS) {
    const parts = s.name.split(skills.NAME_RULE.sep);
    assert.strictEqual(parts.length, 2, s.id + ' 名字不是两段式');
    assert.strictEqual(parts[0], s.type, s.id + ' 前缀与类别不一致');
    assert.ok(parts[1].length >= skills.NAME_RULE.titleMin && parts[1].length <= skills.NAME_RULE.titleMax,
      s.id + ' 正名「' + parts[1] + '」不在 ' + skills.NAME_RULE.titleMin + '–' + skills.NAME_RULE.titleMax + ' 字之间');
    assert.ok(skills.NAME_RULE.suffixes.indexOf(parts[1].slice(-1)) >= 0, s.id + ' 正名末字不是体裁字');
    assert.ok(!/入门|基础|初级|小|大/.test(parts[1]), s.id + ' 正名带了等级词');
    assert.ok(practice.FAMILIES[s.type], s.id + ' 类别不在游戏族表内');
    // 三字名一律退役：它们正是「看不懂这一门干什么」的来源。
    assert.notStrictEqual(parts[1].length, 3, s.id + ' 又出现了三字正名');
  }
  // 十五门里不许再出现「有的没前缀」或「前缀和类别对不上」。
  assert.strictEqual(skills.SKILLS.length, 15, '功法数变了，命名断言要同步');
  const names = skills.SKILLS.map(function (s) { return s.name; });
  assert.strictEqual(new Set(names).size, names.length, '功法名重复');
  assert.ok(names.indexOf('刀法·开锋斩桩诀') >= 0, '刀法·开锋斩桩诀没按规范统一');
  // 旧三字名不许回表。
  const legacy = ['阵法·燃灯诀', '灵植·三秀诀', '合术·叠元诀', '辨术·摘魁诀', '御灵·并蒂引'];
  for (const old of legacy) {
    assert.ok(names.indexOf(old) < 0, '旧三字名又回到功法表：' + old);
  }
});

check('功法图鉴：未习得也能查全玩法、收益与习得路径', function () {
  const game = require('../utils/game.js');
  const skills = require('../data/skills.js');
  const js = read('pages/skills/skills.js');
  const wxml = read('pages/skills/skills.wxml');
  const wxss = read('pages/skills/skills.wxss');
  assert.ok(/getSkillDetail\(/.test(js), '功法页没有从引擎取图鉴详情');
  assert.ok(/onPrimary: function/.test(js) && /onToggleGuide: function/.test(js), '图鉴缺主按钮或玩法展开');
  assert.ok(/detail\.guide\.steps/.test(wxml) && /detail\.guide\.terms/.test(wxml), '弹窗没展示玩法步骤与盘面符号');
  assert.ok(/detail\.gainLines/.test(wxml) && /detail\.stageRules/.test(wxml), '弹窗没写练成收益与本门新法');
  assert.ok(/detail\.unlock\.(label|text|hint|percent)/.test(wxml), '弹窗没写习得路径与进度');
  assert.ok(/bindtap="openDetail"/.test(wxml) && /onCardAction/.test(wxml) && /item\.actionText/.test(wxml),
    '卡片没有明确的可点详情 / 动作入口');
  assert.ok(!/skill-card--dim|opacity/.test(wxml + wxss), '未习得卡片又被压灰成不可点的样子');
  assert.ok(/\.codex__block/.test(wxss) && /\.codex__note/.test(wxss), '图鉴分区样式没落地');
  // 引擎层：锁定的掉落功法也必须返回完整说明与可执行的下一步。
  // 2026-11 起唯一一门「切磋掉落」是太虚翻卦诀（天阶已无功法，但这条路径必须还在）。
  const s = game.createNewState();
  const d = game.getSkillDetail(s, 'taixu');
  assert.ok(!d.unlocked, '掉落功法初始不该是已习得');
  assert.ok(d.guide && d.guide.steps.length >= 2 && d.guide.terms.length >= 2, '锁定功法看不到玩法说明');
  assert.ok(d.gainLines.length >= 3 && d.stageRules !== undefined, '锁定功法看不到练成收益');
  assert.ok(d.unlock.kind === 'battle' && d.unlock.action === 'battle', '掉落功法没给去切磋的路径');
  assert.ok(d.statusText && d.effectNote, '缺状态或特效生效说明');
  for (const sk of skills.SKILLS) {
    const item = game.getSkillDetail(s, sk.id);
    assert.ok(item.previewInline && item.unlock.label, sk.id + ' 卡片缺玩法速记或习得标签');
  }
});

check('图鉴文案走文案真源，解释统一收进「说明」页', function () {
  const copy = require('../data/copy.js');
  const help = require('../data/help.js');
  const wxml = read('pages/skills/skills.wxml');
  const helpJs = read('pages/help/help.js');
  assert.ok(copy.termOf('codex'), '术语词典缺「功法图鉴」');
  assert.ok(/copy\.TERMS/.test(helpJs), '说明页名词速查不是由术语词典生成的');
  assert.ok(/topics|topicOf\(/.test(helpJs), '说明页没按主题取真源');
  // 弹窗只保留三个必要小标题；盘面符号与本门新法不另起标题，直接跟在区块里。
  for (const k of ['codexPlay', 'codexGain', 'codexUnlock']) {
    assert.ok(copy.UI.sections[k], '区块文案缺 ' + k);
    assert.ok(wxml.indexOf('copy.sections.' + k) >= 0 || wxml.indexOf('sections.' + k) >= 0, '弹窗没引用 ' + k);
  }
  // 「锁的是开练不是查阅」这句话从列表移到说明真源，列表只留数值与按钮。
  const codex = help.topicOf('skills').sections.filter(function (s) { return s.key === 'codex'; })[0];
  assert.ok(codex && /未习得也能查全本/.test(codex.lines.join('')), '说明真源没讲清图鉴的锁与不锁');
  assert.ok(!/copy\.hints\./.test(wxml), '功法页又把提示长句印回列表');
  assert.ok(copy.UI.states.learned && copy.UI.states.buyable, '状态文案没进真源');
  assert.ok(copy.UI.actions.viewDetail && copy.UI.actions.goBattle, '动作文案没进真源');
});

check('主页宫格各进各的子页，不再借道别的 tab', function () {
  const nav = require('../data/navigation.js');
  const app = JSON.parse(read('app.json'));
  const tabs = app.tabBar.list.map(function (t) { return t.pagePath; });
  assert.strictEqual(nav.TILES.length, 6, '主页宫格不再是六格');
  const urls = nav.TILES.map(function (t) { return t.url; });
  assert.strictEqual(new Set(urls).size, urls.length, '宫格有重复去处');
  for (const t of nav.TILES) {
    const rel = t.url.replace(/^\//, '');
    assert.ok(app.pages.indexOf(rel) >= 0, t.label + ' 指向不存在的页面');
    // 关键：不能一格「看着是子页、点进去跳到别的 tab」。
    assert.ok(tabs.indexOf(rel) < 0, t.label + ' 仍然跳去 tab 页 ' + rel);
  }
  // 子页都是独立四件套，且页面里不再自绘返回。
  for (const name of ['board', 'titles', 'secret']) {
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
      assert.ok(fs.existsSync(path.join(ROOT, 'pages/' + name + '/' + name + ext)), name + ' 缺 ' + ext);
    }
    assert.ok(!/imm-head__back/.test(read('pages/' + name + '/' + name + '.wxml')), name + ' 又画了页内返回');
    assert.ok(!/onBack/.test(read('pages/' + name + '/' + name + '.js')), name + ' 还留着没人调用的 onBack');
  }
  // 参悟只有一条路：主页吸底与功法页卡片都直达 pages/practice，
  // 中间那层「功法详情」页已经并进参悟页，全项目不许再出现它的路径。
  for (const name of ['index', 'skills', 'profile', 'practice', 'battle', 'secret']) {
    const src = read('pages/' + name + '/' + name + '.js');
    assert.ok(src.indexOf('/pages/cultivate/') < 0, name + ' 还指向已经删掉的功法详情页');
  }
  assert.ok(/\/pages\/practice\/practice\?skillId=/.test(read('pages/index/index.js')),
    '主页吸底没有直达参悟页');
  assert.ok(/\/pages\/practice\/practice\?skillId=/.test(read('pages/skills/skills.js')),
    '功法页点卡片没有直达参悟页');
  // 榜单只在一个页面里出现：仙门切磋页不再复述前十，否则两处都能打、两处都要刷新。
  assert.ok(!/refreshBoard|onFightRival/.test(read('pages/battle/battle.js')),
    '仙门切磋页又接回了榜单（榜单只在战力仙榜页）');
  assert.ok(/onGoBoard/.test(read('pages/battle/battle.js')), '仙门切磋页缺少去仙榜的指路');
});

check('三秀同收：局内 hint 必须留住代价句，不许被纯计数覆盖', function () {
  const m = read('minigames/match.js');
  const pd = require('../data/practice.js');
  const tip = pd.getMethod('harvest').tip;
  assert.ok(/少 \d+ 息/.test(tip), '准备页代价句没写清罚多少：' + tip);
  assert.ok(/const costText = ctx\.tip \|\|/.test(m), '局内没接住准备页的代价句');
  assert.ok(/vm\.hint = costText \+/.test(m), 'syncHud 又把 hint 冲成纯计数了');
  assert.ok(!/vm\.hint = '照畦/.test(m), 'hint 又变回提示按钮的说明');
  const page = read('pages/practice/practice.js');
  assert.ok(/tip = practiceData\.tipFor\(/.test(page), '准备页没把按档代价句传给玩法');
  assert.ok(!/tip: method\.tip/.test(page), '参悟页还有一处写死的功法表代价句没跟着档走');
  // 罚息按档变，代价句不能还是那句写死的「少 2 息」。
  assert.ok(/少 1 息/.test(pd.tipFor(pd.getMethod('harvest'), 'novice'))
    && /少 3 息/.test(pd.tipFor(pd.getMethod('harvest'), 'full')),
    '代价句没跟着本档罚息走');
});

check('「错换」已统一为「无效互换」：玩家可见文件不留旧词', function () {
  const files = [
    'minigames/match.js', 'data/guides.js', 'data/skills.js', 'data/practice.js',
    'data/help.js', 'pages/practice/practice.js', 'pages/practice/practice.wxml',
    'README.md',
  ];
  for (const f of files) {
    assert.ok(!/错换/.test(read(f)), f + ' 还留着旧词「错换」');
  }
  assert.ok(/无效互换/.test(read('data/guides.js')), '玩法说明没定义「无效互换」');
  assert.ok(/无效互换/.test(read('minigames/match.js')), '局内 HUD 没用新词');
});

check('三秀同收：S 线与提示按钮名各只有一份真源', function () {
  const pd = require('../data/practice.js');
  const method = pd.getMethod('harvest');
  assert.strictEqual(pd.sLineOf(method, 'novice'), 1900, '简单档 S 线变了');
  assert.strictEqual(pd.sLineOf(method, 'minor'), 1400, '困难档 S 线没按本档盘面标定');
  // 盘面越难，绝对分数线越低；这不是倒退，是同一把尺子量不同盘会骗人。
  const lines = ['novice', 'entry', 'minor', 'major', 'full'].map(function (k) { return pd.sLineOf(method, k); });
  assert.ok(lines.every(function (v, i) { return i === 0 || v <= lines[i - 1]; }), '评级线没按盘面难度逐档标定');
  assert.strictEqual(new Set(lines).size, 5, '五档评级线还有并列的');
  assert.strictEqual(pd.sLineOf(pd.getMethod('linkpair'), 'novice'), 0, '非三消玩法不该有 S 线');
  assert.strictEqual(pd.buildParams(method, 'minor').sLine, pd.sLineOf(method, 'minor'), '玩法层没拿到同源 S 线');
  // 门槛只能出现在 gradeLimits 一处：create 里只许调它，不许再自己写 620 / 150 这种数。
  assert.ok(/lim = gradeLimits\(p\)/.test(read('minigames/match.js')),
    'match.js 又把 S 线写死在玩法层');
  assert.ok(/p && p\.sLine/.test(read('minigames/match.js')),
    'match.js 的 gradeLimits 没从 params 取本档 S 线');
  assert.ok(/goalText/.test(read('pages/practice/practice.wxml')), '准备页没显示本档 S 线');
  assert.ok(/goalText: sLine/.test(read('pages/practice/practice.js')), '准备页没从同源数生成 S 线文案');
  const gd = require('../data/guides.js').guideOf('match');
  const rules = gd.scoring + gd.steps.join('');
  assert.ok(/只看分数/.test(rules), '评级口径没写清只看总分');
  assert.ok(!/控制无效互换次数|同时控制/.test(rules), '把无效互换错写成 S 档附加条件');
  assert.strictEqual(pd.hintLabelOf('match'), '照畦', '提示按钮名没和局内、名词速查统一');
  assert.ok(/hintLabel: practiceData\.hintLabelOf\(gameId\)/.test(read('pages/practice/practice.js')),
    '页面又把提示按钮名硬编码成三元');
});

check('局内代价句不再被覆盖：所有玩法的 vm.hint 都要带着它', function () {
  const methods = require('../data/practice.js').PRACTICE_METHODS;
  let covered = 0;
  for (const m of methods) {
    const src = read('minigames/' + m.game + '.js');
    const lines = src.split('\n').filter(function (l) { return /vm\.hint\s*=/.test(l); });
    for (const line of lines) {
      covered += 1;
      assert.ok(/vm\.costText|costText|deadCost/.test(line),
        'minigames/' + m.game + '.js 的 hint 又把代价句冲掉了：' + line.trim());
    }
  }
  assert.ok(covered >= 9, '覆盖点数量不对，断言可能没扫全：' + covered);
  assert.ok(/costText: hint/.test(read('minigames/common.js')), 'makeVm 没把代价句存成 vm.costText');
});

check('阵灯推演：代价句按阶段出现，盘面只画图形不写汉字', function () {
  const L = require('../minigames/lights.js');
  const pd = require('../data/practice.js');
  const method = pd.getMethod('arrayEye');
  function boot(perks) {
    let vm = null;
    const c = L.create({
      params: pd.buildParams(method, 'novice'), perks: perks, theme: { glyph: '●' },
      tip: method.tip, render: function (v) { vm = v; }, finish: function () { },
    });
    c.destroy();
    return vm;
  }
  const base = boot({ tier: 0 });
  // 感应的代价写在按钮旁边，而且是「花步数」不是「封顶」——它和走错落在同一把尺子上。
  assert.ok(/每看一眼算 2 步/.test(base.hint), '简单档没讲阵眼感应的代价：' + base.hint);
  assert.ok(/余量 \d+ 步/.test(base.hint), '简单档没讲步数余量：' + base.hint);
  assert.ok(!/死门/.test(base.hint), '未解锁死门就提前讲死门了：' + base.hint);
  const high = boot({ tier: 4 });
  assert.ok(/触死门罚 2 步/.test(high.hint), '大成档没讲死门代价：' + high.hint);
  assert.ok(/每看一眼算 2 步/.test(high.hint), '大成档把阵眼感应的代价丢了');

  const src = read('minigames/lights.js');
  assert.ok(/OFF_GLYPH = '○'/.test(src) && /DEAD_GLYPH = '✕'/.test(src), '盘面符号没换成图形');
  assert.ok(!/label = '忌'|label = '暗'|\(theme\.glyph \|\| '明'\)/.test(src), '盘面又写回汉字了');
  for (const cell of high.cells) {
    assert.ok(!/[一-龥]/.test(cell.label), '盘面格子里还有汉字：' + cell.label);
  }
  const css = read('pages/practice/practice.wxss');
  assert.ok(/\.cell--dead \{[^}]*background: #8d3b32/.test(css), '死门没和暗格拉开颜色');
  const gd = require('../data/guides.js').guideOf('lights');
  assert.ok(/● \/ ○/.test(gd.terms.map(function (t) { return t.name; }).join('')), '名词速查没讲图形');
  assert.ok(gd.inline.indexOf('忌') < 0, '速记又提前写死门');
  assert.ok(/比最优多走了几步/.test(gd.scoring), '评级口径没写清按「比最优多走几步」比');
  assert.ok(/阵溃/.test(gd.scoring), '评级口径没写清阵溃');
});

check('点灯破阵诀：简介对齐熄灯谜题，死门误触有独立触感', function () {
  const sk = require('../data/skills.js').SKILLS.filter(function (s) { return s.method === 'arrayEye'; })[0];
  assert.ok(/上下左右四格/.test(sk.desc), '功法简介没讲清翻转四格');
  assert.ok(/上下左右四格/.test(read('data/practice.js')), '准备页副标题没讲清翻转四格');
  const page = read('pages/practice/practice.js');
  assert.ok(/gameId === 'lights'/.test(page), '触了死门没有轻震反馈');
  assert.ok(/触了死门/.test(read('minigames/lights.js')), '死门没有独立浮字');
  assert.ok(/HINT_LABELS[\s\S]{0,120}lights: '阵眼感应'/.test(read('data/practice.js')),
    '提示按钮名没和 HUD 统一');
});

check('境界超限：文案只从 copy.js 出，讲清加价的是耗气而不是熟练度', function () {
  const copy = require('../data/copy.js');
  const page = read('pages/practice/practice.js');
  const eng = read('utils/game.js');
  assert.ok(/copy\.decayText\('below'/.test(page) && /copy\.decayText\('above'/.test(page),
    '准备页又自己拼衰减文案');
  assert.ok(/copy\.decayText\(/.test(eng), '图鉴又自己拼衰减文案');
  assert.ok(!/收益只剩三成/.test(page) && !/收益仅剩 30%/.test(eng), '还有硬编码的衰减句');
  const below = copy.decayText('below', '金丹');
  assert.ok(/人物境界/.test(below) && /耗气 ×1\.5/.test(below), '没说清加价落在耗气上');
  assert.ok(/熟练度照给/.test(below), '没写明熟练度不受境界影响');
  assert.ok(/属性加成照拿/.test(below) && /评级门槛不变/.test(below), '没排除属性与评级的误解');
  assert.ok(/已超/.test(copy.decayText('above', '元婴')), '超过上限那条没区分');
  assert.ok(/照样能练/.test(copy.decayText('above', '元婴')), '超过上限那条没写明「还能练」，会被读成这门作废了');
});

check('「练不了」只由学习门槛决定：收益上限不许拿去拦人', function () {
  // 金丹期练黄阶是这条的活样本：黄阶上限只到筑基，把上限当门槛就会说「需炼气境界方能修习」。
  const wxml = read('pages/skills/skills.wxml');
  const js = read('pages/skills/skills.js');
  assert.ok(/wx:if="\{\{!detail\.realmReady\}\}"[^>]*>需「/.test(wxml),
    '功法图鉴的门槛句没挂 realmReady');
  assert.ok(!/realmOk/.test(wxml) && !/realmOk/.test(js), '又把门槛与收益合成一个布尔了');
  assert.ok(/realmReady/.test(js), '藏经阁分区的排序没按学习门槛判断');
});

check('评级中文名只有一份真源，且避开段位词', function () {
  const copy = require('../data/copy.js');
  const titles = copy.GRADE_TITLE;
  const tierNames = ['未入门', '入门', '小成', '大成', '圆满', '大圆满'];
  for (const g of ['S', 'A', 'B', 'C', 'F']) {
    assert.ok(titles[g], '缺 ' + g + ' 的评级名');
    for (const t of tierNames) {
      assert.notStrictEqual(titles[g], t, g + ' 的评级名撞了段位名「' + t + '」');
    }
  }
  assert.ok(!/const GRADE_TITLE|GRADE_TITLE: GRADE_TITLE/.test(read('data/world.js')),
    'world.js 还留着第二份评级名');
  assert.ok(!/gradeName = \{/.test(read('pages/practice/practice.js')), '参悟页还自写一套评级名');
  for (const f of ['pages/practice/practice.js', 'utils/game.js']) {
    assert.ok(/copy\.GRADE_TITLE/.test(read(f)), f + ' 没走评级名真源');
  }
});

check('15 套玩法的代价句在局内真的看得见（运行时探针）', function () {
  const pd = require('../data/practice.js');
  for (const m of pd.PRACTICE_METHODS) {
    const M = require('../minigames/' + m.game + '.js');
    let vm = null;
    const c = M.create({
      params: pd.buildParams(m, 'novice'), perks: { tier: 0 }, theme: {},
      tip: m.tip, render: function (v) { vm = v; }, finish: function () { },
    });
    // 死门是大成才解锁的进阶规则，未解锁时阵灯推演只讲阵眼感应与步数余量的代价，不提前讲死门。
    const expected = m.game === 'lights' ? '每看一眼算 2 步' : m.tip;
    assert.ok(vm.hint.indexOf(expected) >= 0,
      m.game + ' 开局后代价句不见了：' + vm.hint);
    c.destroy();
  }
});

check('只奖不罚：连练递减全站清零，换门的「省气」有单一真源', function () {
  const files = ['utils/game.js', 'pages/practice/practice.js', 'pages/guide/guide.js',
    'data/help.js', 'data/world.js', 'data/copy.js'];
  for (const f of files) {
    assert.ok(!/心浮气躁|收益递减|restless|repeatCount/.test(read(f)),
      f + ' 还留着连练递减的旧口径');
  }
  // 触类旁通从「多拿资源」换成了「少花灵力」，真源搬进了 data/economy.js。
  const economy = require('../data/economy.js');
  assert.strictEqual(economy.CROSS_QI, 0.92, '换门省气系数没进数值真源');
  assert.ok(/const CROSS_QI = 0\.92;/.test(read('data/economy.js')), '省气真源没写在常量段');
  assert.ok(/if \(opt\.cross\) cost \*= CROSS_QI/.test(read('data/economy.js')),
    'practiceQiCost 没把换门省气乘进去');
  const world = require('../data/world.js');
  assert.strictEqual(world.CROSS_BONUS, undefined, 'world.js 还留着旧换门倍率');
  assert.ok(/copy\.practiceNote/.test(read('pages/practice/practice.js'))
    && /repeatNote/.test(read('pages/practice/practice.wxml')),
    '准备页没把「连练不减收益」写在开局前');
  // 回关护栏：2026-11 起口径改成「局部」——同一个当前关下，回打更低的关不许比打当前关划算。
  // 旧的「6000 点预算下只刷第 1 关不许反超逐关进」不是一个能成立的判据（见 04-open-issues D12），
  // 它从 v9 起就空跑：刷法名改名之后两条曲线都落进 else 分支，等于拿逐关进比逐关进。
  const sim = read('scripts/simulate.js');
  assert.ok(/回关不该更划算/.test(sim), '模拟里没有断言守着「回关不许比打当前关更划算」');
  assert.ok(/for \(const cur of \[2, 21, 200, 800\]\)/.test(sim),
    '回关护栏没在多个当前关上复算（只测一档会漏掉跨段那一刀）');
  assert.ok(!/mode: 'novice'|mode: 'below'/.test(sim),
    '刷法名又写回了 runBudget 不认识的值——那两条曲线会静默变成逐关进');
});

check('已持玉简按最近练过的在前，藏经阁仍是兑换顺序', function () {
  const js = read('pages/skills/skills.js');
  const engine = read('utils/game.js');
  // 列表的职责是「我手上有什么」，顺序就该按「我刚碰过谁」。
  // 「离下一段最近」是主页「今日之课」的判据；搬到列表上只会让列表天天变，
  // 玩家找不到昨天在练的那门——2026-11 按实际反馈改成「最近练过的在前」。
  assert.ok(/learned\.sort\(engine\.orderLearned\)/.test(js),
    '已持玉简没按 lastAt 排：最近练过的那门会沉下去');
  assert.ok(!/learned\.sort\([\s\S]{0,400}recommendScore/.test(js),
    '已持玉简又改回推荐排序了：列表会跟着推荐算法天天变');
  // 第二级兜底必须是「熟练度降序」，不能直接落到正名。
  // 2026-11 实测踩过：那份存档的 lastAt 与 records.at 全是 0，两级排序每次都落到
  // 字典序（14 门按码点 4e00 / 4e07 / 4e09 / 4e5d … 严格递增），玩家看到的是
  // 「改了但跟没改一样」。字典序是最没有信息量的顺序，兜底必须再带一层「投入」。
  // 比较函数在引擎里（`orderLearned`），另一头有跑结果的断言（`rank.test`）。
  assert.ok(/function orderLearned[\s\S]{0,600}a\.prof !== b\.prof/.test(engine),
    '引擎里的 orderLearned 少了「熟练度降序」这一级：全表无时间戳时会退化成按门名');
  // 时间戳必须真的被写进去。只声明不写，全表 lastAt 恒 0，
  // 排序会静默退化成「按门名」——看起来正常，其实「最近玩」根本没生效。
  assert.ok(/rec\.lastAt = Date\.now\(\)/.test(engine), '参悟结算没有写 rec.lastAt');
  assert.ok(/lastAt: Math\.floor\(num\(r\.lastAt, 0\)\)/.test(engine), '读档没给 lastAt 兜底');
  // 「确实打了但不出结算」的两条路也必须记钟，否则玩家收功/返回十次，列表纹丝不动。
  // 2026-11 真机反馈就是这么来的：applyPractice 里早写着「走火也记」，
  // 可中途收功与局中返回根本不经过它。两头都守：函数在引擎，两处在页面调。
  assert.ok(/function touchSkill/.test(engine) && /touchSkill: touchSkill/.test(engine),
    '引擎没有 touchSkill：收功 / 返回这两条路没法记钟');
  const pg = read('pages/practice/practice.js');
  // 记钟只有一处实现（markTouched），收功 / 返回 / 切页都调它。
  assert.ok(/markTouched: function[\s\S]{0,400}engine\.touchSkill\(s, skillId\)/.test(pg),
    '记钟没走到 engine.touchSkill：收功一局回去列表顺序不变（玩家判定为「没生效」）');
  assert.ok(/onAbandon:[\s\S]{0,1600}self\.closeAbandonedRound\(\)/.test(pg),
    '中途收功没走统一结账：它会不会断连 S 取决于另一条路，早晚分叉');
  assert.ok(/onHide:[\s\S]{0,600}this\.closeAbandonedRound\(\)/.test(pg) &&
    /onUnload:[\s\S]{0,400}this\.closeAbandonedRound\(\)/.test(pg),
    '局中离开没结账：onHide 管切页/切后台，onUnload 管导航返回（返回只走后者）');
  // 结账只写一处：断连 S + 记钟都要在 closeAbandonedRound 里，
  // 不许某条离开路径只记钟不断连击（那等于留了一条不花钱的保连击路子）。
  assert.ok(/closeAbandonedRound[\s\S]{0,500}this\.markTouched\(\)/.test(pg) &&
    /closeAbandonedRound[\s\S]{0,500}engine\.breakCombo/.test(pg),
    '局中离开没同时做「记钟」与「断连 S」');
  // 主页「今日之课」仍只由 recommendScore 出，不许被列表顺序带过去。
  assert.ok(/function recommendScore/.test(engine) && /recommendScore: recommendScore/.test(engine),
    '推荐口径没有单一真源');
  // 藏经阁分区是兑换顺序，不是推荐顺序：换得起的不该被「离圆满最近但买不起」的顶下去。
  assert.ok(/pending\.sort\(/.test(js), '藏经阁分区没有自己的排序');
  assert.ok(!/pending\.sort\([\s\S]{0,240}recommendScore/.test(js),
    '藏经阁分区改用推荐排序了：换得起的会被换不起的顶到下面');
});

check('左上角返回与「收功」是同一件事：都先问一句', function () {
  const pg = read('pages/practice/practice.js');
  // 2026-11 真机反馈：右上角「收功」会弹确认，左上角返回静默丢盘，同一个页面两种脾气。
  // 小程序没有 onBackPress，拦原生返回只有官方这一个口子：
  // wx.enableAlertBeforeUnload —— 导航栏返回 / 安卓 back 键会先弹询问。
  assert.ok(/wx\.enableAlertBeforeUnload\(/.test(pg),
    '没挂返回询问：左上角返回仍然一句不问就把这一局丢掉');
  assert.ok(/armLeaveGuard:[\s\S]{0,320}inRound\(\)/.test(pg),
    '返回询问没按「在局中」判据挂：准备页、结算卡上也会弹');
  // 撤守卫的点要够：出结算 / 留在终局那一屏 / 再来一局 / 返回 / 倒数中反悔 / 离开页面。
  // 少一处就会在「这一局早打完了」的时候被问「本局作废」。
  const disarms = (pg.match(/this\.disarmLeaveGuard\(\)/g) || []).length;
  assert.ok(disarms >= 6, '撤返回询问的地方只有 ' + disarms + ' 处，打完一局还会挨弹窗');
  // 两处文案同源：收功弹窗与返回询问要说同一句话，各写一份早晚改漏一处。
  assert.ok(/content: this\.abandonText\(true\)/.test(pg) &&
    /enableAlertBeforeUnload\(\{ message: this\.abandonText\(false\)/.test(pg),
    '收功弹窗与返回询问各写了一套文案');
  // 冲关局起手不扣灵力（布阵灵石结算才扣），不许沿用那句「起手耗去的灵力不退」。
  assert.ok(/abandonText:[\s\S]{0,300}breakthrough[\s\S]{0,200}本局作废，冲关未成/.test(pg),
    '冲关局套用了练习局的收功文案：它不扣灵力，却告诉玩家「灵力不退」');
});

check('中途收功的「返回」回到本门静室，不是退回列表', function () {
  const pg = read('pages/practice/practice.js');
  // 2026-11 真机反馈：收功结算卡上点「返回」，落回功法列表，玩家要的是
  // 这一门功法的详情——那一屏就是本页的准备态（品阶、火候、连 S、最佳、规则）。
  // 「多退了一层」不是 navigateBack 退多了，是这一层本来就不该退出页面。
  assert.ok(/rv\.kind === 'abandon'\)\s*\{\s*this\.onQuitToPrep\(\)/.test(pg),
    '收功结算的「返回」仍走 onBack：退出页面落到功法列表');
  assert.ok(/onQuitToPrep:[\s\S]{0,700}started: false/.test(pg),
    '没有回准备屏的收口：收功后只能退出页面');
  // 两个标记必须一起清：aborting 留着，下一局照常结算也会被当成「收」；
  // roundClosed 留着，下一局中途离开就不结账（记钟与断连 S 全跳过）。
  assert.ok(/onQuitToPrep:[\s\S]{0,700}this\.aborting = false/.test(pg),
    '回准备屏没清 aborting：下一局的正常结算仍被当成中途收功');
  assert.ok(/onQuitToPrep:[\s\S]{0,700}this\.roundClosed = false/.test(pg),
    '回准备屏没清 roundClosed：下一局中途离开不记钟、不断连 S');
  // 「留在本页」是留刚打完那一屏，回准备屏是回开局前那一屏——两件事不能合成一个函数。
  assert.ok(/onStay:[\s\S]{0,400}boardHeld: true/.test(pg),
    '「留在本页」不再留终局那一屏');
  // 冲关局没有「这一门」，它的次按钮仍去功法页。
  assert.ok(/mode === 'breakthrough'\)[\s\S]{0,200}switchTab[\s\S]{0,120}skills/.test(pg),
    '冲关局的次按钮没去功法页');
  // 上一版试过「回功法页再自动弹这门的详情」，是个浮层，玩家不要浮层要真页面。
  assert.ok(!/returnSkillId/.test(pg), '还留着 returnSkillId 那套跨页递话，返回仍会弹浮层');
});

check('选关面板铺满整段：未至的关也显示，只是不可选', function () {
  const pg = read('pages/practice/practice.js');
  const wxml = read('pages/practice/practice.wxml');
  // 2026-11 真机反馈：面板只列到「已到达」，后半段关号凭空消失，
  // 玩家读不出这一段还有多少关。走没走到是进度，看不看得见是面板的事。
  assert.ok(/for \(let lv = d\.from; lv <= d\.to; lv \+= 1\)/.test(pg),
    '选关网格只铺到已到达的关，整段被截断');
  assert.ok(/locked: lv > levelMax/.test(pg), '未至的关没有标记，样式挂不上');
  assert.ok(/lv-cell--lock/.test(wxml), '未至的关没有压暗');
  // 压暗只是提示不是禁用：真点下去必须答一句差在哪，否则就是「点了没反应」。
  assert.ok(/lv > this\.data\.levelMax[\s\S]{0,200}toast\(/.test(pg),
    '点未至的关一声不响，玩家会以为面板卡住');
  // 段标签也一样：压暗写「未至」不等于可以白点一下。
  assert.ok(/STAGES\[idx\]\.from[\s\S]{0,160}toast\(/.test(pg),
    '点未至的段没有任何回应');
});

check('节律判定：写下拍速、响出拍子、环在正中', function () {
  const tempo = read('minigames/tempo.js');
  const pg = read('pages/practice/practice.js');
  const sx = read('utils/sfx.js');
  const gen = read('scripts/gen-sfx.js');
  const wxml = read('pages/practice/practice.wxml');
  const wxss = read('pages/practice/practice.wxss');
  // 2026-11 真机反馈：局内只有「第 3 / 3 小节」，没写这一局多快，也没有任何声音。
  // 后来玩家又追一句：「你为啥要写每拍多少秒呢」——秒数确实是给节拍器对表用的，
  // 这一门靠耳朵走，人玩游戏不读表。改成写**一小节响几下**：数得出来，对得上提示轨。
  assert.ok(/vm\.beatText\s*=\s*'一小节 '\s*\+\s*s\.bar/.test(tempo),
    '局内没写一小节几下：玩家数不出这一局一格多长');
  assert.ok(!/speedText/.test(tempo), '拍速那套秒数文案又回来了：玩家不会拿它做判断');
  assert.ok(!/每格\s*\d*\s*秒|每格 '?\s*\+/.test(tempo), 'HUD 又写「每格几秒」了');
  assert.ok(/vm\.beatKey/.test(tempo), '没暴露拍号，页面无从知道什么时候该响');
  // 小节头要有重音：一串同样轻重的哒声里，玩家数不出小节线在哪，
  // 第三段起提示轨只剩小节头，那就没有东西可以锚定第几小节了。
  assert.ok(/vm\.beatAccent\s*=/.test(tempo), '没标小节头，节拍音没有轻重');
  assert.ok(/sfx\.play\(vm\.beatAccent \? 'beataccent' : 'beat'\)/.test(pg),
    '节拍音没按重音分强弱');
  assert.ok(/beat:\s*\{[^}]*beat\.wav/.test(sx), '音效表里没有节拍音');
  assert.ok(/beataccent:\s*\{[^}]*beataccent\.wav/.test(sx), '音效表里没有小节头的重音');
  // 重音靠低八度，不靠音量：播放音量已经顶在「不刺耳」的上限 0.4，再加就是拿响度硬砸。
  assert.ok(/beataccent: function[\s\S]{0,220}freq:\s*196/.test(gen),
    '小节头没有做成低八度：它会和普通格一样高，一串哒声里分不出小节线');
  // 节拍音必须预热。新建 InnerAudioContext 后立刻 play，真机上首声经常直接丢掉——
  // 而节律这一门是「第一拍就要响」，首拍哑掉等于整门进不去节奏。
  assert.ok(/const WARM\s*=\s*\[[^\]]*'beat'/.test(sx), '节拍音没进预热表，开局第一拍会哑');
  assert.ok(/const WARM\s*=\s*\[[^\]]*'beataccent'/.test(sx), '重音没进预热表');
  // 音量按「比 tick 更轻」给过：0.15 × 轻档 0.75 × 峰值 0.52 ≈ 0.058，真机上等于没响。
  const beatVol = Number((/beat:\s*\{[^}]*volume:\s*([\d.]+)/.exec(sx) || [])[1]);
  assert.ok(beatVol >= 0.3, '节拍音音量只有 ' + beatVol + '，真机上听不见（tick.wav 峰值才 0.52）');
  // 节拍音不许进 VOICE 声道：进了就会掐掉紧随其后的判定音——
  // 玩家踩在拍点上点击时，那一下反而没有声音。
  assert.ok(!/VOICE\s*=\s*\[[^\]]*'beat'/.test(sx), '节拍音进了判定声道，会掐掉判定音');
  // 段首关（1 / 11 / 51 / 201 / 501）是引导关：预拍那一小节盘面正中放一个「听」。
  // 这一门没法用文字教，只能让人先听一小节——那一段不用做任何事的时间就是教程。
  assert.ok(/class="ring-listen"[^>]*>听</.test(wxml), '模板里没有预拍那个「听」字');
  assert.ok(/vm\.coachListen/.test(tempo) && /vm\.coachListen/.test(wxml),
    '没把「现在只用听」这个状态下发/渲染出来');
  assert.ok(/\.ring-listen\s*\{[\s\S]{0,420}pointer-events:\s*none/.test(wxss),
    '「听」压在环心却没放行点击，玩家点正中会漏掉第一手');
  assert.ok(/coachLv\s*===\s*L\.STAGES\[stageNo\]\.from/.test(tempo),
    '段首关判定没了：引导会铺到每一关上，变成常驻提示');
  // 预拍那一小节里点盘面不许判成「太早 · 空拍」：引导就摆在那一小节上，
  // 玩家跟着「先听」好奇碰一下先吃一个零分，这一课就白上了。
  assert.ok(/nowMs\s*<\s*s\.leadMs[\s\S]{0,160}C\.flash/.test(tempo),
    '预拍里点一下会被记成空拍，引导那一小节不是无代价的');
  // 环要绝对居中：混在版流里会被下面的提示轨顶偏半个身位，判定点跟着歪。
  assert.ok(/position:\s*absolute/.test(wxss) && /\.ring-cells\s*\{[\s\S]{0,220}top:\s*50%/.test(wxss),
    '环没脱离版流：提示轨会把它顶偏');
  assert.ok(/class="ring-cells"/.test(wxml), '模板里没有环的定位层');
  assert.ok(!/\.ring-area\s*\{[\s\S]{0,200}flex-wrap/.test(wxss),
    'ring-area 又变回 flex 换行排版：环会被顶偏');
  // 2026-11 真机第二轮：「这个还是不对」——字挤成两行、两环一大一小。
  // ① 小字不许跟在小节号后面一起写：右侧「评级 / 收功」一挤，行尾就剩一个孤字「秒」。
  assert.ok(/vm\.timeText\s*=[^\n]*小节'/.test(tempo), '小节号没有单独成句');
  assert.ok(/class="hud__speed"/.test(wxml), '模板里没有小字那一行');
  assert.ok(/\.hud__time\s*\{[\s\S]{0,400}white-space:\s*nowrap/.test(wxss),
    '小节号没锁单行：右侧读数一变宽它就会折行');
  // ② 环的尺寸只许玩法下发。wxss 自己写一个 200rpx，判定带按别的基准算，珠子扫过朱带的时刻就偏了。
  assert.ok(/vm\.ringGeom\s*=\s*\{[^}]*orb[^}]*track/.test(tempo),
    '没把环的基准尺寸下发给页面，页面只能自己猜一个数');
  assert.ok(/vm\.ringGeom\.orb/.test(wxml) && /vm\.ringGeom\.track/.test(wxml),
    '模板没用玩法下发的环尺寸');
  assert.ok(/ORB_RPX\s*\/\s*2\s*\+\s*ORB_RPX\s*\/\s*2\s*\*\s*scaleWin/.test(tempo),
    '判定带的盒子没从环的基准尺寸换算，是另写的一份常数');
  // ③ 每一格要有一圈恒定的归位圈：一手刚起、一手已收到底时，没有它两格看着就是一大一小两个环。
  assert.ok(/class="ring-track"/.test(wxml), '盘面没有归位圈：两环会被读成一大一小');
  assert.ok(/\.ring-track\s*\{[\s\S]{0,260}border-radius:\s*50%/.test(wxss), '归位圈不是圆的');
  // 归位圈必须等于珠子的最外沿（基准 × START_SCALE），小了珠子会跑出圈外。
  assert.ok(/TRACK_RPX\s*=\s*Math\.round\(ORB_RPX\s*\*\s*START_SCALE\)/.test(tempo),
    '归位圈不等于珠子最外沿，珠子起步时会溢出圈外');
});

check('节律盘装得下：环格子、提示轨、提示句三层不互相压', function () {
  const tempo = read('minigames/tempo.js');
  const wxss = read('pages/practice/practice.wxss');
  // 三层各占一块：环格子纵向取正中，提示轨与提示句绝对贴底。高度不够就是「环压着字」，
  // 之前 500rpx 配 350rpx 的珠子，双手段两行提示轨正好顶到珠子下沿。
  const area = /\.ring-area\s*\{([\s\S]*?)\}/.exec(wxss);
  const h = area ? Number((/height:\s*(\d+)rpx/.exec(area[1]) || [])[1]) : 0;
  const cell = /\.ring-cell\s*\{[\s\S]*?width:\s*(\d+)rpx/.exec(wxss);
  const cellRpx = cell ? Number(cell[1]) : 0;
  const orb = Number((/const ORB_RPX\s*=\s*(\d+)/.exec(tempo) || [])[1]);
  const start = Number((/const START_SCALE\s*=\s*([\d.]+)/.exec(tempo) || [])[1]);
  assert.ok(h > 0 && cellRpx > 0 && orb > 0 && start > 0, '读不到环区的尺寸');
  // 珠子最外沿必须装进格子，否则判定带的圆心与格子圆心对不上（格子按内容居中）。
  assert.ok(Math.round(orb * start) <= cellRpx,
    '珠子最外沿 ' + Math.round(orb * start) + 'rpx 超出格子 ' + cellRpx + 'rpx');
  // 格子居中 → 下沿 = H/2 + 格子/2；提示轨两行 52rpx、贴底 60rpx → 上沿 = H − 112。中间至少留 24rpx。
  // 整理后就是一条：H ≥ 格子 + 272。
  const need = cellRpx + 272;
  assert.ok(h >= need, '环区高 ' + h + 'rpx 装不下：珠子下沿会压住两行提示轨（至少要 ' + need + 'rpx）');
});

check('功法卡片紧凑单行：名字不竖排、按钮不抢宽度、阶段色走令牌', function () {
  const js = read('pages/skills/skills.js');
  const wxml = read('pages/skills/skills.wxml');
  const wxss = read('pages/skills/skills.wxss');
  // 真机上出现过「名字被 flex 压到一字宽、整张卡片竖排撑成半屏高」，从根上守住。
  assert.ok(/\.sk-name[\s\S]*?white-space:\s*nowrap/.test(wxss), '功法名没有强制单行，会被压成竖排');
  assert.ok(/\.sk-name[\s\S]*?min-width:\s*0/.test(wxss), '功法名缺 min-width:0');
  assert.ok(/\.sk-meta[\s\S]*?text-overflow:\s*ellipsis/.test(wxss), '元信息没有单行截断兜底');
  assert.ok(/\.imm-row\s*>\s*\.sk-act[\s\S]*?flex:\s*none/.test(wxss), '右侧按钮没锁宽，会抢走文字宽度');
  assert.ok(/width:\s*160rpx/.test(wxss), '右侧按钮没有固定宽度');
  assert.ok(/\.imm-row\s*>\s*\.imm-row__body[\s\S]*?width:\s*0/.test(wxss), '文字区没有弹性基准宽度');
  assert.ok(!/skill-name|skill-game|skill-sub|detailText|catchtap="openDetail"/.test(wxml + js),
    '又回到「一行塞名字 + 玩法名 + 品阶 + 详情链接」的挤压布局');
  assert.ok(/item\.cardName/.test(wxml) && /item\.metaText/.test(wxml), '卡片没用重排后的字段');
  assert.ok(/metaText: metaText/.test(js), '卡片没用统一的元信息字段');
  // 两个分区各写一行：已持讲「练到哪了」，藏经阁讲「这一门怎么玩」。
  // 已持那行不许塞玩法名——小屏会先截掉属性；藏经阁那行没有熟练度可讲，只讲玩法。
  // 已持那行的第二段从「体魄 +0.8」换成了「再练到小成：战力 +4」：破境门槛读的是战力，
  // 属性单位对不上，玩家没法判断练这门推不推得动筑基。属性明细仍在图鉴里。
  assert.ok(/s\.profTierName \+ ' ' \+ s\.percent \+ '% · ' \+ \(gainText \|\| bonusText\)/.test(js),
    '已持卡片的元信息没写成「段位 进度 · 再练一段能换多少战力」一行');
  // 这个数必须从引擎来：页面自己再算一遍，就会与破境页各说各话。
  assert.ok(/powerGain: rec\.unlocked \? skillPowerGain\(state, s\.id\) : 0/.test(read('utils/game.js')),
    '战力增量没在引擎里算（页面自算会与破境页对不上）');
  assert.ok(js.indexOf("s.methodName + ' · ' + s.gameName") >= 0,
    '藏经阁卡片的元信息没写成「参悟方式 · 盘面」');
  assert.ok(/barTone/.test(js) && /item\.barTone/.test(wxml), '进度条没按阶段分档');
  assert.ok(/imm-bar--gold/.test(wxss) && /imm-bar--dim/.test(wxss), '阶段色类名没落地');
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(wxss), '功法页 wxss 又写了裸色值');
  assert.ok(!/copy\.hints\./.test(wxml), '功法页又把提示长句印回列表');
});

check('功法页两个分区叫「已持玉简 / 藏经阁」，不再另立一个兑换页', function () {
  const copy = require('../data/copy.js');
  const wxml = read('pages/skills/skills.wxml');
  assert.strictEqual(copy.UI.skillsTabs.learned, '已持玉简');
  assert.strictEqual(copy.UI.skillsTabs.shop, '藏经阁');
  assert.ok(/copy\.skillsTabs\.learned/.test(wxml) && /copy\.skillsTabs\.shop/.test(wxml),
    '两个分区的文案没走真源');
  assert.ok(!/可解锁|未习得/.test(wxml), '功法页 tab 还写着「可解锁 / 未习得」');
});

check('藏经阁分区装全部未习得，不是只装能换的那几门', function () {
  const js = read('pages/skills/skills.js');
  // 2026-11 删门之后：15 门里只剩 1 门（静心记诵诀）挂在藏经阁卖，1 门（太虚翻卦诀）靠切磋首胜，
  // 13 门初始赠送。若这一区只装 canBuy 的，那门掉落功法在没拿到之前就没有图鉴与路径可看——
  // 合并时最容易挨的一刀，正是「反正按钮只对能换的画，那就先滤一道」。
  assert.ok(js.indexOf('if (s.unlocked) learned.push(s);') >= 0,
    '已持与未得没有分开归堆');
  assert.ok(js.indexOf('else pending.push(s);') >= 0,
    '未习得的门没有全部进藏经阁分区');
  assert.ok(!/if\s*\(\s*!s\.canBuy\s*\)\s*continue/.test(js),
    '藏经阁分区把「不能兑换的门」滤掉了：切磋来源那门的图鉴会消失');
});

check('参悟页带 ?skillId 认门，「这一门」与换门都在页内', function () {
  const js = read('pages/practice/practice.js');
  const wxml = read('pages/practice/practice.wxml');
  const cfg = JSON.parse(read('pages/practice/practice.json'));
  assert.ok(/query && query\.skillId/.test(js), '参悟页不认 ?skillId：点哪门都进同一门');
  // 页面名是「参悟」，功法名由卡片里的 h1 承担：导航标题再写一遍功法名，
  // 一屏两处同字，而且冲关局根本没有功法可写。
  assert.strictEqual(cfg.navigationBarTitleText, '参悟', '参悟页导航标题被改成别的了');
  // 详情页并进来之后，换门与档案都得在本页解决，否则等于把那一页又建回来。
  assert.ok(/onToggleSwap/.test(js) && /onSwapTo/.test(js), '换功法又退回列表页了，页内弹层没了');
  assert.ok(/onToggleArchive/.test(js) && /copy\.sections\.archive/.test(wxml),
    '「这一门」没并进参悟页');
  assert.ok(/wx\.redirectTo\(\{ url: '\/pages\/practice\/practice\?skillId=' \+ id \}\)/.test(js),
    '换门没有整页重开：难度、规则、盘面都得跟着新功法重算');
});

check('玩家可见文案不写「看详情 / 去看看」这类口语前缀', function () {
  const copy = require('../data/copy.js');
  assert.strictEqual(copy.UI.actions.viewDetail, '详情 ›', '详情按钮仍带「看」字');
  const files = [
    'pages/practice/practice.wxml', 'pages/profile/profile.wxml',
    'pages/skills/skills.wxml', 'pages/skills/skills.js',
    'pages/index/index.js', 'data/copy.js', 'data/help.js',
  ];
  for (const f of files) {
    assert.ok(!/看详情|去看看|去功法页看看|查看全部成就|看全本/.test(read(f)),
      f + ' 还残留口语化的「看」字措辞');
  }
  assert.ok(/copy\.UI\.actions\.practice/.test(read('pages/skills/skills.js')), '功法页动作没走文案真源');
  assert.ok(/copy\.UI\.actions\.buy/.test(read('pages/skills/skills.js')), '藏经阁换取没走文案真源');
  assert.ok(/copy\.UI\.actions\.goSkills/.test(read('pages/index/index.js')), '主页无推荐时没走文案真源');
  assert.ok(/copy\.actions\.allAchievements/.test(read('pages/profile/profile.wxml')), '成就入口没走文案真源');
});

check('阵灯破阵：四路反馈齐备、破阵即结算、规则写进游戏内', function () {
  const lights = read('minigames/lights.js');
  const wxss = read('pages/practice/practice.wxss');
  const themes = require('../minigames/theme.js');
  const guides = require('../data/guides.js');
  assert.ok(/C\.flash\(vm, vm\.status, 'gold'\)/.test(lights), '破阵没走最亮的一档浮字');
  assert.ok(/cell--solved/.test(lights) && /@keyframes solvedGlow/.test(wxss), '整盘一次性泛金没落地');
  assert.strictEqual(themes.themeOf('arrayEye', 'lights').solved, '破阵', '破阵文案没进主题真源');
  const said = guides.GUIDES.lights.steps.join('') + guides.GUIDES.lights.scoring;
  assert.ok(/一步不多是 S/.test(said), '说明没讲 S 口径');
  assert.ok(/阵溃/.test(said), '说明没讲阵溃');
  assert.ok(/复原本局/.test(said), '说明没讲复原本局的代价');
  for (const f of ['data/practice.js', 'minigames/theme.js', 'data/guides.js']) {
    assert.ok(!/立刻换下一盘|限时连解/.test(read(f)), f + ' 还写着限时连解的旧口径');
  }
});

check('阵灯推演：盘面规格与步数预算同源、阵眼术语收敛、HUD 步数成对照', function () {
  const pd = require('../data/practice.js');
  const lights = read('minigames/lights.js');
  const themes = require('../minigames/theme.js');
  const skills = require('../data/skills.js');
  const method = pd.getMethod('arrayEye');
  const skill = skills.SKILLS.filter(function (s) { return s.method === 'arrayEye'; })[0];

  // 规格与预算只有一份表：准备页那行与玩法层共用，换难度档跟着变。
  assert.ok(Array.isArray(pd.LIGHTS_LEVELS)
    && pd.LIGHTS_LEVELS.length === pd.STAGES.length, '档位表没盖住全部难度档');
  assert.strictEqual(pd.lightsLevelOf('minor').size, 4, '困难档盘面规格变了');
  assert.strictEqual(pd.lightsLevelOf('full').size, 5, '绝境档盘面规格变了');
  const hp = pd.buildParams(method, 'minor');
  assert.deepStrictEqual([hp.size, hp.minSteps, hp.hiSteps, hp.budgetSlack],
    [pd.LIGHTS_LEVELS[2].size, pd.LIGHTS_LEVELS[2].min, pd.LIGHTS_LEVELS[2].hi, pd.LIGHTS_LEVELS[2].slack],
    '玩法层没拿到按档注入的盘面规格、最优区间与余量');
  assert.ok(/p\.size/.test(lights) && !/const LIGHTS_LEVELS|const LIGHTS_TARGETS/.test(lights),
    'lights.js 又抄了一份档位表');
  assert.ok(/本段 3×3 盘 · 最优 2～3 步 · 最多多走 7 步/.test(pd.sLineText(method, 'novice')),
    '准备页没写出本档规格、最优区间与余量');
  // 预算不再是写死的参数：它是「本盘最优 + 余量」，在玩法层现算。表里若又出现 cap，
  // 说明那两处迟早会脱钩（旧表预算是最优的 3–4.5 倍，文档却写着「够 A、不够乱点」）。
  assert.ok(!/cap:/.test(JSON.stringify(pd.LIGHTS_LEVELS)), '档位表又写回了绝对步数预算');
  assert.ok(/goalText: sLine/.test(read('pages/practice/practice.js')), '准备页的 S 线没走同源文案');

  // 「阵眼」只留给提示技能：开局横幅、印章、风味与特效不再混用这个词。
  assert.ok(themes.themeOf('arrayEye', 'lights').banner.indexOf('阵眼') < 0,
    '开局横幅还在用「阵眼」');
  assert.ok(!/阵眼/.test(skill.flavor + skill.effect.text), '风味与特效名还在用「阵眼」');
  assert.strictEqual(pd.HINT_LABELS.lights, '阵眼感应', '提示技能名不该跟着改');

  // HUD 摆「已走 / 最优」对照，说明里也要讲清它不参与评级。
  assert.ok(/已走 ' \+ moves \+ ' 步/.test(lights) && /最优 ' \+ optimal \+ ' 步/.test(lights),
    'HUD 没把已走步数并进对照');
  // 「已亮 N / M」不许回到 HUD：这一门的亮盏数与离解开还有多远无关，
  // 实测正确的一手也可能让已亮数变少，摆出来就是一句反向信息。
  // 教学盘也算在内——正式局没有这个数，教学里先教会玩家看它，
  // 等于教一个下一局就消失的判据。整份文件一起守，不切片。
  assert.ok(!/progressText\s*=/.test(lights) && !/vm\.progress\s*=/.test(lights),
    'HUD 又把「已亮几盏 / 进度条」摆回来了（教学盘也不许）');
  const duel = lights.slice(lights.indexOf('function create(ctx)'), lights.indexOf('// 五档的宽窄写在这里'));
  assert.ok(/extras\.showProgress = false/.test(duel), '对局进度条没关');
  assert.ok(/extras\.showGradeNow = false/.test(duel), '局内评级徽章没关');
  assert.ok(!/本盘最少/.test(lights), 'HUD 还摆着容易误读的「本盘最少 N 步」');
  const gd = require('../data/guides.js').guideOf('lights');
  const terms = gd.terms.map(function (t) { return t.name; }).join('');
  assert.ok(/最优 N 步/.test(terms), '名词速查没讲最优步数');
  assert.ok(/比最优多走了几步/.test(gd.scoring), '没讲清按「比最优多走几步」评级');
  assert.ok(!/不参与评级/.test(gd.scoring), '还在说步数不参与评级，现在它就是评级依据');
});

check('阵灯推演：翻转范围微光是一次性动画，不占常驻预算', function () {
  const lights = read('minigames/lights.js');
  const wxss = read('pages/practice/practice.wxss');
  assert.ok(/return hit/.test(lights), 'toggle 没把被翻的格子交回来');
  assert.ok(/cell--flip/.test(lights) && /clearFlip/.test(lights), '微光没有收回逻辑');
  assert.ok(/const FLIP_MS = (\d+)/.exec(lights), '没设一次性时长');
  assert.ok(/@keyframes flipGlow/.test(wxss), '盘面没画翻转微光');
  assert.ok(/animation: flipGlow[^;]*1;/.test(wxss), '微光没设成只跑一次');
  const rule = (wxss.match(/\.cell--flip-a, \.cell--flip-b \{[^}]*\}/) || [''])[0];
  assert.ok(rule && !/infinite/.test(rule), '翻转微光成了常驻循环动画');
  assert.ok(/flipSeq \+= 1/.test(lights), '连点 / 破阵没让旧定时器作废');
});

check('参悟结算：金按钮再来一局、留在本页留的是刚打完那一屏', function () {
  const wxml = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  const copy = require('../data/copy.js');
  assert.strictEqual(copy.UI.actions.stay, '留于此处', '「留于此处」文案没进真源');
  assert.strictEqual(copy.UI.actions.again, '再参一局', '「再参一局」文案没进真源');
  // 位置对调：金按钮是再来一局，留在本页退成下方文字链。
  assert.ok(/primary: copy\.UI\.actions\.again/.test(js), '金按钮没换成再来一局');
  assert.ok(!/primary: copy\.UI\.actions\.stay/.test(js), '金按钮仍是留在本页');
  assert.ok(/result\.canStay[\s\S]{0,120}catchtap="onStay"/.test(wxml)
    && /result\.canStay[\s\S]{0,120}bindtap="onStay"/.test(wxml), '文字链没换成留在本页');
  assert.ok(!/onAgain}}/.test(wxml), '结算里还留着一条「再来一局」文字链');
  // 留在本页 = 留在刚打完的那一屏：不 rebuild、不回准备页，盘面还立着，控制器摘掉。
  const stay = /onStay: function \(\) \{[\s\S]*?\n  \}/.exec(js);
  assert.ok(stay && /showResult: false, started: true, boardHeld: true/.test(stay[0]),
    '留在本页没把盘面留在屏上');
  assert.ok(stay && /controller\.destroy/.test(stay[0]) && /controller = null/.test(stay[0]),
    '留在本页仍留着能点的控制器');
  // 终局底栏：回看 / 离开 / 再来一局，三个去处各一格。
  assert.ok(/boardHeld\) mode = 'done'/.test(js), '终局底栏没接进 syncBar');
  const bar = /barMode === 'done'[\s\S]{0,520}?<\/view>/.exec(wxml);
  assert.ok(bar && /onOpenRecord/.test(bar[0]) && /onBack/.test(bar[0]) && /onAgain/.test(bar[0]),
    '终局底栏缺去处');
  // 盘面已终：收功与操作提示都不该还在邀请玩家点。
  assert.ok(/wx:if="\{\{!boardHeld\}\}" class="scene-hud__quit"/.test(wxml)
    && /wx:if="\{\{!tutorial && !boardHeld\}\}" class="pr-hint"/.test(wxml)
    && /vm\.trail && started && !boardHeld/.test(wxml),
    '本局已终还挂着收功 / 操作提示');
  // 留住的盘面是「这一局」的，不能在换局路上活着：建局与再来一局都要把标记清掉，
  // 否则下一局开局就被当成已终局，底栏摆着终局三项却点不动盘面。
  const build = /buildGame: function \(\) \{[\s\S]*?lastTones = \[\];/.exec(js);
  assert.ok(build && /boardHeld: false/.test(build[0]), '建新局没清掉「盘面留住」标记');
  const again = /onAgain: function \(\) \{[\s\S]*?\n  \}/.exec(js);
  assert.ok(again && /boardHeld: false/.test(again[0]), '再来一局没清掉「盘面留住」标记');
  assert.ok(/onOpenRecord: function/.test(js) && /recordBrief && !showResult/.test(wxml),
    '没有可回看上局战绩的入口');
  assert.ok(/onCancelCountdown: function/.test(js) && /catchtap="onCancelCountdown"/.test(wxml),
    '倒数三秒不能反悔');
  const cancel = /onCancelCountdown: function \(\) \{[\s\S]*?\n  \}/.exec(js);
  assert.ok(cancel && !/controller\.start/.test(cancel[0]), '取消倒计时却已经开局了');
  // 金按钮直接把下一局开起来：默认动作就是连刷，不再绕准备页。
  const primary = /onPrimary: function \(\) \{[\s\S]*?\n  \}/.exec(js);
  assert.ok(primary && /onAgain\(\)/.test(primary[0]), '金按钮没把下一局开起来');
  assert.ok(/goalText/.test(wxml), '准备页没显示本档 S 线');
});

check('首局手把手：盘上引导而不是全屏弹窗，跳过有入口、文案走真源', function () {
  const wxml = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  const copy = require('../data/copy.js');
  const game = require('../utils/game.js');
  const index = require('../minigames/index.js');

  // 引导必须贴在盘面上，不能是盖住整页的遮罩：要教的就是「点这一格会发生什么」，
  // 遮住盘面的教程等于把要教的东西挡在外面。
  const teachTag = /<view wx:if="\{\{tutorial\}\}" class="teach">/.exec(wxml);
  assert.ok(teachTag, '引导卡没挂在局内卡片里');
  const playAt = wxml.indexOf('class="card pr-play"');
  const maskAt = wxml.indexOf('<view class="mask"');
  assert.ok(playAt >= 0 && maskAt > playAt, '没找到局内卡片或结算遮罩');
  assert.ok(teachTag.index > playAt && teachTag.index < maskAt, '引导卡跑到遮罩里去了，会盖住盘面');
  assert.ok(/catchtap="onSkipTeach"/.test(wxml), '引导没有跳过入口');
  assert.ok(/onSkipTeach: function/.test(js), '跳过入口没有对应方法');
  assert.strictEqual(copy.UI.actions.skipTeach, '略过指引');
  assert.ok(wxml.indexOf('跳过引导') < 0, '引导文案被写死在 WXML 里');

  // 第一次开局先走教学，只对自带脚本的玩法生效；走完必须落存档，否则每次进来都弹。
  assert.ok(/canTeach: function/.test(js) && /minigames\.hasTeach/.test(js), '页面没接教学判断');
  assert.ok(/if \(this\.canTeach\(\)\) \{ this\.startTeach\(\); return; \}/.test(js), '开局没先走引导');
  assert.ok(/engine\.markOnboarded/.test(js), '走完引导没写存档');
  assert.ok(/engine\.hasOnboarded/.test(js), '没读存档判断是否已看过');
  assert.strictEqual(index.hasTeach('lights'), true, '点灯破阵诀没有教学脚本');
  assert.ok(game.markOnboarded && game.hasOnboarded, '引擎没有引导标记接口');

  // 教学盘不该出现评级、重置与收功：那是一局才有的压力。
  const lights = read('minigames/lights.js');
  assert.ok(/showGradeNow = false/.test(lights) && /showReset = false/.test(lights), '教学盘还挂着正式局的控件');
  assert.ok(/不计步/.test(lights), '教学盘没写清不计步');
  assert.ok(/!tutorial/.test(wxml), '局内 HUD 没被教学态挡掉');
});

check('阵灯推演：结算说清「为什么不是 S」，用了辅助如实说明', function () {
  const lights = read('minigames/lights.js');
  const js = read('pages/practice/practice.js');
  assert.ok(/function gradeNotes/.test(lights), '没有评级依据');
  assert.ok(/正好走最优/.test(lights) && /S 要一步不差/.test(lights), '没写清 S 的条件');
  assert.ok(/最高只到 A/.test(lights), '用了辅助没说封顶');
  assert.ok(/阵溃：/.test(lights) && /最优只要/.test(lights), '阵溃没给下一步');
  assert.ok(/notes: gradeNotes\(\)/.test(lights), '评级依据没交给结算');
  assert.ok(/Array\.isArray\(res\.notes\)/.test(js), '结算没接玩法层的说明');
});

check('收牌迸溅与选中跳动：只动 transform / opacity，都是一次性动画', function () {
  const wxml = read('pages/practice/practice.wxml');
  const css = read('pages/practice/practice.wxss');
  const crest = read('styles/crest.wxss');
  const js = read('pages/practice/practice.js');
  const v = require('../data/visual.js');

  // 「这一手收走了哪几格」必须由玩法交出来。让页面去 diff 盘面是不成立的：
  // 消消乐收完立刻掉落重排，前后两帧每格都「有牌」，分不出「收走」和「换了一张」。
  assert.ok(/function markCleared/.test(read('minigames/common.js')), 'vm 协议里没有「刚收走哪几格」');
  assert.ok(/C\.markCleared\(vm, \[a, b\]\)/.test(read('minigames/link.js')), '连连看收牌没上报格位');
  assert.ok(/C\.markCleared\(vm, hits\)/.test(read('minigames/match.js')), '消消乐消除没上报格位');

  assert.ok(/class="spark"/.test(wxml) && /class="spark__ring"/.test(wxml) && /class="spark__dot"/.test(wxml),
    '盘面没有迸溅节点');
  assert.ok(/@keyframes sparkFly/.test(css) && /@keyframes sparkRing/.test(css), '迸溅没画关键帧');
  const blocks = css.match(/@keyframes\s+(sparkFly|sparkRing)\s*\{[\s\S]*?\n\}/g) || [];
  assert.strictEqual(blocks.length, 2, '迸溅关键帧数量不对');
  for (const b of blocks) {
    assert.ok(!/\b(left|top|right|bottom|width|height|background|box-shadow|filter)\s*:/.test(b),
      '迸溅关键帧里有会触发重排 / 重绘的属性：' + b.slice(0, 40));
  }
  const dotRule = (css.match(/\.spark__dot \{[\s\S]*?\n\}/) || [''])[0];
  assert.ok(dotRule && !/infinite/.test(dotRule), '迸溅成了常驻循环动画');
  assert.ok(dotRule.indexOf(v.MOTION.sparkMs + 'ms') >= 0, '迸溅时长与 MOTION.sparkMs 不一致');

  // 颜色取真源：图案是图片，取不到色，只能在 visual.CREST_HUE 登记一次。
  assert.ok(/visual\.CREST_HUE/.test(js), '迸溅颜色没走 visual.CREST_HUE');
  assert.strictEqual(v.CREST_HUE.length, 8, '纹样色表要与八个图案一一对应');

  // 选中跳动只动纹样自己的 transform。格子的 transform 归按压反馈（.cell--press），
  // 两处写同一个属性会互相顶掉，按下就没反馈了。
  assert.ok(/@keyframes crestPick/.test(crest), '选中没有跳动');
  assert.ok(/\.cell--chip\.cell--sel \.cell__crest \{/.test(crest), '选中跳动没挂在纹样上');
  const selRule = (css.match(/\.cell--chip\.cell--sel \{[^}]*\}/) || [''])[0];
  assert.ok(selRule && !/transform/.test(selRule), '选中态动了格子本身的 transform，会和按压反馈打架');
});

check('15 门盘面图案化：果器纹 / 卦象器物纹 / 数字纸纹三层覆盖，盘上不留汉字', function () {
  const pd = require('../data/practice.js');
  const wxml = read('pages/practice/practice.wxml');
  // 渲染优先级只有一条链：灵纹牌画 crest → 其余盘画 emblem → 都不是才退回文字。
  // 少了 elif 那一层，汉字 / dingbat 就会重新上屏。
  const crestAt = wxml.indexOf('class="cell__crest crest--{{item.crest}}"');
  const emblemAt = wxml.indexOf('class="cell__emblem emblem--{{item.emblem}}"');
  const labelAt = wxml.indexOf('<text wx:else>{{item.label}}</text>', emblemAt);
  assert.ok(crestAt > 0 && emblemAt > crestAt && labelAt > emblemAt,
    '格子的 crest → emblem → label 三层渲染顺序被拆开了');
  assert.ok(/<view wx:if="\{\{item\.crest\}\}"/.test(wxml)
    && /<view wx:elif="\{\{item\.emblem\}\}"/.test(wxml),
    'crest / emblem 不是同一条 if-elif 链，汉字会重新上屏');
  assert.ok(/item\.emblem\}\}" class="klotski__emblem/.test(wxml), '华容道主块没画图案');
  assert.ok(/item\.emblem\}\}" class="orbit__emblem/.test(wxml), '五行环灯没画图案');

  // 运行时探针：开局那一帧，凡是 label 还留着汉字的格子，必须已经有 emblem 顶上去；
  // 数字 / 形状盘允许纯文字，但绝不能是汉字。华容道块与五行环灯同理。
  const han = /[一-龥]/;
  for (const m of pd.PRACTICE_METHODS) {
    const M = require('../minigames/' + m.game + '.js');
    let vm = null;
    const c = M.create({
      params: pd.buildParams(m, 'novice'), perks: { tier: 0 }, theme: {},
      tip: m.tip, render: function (v) { vm = v; }, finish: function () { },
    });
    c.start();
    c.destroy();
    for (const cell of vm.cells || []) {
      if (han.test(cell.label || '') && !cell.emblem) {
        assert.fail(m.game + ' 盘面还有没被图案盖住的汉字：' + cell.label);
      }
    }
    for (const b of (vm.klotski && vm.klotski.blocks) || []) {
      if (han.test(b.label || '') && !b.emblem) assert.fail('华容道块还写着汉字：' + b.label);
    }
    for (const l of (vm.orbit && vm.orbit.lamps) || []) {
      if (han.test(l.label || '') && !l.emblem) assert.fail('五行环灯还写着汉字：' + l.label);
    }
  }

  // 全覆盖的另一半：数字 / 形状盘不换内容，但纸纹角花与一次性命中金圈要真的在。
  const css = read('pages/practice/practice.wxss');
  assert.ok(/@import "\.\.\/\.\.\/styles\/crest\.wxss"/.test(css)
    && /@import "\.\.\/\.\.\/styles\/emblems\.wxss"/.test(css), '两张 sprite 样式没导进参悟页');
  assert.ok(/\.cell::before \{/.test(css) && /linear-gradient\(135deg/.test(css), '全盘四角纸纹没画');
  assert.ok(/@keyframes cellEtch/.test(css), '命中一次性金圈没画');
  const etch = (css.match(/@keyframes cellEtch \{[\s\S]*?\n\}/) || [''])[0];
  assert.ok(/opacity/.test(etch) && /transform/.test(etch), '金圈动了会重排的属性');
  assert.ok(!/infinite/.test(etch), '金圈变成了常驻循环动画，动效预算会爆');
});

check('26 格器纹 sprite：单份 base64、三处容器、PNG 尺寸与打包排除', function () {
  const css = read('styles/emblems.wxss');
  const png = fs.readFileSync(path.join(ROOT, 'assets/emblems.png'));
  assert.strictEqual(png.readUInt32BE(16), 1664, 'sprite 宽度不是 26×64');
  assert.strictEqual(png.readUInt32BE(20), 64, 'sprite 高度不是 64');
  const classes = (css.match(/\.emblem--\d+/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
  assert.strictEqual(classes.length, 26, '26 格图案没配齐');
  // 小程序 WXSS 不能引用包内图片，只能内联；base64 只许出现一次，否则包体翻倍。
  assert.strictEqual((css.match(/data:image\/png;base64,/g) || []).length, 1, 'base64 被内联了多份');
  for (const sel of ['.cell__emblem', '.klotski__emblem', '.orbit__emblem']) {
    assert.ok(css.indexOf(sel) >= 0, '缺容器：' + sel);
  }
  assert.ok(/filter: brightness\(0\) invert\(1\)/.test(css), '深色格上的图案没翻白，会看不清');
  // 源文件只是用来生成样式，不该进小程序包。
  const cfg = JSON.parse(read('project.config.json'));
  assert.ok(cfg.packOptions.ignore.some(function (x) { return x.value === 'assets/emblems.png'; }),
    'assets/emblems.png 没排除出打包');

});

console.log('\n布局断言全部通过：' + passed + ' 项');
