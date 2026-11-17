'use strict';

// 挂机 / 离线收益（闭关只产灵力，不给熟练度）
// 由 utils/game.js 按关注点拆出；跨文件只用 require，不持有任何模块级可变状态。

const { economyData, worldData } = require('./base.js');
const { checkTitles, effectValue, qiCap } = require('./profs.js');
const { addLog, checkDaily, num } = require('./state.js');

// ---------------------------------------------------------------- 挂机 / 离线收益



// 闭关的「预演」：只算不写。页面据此显示「已坐 N 分 · 灵力 +M」，
// 冷启动的 settleOffline 与随手点的 meditate 都走这一份算法，三处不许各算一遍。
//
// **闭关只产灵力，一分熟练度都不给。** 挂机能涨熟练度，等于挂着不玩也在涨属性——
// 那「参悟才是提速」这句话就是假的。所以 world.idle 里没有 profPerHour 这个数。
function idlePending(state) {
  const now = Date.now();
  const w = worldData.getWorld(state.worldId);
  const last = num(state.lastSeen, now);
  const empty = {
    minutes: 0, hours: 0, qi: 0, capped: false,
    qiRaw: 0, qiCap: qiCap(state), qiRoom: 0, overflow: 0, full: false,
  };
  // 时钟倒退（改系统时间，或云端存档来自时间超前的设备）：一分不给。
  if (last > now) return empty;
  const elapsedMs = Math.max(0, now - last);
  const capMs = w.idle.capHours * 3600 * 1000;
  const cappedMs = Math.min(elapsedMs, capMs);
  const minutes = Math.floor(cappedMs / 60000);
  const buff = state.buff || { multiplier: 1, until: 0 };
  let buffMinutes = 0;
  if (buff.until > last && buff.multiplier > 1) {
    buffMinutes = Math.max(0, Math.min(minutes, Math.floor((buff.until - last) / 60000)));
  }
  const effectiveMinutes = buffMinutes * buff.multiplier + (minutes - buffMinutes);
  const idleBonus = effectValue(state, 'offline');
  const hours = cappedMs / 3600000;
  // 气海装不下的部分当场散掉：这是「上限」真正的存在感，也是唯一会让人心疼的地方。
  // 存得下多少和坐了多少分钟是两件事，pi 分成 qiRaw / qi / overflow 三个数分别报，
  // 页面才能写「坐满 8 小时，收到 174，溢出 66」而不是含糊一句「已满」。
  const cap = qiCap(state);
  const qiRoom = Math.max(0, cap - Math.floor(num(state.resources.qi, 0)));
  const qiRaw = Math.floor(effectiveMinutes * w.idle.qiPerMinute * (1 + idleBonus));
  const qi = Math.min(qiRaw, qiRoom);
  return {
    minutes: minutes,
    hours: Math.round(hours * 10) / 10,
    qi: qi,
    capped: elapsedMs > capMs,
    qiRaw: qiRaw,
    qiCap: cap,
    qiRoom: qiRoom,
    overflow: qiRaw - qi,
    full: qiRoom <= 0,
  };
}

function settleOffline(state) {
  const now = Date.now();
  const last = num(state.lastSeen, now);
  // 时钟倒退（改系统时间，或云端存档来自时间超前的设备）：不结算、也不把回拨值写进存档。
  if (last > now) {
    state.lastSeen = last;
    checkDaily(state);
    return null;
  }
  const r = idlePending(state);
  state.lastSeen = now;
  checkDaily(state);
  if (r.minutes < 1) return null;

  state.resources.qi += r.qi;
  addLog(state, '闭关 ' + Math.floor(r.minutes / 60) + ' 时 ' + (r.minutes % 60) + ' 分，灵力 +' + r.qi
    + (r.overflow > 0 ? '（气海已满，散去 ' + r.overflow + '）' : ''), 'idle');
  return {
    minutes: r.minutes,
    hours: r.hours,
    capped: r.capped,
    qi: r.qi,
    qiCap: r.qiCap,
    overflow: r.overflow,
    full: r.full,
  };
}

// 打坐 = 当场收一次闭关。冷启动那次弹的是「闭关收获」，这一下叫「打坐」：
// 同一套算法，区别只在于它随时能点——灵力是参悟的油，油烧完了不该逼玩家杀掉小程序再开一遍。
// 不足一分钟明确回一句，不静默吞掉（点了没反应是这类按钮最容易挨骂的毛病）。
// 气海满了也要明说：这时候回一句「还没攒够」是错的——坐了很久，只是装不下。
function meditate(state) {
  const pending = idlePending(state);
  const tooSoon = '还没攒够一点，再坐两分钟。';
  // 满池没有第二条产出可收（闭关不涨熟练度），所以这里是「收不到」而不是「只涨熟练度」。
  // 话要说在「满了」上，否则玩家会以为自己坐得不够久。
  if (pending.full) {
    return {
      ok: false,
      msg: '灵力已满（' + Math.floor(num(state.resources.qi, 0)) + ' / ' + pending.qiCap
        + '）：再坐也装不下，去参一局，或破境、练真元拓气海。',
      full: true,
      qiCap: pending.qiCap,
    };
  }
  if (pending.minutes < 1 || pending.qi < 1) return { ok: false, msg: tooSoon };
  const r = settleOffline(state);
  if (!r) return { ok: false, msg: tooSoon };
  return {
    ok: true,
    minutes: r.minutes,
    hours: r.hours,
    qi: r.qi,
    capped: r.capped,
    qiCap: r.qiCap,
    overflow: r.overflow,
  };
}

function buffInfo(state) {
  const b = state.buff || { multiplier: 1, until: 0 };
  const left = Math.max(0, Math.ceil((b.until - Date.now()) / 60000));
  if (left <= 0 || b.multiplier <= 1) return { active: false, multiplier: 1, minutes: 0 };
  return { active: true, multiplier: b.multiplier, minutes: left };
}

function claimDaily(state) {
  const w = worldData.getWorld(state.worldId);
  checkDaily(state);
  if (state.daily.claimed) return { ok: false, msg: '今日已领过了' };
  if (state.daily.count < w.daily.target) {
    return { ok: false, msg: '还差 ' + (w.daily.target - state.daily.count) + ' 次参悟' };
  }
  // 装得下多少就领多少。旧版是「整份装不下就拒领」，看上去很讲究（份例是发放的，
  // 可以等人来取），实际上把这件事变成一道算术题：气海 174、份例 60，玩家练满三次
  // 时灵力往往还剩 130 以上，空位不足 60——也就是**解锁的那一刻正好领不到**。
  // 点了「领取」，灵力一点没动，玩家的结论只有一个：这是坏的。
  //
  // 气海照旧是硬上限（钱能买油，买不来更大的油箱），装不下的部分当场散掉，
  // 但必须照实说散了几个——「+21 / 60」比「+60」诚实，也比拒领有用。
  const cap = qiCap(state);
  const room = Math.max(0, cap - state.resources.qi);
  if (room <= 0) {
    return {
      ok: false,
      msg: '灵力已满（' + state.resources.qi + ' / ' + cap + '）：先练一局腾出空位，份例在这等你。',
      qiCap: cap,
      qiRoom: 0,
      full: true,
    };
  }
  const gain = Math.min(w.daily.qi, room);
  const lost = w.daily.qi - gain;
  state.daily.claimed = true;
  state.stats.dailyClaimed += 1;
  // 份例只补灵力：它是「今天练过了」的补给，不是工钱。灵石一分不给，
  // 那个只能靠切磋与秘境挣——两种货币的分工从第一笔收入就要成立。
  state.resources.qi += gain;
  const added = checkTitles(state);
  addLog(state, '领了今日参悟的份例：灵力 +' + gain + (lost > 0 ? '（气海只余 ' + room + ' 点，散 ' + lost + '）' : ''), 'daily');
  return { ok: true, qi: gain, quota: w.daily.qi, lost: lost, room: room, stone: 0, newTitles: added, qiCap: cap };
}

// 以灵石换灵力。只此一向：灵石减、灵力加，反过来永远没有入口（理由见 economy.js 文件头）。
//
// 三条限制缺一不可：
//   · 灵石够付；
//   · 气海装得下这一份——装不下就换不了，钱能买油、买不来更大的油箱；
//   · 只能是整数枚。
// 装不下时不要把余额凑成「能装下的部分」硬换：玩家按的是一枚，扣的也该是一枚。
function exchangeQi(state, count) {
  const n = Math.max(1, Math.floor(num(count, 1)));
  const gain = economyData.qiFromStone(n);
  const stoneNow = Math.max(0, Math.floor(num(state.resources.stone, 0)));
  if (stoneNow < n) {
    return { ok: false, msg: '灵石不足：还差 ' + (n - stoneNow) + ' 枚', need: n - stoneNow };
  }
  const cap = qiCap(state);
  const room = Math.max(0, cap - state.resources.qi);
  if (room < gain) {
    return {
      ok: false,
      msg: '气海只余 ' + room + ' 点，装不下 ' + gain + ' 点。先练一局再来换。',
      qiCap: cap,
      qiRoom: room,
      need: gain,
    };
  }
  state.resources.stone = stoneNow - n;
  state.resources.qi += gain;
  addLog(state, '以 ' + n + ' 枚灵石换得灵力 +' + gain, 'exchange');
  const added = checkTitles(state);
  return { ok: true, stones: n, qi: gain, qiCap: cap, newTitles: added };
}

// 兑换面板的报价。页面与结算走同一个 cap / room，按钮的亮灭与 exchangeQi 的判断因此不会打架。
function exchangeQuote(state) {
  const rate = economyData.QI_PER_STONE;
  const stone = Math.max(0, Math.floor(num(state.resources.stone, 0)));
  const cap = qiCap(state);
  const room = Math.max(0, cap - state.resources.qi);
  const byRoom = Math.floor(room / rate);
  const can = Math.min(stone, byRoom);
  let hint;
  if (stone <= 0) hint = '灵石不足。切磋与秘境是唯二的来路，先去打一场。';
  else if (room < rate) hint = '气海只余 ' + room + ' 点，装不下这一份。先练一局把灵力用掉，再来换。';
  else hint = '本盘气海容得下 ' + byRoom + ' 枚。换来的灵力立刻可用，不必等闭关。';
  return {
    rate: rate,
    stone: stone,
    qi: state.resources.qi,
    cap: cap,
    room: room,
    can: can,
    ready: can >= 1,
    hint: hint,
  };
}

module.exports = {
  buffInfo: buffInfo,
  claimDaily: claimDaily,
  exchangeQi: exchangeQi,
  exchangeQuote: exchangeQuote,
  idlePending: idlePending,
  meditate: meditate,
  settleOffline: settleOffline,
};
