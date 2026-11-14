/**
 * local_server.js
 * Express本地HTTP服务，仅监听127.0.0.1
 *
 * 安全约束：
 * - 只绑定127.0.0.1，禁止0.0.0.0
 * - 请求头携带 X-Todo-Token 鉴权（含 GET 接口）
 * - 仅本机访问有效
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { parseDeadline, formatDeadline, computeRemindAt } = require('./time_parser');
const { insertTodo, listCategories } = require('./db');
const { getScripts } = require('./config_store');

let server = null;
let port = null;
let token = null;
let onTodoAdded = null;
let lifecycleQueue = Promise.resolve();

function changeLifecycle(operation) {
  const result = lifecycleQueue.then(operation);
  lifecycleQueue = result.catch(() => {});
  return result;
}

/**
 * 注册「新增待办后」回调，用于通知渲染层刷新
 * @param {(todo: Object) => void} fn
 */
function setTodoAddedHandler(fn) {
  onTodoAdded = fn;
}

/**
 * token 校验中间件
 */
function requireToken(req, res, next) {
  const received = req.headers['x-todo-token'];
  if (!received || received !== token) {
    return res.status(403).json({ success: false, error: '非法token，拒绝访问' });
  }
  next();
}

/**
 * 启动本地HTTP服务
 * @param {number} listenPort - 监听端口
 * @param {string} apiToken - 鉴权token
 * @returns {Promise<import('http').Server>}
 */
function startServer(listenPort, apiToken) {
  return changeLifecycle(() => startListening(listenPort, apiToken));
}

function startListening(listenPort, apiToken) {
  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    throw new Error('端口号无效');
  }
  if (typeof apiToken !== 'string' || !apiToken.trim()) throw new Error('token 不能为空');
  if (server) {
    if (port === listenPort && token === apiToken) return server;
    throw new Error('服务已运行，请先停止再修改端口或 token');
  }

  return new Promise((resolve, reject) => {
    const app = express();

    // 只允许本机跨域请求
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Todo-Token');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    app.use(requireToken);
    app.use(express.json({ limit: '100kb' }));

    // 健康检查（同样需要 token，与各接口鉴权策略保持一致）
    app.get('/api/health', requireToken, (req, res) => {
      res.json({ success: true, message: 'Todo服务运行中', port });
    });

    // 分类列表（同样需要 token，避免成为信息泄露口）
    app.get('/api/categories', requireToken, (req, res) => {
      try {
        res.json({ success: true, data: listCategories() });
      } catch (e) {
        console.error('[local_server] 获取分类失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
      }
    });

    // 网页匹配脚本列表（供浏览器扩展拉取）
    // 只下发已启用脚本，且不泄露任何本地路径；异常一律返回空数组，避免扩展侧报错
    app.get('/api/scripts', requireToken, (req, res) => {
      try {
        const list = getScripts()
          .filter((s) => s.enabled)
          .map((s) => ({
            id: s.id,
            name: s.name,
            mode: s.mode,
            action: s.action,
            patterns: s.patterns,
            match: s.match || {},
            fields: s.fields,
            code: s.code
          }));
        res.json({ success: true, data: list });
      } catch (e) {
        console.error('[local_server] 获取脚本列表失败:', e.message);
        res.json({ success: true, data: [] });
      }
    });

    // 新增待办接口
    app.post('/api/add-todo', requireToken, (req, res) => {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ success: false, error: '请求内容必须为 JSON 对象' });
      }
      const textFields = ['pageTitle', 'url', 'selectedText', 'title', 'description', 'priority', 'categoryId', 'deadline'];
      for (const field of textFields) {
        if (req.body[field] != null && typeof req.body[field] !== 'string') {
          return res.status(400).json({ success: false, error: `${field} 必须为字符串` });
        }
      }
      const {
        pageTitle,
        url,
        selectedText,
        // 扩展增强字段（可选）
        title: customTitle,
        description = '',
        priority = 'medium',
        categoryId = '',
        deadline: customDeadline,
        remindLead
      } = req.body || {};

      if (![pageTitle, selectedText, customTitle].some((value) => value && value.trim())) {
        return res.status(400).json({ success: false, error: '标题和选中文本不能同时为空' });
      }
      if (remindLead != null && !['number', 'string'].includes(typeof remindLead)) {
        return res.status(400).json({ success: false, error: '提醒提前量必须为非负整数' });
      }
      const lead = remindLead === undefined || remindLead === null || remindLead === ''
        ? null : Number(remindLead);
      if (lead !== null && (!Number.isSafeInteger(lead) || lead < 0)) {
        return res.status(400).json({ success: false, error: '提醒提前量必须为非负整数' });
      }

      try {
        // 解析截止时间：优先用扩展显式指定的时间
        // 扩展可能传 ISO 串，也可能传自然语言（如「明天下午5点」）
        let deadline = null;
        if (customDeadline) {
          const direct = new Date(customDeadline);
          deadline = isNaN(direct.getTime())
            ? parseDeadline(String(customDeadline))
            : direct.toISOString();
        }
        if (!deadline) {
          deadline = parseDeadline(selectedText || pageTitle || '');
        }

        const remindAt = deadline && lead !== null ? computeRemindAt(deadline, lead) : null;
        if (deadline && lead !== null && !remindAt) {
          return res.status(400).json({ success: false, error: '提醒时间超出有效范围' });
        }

        const validPriority = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';

        // 优先使用扩展自定义标题，其次选中文本，最后网页标题
        const rawTitle = [customTitle, selectedText, pageTitle]
          .find((value) => value && value.trim()).trim().slice(0, 100);

        const todo = {
          id: uuidv4(),
          title: rawTitle,
          description: description || '',
          completed: false,
          priority: validPriority,
          deadline: deadline,
          create_at: new Date().toISOString(),
          source_url: url || '',
          source_page_title: pageTitle || '',
          source_selected_text: selectedText || '',
          category_id: categoryId || '',
          remind_at: remindAt,
          remind_lead: lead
        };

        const inserted = insertTodo(todo);

        console.log('[local_server] 新增待办成功，ID:', inserted.id, '截止时间:', inserted.deadline);

        if (typeof onTodoAdded === 'function') {
          try {
            Promise.resolve(onTodoAdded(inserted)).catch((e) => {
              console.warn('[local_server] 新增回调执行失败:', e.message);
            });
          } catch (e) {
            console.warn('[local_server] 新增回调执行失败:', e.message);
          }
        }

        res.json({
          success: true,
          data: {
            ...inserted,
            formattedDeadline: inserted.deadline ? formatDeadline(inserted.deadline) : null
          }
        });
      } catch (e) {
        console.error('[local_server] 新增待办失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
      }
    });

    app.use((err, req, res, next) => {
      if (res.headersSent) return next(err);
      const status = err.status >= 400 && err.status < 500 ? err.status : 500;
      console.warn('[local_server] 请求处理失败:', err.message);
      res.status(status).json({
        success: false,
        error: status === 413 ? '请求内容过大' : status === 400 ? '请求 JSON 格式不正确' : '请求处理失败'
      });
    });

    const candidate = app.listen(listenPort, '127.0.0.1', () => {
      server = candidate;
      port = listenPort;
      token = apiToken;
      console.log(`[local_server] HTTP服务已启动: http://127.0.0.1:${port}`);
      resolve(candidate);
    });
    candidate.on('close', () => {
      if (server === candidate) {
        server = null;
        port = null;
        token = null;
      }
    });
    candidate.on('error', (err) => {
      console.error('[local_server] 服务异常:', err.message);
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${listenPort} 已被占用，请关闭占用程序或更换端口`));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * 关闭服务
 */
function stopServer() {
  return changeLifecycle(() => {
    if (!server) return;
    const closingServer = server;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => closingServer.closeAllConnections(), 1000);
      timeout.unref();
      closingServer.close((err) => {
        clearTimeout(timeout);
        if (err) return reject(err);
        console.log('[local_server] 服务已关闭');
        resolve();
      });
      closingServer.closeIdleConnections();
    });
  });
}

/**
 * 获取当前端口
 */
function getPort() {
  return port;
}

/**
 * 获取当前token
 */
function getToken() {
  return token;
}

module.exports = {
  startServer,
  stopServer,
  getPort,
  getToken,
  setTodoAddedHandler
};
