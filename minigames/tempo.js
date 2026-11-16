'use strict';

// 节律判定（吸纳灵力 / 心法·吐纳周天诀专属）：以「谱」为唯一真源。
//
// 旧版是「一个恒定速度的光环、拍长固定」，五档只是把窗收窄——五档一个动词，
// 玩家在第一章就学会了全部本事，剩下 160 关只是要求他糊弄得更准。
// 现在改成按音乐写的谱：**拍号定分组、速度定心跳、音符时值定点的疏密**，
// 三样各管一件事，每一章只换其中一件，玩家每次都要学一样新东西。
//
// 四条手感约定，动数之前先看：
// ① **底层网格恒定**。谱是一小节 `bar` 格，音符落在整数格上，格长 `unitMs` 不变。
//    后段撤掉视觉提示时，玩家心里还有一层匀速的脉搏能数——这是「凭感觉」的依据；
//    间隔真随机的话，撤掉提示就只剩瞎猜。
// ② **环的周期 = 到这个音符的间隔**。长拍环走得慢、短拍环走得快，节拍是从速度上看出来的，
//    不是靠数字。所以每拍一个 `step`（旧版全曲一个 step，等于没有节拍）。
// ③ **判定窗按该手的「最短音符间隔」封顶**（≤ 四成）。双手里左手 3 秒一下、右手 1 秒一下，
//    窗口若按左手定，右手相邻两个窗口会互相吞掉。
// ④ **双手是两条独立时间线，不是和弦**。左右各判各的，恰好同时到只是巧合；
//    这样不必处理「两指是否同一帧按下」，也就没有同时判定的容差问题。

const C = require('./common.js');
// tick / 下限 / 本门机制倍数与参数生成端共用一份（data/practice.js 的 TEMPO_FLOOR）。
const F = require('../data/practice.js').TEMPO_FLOOR;

const START_SCALE = 1.75;
const JUDGE_SCALE = 1.0;
const FLOOR_SCALE = 0.72;
// 判定那一刻落在这次收缩的第几成：1.75 → 1.0 占 1.03 行程的 0.728。
// 余下的 0.27 是「点中之后环继续收到底」的那一截——没有它，环一判就弹回起点，
// 每一拍都变成一次全新的反应任务（这门叫「节律」，练的不该是反应）。
const JUDGE_FRAC = (START_SCALE - JUDGE_SCALE) / (START_SCALE - FLOOR_SCALE);
const TICK_MS = F.tickMs;
const MIN_WIN_MS = F.minWinMs;
// 判定窗不得超过该手最短音符间隔的四成：再宽，相邻两个音符的窗口就叠在一起了。
const MAX_WIN_FRAC = F.maxWinFrac;
// 本门机制「一息绵长」：判定带更宽。乘性，五档一致成立。
const TWIST_WIN = F.twistWin;
// 熟练便利（段位到大成）：只放一档的余量，不能一口气抵掉两档。
const PERK_WIN = F.perkWin;
// 合拍的宽容只在「早了」这一侧放大：玩家感知普遍提前；晚到是自己没跟上节拍。
const GOOD_EARLY = 2.2;
const GOOD_LATE = 1.4;
// 广义的宽容不超过该音符间隔的四成半，否则「太早」会撞上前一个音符。
const GOOD_CAP_FRAC = 0.45;

function fmt(n) {
  return String(Math.round(n * 10) / 10);
}

// 谱型归一：格位去重、排序、剔掉超出小节的。
function normOnsets(list, bar) {
  const out = [];
  for (let i = 0; i < (list || []).length; i += 1) {
    const v = Math.round(Number(list[i]));
    if (!(v >= 0 && v < bar)) continue;
    if (out.indexOf(v) < 0) out.push(v);
  }
  out.sort(function (a, b) { return a - b; });
  return out;
}

// 谱：把「拍号 + 速度 + 音符时值 + 双手」折成两条（或一条）绝对时间线。
// 纯函数，测试要逐关复算「窗有没有超四成、两手对不对得上、音符数对不对」。
function score(p, opts) {
  const o = opts || {};
  const src = p || {};
  const bar = Math.max(2, Math.round(Number(src.bar) || 8));
  const unitMs = Math.max(120, Math.round(Number(src.unitMs) || 500));
  const bars = Math.max(2, Math.round(Number(src.bars) || 4));
  const hands = Math.min(2, Math.max(1, Math.round(Number(src.hands) || 1)));
  const pats = Array.isArray(src.pattern) ? src.pattern : [];
  const baseWin = Math.max(MIN_WIN_MS, Math.round(Number(src.winMs) || 300));
  const cue = String(src.cue || 'all');
  const barMs = bar * unitMs;
  // 起手留一整小节当预拍：谱先走一遍，玩家跟着数进第一下。这也是提示的载体。
  const leadMs = barMs;

  const tracks = [];
  let total = 0;
  for (let h = 0; h < hands; h += 1) {
    const onsets = normOnsets(pats[h] || pats[0], bar);
    if (!onsets.length) continue;
    // 每个音符到下一个音符的间隔（格）。最后一个接回小节线，谱才能一句一句循环。
    const gaps = [];
    for (let j = 0; j < onsets.length; j += 1) {
      const next = j + 1 < onsets.length ? onsets[j + 1] : onsets[0] + bar;
      gaps.push((next - onsets[j]) * unitMs);
    }
    const shortest = Math.min.apply(null, gaps);
    let win = baseWin;
    if (o.twist === 'absorb') win *= TWIST_WIN;
    if (o.easy) win *= PERK_WIN;
    win = Math.max(MIN_WIN_MS, Math.min(win, shortest * MAX_WIN_FRAC));
    // 绝对时刻：预拍一小节 + 第几小节 + 小节内第几格。
    const notes = [];
    for (let b = 0; b < bars; b += 1) {
      for (let j = 0; j < onsets.length; j += 1) {
        notes.push({
          at: leadMs + b * barMs + onsets[j] * unitMs,
          gap: gaps[j],          // 到这个音符走了多久（= 环的周期）
          onset: onsets[j],
        });
      }
    }
    total += notes.length;
    tracks.push({
      hand: h, onsets: onsets, gaps: gaps, notes: notes,
      barMs: barMs, shortest: shortest, winMs: win,
    });
  }

  return {
    bar: bar, unitMs: unitMs, bars: bars, hands: Math.max(1, tracks.length),
    barMs: barMs, leadMs: leadMs, cue: cue,
    endMs: leadMs + bars * barMs,
    tracks: tracks, total: total,
  };
}

// 评级四条线只有这一个出处：局内 goal 与说明页 lines() 都读它。
function bands(total) {
  const n = Math.max(4, Math.floor(total || 8));
  // 1 分容错 = 本段的 6%–13%。音符越多这一分占比越小，所以 S 的相对宽容随谱变密而收窄。
  const sMin = n - 1;
  const aMin = n - 2.5;
  // B 线不许贴到 A 线上：音符少时 ceil(n×0.5) 与 A 只差半分，B 会变成一道缝。
  const bMin = Math.min(Math.ceil(n * 0.5), aMin - 1);
  return { sMin: sMin, aMin: aMin, bMin: bMin };
}

// 兼容旧调用：拿第一条时间线报「一拍多长、窗多宽」。新代码一律用 score()。
function metrics(p, opts) {
  const s = score(p, opts);
  const t = s.tracks[0] || { shortest: 1000, winMs: 300, notes: [{ gap: 1000 }] };
  const gap = t.notes[0].gap;
  const ticks = Math.max(1, Math.round(gap / TICK_MS));
  return {
    total: s.total,
    step: (START_SCALE - FLOOR_SCALE) / ticks,
    window: t.winMs / gap * (START_SCALE - FLOOR_SCALE),
    winMs: t.winMs,
    beatMs: gap,
  };
}

function create(ctx) {
  const p = ctx.params || {};
  const twist = ctx.twist || '';
  const theme = ctx.theme || {};
  const perks = ctx.perks || {};
  const s = score(p, { twist: twist, easy: !!perks.easy });
  const total = s.total;
  const band = bands(total);

  const vm = C.makeVm(0, 0, '气机收敛，一拍一拍来', ctx.tip || '光环落进朱带时点击');
  vm.stage = 'ring';
  vm.extras.showGrid = false;
  vm.extras.showRing = true;
  vm.extras.showCombo = true;

  // 每一手一条环。单手段只有一条，双手段左右各一条，各判各的。
  const rings = [];
  for (let h = 0; h < s.tracks.length; h += 1) {
    const t = s.tracks[h];
    const gap = t.notes[0].gap;
    const scaleWin = t.winMs / Math.max(1, gap) * (START_SCALE - FLOOR_SCALE);
    rings.push({
      id: 'r' + h,
      hand: h,
      scale: START_SCALE,
      judge: JUDGE_SCALE,
      window: scaleWin,
      // 判定带画在盘面上，粗细就等于窗口：外沿 = 带心 + 窗口，内沿 = 带心 − 窗口。
      // bandBox 是这一圈的盒子直径，bandWidth 是描边宽度，两者相减正好落回内沿。
      bandBox: 2 * Math.round(100 + 100 * scaleWin),
      bandWidth: Math.round(100 + 100 * scaleWin) - Math.round(100 - 100 * scaleWin),
      tone: 'idle',
      caption: s.tracks.length > 1 ? (h === 0 ? '左' : '右') : '',
      total: t.notes.length,
      index: 0,
      beat: 1,
    });
  }
  vm.rings = rings;
  // 兼容：单手段的旧渲染路径与说明页仍读 vm.ring。
  vm.ring = rings[0];

  // 提示轨：一小节的格位。四档提示是同一件事逐层往少走，不是四个不同控件。
  function cueCells(level) {
    const rows = [];
    for (let h = 0; h < s.tracks.length; h += 1) {
      const t = s.tracks[h];
      const cells = [];
      for (let i = 0; i < s.bar; i += 1) {
        const isOnset = t.onsets.indexOf(i) >= 0;
        const first = t.onsets[0] === i;
        let on = false;
        if (level === 'all') on = isOnset;
        else if (level === 'bar') on = first;
        cells.push({ i: i, on: on });
      }
      rows.push({ h: h, cells: cells });
    }
    return rows;
  }
  vm.cue = {
    show: s.cue !== 'none',
    level: s.cue,
    bar: s.bar,
    cursor: 0,
    hands: cueCells(s.cue),
  };
  vm.extras.showCue = s.cue !== 'none';
  vm.ringTip = s.tracks.length > 1
    ? '左右各点各的 · 光环落进朱带时点击'
    : '点按盘面 · 光环落进朱带时点击';

  function barNoAt(ms) {
    return Math.max(1, Math.min(s.bars, Math.ceil(Math.max(1, ms) / s.barMs)));
  }

  // 拍速写在时间行里：这一局多快是玩家唯一能提前知道的变量，
  // 不写出来就只能靠耳朵猜——而音效可以关，字关不掉。
  // 一拍 = 一格 = unitMs；这里用秒，不用 BPM（没人拿节拍器对表）。
  const beatSec = Math.round(s.unitMs / 10) / 100;
  const speedText = ' · 一拍 ' + beatSec + ' 秒';
  vm.speedText = speedText;
  vm.timeText = '第 1 / ' + s.bars + ' 小节' + speedText;
  vm.scoreText = '计 0 分';
  vm.goal = C.goalFor('C', band.sMin, '分');
  vm.hint = vm.costText;

  const bag = C.TimerBag();
  let tick = 0;                 // 从开局起的 40ms 计数
  let perfect = 0;
  let good = 0;
  let miss = 0;
  let combo = 0;
  let longest = 0;
  let done = false;
  let started = false;
  // 每一手自己的音符指针：走到第几个、这个判过没有。
  const ptr = [];
  for (let h = 0; h < s.tracks.length; h += 1) ptr.push({ k: 0, answered: false });

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
    return '圆满 ' + perfect + ' 音 · 合拍 ' + good + ' 音 · 空拍 ' + miss
      + ' 音 · 计 ' + fmt(points()) + ' 分 · 最长连拍 ' + longest;
  }

  // 这一手里的「当前音符」：第一个还没被判掉的。
  function noteOf(h) {
    return s.tracks[h].notes[ptr[h].k] || null;
  }

  function syncHud() {
    const ms = tick * TICK_MS;
    vm.timeText = '第 ' + barNoAt(ms) + ' / ' + s.bars + ' 小节' + speedText;
    vm.scoreText = '计 ' + fmt(points()) + ' 分';
    // 第几拍：页面拿它跟上一帧比，变了就播一声——节律这一门没有声音等于让人空手数拍。
    vm.beatKey = Math.floor(ms / s.unitMs);
    vm.progress = C.pct(Math.min(ms, s.endMs), s.endMs);
    vm.progressText = Math.round(Math.min(ms, s.endMs) / 1000) + ' / ' + Math.round(s.endMs / 1000) + ' 秒';
    vm.combo = combo;
    vm.comboText = combo >= 2 ? '连拍 ×' + combo : '';
    vm.gradeNow = gradeNow();
    vm.goal = C.goalFor(vm.gradeNow, Math.max(0, Math.round((band.sMin - points()) * 10) / 10), '分');
    vm.cue.cursor = Math.floor(ms / s.unitMs) % s.bar;
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

  // 环当前该在哪：周期是这个音符自己的间隔，所以长短拍的快慢一眼看得出来。
  // 起手从「判定点往回推 JUDGE_FRAC 个间隔」算，所以判定的那一瞬就是环压到朱带中心。
  function scaleOf(h, ms) {
    const nt = noteOf(h);
    if (!nt) return FLOOR_SCALE;
    const x = (ms - (nt.at - nt.gap * JUDGE_FRAC)) / Math.max(1, nt.gap);
    const v = START_SCALE - (START_SCALE - FLOOR_SCALE) * x;
    return Math.max(FLOOR_SCALE, Math.min(START_SCALE, v));
  }

  // 环收到最底就算这个音符过去了（点没点都算）：拍点仍落在网格上，下一拍照常起。
  // 判晚了还有一截宽容，但不能超过环收到底的时间，否则「太晚」会落到下一个音符上。
  function advanceAt(h, ms) {
    for (;;) {
      const nt = noteOf(h);
      if (!nt) return;
      const tail = nt.gap * (1 - JUDGE_FRAC);
      if (ms <= nt.at + tail) return;
      if (!ptr[h].answered) {
        miss += 1;
        combo = 0;
        rings[h].tone = 'miss';
        C.flash(vm, s.tracks.length > 1
          ? (h === 0 ? '左 · 空拍' : '右 · 空拍')
          : '缩过头 · 空拍', 'bad');
      }
      ptr[h].k += 1;
      ptr[h].answered = false;
    }
  }

  function allDone() {
    for (let h = 0; h < s.tracks.length; h += 1) {
      if (ptr[h].k < s.tracks[h].notes.length) return false;
    }
    return true;
  }

  function restNotes() {
    let rest = 0;
    for (let h = 0; h < s.tracks.length; h += 1) rest += s.tracks[h].notes.length - ptr[h].k;
    return rest;
  }

  function refreshRings(ms) {
    for (let h = 0; h < s.tracks.length; h += 1) {
      rings[h].scale = scaleOf(h, ms);
      rings[h].index = Math.min(ptr[h].k, s.tracks[h].notes.length - 1);
      rings[h].beat = rings[h].index + 1;
    }
  }

  function onTick() {
    if (done || vm.phase !== 'playing') return;
    tick += 1;
    const ms = tick * TICK_MS;
    for (let h = 0; h < s.tracks.length; h += 1) advanceAt(h, ms);
    if (allDone()) { finishOnce(gradeNow(), summary()); return; }
    // 剩下的音符全打满也够不到 B：结果已经是 C，不再让玩家把剩下几小节走完。
    if (points() + restNotes() < band.bMin) {
      finishOnce('C', summary() + ' · 后程已无从追回');
      return;
    }
    refreshRings(ms);
    syncHud();
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = s.tracks.length > 1 ? '两手各守一条节拍' : '随气机收放，一拍一拍来';
    vm.banner = theme.banner || '凝神';
    syncHud();
    render();
    bag.every(onTick, TICK_MS);
  }

  function tap(hand) {
    if (done || vm.phase !== 'playing') return;
    const h = Math.min(s.tracks.length - 1, Math.max(0, Math.round(Number(hand) || 0)));
    const t = s.tracks[h];
    const nt = noteOf(h);
    if (!nt || ptr[h].answered) return;
    ptr[h].answered = true;
    const ms = tick * TICK_MS;
    // 正数是早了、负数是晚了：盘面上就是环在带外还是在带里。
    const diff = nt.at - ms;
    const dist = Math.abs(diff);
    const early = Math.min(t.winMs * GOOD_EARLY, nt.gap * GOOD_CAP_FRAC);
    const late = Math.min(t.winMs * GOOD_LATE, nt.gap * (1 - JUDGE_FRAC));
    let tone;
    if (dist <= t.winMs) {
      perfect += 1;
      combo += 1;
      if (combo > longest) longest = combo;
      tone = 'perfect';
      C.flash(vm, combo >= 3 ? '圆满 · 连拍 ×' + combo : (theme.hit || '圆满'), 'gold');
    } else if ((diff > 0 && diff <= early) || (diff <= 0 && -diff <= late)) {
      good += 1;
      combo = 0;
      tone = 'good';
      C.flash(vm, diff > 0 ? '早半拍' : '晚半拍', 'good');
    } else {
      miss += 1;
      combo = 0;
      tone = 'miss';
      C.flash(vm, diff > 0 ? '太早 · 空拍' : '太晚 · 空拍', 'bad');
    }
    rings[h].tone = tone;
    if (combo >= 4) vm.banner = theme.banner || '气机连绵';
    // 判过之后**不立刻前进**：环继续按自己的周期往底收，收到底才换下一个音符。
    // 点一下就复位的做法等于每拍都是新反应题，这门叫节律，练的不该是反应。
    if (allDone()) { finishOnce(gradeNow(), summary()); return; }
    refreshRings(ms);
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
  const s = score(p);
  const b = bands(s.total);
  return {
    rule: '按圆满当量（圆满 1 分、合拍半分、空拍 0 分）',
    items: [
      '本门谱：' + s.hands + ' 手 · 每小节 ' + s.bar + ' 格 · 共 ' + s.bars + ' 小节 · ' + s.total + ' 音',
      'S：得 ' + b.sMin + ' 分以上（即最多漏 1 分）',
      'A：得 ' + b.aMin + ' 分以上',
      'B：得 ' + b.bMin + ' 分以上',
      '其余为 C',
    ],
  };
}

module.exports = {
  id: 'tempo', name: '节律判定', create: create, lines: lines,
  score: score, bands: bands, metrics: metrics,
  MIN_WIN_MS: MIN_WIN_MS, MAX_WIN_FRAC: MAX_WIN_FRAC,
  TWIST_WIN: TWIST_WIN, GOOD_EARLY: GOOD_EARLY, GOOD_LATE: GOOD_LATE,
};
