'use strict';

// 跨页传参的唯一出入口。tab 页不能带 query，switchTab 只能先把参数暂存一次；
// 子页深链（分享卡 / 手工链接）缺参时也要有兜底。这两件事此前散落在各页直写
// getApp().globalData——谁写、谁读、什么时候清，全靠注释约定（2026-11 架构整改收拢）。
//
// 两种语义分开：
//   · lastSkillId —— 常驻兜底：上次对着练的是哪一门。功法页、主页吸底、换门三处写，
//     参悟页没带 ?skillId 时读它。不清除（下一次进参悟页仍要兜得住）。
//   · skillsTab —— 一次性传参：别处想让玩家落在功法页哪个分区，切过去前写一次，
//     功法页 onShow 读完即清，免得下次再进还停在那儿。
//
// 存储仍挂 globalData（小程序冷启动即重置，正合「本次会话」的语义），
// 但页面一律走这里，不再各处直写字段名。

function gd() {
  const app = getApp();
  return (app && app.globalData) || {};
}

// 常驻兜底：记「上次对着练的那一门」。
function setLastSkill(id) { gd().lastSkillId = id || ''; }
function lastSkill() { return gd().lastSkillId || ''; }

// 参悟页认门：query 优先，缺参用上次那门兜底。
function skillIdOf(query) {
  return (query && query.skillId) || lastSkill() || '';
}

// 一次性传参：切到功法页前先写去向，功法页 takeSkillsTab() 读完即清。
function setSkillsTab(tab) { gd().skillsTab = tab || ''; }
function takeSkillsTab() {
  const g = gd();
  const want = g.skillsTab;
  if (want === 'learned' || want === 'shop') {
    g.skillsTab = '';
    return want;
  }
  return '';
}

module.exports = {
  setLastSkill: setLastSkill,
  lastSkill: lastSkill,
  skillIdOf: skillIdOf,
  setSkillsTab: setSkillsTab,
  takeSkillsTab: takeSkillsTab,
};
