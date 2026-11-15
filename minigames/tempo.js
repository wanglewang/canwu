'use strict';

// 节律判定（吸纳灵力 / 心法·吐纳周天诀专属）：光环不断向内收敛，收进朱带的那一瞬点击
// 判「圆满」，早一点或晚一点落在带外沿判「合拍」（半拍），打满本档拍数后按「圆满当量」评级。
// 与「剑招连段」的区别：这里只判时机、不看符号；与蓄力停区的区别是「连续多拍单点」而非「长按松手」。
//
// 三条手感约定，动数之前先看：
// ① **拍点是固定网格**。一拍 = 光环从 START 收到 FLOOR 的固定 tick 数；点过之后光环继续缩到底，
//    到下一拍才回到起点，所以拍与拍的间隔恒定，玩家能靠预判接拍。
//    （旧做法是「点一下就复位」，等于每一拍都是一次全新的反应任务——这门叫「节律」，练的不该是反应。）
// ② **判定带按毫秒定，再折回 scale**，且有 MIN_WIN_MS 兜底。40ms 的刷新率加触控延迟会直接吃掉
//    半个窗口，窄到两帧的窗口不是难度，是碰运气。
// ③ **档位差异只由 data/practice.js 的 pace 给**（乘性）。这里只做乘性修正（×1.45 / ×0.86），
//    一律不做加减：加法叠在等比数列上必然把某一档拉成断崖（困难档曾经因此比普通紧 39%）。

const C = require('./common.js');

const START_SCALE = 1.75;
const JUDGE_SCALE = 1.0;
const TICK_MS = 40;
const FLOOR_SCALE = 0.72;

// 判定带单侧宽度下限：合计 200ms，正是全站「反应不短于 200ms」的下限。
const MIN_WIN_MS = 100;
// 本门机制「一息绵长」：判定带更宽、收得更慢。乘性，五档一致成立。
const TWIST_WIN = 1.45;
const TWIST_STEP = 0.86;
// 熟练便利（段位到大成 6000 以上）：只放一档的余量，不能一口气抵掉两档。
const PERK_WIN = 1.12;
// 半拍的宽容只在「早了」这一侧放大：玩家感知普遍提前；晚到是自己没跟上节拍。
const GOOD_EARLY = 2.2;
const GOOD_LATE = 1.4;

function fmt(n) {
  return String(Math.round(n * 10) / 10);
}

// 评级四条线只有这一个出处：局内 goal 与说明页 lines() 都读它。
function bands(total) {
  // 1 分容错 = 本档的 9%–14%。拍数越少这一分占比越大，所以 S 的相对宽容随拍数收窄；
  // 这是「只错一拍」的固有代价，说明页据实写出来，不再声称「各档完全一致」。
  const sMin = total - 1;
  const aMin = total - 2.5;
  // B 线不许贴到 A 线上：简单档 ceil(7×0.5)=4 与 A 4.5 只差半拍，B 会变成一道缝。
  const bMin = Math.min(Math.ceil(total * 0.5), aMin - 1);
  return { sMin: sMin, aMin: aMin, bMin: bMin };
}

// 一局的时序：拍数、收一步的步长、判定带（scale 与毫秒两种口径）。
// 抽成纯函数是为了让测试能逐档复算「窗口有没有破 200ms、相邻档有没有断崖」。
function metrics(p, opts) {
  const o = opts || {};
  const src = p || {};
  const total = Math.max(4, Math.floor(src.beats || 8));
  let window = Number(src.window || 0.09);
  let step = Number(src.speed || 0.026);
  if (o.twist === 'absorb') { window *= TWIST_WIN; step *= TWIST_STEP; }
  if (o.easy) window *= PERK_WIN;
  window = Math.max(0.045, window);
  step = Math.max(0.012, step);
  window = Math.max(window, MIN_WIN_MS / TICK_MS * step);
  return {
    total: total,
    step: step,
    window: window,
    winMs: window / step * TICK_MS,
    beatMs: (START_SCALE - FLOOR_SCALE) / step * TICK_MS,
  };
}

function create(ctx) {
  const p = ctx.params || {};
  const twist = ctx.twist || '';
  const theme = ctx.theme || {};
  const perks = ctx.perks || {};
  const m = metrics(p, { twist: twist, easy: !!perks.easy });
  const total = m.total;
  const window = m.window;
  const step = m.step;
  const band = bands(total);

  const vm = C.makeVm(0, 0, '气机收敛，一拍一拍来', ctx.tip || '光环落进朱带时点击');
  vm.stage = 'ring';
  vm.extras.showGrid = false;
  vm.extras.showRing = true;
  vm.extras.showCombo = true;
  vm.ring = {
    scale: START_SCALE, judge: JUDGE_SCALE, window: window,
    // 判定带画在盘面上，粗细就等于窗口：外沿 = 带心 + 窗口，内沿 = 带心 − 窗口。
    // bandBox 是这一圈的盒子直径，bandWidth 是描边宽度，两者相减正好落回内沿。
    bandBox: 2 * Math.round(100 + 100 * window),
    bandWidth: Math.round(100 + 100 * window) - Math.round(100 - 100 * window),
    beat: 1, total: total, tone: 'idle',
  };
  vm.timeText = '第 1 / ' + total + ' 拍';
  vm.scoreText = '圆满 0';
  vm.goal = C.goalFor('C', total - 1, '个圆满');
  vm.hint = vm.costText;

  const bag = C.TimerBag();
  let beat = 1;
  let perfect = 0;
  let good = 0;
  let miss = 0;
  let combo = 0;
  let longest = 0;
  // 这一拍已经判过了：光环继续缩到底（保持节律），但再点不再算数，也跳不到下一拍。
  let answered = false;
  let done = false;
  let started = false;

  function render() { ctx.render(vm); }

  function points() { return perfect + good * 0.5; }

  function gradeNow() {
    const pts = points();
    if (pts >= band.sMin) return 'S';
    if (pts >= band.aMin) return 'A';
    if (pts >= band.bMin) return 'B';
    return 'C';
  }

  function summary() {
    // 结算要把「拍数」和「评级用的分」一起报：半拍折算之后，只报整数拍玩家对不上自己为什么是 A。
    return '圆满 ' + perfect + ' 拍 · 合拍 ' + good + ' 拍 · 空拍 ' + miss
      + ' 拍 · 计 ' + fmt(points()) + ' 分 · 最长连拍 ' + longest;
  }

  function syncHud() {
    vm.timeText = '第 ' + Math.min(beat, total) + ' / ' + total + ' 拍';
    // 报的是「圆满当量」而不是圆满拍数：评级按半拍折算，HUD 只报整数时玩家对不上自己为什么是 A。
    vm.scoreText = '圆满 ' + fmt(points());
    vm.progress = C.pct(beat - 1, total);
    vm.progressText = (beat - 1) + ' / ' + total + ' 拍';
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连拍 ×' + combo : '';
    vm.gradeNow = gradeNow();
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, Math.round((total - 1 - points()) * 10) / 10), '个圆满');
  }

  function finishOnce(grade, text) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '一气呵成') : '';
    render();
    ctx.finish({ grade: grade, score: perfect, summary: text });
  }

  function nextBeat() {
    beat += 1;
    if (beat > total) {
      finishOnce(gradeNow(), summary());
      return;
    }
    // 剩下的拍全打满也够不到 B：结果已经是 C，不再让玩家把剩下几拍点完。
    if (points() + (total - beat + 1) < band.bMin) {
      finishOnce('C', summary() + ' · 后程已无从追回');
      return;
    }
    vm.ring.scale = START_SCALE;
    vm.ring.beat = beat;
    vm.ring.tone = 'idle';
    answered = false;
    syncHud();
    render();
  }

  function tick() {
    if (done || vm.phase !== 'playing') return;
    vm.ring.scale -= step;
    if (vm.ring.scale <= FLOOR_SCALE) {
      // 没点就缩过头：这一拍空掉，但拍点仍落在固定网格上，下一拍照常起。
      if (!answered) {
        miss += 1;
        combo = 0;
        vm.ring.tone = 'miss';
        C.flash(vm, '缩过头 · 空拍', 'bad');
      }
      nextBeat();
      return;
    }
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '随气机收放，一拍一拍来';
    vm.banner = theme.banner || '凝神';
    syncHud();
    render();
    bag.every(tick, TICK_MS);
  }

  function tap() {
    if (done || vm.phase !== 'playing' || answered) return;
    answered = true;
    // 正数是早了，负数是晚了：盘面上就是光环在带外还是在带里，判定按这一侧分宽容度。
    const diff = vm.ring.scale - JUDGE_SCALE;
    const dist = Math.abs(diff);
    const halfWin = window * (diff > 0 ? GOOD_EARLY : GOOD_LATE);
    let tone;
    if (dist <= window) {
      perfect += 1;
      combo += 1;
      if (combo > longest) longest = combo;
      tone = 'perfect';
      C.flash(vm, combo >= 3 ? '圆满 · 连拍 ×' + combo : (theme.hit || '圆满'), 'gold');
    } else if (dist <= halfWin) {
      good += 1;
      combo = 0;
      tone = 'good';
      // 半拍要报清偏哪边：只说「合拍」，玩家学不会自己是早了还是晚了。
      C.flash(vm, diff > 0 ? '早半拍' : '晚半拍', 'good');
    } else {
      miss += 1;
      combo = 0;
      tone = 'miss';
      C.flash(vm, diff > 0 ? '太早 · 空拍' : '太晚 · 空拍', 'bad');
    }
    vm.ring.tone = tone;
    if (combo >= 4) vm.banner = theme.banner || '气机连绵';
    syncHud();
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

function lines(p) {
  const total = Math.max(4, Math.floor((p && p.beats) || 8));
  const b = bands(total);
  return {
    rule: '按圆满拍数（合拍只算半拍，空拍不算）',
    items: [
      'S：' + total + ' 拍里圆满 ' + b.sMin + ' 分以上（合拍只算半拍，即最多漏 1 分）',
      'A：圆满 ' + b.aMin + ' 分以上',
      'B：圆满 ' + b.bMin + ' 分以上',
      '其余为 C',
    ],
  };
}

module.exports = {
  id: 'tempo', name: '节律判定', create: create, lines: lines,
  metrics: metrics, bands: bands,
  MIN_WIN_MS: MIN_WIN_MS, TWIST_WIN: TWIST_WIN, TWIST_STEP: TWIST_STEP,
};
