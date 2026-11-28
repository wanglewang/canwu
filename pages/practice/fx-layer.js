'use strict';

// 玩法特效层：vm 通用信号 → 粒子 / 音效 / 触感。
// 从 practice.js 拆出来（2026-11 架构整改）：玩法层只抛带 key 的通用信号
// （fx / cleared / mineFx / linkPath / linesClear / blocks），这里统一决定长什么样。
// 新增一门玩法只要沿用这些信号，页面与本文件都不必为它开分支；
// 玩法专属的只有「信号类型 → 视觉配置」这张表（如探禁的 mineFx cfg）。

const visual = require('../../data/visual.js');
const sfx = require('../../utils/sfx.js');
const worldData = require('../../data/world.js');

// 盘面样式的作用域钩子：只有这几门在 wxss 里有自己的一套尺寸或配色。
// 不挂到钩子上的门，`.grid--cN .cell` 那套通用规格照旧生效。
const BOARD_CLS = {
  mines: 'board--mines',   // 哑光低亮的一套色（探禁）
  link: 'board--link',     // 竖屏盘形的格子高度（并蒂连枝引）
  match: 'board--match',   // 石皮封印那一档牌的底色（三秀撷英诀·大成起）
};

function heartsToFlags(h) {
  const out = [];
  if (!h) return out;
  for (let i = 0; i < h.max; i += 1) out.push({ id: i, on: i < h.value });
  return out;
}

// 连线：转折点换成「横段 / 竖段」。相邻两点必定同行或同列（minigames/link 里压过共线点），
// 所以只算宽高，不用算角度。坐标是外扩网格，盘外那一圈刚好落在负百分比上。
function linkSegs(linkPath, cols, rows) {
  const out = [];
  if (!linkPath || !linkPath.points || !cols || !rows) return out;
  const pts = linkPath.points.map(function (p) {
    return { x: (p.c - 0.5) / cols * 100, y: (p.r - 0.5) / rows * 100 };
  });
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.abs(a.y - b.y) < 0.01) {
      out.push({ id: i, dir: 'h', left: Math.min(a.x, b.x), top: a.y, len: Math.abs(b.x - a.x) });
    } else {
      out.push({ id: i, dir: 'v', left: a.x, top: Math.min(a.y, b.y), len: Math.abs(b.y - a.y) });
    }
  }
  return out;
}

// 下一块放不进主盘：它是一块 4×4 以内的小形状，摆成固定的四乘四预告格，
// 玩家一眼看出「来的是长条还是方块」。居中对齐，不给旋转、不给颜色之外的信息。
function previewCells(piece) {
  const out = [];
  for (let i = 0; i < 16; i += 1) out.push({ key: i, on: false, tone: 0 });
  if (!piece || !piece.cells || !piece.cells.length) return out;
  let maxR = 0;
  let maxC = 0;
  for (let i = 0; i < piece.cells.length; i += 1) {
    maxR = Math.max(maxR, piece.cells[i][0]);
    maxC = Math.max(maxC, piece.cells[i][1]);
  }
  const offR = Math.floor((4 - (maxR + 1)) / 2);
  const offC = Math.floor((4 - (maxC + 1)) / 2);
  for (let i = 0; i < piece.cells.length; i += 1) {
    const r = piece.cells[i][0] + offR;
    const c = piece.cells[i][1] + offC;
    if (r < 0 || r > 3 || c < 0 || c > 3) continue;
    const k = r * 4 + c;
    out[k].on = true;
    out[k].tone = piece.tone;
  }
  return out;
}

// 特效层实例：持有「上一帧演到哪」的游标与撤场定时器。
// setData / isAlive 由页面注入——本模块不认识 Page，node 里也能直接测。
// 所有撤场定时器收进一个袋里，页面 onUnload 一把清（旧版散在页面上，卸载时漏清）。
function createFxLayer(opts) {
  const setData = opts.setData;
  const isAlive = opts.isAlive;
  let burstId = 0;
  let lastFxKey = 0;
  let lastCombo = 0;
  let lastBeatKey = -1;
  let lastClearKey = 0;
  let lastMineFxKey = 0;
  let lastLineKey = 0;
  let lastLinkKey = 0;
  let lastTones = [];
  const timers = {};

  function scheduleClear(name, field, ms) {
    if (timers[name]) clearTimeout(timers[name]);
    timers[name] = setTimeout(function () {
      timers[name] = null;
      if (!isAlive()) return;
      const patch = {};
      patch[field] = [];
      setData(patch);
    }, ms);
  }

  // 命中爆发：一次判定生成一批粒子，id 自增让 WXML 重建节点，CSS 动画才会重播。
  function makeBurst(level) {
    const dots = [];
    if (level > 0) {
      const n = level >= 3 ? visual.MOTION.particles : level === 2 ? 6 : 4;
      const dist = level >= 3 ? 190 : level === 2 ? 150 : 110;
      for (let i = 0; i < n; i += 1) {
        dots.push({
          id: i,
          a: Math.round(360 * i / n),
          d: dist + (i % 3) * 24,
          delay: (i % 4) * 18,
        });
      }
    }
    burstId += 1;
    return {
      id: burstId,
      level: level,
      dots: dots,
      flash: level === 0 ? 'miss' : level >= 3 ? 'gold' : '',
    };
  }

  // 收牌迸溅：玩法把「这一手收走了哪几格」交上来（vm.cleared），这里按格位算坐标，
  // 在原位炸一小把，颜色取被收走那张牌的纹样色。
  // 为什么不在盘面上做「格子自己炸开」：连连看收完留空格（格子可以演），
  // 消消乐收完立刻掉落重排（格子当场就换了内容，演不出来）。做成独立的浮层，
  // 两门功课才能共用一套；也不会被格子的 overflow 与状态色牵制。
  // 返回 null 表示这一帧没有新迸溅（保持现状）。
  function sparksFrom(vm) {
    const c = vm && vm.cleared;
    if (!c || !c.key || c.key === lastClearKey) return null;
    lastClearKey = c.key;
    const n = vm.cells ? vm.cells.length : 0;
    if (!n || !c.cells || !c.cells.length) return null;
    const cols = vm.cols || 6;
    const rows = Math.max(1, Math.round(n / cols));
    const tones = lastTones || [];
    const hue = visual.CREST_HUE;
    const dots = [];
    const count = visual.MOTION.sparkDots;
    for (let d = 0; d < count; d += 1) {
      dots.push({
        id: d,
        // 角度错开、距离与大小各不相同：等分角度 + 等大会被读成「一圈珠子挂在环上」，
        // 尺寸差一点点就散成了碎屑。偏移量写死（不用随机），同一次收牌每次呈现都一样。
        a: Math.round(360 * d / count + 12 + (d % 2 ? 9 : -6)),
        d: visual.MOTION.sparkDist - (d % 3) * 18,
        size: 16 + (d % 3) * 3,
        mt: -(16 + (d % 3) * 3) / 2,
        delay: (d % 3) * 22,
      });
    }
    const list = [];
    // 一次最多画 2 处、每处 6 粒 = 12 枚，正好用满动效预算（MOTION.particleCap）。
    // 消消乐一把能收十几格，全画就是满屏烟花，既盖住盘面也顶不住低端机的帧；
    // 相邻格本来就会重叠，取前两处已经够表达「刚刚收了一把」。
    for (let k = 0; k < c.cells.length && list.length < 2; k += 1) {
      const i = c.cells[k];
      if (i < 0 || i >= n) continue;
      const tone = tones[i] || 1;
      list.push({
        // key 里带 clearSeq：相邻两次收牌的下标完全可能相同，靠 id 区分才会重播动画。
        id: c.key + '-' + i,
        x: ((i % cols + 0.5) / cols * 100).toFixed(2),
        y: ((Math.floor(i / cols) + 0.5) / rows * 100).toFixed(2),
        color: hue[(tone - 1 + hue.length) % hue.length] || hue[0],
        dots: dots,
      });
    }
    if (!list.length) return null;
    // 动画走完就把节点撤掉：这些粒子是绝对定位的浮层，留着不撤会一直在盘面上堆节点。
    scheduleClear('spark', 'sparkList', visual.MOTION.sparkMs + 80);
    return list;
  }

  // 探禁的盘面反馈。玩法层只抛「哪一手、哪一格」，这里决定长什么样：
  // 翻格是青石屑向外散、踩禁是朱砂冲击环、连开是金色扫光、钉旗是一枚小金圈。
  // 颜色写成字面量是因为粒子靠内联 style 上色（跟 visual.CREST_HUE 同一条路），
  // 不落进 wxss；只有这一门用，不进通用动效表。
  function mineFxFrom(vm) {
    const f = vm && vm.mineFx;
    if (!f || !f.key || f.key === lastMineFxKey) return null;
    lastMineFxKey = f.key;
    const n = vm.cells ? vm.cells.length : 0;
    if (!n) return null;
    const cols = vm.cols || 6;
    const rows = Math.max(1, Math.round(n / cols));
    // 环不越格：盘宽约 690rpx（750 设计稿扣掉页边距），每格 690/cols，再留 6rpx 给格缘。
    // 写死一个直径在 6×6 上正好、到 12×12 就会压住邻格刚翻开的数字。
    const ringSize = Math.min(92, Math.round(690 / cols) - 6);
    const ringHalf = -Math.round(ringSize / 2);
    const i = Math.max(0, Math.min(n - 1, f.index | 0));
    const cfg = {
      reveal: { dots: 7, dist: 88, size: 10, color: '#9fd8cf', life: 440, ring: true },
      strike: { dots: 9, dist: 104, size: 13, color: '#e08a7e', life: 540, ring: true },
      chord: { dots: 6, dist: 76, size: 9, color: '#e6cd8a', life: 380, ring: true },
      flag: { dots: 0, dist: 0, size: 0, color: '#e6cd8a', life: 380, ring: true },
      unflag: { dots: 0, dist: 0, size: 0, color: '#9fc3d4', life: 300, ring: true },
      deny: { dots: 0, dist: 0, size: 0, color: '#e08a7e', life: 320, ring: true },
      tap: { dots: 3, dist: 40, size: 7, color: '#9fd8cf', life: 380, ring: false },
      win: { dots: 10, dist: 130, size: 11, color: '#e6cd8a', life: 900, ring: true },
    }[f.type];
    if (!cfg) return null;
    const dots = [];
    for (let d = 0; d < cfg.dots; d += 1) {
      const size = cfg.size + (d % 3) * 2;
      dots.push({
        id: d,
        a: Math.round(360 * d / cfg.dots + 11 + (d % 2 ? 8 : -5)),
        d: cfg.dist - (d % 3) * 16,
        size: size,
        mt: -size / 2,
        delay: (d % 4) * 18,
      });
    }
    scheduleClear('mine', 'mineFxList', cfg.life + 80);
    return [{
      id: f.key + '-' + f.type,
      type: f.type,
      x: ((i % cols + 0.5) / cols * 100).toFixed(2),
      y: ((Math.floor(i / cols) + 0.5) / rows * 100).toFixed(2),
      color: cfg.color,
      ring: cfg.ring,
      ringSize: ringSize,
      ringHalf: ringHalf,
      dots: dots,
    }];
  }

  // 一帧 vm → 一揽子 setData 补丁。cur 是页面当前的特效数组（没有新信号时保持现状）。
  // ctx: { sceneOn, haptic }。音效 / 触感 / 拍子 / 迸溅全按 vm 通用信号走，不认具体玩法名；
  // 「误判要不要轻震」由玩法模块自己声明（haptic.bad），这里只读声明。
  function frame(vm, cur, ctx) {
    const progress = typeof vm.progress === 'number' ? vm.progress : 0;
    const incense = Math.max(0, Math.min(100, 100 - progress));
    const lampMax = vm.hearts && vm.hearts.max ? vm.hearts.max : 3;
    const lampOn = vm.hearts ? vm.hearts.value : Math.ceil(incense / 34);
    const sceneLamps = [];
    for (let i = 0; i < lampMax; i += 1) sceneLamps.push({ id: i, on: i < lampOn });

    let burstList = cur.burstList;
    // 浮字是玩法里唯一的「判定结果」信号：音效与视觉反馈都跟着它走。
    if (vm.fx && vm.fx.key !== lastFxKey) {
      lastFxKey = vm.fx.key;
      sfx.tone(vm.fx.tone);
      // 触感分两档：金招（重斩 / 连锁）中量；误判只给轻震——是否轻震看玩法声明的 haptic.bad
      // （三连互换的无效互换、阵灯推演触了死门或提示用尽都算）。灵植与阵法要温润沉敛，
      // 没声明的门误判不震，别跟着刀法猛震。
      if (typeof wx !== 'undefined' && wx.vibrateShort) {
        const strong = vm.fx.tone === 'gold';
        const gentle = vm.fx.tone === 'bad' && !!(ctx.haptic && ctx.haptic.bad);
        if (strong || gentle) {
          try { wx.vibrateShort({ type: strong ? 'medium' : (ctx.haptic.bad || 'light') }); } catch (e) { /* 部分环境不支持震动 */ }
        }
      }
      if (ctx.sceneOn) {
        const tone = vm.fx.tone;
        if (tone === 'bad') burstList = [makeBurst(0)];
        else if (tone === 'gold') burstList = [makeBurst(3)];
        else burstList = [makeBurst(1)];
      }
    }
    const combo = parseInt(String(vm.comboText || '').replace(/\D/g, ''), 10) || 0;
    if (ctx.sceneOn && combo !== lastCombo && [5, 10, 20].indexOf(combo) >= 0) {
      burstList = [makeBurst(2)];
    }
    lastCombo = combo;

    // 节律判定：拍子到了就响一声。它不改变玩法（光环照走），只把「数拍」
    // 这件本来就靠耳朵的事交还给耳朵——音效关掉时这一门仍然能靠眼睛打。
    // 小节头那一格给重音：没有强弱，一串哒声里数不出小节线在哪，
    // 第三段起提示轨只剩小节头，玩家就没有任何东西可以锚定第几小节了。
    if (vm.beatKey !== undefined && vm.beatKey !== lastBeatKey) {
      lastBeatKey = vm.beatKey;
      sfx.play(vm.beatAccent ? 'beataccent' : 'beat');
    }

    // 迸溅要在 setData 之前算：它读的是上一帧的纹样快照。
    const sparks = sparksFrom(vm);
    // 探禁的盘面反馈：玩法层带 key 的信号变了才重播，其余门读不到字段直接跳过。
    const mineFx = mineFxFrom(vm);

    // 落石垒基：暂存格 + 三块预告。别的玩法 vm.blocks 为 null，两个数组都是空，
    // 页面不会多摆那一条。
    let nextList = [];
    let holdCells = [];
    if (vm.blocks) {
      holdCells = previewCells(vm.blocks.hold);
      const q = vm.blocks.queue || [];
      for (let qi = 0; qi < q.length; qi += 1) {
        nextList.push({ id: qi, cells: previewCells(q[qi]) });
      }
    }
    // 连连看的连线：只在收走一对的那一帧出现，340ms 后撤。
    let linkPathList = cur.linkPathList;
    if (vm.linkPath && vm.linkPath.key !== lastLinkKey) {
      lastLinkKey = vm.linkPath.key;
      const lk = vm.link;
      linkPathList = linkSegs(vm.linkPath, (lk && lk.cols) || vm.cols, (lk && lk.rows) || 4);
      scheduleClear('link', 'linkPathList', 340);
    }
    // 落石垒基：刚化的行闪一下，460ms 后撤。
    let lineFlashList = cur.lineFlashList;
    if (vm.linesClear && vm.linesClear.key !== lastLineKey) {
      lastLineKey = vm.linesClear.key;
      const rowsN = vm.blocks && vm.blocks.rows ? vm.blocks.rows : 8;
      const key = vm.linesClear.key;
      lineFlashList = vm.linesClear.rows.map(function (r) {
        return {
          id: key + '-' + r,
          top: (r / rowsN * 100).toFixed(2),
          height: (100 / rowsN).toFixed(2),
        };
      });
      scheduleClear('line', 'lineFlashList', 460);
    }

    // 留一份「这一帧每格是第几号纹」给下一帧取色。vm.cells 是同一个对象，
    // 下一帧玩法会把它改写成收走后的样子，到那时就读不到被收走那张牌的颜色了。
    const cells = vm.cells || [];
    const tones = [];
    for (let i = 0; i < cells.length; i += 1) tones.push(cells[i].tone);
    lastTones = tones;

    return {
      vm: vm,
      chargeWidth: vm.charge ? Math.max(0, vm.charge.end - vm.charge.start) : 0,
      gradeNowColor: worldData.GRADE_COLOR[vm.gradeNow] || '#8a8f83',
      heartList: heartsToFlags(vm.hearts),
      meterPercent: vm.meter && vm.meter.max ? Math.round(vm.meter.value / vm.meter.max * 100) : 0,
      slashList: vm.slash ? [vm.slash] : [],
      trailLen: vm.trail ? vm.trail.path.length : 0,
      sceneLamps: sceneLamps,
      incensePercent: incense,
      scoreNum: Number(String(vm.scoreText || '').replace(/\D/g, '')) || 0,
      burstList: burstList,
      sparkList: sparks || cur.sparkList,
      mineFxList: mineFx || cur.mineFxList,
      nextList: nextList,
      holdCells: holdCells,
      lineFlashList: lineFlashList,
      linkPathList: linkPathList,
    };
  }

  // 换局 / 重开：游标归零，否则新局第一次收牌 / 消行 / 连线可能撞上旧 key，
  // 被当成「已经演过了」而不播。
  function resetRound() {
    lastFxKey = 0;
    lastCombo = 0;
    lastBeatKey = -1;
    lastClearKey = 0;
    lastTones = [];
    lastMineFxKey = 0;
    lastLineKey = 0;
    lastLinkKey = 0;
  }

  function fxKey() { return lastFxKey; }

  // 教学盘只要声音，不要粒子 / 触感：学习闭环的一半是「做对了立刻有回应」。
  // 与正式局共用同一组游标与音量，不额外加强。
  function sound(vm) {
    if (vm.fx && vm.fx.key !== lastFxKey) {
      lastFxKey = vm.fx.key;
      sfx.tone(vm.fx.tone);
    }
    if (vm.beatKey !== undefined && vm.beatKey !== lastBeatKey) {
      lastBeatKey = vm.beatKey;
      sfx.play(vm.beatAccent ? 'beataccent' : 'beat');
    }
  }

  function destroy() {
    Object.keys(timers).forEach(function (k) {
      if (timers[k]) { clearTimeout(timers[k]); timers[k] = null; }
    });
  }

  return {
    frame: frame,
    sound: sound,
    resetRound: resetRound,
    fxKey: fxKey,
    destroy: destroy,
  };
}

module.exports = {
  BOARD_CLS: BOARD_CLS,
  createFxLayer: createFxLayer,
};
