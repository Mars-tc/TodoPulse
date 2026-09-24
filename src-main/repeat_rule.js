/**
 * repeat_rule.js - 重复规则日期计算的单一来源
 *
 * 主进程（db.js）与渲染层（RepeatRuleEditor 预览，经 IPC）共用同一套算法，
 * 避免两处实现漂移导致「预览与实际生成的时间不一致」。
 */

/**
 * 计算下一次到期时间
 * @param {string} fromISO - 基准时间（ISO 串）
 * @param {Object} rule - { type: 'none'|'daily'|'weekly'|'monthly', interval: number }
 * @param {Object} [opts]
 * @param {boolean} [opts.anchorToNow=false] - 基准时间早于当前时间时，改为以「当前时间」为基准滚动，
 *        避免逾期补勾生成的下一轮仍然落在过去（一生成就已逾期并立刻催办）
 * @returns {string|null} 下一次到期时间（ISO 串）
 */
function computeNextDate(fromISO, rule, opts) {
  if (!rule || !rule.type || rule.type === 'none') return null;

  const now = new Date();
  let base = fromISO ? new Date(fromISO) : now;
  if (isNaN(base.getTime())) base = now;

  // 逾期补勾场景：从当前时间开始滚动，保证下一轮落在未来
  if (opts && opts.anchorToNow && base.getTime() < now.getTime()) base = now;

  const interval = Number(rule.interval) > 0 ? Math.floor(Number(rule.interval)) : 1;
  const next = new Date(base.getTime());

  if (rule.type === 'daily') {
    next.setDate(next.getDate() + interval);
  } else if (rule.type === 'weekly') {
    next.setDate(next.getDate() + interval * 7);
  } else if (rule.type === 'monthly') {
    // 先归到 1 号再跨月，避免 1/31 + 1 月 溢出成 3/3
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + interval);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  } else {
    return null;
  }

  return next.toISOString();
}

/**
 * 预览下一次到期时间（渲染层用，不做 anchorToNow，展示的是「按当前截止时间推算」的结果）
 * @param {string} fromISO
 * @param {Object} rule
 * @returns {string|null}
 */
function previewNextDate(fromISO, rule) {
  return computeNextDate(fromISO, rule);
}

module.exports = { computeNextDate, previewNextDate };
