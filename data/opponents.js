'use strict';

// 预设对手与秘境。首版只打预设 NPC，无需服务器。
// 战力对比 + 双方各 ±15% 随机波动；精通以上技能在对战时触发特效。

const OPPONENTS = [
  {
    id: 'zhaoyan', kind: 'npc', name: '外门师兄·赵砚', title: '同门切磋',
    power: 42, desc: '练了五年剑，逢人便说「还差一点」。',
    reward: { qi: 40, stone: 12 }, drop: null,
    winLine: '赵砚收剑，盯着你的手腕看了半天，没说话。',
    loseLine: '赵砚笑了笑：「还差一点。」这次说的是你。',
  },
  {
    id: 'zhouchu', kind: 'npc', name: '灵田看守·老周', title: '灵田试手',
    power: 85, desc: '锄头使得比剑还熟，据说年轻时也是内门。',
    reward: { qi: 60, stone: 18 }, drop: null,
    winLine: '老周把锄头往地上一插：「这地，以后你自己种。」',
    loseLine: '老周给你倒了碗水：「歇会儿，不急。」',
  },
  {
    id: 'qingli', kind: 'npc', name: '妖兽·青鳞狸', title: '后山遭遇',
    power: 130, desc: '专偷外门弟子晒在院里的丹药，跑得极快。',
    reward: { qi: 90, stone: 26 }, drop: null,
    winLine: '青鳞狸丢下一片鳞，钻进草丛不见了。',
    loseLine: '它叼走你半块干粮，还回头看了你一眼。',
  },
  {
    id: 'liuhan', kind: 'npc', name: '内门弟子·柳含烟', title: '内门问剑',
    power: 190, desc: '阵法课从没低于甲上，最烦有人说「阵法是死物」。',
    reward: { qi: 130, stone: 36 }, drop: 'wuxingzhen',
    winLine: '柳含烟收了阵盘：「这卷小五行阵，借你抄。」',
    loseLine: '柳含烟把阵盘收好：「先把灯点明白再来。」',
  },
  {
    id: 'puppet', kind: 'npc', name: '护山傀儡', title: '山门试炼',
    power: 270, desc: '不疼不累不喊停，唯一的缺点是有点慢。',
    reward: { qi: 180, stone: 50 }, drop: 'dan',
    winLine: '傀儡胸口掉出一卷熏得发黄的丹方。',
    loseLine: '傀儡抬手把你轻轻推下台阶，继续站着。',
  },
  {
    id: 'xueshou', kind: 'npc', name: '魔修·血手', title: '界外来客',
    power: 370, desc: '出手极快，话极多，两样都让人不太舒服。',
    reward: { qi: 250, stone: 70 }, drop: 'duanyue',
    winLine: '血手留下半截断剑：「剑诀送你，别学我。」',
    loseLine: '血手收了力：「今日不算，你还没练出手速。」',
  },
  {
    id: 'xuanzhen', kind: 'npc', name: '峰主·玄真', title: '青云之巅',
    power: 520, desc: '据说他早已看见别的世界，只是不肯细说。',
    reward: { qi: 400, stone: 120 }, drop: 'taixu',
    winLine: '玄真把太虚诀推过来：「练到大成，自己去看看。」',
    loseLine: '玄真拂了拂袖：「再去参悟几回。」',
  },
];

const SECRET_REALMS = [
  {
    id: 'm1', kind: 'secret', name: '后山灵泉', title: '秘境探索',
    power: 60, desc: '灵气浓得有点呛人，适合闭关，也适合打盹。',
    reward: { qi: 120, stone: 8 }, drop: null,
    winLine: '你在泉边坐了半日，衣袖都浸了灵气。',
    loseLine: '泉水太凉，你决定改天再来。',
  },
  {
    id: 'm2', kind: 'secret', name: '废弃丹房', title: '秘境探索',
    power: 160, desc: '炉火早熄了，架子上还剩几只没贴标签的瓶子。',
    reward: { qi: 220, stone: 16 }, drop: null,
    winLine: '翻出一小袋灵石，瓶子里的内容你没敢闻。',
    loseLine: '门轴响了半天也没推开，算了。',
  },
  {
    id: 'm3', kind: 'secret', name: '云海断崖', title: '秘境探索',
    power: 320, desc: '风大到说话得靠喊，据说有人在崖上悟过剑。',
    reward: { qi: 360, stone: 30 }, drop: null,
    winLine: '站到日头偏西，忽然觉得手里那招顺了许多。',
    loseLine: '风把你吹回三步，今日不悟也罢。',
  },
];

const ALL_CHALLENGES = OPPONENTS.concat(SECRET_REALMS);

const CHALLENGE_MAP = {};
for (let i = 0; i < ALL_CHALLENGES.length; i += 1) {
  CHALLENGE_MAP[ALL_CHALLENGES[i].id] = ALL_CHALLENGES[i];
}

function getChallenge(id) {
  return CHALLENGE_MAP[id] || null;
}

module.exports = {
  OPPONENTS: OPPONENTS,
  SECRET_REALMS: SECRET_REALMS,
  ALL_CHALLENGES: ALL_CHALLENGES,
  getChallenge: getChallenge,
};
