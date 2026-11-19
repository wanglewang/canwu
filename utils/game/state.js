'use strict';

// 存档：新建 / 迁移 / 归一 / 读写（`checkDaily` 也在这——它是读档时的一次日历归零）
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。

const { SAVE_VERSION, STORAGE_KEY, economyData, levelData, practiceData, readStorage, skillData, todayKey, worldData, writeStorage } = require('./base.js');
const { qiCap } = require('./profs.js');

// ---------------------------------------------------------------- 存档

function createNewState() {
  const w = worldData.getWorld('xian');
  const skills = {};
  for (let i = 0; i < skillData.SKILLS.length; i += 1) {
    const s = skillData.SKILLS[i];
    // onboarded：这门功法看过首段引导没有（旧字段，等价于 teachSeen[0]，分享码与老断言还在读）。
    // teachSeen：五段各看过引导没有。一门有五段，每段第 1 关给一次引导：
    //   首段讲整门机制，后面四次只讲这一段变在哪。老存档没有这两个键时都是「还没看过」。
    skills[s.id] = {
      unlocked: s.source.kind === 'start', prof: 0, cleared: 0,
      onboarded: false, teachSeen: [false, false, false, false, false], lastAt: 0,
    };
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
    // 一次性发放的记账：{ 礼包 id: 发放时间 }。只增不减，也不随版本迁移清空——
    // 它是「这份档已经拿过哪几笔」的唯一凭据，丢了就等于又发一次。
    gifts: {},
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
      // 老存档没有这个数：一律当 0（＝从没练过），列表里自然落在「没玩过」那一段，
      // 不许拿 lastSeen 之类别的钟来顶——那是整份存档的时间，不是这一门的。
      lastAt: Math.floor(num(r.lastAt, 0)),
      onboarded: !!r.onboarded,
      // 老存档只有 onboarded 一个布尔：它等于「首段看过」，其余四段按没看过处理，
      // 于是升级上来的老玩家第一次进第 11 / 51 / 201 / 501 关时还能各看到一次段界引导。
      teachSeen: (function () {
        const src = Array.isArray(r.teachSeen) ? r.teachSeen : [];
        const out = [];
        for (let i = 0; i < 5; i += 1) out.push(!!src[i] || (i === 0 && !!r.onboarded));
        return out;
      })(),
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
  // 发放记账只认当前在架的礼包 id：老档里可能留着已经下线的 id，没必要一直带着；
  // 反过来，在架的 id 一旦读进来就必须留住——它决定这笔钱还会不会再发一次。
  if (raw.gifts && typeof raw.gifts === 'object') {
    for (let i = 0; i < economyData.GIFTS.length; i += 1) {
      const gid = economyData.GIFTS[i].id;
      if (raw.gifts[gid]) base.gifts[gid] = Math.floor(num(raw.gifts[gid], Date.now()));
    }
  }
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

// 发一次性礼包。幂等：发过就跳过，所以可以放心地挂在每次 settle 上。
// 为什么挂在 settle 而不是挂在 normalizeState（读档）：
//   登录后 hydrate() 会拿云端那份**整个覆盖** state。若在读档里发，云端那份
//   （没有记账）每次冷启动都会被当成「没发过」，于是每次进来又加一千——
//   而下一轮 flush 把带记账的档写回云端时，这一千也跟着变真，等于重开一次赚一次。
//   挂在 settle 上，state 已经是最终那份（本地 / 云端 / 导入都收敛完了），发完即刻落盘，
//   下一秒的 flush 会把记账一起写回云端，之后任何一台设备都不会再发。
function grantGifts(state) {
  if (!state || !state.resources) return null;
  if (!state.gifts || typeof state.gifts !== 'object') state.gifts = {};
  const got = [];
  for (let i = 0; i < economyData.GIFTS.length; i += 1) {
    const g = economyData.GIFTS[i];
    if (!g || !g.id || state.gifts[g.id]) continue;
    const stone = Math.max(0, Math.floor(num(g.stone, 0)));
    state.resources.stone = Math.floor(num(state.resources.stone, 0)) + stone;
    // 时间戳只用来留痕与排查「这笔钱什么时候来的」，不参与任何判定。
    state.gifts[g.id] = Date.now();
    addLog(state, '开山礼：灵石 +' + stone + '（全服一份，只此一次）', 'gift');
    got.push({ id: g.id, stone: stone });
  }
  if (!got.length) return null;
  let total = 0;
  for (let i = 0; i < got.length; i += 1) total += got[i].stone;
  return { items: got, stone: total };
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
module.exports = {
  addLog: addLog,
  checkDaily: checkDaily,
  createNewState: createNewState,
  grantGifts: grantGifts,
  load: load,
  migrateState: migrateState,
  normalizeState: normalizeState,
  num: num,
  save: save,
};
