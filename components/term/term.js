'use strict';

// 术语解释：黑话第一次出现在页面上时，给一个轻量的「?」入口，点开是一句大白话。
// 解释不写在页面里，统一取 data/copy.js 的 TERMS —— 指南「名词速查」用的是同一份数据。

const copy = require('../../data/copy.js');

Component({
    properties: {
        termKey: { type: String, value: '' },
        label: { type: String, value: '' },
        // 深色卡（.card--ink）里要换一套文字色，否则浅色主题的次要文字会看不清。
        tone: { type: String, value: 'normal' },
    },

    data: {
        text: '',
        title: '',
        desc: '',
    },

    observers: {
        'termKey, label': function (key, label) {
            const t = copy.termOf(key);
            this.setData({
                text: label || (t ? t.name : ''),
                title: t ? t.name : (label || ''),
                desc: t ? t.desc : '',
            });
        },
    },

    methods: {
        onTap: function () {
            if (!this.data.desc) return;
            wx.showModal({
                title: this.data.title,
                content: this.data.desc,
                showCancel: false,
                confirmText: '知道了',
            });
        },
    },
});
