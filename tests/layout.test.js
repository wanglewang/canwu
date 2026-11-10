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

check('参悟局内收功移出拇指区且带二次确认', function () {
  const s = read('pages/practice/practice.wxml');
  const js = read('pages/practice/practice.js');
  assert.ok(/class="icon-btn" bindtap="onAbandon"/.test(s), '收功不是独立的小入口');
  const bar = (s.match(/<view[^>]*class="sticky-bar"[\s\S]*?<\/view>/) || [])[0] || '';
  assert.ok(bar.length > 0, '局内缺少吸底辅助操作条');
  assert.ok(!/onAbandon/.test(bar), '收功仍放在拇指热区，容易误触');
  assert.ok(/bindtap="onUndo"/.test(bar) && /bindtap="onHint"/.test(bar), '撤销/提示未移入吸底条');
  assert.ok(/中途收功/.test(js) && /wx\.showModal/.test(js), '收功缺少二次确认');
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

console.log('\n布局断言全部通过：' + passed + ' 项');
