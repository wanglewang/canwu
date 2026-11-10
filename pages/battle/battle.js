'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const social = require('../../utils/cloud-social.js');
const share = require('../../utils/share.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

function buildResult(r) {
  const lines = [
    { k: '灵气', v: '+' + r.qi },
  ];
  if (r.stone > 0) lines.push({ k: '灵石', v: '+' + r.stone });
  if (r.dropName) lines.push({ k: '新功法', v: r.dropName });
  return {
    win: r.win,
    headline: r.win ? (r.firstClear ? '首胜 · ' + r.challengeName : '胜 · ' + r.challengeName) : '惜败 · ' + r.challengeName,
    subline: r.challengeTitle + ' · 双方各有 ±15% 波动',
    power: r.power,
    enemyPower: r.enemyPower,
    playerRoll: r.playerRoll,
    enemyRoll: r.enemyRoll,
    effects: r.effects || [],
    lines: lines,
    line: r.line,
    titles: (r.newTitles || []).map(function (t) { return t.name; }),
    winTone: r.win ? 'jade' : 'red',
  };
}

Page({
  data: {
    ov: null,
    npcs: [],
    secrets: [],
    myCode: '',
    inputCode: '',
    showResult: false,
    result: null,
    board: [],
    boardError: '',
    boardLoading: false,
    rival: null,
  },

  onLoad: function () {
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.refresh();
  },

  onShow: function () {
    this.refresh();
    this.refreshBoard(false);
  },

  onUnload: function () { store.unsubscribe(this.listener); },

  refresh: function () {
    const state = store.get();
    const all = engine.getChallengeList(state);
    const npcs = [];
    const secrets = [];
    for (let i = 0; i < all.length; i += 1) {
      if (all[i].kind === 'npc') npcs.push(all[i]);
      else secrets.push(all[i]);
    }
    this.setData({
      ov: engine.getOverview(state),
      npcs: npcs,
      secrets: secrets,
      myCode: engine.battleCode(state),
    });
  },

  // 榜单读公开、写仅本人；进来时顺手把自己的战绩更一次（30 秒内不重复写）。
  refreshBoard: async function (force) {
    if (this.data.boardLoading) return;
    this.setData({ boardLoading: true });
    const result = await social.refreshBoard(store.get(), !!force);
    const rows = result.board.ok ? result.board.rows : [];
    const rival = social.pickRival(rows, '', engine.computePower(store.get()));
    this.setData({
      board: rows.slice(0, 10),
      boardError: result.board.ok ? '' : (result.board.message || '榜单暂不可用'),
      rival: rival,
      boardLoading: false,
    });
  },

  onRefreshBoard: function () { this.refreshBoard(true); },

  onFight: function (event) {
    const id = event.currentTarget.dataset.id;
    const r = store.commitCritical(function (s) { return engine.battle(s, id); });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showResult: true, result: buildResult(r) });
    this.refresh();
    this.refreshBoard(true);
  },

  // 与榜单里战力最接近的真实玩家打一场镜像，不再只是本地预设 NPC。
  onFightRival: function () {
    const rival = this.data.rival;
    if (!rival) { toast('榜单上暂时只有你一人，先邀个道友'); return; }
    const r = store.commitCritical(function (s) { return engine.battleRival(s, rival); });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showResult: true, result: buildResult(r) });
    this.refresh();
    this.refreshBoard(true);
  },

  onCopyCode: function () {
    wx.setClipboardData({
      data: this.data.myCode,
      success: function () { toast('战力码已复制，发给朋友试试'); },
      fail: function () { toast('复制失败，请长按手动复制'); },
    });
  },

  onPasteCode: function () {
    const self = this;
    wx.getClipboardData({
      success: function (res) {
        self.setData({ inputCode: (res.data || '').trim() });
      },
      fail: function () { toast('读取剪贴板失败'); },
    });
  },

  onInputCode: function (event) {
    this.setData({ inputCode: event.detail.value });
  },

  onMirrorFight: function () {
    const code = (this.data.inputCode || '').trim();
    if (!code) { toast('先粘贴一个战力码'); return; }
    const r = store.commitCritical(function (s) { return engine.battleMirror(s, code); });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showResult: true, result: buildResult(r) });
    this.refresh();
  },

  closeResult: function () {
    this.setData({ showResult: false, result: null });
  },

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },

  noop: function () {},
});
