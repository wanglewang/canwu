'use strict';

const practiceData = require('./practice.js');

// 技能表。熟练度阈值走 world.js 的 TIERS，品阶与可修境界走 practice.js 的 TIERS。
// effect.type：power 对战战力 / variance 对战波动 / practice 参悟收益 / offline 挂机收益
// source.kind：start 初始 / shop 藏经阁 / battle 首胜掉落 / chance 机缘
// kind：main 主修（心法，决定修炼速度）/ skill 技艺（刀法、剑法、阵法、身法、御灵、土术、灵植、
//       水术、术数、合术、目术、机巧、挪移、辨术——丹道这一类暂时空着，留给真正炼丹的功课）
// tier：huang 黄 / xuan 玄 / di 地 / tian 天 —— 只决定收益倍率、属性加成与可修境界上限，不决定难度。
// 难度由玩家在这门功法上的熟练度决定（见 data/practice.js 的 DIFFICULTIES）。

// ---------------------------------------------------------------- 功法命名规范
// 改版前这门那门「有的带前缀、有的不带；前缀还各写各的」：基础刀法 / 吐纳诀 没前缀，
// 剑诀·断岳 的前缀是「剑诀」而类别是「剑法」，灵契·并蒂引 的前缀是「灵契」而类别是「御灵」，
// 剩下的又分 阵法 / 心法 / 身法 / 丹道 / 土术 / 灵植 六种，长度也从 2 到 4 字不等。
// （原「符箓」一族已撤：那一门从头到尾是格盘推理，与画符无关，见 leifu 条目。）
// 规则定死成一条，新增功法照着填，scripts/verify.js 与 tests/layout.test.js 会逐门校验：
//   name = 类别(type) + '·' + 三字正名
//   · 前缀严格取 type，一字不差，不再自造「剑诀 / 灵契」这类类别词；
//   · 全表只用间隔号「·」，且只出现一次；
//   · 正名一律 3 字，末字用体裁字（诀 / 步 / 引），按载体取，不按品阶取；
//   · 正名不得与参悟方式名、玩法名重复（三层命名各管一件事）；
//   · 不用「入门 / 基础 / 小」这类等级词，品阶由 tier 与卡片角标表达，不写进名字。
// id 是存档主键，改名字一律不动 id。对白 / 行文里可用简称，正式名只认这里的 name。
const NAME_RULE = {
  sep: '·',
  titleLength: 3,
  // 白名单只留在用的体裁字：撤掉一族（符箓）或改掉正名（凝露方 → 凝露诀）时，
  // 旧字必须跟着删——留着它不会报错，但会让「XX·YY阵」这类名字蒙混过校验。
  // validateNames 会反过来查「白名单里有没有谁一整个字没人用」，逼着一起收窄。
  suffixes: ['诀', '步', '引'],
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
    if (title.length !== NAME_RULE.titleLength) issues.push(s.id + '：正名「' + title + '」不是 ' + NAME_RULE.titleLength + ' 字');
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
    // 旧名「基础刀法」：无前缀且带等级词，按命名规范改为「刀法·开锋诀」（新刀开刃，入门第一课）。
    id: 'jian', name: '刀法·开锋诀', type: '刀法', kind: 'skill', tier: 'huang', method: 'forge',
    desc: '外门人人会，练到极处的没几个。',
    flavor: '刀是死的，手腕是活的。',
    bonus: { shen: 3, ti: 1 },
    effect: { type: 'power', value: 0.06, text: '刀意：对战战力 +6%' },
    source: { kind: 'start' },
  },
  {
    // 阵灯推演是十九门里最费脑的一门，挂在黄阶会让「练得最苦、拿得最少」；
    // 提到地阶后收益 ×2.2、属性 ×1.7、可修上限抬到元婴，代价是未到金丹只拿三成。
    // 名字去掉「入门」：地阶功法再叫入门，就是玩家一眼看得见的名实相斥。
    id: 'zhen', name: '阵法·燃灯诀', type: '阵法', kind: 'skill', tier: 'di', method: 'arrayEye',
    desc: '一灯明，四面翻；落子一处，自身与上下左右四格明暗相易，全阵齐明，阵破功成。',
    flavor: '一步推错，满盘皆要重来。',
    bonus: { ling: 3, wu: 1 },
    effect: { type: 'variance', value: 0.05, text: '灯势：对战波动下限提高' },
    source: { kind: 'start' },
  },
  {
    // 旧名「吐纳诀」：缺类别前缀，补成「心法·吐纳诀」。
    id: 'tuna', name: '心法·吐纳诀', type: '心法', kind: 'main', tier: 'huang', method: 'absorb',
    desc: '最不起眼的功课，也是最长久的功课。',
    flavor: '一日不练，自己知道。',
    bonus: { ling: 2, ti: 2 },
    effect: { type: 'offline', value: 0.10, text: '周天：离线灵气 +10%' },
    source: { kind: 'start' },
  },
  {
    id: 'jingxin', name: '心法·静心诀', type: '心法', kind: 'main', tier: 'xuan', method: 'recite',
    desc: '心不浮，气才沉得下去。',
    flavor: '师兄说这口诀没用，他练了三年还在炼气。',
    bonus: { wu: 4 },
    effect: { type: 'practice', value: 0.08, text: '静心：参悟熟练度 +8%' },
    source: { kind: 'shop', cost: { qi: 100, stone: 30 } },
  },
  {
    id: 'yunbu', name: '身法·踏云步', type: '身法', kind: 'skill', tier: 'xuan', method: 'combo',
    desc: '落脚之处，皆有次序。',
    flavor: '练成之前，先摔了三十次。',
    bonus: { shen: 4 },
    effect: { type: 'power', value: 0.05, text: '踏云：对战战力 +5%' },
    source: { kind: 'shop', cost: { qi: 130, stone: 45 } },
  },
  {
    // id 沿用旧名（引雷符），存档与纪录都按 id 索引，改名一律不动 id。
    // 原名「符箓·照影符」：这门功课从头到尾是「看数字推禁制位置」，没有一处是画符——
    // 符是纸上画出来的东西，跟格盘推理不相干，属于类别与玩法相斥。
    // 归「阵法」才与玩法同源：黄阶勘禁（静态推理）→ 玄阶五行（动态连锁）→ 地阶燃灯（步数最省），
    // 一族三档正好补齐，族内也是「盘上推演」这一个共同点。
    // 难度低于另两门阵法，所以仍在黄阶；可修上限只到筑基，练到头该换地阶那门。
    id: 'leifu', name: '阵法·勘禁诀', type: '阵法', kind: 'skill', tier: 'huang', method: 'tanlei',
    desc: '禁制埋在石格下，只有周围几格露出的数字能看。按数字把禁位一处处勘出来。',
    flavor: '禁制不响，只数数给你听。',
    bonus: { ling: 4, wu: 1 },
    effect: { type: 'practice', value: 0.10, text: '勘禁：参悟熟练度 +10%' },
    source: { kind: 'shop', cost: { qi: 90, stone: 30 } },
  },
  {
    // 五行相生偏反应、比阵灯推演轻，降到玄阶与燃灯诀排成「玄 → 地」两级。
    // 一族一个品阶只能放一门，否则谱系按阶取槽时后一门会被同阶盖掉。
    // 旧名「阵法·小五行阵」：带等级词「小」，按三字正名规范收成「五行诀」。
    id: 'wuxingzhen', name: '阵法·五行诀', type: '阵法', kind: 'skill', tier: 'xuan', method: 'wuxing',
    desc: '五盏阵灯，牵一发而动全身。',
    flavor: '师父说这叫举一反三，你觉得这叫加班。',
    bonus: { ling: 3, wu: 3 },
    effect: { type: 'offline', value: 0.15, text: '五行：离线灵气 +15%' },
    source: { kind: 'battle', opponentId: 'liuhan' },
  },
  {
    // id 沿用旧名（凝露丹方），存档与纪录都按 id 索引，改名一律不动 id。
    // 旧名「丹道·凝露方」：这门功课练的是竖向河道上采露，一颗丹也没炼——
    // 跟「符箓·照影符」是同一类错：类别写的是题材，玩法却在做另一件事。
    // 按玩法改归「水术」，正名收成「凝露诀」。丹道这一门暂时空缺，等真有一门炼丹的功课再填。
    id: 'dan', name: '水术·凝露诀', type: '水术', kind: 'skill', tier: 'di', method: 'stones',
    desc: '河石上的水纹一层层递推，采对那道纹才上得去。',
    flavor: '一滴露落错了石，下面九层都得重采。',
    bonus: { ling: 3, ti: 2 },
    effect: { type: 'variance', value: 0.06, text: '凝露：对战波动下限提高' },
    source: { kind: 'battle', opponentId: 'puppet' },
  },
  {
    // 旧名「剑诀·断岳」：前缀「剑诀」与类别「剑法」不符，且正名只有两字。
    // 改为「剑法·断岳诀」；兵器仍标 sword，剑法族仍只此一门。
    id: 'duanyue', name: '剑法·断岳诀', type: '剑法', kind: 'skill', tier: 'tian', method: 'snatch',
    desc: '一剑既出，慢的人连剑光都看不见。',
    flavor: '手快的人练剑，是有道理的。',
    bonus: { shen: 4, ti: 2 },
    effect: { type: 'power', value: 0.10, text: '断岳：对战战力 +10%' },
    source: { kind: 'battle', opponentId: 'xueshou' },
  },
  {
    id: 'taixu', name: '心法·太虚诀', type: '心法', kind: 'main', tier: 'tian', method: 'seal',
    desc: '青云界压箱底的功课，据说练到大成能看见别的世界。',
    flavor: '别的世界？大概是科幻和都市吧。',
    bonus: { wu: 5, ling: 3 },
    effect: { type: 'practice', value: 0.12, text: '太虚：参悟熟练度 +12%' },
    source: { kind: 'battle', opponentId: 'xuanzhen' },
  },
  // 三套「看一眼就会玩」的经典玩法统一挂黄阶：品阶按功课难度定，不按新奇程度定。
  // 各占一个新类型，谱系里也不会和既有功法同阶撞车。
  {
    // 旧名「灵契·并蒂引」：前缀「灵契」与类别「御灵」不符，统一成类别名。
    id: 'lingqi', name: '御灵·并蒂引', type: '御灵', kind: 'skill', tier: 'huang', method: 'linkpair',
    desc: '两枚同纹灵石本是一对，牵一条不过两折的灵线，把它们收回契中。',
    flavor: '师父说这叫并蒂，你觉得这叫连连看。',
    bonus: { ling: 3, shen: 2 },
    effect: { type: 'practice', value: 0.08, text: '并蒂：参悟熟练度 +8%' },
    source: { kind: 'shop', cost: { qi: 50, stone: 15 } },
  },
  {
    id: 'leiyue', name: '土术·垒岳诀', type: '土术', kind: 'skill', tier: 'huang', method: 'stackstone',
    desc: '灵石按息坠落，垒满一层化去一层，根基就是这么一寸寸垫起来的。',
    flavor: '练之前以为要搬山，练之后发现自己只是在码石头。',
    bonus: { ti: 4, ling: 1 },
    effect: { type: 'power', value: 0.05, text: '垒岳：对战战力 +5%' },
    source: { kind: 'shop', cost: { qi: 65, stone: 20 } },
  },
  {
    id: 'sanxiu', name: '灵植·三秀诀', type: '灵植', kind: 'skill', tier: 'huang', method: 'harvest',
    desc: '灵畦植苗：互换相邻两株灵苗，三株同色连成一线即可采收；采收后新苗落下，还能再连锁。',
    flavor: '一畦三秀，收完又长，长得比你收得还快。',
    bonus: { wu: 3, ti: 2 },
    effect: { type: 'offline', value: 0.12, text: '三秀：离线灵气 +12%' },
    source: { kind: 'shop', cost: { qi: 55, stone: 18 } },
  },
  // 六门经典盘面：与上面三套一样是「看一眼就会玩」，统一黄阶、走藏经阁。
  // 各占一门类（术数 / 合术 / 目术 / 机巧 / 挪移 / 辨术）：同类同阶只放一门，
  // 撞了谱系按阶取槽会把后一门盖掉，tests/rank.test.js 守着这条。
  {
    id: 'shudu', name: '术数·九宫诀', type: '术数', kind: 'skill', tier: 'huang', method: 'shudu',
    desc: '九宫盘上留着空格，每行、每列、每宫各要 1 到 9 一遍；填满且全对才算完。',
    flavor: '师父说这是数，不是算——算的是别人，数的是自己。',
    bonus: { wu: 4, ling: 1 },
    effect: { type: 'practice', value: 0.09, text: '九宫：参悟熟练度 +9%' },
    source: { kind: 'shop', cost: { qi: 70, stone: 22 } },
  },
  {
    id: 'heyuan', name: '合术·叠元诀', type: '合术', kind: 'skill', tier: 'huang', method: 'heyuan',
    desc: '同数两块一撞就合成双倍，越往上越重；合出本档那一块即收功。',
    flavor: '一加一的道理，练到最后是 1024 加 1024。',
    bonus: { ling: 3, ti: 1 },
    effect: { type: 'power', value: 0.05, text: '叠元：对战战力 +5%' },
    source: { kind: 'shop', cost: { qi: 60, stone: 20 } },
  },
  {
    id: 'shumu', name: '目术·逐数诀', type: '目术', kind: 'skill', tier: 'huang', method: 'shumu',
    desc: '数散在盘上，从 1 顺着点到最后；练的是目光一路扫过去不乱。',
    flavor: '眼睛快的人，打架时也先看见对方的手。',
    bonus: { shen: 4 },
    effect: { type: 'variance', value: 0.04, text: '逐数：对战波动下限提高' },
    source: { kind: 'shop', cost: { qi: 45, stone: 14 } },
  },
  {
    id: 'rongdao', name: '机巧·让路诀', type: '机巧', kind: 'skill', tier: 'huang', method: 'rongdao',
    desc: '滑块一次挪一格，把主块一路让到盘底出口；走的路越省越算功夫。',
    flavor: '让一步不是退，是给别人腾地方。',
    bonus: { wu: 3, shen: 2 },
    effect: { type: 'practice', value: 0.08, text: '让路：参悟熟练度 +8%' },
    source: { kind: 'shop', cost: { qi: 80, stone: 26 } },
  },
  {
    id: 'tuisuo', name: '挪移·入位诀', type: '挪移', kind: 'skill', tier: 'huang', method: 'tuisuo',
    desc: '人走在石格上，石箱只推不拉；每块都要推到自己的阵位，一处不落。',
    flavor: '推错了就推不回来——这话师父只说一遍。',
    bonus: { ti: 4 },
    effect: { type: 'power', value: 0.04, text: '入位：对战战力 +4%' },
    source: { kind: 'shop', cost: { qi: 75, stone: 24 } },
  },
  {
    id: 'zeda', name: '辨术·摘魁诀', type: '辨术', kind: 'skill', tier: 'huang', method: 'zeda',
    desc: '一批数散在盘上，只挑最大的那一个；一批接一批，越往后数越长。',
    flavor: '一眼看出谁最强，剩下的就不必看了。',
    bonus: { shen: 3, wu: 1 },
    effect: { type: 'offline', value: 0.10, text: '摘魁：离线灵气 +10%' },
    source: { kind: 'shop', cost: { qi: 40, stone: 12 } },
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
