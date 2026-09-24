/**
 * tests/repeat_rule.test.cjs
 * 重复规则日期计算测试（纯逻辑，不依赖 better-sqlite3 原生模块）
 * 运行：npm test
 */
const { computeNextDate, previewNextDate } = require('../src-main/repeat_rule.js');

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;
let failed = 0;
function check(name, actual, expect) {
  const ok = String(actual) === String(expect);
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' => ' + actual + (ok ? '' : ' (期望 ' + expect + ')'));
}

// 月末溢出：1/31 + 1 月 应为 2/28，而非 3/3
check('1/31 +1月', computeNextDate('2026-01-31T10:00:00.000Z', { type: 'monthly', interval: 1 }).slice(0, 10), '2026-02-28');
check('1/31 +2月', computeNextDate('2026-01-31T10:00:00.000Z', { type: 'monthly', interval: 2 }).slice(0, 10), '2026-03-31');
check('闰年 1/31 +1月', computeNextDate('2024-01-31T10:00:00.000Z', { type: 'monthly', interval: 1 }).slice(0, 10), '2024-02-29');

// 天 / 周
check('每天 +3', computeNextDate('2026-03-01T10:00:00.000Z', { type: 'daily', interval: 3 }).slice(0, 10), '2026-03-04');
check('每周 +2', computeNextDate('2026-03-01T10:00:00.000Z', { type: 'weekly', interval: 2 }).slice(0, 10), '2026-03-15');

// 时间部分应保留
check('保留时分', computeNextDate('2026-03-01T17:30:00.000Z', { type: 'daily', interval: 1 }).slice(11, 16), '17:30');

// 逾期补勾：anchorToNow 保证下一轮在未来
const next1 = computeNextDate(iso(now - 5 * DAY), { type: 'daily', interval: 1 }, { anchorToNow: true });
check('逾期5天补勾→未来', new Date(next1).getTime() > now, true);
// 未逾期时仍按截止时间推算
const dl = iso(now + 6 * 3600e3);
const next2 = computeNextDate(dl, { type: 'daily', interval: 1 }, { anchorToNow: true });
check('未逾期按截止时间', new Date(next2).getTime() - new Date(dl).getTime(), DAY);

// 非法输入
check('rule=none', computeNextDate(iso(now), { type: 'none' }), 'null');
check('非法日期回落', computeNextDate('not-a-date', { type: 'daily', interval: 1 }) !== null, true);
check('interval<=0 视为 1', computeNextDate('2026-03-01T10:00:00.000Z', { type: 'daily', interval: 0 }).slice(0, 10), '2026-03-02');
check('预览与计算同源', previewNextDate('2026-01-31T10:00:00.000Z', { type: 'monthly', interval: 1 }).slice(0, 10), '2026-02-28');

console.log(failed === 0 ? '\nALL PASS' : '\nFAILED: ' + failed);
process.exit(failed === 0 ? 0 : 1);
