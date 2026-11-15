'use strict';

// 落石垒基（土术·万石成岳诀专属）：按 Tetris Guideline 重做的经典盘面。
//
// 旧版有三处与「标准俄罗斯方块」不一样，也正是玩起来不像的原因：
//   ① 盘面 8 列 × 8 行。**行数不是难度旋钮**——Guideline 的场地是 10 列 × 20 行。
//      行越少，「留缝」这件唯一要动脑的事就没有余地：三四块就顶到天花板，
//      玩家学到的是「我来不及」，不是「我该往哪放」。20 行是给规划的余量。
//   ② 恒定 950ms、每化三层 ×0.9。真实的重力是 1 级 1000ms/格 → 15 级 7ms/格，
//      每化 10 层进一级。速度不是「档位一开始就很快」，而是被自己的成绩推上去的。
//   ③ 现抽：会连出七块没有长石，也会连着给三块同形。Guideline 用 7-bag：
//      七个一包、包内洗牌，所以每七块必来一条长石，两块同形最多隔 12 块。
//
// 这一门现在由九样「查得到出处」的东西拼成，没有一处是拍脑袋的手感：
//   标准场地 10×20 / 重力曲线 / 每 10 层一级 / 7-bag / 三块预告 / 暂存（hold）
//   / 落定延迟 500ms（移动复位上限 15 次）/ SRS 踢墙 / 阶梯计分（1·3·5·8 行 × 级数）。
//
// 关卡只拧两个数：起始级与每级要化几层（见 data/practice.js 的 BLOCK_LEVELS 与 levels.js 的 tweakParams）。
// 盘面尺寸不随关变——它一变，这一门就不是俄罗斯方块了。

const C = require('./common.js');

// 七种四连块。盒（box）是 SRS 定义的旋转盒：I 用 4×4，O 用 2×2，其余 3×3。
// 旋转在盒内做（(r,c) → (c, n-1-r)），盒的位置不动——旧版把每次旋转后的块
// 归一化到左上角，看上去就是「转一下整块往左跳一格」，贴墙时尤其明显。
const SHAPES = [
  { key: 'I', tone: 7, box: 4, cells: [[1, 0], [1, 1], [1, 2], [1, 3]] },
  { key: 'O', tone: 3, box: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { key: 'T', tone: 6, box: 3, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  { key: 'S', tone: 1, box: 3, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { key: 'Z', tone: 2, box: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { key: 'J', tone: 4, box: 3, cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
  { key: 'L', tone: 5, box: 3, cells: [[0, 2], [1, 0], [1, 1], [1, 2]] },
];

// Guideline 的重力表：1–15 级每格毫秒数，出自 (0.8 − (L−1) × 0.007)^(L−1) 秒再取整。
// 15 级以上一律 7ms（约 20G）：再快下去不是「更会」，是「看不清」。
const GRAVITY_MS = [1000, 793, 618, 473, 355, 262, 190, 135, 94, 64, 43, 28, 18, 11, 7];

// 落定延迟：落地后还有 500ms 可以反悔（挪一格、转一下），复位上限 15 次。
// 没有它，手指慢半拍就是一次白放——那是操作成本，不是难度。
const LOCK_MS = 500;
const LOCK_RESET_MAX = 15;

// 阶梯计分（× 级数）：单 100 / 双 300 / 三 500 / 四 800。四行连出（back-to-back）再 ×1.5。
const LINE_SCORE = [0, 100, 300, 500, 800];
const B2B_SCALE = 1.5;

// SRS 踢墙表：只列顺时针四档，因为盘上只有「转石」一个键。
// 坐标是 [列偏移, 行偏移]，行向下为正——Guideline 原文的 y 轴朝上，这里已经翻过号。
// 每档五个位置依次试，第一个不撞墙不撞石的就是这一转的真实落点。
const KICKS_JLSTZ = [
  [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],   // 0 → R
  [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],     // R → 2
  [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],      // 2 → L
  [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],  // L → 0
];
const KICKS_I = [
  [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],    // 0 → R
  [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],    // R → 2
  [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],    // 2 → L
  [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],    // L → 0
];

const QUEUE_SIZE = 3;

// 顺时针转 90°：在盒内做，所以盒的左上角不动。
function rotateCells(cells, box) {
  const n = box || 3;
  return cells.map(function (x) { return [x[1], n - 1 - x[0]]; });
}

// 这一级的重力（毫秒 / 格）。
function gravityOf(level) {
  const i = Math.max(1, Math.min(GRAVITY_MS.length, Math.round(level) || 1)) - 1;
  return GRAVITY_MS[i];
}

// 本局第几级：起手级 + 已化层数 ÷ 每级层数。行数与级数分开算，级数只影响手感。
function levelOf(lines, startLevel, per) {
  const step = Math.max(1, Math.round(per) || 10);
  return Math.max(1, (Math.round(startLevel) || 1) + Math.floor(Math.max(0, lines) / step));
}

// 一次化 N 行该给多少分。按「化之前」的级数算（Guideline 的算法），
// 否则一次化四行升上去的那一级会把自己的分也抬一遍。
function clearScore(rows, level, b2b) {
  const base = LINE_SCORE[Math.max(0, Math.min(4, rows | 0))] || 0;
  const mul = (b2b && rows === 4 ? B2B_SCALE : 1) * Math.max(1, Math.round(level) || 1);
  return Math.round(base * mul);
}

// 哪几行已经垒满。纯函数：页面要靠它标「化的就是这几行」，
// 测试也靠它验「这件事真的发生了」，不必去攒一次真实的消行。
function fullRows(board, cols, rows) {
  const out = [];
  for (let r = 0; r < rows; r += 1) {
    let full = true;
    for (let c = 0; c < cols; c += 1) {
      if (!board[r * cols + c]) { full = false; break; }
    }
    if (full) out.push(r);
  }
  return out;
}

// 满行化去，上面的整层落下来。纯函数，测试可以直接验「垒满一层真的会消」。
function clearLines(board, cols, rows) {
  const kept = [];
  let lines = 0;
  for (let r = 0; r < rows; r += 1) {
    let full = true;
    for (let c = 0; c < cols; c += 1) {
      if (!board[r * cols + c]) { full = false; break; }
    }
    if (!full) kept.push(board.slice(r * cols, (r + 1) * cols));
    else lines += 1;
  }
  const out = new Array(cols * rows).fill(0);
  for (let i = 0; i < kept.length; i += 1) {
    const r = rows - kept.length + i;
    for (let c = 0; c < cols; c += 1) out[r * cols + c] = kept[i][c];
  }
  return { board: out, lines: lines };
}

// 这一组格子在盘上放不放得下。纯函数：不碰 piece，也不改盘面——
// 旋转的踢墙判定与落点虚影都靠它，测试也能直接给一张盘面问「这一转成不成」。
function cellsFit(board, cols, rows, cells, r, c) {
  for (let i = 0; i < cells.length; i += 1) {
    const rr = r + cells[i][0];
    const cc = c + cells[i][1];
    if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return false;
    if (board[rr * cols + cc]) return false;
  }
  return true;
}

// 顺时针转一次，连踢墙一起算。依次试这一档的五个偏移，第一个放得下的就是真实落点；
// 五个都放不下才算「转不动」。返回新的 piece，转不动返回 null。
function planRotation(board, cols, rows, pc, table) {
  const box = pc.shape.box;
  const cells = rotateCells(pc.cells, box);
  const kicks = (table || (pc.shape.key === 'I' ? KICKS_I : KICKS_JLSTZ))[pc.rot];
  for (let i = 0; i < kicks.length; i += 1) {
    const r = pc.r + kicks[i][1];
    const c = pc.c + kicks[i][0];
    if (cellsFit(board, cols, rows, cells, r, c)) {
      return { shape: pc.shape, rot: (pc.rot + 1) % 4, cells: cells, tone: pc.tone, r: r, c: c };
    }
  }
  return null;
}

// 一包七块：七个形状各一个，包内洗牌。每七块必有一条长石，
// 两块同形最多隔 12 块——「怎么总是不来长条」的抱怨从机制上消失。
function bagOf() {
  const idx = [0, 1, 2, 3, 4, 5, 6];
  for (let i = idx.length - 1; i > 0; i -= 1) {
    const j = C.randInt(i + 1);
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  return idx;
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  // 盘面是标准场地：10 列 × 20 行。写死在这里，不接 params.cols / rows ——
  // 盘面一变「俄罗斯方块」就不成立了，难度也不该从削减行数上来。
  const cols = 10;
  const rows = 20;
  const n = cols * rows;
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
  const startLevel = Math.max(1, Math.round(p.startLevel || 1));
  const perLevel = Math.max(3, Math.round(p.linesPerLevel || 10));
  const duration = Math.max(25, p.duration || 70);
  // 阶段新法：大成「稳基」把落定延迟放宽到 700ms（不是让它停，仍然在落）；
  // 大圆满「层叠」把化层得分再抬一成。
  const lockMs = stage >= 3 ? 700 : LOCK_MS;
  const lineBonus = stage >= 5 ? 1.1 : 1;

  const vm = C.makeVm(cols, n, '灵石一息一落，垒满一层化去', ctx.tip || '用方向键挪石、转石、速降，垒满一层即消');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.extras.showPad = true;
  vm.extras.showMeter = true;
  vm.extras.showCombo = true;
  vm.pad = {
    // 只给方向，不给字形：← ⟳ ⇓ 这类符号在部分机型上会被系统当成 emoji，
    // 渲染成彩色立体箭头，四个白键上三样材质。箭头由页面用 CSS 画。
    keys: [
      { id: 0, dir: 'left', icon: 'left', glyph: '左移' },
      { id: 1, dir: 'rotate', icon: 'rotate', glyph: '转石' },
      { id: 2, dir: 'right', icon: 'right', glyph: '右移' },
      { id: 3, dir: 'drop', icon: 'drop', glyph: '速降' },
    ],
  };

  const lim = gradeLimits(p);
  const sLimit = lim.s;
  const aLimit = lim.a;
  const bLimit = lim.b;

  const bag = C.TimerBag();
  let board = new Array(n).fill(0);
  let piece = null;
  // 三块预告：俄罗斯方块的「想三步」全靠看得见。旧版只给一块，
  // 玩家永远只能对「刚揭晓的这一块」做反应，摆法退化成就地找缝。
  let queue = [];
  let hold = null;
  let holdUsed = false;
  let score = 0;
  let lines = 0;
  let pieces = 0;
  let combo = 0;
  let b2b = false;
  let level = startLevel;
  let clearSeq = 0;
  let left = duration;
  let done = false;
  let started = false;
  let lockTimer = null;
  let lockResets = 0;

  function render() { ctx.render(vm); }

  function cellsOf(pc) {
    return pc.cells.map(function (x) { return [pc.r + x[0], pc.c + x[1]]; });
  }

  function at(pc, r, c) {
    return { shape: pc.shape, rot: pc.rot, cells: pc.cells, tone: pc.tone, r: r, c: c };
  }

  function fits(pc) {
    return cellsFit(board, cols, rows, pc.cells, pc.r, pc.c);
  }

  // 这一块直线落到哪一行。纯计算，不动 piece。
  function ghostRow(pc) {
    let r = pc.r;
    for (;;) {
      if (!fits(at(pc, r + 1, pc.c))) return r;
      r += 1;
    }
  }

  function resting() {
    return !!piece && !fits(at(piece, piece.r + 1, piece.c));
  }

  function clearLockTimer() {
    if (lockTimer !== null) {
      bag.off(lockTimer);
      lockTimer = null;
    }
  }

  // 落地之后才开始计这 500ms。已经在计就不再重挂——重力每一跳都会来问一次。
  function armLock() {
    if (lockTimer !== null || done) return;
    lockTimer = bag.after(function () {
      lockTimer = null;
      lock();
    }, lockMs);
  }

  // 成功挪了一格 / 转了一下：把刚落地的计时退回去，最多退 15 次。
  // 退完之后再挪也不顺延——否则「抬起来再放下」能无限续命。
  function afterMove() {
    if (lockTimer === null) return;
    if (lockResets >= LOCK_RESET_MAX) return;
    clearLockTimer();
    lockResets += 1;
    if (resting()) armLock();
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      cell.arrow = -1;
      cell.end = false;
      cell.label = '';
      cell.tone = board[i] || 0;
      cell.cls = board[i] ? 'cell cell--lit cell--set' : 'cell cell--void';
    }
    // 落点虚影：这一块照着直线掉下去会停在哪儿，先在空格上铺一层浅色轮廓。
    // 没有它，玩家按「右边」的时候必须自己在脑子里数还差几格，
    // 数错就是一次白挪 —— 那是操作成本，不是难度。
    if (piece) {
      const gr = ghostRow(piece);
      if (gr > piece.r) {
        for (let i = 0; i < piece.cells.length; i += 1) {
          const r = gr + piece.cells[i][0];
          const c = piece.c + piece.cells[i][1];
          if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
          const idx = r * cols + c;
          if (board[idx]) continue;
          const cell = vm.cells[idx];
          cell.cls = 'cell cell--ghost cell--t' + piece.tone;
          cell.tone = piece.tone;
        }
      }
    }
    if (piece) {
      const pts = cellsOf(piece);
      for (let i = 0; i < pts.length; i += 1) {
        const r = pts[i][0];
        const c = pts[i][1];
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const cell = vm.cells[r * cols + c];
        cell.cls = 'cell cell--lit cell--live';
        cell.tone = piece.tone;
      }
    }
    vm.blocks = {
      board: board.slice(), cols: cols, rows: rows, lines: lines, level: level,
      gravity: gravityOf(level), perLevel: perLevel, startLevel: startLevel,
      piece: piece ? {
        shape: piece.shape.key, rot: piece.rot,
        cells: piece.cells.map(function (x) { return x.slice(); }),
        r: piece.r, c: piece.c, tone: piece.tone,
      } : null,
      // 三块预告 + 暂存：页面画三个四乘四小格与一个暂存格。
      queue: queue.map(function (q) {
        return { shape: q.shape.key, cells: q.cells.map(function (x) { return x.slice(); }), tone: q.tone };
      }),
      hold: hold ? { shape: hold.shape.key, cells: hold.cells.map(function (x) { return x.slice(); }), tone: hold.tone } : null,
      holdUsed: holdUsed,
    };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = combo;
    // 级数是这一门的「难度自述」：它跟着化层往上走，也让「刚才为什么变快」有出处。
    vm.comboText = '第 ' + level + ' 级' + (b2b ? ' · 连四' : '');
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '分');
    const into = lines % perLevel;
    vm.meter = { label: '距下一级', value: into, max: perLevel };
    vm.hint = vm.costText;
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    clearLockTimer();
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '层层皆化') : '';
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary });
  }

  function finish() {
    finishOnce(C.gradeBy(score, sLimit, aLimit, bLimit),
      '化 ' + lines + ' 层 · 落 ' + pieces + ' 石 · 到第 ' + level + ' 级');
  }

  // 从袋里取一块。bagQueue 空了就洗新的一包。
  let bagQueue = [];
  function drawShape() {
    if (!bagQueue.length) bagQueue = bagOf();
    const shape = SHAPES[bagQueue.shift()];
    return {
      shape: shape, rot: 0,
      cells: shape.cells.map(function (x) { return x.slice(); }),
      tone: shape.tone,
    };
  }

  // 摆到出生点：盒水平居中，行 0。标准场地没有隐藏缓冲行，
  // 所以「新块放不下」＝ 堆到顶，这一局到此为止。
  function placeAtSpawn(entry) {
    const box = entry.shape.box;
    piece = {
      shape: entry.shape, rot: 0, cells: entry.cells, tone: entry.tone,
      r: 0, c: Math.floor((cols - box) / 2),
    };
    lockResets = 0;
    clearLockTimer();
    if (!fits(piece)) {
      piece = null;
      paint();
      syncHud();
      finishOnce('C', '灵石堆到了顶 · 化 ' + lines + ' 层');
      return false;
    }
    return true;
  }

  function spawn() {
    if (!queue.length) queue.push(drawShape());
    const cur = queue.shift();
    queue.push(drawShape());
    pieces += 1;
    holdUsed = false;
    if (!placeAtSpawn(cur)) return;
    paint();
    render();
  }

  function lock() {
    if (!piece || done) return;
    clearLockTimer();
    const pts = cellsOf(piece);
    for (let i = 0; i < pts.length; i += 1) {
      const r = pts[i][0];
      const c = pts[i][1];
      if (r >= 0 && r < rows && c >= 0 && c < cols) board[r * cols + c] = piece.tone;
    }
    const full = fullRows(board, cols, rows);
    const res = clearLines(board, cols, rows);
    board = res.board;
    if (res.lines > 0) {
      const prevLevel = level;
      // 先按旧级数结分，再升级——一次化四行不该把自己的分也抬一遍。
      const gain = Math.round(clearScore(res.lines, level, b2b) * (1 + depth * 0.06) * lineBonus);
      lines += res.lines;
      score += gain;
      combo += 1;
      b2b = res.lines === 4;
      level = levelOf(lines, startLevel, perLevel);
      // 行闪：告诉页面「刚才是哪几行化的」。盘面已经清空，光看格子分不出来。
      clearSeq += 1;
      vm.linesClear = { key: clearSeq, rows: full };
      if (level > prevLevel) C.flash(vm, '第 ' + level + ' 级 · 落石更急', 'gold');
      else if (res.lines === 4) C.flash(vm, '四层齐化 +' + gain, 'gold');
      else C.flash(vm, '化 ' + res.lines + ' 层 +' + gain, 'gold');
    } else {
      combo = 0;
      b2b = false;
    }
    piece = null;
    paint();
    syncHud();
    spawn();
  }

  function step() {
    if (done || !piece || vm.phase !== 'playing') return;
    const down = at(piece, piece.r + 1, piece.c);
    if (fits(down)) {
      piece = down;
      // 下落一格就是「新的最低行」：复位次数重新给满，落定计时也撤掉。
      lockResets = 0;
      clearLockTimer();
      // 这一格如果正好踩到底，落定延迟从**这一刻**开始算，
      // 不等下一个重力跳才发现落不下去——1 级一秒一格，那一跳就是白白多坐一秒。
      if (resting()) armLock();
      paint();
      render();
    } else {
      armLock();
    }
  }

  function tryShift(dc) {
    const cand = at(piece, piece.r, piece.c + dc);
    if (!fits(cand)) return false;
    piece = cand;
    afterMove();
    paint();
    render();
    return true;
  }

  function tryRotate() {
    const cand = planRotation(board, cols, rows, piece);
    if (!cand) return false;
    piece = cand;
    afterMove();
    paint();
    render();
    return true;
  }

  function holdPiece() {
    if (done || vm.phase !== 'playing' || !piece || holdUsed) return;
    const cur = { shape: piece.shape, rot: 0, cells: piece.cells, tone: piece.tone };
    const prev = hold;
    hold = cur;
    piece = null;
    clearLockTimer();
    if (prev) {
      // 换出来的块回到出生点、回到初始朝向——这是 Guideline 的暂存语义。
      if (placeAtSpawn(prev)) { paint(); render(); }
    } else {
      spawn();
    }
    // spawn / placeAtSpawn 都会把 holdUsed 清掉，所以暂存这一标记最后写。
    holdUsed = true;
    paint();
    syncHud();
    render();
  }

  function move(dir) {
    if (done || vm.phase !== 'playing' || !piece) return;
    if (dir === 'left') { tryShift(-1); return; }
    if (dir === 'right') { tryShift(1); return; }
    if (dir === 'rotate') { tryRotate(); return; }
    if (dir === 'hold') { holdPiece(); return; }
    if (dir === 'drop') {
      const from = piece.r;
      const to = ghostRow(piece);
      if (to > from) {
        piece = at(piece, to, piece.c);
        // 速降每格 2 分：这是 Guideline 的硬降计分，也让「敢按」有回报。
        score += (to - from) * 2;
      }
      paint();
      syncHud();
      lock();
    }
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '灵石一息一落，垒满一层化去';
    vm.banner = theme.banner || '';
    level = levelOf(0, startLevel, perLevel);
    while (queue.length < QUEUE_SIZE) queue.push(drawShape());
    syncHud();
    spawn();
    // 每一跳的间隔现场取：化层进级之后下一跳就变快，不用拆掉重挂定时器。
    bag.everyFlex(step, function () { return gravityOf(level); });
    bag.every(function () {
      if (done) return;
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
    move: move,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { clearLockTimer(); bag.clear(); },
  });
}

// 评级只看得分。S 线由章节表（practice.BLOCK_LEVELS）注入，按本档实测标定。
function gradeLimits(p) {
  const s = (p && p.sLine) || 3000;
  return { s: s, a: Math.ceil(s * 0.60), b: Math.ceil(s * 0.32) };
}

function lines(p) {
  const lim = gradeLimits(p);
  const per = Math.max(3, Math.round((p && p.linesPerLevel) || 10));
  const start = Math.max(1, Math.round((p && p.startLevel) || 1));
  const g = gravityOf(start);
  return {
    rule: '按本局得分：化层越多、一次多化越多、级数越高，分越高',
    items: [
      'S ≥ ' + lim.s + ' 分', 'A ≥ ' + lim.a + ' 分', 'B ≥ ' + lim.b + ' 分', '其余为 C',
      '起手第 ' + start + ' 级（每格 ' + (g / 1000).toFixed(2) + ' 秒），每化 ' + per + ' 层进一级',
      '一次化 1 / 2 / 3 / 4 层按 100 / 300 / 500 / 800 × 级数给分，连续两次四层 ×1.5，速降每格 +2',
    ],
  };
}

module.exports = {
  id: 'blocks', name: '落石垒基', create: create, lines: lines,
  rotateCells: rotateCells, clearLines: clearLines, fullRows: fullRows,
  cellsFit: cellsFit, planRotation: planRotation,
  gravityOf: gravityOf, levelOf: levelOf, clearScore: clearScore, bagOf: bagOf,
  SHAPES: SHAPES, GRAVITY_MS: GRAVITY_MS, LINE_SCORE: LINE_SCORE,
  LOCK_MS: LOCK_MS, LOCK_RESET_MAX: LOCK_RESET_MAX, KICKS_JLSTZ: KICKS_JLSTZ, KICKS_I: KICKS_I,
};
