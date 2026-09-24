/**
 * sandbox.js - 用户脚本执行沙箱（MV3 下唯一允许 eval 的环境）
 *
 * 运行环境：manifest 声明的 sandbox 页面，CSP 含 unsafe-eval
 * 安全约束：无扩展 API（chrome.* 不可用）、无网络能力、无法访问真实页面 DOM
 * 执行方式：接收 content-script 传入的网页 HTML 快照，DOMParser 解析后交由用户代码处理
 */

var FIELD_KEYS = ['title', 'description', 'deadline', 'priority'];
var MAX_LEN = { title: 100, description: 2000, deadline: 200, priority: 20 };
var VALID_PRIORITY = { high: 1, medium: 1, low: 1 };

/**
 * 归一化用户脚本返回值：字段白名单 + 长度截断 + 优先级枚举校验
 * @param {any} raw - 用户代码返回值
 * @returns {object} 清洗后的结果
 */
function normalizeResult(raw) {
  var out = {};
  if (!raw || typeof raw !== 'object') return out;

  for (var i = 0; i < FIELD_KEYS.length; i++) {
    var key = FIELD_KEYS[i];
    var val = raw[key];
    if (val === undefined || val === null) continue;

    if (key === 'priority') {
      var p = String(val).trim().toLowerCase();
      // 兼容中文「高 / 中 / 低」写法
      if (p === '高' || p.indexOf('high') === 0 || p === 'urgent') p = 'high';
      else if (p === '低' || p.indexOf('low') === 0) p = 'low';
      else if (p === '中' || p.indexOf('medium') === 0 || p.indexOf('normal') === 0) p = 'medium';
      if (VALID_PRIORITY[p]) out.priority = p;
      continue;
    }

    var text = typeof val === 'string' ? val : String(val);
    text = text.replace(/\s+/g, ' ').trim();
    if (text) out[key] = text.slice(0, MAX_LEN[key]);
  }
  return out;
}

/**
 * 执行用户代码：仅在此沙箱内允许 new Function
 */
function runUserCode(code, html, url, selection) {
  var doc;
  try {
    doc = new DOMParser().parseFromString(html || '', 'text/html');
  } catch (e) {
    doc = null;
  }

  var fn = new Function('doc', 'url', 'selection', code);
  var raw = fn(doc, url || '', selection || '');
  return normalizeResult(raw);
}

/**
 * 握手令牌：沙箱页每次加载随机生成，并通过 TP_SANDBOX_READY 交给宿主页面。
 * 后续只接受携带该令牌、且来自宿主窗口（parent）的执行请求，
 * 避免任意网页对沙箱页 postMessage 驱动代码执行。
 */
var TOKEN = 'tp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

window.addEventListener('message', function (event) {
  var msg = event.data;
  if (!msg || msg.type !== 'TP_RUN_SCRIPT') return;

  // 只接受来自嵌入本页的宿主窗口、且持有握手令牌的请求
  if (event.source !== window.parent || msg.token !== TOKEN) return;

  var reply = { type: 'TP_SCRIPT_RESULT', id: msg.id };
  try {
    reply.ok = true;
    reply.data = runUserCode(msg.code, msg.html, msg.url, msg.selection);
  } catch (e) {
    reply.ok = false;
    reply.error = (e && e.message) || '脚本执行失败';
  }

  if (event.source && typeof event.source.postMessage === 'function') {
    event.source.postMessage(reply, '*');
  } else {
    window.parent.postMessage(reply, '*');
  }
});

// 通知父页面沙箱已就绪，并下发本次会话的握手令牌
window.parent.postMessage({ type: 'TP_SANDBOX_READY', token: TOKEN }, '*');
