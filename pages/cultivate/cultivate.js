'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

Page({
    data: {
        current: null,
        lastText: '',
        portrait: 0,
        realmIndex: 0,
        copy: copy.UI,
    },

    onLoad: function () {
        this.listener = this.refresh.bind(this);
        store.subscribe(this.listener);
        this.refresh();
    },

    onShow: function () { this.refresh(); },

    onUnload: function () { store.unsubscribe(this.listener); },

    // 只认一门功法：上次练的那门，其次推荐，再次第一门。没有就空着让人去功法页挑。
    refresh: function () {
        const state = store.get();
        const ov = engine.getOverview(state);
        const all = engine.getSkillList(state).filter(function (s) { return s.unlocked; });
        const app = getApp();
        let id = app.globalData.lastSkillId;
        if (!all.some(function (s) { return s.id === id; })) {
            const rec = engine.recommend(state);
            id = rec && rec.id && all.some(function (s) { return s.id === rec.id; })
                ? rec.id : (all.length > 0 ? all[0].id : '');
        }
        app.globalData.lastSkillId = id;
        const picked = all.filter(function (s) { return s.id === id; })[0];
        const rec = state.records ? state.records[id] : null;
        this.setData({
            portrait: ov.portrait,
            realmIndex: ov.realmIndex,
            current: picked ? {
                id: picked.id,
                name: picked.name,
                prof: picked.prof,
                percent: picked.percent,
                profTierName: picked.profTierName,
                nextThreshold: picked.maxed ? picked.prof : picked.nextThreshold,
                nextText: picked.maxed ? '已至大圆满' : '距 ' + picked.nextName + ' 还差 ' + (picked.nextThreshold - picked.prof),
            } : null,
            lastText: rec ? '上局 ' + rec.score + ' · 评价 ' + (copy.GRADE_TITLE[rec.grade] || rec.grade) : '尚无战绩 · 开局试试',
        });
    },

    onStart: function () {
        const id = getApp().globalData.lastSkillId;
        if (!id) { wx.switchTab({ url: '/pages/skills/skills' }); return; }
        wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
    },

    // 换功法 = 回功法页挑：那里既有列表也有图鉴，不在本页再实现一套选择器
    onGoSkills: function () { wx.switchTab({ url: '/pages/skills/skills' }); },

    onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('cultivate') }); },
});
