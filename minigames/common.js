'use strict';

// 小游戏公共工具。统一接口：create(ctx) -> controller
// ctx = { params, difficulty, perks, tip, render(vm), finish(result) }
// result = { grade: 'S'|'A'|'B'|'C'|'F', score, summary }
// controller = { start, tap, longpress, undo, hint, press, release, abandon, destroy }
// vm = { cols, cells, phase, status, hint, timeText, scoreText, charge, extras }

function randInt(n) { return Math.floor(Math.random() * n); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function makeCells(n) {
  const a = [];
  for (let i = 0; i < n; i += 1) a.push({ key: i, label: '', cls: 'cell' });
  return a;
}

function clearCells(cells) {
  for (let i = 0; i < cells.length; i += 1) {
    cells[i].label = '';
    cells[i].cls = 'cell';
  }
}

function gradeBy(score, s, a, b) {
  if (score >= s) return 'S';
  if (score >= a) return 'A';
  if (score >= b) return 'B';
  return 'C';
}

function mmss(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function TimerBag() {
  const intervals = [];
  const timeouts = [];
  return {
    every: function (fn, ms) {
      const id = setInterval(fn, ms);
      intervals.push(id);
      return id;
    },
    after: function (fn, ms) {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    },
    clear: function () {
      for (let i = 0; i < intervals.length; i += 1) clearInterval(intervals[i]);
      for (let i = 0; i < timeouts.length; i += 1) clearTimeout(timeouts[i]);
      intervals.length = 0;
      timeouts.length = 0;
    },
  };
}

function makeVm(cols, cellCount, status, hint) {
  return {
    cols: cols,
    cells: makeCells(cellCount),
    phase: 'ready',
    status: status,
    hint: hint,
    timeText: '',
    scoreText: '',
    charge: null,
    extras: { showUndo: false, showHint: false, showCharge: false, showGrid: cellCount > 0 },
  };
}

function noop() {}

function fillController(obj) {
  const base = {
    tap: noop,
    longpress: noop,
    undo: noop,
    hint: noop,
    press: noop,
    release: noop,
    abandon: noop,
    destroy: noop,
  };
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) base[keys[i]] = obj[keys[i]];
  return base;
}

module.exports = {
  randInt: randInt,
  shuffle: shuffle,
  makeCells: makeCells,
  clearCells: clearCells,
  gradeBy: gradeBy,
  mmss: mmss,
  TimerBag: TimerBag,
  makeVm: makeVm,
  fillController: fillController,
};
