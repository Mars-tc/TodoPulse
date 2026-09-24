/**
 * autostart.js
 * 开机自启管理
 * - Linux (UOS)：写入 ~/.config/autostart/TodoPulse.desktop
 * - Windows / macOS：使用 Electron 官方 app.setLoginItemSettings
 * 全程 try/catch，失败不影响主程序启动（仅返回错误信息）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const DESKTOP_NAME = 'TodoPulse.desktop';

function getAutostartDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'autostart');
}

function getDesktopPath() {
  return path.join(getAutostartDir(), DESKTOP_NAME);
}

function writeDesktopFile() {
  const execPath = process.execPath;
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=TodoPulse',
    'Comment=TodoPulse 桌面待办',
    `Exec="${execPath}"`,
    'Terminal=false',
    'NoDisplay=false',
    'X-GNOME-Autostart-enabled=true',
    'Hidden=false'
  ].join('\n');

  fs.mkdirSync(getAutostartDir(), { recursive: true });
  fs.writeFileSync(getDesktopPath(), content, 'utf-8');
}

function removeDesktopFile() {
  if (fs.existsSync(getDesktopPath())) fs.unlinkSync(getDesktopPath());
}

/**
 * 设置开机自启
 * @param {boolean} enabled
 */
function setAutoLaunch(enabled) {
  try {
    if (process.platform === 'linux') {
      if (enabled) writeDesktopFile();
      else removeDesktopFile();
      return { success: true };
    }
    // win / mac：官方 API
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 是否已开启开机自启
 */
function isAutoLaunchEnabled() {
  try {
    if (process.platform === 'linux') {
      return fs.existsSync(getDesktopPath());
    }
    return !!app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

module.exports = { setAutoLaunch, isAutoLaunchEnabled };
