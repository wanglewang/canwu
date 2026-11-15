'use strict';

// 本场运功：切磋与秘境共用的「三式」选择面板。
//
// 为什么抽成组件：两页的规则完全一致（至多三式、选中才生效、养息抵灵力），
// 抄两份的话下次调平衡必然出现「切磋改了、秘境没改」——duel-result 当初
// 抽出来也是同一个理由。
//
// 组件不碰存档、也不算数值：选中了哪几门由页面决定，这里只把「这一式叫什么、
// 加多少、省多少」摆出来，点一下就抛 pick。数值真源在 utils/game.js。

function decorate(list) {
  const out = [];
  for (let i = 0; i < (list || []).length; i += 1) {
    const x = list[i];
    out.push({
      id: x.id,
      seal: x.seal,
      name: x.name,
      skillName: x.skillName,
      act: x.act,
      actName: x.actName,
      // 起手 / 守势是百分数，养息是灵力点数：两套单位在一行里必须一眼分得开。
      val: x.act === 'qi' ? '省 ' + x.relief + ' 灵力' : '+' + x.percent + '%',
      tier: x.tier || '',
      line: x.line || '',
      on: !!x.on,
    });
  }
  return out;
}

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    slots: { type: Array, value: [] },
    pool: { type: Array, value: [] },
    max: { type: Number, value: 3 },
    cost: { type: Number, value: 5 },
    // 运功之后的出手值。放在这里而不是页头：玩家改一式就要看见数字动一下，
    // 否则「选功法」只是换了个名字，跟战力有没有关系全靠猜。
    power: { type: Number, value: 0 },
  },

  data: {
    open: false,
    slotView: [],
    poolView: [],
    spare: 3,
  },

  observers: {
    slots: function (v) {
      this.setData({ slotView: decorate(v), spare: Math.max(0, this.data.max - (v || []).length) });
    },
    pool: function (v) { this.setData({ poolView: decorate(v) }); },
  },

  methods: {
    // 默认收起：三式已经在牌上摆着，候选池是「想换才展开」的低频操作。
    onToggle: function () { this.setData({ open: !this.data.open }); },
    onPick: function (event) { this.triggerEvent('pick', { id: event.currentTarget.dataset.id }); },
    noop: function () {},
  },
});
