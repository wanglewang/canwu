'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const minigames = require('../../minigames/index.js');
const themes = require('../../minigames/theme.js');
const skillData = require('../../data/skills.js');
const practiceData = require('../../data/practice.js');
const worldData = require('../../data/world.js');
const guides = require('../../data/guides.js');
const visual = require('../../data/visual.js');
const sfx = require('../../utils/sfx.js');
const swipeInput = require('../../utils/swipe.js');
const copy = require('../../data/copy.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

function heartsToFlags(h) {
  const out = [];
  if (!h) return out;
  for (let i = 0; i < h.max; i += 1) out.push({ id: i, on: i < h.value });
  return out;
}

Page({
  data: {
    mode: 'practice',
    showDifficulty: true,
    title: '',
    subtitle: '',
    gameName: '',
    tip: '',
    tierName: '',
    tierColor: '#3d8c74',
    prof: 0,
    percent: 0,
    nextText: '',
    nextBenefit: '',
    diffBrief: '',
    goalText: '',
    difficulty: 'easy',
    diffList: [],
    diffName: '简单',
    diffMultText: '×1.00',
    rankLabel: '黄阶',
    rankChar: '黄',
    rankColor: '#8a8f83',
    rankStars: '★☆☆☆',
    rankRewardText: '熟练度 ×1.00',
    decayTip: '',
    chainItems: [],
    chainLabel: '',
    bestText: '',
    // 三连 S 直接晋级：准备页常驻「还差几局」，不占按钮也不打断计时。
    streakText: '',
    // 收益口径一行：只奖不罚，开局前就写清本局会不会吃到换门加成。
    repeatNote: '',
    streakDots: [],
    theme: themes.themeOf('forge', 'click'),
    twistName: '常规功课',
    twistTag: '本门机制',
    twistDesc: '',
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
    showResult: false,
    result: null,
    barMode: '',
    guide: null,
    // 说明默认收起：准备页先看功法与熟练度，要看规则再点「展开」。
    guideOpen: false,
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
    settlePhase: 0,
    settleFull: false,
    settleGain: '+0',
    settlePercent: 0,
  },

  onLoad: function (query) {
    this.pageAlive = true;
    this.controller = null;
    this.countdownTimers = [];
    this.needsRebuild = false;
    this.lastFxKey = 0;
    this.settleTimers = [];
    this.burstId = 0;
    this.lastCombo = 0;
    this.cellRects = [];
    this.swipePath = null;
    // 最后一次「进入新格」的时间：抬手时用它算在靶心停住多久，供收势判定。
    this.lastStepAt = 0;
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    this.theme = themes.themeOf('forge', 'click');
    this.twist = '';
    this.mode = query && query.mode === 'breakthrough' ? 'breakthrough' : 'practice';
    this.skillId = (query && query.skillId) || '';
    sfx.warm();

    if (this.mode === 'breakthrough') {
      const info = engine.breakthroughInfo(store.get());
      if (!info.available) {
        toast(info.maxed ? '已是当前最高境界' : '战力还不够，先去参悟');
        setTimeout(function () { wx.navigateBack(); }, 900);
        return;
      }
    }
    const s = skillData.getSkill(this.skillId);
    if (this.mode === 'practice' && (!s || !store.get().skills[this.skillId] || !store.get().skills[this.skillId].unlocked)) {
      toast('尚未习得这门功法');
      setTimeout(function () { wx.navigateBack(); }, 900);
      return;
    }
    this.setData({ mode: this.mode, showDifficulty: this.mode === 'practice' });
    this.refresh();
    this.buildGame();
  },

  onShow: function () {
    if (!this.pageAlive || !this.mode) return;
    this.refresh();
    if (this.needsRebuild && !this.data.showResult) {
      this.needsRebuild = false;
      this.buildGame();
    }
  },

  onHide: function () {
    this.clearCountdown();
    this.clearSettleTimers();
    if (this.controller) this.controller.destroy();
    sfx.stopAll();
    if (!this.data.showResult) {
      this.needsRebuild = true;
      this.setData({ started: false });
    } else if (this.data.sceneOn) {
      // 切出去再回来不该卡在演出中段，直接把按钮放出来。
      this.setData({ settlePhase: 4 });
    }
  },

  onUnload: function () {
    this.pageAlive = false;
    this.clearCountdown();
    this.clearSettleTimers();
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
      this.setData({
        title: '冲关 · ' + info.nextName,
        subtitle: '战力 ' + info.power + ' 已过 ' + info.need + ' 的门槛。',
        gameName: '蓄力停区',
        tip: '松手停在朱线正中，评级最高',
        tierName: info.currentName,
        tierColor: '#b8893b',
        prof: info.power,
        percent: 100,
        nextText: '目标 ' + info.nextName,
        nextBenefit: '',
        diffBrief: '',
        diffList: [],
        diffName: '',
        diffMultText: '',
        rankLabel: '',
        rankChar: '',
        rankStars: '',
        rankRewardText: '',
        decayTip: '',
        chainItems: [],
        chainLabel: '',
        bestText: '',
        streakText: '',
        streakDots: [],
        theme: this.theme,
        twistName: '长按蓄力',
        twistTag: '',
        twistDesc: '按住蓄力，松手停在朱线区间。越贴近正中，评级越高。',
        stageRules: [],
      });
      return;
    }
    const skill = skillData.getSkill(this.skillId);
    const method = practiceData.getMethod(skill.method);
    const rec = state.skills[this.skillId];
    const info = engine.tierInfo(rec.prof);
    const theme = themes.themeOf(method.id, method.game);
    const twist = themes.twistOf(method.twist);
    const tier = practiceData.tierOf(skill.tier);

    // 难度档只认本门熟练度：已选的档若还没解锁，就回落到当前能选最高档。
    const maxDiff = practiceData.bestDifficulty(rec.prof);
    const keep = practiceData.diffKeyIndex(this.data.difficulty) <= practiceData.diffIndexOf(rec.prof);
    const diffKey = keep ? this.data.difficulty : maxDiff;
    const diff = practiceData.diffDetail(method, diffKey);
    const diffList = practiceData.difficultyList(rec.prof, diffKey);

    const chain = skillData.chainOfType(skill.type);
    const chainItems = chain.items.map(function (it) {
      return {
        id: it.id, name: it.name,
        tierColor: practiceData.tierOf(it.tier).color,
        current: it.id === skill.id,
      };
    });
    const best = state.records ? state.records[skill.id] : null;
    const bestText = best ? '本门最佳 ' + best.score + ' 分 · ' + best.grade + ' 档' : '';

    // 连 S 每门各算各的：非 S 断连，中途收功不计数。满 3 局直接补到下一阶段门槛。
    const streakGoal = engine.S_STREAK_GOAL || 3;
    const streakNow = Math.min(streakGoal - 1, Math.floor(Number(state.sStreak && state.sStreak[skill.id]) || 0));
    const streakDots = [];
    for (let i = 0; i < streakGoal; i += 1) streakDots.push({ id: i, on: i < streakNow });
    const streakText = streakNow > 0
      ? '已连 ' + streakNow + ' 局 S · 再 ' + (streakGoal - streakNow) + ' 局直接晋一段'
      : '连续 ' + streakGoal + ' 局 S 直接晋一段 · 非 S 断连';
    // 这一局是不是「换门」由存档里的上一门决定，和结算用的是同一条判定。
    const crossNow = !!state.lastPractice.skillId && state.lastPractice.skillId !== skill.id;
    const repeatNote = copy.practiceNote(crossNow, worldData.CROSS_BONUS);

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
    const stageRules = practiceData.stageRulesOf(method.id).map(function (r) {
      const on = rec.prof >= worldData.TIERS[r.at].threshold;
      // 只有 hard 类（改规矩的）才给开关；照影、稳基那种纯加成关了没好处，
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
    // 下一段给什么：现在只写「还差 114」，玩家不知道练到那一步能得到什么。
    // 收益就在 world.TIERS[].desc 里（解锁难度 / 属性 / 阶段新法），原样搬一句，不另编。
    const nextTier = info.maxed ? null : worldData.TIERS[info.index + 1];
    // S 线只写在准备页：局内只报「还差几分」，这里给出本档总分门槛与评级口径。
    // 数字与玩法层同源（practiceData.MATCH_S），换难度档会跟着变。
    const sLine = practiceData.sLineOf(method, diffKey);

    this.theme = theme;
    this.twist = method.twist;
    this.setData({
      title: skill.name,
      subtitle: skill.desc,
      gameName: minigames.gameName(method.game),
      tip: method.tip,
      tierName: info.name,
      tierColor: info.color,
      prof: rec.prof,
      percent: info.percent,
      nextText: info.maxed ? '已至大圆满' : '距 ' + info.nextName + ' 还差 ' + (info.nextThreshold - rec.prof),
      nextBenefit: nextTier ? '到「' + nextTier.name + '」：' + nextTier.desc : '',
      difficulty: diffKey,
      diffList: diffList,
      diffName: diff.name,
      diffMultText: diff.multText,
      // 高难度除了倍率还收紧了什么：diffDetail 已经算好了（亮起时长、口诀轮数…），
      // 以前只在数据里躺着没渲染，玩家只能看到「×1.70」。
      diffBrief: diff.brief,
      goalText: sLine ? '本档 S 线 ' + sLine + ' 分 · 评级只看总分，无效互换只少息、不扣分' : '',
      rankLabel: tier.label,
      rankChar: tier.name,
      rankStars: engine.starsOf(tier.stars),
      rankColor: tier.color,
      rankRewardText: '熟练度 ×' + tier.reward.toFixed(2),
      decayTip: decayTip,
      chainItems: chainItems,
      chainLabel: skill.type + ' 一脉',
      bestText: bestText,
      streakText: streakText,
      repeatNote: repeatNote,
      streakDots: streakDots,
      theme: theme,
      twistName: twist.name,
      twistTag: '本门机制',
      twistDesc: twist.desc,
      stageRules: stageRules,
    });
  },

  buildGame: function () {
    if (this.controller) this.controller.destroy();
    const state = store.get();
    let gameId = 'charge';
    let params = {};
    let methodName = '突破瓶颈';
    let tip = '长按蓄力，松手停在朱线区间';
    let tier = 0;

    if (this.mode === 'practice') {
      const skill = skillData.getSkill(this.skillId);
      const method = practiceData.getMethod(skill.method);
      gameId = method.game;
      params = practiceData.buildParams(method, this.data.difficulty);
      methodName = method.name;
      tip = method.tip;
      tier = engine.tierIndex(state.skills[this.skillId].prof);
    }
    const perks = this.mode === 'breakthrough'
      ? { easy: state.realmIndex >= 2, tier: state.realmIndex }
      // 关掉的阶段新法跟着这一局走：玩家在准备页关掉逆诵，进局就该真的不逆诵。
      : { easy: tier >= 3, tier: tier, offTwists: engine.twistsOff(state, this.skillId) };

    // 反馈调性按玩法分档（刀法凌厉 / 心法沉静 / 灵植温润），render 里读它决定震动强度。
    this.gameId = gameId;
    const self = this;
    this.controller = minigames.createGame(gameId, {
      params: params,
      // 玩法模块只认 normal / hard 两档手感；真正的五档差异全部落在 params 上。
      difficulty: practiceData.difficultyOf(this.data.difficulty).gear,
      diffKey: this.data.difficulty,
      perks: perks,
      tip: tip,
      methodName: methodName,
      theme: this.theme,
      twist: this.twist,
      render: function (vm) {
        if (!self.pageAlive) return;
        const progress = typeof vm.progress === 'number' ? vm.progress : 0;
        const incense = Math.max(0, Math.min(100, 100 - progress));
        const lampMax = vm.hearts && vm.hearts.max ? vm.hearts.max : 3;
        const lampOn = vm.hearts ? vm.hearts.value : Math.ceil(incense / 34);
        const sceneLamps = [];
        for (let i = 0; i < lampMax; i += 1) sceneLamps.push({ id: i, on: i < lampOn });

        let burstList = self.data.burstList;
        // 浮字是玩法里唯一的「判定结果」信号：音效与视觉反馈都跟着它走。
        if (vm.fx && vm.fx.key !== self.lastFxKey) {
          self.lastFxKey = vm.fx.key;
          sfx.tone(vm.fx.tone);
          // 触感分两档：金招（重斩 / 连锁）中量；误判只给轻震——三秀同收的无效互换、
          // 阵灯推演触了死门或提示用尽都算。灵植与阵法要温润沉敛，别跟着刀法猛震。
          if (typeof wx !== 'undefined' && wx.vibrateShort) {
            const strong = vm.fx.tone === 'gold';
            const gentle = vm.fx.tone === 'bad' && (self.gameId === 'match' || self.gameId === 'lights');
            if (strong || gentle) {
              try { wx.vibrateShort({ type: strong ? 'medium' : 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
            }
          }
          if (self.data.sceneOn) {
            const tone = vm.fx.tone;
            if (tone === 'bad') burstList = [self.makeBurst(0)];
            else if (tone === 'gold') burstList = [self.makeBurst(3)];
            else burstList = [self.makeBurst(1)];
          }
        }
        const combo = parseInt(String(vm.comboText || '').replace(/\D/g, ''), 10) || 0;
        if (self.data.sceneOn && combo !== self.lastCombo && [5, 10, 20].indexOf(combo) >= 0) {
          burstList = [self.makeBurst(2)];
        }
        self.lastCombo = combo;

        self.setData({
          vm: vm,
          chargeWidth: vm.charge ? Math.max(0, vm.charge.end - vm.charge.start) : 0,
          gradeNowColor: worldData.GRADE_COLOR[vm.gradeNow] || '#8a8f83',
          heartList: heartsToFlags(vm.hearts),
          meterPercent: vm.meter && vm.meter.max ? Math.round(vm.meter.value / vm.meter.max * 100) : 0,
          slashList: vm.slash ? [vm.slash] : [],
          trailLen: vm.trail ? vm.trail.path.length : 0,
          sceneLamps: sceneLamps,
          incensePercent: incense,
          scoreNum: Number(String(vm.scoreText || '').replace(/\D/g, '')) || 0,
          burstList: burstList,
        });
        self.syncBar();
      },
      finish: function (res) { self.onFinish(res); },
    });
    const stage = visual.stageOf(this.theme.key);
    this.lastFxKey = 0;
    this.lastCombo = 0;
    this.setData({
      started: false,
      showResult: false,
      result: null,
      guide: guides.guideOf(gameId),
      hintLabel: practiceData.hintLabelOf(gameId),
      sceneOn: stage.on,
      stage: stage,
      burstList: [],
      settlePhase: 0,
    });
    this.syncBar();
  },

  // 命中爆发：一次判定生成一批粒子，id 自增让 WXML 重建节点，CSS 动画才会重播。
  makeBurst: function (level) {
    const dots = [];
    if (level > 0) {
      const n = level >= 3 ? visual.MOTION.particles : level === 2 ? 6 : 4;
      const dist = level >= 3 ? 190 : level === 2 ? 150 : 110;
      for (let i = 0; i < n; i += 1) {
        dots.push({
          id: i,
          a: Math.round(360 * i / n),
          d: dist + (i % 3) * 24,
          delay: (i % 4) * 18,
        });
      }
    }
    this.burstId = (this.burstId || 0) + 1;
    return {
      id: this.burstId,
      level: level,
      dots: dots,
      flash: level === 0 ? 'miss' : level >= 3 ? 'gold' : '',
    };
  },

  clearSettleTimers: function () {
    const list = this.settleTimers || [];
    for (let i = 0; i < list.length; i += 1) clearTimeout(list[i]);
    this.settleTimers = [];
  },

  // 结算五段演出：S/A 满 1.8 秒，B/C/F 压到 900ms；全程不用逐帧 setData。
  startSettle: function (rv, grade) {
    this.clearSettleTimers();
    const timeline = visual.settleTimeline(grade);
    let gain = '+0';
    for (let i = 0; i < rv.lines.length; i += 1) {
      if (rv.lines[i].k === '熟练度') gain = rv.lines[i].v;
    }
    const self = this;
    this.setData({
      settlePhase: 0,
      settleFull: visual.SETTLE.fullGrades.indexOf(grade) >= 0,
      settleGain: gain,
      settlePercent: this.data.percent,
    });
    for (let i = 1; i < timeline.length; i += 1) {
      const id = setTimeout(function () {
        if (self.pageAlive && self.data.showResult) self.setData({ settlePhase: i });
      }, timeline[i]);
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
    else if (this.data.started) mode = vm && (vm.extras.showUndo || vm.extras.showHint) ? 'tools' : '';
    else mode = 'start';
    if (mode !== this.data.barMode) this.setData({ barMode: mode });
  },

  clearCountdown: function () {
    for (let i = 0; i < this.countdownTimers.length; i += 1) clearTimeout(this.countdownTimers[i]);
    this.countdownTimers = [];
    if (this.data.countdown !== 0) this.setData({ countdown: 0 });
  },

  onStart: function () {
    if (!this.controller || this.data.started || this.data.countdown > 0) return;
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
    this.syncBar();
    const self = this;
    setTimeout(function () { if (self.pageAlive) self.measureBoard(); }, 60);
  },

  onResize: function () { this.measureBoard(); },

  onToggleGuide: function () {
    this.setData({ guideOpen: !this.data.guideOpen });
    sfx.play('tap');
  },

  onDifficulty: function (event) {
    if (this.data.started || this.data.countdown > 0) return;
    const key = event.currentTarget.dataset.d;
    if (!key || key === this.data.difficulty) return;
    const d = practiceData.difficultyOf(key);
    const prof = store.get().skills[this.skillId] ? store.get().skills[this.skillId].prof : 0;
    if (practiceData.diffKeyIndex(key) > practiceData.diffIndexOf(prof)) {
      toast('熟练度到 ' + d.need + ' 才解锁「' + d.name + '」');
      return;
    }
    this.setData({ difficulty: key });
    this.refresh();
    this.buildGame();
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
    toast(enabled ? '「' + name + '」已开' : '「' + name + '」已关 · 以后这一门不再触发');
  },

  onCellTap: function (event) {
    if (!this.controller) return;
    // 划刀玩法由透明触摸层接管，静态格子的 tap 一律不判，避免划完抬手又补一次点击。
    if (this.data.vm && this.data.vm.extras.showSwipe) return;
    const before = this.lastFxKey;
    this.controller.tap(Number(event.currentTarget.dataset.index || 0));
    // 玩法没给浮字（点空、翻已开的格子）就补一声轻响，让每次触碰都有回应。
    if (this.lastFxKey === before) sfx.play('tap');
    // 步法键连按同一个方向时，光看画面容易怀疑「这一下点上没有」，补一次极轻的触感。
    if (this.data.vm && this.data.vm.stage === 'scroll' && wx.vibrateShort) {
      try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
    }
  },

  onCellLongPress: function (event) {
    if (!this.controller) return;
    if (this.data.vm && this.data.vm.extras.showSwipe) return;
    const before = this.lastFxKey;
    this.controller.longpress(Number(event.currentTarget.dataset.index));
    if (this.lastFxKey === before) sfx.play('tap');
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
      if (w > 0 && h > 0 && self.controller) self.controller.setAspect(w / h);
    }).exec();
  },

  boardReady: function () {
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
    const before = this.lastFxKey;
    // 抬手时刻减去最后一次换格的时刻，就是在最后那一桩停住的时长。
    // 只在半途快速划过时它接近 0；到靶心压住不动再抬手就能过收势。
    const hold = Math.max(0, Date.now() - (this.lastStepAt || Date.now()));
    this.controller.swipe(path, { hold: hold });
    // 轻点一下（路径不足两桩）玩法不判也不罚，这里补一声轻响当作「这一刀没递出去」。
    if (this.lastFxKey === before) sfx.play('tap');
  },

  // 方向键只给 vm.extras.showPad 的玩法（落石垒基）：统一走 controller.move(dir)。
  onPad: function (event) {
    if (!this.controller || !this.data.started || this.data.showResult) return;
    const dir = event.currentTarget.dataset.dir;
    if (!dir) return;
    this.controller.move(dir);
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
  onPress: function () { if (this.controller) this.controller.press(); },
  onRelease: function () { if (this.controller) this.controller.release(); },
  onChargeTap: function () { if (this.controller) this.controller.tap(0); },
  onAbandon: function () {
    if (!this.controller || this.data.showResult) return;
    const self = this;
    wx.showModal({
      title: '中途收功',
      content: '这一局按「走火」结算，几乎拿不到收益，连 S 进度也会断。确定收功？',
      confirmText: '收功',
      confirmColor: '#b4453c',
      success: function (res) {
        if (res.confirm && self.controller) self.controller.abandon();
      },
    });
  },

  onFinish: function (res) {
    if (!this.pageAlive) return;
    const skillId = this.skillId;
    const diffKey = this.data.difficulty;
    const grade = res.grade || 'C';
    const color = worldData.GRADE_COLOR[grade] || '#8a8f83';
    const gradeTitle = copy.GRADE_TITLE[grade] || '';
    let rv;

    if (grade === 'F') {
      if (this.mode === 'breakthrough') {
        store.commitCritical(function (s) { return engine.applyBreakthrough(s, 'F'); });
      }
      rv = {
        kind: 'abandon',
        grade: '收',
        gradeColor: '#8a8f83',
        gradeTitle: copy.GRADE_TITLE.F,
        headline: this.mode === 'breakthrough' ? '气机一乱' : '中途收功',
        subline: this.mode === 'breakthrough' ? '气机散了，未伤根基，再来一次就好。' : '这回不算数，随时可以重新起手。',
        summary: res.summary,
        lines: [],
        notes: [],
        titles: [],
        primary: '再试一次',
        secondary: '返回',
      };
    } else if (this.mode === 'breakthrough') {
      const r = store.commitCritical(function (s) { return engine.applyBreakthrough(s, grade); });
      rv = {
        kind: 'breakthrough',
        grade: grade,
        gradeColor: color,
        gradeTitle: gradeTitle,
        headline: '突破 · ' + r.realmName,
        subline: '境界加成提高，战力上限打开。',
        summary: res.summary,
        lines: [
          { k: '灵气', v: '+' + r.qi },
          { k: '灵石', v: '+' + r.stone },
          { k: '境界', v: r.realmName },
          // 突破最实在的收益就是这一跳，摆在最后一行收尾。
          { k: '战力', v: r.powerBefore + ' → ' + r.powerAfter + '（+' + (r.powerAfter - r.powerBefore) + '）' },
        ],
        notes: ['此后挂机与对战都会按新境界计算。'],
        titles: (r.newTitles || []).map(function (t) { return t.name; }),
        primary: '回洞府',
        secondary: '去功法页',
      };
    } else {
      const r = store.commitCritical(function (s) {
        return engine.applyPractice(s, skillId, grade, { difficulty: diffKey, score: res.score || 0 });
      });
      const multText = r.tierLabel + ' ×' + r.tierReward.toFixed(2)
        + ' · ' + r.diffName + ' ×' + r.diffMult.toFixed(2)
        + ' · ' + grade + ' ×' + r.gradeFactor.toFixed(2)
        + (r.decayed ? ' · 衰减 ×0.3' : '');
      const lines = [
        // 三连晋级那一笔也算熟练度入账，演出数字得跟实际增长对得上。
        { k: '熟练度', v: '+' + r.totalGain },
        { k: '灵气', v: '+' + r.qi },
        { k: '局内得分', v: String(res.score || 0) },
      ];
      if (r.promotionGain > 0) lines.splice(1, 0, { k: '其中直接晋级', v: '+' + r.promotionGain });
      if (r.stone > 0) lines.push({ k: '灵石', v: '+' + r.stone });
      lines.push({ k: '倍率构成', v: multText });
      lines.push({ k: '挂机加速', v: '×' + r.buffMultiplier.toFixed(1) + ' · 30 分钟' });
      lines.push({ k: '当前熟练度', v: String(r.profAfter) });
      // 战力是阶梯值：只跟段位系数与境界加成走，段位不跳它就一分不动。
      // 所以不能只报「这局涨了多少战力」（大多数局都是 0，等于每局告诉玩家白练），
      // 要连「离下一境还差多少」一起报——玩家心里的目标一直是境界，不是熟练度。
      const dp = r.powerAfter - r.powerBefore;
      lines.push({ k: '战力', v: dp > 0 ? r.powerAfter + '（+' + dp + '）' : r.powerAfter + ' · 跨段才涨' });
      const btAfter = engine.breakthroughInfo(store.get());
      if (!btAfter.maxed) {
        lines.push({ k: '距离「' + btAfter.nextName + '」', v: '还差 ' + Math.max(0, btAfter.need - r.powerAfter) + ' 战力' });
      }
      const notes = [];
      if (r.promotion && !r.promotion.maxed) {
        notes.push(r.promotion.added > 0
          ? '三连 S 圆满：熟练度直接补到「' + r.promotion.toName + '」门槛（+' + r.promotion.added + '），下一轮重新数。'
          : '三连 S 圆满：这一局的收益已自行跨过「' + r.promotion.toName + '」门槛，无需再补；计数清零重数。');
      } else if (r.promotion && r.promotion.maxed) {
        notes.push('三连 S 圆满，但本门已至大圆满，不再补熟练度。');
      } else if (grade === 'S') {
        notes.push('连 S 进度 ' + r.sStreak + ' / ' + r.sStreakGoal + '：再连续 ' + (r.sStreakGoal - r.sStreak) + ' 局 S 可直接晋一段；非 S 会断连。');
      } else {
        notes.push('连 S 进度 ' + r.sStreak + ' / ' + r.sStreakGoal + '（这一档断了连，下一局重新数）。');
      }
      if (r.tierUp) notes.push('【' + r.skillName + '】升段至「' + r.tierName + '」，属性加成提高。');
      if (r.cross) notes.push('触类旁通：换了门功法，熟练度 ×' + r.crossBonus.toFixed(2) + '。');
      if (r.diffFellBack) notes.push('所选难度尚未解锁，已按「' + r.diffMaxName + '」结算。');
      if (r.decayed) notes.push('境界不符（' + r.realmReason + '）：熟练度收益只剩 30%。');
      if (r.capped) notes.push('总倍率已封顶 ×' + r.coreMult.toFixed(2) + '，再叠也不再加成。');
      if (r.newRecord) {
        notes.push(r.prevBest > 0
          ? '破了本门纪录：' + (res.score || 0) + ' 分，此前最佳 ' + r.prevBest + ' 分。'
          : '立下本门首个纪录：' + (res.score || 0) + ' 分。');
      } else if (r.bestScore > 0) notes.push('本门最佳 ' + r.bestScore + ' 分，这回 ' + (res.score || 0) + ' 分。');
      if (r.fortune) notes.push(r.fortune.text);
      if (r.dailyReady) notes.push('今日参悟已满，回洞府可领份例。');
      rv = {
        kind: 'practice',
        grade: grade,
        gradeColor: color,
        gradeTitle: gradeTitle,
        headline: r.promotion && !r.promotion.maxed
          ? '三连圆满 · 晋 ' + r.promotion.toName
          : r.tierUp ? '升段 · ' + r.tierName : '参悟完成',
        subline: r.methodName + ' · ' + res.summary,
        summary: res.summary,
        lines: lines,
        notes: notes,
        titles: (r.newTitles || []).map(function (t) { return t.name; }),
        primary: '再来一次',
        secondary: '返回功法',
      };
    }

    if (wx.vibrateShort && (grade === 'S' || grade === 'A')) {
      try { wx.vibrateShort({ type: grade === 'S' ? 'heavy' : 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
    }
    if (grade === 'S' || grade === 'A') sfx.play('clear');
    else if (grade === 'F') sfx.play('fail');
    else sfx.play('settle');
    this.clearCountdown();
    this.setData({ showResult: true, result: rv, started: false });
    this.syncBar();
    this.refresh();
    if (this.data.sceneOn) this.startSettle(rv, grade);
  },

  onPrimary: function () {
    this.clearSettleTimers();
    const kind = this.data.result ? this.data.result.kind : '';
    if (kind === 'breakthrough') { this.onBack(); return; }
    this.setData({ showResult: false, result: null });
    this.buildGame();
    this.onStart();
    this.refresh();
  },

  onSecondary: function () {
    this.clearSettleTimers();
    if (this.data.result && this.data.result.kind === 'breakthrough') {
      wx.switchTab({ url: '/pages/skills/skills' });
      return;
    }
    this.onBack();
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onBack: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },
});
