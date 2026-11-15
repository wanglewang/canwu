# 数值总表（改数值前先看这一页）

> 全项目所有会影响玩家的常量都在这里。每一行都标了出处文件，改之前先去那个文件改，**不要在别处写第二份**。

## 1. 货币与耗气（`data/economy.js`，186 行）

### 1.1 开局与产出

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `START_QI` | 160 | 开局灵力（配合真元 12 → 气海 174） |
| `START_STONE` | 15 | 开局灵石 |
| `DAILY_QI` | 60 | 每日份例灵力（`stone: 0`） |
| `BATTLE_QI` | 5 | 一场切磋 / 秘境的运功灵力 |
| `BATTLE_STONE_DECAY` | 0.85 | 当日第 n 场 = `0.85^(n-1)` |
| `FIRST_CLEAR_STONE` | 8 | 首胜 / 首过另给 |
| `FORTUNE_SCROLL_RATE` | 0.012 | 机缘出残卷概率（1.2%） |

**闭关**（`data/world.js` 的 `idle`）：`qiPerMinute: 0.5`、`capHours: 8`。**不产熟练度**（`profPerHour` 已删）。
**份例**（`daily`）：`{ target: 3, qi: 60, stone: 0 }`——参满 3 局可领。

### 1.2 耗气算法

```
qiCost = RUN_QI[档] × methodQiFactor × TIER_QI[品阶] × 1.5(超限)
         ÷ min(1.6, 1 + 悟性/200) × 0.92(换门)
         → round，最低 1
```

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `RUN_QI` | `[7, 11, 17, 24, 32]` | 五档基数 |
| `TIER_QI` | `{huang:1, xuan:1.15, di:1.3, tian:1.45}` | 品阶加价 |
| `BASE_QI_REF` | 36 | 时长系数的基准（`method.base / 36`） |
| `METHOD_QI_MIN` / `MAX` | 0.85 / 1.3 | 时长系数上下限 |
| `REALM_OVER` | 1.5 | 超 `maxRealm` 时 ×1.5 |
| `CROSS_QI` | 0.92 | 换门（上一局练的是别的） |
| `WU_SAVE_MAX` | 1.6 | 悟性省气的除数上限 |
| `PRACTICE_SAVE_MAX` | 0.5 | 心法 `qiSave` 合计封顶（省一半） |
| `QI_COST_MIN` | 1 | 最低 1 点 |

### 1.3 气海

```
qiCap = round((境界基数 + 真元 × 2) × (1 + min(0.3, 扩池)))
```

| 常量 | 值 |
| --- | --- |
| 境界基数 | 炼气 150 / 筑基 260 / 金丹 420 / 元婴 620 |
| `QI_CAP_PER_LING` | 2（每点真元 +2） |
| `QI_CAP_SKILL_MAX` | 0.3（心法扩池封顶 30%） |

**开局气海 174** = `(150 + 12×2) × 1.0`。

### 1.4 突破

| 常量 | 值 |
| --- | --- |
| `BREAKTHROUGH_STONE` | `[60, 120, 240]`（筑基 / 金丹 / 元婴） |
| `BREAKTHROUGH_REFUND` | 0.5（失败退一半） |

## 2. 境界（`data/world.js`）

| # | 名 | 战力门槛 | 加成 | 气海基数 |
| --- | --- | --- | --- | --- |
| 1 | 炼气 | 0 | 0 | 150 |
| 2 | 筑基 | 75 | +6% | 260 |
| 3 | 金丹 | 170 | +14% | 420 |
| 4 | 元婴 | 300 | +24% | 620 |

**突破只有战力一个门槛**（`world.realms[].power`），灵石是花费不是门槛——`available` 与 `stoneReady` 是两个独立布尔。

## 3. 属性（`data/world.js`）

| key | 名 | 权重 | 开局 | 出口 |
| --- | --- | --- | --- | --- |
| `ti` | 体魄 | 1.0 | 12 | 战力根基 |
| `ling` | 真元 | 1.2 | 12 | 每点 +2 灵力上限 |
| `wu` | 悟性 | 0.8 | 10 | `÷(1 + 悟性/200)` 省灵力（封顶 ×1.6） |
| `shen` | 身法 | 1.0 | 11 | `shen/300` 抬切磋波动下限（封顶 +10%） |

**开局战力 45** = `(12×1.0 + 12×1.2 + 10×0.8 + 11×1.0) × 1.0 = 45.4 → 45`。

## 4. 熟练度（`data/world.js` + `data/practice.js`）

| 常量 | 值 |
| --- | --- |
| `PROF_MAX` | 99999（硬顶） |
| `PROF_BASE` | `{S:34, A:23, B:15, C:10, F:0}` |
| `COMBO_STEP` | 1.5 |
| `COMBO_MAX` | 10 |
| `COMBO_TABLE` | `[34,51,77,115,172,258,387,581,871,1307]` |
| `COMBO_ROUND` | 3853（十连合计） |
| `COMBO_CAP_GAIN` | 1307（封顶值） |
| `PROF_C_RUNS` | 9999（全 C 局数） |
| `PROF_S_RUNS` | 84（全 S 局数） |

**六段门槛**：`0 / 300 / 1500 / 6000 / 24000 / 99999`。

**回关折减**：系数 = 本关 ÷ 当前关，四舍五入一次。当前第 40 关时，S 的 34 点在 40 / 30 / 20 / 10 / 1 关为 `34 / 26 / 17 / 9 / 1`，C 的 10 点为 `10 / 8 / 5 / 3 / 0`。

`GRADE_FACTOR = {S:1.5, A:1.2, B:1.0, C:0.6, F:0}` —— **现仅用于判 `wiped`，不参与熟练度计算**（熟练度只用 `PROF_BASE` + 连 S）。

## 5. 五档难度（`data/practice.js`）

| key | 名 | 解锁需熟练度 | 耗气 | pace | windowPace | goal | gear | depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `easy` | 简单 | 0 | 7 | 1.18 | 1.50 | 0.85 | normal | 0 |
| `normal` | 普通 | 300 | 11 | 1.00 | 1.21 | 1.00 | normal | 1 |
| `hard` | 困难 | 1500 | 17 | 0.88 | 1.00 | 1.12 | hard | 2 |
| `expert` | 极难 | 6000 | 24 | 0.78 | 0.83 | 1.22 | hard | 3 |
| `desperate` | 绝境 | 24000 | 32 | 0.70 | 0.64 | 1.32 | hard | 4 |

`TIME_LEVELS = [1, 0.97, 0.94, 0.91, 0.88]`——时辰按时限类字段逐档收紧。

### 5.1 缩放用到的四张键名表

```js
PACE_KEYS   = ['interval','flashMs','gapMs','windowMs','shuffleMs','flipMs','dropMs','window','msPerNote']
WINDOW_KEYS = ['life']
GOAL_KEYS   = ['chainGoal','maxRound','segments','beats','scramble','mines','pairs','decoys','startLen','baseLen']
SPEED_KEY   = 'speed'   // 方向相反：除以 pace
```

**新增参数必须落进这四张表之一，否则 `buildParams` 不会缩放它**——它会在五档里保持同一个值。

### 5.2 四张整表 + 五门单参数

| 表 | 谁 | 内容 |
| --- | --- | --- |
| `MATCH_LEVELS` | 三秀同收 | kinds / duration / missCost / shuffleCost / hintCost / sLine |
| `LIGHTS_LEVELS` | 阵灯推演 | size / min / hi / slack（最优步数区间 / 步数余量） |
| `SUDOKU_LEVELS` | 九宫填数 | size / holes / timeLimit / tS / tA / tB |
| `KLOTSKI_LEVELS` | 滑块让路 | minOpt / maxOpt |
| `MERGE_TARGETS` | 滑格相合 | 128 / 256 / 256 / 512 / 1024 |
| `MERGE_START_TILES` | 滑格相合 | 2 / 2 / 3 / 3 / 4 |
| `SCHULTE_SIZES` | 顺序点格 | 4 / 5 / 6 / 6 / 7 |
| `SCHULTE_PENALTIES` | 顺序点格 | 2 / 3 / 4 / 5 / 6 |
| `SCHULTE_FADE` | 顺序点格 | 退场 / 退场 / 退场 / 不退场 / 不退场 |
| `PUSHBOX_LEVELS` | 推石入位 | 0 / 1 / 2 / 3 / 4 |
| `PUSHBOX_CAP_FACTORS` | 推石入位 | 2.2 / 2.0 / 1.9 / 1.75 / 1.6 |
| `BIGGEST_LEVELS` | 数中取大 | `{count, rounds}` 五组 |
| `MINES_HEARTS` | 数格辨禁 | 3 / 3 / 3 / 2 / 2 |

**前四张是整表注入**（覆盖 `buildParams` 的缩放）；中间几张是「档位表住在模块里，只注入本档最关键的那个数」；`PUSHBOX_CAP_FACTORS` / `MINES_HEARTS` / `SCHULTE_FADE` 是「区分度审计补上的第二、第三个参数」——它们都不是给界面看的装饰，玩法层真的读走。

## 6. 19 门功法总表（`data/skills.js`）

| id | 名 | 类别 | 品阶 | 属性加成 | 特效 | 价格（灵石） |
| --- | --- | --- | --- | --- | --- | --- |
| `jian` | 刀法·开锋斩桩诀 | 刀法 | 黄 | 身+3 体+1 | power 6% | 开局赠送 |
| `zhen` | 阵法·点灯破阵诀 | 阵法 | 地 | 真+3 悟+1 | variance 5% | 开局赠送 |
| `tuna` | 心法·吐纳周天诀 | 心法 | 黄 | 真+2 体+2 | qiCap 10% | 开局赠送 |
| `jingxin` | 心法·静心记诵诀 | 心法 | 玄 | 悟+4 | qiSave 8% | 70 |
| `yunbu` | 身法·踏云连环步 | 身法 | 玄 | 身+4 | power 5% | 55 |
| `leifu` | 阵法·循数勘禁诀 | 阵法 | 黄 | 真+4 悟+1 | qiSave 10% | 32 |
| `wuxingzhen` | 阵法·五灯相生诀 | 阵法 | 玄 | 真+3 悟+3 | offline 15% | 切磋 |
| `dan` | 水术·叠纹凝露诀 | 水术 | 地 | 真+3 体+2 | variance 6% | 切磋 |
| `duanyue` | 剑法·截锋断岳诀 | 剑法 | 天 | 身+4 体+2 | power 10% | 切磋 |
| `taixu` | 心法·太虚翻卦诀 | 心法 | 天 | 悟+5 真+3 | qiCap 15% | 切磋 |
| `lingqi` | 御灵·并蒂牵线引 | 御灵 | 黄 | 真+3 身+2 | qiSave 8% | 18 |
| `leiyue` | 土术·万石成岳诀 | 土术 | 黄 | 体+4 真+1 | power 5% | 24 |
| `sanxiu` | 灵植·三秀连收诀 | 灵植 | 黄 | 悟+3 体+2 | offline 12% | 22 |
| `shudu` | 术数·九宫排数诀 | 术数 | 黄 | 悟+4 真+1 | qiSave 9% | 28 |
| `heyuan` | 合术·同数叠元诀 | 合术 | 黄 | 真+3 体+1 | power 5% | 24 |
| `shumu` | 目术·扫目逐数诀 | 目术 | 黄 | 身+4 | variance 4% | 18 |
| `rongdao` | 机巧·让主出阵诀 | 机巧 | 黄 | 悟+3 身+2 | qiSave 8% | 30 |
| `tuisuo` | 挪移·石箱归位诀 | 挪移 | 黄 | 体+4 | power 4% | 26 |
| `zeda` | 辨术·一眼摘魁诀 | 辨术 | 黄 | 身+3 悟+1 | offline 10% | 16 |

**12 门可买（16–70 灵石），3 门开局赠送，4 门只能切磋首胜得。**

### 6.1 品阶四档

| 品阶 | 耗气 | 属性系数 | needRealm | maxRealm |
| --- | --- | --- | --- | --- |
| 黄 | 1.00 | 1.0 | 1 | 2 |
| 玄 | 1.15 | 1.3 | 2 | 3 |
| 地 | 1.30 | 1.7 | 3 | 4 |
| 天 | 1.45 | 2.2 | 4 | 9 |

**`needRealm` 是学习门槛，`maxRealm` 是可修上限**——两件事，不许合成一个布尔。

### 6.2 特效五类与段位兑现

`EFFECT_TIER_SCALE = [0, 0.25, 0.5, 0.75, 1, 1]`
（未入门 0 / 入门 1/4 / 小成 1/2 / 大成 3/4 / 圆满起满额）

| 类 | 门数 | 管什么 | 封顶 |
| --- | --- | --- | --- |
| `power` | 6 | 对战时战力 | — |
| `variance` | 3 | 对战波动下限 | 与身法共用 floor |
| `qiSave` | 5 | 参悟耗气 | 合计 `PRACTICE_SAVE_MAX = 0.5` |
| `offline` | 3 | 离线性灵力恢复 | — |
| `qiCap` | 2 | 灵力上限 | `QI_CAP_SKILL_MAX = 0.3` |

**`qiCap` 只给心法**（吐纳 +10%、太虚 +15%），`verify` 守着。

## 7. 一句核对口诀

改任何一个数之前，问三个问题：

1. **它在哪个文件？** 表里每一行都标了出处。
2. **有没有第二处在用它？** 用 `grep` 找引用，尤其注意「模块里的兜底值」与「`data/` 里的真源」必须相等（`verify` 有逐项比对）。
3. **改完之后跑 `npm run check` 与 `npm run sim`。**

## 8. 待验

- `GRADE_FACTOR` 现在只用于判 `wiped`，但它的值（1.5 / 1.2 / 1.0 / 0.6 / 0）仍在代码里，很容易被误认为「还参与熟练度」。建议改名或在注释里写死。
- `BASE_QI_REF = 36` 是「时长系数的基准」，19 门的 `base` 在 30–56 之间。**基准取 36 而不是中位数**，意味着偏长的门（56）耗气 ×1.56，偏短的（30）×0.83——这个选择的依据没有记录。
- 上表 19 门是 `data/skills.js` 的 `SKILLS` 数组，但 `data/practice.js` 的 `PRACTICE_METHODS` 是另一份（含 `base` / `params` / `tip`）。**两处必须一一对应，`verify` 只核对了「玩法名与模块导出一致」，没有核对「19 门功法 id 与 19 个参悟方式 id 完全一致」**。
- `MINES_HEARTS = [3,3,3,2,2]` 前三个一样：它是区分度审计「第二个参数」的补丁，前三档只靠别的参数区分。
