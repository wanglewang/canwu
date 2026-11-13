'use strict';

const helpData = require('../../data/help.js');
const copy = require('../../data/copy.js');

Page({
    data: {
        title: '',
        lead: '',
        sections: [],
        terms: [],
        termsOpen: false,
        copy: copy.UI,
    },

    onLoad: function (query) {
        const topic = helpData.topicOf(query && query.topic);
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
});
