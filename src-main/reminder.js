/**
 * reminder.js
 * 到期提醒：定时扫描 remind_at / deadline 到点的未完成待办，
 * 通过系统通知提醒，并用 reminder_log 表去重（同一待办同一时间点只提醒一次）。
 *
 * 可配置项（main 进程在启动时与设置变更时传入）：
 *   - enabled      总开关
 *   - scanInterval 扫描间隔（秒）
 *   - dnd          免打扰时段 { enabled, start: 'HH:MM', end: 'HH:MM' }
 *   - sound        提醒声音
 */
const { listDueReminders, markReminderFired, listTodos } = require('./db');
const { formatDeadline } = require('./time_parser');

let timer = null;
let notifyFn = null;
let broadcastFn = null;

// 当前生效的配置（默认开启、60 秒间隔、无免打扰、无声音）
let options = {
  enabled: true,
  scanInterval: 60,
  dnd: { enabled: false, start: '22:00', end: '08:00' },
  sound: false
};

function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * 判断是否处于免打扰时段（支持跨零点，如 22:00–08:00）
 */
function inDnd(nowMinutes) {
  if (!options.dnd || !options.dnd.enabled) return false;
  const s = toMinutes(options.dnd.start);
  const e = toMinutes(options.dnd.end);
  if (s === null || e === null) return false;
  if (s === e) return false;
  if (s < e) return nowMinutes >= s && nowMinutes <= e;
  return nowMinutes >= s || nowMinutes < e;
}

/**
 * 单次扫描
 */
function scan() {
  if (!notifyFn || !options.enabled) return;

  const now = new Date();
  const until = new Date(now.getTime() + options.scanInterval * 1000).toISOString();
  const dndNow = inDnd(now.getHours() * 60 + now.getMinutes());

  const candidates = [];

  // 1) 显式设置了 remind_at 的待办
  try {
    const withRemindAt = listDueReminders(until);
    for (const t of withRemindAt) {
      candidates.push({ todo: t, fireAt: t.remind_at, kind: 'remind' });
    }
  } catch (e) {
    console.warn('[reminder] remind_at 扫描失败:', e.message);
  }

  // 2) 未设置 remind_at 但有截止时间且已过期的待办（兜底逾期提醒）
  try {
    const overdue = listTodos({ view: 'overdue', pageSize: 200 }).list;
    for (const t of overdue) {
      if (t.remind_at) continue; // 已由上面覆盖
      candidates.push({ todo: t, fireAt: t.deadline, kind: 'overdue' });
    }
  } catch (e) {
    console.warn('[reminder] 逾期扫描失败:', e.message);
  }

  const MAX_PER_SCAN = 5; // 单次最多提醒条数，避免通知风暴
  let fired = 0;
  for (const c of candidates) {
    if (fired >= MAX_PER_SCAN) break;

    // 免打扰时段：跳过弹窗，且不写去重表。
    // 若在此处仍写入去重表，免打扰期间扫到的提醒会被永久标记为「已提醒」，
    // 用户解除免打扰后再也收不到这些提醒；改为不记录，解除后即恢复正常提醒。
    if (dndNow) continue;

    let isNew = false;
    try {
      isNew = markReminderFired(c.todo.id, c.fireAt);
    } catch (e) {
      console.warn('[reminder] 写入提醒日志失败:', e.message);
      continue;
    }
    if (!isNew) continue;

    const when = formatDeadline(c.todo.deadline) || '未设置';
    notifyFn(
      c.kind === 'overdue' ? '⏰ 待办已逾期' : '🔔 待办即将到期',
      `${c.todo.title}\n截止时间：${when}`,
      options.sound
    );
    fired++;
  }

  if (fired > 0 && broadcastFn) {
    broadcastFn();
  }
}

/**
 * 启动提醒定时器
 * @param {(title: string, body: string, sound?: boolean) => void} notify
 * @param {() => void} [broadcast]
 * @param {object} [opts]
 */
function startReminder(notify, broadcast, opts) {
  notifyFn = notify;
  broadcastFn = broadcast;
  if (opts) options = mergeOptions(options, opts);

  stopReminder();
  if (!options.enabled) {
    console.log('[reminder] 提醒已关闭，未启动定时器');
    return;
  }

  timer = setInterval(() => {
    try {
      scan();
    } catch (e) {
      console.error('[reminder] 扫描异常:', e.message);
    }
  }, options.scanInterval * 1000);
  if (typeof timer.unref === 'function') timer.unref();

  // 启动后延迟 5 秒立即扫一次
  setTimeout(() => {
    try {
      scan();
    } catch (e) {
      console.error('[reminder] 首次扫描异常:', e.message);
    }
  }, 5000);

  console.log('[reminder] 提醒定时器已启动，间隔', options.scanInterval, '秒');
}

function stopReminder() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function mergeOptions(base, override) {
  const out = { ...base, ...override };
  if (override && override.dnd) out.dnd = { ...(base.dnd || {}), ...override.dnd };
  return out;
}

/**
 * 热重启：先停后启，使用新配置（供设置变更时调用）
 */
function restartReminder(opts) {
  if (opts) options = mergeOptions(options, opts);
  if (notifyFn) {
    startReminder(notifyFn, broadcastFn, options);
  }
}

module.exports = {
  startReminder,
  stopReminder,
  restartReminder,
  // 导出供测试 / 诊断使用
  inDnd,
  toMinutes
};
