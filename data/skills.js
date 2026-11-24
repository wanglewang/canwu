'use strict';

const practiceData = require('./practice.js');

// 技能表。段位门槛走 world.js 的 TIERS，品阶与可修境界走 practice.js 的 TIERS。
// effect.type 五种，各管一件事，互不重叠（见 utils/game.js 的 effectValue）：
//   power    对战战力 %；
//   variance 对战波动下限；
//   qiSave   参悟省灵力 %；
//   offline  闭关养回灵力的速度 %；
//   qiCap    气海上限 %（心法专属：练心法＝把池子挖深）。
// 强度随段位成长：入门 1/4、小成 1/2、大成 3/4、圆满起满额（EFFECT_TIER_SCALE）。
// 旧版是「走到某一档才一次性生效」，中前期所有特效都等于不存在——
// 那正是「练了也感觉不到」的来源，所以改成逐段兑现。
// source.kind：start 初始 / shop 藏经阁 / battle 首胜掉落 / chance 机缘
// source.cost：只收灵石。灵力是练功的燃料，不是通货——参悟本身就要烧它，
//              再用它买功法等于让玩家「用油买油」，两种货币的分工当场糊掉。
// kind：main 主修（心法，决定修炼速度）/ skill 技艺（刀法、剑法、阵法、丹道、御灵、土行、灵植、
//       神识、机关、水术、身法——空族留着，加回功法时直接用）
// tier：huang 黄 / xuan 玄 / di 地 / tian 天 —— 只决定收益倍率、属性加成与可修境界上限，不决定难度。
// 关卡与品阶无关：一门 1000 关五段，走通段界关才进下一段（见 data/practice.js 的 STAGES）。

// ---------------------------------------------------------------- 功法命名规范
// 改版前这门那门「有的带前缀、有的不带；前缀还各写各的」：基础刀法 / 吐纳周天诀 没前缀，
// 剑诀·断岳 的前缀是「剑诀」而类别是「剑法」，灵契·并蒂连枝引 的前缀是「灵契」而类别是「御灵」，
// 剩下的又分 阵法 / 心法 / 身法 / 丹道 / 土术 / 灵植 六种，长度也从 2 到 4 字不等。
// （原「符箓」一族已撤：那一门从头到尾是格盘推理，与画符无关，见 leifu 条目。）
// 规则定死成一条，新增功法照着填，scripts/verify.js 与 tests/layout.test.js 会逐门校验：
//   name = 类别(type) + '·' + 四到六字正名
//   · 前缀严格取 type，一字不差，不再自造「剑诀 / 灵契」这类类别词；
//   · 全表只用间隔号「·」，且只出现一次；
//   · 正名四到六字，末字用体裁字（诀 / 步 / 引），按载体取，不按品阶取；
//   · 正名走「意象 + 体裁字」：前几字给一个说得出口的意象或典故，末字是体裁字。
//     盘上具体做什么，写在方法页与说明页，不写进名字——名字是门派里对这门功课的叫法，
//     不是关卡目标。反例：移山开路诀（华容道的胜利条件，2026-11-18 改为移星换斗诀）、
//     移石归阵诀（推箱子的目标）、摘星辨魁诀（操作提示）——读完就知道怎么玩，反而不像功法；
//     现有 15 门统一五字；
//   · 正名不得与参悟方式名、玩法名重复（三层命名各管一件事）；
//   · 不用「入门 / 基础 / 小」这类等级词，品阶由 tier 与卡片角标表达，不写进名字。
// id 是存档主键，改名字一律不动 id。对白 / 行文里可用简称，正式名只认这里的 name。
//
// 为什么从三字改成五字：三字装不下一个意象加一个体裁字。旧名里「三秀」「叠元」「摘魁」
// 各是一个查不到出处的生词——列表扫过去只看得见「这也是一门功课」。
// 原先「三字」的理由是卡片宽度，实测五字仍是一行（`pages/skills/skills.wxss`
// 的 `.sk-name` 单行截断，五字在 320px 上也放得下），于是把字数让给意象：
//   三秀连收诀 = 三株灵苗 · 连成一线收取；同源叠元诀 = 两枚同数 · 相叠成更高一元；
//   摘星辨魁诀 = 一批数里 · 一眼挑出最大的那个。
// （这三行是当时「看到名字该想到什么」的释义，不是起名的公式；2026-11-18 三秀连收 /
//   同源叠元又改成意象正名三秀撷英 / 同源归一，按现行规则名字本身不许说怎么玩。）
//
// 2026-11 整批重归：这十五门原来的类别叫「术数 / 合术 / 目术 / 辨术 / 机巧 / 挪移 / 土术」，
// 那是按「玩家在屏幕上做什么」分的（扫视 / 比较 / 合并 / 推箱），读着像《封神演义》里
// 的左道旁门，跟现代玄幻修仙的门类对不上。现代玄幻按「修士靠什么手段修行」分：
// 丹师炼丹、阵师布阵、剑修用剑、体修练肉身、炼神靠神识。于是重归成九类：
// 心法 3 / 阵法 3 / 神识 2 / 机关 2 / 刀法 1 / 丹道 1 / 御灵 1 / 灵植 1 / 土行 1。
// 十二类里十个只有一门 → 九个里五个只有一门，且留下那五个都是玩家认得的门类。
// 旧三字名全部进 `scripts/verify.js` 的旧名黑名单，不许回来。
const NAME_RULE = {
  sep: '·',
  titleMin: 4,
  titleMax: 6,
  // 白名单只留在用的体裁字：撤掉一族（符箓）或改掉正名时，
  // 旧字必须跟着删——留着它不会报错，但会让「XX·YY阵」这类名字蒙混过校验。
  // validateNames 会反过来查「白名单里有没有谁一整个字没人用」，逼着一起收窄。
  suffixes: ['诀', '引'],
};

// 返回全部不合规说明；空数组表示命名规范全表通过。供静态校验与页面自检复用。
function validateNames() {
  const issues = [];
  const seen = {};
  const suffixByType = {};
  for (let i = 0; i < SKILLS.length; i += 1) {
    const s = SKILLS[i];
    const parts = s.name.split(NAME_RULE.sep);
    if (parts.length !== 2) {
      issues.push(s.id + '：必须用「类别' + NAME_RULE.sep + '正名」，且只出现一个分隔符');
      continue;
    }
    if (parts[0] !== s.type) issues.push(s.id + '：前缀「' + parts[0] + '」与类别「' + s.type + '」不一致');
    const title = parts[1];
    // 上限管卡片（五字一行，六字是极限），下限管可读性（三字说不出物件与动作）。
    if (title.length < NAME_RULE.titleMin || title.length > NAME_RULE.titleMax) {
      issues.push(s.id + '：正名「' + title + '」是 ' + title.length + ' 字，须在 '
        + NAME_RULE.titleMin + '–' + NAME_RULE.titleMax + ' 字之间');
    }
    const suffix = title.slice(-1);
    if (NAME_RULE.suffixes.indexOf(suffix) < 0) issues.push(s.id + '：正名末字「' + suffix + '」不是体裁字');
    // 同族功法共用一个体裁字，否则列表里「诀 / 阵 / 方」随机跳，统一感就散了。
    if (suffixByType[s.type] && suffixByType[s.type] !== suffix) {
      issues.push(s.id + '：类别「' + s.type + '」的体裁字应是「' + suffixByType[s.type] + '」，不能混用');
    }
    suffixByType[s.type] = suffix;
    if (/入门|基础|初级|小|大/.test(title)) issues.push(s.id + '：正名里带了等级词，品阶请交给 tier');
    const method = practiceData.getMethod(s.method);
    if (title === method.name || title === method.gameName) issues.push(s.id + '：正名与参悟方式名 / 玩法名重复');
    if (title.indexOf(s.type) === 0) issues.push(s.id + '：正名不该重复类别词');
    if (seen[s.name]) issues.push(s.id + '：功法名与 ' + seen[s.name] + ' 重复');
    seen[s.name] = s.id;
  }
  // 白名单反向自检：体裁字表里每一字都得真有人用。撤族 / 改名后忘了收窄，
  // 白名单会比现实宽，校验随之放水；这里让它自己报出来。
  const usedSuffixes = {};
  for (const type of Object.keys(suffixByType)) usedSuffixes[suffixByType[type]] = type;
  for (const suffix of NAME_RULE.suffixes) {
    if (!usedSuffixes[suffix]) {
      issues.push('体裁字「' + suffix + '」在 NAME_RULE.suffixes 里已无人使用，请从白名单删掉');
    }
  }
  return issues;
}

const SKILLS = [
  {
    // id 沿用旧名（基础剑法），存档与纪录都按 id 索引，改名一律不动 id。
    // 旧名「基础刀法」：无前缀且带等级词，按命名规范改为「刀法·开锋破军诀」（新刀开刃，入门第一课）。
    id: 'jian', name: '刀法·开锋破军诀', type: '刀法', kind: 'skill', tier: 'huang', method: 'forge',
    desc: '外门人人会，练到极处的没几个。',
    flavor: '刀是死的，手腕是活的。',
    bonus: { shen: 3, ti: 1 },
    effect: { type: 'power', value: 0.06, text: '刀意：对战战力 +6%' },
    source: { kind: 'start' },
  },
  {
    // 阵灯推演是十五门里最费脑的一门，挂在黄阶会让「练得最苦、拿得最少」；
    // 提到地阶后运功耗气 ×1.30、属性 ×1.7、可修上限抬到元婴；代价是超出上限时再 ×1.5。
    // 名字去掉「入门」：地阶功法再叫入门，就是玩家一眼看得见的名实相斥。
    id: 'zhen', name: '阵法·星罗烛天诀', type: '阵法', kind: 'skill', tier: 'di', method: 'arrayEye',
    desc: '一灯明，四面翻；落子一处，自身与上下左右四格明暗相易，全阵齐明，阵破功成。',
    flavor: '一步推错，满盘皆要重来。',
    bonus: { ling: 3, wu: 1 },
    effect: { type: 'variance', value: 0.05, text: '灯势：对战波动下限提高' },
    source: { kind: 'start' },
  },
  {
    // 旧名「吐纳诀」：缺类别前缀，先补成「心法·吐纳诀」；正名扩到五字后作「吐纳周天诀」，
    // 把「一息走完一个周天」这件事写进名字——它练的是节律，不是憋气。
    id: 'tuna', name: '心法·吐纳周天诀', type: '心法', kind: 'main', tier: 'huang', method: 'absorb',
    desc: '最不起眼的功课，也是最长久的功课。',
    flavor: '一日不练，自己知道。',
    bonus: { ling: 2, ti: 2 },
    // 心法管气海：三重心法合起来把池子挖深 25%（economy.QI_CAP_SKILL_MAX = 30% 封顶）。
    // 它不再给「离线灵力 +10%」——恢复速度已由另外三门（五行 / 三秀 / 辨魁）管着，
    // 一门效果只管一件事，玩家才看得懂自己练的是哪一项。
    effect: { type: 'qiCap', value: 0.10, text: '周天：灵力上限 +10%' },
    source: { kind: 'start' },
  },
  {
    id: 'jingxin', name: '心法·澄心默诵诀', type: '心法', kind: 'main', tier: 'xuan', method: 'recite',
    desc: '心不浮，气才沉得下去。',
    flavor: '师兄说这口诀没用，他练了三年还在炼气。',
    bonus: { wu: 4 },
    effect: { type: 'qiSave', value: 0.08, text: '澄心：参悟耗灵力 −8%' },
    source: { kind: 'shop', cost: { stone: 70 } },
  },
  {
    // id 沿用旧名（引雷符），存档与纪录都按 id 索引，改名一律不动 id。
    // 原名「符箓·照影符」：这门功课从头到尾是「看数字推禁制位置」，没有一处是画符——
    // 符是纸上画出来的东西，跟格盘推理不相干，属于类别与玩法相斥。
    // 归「阵法」才与玩法同源：黄阶勘禁（静态推理）→ 玄阶五行（动态连锁）→ 地阶点灯（步数最省），
    // 一族三档正好补齐，族内也是「盘上推演」这一个共同点。
    // 难度低于另两门阵法，所以仍在黄阶；可修上限只到筑基，练到头该换地阶那门。
    id: 'leifu', name: '阵法·洞微勘禁诀', type: '阵法', kind: 'skill', tier: 'huang', method: 'tanlei',
    desc: '禁制埋在石格下，只有周围几格露出的数字能看。按数字把禁位一处处勘出来。',
    flavor: '禁制不响，只数数给你听。',
    bonus: { ling: 4, wu: 1 },
    effect: { type: 'qiSave', value: 0.10, text: '勘禁：参悟耗灵力 −10%' },
    source: { kind: 'start' },
  },
  {
    // 2026-11：天阶两门里「截锋断岳诀」已删、本门降阶，天阶不再有功法（校验已放宽）。
    // 心法族因此出现两门黄阶（吐纳 + 太虚）：谱系改为同族同阶可并列，不再按阶取槽丢门。
    // 气海上限 +15% 保留——它按 effect 值算，与 tier 无关；与吐纳 +10% 合计仍是 25%。
    id: 'taixu', name: '心法·太虚照见诀', type: '心法', kind: 'main', tier: 'huang', method: 'seal',
    desc: '青云界压箱底的功课，据说练到大成能看见别的世界。',
    flavor: '别的世界？大概是科幻和都市吧。',
    bonus: { wu: 5, ling: 3 },
    effect: { type: 'qiCap', value: 0.15, text: '太虚：灵力上限 +15%' },
    source: { kind: 'battle', opponentId: 'xuanzhen' },
  },
  // 三套「看一眼就会玩」的经典玩法统一挂黄阶：品阶按功课难度定，不按新奇程度定。
  // 从「藏经阁卖」改成「入门即得」：玩家第一次打开游戏，最想玩的正是这几套，
  // 摆一道灵石墙只会把人挡在门口。非经典的功课（澄心 / 踏云）才留在藏经阁。
  {
    // 旧名「灵契·并蒂引」：前缀「灵契」与类别「御灵」不符，统一成类别名；五字后作「并蒂连枝引」。
    id: 'lingqi', name: '御灵·并蒂连枝引', type: '御灵', kind: 'skill', tier: 'huang', method: 'linkpair',
    desc: '两枚同纹灵石本是一对，牵一条灵线把它们收回契中；越往后折数收得越紧。',
    flavor: '师父说这叫并蒂，你觉得这叫连连看。',
    bonus: { ling: 3, shen: 2 },
    effect: { type: 'qiSave', value: 0.08, text: '并蒂：参悟耗灵力 −8%' },
    source: { kind: 'start' },
  },
  {
    id: 'leiyue', name: '土行·万石成岳诀', type: '土行', kind: 'skill', tier: 'huang', method: 'stackstone',
    desc: '灵石按息坠落，垒满一层化去一层，根基就是这么一寸寸垫起来的。',
    flavor: '练之前以为要搬山，练之后发现自己只是在码石头。',
    bonus: { ti: 4, ling: 1 },
    effect: { type: 'power', value: 0.05, text: '成岳：对战战力 +5%' },
    source: { kind: 'start' },
  },
  {
    id: 'sanxiu', name: '灵植·三秀撷英诀', type: '灵植', kind: 'skill', tier: 'huang', method: 'harvest',
    desc: '灵畦植苗：互换相邻两株灵苗，三株同色连成一线即可采收；采收后新苗落下，还能再连锁。',
    flavor: '一畦三秀，收完又长，长得比你收得还快。',
    bonus: { wu: 3, ti: 2 },
    effect: { type: 'offline', value: 0.12, text: '三秀：灵力恢复 +12%' },
    source: { kind: 'start' },
  },
  // 六门经典盘面：与上面三套一样是「看一眼就会玩」，统一黄阶、入门即得。
  // 六门经典盘面按「修士靠什么手段」归门：填数推演归阵法、同级合炼归丹道、
  // 扫视与辨微归神识、滑块与推箱归机关。同族同阶可并列，谱系全列不取槽。
  // 撞了谱系按阶取槽会把后一门盖掉，tests/rank.test.js 守着这条。
  {
    id: 'shudu', name: '阵法·九宫补缺诀', type: '阵法', kind: 'skill', tier: 'huang', method: 'shudu',
    desc: '九宫盘上留着空格，每行、每列、每宫各要 1 到 9 一遍；填满且全对才算完。',
    flavor: '师父说这是数，不是算——算的是别人，数的是自己。',
    bonus: { wu: 4, ling: 1 },
    effect: { type: 'qiSave', value: 0.09, text: '九宫：参悟耗灵力 −9%' },
    source: { kind: 'start' },
  },
  {
    id: 'heyuan', name: '丹道·同源归一诀', type: '丹道', kind: 'skill', tier: 'huang', method: 'heyuan',
    desc: '同数两块一撞就合成双倍，越往上越重；合出本档那一块即完成。',
    flavor: '一加一的道理，练到最后是 1024 加 1024。',
    bonus: { ling: 3, ti: 1 },
    effect: { type: 'power', value: 0.05, text: '归一：对战战力 +5%' },
    source: { kind: 'start' },
  },
  {
    id: 'shumu', name: '神识·遍观毫厘诀', type: '神识', kind: 'skill', tier: 'huang', method: 'shumu',
    desc: '数散在盘上，从 1 顺着点到最后；练的是目光一路扫过去不乱。',
    flavor: '眼睛快的人，打架时也先看见对方的手。',
    bonus: { shen: 4 },
    effect: { type: 'variance', value: 0.04, text: '遍观：对战波动下限提高' },
    source: { kind: 'start' },
  },
  {
    id: 'rongdao', name: '机关·移星换斗诀', type: '机关', kind: 'skill', tier: 'huang', method: 'rongdao',
    desc: '滑块一次挪一格，把主块一路让到盘底出口；走的路越省越算功夫。',
    flavor: '让一步不是退，是给别人腾地方。',
    bonus: { wu: 3, shen: 2 },
    effect: { type: 'qiSave', value: 0.08, text: '移星：参悟耗灵力 −8%' },
    source: { kind: 'start' },
  },
  {
    id: 'tuisuo', name: '机关·移石归阵诀', type: '机关', kind: 'skill', tier: 'huang', method: 'tuisuo',
    desc: '人走在石格上，石箱只推不拉；每块都要推到自己的阵位，一处不落。',
    flavor: '推错了退得回来，账退不回来——这话师父只说一遍。',
    bonus: { ti: 4 },
    effect: { type: 'power', value: 0.04, text: '归阵：对战战力 +4%' },
    source: { kind: 'start' },
  },
  {
    id: 'zeda', name: '神识·摘星辨魁诀', type: '神识', kind: 'skill', tier: 'huang', method: 'zeda',
    desc: '一批数散在盘上，只挑最大的那一个；一批接一批，越往后数越长。',
    flavor: '一眼看出谁最强，剩下的就不必看了。',
    bonus: { shen: 3, wu: 1 },
    effect: { type: 'offline', value: 0.10, text: '辨魁：灵力恢复 +10%' },
    source: { kind: 'start' },
  },
];

const SKILL_MAP = {};
for (let i = 0; i < SKILLS.length; i += 1) {
  SKILL_MAP[SKILLS[i].id] = SKILLS[i];
}

function getSkill(id) {
  return SKILL_MAP[id] || null;
}

function tierOfSkill(id) {
  const s = getSkill(id);
  return s ? s.tier : 'huang';
}

// 按功法类别分组：同类共用一套游戏族，族内按品阶从低到高排成变体链。
// 多门的类别排在前面，缺档的阶位由调用方补空槽，族内的断层一眼可见。
function chainsOf() {
  const map = {};
  for (let i = 0; i < SKILLS.length; i += 1) {
    const t = SKILLS[i].type;
    if (!map[t]) map[t] = [];
    map[t].push(SKILLS[i]);
  }
  const keys = Object.keys(map);
  const out = [];
  for (let i = 0; i < keys.length; i += 1) {
    const arr = map[keys[i]].slice().sort(function (a, b) {
      return practiceData.tierIndexOf(a.tier) - practiceData.tierIndexOf(b.tier);
    });
    out.push({
      type: keys[i],
      items: arr.map(function (s) {
        return { id: s.id, name: s.name, tier: s.tier, method: s.method };
      }),
    });
  }
  out.sort(function (a, b) { return b.items.length - a.items.length || (a.type < b.type ? -1 : 1); });
  return out;
}

function chainOfType(type) {
  const all = chainsOf();
  for (let i = 0; i < all.length; i += 1) if (all[i].type === type) return all[i];
  return { type: type || '', items: [] };
}

module.exports = {
  SKILLS: SKILLS,
  SKILL_MAP: SKILL_MAP,
  NAME_RULE: NAME_RULE,
  validateNames: validateNames,
  getSkill: getSkill,
  tierOfSkill: tierOfSkill,
  chainsOf: chainsOf,
  chainOfType: chainOfType,
};
