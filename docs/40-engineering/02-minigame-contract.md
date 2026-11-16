# 玩法模块契约（create / lines / teach）

> 一个玩法模块 = 一个 `create(ctx)` 返回控制器 + 一个 `lines(params, gear)` 返回评级线 + 可选一个 `teach.create(ctx)` 教导脚本。此外什么都不要。

## 1. 一句话

页面与玩法之间只有三样东西过手：**`ctx`（进去）**、**`vm`（出来）**、**`finish(result)`（收尾）**。其余全是模块内部的事。

## 2. 契约清单

```js
module.exports = {
  id: 'schulte',          // 必填：与 MODULES 的键一致
  name: '顺序点格',        // 必填：玩家看到的中文玩法名
  create: create,         // 必填：(ctx) => controller
  lines: lines,           // 必填：(params, gear) => { rule, items[], fail }
  teach: { create },      // 可选：首局手把手
};
```

`lines` 是**硬要求**：`verify` 与 `tests/minigames.test.js` 都守着「每个模块必须导出 `lines`」，因为说明页、局内 HUD、结算三处都从它取门槛——**不许在别处再算一遍**。

## 3. `ctx` 的九个字段

页面通过 `createGame(gameId, ctx)` 传进来：

| 字段 | 类型 | 内容 |
| --- | --- | --- |
| `params` | object | `practiceData.buildParams(method, diffKey)` 的结果（盘面规格、时长、罚时…） |
| `difficulty` | `'normal'` \| `'hard'` | **只有两段手感**。真差异全在 `params` 里 |
| `perks` | object | `{ easy, tier, offTwists }`；突破局是 `{ easy: realmIndex >= 2, tier }` |
| `tip` | string | 代价句（`practiceData.tipFor(method, diffKey)`） |
| `twist` | string | 本门玄机的文案名 |
| `theme` | object | 配色与文案：`accent / soft / ink / bg / frame / glyph / motif / banner / praise / miss` |
| `render` | `(vm) => void` | 把 vm 交回页面 `setData` |
| `finish` | `(result) => void` | 终局唯一出口 |
| `index` / 其他 | — | 页面额外塞的上下文 |

**`difficulty` 只有两段**是刻意的：

> 玩法模块只认 `normal` / `hard` 两段手感；真正的五段差异全部落在 `params` 上。

理由：`gear` 只有两值，玩法拿它分不出「困难」与「绝境」，很容易一段一个样。把五段差异做成**参数**（`minOpt` / `capFactor` / `penaltySec`…）比做成 `if (difficulty === 'hard')` 更可测。

## 4. `vm` 协议

`makeVm(cols, cellCount, status, hint)` 给一份完整骨架，模块只填字段。

| 分组 | 字段 |
| --- | --- |
| 盘面 | `cols` / `cells[]` / `stage` |
| 格子 | `cells[i] = { key, label, crest, emblem, cls, tone, arrow, end, endLive }` |
| 阶段专属 | `lane` / `orbit` / `scroll` / `charge` / `ring` / `trail` / `slash` / `pad` / `klotski` |
| HUD | `progress` / `progressText` / `combo` / `comboText` / `goal` / `gradeNow` / `banner` / `timeText` / `scoreText` / `hearts` / `meter` |
| 反馈 | `fx`（浮字）/ `fxSeq` / `cleared`（收走哪几格）/ `clearSeq` |
| 开关 | `extras.showUndo / showHint / showReset / showCharge / showGrid / showRing / showHearts / showMeter / showProgress / showGradeNow / showCombo / showSwipe / showPad / compact` |

### 4.1 `stage` 形态

| `stage` | 形态 | 谁用 |
| --- | --- | --- |
| `board` | 方格 | 大多数 |
| `ring` | 圆盘光环 | 心法·吐纳周天诀 |
| `klotski` | 滑盘 | 机关·移山开路诀 |
| `charge` | 蓄力条 | 突破 |

`common.js` 里还留着 `lane`（竖向河道）/ `orbit`（灯环）/ `scroll`（横向卷轴）三个舞台的数据位，2026-11 删门之后已无玩法使用——渲染链保留，新门要用时直接填这三个字段。

页面按 `stage` 决定渲染哪一块，模块只负责填对应数据。

### 4.2 `costText` 与 `hint` 的坑

`makeVm` 明确记着一条：

> 代价句真源：准备页的 `method.tip` 由第 4 个参数送进来。玩法层若拿 `vm.hint` 显示动态状态，**必须把这一句拼回去，不许整行覆盖**（三秀同收 / 阵灯推演都踩过这个坑）。

正确写法：

```js
vm.hint = costText + ' · 已走 ' + moves + ' 步';
```

错误写法：

```js
vm.hint = '已走 ' + moves + ' 步';   // 代价句没了
```

代价句是「这一门为什么难」，丢了玩家就只剩一个进度数字。

### 4.3 `flash` 与 `fxSeq`

```js
flash(vm, '推了一格', 'good');
```

`fxSeq` 自增、`n` 在 0/1 间交替——**让 wxml 的 class 变化以重播动画**。没有这个自增，同样的浮字连续出现两次，动画只播一次。

### 4.4 `markCleared` 与 `clearSeq`

「这一手收走了哪几格」由**玩法自己交出来**，页面据此在原位迸一小把粒子。

为什么不让页面 diff 盘面：消消乐收完立刻掉落重排，前后两帧的格子都「有牌」，光看盘面分不出「收走了」和「换了一张」。只有玩法自己知道。

同样带自增 key：相邻两次收牌的下标完全可能相同，靠 key 变化才知道要重播。

## 5. `controller` 十三个方法

`fillController({...})` 把没实现的方法补成 `noop`——模块只写自己用得到的。

| 方法 | 谁调 | 干什么 |
| --- | --- | --- |
| `start()` | 页面（倒计时结束） | 真正开局 |
| `tap(index)` | 格子点击 | 主操作 |
| `longpress(index)` | 长按 | 少数玩法 |
| `swipe(path, meta)` | 划动 | 只有顺光扫斩 |
| `move(dir)` | 方向键 | 只有带 `showPad` 的玩法 |
| `setAspect(w/h)` | 页面量到格子矩形后 | 校正箭头 / 白光角度 |
| `undo()` | 撤销按钮 | — |
| `hint()` | 提示按钮 | — |
| `reset()` | 复位按钮 | — |
| `press()` / `release()` | 蓄力 | 只有 charge |
| `abandon()` | 主动收功 | 各门自己决定怎么算 |
| `destroy()` | 页面隐藏 / 重建 | **必须清定时器** |

### 5.1 `destroy` 是最容易漏的一个

`TimerBag` 就是为此存在：

```js
const bag = C.TimerBag();
bag.every(fn, 1000);      // setInterval
bag.after(fn, 520);       // setTimeout
bag.everyFlex(fn, msFn);  // 可变间隔循环
bag.clear();              // 全清
```

页面 `onHide` / 重建控制器时调 `destroy()`，模块里 `destroy() { bag.clear(); }`。

**漏了会怎样**：一局结束后旧定时器还在跑，往一个已经 `setData` 过的 vm 上写数据，表现为「结算卡上数字还在跳」或「返回上一页后还能听到计息音」。

## 6. `finish(result)` —— 唯一出口

```js
ctx.finish({ grade: 'S', score: 1240, summary: '点完 25 格 · 用 21 秒', notes: [...] });
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `grade` | ✓ | `S` / `A` / `B` / `C` / `F` |
| `score` | ✓ | 只用于破纪录，不参与熟练度 |
| `summary` | ✓ | 一句战绩 |
| `notes` | 建议 | 结算卡上的「为什么」与「怎么改」，至少两条 |

**`finish` 只能调一次**。模块内部用 `done` 标记守住：

```js
function finishOnce(grade, summary) {
  if (done) return;
  done = true;
  ...
}
```

多个失败条件（预算耗尽 / 时辰到 / 盘满）都可能触发，没有 `done` 会出现「一局结算两次」。

## 7. `lines(params, gear)` —— 评级线的唯一出处

```js
function lines(p) {
  return {
    rule: '按用时评级（含点错的罚时；点完整盘才算完成）',
    items: ['4×4 盘 · 16 个数 · 点错罚 2 秒', 'S：18 秒内点完', ...],
    fail: '时辰到还没点完 → 走火 F，这一局没有收益',
  };
}
```

三处消费：

1. **说明页**（`topic=practice`）列出本段 S/A/B/C 门槛；
2. **局内 HUD**（模块自己 `lim[0]` / `lim[1]` / `lim[2]`）；
3. **结算**（同一个 `gradeOf()`）。

**三处同源**，所以不会出现「说明页写 18 秒、局内按 20 秒判」。

`fail` 字段是**有失败态的玩法必须给**的：`lines().fail` 出现即说明这一门有 F。没有「达成即结束」事件的玩法（一局有自然终点：时辰到 / 拍数打满 / 段数走完）最低只到 C，它的 `fail` 也要写清。

## 8. `teach.create(ctx)` —— 首局手把手

可选。`hasTeach(gameId)` 为 true 时，第一次开局会先走一段教导脚本：

- 不盖整屏、不遮盘面，就一张窄条说清「这一手做什么」；
- **教学盘不结算、不扣气**，可以照走；
- 当前**只有 1 门有**（阵法·星罗点灯诀的阵灯推演），其余 19 个模块都没有——引导是给「第一手看不懂」的玩法补的，不是给所有玩法硬塞一段过场。

`tests/minigames.test.js` 会驱动每一个 `teach` 脚本走一遍，确认它能走完。

## 9. `lines` 之外不许再算门槛

```js
// verify.js + tests/minigames.test.js 守着：
typeof mod.lines === 'function'
```

这条看着平淡，实际是防止「说明页写一套、局内写一套」的最有效手段。

**反例（历史）**：`gradelines` 曾经在各玩法里手写门槛数组，说明页另有一份。改一次标定要改两处，必然有一处忘记。现在是 `lines()` 现算。

## 10. 新增一门玩法的最小改动集

| # | 改哪 | 做什么 |
| --- | --- | --- |
| 1 | `minigames/xxx.js` | 写 `create` + `lines`（+ 可选 `teach`） |
| 2 | `minigames/index.js` | `MODULES` 加一行 |
| 3 | `data/practice.js` | `PRACTICE_METHODS` 加一门（`game` / `base` / `params` / `tip`）、`GAME_LABELS` 加名字、`FAMILIES` 加形态 |
| 4 | `data/skills.js` | 功法（名、类别、品阶、`bonus`、`effect`、`source`） |
| 5 | `data/visual.js` | `FAMILY_OF` 加一行（漏了会静默落到 sword 兜底，场景辉光与盘面各说各话） |
| 6 | `data/guides.js` | `goal` / `steps` / `terms` / `scoring` / `tip` |
| 7 | `data/practice.js` | 若这一门有阶段新法，加 `STAGE_RULES` |
| 8 | 测试 | `tests/minigames.test.js`（整局驱动）、`tests/rank.test.js`（五段区分度） |
| 9 | 文档 | `docs/20-minigames/` 一篇 + README 矩阵 + 根 README 统计 |

漏第 5 步是最隐蔽的一种：不报错，只是颜色不对。

## 11. 被否决的方案

| 方案 | 为什么否掉 |
| --- | --- |
| 玩法模块自己写存档 | 会绕过熟练度、称号、日志 |
| 页面自己算评级 | 三处口径必然分叉 |
| 用 `difficulty` 直接分五段 | 只有 normal / hard 两值，硬分会一段一个样 |
| 一个模块管两门功法 | 「一门功法一套互不复用的玩法内核」是硬约束 |
| `finish` 可多次调用 | 多个失败条件都会触发，必然重复结算 |
| 不写 `notes` | 玩家不知道「差在哪、怎么改」 |
| `lines` 返回写死的数组 | 改标定要改 20 处 |

## 12. 代码指路

- `minigames/common.js` —— 契约的注释头在文件前 18 行，是这份文档的第一手来源
- `minigames/index.js` —— `MODULES` / `createGame` / `gradeLines` / `hasTeach` / `PRACTICE_GAMES`
- `data/practice.js` —— `buildParams` / `tipFor` / `STAGE_RULES` / 各段位表
- `pages/practice/practice.js:441` —— `buildGame()`，`ctx` 的组装处
- `tests/minigames.test.js` —— 逐门驱动、`teach` 走一遍
- `tests/rank.test.js` —— 逐门复算评级线
- `docs/checklist-puzzle.md` —— 新增玩法前的十二维自检

## 13. 待验

- `charge.js` 是唯一没有 `lines` 的模块，`gradeLines('charge')` 返回 `null`。这说明页 `topic=charge` 用的是另一份手写内容——**这是契约的唯一例外，靠 `PRACTICE_GAMES` 排除它**，但没有断言守着「例外只有 charge 一个」。
- `vm.costText` 与 `vm.hint` 的区分全靠注释约束。哪些模块真的把代价句拼回去了，**没有静态检查**。
- `ctx` 的九个字段是注释约定的，没有 schema。新增字段（如 `index`）散在页面里，玩法侧只能靠读代码知道。
- `setAspect` 只有划刀用，但它在契约里是所有模块的 noop 之一——**新增需要宽高比的玩法时要记得它只在 measureBoard 后被调一次**。
- `extras` 的 14 个开关是布尔堆，没有组合约束（例如 `showGrid: false` 与 `showPad: true` 同时出现意味着什么）。目前靠各模块自觉。
