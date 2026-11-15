# 校验链：verify → test → sim → lint

> `npm run check` 一条命令跑四段。四段各管一类错误：**结构错、行为错、曲线错、风格错**。任何一段红，都不许提交。

## 1. 一句话

| 段 | 命令 | 回答什么问题 |
| --- | --- | --- |
| ① verify | `npm run verify` | 结构完整性（文件在不在、注册没注册、文案与真源同不同源） |
| ② test | `npm run test` | 行为正确性（五个测试文件） |
| ③ sim | `npm run sim` | 数值曲线的形状 |
| ④ lint | `npm run lint` | 语法与死变量 |

一个不起眼的第五段：`npm run audit:diff`（难度区分度审计）——**不进 `check`**，只读、出报告。

## 2. 为什么是四段而不是一段

一段巨大的检查脚本会有两个问题：慢（每次都跑全部）与难读（红了不知道是哪一类错）。

四段各有明确语义，红了立刻知道该往哪看：

- verify 红 → 少注册了一个页面 / 文案抄了一份字面量；
- test 红 → 逻辑真的错了；
- sim 红（其实是「看输出不对」）→ 数值改歪了；
- lint 红 → 语法或未使用变量。

## 3. ① `verify` —— 11 段、135 处断言

`scripts/verify.js` 是一个纯静态检查器：读文件、正则、比对，不改任何东西。

| # | 段 | 查什么 |
| --- | --- | --- |
| 1 | JSON 可解析 | `app.json` / `theme.json` / 各页 json / `project.config.json` |
| 2 | JS 语法 | 对每个 `.js` 跑 `node --check` |
| 3 | **页面四件套** | `app.json.pages` 里每页的 js / json / wxml / wxss 都在；**磁盘上的 `pages/*` 都已注册**；**代码里写死的 `/pages/x/y` 跳转目标都是注册页** |
| 4 | 组件四件套 | 同 3，针对 `components/` |
| 5 | tabBar 图标 | 图标文件存在 |
| 6 | `theme.json` | 覆盖 `app.json` 里所有 `@变量`；且与 `tokens.wxss` 的令牌**同值** |
| 7 | 关键文件存在 | 一张清单（含 `styles/tokens.wxss`、`utils/store.js`、`data/visual.js`…） |
| 8 | 品阶与难度档约定 | 品阶管收益、难度档跟熟练度，两套不许混 |
| 9 | **页面规范** | 令牌单一真源、明暗一致性、导航栏标题、**页面样式不写裸色值**、**CSS 变量拼错** |
| 10 | **文案与页面组织** | 文案真源唯一、术语可查、区块标题说人话、`<term>` 引用的 key 存在 |
| 11 | **三页信息架构** | tabBar 与导航真源一致、说明主题覆盖每页、解释性长文不回页面 |

### 3.1 第 3 段的三条，是从真实事故里长出来的

> 漏注册时 `wx.navigateTo` **静默失败**：页面文件齐全、旧断言全绿，也拦不住「点参悟没反应」。

1. 注册页的四件套齐全；
2. **磁盘上的 `pages/*` 都已注册**（新增了目录但忘了加 `pages` 数组）；
3. **代码里写死的 `/pages/x/y` 跳转目标都是注册页**（改了目录名但跳转字符串没改）。

第 3 条最值钱：它把「跳转字符串」和「注册表」绑在了一起。

### 3.2 第 9 段的「CSS 变量拼错」

```js
// CSS 变量拼错在小程序里是静默失效（不会报错，样式直接消失），必须静态兜住。
const tokenDefs = new Set([...tokenSrc.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
const runtimeVars = new Set(['--acc','--soft','--ink','--bg','--frame','--glow','--deep','--well','--a','--d']);
```

扫所有 wxss 里的 `var(--x)`，只允许「令牌表里有的」+「运行时注入白名单」。**这是整套静态检查里最实用的一条**——小程序不会对未定义变量报错。

### 3.3 裸色值白名单

```js
const TOKENIZED = ['app.wxss', 'styles/immortal.wxss', 'pages/index/index.wxss', ...];
```

12 个文件命中 `#rrggbb` 或 `rgba(r,g,b` 即失败。白名单例外（它们本来就是色板）：`styles/tokens.wxss`、`styles/scene.wxss`、`pages/practice/practice.wxss`。

## 4. ② `test` —— 五个文件，五种职责

`tests/run.js` 顺序 `spawnSync` 五个文件，任一非零即整体失败。

| 文件 | 行数 | 管什么 |
| --- | --- | --- |
| `game.test.js` | — | 引擎：熟练度、连 S、耗气、战力、突破、存档迁移 |
| `store.test.js` | 215 | 存档：本地读写、pending、防抖、游客态、冲突 |
| `minigames.test.js` | — | 20 个模块逐门整局驱动、`teach` 走一遍、`lines` 必须导出 |
| `rank.test.js` | — | 逐门复算五档评级线、区分度 |
| `layout.test.js` | — | 页面与样式：令牌、按压反馈、页面名一致、盘面无汉字（运行时探针） |

**为什么用 `spawnSync` 而不是 `require`**：每个测试文件是独立的 Node 进程，一个崩了不影响其余四个的结论。跑完一次能同时看到「哪几个红了」。

### 4.1 `layout.test.js` 有两种检查

- **静态**：读 wxss / wxml，比对类名与断言（例如 `.pressable` 是否存在）；
- **运行时探针**：真的 `createGame()` 起一局，扫开局那一帧的 `vm.cells`，确认没有汉字上屏。

后者是唯一能守住「盘面不放汉字」的手段——静态读代码看不出运行时填了什么。

## 5. ③ `sim` —— 曲线的形状

`scripts/simulate.js` 用固定种子的伪随机模拟三种局面，输出可对比的数字。

### 5.1 它验的三条线

1. **熟练度** = 单局基础（C10 / B15 / A23 / S34）+ 连 S 倍率（`round(34 × 1.5^(k-1))`，10 层封顶），每局独立取整；回关局按「本关 ÷ 当前关」折一次，且不参与连 S；不吃品阶 / 难度 / 境界 / 属性；
2. **灵力** = 参悟与对战的运功消耗，唯一真源 `economy.practiceQiCost()`；它不产出，只从闭关、份例与灵石兑换来。所以「一局练多久」的度量是**「这一局烧掉的气，要闭关几分钟才回得来」**——或者「值几枚灵石」；
3. **灵石** = 切磋与秘境所得，当日第 n 场按 `0.85^(n-1)` 衰减；支出走功法、破境与兑灵力（`exchangeQi()`，1 枚 = 100 点，只此一向）。

### 5.2 评级分布是经验值

```js
GRADE_DIST = {
  easy:   { S: 0.25, A: 0.40, B: 0.25, C: 0.08, F: 0.02 },
  ...
  desperate: { S: 0.05, A: 0.15, B: 0.35, C: 0.33, F: 0.12 },
};
```

**这是假设，不是事实**。文件头写得清楚：「固定种子的伪随机只用来模拟评级分布，目的是在改数值前后可复现地比较曲线，不是预言真机数据。」

真机数据回来后要回来校准这张表——**它目前没有校准过**。

### 5.3 它出了哪些关键数

| 结论 | 数 |
| --- | --- |
| 全 C 刷到 99999 | 10000 局 / 248760 灵力 |
| 全程不断 S 且都打最高档 | **84 局** / 1959 灵力 |
| 6000 点预算下逐档升 | 7290 |
| 同上，退一档打 | 6937 |
| 同上，只刷简单 | 6392 |
| 同上，只打天阶 | 4528 |
| 同上，黄阶金丹后 | 5703 |

这些数进了 `10-systems/03-economy-flow.md` 与 `docs/10-systems/01-currency.md`。

## 6. ④ `lint` —— 六条规则

ESLint 9 flat config，只开六条：

```js
'no-undef': 'error',
'no-dupe-keys': 'error',
'no-dupe-args': 'error',
'no-unreachable': 'error',
'no-constant-condition': ['error', { checkLoops: false }],
'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
```

**不收编代码风格**。项目里没有 prettier、没有分号规则、没有缩进规则——`lint` 只抓「一定会出错」的东西。

`no-unused-vars` 是 `warn` 而非 `error`：小程序里有大量「保留参数」（`catch (e) {}`），改成 error 会逼出满屏 `// eslint-disable`。

`globals` 显式列出 `wx` / `App` / `Page` / `Component` / `getApp` / `getCurrentPages` 等微信注入的全局——不列就会满屏 `no-undef`。

## 7. ⑤ `audit:diff` —— 不进 check 的第五段

```bash
npm run audit:diff
```

它回答一个静态断言回答不了的问题：**五档对某一门来说究竟改了什么？**

若只有评级线在变，玩家从第一秒到最后一秒的操作对象、盘面、容错全一样，那一档就只是「结算时乘个数」。

判据两条：

1. 每档至少**两个玩家看得见的参数**在变（盘面 / 预算 / 容错 / 节奏）；
2. 评级线随档变，**或**盘面规格随档变。

```js
// 这三个是内部档位索引 / 系数来源，不是玩家在盘上看得见的东西
const INTERNAL = new Set(['depth', 'gear', 'sBase', 'sStep']);
```

**为什么不进 `check`**：它是「审计」不是「断言」——判据里带「至少两个参数」这种量化的东西，硬卡进 CI 会逼出一堆为过审而加的假参数。它只出报告，人来看。

## 8. 提交前的最小动作

```bash
npm run check          # 四段全绿
npm run audit:diff     # 改了难度相关的东西才跑
```

然后一次 `git push` **双推 Gitee 与 GitHub**。

## 9. 被否决的方案

| 方案 | 为什么否掉 |
| --- | --- |
| 只跑 test | 结构错（漏注册）test 完全测不出来 |
| 只跑 verify | 它不懂业务逻辑 |
| 把 sim 做成断言 | 曲线是「看形状」的，硬卡阈值会逼着改数据迁就断言 |
| 把 audit:diff 放进 check | 同上，会逼出假参数 |
| 用 jest / vitest | 需要构建链；小程序项目保持「node 直接跑」 |
| 用 prettier | 全项目重排一次，git blame 全废；收益只有格式一致 |
| 一次 `node` 里 require 全部测试 | 一个崩了其余不跑，看不到全局 |

## 10. 代码指路

- `scripts/verify.js` —— 11 段、135 处 `errors.push`
- `tests/run.js` —— 五个文件的顺序执行器
- `scripts/simulate.js` —— `GRADE_DIST` 与三张曲线
- `scripts/difficulty-audit.js` —— `INTERNAL` 白名单与两条判据
- `eslint.config.js` —— 六条规则 + 微信全局
- `package.json` —— `check` 的四段串联

## 11. 待验

- **`GRADE_DIST` 从未用真机数据校准**。所有「84 局到顶」「7290 点」这类数字都建立在这张假设表上。真机数据回来后，`10-systems/` 与 `50-balance/` 里的结论都要复算。
- 裸色值白名单是按**文件名**列的：新增页面必须记得加进 `TOKENIZED`，否则那一页可以随便写色值而不被拦。
- 按压反馈断言的阈值是 `total >= 5`，而实际已有 48 处——**这个门槛等于没守**，建议改成「每个 wxml 至少一处」或「总数不低于某个更接近现状的值」。
- `verify` 3 段的「跳转目标都是注册页」靠正则抓 `/pages/x/y` 字面量；**拼接出来的跳转**（如 `'/pages/help/help?topic=' + key`）只能抓到前半段，抓不到 `?` 之后。目前够用，但新增动态路径时要小心。
- `layout.test.js` 的运行时探针只扫「开局那一帧」。若某门玩法在开局后才把汉字写进 `label`，探针看不见。
