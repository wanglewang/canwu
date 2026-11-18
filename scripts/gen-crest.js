'use strict';

// 生成灵纹牌图（assets/crest.png）与它的样式（styles/crest.wxss）。
//
// 图是 26 格横排：1–8 是原来那套果器（从既有 PNG 里读回来做升采样，不重画），
// 9–26 是三套主题各六格 —— 甜点 / 海洋 / 灵兽。
//
// 三套主题按同一套「轮廓族骨架」画，族序固定：
//   0 圆润  1 方框  2 伞锥  3 竖长  4 成簇  5 带尖
// 换皮不换骨架：玩家学的是「第几族长什么样」，不是「这一格画的是什么东西」。
// 所以四套之间可以互换，识别成本只付一次。
//
// 硬约束两条，都要能逐格核算，所以用脚本画而不是找图：
//   ① 剪影可分 —— 去掉颜色、眯眼，一局之内的六格互不重叠（低视力 / 色觉缺陷也能玩）；
//   ② 明度够 —— 每格主色在暖白牌 #fbf3dd 上要跳出来。灰褐毛色、金属灰一律不上：
//      那不是「不好看」，是读不出。
//
// 精细度来自四件事，缺一件就会退回「几个圆叠平涂」：
//   ① 每块形体给渐变（radial 球感 / linear 柱感），光从左上来；
//   ② 每块形体给一条窄而柔的高光，而不是一层更亮的主色；
//   ③ 结构线（纹理、分层、羽枝、甲片）叠在形体之上，颜色取主色压暗 20–30%；
//   ④ 边缘有细描边（统一 1.7 单位），凹形也照样均匀。
//
// 旧版本有一处静默失效：细节层写 fill(..., 1) 想跳过描边，但那个参数是「缩放倍数」，
// 于是所有细节被画到超采样画布左上角 64×64 的角落里，downsample 之后一格都没留下。
// 这就是「脚本里写了褶皱 / 糖珠 / 格纹，盘面上却只有两个椭圆」的原因。
// 现在「跳过描边」走 opts.noEdge，坐标空间恒为 CELL。
//
// 用法：node scripts/gen-crest.js
// 产物：assets/crest.png（2496×96，26 格）、styles/crest.wxss（内联 + 26 个类）
//       .workbuddy/tmp/ 下两张验收图（剪影 / 摆上牌面），不入库

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const CELL = 96;           // 每格边长。72rpx 在 3x 屏上约 108 物理像素，96 已接近 1:1，不再发虚
const SS = 4;              // 超采样倍数
const EDGE = 1.85;         // 描边粗细（CELL 空间）
const BASE_CELLS = 8;      // 前八格是既有果器图
const THEMES = ['sweet', 'sea', 'beast'];

// ---------- PNG 编码 ----------

const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// 逐行自适应选 filter（0–4 里挑绝对值和最小的那个）。
// 这张图从平涂换成渐变之后，行内像素差变小、跨行差变大，只用 filter 0 时
// deflate 基本压不动：140KB 里有一半是这么白扔的。走 Sub/Paeth 之后回到 90KB 量级。
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < h; y += 1) {
    const cur = y * stride;
    const prev = (y - 1) * stride;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f += 1) {
      const out = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i += 1) {
        const x = rgba[cur + i];
        const a = i >= 4 ? rgba[cur + i - 4] : 0;
        const b = y > 0 ? rgba[prev + i] : 0;
        const c = (i >= 4 && y > 0) ? rgba[prev + i - 4] : 0;
        let v = x;
        if (f === 1) v = x - a;
        else if (f === 2) v = x - b;
        else if (f === 3) v = x - ((a + b) >> 1);
        else if (f === 4) {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        v &= 255;
        out[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    const base = y * (stride + 1);
    raw[base] = best;
    cand[best].copy(raw, base + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 画布 ----------

function makeCanvas(w, h) {
  return { w: w, h: h, data: Buffer.alloc(w * h * 4) };
}

// ---------- 颜色 ----------
// 一律 [r, g, b, a]，a 为 0–255。混色全程浮点，落盘时才取整。

function rgb(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
}

function mix(a, b, t) {
  const u = 1 - t;
  return [a[0] * u + b[0] * t, a[1] * u + b[1] * t, a[2] * u + b[2] * t, a[3] * u + b[3] * t];
}

// 亮 / 暗都尽量留在自己的色相上：往纯白混会褪成灰粉，往纯黑混会发脏，
// 这两条是「一眼廉价」的常见来源。
function lighter(c, t) {
  return [c[0] + (255 - c[0]) * t * 0.92, c[1] + (255 - c[1]) * t * 0.9, c[2] + (255 - c[2]) * t * 0.8, c[3]];
}

function darker(c, t) {
  const k = 1 - 0.72 * t;
  return [c[0] * k + 22 * t, c[1] * k + 12 * t, c[2] * k + 4 * t, c[3]];
}

function fade(c, a) {
  return [c[0], c[1], c[2], Math.round(a * 255)];
}

// ---------- 填充色：纯色 / 线性渐变 / 径向渐变 ----------

function lin(x0, y0, x1, y1, stops) {
  return { linear: true, x0: x0, y0: y0, x1: x1, y1: y1, stops: stops };
}

function rad(cx, cy, rx, ry, stops) {
  return { linear: false, cx: cx, cy: cy, rx: rx, ry: ry, stops: stops };
}

function at(spec, x, y) {
  if (Array.isArray(spec)) return spec;
  let t;
  if (spec.linear) {
    const dx = spec.x1 - spec.x0;
    const dy = spec.y1 - spec.y0;
    t = ((x - spec.x0) * dx + (y - spec.y0) * dy) / (dx * dx + dy * dy || 1);
  } else {
    const dx = (x - spec.cx) / (spec.rx || 1);
    const dy = (y - spec.cy) / (spec.ry || 1);
    t = Math.sqrt(dx * dx + dy * dy);
  }
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = spec.stops;
  let i = 0;
  while (i + 1 < s.length && s[i + 1][0] < t) i += 1;
  if (i + 1 >= s.length) return s[s.length - 1][1];
  const t0 = s[i][0];
  const t1 = s[i + 1][0];
  return mix(s[i][1], s[i + 1][1], t1 === t0 ? 0 : (t - t0) / (t1 - t0));
}

// ---------- 光栅化 ----------

// 扫描线与多边形求交，返回排好序的 x 交点。
function spans(p, sy, out) {
  out.length = 0;
  const n = p.length;
  for (let i = 0; i < n; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % n];
    if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
      out.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
  }
  out.sort(function (u, v) { return u - v; });
  return out;
}

function blend(cv, x, y, c) {
  const i = (y * cv.w + x) * 4;
  const a = c[3] / 255;
  if (a <= 0) return;
  if (a >= 0.999) {
    cv.data[i] = c[0];
    cv.data[i + 1] = c[1];
    cv.data[i + 2] = c[2];
    cv.data[i + 3] = 255;
    return;
  }
  const da = cv.data[i + 3] / 255;
  const A = a + da * (1 - a);
  const u = da * (1 - a) / A;
  const v = a / A;
  cv.data[i] = c[0] * v + cv.data[i] * u;
  cv.data[i + 1] = c[1] * v + cv.data[i + 1] * u;
  cv.data[i + 2] = c[2] * v + cv.data[i + 2] * u;
  cv.data[i + 3] = Math.round(A * 255);
}

const XS = [];
const XC = [];

// k 是「画布像素 : 造型坐标」的倍率（= 超采样倍数）。几何被 fill 放大到画布上，
// 但渐变控制点是按 CELL 空间的 0–96 写的 —— 采样时必须把像素坐标除回去。
// 漏了这一步的后果不是「渐变弱一点」：径向距离全被顶到 ≥1，整块形体只剩最暗那一档，
// 于是每个图案都是「平涂 + 压暗」，这正是那版看着灰扑扑、暗沉沉的原因。
function paint(cv, pts, spec, clip, zoom) {
  const inv = 1 / (zoom || 1);
  const p = pts;
  const n = p.length;
  if (n < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const q of p) {
    if (q[1] < minY) minY = q[1];
    if (q[1] > maxY) maxY = q[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(cv.h - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y += 1) {
    const sy = y + 0.5;
    const xs = spans(p, sy, XS);
    if (xs.length < 2) continue;
    let cx = null;
    if (clip) {
      cx = spans(clip, sy, XC);
      if (cx.length < 2) continue;
    }
    for (let s = 0; s + 1 < xs.length; s += 2) {
      let xa = xs[s];
      let xb = xs[s + 1];
      if (cx) {
        let lo = -Infinity;
        let hi = Infinity;
        for (let k = 0; k + 1 < cx.length; k += 2) {
          const a = Math.max(xa, cx[k]);
          const b = Math.min(xb, cx[k + 1]);
          if (a < b) {
            lo = Math.max(lo, a);
            hi = Math.min(hi, b);
          }
        }
        // 可能有多个区间，这里取最近的一处即可（clip 与形状都只用到单区间的情况）
        if (lo === -Infinity || lo >= hi) continue;
        xa = lo;
        xb = hi;
      }
      const ia = Math.max(0, Math.ceil(xa - 0.5));
      const ib = Math.min(cv.w - 1, Math.floor(xb - 0.5));
      for (let x = ia; x <= ib; x += 1) {
        blend(cv, x, y, Array.isArray(spec) ? spec : at(spec, (x + 0.5) * inv, sy * inv));
      }
    }
  }
}

// 沿顶点把多边形往外推 d：逐顶点求两条边的外法线角平分线。
// 旧版用「沿质心方向外推」，凹形（海星、珊瑚、孔雀尾）会明显变形；这里按边法线走。
function offsetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = area > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    let e1x = p1[0] - p0[0];
    let e1y = p1[1] - p0[1];
    let e2x = p2[0] - p1[0];
    let e2y = p2[1] - p1[1];
    const l1 = Math.sqrt(e1x * e1x + e1y * e1y) || 1;
    const l2 = Math.sqrt(e2x * e2x + e2y * e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const n1x = e1y * sgn;
    const n1y = -e1x * sgn;
    const n2x = e2y * sgn;
    const n2y = -e2x * sgn;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.sqrt(mx * mx + my * my);
    if (ml < 1e-6) {
      out.push([p1[0] + n1x * d, p1[1] + n1y * d]);
      continue;
    }
    mx /= ml; my /= ml;
    const cosHalf = mx * n1x + my * n1y;
    let len = d / Math.max(0.35, cosHalf);
    if (len > d * 3) len = d * 3;
    out.push([p1[0] + mx * len, p1[1] + my * len]);
  }
  return out;
}

// 描边色：暖褐黑。纯黑会把整盘压死，原图那套果器用的也是这种低饱和深色。
const OUTLINE = rgb('#4a382c');

// opts: { noEdge, edge, clip }；坐标空间恒为 CELL，内部乘 SS。
function fill(cv, pts, spec, opts) {
  const o = opts || {};
  if (!o.noEdge) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const q of pts) {
      if (q[0] < minX) minX = q[0];
      if (q[0] > maxX) maxX = q[0];
      if (q[1] < minY) minY = q[1];
      if (q[1] > maxY) maxY = q[1];
    }
    // 太小的细节（眼睛、糖粒）描一圈会糊成一团，直接不描。
    if (maxX - minX >= 8 && maxY - minY >= 8) {
      paint(cv, scale(offsetPoly(pts, o.edge === undefined ? EDGE : o.edge), SS), o.edgeColor || OUTLINE,
        o.clip ? scale(o.clip, SS) : null, SS);
    }
  }
  paint(cv, scale(pts, SS), spec, o.clip ? scale(o.clip, SS) : null, SS);
}

function scale(pts, k) {
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 1) out[i] = [pts[i][0] * k, pts[i][1] * k];
  return out;
}

// ---------- 几何 ----------

function ell(cx, cy, rx, ry, n) {
  const out = [];
  const m = n || 64;
  for (let i = 0; i < m; i += 1) {
    const a = i / m * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

function circ(cx, cy, r, n) {
  return ell(cx, cy, r, r, n);
}

// 半椭圆弧：a0 → a1（弧度）。用来画伞盖、扇形、肚皮。
function arc(cx, cy, rx, ry, a0, a1, n) {
  const out = [];
  const m = n || 32;
  for (let i = 0; i <= m; i += 1) {
    const a = a0 + (a1 - a0) * i / m;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

function rrect(x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  const out = [];
  const corner = function (cx, cy, from) {
    for (let i = 0; i <= 8; i += 1) {
      const a = from + i / 8 * (Math.PI / 2);
      out.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]);
    }
  };
  corner(x + w - q, y + q, -Math.PI / 2);
  corner(x + w - q, y + h - q, 0);
  corner(x + q, y + h - q, Math.PI / 2);
  corner(x + q, y + q, Math.PI);
  return out;
}

function tri(ax, ay, bx, by, cx, cy) {
  return [[ax, ay], [bx, by], [cx, cy]];
}

// 二次贝塞尔采样成折线。
function quad(a, c, b, n) {
  const out = [];
  const m = n || 16;
  for (let i = 0; i <= m; i += 1) {
    const t = i / m;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
  return out;
}

// 极坐标上的一条带（螺旋臂、触手、孔雀羽）。返回闭合多边形。
// r0→r1 向外走，a0 起始角，twist 每单位半径转多少弧度，w0→w1 半宽。
function ribbon(cx, cy, r0, r1, a0, twist, w0, w1, n) {
  const m = n || 18;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= m; i += 1) {
    const t = i / m;
    const r = r0 + (r1 - r0) * t;
    const a = a0 + twist * (r - r0);
    const w = w0 + (w1 - w0) * t;
    outer.push([cx + Math.cos(a) * (r + w), cy + Math.sin(a) * (r + w)]);
    inner.push([cx + Math.cos(a) * (r - w), cy + Math.sin(a) * (r - w)]);
  }
  inner.reverse();
  return outer.concat(inner);
}

// 折线加粗成闭合多边形（触手、藤枝）。
function stroke(pts, w0, w1) {
  const left = [];
  const right = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const L = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= L; dy /= L;
    const w = w0 + (w1 - w0) * (i / (n - 1));
    left.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    right.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  right.reverse();
  return left.concat(right);
}

// 顶点圆滑：每个角用二次贝塞尔抹圆。星形、花瓣这类形状用它，
// 直接用折线会读成「几何图」，抹过之后才有肉感。
function smoothPoly(pts, t) {
  const n = pts.length;
  const k = t || 0.3;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const a = [p1[0] + (p0[0] - p1[0]) * k, p1[1] + (p0[1] - p1[1]) * k];
    const b = [p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k];
    const seg = quad(a, p1, b, 6);
    for (let j = 0; j < seg.length - 1; j += 1) out.push(seg[j]);
  }
  return out;
}

// 统一的眼睛画法：眼白（带一点下缘灰）+ 瞳 + 高光。
// 所有动物共用一套 —— 眼睛是「有没有画完」最直接的信号，各画各的会立刻显得潦草。
function eye(cv, cx, cy, r, dark, opts) {
  const d = dark || darker(C.ink, 0.14);
  fill(cv, circ(cx, cy, r), rad(cx - r * 0.28, cy - r * 0.3, r * 1.5, r * 1.5, [
    [0, [255, 255, 255, 255]], [0.62, [250, 248, 246, 255]], [1, [206, 202, 202, 255]],
  ]), Object.assign({ edge: 1.5 }, opts || {}));
  fill(cv, circ(cx + r * 0.1, cy + r * 0.12, r * 0.54), d, { noEdge: true });
  fill(cv, circ(cx - r * 0.18, cy - r * 0.22, r * 0.22), fade([255, 255, 255, 255], 0.92), { noEdge: true });
}

// 过点的平滑闭合曲线（Catmull-Rom）。果器这类「圆润得看不出折角」的形体用它：
// 折线 + 顶点抹圆在多边形点数少的时候仍会留下棱，摆上牌面就是「多边形苹果」。
function curve(pts) {
  const n = pts.length;
  const out = [];
  const g = function (i) { return pts[(i + n) % n]; };
  for (let i = 0; i < n; i += 1) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    for (let j = 0; j < 8; j += 1) {
      const t = j / 8;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

// 柔光斑：radial 渐变从实到透明，只 add 不描边。
function glow(cv, cx, cy, rx, ry, color, a, opts) {
  fill(cv, ell(cx, cy, rx, ry), rad(cx, cy, rx, ry, [[0, fade(color, a)], [0.55, fade(color, a * 0.55)], [1, fade(color, 0)]]),
    Object.assign({ noEdge: true }, opts || {}));
}

// 球感主形体：左上受光、右下压暗，并叠一枚偏心高光。
// 高光要小、要淡：一大片纯白会把球面压平成「贴纸」，这正是上一版看着廉价的原因。
function orb(cv, cx, cy, rx, ry, base, opts) {
  const o = opts || {};
  fill(cv, ell(cx, cy, rx, ry), rad(cx - rx * 0.4, cy - ry * 0.44, rx * 1.5, ry * 1.5, [
    [0, lighter(base, 0.22)], [0.42, base], [1, darker(base, 0.16)],
  ]), o);
  glow(cv, cx - rx * 0.38, cy - ry * 0.44, rx * 0.34, ry * 0.24, [255, 255, 255, 255],
    o.hi === undefined ? 0.42 : o.hi, o.clip ? { clip: o.clip } : {});
}

// ---------- 色板 ----------
// 明度下限是硬约束：主色要能在 #fbf3dd 上跳出来。

const C = {
  cream: rgb('#fdf1d8'),
  cream2: rgb('#f4dfb8'),
  pink: rgb('#f2a3bd'),
  pink2: rgb('#dd7f9f'),
  cherry: rgb('#dc4f52'),
  cocoa: rgb('#b06a45'),
  cocoa2: rgb('#8e5335'),
  mint: rgb('#86d2ac'),
  lemon: rgb('#f6cf5c'),
  orange: rgb('#f5a05a'),
  grape: rgb('#b39ddb'),
  cone: rgb('#dfa466'),
  cone2: rgb('#bf8244'),
  sky: rgb('#8fc9e0'),
  sky2: rgb('#5ba3c6'),
  foam: rgb('#e9f7fc'),
  coral: rgb('#f08a7a'),
  coral2: rgb('#d4665a'),
  kelp: rgb('#7ac09a'),
  kelp2: rgb('#5aa17c'),
  deep: rgb('#3f7d99'),
  white: rgb('#e8eff4'),
  grey: rgb('#cdd3da'),
  fawn: rgb('#e8c08a'),
  fawn2: rgb('#d1a069'),
  rust: rgb('#e08a4a'),
  ink: rgb('#5a6472'),
  tofu: rgb('#fff6e6'),
};

// ---------- 前八格：灵果 / 灵梨 / 灵珠 / 灵桃 / 灵橘 / 茶盏 / 灵葫 / 灵芝 ----------
// 这八格是「三秀撷英诀」（消消乐）的全部图案 —— 它按序号取前 N 张，
// 所以只改后三套主题，那门功法上是看不到任何变化的。旧版是外部插画稿，
// 升采样到本尺寸会发虚，这里按同一套画法重画，风格与后十八格对齐。

function baseApple(cv) {
  const red = rgb('#d8453c');
  const body = curve([
    [48, 32], [42, 27], [33, 27], [24, 34],
    [17, 44], [14, 56], [16, 70],
    [22, 82], [34, 89], [48, 90],
    [62, 89], [74, 82], [80, 70],
    [82, 56], [79, 44], [72, 34],
    [63, 27], [54, 27],
  ]);
  fill(cv, body, rad(36, 44, 40, 40, [[0, lighter(red, 0.34)], [0.38, red], [1, darker(red, 0.38)]]));
  glow(cv, 32, 50, 9, 17, [255, 255, 255, 255], 0.55);
  glow(cv, 66, 74, 8, 10, [255, 255, 255, 255], 0.1);
  fill(cv, stroke([[48, 33], [49, 23], [53, 16]], 2.3, 1.6), rgb('#6b4a2f'), { edge: 1.2 });
  const leaf = smoothPoly([[52, 20], [63, 12], [76, 17], [64, 27]], 0.24);
  fill(cv, leaf, lin(52, 12, 76, 27, [[0, rgb('#86bd52')], [0.55, rgb('#68a13c')], [1, rgb('#4b7f2c')]]));
  fill(cv, stroke([[55, 20], [74, 17]], 0.8, 0.6), fade(rgb('#3d6b22'), 0.45), { noEdge: true });
}

function basePear(cv) {
  const yg = rgb('#bccf5e');
  const body = curve([
    [48, 14], [43, 18], [38, 27], [35, 38],
    [32, 48], [26, 57], [22, 68],
    [22, 78], [30, 86], [40, 89],
    [48, 90], [56, 89], [66, 86],
    [74, 78], [74, 68], [70, 57],
    [64, 48], [61, 38], [58, 27],
    [53, 18],
  ]);
  fill(cv, body, rad(38, 56, 36, 40, [[0, lighter(yg, 0.26)], [0.42, yg], [1, darker(rgb('#8fae3f'), 0.24)]]));
  glow(cv, 36, 60, 8, 15, [255, 255, 255, 255], 0.34);
  glow(cv, 64, 76, 7, 8, [255, 255, 255, 255], 0.12);
  // 梨皮的细点
  for (let i = 0; i < 9; i += 1) {
    const x = 30 + (i * 37) % 40;
    const y = 46 + (i * 23) % 34;
    fill(cv, circ(x, y, 0.9), fade(darker(yg, 0.3), 0.35), { noEdge: true });
  }
  fill(cv, stroke([[48, 17], [48, 8]], 2.4, 1.7), rgb('#6b4a2f'), { edge: 1.2 });
}

function baseGrape(cv) {
  const gp = rgb('#8e6bb5');
  fill(cv, stroke([[48, 8], [48, 26], [45, 31]], 2.4, 1.6), rgb('#6f4c33'), { edge: 1.2 });
  const leaf = smoothPoly([[48, 20], [62, 12], [76, 18], [62, 27]], 0.24);
  fill(cv, leaf, lin(48, 12, 76, 27, [[0, rgb('#86bd52')], [1, rgb('#4f8c30')]]));
  const balls = [
    [37, 35, 8], [59, 35, 8],
    [30, 47, 8.6], [48, 46, 8.8], [66, 47, 8.6],
    [37, 59, 8.4], [59, 59, 8.4],
    [48, 70, 8], [40, 79, 6.6], [56, 79, 6.6],
  ];
  balls.forEach(function (b) {
    orb(cv, b[0], b[1], b[2], b[2], gp, { hi: 0.5 });
  });
  glow(cv, 34, 42, 10, 7, [255, 255, 255, 255], 0.18);
}

function basePeach(cv) {
  const pk = rgb('#f79cb0');
  const pk2 = rgb('#df6f8c');
  // 桃的剪影：**上宽下收 + 软尖底 + 双叶**。
  // 早先与苹果同是「圆身 + 右上单叶 + 短柄」，摆上牌只剩颜色差，眯眼就分不开；
  // 苹果改成「矮宽 + 顶凹深 + 单叶」，桃改成「高瘦 + 底收尖 + 双叶」，两格才算两族。
  const body = curve([
    [48, 27], [41, 21], [33, 24], [26, 33],
    [22, 45], [22, 58], [27, 70],
    [34, 80], [41, 87], [48, 92],
    [55, 87], [62, 80], [69, 70],
    [74, 58], [74, 45], [70, 33],
    [63, 24], [55, 21],
  ]);
  fill(cv, body, rad(39, 40, 36, 40, [[0, lighter(pk, 0.34)], [0.4, pk], [1, darker(pk2, 0.12)]]));
  // 阳面红晕：桃与苹果的另一处分界，光从左上，晕在右下
  fill(cv, ell(62, 70, 22, 24), rad(62, 70, 22, 24, [
    [0, fade(darker(pk2, 0.06), 0.55)], [0.6, fade(darker(pk2, 0.06), 0.3)], [1, fade(darker(pk2, 0.06), 0)],
  ]), { noEdge: true, clip: body });
  // 桃沟：从顶凹一直划到尖底，比一根直线更有肉
  fill(cv, stroke(quad([48, 31], [40, 58], [48, 89], 16), 1.5, 1),
    fade(darker(pk2, 0.34), 0.34), { noEdge: true });
  glow(cv, 33, 44, 9, 15, [255, 255, 255, 255], 0.5);
  // 双叶：一左一右，压住果顶的两个瓣
  const leafL = smoothPoly([[46, 23], [35, 14], [23, 17], [34, 26]], 0.26);
  const leafR = smoothPoly([[50, 22], [64, 10], [79, 12], [64, 24]], 0.26);
  fill(cv, leafL, lin(34, 12, 46, 25, [[0, rgb('#8cc456')], [1, rgb('#4f8c30')]]));
  fill(cv, leafR, lin(50, 12, 77, 25, [[0, rgb('#8cc456')], [1, rgb('#4f8c30')]]));
  fill(cv, stroke([[34, 18], [45, 23]], 0.8, 0.6), fade(rgb('#3d6b22'), 0.4), { noEdge: true });
  fill(cv, stroke([[62, 18], [50, 23]], 0.8, 0.6), fade(rgb('#3d6b22'), 0.4), { noEdge: true });
  // 短柄：只露一小截，长了会跟梨混
  fill(cv, stroke([[48, 24], [48, 17]], 2.2, 1.8), rgb('#6b4a2f'), { edge: 1.2 });
}

function baseOrange(cv) {
  const or = rgb('#f0993f');
  fill(cv, circ(48, 56, 28), rad(38, 44, 34, 34, [[0, lighter(or, 0.24)], [0.45, or], [1, darker(rgb('#d1712a'), 0.18)]]));
  // 橘瓣：八条从中心到边缘的浅线
  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2 + 0.2;
    fill(cv, stroke([[48, 56], [48 + Math.cos(a) * 25, 56 + Math.sin(a) * 25]], 0.9, 0.7),
      fade([255, 248, 226, 255], 0.55), { noEdge: true, clip: circ(48, 56, 27) });
  }
  fill(cv, circ(48, 56, 4.4), fade([255, 255, 255, 255], 0.55), { noEdge: true });
  // 皮孔
  for (let i = 0; i < 10; i += 1) {
    const a = i / 10 * Math.PI * 2 + 0.5;
    fill(cv, circ(48 + Math.cos(a) * 21, 56 + Math.sin(a) * 21, 1), fade(darker(or, 0.3), 0.3), { noEdge: true });
  }
  glow(cv, 36, 44, 10, 8, [255, 255, 255, 255], 0.35);
  const leaf = smoothPoly([[48, 28], [62, 18], [76, 22], [62, 32]], 0.24);
  fill(cv, leaf, lin(48, 18, 76, 32, [[0, rgb('#86bd52')], [1, rgb('#4f8c30')]]));
  fill(cv, stroke([[48, 30], [49, 24]], 2.2, 1.5), rgb('#6b4a2f'), { edge: 1.2 });
}

function baseCup(cv) {
  const ce = rgb('#8fc0c8');
  // 碟
  fill(cv, ell(48, 80, 27, 5.4), lin(0, 74, 0, 86, [[0, lighter(ce, 0.3)], [1, darker(ce, 0.24)]]));
  fill(cv, ell(48, 78.5, 20, 3.2), fade(lighter(ce, 0.4), 0.8), { noEdge: true });
  // 杯身
  const cup = smoothPoly([[29, 40], [67, 40], [62, 74], [34, 74]], 0.1);
  fill(cv, cup, lin(29, 0, 67, 0, [[0, lighter(ce, 0.32)], [0.45, ce], [1, darker(ce, 0.26)]]));
  // 杯口内壁
  fill(cv, ell(48, 40, 19, 5.6), lin(0, 34, 0, 46, [[0, lighter(ce, 0.1)], [1, darker(ce, 0.3)]]));
  fill(cv, ell(48, 40.4, 19, 5.4), fade(darker(ce, 0.34), 0.9), { noEdge: true });
  fill(cv, ell(48, 40.8, 15.4, 4), lin(0, 37, 0, 45, [[0, rgb('#9ecf9a')], [1, rgb('#6fae8e')]]), { noEdge: true });
  fill(cv, ell(43, 39, 6, 1.6), fade([255, 255, 255, 255], 0.5), { noEdge: true });
  // 杯壁竖纹与高光
  fill(cv, stroke([[36, 46], [39, 71]], 2.6, 2), fade([255, 255, 255, 255], 0.35), { noEdge: true });
  fill(cv, stroke([[59, 46], [57, 71]], 1.6, 1.2), fade(darker(ce, 0.3), 0.28), { noEdge: true });
  // 杯足
  fill(cv, ell(48, 74.5, 13, 3), lin(0, 71, 0, 78, [[0, ce], [1, darker(ce, 0.2)]]), { edge: 1.6 });
}

function baseGourd(cv) {
  const gd = rgb('#e0b263');
  const body = curve([
    [48, 12], [56, 17], [59, 26], [54, 36],
    [52, 40], [60, 45], [68, 54],
    [70, 66], [66, 78], [58, 84],
    [48, 87], [38, 84], [30, 78],
    [26, 66], [28, 54], [36, 45],
    [44, 40], [42, 36], [37, 26],
    [40, 17],
  ]);
  fill(cv, body, rad(37, 42, 40, 46, [[0, lighter(gd, 0.34)], [0.4, gd], [1, darker(rgb('#b98844'), 0.24)]]));
  // 腰
  fill(cv, stroke(quad([33, 41], [48, 47], [63, 41], 12), 1.4, 2.2), fade(darker(gd, 0.36), 0.5), { noEdge: true });
  glow(cv, 37, 28, 7, 9, [255, 255, 255, 255], 0.4);
  glow(cv, 37, 58, 9, 14, [255, 255, 255, 255], 0.35);
  fill(cv, stroke([[48, 15], [48, 6]], 2.2, 1.6), rgb('#6b4a2f'), { edge: 1.2 });
  const leaf = smoothPoly([[50, 12], [62, 6], [74, 11], [61, 18]], 0.24);
  fill(cv, leaf, lin(50, 6, 74, 18, [[0, rgb('#86bd52')], [1, rgb('#4f8c30')]]));
}

function baseLingzhi(cv) {
  const cap = arc(48, 46, 31, 24, Math.PI, Math.PI * 2, 40).concat([[79, 50], [17, 50]]);
  // 柄
  fill(cv, smoothPoly([[41, 46], [55, 46], [58, 78], [52, 86], [44, 86], [38, 78]], 0.16),
    lin(0, 46, 0, 86, [[0, rgb('#f3e2c2')], [1, rgb('#cfb287')]]));
  // 伞盖
  fill(cv, cap, rad(40, 24, 34, 30, [[0, rgb('#e0725a')], [0.45, rgb('#c9563f')], [1, rgb('#9c3f2d')]]));
  fill(cv, [[17, 46], [79, 46], [79, 50], [17, 50]], fade(rgb('#f6e6c8'), 0.85), { noEdge: true, clip: cap });
  // 斑点
  [[32, 34, 4.2], [51, 28, 3.6], [64, 38, 3], [44, 41, 2.6], [26, 42, 2.2]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], p[2]), fade(rgb('#fbeeda'), 0.85), { noEdge: true, clip: cap });
  });
  // 伞下菌褶
  for (let i = 0; i < 7; i += 1) {
    const x = 26 + i * 7.4;
    fill(cv, stroke([[x, 47], [x + 1.6, 51]], 1, 0.7), fade(rgb('#cfb287'), 0.6), { noEdge: true });
  }
  glow(cv, 34, 26, 12, 7, [255, 255, 255, 255], 0.3, { clip: cap });
}

const BASE8 = [baseApple, basePear, baseGrape, basePeach, baseOrange, baseCup, baseGourd, baseLingzhi];

// ---------- 三套主题，各六格（族序：圆 / 方 / 伞锥 / 竖长 / 簇 / 尖） ----------

// 甜点 · 0 圆润：马卡龙。上下两片圆壳（各是半个椭圆）+ 中间夹心 + 裙边褶皱。
// 两片都画整椭圆会读成汉堡：关键是壳朝外的那一面圆、朝夹心的那一面平。
function sweetMacaron(cv) {
  const pinL = lighter(C.pink, 0.18);
  const jam = darker(C.pink2, 0.26);
  // 夹心：一条**深色**窄带，比壳宽 2 各伸出一线。
  // 试过奶白夹心 —— 在 96px 上只剩两三像素，跟两片壳糊成一整块粉。
  fill(cv, rrect(18, 47.4, 60, 9.6, 3.8), lin(18, 0, 78, 0, [[0, lighter(jam, 0.16)], [0.45, jam], [1, darker(jam, 0.14)]]));
  fill(cv, [[26, 51], [70, 51], [70, 52.2], [26, 52.2]], fade([255, 255, 255, 255], 0.24), { noEdge: true });
  // 下壳
  fill(cv, arc(48, 57, 30, 15, 0, Math.PI, 34), rad(38, 62, 36, 26, [[0, pinL], [0.5, C.pink], [1, darker(C.pink2, 0.16)]]));
  // 下壳裙边：向上鼓进夹心，不描边 —— 每瓣都描一圈会变成一排虚线
  for (let i = 0; i < 11; i += 1) {
    const x = 22 + i * 5.2;
    fill(cv, ell(x, 57.4, 3, 2.6), lin(0, 54, 0, 60, [[0, lighter(C.pink, 0.12)], [1, darker(C.pink, 0.04)]]), { noEdge: true });
  }
  // 上壳
  fill(cv, arc(48, 48, 31, 16, Math.PI, Math.PI * 2, 34), rad(37, 42, 38, 28, [[0, lighter(C.pink, 0.3)], [0.44, C.pink], [1, darker(C.pink2, 0.08)]]));
  fill(cv, arc(48, 48, 30, 15, 0.1, Math.PI - 0.1, 22), lin(0, 41, 0, 48, [[0, fade(darker(C.pink2, 0.16), 0)], [1, fade(darker(C.pink2, 0.16), 0.5)]]), { noEdge: true });
  // 上壳裙边：向下鼓
  for (let i = 0; i < 11; i += 1) {
    const x = 22 + i * 5.2;
    fill(cv, ell(x, 48, 3, 2.4), lin(0, 45.6, 0, 50.4, [[0, lighter(C.pink, 0.2)], [1, C.pink]]), { noEdge: true });
  }
  glow(cv, 36, 39, 13, 5.2, [255, 255, 255, 255], 0.5);
  glow(cv, 62, 44, 6, 2.4, [255, 255, 255, 255], 0.18);
  // 糖粒
  [[30, 37, 1.3], [44, 34.6, 1.1], [56, 37, 1.3], [62, 41, 1]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], p[2]), fade([255, 255, 255, 255], 0.66), { noEdge: true });
  });
}

// 甜点 · 1 方框：方蛋糕。顶面透视 + 侧面分层 + 裱花 + 樱桃。
function sweetCake(cv) {
  const L = 20, R = 76, T = 42, B = 83;
  // 侧面：海绵 + 果酱 + 海绵。三条横带，缩到牌面也还读得出「切开的蛋糕」。
  fill(cv, [[L, T], [R, T], [R, B], [L, B]], lin(L, 0, R, 0, [
    [0, lighter(C.cream, 0.16)], [0.5, C.cream], [1, darker(C.cream2, 0.2)],
  ]));
  fill(cv, [[L, 60], [R, 60], [R, 67], [L, 67]], lin(0, 60, 0, 67, [[0, lighter(C.pink, 0.16)], [1, C.pink2]]), { noEdge: true });
  fill(cv, [[L, 61], [R, 61], [R, 62.2], [L, 62.2]], fade([255, 255, 255, 255], 0.3), { noEdge: true });
  fill(cv, [[L, 67], [R, 67], [R, 68.2], [L, 68.2]], fade(darker(C.cream2, 0.3), 0.42), { noEdge: true });
  for (let i = 0; i < 12; i += 1) {
    const x = L + 5 + (i * 37) % 44;
    const y = 46 + (i * 23) % 12;
    fill(cv, circ(x, y, 1.05), fade(darker(C.cream2, 0.32), 0.45), { noEdge: true });
  }
  for (let i = 0; i < 10; i += 1) {
    const x = L + 6 + (i * 29) % 42;
    const y = 71 + (i * 17) % 10;
    fill(cv, circ(x, y, 1.15), fade(darker(C.cream2, 0.28), 0.4), { noEdge: true });
  }
  fill(cv, [[R - 6, T], [R, T], [R, B], [R - 6, B]], fade(darker(C.cream2, 0.32), 0.26), { noEdge: true });
  // 奶油盖：一块比蛋糕体各宽 2、圆角收边的厚片压在上面。
  // 走过两版都不成：完整菱形透视缩到牌面像「白布剪了个 V 口」，
  // 一排各有描边的垂滴像「CCCO」——问题都出在「一条边画了太多次描边」。
  const cap = rrect(L - 2, T - 9, (R - L) + 4, 15, 6.4);
  fill(cv, cap, lin(0, T - 9, 0, T + 6, [[0, C.tofu], [0.58, C.cream], [1, darker(C.tofu, 0.18)]]));
  fill(cv, ell(37, T - 4.6, 12, 3.2), fade([255, 255, 255, 255], 0.5), { noEdge: true, clip: cap });
  // 盖沿投在蛋糕体上的浅影
  fill(cv, [[L + 1, T + 4], [R - 1, T + 4], [R - 1, T + 7.4], [L + 1, T + 7.4]], fade(darker(C.cream2, 0.36), 0.28), { noEdge: true });
  // 撒糖
  [[34, T - 5, 1.4, C.pink], [44, T - 7, 1.2, C.lemon], [57, T - 4, 1.3, C.mint], [65, T - 7, 1.1, C.cherry]].forEach(function (q) {
    fill(cv, circ(q[0], q[1], q[2]), q[3], { noEdge: true });
    fill(cv, circ(q[0] - q[2] * 0.3, q[1] - q[2] * 0.3, q[2] * 0.4), fade([255, 255, 255, 255], 0.7), { noEdge: true });
  });
  // 樱桃
  fill(cv, circ(48, T - 15, 6.4), rad(45.4, T - 17.6, 8.8, 8.8, [[0, lighter(C.cherry, 0.36)], [0.55, C.cherry], [1, darker(C.cherry, 0.28)]]));
  fill(cv, stroke(quad([50, T - 20.4], [54, T - 27], [61, T - 29], 10), 1.4, 1.1), C.kelp, { noEdge: true });
  fill(cv, circ(45.6, T - 17.4, 1.8), fade([255, 255, 255, 255], 0.75), { noEdge: true });
}

// 甜点 · 2 伞锥：冰淇淋。锥体格纹 + 双球 + 融化边。
function sweetCone(cv) {
  const cone = tri(23, 50, 73, 50, 48, 92);
  fill(cv, cone, lin(23, 0, 73, 0, [[0, lighter(C.cone, 0.22)], [0.5, C.cone], [1, darker(C.cone2, 0.12)]]));
  for (let i = -3; i < 4; i += 1) {
    const off = i * 8;
    fill(cv, [[23 + off, 50], [28 + off, 50], [54 + off, 92], [49 + off, 92]], fade(C.cone2, 0.42), { noEdge: true, clip: cone });
    fill(cv, [[73 - off, 50], [68 - off, 50], [42 - off, 92], [48 - off, 92]], fade(C.cone2, 0.42), { noEdge: true, clip: cone });
  }
  // 锥底受光留白：整块渐变从左上到右下，锥尖不能跟锥口一样亮
  fill(cv, [[23, 50], [73, 50], [72, 54], [24, 54]], fade(darker(C.cone2, 0.3), 0.35), { noEdge: true, clip: cone });
  // 融化的奶油：先画，被球压住中间，只在两侧垂下来
  for (let i = 0; i < 4; i += 1) {
    const x = 34 + i * 9.4;
    const k = i % 2 === 0 ? 1 : 0.72;
    fill(cv, ell(x, 50, 5, 4.6 * k), lin(0, 46, 0, 56, [[0, C.cream], [1, darker(C.cream2, 0.18)]]));
  }
  // 三球：后薄荷、左粉、前奶油（前面的压住后两个的下缘，接缝才不散）
  orb(cv, 63, 31, 13.6, 12.8, C.mint, { hi: 0.5 });
  orb(cv, 30, 33, 12.6, 11.8, C.cream, { hi: 0.5 });
  orb(cv, 47, 36, 15.4, 14.4, C.pink, { hi: 0.48 });
  // 糖珠
  [[35, 22, 1.8, C.cherry], [50, 16, 1.6, C.lemon], [65, 22, 1.6, C.cherry], [44, 40, 1.4, C.grape]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], p[2] + 0.6), darker(p[3], 0.25), { noEdge: true });
    fill(cv, circ(p[0], p[1], p[2]), p[3], { noEdge: true });
    fill(cv, circ(p[0] - p[2] * 0.3, p[1] - p[2] * 0.35, p[2] * 0.42), fade([255, 255, 255, 255], 0.8), { noEdge: true });
  });
}

// 甜点 · 3 竖长：棒棒糖。真螺旋 + 糖纸褶 + 柄。
function sweetLolli(cv) {
  fill(cv, rrect(44, 50, 8, 44, 3.4), lin(44, 0, 52, 0, [[0, C.tofu], [0.5, C.cream], [1, darker(C.cream2, 0.2)]]));
  const ball = circ(48, 35, 20);
  fill(cv, ball, rad(40, 27, 27, 27, [[0, lighter(C.pink, 0.26)], [0.48, C.pink], [1, darker(C.pink2, 0.14)]]));
  // 三条螺旋臂：从圆心出发，随半径扭转约一整圈
  const arms = [0.4, 0.4 + Math.PI * 2 / 3, 0.4 + Math.PI * 4 / 3];
  arms.forEach(function (a) {
    const p = ribbon(48, 35, 2, 18.6, a, -0.36, 0.9, 2.1, 26);
    fill(cv, p, fade(C.tofu, 0.92), { noEdge: true, clip: ball });
  });
  fill(cv, circ(48, 35, 3.6), rad(46.6, 33.6, 6, 6, [[0, C.tofu], [1, lighter(C.pink, 0.2)]]), { noEdge: true });
  glow(cv, 39, 26, 8, 5, [255, 255, 255, 255], 0.62, { clip: ball });
  // 糖纸褶（柄头）
  fill(cv, [[42, 50], [54, 50], [57, 46], [39, 46]], C.tofu);
  fill(cv, [[45, 46], [51, 46], [53, 50], [43, 50]], fade(C.pink2, 0.4), { noEdge: true });
  fill(cv, [[44, 90], [52, 90], [54, 94], [42, 94]], C.cream2);
}

// 甜点 · 4 成簇：一把糖豆。球感 + 落影 + 糖霜。
function sweetBeans(cv) {
  const beans = [
    [28, 66, 12.5, C.mint],
    [60, 68, 12, C.lemon],
    [44, 58, 12.5, C.orange],
    [29, 39, 9.5, C.cherry],
    [58, 38, 9.5, C.pink],
  ];
  beans.forEach(function (b) {
    fill(cv, ell(b[0] + 1.4, b[1] + b[2] * 0.86, b[2] * 0.92, b[2] * 0.26), fade(darker(b[3], 0.5), 0.16), { noEdge: true });
  });
  beans.forEach(function (b) {
    orb(cv, b[0], b[1], b[2], b[2], b[3], { hi: 0.5 });
  });
  // 糖霜点
  [[26, 56, 1.4], [50, 58, 1.4], [40, 46, 1.3], [60, 58, 1.2], [37, 32, 1.1]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], p[2]), fade([255, 255, 255, 255], 0.8), { noEdge: true });
  });
}

// 甜点 · 5 带尖：糖纸包的一颗糖。两端糖纸褶 + 中间条纹糖体。
// 这格换过三版「三角蛋糕」，都读成钟 / 帐篷：三角形的顶角一旦被奶油盖平，
// 剪影就只剩一个上窄下宽的梯形。改成横向的糖纸尖，与其余五格的竖向剪影也拉开了。
function sweetSlice(cv) {
  const body = ell(48, 52, 20, 15.6);
  // 左右糖纸
  [[-1, 30, 11], [1, 66, 85]].forEach(function (t) {
    const s2 = t[0];
    const inner = t[1];
    const outer = t[2];
    const pts = [[inner, 43], [outer, 31], [outer + s2 * 3, 52], [outer, 73], [inner, 61]];
    fill(cv, pts, lin(inner, 0, outer, 0, [[0, lighter(C.pink, 0.24)], [0.55, C.pink], [1, darker(C.pink2, 0.12)]]));
    // 褶线
    for (let i = 0; i < 3; i += 1) {
      const y0 = 40 + i * 8;
      fill(cv, stroke([[inner, y0], [outer + s2 * 1.5, 34 + i * 11]], 0.9, 0.7),
        fade(darker(C.pink2, 0.2), 0.45), { noEdge: true });
    }
  });
  // 糖体
  fill(cv, body, rad(39, 42, 26, 22, [[0, lighter(C.pink, 0.3)], [0.45, C.pink], [1, darker(C.pink2, 0.14)]]));
  // 斜条纹
  for (let i = -1; i < 2; i += 1) {
    const off = i * 14;
    fill(cv, [[22 + off, 74], [29 + off, 74], [47 + off, 30], [40 + off, 30]], fade(C.tofu, 0.9), { noEdge: true, clip: body });
  }
  glow(cv, 38, 42, 9, 6, [255, 255, 255, 255], 0.5);
  // 中间的糖纸拧花
  fill(cv, ell(48, 52, 3, 16), fade(darker(C.pink2, 0.16), 0.22), { noEdge: true });
}

// 海洋 · 0 圆润：河豚。球感 + 一圈短刺 + 大眼 + 浅肚。
function seaPuffer(cv) {
  const body = circ(48, 52, 25);
  for (let i = 0; i < 18; i += 1) {
    const a = i / 18 * Math.PI * 2 + 0.08;
    const bx = 48 + Math.cos(a) * 21;
    const by = 52 + Math.sin(a) * 21;
    const tx = 48 + Math.cos(a) * 31;
    const ty = 52 + Math.sin(a) * 31;
    const nx = -Math.sin(a) * 3.2;
    const ny = Math.cos(a) * 3.2;
    fill(cv, [[bx + nx, by + ny], [tx, ty], [bx - nx, by - ny]], lin(bx, by, tx, ty, [[0, darker(C.sky2, 0.02)], [1, darker(C.sky2, 0.24)]]));
  }
  fill(cv, body, rad(38, 40, 32, 32, [[0, lighter(C.sky, 0.28)], [0.48, C.sky], [1, darker(C.sky2, 0.14)]]));
  // 肚皮
  fill(cv, arc(48, 52, 25, 25, 0.25, Math.PI - 0.25, 26).concat([[23, 52], [73, 52]]), fade(lighter(C.foam, 0.22), 0.6), { noEdge: true, clip: body });
  // 斑
  [[62, 64, 2.2], [56, 69, 1.7], [36, 66, 1.9], [66, 50, 1.5], [31, 47, 1.6]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], p[2]), fade(darker(C.sky2, 0.22), 0.4), { noEdge: true, clip: body });
  });
  // 胸鳍
  fill(cv, tri(24, 56, 14, 50, 16, 63), lin(24, 0, 14, 0, [[0, C.sky], [1, darker(C.sky2, 0.08)]]));
  fill(cv, tri(72, 56, 82, 50, 80, 63), lin(72, 0, 82, 0, [[0, C.sky], [1, darker(C.sky2, 0.08)]]));
  // 眼
  eye(cv, 39, 44, 6.6);
  eye(cv, 57, 44, 6.6);
  // 嘴
  fill(cv, ell(48, 57, 3, 2.2), fade(darker(C.sky2, 0.38), 0.75), { noEdge: true });
  glow(cv, 37, 35, 11, 6, [255, 255, 255, 255], 0.45, { clip: body });
}

// 海洋 · 1 方框：螃蟹。方壳 + 双钳 + 八腿 + 眼柱。
function seaCrab(cv) {
  const shell = rrect(24, 32, 48, 33, 14);
  // 腿：左右各四条，向外下方折
  for (let i = 0; i < 4; i += 1) {
    const y = 42 + i * 6.2;
    const d = 1 - i * 0.12;
    fill(cv, stroke([[25, y], [25 - 8 * d, y + 4], [25 - 14 * d, y + 12]], 2.6, 1.2),
      lin(0, y, 0, y + 12, [[0, C.coral], [1, darker(C.coral2, 0.1)]]), { edge: 1.5 });
    fill(cv, stroke([[71, y], [71 + 8 * d, y + 4], [71 + 14 * d, y + 12]], 2.6, 1.2),
      lin(0, y, 0, y + 12, [[0, C.coral], [1, darker(C.coral2, 0.1)]]), { edge: 1.5 });
  }
  fill(cv, shell, rad(33, 39, 42, 34, [[0, lighter(C.coral, 0.28)], [0.48, C.coral], [1, darker(C.coral2, 0.14)]]));
  // 壳面：两道弧纹 + 三点斑
  fill(cv, arc(48, 38, 17, 8.4, Math.PI * 1.14, Math.PI * 1.86, 14), fade(darker(C.coral2, 0.16), 0.4), { noEdge: true });
  fill(cv, arc(48, 45, 21, 10, Math.PI * 1.2, Math.PI * 1.8, 14), fade(darker(C.coral2, 0.16), 0.3), { noEdge: true });
  [[36, 57, 2], [60, 57, 2], [48, 61, 1.7]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], p[2]), fade(lighter(C.coral, 0.26), 0.4), { noEdge: true, clip: shell });
  });
  // 钳：臂 + 掌 + 上下两指。旧版两指是两块三角，缩到牌面成了两只角；
  // 现在指头用「变宽的折线」画，指根粗指尖细，中间留一道缝，才读得出是钳子。
  [[-1, 1], [1, 1]].forEach(function (s) {
    const d = s[0];
    const hx = 48 + d * 29;
    const hy = 27;
    fill(cv, stroke([[48 + d * 18, 40], [48 + d * 23, 33], [hx - d * 2, hy + 5]], 4.4, 3.6),
      lin(0, 40, 0, 22, [[0, C.coral], [1, darker(C.coral2, 0.06)]]), { edge: 1.7 });
    fill(cv, ell(hx, hy + 2, 8.4, 7.2), rad(hx - 2.4, hy - 1.4, 10.4, 9.4, [[0, lighter(C.coral, 0.24)], [1, darker(C.coral2, 0.1)]]));
    fill(cv, stroke([[hx + d * 3, hy - 3], [hx + d * 9, hy - 10], [hx + d * 13, hy - 7]], 4.4, 2),
      lin(hx, 0, hx + d * 14, 0, [[0, C.coral], [1, darker(C.coral2, 0.04)]]), { edge: 1.6 });
    fill(cv, stroke([[hx + d * 3, hy + 7], [hx + d * 11, hy + 3], [hx + d * 14, hy + 7]], 3.8, 1.7),
      lin(hx, 0, hx + d * 14, 0, [[0, darker(C.coral, 0.06)], [1, darker(C.coral2, 0.14)]]), { edge: 1.6 });
  });
  // 眼柱
  fill(cv, rrect(37, 23, 5, 10, 2), C.coral2, { noEdge: true });
  fill(cv, rrect(54, 23, 5, 10, 2), C.coral2, { noEdge: true });
  eye(cv, 39.5, 22, 5.2);
  eye(cv, 56.5, 22, 5.2);
  glow(cv, 37, 39, 12, 6, [255, 255, 255, 255], 0.36, { clip: shell });
}

// 海洋 · 2 伞锥：水母。伞盖渐变 + 裙边波浪 + 细长触手。
function seaJelly(cv) {
  const cap = arc(48, 42, 30, 26, Math.PI, Math.PI * 2, 44).concat([[78, 44], [18, 44]]);
  const jL = [246, 190, 206, 255];
  const jM = [232, 164, 186, 255];
  const jD = [203, 126, 152, 255];
  // 触手：六条，长短交错，越往下越细
  for (let i = 0; i < 6; i += 1) {
    const x = 24 + i * 9.6;
    const len = 34 + (i % 3) * 9;
    const p = [];
    for (let k = 0; k <= 6; k += 1) p.push([x + Math.sin(k * 0.85 + i) * 3.2, 44 + k * len / 6]);
    fill(cv, stroke(p, 2.2, 0.8), lin(0, 44, 0, 44 + len, [[0, fade(jD, 0.95)], [1, fade(lighter(jM, 0.25), 0.55)]]), { edge: 1.3 });
  }
  // 伞盖
  fill(cv, cap, rad(42, 20, 36, 32, [[0, lighter(jL, 0.3)], [0.42, jM], [1, darker(jD, 0.1)]]));
  // 裙边：底沿一串小半圆
  for (let i = 0; i < 7; i += 1) {
    fill(cv, ell(21 + i * 9, 44, 4.4, 3.4), lin(0, 41, 0, 48, [[0, lighter(jM, 0.12)], [1, darker(jD, 0.12)]]), { edge: 1.5 });
  }
  // 放射褶
  for (let i = 0; i < 5; i += 1) {
    const a = Math.PI * 1.1 + i / 4 * Math.PI * 0.8;
    fill(cv, stroke(arc(48, 42, 27, 23, a - 0.05, a + 0.05, 6), 1, 0.8), fade([255, 255, 255, 255], 0.26), { noEdge: true, clip: cap });
  }
  glow(cv, 38, 26, 13, 8, [255, 255, 255, 255], 0.6, { clip: cap });
  glow(cv, 62, 31, 6, 4, [255, 255, 255, 255], 0.18, { clip: cap });
}

// 海洋 · 3 竖长：鱿鱼。尖筒身 + 顶鳍 + 带吸盘的触手。
function seaSquid(cv) {
  const sqL = lighter(C.kelp, 0.3);
  const sqD = darker(C.kelp2, 0.14);
  // 触手先画，被筒身压住根部
  for (let i = 0; i < 6; i += 1) {
    const x0 = 31 + i * 5.6;
    const len = 32 + (i % 3) * 6;
    const p = [];
    for (let k = 0; k <= 7; k += 1) {
      const t = k / 7;
      p.push([x0 + Math.sin(t * 2.4 + i * 1.1) * (2 + t * 3), 46 + t * len]);
    }
    fill(cv, stroke(p, 2.9, 0.7), lin(0, 46, 0, 46 + len, [[0, C.kelp], [1, sqD]]), { edge: 1.25 });
    for (let k = 1; k <= 3; k += 1) {
      fill(cv, circ(x0 + Math.sin(k * 0.8 + i) * 2.4, 54 + k * len / 4.2, 0.85), fade(sqD, 0.8), { noEdge: true });
    }
  }
  // 双鳍：菱形，长在筒身最上两角（鱿鱼的鳍在「头顶」，这是它与鱼、章鱼最省事的分界）
  // 鳍要「尖」：钝圆的一片会读成一顶兜帽，把筒身穿成盾牌
  const finL = smoothPoly([[43, 16], [18, 12], [31, 28]], 0.1);
  const finR = smoothPoly([[53, 16], [78, 12], [65, 28]], 0.1);
  fill(cv, finL, lin(41, 10, 20, 28, [[0, sqL], [1, darker(C.kelp2, 0.02)]]));
  fill(cv, finR, lin(55, 10, 76, 28, [[0, sqL], [1, darker(C.kelp2, 0.02)]]));
  // 筒身：上尖、下收成短颈
  const body = curve([
    [48, 8], [55, 13], [61, 23], [64, 34],
    [63, 44], [59, 48], [48, 49],
    [37, 48], [33, 44], [32, 34],
    [35, 23], [41, 13],
  ]);
  fill(cv, body, rad(41, 24, 32, 34, [[0, sqL], [0.46, C.kelp], [1, sqD]]));
  // 中缝与侧棱
  fill(cv, stroke([[48, 14], [48, 48]], 0.7, 1.6), fade(sqD, 0.34), { noEdge: true });
  fill(cv, stroke([[38, 20], [36, 44]], 1, 0.7), fade(sqL, 0.3), { noEdge: true });
  // 眼：长在筒身中段两侧，比旧版低一点，留出尖顶
  eye(cv, 40, 35, 5.4, darker(C.deep, 0.14));
  eye(cv, 56, 35, 5.4, darker(C.deep, 0.14));
  glow(cv, 40, 20, 9, 7, [255, 255, 255, 255], 0.44);
}

// 海洋 · 4 成簇：珊瑚。主干 + 三分叉 + 顶端花球 + 枝上小孔。
function seaCoral(cv) {
  const root = [48, 88];
  const arms = [[18, 34, -0.8], [48, 22, 0], [78, 34, 0.8]];
  arms.forEach(function (a) {
    const p = quad(root, [(root[0] + a[0]) / 2 + a[2] * 12, 58], [a[0], a[1]], 16);
    fill(cv, stroke(p, 5.6, 3.4), lin(0, 88, 0, 20, [[0, darker(C.coral2, 0.12)], [0.55, C.coral], [1, lighter(C.coral, 0.2)]]));
    fill(cv, stroke(p.map(function (q) { return [q[0] - 1.4, q[1]]; }), 1.4, 0.9), fade([255, 255, 255, 255], 0.26), { noEdge: true });
  });
  // 二级小枝
  [[30, 48], [66, 48], [40, 40], [58, 38]].forEach(function (p, i) {
    const tip = [p[0] + (i % 2 ? 12 : -12), p[1] - 16];
    fill(cv, stroke(quad([p[0], p[1] + 8], [p[0], p[1] - 4], tip, 12), 2.8, 1.9), lin(0, p[1], 0, tip[1], [[0, C.coral], [1, lighter(C.coral, 0.18)]]), { edge: 1.4 });
    fill(cv, circ(tip[0], tip[1], 3), rad(tip[0] - 0.8, tip[1] - 1.2, 4.4, 4.4, [[0, [255, 238, 232, 255]], [1, darker(C.coral, 0.02)]]));
  });
  // 顶端花球
  [[18, 34], [48, 22], [78, 34]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], 4.4), rad(p[0] - 1.3, p[1] - 1.7, 6.6, 6.6, [[0, [255, 246, 242, 255]], [0.6, [250, 212, 206, 255]], [1, darker(C.coral, 0.06)]]));
  });
  // 枝上小孔
  [[42, 70], [54, 62], [36, 54], [62, 52]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], 1.2), fade(darker(C.coral2, 0.35), 0.65), { noEdge: true });
  });
}

// 海洋 · 5 带尖：海星。五角带肉（顶点圆滑）+ 表面小丘 + 中心盘。
function seaStar(cv) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + i / 10 * Math.PI * 2;
    const r = i % 2 === 0 ? 31 : 13;
    pts.push([48 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  const body = smoothPoly(pts, 0.34);
  fill(cv, body, rad(39, 40, 36, 36, [[0, lighter(C.orange, 0.28)], [0.45, C.orange], [1, darker(C.orange, 0.18)]]));
  // 五个角各压一道浅槽，避免读成一块饼
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + i / 5 * Math.PI * 2;
    fill(cv, stroke([[48, 50], [48 + Math.cos(a) * 26, 50 + Math.sin(a) * 26]], 3.4, 0.8),
      fade(darker(C.orange, 0.14), 0.22), { noEdge: true, clip: body });
  }
  // 中心盘
  fill(cv, circ(48, 50, 8), rad(45, 47, 11, 11, [[0, [255, 232, 206, 255]], [1, darker(C.orange, 0.02)]]));
  // 角上的小丘
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + i / 5 * Math.PI * 2;
    fill(cv, circ(48 + Math.cos(a) * 22, 50 + Math.sin(a) * 22, 1.6), fade(darker(C.orange, 0.24), 0.5), { noEdge: true });
    const b = a + Math.PI / 5;
    fill(cv, circ(48 + Math.cos(b) * 15, 50 + Math.sin(b) * 15, 1.2), fade(darker(C.orange, 0.22), 0.4), { noEdge: true });
  }
  glow(cv, 38, 36, 13, 9, [255, 255, 255, 255], 0.3);
}

// 灵兽 · 0 圆润：金蟾。球身 + 突眼 + 疣点 + 蹼。
function beastToad(cv) {
  // 后腿：鼓起的腿根 + 蹼足。旧版是一块梯形，缩到牌面读成两块砖。
  [[26, 72, -1], [70, 72, 1]].forEach(function (p) {
    const d = p[2];
    fill(cv, ell(p[0], p[1], 9.6, 9), rad(p[0] - 2, p[1] - 3.4, 12, 11.4, [[0, lighter(C.fawn, 0.16)], [1, darker(C.fawn2, 0.22)]]));
    fill(cv, ell(p[0] + d * 1.6, p[1] + 7.4, 9.4, 4.6), lin(0, p[1] + 3, 0, p[1] + 12, [[0, C.fawn2], [1, darker(C.fawn2, 0.26)]]));
    for (let k = -1; k <= 1; k += 1) {
      fill(cv, ell(p[0] + k * 5.2, p[1] + 10, 1.7, 2), darker(C.fawn2, 0.28), { noEdge: true });
    }
  });
  // 身体
  fill(cv, ell(48, 54, 30, 24), rad(36, 42, 40, 34, [[0, lighter(C.fawn, 0.3)], [0.45, C.fawn], [1, darker(C.fawn2, 0.18)]]));
  // 肚皮
  fill(cv, ell(48, 63, 21, 13), fade(lighter(C.cream, 0.12), 0.5), { noEdge: true });
  // 疣点
  [[34, 46, 3], [48, 42, 2.6], [62, 47, 3], [40, 58, 2.2], [58, 58, 2.2], [27, 58, 2], [69, 57, 2]].forEach(function (p) {
    fill(cv, circ(p[0], p[1], p[2]), darker(C.fawn2, 0.1), { noEdge: true });
    fill(cv, circ(p[0] - p[2] * 0.3, p[1] - p[2] * 0.35, p[2] * 0.42), fade([255, 255, 255, 255], 0.45), { noEdge: true });
  });
  // 眼睑底座（蟾的眼在头顶鼓起）+ 眼
  fill(cv, circ(35, 33, 10.6), rad(32, 29, 13, 13, [[0, lighter(C.fawn, 0.2)], [1, darker(C.fawn2, 0.14)]]));
  fill(cv, circ(61, 33, 10.6), rad(58, 29, 13, 13, [[0, lighter(C.fawn, 0.2)], [1, darker(C.fawn2, 0.14)]]));
  eye(cv, 35, 33, 7.4);
  eye(cv, 61, 33, 7.4);
  // 嘴
  fill(cv, stroke(quad([39, 51], [48, 57.5], [57, 51], 12), 1.2, 1.2), fade(darker(C.fawn2, 0.42), 0.85), { noEdge: true });
  fill(cv, circ(35, 55, 1.8), fade(lighter(C.pink, 0.3), 0.35), { noEdge: true });
  fill(cv, circ(61, 55, 1.8), fade(lighter(C.pink, 0.3), 0.35), { noEdge: true });
  glow(cv, 40, 40, 14, 8, [255, 255, 255, 255], 0.38);
}

// 灵兽 · 1 方框：玄龟。龟甲网格 + 头 + 四肢。
function beastTortoise(cv) {
  // 四肢（带爪）
  [[19, 64], [65, 64]].forEach(function (p) {
    fill(cv, rrect(p[0], p[1], 13, 20, 6), lin(0, p[1], 0, p[1] + 20, [[0, C.kelp], [1, darker(C.kelp2, 0.14)]]), { edge: 1.8 });
    for (let i = 0; i < 3; i += 1) {
      fill(cv, tri(p[0] + 2.5 + i * 4, p[1] + 19, p[0] + 0.5 + i * 4, p[1] + 25, p[0] + 4.5 + i * 4, p[1] + 25), darker(C.kelp2, 0.2), { noEdge: true });
    }
  });
  // 尾
  fill(cv, tri(22, 50, 8, 55, 22, 62), darker(C.kelp2, 0.06), { edge: 1.6 });
  // 头
  fill(cv, ell(74, 48, 13, 10.5), rad(70, 43, 16, 14, [[0, lighter(C.kelp, 0.26)], [0.5, C.kelp], [1, darker(C.kelp2, 0.14)]]));
  eye(cv, 79, 45, 3.4, darker(C.ink, 0.1));
  fill(cv, stroke(quad([74, 54], [80, 55], [84, 51], 8), 1, 0.8), fade(darker(C.kelp2, 0.34), 0.8), { noEdge: true });
  // 甲
  const shell = rrect(17, 26, 56, 40, 18);
  fill(cv, shell, rad(33, 33, 48, 42, [[0, lighter(C.kelp, 0.26)], [0.48, C.kelp], [1, darker(C.kelp2, 0.18)]]));
  // 甲片：七个六边形，描边而不是填色（填色在这个尺寸下会糊成圆点）
  const hex = function (cx, cy, r) {
    const out = [];
    for (let i = 0; i < 6; i += 1) {
      const a = i / 6 * Math.PI * 2 + Math.PI / 6;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.84]);
    }
    return out;
  };
  const line = fade(darker(C.kelp2, 0.26), 0.65);
  [[45, 44, 9.6], [45, 30, 7], [31, 37, 7], [59, 37, 7], [31, 52, 7], [59, 52, 7], [45, 59, 7]].forEach(function (h) {
    const cell = hex(h[0], h[1], h[2]);
    fill(cv, cell, fade(lighter(C.kelp, 0.18), 0.3), { noEdge: true, clip: shell });
    fill(cv, stroke(cell.concat([cell[0]]), 1.3, 1.3), line, { noEdge: true, clip: shell });
  });
  glow(cv, 31, 33, 16, 8, [255, 255, 255, 255], 0.45, { clip: shell });
}

// 灵兽 · 2 伞锥：孔雀开屏。扇形羽 + 眼斑 + 身首冠。
function beastPeacock(cv) {
  const cx = 48;
  const cy = 62;
  // 尾扇
  const fan = arc(cx, cy, 42, 40, Math.PI, Math.PI * 2, 48).concat([[cx + 42, cy + 4], [cx - 42, cy + 4]]);
  fill(cv, fan, rad(cx, cy + 6, 46, 44, [[0, darker(C.kelp2, 0.2)], [0.6, C.kelp], [1, lighter(C.kelp, 0.2)]]));
  // 羽枝（放射细线）
  for (let i = 0; i <= 12; i += 1) {
    const a = Math.PI + i / 12 * Math.PI;
    fill(cv, stroke([[cx + Math.cos(a) * 12, cy + Math.sin(a) * 11], [cx + Math.cos(a) * 38, cy + Math.sin(a) * 36]], 1.3, 0.7), fade(darker(C.kelp2, 0.32), 0.55), { noEdge: true, clip: fan });
  }
  // 羽端眼斑
  for (let i = 0; i <= 6; i += 1) {
    const a = Math.PI * 1.06 + i / 6 * Math.PI * 0.88;
    const x = cx + Math.cos(a) * 30;
    const y = cy + Math.sin(a) * 29;
    fill(cv, circ(x, y, 5.6), C.sky2, { noEdge: true });
    fill(cv, circ(x, y, 3.4), C.deep, { noEdge: true });
    fill(cv, circ(x, y, 1.6), C.lemon, { noEdge: true });
    fill(cv, circ(x - 1.4, y - 1.6, 1), fade([255, 255, 255, 255], 0.75), { noEdge: true });
  }
  // 身体
  fill(cv, ell(cx, 66, 13, 17), rad(cx - 5, 58, 18, 22, [[0, lighter(C.deep, 0.3)], [0.5, C.deep], [1, darker(C.deep, 0.3)]]));
  // 颈
  fill(cv, stroke(quad([cx, 58], [cx + 3, 40], [cx + 1, 28], 16), 4.6, 3.6), lin(0, 58, 0, 26, [[0, C.deep], [1, darker(C.deep, 0.1)]]));
  // 头（深蓝，眼睛用白瞳才看得见）
  fill(cv, ell(cx + 1, 24, 7.6, 7), rad(cx - 2, 21, 10, 9, [[0, lighter(C.deep, 0.26)], [1, darker(C.deep, 0.12)]]));
  eye(cv, cx + 4, 23.4, 2.8);
  // 喙
  fill(cv, tri(cx + 7, 24.6, cx + 14, 27, cx + 7, 29), C.orange);
  // 冠羽
  [[-3, -6], [1, -8], [5, -6]].forEach(function (p, i) {
    fill(cv, stroke([[cx + 1, 18], [cx + p[0], 18 + p[1] - 2]], 1.1, 0.6), darker(C.deep, 0.1), { noEdge: true });
    fill(cv, circ(cx + p[0], 18 + p[1] - 3, 1.9 - i * 0.1), C.kelp, { noEdge: true });
  });
  glow(cv, 36, 34, 18, 12, [255, 255, 255, 255], 0.3, { clip: fan });
}

// 灵兽 · 3 竖长：白鹤。细长腿 + S 形长颈 + 红顶 + 黑尾羽。
function beastCrane(cv) {
  // 腿：两节，膝弯朝后
  fill(cv, stroke([[44, 64], [42, 78], [36, 94]], 1.9, 1.4), lin(0, 64, 0, 94, [[0, C.orange], [1, darker(C.orange, 0.24)]]), { edge: 1.4 });
  fill(cv, stroke([[52, 66], [55, 80], [52, 94]], 1.9, 1.4), lin(0, 66, 0, 94, [[0, C.orange], [1, darker(C.orange, 0.24)]]), { edge: 1.4 });
  // 黑尾羽：三片向后下方张开。旧版一块梯形，缩到牌面像插了面灰旗。
  [[[32, 51], [16, 51], [7, 56]], [[32, 54], [17, 59], [6, 65]], [[32, 57], [19, 67], [10, 74]]].forEach(function (f, i) {
    fill(cv, stroke(f, 4.6 - i * 0.5, 1.3), lin(32, 0, 6, 0, [[0, C.grey], [1, darker(C.grey, 0.34)]]), { edge: 1.5 });
  });
  // 身体
  fill(cv, ell(46, 53, 20, 14), rad(38, 43, 25, 19, [[0, [255, 255, 255, 255]], [0.55, C.white], [1, darker(C.grey, 0.12)]]));
  // 翅：三层羽片 + 弧线
  [[38, 54, 15, 9], [40, 60, 12.5, 6.5]].forEach(function (a) {
    fill(cv, ell(a[0], a[1], a[2], a[3]), fade(lighter(C.white, 0.26), 0.75), { noEdge: true });
  });
  for (let i = 0; i < 3; i += 1) {
    fill(cv, stroke(arc(39, 54, 11 + i * 2.6, 7.4 + i * 1.6, -0.45, 1.6, 14), 1, 0.7), fade(darker(C.grey, 0.3), 0.5), { noEdge: true });
  }
  // 颈：S 形，越上越细
  fill(cv, stroke(quad([54, 46], [63, 34], [56, 21], 18), 5.4, 3.6), lin(0, 48, 0, 18, [[0, C.white], [1, [255, 255, 255, 255]]]), { edge: 1.8 });
  // 头
  fill(cv, ell(55, 17, 8, 6.8), rad(52, 14, 11, 9, [[0, [255, 255, 255, 255]], [0.6, [252, 252, 250, 255]], [1, darker(C.grey, 0.1)]]));
  // 红顶
  fill(cv, ell(54, 12, 4.6, 2.8), rad(53, 11, 6, 4, [[0, lighter(C.cherry, 0.28)], [1, darker(C.cherry, 0.2)]]), { noEdge: true });
  // 长喙
  fill(cv, tri(61, 16.4, 74, 19, 61, 20.6), lin(61, 0, 74, 0, [[0, C.orange], [1, darker(C.orange, 0.2)]]), { edge: 1.3 });
  eye(cv, 57, 16.6, 2.6);
  glow(cv, 40, 46, 12, 7, [255, 255, 255, 255], 0.5);
}

// 灵兽 · 4 成簇：刺猬。两圈刺 + 小脸 + 耳眼。
function beastHedgehog(cv) {
  // 脚
  fill(cv, rrect(30, 76, 9, 7, 3.4), C.cocoa2, { noEdge: true });
  fill(cv, rrect(50, 76, 9, 7, 3.4), C.cocoa2, { noEdge: true });
  // 外层刺：从背上散开（0° ~ 200°）
  for (let i = 0; i < 22; i += 1) {
    const a = Math.PI * (0.98 + i / 21 * 1.0);
    const bx = 40 + Math.cos(a) * 21;
    const by = 54 + Math.sin(a) * 17;
    const tx = 40 + Math.cos(a) * 34;
    const ty = 54 + Math.sin(a) * 29;
    fill(cv, tri(bx - 4, by, bx + 4, by, tx, ty), lin(bx, by, tx, ty, [[0, C.cocoa2], [1, C.cocoa]]), { edge: 1.5 });
  }
  // 内层浅刺
  for (let i = 0; i < 16; i += 1) {
    const a = Math.PI * (1.02 + i / 15 * 0.92);
    const bx = 40 + Math.cos(a) * 18;
    const by = 54 + Math.sin(a) * 15;
    const tx = 40 + Math.cos(a) * 26;
    const ty = 54 + Math.sin(a) * 21;
    fill(cv, tri(bx - 3, by, bx + 3, by, tx, ty), lighter(C.fawn2, 0.24), { noEdge: true });
  }
  // 身体
  fill(cv, ell(40, 54, 22, 18), rad(32, 44, 28, 24, [[0, lighter(C.fawn2, 0.28)], [0.5, C.fawn2], [1, darker(C.fawn2, 0.2)]]));
  // 脸
  fill(cv, ell(64, 60, 14, 12.5), rad(58, 54, 19, 17, [[0, [255, 252, 244, 255]], [0.55, C.cream], [1, darker(C.cream2, 0.06)]]));
  // 耳
  fill(cv, circ(57, 50, 3.4), darker(C.fawn2, 0.06));
  fill(cv, circ(57, 50, 1.6), fade(darker(C.cocoa, 0.1), 0.5), { noEdge: true });
  // 眼 / 鼻 / 胡须
  eye(cv, 65, 57, 3.2);
  fill(cv, ell(76.5, 60.5, 3.4, 2.8), darker(C.cocoa, 0.35), { noEdge: true });
  fill(cv, circ(75.4, 59.4, 1.2), fade([255, 255, 255, 255], 0.55), { noEdge: true });
  fill(cv, stroke([[77, 64], [86, 66]], 0.7, 0.5), fade(C.cocoa2, 0.55), { noEdge: true });
  fill(cv, stroke([[77, 66], [85, 69]], 0.7, 0.5), fade(C.cocoa2, 0.45), { noEdge: true });
}

// 灵兽 · 5 带尖：灵鹿。分叉角 + 身 + 细腿。
function beastDeer(cv) {
  // 腿：上粗下细，带蹄
  [[33, 64, 30, 78, 28, 92], [41, 66, 40, 80, 39, 92], [55, 66, 57, 80, 58, 92], [63, 64, 66, 78, 68, 92]].forEach(function (l) {
    fill(cv, stroke([[l[0], l[1]], [l[2], l[3]], [l[4], l[5]]], 3.2, 1.7), lin(0, l[1], 0, l[5], [[0, C.fawn2], [1, darker(C.fawn2, 0.26)]]), { edge: 1.5 });
    fill(cv, rrect(l[4] - 2.2, l[5] - 3.4, 4.8, 3.6, 1.4), darker(C.cocoa, 0.14), { noEdge: true });
  });
  // 身体
  fill(cv, ell(44, 58, 22, 14), rad(36, 48, 28, 22, [[0, lighter(C.fawn, 0.3)], [0.48, C.fawn], [1, darker(C.fawn2, 0.16)]]));
  // 胸
  fill(cv, ell(55, 57, 10, 10), fade(lighter(C.fawn, 0.18), 0.55), { noEdge: true });
  // 颈（前倾）
  fill(cv, stroke(quad([55, 50], [62, 34], [61, 26], 16), 6, 4.6), lin(0, 50, 0, 24, [[0, C.fawn], [1, lighter(C.fawn, 0.14)]]), { edge: 1.9 });
  // 头
  fill(cv, ell(61, 24, 9.4, 7.4), rad(58, 20, 12, 10, [[0, lighter(C.fawn, 0.26)], [1, C.fawn]]));
  // 吻
  fill(cv, ell(69, 27, 4.6, 3.4), lighter(C.fawn, 0.18), { noEdge: true });
  fill(cv, circ(72.4, 26.2, 1.2), darker(C.cocoa, 0.38), { noEdge: true });
  // 眼 / 耳
  eye(cv, 64, 21.4, 2.9);
  fill(cv, [[51, 19], [43, 11], [52, 13.4]], lin(51, 0, 43, 0, [[0, C.fawn2], [1, darker(C.fawn2, 0.12)]]), { edge: 1.5 });
  // 角：两枝，各两叉
  [[53, 0], [63, 1]].forEach(function (base) {
    const bx = base[0];
    fill(cv, stroke([[bx, 18], [bx - 1.5, 9], [bx - 0.5, 2]], 2.4, 1.5), lin(0, 18, 0, 2, [[0, C.fawn2], [1, lighter(C.fawn2, 0.22)]]), { edge: 1.2 });
    fill(cv, stroke([[bx - 1.2, 10], [bx - 7.5, 4.5]], 1.7, 0.9), lighter(C.fawn2, 0.12), { edge: 1.1 });
    fill(cv, stroke([[bx - 0.6, 14], [bx + 6, 9.5]], 1.7, 0.9), lighter(C.fawn2, 0.12), { edge: 1.1 });
  });
  // 尾
  fill(cv, [[23, 50], [15, 55], [23, 59]], C.cream, { edge: 1.5 });
  glow(cv, 36, 52, 12, 7, [255, 255, 255, 255], 0.4);
}

const SWEET = [sweetMacaron, sweetCake, sweetCone, sweetLolli, sweetBeans, sweetSlice];
const SEA = [seaPuffer, seaCrab, seaJelly, seaSquid, seaCoral, seaStar];
const BEAST = [beastToad, beastTortoise, beastPeacock, beastCrane, beastHedgehog, beastDeer];

const SETS = { sweet: SWEET, sea: SEA, beast: BEAST };

// ---------- 出图 ----------

function downsample(cv) {
  const out = Buffer.alloc(CELL * CELL * 4);
  const k = SS * SS;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SS; dy += 1) {
        for (let dx = 0; dx < SS; dx += 1) {
          const i = ((y * SS + dy) * cv.w + (x * SS + dx)) * 4;
          const al = cv.data[i + 3] / 255;
          r += cv.data[i] * al;
          g += cv.data[i + 1] * al;
          b += cv.data[i + 2] * al;
          a += al;
        }
      }
      const o = (y * CELL + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / k * 255);
    }
  }
  return out;
}

function renderCell(draw) {
  const cv = makeCanvas(CELL * SS, CELL * SS);
  draw(cv);
  return downsample(cv);
}

function main() {
  const srcPng = path.join(ROOT, 'assets/crest.png');

  const total = BASE_CELLS + THEMES.length * 6;
  const ROW = total * CELL * 4;
  const sheet = Buffer.alloc(ROW * CELL);

  BASE8.forEach(function (draw, i) {
    const cell = renderCell(draw);
    for (let y = 0; y < CELL; y += 1) {
      cell.copy(sheet, y * ROW + i * CELL * 4, y * CELL * 4, (y + 1) * CELL * 4);
    }
  });

  THEMES.forEach(function (name, t) {
    const set = SETS[name];
    if (!set || set.length !== 6) throw new Error(name + ' 不是六格');
    set.forEach(function (draw, i) {
      const cell = renderCell(draw);
      const ox = (BASE_CELLS + t * 6 + i) * CELL * 4;
      for (let y = 0; y < CELL; y += 1) {
        cell.copy(sheet, y * ROW + ox, y * CELL * 4, (y + 1) * CELL * 4);
      }
    });
  });

  fs.writeFileSync(srcPng, encodePng(total * CELL, CELL, sheet));

  // ---------- 样式：base64 与类一次出，图与样式不会错配 ----------
  const wxssPath = path.join(ROOT, 'styles/crest.wxss');
  let css = fs.readFileSync(wxssPath, 'utf8');
  const b64 = encodePng(total * CELL, CELL, sheet).toString('base64');

  const imgRe = /(url\("?data:image\/png;base64,)([A-Za-z0-9+/=]+)("?\))/;
  if (!imgRe.test(css)) throw new Error('crest.wxss 里找不到内联的 base64');
  css = css.replace(imgRe, function (m, a, old2, c) {
    return a + b64 + c;
  });

  const sizeRe = /(\.cell__crest \{[\s\S]*?background-size:\s*)(\d+)%?(\s*auto;)/;
  if (!sizeRe.test(css)) throw new Error('crest.wxss 里没有 background-size');
  css = css.replace(sizeRe, function (m, a, n, c) {
    return a + (total * 100) + '%' + c;
  });

  // 行尾跟着文件走：另一个会话可能用 CRLF 写过这个文件，直接按 \n 匹配会整块失配。
  const eol = css.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const classes = [];
  for (let i = 1; i <= total; i += 1) {
    const pct = ((i - 1) / (total - 1) * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    classes.push('.crest--' + i + ' { background-position-x: ' + pct + '%; }');
  }
  const blockRe = /\.crest--\d+ \{ background-position-x: [\d.]+%; \}\r?\n(?:\.crest--\d+ \{ background-position-x: [\d.]+%; \}\r?\n)*/;
  if (!blockRe.test(css)) throw new Error('crest.wxss 里没有 crest--N 类块');
  css = css.replace(blockRe, classes.join(eol) + eol);
  fs.writeFileSync(wxssPath, css);

  // ---------- 验收图（不入库） ----------
  const tmpDir = path.join(ROOT, '.workbuddy/tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const flat = Buffer.alloc(ROW * CELL);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < total * CELL; x += 1) {
      const s = y * ROW + x * 4;
      const al = sheet[s + 3] / 255;
      const lum = 0.299 * sheet[s] + 0.587 * sheet[s + 1] + 0.114 * sheet[s + 2];
      const v = Math.round(251 - (251 - lum) * al);
      flat[s] = v;
      flat[s + 1] = v;
      flat[s + 2] = Math.round(v * 0.97);
      flat[s + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(tmpDir, 'crest-silhouette.png'), encodePng(total * CELL, CELL, flat));

  const GAP = 8;
  const pw = total * (CELL + GAP) + GAP;
  const ph = CELL + GAP * 2;
  const board = makeCanvas(pw, ph);
  fill(board, [[0, 0], [pw, 0], [pw, ph], [0, ph]], rgb('#0d2420'), { noEdge: true });
  for (let i = 0; i < total; i += 1) {
    const ox = GAP + i * (CELL + GAP);
    fill(board, [[ox, GAP], [ox + CELL, GAP], [ox + CELL, GAP + CELL], [ox, GAP + CELL]], rgb('#fbf3dd'), { noEdge: true });
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const s = y * ROW + (i * CELL + x) * 4;
        const al = sheet[s + 3] / 255;
        if (al <= 0) continue;
        const d = ((GAP + y) * pw + ox + x) * 4;
        for (let k = 0; k < 3; k += 1) {
          board.data[d + k] = Math.round(sheet[s + k] * al + board.data[d + k] * (1 - al));
        }
        board.data[d + 3] = 255;
      }
    }
  }
  fs.writeFileSync(path.join(tmpDir, 'crest-onboard.png'), encodePng(pw, ph, board.data));

  // 3 倍放大稿：检查边缘与细节（只看后 18 格的三套主题）
  const Z = 3;
  const zw = 18 * CELL * Z + 19 * 6;
  const zh = CELL * Z + 12;
  const zoom = makeCanvas(zw, zh);
  fill(zoom, [[0, 0], [zw, 0], [zw, zh], [0, zh]], rgb('#0d2420'), { noEdge: true });
  for (let i = 0; i < 18; i += 1) {
    const ox = 6 + i * (CELL * Z + 6);
    const oy = 6;
    fill(zoom, [[ox, oy], [ox + CELL * Z, oy], [ox + CELL * Z, oy + CELL * Z], [ox, oy + CELL * Z]], rgb('#fbf3dd'), { noEdge: true });
    const ci = BASE_CELLS + i;
    for (let y = 0; y < CELL * Z; y += 1) {
      for (let x = 0; x < CELL * Z; x += 1) {
        const s = Math.floor(y / Z) * ROW + (ci * CELL + Math.floor(x / Z)) * 4;
        const al = sheet[s + 3] / 255;
        if (al <= 0) continue;
        const d = ((oy + y) * zw + ox + x) * 4;
        for (let k = 0; k < 3; k += 1) {
          zoom.data[d + k] = Math.round(sheet[s + k] * al + zoom.data[d + k] * (1 - al));
        }
        zoom.data[d + 3] = 255;
      }
    }
  }
  fs.writeFileSync(path.join(tmpDir, 'crest-zoom.png'), encodePng(zw, zh, zoom.data));

  // 色表长度必须跟着格数走，否则迸溅色会串到别的格上。
  const visual = fs.readFileSync(path.join(ROOT, 'data/visual.js'), 'utf8');
  const hueBlock = (visual.match(/const CREST_HUE = \[[\s\S]*?\];/) || [''])[0];
  const hueLen = (hueBlock.match(/#[0-9a-f]{6}/gi) || []).length;
  if (hueLen !== total) {
    throw new Error('visual.CREST_HUE 有 ' + hueLen + ' 个颜色，图有 ' + total + ' 格 —— 两处必须一一对应');
  }

  process.stdout.write('wrote assets/crest.png ' + (total * CELL) + 'x' + CELL
    + '（' + total + ' 格 @' + CELL + 'px，' + Math.round(b64.length / 1024) + 'KB base64）\n');
}

main();
