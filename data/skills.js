'use strict';

// 技能表。熟练度阈值走 world.js 的 TIERS，这里只写每个技能自己的内容。
// effect.type：power 对战战力 / variance 对战波动 / practice 参悟收益 / offline 挂机收益
// source.kind：start 初始 / shop 藏经阁 / battle 首胜掉落 / chance 机缘
// rank：功法品阶 1 基础 / 2 进阶 / 3 上乘 / 4 绝学，见 data/practice.js 的 RANKS。
// 品阶决定参悟难度与熟练度加成；同一 type 的功法按品阶连成一条进阶链。

const SKILLS = [
  {
    id: 'jian', name: '基础剑法', type: '剑法', method: 'forge', rank: 1,
    desc: '外门人人会，练到极处的没几个。',
    flavor: '剑是死的，手腕是活的。',
    bonus: { shen: 3, ti: 1 },
    effect: { type: 'power', value: 0.06, text: '剑意：对战战力 +6%' },
    source: { kind: 'start' },
  },
  {
    id: 'zhen', name: '阵法入门', type: '阵法', method: 'arrayEye', rank: 1,
    desc: '从点一盏灯开始，学会看懂一座阵。',
    flavor: '阵眼只在一处，找错了就得从头推。',
    bonus: { ling: 3, wu: 1 },
    effect: { type: 'variance', value: 0.05, text: '阵眼：对战波动下限提高' },
    source: { kind: 'start' },
  },
  {
    id: 'tuna', name: '吐纳诀', type: '心法', method: 'absorb', rank: 1,
    desc: '最不起眼的功课，也是最长久的功课。',
    flavor: '一日不练，自己知道。',
    bonus: { ling: 2, ti: 2 },
    effect: { type: 'offline', value: 0.10, text: '周天：离线灵气 +10%' },
    source: { kind: 'start' },
  },
  {
    id: 'jingxin', name: '心法·静心诀', type: '心法', method: 'recite', rank: 2,
    desc: '心不浮，气才沉得下去。',
    flavor: '师兄说这口诀没用，他练了三年还在炼气。',
    bonus: { wu: 4 },
    effect: { type: 'practice', value: 0.08, text: '静心：参悟熟练度 +8%' },
    source: { kind: 'shop', cost: { qi: 40, stone: 20 } },
  },
  {
    id: 'yunbu', name: '身法·踏云步', type: '身法', method: 'combo', rank: 2,
    desc: '落脚之处，皆有次序。',
    flavor: '练成之前，先摔了三十次。',
    bonus: { shen: 4 },
    effect: { type: 'power', value: 0.05, text: '踏云：对战战力 +5%' },
    source: { kind: 'shop', cost: { qi: 90, stone: 35 } },
  },
  {
    id: 'leifu', name: '符箓·引雷符', type: '符箓', method: 'tanlei', rank: 3,
    desc: '画符容易，辨得清哪一格是雷才难。',
    flavor: '据说上一位画错的前辈，至今还在山上躺着。',
    bonus: { ling: 4, wu: 1 },
    effect: { type: 'power', value: 0.08, text: '引雷：对战战力 +8%' },
    source: { kind: 'shop', cost: { qi: 160, stone: 50 } },
  },
  {
    id: 'wuxingzhen', name: '阵法·小五行阵', type: '阵法', method: 'wuxing', rank: 3,
    desc: '五盏阵灯，牵一发而动全身。',
    flavor: '师父说这叫举一反三，你觉得这叫加班。',
    bonus: { ling: 3, wu: 3 },
    effect: { type: 'offline', value: 0.15, text: '五行：离线灵气 +15%' },
    source: { kind: 'battle', opponentId: 'liuhan' },
  },
  {
    id: 'dan', name: '丹道·凝露丹方', type: '丹道', method: 'stones', rank: 3,
    desc: '丹方错一味，整炉丹就成炭。',
    flavor: '背丹方比炼丹难，这话你只敢心里想想。',
    bonus: { ling: 3, ti: 2 },
    effect: { type: 'variance', value: 0.06, text: '凝露：对战波动下限提高' },
    source: { kind: 'battle', opponentId: 'puppet' },
  },
  {
    id: 'duanyue', name: '剑诀·断岳', type: '剑法', method: 'snatch', rank: 4,
    desc: '一剑既出，慢的人连剑光都看不见。',
    flavor: '手快的人练剑，是有道理的。',
    bonus: { shen: 4, ti: 2 },
    effect: { type: 'power', value: 0.10, text: '断岳：对战战力 +10%' },
    source: { kind: 'battle', opponentId: 'xueshou' },
  },
  {
    id: 'taixu', name: '心法·太虚诀', type: '心法', method: 'seal', rank: 4,
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

function rankOfSkill(id) {
  const s = getSkill(id);
  return s ? s.rank : 1;
}

// 按功法类别连成进阶链，链内按品阶升序。多阶的类别排在前面，便于功法页展示谱系。
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
    const arr = map[keys[i]].slice().sort(function (a, b) { return a.rank - b.rank; });
    out.push({
      type: keys[i],
      items: arr.map(function (s) {
        return { id: s.id, name: s.name, rank: s.rank, method: s.method };
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
  rankOfSkill: rankOfSkill,
  chainsOf: chainsOf,
  chainOfType: chainOfType,
};
