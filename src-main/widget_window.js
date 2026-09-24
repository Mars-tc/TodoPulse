/**
 * widget_window.js - 到期悬浮窗生命周期
 *
 * 独立于主窗口的无边框置顶小窗，主窗口最小化到托盘时仍可见。
 * 关闭语义：用户点 × → 隐藏 + 落盘 enabled=false（下次启动不自动弹出）。
 * 退出语义：应用退出时显式销毁，避免 window-all-closed 判定异常。
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getSettings, saveSettings } = require('./config_store');

let widgetWindow = null;
let moveTimer = null;
let resizeTimer = null;
let onCloseCallback = null;

const isDev = process.env.NODE_ENV === 'development';

/**
 * 计算窗口边界：若记录坐标越界（如拔掉外接屏）则回落到屏幕右下角
 */
function resolveBounds(w) {
  const cfg = w || {};
  let { x, y, width, height } = cfg;
  width = Math.max(width || 320, 260);
  height = Math.max(height || 420, 200);

  // 用与窗口区域交集最大的显示器作为参考
  const probe = { x: x || 0, y: y || 0, width, height };
  let display;
  try {
    display = screen.getDisplayMatching(probe);
    if (!display || !display.workArea) throw new Error('no display');
  } catch (e) {
    display = screen.getPrimaryDisplay();
  }
  const area = display.workArea || display.bounds;

  // 坐标越界（明显不在任何显示器可视区）时回落到该显示器右下角
  const outOfBounds =
    x === null || y === null ||
    x < area.x - 50 || y < area.y - 50 ||
    x > area.x + area.width || y > area.y + area.height;

  if (outOfBounds) {
    x = area.x + area.width - width;
    y = area.y + area.height - height;
  }

  return { x, y, width, height };
}

/**
 * 创建悬浮窗（若已存在则直接显示）
 */
function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    showWidgetWindow();
    return widgetWindow;
  }

  const w = (getSettings().widget) || {};
  const bounds = resolveBounds(w);

  widgetWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 260,
    minHeight: 200,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    maximizable: false,
    fullscreenable: false,
    title: 'TodoPulse 到期事项',
    icon: path.join(__dirname, '../src-renderer/assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    widgetWindow.loadURL('http://localhost:5173/widget.html');
  } else {
    widgetWindow.loadFile(path.join(__dirname, '../src-renderer/dist/widget.html'));
  }

  widgetWindow.once('ready-to-show', () => {
    widgetWindow.show();
  });

  // 位置记忆：移动停止 400ms 后写盘，避免高频落盘
  widgetWindow.on('move', () => {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(persistBounds, 400);
  });
  widgetWindow.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(persistBounds, 400);
  });

  // 用户点 ×：隐藏 + 落盘 enabled=false，下次启动不自动弹出
  widgetWindow.on('close', (e) => {
    e.preventDefault();
    widgetWindow.hide();
    saveSettings({ widget: { ...getSettings().widget, enabled: false } });
    console.log('[widget_window] 用户关闭悬浮窗，已记为不自动显示');
    if (typeof onCloseCallback === 'function') {
      try { onCloseCallback(); } catch (err) { console.error('[widget_window] 关闭回调失败:', err.message); }
    }
  });

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });

  console.log('[widget_window] 悬浮窗已创建', bounds);
  return widgetWindow;
}

/** 防抖落盘当前窗口位置与尺寸 */
function persistBounds() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const [width, height] = widgetWindow.getSize();
  const [x, y] = widgetWindow.getPosition();
  const cur = getSettings().widget || {};
  saveSettings({ widget: { ...cur, x, y, width, height } });
}

function showWidgetWindow() {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidgetWindow();
    return;
  }
  widgetWindow.show();
  widgetWindow.focus();
}

function hideWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
}

function toggleWidgetWindow() {
  if (isWidgetVisible()) hideWidgetWindow();
  else showWidgetWindow();
}

function isWidgetVisible() {
  return !!(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
}

/** 应用退出时调用：显式销毁，避免触发意外退出判定 */
function closeWidgetWindow() {
  if (moveTimer) clearTimeout(moveTimer);
  if (resizeTimer) clearTimeout(resizeTimer);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    // 移除 close 的 preventDefault 语义：直接销毁
    widgetWindow.removeAllListeners('close');
    widgetWindow.destroy();
  }
  widgetWindow = null;
}

function getWidgetWindow() {
  return widgetWindow;
}

/** 通知悬浮窗重新读取设置（不透明度 / 主题等），供设置变更后实时生效 */
function notifySettingsChanged() {
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.webContents) {
    widgetWindow.webContents.send('widget-settings-changed');
  }
}

/** main.js 注册：用户点 × 关闭后刷新托盘菜单勾选状态 */
function setOnCloseCallback(fn) {
  onCloseCallback = fn;
}

module.exports = {
  createWidgetWindow,
  showWidgetWindow,
  hideWidgetWindow,
  toggleWidgetWindow,
  isWidgetVisible,
  closeWidgetWindow,
  getWidgetWindow,
  setOnCloseCallback,
  notifySettingsChanged
};
