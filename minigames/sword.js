'use strict';

// 步法连环（步法连环 / 踏云步专属）：卷轴铺开一串步位，底下四个步法键按序把整套走完。
// 与「节律判定」的区别：节律是盯光环收放的时机、只靠单点；这里是看符号、按次序输入，
// 段数递增、踏错要重来这一步并扣时间。舞台是横向步法卷轴 + 四个大按键，不是圆盘。

const C = require('./common.js');

const MOVES = ['进', '退', '侧', '转'];

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const duration = Math.max(12, (p.duration || 20) + (perks.easy ? 4 : 0) - (hard ? 3 : 0));
  const totalSegments = (p.segments || 4);
  const baseLen = (p.baseLen || 3) + (hard ? 1 : 0);
  const keyList = (p.moves || MOVES).slice();
  const vm = C.makeVm(0, 0, '看清卷轴，按序踏位', ctx.tip || '照着卷轴上的步位，依次点下方四个步法键');
  vm.stage = 'scroll';
  vm.extras.showGrid = false;
  vm.extras.showCombo = true;
  vm.extras.showMeter = true;
  vm.timeText = C.mmss(duration);
  vm.scoreText = '成步 0';
  vm.scroll = {
    moves: [],
    keys: keyList.map(function (g, i) { return { id: 'k' + i, glyph: g, index: i }; }),
    cursor: 0,
    segment: 1,
    total: totalSegments,
  };

  const bag = C.TimerBag();
  let left = duration;
  let hits = 0;
  let combo = 0;
  let segmentsDone = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function gradeBySegments() {
    if (segmentsDone >= totalSegments) return 'S';
    if (segmentsDone >= totalSegments - 1) return 'A';
    if (segmentsDone >= totalSegments - 2) return 'B';
    return 'C';
  }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(segmentsDone, totalSegments);
    vm.progressText = segmentsDone + ' / ' + totalSegments + ' 段';
    vm.scoreText = '成步 ' + hits;
    vm.combo = combo;
    vm.comboText = combo >= 3 ? '连招 ×' + combo : '';
    vm.gradeNow = gradeBySegments();
    vm.goal = '第 ' + vm.scroll.segment + ' 段 · 还差 ' + (totalSegments - segmentsDone) + ' 段圆满';
    vm.meter = { label: '本段步位', value: vm.scroll.cursor, max: vm.scroll.moves.length };
    vm.hint = '踏错只需重走这一步。';
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '一气呵成') : '';
    render();
    ctx.finish({ grade: grade, score: hits, summary: summary });
  }

  function paintMoves() {
    for (let i = 0; i < vm.scroll.moves.length; i += 1) {
      vm.scroll.moves[i].state = i < vm.scroll.cursor ? 'done' : i === vm.scroll.cursor ? 'active' : 'todo';
    }
  }

  function newSegment() {
    const len = Math.min(baseLen + vm.scroll.segment - 1, 9);
    const moves = [];
    for (let i = 0; i < len; i += 1) {
      moves.push({ id: 's' + vm.scroll.segment + '_' + i, glyph: keyList[C.randInt(keyList.length)], state: 'todo' });
    }
    vm.scroll.moves = moves;
    vm.scroll.cursor = 0;
    paintMoves();
    syncHud();
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '起手，照卷踏位';
    vm.banner = theme.banner || '剑势连绵';
    newSegment();
    bag.every(function () {
      left -= 1;
      syncHud();
      if (left <= 0) {
        finishOnce(gradeBySegments(), '成 ' + segmentsDone + ' 段 · ' + hits + ' 招');
        return;
      }
      render();
    }, 1000);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (index < 0 || index >= keyList.length) return;
    const need = vm.scroll.moves[vm.scroll.cursor];
    if (!need) return;
    if (keyList[index] === need.glyph) {
      hits += 1;
      combo += 1;
      vm.scroll.moves[vm.scroll.cursor].state = 'done';
      vm.scroll.cursor += 1;
      C.flash(vm, (theme.hit || '招式合拍') + (combo >= 4 ? ' · 连招 ×' + combo : ''), 'good');
      if (vm.scroll.cursor >= vm.scroll.moves.length) {
        segmentsDone += 1;
        if (segmentsDone >= totalSegments) {
          paintMoves();
          syncHud();
          finishOnce('S', totalSegments + ' 段全成 · ' + hits + ' 招');
          return;
        }
        vm.scroll.segment += 1;
        vm.banner = '第 ' + vm.scroll.segment + ' 段 · 剑势更密';
        newSegment();
        return;
      }
      paintMoves();
      syncHud();
      render();
      return;
    }
    combo = 0;
    left = Math.max(1, left - 1);
    vm.status = theme.miss || '断了招';
    C.flash(vm, '步位错了 · 少一息', 'bad');
    syncHud();
    render();
  }

  newSegment();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'sword', name: '步法连环', create: create };
