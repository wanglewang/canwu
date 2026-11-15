'use strict';

// 阵灯推演（参悟阵眼 / 阵法·点灯破阵诀专属）：点一格翻转它和上下左右，把整盘阵灯点亮。
//
// 一局是「一盘推演」：给定一个打乱的局面和步数余量，余量花完还没全亮就是阵溃。
// 以前是限时连解（36 秒内解尽量多盘），但逻辑推演最怕倒计时——想得越久解得越少，
// 玩家被推着乱点而不是推演，而且「限时多做几道题」跟静心记诵诀、三秀连收诀在品类上几乎同构。
// 换成步数后，压力从「快」变成「省」：同样的盘，走得离最优越近，评级越高。
//
// 评级看「比本盘最优多走几步」（冗余手数 = 已走 − 最优），不看倍数：
//   S  冗余 0 手，一步没浪费
//   A  冗余 2 手以内
//   B  冗余 5 手以内（= 余量 − 2）
//   C  解开了，但冗余超过 B 线；冗余满余量还没全亮则是阵溃 F（没解开 ≠ 解得糙）
//
// 为什么不用「倍数最优」：3×3 上最优 2 步的盘，A 线（最优 + 2）与 B 线（2 × 最优）会重合成
// 同一条线，B 档在一整档里根本不存在；而 5×5 上最优 5 步的盘，B 线宽到 10 步、C 线只剩
// 十一二步那两格。同一把尺子在不同盘上量出三种形状，玩家感到的是「抽到哪盘」而不是
// 「我走得多省」。换成绝对冗余手数之后，五档的宽窄在每一档都一样（0 / 2 / 3 / 2）。
//
// 辅助不「只封顶、不折步」：阵眼感应每看一眼算 2 步，复原本局每局只许一次。
// 旧规则（感应免费 + 封顶 A）制造了一个反向激励——诚实走过 3 步冗余只能拿 B（×1.0），
// 而用感应抄答案反而保底 A（×1.2）：辅助不是让出最高档，而是比诚实犯错更划算。
// 现在辅助落在同一把尺子上（花步数），花几次就掉几档，看满一手就阵溃。
//
// 求解用 GF(2) 高斯消元 + 零空间枚举，不是 2^n 穷举：4×4 有 16 个变量、5×5 有 25 个，
// 穷举分别要 6.5 万与 3355 万次，生成一盘就卡死；消元是 25³ 量级，基本是瞬时的。
// 顺带解决「生成时保证最优步数」：解出来多长就是多长，不靠随机点几下碰运气。

const C = require('./common.js');

const FLIP_MS = 260;     // 被翻格的同步微光
const HINT_MS = 1400;    // 感应照出的那一格亮多久
const HINT_COST = 2;     // 感应照一眼算 2 步：辅助与走错落在同一把尺子上
const DEAD_PENALTY = 2;  // 触死门：这一手不生效，罚 2 步（不复位整盘）
const RESET_LIMIT = 1;   // 复原本局每局只许一次
const MAX_TRIES = 60;    // 生成时最多重试几次
const SLACK_DEFAULT = 7; // 步数余量：比最优最多多走几步，超出即阵溃
const A_WASTE = 2;       // A 线：冗余手数上限

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
      vm.cells[i].emblem = board[i] ? 9 : 10;
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

  // 盘面规格与最优步数区间由 data/practice.js 的 LIGHTS_LEVELS 按难度档注入。
  // 测试探针直接调 create 时没带 params，落在简单档。
  const size = Math.max(3, Math.min(5, p.size || 3));
  const n = size * size;
  // 最优步数按档给的是一个区间 [lo, hi]，不是单个值：档位表写下的就是这个区间。
  const loSteps = Math.max(1, Math.min(n, p.minSteps || 2));
  const hiSteps = Math.max(loSteps, Math.min(n, p.hiSteps || loSteps + 1));
  // 余量不写死成「预算」：预算按本盘最优 + 余量现算。写死一个绝对数，它和「最优到底几步」
  // 必然脱钩——旧表里预算是最优的 3–4.5 倍，文档却写着「够 A、不够乱点」，两边从来对不上。
  // 下限 5 是硬的：余量降到 4，A 线（冗余 2）与 B 线（余量 − 2 = 2）就重合成一条，B 档消失。
  const budgetSlack = Math.max(5, Math.min(12, p.budgetSlack || SLACK_DEFAULT));

  const deadCount = (function () {
    // 死门 / 双门是「多一格不能碰的」，玩家可以在准备页关掉；
    // 关双门只回到一格死门，关死门才是整盘无死门。
    const off = Array.isArray(perks.offTwists) ? perks.offTwists : [];
    if (off.indexOf('死门') >= 0) return 0;
    const base = stageIdx >= 4 ? 2 : stageIdx >= 3 ? 1 : 0;
    return off.indexOf('双门') >= 0 ? Math.min(base, 1) : base;
  })();

  const deadCost = ctx.tip || '';
  const vm = C.makeVm(size, n, '让所有阵灯同时亮起',
    '阵眼感应每看一眼算 ' + HINT_COST + ' 步 · 复原本局每局一次');
  vm.extras.showHint = true;
  vm.extras.showReset = true;
  // 「已亮 N / M」在这一门是反向信息：亮着的盏数与「离解开还有多远」没有关系——
  // 实测 5×5 上有 37.6% 的正确一手会让已亮数变少。进度条与局内评级徽章一起撤掉，
  // HUD 只留三个真数字：最优几步、已走几步、余几步。
  vm.extras.showProgress = false;
  vm.extras.showGradeNow = false;

  let board = new Array(n).fill(true);
  let startBoard = new Array(n).fill(true);
  let dead = [];
  let optimal = loSteps;
  let capSteps = loSteps + budgetSlack;
  let moves = 0;
  let hintUsed = false;
  let resetUsed = false;
  let resetsLeft = RESET_LIMIT;
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

  // 冗余手数：比本盘最优多走了几步。评级只看这一个数，不看倍数、不看时间。
  function wasted() { return Math.max(0, moves - optimal); }

  // 三条线都落在冗余手数上，因此五档的宽窄每局都一样，不随「抽到几步解的盘」变形。
  function gradeOf() {
    // 阵溃不是「解得糙」，是没解开：走火（F），和「解开了但浪费太多」的 C 分开算。
    if (failed) return 'F';
    const w = wasted();
    let g;
    if (w === 0) g = 'S';
    else if (w <= A_WASTE) g = 'A';
    else if (w <= budgetSlack - 2) g = 'B';
    else g = 'C';
    // 复位把步数抹平了，但不该换来一张干净的 S：容错与满评只能选一个。
    if (g === 'S' && resetUsed) return 'A';
    return g;
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      if (dead.indexOf(i) >= 0) {
        vm.cells[i].cls = board[i] ? 'cell cell--dead cell--dead-lit' : 'cell cell--dead';
        vm.cells[i].label = DEAD_GLYPH;
        vm.cells[i].tone = 0;
        vm.cells[i].emblem = 11;
        continue;
      }
      vm.cells[i].cls = board[i] ? 'cell cell--lit' : 'cell cell--off';
      vm.cells[i].label = board[i] ? (theme.glyph || '●') : OFF_GLYPH;
      vm.cells[i].tone = 0;
      vm.cells[i].emblem = board[i] ? 9 : 10;
    }
  }

  function syncHud() {
    const left = Math.max(0, capSteps - moves);
    vm.timeText = '余 ' + left + ' 步';
    vm.goal = '最优 ' + optimal + ' 步 · 已走 ' + moves + ' 步';
    // 局内只报一个「成绩量」：比最优多走了几步——评级就是按这个数给的。
    vm.scoreText = '多走 ' + wasted() + ' 步';
    // 代价常驻：感应与余量所有档都讲，死门只有解锁后才讲。
    vm.hint = vm.costText + ' · 最优 ' + optimal + ' 步 · 余量 ' + budgetSlack + ' 步'
      + (deadCount > 0 ? ' · ' + deadCost + ' · 死门 ' + deadCount + ' 处' : '');
  }

  // 从全亮出发只点「点得动的格」把阵打乱，再解一遍，解出来多长就是这盘的最优步数。
  // 必须落进本档的 [loSteps, hiSteps]：这是档位表写下的唯一难度承诺，宽一格就名不副实。
  function newBoard() {
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(i);
    C.shuffle(all);
    dead = all.slice(0, deadCount);
    const allowed = all.slice(deadCount);

    let picked = null;
    for (let tries = 0; tries < MAX_TRIES; tries += 1) {
      const k = loSteps + Math.floor(Math.random() * (hiSteps - loSteps + 1));
      const b = new Array(n).fill(true);
      const pool = allowed.slice();
      C.shuffle(pool);
      for (let i = 0; i < k && i < pool.length; i += 1) toggleAt(b, size, pool[i]);
      if (allLit(b)) continue;
      const sol = solve(b, size, allowed);
      if (!sol) continue;
      if (sol.length < loSteps || sol.length > hiSteps) continue;
      picked = { board: b, steps: sol.length };
      break;
    }
    if (!picked) {
      // 兜底只往区间里收，绝不往区间外放：随机撒 k 格之后真解往往更短，所以先只按下限撒。
      // 两轮都落不进区间时，宁可交一盘「解比下限还短」的，也不给无解盘。
      for (let tries = 0; tries < MAX_TRIES * 2 && !picked; tries += 1) {
        const b = new Array(n).fill(true);
        const pool = allowed.slice();
        C.shuffle(pool);
        for (let i = 0; i < loSteps && i < pool.length; i += 1) toggleAt(b, size, pool[i]);
        if (allLit(b)) continue;
        const sol = solve(b, size, allowed);
        if (sol && sol.length > 0 && sol.length <= hiSteps) picked = { board: b, steps: sol.length };
      }
    }
    if (!picked) {
      // 理论上到不了这里（4×4 上现撒 4 格必得 4 步解）；真到了就退回「全亮盘 + 点一下」。
      const b = new Array(n).fill(true);
      toggleAt(b, size, allowed[0]);
      picked = { board: b, steps: 1 };
    }
    board = picked.board.slice();
    startBoard = board.slice();
    optimal = picked.steps;
    capSteps = optimal + budgetSlack;
    moves = 0;
    hintUsed = false;
    resetUsed = false;
    resetsLeft = RESET_LIMIT;
    failed = false;
    vm.banner = theme.banner || '';
    vm.status = '第 ' + (size) + '×' + size + ' 盘 · 让全阵亮起';
  }

  // 结算不只报一个字母：玩家最想知道的是「我为什么不是 S」。
  // 评级只看冗余手数，所以就把「走了几步 / 最优几步 / 多走几步」直接写出来，
  // 借过辅助也如实说是借了什么，而不是让玩家以为自己推错了。
  function gradeNotes() {
    const notes = [];
    if (failed) {
      notes.push('阵溃：余量 ' + budgetSlack + ' 步走完，阵还没全亮。');
      notes.push('这一盘最优只要 ' + optimal + ' 步；下一局先想好要动哪几格，别一格一格试。');
      return notes;
    }
    const w = wasted();
    if (w === 0) {
      notes.push('正好走最优 ' + optimal + ' 步，一步没浪费。');
    } else if (w <= A_WASTE) {
      notes.push('比最优多走 ' + w + ' 步（最优 ' + optimal + ' 步）· S 要一步不差。');
    } else if (w <= budgetSlack - 2) {
      notes.push('比最优多走 ' + w + ' 步 · A 线是多 ' + A_WASTE + ' 步以内。');
    } else {
      notes.push('比最优多走 ' + w + ' 步，超过 B 线（多 ' + (budgetSlack - 2) + ' 步以内）。');
    }
    if (hintUsed) notes.push('用过阵眼感应，每看一眼算 ' + HINT_COST + ' 步，已记在上面。');
    if (resetUsed) notes.push('复原本局过一次，本盘最高只到 A。');
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
      C.flash(vm, '余量用尽 · 阵溃', 'bad');
      finish('余量用尽，阵溃');
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
      // 死门不再是「整盘复位」：复位等于用一根手指的精度，否掉一整盘已经推好的局，
      // 这一门说好了「想得久不扣分」，那就不该让手抖决定成败。现在只罚 2 步、盘面不动。
      moves += DEAD_PENALTY;
      paint();
      syncHud();
      C.flash(vm, '触了死门 · 这一手不算，罚 ' + DEAD_PENALTY + ' 步', 'bad');
      vm.status = '死门吞了这一手 · 罚 ' + DEAD_PENALTY + ' 步';
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

  // 本局回到开局，步数清零但本盘封顶到 A，且每局只许一次：
  // 容错是给推演走死的人一条退路，不是免费重抽——不限次的话，余量这一栏等于不存在。
  function reset() {
    if (done || vm.phase !== 'playing') return;
    if (resetsLeft <= 0) {
      C.flash(vm, '本局已复原过一次 · 不能再来', 'bad');
      vm.status = '复原本局每局只许 ' + RESET_LIMIT + ' 次';
      render();
      return;
    }
    flipSeq += 1;
    board = startBoard.slice();
    moves = 0;
    resetsLeft -= 1;
    resetUsed = true;
    paint();
    syncHud();
    vm.status = '本局已复原 · 本盘最高 A';
    C.flash(vm, '复原到开局 · 本盘最高 A', 'good');
    render();
  }

  // 感应照一格，代价是 2 步：辅助与走错落在同一把尺子上，用几次掉几档，不是「封顶了事」。
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
      C.flash(vm, '此局无解，请复原本局', 'bad');
      render();
      return;
    }
    // 买不起就别扣：余量不够这一眼时直接挡回去，不让玩家点一下就从「还能救」跳到阵溃。
    if (moves + HINT_COST >= capSteps) {
      C.flash(vm, '余 ' + Math.max(0, capSteps - moves) + ' 步 · 买不起这一眼了', 'bad');
      vm.status = '余量不够再看一眼';
      render();
      return;
    }
    moves += HINT_COST;
    hintUsed = true;
    const k = clicks[0];
    const prevCls = vm.cells[k].cls;
    const prevLabel = vm.cells[k].label;
    const prevEmblem = vm.cells[k].emblem;
    vm.cells[k].cls = 'cell cell--hint';
    vm.cells[k].label = HINT_GLYPH;
    vm.cells[k].emblem = 12;
    vm.status = '阵眼感应：这一格该点 · 这一眼算 ' + HINT_COST + ' 步';
    syncHud();
    render();
    setTimeout(function () {
      if (done) return;
      vm.cells[k].cls = prevCls;
      vm.cells[k].label = prevLabel;
      vm.cells[k].emblem = prevEmblem;
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

// 五档的宽窄写在这里，准备页与结算的说明都按同一个余量算，不各拼一份。
function lines(params) {
  const p = params || {};
  const slack = Math.max(5, Math.min(12, p.budgetSlack || SLACK_DEFAULT));
  return {
    rule: '按比本盘最优多走了几步评（不论用时，想得久不扣）',
    items: ['S：正好走最优步数', 'A：比最优多 ' + A_WASTE + ' 步以内',
      'B：比最优多 ' + (slack - 2) + ' 步以内', '其余为 C（解开了，但多走太多）',
      '阵眼感应每看一眼算 ' + HINT_COST + ' 步；复原本局每局一次，用了本盘最高 A'],
    fail: '比最优多走满 ' + slack + ' 步还没全亮（阵溃）→ 走火 F，这一局没有收益',
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
