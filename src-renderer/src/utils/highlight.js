/**
 * utils/highlight.js
 * 安全转义 + 关键词高亮
 * 注意：必须先转义再包裹 <mark>，否则来源网页文本可能带来 XSS 风险
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 生成带高亮的安全 HTML
 * @param {string} text 原始文本
 * @param {string} keyword 关键词（为空则只转义）
 * @returns {string} 可安全用于 v-html 的 HTML 片段
 */
export function highlightHtml(text, keyword = '') {
  const safe = escapeHtml(text);
  const kw = (keyword || '').trim();
  if (!kw) return safe;

  try {
    const re = new RegExp(`(${escapeRegExp(escapeHtml(kw))})`, 'gi');
    return safe.replace(re, '<mark class="hl">$1</mark>');
  } catch {
    return safe;
  }
}

/**
 * 截断文本（按字符数）
 */
export function truncate(text, n = 60) {
  const s = String(text || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}
