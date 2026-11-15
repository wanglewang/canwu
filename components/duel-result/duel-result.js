'use strict';

// 一场对决的结算卡：仙门切磋与秘境探索共用一份。
//
// 为什么抽成组件：两页要显示的东西完全一样（我方挥出 / 对方接下、触发特效、
// 资源、新称号），抄成两份的话，下次调结算必然出现「切磋改了、秘境没改」。
// 组件只负责把引擎返回的那一份结果摆出来，不碰存档——谁打的、扣了什么，
// 都由 utils/game.js 在调用前算完。
//
// 传进来的是 engine.battle / engine.battleMirror 的原样返回，格式化也放在这里，
// 页面因此只剩「打一场 → 把结果塞进来」两件事。

const copy = require('../../data/copy.js');

function toView(r) {
  // 切磋与秘境都要先运功：灵力是付出去的，灵石是挣回来的，两行分开写。
  const lines = [];
  if (r.qiCost) lines.push({ k: '灵力', v: '−' + r.qiCost });
  if (r.stone > 0) {
    // 当日第 n 场的灵石按 0.85^(n-1) 衰减：不写清，玩家会以为赢了却少给了。
    const decay = r.stoneFactor && r.stoneFactor < 1
      ? '（今日第 ' + r.battleNo + ' 场 ×' + r.stoneFactor + '）'
      : '';
    lines.push({ k: '灵石', v: '+' + r.stone + decay });
  }
  if (r.dropName) lines.push({ k: '新功法', v: r.dropName });
  // 秘境不是「对手」是「地方」：第一次赢下来叫首过，说首胜会跟切磋混成同一件事。
  const firstClearLabel = r.kind === 'secret' ? '首过 · ' : '首胜 · ';
  // 本场运功：三式按出手顺序摆出来，每式一行。val 在这里算好，
  // 免得模板里写「起手给百分数、养息给灵力点」那条分支（两处各写一遍必错一处）。
  const moves = [];
  const src = (r.moves && r.moves.entries) || [];
  for (let i = 0; i < src.length; i += 1) {
    const m = src[i];
    moves.push({
      id: m.id,
      seal: m.seal,
      name: m.name,
      act: m.act,
      actName: m.actName,
      line: m.line,
      skillName: m.skillName,
      val: m.act === 'qi' ? '省 ' + m.relief + ' 灵力' : '+' + m.percent + '%',
    });
  }
  return {
    win: r.win,
    moves: moves,
    // 运功前的裸战力与运功后的出手值都要写：只写后一个，玩家会以为自己
    // 本来就有那么多力气，看不出这三式做了什么。
    power: r.power || 0,
    powerAfter: r.powerAfter || r.power || 0,
    hasBoost: !!r.powerAfter && r.powerAfter > r.power,
    headline: r.win
      ? (r.firstClear ? firstClearLabel + r.challengeName : '胜 · ' + r.challengeName)
      : '惜败 · ' + r.challengeName,
    // 副标题要能在一行里放下：小屏上「双方各有 ±15% 波动」会把「波动」挤到第二行。
    subline: r.challengeTitle + ' · ±15% 波动',
    playerRoll: r.playerRoll,
    enemyRoll: r.enemyRoll,
    effects: r.effects || [],
    lines: lines,
    line: r.line,
    titles: (r.newTitles || []).map(function (t) { return t.name; }),
    winTone: r.win ? 'jade' : 'red',
  };
}

Component({
  // 组件里的按钮、弹窗、结果行都用 app.wxss / styles/immortal.wxss 的通用类，
  // 不共享全局样式的话，这里会掉成一列没有底色的字。
  options: { styleIsolation: 'apply-shared' },

  properties: {
    show: { type: Boolean, value: false },
    result: { type: Object, value: null },
  },

  data: {
    view: null,
    copy: copy.UI,
  },

  observers: {
    'show, result': function (show, result) {
      this.setData({ view: show && result ? toView(result) : null });
    },
  },

  methods: {
    onClose: function () { this.triggerEvent('close'); },
    noop: function () {},
  },
});
