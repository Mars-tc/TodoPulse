/**
 * composables/useSettings.js
 * 设置单例：从主进程加载 / 保存 settings（统一持久化到 config.json）
 */
import { ref } from 'vue'

// 默认设置（与 main 进程 DEFAULT_SETTINGS 保持一致，用于「恢复默认」）
export const DEFAULT_SETTINGS = {
  theme: 'system',
  density: 'comfortable',
  fontScale: 'normal',
  reminder: {
    enabled: true,
    defaultLead: null, // null=不提醒，0=截止时提醒
    dndEnabled: false,
    dndStart: '22:00',
    dndEnd: '08:00',
    scanInterval: 60,
    sound: false
  },
  startup: {
    autoLaunch: false,
    closeAction: 'tray'
  },
  widget: {
    enabled: false,
    x: null,
    y: null,
    width: 320,
    height: 420,
    opacity: 100,
    showCompleted: false
  }
}

export const settings = ref(null)
export const appInfo = ref(null)
export const dataPaths = ref(null)

export async function loadSettings() {
  settings.value = await window.electronAPI.getSettings()
  return settings.value
}

// 深合并保存（主进程负责持久化与热更新）
export async function updateSettings(patch) {
  const next = await window.electronAPI.saveSettings(patch)
  settings.value = next
  return next
}

export async function resetSettings() {
  const next = await window.electronAPI.saveSettings(DEFAULT_SETTINGS)
  settings.value = next
  return next
}

export async function loadAppInfo() {
  appInfo.value = await window.electronAPI.getAppInfo()
  return appInfo.value
}

export async function loadDataPaths() {
  dataPaths.value = await window.electronAPI.getDataPaths()
  return dataPaths.value
}
