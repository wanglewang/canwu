'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

// 称号簿：一页看完所有称号、条件与进度，点一下就换。
// 以前它埋在人物页的折叠区里，翻三层才找到，等于没有。
Page({
  data: {
    equippedName: '',
    unlockedCount: 0,
    totalCount: 0,
    items: [],
    copy: copy.UI,
  },

  onLoad: function () {
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.refresh();
  },

  onShow: function () { this.refresh(); },

  onUnload: function () { store.unsubscribe(this.listener); },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const titles = engine.getTitleList(state);
    let unlockedCount = 0;
    const items = titles.map(function (t) {
      if (t.unlocked) unlockedCount += 1;
      return {
        id: t.id,
        name: t.name,
        desc: t.desc,
        unlocked: t.unlocked,
        equipped: t.equipped,
        progressText: t.unlocked ? '' : t.progress + ' / ' + t.target,
        percent: t.target > 0 ? Math.min(100, Math.round(t.progress / t.target * 100)) : 0,
      };
    });
    this.setData({
      equippedName: ov.equippedTitleName,
      unlockedCount: unlockedCount,
      totalCount: items.length,
      items: items,
    });
  },

  onEquip: function (event) {
    const id = event.currentTarget.dataset.id;
    const r = store.commitCritical(function (s) { return engine.equipTitle(s, id); });
    toast(r.ok ? (r.equipped ? '已佩戴' : '已卸下') : r.msg);
    this.refresh();
  },

  onBack: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('titles') }); },
});
