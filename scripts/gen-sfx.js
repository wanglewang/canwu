'use strict';

// 零依赖合成局内音效：16kHz / 16bit / 单声道 PCM WAV。
// 用法：node scripts/gen-sfx.js
// 输出：assets/sfx/*.wav（约 110KB，全部由代码合成，仓库里不留二进制来源）
//
// 音色思路：不用方波电子音，走「木鱼 / 磬 / 铃 / 气声」的修真质地——
// 每个音由若干非整数倍分音叠加，各自带指数衰减，起音加一小段噪声做击弦感。

const fs = require('fs');
const path = require('path');

const SR = 16000;
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
  const attack = opt.attack === undefined ? 0.004 : opt.attack;
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

// 一阶低通白噪：只用来做「击」「擦」的瞬态，音高感靠上面的分音。
function noiseBurst(buf, opt) {
  const at = Math.round((opt.at || 0) * SR);
  const n = Math.min(buf.length - at, Math.round(opt.dur * SR));
  const a = opt.smooth === undefined ? 0.5 : opt.smooth;
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
    const env = Math.min(1, t / 0.012) * Math.exp(-t / (opt.decay || 0.1));
    buf[at + i] += opt.amp * env * Math.sin(phase);
  }
}

function normalize(buf, peak) {
  let max = 0;
  for (let i = 0; i < buf.length; i += 1) max = Math.max(max, Math.abs(buf[i]));
  if (max <= 0) return buf;
  const k = peak / max;
  for (let i = 0; i < buf.length; i += 1) buf[i] *= k;
  return buf;
}

// 末尾 8ms 淡出，避免截断爆音。
function tail(buf) {
  const n = Math.min(buf.length, Math.round(0.008 * SR));
  for (let i = 0; i < n; i += 1) {
    const idx = buf.length - 1 - i;
    buf[idx] *= i / n;
  }
  return buf;
}

const SOUNDS = {
  // 落子：木鱼轻击
  tap: function () {
    const b = blank(0.12);
    tone(b, {
      freq: 660, dur: 0.12, amp: 0.5,
      partials: [[1, 1, 0.035], [1.86, 0.45, 0.018], [3.1, 0.22, 0.01]],
    });
    noiseBurst(b, { dur: 0.012, amp: 0.16, decay: 0.005, smooth: 0.55 });
    return b;
  },

  // 成算：磬，单音 D5
  hit: function () {
    const b = blank(0.42);
    tone(b, {
      freq: 587.33, dur: 0.42, amp: 0.42,
      partials: [[1, 1, 0.17], [2.01, 0.34, 0.09], [2.76, 0.17, 0.05], [5.4, 0.07, 0.03]],
    });
    noiseBurst(b, { dur: 0.01, amp: 0.1, decay: 0.004 });
    return b;
  },

  // 失手：闷响，低而短
  miss: function () {
    const b = blank(0.26);
    tone(b, {
      freq: 155.56, dur: 0.26, amp: 0.5,
      partials: [[1, 1, 0.1], [1.5, 0.22, 0.06], [2.02, 0.1, 0.035]],
    });
    noiseBurst(b, { dur: 0.03, amp: 0.22, decay: 0.012, smooth: 0.28 });
    return b;
  },

  // 金锋 / 大得：双铃，一先一后
  gold: function () {
    const b = blank(0.55);
    tone(b, {
      freq: 1046.5, dur: 0.5, amp: 0.32,
      partials: [[1, 1, 0.2], [2.01, 0.26, 0.09], [3.9, 0.09, 0.04]],
    });
    tone(b, {
      at: 0.05, freq: 1568, dur: 0.48, amp: 0.22,
      partials: [[1, 1, 0.17], [2.02, 0.2, 0.07]],
    });
    noiseBurst(b, { dur: 0.012, amp: 0.06, decay: 0.005 });
    return b;
  },

  // 倒数：一声短铃
  tick: function () {
    const b = blank(0.09);
    tone(b, {
      freq: 880, dur: 0.09, amp: 0.34,
      partials: [[1, 1, 0.022], [2.4, 0.3, 0.012]],
    });
    return b;
  },

  // 起手：剑气上扬
  go: function () {
    const b = blank(0.34);
    sweep(b, { from: 300, to: 780, dur: 0.24, amp: 0.3, decay: 0.14 });
    tone(b, {
      freq: 110, dur: 0.2, amp: 0.34, attack: 0.006,
      partials: [[1, 1, 0.08], [2, 0.2, 0.04]],
    });
    noiseBurst(b, { dur: 0.16, amp: 0.12, decay: 0.05, smooth: 0.35 });
    return b;
  },

  // 圆满：C5 E5 G5 上行三音
  clear: function () {
    const b = blank(0.8);
    const notes = [[523.25, 0], [659.25, 0.075], [783.99, 0.15]];
    for (let i = 0; i < notes.length; i += 1) {
      tone(b, {
        at: notes[i][1], freq: notes[i][0], dur: 0.62, amp: 0.28,
        partials: [[1, 1, 0.24], [2, 0.28, 0.12], [3.01, 0.1, 0.06]],
      });
    }
    return b;
  },

  // 收束：G4 C5 两音平收，音量更低
  settle: function () {
    const b = blank(0.62);
    tone(b, {
      freq: 392, dur: 0.5, amp: 0.26,
      partials: [[1, 1, 0.2], [2.01, 0.24, 0.1]],
    });
    tone(b, {
      at: 0.1, freq: 523.25, dur: 0.5, amp: 0.24,
      partials: [[1, 1, 0.2], [2.01, 0.2, 0.09]],
    });
    return b;
  },

  // 走火：下行两个低音
  fail: function () {
    const b = blank(0.62);
    tone(b, {
      freq: 220, dur: 0.4, amp: 0.36,
      partials: [[1, 1, 0.16], [1.5, 0.24, 0.1], [2.02, 0.1, 0.05]],
    });
    tone(b, {
      at: 0.14, freq: 174.61, dur: 0.46, amp: 0.34,
      partials: [[1, 1, 0.18], [1.5, 0.2, 0.1]],
    });
    noiseBurst(b, { dur: 0.14, amp: 0.1, decay: 0.04, smooth: 0.25 });
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
  const buf = tail(normalize(SOUNDS[name](), 0.82));
  const wav = toWav(buf);
  fs.writeFileSync(path.join(OUT_DIR, name + '.wav'), wav);
  total += wav.length;
  console.log('  ' + name.padEnd(7) + (buf.length / SR).toFixed(2) + 's  ' + (wav.length / 1024).toFixed(1) + 'KB');
}
console.log('生成 ' + names.length + ' 个音效，合计 ' + (total / 1024).toFixed(1) + 'KB → assets/sfx/');
