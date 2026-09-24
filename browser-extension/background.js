/**
 * background.js - Chrome Extension Service Worker (MV3)
 * 从 chrome.storage 读取配置，转发请求到 Electron 本地服务
 */
let configCache = null;

async function fetchConfig() {
  if (configCache) return configCache;
  try {
    const stored = await chrome.storage.local.get(['port', 'token']);
    if (stored.port && stored.token) {
      configCache = { port: stored.port, token: stored.token };
      return configCache;
    }
  } catch (e) { console.error('[bg] storage error:', e); }
  return null;
}

async function fetchCategories() {
  const config = await fetchConfig();
  if (!config) {
    return { success: false, error: '未配置端口/Token，请在扩展弹窗中填写' };
  }
  try {
    const resp = await fetch('http://127.0.0.1:' + config.port + '/api/categories', {
      method: 'GET',
      headers: { 'X-Todo-Token': config.token }
    });
    return await resp.json();
  } catch (e) {
    return { success: false, error: '连接失败：请先打开 TodoPulse 桌面应用' };
  }
}

/**
 * 拉取网页匹配脚本：优先走网络，失败时降级为本地缓存
 * 保证桌面端未运行时「加入待办」基础功能不受影响
 */
async function fetchScripts() {
  const config = await fetchConfig();
  if (!config) {
    return { success: false, error: '未配置端口/Token，请在扩展弹窗中填写' };
  }
  try {
    const resp = await fetch('http://127.0.0.1:' + config.port + '/api/scripts', {
      method: 'GET',
      headers: { 'X-Todo-Token': config.token }
    });
    const json = await resp.json();
    if (json && json.success && Array.isArray(json.data)) {
      await chrome.storage.local.set({ scriptsCache: json.data });
      return { success: true, data: json.data };
    }
    return json;
  } catch (e) {
    try {
      const cached = await chrome.storage.local.get(['scriptsCache']);
      if (Array.isArray(cached.scriptsCache)) {
        return { success: true, data: cached.scriptsCache, cached: true };
      }
    } catch (_) { /* ignore */ }
    return { success: false, error: '连接失败：请先打开 TodoPulse 桌面应用' };
  }
}

async function sendToElectron(payload) {
  const config = await fetchConfig();
  if (!config) {
    return { success: false, error: '未配置端口/Token，请在扩展弹窗中填写' };
  }
  try {
    const resp = await fetch('http://127.0.0.1:' + config.port + '/api/add-todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Todo-Token': config.token },
      body: JSON.stringify(payload)
    });
    return await resp.json();
  } catch (e) {
    return { success: false, error: '连接失败：请先打开 TodoPulse 桌面应用' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 新增待办：支持扩展自定义标题 / 描述 / 优先级 / 分类 / 截止时间 / 提醒
  if (message.type === 'ADD_TODO') {
    sendToElectron({
      pageTitle: message.pageTitle,
      url: message.url,
      selectedText: message.selectedText,
      title: message.title,
      description: message.description,
      priority: message.priority,
      categoryId: message.categoryId,
      deadline: message.deadline,
      remindLead: message.remindLead
    })
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === 'FETCH_CATEGORIES') {
    fetchCategories()
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === 'FETCH_SCRIPTS') {
    fetchScripts()
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === 'SAVE_CONFIG') {
    chrome.storage.local.set({ port: message.port, token: message.token }, () => {
      configCache = { port: message.port, token: message.token };
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_CONFIG') {
    fetchConfig().then(c => sendResponse(c));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[bg] TodoPulse extension installed');
});
