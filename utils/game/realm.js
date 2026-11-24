'use strict';

// 境界 / 藏经阁 / 称号
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。

const { SAVE_PREFIX, achievementData, economyData, practiceData, skillData, todayKey, worldData } = require('./base.js');
const { rollWithMoves } = require('./battle.js');
const { checkTitles, computeAttributes, computePower, effectValue, nextPowerStep, powerDetail, qiCap } = require('./profs.js');
const { addLog, normalizeState, num } = require('./state.js');

// ---------------------------------------------------------------- 境界 / 藏经阁 / 称号

function breakthroughInfo(state) {
  const w = worldData.getWorld(state.worldId);
  const maxed = state.realmIndex >= w.realms.length - 1;
  const next = maxed ? null : w.realms[state.realmIndex + 1];
  const pd = powerDetail(state);
  const powerAfter = maxed ? pd.total : powerDetail(state, state.realmIndex + 1).total;
  // 布阵的灵石：突破不只是「战力够了」，还要备得起阵材与丹药。
  // available 仍只看战力（那是能不能冲关），stoneReady 另算——两件事合一个布尔，
  // 就会出现「战力够了却说不能突破」的糊涂提示。
  const stoneCost = maxed ? 0 : economyData.breakthroughStone(state.realmIndex + 1);
  // 气海也会跟着扩：境界基数从 150 一路到 620。这是突破的第二重回报，
  // 且比战力更直观——「一趟能多练几局」是玩家每天都能摸到的差别。
  const attrs = computeAttributes(state);
  const capBonus = effectValue(state, 'qiCap');
  const qiCapNow = economyData.qiCapOf(w.realms[state.realmIndex].qiCap, attrs.ling || 0, capBonus);
  const qiCapAfter = maxed
    ? qiCapNow
    : economyData.qiCapOf(next.qiCap, attrs.ling || 0, capBonus);
  return {
    maxed: maxed,
    currentName: w.realms[state.realmIndex].name,
    nextName: next ? next.name : '',
    need: next ? next.power : 0,
    power: pd.total,
    // 还差几点：页面不必自己拿 need 减 power，两处各算一遍迟早会差 1。
    lack: maxed ? 0 : Math.max(0, next.power - pd.total),
    // 差这几点该练哪门：不写「再加把劲」，直接给出这一门与它下一段的名字。
    // 没有可练的门（全大圆满）时为 null，页面据此不说废话。
    fastest: maxed ? null : nextPowerStep(state),
    stone: state.resources.stone,
    stoneCost: stoneCost,
    stoneReady: state.resources.stone >= stoneCost,
    // 突破之后战力会跳到多少：境界加成是乘数（筑基 ×1.06、金丹 ×1.14……），
    // 只写「还差 46」玩家算不出这一步的收益，得把这个数直接摆出来。
    powerAfter: powerAfter,
    powerGain: powerAfter - pd.total,
    qiCap: qiCapNow,
    qiCapAfter: qiCapAfter,
    qiCapGain: qiCapAfter - qiCapNow,
    bonusNow: pd.realmBonus,
    bonusAfter: next ? (next.bonus || 0) : pd.realmBonus,
    available: !!next && pd.total >= next.power,
  };
}

function applyBreakthrough(state, grade) {
  const info = breakthroughInfo(state);
  if (info.maxed || !info.available) return { ok: false, msg: '现在还不到突破的时候' };
  const w = worldData.getWorld(state.worldId);
  // 布阵要备灵石：筑基 60 / 金丹 120 / 元婴 240。
  // 突破花的是「阵材、丹药、护法」这些修仙界真正要买的东西——
  // 旧版反过来发灵石，等于越突破越有钱，灵石也就失去了分量。
  const cost = economyData.breakthroughStone(state.realmIndex + 1);
  if (state.resources.stone < cost) {
    return {
      ok: false,
      msg: '布阵需灵石 ' + cost + '，你只有 ' + state.resources.stone + ' 枚',
      stoneCost: cost,
      lackStone: cost - state.resources.stone,
    };
  }
  if (grade === 'F') {
    // 冲关不成，灵石散了些，阵基还在：退回一半。
    // 全额不退会让一次失手掏空积蓄，全退又等于「失败无代价」。
    const refund = Math.round(cost * economyData.BREAKTHROUGH_REFUND);
    const lost = cost - refund;
    state.resources.stone -= lost;
    addLog(state, '冲击 ' + info.nextName + ' 未成，布阵灵石散去 ' + lost, 'realm');
    return {
      ok: false,
      hit: false,
      msg: '突破失败。布阵的灵石散了 ' + lost + ' 枚，其余的还在。',
      stoneCost: lost,
      stoneRefund: refund,
      stoneAfter: state.resources.stone,
    };
  }
  state.resources.stone -= cost;
  state.realmIndex += 1;
  // 破境即补满气海：新境界的气海一开，灵力自然充满。这是突破最直接的「摸得着」，
  // 也让「攒够战力却灵力见底」的玩家在破境后立刻能去试新练法。
  const qiBefore = state.resources.qi;
  const capAfter = qiCap(state);
  state.resources.qi = capAfter;
  addLog(state, '突破至「' + w.realms[state.realmIndex].name + '」，气海拓至 ' + capAfter, 'realm');
  return {
    ok: true, hit: true, grade: grade,
    realmName: w.realms[state.realmIndex].name,
    // 灵石是花出去的：页面显示「−60」，不是「+60」。
    stoneCost: cost,
    stoneAfter: state.resources.stone,
    // 境界既进，气海随之拓宽并补满：结算卡要说清「多了多少容量」与「补了多少」。
    qiCapBefore: info.qiCap,
    qiCapAfter: capAfter,
    qiFill: capAfter - qiBefore,
    qiAfter: state.resources.qi,
    // 突破的最大收益就是这一跳：境界加成从 ×1.06 到 ×1.14，战力整体抬一档。
    // info 是在突破前算的，里面已经有突破后的战力，直接用。
    powerBefore: info.power,
    powerAfter: info.powerAfter,
    newTitles: checkTitles(state),
  };
}

function buySkill(state, skillId) {
  const s = skillData.getSkill(skillId);
  if (!s) return { ok: false, msg: '没有这门功法' };
  if (!state.skills[skillId]) return { ok: false, msg: '没有这门功法' };
  if (state.skills[skillId].unlocked) return { ok: false, msg: '已经习得' };
  if (s.source.kind !== 'shop' || !s.source.cost) return { ok: false, msg: '此功法需从对战或机缘中获得' };
  // 品阶决定学习门槛：天阶要到元婴才修得动，黄阶炼气就能上手。
  const tier = practiceData.tierOf(s.tier);
  if (state.realmIndex + 1 < tier.needRealm) {
    const realms = worldData.getWorld(state.worldId).realms;
    const needName = realms[Math.min(realms.length - 1, tier.needRealm - 1)].name;
    return { ok: false, msg: '需「' + needName + '」境界才能修炼' + tier.label + '功法' };
  }
  const cost = s.source.cost;
  // 功法只收灵石。灵力是练功的燃料，用它买功法等于「用油买油」，
  // 两种货币的分工当场糊掉——而分工正是这套经济唯一的看点。
  const need = Math.floor(num(cost.stone, 0));
  if (state.resources.stone < need) {
    return { ok: false, msg: '还差灵石 ' + (need - state.resources.stone) };
  }
  state.resources.stone -= need;
  state.skills[skillId].unlocked = true;
  addLog(state, '于藏经阁换得《' + s.name + '》', 'skill');
  return { ok: true, name: s.name, cost: cost, stoneCost: need, newTitles: checkTitles(state) };
}

function equipTitle(state, id) {
  if (state.titles.indexOf(id) < 0) return { ok: false, msg: '这个称号暂未解锁' };
  state.equippedTitle = state.equippedTitle === id ? '' : id;
  return { ok: true, equipped: state.equippedTitle };
}

// 角色资料：道号与道相编号都是存档字段，随云端存档一起同步。
function updateRole(state, patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, msg: '资料格式不对' };
  if (patch.name !== undefined) {
    const name = typeof patch.name === 'string' ? patch.name.trim().slice(0, 12) : '';
    if (!name) return { ok: false, msg: '道号不能为空' };
    state.roleName = name;
  }
  if (patch.portrait !== undefined) {
    const p = Math.floor(Number(patch.portrait));
    if (isFinite(p)) state.portrait = ((p % 6) + 6) % 6;
  }
  return { ok: true };
}

function exportSaveCode(state) {
  return SAVE_PREFIX + JSON.stringify(state);
}

function importSaveCode(code) {
  if (typeof code !== 'string' || code.indexOf(SAVE_PREFIX) !== 0) return { ok: false, msg: '存档码格式不对' };
  try {
    const obj = JSON.parse(code.slice(SAVE_PREFIX.length));
    return { ok: true, state: normalizeState(obj) };
  } catch (e) {
    return { ok: false, msg: '存档码无法解析' };
  }
}

// 与榜单里的真实玩家镜像论道：只取战力与名号，不接触对方存档内容。
function battleRival(state, rival, moveIds) {
  if (!rival || !isFinite(rival.power)) return { ok: false, msg: '没有找到这位道友' };
  const enemyPower = Math.max(0, Math.floor(Number(rival.power)));
  const fight = rollWithMoves(state, enemyPower, moveIds);
  if (state.resources.qi < fight.qiCost) {
    return {
      ok: false,
      msg: '灵力不足：这一场要运功 ' + fight.qiCost + ' 点，先回洞府打坐'
        + (state.resources.stone > 0 ? '，或用灵石换一些' : ''),
      lackQi: fight.qiCost - state.resources.qi,
      qiCap: qiCap(state),
    };
  }
  const power = fight.power;
  const rolls = fight.rolls;
  const win = rolls.playerRoll >= rolls.enemyRoll;
  if (!state.daily) state.daily = { date: todayKey(Date.now()), count: 0, claimed: false, battleWins: 0 };
  const winsBefore = Math.floor(num(state.daily.battleWins, 0));
  const stoneFactor = win ? economyData.battleStoneFactor(winsBefore) : 0;
  const stone = win ? Math.round(8 * stoneFactor) : 0;
  state.resources.qi -= fight.qiCost;
  state.resources.stone += stone;
  if (win) {
    state.stats.wins += 1;
    state.daily.battleWins = winsBefore + 1;
  }
  const name = typeof rival.name === 'string' && rival.name ? rival.name.slice(0, 12) : '榜单道友';
  addLog(state, '与「' + name + '」论道，' + (win ? '胜' : '负') + '，' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  return {
    ok: true, win: win, challengeName: name, challengeTitle: '实录切磋',
    power: power, powerAfter: fight.powerAfter, enemyPower: enemyPower,
    playerRoll: rolls.playerRoll, enemyRoll: rolls.enemyRoll,
    moves: fight.moves, qiCost: fight.qiCost, qiAfter: state.resources.qi, qiMax: qiCap(state),
    stone: stone, stoneFactor: Math.round(stoneFactor * 1000) / 1000,
    battleNo: winsBefore + (win ? 1 : 0), dropName: '',
    line: win ? '这一场赢得干净，对方留了句「后会有期」。' : '对方收招：「道友根基还差些。」',
    realmName: rival.realmName || '未知境界',
    newTitles: checkTitles(state),
  };
}

function achievementMetric(key, state) {
  switch (key) {
    case 'practiceCount': return state.stats.practiceCount;
    case 'gradeS': return state.stats.gradeS;
    case 'comboCount': return state.stats.comboCount;
    case 'tierUps': return state.stats.tierUps;
    case 'dailyClaimed': return state.stats.dailyClaimed;
    case 'wins': return state.stats.wins;
    case 'defeated': return state.defeated.length;
    case 'titles': return state.titles.length;
    case 'realmStep': return state.realmIndex + 1;
    case 'power': return computePower(state);
    case 'unlockedSkills': {
      let n = 0;
      for (let i = 0; i < skillData.SKILLS.length; i += 1) {
        const rec = state.skills[skillData.SKILLS[i].id];
        if (rec && rec.unlocked) n += 1;
      }
      return n;
    }
    default: return 0;
  }
}

function getAchievements(state) {
  return achievementData.ACHIEVEMENTS.map(function (a) {
    const current = achievementMetric(a.key, state);
    return {
      id: a.id,
      name: a.name,
      desc: a.desc,
      glyph: a.glyph,
      group: a.group,
      goal: a.goal,
      current: Math.min(current, a.goal),
      unlocked: current >= a.goal,
    };
  });
}

module.exports = {
  achievementMetric: achievementMetric,
  applyBreakthrough: applyBreakthrough,
  battleRival: battleRival,
  breakthroughInfo: breakthroughInfo,
  buySkill: buySkill,
  equipTitle: equipTitle,
  exportSaveCode: exportSaveCode,
  getAchievements: getAchievements,
  importSaveCode: importSaveCode,
  updateRole: updateRole,
};
