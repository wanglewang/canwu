'use strict';

// 成就只定义元数据与阈值，实际数值由 utils/game.js 从存档实时计算，
// 不需要往 state 里塞已解锁列表，老存档和 CANWU1: 存档码导入后也能立刻算出进度。

const ACHIEVEMENTS = [
  { id: 'first_practice', name: '初入道途', desc: '完成第 1 次参悟', glyph: '一', group: '修行', key: 'practiceCount', goal: 1 },
  { id: 'practice_10', name: '日日不辍', desc: '累计参悟 10 次', glyph: '十', group: '修行', key: 'practiceCount', goal: 10 },
  { id: 'practice_50', name: '百炼成钢', desc: '累计参悟 50 次', glyph: '百', group: '修行', key: 'practiceCount', goal: 50 },
  { id: 'grade_s', name: '一念通明', desc: '拿到 1 次神品评级', glyph: '神', group: '修行', key: 'gradeS', goal: 1 },
  { id: 'combo', name: '触类旁通', desc: '换门功法参悟，触发 1 次灵感', glyph: '悟', group: '修行', key: 'comboCount', goal: 1 },
  { id: 'tier_up', name: '登堂入室', desc: '功法档位提升 1 次', glyph: '进', group: '修行', key: 'tierUps', goal: 1 },
  { id: 'daily_3', name: '晨课不缺', desc: '累计领取 3 天份例', glyph: '勤', group: '修行', key: 'dailyClaimed', goal: 3 },

  { id: 'first_win', name: '初战告捷', desc: '论道取胜 1 次', glyph: '胜', group: '论道', key: 'wins', goal: 1 },
  { id: 'wins_10', name: '少有敌手', desc: '论道取胜 10 次', glyph: '战', group: '论道', key: 'wins', goal: 10 },
  { id: 'defeat_3', name: '遍访高手', desc: '首胜 3 位预设对手', glyph: '访', group: '论道', key: 'defeated', goal: 3 },

  { id: 'skills_5', name: '小有藏书', desc: '习得 5 门功法', glyph: '藏', group: '收藏', key: 'unlockedSkills', goal: 5 },
  { id: 'titles_3', name: '名动一方', desc: '解锁 3 个称号', glyph: '名', group: '收藏', key: 'titles', goal: 3 },

  { id: 'realm_2', name: '筑基有成', desc: '突破至筑基', glyph: '基', group: '境界', key: 'realmStep', goal: 2 },
  { id: 'power_170', name: '金丹之资', desc: '战力达到 170', glyph: '丹', group: '境界', key: 'power', goal: 170 },
];

function getAchievement(id) {
  for (let i = 0; i < ACHIEVEMENTS.length; i += 1) {
    if (ACHIEVEMENTS[i].id === id) return ACHIEVEMENTS[i];
  }
  return null;
}

module.exports = {
  ACHIEVEMENTS: ACHIEVEMENTS,
  getAchievement: getAchievement,
};
