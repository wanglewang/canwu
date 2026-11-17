'use strict';

// 视图数据：给页面用的聚合读取
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。

const { copy, economyData, guideData, levelData, opponentData, practiceData, skillData, titleData, worldData } = require('./base.js');
const { moveBoard } = require('./battle.js');
const { buffInfo } = require('./idle.js');
const { computeAttributes, computeMetrics, computePower, effectScaleOf, powerDetail, qiCap, shenFloorBonus, skillPowerGain, tierIndex, tierInfo } = require('./profs.js');
const { breakthroughInfo } = require('./realm.js');
const { checkDaily, num } = require('./state.js');

// ---------------------------------------------------------------- 视图数据

// 功法图鉴的「如何习得」：把获取方式写成可执行的一条路径，而不是一句黑话。
// 列表卡片与详情弹窗共用这一份，避免两处各自拼文案。
function unlockInfo(state, skill) {
  const src = skill.source;
  const w = worldData.getWorld(state.worldId);
  const realmNow = state.realmIndex + 1;
  const realmNameOfNo = function (no) {
    return w.realms[Math.min(w.realms.length - 1, Math.max(0, no - 1))].name;
  };
  if (src.kind === 'start') {
    return { kind: 'start', label: '入门即习得', text: '开局便带在身上', hint: '', action: '', actionText: '', percent: 100 };
  }
  if (src.kind === 'shop') {
    const cost = src.cost;
    const need = Math.floor(num(cost.stone, 0));
    const lack = state.resources.stone < need ? ['灵石 ' + (need - state.resources.stone)] : [];
    const tier = practiceData.tierOf(skill.tier);
    const realmReady = realmNow >= tier.needRealm;
    const stonePct = Math.min(1, state.resources.stone / need);
    return {
      kind: 'shop',
      label: '藏经阁兑换',
      text: '灵石 ' + need,
      hint: !realmReady
        ? '需「' + realmNameOfNo(tier.needRealm) + '」境界才能修炼'
        : (lack.length ? '还差 ' + lack.join('、') : '灵石已足，随时可换'),
      action: !realmReady || lack.length ? 'home' : 'buy',
      actionText: !realmReady || lack.length ? '去攒灵石' : '兑换',
      percent: Math.round(stonePct * 100),
      enough: lack.length === 0 && realmReady,
    };
  }
  if (src.kind === 'battle') {
    const c = opponentData.getChallenge(src.opponentId);
    const cleared = state.defeated.indexOf(src.opponentId) >= 0;
    const power = computePower(state);
    return {
      kind: 'battle',
      label: '切磋首胜掉落',
      text: '首次战胜「' + (c ? c.name : '某位对手') + '」',
      hint: cleared ? '已战胜，再打一场即可取回' : (c ? '对手战力 ' + c.power + ' · 你当前 ' + power : ''),
      action: 'battle',
      actionText: '去切磋',
      percent: c ? Math.min(100, Math.round(power / c.power * 100)) : 0,
      cleared: cleared,
    };
  }
  // 机缘不可控，能做的就是「去练几局」。没有「随便练一门」的页面，
  // 所以这里指回主页：主页吸底就是「参悟 · 推荐功法」，一步进参悟页。
  return { kind: 'chance', label: '机缘可得', text: '参悟时小概率拾得残卷', hint: '多练几局，缘分到了自然来', action: 'home', actionText: '去参悟', percent: 0 };
}

function getOverview(state) {
  const w = worldData.getWorld(state.worldId);
  const pd = powerDetail(state);
  const attrs = computeAttributes(state);
  let equippedTitleName = '';
  for (let i = 0; i < titleData.TITLES.length; i += 1) {
    if (titleData.TITLES[i].id === state.equippedTitle) equippedTitleName = titleData.TITLES[i].name;
  }
  let unlockedCount = 0;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    if (state.skills[skillData.SKILLS[i].id] && state.skills[skillData.SKILLS[i].id].unlocked) unlockedCount += 1;
  }
  checkDaily(state);
  return {
    worldName: w.name,
    worldLabel: w.label,
    worldIntro: w.intro,
    roleName: state.roleName,
    portrait: state.portrait || 0,
    realmName: w.realms[state.realmIndex].name,
    realmIndex: state.realmIndex,
    realmCount: w.realms.length,
    power: pd.total,
    powerBase: pd.base,
    powerRealmBonus: Math.round(pd.realmBonus * 100),
    powerEffectBonus: Math.round(pd.effectBonus * 100),
    // 属性带 role：人物页据此写「这一项管什么」，不另写一份解释文案。
    attrs: w.attributes.map(function (a) {
      return { key: a.key, name: a.name, glyph: a.glyph, role: a.role || '', value: attrs[a.key] || 0 };
    }),
    qi: state.resources.qi,
    // 气海上限：主页、参悟页、打坐回执都取这一个数，不各自推算。
    qiMax: qiCap(state),
    qiFree: Math.max(0, qiCap(state) - state.resources.qi),
    qiFull: state.resources.qi >= qiCap(state),
    qiPerLing: economyData.QI_CAP_PER_LING,
    // 身法换来的波动下限，人物页可以直接写「切磋保底 X% 战力」。
    shenFloor: Math.round(shenFloorBonus(state) * 100),
    stone: state.resources.stone,
    // 今日已战几场：切磋灵石按 0.85^(n-1) 衰减，页面要能显示「这一场还能拿多少」。
    battleWins: Math.floor(num(state.daily && state.daily.battleWins, 0)),
    battleQi: economyData.BATTLE_QI,
    resource: w.resource,
    currency: w.currency,
    buff: buffInfo(state),
    unlockedCount: unlockedCount,
    skillTotal: skillData.SKILLS.length,
    equippedTitleName: equippedTitleName || '无名散修',
    titlesCount: state.titles.length,
    titlesTotal: titleData.TITLES.length,
    practiceCount: state.stats.practiceCount,
    wins: state.stats.wins,
    daily: {
      count: Math.min(state.daily.count, w.daily.target),
      target: w.daily.target,
      claimed: state.daily.claimed,
      qi: w.daily.qi,
      stone: w.daily.stone,
    },
    breakthrough: breakthroughInfo(state),
    log: state.log.slice(0, 5),
  };
}

function bonusText(skill, worldId) {
  const w = worldData.getWorld(worldId);
  const parts = [];
  for (let i = 0; i < w.attributes.length; i += 1) {
    const a = w.attributes[i];
    if (skill.bonus[a.key]) parts.push(a.name + ' +' + skill.bonus[a.key]);
  }
  return parts.join(' · ');
}

function sourceText(skill) {
  const src = skill.source;
  if (src.kind === 'start') return '入门即习得';
  if (src.kind === 'shop') return '藏经阁：灵石 ' + Math.floor(num(src.cost.stone, 0));
  if (src.kind === 'battle') {
    const c = opponentData.getChallenge(src.opponentId);
    return '首胜 ' + (c ? c.name : '某位对手') + ' 掉落';
  }
  return '机缘可得';
}

function starsTextOf(stars) {
  let s = '';
  for (let i = 0; i < 4; i += 1) s += i < stars ? '★' : '☆';
  return s;
}

function realmNameOf(state, realmNo) {
  const realms = worldData.getWorld(state.worldId).realms;
  return realms[Math.min(realms.length - 1, Math.max(0, realmNo - 1))].name;
}

// 「这一门被碰过了」：只写 lastAt，一个数值都不动。
//
// 单独成一个函数，是因为**有一批确实打过的局不走 applyPractice**：
// 中途结束（本局作废、不计所得）、局中切页或返回（那一盘直接丢掉）。
// 2026-11 真机反馈就在这里翻车——玩家打完一局点了结束再回去，列表纹丝不动，
// 因为那条路只断了连 S，没写钟；而 applyPractice 里的注释早写着「失败也记」。
// **「不计所得」管的是数值，不管顺序**：认真打了一段就该往前排，跟给不给分是两件事。
function touchSkill(state, skillId) {
  const rec = state && state.skills ? state.skills[skillId] : null;
  if (!rec) return false;
  rec.lastAt = Date.now();
  return true;
}

// 功法页「已持玉简」的顺序：最近练过的在前 → 熟练度降序 → 正名。
//
// **三级缺一不可，第二级是实战补的。** 第一版只有「时间 → 正名」两级，
// 上线后真机截图里 14 门严格按码点排（4e00 / 4e07 / 4e09 / 4e5d / 540c …），
// 因为那份存档的 `lastAt` 与 `records.at` 都是 0——两级排序每次都落到字典序。
// 字典序是最没有信息量的顺序：玩家看到的结论是「你改了，但跟没改一样」。
// 熟练度是存档里唯一还带着「我投入了多少」的量，拿它兜底最差也比字典序有道理。
//
// 放在引擎里而不是页面里，是为了能被断言直接跑：静态匹配只能证明「写了这一行」，
// 证明不了「全 0 存档排出来的顺序不是字典序」。`tests/rank.test.js` 跑的就是后者。
function orderLearned(a, b) {
  if (a.lastAt !== b.lastAt) return b.lastAt - a.lastAt;
  if (a.prof !== b.prof) return b.prof - a.prof;
  const ka = a.name.split(skillData.NAME_RULE.sep)[1] || a.name;
  const kb = b.name.split(skillData.NAME_RULE.sep)[1] || b.name;
  return ka < kb ? -1 : (ka > kb ? 1 : 0);
}

// 「这一门走到哪一段、走通了几关」只有这一个算法，功法列表与人物页共用。
// 两处各算一套的后果 2026-11 真机见过一次：getTopSkills 只回 name/prof/tierName，
// 人物页照着功法列表的字段名去读，整行变成「吐纳周天诀 · undefined · 已走通 undefined / undefined 关」。
function stageOfRec(rec) {
  const cleared = practiceData.clearedOf(rec);
  const stage = practiceData.STAGES[
    Math.min(practiceData.STAGES.length - 1, levelData.stageIndexOfCleared(cleared))
  ];
  return { cleared: cleared, stage: stage, total: levelData.LEVEL_MAX };
}

function getSkillList(state) {
  const list = [];
  const realmNow = state.realmIndex + 1;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id] || { unlocked: false, prof: 0 };
    const info = tierInfo(rec.prof);
    const method = practiceData.getMethod(s.method);
    const tier = practiceData.tierOf(s.tier);
    const stage = stageOfRec(rec);
    const clearedNow = stage.cleared;
    const stageNow = stage.stage;
    // 与 applyPractice 同一根尺子：门槛决定「能不能开练」，上限只决定「收益衰不衰减」。
    // 金丹期（3）看黄阶（上限 2）是「能练但更费气」，不是「练不了」。
    const realmReady = realmNow >= tier.needRealm;
    const realmAbove = realmNow > tier.maxRealm;
    const decayed = !realmReady || realmAbove;
    const best = state.records ? state.records[s.id] : null;
    const guide = guideData.guideOf(method.game);
    const unlock = unlockInfo(state, s);
    list.push({
      id: s.id,
      name: s.name,
      type: s.type,
      kind: s.kind,
      desc: s.desc,
      flavor: s.flavor,
      unlocked: rec.unlocked,
      prof: rec.prof,
      // 功法页「最近练过的在前」用它排序；0 表示从没练过，页面自己决定垫哪。
      // 老存档在 2026-11 之前没有这个字段，退回「本门最佳成绩的时间」——
      // 那只在破纪录时写，比真时间旧一点，但足够让老玩家一进来就按熟悉度排上，
      // 而不是整张表全 0 一起退化成按门名。
      lastAt: Math.floor(num(rec.lastAt, 0)) || (best && best.at ? Math.floor(num(best.at, 0)) : 0),
      methodName: method.name,
      methodTip: method.tip,
      methodDesc: method.desc,
      gameId: method.game,
      gameName: method.gameName,
      // 图鉴：未习得也能看的一句话玩法、盘面速记与习得路径。
      previewGoal: guide ? guide.goal : method.desc,
      previewInline: guide ? guide.inline : '',
      unlock: unlock,
      sourceKind: s.source.kind,
      // 品阶（天地玄黄）：只管运功耗气、属性加成与可修上限。
      tierKey: tier.key,
      tierName: tier.name,
      tierLabel: tier.label,
      tierColor: tier.color,
      tierStars: tier.stars,
      starsText: starsTextOf(tier.stars),
      tierDesc: tier.desc,
      tierQiCost: tier.qiCost,
      rewardText: '耗气 ×' + tier.qiCost.toFixed(2),
      // 可修境界：超上限只能更费气（×1.5），熟练度照涨、练照样能练。
      // realmReady 才是「能不能修习」；页面不许拿 decayed 去当门槛用。
      maxRealm: tier.maxRealm,
      maxRealmName: realmNameOf(state, tier.maxRealm),
      decayed: decayed,
      decayText: decayed ? copy.decayText(
        realmReady ? 'above' : 'below',
        realmNameOf(state, realmReady ? tier.maxRealm : tier.needRealm)
      ) : '',
      needRealm: tier.needRealm,
      needRealmName: realmNameOf(state, tier.needRealm),
      realmReady: realmReady,
      realmAbove: realmAbove,
      // 段位：只看走通了几关（十关一组往上走，走通段界关即入下一段），与品阶、熟练度都无关。
      stageName: stageNow.name,
      stageLevel: clearedNow,
      levelTotal: levelData.LEVEL_MAX,
      // 这张卡片要说的是「练到哪一段、已经走通几关、这一段大概烧多少气」——段早就不给倍率了。
      stageQi: stageNow.qi,
      // 写「已走通 N」而不是「第 N 关」：N 是已走通数，写成「第 0 关」玩家会当成 bug。
      stageText: '「' + stageNow.name + '」已走通 ' + clearedNow + ' / ' + levelData.LEVEL_MAX
        + ' 关 · 基础耗气 ' + stageNow.qi,
      bestText: best ? best.score + ' 分 · ' + best.grade + ' 档' : '',
      // 连 S 层数：功法页与准备页都能直接显示「下一局 S 值多少点」。
      sCombo: comboOf(state, s.id),
      sComboMax: worldData.COMBO_MAX,
      comboNextGain: worldData.comboGain(comboOf(state, s.id) + 1),
      tierIndex: info.index,
      profTierName: info.name,
      profTierColor: info.color,
      profTierDesc: info.desc,
      percent: info.percent,
      nextName: info.nextName,
      nextThreshold: info.nextThreshold,
      maxed: info.maxed,
      bonusText: bonusText(s, state.worldId),
      // 这一门再涨一段，战力多几点。破境门槛读的是战力，功法卡写的却是「体魄 +0.8」，
      // 中间这次换算没人算给玩家——列表里补上这个数，「练哪门」才不是瞎猜。
      // 未习得与已大圆满都是 0：前者还不知道自己有多少，后者已经练到头。
      powerGain: rec.unlocked ? skillPowerGain(state, s.id) : 0,
      effectText: s.effect.text,
      // 特效按段位兑现（0 / 25% / 50% / 75% / 100%），不再是「到大成才有」。
      effectScale: effectScaleOf(rec.prof),
      effectPercent: Math.round(effectScaleOf(rec.prof) * 100),
      effectUnlocked: rec.unlocked && effectScaleOf(rec.prof) > 0,
      sourceText: sourceText(s),
      canBuy: !rec.unlocked && s.source.kind === 'shop',
      cost: s.source.cost || null,
    });
  }
  return list;
}

// 特效当前发挥到几成：图鉴与详情弹窗共用这一句，不各写一遍。
// 说法要跟「按段位兑现」对齐，不能再说「练到大成才有」——那已经是旧规则。
function effectNoteOf(detail) {
  if (!detail) return '';
  // 特效按**火候**兑现（EFFECT_TIER_SCALE 的下标就是火候档），不是按关卡段位。
  // 这两句原来说的是「入门 25% → 圆满 100%」——那是段位名，且「入门」在火候里不存在。
  if (!detail.unlocked) return '习得后按火候逐级发挥：初窥 25% → 通玄满额';
  const pct = detail.effectPercent || 0;
  if (pct <= 0) return '火候尚在生涩 · 练到初窥即开始发挥';
  if (pct >= 100) return '已满额发挥';
  return detail.profTierName + ' · 已发挥 ' + pct + '%';
}

// 练成之后：所得逐条写清「是什么、现在给多少」。
// 灵力上限这一行只在功法真的加真元时出现——多数功法的 bonus 不含 ling，
// 硬塞一行「+0」只会让「这门练了有什么用」更难回答。
function gainLinesOf(state, skill, detail) {
  const tier = practiceData.tierOf(skill.tier);
  const rec = state.skills[skill.id];
  const mul = worldData.TIERS[tierIndex(rec ? rec.prof : 0)].bonus * tier.attr;
  // 顺序就是「练了得什么」的优先级：属性 → 本门特效 → 代价 → 气海。
  // 准备页只取前两行，所以前两行必须是「所得」，而不是「代价」。
  const lines = [
    { label: '属性加成', value: detail.bonusText, note: '习得即有，随段位与品阶增长' },
    { label: '本门特效', value: detail.effectText, note: effectNoteOf(detail) },
    { label: '运功耗气', value: detail.rewardText, note: detail.maxRealmName + '以内不加价' },
  ];
  const ling = (skill.bonus && skill.bonus.ling) || 0;
  if (ling > 0) {
    lines.push({
      label: '灵力上限',
      value: '+' + Math.round(ling * mul * economyData.QI_CAP_PER_LING),
      note: '真元每点换 ' + economyData.QI_CAP_PER_LING + ' 点气海',
    });
  }
  return lines;
}

// 功法图鉴详情：未习得也返回完整内容，锁的只有「能不能开练」。
// 规则、盘面符号、阶段新法、练成收益、习得路径一律可读 —— 看得见才有想解开的理由。
// 页面不自己拼这些文案，避免功法页与准备页各写一份、越改越散。
function getSkillDetail(state, id) {
  const list = getSkillList(state);
  let base = null;
  for (let i = 0; i < list.length; i += 1) if (list[i].id === id) base = list[i];
  if (!base) return null;
  const s = skillData.getSkill(id);
  const method = practiceData.getMethod(s.method);
  const guide = guideData.guideOf(method.game);

  const stageRules = practiceData.stageRulesOf(method.id).map(function (r) {
    return { name: r.name, desc: r.desc, atName: worldData.TIERS[r.at].name };
  });
  let statusText = '';
  if (base.unlocked) statusText = '已习得';
  else if (base.unlock.kind === 'shop') statusText = '藏经阁可换';
  else if (base.unlock.kind === 'battle') statusText = '切磋首胜可得';
  else statusText = base.unlock.label;

  return Object.assign({}, base, {
    statusText: statusText,
    previewRule: guide ? guide.goal : method.desc,
    guide: guide ? {
      goal: guide.goal,
      inline: guide.inline,
      steps: guide.steps.slice(),
      terms: guide.terms.map(function (t) { return { name: t.name, desc: t.desc }; }),
      scoring: guide.scoring,
      tip: guide.tip,
    } : null,
    stageRules: stageRules,
    // 未习得时不把特效写灰了事，而是说清什么时候生效。
    effectNote: effectNoteOf(base),
    gainLines: gainLinesOf(state, s, base),
  });
}

// 推荐排序口径：不看品阶也不看熟练度绝对值，看「离下一个阶段还有多远」，
// 并按阶段跨度归一，免得高熟练度功法永远霸榜；已达可修上限的往后压，已圆满的再往后。
// 主页的「今日之课」与功法页的默认排序共用这一份，不各写一套规则。
function recommendScore(s) {
  const floor = worldData.TIERS[s.tierIndex] ? worldData.TIERS[s.tierIndex].threshold : 0;
  const span = Math.max(1, s.nextThreshold - floor);
  const ratio = Math.max(0, s.nextThreshold - s.prof) / span;
  // 三段分明：按标价练的在前，境界超上限（耗气 ×1.5）的整段压后，已圆满的最后。
  // 列表不隐藏任何一门，只靠分段表达「现在该练谁」；主页推荐再从第一段里挑一个。
  const bias = (s.decayed ? 1 : 0) - (s.prof === 0 ? 0.05 : 0) + (s.maxed ? 2 : 0);
  return { ratio: ratio, score: ratio + bias };
}

// 修炼建议：首页只回答一个问题——现在练哪门、为什么、下一步是什么。
function recommend(state) {
  const list = getSkillList(state);
  const pool = list.filter(function (s) { return s.unlocked; });
  // 能开练就算可用：超过上限只是收益打折，不能因此把它从「今天练哪门」里剔除，
  // 否则金丹期没换到地阶时，手上那一批黄阶会被整批滤掉、首页推不出任何一门。
  const usable = pool.filter(function (s) { return !s.maxed && s.realmReady; });
  const cand = usable.length ? usable : pool.filter(function (s) { return !s.maxed; });

  let pick = null;
  for (let i = 0; i < cand.length; i += 1) {
    const s = cand[i];
    const scored = recommendScore(s);
    if (!pick || scored.score < pick.score) pick = { skill: s, score: scored.score, ratio: scored.ratio };
  }

  if (!pick) {
    // 不写死门数：加一门功法就要回来改一次文案，等于给下次漏改埋雷。
    return {
      id: '', name: '诸门皆已圆满', methodName: '本门无新课',
      profTierName: '大圆满', profTierColor: worldData.TIERS[worldData.TIERS.length - 1].color,
      gap: 0, percent: 100, maxed: true,
      reason: '手上的 ' + skillData.SKILLS.length + ' 门功法都练到了大圆满',
      next: '去仙门切磋找还没首胜的对手，或去秘境探索攒兑换用的灵石。',
    };
  }

  const s = pick.skill;
  const gap = Math.max(0, s.nextThreshold - s.prof);
  // 段位不再靠熟练度解锁，所以「下一段」的提示不能说「练到 300 分解锁」。
  // 改成报本段还剩几关：那是玩家下一步真要做的事，而且他点上就能看见。
  const recNow = state.skills[s.id] || {};
  const clearedNow = practiceData.clearedOf(recNow);
  const curStageIdx = Math.min(practiceData.STAGES.length - 1, levelData.stageIndexOfCleared(clearedNow));
  const curStage = practiceData.STAGES[curStageIdx];
  const left = Math.max(0, curStage.to - clearedNow);
  let next;
  if (s.decayed) next = s.decayText + '，这门先放一放。';
  else if (clearedNow >= levelData.LEVEL_MAX) next = '本门 1000 关已走完，练的是手上的稳。';
  else next = '「' + curStage.name + '」还剩 ' + left + ' 关，走通第 ' + curStage.to + ' 关即入下一段。';

  return {
    id: s.id,
    name: s.name,
    methodName: s.methodName,
    profTierName: s.profTierName,
    profTierColor: s.profTierColor,
    gap: gap,
    percent: Math.round((1 - pick.ratio) * 100),
    maxed: false,
    reason: '距「' + s.nextName + '」还差 ' + gap + ' 熟练度',
    next: next,
  };
}

// 按类型组装游戏族：同族共用一套手感内核，族内按品阶由低到高排成变体链。
// 四个品阶刻度全列出来，缺变体的档位显示空档，族内的断层一眼可见。
function getFamilies(state) {
  const chains = skillData.chainsOf();
  const tiers = practiceData.TIERS;
  const out = [];
  for (let i = 0; i < chains.length; i += 1) {
    const c = chains[i];
    const fam = practiceData.familyOf(c.type);
    const items = [];
    const slots = [];
    for (let j = 0; j < c.items.length; j += 1) {
      const it = c.items[j];
      const method = practiceData.getMethod(it.method);
      const tier = practiceData.tierOf(it.tier);
      const rec = state.skills[it.id] || { unlocked: false };
      items.push({
        id: it.id,
        name: it.name,
        tierKey: tier.key,
        tierName: tier.name,
        tierColor: tier.color,
        starsText: starsTextOf(tier.stars),
        gameName: method.gameName,
        rewardText: '耗气 ×' + tier.qiCost.toFixed(2),
        unlocked: !!rec.unlocked,
      });
    }
    for (let r = 0; r < tiers.length; r += 1) {
      // 同族同阶可并列多门（2026-11 心法族两门黄阶）：每槽收该阶**全部**功法，
      // 不再「取第一门就 break」——那样后一门会在谱系里消失，玩家看不到。
      const bucket = items.filter(function (x) { return x.tierKey === tiers[r].key; });
      const first = bucket[0] || {
        id: 'gap-' + c.type + '-' + tiers[r].key,
        name: '（待补变体）',
        tierKey: tiers[r].key,
        tierName: tiers[r].name,
        tierColor: tiers[r].color,
        starsText: starsTextOf(tiers[r].stars),
        gameName: '',
        rewardText: '耗气 ×' + tiers[r].qiCost.toFixed(2),
        unlocked: false,
        empty: true,
      };
      slots.push(Object.assign({}, first, {
        // 该阶全部功法：一门时是 [first]，空槽是 []。旧字段（name/id…）仍取首门，兼容旧渲染。
        items: bucket,
        empty: bucket.length === 0,
      }));
    }
    out.push({
      type: c.type,
      label: c.type + '一脉',
      core: fam.core,
      note: fam.note,
      kind: fam.kind,
      kindLabel: fam.kind === 'main' ? '主修' : '技艺',
      items: items,
      slots: slots,
    });
  }
  return out;
}

function getChallengeList(state, moveIds) {
  // 胜算与运功消耗都要按「这一场实际怎么打」说：三式尽出与空手上去是两回事，
  // 列表上写着「胜算在握」，进去放完三式才发现其实是险胜，这条提示就白给了。
  const board = moveBoard(state, moveIds);
  const power = board.powerAfter;
  const out = [];
  for (let i = 0; i < opponentData.ALL_CHALLENGES.length; i += 1) {
    const c = opponentData.ALL_CHALLENGES[i];
    // 五个词对应五档胜算。中间那档原本被 else 吃掉了，
    // 「势均力敌」永远显示不出来——战力与对手几乎持平时最该看到的恰恰是它。
    let hint = '势均力敌';
    if (power >= c.power * 1.2) hint = '胜算在握';
    else if (power >= c.power * 1.05) hint = '略占上风';
    else if (power >= c.power * 0.95) hint = '势均力敌';
    else if (power < c.power * 0.7) hint = '还需苦练';
    else hint = '略有不及';
    out.push({
      id: c.id,
      kind: c.kind,
      name: c.name,
      title: c.title,
      desc: c.desc,
      power: c.power,
      // 灵力不再是奖励，而是这一场的运功成本；灵石才是收入。
      // 列表里要写清「花几点换多少灵石」，否则玩家以为切磋还倒贴灵力。
      // 这个数随养息式浮动（5 → 2），必须跟 battle() 实际扣的是同一个来源。
      qiCost: board.qiCost,
      stone: c.reward.stone,
      // 今日第几场：灵石按 0.85^(n-1) 衰减，列表上直接给出「下一场能拿多少」。
      stoneNow: (function () {
        const n = Math.floor(num(state.daily && state.daily.battleWins, 0));
        return Math.round(c.reward.stone * economyData.battleStoneFactor(n));
      }()),
      stoneFactor: Math.round(economyData.battleStoneFactor(Math.floor(num(state.daily && state.daily.battleWins, 0))) * 1000) / 1000,
      dropName: c.drop && skillData.getSkill(c.drop) ? skillData.getSkill(c.drop).name : '',
      cleared: state.defeated.indexOf(c.id) >= 0,
      hint: hint,
      hintTone: hint === '胜算在握' || hint === '略占上风' ? 'good' : 'warn',
    });
  }
  return out;
}

function getTitleList(state) {
  const m = computeMetrics(state);
  return titleData.TITLES.map(function (t) {
    return {
      id: t.id,
      name: t.name,
      desc: t.desc,
      unlocked: state.titles.indexOf(t.id) >= 0,
      equipped: state.equippedTitle === t.id,
      progress: Math.min(m[t.metric] || 0, t.target),
      target: t.target,
    };
  });
}

// 人物页「主修」那张卡要报段位与走通关数，所以这里必须带上 stage* 三件套——
// 与 getSkillList 同名字段、同一个 stageOfRec()，页面才能在两个数据源之间复制同一行。
function getTopSkills(state, count) {
  const n = count || 3;
  const arr = [];
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (!rec || !rec.unlocked) continue;
    const stage = stageOfRec(rec);
    arr.push({
      id: s.id,
      name: s.name,
      type: s.type,
      prof: rec.prof,
      tierName: worldData.TIERS[tierIndex(rec.prof)].name,
      color: worldData.TIERS[tierIndex(rec.prof)].color,
      stageName: stage.stage.name,
      stageLevel: stage.cleared,
      levelTotal: stage.total,
    });
  }
  arr.sort(function (a, b) { return b.prof - a.prof; });
  return arr.slice(0, n);
}

function comboOf(state, id) {
  return Math.min(worldData.COMBO_MAX, Math.floor(num(state.sCombo && state.sCombo[id], 0)));
}

// 主动结束：这一局不进 applyPractice（不作数），但连 S 必须归零，
// 否则「预感这局拿不到 S 就中途结束」能把连击永久保住，断连惩罚形同虚设。
// 突破局的「气机一乱」不是参悟，页面不会调这里，不会误伤别的门。
function breakCombo(state, skillId) {
  if (!state.sCombo) state.sCombo = {};
  state.sCombo[skillId] = 0;
  return { ok: true, skillId: skillId, combo: 0 };
}

module.exports = {
  bonusText: bonusText,
  breakCombo: breakCombo,
  comboOf: comboOf,
  effectNoteOf: effectNoteOf,
  gainLinesOf: gainLinesOf,
  getChallengeList: getChallengeList,
  getFamilies: getFamilies,
  getOverview: getOverview,
  getSkillDetail: getSkillDetail,
  getSkillList: getSkillList,
  getTitleList: getTitleList,
  getTopSkills: getTopSkills,
  orderLearned: orderLearned,
  realmNameOf: realmNameOf,
  recommend: recommend,
  recommendScore: recommendScore,
  sourceText: sourceText,
  starsTextOf: starsTextOf,
  touchSkill: touchSkill,
  unlockInfo: unlockInfo,
};
