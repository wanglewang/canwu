'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

// 藏经阁只做一件事：把「花灵气 / 灵石换功法」列清楚。
// 排序固定为「现在就能换 → 已经习得 → 境界没到」，玩家一眼知道下一个目标。
function orderOf(item) {
  if (item.unlocked) return 1;
  if (item.canAfford && item.realmReady) return 0;
  return 2;
}

Page({
  data: {
    ov: null,
    qi: 0,
    stone: 0,
    items: [],
    learnedCount: 0,
    totalCount: 0,
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
    const list = engine.getSkillList(state);
    const items = [];
    let learnedCount = 0;
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i];
      if (s.sourceKind !== 'shop') continue;
      const cost = s.cost || { qi: 0, stone: 0 };
      const affordable = state.resources.qi >= cost.qi && state.resources.stone >= cost.stone;
      if (s.unlocked) learnedCount += 1;
      items.push({
        id: s.id,
        name: s.name,
        tierLabel: s.tierLabel,
        tierName: s.tierName,
        sub: s.methodName + ' · ' + s.rewardText,
        costText: copy.formatCost(cost.qi, cost.stone),
        unlocked: s.unlocked,
        realmReady: s.realmReady,
        canAfford: affordable,
        actionText: s.unlocked ? '已习得' : (s.realmReady ? (affordable ? '兑换' : '不足') : s.needRealmName),
        // 只有真能点的那一行才画按钮，其余只给状态字，避免满屏灰按钮。
        buttonKind: s.unlocked ? 'none' : (s.realmReady && affordable ? 'buy' : 'none'),
      });
    }
    items.sort(function (a, b) {
      if (orderOf(a) !== orderOf(b)) return orderOf(a) - orderOf(b);
      return a.name < b.name ? -1 : 1;
    });
    this.setData({
      ov: ov,
      qi: state.resources.qi,
      stone: state.resources.stone,
      items: items,
      learnedCount: learnedCount,
      totalCount: items.length,
    });
  },

  onBuy: function (event) {
    const id = event.currentTarget.dataset.id;
    const r = store.commitCritical(function (s) { return engine.buySkill(s, id); });
    // 新换来的功法直接成为练功台的当前功法：买完切到修炼页就是它，不用再挑一次
    if (r.ok) getApp().globalData.lastSkillId = id;
    toast(r.ok ? '习得《' + r.name + '》，回修炼页就能练' : r.msg);
    this.refresh();
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('shop') }); },
});
