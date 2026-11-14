/**
 * composables/useScripts.js
 * 网页匹配脚本单例：从主进程加载 / 保存脚本，并提供新建、复制、删除、校验 helper
 * 脚本整体持久化在 config.json 顶层 scripts 数组，由扩展通过本地服务拉取
 */
import { ref } from 'vue'

// 可提取字段（顺序即编辑器展示顺序）
export const SCRIPT_FIELDS = [
  { key: 'title', label: '标题', placeholder: '如 h1、.issue-title' },
  { key: 'description', label: '描述', placeholder: '如 .description、#content' },
  { key: 'deadline', label: '截止时间', placeholder: '如 .due-date' },
  { key: 'priority', label: '优先级', placeholder: '如 .priority（高/中/低）' }
]

// 取值方式
export const SCRIPT_ATTRS = [
  { value: 'text', label: '文本内容' },
  { value: 'html', label: 'HTML' },
  { value: 'href', label: '链接地址' },
  { value: 'src', label: '图片地址' },
  { value: 'value', label: '表单值' },
  { value: 'attr', label: '自定义属性' }
]

// 高级匹配维度元数据（供编辑器渲染分组与提示）
export const SCRIPT_MATCH_FIELDS = [
  { key: 'title', label: '页面标题', placeholder: '如 工单、Issue（子串或 /正则/）' },
  { key: 'path', label: 'URL 路径', placeholder: '如 /issues/*、/pull/*' },
  { key: 'domain', label: '域名关键词', placeholder: '如 github.com、jira.xxx.com' },
  { key: 'selection', label: '选中文字', placeholder: '如 PROJ-\\d+、https?://（子串或 /正则/）' }
]

export const scripts = ref([])

/** 空白脚本模板 */
export function createScript(patch = {}) {
  return {
    id: '',
    name: '未命名脚本',
    enabled: true,
    mode: 'selector',
    action: 'fill',
    patterns: [],
    match: {},
    fields: {},
    code: '',
    builtin: false,
    updatedAt: '',
    ...patch
  }
}

export async function loadScripts() {
  scripts.value = (await window.electronAPI.getScripts()) || []
  return scripts.value
}

/** 整体覆盖保存（主进程负责归一化后落盘） */
export async function saveAllScripts(list) {
  scripts.value = await window.electronAPI.saveScripts(list)
  return scripts.value
}

/** 新增或更新单条脚本 */
export async function upsertScript(script) {
  const list = scripts.value.slice()
  const idx = list.findIndex((s) => s.id && s.id === script.id)
  if (idx >= 0) list[idx] = script
  else list.push(script)
  return saveAllScripts(list)
}

/** 复制一条脚本（新 id，名称加「副本」） */
export async function duplicateScript(id) {
  const src = scripts.value.find((s) => s.id === id)
  if (!src) return
  const copy = {
    ...JSON.parse(JSON.stringify(src)),
    id: '',
    name: src.name + ' 副本',
    enabled: false,
    builtin: false
  }
  return upsertScript(copy)
}

export async function removeScript(id) {
  return saveAllScripts(scripts.value.filter((s) => s.id !== id))
}

export async function toggleScript(id, enabled) {
  const target = scripts.value.find((s) => s.id === id)
  if (!target) return
  return upsertScript({ ...target, enabled })
}

/** 语法校验：委托主进程（JS 模式尝试构造函数但不执行） */
export async function validateScript(payload) {
  return window.electronAPI.validateScript(payload)
}

/** 获取代码示例 */
export async function getScriptTemplate() {
  return window.electronAPI.getScriptTemplate()
}
