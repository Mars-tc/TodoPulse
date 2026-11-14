const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const store = require('../src-main/config_store');

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todopulse-main-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ port: 3210, token: 'original-token' }));
  const handlers = new Map();
  const history = [];
  const notifications = [];
  const state = { port: null, token: null, failPort: null, beforeStart: null };
  let ready;
  class Window {
    constructor() { this.webContents = { send() {} }; }
    on() {}
    loadFile() {}
    static getAllWindows() { return []; }
  }
  class Tray {
    setToolTip() {}
    setContextMenu() {}
    on() {}
  }
  const image = { isEmpty: () => false, resize: () => image };
  const electron = {
    app: {
      whenReady: () => ({ then(fn) { ready = Promise.resolve().then(fn); return ready; } }),
      getPath: () => dir, on() {}
    },
    BrowserWindow: Window, Tray, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    Menu: { setApplicationMenu() {}, buildFromTemplate: (items) => items },
    nativeImage: { createFromPath: () => image },
    nativeTheme: { on() {}, shouldUseDarkColors: false },
    Notification: { isSupported: () => false }
  };
  const service = {
    async startServer(port, token) {
      history.push(['start', port, token]);
      if (state.beforeStart) await state.beforeStart(port, token);
      if (port === state.failPort) throw new Error('模拟端口启动失败');
      assert.ok(Number.isInteger(port) && port > 0);
      assert.ok(!state.port || (state.port === port && state.token === token));
      state.port = port;
      state.token = token;
    },
    async stopServer() {
      history.push(['stop']);
      state.port = null;
      state.token = null;
    },
    getPort: () => state.port, getToken: () => state.token, setTodoAddedHandler() {}
  };
  const filename = path.join(__dirname, '../src-main/main.js');
  const localRequire = createRequire(filename);
  const mocks = {
    electron, './config_store': store, './local_server': service,
    './db': { initDatabase() {} }, './logger': { initLogger() {} }, './autostart': {},
    './widget_window': { setOnCloseCallback() {}, isWidgetVisible: () => false },
    './reminder': { startReminder() {}, stopReminder() {}, restartReminder() {} },
    './template_engine': {}, './quadrant_planner': {},
    child_process: { execFile: (file, args, callback) => { notifications.push({ file, args }); callback(null); } }
  };
  const sandbox = {
    __dirname: path.dirname(filename), console, setTimeout, clearTimeout,
    process: { env: {}, on() {}, platform: 'linux', versions: process.versions },
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : localRequire(id)
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  await ready;
  return { state, history, notifications, invoke: (name, ...args) => handlers.get(name)(null, ...args) };
}

async function availablePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

test('停止后信息保留配置；更新 token 不擅自启动；重新启动使用保存的配置', async (t) => {
  const { invoke, state, history } = await setup(t);
  assert.equal((await invoke('set-server-running', false)).running, false);
  let info = await invoke('get-server-info');
  assert.equal(info.port, 3210);
  assert.equal(info.token, 'original-token');
  assert.equal(info.isRunning, false);
  const newPort = await availablePort();
  assert.equal((await invoke('restart-server', newPort)).running, false);
  const rotated = await invoke('regenerate-token');
  assert.equal(rotated.success, true);
  assert.equal(history.filter(([kind]) => kind === 'start').length, 1);
  info = await invoke('get-server-info');
  assert.equal(info.port, newPort);
  assert.equal(info.token, rotated.token);
  assert.equal((await invoke('set-server-running', true)).success, true);
  assert.equal(state.port, newPort);
  assert.equal(state.token, rotated.token);
});

test('修改端口或 token 的落盘失败时，服务和配置一起回滚', async (t) => {
  const { invoke, state } = await setup(t);
  const mock = t.mock.method(fs, 'renameSync', () => { throw new Error('模拟保存失败'); });
  const result = await invoke('restart-server', await availablePort());
  assert.equal(result.success, false);
  assert.equal(state.port, 3210);
  assert.equal((await store.getConfig()).port, 3210);
  assert.equal((await invoke('regenerate-token')).success, false);
  assert.equal(state.token, 'original-token');
  assert.equal((await store.getConfig()).token, 'original-token');
  mock.mock.restore();
  assert.equal((await invoke('regenerate-token')).success, true);
});

test('启动失败后恢复旧服务，队列仍能处理后续启停', async (t) => {
  const { invoke, state, history } = await setup(t);
  state.failPort = await availablePort();
  assert.equal((await invoke('restart-server', state.failPort)).success, false);
  assert.equal(state.port, 3210);
  assert.equal((await store.getConfig()).port, 3210);
  history.length = 0;
  const results = await Promise.all([
    invoke('set-server-running', false), invoke('set-server-running', true), invoke('set-server-running', false)
  ]);
  assert.ok(results.every((result) => result.success));
  assert.deepEqual(history.map(([kind]) => kind), ['stop', 'start', 'stop']);
  assert.equal(state.port, null);
});

test('服务重启期间保存的其他设置不会被旧配置覆盖', async (t) => {
  const { invoke, state } = await setup(t);
  state.beforeStart = async () => store.saveSettings({ theme: 'dark' });
  assert.equal((await invoke('restart-server', await availablePort())).success, true);
  assert.equal(store.getSettings().theme, 'dark');
});

test('无效设置参数在保存前被拒绝，不改变已有设置', async (t) => {
  const { invoke } = await setup(t);
  const before = fs.readFileSync(store.getConfigPath(), 'utf8');
  for (const patch of [null, [], 'bad']) {
    assert.throws(() => invoke('save-settings', patch), /设置必须为对象/);
  }
  assert.equal(fs.readFileSync(store.getConfigPath(), 'utf8'), before);
  assert.equal(invoke('save-settings', {}).theme, 'system');
});

test('通知降级通过独立参数传递正文，不交给 shell 解释', async (t) => {
  const { invoke, notifications } = await setup(t);
  const title = '--help';
  const body = '引号 " $() `literal` ; 换行\n正文';
  invoke('notify', title, body);
  assert.equal(notifications[0].file, 'notify-send');
  assert.deepEqual(Array.from(notifications[0].args), ['--', title, body]);
});
