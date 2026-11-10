# 参悟

一个修仙题材的**养成挂机 + 小游戏**微信小程序：练功法、参悟小游戏、攒熟练度与战力、突破境界、论道打对手，顺手收集称号与成就。

> 原生微信小程序 + WorkBuddy 云服务：微信一键登录（邮箱验证码兜底），进度按账号存云端并做版本隔离，本机留同步缓存。
> 当前状态：原型可玩，**未发布上线**；真机登录、云端读写、头像与榜单链路尚未验证。

## 玩法速览

| 系统 | 内容 |
| --- | --- |
| 资源与属性 | 灵气 / 灵石；体魄、灵力、悟性、身法 4 项属性 |
| 境界 | 炼气 → 筑基 → 金丹 → 元婴，突破需战力达标并完成一次「蓄力停区」 |
| 熟练度 | 未入门 / 入门 / 熟练 / 精通 / 大成，阈值 100 / 400 / 1000 / 2500；精通解锁技能特效与参悟便利 |
| 参悟 | 10 门功法对应 5 类玩法，每门各有一个独有机制；评级 S / A / B / C / F 决定收益 |
| 小游戏 | 追光点击、记序复现、阵灯推演、辨纹探禁、节律判定，外加突破专用的蓄力停区 |
| 挂机 | 离线最多累计 8 小时（1.2 灵气/分钟、2.5 熟练度/小时），可被技能与 buff 加成 |
| 论道 | 7 个预设 NPC + 3 个秘境 + 战力码镜像 + **真实玩家榜单镜像**，双方各 ±15% 战力波动 |
| 收集 | 10 门功法、13 个称号（可佩戴）、14 项成就、每日参悟目标、道牒卡片图 |
| 榜单 | 战力前 10 名真实玩家，自动挑一位战力最接近的道友供论道 |

首版只启用「青云界」（修仙）世界观；科幻、都市两套仅保留元数据。

## 小游戏设计

10 门功法平均挂到 5 类常规玩法上，每类 2 门；每门功法都有一个**别的功法没有的机制**（`data/practice.js` 的 `twist`）：

| 玩法 | 两门功法 | 独有机制 |
| --- | --- | --- |
| 追光点击 | 锻造敲击 / 夺宝抢手速 | 炉火升温（连击满 5 记提速、点空断连击）/ 金光夺宝（金光双倍计分，门槛同步抬高） |
| 记序复现 | 背功法口诀 / 踏石渡河 | 不示序号（闪烁只显印记、格子不重复）/ 石板留痕（两盏心神、已踏石板留高亮） |
| 节律判定 | 吸纳灵气 / 连招输入 | 一息绵长（判定窗更宽、收得更慢）/ 剑势凌厉（更快更窄、连拍浮字更盛） |
| 阵灯推演 | 参悟阵眼 / 排布阵灯 | 阵眼明示（开局标最优步数、两次感应）/ 五行分色（亮格按行列分五色） |
| 辨纹探禁 | 秘境探雷 / 破解封印 | 三盏心神（触雷只扣一盏并显形）/ 符箓照纹（两次照出一颗雷纹） |
| 蓄力停区 | 仅境界突破 | 长按蓄力、松手停在朱线区间，越近正中评级越高 |

- `minigames/theme.js` 给每门功法一套配色、格子符号、印章字与命中 / 失误 / 赞语文案；`pages/practice/` 通过根容器 CSS 变量下发到 wxss，并做了暗色覆盖。
- `minigames/common.js` 的 `vm` 统一带 HUD 字段：进度、实时评级、连击、目标、阶段横幅、浮字反馈、心神、副指标。页面据此渲染进度条、评级徽章、起手式倒计时、命中浮字与格子动效。
- 修掉了三个玩法漏洞：记忆序列闪烁时把序号写在格子上（等于直接给答案）、点击类点错毫无惩罚、扫雷触雷一击出局。金光夺宝的额外计分用 `gradeScale` 同步抬高评级门槛，避免同评级被刷穿。
- 节律盘用 CSS `transform: scale()` 呈现，不依赖 canvas 与触摸坐标；**真机上缩放、CSS 变量与动画效果仍需复核**。

## 角色资料与规则说明

- 道号 `roleName`、道相 `portrait`（0–5）、头像云存储路径 `avatar` 都是存档字段，随云端存档与 `CANWU1:` 存档码迁移；写入统一走 `engine.updateRole()`。
- 道相是 `components/portrait/` 里**纯 CSS** 绘制的角色形象，按编号换配色与法印、按境界增加光环层数，不需要图片资源也不需要授权。
- 微信登录只建立身份、不返回昵称头像。因此头像与昵称做成**主动选择式**：道牒编辑弹窗里 `chooseAvatar` 选微信头像、`type="nickname"` 输入框带出微信昵称，玩家自己决定用不用。不设头像就用道相。
- 头像上传到云存储 `users/<uid>/avatars/`，显示时用 1 小时签名 URL。**小程序 SDK 的 `storage.download` 不可用**，且签名 URL 由 `<image>` 加载还依赖 downloadFile 合法域名；拿不到 URL 会静默回退到 CSS 道相。这条链路需真机验证。
- `pages/guide/` 是集中式规则页，共 9 节，列出资源、挂机、熟练度、评级、小游戏、突破、论道、称号、存档、成就榜单与离线时间规则的全部数值；洞府页头与道牒各有入口。
- 面向玩家的页面文案不出现实现细节（数据化、换皮、SDK、RLS 等），这类说明只留在 README 与源码注释里。

## 目录结构

```
.
├── app.js / app.json / app.wxss     入口、页面注册、全局样式（含暗色与安全区）、会话引导
├── theme.json                       暗色 / 浅色的导航栏与 tabBar 变量
├── assets/tab/                      8 个 tabBar 图标（scripts/gen-icons.js 零依赖生成）
├── data/                            世界、功法、参悟方式、对手、称号、成就配置
├── utils/
│   ├── game.js                      养成内核：状态、收益、战力、对战、成就、存档码、版本迁移
│   ├── store.js                     单一状态源：同步读写、pending 补写、冲突处理、同步状态
│   ├── cloud.js                     唯一云客户端（endpoint / publishableKey 来自 publicConfig）
│   ├── cloud-save.js                云端存档：乐观锁、upsert 回退、冲突检测、强制覆盖
│   ├── cloud-social.js              榜单读写、真实玩家匹配、头像上传与签名 URL
│   ├── share.js                     统一分享文案
│   └── workbuddy-*.js               官方资产：表访问辅助与云请求诊断日志
├── components/
│   ├── login-panel/                 官方资产：邮箱验证码登录组件（兜底入口）
│   └── portrait/                    纯 CSS 道相
├── minigames/                       6 个玩法模块（5 类常规 + 突破专用）+ theme.js 主题表，统一 create(ctx) 接口
├── pages/
│   ├── index/ skills/ battle/       洞府 / 功法 / 论道（含榜单与真实玩家镜像）
│   ├── profile/                     道牒（道号、头像、成就、同步状态、存档、账号）
│   ├── practice/                    参悟（HUD、主题、起手式、评级结算、突破瓶颈）
│   ├── login/                       登录页（仅「确实未登录」时才跳）
│   └── guide/                       修行指南
├── scripts/
│   ├── verify.js                    零依赖静态校验
│   └── gen-icons.js                 生成 tabBar PNG
├── tests/                           常驻断言（game / store / minigames / layout，含假时钟整局驱动），node tests/run.js
├── eslint.config.js / .github/      lint 配置与可移植 CI
├── package.json / package-lock.json  固定版 SDK 与工程脚本
└── project.config.json              微信开发者工具项目配置
```

## 运行与预览

1. 用**微信开发者工具**「导入项目」，选择本仓库根目录（`miniprogramRoot` 为 `./`）。
2. `npm ci`（依赖已固定为 `@tencent-ai/workbuddy-cloud-sdk@0.1.4`，`package-lock.json` 入库）；在开发者工具里执行「**构建 npm**」，确认生成 `miniprogram_npm/@tencent-ai/workbuddy-cloud-sdk/miniprogram.js` 后再编译。升级 SDK 需重新构建 npm。
3. `project.config.json` 的 `appid` 已设为 `wx925cc80bd598d7ca`，`urlCheck: true`。云 SDK 请求统一走 `https://mp-api.app.workbuddy.host`，域名配置分两种情况：
   - **已授权第三方平台代管**（当前小程序即为此状态）：公众平台显示「服务器域名已禁用 / 已托管给第三方，不能在此进行管理」，由 WorkBuddy 平台代配，**无需也无法手工添加**。真机若报 `url not in domain list`，走平台预览 / 发布流程或联系支持；**不要为了改域名解除授权**，那会同时失去托管发布能力。
   - **域名由自己管理**：在「开发管理 → 开发设置 → 服务器域名 → request 合法域名」添加该域名，只填域名本身。开发期可临时勾选「详情 → 本地设置 → 不校验合法域名」（也可把 `urlCheck` 设为 false），**体验版与正式版绕不过去**，上线前需改回并复测。
4. 应用 `wbapp_jiVmdkW9TIl3n14p3QlIi5` 已开通云服务（Auth / Database / Storage），四项登录方式均已开启；代码接入微信一键登录 + 邮箱验证码兜底。微信登录要求小程序已绑定、运行时是真实 AppID。
5. 微信一键登录、头像选择、复制剪贴板等涉及用户信息的能力，发布时按微信弹出的**用户隐私保护指引**表单如实声明；仅写好工程内的清单文件不会让隐私接口自动生效。
6. H5 预览**无法**完成真实 `wx.login` 或验证云端读写，需在微信开发者工具 / 真机 / 体验版里验证。

## 登录与账号隔离

- 主入口 **微信一键登录**：`wx.login` 取 code + `wx.getAccountInfoSync().miniProgram.appId`（运行时真实 appid，不硬编码），调用 `cloud.auth.signInWithWechat(code, appid)`；后端换会话，前端不碰 AppSecret、不自存 openid。
- 兜底入口 **邮箱验证码**（发送 → 验证，无密码），默认折叠。两种方式共用 `app.js` 的 `afterLogin()`，身份隔离完全由会话 uid 决定。
- 冷启动 `app.js` 检查会话：**只有 `signed-out` 才跳登录页**；网络错误 / 云端读取失败一律保留本机进度离线可玩，显示提示并监听网络恢复自动重试。
- 云端表 `canwu_saves`：`owner_id TEXT NOT NULL DEFAULT auth.uid() UNIQUE`、`payload JSONB`、`version BIGINT DEFAULT 0`、`updated_at TIMESTAMPTZ`。归属由数据库填充，前端不传用户 ID。
- 已开启 RLS，SELECT / INSERT / UPDATE / DELETE 四条策略均限定 `owner_id = auth.uid()`；读写前先过 `cloud.auth.getSession()` 认证门。
- `version` 与 `updated_at` 由 **BEFORE UPDATE trigger 在服务端维护**（验证过前端伪造的 `updated_at` 会被 `now()` 覆盖），客户端不能改表刷时间或绕过版本。
- 榜单表 `canwu_scores`：`SELECT` 对所有人开放，`INSERT/UPDATE/DELETE` 仅本人；同样有服务端 `updated_at` trigger。写入时不传 `owner_id`。

## 存档可靠性

- 每次 `commit` **同步写本机** `canwu_save_v1` 并留下 `canwu_pending_v1` 标记；云端确认成功后才清除。切后台被冻结、断网、写失败都不会静默丢档——下次启动 `hydrate()` 先补写本地改动再读云端。
- 写云端带**乐观锁**：`.update(...).eq('id', rowId).eq('version', expectedVersion)`，0 行命中会再查一次区分「版本被别的设备推进」与「行被删」。冲突时不自动覆盖，弹窗让玩家选「用云端那份」或「用本机覆盖」。
- `rowId` 失效、插入撞唯一约束（23505）、行被移除等路径都有重新对齐 / 重建逻辑，不会卡在英文报错上。
- 关键操作（突破、结算、领奖、改名、买功法、导入、论道）走 `store.commitCritical()` 跳过 1.2 秒防抖立即回写；其余改动沿用防抖，并发 flush 复用同一个在途请求。
- 道牒页顶部与洞府页有**同步状态条**：已同步时间 / 待同步 / 失败原因 / 冲突，点一下可手动重试。
- 每日份例与离线收益使用单调时钟：时间回拨不会重开份例或倒着补收益。**彻底防作弊仍需服务端时间裁定，当前版本未接**。
- `SAVE_VERSION = 2`，`migrateState()` 是基于版本的迁移框架；v1 老档（含 `CANWU1:` 存档码导入）自动升级并补 `avatar` 字段。
- 云端无档时建新档，**本机旧进度不会自动上云**；要保留就先在道牒导出存档码，登录后导入。退出登录清本机缓存，云端保留。

## 榜单、分享与主题

- 进入论道 / 道牒页会把自己的战绩写进榜单（30 秒节流）；榜单读所有人、写仅本人。挑战力最接近的其他玩家生成镜像，用 `engine.battleRival()` 论道；榜单只有自己时回退到预设 NPC。
- 洞府、论道、道牒、指南页都支持 `onShareAppMessage` / `onShareTimeline`；道牒的 canvas 卡片图可经 `showShareImageMenu` 直接分享（不支持时回退预览）。
- `darkmode: true` + `theme.json` 让导航栏与 tabBar 跟随系统；`app.wxss` 有一组基础暗色覆盖，`.pg` 与登录页补了 `env(safe-area-inset-bottom)`。暗色是基础适配，真机上仍需逐页核对对比度。

## 界面与按钮约定

- **主操作常驻拇指区**：洞府页底部有 `sticky-bar` 吸底主按钮「开始参悟 · 推荐功法」，`.pg--with-bar` 预留底部空间；tabBar 已有的「论道 / 道牒」不再在页面底部重复放按钮。论道、道牒、指南等仍靠 tabBar 与页面内跳转。
- **弹窗统一「次操作在左、主操作在右」**：取消 / 关闭 / 次要动作一律 `btn--plain` 在左，`btn--primary` / `btn--gold` 在右（功法详情的主按钮由 `wx:if` / `wx:elif` 互斥渲染，也排在最右）。
- **危险操作降权但明示**：重置存档、退出登录用 `btn--warn` 警示样式，与常规操作之间加分隔线与提示文字，均为 `wx.showModal` 二次确认。分享类次要动作降为 `.text-link` 文字链。
- **触控热区**：`.btn` ≥ 84rpx、`.btn--small` ≥ 72rpx、`.text-link` ≥ 64rpx；纯文字点击入口一律补 `.text-link`。`.btn-row` 自带 20rpx 上边距会覆盖 `.mt12` / `.mt16`，需间距时用 `.btn-row--tight` / `--mid`。
- **减少重复整宽按钮**：论道页 10 个对手 / 秘境的挑战按钮改为卡片右侧 `btn--compact`；洞府与道牒的「世界」占位区块默认折叠。
- **局内操作分区**：参悟页「收功」是退出操作，移到盘面上方右侧 `.icon-btn` 并加「按走火结算」确认，避免和撤销 / 提示一起放在拇指热区误触；撤销 / 提示改到局内 `sticky-bar`。
- `tests/layout.test.js` 把以上约定固化为 11 项断言（含 WXML 标签配平、事件方法与 js 定义对应、弹窗顺序、热区尺寸、安全区留白）。

## 开发约定与工程命令

- **内容即数据**：新增功法、参悟方式、对手、称号、成就或调数值，只改 `data/`，不动业务代码。
- **小游戏统一接口**：`create(ctx) -> controller`，见 `minigames/common.js`，注册表在 `minigames/index.js`；`ctx.theme` / `ctx.twist` 决定表现与独有机制。新增玩法只需实现模块 + 在 `data/practice.js` 挂一门功法。
- **单一状态源**：页面只读 `store.get()`，写走 `store.commit()` / `commitCritical()`，刷新靠 `store.subscribe()`；页面保持同步 API，云读写后台异步。
- **云客户端唯一**：`utils/cloud.js` 是全工程唯一初始化点；`store.setCloudAdapter()` 可替换存档实现。
- `'use strict'` + CommonJS，除云 SDK 与 ESLint 外无运行时依赖，不使用打包器。

```bash
npm ci            # 按 lock 还原依赖
npm run verify    # JSON / JS 语法 / 页面组件四件套 / 主题变量 / tabBar 图标 / 隐私清单格式
npm test          # 59 项常驻断言（内核 + 存档同步 + 小游戏假时钟整局 + 布局约定）
npm run lint      # ESLint 9（小程序全局对象与 CommonJS 已配置）
npm run check     # 上面三项一次跑完，CI 用这个
npm run icons     # 重新生成 tabBar 图标（零依赖）
```

`.github/workflows/ci.yml` 是可移植的 CI 模板（`npm ci` → `npm run check`）；仓库当前托管在 Gitee，若要启用 Gitee Go 需按其配置格式另配一份，命令相同。

## 当前边界

**已验证**：数据库表结构、trigger 覆盖伪造时间并自增版本、两张表的 RLS 策略、写入读回与探针清理；118 项静态检查、59 项 Node 断言（含 23 项小游戏假时钟整局驱动、11 项布局约定断言）、ESLint 0 错误 0 警告；SDK 稳定版安装与 lock 生成；图标 PNG 结构；全部 WXML 主要标签配平、事件方法与 js 定义一一对应。

**尚未验证（必须真机）**：微信开发者工具编译与「构建 npm」、真机 / 体验版微信登录、真机云端存档读写与冲突弹窗、榜单读写、头像上传与签名 URL 显示、暗色与安全区实际渲染；**吸底操作条与原生 tabBar 的层叠关系、`env(safe-area-inset-bottom)` 在刘海屏上的实际留白、折叠交互、收功确认弹窗**；节律盘的 CSS 缩放、主题色变量、格子与浮字动效、5 类玩法的触屏手感；发布上线。H5 预览不能证明这些可用。

**已知限制**：头像跨设备显示依赖签名 URL 与 downloadFile 合法域名，域名由第三方代管时若平台未放行会回退道相；离线收益与每日刷新用本机时钟，不能防恶意改表；榜单是「上传战绩 + 镜像对战」，不是实时同步 PVP；科幻 / 都市两套世界仍只是元数据。

`.workbuddy/`（项目记忆、应用注册）、`*.genie`（含本机绝对路径的预览卡）与 `node_modules/` 由 `.gitignore` 排除，不入库。

工程基线来自官方 `workbuddy-native-basic@1.0.0` 模板。
