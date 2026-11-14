/**
 * template_engine.js
 * 模板展开纯算法：把「任务模板 / 清单预设」展开为可入库的待办数据
 *
 * 设计约束（遵循项目约定 MEMORY.md）：
 * - 零原生依赖、零 Electron 依赖、零 IO，可在 node 环境下直接 require 并被测试覆盖
 * - 共享算法单一来源：主进程与渲染层共用本模块，界面层不复制实现
 * - 不生成 id：id 由调用方通过 options.idFactory 注入，避免 id 来源分裂
 */

const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const PLACEHOLDER_RE = /\{(\w+)\}/g;

const PRIORITIES = ['high', 'medium', 'low'];
const QUADRANT_KEYS = ['Q1', 'Q2', 'Q3', 'Q4'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 归一化为本地时区的日期键 YYYY-MM-DD
 */
function toDateKey(date) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 解析 YYYY-MM-DD 为本地零点 Date；非法输入返回 null
 */
function parseDateKey(key) {
  if (typeof key !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  // 反查校验：排除 2026-02-31 这类溢出日期
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * 按天加减（本地时区，自动处理跨月 / 跨年 / 闰年）
 */
function addDays(date, days) {
  const base = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + (Number(days) || 0));
  return d;
}

/**
 * 计算模板的相对截止日
 * @param {number} offsetDays - 相对目标日期的偏移天数，0 表示当天
 * @param {string} baseDateKey - 基准日期键 YYYY-MM-DD
 * @param {Object} [options] - { time: 'HH:mm' } 默认 18:00
 * @returns {{ dateKey: string, iso: string }}
 */
function resolveRelativeDeadline(offsetDays, baseDateKey, options = {}) {
  const base = parseDateKey(baseDateKey) || new Date();
  const offset = Number.isFinite(Number(offsetDays)) ? Math.trunc(Number(offsetDays)) : 0;
  const target = addDays(base, offset);

  const time = typeof options.time === 'string' && options.time ? options.time : '18:00';
  const [rawH, rawM] = time.split(':');
  const hh = Math.max(0, Math.min(23, Number(rawH) || 0));
  const mm = Math.max(0, Math.min(59, Number(rawM) || 0));
  const at = new Date(target.getFullYear(), target.getMonth(), target.getDate(), hh, mm, 0, 0);

  return { dateKey: toDateKey(target), iso: at.toISOString() };
}

/**
 * 文本占位符替换：{date} {today} {tomorrow} {weekday} {category}
 * 上下文里不存在的占位符原样保留，避免用户误以为标题被吞掉
 */
function renderText(text, context = {}) {
  if (typeof text !== 'string' || !text) return '';
  return text.replace(PLACEHOLDER_RE, (match, key) => {
    const value = context[key];
    return value === undefined || value === null || value === '' ? match : String(value);
  });
}

/**
 * 归一化模板结构（补齐缺省、裁掉非法枚举值）
 */
function normalizeTemplate(template) {
  const t = template && typeof template === 'object' ? template : {};
  const rawItems = Array.isArray(t.items) ? t.items : [];

  return {
    id: t.id || '',
    // 注意：名称不做兜底，空名称由展开环节识别并给出警告（而非静默生成「未命名模板」待办）
    name: typeof t.name === 'string' ? t.name : '',
    description: t.description || '',
    icon: t.icon || '📋',
    color: t.color || '#3b82f6',
    category_id: t.category_id || '',
    category_name: t.category_name || '',
    priority: PRIORITIES.indexOf(t.priority) >= 0 ? t.priority : 'medium',
    remind_lead:
      t.remind_lead === null || t.remind_lead === undefined || t.remind_lead === '' ? null : Number(t.remind_lead),
    repeat_rule: t.repeat_rule || null,
    energy_level: PRIORITIES.indexOf(t.energy_level) >= 0 ? t.energy_level : 'medium',
    quadrant: QUADRANT_KEYS.indexOf(t.quadrant) >= 0 ? t.quadrant : '',
    deadline_offset_days: Number.isFinite(Number(t.deadline_offset_days))
      ? Math.trunc(Number(t.deadline_offset_days))
      : 0,
    expand_mode: t.expand_mode === 'preset' ? 'preset' : 'single',
    enabled: t.enabled === undefined || t.enabled === null ? 1 : t.enabled ? 1 : 0,
    items: rawItems.map((it, index) => {
      const item = it && typeof it === 'object' ? it : {};
      return {
        id: item.id || '',
        title: item.title || '',
        kind: item.kind === 'task' ? 'task' : 'subtask',
        sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index
      };
    })
  };
}

/**
 * 构造占位符上下文
 */
function buildContext(tpl, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const baseKey = options.targetDate || toDateKey(now);
  const base = parseDateKey(baseKey) || now;
  const tomorrow = addDays(base, 1);

  return {
    date: toDateKey(base),
    today: toDateKey(base),
    tomorrow: toDateKey(tomorrow),
    weekday: WEEKDAY_CN[base.getDay()],
    category: options.categoryName || tpl.category_name || ''
  };
}

/**
 * 单条待办的公共构造
 */
function buildTodo(tpl, titleSource, context, options, index, warnings) {
  const title = renderText(titleSource, context);
  if (!title) {
    warnings.push('模板存在空标题，已跳过该条目');
    return null;
  }

  const deadlineInfo = resolveRelativeDeadline(tpl.deadline_offset_days, context.date, {
    time: options.deadlineTime
  });

  let remind_at = null;
  if (tpl.remind_lead !== null && deadlineInfo.iso) {
    const at = new Date(deadlineInfo.iso).getTime() - tpl.remind_lead * 60000;
    remind_at = new Date(at).toISOString();
  }

  const map = options.categoryIdMap || {};
  const rawCategory = tpl.category_id || '';
  const category_id = map[rawCategory] ? map[rawCategory] : rawCategory;

  const nowMs = options.now instanceof Date ? options.now : new Date();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : null;

  return {
    id: idFactory ? idFactory(index) : `${tpl.id || 'tpl'}_${index}`,
    title,
    description: renderText(tpl.description, context),
    completed: 0,
    priority: tpl.priority,
    deadline: deadlineInfo.iso,
    create_at: nowMs.toISOString(),
    source_url: '',
    source_page_title: '',
    source_selected_text: '',
    category_id,
    remind_at,
    remind_lead: tpl.remind_lead,
    repeat_rule: tpl.repeat_rule,
    parent_id: null,
    energy_level: tpl.energy_level,
    quadrant: tpl.quadrant,
    subtasks: []
  };
}

/**
 * 展开模板
 *
 * - expand_mode = 'single'：模板本身展开为 1 条待办，kind='subtask' 的条目落地为其子任务
 * - expand_mode = 'preset'：kind='task' 的条目各自展开为 1 条独立待办（清单预设）
 *
 * @param {Object} template - 模板（可带 items 数组）
 * @param {Object} [options] - { targetDate, now, categoryIdMap, categoryName, idFactory, deadlineTime }
 * @returns {{ todos: Array<Object>, warnings: string[] }}
 */
function expandTemplate(template, options = {}) {
  const tpl = normalizeTemplate(template);
  const warnings = [];
  const context = buildContext(tpl, options);
  const opts = Object.assign({}, options, { warnings });

  if (tpl.expand_mode === 'preset') {
    const taskItems = tpl.items.filter((it) => it.kind === 'task' && it.title);
    if (!taskItems.length) {
      warnings.push('清单预设模板没有可展开的条目');
      return { todos: [], warnings };
    }
    const todos = [];
    taskItems.forEach((item, index) => {
      const todo = buildTodo(tpl, item.title, context, opts, index, warnings);
      if (todo) todos.push(todo);
    });
    return { todos, warnings };
  }

  const subtaskItems = tpl.items.filter((it) => it.kind !== 'task' && it.title);
  const todo = buildTodo(tpl, tpl.name, context, opts, 0, warnings);
  if (!todo) return { todos: [], warnings };

  todo.subtasks = subtaskItems.map((item, index) => ({
    title: renderText(item.title, context),
    sort_order: Number.isFinite(item.sort_order) ? item.sort_order : index
  }));

  return { todos: [todo], warnings };
}

/**
 * 清单预设展开：等价于 expandMode='preset' 的模板展开
 */
function expandPreset(templates, options = {}) {
  const list = Array.isArray(templates) ? templates : [];
  const todos = [];
  const warnings = [];
  let offset = 0;

  list.forEach((tpl) => {
    const result = expandTemplate(
      Object.assign({}, tpl, { expand_mode: 'preset' }),
      Object.assign({}, options, {
        idFactory: options.idFactory
          ? (index) => options.idFactory(offset + index)
          : undefined
      })
    );
    result.todos.forEach((todo) => todos.push(todo));
    result.warnings.forEach((w) => warnings.push(w));
    offset += result.todos.length;
  });

  return { todos, warnings };
}

module.exports = {
  WEEKDAY_CN,
  PRIORITIES,
  QUADRANT_KEYS,
  toDateKey,
  parseDateKey,
  addDays,
  renderText,
  normalizeTemplate,
  resolveRelativeDeadline,
  buildContext,
  expandTemplate,
  expandPreset
};
