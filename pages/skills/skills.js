'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

// 图鉴详情统一从引擎出：页面只补「当前资源够不够」这类即时状态。
function detailOf(state, id) {
  const d = engine.getSkillDetail(state, id);
  if (!d) return null;
  d.costText = d.cost ? copy.formatCost(d.cost.qi, d.cost.stone) : '';
  d.affordable = !!d.cost && state.resources.qi >= d.cost.qi && state.resources.stone >= d.cost.stone;
  d.stateText = d.unlocked ? copy.UI.states.learned
    : (d.canBuy ? copy.UI.states.buyable : d.unlock.label);
  d.primary = primaryOf(d);
  return d;
}

// 弹窗右下角永远给一个能点的动作：未习得不等于死路。
function primaryOf(d) {
  if (d.unlocked) return { kind: 'practice', text: copy.UI.actions.practice, disabled: false };
  if (d.canBuy) {
    if (!d.realmOk || !d.affordable) return { kind: 'home', text: copy.UI.actions.goHome, disabled: false };
    return { kind: 'buy', text: '兑换', disabled: false };
  }
  return { kind: d.unlock.action || 'home', text: d.unlock.actionText || copy.UI.actions.goHome, disabled: false };
}

Page({
  data: {
    ov: null,
    tab: 'learned',
    cards: [],
    learnedCount: 0,
    lockedCount: 0,
    showDetail: false,
    detail: null,
    guideOpen: false,
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
    const learned = [];
    const locked = [];
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i];
      s.costText = s.cost ? copy.formatCost(s.cost.qi, s.cost.stone) : '';
      s.affordable = !!s.cost && state.resources.qi >= s.cost.qi && state.resources.stone >= s.cost.stone;
      s.stateText = s.unlocked ? copy.UI.states.learned
        : (s.canBuy ? copy.UI.states.buyable : s.unlock.label);
      if (s.unlocked) learned.push(s);
      else locked.push(s);
    }
    const source = this.data.tab === 'learned' ? learned : locked;
    const cards = source.map(function (s) {
      return {
        id: s.id,
        name: s.name,
        mark: s.type.slice(0, 1),
        stageText: s.unlocked ? s.profTierName + ' ' + s.percent + '%' : (s.canBuy ? '藏经阁可换' : '未修炼'),
        bonusText: s.bonusText || s.effectText,
        percent: s.percent,
        tierLabel: s.tierLabel,
        actionText: s.unlocked ? '修炼' : (s.canBuy ? '兑换' : '看详情'),
        unlocked: s.unlocked,
        canBuy: s.canBuy,
      };
    });
    const detailId = this.data.showDetail && this.data.detail ? this.data.detail.id : '';
    const detail = detailId ? detailOf(state, detailId) : null;
    this.setData({
      ov: ov,
      cards: cards,
      learnedCount: learned.length,
      lockedCount: locked.length,
      detail: detail,
      showDetail: !!detail,
    });
  },

  onTab: function (event) {
    this.setData({ tab: event.currentTarget.dataset.tab }, this.refresh.bind(this));
  },

  showDetailFor: function (id) {
    const d = detailOf(store.get(), id);
    if (!d) return;
    this.setData({ showDetail: true, detail: d, guideOpen: false });
  },

  openDetail: function (event) {
    this.showDetailFor(event.currentTarget.dataset.id);
  },

  // 卡片右侧按钮：已习得直接开练，其余先开图鉴看清再决定。
  onCardAction: function (event) {
    const id = event.currentTarget.dataset.id;
    const card = this.data.cards.filter(function (c) { return c.id === id; })[0];
    if (card && card.unlocked) {
      wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
      return;
    }
    this.showDetailFor(id);
  },

  closeDetail: function () {
    this.setData({ showDetail: false, detail: null, guideOpen: false });
  },

  onToggleGuide: function () {
    this.setData({ guideOpen: !this.data.guideOpen });
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
    this.closeDetail();
    wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  onPrimary: function () {
    const d = this.data.detail;
    if (!d || !d.primary || d.primary.disabled) return;
    const kind = d.primary.kind;
    const id = d.id;
    if (kind === 'buy') { this.onBuy(); return; }
    this.closeDetail();
    if (kind === 'practice') wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
    else if (kind === 'battle') wx.navigateTo({ url: '/pages/battle/battle' });
    else wx.switchTab({ url: '/pages/index/index' });
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('skills') }); },
  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },
  noop: function () {},
});
