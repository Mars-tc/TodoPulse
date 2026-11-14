/**
 * tests/db_sql.test.cjs
 * 数据层 SQL 契约测试（纯逻辑，不依赖 better-sqlite3 原生模块）
 *
 * better-sqlite3 是针对 Electron ABI 编译的，无法在 node 环境加载；
 * 但 SQL 本身的列数 / 占位符 / 迁移语句最容易出错，这里用 node:sqlite
 * 直接执行 db.js 源码中抽取出的真实 SQL 语句做契约校验。
 *
 * node:sqlite 不可用时自动跳过（不影响其他套件）。
 * 运行：npm test
 */
const fs = require('fs');
const path = require('path');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  DatabaseSync = null;
}

if (!DatabaseSync) {
  console.log('SKIP 当前 node 不支持 node:sqlite，跳过数据层 SQL 契约测试');
  process.exit(0);
}

const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'src-main', 'db.js'), 'utf8');

let failed = 0;
function check(name, actual, expect) {
  const ok = String(actual) === String(expect);
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' => ' + actual + (ok ? '' : ' (期望 ' + expect + ')'));
}

/** 从 db.js 源码中抽取 SQL 片段 */
function grab(re) {
  const m = dbSrc.match(re);
  return m ? m[1] : null;
}

/** 抽取带列清单 + 占位符两段的 INSERT 语句 */
function grabInsert(re) {
  const m = dbSrc.match(re);
  return m ? [m[1], m[2]] : null;
}

const todoInsert = grabInsert(/INSERT INTO todo \(([\s\S]*?)\) VALUES \(([^)]*)\)/);
const todoImport = grabInsert(/INSERT OR REPLACE INTO todo \(([\s\S]*?)\) VALUES \(([^)]*)\)/);
const tplInsert = grabInsert(/INSERT INTO template \(([\s\S]*?)\) VALUES \(([^)]*)\)/);
const tplItemInsert = grabInsert(/INSERT INTO template_item \(([\s\S]*?)\) VALUES \(([^)]*)\)/);
const subInsert = grabInsert(/INSERT INTO subtask \(([\s\S]*?)\) VALUES \(([^)]*)\)/);
const tplCreate = grab(/CREATE TABLE template \(([\s\S]*?)\n      \)/);
const tplItemCreate = grab(/CREATE TABLE template_item \(([\s\S]*?)\n      \)/);
const newCols = grab(/const newColumns = \[([\s\S]*?)\];/);

check('抽取到 todo INSERT', todoInsert ? 'yes' : 'no', 'yes');
check('抽取到 todo 导入 INSERT', todoImport ? 'yes' : 'no', 'yes');
check('抽取到 template INSERT', tplInsert ? 'yes' : 'no', 'yes');
check('抽取到 template_item INSERT', tplItemInsert ? 'yes' : 'no', 'yes');
check('抽取到 subtask INSERT', subInsert ? 'yes' : 'no', 'yes');
check('抽取到 template 建表', tplCreate ? 'yes' : 'no', 'yes');
check('抽取到 template_item 建表', tplItemCreate ? 'yes' : 'no', 'yes');
check('抽取到 newColumns', newCols ? 'yes' : 'no', 'yes');

const countCols = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).length;
const countPh = (s) => (s.match(/\?/g) || []).length;

check('todo INSERT 列数 = 21', countCols(todoInsert[0]), 21);
check('todo INSERT 占位符 = 21', countPh(todoInsert[1]), 21);
check('todo 导入 INSERT 列数 = 23', countCols(todoImport[0]), 23);
check('todo 导入 INSERT 占位符 = 23', countPh(todoImport[1]), 23);
check('template INSERT 列数 = 18', countCols(tplInsert[0]), 18);
check('template INSERT 占位符 = 18', countPh(tplInsert[1]), 18);
check('template_item INSERT 列数 = 6', countCols(tplItemInsert[0]), 6);
check('template_item INSERT 占位符 = 6', countPh(tplItemInsert[1]), 6);
check('subtask INSERT 列数 = 6', countCols(subInsert[0]), 6);
check('subtask INSERT 占位符 = 6', countPh(subInsert[1]), 6);

const db = new DatabaseSync(':memory:');

// ---- 旧库结构（v1：仅最初 10 列）----
db.exec(`
  CREATE TABLE todo (
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

// ---- 迁移：按 newColumns 逐列 ALTER ----
const cols = [];
const colRe = /\[\s*'([a-z_]+)'\s*,\s*(`[^`]*`|'[^']*')\s*\]/g;
let cm = colRe.exec(newCols);
while (cm) {
  let def = cm[2];
  if (def.charAt(0) === '`' || def.charAt(0) === "'") def = def.slice(1, -1);
  cols.push([cm[1], def]);
  cm = colRe.exec(newCols);
}
check('newColumns 解析出 13 列', cols.length, 13);
check('含 quadrant 列', cols.some((c) => c[0] === 'quadrant') ? 'yes' : 'no', 'yes');
check('含 estimate_minutes 列', cols.some((c) => c[0] === 'estimate_minutes') ? 'yes' : 'no', 'yes');

for (const [name, def] of cols) {
  db.exec(`ALTER TABLE todo ADD COLUMN ${name} ${def}`);
}
db.exec(`CREATE TABLE template (${tplCreate})`);
db.exec(`CREATE TABLE template_item (${tplItemCreate})`);
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

const info = db.prepare('PRAGMA table_info(todo)').all();
check('迁移后 todo 共有 23 列', info.length, 23);
check('迁移后含 quadrant', info.some((c) => c.name === 'quadrant') ? 'yes' : 'no', 'yes');
check('迁移后含 energy_level', info.some((c) => c.name === 'energy_level') ? 'yes' : 'no', 'yes');
check('迁移后含 planned_at', info.some((c) => c.name === 'planned_at') ? 'yes' : 'no', 'yes');
check('迁移后含 planned_order', info.some((c) => c.name === 'planned_order') ? 'yes' : 'no', 'yes');
check('迁移后含 estimate_minutes', info.some((c) => c.name === 'estimate_minutes') ? 'yes' : 'no', 'yes');
check('template 表建表成功', db.prepare('PRAGMA table_info(template)').all().length, 18);
check('template_item 表建表成功', db.prepare('PRAGMA table_info(template_item)').all().length, 6);

// ---- 新增待办（21 列 INSERT）----
const insTodo = db.prepare(`INSERT INTO todo (${todoInsert[0]}) VALUES (${todoInsert[1]})`);
insTodo.run(
  't1', '示例待办', '描述', 0, 'high', null, '2026-01-01T00:00:00.000Z',
  '', '', '', 'cat-1', null, 30, null, null, '2026-01-01T00:00:00.000Z',
  'Q1', 'high', null, 1, 45
);
const row = db.prepare('SELECT * FROM todo WHERE id = ?').get('t1');
check('todo 写入成功', row.title, '示例待办');
check('quadrant 已落库', row.quadrant, 'Q1');
check('energy_level 已落库', row.energy_level, 'high');
check('estimate_minutes 已落库', row.estimate_minutes, 45);
check('planned_order 已落库', row.planned_order, 1);

// ---- 模板写入 ----
const insTpl = db.prepare(`INSERT INTO template (${tplInsert[0]}) VALUES (${tplInsert[1]})`);
insTpl.run(
  'tp1', '晨间例行', '描述', '📋', '#3b82f6', 'cat-1', 'medium', 15, null,
  'high', 'Q2', 1, 'preset', 1, 0, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
);
const insTplItem = db.prepare(`INSERT INTO template_item (${tplItemInsert[0]}) VALUES (${tplItemInsert[1]})`);
insTplItem.run('ti1', 'tp1', '喝水', 'task', 0, '2026-01-01T00:00:00.000Z');
check('模板写入成功', db.prepare('SELECT COUNT(*) c FROM template').get().c, 1);
check('模板条目写入成功', db.prepare('SELECT COUNT(*) c FROM template_item').get().c, 1);
check('模板条目 kind 正确', db.prepare('SELECT kind FROM template_item').get().kind, 'task');

// ---- 导入（23 列 INSERT）----
const insImport = db.prepare(`INSERT OR REPLACE INTO todo (${todoImport[0]}) VALUES (${todoImport[1]})`);
insImport.run(
  't2', '导入待办', '描述', 0, 'medium', null, '2026-01-01T00:00:00.000Z',
  '', '', '', '', null, null, null, null, null, null, '2026-01-01T00:00:00.000Z',
  'Q3', 'medium', null, null, null
);
const imported = db.prepare('SELECT * FROM todo WHERE id = ?').get('t2');
check('导入待办成功', imported.title, '导入待办');
check('导入保留象限', imported.quadrant, 'Q3');
check('导入保留精力档位', imported.energy_level, 'medium');

// ---- 子任务写入 ----
const insSub = db.prepare(`INSERT INTO subtask (${subInsert[0]}) VALUES (${subInsert[1]})`);
insSub.run('s1', 't1', '准备材料', 0, 0, '2026-01-01T00:00:00.000Z');
check('子任务写入成功', db.prepare('SELECT COUNT(*) c FROM subtask').get().c, 1);

// ---- 批量更新象限 / 批量顺延 ----
db.prepare('UPDATE todo SET quadrant = ?, updated_at = ? WHERE id IN (?) AND deleted_at IS NULL').run('Q4', '2026-01-02T00:00:00.000Z', 't1');
check('批量改象限生效', db.prepare('SELECT quadrant FROM todo WHERE id = ?').get('t1').quadrant, 'Q4');
db.prepare('UPDATE todo SET deadline = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run('2026-02-01T10:00:00.000Z', '2026-01-02T00:00:00.000Z', 't2');
check('批量顺延生效', db.prepare('SELECT deadline FROM todo WHERE id = ?').get('t2').deadline, '2026-02-01T10:00:00.000Z');

// ---- 导出查询（含新列）----
const exported = db.prepare('SELECT * FROM todo WHERE deleted_at IS NULL ORDER BY create_at DESC').all();
check('导出查询返回 2 条', exported.length, 2);
check('导出结果含 quadrant 字段', exported[0].quadrant !== undefined ? 'yes' : 'no', 'yes');

console.log(failed === 0 ? '\nALL PASS' : '\nFAILED: ' + failed);
process.exit(failed === 0 ? 0 : 1);


