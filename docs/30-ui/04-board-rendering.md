# 盘面渲染：三支图案、纸纹、凸凹与舞台权重

> 盘面是全站唯一允许浅色的地方，也是唯一允许出现「非令牌色」的地方。这两条例外都是为了同一件事：**格子里要有东西可读**。

## 1. 一句话

一条渲染链 `crest → emblem → label`，一套纸面质感 `.cell::before`，一组必须双类覆盖的舞台状态 —— 三件事各自解决「图案从哪来」「空白格怎么不简陋」「深盘上为什么点了没反应」。

## 2. 目标与非目标

**目标**

- 20 套玩法的格子**共用一套渲染链**，不各写一份；
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
| 谁在用 | 灵纹连线（并蒂引）、三秀同收 |

### 3.2 `emblem` —— 26 格卦象 / 器物纹

| 项 | 内容 |
| --- | --- |
| 图 | `assets/emblems.png`，1664×64，**26 格横排** |
| 引入方式 | `styles/emblems.wxss` 里 base64 内联一次，`.cell__emblem / .klotski__emblem / .orbit__emblem` 三个选择器**共享同一份** `background-image` |
| 切片 | 容器 `2600%` 宽，`background-position: i/25*100%` |
| 26 格 | 乾/坤/震/巽/坎/离/艮/兑 八卦 → 亮灯笼 / 灭灯笼 / 死门印 / 阵眼环 / 木箱 / 八角阵位 / 道人 / 阵钉 / 禁纹雷印 / 剑光 / 影子 / 诀印 / 露滴 / 金元宝 / 木嫩芽 / 水波纹 / 火苗 / 土山 |
| 谁在用 | 阵灯推演、数格辨禁、成对翻牌、五行相生、步法连环、推石入位、滑块让路…… |

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

## 4. 纸面质感：`.cell::before` 四角纸纹

数字盘与形状盘没有可替换的图案（数字是信息、箭头是方向），它们「不简陋」靠这一层：

```css
.cell::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: 四个 135°/225°/45°/315° 的浅金角花;
    opacity: 0.42;
}
```

四个关键约束：

1. **必须是伪元素**，不能写进 `.cell` 的 `background-image`——很多状态类（`.cell--lit` / `--dead`）用 `background` **简写**，会把 `background-image` 一起清掉；
2. `pointer-events: none`，不然角花会吃掉点击；
3. 不新增图片，纯 `linear-gradient`；
4. 不盖内容：角花只在四角各 15rpx，`opacity: 0.42`。

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
| 未翻开 | 带 **3rpx 下唇**与**上缘高光**的竹牌（凸） |
| `.cell--open` | 吃内阴影，变成凹槽（凹） |

**这一条比配色更有效**：玩家分得清「能点」与「点过了」，不需要靠颜色区分。尤其在色盲玩家与强光环境下。

配套的一条：**格子底色要掺白（近瓷白）**。直接把 `--soft` 铺上去，会和同色系的纸底糊成一片。

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

## 9. 列数只有 c3 / c4 / c5 / c6 / c9

```css
.grid--c3 .cell { width: 33.33%; height: 156rpx; }
.grid--c4 .cell { width: 25%;    height: 128rpx; font-size: 26rpx; }
.grid--c6 .cell { width: 16.66%; height: 100rpx; font-size: 24rpx; border-width: 3rpx; border-radius: 10rpx; }
```

**没有 c8**：8 列在 4.7 寸屏上每格不到 90rpx，读数就变成「猜」。这也是为什么 `SIZES` 一类表到 6 就封顶。

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
