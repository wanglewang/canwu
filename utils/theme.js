'use strict';

// 昼夜皮肤：三档设置（跟随系统 / 白天 / 夜晚），默认跟随系统，可手动改。
//
// 【为什么主题解析放在 JS，而不是 CSS 的 prefers-color-scheme】
// 媒体查询只能问系统，玩家手动选的档位在 CSS 里没有东西能盖住它——class 能盖住值，
// 但盖不住「系统说是夜」这件事，两套路径同时存在时会各渲染一半，而且不报错。
// 所以这里把「设置 + 系统」合成一个确定结果 light / night：页面根节点挂
// .pg--t-night，原生栏 / 窗口底 / tabBar 由同一次调用改色。CSS 里只剩一个夜块。
//
// 【为什么原生栏要在每页都改一遍】
// wx.setNavigationBarColor 只作用于当前页面；页面栈里其他页仍停在旧色上。
// 所以每个页面的 onLoad / onShow 都要调 syncPage。
//
// 用法：
//   theme.syncPage(this)        // 页面 onLoad / onShow 第一行
//   theme.setMode('night')      // 玩家手动选：落本地存储，立即生效
//   theme.watch()               // app.onLaunch 调一次：系统切深浅时自动跟（auto 档）
//   theme.label()               // 「跟随系统 / 白天 / 夜晚」

const KEY = 'canwu_theme_v1';
const MODES = ['auto', 'light', 'night'];
const LABEL = { auto: '跟随系统', light: '白天', night: '夜晚' };

// 原生栏三处的颜色。原生栏不认 CSS 令牌，这是运行时唯一一份真源；
// theme.json 的 light / dark 两段与这里逐字相同，gen-icons.js 又从 theme.json 读色值出图，
// 链条是 tokens → theme.json →（本表 + png），scripts/verify.js 逐项比对，不许各写一份。
const CHROME = {
    light: {
        nav: '#fffcf2',
        navText: '#000000',
        window: '#f2e9d6',
        tabBg: '#fffcf2',
        tabColor: '#786850',
        tabSelected: '#c0442d',
        iconSuffix: '',
    },
    night: {
        nav: '#0f2030',
        navText: '#ffffff',
        window: '#08131c',
        tabBg: '#0f2030',
        tabColor: '#9fc3d4',
        tabSelected: '#f08160',
        iconSuffix: '-night',
    },
};

// tabBar 图标是纯色 png，不认 theme.json 的 @变量：底色跟着主题换、图标不会。
// 白天的墨褐图标压在夜里的 #0f2030 上等于消失，所以切主题时要换一套图。
const TAB_ICONS = ['home', 'book', 'seal'];

let iconApplied = '';

function hasWx() {
    return typeof wx !== 'undefined';
}

function readMode() {
    try {
        if (!hasWx() || !wx.getStorageSync) return 'auto';
        const v = wx.getStorageSync(KEY);
        return MODES.indexOf(v) >= 0 ? v : 'auto';
    } catch (e) {
        return 'auto';
    }
}

function systemTone() {
    try {
        if (!hasWx()) return 'light';
        // getAppBaseInfo 是 2.20.1 起的新接口；老基础库上退回 getSystemInfoSync。
        const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
        return info && info.theme === 'dark' ? 'night' : 'light';
    } catch (e) {
        return 'light';
    }
}

// 设置 + 系统 → 一个确定的结果。页面拿到的永远只有 light / night 两种。
function toneOf(mode) {
    if (mode === 'light' || mode === 'night') return mode;
    return systemTone();
}

function tone() {
    return toneOf(readMode());
}

function label(mode) {
    return LABEL[mode] || LABEL.auto;
}

function setMode(mode) {
    const next = MODES.indexOf(mode) >= 0 ? mode : 'auto';
    try {
        if (hasWx() && wx.setStorageSync) wx.setStorageSync(KEY, next);
    } catch (e) { /* 存不进去就本次会话有效，不影响当前这一次切换 */ }
    iconApplied = '';              // 档位变了，图标要重新比对一次
    const t = toneOf(next);
    applyChrome(t);
    return t;
}

// 每页 onLoad / onShow 第一行。setData 前先比一次：onShow 会反复进来，
// 同一个值重设会让 WXML 白跑一遍 diff，也会打断正在播的 transition。
function syncPage(page) {
    const t = tone();
    const lab = label(readMode());
    if (page && page.setData && page.data && (page.data.themeTone !== t || page.data.themeLabel !== lab)) {
        page.setData({ themeTone: t, themeLabel: lab });
    }
    applyChrome(t);
    return t;
}

function applyChrome(t) {
    const c = CHROME[t] || CHROME.light;
    if (!hasWx()) return;
    // 导航栏：frontColor 只认 #ffffff / #000000 两个值，不能传令牌色。
    if (wx.setNavigationBarColor) {
        wx.setNavigationBarColor({
            frontColor: c.navText,
            backgroundColor: c.nav,
            animation: { duration: 0 },
            fail: function () { /* 个别机型没开放，颜色退回 json 里那份 */ },
        });
    }
    // 窗口底：.pg 铺满一屏，正常看不到这一层；下拉回弹与内容不足一屏时露出来的是它。
    // page 元素的 CSS 背景是写死的白天值，类选择器改不到它，只能在这里补。
    if (wx.setBackgroundColor) {
        wx.setBackgroundColor({
            backgroundColor: c.window,
            backgroundColorTop: c.window,
            backgroundColorBottom: c.window,
            fail: function () { },
        });
    }
    // tabBar 三色：非 tab 页调这个必然失败，失败是正常路径，不要弹错。
    if (wx.setTabBarStyle) {
        wx.setTabBarStyle({
            color: c.tabColor,
            selectedColor: c.tabSelected,
            backgroundColor: c.tabBg,
            borderStyle: 'black',
            fail: function () { },
        });
    }
    setIcons(t);
}

function setIcons(t) {
    if (!hasWx() || !wx.setTabBarItem) return;
    if (iconApplied === t) return;
    const suffix = (CHROME[t] || CHROME.light).iconSuffix;
    let pending = TAB_ICONS.length;
    let failed = false;
    TAB_ICONS.forEach(function (name, index) {
        wx.setTabBarItem({
            index: index,
            iconPath: '/assets/tab/' + name + suffix + '.png',
            selectedIconPath: '/assets/tab/' + name + suffix + '-on.png',
            fail: function () { failed = true; },
            complete: function () {
                pending -= 1;
                // 有一个没换成就不记「已应用」：下次进页面会再试一次，
                // 否则冷启动那一次失败（tabBar 还没渲染）就永远停在错的那套图标上。
                if (pending === 0 && !failed) iconApplied = t;
            },
        });
    });
}

// 系统切深浅时，只有 auto 档该跟着变；手选了白天 / 夜晚的玩家不该被系统拽走。
// 但原生栏要**重新按我们选的档位刷一遍**：系统变化时框架会按 theme.json 重设一次导航栏
// 与 tabBar，不重刷的话，手选白天的玩家在系统切到深色那一刻会被拽回去。
function watch() {
    if (!hasWx() || !wx.onThemeChange) return;
    wx.onThemeChange(function () {
        const mode = readMode();
        applyChrome(toneOf(mode));
        if (mode !== 'auto') return;
        // 当前这一屏已经渲染完了，得把新结果推进它的 data，否则要等下一次 onShow 才换色。
        if (typeof getCurrentPages !== 'function') return;
        const pages = getCurrentPages();
        const top = pages[pages.length - 1];
        if (top && top.setData) top.setData({ themeTone: toneOf(mode) });
    });
}

module.exports = {
    KEY: KEY,
    MODES: MODES,
    CHROME: CHROME,
    TAB_ICONS: TAB_ICONS,
    readMode: readMode,
    systemTone: systemTone,
    toneOf: toneOf,
    tone: tone,
    label: label,
    setMode: setMode,
    syncPage: syncPage,
    applyChrome: applyChrome,
    watch: watch,
};
