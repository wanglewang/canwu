'use strict';

// 榜单与头像：复用 app 里唯一的 cloud 客户端，不另建连接。
// canwu_scores 的 RLS 是「所有人可读、仅本人可写」，所以榜单里的每行都是别的账号真实上传的战绩。
// 头像落在云存储 users/<uid>/ 下，显示时换短期签名 URL；小程序 SDK 不支持 storage.download，
// 所以这里不尝试下载文件，签名 URL 拿不到就回退到 CSS 道相。

const { cloud } = require('./cloud.js');
const engine = require('./game.js');
const worldData = require('../data/world.js');

const SCORE_TABLE = 'canwu_scores';
const SCORE_COLS = 'owner_id,role_name,portrait,realm_index,power,updated_at';
const PUBLISH_INTERVAL_MS = 30000;

let lastPublishAt = 0;

async function sessionUser() {
  try {
    const result = await cloud.auth.getSession();
    if (result && !result.error && result.data) return result.data.user || null;
  } catch (e) { /* 网络异常等同未登录 */ }
  return null;
}

function realmNameOf(index) {
  const realms = worldData.getWorld('xian').realms;
  return realms[index] ? realms[index].name : '未知境界';
}

function scoreRowOf(state) {
  const power = engine.computePower(state);
  return {
    role_name: String(state.roleName || '无名道友').slice(0, 12),
    portrait: Math.floor(Number(state.portrait) || 0) % 6,
    realm_index: Math.floor(Number(state.realmIndex) || 0),
    power: power,
    battle_payload: { code: engine.battleCode(state), power: power },
  };
}

// 上传自己的战绩。owner_id 由数据库 DEFAULT 填充，前端不传，避免伪造他人成绩。
async function publishScore(state, force) {
  const now = Date.now();
  if (!force && now - lastPublishAt < PUBLISH_INTERVAL_MS) return { ok: true, skipped: true };
  const user = await sessionUser();
  if (!user || !user.id) return { ok: false, message: '请先登录' };

  const row = scoreRowOf(state);
  let result;
  try {
    const found = await cloud.database.from(SCORE_TABLE)
      .select('id')
      .eq('owner_id', user.id)
      .limit(1);
    if (found && found.error) return { ok: false, message: found.error.message || '榜单读取失败' };
    const existing = found && Array.isArray(found.data) ? found.data : [];
    if (existing.length > 0) {
      result = await cloud.database.from(SCORE_TABLE)
        .update(row)
        .eq('id', existing[0].id)
        .select('id');
      if (result && result.error) return { ok: false, message: result.error.message || '战绩更新失败' };
      if (!result || !Array.isArray(result.data) || result.data.length === 0) {
        return { ok: false, message: '战绩更新失败：无权修改这一行' };
      }
    } else {
      result = await cloud.database.from(SCORE_TABLE).insert(row).select('id');
      if (result && result.error) {
        if (result.error.code === '23505') return { ok: true, retried: true };
        return { ok: false, message: result.error.message || '战绩上传失败' };
      }
    }
  } catch (e) {
    return { ok: false, message: '榜单连接失败，请检查网络' };
  }
  lastPublishAt = now;
  return { ok: true, skipped: false };
}

async function listScores(limit) {
  const user = await sessionUser();
  let result;
  try {
    result = await cloud.database.from(SCORE_TABLE)
      .select(SCORE_COLS)
      .order('power', { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 20, 1), 50));
  } catch (e) {
    return { ok: false, rows: [], message: '榜单连接失败，请检查网络' };
  }
  if (result && result.error) return { ok: false, rows: [], message: result.error.message || '榜单读取失败' };
  const rows = result && Array.isArray(result.data) ? result.data : [];
  const me = user && user.id ? user.id : '';
  return {
    ok: true,
    rows: rows.map(function (r, i) {
      return {
        rank: i + 1,
        uid: r.owner_id,
        isMe: r.owner_id === me,
        name: r.role_name || '无名道友',
        portrait: Math.floor(Number(r.portrait) || 0) % 6,
        realmName: realmNameOf(Math.floor(Number(r.realm_index) || 0)),
        power: Math.floor(Number(r.power) || 0),
      };
    }),
    message: '',
  };
}

// 一次拿到「我的战绩已上榜 + 完整榜单」，供仙门切磋页与仙榜页调用。
async function refreshBoard(state, force) {
  const published = await publishScore(state, force);
  const board = await listScores(20);
  return { published: published, board: board };
}

// 挑一个战力最接近、且不是自己的真实玩家作为对手；榜单不足时返回 null 由页面回退 NPC。
function pickRival(rows, myUid, myPower) {
  if (!Array.isArray(rows)) return null;
  let best = null;
  let bestGap = Infinity;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.isMe || (myUid && r.uid === myUid)) continue;
    const gap = Math.abs(r.power - myPower);
    if (gap < bestGap) { bestGap = gap; best = r; }
  }
  return best;
}

module.exports = {
  sessionUser: sessionUser,
  publishScore: publishScore,
  listScores: listScores,
  refreshBoard: refreshBoard,
  pickRival: pickRival,
  realmNameOf: realmNameOf,
};
