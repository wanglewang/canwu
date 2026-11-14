'use strict';

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const copy = require('../../data/copy.js');
const nav = require('../../data/navigation.js');
const skillsData = require('../../data/skills.js');

// 功法详情 = 这一门功法的静室，不是「修炼 tab」。
// 进来只有两件事可做：看清这门是什么、开始参悟；换功法在原地弹一层，不必退回列表。
// 页面不再是 tab 页，所以能带 ?id=：从功法页点哪一门，进的就是哪一门的静室。
Page({
    data: {
        d: null,
        list: [],
        swapOpen: false,
        lastText: '',
        copy: copy.UI,
    },

    onLoad: function (options) {
        this.pickId = options && options.id ? options.id : '';
        this.listener = this.refresh.bind(this);
        store.subscribe(this.listener);
        this.refresh();
    },

    onShow: function () { this.refresh(); },

    onUnload: function () { store.unsubscribe(this.listener); },

    // 认门顺序：URL 带的 id → 上次练的 → 推荐 → 第一门。
    // 参数失效（比如存档回滚后这门没了）时静默回退，不把玩家扔在一个空白页上。
    refresh: function () {
        const state = store.get();
        const all = engine.getSkillList(state).filter(function (s) { return s.unlocked; });
        const app = getApp();
        let id = this.pickId || app.globalData.lastSkillId;
        if (!all.some(function (s) { return s.id === id; })) {
            const rec = engine.recommend(state);
            id = rec && rec.id && all.some(function (s) { return s.id === rec.id; })
                ? rec.id : (all.length > 0 ? all[0].id : '');
        }
        this.pickId = id;
        if (id) app.globalData.lastSkillId = id;
        const d = id ? engine.getSkillDetail(state, id) : null;
        const rec = d && state.records ? state.records[d.id] : null;
        const shortName = d ? (d.name.split(skillsData.NAME_RULE.sep)[1] || d.name) : '';
        if (shortName) wx.setNavigationBarTitle({ title: shortName });
        this.setData({
            d: d ? {
                id: d.id,
                name: d.name,
                shortName: shortName,
                // 印章用类别的第一个字，与功法页左侧方标同一个字，两处对得上。
                mark: d.type.slice(0, 1),
                type: d.type,
                tierLabel: d.tierLabel,
                methodName: d.methodName,
                gameName: d.gameName,
                gameId: d.gameId,
                desc: d.desc,
                flavor: d.flavor,
                prof: d.prof,
                percent: d.percent,
                profTierName: d.profTierName,
                nextText: d.nextText,
                // 收益三行里「大成特效」在没练到大成时是张空头支票，详情页只留前两行；
                // 完整三行仍在功法页图鉴里，想细看从那儿看。
                gainLines: (d.gainLines || []).slice(0, 2),
                effectText: d.effectText,
                effectUnlocked: d.effectUnlocked,
                decayed: d.decayed,
                decayText: d.decayText,
                sStreak: d.sStreak,
                sStreakGoal: d.sStreakGoal,
            } : null,
            list: all.map(function (s) {
                return {
                    id: s.id,
                    cardName: s.name.split(skillsData.NAME_RULE.sep)[1] || s.name,
                    mark: s.type.slice(0, 1),
                    metaText: s.profTierName + ' ' + s.percent + '%',
                    percent: s.percent,
                    current: s.id === id,
                };
            }),
            lastText: rec
                ? '上局 ' + rec.score + ' · ' + (copy.GRADE_TITLE[rec.grade] || rec.grade)
                : copy.UI.states.noRecord,
        });
    },

    onStart: function () {
        const d = this.data.d;
        if (!d) { wx.switchTab({ url: '/pages/skills/skills' }); return; }
        wx.navigateTo({ url: '/pages/practice/practice?skillId=' + d.id });
    },

    // 换功法在页内解决：弹一层已持列表，点一门就换掉本页的这门，导航标题跟着改。
    // 退回功法页再点一遍是三步，这里是一步。
    onToggleSwap: function () {
        this.setData({ swapOpen: !this.data.swapOpen });
    },

    onSwapTo: function (event) {
        this.pickId = event.currentTarget.dataset.id;
        this.setData({ swapOpen: false }, this.refresh.bind(this));
    },

    onGoHelp: function () {
        const d = this.data.d;
        if (!d) { wx.navigateTo({ url: nav.helpUrl('cultivate') }); return; }
        // 一门一册：说明页按这一门的玩法现拼，与参悟准备页右上角那本同一个来源。
        wx.navigateTo({ url: nav.practiceHelpUrl(null, d.gameId) });
    },

    // 页尾的「本页说明」讲这一页怎么用（换功法在哪、连 S 怎么算），
    // 与上面那个「玩法说明」不是一回事：那本讲盘面规则。
    onGoPageHelp: function () { wx.navigateTo({ url: nav.helpUrl('cultivate') }); },

    onGoSkills: function () { wx.switchTab({ url: '/pages/skills/skills' }); },

    noop: function () {},
});
