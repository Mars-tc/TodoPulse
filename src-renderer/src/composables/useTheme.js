/**
 * composables/useTheme.js
 * 主题 / 密度 / 字号 管理，统一作用于 document.documentElement：
 *   - data-theme   light | dark（'system' 时由主进程推送 shouldUseDarkColors 决定）
 *   - data-density comfortable | compact
 *   - --font-scale 全局字号缩放（normal=1 / large=1.12 / xlarge=1.24）
 * 旧版仅存 localStorage 的 'todopulse-theme' 会在 App 初始化时一次性迁移到 settings
 */
import { ref, watch } from 'vue'

const STORAGE_KEY = 'todopulse-theme'

// 三态主题：light / dark / system
const theme = ref('system')
const density = ref('comfortable')
const fontScale = ref('normal')

// 系统模式下，主进程 nativeTheme 推送的真实明暗
const actualDark = ref(false)

let initialized = false

export function useTheme() {
  if (!initialized) {
    initialized = true

    // 读取旧版 localStorage 主题，供 App 在加载 settings 后一次性迁移
    try {
      const legacy = localStorage.getItem(STORAGE_KEY)
      if (legacy === 'dark' || legacy === 'light') {
        window.__todopulseLegacyTheme = legacy
      }
    } catch {
      /* ignore */
    }

    document.documentElement.setAttribute('data-theme', actualDark.value ? 'dark' : 'light')
    watch([theme, density, fontScale], apply, { deep: true })
    apply()
  }

  // 主进程推送系统真实明暗
  function setActualDark(v) {
    actualDark.value = !!v
    document.documentElement.setAttribute('data-theme', actualDark.value ? 'dark' : 'light')
  }

  function apply() {
    document.documentElement.setAttribute('data-theme', actualDark.value ? 'dark' : 'light')
    document.documentElement.setAttribute('data-density', density.value || 'comfortable')
    const scale = fontScale.value === 'large' ? 1.12 : fontScale.value === 'xlarge' ? 1.24 : 1
    document.documentElement.style.setProperty('--font-scale', scale)
  }

  // 设置页：整体生效（会触发 watch → apply）
  function applyAppearance(opts) {
    if (opts.theme !== undefined) theme.value = opts.theme
    if (opts.density !== undefined) density.value = opts.density
    if (opts.fontScale !== undefined) fontScale.value = opts.fontScale
  }

  // App 初始化：从 settings 同步（含 system 模式下的初始猜测）
  function initFromSettings(s) {
    theme.value = s.theme || 'system'
    density.value = s.density || 'comfortable'
    fontScale.value = s.fontScale || 'normal'
    if (s.theme === 'system') {
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      setActualDark(!!isDark)
    } else {
      setActualDark(s.theme === 'dark')
    }
  }

  return {
    theme,
    density,
    fontScale,
    actualDark,
    setActualDark,
    apply,
    applyAppearance,
    initFromSettings
  }
}
