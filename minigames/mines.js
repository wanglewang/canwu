'use strict';

// 数格辨禁（勘位辨禁 / 阵法·洞微勘禁诀专属）：经典扫雷，看周围数字推禁制位置，翻遍所有安全石格。
//
// 「洞微勘禁诀应该简单，因为扫雷太经典了」——这里的深耕不是往里塞新规则，而是把经典扫雷
// 之所以好玩的那几件事补齐，规则一个字不加：
//   ① 首点及其八邻无禁制，第一下必开出一片空白，不会开局就被一个数字堵死。
//   ② 整盘「无猜」：布完禁制用约束传播验一遍，确认从首点纯推理能翻完，否则重布。
//      新手不该死在「两格只能猜一个」上，那是扫雷最劝退的地方。
//   ③ 钉阵钉不再只是装饰：点已翻开的数字格，钉数对上就自动连开其余邻格（chord）。
//      不钉钉照样能玩，会用的人才快，所以不破坏「一看就懂」。
//
// 保留下来的本门机制：三盏心神（误触只扣一盏并让那处显形，耗尽即失败）、长按钉阵钉、
// 大成开局勘出禁位。盘面只有数字与两个通用符号（✕ 禁制 / ⚑ 阵钉），不落汉字。
//
// finish.score 一律「越大越好」：engine.applyPractice 按 score > prevBest 记破纪录，
// 旧实现把「耗时秒数」当 score 传出去，越慢反而越容易破纪录，方向是反的。

const C = require('./common.js');
const K = require('./teach-kit.js');

const LAYOUT_TRIES = 64;   // 单格可解布局约占十几分之一，64 次足够；找不到就接受最后一盘，绝不死循环
const HEARTS_BY_DEPTH = [3, 3, 2, 1, 1];
const MINE_GLYPH = '✕';
const FLAG_GLYPH = '⚑';   // 阵钉：长按钉下的记号，仍是个通用符号，不落汉字
// 评级只看用时，所以「按当前用时换算出来的档」在开局那一刻一定是 S。那个字母摆在局内
// 等于骗人：玩家会以为 S 已经到手，之后只会看着它一路往下掉。
// 局内不给档位（extras.showGradeNow = false），只给下一档的时限，让玩家知道在追什么。
//
// 时间线跟着盘面走，方向是「盘大了给足」不是「盘大了还压」：
// 6×6 沿用 25/45/75，9×9 是 56/101/169。复杂度已经交给盘面与禁制数承担，
// 秒表只负责让一局别拖太久——把 9×9 也卡在 25 秒，那不叫难，那叫不可能。
//
// lineScale 是章内的唯一旋钮：data/levels.js 按关把三条线压到 70%（章末第 40 关）。
// 盘面与禁制数只在换章时变，章内 200 关靠这一条收紧——所以它必须真被读走。
// 一度它只是被 buildParamsAt 生成、没有任何人消费，界面照样报「S 线 −3%」，
// 而盘面一关都没变：那是屏幕上的一句谎话。
function gradeLine(n, scale) {
  const base = 25 * (n / 36);
  const k = typeof scale === 'number' ? Math.max(0.5, Math.min(1, scale)) : 1;
  return [Math.round(base * k), Math.round(base * 1.8 * k), Math.round(base * 3 * k)];
}

function create(ctx) {
  const p = ctx.params || {};
  const perks = ctx.perks || {};
  const theme = ctx.theme || {};
  const cols = p.cols || 6;
  const rows = p.rows || 6;
  const n = cols * rows;
  // 本盘的三条时间线：跟着格数走（6×6 是 25/45/75，9×9 是 56/101/169），
  // 再乘章内那一关的 lineScale（第 40 关 70%）。
  const line = gradeLine(n, p.lineScale);
  const depth = Math.max(0, Math.min(4, typeof p.depth === 'number' ? p.depth : 0));
  // 禁制数已由 buildParams 按 goal 缩放过（简单 5 → 绝境 8）。
  // 旧写法在这里又叠一次 hard ? +3，与缩放重复，且 ctx.difficulty 只有 normal / hard
  // 两值，困难 / 极难 / 绝境三档其实是一盘。现在统一交给 depth 与 buildParams。
  const mineCount = Math.min(n - 9, Math.max(3, Math.round(p.mines || 6)));
  const tier = perks.tier || 0;
  const sensedCount = tier >= 5 ? 5 : (tier >= 3 || perks.easy ? 3 : 0);
  // 心神盏数按档收紧：由 buildParams 注入（MINES_HEARTS），HUD 上的灯就是这一档的容错。
  // 模块仍留一份兜底，好让测试探针不带 params 直接 create 也能开出一盘。
  const maxHearts = typeof p.hearts === 'number' ? p.hearts : HEARTS_BY_DEPTH[depth];
  // 提示区只留规则，操作速记交给 guides 的 inline（两行都在讲「长按钉阵钉」是重复的）。
  // 代价句来自准备页的 method.tip；「此盘已验过」是无猜保证，两者都是规则，一起留在提示区。
  const costText = ctx.tip || '误触折 1 盏心神，耗尽即失败';
  // 前段保「无猜」是承诺，后段放开就得说实话——开局就说「不必靠猜」，
  // 玩家撞上 50/50 时只会以为是 bug。
  const guessText = p.allowGuess === true ? '有处两难，得自己定夺' : '此盘已验过，不必靠猜';
  const vm = C.makeVm(cols, n, '点开第一格，禁制才会显形', costText + ' · ' + guessText);
  vm.timeText = '00:00';
  vm.scoreText = '已探 0 / ' + (n - mineCount);
  vm.extras.showHearts = true;
  vm.extras.showGradeNow = false;
  vm.extras.noGuess = false;
  // 阵钉读数是这一门的「第三条线」：盘面数字、盘上阵钉、剩余禁制数三者要对得上，
  // 玩家才知道自己钉多了还是钉少了。只钉不看数，等于少了一半信息。
  vm.extras.showFlags = true;
  vm.flagText = '阵钉 0 / ' + mineCount;
  vm.hearts = { value: maxHearts, max: maxHearts };

  const bag = C.TimerBag();
  let mines = [];
  let mineSet = {};
  let sensedSet = {};
  let numbers = new Array(n).fill(0);
  let revealed = new Array(n).fill(false);
  let exposed = new Array(n).fill(false);
  let flags = new Array(n).fill(false);
  let generated = false;
  let noGuess = false;
  let elapsed = 0;
  let hearts = maxHearts;
  let done = false;
  let started = false;
  let fxSeq = 0;

  // 盘面特效信号：key 自增让页面认出「这是新的一次」重播动画（相邻两次可能点同一格）。
  // 只报「哪一手、哪一格」，粒子与涟漪长什么样交给页面——玩法层不碰样式。
  function fx(type, index) {
    fxSeq += 1;
    vm.mineFx = { key: fxSeq, type: type, index: index };
  }

  function neighbors(i) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
      }
    }
    return out;
  }

  function build(mineList) {
    mines = mineList.slice();
    mineSet = {};
    sensedSet = {};
    for (let i = 0; i < mines.length; i += 1) mineSet[mines[i]] = true;
    for (let i = 0; i < Math.min(sensedCount, mines.length); i += 1) sensedSet[mines[i]] = true;
    numbers = new Array(n).fill(0);
    for (let i = 0; i < mines.length; i += 1) {
      const nb = neighbors(mines[i]);
      for (let j = 0; j < nb.length; j += 1) if (!mineSet[nb[j]]) numbers[nb[j]] += 1;
    }
  }

  // ---------------------------------------------------------------- 布局可解性
  // 只模拟「玩家看得见的信息」，三档推法，都是经典扫雷本来就有的：
  //   ① 单格规则：某数字格周围「未探格数 == 剩余禁制数」→ 全是禁制；剩余 0 → 全安全。
  //   ② 全局约束：整盘「剩余禁制数 == 未探格数」→ 全是禁制；剩余 0 → 全安全。
  //   ③ 两数相减：一处数字的未知格集合若被另一处完全包住，两数之差就是环带里的禁制数；
  //      差 0 → 环带全安全；差 == 环带格数 → 环带全是禁制。沿墙的 1-2-1 是这一族的特例。
  // ①②是「认得数字就会玩」的底线，首两段只用它们；③是真扫雷的进阶推法，
  // 后面几段拿它当段差：规则一个字没加，变的是盘逼不逼你用。求解器记下用了几次。
  // 大成、圆满另放开「无猜」保证：推到卡住时允许出现 50/50，玩家得读概率——
  // 这恰恰是竞技扫雷最难的一块，旧版把它整个拿掉了。判定只验布局，不给玩家提示。
  function flood(rev, known, start) {
    if (mineSet[start] || known[start]) return;
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop();
      if (rev[i] || known[i] || mineSet[i]) continue;
      rev[i] = true;
      if (numbers[i] === 0) {
        const nb = neighbors(i);
        for (let j = 0; j < nb.length; j += 1) {
          if (!rev[nb[j]] && !known[nb[j]] && !mineSet[nb[j]]) stack.push(nb[j]);
        }
      }
    }
  }

  function constraints(rev, known) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      if (!rev[i] || numbers[i] <= 0) continue;
      const nb = neighbors(i);
      const unknown = [];
      let flagged = 0;
      for (let k = 0; k < nb.length; k += 1) {
        const j = nb[k];
        if (known[j]) flagged += 1;
        else if (!rev[j]) unknown.push(j);
      }
      if (unknown.length > 0) out.push({ set: unknown, rest: numbers[i] - flagged });
    }
    return out;
  }

  function allSafeOpen(rev) {
    for (let i = 0; i < n; i += 1) if (!mineSet[i] && !rev[i]) return false;
    return true;
  }

  // 一轮单格规则：返回这一轮有没有推进。
  function basicStep(rev, known) {
    let changed = false;
    const cs = constraints(rev, known);
    for (let k = 0; k < cs.length; k += 1) {
      const c = cs[k];
      if (c.rest === 0) {
        for (let q = 0; q < c.set.length; q += 1) {
          const j = c.set[q];
          if (!rev[j] && !known[j]) { flood(rev, known, j); changed = true; }
        }
      } else if (c.rest === c.set.length) {
        for (let q = 0; q < c.set.length; q += 1) {
          if (!known[c.set[q]]) { known[c.set[q]] = true; changed = true; }
        }
      }
    }
    return changed;
  }

  // 一轮全局约束：剩余禁制数摊到全盘未探格上。这是玩家数一遍旗就能用的推法，
  // 但在收尾阶段往往比逐格盯着数字更快——旧求解器漏了这一路，会把本可推完的盘
  // 误判成「必须猜」，反过来让段差掺进运气。
  function globalStep(rev, known) {
    let flagged = 0;
    let hidden = 0;
    const open = [];
    for (let i = 0; i < n; i += 1) {
      if (known[i]) flagged += 1;
      else if (!rev[i]) { hidden += 1; open.push(i); }
    }
    const rest = mineCount - flagged;
    if (hidden === 0) return false;
    let changed = false;
    if (rest === 0) {
      for (let q = 0; q < open.length; q += 1) {
        if (!rev[open[q]]) { flood(rev, known, open[q]); changed = true; }
      }
    } else if (rest === hidden) {
      for (let q = 0; q < open.length; q += 1) {
        if (!known[open[q]]) { known[open[q]] = true; changed = true; }
      }
    }
    return changed;
  }

  // 一轮「两数相减」：找两处数字的未知格集合的包含关系，用两数之差推外面那一圈。
  // 沿墙的 1-2-1 在这里就是两处相邻数字的包含关系，不必另写一条模式匹配。
  // 一次只落一处结论就返回，让外层按次数记账——段差用的就是这个 deep 计数。
  function pairStep(rev, known) {
    const cs = constraints(rev, known);
    let changed = false;
    for (let a = 0; a < cs.length && !changed; a += 1) {
      for (let b = 0; b < cs.length && !changed; b += 1) {
        if (a === b || cs[a].set.length >= cs[b].set.length) continue;
        const small = cs[a];
        const big = cs[b];
        const bigSet = {};
        for (let q = 0; q < big.set.length; q += 1) bigSet[big.set[q]] = true;
        let subset = true;
        for (let q = 0; q < small.set.length; q += 1) {
          if (!bigSet[small.set[q]]) { subset = false; break; }
        }
        if (!subset) continue;
        const smallSet = {};
        for (let q = 0; q < small.set.length; q += 1) smallSet[small.set[q]] = true;
        const ring = [];
        for (let q = 0; q < big.set.length; q += 1) {
          if (!smallSet[big.set[q]]) ring.push(big.set[q]);
        }
        if (ring.length === 0) continue;
        const rest = big.rest - small.rest;
        if (rest < 0) continue;
        if (rest === 0) {
          for (let q = 0; q < ring.length; q += 1) {
            if (!rev[ring[q]] && !known[ring[q]]) { flood(rev, known, ring[q]); changed = true; }
          }
        } else if (rest === ring.length) {
          for (let q = 0; q < ring.length; q += 1) {
            if (!known[ring[q]]) { known[ring[q]] = true; changed = true; }
          }
        }
      }
    }
    return changed;
  }

  // 返回 { ok, deep }：deep 是这一盘逼玩家动用了几次「两数相减」。
  // allowPair=false 时只走单格规则，首两段靠它保证「一眼就会」。
  // allowGlobal 只给后两段：前段承诺「认得数字就能推完」，全局数旗要额外一步，
  // 启用它会让标了无猜的盘纯单格推不完——承诺就破了。
  function solvable(startIdx, allowPair, allowGlobal) {
    const rev = new Array(n).fill(false);
    const known = new Array(n).fill(false);
    flood(rev, known, startIdx);
    if (allSafeOpen(rev)) return { ok: true, deep: 0 };
    let deep = 0;
    for (let pass = 0; pass < 24; pass += 1) {
      let guard = 0;
      while (guard < 32) {
        const g = allowGlobal && globalStep(rev, known);
        const b = basicStep(rev, known);
        if (!g && !b) break;
        guard += 1;
        if (allSafeOpen(rev)) return { ok: true, deep: deep };
      }
      if (allSafeOpen(rev)) return { ok: true, deep: deep };
      if (!allowPair || !pairStep(rev, known)) return { ok: false, deep: deep };
      deep += 1;
      if (allSafeOpen(rev)) return { ok: true, deep: deep };
    }
    return { ok: allSafeOpen(rev), deep: deep };
  }

  function firstZone(i) {
    const zone = {};
    zone[i] = true;
    const nb = neighbors(i);
    for (let k = 0; k < nb.length; k += 1) zone[nb[k]] = true;
    return zone;
  }

  // 首点会翻开多少格：用来挡掉「一落手就全开」的退化盘——那等于 0 秒拿 S，
  // 玩家一局什么都没推演。与 revealFrom 同一套扩散规则，只数不写。
  function floodCount(startIdx) {
    const seen = {};
    const stack = [startIdx];
    let k = 0;
    while (stack.length > 0) {
      const i = stack.pop();
      if (seen[i] || mineSet[i]) continue;
      seen[i] = true;
      k += 1;
      if (numbers[i] === 0) {
        const nb = neighbors(i);
        for (let j = 0; j < nb.length; j += 1) if (!seen[nb[j]]) stack.push(nb[j]);
      }
    }
    return k;
  }

  function tryLayout(startIdx) {
    const zone = firstZone(startIdx);
    const candidates = [];
    for (let i = 0; i < n; i += 1) if (!zone[i]) candidates.push(i);
    if (candidates.length < mineCount) return false;
    C.shuffle(candidates);
    build(candidates.slice(0, mineCount));
    return true;
  }

  function generate(startIdx) {
    const needDeep = typeof p.deduce === 'number' ? Math.max(0, Math.min(3, p.deduce | 0)) : 0;
    // 大成、圆满放开无猜：推到卡住时允许留下 50/50，玩家得自己读概率。
    // 这是竞技扫雷最难的一块，旧版「整门保证无猜」等于把它整块拿掉。
    const allowGuess = p.allowGuess === true;
    // 高阶盘的命中率比基础盘低：单格规则刚卡住时未必凑得出包含关系。
    // 按需要的步数放大尝试次数，但设硬上限，绝不死循环。
    const tries = LAYOUT_TRIES * (needDeep > 0 ? (3 + needDeep) : 1);
    for (let t = 0; t < tries; t += 1) {
      if (!tryLayout(startIdx)) break;
      // 首点就把整盘开完的退化盘照旧挡掉：0 秒拿 S 等于没参悟。
      if (floodCount(startIdx) >= n - mineCount) continue;
      const res = solvable(startIdx, needDeep > 0, allowGuess);
      // 前段保证「纯推理能推完」；大成、圆满反过来保证推到卡住——求解器只剩
      // 基础/全局/差分三招时推不动，玩家得用更活的约束或读概率。大成 10×10
      // 实测 11/12 有猜，圆满 12×12 反而只有 4/12（盘大约束多），不强制就段差倒挂。
      if (allowGuess ? res.ok : !res.ok) continue;
      // 允许猜不等于放水：即使卡住，卡住前也必须逼出 needDeep 次两数相减，
      // 否则「因为有猜所以随便通过」会把段差抹平。
      if (res.deep < needDeep) continue;
      noGuess = res.ok;
      break;
    }
    generated = true;
    vm.extras.noGuess = noGuess;
    vm.extras.deduce = needDeep;
    vm.status = noGuess
      ? (needDeep > 0 ? '此盘不必猜 · 两处数字合起来看' : '此盘不必猜 · 逐格翻开')
      : '有处两难 · 先推能定的，余下再赌一把';
  }

  // ---------------------------------------------------------------- 视图与结算
  function render() { ctx.render(vm); }

  function openedCount() {
    let k = 0;
    for (let i = 0; i < n; i += 1) if (revealed[i]) k += 1;
    return k;
  }

  function gradeTime(t) {
    if (t <= line[0]) return 'S';
    if (t <= line[1]) return 'A';
    if (t <= line[2]) return 'B';
    return 'C';
  }

  // 局内的目标句：只讲「下一档还差几秒」，不讲「还剩几格」——还剩几格和上面那个
  // 「已探 X / Y」是同一个数的两种说法，讲两遍只是让 HUD 更挤。
  // 三条线是共用规则，落在 common.paceGoal 里；这里只丢参数，别再造一份。

  // 越大越好：探明格数 ×10，扣用时与误触。与 engine 的破纪录比较方向一致。
  function scoreOf() {
    return Math.max(0, Math.round((n - mineCount) * 10 - elapsed * 2 - (maxHearts - hearts) * 60));
  }

  function flagCount() {
    let k = 0;
    for (let i = 0; i < n; i += 1) if (flags[i]) k += 1;
    return k;
  }

  function syncHud() {
    const opened = openedCount();
    const safeTotal = n - mineCount;
    const flagged = flagCount();
    vm.timeText = C.mmss(elapsed);
    vm.progress = C.pct(opened, safeTotal);
    vm.progressText = opened + ' / ' + safeTotal + ' 格';
    vm.scoreText = '已探 ' + opened + ' / ' + safeTotal;
    // 钉超了也照实报（7 / 6），不替玩家修正——「钉多了」本身就是一条线索。
    vm.flagText = '阵钉 ' + flagged + ' / ' + mineCount;
    vm.hearts = { value: hearts, max: maxHearts };
    vm.goal = C.paceGoal(elapsed, line);
  }

  function paint() {
    for (let i = 0; i < n; i += 1) {
      if (revealed[i]) {
        const num = numbers[i];
        vm.cells[i].cls = 'cell cell--open';
        vm.cells[i].label = num > 0 ? String(num) : '';
        // 数字按大小分色（1/2/3+ 三档）：扫一眼就能看出 1 与 2 的边界，
        // 这是经典扫雷里唯一值得照搬的辅助，比把数字画成花纹更能读。
        vm.cells[i].tone = num >= 3 ? 3 : num;
        vm.cells[i].emblem = 0;
      } else if (exposed[i] || sensedSet[i]) {
        vm.cells[i].cls = 'cell cell--mine';
        vm.cells[i].label = MINE_GLYPH;
        vm.cells[i].tone = 0;
        vm.cells[i].emblem = 17;
      } else if (flags[i]) {
        vm.cells[i].cls = 'cell cell--flag';
        vm.cells[i].label = FLAG_GLYPH;
        vm.cells[i].tone = 0;
        vm.cells[i].emblem = 16;
      } else {
        vm.cells[i].cls = 'cell cell--hidden';
        vm.cells[i].label = '';
        vm.cells[i].tone = 0;
        vm.cells[i].emblem = 0;
      }
    }
  }

  function finishOnce(grade, summary, failed) {
    if (done) return;
    done = true;
    bag.clear();
    vm.phase = 'done';
    vm.status = '参悟已毕';
    vm.banner = grade === 'S' ? (theme.praise || '步步不惊') : '';
    render();
    ctx.finish({
      grade: grade,
      score: failed ? Math.round(scoreOf() * 0.3) : scoreOf(),
      summary: summary,
    });
  }

  function revealFrom(start) {
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop();
      if (revealed[i] || flags[i] || exposed[i] || sensedSet[i] || mineSet[i]) continue;
      revealed[i] = true;
      if (numbers[i] === 0) {
        const nb = neighbors(i);
        for (let j = 0; j < nb.length; j += 1) {
          if (!revealed[nb[j]] && !flags[nb[j]] && !mineSet[nb[j]]) stack.push(nb[j]);
        }
      }
    }
  }

  function checkWin() {
    if (done) return true;
    for (let i = 0; i < n; i += 1) {
      if (!mineSet[i] && !revealed[i]) return false;
    }
    fx('win', Math.floor(n / 2));
    finishOnce(gradeTime(elapsed), elapsed + ' 秒探明秘境');
    return true;
  }

  function strikeMine(index) {
    hearts -= 1;
    exposed[index] = true;
    flags[index] = false;
    vm.status = theme.miss || '触了禁制';
    fx('strike', index);
    C.flash(vm, '心神 -1 · 禁制显形', 'bad');
    paint();
    syncHud();
    if (hearts <= 0) {
      // 心神耗尽＝这一局没探完，是失败不是粗浅：粗浅是探完了但慢。
      finishOnce('F', '心神耗尽，这一局没探完', true);
      return;
    }
    render();
  }

  // 经典扫雷的 chord：数字格周围钉数对上，一键连开其余邻格。
  // 钉错位置照样会踩到禁制，按误触规矩扣心神，不替玩家兜底。
  function chord(index) {
    if (!revealed[index] || numbers[index] <= 0) return;
    const nb = neighbors(index);
    let marked = 0;
    const pending = [];
    for (let k = 0; k < nb.length; k += 1) {
      const j = nb[k];
      if (flags[j] || exposed[j] || sensedSet[j]) marked += 1;
      else if (!revealed[j]) pending.push(j);
    }
    if (pending.length === 0) return;
    if (marked !== numbers[index]) {
      // 这句以前只写进 vm.status，而 HUD 那行是 goal || status —— goal 一直有值，
      // 所以它从来没露过面。改成浮字，玩家才知道为什么点了没动静。
      vm.status = '阵钉未合';
      fx('deny', index);
      C.flash(vm, '阵钉未合 · 先钉再点数字格', 'bad');
      render();
      return;
    }
    let opened = 0;
    for (let k = 0; k < pending.length && !done; k += 1) {
      const j = pending[k];
      if (mineSet[j]) strikeMine(j);
      else if (!revealed[j]) { revealFrom(j); opened += 1; }
    }
    if (done) return;
    paint();
    syncHud();
    if (opened > 0) {
      fx('chord', index);
      C.flash(vm, '阵光连开 ' + opened + ' 格', 'good');
    }
    if (checkWin()) return;
    render();
  }

  function start() {
    if (started) return;
    started = true;
    vm.phase = 'playing';
    vm.status = '点开第一格，禁制才会显形';
    vm.banner = theme.banner || '';
    // 故意不在开局布雷：首点位置必须由玩家决定，那一格及其八邻才不会藏禁制。
    paint();
    syncHud();
    render();
    bag.every(function () {
      if (done) return;
      elapsed += 1;
      syncHud();
      render();
    }, 1000);
  }

  function tap(index) {
    if (done || vm.phase !== 'playing') return;
    if (!generated) generate(index);
    if (revealed[index]) { chord(index); return; }
    if (flags[index] || exposed[index]) return;
    if (sensedSet[index]) {
      vm.status = '此处已照见禁制';
      C.flash(vm, '此处已照见禁制 · 不必再点', 'bad');
      render();
      return;
    }
    if (mineSet[index]) {
      strikeMine(index);
      if (done) return;
      paint();
      syncHud();
      render();
      return;
    }
    const before = openedCount();
    revealFrom(index);
    const got = openedCount() - before;
    paint();
    syncHud();
    // 开出一片与只开一格，是两种手感：前者该有「石面裂开」的分量，后者才是「无事」。
    // 以前两处都报「石格无事」，推对了一整片也看不出推对了。
    fx(got > 1 ? 'reveal' : 'tap', index);
    C.flash(vm, got > 1 ? '石开 ' + got + ' 格' : (theme.hit || '石格无事'), 'good');
    if (checkWin()) return;
    render();
  }

  function longpress(index) {
    if (done || vm.phase !== 'playing' || revealed[index] || exposed[index] || sensedSet[index]) return;
    flags[index] = !flags[index];
    fx(flags[index] ? 'flag' : 'unflag', index);
    paint();
    syncHud();
    render();
  }

  syncHud();
  render();
  return C.fillController({
    start: start,
    tap: tap,
    longpress: longpress,
    abandon: function () { finishOnce('F', '中途结束', true); },
    destroy: function () { bag.clear(); },
  });
}

function lines(p) {
  const depth = Math.max(0, Math.min(4, (p && p.depth) || 0));
  const hearts = (p && typeof p.hearts === 'number') ? p.hearts : HEARTS_BY_DEPTH[depth];
  const cols = (p && p.cols) || 6;
  const rows = (p && p.rows) || 6;
  const line = gradeLine(cols * rows, p && p.lineScale);
  return {
    rule: '按探完全盘的用时（本段 ' + hearts + ' 盏心神，'
      + (hearts === 1 ? '折了即失败' : '折了扣结算分，耗尽即失败') + '）',
    items: ['本段 ' + cols + '×' + rows + ' 盘 · ' + ((p && p.mines) || 6) + ' 处禁制 · ' + hearts + ' 盏心神',
      'S ≤ ' + line[0] + ' 秒', 'A ≤ ' + line[1] + ' 秒',
      'B ≤ ' + line[2] + ' 秒', '其余为 C'],
    fail: '本段 ' + hearts + ' 盏心神全折（禁制没探完）→ 失败 F，这一局没有收益',
  };
}

// 引导按段走。首段三格见方、只有一颗禁制，摆在角上：让玩家点开正中，
// 盘上露出一个「1」——那一个数就是这一门全部规则的种子：数字＝周围八格里的禁制数。
// 第二步再点开一格，让两片数字连起来：一个 1 只能说明一颗，两片连起来才能推。
//
// 段界那四盘按本段真实规格摆（6×6 到 9×9、禁制 5 到 12 颗）：盘变大这件事讲不出来，
// 只能让他真的在一片 9×9 上找那颗 1。禁制位置固定不随机——教学盘要求同一段每次一样。
const TEACH_LEVELS = [
  { cols: 6, rows: 6, mines: 5, hearts: 3 },
  { cols: 6, rows: 6, mines: 6, hearts: 3 },
  { cols: 7, rows: 7, mines: 8, hearts: 3 },
  { cols: 8, rows: 8, mines: 10, hearts: 2 },
  { cols: 9, rows: 9, mines: 12, hearts: 2 },
];

// 固定撒点：步长与格数互质，取前 K 个不重复的格。与 Math.random 无关，
// 同一段每次进来禁制都在同一个位置——否则「呼吸的那一格」每局换地方，教学就成了碰运气。
function teachField(spec) {
  const n = spec.cols * spec.rows;
  const mines = [];
  const seen = {};
  for (let k = 0; mines.length < spec.mines && k < n * 4; k += 1) {
    const idx = (k * 7 + 3) % n;
    if (seen[idx]) continue;
    seen[idx] = true;
    mines.push(idx);
  }
  const isMine = [];
  for (let i = 0; i < n; i += 1) isMine.push(mines.indexOf(i) >= 0);
  const nums = [];
  for (let i = 0; i < n; i += 1) {
    if (isMine[i]) { nums.push(0); continue; }
    let c = 0;
    const r = Math.floor(i / spec.cols);
    const q = i % spec.cols;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = q + dc;
        if (rr < 0 || cc < 0 || rr >= spec.rows || cc >= spec.cols) continue;
        if (isMine[rr * spec.cols + cc]) c += 1;
      }
    }
    nums.push(c);
  }
  return { isMine: isMine, nums: nums };
}

// 挑两个「该点开的格」：第一格取数字最小的安全格（数字越小越好讲），
// 第二格取离它最近的另一个安全格。两格都一定不是禁制。
function pickOpens(spec, field) {
  const first = [];
  for (let i = 0; i < field.nums.length; i += 1) {
    if (!field.isMine[i] && field.nums[i] > 0) first.push(i);
  }
  first.sort(function (a, b) {
    if (field.nums[a] !== field.nums[b]) return field.nums[a] - field.nums[b];
    return a - b;
  });
  const a = first[0];
  let b = -1;
  for (let i = 0; i < first.length; i += 1) {
    if (first[i] !== a) { b = first[i]; break; }
  }
  return [a, b];
}

function createTeach(ctx) {
  const stage = Math.max(0, Math.min(4, (ctx && ctx.stage) | 0));
  // 首段用 3×3 的小盘：一颗禁制、一个 1，规则干净得能一眼看完。
  const spec = stage === 0 ? { cols: 3, rows: 3, mines: 1, hearts: 3 } : TEACH_LEVELS[stage];
  const field = teachField(spec);
  const opens = stage === 0 ? [4, 0] : pickOpens(spec, field);
  const n = spec.cols * spec.rows;
  const cells = K.blank(spec.cols, n);
  const opened = [];
  const steps = [];
  const count = stage === 0 ? 2 : 1;
  for (let i = 0; i < count; i += 1) {
    steps.push({
      at: [opens[i]],
      text: i === 0
        ? '点开这一格 · 首点不会踩到禁制'
        : '再点开它旁边这一格 · 两片数字连起来才推得出',
      take: (function (idx) {
        return function () {
          opened.push(idx);
          const num = field.nums[idx];
          return {
            text: num
              ? '这一格是 ' + num + ' · 它周围八格里有 ' + num + ' 颗禁制'
              : '这一格是空的 · 八格里一颗禁制都没有',
          };
        };
      })(opens[i]),
    });
  }
  return K.run(ctx, {
    cols: spec.cols,
    cells: cells,
    status: stage === 0
      ? '教学 · 数出禁制在哪一格'
      : '教学 · 这一段 ' + spec.cols + '×' + spec.rows + ' · ' + spec.mines + ' 颗禁制',
    steps: steps,
    paint: function (vm) {
      for (let i = 0; i < n; i += 1) {
        const c = cells[i];
        const open = opened.indexOf(i) >= 0 && !field.isMine[i];
        c.cls = open ? 'cell cell--open' : 'cell cell--hidden';
        c.label = open && field.nums[i] ? String(field.nums[i]) : '';
        c.tone = open ? Math.min(3, field.nums[i]) : 0;
        c.emblem = 0;
      }
    },
    doneText: stage === 0
      ? '中心那个 1 说明八格里只有一颗禁制 · 就压在角上'
      : '这一段 ' + spec.cols + '×' + spec.rows + ' · ' + spec.mines + ' 颗禁制 · '
        + spec.hearts + ' 盏心神，' + (spec.hearts === 1 ? '踩一次就结束' : '踩一次少一盏')
        + (stage >= 2 ? ' · 小成起盘面会逼你用两处数字相减' : '')
        + (stage >= 3 ? ' · 大成起留有两难处，得自己定夺' : ''),
  });
}

const teach = { create: createTeach };

module.exports = {
  id: 'mines', name: '数格辨禁', create: create, lines: lines, teach: teach,
  HEARTS_BY_DEPTH: HEARTS_BY_DEPTH,
};
