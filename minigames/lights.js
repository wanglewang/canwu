'use strict';

// 阵灯推演（参悟阵眼 / 阵法·燃灯诀专属）：点一格翻转它和上下左右，让整盘阵灯同时亮起。
//
// 一局是「限时连解」：固定时辰，解亮一盘立刻起下一盘，看这一局能解几盘。
//
// 难度不在盘面大小，在「这一盘最少要几步」——3×3 上最优步数恰好等于需要点几个不同的格子
// （满秩，点集不会互相抵消），所以生成时点 k 个互不相同的格，这盘就一定要 k 步。
// 五档是 2 / 3 / 4 / 5 / 6 步，每档只多一步，但多一步就得多推一层。
//
// 三处压力：
//   1. 一局就是这么多时辰，解一盘换下一盘（破阵那一拍不计时），想得久就解得少；
//   2. 阵眼感应（提示）花三秒，只照出一格，贪提示就少解一盘；
//   3. 大成的「死门」：盘上有一格点不得，点到整盘复位并罚三秒；圆满再加一格。
//      死门先定，再只用「点得动的格子」生成，所以每盘都解得开。
//
// 评级按解开的盘数，档位越高、每盘越慢，达标盘数相应递减。达标盘数表住在
// data/practice.js 的 LIGHTS_TARGETS，准备页与这里共用一份，不各抄一遍。

const C = require('./common.js');

const TICK = 100;
const HINT_COST = 3000;   // 阵眼感应：花三秒
const DEAD_COST = 3000;   // 触死门：罚三秒
// 破阵到换盘之间的停顿。tick() 在 paused 时不扣 timeLeft，所以这一拍是「免费」的：
// 给得够长，玩家才读得完「破阵 · 第 N 盘」、看得见整盘金光；又不占局内时辰。
const RESET_PAUSE = 640;
// 点一格时，被翻的「自己 + 四邻」同步闪一拍：新手最容易卡在不知道哪几格变了。
// 只闪一次、不常驻，动画跑完就收回。
const FLIP_MS = 260;
const BASE_STEPS = 2;     // 参数里没写 steps 时的简单档步数

// 盘面不放汉字：亮 / 灭靠实心与空心圆点 + 底色，死门用叉号与暗红底，三重状态不靠读字。
// 以前亮格写「阵」、暗格写「暗」、死门写「忌」，玩家会把「阵」当成亮 / 灭之外的第三种状态。
const OFF_GLYPH = '○';
const DEAD_GLYPH = '✕';
const HINT_GLYPH = '◎';
const HINT_COST_TEXT = '阵眼感应花 3 秒';

// 返回这一手真正翻到的格子，给「翻转范围微光」用；生成与求解时忽略返回值即可。
function toggle(board, size, index) {
  const r = Math.floor(index / size);
  const c = index % size;
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const hit = [];
  for (let i = 0; i < dirs.length; i += 1) {
    const nr = r + dirs[i][0];
    const nc = c + dirs[i][1];
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      const k = nr * size + nc;
      board[k] = !board[k];
      hit.push(k);
    }
  }
  return hit;
}

function allLit(board) {
  for (let i = 0; i < board.length; i += 1) if (!board[i]) return false;
  return true;
}

// 只允许点在 allowed 里的格子时，求一条解（死门不能点，所以不能用逐行下压那套）。
// 3×3 最多 2^9 次，只在提示时调用。
function solveAllowed(board, size, allowed) {
  const total = 1 << allowed.length;
  for (let mask = 0; mask < total; mask += 1) {
    const b = board.slice();
    const clicks = [];
    for (let i = 0; i < allowed.length; i += 1) {
      if (mask & (1 << i)) { clicks.push(allowed[i]); toggle(b, size, allowed[i]); }
    }
    if (allLit(b)) return clicks;
  }
  return null;
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const stageIdx = typeof perks.tier === 'number' ? perks.tier : 0;
  const theme = ctx.theme || {};
  const depth = typeof p.depth === 'number' ? p.depth : 0;
  const size = Math.min(5, p.size || 3);
  const n = size * size;
  const steps = Math.min(n - 1, p.steps || (BASE_STEPS + depth));
  // 达标盘数由 data/practice.js 的 LIGHTS_TARGETS 按难度档注入；测试探针直接调
  // create 时没带 params，落在简单档（与真源第 0 档同值，不参与正常对局）。
  const target = Array.isArray(p.boardTargets) ? p.boardTargets : [9, 6, 3];
  const deadCount = (function () {
    // 死门 / 双门是「多一格不能碰的」，玩家可以在准备页关掉；
    // 关双门只回到一格死门，关死门才是整盘无死门。
    const off = Array.isArray(perks.offTwists) ? perks.offTwists : [];
    if (off.indexOf('死门') >= 0) return 0;
    const base = stageIdx >= 4 ? 2 : stageIdx >= 3 ? 1 : 0;
    return off.indexOf('双门') >= 0 ? Math.min(base, 1) : base;
  })();

  const duration = Math.round((p.duration || 36) * 1000) + (perks.easy ? 8000 : 0);

  // 代价句由准备页的 method.tip 传进来，局内一直挂在 hint 上。以前 syncHud() 每帧
  // 把它冲成纯计数，玩家整局看不到「触死门要罚 3 秒」；阵眼感应的三秒更是只在按下
  // 之后才补一句。死门未解锁时不提前讲它——那阶段的代价只有阵眼感应。
  const deadCost = ctx.tip || '触死门复位并罚 3 秒';

  const vm = C.makeVm(size, n, '让所有阵灯同时亮起', HINT_COST_TEXT);
  vm.extras.showHint = true;
  vm.scoreText = '已解 0 盘';

  const bag = C.TimerBag();
  let board = new Array(n).fill(true);
  let startBoard = new Array(n).fill(true);
  let dead = [];
  let moves = 0;
  let solved = 0;
  let timeLeft = duration;
  let hintsLeft = 2 + (perks.easy ? 1 : 0);
  let paused = false;
  let done = false;
  let started = false;
  let tickTimer = null;
  let flipSeq = 0;

  function render() { ctx.render(vm); }

  // 收回翻转微光。seq 不匹配说明玩家又点了一格，别把新的一闪清掉。
  // a / b 两个类名交替，连点同一格时 class 真的变了，动画才会重播。
  function clearFlip(seq) {
    if (seq !== flipSeq) return;
    for (let i = 0; i < n; i += 1) {
      vm.cells[i].cls = vm.cells[i].cls.replace(/ cell--flip[ab]/g, '');
    }
  }

  function gradeOf() {
    if (solved >= target[0]) return 'S';
    if (solved >= target[1]) return 'A';
    if (solved >= target[2]) return 'B';
    return 'C';
  }

  function syncTime() {
    // 破阵那一拍仍在展示刚解开的盘，盘号别提前跳到下一盘；换盘后 paused 归 false 才 +1。
    const round = paused ? Math.max(1, solved) : solved + 1;
    vm.timeText = '余 ' + (timeLeft / 1000).toFixed(1) + ' 秒 · 第 ' + round + ' 盘';
    // 「X / N 步」把已走与最优并成一组：最少步数本来只是难度锚点，单独摆出来
    // 玩家会误以为是评级条件；给个对照才知道自己这一盘推得顺不顺。
    vm.goal = timeLeft > 0 ? '解亮 ' + n + ' 盏 · ' + moves + ' / ' + steps + ' 步' : '时辰已尽';
  }

  function syncHud() {
    vm.scoreText = '已解 ' + solved + ' 盘';
    vm.progress = C.pct(solved, target[0]);
    vm.progressText = '已解 ' + solved + ' 盘 · 达标 ' + target[0] + ' 盘';
    vm.gradeNow = gradeOf();
    // 代价常驻：阵眼感应的三秒所有档都讲，死门只有解锁后才讲，计数跟在后面。
    const counts = '可用 ' + hintsLeft + ' 次'
      + (deadCount > 0 ? ' · 死门 ' + deadCount + ' 处' : '');
    vm.hint = vm.costText + (deadCount > 0 ? ' · ' + deadCost : '') + ' · ' + counts;
    syncTime();
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      if (dead.indexOf(i) >= 0) {
        vm.cells[i].cls = board[i] ? 'cell cell--dead cell--dead-lit' : 'cell cell--dead';
        vm.cells[i].label = DEAD_GLYPH;
        vm.cells[i].tone = 0;
        continue;
      }
      vm.cells[i].cls = board[i] ? 'cell cell--lit' : 'cell cell--off';
      vm.cells[i].label = board[i] ? (theme.glyph || '●') : OFF_GLYPH;
      vm.cells[i].tone = 0;
    }
  }

  // 死门先定，再从「点得动的格子」里点 k 个互不相同的格把全亮的阵打乱。
  // 3×3 上点集互不抵消，所以这一盘的最优解就正好是 k 步——难度因此可控。
  // 3×3 之外的点集可能互相抵消，这里用一次穷举核一下，不达标就重来。
  function newBoard() {
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(i);
    C.shuffle(all);
    dead = all.slice(0, deadCount);
    const allowed = all.slice(deadCount);
    const k = Math.min(steps, allowed.length);

    for (let tries = 0; tries < 40; tries += 1) {
      for (let i = 0; i < n; i += 1) board[i] = true;
      const pool = allowed.slice();
      C.shuffle(pool);
      for (let i = 0; i < k; i += 1) toggle(board, size, pool[i]);
      if (allLit(board)) continue;
      if (size === 3) break;
      const best = solveAllowed(board, size, allowed);
      if (best && best.length === k) break;
    }
    startBoard = board.slice();
    moves = 0;
  }

  function nextBoard() {
    flipSeq += 1;   // 上一盘没跑完的微光定时器作废，别清到新盘
    newBoard();
    paused = false;
    // 破阵是一次性高光：换盘把金框收回去，paint() 重置 cls 也会撤掉整盘泛金。
    vm.banner = theme.banner || '';
    vm.status = '第 ' + (solved + 1) + ' 盘 · 让全阵亮起';
    paint();
    syncHud();
    render();
  }

  function finishOnce(summary) {
    if (done) return;
    done = true;
    bag.clear();
    if (tickTimer !== null) { bag.off(tickTimer); tickTimer = null; }
    vm.phase = 'done';
    vm.status = '时辰已尽';
    const grade = gradeOf();
    vm.banner = grade === 'S' ? (theme.praise || '一眼破阵') : '';
    render();
    ctx.finish({ grade: grade, score: solved, summary: summary });
  }

  function tick() {
    tickTimer = null;
    if (done) return;
    if (paused) { tickTimer = bag.after(tick, TICK); return; }
    timeLeft -= TICK;
    if (timeLeft <= 0) {
      timeLeft = 0;
      syncTime();
      render();
      finishOnce('时辰已尽，解亮 ' + solved + ' 盘');
      return;
    }
    syncTime();
    render();
    tickTimer = bag.after(tick, TICK);
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    paint();
    syncHud();
    render();
    tickTimer = bag.after(tick, TICK);
  }

  function onDead(index) {
    flipSeq += 1;
    board = startBoard.slice();
    moves = 0;
    timeLeft = Math.max(0, timeLeft - DEAD_COST);
    C.flash(vm, '触了死门 · 阵盘复位，罚 3 秒', 'bad');
    vm.status = '死门反噬，这一盘从头再来';
    paint();
    syncHud();
    render();
    if (timeLeft <= 0) finishOnce('时辰已尽，解亮 ' + solved + ' 盘');
  }

  function tap(index) {
    if (done || paused || vm.phase !== 'playing') return;
    if (dead.indexOf(index) >= 0) { onDead(index); return; }
    const flipped = toggle(board, size, index);
    moves += 1;
    paint();
    syncHud();
    if (allLit(board)) {
      flipSeq += 1;   // 破阵那一盘不留翻转微光，整盘只走一次性泛金
      solved += 1;
      paused = true;
      // 解开一盘是这一局唯一的高光。以前这一击照样弹「阵灯转明」、只留一行小字，
      // 盘面转眼就换了，玩家常常不知道自己刚破了一阵。现在四路一起给：
      // 金框 banner + 破阵浮字（gold 音与一次中量触感）+ 整盘一次性泛金 + 状态行。
      const word = theme.solved || '破阵';
      vm.status = word + ' · 第 ' + solved + ' 盘 · ' + moves + ' 步';
      vm.banner = word + ' · 已解 ' + solved + ' 盘';
      for (let i = 0; i < n; i += 1) vm.cells[i].cls += ' cell--solved';
      syncHud();
      C.flash(vm, vm.status, 'gold');
      render();
      if (solved >= target[0] + 6) { finishOnce('解亮 ' + solved + ' 盘，阵法已成'); return; }
      bag.after(function () {
        if (done) return;
        nextBoard();
      }, RESET_PAUSE);
      return;
    }
    // 这一手影响到的全部格子同步闪一拍：把「点一格翻五格」画出来，不用回去读规则。
    flipSeq += 1;
    const seq = flipSeq;
    const flipCls = ' cell--flip' + (seq % 2 ? 'a' : 'b');
    for (let i = 0; i < flipped.length; i += 1) vm.cells[flipped[i]].cls += flipCls;
    C.flash(vm, theme.hit || '阵灯转明', 'good');
    render();
    bag.after(function () {
      if (done || seq !== flipSeq) return;
      clearFlip(seq);
      render();
    }, FLIP_MS);
  }

  function hint() {
    if (done || paused || vm.phase !== 'playing') return;
    if (hintsLeft <= 0) {
      C.flash(vm, '阵眼感应已用尽', 'bad');
      render();
      return;
    }
    const allowed = [];
    for (let i = 0; i < n; i += 1) if (dead.indexOf(i) < 0) allowed.push(i);
    const clicks = solveAllowed(board, size, allowed);
    if (!clicks || clicks.length === 0) {
      vm.status = '阵眼已明，直接点完即可';
      render();
      return;
    }
    hintsLeft -= 1;
    timeLeft = Math.max(0, timeLeft - HINT_COST);
    const k = clicks[0];
    const prevCls = vm.cells[k].cls;
    const prevLabel = vm.cells[k].label;
    vm.cells[k].cls = 'cell cell--hint';
    vm.cells[k].label = HINT_GLYPH;
    vm.status = '阵眼感应：这一格该点 · 花去 3 秒';
    syncHud();
    render();
    bag.after(function () {
      if (done) return;
      vm.cells[k].cls = prevCls;
      vm.cells[k].label = prevLabel;
      render();
    }, 1400);
    if (timeLeft <= 0) finishOnce('时辰已尽，解亮 ' + solved + ' 盘');
  }

  newBoard();
  paint();
  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    hint: hint,
    abandon: function () { if (!done) { done = true; bag.clear(); ctx.finish({ grade: 'F', score: solved, summary: '中途收功' }); } },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'lights', name: '阵灯推演', create: create };
