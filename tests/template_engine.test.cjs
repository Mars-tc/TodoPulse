/**
 * tests/template_engine.test.cjs
 * 模板展开算法测试（纯逻辑，不依赖 better-sqlite3 原生模块）
 * 运行：npm test
 */
const engine = require('../src-main/template_engine.js');

const {
  toDateKey,
  parseDateKey,
  addDays,
  renderText,
  resolveRelativeDeadline,
  normalizeTemplate,
  expandTemplate,
  expandPreset
} = engine;

let failed = 0;
function check(name, actual, expect) {
  const ok = String(actual) === String(expect);
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' => ' + actual + (ok ? '' : ' (期望 ' + expect + ')'));
}

// ---- 日期键 ----
check('toDateKey', toDateKey(new Date(2026, 0, 5)), '2026-01-05');
check('parseDateKey 往返', toDateKey(parseDateKey('2026-01-05')), '2026-01-05');
check('parseDateKey 溢出非法', parseDateKey('2026-02-31'), 'null');
check('parseDateKey 非法字符串', parseDateKey('not-a-date'), 'null');

// ---- 跨月 / 跨年 / 闰年 ----
check('addDays 跨月', toDateKey(addDays(parseDateKey('2026-01-31'), 1)), '2026-02-01');
check('addDays 跨年', toDateKey(addDays(parseDateKey('2026-12-31'), 1)), '2027-01-01');
check('addDays 闰年 2/28+1', toDateKey(addDays(parseDateKey('2024-02-28'), 1)), '2024-02-29');
check('addDays 负偏移', toDateKey(addDays(parseDateKey('2026-03-01'), -1)), '2026-02-28');

// ---- 相对截止日 ----
check('偏移 0 = 当天', resolveRelativeDeadline(0, '2026-01-31').dateKey, '2026-01-31');
check('偏移 +1 跨月', resolveRelativeDeadline(1, '2026-01-31').dateKey, '2026-02-01');
check('偏移 +365 跨年', resolveRelativeDeadline(365, '2026-01-01').dateKey, '2027-01-01');
check('偏移非法回落 0', resolveRelativeDeadline('abc', '2026-01-31').dateKey, '2026-01-31');
check('截止时间为 ISO', typeof resolveRelativeDeadline(0, '2026-01-31').iso, 'string');

// ---- 占位符 ----
const ctx = { date: '2026-01-31', today: '2026-01-31', tomorrow: '2026-02-01', weekday: '星期六', category: '工作' };
check('占位符 {date}', renderText('{date} 例会', ctx), '2026-01-31 例会');
check('占位符 {tomorrow}', renderText('{tomorrow} 交周报', ctx), '2026-02-01 交周报');
check('占位符 {weekday}', renderText('{weekday} 值周', ctx), '星期六 值周');
check('占位符 {category}', renderText('{category} 跟进', ctx), '工作 跟进');
check('未知占位符原样保留', renderText('{unknown} 保持', ctx), '{unknown} 保持');
check('多占位符混排', renderText('{date} {category} {weekday}', ctx), '2026-01-31 工作 星期六');

// ---- 归一化 ----
const normalized = normalizeTemplate({ priority: 'urgent', energy_level: 'x', quadrant: 'Q9', expand_mode: 'weird' });
check('非法优先级回落', normalized.priority, 'medium');
check('非法精力回落', normalized.energy_level, 'medium');
check('非法象限清空', normalized.quadrant, '');
check('非法展开模式回落', normalized.expand_mode, 'single');
check('空模板名保持为空（由展开环节告警）', normalizeTemplate({}).name, '');

// ---- 单条模板展开 ----
const single = expandTemplate(
  {
    id: 't1',
    name: '{date} 晨会',
    description: '{category} 例行',
    priority: 'high',
    category_id: 'cat-1',
    remind_lead: 30,
    deadline_offset_days: 1,
    energy_level: 'high',
    quadrant: 'Q1',
    items: [
      { title: '准备材料', sort_order: 0 },
      { title: '同步进度', sort_order: 1 }
    ]
  },
  {
    targetDate: '2026-01-31',
    now: new Date(2026, 0, 31, 8, 0),
    categoryName: '工作',
    idFactory: (i) => 'gen-' + i
  }
);
check('single 展开 1 条', single.todos.length, 1);
check('single 标题替换', single.todos[0].title, '2026-01-31 晨会');
check('single 描述替换', single.todos[0].description, '工作 例行');
check('single 子任务 2 条', single.todos[0].subtasks.length, 2);
check('single 子任务标题', single.todos[0].subtasks[0].title, '准备材料');
check('single 优先级透传', single.todos[0].priority, 'high');
check('single 分类透传', single.todos[0].category_id, 'cat-1');
check('single 象限透传', single.todos[0].quadrant, 'Q1');
check('single 精力透传', single.todos[0].energy_level, 'high');
check('single 截止日为 +1', toDateKey(new Date(single.todos[0].deadline)), '2026-02-01');
check('single 提醒早于截止', new Date(single.todos[0].remind_at) < new Date(single.todos[0].deadline), true);
check('single id 由调用方注入', single.todos[0].id, 'gen-0');

// ---- 清单预设展开 ----
const preset = expandTemplate(
  {
    id: 't2',
    name: '晨间例行',
    expand_mode: 'preset',
    priority: 'medium',
    items: [
      { title: '喝水', kind: 'task' },
      { title: '拉伸', kind: 'task' },
      { title: '忽略我', kind: 'subtask' }
    ]
  },
  { targetDate: '2026-01-31', idFactory: (i) => 'p-' + i }
);
check('preset 展开 2 条（subtask 不参与）', preset.todos.length, 2);
check('preset 第 1 条标题', preset.todos[0].title, '喝水');
check('preset 第 2 条标题', preset.todos[1].title, '拉伸');
check('preset 不产生子任务', preset.todos[0].subtasks.length, 0);

// ---- 空条目 ----
const empty = expandTemplate({ id: 't3', name: '', items: [] }, { idFactory: (i) => 'e-' + i });
check('空标题展开 0 条', empty.todos.length, 0);
check('空标题给出警告', empty.warnings.length > 0, true);

// ---- 多模板批量 ----
const batch = expandPreset(
  [
    { id: 'a', name: 'A', items: [{ title: 'A1', kind: 'task' }, { title: 'A2', kind: 'task' }] },
    { id: 'b', name: 'B', items: [{ title: 'B1', kind: 'task' }] }
  ],
  { targetDate: '2026-01-31', idFactory: (i) => 'b-' + i }
);
check('批量展开 3 条', batch.todos.length, 3);
check('批量 id 连续', batch.todos.map((t) => t.id).join(','), 'b-0,b-1,b-2');

// ---- 分类名映射 ----
const mapped = expandTemplate(
  { id: 't4', name: 'X', category_id: '工作' },
  { targetDate: '2026-01-31', categoryIdMap: { 工作: 'cat-9' }, categoryName: '工作', idFactory: () => 'm-0' }
);
check('分类名映射为 id', mapped.todos[0].category_id, 'cat-9');

console.log(failed === 0 ? '\nALL PASS' : '\nFAILED: ' + failed);
process.exit(failed === 0 ? 0 : 1);
