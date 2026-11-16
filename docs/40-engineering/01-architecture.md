# 目录分层与数据流

> 五层：`data/`（数值真源）→ `minigames/`（纯玩法内核）→ `utils/`（引擎与存储）→ `pages/`（页面）→ `styles/`（皮肤）。依赖只能从上往下，一层也不许回头。

## 1. 一句话

`data/` 存所有数字，`minigames/` 只算盘面，`utils/game.js` 是唯一的规则执行者，页面只负责摆放与调用。**没有第二处算同一个数。**

## 2. 五层与依赖方向

```
pages/  components/            ← 摆放与交互
   ↓
utils/game.js                  ← 引擎：唯一改存档的地方
   ↓
utils/store.js                 ← 存档 / 同步 / 游客态
   ↓
data/*.js                      ← 数值真源（纯数据 + 少量纯函数）
minigames/*.js                 ← 玩法内核（纯函数 + 控制器）
styles/*.wxss                  ← 皮肤（唯一数值出处：tokens.wxss）
```

**硬约束**：

- `minigames/` **不许** `require` `data/visual.js`（玩法不知道自己的主题色）；
- `minigames/` **不许** `require` `utils/game.js`（玩法不知道熟练度、货币、境界）；
- `data/` **不许** `require` `pages/` 或 `utils/`（除了 `economy.js` 这类纯常量互相引用）；
- 页面**不许**自己算熟练度、耗气、评级线——一律从 `utils/game.js` 或 `data/practice.js` 拿。

## 3. `data/` —— 十三个文件，各自管什么

| 文件 | 行数 | 管什么 |
| --- | --- | --- |
| `economy.js` | 186 | 七条经济常量、`practiceQiCost()`、`qiCapOf()`、`breakthroughStone()` |
| `world.js` | 155 | 四境界、四属性（含 `role`）、世界列表 |
| `practice.js` | 834 | 15 门参悟方式、五段难度、`buildParams()`、`TIERS`、熟练度阶梯、`STAGE_RULES` |
| `skills.js` | 327 | 15 门功法（属性加成、特效、价格、获取途径）+ `NAME_RULE` |
| `guides.js` | 397 | 每门的 `goal` / `steps` / `terms` / `scoring` / `tip` |
| `help.js` | 565 | 说明页的静态主题表 + `practiceTopic()` 现拼 |
| `copy.js` | 264 | 玩家文案、`TERMS`（术语词典）、`SHARE`、单位格式化 |
| `navigation.js` | 94 | `TAB_ORDER` / `TILES` / `PAGE_TITLES` / `HELP_TOPICS` |
| `visual.js` | 143 | 舞台色板、四支主题色板、`MOTION`、`SETTLE` |
| `titles.js` | 22 | 14 个称号 |
| `achievements.js` | 36 | 14 个成就 |
| `opponents.js` | 102 | 七个同门 + 三处秘境 |
| `weapons.js` | 136 | **兵器轴**：同一套「顺光划过刀桩」引擎靠 `profile` 分出刀与剑；当前只有 `dao` 启用（`剑` 是预留） |

**为什么拆这么细**：一次「灵力上限」改动只该动 `economy.js` 与 `world.js`；一次「熟练度」改动只该动 `practice.js`。文件越大，改动越容易跨职责。

## 4. `minigames/` —— 二十三个文件：20 门玩法 + 3 个基础设施

| 文件 | 行数 | 玩法 |
| --- | --- | --- |
| `common.js` | 255 | `makeVm` / `TimerBag` / `shuffle` / `mmss` / `pct` / `fillController` / `flash` |
| `theme.js` | 236 | 注入 `--acc / --soft / --ink / --bg / --frame`，每门的 banner / praise / miss |
| `index.js` | 78 | 注册表 `MODULES` + `createGame` / `gradeLines` / `hasTeach` |
| `click.js` | 796 | 顺光扫斩（最大） |
| `klotski.js` / `pushbox.js` | 396 / 548 | 让路 / 入位（含 BFS 求解） |
| 其余 17 个 | 124–603 | 各一套；最小的 `charge.js`（124）不进参悟，最大的 `lights.js`（603）是阵灯推演 |

**每个模块必须导出**：

```js
{ id, name, create(ctx), lines(params, gear) }
```

可选：`teach: { create(ctx) }`。

`charge.js` 是唯一只有 `{ id, name, create }` 的——它没有评级线（`gradeAt` 在内部），也不进参悟。

## 5. `utils/` —— 引擎与存储（十一个文件）

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `game.js` | 1897 | **唯一改存档的地方**：`applyPractice` / `battle` / `applyBreakthrough` / `claimDaily` / `meditate` / `settleOffline` / `checkTitles` / `computeMetrics` / `exportSaveCode` |
| `store.js` | 359 | 读写存档、防抖上云、pending、冲突、游客态、`subscribe` |
| `cloud.js` | 22 | 云 SDK 的初始化与「有没有云」的判断 |
| `cloud-save.js` | 210 | 云端存档读写 |
| `cloud-social.js` | 140 | 榜单读写、`pickRival` |
| `privacy.js` | 53 | 剪贴板 / 昵称接口的守卫 |
| `sfx.js` | 184 | 音效池 |
| `share.js` | 51 | 分享前缀与文案 |
| `swipe.js` | 55 | 划刀的手势轨迹还原 |
| `workbuddy-data-access.js` | 163 | 云 SDK 附带的数据访问层：只管读写，owner 由服务端 `DEFAULT auth.uid()` 与 RLS 决定，0 行命中视为失败 |
| `workbuddy-cloud-diagnostics.js` | 95 | 云 SDK 附带的错误归一化（把各种返回形态收成一个错误对象） |

后两个是 **SDK 自带的**，不是本项目的分层设计产物：它们只被 `cloud-*.js` 调用，页面与引擎都不许直接 `require`。把这一条写下来是因为「`utils/` 里出现了不是自己写的文件」这件事本身需要解释——否则下一个人会以为云诊断逻辑是本项目的职责。

### 5.1 `utils/game.js` 的 1897 行为什么不拆

它看起来该拆成 `practice.js` / `battle.js` / `realm.js` / `save.js`。不拆的理由：

1. 所有函数都吃同一个 `state` 并原地改它——拆开就要传引用、要处理「谁先改」，反而更容易出错；
2. 所有写入点都在一个文件里，`grep` 一次就能列全「哪些操作会改存档」；
3. 存档迁移（`migrateState` / `normalizeState`）必须知道所有字段，散开就要跨文件维护。

**代价**：单文件 1897 行，新人第一次读会迷路。所以文件里按「创建 → 迁移 → 概览 → 参悟 → 对战 → 突破 → 经济动作 → 序列化」分段，段间有空行与注释头。

## 6. 数据流：一次参悟的完整路径

```
[页面] 点「开始」
  ↓ practiceData.buildParams(method, diffKey)      ← 算这一局的参数
  ↓ economyData.practiceQiCost(...)                 ← 算这一局的气
  ↓ minigames.createGame(gameId, ctx)               ← 建控制器
[玩法] 每手 → ctx.render(vm) → 页面 setData
  ↓ 终局 ctx.finish({ grade, score, summary })
[页面] onFinish
  ↓ engine.applyPractice(s, skillId, grade, { difficulty, score })
[引擎] 算熟练度 → 写 state → checkTitles() → addLog()
  ↓ store.commit()（内部 scheduleFlush 防抖 1200ms）
[存储] 落本地 → 收 pending →（非游客）上云
```

**关键点**：玩法层不知道 `applyPractice` 存在。它只吐一个 `{ grade, score }`，怎么换算成熟练度是引擎的事。

这也是「玩法可以独立测试」的原因：`tests/minigames.test.js` 直接驱动模块，不需要存档。

## 7. 一局里谁算数

| 数 | 谁算 | 谁用 |
| --- | --- | --- |
| 本局参数（盘面规格、时长、罚时） | `practice.buildParams` | 玩法模块 |
| 本局耗气 | `economy.practiceQiCost` | 页面（准备页与结算） |
| 评级四条线 | 玩法模块的 `lines()` | 页面 HUD、结算、说明页 |
| 评级本身 | 玩法模块内部 `gradeOf()` | 玩法 → 引擎 |
| 熟练度 | `game.applyPractice` | 存档 |
| 灵力上限 | `economy.qiCapOf` | 页面、引擎 |
| 战力 | `game.powerDetail` | 页面、引擎 |
| 进度百分比 | `game.tierInfo` / `TIERS` | 页面 |

**每一行只有一个出处**。比如「S 线」在局内 HUD、结算、说明页三处出现，但都来自同一个 `lines()`——这是 `gradeLines()` 存在的理由。

## 8. `styles/` —— 五张表

| 文件 | 行数 | 管什么 |
| --- | --- | --- |
| `tokens.wxss` | 246 | **唯一数值出处**：颜色 / 字号 / 间距 / 圆角 / 阴影 / 层级 / 触控 / 动效 |
| `immortal.wxss` | 656 | 仙箓皮肤：`.pg--imm` 映射层 + `.imm-*` 组件类 |
| `scene.wxss` | 779 | 舞台与盘面：`.scene__*` / `.pg--scene .cell--*` |
| `crest.wxss` | 46 | 8 格果器 sprite |
| `emblems.wxss` | 89 | 26 格卦象 sprite |

`app.wxss`（473 行）只做 `@import` + 跨页面复用类。

## 9. 一条硬规则：页面必须注册进 `app.json.pages`

漏注册时 `wx.navigateTo` **静默失败**：页面文件齐全、旧断言全绿，就是点了没反应。

`scripts/verify.js` 双向核对：

1. 注册页的四件套（js / json / wxml / wxss）齐全；
2. 磁盘上的 `pages/*` 都已注册；
3. **代码里写死的 `/pages/x/y` 跳转目标都是注册页**。

第 3 条是最值钱的一条——它把「跳转字符串」和「注册表」绑在了一起。

## 10. 被否决的方案

| 方案 | 为什么否掉 |
| --- | --- |
| 拆 `game.js` 成五个文件 | 所有函数吃同一个 `state`，拆开要处理「谁先改」 |
| 玩法模块自己算熟练度 | 数值改一处要动 16 个模块 |
| 每页自己算耗气 | 一处不一致，玩家立刻发现「这页写的和气不一样」 |
| 页面直接写存档 | 会绕过 `checkTitles` / `addLog` / 迁移 |
| `data/` 里放页面逻辑 | 数据层要能被 Node 直接 require（测试与 sim 都依赖这点） |
| 把盘面样式做成组件 | 16 套结构差异大，组件化只会增加隔离成本 |

## 11. 代码指路

- `app.js`（283 行）—— 启动、bootstrap、冲突、游客、错误记录
- `utils/game.js` —— 引擎
- `utils/store.js` —— 存档
- `data/practice.js` / `data/economy.js` —— 数值
- `minigames/index.js` —— 注册表
- `styles/tokens.wxss` —— 样式真源
- `scripts/verify.js`（11 段、135 处 `errors.push`）—— 静态守卫

## 12. 待验

- `data/weapons.js`（136 行）是**刀法的兵器轴**（`dao` 启用、剑 profile 预留），只被 `minigames/click.js`、`tests/minigames.test.js` 与 `tests/layout.test.js` 引用。它证明「加一门剑法不用新写玩法模块」这个设想——**但剑 profile 至今没落地**，这条轴只有一半被验证过。
- `utils/workbuddy-cloud-diagnostics.js` / `workbuddy-data-access.js` 是云 SDK 的附属文件，**没有测试覆盖**。
- 「`minigames/` 不许 require `data/visual.js`」目前只写在注释里，**没有静态断言**。
- `click.js` 796 行是最大的玩法模块（刀法），它同时承担了「舞台玩法样板」的职责——两者耦合在一处，放开第二门舞台玩法时需要先看清它哪些部分是可复用的。
