# 包体、渲染、计算预算

> 三条预算：**包体 2MB 主包**、**同时动画 3 路 / 粒子 8 个**、**开局不阻塞首帧**。超预算不是「慢一点」，是某些机型直接掉帧或白屏。

## 核心前提：预算是硬线，不是「尽量」

我把性能写成三条硬预算，是因为目标玩家是在地铁上、用不一定高端的手机玩。对他们来说，超预算不是「慢一点」这种可以忍的事，是某些机型直接掉帧或白屏——一次白屏就够让人关掉小程序不再打开。

三条线各有各的守法。包体靠 `packOptions.ignore` 和 base64 内联压住，文档和脚本不打进包里；渲染靠 `MOTION` 里的常量卡死，粒子 8 个、循环 3 路，超了就是掉帧；计算靠「把 BFS 放在开局后」藏起来——那 3-2-1 倒计时不只是仪式感，它顺便给了 BFS 一个藏身之处。

我尤其坚持「一次性动画不循环」。盘面上任何一个循环动画，在 20 局连刷时会一直占着合成层。预算的意义就在这里：它管的不只是「这一局流不流畅」，而是「连刷二十局之后还流不流畅」。

## 1. 概述

包体靠 `packOptions.ignore` 与 base64 内联控制，渲染靠硬预算常量控制，计算靠「把 BFS 放在开局后」控制。

## 2. 包体

### 2.1 五类目录被排除

```json
"packOptions": { "ignore": [
  { "type": "folder", "value": ".workbuddy" },
  { "type": "folder", "value": "node_modules" },
  { "type": "folder", "value": "tests" },
  { "type": "folder", "value": "scripts" },
  { "type": "folder", "value": "docs" },
  { "type": "folder", "value": ".github" },
  { "type": "suffix", "value": ".md" },
  { "type": "file",   "value": "eslint.config.js" },
  { "type": "file",   "value": "package-lock.json" },
  { "type": "file",   "value": "assets/crest.png" },
  { "type": "file",   "value": "assets/emblems.png" }
] }
```

`docs/` 被排除意味着**新增几十篇文档不影响包体**——这是本目录敢写 146 篇的前提。

### 2.2 两张 sprite 被排除，因为已经 base64 内联

| 文件 | 原始 PNG | 内联后 wxss |
| --- | --- | --- |
| `assets/crest.png` | 27.9 KB | `styles/crest.wxss` 39.3 KB |
| `assets/emblems.png` | 35.7 KB | `styles/emblems.wxss` 51.5 KB |

base64 膨胀约 33%。但这两张 PNG 同时被 `ignore` 掉，所以**不会重复打包**。

**为什么不直接引用图片路径**：项目的做法是「wxss 里不引用包内图片」，全部走 base64。代价是 wxss 变大 33%，收益是切图位置与样式在同一条声明里，且不需要处理路径拼接。

### 2.3 体积分布（粗测）

| 目录 | 约 |
| --- | --- |
| `pages/` | 372 KB |
| `minigames/` | 296 KB |
| `data/` | 212 KB |
| `utils/` | 152 KB |
| `styles/` | 144 KB |
| `components/` | 53 KB |
| `assets/`（音频 + tab 图标） | 122 KB |
| **合计** | **约 1.35 MB** |

主包上限 2 MB，还有约 650 KB 余量。

## 3. 渲染预算

```js
// data/visual.js
MOTION = {
  particles: 8, particleCap: 12,
  loops: 3,
  hitMs: 180, missMs: 120, slashMs: 260,
  blurMax: 12,
  cloudSec: 18, qiSec: 12,
  sparkDots: 6, sparkDist: 148, sparkMs: 500,
};
```

**这是硬预算，不是建议值**。

### 3.1 只动 `transform` 与 `opacity`

动 `width` / `height` / `top` / `left` 会触发重排；`transform` / `opacity` 只走合成层。

`tests/layout.test.js` 有一条断言守着「舞台动画只动 transform / opacity，不超循环预算」。

### 3.2 一次性 vs 循环

| 类型 | 例 | 约束 |
| --- | --- | --- |
| 一次性 | `cellEtch` 420ms、迸溅 500ms | `animation: ... 1 forwards`，不循环 |
| 循环 | 云飘 18s、气机 12s | 最多 **3 路**同时跑 |

**「一次性」是关键**：盘面上任何一个循环动画，在 20 局连刷时会一直占着合成层。

### 3.3 粒子上限

```js
particles: 8,     // 同时存在
particleCap: 12,  // 上限，超过不再生成
sparkDots: 6,     // 一处迸溅几粒
```

一次大消除如果能生成上百个节点，低端机当场掉帧。上限让「多消几个」不会线性增加节点数。

## 4. 计算预算

### 4.1 滑块让路的 BFS

```js
// 40 次抽样 × 每次 BFS（上限 maxOpt + 6 层）
for (let t = 0; t < 40 && !pick; t += 1) {
  const steps = solve(cand, SHAPES, cols, rows, maxOpt + 6);
  ...
}
```

圆满段 `maxOpt = 12`，BFS 上限 18 层——在 4×4 的滑块状态空间里，18 层 BFS 是毫秒级。

**风险点**：这是在 `create()` 里同步做的，也就是**页面切进参悟页的那一刻**。低端机上首次进入可能感觉「卡一下」。

用 CPU 换正确性（不手写最优步数），这是明确取舍。

### 4.2 推石入位的 `solve()`

按「推一次算一步」做 BFS，上限 80 层——但状态空间是「玩家位置 × 箱子集合」，6×7 的盘上远小于滑块。同样在 `create()` 里做。

### 4.3 九宫填数的生成

生成数独需要回溯。它的成本比前两个高，但只在开局跑一次。

### 4.4 开局不阻塞首帧

页面进参悟页的顺序是：

```
refresh()（同步，给页面数据）→ buildGame()（同步，含 BFS）
```

`buildGame` 之后还有 3-2-1 倒计时（约 1.14 秒），BFS 的成本就藏在这段仪式感里。**这是倒计时的第二个作用**（第一个是让玩家换气）。

为什么 BFS 不挪到异步？原因是它一旦异步，开局那一刻盘面还没准备好，倒计时会空转——玩家盯着一个空白台读秒。用 CPU 换正确性、把成本藏在仪式感后面，是我明确选的取舍：

```text
   点「开始」
      │
      ▼
 refresh() ──▶ buildGame()         ← 同步，含 BFS（最坏 18 层）
   给数据       造盘、算最优步数         │
      │                                  │ 成本发生在这
      ▼                                  ▼
 ┌─ 3 - 2 - 1 ──────────────────────────────┐
 │  凝神换气（作用一） + 藏 BFS 成本（作用二） │
 └──────────────────────┬───────────────────┘
                        ▼
                  盘面亮起，可动手
```
*（结构示意，非实测截图；只示意先后关系，不代表倒计时画面。）*

## 5. 首屏不阻塞

```js
onLaunch() {
  store.init();        // 同步：先给页面一份本地缓存，避免白屏
  ...
}
onShow() {
  if (!this.bootstrapped && !this.bootstrapPromise) this.startBootstrap();  // 异步
}
```

`store.init()` 必须同步（首屏要有数据），云端拉档必须异步（不能让网络决定首屏）。

## 6. 定时器的成本

页面里最多的定时器是：

| 位置 | 周期 | 说明 |
| --- | --- | --- |
| 主页打坐行 | 30 秒 | 只重算那一行，不重算整页 |
| 参悟页倒计时 | 380ms × 3 | 短命 |
| 局内计时 | 1000ms 或 55ms | 由玩法模块的 `TimerBag` 管 |
| 蓄力 tick | 55ms | 最短的一个 |

**55ms 的 tick 是最贵的**：蓄力条要平滑移动。它的代价用「只在按住期间跑」抵消（`press` 时 `bag.every(tick, 55)`，`release` 时 `bag.clear()`）。

`TimerBag` 的存在就是为了「一定能清干净」：`intervals` / `timeouts` / `flexes` 三组都记 id，`clear()` 全清。

## 7. `setData` 的粒度

参悟页每次 `render(vm)` 都是整份 vm 的 `setData`。这是必要的粗暴：玩法状态是一个整体，局部更新要写 diff 逻辑，反而更慢。

成本控制靠两件事：

1. **vm 里不放函数与 DOM 引用**（`setData` 会序列化）；
2. **`cells` 用 `key` 而不是整块替换**（`wx:key="key"`），让框架能复用节点。

## 8. 图片与音频

| 资源 | 体积 | 怎么做 |
| --- | --- | --- |
| 两张 sprite | 63 KB（内联） | base64 |
| tabBar 图标 | 10 KB | `scripts/gen-icons.js` 生成 |
| 九个音效 | 112 KB | `scripts/gen-sfx.js` 合成 wav |

音效全部是**合成 wav**，不是录制的 mp3——合成的可以脚本重生成，体积也可控（峰值只到 0.52，所以压得下去）。

## 9. 被否决的方案

这些否决都指向一个判断：**能静态兜住的别留给运行时，能用生成脚本控的别依赖外部素材，能把成本藏起来的别暴露给玩家**。粒子不设上限、循环动画随便加，是会在线上悄悄吃掉帧率的；而 sprite 用网络图、音效用 mp3、把 BFS 放异步，则是把「可控」换成「看运气」。

| 方案 | 为什么否掉 |
| --- | --- |
| 引第三方 UI 库 | 一个组件库就吃掉几百 KB，且样式体系会与我们冲突 |
| sprite 用网络图 | 首屏要等网络；离线时盘面没有图案 |
| 音效用 mp3 | 需要外部素材；合成 wav 可脚本重生成 |
| 粒子不设上限 | 一次大消除能生成上百节点 |
| 循环动画随便加 | 20 局连刷时一直占合成层 |
| 手写最优步数避免 BFS | 一改盘面就失真 |
| 把 BFS 放异步 | 开局时盘面还没准备好，倒计时会空转 |
| 云端拉档放 `onLaunch` 同步等 | 网络决定首屏时间 |

## 10. 代码指路

- `project.config.json` —— `packOptions.ignore`
- `data/visual.js` —— `MOTION` 预算
- `minigames/klotski.js` / `pushbox.js` / `sudoku.js` —— 开局时的计算
- `minigames/common.js` —— `TimerBag`
- `app.js` —— `store.init()` 同步 / `bootstrap()` 异步
- `scripts/gen-icons.js` / `gen-sfx.js` —— 资源生成
- `tests/layout.test.js` —— 动画预算断言

## 11. 待验

- **`MOTION` 是静态常量，没有运行时降级**。低端机与旗舰机用同一套粒子数。若真机上低端机掉帧，需要按设备分级——当前没有。
- 滑块让路的 40 次抽样 + BFS 在**低端机首次进入**的耗时未实测。圆满段 `maxOpt = 12` 是最坏情况。
- 包体 1.35 MB 是粗测（含源码未压缩），实际发布包会因 `minified: true` 更小，但**没有量过真实发布包体积**。
- base64 内联让 `styles/emblems.wxss` 变成 51.5 KB——这个文件在每个用到的页面都要被解析。**样式解析成本未评估**。
- 参悟页 `setData` 整份 vm：在 6×6 / 9×9 的盘上 `cells` 有 81 个对象，每手都全量传一次。目前没出问题，但这是最可能的天花板。
