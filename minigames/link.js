'use strict';

// 灵纹连线（牵灵引线 / 御灵·并蒂连枝引）专属：经典连连看。
// 盘面只放几种形状，点两枚同纹、且能用不超过两次转折的线连起来，就收走这一对。
//
// 与「成对翻牌」的区别：翻牌考记位置，这里考找通路——盘外一圈是空的，边上的灵纹
// 可以绕盘外走；同类却隔着一堵纹的，就得先清掉挡路的那一对。
//
// 经典玩法最容易劝退的两处都补齐了：
//   ① 开局与每次消除后都保证「至少还有一对可连」，否则自动把剩余灵纹重排；
//   ② 提示照见一对真能连上的纹，不是随便指两格。
// 重排不扣息：死局是盘面随机摆出来的，玩家管不着，罚息等于罚运气；代价改成连收断掉。

const C = require('./common.js');

const GLYPHS = ['✦', '◆', '●', '▲', '■', '✿'];
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// 评级只认一件事：收干净那一刻还剩几息。
//
// 以前按得分评（每对 100 分 × 连收倍率，收完再加剩余息 ×4）。问题是「收干净」本身
// 就把分数撑满了：12 对最少也有 1200 分，而 A 线最高只到 1199、B 线 845——B 与 C
// 是死线，走完的局永远至少 A；更糟的是局内 HUD 只看分数，会在还差三对时宣布
// 「已入 S · 稳住这一局」，结算却给 F（失败）。分数现在只记连收手感，评级改看剩余息：
// 倒计时就摆在 HUD 上，玩家自己算得出「再快几息能进 S」。
const GRADE_LEFT = [0.32, 0.16, 0.04];   // S / A / B：收干净时至少剩本局时辰的 32% / 16% / 4%

function gradeLefts(duration) {
  return {
    s: Math.ceil(duration * GRADE_LEFT[0]),
    a: Math.ceil(duration * GRADE_LEFT[1]),
    b: Math.ceil(duration * GRADE_LEFT[2]),
  };
}

function gradeByLeft(left, duration) {
  const g = gradeLefts(duration);
  if (left >= g.s) return 'S';
  if (left >= g.a) return 'A';
  if (left >= g.b) return 'B';
  return 'C';
}

// 最多两次转折的连线判定。把盘面外扩一圈空位，边上的灵纹也能从盘外绕过去。
// 纯函数：玩法层和测试用同一套规则，改判定不会偷偷改掉测试期望。
//
// 返回的是**一条真的线**，不是「能连 / 不能连」：
// 玩家点两枚同纹，最想看见的是那根折线从哪儿绕过去了 —— 尤其「从上边绕」「从左边绕」
// 这类判法，光看两枚牌消失，学不会这一门的规则。点失败时也要有地方说「卡在哪」，
// 所以路径由这里交出来，页面只负责画。
// 坐标是外扩后的网格坐标（0 与 cols+1 都算盘外），页面按「减半格」换算成百分比。
function findPath(board, cols, rows, a, b) {
  if (a === b || a < 0 || b < 0 || a >= board.length || b >= board.length) return null;
  const va = board[a];
  if (!va || va !== board[b]) return null;
  const W = cols + 2;
  const H = rows + 2;
  const ext = new Array(W * H).fill(0);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (board[r * cols + c]) ext[(r + 1) * W + c + 1] = board[r * cols + c];
    }
  }
  const ar = Math.floor(a / cols) + 1;
  const ac = a % cols + 1;
  const br = Math.floor(b / cols) + 1;
  const bc = b % cols + 1;
  // 状态是 (r, c, dir, turns)：dir=-1 是还没定向的起手，换一次方向记一次转折。
  const best = {};
  const parent = {};
  const pos = {};
  const queue = [{ r: ar, c: ac, dir: -1, turns: 0, key: 's' }];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    for (let d = 0; d < 4; d += 1) {
      const turns = cur.dir === -1 || cur.dir === d ? cur.turns : cur.turns + 1;
      if (turns > 2) continue;
      const nr = cur.r + DIRS[d][0];
      const nc = cur.c + DIRS[d][1];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      if (nr === br && nc === bc) {
        // 走到终点就顺着 parent 一路回溯，逐格路径压成转折点再交出去。
        const pts = [{ r: br, c: bc }];
        let k = cur.key;
        while (k !== 's') {
          pts.push(pos[k]);
          k = parent[k];
        }
        pts.push({ r: ar, c: ac });
        pts.reverse();
        return compressPath(pts);
      }
      if (ext[nr * W + nc]) continue;             // 中间格必须为空，终点已在上面判过
      const key = (nr * W + nc) * 4 + d;
      if (best[key] !== undefined && best[key] <= turns) continue;
      best[key] = turns;
      parent[key] = cur.key;
      pos[key] = { r: nr, c: nc };
      queue.push({ r: nr, c: nc, dir: d, turns: turns, key: key });
    }
  }
  return null;
}

// 去掉中间共线的点：一格一格的路径画出来跟锯齿一样，也没必要。
// 只剩转折点之后，相邻两点必定同行或同列 —— 页面因此只需要画横线与竖线，不用算角度。
function compressPath(pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    if ((a.r === b.r && b.r === c.r) || (a.c === b.c && b.c === c.c)) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function canLink(board, cols, rows, a, b) {
  return !!findPath(board, cols, rows, a, b);
}

// avoid 是一次照纹里已经指过的那一对：大圆满的「双照」要再找一对**不同的**，
// 否则两次照见同一对，玩家等于白扣息。
function findPair(board, cols, rows, avoid) {
  const skip = avoid || {};
  const left = [];
  for (let i = 0; i < board.length; i += 1) if (board[i]) left.push(i);
  const byKind = {};
  for (let i = 0; i < left.length; i += 1) {
    const v = board[left[i]];
    if (!byKind[v]) byKind[v] = [];
    byKind[v].push(left[i]);
  }
  const kinds = Object.keys(byKind);
  for (let k = 0; k < kinds.length; k += 1) {
    const list = byKind[kinds[k]];
    for (let i = 0; i < list.length; i += 1) {
      if (skip[list[i]]) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        if (skip[list[j]]) continue;
        if (canLink(board, cols, rows, list[i], list[j])) return [list[i], list[j]];
      }
    }
  }
  return null;
}

// 段内布纹：同一副盘、同样多的纹种，但每种纹各有几对会随关号偏斜。
// weave=0 是均匀铺开（段首），每往后一级就从最少的一种挪一对给最多的一种：
// 6×4 / 4 种纹从 3/3/3/3 对走到 6/2/3/1 对，盘上就是「一种纹成堆、另一种只剩两枚」。
// 这是段内唯一看得见的牌阵台阶：段首找同纹容易，段末得先分辨哪种纹已经稀了。
// 不管哪一级，每种纹至少留一对——纹种数不能悄悄变，那是换段才动的事。
function pairCounts(pairs, kinds, weave) {
  const counts = [];
  const base = Math.floor(pairs / kinds);
  for (let i = 0; i < kinds; i += 1) counts.push(base);
  for (let i = 0; i < pairs - base * kinds; i += 1) counts[i] += 1;
  for (let step = 0; step < weave; step += 1) {
    let lo = -1;
    let hi = 0;
    for (let i = 0; i < kinds; i += 1) {
      if (counts[i] > 1 && counts[i] <= (lo < 0 ? Infinity : counts[lo])) lo = i;
      if (counts[i] > counts[hi]) hi = i;
    }
    if (lo < 0 || lo === hi) break;
    counts[lo] -= 1;
    counts[hi] += 1;
  }
  return counts;
}

function makeBoard(n, kinds, weave) {
  const counts = pairCounts(n / 2, kinds, weave || 0);
  const deck = [];
  for (let i = 0; i < counts.length; i += 1) {
    for (let k = 0; k < counts[i]; k += 1) deck.push(i + 1, i + 1);
  }
  C.shuffle(deck);
  return deck;
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = Math.max(3, p.cols || 6);
  const rows = Math.max(3, p.rows || 4);
  const n = cols * rows;
  const kinds = Math.min(GLYPHS.length, Math.max(3, p.kinds || 6));
  // 段内布纹：生成端在 data/practice.js，这里只消费。不写兜底默认值以外的换算，
  // 否则「参数在动、盘面没动」会在这里被悄悄托住。
  const weave = Math.max(0, Math.min(3, Math.round(p.weave || 0)));
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
  const duration = Math.max(20, p.duration || 55);
  // 照纹高亮多久与难度无关（它只是「看得见多久」），所以不进 PACE_KEYS / 章内收紧，
  // 否则 200 关里一百多关的「本关变化」都会是「亮起时长 0.75 秒 → 0.74 秒」——
  // 参数真的变了，玩家一点都看不见。
  const hintMs = Math.max(200, p.hintMs || 900);
  const hintCost = stage >= 3 ? 1 : 2;     // 大成「照纹」：少扣 1 息，仍要付
  const twinHint = stage >= 5;             // 大圆满「双照」：一次照见两对
  const pairs = n / 2;
  const leftLine = gradeLefts(duration);

  const vm = C.makeVm(cols, n, '点两枚同纹灵石，能连起来就收走一对', ctx.tip || '点两枚同纹，转折不超过两次');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '得分 0';
  vm.weave = weave;
  vm.extras.showHint = true;
  vm.extras.compact = true;
  // 评级只看「收干净时剩几息」，而倒计时一开始就是满的——摆一个「当前评级」必然是 S，
  // 那是骗人（common.js 里按用时评级的玩法都关掉这一格）。
  vm.extras.showGradeNow = false;
  vm.hint = vm.costText;

  const bag = C.TimerBag();
  let board = [];
  let selected = -1;
  let hintPairs = null;
  let pairsDone = 0;
  let mistakes = 0;
  let combo = 0;
  let score = 0;
  let left = duration;
  let done = false;
  let started = false;
  let hintTimer = null;
  // 连线的自增序号：相邻两次收的路径完全可能一模一样，页面靠 key 变化才知道要重播。
  let pathSeq = 0;

  function render() { ctx.render(vm); }

  function reshuffle() {
    // 重排不记数：它既不动息也不进评级，只负责把死局摆活（评级只看收干净时剩几息）。
    const rest = [];
    for (let i = 0; i < n; i += 1) if (board[i]) rest.push(board[i]);
    C.shuffle(rest);
    let k = 0;
    for (let i = 0; i < n; i += 1) {
      if (!board[i]) continue;
      board[i] = rest[k];
      k += 1;
    }
    // 极小的概率重排后仍无可连对（剩余纹全被自己围住），再洗几次；绝不死循环。
    for (let t = 0; t < 24 && !findPair(board, cols, rows); t += 1) {
      C.shuffle(rest);
      k = 0;
      for (let i = 0; i < n; i += 1) {
        if (!board[i]) continue;
        board[i] = rest[k];
        k += 1;
      }
    }
    // 死局是盘面随机摆出来的，玩家管不着——罚息等于罚运气。代价改成「连收断掉」：
    // 盘面都换了，链子本来就该断，玩家也看得见自己在为哪件事付账。
    combo = 0;
    C.flash(vm, '灵纹自移 · 连收断了', 'bad');
  }

  function marked(i) {
    if (!hintPairs) return false;
    for (let k = 0; k < hintPairs.length; k += 1) {
      if (hintPairs[k][0] === i || hintPairs[k][1] === i) return true;
    }
    return false;
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const v = board[i];
      cell.arrow = -1;
      cell.end = false;
      if (!v) {
        // 收走的一对要把牌位留空：仍是这张盘上的位置，只是没有牌了。
        cell.cls = 'cell cell--chip cell--gone';
        cell.label = '';
        cell.crest = 0;
        cell.tone = 0;
        continue;
      }
      cell.cls = 'cell cell--lit cell--chip'
        + (i === selected ? ' cell--sel' : '')
        + (marked(i) ? ' cell--hintpair' : '');
      cell.label = GLYPHS[v - 1];
      // 上屏的是纹样不是字形：crest 交给 wxss 画，label 只在数据里留个可读的代号。
      cell.crest = v;
      cell.tone = v;
    }
    vm.link = { first: selected, board: board.slice(), cols: cols, rows: rows, pairs: pairs };
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '得分 ' + score;
    vm.combo = combo;
    vm.comboText = combo >= 3 ? '连收 ' + combo : '';
    // 局内只报「还差几对」与 S 线要剩多少息，不报「当前评级」：评级是按收干净那一刻
    // 的剩余息定的，收完之前谁也说不准。
    const need = pairs - pairsDone;
    vm.goal = need > 0
      ? '还差 ' + need + ' 对，S 线要剩 ' + leftLine.s + ' 息'
      : '已收干净';
    vm.meter = { label: '已收灵契', value: pairsDone, max: pairs };
    vm.hint = vm.costText + ' · 照纹 ' + hintCost + ' 息 · 剩 ' + need + ' 对';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '一纹不隔') : '';
    vm.link = { first: -1, board: board.slice(), cols: cols, rows: rows, pairs: pairs };
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary });
  }

  function finish() {
    // 消尽才叫走完。时钟先到、还剩对子没接上，是没走完（失败），
    // 不能因为「收了几对」就按分数给 C——那是把没做完算成做糙了。
    if (pairsDone < pairs) {
      finishOnce('F', '时辰到，还剩 ' + (pairs - pairsDone) + ' 对没接上');
      return;
    }
    const grade = gradeByLeft(Math.max(0, left), duration);
    finishOnce(grade, '收 ' + pairsDone + ' / ' + pairs + ' 对 · 错配 ' + mistakes
      + ' · 剩 ' + Math.max(0, left) + ' 息');
  }

  function addScore(base) {
    const mult = combo >= 8 ? 2 : combo >= 4 ? 1.5 : 1;
    const gain = Math.round(base * mult);
    score += gain;
    return gain;
  }

  function clearHint() {
    if (hintTimer !== null) { bag.off(hintTimer); hintTimer = null; }
    hintPairs = null;
  }

  function tap(index) {
    if (done || vm.phase !== 'playing' || index < 0 || index >= n) return;
    clearHint();
    if (!board[index]) {
      // 空地是通路，不是牌。点在空处只把已选的那枚放下，不罚息——
      // 「点空地也算错配」会让玩家收走一对之后误触一下掉 2 息，而他什么都没做错。
      if (selected >= 0) { selected = -1; paint(); render(); }
      return;
    }
    if (selected < 0) { selected = index; paint(); render(); return; }
    if (selected === index) { selected = -1; paint(); render(); return; }
    const a = selected;
    const b = index;
    if (board[a] !== board[b]) {
      selected = b;                    // 点错纹只是改选，别让玩家再点一次取消
      mistakes += 1;
      combo = 0;
      left = Math.max(0, left - 2);
      C.flash(vm, '纹不合 · 少 2 息', 'bad');
    } else if (!findPath(board, cols, rows, a, b)) {
      selected = -1;
      mistakes += 1;
      combo = 0;
      left = Math.max(0, left - 2);
      C.flash(vm, '隔着纹，连不上 · 少 2 息', 'bad');
    } else {
      // 路径要在清牌之前算：清完那两格就变成 0，起点与终点都不再是「同纹」，
      // 再怎么找也找不到这条线了。
      const path = findPath(board, cols, rows, a, b);
      board[a] = 0;
      board[b] = 0;
      selected = -1;
      pairsDone += 1;
      combo += 1;
      const gain = addScore(100);
      C.flash(vm, '灵契相合 +' + gain, 'good');
      C.markCleared(vm, [a, b]);
      if (path) {
        pathSeq += 1;
        vm.linkPath = { key: pathSeq, points: path };
      }
      if (pairsDone >= pairs) {
        paint();
        syncHud();
        render();
        finish();
        return;
      }
      if (!findPair(board, cols, rows)) reshuffle();
    }
    paint();
    syncHud();
    if (left <= 0) { finish(); return; }
    render();
  }

  function hint() {
    if (done || vm.phase !== 'playing') return;
    const pair = findPair(board, cols, rows);
    if (!pair) { reshuffle(); paint(); syncHud(); render(); return; }
    clearHint();
    hintPairs = [pair];
    if (twinHint) {
      const skip = {};
      skip[pair[0]] = true;
      skip[pair[1]] = true;
      const second = findPair(board, cols, rows, skip);
      if (second) hintPairs.push(second);
    }
    left = Math.max(0, left - hintCost);
    // 明码代价要当场看得见：HUD 那行取的是 goal || status，goal 一直有值，
    // 光改 vm.status 等于把「少 2 息」写进一个不显示的字段。倒计时确实少了，
    // 但玩家得自己把两件事连起来；浮字直接说出来，且与错配的代价反馈同一套。
    const costText = (hintPairs.length > 1 ? '双照' : '照纹') + ' · 少 ' + hintCost + ' 息';
    vm.status = (hintPairs.length > 1 ? '双照：两对都连得上' : '照纹：这两枚连得上') + ' · 少 ' + hintCost + ' 息';
    C.flash(vm, costText, 'bad');
    paint();
    syncHud();
    render();
    hintTimer = bag.after(function () {
      if (done) return;
      hintPairs = null;
      paint();
      render();
    }, hintMs);
    // 提示高亮期间继续操作不该把高亮留在已收走的格子上：tap 会清掉它。
    if (left <= 0) finish();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '点两枚同纹灵石，能连起来就收走一对';
    vm.banner = theme.banner || '';
    for (let t = 0; t < 40; t += 1) {
      board = makeBoard(n, kinds, weave);
      if (findPair(board, cols, rows)) break;
    }
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

function lines(p) {
  const duration = Math.max(20, (p && p.duration) || 55);
  const g = gradeLefts(duration);
  return {
    rule: '走完之后按剩余息评级：收得越快，剩得越多（错配与连不上各少 2 息，直接吃掉剩余）',
    items: [
      'S：收干净且剩 ≥ ' + g.s + ' 息（本局 ' + duration + ' 息）',
      'A：收干净且剩 ≥ ' + g.a + ' 息',
      'B：收干净且剩 ≥ ' + g.b + ' 息',
      'C：收干净，但剩不到 ' + g.b + ' 息',
    ],
    fail: '时辰到还剩对子没接上 → 失败 F，这一局没有收益',
  };
}

module.exports = {
  id: 'link',
  findPath: findPath, name: '灵纹连线', create: create, lines: lines,
  canLink: canLink, findPair: findPair, GLYPHS: GLYPHS, pairCounts: pairCounts,
  gradeByLeft: gradeByLeft, gradeLefts: gradeLefts,
};
