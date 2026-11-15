'use strict';

// 滑格相合（同数相合 / 合术·同数叠元诀专属）：2048。
//
// 与「落石垒基」的区别：那里是一块一块往下落、靠形状填满整层；
// 这里是四条边任你推，整行整列一起挤，靠的是「同数相撞翻倍」。
// 与「三秀同收」的区别：三消是换相邻两格凑三连，这里是同一行整体滑到底、撞上才合。
//
// 一局一盘：四条方向键把全盘往那个方向挤，同数相撞合成双倍，空出来的格子里补一块新的。
// 合出本档的目标块即收功；盘满又推不动了就是走火 F（无路可走，不是「打得糙」）。
// 评级看最大那一块合到多大，倍率之外不再看别的；得分（合并值累加）只用来破纪录。

const C = require('./common.js');

// 目标块按档递进：一块 128 大约三四十手，1024 要一路合到底。
const TARGETS = [128, 256, 256, 512, 1024];

function linesOf(p) {
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  const goal = Math.max(8, p && p.target ? p.target : TARGETS[depth]);
  return [goal, Math.max(8, goal / 2), Math.max(8, goal / 4)];
}

function create(ctx) {
  const p = ctx.params || {};
  const theme = ctx.theme || {};
  const cols = Math.max(3, Math.min(6, p.cols || 4));
  const rows = Math.max(3, Math.min(6, p.rows || 4));
  const n = cols * rows;
  const lim = linesOf(p);
  const target = lim[0];
  // 起手块数按档递增：少一格空地，同数就更难凑到一处，高档不是只把目标数字改大。
  const startTiles = Math.max(2, Math.min(5, p.startTiles || 2));
  // 起手给 4 的概率：越往后越少白送 4。这是这一门在章内唯一能连续收紧的量——
  // 目标块是一档一档翻倍的，中间没有可微调的地方，真要靠它每五关变一次做不到。
  const fourRate = Math.max(0.1, Math.min(0.6, typeof p.fourRate === 'number' ? p.fourRate : 0.4));
  const costText = ctx.tip || '推不动就完了：盘满且相邻没有同数';

  const bag = C.TimerBag();
  const vm = C.makeVm(cols, n, '把同数挤到一起合上去', costText);
  // 不摆方向键：2048 的手感是「把盘子往那边推」，拇指已经在盘上了，
  // 再挪到底部去按四个箭头，等于每走一步都要换个手。页面据此挂滑动层。
  vm.extras.swipeMove = true;
  vm.extras.showCombo = true;

  let grid = new Array(n).fill(0);
  let score = 0;
  let moves = 0;
  let best = 0;
  let done = false;
  let started = false;
  // 合并弹与新块弹要各自重播：同一个类名连挂两帧不播动画，
  // 所以类名带一个 0/1 交替的序号，相邻两手一定换一个。
  let popSeq = 0;
  let mergedAt = [];
  let freshAt = -1;
  // 这一手合出来的分：浮字要报「这一手得了多少」，不是总分。
  // 总分是 HUD 那一栏的事，浮字报总分等于每次都弹同一个数。
  let roundGain = 0;

  function render() { ctx.render(vm); }

  function tileTone(v) {
    let t = 1;
    let x = v;
    while (x > 2 && t < 8) { x /= 2; t += 1; }
    return t;
  }

  function paint() {
    const top = maxTile();
    const pop = ' cell--pop' + (popSeq % 2);
    for (let i = 0; i < n; i += 1) {
      const cell = vm.cells[i];
      const v = grid[i];
      cell.arrow = -1;
      cell.end = false;
      cell.label = v ? String(v) : '';
      cell.tone = v ? tileTone(v) : 0;
      if (!v) {
        // 空格是凹槽，不是「没有」：2048 的盘面必须让人看出还剩几个位、
        // 以及滑到底之后一条线会停在哪儿。透出台色的话，整块盘读起来是一片空地。
        cell.cls = 'cell cell--slot';
        continue;
      }
      // 牌面按数值换底色（白底黑字在深玉台上是一块块补丁），位数多的字收一号，
      // 免得 1024 从格子里挤出来。最大那一块加一圈金边，玩家一眼知道自己练到哪了。
      let cls = 'cell cell--tile cell--t' + cell.tone;
      if (v >= 1000) cls += ' cell--tile-4';
      else if (v >= 100) cls += ' cell--tile-3';
      if (mergedAt.indexOf(i) >= 0) cls += pop;
      else if (i === freshAt) cls += ' cell--fresh' + (popSeq % 2);
      if (v === top && v >= 8) cls += ' cell--best';
      cell.cls = cls;
    }
    vm.merge = { board: grid.slice(), cols: cols, rows: rows, target: target, best: top };
  }

  function maxTile() {
    let m = 0;
    for (let i = 0; i < n; i += 1) if (grid[i] > m) m = grid[i];
    return m;
  }

  function syncHud() {
    best = maxTile();
    vm.timeText = '第 ' + moves + ' 手';
    vm.progress = C.pct(best, target);
    vm.progressText = '最大 ' + best + ' / ' + target;
    vm.scoreText = '得分 ' + score;
    vm.combo = best;
    vm.comboText = best ? '最大一块 ' + best : '';
    vm.goal = best >= target ? '已合出目标块' : '再合到 ' + target + ' 就收功';
    vm.gradeNow = best >= lim[0] ? 'S' : best >= lim[1] ? 'A' : best >= lim[2] ? 'B' : 'C';
    vm.hint = '四向滑动 · ' + costText;
  }

  function emptyCells() {
    const out = [];
    for (let i = 0; i < n; i += 1) if (!grid[i]) out.push(i);
    return out;
  }

  function spawn() {
    const free = emptyCells();
    if (!free.length) return -1;
    const i = free[C.randInt(free.length)];
    // 四成给 4、六成给 2：全是 2 的盘推起来太慢，全是 4 又太送。
    // 这个比例按关卡往下收（最低约五分之一），凑同数就得多推几步。
    grid[i] = Math.random() < fourRate ? 4 : 2;
    return i;
  }

  // 一条线上的挤压：先去掉空格，再让相邻同数两两相合，最后补空格。
  function squeeze(indices) {
    const vals = [];
    for (let i = 0; i < indices.length; i += 1) {
      if (grid[indices[i]]) vals.push(grid[indices[i]]);
    }
    const out = [];
    const hits = [];
    for (let i = 0; i < vals.length; i += 1) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        const merged = vals[i] * 2;
        out.push(merged);
        hits.push([out.length - 1, merged]);
        score += merged;
        roundGain += merged;
        i += 1;
      } else {
        out.push(vals[i]);
      }
    }
    let changed = false;
    for (let i = 0; i < indices.length; i += 1) {
      const v = i < out.length ? out[i] : 0;
      if (grid[indices[i]] !== v) changed = true;
      grid[indices[i]] = v;
    }
    // 合并落在这一行的第几个位置，换来主盘的下标：页面靠它算迸溅坐标。
    for (let i = 0; i < hits.length; i += 1) mergedAt.push(indices[hits[i][0]]);
    return changed;
  }

  function lineOf(dir, k) {
    const list = [];
    if (dir === 'left' || dir === 'right') {
      for (let c = 0; c < cols; c += 1) list.push(k * cols + c);
      return dir === 'right' ? list.reverse() : list;
    }
    for (let r = 0; r < rows; r += 1) list.push(r * cols + k);
    return dir === 'down' ? list.reverse() : list;
  }

  function stuck() {
    if (emptyCells().length) return false;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const v = grid[r * cols + c];
        if (c + 1 < cols && grid[r * cols + c + 1] === v) return false;
        if (r + 1 < rows && grid[(r + 1) * cols + c] === v) return false;
      }
    }
    return true;
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = grade === 'F' ? '推不动了' : '合成了';
    vm.gradeNow = grade;
    vm.banner = grade === 'S' ? (theme.praise || '') : '';
    render();
    ctx.finish({ grade: grade, score: Math.max(0, score), summary: summary, notes: notesOf(grade) });
  }

  function notesOf(grade) {
    const notes = [];
    if (grade === 'F') {
      notes.push('盘满且相邻没有同数，这一步之后再推也合不动了。');
      notes.push('下一局先把大块留在一角，别让它被小块围死。');
      return notes;
    }
    notes.push('合出 ' + best + ' 一块，用了 ' + moves + ' 手。');
    if (grade !== 'S') notes.push('本档 S 要合出 ' + lim[0] + ' 一块，还差 ' + (lim[0] - best) + '。');
    return notes;
  }

  function gradeOf() {
    if (best >= lim[0]) return 'S';
    if (best >= lim[1]) return 'A';
    if (best >= lim[2]) return 'B';
    return 'C';
  }

  function move(dir) {
    if (done || vm.phase !== 'playing') return;
    if (['up', 'down', 'left', 'right'].indexOf(dir) < 0) return;
    // 目标块是这一手刚合出来的才算「合出」：先记下推之前的最大块。
    const before = maxTile();
    let changed = false;
    mergedAt = [];
    roundGain = 0;
    popSeq += 1;
    const lines = dir === 'left' || dir === 'right' ? rows : cols;
    for (let k = 0; k < lines; k += 1) {
      if (squeeze(lineOf(dir, k))) changed = true;
    }
    if (!changed) {
      // 推不动的反馈只值一声闷响：这里不弹浮字，浮字留给「合成了」。
      // 每一手都弹一个字，玩家半分钟后就学会无视它了。
      vm.status = '这个方向推不动';
      C.flash(vm, '推不动 · 换个方向', 'bad');
      render();
      return;
    }
    moves += 1;
    const promoted = maxTile() >= target && before < target;
    freshAt = spawn();
    paint();
    syncHud();
    if (mergedAt.length) {
      // 合并处迸一小把：这一手最值得被看见的是「刚才在这里合成了一块」，
      // 而不是 HUD 上那个总数又涨了多少。粒子复用主盘那条通道（markCleared）。
      C.markCleared(vm, mergedAt);
      C.flash(vm, '合 +' + roundGain, 'good');
    }
    if (promoted) {
      C.flash(vm, '合出 ' + target + ' · 收功', 'gold');
      finishOnce(gradeOf(), '合出 ' + best + ' 一块 · ' + moves + ' 手');
      return;
    }
    if (stuck()) {
      C.flash(vm, '推不动了 · 盘满无同数', 'bad');
      paint();
      finishOnce('F', '盘满且无同数，推不动');
      return;
    }
    render();
  }

  // 开局那几块同时落地，不逐个弹：弹四下等于没弹。整盘一起亮一下。
  function poppedFresh() {
    popSeq += 1;
    freshAt = -1;
    for (let i = 0; i < n; i += 1) {
      if (!grid[i]) continue;
      if (vm.cells[i]) vm.cells[i].cls = vm.cells[i].cls + ' cell--fresh' + (popSeq % 2);
    }
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '';
    vm.status = '四向滑动，把同数挤到一起';
    grid = new Array(n).fill(0);
    score = 0;
    moves = 0;
    mergedAt = [];
    roundGain = 0;
    for (let k = 0; k < startTiles; k += 1) spawn();
    paint();
    // 开局那几块一起弹：逐个弹等于没弹，整盘亮一下才像「这一切开始了」。
    poppedFresh();
    syncHud();
    render();
  }

  paint();
  syncHud();
  render();

  return C.fillController({
    start: start,
    move: move,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const lim = linesOf(p);
  return {
    rule: '按最大那一块合到多大评级（本档起手 '
      + Math.max(2, Math.min(5, (p && p.startTiles) || 2)) + ' 块 · 合出目标块即收功）',
    items: [
      'S：合出 ' + lim[0] + ' 一块',
      'A：合出 ' + lim[1] + ' 一块',
      'B：合出 ' + lim[2] + ' 一块',
      'C：没合到 ' + lim[2] + ' 一块',
    ],
    fail: '盘满且相邻没有同数、再也推不动 → 走火 F，这一局没有收益',
  };
}

module.exports = {
  id: 'merge',
  name: '滑格相合',
  create: create,
  lines: lines,
  TARGETS: TARGETS,
};
