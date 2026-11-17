'use strict';

const pageTheme = require('../../utils/theme.js');
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
// 切磋是为了掉功法，秘境是为了攒灵石。拆成两页后各说各的，
// 主页六宫格各给一格，两边各留一行指路，不互相复制列表。
Page({
  data: {
    themeTone: 'light',
    ov: null,
    secrets: [],
    showResult: false,
    result: null,
    copy: copy.UI,
    moveSlots: [],
    movePool: [],
    moveMax: 3,
    moveCost: 5,
  },

  onLoad: function () {
    pageTheme.syncPage(this);
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.refresh();
  },

  onShow: function () { pageTheme.syncPage(this); this.refresh(); },

  onUnload: function () { store.unsubscribe(this.listener); },

  refresh: function () {
    const state = store.get();
    // 本场运功：选中的三式记在页面内存里（一场一议，换页即回默认），不写存档。
    // 必须先定三式再算列表：秘境的门槛提示与运功消耗都跟着这三式走。
    const board = engine.moveBoard(state, this.moveIds);
    this.moveIds = board.ids;
    const all = engine.getChallengeList(state, board.ids);
    const secrets = [];
    for (let i = 0; i < all.length; i += 1) {
      if (all[i].kind === 'secret') secrets.push(all[i]);
    }
    this.setData({
      moveSlots: board.entries,
      movePool: board.pool,
      moveMax: board.max,
      moveCost: board.qiCost,
      movePower: board.powerAfter,
      ov: engine.getOverview(state),
      secrets: secrets,
    });
  },

  // 结果原样交给 components/duel-result：格式化只写一份，两页共用。
  onFight: function (event) {
    const self = this;
    const id = event.currentTarget.dataset.id;
    const r = store.commitCritical(function (s) { return engine.battle(s, id, self.moveIds); });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showResult: true, result: r });
    this.refresh();
  },

  // 点池子里的一式：已在运的就撤下，没运的补上。撤到只剩一式时不许再撤——
  // 空手上去和三式尽出是两回事，前者没有任何可看的东西。
  onPickMove: function (event) {
    const id = event.detail.id;
    const cur = (this.moveIds || []).slice();
    const at = cur.indexOf(id);
    if (at >= 0) {
      if (cur.length <= 1) { toast('至少要运一式'); return; }
      cur.splice(at, 1);
    } else {
      if (cur.length >= this.data.moveMax) { toast('一场至多 ' + this.data.moveMax + ' 式，先撤一式'); return; }
      cur.push(id);
    }
    this.moveIds = cur;
    this.refresh();
  },

  closeResult: function () {
    this.setData({ showResult: false, result: null });
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('secret') }); },

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },

  noop: function () {},
});
