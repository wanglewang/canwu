'use strict';

// 对战 / 本场运功：切磋、招式、存档码
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。

const { BATTLE_PREFIX, checkCode, economyData, moveData, opponentData, skillData, todayKey, worldData } = require('./base.js');
const { checkTitles, computePower, effectScaleOf, qiCap, shenFloorBonus, tierIndex, tierInfo } = require('./profs.js');
const { addLog, num } = require('./state.js');

// ---------------------------------------------------------------- 对战

// 身法给的「波动下限」与 variance 特效走同一个 floor：两者叠加，上限仍是 0.98。
// 下限指的是「这一场最差能打出战力的几成」——身法高的人失手也失不掉多少。
function rollBattle(playerPower, enemyPower, varianceBonus, shenBonus) {
  const reach = (Number(varianceBonus) || 0) + (Number(shenBonus) || 0);
  const floor = Math.min(0.98, 0.85 + reach);
  const playerRoll = playerPower * (floor + Math.random() * (1.15 - floor));
  const enemyRoll = enemyPower * (0.85 + Math.random() * 0.3);
  return { playerRoll: Math.round(playerRoll), enemyRoll: Math.round(enemyRoll) };
}

// ---------------------------------------------------------------- 本场运功

// 一场至多运三式，选中才生效。口径没变（skills.js 的 effect.value × 段位系数），
// 变的是「谁出场」：以前所有 power / variance 特效挂在身上自动累加，玩家看不见
// 任何一门功法出场，赢了不知道靠哪门；现在得自己挑三式运出去（集中系数见
// data/moves.js 的 FOCUS —— 单运一式比被动挂着更足，三式合计约等于以前全额）。
function battleMoves(state, ids) {
  const want = Array.isArray(ids) ? ids : [];
  const picked = [];
  const seen = {};
  for (let i = 0; i < want.length; i += 1) {
    if (picked.length >= moveData.MAX_MOVES) break;
    const id = want[i];
    if (!id || seen[id]) continue;
    const rec = state.skills[id];
    if (!rec || !rec.unlocked) continue;
    // 没入门（段位系数 0）运不出去：这一式还没成形。
    const scale = effectScaleOf(rec.prof);
    if (!scale) continue;
    const m = moveData.moveOf(id);
    if (!m) continue;
    seen[id] = true;
    picked.push({ id: id, move: m, scale: scale });
  }
  const entries = [];
  let powerBonus = 0;
  let floorBonus = 0;
  let qiRelief = 0;
  for (let i = 0; i < picked.length; i += 1) {
    const card = moveCard(state, picked[i].id, picked[i].scale);
    if (!card) continue;
    if (card.act === 'open') powerBonus += moveData.stanceOf(card.id, picked[i].scale);
    else if (card.act === 'guard') floorBonus += moveData.stanceOf(card.id, picked[i].scale);
    else qiRelief += card.relief;
    entries.push(card);
  }
  qiRelief = Math.min(moveData.QI_RELIEF_CAP, qiRelief);
  return { entries: entries, powerBonus: powerBonus, floorBonus: floorBonus, qiRelief: qiRelief };
}

// 一式的展示字段。引擎算一次，选择面板与结算卡都用这一份 —— 免得两处各算一遍
// 「起手给百分数、养息给灵力点」这条换算，下次改口径必有一处忘。
function moveCard(state, id, scale) {
  const m = moveData.moveOf(id);
  if (!m) return null;
  const rec = state.skills[id];
  const stance = moveData.stanceOf(id, scale);
  const relief = moveData.reliefOf(id, scale);
  const tier = rec ? tierInfo(rec.prof) : null;
  return {
    id: id,
    // 印章那一格取招式名首字：破 / 叠 / 合 / 落 / 护 … 十五个字互不重复。
    seal: m.name.slice(0, 1),
    name: m.name,
    skillName: m.skillName,
    act: m.act,
    actName: moveData.ACTS[m.act].name,
    line: m.line,
    // 起手 / 守势给百分数，养息给灵力点数 —— 两种单位不能混成一个「势」。
    percent: m.act === 'qi' ? 0 : Math.round(stance * 1000) / 10,
    relief: m.act === 'qi' ? relief : 0,
    tier: tier ? tier.name : '',
  };
}

// 页面要的一整块：这一场运哪三式、还能换哪些、这一场烧几点灵力。
// 排序先按职能（起手 / 守势 / 养息），再按势的大小降 —— 池子乱序的话，
// 玩家永远找不到刚才看见的那一式。
function moveBoard(state, ids) {
  const picked = Array.isArray(ids) && ids.length ? ids : pickMoves(state);
  const mv = battleMoves(state, picked);
  const used = {};
  for (let i = 0; i < mv.entries.length; i += 1) used[mv.entries[i].id] = true;

  const order = { open: 0, guard: 1, qi: 2 };
  const pool = [];
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const sk = skillData.SKILLS[i];
    const rec = state.skills[sk.id];
    if (!rec || !rec.unlocked) continue;
    const scale = effectScaleOf(rec.prof);
    if (!scale || !moveData.MOVES[sk.id]) continue;
    const card = moveCard(state, sk.id, scale);
    if (!card) continue;
    card.on = !!used[sk.id];
    card.weight = sk.effect.value * scale;
    pool.push(card);
  }
  pool.sort(function (a, b) {
    if (order[a.act] !== order[b.act]) return order[a.act] - order[b.act];
    return b.weight - a.weight;
  });

  const qiCost = Math.max(1, economyData.BATTLE_QI - mv.qiRelief);
  // 面板上要显示「本场出手」：改一式数字就得动一下，否则「选功法」只是换了个
  // 名字，跟战力有没有关系全靠猜。这个数和 rollWithMoves 用的是同一个乘法。
  const power = computePower(state);
  return {
    ids: mv.entries.map(function (e) { return e.id; }),
    power: power,
    powerAfter: Math.round(power * (1 + mv.powerBonus)),
    entries: mv.entries,
    pool: pool,
    max: moveData.MAX_MOVES,
    qiCost: qiCost,
    qiBase: economyData.BATTLE_QI,
    powerBonus: mv.powerBonus,
    floorBonus: mv.floorBonus,
    qiRelief: mv.qiRelief,
  };
}

// 没给选择时的默认：起手 / 守势 / 养息三种职能各取最强一式，职能位没填满再按
// 强弱补齐。默认就该是「会玩的人会这么选」——否则玩家第一次进切磋看到的是一张
// 空的三格，得先学会怎么选才打得动。
function pickMoves(state) {
  const pool = [];
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (!rec || !rec.unlocked) continue;
    const scale = effectScaleOf(rec.prof);
    const m = moveData.MOVES[s.id];
    if (!scale || !m) continue;
    pool.push({ id: s.id, act: m.act, weight: s.effect.value * scale });
  }
  const out = [];
  const acts = ['open', 'guard', 'qi'];
  for (let a = 0; a < acts.length; a += 1) {
    let best = null;
    for (let i = 0; i < pool.length; i += 1) {
      if (pool[i].act !== acts[a]) continue;
      if (!best || pool[i].weight > best.weight) best = pool[i];
    }
    if (best && out.length < moveData.MAX_MOVES) out.push(best.id);
  }
  const rest = pool.slice().sort(function (x, y) { return y.weight - x.weight; });
  for (let i = 0; i < rest.length && out.length < moveData.MAX_MOVES; i += 1) {
    if (out.indexOf(rest[i].id) < 0) out.push(rest[i].id);
  }
  return out;
}

// 四处对战（切磋 / 秘境 / 战力码 / 榜单镜像）共用这一份掷骰：式给战力的加成、
// 式给波动下限的加成、养息省下的灵力，全部在这里一次算完，谁也别自己拼。
function rollWithMoves(state, enemyPower, moveIds) {
  const moves = battleMoves(state, moveIds === undefined || moveIds === null ? pickMoves(state) : moveIds);
  const power = computePower(state);
  const powerAfter = Math.round(power * (1 + moves.powerBonus));
  const rolls = rollBattle(powerAfter, enemyPower, moves.floorBonus, shenFloorBonus(state));
  const qiCost = Math.max(1, economyData.BATTLE_QI - moves.qiRelief);
  return { power: power, powerAfter: powerAfter, moves: moves, rolls: rolls, qiCost: qiCost };
}

function battle(state, challengeId, moveIds) {
  const c = opponentData.getChallenge(challengeId);
  if (!c) return { ok: false, msg: '没有找到这位对手' };
  // 先定这一场运哪三式，再按三式算出实际要烧几点灵力。养息类能把运功压到 2 点，
  // 压不到 0 —— 「赚灵石」与「练功」争的始终是同一池灵力。
  const fight = rollWithMoves(state, c.power, moveIds);
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
  const firstClear = win && state.defeated.indexOf(c.id) < 0;

  state.resources.qi -= fight.qiCost;
  if (!state.daily) state.daily = { date: todayKey(Date.now()), count: 0, claimed: false, battleWins: 0 };
  const winsBefore = Math.floor(num(state.daily.battleWins, 0));
  // 当日第 n 场胜利的灵石按 0.85^(n-1) 给：灵脉一天只吐那么多，取多了就只剩渣。
  // 首胜 / 首过的一次性灵石不在这条衰减里——那是「打通这条路」的奖励。
  const stoneFactor = win ? economyData.battleStoneFactor(winsBefore) : 0;
  let stone = win ? Math.round(c.reward.stone * stoneFactor) : 0;
  state.resources.stone += stone;
  if (win) {
    state.stats.wins += 1;
    state.daily.battleWins = winsBefore + 1;
  }

  let dropName = '';
  if (firstClear) {
    state.defeated.push(c.id);
    stone += economyData.FIRST_CLEAR_STONE;
    state.resources.stone += economyData.FIRST_CLEAR_STONE;
    if (c.drop && state.skills[c.drop] && !state.skills[c.drop].unlocked) {
      state.skills[c.drop].unlocked = true;
      const s = skillData.getSkill(c.drop);
      dropName = s ? s.name : '';
      addLog(state, '战胜 ' + c.name + '，得《' + dropName + '》', 'battle');
    } else {
      addLog(state, (c.kind === 'secret' ? '首过 ' : '首胜 ') + c.name + '，灵石 +' + stone, 'battle');
    }
  } else {
    addLog(state, (win ? '胜 ' : '负于 ') + c.name + '，战力 ' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  }

  return {
    ok: true,
    win: win,
    firstClear: firstClear,
    kind: c.kind,
    challengeName: c.name,
    challengeTitle: c.title,
    power: power,
    powerAfter: fight.powerAfter,
    enemyPower: c.power,
    playerRoll: rolls.playerRoll,
    enemyRoll: rolls.enemyRoll,
    moves: fight.moves,
    // 运功基准 5 点，养息式可抵掉一部分；结算卡据此写「灵力 −3 / 灵石 +10（第 2 场 ×0.85）」。
    qiCost: fight.qiCost,
    qiAfter: state.resources.qi,
    qiMax: qiCap(state),
    stone: stone,
    stoneFactor: Math.round(stoneFactor * 1000) / 1000,
    battleNo: winsBefore + (win ? 1 : 0),
    dropName: dropName,
    line: win ? c.winLine : c.loseLine,
    newTitles: checkTitles(state),
  };
}

function battleCode(state) {
  const power = computePower(state);
  const p = power.toString(36).toUpperCase();
  const r = state.realmIndex.toString(36).toUpperCase();
  let tiers = '';
  for (let i = 0; i < skillData.SKILLS.length && tiers.length < 6; i += 1) {
    const rec = state.skills[skillData.SKILLS[i].id];
    tiers += rec && rec.unlocked ? String(tierIndex(rec.prof)) : '0';
  }
  const raw = [p, r, tiers].join('.');
  return BATTLE_PREFIX + p + '-' + r + '-' + tiers + '-' + checkCode(raw);
}

function parseBattleCode(code) {
  if (typeof code !== 'string') return { ok: false, msg: '战力码格式不对' };
  const parts = code.trim().toUpperCase().split('-');
  if (parts.length !== 5 || parts[0] !== 'CW1') return { ok: false, msg: '战力码格式不对' };
  const raw = parts.slice(1, 4).join('.');
  if (checkCode(raw) !== parts[4]) return { ok: false, msg: '战力码校验失败' };
  const power = parseInt(parts[1], 36);
  const realm = parseInt(parts[2], 36);
  if (!isFinite(power) || power < 0 || power > 100000 || !isFinite(realm)) return { ok: false, msg: '战力码数据异常' };
  return { ok: true, power: power, realm: realm, tiers: parts[3] };
}

function battleMirror(state, code, moveIds) {
  const mirror = parseBattleCode(code);
  if (!mirror.ok) return { ok: false, msg: mirror.msg };
  const fight = rollWithMoves(state, mirror.power, moveIds);
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
  addLog(state, '与镜像道友论道，' + (win ? '胜' : '负') + '，' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  return {
    ok: true, win: win, challengeName: '镜像道友', challengeTitle: '战力码切磋',
    power: power, powerAfter: fight.powerAfter, enemyPower: mirror.power,
    playerRoll: rolls.playerRoll, enemyRoll: rolls.enemyRoll,
    moves: fight.moves, qiCost: fight.qiCost, qiAfter: state.resources.qi, qiMax: qiCap(state),
    stone: stone, stoneFactor: Math.round(stoneFactor * 1000) / 1000,
    battleNo: winsBefore + (win ? 1 : 0), dropName: '',
    line: win ? '镜像散去，你觉得自己的路子好像也没走歪。' : '镜像收招：「回去再练练，不急。」',
    realmName: worldData.getWorld(state.worldId).realms[mirror.realm] ? worldData.getWorld(state.worldId).realms[mirror.realm].name : '未知境界',
    newTitles: checkTitles(state),
  };
}

module.exports = {
  battle: battle,
  battleCode: battleCode,
  battleMirror: battleMirror,
  battleMoves: battleMoves,
  moveBoard: moveBoard,
  moveCard: moveCard,
  parseBattleCode: parseBattleCode,
  pickMoves: pickMoves,
  rollBattle: rollBattle,
  rollWithMoves: rollWithMoves,
};
