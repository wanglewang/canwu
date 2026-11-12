'use strict';

// 称号与成就：纯数据，engine 按 metric / target 判定，称号可佩戴并出现在角色卡片上。

const TITLES = [
  { id: 't01', name: '初入道途', desc: '完成第一次参悟', metric: 'practiceCount', target: 1 },
  { id: 't02', name: '略窥门径', desc: '任意一门功法升至入门', metric: 'maxTier', target: 1 },
  { id: 't03', name: '一技大成', desc: '任意一门功法升至大成', metric: 'maxTier', target: 3 },
  { id: 't04', name: '炉火纯青', desc: '任意一门功法升至圆满', metric: 'maxTier', target: 4 },
  { id: 't05', name: '初战告捷', desc: '第一次战胜对手', metric: 'wins', target: 1 },
  { id: 't06', name: '同门无敌', desc: '累计战胜 5 次', metric: 'wins', target: 5 },
  { id: 't07', name: '筑基修士', desc: '突破至筑基', metric: 'realmIndex', target: 1 },
  { id: 't08', name: '金丹修士', desc: '突破至金丹', metric: 'realmIndex', target: 2 },
  { id: 't09', name: '博闻强识', desc: '习得 5 门功法', metric: 'unlockedCount', target: 5 },
  { id: 't10', name: '万法归一', desc: '习得全部 13 门功法', metric: 'unlockedCount', target: 13 },
  { id: 't11', name: '触类旁通', desc: '触发 10 次触类旁通', metric: 'comboCount', target: 10 },
  { id: 't12', name: '日日精进', desc: '完成 1 次每日参悟', metric: 'dailyClaimed', target: 1 },
  { id: 't13', name: '一击圆满', desc: '取得 10 次 S 档', metric: 'gradeS', target: 10 },
  { id: 't14', name: '返璞归真', desc: '任意一门功法练至大圆满', metric: 'maxTier', target: 5 },
];

module.exports = { TITLES: TITLES };
