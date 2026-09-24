/**
 * db.js
 * better-sqlite3 数据库封装
 * UOS环境下如需重新编译原生模块，执行：
 *   npx electron-rebuild -f -w better-sqlite3
 *
 * 版本：v2
 * - todo 表新增：category_id / remind_at / remind_lead / repeat_rule / parent_id
 *                 deleted_at(软删除) / completed_at / updated_at
 * - 新增表：category / subtask / reminder_log
 * - 所有结构变更通过 migrate() 增量执行，保证旧库数据不丢失
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const repeatRule = require('./repeat_rule');

let db = null;
let dbPath = null;

// ============================================================
// 工具函数
// ============================================================

function nowISO() {
  return new Date().toISOString();
}

/**
 * 判断表中是否存在某列
 */
function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

/**
 * 字段白名单 -> SQL 排序表达式，杜绝 SQL 注入
 */
const SORT_COLUMNS = {
  create_at: 't.create_at',
  deadline: 't.deadline',
  priority: `(CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END)`,
  title: 't.title'
};

// ============================================================
// 初始化与迁移
// ============================================================

/**
 * 初始化数据库连接
 * @param {string} userDataPath - Electron userData 目录
 */
function initDatabase(userDataPath) {
  dbPath = path.join(userDataPath, 'todos.db');

  // 确保目录存在
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  // 启用WAL模式，提升并发性能
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate();

  console.log('[db] 数据库初始化完成:', dbPath);
  return db;
}

/**
 * 增量迁移：仅在列/表缺失时执行变更，并在变更前做一次备份
 */
function migrate() {
  let changed = false;

  // ---- 1. 建表（若不存在）----
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      completed INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      deadline TEXT,
      create_at TEXT NOT NULL,
      source_url TEXT DEFAULT '',
      source_page_title TEXT DEFAULT '',
      source_selected_text TEXT DEFAULT ''
    )
  `);

  const tableExists = (name) =>
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name) !== undefined;

  if (!tableExists('category')) {
    db.exec(`
      CREATE TABLE category (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        sort_order INTEGER DEFAULT 0,
        create_at TEXT NOT NULL
      )
    `);
    changed = true;
  }

  if (!tableExists('subtask')) {
    db.exec(`
      CREATE TABLE subtask (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        create_at TEXT NOT NULL
      )
    `);
    changed = true;
  }

  if (!tableExists('reminder_log')) {
    db.exec(`
      CREATE TABLE reminder_log (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        fire_at TEXT NOT NULL,
        create_at TEXT NOT NULL,
        UNIQUE(todo_id, fire_at)
      )
    `);
    changed = true;
  }

  // ---- 2. todo 表加列 ----
  const newColumns = [
    ['category_id', `TEXT DEFAULT ''`],
    ['remind_at', 'TEXT'],
    ['remind_lead', 'INTEGER'],
    ['repeat_rule', 'TEXT'],
    ['parent_id', 'TEXT'],
    ['deleted_at', 'TEXT'],
    ['completed_at', 'TEXT'],
    ['updated_at', 'TEXT']
  ];

  for (const [col, def] of newColumns) {
    if (!hasColumn('todo', col)) {
      db.exec(`ALTER TABLE todo ADD COLUMN ${col} ${def}`);
      changed = true;
    }
  }

  // ---- 3. 索引 ----
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_todo_completed ON todo(completed);
    CREATE INDEX IF NOT EXISTS idx_todo_deadline ON todo(deadline);
    CREATE INDEX IF NOT EXISTS idx_todo_create_at ON todo(create_at);
    CREATE INDEX IF NOT EXISTS idx_todo_category ON todo(category_id);
    CREATE INDEX IF NOT EXISTS idx_todo_deleted ON todo(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_todo_parent ON todo(parent_id);
    CREATE INDEX IF NOT EXISTS idx_subtask_todo ON subtask(todo_id);
  `);

  // ---- 4. 内置分类（仅当分类表为空）----
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM category').get().c;
  if (catCount === 0) {
    const preset = [
      ['工作', '#3b82f6'],
      ['生活', '#16a34a'],
      ['学习', '#eab308']
    ];
    const stmt = db.prepare(
      `INSERT INTO category (id, name, color, sort_order, create_at) VALUES (?, ?, ?, ?, ?)`
    );
    preset.forEach(([name, color], i) => {
      stmt.run(uuidv4(), name, color, i, nowISO());
    });
    console.log('[db] 已写入内置分类');
  }

  if (changed) {
    console.log('[db] 数据库结构已升级至 v2');
    backupDatabase();
  }
}

/**
 * 迁移前对数据库做一次备份（每天最多一份）
 */
function backupDatabase() {
  try {
    if (!dbPath || !fs.existsSync(dbPath)) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const bak = `${dbPath}.${stamp}.bak`;
    if (fs.existsSync(bak)) return;

    // WAL 模式下主库文件可能不含最新提交，直接 copyFileSync 会拿到不完整快照；
    // 先把 WAL 落盘（TRUNCATE）再复制
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('[db] WAL checkpoint 失败，备份可能不完整:', e.message);
    }

    fs.copyFileSync(dbPath, bak);
    console.log('[db] 已生成迁移备份:', bak);
  } catch (e) {
    console.warn('[db] 备份失败（不影响运行）:', e.message);
  }
}

/**
 * 获取数据库实例
 */
function getDb() {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase');
  }
  return db;
}

// ============================================================
// 待办 CRUD
// ============================================================

const TODO_SELECT = `
  SELECT t.*,
    (SELECT COUNT(*) FROM subtask s WHERE s.todo_id = t.id) AS subtask_total,
    (SELECT COUNT(*) FROM subtask s WHERE s.todo_id = t.id AND s.completed = 1) AS subtask_done
  FROM todo t
`;

/**
 * 新增一条待办
 */
function insertTodo(todo) {
  const insert = db.prepare(`
    INSERT INTO todo (
      id, title, description, completed, priority, deadline, create_at,
      source_url, source_page_title, source_selected_text,
      category_id, remind_at, remind_lead, repeat_rule, parent_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    todo.id,
    todo.title,
    todo.description || '',
    todo.completed ? 1 : 0,
    todo.priority || 'medium',
    todo.deadline || null,
    todo.create_at,
    todo.source_url || '',
    todo.source_page_title || '',
    todo.source_selected_text || '',
    todo.category_id || '',
    todo.remind_at || null,
    todo.remind_lead === undefined || todo.remind_lead === null ? null : todo.remind_lead,
    todo.repeat_rule || null,
    todo.parent_id || null,
    todo.updated_at || nowISO()
  );

  return getTodoById(todo.id);
}

/**
 * 根据ID查询待办
 */
function getTodoById(id) {
  return db.prepare(`${TODO_SELECT} WHERE t.id = ?`).get(id);
}

/**
 * 查询待办列表，支持搜索 / 分类 / 排序 / 软删除
 * @param {Object} options
 *  status: 'all' | 'pending' | 'completed'
 *  keyword: 关键词（匹配标题/描述/来源标题/来源文本）
 *  categoryId: '' 全部 | 'none' 未分类 | 具体 id
 *  view: 'all' | 'today' | 'overdue'
 *  sortBy: 'create_at' | 'deadline' | 'priority' | 'title'
 *  order: 'asc' | 'desc'
 *  includeDeleted: boolean（回收站列表用）
 */
function listTodos(options = {}) {
  const {
    status = 'all',
    keyword = '',
    categoryId = '',
    view = 'all',
    sortBy = 'create_at',
    order = 'desc',
    page = 1,
    pageSize = 500,
    includeDeleted = false
  } = options;

  const where = [];
  const params = [];

  // 软删除
  if (includeDeleted) {
    where.push('t.deleted_at IS NOT NULL');
  } else {
    where.push('t.deleted_at IS NULL');
  }

  if (status === 'pending') where.push('t.completed = 0');
  else if (status === 'completed') where.push('t.completed = 1');

  if (keyword && keyword.trim()) {
    where.push(`(
      t.title LIKE ? OR t.description LIKE ?
      OR t.source_page_title LIKE ? OR t.source_selected_text LIKE ?
    )`);
    const kw = `%${keyword.trim()}%`;
    params.push(kw, kw, kw, kw);
  }

  if (categoryId === 'none') {
    where.push(`(t.category_id IS NULL OR t.category_id = '')`);
  } else if (categoryId) {
    where.push('t.category_id = ?');
    params.push(categoryId);
  }

  if (view === 'today') {
    // 「今天」= 今天剩余待办（尚未过点），与「已逾期」互斥
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.push('t.completed = 0 AND t.deadline IS NOT NULL AND t.deadline >= ? AND t.deadline <= ?');
    params.push(nowISO(), end.toISOString());
  } else if (view === 'overdue') {
    where.push('t.completed = 0 AND t.deadline IS NOT NULL AND t.deadline < ?');
    params.push(nowISO());
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM todo t ${whereSql}`)
    .get(...params);

  const sortExpr = SORT_COLUMNS[sortBy] || SORT_COLUMNS.create_at;
  const dir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  // 仅按截止时间排序时，把「无截止时间」的待办统一排在最后（升降序都适用）
  const nullsLast = sortBy === 'deadline' ? '(t.deadline IS NULL) ASC, ' : '';

  const offset = (Number(page) - 1) * Number(pageSize);
  const list = db
    .prepare(
      `${TODO_SELECT} ${whereSql}
       ORDER BY ${nullsLast}${sortExpr} ${dir}
       LIMIT ? OFFSET ?`
    )
    .all(...params, Number(pageSize), offset);

  return { list, total, page: Number(page), pageSize: Number(pageSize) };
}

/**
 * 聚合计数：用于侧边栏与状态筛选条的角标
 * 只受 keyword / categoryId 影响，不受 status / view 影响
 * @returns {{ all, pending, completed, today, overdue, uncategorized }}
 */
function getCounts({ keyword = '', categoryId = '' } = {}) {
  const base = ['deleted_at IS NULL'];
  const params = [];

  if (keyword && keyword.trim()) {
    base.push(`(
      title LIKE ? OR description LIKE ?
      OR source_page_title LIKE ? OR source_selected_text LIKE ?
    )`);
    const kw = `%${keyword.trim()}%`;
    params.push(kw, kw, kw, kw);
  }

  if (categoryId === 'none') base.push(`(category_id IS NULL OR category_id = '')`);
  else if (categoryId) {
    base.push('category_id = ?');
    params.push(categoryId);
  }

  const where = base.join(' AND ');
  const now = nowISO();

  // 「今天」= 今天剩余待办（尚未过点），与「已逾期」互斥
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const row = db
    .prepare(`
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN completed = 0 AND deadline IS NOT NULL AND deadline >= ? AND deadline < ? THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN completed = 0 AND deadline IS NOT NULL AND deadline < ? THEN 1 ELSE 0 END) AS overdue
      FROM todo WHERE ${where}
    `)
    .get(now, todayEnd.toISOString(), now, ...params);

  const uncategorized = db
    .prepare(`
      SELECT COUNT(*) AS count FROM todo
      WHERE ${where} AND (category_id IS NULL OR category_id = '')
    `)
    .get(...params).count || 0;

  return {
    all: row.all_count || 0,
    pending: row.pending || 0,
    completed: row.completed || 0,
    today: row.today || 0,
    overdue: row.overdue || 0,
    uncategorized
  };
}

/**
 * 更新待办（字段白名单）
 */
const UPDATABLE_FIELDS = [
  'title',
  'description',
  'completed',
  'priority',
  'deadline',
  'category_id',
  'remind_at',
  'remind_lead',
  'repeat_rule',
  'parent_id',
  'deleted_at',
  'completed_at'
];

function updateTodo(id, updates) {
  const fields = [];
  const values = [];

  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] === undefined) continue;

    let value = updates[field];
    if (field === 'completed') value = value ? 1 : 0;
    else if (field === 'repeat_rule') value = value ? (typeof value === 'string' ? value : JSON.stringify(value)) : null;
    else if (field === 'deadline' || field === 'remind_at' || field === 'deleted_at' || field === 'completed_at') {
      value = value || null;
    } else if (field === 'remind_lead') {
      value = value === null || value === undefined || value === '' ? null : Number(value);
    }

    fields.push(`${field} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return getTodoById(id);

  fields.push('updated_at = ?');
  values.push(nowISO());
  values.push(id);

  db.prepare(`UPDATE todo SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getTodoById(id);
}

/**
 * 彻底删除待办（物理删除）
 */
function deleteTodo(id) {
  db.prepare('DELETE FROM subtask WHERE todo_id = ?').run(id);
  db.prepare('DELETE FROM reminder_log WHERE todo_id = ?').run(id);
  const info = db.prepare('DELETE FROM todo WHERE id = ?').run(id);
  return info.changes > 0;
}

/**
 * 物理批量删除
 */
function batchDeleteTodos(ids) {
  if (!ids || ids.length === 0) return 0;
  const ph = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM subtask WHERE todo_id IN (${ph})`).run(...ids);
  db.prepare(`DELETE FROM reminder_log WHERE todo_id IN (${ph})`).run(...ids);
  const info = db.prepare(`DELETE FROM todo WHERE id IN (${ph})`).run(...ids);
  return info.changes;
}

// ============================================================
// 软删除 / 回收站
// ============================================================

function softDeleteTodos(ids) {
  if (!ids || ids.length === 0) return 0;
  const ph = ids.map(() => '?').join(',');
  const info = db
    .prepare(`UPDATE todo SET deleted_at = ?, updated_at = ? WHERE id IN (${ph}) AND deleted_at IS NULL`)
    .run(nowISO(), nowISO(), ...ids);
  return info.changes;
}

function restoreTodos(ids) {
  if (!ids || ids.length === 0) return 0;
  const ph = ids.map(() => '?').join(',');
  const info = db
    .prepare(`UPDATE todo SET deleted_at = NULL, updated_at = ? WHERE id IN (${ph})`)
    .run(nowISO(), ...ids);
  return info.changes;
}

function listTrash() {
  return db
    .prepare(`${TODO_SELECT} WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC`)
    .all();
}

function purgeTrash() {
  const ids = db.prepare('SELECT id FROM todo WHERE deleted_at IS NOT NULL').all().map((r) => r.id);
  if (ids.length === 0) return 0;
  return batchDeleteTodos(ids);
}

// ============================================================
// 分类
// ============================================================

function listCategories() {
  return db
    .prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM todo t
          WHERE t.category_id = c.id AND t.deleted_at IS NULL) AS todo_count
      FROM category c
      ORDER BY c.sort_order ASC, c.create_at ASC
    `)
    .all();
}

function insertCategory({ name, color = '#3b82f6' }) {
  const id = uuidv4();
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM category').get().n;
  db.prepare(
    `INSERT INTO category (id, name, color, sort_order, create_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, color, order, nowISO());
  return db.prepare('SELECT * FROM category WHERE id = ?').get(id);
}

function updateCategory(id, { name, color }) {
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (fields.length === 0) return db.prepare('SELECT * FROM category WHERE id = ?').get(id);
  values.push(id);
  db.prepare(`UPDATE category SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM category WHERE id = ?').get(id);
}

/**
 * 删除分类：该分类下待办回落为未分类
 */
function deleteCategory(id) {
  const tx = db.transaction((catId) => {
    db.prepare(`UPDATE todo SET category_id = '', updated_at = ? WHERE category_id = ?`).run(nowISO(), catId);
    return db.prepare('DELETE FROM category WHERE id = ?').run(catId).changes;
  });
  return tx(id);
}

// ============================================================
// 子任务
// ============================================================

function listSubtasks(todoId) {
  return db
    .prepare('SELECT * FROM subtask WHERE todo_id = ? ORDER BY sort_order ASC, create_at ASC')
    .all(todoId);
}

function listSubtasksByTodoIds(todoIds) {
  if (!todoIds || todoIds.length === 0) return {};
  const ph = todoIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM subtask WHERE todo_id IN (${ph}) ORDER BY sort_order ASC, create_at ASC`)
    .all(...todoIds);
  const map = {};
  for (const id of todoIds) map[id] = [];
  for (const r of rows) map[r.todo_id].push(r);
  return map;
}

function insertSubtask({ todo_id, title, completed = 0, sort_order = 0 }) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO subtask (id, todo_id, title, completed, sort_order, create_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, todo_id, title, completed ? 1 : 0, sort_order, nowISO());
  return db.prepare('SELECT * FROM subtask WHERE id = ?').get(id);
}

function updateSubtask(id, { title, completed, sort_order }) {
  const fields = [];
  const values = [];
  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (completed !== undefined) { fields.push('completed = ?'); values.push(completed ? 1 : 0); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
  if (fields.length === 0) return db.prepare('SELECT * FROM subtask WHERE id = ?').get(id);
  values.push(id);
  db.prepare(`UPDATE subtask SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM subtask WHERE id = ?').get(id);
}

function deleteSubtask(id) {
  return db.prepare('DELETE FROM subtask WHERE id = ?').run(id).changes > 0;
}

/**
 * 全量替换某待办的子任务
 */
function replaceSubtasks(todoId, titles = []) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM subtask WHERE todo_id = ?').run(todoId);
    const stmt = db.prepare(
      `INSERT INTO subtask (id, todo_id, title, completed, sort_order, create_at) VALUES (?, ?, ?, ?, ?, ?)`
    );
    titles.forEach((t, i) => {
      stmt.run(uuidv4(), todoId, t.title || t, t.completed ? 1 : 0, i, nowISO());
    });
  });
  tx();
  return listSubtasks(todoId);
}

// ============================================================
// 提醒
// ============================================================

/**
 * 查询需要提醒的待办
 * @param {string} untilISO - 提醒时间 <= 该时间点的待办
 */
function listDueReminders(untilISO) {
  return db
    .prepare(`
      SELECT * FROM todo
      WHERE deleted_at IS NULL
        AND completed = 0
        AND remind_at IS NOT NULL
        AND remind_at <= ?
    `)
    .all(untilISO);
}

/**
 * 记录一次提醒，返回 false 表示本次已提醒过（去重）
 */
function markReminderFired(todoId, fireAt) {
  try {
    db.prepare(
      `INSERT INTO reminder_log (id, todo_id, fire_at, create_at) VALUES (?, ?, ?, ?)`
    ).run(uuidv4(), todoId, fireAt, nowISO());
    return true;
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return false;
    throw e;
  }
}

// ============================================================
// 重复待办
// ============================================================

/**
 * 计算下一次到期时间（算法统一在 repeat_rule.js，渲染层预览走同一实现）
 * @param {string} fromISO
 * @param {Object} rule - { type: 'none'|'daily'|'weekly'|'monthly', interval: number }
 */
function computeNextDate(fromISO, rule) {
  return repeatRule.computeNextDate(fromISO, rule);
}

/**
 * 完成一条重复待办：当前轮次归档完成，并生成下一轮
 */
function completeRecurringTodo(id) {
  const todo = getTodoById(id);
  if (!todo) return null;

  let rule = null;
  try {
    rule = todo.repeat_rule ? JSON.parse(todo.repeat_rule) : null;
  } catch {
    rule = null;
  }
  if (!rule || rule.type === 'none') return null;

  // anchorToNow：本轮已逾期时才以「当前时间」为基准滚动，
  // 否则逾期 5 天补勾会生成一条 4 天前到期的新待办（一入库就已逾期并立刻催办）
  const nextDeadline = computeNextDate(todo.deadline || nowISO(), rule, { anchorToNow: true });
  if (!nextDeadline) return null;

  // remind_lead = 0 表示「截止时提醒」，是合法值，不能用真值判断
  const lead = todo.remind_lead === null || todo.remind_lead === undefined || todo.remind_lead === ''
    ? null
    : Number(todo.remind_lead);

  let nextRemind = null;
  if (lead !== null && !isNaN(lead)) {
    nextRemind = new Date(new Date(nextDeadline).getTime() - lead * 60000).toISOString();
  }

  const nextId = uuidv4();
  const next = {
    id: nextId,
    title: todo.title,
    description: todo.description,
    completed: 0,
    priority: todo.priority,
    deadline: nextDeadline,
    create_at: nowISO(),
    source_url: todo.source_url,
    source_page_title: todo.source_page_title,
    source_selected_text: todo.source_selected_text,
    category_id: todo.category_id,
    remind_at: nextRemind,
    remind_lead: lead,
    repeat_rule: todo.repeat_rule,
    parent_id: todo.parent_id || todo.id
  };

  const tx = db.transaction(() => {
    insertTodo(next);
    // 复制子任务并重置完成状态
    const subs = listSubtasks(id);
    if (subs.length) {
      const stmt = db.prepare(
        `INSERT INTO subtask (id, todo_id, title, completed, sort_order, create_at) VALUES (?, ?, ?, 0, ?, ?)`
      );
      subs.forEach((s, i) => stmt.run(uuidv4(), nextId, s.title, s.sort_order ?? i, nowISO()));
    }
  });
  tx();

  return getTodoById(nextId);
}

/**
 * 判断待办是否为重复任务
 */
function isRecurring(todo) {
  if (!todo || !todo.repeat_rule) return false;
  try {
    const rule = JSON.parse(todo.repeat_rule);
    return rule && rule.type && rule.type !== 'none';
  } catch {
    return false;
  }
}

// ============================================================
// 统计
// ============================================================

function getStats() {
  const now = nowISO();

  const base = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN completed = 0 AND deadline IS NOT NULL AND deadline < ? THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS pending
      FROM todo WHERE deleted_at IS NULL
    `)
    .get(now);

  const total = base.total || 0;
  const completed = base.completed || 0;

  // 近 7 天：每天创建数 / 完成数
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.toISOString();
    const end = new Date(d.getTime() + 24 * 3600 * 1000).toISOString();
    const row = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM todo WHERE deleted_at IS NULL AND create_at >= ? AND create_at < ?) AS created,
          (SELECT COUNT(*) FROM todo WHERE deleted_at IS NULL AND completed = 1 AND completed_at >= ? AND completed_at < ?) AS done
      `)
      .get(start, end, start, end);
    days.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      created: row.created || 0,
      completed: row.done || 0
    });
  }

  const priorityRows = db
    .prepare(`
      SELECT COALESCE(priority, 'medium') AS priority, COUNT(*) AS count
      FROM todo WHERE deleted_at IS NULL GROUP BY priority
    `)
    .all();
  const priority = { high: 0, medium: 0, low: 0 };
  for (const r of priorityRows) {
    if (priority[r.priority] !== undefined) priority[r.priority] = r.count;
  }

  const categories = db
    .prepare(`
      SELECT c.id, c.name, c.color, COUNT(t.id) AS count
      FROM category c LEFT JOIN todo t
        ON t.category_id = c.id AND t.deleted_at IS NULL
      GROUP BY c.id ORDER BY c.sort_order ASC
    `)
    .all();

  const uncategorized = db
    .prepare(`
      SELECT COUNT(*) AS count FROM todo
      WHERE deleted_at IS NULL AND (category_id IS NULL OR category_id = '')
    `)
    .get().count || 0;

  return {
    total,
    completed,
    pending: base.pending || 0,
    overdue: base.overdue || 0,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    trend: days,
    priority,
    categories,
    uncategorized
  };
}

// ============================================================
// 导入导出
// ============================================================

function exportAll() {
  const todos = db.prepare('SELECT * FROM todo WHERE deleted_at IS NULL ORDER BY create_at DESC').all();
  const categories = db.prepare('SELECT * FROM category ORDER BY sort_order ASC').all();
  const todoIds = todos.map((t) => t.id);
  const subtaskMap = listSubtasksByTodoIds(todoIds);
  const todosWithSubs = todos.map((t) => ({ ...t, subtasks: subtaskMap[t.id] || [] }));

  return {
    app: 'TodoPulse',
    version: 2,
    exported_at: nowISO(),
    categories,
    todos: todosWithSubs
  };
}

/**
 * 导入数据
 * @param {Object} payload - exportAll() 的结构
 * @param {string} mode - 'merge' 追加 | 'replace' 清空后写入
 */
function importAll(payload, mode = 'merge') {
  if (!payload || !Array.isArray(payload.todos)) {
    throw new Error('导入文件格式不正确：缺少 todos 数组');
  }

  const tx = db.transaction(() => {
    if (mode === 'replace') {
      db.prepare('DELETE FROM subtask').run();
      db.prepare('DELETE FROM reminder_log').run();
      db.prepare('DELETE FROM todo').run();
      db.prepare('DELETE FROM category').run();
    }

    // 分类：按名称复用已存在的
    const catIdMap = {};
    const findCat = db.prepare('SELECT id FROM category WHERE name = ?');
    const insertCat = db.prepare(
      `INSERT INTO category (id, name, color, sort_order, create_at) VALUES (?, ?, ?, ?, ?)`
    );
    for (const c of payload.categories || []) {
      const exist = findCat.get(c.name);
      if (exist) {
        catIdMap[c.id] = exist.id;
      } else {
        const newId = c.id || uuidv4();
        const dup = db.prepare('SELECT id FROM category WHERE id = ?').get(newId);
        const finalId = dup ? uuidv4() : newId;
        insertCat.run(finalId, c.name, c.color || '#3b82f6', c.sort_order || 0, c.create_at || nowISO());
        catIdMap[c.id] = finalId;
      }
    }

    const insertT = db.prepare(`
      INSERT OR REPLACE INTO todo (
        id, title, description, completed, priority, deadline, create_at,
        source_url, source_page_title, source_selected_text,
        category_id, remind_at, remind_lead, repeat_rule, parent_id,
        deleted_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // 使用 OR REPLACE，保证 merge 模式下重复导入同一备份不会主键冲突
    const insertS = db.prepare(
      `INSERT OR REPLACE INTO subtask (id, todo_id, title, completed, sort_order, create_at) VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const t of payload.todos) {
      const todoId = t.id || uuidv4();
      insertT.run(
        todoId,
        t.title || '未命名待办',
        t.description || '',
        t.completed ? 1 : 0,
        t.priority || 'medium',
        t.deadline || null,
        t.create_at || nowISO(),
        t.source_url || '',
        t.source_page_title || '',
        t.source_selected_text || '',
        catIdMap[t.category_id] || t.category_id || '',
        t.remind_at || null,
        t.remind_lead ?? null,
        t.repeat_rule || null,
        t.parent_id || null,
        t.deleted_at || null,
        // 已完成但缺 completed_at（旧备份 / 迁移前数据）：回落 create_at，
        // 否则这些记录永远不进「近 7 天完成」趋势统计
        t.completed_at || (t.completed ? (t.create_at || nowISO()) : null),
        t.updated_at || nowISO()
      );

      for (const s of t.subtasks || []) {
        insertS.run(
          s.id || uuidv4(),
          todoId,
          s.title,
          s.completed ? 1 : 0,
          s.sort_order || 0,
          s.create_at || nowISO()
        );
      }
    }
  });

  tx();
  return { imported: payload.todos.length };
}

/**
 * 导出为 CSV 字符串
 */
function exportCsv() {
  const rows = db
    .prepare('SELECT * FROM todo WHERE deleted_at IS NULL ORDER BY create_at DESC')
    .all();

  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    '标题', '描述', '状态', '优先级', '截止时间', '创建时间', '来源网址', '分类ID'
  ];
  const lines = [header.join(',')];
  for (const t of rows) {
    lines.push(
      [
        escape(t.title),
        escape(t.description),
        t.completed ? '已完成' : '未完成',
        // 全部字段统一走 escape：priority 等字段一旦含逗号/引号会破坏 CSV 结构
        escape(t.priority || ''),
        escape(t.deadline || ''),
        escape(t.create_at || ''),
        escape(t.source_url),
        escape(t.category_id || '')
      ].join(',')
    );
  }
  // BOM 头，保证 Excel 中文不乱码
  return '\uFEFF' + lines.join('\n');
}

// ============================================================
// 关闭
// ============================================================

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[db] 数据库已关闭');
  }
}

/**
 * 到期看板：一次性查询后分「已逾期 / 今天 / 本周」三段，保证互斥不重复
 * 时间边界：
 *   - 逾期：deadline < now
 *   - 今天：now ≤ deadline ≤ 今日 23:59:59.999
 *   - 本周：今日终点 < deadline ≤ 本周日 23:59:59（自然周，周一首日）
 * @returns {{ overdue: Array, today: Array, week: Array, rangeEnd: string, updatedAt: string }}
 */
function getDueBoard(options) {
  const MAX_PER_SECTION = 50;
  // 是否把已完成事项也纳入看板（默认关闭，由设置页「悬浮窗 → 显示已完成」控制）
  const includeCompleted = !!(options && options.includeCompleted);

  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // 本周一 00:00:00（getDay: 0=周日 → 偏移 6；1=周一 → 偏移 0；...）
  const weekStart = new Date(now);
  const offset = (now.getDay() + 6) % 7;
  weekStart.setDate(now.getDate() - offset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // 三段各自单独查询并各自 LIMIT：
  // 早期实现是先全局取 150 条再内存分段，逾期项排在最前会把今天/本周的条目挤出结果集
  const completedClause = includeCompleted ? '' : 'AND t.completed = 0';
  const baseWhere = `WHERE t.deleted_at IS NULL ${completedClause} AND t.deadline IS NOT NULL`;

  const stmt = (from, to) =>
    db
      .prepare(
        `${TODO_SELECT}
         ${baseWhere} AND t.deadline ${from ? '> ?' : 'IS NOT NULL'} AND t.deadline <= ?
         ORDER BY t.deadline ASC
         LIMIT ?`
      )
      .all(...(from ? [from, to, MAX_PER_SECTION] : [to, MAX_PER_SECTION]));

  const overdue = stmt(null, now.toISOString());
  const today = stmt(now.toISOString(), todayEnd.toISOString());
  const week = stmt(todayEnd.toISOString(), weekEnd.toISOString());

  return {
    overdue,
    today,
    week,
    rangeEnd: weekEnd.toISOString(),
    updatedAt: now.toISOString()
  };
}

module.exports = {
  initDatabase,
  getDb,
  // todo
  insertTodo,
  getTodoById,
  listTodos,
  getCounts,
  updateTodo,
  deleteTodo,
  batchDeleteTodos,
  // 回收站
  softDeleteTodos,
  restoreTodos,
  listTrash,
  purgeTrash,
  // 分类
  listCategories,
  insertCategory,
  updateCategory,
  deleteCategory,
  // 子任务
  listSubtasks,
  listSubtasksByTodoIds,
  insertSubtask,
  updateSubtask,
  deleteSubtask,
  replaceSubtasks,
  // 提醒
  listDueReminders,
  markReminderFired,
  // 重复
  computeNextDate,
  completeRecurringTodo,
  isRecurring,
  // 统计与导入导出
  getStats,
  exportAll,
  importAll,
  exportCsv,
  // 清空全部数据（保留 category 分类）
  clearAllData,
  // 到期看板（悬浮窗）
  getDueBoard,
  closeDatabase
};

/**
 * 清空全部待办数据（危险操作）
 * 仅删除 todo / subtask / reminder_log，保留 category 分类定义
 * 在事务中执行，保证原子性
 */
function clearAllData() {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM reminder_log').run();
    db.prepare('DELETE FROM subtask').run();
    db.prepare('DELETE FROM todo').run();
  });
  tx();
  console.log('[db] 已清空全部待办数据（保留分类）');
}
