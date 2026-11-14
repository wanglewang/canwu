'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');
const skillsData = require('../../data/skills.js');

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
// 已习得 → 直接进这一门的参悟页（那里就是静室：规则、难度、这一门、换门都在）；
// 能换 → 就地换掉，不再跳一个藏经阁页面；
// 其余看解锁条件指向哪（切磋 / 攒资源 / 回主页）。
function primaryOf(d) {
  if (d.unlocked) return { kind: 'practice', text: copy.UI.actions.practice, disabled: false };
  if (d.canBuy) return { kind: 'buy', text: copy.UI.actions.buy, disabled: false };
  return { kind: d.unlock.action || 'home', text: d.unlock.actionText || copy.UI.actions.goHome, disabled: false };
}

Page({
  data: {
    ov: null,
    tab: 'learned',
    cards: [],
    learnedCount: 0,
    shopCount: 0,
    qi: 0,
    stone: 0,
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

  // 别处（指南页、人物页）想让玩家落在哪个分区，切过来前先写 globalData.skillsTab。
  // tab 页不能带 query，这是 switchTab 唯一的传参办法；读完即清，免得下次再进还停在那儿。
  onShow: function () {
    const app = getApp();
    const want = app.globalData.skillsTab;
    if (want === 'learned' || want === 'shop') {
      app.globalData.skillsTab = '';
      this.setData({ tab: want }, this.refresh.bind(this));
      return;
    }
    this.refresh();
  },

  onUnload: function () { store.unsubscribe(this.listener); },

  // 一个页面两个分区：已持玉简（到手可练）/ 藏经阁（还没拿到，看怎么得）。
  // 藏经阁装的是**全部**未习得功法——含切磋首胜、境界前置那几门，不只可兑换的 12 门，
  // 否则那 4 门的图鉴与获取途径就没有别处可看了。
  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const list = engine.getSkillList(state);
    const learned = [];
    const pending = [];
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i];
      s.costText = s.cost ? copy.formatCost(s.cost.qi, s.cost.stone) : '';
      s.affordable = !!s.cost && state.resources.qi >= s.cost.qi && state.resources.stone >= s.cost.stone;
      s.stateText = s.unlocked ? copy.UI.states.learned
        : (s.canBuy ? copy.UI.states.buyable : s.unlock.label);
      if (s.unlocked) learned.push(s);
      else pending.push(s);
    }
    // 默认排序与主页「今日之课」共用 engine.recommendScore：离下一段最近的在前，
    // 按阶段跨度归一；不另写「品阶 / 进度绝对值」一套，免得高熟练度功法永远霸榜。
    learned.sort(function (a, b) {
      const d = engine.recommendScore(a).score - engine.recommendScore(b).score;
      if (d !== 0) return d;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    // 藏经阁分区：换得起的在前，其次够不着但能换的，最后是境界没到 / 只能靠切磋的。
    // 与旧藏经阁页同一套排序，玩家换了地方找同一门功法，顺序不该变。
    const rank = function (s) {
      if (s.canBuy && s.affordable && s.realmReady) return 0;
      if (s.canBuy) return 1;
      return 2;
    };
    pending.sort(function (a, b) {
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    const source = this.data.tab === 'learned' ? learned : pending;
    const cards = source.map(function (s) {
      const bonusText = s.bonusText || s.effectText;
      // 已持：一行写「段位 + 进度 + 属性」，进度条再画一遍，扫一眼就知道差多少。
      // 未得：一行写「玩法 + 盘面」，另一行写代价或获取途径——这一层只回答「怎么拿到」。
      const metaText = s.unlocked
        ? s.profTierName + ' ' + s.percent + '% · ' + bonusText
        : s.methodName + ' · ' + s.gameName;
      return {
        id: s.id,
        // 左侧方标已写出类别，列表只留三字正名，不再重复一遍「心法 ·」。
        cardName: s.name.split(skillsData.NAME_RULE.sep)[1] || s.name,
        mark: s.type.slice(0, 1),
        tierLabel: s.tierLabel,
        metaText: metaText,
        costText: s.unlocked ? '' : (s.canBuy ? s.costText : s.stateText),
        percent: s.percent,
        // 阶段只分三档、颜色全走 tokens：未入门弱化 / 常规青玉 / 大成以上旧金。
        barTone: s.tierIndex === 0 ? 'imm-bar--dim' : (s.tierIndex >= 3 ? 'imm-bar--gold' : ''),
        actionText: s.unlocked ? copy.UI.actions.practice : (s.canBuy ? copy.UI.actions.buy : ''),
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
      shopCount: pending.length,
      qi: state.resources.qi,
      stone: state.resources.stone,
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

  // 整行点击分两种：已持的直接进参悟页；没拿到的开图鉴（锁的只是开练，不是查阅）。
  openDetail: function (event) {
    const id = event.currentTarget.dataset.id;
    const card = this.data.cards.filter(function (c) { return c.id === id; })[0];
    if (card && card.unlocked) { this.goPractice(id); return; }
    this.showDetailFor(id);
  },

  // 参悟页就是这一门的静室：印、品阶、修为、这一门、难度与规则都在那一屏。
  // 原来中间还夹着一层「功法详情」页，点进去再点「开始参悟」才开局——那一步已经并掉了。
  goPractice: function (id) {
    getApp().globalData.lastSkillId = id;
    wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  // 卡片右侧按钮：
  //   已持 → 参悟（直接进参悟页，规则与难度都在那儿，不在列表里直接开局）；
  //   可换 → 就地换取，不再跳页面。
  onCardAction: function (event) {
    const id = event.currentTarget.dataset.id;
    const card = this.data.cards.filter(function (c) { return c.id === id; })[0];
    if (!card) return;
    if (card.unlocked) { this.goPractice(id); return; }
    if (card.canBuy) { this.buy(id); return; }
    this.showDetailFor(id);
  },

  buy: function (id) {
    const r = store.commitCritical(function (s) { return engine.buySkill(s, id); });
    if (r.ok) getApp().globalData.lastSkillId = id;
    toast(r.ok ? '习得《' + r.name + '》，已归入已持玉简' : r.msg);
    this.refresh();
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
    if (kind === 'practice') this.goPractice(id);
    else if (kind === 'buy') this.buy(id);
    else if (kind === 'battle') wx.navigateTo({ url: '/pages/battle/battle' });
    else wx.switchTab({ url: '/pages/index/index' });
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('skills') }); },
  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },
  noop: function () {},
});
