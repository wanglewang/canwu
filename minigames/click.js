'use strict';

// 循光劈刺（追光点击 / 基础剑法专属）：剑光在九根剑桩上亮起，细线走完之前劈中它，才算一剑。
// 三处压力让它不只是比手快：
//   1. 剑光有寿命：细线走到底还没劈到就是「漏」，剑势全散，下一道得重新起势；
//   2. 劈空罚一息（与剑诀·断岳同规矩），乱点会把自己点死；
//   3. 剑势越盛，一剑越值钱：5 / 10 / 20 连，得分 ×1.5 / ×2 / ×3，一漏一空尽退回 ×1。
// 每第五道剑光是「金锋」：分高一倍、寿命更短，接住就赚，接不住只是白过一手，不断剑势。
//
// 盘面仍是 3×3 单点，尺寸不随难度变化；五档差异只落在「剑光停留」这一个窗口参数上——
// 它决定你来得及还是来不及，不是把数字拧小一点的那种难度。

const C = require('./common.js');

// 得分阶梯：连击越高，一剑越值钱。
const TIERS = [
  { at: 20, mult: 3, text: '×3' },
  { at: 10, mult: 2, text: '×2' },
  { at: 5, mult: 1.5, text: '×1.5' },
];
const BASE_TIER = { at: 0, mult: 1, text: '×1' };

function tierOf(combo) {
  for (let i = 0; i < TIERS.length; i += 1) {
    if (combo >= TIERS[i].at) return TIERS[i];
  }
  return BASE_TIER;
}

// 离下一阶还差几记，给剑势条用；已到顶返回 null。
function nextTier(combo) {
  let out = null;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (TIERS[i].at > combo) out = TIERS[i];
  }
  return out;
}

const HIT_POINT = 10;
const EDGE_POINT = 20;
const EDGE_EVERY = 5;      // 每第五道剑光是金锋
const EDGE_LIFE = 0.75;    // 金锋寿命是寻常剑光的七五折

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const duration = Math.max(8, (p.duration || 15) + (perks.easy ? 3 : 0));
  const grid = p.grid || 9;
  const cols = Math.max(1, p.cols || 3);
  const life = Math.max(260, (p.life || 700) + (perks.easy ? 90 : 0));
  const gap = 90;                                   // 劈中之后的后摇，留一口换气
  const glyph = theme.glyph || '锋';
  const edgeGlyph = '金';

  // 评级门槛按「每秒得分」推，不写死一套数；时长变了门槛自动跟着走。
  const sLimit = Math.ceil(duration * 47);
  const aLimit = Math.ceil(duration * 20);
  const bLimit = Math.ceil(duration * 6);

  const vm = C.makeVm(cols, grid, '凝神，等剑光亮起…', ctx.tip || '追着剑光劈，劈空少一息');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.extras.showCombo = true;
  vm.extras.showMeter = true;
  vm.goal = C.goalFor('C', sLimit, '分');

  const bag = C.TimerBag();
  let left = duration;
  let score = 0;
  let hits = 0;
  let missed = 0;
  let maxCombo = 0;
  let combo = 0;
  let target = -1;
  let targetEdge = false;
  let spawns = 0;
  let lifeTimer = null;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function paint(index, cls, label, lifeMs) {
    const cell = vm.cells[index];
    if (!cell) return;
    cell.cls = cls;
    cell.label = label;
    cell.life = lifeMs || 0;
    cell.lifeDelay = 0;
  }

  function syncHud() {
    const t = tierOf(combo);
    const nx = nextTier(combo);
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连击 ' + combo : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '分');
    vm.meter = nx
      ? { label: '剑势 ' + t.text, value: combo - t.at, max: nx.at - t.at }
      : { label: '剑势 ' + t.text, value: 1, max: 1 };
  }

  function finish() {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    const grade = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.banner = grade === 'S' ? (theme.praise || '剑随意走') : '';
    vm.gradeNow = grade;
    render();
    ctx.finish({
      grade: grade,
      score: score,
      summary: '命中 ' + hits + ' · 连击 ' + maxCombo + (missed > 0 ? ' · 漏 ' + missed : ''),
    });
  }

  function stopLight() {
    if (lifeTimer !== null) { bag.off(lifeTimer); lifeTimer = null; }
  }

  function pickCell(avoid) {
    let next = C.randInt(grid);
    let guard = 0;
    while (next === avoid && guard < 16) {
      next = C.randInt(grid);
      guard += 1;
    }
    return next;
  }

  function spawn() {
    if (done) return;
    stopLight();
    if (target >= 0) paint(target, 'cell', '');
    target = pickCell(target);
    spawns += 1;
    targetEdge = spawns % EDGE_EVERY === 0;
    const span = targetEdge ? Math.round(life * EDGE_LIFE) : life;
    paint(target, targetEdge ? 'cell cell--edge' : 'cell cell--lit', targetEdge ? edgeGlyph : glyph, span);
    lifeTimer = bag.after(expire, span);
    render();
  }

  function expire() {
    lifeTimer = null;
    if (done || target < 0) return;
    const i = target;
    const wasEdge = targetEdge;
    target = -1;
    targetEdge = false;
    missed += 1;
    paint(i, 'cell cell--faded', '');
    // 金锋没接住只是白过一手，不断剑势；寻常剑光漏了才断。
    if (!wasEdge) combo = 0;
    C.flash(vm, wasEdge ? '金锋溜走' : '漏了一剑', 'bad');
    vm.status = wasEdge ? '金锋没接住，稳住' : '慢了一线，剑势散了';
    syncHud();
    render();
    bag.after(function () {
      if (vm.cells[i] && vm.cells[i].cls.indexOf('cell--faded') >= 0) {
        paint(i, 'cell', '');
        render();
      }
    }, 180);
    bag.after(spawn, 140);
  }

  function strike() {
    stopLight();
    const i = target;
    const wasEdge = targetEdge;
    target = -1;
    targetEdge = false;
    // 先记这一剑，再按新剑势给分：连到第 5 记那一剑就已经值钱了
    combo += 1;
    hits += 1;
    if (combo > maxCombo) maxCombo = combo;
    const t = tierOf(combo);
    const gain = Math.round((wasEdge ? EDGE_POINT : HIT_POINT) * t.mult);
    score += gain;
    paint(i, 'cell cell--hit', '');
    C.flash(vm, (wasEdge ? '金锋入手' : (theme.hit || '一剑中的')) + ' +' + gain, 'good');
    vm.status = combo >= 10 ? '剑势正盛，别断' : '好，跟住它';
    syncHud();
    render();
    bag.after(function () {
      if (vm.cells[i] && vm.cells[i].cls === 'cell cell--hit') {
        paint(i, 'cell', '');
        render();
      }
    }, 150);
    bag.after(spawn, gap);
  }

  function whiff(index) {
    combo = 0;
    missed += 1;
    left = Math.max(0, left - 1);
    paint(index, 'cell cell--bad', '');
    C.flash(vm, (theme.miss || '劈空了') + ' · 少一息', 'bad');
    vm.status = '劈空了，剑势散了';
    syncHud();
    render();
    bag.after(function () {
      if (vm.cells[index] && vm.cells[index].cls === 'cell cell--bad') {
        paint(index, 'cell', '');
        render();
      }
    }, 220);
    if (left <= 0) finish();
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (target < 0) return;                       // 换气空档，点了不算空劈
    if (index === target) { strike(); return; }
    whiff(index);
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '剑光已现，快！';
    vm.banner = theme.banner || '';
    syncHud();
    spawn();
    bag.every(function () {
      left -= 1;
      syncHud();
      if (left <= 0) { finish(); return; }
      render();
    }, 1000);
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () {
      if (done) return;
      done = true;
      bag.clear();
      vm.phase = 'done';
      vm.status = '收功';
      render();
      ctx.finish({ grade: 'F', score: score, summary: '中途收功' });
    },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'click', name: '追光点击', create: create };
