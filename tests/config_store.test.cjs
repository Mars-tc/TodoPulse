const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../src-main/config_store');

function setup(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todopulse-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  store.setAppDataPath(dir);
  const file = store.getConfigPath();
  fs.writeFileSync(file, JSON.stringify({ port: 3210, token: 'test-token', ...overrides }));
  return { dir, file };
}

test('修复 token 时保留脚本、未知配置及已有设置', async (t) => {
  setup(t, {
    token: '', extra: { enabled: true }, settings: { theme: 'dark' },
    scripts: [{ id: 'script-1', name: '保存的脚本', patterns: ['*'], updatedAt: '2026-01-01' }]
  });
  const config = await store.loadConfig();
  assert.match(config.token, /^[a-f0-9]{32}$/);
  assert.equal(config.settings.theme, 'dark');
  assert.deepEqual(config.extra, { enabled: true });
  assert.equal(config.scripts[0].id, 'script-1');
  assert.equal(config.scripts[0].updatedAt, '2026-01-01');
});

test('损坏的嵌套设置恢复默认结构且过滤原型键', async (t) => {
  setup(t, { settings: JSON.parse('{"reminder":null,"startup":[],"widget":false,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}') });
  const config = await store.loadConfig();
  assert.equal(config.settings.reminder.scanInterval, 60);
  assert.equal(config.settings.startup.closeAction, 'tray');
  assert.equal(config.settings.widget.width, 320);
  assert.equal(config.settings.polluted, undefined);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(config.settings, '__proto__'), false);
});

test('设置数组可清空或替换，错误结构不会破坏默认数组', async (t) => {
  setup(t, { settings: { planning: { energy_slots: null } } });
  await store.loadConfig();
  assert.equal(store.getSettings().planning.energy_slots.length, 3);
  store.saveSettings({ planning: { energy_slots: [] } });
  assert.deepEqual(store.getSettings().planning.energy_slots, []);
  store.saveSettings({ planning: { energy_slots: [{ label: '自定义' }] } });
  assert.deepEqual(store.getSettings().planning.energy_slots, [{ label: '自定义' }]);
});

test('读取结果和保存参数不暴露内部缓存引用', async (t) => {
  setup(t);
  const loaded = await store.loadConfig();
  loaded.settings.reminder.enabled = false;
  const settings = store.getSettings();
  settings.planning.energy_slots[0].label = 'changed';
  assert.equal(store.getSettings().reminder.enabled, true);
  assert.equal(store.getSettings().planning.energy_slots[0].label, '上午高能');
  const config = await store.getConfig();
  config.port = 4321;
  assert.equal((await store.getConfig()).port, 3210);
  store.saveConfig(config);
  config.port = 5432;
  assert.equal((await store.getConfig()).port, 4321);
  const scripts = store.saveScripts([{ id: 'a', patterns: ['*'] }]);
  scripts[0].patterns.push('changed');
  assert.deepEqual(store.getScripts()[0].patterns, ['*']);
});

for (const method of ['writeFileSync', 'fsyncSync', 'renameSync']) {
  test(`${method} 失败不破坏原文件或设置缓存，临时文件被清理`, async (t) => {
    const { dir, file } = setup(t);
    await store.loadConfig();
    const before = fs.readFileSync(file, 'utf8');
    const mock = t.mock.method(fs, method, (fd) => {
      if (method === 'writeFileSync') fs.writeSync(fd, '{partial');
      throw Object.assign(new Error('模拟磁盘写入失败'), { code: 'EIO' });
    });
    assert.throws(() => store.saveSettings({ theme: 'dark' }), /模拟磁盘写入失败/);
    assert.throws(() => store.saveScripts([{ name: '未保存' }]), /模拟磁盘写入失败/);
    mock.mock.restore();
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(store.getSettings().theme, 'system');
    assert.deepEqual(store.getScripts(), []);
    assert.deepEqual(fs.readdirSync(dir), ['config.json']);
    store.saveSettings({ theme: 'dark' });
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).settings.theme, 'dark');
  });
}

test('无效 JSON 保留原始副本后恢复，读取权限错误不覆盖文件', async (t) => {
  const { dir, file } = setup(t);
  fs.writeFileSync(file, '{broken');
  const config = await store.loadConfig();
  assert.ok(config.port > 0);
  const backup = fs.readdirSync(dir).find((name) => name.startsWith('config.json.corrupt-'));
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(dir, backup), 'utf8'), '{broken');
  const before = fs.readFileSync(file, 'utf8');
  const original = fs.readFileSync;
  const mock = t.mock.method(fs, 'readFileSync', (target, ...args) => {
    if (target === file) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    return original(target, ...args);
  });
  await assert.rejects(store.loadConfig(), /permission denied/);
  mock.mock.restore();
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal((await store.getConfig()).token, config.token);
});

test('切换数据目录不会使用上一目录的缓存，默认设置不受外部修改影响', async (t) => {
  setup(t, { settings: { theme: 'dark' } });
  await store.loadConfig();
  setup(t);
  store.getSettings().reminder.enabled = false;
  assert.equal(store.getSettings().reminder.enabled, true);
  assert.equal((await store.getConfig()).settings.theme, 'system');
});
