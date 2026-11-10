'use strict';

// 云端存档适配层：每个登录用户在 canwu_saves 里只有一行。
// owner_id 由数据库 DEFAULT auth.uid() 填充，前端不传；RLS 保证只能读写自己的那行。

const { cloud } = require('./cloud.js');
const { createTableAccess } = require('./workbuddy-data-access.js');

const saves = createTableAccess(cloud, {
  table: 'canwu_saves',
  columns: ['id', 'payload', 'updated_at'],
  orderBy: { column: 'updated_at', ascending: false },
  toRow: function (state) {
    return { payload: state, updated_at: new Date().toISOString() };
  },
});

let rowId = null;

function messageOf(error, fallback) {
  if (!error) return fallback;
  if (error.code === '42P01') return '云端存档表尚未创建';
  if (error.code === '42501') return '没有权限访问这份存档';
  if (error.code === 'NOT_FOUND_OR_FORBIDDEN') return '存档已被移除或无权修改，请重新登录';
  if (typeof error.message === 'string' && error.message) return error.message;
  return fallback;
}

// 读：先过认证门，未登录时不发起任何表查询。
async function load() {
  const session = await cloud.auth.getSession();
  if (session.error || !session.data) {
    rowId = null;
    return { status: 'signed-out', message: '请先登录' };
  }
  const result = await saves.list();
  if (result.error) {
    return { status: 'error', message: messageOf(result.error, '云端存档读取失败，请检查网络') };
  }
  const rows = result.data || [];
  if (rows.length === 0) {
    rowId = null;
    return { status: 'empty', message: '云端暂无存档' };
  }
  rowId = rows[0].id;
  return { status: 'ok', state: rows[0].payload, message: '' };
}

// 写：首次为该用户建一行，之后按 id 更新（避免无 WHERE 的更新）。
async function save(state) {
  const session = await cloud.auth.getSession();
  if (session.error || !session.data) {
    return { ok: false, message: '未登录，进度未能保存到云端' };
  }
  const result = rowId === null || rowId === undefined
    ? await saves.create(state)
    : await saves.update(rowId, state);
  if (result.error) {
    return { ok: false, message: messageOf(result.error, '云端存档保存失败') };
  }
  if (result.data && result.data.id !== undefined) rowId = result.data.id;
  return { ok: true, message: '' };
}

function resetRow() {
  rowId = null;
}

module.exports = {
  load: load,
  save: save,
  resetRow: resetRow,
};
