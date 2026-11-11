'use strict';

// 追光点击（循光劈刺 / 基础剑法专属）：限时内追着唯一亮起的剑光劈刺，比命中数。
// 本门机制「剑势渐疾」：连中 5 记后剑光游走更快，劈空则连击与剑势一并断掉。

const C = require('./common.js');

function create(ctx) {
  const p = ctx.params || {};
  const hard = ctx.difficulty === 'hard';
  const perks = ctx.perks || {};
  const twist = ctx.twist || '';
  const theme = ctx.theme || {};
  const duration = Math.max(8, (p.duration || 15) + (perks.easy ? 3 : 0) - (hard ? 3 : 0));
  const baseInterval = Math.max(320, (p.interval || 760) + (perks.easy ? 120 : 0) - (hard ? 160 : 0));
  const grid = p.grid || 9;
  const sLimit = Math.ceil(duration * 1.9);
  const aLimit = Math.ceil(duration * 1.35);
  const bLimit = Math.ceil(duration * 0.8);
  const glyph = theme.glyph || '灵';
  const vm = C.makeVm(p.cols || 3, grid, '凝神，等剑光亮起…', ctx.tip || '点中亮起的格子');
  vm.timeText = C.mmss(duration);
  vm.scoreText = '命中 0';
  vm.extras.showCombo = true;
  vm.goal = C.goalFor('C', sLimit, '次命中');

  const bag = C.TimerBag();
  let target = -1;
  let score = 0;
  let combo = 0;
  let hot = false;
  let left = duration;
  let lastHitAt = 0;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function syncHud() {
    vm.timeText = C.mmss(Math.max(0, left));
    vm.progress = C.pct(duration - left, duration);
    vm.progressText = Math.max(0, left) + ' 息';
    vm.scoreText = '命中 ' + score;
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连击 ×' + combo : '';
    vm.gradeNow = C.gradeBy(score, sLimit, aLimit, bLimit);
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, sLimit - score), '次命中');
  }

  function finishOnce(grade, summary) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '眼疾手快') : '';
    render();
    ctx.finish({ grade: grade, score: score, summary: summary });
  }

  function intervalNow() {
    return hot ? Math.max(300, Math.round(baseInterval * 0.78)) : baseInterval;
  }

  function moveTarget() {
    if (target >= 0 && vm.cells[target]) {
      vm.cells[target].label = '';
      vm.cells[target].cls = 'cell';
    }
    let next = C.randInt(grid);
    if (next === target) next = (next + 1) % grid;
    target = next;
    vm.cells[target].cls = 'cell cell--lit' + (hot ? ' cell--hot' : '');
    vm.cells[target].label = glyph;
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '剑光已现，快！';
    vm.banner = theme.banner || '';
    syncHud();
    moveTarget();
    bag.every(function () {
      left -= 1;
      syncHud();
      if (left <= 0) {
        finishOnce(C.gradeBy(score, sLimit, aLimit, bLimit), '命中 ' + score + ' 次');
        return;
      }
      render();
    }, 1000);
    bag.everyFlex(moveTarget, intervalNow);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    const now = Date.now();
    if (index === target) {
      if (now - lastHitAt < 180) return;
      lastHitAt = now;
      score += 1;
      combo += 1;
      C.flash(vm, (theme.hit || '一剑中的') + (combo >= 3 ? ' · 连击 ×' + combo : ''), 'good');
      if (twist === 'forge' && combo >= 5 && !hot) {
        hot = true;
        vm.banner = theme.banner || '剑光乍起';
      }
      vm.status = combo >= 3 ? '手稳，别断' : '好，再快一点';
      syncHud();
      moveTarget();
      return;
    }
    combo = 0;
    hot = false;
    vm.banner = '';
    vm.cells[index].cls = 'cell cell--bad';
    vm.status = theme.miss || '劈空了';
    C.flash(vm, theme.miss || '劈空了', 'bad');
    syncHud();
    const i = index;
    bag.after(function () {
      if (!done && vm.phase === 'playing' && i !== target) {
        vm.cells[i].cls = 'cell';
        render();
      }
    }, 220);
    render();
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    abandon: function () { finishOnce('F', '中途收功'); },
    destroy: function () { bag.clear(); },
  });
}

module.exports = { id: 'click', name: '追光点击', create: create };
