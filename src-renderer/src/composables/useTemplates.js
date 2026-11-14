/**
 * composables/useTemplates.js
 * 任务模板状态单例：从主进程加载 / 保存 / 复制 / 删除模板
 * 范式对齐 useCategories.js（模块级共享 ref + loaded 标记，避免重复加载）
 */
import { ref } from 'vue'

export const templates = ref([])
export const templatesLoaded = ref(false)
export const templatesLoading = ref(false)

/**
 * 加载模板列表
 * @param {boolean} force - true 时强制重新拉取
 */
export async function loadTemplates(force = false) {
  if (templatesLoading.value) return templates.value
  if (templatesLoaded.value && !force) return templates.value
  templatesLoading.value = true
  try {
    const list = await window.electronAPI.listTemplates()
    templates.value = Array.isArray(list) ? list : []
    templatesLoaded.value = true
    return templates.value
  } finally {
    templatesLoading.value = false
  }
}

/**
 * 保存模板（有 id 则更新，无 id 则新建）
 * 主进程可能返回 { error } 表示拒绝（如内置模板只读）
 */
export async function saveTemplate(payload) {
  const saved = await window.electronAPI.saveTemplate(payload)
  if (saved && saved.error) return saved
  await loadTemplates(true)
  return saved
}

/**
 * 删除模板（内置模板由主进程拒绝）
 */
export async function deleteTemplate(id) {
  const res = await window.electronAPI.deleteTemplate(id)
  if (res && res.success) await loadTemplates(true)
  return res
}

/**
 * 复制模板为自定义模板
 */
export async function duplicateTemplate(id) {
  const created = await window.electronAPI.duplicateTemplate(id)
  await loadTemplates(true)
  return created
}

/**
 * 从模板一键生成待办
 * @returns {{ success: boolean, created: Array, warnings: Array, error?: string }}
 */
export async function applyTemplate(id, options = {}) {
  return window.electronAPI.applyTemplate(id, options)
}

/**
 * 预览模板展开结果（不落库）
 */
export async function previewTemplate(id) {
  return window.electronAPI.previewTemplate(id)
}

export function getTemplateById(id) {
  return templates.value.find((t) => t.id === id) || null
}

/**
 * 已启用的模板（供快速选择面板使用）
 */
export function enabledTemplates() {
  return templates.value.filter((t) => t.enabled)
}
