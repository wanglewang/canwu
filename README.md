# 参悟

一个修仙题材的**养成挂机 + 小游戏**微信小程序：练功法、参悟小游戏、攒熟练度与战力、突破境界、论道打预设对手，顺手收集称号。

> 原生微信小程序 + WorkBuddy 云服务：微信一键登录（邮箱验证码兜底），进度按账号存云端，本机只留缓存。
> 当前状态：原型可玩，**未发布上线**，真机登录与云端读写尚未验证。

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

## 角色与规则说明

- 角色资料 `roleName`（道号，默认「外门弟子」）与 `portrait`（0–5 道相编号）都是存档字段，随存档码与云端存档一起迁移；写入统一走 `engine.updateRole()`，`normalizeState()` 对老存档缺字段时兜底为 0。
- 道相是 `components/portrait/` 里纯 CSS 绘制的角色形象：按编号换配色与法印，按境界增加光环层数，**不需要图片资源**；洞府页显示小像，道牒页显示大像并可「立道号 · 塑道相」。
- 微信登录只建立身份，**不返回昵称与头像**，因此道牒的账号区只显示「已登录」，名字由玩家自己立道号，不读取微信资料。
- `pages/guide/` 是集中式的玩法规则页，列出资源、挂机、熟练度、评级、小游戏、突破、论道、称号与存档的全部数值；洞府页头与道牒「关于参悟」各有一个入口。
- 面向玩家的页面文案不出现实现细节（数据化、换皮、服务器、SDK 等），这类说明只留在 README 与源码注释里。

## 目录结构

```
.
├── app.js / app.json / app.wxss     小程序入口、页面注册、全局样式与会话引导
├── data/                           纯数据配置：世界、功法、参悟方式、对手、称号
├── utils/
│   ├── game.js                     养成内核：状态、收益、战力、对战、存档码、称号判定
│   ├── store.js                    单一状态源：同步读写、订阅、离线结算、云端防抖同步
│   ├── cloud.js                    唯一云客户端（endpoint / publishableKey 来自 publicConfig）
│   ├── cloud-save.js               云端存档适配层：读写 canwu_saves
│   ├── workbuddy-data-access.js    官方资产：单表增删改查，0 行命中视为失败
│   └── workbuddy-cloud-diagnostics.js  官方资产：云请求失败诊断日志
├── components/
│   ├── login-panel/                官方资产：邮箱验证码登录组件（兜底入口）
│   └── portrait/                   道相：纯 CSS 角色形象，variant / realm 随存档同步
├── minigames/                      5 个小游戏，统一 create(ctx) 接口
├── pages/
│   ├── index/ skills/ battle/      洞府 / 功法 / 论道
│   ├── profile/                    道牒（称号、道号与道相、存档导入导出、账号与退出登录）
│   ├── practice/                   参悟（小游戏、评级结算、突破瓶颈）
│   ├── login/                      登录页（未登录时由 app.js 跳转）
│   └── guide/                      修行指南（玩法与数值，洞府 / 道牒两处入口）
├── package.json                    云 SDK 依赖
├── project.config.json             微信开发者工具项目配置
└── sitemap.json
```

## 运行与预览

1. 用**微信开发者工具**「导入项目」，选择本仓库根目录（`miniprogramRoot` 为 `./`）。
2. 安装依赖：`npm install`；小程序需在开发者工具中执行「构建 npm」，或使用 WorkBuddy 发布流程自动构建。
3. `project.config.json` 的 `appid` 已设为 `wx925cc80bd598d7ca`。云 SDK 请求统一走 `https://mp-api.app.workbuddy.host`，域名配置分两种情况：
   - **已授权第三方平台代管**（当前小程序即为此状态）：微信公众平台显示「服务器域名已禁用 / 已托管给第三方，不能在此进行管理」，域名由 WorkBuddy 平台代管，**无需也无法手工添加**。若真机报 `url not in domain list`，走 WorkBuddy 预览 / 发布流程或联系平台支持；不要为了改域名解除授权，那会同时失去托管发布能力。
   - **域名由自己管理**（未授权第三方时）：在小程序后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」添加该域名，只填域名本身（`https://` 开头，不带路径与端口）。开发期可临时勾选开发者工具「详情 → 本地设置 → 不校验合法域名」，体验版与正式版绕不过去。
4. 应用 `wbapp_jiVmdkW9TIl3n14p3QlIi5` 已开通云服务（Auth + Database），无需再建应用。
5. 微信一键登录的平台侧前提：预览面板右上角「分享」里**绑定已有小程序**（扫码授权），并在应用「云服务 → 身份认证」里启用**微信**登录方式。当前应用四项登录方式（邮箱 / 手机验证码 / 微信 / WorkBuddy 账号登录）均已开启；代码接入的是微信一键登录 + 邮箱验证码兜底，另两种虽有开关但没有页面入口。
6. 在 WorkBuddy 中可通过应用卡预览（H5 预览**无法**完成真实微信登录或验证云端读写，需在微信中验证）。

## 登录与账号隔离

- 主入口 **微信一键登录**：`wx.login` 取 code + `wx.getAccountInfoSync().miniProgram.appId`（运行时真实 appid，不硬编码、不用 `wbapp_…`），调用 `cloud.auth.signInWithWechat(code, appid)`；后端负责换会话，前端不实现 `jscode2session`、不收集 AppSecret、不自行保存 openid。登录只建立身份，**不获取头像昵称**。
- 兜底入口 **邮箱验证码**（发送 → 验证，无密码）：绑定或开关尚未配置好、或用户不愿用微信时仍可登录。组件在 `components/login-panel/`，默认折叠。
- 两种登录方式返回同一个 WorkBuddy 会话，共用 `app.js` 的 `afterLogin()`；身份隔离完全由会话 uid 决定，换登录方式不影响 `canwu_saves` 与 RLS。
- 前置条件：小程序已完成授权绑定、微信登录开关已启用（体验版 / 正式版各自检查）。H5 预览拿不到真实 `wx.login` code，**必须真机或体验版验证**。
- 冷启动时 `app.js` 检查会话；未登录则跳登录页，登录成功后按该用户身份拉取云端存档。
- 云端表 `canwu_saves`：`owner_id TEXT NOT NULL DEFAULT auth.uid() UNIQUE`、`payload JSONB`、`updated_at`。**归属由数据库填充，前端不传用户 ID**。
- 已开启 RLS，SELECT / INSERT / UPDATE / DELETE 四条策略均限定 `owner_id = auth.uid()`，即每个账号只能读写自己那一行；表已 GRANT 给 `authenticated, anon`。
- 读写前都先过 `cloud.auth.getSession()` 认证门；未登录不发任何表查询。

## 存档与本地缓存

- 登录后权威存档在云端；`canwu_save_v1` 只作为本机缓存，`store.commit()` 立即写本地并防抖（1.2 秒）回写云端，`App.onHide` 会补一次 flush。
- 云端没有该账号的存档时创建一份新档。**本机旧进度不会自动上云**：如需保留，先在「道牒」页导出 `CANWU1:` 存档码，登录后导入。
- 「道牒」页仍可导出 / 导入存档码；论道页战力码以 `CW1-` 开头。切换账号 / 退出登录会清空本机缓存，避免串号，云端存档保留。
- `game.normalizeState()` 对读档做归一化与数值兜底。
- 写入失败（未登录、网络错误、RLS 拒绝 0 行）会记录到 `store.getCloudError()`，不会静默当作成功。

## 开发约定

- **内容即数据**：新增功法、参悟方式、对手、称号或调数值，只改 `data/` 下的文件，不动业务代码。
- **小游戏统一接口**：`create(ctx) -> controller`，约定见 `minigames/common.js`，注册表在 `minigames/index.js`。
- **单一状态源**：页面只读 `store.get()`，写操作走 `store.commit()`，刷新靠 `store.subscribe()`。页面保持同步 API，云端读写是后台异步，不阻塞交互。
- **云适配层可替换**：`store.setCloudAdapter()` 注入 `{ load, save, resetRow }`，正式实现在 `utils/cloud-save.js`；`utils/cloud.js` 是全工程唯一的云客户端初始化点。
- 源码为 `'use strict'` + CommonJS，ES6 语法；除云 SDK 外不引入其他第三方包，不使用打包器。

本地静态校验（可选）：

```bash
# JSON 可解析
for f in $(find . -name '*.json' -not -path './.git/*'); do node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" || echo "FAIL $f"; done
# JS 语法
find . -name '*.js' -not -path './.git/*' -exec node --check {} \;
```

## 当前边界

- 已完成：云服务开通、`canwu_saves` 表与 RLS 策略、服务端写入读回验证、微信一键登录 + 邮箱兜底、会话引导、按用户隔离的存档同步、真实 AppID、可编辑道号与道相形象、修行指南页与玩家视角文案清理、静态校验。
- 平台侧状态（已在界面核对）：小程序已授权 WorkBuddy 第三方平台，服务器域名由平台代管、公众平台不开放手工修改；「微信」登录方式已开启；真实 AppID 已写入工程。
- **尚未验证**：预览面板「分享」中的绑定完成状态、微信开发者工具编译与「构建 npm」、真机 / 体验版登录、真机云端读写、发布上线。H5 预览不能证明这些能力可用。
- 未做排行榜与真实 PVP；论道对手仍是本地预设数据。
- `.workbuddy/`（项目记忆、应用注册）与 `*.genie`（含本机绝对路径的预览卡）由 `.gitignore` 排除，不入库。

工程基线来自官方 `workbuddy-native-basic@1.0.0` 模板。
