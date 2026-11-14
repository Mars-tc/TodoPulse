/**
 * main.js - Electron主进程入口
 * 负责：窗口管理、托盘常驻、数据库初始化、本地HTTP服务、到期提醒、系统通知
 * 目标平台：统信UOS x86_64 (Linux)
 */
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  Tray,
  dialog,
  nativeImage,
  Notification,
  nativeTheme
} = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { v4: uuidv4 } = require('uuid');

// 本地模块
const {
  setAppDataPath,
  loadConfig,
  getConfig,
  getConfigPath,
  getSettings,
  saveSettings,
  saveConfig,
  getDataPaths,
  generateToken,
  getScripts,
  saveScripts,
  normalizeScript
} = require('./config_store');
const logger = require('./logger');
const autostart = require('./autostart');
const db = require('./db');
const {
  startServer,
  stopServer,
  getPort,
  getToken,
  setTodoAddedHandler
} = require('./local_server');
const {
  parseDeadlineDetailed,
  computeRemindAt
} = require('./time_parser');
const { startReminder, stopReminder, restartReminder } = require('./reminder');
const repeatRule = require('./repeat_rule');
const templateEngine = require('./template_engine');
const quadrantPlanner = require('./quadrant_planner');
const widget = require('./widget_window');

// ============================================================
// UOS/Linux系统通知兼容层
// better-sqlite3在UOS下编译提示：
//   npm install (或 yarn install) 后若出现 native module 错误，
//   请执行：npx electron-rebuild -f -w better-sqlite3
// ============================================================

/**
 * 发送系统通知（兼容UOS dbus）
 * @param {string} title
 * @param {string} body
 * @param {boolean} [sound] 是否带提示音
 */
function sendSystemNotification(title, body, sound) {
  // 优先使用Electron内置Notification
  try {
    if (Notification && typeof Notification.isSupported === 'function' && !Notification.isSupported()) {
      throw new Error('当前环境不支持系统通知');
    }
    const n = new Notification({
      title,
      body,
      urgency: 'normal',
      silent: !sound
    });
    n.show();
    return;
  } catch (e) {
    console.warn('[main] Electron通知创建失败:', e.message);
  }

  // 降级：尝试通过child_process调用notify-send（Linux/UOS常见）
  try {
    const { execFile } = require('child_process');
    execFile('notify-send', ['--', String(title), String(body)], (err) => {
      if (err) console.warn('[main] notify-send also failed:', err.message);
    });
  } catch (e) {
    console.warn('[main] 无法发送系统通知:', e.message);
  }
}

/**
 * 应用主题（light / dark / system）
 * 跟随系统通过 nativeTheme.themeSource='system' 实现，并实时推送实际明暗给渲染层
 */
function applyTheme(theme) {
  try {
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme === 'dark' ? 'dark' : 'light';
  } catch (e) {
    console.warn('[main] 设置主题失败:', e.message);
  }
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
  }
}

// 系统主题变化时实时同步给渲染层
nativeTheme.on('updated', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
  }
});

/**
 * 探测端口是否可用（仅 127.0.0.1）
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let trayHintShown = false;
let serverChangeQueue = Promise.resolve();

function changeServer(operation) {
  const result = serverChangeQueue.then(operation);
  serverChangeQueue = result.catch(() => {});
  return result;
}

function getIconPath() {
  return path.join(__dirname, '../src-renderer/assets/icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 700,
    minHeight: 500,
    title: 'TodoPulse',
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 移除默认菜单栏，使用应用内控制替代
  Menu.setApplicationMenu(null);

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../src-renderer/dist/index.html'));
  }

  // 关闭行为：由设置项 startup.closeAction 决定（'tray' 最小化到托盘 / 'quit' 直接退出）
  mainWindow.on('close', (event) => {
    const action = getSettings().startup.closeAction;
    if (isQuitting || action === 'quit') return;
    event.preventDefault();
    mainWindow.hide();

    if (!trayHintShown && tray) {
      trayHintShown = true;
      tray.displayBalloon &&
        tray.displayBalloon({
          title: 'TodoPulse',
          content: '已最小化到系统托盘，点击托盘图标可重新打开'
        });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================
// 系统托盘
// ============================================================

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => showWindow()
    },
    {
      label: '新建待办',
      click: () => {
        showWindow();
        mainWindow && mainWindow.webContents.send('menu-new-todo');
      }
    },
    {
      label: '查看今日待办',
      click: () => {
        showWindow();
        mainWindow && mainWindow.webContents.send('menu-view-today');
      }
    },
    {
      label: '设置',
      click: () => {
        showWindow();
        mainWindow && mainWindow.webContents.send('menu-open-settings');
      }
    },
    {
      label: '网页脚本',
      click: () => {
        showWindow();
        mainWindow && mainWindow.webContents.send('menu-open-scripts');
      }
    },
    {
      label: '模板库',
      click: () => {
        showWindow();
        mainWindow && mainWindow.webContents.send('menu-open-templates');
      }
    },
    {
      label: '智能规划',
      click: () => {
        showWindow();
        mainWindow && mainWindow.webContents.send('menu-open-planning');
      }
    },
    {
      label: '到期悬浮窗',
      type: 'checkbox',
      checked: !!(getSettings().widget && getSettings().widget.enabled && widget.isWidgetVisible()),
      click: (item) => {
        const cur = getSettings().widget || {};
        if (item.checked) {
          saveSettings({ widget: { ...cur, enabled: true } });
          widget.showWidgetWindow();
        } else {
          saveSettings({ widget: { ...cur, enabled: false } });
          widget.hideWidgetWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: '本机服务端口：' + (getPort() || '未启动'),
      enabled: false
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => quitApp()
    }
  ]);
}

function createTray() {
  try {
    let image = nativeImage.createFromPath(getIconPath());
    if (image.isEmpty()) {
      image = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      );
    }
    tray = new Tray(image.resize({ width: 24, height: 24 }));
    tray.setToolTip('TodoPulse 待办');
    tray.setContextMenu(buildTrayMenu());

    tray.on('click', () => showWindow());
    tray.on('double-click', () => showWindow());

    console.log('[main] 系统托盘已创建');
  } catch (e) {
    // 托盘不可用（部分 Linux 环境缺少 libappindicator）时降级为普通关闭
    console.warn('[main] 托盘创建失败，将使用普通关闭行为:', e.message);
    tray = null;
  }
}

// 端口变化后刷新托盘菜单中的端口显示
function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  isQuitting = true;
  widget.closeWidgetWindow();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
}

/**
 * 向渲染进程广播数据变更
 * 改为广播所有窗口（含悬浮窗），确保主窗口与悬浮窗双向刷新
 */
function broadcastChange() {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (w && w.webContents && !w.isDestroyed()) {
      w.webContents.send('todos-changed');
    }
  });
}

// ============================================================
// 应用启动流程
// ============================================================

app.whenReady().then(async () => {
  // 1. 设置userData路径
  const userDataPath = app.getPath('userData');
  setAppDataPath(userDataPath);
  logger.initLogger(getDataPaths().logs);
  console.log('[main] userData路径:', userDataPath);

  // 2. 初始化数据库（含 v2 迁移）
  db.initDatabase(userDataPath);
  console.log('[main] 数据库初始化完成');

  // 3. 加载配置（port + token + settings）
  const config = await loadConfig();
  console.log('[main] 配置加载完成，端口:', config.port);

  // 4. 启动本地HTTP服务
  try {
    await startServer(config.port, config.token);
    setTodoAddedHandler((todo) => {
      sendSystemNotification('📋 已添加待办', todo.title);
      broadcastChange();
    });
    console.log('[main] 本地HTTP服务启动成功');
  } catch (e) {
    console.error('[main] HTTP服务启动失败:', e.message);
    // 即使服务启动失败，也继续运行应用
  }

  // 5. 创建主窗口与托盘
  createWindow();
  createTray();

  // 用户点 × 关闭悬浮窗后刷新托盘勾选
  widget.setOnCloseCallback(refreshTrayMenu);

  // 应用主题（深浅 / 跟随系统）
  applyTheme(getSettings().theme);

  // 若设置中开启了悬浮窗，则启动时自动显示
  const w = getSettings().widget;
  if (w && w.enabled) {
    try {
      widget.createWidgetWindow();
    } catch (e) {
      console.error('[main] 悬浮窗创建失败:', e.message);
    }
  }

  // 6. 启动到期提醒（加载用户配置）
  const rem = getSettings().reminder;
  startReminder(sendSystemNotification, () => broadcastChange(), {
    enabled: rem.enabled,
    scanInterval: rem.scanInterval,
    dnd: { enabled: rem.dndEnabled, start: rem.dndStart, end: rem.dndEnd },
    sound: rem.sound
  });

  // ============================================================
  // IPC 注册
  // ============================================================

  // 服务信息
  ipcMain.handle('get-server-info', async () => {
    const config = await getConfig();
    return {
      port: getPort() || config.port,
      token: getToken() || config.token,
      isRunning: !!getPort(),
      configPath: getConfigPath()
    };
  });

  // ============================================================
  // 设置相关 IPC
  // ============================================================

  // 读取设置（已与默认值合并）
  ipcMain.handle('get-settings', () => getSettings());

  // 保存设置（深合并后落盘），并按变更项热更新主进程能力
  ipcMain.handle('save-settings', (event, patch = {}) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('设置必须为对象');
    }
    const prev = getSettings();
    const next = saveSettings(patch || {});

    // 主题
    if (patch.theme && patch.theme !== prev.theme) {
      applyTheme(next.theme);
    }
    // 提醒配置
    if (patch.reminder) {
      const r = next.reminder;
      restartReminder({
        enabled: r.enabled,
        scanInterval: r.scanInterval,
        dnd: { enabled: r.dndEnabled, start: r.dndStart, end: r.dndEnd },
        sound: r.sound
      });
    }
    // 开机自启
    if (patch.startup && patch.startup.autoLaunch !== undefined) {
      autostart.setAutoLaunch(!!next.startup.autoLaunch);
    }
    // 悬浮窗设置变更（如不透明度）时通知悬浮窗实时生效
    if (patch.widget) {
      widget.notifySettingsChanged();
    }
    // 关闭行为 / 密度 / 字号：仅落盘，运行时由渲染层或关闭事件读取
    return next;
  });

  // ============================================================
  // 网页匹配脚本 IPC
  // ============================================================

  // 读取全部脚本（含未启用，供管理页展示）
  ipcMain.handle('get-scripts', () => getScripts());

  // 整体覆盖保存脚本列表
  ipcMain.handle('save-scripts', (event, list) => saveScripts(list));

  // 校验脚本：JS 模式尝试构造函数（不执行），选择器模式校验选择器非空
  ipcMain.handle('validate-script', (event, payload) => {
    const p = payload || {};
    if (p.mode === 'js') {
      if (!p.code || !String(p.code).trim()) {
        return { success: false, error: '代码为空' };
      }
      try {
        // 仅构造不执行，用于语法校验
        new Function('doc', 'url', 'selection', String(p.code));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    const fields = p.fields || {};
    const hasField = Object.keys(fields).some((k) => fields[k] && fields[k].selector);
    if (!hasField) return { success: false, error: '至少配置一个字段的选择器' };
    // 任一维度非空（URL 通配 patterns 或高级匹配 match）即视为有效
    const hasPattern = Array.isArray(p.patterns) && p.patterns.some((x) => String(x).trim());
    const match = p.match && typeof p.match === 'object' ? p.match : {};
    const hasMatch = Object.keys(match).some((k) => Array.isArray(match[k]) && match[k].some((x) => String(x).trim()));
    if (!hasPattern && !hasMatch) {
      return { success: false, error: '至少填写一条 URL 规则或高级匹配条件' };
    }
    return { success: true };
  });

  // 生成脚本模板（供管理页「插入示例」按钮使用）
  ipcMain.handle('get-script-template', () => ({
    fields: { title: { selector: '', attr: 'text', attrName: '' } },
    code: [
      '// 可用变量：doc（网页文档）、url（当前网址）、selection（选中的文本）',
      '// 需返回一个对象，支持字段：title / description / deadline / priority',
      'const titleEl = doc.querySelector("h1");',
      'return {',
      '  title: titleEl ? titleEl.textContent.trim() : doc.title,',
      '  description: selection || "",',
      '  priority: "medium"',
      '};'
    ].join('\n')
  }));

  // ============================================================
  // 到期悬浮窗 IPC
  // ============================================================

  // 拉取到期看板数据（三段互斥）
  ipcMain.handle('get-widget-data', () => {
    try {
      const w = getSettings().widget || {};
      return db.getDueBoard({ includeCompleted: !!w.showCompleted });
    } catch (e) {
      console.error('[main] 悬浮窗数据查询失败:', e.message);
      return { overdue: [], today: [], week: [], rangeEnd: null, updatedAt: new Date().toISOString() };
    }
  });

  // 开关悬浮窗：落盘 enabled 并创建 / 隐藏
  ipcMain.handle('set-widget-enabled', (event, enabled) => {
    const cur = getSettings().widget || {};
    saveSettings({ widget: { ...cur, enabled: !!enabled } });
    if (enabled) widget.showWidgetWindow();
    else widget.hideWidgetWindow();
    refreshTrayMenu();
    widget.notifySettingsChanged();
    return { success: true, enabled: !!enabled };
  });

  // 悬浮窗行为收口：refresh / close / open-main
  ipcMain.handle('widget-action', (event, action) => {
    if (action === 'close') {
      widget.hideWidgetWindow();
      saveSettings({ widget: { ...getSettings().widget, enabled: false } });
      refreshTrayMenu();
    } else if (action === 'open-main') {
      showWindow();
    }
    // refresh 由渲染层自行 get-widget-data，无需主进程介入
    return { success: true };
  });

  // 从悬浮窗点击事项：显示主窗口并通知定位（附带标题供列表筛选）
  ipcMain.handle('focus-todo', (event, id) => {
    showWindow();
    let title = '';
    try {
      const t = db.getTodoById(id);
      if (t) title = t.title || '';
    } catch (e) {
      console.error('[main] focus-todo 查询失败:', e.message);
    }
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('focus-todo', { id, title });
    }
    return { success: true };
  });

  // ============================================================
  // 批量操作 & 日历 & 自动分类 IPC
  // ============================================================

  ipcMain.handle('batch-update-category', (_event, ids, categoryId) => {
    try { return db.batchUpdateCategory(ids, categoryId); }
    catch (e) { console.error('[main] batch-update-category 失败:', e.message); throw e; }
  });

  ipcMain.handle('batch-update-priority', (_event, ids, priority) => {
    try { return db.batchUpdatePriority(ids, priority); }
    catch (e) { console.error('[main] batch-update-priority 失败:', e.message); throw e; }
  });

  ipcMain.handle('list-todos-by-deadline', (_event, year, month) => {
    try { return db.listTodosByDeadline(year, month); }
    catch (e) { console.error('[main] list-todos-by-deadline 失败:', e.message); throw e; }
  });

  ipcMain.handle('auto-categorize', (_event, title, rules) => {
    try { return db.autoCategorize(title, rules || []); }
    catch (e) { console.error('[main] auto-categorize 失败:', e.message); throw e; }
  });

  // 应用信息（关于页）
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chromium: process.versions.chrome,
    platform: process.platform,
    arch: process.arch
  }));

  // 关键路径
  ipcMain.handle('get-data-paths', () => getDataPaths());

  // 打开数据目录
  ipcMain.handle('open-data-dir', () => {
    const dir = getDataPaths().userData;
    try {
      shell.openPath(dir);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 开机自启
  ipcMain.handle('get-autostart', () => ({ enabled: autostart.isAutoLaunchEnabled() }));
  ipcMain.handle('set-autostart', (event, enabled) => autostart.setAutoLaunch(!!enabled));

  // 重启本地服务（端口修改，失败回滚）
  ipcMain.handle('restart-server', (event, port) => changeServer(async () => {
    const newPort = Number(port);
    if (!Number.isInteger(newPort) || newPort <= 0 || newPort > 65535) {
      return { success: false, error: '端口号无效' };
    }
    const oldPort = getPort();
    const oldToken = getToken();
    const wasRunning = !!oldPort;
    if (newPort !== oldPort && !(await isPortAvailable(newPort))) {
      return { success: false, error: '端口已被占用' };
    }

    try {
      if (wasRunning) {
        await stopServer();
        await startServer(newPort, oldToken);
      }
      saveConfig({ ...(await getConfig()), port: newPort });
      refreshTrayMenu();
      return { success: true, port: newPort, running: wasRunning };
    } catch (e) {
      if (wasRunning) {
        try {
          await stopServer();
          await startServer(oldPort, oldToken);
        } catch (rollbackError) {
          console.error('[main] 恢复本地服务失败:', rollbackError.message);
        }
      }
      refreshTrayMenu();
      return { success: false, error: e.message };
    }
  }));

  // 重新生成 Token（落盘并重启服务）
  ipcMain.handle('regenerate-token', () => changeServer(async () => {
    const newToken = generateToken();
    const oldPort = getPort();
    const oldToken = getToken();
    try {
      if (oldPort) {
        await stopServer();
        await startServer(oldPort, newToken);
      }
      saveConfig({ ...(await getConfig()), token: newToken });
      refreshTrayMenu();
      return { success: true, token: newToken };
    } catch (e) {
      if (oldPort) {
        try {
          await stopServer();
          await startServer(oldPort, oldToken);
        } catch (rollbackError) {
          console.error('[main] 恢复本地服务失败:', rollbackError.message);
        }
      }
      refreshTrayMenu();
      return { success: false, error: e.message };
    }
  }));

  // 本地服务启停开关
  ipcMain.handle('set-server-running', (event, running) => changeServer(async () => {
    try {
      if (running) {
        const cfg = await getConfig();
        await startServer(cfg.port, cfg.token);
      } else {
        await stopServer();
      }
      refreshTrayMenu();
      return { success: true, running: !!getPort() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }));

  // 重复规则预览：与主进程生成下一轮走同一实现，避免预览与实际不一致
  ipcMain.handle('compute-repeat-next', (event, fromISO, rule) => {
    try {
      return { success: true, next: repeatRule.previewNextDate(fromISO, rule) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 运行日志
  ipcMain.handle('get-logs', (event, n) => ({ logs: logger.getLogs(Number(n) || 100) }));
  ipcMain.handle('clear-logs', () => {
    logger.clearLogs();
    return { success: true };
  });

  // 发送测试通知（验证提醒配置）
  ipcMain.handle('test-notification', () => {
    sendSystemNotification('🔔 测试通知', '这是一条测试通知，用于验证提醒设置是否生效。', getSettings().reminder.sound);
    return { success: true };
  });

  // 清空全部待办数据（UI 已做二次确认；保留分类）
  ipcMain.handle('clear-all-data', () => {
    try {
      db.clearAllData();
      broadcastChange();
      return { success: true };
    } catch (e) {
      console.error('[main] 清空全部数据失败:', e.message);
      return { success: false, error: e.message };
    }
  });

  // ---- 待办 ----
  ipcMain.handle('get-todos', (event, options) => db.listTodos(options || {}));
  ipcMain.handle('get-counts', (event, options) => db.getCounts(options || {}));

  ipcMain.handle('add-todo', (event, todo) => {
    // 自然语言时间只取「用户显式输入的那一段」（nlpText）；
    // 若用整个标题+描述去解析，用户点了「清除截止时间」也会被重新解析出来，导致清除无效。
    // nlpText 缺省时回落 rawText，兼容扩展等旧调用方。
    const nlSource = todo.nlpText !== undefined ? (todo.nlpText || '') : (todo.rawText || '');
    const parsed = parseDeadlineDetailed(nlSource);
    let deadline = todo.deadline || parsed.deadline || null;
    const lead = todo.remind_lead === undefined || todo.remind_lead === null || todo.remind_lead === ''
      ? null
      : Number(todo.remind_lead);

    const inserted = db.insertTodo({
      ...todo,
      id: todo.id || uuidv4(),
      deadline,
      remind_lead: lead,
      remind_at: deadline && lead !== null ? computeRemindAt(deadline, lead) : (todo.remind_at || null),
      create_at: new Date().toISOString()
    });

    if (Array.isArray(todo.subtasks)) {
      db.replaceSubtasks(inserted.id, todo.subtasks);
    }

    // 自动分类：匹配用户配置的规则
    try {
      const settings = getSettings();
      const rules = settings?.auto_categorize_rules || [];
      if (rules.length > 0) {
        const matchCatId = db.autoCategorize(todo.title, rules);
        if (matchCatId && matchCatId !== (todo.category_id || '')) {
          db.updateTodo(inserted.id, { category_id: matchCatId });
          console.log('[main] 自动分类匹配:', todo.title, '→', matchCatId);
        }
      }
    } catch (e) {
      console.warn('[main] 自动分类失败:', e.message);
    }

    return db.getTodoById(inserted.id);
  });

  ipcMain.handle('update-todo', (event, id, updates) => {
    const patch = { ...(updates || {}) };

    // 截止时间或提前量变化时，同步重算提醒时间
    if (patch.deadline !== undefined || patch.remind_lead !== undefined) {
      const current = db.getTodoById(id);
      const deadline = patch.deadline !== undefined ? patch.deadline : (current && current.deadline);
      const leadRaw = patch.remind_lead !== undefined ? patch.remind_lead : (current && current.remind_lead);
      const lead = leadRaw === null || leadRaw === undefined || leadRaw === '' ? null : Number(leadRaw);
      patch.remind_at = deadline && lead !== null ? computeRemindAt(deadline, lead) : null;
    }

    // 完成状态变更时维护 completed_at
    if (patch.completed !== undefined) {
      patch.completed_at = patch.completed ? new Date().toISOString() : null;
    }

    const updated = db.updateTodo(id, patch);

    if (Array.isArray(patch.subtasks)) {
      db.replaceSubtasks(id, patch.subtasks);
    }

    // 重复任务：勾完成自动生成下一轮
    if (patch.completed === true && db.isRecurring(updated)) {
      const next = db.completeRecurringTodo(id);
      if (next) console.log('[main] 已生成下一轮重复待办:', next.id);
    }

    return db.getTodoById(id);
  });

  ipcMain.handle('delete-todo', (event, id) => db.deleteTodo(id));
  ipcMain.handle('batch-delete-todos', (event, ids) => db.batchDeleteTodos(ids));

  // ---- 回收站 ----
  ipcMain.handle('soft-delete-todos', (event, ids) => db.softDeleteTodos(ids));
  ipcMain.handle('restore-todos', (event, ids) => db.restoreTodos(ids));
  ipcMain.handle('list-trash', () => db.listTrash());
  // 统一返回 { success, deleted }，调用方按 success 判断（此前直接返回数字，导致判断恒真）
  ipcMain.handle('purge-trash', () => {
    try {
      const deleted = db.purgeTrash();
      broadcastChange();
      return { success: true, deleted: Number(deleted) || 0 };
    } catch (e) {
      console.error('[main] 清空回收站失败:', e.message);
      return { success: false, error: e.message, deleted: 0 };
    }
  });

  // ---- 分类 ----
  ipcMain.handle('list-categories', () => db.listCategories());
  ipcMain.handle('add-category', (event, payload) => db.insertCategory(payload || {}));
  ipcMain.handle('update-category', (event, id, patch) => db.updateCategory(id, patch || {}));
  ipcMain.handle('delete-category', (event, id) => db.deleteCategory(id));

  // ---- 子任务 ----
  ipcMain.handle('list-subtasks', (event, todoId) => db.listSubtasks(todoId));
  ipcMain.handle('add-subtask', (event, payload) => db.insertSubtask(payload || {}));
  ipcMain.handle('update-subtask', (event, id, patch) => db.updateSubtask(id, patch || {}));
  ipcMain.handle('delete-subtask', (event, id) => db.deleteSubtask(id));
  ipcMain.handle('replace-subtasks', (event, todoId, titles) => db.replaceSubtasks(todoId, titles || []));

  // ---- 重复规则 ----
  ipcMain.handle('complete-recurring', (event, id) => db.completeRecurringTodo(id));

  // ---- 模板 ----
  /**
   * 模板展开上下文：分类名映射、目标日期、id 生成器
   * id 统一由主进程注入，与待办 id 来源保持一致
   */
  function buildTemplateContext(tpl, options = {}) {
    const categories = db.listCategories();
    const categoryIdMap = {};
    const categoryNames = {};
    for (const c of categories) {
      categoryIdMap[c.id] = c.id;
      categoryIdMap[c.name] = c.id;
      categoryNames[c.id] = c.name;
    }
    return {
      now: new Date(),
      targetDate: options.targetDate || undefined,
      deadlineTime: options.deadlineTime || '18:00',
      categoryIdMap,
      categoryName: categoryNames[tpl && tpl.category_id] || '',
      idFactory: () => uuidv4()
    };
  }

  ipcMain.handle('list-templates', () => db.listTemplates());
  ipcMain.handle('get-template', (event, id) => db.getTemplateById(id));

  ipcMain.handle('save-template', (event, payload) => {
    try {
      const data = payload || {};
      if (data.id && db.getTemplateById(data.id)) {
        const existing = db.getTemplateById(data.id);
        // 内置模板只读：需先复制为自定义模板再编辑
        if (existing && existing.builtin) {
          return { error: '内置模板为只读，请复制为自定义模板后再编辑' };
        }
        return db.updateTemplate(data.id, data);
      }
      return db.insertTemplate(data);
    } catch (e) {
      console.error('[main] 保存模板失败:', e.message);
      return null;
    }
  });

  ipcMain.handle('delete-template', (event, id) => {
    try {
      const tpl = db.getTemplateById(id);
      // 内置模板受保护：只读、不可删除，仅可复制为自定义模板
      if (tpl && tpl.builtin) {
        return { success: false, error: '内置模板不可删除，可复制为自定义模板' };
      }
      db.deleteTemplate(id);
      return { success: true };
    } catch (e) {
      console.error('[main] 删除模板失败:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('duplicate-template', (event, id) => {
    try {
      const src = db.getTemplateById(id);
      if (!src) return null;
      return db.insertTemplate({
        ...src,
        id: undefined,
        name: `${src.name || '未命名模板'} 副本`,
        builtin: 0,
        items: (src.items || []).map((it) => ({
          title: it.title,
          kind: it.kind,
          sort_order: it.sort_order
        }))
      });
    } catch (e) {
      console.error('[main] 复制模板失败:', e.message);
      return null;
    }
  });

  ipcMain.handle('preview-template', (event, id) => {
    const tpl = db.getTemplateById(id);
    if (!tpl) return { todos: [], warnings: ['模板不存在'] };
    return templateEngine.expandTemplate(tpl, buildTemplateContext(tpl));
  });

  ipcMain.handle('apply-template', (event, id, options = {}) => {
    try {
      const tpl = db.getTemplateById(id);
      if (!tpl) return { success: false, error: '模板不存在', created: [], warnings: [] };
      if (!tpl.enabled) return { success: false, error: '模板已停用', created: [], warnings: [] };

      const result = templateEngine.expandTemplate(tpl, buildTemplateContext(tpl, options));
      if (!result.todos.length) {
        return {
          success: false,
          error: result.warnings[0] || '模板没有可生成的内容',
          created: [],
          warnings: result.warnings
        };
      }
      const created = db.insertTodosBatch(result.todos);
      broadcastChange();
      console.log('[main] 已从模板生成待办:', created.length);
      return { success: true, created, warnings: result.warnings };
    } catch (e) {
      console.error('[main] 应用模板失败:', e.message);
      return { success: false, error: e.message, created: [], warnings: [] };
    }
  });

  // ---- 智能规划 ----
  function getPlanningSettings() {
    const settings = getSettings() || {};
    const planning = settings.planning || {};
    const defaultSlots = [
      { label: '上午高能', start: '08:00', end: '12:00', energy: 'high' },
      { label: '午后中等', start: '13:00', end: '18:00', energy: 'medium' },
      { label: '晚间低能', start: '19:00', end: '22:00', energy: 'low' }
    ];
    return {
      daily_capacity_minutes:
        Number(planning.daily_capacity_minutes) > 0 ? Number(planning.daily_capacity_minutes) : 240,
      default_estimate_minutes:
        Number(planning.default_estimate_minutes) > 0 ? Number(planning.default_estimate_minutes) : 30,
      urgent_within_days: Number(planning.urgent_within_days) > 0 ? Number(planning.urgent_within_days) : 3,
      auto_defer_enabled: !!planning.auto_defer_enabled,
      auto_defer_strategy: planning.auto_defer_strategy || 'today',
      quadrant_suggest_enabled: planning.quadrant_suggest_enabled !== false,
      energy_slots:
        Array.isArray(planning.energy_slots) && planning.energy_slots.length
          ? planning.energy_slots
          : defaultSlots
    };
  }

  ipcMain.handle('plan-preview', (event) => {
    try {
      const now = new Date();
      const planning = getPlanningSettings();
      const all = db.listTodos({ status: 'pending', pageSize: 1000 }).list;
      // 未归类待办附带象限建议（仅建议，不落库；用户采纳后才写入 quadrant）
      for (const t of all) {
        if (t.quadrant) continue;
        const s = quadrantPlanner.suggestQuadrant(t, now, { urgentWithinDays: planning.urgent_within_days });
        t.suggested_quadrant = s.quadrant;
        t.suggested_reason = s.reason;
      }
      const quadrants = quadrantPlanner.buildQuadrants(all);
      const plan = quadrantPlanner.planToday(all, planning, now);
      const overdue = all
        .filter((t) => quadrantPlanner.isOverdue(t, now))
        .map((t) => {
          const dl = new Date(t.deadline);
          const days = Math.max(1, Math.ceil((now.getTime() - dl.getTime()) / 86400000));
          return { id: t.id, title: t.title, deadline: t.deadline, overdueDays: days };
        });
      return { quadrants, plan, overdue, settings: planning };
    } catch (e) {
      console.error('[main] 生成规划预览失败:', e.message);
      return {
        quadrants: { Q1: [], Q2: [], Q3: [], Q4: [], unclassified: [] },
        plan: { items: [], overflow: [], usedMinutes: 0, capacityMinutes: 0 },
        overdue: [],
        settings: getPlanningSettings(),
        error: e.message
      };
    }
  });

  ipcMain.handle('defer-overdue', (event, options = {}) => {
    try {
      const planning = getPlanningSettings();
      const strategy = options.strategy || planning.auto_defer_strategy || 'today';
      const now = new Date();
      const all = db.listTodos({ status: 'pending', pageSize: 1000 }).list;
      const overdue = all.filter((t) => quadrantPlanner.isOverdue(t, now));
      const targets = quadrantPlanner.resolveDeferTargets(overdue, strategy, now);
      const changed = db.batchDeferDeadlines(targets);
      if (changed > 0) broadcastChange();
      return { success: true, changed, total: overdue.length, strategy, targets };
    } catch (e) {
      console.error('[main] 顺延逾期待办失败:', e.message);
      return { success: false, error: e.message, changed: 0, total: 0 };
    }
  });

  ipcMain.handle('apply-suggested-quadrant', (event, ids) => {
    try {
      if (!Array.isArray(ids) || !ids.length) return { success: true, changed: 0 };
      const now = new Date();
      const planning = getPlanningSettings();
      const wanted = ids.map(String);
      const all = db.listTodos({ status: 'pending', pageSize: 1000 }).list;
      let changed = 0;
      for (const t of all) {
        if (!wanted.includes(t.id)) continue;
        if (t.quadrant) continue; // 已归类的条目不覆盖用户意图
        const suggestion = quadrantPlanner.suggestQuadrant(t, now, {
          urgentWithinDays: planning.urgent_within_days
        });
        db.updateTodo(t.id, { quadrant: suggestion.quadrant });
        changed++;
      }
      if (changed > 0) broadcastChange();
      return { success: true, changed };
    } catch (e) {
      console.error('[main] 采纳象限建议失败:', e.message);
      return { success: false, error: e.message, changed: 0 };
    }
  });

  // ---- 统计 ----
  ipcMain.handle('get-stats', () => db.getStats());

  // ---- 时间解析 ----
  ipcMain.handle('parse-deadline-text', (event, text) => parseDeadlineDetailed(text));

  // ---- 导入导出 ----
  ipcMain.handle('export-data', async (event, format = 'json') => {
    const isCsv = format === 'csv';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: isCsv ? '导出待办为 CSV' : '导出数据备份',
      defaultPath: isCsv ? 'todopulse.csv' : `todopulse-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: isCsv
        ? [{ name: 'CSV 文件', extensions: ['csv'] }]
        : [{ name: 'JSON 文件', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };

    try {
      const content = isCsv ? db.exportCsv() : JSON.stringify(db.exportAll(), null, 2);
      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (e) {
      console.error('[main] 导出失败:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('import-data', async (event, mode = 'merge') => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择备份文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePaths || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
      const payload = JSON.parse(raw);
      const res = db.importAll(payload, mode === 'replace' ? 'replace' : 'merge');
      broadcastChange();
      return { success: true, ...res };
    } catch (e) {
      console.error('[main] 导入失败:', e.message);
      return { success: false, error: e.message };
    }
  });

  // ---- 系统能力 ----
  ipcMain.handle('open-url', (event, url) => {
    if (url) shell.openExternal(url);
  });

  // 浏览器扩展目录：打包后位于 resources/browser-extension，开发期位于仓库根目录
  function getExtensionDir() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'browser-extension')
      : path.join(__dirname, '../browser-extension');
  }

  ipcMain.handle('get-extension-dir', () => getExtensionDir());

  ipcMain.handle('open-extension-dir', () => {
    shell.openPath(getExtensionDir());
  });

  ipcMain.handle('show-window', () => showWindow());
  ipcMain.handle('quit-app', () => quitApp());

  ipcMain.handle('notify', (event, title, body) => {
    sendSystemNotification(title, body || '');
  });
});

// ============================================================
// 优雅关闭
// ============================================================

// 清理只做一次；Electron 不会等待 will-quit 里的 Promise，
// 因此把清理放在 before-quit 并 preventDefault，完成后再主动 app.quit()
let cleanupDone = false;

async function cleanupResources() {
  if (cleanupDone) return;
  cleanupDone = true;
  console.log('[main] 应用退出，正在清理资源...');
  try {
    stopReminder();
  } catch (e) {
    console.warn('[main] 停止提醒失败:', e.message);
  }
  try {
    // 有 keep-alive 连接时 server.close() 可能迟迟不回调，加超时兜底
    await Promise.race([
      changeServer(() => stopServer()),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
  } catch (e) {
    console.warn('[main] 关闭本地服务失败:', e.message);
  }
  try {
    db.closeDatabase();
  } catch (e) {
    console.warn('[main] 关闭数据库失败:', e.message);
  }
  console.log('[main] 资源清理完成');
}

app.on('will-quit', () => {
  // 兜底：走到这里说明清理尚未完成（如 before-quit 未触发），同步收尾
  if (!cleanupDone) {
    try {
      stopReminder();
      db.closeDatabase();
    } catch (e) {
      console.warn('[main] 退出兜底清理失败:', e.message);
    }
  }
});

app.on('window-all-closed', () => {
  // 托盘常驻：仅显式退出时才结束应用
  if (isQuitting) {
    app.quit();
    return;
  }
  if (!tray && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    showWindow();
  }
});

app.on('before-quit', (event) => {
  isQuitting = true;
  if (cleanupDone) return;
  // 拦截退出，等资源清理完成后再真正退出
  event.preventDefault();
  cleanupResources().then(() => app.quit());
});

// 处理未捕获异常
process.on('uncaughtException', (err) => {
  console.error('[main] 未捕获异常:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[main] 未处理的Promise拒绝:', err);
});
