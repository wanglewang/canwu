'use strict';

// 成对翻牌（内视观窍 / 太虚照见诀专属）：十二处气窍阖在盘中，翻开两处，卦象相同才通一对。
// 与「数格辨禁」的区别：探禁是看数字推禁位、还能布符压注；这里是记位置的翻牌配对，
// 没有数字、没有禁制，只有「翻开—记住—阖上」；入定可观想照见一对。

const C = require('./common.js');
const K = require('./teach-kit.js');

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
  // 阶段新法（真源在 data/practice.js 的 STAGE_RULES）：大成「留影」、大圆满「记印」。
  // 两条都只改「翻过的卦象留在盘上多久」，不改配对判定，也不增减照见次数。
  const stage = typeof perks.tier === 'number' ? perks.tier : 0;
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
  // 大成「留影」：照见的那一对不再到时就散，留到玩家点下一张。
  let peek = [];
  // 大圆满「记印」：翻错过的牌阖上之后牌背留一道残影。记的是玩家**自己刚看过**的那一象，
  // 不是替他记一张没翻过的牌——这一门考的仍是记性。
  let ghost = {};
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
        vm.cells[i].emblem = SIGNS.indexOf(deck[i]) + 1;
      } else if (faceUp[i]) {
        vm.cells[i].cls = 'cell cell--flipped';
        vm.cells[i].label = deck[i];
        vm.cells[i].tone = 1 + (SIGNS.indexOf(deck[i]) % 5);
        vm.cells[i].emblem = SIGNS.indexOf(deck[i]) + 1;
      } else {
        const mark = stage >= 5 && ghost[i] ? ghost[i] : '';
        vm.cells[i].cls = mark ? 'cell cell--card cell--ghost' : 'cell cell--card';
        vm.cells[i].label = theme.motif || '观';
        vm.cells[i].tone = 0;
        vm.cells[i].emblem = mark ? SIGNS.indexOf(mark) + 1 : 20;
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
        // 时辰到还没通完＝没走完：失败。通完了只是慢，那才是 C。
        finishOnce('F', '只通了 ' + pairsDone + ' 对，时辰到了');
        return;
      }
      render();
    }, 1000);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing' || locked) return;
    if (index < 0 || index >= n || matched[index] || faceUp[index]) return;
    clearPeek();
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
      // 记印要在阖上的这一刻落下：再晚一步，paint 已经把两张牌画成牌背了。
      if (stage >= 5) {
        ghost[a] = deck[a];
        ghost[index] = deck[index];
      }
      faceUp[a] = false;
      faceUp[index] = false;
      locked = false;
      paint();
      syncHud();
      render();
    }, flipMs);
  }

  // 照见的那一对在点下一张牌时收回去。已经被翻开 / 已通的不动：它们有自己的类名。
  function clearPeek() {
    if (!peek.length) return;
    for (let k = 0; k < peek.length; k += 1) {
      const i = peek[k];
      if (faceUp[i] || matched[i]) continue;
      const mark = stage >= 5 && ghost[i] ? ghost[i] : '';
      vm.cells[i].cls = mark ? 'cell cell--card cell--ghost' : 'cell cell--card';
      vm.cells[i].label = theme.motif || '观';
      vm.cells[i].emblem = mark ? SIGNS.indexOf(mark) + 1 : 20;
    }
    peek = [];
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
    // 上一对照见还亮着就先收回去，免得两次照见叠在同一屏上分不清是哪一对。
    clearPeek();
    hints -= 1;
    const prev = pick.map(function (i) { return { cls: vm.cells[i].cls, label: vm.cells[i].label, emblem: vm.cells[i].emblem }; });
    for (let k = 0; k < pick.length; k += 1) {
      vm.cells[pick[k]].cls = 'cell cell--hint';
      vm.cells[pick[k]].label = deck[pick[k]];
      vm.cells[pick[k]].emblem = SIGNS.indexOf(deck[pick[k]]) + 1;
    }
    vm.status = stage >= 3
      ? '入定照见一对（剩 ' + hints + ' 次 · 点下一处才散）'
      : '入定照见一对（剩 ' + hints + ' 次）';
    C.flash(vm, '卦象显形', 'gold');
    syncHud();
    render();
    // 大成起不再到时就散：照见的这一对留到玩家点下一处。
    // 它没有因此变成「白通一对」——牌仍要一张一张点开，翻牌数照记。
    if (stage >= 3) {
      peek = pick.slice();
      return;
    }
    bag.after(function () {
      if (done || vm.phase !== 'playing') return;
      for (let k = 0; k < pick.length; k += 1) {
        vm.cells[pick[k]].cls = prev[k].cls;
        vm.cells[pick[k]].label = prev[k].label;
        vm.cells[pick[k]].emblem = prev[k].emblem;
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
    abandon: function () { finishOnce('F', '中途结束'); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const pairs = Math.max(2, (p && p.pairs) || 6);
  return {
    rule: '按解完全部对子的用时；S 另要求翻牌次数少',
    items: ['S ≤ ' + GRADE_LINE[0] + ' 秒，且翻牌 ≤ ' + pairs * 4 + ' 次',
      'A ≤ ' + GRADE_LINE[1] + ' 秒', 'B ≤ ' + GRADE_LINE[2] + ' 秒', '其余为 C'],
    fail: '时辰到还没全部通开 → 失败 F，这一局没有收益',
  };
}

// 引导按段走。首段用四张牌两对：牌少才看得清「配对只看卦象，与位置无关」——
// 两张同卦故意摆在对角，位置差得越远，这件事越显眼。
// 段界那四盘直接摆本段的真实牌数（10 / 12 / 14 / 16 张），让玩家在满盘牌上翻那一对，
// 自己看见「同卦的那张隔得更远了」，而不是听一句「这一段 7 对」。
const TEACH_PAIRS = [5, 6, 7, 7, 8];

// 一段一副牌：sign 1..pairs 各两张，同一卦固定落在 i 与 i+pairs。
// 写死顺序而非现洗：教学盘得保证「呼吸的那一张」每局都在同一个位置。
function teachDeck(stage) {
  const pairs = TEACH_PAIRS[stage];
  const deck = [];
  for (let i = 0; i < pairs * 2; i += 1) deck.push((i % pairs) + 1);
  return deck;
}

function createTeach(ctx) {
  const stage = Math.max(0, Math.min(4, (ctx && ctx.stage) | 0));
  // 首段用小盘（两对），段界用真盘（本段对数）。
  const deck = stage === 0 ? [1, 2, 2, 1] : teachDeck(stage);
  const far = stage === 0 ? 3 : 1 + TEACH_PAIRS[stage];
  const cells = K.blank(4, deck.length);
  let flipped = -1;
  let matched = false;
  return K.run(ctx, {
    cols: 4,
    cells: cells,
    status: stage === 0 ? '教学 · 翻开两张相同的卦' : '教学 · 这一段 ' + TEACH_PAIRS[stage] + ' 对',
    steps: [
      {
        at: [0],
        text: '翻开第一张 · 记住它的卦象',
        take: function (i) {
          flipped = i;
          return { text: '记住这一卦 · 配对只看卦象，不看位置' };
        },
      },
      {
        at: [far],
        text: '再翻这一张 · 卦象一样就成对',
        take: function () {
          matched = true;
          return { text: '成对了 · 同卦就是一对，离多远都算' };
        },
      },
    ],
    paint: function () {
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i];
        const isPair = i === 0 || i === far;
        c.label = SIGNS[deck[i] - 1];
        c.tone = deck[i];
        c.emblem = deck[i];
        c.cls = 'cell cell--card';
        if (matched && isPair) c.cls += ' cell--matched';
        else if (i === flipped) c.cls += ' cell--flipped';
      }
    },
    doneText: stage === 0
      ? '两处气窍一起通了 · 这一段一共 ' + TEACH_PAIRS[0] + ' 对'
      : '这一段 ' + TEACH_PAIRS[stage] + ' 对 ' + (TEACH_PAIRS[stage] * 2)
        + ' 张 · 同卦那张隔得更开，看牌的时间也更短',
  });
}

const teach = { create: createTeach };

module.exports = { id: 'seal', name: '成对翻牌', create: create, lines: lines, teach: teach };
