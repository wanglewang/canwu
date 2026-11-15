'use strict';

// 《参悟》经济：两种货币，两条线，互不兑换。
//
// 灵力 = 修士的「油」，也是「气海」的存量。闭关吐纳把它养回来，运功（参悟、切磋）就烧掉。
//        它不是一个可以无限攒的钱包：真元有多厚、境界有多高，气海就有多深（见 qiCapOf）。
//        满则不再生——所以它是日常节奏，玩家得回来收，也得挑着花。
// 灵石 = 修仙界的通货。切磋与秘境所出，买功法、布阵破境。
//        它是长期目标：只有一次性大额支出，所以每一枚都要掂量。
//
// 为什么参悟不产灵力灵石：参悟是「花灵力换熟练度」的投入，产出资源等于自付自；
// 更糟的是「打一局 +2 灵石」会把灵石从硬通货退化成计件工资——玩家永远在攒钱，
// 却感觉不到钱有分量。产出全交给闭关（灵力）与对战（灵石）之后，
// 单局只剩「代价多少、熟练度多少」两个数，一句话就能讲清。
//
// 为什么灵力要有上限：没有上限时，挂机时长就是唯一的节奏，玩家只会「挂够再来」；
// 有上限之后，气海深浅（境界 + 真元）直接决定「一趟能练几局」，境界因此多了一重
// 摸得着的意义，闭关也变成「回来收」而不是「放着涨」。

// ---------------------------------------------------------------- 初始身家
// 开局 160 灵力，炼气期的气海是 174（150 + 真元 12 × 2），一开局就接近满——
// 让新手第一件事是「去练」，而不是「先等半小时」。实价 6 点上下，够练十几局简单档。
// 15 灵石 = 打两场切磋就够换第一门黄阶功法（摘魁 16），让「置换」在第一小时就发生。
const START_QI = 160;
const START_STONE = 15;

// ---------------------------------------------------------------- 灵力：每局参悟的运功消耗
// 五档基数递增。注意「单价随档上升，单点灵力换到的熟练度反而下降」是刻意的：
// 简单档实价 6 点换 34 点（约 5.7 点/灵力），绝境实价 27 点换同样的 34 点（约 1.3 点/灵力）。
// 难盘就该更贵，否则「又便宜又给得多」会让高档只剩挑战意义。
// 往上走的真实回报不在单价，在「连 S 只在本门最高已解锁档叠 + 低档基础值折半」——
// 所以退回低档叠不了连 S，不必再叠一层收益惩罚去堵它（见 scripts/simulate.js 的预算实验）。
const RUN_QI = [7, 11, 17, 24, 32];

// 品阶对耗气的影响：高阶功法运功一次消耗更大，天阶是黄阶的 1.45 倍。
// 这是品阶的第二重代价（第一重是境界门槛），回报在 attr 战力与 maxRealm 可修境界。
const TIER_QI = { huang: 1, xuan: 1.15, di: 1.3, tian: 1.45 };

// 单局时长的修正：各门玩法的一局长短差很多（顺光扫斩 15 秒，观窍 / 落石 70 秒），
// 烧的气不该一样。method.base 是各玩法早就配好的节奏基准（30–56），以 36 为中点
// 折成 0.85–1.30 的系数：盘面越久，一局越费气。夹在两端是为了让价目表仍然可预期。
const BASE_QI_REF = 36;
const METHOD_QI_MIN = 0.85;
const METHOD_QI_MAX = 1.3;

function methodQiFactor(base) {
  const b = Number(base) || BASE_QI_REF;
  return Math.max(METHOD_QI_MIN, Math.min(METHOD_QI_MAX, b / BASE_QI_REF));
}

// 人物境界超过功法可修上限：事倍功半，耗气 ×1.5。仍然能练，只是不划算。
const REALM_OVER = 1.5;

// 换一门功法练：触类旁通，耗气 ×0.92。正激励，不罚专精。
const CROSS_QI = 0.92;

// 悟性减免：1 + 悟性/200，最多 ÷1.6（省 37.5%）。
// 「同样一口灵力，悟性高的走得远」——这是悟性在参悟里的唯一作用，不进熟练度。
const WU_SAVE_MAX = 1.6;

// 「静心 / 勘禁」这类心法（effect.type = qiSave）累加后的省气上限：一半。
// 六门全学满也只有 50%，防止以后再加功法把耗气叠穿，也让悟性仍然值得堆。
const PRACTICE_SAVE_MAX = 0.5;

// 单局耗气绝对下限：再怎么叠也不能低于 1 点，否则「练功」变成免费。
const QI_COST_MIN = 1;

// 一局参悟要烧多少灵力。全部系数都从参数进来，不在页面里再算一遍：
//   diffIndex   本局难度档（0–4）
//   tierKey     功法品阶
//   methodBase  这一门玩法的节奏基准（method.base，映射成 0.85–1.30 的时长系数）
//   realmAbove  人物境界是否超过本门可修上限（只加消耗，不禁练）
//   qiSave      已学心法给的省气比例（累加，封顶 PRACTICE_SAVE_MAX）
//   wu          悟性（属性面板上那个数）
//   cross       本局是否换了门功法
function practiceQiCost(o) {
  const opt = o || {};
  const idx = Math.max(0, Math.min(RUN_QI.length - 1, Math.floor(Number(opt.diffIndex) || 0)));
  let cost = RUN_QI[idx];
  cost *= methodQiFactor(opt.methodBase);
  cost *= TIER_QI[opt.tierKey] || 1;
  if (opt.realmAbove) cost *= REALM_OVER;
  cost *= 1 - Math.min(PRACTICE_SAVE_MAX, Math.max(0, Number(opt.qiSave) || 0));
  const wuSave = Math.min(WU_SAVE_MAX, 1 + Math.max(0, Number(opt.wu) || 0) / 200);
  cost /= wuSave;
  if (opt.cross) cost *= CROSS_QI;
  return Math.max(QI_COST_MIN, Math.round(cost));
}

// 五档耗气的对照表（按「36 基准 / 黄阶 / 悟性 0 / 不换门」算），给说明页与测试复算用。
function runQiTable() {
  return RUN_QI.slice();
}

// ---------------------------------------------------------------- 灵力：气海的上限
// 上限 =（境界基数 + 真元 × 每点增益）×（1 + 功法扩池，封顶 QI_CAP_SKILL_MAX）。
//
// 三个数各自管一件事，不互相顶替：
//   · 境界基数：境界越高，气海越大 —— 这是突破的第二重回报（第一重是战力）；
//   · 真元：属性面板上那个数，每点给 2 点上限 —— 「练灵力类功法」因此有了独立出口；
//   · 功法扩池：心法的 qiCap 效果，累加封顶 30% —— 不给它封顶，以后加功法会把池子撑穿。
//
// 炼气 150（+ 真元 12×2 = 174）≈ 十局困难档；元婴 620（真元百点时约 820）。
// 这个跨度让「往上走」不是只为了战力，也是为了「一趟能多练几局」。
const QI_CAP_PER_LING = 2;
const QI_CAP_SKILL_MAX = 0.3;

function qiCapOf(realmBase, ling, skillBonus) {
  const base = Math.max(0, Number(realmBase) || 0);
  const l = Math.max(0, Number(ling) || 0);
  const b = Math.min(QI_CAP_SKILL_MAX, Math.max(0, Number(skillBonus) || 0));
  return Math.max(1, Math.round((base + l * QI_CAP_PER_LING) * (1 + b)));
}

// ---------------------------------------------------------------- 灵力：闭关与份例
// 闭关每分钟养回多少灵力在 world.idle 里（世界配置），每日份例在 world.daily 里。
// 这里只放「一次补给」的量：份例给 60 灵力，约等于三局困难档的消耗——
// 它补的是「今天练过了」这件事，不是白送一笔钱。
const DAILY_QI = 60;

// ---------------------------------------------------------------- 灵石：对战与秘境
// 每场切磋 / 秘境都要先运功：不论胜负，5 点灵力。
// 这条让「赚灵石」和「练功」争同一池灵力，两件事才有取舍。
const BATTLE_QI = 5;

// 当日第 n 场战胜的灵石系数：0.85^(n-1)。
// 灵脉一天只吐那么多，取多了就只剩渣——所以切磋可以无限打，灵石会自然收敛。
// 首胜 / 首过另有一次性灵石，那属于「打通这条路」的奖励，不受这条衰减管。
const BATTLE_STONE_DECAY = 0.85;
const FIRST_CLEAR_STONE = 8;

// 第 n 场（从 1 起）战胜的灵石系数。n 超过 1 之后逐场乘 0.85，永远不会归零，
// 但打到第 15 场只剩 0.85^14 ≈ 0.10，玩家自己就会停手。
function battleStoneFactor(n) {
  const k = Math.max(0, Math.floor(Number(n) || 0));
  return Math.pow(BATTLE_STONE_DECAY, k);
}

// ---------------------------------------------------------------- 机缘：只出残卷，不出资源
// 参悟里那点「偶得」只给功法残卷：这是「不花灵石拿功法」的第三条路（另两条是初始三门与
// 切磋首胜掉落），和两种货币都有明确分工——它不产灵力、也不产灵石。
// 1.2% 是「一百局左右摸到一册」的量级：够让人有盼头，又不足以让藏经阁失去意义
// （19 门功法，靠机缘集齐要上千局，而灵石买齐只要几百场切磋）。
const FORTUNE_SCROLL_RATE = 0.012;

// ---------------------------------------------------------------- 灵石：功法与突破
// 藏经阁功法的价格只收灵石（写在 data/skills.js 的 source.cost.stone）。
// 突破布阵的价目：筑基 / 金丹 / 元婴，按目标境界下标取。
const BREAKTHROUGH_STONE = [60, 120, 240];
// 冲关不成，布阵的灵石退回一半：阵基还在，灵石散了些。
const BREAKTHROUGH_REFUND = 0.5;

function breakthroughStone(realmIndex) {
  const i = Math.max(1, Math.floor(Number(realmIndex) || 1)) - 1;
  return BREAKTHROUGH_STONE[Math.min(BREAKTHROUGH_STONE.length - 1, i)];
}

module.exports = {
  START_QI: START_QI,
  START_STONE: START_STONE,
  RUN_QI: RUN_QI,
  TIER_QI: TIER_QI,
  BASE_QI_REF: BASE_QI_REF,
  METHOD_QI_MIN: METHOD_QI_MIN,
  METHOD_QI_MAX: METHOD_QI_MAX,
  methodQiFactor: methodQiFactor,
  REALM_OVER: REALM_OVER,
  CROSS_QI: CROSS_QI,
  WU_SAVE_MAX: WU_SAVE_MAX,
  PRACTICE_SAVE_MAX: PRACTICE_SAVE_MAX,
  QI_COST_MIN: QI_COST_MIN,
  practiceQiCost: practiceQiCost,
  runQiTable: runQiTable,
  QI_CAP_PER_LING: QI_CAP_PER_LING,
  QI_CAP_SKILL_MAX: QI_CAP_SKILL_MAX,
  qiCapOf: qiCapOf,
  DAILY_QI: DAILY_QI,
  BATTLE_QI: BATTLE_QI,
  BATTLE_STONE_DECAY: BATTLE_STONE_DECAY,
  FIRST_CLEAR_STONE: FIRST_CLEAR_STONE,
  battleStoneFactor: battleStoneFactor,
  FORTUNE_SCROLL_RATE: FORTUNE_SCROLL_RATE,
  BREAKTHROUGH_STONE: BREAKTHROUGH_STONE,
  BREAKTHROUGH_REFUND: BREAKTHROUGH_REFUND,
  breakthroughStone: breakthroughStone,
};
