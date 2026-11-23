# 需求（Spec）· 交互总则、按压反馈、动效、音效

> 三条总则：**每一处可点都有反馈**、**动画只动 transform / opacity**、**声音最多一声**。

## 核心前提：让玩家相信他那一下点到了

交互层要做的事，说穿了很简单：玩家点一下，得让他相信这一下点到了。参悟一局才十几秒，任何一次「没反应」都会被当成 bug——玩家不会想「可能还在算」，他只会觉得这游戏卡了。

所以我定了三条总则，而且它们的优先级是真的按场景排的。反馈第一条，因为它是信任的起点；动画只动 `transform` / `opacity` 是低端机的活命线，动 `width` / `top` 会重排掉帧；声音最多一声，则来自第一版「连击三路同响」被反馈「脑子嗡嗡」的教训。

这三条看着朴素，但执行起来到处是细节：按压反馈要常态类与 `--on` 类一起挂才有过渡；音效的池要设为 1 才不叠；结算演出 S/A 满放、B/C/F 压到 900ms，因为一局才十几秒，不该天天等演出。这一篇就是这些「朴素的坚持」怎么落到代码里的记录。

## 1. 概述

交互层的目标不是「炫」，是**让玩家相信他那一下点到了**。参悟一局十几秒，任何一次「没反应」都会被理解成 bug。

## 2. 三条总则

| # | 总则 | 为什么 |
| --- | --- | --- |
| 1 | 可点 `view` 统一挂 `hover-class="pressable--on"` | 没有按压反馈时，玩家会怀疑「是不是没点上」 |
| 2 | 所有动画只动 `transform` 与 `opacity` | 低端机红线：动 `width` / `height` / `top` 会触发重排 |
| 3 | 同刻最多一声判定音 | 第一版「连击三路同响」，玩家反馈「脑子嗡嗡」 |

## 3. 按压反馈

```css
.pressable     { transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease); }
.pressable--on { opacity: 0.86; transform: scale(0.995); }
```

- `--dur-fast` = 120ms；
- 缩放 0.995 是**几乎感觉不到但有**的程度，配合透明度下降才读得出「按下去了」；
- **常态类 `pressable` 必须一起挂**：`hover-class` 只加 `--on` 那一半，没挂常态类就没有过渡。

覆盖量：页面里共 **58 处** `hover-class="pressable--on"`，`tests/layout.test.js` 守着两件事：

```js
// 1. .pressable 与 .pressable--on 都必须在全局基础层定义
// 2. 每个挂 hover-class 的 view 必须同时有常态类 pressable
const floor = { 'pages/index/index.wxml': 4, 'pages/practice/practice.wxml': 12, 'pages/profile/profile.wxml': 6, 'pages/skills/skills.wxml': 3 };
```

### 3.1 盘面格子用另一套

```css
.cell--press { transform: scale(0.962); }
```

**只做缩放，不改变色**：状态色归状态类（`.cell--lit` / `--open` / `--dead`）管，手感归这一条管，两者不打架。

缩放幅度比 `pressable` 大（0.962 vs 0.995），因为格子小、需要更明显的确认。

`hover-stay-time="60"` 让按下态至少持续 60ms——否则快速连点时反馈根本来不及显示。

方向键（`.pad__key--press`）同理。

## 4. 动效预算

```js
// data/visual.js
MOTION = {
  particles: 8,        // 同时存在的粒子数
  particleCap: 12,     // 上限（超过就不再生成）
  loops: 3,            // 同时运行的循环动画路数
  hitMs: 180, missMs: 120, slashMs: 260,
  blurMax: 12,         // 模糊上限（px）
  cloudSec: 18, qiSec: 12,
  sparkDots: 6,        // 收牌迸溅：一处几粒
  sparkDist: 148,      // 飞多远
  sparkMs: 500,        // 活多久
};
```

**这是硬预算，不是建议值**。低端机上超了就是掉帧。

### 4.1 一次性动画：`cellEtch`

```css
@keyframes cellEtch { 0% { opacity:.9; transform:scale(.86) } 100% { opacity:0; transform:scale(1.16) } }
animation: cellEtch 420ms ease-out 1 forwards;
```

- `1 forwards`：**只播一次**，不循环；
- 挂了 `--ok` / `--gold` / `--hint` 三种判定；
- 已终局的盘面不会再挂这些类，所以不会「打完了还在闪」。

### 4.2 迸溅：独立浮层而不是格子伪元素

```html
<view wx:for="{{sparkList}}" class="spark" style="left:{{item.x}}%;top:{{item.y}}%">
```

**为什么不做成格子的 `::after`**：消消乐收完立刻掉落重排，格子当场换了内容，没法自己演「我被收走了」。

颜色跟着**被收走的那张牌**走（取 `CREST_HUE`），所以同色只收同色，盘面上不会混出一团杂色。

### 4.3 结算五段的时间线

```js
SETTLE.full  = [0, 300, 700, 1200, 1800];   // S / A
SETTLE.short = [0, 150, 350, 600, 900];     // B / C / F
```

暗场 → 评级落定 → 熟练度条 → 奖励逐条 → 按钮淡入。这条时间线画出来是这样——两排演出，长的给 S/A，短的给 B/C/F：

```text
   0ms    300   700   1200  1800
   ├──────┼─────┼──────┼─────┤  S/A  满演出
   暗场  评级  熟练度  奖励  按钮
        ┌────┴──┐
   0   150  350  600  900          B/C/F 压到 900ms
   ├────┼────┼────┼────┤
   暗场 评级 熟练 奖励 按钮
   任意时刻轻点一下 → 直接跳到末帧
```
*（设计示意，非实测截图；只示意五段的先后与长短，不代表最终画面。）*

**B/C/F 压到 900ms**：一局才十几秒，不让人天天等 1.8 秒演出。任意时刻点一下即跳过。

## 5. 音效

`utils/sfx.js`：`assets/sfx/*.wav`（由 `scripts/gen-sfx.js` 合成）用 `InnerAudioContext` 轮播。

### 5.1 九个音，音量宁小勿大

| 名 | 音量 | 最小间隔 | 用在 |
| --- | --- | --- | --- |
| `tap` | 0.26 | 45ms | 落子 / 一般点击 |
| `hit` | 0.34 | 95ms | 判定成功 |
| `miss` | 0.30 | 170ms | 判定失败 |
| `gold` | 0.36 | 150ms | 高价值命中 |
| `tick` | 0.26 | 120ms | 倒计时 |
| `go` | 0.30 | 220ms | 开局 |
| `clear` | 0.34 | 400ms | 走通 |
| `settle` | 0.30 | 400ms | 结算 |
| `fail` | 0.30 | 400ms | 失败 |

wav 峰值本身只有 0.52，这里再压一段。

### 5.2 三条防叠设计

```js
// 1. pool 一律 1：同名音不叠三路
pool: 1
// 2. VOICE 组共用一路声道：新判定音会掐掉上一个
const VOICE = ['hit','miss','gold','go','clear','settle','fail','tick'];
// 3. 全局最小间隔
const GLOBAL_GAP = 60;   // tap 跟手，单独放宽到 28
```

### 5.3 三段音量

| 段 | 值 | 说明 |
| --- | --- | --- |
| 轻（默认） | 0.75 | 觉得吵可以再降 |
| 中 | 1.0 | 标准 |
| 关 | 0 | 完全静音 |

`setLevel()` 会**同时改已经在响的池**的 `volume`——只对新生成的生效是不够的。

人物页设置里是 `wx.showActionSheet` 三选一（轻 / 中 / 关），选非 off 时播一声 `hit` 让玩家听到当前音量。

### 5.4 两个容易漏的开关

```js
audio.obeyMuteSwitch = false;   // 静音键不该吃掉音效
```

短促反馈玩家是按「有声音」在玩，系统静音键吃掉它反而像坏了。

```js
audio.onError(function () { /* 某个机型播不了就静音，不影响玩法 */ });
```

音效是增强，不是依赖。任何机型播不出来都必须静默降级。

### 5.5 没有 `wx` 的环境全部静默

```js
function supported() { return typeof wx !== 'undefined' && typeof wx.createInnerAudioContext === 'function'; }
```

Node 测试里跑玩法不需要真机音效。

## 6. 页面生命周期的交互约定

| 时机 | 做法 |
| --- | --- |
| 进页面 | `sfx.warm()` 预建常用音频上下文，避免第一次落子等实例化 |
| `onHide` | `sfx.stopAll()` 收声 + 清定时器 |
| `onUnload` | 取消 `store.subscribe` + 清定时器 |
| 定时器 | **先清再挂**（两次 `onShow` 之间没走 `onHide` 时会长出第二个） |
| 局中切页 | 参悟页 `controller.destroy()`，本局作废、连 S 归零、记钟（`closeAbandonedRound`） |

## 7. 长按与多段手势

| 手势 | 用在哪 | 实现 |
| --- | --- | --- |
| 单点 | 绝大多数 | `bindtap` |
| 长按 | 参悟页部分格子 | `bindlongpress` |
| 划动 | 刀法·开锋破军诀 | 透明 `.swipe-layer` + `catchtouchmove` 用手势坐标还原轨迹 |
| 按下 / 松开 | 蓄力停区 | `bindtouchstart` / `bindtouchend` / `bindtouchcancel` |

**划刀为什么需要一层透明层**：格子本身要静态不动，划动需要连续坐标；盖一层 `.swipe-layer` 接管 `touchmove`，才能把离散的格子坐标还原成一条线。

**蓄力为什么三个事件都要接**：`touchcancel` 不接，来电或系统手势打断时按钮会永远停在「蓄力中」。

桌面预览里鼠标可能只触发 `tap`，所以蓄力模块留了一支兜底（点一下自动按 520ms 再松开）。

## 8. 被否决的方案

这一批否决几乎全是「听起来更炫、做出来更糟」的活例子：动 `width` / `top` 更顺滑却掉帧，粒子不设上限更热闹却卡死，音效多路叠放更饱满却被说嗡。我对交互的要求是「稳」不是「炫」——这一节记的就是每次想炫一下时，被现实拉回来的理由。

| 方案 | 为什么否掉 |
| --- | --- |
| 只给按钮做反馈 | 全站大半可点元素是 `view`，只做按钮等于大多数点击没反馈 |
| 动 `width` / `top` 做动画 | 触发重排，低端机掉帧 |
| 粒子不设上限 | 一次大消除能生成上百个节点 |
| 音效多路叠放 | 玩家反馈「脑子嗡嗡」 |
| 用 WebAudio | 开发工具与真机行为不一致；`InnerAudioContext` 两边一致 |
| 静音键也静音 | 玩家以为音效坏了 |
| 迸溅写成格子伪元素 | 消完立刻重排，格子内容已换，演不出「被收走」 |
| B/C/F 也播满演出 | 天天等 1.8 秒 |

## 9. 代码指路

- `app.wxss:216` —— `.pressable` / `.pressable--on`
- `pages/practice/practice.wxss`（搜索 `.cell--press`，不写行号）
- `data/visual.js` —— `MOTION` / `SETTLE`
- `utils/sfx.js` —— `ASSETS` / `VOICE` / `GLOBAL_GAP` / `setLevel` / `warm` / `stopAll`
- `scripts/gen-sfx.js` —— wav 合成脚本
- `pages/practice/practice.js` —— 倒计时 380ms、`measureBoard`、`onPress` / `onRelease`
- `tests/layout.test.js` —— 按压反馈覆盖、`pressable` 常态类必须存在

## 10. 待验

- **`pressable` 覆盖 58 处，断言已改逐页下限**（四个主交互页 4/12/6/3，其余页每页至少 1 处，总数 ≥ 页数×3）：旧版「总数 ≥ 5」门槛太低，删掉几十处也不红，已修（见 `tasks/07-已修归档.md` C1）。
- 音效的 `gap` 与 `GLOBAL_GAP` 是按经验定的，**没有真机听感证据**；尤其 `hit` 的 95ms 在快速连击时是否仍显得碎。
- `MOTION` 预算是静态常量，**没有运行时降级**：低端机与旗舰机用同一套粒子数。若真机上低端机掉帧，需要按 `wx.getDeviceInfo()` 分级（当前没有）。
- `.cell--press` 的 0.962 与 `.pressable--on` 的 0.995 是两个尺度，盘面与页面其它地方的按压手感不一致——这是有意的（格子小），但没有记录成规范。
- 划刀的 `.swipe-layer` 依赖 `measureBoard()` 量出的矩形；页面旋转 / 分屏后矩形失效，**没有重新测量的触发点**。
- 「同刻最多一声」是靠 `cutVoice` 掐声道实现的，代价是**连续命中时前一声会被切断**，听感上像「少了半声」。是否改成「短音不掐、长音才掐」需要真机听感决定。
