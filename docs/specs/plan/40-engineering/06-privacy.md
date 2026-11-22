# 隐私授权与接口守卫

> 剪贴板与昵称输入在玩家同意《隐私保护指引》之前**会直接失败，且不弹任何提示**。玩家看到的只是「点了导出存档码没反应」——这与「页面漏注册」是同一种最难查的故障。

## 核心前提：把「静默失败」变成一句人话

难查的地方在于「什么都没发生」：没有报错、没有弹窗，只有一句「点了没反应」，你得先怀疑是不是页面漏注册。

所以我把所有碰隐私接口的动作都收进 `utils/privacy.js` 这一个入口，页面只管调 `ensure()` 或 `guard()`。守卫要做的事很简单：没同意就别执行，并且**说清楚为什么没反应**——「需先同意隐私指引才能复制」比沉默强一百倍。

有一条判断我特别看重：**不缓存授权结果**。玩家随时可能在系统设置里撤回同意，缓存一个 `true` 就等于以后都不再问，撤回之后所有剪贴板动作会静默失败。而已经同意的玩家再调一次，微信立即回 `success`、不弹窗——所以「宁可多问一次，也不要一次误判」。

## 1. 概述

`utils/privacy.js` 是隐私接口的**唯一入口**：任何会碰隐私接口的动作，先 `await ensure()` 或包进 `guard()`。不许在各页面自己写一遍。

## 2. 目标与非目标

**目标**

- 一处守卫，全站复用；
- 未同意时说清「为什么没反应」，而不是静默失败；
- 撤回同意要能**立刻**失效；
- 老基础库（没有这套 API）一律放行，不因为版本低就不能用。

**非目标**

- 不做自定义授权弹窗（用平台官方那一个）；
- 不缓存授权结果。

## 3. 三层结构

```
app.json  __usePrivacyCheck__: true
   ↓   （打开后微信不再自动弹窗）
wx.requirePrivacyAuthorize()     官方授权框
   ↓
utils/privacy.js  ensure() / guard() / openContract()
   ↓
页面：剪贴板、昵称输入
```

### 3.1 为什么用官方授权框

注释里写得很直接：

> 自定义弹窗才用 `onNeedPrivacyAuthorization`，这里不折腾，用官方那一个：**文案由平台维护，玩家也更信**。

自定义弹窗要自己写文案、自己处理「拒绝后还能不能再问」、自己跟平台状态同步——收益是样式统一，成本是一整套状态机。

### 3.2 `__usePrivacyCheck__` 必须为 `true`

```json
{ "__usePrivacyCheck__": true }
```

关掉它，隐私接口被拦时**不会弹授权框**——直接失败。`verify` 1c 段硬性核对这一项。

## 4. `ensure()` —— 不做缓存

```js
function ensure() {
    if (!supported()) return Promise.resolve(true);
    return new Promise(function (resolve) {
        wx.requirePrivacyAuthorize({
            success: function () { resolve(true); },
            fail: function () { resolve(false); },
        });
    });
}
```

### 4.1 为什么不缓存

> 玩家随时可能在系统设置里撤回同意，缓存一个 `true` 就等于以后都不再问，撤回之后所有剪贴板动作会静默失败；而已经同意的玩家再调一次，微信立即回 `success`、不弹窗，代价小到可以忽略。**宁可多问一次，也不要一次误判。**

这是全模块最重要的一条判断。缓存的收益是「省一次同步调用」，成本是「撤回同意后功能静默失效」。

### 4.2 低版本一律放行

```js
function supported() {
  return typeof wx !== 'undefined' && typeof wx.requirePrivacyAuthorize === 'function';
}
```

基础库低于 2.32.3 没有这个 API——**老版本本身就没有拦截机制**，拦它反而会让功能不可用。

## 5. `guard(run, denied)` —— 页面用这个

```js
privacy.guard(
  function () { wx.setClipboardData({ data: code }); },
  function () { toast('需先同意隐私指引才能复制'); }
);
```

**没同意就不执行**，由页面决定那句话怎么说——不同动作的后果不一样（复制战力码 vs 导出存档码 vs 读剪贴板导入）。

## 6. 全站七个守卫点

| 页面 | 位置 | 干什么 |
| --- | --- | --- |
| `battle.js:77` | 复制战力码 | `setClipboardData` |
| `battle.js:88` | 粘贴来码 | `getClipboardData` |
| `profile.js:210` | 立道号（`type="nickname"` 输入框） | `ensure()` 单用 |
| `profile.js:275` | 复制战力码 | `setClipboardData` |
| `profile.js:297` | 复制文案（分享） | `setClipboardData` |
| `profile.js:416` | 导出存档 | `setClipboardData` |
| `profile.js:436` | 导入存档（读剪贴板） | `getClipboardData` |

**六个剪贴板调用 + 七个守卫**——「调用数 ≤ 守卫数」成立。

### 6.1 昵称输入为什么也算隐私接口

```html
<input type="nickname" ... />
```

`type="nickname"` 会让微信提供「用微信昵称填入」的快捷入口，这属于用户信息读取，同样受隐私授权约束。

`profile.js:210` 用 `ensure()` 而不是 `guard()`：这里不是在「执行一个动作」，而是要**先确认能开这个弹层**——未授权时应当给出说明而不是打开一个点了会失败的输入框。

## 7. 静态守卫：按调用数核对

```js
// verify.js 1c
for (const page of ['pages/profile/profile.js', 'pages/battle/battle.js']) {
  const calls  = (src.match(/wx\.(?:set|get)ClipboardData/g) || []).length;
  const guards = (src.match(/privacy\.guard\(/g) || []).length;
  if (!/utils\/privacy\.js/.test(src)) errors.push(page + ' 没接隐私授权模块');
  else if (guards < calls) errors.push(page + ' 有剪贴板调用没包进 privacy.guard（' + calls + ' 处调用 / ' + guards + ' 个守卫）');
}
```

**按数量核对，不靠人记**。这条断言的思路值得单独记下来：它不试图理解「哪个调用被哪个守卫包住」，只数个数。粗糙，但**新增一处未包的调用必然被抓到**。

## 8. 合规件清单

`verify` 1c 段一起核对的四项：

| 项 | 检查 |
| --- | --- |
| 隐私授权 | `app.json.__usePrivacyCheck__ === true` + `privacy.js` 里有 `requirePrivacyAuthorize` 与 `guard` |
| 协议入口 | 登录页与人物页各有一处 `topic=privacy`（审核会点这两处） |
| 客服 | 人物页设置里有 `open-type="contact"` |
| 游客入口 | 登录页有「先不登录 · 本机玩」 |

协议全文本身是 `pages/help/help?topic=privacy`，内容在 `data/help.js` 里；`openContract()` 另外提供「打开平台上配置的指引全文」的能力（授权框里点「查看」走的也是那个页面）。

后台没配指引时 `openContract` 静默失败——**这是刻意的**，不要在开发环境弹一个「未配置」的错误。

## 9. `openContract()` 的三个失败点

```js
function openContract() {
  if (typeof wx === 'undefined' || typeof wx.openPrivacyContract !== 'function') return false;
  wx.openPrivacyContract({ fail: function () { /* 后台没配指引时静默 */ } });
  return true;
}
```

| 情况 | 结果 |
| --- | --- |
| 无 `wx`（Node 测试） | 返回 `false` |
| 基础库不支持 | 返回 `false` |
| 后台没配指引 | 调用失败、静默，但返回 `true` |

**返回 `true` 而实际失败**是一个已知的小瑕疵（见待验）。

## 10. 被否决的方案

这一组否决其实在回答两个问题：**守卫放在哪**（集中一处，不要各页自己写），以及**要不要记住结果**（不要记，因为玩家随时会撤回）。「各页面自己调」「只登录页要一次授权」「用 `getSetting` 判断」都是想省事，但省下的是一个迟早会漏的口子；而缓存、低版本也拦，则是把「防得住」误当成「管得宽」。

| 方案 | 为什么否掉 |
| --- | --- |
| 各页面自己调 `wx.requirePrivacyAuthorize` | 总有一天有一处忘了包 |
| 缓存授权结果 | 撤回同意后功能会静默失效 |
| 自定义授权弹窗 | 文案要自己写、状态要自己跟平台同步 |
| 未同意时直接失败不提示 | 玩家看到的就是「点了没反应」 |
| 低版本也拦 | 老版本本身没有拦截机制，拦它等于让功能不可用 |
| 只在登录页要一次授权 | 撤回同意是玩家随时可做的动作 |
| 用 `wx.getSetting` 判断 | 隐私授权不在 `getSetting` 的返回里 |

## 11. 代码指路

- `utils/privacy.js`（53 行）—— `ensure` / `guard` / `openContract` / `supported`
- `app.json:35` —— `"__usePrivacyCheck__": true`
- `scripts/verify.js:73` 起 —— 1c 段的四项合规核对
- `pages/profile/profile.js` —— 5 处调用（含昵称）
- `pages/battle/battle.js` —— 2 处调用
- `data/help.js` —— `topic=privacy` 的全文

## 12. 待验

- **`openContract()` 在「后台没配指引」时返回 `true`**，调用方无法知道实际失败。若要修，应改成 Promise 并 resolve 真实结果。
- 静态断言只覆盖 `profile` 与 `battle` 两页。**新增页面若用剪贴板，必须手动加进那个 `for` 循环的数组**，否则完全不被检查。
- 断言只数 `privacy.guard(` 的出现次数，**不数 `privacy.ensure(`**。`profile.js` 的昵称输入用的是 `ensure`，靠「守卫数 4 > 调用数 3」被间接放过——若将来有一页全用 `ensure`，这条断言会误判。
- 「未同意时的提示文案」由各页面自己写，目前没有统一口径（有的说「需先同意隐私指引」，有的只说「复制失败」）。
- 撤回同意后的表现：`ensure()` 会再次 `fail`，`guard` 会走 `denied`。但**玩家能否重新同意**取决于平台的授权框逻辑——不做缓存让这条路成立，但没有真机验证过「撤回 → 再点 → 重新弹框」这个完整链路。
