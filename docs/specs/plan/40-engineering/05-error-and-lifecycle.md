# 异常兜底、环形日志、页面生命周期

> 小程序里未捕获异常**不会崩进程**，只会安静地少做一件事。症状与「点了没反应」完全一样——所以必须有日志，也必须有兜底。

## 核心前提：失败要安静，但不能无声

小程序有个很坑的特性：异常不崩进程，只是悄悄地把那件事不做。玩家看到的就是「点了没反应」，和你漏注册一个页面、漏包一个隐私守卫的症状一模一样。这意味着我必须假设——**线上出问题，我只是看不到，不是没发生**。

所以我在 `app.js` 里放了三处兜底，一处都不许删：更新管理器（让玩家用上新版本）、三类异常记录（把「看不到」变成「能定位」）、丢页重定向（把旧链接救回来）。再配一个只留 20 条的环形日志——不求全，只求「最近出过什么」能在真机 vConsole 里搜到。

生命周期这块我同样按「别把人赶走」来设计：没登录但选了游客的，冷启动不许挡回登录页；没网但本机有进度的，照玩；冲突了不静默覆盖，让玩家自己选。这些判断单独看都像小事，合起来决定了玩家会不会在某一次打开后就不回来。

## 1. 概述

`app.js` 里有三处兜底不许删：**更新管理器**、**三类异常记录**、**丢页重定向**。它们是「真机排查只能靠猜」与「能定位」之间的唯一差别。

## 2. 三处兜底

### 2.1 `checkUpdate()` —— 新版只弹「重开」，不自动重启

```js
um.onUpdateReady(function () {
  wx.showModal({
    title: '新版本已备好',
    content: '重开一次就能用上新版本，本机进度不会丢。',
    confirmText: '重开', cancelText: '稍后',
    success: res => { if (res.confirm) um.applyUpdate(); },
  });
});
```

**为什么不自动重启**：自动重启会打断正在打的一局。

审核通过后玩家不会立刻拿到新版本——没有这段代码，玩家可能长期停在旧版上。

`onUpdateFailed` **什么都不做**：下载失败不打扰玩家，下次冷启动会再检查一次。

### 2.2 三类异常都进同一个环形日志

```js
onError(error)                 { this.recordError('error', error); }
onUnhandledRejection(res)      { this.recordError('promise', ...); }
onPageNotFound(res)            { this.recordError('route', p); ... }
```

**`onUnhandledRejection` 是最容易被忽略的一个**：Promise 里的失败默认没有任何人接。云同步、登录、音频全都走这一路——不在这里记一笔，线上就只剩「功能偶尔不生效」。

### 2.3 `onPageNotFound` —— 丢页回主页

```js
onPageNotFound(res) {
  const p = (res && res.path) || '';
  this.recordError('route', p);
  if (p.indexOf('pages/index/index') === 0) return;   // index 自身不重开
  wx.reLaunch({ url: '/pages/index/index' });
}
```

触发场景：旧版分享卡、改名后的手滑链接。

**`index` 自身不重开**是必需的——否则会形成 `reLaunch` 死循环。

静态校验已经守住「跳转目标必须是注册页」，这一段只兜**线上已经发生的那一种**。

## 3. 环形日志

三类异常（普通错误 / Promise 拒绝 / 丢页）都汇进同一个环形缓冲，像一条只保留最近 20 条的录音带：

```text
   onError ────────┐
   onUnhandled... ─┼──▶ recordError(kind, detail)
   onPageNotFound ─┘            │
                                ▼
        ┌─── 环形日志（最多 20 条）───┐
        │ [error] ...  [promise] ...  │
        │ [route] ...        ...      │  ← 满了就 shift 掉最旧的
        └────────────┬───────────────┘
                     ▼
         console.error('[参悟][kind]')  ← 真机 vConsole 搜「参悟」
```
*（结构示意，非实测截图；方框代表缓冲区，不代表日志界面。）*

```js
const ERROR_KEEP = 20;

recordError(kind, detail) {
  const item = { kind, detail: String(detail || '').slice(0, 300), at: Date.now() };
  this.globalData.errors.push(item);
  if (this.globalData.errors.length > ERROR_KEEP) this.globalData.errors.shift();
  try {
    console.error('[参悟][' + kind + ']', detail);
  } catch (e) { /* 控制台不可用就算了，绝不能因为记日志再抛一次 */ }
}
```

四条设计：

| 设计 | 理由 |
| --- | --- |
| 只留 20 条 | 内存不能无限长；20 条够定位「最近出过什么」 |
| `detail` 截到 300 字 | 一个巨大的错误对象会把内存撑爆 |
| **不落盘、不上报** | 落盘要多一套迁移与清理；上报要过隐私授权 |
| `console.error` 包在 `try` 里 | **记日志本身不许再抛异常** |

前缀 `[参悟][kind]` 是给真机 vConsole 用的：一眼能搜出「这个 App 的错」。

## 4. 页面生命周期

### 4.1 启动顺序

```
onLaunch
  ├─ store.setCloudAdapter(cloudSave)
  ├─ store.init()          ← 同步，先给页面一份本地缓存，避免白屏
  ├─ readGuest() → store.setGuest()
  ├─ watchNetwork()
  └─ checkUpdate()
onShow（第一次）
  └─ startBootstrap()      ← 异步，不阻塞首屏
```

**`store.init()` 必须是同步的**：它给页面一份本地缓存，页面才能立刻渲染。云端拉档在 `onShow` 里异步做，不阻塞首屏。

**但 `init()` 不许结算闭关。** 它后面紧跟的 `hydrate()` 会用云端档整个覆盖 `state`，先结算等于算一遍再扔掉；而且 `init()` 里那次存档不给云端留 pending 标记，`hydrate()` 就当作本机没改过。闭关统一在 `bootstrap()` 的每条分支末尾调 `store.settle()`——真机上的那个 bug 见 `docs/specs/tasks/05-欠账与待拍板台账.md` A6。

### 4.2 `bootstrap()` 的四个分支

```
hydrate()
 ├─ signed-out  → 游客？→ 直接 settle（不再挡登录页）
 │                否则  → reLaunch 到登录页
 ├─ conflict    → 弹「用云端 / 用本机覆盖」
 ├─ offline     → toast「暂时连不上云端，先用本机进度」+ 15 秒后重试
 └─ ok          → 摘掉游客标记、settle
```

**只有「确实未登录」才跳登录页**；网络问题一律保留本地进度离线可玩。

**游客态在这里有一处关键处理**：

```js
if (status === 'signed-out') {
  if (this.globalData.guest) { ...settle(); return { status: 'guest' }; }
  ...
}
```

没这一支，冷启动会把人挡回登录页——那是把人赶走最快的方式。

### 4.3 `onHide` —— 尽力补写云端

```js
onHide() { store.flush(); }
```

本地已在每次 `commit` 同步落盘；这里尽力把云端也补写一次。**即使请求被系统冻结，`pending` 标记会在下次启动补写，不会丢档。**

### 4.4 并发去重

```js
onShow() {
  if (this.awaitingLogin) return;
  if (!this.bootstrapped && !this.bootstrapPromise) this.startBootstrap();
  else if (this.bootstrapped) store.settle();
}
```

`bootstrapPromise` 是去重锁：`onShow` 可能被连续调用两次（切前后台），没有它会长出两个 `hydrate`。

`.then(ok, err)` 两支都要把 `bootstrapPromise` 置回 null——**只在成功分支置空，失败后永远不再重试**。

## 5. 页面侧的生命周期约定

| 时机 | 做法 |
| --- | --- |
| `onLoad` | `store.subscribe(this.listener)` |
| `onShow` | **先清再挂**定时器（两次 `onShow` 之间没走 `onHide` 时会叠出第二个） |
| `onHide` | 清定时器、`sfx.stopAll()` |
| `onUnload` | `store.unsubscribe`、清定时器、`controller.destroy()` |
| 参悟页切页 | `controller.destroy()`，**本局作废** |

### 5.1 参悟页的特殊约定

- `pageAlive` 标记：所有 `setTimeout` 回调开头都要 `if (!this.pageAlive) return;`
- 倒计时用 `this.countdownTimers` 数组存 id，`clearCountdown()` 全清；
- 中局切页 = 本局作废，所以**说明入口只能放在开局前**。

## 6. 网络恢复

```js
watchNetwork() {
  wx.onNetworkStatusChange(res => {
    if (res.isConnected && app.globalData.offline) app.retrySync();
  });
}
```

两条重试路径：

1. **网络恢复事件**（立即）；
2. **15 秒定时重试**（`scheduleRetry`，兜住「网络事件没触发」的情况）。

`retrySync` 的三种结果：`ok` → 摘掉 offline 标记 + toast；`conflict` → 弹冲突；其余 → 再排一次重试。

## 7. 冲突处理

```
进度有冲突
另一台设备也更新了这份进度。用云端那份，还是用本机这份覆盖？
[用本机覆盖]  [用云端进度]
```

**不静默覆盖**：静默覆盖等于丢档，而且是玩家发现不了的丢档。

`resolveConflict(!res.confirm)`：`confirm` 是「用本机覆盖」，取反表示「是否用云端」。

处理失败时**递归再弹一次**（`app.askConflict()`）——冲突没解决就不该放人进去，否则下一次写入又会冲突。

## 8. 被否决的方案

这批否决可以归成一句话：**宁可自己多兜一层，也别把风险转嫁给玩家或未来的维护者**。不自动重启是怕打断玩家那一局；不静默覆盖、不无网挡页、冲突不放行，都是怕玩家在不知情的情况下丢进度；`console.error` 包 `try`、不落盘不上报，则是怕「为了记日志又抛一次异常」这种自伤。

| 方案 | 为什么否掉 |
| --- | --- |
| 自动重启应用新版本 | 会打断正在打的一局 |
| 错误上报服务端 | 要过隐私授权，且这一层收益低于成本 |
| 错误落盘 | 多一套迁移与清理，收益不足 |
| 无网络时挡住页面 | 本机进度本来就能玩 |
| 静默用云端覆盖本机 | 丢档且玩家发现不了 |
| 冲突弹一次失败就放行 | 下一次写入还会冲突 |
| `console.error` 不包 try | 记日志本身抛异常会再触发一次 `onError`（递归） |
| `onShow` 不做去重 | 切前后台会长出两个 `hydrate` |

## 9. 代码指路

- `app.js`（283 行）—— 全部兜底与启动流程
- `utils/store.js` —— `init` / `hydrate` / `settle` / `flush` / `flushCloud` / `resolveConflict` / `setGuest`
- `utils/cloud-save.js` —— 云端适配器
- `pages/practice/practice.js` —— `pageAlive` / `countdownTimers` / `destroy`
- `tests/store.test.js` —— 11 个状态机用例

## 10. 待验

- `globalData.errors` **只在内存**，页面被杀就没了。真机排查依赖「问题发生时有人正在看 vConsole」。要真正可追溯，需要落盘（但当前决定不做）。
- `recordError` 的 `detail` 对 `onError` 传的是整个 error 对象，`String(error)` 得到的是 `[object Object]`——**`error` 事件的 detail 实际上经常是无信息的**，真正有用的是 `message` 字段。这一处应该改成 `error.message || String(error)`。
- 15 秒定时重试在长期离线时会一直排下去，**没有退避**（不会变成 30s / 60s），也没有次数上限。
- `askConflict` 失败时递归再弹，若云端持续不可用，玩家会被卡在弹窗循环里（每次点都会失败再弹）。
- `pageAlive` 只保护 `setTimeout` 回调；`setInterval` 的回调没有同样保护（靠 `clearTick` 清，但清理与回调之间有竞态窗口）。
