'use strict';

const pageTheme = require('../../utils/theme.js');
const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const share = require('../../utils/share.js');
const social = require('../../utils/cloud-social.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');
const skillsData = require('../../data/skills.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    themeTone: 'light',
    viewState: 'ready',
    ov: null,
    tiles: nav.TILES,
    breakPercent: 0,
    hintText: '',
    // 今日机缘：每天一桩可顺手做的修仙小事，纯叙事入口，不给资源。
    // 与「今日之课」分开：那条管练哪门，这条管今天还有什么可做。
    chance: null,
    quickSkillId: '',
    quickLabel: '去参悟',
    dailyReady: false,
    dailyGain: '',
    dailyAction: '',
    // 份例进度常驻：只在领得到那一刻才出现，玩家一整天都看不到「今天练了几局」。
    dailyCount: 0,
    dailyTarget: 0,
    dailyLeft: 0,
    // 名次也常驻：仙榜原本只在子页露一次，且列表只有前十。
    rankText: '',
    rankGapText: '',
    idleReady: false,
    idleText: '',
    syncLabel: '',
    syncTone: 'ok',
    showOffline: false,
    offline: null,
    showGift: false,
    gift: null,
    showExchange: false,
    exchange: null,
    copy: copy.UI,
  },

  onLoad: function () {
    pageTheme.syncPage(this);
    this.listener = this.refresh.bind(this);
    store.subscribe(this.listener);
    this.refresh();
  },

  onShow: function () {
    pageTheme.syncPage(this);
    // 先清再挂：两次 onShow 之间没走 onHide 的话，不清会叠出第二个定时器。
    this.clearTick();
    this.refresh();
    this.loadRank();
    // 灵力是参悟的油：坐着的每一分钟都在攒，所以这一行得自己走起来。
    // 半分钟刷一次只动这一行，不重算整页。
    const self = this;
    this.tick = setInterval(function () { self.refreshIdle(); }, 30000);
    this.maybeShowOffline();
    this.maybeShowGift();
  },

  // 闭关收获的弹窗。冷启动那次结算发生在 hydrate() 之后（网络回来才算），
  // 早于 onShow，也早于页面第一次 refresh —— 所以不能只在 onShow 里看一眼：
  // settle() 会 notify → refresh()，这里在 refresh 末尾也探一次，两条路都能弹出来。
  maybeShowOffline: function () {
    if (this.data.showOffline) return;      // 已经开着，别被后来的空报告覆盖
    const report = store.consumeOfflineReport();
    if (!report) return;
    const hours = Math.floor(report.minutes / 60);
    const mins = report.minutes % 60;
    this.setData({
      showOffline: true,
      offline: {
        duration: hours > 0 ? hours + ' 时 ' + mins + ' 分' : mins + ' 分',
        qi: report.qi,
        // 气海：这一趟坐出来的灵力有没有装下、散了多少，都要在弹窗里说清。
        qiCap: report.qiCap,
        overflow: report.overflow || 0,
        overflowText: report.overflow > 0 ? '气海已满，散去的 ' + report.overflow + ' 点未收' : '',
      },
    });
  },

  onHide: function () { this.clearTick(); },

  onUnload: function () {
    this.clearTick();
    store.unsubscribe(this.listener);
  },

  clearTick: function () {
    if (this.tick) { clearInterval(this.tick); this.tick = 0; }
  },

  // 打坐能收多少：只算不写，结算在引擎里（与冷启动那次闭关同一套算法）。
  refreshIdle: function () {
    const state = store.get();
    if (!state) return;
    const pending = engine.idlePending(state);
    // 一分钟只有 0.5 点，取整后可能还是 0：那一行写着「灵力 +0」比不出现更糟。
    // 闭关只有灵力这一条产出（不产熟练度），满池就没有可收的东西——不摆一个收不到的入口，
    // 满池这件事由上面那行 hintText 去说。
    const ready = pending.minutes >= 1 && pending.qi >= 1;
    const text = ready
      ? '已坐 ' + pending.minutes + ' 分 · 灵力 +' + pending.qi + ' / 上限 ' + pending.qiCap
      : '';
    this.setData({ idleReady: ready, idleText: text });
  },

  // 主页只报「我在榜上第几」和「差多少能上榜」，完整榜单仍在仙榜页。
  // 读失败时不摆一个假名次：空字符串让那一行只剩标签，不把网络问题说成没上榜。
  loadRank: async function () {
    const state = store.get();
    if (!state) return;
    const result = await social.refreshBoard(state, false);
    if (!result.board.ok) { this.setData({ rankText: '', rankGapText: '' }); return; }
    const rows = result.board.rows;
    const rank = social.myRankOf(rows);
    this.setData({
      rankText: copy.formatRank(rank),
      rankGapText: rank > 0 ? '' : copy.formatRankGap(
        social.rankGapOf(rows, engine.computePower(state)), social.RANK_LIMIT
      ),
    });
  },

  onMeditate: function () {
    const r = store.commitCritical(function (s) { return engine.meditate(s); });
    if (!r.ok) { toast(r.msg); return; }
    toast('打坐 ' + r.minutes + ' 分：灵力 +' + r.qi + '（' + r.qiCap + ' 满）');
    this.refresh();
  },

  refresh: function () {
    const state = store.get();
    const ov = engine.getOverview(state);
    const list = engine.getSkillList(state);
    const learned = list.filter(function (s) { return s.unlocked; });
    const rec = engine.recommend(state);
    const bt = ov.breakthrough;
    const breakPercent = bt.maxed || bt.need <= 0 ? 100 : Math.min(100, Math.round(bt.power / bt.need * 100));
    // 兑换面板要的数一次算清：页面不再自己拿灵石与气海再推一遍，
    // 否则按钮亮着、点下去却说装不下——两处各算一次必漂。
    const quote = engine.exchangeQuote(state);

    // 一行提示只报「下一步」，不讲原理；原理在「说明」页。
    let hintText = '今日之课：' + (rec.name || '去功法页择一门');
    const near = learned.filter(function (s) { return !s.maxed && s.percent >= 75; });
    near.sort(function (a, b) { return b.percent - a.percent; });

    // 灵力满着是最该被点出来的浪费：气海满了，挂机一分钟都不再生。
    // 它排「即将升段」之前，因为那是运营层面的损失，而升段只是进度上的好消息。
    if (ov.qiFull) hintText = '灵力已满 ' + ov.qi + ' / ' + ov.qiMax + ' · 去参一局，气海存不住更多了';
    else if (near.length > 0) hintText = near[0].name + ' 即将升段。';
    else if (bt.available) hintText = '境界已足，可去人物页突破 · 突破后战力 +' + bt.powerGain;
    // 门槛只有战力（world.realms[].power）：到这条线就够，不必再列第二个条件。
    // 但缺口是个冷数字，得同时说清「填平之后战力跳到多少」——那是玩家攒战力的理由。
    else if (!bt.maxed && bt.need > 0) {
      hintText = '距「' + bt.nextName + '」还差 ' + Math.max(0, bt.need - bt.power) + ' 战力';
      // 缺口之后要跟一句「今天练哪门」。只报「还差 30」时，玩家得把十五门挨个点开
      // 才知道哪门最划算——那一步正是「一堆小游戏」这个印象的来源。
      // 这里给的仍是「离下一段最近的那门」：不是加成最大的，是今天再打几局就能动的那一步。
      if (bt.fastest && bt.fastest.gain > 0) {
        hintText += ' · ' + String(bt.fastest.name).split(skillsData.NAME_RULE.sep).pop()
          + '到' + bt.fastest.nextName + ' +' + bt.fastest.gain;
      }
    }

    const dailyReady = !ov.daily.claimed && ov.daily.count >= ov.daily.target;
    // 份例按空位领（引擎里就是这么算的），所以这一行写的数就是点下去真能拿到的数。
    const dailyWill = Math.min(ov.daily.qi, ov.qiFree);
    const sync = store.getSyncStatus();
    let syncLabel = '';
    let syncTone = 'ok';
    if (sync.conflict) {
      syncLabel = '另一台设备也改过进度，请在弹窗里选保留哪一份';
      syncTone = 'error';
    } else if (sync.error) {
      syncLabel = '进度暂未同步到云端：' + sync.error;
      syncTone = 'error';
    } else if (sync.pending || getApp().globalData.offline) {
      syncLabel = '有改动待同步，联网后会自动补写';
      syncTone = 'warn';
    }
    this.setData({
      viewState: 'ready',
      ov: ov,
      syncLabel: syncLabel,
      syncTone: syncTone,
      breakPercent: breakPercent,
      // 条上只报「目标」——即突破要多少战力。以前写「战力 150 / 300」，与 30px 下面
      // 那个大数「战 力 150」同词同值印两遍；而「还差多少」那一句由 hintText 负责，
      // 这里再算一次差额就是同一件事两处各算。
      // （注意别拿「还需 N」来避重复：power=150、need=300 时 N 也是 150，看着还是重了。）
      hintText: hintText,
      chance: engine.dailyChance(),
      dailyReady: dailyReady,
      dailyCount: ov.daily.count,
      dailyTarget: ov.daily.target,
      dailyLeft: Math.max(0, ov.daily.target - ov.daily.count),
      // 领之前就写清能领多少：气海装不下时写「+60」再给 21，等于当场骗一次。
      // 气海一点空位都没有时，这一行仍然出现（玩家得知道有份例），但动作改成「气海已满」，
      // 别让人点一下才被告知领不了。
      dailyAction: dailyWill > 0 ? (copy.UI.actions.claim + ' ›') : '气海已满 ›',
      dailyGain: dailyWill >= ov.daily.qi
        ? copy.formatGain(dailyWill, 0)
        : (dailyWill > 0
          ? '灵力 +' + dailyWill + '（气海只余 ' + ov.qiFree + '）'
          : '气海满了 · 先练一局再来领'),
      quickSkillId: rec.id || (learned.length > 0 ? learned[0].id : ''),
      // 「参悟」进这一门的详情，「开始参悟」才开一局：两个词分别代表两件事，不再混用。
      quickLabel: rec.id ? '参悟 · ' + rec.name : copy.UI.actions.goSkills,
      exchange: quote,
    });
    this.refreshIdle();
    // 结算（store.settle）是先 notify 再返回的，弹窗只能在这里补一次。
    this.maybeShowOffline();
    this.maybeShowGift();
  },

  closeOffline: function () {
    this.setData({ showOffline: false, offline: null });
    // 两个弹层排队：闭关收获在前（它是「回来第一件事」），关掉再让开山礼上来。
    this.maybeShowGift();
  },

  // 开山礼：一次性发放。发放本身在引擎里（有存档记账，只发一次），这里只管把
  // 「钱到了」这张卡弹出来。与闭关收获共用一套 mask/modal，所以两卡不许同时出现——
  // 叠在一起时下面那张会被挡住，玩家会以为它没弹过。
  maybeShowGift: function () {
    if (this.data.showGift || this.data.showOffline) return;
    const report = store.consumeGiftReport();
    if (!report) return;
    this.setData({ showGift: true, gift: { stone: report.stone } });
  },

  closeGift: function () {
    this.setData({ showGift: false, gift: null });
  },

  onClaimDaily: function () {
    const r = store.commitCritical(function (s) { return engine.claimDaily(s); });
    if (!r.ok) { toast(r.msg); this.refresh(); return; }
    // 装不下就领不到这件事曾经让玩家以为功能是坏的：数字没动，提示是一长串算术。
    // 现在照实报「领到多少、散了几个」，一点余地都不留。
    let msg = '份例已领：灵力 +' + r.qi;
    if (r.lost > 0) msg += '（气海只余 ' + r.room + ' 点，余下 ' + r.lost + ' 散去）';
    toast(msg);
    this.refresh();
  },

  onOpenExchange: function () {
    this.refresh();
    this.setData({ showExchange: true });
  },

  onCloseExchange: function () { this.setData({ showExchange: false }); },

  // 弹层里的空方法：点面板本身不该把面板关掉。
  noop: function () {},

  onExchange: function () {
    const r = store.commitCritical(function (s) { return engine.exchangeQi(s, 1); });
    if (!r.ok) { toast(r.msg); this.refresh(); return; }
    toast('灵石 -' + r.stones + ' · 灵力 +' + r.qi);
    this.refresh();
  },

  onRetrySync: async function () {
    const r = await store.flushCloud();
    toast(r && r.ok ? '已重新同步' : (r && r.message ? r.message : '同步失败，请稍后再试'));
    this.refresh();
  },

  onTile: function (event) {
    const key = event.currentTarget.dataset.key;
    const tile = nav.TILES.filter(function (t) { return t.key === key; })[0];
    if (tile) nav.openTile(getApp(), tile);
  },

  // 今日机缘的落点：复用宫格那张路径表，不另写一份映射（改一处忘一处是本项目反复踩的坑）。
  // skills 是 tab，得 switchTab；其余按 navigateTo。home 指首屏的闭关行，滚一下就到，
  // 不跳页——那件事本来就在这一屏，跳走反而远了。
  onChance: function () {
    const action = this.data.chance && this.data.chance.action;
    if (!action || action === 'home') return;
    if (action === 'skills') { wx.switchTab({ url: '/pages/skills/skills' }); return; }
    const tile = nav.TILES.filter(function (t) { return t.key === action; })[0];
    if (tile) nav.openTile(getApp(), tile);
  },

  // 主页把人送进那一门功法的参悟页，不替人开局：难度档、规则速记、上一局评价都在那一屏。
  // 原来中间还有一层「功法详情」页，点了才到参悟页——那一跳已经并掉，现在是「点一次就到位」。
  onQuickPractice: function () {
    const id = this.data.quickSkillId;
    if (!id) {
      wx.switchTab({ url: '/pages/skills/skills' });
      return;
    }
    getApp().globalData.lastSkillId = id;
    wx.navigateTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  onGoHelp: function () { wx.navigateTo({ url: nav.helpUrl('index') }); },
  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },
  onGoBattle: function () { wx.navigateTo({ url: '/pages/battle/battle' }); },
  onGoSkills: function () { wx.switchTab({ url: '/pages/skills/skills' }); },
  onGoProfile: function () { wx.switchTab({ url: '/pages/profile/profile' }); },

  onShareAppMessage: function () { return share.appMessage(store.get()); },
  onShareTimeline: function () { return share.timeline(store.get()); },
});
