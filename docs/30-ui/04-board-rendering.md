# 盘面渲染：三支图案、纸纹、凸凹与舞台权重

> 盘面是全站唯一允许浅色的地方，也是唯一允许出现「非令牌色」的地方。这两条例外都是为了同一件事：**格子里要有东西可读**。

## 1. 一句话

一条渲染链 `crest → emblem → label`，一套玉牌材质（台色 `--well` + 牌面 `--jade` + 金线角花），一组必须双类覆盖的舞台状态 —— 三件事各自解决「图案从哪来」「空白格怎么不简陋」「深盘上为什么点了没反应」。

## 2. 目标与非目标

**目标**

- 16 套盘面（十五门功法 + 突破）的格子**共用一套渲染链**，不各写一份；
- 盘面上**不出现汉字**，方向靠箭头、状态靠颜色与形状；
- 不同安卓机型上**长得一样**（不依赖系统字形）；
- 轻量：不新增图片请求，纹理与图案都不拖帧。

**非目标**

- 不给每个玩法单独做美术资源；
- 不做真正的 3D / 粒子特效（低端机红线）。

## 3. 一条渲染链：`crest → emblem → label`

```html
<view wx:if="{{item.crest}}" class="cell__crest crest--{{item.crest}}"></view>
<view wx:elif="{{item.emblem}}" class="cell__emblem emblem--{{item.emblem}}"></view>
<text wx:else>{{item.label}}</text>
```

模块只负责往 `vm.cells[i]` 上写 `crest` / `emblem` / `label` 三者之一，渲染层不判断玩法。

### 3.1 `crest` —— 8 格果器纹

| 项 | 内容 |
| --- | --- |
| 图 | `assets/crest.png`，512×64，**8 格横排** |
| 引入方式 | `styles/crest.wxss` 里 base64 内联 |
| 切片 | 容器取 `800%` 宽，靠 `background-position-x` 切到第 N 格 |
| 八个图案 | 灵果 / 灵梨 / 灵珠 / 灵桃 / 灵橘 / 茶盏 / 灵葫 / 灵芝 |
| 谁在用 | 灵纹连线（并蒂连枝引）、三秀同收 |

### 3.2 `emblem` —— 26 格卦象 / 器物纹

| 项 | 内容 |
| --- | --- |
| 图 | `assets/emblems.png`，1664×64，**26 格横排** |
| 引入方式 | `styles/emblems.wxss` 里 base64 内联一次，`.cell__emblem / .klotski__emblem / .orbit__emblem` 三个选择器**共享同一份** `background-image` |
| 切片 | 容器 `2600%` 宽，`background-position: i/25*100%` |
| 26 格 | 乾/坤/震/巽/坎/离/艮/兑 八卦 → 亮灯笼 / 灭灯笼 / 死门印 / 阵眼环 / 木箱 / 八角阵位 / 道人 / 阵钉 / 禁纹雷印 / 剑光 / 影子 / 诀印 / 露滴 / 金元宝 / 木嫩芽 / 水波纹 / 火苗 / 土山 |
| 谁在用 | 阵灯推演、数格辨禁、成对翻牌、推石入位、滑块让路…… |

**五行图案的映射不能写 `22 + i`**：

```js
// minigames/wuxing.js:14
const ELEMENT_EMBLEM = [23, 25, 26, 22, 24];  // 木 火 土 金 水
```

元素次序（木火土金水）与 sprite 次序（…金元宝 22 / 木嫩芽 23 / 水波纹 24 / 火苗 25 / 土山 26）不同，写死 `22 + i` 会让五行盘整盘错位。

### 3.3 `label` —— 数字与形状

数字盘（九宫、数中取大、顺序点格、滑格相合、推石入位）保留数字。`label` 同时是**测试与读屏用的语义值**。

### 3.4 为什么不用字形

| 候选 | 为什么否掉 |
| --- | --- |
| `✦ ✿ ◆` 等 dingbat | 部分安卓把它们换成**彩色 emoji**，同一盘面在两台手机上长得不一样 |
| `乾坤震巽` 等汉字 | 直接违反「盘面不写汉字」 |
| 纯 CSS 拼形状（圆 + 边框） | 拼出来仍是几何纹，认不出「这是灵芝、那是茶盏」 |

**这是「一张 sprite 胜过一堆条件样式」的地方**：图案要「一眼认」，只能画出来。

## 4. 玉牌材质：台、牌、沟槽、角花

盘面是一方玉局，四件事拼出材质，一张图都不用：

| 层 | 做法 | 数值 |
| --- | --- | --- |
| 台 | `.grid` 底色 `--well`（按功法族注入）+ 上缘暖光 + 下缘暗角 | 兵刃 `#0D202B` / 心法 `#0D2420` / 丹道 `#291713` / 阵法 `#191628` |
| 牌 | `.cell` 底色 `--jade`，顶缘高光、底缘赭色厚度、牌下落影 | `#fbf3dd`，牌/台明度比约 6–7:1 |
| 沟槽 | `.cell` 的 **border 取台色**，牌面因此内缩 4rpx，相邻两牌之间空出 8rpx | 状态类一律不许改 `border-color` |
| 框 | `.grid` 外一圈 1rpx 旧金 + 一圈墨；`::after` 内缩 9rpx 再走一道金线 + 四角回纹 | `rgba(207,174,109,.5)` |

```css
.grid {
    background-color: var(--well, #0b2331);
    background-image: 上缘暖光 + 下缘暗角;
    box-shadow: 0 0 0 1rpx rgba(207,174,109,.5), 0 0 0 8rpx rgba(5,10,9,.55), 0 26rpx 56rpx rgba(0,0,0,.55);
}
.cell {
    border: 4rpx solid var(--well);      /* = 沟槽 */
    background-color: var(--jade);
    box-shadow: 0 4rpx 0 rgba(0,0,0,.34), 0 8rpx 14rpx rgba(0,0,0,.3),
                inset 0 2rpx 0 rgba(255,255,255,.95), inset 0 -7rpx 10rpx rgba(146,112,62,.22);
}
```

四条硬约束：

1. **盘面的受光必须写在 `.grid` 自己的 `background-image` 上，不许另起 `::before`**。伪元素一旦带 `z-index`，在部分机型上会盖住整盘格子——整块盘会变成一片灰（本轮踩过）。
2. **`.cell::before` 只放四角角花**，且 6 列以上（`--c6 / --c9 / --compact / --lane`）一律 `display: none`：格宽只剩百来 rpx，角花会跟数字抢注意力。角花必须走伪元素，不能写进 `.cell` 的 `background-image`——很多状态类用 `background` **简写**，会把图片一起清掉。
3. **沟槽靠 border，不靠 `width: calc()`**：格宽是按列数给的百分比，动一处要改五处。
4. **开局入场动画只动位移，不动透明度**：`@keyframes` 从 `opacity: 0` 起跳时，若动画被系统「减少动效」关掉，整盘会停在 `opacity: 0`——玩家看到的是一块空台。

## 5. `cellEtch`：一次性金圈

命中时给一格一道金圈，**只播一次**（不是循环）：

```css
@keyframes cellEtch { 0% { opacity:.9; transform:scale(.86) } 100% { opacity:0; transform:scale(1.16) } }
.cell--ok::after, .cell--gold::after, .cell--hint::after, .cell--hintpair::after { animation: cellEtch 420ms ease-out 1 forwards; }
```

挂在 `--ok`（对了）/ `--gold`（收了）/ `--hint`（被提示）三种最常见的判定上。**已终局的盘面不会再挂这些类**，所以不会出现「打完了还在闪」。

430ms、只动 `transform` 与 `opacity`——不占粒子预算、不触发重排。

## 6. 凸 / 凹：比配色更有效的一对暗示

| 状态 | 做法 |
| --- | --- |
| 未翻开 | 顶缘高光 + **7rpx 赭色下唇** + 落影的玉牌（凸），四周 8rpx 台色沟槽 |
| `.cell--open` | 换成 `--jade-paper` 旧纸、吃 12rpx 内阴影，变成凹槽（凹） |

**这一条比配色更有效**：玩家分得清「能点」与「点过了」，不需要靠颜色区分。尤其在色盲玩家与强光环境下。

配套的一条：**牌必须比台亮六七倍**。旧版把 `--soft` 直接铺在浅色盘面上，牌与底只差 1.1:1，整盘糊成一块发光的白板。

## 7. 舞台权重：为什么「点了没反应」

`.pg--scene` 里格子底盘是双类选择器：

```css
.pg--scene .cell { background: #16374b; ... }   /* 权重 0,2,0 */
```

任何**单类**的 `.cell--lit` / `--open` / `--dead`（权重 0,1,0）都会被它盖掉。

所以 `styles/scene.wxss` 把每一个状态都重写了一遍：

```css
.pg--scene .cell--lit { ... }
.pg--scene .cell--open { ... }
.pg--scene .cell--dead { ... }
/* 共 12 条 */
```

**新增状态时必须同时补 `.pg--scene .cell--xxx`**，否则症状就是「在舞台上点了没反应」——页面文件齐全、断言全绿，就是不亮。

### 7.1 还有第二个坑：`background` 简写

```css
/* 错：简写会清掉 background-image */
.pg--scene .cell--dead { background: #8d3b32; background-image: repeating-linear-gradient(...); }
```

上面这段其实是对的——因为 `background-image` 写在 `background` **之后**。但反过来（先 `background-image` 后 `background`）图片就被擦掉了。盘面背景同理：`.grid` 的 `background` 是 inline 注入的，**任何纹理都只能放伪元素**。

## 8. 三种舞台形态

| 形态 | 结构 | 谁用 |
| --- | --- | --- |
| `board` / `lane` | `.grid.grid--cN` + `.cell` 流式布局 | 大多数 |
| `klotski` | 绝对定位整块（`left/top/width/height` 百分比） | 滑块让路 |
| `ring` / `orbit` / `charge` / `scroll` | 各自独立结构 | 节律、五行、突破、步法 |

**滑块为什么不能拼格子**：格子拼出来的块会被缝线切碎，看不出「这是一整块」，滑动的手感也就没了。所以 `.klotski__blk` 用绝对定位按 25% 网格摆。

同理，**只有持续下落的玩法才挂方向键**（`.pad`）：其余玩法盘面下不留这一排。

## 9. 列数是显式规格：c3 / c4 / c5 / c6 / c7 / c8 / c9 / c10

```css
.grid--c3 .cell { width: 33.33%; height: 156rpx; }
.grid--c4 .cell { width: 25%;    height: 128rpx; font-size: 26rpx; }
.grid--c6 .cell { width: 16.66%; height: 100rpx; font-size: 24rpx; border-width: 3rpx; border-radius: 10rpx; }
/* 十列只给落石垒基：标准场地 10×20，格子必须正方，所以盘面自己收窄到 408rpx。 */
.grid--c10 { width: 408rpx; }
.grid--c10 .cell { width: 10%; height: 40rpx; border-width: 2rpx; border-radius: 3rpx; }
```

**为什么八列以上要单独一段，而不是把 c6 的格子改小**：格子大小跟列数绑在一起，同一段列数里所有玩法共用一套尺寸。8 列给推石入位的后段（内盘 5×5 外圈墙），10 列只给落石垒基——它需要的是「二十行看得完」而不是「格子大」。这也是为什么 `SIZES` 一类表到 6 就封顶：九宫、毫厘这类要读数字的盘面，8 列以上每格不到 90rpx，读数就变成「猜」。

`.grid--compact` 是 6 列的紧凑变体，模块通过 `vm.extras.compact = size >= 6` 自己申请。

## 10. 被否决的方案

| 方案 | 为什么否掉 |
| --- | --- |
| 每个玩法一套格子样式 | 20 份重复，改一次要动 20 处 |
| 纹样写进 `.cell` 的 `background-image` | 状态类的 `background` 简写会擦掉它 |
| 用 dingbat 当图案 | 安卓换 emoji |
| 用汉字当图案 | 硬约束禁止 |
| 盘面也走深色 | 格子里读不出数字与图案差异 |
| 状态类只写单类选择器 | 舞台上被底盘盖掉，症状是「点了没反应」 |
| 加 8 列九宫（8×8） | 单格过小，读数变猜 |

## 11. 代码指路

- `styles/crest.wxss` —— 8 格果器 sprite（base64）
- `styles/emblems.wxss` —— 26 格卦象 sprite（base64，三个选择器共享）
- `styles/scene.wxss:256` 起 —— 舞台格子底盘 + 12 条双类状态
- `pages/practice/practice.wxss:553` —— `.cell::before` 纸纹 / `cellEtch` / `.grid--cN`
- `pages/practice/practice.wxml:283` 起 —— `crest → emblem → label` 渲染链
- `minigames/wuxing.js:14` —— `ELEMENT_EMBLEM`
- `data/visual.js` —— `CREST_HUE`（8 个图案的主色，迸溅取这张表）
- `tests/layout.test.js` —— 运行时探针逐门扫开局那一帧，确认盘面无汉字

## 12. 待验

- **盘面不许上汉字**目前由 `tests/layout.test.js` 的运行时探针守着（逐门扫开局那一帧）。新增玩法若在开局后才把汉字写进 `label`，探针可能扫不到。
- `CREST_HUE` 是手抄的八组色值，与 `assets/crest.png` 的实际颜色**没有自动比对**。改图必须同时改这里，否则迸溅颜色会与牌面不符。
- `.cell::before` 的四角角花在所有 `.cell--*` 状态下都覆盖在上层（`inset: 0`）。在 `.cell--open`（近白底）上，浅金色角花的对比度是否还看得出。
- `.pg--scene .cell` 的 12 条双类状态是手工同步的。若新增状态时漏写，症状隐蔽（「点了没反应」），**建议在 verify 里做一次「practice.wxss 里每个单类 `.cell--x` 状态都必须有对应的 `.pg--scene .cell--x`」的静态比对**。
- `.klotski__blk` 与 `.klotski__emblem` 的百分比定位在 6 列宽盘（推石入位不用，但滑块用 4×4）之外的复用情况未验。
