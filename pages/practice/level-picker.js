'use strict';

// 选关器：段在外层切、面板只铺当前段；「回打哪一关」的临时游标也收在这里。
// 从 practice.js 拆出来（2026-11 架构整改）：关卡推进的规则（只由走通推进、
// 回打不推、未至的关铺出来但点了有答）是纯逻辑，与页面 UI 状态分开后才测得到。
// 本模块不 setData、不弹 toast——返回值告诉页面「该重算 / 该答哪句话」。

const practiceData = require('../../data/practice.js');
const levelData = require('../../data/levels.js');

function createPicker() {
  // 关卡不落存档之外的任何地方：每次进这一页都按存档里本门走通的关数现算
  // （默认停在「已通 + 1」）。override 只记「这一次停留里玩家往回翻到第几关」，
  // 换页即弃——否则半年前回打过第 3 关，练到第 700 关还默认从第 3 关开局。
  let override = 0;

  // 本门当前显示关 = min(已通 + 1, override)；override 为 0 表示停在进度线。
  function resolveLevel(curNo) {
    const o = Math.round(override) || 0;
    return Math.max(1, Math.min(curNo, o || curNo));
  }

  // 一次一格，只能往回翻到已走通的关。往前推进只靠走通。
  // 返回 { changed } 或 { toast }：到顶不让人白点，说清「下一关怎么来」。
  function step(dir, data) {
    const next = data.level + dir;
    if (next < 1 || next > data.levelMax) {
      if (next > data.levelMax) {
        // 关卡只靠走通推进，所以这里不能说「攒够多少点才开新关」——那句话是假的。
        return {
          toast: data.cleared >= data.levelTotal
            ? '本门 1000 关已走完，已是「大圆满」'
            : '本门打到第 ' + data.levelMax + ' 关：走通它，下一关才开',
        };
      }
      return {};
    }
    override = next;
    return { changed: true };
  }

  // 点已走到的段：落到那一段已至的最高关。只换「看哪一段、打哪一关」，
  // 不解锁、不跳关；已经在看的段不跳（回打本段低关时不该被拽回进度线）。
  function pickStage(idx, data) {
    if (!(idx >= 0 && idx < practiceData.STAGES.length)) return {};
    const d = practiceData.STAGES[idx];
    // 没走到的段不给切：压暗写着「未至」只是提示，手指落上去仍要答一句差在哪。
    if (data.levelMax < d.from) {
      return { toast: '这一段还没走到，先走通第 ' + data.levelMax + ' 关' };
    }
    if (idx === data.stageIndex) return {};
    override = Math.min(d.to, data.levelMax);
    return { changed: true };
  }

  // 面板整段铺出来。只列已到达的关会让这一段像被截断——后半段的关号凭空消失，
  // 玩家读不出「这一段还有多少」，也看不出自己离段尾多远。
  // 走没走到是这个人的进度，看不看得见是面板的事，两件事分开。
  function buildLevels(idx, level, levelMax) {
    const d = practiceData.STAGES[idx];
    const out = [];
    for (let lv = d.from; lv <= d.to; lv += 1) {
      out.push({ v: lv, cur: lv === level, locked: lv > levelMax });
    }
    return out;
  }

  // 滚到当前关（在当前段内时），否则落段首——打开面板不该让人从头往下找。
  function anchor(idx, level, levelMax) {
    const d = practiceData.STAGES[idx];
    return (level >= d.from && level <= d.to && level <= levelMax) ? level : d.from;
  }

  // 未至的关铺在盘上但不可点：压暗只是提示，不是禁用——
  // 真点下去必须答一句「差在哪」，否则就是「点了没反应」。
  function pick(lv, data) {
    if (!(lv >= 1)) return {};
    if (lv > data.levelMax) {
      return { toast: '第 ' + lv + ' 关还没走到，先走通第 ' + data.levelMax + ' 关' };
    }
    if (lv === data.level) return { close: true };
    override = lv;
    return { close: true, changed: true };
  }

  // 回到「已通 + 1」：连打几局之后跳回进度线，不用一路点回去。
  function resume() {
    override = 0;
    return { changed: true };
  }

  function stageOfLevel(level) { return levelData.stageOfLevel(level); }

  return {
    resolveLevel: resolveLevel,
    step: step,
    pickStage: pickStage,
    buildLevels: buildLevels,
    anchor: anchor,
    pick: pick,
    resume: resume,
    stageOfLevel: stageOfLevel,
  };
}

module.exports = { createPicker: createPicker };
