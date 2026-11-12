'use strict';

// 划刀输入：把手指坐标还原成「走过哪些桩」。
//
// 斜向相邻的两格只共一个顶点（A=(r,c) 与 B=(r+1,c+1)）。从 A 中心直划到 B 中心，
// 线段必然擦过另外两格（(r,c+1) 或 (r+1,c)）的角；手指稍偏，10px 插值就会把那个
// 「擦角格」当成又走了一桩，斜斩于是常被判成劈空 / 触禁桩 / 斩了虚影。
//
// 所以插值补格只用「中心内圈」命中：擦角时采样点离邻格中心至少半个格宽 + 半个格高，
// 进不了内圈；只有真把手指划到某桩中心区才算走过那一桩。
// 起手与抬手是静止点，不存在擦角，仍用整格命中，免得按在桩边上就丢了起手或收势。

// 内圈半宽 / 半高占格宽 / 格高的比例。0.42 覆盖中间 84%，
// 而斜线擦角时离邻格中心最近也是 0.5 / 0.5，留出余量；手划得略偏也不会误采。
const CORE_RATIO = 0.42;

function boxIndexOf(rects, x, y) {
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
  }
  return -1;
}

function coreIndexOf(rects, x, y) {
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    const cx = r.left + w / 2;
    const cy = r.top + h / 2;
    if (Math.abs(x - cx) <= w * CORE_RATIO && Math.abs(y - cy) <= h * CORE_RATIO) return i;
  }
  return -1;
}

// 相邻两次 touchmove 之间的线段插值：-1 表示这一点落在格间空隙，页面会忽略。
// 划得快也不会漏桩；命中一律走内圈，斜着划不会把擦角格补进轨迹。
function sampleLine(rects, from, to, step) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / (step || 10)));
  const out = [];
  for (let k = 1; k <= n; k += 1) {
    out.push(coreIndexOf(rects, from.x + dx * k / n, from.y + dy * k / n));
  }
  return out;
}

module.exports = {
  CORE_RATIO: CORE_RATIO,
  boxIndexOf: boxIndexOf,
  coreIndexOf: coreIndexOf,
  sampleLine: sampleLine,
};
