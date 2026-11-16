'use strict';

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
const share = require('../../utils/share.js');

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 1800 });
}

function heartsToFlags(h) {
  const out = [];
  if (!h) return out;
  for (let i = 0; i < h.max; i += 1) out.push({ id: i, on: i < h.value });
  return out;
}

// 连线：转折点换成「横段 / 竖段」。相邻两点必定同行或同列（minigames/link 里压过共线点），
// 所以只算宽高，不用算角度。坐标是外扩网格，盘外那一圈刚好落在负百分比上。
function linkSegs(linkPath, cols, rows) {
  const out = [];
  if (!linkPath || !linkPath.points || !cols || !rows) return out;
  const pts = linkPath.points.map(function (p) {
    return { x: (p.c - 0.5) / cols * 100, y: (p.r - 0.5) / rows * 100 };
  });
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.abs(a.y - b.y) < 0.01) {
      out.push({ id: i, dir: 'h', left: Math.min(a.x, b.x), top: a.y, len: Math.abs(b.x - a.x) });
    } else {
      out.push({ id: i, dir: 'v', left: a.x, top: Math.min(a.y, b.y), len: Math.abs(b.y - a.y) });
    }
  }
  return out;
}

// 下一块放不进主盘：它是一块 4×4 以内的小形状，摆成固定的四乘四预告格，
// 玩家一眼看出「来的是长条还是方块」。居中对齐，不给旋转、不给颜色之外的信息。
function previewCells(piece) {
  const out = [];
  for (let i = 0; i < 16; i += 1) out.push({ key: i, on: false, tone: 0 });
  if (!piece || !piece.cells || !piece.cells.length) return out;
  let maxR = 0;
  let maxC = 0;
  for (let i = 0; i < piece.cells.length; i += 1) {
    maxR = Math.max(maxR, piece.cells[i][0]);
    maxC = Math.max(maxC, piece.cells[i][1]);
  }
  const offR = Math.floor((4 - (maxR + 1)) / 2);
  const offC = Math.floor((4 - (maxC + 1)) / 2);
  for (let i = 0; i < piece.cells.length; i += 1) {
    const r = piece.cells[i][0] + offR;
    const c = piece.cells[i][1] + offC;
    if (r < 0 || r > 3 || c < 0 || c > 3) continue;
    const k = r * 4 + c;
    out[k].on = true;
    out[k].tone = piece.tone;
  }
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
    stageBoardBrief: '',
    goalText: '',
    stageKey: 'novice',
    // 关卡：一门一条 1–1000 的长线，五段。关只由「走通了几关」定，与熟练度无关。
    level: 1,
    levelTotal: 1000,
    levelMax: 1,
    cleared: 0,
    // 段位条：{ key, name, on, done, locked, hint }。没有按钮——段不是可选项。
    stages: [],
    stageIndex: 0,
    stageName: '未入门',
    levelSub: '',
    levelChange: '',
    stageChange: '',
    rankLabel: '黄阶',
    rankChar: '黄',
    rankColor: '#8a8f83',
    rankRewardText: '×1.00',
    decayTip: '',
    bestText: '',
    // 连 S 倍率：一行写完（十个小圆点 + 下一局 S 值多少点），不再占一整张卡。
    comboText: '',
    // 规则口径一行：只奖不罚，开局前就写清这一局会不会拿到换门省气。
    repeatNote: '',
    comboDots: [],
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
    // 首局手把手：true 时页面渲染教学卡与教学盘，不渲染真局 HUD，也不结算。
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
    // 落石垒基专用：下一块预告 + 刚化的行。其余玩法恒为空数组，页面不为它们多画东西。
    nextList: [],
    holdCells: [],
    lineFlashList: [],
    linkPathList: [],
    settlePhase: 0,
    settleFull: false,
    settleGain: '+0',
    settlePercent: 0,
  },

  onLoad: function (query) {
    this.pageAlive = true;
    this.controller = null;
    // 教学盘是独立控制器：它不结算、不进存档，只负责把「点一格翻五格」演一遍。
    this.teachController = null;
    this.countdownTimers = [];
    this.needsRebuild = false;
    this.lastFxKey = 0;
    this.settleTimers = [];
    this.burstId = 0;
    this.lastCombo = 0;
    // 收牌迸溅要读「上一帧每格是第几号纹」：牌一被收走 tone 就归零，
    // 等这一帧再读只剩 0，取不到颜色。所以页面自己留一份上一帧的快照。
    this.lastTones = [];
    this.lastClearKey = 0;
    this.sparkTimer = null;
    // 落石垒基：上次演过的「化行」序号与行闪的撤场定时器。
    this.lastLineKey = 0;
    this.lineFlashTimer = null;
    // 连连看：上次演过的连线序号与撤场定时器。
    this.lastLinkKey = 0;
    this.linkTimer = null;
    this.cellRects = [];
    this.swipePath = null;
    // 最后一次「进入新格」的时间：抬手时用它算在靶心停住多久，供收势判定。
    this.lastStepAt = 0;
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    this.theme = themes.themeOf('forge', 'click');
    this.twist = '';
    // 关卡不落存档之外的任何地方：每次进这一页都按存档里本门走通的关数现算
    // （默认停在「已通 + 1」）。override 只记「这一次停留里玩家往回翻到第几关」，
    // 换页即弃——否则半年前回打过第 3 关，练到第 700 关还默认从第 3 关开局。
    this.levelOverride = 0;
    this.maxIdxSeen = -1;
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
    this.stopTeach();
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
    if (this.sparkTimer) { clearTimeout(this.sparkTimer); this.sparkTimer = null; }
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
        tip: '松手停在朱线正中，评级最高',
        tierName: info.currentName,
        tierColor: '#b8893b',
        prof: info.power,
        percent: 100,
        nextText: '目标 ' + info.nextName,
        nextBenefit: '',
        stageBoardBrief: '',
        rankLabel: '',
        rankChar: '',
        rankRewardText: '',
        decayTip: '',
        bestText: '',
        comboText: '',
        comboDots: [],
        theme: this.theme,
        twistName: '',
        // 冲关只有一句话的规则，不存在「本门新法」与难度块。
        ruleText: '按住蓄力，松手停在朱线区间；越贴近正中，评级越高。',
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
    const rec = state.skills[this.skillId];
    const info = engine.tierInfo(rec.prof);
    const theme = themes.themeOf(method.id, method.game);
    const twist = themes.twistOf(method.twist);
    const tier = practiceData.tierOf(skill.tier);

    // 一门一条 1–1000 的长线，五段。段位只由「走通了几关」定，玩家没有挑档这个动作：
    // 只能往前走（走通才推进一关），或往回翻（回关按本关÷当前关折熟练度）。
    const cleared = practiceData.clearedOf(rec);
    // 本门当前关 = 已通 + 1；走完 1000 关停在 1000。
    const curNo = practiceData.curLevelOf(rec);
    const override = Math.round(this.levelOverride) || 0;
    const level = Math.max(1, Math.min(curNo, override || curNo));
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

    // 连 S 每门各算各的：只有「本门当前关」的 S 叠层，回关局不叠，
    // C/B/A 与走火归零。一行只写「现在几层 / 下一局 S 值多少点」，整条曲线在说明页，别铺公式。
    const comboMax = worldData.COMBO_MAX;
    const comboNow = Math.min(comboMax, Math.floor(Number(state.sCombo && state.sCombo[skill.id]) || 0));
    const comboDots = [];
    for (let i = 0; i < comboMax; i += 1) comboDots.push({ id: i, on: i < comboNow });
    const comboText = '连 S ' + comboNow + ' / ' + comboMax + ' · 下一局 S '
      + (comboNow >= comboMax ? '封顶 ' : '') + worldData.comboGain(comboNow + 1) + ' 点';
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
      const on = rec.prof >= worldData.TIERS[r.at].threshold;
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
    // 分数线（三秀同收）与盘数线（阵灯推演）都由 practiceData 同源生成，换段跟着变。
    const sLine = practiceData.sLineText(method, stageIdx);
    // 开局卡那一行：整篇规则在说明页，首屏只留「这一局做什么」。
    const guideData = guides.guideOf(method.game);
    const ruleText = guideData ? guideData.goal : method.desc;
    // 入门卡：第一次进这一门先摆三句「怎么玩」。教学盘（只有阵法·点灯破阵诀有）是跟着走一遍，
    // 入门卡是进门前读三行——十九门都得有，不然新门道只能靠试错。
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
          metaText: x.profTierName + ' ' + x.percent + '%',
          current: x.id === skill.id,
        };
      });

    this.theme = theme;
    this.twist = method.twist;
    this.setData({
      title: skill.name,
      subtitle: skill.desc,
      gameName: minigames.gameName(method.game),
      // 与局内那一行同源：三秀同收的罚息按档变，这里不许留一句写死的「少 2 息」。
      tip: practiceData.tipFor(method, stageIdx),
      ruleText: ruleText,
      introOn: introOn,
      intro: intro,
      tierName: info.name,
      tierColor: info.color,
      prof: rec.prof,
      percent: info.percent,
      nextText: info.maxed ? '已至大圆满' : '距 ' + info.nextName + ' 还差 ' + (info.nextThreshold - rec.prof),
      nextBenefit: nextTier ? '到「' + nextTier.name + '」：' + nextTier.desc : '',
      stageKey: stageDef.key,
      level: level,
      levelTotal: levelData.LEVEL_MAX,
      levelMax: levelMax,
      curLevel: curNo,
      cleared: cleared,
      // 进度只写两个数：本门走通了几关（0–1000），以及在本段里的位置。
      // 段名是玩家理解进度的那把尺子，「第 762 关」本身不说明任何事。
      levelSub: '已走通 ' + cleared + ' / ' + levelData.LEVEL_MAX + ' 关 · 本段 '
        + levelData.levelInStage(level) + ' / ' + levelData.stageSize(stageIdx) + ' 关'
        + (level < curNo ? ' · 本局回打第 ' + level + ' 关' : ''),
      levelChange: (function () {
        const d = practiceData.levelDelta(method, level);
        if (!d.length) return '与上一关规格相同（本段第 '
          + levelData.levelInStage(level) + ' / ' + levelData.stageSize(stageIdx)
          + ' 关；盘面规格换段才换，段内只收时辰与评级线）';
        return (d[0].chapter ? '' : '本关变化：') + d.map(function (x) { return x.text; }).join(' · ');
      })(),
      // 段位条：五段一条，只报「哪几段走完了、现在在哪一段、这一段还有几关」。
      // 这里没有按钮——段不是可选项，走通段界关才进下一段。
      stages: practiceData.STAGES.map(function (d, i) {
        const done = cleared >= d.to;
        const on = i === stageIdx;
        return {
          key: d.key,
          name: d.name,
          on: on,
          done: done,
          locked: !done && !on,
          hint: done ? '已走通' : (on ? cleared - d.from + 1 + ' / ' + (d.to - d.from + 1) : '未到'),
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
      goalText: sLine,
      rankLabel: tier.label,
      rankChar: tier.name,
      rankColor: tier.color,
      // 品阶这一行不再写「收益 ×3.20」——参悟不产资源了。
      // 它现在唯一的作用是耗气系数，具体数字已经算进 qiCost，这里只说「更费气」。
      rankRewardText: tier.stars > 1 ? '耗气 ×' + tier.qiCost.toFixed(2) : '',
      decayTip: decayTip,
      bestText: bestText,
      comboText: comboText,
      repeatNote: repeatNote,
      comboDots: comboDots,
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
    // 新一局默认不是「主动收功」：这个标记只由 onAbandon 置位，结算读完即失效。
    // 同一条 F 有两种来历——主动退出（整局作废）与走火（一局打完但没成），
    // 收益与连 S 处置完全不同，所以必须在页面上分开。
    this.aborting = false;
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
      // 一关一副参数，按本关所在段 + 段内进度现算。
      params = practiceData.buildParamsAt(method, this.data.level);
      methodName = method.name;
      // 代价句里的罚息随段变（三秀同收），不能用写死在功法表里的那一句。
      tip = practiceData.tipFor(method, this.data.stageIndex);
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
      // 玩法模块只认 normal / hard 两档手感；真正的段间差异全部落在 params 上。
      difficulty: practiceData.STAGES[this.data.stageIndex].gear,
      stageKey: this.data.stageKey,
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

        // 迸溅要在 setData 之前算：它读的是上一帧的纹样快照。
        const sparks = self.sparksFrom(vm);

        // 落石垒基：下一块预告与刚化的行。这两样只在这一门出现，
        // 别的玩法 vm.blocks 为 null，算出来是空数组，页面不会多摆一行。
        // 落石垒基：暂存格 + 三块预告。别的玩法 vm.blocks 为 null，两个数组都是空，
        // 页面不会多摆那一条。
        let nextList = [];
        let holdCells = [];
        if (vm.blocks) {
          holdCells = previewCells(vm.blocks.hold);
          const q = vm.blocks.queue || [];
          for (let qi = 0; qi < q.length; qi += 1) {
            nextList.push({ id: qi, cells: previewCells(q[qi]) });
          }
        }
        // 连连看的连线：只在收走一对的那一帧出现，320ms 后撤。
        let linkPathList = self.data.linkPathList;
        if (vm.linkPath && vm.linkPath.key !== self.lastLinkKey) {
          self.lastLinkKey = vm.linkPath.key;
          const lk = vm.link;
          linkPathList = linkSegs(vm.linkPath, (lk && lk.cols) || vm.cols, (lk && lk.rows) || 4);
          if (self.linkTimer) clearTimeout(self.linkTimer);
          self.linkTimer = setTimeout(function () {
            self.linkTimer = null;
            if (!self.pageAlive) return;
            self.setData({ linkPathList: [] });
          }, 340);
        }
        let lineFlashList = self.data.lineFlashList;
        if (vm.linesClear && vm.linesClear.key !== self.lastLineKey) {
          self.lastLineKey = vm.linesClear.key;
          const rowsN = vm.blocks && vm.blocks.rows ? vm.blocks.rows : 8;
          const key = vm.linesClear.key;
          lineFlashList = vm.linesClear.rows.map(function (r) {
            return {
              id: key + '-' + r,
              top: (r / rowsN * 100).toFixed(2),
              height: (100 / rowsN).toFixed(2),
            };
          });
          if (self.lineFlashTimer) clearTimeout(self.lineFlashTimer);
          self.lineFlashTimer = setTimeout(function () {
            self.lineFlashTimer = null;
            if (!self.pageAlive) return;
            self.setData({ lineFlashList: [] });
          }, 460);
        }

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
          sparkList: sparks || self.data.sparkList,
          nextList: nextList,
          holdCells: holdCells,
          lineFlashList: lineFlashList,
          linkPathList: linkPathList,
        });
        // 留一份「这一帧每格是第几号纹」给下一帧取色。vm.cells 是同一个对象，
        // 下一帧玩法会把它改写成收走后的样子，到那时就读不到被收走那张牌的颜色了。
        const cells = vm.cells || [];
        const tones = [];
        for (let i = 0; i < cells.length; i += 1) tones.push(cells[i].tone);
        self.lastTones = tones;
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
      boardHeld: false,
      // result / recordBrief 不清：留在准备页时切出去再回来，controller 要重建，
      // 但「上局战绩」还得能点开重看。只有「再来一局」才显式清掉。
      guide: guides.guideOf(gameId),
      hintLabel: practiceData.hintLabelOf(gameId),
      sceneOn: stage.on,
      stage: stage,
      burstList: [],
      sparkList: [],
      settlePhase: 0,
    });
    // 换局 / 重开：上一局的迸溅游标必须归零，否则新局第一次收牌
    // 可能正好撞上旧 key，页面会以为「已经演过了」而不迸。
    this.lastClearKey = 0;
    this.lastTones = [];
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

  // 收牌迸溅：玩法把「这一手收走了哪几格」交上来（vm.cleared），这里按格位算坐标，
  // 在原位炸一小把，颜色取被收走那张牌的纹样色。
  // 为什么不在盘面上做「格子自己炸开」：连连看收完留空格（格子可以演），
  // 消消乐收完立刻掉落重排（格子当场就换了内容，演不出来）。做成独立的浮层，
  // 两门功课才能共用一套；也不会被格子的 overflow 与状态色牵制。
  // 返回 null 表示这一帧没有新迸溅（保持现状）。
  sparksFrom: function (vm) {
    const c = vm && vm.cleared;
    if (!c || !c.key || c.key === this.lastClearKey) return null;
    this.lastClearKey = c.key;
    const n = vm.cells ? vm.cells.length : 0;
    if (!n || !c.cells || !c.cells.length) return null;
    const cols = vm.cols || 6;
    const rows = Math.max(1, Math.round(n / cols));
    const tones = this.lastTones || [];
    const hue = visual.CREST_HUE;
    const dots = [];
    const count = visual.MOTION.sparkDots;
    for (let d = 0; d < count; d += 1) {
      dots.push({
        id: d,
        // 角度错开、距离与大小各不相同：等分角度 + 等大会被读成「一圈珠子挂在环上」，
        // 尺寸差一点点就散成了碎屑。偏移量写死（不用随机），同一次收牌每次呈现都一样。
        a: Math.round(360 * d / count + 12 + (d % 2 ? 9 : -6)),
        d: visual.MOTION.sparkDist - (d % 3) * 18,
        size: 16 + (d % 3) * 3,
        mt: -(16 + (d % 3) * 3) / 2,
        delay: (d % 3) * 22,
      });
    }
    const list = [];
    // 一次最多画 2 处、每处 6 粒 = 12 枚，正好用满动效预算（MOTION.particleCap）。
    // 消消乐一把能收十几格，全画就是满屏烟花，既盖住盘面也顶不住低端机的帧；
    // 相邻格本来就会重叠，取前两处已经够表达「刚刚收了一把」。
    for (let k = 0; k < c.cells.length && list.length < 2; k += 1) {
      const i = c.cells[k];
      if (i < 0 || i >= n) continue;
      const tone = tones[i] || 1;
      list.push({
        // key 里带 clearSeq：相邻两次收牌的下标完全可能相同，靠 id 区分才会重播动画。
        id: c.key + '-' + i,
        x: ((i % cols + 0.5) / cols * 100).toFixed(2),
        y: ((Math.floor(i / cols) + 0.5) / rows * 100).toFixed(2),
        color: hue[(tone - 1 + hue.length) % hue.length] || hue[0],
        dots: dots,
      });
    }
    if (!list.length) return null;
    this.scheduleSparkClear();
    return list;
  },

  // 动画走完就把节点撤掉：这些粒子是绝对定位的浮层，留着不撤会一直在盘面上堆节点。
  scheduleSparkClear: function () {
    const self = this;
    if (this.sparkTimer) clearTimeout(this.sparkTimer);
    this.sparkTimer = setTimeout(function () {
      self.sparkTimer = null;
      if (!self.pageAlive) return;
      self.setData({ sparkList: [] });
    }, visual.MOTION.sparkMs + 80);
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
    // 本局已终、盘面留在屏上：这一屏不能点盘面了，三个去处全在底栏。
    else if (this.data.boardHeld) mode = 'done';
    // 教学盘没有「收功」也没有提示按钮：它连一步都不计，底栏不该出现任何可点项。
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
        cancelText: '再等等',
        success: function (res) {
          if (res.confirm) wx.navigateTo({ url: '/pages/battle/battle' });
        },
      });
      return;
    }
    const lack = Math.max(0, this.data.qiCost - this.data.qi);
    wx.showModal({
      title: '灵力不足',
      content: '本局需 ' + this.data.qiCost + ' 点，尚差 ' + lack
        + ' 点（气海上限 ' + this.data.qiMax + '）。回洞府闭关打坐，每分钟 '
        + worldData.getWorld().idle.qiPerMinute + ' 点，约坐 '
        + Math.ceil(lack / worldData.getWorld().idle.qiPerMinute)
        + ' 分钟可足' + (this.data.stone > 0 ? '；若是等不及，回洞府拿灵石换（1 枚 100 点）' : '')
        + '。上限不够用时，破境或练真元都能把气海拓深。',
      confirmText: '回洞府打坐',
      cancelText: '容再思量',
      success: function (res) {
        if (res.confirm) wx.switchTab({ url: '/pages/index/index' });
      },
    });
  },

  // 首局手把手：这门功法第一次开局，先进一盘不计步的小阵，而不是 3-2-1 直接上。
  // 只对「模块自带 teach 脚本」的玩法生效；没脚本的玩法照旧开局，不硬塞过场。
  canTeach: function () {
    if (this.mode !== 'practice' || !this.skillId) return false;
    if (engine.hasOnboarded(store.get(), this.skillId)) return false;
    return !!(this.gameId && minigames.hasTeach(this.gameId));
  },

  startTeach: function () {
    const self = this;
    this.clearCountdown();
    this.stopTeach();
    if (this.controller) { this.controller.destroy(); this.controller = null; }
    this.teachController = minigames.createTeach(this.gameId, {
      theme: this.theme,
      render: function (vm) {
        if (!self.pageAlive) return;
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

  // 跳过与走完同一条路：记下「这门看过引导」，回准备页重建真局再起手。
  // 跳过不做二次确认——它本来就不是门槛，玩家说看懂了就该放他走。
  finishTeach: function (skipped) {
    const self = this;
    this.stopTeach();
    store.commitCritical(function (s) { return engine.markOnboarded(s, self.skillId); });
    this.setData({ tutorial: false, started: false, vm: null, burstList: [], sparkList: [] });
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
    if (!this.controller || this.data.started || this.data.countdown > 0) return;
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

  // 倒数三秒里还能反悔：这时 controller.start() 还没调用，撤掉遮罩就是回到准备页，
  // 不用先开局再「收功」。想看清规则、难度与本门新法的人有这一拍。
  onCancelCountdown: function () {
    if (!this.pageAlive || this.data.countdown <= 0) return;
    this.clearCountdown();
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
    getApp().globalData.lastSkillId = id;
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

  // 关卡切换：一次一格，只能往回翻到已走通的关。往前推进只靠走通，不靠熟练度。
  onLevel: function (event) {
    if (this.data.started || this.data.countdown > 0) return;
    const dir = Number(event.currentTarget.dataset.d) || 0;
    if (!dir) return;
    const next = this.data.level + dir;
    if (next < 1 || next > this.data.levelMax) {
      if (next > this.data.levelMax) {
        // 到顶不让人白点：说清「下一关怎么来」。关卡靠走通推进，不靠熟练度，
        // 所以这里不能说「熟练度到 300 才开新关」——那句话现在已经是假的。
        toast(this.data.cleared >= this.data.levelTotal
          ? '本门 1000 关已走完，已是「大圆满」'
          : '本门打到第 ' + this.data.levelMax + ' 关：走通它，下一关才开');
      }
      return;
    }
    this.levelOverride = next;
    this.refresh();
    this.buildGame();
  },

  // 回到「已通 + 1」：连打几局之后跳回进度线，不用一路点回去。
  onLevelResume: function () {
    if (this.data.started || this.data.countdown > 0) return;
    this.levelOverride = 0;
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
    const before = this.lastFxKey;
    this.controller.tap(index);
    // 玩法没给浮字（点空、翻已开的格子）就补一声轻响，让每次触碰都有回应。
    if (this.lastFxKey === before) sfx.play('tap');
    // 步法键连按同一个方向时，光看画面容易怀疑「这一下点上没有」，补一次极轻的触感。
    if (this.data.vm && this.data.vm.stage === 'scroll' && wx.vibrateShort) {
      try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
    }
  },

  onCellLongPress: function (event) {
    if (this.data.tutorial) return;
    if (!this.controller) return;
    if (this.data.vm && this.data.vm.extras.showSwipe) return;
    const before = this.lastFxKey;
    this.controller.longpress(Number(event.currentTarget.dataset.index));
    if (this.lastFxKey === before) sfx.play('tap');
  },

  // 华容道的块不在 cells 里：整块按百分比定位渲染，点一下就把这一块选中。
  // 只有 stage === 'klotski' 会用到，别的玩法照旧走格子。
  onBlockTap: function (event) {
    if (this.data.tutorial) return;
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

  // 四向推盘：手指从盘上往哪个方向划，全盘就往哪个方向挤。
  // 判据只用「起点 → 终点」的位移，不跟轨迹——推盘是一步决策，不是画线。
  // 24px 以下当作没划（手指抖一下不该把整盘推走）；斜划取主轴，不判无效。
  onMoveTouchStart: function (event) {
    if (!this.controller || !this.data.started || this.data.showResult || this.data.boardHeld) return;
    const pt = this.touchPoint(event);
    if (!pt) return;
    this.moveFrom = pt;
  },

  // 空实现只为吞掉 touchmove：不吞的话手指一划页面会跟着滚，盘面留不住。
  onMoveTouchMove: function () {},

  onMoveTouchEnd: function (event) {
    const from = this.moveFrom;
    this.moveFrom = null;
    if (!from || !this.controller || !this.controller.move) return;
    const pt = this.touchPoint(event);
    if (!pt) return;
    const dx = pt.x - from.x;
    const dy = pt.y - from.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 24) return;
    const dir = ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    this.controller.move(dir);
    sfx.play('tap');
  },

  // 方向键只给 vm.extras.showPad 的玩法（落石垒基）：统一走 controller.move(dir)。
  onPad: function (event) {
    if (!this.controller || !this.data.started || this.data.showResult) return;
    const dir = event.currentTarget.dataset.dir;
    if (!dir) return;
    this.controller.move(dir);
    sfx.play('tap');
  },

  // 暂存：点右侧的暂存格。玩法层只知道 move('hold')，不碰坐标也不碰视觉。
  onHold: function () {
    if (!this.controller || !this.data.started || this.data.showResult) return;
    this.controller.move('hold');
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
      title: '中途收功',
      content: '本局作废，不计所得；连 S 归零，起手耗去的灵力不退。确定收功？',
      confirmText: '收功',
      confirmColor: '#b4453c',
      success: function (res) {
        if (res.confirm && self.controller) {
          // 先置位再收功：结算回来才知道这条 F 是玩家自己点的，而不是打崩的。
          self.aborting = true;
          // 收功不进 applyPractice，但连 S 必须断——否则预感拿不到 S 就退出能把连击永久保住。
          // 突破局（气机一乱）不是参悟，不动任何一门功法的连击。
          if (self.mode !== 'breakthrough') {
            store.commitCritical(function (s) { return engine.breakCombo(s, self.skillId); });
          }
          self.controller.abandon();
        }
      },
    });
  },

  onFinish: function (res) {
    if (!this.pageAlive) return;
    const skillId = this.skillId;
    const grade = res.grade || 'C';
    const color = worldData.GRADE_COLOR[grade] || '#8a8f83';
    const gradeTitle = copy.GRADE_TITLE[grade] || '';
    let rv;

    // F 有两种来历，处置完全不同：
    //   ① 玩家点「收功」→ 这一局作废，不进结算，由 onAbandon 把连 S 归零；
    //   ② 玩法自己判负（阵溃 / 心神耗尽 / 时辰到没通完）→ 是一局打完的结果，
    //      按「走火」结算：零收益（熟练度 / 灵力 / 灵石 / 加成都不给），连 S 断。
    // 突破局只有一种 F：气机一乱，走 ①。
    if (grade === 'F' && (this.aborting || this.mode === 'breakthrough')) {
      let btFail = null;
      if (this.mode === 'breakthrough') {
        // 冲关不成也是花钱的：布阵的灵石散掉一半，得在结算里如实说。
        btFail = store.commitCritical(function (s) { return engine.applyBreakthrough(s, 'F'); });
      }
      rv = {
        kind: 'abandon',
        grade: '收',
        gradeColor: '#8a8f83',
        gradeTitle: copy.GRADE_TITLE.F,
        headline: this.mode === 'breakthrough' ? '气机一乱' : '中途收功',
        subline: this.mode === 'breakthrough'
          ? '气机散了，未伤根基，再来一次就好。'
          : '这回不算数，随时可以重新起手。',
        summary: res.summary,
        lines: btFail && btFail.stoneCost > 0
          ? [{ k: '灵石', v: '−' + btFail.stoneCost + ' · 余 ' + btFail.stoneAfter }]
          : [],
        notes: btFail && btFail.stoneCost > 0
          ? ['冲关失手，布阵的灵石散了 ' + btFail.stoneCost + ' 枚；余下的还在，调整好再来。']
          : [],
        titles: [],
        // 冲关局没有盘面可留（那一盘是蓄力条），两个去处与成功时一致。
        primary: this.mode === 'breakthrough' ? copy.UI.actions.backHome : copy.UI.actions.again,
        secondary: this.mode === 'breakthrough' ? copy.UI.actions.goSkills : copy.UI.actions.back,
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
          // 布阵是花出去的钱：写「−60」而不是「+60」。
          { k: '灵石', v: '−' + r.stoneCost + ' · 余 ' + r.stoneAfter },
          { k: '境界', v: r.realmName },
          { k: '战力', v: r.powerBefore + ' → ' + r.powerAfter + '（+' + (r.powerAfter - r.powerBefore) + '）' },
          // 气海是突破的第二重所得，而且当天就能摸到：破境即补满，一趟能多练几局。
          { k: '灵力上限', v: r.qiCapBefore + ' → ' + r.qiCapAfter + '（+' + (r.qiCapAfter - r.qiCapBefore) + '）' },
          { k: '灵力', v: '已补满 ' + r.qiAfter + ' / ' + r.qiCapAfter },
        ],
        notes: ['此后闭关与对战都按新境界计算：闭关每分钟的灵力与每日份例不变，但可修上限更高、气海更深。'],
        titles: (r.newTitles || []).map(function (t) { return t.name; }),
        primary: copy.UI.actions.backHome,
        secondary: copy.UI.actions.goSkills,
      };
    } else {
      const lv = this.data.level;
      const r = store.commitCritical(function (s) {
        return engine.applyPractice(s, skillId, grade, { level: lv, score: res.score || 0 });
      });
      // 参悟只换熟练度，不产资源：结算卡里灵力是「花掉的」，不是「赚到的」。
      // 这一行是玩家唯一能核对的账，所以耗气的三个修正也要在同一屏写清（见 notes）。
      const lines = r.wiped
        // 走火不是「得 0 分」，是这一局不作数：一排 +0 会让人以为自己算错了。
        ? [
          { k: '所得', v: '无 · 走火' },
          { k: '灵力', v: '−' + r.qiCost + '（不退）' },
          { k: '局内得分', v: String(res.score || 0) },
        ]
        : [
          // 三连晋级取消后，这一栏就是本局实得点数，与 profAfter - profBefore 严格对齐。
          { k: '熟练度', v: r.gain > 0 ? '+' + r.gain : '已化境' },
          // 打的是本门当前关就写「本关」，往回翻就写「回关」。
          // 关号是一条 1–1000 的长轴，段名只是这段读法：写「入门 · 第 3 / 1000 关」，
          // 玩家才不会以为「大成的第 3 关」与「入门的第 3 关」是同一格。
          ...(r.level > 0 ? [{
            k: '关卡',
            v: r.stageName + ' · 第 ' + r.level + ' / ' + r.levelTotal + ' 关'
              + (r.levelWasCurrent ? '（本关）' : ' · 回关'),
          }] : []),
          { k: '灵力', v: '−' + r.qiCost + ' · 余 ' + r.qiAfter + ' / ' + r.qiMax },
          { k: '局内得分', v: String(res.score || 0) },
        ];
      // 走火没给加成：这行留着会让玩家以为「崩了还蹭到了 30 分钟加速」。
      if (!r.wiped) lines.push({ k: '挂机加速', v: '×' + r.buffMultiplier.toFixed(1) + ' · 30 分钟' });
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
      // 玩法层可以带自己的评级依据（点灯破阵诀写「走了几步 / 最优几步 / 为什么不是 S」）。
      // 它排在最前：玩家最先想知道的是这一局本身，而不是连 S 进度。
      const notes = Array.isArray(res.notes) ? res.notes.slice() : [];
      // 走火不是「成绩差」，是没走完：先把理由摆在最前，玩家才知道这一局到底栽在哪。
      // 灵力不退是这套经济的硬规则——起手就烧了，崩掉的只是熟练度与加成。
      if (grade === 'F') {
        notes.unshift('本局未走完，按「走火」不计所得：熟练度与挂机加成不给、连 S 归零；'
          + '起手烧掉的 ' + r.qiCost + ' 点灵力不退。');
      }
      // 耗气要当场可复算：玩家看到「灵力 −17」，得知道这个 17 是怎么来的。
      // 只在真被修正时才展开，标准档位不啰嗦。
      if (r.methodQiFactor !== 1 || r.tierQiCost > 1 || r.realmOverCost > 1 || r.qiSave > 0) {
        notes.push('本局耗气 ' + r.qiCost + '：' + r.stageName + '段基数'
          + (r.methodQiFactor !== 1 ? ' × 时长 ' + r.methodQiFactor.toFixed(2) : '')
          + (r.tierQiCost > 1 ? ' × ' + r.tierLabel + '品阶 ' + r.tierQiCost.toFixed(2) : '')
          + (r.realmOverCost > 1 ? ' × 境界超限 ' + r.realmOverCost.toFixed(1) : '')
          + (r.qiSave > 0 ? '，心法省 ' + Math.round(r.qiSave * 100) + '%' : '')
          + '，悟性再省一截。');
      }
      // 回关折减要当场说：面板上退了几关、结算只给一部分，不解释就像算错了。
      if (r.levelBelowCap) {
        // 折减只作用在基础熟练度上（本关 ÷ 当前关）；耗气不跟着折，回关本来就便宜。
        notes.push('回打第 ' + r.level + ' 关（本门已走到第 ' + r.curLevel + ' 关，退 '
          + r.levelGap + ' 关）：基础熟练度按 ×'
          + String(Math.round(r.levelBelowFactor * 1000) / 1000) + ' 计，本局不叠连 S，已有层数原样保留；'
          + '回第 ' + r.curLevel + ' 关打才全额。');
      }
      // 走通的那一关要说出来：关卡靠过关推进，不报玩家就不知道刚才那局推没推进。
      if (r.advanced) {
        notes.push('第 ' + r.level + ' 关已走通（本门 ' + r.level + ' / ' + r.levelTotal
          + '）：下一局接第 ' + Math.min(r.levelTotal, r.level + 1) + ' 关。');
      } else if (!r.wiped && r.levelWasCurrent && r.level >= r.levelTotal) {
        notes.push('本门 ' + r.levelTotal + ' 关已全部走通：' + r.stageAfterName + '。');
      }
      // 跨段是 1000 关里玩家最该知道的一刻：盘面换了、耗气涨了、段名变了。
      if (r.promoted) notes.push('踏入「' + r.stageAfterName + '」：这一段换了盘面，一局耗气也跟着涨。');
      // 连 S 回执：本局叠了几层、下一局值多少点，数字全部由 world.comboGain 同源给。
      if (r.comboActive) {
        notes.push('连 S ' + r.comboNow + ' / ' + r.comboMax + '：本局 34 × 1.5^'
          + (r.comboNow - 1) + ' → ' + r.comboGain + ' 点；下一局 S ' + r.comboNextGain
          + ' 点' + (r.comboCapped ? '（已封顶）' : '') + '。非 S 或走火都会归零。');
      } else if (grade !== 'F' && r.comboTransparent) {
        notes.push('本门连 S ' + r.comboNow + ' 层原样保留：回关不叠也不清。');
      } else if (grade !== 'F') {
        notes.push('非 S，连 S 归零；下一局 S 重新从 34 点起算。');
      }
      if (r.tierUp) notes.push('【' + r.skillName + '】火候至「' + r.tierName + '」，属性加成提高。');
      if (r.cross) notes.push('触类旁通：换了门功法，本局运功更顺，耗气少 8%。');
      if (r.levelFellBack) notes.push('所选关超出本门当前进度，已按第 ' + r.curLevel + ' 关结算。');
      if (r.realmAbove) {
        notes.push('人物境界已超本门可修上限「' + r.maxRealmName + '」：照样能练，但本局耗气 ×'
          + r.realmOverCost.toFixed(1) + '；熟练度照给，该换更高阶的功法了。');
      }
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
        // 走火时 headline 与 gradeTitle 都会写「走火」，标题行会重复两遍；
        // 这里让副标题改说「这一局没走完」，把「为什么一分不给」留在 notes 里。
        gradeTitle: grade === 'F' ? '此局未竟' : gradeTitle,
        headline: grade === 'F'
          ? '走火'
          : (r.promoted ? '晋段 · ' + r.stageAfterName : '参悟完成'),
        subline: r.methodName + ' · ' + res.summary,
        summary: res.summary,
        lines: lines,
        notes: notes,
        titles: (r.newTitles || []).map(function (t) { return t.name; }),
        // 一局打完，十有八九还想再来一局——它才该是那颗金按钮。
        // 「留在本页」退成下方文字链：那是给想多看两眼盘面的人留的。
        primary: copy.UI.actions.again,
        secondary: copy.UI.actions.backSkills,
      };
    }

    if (wx.vibrateShort && (grade === 'S' || grade === 'A')) {
      try { wx.vibrateShort({ type: grade === 'S' ? 'heavy' : 'light' }); } catch (e) { /* 部分环境不支持震动 */ }
    }
    if (grade === 'S' || grade === 'A') sfx.play('clear');
    else if (grade === 'F') sfx.play('fail');
    else sfx.play('settle');
    // 结算的两颗按钮 + 一条文字链：金按钮「再来一局」（一局打完多半还想连刷）、
    // 次按钮「返回功法」、文字链「留在本页」（留着盘面多看两眼）。
    // 突破结算没有盘面也没有下一局，保持原来的两个去处。
    rv.canStay = this.mode !== 'breakthrough';
    let recordBrief = '';
    if (rv.canStay) {
      let gain = '';
      for (let i = 0; i < rv.lines.length; i += 1) {
        if (rv.lines[i].k === '熟练度') gain = rv.lines[i].v;
      }
      // 这一行是准备页上唯一还看得见的上一局结论，所以写短、写准：
      // 走火/收功各自一个词，别再拼「这一局没走完」那种一读就断的短语。
      const briefTitle = rv.kind === 'abandon' ? '收功' : (grade === 'F' ? '走火' : rv.gradeTitle);
      recordBrief = '上局 · ' + (briefTitle || '')
        + (gain ? ' · ' + (gain === '已化境' ? '熟练度已化境' : gain + ' 熟练度') : '');
    }
    this.clearCountdown();
    this.setData({ showResult: true, result: rv, recordBrief: recordBrief, started: false, boardHeld: false });
    this.syncBar();
    this.refresh();
    if (this.data.sceneOn) this.startSettle(rv, grade);
  },

  // 结算金按钮：再来一局（冲关结算仍回洞府——那一盘没有「下一局」可续）。
  onPrimary: function () {
    const rv = this.data.result;
    if (!rv) return;
    if (rv.kind === 'breakthrough' || this.mode === 'breakthrough') { this.onBack(); return; }
    this.onAgain();
  },

  // 留在本页 = 留在刚打完的这一屏：盘面、终局分数、香炷刻度都原样停在眼前，
  // 退的是结算卡，不是退到准备页。这一局已经结束，所以把控制器摘掉——
  // 盘面只剩看的份，底部换成「上局战绩 / 返回功法 / 再来一局」。
  onStay: function () {
    if (!this.pageAlive) return;
    this.clearSettleTimers();
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

  // 次按钮：冲关局（成或不成）都去功法页；练习局返回功法页由 onBack 走原生返回。
  onSecondary: function () {
    this.clearSettleTimers();
    if (this.mode === 'breakthrough') {
      wx.switchTab({ url: '/pages/skills/skills' });
      return;
    }
    this.onBack();
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

  // 标题骨架在 copy.SHARE.practice，功法和玩法名由本页填。
  shareText: function () {
    return copy.SHARE.practice
      .replace('{skill}', this.data.title)
      .replace('{game}', this.data.gameName);
  },

  onGoGuide: function () { wx.navigateTo({ url: '/pages/guide/guide' }); },

  onBack: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },
});
