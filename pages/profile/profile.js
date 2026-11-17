'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const worldData = require('../../data/world.js');
const { cloud } = require('../../utils/cloud.js');
const social = require('../../utils/cloud-social.js');
const share = require('../../utils/share.js');
const sfx = require('../../utils/sfx.js');
const copy = require('../../data/copy.js');
const skillsData = require('../../data/skills.js');
const privacy = require('../../utils/privacy.js');
const nav = require('../../data/navigation.js');

const SFX_LABEL = { low: '轻', mid: '中', off: '关' };

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

// 版本号只用来给玩家报「你在哪个版本」，出问题好对账。
// 开发者工具里 getAccountInfoSync().miniProgram.version 是空串，此时报「开发版」。
function appVersion() {
  try {
    const info = wx.getAccountInfoSync();
    const v = info && info.miniProgram && info.miniProgram.version;
    return v ? 'v' + v : '开发版';
  } catch (e) {
    return '开发版';
  }
}

function timeLabel(ts) {
  if (!ts) return '暂未同步';
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
    guest: false,
    versionLabel: '',
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
    this.setData({ sfxLabel: SFX_LABEL[sfx.level()] || '轻', versionLabel: appVersion() });
    this.refresh();
    this.loadAccount();
  },

  onShow: function () {
    this.refresh();
    this.loadAccount();
    social.publishScore(store.get());
  },

  onUnload: function () { store.unsubscribe(this.listener); },

  loadAccount: async function () {
    // 游客没有会话，问一次必然是失败；直接按「本机进度」报，别让账号那行显示「已登录」。
    if (getApp().globalData.guest) {
      this.setData({ accountLabel: '本机进度 · 未登录', guest: true });
      return;
    }
    try {
      const result = await getApp().ensureSession();
      const user = result && result.data && result.data.user;
      const label = user && (user.email || user.name) ? (user.email || user.name) : '已登录';
      this.setData({ accountLabel: label, guest: false });
    } catch (e) {
      this.setData({ accountLabel: '已登录', guest: false });
    }
  },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const top = engine.getTopSkills(state, 3);
    // 人物页要报「走到了哪一段、第几关」：这一把尺子在静室里藏得太深，
    // 玩家不进功法就完全看不到。主修用熟练度最高的那门，名字只取正名。
    const main = top[0];
    const progressLine = main
      ? String(main.name).split(skillsData.NAME_RULE.sep).pop() + ' · ' + main.stageName
        + ' · 已走通 ' + main.stageLevel + ' / ' + main.levelTotal + ' 关'
      : '暂未习得功法';
    const clearedTotal = engine.getSkillList(state).reduce(function (sum, s) {
      return sum + (s.stageLevel || 0);
    }, 0);
    const worlds = worldData.WORLDS.map(function (w) {
      return { id: w.id, label: w.label, name: w.name, enabled: w.enabled, intro: w.intro, style: w.style };
    });
    const attrsLine = ov.attrs.map(function (a) { return a.name + ' ' + a.value; }).join(' · ')
      + ' · 灵力上限 ' + ov.qi + ' / ' + ov.qiMax;
    const sync = syncView(store.getSyncStatus());
    const achievements = engine.getAchievements(state);
    const sorted = achievements.slice().sort(function (a, b) {
      return Number(a.unlocked) - Number(b.unlocked);
    });
    // 突破有两道门槛，都打勾叉：战力到没到（硬门槛）、布阵灵石备齐没有（花钱）。
    // 主修三门只报当前段位、用中性点标，勾不满也能突破——写成条件会让人白练。
    const bt = ov.breakthrough;
    const breakList = [{
      text: '战力 ' + ov.power + ' / ' + (bt.need || ov.power),
      mark: bt.available ? '✓' : '✕',
      markCls: bt.available ? 'imm-check__mark--on' : 'imm-check__mark--off',
      off: !bt.available,
    }].concat(bt.maxed || bt.available || !bt.fastest ? [] : [{
      // 「还差 2 点」如果不说该练哪门，玩家只能把十五门挨个试一遍。
      // 这里给的是「离下一段最近的那门」，不是加成最大的那门——今天就能动的那一步。
      // 只用短名：一行里塞不下「阵法·星罗点灯诀到入门」。
      text: '还差 ' + bt.lack + ' 点 · 最近：「'
        + String(bt.fastest.name).split(skillsData.NAME_RULE.sep).pop()
        + '」到' + bt.fastest.nextName + '（+' + bt.fastest.gain + '）',
      mark: '·',
      markCls: 'imm-check__mark--ref',
      off: false,
    }]).concat(bt.maxed ? [] : [{
      text: '布阵灵石 ' + ov.stone + ' / ' + bt.stoneCost + (bt.stoneReady ? '' : ' · 去切磋或秘境挣'),
      mark: bt.stoneReady ? '✓' : '✕',
      markCls: bt.stoneReady ? 'imm-check__mark--on' : 'imm-check__mark--off',
      off: !bt.stoneReady,
    }]).concat(bt.maxed ? [] : [{
      // 气海不是条件而是所得：破境之后一趟能多练几局，比「战力 +46」更贴日常。
      // 用中性点标，不参与「够不够格」的判断。
      text: '气海 ' + bt.qiCap + ' → ' + bt.qiCapAfter + '（+' + bt.qiCapGain + '）· 破境即补满',
      mark: '·',
      markCls: 'imm-check__mark--ref',
      off: false,
    }]).concat(top.map(function (s) {
      return {
        text: '主修 · ' + s.name + ' ' + s.tierName,
        mark: '·',
        markCls: 'imm-check__mark--ref',
        off: false,
      };
    }));
    this.setData({
      breakList: breakList,
      ov: ov,
      topSkills: top,
      worlds: worlds,
      myCode: engine.battleCode(state),
      attrsLine: attrsLine,
      progressLine: progressLine,
      statsLine: '习得 ' + ov.unlockedCount + ' / ' + ov.skillTotal + ' 门 · 共走通 ' + clearedTotal
        + ' 关 · 参悟 ' + ov.practiceCount + ' 次 · 胜 ' + ov.wins + ' 场',
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
    const bt = this.data.ov && this.data.ov.breakthrough;
    // 两件事分开判：条件是「够不够格」，灵石是「备不备得齐」。
    // 原来只判前者，灵石不够也会跳进参悟页，再被那边拦下——等于白跳一次。
    if (!bt || !bt.available) {
      toast('条件未齐，先修功法或积战力');
      return;
    }
    if (!bt.stoneReady) {
      toast('布阵灵石还差 ' + Math.max(0, bt.stoneCost - this.data.ov.stone) + ' 枚，去切磋或秘境挣');
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
    const self = this;
    // 弹窗里那个输入框是 type="nickname"，同样属于隐私接口：
    // 没过授权就开，输入框会静默带不出微信昵称，玩家只会以为是自己手机的问题。
    privacy.ensure().then(function (ok) {
      if (!ok) { toast('同意隐私保护指引后才能立道号'); return; }
      const s = store.get();
      self.setData({
        showRoleEditor: true,
        draftName: s.roleName || '',
        draftPortrait: s.portrait || 0,
      });
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
    const r = store.commitCritical(function (s) {
      return engine.updateRole(s, { name: name, portrait: portrait });
    });
    if (!r.ok) { toast(r.msg); return; }
    this.setData({ showRoleEditor: false });
    this.refresh();
    toast('道号已定下');
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onOpenPrivacy: function () { wx.navigateTo({ url: '/pages/help/help?topic=privacy' }); },

  // 游客想去登录：先摘掉游客标记，再进登录页（那边还能再选一次本机玩）。
  onGoLogin: function () {
    getApp().leaveGuest();
    wx.reLaunch({ url: '/pages/login/login' });
  },

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

  onToggleWorld: function () {
    this.setData({ worldOpen: !this.data.worldOpen });
  },

  onCopyCode: function () {
    const self = this;
    privacy.guard(function () {
      wx.setClipboardData({
        data: self.data.myCode,
        success: function () { toast('战力码已复制'); },
        fail: function () { toast('复制失败'); },
      });
    }, function () { toast('同意隐私保护指引后即可复制'); });
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
    privacy.guard(function () {
      wx.setClipboardData({
        data: lines.join('\n'),
        success: function () { toast('道牒文案已复制，去晒吧'); },
        fail: function () { toast('复制失败'); },
      });
    }, function () { toast('同意隐私保护指引后即可复制'); });
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
    // 存档码要落到剪贴板：被拒时仍然把码显示出来，玩家可以长按手动复制。
    privacy.guard(function () {
      wx.setClipboardData({
        data: code,
        success: function () { toast('存档码已复制，记得存到别处'); },
        fail: function () { toast('存档码已显示，请长按复制'); },
      });
    }, function () { toast('同意隐私保护指引后自动复制；现在可长按手动复制'); });
    this.setData({ showSaveCode: true, saveCode: code });
  },

  closeSaveCode: function () { this.setData({ showSaveCode: false }); },

  openImport: function () { this.setData({ showImport: true }); },
  closeImport: function () { this.setData({ showImport: false }); },

  onImportInput: function (event) { this.setData({ importCode: event.detail.value }); },

  onPasteImport: function () {
    const self = this;
    privacy.guard(function () {
      wx.getClipboardData({
        success: function (res) { self.setData({ importCode: (res.data || '').trim() }); },
        fail: function () { toast('读取剪贴板失败'); },
      });
    }, function () { toast('同意隐私保护指引后即可读取剪贴板'); });
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
      content: '所有熟练度、功法、称号与灵力灵石都会清空，且无法撤销。',
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
            title: '同步未成功',
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
