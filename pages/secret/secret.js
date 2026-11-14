'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const share = require('../../utils/share.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

function toast(title) {
    wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

// 秘境探索：一个页面只做一件事——挑一处地方走一趟。
//
// 它曾经和同门对手挤在「仙门切磋」一页里：同一屏两段列表、两套按钮、两套结算，
// 首屏得先分清「哪一段是同门」才点得对，而这两件事的目的完全不同——
// 切磋是为了掉功法，秘境是为了攒灵气与灵石。拆成两页后各说各的，
// 主页六宫格各给一格，两边各留一行指路，不互相复制列表。
Page({
  data: {
    ov: null,
    secrets: [],
    showResult: false,
    result: null,
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
    const all = engine.getChallengeList(state);
    const secrets = [];
    for (let i = 0; i < all.length; i += 1) {
      if (all[i].kind === 'secret') secrets.push(all[i]);
    }
    this.setData({
      ov: engine.getOverview(state),
      secrets: secrets,
    });
  },

  // 结果原样交给 components/duel-result：格式化只写一份，两页共用。
  onFight: function (event) {
    const id = event.currentTarget.dataset.id;
    const r = store.commitCritical(function (s) { return engine.battle(s, id); });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showResult: true, result: r });
    this.refresh();
  },

  closeResult: function () {
    this.setData({ showResult: false, result: null });
  },

  onGoBattle: function () { wx.navigateTo({ url: '/pages/battle/battle' }); },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('secret') }); },

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },

  noop: function () {},
});
