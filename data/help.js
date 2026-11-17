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
const economyData = require('./economy.js');
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
    '还需苦练：他高出你三成以上，现在打基本是送。',
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
                    '属性基础 = 体魄 ×1.0 + 真元 ×1.2 + 悟性 ×0.8 + 身法 ×1.0。',
                    '四项属性各有一件正事：体魄撑战力，真元拓气海（每点 +2 灵力上限），悟性省灵力，身法压住切磋的波动下限。战力是共同的那一项。',
                    '每门功法给的属性 = 功法加成 × 火候 × 品阶系数；生涩 ×0 → 初窥 ×1 → 渐熟 ×1.8 → 精纯 ×2.8 → 通玄 ×4 → 化境 ×5。',
                    '多学一门最见效：藏经阁能换就换，切磋首胜与机缘也会给功法。',
                    '突破境界给全体属性加成：筑基 +6% / 金丹 +14% / 元婴 +24%。',
                    '功法特效按火候逐级兑现：初窥 25%、渐熟 50%、精纯 75%、通玄起满额；品阶只影响属性、运功耗气与可修境界，不加速熟练度。',
                    '战力只影响切磋与突破门槛，不参与参悟所得。换一门修习另有触类旁通（耗气更省），同一门连练也不减所得。',
                ],
            },
            {
                key: 'realm',
                title: '境界与突破',
                lines: [
                    '境界进度条显示当前这一境攒到哪了，满了也不自动跳，要去人物页「突破境界」。',
                    '突破要两道门槛：战力够了，还要备得起布阵的灵石（筑基 60 / 金丹 120 / 元婴 240）。',
                    '冲关是一局蓄力停区：长按蓄力，松手停在两道红线之间才算过关；不成只散掉一半灵石，余下的还在。',
                ],
            },
            {
                key: 'daily',
                title: '今日份例',
                lines: [
                    '每天参悟满 3 次，可领灵力 +60。',
                    '气海装不下就只领到装得下的那些，余下的散去：界面会写「+21（余下 39 散去）」。',
                    '份例只补灵力，不给灵石。没领的份例不会留到明天，回来记得去领。',
                ],
            },
            {
                key: 'offline',
                title: '闭关收获',
                lines: [
                    '离开期间照常攒灵力，一次最多算 8 小时，回来时弹给你。',
                    '闭关只养灵力，一分熟练度都不给：功力的长进只在参悟里。挂着不会把关卡往前推。',
                    '灵力每分钟养回 0.5 点。能存多少不由时长决定，由气海决定：炼气 174 点，坐五个多小时就满。',
                    '灵力满则不再生，多坐的部分收不到——所以闭关是「回来收」而不是「放着涨」。想让一池更大，去破境、去练真元。',
                ],
            },
            {
                key: 'money',
                title: '灵力与灵石',
                lines: [
                    '灵力是运功的根本：闭关每分钟养回 0.5 点，参悟与切磋各耗几点到几十点。灵石能买它，它买不回灵石。',
                    '灵力有上限，叫气海：境界基数（炼气 150 → 元婴 620）加真元每点 2 点，再乘心法的扩池加成。破境会拓深气海并当场补满。灵石能买油，买不来更大的油箱。',
                    '坐满一分钟，洞府里就会出现「闭关打坐」，轻点即可把积下的收走——不必退出小程序。灵力见底时先回洞府坐一会儿。',
                    '灵石是修仙界的通货：只从切磋与秘境来，用来换功法、布阵破境，也能换灵力。',
                    '灵石换灵力在洞府主页：点「灵石」那一格，1 枚换 100 点，换来即刻能用。灵力换不回灵石。',
                    '参悟不出半分灵力灵石——它就是花灵力换熟练度。缺灵力可以闭关，也可以拿灵石换；缺灵石只能去打。',
                ],
            },
            {
                key: 'tiles',
                title: '六宫格去哪',
                lines: [
                    '六格各通各的去处：仙门切磋、秘境探索、战力仙榜、称号簿、修行日志、玩法说明。',
                    '切磋是与人过招（有首胜功法），秘境是去一处地方（只产灵石），两者各占一格。',
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
                    '功法分黄 / 玄 / 地 / 天四阶，只决定运功耗气、属性系数与可修境界，不决定难度。',
                    '三套入门盘面（灵纹连线 / 落石垒基 / 三秀同收）与阵法·循数勘禁诀都是黄阶，价低而好上手。',
                    '阵法类偏推演，归玄阶及以上。',
                ],
            },
            {
                key: 'unlock',
                title: '怎么习得',
                lines: [
                    '藏经阁（此处第二个分区）：只花灵石直接兑换，玉简上写清还差多少。灵力不参与交易。',
                    '价格按品阶定，黄阶最便宜，往上每阶更贵，不按玩法难度定价。',
                    '只能靠切磋首胜或机缘拿的那几门也在这个分区，只是没有「换取」按钮，玉简上写着去哪儿取。',
                    '境界门槛：境界不够或高过可修上限，都先别急着换。',
                ],
            },
            {
                key: 'codex',
                title: '功法图鉴',
                lines: [
                    '点开任意一张玉简展开全本：玩法规则、盘面符号、练成所得、本门新法、习得路径。',
                    '未习得也能查全本，锁的只是「开练」与参悟所得 —— 先读清楚再决定要不要解开。',
                    '列表默认把「离下一级火候最近、又能拿全额所得」的排在前面；境界不符的与已化境的依次靠后。玉简只留五字正名、品阶、火候与属性，玩法名与整段规则都在这里。',
                ],
            },
            {
                key: 'naming',
                title: '功法命名',
                lines: [
                    '一律「类别·正名」：前缀就是功法类别，中间一个间隔号，正名四到六字、末字用体裁字。',
                    '正名先说盘上有什么，再说手上做什么：三秀连收诀＝三株灵苗连成一线收取，同源叠元诀＝两枚同数相叠成更高一元。三个字装不下这两件事，所以一门也不用。',
                    '同族用同一个体裁字（诀 / 步 / 引），不写「入门 / 基础 / 小」这类排辈的字。',
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
                    '当前这一界有体魄 / 真元 / 悟性 / 身法四项，由功法加成、火候与境界共同决定；每一项的用途写在人物页属性格下面。',
                    '战力按四项加权算出，权重见「主页 · 战力怎么算」；换个世界属性表也会换。',
                ],
            },
            {
                key: 'break',
                title: '突破条件',
                lines: [
                    '门槛只有战力：清单第一行「战力 X / Y」打勾就能冲关；下面三行是主修功法的当前火候，只作参考。',
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
        lead: '挑一个同门或来客，打一场；运功耗灵力，赢了挣灵石。',
        sections: [
            {
                key: 'fight',
                title: '出手与胜负',
                lines: [
                    '每打一场先运功 5 点灵力，不论胜负都花掉——灵力不够就点不动。',
                    '比双方战力，出手有 ±15% 波动，不是纯比数字。',
                    '赢了拿灵石；首次战胜某个对手还会掉一门功法。',
                    '灵石越打越薄：当天第 1 场全额，第 2 场 ×0.85，第 3 场 ×0.72……灵脉一天只吐那么多。',
                    '已经首胜过的对手可以再打，但功法不会掉第二次。',
                    '这一页只与人过招；去某处地方寻灵石是另一页的事——秘境探索。',
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
        lead: '挑一处秘境走一趟；只产灵石，不掉功法。',
        sections: [
            {
                key: 'walk',
                title: '走一趟有什么',
                lines: [
                    '每走一趟先运功 5 点灵力；赢了按秘境给灵石，越深处给得越多。',
                    '首次走通额外给 8 灵石；再走一遍所得照样按当日场次递减。',
                    '灵石与切磋共用同一条当日衰减：两边加起来打得越多，单场越薄。',
                    '输了灵石一分不给，运功的灵力照样花掉——和切磋一样。',
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
                    '打不过也不必换地方——低处走通一次的那 8 灵石是白拿的。',
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
                    '按战力从高到低排，榜单只显示前十，自己不在前十就标「暂未上榜」。',
                    '每次进榜都会把自己的战绩写一次，写着「我」的那行就是自己。',
                ],
            },
            {
                key: 'fight',
                title: '与榜上道友切磋',
                lines: [
                    '按钮挑的是榜上战力与你最接近的一位，打的是他的镜像，不用同时在线。',
                    '胜负仍带 ±15% 波动，赢了拿灵石。',
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
                    '按目录点章节，或只看一节；名词速查按「成长 / 去处 / 对战 / 玩法」分组。',
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
        ? '本门的整篇规则只在这里：开局前看一行，局内看两行，拿不准再回来。'
        : '冲关只玩一件事：按住蓄力，松手停在两道红线之间。';
    const sections = [];
    // 说明页要把本章门槛写成具体数字，所以章跟着链接传进来；
    // 没传（例如从别处点进来）就按第一章给，至少不是空话。
    // 说明页要把「这一段」的门槛写成具体数字，所以段跟着链接传进来；
    // 没传（例如从别处点进来）就落到第一段，至少不是空话。
    const stageIdx = practiceData.stageIndexLike(o.stage !== undefined ? o.stage : (o.diff !== undefined ? o.diff : 0));
    const stageDef = practiceData.STAGES[stageIdx];

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
            ? minigames.gradeLines(gameId, practiceData.buildParams(method, stageIdx), stageDef.gear)
            : null;
        if (gradeLines) {
            scoreLines.push('本段「' + stageDef.name + '」的门槛：');
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

        // 局内叙事说「扣 1 息」，罚时说「罚 10 秒」——同一个单位，两种写法。
        // 玩家读不出这个区分，就会以为盘上有两套计时，所以在这里明写一次（04-open-issues B6）。
        sections.push({
            key: 'unit',
            title: '计时',
            lines: [
                '本门以「息」计时，一息即一秒。',
                '罚时写「秒」，与息是同一个单位：罚 10 秒就是罚 10 息。局内香炷、倒计时也照此。',
            ],
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

        const diffLines = ['每门功法一条 1–1000 关的长线，五段。段名就是「这门练到哪」，'
            + '走通段界关当场进下一段，与熟练度、品阶都无关：'];
        practiceData.STAGES.forEach(function (d, i) {
            diffLines.push(d.name + ' · 第 ' + d.from + '–' + d.to + ' 关 · 基础耗气 '
                + economyData.RUN_QI[i] + ' 点');
        });
        diffLines.push('第 10 / 50 / 200 / 500 / 1000 关是段界关：走通它，下一步就进「入门 / 小成 / 大成 / 圆满 / 大圆满」。'
            + '段没有「挑」这个动作，只有一个方向——走通当前这一关，下一关才开；一局只推一关。'
            + '节奏与时辰类每关都紧一点；'
            + '盘面规格挂在本段上，一段一副主盘，换段才换一副；'
            + '段内那几关若写「与上一关规格相同」，说明这一段还没铺满变体，不是关卡坏了。');
        diffLines.push('一局实际耗气 = 本段基数 × 时长系数（本门盘面 15–70 秒，0.85–1.30）'
            + ' × 品阶（黄 1.00 / 玄 1.15 / 地 1.30 / 天 1.45）'
            + ' × 境界超限（超可修上限时 ×1.5）'
            + ' ×（1 − 心法省气，最多 50%）'
            + ' ÷ 悟性（1 + 悟性/200，最多 ÷1.6）'
            + ' ×（换门 0.92）。结算卡会把这几项逐条写出来，可以照着自己复算。');
        diffLines.push('想找手感可以回关：退回第几关，基础熟练度就按「这一关 ÷ 本门当前关」折一次、'
            + '四舍五入，本局不叠连 S，但已有层数原样保留。往前打永远最划算。');
        diffLines.push('耗气不跟着折：回关按本关所在的段报价（7 点起）。以 S（' + worldData.PROF_BASE.S + ' 点）为例，'
            + '本门走到第 800 关时回打 800 / 400 / 200 / 100 / 1 关依次是 '
            + [800, 400, 200, 100, 1].map(function (lv) {
                return practiceData.profByLevel(worldData.PROF_BASE.S, lv, 800);
            }).join(' / ') + ' 点——退得越远越薄，第 1 关几乎为零，回关是练手不是刷分。');
        diffLines.push('单局基础：C ' + worldData.PROF_BASE.C + ' / B ' + worldData.PROF_BASE.B
            + ' / A ' + worldData.PROF_BASE.A + ' / S ' + worldData.PROF_BASE.S
            + ' 点，失败 F 是 0。只有连续的 S 才叠倍率，C / B / A 不叠层且会让连 S 归零。');
        diffLines.push('第 1～' + worldData.COMBO_MAX + ' 连 S 每局依次是 '
            + worldData.COMBO_TABLE.join(' / ') + ' 点：每局独立算 34 × 1.5^(连数-1) 后四舍五入，'
            + '不拿上一局的整数接着乘。第 ' + (worldData.COMBO_MAX + 1) + ' 连起锁死 '
            + worldData.COMBO_CAP_GAIN + ' 点，一轮十连共 ' + worldData.COMBO_ROUND + ' 点。');
        diffLines.push('全程不断 S、都打本门当前关，' + worldData.PROF_S_RUNS + ' 局熟练度到顶；全 C 则是 '
            + (worldData.PROF_C_RUNS + 1) + ' 局。失败、主动结束与非 S 都会让连 S 归零；'
            + '换一门各算各的，不互蹭；回关局既不叠也不清。');
        sections.push({ key: 'difficulty', title: '段位 · 关卡 · 耗气', lines: diffLines });

        // 品阶与一脉：图鉴页也有，但玩家是在准备页起念「这门值不值得练」的，就地给一句。
        const skill = findSkillByMethod(method.id);
        if (skill) {
            const tier = practiceData.tierOf(skill.tier);
            const realms = worldData.getWorld().realms;
            const maxRealm = realms[Math.min(realms.length - 1, tier.maxRealm - 1)].name;
            const chain = skillData.chainOfType(skill.type);
            const lines = [
                tier.label + '：' + tier.desc,
                '运功耗气 ×' + tier.qiCost.toFixed(2) + '，属性系数 ×' + tier.attr.toFixed(2)
                + '；熟练度与品阶无关，耗气不涨的境界上限是「' + maxRealm + '」（超了 ×1.5）。',
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
