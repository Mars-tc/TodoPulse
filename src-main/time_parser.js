/**
 * time_parser.js
 * 使用 chrono-node 库解析自然语言时间
 * 例如："9月10日" -> ISO时间字符串
 *         "下周三" -> ISO时间字符串
 *         "明天下午5点" -> ISO时间字符串
 * 识别失败则返回 null
 */
const chrono = require('chrono-node');

// chrono-node 默认只解析英文，中文（简体）需显式使用 zh.hans locale
const zhHans = chrono.zh && chrono.zh.hans ? chrono.zh.hans : null;

/**
 * 依次尝试中文（简体）→ 英文 解析，返回 chrono 结果数组
 * @param {string} text
 * @returns {Array} chrono 解析结果
 */
function parseResults(text) {
  if (zhHans && typeof zhHans.parse === 'function') {
    const zhResults = zhHans.parse(text);
    if (zhResults.length > 0) return zhResults;
  }
  return chrono.parse(text);
}

/**
 * 解析文本中的截止时间
 * @param {string} text - 待解析的文本
 * @returns {string|null} - ISO时间字符串或null
 */
function parseDeadline(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    const results = parseResults(text);

    if (results.length > 0) {
      const matchedDate = results[0].start.date();
      // 返回ISO时间字符串
      return matchedDate.toISOString();
    }
  } catch (e) {
    console.warn('[time_parser] 时间解析异常:', e.message);
  }

  return null;
}

/**
 * 解析文本中的时间，返回结构化结果（供渲染层预览）
 * @returns {{ deadline: string|null, formatted: string|null, matched: string|null }}
 */
function parseDeadlineDetailed(text) {
  const deadline = parseDeadline(text);
  let matched = null;
  try {
    const results = parseResults(text || '');
    if (results.length > 0) matched = results[0].text;
  } catch {
    matched = null;
  }
  return {
    deadline,
    formatted: deadline ? formatDeadline(deadline) : null,
    matched
  };
}

/**
 * 根据截止时间与提前量（分钟）计算提醒时间
 * @param {string} deadlineISO
 * @param {number} leadMinutes
 * @returns {string|null} ISO 时间字符串
 */
function computeRemindAt(deadlineISO, leadMinutes) {
  if (!deadlineISO) return null;
  const lead = Number(leadMinutes);
  if (!lead && lead !== 0) return null;
  const d = new Date(deadlineISO);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() - lead * 60000).toISOString();
}

/**
 * 格式化时间显示
 * @param {string} isoString - ISO时间字符串
 * @returns {string|null} - 友好格式
 */
function formatDeadline(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch {
    return null;
  }
}

/**
 * 相对时间描述：3分钟后 / 2小时后 / 昨天 / 3天前
 */
function formatRelative(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? '前' : '后';
  const min = 60000;
  const hour = 3600000;
  const day = 86400000;

  if (abs < min) return '刚刚';
  if (abs < hour) return `${Math.floor(abs / min)} 分钟${suffix}`;
  if (abs < day) return `${Math.floor(abs / hour)} 小时${suffix}`;
  if (abs < day * 30) return `${Math.floor(abs / day)} 天${suffix}`;
  return formatDeadline(isoString);
}

module.exports = {
  parseDeadline,
  parseDeadlineDetailed,
  computeRemindAt,
  formatDeadline,
  formatRelative
};
