'use strict';

// 《参悟》养成系统内核：属性 / 熟练度 / 战力 / 挂机 / 对战 / 存档
// 本文件不依赖任何界面，所有内容由 data/ 下的世界数据驱动。

const worldData = require('../data/world.js');
const skillData = require('../data/skills.js');
const practiceData = require('../data/practice.js');
const opponentData = require('../data/opponents.js');
const titleData = require('../data/titles.js');
const achievementData = require('../data/achievements.js');

const STORAGE_KEY = 'canwu_save_v1';
const SAVE_PREFIX = 'CANWU1:';
const BATTLE_PREFIX = 'CW1-';
const SAVE_VERSION = 4;

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
    skills[s.id] = { unlocked: s.source.kind === 'start', prof: 0 };
  }
  return {
    version: SAVE_VERSION,
    worldId: 'xian',
    roleName: w.roleName,
    portrait: 0,
    avatar: '',
    realmIndex: 0,
    skills: skills,
    resources: { qi: 0, stone: 20 },
    lastPractice: { skillId: '', at: 0 },
    repeatCount: 0,
    buff: { multiplier: 1, until: 0 },
    defeated: [],
    stats: {
      practiceCount: 0, wins: 0, comboCount: 0,
      gradeS: 0, dailyClaimed: 0, tierUps: 0,
    },
    // 每门功法的局内最佳：{ score, grade, at }，用于「破纪录」反馈与功法页展示。
    records: {},
    daily: { date: todayKey(Date.now()), count: 0, claimed: false },
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
  if (v < 2) {
    // v1 -> v2：引入微信头像云存储路径，缺省为空即用 CSS 道相。
    next = Object.assign({}, next, { version: 2, avatar: '' });
  }
  if (v < 3) {
    // v2 -> v3：引入各门功法的局内最佳纪录。
    next = Object.assign({}, next, { version: 3, records: {} });
  }
  if (v < 4) {
    // v3 -> v4：品阶改「天地玄黄」，难度改由熟练度解锁（不再存在存档里的「苦修」开关）。
    // 存档字段未变，只统一版本号；纪录与熟练度原样保留。
    next = Object.assign({}, next, { version: 4 });
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
  base.avatar = typeof raw.avatar === 'string' ? raw.avatar.slice(0, 200) : '';
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
  base.repeatCount = Math.floor(num(raw.repeatCount, 0));
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

function powerDetail(state) {
  const w = worldData.getWorld(state.worldId);
  const attrs = computeAttributes(state);
  let base = 0;
  for (let i = 0; i < w.attributes.length; i += 1) {
    base += (attrs[w.attributes[i].key] || 0) * w.attributes[i].weight;
  }
  const realm = w.realms[state.realmIndex] || w.realms[0];
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
}

function pickIdleSkill(state) {
  const last = state.lastPractice.skillId;
  if (last && state.skills[last] && state.skills[last].unlocked && state.skills[last].prof < 2500) return last;
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    const rec = state.skills[s.id];
    if (rec && rec.unlocked && rec.prof < 2500) return s.id;
  }
  return skillData.SKILLS[0].id;
}

function settleOffline(state) {
  const now = Date.now();
  const w = worldData.getWorld(state.worldId);
  const last = num(state.lastSeen, now);
  // 时钟倒退（改系统时间，或云端存档来自时间超前的设备）：不结算、也不把回拨值写进存档。
  if (last > now) {
    state.lastSeen = last;
    checkDaily(state);
    return null;
  }
  const elapsedMs = Math.max(0, now - last);
  const capMs = w.idle.capHours * 3600 * 1000;
  const cappedMs = Math.min(elapsedMs, capMs);
  const minutes = Math.floor(cappedMs / 60000);
  state.lastSeen = now;
  checkDaily(state);
  if (minutes < 1) return null;

  const buff = state.buff || { multiplier: 1, until: 0 };
  let buffMinutes = 0;
  if (buff.until > last && buff.multiplier > 1) {
    buffMinutes = Math.max(0, Math.min(minutes, Math.floor((buff.until - last) / 60000)));
  }
  const effectiveMinutes = buffMinutes * buff.multiplier + (minutes - buffMinutes);
  const idleBonus = effectValue(state, 'offline');
  const qi = Math.floor(effectiveMinutes * w.idle.qiPerMinute * (1 + idleBonus));
  const hours = cappedMs / 3600000;
  const prof = Math.floor(hours * w.idle.profPerHour);
  const skillId = pickIdleSkill(state);
  const skillName = skillData.getSkill(skillId) ? skillData.getSkill(skillId).name : '功法';

  state.resources.qi += qi;
  if (state.skills[skillId]) state.skills[skillId].prof += prof;
  addLog(state, '闭关 ' + Math.floor(minutes / 60) + ' 时 ' + (minutes % 60) + ' 分，灵气 +' + qi + '，' + skillName + ' +' + prof, 'idle');
  return {
    minutes: minutes,
    hours: Math.round(hours * 10) / 10,
    capped: elapsedMs > capMs,
    qi: qi,
    prof: prof,
    skillName: skillName,
    buffMinutes: buffMinutes,
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
  state.resources.qi += w.daily.qi;
  state.resources.stone += w.daily.stone;
  const added = checkTitles(state);
  addLog(state, '领了今日参悟的份例：灵气 +' + w.daily.qi + '，灵石 +' + w.daily.stone, 'daily');
  return { ok: true, qi: w.daily.qi, stone: w.daily.stone, newTitles: added };
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

  const factor = worldData.GRADE_FACTOR[grade] || 0.6;
  const attrs = computeAttributes(state);
  const wuFactor = Math.min(1.6, 1 + (attrs.wu || 0) / 200);
  const practiceBonus = effectValue(state, 'practice');

  const isRepeat = state.lastPractice.skillId === skillId;
  const repeatCount = isRepeat ? Math.min(6, (state.repeatCount || 0) + 1) : 0;
  const restless = Math.pow(0.85, repeatCount);
  const cross = !isRepeat && !!state.lastPractice.skillId;
  const crossBonus = cross ? 1.15 : 1;

  // 一个维度只管一件事：品阶管倍率、难度档管倍率与对局参数、评级管这一局打得好不好、境界管衰减。
  // 四个系数连乘后按 MAX_MULTIPLIER 封顶，避免「天阶 + 绝境 + S」把熟练度曲线一次打穿。
  const tier = practiceData.tierOf(skill.tier);
  const w = worldData.getWorld(state.worldId);
  const realmNow = state.realmIndex + 1;
  const maxRealmName = w.realms[Math.min(w.realms.length - 1, tier.maxRealm - 1)].name;
  const needRealmName = w.realms[Math.min(w.realms.length - 1, tier.needRealm - 1)].name;
  // 境界两头都管：没到门槛修不动（机缘/掉落提前拿到也一样），超过可修上限则收益衰减。
  // 衰减不为 0：还能练，但该换功法了。
  const realmOk = realmNow >= tier.needRealm && realmNow <= tier.maxRealm;
  const realmDecay = realmOk ? 1 : worldData.REALM_DECAY;

  // 难度档只认这门功法自己的熟练度；越权选高档（例如改页面参数）自动回落到已解锁的最高档。
  const wantIdx = practiceData.diffKeyIndex(opts.difficulty || (opts.hard ? 'hard' : 'easy'));
  const maxIdx = practiceData.diffIndexOf(rec.prof);
  const fellBack = wantIdx > maxIdx;
  const diff = practiceData.DIFFICULTIES[Math.min(wantIdx, maxIdx)];

  const coreRaw = tier.reward * diff.mult * factor * realmDecay;
  const coreMult = Math.min(worldData.MAX_MULTIPLIER, coreRaw);
  const capped = coreRaw > worldData.MAX_MULTIPLIER + 1e-9;

  const gain = Math.max(1, Math.round(method.base * coreMult * wuFactor * (1 + practiceBonus) * restless * crossBonus));

  // 局内得分第一次真正进入养成：记住本门最佳，给重复参悟一个可追的目标。
  if (!state.records) state.records = {};
  const score = Math.max(0, Math.floor(num(opts.score, 0)));
  const prev = state.records[skillId];
  const prevBest = prev ? Math.floor(num(prev.score, 0)) : 0;
  const newRecord = score > prevBest;
  if (newRecord) state.records[skillId] = { score: score, grade: grade, at: Date.now() };
  else if (!prev) state.records[skillId] = { score: 0, grade: grade, at: Date.now() };
  const bestScore = Math.max(prevBest, score);

  state.lastPractice = { skillId: skillId, at: Date.now() };
  state.repeatCount = repeatCount;
  if (cross) state.stats.comboCount += 1;
  rec.prof += gain;

  const qi = Math.round(8 + factor * 10);
  const stone = grade === 'S' ? 3 : grade === 'A' ? 2 : grade === 'B' ? 1 : 0;
  state.resources.qi += qi;
  state.resources.stone += stone;

  const newMult = grade === 'S' ? 1.8 : grade === 'A' ? 1.5 : grade === 'B' ? 1.25 : 1.1;
  const until = Date.now() + 30 * 60 * 1000;
  const cur = state.buff || { multiplier: 1, until: 0 };
  if (cur.until > Date.now() && cur.multiplier > newMult) {
    state.buff = { multiplier: cur.multiplier, until: Math.max(cur.until, until) };
  } else {
    state.buff = { multiplier: newMult, until: until };
  }

  state.stats.practiceCount += 1;
  if (grade === 'S') state.stats.gradeS += 1;
  state.daily.count += 1;
  const afterTier = tierIndex(rec.prof);
  if (afterTier > beforeTier) {
    state.stats.tierUps += (afterTier - beforeTier);
    addLog(state, skill.name + ' 参悟至「' + worldData.TIERS[afterTier].name + '」', 'tier');
  } else {
    addLog(state, '参悟 ' + skill.name + '，熟练度 +' + gain + '（' + grade + ' 档）', 'practice');
  }

  // 机缘事件：小概率额外收获，也是技能获取途径之一
  let fortune = null;
  if (Math.random() < 0.06) {
    const r = Math.random();
    const locked = [];
    for (let i = 0; i < skillData.SKILLS.length; i += 1) {
      const s = skillData.SKILLS[i];
      if (!state.skills[s.id].unlocked) locked.push(s);
    }
    if (r < 0.12 && locked.length > 0) {
      const pick = locked[Math.floor(Math.random() * locked.length)];
      state.skills[pick.id].unlocked = true;
      fortune = { type: 'skill', text: '机缘：石阶上拾得残卷《' + pick.name + '》', name: pick.name };
      addLog(state, fortune.text, 'fortune');
    } else if (r < 0.55) {
      const n = 15 + Math.floor(Math.random() * 25);
      state.resources.stone += n;
      fortune = { type: 'stone', text: '机缘：石缝里摸到 ' + n + ' 枚灵石', amount: n };
    } else {
      const n = 30 + Math.floor(Math.random() * 50);
      state.resources.qi += n;
      fortune = { type: 'qi', text: '机缘：一阵灵风拂过，灵气 +' + n, amount: n };
    }
  }

  return {
    ok: true,
    grade: grade,
    gradeTitle: worldData.GRADE_TITLE[grade] || '粗浅',
    gradeColor: worldData.GRADE_COLOR[grade] || '#8a8f83',
    skillName: skill.name,
    methodName: method.name,
    gain: gain,
    qi: qi,
    stone: stone,
    profBefore: profBefore,
    profAfter: rec.prof,
    tierBefore: beforeTier,
    tierAfter: afterTier,
    tierUp: afterTier > beforeTier,
    tierName: worldData.TIERS[afterTier].name,
    restless: repeatCount > 0 ? repeatCount : 0,
    cross: cross,
    // 倍率构成：品阶 × 难度档 × 评级 × 境界衰减，封顶后才是实际入账的倍率。
    tierKey: tier.key,
    tierLabel: tier.label,
    tierReward: tier.reward,
    tierColor: tier.color,
    diffKey: diff.key,
    diffName: diff.name,
    diffMult: diff.mult,
    diffFellBack: fellBack,
    diffMaxName: practiceData.DIFFICULTIES[maxIdx].name,
    realmDecay: realmDecay,
    decayed: realmDecay < 1,
    realmReason: realmOk ? '' : (realmNow < tier.needRealm ? '未到「' + needRealmName + '」门槛' : '已超「' + maxRealmName + '」上限'),
    maxRealmName: maxRealmName,
    needRealmName: needRealmName,
    coreRaw: Math.round(coreRaw * 100) / 100,
    coreMult: Math.round(coreMult * 100) / 100,
    capped: capped,
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
  const power = computePower(state);
  const effects = activeBattleEffects(state);
  const rolls = rollBattle(power, c.power, effectValue(state, 'variance'));
  const win = rolls.playerRoll >= rolls.enemyRoll;
  const firstClear = win && state.defeated.indexOf(c.id) < 0;

  let qi = win ? c.reward.qi : Math.round(c.reward.qi * 0.15);
  let stone = win ? c.reward.stone : 0;
  state.resources.qi += qi;
  state.resources.stone += stone;
  if (win) state.stats.wins += 1;

  let dropName = '';
  if (firstClear) {
    state.defeated.push(c.id);
    stone += 5;
    state.resources.stone += 5;
    if (c.drop && state.skills[c.drop] && !state.skills[c.drop].unlocked) {
      state.skills[c.drop].unlocked = true;
      const s = skillData.getSkill(c.drop);
      dropName = s ? s.name : '';
      addLog(state, '战胜 ' + c.name + '，得《' + dropName + '》', 'battle');
    } else {
      addLog(state, '首胜 ' + c.name + '，灵石 +' + stone, 'battle');
    }
  } else {
    addLog(state, (win ? '胜 ' : '负于 ') + c.name + '，战力 ' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  }

  return {
    ok: true,
    win: win,
    firstClear: firstClear,
    challengeName: c.name,
    challengeTitle: c.title,
    power: power,
    enemyPower: c.power,
    playerRoll: rolls.playerRoll,
    enemyRoll: rolls.enemyRoll,
    effects: effects,
    qi: qi,
    stone: stone,
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
  const power = computePower(state);
  const effects = activeBattleEffects(state);
  const rolls = rollBattle(power, mirror.power, effectValue(state, 'variance'));
  const win = rolls.playerRoll >= rolls.enemyRoll;
  const qi = win ? 60 : 10;
  const stone = win ? 8 : 0;
  state.resources.qi += qi;
  state.resources.stone += stone;
  if (win) state.stats.wins += 1;
  addLog(state, '与镜像道友论道，' + (win ? '胜' : '负') + '，' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  return {
    ok: true, win: win, challengeName: '镜像道友', challengeTitle: '战力码论道',
    power: power, enemyPower: mirror.power,
    playerRoll: rolls.playerRoll, enemyRoll: rolls.enemyRoll,
    effects: effects, qi: qi, stone: stone, dropName: '',
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
  const power = computePower(state);
  return {
    maxed: maxed,
    currentName: w.realms[state.realmIndex].name,
    nextName: next ? next.name : '',
    need: next ? next.power : 0,
    power: power,
    available: !!next && power >= next.power,
  };
}

function applyBreakthrough(state, grade) {
  const info = breakthroughInfo(state);
  if (info.maxed || !info.available) return { ok: false, msg: '尚未到突破之时' };
  if (grade === 'F') {
    addLog(state, '冲击 ' + info.nextName + ' 未成，气机散了', 'realm');
    return { ok: false, hit: false, msg: '气机一乱，未能突破。再来一次就好。' };
  }
  state.realmIndex += 1;
  const w = worldData.getWorld(state.worldId);
  const qi = 50 * (state.realmIndex + 1);
  const stone = (grade === 'S' ? 30 : grade === 'A' ? 20 : 10) * (state.realmIndex + 1);
  state.resources.qi += qi;
  state.resources.stone += stone;
  addLog(state, '突破至「' + w.realms[state.realmIndex].name + '」', 'realm');
  return {
    ok: true, hit: true, grade: grade,
    realmName: w.realms[state.realmIndex].name,
    qi: qi, stone: stone,
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
  const lack = [];
  if (state.resources.qi < cost.qi) lack.push('灵气 ' + (cost.qi - state.resources.qi));
  if (state.resources.stone < cost.stone) lack.push('灵石 ' + (cost.stone - state.resources.stone));
  if (lack.length > 0) return { ok: false, msg: '还差 ' + lack.join('、') };
  state.resources.qi -= cost.qi;
  state.resources.stone -= cost.stone;
  state.skills[skillId].unlocked = true;
  addLog(state, '于藏经阁换得《' + s.name + '》', 'skill');
  return { ok: true, name: s.name, cost: cost, newTitles: checkTitles(state) };
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
  if (patch.avatar !== undefined) {
    const a = typeof patch.avatar === 'string' ? patch.avatar.trim() : '';
    if (a && (a.indexOf('users/') !== 0 || a.indexOf('..') >= 0)) {
      return { ok: false, msg: '头像路径不合法' };
    }
    state.avatar = a.slice(0, 200);
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
  const enemyPower = Math.max(0, Math.floor(Number(rival.power)));
  const power = computePower(state);
  const effects = activeBattleEffects(state);
  const rolls = rollBattle(power, enemyPower, effectValue(state, 'variance'));
  const win = rolls.playerRoll >= rolls.enemyRoll;
  const qi = win ? 60 : 10;
  const stone = win ? 8 : 0;
  state.resources.qi += qi;
  state.resources.stone += stone;
  if (win) state.stats.wins += 1;
  const name = typeof rival.name === 'string' && rival.name ? rival.name.slice(0, 12) : '榜单道友';
  addLog(state, '与「' + name + '」论道，' + (win ? '胜' : '负') + '，' + rolls.playerRoll + ' : ' + rolls.enemyRoll, 'battle');
  return {
    ok: true, win: win, challengeName: name, challengeTitle: '实录论道',
    power: power, enemyPower: enemyPower,
    playerRoll: rolls.playerRoll, enemyRoll: rolls.enemyRoll,
    effects: effects, qi: qi, stone: stone, dropName: '',
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
  if (src.kind === 'shop') return '藏经阁：灵气 ' + src.cost.qi + ' / 灵石 ' + src.cost.stone;
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
    const realmOk = realmNow >= tier.needRealm && realmNow <= tier.maxRealm;
    const best = state.records ? state.records[s.id] : null;
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
      gameName: method.gameName,
      // 品阶（天地玄黄）：只管收益倍率、属性加成与可修上限。
      tierKey: tier.key,
      tierName: tier.name,
      tierLabel: tier.label,
      tierColor: tier.color,
      tierStars: tier.stars,
      starsText: starsTextOf(tier.stars),
      tierDesc: tier.desc,
      tierReward: tier.reward,
      rewardText: '熟练度 ×' + tier.reward.toFixed(2),
      // 可修境界：未达门槛或超过上限，收益都衰减到 30%，熟练度仍可涨。
      maxRealm: tier.maxRealm,
      maxRealmName: realmNameOf(state, tier.maxRealm),
      decayed: !realmOk,
      decayText: realmOk
        ? ''
        : (realmNow < tier.needRealm
          ? '未到「' + realmNameOf(state, tier.needRealm) + '」门槛，收益仅剩 30%'
          : '境界已超本门上限（' + realmNameOf(state, tier.maxRealm) + '），收益仅剩 30%'),
      needRealm: tier.needRealm,
      needRealmName: realmNameOf(state, tier.needRealm),
      realmOk: realmOk,
      // 难度档：只看本门熟练度，与品阶无关。
      diffName: diffNow.name,
      diffMult: diffNow.mult,
      diffText: '最高可选「' + diffNow.name + '」×' + diffNow.mult.toFixed(1),
      bestText: best ? best.score + ' 分 · ' + best.grade + ' 档' : '',
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

// 修炼建议：首页只回答一个问题——现在练哪门、为什么、下一步是什么。
// 排序不看品阶也不看熟练度绝对值，看「离下一个阶段最近」，并按阶段跨度归一，
// 免得高熟练度功法永远霸榜；已达可修上限（收益只剩三成）的功法往后压。
function recommend(state) {
  const list = getSkillList(state);
  const pool = list.filter(function (s) { return s.unlocked; });
  const usable = pool.filter(function (s) { return !s.maxed && s.realmOk; });
  const cand = usable.length ? usable : pool.filter(function (s) { return !s.maxed; });

  let pick = null;
  for (let i = 0; i < cand.length; i += 1) {
    const s = cand[i];
    const floor = worldData.TIERS[s.tierIndex] ? worldData.TIERS[s.tierIndex].threshold : 0;
    const span = Math.max(1, s.nextThreshold - floor);
    const ratio = Math.max(0, s.nextThreshold - s.prof) / span;
    const bias = (s.realmOk ? 0 : 0.35) - (s.prof === 0 ? 0.05 : 0);
    const score = ratio + bias;
    if (!pick || score < pick.score) pick = { skill: s, score: score, ratio: ratio };
  }

  if (!pick) {
    return {
      id: '', name: '十门皆已圆满', methodName: '本门无新课',
      profTierName: '大圆满', profTierColor: worldData.TIERS[worldData.TIERS.length - 1].color,
      gap: 0, percent: 100, maxed: true,
      reason: '十门功法都练到了大圆满',
      next: '去论道台试试秘境，那里还有没打过的对手。',
    };
  }

  const s = pick.skill;
  const gap = Math.max(0, s.nextThreshold - s.prof);
  const idx = practiceData.diffIndexOf(s.prof);
  const nextDiff = practiceData.DIFFICULTIES[idx + 1];
  let next;
  if (!s.realmOk) next = s.decayText + '，这门先放一放。';
  else if (nextDiff && nextDiff.need - s.prof <= gap) next = '先到 ' + nextDiff.need + ' 熟练度解锁「' + nextDiff.name + '」档，倍率 ×' + nextDiff.mult.toFixed(1) + '。';
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
        rewardText: '×' + tier.reward.toFixed(2),
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
        rewardText: '×' + tiers[r].reward.toFixed(2),
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
    let hint = '势均力敌';
    if (power >= c.power * 1.2) hint = '胜算在握';
    else if (power >= c.power * 0.95) hint = '略占上风';
    else if (power < c.power * 0.7) hint = '尚需苦修';
    else hint = '略有不及';
    out.push({
      id: c.id,
      kind: c.kind,
      name: c.name,
      title: c.title,
      desc: c.desc,
      power: c.power,
      qi: c.reward.qi,
      stone: c.reward.stone,
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

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  SAVE_PREFIX: SAVE_PREFIX,
  SAVE_VERSION: SAVE_VERSION,
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
  computeMetrics: computeMetrics,
  checkTitles: checkTitles,
  checkDaily: checkDaily,
  settleOffline: settleOffline,
  buffInfo: buffInfo,
  claimDaily: claimDaily,
  applyPractice: applyPractice,
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
  getFamilies: getFamilies,
  recommend: recommend,
  starsOf: starsTextOf,
  getChallengeList: getChallengeList,
  getTitleList: getTitleList,
  getTopSkills: getTopSkills,
  readStorage: readStorage,
  writeStorage: writeStorage,
};
