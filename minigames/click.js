'use strict';

// 循光劈刺（基础剑法，旧称「追光点击」）：剑光不再孤立亮在一格，而是一道「剑路」——
// 沿 3×3 剑桩依次掠过 2–4 格，玩家用手指顺着光划过去，才能把它斩落。
//
// 为什么是划不是点：点方块是「打地鼠」，手指不移动、没有方向、没有轨迹，做得再花也只是换皮。
// 改成剑路之后，一次输入有了起手、走势、收势，还能一刀连过数桩，动作感来自操作本身而不是特效。
// 这里刻意不引 canvas：光靠格子按序点亮 + 一道 CSS 白光扫过就能表达「一剑掠过」，
// 页面用 touch 坐标命中预量好的格子矩形，既没有高频 setData，也不破坏统一的 vm.cells 协议。
//
// 保留下来的深度：剑光有寿命（漏了断剑势）、劈空罚一息、5/10/20 连击 ×1.5/×2/×3；
// 每第五道是「金锋」——更长的金色剑路，分翻倍、寿命更短，漏了却不断剑势。
// 五档难度第一次落在「招式长度 / 光掠过的速度」上，不再只是把寿命拧小。

const C = require('./common.js');

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

function nextTier(combo) {
  let out = null;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (TIERS[i].at > combo) out = TIERS[i];
  }
  return out;
}

const EDGE_EVERY = 5;      // 每第五道是金锋
const EDGE_LIFE = 0.8;     // 金锋寿命八折
const EDGE_MULT = 2;       // 金锋得分翻倍
const GAP = 130;           // 斩中之后的后摇，留一口换气

// 一条剑招值多少分：越长越值钱，鼓励追着长招划而不是等短招。
function pointOf(len) { return 8 + 4 * len; }

// 3×3 上所有「直」的剑路（整行 / 整列 / 对角线的连续片段），按长度分组。
// 直线招最好读也最好划，占多数；折线招（游龙）留给长招和后期档位。
function straightForms() {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const out = [];
  for (let l = 0; l < lines.length; l += 1) {
    const line = lines[l];
    for (let i = 0; i < line.length; i += 1) {
      for (let j = i + 2; j <= line.length; j += 1) out.push(line.slice(i, j));
    }
  }
  return out;
}
const STRAIGHTS = straightForms();

function neighbors(i) {
  const r = Math.floor(i / 3);
  const c = i % 3;
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) out.push(rr * 3 + cc);
    }
  }
  return out;
}

// 折线剑路：随机起手，每步走到没走过的邻格；走不通就换一次起手重试。
function wanderPath(len) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const path = [C.randInt(9)];
    while (path.length < len) {
      const cand = C.shuffle(neighbors(path[path.length - 1]).filter(function (n) {
        return path.indexOf(n) < 0;
      }));
      if (!cand.length) break;
      path.push(cand[0]);
    }
    if (path.length === len) return path;
  }
  return [0, 1, 2].slice(0, len);
}

function formOf(len, bent) {
  const straight = STRAIGHTS.filter(function (s) { return s.length === len; });
  if (!bent && straight.length) {
    const pick = straight[C.randInt(straight.length)].slice();
    if (Math.random() < 0.5) pick.reverse();      // 同一招可以正着来，也可以回锋
    return pick;
  }
  return wanderPath(len);
}

// 相邻两步方向变过没有：变过就是折线「游龙」，没变过按首末连线命名。
function isBent(path) {
  if (path.length < 3) return false;
  const dr0 = Math.floor(path[1] / 3) - Math.floor(path[0] / 3);
  const dc0 = (path[1] % 3) - (path[0] % 3);
  for (let i = 2; i < path.length; i += 1) {
    const dr = Math.floor(path[i] / 3) - Math.floor(path[i - 1] / 3);
    const dc = (path[i] % 3) - (path[i - 1] % 3);
    if (dr !== dr0 || dc !== dc0) return true;
  }
  return false;
}

// 白光扫过的角度：用首末两桩的连线，横劈平掠、竖劈直落、斜撩取 ±45°。
function angleOf(path) {
  const a = path[0];
  const b = path[path.length - 1];
  const dr = Math.floor(b / 3) - Math.floor(a / 3);
  const dc = (b % 3) - (a % 3);
  if (!dr) return 0;
  if (!dc) return 90;
  return dr * dc > 0 ? 45 : -45;
}

function nameOf(path, angle) {
  if (isBent(path)) return '游龙';
  if (angle === 0) return '横劈';
  if (angle === 90) return '竖劈';
  if (path.length > 2) return '斜撩';
  return '回锋';
}

// 划过的路径里是否把这一招按顺序走完了。允许反着划（回锋），也允许刀锋多走过几桩。
function containsSeq(hay, needle) {
  for (let s = 0; s + needle.length <= hay.length; s += 1) {
    let ok = true;
    for (let i = 0; i < needle.length; i += 1) {
      if (hay[s + i] !== needle[i]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function matched(path, form) {
  if (!path || !path.length || !form) return false;
  return containsSeq(path, form) || containsSeq(path, form.slice().reverse());
}

// 抚摸层 10px 插值会在格子边界抖出 [0,1,0,1,2] 这样的序列。
// 压成「首次经过」的顺序，既抗抖动，也让「绕盘面乱划一大圈」不能被当成一剑。
function compress(path) {
  const out = [];
  for (let i = 0; i < path.length; i += 1) {
    const v = path[i];
    if (out.length && out[out.length - 1] === v) continue;
    if (out.indexOf(v) >= 0) continue;
    out.push(v);
  }
  return out;
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const duration = Math.max(8, (p.duration || 15) + (perks.easy ? 3 : 0));
  const grid = p.grid || 9;
  const cols = Math.max(1, p.cols || 3);
  const life = Math.max(260, (p.life || 700) + (perks.easy ? 90 : 0));
  const depth = Math.max(0, Math.min(4, p.depth || 0));
  const stepMs = Math.max(72, 126 - depth * 11);   // 光掠过一桩的时间，档位越高越快
  const baseLen = 2 + Math.floor(depth / 2);       // 2 / 2 / 3 / 3 / 4
  const wanderChance = 0.18 + depth * 0.12;        // 折线招随档位变多
  const glyph = theme.glyph || '锋';

  // 门槛按「每秒得分」定，并随档位抬：剑路变长后单招分更高，固定门槛会人人 S、
  // 高难度反而更容易满分。用假时钟标定过：约 220ms / 400ms / 650ms 一剑的
  // 完美玩家分别落在 S / A / B，失误多了才掉到 C。
  const sLimit = Math.ceil(duration * (155 + depth * 20));
  const aLimit = Math.ceil(duration * (68 + depth * 8));
  const bLimit = Math.ceil(duration * (22 + depth * 3));

  const vm = C.makeVm(cols, grid, '凝神，等剑路亮起…', ctx.tip || '顺着剑光划过去，点亮不算');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.trail = null;      // { path, name, angle, gold, on }：当前剑路与光头位置
  vm.slash = null;      // { key, angle }：斩中时扫过盘面的一道白光
  vm.extras.showCombo = true;
  vm.extras.showMeter = true;
  vm.extras.showSwipe = true;

  const bag = C.TimerBag();
  let left = duration;
  let score = 0;
  let hits = 0;
  let missed = 0;
  let maxCombo = 0;
  let combo = 0;
  let spawns = 0;
  let form = null;
  let formGold = false;
  let formLen = 0;
  let busy = false;           // 换气空档，划了不算空劈
  let stepTimer = null;
  let lifeTimer = null;
  let slashSeq = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function paint(index, cls, label, lifeMs, delay) {
    const cell = vm.cells[index];
    if (!cell) return;
    cell.cls = cls;
    cell.label = label;
    cell.life = lifeMs || 0;
    cell.lifeDelay = delay || 0;
  }

  function clearForm() {
    if (!form) return;
    for (let i = 0; i < form.length; i += 1) paint(form[i], 'cell', '');
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
      summary: '斩中 ' + hits + ' · 连击 ' + maxCombo + (missed > 0 ? ' · 漏 ' + missed : ''),
    });
  }

  function stopTimers() {
    if (stepTimer !== null) { bag.off(stepTimer); stepTimer = null; }
    if (lifeTimer !== null) { bag.off(lifeTimer); lifeTimer = null; }
  }

  function lifeMs() { return Math.round(formGold ? life * EDGE_LIFE : life); }

  // 光头沿剑路逐桩掠过：已经走过的留一道浅光痕，当前桩最亮。玩家可以在光流动时就追着划。
  // 寿命线只在光走到收势桩那一刻挂上，避免逐帧重绘把 CSS 动画反复重启。
  function lightStep(n) {
    if (done || !form) return;
    const atEnd = n === form.length - 1;
    for (let i = 0; i < form.length; i += 1) {
      const on = i === n;
      const isLast = i === form.length - 1;
      paint(form[i], 'cell ' + (formGold ? 'cell--pathgold' : 'cell--path') + (on ? ' cell--pathon' : ''),
        i === 0 ? glyph : '', isLast && atEnd ? lifeMs() : 0, 0);
    }
    if (vm.trail) { vm.trail.on = n; render(); }
    if (!atEnd) stepTimer = bag.after(function () { lightStep(n + 1); }, stepMs);
    else {
      stepTimer = null;
      lifeTimer = bag.after(expire, lifeMs());
    }
  }

  function spawn() {
    if (done) return;
    stopTimers();
    clearForm();
    form = null;
    vm.trail = null;
    busy = false;
    spawns += 1;
    formGold = spawns % EDGE_EVERY === 0;
    formLen = Math.min(4, baseLen + (formGold ? 1 : 0));
    // 4 桩在 3×3 上画不出直线，必然是折线；其余按档位概率掺入游龙。
    const bent = formLen >= 4 || Math.random() < wanderChance;
    form = formOf(formLen, bent);
    formLen = form.length;
    const angle = angleOf(form);
    vm.trail = {
      path: form.slice(),
      name: (formGold ? '金锋 · ' : '') + nameOf(form, angle),
      angle: angle,
      gold: formGold,
      on: 0,
    };
    vm.status = formGold ? '金锋游龙，一刀斩尽' : '剑路已起，顺光划过去';
    lightStep(0);
    render();
  }

  function expire() {
    lifeTimer = null;
    if (done || !form || busy) return;
    const wasGold = formGold;
    const path = form.slice();
    for (let i = 0; i < path.length; i += 1) paint(path[i], 'cell cell--faded', '');
    form = null;
    vm.trail = null;
    busy = true;
    missed += 1;
    if (!wasGold) combo = 0;         // 金锋没接住只是白过一手，不断剑势
    C.flash(vm, wasGold ? '金锋溜走' : '漏了一剑', 'bad');
    vm.status = wasGold ? '金锋没接住，稳住' : '慢了一线，剑势散了';
    syncHud();
    render();
    bag.after(spawn, 170);
  }

  function strike() {
    if (!form) return;
    stopTimers();
    const path = form.slice();
    const wasGold = formGold;
    const len = path.length;
    for (let i = 0; i < path.length; i += 1) paint(path[i], 'cell cell--cut', '');
    form = null;
    vm.trail = null;
    busy = true;
    combo += 1;
    hits += 1;
    if (combo > maxCombo) maxCombo = combo;
    const t = tierOf(combo);
    const gain = Math.round(pointOf(len) * (wasGold ? EDGE_MULT : 1) * t.mult);
    score += gain;
    slashSeq += 1;
    vm.slash = null;
    C.flash(vm, (wasGold ? '金锋入手' : (theme.hit || '一剑中的')) + ' +' + gain, wasGold ? 'gold' : 'good');
    vm.status = combo >= 10 ? '剑势正盛，别断' : '好，跟住下一道';
    syncHud();
    render();
    // 下一帧再挂白光，让 wx:key 换节点把扫光动画重播一次。
    bag.after(function () {
      vm.slash = { key: slashSeq, angle: angleOf(path) };
      render();
    }, 16);
    bag.after(function () {
      for (let i = 0; i < path.length; i += 1) {
        if (vm.cells[path[i]] && vm.cells[path[i]].cls === 'cell cell--cut') paint(path[i], 'cell', '');
      }
      render();
    }, 190);
    bag.after(spawn, GAP);
  }

  function whiff() {
    if (!form) return;
    stopTimers();
    const path = form.slice();
    for (let i = 0; i < path.length; i += 1) paint(path[i], 'cell cell--bad', '');
    form = null;
    vm.trail = null;
    busy = true;
    combo = 0;
    missed += 1;
    left = Math.max(0, left - 1);
    C.flash(vm, (theme.miss || '劈空了') + ' · 少一息', 'bad');
    vm.status = '划偏了，剑势散了';
    syncHud();
    render();
    bag.after(function () {
      for (let i = 0; i < path.length; i += 1) {
        if (vm.cells[path[i]] && vm.cells[path[i]].cls === 'cell cell--bad') paint(path[i], 'cell', '');
      }
      render();
    }, 220);
    if (left <= 0) { finish(); return; }
    bag.after(spawn, 170);
  }

  // 划：页面把手指经过的格子序列（已做坐标插值补全）送进来。
  function swipe(path) {
    if (done || vm.phase !== 'playing' || busy || !form) return;
    if (!path || path.length < 2) return;   // 轻点一下不算一剑，也不算劈空
    const trail = compress(path);
    if (trail.length < 2) return;
    // 一剑就是一道轨迹：最多允许多划过一桩，绕一大圈乱划不能白嫖命中。
    if (trail.length > form.length + 1) { whiff(); return; }
    if (matched(trail, form)) { strike(); return; }
    whiff();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '剑路已起，顺光划过去';
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
    swipe: swipe,
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

module.exports = { id: 'click', name: '顺光划斩', create: create };
