'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

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
// 已习得 → 去练功台；能换 → 去藏经阁；其余看解锁条件指向哪。
function primaryOf(d) {
  if (d.unlocked) return { kind: 'cultivate', text: copy.UI.actions.practice, disabled: false };
  if (d.canBuy) return { kind: 'shop', text: copy.UI.actions.openShop, disabled: false };
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
    // 默认排序与主页「今日之课」共用 engine.recommendScore：离下一段最近的在前，
    // 按阶段跨度归一；不另写「品阶 / 进度绝对值」一套，免得高熟练度功法永远霸榜。
    learned.sort(function (a, b) {
      const d = engine.recommendScore(a).score - engine.recommendScore(b).score;
      if (d !== 0) return d;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    const source = this.data.tab === 'learned' ? learned : locked;
    const cards = source.map(function (s) {
      return {
        id: s.id,
        name: s.name,
        mark: s.type.slice(0, 1),
        // 一个词点出这套功法玩什么，不用整句说明；长文只留在图鉴弹窗里。
        gameName: s.gameName,
        stageText: s.unlocked ? s.profTierName + ' ' + s.percent + '%' : (s.canBuy ? '藏经阁可换' : '未修炼'),
        bonusText: s.bonusText || s.effectText,
        percent: s.percent,
        tierLabel: s.tierLabel,
        // 阶段只分三档、颜色全走 tokens：未入门弱化 / 常规青玉 / 大成以上旧金。
        barTone: s.tierIndex === 0 ? 'imm-bar--dim' : (s.tierIndex >= 3 ? 'imm-bar--gold' : ''),
        detailText: copy.UI.actions.viewDetail,
        actionText: s.unlocked ? copy.UI.actions.practice
          : (s.canBuy ? copy.UI.actions.openShop : copy.UI.actions.viewDetail),
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

  // 卡片右侧按钮：
  //   已习得 → 选定这门并回练功台（不在功法页直接开局，免得跳过难度与规则确认）；
  //   可兑换 → 去藏经阁（花钱的地方只留一个）；
  //   其余 → 开图鉴看还差什么。
  onCardAction: function (event) {
    const id = event.currentTarget.dataset.id;
    const card = this.data.cards.filter(function (c) { return c.id === id; })[0];
    if (card && card.unlocked) {
      getApp().globalData.lastSkillId = id;
      wx.switchTab({ url: '/pages/cultivate/cultivate' });
      return;
    }
    if (card && card.canBuy) {
      wx.navigateTo({ url: '/pages/shop/shop' });
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

  onPrimary: function () {
    const d = this.data.detail;
    if (!d || !d.primary || d.primary.disabled) return;
    const kind = d.primary.kind;
    const id = d.id;
    this.closeDetail();
    if (kind === 'cultivate') {
      getApp().globalData.lastSkillId = id;
      wx.switchTab({ url: '/pages/cultivate/cultivate' });
    } else if (kind === 'shop') {
      wx.navigateTo({ url: '/pages/shop/shop' });
    } else if (kind === 'battle') {
      wx.navigateTo({ url: '/pages/battle/battle' });
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('skills') }); },
  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },
  noop: function () {},
});
