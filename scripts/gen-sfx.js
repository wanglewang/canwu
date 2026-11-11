'use strict';

// 零依赖合成局内音效：16kHz / 16bit / 单声道 PCM WAV。
// 用法：node scripts/gen-sfx.js
// 输出：assets/sfx/*.wav（约 90KB，全部由代码合成，仓库里不留二进制来源）
//
// 音色原则（第二版，第一版被反馈「刺耳、脑子嗡嗡」）：
//   1. 只用基频 + 极轻的二次分音，不用非整数倍分音（金属泛音是刺耳主因）；
//   2. 全局一阶低通把 1.5kHz 以上削掉，再补 14ms 软起音，去掉「咔」的瞬态；
//   3. 每个音效只留一个声部，衰减压到 0.1–0.2 秒，多个音效不叠成和弦；
//   4. 归一化峰值只到 0.52，播放在 sfx.js 里再降到 0.3 左右；
//   5. 单声道播放：新的判定音会把上一个掐掉（见 utils/sfx.js 的 VOICE）。
// 整体走「木鱼 / 闷磬 / 轻铃」的中低音质地，音量宁小勿大。

const fs = require('fs');
const path = require('path');

const SR = 16000;
const PEAK = 0.52;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sfx');

// 固定种子，保证每次生成的字节一致，git 不会因随机数抖动。
let seed = 20261111;
function noise() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed / 0x7fffffff) * 2 - 1;
}

function blank(seconds) {
  return new Float32Array(Math.ceil(seconds * SR));
}

// partials: [频率倍数, 振幅, 衰减秒数]
function tone(buf, opt) {
  const at = Math.round((opt.at || 0) * SR);
  const n = Math.min(buf.length - at, Math.round(opt.dur * SR));
  const attack = opt.attack === undefined ? 0.016 : opt.attack;
  const partials = opt.partials || [[1, 1, opt.decay || 0.12]];
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const ramp = attack > 0 ? Math.min(1, t / attack) : 1;
    let s = 0;
    for (let p = 0; p < partials.length; p += 1) {
      const part = partials[p];
      s += part[1] * Math.exp(-t / part[2]) * Math.sin(2 * Math.PI * opt.freq * part[0] * t);
    }
    buf[at + i] += opt.amp * ramp * s;
  }
}

// 一阶低通白噪：只在落子音里留极轻一点「击」的质感，音量压到几乎听不见。
function noiseBurst(buf, opt) {
  const at = Math.round((opt.at || 0) * SR);
  const n = Math.min(buf.length - at, Math.round(opt.dur * SR));
  const a = opt.smooth === undefined ? 0.35 : opt.smooth;
  let lp = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    lp += a * (noise() - lp);
    buf[at + i] += opt.amp * Math.exp(-t / (opt.decay || 0.008)) * lp;
  }
}

function sweep(buf, opt) {
  const at = Math.round((opt.at || 0) * SR);
  const n = Math.min(buf.length - at, Math.round(opt.dur * SR));
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const k = t / opt.dur;
    const f = opt.from + (opt.to - opt.from) * Math.pow(k, 0.7);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t / 0.02) * Math.exp(-t / (opt.decay || 0.1));
    buf[at + i] += opt.amp * env * Math.sin(phase);
  }
}

// 先把高频削掉，再补软起音/软收尾；顺序固定，避免边界爆音。
function soften(buf) {
  let lp = 0;
  const a = 0.55; // ≈1.4kHz，基频全留，泛音基本压没
  for (let i = 0; i < buf.length; i += 1) {
    lp += a * (buf[i] - lp);
    buf[i] = lp;
  }
  const fadeIn = Math.round(0.014 * SR);
  for (let i = 0; i < fadeIn && i < buf.length; i += 1) buf[i] *= i / fadeIn;
  const fadeOut = Math.min(buf.length, Math.round(0.012 * SR));
  for (let i = 0; i < fadeOut; i += 1) {
    const idx = buf.length - 1 - i;
    buf[idx] *= i / fadeOut;
  }
  return buf;
}

function normalize(buf, peak) {
  let max = 0;
  for (let i = 0; i < buf.length; i += 1) max = Math.max(max, Math.abs(buf[i]));
  if (max <= 0) return buf;
  const k = peak / max;
  for (let i = 0; i < buf.length; i += 1) buf[i] *= k;
  return buf;
}

const SOUNDS = {
  // 落子：低木鱼，极短
  tap: function () {
    const b = blank(0.1);
    tone(b, {
      freq: 392, dur: 0.1, amp: 0.5, attack: 0.008,
      partials: [[1, 1, 0.028], [2, 0.1, 0.014]],
    });
    noiseBurst(b, { dur: 0.008, amp: 0.025, decay: 0.003, smooth: 0.25 });
    return b;
  },

  // 成算：闷磬，只有一个声部
  hit: function () {
    const b = blank(0.3);
    tone(b, {
      freq: 392, dur: 0.3, amp: 0.45, attack: 0.018,
      partials: [[1, 1, 0.115], [2, 0.12, 0.055]],
    });
    return b;
  },

  // 失手：低而短，不轰头
  miss: function () {
    const b = blank(0.22);
    tone(b, {
      freq: 174.61, dur: 0.22, amp: 0.5, attack: 0.014,
      partials: [[1, 1, 0.085], [2, 0.1, 0.04]],
    });
    noiseBurst(b, { dur: 0.02, amp: 0.03, decay: 0.008, smooth: 0.2 });
    return b;
  },

  // 金锋 / 大得：比 hit 高一点的轻铃，不再叠第二个音
  gold: function () {
    const b = blank(0.34);
    tone(b, {
      freq: 587.33, dur: 0.34, amp: 0.4, attack: 0.018,
      partials: [[1, 1, 0.145], [2, 0.12, 0.06]],
    });
    return b;
  },

  // 倒数：一声短轻铃
  tick: function () {
    const b = blank(0.08);
    tone(b, {
      freq: 523.25, dur: 0.08, amp: 0.35, attack: 0.008,
      partials: [[1, 1, 0.022]],
    });
    return b;
  },

  // 起手：低气声上扬
  go: function () {
    const b = blank(0.28);
    sweep(b, { from: 220, to: 440, dur: 0.22, amp: 0.22, decay: 0.11 });
    tone(b, {
      freq: 110, dur: 0.18, amp: 0.16, attack: 0.018,
      partials: [[1, 1, 0.07]],
    });
    return b;
  },

  // 圆满：两音上行，间隔拉开，不叠成和弦
  clear: function () {
    const b = blank(0.62);
    tone(b, {
      freq: 392, dur: 0.4, amp: 0.26, attack: 0.02,
      partials: [[1, 1, 0.16], [2, 0.1, 0.07]],
    });
    tone(b, {
      at: 0.2, freq: 523.25, dur: 0.42, amp: 0.24, attack: 0.02,
      partials: [[1, 1, 0.17], [2, 0.1, 0.07]],
    });
    return b;
  },

  // 收束：一个音平收，比 clear 更轻
  settle: function () {
    const b = blank(0.42);
    tone(b, {
      freq: 349.23, dur: 0.42, amp: 0.3, attack: 0.02,
      partials: [[1, 1, 0.18], [2, 0.1, 0.08]],
    });
    return b;
  },

  // 走火：两音下行，同样拉开间隔
  fail: function () {
    const b = blank(0.56);
    tone(b, {
      freq: 174.61, dur: 0.32, amp: 0.32, attack: 0.02,
      partials: [[1, 1, 0.13]],
    });
    tone(b, {
      at: 0.22, freq: 146.83, dur: 0.34, amp: 0.3, attack: 0.02,
      partials: [[1, 1, 0.14]],
    });
    return b;
  },
};

function toWav(samples) {
  const n = samples.length;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + n * 2, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(n * 2, 40);
  return Buffer.concat([head, data]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const names = Object.keys(SOUNDS);
let total = 0;
for (const name of names) {
  seed = 20261111;
  const buf = normalize(soften(SOUNDS[name]()), PEAK);
  const wav = toWav(buf);
  fs.writeFileSync(path.join(OUT_DIR, name + '.wav'), wav);
  total += wav.length;
  console.log('  ' + name.padEnd(7) + (buf.length / SR).toFixed(2) + 's  ' + (wav.length / 1024).toFixed(1) + 'KB');
}
console.log('生成 ' + names.length + ' 个音效，合计 ' + (total / 1024).toFixed(1) + 'KB → assets/sfx/');
