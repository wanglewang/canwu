'use strict';

// 背口诀（记序复现 / 静心诀专属）：口诀次第闪过，按原序点回，比这一局记到第几轮。
//
// 三处压力，让它不只是背题：
//   1. 复述有息数：本轮时限 = 题长 × 每字息数 + 起手半息，题越长给得越多，但永远不够宽裕；
//   2. 点错不致命，罚一息半——乱试会把时间试完，时间见底才折一盏心神；
//   3. 抢记：闪烁时可长按盘面抢先开口，跳过还没闪的部分。倍率看你还敢少看几个字——
//      越早抢越高（最多 ×1.9），一个字都没闪时不许抢，免得误按长按直接送命。
//
// 两条路，自己选：
//   稳 —— 一轮不失误，连对每多一轮 +15% 分（封顶 +45%），失误清零；
//   赌 —— 长按抢记，跳过剩下没闪的字，分再乘 1.2–1.9，赌你记住的够不够。
//
// 熟练度阶段解锁的新法（见 data/practice.js 的 STAGE_RULES）：
//   大成「逆诵」：第 3 轮起，奇轮要从末字往前点；
//   圆满「叠印」：第 5 轮起，口诀里会出现重复的格子（同一格要连点两下）。
//
// 分：每轮 10 × 题长 × 连对加成 × 抢记倍率。S 300 / A 150 / B 60。

const C = require('./common.js');

const TICK = 100;          // 计时粒度
const WRONG_COST = 1500;   // 点错罚一息半
const RUSH_MAX = 1.9;      // 抢记倍率上限：一个字都没闪就抢（不允许）时的理论上限
const RUSH_MIN = 1.2;      // 快要闪完才抢，只剩这点加成
const STREAK_STEP = 0.15;  // 连对每多一轮 +15%
const STREAK_CAP = 0.45;   // 连对加成封顶 +45%
// 「第几轮起」和「哪个段位解锁」是两件事，别用一个常量兼着——
// 上一版 REPEAT_AT = 5 同时当轮次与段位索引，于是准备页在「圆满」就写叠印已解锁
// （STAGE_RULES at:4），进局却要「大圆满」（索引 5）才生效，说了不兑现。
const REVERSE_ROUND = 3;   // 逆诵：第 3 轮起，且只看奇数轮
const REVERSE_TIER = 3;    // 逆诵：大成解锁（TIERS[3]）
const REPEAT_ROUND = 5;    // 叠印：第 5 轮起
const REPEAT_TIER = 4;     // 叠印：圆满解锁（TIERS[4]，与 STAGE_RULES at:4 对齐）
// 评级按「理论满分的百分比」给，不写死分数。
// 高难档轮数多、满分自然高，写死分数会让绝境比简单更容易拿 S。
const GRADE_RATIO = { S: 0.78, A: 0.50, B: 0.26 };

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const stageIdx = typeof perks.tier === 'number' ? perks.tier : 0;
  // 玩家可以在准备页把逆诵 / 叠印关掉，专心练基础记忆。
  // 关掉是「这局不启用」，不是「还没解锁」——两者在提示上要分开。
  const offTwists = Array.isArray(perks.offTwists) ? perks.offTwists : [];
  const reverseOn = stageIdx >= REVERSE_TIER && offTwists.indexOf('逆诵') < 0;
  const repeatOn = stageIdx >= REPEAT_TIER && offTwists.indexOf('叠印') < 0;
  const theme = ctx.theme || {};
  const grid = p.grid || 9;
  const startLen = p.startLen || 2;
  const maxRound = p.maxRound || 7;
  const perNote = Math.max(360, p.msPerNote || 480);
  const flashMs = Math.max(240, (p.flashMs || 560) + (perks.easy ? 80 : 0));
  const gapMs = p.gapMs || 260;
  const glyph = theme.glyph || '诀';
  const maxLives = perks.easy ? 4 : 3;

  const vm = C.makeVm(p.cols || 3, grid, '凝神记住闪过的次序…', ctx.tip || '看清顺序，依次点回去');
  vm.extras.showMeter = true;
  vm.extras.showHearts = true;

  const bag = C.TimerBag();
  let lives = maxLives;
  let sequence = [];
  let inputIndex = 0;
  let round = 1;
  let score = 0;
  let streak = 0;
  let reversed = false;
  let flashed = 0;   // 这一轮已经闪完几个字（抢记时用来算倍率）
  let rushed = false;
  let rushMul = 1;
  let timeLeft = 0;
  let accepting = false;
  let done = false;
  let started = false;
  let flashTimer = null;
  let tickTimer = null;

  vm.hearts = { value: lives, max: maxLives };
  vm.timeText = '第 1 / ' + maxRound + ' 轮';
  vm.scoreText = '得分 0';

  function render() { ctx.render(vm); }

  function roundLen(r) { return Math.min(grid, startLen + r - 1); }

  // 理论满分：一轮不错、连对一路攒满时的总分。实际门槛按它的百分比取。
  const fullScore = (function () {
    let sum = 0;
    for (let r = 1; r <= maxRound; r += 1) {
      const mul = 1 + Math.min(STREAK_CAP, STREAK_STEP * Math.max(0, r - 2));
      sum += 10 * roundLen(r) * mul;
    }
    return Math.round(sum);
  })();
  const sLimit = Math.round(fullScore * GRADE_RATIO.S);
  const aLimit = Math.round(fullScore * GRADE_RATIO.A);
  const bLimit = Math.round(fullScore * GRADE_RATIO.B);

  function roundMs(len) { return 600 + len * perNote; }

  // 连对加成：稳的人靠这个吃饭。第一轮 1.0，每多连一轮 +15%，封顶 +45%。
  function streakMul() {
    return 1 + Math.min(STREAK_CAP, STREAK_STEP * Math.max(0, streak - 1));
  }

  // 抢记倍率：少看几个字就多几分。一个都没看不算（见 longpress）。
  function rushMulOf(seen, len) {
    const raw = 1 + (RUSH_MAX - 1) * (1 - seen / Math.max(1, len));
    return Math.max(RUSH_MIN, Math.min(RUSH_MAX, raw));
  }

  function gradeNow() {
    return C.gradeBy(score, sLimit, aLimit, bLimit);
  }

  function syncHud() {
    vm.timeText = '第 ' + Math.min(round, maxRound) + ' / ' + maxRound + ' 轮' + (reversed ? ' · 逆诵' : '');
    vm.scoreText = '得分 ' + score;
    vm.progress = C.pct(round - 1, maxRound);
    vm.progressText = (round - 1) + ' / ' + maxRound + ' 轮';
    vm.gradeNow = gradeNow();
    vm.comboText = streak >= 2
      ? '连对 ×' + streak + ' · 分 ×' + (streakMul()).toFixed(2)
      : '';
    vm.hearts = { value: lives, max: maxLives };
    const remainScore = (sLimit - score);
    vm.goal = C.goalFor(vm.gradeNow, remainScore, '分');
  }

  function stopTick() {
    if (tickTimer !== null) { bag.off(tickTimer); tickTimer = null; }
  }

  function stopFlash() {
    if (flashTimer !== null) { bag.off(flashTimer); flashTimer = null; }
  }

  function finishOnce(summary, forced) {
    if (done) return;
    done = true;
    bag.clear();
    stopTick();
    stopFlash();
    accepting = false;
    vm.phase = 'done';
    vm.status = '参悟已毕';
    const grade = forced || gradeNow();
    vm.banner = grade === 'S' ? (theme.praise || '倒背如流') : '';
    render();
    ctx.finish({ grade: grade, score: score, summary: summary });
  }

  // ---------------------------------------------------------------- 闪烁
  function flashStep(i) {
    if (done || vm.phase !== 'flashing') return;
    C.clearCells(vm.cells);
    flashed = i;
    if (i >= sequence.length) { beginInput(); return; }
    const idx = sequence[i];
    vm.cells[idx].cls = 'cell cell--lit';
    vm.cells[idx].label = glyph;
    vm.meter = { label: '口诀次第', value: i + 1, max: sequence.length };
    render();
    flashTimer = bag.after(function () {
      flashTimer = null;
      if (done || vm.phase !== 'flashing') return;
      C.clearCells(vm.cells);
      render();
      flashTimer = bag.after(function () { flashTimer = null; flashStep(i + 1); }, gapMs);
    }, flashMs);
  }

  // 轮间预告：逆诵 / 叠印都是「第 N 轮起」生效。等那一轮闪起来才说，玩家第一下
  // 已经点下去了——所以在前一轮结算时就先报出来，让他有整整一个间隙去换脑子。
  function ruleHintFor(r) {
    const out = [];
    if (reverseOn && r === REVERSE_ROUND) out.push('下一轮起逆诵：从末字往前点');
    if (repeatOn && r === REPEAT_ROUND) out.push('下一轮起叠印：同一格要连点两下');
    return out.join(' · ');
  }

  function beginRound() {
    if (done) return;
    const len = roundLen(round);
    reversed = reverseOn && round >= REVERSE_ROUND && round % 2 === 1;
    const allowRepeat = repeatOn && round >= REPEAT_ROUND;
    const picked = [];
    if (allowRepeat) {
      for (let i = 0; i < len; i += 1) picked.push(C.randInt(grid));
    } else {
      const pool = [];
      for (let i = 0; i < grid; i += 1) pool.push(i);
      C.shuffle(pool);
      for (let i = 0; i < len; i += 1) picked.push(pool[i]);
    }
    sequence = picked;
    inputIndex = 0;
    flashed = 0;
    rushed = false;
    rushMul = 1;
    accepting = false;
    vm.phase = 'flashing';
    vm.status = '第 ' + round + ' 轮 · 记住口诀次第';
    // 本轮生效的规则要一直挂着，不能只在开头闪一下：输入阶段才是真正要用它的时候。
    const bannerBits = [];
    if (reversed) bannerBits.push('逆诵：从末字往前');
    if (allowRepeat && round === REPEAT_ROUND) bannerBits.push('叠印：同一格连点两下');
    vm.banner = bannerBits.join(' · ');
    vm.meter = { label: '口诀次第', value: 0, max: len };
    C.clearCells(vm.cells);
    syncHud();
    vm.goal = '长按可抢记 · 少看一字多一成';
    render();
    flashTimer = bag.after(function () { flashTimer = null; flashStep(0); }, 520);
  }

  // ---------------------------------------------------------------- 复述
  function beginInput() {
    if (done) return;
    accepting = true;
    vm.phase = 'input';
    const len = sequence.length;
    timeLeft = roundMs(len);
    vm.status = '请' + (reversed ? '倒着' : '依次') + '点出「' + len + '」字';
    vm.meter = { label: '已复述', value: 0, max: len };
    vm.goal = '余 ' + (timeLeft / 1000).toFixed(1) + ' 息';
    C.clearCells(vm.cells);
    render();
    stopTick();
    tickTimer = bag.after(tick, TICK);
  }

  function tick() {
    tickTimer = null;
    if (done || !accepting) return;
    timeLeft -= TICK;
    if (timeLeft <= 0) {
      timeLeft = 0;
      vm.goal = '息尽';
      render();
      foldRound();
      return;
    }
    vm.goal = '余 ' + (timeLeft / 1000).toFixed(1) + ' 息';
    render();
    tickTimer = bag.after(tick, TICK);
  }

  // 折一盏心神：还有心神就重整这一轮（题长不变），否则收功。
  function foldRound() {
    accepting = false;
    stopTick();
    lives -= 1;
    streak = 0;
    vm.hearts = { value: Math.max(0, lives), max: maxLives };
    vm.comboText = '';
    if (lives <= 0) {
      finishOnce('口诀散在第 ' + round + ' 轮 · 得分 ' + score);
      return;
    }
    vm.status = theme.miss || '气机一乱';
    vm.banner = '';
    C.flash(vm, '折 1 盏心神 · 还剩 ' + lives, 'bad');
    syncHud();
    render();
    bag.after(function () {
      if (done) return;
      // 折了心神不重闪题目：还是这一轮，从头点过——记不住就是记不住。
      C.clearCells(vm.cells);
      inputIndex = 0;
      beginInput();
    }, 700);
  }

  function onWrong(index) {
    timeLeft -= WRONG_COST;
    streak = 0;
    vm.comboText = '';
    vm.cells[index].cls = 'cell cell--bad';
    vm.status = theme.miss || '记岔了一个';
    C.flash(vm, '记岔 · 罚一息半', 'bad');
    if (timeLeft <= 0) { timeLeft = 0; vm.goal = '息尽'; render(); foldRound(); return; }
    vm.goal = '余 ' + (timeLeft / 1000).toFixed(1) + ' 息';
    render();
  }

  function onRight(index) {
    inputIndex += 1;
    vm.cells[index].cls = 'cell cell--ok';
    vm.cells[index].label = glyph;
    vm.meter = { label: '已复述', value: inputIndex, max: sequence.length };
    if (inputIndex >= sequence.length) { completeRound(); return; }
    render();
  }

  function completeRound() {
    accepting = false;
    stopTick();
    const gain = Math.round(10 * sequence.length * streakMul() * (rushed ? rushMul : 1));
    score += gain;
    streak += 1;
    const tag = rushed ? '抢记 ×' + rushMul.toFixed(1) : theme.hit || '口诀无误';
    C.flash(vm, tag + ' +' + gain, 'gold');
    syncHud();
    const nextHint = round < maxRound ? ruleHintFor(round + 1) : '';
    if (nextHint) vm.status = nextHint;
    render();
    if (round >= maxRound) {
      finishOnce(maxRound + ' 轮全过 · 得分 ' + score);
      return;
    }
    // 有预告就把间隙拉长：这行字是给下一轮定心的，一闪而过等于没说。
    bag.after(function () {
      if (done) return;
      round += 1;
      C.clearCells(vm.cells);
      beginRound();
    }, nextHint ? 1500 : 640);
  }

  // ---------------------------------------------------------------- 输入
  function start() {
    if (started) return;
    started = true;
    beginRound();
  }

  function tap(index) {
    if (done || !accepting || vm.phase !== 'input') return;
    const want = reversed ? sequence[sequence.length - 1 - inputIndex] : sequence[inputIndex];
    if (index === want) { onRight(index); return; }
    onWrong(index);
  }

  // 抢记：闪烁时长按盘面，跳过还没闪完的部分，直接开口。
  // 倍率看少看了几个字——越早抢越高，但没看到的字就得靠自己。
  function longpress() {
    if (done || vm.phase !== 'flashing') return;
    // 一个字都还没闪：这不是抢记，是自杀。多半是手按住了屏幕，直接忽略。
    if (flashed <= 0) {
      C.flash(vm, '还没起头 · 先看清头一字', 'bad');
      render();
      return;
    }
    stopFlash();
    rushed = true;
    rushMul = rushMulOf(flashed, sequence.length);
    vm.banner = '抢记 ×' + rushMul.toFixed(1) + ' · 已闪 ' + flashed + ' / ' + sequence.length;
    C.flash(vm, '抢先开口 · 分 ×' + rushMul.toFixed(1), 'gold');
    beginInput();
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    longpress: longpress,
    abandon: function () { finishOnce('中途收功', 'F'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'memory', name: '记序复现', create: create };
