'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const worldData = require('../../data/world.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    viewState: 'ready',
    ov: null,
    quickSkills: [],
    worlds: [],
    showOffline: false,
    offline: null,
  },

  onLoad: function () {
    this.viewReady = false;
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.refresh();
  },

  onShow: function () {
    this.refresh();
    const report = store.consumeOfflineReport();
    if (report) {
      const hours = Math.floor(report.minutes / 60);
      const mins = report.minutes % 60;
      this.setData({
        showOffline: true,
        offline: {
          duration: hours > 0 ? hours + ' 时 ' + mins + ' 分' : mins + ' 分',
          qi: report.qi,
          prof: report.prof,
          skillName: report.skillName,
          capped: report.capped,
          buffMinutes: report.buffMinutes,
        },
      });
    }
  },

  onHide: function () { /* tab 页保持存活，订阅在 onUnload 解除 */ },

  onUnload: function () {
    store.unsubscribe(this.listener);
  },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const all = engine.getSkillList(state);
    const quick = all.filter(function (s) { return s.unlocked; });
    quick.sort(function (a, b) { return b.percent - a.percent; });
    const worlds = worldData.WORLDS.map(function (w) {
      return {
        id: w.id,
        label: w.label,
        name: w.name,
        enabled: w.enabled,
        intro: w.intro,
      };
    });
    const dailyPercent = Math.min(100, Math.round(ov.daily.count / ov.daily.target * 100));
    const bt = ov.breakthrough;
    const breakPercent = bt.maxed || bt.need <= 0 ? 100 : Math.min(100, Math.round(bt.power / bt.need * 100));
    this.setData({
      viewState: 'ready',
      ov: ov,
      dailyPercent: dailyPercent,
      breakPercent: breakPercent,
      quickSkills: quick.slice(0, 3).map(function (s) {
        return {
          id: s.id, name: s.name, methodName: s.methodName,
          tierName: s.tierName, tierColor: s.tierColor,
          percent: s.percent, prof: s.prof,
          nextText: s.maxed ? '已至大成' : '距 ' + s.nextName + ' 还差 ' + (s.nextThreshold - s.prof),
        };
      }),
      worlds: worlds,
    });
  },

  closeOffline: function () {
    this.setData({ showOffline: false, offline: null });
  },

  onClaimDaily: function () {
    const r = store.commit(function (s) { return engine.claimDaily(s); });
    toast(r.ok ? '份例已领：灵气 +' + r.qi + '，灵石 +' + r.stone : r.msg);
    this.refresh();
  },

  onBreakthrough: function () {
    wx.navigateTo({ url: '/pages/practice/practice?mode=breakthrough' });
  },

  onPractice: function (event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  onGoSkills: function () { wx.switchTab({ url: '/pages/skills/skills' }); },
  onGoBattle: function () { wx.switchTab({ url: '/pages/battle/battle' }); },
  onGoProfile: function () { wx.switchTab({ url: '/pages/profile/profile' }); },
});
