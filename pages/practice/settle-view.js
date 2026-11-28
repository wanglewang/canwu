'use strict';

// 结算视图：把「一局打完」翻成玩家读的那张卡（rv）与五段演出时序。
// 从 practice.js 拆出来（2026-11 架构整改）：页面只管收结果、挂状态、摆按钮；
// 账目文案、进境事件、演出节奏都收在这里——改结算文案不必再翻两千行的页面文件。
// 存档写入仍走 store.commitCritical，本模块只组文案，不碰状态。

const store = require('../../utils/store.js');
const engine = require('../../utils/game.js');
const worldData = require('../../data/world.js');
const copy = require('../../data/copy.js');
const visual = require('../../data/visual.js');

// 构造结算视图对象。返回 { rejected: true } 表示引擎拒绝结算
// （境界不够 / 灵石不够），调用方 toast 后回准备屏，不读空结果的字段。
// ctx: { mode, aborting, level, stageBoardShort, levelChange }
function buildResult(res, ctx) {
  const grade = res.grade || 'C';
  const color = worldData.GRADE_COLOR[grade] || '#8a8f83';
  const gradeTitle = copy.GRADE_TITLE[grade] || '';
  const mode = ctx.mode;
  let rv;

  // F 有两种来历，处置完全不同：
  //   ① 玩家点「结束」→ 这一局作废，不进结算，由 onAbandon 直接作废；
  //   ② 玩法自己判负（阵溃 / 心神耗尽 / 时辰到没通完）→ 是一局打完的结果，
  //      按失败结算：零收益（进度 / 灵力 / 灵石 / 加成都不给）。
  // 突破局只有一种 F：气机一乱，走 ①。
  if (grade === 'F' && (ctx.aborting || mode === 'breakthrough')) {
    let btFail = null;
    if (mode === 'breakthrough') {
      // 冲关不成也是花钱的：布阵的灵石散掉一半，得在结算里如实说。
      btFail = store.commitCritical(function (s) { return engine.applyBreakthrough(s, 'F'); });
      // 灵石不够 / 境界已满时引擎拒绝结算，返回的只有 ok:false 与 msg。
      // 不拦会在结算卡里写出「散了 undefined 枚」。
      if (btFail && btFail.ok === false) return { rejected: true, message: btFail.msg };
    }
    rv = {
      kind: 'abandon',
      // 大字位只放得下一个字，又不能写「F」——那是打崩的评级，玩家自己退的不算。
      // 破折号 = 本局没有成绩，与下面「本局作废」是同一句话。
      grade: '—',
      aborted: true,
      gradeColor: '#8a8f83',
      // 玩家自己退的，不写「失败」——大字已经是破折号，副标题只需说清这一局不算数。
      gradeTitle: '本局作废',
      headline: mode === 'breakthrough' ? '突破失败' : '中途结束',
      subline: mode === 'breakthrough'
        ? '气机散了，根基没伤，再来一次。'
        : '这回不算数，随时可以重新起手。',
      summary: res.summary,
      lines: btFail && btFail.stoneCost > 0
        ? [{ k: '灵石', v: '−' + btFail.stoneCost + ' · 余 ' + btFail.stoneAfter }]
        : [],
      notes: btFail && btFail.stoneCost > 0
        ? ['冲关失手，布阵的灵石散了 ' + btFail.stoneCost + ' 枚；余下的还在，调整好再来。']
        : [],
      titles: [],
      // 冲关局没有盘面可留（那一盘是蓄力条），两个去处与成功时一致。
      primary: mode === 'breakthrough' ? copy.UI.actions.backHome : copy.UI.actions.again,
      secondary: mode === 'breakthrough' ? copy.UI.actions.goSkills : copy.UI.actions.back,
    };
  } else if (mode === 'breakthrough') {
    const r = store.commitCritical(function (s) { return engine.applyBreakthrough(s, grade); });
    if (r && r.ok === false) return { rejected: true, message: r.msg };
    rv = {
      kind: 'breakthrough',
      grade: grade,
      gradeColor: color,
      gradeTitle: gradeTitle,
      headline: '突破 · ' + r.realmName,
      subline: '境界加成提高，战力上限打开。',
      summary: res.summary,
      lines: [
        // 布阵是花出去的钱：写「−60」而不是「+60」。
        { k: '灵石', v: '−' + r.stoneCost + ' · 余 ' + r.stoneAfter },
        { k: '境界', v: r.realmName },
        { k: '战力', v: r.powerBefore + ' → ' + r.powerAfter + '（+' + (r.powerAfter - r.powerBefore) + '）' },
        // 气海是突破的第二重所得，而且当天就能摸到：破境即补满，一趟能多练几局。
        { k: '灵力上限', v: r.qiCapBefore + ' → ' + r.qiCapAfter + '（+' + (r.qiCapAfter - r.qiCapBefore) + '）' },
        { k: '灵力', v: '已补满 ' + r.qiAfter + ' / ' + r.qiCapAfter },
      ],
      notes: ['此后闭关与对战都按新境界计算：闭关每分钟的灵力与每日份例不变，但可修上限更高、气海更深。'],
      titles: (r.newTitles || []).map(function (t) { return t.name; }),
      primary: copy.UI.actions.backHome,
      secondary: copy.UI.actions.goSkills,
    };
  } else {
    const skillId = ctx.skillId;
    const lv = ctx.level;
    const r = store.commitCritical(function (s) {
      return engine.applyPractice(s, skillId, grade, {
        level: lv, score: res.score || 0, goalMissed: res.goalMissed,
      });
    });
    // 引擎拒绝开局时不带结算字段：地阶功法在筑基期能进静室、能打完，
    // 但 applyPractice 会因境界不足直接返回 {ok:false}。不拦就会读
    // r.buffMultiplier.toFixed 抛异常，玩家只看到一屏空卡。
    if (r && r.ok === false) return { rejected: true, message: r.msg };
    // 参悟只换关卡进度，不产资源：结算卡里灵力是「花掉的」，不是「赚到的」。
    // 这一行是玩家唯一能核对的账，所以耗气的三个修正也要在同一屏写清（见 notes）。
    const lines = r.wiped
      // 失败不是「得 0 分」，是这一局不作数：一排 +0 会让人以为自己算错了。
      ? [
        { k: '所得', v: '无 · 未完成' },
        { k: '灵力', v: '−' + r.qiCost + '（不退）' },
        { k: '局内得分', v: String(res.score || 0) },
      ]
      : [
        // 主行只报一件事：这一局把本门往前推了没有。推了一关写 +1，
        // 没推写清为什么（目标没做成 / 回关 / 已到顶），不写 +0。
        { k: '进境', v: r.advanced ? '+1 关（' + r.clearedAfter + ' / ' + r.levelTotal + '）'
          : (r.goalMissed ? '目标未达成 · 不推进'
            : (r.levelBelowCap ? '回关 · 不推进' : '已走通全部 ' + r.levelTotal + ' 关')) },
        // 没做成目标：这一关不往前推，但也不算失败。这一行必须单列——
        // 不写的话玩家会以为卡住了（进度没动），或者反过来以为过关了（有收益）。
        // 做成了也单列：这一门是「做成即收工」，目标就是终点，结算不认它等于终点没有回执。
        ...(res.goalDone ? [{ k: '本局目标', v: '已达成 · 收工' }]
          : (r.goalMissed ? [{ k: '本局目标', v: '未达成 · 这一关还没通' }] : [])),
        // 打的是本门当前关就写「本关」，往回翻就写「回关」。
        // 关号是一条 1–1000 的长轴，段名只是这段读法：写「入门 · 第 3 / 1000 关」，
        // 玩家才不会以为「大成的第 3 关」与「入门的第 3 关」是同一格。
        ...(r.level > 0 ? [{
          k: '关卡',
          v: r.stageName + ' · 第 ' + r.level + ' / ' + r.levelTotal + ' 关'
            + (r.levelWasCurrent ? '（本关）' : ' · 回关'),
        }] : []),
        // 结算也报一次盘面规格：玩家打完最容易问「刚才那局难在哪」，
        // 只在准备屏说过一次等于没说。整句 brief 放不下，用与局内同一份短版。
        ...(ctx.stageBoardShort ? [{
          k: copy.UI.labels.boardSpec,
          v: ctx.stageBoardShort,
        }] : []),
        // 兜底句「与上一关规格相同」每关都出现，摆到结算只会像卡住了；
        // 真有看得见的变化才单列一行。
        ...(ctx.levelChange && ctx.levelChange.indexOf('与上一关规格相同') !== 0 ? [{
          k: copy.UI.labels.boardChange,
          v: ctx.levelChange,
        }] : []),
        { k: '灵力', v: '−' + r.qiCost + ' · 余 ' + r.qiAfter + ' / ' + r.qiMax },
        // 这一门的分有一大半是「剩余手数折出来的」。只报总分，玩家会以为全是自己打出来的，
        // 也就看不懂「为什么收得少反而拿了更高档」。拆成两截，账才核得上。
        { k: '局内得分', v: res.goalBonus > 0
          ? Math.max(0, (res.score || 0) - res.goalBonus) + ' + 余手折 ' + res.goalBonus
          : String(res.score || 0) },
      ];
    // 失败没给加成：这行留着会让玩家以为「崩了还蹭到了 30 分钟加速」。
    if (!r.wiped) lines.push({ k: '挂机加速', v: '×' + r.buffMultiplier.toFixed(1) + ' · 30 分钟' });
    // 战力是阶梯值：只跟段位系数与境界加成走，段位不跳它就一分不动。
    // 所以不能只报「这局涨了多少战力」（大多数局都是 0，等于每局告诉玩家白练），
    // 要连「离下一境还差多少」一起报——玩家心里的目标一直是境界，不是某一门的段位。
    const dp = r.powerAfter - r.powerBefore;
    lines.push({ k: '战力', v: dp > 0 ? r.powerAfter + '（+' + dp + '）' : r.powerAfter + ' · 跨段才涨' });
    const btAfter = engine.breakthroughInfo(store.get());
    if (!btAfter.maxed) {
      lines.push({ k: '距离「' + btAfter.nextName + '」', v: '还差 ' + Math.max(0, btAfter.need - r.powerAfter) + ' 战力' });
    }
    // 本局进境：打一局和「修仙变强」之间那根看得见的因果。
    // 只收「真的变了」的事，没变就一行都不显示——每局都摆一句等于没有信息。
    // 事件全部来自本局结算的 r 字段，不新造数值、不改评级线。
    const milestones = [];
    // shown 记下已经上正面的事件，notes 里相同的那条就不必再说一遍。
    const shown = {};
    if (!r.wiped) {
      if (r.promoted) { milestones.push('踏入「' + r.stageAfterName + '」，盘面换新、耗气跟着涨'); shown.promoted = true; }
      if (r.tierUp) { milestones.push('【' + r.skillName + '】入「' + r.tierName + '」，属性加成提高'); shown.tierUp = true; }
      if (r.newRecord) { milestones.push('本门新纪录 ' + (res.score || 0) + ' 分'); shown.newRecord = true; }
      if (r.fortune) { milestones.push(r.fortune.text); shown.fortune = true; }
      if (r.newTitles && r.newTitles.length) milestones.push('得名号：' + r.newTitles.map(function (t) { return t.name; }).join('、'));
    }

    // 玩法层可以带自己的评级依据（星罗烛天诀写「走了几步 / 最优几步 / 为什么不是 S」）。
    // 它排在最前：玩家最先想知道的是这一局本身，而不是下一关在哪。
    const notes = Array.isArray(res.notes) ? res.notes.slice() : [];
    // 失败不是「成绩差」，是没走完：先把理由摆在最前，玩家才知道这一局到底栽在哪。
    // 灵力不退是这套经济的硬规则——起手就烧了，崩掉的只是这一局的进度与加成。
    if (grade === 'F') {
      notes.unshift('本局未走完，本门不推进度，挂机加成也不给；'
        + '起手烧掉的 ' + r.qiCost + ' 点灵力不退。');
    }
    // 没做成目标不是失败，但也不是过关：说清「这一关不推、也不算失败、重打不算回关」，
    // 三件事少写一件玩家就会往坏处猜（以为白练了，或者以为进度丢了）。
    if (r.goalMissed) {
      notes.unshift('本局预算走完还没做成目标，这一关没有往前推；重打同一关不算回关，耗气不变。');
    }
    // 耗气要当场可复算：玩家看到「灵力 −17」，得知道这个 17 是怎么来的。
    // 只在真被修正时才展开，标准档位不啰嗦。
    if (r.methodQiFactor !== 1 || r.tierQiCost > 1 || r.realmOverCost > 1 || r.qiSave > 0) {
      notes.push('本局耗气 ' + r.qiCost + '：' + r.stageName + '段基数'
        + (r.methodQiFactor !== 1 ? ' × 节奏 ' + r.methodQiFactor.toFixed(2) : '')
        + (r.tierQiCost > 1 ? ' × ' + r.tierLabel + ' ' + r.tierQiCost.toFixed(2) : '')
        + (r.realmOverCost > 1 ? ' × 境界超限 ' + r.realmOverCost.toFixed(1) : '')
        + (r.qiSave > 0 ? '，心法省 ' + Math.round(r.qiSave * 100) + '%' : '')
        + '，悟性再省一截。');
    }
    // 回关折减要当场说：面板上退了几关、结算只给一部分，不解释就像算错了。
    if (r.levelBelowCap) {
      // 回关唯一的意义是练手感 / 刷记录：进度不推，所以耗气也不折——不能因为回关就便宜。
      notes.push('回打第 ' + r.level + ' 关（本门已走到第 ' + r.curLevel + ' 关，退 '
        + r.levelGap + ' 关）：这一局不推进度，耗气照本段基数算。'
        + '想推本门的进度，回第 ' + r.curLevel + ' 关打。');
    }
    // 走通的那一关要说出来：关卡靠过关推进，不报玩家就不知道刚才那局推没推进。
    if (r.advanced) {
      notes.push('第 ' + r.level + ' 关已走通（本门 ' + r.level + ' / ' + r.levelTotal
        + '）：下一局接第 ' + Math.min(r.levelTotal, r.level + 1) + ' 关。');
    } else if (!r.wiped && r.levelWasCurrent && r.level >= r.levelTotal) {
      notes.push('本门 ' + r.levelTotal + ' 关已全部走通：' + r.stageAfterName + '。');
    }
    // 晋段若已在正面报过，notes 不再重复（shown 由 milestones 那一节标记）。
    if (r.promoted && !shown.promoted) notes.push('踏入「' + r.stageAfterName + '」：这一段换了盘面，一局耗气也跟着涨。');
    if (r.tierUp && !shown.tierUp) notes.push('【' + r.skillName + '】入「' + r.tierName + '」，属性加成提高。');
    if (r.cross) notes.push('触类旁通：换了门功法，本局运功更顺，耗气少 8%。');
    if (r.levelFellBack) notes.push('所选关超出本门当前进度，已按第 ' + r.curLevel + ' 关结算。');
    if (r.realmAbove) {
      notes.push('人物境界已超本门可修上限「' + r.maxRealmName + '」：照样能练，但本局耗气 ×'
        + r.realmOverCost.toFixed(1) + '；进度照推，该换更高阶的功法了。');
    }
    if (r.newRecord && !shown.newRecord) {
      notes.push(r.prevBest > 0
        ? '破了本门纪录：' + (res.score || 0) + ' 分，此前最佳 ' + r.prevBest + ' 分。'
        : '立下本门首个纪录：' + (res.score || 0) + ' 分。');
    } else if (!r.newRecord && r.bestScore > 0) notes.push('本门最佳 ' + r.bestScore + ' 分，这回 ' + (res.score || 0) + ' 分。');
    if (r.fortune && !shown.fortune) notes.push(r.fortune.text);
    if (r.dailyReady) notes.push('今日参悟已满，回洞府可领份例。');
    rv = {
      kind: 'practice',
      grade: grade,
      gradeColor: color,
      // 失败时 headline 与 gradeTitle 都会写「失败」，标题行会重复两遍；
      // 这里让副标题改说「本局未完成」，把「为什么一分不给」留在 notes 里。
      gradeTitle: grade === 'F' ? '本局未完成' : gradeTitle,
      headline: grade === 'F'
        ? '失败'
        : (r.promoted ? '晋段 · ' + r.stageAfterName : '参悟完成'),
      subline: r.methodName + ' · ' + res.summary,
      summary: res.summary,
      // 演出大字与准备页「上局战绩」都读这几个字段。曾只把它们写进结算明细
      // lines，rv 自己没带：走通一关也恒显示「— / 未推进」，上局那行只剩标题。
      advanced: !!r.advanced,
      clearedAfter: r.clearedAfter,
      goalMissed: !!r.goalMissed,
      levelBelowCap: !!r.levelBelowCap,
      wiped: !!r.wiped,
      lines: lines,
      milestones: milestones,
      notes: notes,
      titles: (r.newTitles || []).map(function (t) { return t.name; }),
      // 一局打完，十有八九还想再来一局——它才该是那颗金按钮。
      // 「留在本页」退成下方文字链：那是给想多看两眼盘面的人留的。
      primary: copy.UI.actions.again,
      secondary: copy.UI.actions.backSkills,
    };
  }

  // 结算的两颗按钮 + 一条文字链：金按钮「再来一局」（一局打完多半还想连刷）、
  // 次按钮「返回功法」、文字链「留在本页」（留着盘面多看两眼）。
  // 突破结算没有盘面也没有下一局，保持原来的两个去处。
  rv.canStay = mode !== 'breakthrough';
  return rv;
}

// 收起结算后准备页顶部那一行「上局战绩」：写短、写准，随时能把明细叫回来重看。
// 中途结束 / 失败各自一个词，别再拼「这一局没走完」那种一读就断的短语。
function briefOf(rv, grade) {
  if (!rv.canStay) return '';
  const gain = rv.advanced ? '走通第 ' + rv.clearedAfter + ' 关'
    : (rv.goalMissed ? '目标未达成' : (rv.levelBelowCap ? '回关' : ''));
  const briefTitle = rv.kind === 'abandon' ? '结束' : (grade === 'F' ? '失败' : rv.gradeTitle);
  return '上局 · ' + (briefTitle || '') + (gain ? ' · ' + gain : '');
}

// 结算五段演出：S/A 满 1.8 秒，B/C/F 压到 900ms；全程不用逐帧 setData。
// 返回可直接 setData 的补丁；时间线只从 visual.settleTimeline 取，不在这里另写一份。
function startPatch(rv, grade, percent) {
  // 大数字只报一件事：这一局把本门往前推了几关。推不动就写「未推进」，
  // 不写 +0——+0 读起来像算错，玩家会以为是数值出了 bug。
  const gain = rv.advanced ? '+1' : '—';
  const gainLabel = rv.advanced ? '关' : (rv.wiped ? '本局作废' : (rv.goalMissed ? '目标未达成' : '未推进'));
  return {
    timeline: visual.settleTimeline(grade),
    patch: {
      settlePhase: 0,
      settleFull: visual.SETTLE.fullGrades.indexOf(grade) >= 0,
      settleGain: gain,
      settleGainLabel: gainLabel,
      settlePercent: percent,
    },
  };
}

module.exports = {
  buildResult: buildResult,
  briefOf: briefOf,
  startPatch: startPatch,
};
