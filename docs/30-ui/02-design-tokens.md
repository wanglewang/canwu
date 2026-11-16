# 设计令牌：唯一真源与它的四条守卫

> `styles/tokens.wxss` 是全站样式唯一的数值出处。页面 wxss 里不许出现裸色值，不许自造字号，不许随手写 `z-index: 999`。

## 1. 一句话

一本 246 行的令牌表 + 四条静态断言，把「改一次颜色要动几个文件」压缩到**一个**。

## 2. 目标与非目标

**目标**

- 换肤只改一个文件；
- 拼错变量名立刻在 `verify` 阶段炸掉，而不是到真机上「样式静默消失」；
- 明暗两套只在 token 层翻，页面样式一行不改；
- 原生导航栏 / tabBar 与页面同色，浅色系统下不拼出米白横条。

**非目标**

- 不做 CSS 预处理器（小程序原生 wxss 没有构建链）；
- 不做运行时主题切换（恒定深色，见 `01-visual-language.md`）；
- 不把玩法盘面色板（`--acc / --soft / --ink / --bg / --frame`）收进令牌表——它们由 `minigames/theme.js` 与 `data/visual.js` 在运行时注入。

## 3. 六组令牌

| 组 | 前缀 | 数量 | 例 |
| --- | --- | --- | --- |
| 颜色 | `--c-*` | 白昼 40 + 暗色 40 + 仙箓 20 + 原生栏 4 | `--c-imm-gold: #cfae6d` |
| 字号 | `--fs-*` | 10 | `--fs-body: 28rpx` |
| 间距 | `--sp-*` / `--page-x` / `--card-pad` | 15 | `--sp-6: 24rpx` |
| 圆角 | `--r-*` | 7 | `--r-lg: 24rpx` |
| 阴影 | `--sh-*` | 4 | `--sh-card` |
| 层级 | `--z-*` | 5 | `--z-settle: 100` |
| 触控 | `--touch*` | 3 | `--touch: 88rpx` |
| 动效 | `--dur-*` / `--ease` | 3 | `--dur-fast: 120ms` |

### 3.1 字号阶梯（10 级，不许自造）

```
22 caption < 24 note < 26 body-sm < 28 body < 30 subhead
< 32 h3 < 34 h2 < 40 lead < 54 h1 < 76 display
```

`caption` 只用于角标与注脚，正文不小于 `body`。`display`（76rpx）只给战力这类单一大数字。

### 3.2 间距栅格（4rpx 基准）

`--sp-1 / 2 / 3 / 4 / 5 / 6 / 8 / 10 / 12 / 16` 对应 4/8/12/16/20/24/32/40/48/64rpx。

**没有 7、9、11**——栅格的用处就是逼你做选择，而不是「再调 2rpx 试试」。

页面级留白三个：`--page-x`（左右 28rpx）、`--page-top`（28rpx）、`--page-bottom`（底部 60rpx，不含安全区）。卡片：`--card-pad`（28rpx）、`--card-gap`（24rpx）。区块：`--section-gap`（40rpx）。吸底条占位：`--bar-height`（152rpx）。

### 3.3 层级（5 级，不许写 999）

| 令牌 | 值 | 谁 |
| --- | --- | --- |
| `--z-base` | 0 | 内容 |
| `--z-sticky` | 40 | 吸底条 |
| `--z-countdown` | 80 | 局内倒计时 |
| `--z-mask` | 90 | 遮罩 |
| `--z-settle` | 100 | 结算演出 |

### 3.4 触控（三段）

| 令牌 | 值 | 谁 |
| --- | --- | --- |
| `--touch` | 88rpx | 主操作 |
| `--touch-sm` | 76rpx | 次操作 |
| `--touch-xs` | 68rpx | 卡片内紧凑操作 / 文字链 |

卡片内可以降到 `--touch-sm`，但必须靠 `.btn-row` 或父行留白补足热区，**两个可点元素间距 ≥ `--sp-2`**。

## 4. 三层颜色是怎么组织的

`tokens.wxss` 里其实有三套颜色，不是一套：

```
① page { ... }                       ← 白昼基础层（浅米）
② @media (prefers-color-scheme:dark) { page { ... } }  ← 暗色基础层
③ 仙箓皮肤 --c-imm-*                 ← 恒定深色，两段里都取同一组值
```

`.pg--imm`（`styles/immortal.wxss:18`）做映射：把 `--c-bg` 重新指到 `--c-imm-bg`，把 `--c-primary` 指到 `--c-imm-gold`……

**为什么还要留 ①②**：`tokens.wxss` 是通用的基础层，`app.wxss` 的 `.card` / `.btn` / `.state` 这些跨页面类依赖它。真正跑在玩家眼前的页面全部挂 `.pg--imm`，所以看到的永远是 ③。

**这也是一个已知脆弱点**：`.pg--imm` 是类选择器，漏挂就退回浅米底。登录页为此直接取 `--c-imm-*` 而不取映射后的 `--c-bg`（见 `10-page-login.md`）。

## 5. 四条守卫

| 守卫 | 在哪儿 | 查什么 |
| --- | --- | --- |
| `app.wxss` 必须 `@import` 令牌表 | `verify` | 少一行 import，整套令牌不生效 |
| 令牌表必须有暗色段 | `verify` + `layout.test.js` | `/@media \(prefers-color-scheme: dark\)\s*\{/` |
| `theme.json` 的 `@变量` 与令牌同值 | `verify` | `@navBgColor` === `--c-nav` 等四项，逐项比对 |
| 常规页不许写裸色值 | `verify` + `layout.test.js` | `/#[0-9a-f]{6}\b|rgba?\(\d+,\d+,\d+/` 命中即失败 |

**裸色值白名单**（`verify` 里显式列出的三处）：

- `styles/tokens.wxss` —— 它本来就是色值仓库；
- `styles/scene.wxss` —— 舞台与盘面的主题色板；
- `pages/practice/practice.wxss` —— 玩法主题色板。

其余 12 个文件（`app.wxss` / `immortal.wxss` / 九个页面 / `duel-result`）命中即红。

还有一条更狠的：

```js
// verify.js:631
// CSS 变量拼错在小程序里是静默失效（不会报错，样式直接消失），必须静态兜住。
const tokenDefs = new Set([...tokenSrc.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
const runtimeVars = new Set(['--acc','--soft','--ink','--bg','--frame','--glow','--deep','--well','--a','--d']);
```

它扫所有 wxss 里的 `var(--x)`，只要 `--x` 既不在令牌表里、也不在运行时注入白名单里，就报错。**这是这套体系里最值钱的一条**——变量拼错在小程序里不会报错，只会「那块样式凭空消失」。

## 6. 为什么颜色名分成「裸名」与 `-text`

```css
--c-gold:      #b8893b;   /* 用于背景 */
--c-gold-text: #a2762d;   /* 用于文字 */
```

同一支色相做背景和做文字，需要的亮度不同：背景要够深才托得住白字，文字要够深才在浅底上读得清。合成一个变量，就必然有一处偏掉。

`--c-danger` / `--c-danger-text`、`--c-success` / `--c-success-text`、`--c-primary` / `--c-primary-text` 都是这个道理。

## 7. 安全区只有一处写法

```css
padding: var(--page-top) var(--page-x) calc(var(--page-bottom) + env(safe-area-inset-bottom));
```

所有吸底元素与页面底部留白**必须**带 `env(safe-area-inset-bottom)`。

坑：页面 wxss 一旦写 `padding` 简写，会盖掉全局兜底，安全区必须在那一页再写一次（登录页 `.login-page` 就是这样，注释里明确标了）。

`.pg.pg--with-bar` 用双类提高优先级，专门把底部留白换成 `--bar-height`——否则会被文件末尾的 `.pg` 安全区规则覆盖。

## 8. 被否决的方案

| 方案 | 为什么否掉 |
| --- | --- |
| 用 SCSS 变量 | 小程序原生 wxss 无构建链 |
| 页面各写一套色值 | 改一次配色要动 20 个文件，必然漏 |
| 只留仙箓一套、删掉白昼层 | `app.wxss` 的通用类会失去落点；且删了之后「漏挂 `.pg--imm`」就没有兜底外观，反而更难发现 |
| 字号自由取值 | 22/24/26/28/30/32/34/40/54/76 这十级是为了让「再大一点」成为一次明确的选择 |
| 间距允许奇数 | 允许 13rpx 就等于没有栅格 |
| 变量拼错靠人眼 | 静默失效，人眼查不出来 |

## 9. 代码指路

- `styles/tokens.wxss` —— 令牌表本体，文件头注释写明 9 条页面规范
- `styles/immortal.wxss:18` —— `.pg--imm` 的映射层
- `app.wxss:3` —— `@import` 三张表（tokens / immortal / scene）
- `theme.json` —— 原生栏四色，与令牌同值
- `scripts/verify.js:532` 起 —— 页面规范、明暗一致性、裸色值、变量拼错
- `tests/layout.test.js:845` —— 裸色值与令牌引用

## 10. 待验

- `--fs-display`（76rpx）只在 `.grade` 评级圆章用过一次，其余大数字走 `--fs-realm` 体系。**这一级是否还有存在必要**需要复核。
- 暗色段里有 40 个变量，其中约 15 个在当前恒定深色的页面里根本走不到（页面都挂 `.pg--imm`）。留着是为了 `app.wxss` 的通用类兜底，但**没有断言证明它们仍然自洽**。
- `--c-imm-gold-soft` 是 `rgba(207,174,109,0.10)`，用 `rgba` 而不是 `color-mix`：小程序对 `color-mix` 支持不一。若将来统一支持，可收成派生色。
- 裸色值白名单是按**文件名**列的：新增页面必须记得加进 `TOKENIZED` 数组，否则那一页可以随便写色值而不被拦。
