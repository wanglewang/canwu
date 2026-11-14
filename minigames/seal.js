'use strict';

// 成对翻牌（内视观窍 / 太虚诀专属）：十二处气窍阖在盘中，翻开两处，卦象相同才通一对。
// 与「数格辨禁」的区别：探禁是看数字推禁位、还能布符压注；这里是记位置的翻牌配对，
// 没有数字、没有禁制，只有「翻开—记住—阖上」；入定可观想照见一对。

const C = require('./common.js');

const SIGNS = ['乾', '坤', '震', '巽', '坎', '离', '艮', '兑'];

// 按用时评级的玩法：档位只在结算出现（局内反推 0 秒必是 S），局内报下一条线。
const GRADE_LINE = [18, 30, 46];

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
  const vm = C.makeVm(cols, n, '翻开两处气窍，卦象相同才通一对', ctx.tip || '记住翻过的卦象，把成对的都解出来');
  vm.timeText = '00:00';
  vm.scoreText = '气窍 0 / ' + pairs;
  vm.extras.showHint = true;
  vm.extras.showMeter = true;
  vm.extras.showGradeNow = false;
  vm.hint = vm.costText + ' · 入定照见剩 ' + hintsLeft + ' 次';

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
    vm.scoreText = '气窍 ' + pairsDone + ' / ' + pairs;
    vm.gradeNow = gradeNow();
    // 这一关的 S 还多一条「翻牌要少」，所以只把附加条件挂在 S 线上；
    // 还剩几对已经在进度里，不必在目标句里再说一遍。
    vm.goal = C.paceGoal(elapsed, GRADE_LINE, '牌 ≤ ' + pairs * 4);
    vm.meter = { label: '已通气窍', value: pairsDone, max: pairs };
    vm.hint = vm.costText + ' · 翻牌 ' + flips + ' 次 · 入定照见剩 ' + hints + ' 次';
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
        vm.cells[i].label = theme.motif || '观';
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
    vm.banner = grade === 'S' ? (theme.praise || '洞若观火') : '';
    render();
    ctx.finish({ grade: grade, score: pairsDone, summary: summary });
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '翻牌辨象，成对的才通得开';
    vm.banner = theme.banner || '灵光一线';
    paint();
    syncHud();
    render();
    bag.every(function () {
      elapsed += 1;
      syncHud();
      if (elapsed >= timeLimit) {
        // 时辰到还没通完＝没走完：走火。通完了只是慢，那才是 C。
        finishOnce('F', '只通了 ' + pairsDone + ' 对，时辰到了');
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
      vm.status = '记住这一象，再翻一处';
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
      C.flash(vm, (theme.hit || '气窍相合') + ' · 通 ' + pairsDone + ' 对', 'gold');
      vm.status = '相合，气窍通了一分';
      paint();
      syncHud();
      if (pairsDone >= pairs) {
        finishOnce(gradeNow(), pairs + ' 对卦象全通 · ' + elapsed + ' 秒 · 翻牌 ' + flips + ' 次');
        return;
      }
      render();
      return;
    }
    locked = true;
    vm.status = '卦象不合，再看一眼';
    C.flash(vm, '卦象不合', 'bad');
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
      C.flash(vm, '入定已散', 'bad');
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
    vm.status = '入定照见一对（剩 ' + hints + ' 次）';
    C.flash(vm, '卦象显形', 'gold');
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

function lines(p) {
  const pairs = Math.max(2, (p && p.pairs) || 6);
  return {
    rule: '按解完全部对子的用时；S 另要求翻牌次数少',
    items: ['S ≤ ' + GRADE_LINE[0] + ' 秒，且翻牌 ≤ ' + pairs * 4 + ' 次',
      'A ≤ ' + GRADE_LINE[1] + ' 秒', 'B ≤ ' + GRADE_LINE[2] + ' 秒', '其余为 C'],
    fail: '时辰到还没全部通开 → 走火 F，这一局没有收益',
  };
}

module.exports = { id: 'seal', name: '成对翻牌', create: create, lines: lines };
