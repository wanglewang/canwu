'use strict';

// 玩家可见文案的单一真源。
//
// 为什么单独一层：改版前「同一件事」在六个页面有六种写法（开始参悟 / 去参悟 / 就练这门 /
// 去练一局 / 回去修炼），四种 loading 各拟一次人（推演气机 / 翻检藏经阁 / 整理论道台 /
// 展开道牒），页脚口号在 6 个页面重复、还和洞府页头副标题撞车。文案散在 WXML 里既改不全，
// 也没法回归。这里把「跨页复用」的文案、区块标题、页头与术语词典收成一份纯数据：
//   - UI 是纯数据对象，可直接放进各页 data，由 WXML 用 {{copy.xxx}} 绑定；
//   - TERMS 同时驱动 components/term 的弹层与「修行指南 · 名词速查」，解释只写一遍；
//   - formatCost / formatGain 统一资源与收益的单位写法；进度在 WXML 里统一写成 {{a}} / {{b}}。
// 页面专属的叙事文案（功法描述、对手台词、玩法说明）仍留在各自的数据文件里，不搬到这里。
// scripts/verify.js 会断言：UI 里的跨页文案不得再出现在任何 WXML 硬编码里。

const BRAND = {
    name: '参悟',
    world: '青云界',
    // 品牌口号只出现在分享卡上，负责韵味。它不承担解释责任：
    // 指南正文里那句「挂机是保底，参悟才是提速」才是给新手看的大白话，
    // 两处不同是刻意的——「等」在口号里够味，在规则里就指代不清了。
    slogan: '等是保底，练才是加速',
};

// 术语词典：key 稳定，页面 <term term-key="…"> 与指南速查节共用。
// desc 一律用大白话，不出现实现细节、不出现「本作 / 玩家 / 数据」等出戏词。
const TERMS = [
    { key: 'canwu', name: '参悟', group: '成长', desc: '玩一局小游戏换一大笔熟练度，是最主要的成长方式。' },
    { key: 'prof', name: '熟练度', group: '成长', desc: '每门功法单独累计，决定属性加成、能选的难度档和阶段新法。' },
    { key: 'tier', name: '段位', group: '成长', desc: '熟练度的六级：未入门 → 入门 → 小成 → 大成 → 圆满 → 大圆满。' },
    { key: 'rank', name: '品阶', group: '成长', desc: '功法分天地玄黄四阶，决定收益倍率、属性系数与可修境界，不决定难度。' },
    { key: 'sStreak', name: '连 S 晋级', group: '成长', desc: '同一门功法连续完成 3 局 S 评级，熟练度直接补到下一段位门槛。' },
    { key: 'decay', name: '境界衰减', group: '成长', desc: '境界超过功法可修上限后，参悟熟练度收益只剩三成；还能练，但该换更高阶的功法了。' },
    { key: 'fene', name: '份例', group: '成长', desc: '每天参悟满 3 次可领的每日奖励：灵气 +30、灵石 +10。' },
    { key: 'offline', name: '闭关收获', group: '成长', desc: '离开期间照常攒的灵气与熟练度，最多累计 8 小时，回来时弹给你。' },
    { key: 'breakthrough', name: '蓄力停区', group: '成长', desc: '突破境界时的一局小游戏：长按蓄力，松手停在朱线区间内才算过关。' },
    { key: 'daodie', name: '道牒', group: '页面', desc: '记录身份、战力、称号、成就与存档的个人页。' },
    { key: 'daohao', name: '道号与道相', group: '页面', desc: '自己起的称呼与挑的头像；不设头像就用默认道相。' },
    { key: 'cangjingge', name: '藏经阁', group: '页面', desc: '功法页里花灵气、灵石兑换功法的地方。' },
    { key: 'jiyuan', name: '机缘', group: '页面', desc: '切磋首胜掉落一类的功法获取方式，不花资源。' },
    { key: 'codex', name: '功法图鉴', group: '页面', desc: '功法页里点开任意一张卡片看到的详情：玩法规则、练成收益与习得路径。未习得也能看全，锁的只是开练。' },
    { key: 'worlds', name: '此界之外', group: '页面', desc: '尚未开放的后续世界；当前只有青云界可玩。' },
    { key: 'code', name: '战力码', group: '对战', desc: '以 CW1- 开头的一串码。复制给朋友，对方粘贴后就能和你的镜像过招。' },
    { key: 'mirror', name: '镜像', group: '对战', desc: '按战力码还原出的「另一个人」，不用同时在线也能打一场。' },
    { key: 'mijing', name: '秘境', group: '对战', desc: '只产资源、不掉功法的挑战，适合攒兑换用的灵气与灵石。' },
    { key: 'stageRule', name: '本门新法', group: '玩法', desc: '熟练度到阶段后新增的规则或便利，每门功法各不相同，准备页会逐条列出。' },
    { key: 'shen', name: '心神', group: '玩法', desc: '部分玩法的容错次数，误触一次扣一盏，耗尽就收功。' },
    { key: 'pause', name: '收势', group: '玩法', desc: '刀法大成后的规矩：刀划到靶心时停一拍再抬手，才算这一招收得稳。' },
    // 「息」是整套参悟的计时单位，HUD、香炷、罚时全按它走，却从来没解释过。
    { key: 'xi', name: '息', group: '玩法', desc: '计时单位，一息即一秒。局内那一炷香、倒计时与「扣一息」都按息算。' },
];

// 评级中文名只此一份。以前 world.js 写「S=圆满」、修炼页写「S=绝佳」，
// 两套叫法并存，而且「圆满」还是段位名——结算页显示「圆满」会让人以为晋了段。
// 一律避开段位词（未入门 / 入门 / 小成 / 大成 / 圆满 / 大圆满）。
const GRADE_TITLE = { S: '绝佳', A: '上乘', B: '中平', C: '粗浅', F: '走火' };

// 跨页复用文案。WXML 只能写 {{copy.xxx}}，不许再抄一遍字面量。
const UI = {
    brand: BRAND,

    // 页脚不再是重复的品牌口号：给一个能用的下一步；指南页是唯一的例外。
    footHint: '有不懂的词？看修行指南 ›',
    footGuide: '参 悟 · 青云界',

    // 状态：只说在等什么，不拟人、不写「气机 / 翻检 / 整理论道台」这类黑话。
    loading: '正在读取进度…',
    errorTitle: '读取存档失败',
    errorDesc: '可以再试一次，或到「道牒」导入存档码。',
    emptyLog: '还没有动静，先去练一局吧。',
    emptyBoard: '榜单还空着，打一场就会留下战绩。',
    emptySkills: '尚未习得功法',

    // 按钮：同一动作只有一个说法。
    // 参悟 / 修炼 不是同义词，别混用：
    //   修炼 = 去练功台（选功法、看进度），参悟 = 在练功台打一局换熟练度。
    actions: {
        start: '开始参悟',
        practice: '去修炼',
        swap: '更换 ›',
        leave: '先不练了',
        close: '关闭',
        cancel: '取消',
        confirm: '收下',
        retry: '重试',
        expand: '展开 ›',
        collapse: '收起',
        expandAll: '全部展开',
        collapseAll: '全部收起',
        refresh: '重新加载',
        copy: '复制',
        viewDetail: '看详情 ›',
        goBattle: '去切磋',
        goHome: '去攒资源',
        openShop: '去藏经阁',
    },

    // 页面标题：主页面只显示金线标题，不再有眉标与说明句。
    // tabBar 文案与顺序由 data/navigation.js 管，这里只保留二级页可用的同名口径。
    pages: {
        index: { title: '主页' },
        cultivate: { title: '修炼' },
        skills: { title: '功法' },
        profile: { title: '人物' },
        battle: { title: '仙门切磋' },
        guide: { title: '玩法与数值' },
        help: { title: '说明' },
        log: { title: '修行日志' },
    },

    // 区块标题：用白话说清里面是什么，不用「就差一点 / 近况」这类含糊词。
    sections: {
        today: '今日份例',
        realm: '境界突破',
        more: '更多 · 修行记录与诸界',
        log: '修行记录',
        worlds: '诸界',
        family: '功法谱系',
        battleCode: '战力码 · 和朋友约战',
        settings: '设置与关于',
        glossary: '名词速查',
        guideToc: '目 录',
        codexPlay: '这一门练什么',
        codexGain: '练成之后',
        codexUnlock: '如何习得',
    },

    // 功法图鉴：未习得也能看全本功法。状态与按钮只说明「现在能不能做什么」，不写黑话。
    // 状态词只留页面真会用到的那几个；解锁路径本身由引擎给 label（见 utils/game.js
    // 的 unlockInfo），这里不再维护第二份同义说法。
    states: {
        learned: '已习得',
        buyable: '藏经阁可换',
        fortune: '机缘可得',
        enough: '资源已足',
        cleared: '已战胜',
    },

    hints: {
        guideToc: '点标签直接跳到那一节，不用往下翻。',
        codex: '锁的是开练，不是查阅：玩法规则、练成收益与习得路径都写在这里，先看清再决定要不要解开。',
        chain: '按类型看功法分布在哪些品阶。',
        battleCode: '低频操作收在这里，首屏先挑对手。',
        settings: '音效、指南与账号相关设置集中在这里。',
        glossary: '按「成长 / 页面 / 对战 / 玩法」分组，遇到不懂的词回来查。',
        more: '日志与后续世界不占首屏，想看再展开。',
    },
};

function termOf(key) {
    for (let i = 0; i < TERMS.length; i += 1) if (TERMS[i].key === key) return TERMS[i];
    return null;
}

// 境界衰减：两条分支都讲清「人物境界 / 熟练度 / 属性 / 评级」各是什么，
// 免得玩家把「三成」误当成评级门槛被抬高。
function decayText(kind, realmName) {
    const head = kind === 'above'
        ? '人物境界已超本门可修上限「' + realmName + '」'
        : '人物境界未到「' + realmName + '」门槛';
    return head + '，熟练度收益仅剩 30%；属性加成照拿，评级门槛不变。';
}

// 资源 / 进度统一写法：数字与单位之间留空格，不混用「+3 / 3 / 3 枚」。
function formatCost(qi, stone) {
    return '灵气 ' + qi + ' · 灵石 ' + stone;
}

function formatGain(qi, stone) {
    let s = '灵气 +' + qi;
    if (stone > 0) s += ' / 灵石 +' + stone;
    return s;
}

// 进度不在这里再包一层：它只有「当前 / 目标」两个数字、没有单位要拼，
// WXML 直接写 {{a}} / {{b}}，tests/layout.test.js 会挡住无空格写法。

module.exports = {
    BRAND: BRAND,
    TERMS: TERMS,
    UI: UI,
    GRADE_TITLE: GRADE_TITLE,
    termOf: termOf,
    decayText: decayText,
    formatCost: formatCost,
    formatGain: formatGain,
};
