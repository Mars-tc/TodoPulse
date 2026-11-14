const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { computeRemindAt } = require('../src-main/time_parser');

function setup() {
  const timers = new Map();
  let scans = 0;
  const filename = path.join(__dirname, '../src-main/reminder.js');
  const localRequire = createRequire(filename);
  const schedule = (repeat) => (callback, delay) => {
    const handle = { unref() {} };
    timers.set(handle, { repeat, callback, delay });
    return handle;
  };
  const sandbox = {
    module: { exports: {} }, console,
    require(id) {
      if (id === './db') return {
        listDueReminders() { scans++; return []; },
        markReminderFired() { return true; },
        listTodos() { return { list: [] }; }, batchDeferDeadlines() { return 0; }
      };
      if (id === './config_store') return { getSettings: () => ({}) };
      return localRequire(id);
    },
    setTimeout: schedule(false), setInterval: schedule(true),
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return { reminder: sandbox.module.exports, timers, getScans: () => scans };
}

test('停止时清理首次扫描与周期扫描，反复重启不累积定时器', () => {
  const { reminder, timers, getScans } = setup();
  reminder.startReminder(() => {}, () => {}, { enabled: true });
  assert.equal(timers.size, 2);
  reminder.restartReminder({ scanInterval: 30 });
  reminder.restartReminder({ scanInterval: 300 });
  assert.equal(timers.size, 2);
  assert.equal([...timers.values()].find((t) => t.repeat).delay, 300000);
  const [handle, initial] = [...timers].find(([, t]) => !t.repeat);
  timers.delete(handle);
  initial.callback();
  assert.equal(getScans(), 1);
  reminder.stopReminder();
  assert.equal(timers.size, 0);
  reminder.stopReminder();
  reminder.restartReminder({ enabled: false });
  assert.equal(timers.size, 0);
});

test('非法扫描间隔不会产生毫秒级忙循环或日期溢出', () => {
  const { reminder, timers } = setup();
  for (const interval of [0, -1, 'bad', NaN, Infinity, 2147484, null, { toString: null, valueOf: null }]) {
    reminder.startReminder(() => {}, null, { enabled: true, scanInterval: interval });
    const periodic = [...timers.values()].find((t) => t.repeat);
    assert.equal(periodic.delay, 60000);
    assert.doesNotThrow(() => periodic.callback());
  }
  reminder.stopReminder();
});

test('免打扰时间校验小时分钟范围，跨午夜匹配保持不变', () => {
  const { reminder } = setup();
  for (const value of ['24:00', '12:60', '99:99', 'bad', null]) {
    assert.equal(reminder.toMinutes(value), null);
  }
  assert.equal(reminder.toMinutes('23:59'), 1439);
  reminder.startReminder(() => {}, null, { dnd: { enabled: true, start: '22:00', end: '08:00' } });
  assert.equal(reminder.inDnd(23 * 60), true);
  assert.equal(reminder.inDnd(7 * 60), true);
  assert.equal(reminder.inDnd(12 * 60), false);
  reminder.stopReminder();
});

test('异常提醒提前量和日期返回 null，不抛出 RangeError', () => {
  const deadline = '2026-11-14T10:00:00.000Z';
  assert.equal(computeRemindAt(deadline, 30), '2026-11-14T09:30:00.000Z');
  assert.equal(computeRemindAt(deadline, 0), deadline);
  for (const lead of [Infinity, -Infinity, NaN, -1, 1e100, 'bad']) {
    assert.equal(computeRemindAt(deadline, lead), null);
  }
  assert.equal(computeRemindAt('invalid', 30), null);
});
