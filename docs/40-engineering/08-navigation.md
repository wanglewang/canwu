# 导航层：三 tab + 六宫格 + 子页

> 三个 tab 是「大类」，六宫格是「去处」，子页是「那一件事」。整个组织只有一份数据：`data/navigation.js`。

## 1. 一句话

导航不是「页面里各写一遍跳转」，而是**一张纯数据表** + 三条规则：`TAB_ORDER` 与 `tabBar.list` 一一对应、`TILES` 每格进自己的页面、`HELP_TOPICS` 每页只有一个「说明」。

## 2. 三个 tab

| tab | 标题 | 职责 |
| --- | --- | --- |
| `index` | 主页 | 导航中枢：境界 + 六宫格 |
| `skills` | 功法 | 已持玉简 / 藏经阁 |
| `profile` | 人物 | 身份 / 属性 / 突破 |

**只有三个**。历史上曾经有四个（含「论道」），tabBar 里混着低频功能，最高频的「修炼」却只藏在洞府页一个吸底按钮后面。

### 2.1 修炼没有 tab

点一门功法**直接进参悟页**（`pages/practice`）。这样点哪门就进哪门的静室，不必先去一个中间页再换一次功法。

原来的 `pages/cultivate` 详情页已删除——它是「点一次就到位」之间的那一跳。

### 2.2 tab 的传参

tab 页不能带 query。这是 `switchTab` 唯一的硬限制，所以：

```js
// 别处想让玩家落在功法页的哪个分区，切过去前先写 globalData
app.globalData.skillsTab = 'shop';
wx.switchTab({ url: '/pages/skills/skills' });
// 功法页 onShow 读完即清，免得下次再进还停在那儿
```

`pendingSection` / `lastSkillId` 是同一套机制的两个用途。

## 3. 六宫格

```js
TILES = [
  { key: 'battle', label: '仙门切磋', glyph: '剑', mode: 'page', url: '/pages/battle/battle' },
  { key: 'secret', label: '秘境探索', glyph: '秘', mode: 'page', url: '/pages/secret/secret' },
  { key: 'board',  label: '战力仙榜', glyph: '榜', mode: 'page', url: '/pages/board/board' },
  { key: 'titles', label: '称号簿',   glyph: '印', mode: 'page', url: '/pages/titles/titles' },
  { key: 'log',    label: '修行日志', glyph: '录', mode: 'page', url: '/pages/log/log' },
  { key: 'guide',  label: '玩法说明', glyph: '典', mode: 'page', url: '/pages/guide/guide' },
];
```

**每一格都进自己的页面**，不许借道别的 tab。这条规则是从一次事故里长出来的：曾经「修炼」格是唯一违背它的，点了会 `switchTab` 到功法页，玩家以为坏了。

**glyph 用汉字单字**：`⚔ ✦` 这类字符在部分机型会被渲染成彩色 emoji，与墨底金线拼在一起非常跳。

## 4. 页面清单（12 个）

| 路径 | 标题 | 类型 |
| --- | --- | --- |
| `pages/index/index` | 主页 | tab |
| `pages/skills/skills` | 功法 | tab |
| `pages/profile/profile` | 人物 | tab |
| `pages/battle/battle` | 仙门切磋 | 子页（宫格） |
| `pages/secret/secret` | 秘境探索 | 子页（宫格） |
| `pages/board/board` | 战力仙榜 | 子页（宫格） |
| `pages/titles/titles` | 称号簿 | 子页（宫格） |
| `pages/log/log` | 修行日志 | 子页（宫格） |
| `pages/guide/guide` | 修行指南 | 子页（宫格） |
| `pages/practice/practice` | 参悟 | 子页（功法 / 主页） |
| `pages/help/help` | （动态） | 共用容器 |
| `pages/login/login` | 登录 | 门面 |

**`pages/help/help` 的标题是动态的**：`wx.setNavigationBarTitle({ title: topic.navTitle || topic.title + ' · 说明' })`。共用容器留空标题会丢掉「你现在看的是哪一页」。

## 5. `PAGE_TITLES` —— 标题只此一份

```js
const PAGE_TITLES = ['仙门切磋', '秘境探索', '参悟', '登录',
                     '修行指南', '修行日志', '战力仙榜', '称号簿'];
```

**为什么单独列一份**：`scripts/verify.js` 与 `tests/layout.test.js` 曾经各有一张表，拆秘境页时只改了其中一张，「加一页要记得改两处」这种约定等于没有约定。

现在两个校验器都读这一份。

## 6. 页面名必须等于入口名

> 页面名必须等于六宫格入口名。

历史上「入口写仙门切磋 / 页面标题写论道」曾经并存；「论道」现在只留在日志、成就分类这类叙事文案里。

`tests/layout.test.js` 守着这条。

## 7. 说明 vs 指南

| | 说明 `pages/help` | 指南 `pages/guide` |
| --- | --- | --- |
| 范围 | **这一页** | 全部 |
| 入口 | 每页页脚一个「此处说明 ›」 | 主页宫格 + 人物页设置 |
| 内容 | 按 `topic` 取静态表，或按功法现拼 | 11 章完整手册 |
| 折叠 | 默认全折叠 | 目录 + 逐节展开 |

```js
HELP_TOPICS = {
  index: 'home', skills: 'skills', profile: 'profile',
  battle: 'battle', secret: 'secret', board: 'board',
  titles: 'titles', log: 'log', guide: 'guide',
};
```

**参悟页不进 `HELP_TOPICS`**：它的说明不是「一页一节」，而是「一门一册」，要带 `method` / `game` / `diff` 三个参数：

```js
practiceHelpUrl(methodId, gameId, diffKey)  // → /pages/help/help?topic=practice&method=…&diff=…
```

传 `method` 就按参悟方式生成；冲关局没有功法，传 `game` 直接取蓄力停区的说明。

## 8. 三条硬约束

### 8.1 每个页面目录都必须注册进 `app.json.pages`

漏注册时 `wx.navigateTo` **静默失败**：「点参悟没反应」就是这么来的（页面文件齐全、旧断言全绿也拦不住）。

`verify` 双向核对：注册页四件套齐全 + 磁盘上 `pages/*` 都已注册 + **代码里写死的跳转目标都是注册页**。

### 8.2 同一个功能不许在两页各有一份

- 榜单只在 `board`；
- 秘境只在 `secret`；
- 对决结算卡抽成 `components/duel-result`。

反例（已修）：秘境探索曾经和同门对手挤在「仙门切磋」一页里，两段列表各自有按钮、各自有结算，首屏得先分清「哪一段是同门」才能点。

### 8.3 子页之间不再互相开入口行

`battle` 与 `secret` 曾各留一行「去对方那页」，与六宫格重复。

**指向由「本页说明」承担，返回交给原生导航栏。**

## 9. 原生导航是唯一导航

- 页面 `json` 的 `navigationBarTitleText` 与原生返回箭头 = 全部导航；
- 页内**不画**标题、不画 `‹`、不画第二个返回；
- 「说明」沉到页脚 `.pg__foot` 一行小字。

`.imm-head`（右上角单字动作）与 `.pg__head`（眉标 + 标题 + 说明）都已删除——它们等于第二层导航。

## 10. 分享必须落在自己那一页

除登录页外**每一页都接** `onShareAppMessage` / `onShareTimeline`：

| 页面 | 分享链接 |
| --- | --- |
| 参悟 | `?skillId=xxx` |
| 说明 | `?topic=xxx` |
| 其余 | 本页路径 |

**子页分享不许送回首页**——等于把刚看的东西丢了。

`verify` 1d 逐页守这两支方法 + 参悟分享必须带 `skillId`。

## 11. 被否决的方案

| 方案 | 为什么否掉 |
| --- | --- |
| 四个 tab（含论道） | 低频功能占 tab 位 |
| 「修炼」做成中间页 | 多一跳；点哪门就该进哪门 |
| 藏经阁做成独立页 | 它是功法页的第二个分区 |
| 切磋与秘境同页 | 首屏要分清两段才能点 |
| 子页互相开入口 | 与六宫格重复 |
| `help` 标题留空 | 丢掉「现在看的是哪一页」 |
| 页内再画返回箭头 | 两层导航 |
| glyph 用 emoji / dingbat | 部分安卓渲染成彩色 emoji |
| 两个校验器各写一张标题表 | 改一处必漏另一处 |

## 12. 代码指路

- `data/navigation.js`（94 行）—— `TAB_ORDER` / `TAB_LABELS` / `TILES` / `PAGE_TITLES` / `HELP_TOPICS` / `helpUrl` / `practiceHelpUrl` / `openTile`
- `app.json` —— `pages` 数组（12 项）、`tabBar.list`（3 项）、`lazyCodeLoading: requiredComponents`
- `pages/help/help.js` —— 动态标题
- `pages/skills/skills.js:onShow` —— `globalData.skillsTab` 的一次性传参
- `scripts/verify.js` 1c / 1d —— 注册双向核对、分享方法
- `tests/layout.test.js` —— 页面名一致性

## 13. 待验

- **删 tab 只动 `tabBar.list`，不要顺手删 `pages` 数组那一行**——页面可能仍被子页跳转引用。这条只写在注释里，没有断言守着。
- `openTile(app, tile)` 的 `app` 参数没有被使用（函数体只调 `wx.navigateTo`），**签名与实际不符**。
- `PAGE_TITLES` 是 8 项，而页面是 12 个：说明页动态、`practice` 已列、`login` 已列——但 `index` / `skills` / `profile` 三个 tab 的标题不在这张表里（它们靠 tabBar 的 `text`）。**三个 tab 与 8 个标题之间的对应关系是靠约定而不是数据**。
- 宫格六格的 `mode: 'page'` 字段目前全部相同，`openTile` 也只实现了一种模式——`mode` 是为「将来可能有 `tab` 型格子」预留的，目前是死字段。
- 分享链接不带 `from` 之类的来源参数，无法区分「从分享进来的」与「自己走到的」。
