# 参悟

一个修仙题材的**养成挂机 + 小游戏**微信小程序原型：练功法、参悟小游戏、攒熟练度与战力、突破境界、论道打预设对手，顺手收集称号。

> 原生微信小程序静态版：无后端、无账号、无 npm 依赖、无构建步骤，全部进度存在本机。
> 当前状态：原型可玩，**未发布上线**。

## 玩法速览

| 系统 | 内容 |
| --- | --- |
| 资源与属性 | 灵气 / 灵石；体魄、灵力、悟性、身法 4 项属性 |
| 境界 | 炼气 → 筑基 → 金丹 → 元婴，突破需战力达标并完成一次「蓄力停区」 |
| 熟练度 | 未入门 / 入门 / 熟练 / 精通 / 大成，阈值 100 / 400 / 1000 / 2500；精通解锁技能特效与参悟便利 |
| 参悟 | 10 种参悟方式，映射到 4 个底层小游戏；评级 S / A / B / C / F 决定收益 |
| 小游戏 | 限时点击、记忆序列、点灯、扫雷，外加突破专用的蓄力停区 |
| 挂机 | 离线最多累计 8 小时（1.2 灵气/分钟、2.5 熟练度/小时），可被技能与 buff 加成 |
| 论道 | 7 个预设 NPC + 3 个秘境，双方各 ±15% 战力波动，首胜掉落功法；也支持战力码镜像对战 |
| 收集 | 10 门功法、13 个称号（可佩戴）、每日参悟目标、日志与角色卡片图 |

首版只启用「青云界」（修仙）世界观；科幻、都市两套仅保留元数据，用于验证同一套系统可换皮复用。

## 目录结构

```
.
├── app.js / app.json / app.wxss     小程序入口、页面注册与全局样式
├── data/                           纯数据配置：世界、功法、参悟方式、对手、称号
├── utils/
│   ├── game.js                     养成内核：状态、收益、战力、对战、存档、称号判定
│   └── store.js                    单一状态源：读写、订阅、离线结算、落盘
├── minigames/                      5 个小游戏，统一 create(ctx) 接口
├── pages/
│   ├── index/                      洞府（主页、挂机收益、境界）
│   ├── skills/                     功法（习得、熟练度、技能效果）
│   ├── battle/                     论道（NPC / 秘境 / 战力码）
│   ├── profile/                    道牒（称号、存档导入导出、角色卡片）
│   └── practice/                   参悟（小游戏、评级结算、突破瓶颈）
├── project.config.json             微信开发者工具项目配置
└── sitemap.json
```

## 运行与预览

1. 用**微信开发者工具**「导入项目」，选择本仓库根目录即可（`miniprogramRoot` 为 `./`）。
2. `project.config.json` 里的 `appid` 目前是 `touristappid`（游客模式）。要真机预览或发布，请替换成自己的小程序 AppID。
3. 不需要 `npm install`，不需要云开发，也不需要编译构建。
4. 在 WorkBuddy 中也可通过应用卡 `wbapp_jiVmdkW9TIl3n14p3QlIi5` 预览（本地卡，未发布）。

## 数据与存档

- 存档键：`canwu_save_v1`，通过 `wx.setStorageSync` 落在本地。`store.commit()` 每次写操作后立即落盘。
- 「道牒」页可导出 / 导入存档（导出串以 `CANWU1:` 开头），换设备或清缓存前请先导出；论道页的战力码以 `CW1-` 开头。
- `game.normalizeState()` 会对读档做归一化与数值兜底，旧版存档可读。
- 数据只在本机，没有服务器同步，也没有账号体系。

## 开发约定

- **内容即数据**：新增功法、参悟方式、对手、称号或调数值，只改 `data/` 下的文件，不动业务代码。`data/world.js` 集中放全局阈值与挂机数值。
- **小游戏统一接口**：`create(ctx) -> controller`，`ctx` 含 `params / difficulty / perks / tip / render(vm) / finish(result)`，`result` 含 `grade / score / summary`。约定见 `minigames/common.js`，注册表在 `minigames/index.js`。换题材包装只需改 `data/practice.js`。
- **单一状态源**：页面只读 `store.get()`，写操作一律走 `store.commit()`，跨页面刷新用 `store.subscribe()`；所有持久化集中在 `game.save()`。
- 源码为 `'use strict'` + CommonJS（`require` / `module.exports`），ES6 语法，不引入构建工具或第三方包。

本地静态校验（可选）：

```bash
# JSON 可解析
for f in $(find . -name '*.json' -not -path './.git/*'); do node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" || echo "FAIL $f"; done
# JS 语法
find . -name '*.js' -not -path './.git/*' -exec node --check {} \;
```

## 当前边界

- 尚未做微信开发者工具编译与真机预览，也未做发布上线；开发期只做过 JSON / JS 静态校验与 Node 模拟长流程压测。
- 未接入云服务、登录、排行榜或真实 PVP；论道对手全是本地预设数据。
- `.workbuddy/`（项目记忆、应用注册）与 `*.genie`（含本机绝对路径的预览卡）由 `.gitignore` 排除，不入库。

工程基线来自官方 `workbuddy-native-basic@1.0.0` 模板。
