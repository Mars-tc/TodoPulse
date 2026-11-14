/**
 * useKeyboardShortcuts.js
 * 全局快捷键监听 composable，暴露状态供 App.vue 统一管理
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

// 当前活跃状态
export const searchOpen = ref(false)
export const quickAddOpen = ref(false)
export const editModalOpen = ref(false)
export const templatePickerOpen = ref(false)

// 快捷键配置（可后续从 settings 读取）
const DEFAULT_BINDINGS = {
  search: 'Ctrl+K',
  quickAdd: 'Ctrl+Shift+A',
  templatePicker: 'Ctrl+Shift+T',
  newTodo: 'N',
  toggleFirstSelected: 'Space',
  deleteSelected: 'Delete'
}

let _bindings = { ...DEFAULT_BINDINGS }

/**
 * 设置快捷键绑定（供设置页修改后热更新）
 */
export function setBindings(bindings) {
  _bindings = { ..._bindings, ...bindings }
}

/**
 * 解析按键组合字符串，返回 { ctrl, shift, key }
 */
function parseKey(binding) {
  const parts = binding.split('+').map(s => s.trim().toLowerCase())
  return {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    meta: parts.includes('meta') || parts.includes('cmd'),
    key: parts.find(p => !['ctrl', 'shift', 'meta', 'cmd'].includes(p))
  }
}

function isMatch(e, binding) {
  const p = parseKey(binding)
  return e.key.toLowerCase() === p.key &&
    e.ctrlKey === p.ctrl &&
    e.shiftKey === p.shift &&
    e.metaKey === p.meta
}

/**
 * 主入口：注册全局快捷键监听
 * @param {Object} handlers - 回调函数集合
 * @param {Function} handlers.onSearchOpen - 打开搜索面板
 * @param {Function} handlers.onSearchClose - 关闭搜索面板
 * @param {Function} handlers.onQuickAddOpen - 打开快速添加栏
 * @param {Function} handlers.onQuickAddClose - 关闭快速添加栏
 * @param {Function} handlers.onNewTodo - 新建待办
 * @param {Function} handlers.onToggleFirstSelected - 切换首个选中项
 * @param {Function} handlers.onDeleteSelected - 删除选中
 */
export function registerKeyboardShortcuts(handlers = {}) {
  const {
    onSearchOpen, onSearchClose,
    onQuickAddOpen, onQuickAddClose,
    onTemplatePickerOpen, onTemplatePickerClose,
    onNewTodo, onToggleFirstSelected, onDeleteSelected
  } = handlers

  function handleKeyDown(e) {
    // Esc：关闭面板
    if (e.key === 'Escape') {
      if (searchOpen.value) {
        e.preventDefault()
        searchOpen.value = false
        onSearchClose?.()
      } else if (quickAddOpen.value) {
        e.preventDefault()
        quickAddOpen.value = false
        onQuickAddClose?.()
      } else if (templatePickerOpen.value) {
        e.preventDefault()
        templatePickerOpen.value = false
        onTemplatePickerClose?.()
      }
      return
    }

    // 面板打开时拦截部分快捷键
    if (searchOpen.value || quickAddOpen.value || templatePickerOpen.value) return

    // Ctrl+K / Cmd+K：全局搜索
    if (isMatch(e, _bindings.search)) {
      e.preventDefault()
      searchOpen.value = true
      onSearchOpen?.()
      return
    }

    // Ctrl+Shift+A / Cmd+Shift+A：快速添加
    if (isMatch(e, _bindings.quickAdd)) {
      e.preventDefault()
      quickAddOpen.value = true
      onQuickAddOpen?.()
      return
    }

    // Ctrl+Shift+T / Cmd+Shift+T：模板快速选择面板
    if (isMatch(e, _bindings.templatePicker)) {
      e.preventDefault()
      templatePickerOpen.value = true
      onTemplatePickerOpen?.()
      return
    }

    // N：新建待办（仅非输入态）
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const tag = document.activeElement?.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        onNewTodo?.()
      }
    }

    // Space：切换首个选中待办
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const tag = document.activeElement?.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        onToggleFirstSelected?.()
      }
    }

    // Delete：删除选中
    if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const tag = document.activeElement?.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        onDeleteSelected?.()
      }
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}
