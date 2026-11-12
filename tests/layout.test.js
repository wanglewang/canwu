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
  assert.ok(!/bindtap="onGoBattle"/.test(s), '仍保留与 tabBar 重复的「去论道」');
  assert.ok(!/>看道牒</.test(s), '仍保留与 tabBar 重复的「看道牒」');
});

check('洞府与道牒的「世界」占位区块默认可折叠', function () {
  for (const rel of ['pages/index/index.wxml', 'pages/profile/profile.wxml']) {
    const s = read(rel);
    assert.ok(/bindtap="onToggleWorld"/.test(s), rel + ' 缺少折叠入口');
    assert.ok(/wx:if="\{\{worldOpen\}\}"/.test(s), rel + ' 世界卡片没有条件渲染');
  }
  assert.ok(/onToggleWorld\s*:/.test(read('pages/index/index.js')));
  assert.ok(/onToggleWorld\s*:/.test(read('pages/profile/profile.js')));
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
        if (/btn--primary|btn--gold/.test(c)) major.push(i);
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
  assert.ok(/btn--warn/.test(reset), '重置存档未用警示样式');
  assert.ok(/btn--warn/.test(signOut), '退出登录未用警示样式');
  assert.ok(/以下操作不可撤销/.test(s), '缺少危险操作提示');
  assert.ok(/btn--warn/.test(read('app.wxss')), 'app.wxss 未定义 .btn--warn');
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
  assert.ok(/class="pg \{\{barMode \? 'pg--with-bar' : ''\}\}[^"]*"/.test(s), '页面未按 barMode 留底部空间');
  assert.ok(/sceneOn && started && !showResult \? 'pg--scene' : ''/.test(s), '沉浸舞台没有按样板开关与局内状态挂载');
  assert.ok(/barMode === 'start'/.test(s) && /barMode === 'tools'/.test(s), '吸底条缺少开始/工具两种形态');
  assert.ok(/syncBar: function/.test(js), '缺少吸底条状态同步');
  const start = (s.match(/barMode === 'start'[\s\S]*?<\/view>/) || [])[0] || '';
  assert.ok(/bindtap="onStart"/.test(start), '准备页的开始按钮不在吸底条里');
  assert.ok(/bindtap="onBack"/.test(start), '准备页缺少退出入口');
});

check('玩法说明接进准备页，术语速记常驻局内', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  assert.ok(/class="card guide-card"/.test(s), '准备页缺少「怎么玩」卡');
  assert.ok(/bindtap="onToggleGuide"/.test(s), '玩法说明不能收起');
  assert.ok(/guide\.terms/.test(s) && /guide\.steps/.test(s), '说明卡没有步骤与术语表');
  assert.ok(/class="pr-hint__terms"[\s\S]*?guide\.inline/.test(s), '局内没有常驻术语速记');
  assert.ok(/guides\.guideOf\(gameId\)/.test(js), '页面没有按玩法取说明');
  assert.ok(/onToggleGuide: function/.test(js), '缺少展开/收起方法');
  const click = read('minigames/click.js');
  assert.ok(/edgeName: '金锋'/.test(read('data/weapons.js')), '预留剑 profile 的金色长招没叫金锋');
  assert.ok(/profile\.edgeName/.test(click), '金色长招名没走兵器轴，容易串回剑法');
  assert.ok(/顺着每桩箭头把刀扫到靶心/.test(read('data/guides.js')), '基础刀法说明没讲清顺箭头扫到靶心');
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

check('论道页对手按钮改为卡片右侧紧凑按钮', function () {
  const s = read('pages/battle/battle.wxml');
  for (const line of s.split('\n')) {
    if (/bindtap="onFight"/.test(line)) {
      assert.ok(!/btn--block/.test(line), '仍有整宽重复按钮：' + line.trim());
      assert.ok(/btn--compact/.test(line), '未使用紧凑按钮：' + line.trim());
    }
  }
});

check('不再使用会被 .btn-row 覆盖的 mt12 / mt16 组合', function () {
  for (const rel of WXML) {
    assert.ok(!/class="btn-row mt\d+"/.test(read(rel)), rel + ' 仍有失效的间距组合');
  }
});

check('按钮与文字链满足最小触控高度', function () {
  const css = read('app.wxss');
  const btn = (css.match(/\.btn \{[\s\S]*?\}/) || [])[0] || '';
  assert.ok(/min-height:\s*8[4-9]rpx/.test(btn), '.btn 触控高度不足');
  const small = (css.match(/\.btn--small \{[^}]*\}/) || [])[0] || '';
  assert.ok(/min-height:\s*7[2-9]rpx/.test(small), '.btn--small 触控高度不足');
  const link = (css.match(/\.text-link \{[\s\S]*?\}/) || [])[0] || '';
  assert.ok(/min-height:\s*6[0-9]rpx/.test(link), '.text-link 没有可点热区');
});

check('吸底条适配安全区且有高优先级底部留白', function () {
  const css = read('app.wxss');
  assert.ok(/env\(safe-area-inset-bottom\)/.test((css.match(/\.sticky-bar \{[\s\S]*?\}/) || [])[0] || ''));
  assert.ok(/\.pg\.pg--with-bar \{/.test(css), '留白选择器优先级不足');
});

check('视觉标准落在唯一真源，样板阶段只对基础刀法开', function () {
  const v = require('../data/visual.js');
  assert.strictEqual(Object.keys(v.FAMILIES).length, 5, '五类主题色板不齐');
  assert.deepStrictEqual(Object.keys(v.ENABLED), ['forge'], '样板阶段不该一次改十套');
  assert.ok(v.isOn('forge') && !v.isOn('snatch'), '沉浸舞台开关没按主题生效');
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
  assert.ok(/weapon: 'dao'/.test(read('data/practice.js')), '基础刀法没标兵器');
  assert.ok(/weapon: 'sword'/.test(read('data/practice.js')), '剑诀·断岳没标兵器');
});

check('战力来源在洞府页与修行指南都讲清楚了', function () {
  const wxml = read('pages/index/index.wxml');
  const js = read('pages/index/index.js');
  const guide = read('pages/guide/guide.js');
  assert.ok(/powerOpen/.test(wxml) && /onTogglePower/.test(js), '洞府页战力明细不能展开');
  assert.ok(/ov\.powerBase/.test(wxml) && /ov\.powerRealmBonus/.test(wxml) && /ov\.powerEffectBonus/.test(wxml),
    '洞府页没写出属性基础 / 境界 / 特效三项');
  assert.ok(/powerLines/.test(js) && /体魄 ×1\.0/.test(js), '明细没讲属性权重');
  assert.ok(/已学/.test(js) && /突破境界/.test(js) && /大成/.test(js), '明细没讲多学功法、突破与特效');
  assert.ok(/title: '二 · 战力从哪来'/.test(guide), '修行指南没有战力专节');
  assert.ok(/战力 = 属性加权/.test(guide) && /轮着练/.test(guide), '指南没讲公式与轮换练');
  assert.ok(/title: '十一 · 离线收益的时间'/.test(guide), '插了新专节，后面章节编号没顺延');
});

check('照影符按经典扫雷深耕：无猜、首点空白、连开、分数方向', function () {
  const m = read('minigames/mines.js');
  const g = read('data/guides.js');
  const p = read('data/practice.js');
  assert.ok(/function solvable/.test(m) && /LAYOUT_TRIES/.test(m), '布禁制没验「不用猜」');
  assert.ok(/firstZone/.test(m), '首点及其八邻没有免禁制');
  assert.ok(/function chord/.test(m), '插旗后没有连开');
  assert.ok(/scoreOf\(\)/.test(m) && !/score: elapsed/.test(m), '结算分仍是耗时，破纪录方向是反的');
  assert.ok(!/hard \? 3/.test(m), '还在 ctx.difficulty 上叠 +3，三档会挤成一盘');
  assert.ok(/MINE_GLYPH = '✕'/.test(m) && /FLAG_GLYPH = '⚑'/.test(m), '盘面还在写汉字');
  assert.ok(/不必猜/.test(g) && /连开/.test(g) && /⚑/.test(g), '玩法说明没讲无猜与连开');
  assert.ok(/tanlei: \[/.test(p) && /圆照/.test(p), '阶段新法没登记照影符');
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

check('三套经典玩法落地：注册、黄阶定位、盘面与方向键都接进页面', function () {
  const skills = read('data/skills.js');
  const practice = read('data/practice.js');
  const index = read('minigames/index.js');
  const wxml = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  const guides = read('data/guides.js');
  for (const id of ['lingqi', 'leiyue', 'sanxiu']) {
    const re = new RegExp("id: '" + id + "'[^\\n]*tier: 'huang'");
    assert.ok(re.test(skills), id + ' 没挂黄阶');
  }
  assert.ok(/link: require\('\.\/link\.js'\)/.test(index) && /blocks: require\('\.\/blocks\.js'\)/.test(index)
    && /match: require\('\.\/match\.js'\)/.test(index), '三套新玩法没进注册表');
  assert.ok(/link: '灵纹连线'/.test(practice) && /blocks: '落石垒基'/.test(practice)
    && /match: '三秀同收'/.test(practice), '玩法名没登记');
  assert.ok(/onPad/.test(js) && /data-dir/.test(wxml) && /controller\.move\(dir\)/.test(js), '落石玩法没有方向键');
  assert.ok(/showPad/.test(wxml) && /grid--compact/.test(wxml), '盘面没接矮格与按键台');
  assert.ok(/\blink: \{/.test(guides) && /\bblocks: \{/.test(guides) && /\bmatch: \{/.test(guides), '新玩法没有「怎么玩」说明');
});

check('三连 S 直接晋级：准备页有进度、结算页有回执、指南有专节', function () {
  const js = read('pages/practice/practice.js');
  const wxml = read('pages/practice/practice.wxml');
  const css = read('pages/practice/practice.wxss');
  const guide = read('pages/guide/guide.js');
  const engine = read('utils/game.js');
  assert.ok(/S_STREAK_GOAL = 3/.test(engine) && /sStreakGoal/.test(engine), '内核没有连 S 计数');
  assert.ok(/streakDots/.test(js) && /streakText/.test(js), '准备页没算连 S 进度');
  assert.ok(/class="streak-card/.test(wxml) && /streak-dot--on/.test(wxml), '准备页没画连 S 圆点');
  assert.ok(/\.streak-card/.test(css) && /prefers-color-scheme: dark[\s\S]*\.streak-card/.test(css), '连 S 卡片没有暗色适配');
  assert.ok(/r\.totalGain/.test(js) && /其中直接晋级/.test(js) && /三连圆满 · 晋/.test(js), '结算页没把直接补的那笔讲清');
  assert.ok(/连 S 进度/.test(js) && /sStreakGoal/.test(js), '结算页没写还差几局');
  assert.ok(/title: '六 · 三连 S 直接晋级'/.test(guide) && /连续完成 3 局 S/.test(guide), '指南没有三连 S 专节');
  assert.ok(/title: '十一 · 离线收益的时间'/.test(guide), '新增专节后章节编号没顺延');
});

console.log('\n布局断言全部通过：' + passed + ' 项');
