'use strict';

// 三秀同收（换苗引秀 / 灵植·三秀撷英诀专属）：经典三消。
// 点相邻两株灵草换位，让三株同色的连成一线即可收走；上面的落下来、顶上补新苗，
// 落下来又凑成一线的算连锁，一层比一层值钱。
//
// 与「灵纹连线」的区别：连线是找通路、消完变少；这里是换位造形、消完还会补满，
// 盘面永远是满的，考的是「换哪一步能连出更多层」。
// 无可行换位时会自动重排灵畦，绝不把玩家卡在死局里。

const C = require('./common.js');
const K = require('./teach-kit.js');

// 八张灵纹牌都在 styles/crest.wxss 里有图；这里只留数据语义（测试与读屏），不上屏。
// 绝境档会用到第 7 张，所以这一份必须和 sprite 的 8 格对齐。
const GLYPHS = ['✿', '❋', '✦', '◆', '●', '▲', '■', '✧'];

// 所有横 / 竖 ≥3 连的格子。纯函数：判定与测试共用，改规则不会让断言悄悄失效。
function matchesOf(board, cols, rows) {
  const hit = {};
  const out = [];
  function mark(list) {
    if (list.length < 3) return;
    for (let i = 0; i < list.length; i += 1) hit[list[i]] = true;
  }
  for (let r = 0; r < rows; r += 1) {
    let run = [];
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (run.length && board[run[0]] === board[i]) run.push(i);
      else { mark(run); run = [i]; }
    }
    mark(run);
  }
  for (let c = 0; c < cols; c += 1) {
    let run = [];
    for (let r = 0; r < rows; r += 1) {
      const i = r * cols + c;
      if (run.length && board[run[0]] === board[i]) run.push(i);
      else { mark(run); run = [i]; }
    }
    mark(run);
  }
  for (let i = 0; i < cols * rows; i += 1) if (hit[i]) out.push(i);
  return out;
}

function adjacent(a, b, cols) {
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

// 找一个真能凑出三连的相邻换位；纯函数，也供「死局重排」判定使用。
// sealed 是「石皮封住的格子」：封住的牌不能换，但仍能被三连收走。
// 这个参数是可选的——老调用方（测试 / 重排）不传就是「整盘都能换」。
function findMove(board, cols, rows, sealed) {
  const lock = sealed || null;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * cols + c;
      if (lock && lock[a]) continue;
      for (const d of [[0, 1], [1, 0]]) {
        const nr = r + d[0];
        const nc = c + d[1];
        if (nr >= rows || nc >= cols) continue;
        const b = nr * cols + nc;
        if (lock && lock[b]) continue;
        if (board[a] === board[b]) continue;
        const va = board[a];
        const vb = board[b];
        board[a] = vb;
        board[b] = va;
        const ok = matchesOf(board, cols, rows).length > 0;
        board[a] = va;
        board[b] = vb;
        if (ok) return [a, b];
      }
    }
  }
  return null;
}

// 收走三连后，同列上面的落下来，顶上补新苗。新苗可能再凑出一条线 —— 那就是连锁。
// outMoves[i] 是「这一格的内容从上面几格掉下来」：页面据此定下落距离，一格和十格
// 花同样时间会读成瞬移。原来只报 outFills（哪几格是新苗），实在撑不起「看得见的下落」。
function collapse(board, cols, rows, kinds, outFills, outMoves) {
  const out = board.slice();
  for (let c = 0; c < cols; c += 1) {
    const kept = [];
    for (let r = rows - 1; r >= 0; r -= 1) {
      const v = out[r * cols + c];
      if (v) kept.push({ v: v, r: r });
    }
    for (let k = 0; k < rows; k += 1) {
      const dest = rows - 1 - k;
      const idx = dest * cols + c;
      if (k < kept.length) {
        out[idx] = kept[k].v;
        // 只往下掉，所以 dest 一定不小于原行号，差就是掉了几格。
        if (outMoves) outMoves[idx] = dest - kept[k].r;
      } else {
        out[idx] = 1 + C.randInt(kinds);
        // 新补的那几株要报给页面：它们从上方落进来，跟「本来就在这儿的牌」得分开画。
        if (outFills) outFills.push(idx);
        // 新苗从盘面外掉进来：要走到第 dest 行，得从 -1 行出发，走 dest + 1 格。
        if (outMoves) outMoves[idx] = dest + 1;
      }
    }
  }
  return out;
}

function makeBoard(cols, rows, kinds) {
  const n = cols * rows;
  for (let t = 0; t < 80; t += 1) {
    const board = new Array(n).fill(0);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const pool = [];
        for (let v = 1; v <= kinds; v += 1) {
          // 生成时避开横 / 竖已成两连的颜色，开局盘面不该白送三连。
          if (c >= 2 && board[r * cols + c - 1] === v && board[r * cols + c - 2] === v) continue;
          if (r >= 2 && board[(r - 2) * cols + c] === v && board[(r - 1) * cols + c] === v) continue;
          pool.push(v);
        }
        board[r * cols + c] = pool.length ? pool[C.randInt(pool.length)] : 1 + C.randInt(kinds);
      }
    }
    if (!matchesOf(board, cols, rows).length && findMove(board, cols, rows)) return board;
  }
  // 兜底：按列循环填一个必定有交换的盘。
  const board = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) board[i] = 1 + (Math.floor(i / cols) + i % cols) % kinds;
  return board;
}

// 石皮封印：大成起盘上多出几格「换不动」的牌。它不挡匹配、不挡下落，
// 只挡换位——压的是「可行换位数」，不是「能不能消」。
// 选位置时每封一格都要确认盘上还有可行换位；封到没有可行换位就撤掉这一格，
// 否则开局就是死局，而玩家看到的只是「盘摆得怪」。
// 封印绑格，不绑牌：牌被收走时这一格解封（石皮碎掉），之后下落补苗都正常。
function sealCells(board, cols, rows, count, sealed) {
  const n = cols * rows;
  if (!count) return 0;
  const cand = [];
  for (let i = 0; i < n; i += 1) cand.push(i);
  C.shuffle(cand);
  let placed = 0;
  for (let k = 0; k < cand.length && placed < count; k += 1) {
    const i = cand[k];
    if (sealed[i]) continue;
    sealed[i] = true;
    if (findMove(board, cols, rows, sealed)) placed += 1;
    else sealed[i] = false;
  }
  return placed;
}

// 一手的演出节拍。消消乐的一手不是一个瞬间，是「收走 → 落下 → 再查一轮」三个拍子：
// 全压进一次渲染，盘面就从满的跳到满的，中间没有一帧是空的，玩家只能靠浮字知道收了东西。
// 数值比业界通行量级（消除 200–250ms）再紧一档，因为这一门是限时计分而不是步数制：
// 动画占掉的每一毫秒都直接是玩家少掉的思考时间，单手要压在 0.5 秒以内。
// 演出期间不收输入，但表照走——停表会让手快的人拿动画换时间，一局打不完。
const BEAT = {
  clear: 170,
  fallBase: 120,
  fallPer: 26,
  fallMax: 250,
};

// 连锁层数上限。跟「扫到没有为止」一样不能无界：一次补苗可能又凑出好几条，
// 极端盘面能连着炸十几轮，那几秒里玩家什么都做不了。
const MAX_CHAIN = 12;

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = Math.max(4, p.cols || 6);
  const rows = Math.max(4, p.rows || 6);
  const n = cols * rows;
  const kinds = Math.min(GLYPHS.length, Math.max(3, p.kinds || 5));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
  // 五档各改什么，全部由 data/practice.js 的 MATCH_LEVELS 注入；这里一个数字都不写死，
  // 否则准备页写「本段 55 息」、局内却按 60 息跑，玩家会以为规则骗人。
  const duration = Math.max(25, p.duration || 60);
  const missCost = Math.max(1, p.missCost || 2);
  const shuffleCost = Math.max(1, p.shuffleCost || 3);
  // 大成起的两个新旋钮：石皮封印格数与「原价重排」的次数（99 = 不限，前三段就是 99）。
  // 都由 data/practice.js 的 MATCH_LEVELS 按段注入，段内不变；玩法层不写死。
  const sealCount = Math.max(0, Math.round(p.seals || 0));
  const shuffleCap = typeof p.shuffleCap === 'number' ? Math.max(0, Math.round(p.shuffleCap)) : 99;
  const hintMs = Math.max(200, p.flashMs || 760);
  // 阶段新法只把代价打薄，不取消代价（十二原则第十一节：便利必须有明码代价）。
  const hintCost = Math.max(1, (p.hintCost || 2) - (stage >= 3 ? 1 : 0));
  const realShuffleCost = Math.max(1, shuffleCost - (stage >= 5 ? 1 : 0));
  const chainBonus = stage >= 5 ? 0.25 : 0;
  // 代价句由准备页按本段罚息生成（tipFor），局内一直挂在 hint 上。以前写死「少 2 息」，
  // 改了难度档就成假话；现在连浮字也取 missCost，三个地方说的是同一个数。
  const costText = ctx.tip || ('换不出三连少 ' + missCost + ' 息');

  const vm = C.makeVm(cols, n, '换两株相邻灵草，三株同色连成一线就收走', costText);
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.extras.showHint = true;
  vm.extras.showCombo = true;
  vm.extras.compact = true;

  // 一格三连 12 分，连锁每层 ×(1 + 0.5×(层数-1))；一局打得顺能收十几次。
  // S 线的基数与每档增量由 data/practice.js 的 params 同源送入，准备页照同一份数写给玩家看。
  const lim = gradeLimits(p);
  const sLimit = lim.s;
  const aLimit = lim.a;
  const bLimit = lim.b;

  const bag = C.TimerBag();
  let board = new Array(n).fill(0);
  let selected = -1;
  let hintPair = null;
  let hintTimer = null;
  let score = 0;
  let harvested = 0;
  let mistakes = 0;
  let shuffles = 0;
  // 原价重排只剩几次：用尽后仍可重排（绝不把玩家卡死），但代价翻倍。
  // 注意「原价」不是「免费」——前三段每次重排本来就扣 shuffleCost，这里只是不涨价。
  let shufflesLeft = shuffleCap;
  // 石皮封印绑格：true 表示这一格的牌不能换。收走这一格的牌即解封。
  const sealed = new Array(n).fill(false);
  let maxChain = 0;
  // 这一手的动效状态：无效互换抖哪两格、哪几格刚被收走、哪几格刚从上面掉下来。
  // 用 0/1 交替的类名，相邻两手才会各自重播一次（同名类连挂两帧不播动画）。
  let fxSeq = 0;
  let shakeAt = [];
  let goneAt = [];
  let fallAt = [];
  // 演出中：这一手还没演完，先不收输入。玩家在牌飞的时候点下一手，
  // 会点到一格「即将被换掉」的位置，他看到的和规则里的不是同一个盘面。
  // 表照走——限时玩法里把动画时间白送给玩家，等于手越快局越长。
  let busy = false;
  let left = duration;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function paint() {
    const alt = fxSeq % 2;
    // 同一列的下落必须同时落定：同列里两株速度不一样，就会在半空互相穿插。
    // 所以时长按「这一列最远那株掉几格」算——近的列先落完，远的那列接着落，
    // 跨列各走各的，盘面上看得出来的只有「这一列塌了一截」。
    const colFar = new Array(cols).fill(0);
    for (let i = 0; i < n; i += 1) {
      const d = fallAt[i] || 0;
      const c = i % cols;
      if (d > colFar[c]) colFar[c] = d;
    }
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const gone = goneAt.indexOf(i) >= 0;
      const fall = gone ? 0 : (fallAt[i] || 0);
      cell.arrow = -1;
      cell.end = false;
      cell.cls = 'cell cell--lit cell--chip'
        + (i === selected ? ' cell--sel' : '')
        + (hintPair && (hintPair[0] === i || hintPair[1] === i) ? ' cell--hintpair' : '')
        + (gone ? ' cell--clear' : '')
        + (sealed[i] && !gone ? ' cell--sealed' : '')
        + (fall ? ' cell--fall' + alt : '')
        + (shakeAt.indexOf(i) >= 0 ? ' cell--shake' + alt : '');
      // 空格子不许回落到第一张牌：v 为 0 时原来写 GLYPHS[v-1] || GLYPHS[0]，
      // wxml 在 crest / emblem 都为 0 时把 label 上屏，空出来的格子上就挂了个字符。
      const v = gone ? 0 : board[i];
      cell.label = v ? (GLYPHS[v - 1] || '') : '';
      // 同连连看：盘面画的是纹样，label 只留数据语义。
      cell.crest = v;
      cell.tone = v;
      // 下落距离与这一格该花多久都交给样式：一格和十格同一个时长会读成瞬移。
      cell.fall = fall;
      cell.fd = fall
        ? Math.min(BEAT.fallMax, BEAT.fallBase + colFar[i % cols] * BEAT.fallPer)
        : 0;
    }
    vm.match = { board: board.slice(), cols: cols, rows: rows, first: selected };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = maxChain;
    vm.comboText = maxChain >= 2 ? '最高连锁 ' + maxChain : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '分');
    vm.meter = { label: '已收灵草', value: Math.min(100, harvested), max: 100 };
    // 封印剩几格与原价重排剩几次要一直看得见：收走封印格的牌才解封，
    // 玩家得知道自己是在跟一副「换不动」的盘较劲。
    let sealLeft = 0;
    for (let i = 0; i < n; i += 1) if (sealed[i]) sealLeft += 1;
    vm.hint = costText + ' · 无效互换 ' + mistakes + ' · 重排 ' + shuffles
      + (shuffleCap < 99 ? '（原价 ' + shufflesLeft + '）' : '')
      + (sealLeft ? ' · 石皮 ' + sealLeft : '');
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    // 演出中途收场（时间到 / 中途结束）：先把留在半空的牌补回去再定格。
    // 结算卡底下压着一个缺了几格的盘面，看起来像卡住了。
    if (busy) {
      busy = false;
      goneAt = [];
      fallAt = [];
      board = collapse(board, cols, rows, kinds, null, null);
      paint();
    }
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '一畦三秀') : '';
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary });
  }

  function finish() {
    const grade = C.gradeBy(score, sLimit, aLimit, bLimit);
    finishOnce(grade, '收 ' + harvested + ' 株 · 最高连锁 ' + maxChain + ' · 无效互换 ' + mistakes);
  }

  function clearHint() {
    if (hintTimer !== null) { bag.off(hintTimer); hintTimer = null; }
    hintPair = null;
  }

  // 死局重排：保留颜色数量与石皮位置，只换牌位；重排到有可行换位为止。
  // shuffleCap 是「能以原价重排几次」，不是「总共能重排几次」：用尽后代价翻倍，
  // 但绝不拒绝——把玩家卡在一个死盘前，比多扣两息坏得多。
  function reshuffle() {
    const cost = shufflesLeft > 0 ? realShuffleCost : realShuffleCost * 2;
    if (shufflesLeft > 0) shufflesLeft -= 1;
    const vals = board.slice();
    for (let t = 0; t < 40; t += 1) {
      C.shuffle(vals);
      board = vals.slice();
      if (!matchesOf(board, cols, rows).length && findMove(board, cols, rows, sealed)) break;
    }
    shuffles += 1;
    left = Math.max(0, left - cost);
    C.flash(vm, '灵畦自整 · 少 ' + cost + ' 息'
      + (shuffleCap < 99 && shufflesLeft <= 0 ? '（原价重排已尽）' : ''), 'good');
  }

  // 收走这几株：牌从盘面撤掉，格子凹下去，「这一手收在哪几格」就此留在盘上 240ms。
  // 这一个空格帧是整手唯一能看见「少了东西」的锚点——盘面两帧都是满的，
  // 只有中间真空过一段，玩家才分得清「收了」和「牌换了个位置」。
  function stageClear(hits, chain) {
    harvested += hits.length;
    // 大圆满的「连收」只在第 3 层起额外加成：先打出长连锁才拿得到，不是每局白送。
    const mult = 1 + (chain - 1) * 0.5 + (chain >= 3 ? (chain - 2) * chainBonus : 0);
    const gain = Math.round(hits.length * 12 * mult);
    score += gain;
    if (chain > maxChain) maxChain = chain;
    for (let i = 0; i < hits.length; i += 1) { board[hits[i]] = 0; sealed[hits[i]] = false; }
    // 交出去的是「哪几格」：页面据此在原位迸一小把，颜色取上一帧那张牌的纹样。
    C.markCleared(vm, hits);
    goneAt = hits.slice();
    fallAt = [];
    shakeAt = [];
    fxSeq += 1;
    // 递进反馈只分三档：普通三连淡光、一次收四株以上提亮、连锁逐层再提亮。
    // 浮字只落在 HUD 那一层，不往盘面里塞汉字。
    const bright = chain > 1 || hits.length >= 4;
    const label = chain > 1 ? '连锁 ' + chain + ' 层'
      : (hits.length >= 4 ? hits.length + ' 株齐收' : '三秀同收');
    C.flash(vm, label + ' +' + gain, bright ? 'gold' : 'good');
    paint();
    syncHud();
    render();
    bag.after(function () { stageFall(chain); }, BEAT.clear);
  }

  // 落下来、补上去。每一格掉几格由 collapse 算好，一格和十格给不同的时长。
  function stageFall(chain) {
    goneAt = [];
    const fills = [];
    const moves = [];
    board = collapse(board, cols, rows, kinds, fills, moves);
    // 总时长取「所有列里掉得最远的那一列」，paint 按列给每格定时长，
    // 所以这里算出来的就是最后落定的那一刻。
    let far = 0;
    for (let i = 0; i < n; i += 1) {
      if (moves[i] > far) far = moves[i];
    }
    fallAt = far ? moves : [];
    shakeAt = [];
    fxSeq += 1;
    paint();
    syncHud();
    render();
    const span = far
      ? Math.min(BEAT.fallMax, BEAT.fallBase + far * BEAT.fallPer)
      : BEAT.fallBase;
    bag.after(function () { settle(chain); }, span);
  }

  // 落定之后再查一轮：还有三连就是连锁，层数 +1 从头再来一遍。
  function settle(chain) {
    fallAt = [];
    const hits = matchesOf(board, cols, rows);
    if (hits.length && chain < MAX_CHAIN) { stageClear(hits, chain + 1); return; }
    if (!findMove(board, cols, rows, sealed)) reshuffle();
    busy = false;
    paint();
    syncHud();
    render();
    if (left <= 0) finish();
  }

  function tap(index) {
    // 演出中不收输入：牌还在飞的时候点下一手，点到的是「即将被换掉」的位置。
    if (done || busy || vm.phase !== 'playing' || index < 0 || index >= n) return;
    clearHint();
    // 石皮封住的牌不能换：不扣息（玩家没做错事，是规则不让换），但必须当场说清是哪一格。
    if (sealed[index]) {
      selected = -1;
      fxSeq += 1;
      shakeAt = [index];
      goneAt = [];
      fallAt = [];
      C.flash(vm, '石皮封住 · 这一株换不动', 'bad');
      paint();
      render();
      return;
    }
    if (selected < 0) { selected = index; shakeAt = []; goneAt = []; fallAt = []; paint(); render(); return; }
    if (selected === index) { selected = -1; shakeAt = []; goneAt = []; fallAt = []; paint(); render(); return; }
    const a = selected;
    if (!adjacent(a, index, cols)) { selected = index; paint(); render(); return; }
    selected = -1;
    const va = board[a];
    const vb = board[index];
    board[a] = vb;
    board[index] = va;
    const hits = matchesOf(board, cols, rows);
    if (!hits.length) {
      board[a] = va;
      board[index] = vb;
      mistakes += 1;
      left = Math.max(0, left - missCost);
      // 换出去又弹回来，光靠浮字说「不行」是看不见的：
      // 两格自己抖一下，玩家才知道是「这一步不成立」而不是「没点上」。
      fxSeq += 1;
      shakeAt = [a, index];
      goneAt = [];
      fallAt = [];
      C.flash(vm, '换不出三连 · 少 ' + missCost + ' 息', 'bad');
      paint();
      syncHud();
      if (left <= 0) { finish(); return; }
      render();
      return;
    }
    // 成立了：接下来是演出，一拍一拍演完才交还输入。
    busy = true;
    stageClear(hits, 1);
  }

  function hint() {
    if (done || busy || vm.phase !== 'playing') return;
    const move = findMove(board, cols, rows, sealed);
    if (!move) { reshuffle(); paint(); syncHud(); render(); return; }
    clearHint();
    hintPair = move;
    left = Math.max(0, left - hintCost);
    vm.status = '照畦：少 ' + hintCost + ' 息，换这两株';
    paint();
    syncHud();
    render();
    hintTimer = bag.after(function () {
      if (done) return;
      hintPair = null;
      paint();
      render();
    }, hintMs);
    if (left <= 0) finish();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '换两株相邻灵草，三株同色连成一线就收走';
    vm.banner = theme.banner || '';
    board = makeBoard(cols, rows, kinds);
    // 石皮封印：大成起按段注入格数。封印只压「可行换位数」，不改匹配与下落。
    for (let i = 0; i < n; i += 1) sealed[i] = false;
    sealCells(board, cols, rows, sealCount, sealed);
    paint();
    syncHud();
    render();
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
    tap: tap,
    hint: hint,
    abandon: function () { finishOnce('F', '中途结束'); },
    destroy: function () { bag.clear(); },
  });
}

// 评级线的唯一出处：整张档位表在数据层，玩法层只接 p.sLine。
// 这条线随盘面变难而略降是刻意的——多一色，随机盘面凑三连的概率与连锁长度都掉一截，
// 再用同一条绝对分数线，高档就变成「要点得比低档还快」，而不是「要看得更准」。
function gradeLimits(p) {
  const s = Math.max(1, (p && p.sLine) || 1750);
  return { s: s, a: Math.ceil(s * 0.68), b: Math.ceil(s * 0.40) };
}

function lines(p) {
  const lim = gradeLimits(p);
  const seals = p && typeof p.seals === 'number' ? p.seals : 0;
  const cap = p && typeof p.shuffleCap === 'number' ? p.shuffleCap : 99;
  return {
    rule: '按本局总分（无效互换只少息、不扣分；本段盘面与时辰见准备页难度栏）',
    items: [
      'S ≥ ' + lim.s + ' 分',
      'A ≥ ' + lim.a + ' 分',
      'B ≥ ' + lim.b + ' 分',
      '其余为 C',
      // 两条新机制必须写进评级卡旁边：玩家看到盘上的石皮，要能当场查到它是什么意思。
      seals ? '石皮封印 ' + seals + ' 格：封住的牌不能换，收走它才解封' : '',
      cap < 99 ? '重排前 ' + cap + ' 次原价，之后每次双倍扣息' : '',
    ].filter(Boolean),
  };
}

// 首局手把手：一板没有连线的苗，只差一次相邻互换。
// 要教的是「换相邻两株、换完必须当场成三连」——所以只留一条成三连的路，
// 换别的两株都会被拒绝（拒绝不是失败，只是还没换来一条线）。
const TEACH_BOARD = [1, 2, 1, 3, 1, 3, 2, 3, 2];
const TEACH_COLS = 3;
const TEACH_SWAP = [4, 5];
// 五段的盘面与色数：与 data/practice 的 MATCH_LEVELS 同值。
const TEACH_LEVELS = [
  { cols: 6, rows: 6, kinds: 5, missCost: 1, seals: 0 },
  { cols: 7, rows: 7, kinds: 5, missCost: 2, seals: 0 },
  { cols: 8, rows: 8, kinds: 6, missCost: 2, seals: 0 },
  { cols: 9, rows: 9, kinds: 6, missCost: 3, seals: 4 },
  { cols: 10, rows: 10, kinds: 7, missCost: 3, seals: 8 },
];

// 段界那几盘按本段规格现铺：色按 (行+列) 取模铺开，再把底行三格摆成
// 「A B A」——中间那株与右边一换，就是 A A A。写死这个形状而不是现抽，
// 是为了同一段每次进来都是同一条路；现抽一局，教学就成了碰运气。
function teachLayout(stage) {
  if (stage === 0) {
    return { board: TEACH_BOARD.slice(), cols: TEACH_COLS, rows: 3, swap: TEACH_SWAP.slice(), kinds: 3 };
  }
  const spec = TEACH_LEVELS[stage];
  const n = spec.cols * spec.rows;
  const board = [];
  for (let i = 0; i < n; i += 1) {
    const r = Math.floor(i / spec.cols);
    const c = i % spec.cols;
    board.push(((r + c) % spec.kinds) + 1);
  }
  // 底行：… A B A → 换 B 与 A，凑成 A A A。
  const a = 1;
  const b = 2;
  const left = (a - 1 + spec.cols) % spec.cols;
  const v = spec.kinds;
  board[(spec.rows - 1) * spec.cols + left] = 1;
  board[(spec.rows - 1) * spec.cols + a] = v;
  board[(spec.rows - 1) * spec.cols + b] = 1;
  // 右侧再留一格不同色，免得本来就三连。
  const right = b + 1 < spec.cols ? b + 1 : 0;
  board[(spec.rows - 1) * spec.cols + right] = 2;
  const swap = [(spec.rows - 1) * spec.cols + a, (spec.rows - 1) * spec.cols + b];
  // 大成起教学盘上摆一格石皮：只演示「封住的不能换」这一件事，
  // 所以挑一格不在示范换位上的，也不挡底行那组三连（否则示范第一步就做不成）。
  let seal = -1;
  if (spec.seals) {
    for (let i = 0; i < board.length; i += 1) {
      if (i === swap[0] || i === swap[1]) continue;
      if (Math.floor(i / spec.cols) === spec.rows - 1) continue;
      seal = i;
      break;
    }
  }
  return {
    board: board, cols: spec.cols, rows: spec.rows,
    swap: swap, kinds: spec.kinds, seal: seal,
  };
}

function createTeach(ctx) {
  const stage = Math.max(0, Math.min(4, (ctx && ctx.stage) | 0));
  const lay = teachLayout(stage);
  const board = lay.board;
  const seal = typeof lay.seal === 'number' ? lay.seal : -1;
  const cells = K.blank(lay.cols, board.length);
  let sel = -1;
  return K.run(ctx, {
    cols: lay.cols,
    cells: cells,
    status: stage === 0
      ? '教学 · 换相邻两株，凑成三连'
      : '教学 · 这一段 ' + lay.cols + '×' + lay.rows + ' · ' + lay.kinds + ' 色'
        + (seal >= 0 ? ' · 石皮封住的不能换' : ''),
    steps: [
      {
        at: [lay.swap[0]],
        text: '点中间这一株 · 再点它右边',
        take: function (i) {
          sel = i;
          return { text: '选中了 · 只换相邻的两株' };
        },
      },
      {
        at: [lay.swap[1]],
        text: '点右边那一株 · 换完要当场成三连',
        take: function () {
          const keep = board[lay.swap[0]];
          board[lay.swap[0]] = board[lay.swap[1]];
          board[lay.swap[1]] = keep;
          sel = -1;
          return { text: '三株连成一线 · 不成三连的话整手都会弹回' };
        },
      },
    ],
    paint: function () {
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i];
        c.crest = board[i];
        c.tone = board[i];
        c.label = '';
        c.cls = i === sel ? 'cell cell--chip cell--sel' : 'cell cell--chip';
        if (i === seal) c.cls += ' cell--sealed';
      }
    },
    doneText: stage === 0
      ? '换位是唯一的手：换完要成三连'
      : '这一段 ' + lay.cols + '×' + lay.rows + ' · ' + lay.kinds + ' 色'
        + (seal >= 0 ? ' · 石皮格先收走它上面的牌才解封' : '')
        + ' · 换不出三连少 ' + TEACH_LEVELS[stage].missCost + ' 息',
  });
}

const teach = { create: createTeach };

module.exports = {
  id: 'match', name: '三秀同收', create: create, lines: lines, teach: teach,
  matchesOf: matchesOf, findMove: findMove, collapse: collapse, GLYPHS: GLYPHS,
};
