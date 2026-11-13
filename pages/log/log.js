'use strict';

const store = require('../../utils/store.js');
const worldData = require('../../data/world.js');
const nav = require('../../data/navigation.js');
const copy = require('../../data/copy.js');

Page({
    data: {
        logs: [],
        worlds: [],
        worldOpen: false,
        copy: copy.UI,
    },

    onLoad: function () {
        this.listener = this.refresh.bind(this);
        store.subscribe(this.listener);
        this.setData({
            worlds: worldData.WORLDS.map(function (w) {
                return { id: w.id, label: w.label, name: w.name, enabled: w.enabled };
            }),
        });
        this.refresh();
    },

    onShow: function () { this.refresh(); },

    onUnload: function () { store.unsubscribe(this.listener); },

    refresh: function () {
        const state = store.get();
        this.setData({ logs: (state.log || []).slice(0, 30) });
    },

    onToggleWorld: function () { this.setData({ worldOpen: !this.data.worldOpen }); },

    onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('log') }); },
});
