# 登录页与游客入口

> 全站唯一不使用 `.pg` 的页面，也是唯一有「品牌区」的页面。它的使命只有两条：**能进得去**、**能接得上进度**。

## 1. 一句话

一块品牌头 + 一枚朱砂主按钮（微信登录）+ 一条游客出口 + 一条邮箱兜底 + 一块「已有本机进度怎么办」的说明面板 + 一行协议。

## 2. 目标与非目标

**目标**

- **不挡人**：不想登录的人能立刻开始玩，且进度能事后接上；
- 主操作只有一个（微信一键登录），不设密码；
- 登录失败要说清「为什么、还能怎么办」；
- 不收集多余的东西：不实现 `jscode2session`、不收集 AppSecret、不自行保存 openid。

**非目标**

- 不做注册表单、不做手机号登录；
- 不做「不登录就进不去」——审核与体验都不成立；
- 不使用通用蓝或微信绿（见下）。

## 3. 屏幕结构

```
参悟                                    ← 品牌字（朱砂，54rpx）
登录后接续你的修行                        ← 副标题

[        微信一键登录        ]           ← 朱砂实心主按钮
不设密码，用微信身份直接开始

[        先不登录 · 本机玩    ]           ← 细描边次按钮（游客）
[      使用邮箱验证码登录      ]           ← 细描边次按钮（展开）
  └ [login-panel]                        ← 展开后才渲染

┌ 已有本机进度？先在「道牒」导出存档码，   ┐
│ 登录后再导入，进度就接上了。            │  ← .login-note 墨面板
└─────────────────────────────────────┘

（错误 / 原因 / 正在读取云端存档…）

            《隐私政策》                    ← 整行可点，不做成按钮
```

## 4. 三个入口的分工

| 入口 | 类 | 结果 |
| --- | --- | --- |
| 微信一键登录 | `.btn-wechat`（朱砂实心） | `wx.login` → 云后端换会话 → `app.afterLogin()` |
| 先不登录 · 本机玩 | `.login-guest`（细描边） | `app.enterGuest()` → `switchTab` 到主页 |
| 使用邮箱验证码登录 | `.login-alt`（细描边） | 展开 `login-panel`，`bind:signedin` → `afterLogin()` |

### 4.1 游客态做了什么

`app.enterGuest()` 做四件事：

1. 落盘 `canwu_guest_v1`；
2. `store.setGuest(true)`，**让云端整层停用**（含**不写 pending**，否则同步条会说「有改动待同步」）；
3. 人物页显示「本机进度 · 未登录」+「登录以同步」；
4. 冷启动**不再**把人挡回登录页。

**第 2 条的「不写 pending」是最容易漏的一条**：游客态下每次存档都往 `canwu_pending_v1` 写一笔，同步条就会一直挂着「有改动待同步」，玩家以为坏了。

### 4.2 三种结果都不卡人

```js
if (result.status === 'ok' || result.status === 'offline' || result.status === 'conflict') {
    wx.switchTab({ url: '/pages/index/index' });
}
```

- `ok`：正常；
- `offline`：云端连不上但本机进度可用；
- `conflict`：冲突已由 app 层弹选择框。

**只有真正的失败（`error`）才留在登录页并显示错误。**

## 5. 为什么这一页不用 `.pg`

```css
.login-page {
    padding: var(--sp-16) var(--sp-10);
    padding-bottom: calc(var(--sp-16) + env(safe-area-inset-bottom));
    background-color: var(--c-imm-bg);
    color: var(--c-imm-text);
}
```

两条原因：

1. **`.pg` 的左右留白是 28rpx**（`--page-x`），登录页需要更宽的品牌留白（40rpx）；
2. 更重要的是**双保险**：这一页直接取 `--c-imm-*` 全局令牌，不取 `.pg--imm` 映射后的 `--c-bg` / `--c-text`。因为 `.pg--imm` 是**类选择器**——一旦某个环境没命中，页面会退回 `tokens.wxss` 的浅米底 + 深色字，整页看着就是「几行没有样式的纯文字」。

登录页是全站第一个门面，这个风险必须在它身上消掉。

**代价**：`padding` 简写会盖掉全局兜底，所以 `env(safe-area-inset-bottom)` 必须在这里再写一次（文件里明确注释了这一点）。

## 6. 朱砂按钮的三处特别写法

```css
.btn-wechat {
    background-color: var(--c-imm-gold);
    background-image: linear-gradient(to bottom, var(--c-imm-gold), var(--c-imm-gold-deep));
    color: var(--c-imm-bg);
    height: var(--touch);
    line-height: 1;
}
```

1. **底色与渐变分开写**：`background: linear-gradient(...)` 里色标用变量，任何一个解析失败整条 `background` 作废，按钮退化成「一行没有底色的字」。真机上极难排查；
2. **`line-height: 1`**：微信 `button` 默认行高 2.55，不锁死按钮会被撑高；
3. **`::after { border: none }`**：微信按钮默认有一圈伪元素边框。

## 7. 错误与状态文案

| 状态 | 位置 | 文案来源 |
| --- | --- | --- |
| `reason` | `.login-error` | URL query（`decodeURIComponent` 后） |
| `error` | `.login-error` | 本页产生的错误 |
| `busy` | `.login-busy`（朱砂） | 「正在读取云端存档…」 |

`reason` 是**上一页把人送过来时带的原因**（例如「会话已过期」）。用 `decodeURIComponent` 包在 `try` 里：非法编码会让整页崩，退化成原文即可。

**日志纪律**：

```js
console.error('[WorkBuddy Cloud] login failed', JSON.stringify({ stage, message }));
```

只记阶段与消息，**不记原始错误对象、不记登录 code、不记会话内容**。

## 8. 协议那一行

```
同意《用户协议》与《隐私政策》继续
```

- 整行可点（`.login-legal`），点开 `?topic=privacy`；
- **不做成按钮**：和上面的操作抢层级；
- 链接部分是朱砂，正文是注脚灰。

## 9. 被否决的方案

| 方案 | 为什么否掉 |
| --- | --- |
| 不登录不让进 | 审核不通过，体验也不成立 |
| 游客进度不可迁移 | 玩家白玩，必须有导出 / 导入这条兜底 |
| 用微信绿做登录按钮 | 与墨金体系撞色；这一页只有一支强调色 |
| 把协议做成勾选框 | 微信小程序的隐私授权走 `wx.requirePrivacyAuthorize`，页面上做勾选是假控件 |
| 登录失败留在登录页死路 | `offline` / `conflict` 都放行 |
| 用 `.pg` + `.pg--imm` | 漏挂类选择器时整页掉样式；这一页是门面，不能有这种风险 |
| 记录 code 与会话做排查 | 敏感信息不入日志 |

## 10. 代码指路

- `pages/login/login.wxml` / `.js` / `.wxss`
- `components/login-panel/` —— 邮箱验证码（`bind:signedin`）
- `app.js` —— `enterGuest()` / `afterLogin()`
- `utils/store.js` —— `setGuest()`（含 `clearPending`）、`canwu_guest_v1`
- `utils/cloud.js` —— `auth.signInWithWechat(code, appid)`
- `utils/privacy.js` —— 隐私授权守卫

## 11. 待验

- **`perks.easy` 与登录页无关，但登录页的 `showEmail` 状态不落盘**：展开邮箱登录后退出重进，会回到收起态。这可能是对的（默认主路径是微信），但没有明确记录。
- `.login-page` 的 `padding` 用 `--sp-16`（64rpx）做上留白，在矮屏（例如 iPhone SE）上品牌区 + 三个按钮 + 说明面板可能超一屏。**这一页的滚动体验未在真机上验过**。
- 游客态下「导出存档」依赖剪贴板 → 依赖隐私授权；未授权时导出会失败，而登录页没有任何「先去开权限」的引导。
- `reason` 来自 URL query，是**外部可控字符串**并直接上屏。目前只做 `decodeURIComponent`，没有长度限制与转义——虽然来源是自家页面，但 `onLoad` 的 query 理论上可被分享链接构造。
- 登录页是唯一不接 `onShareAppMessage` / `onShareTimeline` 的页面（这是刻意的）；若以后想分享「邀道友同修」，入口在人物页的背包块里，而不在这一页。
