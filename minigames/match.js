'use strict';

// 三连互换（换苗引秀 / 灵植·三秀撷英诀专属）：经典三消。
// 点相邻两株灵草换位，让三株同色的连成一线即可收走；上面的落下来、顶上补新苗，
// 落下来又凑成一线的算连锁，一层比一层值钱。
//
// 与「灵纹连线」的区别：连线是找通路、消完变少；这里是换位造形、消完还会补满，
// 盘面永远是满的，考的是「换哪一步能连出更多层」。
// 无可行换位时会自动重排灵畦，绝不把玩家卡在死局里。

const C = require('./common.js');
const practiceData = require('../data/practice.js');
const gradeLinesOf = practiceData.gradeLinesOf;
// 剩余时辰折分的汇率与三条评级线的时间口径都在数据层：玩法层只读，不自己乘系数。
const MATCH_CLEAR_K = practiceData.MATCH_CLEAR_K;
const MATCH_MOVE_SEC = practiceData.MATCH_MOVE_SEC;
const MATCH_GRADE_X = practiceData.MATCH_GRADE_X;
const K = require('./teach-kit.js');
const CREST = require('./crest.js');

// GLYPHS 只是数据里的可读代号（测试与读屏），不上屏；上屏的是 crest 位图。
// 花色序号要按族序映射成 sprite 格位，不能拿 1..N 直接当格号 —— 前八格里
// 五个是果子，按序号取前五就是一盘圆，去色后分不开（见 minigames/crest.js）。
const GLYPHS = ['✿', '❋', '✦', '◆', '●', '▲', '■', '✧'];

// 特效牌编码（玩法结构轴）：普通苗是正数 1..kinds，特效牌是负数。
// 负数不是为了省地方：特效必须跟着 collapse 一起下落，另开 special[] 就要同步搬两套状态，
// 一漏就是「特效留在空里」。普通匹配天然跳过负数（同色判定只在正数里做），
// 特效的清行 / 清列 / 炸弹 / 同色全消在 triggerFx 里单独走。
//
// seed 是「灵种」：它同样要跟着 collapse 下落，所以也走负数编码。
// 但它不是特效——不能换、不能引爆、不参与匹配，只能被下方的空位带着往下掉，
// 掉到底行就算收走。所以 isFx 必须把它排掉，否则玩家拿它当炸弹使。
const FX = { row: -1, col: -2, bomb: -3, rainbow: -4, seed: -5 };
const FX_CLS = { '-1': 'row', '-2': 'col', '-3': 'bomb', '-4': 'rainbow' };
const FX_WORD = { '-1': '直行符', '-2': '直列符', '-3': '四邻符', '-4': '同色符' };
// 目标类型：五种会改变「同一副盘的最优解」的任务，攒分不算目标。
// 1 收够指定色 / 2 做出几层连锁 / 3 破几格石皮 / 4 指定色与连锁都要 / 5 引苗落底。
// 4 现在没有段落在用，但它是合法目标，说明页与 lines() 仍要讲得清。
const GOAL_NAMES = { 1: '收', 2: '连锁', 3: '破皮', 4: '收+连锁', 5: '落底', 6: '收灵草' };
function isFx(v) { return v < 0 && v !== FX.seed; }
function isSeed(v) { return v === FX.seed; }

// 所有横 / 竖 ≥3 连的格子。纯函数：判定与测试共用，改规则不会让断言悄悄失效。
function matchesOf(board, cols, rows) {
  const hit = {};
  const out = [];
  function mark(list) {
    if (list.length < 3 || board[list[0]] <= 0) return;
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

// 匹配行的形状：四连生直线、五连生彩球、横竖交叉生炸弹。
// 这是「玩法结构」这一轴的本体——凑出三连就消失只是收，凑出形状要在盘上留下东西，
// 下一次交换才用得上。返回 { hits, spawn, fx } 供 stageClear 落子。
function matchShape(board, cols, rows, swapAt) {
  const runs = [];
  function scan(line) {
    let start = 0;
    while (start < line.length) {
      const v = board[line[start]];
      if (v <= 0) { start += 1; continue; }
      let end = start + 1;
      while (end < line.length && board[line[end]] === v) end += 1;
      if (end - start >= 3) {
        runs.push({ cells: line.slice(start, end), len: end - start, v: v,
          dir: line.dir, cross: -1 });
      }
      start = end;
    }
  }
  for (let r = 0; r < rows; r += 1) {
    const line = [];
    for (let c = 0; c < cols; c += 1) line.push(r * cols + c);
    line.dir = 'row';
    scan(line);
  }
  for (let c = 0; c < cols; c += 1) {
    const line = [];
    for (let r = 0; r < rows; r += 1) line.push(r * cols + c);
    line.dir = 'col';
    scan(line);
  }
  const hits = [];
  const seen = {};
  runs.forEach(function (run) {
    run.cells.forEach(function (i) {
      if (!seen[i]) { seen[i] = true; hits.push(i); }
    });
  });
  // 交叉（L/T）：同一格既在横三连又在竖三连里，才生成炸弹。
  let spawn = -1;
  let fx = 0;
  let bombAt = -1;
  for (const a of runs) {
    if (a.dir !== 'row' || a.len < 3) continue;
    for (const b of runs) {
      if (b.dir !== 'col' || b.len < 3) continue;
      for (const i of a.cells) {
        if (b.cells.indexOf(i) >= 0) { bombAt = i; break; }
      }
      if (bombAt >= 0) break;
    }
    if (bombAt >= 0) break;
  }
  const long = runs.filter(function (r) { return r.len >= 5; });
  if (long.length) {
    fx = FX.rainbow;
    // 落在这一次交换点（若交换点参与了该长连）；否则落在这条长连的中间格。
    const r = long[0];
    spawn = r.cells.indexOf(swapAt) >= 0 ? swapAt : r.cells[Math.floor(r.len / 2)];
  } else if (bombAt >= 0) {
    fx = FX.bomb;
    spawn = bombAt;
  } else {
    const four = runs.filter(function (r) { return r.len === 4; });
    if (four.length) {
      const r = four[0];
      fx = r.dir === 'row' ? FX.row : FX.col;
      spawn = r.cells.indexOf(swapAt) >= 0 ? swapAt : r.cells[Math.floor(r.len / 2)];
    }
  }
  return { hits: hits, spawn: spawn, fx: fx, runs: runs };
}

// 特效的清盘范围。特效被交换时本身也算「成立」，不必再凑三连——
// 否则玩家拿着一张清行符还要再找一条三连才能用，符就成了摆设。
function triggerFx(board, cols, rows, at, kinds, other) {
  const hit = {};
  const type = board[at];
  if (type === FX.row) {
    const r = Math.floor(at / cols);
    for (let c = 0; c < cols; c += 1) hit[r * cols + c] = true;
  } else if (type === FX.col) {
    const c = at % cols;
    for (let r = 0; r < rows; r += 1) hit[r * cols + c] = true;
  } else if (type === FX.bomb) {
    const r = Math.floor(at / cols);
    const c = at % cols;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const nr = r + dr; const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) hit[nr * cols + nc] = true;
      }
    }
  } else if (type === FX.rainbow) {
    // 彩球配谁就清谁的颜色；配的是另一张特效牌，就挑盘上最多的那一色清掉。
    let color = other > 0 && other <= kinds ? other : 0;
    if (!color) {
      const count = new Array(kinds + 1).fill(0);
      for (let i = 0; i < board.length; i += 1) {
        if (board[i] > 0 && board[i] <= kinds) count[board[i]] += 1;
      }
      color = count.indexOf(Math.max.apply(null, count));
    }
    for (let i = 0; i < board.length; i += 1) if (board[i] === color) hit[i] = true;
  }
  hit[at] = true;
  return Object.keys(hit).map(Number);
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
      // 灵种格不参与换位：它只能靠下方的牌被收走而往下掉。
      // 所以它既不能当起点，也不能当终点——下面 b 那一处同样要挡。
      if (isSeed(board[a])) continue;
      for (const d of [[0, 1], [1, 0]]) {
        const nr = r + d[0];
        const nc = c + d[1];
        if (nr >= rows || nc >= cols) continue;
        const b = nr * cols + nc;
        if (lock && lock[b]) continue;
        if (isSeed(board[b])) continue;
        // 特效牌不靠凑三连生效：它与任意相邻牌交换都能引爆，所以它也是「有步可走」。
        // 死局判定认这一点，否则盘上明明握着清行符却被判死局重排，符就白给了。
        if (isFx(board[a]) || isFx(board[b])) return [a, b];
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

// 引苗落底（圆满段的目标）：把 count 枚灵种摆进盘面。
// 灵种不参与匹配、不能换，只会随着它那一列的塌陷往下沉——它压的是「清哪一列、什么时候清」，
// 不是「能不能消」。这是这一门唯一一个「位置类」目标，其余四种都只是数数量。
// 三条硬约束：
//   ① 每列最多一枚：一列两枚会叠在一起，上面那枚永远等不到下面那枚让位；
//   ② 不放底行：开局就在底行等于目标白给；
//   ③ 每放一枚都复验还有可行换位——灵种格换不动，封到没有可行换位就是死盘。
// 返回值是真正放下的枚数：放不下就少放，绝不让目标变成一个盘上做不到的数。
function plantSeeds(board, cols, rows, count) {
  const placed = [];
  const usedCol = {};
  // 起摆固定在「距底 4 行」。位置是难度旋钮，而且必须按**段末**的时辰定，不能只按段首：
  // 只靠「collapse 按空位下压」的话灵种在随机盘上根本走不到底行——10×10 实测
  // 1850 手里底行被消 0 次（行分布 1216 / 1085 / 951 / 511 / 236 / 87 / 29 / 7 / 1 / 0），
  // 所以补了「本列塌一格它沉一格」。按这条规则量下来：
  //   盘顶起摆（距底 9）   瞄准 68% / 随手 36%
  //   第 2~3 行（距底 7）  瞄准 73% / 随手 44%  —— 段首够用，但段末只有 31 息
  //   距底 4 行                        ← 取这一档
  // 判据不只是「段首能不能成」，还有「段末成不成」：段五时辰从 45 收到 31 息（25 手），
  // 距底 7 格在 25 手里要同一列被清七次，实测只剩三成局做得完——那不是难度，是做不到。
  const base = Math.max(0, rows - 4);
  const span = Math.max(1, Math.min(2, rows - 1 - base));
  for (let t = 0; t < cols * 6 && placed.length < count; t += 1) {
    const c = C.randInt(cols);
    if (usedCol[c]) continue;
    const r = base + C.randInt(span);
    const i = r * cols + c;
    if (board[i] <= 0) continue;
    const keep = board[i];
    board[i] = FX.seed;
    if (!findMove(board, cols, rows)) { board[i] = keep; continue; }
    usedCol[c] = true;
    placed.push(i);
  }
  return placed.length;
}

// 底行上还有哪几枚灵种。纯函数，判定与测试共用：
// 灵种只能被「下方清空」带着往下走，所以「落底」的判定就是一句话——它在不在最后一行。
// 单独抽出来是为了让测试能直接钉住这条判定，而不必去凑一局真落底。
function seedsAtBottom(board, cols, rows) {
  const out = [];
  for (let c = 0; c < cols; c += 1) {
    const i = (rows - 1) * cols + c;
    if (board[i] === FX.seed) out.push(i);
  }
  return out;
}

// 灵种跟着本列的塌陷往下沉一格（这一列这一轮有消除才沉）。纯函数，判定与测试共用。
// 不改 collapse 本身：collapse 是「按空位下压」，它对所有格子一视同仁；
// 灵种的额外下沉是这一门独有的规则，混进去会让别的玩法读到它。
function sinkSeeds(board, cols, rows, holes, moves) {
  for (let c = 0; c < cols; c += 1) {
    if (!holes[c]) continue;
    for (let r = rows - 2; r >= 0; r -= 1) {
      const at = r * cols + c;
      if (board[at] !== FX.seed) continue;
      const dest = (r + 1) * cols + c;
      const under = board[dest];
      board[dest] = FX.seed;
      board[at] = under;
      if (moves) {
        moves[dest] = Math.max(moves[dest] || 0, 1);
        moves[at] = Math.max(moves[at] || 0, 1);
      }
    }
  }
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
    // 灵种格本来就换不动，再裹一层石皮会画成两层壳，而且「收走即解封」跟它没关系。
    if (isSeed(board[i])) continue;
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
  // 做成目标之后停一拍再进结算：这一拍是玩家读「用了多少息、折了多少分」的唯一时机。
  settleHold: 900,
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
  // kinds 等六项是 let：圆满段的二选一劫变在开局前改它们，改完才发盘、才开始计时。
  // 上限读族序长度（七族），不读 GLYPHS 的字符数：字符只是代号，族序才是「分得开」的上限。
  let kinds = Math.min(CREST.MATCH_FAMILIES.length, Math.max(3, p.kinds || 5));
  // 本段纹样主题由生成端按关号注入，玩法层只消费。不自己按段算兜底 ——
  // 兜底一旦与生成端不一致，换段那关的盘面会悄悄跳一整套图，界面上查不出是哪一步错的。
  const crestTheme = Math.max(0, Math.min(CREST.MATCH_CRESTS.length - 1, Math.round(p.theme || 0)));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
  // 五档各改什么，全部由 data/practice.js 的 MATCH_LEVELS 注入；这里一个数字都不写死，
  // 否则准备页写「本段 55 息」、局内却按 60 息跑，玩家会以为规则骗人。
  let duration = Math.max(25, p.duration || 60);
  const missCost = Math.max(1, p.missCost || 2);
  const shuffleCost = Math.max(1, p.shuffleCost || 3);
  // 大成起的两个新旋钮：石皮封印格数与「原价重排」的次数（99 = 不限，前三段就是 99）。
  // 都由 data/practice.js 的 MATCH_LEVELS 按段注入，段内不变；玩法层不写死。
  let sealCount = Math.max(0, Math.round(p.seals || 0));
  const shuffleCap = typeof p.shuffleCap === 'number' ? Math.max(0, Math.round(p.shuffleCap)) : 99;
  // 特效等级：0 不出特效（前三段），1 四连出直行/直列符，2 五连再出同色符，
  // 3 交叉出四邻符并允许两符相撞组合。等级由段表注入，玩法层不写死。
  let fxTier = Math.min(3, Math.max(0, Math.round(p.special || 0)));
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
  let lim = gradeLimits(p);
  let sLimit = lim.s;
  let aLimit = lim.a;
  let bLimit = lim.b;

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
  // 目标类型：这一局不再只是「攒够分」，还要在时辰里做成一件事——
  // 收够某色 / 做出几层连锁 / 破几格石皮 / 引苗落底 / 收任意色若干株。
  // **做成即收工**：达成那一刻这一局就结束，没打掉的时辰折成分数（见 finishClear）。
  let goalType = Math.min(6, Math.max(0, Math.round(p.goalType || 0)));
  const goalColor = Math.max(1, Math.min(kinds, Math.round(p.goalColor || 1)));
  let goalCount = Math.max(1, Math.round(p.goalCount || 1));
  let goalGot = 0;
  let goalChains = 0;
  let goalDone = false;
  // 达成那一刻冻结的剩余时辰。负数 = 还没达成。
  // 必须冻结：达成之后演出还要走几百毫秒，若让表继续走，折分就会少一两息，
  // 而且「几点达成的」在结算里报出去也不是当时那个数。
  let clearLeft = -1;
  let clockFrozen = false;
  // 主动手段：挪苗单局几次，花息换一次「不要求相邻」的挪动。
  // 与照畦不是一回事——照畦是买信息（指出哪两株），挪苗是买一步操作（自己换哪两株）。
  let activeMax = Math.max(0, Math.round(p.swapAny || 0));
  const activeCost = Math.max(1, p.swapCost || 3);
  let activeLeft = activeMax;
  let activeMode = false;
  let activeFirst = -1;
  // 本局变数：圆满段开局先给两条劫变，玩家点一条才发盘、才开始走时辰。
  const twistWanted = Math.round(p.twist || 0) > 0;
  let twistChosen = false;
  vm.twistPick = twistWanted ? (p.twistChoices || []).slice() : null;
  vm.extras.showActive = activeMax > 0;
  vm.activeLabel = '挪苗 ' + activeLeft + '（' + activeCost + ' 息）';
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
      const raw = gone ? 0 : board[i];
      cell.arrow = -1;
      cell.end = false;
      cell.cls = 'cell cell--lit cell--chip'
        + (i === selected ? ' cell--sel' : '')
        + (hintPair && (hintPair[0] === i || hintPair[1] === i) ? ' cell--hintpair' : '')
        + (gone ? ' cell--clear' : '')
        + (sealed[i] && !gone ? ' cell--sealed' : '')
        + (isSeed(raw) && !gone ? ' cell--seed' : '')
        + (isFx(raw) ? ' cell--fx cell--fx-' + FX_CLS[raw] : '')
        + (fall ? ' cell--fall' + alt : '')
        + (shakeAt.indexOf(i) >= 0 ? ' cell--shake' + alt : '');
      // 空格子不许回落到第一张牌：v 为 0 时原来写 GLYPHS[v-1] || GLYPHS[0]，
      // wxml 在 crest / emblem 都为 0 时把 label 上屏，空出来的格子上就挂了个字符。
      // 特效牌（负数）也不许回落：它靠 cell--fx 的 CSS 符号认，不挂纹样。
      cell.label = raw > 0 ? (GLYPHS[raw - 1] || '') : '';
      // crest 与 tone 都写 sprite 格位（不是花色序号）：迸溅色按 tone 查 CREST_HUE，
      // 只能跟着那张图走；跟着花色序号走会把果器的颜色溅到甜点 / 海洋上。
      // cell--tN 那套主题色不作用于灵纹牌（.cell--lit.cell--chip 自己铺瓷白底）。
      const crest = raw > 0 ? CREST.matchCrestOf(raw, crestTheme) : 0;
      cell.crest = crest;
      cell.tone = crest;
      // 下落距离与这一格该花多久都交给样式：一格和十格同一个时长会读成瞬移。
      cell.fall = fall;
      cell.fd = fall
        ? Math.min(BEAT.fallMax, BEAT.fallBase + colFar[i % cols] * BEAT.fallPer)
        : 0;
    }
    vm.match = { board: board.slice(), cols: cols, rows: rows, first: selected };
  }

  // 剩余每息折几手产出。放在玩法层算，是因为劫变会改时辰、而「一手值多少分」只认本局参数；
  // 汇率本身（MATCH_CLEAR_K）在数据层，与三条评级线同源。
  function clearRate() {
    return Math.max(1, ((p.perMove || 50) / MATCH_MOVE_SEC) * MATCH_CLEAR_K);
  }
  // 现在做成能拿多少分：已收的 + 剩余时辰折算。这是 HUD 上报的那个档位的唯一口径。
  function pendingScore() {
    const leftNow = goalDone ? clearLeft : Math.max(0, left);
    return score + Math.round(leftNow * clearRate());
  }
  function paceHint() {
    if (!goalType) return '';
    if (goalDone) return '目标达成 · 收工';
    // S 线对应的就是「用掉四成时辰」，所以玩家能自己算的余量只有这一条；
    // 不报「再 N 分入 S」——那一句在这一门口径下是错的（分里有一大半是折出来的）。
    const used = Math.max(0, duration - Math.max(0, left));
    const room = duration * MATCH_GRADE_X.s - used;
    return room >= 0 ? 'S 余 ' + Math.max(0, Math.ceil(room)) + ' 息' : 'S 已过';
  }

  function syncHud() {
    const shown = goalDone ? clearLeft : left;
    vm.timeText = C.mmss(Math.max(0, shown));
    vm.activeLabel = '挪苗 ' + activeLeft + '（' + activeCost + ' 息）' + (activeMode ? ' · 点两株' : '');
    // 进度条读「用掉了几成时辰」：这一门的时间压力是「别拖」，不是「别耗尽」。
    // 达成之后冻住在这一格，玩家看到的是自己交卷的位置。
    vm.progress = C.pct(duration - Math.min(Math.max(0, shown), duration), duration);
    vm.progressText = goalDone
      ? '用时 ' + Math.round(duration - Math.min(clearLeft, duration)) + ' / ' + duration + ' 息'
      : Math.max(0, Math.round(left)) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = maxChain;
    vm.comboText = maxChain >= 2 ? '最高连锁 ' + maxChain : '';
    // 局内档位报的是「现在做成会拿什么档」：这一门的分有一大半是剩余时辰折出来的，
    // 只看已收的分会让玩家以为自己离 S 很远，其实早点做完就到手了。
    vm.gradeNow = C.gradeBy(pendingScore(), sLimit, aLimit, bLimit);
    vm.goal = paceHint();
    if (goalType) {
      const val = goalType === 2 ? goalChains : goalGot;
      vm.meter = { label: '目标 ' + GOAL_NAMES[goalType] + ' ' + goalText(), value: Math.min(goalCount, val), max: goalCount,
        detail: goalDone ? '已达成 · 收工' : '' };
    } else {
      vm.meter = { label: '已收灵草', value: Math.min(100, harvested), max: 100 };
    }
    // 封印剩几格与原价重排剩几次要一直看得见：收走封印格的牌才解封，
    // 玩家得知道自己是在跟一副「换不动」的盘较劲。
    let sealLeft = 0;
    for (let i = 0; i < n; i += 1) if (sealed[i]) sealLeft += 1;
    vm.hint = costText + ' · 无效互换 ' + mistakes + ' · 重排 ' + shuffles
      + (shuffleCap < 99 ? '（原价 ' + shufflesLeft + '）' : '')
      + (sealLeft ? ' · 石皮 ' + sealLeft : '')
      + (activeMax ? ' · 挪苗 ' + activeLeft + '（' + activeCost + ' 息）' : '')
      + (goalType ? ' · ' + goalText() : '');
  }

  function finishOnce(grade, summary, extra) {
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
    const out = { grade: grade, score: Math.max(0, score), summary: summary };
    if (extra) Object.assign(out, extra);
    ctx.finish(out);
  }

  // 达成即收工：把没打掉的时辰折成分数再评级。
  // 这一句是「终点认目标」的全部实现——不给返息、不给第二次机会，做成就是这一局的终点。
  function finishClear() {
    if (done) return;
    const bonus = Math.round(Math.max(0, clearLeft) * clearRate());
    const total = score + bonus;
    const grade = C.gradeBy(total, sLimit, aLimit, bLimit);
    const used = Math.max(0, Math.round(duration - clearLeft));
    finishOnce(grade, '收 ' + harvested + ' 株 · 最高连锁 ' + maxChain + ' · 用时 ' + used + ' / ' + duration + ' 息 · 余息折 ' + bonus + ' 分', {
      score: total,
      goalDone: true,
      goalBonus: bonus,
    });
  }

  // 时辰耗尽：先看目标做成没有。做成了（理论上走不到这里）按收工算；
  // 没做成就是这一关没过——分数只算真收的株，没有剩余时辰可折，自然落在 B 线以下。
  function finish() {
    if (done) return;
    if (goalDone) { finishClear(); return; }
    const grade = C.gradeBy(score, sLimit, aLimit, bLimit);
    finishOnce(grade, '收 ' + harvested + ' 株 · 最高连锁 ' + maxChain + ' · 无效互换 ' + mistakes + ' · 时辰已尽 · 目标未达成', {
      score: score,
      goalMissed: !!goalType,
    });
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
    // 灵种不参与重排，必须留在原格：它是「埋在这一列」的目标，不是一张能被洗的牌。
    // 跟着洗有两个坏结果——洗到底行等于目标白给，洗到顶行等于白多走一截；
    // 两个都不会报错，只会让同一段的同一目标时而太难、时而过关即送。
    const orig = board.slice();
    const vals = orig.filter(function (v) { return v !== FX.seed; });
    for (let t = 0; t < 40; t += 1) {
      C.shuffle(vals);
      let p = 0;
      const next = new Array(n);
      for (let i = 0; i < n; i += 1) {
        if (orig[i] === FX.seed) next[i] = FX.seed;
        else { next[i] = vals[p]; p += 1; }
      }
      board = next;
      if (!matchesOf(board, cols, rows).length && findMove(board, cols, rows, sealed)) break;
    }
    shuffles += 1;
    left = Math.max(0, left - cost);
    C.flash(vm, '灵畦自整 · 少 ' + cost + ' 息'
      + (shuffleCap < 99 && shufflesLeft <= 0 ? '（原价重排已尽）' : ''), 'good');
  }

  function goalText() {
    if (!goalType) return '';
    if (goalType === 6) return '收灵草 ' + Math.min(goalCount, goalGot) + '/' + goalCount;
    if (goalType === 1 || goalType === 4) {
      const tail = goalType === 4 ? ' · 需连锁 3 层' : '';
      return '收' + GLYPHS[goalColor - 1] + ' ' + Math.min(goalCount, goalGot) + '/' + goalCount + tail;
    }
    if (goalType === 2) return '连锁 ' + Math.min(goalCount, goalChains) + '/' + goalCount + ' 层';
    if (goalType === 5) return '灵种落底 ' + Math.min(goalCount, goalGot) + '/' + goalCount;
    return '破石皮 ' + Math.min(goalCount, goalGot) + '/' + goalCount;
  }

  // 达成即收工：这里只做三件事——冻结表、记下剩余几息、立起「这一手演完就结算」的标记。
  // 不在这里 flash，也不在这里 finish：
  //   ① 达成多半发生在连锁的某一层，当场报会被下一层的「连锁 N 层」盖掉；
  //   ② 当场结算会把还在飞的牌切成半空的盘面。
  // 真正的报账与结算都在 settle 尾部，等 busy 归零。
  function grantGoal() {
    if (goalDone) return;
    goalDone = true;
    clockFrozen = true;
    clearLeft = Math.max(0, left);
  }

  // 目标只认「这一手真收走的」，重复连锁里收走的同一格算两次（连锁本来就是重新数）。
  function goalAdvance(hits, chain) {
    // 落底（5）不走这一支：它由 harvestLanded 在每次落定后数，与「这一手收走几株」无关。
    if (!goalType || goalDone || goalType === 5) return;
    if (goalType === 1 || goalType === 4 || goalType === 6) {
      for (const i of hits) {
        if (goalType === 6 || board[i] === goalColor) goalGot += 1;
      }
    }
    if (goalType === 2) {
      if (chain >= 2) goalChains += 1;
    }
    if (goalType === 3) {
      for (const i of hits) if (sealed[i]) goalGot += 1;
    }
    const ok = goalType === 4
      ? goalGot >= goalCount && maxChain >= 3
      : (goalType === 2 ? goalChains >= goalCount : goalGot >= goalCount);
    if (ok) grantGoal();
  }

  // 收走这几株：牌从盘面撤掉，格子凹下去，「这一手收在哪几格」就此留在盘上 240ms。
  // 这一个空格帧是整手唯一能看见「少了东西」的锚点——盘面两帧都是满的，
  // 只有中间真空过一段，玩家才分得清「收了」和「牌换了个位置」。
  // spawn 是这一手凑出的特效牌：清完再落到指定格，跟着后面的 collapse 一起下落。
  function stageClear(hits, chain, spawn) {
    harvested += hits.length;
    // 大圆满的「连收」只在第 3 层起额外加成：先打出长连锁才拿得到，不是每局白送。
    const mult = 1 + (chain - 1) * 0.5 + (chain >= 3 ? (chain - 2) * chainBonus : 0);
    const gain = Math.round(hits.length * 12 * mult);
    score += gain;
    if (chain > maxChain) maxChain = chain;
    // 目标先看这一手的原盘：石皮解封与牌变色都在下面那一行发生。
    goalAdvance(hits, chain);
    for (let i = 0; i < hits.length; i += 1) { board[hits[i]] = 0; sealed[hits[i]] = false; }
    if (spawn && spawn.fx && spawn.at >= 0 && spawn.at < n) {
      board[spawn.at] = spawn.fx;
      sealed[spawn.at] = false;
    }
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
      : (hits.length >= 4 ? hits.length + ' 株齐收' : '三株齐收');
    C.flash(vm, label + ' +' + gain
      + (spawn && spawn.fx ? ' · 凝出' + FX_WORD[spawn.fx] : ''), bright ? 'gold' : 'good');
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
    // 灵种要「本列塌一格就沉一格」，所以先数这一列空了几格，再塌。
    // 必须先数：塌完就分不清哪个空格是这一轮消的。
    const holes = new Array(cols).fill(0);
    for (let i = 0; i < n; i += 1) if (!board[i]) holes[i % cols] += 1;
    board = collapse(board, cols, rows, kinds, fills, moves);
    // collapse 只按「灵种自己下方空了」下压。而三消的下半盘几乎不参与消除
    // （10×10 实测 1850 手，底行被消 0 次），照这条规则灵种会永远停在原格，
    // 「落底」就成了盘上做不到的数。所以补一条：本列塌了，就把灵种往下带一格。
    // 一格而不是「塌几格带几格」，是因为后者实测 2~3 手就到底——目标会变成白送。
    if (goalType === 5) sinkSeeds(board, cols, rows, holes, moves);
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

  // 灵种落到底行即收：置空、记账、演一轮「收走 → 落下」。
  // 不能只置空就走人——底行会留一个洞，而这一门的收场必须是一盘满的。
  // 也不能把它算进连锁：落底是目标进度，不是「又凑成了一条线」。
  function harvestLanded() {
    if (goalType !== 5) return false;
    const landed = seedsAtBottom(board, cols, rows);
    if (!landed.length) return false;
    for (let k = 0; k < landed.length; k += 1) board[landed[k]] = 0;
    goalGot += landed.length;
    C.markCleared(vm, landed);
    goneAt = landed.slice();
    fallAt = [];
    shakeAt = [];
    fxSeq += 1;
    const ok = goalGot >= goalCount;
    if (ok) grantGoal();
    C.flash(vm, '灵种落底 ' + Math.min(goalCount, goalGot) + '/' + goalCount,
      ok ? 'gold' : 'good');
    paint();
    syncHud();
    render();
    bag.after(function () { stageFall(0); }, BEAT.clear);
    return true;
  }

  // 落定之后再查一轮：还有三连就是连锁，层数 +1 从头再来一遍。
  // 灵种落底排在三连之后：先让这一波连锁演完再收底行的灵种，
  // 否则同一帧里两句浮字叠在一起，玩家只看得到后写的那一句。
  function settle(chain) {
    fallAt = [];
    const hits = matchesOf(board, cols, rows);
    if (hits.length && chain < MAX_CHAIN) { stageClear(hits, chain + 1); return; }
    if (harvestLanded()) return;
    if (!findMove(board, cols, rows, sealed)) reshuffle();
    busy = false;
    // 做成目标了：这一手彻底演完就收工。
    // 报账与结算不能挤在同一帧——那句「目标达成」会被结算卡直接盖掉，
    // 玩家只看到评级，不知道自己是因为做成了才结束的。所以先报一句，停一拍再结算。
    if (goalDone) {
      const bonus = Math.round(Math.max(0, clearLeft) * clearRate());
      C.flash(vm, '目标达成 · 余 ' + Math.round(clearLeft) + ' 息折 ' + bonus + ' 分', 'gold');
      paint();
      syncHud();
      render();
      busy = true;
      bag.after(function () { finishClear(); }, BEAT.settleHold);
      return;
    }
    paint();
    syncHud();
    render();
    if (left <= 0) finish();
  }

  // 主动手段：挪苗。花息换一次「不要求相邻」的换位，与照畦（买信息）不是一回事。
  // 仍要能成立才生效——否则玩家会拿它当廉价洗牌，代价就不再是代价。
  function active() {
    if (done || busy || vm.phase !== 'playing') return;
    if (activeLeft <= 0) {
      C.flash(vm, '挪苗已尽 · 本段只剩自己换', 'bad');
      return;
    }
    activeMode = !activeMode;
    activeFirst = -1;
    selected = -1;
    if (activeMode) C.flash(vm, '挪苗已启：点任意两株换位 · ' + activeCost + ' 息', 'good');
    paint();
    syncHud();
    render();
  }

  function tap(index) {
    // 演出中不收输入：牌还在飞的时候点下一手，点到的是「即将被换掉」的位置。
    if (done || busy || vm.phase !== 'playing' || index < 0 || index >= n) return;
    clearHint();
    if (activeMode) {
      if (sealed[index]) {
        activeMode = false;
        activeFirst = -1;
        C.flash(vm, '石皮封住 · 这一株挪不动', 'bad');
        paint(); syncHud(); render();
        return;
      }
      if (isSeed(board[index])) {
        activeMode = false;
        activeFirst = -1;
        C.flash(vm, '灵种挪不动 · 只能清掉它下面', 'bad');
        paint(); syncHud(); render();
        return;
      }
      if (activeFirst < 0) {
        activeFirst = index;
        selected = index;
        paint(); render();
        return;
      }
      if (activeFirst === index) { activeMode = false; activeFirst = -1; selected = -1; paint(); render(); return; }
      const a = activeFirst;
      activeFirst = -1;
      selected = -1;
      const va = board[a]; const vb = board[index];
      board[a] = vb; board[index] = va;
      const fxA = isFx(va); const fxB = isFx(vb);
      const hits = matchesOf(board, cols, rows);
      if (!hits.length && !fxA && !fxB) {
        board[a] = va; board[index] = vb;
        activeMode = false;
        C.flash(vm, '挪苗没连成三株 · 不扣息，再试', 'bad');
        paint(); syncHud(); render();
        return;
      }
      activeLeft -= 1;
      left = Math.max(0, left - activeCost);
      activeMode = false;
      const all = {};
      hits.forEach(function (i) { all[i] = true; });
      if (fxA) triggerFx(board, cols, rows, index, kinds, vb).forEach(function (i) { all[i] = true; });
      if (fxB) triggerFx(board, cols, rows, a, kinds, va).forEach(function (i) { all[i] = true; });
      busy = true;
      stageClear(Object.keys(all).map(Number), 1);
      if (left <= 0) finish();
      return;
    }
    // 灵种比石皮还硬：它不能换，也不能被别人换走，只能靠下方清空后自己往下掉。
    // 点它不扣息，但必须说清「怎么让它动」——不说，玩家会以为点错了，一直点。
    if (isSeed(board[index])) {
      selected = -1;
      fxSeq += 1;
      shakeAt = [index];
      goneAt = [];
      fallAt = [];
      C.flash(vm, '灵种换不动 · 清掉它下面的牌，它自己会落下', 'bad');
      paint();
      render();
      return;
    }
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
    const fxA = isFx(va);
    const fxB = isFx(vb);
    board[a] = vb;
    board[index] = va;
    let hits = matchesOf(board, cols, rows);
    if (!hits.length && !fxA && !fxB) {
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
    if (fxA || fxB) {
      // 两张符相撞就是组合：清行 + 清列 = 十字；同色符会把那一色整片带走。
      const all = {};
      hits.forEach(function (i) { all[i] = true; });
      if (fxA) triggerFx(board, cols, rows, index, kinds, vb).forEach(function (i) { all[i] = true; });
      if (fxB) triggerFx(board, cols, rows, a, kinds, va).forEach(function (i) { all[i] = true; });
      stageClear(Object.keys(all).map(Number), 1);
      return;
    }
    // 特效生成：四连直行/直列、五连同色、横竖交叉四邻。等级不够就不生成——
    // 前两段还没有这套规则，盘上突然冒出一张符会让玩家以为进错了门。
    let spawn = null;
    if (fxTier > 0) {
      const shape = matchShape(board, cols, rows, index);
      let fx = shape.fx;
      if (fx === FX.rainbow && fxTier < 2) fx = 0;
      if (fx === FX.bomb && fxTier < 3) fx = shape.runs.some(function (r) { return r.len === 4; })
        ? (shape.runs.find(function (r) { return r.len === 4; }).dir === 'row' ? FX.row : FX.col) : 0;
      if (fx && shape.spawn >= 0) spawn = { at: shape.spawn, fx: fx };
    }
    stageClear(hits, 1, spawn);
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

  function pickTwist(id) {
    if (done || twistChosen || vm.phase !== 'twist') return;
    if (!(p.twistChoices || []).some(function (x) { return x.id === id; })) return;
    twistChosen = true;
    // 一紧一松同时生效；S 线按改后的本局时辰现算，抽到「穷息」不会还拿原分数线。
    if (id === 'lean') { kinds = Math.max(3, kinds - 1); sealCount += 4; }
    else if (id === 'flood') { kinds = Math.min(GLYPHS.length, kinds + 1); fxTier = Math.min(3, fxTier + 1); }
    else if (id === 'haste') { duration = Math.max(25, duration - 5); activeMax += 1; }
    else if (id === 'brace') { sealCount += 3; goalCount = Math.max(1, Math.round(goalCount * 0.6)); }
    activeLeft = activeMax;
    // 劫变改了时辰就得按新时辰重算三条线：S/A/B 都是「用掉几成时辰」换算出来的，
    // 时辰一变，同一个比例对应的分就变。不重算就是「抽到穷息的局天然追不到 S」。
    lim = gradeLinesOf({ duration: duration, perMove: p.perMove || 60 });
    sLimit = lim.s; aLimit = lim.a; bLimit = lim.b;
    left = duration;
    vm.twistPick = null;
    begin();
  }

  function start() {
    if (started) return;
    started = true;
    if (twistWanted && !twistChosen) {
      vm.phase = 'twist';
      vm.status = '开局二选一劫变';
      render();
      return;
    }
    begin();
  }

  function begin() {
    vm.phase = 'playing';
    vm.status = '换两株相邻灵草，三株同色连成一线就收走';
    vm.banner = theme.banner || '';
    board = makeBoard(cols, rows, kinds);
    // 灵种先摆：它占格且换不动，要赶在 sealCells 之前定下来——
    // 石皮挑格时要跳过它，否则一格裹两层壳，「收走即解封」还会跟它打架。
    // 盘面放不下就少放几枚（goalCount 改成实际枚数）；一枚都放不下就撤掉目标，
    // 绝不让玩家面对一个盘上做不到的目标。
    if (goalType === 5) {
      goalCount = plantSeeds(board, cols, rows, goalCount);
      if (!goalCount) goalType = 0;
    }
    // 石皮封印：大成起按段注入格数。封印只压「可行换位数」，不改匹配与下落。
    for (let i = 0; i < n; i += 1) sealed[i] = false;
    sealCells(board, cols, rows, sealCount, sealed);
    paint();
    syncHud();
    render();
    bag.every(function () {
      // 达成之后表就冻住了：剩余的几息已经记进 clearLeft，再走下去只会白白吃掉评级。
      if (done || clockFrozen) return;
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
    active: active,
    pickTwist: pickTwist,
    abandon: function () { finishOnce('F', '中途结束'); },
    destroy: function () { bag.clear(); },
  });
}

// 三条评级线的唯一出处：data/practice.js 的 gradeLinesOf。
// 这一门的分有一大半是「剩余时辰折出来的」，所以三条线不是彼此的固定倍数，
// 而是各自对应一个「用掉几成时辰」的比例（0.40 / 0.65 / 0.90）。
// 写成「S 的 0.68 倍」那种派生，在时辰收紧时会让 A/B 跟着漂，与标定对不上。
function gradeLimits(p) {
  return gradeLinesOf({ duration: p && p.duration, perMove: p && p.perMove });
}

function lines(p) {
  const seals = p && typeof p.seals === 'number' ? p.seals : 0;
  const cap = p && typeof p.shuffleCap === 'number' ? p.shuffleCap : 99;
  const special = p && typeof p.special === 'number' ? p.special : 0;
  const goal = p && typeof p.goalType === 'number' ? p.goalType : 0;
  const goalN = p && typeof p.goalCount === 'number' ? p.goalCount : 0;
  const swap = p && typeof p.swapAny === 'number' ? p.swapAny : 0;
  const swapPrice = p && typeof p.swapCost === 'number' ? p.swapCost : 3;
  const goalLine = goal === 1 ? '本局目标：收够指定色 ' + goalN + ' 株'
    : goal === 2 ? '本局目标：做出 ' + goalN + ' 层连锁'
      : goal === 3 ? '本局目标：破开 ' + goalN + ' 格石皮'
        : goal === 4 ? '本局目标：收够指定色且做出 ' + goalN + ' 层连锁'
          : goal === 5 ? '本局目标：' + goalN + ' 枚灵种全部落到底行'
            : goal === 6 ? '本局目标：收灵草 ' + goalN + ' 株' : '';
  return {
    // 终点口径写在这一行：做成目标就收工，没打掉的时辰折成分数，慢慢磨到时辰尽只会掉档。
    rule: '做成目标即收工，未用完的时辰折成分数（无效互换只少息、不扣分；时辰尽仍未做成算未走通）',
    items: [
      'S：四成时辰内做成',
      'A：六成半内做成',
      'B：九成内做成',
      'C：用尽时辰才做成，或未做成',
      // 每条新机制都要在评级卡旁说清：玩家在盘上看见它，就得当场查到它是什么意思。
      seals ? '石皮封印 ' + seals + ' 格：封住的牌不能换，收走它才解封' : '',
      cap < 99 ? '重排前 ' + cap + ' 次原价，之后每次双倍扣息' : '',
      special >= 1 ? '四连凝直行/直列符：下一次换到它就清整行/整列' : '',
      special >= 2 ? '五连凝同色符：与哪株换位就清掉那一色' : '',
      special >= 3 ? '横竖交叉凝四邻符：清周围一圈；两张符相撞效果叠加' : '',
      goalLine,
      swap ? '挪苗 ' + swap + ' 次：每次 ' + swapPrice + ' 息，可换任意两株（仍须成三连）' : '',
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
// 段界教学盘按本段真实规格摆：盘面、花色、罚息、石皮、符箓、目标、挪苗、劫变全取本段的值。
// 只摆一格石皮 / 一枚符做示范，真盘上的数量写在说明里——教学的目的是认得出，不是数得清。
const TEACH_LEVELS = [
  { cols: 6, rows: 6, kinds: 5, missCost: 1, seals: 0, special: 0, goalType: 6, swapAny: 0, twist: 0 },
  { cols: 7, rows: 7, kinds: 6, missCost: 2, seals: 2, special: 0, goalType: 1, swapAny: 1, twist: 0 },
  { cols: 8, rows: 8, kinds: 7, missCost: 2, seals: 5, special: 1, goalType: 2, swapAny: 1, twist: 0 },
  { cols: 9, rows: 9, kinds: 7, missCost: 3, seals: 9, special: 2, goalType: 3, swapAny: 2, twist: 0 },
  { cols: 10, rows: 10, kinds: 7, missCost: 3, seals: 14, special: 3, goalType: 5, swapAny: 2, twist: 2 },
];
const TEACH_GOAL = { 1: '收够指定色', 2: '做出连锁', 3: '破开石皮', 4: '收色并连锁', 5: '引苗落底', 6: '收够灵草' };

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
  // 段二起教学盘上摆一格石皮：只演示「封住的不能换」这一件事（真盘上不止一格），
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
  // 段三起在盘上摆一枚符，只演示「它长什么样」：横杠清行。
  // 不放在示范换位那两格、也不放底行，免得挡住「换一下就成三连」的第一步。
  let fx = -1;
  if (spec.special) {
    for (let i = 0; i < board.length; i += 1) {
      if (i === swap[0] || i === swap[1] || i === seal) continue;
      if (Math.floor(i / spec.cols) === spec.rows - 1) continue;
      board[i] = FX.row;
      fx = i;
      break;
    }
  }
  // 圆满段的目标换成了「引苗落底」，教学盘上就得有灵种可看：
  // 玩家在真盘上第一次见到它时，得认得出「这格换不动、要清它下面」。
  // 位置跟真盘同一档（第 2~3 行起摆），否则教学盘教的摆法在真盘上认不出来。
  // 只摆一枚，数量写在 doneText 里（真盘上不只一枚）。
  let seed = -1;
  if (spec.goalType === 5) {
    for (let i = 2 * spec.cols; i < board.length; i += 1) {
      if (i === swap[0] || i === swap[1] || i === seal || i === fx) continue;
      if (Math.floor(i / spec.cols) === spec.rows - 1) continue;
      board[i] = FX.seed;
      seed = i;
      break;
    }
  }
  return {
    board: board, cols: spec.cols, rows: spec.rows,
    swap: swap, kinds: spec.kinds, seal: seal, fx: fx, seed: seed,
  };
}

function createTeach(ctx) {
  const stage = Math.max(0, Math.min(4, (ctx && ctx.stage) | 0));
  const lay = teachLayout(stage);
  const board = lay.board;
  const seal = typeof lay.seal === 'number' ? lay.seal : -1;
  const fx = typeof lay.fx === 'number' ? lay.fx : -1;
  const seed = typeof lay.seed === 'number' ? lay.seed : -1;
  const cells = K.blank(lay.cols, board.length);
  let sel = -1;
  return K.run(ctx, {
    cols: lay.cols,
    cells: cells,
    status: stage === 0
      ? '教学 · 换相邻两株，凑成三连'
      : '教学 · 这一段 ' + lay.cols + '×' + lay.rows + ' · ' + lay.kinds + ' 色'
        + (seal >= 0 ? ' · 石皮 ' + TEACH_LEVELS[stage].seals + ' 格（这里只摆一格）' : '')
        + (fx >= 0 ? ' · 一枚符，下一次换到它就清整行' : ''),
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
        // 教学盘也走族序映射，并且摆的是本段那一套 —— 段界教学要让玩家认的就是新纹样。
        const crest = board[i] > 0 ? CREST.matchCrestOf(board[i], stage) : 0;
        c.crest = crest;
        c.tone = crest;
        c.label = '';
        c.cls = i === sel ? 'cell cell--chip cell--sel' : 'cell cell--chip';
        if (i === seal) c.cls += ' cell--sealed';
        if (i === fx) c.cls += ' cell--fx cell--fx-row';
        if (i === seed) c.cls += ' cell--seed';
      }
    },
    doneText: stage === 0
      ? '换位是唯一的手：换完要成三连 · 真盘上收满灵草即收工'
      : '这一段 ' + lay.cols + '×' + lay.rows + ' · ' + lay.kinds + ' 色'
        + (seal >= 0 ? ' · 真盘上封 ' + TEACH_LEVELS[stage].seals + ' 格' : '')
        + (TEACH_LEVELS[stage].goalType ? ' · 目标：' + TEACH_GOAL[TEACH_LEVELS[stage].goalType] : '')
        + (seed >= 0 ? '（盘上这枚换不动，清掉它下面它自己会落下）' : '')
        + (TEACH_LEVELS[stage].swapAny ? ' · 挪苗 ' + TEACH_LEVELS[stage].swapAny + ' 次（花息换长手）' : '')
        + (TEACH_LEVELS[stage].twist ? ' · 开局二选一劫变' : '')
        + ' · 换不出三连少 ' + TEACH_LEVELS[stage].missCost + ' 息',
  });
}

const teach = { create: createTeach };

module.exports = {
  id: 'match', name: '三连互换', create: create, lines: lines, teach: teach,
  matchesOf: matchesOf, findMove: findMove, collapse: collapse, GLYPHS: GLYPHS,
  seedsAtBottom: seedsAtBottom, plantSeeds: plantSeeds, sinkSeeds: sinkSeeds, sealCells: sealCells,
  matchShape: matchShape, triggerFx: triggerFx, FX: FX, isFx: isFx, isSeed: isSeed, FX_WORD: FX_WORD,
  MATCH_CRESTS: CREST.MATCH_CRESTS, MATCH_FAMILIES: CREST.MATCH_FAMILIES,
  matchCrestOf: CREST.matchCrestOf,
};
