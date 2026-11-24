'use strict';

// 参悟结算：耗气、走通落账、回关
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。
//
// 参悟只产一件事：把这一门的关卡往前走一关（rec.cleared +1）。
// 不产熟练度、不产资源——「练了什么就得到什么」在这款游戏里只有一种意思。

const { copy, economyData, levelData, practiceData, skillData, worldData } = require('./base.js');
const { checkTitles, computeAttributes, effectValue, powerDetail, qiCap, tierIndexOfCleared } = require('./profs.js');
const { addLog, checkDaily, num } = require('./state.js');
const { touchSkill } = require('./view.js');

// ---------------------------------------------------------------- 参悟结算

function applyPractice(state, skillId, grade, options) {
  const skill = skillData.getSkill(skillId);
  if (!skill || !state.skills[skillId] || !state.skills[skillId].unlocked) {
    return { ok: false, msg: '暂未习得这门功法' };
  }
  const method = practiceData.getMethod(skill.method);
  const opts = options || {};
  checkDaily(state);
  const rec = state.skills[skillId];
  // 一门就是一条 1–1000 的长线，所以这一局「打第几关」不是往上挑的，只能回关。
  // 关卡决定这一局的参数与耗气——「刷最低关」绕不过去，因为回关不推进度。
  // 段位（未入门…大圆满）就是这条线的位置，不再有第二条进度。
  const cleared = practiceData.clearedOf(rec);
  // 本门当前关 = 已通 + 1；走通 1000 关后停在 1000（重打不推进，也不越界）。
  const curNo = practiceData.curLevelOf(rec);
  const wantNo = Math.max(1, Math.round(num(opts.level, curNo)));
  // 只能往回打，不能往上挑：打的是哪一关由进度决定，不是由参数决定。
  const levelFellBack = wantNo > curNo;
  const playedNo = Math.min(curNo, wantNo);
  const beforeTier = tierIndexOfCleared(cleared);
  // 战力是阶梯值：属性 = 功法条目 × 档位系数，档位不跳战力就不动。
  // 先记下开场值，结算时才能如实说「这一局涨了没有」，而不是含糊带过。
  const powerBefore = powerDetail(state).total;

  // 失败（F）是「这一局作废」，不是「最低一档」：倍率 0，整局不给任何东西。
  // 注意倍率为 0 时不能用 `||` 兜底——0 会被当成「没配」，静默落回 0.6。
  const rawFactor = worldData.GRADE_FACTOR[grade];
  const factor = typeof rawFactor === 'number' ? rawFactor : 0.6;
  const wiped = factor === 0;
  const attrs = computeAttributes(state);
  // 心法省的「气」：澄心 / 勘禁 / 太虚 / 并蒂 / 九宫 / 让路六门累加，封顶一半。
  const qiSave = effectValue(state, 'qiSave');

  // 只奖不罚：同一门连练不递减。进度线只剩「一局推一关」之后，
  // 往回刷本来就一分不涨；此时再扣收益，等于对最该专精的人反着来。
  // 多样化靠换门的正激励（CROSS_QI），不靠惩罚专精。
  const cross = !!state.lastPractice.skillId && state.lastPractice.skillId !== skillId;

  // 一个维度只管一件事：段位管盘面参数与耗气基数、评级管这一局打得怎么样、
  // 境界管耗气有没有超限、品阶管运功消耗与属性系数。
  // 品阶不进进度公式——「高级功法练得更快」会让低阶功法从成长线上被直接淘汰，
  // 也和「难度跟人走」自相矛盾；品阶的价值在战力（attr）与可修境界（maxRealm）。
  const tier = practiceData.tierOf(skill.tier);
  const w = worldData.getWorld(state.worldId);
  const realmNow = state.realmIndex + 1;
  const maxRealmName = w.realms[Math.min(w.realms.length - 1, tier.maxRealm - 1)].name;
  const needRealmName = w.realms[Math.min(w.realms.length - 1, tier.needRealm - 1)].name;
  // 境界只回答两个问题，绝不合成一个布尔：
  //   ① realmReady：到没到这门功法的学习门槛 —— 唯一的硬门槛，没到就开不了练；
  //   ② realmAbove：超没超过「可修上限」 —— 只让这一局更费气，不影响能不能练。
  // 合成一个 realmOk 就会让「金丹期练不了黄阶」这种误判从页面层冒出来（金丹 3 > 黄阶上限 2）。
  const realmReady = realmNow >= tier.needRealm;
  const realmAbove = realmNow > tier.maxRealm;

  // 没到门槛是硬门槛：这一门修不动，连开局都不该给。
  // 「未到门槛」与「超上限」是两件事，不能合成一个布尔：前者禁练，后者只加价 ×1.5。
  // 页面早就按 realmReady 挡住入口了，这里是存档层的双保险（改存档 / 双页面同时开局）。
  if (!realmReady) {
    return {
      ok: false,
      msg: '境界未到：这门要「' + needRealmName + '」才修得动',
      realmReady: false,
      needRealmName: needRealmName,
    };
  }

  // 段位与耗气都跟着「打的是第几关」走——关号是唯一入口，不再有第二个可选项。
  const stageIdx = levelData.stageOfLevel(playedNo);
  const stage = practiceData.STAGES[stageIdx];
  // 「回关」= 打的不是本门当前关。回关不推进度，但耗气按本段基数照算，
  // 不能因为回关就便宜——否则「回关练手感」会变成省气的聪明选择。
  const belowCap = playedNo < curNo;

  // 一局要烧多少灵力：难度档 × 时长系数 × 品阶 × 境界超限 × 心法省气 ÷ 悟性 ÷ 换门。
  // 系数全在 data/economy.js 一处算，页面只显示结果，不在页面上再推一遍。
  const qiCost = economyData.practiceQiCost({
    stageIndex: stageIdx,
    tierKey: tier.key,
    methodBase: method.base,
    realmAbove: realmAbove,
    qiSave: qiSave,
    wu: attrs.wu || 0,
    cross: cross,
  });
  // 灵力不足就不让开这一局：与其打完再告诉玩家「其实你没气」，不如起手就拦住。
  // 页面已经用 practiceCostOf() 预判过一次，这里是存档层的双保险——
  // 存档被改、或两个页面同时开局，都能被它挡回去。
  if (state.resources.qi < qiCost) {
    const cap = qiCap(state);
    return {
      ok: false,
      msg: '灵力不足：本局要 ' + qiCost + ' 点，你只有 ' + state.resources.qi + ' 点（上限 ' + cap + '）',
      qiCost: qiCost,
      qi: state.resources.qi,
      qiCap: cap,
      lackQi: qiCost - state.resources.qi,
    };
  }

  // 局内得分第一次真正进入养成：记住本门最佳，给重复参悟一个可追的目标。
  if (!state.records) state.records = {};
  const score = Math.max(0, Math.floor(num(opts.score, 0)));
  const prev = state.records[skillId];
  const prevBest = prev ? Math.floor(num(prev.score, 0)) : 0;
  // 失败这一局不立纪录：没走完的成绩不构成「本门最佳」，
  // 否则第一局崩掉就会在准备页留下「本门最佳 0 分 · 失败」，玩家会以为这就是他的水平。
  const newRecord = score > prevBest && grade !== 'F';
  if (newRecord) state.records[skillId] = { score: score, grade: grade, at: Date.now() };
  else if (!prev && grade !== 'F') state.records[skillId] = { score: 0, grade: grade, at: Date.now() };
  const bestScore = Math.max(prevBest, score);

  state.lastPractice = { skillId: skillId, at: Date.now() };
  // 「最近练过的在前」要的是每一门自己的钟，不能只记最后一次：
  // 只记 state.lastPractice 的话，换到第二门再换回来，第一门的时间就丢了。
  // 失败也记——玩家确实练了这一局，顺序上该往前排。
  touchSkill(state, skillId);
  if (cross) state.stats.comboCount += 1;

  // 走通本门当前关才推进：失败不推、回关不推、没做成目标不推、走完 1000 关不推。一局只推一关。
  // 「一局一关」是这条成长线的地基：推得动就一定有收获，推不动就一定有原因（写在日志里）。
  const goalMissed = !!opts.goalMissed;
  const advanced = !wiped && !goalMissed && playedNo === curNo && cleared < levelData.LEVEL_MAX;
  if (advanced) rec.cleared = cleared + 1;
  const afterCleared = rec.cleared;
  const beforeStage = levelData.stageIndexOfCleared(cleared);
  const afterStage = levelData.stageIndexOfCleared(afterCleared);
  const promoted = afterStage > beforeStage;

  // 运功的代价：灵力在起手时就烧掉了，失败也不退——这才是「失败」真正的分量。
  // 参悟不再产灵力灵石：灵力的来路是闭关、份例与灵石兑换，灵石的来路只有对战。这一局只换一关。
  state.resources.qi -= qiCost;

  if (!wiped) {
    const newMult = grade === 'S' ? 1.8 : grade === 'A' ? 1.5 : grade === 'B' ? 1.25 : 1.1;
    const until = Date.now() + 30 * 60 * 1000;
    const cur = state.buff || { multiplier: 1, until: 0 };
    if (cur.until > Date.now() && cur.multiplier > newMult) {
      state.buff = { multiplier: cur.multiplier, until: Math.max(cur.until, until) };
    } else {
      state.buff = { multiplier: newMult, until: until };
    }
  }

  state.stats.practiceCount += 1;
  if (grade === 'S') state.stats.gradeS += 1;
  state.daily.count += 1;
  const afterTier = tierIndexOfCleared(rec.cleared);
  const tierUp = afterTier > beforeTier;
  if (tierUp) state.stats.tierUps += (afterTier - beforeTier);
  // 日志一句话说清这一局的结果。不写「进度 +N」——进度就是一关，没有可加的分数；
  // 晋档与没晋档要给两种说法，否则玩家会分不清「走了但没升」和「根本没走」。
  if (advanced && tierUp) {
    addLog(state, skill.name + ' 走通第 ' + rec.cleared + ' 关，入「' + worldData.TIERS[afterTier].name + '」', 'stage');
  } else if (advanced) {
    addLog(state, skill.name + ' 走通第 ' + rec.cleared + ' 关（灵力 −' + qiCost + '）', 'practice');
  } else if (goalMissed) {
    addLog(state, '参悟 ' + skill.name + '，目标未达成，这一关还没通', 'practice');
  } else if (wiped) {
    // 不能说「进度 +0」：玩家会以为是自己眼睛看错了，而不是这一局作废。
    addLog(state, '参悟 ' + skill.name + ' 失败，本局无所得', 'practice');
  } else if (belowCap) {
    addLog(state, '参悟 ' + skill.name + ' 第 ' + playedNo + ' 关（回关，不推进度）', 'practice');
  } else {
    // 走完 1000 关还会来练：这不是错，是「这门已经到顶了」。
    addLog(state, skill.name + ' 已走通全部 ' + levelData.LEVEL_MAX + ' 关，本局只记战绩', 'practice');
  }

  // 机缘：只在石阶上拾得残卷，**不给灵力也不给灵石**。
  // 参悟是纯支出——灵力只从闭关与份例来、灵石只从切磋与秘境来。参悟里再冒出一笔资源，
  // 等于给「练功」开了第二条印钞线，玩家又会回到「一直练、资源自己涨」的老路上。
  // 失败不触发，没做成目标也不触发：整局没走通还能拾到残卷，等于「没过」只是句空话。
  let fortune = null;
  if (!wiped && !goalMissed) {
    const locked = [];
    for (let i = 0; i < skillData.SKILLS.length; i += 1) {
      const s = skillData.SKILLS[i];
      if (!state.skills[s.id].unlocked) locked.push(s);
    }
    if (locked.length > 0 && Math.random() < economyData.FORTUNE_SCROLL_RATE) {
      const pick = locked[Math.floor(Math.random() * locked.length)];
      state.skills[pick.id].unlocked = true;
      fortune = { type: 'skill', text: '机缘：石阶上拾得残卷《' + pick.name + '》', name: pick.name };
      addLog(state, fortune.text, 'fortune');
    }
  }

  return {
    ok: true,
    grade: grade,
    // 关卡只有一条线，所以只有一套关号：第 800 关就是第 800 关。
    level: playedNo,
    levelTotal: levelData.LEVEL_MAX,
    levelWasCurrent: playedNo >= curNo,
    // 本局是否真的往前走了一关：失败、回关、1000 关走完都是 false。
    advanced: advanced,
    // 这一局有没有跨段（走通段界关）。段位由已走通关数算，玩家看得见的那一刻就是它。
    // 跨段：走通段界关那一刻由 false 变 true。stageName 报的是「刚打的那一关属于哪一段」，
    // stageAfterName 是「这一局之后是不是换段了」，两者不能混用一个字段。
    promoted: promoted,
    stageAfterName: levelData.stageNameOfCleared(afterCleared),
    stageBeforeName: levelData.stageNameOfCleared(cleared),
    // 失败＝作废：页面据此把结果行显示成「这一局什么都没得到」。
    wiped: wiped,
    // 没做成目标：进度不推，但也不判失败——页面要单独写一行，不然玩家以为关卡卡住了。
    goalMissed: goalMissed,
    gradeTitle: copy.GRADE_TITLE[grade] || '粗浅',
    gradeColor: worldData.GRADE_COLOR[grade] || '#8a8f83',
    skillName: skill.name,
    methodName: method.name,
    // 功法的进度：这一局前后各走通了几关。页面用这两个数算进度条与「+1」。
    clearedBefore: cleared,
    clearedAfter: afterCleared,
    // 这一局烧掉的灵力：失败也照扣（起手就烧了），与走没走通是两条独立的数。
    qiCost: qiCost,
    qiBefore: state.resources.qi + qiCost,
    qiAfter: state.resources.qi,
    qiMax: qiCap(state),
    qiSave: qiSave,
    // 本局耗气的三个可见修正：时长系数（这一门盘面多长）、品阶、是否超上限。
    methodQiFactor: Math.round(economyData.methodQiFactor(method.base) * 100) / 100,
    tierQiCost: tier.qiCost,
    // 战力在这一局前后的值：没跨档就是相等的，不是算错。
    powerBefore: powerBefore,
    powerAfter: powerDetail(state).total,
    tierBefore: beforeTier,
    tierAfter: afterTier,
    tierUp: tierUp,
    tierName: worldData.TIERS[afterTier].name,
    cross: cross,
    // 品阶、段位、境界现在都只影响「一局烧多少气」。
    tierKey: tier.key,
    tierLabel: tier.label,
    tierColor: tier.color,
    stageKey: stage.key,
    stageName: stage.name,
    // 本门当前关与本局打的关：回关时进度不推，结算要如实报出退了几关。
    curLevel: curNo,
    levelGap: curNo - playedNo,
    levelBelowCap: belowCap,
    levelFellBack: levelFellBack,
    // 境界超限只加耗气，不禁练：结算说的是「这局更贵」，不是「练不了」。
    realmOverCost: realmAbove ? economyData.REALM_OVER : 1,
    realmReady: realmReady,
    realmAbove: realmAbove,
    realmReason: realmAbove ? '已超「' + maxRealmName + '」上限' : (realmReady ? '' : '未到「' + needRealmName + '」门槛'),
    maxRealmName: maxRealmName,
    needRealmName: needRealmName,
    gradeFactor: factor,
    newRecord: newRecord,
    bestScore: bestScore,
    prevBest: prevBest,
    buffMultiplier: state.buff.multiplier,
    fortune: fortune,
    newTitles: checkTitles(state),
    dailyReady: state.daily.count >= w.daily.target && !state.daily.claimed,
  };
}

// 这一局要烧多少灵力：准备页在开局前显示它，与 applyPractice 内部用的是同一个函数，
// 不在这儿另写一遍系数（两处一漂，玩家就会看到「面板写 17、结算扣 24」）。
//
// 参数是「这一局打第几关」：耗气只由本关所在的段决定，段内第几关不影响价格。
// 段由关号反推一次，页面不许自己先换算好再传（那正是两处一漂的入口）。
function practiceCostOf(state, skillId, level) {
  const skill = skillData.getSkill(skillId);
  if (!skill) return 0;
  const tier = practiceData.tierOf(skill.tier);
  const realmNow = state.realmIndex + 1;
  const attrs = computeAttributes(state);
  // 没传关号就按存档里「本门当前关」——默认值与页面默认选中的关一致，不会报出两个价。
  const lv = num(level, practiceData.curLevelOf(state.skills[skillId]));
  return economyData.practiceQiCost({
    stageIndex: levelData.stageOfLevel(levelData.clampLevel(lv)),
    tierKey: tier.key,
    methodBase: practiceData.getMethod(skill.method).base,
    realmAbove: realmNow > tier.maxRealm,
    qiSave: effectValue(state, 'qiSave'),
    wu: attrs.wu || 0,
    cross: !!state.lastPractice.skillId && state.lastPractice.skillId !== skillId,
  });
}

module.exports = {
  applyPractice: applyPractice,
  practiceCostOf: practiceCostOf,
};
