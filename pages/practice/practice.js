'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const minigames = require('../../minigames/index.js');
const themes = require('../../minigames/theme.js');
const skillData = require('../../data/skills.js');
const practiceData = require('../../data/practice.js');
const worldData = require('../../data/world.js');
const guides = require('../../data/guides.js');
const sfx = require('../../utils/sfx.js');

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
    modeLabel: '参 悟',
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
    theme: themes.themeOf('forge', 'click'),
    twistName: '常规功课',
    twistDesc: '',
    stageRules: [],
    hintLabel: '提示',
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
    guideOpen: true,
  },

  onLoad: function (query) {
    this.pageAlive = true;
    this.controller = null;
    this.countdownTimers = [];
    this.needsRebuild = false;
    this.lastFxKey = 0;
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
    this.setData({ mode: this.mode, modeLabel: this.mode === 'breakthrough' ? '突 破 瓶 颈' : '参 悟', showDifficulty: this.mode === 'practice' });
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
    if (this.controller) this.controller.destroy();
    sfx.stopAll();
    if (!this.data.showResult) {
      this.needsRebuild = true;
      this.setData({ started: false });
    }
  },

  onUnload: function () {
    this.pageAlive = false;
    this.clearCountdown();
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
        theme: this.theme,
        twistName: '长按蓄力',
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

    const realms = worldData.getWorld(state.worldId).realms;
    const realmNow = state.realmIndex + 1;
    const maxRealmName = realms[Math.min(realms.length - 1, tier.maxRealm - 1)].name;
    const needRealmName = realms[Math.min(realms.length - 1, tier.needRealm - 1)].name;
    let decayTip = '';
    if (realmNow < tier.needRealm) {
      decayTip = '宜在「' + needRealmName + '」后修习，当前境界不足，收益只剩三成。';
    } else if (realmNow > tier.maxRealm) {
      decayTip = '已超本门可修上限「' + maxRealmName + '」，收益只剩三成，该换更高阶的功法了。';
    }

    const stageRules = practiceData.stageRulesOf(method.id).map(function (r) {
      return {
        name: r.name,
        desc: r.desc,
        on: rec.prof >= worldData.TIERS[r.at].threshold,
        atName: worldData.TIERS[r.at].name,
      };
    });

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
      difficulty: diffKey,
      diffList: diffList,
      diffName: diff.name,
      diffMultText: diff.multText,
      rankLabel: tier.label,
      rankChar: tier.name,
      rankStars: engine.starsOf(tier.stars),
      rankColor: tier.color,
      rankRewardText: '熟练度 ×' + tier.reward.toFixed(2),
      decayTip: decayTip,
      chainItems: chainItems,
      chainLabel: skill.type + ' 一脉',
      bestText: bestText,
      theme: theme,
      twistName: twist.name,
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
      : { easy: tier >= 3, tier: tier };

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
        self.setData({
          vm: vm,
          chargeWidth: vm.charge ? Math.max(0, vm.charge.end - vm.charge.start) : 0,
          gradeNowColor: worldData.GRADE_COLOR[vm.gradeNow] || '#8a8f83',
          heartList: heartsToFlags(vm.hearts),
          meterPercent: vm.meter && vm.meter.max ? Math.round(vm.meter.value / vm.meter.max * 100) : 0,
        });
        // 浮字是玩法里唯一的「判定结果」信号，音效跟着它走，不用每个玩法各写一遍。
        if (vm.fx && vm.fx.key !== self.lastFxKey) {
          self.lastFxKey = vm.fx.key;
          sfx.tone(vm.fx.tone);
        }
        self.syncBar();
      },
      finish: function (res) { self.onFinish(res); },
    });
    this.lastFxKey = 0;
    this.setData({
      started: false,
      showResult: false,
      result: null,
      guide: guides.guideOf(gameId),
      hintLabel: gameId === 'lights' ? '阵眼感应' : gameId === 'seal' ? '符箓照纹' : '提示',
    });
    this.syncBar();
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
  },

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

  onCellTap: function (event) {
    if (!this.controller) return;
    const before = this.lastFxKey;
    this.controller.tap(Number(event.currentTarget.dataset.index || 0));
    // 玩法没给浮字（点空、翻已开的格子）就补一声轻响，让每次触碰都有回应。
    if (this.lastFxKey === before) sfx.play('tap');
  },

  onCellLongPress: function (event) {
    if (!this.controller) return;
    const before = this.lastFxKey;
    this.controller.longpress(Number(event.currentTarget.dataset.index));
    if (this.lastFxKey === before) sfx.play('tap');
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
      content: '这一局会按「走火」结算，几乎拿不到收益。确定现在收功？',
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
    const gradeTitle = worldData.GRADE_TITLE[grade] || '';
    let rv;

    if (grade === 'F') {
      if (this.mode === 'breakthrough') {
        store.commitCritical(function (s) { return engine.applyBreakthrough(s, 'F'); });
      }
      rv = {
        kind: 'abandon',
        grade: '收',
        gradeColor: '#8a8f83',
        gradeTitle: '未成',
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
        { k: '熟练度', v: '+' + r.gain },
        { k: '灵气', v: '+' + r.qi },
        { k: '局内得分', v: String(res.score || 0) },
      ];
      if (r.stone > 0) lines.push({ k: '灵石', v: '+' + r.stone });
      lines.push({ k: '倍率构成', v: multText });
      lines.push({ k: '挂机加速', v: '×' + r.buffMultiplier.toFixed(1) + ' · 30 分钟' });
      lines.push({ k: '当前熟练度', v: String(r.profAfter) });
      const notes = [];
      if (r.tierUp) notes.push('【' + r.skillName + '】升段至「' + r.tierName + '」，属性加成提高。');
      if (r.cross) notes.push('触类旁通：换了门功法，熟练度 ×1.15。');
      if (r.restless > 0) notes.push('心浮气躁：同一门连练 ' + r.restless + ' 次，收益递减。');
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
        headline: r.tierUp ? '升段 · ' + r.tierName : '参悟完成',
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
  },

  onPrimary: function () {
    const kind = this.data.result ? this.data.result.kind : '';
    if (kind === 'breakthrough') { this.onBack(); return; }
    this.setData({ showResult: false, result: null });
    this.buildGame();
    this.onStart();
    this.refresh();
  },

  onSecondary: function () {
    if (this.data.result && this.data.result.kind === 'breakthrough') {
      wx.switchTab({ url: '/pages/skills/skills' });
      return;
    }
    this.onBack();
  },

  onBack: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },
});
