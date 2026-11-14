'use strict';

// 「说明」的单一真源：所有解释性文字只住在这里，页面上只看得到数值与按钮。
//
// 改版前每个页面都把说明书印在脸上：眉标、副标题、区块小注、提示、页脚、
// 术语角标，外加洞府页一展开就 6 行的战力公式。信息层级被压平，看起来又挤又吵。
// 现在默认页面只留「标签 + 数值 + 操作」，要看解释点页尾「说明」进这个子页，
// 分节默认折叠，点哪节展开哪节；术语速查由 copy.TERMS 同源生成，不在这里再写一遍。
//
// 维护约定：新增解释只改这里，不要在 WXML 里补长句；行文本一律大白话，
// 不写「本作 / 玩家 / 数据」这类出戏词，也不写实现细节。
//
// 参悟页的说明是「一门一册」，由 practiceTopic() 现拼：玩法规则取 data/guides.js、
// 难度与门槛取 data/practice.js、品阶与一脉取 data/skills.js、本门机制取 minigames/theme.js。
// 这四份都是真源，这里只做编排，不抄第二遍——规则改在真源，说明页跟着变。

const guides = require('./guides.js');
const practiceData = require('./practice.js');
const skillData = require('./skills.js');
const worldData = require('./world.js');
const themes = require('../minigames/theme.js');
// 评级门槛由玩法自己算（见各 minigames/*.js 的 lines()），说明页只负责摆出来。
const minigames = require('../minigames/index.js');

// 状态词是同一把尺子，切磋与秘境两个主题都要讲：写成一份常量，两边引用。
// 抄成两份的话，改了一处、另一处就会教出另一套说法。
const ODDS_LINES = [
    '胜算在握：你比他高两成以上，基本能赢。',
    '略占上风：你比他高一点，赢面大，但还要看波动。',
    '势均力敌：两边战力几乎持平，胜负各半。',
    '略有不及：他比你高一点，翻车概率明显，攒点战力再来。',
    '尚需苦修：他高出你三成以上，现在打基本是送。',
];

const TOPICS = {
    home: {
        title: '主页',
        lead: '只看三件事：境界、战力、去处。',
        sections: [
            {
                key: 'power',
                title: '战力怎么算',
                lines: [
                    '战力 = 属性加权 × (1 + 境界加成 + 功法特效)。',
                    '属性基础 = 体魄 ×1.0 + 灵力 ×1.2 + 悟性 ×0.8 + 身法 ×1.0。',
                    '每门功法给的属性 = 功法加成 × 熟练度段位 × 品阶系数；入门 ×1 → 小成 ×1.8 → 大成 ×2.8 → 圆满 ×4 → 大圆满 ×5。',
                    '多学一门最见效：藏经阁能换就换，切磋首胜与机缘也会给功法。',
                    '突破境界给全体属性加成：筑基 +6% / 金丹 +14% / 元婴 +24%。',
                    '功法练到大成（熟练度 1000）起，特效才生效；品阶越高属性系数越大。',
                    '战力只影响切磋与突破门槛，不参与参悟收益。换着门练有触类旁通加成，同一门连练也不减收益。',
                ],
            },
            {
                key: 'realm',
                title: '境界与突破',
                lines: [
                    '境界进度条显示当前这一境攒到哪了，满了也不自动跳，要去人物页「突破境界」。',
                    '突破要够战力，还得过一局蓄力停区：长按蓄力，松手停在朱线区间内才算过关。',
                ],
            },
            {
                key: 'daily',
                title: '今日份例',
                lines: [
                    '每天参悟满 3 次，可领灵气 +30 / 灵石 +10。',
                    '没领的份例不会攒到明天，回来记得点一下。',
                ],
            },
            {
                key: 'offline',
                title: '闭关收获',
                lines: [
                    '离开期间照常攒灵气与熟练度，最多累计 8 小时，回来时弹给你。',
                    '超过 8 小时的部分不累计，回来练一局反而更快。',
                ],
            },
            {
                key: 'tiles',
                title: '六宫格去哪',
                lines: [
                    '六格各进各的页面：仙门切磋、秘境探索、战力仙榜、称号簿、修行日志、玩法说明。',
                    '切磋是与人过招（有首胜功法），秘境是去一处地方（只产灵气与灵石），两者各占一格。',
                    '藏经阁不在这里——它并进了「功法」页，是那一页的第二个分区。',
                    '不用再借道别的 tab；子页左上角一个「‹」直接返回上一页。',
                ],
            },
        ],
    },

    skills: {
        title: '功法',
        lead: '这里是图鉴：挑功法、看路径、比属性。已持的点进去练，没拿到的看怎么得。',
        sections: [
            {
                key: 'rank',
                title: '天地玄黄',
                lines: [
                    '功法分黄 / 玄 / 地 / 天四阶，只决定收益倍率、属性系数与可修境界，不决定难度。',
                    '三套入门小游戏（灵纹连线 / 落石垒基 / 三秀同收）与阵法·勘禁诀都是黄阶，便宜好上手。',
                    '阵法类偏推演，归玄阶及以上。',
                ],
            },
            {
                key: 'unlock',
                title: '怎么习得',
                lines: [
                    '藏经阁（本页第二个分区）：花灵气与灵石直接兑换，卡片上写清还差多少。',
                    '价格按品阶定，黄阶最便宜，往上每阶更贵，不按玩法难度定价。',
                    '只能靠切磋首胜或机缘拿的那几门也在这个分区，只是没有「换取」按钮，卡片上写着去哪儿取。',
                    '境界门槛：境界不够或高过可修上限，都先别急着换。',
                ],
            },
            {
                key: 'codex',
                title: '功法图鉴',
                lines: [
                    '点开任意一张卡片展开全本：玩法规则、盘面符号、练成收益、本门新法、习得路径。',
                    '未习得也能查全本，锁的只是「开练」和熟练度收益 —— 先读清楚再决定要不要解开。',
                    '列表默认把「离下一段最近、又能拿全额收益」的排在前面；境界不符的与已圆满的依次靠后。卡片只留三字正名、品阶、段位与属性，玩法名和整段规则都在这里。',
                ],
            },
            {
                key: 'naming',
                title: '功法命名',
                lines: [
                    '一律「类别·正名」：前缀就是功法类别，中间一个间隔号，正名三字、末字用体裁字。',
                    '同族用同一个体裁字（诀 / 步 / 符 / 阵 / 方 / 引），不写「入门 / 基础 / 小」这类等级词。',
                    '正式名只认功法表；对白里可以简称。',
                ],
            },
        ],
    },

    profile: {
        title: '人物',
        lead: '身份、属性、称号与突破。',
        sections: [
            {
                key: 'attrs',
                title: '属性格',
                lines: [
                    '当前这一界有体魄 / 灵力 / 悟性 / 身法四项，由功法加成、熟练度段位与境界共同决定。',
                    '战力按四项加权算出，权重见「主页 · 战力怎么算」；换个世界属性表也会换。',
                ],
            },
            {
                key: 'break',
                title: '突破条件',
                lines: [
                    '门槛只有战力：清单第一行「战力 X / Y」打勾就能冲关；下面三行是主修功法的当前段位，只作参考。',
                    '突破局是蓄力停区，失手不掉进度，可以再来一次。',
                ],
            },
            {
                key: 'titles',
                title: '称号簿',
                lines: [
                    '称号靠习得门数、境界、连胜等条件解锁，佩戴后显示在身份卡、主页境界卡与分享卡片上。',
                    '称号只换称谓，不改变数值。',
                ],
            },
            {
                key: 'code',
                title: '战力码与道相',
                lines: [
                    '战力码以 CW1- 开头，复制给朋友，对方粘贴后就能和你的镜像过招。',
                    '道号与道相是自选的称呼与形象；不设头像就用默认道相。',
                ],
            },
            {
                key: 'save',
                title: '存档与账号',
                lines: [
                    '进度跟随账号存云端，换设备登录后自动接续。',
                    '导出存档码可以先留一份底；导入会覆盖当前进度。重置与退出登录不可撤销。',
                ],
            },
        ],
    },

    battle: {
        title: '仙门切磋',
        lead: '挑一个同门或来客，打一场；赢了拿灵气与灵石。',
        sections: [
            {
                key: 'fight',
                title: '出手与胜负',
                lines: [
                    '比双方战力，出手有 ±15% 波动，不是纯比数字。',
                    '赢了拿灵气与灵石；首次战胜某个对手还会掉一门功法。',
                    '已经首胜过的对手可以再打，但只给资源，功法不会掉第二次。',
                    '这一页只与人过招；去某处地方寻资源是另一页的事——秘境探索。',
                ],
            },
            {
                key: 'odds',
                title: '对手后面那五个词',
                lines: ODDS_LINES,
            },
            {
                key: 'mirror',
                title: '镜像与仙榜',
                lines: [
                    '镜像是按战力码还原出的「另一个人」，不用同时在线也能打一场。',
                    '仙榜上传战绩后按战力排序，是镜像对战，不是实时同步 PVP。',
                ],
            },
        ],
    },

    secret: {
        title: '秘境探索',
        lead: '挑一处秘境走一趟；只产灵气与灵石，不掉功法。',
        sections: [
            {
                key: 'walk',
                title: '走一趟有什么',
                lines: [
                    '赢了按秘境给灵气与灵石，越深处的秘境给得越多。',
                    '首次走通额外给 5 灵石；再走一遍收益不变，只是没有这一份。',
                    '输了只回一点灵气，灵石一分不给——和切磋一样。',
                    '秘境不掉功法：功法只在切磋首胜与藏经阁里。',
                ],
            },
            {
                key: 'odds',
                title: '秘境后面那五个词',
                lines: ODDS_LINES,
            },
            {
                key: 'which',
                title: '挑哪一处',
                lines: [
                    '三处门槛依次抬高：后山灵泉 → 废弃丹房 → 云海断崖。',
                    '状态词与仙门切磋同一把尺子：攒够战力再去高一处，别拿一局去试。',
                    '打不过也不必换地方——低处走通一次的那 5 灵石是白拿的。',
                ],
            },
        ],
    },

    board: {
        title: '战力仙榜',
        lead: '我排第几，谁跟我最接近。',
        sections: [
            {
                key: 'rank',
                title: '名次怎么来',
                lines: [
                    '按战力从高到低排，榜单只显示前十，自己不在前十就标「尚未上榜」。',
                    '每次进榜都会把自己的战绩写一次，写着「我」的那行就是自己。',
                ],
            },
            {
                key: 'fight',
                title: '与榜上道友切磋',
                lines: [
                    '按钮挑的是榜上战力与你最接近的一位，打的是他的镜像，不用同时在线。',
                    '胜负仍带 ±15% 波动，赢了拿灵气与灵石。',
                ],
            },
        ],
    },

    titles: {
        title: '称号簿',
        lead: '解锁、佩戴、换一个称谓。',
        sections: [
            {
                key: 'unlock',
                title: '怎么解锁',
                lines: [
                    '按习得门数、境界、连胜、参悟次数这类条件解锁，未解锁的行会写清还差多少。',
                    '解锁后永久保留，不会掉。',
                ],
            },
            {
                key: 'equip',
                title: '佩戴',
                lines: [
                    '同时只能戴一个，再点一次就卸下。',
                    '称号只换称谓，不加属性，也不影响战力。',
                ],
            },
        ],
    },

    log: {
        title: '修行日志',
        lead: '练过的痕迹与低频设置。',
        sections: [
            {
                key: 'log',
                title: '日志',
                lines: [
                    '记录突破、习得、首胜这类节点，最新一条在最上面。',
                ],
            },
            {
                key: 'worlds',
                title: '诸界',
                lines: [
                    '当前只有青云界可玩，其余世界是后续内容，先留个位置。',
                ],
            },
            {
                key: 'settings',
                title: '音效与存档',
                lines: [
                    '局内音效有轻 / 中 / 关三档，在人物页「设置」里切。',
                    '导出 / 导入 / 重置 / 退出登录也在人物页，动手前建议先导出存档码。',
                ],
            },
        ],
    },

    guide: {
        title: '玩法与数值',
        lead: '不看也能玩，看完少走弯路。',
        sections: [
            {
                key: 'how',
                title: '这份指南怎么用',
                lines: [
                    '按目录点章节，或只看一节；名词速查按「成长 / 页面 / 对战 / 玩法」分组。',
                    '每一页页尾的「说明」只讲那一页；这里是完整手册。',
                ],
            },
        ],
    },
    // 隐私与协议：审核要看，玩家也真会点。只写这个项目实际做的事——
    // 从模板抄来的「我们可能收集您的位置信息」那种空话，写了就得跟代码对得上，
    // 对不上比不写更糟。每一条都能在代码里找到出处（登录、存档、剪贴板、仙榜）。
    privacy: {
        title: '隐私与协议',
        // 这一页不是某一页的说明书，导航标题不加「· 说明」后缀。
        navTitle: '隐私与协议',
        lead: '两件事：我们拿到了你的什么，以及在这儿玩要注意什么。',
        sections: [
            {
                key: 'collect',
                title: '我们拿到什么',
                lines: [
                    '微信登录：只拿一个「你是这个账号」的标识，不读你的微信昵称、头像、好友列表或手机号。',
                    '邮箱登录（可选）：只存邮箱，用来收验证码、认出是同一个人。',
                    '道号：你自己填的那个名字，会出现在仙榜与切磋结果里。',
                    '修行记录：每门功法的熟练度、战绩、战力、突破与称号——存档就靠这些。',
                    '剪贴板：只在你点「复制战力码」「导出存档」「粘贴存档」时读写，别的时候不碰。',
                    '不收集位置、通讯录、相册、麦克风，也没有广告 SDK。',
                ],
            },
            {
                key: 'why',
                title: '用来做什么',
                lines: [
                    '存云端是为了换一台手机还能接着练；同一份进度不会在两个账号之间串。',
                    '仙榜展示的是道号、战力与战绩，不展示邮箱。',
                    '出问题时按账号查日志，只为修问题。',
                ],
            },
            {
                key: 'where',
                title: '存在哪里',
                lines: [
                    '本机一份、云端一份；云端按账号隔离，只有你自己的登录能读到自己的存档。',
                    '不卖给第三方，也不用于广告投放。',
                    '云端存档的删除可以找「联络执事」提，人工处理。',
                ],
            },
            {
                key: 'yours',
                title: '你能怎么处理',
                lines: [
                    '人物页能导出存档码，等于把进度带走一份。',
                    '「重置存档」清空当前进度，「退出登录」清本机缓存；云端那份要删请找客服。',
                    '不想登录也能玩：登录页有「先不登录 · 本机玩」，代价是换设备不同步。',
                ],
            },
            {
                key: 'terms',
                title: '用户协议 · 几条要紧的',
                lines: [
                    '道号与仙榜内容不得违规：不涉政、不涉黄、不冒充他人，违规内容会被清除。',
                    '别用外挂、改档、批量刷榜；发现会清榜，进度不补。',
                    '这是个人作品，服务可能升级、暂停或停止；动手前建议先导出存档码。',
                    '因平台政策或不可抗力导致的进度丢失，会尽力帮你恢复，但不作赔偿承诺。',
                ],
            },
        ],
    },
};

function topicOf(key) {
    return TOPICS[key] || TOPICS.home;
}

// 参悟页的说明：按这一门现拼一节一册。
// 以前这些字全印在准备页上（怎么玩六条 + 盘上所见十条 + 本门机制 + 本门新法 + 品阶 + 一脉），
// 一屏塞不下，玩家就整块跳过。现在准备页只留一行规则，整篇搬到这里按节折叠。
function practiceTopic(opts) {
    const o = opts || {};
    // 只认真有的参悟方式：getMethod 对未知 id 会回落到第一门（刀法），
    // 那会让冲关局或拼错的链接显示成别人的规则。
    const method = o.method && practiceData.METHOD_MAP[o.method] ? practiceData.getMethod(o.method) : null;
    const gameId = method ? method.game : (o.game || 'charge');
    const guide = guides.guideOf(gameId);
    const title = method ? method.name : '蓄力停区';
    const lead = method
        ? '这一门的整篇规则只在这里：开局前看一行，局内看两行，拿不准再回来。'
        : '冲关只玩一件事：按住蓄力，松手停在朱线区间。';
    const sections = [];
    // 说明页要把本档门槛写成具体数字，所以难度档跟着链接传进来；
    // 没传（例如从别处点进来）就按简单档给，至少不是空话。
    const diffKey = practiceData.DIFFICULTIES.some(function (d) { return d.key === o.diff; })
        ? o.diff
        : 'easy';
    const diff = practiceData.difficultyOf(diffKey);

    if (guide) {
        sections.push({
            key: 'goal',
            title: '这一局做什么',
            lines: [guide.goal].concat(guide.steps),
        });
        if (guide.terms && guide.terms.length) {
            sections.push({
                key: 'terms',
                title: '盘上所见',
                lines: guide.terms.map(function (t) { return t.name + '：' + t.desc; }),
            });
        }
        // 评级不能只说「按总分评」。S/A/B/C 各自要多少，由这一档的实际门槛给出，
        // 与局内 HUD、结算同源（各玩法 exports 的 lines()）。
        const scoreLines = [guide.scoring];
        const gradeLines = method
            ? minigames.gradeLines(gameId, practiceData.buildParams(method, diffKey), diff.gear)
            : null;
        if (gradeLines) {
            scoreLines.push('本档「' + diff.name + '」的门槛：');
            gradeLines.items.forEach(function (it) { scoreLines.push(it); });
            // 有失败态的玩法要单独写清「最差那档」：C 是「做糙了」，F 是「没走完」，
            // 两个都是差，但玩家该知道掉到哪一档、代价是多少。
            if (gradeLines.fail) scoreLines.push(gradeLines.fail);
        }
        scoreLines.push('诀窍：' + guide.tip);
        sections.push({
            key: 'score',
            title: '怎么评级',
            lines: scoreLines,
        });
    }

    if (method) {
        const tw = themes.twistOf(method.twist);
        sections.push({
            key: 'twist',
            title: '本门机制 · ' + tw.name,
            lines: [tw.desc],
        });

        const rules = practiceData.stageRulesOf(method.id);
        if (rules.length) {
            sections.push({
                key: 'stage',
                title: '本门新法',
                lines: rules.map(function (r) {
                    const gate = worldData.TIERS[r.at].name;
                    // 有些 desc 自己就以「大成起」开头，再拼一遍就成了「大成起 · 照畦：大成起…」。
                    const body = r.desc.indexOf(gate + '起') === 0 ? r.desc.slice(gate.length + 1) : r.desc;
                    return gate + '起 · ' + r.name + '：' + body;
                }).concat(['改规矩的那几条可以在准备页关掉，专心练基础；照见、稳基这类纯便利不给开关。']),
            });
        }

        const diffLines = ['五档只看这一门的熟练度，品阶不决定难度：'];
        practiceData.DIFFICULTIES.forEach(function (d) {
            diffLines.push(d.name + ' · 门槛 ' + d.need + ' · 收益 ×' + d.mult.toFixed(2));
        });
        diffLines.push('默认打本门最高已解锁档：门槛到了就说明这一门的本事到了，不必再手动挑。');
        diffLines.push('刻意退回低档也能练，但熟练度只剩 ×' + practiceData.DIFF_BELOW_CAP.toFixed(1)
            + '，S 也不计连晋——低档是练手，不是刷分。');
        diffLines.push('连 3 局 S 直接把熟练度补到下一段位门槛。段位门槛与难度门槛同源，'
            + '所以看起来就像「3 局 S 开一档」；下一档早开了，它就只是往下一段补。');
        sections.push({ key: 'difficulty', title: '难度与收益', lines: diffLines });

        // 品阶与一脉：图鉴页也有，但玩家是在准备页起念「这门值不值得练」的，就地给一句。
        const skill = findSkillByMethod(method.id);
        if (skill) {
            const tier = practiceData.tierOf(skill.tier);
            const realms = worldData.getWorld().realms;
            const maxRealm = realms[Math.min(realms.length - 1, tier.maxRealm - 1)].name;
            const chain = skillData.chainOfType(skill.type);
            const lines = [
                tier.label + '：' + tier.desc,
                '熟练度收益 ×' + tier.reward.toFixed(2) + '，属性系数 ×' + tier.attr.toFixed(2)
                + '；收益不衰减的上限是「' + maxRealm + '」。',
            ];
            if (chain.items.length > 1) {
                lines.push(skill.type + '一脉：' + chain.items.map(function (it) {
                    const t = practiceData.tierOf(it.tier);
                    return it.name + '（' + t.label + '）';
                }).join(' · '));
            }
            sections.push({ key: 'rank', title: '品阶与一脉', lines: lines });
        }
    }

    return { title: title, lead: lead, sections: sections };
}

function findSkillByMethod(methodId) {
    for (let i = 0; i < skillData.SKILLS.length; i += 1) {
        if (skillData.SKILLS[i].method === methodId) return skillData.SKILLS[i];
    }
    return null;
}

module.exports = {
    TOPICS: TOPICS,
    topicOf: topicOf,
    practiceTopic: practiceTopic,
};
