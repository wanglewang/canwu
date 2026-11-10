'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const worldData = require('../../data/world.js');
const { cloud } = require('../../utils/cloud.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    ov: null,
    topSkills: [],
    titles: [],
    worlds: [],
    myCode: '',
    attrsLine: '',
    statsLine: '',
    accountLabel: '',
    showSaveCode: false,
    saveCode: '',
    showImport: false,
    importCode: '',
    showRoleEditor: false,
    draftName: '',
    draftPortrait: 0,
  },

  onLoad: function () {
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.refresh();
    this.loadAccount();
  },

  onShow: function () { this.refresh(); },

  onUnload: function () { store.unsubscribe(this.listener); },

  loadAccount: async function () {
    try {
      const result = await getApp().ensureSession();
      const user = result && result.data && result.data.user;
      const label = user && (user.email || user.name) ? (user.email || user.name) : '已登录';
      this.setData({ accountLabel: label });
    } catch (e) {
      this.setData({ accountLabel: '已登录' });
    }
  },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const top = engine.getTopSkills(state, 3);
    const titles = engine.getTitleList(state);
    const worlds = worldData.WORLDS.map(function (w) {
      return { id: w.id, label: w.label, name: w.name, enabled: w.enabled, intro: w.intro, style: w.style };
    });
    const attrsLine = ov.attrs.map(function (a) { return a.name + ' ' + a.value; }).join(' · ');
    this.setData({
      ov: ov,
      topSkills: top,
      titles: titles,
      worlds: worlds,
      myCode: engine.battleCode(state),
      attrsLine: attrsLine,
      statsLine: '习得 ' + ov.unlockedCount + ' / ' + ov.skillTotal + ' 门 · 参悟 ' + ov.practiceCount + ' 次 · 胜 ' + ov.wins + ' 场',
    });
  },

  openRoleEditor: function () {
    const s = store.get();
    this.setData({
      showRoleEditor: true,
      draftName: s.roleName || '',
      draftPortrait: s.portrait || 0,
    });
  },

  closeRoleEditor: function () { this.setData({ showRoleEditor: false }); },

  onRoleNameInput: function (event) { this.setData({ draftName: event.detail.value }); },

  onNextPortrait: function () {
    this.setData({ draftPortrait: (this.data.draftPortrait + 1) % 6 });
  },

  onSaveRole: function () {
    const name = this.data.draftName;
    const portrait = this.data.draftPortrait;
    const r = store.commit(function (s) {
      return engine.updateRole(s, { name: name, portrait: portrait });
    });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showRoleEditor: false });
    this.refresh();
    toast('道号已定下');
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onEquipTitle: function (event) {
    const id = event.currentTarget.dataset.id;
    const r = store.commit(function (s) { return engine.equipTitle(s, id); });
    toast(r.ok ? (r.equipped ? '已佩戴称号' : '已卸下称号') : r.msg);
    this.refresh();
  },

  onCopyCode: function () {
    wx.setClipboardData({
      data: this.data.myCode,
      success: function () { toast('战力码已复制'); },
      fail: function () { toast('复制失败'); },
    });
  },

  onCopyCardText: function () {
    const ov = this.data.ov;
    if (!ov) return;
    const lines = [
      '【参悟 · 道牒】',
      ov.worldLabel + ' · ' + ov.worldName + ' · ' + ov.roleName,
      ov.equippedTitleName + ' / ' + ov.realmName + ' / 战力 ' + ov.power,
      this.data.attrsLine,
      this.data.statsLine,
      '代表功法：' + this.data.topSkills.map(function (s) { return s.name + '（' + s.tierName + '）'; }).join('、'),
      '战力码 ' + this.data.myCode,
      '等是保底，练才是加速。',
    ];
    wx.setClipboardData({
      data: lines.join('\n'),
      success: function () { toast('道牒文案已复制，去晒吧'); },
      fail: function () { toast('复制失败'); },
    });
  },

  onMakeCard: function () {
    const W = 600;
    const H = 880;
    const ov = this.data.ov;
    if (!ov) return;
    const topSkills = this.data.topSkills;
    const attrsLine = this.data.attrsLine;
    const statsLine = this.data.statsLine;
    const myCode = this.data.myCode;
    const query = wx.createSelectorQuery();
    query.select('#shareCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) {
        toast('当前环境不支持生成图片，可长按卡片截图');
        return;
      }
      try {
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        if (!ctx) { toast('画布不可用，可长按卡片截图'); return; }
        let dpr = 2;
        try { dpr = wx.getSystemInfoSync().pixelRatio || 2; } catch (e) { dpr = 2; }

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        ctx.fillStyle = '#f2eee4';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#2f4a41';
        ctx.fillRect(24, 24, W - 48, H - 48);
        ctx.strokeStyle = '#b8893b';
        ctx.lineWidth = 3;
        ctx.strokeRect(42, 42, W - 84, H - 84);

        ctx.fillStyle = '#d8b775';
        ctx.font = '24px sans-serif';
        ctx.fillText('参 悟 · ' + ov.worldLabel + ' · ' + ov.worldName, 76, 106);

        ctx.fillStyle = '#fffdf7';
        ctx.font = 'bold 48px serif';
        ctx.fillText(ov.roleName, 76, 178);
        ctx.fillStyle = '#c9d6cd';
        ctx.font = '24px sans-serif';
        ctx.fillText(ov.equippedTitleName + ' / ' + ov.realmName, 76, 220);

        ctx.fillStyle = '#d8b775';
        ctx.font = '20px sans-serif';
        ctx.fillText('战 力', 76, 288);
        ctx.fillStyle = '#fffdf7';
        ctx.font = 'bold 92px serif';
        ctx.fillText(String(ov.power), 72, 380);

        ctx.strokeStyle = 'rgba(255,253,247,0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(76, 412);
        ctx.lineTo(W - 76, 412);
        ctx.stroke();

        ctx.fillStyle = '#c9d6cd';
        ctx.font = '22px sans-serif';
        ctx.fillText(attrsLine, 76, 458);

        ctx.fillStyle = '#d8b775';
        ctx.font = '22px sans-serif';
        ctx.fillText('代 表 功 法', 76, 518);
        ctx.font = '26px sans-serif';
        for (let i = 0; i < topSkills.length; i += 1) {
          ctx.fillStyle = '#fffdf7';
          ctx.fillText(topSkills[i].name, 76, 566 + i * 48);
          ctx.fillStyle = '#d8b775';
          ctx.fillText(topSkills[i].tierName + '  ' + topSkills[i].prof, 300, 566 + i * 48);
        }

        ctx.fillStyle = '#c9d6cd';
        ctx.font = '22px sans-serif';
        ctx.fillText(statsLine, 76, 724);
        ctx.fillStyle = '#9fb3a7';
        ctx.font = '20px sans-serif';
        ctx.fillText('战力码 ' + myCode, 76, 770);
        ctx.fillText('等是保底，练才是加速。', 76, 816);

        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0, y: 0, width: W, height: H,
          destWidth: W * dpr, destHeight: H * dpr,
          success: function (r) {
            wx.previewImage({ urls: [r.tempFilePath], current: r.tempFilePath });
          },
          fail: function () { toast('生成图片失败，可长按卡片截图'); },
        });
      } catch (e) {
        toast('生成图片失败，可长按卡片截图');
      }
    });
  },

  onExportSave: function () {
    const code = engine.exportSaveCode(store.get());
    this.setData({ showSaveCode: true, saveCode: code });
    wx.setClipboardData({
      data: code,
      success: function () { toast('存档码已复制，记得存到别处'); },
      fail: function () { toast('存档码已显示，请长按复制'); },
    });
  },

  closeSaveCode: function () { this.setData({ showSaveCode: false }); },

  openImport: function () { this.setData({ showImport: true }); },
  closeImport: function () { this.setData({ showImport: false }); },

  onImportInput: function (event) { this.setData({ importCode: event.detail.value }); },

  onPasteImport: function () {
    const self = this;
    wx.getClipboardData({
      success: function (res) { self.setData({ importCode: (res.data || '').trim() }); },
      fail: function () { toast('读取剪贴板失败'); },
    });
  },

  onImportSave: function () {
    const r = engine.importSaveCode((this.data.importCode || '').trim());
    if (!r.ok) { toast(r.msg); return; }
    const self = this;
    wx.showModal({
      title: '导入存档',
      content: '会覆盖当前全部进度，确定导入？',
      confirmText: '确定导入',
      success: function (res) {
        if (!res.confirm) return;
        store.replace(r.state);
        self.setData({ showImport: false, importCode: '' });
        toast('存档已导入');
        self.refresh();
      },
    });
  },

  onReset: function () {
    const self = this;
    wx.showModal({
      title: '重置存档',
      content: '所有熟练度、功法、称号与资源都会清空，且无法撤销。',
      confirmText: '确认重置',
      confirmColor: '#b4453c',
      success: function (res) {
        if (!res.confirm) return;
        store.reset();
        toast('已重置，从头再来');
        self.refresh();
      },
    });
  },

  onSignOut: function () {
    wx.showModal({
      title: '退出登录',
      content: '本机缓存会被清空，云端存档保留。下次用同一账号登录可继续。',
      confirmText: '退出',
      success: async function (res) {
        if (!res.confirm) return;
        const flushed = await store.flushCloud();
        if (!flushed.ok) { toast('进度尚未同步成功，请检查网络后再退出'); return; }
        const out = await cloud.auth.signOut();
        if (out && out.error) { toast('退出失败：' + (out.error.message || '请重试')); return; }
        await store.signOut();
        getApp().resetSession();
        getApp().awaitingLogin = true;
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },

  noop: function () {},
});
