/**
 * quadrant_planner.js
 * 象限与排期纯算法：四象限分桶 / 象限建议 / 今日排期 / 逾期顺延
 *
 * 设计约束（遵循项目约定 MEMORY.md）：
 * - 零原生依赖、零 Electron 依赖、零 IO，可在 node 环境下直接 require 并被测试覆盖
 * - 象限与精力档位是「用户显式意图」，算法只给出建议值，不擅自改写用户数据
 */

const QUADRANTS = [
  { key: 'Q1', name: '重要且紧急', desc: '优先处理，勿再拖延', color: '#dc2626' },
  { key: 'Q2', name: '重要不紧急', desc: '重点投入，适合提前安排', color: '#3b82f6' },
  { key: 'Q3', name: '不重要但紧急', desc: '快速处理或转交他人', color: '#f97316' },
  { key: 'Q4', name: '不重要不紧急', desc: '有空再看，可以延后', color: '#8b5cf6' }
];

const QUADRANT_KEYS = QUADRANTS.map((q) => q.key);

const ENERGY_LEVELS = ['high', 'medium', 'low'];

const ENERGY_LABELS = {
  high: '高精力',
  medium: '中等精力',
  low: '低精力'
};

const PRIORITY_SCORE = { high: 3, medium: 2, low: 1 };

const DAY_MS = 86400000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 本地时区日期键 YYYY-MM-DD
 */
function toDateKey(date) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 'HH:mm' 转当天分钟数；非法输入返回 null
 */
function toMinutes(text) {
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 象限元信息
 */
function getQuadrant(key) {
  return QUADRANTS.find((q) => q.key === key) || null;
}

/**
 * 建议象限：依据优先级 + 截止时间距离推导，返回建议值与理由文案
 * 仅作建议，不落库（除非用户采纳）
 *
 * @param {Object} todo
 * @param {Date} [now]
 * @param {Object} [options] - { urgentWithinDays: 3 }
 * @returns {{ quadrant: string, reason: string }}
 */
function suggestQuadrant(todo, now = new Date(), options = {}) {
  const t = todo && typeof todo === 'object' ? todo : {};
  const urgentWithinDays = Number.isFinite(Number(options.urgentWithinDays)) ? Number(options.urgentWithinDays) : 3;
  const reference = now instanceof Date ? now : new Date();

  const priority = PRIORITY_SCORE[t.priority] ? t.priority : 'medium';
  const important = priority === 'high';
  const importantLabel = important ? '高优先级' : priority === 'medium' ? '中优先级' : '低优先级';

  let urgent = false;
  let urgentReason = '';

  if (t.deadline) {
    const dl = new Date(t.deadline);
    if (!isNaN(dl.getTime())) {
      const diff = dl.getTime() - reference.getTime();
      if (diff < 0) {
        urgent = true;
        urgentReason = '已逾期';
      } else if (diff <= urgentWithinDays * DAY_MS) {
        urgent = true;
        urgentReason = `距截止不足 ${urgentWithinDays} 天`;
      }
    }
  }

  if (important && urgent) return { quadrant: 'Q1', reason: `${importantLabel}且${urgentReason}` };
  if (important) return { quadrant: 'Q2', reason: `${importantLabel}但时间充裕，适合提前安排` };
  if (urgent) return { quadrant: 'Q3', reason: `${importantLabel}但${urgentReason}，建议快速处理或转交` };
  return { quadrant: 'Q4', reason: `${importantLabel}且无紧迫截止，可延后处理` };
}

/**
 * 按用户已设定的象限分桶
 * @param {Array<Object>} todos
 * @returns {{ Q1: Array, Q2: Array, Q3: Array, Q4: Array, unclassified: Array }}
 */
function buildQuadrants(todos) {
  const out = { Q1: [], Q2: [], Q3: [], Q4: [], unclassified: [] };
  for (const t of todos || []) {
    if (!t) continue;
    const key = t.quadrant;
    if (key && out[key]) out[key].push(t);
    else out.unclassified.push(t);
  }
  return out;
}

/**
 * 精力时段匹配：优先匹配同档位时段，其次取当前所在时段，最后取最早开始的时段
 *
 * @param {string} energyLevel - high | medium | low
 * @param {Array<{label:string,start:string,end:string,energy:string}>} slots
 * @param {Date} [now]
 * @returns {string} 时段名称，未配置时返回空串
 */
function matchEnergySlot(energyLevel, slots, now = new Date()) {
  const list = Array.isArray(slots) ? slots.filter((s) => s && s.label) : [];
  if (!list.length) return '';

  const level = ENERGY_LEVELS.indexOf(energyLevel) >= 0 ? energyLevel : 'medium';
  const matched = list.filter((s) => (s.energy || 'medium') === level);
  const pool = matched.length ? matched : list;

  const reference = now instanceof Date ? now : new Date();
  const cur = reference.getHours() * 60 + reference.getMinutes();

  const inSlot = pool.find((s) => {
    const start = toMinutes(s.start);
    const end = toMinutes(s.end);
    if (start === null || end === null) return false;
    return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
  });
  if (inSlot) return inSlot.label;

  const sorted = pool
    .slice()
    .sort((a, b) => (toMinutes(a.start) === null ? 0 : toMinutes(a.start)) - (toMinutes(b.start) === null ? 0 : toMinutes(b.start)));
  return sorted.length ? sorted[0].label : '';
}

/**
 * 取生效象限：用户已设定则用用户值，否则用建议值（仅用于排序，不落库）
 */
function effectiveQuadrant(todo, now) {
  if (todo && todo.quadrant) return todo.quadrant;
  return suggestQuadrant(todo, now).quadrant;
}

/**
 * 排期排序：生效象限 → 截止时间 → 优先级 → 创建时间
 */
function compareForPlan(a, b, now) {
  const qa = effectiveQuadrant(a, now);
  const qb = effectiveQuadrant(b, now);
  if (qa !== qb) return qa.localeCompare(qb);

  const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
  const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
  if (da !== db) return da - db;

  const pa = PRIORITY_SCORE[a.priority] || 0;
  const pb = PRIORITY_SCORE[b.priority] || 0;
  if (pa !== pb) return pb - pa;

  return String(a.create_at || '').localeCompare(String(b.create_at || ''));
}

/**
 * 今日排期
 *
 * @param {Array<Object>} todos
 * @param {Object} [planningSettings] - { daily_capacity_minutes, energy_slots, default_estimate_minutes, urgent_within_days }
 * @param {Date} [now]
 * @returns {{ items: Array, overflow: Array, usedMinutes: number, capacityMinutes: number }}
 */
function planToday(todos, planningSettings = {}, now = new Date()) {
  const cfg = planningSettings && typeof planningSettings === 'object' ? planningSettings : {};
  const reference = now instanceof Date ? now : new Date();

  const capacity =
    Number.isFinite(Number(cfg.daily_capacity_minutes)) && Number(cfg.daily_capacity_minutes) > 0
      ? Number(cfg.daily_capacity_minutes)
      : 240;
  const defaultEstimate =
    Number.isFinite(Number(cfg.default_estimate_minutes)) && Number(cfg.default_estimate_minutes) > 0
      ? Number(cfg.default_estimate_minutes)
      : 30;
  const slots = Array.isArray(cfg.energy_slots) ? cfg.energy_slots : [];

  const candidates = (todos || []).filter((t) => t && !t.completed && !t.deleted_at);
  const sorted = candidates.slice().sort((a, b) => compareForPlan(a, b, reference));

  const items = [];
  const overflow = [];
  let used = 0;

  for (const t of sorted) {
    const estimate =
      Number.isFinite(Number(t.estimate_minutes)) && Number(t.estimate_minutes) > 0
        ? Number(t.estimate_minutes)
        : defaultEstimate;

    const adopted = !!t.quadrant;
    const qKey = effectiveQuadrant(t, reference);
    const qMeta = getQuadrant(qKey);
    const slot = matchEnergySlot(t.energy_level, slots, reference);

    const reasons = [];
    reasons.push(adopted ? `归入${qMeta ? qMeta.name : qKey}` : `建议${qMeta ? qMeta.name : qKey}（未采纳）`);
    if (slot) reasons.push(`匹配${slot}`);
    if (t.deadline) {
      const dl = new Date(t.deadline);
      if (!isNaN(dl.getTime()) && dl.getTime() < reference.getTime()) reasons.push('已逾期');
    } else {
      reasons.push('无截止时间');
    }

    if (used + estimate > capacity) {
      overflow.push(t);
      continue;
    }

    used += estimate;
    items.push({
      todo: t,
      slot,
      reason: reasons.join(' · '),
      order: items.length + 1,
      estimateMinutes: estimate
    });
  }

  return { items, overflow, usedMinutes: used, capacityMinutes: capacity };
}

/**
 * 下一个工作日（跳过周六周日）
 */
function nextWorkdayKey(now) {
  const base = now instanceof Date ? now : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return toDateKey(d);
}

/**
 * 计算顺延后的截止时间：沿用原时分；目标日为今天且原时刻已过则用 18:00 兜底
 */
function buildDeferredDeadline(originalDeadline, targetKey, now) {
  const [hh, mm] = String(targetKey).split('-').map((n) => Number(n));
  const target = new Date(hh, mm - 1, Number(String(targetKey).slice(8, 10)), 18, 0, 0, 0);

  if (originalDeadline) {
    const od = new Date(originalDeadline);
    if (!isNaN(od.getTime())) {
      const sameDay =
        od.getFullYear() === target.getFullYear() &&
        od.getMonth() === target.getMonth() &&
        od.getDate() === target.getDate();
      if (!sameDay) {
        target.setHours(od.getHours(), od.getMinutes(), 0, 0);
      }
    }
  }

  const reference = now instanceof Date ? now : new Date();
  if (target.getTime() <= reference.getTime()) {
    target.setHours(18, 0, 0, 0);
    if (target.getTime() <= reference.getTime()) {
      target.setDate(target.getDate() + 1);
    }
  }

  return target.toISOString();
}

/**
 * 逾期顺延目标计算
 *
 * @param {Array<Object>} overdueTodos
 * @param {string} strategy - today | next_workday | mark_only
 * @param {Date} [now]
 * @returns {Array<{ id, deadline, markOnly, reason }>}
 */
function resolveDeferTargets(overdueTodos, strategy = 'today', now = new Date()) {
  const reference = now instanceof Date ? now : new Date();
  const list = (overdueTodos || []).filter((t) => t && t.id);
  const targets = [];

  for (const t of list) {
    if (strategy === 'mark_only') {
      targets.push({
        id: t.id,
        deadline: null,
        markOnly: true,
        reason: '仅标记逾期，不修改截止时间'
      });
      continue;
    }

    const targetKey = strategy === 'next_workday' ? nextWorkdayKey(reference) : toDateKey(reference);
    const deadline = buildDeferredDeadline(t.deadline, targetKey, reference);
    targets.push({
      id: t.id,
      deadline,
      markOnly: false,
      reason:
        strategy === 'next_workday'
          ? `顺延至下一个工作日 ${targetKey}`
          : `顺延至今天 ${targetKey}`
    });
  }

  return targets;
}

/**
 * 逾期判定：未完成 + 有截止时间 + 已过期
 */
function isOverdue(todo, now = new Date()) {
  if (!todo || todo.completed || !todo.deadline) return false;
  const dl = new Date(todo.deadline);
  if (isNaN(dl.getTime())) return false;
  return dl.getTime() < (now instanceof Date ? now : new Date()).getTime();
}

module.exports = {
  QUADRANTS,
  QUADRANT_KEYS,
  ENERGY_LEVELS,
  ENERGY_LABELS,
  toDateKey,
  toMinutes,
  getQuadrant,
  suggestQuadrant,
  buildQuadrants,
  matchEnergySlot,
  effectiveQuadrant,
  compareForPlan,
  planToday,
  nextWorkdayKey,
  buildDeferredDeadline,
  resolveDeferTargets,
  isOverdue
};
