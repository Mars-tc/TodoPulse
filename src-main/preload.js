/**
 * preload.js - 预加载脚本，暴露安全API给渲染进程
 * 保持最小暴露面：仅包装 ipcRenderer.invoke / on，不暴露任何 Node 能力
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('electronAPI', {
  // 获取服务信息（端口、token等）
  getServerInfo: invoke('get-server-info'),

  // 待办CRUD
  getTodos: invoke('get-todos'),
  getCounts: invoke('get-counts'),
  addTodo: invoke('add-todo'),
  updateTodo: invoke('update-todo'),
  deleteTodo: invoke('delete-todo'),
  batchDeleteTodos: invoke('batch-delete-todos'),

  // 回收站（软删除）
  softDeleteTodos: invoke('soft-delete-todos'),
  restoreTodos: invoke('restore-todos'),
  listTrash: invoke('list-trash'),
  purgeTrash: invoke('purge-trash'),

  // 分类
  listCategories: invoke('list-categories'),
  addCategory: invoke('add-category'),
  updateCategory: invoke('update-category'),
  deleteCategory: invoke('delete-category'),

  // 子任务
  listSubtasks: invoke('list-subtasks'),
  addSubtask: invoke('add-subtask'),
  updateSubtask: invoke('update-subtask'),
  deleteSubtask: invoke('delete-subtask'),
  replaceSubtasks: invoke('replace-subtasks'),

  // 重复规则
  completeRecurring: invoke('complete-recurring'),

  // 统计
  getStats: invoke('get-stats'),

  // 时间解析（自然语言）
  parseDeadlineText: invoke('parse-deadline-text'),

  // 导入导出
  exportData: invoke('export-data'),
  importData: invoke('import-data'),

  // 系统能力
  openUrl: invoke('open-url'),
  openExtensionDir: invoke('open-extension-dir'),
  showWindow: invoke('show-window'),
  quitApp: invoke('quit-app'),
  notify: invoke('notify'),

  // 设置相关
  getSettings: invoke('get-settings'),
  saveSettings: invoke('save-settings'),
  getAppInfo: invoke('get-app-info'),
  getDataPaths: invoke('get-data-paths'),
  openDataDir: invoke('open-data-dir'),
  getExtensionDir: invoke('get-extension-dir'),
  getAutostart: invoke('get-autostart'),
  setAutostart: invoke('set-autostart'),
  restartServer: invoke('restart-server'),
  regenerateToken: invoke('regenerate-token'),
  setServerRunning: invoke('set-server-running'),
  getLogs: invoke('get-logs'),
  clearLogs: invoke('clear-logs'),
  testNotification: invoke('test-notification'),
  clearAllData: invoke('clear-all-data'),
  computeRepeatNext: invoke('compute-repeat-next'),

  // 网页匹配脚本
  getScripts: invoke('get-scripts'),
  saveScripts: invoke('save-scripts'),
  validateScript: invoke('validate-script'),
  getScriptTemplate: invoke('get-script-template'),

  // 到期悬浮窗
  getWidgetData: invoke('get-widget-data'),
  setWidgetEnabled: invoke('set-widget-enabled'),
  widgetAction: invoke('widget-action'),
  focusTodo: invoke('focus-todo'),

  // 批量操作 & 日历 & 自动分类
  batchUpdateCategory: (ids, categoryId) => ipcRenderer.invoke('batch-update-category', ids, categoryId),
  batchUpdatePriority: (ids, priority) => ipcRenderer.invoke('batch-update-priority', ids, priority),
  listTodosByDeadline: (year, month) => ipcRenderer.invoke('list-todos-by-deadline', year, month),
  autoCategorize: (title, rules) => ipcRenderer.invoke('auto-categorize', title, rules),

  // 任务模板与清单预设
  listTemplates: invoke('list-templates'),
  getTemplate: invoke('get-template'),
  saveTemplate: invoke('save-template'),
  deleteTemplate: invoke('delete-template'),
  duplicateTemplate: invoke('duplicate-template'),
  previewTemplate: invoke('preview-template'),
  applyTemplate: invoke('apply-template'),

  // 智能规划（四象限 / 今日排期 / 逾期顺延）
  planPreview: invoke('plan-preview'),
  deferOverdue: invoke('defer-overdue'),
  applySuggestedQuadrant: invoke('apply-suggested-quadrant'),

  // 主进程事件订阅，返回取消订阅函数
  onTodosChanged: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('todos-changed', handler);
    return () => ipcRenderer.removeListener('todos-changed', handler);
  },
  onMenuNewTodo: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('menu-new-todo', handler);
    return () => ipcRenderer.removeListener('menu-new-todo', handler);
  },
  onMenuViewToday: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('menu-view-today', handler);
    return () => ipcRenderer.removeListener('menu-view-today', handler);
  },
  onMenuOpenSettings: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('menu-open-settings', handler);
    return () => ipcRenderer.removeListener('menu-open-settings', handler);
  },
  onMenuOpenScripts: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('menu-open-scripts', handler);
    return () => ipcRenderer.removeListener('menu-open-scripts', handler);
  },
  onMenuOpenTemplates: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('menu-open-templates', handler);
    return () => ipcRenderer.removeListener('menu-open-templates', handler);
  },
  onMenuOpenPlanning: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('menu-open-planning', handler);
    return () => ipcRenderer.removeListener('menu-open-planning', handler);
  },
  onFocusTodo: (callback) => {
    const handler = (_e, payload) => callback && callback(payload);
    ipcRenderer.on('focus-todo', handler);
    return () => ipcRenderer.removeListener('focus-todo', handler);
  },
  onWidgetSettingsChanged: (callback) => {
    const handler = () => callback && callback();
    ipcRenderer.on('widget-settings-changed', handler);
    return () => ipcRenderer.removeListener('widget-settings-changed', handler);
  },
  onThemeChanged: (callback) => {
    const handler = (_e, isDark) => callback && callback(isDark);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  }
});
