# 技术计划（Plan）· how

> SDD 四层中 plan 层的总目录。plan 只回答一个问题：**spec 承诺的 what，怎么用代码实现出来。**
> spec says what，plan says how——本层不写"游戏应该是什么样"（那在 `spec/`），只写"代码怎么组织、接口怎么定、异常怎么兜、性能怎么控"这些实现决策。
> 四层职责见 `docs/specs/README.md`。

## 目录

```
docs/specs/plan/                      技术实现层（本目录，how）
├── README.md                         本篇
├── 01-architecture.md                目录分层与数据流
├── 02-minigame-contract.md           玩法模块契约（create / lines / teach）
├── 05-error-and-lifecycle.md         异常兜底、环形日志、页面生命周期
├── 06-privacy.md                     隐私授权与接口守卫
├── 07-performance.md                 包体、渲染、计算预算
└── 08-navigation.md                  页面注册、跳转与标题
```

共 7 篇（本篇 README + 工程 6 篇），直接平铺、不再套子目录。号段 03 / 04 / 09 空缺不复用：校验链、测试职责归 `tasks/`，评审方法论归 `constitution/`——编号是历史指代，改号会让旧引用指到别的文档。

2026-11-23 按 SDD 的 what/how 重排：原 `plan/` 装了 141 篇，其中系统设计 / 玩法 / 界面 / 数值（what）全部移进 `spec/`，本层只留这 6 篇工程实现。

## 边界：本层不写什么

- **不写行为承诺**（"灵力不足不能开局"）——那是 `spec/` 六契约的事，本层只写"开局校验代码放在哪、怎么被断言守住"。
- **不写欠账与验收**——在 `tasks/05-待修欠账.md` 与 `tasks/06-真机验收清单.md`。
- **不写不变量与原则**——在 `constitution/`。

## 维护约定

- 改实现先对照 `spec/` 的契约：代码与契约冲突时，判断是实现偏了还是契约该改（改契约要走 `docs/specs/README.md` §三 的全链）。
- 文档里的数字必须可复算，且能在 `npm run check` 找到对应断言；找不到的标注「待验」。
- 层目录名用中文，文件名保留英文编号（`01-architecture.md` 这类是历史指代），H1 标题中文；代码文件保持英文。

## 代码指路

- `scripts/verify.js` —— 全项目静态校验，工程约束多数在此
- `utils/game/` —— 玩法内核的宿主，`02-minigame-contract.md` 契约的落点
