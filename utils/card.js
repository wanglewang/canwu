'use strict';

// 道牒图：一份绘制，两个入口（人物页「生成道牒」、静室页结算卡「生成道牒」）。
// 抽出来的原因是两页共用同一张图——复制一份画布代码，改一处忘一处，
// 玩家会在两个入口看到不一样的名帖。这里只做绘制与导出，不碰状态、不产资源。

const copy = require('../data/copy.js');

const W = 600;
const H = 880;

// data 必备字段（全部来自 getOverview / getTopSkills / battleCode 的现成读数）：
// worldLabel / worldName / roleName / equippedTitleName / realmName / power /
// attrsLine / statsLine / myCode / topSkills[{name,tierName,prof}]
function drawCard(ctx, data) {
  ctx.fillStyle = '#f2eee4';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2f4a41';
  ctx.fillRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = '#b8893b';
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 42, W - 84, H - 84);

  ctx.fillStyle = '#d8b775';
  ctx.font = '24px sans-serif';
  ctx.fillText('参 悟 · ' + data.worldLabel + ' · ' + data.worldName, 76, 106);

  ctx.fillStyle = '#fffdf7';
  ctx.font = 'bold 48px serif';
  ctx.fillText(data.roleName, 76, 178);
  ctx.fillStyle = '#c9d6cd';
  ctx.font = '24px sans-serif';
  ctx.fillText(data.equippedTitleName + ' / ' + data.realmName, 76, 220);

  ctx.fillStyle = '#d8b775';
  ctx.font = '20px sans-serif';
  ctx.fillText('战 力', 76, 288);
  ctx.fillStyle = '#fffdf7';
  ctx.font = 'bold 92px serif';
  ctx.fillText(String(data.power), 72, 380);

  ctx.strokeStyle = 'rgba(255,253,247,0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(76, 412);
  ctx.lineTo(W - 76, 412);
  ctx.stroke();

  ctx.fillStyle = '#c9d6cd';
  ctx.font = '22px sans-serif';
  ctx.fillText(data.attrsLine, 76, 458);

  ctx.fillStyle = '#d8b775';
  ctx.font = '22px sans-serif';
  ctx.fillText('代 表 功 法', 76, 518);
  ctx.font = '26px sans-serif';
  const top = data.topSkills || [];
  for (let i = 0; i < top.length; i += 1) {
    ctx.fillStyle = '#fffdf7';
    ctx.fillText(top[i].name, 76, 566 + i * 48);
    ctx.fillStyle = '#b8893b';
    ctx.fillText(top[i].rankName + '  ' + top[i].cleared + ' 关', 300, 566 + i * 48);
  }

  ctx.fillStyle = '#c9d6cd';
  ctx.font = '22px sans-serif';
  ctx.fillText(data.statsLine, 76, 724);
  ctx.fillStyle = '#9fb3a7';
  ctx.font = '20px sans-serif';
  ctx.fillText('战力码 ' + data.myCode, 76, 770);
  ctx.fillText(copy.BRAND.slogan, 76, 816);
}

// 从 state 现算绘制所需数据。算法逐字照 pages/profile/profile.js 的 refresh()——
// 那里是这些行的真源，两处必须相等，改一行就两边一起改（见文末断言）。
function dataOf(state, engine) {
  const ov = engine.getOverview(state);
  const attrsLine = ov.attrs.map(function (a) { return a.name + ' ' + a.value; }).join(' · ')
    + ' · 灵力 ' + ov.qi + ' / ' + ov.qiMax;
  const clearedTotal = engine.getSkillList(state).reduce(function (sum, s) {
    return sum + (s.stageLevel || 0);
  }, 0);
  return {
    worldLabel: ov.worldLabel,
    worldName: ov.worldName,
    roleName: ov.roleName,
    equippedTitleName: ov.equippedTitleName,
    realmName: ov.realmName,
    power: ov.power,
    attrsLine: attrsLine,
    statsLine: '习得 ' + ov.unlockedCount + ' / ' + ov.skillTotal + ' 门 · 共走通 ' + clearedTotal
      + ' 关 · 参悟 ' + ov.practiceCount + ' 次 · 胜 ' + ov.wins + ' 场',
    myCode: engine.battleCode(state),
    topSkills: engine.getTopSkills(state, 3),
  };
}

// 导出成图。onFail 由调用页给（各自决定 toast 文案），这一层不碰 wx.showToast。
function makeCard(canvasId, data, onFail) {
  const query = wx.createSelectorQuery();
  query.select('#' + canvasId).fields({ node: true, size: true }).exec(function (res) {
    if (!res || !res[0] || !res[0].node) { if (onFail) onFail(); return; }
    try {
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      if (!ctx) { if (onFail) onFail(); return; }
      let dpr = 2;
      try {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        dpr = win.pixelRatio || 2;
      } catch (e) { dpr = 2; }

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      drawCard(ctx, data);

      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0, y: 0, width: W, height: H,
        destWidth: W * dpr, destHeight: H * dpr,
        success: function (r) {
          const preview = function () { wx.previewImage({ urls: [r.tempFilePath], current: r.tempFilePath }); };
          if (wx.showShareImageMenu) wx.showShareImageMenu({ path: r.tempFilePath, fail: preview });
          else preview();
        },
        fail: function () { if (onFail) onFail(); },
      });
    } catch (e) { if (onFail) onFail(); }
  });
}

module.exports = {
  W: W,
  H: H,
  drawCard: drawCard,
  dataOf: dataOf,
  makeCard: makeCard,
};
