'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const social = require('../../utils/cloud-social.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

// 战力仙榜：只回答两个问题——我排第几、跟我最接近的是谁。
// 榜首前十列出来就够了，不在这里复述论道的规则（那在「说明」里）。
Page({
  data: {
    ov: null,
    rows: [],
    myRank: 0,
    rival: null,
    loading: true,
    error: '',
    copy: copy.UI,
  },

  onLoad: function () {
    this.listener = this.refreshMe.bind(this);
    store.subscribe(this.listener);
    this.refreshMe();
    this.loadBoard(false);
  },

  onShow: function () { this.refreshMe(); },

  onUnload: function () { store.unsubscribe(this.listener); },

  refreshMe: function () {
    this.setData({ ov: engine.getOverview(store.get()) });
  },

  loadBoard: async function (force) {
    this.setData({ loading: true });
    const state = store.get();
    const result = await social.refreshBoard(state, !!force);
    const rows = result.board.ok ? result.board.rows : [];
    let myRank = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].isMe) { myRank = rows[i].rank; break; }
    }
    this.setData({
      rows: rows.slice(0, 10),
      myRank: myRank,
      rival: social.pickRival(rows, '', engine.computePower(state)),
      error: result.board.ok ? '' : (result.board.message || '榜单暂不可用'),
      loading: false,
    });
  },

  onRefresh: function () { this.loadBoard(true); },

  onFight: function () {
    const rival = this.data.rival;
    if (!rival) { toast('榜上暂时没有别的道友'); return; }
    const r = store.commitCritical(function (s) { return engine.battleRival(s, rival); });
    if (!r.ok) { toast(r.msg); return; }
    toast((r.win ? '胜 · ' : '负 · ') + r.playerRoll + ' : ' + r.enemyRoll);
    this.refreshMe();
  },

  onBack: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('board') }); },
});
