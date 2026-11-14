'use strict';

// 阵灯推演（参悟阵眼 / 阵法·燃灯诀专属）：点一格翻转它和上下左右，把整盘阵灯点亮。
//
// 一局是「一盘推演」：给定一个打乱的局面和步数预算，预算花完还没全亮就是阵溃。
// 以前是限时连解（36 秒内解尽量多盘），但逻辑推演最怕倒计时——想得越久解得越少，
// 玩家被推着乱点而不是推演，而且「限时多做几道题」跟静心诀、三秀诀在品类上几乎同构。
// 换成步数预算后，压力从「快」变成「省」：同样的盘，走得越接近最优，评级越高。
//
// 评级看「已走步数 / 本盘最优步数」：
//   S  正好走最优解，一步没浪费
//   A  多走两步以内
//   B  两倍最优以内
//   C  解开但走了太多步；预算耗尽阵溃则是走火 F（没解开 ≠ 解得糙）
// S 只给没借外力的推演：用一次阵眼感应，或重置过一次阵局，本盘最高只有 A。
// 辅助不是扣分，是让出最高档——两类玩家都能通关，但 S 留着给纯推演。
//
// 求解用 GF(2) 高斯消元 + 零空间枚举，不是 2^n 穷举：4×4 有 16 个变量、5×5 有 25 个，
// 穷举分别要 6.5 万与 3355 万次，生成一盘就卡死；消元是 25³ 量级，基本是瞬时的。
// 顺带解决「生成时保证最优步数」：解出来多长就是多长，不再靠随机点几下碰运气。

const C = require('./common.js');

const FLIP_MS = 260;     // 被翻格的同步微光
const HINT_MS = 1400;    // 感应照出的那一格亮多久
const DEAD_PENALTY = 3;  // 触死门：盘面复位并罚 3 步
const MAX_TRIES = 60;    // 生成时最多重试几次

// 盘面不放汉字：亮 / 灭靠实心与空心圆点 + 底色，死门用叉号与暗红底，三重状态不靠读字。
const OFF_GLYPH = '○';
const DEAD_GLYPH = '✕';
const HINT_GLYPH = '◎';

// ---------------------------------------------------------------- 求解
// 一格影响到的格子（自身 + 上下左右），盘面外的不算。
function effectOf(index, size) {
  const r = Math.floor(index / size);
  const c = index % size;
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const hit = [];
  for (let i = 0; i < dirs.length; i += 1) {
    const nr = r + dirs[i][0];
    const nc = c + dirs[i][1];
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) hit.push(nr * size + nc);
  }
  return hit;
}

// 点一格，返回真正翻到的格子；生成与求解时忽略返回值即可。
function toggleAt(board, size, index) {
  const hit = effectOf(index, size);
  for (let i = 0; i < hit.length; i += 1) board[hit[i]] = !board[hit[i]];
  return hit;
}

function allLit(board) {
  for (let i = 0; i < board.length; i += 1) if (!board[i]) return false;
  return true;
}

// 只允许点 allowed 里的格子时，求步数最少的一条解；无解返回 null。
// 每格的「要翻奇数次还是偶数次」是 GF(2) 上的线性方程，消元后零空间里挑权重最小的一个。
function solve(board, size, allowed) {
  const n = board.length;
  const vars = allowed.length;
  if (!vars) return allLit(board) ? [] : null;

  const effect = [];
  for (let j = 0; j < vars; j += 1) effect.push(effectOf(allowed[j], size));

  // 第 i 行：哪些变量会翻到格子 i；右端：格子 i 现在是灭的就要被翻奇数次。
  const rows = new Array(n).fill(0);
  const rhs = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let mask = 0;
    for (let j = 0; j < vars; j += 1) {
      if (effect[j].indexOf(i) >= 0) mask |= (1 << j);
    }
    rows[i] = mask;
    rhs[i] = board[i] ? 0 : 1;
  }

  const where = new Array(vars).fill(-1);
  let pr = 0;
  for (let col = 0; col < vars && pr < n; col += 1) {
    let sel = -1;
    for (let r = pr; r < n; r += 1) {
      if ((rows[r] >>> col) & 1) { sel = r; break; }
    }
    if (sel < 0) continue;
    const tm = rows[pr]; rows[pr] = rows[sel]; rows[sel] = tm;
    const tb = rhs[pr]; rhs[pr] = rhs[sel]; rhs[sel] = tb;
    for (let r = 0; r < n; r += 1) {
      if (r !== pr && ((rows[r] >>> col) & 1)) {
        rows[r] ^= rows[pr];
        rhs[r] ^= rhs[pr];
      }
    }
    where[col] = pr;
    pr += 1;
  }
  // 消完还剩「0 = 1」，这盘在这一组可点格里无解。
  for (let r = pr; r < n; r += 1) if (rows[r] === 0 && rhs[r] === 1) return null;

  const free = [];
  for (let c = 0; c < vars; c += 1) if (where[c] < 0) free.push(c);

  let best = null;
  let bestW = Infinity;
  const total = 1 << free.length;
  for (let m = 0; m < total; m += 1) {
    const x = new Array(vars).fill(0);
    for (let c = 0; c < vars; c += 1) if (where[c] >= 0) x[c] = rhs[where[c]];
    for (let k = 0; k < free.length; k += 1) {
      if (!((m >>> k) & 1)) continue;
      const f = free[k];
      x[f] ^= 1;
      for (let c = 0; c < vars; c += 1) {
        if (where[c] >= 0 && ((rows[where[c]] >>> f) & 1)) x[c] ^= 1;
      }
    }
    let w = 0;
    for (let c = 0; c < vars; c += 1) w += x[c];
    if (w < bestW) { bestW = w; best = x; }
  }
  if (!best) return null;
  const clicks = [];
  for (let c = 0; c < vars; c += 1) if (best[c]) clicks.push(allowed[c]);
  return clicks;
}

// ---------------------------------------------------------------- 首局手把手
// 新手引导不做「先读三页再玩」的弹窗：直接把玩家放到一盘两步就能解的小阵上。
// 第一手让他看见「点一格，自己和四邻一起翻」，第二手让他看见「刚翻暗的四邻又回来」——
// 这两手就是这一门的全部规则，比任何一段解释都快。
//
// 教学盘与真实对局同构（同样 3×3、同样 ● / ○、同样点哪翻哪），所以手感能直接迁移；
// 但它不计步、不结算、不进纪录、不进连 S——教学不是一局，输赢都不该写进存档。
// 只有一门功法第一次开局会进，跳过或走完都算「看过」，之后不再出现。
const TEACH_SIZE = 3;
// 两步解：先点正中（真的翻五格），再点左上（角上只翻三格）。顺序不能反——
// 第一手必须让玩家看见「五格同时变」，第二手顺手把「边角翻得少」也教了。
// 初始盘 = 全亮反推这两手，正好只剩四盏灭（先点后点都一样，翻面是可交换的）。
const TEACH_STEPS = [4, 0];
const TEACH_TEXT = [
  '点亮正中这一格 · 它和上下左右五格一起翻面',
  '再点左上 · 刚被翻暗的两邻一起回来',
];
const TEACH_DONE = '五格与三格都翻过 · 全阵亮起即破阵';
const TEACH_HOLD_MS = 900;   // 全亮后停一拍，让玩家看清结果再进正式局

function teachBoard() {
  const n = TEACH_SIZE * TEACH_SIZE;
  const b = new Array(n).fill(true);
  toggleAt(b, TEACH_SIZE, TEACH_STEPS[0]);
  toggleAt(b, TEACH_SIZE, TEACH_STEPS[1]);
  return b;
}

// 独立于对局的小控制器：接口与真局一致（start / tap / destroy），页面不必分两套写法。
function createTeach(ctx) {
  const theme = ctx.theme || {};
  const n = TEACH_SIZE * TEACH_SIZE;
  const board = teachBoard();
  let step = 0;
  let done = false;
  let timer = null;

  const vm = C.makeVm(TEACH_SIZE, n, '教学 · 让全阵亮起', '点一格会翻它和上下左右');
  vm.phase = 'playing';
  vm.tutorial = true;
  vm.teachTotal = TEACH_STEPS.length;
  // 教学中没有「步数」，也不该出现评级徽章与进度条：那些是正式局才有的压力。
  vm.extras.showHint = false;
  vm.extras.showReset = false;
  vm.extras.showGradeNow = false;
  vm.extras.showProgress = false;
  vm.timeText = '教学 · 不计步';

  function litCount() {
    let k = 0;
    for (let i = 0; i < n; i += 1) if (board[i]) k += 1;
    return k;
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      vm.cells[i].cls = board[i] ? 'cell cell--lit' : 'cell cell--off';
      vm.cells[i].label = board[i] ? (theme.glyph || '●') : OFF_GLYPH;
      vm.cells[i].tone = 0;
    }
    // 该点的那一格自己会呼吸：不写「点这里」，也让玩家一眼知道下一手在哪。
    if (!done) vm.cells[TEACH_STEPS[step]].cls += ' cell--teach-next';
  }

  function sync() {
    const lit = litCount();
    vm.teachStep = Math.min(step + 1, TEACH_STEPS.length);
    vm.teachText = done ? TEACH_DONE : TEACH_TEXT[step];
    vm.goal = '教学 · 第 ' + vm.teachStep + ' / ' + TEACH_STEPS.length + ' 步';
    vm.progress = C.pct(lit, n);
    vm.progressText = '已亮 ' + lit + ' / ' + n + ' 盏';
    vm.status = vm.teachText;
    vm.scoreText = '教学中';
    vm.banner = '';
  }

  paint();
  sync();
  ctx.render(vm);

  return C.fillController({
    start: function () { /* 教学盘开局即已摆好，不需要再起手 */ },
    tap: function (index) {
      if (done) return;
      if (index !== TEACH_STEPS[step]) {
        vm.teachText = '先点那一格 · 它正在呼吸';
        C.flash(vm, '先点发光的那一格', 'bad');
        ctx.render(vm);
        return;
      }
      toggleAt(board, TEACH_SIZE, index);
      step += 1;
      if (step >= TEACH_STEPS.length) {
        done = true;
        paint();
        sync();
        C.flash(vm, TEACH_DONE, 'gold');
        ctx.render(vm);
        // 停一拍再进正式局：全亮的那个画面本身就是「破阵是什么样」的答案。
        timer = setTimeout(function () {
          timer = null;
          ctx.done();
        }, TEACH_HOLD_MS);
        return;
      }
      paint();
      sync();
      C.flash(vm, step === 1 ? '一次翻了五盏 · 亮暗同时变' : '四邻一起回来', 'good');
      ctx.render(vm);
    },
    destroy: function () {
      done = true;
      if (timer) { clearTimeout(timer); timer = null; }
    },
  });
}

const teach = {
  size: TEACH_SIZE,
  steps: TEACH_STEPS.slice(),
  texts: TEACH_TEXT.slice(),
  doneText: TEACH_DONE,
  board: teachBoard,
  create: createTeach,
};

// ---------------------------------------------------------------- 对局
function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const stageIdx = typeof perks.tier === 'number' ? perks.tier : 0;
  const theme = ctx.theme || {};

  // 盘面规格与步数预算由 data/practice.js 的 LIGHTS_LEVELS 按难度档注入。
  // 测试探针直接调 create 时没带 params，落在简单档。
  const size = Math.max(3, Math.min(5, p.size || 3));
  const n = size * size;
  const minSteps = Math.max(1, Math.min(n, p.minSteps || 2));
  const capSteps = Math.max(minSteps + 3, Math.min(40, p.capSteps || minSteps * 3));

  const deadCount = (function () {
    // 死门 / 双门是「多一格不能碰的」，玩家可以在准备页关掉；
    // 关双门只回到一格死门，关死门才是整盘无死门。
    const off = Array.isArray(perks.offTwists) ? perks.offTwists : [];
    if (off.indexOf('死门') >= 0) return 0;
    const base = stageIdx >= 4 ? 2 : stageIdx >= 3 ? 1 : 0;
    return off.indexOf('双门') >= 0 ? Math.min(base, 1) : base;
  })();

  const deadCost = ctx.tip || '';
  const vm = C.makeVm(size, n, '让所有阵灯同时亮起', '阵眼感应 · 用后本盘最高 A');
  vm.extras.showHint = true;
  vm.extras.showReset = true;

  let board = new Array(n).fill(true);
  let startBoard = new Array(n).fill(true);
  let dead = [];
  let optimal = minSteps;
  let moves = 0;
  let hintUsed = false;
  let resetUsed = false;
  let failed = false;
  let done = false;
  let started = false;
  let flipSeq = 0;

  function render() { ctx.render(vm); }

  function clearFlip(seq) {
    if (seq !== flipSeq) return;
    for (let i = 0; i < n; i += 1) {
      vm.cells[i].cls = vm.cells[i].cls.replace(/ cell--flip[ab]/g, '');
    }
  }

  function litCount() {
    let k = 0;
    for (let i = 0; i < n; i += 1) if (board[i]) k += 1;
    return k;
  }

  // 评级只认「走了几步」，不认时间：推演类玩法不该因为想得久而被扣。
  // 借过外力（感应 / 重置）就封顶到 A——S 是同一条推演路径上一步没浪费的结果。
  function gradeOf() {
    // 阵溃不是「解得糙」，是没解开：走火（F），和「步数超了两倍」这种 C 分开算。
    if (failed) return 'F';
    let g;
    if (moves <= optimal) g = 'S';
    else if (moves <= optimal + 2) g = 'A';
    else if (moves <= optimal * 2) g = 'B';
    else g = 'C';
    if (g === 'S' && (hintUsed || resetUsed)) return 'A';
    return g;
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

  function syncHud() {
    const left = Math.max(0, capSteps - moves);
    const lit = litCount();
    vm.timeText = '余 ' + left + ' 步';
    vm.progress = C.pct(lit, n);
    vm.progressText = '已亮 ' + lit + ' / ' + n + ' 盏';
    vm.goal = '已亮 ' + lit + ' / ' + n + ' 盏 · 已走 ' + moves + ' 步 · 最优 ' + optimal + ' 步';
    vm.scoreText = '已走 ' + moves + ' 步';
    vm.gradeNow = gradeOf();
    // 代价常驻：阵眼感应与步数预算所有档都讲，死门只有解锁后才讲。
    vm.hint = vm.costText + ' · 最优 ' + optimal + ' 步 · 预算 ' + capSteps + ' 步'
      + (deadCount > 0 ? ' · ' + deadCost + ' · 死门 ' + deadCount + ' 处' : '');
  }

  // 从全亮出发只点「点得动的格」把阵打乱，再解一遍，解出来多长就是这盘的最优步数。
  // 太短（白送）或太长（预算不够）就重来，所以每盘的难度大致落在 minSteps 附近。
  function newBoard() {
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(i);
    C.shuffle(all);
    dead = all.slice(0, deadCount);
    const allowed = all.slice(deadCount);
    const hi = Math.min(minSteps + 2, capSteps - 3, allowed.length);
    const lo = Math.max(1, Math.min(minSteps, hi));

    let picked = null;
    for (let tries = 0; tries < MAX_TRIES; tries += 1) {
      const k = lo + Math.floor(Math.random() * (hi - lo + 1));
      const b = new Array(n).fill(true);
      const pool = allowed.slice();
      C.shuffle(pool);
      for (let i = 0; i < k && i < pool.length; i += 1) toggleAt(b, size, pool[i]);
      if (allLit(b)) continue;
      const sol = solve(b, size, allowed);
      if (!sol) continue;
      if (sol.length < lo || sol.length > hi) continue;
      picked = { board: b, steps: sol.length };
      break;
    }
    if (!picked) {
      // 兜底：放宽区间，也要给出一盘能解的，绝不把无解盘面丢给玩家。
      for (let tries = 0; tries < MAX_TRIES && !picked; tries += 1) {
        const b = new Array(n).fill(true);
        const pool = allowed.slice();
        C.shuffle(pool);
        toggleAt(b, size, pool[0]);
        const sol = solve(b, size, allowed);
        if (sol && sol.length > 0) picked = { board: b, steps: sol.length };
      }
    }
    if (!picked) {
      // 理论上到不了这里；真到了就退回「全亮盘 + 点一下」，保证有解。
      const b = new Array(n).fill(true);
      toggleAt(b, size, allowed[0]);
      picked = { board: b, steps: 1 };
    }
    board = picked.board.slice();
    startBoard = board.slice();
    optimal = picked.steps;
    moves = 0;
    hintUsed = false;
    resetUsed = false;
    failed = false;
    vm.banner = theme.banner || '';
    vm.status = '第 ' + (size) + '×' + size + ' 盘 · 让全阵亮起';
  }

  // 结算不只报一个字母：玩家最想知道的是「我为什么不是 S」。
  // 评级只看步数，所以就把「走了几步 / 最优几步 / 差在哪」直接写出来，
  // 用了辅助也如实说是辅助封的顶，而不是让玩家以为自己推错了。
  function gradeNotes() {
    const notes = [];
    if (failed) {
      notes.push('阵溃：' + capSteps + ' 步预算走完，阵还没全亮。');
      notes.push('这一盘最优只要 ' + optimal + ' 步；下一局先想好要动哪几格，别一格一格试。');
      return notes;
    }
    const gap = moves - optimal;
    if (gap <= 0) {
      notes.push('正好走最优 ' + optimal + ' 步，一步没浪费。');
    } else if (gap <= 2) {
      notes.push('比最优多走 ' + gap + ' 步（最优 ' + optimal + ' 步）· S 要一步不差。');
    } else if (moves <= optimal * 2) {
      notes.push('走了 ' + moves + ' 步，最优 ' + optimal + ' 步 · A 线是多两步以内。');
    } else {
      notes.push('走了 ' + moves + ' 步，超过最优的两倍（' + optimal * 2 + ' 步）。');
    }
    if (hintUsed) notes.push('用过阵眼感应，本盘最高只到 A。');
    if (resetUsed) notes.push('重置过阵局，本盘最高只到 A。');
    return notes;
  }

  function finish(summary) {
    if (done) return;
    done = true;
    vm.phase = 'done';
    vm.status = failed ? '阵溃' : '破阵';
    const grade = gradeOf();
    vm.banner = grade === 'S' ? (theme.praise || '一眼破阵') : '';
    render();
    const score = failed ? 0 : Math.max(0, capSteps - moves) * 10;
    ctx.finish({ grade: grade, score: score, summary: summary, notes: gradeNotes() });
  }

  function checkFail() {
    if (done) return false;
    if (moves >= capSteps && !allLit(board)) {
      failed = true;
      // 阵溃是这一局唯一的负向结算，给一拍浮字，别让玩家只看到弹层才知道步数没了。
      C.flash(vm, '步数用尽 · 阵溃', 'bad');
      finish('步数用尽，阵溃');
      return true;
    }
    return false;
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    paint();
    syncHud();
    render();
  }

  function flashSolved() {
    const word = theme.solved || '破阵';
    vm.status = word + ' · ' + moves + ' 步 · 最优 ' + optimal + ' 步';
    vm.banner = word + ' · ' + moves + ' 步';
    for (let i = 0; i < n; i += 1) vm.cells[i].cls += ' cell--solved';
    syncHud();
    C.flash(vm, vm.status, 'gold');
    render();
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (dead.indexOf(index) >= 0) {
      // 死门在步数制下的代价是「罚 3 步」，不是罚时间：时间已经不参与评级了。
      moves += DEAD_PENALTY;
      board = startBoard.slice();
      flipSeq += 1;
      paint();
      syncHud();
      C.flash(vm, '触了死门 · 阵盘复位，罚 ' + DEAD_PENALTY + ' 步', 'bad');
      vm.status = '死门反噬，这一盘从头再来';
      render();
      checkFail();
      return;
    }
    const flipped = toggleAt(board, size, index);
    moves += 1;
    paint();
    syncHud();
    if (allLit(board)) {
      flipSeq += 1;
      flashSolved();
      finish('解亮 ' + n + ' 盏 · 用 ' + moves + ' 步（最优 ' + optimal + ' 步）');
      return;
    }
    if (checkFail()) return;
    flipSeq += 1;
    const seq = flipSeq;
    const flipCls = ' cell--flip' + (seq % 2 ? 'a' : 'b');
    for (let i = 0; i < flipped.length; i += 1) vm.cells[flipped[i]].cls += flipCls;
    C.flash(vm, theme.hit || '阵灯转明', 'good');
    render();
    setTimeout(function () {
      if (done || seq !== flipSeq) return;
      clearFlip(seq);
      render();
    }, FLIP_MS);
  }

  // 阵局回到开局，步数清零但本盘封顶到 A：容错是给推演走死的人一条退路，
  // 不是免费重抽——不封顶的话，重置一次就能把「最优解」重刷成想要的步数。
  function reset() {
    if (done || vm.phase !== 'playing') return;
    flipSeq += 1;
    board = startBoard.slice();
    moves = 0;
    resetUsed = true;
    paint();
    syncHud();
    vm.status = '阵局已复位 · 本盘最高 A';
    C.flash(vm, '阵局复位 · 本盘最高 A', 'good');
    render();
  }

  function hint() {
    if (done || vm.phase !== 'playing') return;
    const allowed = [];
    for (let i = 0; i < n; i += 1) if (dead.indexOf(i) < 0) allowed.push(i);
    const clicks = solve(board, size, allowed);
    if (clicks && clicks.length === 0) {
      vm.status = '阵眼已明，全阵已亮';
      render();
      return;
    }
    if (!clicks) {
      C.flash(vm, '此局无解，请重置阵局', 'bad');
      render();
      return;
    }
    hintUsed = true;
    const k = clicks[0];
    const prevCls = vm.cells[k].cls;
    const prevLabel = vm.cells[k].label;
    vm.cells[k].cls = 'cell cell--hint';
    vm.cells[k].label = HINT_GLYPH;
    vm.status = '阵眼感应：这一格该点 · 本盘最高 A';
    syncHud();
    render();
    setTimeout(function () {
      if (done) return;
      vm.cells[k].cls = prevCls;
      vm.cells[k].label = prevLabel;
      render();
    }, HINT_MS);
  }

  newBoard();
  paint();
  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    hint: hint,
    reset: reset,
    abandon: function () {
      if (!done) {
        done = true;
        ctx.finish({ grade: 'F', score: 0, summary: '中途收功' });
      }
    },
  });
}

function lines() {
  return {
    rule: '按已走步数与最优步数比（不论用时，想得久不扣）',
    items: ['S：正好最优步数', 'A：多 2 步以内', 'B：不超过最优的两倍', '其余为 C',
      '用过阵眼感应或重置本盘，最高只到 A'],
    fail: '步数预算走完阵还没全亮（阵溃）→ 走火 F，这一局没有收益',
  };
}

module.exports = {
  id: 'lights',
  name: '阵灯推演',
  create: create, lines: lines,
  solve: solve,
  effectOf: effectOf,
  teach: teach,
};
