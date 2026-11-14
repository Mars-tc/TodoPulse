/**
 * composables/usePlanning.js
 * 智能规划状态单例：四象限分桶 / 今日排期 / 逾期清单
 *
 * 算法不在此层实现：象限分桶与排期全部由主进程 quadrant_planner.js 计算，
 * 渲染层只负责取结果与展示（遵循项目「共享算法单一来源」约定）。
 */
import { ref } from 'vue'

export const quadrants = ref({ Q1: [], Q2: [], Q3: [], Q4: [], unclassified: [] })
export const todayPlan = ref({ items: [], overflow: [], usedMinutes: 0, capacityMinutes: 0 })
export const overdueList = ref([])
export const planningSettings = ref(null)
export const planLoading = ref(false)

/**
 * 象限元信息（与主进程 quadrant_planner.QUADRANTS 保持一致）
 */
export const QUADRANT_META = [
  { key: 'Q1', name: '重要且紧急', desc: '优先处理，勿再拖延', color: '#dc2626' },
  { key: 'Q2', name: '重要不紧急', desc: '重点投入，适合提前安排', color: '#3b82f6' },
  { key: 'Q3', name: '不重要但紧急', desc: '快速处理或转交他人', color: '#f97316' },
  { key: 'Q4', name: '不重要不紧急', desc: '有空再看，可以延后', color: '#8b5cf6' }
]

/**
 * 精力档位元信息
 */
export const ENERGY_META = {
  high: { label: '高', full: '高精力', color: '#dc2626' },
  medium: { label: '中', full: '中等精力', color: '#eab308' },
  low: { label: '低', full: '低精力', color: '#16a34a' }
}

/**
 * 加载规划预览（四象限 + 今日排期 + 逾期清单）
 */
export async function loadPlan() {
  planLoading.value = true
  try {
    const res = await window.electronAPI.planPreview()
    quadrants.value = res && res.quadrants ? res.quadrants : { Q1: [], Q2: [], Q3: [], Q4: [], unclassified: [] }
    todayPlan.value =
      res && res.plan ? res.plan : { items: [], overflow: [], usedMinutes: 0, capacityMinutes: 0 }
    overdueList.value = res && Array.isArray(res.overdue) ? res.overdue : []
    planningSettings.value = (res && res.settings) || null
    return res
  } finally {
    planLoading.value = false
  }
}

/**
 * 一键顺延逾期事项
 * @param {string} [strategy] - today | next_workday | mark_only
 */
export async function deferOverdue(strategy) {
  const res = await window.electronAPI.deferOverdue(strategy ? { strategy } : {})
  if (res && res.success) await loadPlan()
  return res
}

/**
 * 采纳象限自动建议（仅对尚未归类的待办生效）
 * @param {string[]} ids
 */
export async function applySuggestedQuadrant(ids) {
  const res = await window.electronAPI.applySuggestedQuadrant(ids)
  if (res && res.success && res.changed > 0) await loadPlan()
  return res
}

/**
 * 容量占用百分比（0-100+，超 100 表示超载）
 */
export function capacityPercent(plan) {
  const p = plan || todayPlan.value
  const capacity = Number(p.capacityMinutes) || 0
  if (!capacity) return 0
  return Math.round((Number(p.usedMinutes) || 0) / capacity * 100)
}
