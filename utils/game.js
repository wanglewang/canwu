'use strict';

// 《参悟》养成系统内核：属性 / 熟练度 / 战力 / 挂机 / 对战 / 存档
// 本文件不依赖任何界面，所有内容由 data/ 下的世界数据驱动。

const worldData = require('../data/world.js');
const skillData = require('../data/skills.js');
const practiceData = require('../data/practice.js');
const economyData = require('../data/economy.js');
const guideData = require('../data/guides.js');
const opponentData = require('../data/opponents.js');
const titleData = require('../data/titles.js');
const achievementData = require('../data/achievements.js');
const copy = require('../data/copy.js');

const STORAGE_KEY = 'canwu_save_v1';
const SAVE_PREFIX = 'CANWU1:';
const BATTLE_PREFIX = 'CW1-';
const SAVE_VERSION = 7;
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
    skills[s.id] = { unlocked: s.source.kind === 'start', prof: 0, onboarded: false };
  }
  return {
    version: SAVE_VERSION,
    worldId: 'xian',
    roleName: w.roleName,
    portrait: 0,
    realmIndex: 0,
    skills: skills,
    // 灵气是练功的燃料，灵石是通货：开局给 160 灵气（约 22 局简单）与 15 灵石
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
    // 每门功法连续拿到 S 的层数（0..COMBO_MAX）：只在最高已解锁档累计，10 层封顶。
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
    // v6 -> v7：经济重做——参悟开始烧灵气、功法只收灵石、突破要备灵石布阵。
    // 旧档的灵气只有「买功法时顺带被扣」这一个出口，余额常常是 0；直接沿用，
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
      unlocked: !!r.unlocked,
      prof: Math.floor(num(r.prof, 0)),
      onboarded: !!r.onboarded,
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
  return base;
}

function load() {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return createNewState();
  return normalizeState(raw);
}

function save(state) {
  state.lastSeen = Date.now();
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

function effectValue(state, type) {
  let sum = 0;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (!rec || !rec.unlocked) continue;
    if (tierIndex(rec.prof) < 3) continue;
    if (s.effect.type === type) sum += s.effect.value;
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

function pickIdleSkill(state) {
  const last = state.lastPractice.skillId;
  // 24000 是「圆满」门槛：挂机优先喂还没练到圆满的门，练满之后让位给别的功法。
  if (last && state.skills[last] && state.skills[last].unlocked && state.skills[last].prof < worldData.TIERS[4].threshold) return last;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (rec && rec.unlocked && rec.prof < worldData.TIERS[4].threshold) return s.id;
  }
  return skillData.SKILLS[0].id;
}

// 闭关的「预演」：只算不写。页面据此显示「已攒 N 分 · 灵气 +M」，
// 冷启动的 settleOffline 与随手点的 meditate 都走这一份算法，三处不许各算一遍。
function idlePending(state) {
  const now = Date.now();
  const w = worldData.getWorld(state.worldId);
  const last = num(state.lastSeen, now);
  const empty = { minutes: 0, hours: 0, qi: 0, prof: 0, capped: false, skillId: '', skillName: '' };
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
  const skillId = pickIdleSkill(state);
  return {
    minutes: minutes,
    hours: Math.round(hours * 10) / 10,
    qi: Math.floor(effectiveMinutes * w.idle.qiPerMinute * (1 + idleBonus)),
    prof: Math.floor(hours * w.idle.profPerHour),
    capped: elapsedMs > capMs,
    skillId: skillId,
    skillName: skillData.getSkill(skillId) ? skillData.getSkill(skillId).name : '功法',
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
  if (state.skills[r.skillId]) state.skills[r.skillId].prof += r.prof;
  addLog(state, '闭关 ' + Math.floor(r.minutes / 60) + ' 时 ' + (r.minutes % 60) + ' 分，灵气 +' + r.qi
    + '，' + r.skillName + ' +' + r.prof, 'idle');
  return {
    minutes: r.minutes,
    hours: r.hours,
    capped: r.capped,
    qi: r.qi,
    prof: r.prof,
    skillName: r.skillName,
  };
}

// 打坐 = 当场收一次闭关。冷启动那次弹的是「闭关收获」，这一下叫「打坐」：
// 同一套算法，区别只在于它随时能点——灵气是参悟的油，油烧完了不该逼玩家杀掉小程序再开一遍。
// 不足一分钟明确回一句，不静默吞掉（点了没反应是这类按钮最容易挨骂的毛病）。
function meditate(state) {
  const pending = idlePending(state);
  // 一分钟只有 0.5 点，取整后可能是 0：这时候收下等于把这段时间白扔了，不如挡回去再坐一会儿。
  const tooSoon = '还没攒够一点。再坐两分钟，回来就能收。';
  if (pending.minutes < 1 || pending.qi < 1) return { ok: false, msg: tooSoon };
  const r = settleOffline(state);
  if (!r) return { ok: false, msg: tooSoon };
  return {
    ok: true,
    minutes: r.minutes,
    hours: r.hours,
    qi: r.qi,
    prof: r.prof,
    skillName: r.skillName,
    capped: r.capped,
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
  state.daily.claimed = true;
  state.stats.dailyClaimed += 1;
  // 份例只补灵气：它是「今天练过了」的补给，不是工钱。灵石一分不给，
  // 那个只能靠切磋与秘境挣——两种货币的分工从第一笔收入就要成立。
  state.resources.qi += w.daily.qi;
  const added = checkTitles(state);
  addLog(state, '领了今日参悟的份例：灵气 +' + w.daily.qi, 'daily');
  return { ok: true, qi: w.daily.qi, stone: 0, newTitles: added };
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

  // 难度档只认这门功法自己的熟练度；越权选高档（例如改页面参数）自动回落到已解锁的最高档。
  // 没传难度就按「本门最高已解锁档」结算：老默认是 easy，会让没带参数的调用在高段位被静默折半。
  const fallbackDiff = opts.hard ? 'hard' : practiceData.bestDifficulty(rec.prof);
  const wantIdx = practiceData.diffKeyIndex(opts.difficulty || fallbackDiff);
  const maxIdx = practiceData.diffIndexOf(rec.prof);
  const fellBack = wantIdx > maxIdx;
  const diff = practiceData.DIFFICULTIES[Math.min(wantIdx, maxIdx)];
  // 低档折减现在只作用一处：基础熟练度逐档 ÷2 四舍五入（见 practice.profBelowCap）。
  // 耗气不跟着折——低档本来就便宜（7 点起），再折会让「刷简单」变成省气的聪明选择。
  const lowFactor = practiceData.lowDiffFactor(rec.prof, diff.key);
  const belowCap = lowFactor < 1;
  const diffGap = practiceData.diffGapOf(rec.prof, diff.key);

  // 连 S 与低档完全解耦：只有最高已解锁档的 S 才叠层，本局按 34 × 1.5^(层数-1) 独立取整；
  // 低档局不叠层、不砍连击收益、层数原样保留；走火（F）不分档位一律断连。
  // 到 PROF_MAX 后熟练度封顶，但层数与纪录照常、灵气照扣：大圆满是数值毕业，不是不许再练。
  if (!state.sCombo) state.sCombo = {};
  const comboBefore = Math.min(worldData.COMBO_MAX, Math.floor(num(state.sCombo[skillId], 0)));
  let comboNow = comboBefore;
  let comboGainNow = 0;
  let rawGain = 0;
  if (wiped) {
    comboNow = 0;
  } else if (belowCap) {
    rawGain = practiceData.profBelowCap(worldData.PROF_BASE[grade] || 0, rec.prof, diff.key);
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

  // 一局要烧多少灵气：难度档 × 时长系数 × 品阶 × 境界超限 × 心法省气 ÷ 悟性 ÷ 换门。
  // 系数全在 data/economy.js 一处算，页面只显示结果，不在页面上再推一遍。
  const qiCost = economyData.practiceQiCost({
    diffIndex: practiceData.diffKeyIndex(diff.key),
    tierKey: tier.key,
    methodBase: method.base,
    realmAbove: realmAbove,
    qiSave: qiSave,
    wu: attrs.wu || 0,
    cross: cross,
  });
  // 灵气不足就不让开这一局：与其打完再告诉玩家「其实你没气」，不如起手就拦住。
  // 页面已经用 practiceCostOf() 预判过一次，这里是存档层的双保险——
  // 存档被改、或两个页面同时开局，都能被它挡回去。
  if (state.resources.qi < qiCost) {
    return {
      ok: false,
      msg: '灵气不足：本局要 ' + qiCost + ' 点，你只有 ' + state.resources.qi + ' 点',
      qiCost: qiCost,
      qi: state.resources.qi,
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

  // 三连 S 晋级已取消：段位不再被「补额」跳过，只由上面这一局的实得点数一格格涨。
  rec.prof += gain;

  // 运功的代价：灵气在起手时就烧掉了，走火也不退——这才是「走火」真正的分量。
  // 参悟不再产灵气灵石：产出留在闭关（灵气）与对战（灵石），这一局只换熟练度。
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
    addLog(state, '参悟 ' + skill.name + ' 走火，这一局没有收益', 'practice');
  } else if (gain === 0 && rec.prof >= worldData.PROF_MAX) {
    // 到顶后不许写「熟练度 +0」，那读起来像 bug。
    addLog(state, '参悟 ' + skill.name + '，熟练度已圆满，本局只记战绩', 'practice');
  } else {
    addLog(state, '参悟 ' + skill.name + '，熟练度 +' + gain + '（灵气 −' + qiCost + '）', 'practice');
  }

  // 机缘：只在石阶上拾得残卷，**不给灵气也不给灵石**。
  // 参悟是纯支出——灵气只从闭关与份例来、灵石只从切磋与秘境来。参悟里再冒出一笔资源，
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
    // 走火＝作废：页面据此把收益行显示成「无」，而不是一排 +0。
    wiped: wiped,
    gradeTitle: copy.GRADE_TITLE[grade] || '粗浅',
    gradeColor: worldData.GRADE_COLOR[grade] || '#8a8f83',
    skillName: skill.name,
    methodName: method.name,
    gain: gain,
    // 这一局烧掉的灵气：走火也照扣（起手就烧了），所以它和 gain 是两条独立的数。
    qiCost: qiCost,
    qiBefore: state.resources.qi + qiCost,
    qiAfter: state.resources.qi,
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
    // 品阶、难度、境界现在都只影响「一局烧多少气」，不再有资源倍率这一串。
    tierKey: tier.key,
    tierLabel: tier.label,
    tierColor: tier.color,
    diffKey: diff.key,
    diffName: diff.name,
    // 低于本门最高已解锁档：基础熟练度已按档差逐档折半、本局不叠连 S，结算要如实报出档差与系数。
    diffBelowCap: belowCap,
    diffBelowCapFactor: lowFactor,
    diffBelowGap: diffGap,
    diffCapName: practiceData.DIFFICULTIES[maxIdx].name,
    diffFellBack: fellBack,
    diffMaxName: practiceData.DIFFICULTIES[maxIdx].name,
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

// 这一局要烧多少灵气：准备页在开局前显示它，与 applyPractice 内部用的是同一个函数，
// 不在这儿另写一遍系数（两处一漂，玩家就会看到「面板写 17、结算扣 24」）。
function practiceCostOf(state, skillId, diffKey) {
  const skill = skillData.getSkill(skillId);
  if (!skill) return 0;
  const rec = state.skills[skillId];
  const method = practiceData.getMethod(skill.method);
  const tier = practiceData.tierOf(skill.tier);
  const realmNow = state.realmIndex + 1;
  const attrs = computeAttributes(state);
  const key = diffKey || practiceData.bestDifficulty(rec ? rec.prof : 0);
  return economyData.practiceQiCost({
    diffIndex: practiceData.diffKeyIndex(key),
    tierKey: tier.key,
    methodBase: method.base,
    realmAbove: realmNow > tier.maxRealm,
    qiSave: effectValue(state, 'qiSave'),
    wu: attrs.wu || 0,
    cross: !!state.lastPractice.skillId && state.lastPractice.skillId !== skillId,
  });
}

// ---------------------------------------------------------------- 对战

function rollBattle(playerPower, enemyPower, varianceBonus) {
  const floor = Math.min(0.98, 0.85 + varianceBonus);
  const playerRoll = playerPower * (floor + Math.random() * (1.15 - floor));
  const enemyRoll = enemyPower * (0.85 + Math.random() * 0.3);
  return { playerRoll: Math.round(playerRoll), enemyRoll: Math.round(enemyRoll) };
}

function activeBattleEffects(state) {
  const list = [];
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (!rec || !rec.unlocked || tierIndex(rec.prof) < 3) continue;
    if (s.effect.type === 'power' || s.effect.type === 'variance') {
      list.push({ name: s.name, text: s.effect.text });
    }
  }
  return list;
}

function battle(state, challengeId) {
  const c = opponentData.getChallenge(challengeId);
  if (!c) return { ok: false, msg: '没有找到这位对手' };
  // 切磋要先运功：不论胜负都烧 5 点灵气。赚灵石和练功争的是同一池灵气，
  // 两件事才有取舍——否则切磋就是「点一下白给钱」，谁还去参悟。
  if (state.resources.qi < economyData.BATTLE_QI) {
    return {
      ok: false,
      msg: '灵气不足：一场切磋要运功 ' + economyData.BATTLE_QI + ' 点，先回洞府打坐',
      lackQi: economyData.BATTLE_QI - state.resources.qi,
    };
  }
  const power = computePower(state);
  const effects = activeBattleEffects(state);
  const rolls = rollBattle(power, c.power, effectValue(state, 'variance'));
  const win = rolls.playerRoll >= rolls.enemyRoll;
  const firstClear = win && state.defeated.indexOf(c.id) < 0;

  state.resources.qi -= economyData.BATTLE_QI;
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
    enemyPower: c.power,
    playerRoll: rolls.playerRoll,
    enemyRoll: rolls.enemyRoll,
    effects: effects,
    // 运功消耗固定，灵石按当日第几场衰减；结算卡据此写「灵气 −5 / 灵石 +10（第 2 场 ×0.85）」。
    qiCost: economyData.BATTLE_QI,
    qiAfter: state.resources.qi,
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

function battleMirror(state, code) {
  const mirror = parseBattleCode(code);
  if (!mirror.ok) return { ok: false, msg: mirror.msg };
  if (state.resources.qi < economyData.BATTLE_QI) {
    return {
      ok: false,
      msg: '灵气不足：一场切磋要运功 ' + economyData.BATTLE_QI + ' 点，先回洞府打坐',
      lackQi: economyData.BATTLE_QI - state.resources.qi,
    };
  }
  const power = computePower(state);
  const effects = activeBattleEffects(state);
  const rolls = rollBattle(power, mirror.power, effectValue(state, 'variance'));
  const win = rolls.playerRoll >= rolls.enemyRoll;
  if (!state.daily) state.daily = { date: todayKey(Date.now()), count: 0, claimed: false, battleWins: 0 };
  const winsBefore = Math.floor(num(state.daily.battleWins, 0));
  const stoneFactor = win ? economyData.battleStoneFactor(winsBefore) : 0;
  const stone = win ? Math.round(8 * stoneFactor) : 0;
  state.resources.qi -= economyData.BATTLE_QI;
  state.resources.stone += stone;
  if (win) {
    state.stats.wins += 1;
    state.daily.battleWins = winsBefore + 1;
  }
  addLog(state, '与镜像道友论道，' + (win ? '胜' : '负') + '，' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  return {
    ok: true, win: win, challengeName: '镜像道友', challengeTitle: '战力码切磋',
    power: power, enemyPower: mirror.power,
    playerRoll: rolls.playerRoll, enemyRoll: rolls.enemyRoll,
    effects: effects, qiCost: economyData.BATTLE_QI, qiAfter: state.resources.qi,
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
  return {
    maxed: maxed,
    currentName: w.realms[state.realmIndex].name,
    nextName: next ? next.name : '',
    need: next ? next.power : 0,
    power: pd.total,
    stone: state.resources.stone,
    stoneCost: stoneCost,
    stoneReady: state.resources.stone >= stoneCost,
    // 突破之后战力会跳到多少：境界加成是乘数（筑基 ×1.06、金丹 ×1.14……），
    // 只写「还差 46」玩家算不出这一步的收益，得把这个数直接摆出来。
    powerAfter: powerAfter,
    powerGain: powerAfter - pd.total,
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
  addLog(state, '突破至「' + w.realms[state.realmIndex].name + '」', 'realm');
  return {
    ok: true, hit: true, grade: grade,
    realmName: w.realms[state.realmIndex].name,
    // 灵石是花出去的：页面显示「−60」，不是「+60」。
    stoneCost: cost,
    stoneAfter: state.resources.stone,
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
  // 功法只收灵石。灵气是练功的燃料，用它买功法等于「用油买油」，
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
function battleRival(state, rival) {
  if (!rival || !isFinite(rival.power)) return { ok: false, msg: '没有找到这位道友' };
  if (state.resources.qi < economyData.BATTLE_QI) {
    return {
      ok: false,
      msg: '灵气不足：一场切磋要运功 ' + economyData.BATTLE_QI + ' 点，先回洞府打坐',
      lackQi: economyData.BATTLE_QI - state.resources.qi,
    };
  }
  const enemyPower = Math.max(0, Math.floor(Number(rival.power)));
  const power = computePower(state);
  const effects = activeBattleEffects(state);
  const rolls = rollBattle(power, enemyPower, effectValue(state, 'variance'));
  const win = rolls.playerRoll >= rolls.enemyRoll;
  if (!state.daily) state.daily = { date: todayKey(Date.now()), count: 0, claimed: false, battleWins: 0 };
  const winsBefore = Math.floor(num(state.daily.battleWins, 0));
  const stoneFactor = win ? economyData.battleStoneFactor(winsBefore) : 0;
  const stone = win ? Math.round(8 * stoneFactor) : 0;
  state.resources.qi -= economyData.BATTLE_QI;
  state.resources.stone += stone;
  if (win) {
    state.stats.wins += 1;
    state.daily.battleWins = winsBefore + 1;
  }
  const name = typeof rival.name === 'string' && rival.name ? rival.name.slice(0, 12) : '榜单道友';
  addLog(state, '与「' + name + '」论道，' + (win ? '胜' : '负') + '，' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  return {
    ok: true, win: win, challengeName: name, challengeTitle: '实录切磋',
    power: power, enemyPower: enemyPower,
    playerRoll: rolls.playerRoll, enemyRoll: rolls.enemyRoll,
    effects: effects, qiCost: economyData.BATTLE_QI, qiAfter: state.resources.qi,
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
    attrs: w.attributes.map(function (a) {
      return { key: a.key, name: a.name, glyph: a.glyph, value: attrs[a.key] || 0 };
    }),
    qi: state.resources.qi,
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
    const diffNow = practiceData.difficultyOf(practiceData.bestDifficulty(rec.prof));
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
      // 难度档：只看本门熟练度，与品阶无关。
      diffName: diffNow.name,
      // 难度档早就不给倍率了：这张卡片要说的是「最高能选哪档、那一档大概烧多少气」。
      diffQi: diffNow.qi,
      diffText: '最高可选「' + diffNow.name + '」· 基础耗气 ' + diffNow.qi,
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
      effectText: s.effect.text,
      effectUnlocked: rec.unlocked && info.index >= 3,
      sourceText: sourceText(s),
      canBuy: !rec.unlocked && s.source.kind === 'shop',
      cost: s.source.cost || null,
    });
  }
  return list;
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
    effectNote: base.effectUnlocked ? '已生效' : '习得并练至大成后生效',
    gainLines: [
      { label: '属性加成', value: base.bonusText, note: '习得即有，随熟练度与品阶增长' },
      { label: '运功耗气', value: base.rewardText, note: base.maxRealmName + '以内不加价' },
      { label: '大成特效', value: base.effectText, note: base.effectUnlocked ? '已生效' : '习得并练至大成后生效' },
    ],
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
  const idx = practiceData.diffIndexOf(s.prof);
  const nextDiff = practiceData.DIFFICULTIES[idx + 1];
  let next;
  if (s.decayed) next = s.decayText + '，这门先放一放。';
  else if (nextDiff && nextDiff.need - s.prof <= gap) next = '先到 ' + nextDiff.need + ' 熟练度解锁「' + nextDiff.name + '」档。';
  else if (nextDiff) next = '本门现可选到「' + s.diffName + '」，往上一档是「' + nextDiff.name + '」。';
  else next = '本门已开到最高一档，练的是手上的稳。';

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

function getChallengeList(state) {
  const power = computePower(state);
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
      // 灵气不再是奖励，而是这一场的运功成本；灵石才是收入。
      // 列表里要写清「花 5 换多少灵石」，否则玩家以为切磋还倒贴灵气。
      qiCost: economyData.BATTLE_QI,
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
  twistsOff: twistsOff,
  setTwist: setTwist,
  hasOnboarded: hasOnboarded,
  markOnboarded: markOnboarded,
  computeMetrics: computeMetrics,
  checkTitles: checkTitles,
  checkDaily: checkDaily,
  idlePending: idlePending,
  meditate: meditate,
  settleOffline: settleOffline,
  buffInfo: buffInfo,
  claimDaily: claimDaily,
  applyPractice: applyPractice,
  practiceCostOf: practiceCostOf,
  battle: battle,
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
