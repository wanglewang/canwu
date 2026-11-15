'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const share = require('../../utils/share.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');
const privacy = require('../../utils/privacy.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

// 仙门切磋：一个页面只做一件事——挑一个对手，打一场。
// 秘境探索已经不在这里了：它是主页六宫格里的另一格、另一个页面。
// 以前两段列表挤在同一屏，玩家得先分清「哪一段是同门」才点得对；
// 现在各说各的，这一页末尾只留一行指路，不重复那份列表。
// 榜单在「战力仙榜」页，这里同样只留一行指路。
Page({
  data: {
    ov: null,
    npcs: [],
    myCode: '',
    inputCode: '',
    showResult: false,
    result: null,
    copy: copy.UI,
    moveSlots: [],
    movePool: [],
    moveMax: 3,
    moveCost: 5,
    codeOpen: false,
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
    // 本场运功：选中的三式记在页面内存里（一场一议，换页即回默认），不写存档。
    // 数值与候选池都由引擎算，页面只负责把「改了哪一式」写回去。
    // 必须先定三式再算列表：胜算提示与运功消耗都跟着这三式走。
    const board = engine.moveBoard(state, this.moveIds);
    this.moveIds = board.ids;
    const all = engine.getChallengeList(state, board.ids);
    const npcs = [];
    for (let i = 0; i < all.length; i += 1) {
      if (all[i].kind === 'npc') npcs.push(all[i]);
    }
    this.setData({
      moveSlots: board.entries,
      movePool: board.pool,
      moveMax: board.max,
      moveCost: board.qiCost,
      movePower: board.powerAfter,
      ov: engine.getOverview(state),
      npcs: npcs,
      myCode: engine.battleCode(state),
    });
  },

  // 战力码是低频操作，收起来让首屏先解决「打谁」。
  onToggleCode: function () {
    this.setData({ codeOpen: !this.data.codeOpen });
  },

  onGoBoard: function () { wx.navigateTo({ url: '/pages/board/board' }); },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('battle') }); },

  // 结果原样交给 components/duel-result：格式化只写一份，两页共用。
  onFight: function (event) {
    const self = this;
    const id = event.currentTarget.dataset.id;
    const r = store.commitCritical(function (s) { return engine.battle(s, id, self.moveIds); });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showResult: true, result: r });
    this.refresh();
  },

  onCopyCode: function () {
    const self = this;
    privacy.guard(function () {
      wx.setClipboardData({
        data: self.data.myCode,
        success: function () { toast('战力码已复制，发给朋友一试'); },
        fail: function () { toast('复制失败，请长按手动复制'); },
      });
    }, function () { toast('同意隐私保护指引后即可复制'); });
  },

  onPasteCode: function () {
    const self = this;
    privacy.guard(function () {
      wx.getClipboardData({
        success: function (res) {
          self.setData({ inputCode: (res.data || '').trim() });
        },
        fail: function () { toast('读取剪贴板失败'); },
      });
    }, function () { toast('同意隐私保护指引后即可读取剪贴板'); });
  },

  onInputCode: function (event) {
    this.setData({ inputCode: event.detail.value });
  },

  onMirrorFight: function () {
    const code = (this.data.inputCode || '').trim();
    if (!code) { toast('先粘贴一个战力码'); return; }
    const r = store.commitCritical(function (s) { return engine.battleMirror(s, code); });
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

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },

  noop: function () {},
});
