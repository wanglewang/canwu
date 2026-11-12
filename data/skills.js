'use strict';

const practiceData = require('./practice.js');

// 技能表。熟练度阈值走 world.js 的 TIERS，品阶与可修境界走 practice.js 的 TIERS。
// effect.type：power 对战战力 / variance 对战波动 / practice 参悟收益 / offline 挂机收益
// source.kind：start 初始 / shop 藏经阁 / battle 首胜掉落 / chance 机缘
// kind：main 主修（心法，决定修炼速度）/ skill 技艺（刀法、剑法、阵法、丹道、符箓、身法）
// tier：huang 黄 / xuan 玄 / di 地 / tian 天 —— 只决定收益倍率、属性加成与可修境界上限，不决定难度。
// 难度由玩家在这门功法上的熟练度决定（见 data/practice.js 的 DIFFICULTIES）。

const SKILLS = [
  {
    // id 沿用旧名（基础剑法），存档与纪录都按 id 索引，改成刀法不动 id。
    id: 'jian', name: '基础刀法', type: '刀法', kind: 'skill', tier: 'huang', method: 'forge',
    desc: '外门人人会，练到极处的没几个。',
    flavor: '刀是死的，手腕是活的。',
    bonus: { shen: 3, ti: 1 },
    effect: { type: 'power', value: 0.06, text: '刀意：对战战力 +6%' },
    source: { kind: 'start' },
  },
  {
    // 阵灯推演是十门里最费脑的一门，挂在黄阶会让「练得最苦、拿得最少」；
    // 提到地阶后收益 ×2.2、属性 ×1.7、可修上限抬到元婴，代价是未到金丹只拿三成。
    // 名字去掉「入门」：地阶功法再叫入门，就是玩家一眼看得见的名实相斥。
    id: 'zhen', name: '阵法·燃灯诀', type: '阵法', kind: 'skill', tier: 'di', method: 'arrayEye',
    desc: '一灯亮，四面翻；让整座阵同时亮起，才算看懂了阵眼。',
    flavor: '阵眼只在一处，找错了就得从头推。',
    bonus: { ling: 3, wu: 1 },
    effect: { type: 'variance', value: 0.05, text: '阵眼：对战波动下限提高' },
    source: { kind: 'start' },
  },
  {
    id: 'tuna', name: '吐纳诀', type: '心法', kind: 'main', tier: 'huang', method: 'absorb',
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
    source: { kind: 'shop', cost: { qi: 40, stone: 20 } },
  },
  {
    id: 'yunbu', name: '身法·踏云步', type: '身法', kind: 'skill', tier: 'xuan', method: 'combo',
    desc: '落脚之处，皆有次序。',
    flavor: '练成之前，先摔了三十次。',
    bonus: { shen: 4 },
    effect: { type: 'power', value: 0.05, text: '踏云：对战战力 +5%' },
    source: { kind: 'shop', cost: { qi: 90, stone: 35 } },
  },
  {
    // id 沿用旧名（引雷符），存档与纪录都按 id 索引，改名不动 id。
    // 数格辨禁是「看得懂规则就稳」的一门，难度低于两门阵法，降到黄阶。
    // 修习门槛随之从金丹降到炼气，但可修上限也只到筑基——练到头该换地阶那门。
    id: 'leifu', name: '符箓·照影符', type: '符箓', kind: 'skill', tier: 'huang', method: 'tanlei',
    desc: '符光扫过，藏在石格下的禁制无所遁形。',
    flavor: '照影符不伤人，只照出你不想看见的东西。',
    bonus: { ling: 4, wu: 1 },
    effect: { type: 'practice', value: 0.10, text: '照影：参悟熟练度 +10%' },
    source: { kind: 'shop', cost: { qi: 160, stone: 50 } },
  },
  {
    // 五行相生偏反应、比阵灯推演轻，降到玄阶与燃灯诀排成「玄 → 地」两级。
    // 一族一个品阶只能放一门，否则谱系按阶取槽时后一门会被同阶盖掉。
    id: 'wuxingzhen', name: '阵法·小五行阵', type: '阵法', kind: 'skill', tier: 'xuan', method: 'wuxing',
    desc: '五盏阵灯，牵一发而动全身。',
    flavor: '师父说这叫举一反三，你觉得这叫加班。',
    bonus: { ling: 3, wu: 3 },
    effect: { type: 'offline', value: 0.15, text: '五行：离线灵气 +15%' },
    source: { kind: 'battle', opponentId: 'liuhan' },
  },
  {
    id: 'dan', name: '丹道·凝露丹方', type: '丹道', kind: 'skill', tier: 'di', method: 'stones',
    desc: '丹方错一味，整炉丹就成炭。',
    flavor: '背丹方比炼丹难，这话你只敢心里想想。',
    bonus: { ling: 3, ti: 2 },
    effect: { type: 'variance', value: 0.06, text: '凝露：对战波动下限提高' },
    source: { kind: 'battle', opponentId: 'puppet' },
  },
  {
    id: 'duanyue', name: '剑诀·断岳', type: '剑法', kind: 'skill', tier: 'tian', method: 'snatch',
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
  getSkill: getSkill,
  tierOfSkill: tierOfSkill,
  chainsOf: chainsOf,
  chainOfType: chainOfType,
};
