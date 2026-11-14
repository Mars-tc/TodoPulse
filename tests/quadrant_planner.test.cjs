/**
 * tests/quadrant_planner.test.cjs
 * 象限与排期算法测试（纯逻辑，不依赖 better-sqlite3 原生模块）
 * 运行：npm test
 */
const planner = require('../src-main/quadrant_planner.js');

const {
  QUADRANTS,
  QUADRANT_KEYS,
  suggestQuadrant,
  buildQuadrants,
  matchEnergySlot,
  planToday,
  nextWorkdayKey,
  resolveDeferTargets,
  isOverdue
} = planner;

let failed = 0;
function check(name, actual, expect) {
  const ok = String(actual) === String(expect);
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' => ' + actual + (ok ? '' : ' (期望 ' + expect + ')'));
}

const NOW = new Date(2026, 9, 29, 9, 0, 0);
const DAY = 86400000;

// ---- 象限元信息 ----
check('象限 4 个', QUADRANTS.length, 4);
check('象限键序', QUADRANT_KEYS.join(','), 'Q1,Q2,Q3,Q4');

// ---- 象限建议 ----
const overdue = { priority: 'high', deadline: new Date(NOW.getTime() - DAY).toISOString() };
check('高优先 + 已逾期 → Q1', suggestQuadrant(overdue, NOW).quadrant, 'Q1');
check('高优先 + 无截止 → Q2', suggestQuadrant({ priority: 'high' }, NOW).quadrant, 'Q2');
check('低优先 + 临近截止 → Q3', suggestQuadrant({ priority: 'low', deadline: new Date(NOW.getTime() + DAY).toISOString() }, NOW).quadrant, 'Q3');
check('低优先 + 无截止 → Q4', suggestQuadrant({ priority: 'low' }, NOW).quadrant, 'Q4');
check('中优先 + 远期 → Q4', suggestQuadrant({ priority: 'medium', deadline: new Date(NOW.getTime() + 30 * DAY).toISOString() }, NOW).quadrant, 'Q4');
check('中优先 + 逾期 → Q3', suggestQuadrant({ priority: 'medium', deadline: new Date(NOW.getTime() - DAY).toISOString() }, NOW).quadrant, 'Q3');
check('建议附带理由', suggestQuadrant(overdue, NOW).reason.length > 0, true);

// 紧急阈值可配置
const farSoon = { priority: 'low', deadline: new Date(NOW.getTime() + 2 * DAY).toISOString() };
check('默认阈值 3 天内算紧急', suggestQuadrant(farSoon, NOW).quadrant, 'Q3');
check('阈值收紧到 1 天', suggestQuadrant(farSoon, NOW, { urgentWithinDays: 1 }).quadrant, 'Q4');

// ---- 分桶 ----
const bucketTodos = [
  { id: '1', quadrant: 'Q1' },
  { id: '2', quadrant: 'Q1' },
  { id: '3', quadrant: 'Q2' },
  { id: '4', quadrant: '' },
  { id: '5', quadrant: 'Q9' }
];
const buckets = buildQuadrants(bucketTodos);
check('Q1 桶 2 条', buckets.Q1.length, 2);
check('Q2 桶 1 条', buckets.Q2.length, 1);
check('Q3 桶 0 条', buckets.Q3.length, 0);
check('Q4 桶 0 条', buckets.Q4.length, 0);
check('未归类 2 条', buckets.unclassified.length, 2);

// ---- 精力时段匹配 ----
const slots = [
  { label: '上午高能', start: '08:00', end: '12:00', energy: 'high' },
  { label: '午后中等', start: '13:00', end: '18:00', energy: 'medium' },
  { label: '晚间低能', start: '19:00', end: '22:00', energy: 'low' }
];
check('高精力匹配上午', matchEnergySlot('high', slots, NOW), '上午高能');
check('中精力匹配午后', matchEnergySlot('medium', slots, NOW), '午后中等');
check('低精力匹配晚间', matchEnergySlot('low', slots, NOW), '晚间低能');
check('无时段配置返回空串', matchEnergySlot('high', [], NOW), '');
check('档位无匹配时回落到最早时段', matchEnergySlot('medium', [{ label: '兜底', start: '07:00', end: '09:00', energy: 'low' }], NOW), '兜底');

// ---- 今日排期 ----
const planTodos = [
  { id: 'a', title: 'A', completed: 0, priority: 'high', quadrant: 'Q1', create_at: '2026-10-01T00:00:00.000Z' },
  { id: 'b', title: 'B', completed: 0, priority: 'medium', quadrant: 'Q2', create_at: '2026-10-02T00:00:00.000Z' },
  { id: 'c', title: 'C', completed: 0, priority: 'low', quadrant: 'Q4', create_at: '2026-10-03T00:00:00.000Z' }
];
const plan = planToday(planTodos, { daily_capacity_minutes: 60, default_estimate_minutes: 30 }, NOW);
check('容量 60 只排 2 条', plan.items.length, 2);
check('溢出 1 条', plan.overflow.length, 1);
check('已用 60 分钟', plan.usedMinutes, 60);
check('容量值透传', plan.capacityMinutes, 60);
check('排期保持象限顺序', plan.items.map((i) => i.todo.id).join(','), 'a,b');
check('每项带排入原因', plan.items[0].reason.length > 0, true);
check('排期序号从 1 开始', plan.items[0].order, 1);

const plan2 = planToday(planTodos, { daily_capacity_minutes: 600, default_estimate_minutes: 30 }, NOW);
check('容量充足时全部排入', plan2.items.length, 3);
check('容量充足时无溢出', plan2.overflow.length, 0);

// 已完成 / 已删除 不参与排期
const plan3 = planToday(
  [
    { id: 'x', completed: 1, quadrant: 'Q1' },
    { id: 'y', deleted_at: '2026-10-01T00:00:00.000Z', quadrant: 'Q1' },
    { id: 'z', completed: 0, quadrant: 'Q1' }
  ],
  { daily_capacity_minutes: 600 },
  NOW
);
check('已完成与已删除被排除', plan3.items.length, 1);

// 显式预估时长优先于默认值
const plan4 = planToday(
  [
    { id: 'm', completed: 0, quadrant: 'Q1', estimate_minutes: 45 },
    { id: 'n', completed: 0, quadrant: 'Q2', estimate_minutes: 45 }
  ],
  { daily_capacity_minutes: 60, default_estimate_minutes: 30 },
  NOW
);
check('显式预估后总条数守恒', plan4.items.length + plan4.overflow.length, 2);
check('显式预估占用 45 分钟', plan4.items[0].estimateMinutes, 45);

// ---- 逾期顺延 ----
const overdueList = [
  { id: 'o1', title: '逾期1', deadline: new Date(NOW.getTime() - 2 * DAY).toISOString() },
  { id: 'o2', title: '逾期2', deadline: new Date(NOW.getTime() - 5 * DAY).toISOString() }
];

const toToday = resolveDeferTargets(overdueList, 'today', NOW);
check('顺延今天：2 条', toToday.length, 2);
check('顺延今天：非标记模式', toToday[0].markOnly, false);
check('顺延今天：生成新截止时间', typeof toToday[0].deadline, 'string');
check('顺延今天：新截止时间在未来', new Date(toToday[0].deadline).getTime() > NOW.getTime(), true);
check('顺延今天：给出理由', toToday[0].reason.indexOf('今天') >= 0, true);

const toWorkday = resolveDeferTargets(overdueList, 'next_workday', NOW);
const wdKey = nextWorkdayKey(NOW);
check('下一个工作日不是周末', [0, 6].indexOf(new Date(wdKey + 'T00:00:00').getDay()) >= 0, false);
check('下一个工作日在未来', new Date(wdKey + 'T00:00:00').getTime() > NOW.getTime(), true);
check('顺延工作日：理由含工作日', toWorkday[0].reason.indexOf('工作日') >= 0, true);
check('顺延工作日：目标日一致', toWorkday[0].deadline.slice(0, 10), wdKey);

const markOnly = resolveDeferTargets(overdueList, 'mark_only', NOW);
check('仅标记：markOnly 为真', markOnly[0].markOnly, true);
check('仅标记：不改截止时间', markOnly[0].deadline, 'null');

// ---- 逾期判定 ----
check('已逾期判定为真', isOverdue({ deadline: new Date(NOW.getTime() - DAY).toISOString() }, NOW), true);
check('未来时间不算逾期', isOverdue({ deadline: new Date(NOW.getTime() + DAY).toISOString() }, NOW), false);
check('无截止时间不算逾期', isOverdue({}, NOW), false);
check('已完成不算逾期', isOverdue({ completed: 1, deadline: new Date(NOW.getTime() - DAY).toISOString() }, NOW), false);

console.log(failed === 0 ? '\nALL PASS' : '\nFAILED: ' + failed);
process.exit(failed === 0 ? 0 : 1);
