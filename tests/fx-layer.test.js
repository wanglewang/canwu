'use strict';

// 参悟页特效层（pages/practice/fx-layer.js）行为断言：vm 通用信号 → setData 补丁 / 震动 / 音效。
// 它是 2026-11 从 practice.js 拆出来的，拆之前零覆盖——这里用假的 setData / wx 把它跑起来。
// 零依赖，直接 node tests/fx-layer.test.js 即可跑。
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const vibrations = [];
global.wx = {
  vibrateShort: function (o) { vibrations.push(o && o.type); },
};

const visual = require('../data/visual.js');
const sfx = require('../utils/sfx.js');
const minigames = require('../minigames/index.js');
const fxl = require('../pages/practice/fx-layer.js');

// 音效在 node 里没有音频上下文，play 是空转；按名记一笔，好断言「拍子到了响没响」。
const played = [];
sfx.play = function (name) { played.push(name); };
sfx.tone = function () {};

let passed = 0;
function ok(name) { passed += 1; console.log('OK  ' + name); }

function makeLayer() {
  const patches = [];
  let alive = true;
  const fx = fxl.createFxLayer({
    setData: function (p) { patches.push(p); },
    isAlive: function () { return alive; },
  });
  return { fx: fx, patches: patches, kill: function () { alive = false; } };
}

function bareVm() {
  return { cells: [], cols: 4, fx: null, comboText: '', progress: 0, scoreText: '0', gradeNow: 'C' };
}

const NO_SCENE = { sceneOn: false, haptic: {} };

(async function main() {
  // ---- 契约：特效层不认门名，「误判轻震」由玩法模块声明 ----
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'pages', 'practice', 'fx-layer.js'), 'utf8');
    assert.ok(src.indexOf('gameId') < 0, '特效层又按门名（gameId）开分支了：反馈调性应走玩法模块的 haptic 声明');
    assert.strictEqual(typeof minigames.hapticOf, 'function', '注册表没导出 hapticOf');
    assert.deepStrictEqual(minigames.hapticOf('nope'), {}, '没注册的门应返回空调性表');
    const declared = minigames.PRACTICE_GAMES.filter(function (g) { return Object.keys(minigames.hapticOf(g)).length; });
    assert.deepStrictEqual(declared.sort(), ['lights', 'match'], '声明了触感调性的门变了：三连互换 / 阵灯推演是误判轻震的两门');
    for (const g of declared) {
      const h = minigames.hapticOf(g);
      assert.ok(h.bad === 'light' || h.bad === 'medium' || h.bad === 'heavy', g + ' 的 haptic.bad 不是合法档位：' + h.bad);
    }
    ok('特效层不认门名；触感调性由玩法模块声明，注册表只读');
  }

  // ---- 一帧裸 vm：派生字段齐全、各特效列表为空、不震 ----
  {
    const L = makeLayer();
    vibrations.length = 0;
    const vm = bareVm();
    const p = L.fx.frame(vm, { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    assert.strictEqual(p.vm, vm, '补丁里没有原样带回 vm');
    assert.strictEqual(p.chargeWidth, 0);
    assert.deepStrictEqual(p.heartList, []);
    assert.strictEqual(p.meterPercent, 0);
    assert.strictEqual(p.incensePercent, 100);
    assert.deepStrictEqual(p.nextList, []);
    assert.deepStrictEqual(p.holdCells, []);
    assert.deepStrictEqual(p.burstList, []);
    assert.strictEqual(vibrations.length, 0, '没有任何信号却震了');
    assert.strictEqual(p.gradeNowColor, require('../data/world.js').GRADE_COLOR.C);
    ok('裸 vm 一帧：派生字段齐全，无副作用');
  }

  // ---- HUD 派生：蓄力条 / 心 / 计量 / 刀光 / 轨迹 ----
  {
    const L = makeLayer();
    const vm = bareVm();
    vm.charge = { start: 20, end: 70 };
    vm.hearts = { max: 3, value: 2 };
    vm.meter = { value: 3, max: 4 };
    vm.slash = { key: 1, angle: 30 };
    vm.trail = { path: [1, 2, 3, 4, 5] };
    vm.progress = 40;
    const p = L.fx.frame(vm, { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    assert.strictEqual(p.chargeWidth, 50, '蓄力条宽度应是 end - start');
    assert.deepStrictEqual(p.heartList.map(function (h) { return h.on; }), [true, true, false], '心形灯没按 value/max 亮');
    assert.strictEqual(p.meterPercent, 75, '计量条百分比错了');
    assert.strictEqual(p.slashList.length, 1, '有刀光信号却没画');
    assert.strictEqual(p.trailLen, 5, '轨迹长度没带到补丁');
    assert.strictEqual(p.incensePercent, 60, '香火进度应随 progress 递减');
    vm.charge = { start: 80, end: 30 };
    assert.strictEqual(L.fx.frame(vm, { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE).chargeWidth, 0, 'end < start 时应为 0 而不是负数');
    ok('HUD 派生字段：蓄力 / 心灯 / 计量 / 刀光 / 轨迹');
  }

  // ---- 浮字：key 去重、震动分档、爆发等级 ----
  {
    const L = makeLayer();
    vibrations.length = 0;
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    let vm = bareVm();
    vm.fx = { key: 1, tone: 'gold' };
    let p = L.fx.frame(vm, cur, { sceneOn: true, haptic: {} });
    assert.deepStrictEqual(vibrations, ['medium'], '金招应中量震动');
    assert.strictEqual(p.burstList.length, 1);
    assert.strictEqual(p.burstList[0].level, 3, '金招爆发应为 level 3');
    assert.ok(p.burstList[0].dots.length > 0, 'level 3 没有粒子');

    p = L.fx.frame(vm, cur, { sceneOn: true, haptic: {} });
    assert.deepStrictEqual(p.burstList, cur.burstList, '同一个 fx.key 重播了爆发');
    assert.strictEqual(vibrations.length, 1, '同一个 fx.key 震了两次');

    vm = bareVm();
    vm.fx = { key: 2, tone: 'bad' };
    p = L.fx.frame(vm, cur, { sceneOn: true, haptic: {} });
    assert.strictEqual(vibrations.length, 1, '没声明 haptic 的门误判不该震');
    assert.strictEqual(p.burstList[0].level, 0, '误判爆发应为 level 0（miss）');
    assert.strictEqual(p.burstList[0].flash, 'miss');

    vm = bareVm();
    vm.fx = { key: 3, tone: 'bad' };
    p = L.fx.frame(vm, cur, { sceneOn: true, haptic: { bad: 'light' } });
    assert.deepStrictEqual(vibrations.slice(1), ['light'], '声明了 haptic.bad=light 的门误判应轻震');

    vm = bareVm();
    vm.fx = { key: 4, tone: 'good' };
    p = L.fx.frame(vm, cur, { sceneOn: true, haptic: { bad: 'light' } });
    assert.strictEqual(vibrations.length, 2, '正判不该震');
    assert.strictEqual(p.burstList[0].level, 1, '正判爆发应为 level 1');

    // 不在舞台上（准备页 / 弹层）只给声音不给粒子。
    const L2 = makeLayer();
    vm = bareVm();
    vm.fx = { key: 1, tone: 'gold' };
    assert.deepStrictEqual(L2.fx.frame(vm, { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE).burstList, [], '舞台关着还出了粒子');
    ok('浮字信号：key 去重、震动按玩法声明分档、爆发三档');
  }

  // ---- 连击里程碑爆发 ----
  {
    const L = makeLayer();
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    let vm = bareVm();
    vm.comboText = 'x4';
    L.fx.frame(vm, cur, { sceneOn: true, haptic: {} });
    vm = bareVm();
    vm.comboText = 'x5';
    assert.strictEqual(L.fx.frame(vm, cur, { sceneOn: true, haptic: {} }).burstList[0].level, 2, '连击到 5 应出 level 2 爆发');
    vm = bareVm();
    vm.comboText = 'x5';
    assert.deepStrictEqual(L.fx.frame(vm, cur, { sceneOn: true, haptic: {} }).burstList, cur.burstList, '连击没变却重播了爆发');
    vm = bareVm();
    vm.comboText = 'x7';
    assert.deepStrictEqual(L.fx.frame(vm, cur, { sceneOn: true, haptic: {} }).burstList, cur.burstList, '连击 7 不是里程碑');
    ok('连击里程碑（5 / 10 / 20）出 level 2 爆发，且只在变化那一帧');
  }

  // ---- 节律拍子：换拍才响，小节头给重音 ----
  {
    const L = makeLayer();
    played.length = 0;
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    let vm = bareVm();
    vm.beatKey = 1;
    L.fx.frame(vm, cur, NO_SCENE);
    vm = bareVm();
    vm.beatKey = 1;
    L.fx.frame(vm, cur, NO_SCENE);
    vm = bareVm();
    vm.beatKey = 2; vm.beatAccent = true;
    L.fx.frame(vm, cur, NO_SCENE);
    assert.deepStrictEqual(played, ['beat', 'beataccent'], '拍子音没按「换拍才响、小节头重音」走');
    ok('节律拍子：换拍才响，小节头用重音');
  }

  // ---- 收牌迸溅：按格位算坐标、至多两处、同 key 不重播、换局后重播 ----
  {
    const L = makeLayer();
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    let vm = bareVm();
    vm.cells = new Array(12).fill(0).map(function (_, i) { return { tone: (i % 3) + 1 }; });
    vm.cols = 4;
    L.fx.frame(vm, cur, NO_SCENE);   // 先留一帧纹样快照
    vm.cleared = { key: 9, cells: [0, 5, 7, 9] };
    let p = L.fx.frame(vm, cur, NO_SCENE);
    assert.strictEqual(p.sparkList.length, 2, '一次至多画两处迸溅');
    assert.strictEqual(p.sparkList[0].id, '9-0');
    assert.strictEqual(p.sparkList[0].x, '12.50', '第 0 格中心应在 12.5%（4 列）');
    assert.strictEqual(p.sparkList[0].y, '16.67', '第 0 格中心应在 16.67%（3 行）');
    assert.strictEqual(p.sparkList[1].y, '50.00', '第 5 格应在第二行中心');
    assert.strictEqual(p.sparkList[0].dots.length, visual.MOTION.sparkDots, '每处粒子数应取 MOTION.sparkDots');
    assert.ok(p.sparkList[0].color, '迸溅没取到被收走那张牌的纹样色');
    assert.strictEqual(p.sparkList.length * p.sparkList[0].dots.length <= visual.MOTION.particleCap, true, '迸溅粒子超出动效预算');

    vm = bareVm();
    vm.cells = []; vm.cleared = { key: 9, cells: [0] };
    p = L.fx.frame(vm, { burstList: [], sparkList: ['keep'], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    assert.deepStrictEqual(p.sparkList, ['keep'], '同一个 cleared.key 重播了迸溅');

    L.fx.resetRound();
    vm = bareVm();
    vm.cells = new Array(4).fill(0).map(function () { return { tone: 2 }; });
    vm.cols = 2;
    vm.cleared = { key: 9, cells: [1] };
    p = L.fx.frame(vm, { burstList: [], sparkList: ['keep'], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    assert.strictEqual(p.sparkList.length, 1, '换局后同号收牌应重播（游标要归零）');
    assert.strictEqual(p.sparkList[0].x, '75.00');
    ok('收牌迸溅：坐标按盘面算、至多两处、同 key 不重播、换局归零');
  }

  // ---- 探禁盘面反馈：按 type 给配置，未知 type 不画 ----
  {
    const L = makeLayer();
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    let vm = bareVm();
    vm.cells = new Array(36).fill(0); vm.cols = 6;
    vm.mineFx = { key: 3, type: 'strike', index: 8 };
    let p = L.fx.frame(vm, cur, NO_SCENE);
    assert.strictEqual(p.mineFxList.length, 1);
    assert.strictEqual(p.mineFxList[0].type, 'strike');
    // 第 8 格、6 列：行 1 列 2 → x = 2.5/6，y = 1.5/6。
    assert.strictEqual(p.mineFxList[0].x, '41.67');
    assert.strictEqual(p.mineFxList[0].y, '25.00');
    assert.ok(p.mineFxList[0].dots.length > 0, '踩禁应有粒子');
    assert.strictEqual(p.mineFxList[0].ringSize, 92, '6 列时 690/6-6=109 应被 92 封顶');
    vm = bareVm();
    vm.cells = new Array(144).fill(0); vm.cols = 12;
    vm.mineFx = { key: 31, type: 'strike', index: 0 };
    p = L.fx.frame(vm, { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    assert.strictEqual(p.mineFxList[0].ringSize, Math.round(690 / 12) - 6, '12 列时冲击环应按列数缩小，不压住邻格');
    vm = bareVm();
    vm.cells = new Array(36).fill(0); vm.cols = 6;
    vm.mineFx = { key: 4, type: 'flag', index: 99 };
    p = L.fx.frame(vm, cur, NO_SCENE);
    assert.strictEqual(p.mineFxList.length, 1);
    assert.strictEqual(p.mineFxList[0].dots.length, 0, '钉旗只有金圈没有粒子');
    assert.strictEqual(p.mineFxList[0].y, '91.67', '越界下标应夹到最后一格');
    vm = bareVm();
    vm.cells = new Array(36).fill(0);
    vm.mineFx = { key: 5, type: 'nope', index: 0 };
    p = L.fx.frame(vm, { burstList: [], sparkList: [], mineFxList: ['keep'], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    assert.deepStrictEqual(p.mineFxList, ['keep'], '未知 type 不该画，也不该清掉现状');
    ok('探禁反馈：按 type 取配置、下标夹界、未知 type 不画');
  }

  // ---- 落石垒基：暂存格 + 预告、化行闪光 ----
  {
    const L = makeLayer();
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    const piece = { cells: [[0, 0], [0, 1], [1, 0]], tone: 2 };
    let vm = bareVm();
    vm.blocks = { hold: piece, queue: [piece, null], rows: 10 };
    let p = L.fx.frame(vm, cur, NO_SCENE);
    assert.strictEqual(p.nextList.length, 2, '预告块数应等于队列长度');
    assert.strictEqual(p.nextList[0].cells.length, 16, '预告应是 4×4 格');
    assert.strictEqual(p.nextList[0].cells.filter(function (c) { return c.on; }).length, 3, 'L 形应点亮 3 格');
    assert.strictEqual(p.nextList[1].cells.filter(function (c) { return c.on; }).length, 0, '空块应全灭');
    assert.strictEqual(p.holdCells.filter(function (c) { return c.on; }).length, 3);
    vm = bareVm();
    vm.blocks = { rows: 10 };
    vm.linesClear = { key: 2, rows: [3, 9] };
    p = L.fx.frame(vm, cur, NO_SCENE);
    assert.deepStrictEqual(p.lineFlashList.map(function (l) { return l.top; }), ['30.00', '90.00'], '化行闪光 top 应按行号 / 行数');
    assert.deepStrictEqual(p.lineFlashList.map(function (l) { return l.height; }), ['10.00', '10.00']);
    assert.strictEqual(p.nextList.length, 0, '没有预告却摆了块');
    ok('落石垒基：暂存 / 预告 / 化行闪光按行数算');
  }

  // ---- 连连看连线：转折点拆横竖段 ----
  {
    const L = makeLayer();
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    let vm = bareVm();
    vm.cols = 5;
    vm.linkPath = { key: 1, points: [{ r: 0, c: 0 }, { r: 0, c: 3 }, { r: 2, c: 3 }] };
    let p = L.fx.frame(vm, cur, NO_SCENE);
    assert.strictEqual(p.linkPathList.length, 2, '三点的连线应是两段');
    assert.deepStrictEqual(p.linkPathList.map(function (s) { return s.dir; }), ['h', 'v']);
    assert.strictEqual(p.linkPathList[0].len, 60, '横段长度应为 3 格 × 20%');
    assert.strictEqual(p.linkPathList[1].len, 50, '竖段长度应为 2 格 × 25%（默认 4 行）');
    vm = bareVm();
    vm.cols = 5; vm.link = { cols: 5, rows: 8 };
    vm.linkPath = { key: 2, points: [{ r: 0, c: 0 }, { r: 0, c: 3 }, { r: 2, c: 3 }] };
    p = L.fx.frame(vm, cur, NO_SCENE);
    assert.strictEqual(p.linkPathList[1].len, 25, '有 vm.link.rows 时竖段应按它算');
    ok('连连看连线：按转折点拆横竖段，长度按盘面行列算');
  }

  // ---- 撤场：定时到点清数组；destroy 后不再 setData；页面已死不写 ----
  {
    const L = makeLayer();
    const cur = { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] };
    const vm = bareVm();
    vm.cells = new Array(4).fill(0).map(function () { return { tone: 1 }; }); vm.cols = 2;
    vm.cleared = { key: 1, cells: [0] };
    L.fx.frame(vm, cur, NO_SCENE);
    await new Promise(function (r) { setTimeout(r, visual.MOTION.sparkMs + 160); });
    const last = L.patches[L.patches.length - 1];
    assert.deepStrictEqual(last, { sparkList: [] }, '迸溅动画走完没撤节点');

    const L2 = makeLayer();
    const vm2 = bareVm();
    vm2.cells = new Array(4).fill(0).map(function () { return { tone: 1 }; }); vm2.cols = 2;
    vm2.cleared = { key: 1, cells: [0] };
    L2.fx.frame(vm2, { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    const before = L2.patches.length;
    L2.fx.destroy();
    await new Promise(function (r) { setTimeout(r, visual.MOTION.sparkMs + 160); });
    assert.strictEqual(L2.patches.length, before, 'destroy 之后定时器还写了 setData');

    const L3 = makeLayer();
    const vm3 = bareVm();
    vm3.cells = new Array(4).fill(0).map(function () { return { tone: 1 }; }); vm3.cols = 2;
    vm3.cleared = { key: 1, cells: [0] };
    L3.fx.frame(vm3, { burstList: [], sparkList: [], mineFxList: [], linkPathList: [], lineFlashList: [] }, NO_SCENE);
    L3.kill();
    const before3 = L3.patches.length;
    await new Promise(function (r) { setTimeout(r, visual.MOTION.sparkMs + 160); });
    assert.strictEqual(L3.patches.length, before3, '页面已卸载还写了 setData');
    ok('撤场定时器：到点清节点，destroy / 页面卸载后不再写');
  }

  // ---- 教学盘只要声音：不产粒子 ----
  {
    const L = makeLayer();
    played.length = 0;
    const vm = bareVm();
    vm.fx = { key: 1, tone: 'gold' };
    vm.beatKey = 1;
    L.fx.sound(vm);
    assert.deepStrictEqual(played, ['beat'], '教学盘的拍子音没响');
    assert.strictEqual(L.patches.length, 0, '教学盘不该写 setData');
    L.fx.sound(vm);
    assert.strictEqual(played.length, 1, '同一拍在教学盘重播了');
    assert.strictEqual(L.fx.fxKey(), 1);
    ok('教学盘：只出声、不写 setData、同 key 不重播');
  }

  console.log('\nfx-layer.test: ' + passed + ' assertions passed');
  process.exit(0);
})().catch(function (e) {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
