<template>
  <div class="planning-view">
    <header class="planning-head">
      <button class="back-btn" @click="$emit('back')">← 返回列表</button>
      <div class="head-titles">
        <h2>🧭 智能规划</h2>
        <span class="head-sub">{{ summary }}</span>
      </div>
      <div class="spacer"></div>
      <button class="btn ghost sm" :disabled="planLoading" @click="reload">↻ 刷新规划</button>
    </header>

    <div class="planning-body">
      <div class="planning-main">
        <QuadrantView @refresh="reload" />
      </div>
      <PlanPanel @refresh="reload" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import QuadrantView from './QuadrantView.vue'
import PlanPanel from './PlanPanel.vue'
import {
  quadrants,
  todayPlan,
  overdueList,
  planLoading,
  loadPlan
} from '../composables/usePlanning'

const emit = defineEmits(['back'])

let disposer = null

const summary = computed(() => {
  const total =
    (quadrants.value.Q1 || []).length +
    (quadrants.value.Q2 || []).length +
    (quadrants.value.Q3 || []).length +
    (quadrants.value.Q4 || []).length +
    (quadrants.value.unclassified || []).length
  const planned = (todayPlan.value.items || []).length
  const overdue = overdueList.value.length
  return `共 ${total} 条待办 · 已排 ${planned} 项 · 逾期 ${overdue} 项`
})

async function reload() {
  await loadPlan()
}

onMounted(async () => {
  await loadPlan()
  if (window.electronAPI.onTodosChanged) {
    disposer = window.electronAPI.onTodosChanged(() => loadPlan())
  }
})

onBeforeUnmount(() => {
  if (disposer) disposer()
})
</script>

<style scoped>
.planning-view { display: flex; flex-direction: column; height: 100%; overflow: hidden }
.planning-head { display: flex; align-items: center; gap: 14px; flex-shrink: 0 }
.back-btn { padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 9px; background: var(--bg-secondary); color: var(--text-secondary); font-size: calc(12.5px * var(--font-scale)); cursor: pointer; transition: all 0.18s ease }
.back-btn:hover { border-color: var(--accent-color); color: var(--accent-color); transform: translateX(-2px) }
.head-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0 }
.head-titles h2 { margin: 0; font-size: calc(17px * var(--font-scale)); color: var(--text-primary) }
.head-sub { font-size: calc(11.5px * var(--font-scale)); color: var(--text-muted) }
.spacer { flex: 1 }
.planning-body { flex: 1; display: flex; gap: 14px; overflow: hidden; padding-top: 14px; min-height: 0 }
.planning-main { flex: 1; min-width: 0; overflow-y: auto }
@media (max-width: 1100px) { .planning-body { flex-direction: column; overflow-y: auto } .planning-main { overflow: visible } }
</style>
