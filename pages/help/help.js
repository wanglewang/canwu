'use strict';

const pageTheme = require('../../utils/theme.js');
const helpData = require('../../data/help.js');
const copy = require('../../data/copy.js');
const share = require('../../utils/share.js');

// 分享查询串的唯一出口：onShareAppMessage 用带 ? 的路径，onShareTimeline 只要 `k=v&k=v`。
// 参悟页的说明按功法与本段现拼：method/game 定是哪一门，stage 定这一段的具体评级线。
// 以前这里漏了 stage，从准备页点进说明看到的却是第一段的数字，转发出去也一样错。
function shareQuery(page) {
    const parts = [];
    if (page.topicKey) parts.push('topic=' + page.topicKey);
    const t = page.topicQuery || {};
    if (page.topicKey === 'practice') {
        if (t.method) parts.push('method=' + t.method);
        if (t.game) parts.push('game=' + t.game);
        if (t.diff) parts.push('diff=' + t.diff);
        if (t.stage) parts.push('stage=' + t.stage);
    }
    return parts.join('&');
}

Page({
    data: {
        themeTone: 'light',
        title: '',
        lead: '',
        sections: [],
        terms: [],
        termsOpen: false,
        copy: copy.UI,
    },

    onLoad: function (query) {
        pageTheme.syncPage(this);
        // 参悟页的说明是「一门一册」，要按功法现拼；其余主题是静态表。
        // （onShow 只同步皮肤，主题内容留在 onLoad 现拼一次。）
        const q = query || {};
        // 分享要落回同一册：主题 key 记在实例上（不放进 data，WXML 用不到）。
        this.topicKey = q.topic || '';
        // 参悟页的说明是「一门一册」，里面按功法名与本段列出 S/A/B/C 门槛。
        // 这四个参数必须记下来一起转发，否则对方点开只剩一份不带功法名、
        // 或者带着第一段门槛的旧稿——后一种更坏，因为数字看着像真的。
        this.topicQuery = {
            method: q.method || '',
            game: q.game || '',
            diff: q.diff || '',
            stage: q.stage || '',
        };
        const topic = q.topic === 'practice'
            ? helpData.practiceTopic({
                method: q.method,
                game: q.game,
                diff: q.diff,
                stage: q.stage,
            })
            : helpData.topicOf(q.topic);
        // 「说明」页是共用容器，导航栏留空会把「你现在看的是哪一页」丢掉，
        // 所以标题按主题动态给出「人物 · 说明」——这一层就够了，页内不再画第二个标题。
        // 页级说明带「· 说明」后缀（人物 · 说明）；隐私与协议本身就是完整标题，
        // 由主题自己给 navTitle，不再拼后缀。
        wx.setNavigationBarTitle({ title: topic.navTitle || (topic.title + ' · 说明') });
        this.setData({
            title: topic.title,
            lead: topic.lead,
            // 默认全折叠：点哪一节展开哪一节，不把说明书一次糊到脸上。
            sections: topic.sections.map(function (s) {
                return { key: s.key, title: s.title, lines: s.lines, open: false };
            }),
            terms: copy.TERMS.map(function (t) {
                return { key: t.key, name: t.name, desc: t.desc };
            }),
            termsOpen: false,
        });
    },

    onShow: function () {
        pageTheme.syncPage(this);
    },

    onToggle: function (event) {
        const key = event.currentTarget.dataset.key;
        this.setData({
            sections: this.data.sections.map(function (s) {
                return s.key === key ? { key: s.key, title: s.title, lines: s.lines, open: !s.open } : s;
            }),
        });
    },

    onToggleTerms: function () {
        this.setData({ termsOpen: !this.data.termsOpen });
    },

    onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

    // 分享落回同一册说明，而不是首页：转给道友的那一节，点开就是那一节。
    // 隐私与协议自己就是一个完整标题，不再套「修行指南」那句。
    onShareAppMessage: function () {
        const text = this.topicKey === 'privacy' ? this.data.title : copy.SHARE.help;
        const qs = shareQuery(this);
        return share.page(text, '/pages/help/help' + (qs ? '?' + qs : ''));
    },
    onShareTimeline: function () {
        return share.pageTimeline(this.topicKey === 'privacy' ? this.data.title : copy.SHARE.help,
            shareQuery(this) || 'from=timeline');
    },
});
