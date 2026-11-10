'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const minigames = require('../../minigames/index.js');
const skillData = require('../../data/skills.js');
const practiceData = require('../../data/practice.js');
const worldData = require('../../data/world.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

Page({
  data: {
    mode: 'practice',
    modeLabel: '参 悟',
    showDifficulty: true,
    title: '',
    subtitle: '',
    methodName: '',
    gameName: '',
    tip: '',
    tierName: '',
    tierColor: '#3d8c74',
    prof: 0,
    percent: 0,
    nextText: '',
    hardUnlocked: false,
    hardHint: '',
    perkText: '',
    difficulty: 'normal',
    vm: null,
    chargeWidth: 0,
    started: false,
    showResult: false,
    result: null,
  },

  onLoad: function (query) {
    this.pageAlive = true;
    this.controller = null;
    this.mode = query && query.mode === 'breakthrough' ? 'breakthrough' : 'practice';
    this.skillId = (query && query.skillId) || '';

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
    if (this.pageAlive && this.mode) this.refresh();
  },

  onHide: function () {
    if (this.controller) this.controller.destroy();
  },

  onUnload: function () {
    this.pageAlive = false;
    if (this.controller) this.controller.destroy();
    this.controller = null;
  },

  refresh: function () {
    const state = store.get();
    if (this.mode === 'breakthrough') {
      const info = engine.breakthroughInfo(state);
      this.setData({
        title: '冲关 · ' + info.nextName,
        subtitle: '战力 ' + info.power + ' 已过 ' + info.need + ' 的门槛。气机只在一线之间，按住蓄力，松手停在朱线区间。',
        methodName: '突破瓶颈',
        gameName: '蓄力停区',
        tip: '越靠近区间正中，评级越高；偏离区间则此番不成，可再来一次。',
        tierName: info.currentName,
        tierColor: '#b8893b',
        prof: info.power,
        percent: 100,
        nextText: '目标 ' + info.nextName,
        hardUnlocked: false,
        hardHint: '',
        perkText: '突破成功后境界提升，战力获得额外境界加成。',
      });
      return;
    }
    const skill = skillData.getSkill(this.skillId);
    const method = practiceData.getMethod(skill.method);
    const rec = state.skills[this.skillId];
    const info = engine.tierInfo(rec.prof);
    this.setData({
      title: skill.name,
      subtitle: skill.desc,
      methodName: method.name,
      gameName: minigames.gameName(method.game),
      tip: method.tip,
      tierName: info.name,
      tierColor: info.color,
      prof: rec.prof,
      percent: info.percent,
      nextText: info.maxed ? '已至大成' : '距 ' + info.nextName + ' 还差 ' + (info.nextThreshold - rec.prof),
      hardUnlocked: info.index >= 2,
      hardHint: info.index >= 2 ? '苦修已解锁：难度提高，熟练度 ×1.6' : '熟练度到「熟练」后解锁苦修（熟练度 ×1.6）',
      perkText: '精通以后参悟自带便利：点灯可感应阵眼、扫雷透视 3 颗雷、节奏类更从容。',
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
      params = method.params;
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
      difficulty: this.data.difficulty,
      perks: perks,
      tip: tip,
      methodName: methodName,
      render: function (vm) {
        if (!self.pageAlive) return;
        self.setData({
          vm: vm,
          chargeWidth: vm.charge ? Math.max(0, vm.charge.end - vm.charge.start) : 0,
        });
      },
      finish: function (res) { self.onFinish(res); },
    });
    this.setData({ started: false, showResult: false, result: null });
  },

  onDifficulty: function (event) {
    if (this.data.started) return;
    const d = event.currentTarget.dataset.d;
    if (d === 'hard' && !this.data.hardUnlocked) {
      toast('熟练度到「熟练」后才能苦修');
      return;
    }
    if (d === this.data.difficulty) return;
    this.setData({ difficulty: d });
    this.buildGame();
  },

  onStart: function () {
    if (!this.controller || this.data.started) return;
    this.controller.start();
    this.setData({ started: true });
  },

  onCellTap: function (event) {
    if (!this.controller) return;
    this.controller.tap(Number(event.currentTarget.dataset.index));
  },

  onCellLongPress: function (event) {
    if (!this.controller) return;
    this.controller.longpress(Number(event.currentTarget.dataset.index));
  },

  onUndo: function () { if (this.controller) this.controller.undo(); },
  onHint: function () { if (this.controller) this.controller.hint(); },
  onPress: function () { if (this.controller) this.controller.press(); },
  onRelease: function () { if (this.controller) this.controller.release(); },
  onChargeTap: function () { if (this.controller) this.controller.tap(0); },
  onAbandon: function () { if (this.controller) this.controller.abandon(); },

  onFinish: function (res) {
    if (!this.pageAlive) return;
    const skillId = this.skillId;
    const hard = this.data.difficulty === 'hard';
    const grade = res.grade || 'C';
    const color = worldData.GRADE_COLOR[grade] || '#8a8f83';
    const gradeTitle = worldData.GRADE_TITLE[grade] || '';
    let rv;

    if (grade === 'F') {
      if (this.mode === 'breakthrough') {
        store.commit(function (s) { return engine.applyBreakthrough(s, 'F'); });
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
      const r = store.commit(function (s) { return engine.applyBreakthrough(s, grade); });
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
      const r = store.commit(function (s) {
        return engine.applyPractice(s, skillId, grade, { hard: hard });
      });
      const lines = [
        { k: '熟练度', v: '+' + r.gain },
        { k: '灵气', v: '+' + r.qi },
      ];
      if (r.stone > 0) lines.push({ k: '灵石', v: '+' + r.stone });
      lines.push({ k: '挂机加速', v: '×' + r.buffMultiplier.toFixed(1) + ' · 30 分钟' });
      lines.push({ k: '当前熟练度', v: String(r.profAfter) });
      const notes = [];
      if (r.tierUp) notes.push('【' + r.skillName + '】升段至「' + r.tierName + '」，属性加成提高。');
      if (r.cross) notes.push('触类旁通：换了门功法，熟练度 ×1.15。');
      if (r.restless > 0) notes.push('心浮气躁：同一门连练 ' + r.restless + ' 次，收益递减。');
      if (r.hard) notes.push('苦修：难度提高，熟练度 ×1.6。');
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

    if (grade === 'S' && wx.vibrateShort) {
      try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
    }
    this.setData({ showResult: true, result: rv, started: false });
    this.refresh();
  },

  onPrimary: function () {
    const kind = this.data.result ? this.data.result.kind : '';
    if (kind === 'breakthrough') { this.onBack(); return; }
    this.setData({ showResult: false, result: null });
    this.buildGame();
    if (this.controller) this.controller.start();
    this.setData({ started: true });
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
