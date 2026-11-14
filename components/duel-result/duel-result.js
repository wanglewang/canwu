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
  const lines = [{ k: '灵气', v: '+' + r.qi }];
  if (r.stone > 0) lines.push({ k: '灵石', v: '+' + r.stone });
  if (r.dropName) lines.push({ k: '新功法', v: r.dropName });
  // 秘境不是「对手」是「地方」：第一次赢下来叫首过，说首胜会跟切磋混成同一件事。
  const firstClearLabel = r.kind === 'secret' ? '首过 · ' : '首胜 · ';
  return {
    win: r.win,
    headline: r.win
      ? (r.firstClear ? firstClearLabel + r.challengeName : '胜 · ' + r.challengeName)
      : '惜败 · ' + r.challengeName,
    subline: r.challengeTitle + ' · 双方各有 ±15% 波动',
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
