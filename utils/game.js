'use strict';

// 《参悟》养成系统内核：属性 / 熟练度 / 战力 / 挂机 / 对战 / 存档
// 本文件不依赖任何界面，所有内容由 data/ 下的世界数据驱动。

const worldData = require('../data/world.js');
const skillData = require('../data/skills.js');
const practiceData = require('../data/practice.js');
const economyData = require('../data/economy.js');
const levelData = require('../data/levels.js');
const guideData = require('../data/guides.js');
const opponentData = require('../data/opponents.js');
const moveData = require('../data/moves.js');
const titleData = require('../data/titles.js');
const achievementData = require('../data/achievements.js');
const copy = require('../data/copy.js');

const STORAGE_KEY = 'canwu_save_v1';
const SAVE_PREFIX = 'CANWU1:';
const BATTLE_PREFIX = 'CW1-';
const SAVE_VERSION = 9;
// 连 S 叠倍率：同一门功法连续完成 S，本局熟练度 = round(34 × 1.5^(层数-1))，10 层封顶。
// 层数真源在 world.COMBO_MAX；每门各算各的，非 S / 走火 / 主动收功都归零，
// 低档局不参与连 S（层数原样保留）。旧的「三连 S 直接晋级」已整体退役。

function readStorage(key) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) return wx.getStorageSync(key);
  } catch (e) { /* 存储不可用时退回内存态 */ }
  return null;
}

function writeStorage(key, value) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(key, value);
  } catch (e) { /* 忽略写入失败，不阻断游戏 */ }
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function todayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function checkCode(raw) {
  return hashString(raw).toString(36).slice(-4).toUpperCase();
}

// ---------------------------------------------------------------- 存档

function createNewState() {
  const w = worldData.getWorld('xian');
  const skills = {};
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    // onboarded：这门功法看过首局手把手没有。与 unlocked / prof 同级放，不新增顶层字段；
    // 老存档没有这个键，读出来就是 false，等于「还没看过」，会正常触发一次引导。
    // levels：五档各自的进度（已通到本档第几关，0–40）。难度由玩家自己挑、不再由
    // 熟练度解锁，所以进度必须一档一份——「简单走到第 12 关」与「绝境走到第 3 关」
    // 是两条独立的线，不能压成一个数。
    skills[s.id] = { unlocked: s.source.kind === 'start', prof: 0, cleared: 0, onboarded: false };
  }
  return {
    version: SAVE_VERSION,
    worldId: 'xian',
    roleName: w.roleName,
    portrait: 0,
    realmIndex: 0,
    skills: skills,
    // 灵力是练功的燃料，灵石是通货：开局给 160 灵力（开局气海 174，接近满）与 15 灵石
    // （打一场切磋就够换第一门黄阶），让「练一局」和「换一门」都在第一小时发生。
    resources: { qi: economyData.START_QI, stone: economyData.START_STONE },
    lastPractice: { skillId: '', at: 0 },
    buff: { multiplier: 1, until: 0 },
    defeated: [],
    stats: {
      practiceCount: 0, wins: 0, comboCount: 0,
      gradeS: 0, dailyClaimed: 0, tierUps: 0,
    },
    // 每门功法的局内最佳：{ score, grade, at }，用于「破纪录」反馈与功法页展示。
    records: {},
    // 每门功法连续拿到 S 的层数（0..COMBO_MAX）：只在本门当前关累计，10 层封顶。
    sCombo: {},
    // 各门功法被玩家手动关掉的阶段新法：{ 功法 id: ['逆诵', ...] }。
    // 逆诵 / 死门这类是「改规则」，不是「给便利」——练到解锁就该能关，
    // 否则想安心练基础记忆的人没有退路。缺省为空 = 全开（老存档自动是这个行为）。
    twists: {},
    daily: { date: todayKey(Date.now()), count: 0, claimed: false, battleWins: 0 },
    equippedTitle: '',
    titles: [],
    log: [],
    lastSeen: Date.now(),
  };
}

function num(v, fallback) {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : fallback;
}

// 存档版本迁移框架：以后每次加字段，在这里补一段 if (v < N)，
// 老档（含 CANWU1: 存档码导入的）就能平滑升级，不必到处写兜底判断。
function migrateState(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const v = Math.floor(num(raw.version, 1));
  let next = raw;
  // v1 -> v2 当年只为补一个头像路径；头像已下线（道相是唯一形象），这一步没有可补的键。
  // 不必单独占一格版本号：下游 v3/v4/v5 都按原始版本号判断，v1 老档照旧一路升到 5。
  if (v < 3) {
    // v2 -> v3：引入各门功法的局内最佳纪录。
    next = Object.assign({}, next, { version: 3, records: {} });
  }
  if (v < 4) {
    // v3 -> v4：品阶改「天地玄黄」，难度改由熟练度解锁（不再存在存档里的「苦修」开关）。
    // 存档字段未变，只统一版本号；纪录与熟练度原样保留。
    next = Object.assign({}, next, { version: 4 });
  }
  if (v < 5) {
    // v4 -> v5：引入每门功法的连续 S 计数。老档从 0 开始，不补记历史。
    next = Object.assign({}, next, { version: 5, sStreak: {} });
  }
  if (v < 6) {
    // v5 -> v6：三连 S 晋级退役，换「连 S 叠倍率」。两套机制的层数含义不同，
    // 旧计数不换算，一律从 0 重数；顺手把 sStreak 从存档里摘掉，不留双份字段。
    next = Object.assign({}, next, { version: 6, sCombo: {} });
    delete next.sStreak;
  }
  if (v < 7) {
    // v6 -> v7：经济重做——参悟开始烧灵力、功法只收灵石、突破要备灵石布阵。
    // 旧档的灵力只有「买功法时顺带被扣」这一个出口，余额常常是 0；直接沿用，
    // 玩家更新后第一局就开不了。这里补到初始身家（只补不削），另补当日已战场次，
    // 用于切磋灵石的逐场衰减。
    const res = Object.assign({}, next.resources || {});
    res.qi = Math.max(economyData.START_QI, Math.floor(num(res.qi, 0)));
    res.stone = Math.floor(num(res.stone, 0));
    next = Object.assign({}, next, {
      version: 7,
      resources: res,
      daily: Object.assign({ count: 0, claimed: false, battleWins: 0 }, next.daily || {}),
    });
  }
  if (v < 9) {
    // v8 -> v9：难度档整组退役，一门一条 1000 关的长线，段位由「走通了几关」定。
    // 老档有两种来路，都要落成 `cleared`（本门已走通几关，0–1000）：
    //   v8 档  有 levels{}（五档各 0–40）：先加总成本门在 200 关制下走到第几关，再 ×5；
    //   v7 及更早只有 prof：按旧规则反推 200 关制的关号（legacyLevelFromProf），再 ×5。
    // 折算系数 5 的来历：老 200 关 = 五档各 40 关，新 1000 关 = 五段，总内容量不变，
    // 所以「老档走到第 N 关」= 「新档走到第 5N 关」。只做加法，不没收任何一段路。
    const skills = {};
    const src = next.skills || {};
    const ids = Object.keys(src);
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const rec = Object.assign({}, src[id]);
      if (typeof rec.cleared !== 'number') {
        let oldCleared = 0;
        if (rec.levels && typeof rec.levels === 'object') {
          const keys = Object.keys(rec.levels);
          for (let j = 0; j < keys.length; j += 1) {
            oldCleared += Math.max(0, Math.min(40, Math.floor(num(rec.levels[keys[j]], 0))));
          }
        } else {
          oldCleared = levelData.legacyLevelFromProf(num(rec.prof, 0)) - 1;
        }
        rec.cleared = Math.max(0, Math.min(levelData.LEVEL_MAX, oldCleared * 5));
      }
      delete rec.levels;
      skills[id] = rec;
    }
    next = Object.assign({}, next, { version: 9, skills: skills });
  }
  return next;
}

function normalizeState(input) {
  const base = createNewState();
  const raw = migrateState(input);
  if (!raw || typeof raw !== 'object' || !raw.skills) return base;
  base.worldId = worldData.getWorld(raw.worldId).id;
  base.roleName = typeof raw.roleName === 'string' ? raw.roleName.slice(0, 12) : base.roleName;
  base.portrait = Math.floor(num(raw.portrait, 0)) % 6;
  base.realmIndex = Math.floor(num(raw.realmIndex, 0));
  const maxRealm = worldData.getWorld(base.worldId).realms.length - 1;
  if (base.realmIndex > maxRealm) base.realmIndex = maxRealm;

  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const r = raw.skills[s.id];
    if (!r) continue;
    base.skills[s.id] = {
      // 入门即得的门类不认旧存档里的 false：这一批从藏经阁改成默认赠送之后，
      // 老玩家存档里还写着「没买」，读档不补这一刀，他会一辈子看不到这十门。
      unlocked: !!r.unlocked || s.source.kind === 'start',
      prof: Math.floor(num(r.prof, 0)),
      // 关卡进度夹到 0–1000：脏存档写个 9999 也不许把段位顶到不存在的段。
      cleared: practiceData.clearedOf(r),
      onboarded: !!r.onboarded,
      introed: !!r.introed,
    };
  }
  if (raw.resources) {
    base.resources.qi = Math.floor(num(raw.resources.qi, 0));
    base.resources.stone = Math.floor(num(raw.resources.stone, 0));
  }
  if (raw.lastPractice) {
    base.lastPractice.skillId = typeof raw.lastPractice.skillId === 'string' ? raw.lastPractice.skillId : '';
    base.lastPractice.at = num(raw.lastPractice.at, 0);
  }
  if (raw.buff) {
    base.buff.multiplier = num(raw.buff.multiplier, 1) || 1;
    base.buff.until = num(raw.buff.until, 0);
  }
  if (Array.isArray(raw.defeated)) base.defeated = raw.defeated.filter(function (x) { return typeof x === 'string'; });
  if (raw.stats) {
    const keys = Object.keys(base.stats);
    for (let k = 0; k < keys.length; k += 1) base.stats[keys[k]] = Math.floor(num(raw.stats[keys[k]], 0));
  }
  if (raw.daily && typeof raw.daily.date === 'string') {
    base.daily.date = raw.daily.date;
    base.daily.count = Math.floor(num(raw.daily.count, 0));
    base.daily.claimed = !!raw.daily.claimed;
    base.daily.battleWins = Math.floor(num(raw.daily.battleWins, 0));
  }
  if (raw.records && typeof raw.records === 'object') {
    const ids = Object.keys(raw.records);
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      if (!skillData.SKILL_MAP[id]) continue;
      const r = raw.records[id];
      if (!r || typeof r !== 'object') continue;
      base.records[id] = {
        score: Math.floor(num(r.score, 0)),
        grade: typeof r.grade === 'string' ? r.grade.slice(0, 2) : 'C',
        at: num(r.at, 0),
      };
    }
  }
  if (raw.sCombo && typeof raw.sCombo === 'object') {
    const sids = Object.keys(raw.sCombo);
    for (let i = 0; i < sids.length; i += 1) {
      const id = sids[i];
      if (!skillData.SKILL_MAP[id]) continue;
      base.sCombo[id] = Math.min(worldData.COMBO_MAX, Math.floor(num(raw.sCombo[id], 0)));
    }
  }
  // 关掉的阶段新法：缺省即空（老档、以及从没关过的人都是这个状态，等于全开）。
  // 不跟着升 SAVE_VERSION —— 它是「有就用、没有就空」的可选字段，
  // 老客户端读到新存档只会忽略它，不需要走迁移。
  if (raw.twists && typeof raw.twists === 'object') {
    const tids = Object.keys(raw.twists);
    for (let i = 0; i < tids.length; i += 1) {
      const id = tids[i];
      if (!skillData.SKILL_MAP[id] || !Array.isArray(raw.twists[id])) continue;
      base.twists[id] = raw.twists[id].filter(function (x) { return typeof x === 'string'; }).slice(0, 8);
    }
  }
  if (Array.isArray(raw.titles)) base.titles = raw.titles.filter(function (x) { return typeof x === 'string'; });
  if (typeof raw.equippedTitle === 'string') base.equippedTitle = raw.equippedTitle;
  if (Array.isArray(raw.log)) base.log = raw.log.slice(0, 12);
  base.lastSeen = num(raw.lastSeen, Date.now());
  checkDaily(base);
  // 气海装不下的部分读档时一次夹平：旧版灵力没有上限，老档可能攒到几百点，
  // 直接显示「300 / 174」会让人以为出了 bug。这里只夹一次上限，不额外没收，
  // 之后「超出即散」的规则由 idlePending 与闭关结算接管。
  const cap = qiCap(base);
  if (base.resources.qi > cap) base.resources.qi = cap;
  return base;
}

function load() {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return createNewState();
  return normalizeState(raw);
}

function save(state) {
  // 这里**不许**把 lastSeen 写成 now。它是「上次结算闭关的时间」，不是「上次存档的时间」：
  // 存档每改一次都发生（领份例、换门、参悟结算…），写成 now 等于把闭关时长一次次抹掉。
  // 真机上的表现是：明明挂了三小时，弹窗报「灵力 +90」，关掉弹窗还是 0——
  // 因为 store.init() 存过一次档，hydrate() 又用云端那份（lastSeen 更旧但 qi 也没涨）覆盖回来。
  // lastSeen 只在 settleOffline() 里推进（结算即归零），这是它唯一的写入点。
  writeStorage(STORAGE_KEY, state);
  return state;
}

function addLog(state, text, kind) {
  state.log.unshift({ text: text, kind: kind || 'normal', at: Date.now() });
  if (state.log.length > 12) state.log.length = 12;
}

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

// 功法特效按段位兑现：未入门 0 → 入门 1/4 → 小成 1/2 → 大成 3/4 → 圆满与大圆满满额。
// 旧版是「练到大成 6000 才一次性生效」，中前期所有特效都等于不存在，玩家自然会觉得
// 「练了半天什么都没变」。逐段兑现之后，每一次段位提升都能在面板上看见一处变化。
// 未入门是 0 而不是 1/8：刚习得还没练过，本条特效不该先白给。
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
// 1/3000 下开局 11 点只 0.37%、十九门全大圆满 151 点约 5%，封顶 10% 留到以后扩属性。
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

// 首局引导：只跟「这门功法」走，不跟玩法走。一门功法只有第一次开局会进引导，
// 之后哪怕是隔了几个月回来练，也不再弹——引导是入门那一次的事，不是每次的门槛。
function hasOnboarded(state, skillId) {
  const rec = state && state.skills && state.skills[skillId];
  return !!(rec && rec.onboarded);
}

function markOnboarded(state, skillId) {
  const rec = state && state.skills && state.skills[skillId];
  if (rec) rec.onboarded = true;
  return !!(rec && rec.onboarded);
}

// 入门卡与教学盘是两件事：教学盘是「跟着走一遍」（只有一门有），
// 入门卡是「进这一门先读三句」（十九门都有）。所以分开记，看过卡片不影响教学盘。
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

// ---------------------------------------------------------------- 挂机 / 离线收益

function checkDaily(state) {
  const key = todayKey(Date.now());
  // 单调日历：设备时间被调回过去时不重置，避免把已领过的份例再领一次。
  // 只在日期真正前进时才开启新的一天。
  if (key <= state.daily.date) return;
  state.daily.date = key;
  state.daily.count = 0;
  state.daily.claimed = false;
  // 切磋灵石的逐场衰减按「当日第几场」算，跨天归零——灵脉第二天又满了。
  state.daily.battleWins = 0;
}

// 闭关的「预演」：只算不写。页面据此显示「已坐 N 分 · 灵力 +M」，
// 冷启动的 settleOffline 与随手点的 meditate 都走这一份算法，三处不许各算一遍。
//
// **闭关只产灵力，一分熟练度都不给。** 挂机能涨熟练度，等于挂着不玩也在涨属性——
// 那「参悟才是提速」这句话就是假的。所以 world.idle 里没有 profPerHour 这个数。
function idlePending(state) {
  const now = Date.now();
  const w = worldData.getWorld(state.worldId);
  const last = num(state.lastSeen, now);
  const empty = {
    minutes: 0, hours: 0, qi: 0, capped: false,
    qiRaw: 0, qiCap: qiCap(state), qiRoom: 0, overflow: 0, full: false,
  };
  // 时钟倒退（改系统时间，或云端存档来自时间超前的设备）：一分不给。
  if (last > now) return empty;
  const elapsedMs = Math.max(0, now - last);
  const capMs = w.idle.capHours * 3600 * 1000;
  const cappedMs = Math.min(elapsedMs, capMs);
  const minutes = Math.floor(cappedMs / 60000);
  const buff = state.buff || { multiplier: 1, until: 0 };
  let buffMinutes = 0;
  if (buff.until > last && buff.multiplier > 1) {
    buffMinutes = Math.max(0, Math.min(minutes, Math.floor((buff.until - last) / 60000)));
  }
  const effectiveMinutes = buffMinutes * buff.multiplier + (minutes - buffMinutes);
  const idleBonus = effectValue(state, 'offline');
  const hours = cappedMs / 3600000;
  // 气海装不下的部分当场散掉：这是「上限」真正的存在感，也是唯一会让人心疼的地方。
  // 存得下多少和坐了多少分钟是两件事，pi 分成 qiRaw / qi / overflow 三个数分别报，
  // 页面才能写「坐满 8 小时，收到 174，溢出 66」而不是含糊一句「已满」。
  const cap = qiCap(state);
  const qiRoom = Math.max(0, cap - Math.floor(num(state.resources.qi, 0)));
  const qiRaw = Math.floor(effectiveMinutes * w.idle.qiPerMinute * (1 + idleBonus));
  const qi = Math.min(qiRaw, qiRoom);
  return {
    minutes: minutes,
    hours: Math.round(hours * 10) / 10,
    qi: qi,
    capped: elapsedMs > capMs,
    qiRaw: qiRaw,
    qiCap: cap,
    qiRoom: qiRoom,
    overflow: qiRaw - qi,
    full: qiRoom <= 0,
  };
}

function settleOffline(state) {
  const now = Date.now();
  const last = num(state.lastSeen, now);
  // 时钟倒退（改系统时间，或云端存档来自时间超前的设备）：不结算、也不把回拨值写进存档。
  if (last > now) {
    state.lastSeen = last;
    checkDaily(state);
    return null;
  }
  const r = idlePending(state);
  state.lastSeen = now;
  checkDaily(state);
  if (r.minutes < 1) return null;

  state.resources.qi += r.qi;
  addLog(state, '闭关 ' + Math.floor(r.minutes / 60) + ' 时 ' + (r.minutes % 60) + ' 分，灵力 +' + r.qi
    + (r.overflow > 0 ? '（气海已满，散去 ' + r.overflow + '）' : ''), 'idle');
  return {
    minutes: r.minutes,
    hours: r.hours,
    capped: r.capped,
    qi: r.qi,
    qiCap: r.qiCap,
    overflow: r.overflow,
    full: r.full,
  };
}

// 打坐 = 当场收一次闭关。冷启动那次弹的是「闭关收获」，这一下叫「打坐」：
// 同一套算法，区别只在于它随时能点——灵力是参悟的油，油烧完了不该逼玩家杀掉小程序再开一遍。
// 不足一分钟明确回一句，不静默吞掉（点了没反应是这类按钮最容易挨骂的毛病）。
// 气海满了也要明说：这时候回一句「还没攒够」是错的——坐了很久，只是装不下。
function meditate(state) {
  const pending = idlePending(state);
  const tooSoon = '还没攒够一点。再坐两分钟，回来就能收。';
  // 满池没有第二条产出可收（闭关不涨熟练度），所以这里是「收不到」而不是「只涨熟练度」。
  // 话要说在「满了」上，否则玩家会以为自己坐得不够久。
  if (pending.full) {
    return {
      ok: false,
      msg: '灵力已满（' + Math.floor(num(state.resources.qi, 0)) + ' / ' + pending.qiCap
        + '）：再坐也装不下，去参一局，或破境、练真元拓气海。',
      full: true,
      qiCap: pending.qiCap,
    };
  }
  if (pending.minutes < 1 || pending.qi < 1) return { ok: false, msg: tooSoon };
  const r = settleOffline(state);
  if (!r) return { ok: false, msg: tooSoon };
  return {
    ok: true,
    minutes: r.minutes,
    hours: r.hours,
    qi: r.qi,
    capped: r.capped,
    qiCap: r.qiCap,
    overflow: r.overflow,
  };
}

function buffInfo(state) {
  const b = state.buff || { multiplier: 1, until: 0 };
  const left = Math.max(0, Math.ceil((b.until - Date.now()) / 60000));
  if (left <= 0 || b.multiplier <= 1) return { active: false, multiplier: 1, minutes: 0 };
  return { active: true, multiplier: b.multiplier, minutes: left };
}

function claimDaily(state) {
  const w = worldData.getWorld(state.worldId);
  checkDaily(state);
  if (state.daily.claimed) return { ok: false, msg: '今日已领过了' };
  if (state.daily.count < w.daily.target) {
    return { ok: false, msg: '还差 ' + (w.daily.target - state.daily.count) + ' 次参悟' };
  }
  // 装得下多少就领多少。旧版是「整份装不下就拒领」，看上去很讲究（份例是发放的，
  // 可以等人来取），实际上把这件事变成一道算术题：气海 174、份例 60，玩家练满三次
  // 时灵力往往还剩 130 以上，空位不足 60——也就是**解锁的那一刻正好领不到**。
  // 点了「领取」，灵力一点没动，玩家的结论只有一个：这是坏的。
  //
  // 气海照旧是硬上限（钱能买油，买不来更大的油箱），装不下的部分当场散掉，
  // 但必须照实说散了几个——「+21 / 60」比「+60」诚实，也比拒领有用。
  const cap = qiCap(state);
  const room = Math.max(0, cap - state.resources.qi);
  if (room <= 0) {
    return {
      ok: false,
      msg: '灵力已满（' + state.resources.qi + ' / ' + cap + '）：先练一局腾出空位，份例在这等你。',
      qiCap: cap,
      qiRoom: 0,
      full: true,
    };
  }
  const gain = Math.min(w.daily.qi, room);
  const lost = w.daily.qi - gain;
  state.daily.claimed = true;
  state.stats.dailyClaimed += 1;
  // 份例只补灵力：它是「今天练过了」的补给，不是工钱。灵石一分不给，
  // 那个只能靠切磋与秘境挣——两种货币的分工从第一笔收入就要成立。
  state.resources.qi += gain;
  const added = checkTitles(state);
  addLog(state, '领了今日参悟的份例：灵力 +' + gain + (lost > 0 ? '（气海只余 ' + room + ' 点，散 ' + lost + '）' : ''), 'daily');
  return { ok: true, qi: gain, quota: w.daily.qi, lost: lost, room: room, stone: 0, newTitles: added, qiCap: cap };
}

// 以灵石换灵力。只此一向：灵石减、灵力加，反过来永远没有入口（理由见 economy.js 文件头）。
//
// 三条限制缺一不可：
//   · 灵石够付；
//   · 气海装得下这一份——装不下就换不了，钱能买油、买不来更大的油箱；
//   · 只能是整数枚。
// 装不下时不要把余额凑成「能装下的部分」硬换：玩家按的是一枚，扣的也该是一枚。
function exchangeQi(state, count) {
  const n = Math.max(1, Math.floor(num(count, 1)));
  const gain = economyData.qiFromStone(n);
  const stoneNow = Math.max(0, Math.floor(num(state.resources.stone, 0)));
  if (stoneNow < n) {
    return { ok: false, msg: '灵石不足：还差 ' + (n - stoneNow) + ' 枚', need: n - stoneNow };
  }
  const cap = qiCap(state);
  const room = Math.max(0, cap - state.resources.qi);
  if (room < gain) {
    return {
      ok: false,
      msg: '气海只余 ' + room + ' 点，装不下 ' + gain + ' 点。先练一局再来换。',
      qiCap: cap,
      qiRoom: room,
      need: gain,
    };
  }
  state.resources.stone = stoneNow - n;
  state.resources.qi += gain;
  addLog(state, '以 ' + n + ' 枚灵石换得灵力 +' + gain, 'exchange');
  const added = checkTitles(state);
  return { ok: true, stones: n, qi: gain, qiCap: cap, newTitles: added };
}

// 兑换面板的报价。页面与结算走同一个 cap / room，按钮的亮灭与 exchangeQi 的判断因此不会打架。
function exchangeQuote(state) {
  const rate = economyData.QI_PER_STONE;
  const stone = Math.max(0, Math.floor(num(state.resources.stone, 0)));
  const cap = qiCap(state);
  const room = Math.max(0, cap - state.resources.qi);
  const byRoom = Math.floor(room / rate);
  const can = Math.min(stone, byRoom);
  let hint;
  if (stone <= 0) hint = '灵石不足。切磋与秘境是唯二的来路，先去打一场。';
  else if (room < rate) hint = '气海只余 ' + room + ' 点，装不下这一份。先练一局把灵力用掉，再来换。';
  else hint = '本盘气海容得下 ' + byRoom + ' 枚。换来的灵力立刻可用，不必等闭关。';
  return {
    rate: rate,
    stone: stone,
    qi: state.resources.qi,
    cap: cap,
    room: room,
    can: can,
    ready: can >= 1,
    hint: hint,
  };
}

// ---------------------------------------------------------------- 参悟结算

function applyPractice(state, skillId, grade, options) {
  const skill = skillData.getSkill(skillId);
  if (!skill || !state.skills[skillId] || !state.skills[skillId].unlocked) {
    return { ok: false, msg: '尚未习得这门功法' };
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

  // 走火（F）是「这一局作废」，不是「最低一档」：倍率 0，整局不给任何东西。
  // 注意倍率为 0 时不能用 `||` 兜底——0 会被当成「没配」，静默落回 0.6。
  const rawFactor = worldData.GRADE_FACTOR[grade];
  const factor = typeof rawFactor === 'number' ? rawFactor : 0.6;
  const wiped = factor === 0;
  const attrs = computeAttributes(state);
  // 心法省的「气」：静心 / 勘禁 / 太虚 / 并蒂 / 九宫 / 让路六门累加，封顶一半。
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
  // 回关局不叠层、不砍连击收益、层数原样保留；走火（F）一律断连。
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
  // 走火这一局不立纪录：没走完的成绩不构成「本门最佳」，
  // 否则第一局崩掉就会在准备页留下「本门最佳 0 分 · 走火」，玩家会以为这就是他的水平。
  const newRecord = score > prevBest && grade !== 'F';
  if (newRecord) state.records[skillId] = { score: score, grade: grade, at: Date.now() };
  else if (!prev && grade !== 'F') state.records[skillId] = { score: 0, grade: grade, at: Date.now() };
  const bestScore = Math.max(prevBest, score);

  state.lastPractice = { skillId: skillId, at: Date.now() };
  if (cross) state.stats.comboCount += 1;

  // 三连 S 晋级已取消：火候不再被「补额」跳过，只由上面这一局的实得点数一格格涨。
  rec.prof += gain;

  // 走通本门当前关才推进：走火不推、回关不推、走完 1000 关不推。一局只推一关。
  const advanced = !wiped && playedNo === curNo && cleared < levelData.LEVEL_MAX;
  if (advanced) rec.cleared = cleared + 1;
  const stageBefore = levelData.stageIndexOfCleared(cleared);
  const stageAfter = levelData.stageIndexOfCleared(cleared + (advanced ? 1 : 0));
  const promoted = stageAfter > stageBefore;

  // 运功的代价：灵力在起手时就烧掉了，走火也不退——这才是「走火」真正的分量。
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
  } else if (wiped) {
    // 不能说「熟练度 +0」：玩家会以为是自己眼睛看错了，而不是这一局作废。
    addLog(state, '参悟 ' + skill.name + ' 走火，本局无所得', 'practice');
  } else if (gain === 0 && rec.prof >= worldData.PROF_MAX) {
    // 到顶后不许写「熟练度 +0」，那读起来像 bug。
    addLog(state, '参悟 ' + skill.name + '，熟练度已圆满，本局只记战绩', 'practice');
  } else {
    addLog(state, '参悟 ' + skill.name + '，熟练度 +' + gain + '（灵力 −' + qiCost + '）', 'practice');
  }

  // 机缘：只在石阶上拾得残卷，**不给灵力也不给灵石**。
  // 参悟是纯支出——灵力只从闭关与份例来、灵石只从切磋与秘境来。参悟里再冒出一笔资源，
  // 等于给「练功」开了第二条印钞线，玩家又会回到「一直练、资源自己涨」的老路上。
  // 走火不触发：整局作废还能拾到残卷，等于零收益只是句空话。
  let fortune = null;
  if (!wiped) {
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
    // 本局是否真的往前走了一关：走火、回关、1000 关走完都是 false。
    advanced: advanced,
    // 这一局有没有跨段（走通段界关）。段位由已走通关数算，玩家看得见的那一刻就是它。
    // 跨段：走通段界关那一刻由 false 变 true。stageName 报的是「刚打的那一关属于哪一段」，
    // stageAfterName 是「这一局之后是不是换段了」，两者不能混用一个字段。
    promoted: promoted,
    stageAfterName: levelData.stageNameOfCleared(cleared + (advanced ? 1 : 0)),
    stageBeforeName: levelData.stageNameOfCleared(cleared),
    // 走火＝作废：页面据此把收益行显示成「无」，而不是一排 +0。
    wiped: wiped,
    gradeTitle: copy.GRADE_TITLE[grade] || '粗浅',
    gradeColor: worldData.GRADE_COLOR[grade] || '#8a8f83',
    skillName: skill.name,
    methodName: method.name,
    gain: gain,
    // 这一局烧掉的灵力：走火也照扣（起手就烧了），所以它和 gain 是两条独立的数。
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
    // 印章那一格取招式名首字：破 / 开 / 借 / 叠 / 护 / 引 … 十九个字互不重复。
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
  if (info.maxed || !info.available) return { ok: false, msg: '尚未到突破之时' };
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
      msg: '气机一乱，未能突破。布阵的灵石散了 ' + lost + ' 枚，余下的还在。',
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
    return { ok: false, msg: '需「' + needName + '」境界方能修习' + tier.label + '功法' };
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
  if (state.titles.indexOf(id) < 0) return { ok: false, msg: '尚未解锁这个称号' };
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
    line: win ? '这一场赢得干净，对方留了句「后会有期」。' : '对方收招：「道友根基还差些火候。」',
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
        ? '需「' + realmNameOfNo(tier.needRealm) + '」境界方能修习'
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

function getSkillList(state) {
  const list = [];
  const realmNow = state.realmIndex + 1;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id] || { unlocked: false, prof: 0 };
    const info = tierInfo(rec.prof);
    const method = practiceData.getMethod(s.method);
    const tier = practiceData.tierOf(s.tier);
    const clearedNow = practiceData.clearedOf(rec);
    const stageNow = practiceData.STAGES[
      Math.min(practiceData.STAGES.length - 1, levelData.stageIndexOfCleared(clearedNow))
    ];
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
  if (!detail.unlocked) return '习得后按段位逐级发挥：入门 25% → 圆满 100%';
  const pct = detail.effectPercent || 0;
  if (pct <= 0) return '尚未入门 · 练到入门即开始发挥';
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
      let found = null;
      for (let k = 0; k < items.length; k += 1) {
        if (items[k].tierKey === tiers[r].key) { found = items[k]; break; }
      }
      slots.push(found || {
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
      });
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
    else if (power < c.power * 0.7) hint = '尚需苦修';
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

function getTopSkills(state, count) {
  const n = count || 3;
  const arr = [];
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (!rec || !rec.unlocked) continue;
    arr.push({ name: s.name, type: s.type, prof: rec.prof, tierName: worldData.TIERS[tierIndex(rec.prof)].name, color: worldData.TIERS[tierIndex(rec.prof)].color });
  }
  arr.sort(function (a, b) { return b.prof - a.prof; });
  return arr.slice(0, n);
}

function comboOf(state, id) {
  return Math.min(worldData.COMBO_MAX, Math.floor(num(state.sCombo && state.sCombo[id], 0)));
}

// 主动收功：这一局不进 applyPractice（不作数），但连 S 必须归零，
// 否则「预感这局拿不到 S 就中途收功」能把连击永久保住，断连惩罚形同虚设。
// 突破局的「气机一乱」不是参悟，页面不会调这里，不会误伤别的门。
function breakCombo(state, skillId) {
  if (!state.sCombo) state.sCombo = {};
  state.sCombo[skillId] = 0;
  return { ok: true, skillId: skillId, combo: 0 };
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  SAVE_PREFIX: SAVE_PREFIX,
  SAVE_VERSION: SAVE_VERSION,
  COMBO_MAX: worldData.COMBO_MAX,
  breakCombo: breakCombo,
  createNewState: createNewState,
  normalizeState: normalizeState,
  migrateState: migrateState,
  load: load,
  save: save,
  addLog: addLog,
  tierIndex: tierIndex,
  tierInfo: tierInfo,
  computeAttributes: computeAttributes,
  powerDetail: powerDetail,
  computePower: computePower,
  skillPowerGain: skillPowerGain,
  nextPowerStep: nextPowerStep,
  qiCap: qiCap,
  shenFloorBonus: shenFloorBonus,
  effectValue: effectValue,
  effectScaleOf: effectScaleOf,
  twistsOff: twistsOff,
  setTwist: setTwist,
  hasOnboarded: hasOnboarded,
  markOnboarded: markOnboarded,
  markIntroed: markIntroed,
  computeMetrics: computeMetrics,
  checkTitles: checkTitles,
  checkDaily: checkDaily,
  idlePending: idlePending,
  meditate: meditate,
  settleOffline: settleOffline,
  buffInfo: buffInfo,
  claimDaily: claimDaily,
  exchangeQi: exchangeQi,
  exchangeQuote: exchangeQuote,
  applyPractice: applyPractice,
  practiceCostOf: practiceCostOf,
  battle: battle,
  battleMoves: battleMoves,
  pickMoves: pickMoves,
  moveBoard: moveBoard,
  battleCode: battleCode,
  parseBattleCode: parseBattleCode,
  battleMirror: battleMirror,
  battleRival: battleRival,
  getAchievements: getAchievements,
  breakthroughInfo: breakthroughInfo,
  applyBreakthrough: applyBreakthrough,
  buySkill: buySkill,
  equipTitle: equipTitle,
  updateRole: updateRole,
  exportSaveCode: exportSaveCode,
  importSaveCode: importSaveCode,
  getOverview: getOverview,
  getSkillList: getSkillList,
  getSkillDetail: getSkillDetail,
  unlockInfo: unlockInfo,
  getFamilies: getFamilies,
  recommend: recommend,
  recommendScore: recommendScore,
  starsOf: starsTextOf,
  getChallengeList: getChallengeList,
  getTitleList: getTitleList,
  getTopSkills: getTopSkills,
  readStorage: readStorage,
  writeStorage: writeStorage,
};
