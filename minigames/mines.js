'use strict';

// 数格辨禁（持符探禁 / 照影符专属）：经典扫雷，看周围数字推禁制位置，翻遍所有安全石格。
//
// 「照影符应该简单，因为扫雷太经典了」——这里的深耕不是往里塞新规则，而是把经典扫雷
// 之所以好玩的那几件事补齐，规则一个字不加：
//   ① 首点及其八邻无禁制，第一下必开出一片空白，不会开局就被一个数字堵死。
//   ② 整盘「无猜」：布完禁制用约束传播验一遍，确认从首点纯推理能翻完，否则重布。
//      新手不该死在「两格只能猜一个」上，那是扫雷最劝退的地方。
//   ③ 插旗不再只是装饰：点已翻开的数字格，旗数对上就自动连开其余邻格（chord）。
//      不插旗照样能玩，会用的人才快，所以不破坏「一看就懂」。
//
// 保留下来的本门机制：三盏心神（误触只扣一盏并让那处显形，耗尽才收功）、长按插旗、
// 大成开局照见禁制。盘面只有数字与两个通用符号（✕ 禁制 / ⚑ 旗），不落汉字。
//
// finish.score 一律「越大越好」：engine.applyPractice 按 score > prevBest 记破纪录，
// 旧实现把「耗时秒数」当 score 传出去，越慢反而越容易破纪录，方向是反的。

const C = require('./common.js');

const LAYOUT_TRIES = 64;   // 单格可解布局约占十几分之一，64 次足够；找不到就接受最后一盘，绝不死循环
const HEARTS_BY_DEPTH = [3, 3, 3, 2, 2];
const MINE_GLYPH = '✕';
const FLAG_GLYPH = '⚑';

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = p.cols || 6;
  const rows = p.rows || 6;
  const n = cols * rows;
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  // 禁制数已由 buildParams 按 goal 缩放过（简单 5 → 绝境 8）。
  // 旧写法在这里又叠一次 hard ? +3，与缩放重复，且 ctx.difficulty 只有 normal / hard
  // 两值，困难 / 极难 / 绝境三档其实是一盘。现在统一交给 depth 与 buildParams。
  const mineCount = Math.min(n - 9, Math.max(3, Math.round(p.mines || 6)));
  const tier = perks.tier || 0;
  const sensedCount = tier >= 5 ? 5 : (tier >= 3 || perks.easy ? 3 : 0);
  const maxHearts = HEARTS_BY_DEPTH[depth];
  const vm = C.makeVm(cols, n, '点开第一格，禁制才会显形', ctx.tip || '点开格子，长按可插旗标记');
  vm.timeText = '00:00';
  vm.scoreText = '已探 0 / ' + (n - mineCount);
  vm.extras.showHearts = true;
  vm.extras.noGuess = false;
  vm.hearts = { value: maxHearts, max: maxHearts };

  const bag = C.TimerBag();
  let mines = [];
  let mineSet = {};
  let sensedSet = {};
  let numbers = new Array(n).fill(0);
  let revealed = new Array(n).fill(false);
  let exposed = new Array(n).fill(false);
  let flags = new Array(n).fill(false);
  let generated = false;
  let noGuess = false;
  let elapsed = 0;
  let hearts = maxHearts;
  let done = false;
  let started = false;

  function neighbors(i) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
      }
    }
    return out;
  }

  function build(mineList) {
    mines = mineList.slice();
    mineSet = {};
    sensedSet = {};
    for (let i = 0; i < mines.length; i += 1) mineSet[mines[i]] = true;
    for (let i = 0; i < Math.min(sensedCount, mines.length); i += 1) sensedSet[mines[i]] = true;
    numbers = new Array(n).fill(0);
    for (let i = 0; i < mines.length; i += 1) {
      const nb = neighbors(mines[i]);
      for (let j = 0; j < nb.length; j += 1) if (!mineSet[nb[j]]) numbers[nb[j]] += 1;
    }
  }

  // ---------------------------------------------------------------- 无猜布局
  // 只模拟「玩家看得见的信息」：从首点展开，反复用最基础的单格规则推进——
  //   某数字格周围「未探格数 == 剩余禁制数」→ 全是禁制；剩余 0 → 全安全。
  // 刻意不引入「1-2-1 / 两个数字格相减」这类高阶技巧：照影符是黄阶入门功法，
  // 无猜就该是「认得数字就能推完」，不要求玩家先学会扫雷竞赛的推理。
  // 判定只是验布局，不给玩家任何额外提示；不合格就重布。
  function flood(rev, known, start) {
    if (mineSet[start] || known[start]) return;
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop();
      if (rev[i] || known[i] || mineSet[i]) continue;
      rev[i] = true;
      if (numbers[i] === 0) {
        const nb = neighbors(i);
        for (let j = 0; j < nb.length; j += 1) {
          if (!rev[nb[j]] && !known[nb[j]] && !mineSet[nb[j]]) stack.push(nb[j]);
        }
      }
    }
  }

  function constraints(rev, known) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      if (!rev[i] || numbers[i] <= 0) continue;
      const nb = neighbors(i);
      const unknown = [];
      let flagged = 0;
      for (let k = 0; k < nb.length; k += 1) {
        const j = nb[k];
        if (known[j]) flagged += 1;
        else if (!rev[j]) unknown.push(j);
      }
      if (unknown.length > 0) out.push({ set: unknown, rest: numbers[i] - flagged });
    }
    return out;
  }

  function allSafeOpen(rev) {
    for (let i = 0; i < n; i += 1) if (!mineSet[i] && !rev[i]) return false;
    return true;
  }

  function solvable(startIdx) {
    const rev = new Array(n).fill(false);
    const known = new Array(n).fill(false);
    flood(rev, known, startIdx);
    if (allSafeOpen(rev)) return true;
    for (let pass = 0; pass < 16; pass += 1) {
      let changed = false;
      const cs = constraints(rev, known);
      for (let k = 0; k < cs.length; k += 1) {
        const c = cs[k];
        if (c.rest === 0) {
          for (let q = 0; q < c.set.length; q += 1) {
            const j = c.set[q];
            if (!rev[j] && !known[j]) { flood(rev, known, j); changed = true; }
          }
        } else if (c.rest === c.set.length) {
          for (let q = 0; q < c.set.length; q += 1) {
            if (!known[c.set[q]]) { known[c.set[q]] = true; changed = true; }
          }
        }
      }
      if (allSafeOpen(rev)) return true;
      if (!changed) return false;
    }
    return allSafeOpen(rev);
  }

  function firstZone(i) {
    const zone = {};
    zone[i] = true;
    const nb = neighbors(i);
    for (let k = 0; k < nb.length; k += 1) zone[nb[k]] = true;
    return zone;
  }

  function tryLayout(startIdx) {
    const zone = firstZone(startIdx);
    const candidates = [];
    for (let i = 0; i < n; i += 1) if (!zone[i]) candidates.push(i);
    if (candidates.length < mineCount) return false;
    C.shuffle(candidates);
    build(candidates.slice(0, mineCount));
    return solvable(startIdx);
  }

  function generate(startIdx) {
    for (let t = 0; t < LAYOUT_TRIES; t += 1) {
      if (tryLayout(startIdx)) { noGuess = true; break; }
    }
    generated = true;
    vm.extras.noGuess = noGuess;
    vm.status = noGuess ? '此盘不必猜 · 逐格翻开' : '辨明禁制，逐格翻开';
  }

  // ---------------------------------------------------------------- 视图与结算
  function render() { ctx.render(vm); }

  function openedCount() {
    let k = 0;
    for (let i = 0; i < n; i += 1) if (revealed[i]) k += 1;
    return k;
  }

  function gradeTime(t) {
    if (t <= 25) return 'S';
    if (t <= 45) return 'A';
    if (t <= 75) return 'B';
    return 'C';
  }

  // 越大越好：探明格数 ×10，扣用时与误触。与 engine 的破纪录比较方向一致。
  function scoreOf() {
    return Math.max(0, Math.round((n - mineCount) * 10 - elapsed * 2 - (maxHearts - hearts) * 60));
  }

  function syncHud() {
    const opened = openedCount();
    const safeTotal = n - mineCount;
    vm.timeText = C.mmss(elapsed);
    vm.progress = C.pct(opened, safeTotal);
    vm.progressText = opened + ' / ' + safeTotal + ' 格';
    vm.scoreText = '已探 ' + opened + ' / ' + safeTotal;
    vm.hearts = { value: hearts, max: maxHearts };
    vm.gradeNow = gradeTime(elapsed);
    vm.goal = '还剩 ' + Math.max(0, safeTotal - opened) + ' 格 · 心神 ' + hearts + ' 盏';
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      if (revealed[i]) {
        vm.cells[i].cls = 'cell cell--open';
        vm.cells[i].label = numbers[i] > 0 ? String(numbers[i]) : '';
      } else if (exposed[i] || sensedSet[i]) {
        vm.cells[i].cls = 'cell cell--mine';
        vm.cells[i].label = MINE_GLYPH;
      } else if (flags[i]) {
        vm.cells[i].cls = 'cell cell--flag';
        vm.cells[i].label = FLAG_GLYPH;
      } else {
        vm.cells[i].cls = 'cell cell--hidden';
        vm.cells[i].label = '';
      }
    }
  }

  function finishOnce(grade, summary, failed) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '步步不惊') : '';
    render();
    ctx.finish({
      grade: grade,
      score: failed ? Math.round(scoreOf() * 0.3) : scoreOf(),
      summary: summary,
    });
  }

  function revealFrom(start) {
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop();
      if (revealed[i] || flags[i] || exposed[i] || sensedSet[i] || mineSet[i]) continue;
      revealed[i] = true;
      if (numbers[i] === 0) {
        const nb = neighbors(i);
        for (let j = 0; j < nb.length; j += 1) {
          if (!revealed[nb[j]] && !flags[nb[j]] && !mineSet[nb[j]]) stack.push(nb[j]);
        }
      }
    }
  }

  function checkWin() {
    if (done) return true;
    for (let i = 0; i < n; i += 1) {
      if (!mineSet[i] && !revealed[i]) return false;
    }
    finishOnce(gradeTime(elapsed), elapsed + ' 秒探明秘境');
    return true;
  }

  function strikeMine(index) {
    hearts -= 1;
    exposed[index] = true;
    flags[index] = false;
    vm.status = theme.miss || '触了禁制';
    C.flash(vm, '心神 -1 · 禁制显形', 'bad');
    paint();
    syncHud();
    if (hearts <= 0) {
      finishOnce('C', '心神耗尽，此番只算粗浅', true);
      return;
    }
    render();
  }

  // 经典扫雷的 chord：数字格周围旗数对上，一键连开其余邻格。
  // 旗插错照样会踩到禁制，按误触规矩扣心神，不替玩家兜底。
  function chord(index) {
    if (!revealed[index] || numbers[index] <= 0) return;
    const nb = neighbors(index);
    let marked = 0;
    const pending = [];
    for (let k = 0; k < nb.length; k += 1) {
      const j = nb[k];
      if (flags[j] || exposed[j] || sensedSet[j]) marked += 1;
      else if (!revealed[j]) pending.push(j);
    }
    if (pending.length === 0) return;
    if (marked !== numbers[index]) {
      vm.status = '旗数未合，先插旗再点数字格';
      render();
      return;
    }
    let opened = 0;
    for (let k = 0; k < pending.length && !done; k += 1) {
      const j = pending[k];
      if (mineSet[j]) strikeMine(j);
      else if (!revealed[j]) { revealFrom(j); opened += 1; }
    }
    if (done) return;
    paint();
    syncHud();
    if (opened > 0) C.flash(vm, '符光连开 ' + opened + ' 格', 'good');
    if (checkWin()) return;
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '点开第一格，禁制才会显形';
    vm.banner = theme.banner || '';
    // 故意不在开局布雷：首点位置必须由玩家决定，那一格及其八邻才不会藏禁制。
    paint();
    syncHud();
    render();
    bag.every(function () {
      if (done) return;
      elapsed += 1;
      syncHud();
      render();
    }, 1000);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (!generated) generate(index);
    if (revealed[index]) { chord(index); return; }
    if (flags[index] || exposed[index]) return;
    if (sensedSet[index]) {
      vm.status = '此处已照见禁制，别再点它';
      render();
      return;
    }
    if (mineSet[index]) {
      strikeMine(index);
      if (done) return;
      paint();
      syncHud();
      render();
      return;
    }
    revealFrom(index);
    paint();
    syncHud();
    C.flash(vm, theme.hit || '石格无事', 'good');
    if (checkWin()) return;
    render();
  }

  function longpress(index) {
    if (done || vm.phase !== 'playing' || revealed[index] || exposed[index] || sensedSet[index]) return;
    flags[index] = !flags[index];
    paint();
    render();
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    longpress: longpress,
    abandon: function () { finishOnce('F', '中途收功', true); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'mines', name: '数格辨禁', create: create };
