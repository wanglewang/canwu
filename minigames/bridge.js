'use strict';

// 循纹递推（循纹采露 / 凝露方专属）：一条竖向河道，每层三块露石各刻一道纹。
// 规则不是「记顺序」，而是「循纹递推」：这一层要采的纹 = 上一层纹加一，周而复始。
// 水流会 periodically 把当前层的露石重新打乱，得重新看纹；采错扣一盏心神，留在原层。
// 盘面是逐层推进的河道（lane），与记序复现的 3×3 闪烁盘完全不同。

const C = require('./common.js');

const NUM = ['', '一', '二', '三', '四', '五'];

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = Math.min(5, (p.cols || 3) + (hard ? 1 : 0));
  const rows = (p.rows || 5) + (hard ? 1 : 0);
  const toneMax = cols;
  const n = cols * rows;
  const shuffleMs = Math.max(1400, (p.shuffleMs || 3200) - (hard ? 900 : 0) + (perks.easy ? 800 : 0));
  const timeLimit = p.timeLimit || 45;
  const maxHearts = perks.easy ? 4 : 3;
  const vm = C.makeVm(cols, n, '看纹落脚，一层层采到对岸', ctx.tip || '这一层要采的纹，是上一层加一');
  vm.stage = 'lane';
  vm.timeText = '00:00';
  vm.scoreText = '已采 0 / ' + rows + ' 层';
  vm.extras.showHearts = true;
  vm.extras.showMeter = true;
  vm.hearts = { value: maxHearts, max: maxHearts };
  vm.lane = { rows: rows, cols: cols, activeRow: 0, target: 1, toneMax: toneMax, rule: '循纹：上层纹数 +1，过 ' + toneMax + ' 回到一' };

  const bag = C.TimerBag();
  let tones = new Array(n).fill(0);
  let activeRow = 0;
  let target = 1;
  let hearts = maxHearts;
  let elapsed = 0;
  let combo = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function makeRow() {
    const a = [target];
    for (let i = 1; i < cols; i += 1) {
      let v = 1 + C.randInt(toneMax);
      if (v === target && C.randInt(100) < 70) v = target % toneMax + 1;
      a.push(v);
    }
    return C.shuffle(a);
  }

  function shuffleCurrentRow() {
    if (done || vm.phase !== 'playing') return;
    const row = makeRow();
    for (let c = 0; c < cols; c += 1) tones[activeRow * cols + c] = row[c];
    paint();
    vm.status = '水纹一转，露石换了位置';
    C.flash(vm, '水纹改道', 'good');
    render();
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      const row = Math.floor(i / cols);
      if (row < activeRow) {
        vm.cells[i].cls = 'cell cell--trail';
        vm.cells[i].label = '采';
        vm.cells[i].tone = 0;
      } else if (row > activeRow) {
        vm.cells[i].cls = 'cell cell--fog';
        vm.cells[i].label = '';
        vm.cells[i].tone = 0;
      } else {
        const t = tones[i] || 1;
        vm.cells[i].cls = 'cell cell--stone cell--t' + t;
        vm.cells[i].label = NUM[t] || String(t);
        vm.cells[i].tone = t;
      }
    }
  }

  function gradeNow() {
    if (hearts <= 0 || elapsed > timeLimit) return 'C';
    if (elapsed <= 14 && hearts === maxHearts) return 'S';
    if (elapsed <= 22) return 'A';
    if (elapsed <= 34) return 'B';
    return 'C';
  }

  function syncHud() {
    vm.timeText = C.mmss(elapsed);
    vm.progress = C.pct(activeRow, rows);
    vm.progressText = activeRow + ' / ' + rows + ' 层';
    vm.scoreText = '已采 ' + activeRow + ' / ' + rows + ' 层';
    vm.hearts = { value: hearts, max: maxHearts };
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连采 ×' + combo : '';
    vm.gradeNow = gradeNow();
    vm.goal = '第 ' + (activeRow + 1) + ' 层 · 该采「' + (NUM[target] || target) + '」纹';
    vm.meter = { label: '循纹目标', value: target, max: toneMax };
    vm.lane.activeRow = activeRow;
    vm.lane.target = target;
    vm.hint = '只点当前这一层，采过的会留痕。';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '一滴不洒') : '';
    render();
    ctx.finish({ grade: grade, score: activeRow, summary: summary });
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.banner = theme.banner || '露纹初现';
    for (let r = 0; r < rows; r += 1) {
      const row = makeRow();
      for (let c = 0; c < cols; c += 1) tones[r * cols + c] = row[c];
    }
    paint();
    syncHud();
    render();
    bag.every(function () {
      elapsed += 1;
      syncHud();
      if (elapsed >= timeLimit) {
        finishOnce('C', '水流太急，只采到 ' + activeRow + ' 层');
        return;
      }
      render();
    }, 1000);
    bag.every(shuffleCurrentRow, shuffleMs);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (Math.floor(index / cols) !== activeRow) return;
    const t = tones[index];
    if (t === target) {
      combo += 1;
      C.flash(vm, (theme.hit || '露已入瓶') + (combo >= 3 ? ' · 连采 ×' + combo : ''), 'good');
      activeRow += 1;
      target = target % toneMax + 1;
      if (activeRow >= rows) {
        paint();
        syncHud();
        finishOnce(elapsed <= 14 && hearts === maxHearts ? 'S' : elapsed <= 22 ? 'A' : elapsed <= 34 ? 'B' : 'C',
          rows + ' 层采尽 · 用时 ' + elapsed + ' 秒 · 心神余 ' + hearts + ' 盏');
        return;
      }
      const row = makeRow();
      for (let c = 0; c < cols; c += 1) tones[activeRow * cols + c] = row[c];
      paint();
      syncHud();
      render();
      return;
    }
    hearts -= 1;
    combo = 0;
    vm.cells[index].cls = 'cell cell--bad';
    vm.cells[index].label = '';
    vm.status = theme.miss || '踏空落水';
    C.flash(vm, '心神 -1 · 还该采「' + (NUM[target] || target) + '」纹', 'bad');
    syncHud();
    if (hearts <= 0) {
      finishOnce('C', '心神耗尽，只采到 ' + activeRow + ' 层');
      return;
    }
    bag.after(function () {
      if (done || vm.phase !== 'playing') return;
      paint();
      render();
    }, 420);
    render();
  }

  paint();
  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'bridge', name: '循纹递推', create: create };
