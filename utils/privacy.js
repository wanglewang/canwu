'use strict';

// 隐私接口的唯一入口：剪贴板、昵称输入这些能力，在玩家同意《隐私保护指引》之前
// 会直接失败（errno 112），而且不弹任何提示——玩家看到的就是「点了导出存档码没反应」。
// 这与「页面漏注册」是同一种最难查的故障：功能存在、按钮可点、什么都不发生。
//
// app.json 里 __usePrivacyCheck__ 打开之后，微信不会自动弹窗，必须先调
// wx.requirePrivacyAuthorize，官方授权框才会出来（自定义弹窗才用 onNeedPrivacyAuthorization，
// 这里不折腾，用官方那一个：文案由平台维护，玩家也更信）。
//
// 所以约定只有一条：**任何会碰隐私接口的动作，先 await 这里的 ensure()**。
// 不要在各页面自己写一遍，否则总有一天有一处忘了包。

// 基础库低于 2.32.3 没有这个 API：老版本本身就没有拦截机制，一律放行。
function supported() {
    return typeof wx !== 'undefined' && typeof wx.requirePrivacyAuthorize === 'function';
}

// 不做缓存。玩家随时可能在系统设置里撤回同意，缓存一个 true 就等于以后都不再问，
// 撤回之后所有剪贴板动作会静默失败；而已经同意的玩家再调一次，微信立即回 success、
// 不弹窗，代价小到可以忽略。宁可多问一次，也不要一次误判。
function ensure() {
    if (!supported()) return Promise.resolve(true);
    return new Promise(function (resolve) {
        wx.requirePrivacyAuthorize({
            success: function () { resolve(true); },
            fail: function () { resolve(false); },
        });
    });
}

// 用法：privacy.guard(function () { wx.setClipboardData(...) }, function () { toast('…') })
// 没同意就不执行，由页面决定那句话怎么说（不同动作的后果不一样）。
function guard(run, denied) {
    ensure().then(function (ok) {
        if (ok) { run(); return; }
        if (typeof denied === 'function') denied();
    });
}

// 打开平台上的《隐私保护指引》全文（授权框里点「查看」走的也是这个页面）。
function openContract() {
    if (typeof wx === 'undefined' || typeof wx.openPrivacyContract !== 'function') return false;
    wx.openPrivacyContract({ fail: function () { /* 后台没配指引时静默 */ } });
    return true;
}

module.exports = {
    ensure: ensure,
    guard: guard,
    openContract: openContract,
    supported: supported,
};
