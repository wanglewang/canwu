'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const worldData = require('../../data/world.js');
const { cloud } = require('../../utils/cloud.js');
const social = require('../../utils/cloud-social.js');
const share = require('../../utils/share.js');
const sfx = require('../../utils/sfx.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');

const SFX_LABEL = { low: '轻', mid: '中', off: '关' };

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

function timeLabel(ts) {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function syncView(status) {
  if (status.conflict) {
    return { label: '进度有冲突，请回洞府选择保留哪一份', tone: 'error' };
  }
  if (status.error) {
    return { label: '未同步：' + status.error, tone: 'error' };
  }
  if (status.pending) {
    return { label: '有改动待同步，联网后会自动补写', tone: 'warn' };
  }
  return { label: '已同步 · ' + timeLabel(status.lastSyncedAt), tone: 'ok' };
}

Page({
  data: {
    ov: null,
    topSkills: [],
    worlds: [],
    worldOpen: false,
    myCode: '',
    attrsLine: '',
    statsLine: '',
    accountLabel: '',
    avatarUrl: '',
    syncLabel: '',
    syncTone: 'ok',
    achievements: [],
    achievementShown: [],
    achievementUnlocked: 0,
    achievementTotal: 0,
    showAllAchievements: false,
    showSaveCode: false,
    saveCode: '',
    showImport: false,
    importCode: '',
    showRoleEditor: false,
    draftName: '',
    draftPortrait: 0,
    draftAvatarTemp: '',
    sfxLabel: '轻',
    breakList: [],
    achOpen: false,
    moreOpen: false,
    settingsOpen: false,
    copy: copy.UI,
  },

  onLoad: function () {
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.setData({ sfxLabel: SFX_LABEL[sfx.level()] || '轻' });
    this.refresh();
    this.loadAccount();
  },

  onShow: function () {
    this.refresh();
    this.loadAccount();
    this.loadAvatar();
    social.publishScore(store.get());
  },

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

  // 头像存在云存储私有路径下，显示时换一个 1 小时的签名 URL；
  // 小程序运行时下载接口不可用，拿不到 URL 就静默回退到 CSS 道相。
  loadAvatar: async function () {
    const path = store.get().avatar;
    if (!path) { this.setData({ avatarUrl: '' }); return; }
    const r = await social.getAvatarUrl(path);
    this.setData({ avatarUrl: r.ok ? r.url : '' });
  },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const top = engine.getTopSkills(state, 3);
    const worlds = worldData.WORLDS.map(function (w) {
      return { id: w.id, label: w.label, name: w.name, enabled: w.enabled, intro: w.intro, style: w.style };
    });
    const attrsLine = ov.attrs.map(function (a) { return a.name + ' ' + a.value; }).join(' · ');
    const sync = syncView(store.getSyncStatus());
    const achievements = engine.getAchievements(state);
    const sorted = achievements.slice().sort(function (a, b) {
      return Number(a.unlocked) - Number(b.unlocked);
    });
    // 突破条件清单：三门代表功法是否大成 + 战力是否够下一境，只给勾，不讲原理。
    const breakList = top.map(function (s) {
      return { text: s.name + ' · ' + s.tierName, ok: s.prof >= 1000 };
    });
    breakList.push({
      text: '战力 ' + ov.power + ' / ' + (ov.breakthrough.need || ov.power),
      ok: !!ov.breakthrough.available,
    });
    this.setData({
      breakList: breakList,
      ov: ov,
      topSkills: top,
      worlds: worlds,
      myCode: engine.battleCode(state),
      attrsLine: attrsLine,
      statsLine: '习得 ' + ov.unlockedCount + ' / ' + ov.skillTotal + ' 门 · 参悟 ' + ov.practiceCount + ' 次 · 胜 ' + ov.wins + ' 场',
      syncLabel: sync.label,
      syncTone: sync.tone,
      achievements: achievements,
      achievementShown: this.data.showAllAchievements ? sorted : sorted.slice(0, 6),
      achievementUnlocked: achievements.filter(function (a) { return a.unlocked; }).length,
      achievementTotal: achievements.length,
    });
  },

  onToggleAchievements: function () {
    const show = !this.data.showAllAchievements;
    const sorted = this.data.achievements.slice().sort(function (a, b) {
      return Number(a.unlocked) - Number(b.unlocked);
    });
    this.setData({ showAllAchievements: show, achievementShown: show ? sorted : sorted.slice(0, 6) });
  },

  // 低频区块默认全折叠：首屏只有身份、属性、称号、突破条件。
  onToggleAchBlock: function () { this.setData({ achOpen: !this.data.achOpen }); },
  onToggleMore: function () { this.setData({ moreOpen: !this.data.moreOpen }); },
  onToggleSettings: function () { this.setData({ settingsOpen: !this.data.settingsOpen }); },

  onBreakthrough: function () {
    if (!this.data.ov || !this.data.ov.breakthrough.available) {
      toast('条件未齐，先练功法或攒战力');
      return;
    }
    wx.navigateTo({ url: '/pages/practice/practice?mode=breakthrough' });
  },

  onRetrySync: async function () {
    const r = await store.flushCloud();
    toast(r && r.ok ? '已重新同步' : (r && r.message ? r.message : '同步失败'));
    this.refresh();
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('profile') }); },

  openRoleEditor: function () {
    const s = store.get();
    this.setData({
      showRoleEditor: true,
      draftName: s.roleName || '',
      draftPortrait: s.portrait || 0,
      draftAvatarTemp: this.data.avatarUrl || '',
    });
  },

  closeRoleEditor: function () { this.setData({ showRoleEditor: false }); },

  onRoleNameInput: function (event) { this.setData({ draftName: event.detail.value }); },

  onNextPortrait: function () {
    this.setData({ draftPortrait: (this.data.draftPortrait + 1) % 6 });
  },

  // chooseAvatar 给的是临时文件路径，必须上传到云存储才能跨设备保留。
  onChooseAvatar: async function (event) {
    const temp = event.detail && event.detail.avatarUrl;
    if (!temp) return;
    this.setData({ draftAvatarTemp: temp });
    toast('正在上传头像…');
    const r = await social.uploadAvatar(temp);
    if (!r.ok) { toast(r.message || '头像上传失败'); return; }
    const saved = store.commitCritical(function (s) {
      return engine.updateRole(s, { avatar: r.path });
    });
    if (!saved.ok) { toast(saved.msg); return; }
    this.setData({ avatarUrl: temp });
    toast('头像已保存到账号');
  },

  onClearAvatar: function () {
    store.commitCritical(function (s) { return engine.updateRole(s, { avatar: '' }); });
    this.setData({ avatarUrl: '', draftAvatarTemp: '' });
    toast('已换回道相');
  },

  onSaveRole: function () {
    const name = this.data.draftName;
    const portrait = this.data.draftPortrait;
    const r = store.commitCritical(function (s) {
      return engine.updateRole(s, { name: name, portrait: portrait });
    });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showRoleEditor: false });
    this.refresh();
    toast('道号已定下');
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onToggleSfx: function () {
    const self = this;
    const keys = ['low', 'mid', 'off'];
    wx.showActionSheet({
      itemList: ['轻 · 最柔和', '中 · 标准音量', '关 · 完全静音'],
      success: function (res) {
        const next = sfx.setLevel(keys[res.tapIndex] || 'low');
        self.setData({ sfxLabel: SFX_LABEL[next] || '轻' });
        if (next !== 'off') sfx.play('hit');
      },
      fail: function () { /* 取消就不动 */ },
    });
  },

  onGoBattle: function () { wx.navigateTo({ url: '/pages/battle/battle' }); },

  onGoTitles: function () { wx.navigateTo({ url: '/pages/titles/titles' }); },

  onGoShop: function () { wx.navigateTo({ url: '/pages/shop/shop' }); },

  onToggleWorld: function () {
    this.setData({ worldOpen: !this.data.worldOpen });
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
      copy.BRAND.slogan,
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
        try {
          const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          dpr = win.pixelRatio || 2;
        } catch (e) { dpr = 2; }

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
        ctx.fillText(copy.BRAND.slogan, 76, 816);

        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0, y: 0, width: W, height: H,
          destWidth: W * dpr, destHeight: H * dpr,
          success: function (r) {
            const preview = function () {
              wx.previewImage({ urls: [r.tempFilePath], current: r.tempFilePath });
            };
            if (wx.showShareImageMenu) {
              wx.showShareImageMenu({ path: r.tempFilePath, fail: preview });
            } else {
              preview();
            }
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
        if (!flushed.ok) {
          wx.showModal({
            title: '还没同步成功',
            content: '当前有改动暂未写入云端，退出会清掉本机缓存。仍要退出吗？',
            confirmText: '仍要退出',
            confirmColor: '#b4453c',
            success: async function (again) {
              if (!again.confirm) return;
              const out = await cloud.auth.signOut();
              if (out && out.error) { toast('退出失败：' + (out.error.message || '请重试')); return; }
              await store.signOut();
              getApp().resetSession();
              getApp().awaitingLogin = true;
              wx.reLaunch({ url: '/pages/login/login' });
            },
          });
          return;
        }
        const out = await cloud.auth.signOut();
        if (out && out.error) { toast('退出失败：' + (out.error.message || '请重试')); return; }
        await store.signOut();
        getApp().resetSession();
        getApp().awaitingLogin = true;
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },

  noop: function () {},
});
