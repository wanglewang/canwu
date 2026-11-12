'use strict';

// 顺光扫斩（基础刀法）：刀光沿刀桩连成一道「刀路」——
// 沿刀桩盘依次掠过 3–5 格，每桩用箭头指出下一桩，玩家顺箭头一刀扫到靶心才算斩中。
//
// 三套难度来源，各管一件事，互不越界：
//   难度档 depth     → 数值：刀路长度、光速、后摇、重斩密度、连击门槛、劈空罚时、评级门槛
//   熟练度阶段 tier  → 规则：大成收势 / 圆满禁桩 / 大圆满双锋
//   兵器 profile     → 形态：轨迹、容差、招式名与称谓
// 这样「档位」只让同一件事变紧，「阶段」才换规则，调数值不会顺手改掉玩法。
//
// 盘面尺寸由 params.grid / cols 决定，生成层不再假设 3×3：换 4×4 只改数据。
//
// 保留下来的深度：刀光有寿命（漏了断刀势）、劈空罚息、5/10/20 起的连击倍率；
// 每第五道（高档更密）是「重斩」——更长的金色刀路，分翻倍、寿命八折，漏了却不断刀势。
// 这里刻意不引 canvas：格子按序点亮 + 一道 CSS 白光扫过就能表达「一刀掠过」。
//
// 判定只认「起手 → 收势」这一个方向：反着划、跳桩、绕一大圈都算违招。
// 规则内的看错（碰到禁桩、划到虚影、收势没停住）只断刀势、不罚息——
// 罚息留给「明知道该怎么划却乱划」，两种失误的代价不该一样。

const C = require('./common.js');
const W = require('../data/weapons.js');

// 连击阶梯：基础 5 / 10 / 20 记。档位越高，每一档再各抬 1 / 2 / 3 记，
// 高档要连得更久才拿得到同样的倍率。
const COMBO_BASE = [
  { at: 20, mult: 3, text: '×3', step: 3 },
  { at: 10, mult: 2, text: '×2', step: 2 },
  { at: 5, mult: 1.5, text: '×1.5', step: 1 },
];
const BASE_TIER = { at: 0, mult: 1, text: '×1' };

const EDGE_LIFE = 0.8;     // 重斩寿命八折
const EDGE_MULT = 2;       // 重斩得分翻倍

// 低档缓入：入门档要留出「看清刀路 → 决定从哪起手 → 划过去」的时间，
// 高档则迅速收回，不拖慢本已变紧的节奏。用比例而不是固定毫秒，
// 剑刀各自的基准速度都能保住自己的比例差。
// 简单档 156 → 343ms/桩（3 桩要走 0.7 秒才亮完，看得清每一步该往哪拐），
// 绝境档仍是 120ms/桩。入门档不是「稍慢一点」，而是慢到能边看边想。
const EASE_STEP = [2.2, 1.45, 1.08, 1.02, 1];
// 接招间隔同样缓入：190 → 418ms，斩完有一拍实打实的喘息。
const EASE_GAP = [2.2, 1.45, 1.08, 1.02, 1];

// 阶段新法：与 data/practice.js 的 STAGE_RULES 一一对应。
const STAGE_HOLD = 3;      // 大成：收势
const STAGE_BAN = 4;       // 圆满：禁桩
const STAGE_DOUBLE = 5;    // 大圆满：双锋
// 收势要在靶心停住的一拍。定 60ms：比一次自然抬手略长，又不至于让「我明明停了」被判失败。
// 真机手感仍需校准，先取宽容的一侧——阶段新法不该变成手感事故。
const HOLD_MS = 60;

function tiersFor(depth) {
  const out = [];
  for (let i = 0; i < COMBO_BASE.length; i += 1) {
    const s = COMBO_BASE[i];
    out.push({ at: s.at + depth * s.step, mult: s.mult, text: s.text });
  }
  return out;
}

function tierAt(tiers, combo) {
  for (let i = 0; i < tiers.length; i += 1) {
    if (combo >= tiers[i].at) return tiers[i];
  }
  return BASE_TIER;
}

function nextAt(tiers, combo) {
  let out = null;
  for (let i = 0; i < tiers.length; i += 1) {
    if (tiers[i].at > combo) out = tiers[i];
  }
  return out;
}

// 一道招值多少分：越长越值钱，鼓励追着长招划而不是等短招。
function pointOf(len) { return 8 + 4 * len; }

// ---------------------------------------------------------------- 盘面形状
// grid 是总格数，cols 是列数；行数由两者推出来。默认 3×3 时行数恰好 3。
function shapeOf(grid, cols) {
  const c = Math.max(2, Math.min(6, cols || 3));
  const n = Math.max(4, grid || c * c);
  const r = Math.max(2, Math.ceil(n / c));
  return { cols: c, rows: r, size: r * c };
}

function neighbors(i, sh) {
  const r = Math.floor(i / sh.cols);
  const c = i % sh.cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < sh.rows && cc >= 0 && cc < sh.cols) out.push(rr * sh.cols + cc);
    }
  }
  return out;
}

// 所有「直」的片段：整行 / 整列 / 两条对角线方向上的连续格，长度 ≥ 3。
// 按形状缓存一次，换盘面尺寸才重算。
const FORM_CACHE = {};
function lineForms(sh) {
  const key = sh.cols + 'x' + sh.rows;
  if (FORM_CACHE[key]) return FORM_CACHE[key];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const out = [];
  for (let r = 0; r < sh.rows; r += 1) {
    for (let c = 0; c < sh.cols; c += 1) {
      for (let d = 0; d < dirs.length; d += 1) {
        const dr = dirs[d][0];
        const dc = dirs[d][1];
        const pr = r - dr;
        const pc = c - dc;
        // 只从一条线的起点起步，避免同一片段被反向重复收一遍。
        if (pr >= 0 && pr < sh.rows && pc >= 0 && pc < sh.cols) continue;
        const line = [];
        let rr = r;
        let cc = c;
        while (rr >= 0 && rr < sh.rows && cc >= 0 && cc < sh.cols) {
          line.push(rr * sh.cols + cc);
          rr += dr;
          cc += dc;
        }
        for (let i = 0; i + 2 < line.length; i += 1) {
          for (let j = i + 2; j < line.length; j += 1) out.push(line.slice(i, j + 1));
        }
      }
    }
  }
  FORM_CACHE[key] = out;
  return out;
}

// 折线路：随机起手，每步走到没走过的邻格；走不通就换一次起手重试。
function wanderPath(len, sh, avoid) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const start = C.randInt(sh.size);
    if (avoid && avoid.indexOf(start) >= 0) continue;
    const path = [start];
    while (path.length < len) {
      const last = path[path.length - 1];
      const cand = C.shuffle(neighbors(last, sh).filter(function (n) {
        return path.indexOf(n) < 0 && (!avoid || avoid.indexOf(n) < 0);
      }));
      if (!cand.length) break;
      path.push(cand[0]);
    }
    if (path.length === len) return path;
  }
  return null;
}

function formOf(len, bent, sh, avoid) {
  if (!bent) {
    const pool = lineForms(sh).filter(function (s) {
      if (s.length !== len) return false;
      if (!avoid) return true;
      for (let i = 0; i < s.length; i += 1) {
        if (avoid.indexOf(s[i]) >= 0) return false;
      }
      return true;
    });
    if (pool.length) {
      const pick = pool[C.randInt(pool.length)].slice();
      // 同一条线允许两个走向；生成时定了向，箭头与判定都只认这一个方向。
      if (Math.random() < 0.5) pick.reverse();
      return pick;
    }
  }
  return wanderPath(len, sh, avoid);
}

// 双锋的虚招：与真路不共用任何一格，起点自然也不同。
// 3×3 上真路占满 5 格时只剩 4 格，所以短一桩也认——两条路不必等长，都能走完就行。
function fakeOf(form, sh) {
  const lens = [];
  if (form.length > 3) lens.push(form.length - 1);
  lens.push(form.length);
  for (let l = 0; l < lens.length; l += 1) {
    for (let t = 0; t < 30; t += 1) {
      const cand = formOf(lens[l], true, sh, form);
      if (cand && cand.length === lens[l]) return cand;
    }
  }
  return null;
}

// 相邻两步方向变过没有：变过就是折线，没变过按首末连线命名。
function isBent(path, cols) {
  if (path.length < 3) return false;
  const dr0 = Math.floor(path[1] / cols) - Math.floor(path[0] / cols);
  const dc0 = (path[1] % cols) - (path[0] % cols);
  for (let i = 2; i < path.length; i += 1) {
    const dr = Math.floor(path[i] / cols) - Math.floor(path[i - 1] / cols);
    const dc = (path[i] % cols) - (path[i - 1] % cols);
    if (dr !== dr0 || dc !== dc0) return true;
  }
  return false;
}

// 白光扫过的角度：用首末两桩的连线，横向平掠、纵向直落、斜向取 ±45°。
function angleOf(path, cols) {
  const a = path[0];
  const b = path[path.length - 1];
  const dr = Math.floor(b / cols) - Math.floor(a / cols);
  const dc = (b % cols) - (a % cols);
  if (!dr) return 0;
  if (!dc) return 90;
  return dr * dc > 0 ? 45 : -45;
}

// 招式是称谓，不是方向指示：往哪划一律看盘面箭头。名字按兵器取，
// 刀法是横劈 / 立劈 / 斜斩 / 游龙；剑 profile 预留的是平削 / 直刺 / 斜挑 / 绕指。
function nameOf(path, angle, cols, profile) {
  if (isBent(path, cols)) return profile.names.bent;
  if (angle === 0) return profile.names.flat;
  if (angle === 90) return profile.names.vertical;
  return profile.names.diagonal;
}

// 相邻两桩的方向角：0° 指上，顺时针递增（45° 一档，八邻格正好覆盖八个方向）。
// 盘面上每根桩都放一个按这个角度旋转的箭头，指下一桩；收势桩放靶心。
function dirAngle(from, to, cols) {
  const dr = Math.floor(to / cols) - Math.floor(from / cols);
  const dc = (to % cols) - (from % cols);
  return (Math.round(Math.atan2(dc, -dr) * 180 / Math.PI) + 360) % 360;
}

// 划过的路径里是否把这一招按顺序走完了。
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
  return containsSeq(path, form);
}

// 抚摸层 10px 插值会在格子边界抖出 [0,1,0,1,2] 这样的序列。
// 压成「首次经过」的顺序，既抗抖动，也让「绕盘面乱划一大圈」不能被当成一刀。
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
  const profile = W.weaponOf(p.weapon);
  const words = profile.words;
  const sh = shapeOf(p.grid, p.cols);
  const grid = sh.size;
  const cols = sh.cols;

  const duration = Math.max(8, (p.duration || 15) + (perks.easy ? 3 : 0));
  const life = Math.max(240, (p.life || 700) + (perks.easy ? 90 : 0));
  const depth = Math.max(0, Math.min(4, p.depth || 0));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;

  // 数值旋钮：全部挂 depth。后摇是刀法唯一能压到「高手也变紧」的速度项，
  // 因为能读图的人会抢在光走完之前划掉，光速与寿命只卡新手。
  const stepMs = Math.max(72, Math.round(profile.stepMs * EASE_STEP[depth]) - depth * profile.stepDecay);
  const baseLen = Math.min(profile.maxLen, profile.baseLen + Math.floor(depth / 2));
  const wanderChance = Math.min(0.9, profile.bentBase + depth * profile.bentStep);
  const gapMs = Math.max(96, Math.round(profile.gap * EASE_GAP[depth]) - depth * 12);
  const edgeEvery = Math.max(3, 5 - Math.floor(depth / 2));
  const whiffCost = depth >= 3 ? 2 : 1;
  const tiers = tiersFor(depth);

  // 规则旋钮：挂熟练度阶段，与档位解耦。
  const holdOn = stage >= STAGE_HOLD;
  const banOn = stage >= STAGE_BAN;
  const doubleOn = stage >= STAGE_DOUBLE;
  const banCount = stage >= STAGE_DOUBLE ? 2 : 1;

  // 门槛按「这一档实际打得出多少分」标定，不按机器人的手速。
  // 一刀 3–5 桩是 20–28 分；简单档光走完就要 686ms、后摇 418ms，一局约 12–14 刀，
  // 连击不断打下来 530 上下，所以 S 定 507、A 385——完美连击才 S，稍一迟疑是 A。
  // 别把 S 定到刚好等于完美分（差 1 分就会变成运气），留 4% 余量。
  // 旧值 155/68/22 是按「每秒 4 刀」配的，15 息要 157 刀，人力根本达不到。
  const sLimit = Math.ceil(duration * (25 + depth * 5) * profile.gradeScale);
  const aLimit = Math.ceil(duration * (19 + depth * 3) * profile.gradeScale);
  const bLimit = Math.ceil(duration * (10 + depth * 2) * profile.gradeScale);

  const vm = C.makeVm(cols, grid, words.ready, ctx.tip || words.tip);
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.trail = null;      // { path, name, angle, gold, on, hold, double, rule }
  vm.slash = null;      // { key, angle }：斩中时掠过盘面的一道白光
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
  let fake = null;
  let bans = [];
  let formGold = false;
  let formLen = 0;
  let busy = false;           // 换气空档，划了不算失手
  let stepTimer = null;
  let lifeTimer = null;
  let slashSeq = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  // arrow：-1 不画箭头，0–359 是「指向下一桩」的角度；end 表示收势桩（画靶心）。
  // endLive 给双锋用：两条路都有靶心，只有会呼吸的那个是真招。
  function paint(index, opt) {
    const cell = vm.cells[index];
    if (!cell) return;
    const o = opt || {};
    cell.cls = o.cls || 'cell';
    cell.label = o.label || '';
    cell.life = o.life || 0;
    cell.lifeDelay = o.delay || 0;
    cell.arrow = typeof o.arrow === 'number' && o.arrow >= 0 ? o.arrow : -1;
    cell.end = !!o.end;
    cell.endLive = !!o.endLive;
  }

  function dropAux() {
    if (fake) {
      for (let i = 0; i < fake.length; i += 1) paint(fake[i], {});
    }
    for (let i = 0; i < bans.length; i += 1) paint(bans[i], {});
    fake = null;
    bans = [];
  }

  function dropForm() {
    if (!form) return;
    for (let i = 0; i < form.length; i += 1) paint(form[i], {});
    form = null;
  }

  function paintAux() {
    for (let i = 0; i < bans.length; i += 1) paint(bans[i], { cls: 'cell cell--ban' });
    if (!fake) return;
    for (let i = 0; i < fake.length; i += 1) {
      const last = i === fake.length - 1;
      paint(fake[i], {
        cls: 'cell cell--pathfake',
        arrow: last ? -1 : dirAngle(fake[i], fake[i + 1], cols),
        end: last,
        endLive: false,
      });
    }
  }

  function ruleText() {
    if (fake) return '认会呼吸的靶心';
    if (holdOn) return '到靶心停一拍再抬手';
    return profile.key === 'sword' ? '反向算刺偏' : '反向算劈空';
  }

  function syncHud() {
    const t = tierAt(tiers, combo);
    const nx = nextAt(tiers, combo);
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连击 ' + combo : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '分');
    vm.meter = nx
      ? { label: words.meter + ' ' + t.text, value: combo - t.at, max: nx.at - t.at }
      : { label: words.meter + ' ' + t.text, value: 1, max: 1 };
  }

  function finish() {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    const grade = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.banner = grade === 'S' ? words.praise : '';
    vm.gradeNow = grade;
    render();
    ctx.finish({
      grade: grade,
      score: score,
      summary: words.summary + ' ' + hits + ' · 连击 ' + maxCombo + (missed > 0 ? ' · 漏 ' + missed : ''),
    });
  }

  function stopTimers() {
    if (stepTimer !== null) { bag.off(stepTimer); stepTimer = null; }
    if (lifeTimer !== null) { bag.off(lifeTimer); lifeTimer = null; }
  }

  function lifeMs() { return Math.round(formGold ? life * EDGE_LIFE : life); }

  // 光头沿刀路逐桩掠过：已经走过的留一道浅光痕，当前桩最亮。玩家可以在光流动时就追着划。
  // 寿命线只在光走到收势桩那一刻挂上，避免逐帧重绘把 CSS 动画反复重启。
  function lightStep(n) {
    if (done || !form) return;
    const atEnd = n === form.length - 1;
    for (let i = 0; i < form.length; i += 1) {
      const on = i === n;
      const isLast = i === form.length - 1;
      paint(form[i], {
        cls: 'cell ' + (formGold ? 'cell--pathgold' : 'cell--path') + (on ? ' cell--pathon' : ''),
        life: isLast && atEnd ? lifeMs() : 0,
        arrow: isLast ? -1 : dirAngle(form[i], form[i + 1], cols),
        end: isLast,
        endLive: isLast && !!fake,
      });
    }
    if (vm.trail) { vm.trail.on = n; render(); }
    if (!atEnd) stepTimer = bag.after(function () { lightStep(n + 1); }, stepMs);
    else {
      stepTimer = null;
      lifeTimer = bag.after(expire, lifeMs());
    }
  }

  function pickBans(n) {
    const used = form ? form.slice() : [];
    if (fake) {
      for (let i = 0; i < fake.length; i += 1) used.push(fake[i]);
    }
    const pool = [];
    for (let i = 0; i < grid; i += 1) {
      if (used.indexOf(i) < 0) pool.push(i);
    }
    C.shuffle(pool);
    return pool.slice(0, Math.min(n, pool.length));
  }

  function spawn() {
    if (done) return;
    stopTimers();
    dropForm();
    dropAux();
    vm.trail = null;
    busy = false;
    spawns += 1;
    formGold = spawns % edgeEvery === 0;
    // 上限跟着 profile 走，刀法的 5 桩长招才不会被写死的 4 截掉。
    formLen = Math.min(profile.maxLen, baseLen + (formGold ? 1 : 0));
    // 4 桩以上在 3×3 上画不出直线，必然是折线；其余按档位概率掺入折线招。
    const bent = formLen >= 4 || Math.random() < wanderChance;
    form = formOf(formLen, bent, sh);
    if (!form) form = formOf(Math.max(3, formLen - 1), true, sh);
    if (!form) form = [0, 1, 2];
    formLen = form.length;
    fake = doubleOn ? fakeOf(form, sh) : null;
    bans = banOn ? pickBans(banCount) : [];
    const angle = angleOf(form, cols);
    vm.trail = {
      path: form.slice(),
      name: (formGold ? profile.edgeName + ' · ' : '') + (fake ? '双锋 · ' : '') + nameOf(form, angle, cols, profile),
      angle: angle,
      gold: formGold,
      on: 0,
      hold: holdOn,
      double: !!fake,
      fake: fake ? fake.slice() : null,
      rule: ruleText(),
    };
    vm.status = formGold ? words.statusGold : words.status;
    if (holdOn) vm.status += words.holdHint;
    paintAux();
    lightStep(0);
    render();
  }

  function expire() {
    lifeTimer = null;
    if (done || !form || busy) return;
    const wasGold = formGold;
    const path = form.slice();
    for (let i = 0; i < path.length; i += 1) paint(path[i], { cls: 'cell cell--faded' });
    form = null;
    dropAux();
    vm.trail = null;
    busy = true;
    missed += 1;
    if (!wasGold) combo = 0;         // 金色长招没接住只是白过一手，不断势
    C.flash(vm, wasGold ? words.missGoldFlash : words.missFlash, 'bad');
    vm.status = wasGold ? words.missGold : words.miss;
    syncHud();
    render();
    bag.after(spawn, 170);
  }

  // weak：收势没停住。仍算斩中，但只给半分、刀势从头起——
  // 学会收势的回报是分数翻倍，不是「不会就归零」。
  function strike(weak) {
    stopTimers();
    const path = form.slice();
    const wasGold = formGold;
    const len = path.length;
    for (let i = 0; i < path.length; i += 1) paint(path[i], { cls: 'cell cell--cut' });
    form = null;
    dropAux();
    vm.trail = null;
    busy = true;
    if (weak) combo = 0;
    combo += 1;
    hits += 1;
    if (combo > maxCombo) maxCombo = combo;
    const t = tierAt(tiers, combo);
    const gain = Math.round(pointOf(len) * (wasGold ? EDGE_MULT : 1) * t.mult * (weak ? 0.5 : 1));
    score += gain;
    slashSeq += 1;
    vm.slash = null;
    C.flash(vm, (weak ? words.unholdHit : (wasGold ? words.hitGold : words.hit)) + ' +' + gain, wasGold && !weak ? 'gold' : 'good');
    vm.status = weak ? words.unhold : (combo >= 3 ? words.chain : words.next);
    syncHud();
    render();
    // 下一帧再挂白光，让 wx:key 换节点把扫光动画重播一次。
    bag.after(function () {
      vm.slash = { key: slashSeq, angle: angleOf(path, cols) };
      render();
    }, 16);
    bag.after(function () {
      for (let i = 0; i < path.length; i += 1) {
        if (vm.cells[path[i]] && vm.cells[path[i]].cls === 'cell cell--cut') paint(path[i], {});
      }
      render();
    }, 190);
    // 连招：连中三记起，下一招不换气，接招间隔压到六成——压力从手指转到读图。
    const useGap = combo >= 3 ? Math.max(72, Math.round(gapMs * 0.55)) : gapMs;
    bag.after(spawn, useGap);
  }

  function whiff() {
    stopTimers();
    const path = form.slice();
    for (let i = 0; i < path.length; i += 1) paint(path[i], { cls: 'cell cell--bad' });
    form = null;
    dropAux();
    vm.trail = null;
    busy = true;
    combo = 0;
    missed += 1;
    left = Math.max(0, left - whiffCost);
    C.flash(vm, words.missWord + ' · 少' + whiffCost + '息', 'bad');
    vm.status = words.whiff;
    syncHud();
    render();
    bag.after(function () {
      for (let i = 0; i < path.length; i += 1) {
        if (vm.cells[path[i]] && vm.cells[path[i]].cls === 'cell cell--bad') paint(path[i], {});
      }
      render();
    }, 220);
    if (left <= 0) { finish(); return; }
    bag.after(spawn, 170);
  }

  // 规则内看错：碰到禁桩、划到虚影、收势没停住。只断刀势，不扣息。
  function reject(word) {
    stopTimers();
    const path = form.slice();
    for (let i = 0; i < path.length; i += 1) paint(path[i], { cls: 'cell cell--bad' });
    form = null;
    dropAux();
    vm.trail = null;
    busy = true;
    combo = 0;
    missed += 1;
    C.flash(vm, word, 'bad');
    vm.status = word;
    syncHud();
    render();
    bag.after(function () {
      for (let i = 0; i < path.length; i += 1) {
        if (vm.cells[path[i]] && vm.cells[path[i]].cls === 'cell cell--bad') paint(path[i], {});
      }
      render();
    }, 220);
    bag.after(spawn, 170);
  }

  // 划：页面把手指经过的格子序列（已做坐标插值补全）送进来。
  // meta.hold 是抬手前在最后一格停住的毫秒数，只有开了收势才判。
  function swipe(path, meta) {
    if (done || vm.phase !== 'playing' || busy || !form) return;
    if (!path || path.length < 2) return;   // 轻点一下不算一招，也不算失手
    const trail = compress(path);
    if (trail.length < 2) return;

    // 禁桩与虚影先判：这两处划过去就已经错了，不必再看后面的序列。
    for (let i = 0; i < bans.length; i += 1) {
      if (trail.indexOf(bans[i]) >= 0) { reject(words.ban); return; }
    }
    if (fake && matched(trail, fake)) { reject(words.fake); return; }

    // 一招就是一道轨迹：刀势允许最多带过两桩，但绕一大圈不能白嫖。
    if (trail.length > form.length + profile.slack) { whiff(); return; }
    if (matched(trail, form)) {
      // 收势：划对了还要在靶心停住一拍；meta 缺省视为已收势，兼容旧调用。
      let weak = false;
      if (holdOn) {
        const hold = meta && typeof meta.hold === 'number' ? meta.hold : HOLD_MS;
        weak = hold < HOLD_MS;
      }
      strike(weak);
      return;
    }
    whiff();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = words.status;
    if (holdOn) vm.status += words.holdHint;
    vm.banner = words.banner;
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

module.exports = { id: 'click', name: '顺光扫斩', create: create };
