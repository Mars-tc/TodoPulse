/**
 * popup.js - 扩展配置弹窗
 * 可视化填写 port / token，测试连通性后写入 chrome.storage.local
 */
const $ = (id) => document.getElementById(id);

const portEl = $('port');
const tokenEl = $('token');
const categoryEl = $('category');
const remindLeadEl = $('remindLead');
const testBtn = $('test');
const statusEl = $('status');

function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = 'status show ' + type;
}

function baseUrl() {
  const port = String(portEl.value || '').trim();
  return `http://127.0.0.1:${port}`;
}

function getToken() {
  return String(tokenEl.value || '').trim();
}

// 初始化：读取已保存的配置
chrome.storage.local.get(['port', 'token', 'defaultCategoryId', 'remindLead'], (data) => {
  if (data.port) portEl.value = data.port;
  if (data.token) tokenEl.value = data.token;
  if (data.remindLead !== undefined && data.remindLead !== '') remindLeadEl.value = String(data.remindLead);

  if (data.port && data.token) {
    loadCategories(data.defaultCategoryId || '');
  }
});

async function loadCategories(selectedId) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'FETCH_CATEGORIES' });
    if (!res || !res.success) return;

    const list = res.data || [];
    categoryEl.innerHTML = '<option value="">未分类</option>' +
      list.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (selectedId) categoryEl.value = selectedId;
  } catch (e) {
    console.warn('[popup] 加载分类失败:', e && e.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

testBtn.addEventListener('click', async () => {
  const port = String(portEl.value || '').trim();
  const token = getToken();

  if (!port) return setStatus('请先填写端口', 'err');
  if (!token) return setStatus('请先填写 Token', 'err');

  testBtn.disabled = true;
  testBtn.textContent = '测试中…';
  setStatus('正在连接 ' + baseUrl() + ' …', 'info');

  try {
    const resp = await fetch(baseUrl() + '/api/health', {
      method: 'GET',
      headers: { 'X-Todo-Token': token }
    });

    if (!resp.ok) {
      setStatus('连接失败：HTTP ' + resp.status + '（请确认 Token 正确）', 'err');
      return;
    }

    await chrome.storage.local.set({
      port: Number(port),
      token,
      defaultCategoryId: categoryEl.value || '',
      remindLead: remindLeadEl.value || ''
    });

    setStatus('✅ 连接成功，配置已保存', 'ok');
    await loadCategories(categoryEl.value || '');
  } catch (e) {
    setStatus('连接失败：请确认 TodoPulse 桌面应用已启动', 'err');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接并保存';
  }
});
