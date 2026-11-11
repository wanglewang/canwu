'use strict';

// 功法品阶难度体系的常驻断言：数据阶梯、参数缩放安全边界、收益加成、纪录与老档迁移。
const assert = require('assert');
const skills = require('../data/skills.js');
const practice = require('../data/practice.js');
const minigames = require('../minigames/index.js');
const game = require('../utils/game.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log('OK  ' + name);
}

const PACE_KEYS = ['interval', 'flashMs', 'gapMs', 'windowMs', 'shuffleMs', 'flipMs', 'window'];
const GOAL_KEYS = ['chainGoal', 'maxRound', 'segments', 'beats', 'scramble', 'mines', 'pairs', 'decoys', 'startLen', 'baseLen'];
const BOARD_KEYS = ['grid', 'cols', 'rows', 'size'];

check('四阶品阶定义连续，难度与收益单调', function () {
  assert.strictEqual(practice.RANKS.length, 4);
  for (let i = 0; i < 4; i += 1) {
    const r = practice.RANKS[i];
    assert.strictEqual(r.rank, i + 1);
    assert.strictEqual(r.stars, i + 1);
    assert.ok(r.name && r.desc && r.reward > 0);
    if (i > 0) {
      const prev = practice.RANKS[i - 1];
      assert.ok(r.pace < prev.pace, '品阶越高节奏越紧');
      assert.ok(r.goal > prev.goal, '品阶越高目标越高');
      assert.ok(r.reward > prev.reward, '品阶越高收益越厚');
    }
  }
});

check('10 门功法都挂了合法品阶，四阶都有功法', function () {
  assert.strictEqual(skills.SKILLS.length, 10);
  const used = {};
  for (let i = 0; i < skills.SKILLS.length; i += 1) {
    const s = skills.SKILLS[i];
    assert.ok(Number.isInteger(s.rank) && s.rank >= 1 && s.rank <= 4, s.name + ' 品阶非法');
    used[s.rank] = true;
  }
  assert.strictEqual(Object.keys(used).length, 4);
});

check('同一脉内品阶不重复，进阶链按品阶升序', function () {
  const chains = skills.chainsOf();
  assert.ok(chains.length >= 3);
  for (let i = 0; i < chains.length; i += 1) {
    const items = chains[i].items;
    const seen = {};
    for (let j = 0; j < items.length; j += 1) {
      assert.ok(!seen[items[j].rank], chains[i].type + ' 一脉出现重复品阶');
      seen[items[j].rank] = true;
      if (j > 0) assert.ok(items[j].rank > items[j - 1].rank, chains[i].type + ' 进阶链未升序');
    }
  }
  const sword = skills.chainOfType('剑法');
  assert.strictEqual(sword.items.length, 2);
  assert.strictEqual(sword.items[0].name, '基础剑法');
  assert.ok(sword.items[1].rank > sword.items[0].rank, '高阶剑法必须比基础剑法难');
});

check('buildParams 绝不改盘面尺寸字段', function () {
  for (let i = 0; i < practice.PRACTICE_METHODS.length; i += 1) {
    const m = practice.PRACTICE_METHODS[i];
    for (let rank = 1; rank <= 4; rank += 1) {
      const out = practice.buildParams(m, rank);
      for (let k = 0; k < BOARD_KEYS.length; k += 1) {
        const key = BOARD_KEYS[k];
        if (typeof m.params[key] === 'number') {
          assert.strictEqual(out[key], m.params[key], m.id + ' 的 ' + key + ' 被改动');
        }
      }
    }
  }
});

check('品阶越高节奏越紧、目标越高（逐门逐阶）', function () {
  for (let i = 0; i < practice.PRACTICE_METHODS.length; i += 1) {
    const m = practice.PRACTICE_METHODS[i];
    for (let rank = 2; rank <= 4; rank += 1) {
      const prev = practice.buildParams(m, rank - 1);
      const now = practice.buildParams(m, rank);
      for (let k = 0; k < PACE_KEYS.length; k += 1) {
        const key = PACE_KEYS[k];
        if (typeof now[key] === 'number') assert.ok(now[key] <= prev[key], m.id + ' 的 ' + key + ' 未随品阶收紧');
      }
      for (let k = 0; k < GOAL_KEYS.length; k += 1) {
        const key = GOAL_KEYS[k];
        if (typeof now[key] === 'number') assert.ok(now[key] >= prev[key], m.id + ' 的 ' + key + ' 未随品阶抬高');
      }
      if (typeof now.speed === 'number') assert.ok(now.speed >= prev.speed, m.id + ' 收敛速度未加快');
    }
  }
});

check('缩放后的目标值不越过各玩法的安全上限', function () {
  for (let i = 0; i < practice.PRACTICE_METHODS.length; i += 1) {
    const m = practice.PRACTICE_METHODS[i];
    for (let rank = 1; rank <= 4; rank += 1) {
      const out = practice.buildParams(m, rank);
      if (out.pairs) assert.ok(out.pairs <= 8, '符对数超过 SIGNS 上限');
      if (out.decoys) assert.ok(out.decoys <= out.grid - 1, '影子数超过盘面');
      if (out.mines) assert.ok(out.mines <= out.cols * out.rows - 2, '禁制数超过安全格');
      if (out.startLen) assert.ok(out.startLen <= out.grid, '起始字数超过盘面');
      if (out.scramble) assert.ok(out.scramble <= out.size * out.size, '打乱步数超过盘面');
      assert.ok(!out.window || out.window >= 0.04, '判定窗过窄');
      assert.ok(!out.speed || out.speed >= 0.012, '收敛速度超出下限');
    }
  }
});

check('高阶功法实际拿到的参数与原始配置不同', function () {
  for (let i = 0; i < skills.SKILLS.length; i += 1) {
    const s = skills.SKILLS[i];
    if (s.rank === 2) continue;
    const m = practice.getMethod(s.method);
    const out = practice.buildParams(m, s.rank);
    const changed = Object.keys(m.params).some(function (k) { return out[k] !== m.params[k]; });
    assert.ok(changed, s.name + ' 品阶没有产生实际难度差异');
  }
  assert.deepStrictEqual(practice.buildParams(practice.getMethod('combo'), 2), practice.getMethod('combo').params);
});

check('每门功法都能按品阶参数创建对局', function () {
  for (let i = 0; i < skills.SKILLS.length; i += 1) {
    const s = skills.SKILLS[i];
    const m = practice.getMethod(s.method);
    const finished = [];
    const c = minigames.createGame(m.game, {
      params: practice.buildParams(m, s.rank),
      difficulty: 'normal',
      perks: { easy: false, tier: 0 },
      theme: {},
      twist: m.twist,
      render: function () {},
      finish: function (r) { finished.push(r); },
    });
    assert.ok(c && typeof c.start === 'function', m.game + ' 创建失败');
    c.destroy();
  }
});

check('difficultyOf 给出星级、收益与可读的难度变化', function () {
  for (let i = 0; i < skills.SKILLS.length; i += 1) {
    const s = skills.SKILLS[i];
    const d = practice.difficultyOf(practice.getMethod(s.method), s.rank);
    assert.strictEqual(d.rank, s.rank);
    assert.strictEqual(d.stars, s.rank);
    assert.strictEqual(d.starsText.length, 4);
    assert.ok(d.rewardText && d.desc && d.brief);
    assert.ok(d.changes.length <= 3);
  }
  assert.strictEqual(practice.difficultyOf(practice.getMethod('forge'), 99).rank, 4);
  assert.strictEqual(practice.difficultyOf(practice.getMethod('forge'), 0).rank, 1);
});

check('品阶加成进入熟练度，每门功法取本品阶倍率', function () {
  const seen = [];
  for (let i = 0; i < skills.SKILLS.length; i += 1) {
    const s = skills.SKILLS[i];
    const state = game.createNewState();
    state.skills[s.id].unlocked = true;
    const r = game.applyPractice(state, s.id, 'B', { score: 0 });
    const expect = practice.rankOf(s.rank);
    assert.strictEqual(r.rankBonus, expect.reward);
    assert.strictEqual(r.rankName, expect.name);
    assert.ok(r.gain > 0);
    seen.push(r.rankBonus);
  }
  assert.ok(seen.indexOf(1) >= 0 && seen.indexOf(1.18) >= 0 && seen.indexOf(1.4) >= 0 && seen.indexOf(1.7) >= 0);
});

check('局内得分写入本门最佳，只在破纪录时更新', function () {
  const s = game.createNewState();
  const a = game.applyPractice(s, 'jian', 'B', { score: 12 });
  assert.strictEqual(a.newRecord, true);
  assert.strictEqual(a.bestScore, 12);
  assert.strictEqual(s.records.jian.score, 12);
  const b = game.applyPractice(s, 'jian', 'A', { score: 20 });
  assert.strictEqual(b.newRecord, true);
  assert.strictEqual(b.prevBest, 12);
  assert.strictEqual(b.bestScore, 20);
  assert.strictEqual(s.records.jian.score, 20);
  const c = game.applyPractice(s, 'jian', 'S', { score: 8 });
  assert.strictEqual(c.newRecord, false);
  assert.strictEqual(c.bestScore, 20);
  assert.strictEqual(s.records.jian.score, 20, '低分不得覆盖最佳');
  assert.strictEqual(s.records.jian.grade, 'A', '纪录里的评级也不得被低分覆盖');
});

check('纪录能过滤非法功法 id，并随存档码往返', function () {
  const s = game.createNewState();
  s.records = { jian: { score: 33, grade: 'S', at: 123 }, ghost: { score: 999, grade: 'S', at: 1 }, bad: null };
  const n = game.normalizeState(s);
  assert.strictEqual(n.records.jian.score, 33);
  assert.ok(!n.records.ghost);
  assert.ok(!n.records.bad);
  const r = game.importSaveCode(game.exportSaveCode(n));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.records.jian.score, 33);
  assert.strictEqual(r.state.version, 3);
});

check('老档迁移到 v3 后补出空纪录表', function () {
  for (const v of [0, 1, 2]) {
    const old = game.createNewState();
    old.version = v;
    delete old.records;
    const n = game.normalizeState(old);
    assert.strictEqual(n.version, 3);
    assert.deepStrictEqual(n.records, {});
  }
});

check('功法列表与谱系视图带上品阶信息', function () {
  const s = game.createNewState();
  const list = game.getSkillList(s);
  assert.strictEqual(list.length, 10);
  for (let i = 0; i < list.length; i += 1) {
    assert.strictEqual(list[i].starsText.length, 4);
    assert.ok(list[i].rankName && list[i].rewardText && list[i].diffBrief);
    assert.strictEqual(list[i].bestText, '');
  }
  const chains = game.getRankChains(s);
  assert.ok(chains.length >= 3);
  let swordGaps = 0;
  for (let i = 0; i < chains.length; i += 1) {
    assert.ok(chains[i].label && chains[i].items.length > 0);
    assert.strictEqual(chains[i].slots.length, 4, chains[i].type + ' 谱系应列出完整四阶刻度');
    for (let j = 0; j < chains[i].items.length; j += 1) {
      const it = chains[i].items[j];
      assert.ok(it.rankName && it.starsText && it.gameName);
      assert.strictEqual(typeof it.unlocked, 'boolean');
    }
    for (let k = 0; k < chains[i].slots.length; k += 1) {
      const slot = chains[i].slots[k];
      assert.ok(slot.name && slot.starsText && slot.rankName);
      assert.strictEqual(slot.starsText.length, 4);
    }
    if (chains[i].type === '剑法') {
      swordGaps = chains[i].slots.filter(function (x) { return x.empty; }).length;
    }
  }
  assert.strictEqual(swordGaps, 2, '剑法目前只有基础与绝学，中间两阶应显式显示为空档');
});

console.log('\nrank.test: ' + passed + ' assertions passed');
