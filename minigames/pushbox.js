'use strict';

// 推石入位（归箱入阵 / 机关·移石归阵诀专属）：推箱子。
//
// 与「滑块让路」的区别：华容道是整块滑、能左右挪，只求主块出去；
// 这里是人走、石箱只会被推、拉不回来，每个箱子都要对上自己的阵位。
// 与「垒石垒基」的区别：那边是按时间落石堆层，这里是静态盘上的搬运。
//
// 一局一图，且**每局都是新图**：方向键走人，走到石箱后面就能推它一格
// （只能推不能拉，撞墙与撞箱都推不动）。每个阵位都压上一块石箱即入位。
// 推数预算按本图最优推数给，推满还没入位就是走火 F。
// 评级看「已推次数 / 本图最优推数」——用推数而不是步数，是因为走多少步不值钱，
// 把箱子推错方向才是真的费事。
//
// 图为什么不再写死：原来是五张固定图按档分配（简单永远第一张）。图一固定，
// 第三遍开始玩家记的就是答案而不是走法——「先给谁让路」这一门的心智活动直接消失，
// 只剩下把记熟的顺序按一遍。十二原则第一条（一门功法一套玩法）说的就是这件事：
// 玩法内核是「推演」，不是「回忆」。所以档位只管规格（盘多大、几个箱、几道内墙、
// 最优推数落在哪个区间），图由生成器按规格现抽，每局不同。

const C = require('./common.js');

// 兜底五张：只在生成器连续抽不中时用一个（正常一局都见不到它们）。
// # 墙 / . 地 / b 石箱 / o 阵位 / p 人 / * 箱在阵位上 / + 人在阵位上。
// 每张都验过能解；它们现在的作用是「生成器彻底失灵时这一局也能开」。
const LEVELS = [
  // 两张两推：先教「绕到箱子背后才推得动」。
  [
    '######',
    '#....#',
    '#.b..#',
    '#..o.#',
    '#.p..#',
    '######',
  ],
  // 三推：中间多一道石壁，得把箱子推下去再横着挪。
  [
    '######',
    '#....#',
    '#.b#.#',
    '#...o#',
    '#.p..#',
    '######',
  ],
  // 四推：路被墙角收窄，推错方向得绕一圈补回来，绕不回来就只能复位（复位过最高 A）。
  [
    '######',
    '#....#',
    '#.b..#',
    '#.#..#',
    '#.o..#',
    '#..p.#',
    '######',
  ],
  // 四推、两个箱子：两处阵位各要一块，不能拿一块顶两处。
  [
    '######',
    '#....#',
    '#.b.b#',
    '#....#',
    '#.o.o#',
    '#.p..#',
    '######',
  ],
  // 六推：两箱两阵位，中间有隔断，得先给一块让路。
  [
    '######',
    '#....#',
    '#.b.b#',
    '#.#..#',
    '#.o.o#',
    '#..p.#',
    '######',
  ],
];

function parse(rows) {
  const out = { cols: 0, rows: rows.length, walls: [], boxes: [], goals: [], player: 0 };
  out.cols = rows[0].length;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const ch = rows[r][c];
      const i = r * out.cols + c;
      if (ch === '#') out.walls.push(i);
      if (ch === 'b' || ch === '*') out.boxes.push(i);
      if (ch === 'o' || ch === '*' || ch === '+') out.goals.push(i);
      if (ch === 'p' || ch === '+') out.player = i;
    }
  }
  return out;
}

function isWall(walls, cols, i) { return walls.indexOf(i) >= 0; }

// 人从 player 出发能走到的格子（箱子挡路）。判「推之前人能不能站到箱子后面」用它。
function reachable(walls, boxes, cols, rows, from) {
  const seen = {};
  const stack = [from];
  seen[from] = true;
  const out = [];
  while (stack.length) {
    const i = stack.pop();
    out.push(i);
    const r = Math.floor(i / cols);
    const c = i % cols;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let k = 0; k < dirs.length; k += 1) {
      const nr = r + dirs[k][0];
      const nc = c + dirs[k][1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const j = nr * cols + nc;
      if (seen[j] || isWall(walls, cols, j) || boxes.indexOf(j) >= 0) continue;
      seen[j] = true;
      stack.push(j);
    }
  }
  return out;
}

// 最少推数：按「推一次算一步」做 BFS，人在盘上怎么绕是无所谓的。
// 同一张图上重复算一次只要几毫秒，比在数据里手写最优推数可靠。
// cap 是「找够这么多推就放弃」的上限：生成器只要知道这张图有没有超出本段上界，
// 不关心它到底要二十推还是三十推——按 80 层跑满纯属浪费。
function solve(level, cap) {
  const g = parse(level);
  const { cols, rows, walls } = g;
  const limit = cap || 80;
  const boxes = g.boxes.slice().sort(function (a, b) { return a - b; });
  const start = { player: g.player, boxes: boxes };
  const goalKey = g.goals.slice().sort(function (a, b) { return a - b; }).join(',');
  const keyOf = function (st) { return st.player + '|' + st.boxes.slice().sort(function (a, b) { return a - b; }).join(','); };
  const done = function (st) {
    const b = st.boxes.slice().sort(function (a, b2) { return a - b2; }).join(',');
    return b === goalKey;
  };
  if (done(start)) return 0;
  const seen = {};
  seen[keyOf(start)] = true;
  let frontier = [start];
  for (let depth = 1; depth <= limit; depth += 1) {
    const next = [];
    for (let f = 0; f < frontier.length; f += 1) {
      const st = frontier[f];
      const canWalk = reachable(walls, st.boxes, cols, rows, st.player);
      for (let w = 0; w < canWalk.length; w += 1) {
        const from = canWalk[w];
        const r = Math.floor(from / cols);
        const c = from % cols;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let k = 0; k < dirs.length; k += 1) {
          const nr = r + dirs[k][0];
          const nc = c + dirs[k][1];
          const tr = r + dirs[k][0] * 2;
          const tc = c + dirs[k][1] * 2;
          if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) continue;
          const box = nr * cols + nc;
          const to = tr * cols + tc;
          if (st.boxes.indexOf(box) < 0) continue;
          if (isWall(walls, cols, to) || st.boxes.indexOf(to) >= 0) continue;
          const nb = st.boxes.slice();
          nb[nb.indexOf(box)] = to;
          const cand = { player: box, boxes: nb };
          const kk = keyOf(cand);
          if (seen[kk]) continue;
          seen[kk] = true;
          if (done(cand)) return depth;
          next.push(cand);
        }
      }
    }
    if (!next.length) return -1;
    frontier = next;
  }
  return -1;
}

// ---------------------------------------------------------------- 每局现生成

// 档位规格：盘面从六格长到七格，难度落在「几处阵位、几道内墙、最优推数区间」三处。
// 三处都随档递增，相邻档只差一档（原则三：递增曲线平缓，不做断崖）。
// 区间下界是**承诺**（本段不会抽到一步就推完的图），上界是护栏
//（极端图会让推数预算失去意义，也可能把阵位堵成死格）。
// pulls 不是难度参数，是生成强度：从解往回拉几步。4×4 内盘只有十六格，
// 拉过头会被墙反复弹回，所以五档各留一个实测过的值。
const GEN = [
  { inner: 4, boxes: 1, walls: 0, pulls: 5, minOpt: 2, maxOpt: 3 },
  { inner: 4, boxes: 1, walls: 1, pulls: 6, minOpt: 2, maxOpt: 4 },
  { inner: 4, boxes: 2, walls: 1, pulls: 9, minOpt: 3, maxOpt: 5 },
  { inner: 5, boxes: 2, walls: 2, pulls: 11, minOpt: 4, maxOpt: 6 },
  { inner: 5, boxes: 3, walls: 2, pulls: 15, minOpt: 5, maxOpt: 8 },
];

// 玩法层只认「这一档的规格」：params 里带了的数就用它（准备页与局内同源），
// 缺的按 depth 从兜底表取。测试直接 create 时走的就是兜底表这条路。
function specOf(p) {
  const src = p || {};
  const depth = Math.max(0, Math.min(GEN.length - 1, typeof src.depth === 'number' ? src.depth : 0));
  const base = GEN[depth];
  const pick = function (k) { return typeof src[k] === 'number' ? src[k] : base[k]; };
  return {
    inner: Math.max(3, pick('inner')),
    boxes: Math.max(1, pick('boxes')),
    walls: Math.max(0, pick('walls')),
    pulls: Math.max(2, pick('pulls')),
    minOpt: Math.max(1, pick('minOpt')),
    maxOpt: Math.max(pick('minOpt'), pick('maxOpt')),
  };
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function insideCell(inner, p) {
  return p[0] >= 1 && p[1] >= 1 && p[0] <= inner && p[1] <= inner;
}

// 死位：一块石箱站在这格，被推来推去还推不推得到任何一处阵位。
// 判定刻意比真实局面**宽松**——只认石壁，把别的石箱、人要怎么绕都当成不存在。
// 宽松都推不到，真实局面就更推不到，所以标出来的每一格都是真的死：
// 宁可漏标，绝不冤标。冤标的代价比漏标大得多——玩家会照着暗纹绕开一条本来能走的路。
// 推进死位的箱子再也推不出来，这一局只能复位（复位过最高 A）。
function deadCellsOf(level) {
  const g = parse(level);
  const cols = g.cols;
  const rows = g.rows;
  const wallAt = {};
  for (let i = 0; i < g.walls.length; i += 1) wallAt[g.walls[i]] = true;
  const goalAt = {};
  for (let i = 0; i < g.goals.length; i += 1) goalAt[g.goals[i]] = true;
  const out = [];
  for (let start = 0; start < cols * rows; start += 1) {
    if (wallAt[start] || goalAt[start]) continue;
    const seen = {};
    seen[start] = true;
    const queue = [start];
    let can = false;
    while (queue.length && !can) {
      const b = queue.shift();
      const r = Math.floor(b / cols);
      const c = b % cols;
      for (let k = 0; k < DIRS4.length; k += 1) {
        const nr = r + DIRS4[k][0];
        const nc = c + DIRS4[k][1];
        const sr = r - DIRS4[k][0];
        const sc = c - DIRS4[k][1];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) continue;
        const to = nr * cols + nc;
        const stand = sr * cols + sc;
        // 人要站的那一格是石壁就推不出去；推到的格子是石壁也推不动。
        if (wallAt[stand] || wallAt[to]) continue;
        if (goalAt[to]) { can = true; break; }
        if (seen[to]) continue;
        seen[to] = true;
        queue.push(to);
      }
    }
    if (!can) out.push(start);
  }
  return out;
}

// 反向生成：先把每块石箱摆在它自己的阵位上（这一局等于已经「入位」），
// 再从解往回把箱子一格一格「拉」开。每一步都要求人能站到正推时该站的位置，
// 所以最后得到的盘面**一定可解**——正向照反序推回去就是答案。
// 反过来做（随机撒箱子、再 BFS 判有没有解）试过：4×4 里六成以上的随机位置
// 箱子已经顶死在墙角，既推不动也解不开，一局要抽几十次才有一张能用。
function buildOnce(spec) {
  const inner = spec.inner;
  const side = inner + 2;
  const cells = [];
  for (let r = 0; r < side; r += 1) {
    const line = [];
    for (let c = 0; c < side; c += 1) {
      line.push((r === 0 || c === 0 || r === side - 1 || c === side - 1) ? '#' : '.');
    }
    cells.push(line);
  }
  const spots = [];
  for (let r = 1; r <= inner; r += 1) for (let c = 1; c <= inner; c += 1) spots.push([r, c]);
  C.shuffle(spots);
  let at = 0;
  const walls = [];
  for (let i = 0; i < spec.walls; i += 1) {
    const s = spots[at];
    at += 1;
    if (!s) return null;
    walls.push(s);
    cells[s[0]][s[1]] = '#';
  }
  // 阵位不放四角：四角的阵位要从角上拉出去，两个方向总有一头是墙，
  // 反向这一步做不出来（正向当然可解，是生成器表达不了），抽到就换一格。
  const goals = [];
  while (goals.length < spec.boxes) {
    const s = spots[at];
    at += 1;
    if (!s) return null;
    if ((s[0] === 1 || s[0] === inner) && (s[1] === 1 || s[1] === inner)) continue;
    goals.push(s);
    cells[s[0]][s[1]] = 'o';
  }
  const boxes = goals.map(function (g) { return [g[0], g[1]]; });
  let player = spots[at];
  if (!player) return null;

  const wallIdx = walls.map(function (w) { return w[0] * side + w[1]; });
  const goalAt = {};
  goals.forEach(function (g) { goalAt[g[0] + ',' + g[1]] = true; });

  let pulled = 0;
  let last = -1;
  // 拉几步不写死：同一个参数每次都在上下一格之间浮动，这一档的图才会有「这次绕一点、
  // 下次直一点」的差别，而不是每张都刚好是 pulls ÷ 2 那么长。
  const want = Math.max(2, spec.pulls + C.randInt(2) - 1);
  for (let t = 0; t < want * 24 && pulled < want; t += 1) {
    const bi = C.randInt(boxes.length);
    const di = C.randInt(4);
    // 同一块箱子，上一步往哪拉，这一步不许往反方向拉：那是把上一步原样推回去，
    // 净位移为零却吃掉一次机会，最后抽出一张「看着乱、其实两步就完」的图。
    if (last >= 0 && bi === (last >> 2) && di === ((last & 3) ^ 1)) continue;
    const d = DIRS4[di];
    const b = boxes[bi];
    const dest = [b[0] - d[0], b[1] - d[1]];
    const stand = [b[0] - 2 * d[0], b[1] - 2 * d[1]];
    if (!insideCell(inner, dest) || !insideCell(inner, stand)) continue;
    if (cells[dest[0]][dest[1]] === '#' || cells[stand[0]][stand[1]] === '#') continue;
    // 箱子不许停在阵位上：那等于这一箱开局就已经入位，白送一处。
    if (goalAt[dest[0] + ',' + dest[1]]) continue;
    let clash = false;
    for (let j = 0; j < boxes.length; j += 1) {
      if (j === bi) continue;
      if (boxes[j][0] === dest[0] && boxes[j][1] === dest[1]) clash = true;
      if (boxes[j][0] === stand[0] && boxes[j][1] === stand[1]) clash = true;
    }
    if (clash) continue;
    const boxIdx = boxes.map(function (q) { return q[0] * side + q[1]; });
    const canWalk = reachable(wallIdx, boxIdx, side, side, player[0] * side + player[1]);
    if (canWalk.indexOf(stand[0] * side + stand[1]) < 0) continue;
    boxes[bi] = dest;
    player = stand;
    pulled += 1;
    last = (bi << 2) | di;
  }
  // 一步都没拉开：箱子全在阵位上，这一局等于白送。重抽。
  if (pulled < 2) return null;

  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    if (goalAt[b[0] + ',' + b[1]]) continue;
    cells[b[0]][b[1]] = 'b';
  }
  // 人站在阵位上是 '+'：直接写 'p' 会把阵位抹掉，parse 之后少一处阵位，
  // 这一局就永远解不开——反向生成的第一版正是栽在这里。
  cells[player[0]][player[1]] = goalAt[player[0] + ',' + player[1]] ? '+' : 'p';
  return cells.map(function (l) { return l.join(''); });
}

// 抽一张落在本段区间里的图。抽不中就把「离区间最近」的那张交出去：
// 略难或略易都只是偏差，开不出局才是事故。最多试 24 次，
// 生成一次 BFS 的代价是毫秒级，24 次的上限保证开局不卡。
function generateBoard(spec) {
  const s = spec || specOf({});
  let best = null;
  let bestGap = Infinity;
  for (let t = 0; t < 24; t += 1) {
    const rows = buildOnce(s);
    if (!rows) continue;
    const opt = solve(rows, s.maxOpt + 2);
    if (opt < 0) continue;
    if (opt >= s.minOpt && opt <= s.maxOpt) return { rows: rows, optimal: opt };
    const gap = opt < s.minOpt ? s.minOpt - opt : opt - s.maxOpt;
    if (gap < bestGap) {
      bestGap = gap;
      best = { rows: rows, optimal: opt };
    }
  }
  return best;
}

// 一张图上「人的最短走法」：只在空地上走，箱子当墙。
// 只给 solutionMoves 拼完整走法用，不参与评级。
function walkPath(walls, boxes, cols, rows, from, to) {
  if (from === to) return [];
  const prev = {};
  prev[from] = null;
  const queue = [from];
  const dirs = [[1, 0, 'down'], [-1, 0, 'up'], [0, 1, 'right'], [0, -1, 'left']];
  while (queue.length) {
    const i = queue.shift();
    const r = Math.floor(i / cols);
    const c = i % cols;
    for (let k = 0; k < dirs.length; k += 1) {
      const nr = r + dirs[k][0];
      const nc = c + dirs[k][1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const j = nr * cols + nc;
      if (prev[j] !== undefined || isWall(walls, cols, j) || boxes.indexOf(j) >= 0) continue;
      prev[j] = { at: i, dir: dirs[k][2] };
      if (j === to) {
        const out = [];
        let cur = j;
        while (prev[cur]) { out.push(prev[cur].dir); cur = prev[cur].at; }
        return out.reverse();
      }
      queue.push(j);
    }
  }
  return null;
}

// 解法回放：把「先走哪几步、再推哪一下」拼成一串方向。
// 评级用的仍是最少推数；这里只负责让一盘真的能走完（测试与自检用）。
function solutionMoves(level) {
  const g = parse(level);
  const { cols, rows, walls } = g;
  const goalKey = g.goals.slice().sort(function (a, b) { return a - b; }).join(',');
  const keyOf = function (st) { return st.player + '|' + st.boxes.slice().sort(function (a, b) { return a - b; }).join(','); };
  const sortedBoxes = g.boxes.slice().sort(function (a, b) { return a - b; });
  const done = function (boxes) {
    return boxes.slice().sort(function (a, b) { return a - b; }).join(',') === goalKey;
  };
  if (done(sortedBoxes)) return [];
  const prev = {};
  const startKey = keyOf({ player: g.player, boxes: sortedBoxes });
  prev[startKey] = null;
  let frontier = [{ player: g.player, boxes: sortedBoxes, key: startKey }];
  let goalNode = null;
  for (let depth = 1; depth <= 80 && !goalNode; depth += 1) {
    const next = [];
    for (let f = 0; f < frontier.length && !goalNode; f += 1) {
      const st = frontier[f];
      const walk = reachable(walls, st.boxes, cols, rows, st.player);
      for (let w = 0; w < walk.length && !goalNode; w += 1) {
        const from = walk[w];
        const r = Math.floor(from / cols);
        const c = from % cols;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let k = 0; k < dirs.length; k += 1) {
          const nr = r + dirs[k][0];
          const nc = c + dirs[k][1];
          const tr = r + dirs[k][0] * 2;
          const tc = c + dirs[k][1] * 2;
          if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) continue;
          const box = nr * cols + nc;
          const to = tr * cols + tc;
          if (st.boxes.indexOf(box) < 0) continue;
          if (isWall(walls, cols, to) || st.boxes.indexOf(to) >= 0) continue;
          const nb = st.boxes.slice();
          nb[nb.indexOf(box)] = to;
          const cand = { player: box, boxes: nb };
          const kk = keyOf(cand);
          if (prev[kk] !== undefined) continue;
          prev[kk] = { prev: st.key, player: st.player, box: box, to: to };
          cand.key = kk;
          if (done(nb)) { goalNode = cand; break; }
          next.push(cand);
        }
      }
    }
    frontier = next;
  }
  if (!goalNode) return null;
  // 倒着收集「推哪一下」，再正向回放成人走的每一步。
  const pushes = [];
  let cur = goalNode.key;
  while (prev[cur]) {
    const step = prev[cur];
    pushes.push({ player: step.player, box: step.box, to: step.to });
    cur = step.prev;
  }
  pushes.reverse();
  const dirName = function (from, to) {
    if (to === from + cols) return 'down';
    if (to === from - cols) return 'up';
    if (to === from + 1) return 'right';
    return 'left';
  };
  const moves = [];
  let player = g.player;
  let boxes = sortedBoxes.slice();
  for (let i = 0; i < pushes.length; i += 1) {
    const step = pushes[i];
    const behind = step.box - (step.to - step.box);
    const walk = walkPath(walls, boxes, cols, rows, player, behind);
    if (!walk) return null;
    for (let w = 0; w < walk.length; w += 1) moves.push(walk[w]);
    moves.push(dirName(step.box, step.to));
    player = step.box;
    boxes[boxes.indexOf(step.box)] = step.to;
  }
  return moves;
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  // 阶段新法（真源在 data/practice.js 的 STAGE_RULES）：大成标死位、大圆满再标「一推就进去」。
  // 两条都不动判定：能推的照样推得动，推错照样费推数。
  const stage = typeof (ctx.perks && ctx.perks.tier) === 'number' ? ctx.perks.tier : 0;
  const spec = specOf(p);
  // 一局一图：每局都在本段规格里现抽一张。只有参数被改成不可能的组合
  //（例如 4×4 内盘要塞六个箱子）才会退回兜底图——正常一局见不到那张。
  const board = generateBoard(spec) || { rows: LEVELS[0], optimal: Math.max(1, solve(LEVELS[0])) };
  const level = board.rows;
  const g = parse(level);
  const cols = g.cols;
  const rows = g.rows;
  const n = cols * rows;
  const optimal = Math.max(1, board.optimal);
  const capPushes = Math.max(optimal + 4, Math.ceil(optimal * (p.capFactor || 1.9)));
  // 死位只跟石壁与阵位有关，整局算一次；paint 只负责按段位挂类名。
  const dead = deadCellsOf(level);
  const deadAt = {};
  if (stage >= 3) {
    for (let i = 0; i < dead.length; i += 1) deadAt[dead[i]] = true;
  }
  const costText = ctx.tip || '推错可退一步，推数照算；复位后本盘最高 A';

  const vm = C.makeVm(cols, n, '把每块石箱推到阵位上', costText);
  vm.extras.compact = true;
  vm.extras.showPad = true;
  vm.extras.showUndo = true;
  vm.extras.showReset = true;
  vm.pad = {
    keys: [
      { id: 'up', dir: 'up', icon: 'up', glyph: '上' },
      { id: 'left', dir: 'left', icon: 'left', glyph: '左' },
      { id: 'down', dir: 'down', icon: 'down', glyph: '下' },
      { id: 'right', dir: 'right', icon: 'right', glyph: '右' },
    ],
  };

  let player = g.player;
  let boxes = g.boxes.slice();
  let pushes = 0;
  let steps = 0;
  let history = [];
  let failed = false;
  // 复位过就本盘封顶 A（与阵灯推演、滑块让路同一条规矩）。
  // 复位把推数清零、图又是固定的，不封顶的话「推一步→复位→再推」能白试出最优解。
  let resetUsed = false;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function onGoal(i) { return g.goals.indexOf(i) >= 0; }

  function placed() {
    let k = 0;
    for (let i = 0; i < boxes.length; i += 1) if (onGoal(boxes[i])) k += 1;
    return k;
  }

  function paint() {
    // 大圆满「临渊」：这一推会把石箱送进死位，那个格子先描红——警告说的是「再推一格就完了」，
    // 静的暗纹说的只是「这格不能进」，两者在不同时刻有用。
    const near = {};
    if (stage >= 5) {
      for (let b = 0; b < boxes.length; b += 1) {
        if (onGoal(boxes[b])) continue;
        const br = Math.floor(boxes[b] / cols);
        const bc = boxes[b] % cols;
        for (let k = 0; k < DIRS4.length; k += 1) {
          const nr = br + DIRS4[k][0];
          const nc = bc + DIRS4[k][1];
          const sr = br - DIRS4[k][0];
          const sc = bc - DIRS4[k][1];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) continue;
          const to = nr * cols + nc;
          if (!deadAt[to]) continue;
          if (isWall(g.walls, cols, sr * cols + sc)) continue;
          // 那一格被另一块石箱或人自己占着，这一推根本不成立。
          if (boxes.indexOf(to) >= 0 || to === player) continue;
          near[to] = true;
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      cell.arrow = -1;
      cell.end = false;
      cell.tone = 0;
      if (isWall(g.walls, cols, i)) {
        cell.cls = 'cell cell--wall';
        cell.label = '';
        cell.emblem = 0;
      } else if (boxes.indexOf(i) >= 0) {
        const ok = onGoal(i);
        cell.cls = ok ? 'cell cell--boxed cell--on-goal' : 'cell cell--boxed';
        // 已经推进死位的箱子：不必等玩家复位再猜，这一格当场描红。
        if (deadAt[i]) cell.cls += ' cell--doom-hit';
        cell.label = ok ? '▩' : '▣';
        cell.emblem = 13;
      } else if (i === player) {
        cell.cls = onGoal(i) ? 'cell cell--man cell--on-goal' : 'cell cell--man';
        if (deadAt[i]) cell.cls += ' cell--doom';
        cell.label = '☉';
        cell.emblem = 15;
      } else if (onGoal(i)) {
        cell.cls = 'cell cell--goal';
        cell.label = '○';
        cell.emblem = 14;
      } else {
        cell.cls = 'cell cell--floor';
        if (deadAt[i]) cell.cls += ' cell--doom';
        if (near[i]) cell.cls += ' cell--doom-hit';
        cell.label = '';
        cell.emblem = 0;
      }
    }
    vm.pushbox = {
      cols: cols, rows: rows, boxes: boxes.slice(), goals: g.goals.slice(), player: player,
      // 这张图的死位（与段位无关，始终是同一份；标不标由段位决定）：
      // 测试拿它跟自己重算的结果对，两边都要一样。
      dead: dead.slice(),
      // 当局的石图：测试靠它把这一盘真的走完（图每局都变，不能再从 LEVELS 取）。
      layout: level.slice(),
    };
  }

  // 评级只认推数，不认用时。借过外力（复位本盘）就封顶到 A——
  // S 是同一条推演路径上一次没推错的结果，靠清账重来拿到的不算。
  function gradeOf() {
    if (failed) return 'F';
    let g;
    if (pushes <= optimal) g = 'S';
    else if (pushes <= optimal + 2) g = 'A';
    else if (pushes <= optimal * 2) g = 'B';
    else g = 'C';
    if (g === 'S' && resetUsed) return 'A';
    return g;
  }

  function syncHud() {
    const ok = placed();
    vm.timeText = '余 ' + Math.max(0, capPushes - pushes) + ' 推';
    vm.progress = C.pct(ok, g.goals.length);
    vm.progressText = '入位 ' + ok + ' / ' + g.goals.length;
    vm.scoreText = '已推 ' + pushes + ' 次';
    vm.goal = '已推 ' + pushes + ' 次 · 最优 ' + optimal + ' 次 · 预算 ' + capPushes + ' 次';
    vm.gradeNow = gradeOf();
    vm.hint = costText + ' · 已走 ' + steps + ' 步';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    vm.phase = 'done';
    vm.status = grade === 'F' ? '推不动了' : '入位';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({ grade: grade, score: failed ? 0 : Math.max(0, (capPushes - pushes) * 20 + 200), summary: summary, notes: notesOf() });
  }

  function notesOf() {
    const notes = [];
    if (failed) {
      notes.push('推数预算 ' + capPushes + ' 次走完，还有 ' + (g.goals.length - placed()) + ' 处阵位空着。');
      notes.push('这一图最优 ' + optimal + ' 次；石箱顶进角落就早点复位重来，别硬推（复位过最高只到 A）。');
      return notes;
    }
    const gap = pushes - optimal;
    if (gap <= 0) notes.push('正好推 ' + optimal + ' 次，一次没多。');
    else if (gap <= 2) notes.push('比最优多推 ' + gap + ' 次（最优 ' + optimal + ' 次）· S 要一次不多。');
    else if (pushes <= optimal * 2) notes.push('推了 ' + pushes + ' 次，最优 ' + optimal + ' 次 · A 线是多两次以内。');
    else notes.push('推了 ' + pushes + ' 次，超过最优的两倍（' + optimal * 2 + ' 次）。');
    return notes;
  }

  function checkFail() {
    if (done) return false;
    if (pushes >= capPushes && placed() < g.goals.length) {
      failed = true;
      C.flash(vm, '推数用尽 · 没能入位', 'bad');
      finishOnce('F', '推数用尽，石箱未全入位');
      return true;
    }
    return false;
  }

  function push(dir) {
    if (done || vm.phase !== 'playing') return;
    const k = { down: 0, up: 1, right: 2, left: 3 }[dir];
    if (k === undefined) return;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const dr = dirs[k][0];
    const dc = dirs[k][1];
    const r = Math.floor(player / cols);
    const c = player % cols;
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
    const target = nr * cols + nc;
    if (isWall(g.walls, cols, target)) {
      vm.status = '那边是石壁';
      render();
      return;
    }
    const bi = boxes.indexOf(target);
    if (bi >= 0) {
      const tr = nr + dr;
      const tc = nc + dc;
      if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) { vm.status = '箱子后面没地方了'; render(); return; }
      const to = tr * cols + tc;
      if (isWall(g.walls, cols, to) || boxes.indexOf(to) >= 0) {
        vm.status = '推不动：箱子后面被挡住了';
        C.flash(vm, '推不动', 'bad');
        render();
        return;
      }
      history.push({ player: player, boxes: boxes.slice(), steps: steps });
      boxes[bi] = to;
      player = target;
      pushes += 1;
      steps += 1;
      C.flash(vm, '推了一格', 'good');
    } else {
      history.push({ player: player, boxes: boxes.slice(), steps: steps });
      player = target;
      steps += 1;
    }
    paint();
    syncHud();
    if (placed() >= g.goals.length) {
      C.flash(vm, '全部入位 · ' + pushes + ' 推', 'gold');
      finishOnce(gradeOf(), '入位 · 用 ' + pushes + ' 推（最优 ' + optimal + ' 推）');
      return;
    }
    if (checkFail()) return;
    render();
  }

  function restore() {
    player = g.player;
    boxes = g.boxes.slice();
    pushes = 0;
    steps = 0;
    history = [];
    failed = false;
    paint();
    syncHud();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    restore();
    vm.status = '走到石箱后面，按方向键把它推出去';
    render();
  }

  paint();
  syncHud();
  render();

  return C.fillController({
    start: start,
    move: push,
    // 退回一步只退位置，不退推数：推错的那一下已经发生，撤销是「把人挪回来」，
    // 不是把这一推抹掉。否则推一步→撤销→再推能把一张固定的图白试出最优解。
    undo: function () {
      if (done || vm.phase !== 'playing' || !history.length) return;
      const h = history.pop();
      player = h.player;
      boxes = h.boxes.slice();
      steps = h.steps;
      vm.status = '退回一步 · 这一推照算';
      paint();
      syncHud();
      render();
    },
    reset: function () {
      if (done || vm.phase !== 'playing') return;
      restore();
      resetUsed = true;
      vm.status = '盘面复位 · 本盘最高 A';
      C.flash(vm, '盘面复位 · 本盘最高 A', 'good');
      render();
    },
    abandon: function () { finishOnce('F', '中途收功'); },
  });
}

// 说明页与准备页要的是「本段的图大概多难」。图每局现抽，所以这里给区间不给具体数——
// 局内 HUD 报的是这一张图自己的最优（生成时就解出来了），两个数不冲突也不重复。
function lines(p) {
  const spec = specOf(p);
  return {
    rule: '按已推次数与本图最优推数比（走多少步不算）',
    items: [
      'S：正好本图最优（本段 ' + spec.minOpt + '～' + spec.maxOpt + ' 推 · ' + spec.boxes + ' 处阵位）',
      'A：多 2 次以内',
      'B：不超过最优的两倍',
      'C：超过两倍才全部入位',
      '撤销不退推数；复位过本盘，最高只到 A',
    ],
    fail: '推数预算用尽还没全部入位 → 走火 F，这一局没有收益',
  };
}

module.exports = {
  id: 'pushbox',
  name: '推石入位',
  create: create,
  lines: lines,
  solve: solve,
  deadCellsOf: deadCellsOf,
  solutionMoves: solutionMoves,
  specOf: specOf,
  generateBoard: generateBoard,
  LEVELS: LEVELS,
  GEN: GEN,
};
