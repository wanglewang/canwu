'use strict';

// 参悟结算：耗气、评级落账、回关折减、连 S
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。

const { copy, economyData, levelData, practiceData, skillData, worldData } = require('./base.js');
const { checkTitles, computeAttributes, effectValue, powerDetail, qiCap, tierIndex } = require('./profs.js');
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
  // 关卡决定这一局的参数与回关折减——「刷最低关」那条老最优解就是从这里堵掉的
  // （见 practice.profByLevel）。熟练度本身仍只看评级与连 S，关卡不改变公式，只改变折减。
  // 段位不再由熟练度定、也不再由玩家挑：它只是「已走通几关」的另一个说法。
  const cleared = practiceData.clearedOf(rec);
  // 本门当前关 = 已通 + 1；走通 1000 关后停在 1000（重打不推进，也不越界）。
  const curNo = practiceData.curLevelOf(rec);
  const wantNo = Math.max(1, Math.round(num(opts.level, curNo)));
  // 只能往回打，不能往上挑：打的是哪一关由进度决定，不是由参数决定。
  const levelFellBack = wantNo > curNo;
  const playedNo = Math.min(curNo, wantNo);
  const beforeTier = tierIndex(rec.prof);
  const profBefore = rec.prof;
  // 战力是阶梯值：属性 = 功法条目 × 段位系数，段位不跳战力就不动。
  // 先记下开场值，结算时才能如实说「这一局涨了没有」，而不是含糊带过。
  const powerBefore = powerDetail(state).total;

  // 失败（F）是「这一局作废」，不是「最低一档」：倍率 0，整局不给任何东西。
  // 注意倍率为 0 时不能用 `||` 兜底——0 会被当成「没配」，静默落回 0.6。
  const rawFactor = worldData.GRADE_FACTOR[grade];
  const factor = typeof rawFactor === 'number' ? rawFactor : 0.6;
  const wiped = factor === 0;
  const attrs = computeAttributes(state);
  // 心法省的「气」：澄心 / 勘禁 / 太虚 / 并蒂 / 九宫 / 让路六门累加，封顶一半。
  // 它不再是「参悟收益 +X%」——熟练度不许有倍率，收益位换成了成本位。
  const qiSave = effectValue(state, 'qiSave');

  // 只奖不罚：同一门连练不再递减。攒「连 S 倍率」本来就要连练同一门，
  // 若同时扣收益，等于在最该上瘾的临门一脚反着来。多样化靠换门的正激励，不靠惩罚专精。
  const cross = !!state.lastPractice.skillId && state.lastPractice.skillId !== skillId;

  // 一个维度只管一件事：难度档管局内参数与耗气基数、评级管这一局打得好不好、
  // 境界管耗气有没有超限、品阶管运功消耗与属性系数。
  // 品阶不进熟练度公式——「高级功法练得更快」会让低阶功法从成长线上被直接淘汰，
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
  // 回关折减：本关 ÷ 当前关（见 practice.profByLevel）。
  // 耗气不跟着折——回关按本关所在段的基数照算，再折会让「回关刷分」变成省气的聪明选择。
  const lowFactor = practiceData.levelFactor(playedNo, curNo);
  // 「回关」= 打的不是本门当前关。不叠连 S、基础分按关折。
  const belowCap = playedNo < curNo;

  // 连 S 与回关完全解耦：只有本门当前关的 S 才叠层，本局按 34 × 1.5^(层数-1) 独立取整；
  // 回关局不叠层、不砍连击收益、层数原样保留；失败（F）一律断连。
  // 到 PROF_MAX 后熟练度封顶，但层数与纪录照常、灵力照扣：火候封顶是数值毕业，不是不许再练。
  if (!state.sCombo) state.sCombo = {};
  const comboBefore = Math.min(worldData.COMBO_MAX, Math.floor(num(state.sCombo[skillId], 0)));
  let comboNow = comboBefore;
  let comboGainNow = 0;
  let rawGain = 0;
  if (wiped) {
    comboNow = 0;
  } else if (belowCap) {
    // 回关：只给基础分，按「本关 ÷ 当前关」折一次、四舍五入一次，
    // 玩家按「34 × 400 ÷ 800 = 17」能复算。不再有「低档再折半」那道刀：
    // 关卡只剩一条线，没有「打低档」这个动作了。
    rawGain = practiceData.profByLevel(worldData.PROF_BASE[grade] || 0, playedNo, curNo);
  } else if (grade === 'S') {
    comboNow = Math.min(worldData.COMBO_MAX, comboBefore + 1);
    comboGainNow = worldData.comboGain(comboNow);
    rawGain = comboGainNow;
  } else {
    // C / B / A 是固定基础值，不叠层且断连。
    comboNow = 0;
    rawGain = worldData.PROF_BASE[grade] || 0;
  }
  const gain = Math.min(rawGain, Math.max(0, worldData.PROF_MAX - rec.prof));
  state.sCombo[skillId] = comboNow;

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

  // 三连 S 晋级已取消：火候不再被「补额」跳过，只由上面这一局的实得点数一格格涨。
  rec.prof += gain;

  // 做成目标才算走通。三连互换的终点是「做成即收工」，时辰走到头还没做成就是这一关没过：
  // 熟练度照给（参悟只换熟练度，练过的功夫不会白练），但进度不推。
  // 不报 F 是有意的：F 是「一局打崩」，没做完目标不是打崩，判成 F 会让玩家以为整局白打。
  const goalMissed = !!opts.goalMissed;
  // 走通本门当前关才推进：失败不推、回关不推、没做成目标不推、走完 1000 关不推。一局只推一关。
  const advanced = !wiped && !goalMissed && playedNo === curNo && cleared < levelData.LEVEL_MAX;
  if (advanced) rec.cleared = cleared + 1;
  const stageBefore = levelData.stageIndexOfCleared(cleared);
  const stageAfter = levelData.stageIndexOfCleared(cleared + (advanced ? 1 : 0));
  const promoted = stageAfter > stageBefore;

  // 运功的代价：灵力在起手时就烧掉了，失败也不退——这才是「失败」真正的分量。
  // 参悟不再产灵力灵石：灵力的来路是闭关、份例与灵石兑换，灵石的来路只有对战。这一局只换熟练度。
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
  const afterTier = tierIndex(rec.prof);
  if (afterTier > beforeTier) {
    state.stats.tierUps += (afterTier - beforeTier);
    addLog(state, skill.name + ' 参悟至「' + worldData.TIERS[afterTier].name + '」', 'tier');
  } else if (goalMissed) {
    addLog(state, '参悟 ' + skill.name + '，目标未达成，这一关还没通（熟练度 +' + gain + '）', 'practice');
  } else if (wiped) {
    // 不能说「熟练度 +0」：玩家会以为是自己眼睛看错了，而不是这一局作废。
    addLog(state, '参悟 ' + skill.name + ' 失败，本局无所得', 'practice');
  } else if (gain === 0 && rec.prof >= worldData.PROF_MAX) {
    // 到顶后不许写「熟练度 +0」，那读起来像 bug。
    addLog(state, '参悟 ' + skill.name + '，熟练度已圆满，本局只记战绩', 'practice');
  } else {
    addLog(state, '参悟 ' + skill.name + '，熟练度 +' + gain + '（灵力 −' + qiCost + '）', 'practice');
  }
  // 晋段最后记，让它排在日志最上面：这是这一局最该被看见的一刻
  //（盘面换了、耗气涨了、段名变了）。以前它只在结算 notes 里一闪而过、日志里没有，
  // 玩家过后翻不到「我什么时候进的小成」。放在熟练度记录之后才不会被那行压下去。
  if (promoted && levelData.STAGES[stageAfter]) {
    // 走通第 1000 关时 stageAfter 会指到不存在的第六段（满级没有下一段），
    // 这里只记真正存在的段名，避免写「入 undefined」。promoted 的既有语义不动。
    addLog(state, skill.name + ' 走通本段，入「' + levelData.STAGES[stageAfter].name + '」', 'stage');
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
    stageAfterName: levelData.stageNameOfCleared(cleared + (advanced ? 1 : 0)),
    stageBeforeName: levelData.stageNameOfCleared(cleared),
    // 失败＝作废：页面据此把收益行显示成「无」，而不是一排 +0。
    wiped: wiped,
    // 没做成目标：熟练度照给，但这一关不往上推。页面要单独写一行，不然玩家以为关卡卡住了。
    goalMissed: goalMissed,
    gradeTitle: copy.GRADE_TITLE[grade] || '粗浅',
    gradeColor: worldData.GRADE_COLOR[grade] || '#8a8f83',
    skillName: skill.name,
    methodName: method.name,
    gain: gain,
    // 这一局烧掉的灵力：失败也照扣（起手就烧了），所以它和 gain 是两条独立的数。
    qiCost: qiCost,
    qiBefore: state.resources.qi + qiCost,
    qiAfter: state.resources.qi,
    qiMax: qiCap(state),
    qiSave: qiSave,
    // 本局耗气的三个可见修正：时长系数（这一门盘面多长）、品阶、是否超上限。
    methodQiFactor: Math.round(economyData.methodQiFactor(method.base) * 100) / 100,
    tierQiCost: tier.qiCost,
    profBefore: profBefore,
    // 战力在这一局前后的值：没跨段位就是相等的，不是算错。
    powerBefore: powerBefore,
    powerAfter: powerDetail(state).total,
    // 连 S 回执：本局叠到第几层、这一层给了多少、下一层能给多少。
    // 三连晋级取消后，profAfter = profBefore + gain，不再有「补额」这一笔。
    comboBefore: comboBefore,
    comboNow: comboNow,
    comboMax: worldData.COMBO_MAX,
    comboGain: comboGainNow,
    comboNextGain: worldData.comboGain(comboNow + 1),
    comboCapped: comboNow >= worldData.COMBO_MAX,
    comboActive: !wiped && !belowCap && grade === 'S',
    comboTransparent: !wiped && belowCap,
    profAfter: rec.prof,
    tierBefore: beforeTier,
    tierAfter: afterTier,
    tierUp: afterTier > beforeTier,
    tierName: worldData.TIERS[afterTier].name,
    cross: cross,
    // 品阶、段位、境界现在都只影响「一局烧多少气」，不再有资源倍率这一串。
    tierKey: tier.key,
    tierLabel: tier.label,
    tierColor: tier.color,
    stageKey: stage.key,
    stageName: stage.name,
    // 本门当前关与本局打的关：回关时基础熟练度按「本关 ÷ 当前关」折、本局不叠连 S，
    // 结算要如实报出退了几关与系数。
    curLevel: curNo,
    levelGap: curNo - playedNo,
    levelBelowCap: belowCap,
    levelBelowFactor: lowFactor,
    levelFellBack: levelFellBack,
    // 境界超限只加耗气，不禁练：结算说的是「这局更贵」，不是「练不了」。
    realmOverCost: realmAbove ? economyData.REALM_OVER : 1,
    realmReady: realmReady,
    realmAbove: realmAbove,
    realmReason: realmAbove ? '已超「' + maxRealmName + '」上限' : (realmReady ? '' : '未到「' + needRealmName + '」门槛'),
    maxRealmName: maxRealmName,
    needRealmName: needRealmName,
    profGrade: rawGain,
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
