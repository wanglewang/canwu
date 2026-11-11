'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const worldData = require('../../data/world.js');
const share = require('../../utils/share.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    viewState: 'ready',
    ov: null,
    quickSkills: [],
    quickSkillId: '',
    quickLabel: '开始参悟',
    worlds: [],
    worldOpen: false,
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
    const sync = store.getSyncStatus();
    let syncLabel = '';
    let syncTone = 'ok';
    if (sync.conflict) {
      syncLabel = '另一台设备也改过进度，请在弹窗里选保留哪一份';
      syncTone = 'error';
    } else if (sync.error) {
      syncLabel = '进度暂未同步到云端：' + sync.error;
      syncTone = 'error';
    } else if (sync.pending || getApp().globalData.offline) {
      syncLabel = '有改动待同步，联网后会自动补写';
      syncTone = 'warn';
    }
    this.setData({
      viewState: 'ready',
      ov: ov,
      syncLabel: syncLabel,
      syncTone: syncTone,
      dailyPercent: dailyPercent,
      breakPercent: breakPercent,
      quickSkills: quick.slice(0, 3).map(function (s) {
        return {
          id: s.id, name: s.name, methodName: s.methodName,
          tierName: s.profTierName, tierColor: s.profTierColor,
          percent: s.percent, prof: s.prof,
          nextText: s.maxed ? '已至大圆满' : '距 ' + s.nextName + ' 还差 ' + (s.nextThreshold - s.prof),
        };
      }),
      quickSkillId: quick.length > 0 ? quick[0].id : '',
      quickLabel: quick.length > 0 ? '开始参悟 · ' + quick[0].name : '去看看功法',
      worlds: worlds,
    });
  },

  closeOffline: function () {
    this.setData({ showOffline: false, offline: null });
  },

  onRetrySync: async function () {
    const r = await store.flushCloud();
    toast(r && r.ok ? '已重新同步' : (r && r.message ? r.message : '同步失败，请稍后再试'));
    this.refresh();
  },

  onClaimDaily: function () {
    const r = store.commitCritical(function (s) { return engine.claimDaily(s); });
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

  onQuickPractice: function () {
    const id = this.data.quickSkillId;
    if (!id) {
      wx.switchTab({ url: '/pages/skills/skills' });
      return;
    }
    wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  onToggleWorld: function () {
    this.setData({ worldOpen: !this.data.worldOpen });
  },

  onGoSkills: function () { wx.switchTab({ url: '/pages/skills/skills' }); },
  onGoBattle: function () { wx.switchTab({ url: '/pages/battle/battle' }); },
  onGoProfile: function () { wx.switchTab({ url: '/pages/profile/profile' }); },
  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },
});
