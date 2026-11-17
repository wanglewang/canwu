'use strict';

// 生成灵纹牌图（assets/crest.png）与它的样式（styles/crest.wxss）。
//
// 图是 26 格横排：1–8 是原来那套果器（从既有 PNG 里原样读回来，不重画），
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
// 用法：node scripts/gen-crest.js
// 产物：assets/crest.png（1664×64，26 格）、styles/crest.wxss（内联 + 26 个类）
//       .workbuddy/tmp/ 下两张验收图（剪影 / 摆上牌面），不入库

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const CELL = 64;
const SS = 4;              // 超采样倍数
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

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- PNG 解码（只为了把既有那八格读回来，不重画） ----------

function decodePng(buf) {
  let p = 8;
  let ihdr = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (!ihdr) throw new Error('没有 IHDR');
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const ctype = ihdr[9];
  const interlace = ihdr[12];
  if (depth !== 8 || interlace !== 0) throw new Error('只支持 8 位非隔行 PNG');
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 0 ? 1 : ctype === 4 ? 2 : 0;
  if (!ch) throw new Error('不支持的 colorType ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x += 1) {
      const s = x * ch;
      const d = (y * w + x) * 4;
      if (ch >= 3) {
        out[d] = cur[s];
        out[d + 1] = cur[s + 1];
        out[d + 2] = cur[s + 2];
        out[d + 3] = ch === 4 ? cur[s + 3] : 255;
      } else if (ch === 1) {
        out[d] = cur[s];
        out[d + 1] = cur[s];
        out[d + 2] = cur[s];
        out[d + 3] = 255;
      } else {
        out[d] = cur[s];
        out[d + 1] = cur[s];
        out[d + 2] = cur[s];
        out[d + 3] = cur[s + 1];
      }
    }
    prev = cur;
  }
  return { w: w, h: h, data: out };
}

// ---------- 画布 ----------

function makeCanvas(w, h) {
  return { w: w, h: h, data: Buffer.alloc(w * h * 4) };
}

function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

function put(cv, x, y, rgb) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  cv.data[i] = rgb[0];
  cv.data[i + 1] = rgb[1];
  cv.data[i + 2] = rgb[2];
  cv.data[i + 3] = 255;
}

// 沿质心把多边形外推 d：用来给形状先铺一层加粗的深色底，压出 1.5px 描边。
// 凸形很准，凹形会有轻微变形，这个尺寸看不见。
function inflate(pts, d) {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map(function (p) {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const L = Math.sqrt(dx * dx + dy * dy) || 1;
    return [p[0] + dx / L * d, p[1] + dy / L * d];
  });
}

// 描边色：暖褐黑。纯黑会把整盘压死，原图那套果器用的也是这种低饱和深色。
const OUTLINE = '#3a2c22';

// 扫描线填充，顶点是 64 空间坐标，进来乘 scale（默认超采样倍数）。
// 形状一律「后画的盖住先画的」。
//
// 默认给每个形状描一圈边 —— 前八格是精细插画（有描边、有高光），新画的
// 十八格如果纯平涂，摆在同一张盘上就是两套画风。太小的细节（眼睛、樱桃梗）
// 描边会糊成一团，包围盒小于 9px 的直接跳过。
function fill(cv, pts, color, scale) {
  const k = scale === undefined ? SS : scale;
  if (k === SS && color !== OUTLINE) {
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
    if (maxX - minX >= 9 && maxY - minY >= 9) paint(cv, inflate(pts, 1.5), OUTLINE, k);
  }
  paint(cv, pts, color, k);
}

function paint(cv, pts, color, k) {
  const rgb = hex(color);
  const p = pts.map(function (q) { return [q[0] * k, q[1] * k]; });
  const n = p.length;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const q of p) {
    if (q[1] < minY) minY = q[1];
    if (q[1] > maxY) maxY = q[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(cv.h - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = y0; y <= y1; y += 1) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i += 1) {
      const a = p[i];
      const b = p[(i + 1) % n];
      if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
        xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
    }
    xs.sort(function (u, v) { return u - v; });
    for (let k2 = 0; k2 + 1 < xs.length; k2 += 2) {
      const xa = Math.max(0, Math.ceil(xs[k2] - 0.5));
      const xb = Math.min(cv.w - 1, Math.floor(xs[k2 + 1] - 0.5));
      for (let x = xa; x <= xb; x += 1) put(cv, x, y, rgb);
    }
  }
}

function ell(cx, cy, rx, ry, n) {
  const out = [];
  const m = n || 48;
  for (let i = 0; i < m; i += 1) {
    const a = i / m * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

function circ(cx, cy, r, n) {
  return ell(cx, cy, r, r, n);
}

function rrect(x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  const out = [];
  const arc = function (cx, cy, from) {
    for (let i = 0; i <= 6; i += 1) {
      const a = from + i / 6 * (Math.PI / 2);
      out.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]);
    }
  };
  arc(x + w - q, y + q, -Math.PI / 2);
  arc(x + w - q, y + h - q, 0);
  arc(x + q, y + h - q, Math.PI / 2);
  arc(x + q, y + q, Math.PI);
  return out;
}

function tri(ax, ay, bx, by, cx2, cy2) {
  return [[ax, ay], [bx, by], [cx2, cy2]];
}

// 二次贝塞尔采样成折线：这个尺寸下 12 段就够圆。
function quad(a, c, b, n) {
  const out = [];
  const m = n || 12;
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

// ---------- 色板 ----------
// 明度下限是硬约束：主色要能在 #fbf3dd 上跳出来。

const C = {
  cream: '#fdf1d8',
  cream2: '#f7e3bd',
  pink: '#f4a6be',
  pink2: '#e88fa9',
  cocoa: '#b06a45',
  cherry: '#d94f4f',
  mint: '#8fd6b0',
  lemon: '#f7d060',
  orange: '#f5a05a',
  grape: '#b39ddb',
  cone: '#d9a05f',
  sky: '#8ec9e0',
  sky2: '#5fa8c8',
  foam: '#e8f6fb',
  coral: '#f08a7a',
  coral2: '#d96b5c',
  kelp: '#7ac09a',
  deep: '#3f7d99',
  white: '#e6edf2',
  grey: '#c9cfd6',
  fawn: '#e8c08a',
  fawn2: '#cf9d63',
  rust: '#e08a4a',
  ink: '#5a6472',
};

// ---------- 三套主题，各六格（族序：圆 / 方 / 伞锥 / 竖长 / 簇 / 尖） ----------

function at(pts, ox) {
  return pts.map(function (q) { return [q[0] + ox, q[1]]; });
}

const SWEET = [
  // 0 圆润：马卡龙 —— 裙边褶皱 + 夹心 + 糖霜高光。轮廓仍是上下两片圆壳。
  function (cv, ox) {
    fill(cv, at(ell(32, 40, 23, 11), ox), C.pink2);
    fill(cv, at(rrect(11, 21, 42, 8, 3), ox), C.cream);
    fill(cv, at(ell(32, 22, 23, 11), ox), C.pink);
    for (let i = 0; i < 9; i += 1) {
      const x = 11 + i * 5.2;
      fill(cv, at([[x, 45], [x + 2.6, 51], [x + 5.2, 45]], ox), C.pink2, 1);
    }
    fill(cv, at(ell(24, 18, 9, 3), ox), '#fbd3df', 1);
    fill(cv, at(ell(41, 26, 5, 2), ox), '#fbd3df', 1);
  },
  // 1 方框：方蛋糕 —— 顶面裱花、侧面分层、糖粒、樱桃梗。仍是方块轮廓。
  function (cv, ox) {
    fill(cv, at([[14, 26], [50, 26], [50, 50], [14, 50]], ox), C.cream2);
    fill(cv, at([[14, 26], [32, 16], [50, 26], [32, 34]], ox), C.cream);
    fill(cv, at([[14, 36], [50, 36], [50, 44], [14, 44]], ox), C.pink);
    fill(cv, at(circ(32, 13, 5), ox), C.cherry);
    fill(cv, at([[32, 9], [35, 4], [32, 3], [30, 7]], ox), C.kelp, 1);
    [[19, 31], [26, 29], [38, 29], [45, 31]].forEach(function (p) {
      fill(cv, at(circ(p[0], p[1], 1.6), ox), C.cream, 1);
    });
    fill(cv, at([[14, 47], [50, 47], [50, 49], [14, 49]], ox), C.cocoa, 1);
  },
  // 2 伞锥：冰淇淋 —— 蛋筒格纹、糖珠、球高光。仍是锥体 + 双球。
  function (cv, ox) {
    fill(cv, at([[20, 26], [44, 26], [32, 56]], ox), C.cone);
    fill(cv, at([[20, 26], [44, 26], [40, 34], [24, 34]], ox), C.cocoa);
    fill(cv, at(circ(32, 20, 14), ox), C.cream);
    fill(cv, at(circ(26, 17, 8), ox), C.pink);
    fill(cv, at(circ(38, 20, 7), ox), C.mint);
    for (let i = 0; i < 4; i += 1) {
      const y = 38 + i * 5;
      const w = 4 + i * 2;
      fill(cv, at([[32 - w, y - 2], [32 - w + 3, y - 2], [32 + w, y + 3], [32 + w - 3, y + 3]], ox), C.cocoa, 1);
      fill(cv, at([[32 + w, y - 2], [32 + w - 3, y - 2], [32 - w, y + 3], [32 - w + 3, y + 3]], ox), C.cocoa, 1);
    }
    fill(cv, at(ell(23, 12, 4, 2), ox), '#ffe9f2', 1);
    fill(cv, at(circ(30, 11, 1.8), ox), C.cherry, 1);
    fill(cv, at(circ(41, 16, 1.8), ox), C.cream, 1);
  },
  // 3 竖长：棒棒糖 —— 螺旋纹 + 高光 + 糖纸褶。仍是圆头长柄。
  function (cv, ox) {
    fill(cv, at(rrect(30, 32, 4, 26, 2), ox), C.cream2);
    fill(cv, at(circ(32, 22, 14), ox), C.pink);
    fill(cv, at(quad([32, 22], [40, 12], [32, 12]), ox), C.cream);
    fill(cv, at(quad([32, 22], [24, 30], [32, 32]), ox), C.cream);
    fill(cv, at(quad([32, 22], [43, 27], [41, 34]), ox), C.cream, 1);
    fill(cv, at(quad([32, 22], [22, 16], [26, 11]), ox), C.cream, 1);
    fill(cv, at(circ(32, 22, 4), ox), C.pink2);
    fill(cv, at(ell(26, 15, 4, 2), ox), '#ffe0ea', 1);
    fill(cv, at([[30, 55], [34, 55], [36, 60], [28, 60]], ox), C.cream, 1);
  },
  // 4 成簇：一把糖豆 —— 每颗加高光，缝里点糖霜。仍是五颗成簇。
  function (cv, ox) {
    [[24, 38, 9, C.lemon], [42, 40, 9, C.mint], [32, 28, 9, C.orange],
      [26, 20, 6, C.grape], [40, 19, 6, C.pink]].forEach(function (b) {
      fill(cv, at(circ(b[0], b[1], b[2]), ox), b[3]);
    });
    [[24, 38, 9, '#fff3bd'], [42, 40, 9, '#c9f0d9'], [32, 28, 9, '#ffd9a3'],
      [26, 20, 6, '#ded0f2'], [40, 19, 6, '#ffd0dd']].forEach(function (b) {
      fill(cv, at(ell(b[0] - b[2] * 0.28, b[1] - b[2] * 0.32, b[2] * 0.3, b[2] * 0.18), ox), b[3], 1);
    });
    [[33, 20, 1.5], [34, 34, 1.5], [19, 28, 1.5], [47, 30, 1.5]].forEach(function (p) {
      fill(cv, at(circ(p[0], p[1], p[2]), ox), C.cream, 1);
    });
  },
  // 5 带尖：切片蛋糕 —— 分层线、奶油波浪、樱桃梗。仍是三角尖 + 底托。
  function (cv, ox) {
    fill(cv, at(rrect(8, 49, 48, 7, 3), ox), C.cream2);
    fill(cv, at(tri(32, 10, 54, 49, 10, 49), ox), C.cocoa);
    fill(cv, at(tri(32, 10, 44, 30, 20, 30), ox), C.cream);
    fill(cv, at([[13, 40], [51, 40], [54, 46], [10, 46]], ox), C.pink);
    fill(cv, at(circ(32, 10, 5), ox), C.cherry);
    fill(cv, at([[32, 6], [34, 2], [32, 2], [30, 5]], ox), C.kelp, 1);
    fill(cv, at([[21, 34], [25, 33], [29, 34], [33, 33], [37, 34], [43, 33],
      [43, 35], [37, 36], [33, 35], [29, 36], [25, 35], [21, 36]], ox), '#fff6e4', 1);
    fill(cv, at([[14, 44], [50, 44], [50, 45], [14, 45]], ox), '#fbd3df', 1);
  },
];

const SEA = [
  // 0 圆润：河豚
  function (cv, ox) {
    fill(cv, at(circ(32, 33, 18), ox), C.sky);
    fill(cv, at(tri(14, 30, 5, 22, 6, 38), ox), C.sky2);
    fill(cv, at(tri(50, 30, 59, 22, 58, 38), ox), C.sky2);
    fill(cv, at(circ(26, 29, 3), ox), C.foam);
    fill(cv, at(circ(39, 29, 3), ox), C.foam);
    fill(cv, at(ell(32, 47, 6, 4), ox), C.sky2);
  },
  // 1 方框：螃蟹
  function (cv, ox) {
    fill(cv, at(rrect(14, 26, 36, 24, 7), ox), C.coral);
    fill(cv, at([[15, 24], [7, 14], [15, 12], [20, 23]], ox), C.coral2);
    fill(cv, at([[15, 28], [6, 30], [8, 38], [18, 32]], ox), C.coral2);
    fill(cv, at([[49, 24], [57, 14], [49, 12], [44, 23]], ox), C.coral2);
    fill(cv, at([[49, 28], [58, 30], [56, 38], [46, 32]], ox), C.coral2);
    fill(cv, at(circ(25, 34, 3.4), ox), C.foam);
    fill(cv, at(circ(39, 34, 3.4), ox), C.foam);
    fill(cv, at([[16, 50], [20, 59], [28, 57], [24, 50]], ox), C.coral2);
    fill(cv, at([[48, 50], [44, 59], [36, 57], [40, 50]], ox), C.coral2);
  },
  // 2 伞锥：水母
  function (cv, ox) {
    fill(cv, at(ell(32, 28, 20, 15), ox), '#e8a8bb');
    fill(cv, at(rrect(12, 28, 40, 7, 3), ox), '#d988a0');
    for (let i = 0; i < 3; i += 1) {
      const x = 20 + i * 12;
      fill(cv, at(quad([x, 34], [x + 4, 46], [x - 2, 56]), ox), '#d988a0');
    }
    fill(cv, at(circ(32, 24, 5), ox), '#f6c8d5');
  },
  // 3 竖长：鱿鱼（尖头 + 直身 + 垂下的触手）
  function (cv, ox) {
    fill(cv, at([[32, 3], [41, 20], [32, 30], [23, 20]], ox), C.kelp);
    fill(cv, at(rrect(25, 24, 14, 20, 6), ox), C.kelp);
    fill(cv, at(tri(25, 20, 15, 16, 23, 28), ox), '#9ad3ae');
    fill(cv, at(tri(39, 20, 49, 16, 41, 28), ox), '#9ad3ae');
    fill(cv, at([[27, 43], [31, 43], [30, 54], [26, 56]], ox), '#9ad3ae');
    fill(cv, at([[33, 43], [37, 43], [39, 55], [34, 54]], ox), '#9ad3ae');
    fill(cv, at(circ(30, 22, 2.4), ox), C.deep);
    fill(cv, at(circ(34, 22, 2.4), ox), C.deep);
  },
  // 4 成簇：珊瑚
  function (cv, ox) {
    fill(cv, at(rrect(28, 40, 8, 18, 3), ox), C.coral2);
    fill(cv, at(quad([30, 44], [18, 34], [16, 20]), ox), C.coral);
    fill(cv, at(quad([34, 44], [46, 36], [48, 22]), ox), C.coral);
    fill(cv, at(quad([32, 40], [28, 26], [34, 14]), ox), C.coral);
    fill(cv, at(circ(16, 18, 4), ox), '#f6d9e0');
    fill(cv, at(circ(48, 20, 4), ox), '#f6d9e0');
    fill(cv, at(circ(34, 12, 4), ox), '#f6d9e0');
  },
  // 5 带尖：海星
  function (cv, ox) {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + i / 10 * Math.PI * 2;
      const r = i % 2 === 0 ? 22 : 9;
      pts.push([32 + Math.cos(a) * r, 34 + Math.sin(a) * r]);
    }
    fill(cv, at(pts, ox), C.orange);
    fill(cv, at(circ(32, 34, 5), ox), '#f7b98a');
  },
];

const BEAST = [
  // 0 圆润：金蟾
  function (cv, ox) {
    fill(cv, at(ell(32, 36, 22, 16), ox), C.fawn);
    fill(cv, at(circ(22, 22, 7), ox), C.fawn2);
    fill(cv, at(circ(42, 22, 7), ox), C.fawn2);
    fill(cv, at(circ(22, 22, 3), ox), C.ink);
    fill(cv, at(circ(42, 22, 3), ox), C.ink);
    fill(cv, at([[16, 48], [12, 58], [24, 56], [26, 50]], ox), C.fawn2);
    fill(cv, at([[48, 48], [52, 58], [40, 56], [38, 50]], ox), C.fawn2);
  },
  // 1 方框：玄龟
  function (cv, ox) {
    fill(cv, at(rrect(12, 24, 40, 26, 9), ox), C.kelp);
    fill(cv, at(rrect(20, 30, 24, 14, 5), ox), '#a8d8b4');
    fill(cv, at([[50, 30], [60, 26], [60, 40], [50, 44]], ox), '#8fc49c');
    fill(cv, at(circ(55, 30, 2), ox), C.ink);
    fill(cv, at([[16, 50], [14, 58], [25, 56], [26, 50]], ox), C.kelp);
    fill(cv, at([[48, 50], [50, 58], [39, 56], [38, 50]], ox), C.kelp);
  },
  // 2 伞锥：孔雀（开屏）
  function (cv, ox) {
    const fan = [];
    for (let i = 0; i <= 12; i += 1) {
      const a = Math.PI * (1 + i / 12);
      fan.push([32 + Math.cos(a) * 24, 40 + Math.sin(a) * 26]);
    }
    fill(cv, at(fan, ox), C.kelp);
    for (let i = 0; i < 5; i += 1) {
      const a = Math.PI * (1.08 + i / 4 * 0.84);
      fill(cv, at(circ(32 + Math.cos(a) * 18, 40 + Math.sin(a) * 19, 4), ox), C.sky2);
    }
    fill(cv, at(ell(32, 44, 7, 10), ox), C.deep);
    fill(cv, at(tri(28, 34, 36, 34, 32, 26), ox), C.rust);
  },
  // 3 竖长：白鹤
  // 身体用冷白而不是纯白：纯白在暖白牌上是隐形的，只能靠色相差和红顶拉出来。
  function (cv, ox) {
    fill(cv, at(ell(30, 40, 12, 9), ox), C.white);
    fill(cv, at(quad([34, 34], [40, 20], [40, 12]), ox), C.white);
    fill(cv, at(circ(41, 12, 6), ox), C.white);
    fill(cv, at(circ(41, 9, 3.4), ox), C.cherry);
    fill(cv, at(tri(45, 10, 54, 13, 45, 16), ox), C.orange);
    fill(cv, at(circ(43, 12, 1.6), ox), C.ink);
    fill(cv, at([[26, 48], [25, 60], [29, 60], [29, 48]], ox), C.orange);
    fill(cv, at([[34, 48], [34, 60], [38, 60], [37, 48]], ox), C.orange);
    fill(cv, at(tri(20, 38, 8, 32, 12, 44), ox), C.grey);
  },
  // 4 成簇：刺猬
  function (cv, ox) {
    fill(cv, at(ell(31, 39, 20, 15), ox), C.fawn2);
    for (let i = 0; i < 11; i += 1) {
      const a = Math.PI * (1.04 + i / 10 * 0.92);
      const bx = 31 + Math.cos(a) * 17;
      const by = 39 + Math.sin(a) * 13;
      const tx = 31 + Math.cos(a) * 28;
      const ty = 39 + Math.sin(a) * 22;
      fill(cv, at(tri(bx - 4, by, bx + 4, by, tx, ty), ox), C.cocoa);
    }
    fill(cv, at(ell(47, 41, 9, 8), ox), C.cream);
    fill(cv, at(circ(50, 39, 2.2), ox), C.ink);
    fill(cv, at(circ(50, 45, 2.2), ox), C.ink);
  },
  // 5 带尖：灵鹿（枝角）
  function (cv, ox) {
    fill(cv, at(ell(32, 40, 13, 11), ox), C.fawn);
    fill(cv, at(circ(32, 27, 8), ox), C.fawn);
    fill(cv, at([[28, 22], [26, 10], [30, 12], [31, 22]], ox), C.fawn2);
    fill(cv, at([[36, 22], [38, 10], [34, 12], [33, 22]], ox), C.fawn2);
    fill(cv, at(tri(26, 10, 20, 6, 24, 14), ox), C.fawn2);
    fill(cv, at(tri(38, 10, 44, 6, 40, 14), ox), C.fawn2);
    fill(cv, at(circ(29, 26, 2), ox), C.ink);
    fill(cv, at(circ(35, 26, 2), ox), C.ink);
    fill(cv, at([[26, 48], [25, 58], [29, 58], [29, 48]], ox), C.fawn2);
    fill(cv, at([[35, 48], [35, 58], [39, 58], [38, 48]], ox), C.fawn2);
  },
];

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
  draw(cv, 0);
  return downsample(cv);
}

function main() {
  const srcPng = path.join(ROOT, 'assets/crest.png');
  const old = decodePng(fs.readFileSync(srcPng));
  if (old.h !== CELL) throw new Error('既有灵纹图高度不是 ' + CELL);
  // 已经是新图（26 格）时只取前八格，脚本可以反复跑。
  if (old.w < BASE_CELLS * CELL) throw new Error('既有灵纹图不足八格');

  const total = BASE_CELLS + THEMES.length * 6;
  const ROW = total * CELL * 4;          // 一行的字节数
  const sheet = Buffer.alloc(ROW * CELL);

  // 1–8：原样搬过来，不重画。
  for (let y = 0; y < CELL; y += 1) {
    old.data.copy(sheet, y * ROW, y * old.w * 4, y * old.w * 4 + BASE_CELLS * CELL * 4);
  }

  // 9–26：三套主题各六格。
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

  // 这里必须报错而不是静默跳过：替换不上就等于图换了、样式还是旧的，
  // 盘面上会整排错位，而测试一条都不会红。
  const imgRe = /(url\("?data:image\/png;base64,)([A-Za-z0-9+/=]+)("?\))/;
  if (!imgRe.test(css)) throw new Error('crest.wxss 里找不到内联的 base64');
  css = css.replace(imgRe, function (m, a, old, c) {
    return a + b64 + c;
  });

  const sizeRe = /(\.cell__crest \{[\s\S]*?background-size:\s*)(\d+)%?(\s*auto;)/;
  if (!sizeRe.test(css)) throw new Error('crest.wxss 里没有 background-size');
  css = css.replace(sizeRe, function (m, a, n, c) {
    return a + (total * 100) + '%' + c;
  });

  // 行尾跟着文件走：另一个会话可能用 CRLF 写过这个文件，直接按 \n 匹配会整块失配，
  // 而替换时写 \n 又会造出混合行尾。这里只探测、不改写别人的行尾。
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
      const d = s;
      const al = sheet[s + 3] / 255;
      const lum = 0.299 * sheet[s] + 0.587 * sheet[s + 1] + 0.114 * sheet[s + 2];
      const v = Math.round(251 - (251 - lum) * al);
      flat[d] = v;
      flat[d + 1] = v;
      flat[d + 2] = Math.round(v * 0.97);
      flat[d + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(tmpDir, 'crest-silhouette.png'), encodePng(total * CELL, CELL, flat));

  const GAP = 8;
  const pw = total * (CELL + GAP) + GAP;
  const ph = CELL + GAP * 2;
  const board = makeCanvas(pw, ph);
  fill(board, [[0, 0], [pw, 0], [pw, ph], [0, ph]], '#0d2420', 1);
  for (let i = 0; i < total; i += 1) {
    const ox = GAP + i * (CELL + GAP);
    fill(board, [[ox, GAP], [ox + CELL, GAP], [ox + CELL, GAP + CELL], [ox, GAP + CELL]], '#fbf3dd', 1);
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

  // 色表长度必须跟着格数走，否则迸溅色会串到别的格上。
  const visual = fs.readFileSync(path.join(ROOT, 'data/visual.js'), 'utf8');
  const hueBlock = (visual.match(/const CREST_HUE = \[[\s\S]*?\];/) || [''])[0];
  const hueLen = (hueBlock.match(/#[0-9a-f]{6}/gi) || []).length;
  if (hueLen !== total) {
    throw new Error('visual.CREST_HUE 有 ' + hueLen + ' 个颜色，图有 ' + total + ' 格 —— 两处必须一一对应');
  }

  process.stdout.write('wrote assets/crest.png ' + (total * CELL) + 'x' + CELL
    + '（' + total + ' 格，' + Math.round(b64.length / 1024) + 'KB base64）\n');
}

main();
