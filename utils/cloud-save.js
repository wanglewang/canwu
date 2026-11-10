'use strict';

// 云端存档适配层：每个登录用户在 canwu_saves 里只有一行。
// owner_id 由数据库 DEFAULT auth.uid() 填充，前端不传；RLS 保证只能读写自己的那行。
// version / updated_at 由 BEFORE UPDATE trigger 在服务端维护，前端一律不写，避免客户端改表刷时间。
// 这里直接用原生 cloud.database 链式 API（官方资产 createTableAccess 的 update 只支持按 id 定位），
// 因为乐观锁需要额外追加 .eq('version', expectedVersion)。

const { cloud } = require('./cloud.js');

const TABLE = 'canwu_saves';
const SELECT = 'id,payload,version,updated_at';

let rowId = null;
let rowVersion = null;
let rowUpdatedAt = '';

function messageOf(error, fallback) {
  if (!error) return fallback;
  const code = error.code || '';
  if (code === '42P01') return '云端存档表尚未创建';
  if (code === '42501') return '没有权限访问这份存档';
  if (code === '23505') return '这份存档已存在，正在重新对齐';
  if (code === 'NOT_FOUND_OR_FORBIDDEN') return '存档已被移除或无权修改，请重新登录';
  if (code === 'CLIENT_EXCEPTION' || code === '') return '网络连接失败，请稍后重试';
  if (typeof error.message === 'string' && error.message) return error.message;
  return fallback;
}

function rowsOf(result) {
  return result && Array.isArray(result.data) ? result.data : [];
}

function track(row) {
  if (!row) return;
  if (row.id !== undefined && row.id !== null) rowId = row.id;
  if (row.version !== undefined && row.version !== null) rowVersion = Number(row.version);
  if (row.updated_at) rowUpdatedAt = row.updated_at;
}

async function hasSession() {
  const session = await cloud.auth.getSession();
  return !session.error && !!session.data;
}

// 读：先过认证门，未登录时不发起任何表查询。
async function load() {
  let session;
  try {
    session = await cloud.auth.getSession();
  } catch (e) {
    return { status: 'error', message: '登录状态读取失败，请检查网络' };
  }
  if (session.error || !session.data) {
    rowId = null;
    rowVersion = null;
    rowUpdatedAt = '';
    return { status: 'signed-out', message: '请先登录' };
  }
  let result;
  try {
    result = await cloud.database.from(TABLE)
      .select(SELECT)
      .order('updated_at', { ascending: false })
      .limit(1);
  } catch (e) {
    return { status: 'error', message: '云端存档读取失败，请检查网络' };
  }
  if (result && result.error) {
    return { status: 'error', message: messageOf(result.error, '云端存档读取失败') };
  }
  const rows = rowsOf(result);
  if (rows.length === 0) {
    rowId = null;
    rowVersion = null;
    rowUpdatedAt = '';
    return { status: 'empty', message: '云端暂无存档' };
  }
  track(rows[0]);
  return {
    status: 'ok',
    state: rows[0].payload,
    version: rowVersion,
    updatedAt: rowUpdatedAt,
    message: '',
  };
}

// 若内存里的 rowId 失效（冷启动、重新登录、行被重建），先查一次真实行。
async function resolveRow() {
  const found = await load();
  if (found.status === 'ok' || found.status === 'empty') return found;
  return found;
}

async function insertRow(state) {
  const result = await cloud.database.from(TABLE)
    .insert({ payload: state })
    .select(SELECT);
  if (result && result.error) return { error: result.error, rows: [] };
  return { error: null, rows: rowsOf(result) };
}

async function updateRow(state, expectedVersion) {
  let query = cloud.database.from(TABLE)
    .update({ payload: state })
    .eq('id', rowId);
  if (expectedVersion !== null && expectedVersion !== undefined) {
    query = query.eq('version', expectedVersion);
  }
  const result = await query.select(SELECT);
  if (result && result.error) return { error: result.error, rows: [] };
  return { error: null, rows: rowsOf(result) };
}

// 写：expectedVersion 为 null 时跳过乐观锁（用于首次建档 / 断线补写）。
// 返回 { ok, conflict, message, version, updatedAt }。
async function save(state, expectedVersion) {
  let signedIn;
  try {
    signedIn = await hasSession();
  } catch (e) {
    return { ok: false, conflict: false, message: '登录状态读取失败，请检查网络' };
  }
  if (!signedIn) return { ok: false, conflict: false, message: '未登录，进度未能保存到云端' };

  if (rowId === null || rowId === undefined) {
    const resolved = await resolveRow();
    if (resolved.status !== 'ok' && resolved.status !== 'empty') {
      return { ok: false, conflict: false, message: resolved.message };
    }
    if (resolved.status === 'ok') expectedVersion = resolved.version;
  }

  // 云端还没有这一行：插入。撞唯一约束说明并发创建了，重新对齐后再走更新。
  if (rowId === null || rowId === undefined) {
    const created = await insertRow(state);
    if (created.error) {
      if (created.error.code === '23505') {
        const retried = await resolveRow();
        if (retried.status === 'ok') return updateAndTrack(state, retried.version);
      }
      return { ok: false, conflict: false, message: messageOf(created.error, '云端存档创建失败') };
    }
    if (created.rows.length === 0) {
      return { ok: false, conflict: false, message: '云端存档创建失败，请重新登录' };
    }
    track(created.rows[0]);
    return { ok: true, conflict: false, message: '', version: rowVersion, updatedAt: rowUpdatedAt };
  }

  return updateAndTrack(state, expectedVersion);
}

async function updateAndTrack(state, expectedVersion) {
  let attempt = await updateRow(state, expectedVersion);
  if (attempt.error) {
    return { ok: false, conflict: false, message: messageOf(attempt.error, '云端存档保存失败') };
  }
  if (attempt.rows.length > 0) {
    track(attempt.rows[0]);
    return { ok: true, conflict: false, message: '', version: rowVersion, updatedAt: rowUpdatedAt };
  }
  // 0 行命中：要么版本被别的设备推进了，要么行被删了。再查一次区分。
  const current = await resolveRow();
  if (current.status === 'empty') {
    const created = await insertRow(state);
    if (created.error) return { ok: false, conflict: false, message: messageOf(created.error, '云端存档重建失败') };
    if (created.rows.length === 0) return { ok: false, conflict: false, message: '云端存档重建失败' };
    track(created.rows[0]);
    return { ok: true, conflict: false, message: '', version: rowVersion, updatedAt: rowUpdatedAt };
  }
  if (current.status === 'ok') {
    return {
      ok: false,
      conflict: true,
      message: '另一台设备更新了这份进度，请选保留哪一份',
      version: current.version,
      updatedAt: current.updatedAt,
    };
  }
  return { ok: false, conflict: false, message: current.message };
}

// 冲突时强制用本地覆盖：跳过版本条件再写一次。
async function forceOverwrite(state) {
  const result = await updateRow(state, null);
  if (result.error) return { ok: false, message: messageOf(result.error, '覆盖失败') };
  if (result.rows.length === 0) return { ok: false, message: '覆盖失败：找不到这份存档' };
  track(result.rows[0]);
  return { ok: true, message: '', version: rowVersion, updatedAt: rowUpdatedAt };
}

function resetRow() {
  rowId = null;
  rowVersion = null;
  rowUpdatedAt = '';
}

function getVersion() {
  return rowVersion;
}

function getUpdatedAt() {
  return rowUpdatedAt;
}

module.exports = {
  load: load,
  save: save,
  forceOverwrite: forceOverwrite,
  resetRow: resetRow,
  getVersion: getVersion,
  getUpdatedAt: getUpdatedAt,
};
