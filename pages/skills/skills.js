'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const worldData = require('../../data/world.js');
const copy = require('../../data/copy.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    ov: null,
    cards: [],
    unlocked: [],
    shop: [],
    locked: [],
    legend: [],
    families: [],
    showDetail: false,
    detail: null,
    canAfford: false,
    copy: copy.UI,
    chainOpen: false,
  },

  onLoad: function () {
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.setData({
      legend: worldData.TIERS.map(function (t) {
        return { key: t.key, name: t.name, threshold: t.threshold, color: t.color, desc: t.desc };
      }),
    });
    this.refresh();
  },

  onShow: function () { this.refresh(); },

  onUnload: function () { store.unsubscribe(this.listener); },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const list = engine.getSkillList(state);
    const families = engine.getFamilies(state);
    const unlocked = [];
    const shop = [];
    const locked = [];
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i];
      s.costText = s.cost ? copy.formatCost(s.cost.qi, s.cost.stone) : '';
      s.affordable = !!s.cost && state.resources.qi >= s.cost.qi && state.resources.stone >= s.cost.stone;
      if (s.unlocked) unlocked.push(s);
      else if (s.canBuy) shop.push(s);
      else locked.push(s);
    }
    const detailId = this.data.showDetail && this.data.detail ? this.data.detail.id : '';
    let detail = null;
    if (detailId) {
      for (let i = 0; i < list.length; i += 1) if (list[i].id === detailId) detail = list[i];
    }
    const cards = [];
    const groups = [
      { title: '已习功法', sub: unlocked.length + ' 门 · 点开可开始参悟', items: unlocked, dim: false },
      { title: '可兑换', sub: '用挂机与对战攒下的资源换功法', items: shop, dim: true },
      { title: '尚未获得', sub: '论道首胜掉落，或等机缘', items: locked, dim: true },
    ];
    for (let g = 0; g < groups.length; g += 1) {
      if (groups[g].items.length === 0) continue;
      for (let i = 0; i < groups[g].items.length; i += 1) {
        const s = groups[g].items[i];
        cards.push({
          id: s.id, name: s.name, type: s.type, desc: s.desc,
          gameName: s.gameName,
          tierKey: s.tierKey, tierName: s.tierName, tierLabel: s.tierLabel,
          tierColor: s.tierColor, starsText: s.starsText, rewardText: s.rewardText,
          maxRealm: s.maxRealm, maxRealmName: s.maxRealmName, decayed: s.decayed, decayText: s.decayText,
          needRealm: s.needRealm, needRealmName: s.needRealmName, realmOk: s.realmOk,
          bestText: s.bestText,
          percent: s.percent, prof: s.prof, nextText: s.nextText,
          profTierName: s.profTierName, profTierColor: s.profTierColor,
          unlocked: s.unlocked, canBuy: s.canBuy, costText: s.costText,
          affordable: s.affordable, sourceText: s.sourceText,
          effectText: s.effectText, effectUnlocked: s.effectUnlocked,
          bonusText: s.bonusText, flavor: s.flavor, maxed: s.maxed,
          dim: groups[g].dim && !s.unlocked,
          showHeader: i === 0,
          groupTitle: groups[g].title,
          groupSub: groups[g].sub,
          canPractice: s.unlocked,
        });
      }
    }
    this.setData({
      ov: ov,
      cards: cards,
      families: families,
      unlocked: unlocked,
      shop: shop,
      locked: locked,
      detail: detail,
      showDetail: !!detail,
      canAfford: detail ? detail.affordable : false,
    });
  },

  openDetail: function (event) {
    const id = event.currentTarget.dataset.id;
    const all = this.data.unlocked.concat(this.data.shop, this.data.locked);
    for (let i = 0; i < all.length; i += 1) {
      if (all[i].id === id) {
        this.setData({ showDetail: true, detail: all[i], canAfford: all[i].affordable });
        return;
      }
    }
  },

  closeDetail: function () {
    this.setData({ showDetail: false, detail: null });
  },

  onBuy: function () {
    const id = this.data.detail ? this.data.detail.id : '';
    if (!id) return;
    const r = store.commitCritical(function (s) { return engine.buySkill(s, id); });
    toast(r.ok ? '习得《' + r.name + '》' : r.msg);
    this.refresh();
  },

  onPractice: function () {
    const id = this.data.detail ? this.data.detail.id : '';
    if (!id) return;
    this.setData({ showDetail: false, detail: null });
    wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  onToggleChain: function () {
    this.setData({ chainOpen: !this.data.chainOpen });
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onPracticeFromList: function (event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  noop: function () {},
});
