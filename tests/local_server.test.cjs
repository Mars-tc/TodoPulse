const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { once } = require('node:events');
const { createRequire } = require('node:module');

function setup(t) {
  const todos = [];
  let failInsert = false;
  const filename = path.join(__dirname, '../src-main/local_server.js');
  const localRequire = createRequire(filename);
  const sandbox = {
    module: { exports: {} }, console, setTimeout, clearTimeout,
    require(id) {
      if (id === './db') return {
        insertTodo(todo) {
          if (failInsert) throw new Error('模拟数据库写入失败');
          todos.push(todo);
          return todo;
        },
        listCategories: () => [{ id: 'cat-1', name: '工作' }]
      };
      if (id === './config_store') return { getScripts: () => [] };
      return localRequire(id);
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  const api = sandbox.module.exports;
  t.after(() => api.stopServer());
  return { api, todos, failInsert: (value) => { failInsert = value; } };
}

async function availablePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function request(api, endpoint, body, token = 'test-token') {
  const response = await fetch(`http://127.0.0.1:${api.getPort()}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Todo-Token': token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  assert.match(response.headers.get('content-type'), /application\/json/);
  return { status: response.status, body: await response.json() };
}

test('正常新增、分类及鉴权仍可用；通知失败不影响已写入结果', { timeout: 60000 }, async (t) => {
  const { api, todos } = setup(t);
  await api.startServer(await availablePort(), 'test-token');
  assert.equal((await request(api, '/api/health')).status, 200);
  assert.equal((await request(api, '/api/health', undefined, 'wrong')).status, 403);
  assert.equal((await request(api, '/api/categories')).body.data[0].name, '工作');
  api.setTodoAddedHandler(async () => { throw new Error('模拟通知失败'); });
  const result = await request(api, '/api/add-todo', {
    pageTitle: '网页', title: '  新增任务  ', categoryId: 'cat-1',
    deadline: '2026-11-14T10:00:00.000Z', remindLead: 30
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.title, '新增任务');
  assert.equal(result.body.data.remind_at, '2026-11-14T09:30:00.000Z');
  assert.equal(todos.length, 1);
});

test('非法字段、空白标题、无效 JSON 和过大请求被拒绝且不写入', { timeout: 10000 }, async (t) => {
  const { api, todos } = setup(t);
  await api.startServer(await availablePort(), 'test-token');
  const invalid = [
    [], {}, { title: '   ' }, { title: {} }, { title: 'x', selectedText: 123 },
    { title: 'x', description: [] }, { title: 'x', categoryId: {} },
    { title: 'x', remindLead: 'Infinity' }, { title: 'x', remindLead: -1 },
    { title: 'x', remindLead: { toString: null, valueOf: null } },
    { title: 'x', remindLead: true }, '{bad json', 'null',
    { title: 'x', deadline: '2026-11-14', remindLead: Number.MAX_SAFE_INTEGER }
  ];
  for (const body of invalid) {
    const result = await request(api, '/api/add-todo', body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.success, false);
  }
  assert.equal((await request(api, '/api/add-todo', { title: 'x'.repeat(110000) })).status, 413);
  assert.equal(todos.length, 0);
  assert.equal((await request(api, '/api/health')).status, 200);
});

test('数据库错误返回失败后，下一次有效请求仍可处理', async (t) => {
  const { api, todos, failInsert } = setup(t);
  await api.startServer(await availablePort(), 'test-token');
  failInsert(true);
  assert.equal((await request(api, '/api/add-todo', { title: '失败' })).status, 500);
  failInsert(false);
  assert.equal((await request(api, '/api/add-todo', { title: '恢复' })).status, 200);
  assert.equal(todos.length, 1);
});

test('并发启动幂等，重复启动不篡改 token，停止后可重新启动', async (t) => {
  const { api } = setup(t);
  const port = await availablePort();
  assert.equal(api.getPort(), null);
  const [a, b] = await Promise.all([api.startServer(port, 'test-token'), api.startServer(port, 'test-token')]);
  assert.equal(a, b);
  assert.equal(api.getPort(), port);
  await assert.rejects(api.startServer(port, 'other-token'), /服务已运行/);
  assert.equal((await request(api, '/api/health')).status, 200);
  await Promise.all([api.stopServer(), api.stopServer()]);
  assert.equal(api.getPort(), null);
  assert.equal(api.getToken(), null);
  await api.startServer(port, 'new-token');
  assert.equal((await request(api, '/api/health', undefined, 'new-token')).status, 200);
});

test('端口占用及参数错误不产生虚假运行状态，失败后可以恢复', async (t) => {
  const { api } = setup(t);
  const blocker = net.createServer();
  blocker.listen(0, '127.0.0.1');
  await once(blocker, 'listening');
  t.after(() => new Promise((resolve) => blocker.close(resolve)));
  await assert.rejects(api.startServer(blocker.address().port, 'test-token'), /已被占用/);
  for (const port of [null, 0, -1, 65536, NaN]) {
    await assert.rejects(api.startServer(port, 'test-token'), /端口号无效/);
  }
  await assert.rejects(api.startServer(3210, ''), /token/);
  assert.equal(api.getPort(), null);
  assert.equal(api.getToken(), null);
  await api.startServer(await availablePort(), 'test-token');
  assert.equal((await request(api, '/api/health')).status, 200);
});

test('启动期间立即停止再启动，不会返回正在关闭的服务', { timeout: 10000 }, async (t) => {
  const { api } = setup(t);
  const port = await availablePort();
  const first = api.startServer(port, 'test-token');
  const stop = api.stopServer();
  const next = api.startServer(port, 'test-token');
  await Promise.all([first, stop, next]);
  assert.equal((await next).listening, true);
  assert.equal((await request(api, '/api/health')).status, 200);
});

test('未完成的请求不会无限阻塞服务关闭', { timeout: 5000 }, async (t) => {
  const { api } = setup(t);
  await api.startServer(await availablePort(), 'test-token');
  const socket = net.connect(api.getPort(), '127.0.0.1');
  socket.on('error', () => {});
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  socket.write('POST /api/add-todo HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Todo-Token: test-token\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
  await api.stopServer();
  assert.equal(api.getPort(), null);
});
