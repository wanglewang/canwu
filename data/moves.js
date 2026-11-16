'use strict';

// 一式一名：十五门功法在切磋与秘境里各自抽出的一式（2026-11 起）。
//
// 为什么要这张表：在这之前，功法对切磋的全部影响是 effectValue('power') 把
// 所有 power 类特技加成一个百分比塞进 rollBattle —— 玩家看不见任何一门出场，
// 赢了不知道靠哪门，输了不知道为什么。十五门于是像十五个互不相干的小游戏。
//
// 这张表把「被动常驻的加成」改成「主动运出去的三式」：
//   · 每门功法炼成一式，有招式名、有出手时机、有一句门规；
//   · 一场至多运三式（已入门即可，不必大成）；
//   · 计算口径仍是 skills.js 的 effect.value × 段位系数，只多一个集中运功系数，
//     不新增任何数值来源 —— 招式表只负责「叫什么、算哪一类」。
//
// 三类的划法跟 effect.type 一一对应，不是另起一套：
//   power                  → open  起手，抬本场战力
//   variance               → guard 守势，抬波动下限
//   qiCap / qiSave / offline → qi   养息，减本场运功灵力
//
// 后三类在对战里本来完全隐形（灵力上限、省气、回复速度跟切磋毫无关系）。
// 归到「养息」之后它们才有了出场的理由：这一场少烧几口气。

const skillData = require('./skills.js');

const ACTS = {
  open: { key: 'open', name: '起手', hint: '抬本场战力' },
  guard: { key: 'guard', name: '守势', hint: '抬波动下限' },
  qi: { key: 'qi', name: '养息', hint: '减本场运功' },
};

// 一门功法单独运起来，比它「挂在身上被动生效」时要足：三式合计约等于把
// 以前那笔自动加成全部领回来，但得自己挑 —— 这才是取舍。
const FOCUS = 2;

// 一场能运几式。三不是随手取的：三才、三花、一气化三清，也与「三式」这个说法对得上。
const MAX_MOVES = 3;

// 养息类最多抵掉几点灵力。留两点是硬底线 —— 切磋与秘境永远不能白打，
// 否则「运功要烧气」这条取舍就整条失效了（见 data/economy.js 的 BATTLE_QI = 5）。
const QI_RELIEF_CAP = 3;

// 招式名两字、动词在前，取法各有出处：刀法破锋、剑法开山、身法借风、阵法护灯。
const MOVES = {
  jian: { name: '破锋', act: 'open', line: '刀意贯在刃上，这一刀比平日沉三分。' },
  leiyue: { name: '叠石', act: 'open', line: '一块一块垒上去，垒到你抬不起手。' },
  heyuan: { name: '合元', act: 'open', line: '两股并作一股，中间不留缝。' },
  tuisuo: { name: '落位', act: 'open', line: '不抢快，只占住那一格。' },

  zhen: { name: '护灯', act: 'guard', line: '灯不灭，出手就不会偏。' },
  shumu: { name: '追迹', act: 'guard', line: '看的是痕迹，不是招式。' },

  tuna: { name: '引息', act: 'qi', line: '开打前先把气理顺。' },
  taixu: { name: '虚受', act: 'qi', line: '空着的那一处，才装得下东西。' },
  sanxiu: { name: '齐秀', act: 'qi', line: '三株同发，谁也不多占一口。' },
  zeda: { name: '摘星', act: 'qi', line: '只取最上面那一颗，其余不碰。' },
  jingxin: { name: '敛息', act: 'qi', line: '把呼吸压到听不见，气就省下来了。' },
  leifu: { name: '勘界', act: 'qi', line: '先划出界线，走的路少一半。' },
  shudu: { name: '定宫', act: 'qi', line: '九宫既定，不必再试。' },
  lingqi: { name: '并根', act: 'qi', line: '两根并生，共用一份水土。' },
  rongdao: { name: '让道', act: 'qi', line: '让开一步，力气就省下来了。' },
};

// 段位系数由 utils/game.js 的 EFFECT_TIER_SCALE 提供，这里只认「这一式值多少」。
function moveOf(id) {
  const m = MOVES[id];
  if (!m) return null;
  const s = skillData.getSkill(id);
  if (!s) return null;
  return { id: id, name: m.name, act: m.act, line: m.line, effect: s.effect, skillName: s.name };
}

// 起手 / 守势的「势」：percent 形态，直接加到战力倍率或波动下限上。
function stanceOf(id, scale) {
  const s = skillData.getSkill(id);
  if (!s || !MOVES[id]) return 0;
  if (MOVES[id].act === 'qi') return 0;
  return s.effect.value * scale * FOCUS;
}

// 养息的「势」：换成灵力点。value 是百分数（0.08 = ８%），× 20 落到 1–3 点这个量级
// 才跟 BATTLE_QI = 5 相称；再少就看不见，再多就白打了。
function reliefOf(id, scale) {
  const s = skillData.getSkill(id);
  if (!s || !MOVES[id] || MOVES[id].act !== 'qi') return 0;
  return Math.max(1, Math.round(s.effect.value * scale * 20));
}

module.exports = {
  ACTS: ACTS,
  MOVES: MOVES,
  FOCUS: FOCUS,
  MAX_MOVES: MAX_MOVES,
  QI_RELIEF_CAP: QI_RELIEF_CAP,
  moveOf: moveOf,
  stanceOf: stanceOf,
  reliefOf: reliefOf,
};
