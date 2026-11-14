'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const share = require('../../utils/share.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    viewState: 'ready',
    ov: null,
    tiles: nav.TILES,
    breakPercent: 0,
    hintText: '',
    quickSkillId: '',
    quickLabel: '去参悟',
    dailyReady: false,
    dailyGain: '',
    syncLabel: '',
    syncTone: 'ok',
    showOffline: false,
    offline: null,
    copy: copy.UI,
  },

  onLoad: function () {
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
        },
      });
    }
  },

  onUnload: function () { store.unsubscribe(this.listener); },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const list = engine.getSkillList(state);
    const learned = list.filter(function (s) { return s.unlocked; });
    const rec = engine.recommend(state);
    const bt = ov.breakthrough;
    const breakPercent = bt.maxed || bt.need <= 0 ? 100 : Math.min(100, Math.round(bt.power / bt.need * 100));

    // 一行提示只报「下一步」，不讲原理；原理在「说明」页。
    let hintText = '今日之课：' + (rec.name || '去功法页挑一门');
    const near = learned.filter(function (s) { return !s.maxed && s.percent >= 75; });
    near.sort(function (a, b) { return b.percent - a.percent; });
    if (near.length > 0) hintText = '叮！' + near[0].name + ' 即将升段。';
    else if (bt.available) hintText = '境界已足，可去人物页突破 · 突破后战力 +' + bt.powerGain;
    // 门槛只有战力（world.realms[].power）：到这条线就够，不必再列第二个条件。
    // 但缺口是个冷数字，得同时说清「填平之后战力跳到多少」——那是玩家攒战力的理由。
    else if (!bt.maxed && bt.need > 0) {
      hintText = '距「' + bt.nextName + '」还差 ' + Math.max(0, bt.need - bt.power) + ' 战力';
      if (bt.powerGain > 0) hintText += ' · 突破后 +' + bt.powerGain;
    }

    const dailyReady = !ov.daily.claimed && ov.daily.count >= ov.daily.target;
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
      breakPercent: breakPercent,
      hintText: hintText,
      dailyReady: dailyReady,
      dailyGain: copy.formatGain(ov.daily.qi, ov.daily.stone),
      quickSkillId: rec.id || (learned.length > 0 ? learned[0].id : ''),
      // 「参悟」进这一门的详情，「开始参悟」才开一局：两个词分别代表两件事，不再混用。
      quickLabel: rec.id ? '参悟 · ' + rec.name : copy.UI.actions.goSkills,
    });
  },

  closeOffline: function () {
    this.setData({ showOffline: false, offline: null });
  },

  onClaimDaily: function () {
    const r = store.commitCritical(function (s) { return engine.claimDaily(s); });
    toast(r.ok ? '份例已领：' + copy.formatGain(r.qi, r.stone) : r.msg);
    this.refresh();
  },

  onRetrySync: async function () {
    const r = await store.flushCloud();
    toast(r && r.ok ? '已重新同步' : (r && r.message ? r.message : '同步失败，请稍后再试'));
    this.refresh();
  },

  onTile: function (event) {
    const key = event.currentTarget.dataset.key;
    const tile = nav.TILES.filter(function (t) { return t.key === key; })[0];
    if (tile) nav.openTile(getApp(), tile);
  },

  // 主页把人送进那一门功法的静室，不替人开局：难度档、规则速记、上一局评价都在详情页。
  onQuickPractice: function () {
    const id = this.data.quickSkillId;
    if (!id) {
      wx.switchTab({ url: '/pages/skills/skills' });
      return;
    }
    getApp().globalData.lastSkillId = id;
    // 修炼不是 tab 了：直接进这一门的静室（功法详情），在那儿开始参悟。
    wx.navigateTo({ url: '/pages/cultivate/cultivate?id=' + id });
  },

  onBreakthrough: function () {
    wx.navigateTo({ url: '/pages/practice/practice?mode=breakthrough' });
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('index') }); },
  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },
  onGoBattle: function () { wx.navigateTo({ url: '/pages/battle/battle' }); },
  onGoSkills: function () { wx.switchTab({ url: '/pages/skills/skills' }); },
  onGoProfile: function () { wx.switchTab({ url: '/pages/profile/profile' }); },

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },
});
