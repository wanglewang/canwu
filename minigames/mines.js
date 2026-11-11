'use strict';

// 数格辨禁（持符探禁 / 照影符专属）：看周围数字推禁制位置，翻遍所有安全石格，比用时。
// 本门机制「三盏心神」：误触禁制只扣一盏并让那处显形，三盏耗尽才收功；精通以上开局照见 3 处禁制。
// 长按可插旗做记号——这与「成对翻牌」的翻牌记位置是两回事。

const C = require('./common.js');

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = p.cols || 6;
  const rows = p.rows || 6;
  const n = cols * rows;
  const mineCount = Math.min(n - 2, (p.mines || 6) + (hard ? 3 : 0));
  const sensedCount = perks.easy ? 3 : 0;
  const maxHearts = 3;
  const vm = C.makeVm(cols, n, '点开第一格，禁制才会显形', ctx.tip || '点开格子，长按可插旗标记');
  vm.timeText = '00:00';
  vm.scoreText = '已探 0 / ' + (n - mineCount);
  vm.extras.showHearts = true;
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
  let firstTapDone = false;
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

  function generate(safeIdx) {
    const candidates = [];
    for (let i = 0; i < n; i += 1) if (i !== safeIdx) candidates.push(i);
    C.shuffle(candidates);
    build(candidates.slice(0, mineCount));
    generated = true;
  }

  function relocate(safeIdx) {
    const idx = mines.indexOf(safeIdx);
    if (idx < 0) return;
    const spare = [];
    for (let i = 0; i < n; i += 1) if (!mineSet[i] && i !== safeIdx) spare.push(i);
    if (spare.length === 0) return;
    const next = C.shuffle(spare.slice())[0];
    mines[idx] = next;
    build(mines);
  }

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
      } else if (exposed[i]) {
        vm.cells[i].cls = 'cell cell--mine';
        vm.cells[i].label = theme.glyph || '禁';
      } else if (flags[i]) {
        vm.cells[i].cls = 'cell cell--flag';
        vm.cells[i].label = '旗';
      } else if (sensedSet[i]) {
        vm.cells[i].cls = 'cell cell--sensed';
        vm.cells[i].label = '禁';
      } else {
        vm.cells[i].cls = 'cell cell--hidden';
        vm.cells[i].label = '';
      }
    }
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '步步不惊') : '';
    render();
    ctx.finish({ grade: grade, score: elapsed, summary: summary });
  }

  function revealFrom(start) {
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop();
      if (revealed[i] || flags[i] || mineSet[i]) continue;
      revealed[i] = true;
      if (numbers[i] === 0) {
        const nb = neighbors(i);
        for (let j = 0; j < nb.length; j += 1) {
          if (!revealed[nb[j]] && !mineSet[nb[j]]) stack.push(nb[j]);
        }
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '辨明禁制，逐格翻开';
    vm.banner = theme.banner || '';
    generate(C.randInt(n));
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
    if (flags[index] || revealed[index] || exposed[index]) return;
    if (!firstTapDone) {
      firstTapDone = true;
      if (mineSet[index]) relocate(index);
    }
    if (mineSet[index]) {
      hearts -= 1;
      exposed[index] = true;
      flags[index] = false;
      vm.status = theme.miss || '触了禁制';
      C.flash(vm, '心神 -1 · 禁制显形', 'bad');
      paint();
      syncHud();
      if (hearts <= 0) {
        finishOnce('C', '心神耗尽，此番只算粗浅');
        return;
      }
      render();
      return;
    }
    revealFrom(index);
    paint();
    syncHud();
    C.flash(vm, theme.hit || '石格无事', 'good');
    let allOpen = true;
    for (let i = 0; i < n; i += 1) {
      if (!mineSet[i] && !revealed[i]) { allOpen = false; break; }
    }
    if (allOpen) {
      finishOnce(gradeTime(elapsed), elapsed + ' 秒探明秘境');
      return;
    }
    render();
  }

  function longpress(index) {
    if (done || vm.phase !== 'playing' || revealed[index] || exposed[index]) return;
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
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'mines', name: '数格辨禁', create: create };
