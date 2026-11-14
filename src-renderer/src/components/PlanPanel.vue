<template>
  <aside class="plan-panel">
    <header class="panel-head">
      <div class="head-titles">
        <span class="panel-title">今日排期</span>
        <span class="panel-sub">{{ todayText }}</span>
      </div>
      <span class="panel-count">{{ plan.items.length }} 项</span>
    </header>

    <!-- 容量条 -->
    <div class="capacity">
      <div class="capacity-row">
        <span>已排 {{ usedMinutes }} / {{ plan.capacityMinutes }} 分钟</span>
        <span class="capacity-pct" :class="{ over: isOver }">{{ percent }}%</span>
      </div>
      <div class="capacity-track">
        <div class="capacity-fill" :class="{ over: isOver }" :style="{ width: barWidth }"></div>
      </div>
    </div>

    <!-- 排期清单 -->
    <div v-if="plan.items.length" class="plan-list">
      <div v-for="item in plan.items" :key="item.todo.id" class="plan-item">
        <span class="plan-order">{{ item.order }}</span>
        <div class="plan-main">
          <span class="plan-title">{{ item.todo.title }}</span>
          <div class="plan-meta">
            <span v-if="item.slot" class="slot-tag">{{ item.slot }}</span>
            <span v-if="item.todo.quadrant" class="quad-tag">{{ item.todo.quadrant }}</span>
            <span class="energy-tag" :class="item.todo.energy_level || 'medium'">
              {{ ENERGY_META[item.todo.energy_level || 'medium'].label }}精力
            </span>
            <span class="est-tag">{{ item.estimateMinutes }} 分钟</span>
          </div>
          <span class="plan-reason">{{ item.reason }}</span>
        </div>
      </div>
    </div>

    <div v-else class="plan-empty">
      <p class="empty-title">今天还没有排入事项</p>
      <p class="empty-desc">在左侧四象限中拖拽待办，或调整设置里的每日容量</p>
    </div>

    <!-- 溢出提示 -->
    <div v-if="plan.overflow.length" class="overflow-tip">
      <span>⚠️ 今日已排满，{{ plan.overflow.length }} 项顺延到下一批</span>
    </div>

    <!-- 逾期区块 -->
    <div class="overdue-block">
      <div class="overdue-head">
        <span class="overdue-title">逾期未完成（{{ overdueList.length }}）</span>
        <button v-if="overdueList.length" class="mini-btn danger" @click="defer">一键顺延</button>
      </div>

      <div v-if="overdueList.length" class="strategy-row">
        <label class="strategy-label">顺延策略</label>
        <select class="field-input strategy-select" v-model="strategy">
          <option value="today">顺延到今天</option>
          <option value="next_workday">顺延到下一个工作日</option>
          <option value="mark_only">仅标记不改动</option>
        </select>
      </div>

      <div v-if="overdueList.length" class="overdue-list">
        <div v-for="t in overdueList.slice(0, 8)" :key="t.id" class="overdue-item">
          <span class="overdue-title-text">{{ t.title }}</span>
          <span class="overdue-days">逾期 {{ t.overdueDays }} 天</span>
        </div>
        <div v-if="overdueList.length > 8" class="overdue-more">还有 {{ overdueList.length - 8 }} 项…</div>
      </div>
      <div v-else class="overdue-none">没有逾期事项，保持住 🎉</div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { todayPlan, overdueList, deferOverdue, ENERGY_META } from '../composables/usePlanning'
import { pushToast } from '../composables/useToast'

const emit = defineEmits(['refresh'])

const strategy = ref('today')

const plan = computed(() => todayPlan.value)
const usedMinutes = computed(() => Number(plan.value.usedMinutes) || 0)
const percent = computed(() => {
  const cap = Number(plan.value.capacityMinutes) || 0
  if (!cap) return 0
  return Math.round((usedMinutes.value / cap) * 100)
})
const isOver = computed(() => percent.value > 100)
const barWidth = computed(() => `${Math.min(100, percent.value)}%`)

const todayText = computed(() => {
  const d = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
})

async function defer() {
  const res = await deferOverdue(strategy.value)
  if (!res || !res.success) {
    pushToast({ message: (res && res.error) || '顺延失败', type: 'error' })
    return
  }
  pushToast({ message: `已顺延 ${res.changed} 条逾期待办`, type: 'success' })
  emit('refresh')
}
</script>

<style scoped>
.plan-panel { display: flex; flex-direction: column; gap: 12px; width: 300px; flex-shrink: 0; padding: 13px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px; overflow-y: auto }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px }
.head-titles { display: flex; flex-direction: column; gap: 2px }
.panel-title { font-size: calc(14px * var(--font-scale)); font-weight: 700; color: var(--text-primary) }
.panel-sub { font-size: calc(11px * var(--font-scale)); color: var(--text-muted) }
.panel-count { font-size: calc(11.5px * var(--font-scale)); font-weight: 700; color: var(--text-secondary); background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; padding: 1px 9px }
.capacity { display: flex; flex-direction: column; gap: 5px }
.capacity-row { display: flex; align-items: center; justify-content: space-between; font-size: calc(11.5px * var(--font-scale)); color: var(--text-secondary) }
.capacity-pct { font-weight: 700; color: var(--accent-color) }
.capacity-pct.over { color: #dc2626 }
.capacity-track { height: 7px; border-radius: 4px; background: var(--bg-hover); overflow: hidden }
.capacity-fill { height: 100%; border-radius: 4px; background: linear-gradient(135deg, #3b82f6, #2563eb); transition: width 0.24s ease }
.capacity-fill.over { background: linear-gradient(135deg, #ef4444, #dc2626) }
.plan-list { display: flex; flex-direction: column; gap: 7px }
.plan-item { display: flex; gap: 9px; padding: 9px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; transition: all 0.16s ease }
.plan-item:hover { border-color: var(--accent-color); transform: translateY(-1px) }
.plan-order { width: 19px; height: 19px; flex-shrink: 0; border-radius: 50%; background: var(--accent-soft); color: var(--accent-hover); font-size: calc(10.5px * var(--font-scale)); font-weight: 700; display: flex; align-items: center; justify-content: center }
.plan-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px }
.plan-title { font-size: calc(12.5px * var(--font-scale)); color: var(--text-primary); font-weight: 600; word-break: break-word }
.plan-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap }
.slot-tag, .quad-tag, .energy-tag, .est-tag { font-size: calc(10px * var(--font-scale)); border-radius: 5px; padding: 1px 6px; line-height: 15px; white-space: nowrap }
.slot-tag { background: rgba(139, 92, 246, 0.14); color: #7c3aed }
.quad-tag { background: var(--accent-soft); color: var(--accent-hover); font-weight: 700 }
.energy-tag.high { background: rgba(220, 38, 38, 0.14); color: #dc2626 }
.energy-tag.medium { background: rgba(234, 179, 8, 0.16); color: #b45309 }
.energy-tag.low { background: rgba(22, 163, 74, 0.14); color: #15803d }
.est-tag { background: var(--bg-hover); color: var(--text-muted) }
.plan-reason { font-size: calc(10.5px * var(--font-scale)); color: var(--text-muted); line-height: 1.5 }
.plan-empty { padding: 22px 14px; text-align: center; border: 1px dashed var(--border-color); border-radius: 10px }
.empty-title { margin: 0; font-size: calc(13px * var(--font-scale)); font-weight: 600; color: var(--text-primary) }
.empty-desc { margin: 5px 0 0; font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }
.overflow-tip { padding: 8px 11px; border-radius: 9px; background: rgba(249, 115, 22, 0.12); color: #c2410c; font-size: calc(11.5px * var(--font-scale)); font-weight: 600 }
.overdue-block { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border-color) }
.overdue-head { display: flex; align-items: center; justify-content: space-between; gap: 8px }
.overdue-title { font-size: calc(12.5px * var(--font-scale)); font-weight: 700; color: var(--text-primary) }
.strategy-row { display: flex; align-items: center; gap: 8px }
.strategy-label { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); white-space: nowrap }
.strategy-select { flex: 1; padding: 5px 8px; font-size: calc(11.5px * var(--font-scale)) }
.overdue-list { display: flex; flex-direction: column; gap: 5px }
.overdue-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 9px; background: var(--bg-primary); border-left: 3px solid #dc2626; border-radius: 8px; font-size: calc(11.5px * var(--font-scale)) }
.overdue-title-text { color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.overdue-days { color: #dc2626; font-weight: 600; flex-shrink: 0 }
.overdue-more { font-size: calc(11px * var(--font-scale)); color: var(--text-muted); padding-left: 4px }
.overdue-none { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }
.mini-btn { border: none; background: transparent; cursor: pointer; font-size: calc(11.5px * var(--font-scale)); padding: 3px 7px; border-radius: 6px; color: var(--text-secondary); transition: all 0.15s ease }
.mini-btn:hover { background: var(--bg-primary); color: var(--accent-color) }
.mini-btn.danger:hover { background: rgba(220, 38, 38, 0.12); color: #dc2626 }
@media (max-width: 1100px) { .plan-panel { width: 100% } }
</style>
