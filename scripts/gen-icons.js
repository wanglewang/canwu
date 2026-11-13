'use strict';

// 零依赖生成 tabBar 图标：81x81 RGBA PNG，2 倍超采样降采样获得平滑边缘。
// 用法：node scripts/gen-icons.js
// 输出：assets/tab/{home,cultivate,book,seal}[-on].png（四个 tab 各一对）

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 81;
const SCALE = 2;
const N = SIZE * SCALE;

const ICONS = {
  home: [
    ['line', 20, 76, 81, 26, 13],
    ['line', 81, 26, 142, 76, 13],
    ['rect', 36, 76, 90, 62, 11],
    ['rect', 70, 102, 22, 36, 9],
  ],
  // 修炼：丹鼎三足 + 一缕上升的灵气，与「功法 / 仙门切磋」的图形语言区分开。
  cultivate: [
    ['rect', 40, 62, 82, 54, 11],
    ['line', 30, 62, 132, 62, 11],
    ['line', 40, 116, 122, 116, 11],
    ['line', 48, 116, 40, 142, 9],
    ['line', 114, 116, 122, 142, 9],
    ['line', 81, 62, 81, 34, 9],
    ['line', 68, 46, 81, 34, 9],
    ['line', 81, 34, 94, 46, 9],
  ],
  book: [
    ['rect', 22, 36, 118, 94, 11],
    ['line', 81, 36, 81, 130, 9],
    ['line', 38, 60, 68, 60, 8],
    ['line', 38, 84, 68, 84, 8],
    ['line', 94, 60, 124, 60, 8],
    ['line', 94, 84, 124, 84, 8],
  ],
  seal: [
    ['rect', 26, 26, 110, 110, 11],
    ['line', 50, 56, 112, 56, 9],
    ['line', 50, 84, 112, 84, 9],
    ['line', 81, 56, 81, 112, 9],
    ['line', 50, 110, 112, 110, 9],
  ],
};

function hexToRgb(hex) {
  const s = hex.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function render(shapes) {
  const alpha = new Uint8Array(N * N);

  function dot(x, y) {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    alpha[y * N + x] = 255;
  }

  function line(x0, y0, x1, y1, width) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    const r = width / 2;
    const minX = Math.floor(Math.min(x0, x1) - r - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + r + 1);
    const minY = Math.floor(Math.min(y0, y1) - r - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + r + 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        const px = x0 + t * dx;
        const py = y0 + t * dy;
        if ((x - px) * (x - px) + (y - py) * (y - py) <= r * r) dot(x, y);
      }
    }
  }

  function rect(x, y, w, h, t) {
    line(x, y, x + w, y, t);
    line(x, y + h, x + w, y + h, t);
    line(x, y, x, y + h, t);
    line(x + w, y, x + w, y + h, t);
  }

  for (let i = 0; i < shapes.length; i += 1) {
    const s = shapes[i];
    if (s[0] === 'line') line(s[1], s[2], s[3], s[4], s[5]);
    else if (s[0] === 'rect') rect(s[1], s[2], s[3], s[4], s[5]);
  }
  return alpha;
}

function downsample(alpha) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          sum += alpha[(y * SCALE + dy) * N + (x * SCALE + dx)];
        }
      }
      const i = (y * SIZE + x) * 4;
      rgba[i + 3] = Math.round(sum / (SCALE * SCALE));
    }
  }
  return rgba;
}

const CRC_TABLE = (function () {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}());

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, rgb) {
  const stride = SIZE * 4 + 1;
  const raw = Buffer.alloc(stride * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < SIZE; x += 1) {
      const src = (y * SIZE + x) * 4;
      const dst = y * stride + 1 + x * 4;
      raw[dst] = rgb[0];
      raw[dst + 1] = rgb[1];
      raw[dst + 2] = rgb[2];
      raw[dst + 3] = rgba[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function main() {
  const outDir = path.join(__dirname, '..', 'assets', 'tab');
  fs.mkdirSync(outDir, { recursive: true });
  // 与 theme.json 的 tabColor / tabSelectedColor 同值：深青底上的灰青与金色。
  const normal = hexToRgb('#7d8a83');
  const active = hexToRgb('#cfae6d');
  let count = 0;
  for (const key of Object.keys(ICONS)) {
    const alpha = downsample(render(ICONS[key]));
    fs.writeFileSync(path.join(outDir, key + '.png'), encodePng(alpha, normal));
    fs.writeFileSync(path.join(outDir, key + '-on.png'), encodePng(alpha, active));
    count += 2;
  }
  console.log('generated ' + count + ' icons in ' + outDir);
}

main();
