'use strict';

// 熟练度 / 属性 / 战力
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。

const { economyData, practiceData, skillData, titleData, worldData } = require('./base.js');

// ---------------------------------------------------------------- 熟练度 / 属性 / 战力

function tierIndex(prof) {
  const T = worldData.TIERS;
  for (let i = T.length - 1; i >= 0; i -= 1) {
    if (prof >= T[i].threshold) return i;
  }
  return 0;
}

function tierInfo(prof) {
  const T = worldData.TIERS;
  const i = tierIndex(prof);
  const cur = T[i];
  const next = T[i + 1] || null;
  const span = next ? next.threshold - cur.threshold : 0;
  const done = next ? prof - cur.threshold : 0;
  const ratio = next ? Math.max(0, Math.min(1, done / span)) : 1;
  return {
    index: i,
    name: cur.name,
    color: cur.color,
    desc: cur.desc,
    threshold: cur.threshold,
    nextName: next ? next.name : '',
    nextThreshold: next ? next.threshold : cur.threshold,
    percent: Math.round(ratio * 100),
    maxed: !next,
  };
}

// 功法特效按火候兑现：生涩 0 → 初窥 1/4 → 渐熟 1/2 → 精纯 3/4 → 通玄与化境满额。
// 下标是熟练度火候档（TIERS），不是走通关数的段位（STAGES）；两套名字不要混用。
// 旧版是「练到精纯 6000 才一次性生效」，中前期所有特效都等于不存在，玩家自然会觉得
// 「练了半天什么都没变」。逐档兑现之后，每一次火候提升都能在面板上看见一处变化。
// 生涩是 0 而不是 1/8：刚习得还没练过，本条特效不该先白给。
const EFFECT_TIER_SCALE = [0, 0.25, 0.5, 0.75, 1, 1];

function effectScaleOf(prof) {
  return EFFECT_TIER_SCALE[tierIndex(prof)] || 0;
}

function effectValue(state, type) {
  let sum = 0;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (!rec || !rec.unlocked) continue;
    const scale = EFFECT_TIER_SCALE[tierIndex(rec.prof)];
    if (!scale) continue;
    if (s.effect.type === type) sum += s.effect.value * scale;
  }
  return sum;
}

function computeAttributes(state) {
  const w = worldData.getWorld(state.worldId);
  const attrs = {};
  for (let i = 0; i < w.attributes.length; i += 1) attrs[w.attributes[i].key] = w.baseAttributes[w.attributes[i].key] || 0;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (!rec || !rec.unlocked) continue;
    // 属性 = 功法条目 × 熟练度段位系数 × 品阶系数（天阶 2.2 倍，黄阶 1.0）
    const mul = worldData.TIERS[tierIndex(rec.prof)].bonus * practiceData.tierOf(s.tier).attr;
    const keys = Object.keys(s.bonus);
    for (let k = 0; k < keys.length; k += 1) {
      attrs[keys[k]] = (attrs[keys[k]] || 0) + s.bonus[keys[k]] * mul;
    }
  }
  const out = {};
  const allKeys = Object.keys(attrs);
  for (let i = 0; i < allKeys.length; i += 1) out[allKeys[i]] = Math.round(attrs[allKeys[i]] * 10) / 10;
  return out;
}

// realmIndex 可指定「算哪个境界的战力」：不传就是当前境界。
// 主页要预告「突破之后战力多少」，靠它把下一境界的加成代进去重算，而不是自己再抄一遍公式。
function powerDetail(state, realmIndex) {
  const w = worldData.getWorld(state.worldId);
  const attrs = computeAttributes(state);
  let base = 0;
  for (let i = 0; i < w.attributes.length; i += 1) {
    base += (attrs[w.attributes[i].key] || 0) * w.attributes[i].weight;
  }
  const at = typeof realmIndex === 'number' ? realmIndex : state.realmIndex;
  const realm = w.realms[at] || w.realms[0];
  const realmBonus = realm.bonus || 0;
  const effectBonus = effectValue(state, 'power');
  return {
    base: Math.round(base * 10) / 10,
    realmBonus: realmBonus,
    effectBonus: effectBonus,
    total: Math.round(base * (1 + realmBonus + effectBonus)),
  };
}

function computePower(state) { return powerDetail(state).total; }

// 这一门再涨一段，战力会多多少 —— 把「练功」与「破境」之间那一步算给玩家看。
//
// 现状：功法卡上写的是「体魄 +0.8」，破境门槛读的是「战力 170」，中间这次换算从没有人
// 算给玩家。于是「练这门到底有什么用」「还差 2 点该练哪门」只能靠猜，玩起来就像在玩
// 一堆互不相干的小游戏。这里不新增公式：把这一门的熟练度换成下一段门槛，重算一次
// computeAttributes + powerDetail，差值就是这一段的价。
//
// 只读：构造的是浅拷贝，不改存档。
function skillPowerGain(state, skillId) {
  const rec = state.skills ? state.skills[skillId] : null;
  if (!rec || !rec.unlocked) return 0;
  const info = tierInfo(rec.prof);
  if (info.maxed) return 0;
  const now = powerDetail(state).total;
  const skills = Object.assign({}, state.skills);
  skills[skillId] = Object.assign({}, rec, { prof: info.nextThreshold });
  const after = powerDetail(Object.assign({}, state, { skills: skills })).total;
  return Math.max(0, after - now);
}

// 破境还差几点战力时，最该练哪一门：在已习得、尚未大圆满的功法里，
// 取「离下一段熟练度最近的那门」——不是加成最大的那门。
// 加成最大的往往是大成到圆满（差 18000 熟练度），那条路一年走不完；
// 玩家要的是「今天再打几局就能动」的那一步。
function nextPowerStep(state) {
  const ids = Object.keys(state.skills || {});
  let best = null;
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const rec = state.skills[id];
    if (!rec || !rec.unlocked) continue;
    const info = tierInfo(rec.prof);
    if (info.maxed) continue;
    const gain = skillPowerGain(state, id);
    if (gain <= 0) continue;
    const gap = Math.max(0, info.nextThreshold - rec.prof);
    if (!best || gap < best.gap || (gap === best.gap && gain > best.gain)) {
      const skill = skillData.getSkill(id);
      best = {
        id: id,
        name: skill ? skill.name : id,
        nextName: info.nextName,
        gain: gain,
        gap: gap,
      };
    }
  }
  return best;
}

// 气海：这一档境界能存多少灵力。三样东西合起来算，只在这里算一次——
// 主页的「96 / 174」、参悟页的「余 96」、打坐的截断、份例的封顶都取它。
//   · 境界基数（world.realms[].qiCap）：炼气 150 → 元婴 620；
//   · 真元：每点 +2（economy.QI_CAP_PER_LING）——「练灵力类功法」的独立出口；
//   · 心法扩池（effect.type = qiCap）：吐纳 10% + 太虚 15%，封顶 30%。
function qiCap(state) {
  const w = worldData.getWorld(state.worldId);
  const realm = w.realms[state.realmIndex] || w.realms[0];
  const attrs = computeAttributes(state);
  return economyData.qiCapOf(realm.qiCap || 0, attrs.ling || 0, effectValue(state, 'qiCap'));
}

// 身法给的切磋波动下限：每 30 点 +1%，封顶 +10%。
// 它和 variance 特效走同一条出口（rollBattle 的 floor），所以两者能叠加、也有同一个上限。
// 为什么要给身法一个独立出口：四个属性若都只进战力，玩家练哪门都一样，练功就没有方向。
// 系数 = 1/3000 而不是 1/300：1/300 是「每 3 点 +1%」，身法 30 点就吃满 10% 封顶，
// 之后再堆一点用都没有——身法会变成只在开局有用的属性，与 200 关的长线养成相反。
// 1/3000 下开局 11 点只 0.37%、十五门全大圆满 151 点约 5%，封顶 10% 留到以后扩属性。
// 这条换算在 09-attributes 4.3 与玩家指南第 55 行都写着「每 30 点 +1%」，三处必须一致。
const SHEN_FLOOR_PER = 1 / 3000;
const SHEN_FLOOR_MAX = 0.10;

function shenFloorBonus(state) {
  const attrs = computeAttributes(state);
  return Math.min(SHEN_FLOOR_MAX, Math.max(0, (attrs.shen || 0) * SHEN_FLOOR_PER));
}

// 阶段新法的开关。只有 data/practice.js 的 STAGE_RULES 标了 hard 的才该出现在开关里
//（逆诵改点击方向、死门多一格不能碰的、收势要求停一拍）——那些是「改规则」。
// 照影 / 照纹 / 稳基是纯加成，关掉没有任何好处，不给开关。
function twistsOff(state, skillId) {
  const all = state && state.twists;
  const list = all && all[skillId];
  return Array.isArray(list) ? list : [];
}

// 引导按「段」记，不按「门」记：一门有五段，每段的第 1 关各给一次。
// 首段那一次讲整门机制（2 步），后面四次只讲这一段新变的那件事（1–3 步；记序复现按音数走，最多 5）。
// 记在 rec.teachSeen 这个五格数组上，与 unlocked / prof 同级，不新增顶层字段。
const TEACH_STAGES = 5;

function teachStageIndex(stage) {
  const n = Math.round(Number(stage) || 0);
  return Math.max(0, Math.min(TEACH_STAGES - 1, n));
}

function hasTaught(state, skillId, stage) {
  const rec = state && state.skills && state.skills[skillId];
  if (!rec) return false;
  const i = teachStageIndex(stage);
  if (Array.isArray(rec.teachSeen)) return !!rec.teachSeen[i];
  // 老档只有 onboarded 一个布尔值——它本来就是「第一次开局看过引导」，等于第 0 段。
  return i === 0 && !!rec.onboarded;
}

function markTaught(state, skillId, stage) {
  const rec = state && state.skills && state.skills[skillId];
  if (!rec) return false;
  const i = teachStageIndex(stage);
  if (!Array.isArray(rec.teachSeen)) rec.teachSeen = [false, false, false, false, false];
  rec.teachSeen[i] = true;
  // 第 0 段同时写旧字段：分享码、老断言与「这门看过引导」的旧口径都读 onboarded。
  if (i === 0) rec.onboarded = true;
  return true;
}

// 旧接口保留：语义收窄成「首段看过没有」。调用点只有页面与旧断言，别再往它上面加意思。
function hasOnboarded(state, skillId) {
  return hasTaught(state, skillId, 0);
}

function markOnboarded(state, skillId) {
  markTaught(state, skillId, 0);
  const rec = state && state.skills && state.skills[skillId];
  return !!(rec && rec.onboarded);
}

// 入门卡与教学盘是两件事：教学盘是「跟着走一遍」（十五门都有，每门五段各一盘），
// 入门卡是「进这一门先读三句」（十五门都有）。所以分开记，看过卡片不影响教学盘。
function markIntroed(state, skillId) {
  const rec = state && state.skills && state.skills[skillId];
  if (rec) rec.introed = true;
  return !!(rec && rec.introed);
}

function setTwist(state, skillId, name, enabled) {
  if (!state.twists) state.twists = {};
  const cur = twistsOff(state, skillId).filter(function (x) { return x !== name; });
  if (!enabled) cur.push(name);
  state.twists[skillId] = cur;
  return cur;
}

function computeMetrics(state) {
  let maxTier = 0;
  let unlockedCount = 0;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const rec = state.skills[skillData.SKILLS[i].id];
    if (!rec || !rec.unlocked) continue;
    unlockedCount += 1;
    const t = tierIndex(rec.prof);
    if (t > maxTier) maxTier = t;
  }
  return {
    practiceCount: state.stats.practiceCount,
    wins: state.stats.wins,
    comboCount: state.stats.comboCount,
    gradeS: state.stats.gradeS,
    dailyClaimed: state.stats.dailyClaimed,
    realmIndex: state.realmIndex,
    maxTier: maxTier,
    unlockedCount: unlockedCount,
  };
}

function checkTitles(state) {
  const m = computeMetrics(state);
  const added = [];
  for (let i = 0; i < titleData.TITLES.length; i += 1) {
    const t = titleData.TITLES[i];
    if (state.titles.indexOf(t.id) >= 0) continue;
    if (m[t.metric] >= t.target) {
      state.titles.push(t.id);
      added.push(t);
    }
  }
  if (!state.equippedTitle && added.length > 0) state.equippedTitle = added[0].id;
  return added;
}

module.exports = {
  EFFECT_TIER_SCALE: EFFECT_TIER_SCALE,
  SHEN_FLOOR_MAX: SHEN_FLOOR_MAX,
  SHEN_FLOOR_PER: SHEN_FLOOR_PER,
  checkTitles: checkTitles,
  computeAttributes: computeAttributes,
  computeMetrics: computeMetrics,
  computePower: computePower,
  effectScaleOf: effectScaleOf,
  effectValue: effectValue,
  hasOnboarded: hasOnboarded,
  hasTaught: hasTaught,
  markIntroed: markIntroed,
  markOnboarded: markOnboarded,
  markTaught: markTaught,
  nextPowerStep: nextPowerStep,
  powerDetail: powerDetail,
  qiCap: qiCap,
  setTwist: setTwist,
  shenFloorBonus: shenFloorBonus,
  skillPowerGain: skillPowerGain,
  tierIndex: tierIndex,
  tierInfo: tierInfo,
  twistsOff: twistsOff,
};
