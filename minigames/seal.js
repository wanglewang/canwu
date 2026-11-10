'use strict';

// 符纹配对（破解封印 / 太虚诀专属）：十二张符牌扣在案上，翻开两张，纹样相同才解得一对。
// 与「辨纹探禁」的区别：探禁是看数字推雷位、还能插旗；这里是记位置的翻牌配对，
// 没有数字、没有雷，只有「翻开—记住—盖回」；符箓照纹可替你亮出一对。

const C = require('./common.js');

const SIGNS = ['乾', '坤', '震', '巽', '坎', '离', '艮', '兑'];

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const pairs = Math.min(SIGNS.length, (p.pairs || 6) + (hard ? 1 : 0));
  const cols = p.cols || 4;
  const n = pairs * 2;
  const flipMs = Math.max(450, (p.flipMs || 850) - (hard ? 150 : 0) + (perks.easy ? 200 : 0));
  const timeLimit = p.timeLimit || 70;
  const hintsLeft = 2 + (perks.easy ? 1 : 0);
  const vm = C.makeVm(cols, n, '翻开两张符牌，纹样相同才解得一对', ctx.tip || '记住翻过的符纹，把成对的都解出来');
  vm.timeText = '00:00';
  vm.scoreText = '符对 0 / ' + pairs;
  vm.extras.showHint = true;
  vm.extras.showMeter = true;
  vm.hint = '符箓照纹剩 ' + hintsLeft + ' 次';

  const bag = C.TimerBag();
  const deck = [];
  for (let i = 0; i < pairs; i += 1) { deck.push(SIGNS[i]); deck.push(SIGNS[i]); }
  C.shuffle(deck);

  let matched = new Array(n).fill(false);
  let faceUp = new Array(n).fill(false);
  let first = -1;
  let locked = false;
  let pairsDone = 0;
  let flips = 0;
  let elapsed = 0;
  let hints = hintsLeft;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function gradeNow() {
    if (pairsDone >= pairs) {
      return elapsed <= 22 && flips <= pairs * 4 ? 'S' : elapsed <= 35 ? 'A' : elapsed <= 50 ? 'B' : 'C';
    }
    if (elapsed <= 18) return 'S';
    if (elapsed <= 30) return 'A';
    if (elapsed <= 46) return 'B';
    return 'C';
  }

  function syncHud() {
    vm.timeText = C.mmss(elapsed);
    vm.progress = C.pct(pairsDone, pairs);
    vm.progressText = pairsDone + ' / ' + pairs + ' 对';
    vm.scoreText = '符对 ' + pairsDone + ' / ' + pairs;
    vm.gradeNow = gradeNow();
    vm.goal = pairsDone >= pairs ? '封印已解' : '还剩 ' + (pairs - pairsDone) + ' 对 · 翻牌 ' + flips + ' 次';
    vm.meter = { label: '已解符对', value: pairsDone, max: pairs };
    vm.hint = '翻牌 ' + flips + ' 次 · 符箓照纹剩 ' + hints + ' 次';
    vm.pair = { locked: locked, first: first, matched: pairsDone, flips: flips };
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      if (matched[i]) {
        vm.cells[i].cls = 'cell cell--matched';
        vm.cells[i].label = deck[i];
        vm.cells[i].tone = 0;
      } else if (faceUp[i]) {
        vm.cells[i].cls = 'cell cell--flipped';
        vm.cells[i].label = deck[i];
        vm.cells[i].tone = 1 + (SIGNS.indexOf(deck[i]) % 5);
      } else {
        vm.cells[i].cls = 'cell cell--card';
        vm.cells[i].label = theme.motif || '印';
        vm.cells[i].tone = 0;
      }
    }
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '破印而出') : '';
    render();
    ctx.finish({ grade: grade, score: pairsDone, summary: summary });
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '翻牌辨纹，成对的才解得开';
    vm.banner = theme.banner || '封松动了';
    paint();
    syncHud();
    render();
    bag.every(function () {
      elapsed += 1;
      syncHud();
      if (elapsed >= timeLimit) {
        finishOnce('C', '只解出 ' + pairsDone + ' 对，时辰到了');
        return;
      }
      render();
    }, 1000);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing' || locked) return;
    if (index < 0 || index >= n || matched[index] || faceUp[index]) return;
    faceUp[index] = true;
    flips += 1;
    paint();
    if (first < 0) {
      first = index;
      vm.status = '记住这一纹，再翻一张';
      syncHud();
      render();
      return;
    }
    const a = first;
    first = -1;
    if (deck[a] === deck[index]) {
      matched[a] = true;
      matched[index] = true;
      pairsDone += 1;
      C.flash(vm, (theme.hit || '符纹渐明') + ' · 解 ' + pairsDone + ' 对', 'gold');
      vm.status = '成对，封印松了一分';
      paint();
      syncHud();
      if (pairsDone >= pairs) {
        finishOnce(gradeNow(), pairs + ' 对符纹全解 · ' + elapsed + ' 秒 · 翻牌 ' + flips + ' 次');
        return;
      }
      render();
      return;
    }
    locked = true;
    vm.status = '纹样不合，再看一眼';
    C.flash(vm, '纹样不合', 'bad');
    syncHud();
    render();
    bag.after(function () {
      if (done || vm.phase !== 'playing') return;
      faceUp[a] = false;
      faceUp[index] = false;
      locked = false;
      paint();
      syncHud();
      render();
    }, flipMs);
  }

  function hint() {
    if (done || vm.phase !== 'playing' || locked) return;
    if (hints <= 0) {
      C.flash(vm, '符箓已用尽', 'bad');
      render();
      return;
    }
    const pick = [];
    for (let i = 0; i < n && pick.length === 0; i += 1) {
      if (matched[i] || faceUp[i]) continue;
      for (let j = i + 1; j < n; j += 1) {
        if (!matched[j] && !faceUp[j] && deck[j] === deck[i]) { pick.push(i, j); break; }
      }
    }
    if (pick.length < 2) return;
    hints -= 1;
    const prev = pick.map(function (i) { return { cls: vm.cells[i].cls, label: vm.cells[i].label }; });
    for (let k = 0; k < pick.length; k += 1) {
      vm.cells[pick[k]].cls = 'cell cell--hint';
      vm.cells[pick[k]].label = deck[pick[k]];
    }
    vm.status = '符箓照出一对（剩 ' + hints + ' 次）';
    C.flash(vm, '符纹显形', 'gold');
    syncHud();
    render();
    bag.after(function () {
      if (done || vm.phase !== 'playing') return;
      for (let k = 0; k < pick.length; k += 1) {
        vm.cells[pick[k]].cls = prev[k].cls;
        vm.cells[pick[k]].label = prev[k].label;
      }
      render();
    }, 1600);
  }

  paint();
  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    hint: hint,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'seal', name: '符纹配对', create: create };
