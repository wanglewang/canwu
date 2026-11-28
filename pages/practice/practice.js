'use strict';

// 页面只管三件事：生命周期与输入、把模块给的补丁挂上屏、把玩家动作转给控制器。
// 结算文案在 settle-view.js，粒子 / 音效 / 触感在 fx-layer.js，选段选关在 level-picker.js，
// 皮肤与订阅骨架在 utils/page-kit.js——新增一门玩法不必再改这个文件（2026-11 架构整改）。
const pageTheme = require('../../utils/theme.js');
const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const minigames = require('../../minigames/index.js');
const themes = require('../../minigames/theme.js');
const skillData = require('../../data/skills.js');
const practiceData = require('../../data/practice.js');
const levelData = require('../../data/levels.js');
const worldData = require('../../data/world.js');
const economyData = require('../../data/economy.js');
const guides = require('../../data/guides.js');
const visual = require('../../data/visual.js');
const sfx = require('../../utils/sfx.js');
const swipeInput = require('../../utils/swipe.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');
const navParams = require('../../utils/nav-params.js');
const share = require('../../utils/share.js');
const card = require('../../utils/card.js');
const settleView = require('./settle-view.js');
const fxLayer = require('./fx-layer.js');
const levelPicker = require('./level-picker.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    themeTone: 'light',
    mode: 'practice',
    showDifficulty: true,
    title: '',
    subtitle: '',
    gameName: '',
    tip: '',
    tierName: '',
    tierColor: '#3d8c74',
    percent: 0,
    nextText: '',
    nextBenefit: '',
    stageBoardBrief: '',
    stageBoardShort: '',
    goalText: '',
    stageKey: 'novice',
    // 关卡：一门一条 1–1000 的长线，五段。关只由「走通了几关」定——
    // 这也是功法的级：属性加成、本门新法、特效全读同一个数。
    level: 1,
    levelTotal: 1000,
    levelMax: 1,
    cleared: 0,
    // 段位条：{ key, name, on, done, locked, hint }。点已走到的段 = 回看那一段；
    // 段仍只由走通推进——切段只是换「看哪一段、打哪一关」，不解锁、不跳关。
    stages: [],
    stageIndex: 0,
    stageName: '未入门',
    levelSub: '',
    stageLv: 0,
    stageSize: 0,
    // 关卡大字的分母：当前段的末关号（未入门 10 / 入门 50 / …），
    // 不写全局 1000——段已切到外面，大字就该按这一段读。
    stageTotal: 0,
    // 选关面板：段在外面切，这里只铺当前段的整段关号（未至的压暗，点了有答）。
    pickerOpen: false,
    pickerLevels: [],
    pickerScrollTo: '',
    levelChange: '',
    stageChange: '',
    rankLabel: '黄阶',
    rankChar: '黄',
    rankColor: '#8a8f83',
    rankRewardText: '×1.00',
    decayTip: '',
    bestText: '',
    // 规则口径一行：只奖不罚，开局前就写清这一局会不会拿到换门省气。
    repeatNote: '',
    // 开局卡第一行：这一局做什么。整篇规则在说明页，这里只留一句。
    ruleText: '',
    // 开局前要先付的两笔：参悟烧灵力、突破备灵石。数字全部由 economy 同源给，
    // 页面只负责显示与拦截——两处各算一遍，就会出现「面板写 17、结算扣 24」。
    qi: 0,
    stone: 0,
    qiCost: 0,
    stoneCost: 0,
    canStart: true,
    costText: '',
    // 回关时的折减提示；没回关就是空串，整行不出现。
    retreatText: '',
    // 「这一门」= 原来功法详情页那几段（来历 / 风味 / 练成之后）。
    // 合并之后它折在开局卡最后：想看的点开，不想看的当它不存在，首屏不多一个字。
    archive: null,
    archiveOpen: false,
    // 换一门在页内解决：弹一层已持功法，点一门就换掉本页这一门。
    swapOpen: false,
    swapList: [],
    // 本门新法默认折叠：开关要在开局前能改，但七条规则不该铺在首屏。
    stageOpen: false,
    stageSummary: '',
    stageBrief: '',
    theme: themes.themeOf('forge', 'click'),
    twistName: '常规功课',
    stageRules: [],
    hintLabel: '提示',
    copy: copy.UI,
    vm: null,
    chargeWidth: 0,
    gradeNowColor: '#8a8f83',
    heartList: [],
    meterPercent: 0,
    countdown: 0,
    started: false,
    // 本局已终但盘面留着看（结算里点「留在本页」）：started 仍为 true，
    // 因为屏幕上是那一局打完的样子，不是准备页；区别是控制器已摘掉、底栏换成终局三项。
    boardHeld: false,
    // 每段第 1 关的引导：true 时页面渲染教学卡与教学盘，不渲染真局 HUD，也不结算。
    tutorial: false,
    showResult: false,
    result: null,
    barMode: '',
    // 局内那一行速记（guide.inline）。整篇规则在说明页，这里只留操作，不留解释。
    guide: null,
    introOn: false,
    intro: null,
    // 收起结算后准备页顶部还留一行「上局战绩」，随时能把结算明细叫回来重看。
    recordBrief: '',
    slashList: [],
    trailLen: 0,
    sceneOn: false,
    stage: visual.stageOf('forge'),
    qiDots: [
      { id: 1, x: 12, y: 58, o: 0.5 }, { id: 2, x: 26, y: 72, o: 0.35 },
      { id: 3, x: 38, y: 50, o: 0.42 }, { id: 4, x: 55, y: 66, o: 0.3 },
      { id: 5, x: 68, y: 54, o: 0.48 }, { id: 6, x: 80, y: 74, o: 0.36 },
      { id: 7, x: 90, y: 48, o: 0.44 }, { id: 8, x: 46, y: 82, o: 0.28 },
    ],
    sceneLamps: [],
    incensePercent: 100,
    scoreNum: 0,
    burstList: [],
    sparkList: [],
    // 探禁的盘面反馈：翻格涟漪 / 踩禁冲击环 / 连开扫光，只在这一门生成。
    mineFxList: [],
    // 落石垒基专用：下一块预告 + 刚化的行。其余玩法恒为空数组，页面不为它们多画东西。
    nextList: [],
    holdCells: [],
    lineFlashList: [],
    linkPathList: [],
    settlePhase: 0,
    settleFull: false,
    settleGain: '+0',
    settleGainLabel: '关',
    settlePercent: 0,
  },

  onLoad: function (query) {
    pageTheme.syncPage(this);
    this.pageAlive = true;
    this.controller = null;
    // 教学盘是独立控制器：它不结算、不进存档，只负责把「点一格翻五格」演一遍。
    this.teachController = null;
    // 这一屏已经给过一盘教学没有。换页重进会重来（那是新的 onLoad），
    // 同一屏里看一遍就够——否则走完教学回头调 onStart 会再判一次 canTeach。
    this.teachGiven = false;
    this.countdownTimers = [];
    this.needsRebuild = false;
    this.settleTimers = [];
    // 特效层：粒子 / 音效 / 触感的游标与撤场定时器全在它肚子里，
    // 页面只注入 setData 与存活判据；onUnload 一把清（旧版散在页面上，卸载时漏清）。
    const self = this;
    this.fx = fxLayer.createFxLayer({
      setData: function (patch) { if (self.pageAlive) self.setData(patch); },
      isAlive: function () { return self.pageAlive; },
    });
    // 选关器：回打游标与「未至的关点了有答」的规则都在 level-picker.js。
    this.picker = levelPicker.createPicker();
    // onLoad 失败分支的 900ms 自动返回：页面若已被手动关掉，这个定时器必须撤，
    // 否则会多退一层，把玩家从上一页也带走。
    this.leaveTimer = null;
    this.invalidEntry = false;
    this.cellRects = [];
    this.swipePath = null;
    // 最后一次「进入新格」的时间：抬手时用它算在靶心停住多久，供收势判定。
    this.lastStepAt = 0;
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    this.theme = themes.themeOf('forge', 'click');
    this.twist = '';
    this.mode = query && query.mode === 'breakthrough' ? 'breakthrough' : 'practice';
    // 分享深链 / 手工链接可能不带 skillId：用上次对着练的那门兜底。
    // 读写都收在 utils/nav-params.js，页面不再直写 globalData 字段名。
    this.skillId = navParams.skillIdOf(query);
    sfx.warm();

    if (this.mode === 'breakthrough') {
      const info = engine.breakthroughInfo(store.get());
      if (!info.available) {
        toast(info.maxed ? '已是当前最高境界' : '战力还不够，先去参悟');
        this.invalidEntry = true;
        this.leaveTimer = setTimeout(function () { wx.navigateBack(); }, 900);
        return;
      }
    }
    const s = skillData.getSkill(this.skillId);
    if (this.mode === 'practice' && (!s || !store.get().skills[this.skillId] || !store.get().skills[this.skillId].unlocked)) {
      toast('暂未习得这门功法');
      this.invalidEntry = true;
      this.leaveTimer = setTimeout(function () { wx.navigateBack(); }, 900);
      return;
    }
    this.setData({ mode: this.mode, showDifficulty: this.mode === 'practice' });
    this.refresh();
    this.buildGame();
  },

  onShow: function () {
    pageTheme.syncPage(this);
    if (!this.pageAlive || !this.mode || this.invalidEntry) return;
    this.refresh();
    if (this.needsRebuild && !this.data.showResult) {
      this.needsRebuild = false;
      this.buildGame();
    }
  },

  onHide: function () {
    this.clearCountdown();
    this.clearSettleTimers();
    this.stopTeach();
    // 切页 / 切后台同样算「局中离开」：先结账再拆 controller，顺序反了就读不到盘面进度。
    this.closeAbandonedRound();
    if (this.controller) this.controller.destroy();
    this.disarmLeaveGuard();
    sfx.stopAll();
    if (!this.data.showResult) {
      this.needsRebuild = true;
      this.setData({ started: false });
    } else if (this.data.sceneOn) {
      // 切出去再回来不该卡在演出中段，直接把按钮放出来。
      this.setData({ settlePhase: 4 });
    }
  },

  // 「这一局还在打吗」：在局内、没出结算，也不是「留在终局那一屏」。
  // 结束、左上角返回、切页三种离开方式都按这一个判据，免得三处各写一套。
  inRound: function () {
    if (!this.controller || !this.data.started) return false;
    if (this.data.showResult || this.data.boardHeld) return false;
    if (this.data.tutorial) return false;
    return true;
  },

  // 中途结束要说的话：冲关局起手不扣灵力（布阵灵石要到结算才扣），
  // 所以那句「起手耗去的灵力不退」在冲关里是假话，得分开写。
  abandonText: function (ask) {
    const tail = ask ? '确定结束？' : '';
    if (this.mode === 'breakthrough') return '本局作废，冲关失败不计所得。' + tail;
    return '本局作废，不计所得；起手耗去的灵力不退。' + tail;
  },

  // 左上角返回与「结束」必须是同一件事：区别只在按钮在哪儿（右上角那个带字，
  // 左上角那个只有箭头），结果却一个是弹窗确认、一个是静默丢盘，玩家学不会。
  // 小程序的 pages 没有 onBackPress 可以拦原生返回，官方唯一的入口是
  // wx.enableAlertBeforeUnload——它会在导航栏返回 / 安卓 back 键上先弹一次询问。
  // **它拦不住的两条写在这里，别指望它管全部**：iOS 侧滑手势官方明确不拦；
  // 退出小程序也不拦。那两条只能靠 onHide / onUnload 事后补账。
  armLeaveGuard: function () {
    if (typeof wx.enableAlertBeforeUnload !== 'function') return;
    if (!this.inRound()) return;
    wx.enableAlertBeforeUnload({ message: this.abandonText(false), fail: function () {} });
  },

  // 出结算、留在终局那一屏、自己调 navigateBack 之前都要撤掉，
  // 否则玩家在结算卡上点返回会被问一句「本局作废」——那一局早打完了。
  disarmLeaveGuard: function () {
    if (typeof wx.disableAlertBeforeUnload !== 'function') return;
    wx.disableAlertBeforeUnload({ fail: function () {} });
  },

  // 一局没打完就离开（返回 / 结束 / 切页）＝这一局作废：
  // **数值一笔不给**（关卡进度一分不推）——进度只在 applyPractice 里推，这里根本不进去。
  // 唯一要落地的是记钟（markTouched）：玩家确实练了这一段，不给数值也该在列表里往前排。
  // 三条出口（右上角「结束」/ 左上角返回 / 切页）都走这一个口子，别各写一套。
  // 已经结算过的局不走这里（showResult / boardHeld 时 inRound 为假）。
  closeAbandonedRound: function () {
    if (!this.inRound() || this.roundClosed) return;
    this.roundClosed = true;
    const skillId = this.skillId;
    if (!skillId || this.mode === 'breakthrough') return;
    this.markTouched();
  },

  // 盘面真的推进过没有。**判据不是「点过开始」**——进来瞄一眼规则就退的不该
  // 把这一门顶到列表最前，那是噪声，不是「最近练过」。progress 全部由 0 起涨
  // （计时型按已用时间、步数型按步数、收格型按格数），开局未动时为 0。
  hasProgress: function () {
    const vm = this.data.vm;
    if (!vm) return false;
    const score = Number(String(vm.scoreText || '').replace(/\D/g, '')) || 0;
    const prog = typeof vm.progress === 'number' ? vm.progress : 0;
    return score > 0 || prog > 0;
  },

  // 局中离开（返回 / 切后台）＝这一盘直接丢掉，不进结算、不写进度。
  // 但「我碰过这一门」要留下：那一路同样不走 applyPractice，不补这一笔，
  // 玩家打一段就退、再打一段再退，回去看列表纹丝不动（2026-11 真机反馈）。
  // **判据不是「点过开始」，而是「盘面真的推进过」**——进来瞄一眼就退的不该
  // 把这一门顶到列表最前，那是噪声，不是「最近练过」。progress 全部由 0 起涨
  // （计时型按已用时间、步数型按步数、收格型按格数），开局未动时为 0。
  markTouched: function () {
    if (this.mode === 'breakthrough' || this.data.tutorial) return;
    if (!this.skillId || !this.data.started) return;
    // 已经出结算的局，钟早就在 applyPractice / 结束那一路写过了。
    if (this.data.showResult) return;
    if (!this.hasProgress()) return;
    const skillId = this.skillId;
    store.commitCritical(function (s) { engine.touchSkill(s, skillId); });
  },

  onUnload: function () {
    this.pageAlive = false;
    this.clearCountdown();
    this.clearSettleTimers();
    // 导航返回走的是 onUnload 而不是 onHide（微信里点左上角返回只触发这一个），
    // 所以结账与撤守卫都要在这里再来一次；已经算过的局靠 roundClosed 挡住。
    this.closeAbandonedRound();
    this.disarmLeaveGuard();
    // 特效层的撤场定时器（迸溅 / 探禁环 / 行闪 / 连线）一把清，不再逐个点名。
    this.fx.destroy();
    if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
    this.stopTeach();
    if (this.controller) this.controller.destroy();
    this.controller = null;
    sfx.stopAll();
  },

  refresh: function () {
    const state = store.get();
    if (this.mode === 'breakthrough') {
      const info = engine.breakthroughInfo(state);
      this.theme = themes.themeOf('breakthrough', 'charge');
      this.twist = '';
      // 布阵要备灵石：筑基 60 / 金丹 120 / 元婴 240。冲关不成退一半。
      const btCost = economyData.breakthroughStone(state.realmIndex + 1);
      this.setData({
        title: '冲关 · ' + info.nextName,
        subtitle: '战力 ' + info.power + ' 已过 ' + info.need + ' 的门槛。',
        qi: state.resources.qi,
        stone: state.resources.stone,
        qiCost: 0,
        stoneCost: btCost,
        canStart: state.resources.stone >= btCost,
        costText: '布阵灵石 ' + btCost + ' · 余 ' + state.resources.stone
          + '（不成退半）',
        gameName: '蓄力停区',
        tip: '松手停在红线正中，评级最高',
        tierName: info.currentName,
        tierColor: '#b8893b',
        percent: 100,
        nextText: '目标 ' + info.nextName,
        nextBenefit: '',
        stageBoardBrief: '',
        stageBoardShort: '',
        rankLabel: '',
        rankChar: '',
        rankRewardText: '',
        decayTip: '',
        bestText: '',
        theme: this.theme,
        twistName: '',
        // 冲关只有一句话的规则，不存在「本门新法」与难度块。
        ruleText: '按住蓄力，松手停在两道红线之间；越贴近正中，评级越高。',
        retreatText: '',
        stageOpen: false,
        stageSummary: '',
        stageBrief: '',
        stageRules: [],
        // 冲关局没有功法，也就没有「这一门」与换门可讲。
        archive: null,
        archiveOpen: false,
        swapOpen: false,
        swapList: [],
      });
      return;
    }
    const skill = skillData.getSkill(this.skillId);
    const method = practiceData.getMethod(skill.method);
    // 教学盘要按「这一关的规格」摆，得拿到本关的真实参数（盘面尺寸、禁制数、要点几个…）。
    // 与正式局同一个 buildParamsAt，不看第二份表：两处各算一套就会像段位那行一样对不上。
    this.method = method;
    const rec = state.skills[this.skillId];
    const info = engine.tierInfo(rec.cleared);
    const theme = themes.themeOf(method.id, method.game);
    const twist = themes.twistOf(method.twist);
    const tier = practiceData.tierOf(skill.tier);

    // 一门一条 1–1000 的长线，五段。段位只由「走通了几关」定，玩家没有挑档这个动作：
    // 只能往前走（走通才推进一关），或往回翻（回关不推进度，只练手感）。
    const cleared = practiceData.clearedOf(rec);
    // 本门当前关 = 已通 + 1；走完 1000 关停在 1000。回打游标由选关器持有。
    const curNo = practiceData.curLevelOf(rec);
    const level = this.picker.resolveLevel(curNo);
    const levelMax = curNo;
    const stageIdx = levelData.stageOfLevel(level);
    const stageDef = practiceData.STAGES[stageIdx];
    const stageInfo = practiceData.stageDetail(method, stageIdx);
    const retreatText = practiceData.retreatText(level, curNo);
    // 本局要烧的灵力，与结算走同一个函数（engine.practiceCostOf）。
    // 耗气只看本关所在的段，与段内第几关无关。面板与结算各算一遍的话，
    // 最后一定会出现「写 17、扣 24」这种对不上的账。
    const qiCost = engine.practiceCostOf(state, skill.id, level);
    const qiNow = state.resources.qi;
    const qiMax = engine.qiCap(state);
    const canStart = qiNow >= qiCost;
    const costText = '耗灵力 ' + qiCost + ' · 余 ' + qiNow + ' / ' + qiMax;
    const best = state.records ? state.records[skill.id] : null;
    const bestText = best ? '本门最佳 ' + best.score + ' 分 · ' + best.grade : '';

    // 这一局是不是「换门」由存档里的上一门决定，和结算用的是同一条判定。
    const crossNow = !!state.lastPractice.skillId && state.lastPractice.skillId !== skill.id;
    const repeatNote = copy.practiceNote(crossNow, economyData.CROSS_QI);

    const realms = worldData.getWorld(state.worldId).realms;
    const realmNow = state.realmIndex + 1;
    const maxRealmName = realms[Math.min(realms.length - 1, tier.maxRealm - 1)].name;
    const needRealmName = realms[Math.min(realms.length - 1, tier.needRealm - 1)].name;
    let decayTip = '';
    if (realmNow < tier.needRealm) {
      decayTip = copy.decayText('below', needRealmName);
    } else if (realmNow > tier.maxRealm) {
      decayTip = copy.decayText('above', maxRealmName);
    }

    const offTwists = engine.twistsOff(state, this.skillId);
    let stageOn = 0;
    const stageRules = practiceData.stageRulesOf(method.id).map(function (r) {
      const on = rec.cleared >= worldData.TIERS[r.at].threshold;
      if (on) stageOn += 1;
      // 只有 hard 类（改规矩的）才给开关；勘位、稳基那种纯加成关了没好处，
      // 多一个开关只是多一处看不懂。
      const toggle = !!r.hard && on;
      const enabled = on && offTwists.indexOf(r.name) < 0;
      return {
        name: r.name,
        short: r.short || '',
        desc: r.desc,
        toggle: toggle,
        enabled: enabled,
        // 关掉和「还没解锁」是两件事：前者写「已关」，后者写段位名。
        stateText: on ? (enabled ? '已得' : '已关') : worldData.TIERS[r.at].name,
        tagCls: on && enabled ? 'tag--jade' : 'tag--grey',
      };
    });
    const stageSummary = stageOn ? '共 ' + stageRules.length + ' 项 · 已得 ' + stageOn : '共 ' + stageRules.length + ' 项';
    // 折叠态只留一行「已得的那几条长什么样」：名字 + 速记写法（死门＝✕ 格点不得）。
    // 这是原来「怎么玩」收起态里那半句的落点——开局前该知道这一门现在多了什么，
    // 但不值得为它铺开五条正文。
    const stageBrief = stageRules.filter(function (r) { return r.enabled; })
      .map(function (r) { return r.name + '＝' + r.short; }).join(' · ');
    // 下一段给什么：只写「还差 114」，玩家不知道练到那一步能得到什么。
    // 好处就在 world.TIERS[].desc 里（属性加成 / 本门新法），原样搬一句，不另编。
    const nextTier = info.maxed ? null : worldData.TIERS[info.index + 1];
    // S 线只写在准备页：局内只报「还差几分」，这里给出本档门槛与评级口径。
    // 分数线（三连互换）与盘数线（阵灯推演）都由 practiceData 同源生成，换段跟着变。
    const sLine = practiceData.sLineText(method, level);
    // 本关目标单独成行：sLine 讲的是「几成手数能拿哪档」，
    // 不写「这一局要收几株 / 连几次」，玩家就不知道自己在赶什么。
    // 按本关参数现算，和局内 meter、评级卡共用 matchGoalLine 一处真源。
    const roundGoalText = method && method.game === 'match'
      ? practiceData.matchGoalLine(practiceData.buildParamsAt(method, level)) : '';
    // 开局卡那一行：整篇规则在说明页，首屏只留「这一局做什么」。
    const guideData = guides.guideOf(method.game);
    const ruleText = guideData ? guideData.goal : method.desc;
    // 入门卡：第一次进这一门先摆三句「怎么玩」。教学盘（只有阵法·星罗烛天诀有）是跟着走一遍，
    // 入门卡是进门前读三行——十五门都得有，不然新门道只能靠试错。
    const introOn = !rec.introed && !!guideData;
    const intro = introOn ? {
      goal: guideData.goal,
      steps: (guideData.steps || []).slice(0, 3),
      inline: guideData.inline || '',
    } : null;

    // 详情页已经不在了：这一门的来历、风味与「练成之后」跟着准备页走。
    // 只取前两行：属性加成与本门特效（都已是按段位兑现的真实数字），代价与气海留给图鉴。
    const detail = engine.getSkillDetail(state, skill.id);
    const archive = detail ? {
      desc: detail.desc,
      flavor: detail.flavor,
      gains: (detail.gainLines || []).slice(0, 2),
    } : null;
    const swapList = engine.getSkillList(state)
      .filter(function (x) { return x.unlocked; })
      .map(function (x) {
        return {
          id: x.id,
          name: x.name.split(skillData.NAME_RULE.sep)[1] || x.name,
          mark: x.type.slice(0, 1),
          metaText: x.rankName + ' ' + x.percent + '%',
          current: x.id === skill.id,
        };
      });

    this.theme = theme;
    this.twist = method.twist;
    this.setData({
      title: skill.name,
      subtitle: skill.desc,
      gameName: minigames.gameName(method.game),
      // 盘面配色的作用域钩子。扫雷挂 board--mines：它的「未探 / 已探」是正反两种
      // 牌面，而数独的已填格虽同名（cell--open），语义是「这一格定了」，要留亮纸。
      // 并蒂引挂 board--link：只有这一门的盘面按竖屏重排过（5×5 / 6×6 / 6×8），
      // 格子高度必须跟着列数走；别的门拿到这个类会被带歪。
      // 两个钩子都只在 wxss 里挑一组尺寸与颜色，不入样式判断。
      boardCls: fxLayer.BOARD_CLS[method.game] || '',
      // 与局内那一行同源：三连互换的罚息按档变，这里不许留一句写死的「少 2 息」。
      tip: practiceData.tipFor(method, stageIdx),
      ruleText: ruleText,
      introOn: introOn,
      intro: intro,
      tierName: info.name,
      tierColor: info.color,
      percent: info.percent,
      nextText: info.maxed ? '已至大圆满' : '距 ' + info.nextName + ' 还差 ' + (info.nextThreshold - rec.cleared) + ' 关',
      nextBenefit: nextTier ? '到「' + nextTier.name + '」：' + nextTier.desc : '',
      stageKey: stageDef.key,
      level: level,
      levelTotal: levelData.LEVEL_MAX,
      levelMax: levelMax,
      curLevel: curNo,
      cleared: cleared,
      // 进度只写两个数：本门走通了几关（0–1000），以及在本段里的位置。
      // 段名是玩家理解进度的那把尺子，「第 762 关」本身不说明任何事。
      // 中格两行是两把尺子，不是同一件事印两遍：大字「第 451 / 500 关」的分母是
      // 段末关（段内位置），这一行的分母是 1000（全局进度）——两个数不等、分母也不同，
      // 看着像重复，其实是本屏唯一一处能读出全局走到哪的地方。
      levelSub: '已走通 ' + cleared + ' / ' + levelData.LEVEL_MAX + ' 关'
        + (level < curNo ? ' · 回打' : ''),
      // 小节标题右侧沿用「哪一段 + 这一段走到第几关」，与中格各报一件事。
      stageLv: levelData.levelInStage(level),
      stageSize: levelData.stageSize(stageIdx),
      stageTotal: stageDef.to,
      levelChange: (function () {
        const d = practiceData.levelDelta(method, level);
        // 换段 / 第一关 / 最后一关本来说的都是整件事，不是「比上一关变了哪一处」，
        // 别再挂「本关变化：」——第一关没有上一关，末关说的是一千关的跨度。
        const head = function (list) {
          return (list[0].chapter || list[0].start || list[0].final) ? '' : '本关变化：';
        };
        const text = function (list) { return list.map(function (x) { return x.text; }).join(' · '); };
        // 并蒂连枝引的段内台阶是「每对时辰」，levelDelta 平时就报出来了；
        // 偶有两档舍入后一样（大对数时每对只差几厘），也要写出本关每对是多少——
        // 只写「与上一关相同」，玩家会以为这一段从头到尾都是同一张盘、同一个时限。
        if (method && method.game === 'link') {
          if (!d.length) {
            const q = practiceData.buildParamsAt(method, level);
            const pairs = practiceData.linkPairsOf(q);
            return '每对 ' + (q.duration / pairs).toFixed(2) + ' 息 · 与上一关规格相同（盘面换段才换）';
          }
          if (d[0].start || d[0].final) return text(d);
          return head(d) + text(d);
        }
        // 兜底那句不再重复本段第几关：同一屏里已经说过两次，第三遍只会让这一行像噪音。
        if (!d.length) return '与上一关规格相同（盘面换段才换，段内只收节奏与评级线）';
        return head(d) + text(d);
      })(),
      // 段位条：五段一条，既报进度也是切段的入口——点已走到的段落到那一段已至的最高关。
      // 段的「锁」只问有没有走到：回打到早段时，进度所在的段仍可点回去，不能误锁。
      stages: practiceData.STAGES.map(function (d, i) {
        const done = cleared >= d.to;
        const reached = levelMax >= d.from;
        const on = i === stageIdx;
        return {
          key: d.key,
          name: d.name,
          on: on,
          done: done,
          locked: !reached,
          hint: done ? '已走通'
            : (reached ? (levelMax - d.from + 1) + ' / ' + (d.to - d.from + 1) : '未到'),
        };
      }),
      stageIndex: stageIdx,
      stageName: stageDef.name,
      stageChange: practiceData.stageSpec(method, level),
      qi: qiNow,
      qiMax: qiMax,
      stone: state.resources.stone,
      qiCost: qiCost,
      stoneCost: 0,
      canStart: canStart,
      costText: costText,
      retreatText: retreatText,
      // 这一段除了更贵还收紧了什么：stageDetail 已经算好了（亮起时长、口诀轮数…），
      // 以前只在数据里躺着没渲染，玩家只能看到「×1.70」。
      stageBoardBrief: stageInfo.brief,
      // 局内只报短版：整句罚时与 S 线留在准备页，盘上这一行要一眼读完。
      stageBoardShort: stageInfo.short,
      goalText: sLine,
      roundGoalText: roundGoalText,
      rankLabel: tier.label,
      rankChar: tier.name,
      rankColor: tier.color,
      // 品阶这一行不再写「收益 ×3.20」——参悟不产资源了。
      // 它现在唯一的作用是耗气系数，具体数字已经算进 qiCost，这里只说「更费气」。
      rankRewardText: tier.stars > 1 ? '耗气 ×' + tier.qiCost.toFixed(2) : '',
      decayTip: decayTip,
      bestText: bestText,
      repeatNote: repeatNote,
      theme: theme,
      twistName: twist.name,
      stageRules: stageRules,
      stageSummary: stageSummary,
      stageBrief: stageBrief,
      archive: archive,
      swapList: swapList,
    });
  },

  buildGame: function () {
    if (this.controller) this.controller.destroy();
    // 演出序号归零：连开两局时上一局末帧的键值还留着，新局第一次消行/连线
    // 若碰巧同号就被当成「演过了」吞掉。游标全在特效层，这里一把清。
    this.fx.resetRound();
    // 新一局默认不是「主动结束」：这个标记只由 onAbandon 置位，结算读完即失效。
    // 同一条 F 有两种来历——主动退出（整局作废）与失败（一局打完但没成），
    // 处置完全不同（一个作废、一个照常结算），所以必须在页面上分开。
    this.aborting = false;
    const state = store.get();
    let gameId = 'charge';
    let params = {};
    let methodName = '突破瓶颈';
    let tip = '长按蓄力，松手停在红线之间';
    let tier = 0;

    if (this.mode === 'practice') {
      const skill = skillData.getSkill(this.skillId);
      const method = practiceData.getMethod(skill.method);
      gameId = method.game;
      // 一关一副参数，按本关所在段 + 段内进度现算。
      params = practiceData.buildParamsAt(method, this.data.level);
      methodName = method.name;
      // 代价句里的罚息随段变（三连互换），不能用写死在功法表里的那一句。
      tip = practiceData.tipFor(method, this.data.stageIndex);
      tier = engine.tierIndexOfCleared(state.skills[this.skillId].cleared);
    }
    const perks = this.mode === 'breakthrough'
      ? { easy: state.realmIndex >= 2, tier: state.realmIndex }
      // 关掉的阶段新法跟着这一局走：玩家在准备页关掉逆诵，进局就该真的不逆诵。
      : { easy: tier >= 3, tier: tier, offTwists: engine.twistsOff(state, this.skillId) };

    // 反馈调性按玩法分档（刀法凌厉 / 心法沉静 / 灵植温润）：由玩法模块声明，特效层只读。
    this.gameId = gameId;
    this.haptic = minigames.hapticOf(gameId);
    const self = this;
    this.controller = minigames.createGame(gameId, {
      params: params,
      // 玩法模块只认 normal / hard 两档手感；真正的段间差异全部落在 params 上。
      difficulty: practiceData.STAGES[this.data.stageIndex].gear,
      stageKey: this.data.stageKey,
      perks: perks,
      tip: tip,
      methodName: methodName,
      theme: this.theme,
      twist: this.twist,
      // 一帧 vm → 一揽子补丁：粒子 / 音效 / 触感 / 拍子全在 fx-layer 按通用信号处理，
      // 页面不认识任何具体玩法的特效字段。
      render: function (vm) {
        if (!self.pageAlive) return;
        self.setData(self.fx.frame(vm, self.data, { sceneOn: self.data.sceneOn, haptic: self.haptic }));
        self.syncBar();
      },
      finish: function (res) { self.onFinish(res); },
    });
    const stage = visual.stageOf(this.theme.key);
    this.fx.resetRound();
    this.roundClosed = false;
    this.setData({
      started: false,
      showResult: false,
      boardHeld: false,
      // result / recordBrief 不清：留在准备页时切出去再回来，controller 要重建，
      // 但「上局战绩」还得能点开重看。只有「再来一局」才显式清掉。
      guide: guides.guideOf(gameId),
      hintLabel: practiceData.hintLabelOf(gameId),
      sceneOn: stage.on,
      stage: stage,
      burstList: [],
      sparkList: [],
      mineFxList: [],
      settlePhase: 0,
    });
    this.syncBar();
  },

  clearSettleTimers: function () {
    const list = this.settleTimers || [];
    for (let i = 0; i < list.length; i += 1) clearTimeout(list[i]);
    this.settleTimers = [];
  },

  // 结算五段演出：S/A 满 1.8 秒，B/C/F 压到 900ms；全程不用逐帧 setData。
  // 大字文案与时间线都从 settle-view 取，页面只负责按点挂 settlePhase。
  startSettle: function (rv, grade) {
    this.clearSettleTimers();
    const spec = settleView.startPatch(rv, grade, this.data.percent);
    const self = this;
    this.setData(spec.patch);
    for (let i = 1; i < spec.timeline.length; i += 1) {
      const id = setTimeout(function () {
        if (self.pageAlive && self.data.showResult) self.setData({ settlePhase: i });
      }, spec.timeline[i]);
      this.settleTimers.push(id);
    }
  },

  onSkipSettle: function () {
    if (this.data.settlePhase >= 4) return;
    this.clearSettleTimers();
    this.setData({ settlePhase: 4 });
  },

  // 吸底条只在真有操作可给的时候出现：准备页是「开始参悟」，局内只有带撤销/提示的玩法才占位。
  // 其余玩法不挂条也不留底部空白，盘面能多占一截屏幕。
  syncBar: function () {
    if (!this.pageAlive) return;
    const vm = this.data.vm;
    let mode = '';
    if (this.data.showResult) mode = '';
    // 本局已终、盘面留在屏上：这一屏不能点盘面了，三个去处全在底栏。
    else if (this.data.boardHeld) mode = 'done';
    // 教学盘没有「结束」也没有提示按钮：它连一步都不计，底栏不该出现任何可点项。
    else if (this.data.tutorial) mode = '';
    // 撤销 / 复位 / 提示三者有一个就得出条：华容道只有「复位」，没有这一项就点不到。
    else if (this.data.started) mode = vm && (vm.extras.showUndo || vm.extras.showHint || vm.extras.showReset) ? 'tools' : '';
    else mode = 'start';
    if (mode !== this.data.barMode) this.setData({ barMode: mode });
  },

  clearCountdown: function () {
    for (let i = 0; i < this.countdownTimers.length; i += 1) clearTimeout(this.countdownTimers[i]);
    this.countdownTimers = [];
    if (this.data.countdown !== 0) this.setData({ countdown: 0 });
  },

  // 资源不够时的唯一出口：说清差多少、差什么，给一个真能解决问题的去处。
  // 参悟缺的是灵力——回洞府闭关（离线也在攒）或去切磋（耗气换灵石）；
  // 冲关缺的是灵石——只能去切磋与秘境挣，灵力再多也换不来。
  askCost: function () {
    if (this.mode === 'breakthrough') {
      const lack = Math.max(0, this.data.stoneCost - this.data.stone);
      wx.showModal({
        title: '灵石不足',
        content: '布阵要 ' + this.data.stoneCost + ' 枚灵石，你还差 ' + lack
          + ' 枚。灵石只能靠切磋与秘境挣——先回洞府，从「仙门切磋」或「秘境探索」走一趟。',
        confirmText: '去切磋',
        cancelText: '稍后',
        success: function (res) {
          if (res.confirm) wx.navigateTo({ url: '/pages/battle/battle' });
        },
      });
      return;
    }
    const lack = Math.max(0, this.data.qiCost - this.data.qi);
    wx.showModal({
      title: '灵力不足',
      content: '本局需 ' + this.data.qiCost + ' 点，还差 ' + lack
        + ' 点（气海上限 ' + this.data.qiMax + '）。回洞府闭关打坐，每分钟 '
        + worldData.getWorld().idle.qiPerMinute + ' 点，约坐 '
        + Math.ceil(lack / worldData.getWorld().idle.qiPerMinute)
        + ' 分钟就够了' + (this.data.stone > 0 ? '；等不及的话，回洞府拿灵石换（1 枚 100 点）' : '')
        + '。上限不够用时，破境或练真元都能把气海拓深。',
      confirmText: '回洞府',
      cancelText: copy.UI.actions.cancelStart,
      success: function (res) {
        if (res.confirm) wx.switchTab({ url: '/pages/index/index' });
      },
    });
  },

  // 引导按段走：一门五段，每段的第 1 关给一次。
  // 首段那次讲整门机制（怎么玩、赢在哪、输在哪），后四次只讲这一段新变的那件事——
  // 段界本来就是「规则换了一道」，玩家走到第 11 / 51 / 201 / 501 关时最该知道的正是它。
  // 只看「是不是段的第一关」与「这一段教过没有」，不看品阶、不看回打：
  // 回打到某个没教过的段，照样补一次（那时候他确实还没见过这一段的盘）。
  teachStage: function () {
    const level = Math.round(this.data.level) || 0;
    if (level <= 0) return -1;
    if (levelData.levelInStage(level) !== 1) return -1;
    const idx = levelData.stageOfLevel(level);
    return idx >= 0 && idx < practiceData.STAGES.length ? idx : -1;
  },

  // 只对「模块自带 teach 脚本」的玩法生效；没脚本的玩法照旧开局，不硬塞过场。
  // **不读存档里「这一段看过没有」**：弹不弹只看「是不是本段的第 1 关」。
  // 记过一次就再也不弹的代价是「错过即永别」——教学盘整批重做过一次（75 盘），
  // 而老档的标记还停在旧内容上，玩家回第一关再也见不到新盘。
  // 不想看的人点右上「跳过指引」，跳过只对这一次有效，离开本页再进来还会给。
  // `teachGiven` 是「这一屏已经给过一盘」：没有它，finishTeach 回头调 onStart
  // 会再判一次 canTeach，而 hasTaught 已经不拦了 —— 直接死循环。
  canTeach: function () {
    if (this.teachGiven) return false;
    if (this.mode !== 'practice' || !this.skillId) return false;
    if (!this.gameId || !minigames.hasTeach(this.gameId)) return false;
    return this.teachStage() >= 0;
  },

  startTeach: function () {
    const self = this;
    const stage = this.teachStage();
    this.teachGiven = true;
    this.teachStageIdx = stage < 0 ? 0 : stage;
    this.clearCountdown();
    this.stopTeach();
    if (this.controller) { this.controller.destroy(); this.controller = null; }
    this.teachController = minigames.createTeach(this.gameId, {
      theme: this.theme,
      // 段界教学与首段教学不是同一盘：段界那几盘按「本段规格」摆，
      // 让玩家在真的变大的盘、变多的禁制上做那一手，而不是听一句话。
      stage: this.teachStageIdx,
      params: this.method ? practiceData.buildParamsAt(this.method, this.data.level) : {},
      render: function (vm) {
        if (!self.pageAlive) return;
        // 教学盘也要有声音（浮字与拍子），但不要粒子 / 触感——那是一局的压力。
        self.fx.sound(vm);
        // 教学盘没有命灯、刻度与连击：只给盘面 + 一句该怎么做。
        self.setData({
          vm: vm, tutorial: true, started: true,
          chargeWidth: 0, heartList: [], meterPercent: 0, burstList: [],
        });
        self.syncBar();
      },
      done: function () { self.finishTeach(false); },
    });
    if (!this.teachController) { this.teachController = null; return; }
    this.setData({ tutorial: true, started: true, showResult: false });
    this.teachController.start();
  },

  stopTeach: function () {
    if (this.teachController) {
      this.teachController.destroy();
      this.teachController = null;
    }
    if (this.data.tutorial) this.setData({ tutorial: false });
  },

  // 跳过与走完同一条路：记一笔「这一段的教学他见过」，回准备页重建真局再起手。
  // 跳过不做二次确认——它本来就不是门槛，玩家说看懂了就该放他走。
  // 这笔记录现在只做事后统计与旧接口兼容，**不再决定下一次弹不弹**（见 canTeach）。
  finishTeach: function (skipped) {
    const self = this;
    const stage = typeof this.teachStageIdx === 'number' ? this.teachStageIdx : 0;
    this.stopTeach();
    store.commitCritical(function (s) { return engine.markTaught(s, self.skillId, stage); });
    this.setData({ tutorial: false, started: false, vm: null, burstList: [], sparkList: [], mineFxList: [] });
    this.buildGame();
    if (skipped) sfx.play('tap');
    this.onStart();
  },

  // 读完入门卡：记进存档，这一门以后不再弹；想重看走右上「说明」。
  onCloseIntro: function () {
    const self = this;
    store.commitCritical(function (s) { return engine.markIntroed(s, self.skillId); });
    this.setData({ introOn: false });
    sfx.play('tap');
  },

  onSkipTeach: function () {
    if (!this.data.tutorial) return;
    this.finishTeach(true);
  },

  onStart: function () {
    if (this.data.started || this.data.countdown > 0) return;
    // 兜底：准备屏上必须有一副能起手的盘。会摘控制器的路径（回准备屏、切页回来）各自负责重建，
    // 这里再守一道——漏了重建的后果是按钮点上去毫无反应，玩家只会以为卡死、退出去重进。
    if (!this.controller) this.buildGame();
    if (!this.controller) return;
    // 新一局开始：上一局的「已结账」标记要清掉，否则这一局的结束 / 返回不会被记钟。
    this.roundClosed = false;
    // 付不起就先拦：教学盘不结算也不扣气，可以照走；真局与冲关必须付得起。
    // 拦在起手，而不是打完再告诉玩家「其实你没气」——那时候盘的功夫已经白费了。
    if (!this.canTeach() && !this.data.canStart) { this.askCost(); return; }
    if (this.canTeach()) { this.startTeach(); return; }
    const self = this;
    this.clearCountdown();
    this.setData({ countdown: 3 });
    sfx.play('tick');
    function step() {
      const id = setTimeout(function () {
        if (!self.pageAlive) return;
        const n = self.data.countdown - 1;
        if (n <= 0) {
          self.setData({ countdown: 0, started: true });
          // 盘面一活就挂上返回询问：从这一刻起按左上角返回与点结束都是「作废」。
          self.armLeaveGuard();
          sfx.play('go');
          if (self.controller) self.controller.start();
          self.syncBar();
          // 盘面刚从「准备态」切到「局内态」，等一帧再量格子矩形给划刀用。
          setTimeout(function () { if (self.pageAlive) self.measureBoard(); }, 60);
        } else {
          self.setData({ countdown: n });
          sfx.play('tick');
          step();
        }
      }, 380);
      self.countdownTimers.push(id);
    }
    step();
  },

  onSkipCountdown: function () {
    if (!this.pageAlive || this.data.countdown <= 0) return;
    this.clearCountdown();
    if (this.controller) this.controller.start();
    sfx.play('go');
    this.setData({ started: true });
    this.armLeaveGuard();
    this.syncBar();
    const self = this;
    setTimeout(function () { if (self.pageAlive) self.measureBoard(); }, 60);
  },

  // 倒数三秒里还能反悔：这时 controller.start() 还没调用，撤掉遮罩就是回到准备页，
  // 不用先开局再「结束」。想看清规则、难度与本门新法的人有这一拍。
  onCancelCountdown: function () {
    if (!this.pageAlive || this.data.countdown <= 0) return;
    this.clearCountdown();
    this.disarmLeaveGuard();
    this.setData({ started: false });
    this.refresh();
    this.syncBar();
  },

  onResize: function () { this.measureBoard(); },

  // 本门新法默认折叠：开关要在开局前能改，但七条规则不该铺在首屏。
  onToggleStage: function () {
    this.setData({ stageOpen: !this.data.stageOpen });
    sfx.play('tap');
  },

  onToggleArchive: function () {
    this.setData({ archiveOpen: !this.data.archiveOpen });
    sfx.play('tap');
  },

  // 换一门练：功法详情页没了，但这件小事不该退回到功法页再点一遍。
  // 换完用 redirectTo 重开本页——本页的难度、规则、盘面全都跟着功法走，
  // 原地改一半比整页重来更容易出错；redirectTo 不会把旧页留在返回栈里。
  onToggleSwap: function () {
    if (this.data.started || this.data.countdown > 0) return;
    this.setData({ swapOpen: !this.data.swapOpen });
    sfx.play('tap');
  },

  onSwapTo: function (event) {
    const id = event.currentTarget.dataset.id;
    if (!id || id === this.skillId) { this.setData({ swapOpen: false }); return; }
    navParams.setLastSkill(id);
    wx.redirectTo({ url: '/pages/practice/practice?skillId=' + id });
  },

  noop: function () { },

  // 这一门的整篇规则只在说明页：准备页只留一行「这一局做什么」，局内只留两行速记。
  // 局中不能开说明（切页即本局作废），所以这个入口必须留在开局前。
  onGoHelp: function () {
    const skill = this.mode === 'practice' ? skillData.getSkill(this.skillId) : null;
    if (skill) {
      wx.navigateTo({ url: nav.practiceHelpUrl(skill.method, '', this.data.stageKey) });
      return;
    }
    wx.navigateTo({ url: nav.practiceHelpUrl('', 'charge') });
  },

  // 选段选关的规则（只由走通推进、回打不推、未至的点了有答）都在 level-picker.js；
  // 页面只把玩家动作转过去，按返回结果决定「重算 / 答哪句话」。
  applyPick: function (r) {
    if (r.toast) { toast(r.toast); return; }
    if (r.close) this.setData({ pickerOpen: false });
    if (r.changed) {
      this.refresh();
      this.buildGame();
    }
  },

  // 关卡切换：一次一格，只能往回翻到已走通的关。往前推进只靠走通。
  onLevel: function (event) {
    if (this.data.started || this.data.countdown > 0) return;
    const dir = Number(event.currentTarget.dataset.d) || 0;
    if (!dir) return;
    this.applyPick(this.picker.step(dir, this.data));
  },

  // 段在外层切：点已走到的段就落到那一段已至的最高关，段内别处再点关号。
  onPickStage: function (event) {
    if (this.data.started || this.data.countdown > 0) return;
    this.applyPick(this.picker.pickStage(Number(event.currentTarget.dataset.idx), this.data));
  },

  // 选关面板：段已在外面切好，这里只铺当前段。让回打旧关不用按几百次箭头。
  onOpenLevelPicker: function () {
    if (this.data.started || this.data.countdown > 0) return;
    const idx = this.picker.stageOfLevel(this.data.level);
    const self = this;
    this.setData({
      pickerOpen: true,
      pickerLevels: this.picker.buildLevels(idx, this.data.level, this.data.levelMax),
      // 先清空：同段重复打开时值若没变，scroll-into-view 不会重新定位。
      pickerScrollTo: '',
    });
    // scroll-view 到这一帧才建出来，scroll-into-view 要等渲染后才吃得稳。
    setTimeout(function () {
      self.setData({ pickerScrollTo: 'lv-' + self.picker.anchor(idx, self.data.level, self.data.levelMax) });
    }, 60);
  },

  onPickLevel: function (event) {
    if (this.data.started || this.data.countdown > 0) return;
    this.applyPick(this.picker.pick(Number(event.currentTarget.dataset.lv), this.data));
  },

  onCloseLevelPicker: function () {
    this.setData({ pickerOpen: false });
  },

  // 回到「已通 + 1」：连打几局之后跳回进度线，不用一路点回去。
  onLevelResume: function () {
    if (this.data.started || this.data.countdown > 0) return;
    this.applyPick(this.picker.resume());
  },

  // 阶段新法的开关：逆诵 / 死门 / 收势这类是「改规矩」，练到手就该能关——
  // 想安心练基础记忆的人，不该被已经解锁的机制按着头走。
  // 开关只在准备页，进局后不提供：局内改规则才是真的打断节奏。
  onToggleTwist: function (event) {
    if (this.data.started || this.data.countdown > 0) return;
    const name = event.currentTarget.dataset.name;
    // 传的是「点完之后该是什么」：胶囊上写的是当前状态，点它就是翻面。
    const enabled = event.currentTarget.dataset.next === 'on';
    if (!name) return;
    const self = this;
    store.commitCritical(function (s) { return engine.setTwist(s, self.skillId, name, enabled); });
    // 只改这一条，不整页重算：开关就在原地，别让它跳走。
    const stageRules = this.data.stageRules.map(function (r) {
      if (r.name !== name) return r;
      return Object.assign({}, r, {
        enabled: enabled,
        stateText: enabled ? '已得' : '已关',
        tagCls: enabled ? 'tag--jade' : 'tag--grey',
      });
    });
    this.setData({ stageRules: stageRules });
    // 开关进的是 perks，得重建一次 controller 才带上；准备页还没开局，重建是安全的。
    this.buildGame();
    toast(enabled ? '「' + name + '」已开' : '「' + name + '」已关 · 此后本门不再生发');
  },

  onCellTap: function (event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    // 教学盘点的是教学控制器：真局 controller 这时已经被销毁，不能让它接这一下。
    if (this.data.tutorial) {
      if (this.teachController) this.teachController.tap(index);
      return;
    }
    if (!this.controller) return;
    // 划刀玩法由透明触摸层接管，静态格子的 tap 一律不判，避免划完抬手又补一次点击。
    if (this.data.vm && this.data.vm.extras.showSwipe) return;
    const before = this.fx.fxKey();
    this.controller.tap(index);
    // 玩法没给浮字（点空、翻已开的格子）就补一声轻响，让每次触碰都有回应。
    if (this.fx.fxKey() === before) sfx.play('tap');
    // 步法键连按同一个方向时，光看画面容易怀疑「这一下点上没有」，补一次极轻的触感。
    if (this.data.vm && this.data.vm.stage === 'scroll' && wx.vibrateShort) {
      try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
    }
  },

  onCellLongPress: function (event) {
    if (this.data.tutorial) {
      if (this.teachController) this.teachController.longpress(Number(event.currentTarget.dataset.index));
      return;
    }
    if (!this.controller) return;
    if (this.data.vm && this.data.vm.extras.showSwipe) return;
    const before = this.fx.fxKey();
    this.controller.longpress(Number(event.currentTarget.dataset.index));
    if (this.fx.fxKey() === before) sfx.play('tap');
  },

  // 华容道的块不在 cells 里：整块按百分比定位渲染，点一下就把这一块选中。
  // 只有 stage === 'klotski' 会用到，别的玩法照旧走格子。
  onBlockTap: function (event) {
    // 华容道的块不在 cells 里，点击走的是这条口子：教学态必须同样转发，
    // 否则「移星换斗诀」的教学盘上摆着块，玩家点上去毫无反应。
    if (this.data.tutorial) {
      if (!this.teachController || this.data.showResult) return;
      this.teachController.tap(Number(event.currentTarget.dataset.i || 0));
      return;
    }
    if (!this.controller || !this.data.started || this.data.showResult) return;
    const i = Number(event.currentTarget.dataset.i || 0);
    this.controller.tap(i);
    sfx.play('tap');
  },

  // ---------- 划刀输入 ----------
  // 小程序的 touchmove 目标固定在起手元素上，给每个格子单独绑 move 是收不到跨格轨迹的。
  // 所以盘面上盖一层透明触摸层：开局量一次所有格子的视口矩形，再把相邻两次 move 之间的
  // 线段按 10px 步长插值，补出手指快速掠过时的中间格——不然划快了会漏桩，白白判成劈空。
  // 插值命中只认格子中心内圈（utils/swipe.js）：斜向两桩只共一个顶点，沿两桩中心直划
  // 会擦到旁边那格的角，整格命中会把「擦角格」补进轨迹，斜斩就被误判成劈空。
  measureBoard: function () {
    if (typeof wx === 'undefined' || !wx.createSelectorQuery) return;
    const self = this;
    wx.createSelectorQuery().in(this).selectAll('.grid .cell').boundingClientRect(function (rects) {
      const list = rects || [];
      self.cellRects = [];
      for (let i = 0; i < list.length; i += 1) {
        const r = list[i];
        self.cellRects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      }
      // 格子不是正方形（3 列约 203×156rpx），斜向箭头按 45° 画会比两桩中心连线偏 8°。
      // 把实测宽高比回注给玩法层，箭头与掠过的白光都按真实连线校正。
      const first = self.cellRects[0];
      const w = first ? first.right - first.left : 0;
      const h = first ? first.bottom - first.top : 0;
      const ctl = self.controller || self.teachController;
      if (w > 0 && h > 0 && ctl && ctl.setAspect) ctl.setAspect(w / h);
    }).exec();
  },

  // 教学态也算「盘面就绪」：划刀这一门教学里要能真的划一刀，
  // 否则教学盘上显示着箭头，手指划过去却什么都没有——比没有教学更糟。
  boardReady: function () {
    if (this.data.tutorial) return !!(this.data.started && !this.data.showResult && this.teachController);
    return !!(this.data.started && !this.data.showResult && this.controller);
  },

  // 整格命中只给起手与抬手这两个静止点用：手指按在桩边上也能认出来。
  hitCell: function (x, y) {
    return swipeInput.boxIndexOf(this.cellRects || [], x, y);
  },

  // 只有真的进了新格才算「又走了一步」。手指停在靶心上轻微抖动时坐标一直在变，
  // 但格子没变，停留时间要照常累计，不然收势永远判不过。
  // quiet 给抬手补定用：那一桩其实早就进了，不能再把停留时间清零。
  pushCell: function (i, quiet) {
    if (i < 0 || !this.swipePath) return false;
    const path = this.swipePath;
    if (path.length && path[path.length - 1] === i) return false;
    path.push(i);
    if (!quiet) this.lastStepAt = Date.now();
    return true;
  },

  extendSwipe: function (x, y) {
    const hits = swipeInput.sampleLine(
      this.cellRects || [],
      { x: this.lastTouchX, y: this.lastTouchY },
      { x: x, y: y },
      10
    );
    for (let i = 0; i < hits.length; i += 1) this.pushCell(hits[i]);
    this.lastTouchX = x;
    this.lastTouchY = y;
  },

  touchPoint: function (event) {
    const list = (event.touches && event.touches.length) ? event.touches : event.changedTouches;
    const t = list && list[0];
    if (!t) return null;
    // boundingClientRect 是视口坐标，优先用同坐标系的 clientX/clientY。
    const x = typeof t.clientX === 'number' ? t.clientX : t.pageX;
    const y = typeof t.clientY === 'number' ? t.clientY : t.pageY;
    return (typeof x === 'number' && typeof y === 'number') ? { x: x, y: y } : null;
  },

  onBoardTouchStart: function (event) {
    if (!this.boardReady() || !this.data.vm || !this.data.vm.extras.showSwipe) return;
    const pt = this.touchPoint(event);
    if (!pt) return;
    if (!this.cellRects || !this.cellRects.length) this.measureBoard();
    this.swipePath = [];
    this.lastTouchX = pt.x;
    this.lastTouchY = pt.y;
    this.lastStepAt = Date.now();
    this.pushCell(this.hitCell(pt.x, pt.y));
  },

  onBoardTouchMove: function (event) {
    if (!this.boardReady() || !this.swipePath) return;
    const pt = this.touchPoint(event);
    if (!pt) return;
    this.extendSwipe(pt.x, pt.y);
  },

  onBoardTouchEnd: function (event) {
    if (!this.swipePath || !this.swipePath.length) { this.swipePath = null; return; }
    // 抬手是静止点，用整格命中补定最后一桩：手指停在靶心边缘也算收势。
    // 不刷新 lastStepAt，否则补这一下会把「停了一拍」清成 0，收势永远过不了。
    const pt = this.touchPoint(event);
    if (pt) this.pushCell(swipeInput.boxIndexOf(this.cellRects || [], pt.x, pt.y), true);
    const path = this.swipePath;
    this.swipePath = null;
    if (!this.boardReady()) return;
    const before = this.fx.fxKey();
    // 抬手时刻减去最后一次换格的时刻，就是在最后那一桩停住的时长。
    // 只在半途快速划过时它接近 0；到靶心压住不动再抬手就能过收势。
    const hold = Math.max(0, Date.now() - (this.lastStepAt || Date.now()));
    if (this.data.tutorial) {
      if (this.teachController) this.teachController.swipe(path, { hold: hold });
      return;
    }
    this.controller.swipe(path, { hold: hold });
    // 轻点一下（路径不足两桩）玩法不判也不罚，这里补一声轻响当作「这一刀没递出去」。
    if (this.fx.fxKey() === before) sfx.play('tap');
  },

  // 四向推盘：手指从盘上往哪个方向划，全盘就往哪个方向挤。
  // 判据只用「起点 → 终点」的位移，不跟轨迹——推盘是一步决策，不是画线。
  // 24px 以下当作没划（手指抖一下不该把整盘推走）；斜划取主轴，不判无效。
  onMoveTouchStart: function (event) {
    if (this.data.tutorial) {
      if (!this.teachController || this.data.showResult) return;
    } else if (!this.controller || !this.data.started || this.data.showResult || this.data.boardHeld) return;
    const pt = this.touchPoint(event);
    if (!pt) return;
    this.moveFrom = pt;
  },

  // 空实现只为吞掉 touchmove：不吞的话手指一划页面会跟着滚，盘面留不住。
  onMoveTouchMove: function () {},

  onMoveTouchEnd: function (event) {
    const from = this.moveFrom;
    this.moveFrom = null;
    // 教学态没有真 controller：推盘这一门（同源归一诀）的教学要能划得动。
    const ctl = this.data.tutorial ? this.teachController : this.controller;
    if (!from || !ctl || !ctl.move) return;
    const pt = this.touchPoint(event);
    if (!pt) return;
    const dx = pt.x - from.x;
    const dy = pt.y - from.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 24) return;
    const dir = ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    ctl.move(dir);
    sfx.play('tap');
  },

  // 方向键只给 vm.extras.showPad 的玩法（落石垒基）：统一走 controller.move(dir)。
  onPad: function (event) {
    const ctl = this.data.tutorial ? this.teachController : this.controller;
    if (!ctl || !this.data.started || this.data.showResult) return;
    const dir = event.currentTarget.dataset.dir;
    if (!dir) return;
    ctl.move(dir);
    sfx.play('tap');
  },

  // 暂存：点右侧的暂存格。玩法层只知道 move('hold')，不碰坐标也不碰视觉。
  onHold: function () {
    const ctl = this.data.tutorial ? this.teachController : this.controller;
    if (!ctl || !this.data.started || this.data.showResult) return;
    ctl.move('hold');
    sfx.play('tap');
  },

  onUndo: function () {
    if (!this.controller) return;
    this.controller.undo();
    sfx.play('tap');
  },
  onHint: function () {
    if (!this.controller) return;
    this.controller.hint();
    sfx.play('tick');
  },
  // 三秀的主动手段：挪苗。买的是一步操作，不是照畦那种信息。
  onActive: function () {
    if (!this.controller) return;
    this.controller.active();
    sfx.play('tap');
  },
  // 圆满段二选一劫变：两条候选固定，玩家点哪条由自己定。
  onPickTwist: function (e) {
    if (!this.controller || !e || !e.currentTarget) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.controller.pickTwist(id);
    sfx.play('tap');
  },
  onReset: function () {
    if (!this.controller) return;
    this.controller.reset();
    sfx.play('tap');
  },
  onPress: function () { if (this.controller) this.controller.press(); },
  onRelease: function () { if (this.controller) this.controller.release(); },
  onChargeTap: function () { if (this.controller) this.controller.tap(0); },
  onAbandon: function () {
    if (this.data.tutorial) return;
    if (!this.controller || this.data.showResult) return;
    const self = this;
    wx.showModal({
      title: '中途结束',
      content: this.abandonText(true),
      confirmText: '结束',
      confirmColor: '#b4453c',
      success: function (res) {
        if (res.confirm && self.controller) {
          // 先置位再结束：结算回来才知道这条 F 是玩家自己点的，而不是打崩的。
          self.aborting = true;
          self.disarmLeaveGuard();
          // 结账只走这一处：记钟在 closeAbandonedRound 里，
          // 和「左上角返回 / 切页离开」完全同一套（三条出口一种账）。
          // 中途结束不进 applyPractice，所以进度一分不推。
          self.closeAbandonedRound();
          self.controller.abandon();
        }
      },
    });
  },

  // 一局打完：账目文案、进境事件、按钮分工全在 settle-view.js 构造（含三个结算口的
  // ok:false 拦截——引擎拒绝结算时不读空结果的字段）。页面只做四件事：
  // 拿结果、给触感与音效、挂状态、起演出。
  onFinish: function (res) {
    if (!this.pageAlive) return;
    const grade = res.grade || 'C';
    const rv = settleView.buildResult(res, {
      mode: this.mode,
      aborting: this.aborting,
      skillId: this.skillId,
      level: this.data.level,
      stageBoardShort: this.data.stageBoardShort,
      levelChange: this.data.levelChange,
    });
    if (rv.rejected) {
      toast(rv.message || '这一局没能结算');
      this.onQuitToPrep();
      return;
    }
    if (wx.vibrateShort && (grade === 'S' || grade === 'A')) {
      try { wx.vibrateShort({ type: grade === 'S' ? 'heavy' : 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
    }
    if (grade === 'S' || grade === 'A') sfx.play('clear');
    else if (grade === 'F') sfx.play('fail');
    else sfx.play('settle');
    this.clearCountdown();
    // 这一局已经打完：结算卡上的返回不该再被问「本局作废」。
    this.disarmLeaveGuard();
    this.setData({
      showResult: true, result: rv,
      recordBrief: settleView.briefOf(rv, grade),
      started: false, boardHeld: false,
    });
    this.syncBar();
    this.refresh();
    if (this.data.sceneOn) this.startSettle(rv, grade);
  },

  // 结算金按钮：再来一局（冲关结算仍回洞府——那一盘没有「下一局」可续）。
  onPrimary: function () {
    const rv = this.data.result;
    if (!rv) return;
    // 突破结算的金按钮写「回洞府」=主页。此前走 onBack()：冲关页从人物页
    // navigateTo 进来，栈深>1 时 navigateBack 回的是人物页，与按钮文案不符。
    if (rv.kind === 'breakthrough' || this.mode === 'breakthrough') {
      this.disarmLeaveGuard();
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    this.onAgain();
  },

  // 留在本页 = 留在刚打完的这一屏：盘面、终局分数、香炷刻度都原样停在眼前，
  // 退的是结算卡，不是退到准备页。这一局已经结束，所以把控制器摘掉——
  // 盘面只剩看的份，底部换成「上局战绩 / 返回功法 / 再来一局」。
  onStay: function () {
    if (!this.pageAlive) return;
    this.clearSettleTimers();
    this.disarmLeaveGuard();
    if (this.controller) { this.controller.destroy(); this.controller = null; }
    this.setData({ showResult: false, started: true, boardHeld: true, settlePhase: 4 });
    this.refresh();
    this.syncBar();
  },

  // 再来一局：跳过准备页直接起下一局（金按钮的主路）。
  // 也负责把「留住的盘面」换掉——先清 boardHeld，否则新局会被当成已终局。
  onAgain: function () {
    if (!this.pageAlive) return;
    this.clearSettleTimers();
    this.disarmLeaveGuard();
    this.roundClosed = false;
    this.setData({ showResult: false, result: null, recordBrief: '', started: false, boardHeld: false });
    // 先重算再建局：上一局可能刚走通本档第 40 关、开了下一档，连刷也该打新档。
    this.refresh();
    this.buildGame();
    this.onStart();
  },

  // 留住的盘面上那行「上局战绩」：把结算明细叫回来重看，不必再打一局。
  onOpenRecord: function () {
    if (!this.data.result) return;
    this.clearSettleTimers();
    this.setData({ showResult: true, settlePhase: 4 });
    this.syncBar();
  },

  // 结算卡次按钮与终局底栏共用的「返回功法」：回的是**这一门的静室准备屏**
  // （品阶、段位、本门最佳、入门规则、本局规则都在那一屏），不是退出页面落到功法列表。
  // 玩家是从这门点进来的，退出去等于多退了一层。普通结算、中途结束、留在本页之后，
  // 三个入口都走同一条路——旧版只特判了结束，打完一局点「返回」照样掉到列表。
  // 冲关局没有「这一门」可回，仍去功法页。
  onBackToSkill: function () {
    if (this.mode === 'breakthrough') {
      this.clearSettleTimers();
      this.disarmLeaveGuard();
      wx.switchTab({ url: '/pages/skills/skills' });
      return;
    }
    this.onQuitToPrep();
  },

  // 次按钮：练习局的普通结算与中途结束都回本门静室；冲关局去功法页。
  onSecondary: function () {
    this.onBackToSkill();
  },

  // 收起这一局，回到本页的准备屏。不 navigateBack：静室就是这一门功法的详情，
  // 玩家想离开页面有左上角原生返回与准备屏底部的「退出」，出口不必叠在结算卡上。
  onQuitToPrep: function () {
    if (!this.pageAlive) return;
    this.clearSettleTimers();
    this.clearCountdown();
    this.disarmLeaveGuard();
    if (this.controller) { this.controller.destroy(); this.controller = null; }
    // 结束时置的两个标记要一起清：aborting 留着会让下一局的结算仍按「中途结束」处置，
    // roundClosed 留着会让下一局离开时不结账。
    this.aborting = false;
    this.roundClosed = false;
    this.setData({ showResult: false, result: null, recordBrief: '', started: false, boardHeld: false });
    this.refresh();
    // **摘了控制器就必须重造一副。** 准备屏底栏那颗「开始参悟」走 onStart，
    // 而 onStart 的第一步是 `if (!this.controller) return`——旧版只摘不造，
    // 打完一局点返回、回到准备屏再点开始，按钮就彻底没反应了；
    // 从列表重新进来能打，是因为 onLoad 里 refresh + buildGame 造过一副。
    // 这条路径与 onAgain 一致：先 refresh 再 buildGame，然后用同一副盘起手。
    this.buildGame();
    this.syncBar();
  },

  // 分享落回同一门静室：带上 skillId，点开就是这一门（未习得会提示并退回功法页）。
  // 冲关局没有功法、也没有「练哪一门」可讲，退回主页那张通用卡。
  onShareAppMessage: function () {
    if (this.mode !== 'practice' || !this.skillId) return share.appMessage(store.get());
    return share.page(this.shareText(), '/pages/practice/practice?skillId=' + this.skillId);
  },

  onShareTimeline: function () {
    if (this.mode !== 'practice' || !this.skillId) return share.timeline(store.get());
    return share.pageTimeline(this.shareText(), 'skillId=' + this.skillId);
  },

  // 标题骨架在 copy.SHARE.practice，功法正名与本页填，身份（境界/战力）用引擎现算。
  // 不在视图层另存 realm/power：那会在分享文案与真实进度之间留一个漂移源。
  shareText: function () {
    const ov = engine.getOverview(store.get());
    return copy.SHARE.practice
      .replace('{skill}', this.data.title)
      .replace('{realm}', ov.realmName)
      .replace('{power}', ov.power);
  },

  // 结算卡上生成道牒：与人物页共用 utils/card.js 的同一张图。
  // 此刻 store 里的进度已经结算完，dataOf 现算出来的就是刚打完这一局后的身份。
  onMakeCard: function () {
    const data = card.dataOf(store.get(), engine);
    if (!data) { wx.showToast({ title: '当前环境不支持生成图片', icon: 'none' }); return; }
    card.makeCard('shareCanvas', data, function () {
      wx.showToast({ title: '生成图片失败，可长按道牒图截图', icon: 'none' });
    });
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onBack: function () {
    // 自己调 navigateBack 不是「用户按返回」，但有些机型会把询问一起带出来；
    // 撤掉再走，免得结算卡上点「返回功法」又挨一次弹窗。
    this.disarmLeaveGuard();
    const pages = getCurrentPages();
    if (pages.length > 1) { wx.navigateBack(); return; }
    wx.switchTab({ url: '/pages/index/index' });
  },
});
